// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,test} from 'bun:test';
import {readdir,readFile} from 'node:fs/promises';
import {serializeDotFlow,parseDotFlow} from '../../src/interchange/dot/flow';
import {readDotProfile,type DotProfileGraph} from '../../src/interchange/dot/profile-syntax';
import type {Visual} from '../../src/extensions/visual';

const flowPaths=await readdir('fixtures/visual/inventory').then(names=>names.map(name=>'fixtures/visual/inventory/'+name));
const paths=(await Promise.all(flowPaths.map(async path=>({path,document:JSON.parse(await readFile(path,'utf8'))})))).filter(({document})=>document.extensions?.['umf.visual']?.kind==='flow').map(item=>item.path).sort();
const root='/extensions/umf.visual';
const flowOf=(document:any)=>document.extensions['umf.visual'] as Visual;
const sourceOf=(visual:Visual,statements:string[])=>`digraph "${visual.id}" {\n ${statements.join('\n ')}\n}\n`;
const direct=(visual:Visual)=>({nodes:visual.nodes?.map(({id,label,detail,group})=>({id,label,...(detail===undefined?{}:{detail}),...(group===undefined?{}:{group})})),...(visual.edges===undefined?{}:{edges:visual.edges.map(({id,from,to,label,why,kind})=>({id,from,to,...(label===undefined?{}:{label}),...(why===undefined?{}:{why}),...(kind===undefined?{}:{kind})}))}),...(visual.groups===undefined?{}:{groups:visual.groups.map(({id,label,detail,role,tier,parent})=>({id,label,...(detail===undefined?{}:{detail}),role,...(tier===undefined?{}:{tier}),...(parent===undefined?{}:{parent})}))})});
async function runNative(source:string,format:'json'|'svg'='json'):Promise<any>{
 const process=Bun.spawn(['dot','-T'+format],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});process.stdin.write(source);process.stdin.end();
 const [stdout,stderr,exit]=await Promise.all([new Response(process.stdout).text(),new Response(process.stderr).text(),process.exited]);if(exit!==0)throw new Error(stderr||`Graphviz exited ${exit}`);return format==='json'?JSON.parse(stdout):stdout;
}
function visibleGroup(group:any):string{return ['Role: '+group.role,'Tier: '+(group.tier===undefined?'—':String(group.tier)),'Label: '+JSON.stringify(group.label),...(group.detail===undefined?[]:['Detail: '+JSON.stringify(group.detail)])].join('\n');}
function visibleEdge(edge:any):string{const rows:string[]=[];if(edge.kind!==undefined)rows.push('Kind: '+edge.kind);if(edge.label!==undefined)rows.push('Label: '+JSON.stringify(edge.label));if(edge.why!==undefined)rows.push('Why: '+JSON.stringify(edge.why));return rows.join('\n');}
function id(prefix:string,id:string):string{return prefix+Array.from(new TextEncoder().encode(id),byte=>byte.toString(16).padStart(2,'0')).join('');}

describe('qualified DOT flow profile',()=>{
 // @covers US-095-AC2: all original flow examples preserve node/edge/group structure through a bounded native DOT AST.
 test.each(paths)('round trips all flow meaning for %s',async path=>{
  const document=JSON.parse(await readFile(path,'utf8')),visual=flowOf(document),projection=serializeDotFlow(visual),source=sourceOf(visual,projection.statements);
  expect(projection.diagnostics.filter(item=>item.severity==='error')).toEqual([]);
  const parsed=parseDotFlow(readDotProfile(source),visual.form as any);
  expect(parsed.diagnostics).toEqual([]);expect(parsed.visual).toEqual(direct(visual));
  expect(parsed.identityMap.filter(item=>item.kind==='edge')).toHaveLength(visual.edges?.length??0);
  expect(parsed.identityMap.filter(item=>item.kind==='group')).toHaveLength(visual.groups?.length??0);
  for(const [index,node]of (visual.nodes??[]).entries()){
   expect(projection.coverage).toContainEqual(expect.objectContaining({path:`${root}/nodes/${index}/label`,aspect:'value',representation:'native-concept'}));
   expect(projection.coverage).toContainEqual(expect.objectContaining({path:`${root}/nodes/${index}/detail`,aspect:node.detail===undefined?'presence':'value'}));
  }
 });

 // @covers US-095-AC3: native Graphviz JSON and SVG confirm visible fields, real nested groups, edge direction, and required layout.
 test.each(paths)('Graphviz natively lays out and renders the profile for %s',async path=>{
  const document=JSON.parse(await readFile(path,'utf8')),visual=flowOf(document),projection=serializeDotFlow(visual),source=sourceOf(visual,projection.statements),native=await runNative(source),svg=await runNative(source,'svg') as string;
  const objects=new Map((native.objects as any[]).map(object=>[object.name,object]));
  const objectNames=new Map((native.objects as any[]).map(object=>[object._gvid,object.name]));
  const svgText=svg.replaceAll('&#45;','-').replaceAll('&#39;',"'").replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>');
  for(const node of visual.nodes??[]){
   const object=objects.get(id('umf_flow_node_',node.id)) as any;expect(object?.label).toBe(node.label.replaceAll('\n','\\n'));expect(object?.xlabel).toBe(node.detail);
   for(const line of node.label.split('\n'))if(line)expect(svgText).toContain(line);if(node.detail!==undefined)for(const line of node.detail.split('\n'))if(line)expect(svgText).toContain(line);
  }
  for(const group of visual.groups??[]){
   const object=objects.get(id('cluster_umf_flow_group_',group.id)) as any;expect(object).toBeDefined();expect(object?.label).toBe(visibleGroup(group).replaceAll('\n','\\n'));
   expect(object?.umf_role).toBe(group.role);if(group.tier!==undefined)expect(object?.umf_tier).toBe(String(group.tier));
   expect(svgText).toContain('Role: '+group.role);expect(svgText).toContain('Label: '+JSON.stringify(group.label));expect(svgText).not.toContain('UMF flow group/1');for(const line of group.label.split('\n'))if(line)expect(svgText).toContain(line);if(group.detail!==undefined)for(const line of group.detail.split('\n'))if(line)expect(svgText).toContain(line);
  }
  for(const edge of visual.edges??[]){
   const expectedLabel=visibleEdge(edge).replaceAll('\n','\\n'),found=(native.edges as any[]).find(item=>item.umf_id===edge.id&&objectNames.get(item.tail)===id('umf_flow_node_',edge.from)&&objectNames.get(item.head)===id('umf_flow_node_',edge.to)&&(item.label??'')===expectedLabel);
   expect(found).toBeDefined();expect(found.id).toBe(id('umf_flow_edge_',edge.id));if(expectedLabel)expect(svgText).not.toContain('UMF flow edge/1');if(edge.kind!==undefined)expect(svgText).toContain('Kind: '+edge.kind);if(edge.label!==undefined)for(const line of edge.label.split('\n'))if(line)expect(svgText).toContain(line);if(edge.why!==undefined)for(const line of edge.why.split('\n'))if(line)expect(svgText).toContain(line);
  }
  if(visual.form==='pipeline'){
   const x=(visual.nodes??[]).map(node=>Number(String((objects.get(id('umf_flow_node_',node.id)) as any)?.pos).split(',')[0]));
   for(let i=1;i<x.length;i++)expect(x[i]).toBeGreaterThan(x[i-1]!);
  }
  if(visual.form==='lanes'){
   const groupRows=(visual.groups??[]).map(group=>{const object=objects.get(id('cluster_umf_flow_group_',group.id)) as any;const [left,bottom,right,top]=String(object.bb).split(',').map(Number);return{group,left,bottom,right,top};});
   const siblings=new Map<string,typeof groupRows>();for(const row of groupRows){const key=row.group.parent??'';siblings.set(key,[...(siblings.get(key)??[]),row]);}
   for(const row of groupRows){const ys=(visual.nodes??[]).filter(node=>node.group===row.group.id).map(node=>Number(String((objects.get(id('umf_flow_node_',node.id)) as any).pos).split(',')[1]));expect(new Set(ys).size).toBe(1);}
   for(const rows of siblings.values())for(let i=1;i<rows.length;i++)expect(rows[i-1]!.bottom).toBeGreaterThan(rows[i]!.top);
  }
  if(visual.form==='zoned'){
   const rows=(visual.groups??[]).map(group=>{const object=objects.get(id('cluster_umf_flow_group_',group.id)) as any;expect(object).toBeDefined();const [left,,right]=String(object.bb).split(',').map(Number);return{tier:group.tier!,left,right,center:(left!+right!)/2};});
   const tiers=[...new Set(rows.map(row=>row.tier))].sort((a,b)=>a-b);for(const tier of tiers){const same=rows.filter(row=>row.tier===tier);for(const row of same)expect(Math.abs(row.center-same[0]!.center)).toBeLessThan(1);}
   for(let i=1;i<tiers.length;i++){const earlier=rows.filter(row=>row.tier===tiers[i-1]),later=rows.filter(row=>row.tier===tiers[i]);expect(Math.max(...earlier.map(row=>row.right))).toBeLessThan(Math.min(...later.map(row=>row.left)));}
  }
 });

 // @covers US-095-AC2: edited native labels/edges are read back as edits, while unqualified defaults and constraints refuse.
 test('supports native edits and refuses ambiguous defaults, header changes, and order changes',async()=>{
  const path=paths.find(path=>path.endsWith('beacon-deployment.json'))!,document=JSON.parse(await readFile(path,'utf8')),visual=flowOf(document),source=sourceOf(visual,serializeDotFlow(visual).statements),graph=readDotProfile(source);
  const findNode=(items:DotProfileGraph['statements']):Extract<DotProfileGraph['statements'][number],{kind:'node'}>|undefined=>{for(const item of items){if(item.kind==='node')return item;if(item.kind==='subgraph'){const child=findNode(item.statements);if(child)return child;}}};
  const firstNode=findNode(graph.statements)!;
  firstNode.attributes.find(item=>item.name==='label')!.value='Edited label';expect(parseDotFlow(graph,'zoned').visual?.nodes?.some(node=>node.label==='Edited label')).toBe(true);
  const groupPath=paths.find(path=>path.endsWith('beacon-deployment.json'))!,groupDoc=JSON.parse(await readFile(groupPath,'utf8')),groupVisual=flowOf(groupDoc),groupGraph=readDotProfile(sourceOf(groupVisual,serializeDotFlow(groupVisual).statements));
  const cluster=groupGraph.statements.find((item):item is Extract<DotProfileGraph['statements'][number],{kind:'subgraph'}>=>item.kind==='subgraph')!;
  cluster.statements.push({kind:'attributes',target:'node',attributes:[{name:'xlabel',value:'untracked'}]});expect(parseDotFlow(groupGraph,'zoned').visual).toBeUndefined();
  const wrongRank=readDotProfile(source),header=wrongRank.statements.find((item):item is Extract<DotProfileGraph['statements'][number],{kind:'attributes'}>=>item.kind==='attributes'&&item.target==='graph')!;header.attributes.find(item=>item.name==='rankdir')!.value='TB';expect(parseDotFlow(wrongRank,'zoned').visual).toBeUndefined();
  const pipelinePath=paths.find(path=>path.endsWith('tpl-design-process.json'))!,pipelineDoc=JSON.parse(await readFile(pipelinePath,'utf8')),pipeline=flowOf(pipelineDoc),pipelineGraph=readDotProfile(sourceOf(pipeline,serializeDotFlow(pipeline).statements));
  pipelineGraph.statements=pipelineGraph.statements.filter(item=>item.kind!=='edge'||item.attributes.every(attribute=>attribute.name!=='umf_layout'));
  expect(parseDotFlow(pipelineGraph,'pipeline').visual).toBeUndefined();
  const defaultGraph=readDotProfile(source),defaultNode:Extract<DotProfileGraph['statements'][number],{kind:'attributes'}>={kind:'attributes',target:'node',attributes:[{name:'fontname',value:'Bad'}]};defaultGraph.statements.push(defaultNode);expect(parseDotFlow(defaultGraph,'zoned').visual).toBeUndefined();
 });

 // @covers US-095-AC2, US-095-AC3: nested groups and adversarial Unicode text remain visible and reversibly framed.
 test('round trips nested group headers and quoted Unicode labels through native Graphviz',async()=>{
  const visual:Visual={id:'unicode-flow',kind:'flow',form:'zoned',question:'Q',groups:[{id:'outer-zone',label:'"Étage / east"',role:'zone',tier:2,detail:'Owns the boundary\nwith care'},{id:'inner-boundary',label:'North "edge"',role:'boundary',parent:'outer-zone',detail:'Maintainer’s path'}],nodes:[{id:'entry',label:'Entry “A”',detail:'quoted "text" and café',group:'outer-zone'},{id:'service',label:'Service / λ',detail:'second line\n中文',group:'inner-boundary'}],edges:[{id:'entry--service',from:'entry',to:'service',kind:'control',label:'allow “yes”',why:'guard\nowner’s decision'}]};
  const projection=serializeDotFlow(visual),source=sourceOf(visual,projection.statements);expect(projection.diagnostics.filter(item=>item.severity==='error')).toEqual([]);
  expect(parseDotFlow(readDotProfile(source),'zoned').visual).toEqual(direct(visual));
  const native=await runNative(source),svg=(await runNative(source,'svg') as string).replaceAll('&#45;','-').replaceAll('&#39;',"'").replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>');
  const outer=native.objects.find((object:any)=>object.name===id('cluster_umf_flow_group_','outer-zone')),inner=native.objects.find((object:any)=>object.name===id('cluster_umf_flow_group_','inner-boundary'));
  expect(outer.subgraphs).toContain(inner._gvid);expect(svg).toContain('Role: zone');expect(svg).toContain('Étage / east');expect(svg).toContain('Owns the boundary');expect(svg).toContain('Maintainer’s path');expect(svg).toContain('Entry “A”');expect(svg).toContain('guard');expect(svg).toContain('owner’s decision');
 });

 test('preserves explicit empty arrays and rejects duplicate group indices, unknown layout tags, and cyclic input',async()=>{
  const empty:Visual={id:'empty-flow-arrays',kind:'flow',form:'pipeline',question:'Q',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],groups:[],edges:[]};const emptyProjection=serializeDotFlow(empty),emptyParsed=parseDotFlow(readDotProfile(sourceOf(empty,emptyProjection.statements)),'pipeline');expect(emptyParsed.diagnostics).toEqual([]);expect(emptyParsed.visual).toEqual(direct(empty));
  const lanes:Visual={id:'duplicate-group-index',kind:'flow',form:'lanes',question:'Q',groups:[{id:'lane-a',label:'A',role:'lane'},{id:'lane-b',label:'B',role:'lane'}],nodes:[{id:'a',label:'A',group:'lane-a'},{id:'b',label:'B',group:'lane-b'}],edges:[]},laneGraph=readDotProfile(sourceOf(lanes,serializeDotFlow(lanes).statements)),clusters=laneGraph.statements.filter((item):item is Extract<DotProfileGraph['statements'][number],{kind:'subgraph'}>=>item.kind==='subgraph');const firstPath=clusters[0]!.statements.find((item):item is Extract<DotProfileGraph['statements'][number],{kind:'attributes'}>=>item.kind==='attributes')!.attributes.find(item=>item.name==='umf_path')!.value;clusters[1]!.statements.find((item):item is Extract<DotProfileGraph['statements'][number],{kind:'attributes'}>=>item.kind==='attributes')!.attributes.find(item=>item.name==='umf_path')!.value=firstPath;expect(parseDotFlow(laneGraph,'lanes').visual).toBeUndefined();
  const pipelinePath=paths.find(path=>path.endsWith('tpl-design-process.json'))!,pipelineDoc=JSON.parse(await readFile(pipelinePath,'utf8')),pipeline=flowOf(pipelineDoc),layoutGraph=readDotProfile(sourceOf(pipeline,serializeDotFlow(pipeline).statements)),layoutEdge=layoutGraph.statements.find((item):item is Extract<DotProfileGraph['statements'][number],{kind:'edge'}>=>item.kind==='edge'&&item.attributes.some(attribute=>attribute.name==='umf_layout'))!;layoutEdge.attributes.find(attribute=>attribute.name==='umf_layout')!.value='invented-order';expect(parseDotFlow(layoutGraph,'pipeline').visual).toBeUndefined();
  const cycle:Visual={id:'cyclic-zoned-groups',kind:'flow',form:'zoned',question:'Q',groups:[{id:'a',label:'A',role:'zone',tier:1,parent:'b'},{id:'b',label:'B',role:'boundary',parent:'a'},{id:'c',label:'C',role:'zone',tier:2}],nodes:[{id:'node',label:'N',group:'a'}],edges:[]};expect(serializeDotFlow(cycle).diagnostics.some(item=>item.code==='DOT_FLOW_CYCLE')).toBe(true);
 });
});
