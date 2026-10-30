// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {serializeDotEntities,parseDotEntities} from '../../src/interchange/dot/entities';
import {readDotProfile} from '../../src/interchange/dot/profile-syntax';
import type {Visual} from '../../src/extensions/visual';

const paths=['fixtures/visual/inventory/beacon-schema-tickets.json','fixtures/visual/inventory/beacon-schema-workspace.json','fixtures/visual/inventory/tpl-sd-domain.json','fixtures/catalog/canary-entities.json'];
const root='/extensions/umf.visual';
const visualOf=(document:any)=>document.extensions['umf.visual'] as Visual;
const sourceOf=(visual:Visual,statements:string[])=>`digraph ${JSON.stringify(visual.id)} {\n ${statements.join('\n ')}\n}\n`;
async function native(source:string,format:'json'|'svg'='json'):Promise<any>{
 const process=Bun.spawn(['dot','-T'+format],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});process.stdin.write(source);process.stdin.end();const [stdout,stderr,exit]=await Promise.all([new Response(process.stdout).text(),new Response(process.stderr).text(),process.exited]);if(exit!==0)throw new Error(stderr||`Graphviz exited ${exit}`);return format==='json'?JSON.parse(stdout):stdout;
}
const hex=(value:string)=>Array.from(new TextEncoder().encode(value),byte=>byte.toString(16).padStart(2,'0')).join('');
const nodeNative=(id:string)=>'umf_entity_node_'+hex(id),refNative=(id:string)=>'umf_entity_ref_'+hex(id),fieldPort=(name:string)=>'umf_field_'+hex(name);
const expected=(visual:Visual)=>({nodes:visual.nodes?.map(({id,label,detail})=>({id,label,...(detail===undefined?{}:{detail})})),structure:{entities:visual.structure?.entities,references:visual.structure?.references??[]}});

describe('qualified DOT entities profile',()=>{
 // @covers US-095-AC2: each original 1.0 entity example preserves cards, field constraints, endpoint ports and references in a bounded native AST.
 test.each(paths)('round trips original entity meaning for %s',async path=>{
  const document=JSON.parse(await readFile(path,'utf8')),visual=visualOf(document),projection=serializeDotEntities(visual),source=sourceOf(visual,projection.statements);
  expect(projection.diagnostics.filter(row=>row.severity==='error')).toEqual([]);
  const parsed=parseDotEntities(readDotProfile(source,{entities:true}));expect(parsed.diagnostics).toEqual([]);expect(parsed.visual).toEqual(expected(visual));
  expect(parsed.identityMap.filter(row=>row.kind==='field')).toHaveLength(visual.structure!.entities!.reduce((total,entity)=>total+entity.fields.length,0));
 });

 // @covers US-095-AC3: native Graphviz JSON and SVG prove field cards, named ports, visible cardinalities, and actual crow-foot ends.
 test.each(paths)('Graphviz renders cards and relationships for %s',async path=>{
  const document=JSON.parse(await readFile(path,'utf8')),visual=visualOf(document),projection=serializeDotEntities(visual),source=sourceOf(visual,projection.statements),json=await native(source),svg=String(await native(source,'svg'));
  const objects=new Map((json.objects as any[]).map(object=>[object.name,object])),objectIds=new Map((json.objects as any[]).map(object=>[object._gvid,object.name]));
  for(const node of visual.nodes??[]){const object=objects.get(nodeNative(node.id)) as any;expect(object).toBeDefined();expect(object.umf_path).toContain('/nodes/');expect(object.umf_entity_path).toContain('/structure/entities/');if(path==='fixtures/catalog/canary-entities.json'&&node.id==='record'){const visible=object._ldraw_.filter((item:any)=>item.op==='T').map((item:any)=>String(item.text)).join(' ');expect(visible).toContain('quoted');expect(visible).toContain('東京');}else expect(object._ldraw_).toContainEqual(expect.objectContaining({text:JSON.stringify(node.label)}));if(node.detail!==undefined)expect(object._ldraw_).toContainEqual(expect.objectContaining({text:'Detail: '+JSON.stringify(node.detail)}));}
  const svgText=svg.replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&apos;',"'");
  for(const entity of visual.structure!.entities??[]){const node=visual.nodes!.find(item=>item.id===entity.node)!;expect(svgText).toContain(JSON.stringify(node.label));for(const field of entity.fields){expect(svgText).toContain(JSON.stringify(field.name));if(field.type!==undefined)expect(svgText).toContain(JSON.stringify(field.type));if(field.keys!==undefined)expect(svgText).toContain(JSON.stringify(field.keys));}}
  for(const reference of visual.structure!.references??[]){const from=nodeNative(reference.from.node),to=nodeNative(reference.to.node),edge=(json.edges as any[]).find(item=>objectIds.get(item.tail)===from&&objectIds.get(item.head)===to&&item.id===refNative(reference.id));expect(edge).toBeDefined();if(reference.from.field!==undefined)expect(edge.tailport).toContain(fieldPort(reference.from.field));if(reference.to.field!==undefined)expect(edge.headport).toContain(fieldPort(reference.to.field));if(reference.fromCardinality!==undefined){expect(edge.taillabel).toBe(reference.fromCardinality);expect(edge.arrowtail).toBe(({ 'exactly-one':'tee','zero-or-one':'odottee','zero-or-many':'odotcrow','one-or-many':'teecrow'} as any)[reference.fromCardinality]);expect(edge._tdraw_?.length).toBeGreaterThan(0);expect(edge._tldraw_).toContainEqual(expect.objectContaining({text:reference.fromCardinality}));}if(reference.toCardinality!==undefined){expect(edge.headlabel).toBe(reference.toCardinality);expect(edge.arrowhead).toBe(({ 'exactly-one':'tee','zero-or-one':'odottee','zero-or-many':'odotcrow','one-or-many':'teecrow'} as any)[reference.toCardinality]);expect(edge._hdraw_?.length).toBeGreaterThan(0);expect(edge._hldraw_).toContainEqual(expect.objectContaining({text:reference.toCardinality}));}if(reference.label!==undefined)expect(svgText).toContain(reference.label);}
  if(path==='fixtures/catalog/canary-entities.json'){
   const edge=(json.edges as any[])[0],textBounds=[...((edge._ldraw_??[]).filter((item:any)=>item.op==='T')), ...((edge._tldraw_??[]).filter((item:any)=>item.op==='T')), ...((edge._hldraw_??[]).filter((item:any)=>item.op==='T'))].map((item:any)=>({text:item.text,x:Number(item.pt[0]),y:Number(item.pt[1]),halfWidth:Number(item.width)/2,halfHeight:7}));
   for(let i=0;i<textBounds.length;i++)for(let j=i+1;j<textBounds.length;j++){const a=textBounds[i]!,b=textBounds[j]!,overlapX=Math.min(a.x+a.halfWidth,b.x+b.halfWidth)-Math.max(a.x-a.halfWidth,b.x-b.halfWidth),overlapY=Math.min(a.y+a.halfHeight,b.y+b.halfHeight)-Math.max(a.y-a.halfHeight,b.y-b.halfHeight);expect(overlapX>1&&overlapY>1).toBe(false);}
   for(const node of visual.nodes??[]){const object=objects.get(nodeNative(node.id)) as any,[x,y]=String(object.pos).split(',').map(Number),halfWidth=Number(object.width)*72/2,halfHeight=Number(object.height)*72/2;for(const label of textBounds){const overlapX=Math.min(x!+halfWidth,label.x+label.halfWidth)-Math.max(x!-halfWidth,label.x-label.halfWidth),overlapY=Math.min(y!+halfHeight,label.y+label.halfHeight)-Math.max(y!-halfHeight,label.y-label.halfHeight);expect(overlapX>1&&overlapY>1).toBe(false);}}
  }
  expect(svgText).toContain(JSON.stringify(visual.nodes![0]!.label));expect(svgText).not.toContain('UMF entity/1');
 });

 // @covers US-095-AC2: edited native text can round trip, while changed arrow semantics, unknown table markup, and 1.1 constraints refuse.
 test('round trips visible edits and refuses unqualified native or 1.1 content',async()=>{
  const document=JSON.parse(await readFile(paths[0]!, 'utf8')),visual=visualOf(document),source=sourceOf(visual,serializeDotEntities(visual).statements),graph=readDotProfile(source,{entities:true});
  const firstNode=graph.statements.find((item):item is Extract<typeof item,{kind:'node'}>=>item.kind==='node')!;firstNode.attributes.find(item=>item.name==='label')!.value=firstNode.attributes.find(item=>item.name==='label')!.value.replace('&quot;customers&quot;','&quot;clients&quot;');
  expect(parseDotEntities(graph).visual?.nodes?.some(node=>node.label==='clients')).toBe(true);
  const altered=readDotProfile(source,{entities:true}),edge=altered.statements.find(item=>item.kind==='edge')!;edge.attributes.find(item=>item.name==='arrowtail')!.value='normal';expect(parseDotEntities(altered).visual).toBeUndefined();
  const foreign=readDotProfile(source.replace('<B>&quot;customers&quot;</B>','<B><IMG SRC="https://example.invalid/x"/></B>'),{entities:true});expect(parseDotEntities(foreign).visual).toBeUndefined();
  const updated=structuredClone(visual) as any;updated.structure.entities[0].fields[0].fieldId='stable-id';expect(serializeDotEntities(updated).statements).toEqual([]);expect(serializeDotEntities(updated).diagnostics.some(item=>item.code==='DOT_ENTITIES_FIELD_V11')).toBe(true);
 });

 // @covers US-095-AC2, US-095-AC3: escaped Unicode and quoted field/reference text use native cells, ports, and all qualified cardinality arrowheads.
 test('renders and reads Unicode cards, quoted fields and every cardinality symbol',async()=>{
  const visual:Visual={id:'unicode-entities',kind:'structure',form:'entities',question:'Q',nodes:[{id:'source “A”',label:'People & “places”\nArchive',detail:'Owner’s\tview'} ,{id:'target',label:'Ticket <row>'}],structure:{entities:[{node:'source “A”',fields:[{name:'clé\nold',type:'text <safe>\nline',keys:['pk','uk'],nullable:false}]},{node:'target',fields:[{name:'ticket"id',type:'uuid',keys:['fk'],nullable:true}]}],references:[{id:'ref “one”',from:{node:'source “A”',field:'clé\nold'},to:{node:'target',field:'ticket"id'},label:'owns “ticket” & data',fromCardinality:'exactly-one',toCardinality:'zero-or-many'},{id:'ref two',from:{node:'target'},to:{node:'source “A”'},fromCardinality:'zero-or-one',toCardinality:'one-or-many'}]}};
  const statements=serializeDotEntities(visual);expect(statements.diagnostics.filter(row=>row.severity==='error')).toEqual([]);const source=sourceOf(visual,statements.statements),parsed=parseDotEntities(readDotProfile(source,{entities:true}));expect(parsed.diagnostics).toEqual([]);expect(parsed.visual).toEqual(expected(visual));
  const json=await native(source),svg=String(await native(source,'svg')).replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&apos;',"'");expect(svg).toContain('\"People & “places”\\nArchive\"');expect(svg).toContain('\"clé\\nold\"');expect(svg).toContain('\"text <safe>\\nline\"');expect(svg).toContain('owns “ticket” & data');
  const edges=json.edges as any[];expect(edges).toHaveLength(2);expect(edges.map(edge=>edge.arrowtail).sort()).toEqual(['odottee','tee']);expect(edges.map(edge=>edge.arrowhead).sort()).toEqual(['odotcrow','teecrow']);for(const edge of edges){expect(edge._hdraw_?.length).toBeGreaterThan(0);expect(edge._tdraw_?.length).toBeGreaterThan(0);}
 });

 test('preserves an absent optional references array distinctly from an empty array',()=>{
  const sourceVisual:Visual={id:'no-reference-array',kind:'structure',form:'entities',question:'Q',nodes:[{id:'one',label:'One'}],structure:{entities:[{node:'one',fields:[]}]}};
  const projection=serializeDotEntities(sourceVisual),graph=readDotProfile(sourceOf(sourceVisual,projection.statements),{entities:true}),parsed=parseDotEntities(graph);
  expect(parsed.diagnostics).toEqual([]);expect(parsed.visual).toEqual({nodes:[{id:'one',label:'One'}],structure:{entities:[{node:'one',fields:[]}]}});
  const explicitEmpty=projection.statements.map(line=>line.replace('umf_references_present="false"','umf_references_present="true"'));
  expect(parseDotEntities(readDotProfile(sourceOf(sourceVisual,explicitEmpty),{entities:true})).visual).toEqual({nodes:[{id:'one',label:'One'}],structure:{entities:[{node:'one',fields:[]}],references:[]}});
 });

 test('preserves entity-array order independently of node order and qualifies repeated field names by card',()=>{
  const visual:Visual={id:'reordered-entities',kind:'structure',form:'entities',question:'Q',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],structure:{entities:[{node:'b',fields:[{name:'id',type:'text'}]},{node:'a',fields:[{name:'id',type:'uuid'}]}],references:[]}};
  const projection=serializeDotEntities(visual),parsed=parseDotEntities(readDotProfile(sourceOf(visual,projection.statements),{entities:true}));
  expect(parsed.diagnostics).toEqual([]);expect(parsed.visual).toEqual(expected(visual));
  const ids=parsed.identityMap.filter(row=>row.kind==='field').map(row=>row.nativeId);expect(new Set(ids).size).toBe(2);expect(ids).toContain(nodeNative('a')+':'+fieldPort('id'));expect(ids).toContain(nodeNative('b')+':'+fieldPort('id'));
 });
});
