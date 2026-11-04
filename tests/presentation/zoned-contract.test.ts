// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {createVisualDocument,getVisual,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';

const source=readVisualDocument(readFileSync('fixtures/visual/inventory/beacon-deployment.json','utf8'),'json') as Document;
const visual=getVisual(source) as Visual;
const base='/extensions/umf.visual';
const compile=(candidate:Visual,version:'1.0.0'|'1.4.0'='1.0.0',backend:'graphviz'|'mermaid'|'lini'='lini')=>compilePresentation(createVisualDocument(candidate,`test:zoned:${candidate.id}`,version),{backend,theme:'presentation/1'});
const groupMap=(plan:Extract<ReturnType<typeof compilePresentation>,{ok:true}>,index:number)=>plan.elementMap.find(item=>item.kind==='group'&&item.sourcePath===`${base}/groups/${index}`);
const decodedText=(source:string)=>source.replace(/#32;/gu,' ').replace(/<br\s*\/?\s*>/giu,' ').replace(/\\n/gu,' ').replace(/&quot;/gu,'"').replace(/&amp;/gu,'&').replace(/\s+/gu,' ');
const tierApproximation=(plan:Extract<ReturnType<typeof compilePresentation>,{ok:true}>,index:number)=>plan.approximations.find(item=>item.sourcePath===`${base}/groups/${index}/tier`);

test('zoned deployment maps every authored group, node, and edge and preserves literal tier values',()=>{
 const before=JSON.stringify(source);
 for(const backend of ['graphviz','mermaid','lini'] as const){
  const plan=compilePresentation(source,{backend,theme:'presentation/1'});expect(plan.ok,backend).toBe(true);if(!plan.ok)continue;
  expect(plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(13);expect(plan.elementMap.filter(item=>item.kind==='group')).toHaveLength(5);expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(15);
  for(const[index,node]of visual.nodes!.entries())expect(plan.elementMap).toContainEqual({logicalId:node.id,sourcePath:`${base}/nodes/${index}${backend==='lini'?'/id':''}`,nativeId:`n${index+1}`,kind:'node'});
  for(const[index,group]of visual.groups!.entries()){
   const mapped=groupMap(plan,index);expect(mapped).toEqual({logicalId:group.id,sourcePath:`${base}/groups/${index}`,nativeId:`g${index+1}`,kind:'group'});
   if(backend==='graphviz'){
    const declaration=plan.source.split('\n').find(line=>line.includes(`subgraph cluster_g${index+1} {`));
    expect(declaration).toContain('labeljust="l"; labelloc="b";');
    expect(decodedText(declaration??'')).toContain(group.label);if(group.detail)expect(decodedText(declaration??'')).toContain(group.detail);
   }
   const tier=tierApproximation(plan,index);expect(tier?.requested).toBe(`Group tier ${group.tier}`);expect(tier?.representation).toContain(`Tier ${group.tier}`);
   const nativeText=decodedText(plan.source);expect(nativeText).toContain(group.label);if(group.detail)expect(nativeText).toContain(group.detail);expect(nativeText).toContain(`Tier ${group.tier}`);
  }
  for(const[index,edge]of visual.edges!.entries())expect(plan.elementMap).toContainEqual({logicalId:edge.id,sourcePath:`${base}/edges/${index}`,nativeId:`e${index+1}`,kind:'edge'});
 }
 expect(visual.groups?.filter(group=>group.tier===3).map(group=>group.id)).toEqual(['zone-app-platform','zone-model-services']);
 expect(JSON.stringify(source)).toBe(before);
});

test('default zoned composition orders groups by ascending tier and keeps source order for ties',()=>{
 const sorted=[...visual.groups!.entries()].sort((a,b)=>a[1].tier!-b[1].tier!||a[0]-b[0]).map(([,group])=>group);
 for(const backend of ['graphviz','mermaid','lini'] as const){
  const plan=compilePresentation(source,{backend,theme:'presentation/1'});expect(plan.ok,backend).toBe(true);if(!plan.ok)continue;
  const nativeText=decodedText(plan.source),positions=sorted.map(group=>nativeText.indexOf(group.label));expect(positions.every(position=>position>=0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a,b)=>a-b));
  expect(positions[2]!<positions[3]!).toBe(true); // Both tier-3 groups keep their authored relative order.
 }
});

test('renamed generic zones retain source identity and equivalent tier mappings',()=>{
 const rename=new Map(visual.groups!.map((group,index)=>[group.id,`zone-${index+1}`]));
 const renamed:Visual={...visual,id:'renamed-zoned-network',groups:visual.groups!.map((group,index)=>({...group,id:rename.get(group.id)!})),nodes:visual.nodes!.map(node=>({...node,...(node.group?{group:rename.get(node.group)!}:{})}))};
 for(const backend of ['graphviz','mermaid','lini'] as const){
  const plan=compile(renamed,'1.0.0',backend);expect(plan.ok,backend).toBe(true);if(!plan.ok)continue;
  expect(plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(13);expect(plan.elementMap.filter(item=>item.kind==='group')).toHaveLength(5);expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(15);
  for(const[index,group]of renamed.groups!.entries()){
   expect(groupMap(plan,index)).toEqual({logicalId:group.id,sourcePath:`${base}/groups/${index}`,nativeId:`g${index+1}`,kind:'group'});
   expect(tierApproximation(plan,index)?.requested).toBe(`Group tier ${group.tier}`);
   expect(decodedText(plan.source)).toContain(`Tier ${group.tier}`);
  }
 }
});

test('authored Visual 1.4 group order and direction take precedence while tier values remain visible',()=>{
 const order=[...visual.groups!].reverse().map(group=>group.id),authored:Visual={...visual,id:'zoned-explicit-layout',layout:{kind:'flow',direction:'TB',order}};
 const plan=compile(authored,'1.4.0');expect(plan.ok).toBe(true);if(!plan.ok)return;
 expect(plan.approximations.some(item=>item.sourcePath===`${base}/layout/order`)).toBe(true);
 expect(plan.approximations.some(item=>item.sourcePath.startsWith(`${base}/groups/`)&&item.sourcePath.endsWith('/tier'))).toBe(true);
 const nativeText=decodedText(plan.source),positions=order.map(id=>nativeText.indexOf(visual.groups!.find(group=>group.id===id)!.label));expect(positions.every(position=>position>=0)).toBe(true);expect(positions).toEqual([...positions].sort((a,b)=>a-b));
 for(const group of visual.groups!)expect(nativeText).toContain(`Tier ${group.tier}`);
});

test('nested zones do not acquire a tier from their ancestor',()=>{
 const nested:Visual={id:'nested-zoned',kind:'flow',form:'zoned',question:'Which nested zones contain these nodes?',groups:[{id:'outer',label:'Outer zone',role:'zone',tier:8},{id:'inner',label:'Inner zone',role:'zone',parent:'outer'}],nodes:[{id:'a',label:'A',group:'inner'},{id:'b',label:'B',group:'inner'}],edges:[{id:'ab',from:'a',to:'b',label:'connects'}]};
 const plan=compile(nested,'1.4.0');expect(plan.ok).toBe(true);if(!plan.ok)return;
 expect(groupMap(plan,0)).toEqual({logicalId:'outer',sourcePath:`${base}/groups/0`,nativeId:'g1',kind:'group'});
 expect(groupMap(plan,1)).toEqual({logicalId:'inner',sourcePath:`${base}/groups/1`,nativeId:'g2',kind:'group'});
 expect(plan.approximations.some(item=>item.sourcePath===`${base}/groups/0/tier`)).toBe(true);
 expect(plan.approximations.some(item=>item.sourcePath===`${base}/groups/1/tier`)).toBe(false);
 expect(plan.elementMap.some(item=>item.sourcePath===`${base}/groups/1/tier`)).toBe(false);
});

test('Graphviz uses a zoned-specific default direction while caller and authored directions take precedence',()=>{
 const defaultPlan=compilePresentation(source,{backend:'graphviz',theme:'presentation/1'});expect(defaultPlan.ok).toBe(true);if(!defaultPlan.ok)return;
 expect(defaultPlan.source).toContain('rankdir="TB"');
 expect(defaultPlan.approximations).toContainEqual(expect.objectContaining({sourcePath:`${base}/form`,requested:'Default Graphviz direction TB for zoned groups'}));

 const callerPlan=compilePresentation(source,{backend:'graphviz',theme:'presentation/1',direction:'LR'});expect(callerPlan.ok).toBe(true);if(!callerPlan.ok)return;
 expect(callerPlan.source).toContain('rankdir="LR"');
 expect(callerPlan.approximations.some(item=>item.sourcePath===`${base}/form`&&item.requested==='Default Graphviz direction TB for zoned groups')).toBe(false);

 const authored:Visual={...visual,id:'zoned-authored-direction',layout:{kind:'flow',direction:'LR',order:[...visual.groups!].reverse().map(group=>group.id)}};
 const authoredPlan=compile(authored,'1.4.0','graphviz');expect(authoredPlan.ok).toBe(true);if(!authoredPlan.ok)return;
 expect(authoredPlan.source).toContain('rankdir="LR"');
 expect(authoredPlan.approximations.some(item=>item.sourcePath===`${base}/form`&&item.requested==='Default Graphviz direction TB for zoned groups')).toBe(false);
});

test('Graphviz keeps top-centered group captions when the effective flow axis is LR',()=>{
 const lrVisual:Visual={...visual,id:'grouped-flow-lr-caption-placement',form:'network'};
 const plan=compile(lrVisual,'1.4.0','graphviz');expect(plan.ok).toBe(true);if(!plan.ok)return;
 expect(plan.source).toContain('rankdir="LR"');
 for(const[index,group]of lrVisual.groups!.entries()){
  const declaration=plan.source.split('\n').find(line=>line.includes(`subgraph cluster_g${index+1} {`));
  expect(declaration).not.toContain('labeljust="l"; labelloc="b";');
  expect(decodedText(declaration??'')).toContain(group.label);if(group.detail)expect(decodedText(declaration??'')).toContain(group.detail);
 }
});
