// SPDX-License-Identifier: MIT OR Apache-2.0
/** Independent Mermaid 12.2 ER database + SVG probe for the four catalog entity cases. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import mermaidPackage from 'mermaid/package.json';
import {exportVisual} from '../src/interchange';

const cases=[
 {id:'visual-catalog-canary-entities',path:'fixtures/catalog/canary-entities.json',sha256:'6b101dd70cab0fbb10a87b195515d76d06f62828afe02d1f368afe417ecfbd6e',losses:{MERMAID_IDENTIFICATION:1,MERMAID_NULLABLE:1}},
 {id:'visual-inventory-beacon-schema-tickets',path:'fixtures/visual/inventory/beacon-schema-tickets.json',sha256:'3ea8d7e5c8941457901cecb9a6755bc02fd5119c0a9e6fb92bf9e21d4881054e',losses:{INTERCHANGE_UNREPRESENTED_FIELD:15,MERMAID_FIELD_REFERENCE:9,MERMAID_IDENTIFICATION:9,MERMAID_NODE_FIELDS:10}},
 {id:'visual-inventory-beacon-schema-workspace',path:'fixtures/visual/inventory/beacon-schema-workspace.json',sha256:'74cc43f6171ed212876b6fab8fc9ee1429dbd4bca2e7c79394d46e9800bb3dad',losses:{INTERCHANGE_UNREPRESENTED_FIELD:12,MERMAID_FIELD_REFERENCE:6,MERMAID_IDENTIFICATION:6,MERMAID_NODE_FIELDS:7}},
 {id:'visual-inventory-tpl-sd-domain',path:'fixtures/visual/inventory/tpl-sd-domain.json',sha256:'b054796bb6031693eb3df54ff03cc7b27fb2ad8fa4ba90bd66f7f36573bd6471',losses:{INTERCHANGE_UNREPRESENTED_FIELD:5,MERMAID_IDENTIFICATION:6}},
] as const;
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const keyNames={pk:'PK',fk:'FK',uk:'UK'} as const;
const nativeCardinality={
 'zero-or-one':'zero_or_one', 'exactly-one':'only_one', 'zero-or-many':'zero_or_more', 'one-or-many':'one_or_more',
} as const;
const svgMarker={zero_or_one:'zeroOrOne',only_one:'onlyOne',zero_or_more:'zeroOrMore',one_or_more:'oneOrMore'} as const;
const lossCounts=(diagnostics:{code:string;loss:boolean}[])=>Object.fromEntries([...new Set(diagnostics.filter(item=>item.loss).map(item=>item.code))].sort().map(code=>[code,diagnostics.filter(item=>item.loss&&item.code===code).length]));

assert.equal(mermaidPackage.version,'12.2.0','Probe requires pinned Mermaid 12.2.0');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();await page.setContent('<!doctype html><html><meta charset="utf-8"><body></body></html>');
 await page.addScriptTag({path:resolve('node_modules/mermaid/dist/mermaid.min.js')});
 const proofs=[];
 for(const entry of cases){
  const bytes=await readFile(entry.path);assert.equal(hash(bytes),entry.sha256,`${entry.id}: fixture hash changed`);
  const document=JSON.parse(bytes.toString('utf8'));
  const result=exportVisual(document,{format:'mermaid',mode:'allow-reported-loss'});
  assert(result.text,`${entry.id}: Mermaid did not emit a source document: ${JSON.stringify(result.diagnostics)}`);
  const visual=document.extensions['umf.visual'];
  const native=await page.evaluate(async({source,id})=>{
   const api=(window as any).mermaid;
   api.initialize({startOnLoad:false,securityLevel:'strict',theme:'neutral',look:'classic',fontFamily:'Arial',deterministicIds:true,deterministicIDSeed:id});
   const diagram=await api.mermaidAPI.getDiagramFromText(source),data=diagram.db.getData();
   const rendered=await api.render('er-probe-'+id,source),xml=new DOMParser().parseFromString(rendered.svg,'image/svg+xml'),svg=xml.documentElement;
   const paths=[...svg.querySelectorAll('path.relationshipLine')].map((path:any)=>({start:path.getAttribute('marker-start'),end:path.getAttribute('marker-end')}));
   return{source,entities:data.nodes.map((node:any)=>({id:node.id,label:node.label,attributes:node.attributes.map((field:any)=>({name:field.name,type:field.type,keys:field.keys}))})),edges:data.edges.map((edge:any)=>({start:edge.start,end:edge.end,label:edge.label,arrowTypeStart:edge.arrowTypeStart,arrowTypeEnd:edge.arrowTypeEnd})),relationships:diagram.db.getRelationships().map((relationship:any)=>({entityA:relationship.entityA,entityB:relationship.entityB,roleA:relationship.roleA,relSpec:relationship.relSpec})),paths,text:svg.textContent||'',svg:rendered.svg,viewBox:svg.getAttribute('viewBox')};
  },{source:result.text,id:entry.id});
  const sourceNodes=visual.nodes??[],entities=visual.structure.entities??[],references=visual.structure.references??[];
  assert.equal(native.entities.length,entities.length,`${entry.id}: Mermaid entity count differs`);
  const fieldProofs=[];
  for(const [index,entity] of entities.entries()){
   const node=sourceNodes.find((candidate:any)=>candidate.id===entity.node);assert(node,`${entry.id}: Visual entity has no backing node`);
   const parsed=native.entities[index];assert.equal(parsed.label.replace(/ﬂ°°(\d+)¶ß/g,(_match:string,code:string)=>String.fromCharCode(Number(code))),node.label,`${entry.id}: native entity label changed`);
   const expected=entity.fields.map((field:any)=>({name:field.name,type:field.type??'',keys:(field.keys??[]).map((key:string)=>keyNames[key as keyof typeof keyNames])}));
   assert.deepEqual(parsed.attributes,expected,`${entry.id}: Mermaid DB field name/type/key attributes differ`);
   for(const field of expected){assert(native.text.includes(field.name),`${entry.id}: SVG omits field name ${field.name}`);if(field.type)assert(native.text.includes(field.type),`${entry.id}: SVG omits field type ${field.type}`);for(const key of field.keys)assert(native.text.includes(key),`${entry.id}: SVG omits field key ${key}`);}
   fieldProofs.push({entity:node.label,fields:expected});
  }
  assert.equal(native.edges.length,references.length,`${entry.id}: Mermaid edge count differs`);
  const relationProofs=[];
  for(const [index,reference] of references.entries()){
   const fromIndex=sourceNodes.findIndex((node:any)=>node.id===reference.from.node),toIndex=sourceNodes.findIndex((node:any)=>node.id===reference.to.node);
   assert(fromIndex>=0&&toIndex>=0,`${entry.id}: reference has missing Visual endpoint`);
   const edge=native.edges[index];assert.equal(edge.start,native.entities[fromIndex].id,`${entry.id}: source endpoint changed`);
   assert.equal(edge.end,native.entities[toIndex].id,`${entry.id}: target endpoint changed`);
   assert.equal(edge.arrowTypeStart,nativeCardinality[reference.fromCardinality as keyof typeof nativeCardinality],`${entry.id}: source cardinality marker differs`);
   assert.equal(edge.arrowTypeEnd,nativeCardinality[reference.toCardinality as keyof typeof nativeCardinality],`${entry.id}: target cardinality marker differs`);
   assert(native.paths[index]?.start?.endsWith(`er-${svgMarker[edge.arrowTypeStart as keyof typeof svgMarker]}Start)`),`${entry.id}: rendered SVG start marker does not encode source cardinality`);
   assert(native.paths[index]?.end?.endsWith(`er-${svgMarker[edge.arrowTypeEnd as keyof typeof svgMarker]}End)`),`${entry.id}: rendered SVG end marker does not encode target cardinality`);
   assert(native.text.includes(reference.label),`${entry.id}: SVG omits relationship label ${reference.label}`);
   // Mermaid supplies the native IDENTIFYING marker for every relationship. Visual 1.0 has no
   // corresponding field, so the adapter reports this as a loss; do not infer it from the marker.
   assert.equal(native.relationships[index]?.relSpec?.relType,'IDENTIFYING',`${entry.id}: Mermaid ER parser did not report its native relationship type`);
   assert.equal(Object.hasOwn(reference,'identifying'),false,`${entry.id}: fixture unexpectedly acquired an identifying field`);
   const hasFieldPort=Object.hasOwn(reference.from,'field')||Object.hasOwn(reference.to,'field');
   if(hasFieldPort)assert(result.diagnostics.some(item=>item.code==='MERMAID_FIELD_REFERENCE'&&item.path.includes(`/references/${index}`)),`${entry.id}: field-specific endpoints lack a loss diagnostic`);
   relationProofs.push({id:reference.id,label:reference.label,from:reference.from,to:reference.to,fromCardinality:reference.fromCardinality,toCardinality:reference.toCardinality,mermaidRelationshipType:native.relationships[index]?.relSpec?.relType,mermaidHasFieldPorts:false});
  }
  const losses=lossCounts(result.diagnostics);
  assert.deepEqual(losses,entry.losses,`${entry.id}: raw Mermaid loss baseline changed`);
  const svgPath=`.cache/mermaid-er-probe/${entry.id}.svg`;await mkdir('.cache/mermaid-er-probe',{recursive:true});await writeFile(svgPath,native.svg);
  proofs.push({id:entry.id,path:entry.path,sourceSha256:entry.sha256,emittedSourceSha256:hash(result.text),emittedSource:result.text,losses,fieldCount:fieldProofs.reduce((sum,item)=>sum+item.fields.length,0),fields:fieldProofs,relationships:relationProofs,svgSha256:hash(native.svg),svgPath,viewBox:native.viewBox});
 }
 const negative=await page.evaluate(async()=>{
  const api=(window as any).mermaid;
  api.initialize({startOnLoad:false,securityLevel:'strict',theme:'neutral',deterministicIds:true,deterministicIDSeed:'literal-star-type'});
  const source='erDiagram\n  RECORD {\n    string? *name\n  }\n';
  const diagram=await api.mermaidAPI.getDiagramFromText(source),data=diagram.db.getData(),rendered=await api.render('er-probe-literal-star-type',source),svg=new DOMParser().parseFromString(rendered.svg,'image/svg+xml').documentElement;
  return{source,attributes:data.nodes[0].attributes.map((field:any)=>({name:field.name,type:field.type,keys:field.keys})),text:svg.textContent||'',svg:rendered.svg};
 });
 assert.deepEqual(negative.attributes,[{name:'*name',type:'string?',keys:[]}],'Mermaid native parser must keep leading star literal and nullable suffix literal, not infer PK/nullable metadata');
 assert(negative.text.includes('*name')&&negative.text.includes('string?'),'Mermaid SVG must display literal *name and string?');
 const negativeSvgPath='.cache/mermaid-er-probe/literal-star-type.svg';await writeFile(negativeSvgPath,negative.svg);
 const report={schemaVersion:1,evidenceType:'independent-native-browser-er-probe',engine:'Mermaid',nativeVersion:mermaidPackage.version,browserVersion:browser.version(),scope:'Four pinned entity fixtures. This probe confirms Mermaid DB/SVG preservation of serialized fields and cardinality markers; it does not infer identifying semantics or Visual field-port semantics from Mermaid presentation.',cases:proofs,negativeControl:{source:negative.source,parsedAttributes:negative.attributes,svgSha256:hash(negative.svg),svgPath:negativeSvgPath,assertions:{leadingStarIsLiteral:true,nullableTypeSuffixIsLiteral:true,starDoesNotBecomeKey:true}}};
 await writeFile('.cache/mermaid-er-probe/receipt.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
