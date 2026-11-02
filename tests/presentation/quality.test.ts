// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,describe,expect,it} from 'bun:test';
import {chromium,type Browser} from 'playwright';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';

let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});

const doc=(v:Visual)=>createVisualDocument(v,'quality:'+v.id,'1.1.0');
async function dot(plan:PresentationPlan,format:'svg'|'json'){
 const child=Bun.spawn(['dot','-T'+format],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 child.stdin.write(plan.source);child.stdin.end();
 const [out,err,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 expect(exit).toBe(0);expect(err).toBe('');return out;
}
async function check(d:ReturnType<typeof doc>,backend:'graphviz'|'mermaid'='graphviz'){
 const result=compilePresentation(d,{backend,theme:'presentation/1'});expect(result.ok).toBe(true);if(!result.ok)throw Error(JSON.stringify(result));
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  let svg:string,ast:unknown;
  if(backend==='graphviz'){const [svgText,json]=await Promise.all([dot(result,'svg'),dot(result,'json')]);svg=svgText;ast=JSON.parse(json);}
  else{
   await page.setContent('<!doctype html><meta charset="utf-8"><div id="out"></div>');
   await page.addScriptTag({path:resolve(import.meta.dir,'../../node_modules/mermaid/dist/mermaid.min.js')});
   svg=await page.evaluate(async source=>{const m=(window as any).mermaid;m.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',deterministicIds:true,deterministicIDSeed:'quality-test'});return(await m.render('quality-test',source)).svg;},result.source);
  }
  return{plan:result,svg,checks:await verifyPresentationQuality(page,{svg,document:d,plan:result,nativeAst:ast}),page};
 }catch(e){await page.close();throw e;}
}
const result=(checks:Awaited<ReturnType<typeof verifyPresentationQuality>>,name:string)=>checks.find(x=>x.check===name)?.result;

describe('presentation native quality verifier',()=>{
 it('checks headless associations and rejects an invented native arrowhead',async()=>{
  const d=createVisualDocument({id:'headless-quality',kind:'flow',form:'network',question:'Which records are associated?',nodes:[{id:'a',label:'Record A'},{id:'b',label:'Record B'}],edges:[{id:'association',from:'a',to:'b',label:'associated',directed:false}]},undefined,'1.3.0');
  for(const backend of ['graphviz','mermaid'] as const){
   const good=await check(d,backend),name=backend==='graphviz'?'graphviz-edge-endpoints-and-paths':'mermaid-flow-paths';
   try{
    expect(result(good.checks,name)).toBe('pass');
    const mutated=await good.page.locator('#frame svg').evaluate((svg,backend)=>{
     if(backend==='graphviz'){
      const edge=svg.querySelector('g.edge');if(!edge)throw Error('Missing native association');
      const arrow=document.createElementNS('http://www.w3.org/2000/svg','polygon');arrow.setAttribute('points','0,0 10,0 5,10');edge.appendChild(arrow);
     }else{
      const edge=svg.querySelector('path[data-edge="true"]'),marker=[...svg.querySelectorAll('marker')].find(item=>item.id.includes('pointEnd'));
      if(!edge||!marker)throw Error('Missing native Mermaid path/arrow definition');edge.setAttribute('marker-end',`url(#${marker.id})`);
     }
     return svg.outerHTML;
    },backend);
    const nativeAst=backend==='graphviz'?JSON.parse(await dot(good.plan,'json')):undefined;
    expect(result(await verifyPresentationQuality(good.page,{svg:mutated,document:d,plan:good.plan,nativeAst}),name)).toBe('fail');
   }finally{await good.page.close();}
  }
 });
 it('binds graph labels and endpoints to their own native carriers and drawn geometry',async()=>{
  const d=doc({id:'flow-quality',kind:'flow',form:'network',question:'How do records move?',title:'Record path',nodes:[{id:'api',label:'Client API'},{id:'store',label:'Record store'}],edges:[{id:'request',from:'api',to:'store',label:'Submit record'}]});
  const good=await check(d);try{
   expect(result(good.checks,'native-source-hash')).toBe('pass');
   expect(good.checks[0]?.sourceSha256).toBe(createHash('sha256').update(new TextEncoder().encode(good.plan.source)).digest('hex'));
   expect(result(good.checks,'graphviz-native-carriers')).toBe('pass');
   expect(result(good.checks,'graphviz-edge-endpoints-and-paths')).toBe('pass');
   expect(result(good.checks,'presentation-clipping')).toBe('pass');
   expect(result(good.checks,'presentation-font-legibility')).toBe('pass');
   expect(result(good.checks,'presentation-text-overlap')).toBe('pass');
  }finally{await good.page.close();}
 });

 it('rejects altered native endpoints, detached paths, and labels moved outside the node carrier',async()=>{
  const d=doc({id:'flow-negative',kind:'flow',form:'network',question:'Where does it go?',nodes:[{id:'from',label:'Source API'},{id:'to',label:'Destination store'}],edges:[{id:'send',from:'from',to:'to',label:'Send'}]});
  const good=await check(d);try{
   const ast=JSON.parse(await dot(good.plan,'json')) as {objects:{name:string;_gvid:number}[];edges:{tail:number;head:number;id?:string}[]};
   const changed={...ast,edges:ast.edges.map(e=>({...e,head:ast.objects.find(o=>o.name==='n1')!._gvid}))};
   const endpoint=await verifyPresentationQuality(good.page,{svg:good.svg,document:d,plan:good.plan,nativeAst:changed});
   expect(result(endpoint,'graphviz-edge-endpoints-and-paths')).toBe('fail');
   const edgeStart=good.svg.indexOf('class="edge"'),pathStart=good.svg.indexOf('<path',edgeStart),dStart=good.svg.indexOf('d="',pathStart)+3,dEnd=good.svg.indexOf('"',dStart);
   expect(edgeStart).toBeGreaterThanOrEqual(0);expect(pathStart).toBeGreaterThan(edgeStart);expect(dEnd).toBeGreaterThan(dStart);
   const mutated=good.svg.slice(0,dStart)+'M 10000,10000 L 10100,10100'+good.svg.slice(dEnd);
   const shifted=await verifyPresentationQuality(good.page,{svg:mutated,document:d,plan:good.plan,nativeAst:ast});
   expect(result(shifted,'graphviz-edge-endpoints-and-paths')).toBe('fail');
   // Keeping the string elsewhere cannot replace its element-local label carrier.
   const original='Source API';const moved=good.svg.replace(original,'Changed label').replace('</svg>',`<text>${original}</text></svg>`);
   const relocated=await verifyPresentationQuality(good.page,{svg:moved,document:d,plan:good.plan,nativeAst:ast});
   expect(result(relocated,'graphviz-native-carriers')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('checks entity fields in their owning native table rows and exact AST ports',async()=>{
  const d=doc({id:'entity-quality',kind:'structure',form:'entities',question:'What is stored?',nodes:[{id:'record',label:'Record'},{id:'owner',label:'Owner'}],structure:{entities:[{node:'record',fields:[{id:'record-id',name:'id',type:'RecordId',keys:['pk'],nullable:false},{id:'workspace-id',name:'workspace_id',type:'RecordId',keys:['fk'],nullable:false}]},{node:'owner',fields:[{id:'owner-key',name:'id',type:'OwnerId',keys:['pk']}]}],references:[{id:'owned',from:{node:'record',fieldId:'workspace-id'},to:{node:'owner',fieldId:'owner-key'},label:'belongs to',fromCardinality:'exactly-one',toCardinality:'zero-or-many'}]}});
  const good=await check(d);try{
   expect(result(good.checks,'graphviz-entity-field-rows')).toBe('pass');
   expect(result(good.checks,'graphviz-edge-endpoints-and-paths')).toBe('pass');
   const ast=JSON.parse(await dot(good.plan,'json')) as {objects:{name:string;label?:string}[];edges:unknown[]};
   const tampered={...ast,objects:ast.objects.map(o=>o.name==='n1'?{...o,label:String(o.label).replace('RecordId','OtherType')}:o)};
   const wrong=await verifyPresentationQuality(good.page,{svg:good.svg,document:d,plan:good.plan,nativeAst:tampered});
   expect(result(wrong,'graphviz-entity-field-rows')).toBe('fail');
   const movedType=good.svg.replace('id: RecordId','gone: RecordId').replace('</svg>','<text>id: RecordId</text></svg>');
   const wrongRow=await verifyPresentationQuality(good.page,{svg:movedType,document:d,plan:good.plan,nativeAst:ast});
   expect(result(wrongRow,'graphviz-entity-field-rows')).toBe('fail');
   const missingRepeatedMarker=good.svg.replace('FK · NOT NULL','FK');
   const markerCheck=await verifyPresentationQuality(good.page,{svg:missingRepeatedMarker,document:d,plan:good.plan,nativeAst:ast});
   expect(result(markerCheck,'graphviz-entity-field-rows')).toBe('fail');
   const missingRange=good.svg.replace('1 → 0..*','');
   expect(missingRange).not.toBe(good.svg);
   const noRange=await verifyPresentationQuality(good.page,{svg:missingRange,document:d,plan:good.plan,nativeAst:ast});
   expect(result(noRange,'graphviz-edge-endpoints-and-paths')).toBe('fail');
   const shiftedToAdjacentRow=await good.page.locator('#frame svg').evaluate(svg=>{
    const edge=[...svg.querySelectorAll('g.edge')].find(g=>g.querySelector(':scope > title')?.textContent==='n1:n1_f2->n2:n2_f1');
    const path=edge?.querySelector(':scope > path') as SVGPathElement|undefined;
    const node=[...svg.querySelectorAll('g.node')].find(g=>g.querySelector(':scope > title')?.textContent==='n1');
    const source=node&&[...node.querySelectorAll('text')].find(t=>t.textContent?.includes('workspace_id: RecordId'));
    const adjacent=node&&[...node.querySelectorAll('text')].find(t=>t.textContent?.includes('id: RecordId'));
    if(!path||!source||!adjacent)return undefined;
    const before=path.getAttribute('d')??'',match=/^M\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/.exec(before),matrix=path.getScreenCTM();if(!match||!matrix)return undefined;
    const point=new DOMPoint(Number(match[1]),Number(match[2])).matrixTransform(matrix);
    const sourceBox=source.getBoundingClientRect(),adjacentBox=adjacent.getBoundingClientRect();
    const delta=(adjacentBox.y+adjacentBox.height/2)-(sourceBox.y+sourceBox.height/2);
    const shifted=new DOMPoint(point.x,point.y+delta).matrixTransform(matrix.inverse());
    const after=before.replace(/^M\s*-?[\d.]+[,\s]+-?[\d.]+/,`M${shifted.x},${shifted.y}`);
    return {before,after};
   });
   expect(shiftedToAdjacentRow).toBeDefined();
   const wrongPortRow=good.svg.replace(shiftedToAdjacentRow!.before,shiftedToAdjacentRow!.after);
   expect(wrongPortRow).not.toBe(good.svg);
   expect(result(await verifyPresentationQuality(good.page,{svg:wrongPortRow,document:d,plan:good.plan,nativeAst:ast}),'graphviz-edge-endpoints-and-paths')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('checks native cluster containment and ordered stack geometry',async()=>{
  const d=doc({id:'stack-quality',kind:'structure',form:'stack',question:'What is the order?',nodes:[{id:'api',label:'API',layer:'top'},{id:'engine',label:'Engine',layer:'middle'},{id:'schema',label:'Schema',layer:'bottom'}],structure:{layers:[{id:'top',label:'Top layer'},{id:'middle',label:'Middle layer'},{id:'bottom',label:'Bottom layer'}]}});
  const good=await check(d);try{
   expect(result(good.checks,'graphviz-containment-and-order')).toBe('pass');
   expect(result(good.checks,'presentation-clipping')).toBe('pass');
   expect(result(good.checks,'presentation-font-legibility')).toBe('pass');
   const reversed=good.svg.replace('<title>cluster_l1</title>','<title>cluster_swap</title>').replace('<title>cluster_l2</title>','<title>cluster_l1</title>').replace('<title>cluster_swap</title>','<title>cluster_l2</title>');
   const wrongOrder=await verifyPresentationQuality(good.page,{svg:reversed,document:d,plan:good.plan,nativeAst:JSON.parse(await dot(good.plan,'json'))});
   expect(result(wrongOrder,'graphviz-containment-and-order')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('checks nested group containment from native cluster bounds',async()=>{
  const d=doc({id:'group-quality',kind:'flow',form:'network',question:'Which zone owns the component?',groups:[{id:'platform',label:'Platform',role:'zone'},{id:'storage',label:'Storage boundary',role:'boundary',parent:'platform'}],nodes:[{id:'catalog',label:'Catalog',group:'storage'},{id:'api',label:'API',group:'platform'}],edges:[{id:'query',from:'api',to:'catalog',label:'Query'}]});
  const good=await check(d);try{expect(result(good.checks,'graphviz-containment-and-order')).toBe('pass');}finally{await good.page.close();}
  const mermaid=await check(d,'mermaid');try{expect(result(mermaid.checks,'mermaid-containment-and-order')).toBe('pass');}finally{await mermaid.page.close();}
 });

 it('binds 1.2 named Graphviz ports to owned rows, exact native selectors and drawn row sides',async()=>{
  const d=JSON.parse(await Bun.file('fixtures/showcase/definitions/umf-logical-interface-architecture.json').text()) as ReturnType<typeof doc>;
  const good=await check(d);
  try{
   expect(result(good.checks,'graphviz-node-port-rows')).toBe('pass');
   expect(result(good.checks,'graphviz-edge-endpoints-and-paths')).toBe('pass');
   const ast=JSON.parse(await dot(good.plan,'json'));
   ast.edges.find((edge:any)=>edge.id==='e2').tailport='p1:w';
   expect(result(await verifyPresentationQuality(good.page,{svg:good.svg,document:d,plan:good.plan,nativeAst:ast}),'graphviz-edge-endpoints-and-paths')).toBe('fail');
   const detachedArrow=good.svg.replace(/(<g id="e1" class="edge">[\s\S]*?<polygon[^>]*points=")([^"]+)(")/u,(_match:string,prefix:string,points:string,suffix:string)=>prefix+points.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/gu,(_pair:string,x:string,y:string)=>`${Number(x)+100},${Number(y)+100}`)+suffix);
   expect(detachedArrow).not.toBe(good.svg);
   expect(result(await verifyPresentationQuality(good.page,{svg:detachedArrow,document:d,plan:good.plan,nativeAst:JSON.parse(await dot(good.plan,'json'))}),'graphviz-edge-endpoints-and-paths')).toBe('fail');
   const altered=good.svg.replace('resolve · resolve · south','other · other · south');
   expect(altered).not.toBe(good.svg);
   expect(result(await verifyPresentationQuality(good.page,{svg:altered,document:d,plan:good.plan,nativeAst:JSON.parse(await dot(good.plan,'json'))}),'graphviz-node-port-rows')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('checks Mermaid node ownership and exact directed paths for a flow',async()=>{
  const d=doc({id:'mermaid-flow',kind:'flow',form:'network',question:'Where does the request go?',nodes:[{id:'client',label:'Client API'},{id:'service',label:'Service'},{id:'store',label:'Record store'}],edges:[{id:'submit',from:'client',to:'service',label:'Submit'},{id:'persist',from:'service',to:'store',label:'Persist'}]});
  const good=await check(d,'mermaid');try{
   expect(result(good.checks,'mermaid-native-node-carriers')).toBe('pass');expect(result(good.checks,'mermaid-flow-paths')).toBe('pass');
   const edgeAt=good.svg.indexOf('data-id="L_n1_n2_0"'),pathAt=good.svg.lastIndexOf('<path',edgeAt),start=good.svg.indexOf('d="',pathAt)+3,end=good.svg.indexOf('"',start);
   const shifted=good.svg.slice(0,start)+'M 10000,10000 L 10100,10100'+good.svg.slice(end);
   expect(result(await verifyPresentationQuality(good.page,{svg:shifted,document:d,plan:good.plan}),'mermaid-flow-paths')).toBe('fail');
   const moved=good.svg.replace('Client API','Wrong').replace('</svg>','<text>Client API</text></svg>');
   expect(result(await verifyPresentationQuality(good.page,{svg:moved,document:d,plan:good.plan}),'mermaid-native-node-carriers')).toBe('fail');
   const swapped=good.svg.replaceAll('Client API','__TEMP__').replaceAll('Service','Client API').replaceAll('__TEMP__','Service');
   expect(result(await verifyPresentationQuality(good.page,{svg:swapped,document:d,plan:good.plan}),'mermaid-native-node-carriers')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('checks Mermaid ER field carriers and relationship paths without claiming field ports',async()=>{
  const d=doc({id:'mermaid-er',kind:'structure',form:'entities',question:'How are the records related?',nodes:[{id:'record',label:'Record'},{id:'owner',label:'Owner'}],structure:{entities:[{node:'record',fields:[{name:'id',type:'RecordIdentifier',keys:['pk']},{name:'ownerId',type:'OwnerIdentifier',keys:['fk']}]},{node:'owner',fields:[{name:'id',type:'OwnerIdentifier',keys:['pk']}]}]}});
  const good=await check(d,'mermaid');try{
   expect(result(good.checks,'mermaid-er-fields-and-relations')).toBe('pass');
   const moved=good.svg.replace('RecordIdentifier','WrongIdentifier').replace('</svg>','<text>RecordIdentifier</text></svg>');
   const wrong=await verifyPresentationQuality(good.page,{svg:moved,document:d,plan:good.plan});
   expect(result(wrong,'mermaid-er-fields-and-relations')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('checks Mermaid stack containment and authored layer order from cluster geometry',async()=>{
  const d=doc({id:'mermaid-stack-quality',kind:'structure',form:'stack',question:'What is the order?',nodes:[{id:'api',label:'API',layer:'top'},{id:'engine',label:'Engine',layer:'middle'},{id:'schema',label:'Schema',layer:'bottom'}],structure:{layers:[{id:'top',label:'Top layer'},{id:'middle',label:'Middle layer'},{id:'bottom',label:'Bottom layer'}]}});
  const good=await check(d,'mermaid');try{
   expect(result(good.checks,'mermaid-containment-and-order')).toBe('pass');
   const layers=good.plan.elementMap.filter(e=>e.kind==='layer');
   expect(layers).toHaveLength(3);
   const ids=[...good.svg.matchAll(/id="([^"]+)"/g)].map(m=>m[1]!);
   const firstId=ids.find(id=>id.endsWith(`-${layers[0]!.nativeId}`)),secondId=ids.find(id=>id.endsWith(`-${layers[1]!.nativeId}`));
   expect(firstId).toBeDefined();expect(secondId).toBeDefined();
   const swapped=good.svg.replaceAll(firstId!, '__LAYER_SWAP__').replaceAll(secondId!, firstId!).replaceAll('__LAYER_SWAP__', secondId!);
   expect(result(await verifyPresentationQuality(good.page,{svg:swapped,document:d,plan:good.plan}),'mermaid-containment-and-order')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('preserves visible line breaks when matching Mermaid labels to their exact node',async()=>{
  const d=doc({id:'mermaid-linebreak',kind:'flow',form:'network',question:'Where?',nodes:[{id:'target',label:'Explicit target\nprojection'},{id:'tooling',label:'Tooling'}],edges:[{id:'uses',from:'target',to:'tooling'}]});
  const good=await check(d,'mermaid');try{
   expect(result(good.checks,'mermaid-native-node-carriers')).toBe('pass');
   const stripped=good.svg.replace(/<br\s*\/?\s*>/gi,'');
   expect(stripped).not.toBe(good.svg);
   expect(result(await verifyPresentationQuality(good.page,{svg:stripped,document:d,plan:good.plan}),'mermaid-native-node-carriers')).toBe('fail');
  }finally{await good.page.close();}
 });
});
