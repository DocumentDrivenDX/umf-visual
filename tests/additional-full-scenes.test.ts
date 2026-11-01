// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,test} from 'bun:test';
import {getVisual} from '../src/extensions/visual';
import {dotFullAdapter} from '../src/interchange/dot/full';
import {liniFullAdapter} from '../src/interchange/lini/full';
import {mermaidFullAdapter} from '../src/interchange/mermaid/full';
import {compileFullRecords,recoverFullRecords} from '../src/interchange/full/records';
import {fullRecordId} from '../src/interchange/full/records';
import type {FullScene} from '../src/interchange/full/types';
import {appendAdditionalScene} from '../src/interchange/full/additional-scenes';
import {compileFullScene} from '../src/interchange/full/scene';

const additional=new Set([
 'structure/stack','structure/tree','structure/nested','state/machine','state/lifecycle',
 'sequence/lifelines','sequence/ladder','timeline/milestones','timeline/roadmap','timeline/history',
 'comparison/matrix','comparison/quadrant','comparison/before-after','metric/line',
]);
const expectedOriginal=new Set([
 'flow/network','flow/pipeline','flow/zoned','flow/lanes','structure/entities',
 'metric/bar','metric/stat','metric/meter',
]);
async function fixtures():Promise<string[]>{
 const files:string[]=[];for(const folder of ['fixtures/visual/forms','fixtures/visual/inventory','fixtures/catalog'])for await(const file of new Bun.Glob('*.json').scan(folder))files.push(`${folder}/${file}`);return files.sort();
}
function emptyScene(document:any,format:'dot'|'mermaid'|'lini'):FullScene{
 const visual=getVisual(document);
 return{format,profile:`umf.visual.${format}.full/1`,version:'1',kind:visual.kind,form:visual.form,records:compileFullRecords(document),nodes:[],edges:[],groups:[],approximations:[]};
}

describe('additional common-primitive full scenes',()=>{
 test('generated Mermaid captions use supported boxes while authored document roles retain their shape approximation',async()=>{
  const document=await Bun.file('fixtures/catalog/canary-supported-flow.json').json();
  document.extensions['umf.visual'].title='Generated captions';
  document.extensions['umf.visual'].nodes[0].role='document';
  const scene=compileFullScene(document,'mermaid'),parsed=mermaidFullAdapter.read(mermaidFullAdapter.emit(scene));
  for(const property of ['title','question'])expect(scene.nodes.find(node=>node.recordId===fullRecordId('/extensions/umf.visual/'+property))?.shape).toBe('box');
  expect(scene.nodes.find(node=>node.recordId===fullRecordId('/extensions/umf.visual/nodes/0/label'))?.shape).toBe('note');
  expect(parsed.approximations.filter(item=>item.requested==='note shape').map(item=>item.path)).toEqual(['/extensions/umf.visual/nodes/0/label']);
  const state=await Bun.file('fixtures/visual/forms/helix-authoring-state.json').json();
  const stateScene=compileFullScene(state,'mermaid');
  expect(stateScene.nodes.find(node=>node.recordId===fullRecordId('/extensions/umf.visual/state/transitions/0/event'))?.shape).toBe('box');
  expect(mermaidFullAdapter.read(mermaidFullAdapter.emit(stateScene)).approximations.some(item=>item.requested==='note shape')).toBe(false);
 });
 test('categorical bar fallbacks show authored captions and bind category references to their actual native connections',async()=>{
  const document=await Bun.file('fixtures/visual/forms/umf-ac-status.json').json();
  for(const adapter of [dotFullAdapter,mermaidFullAdapter,liniFullAdapter]){
   const scene=compileFullScene(document,adapter.format);
   const label=fullRecordId('/extensions/umf.visual/metric/axis/categories/0/label');
   const category=scene.nodes.find(node=>node.recordId===label)!;
   expect(category).toBeDefined();
   expect(category.identityRecordId).toBe(fullRecordId('/extensions/umf.visual/metric/axis/categories/0/id'));
   expect(scene.edges.find(edge=>edge.fromRecordId===fullRecordId('/extensions/umf.visual/metric/series/0/points/0/at'))?.from).toBe(category.id);
   expect(recoverFullRecords(adapter.read(adapter.emit(scene)).records)).toEqual(document);
  }
 });
 test('covers every remaining visual form and keeps original forms on their existing path',async()=>{
  const forms=new Set<string>();
  for(const path of await fixtures()){
   const document=await Bun.file(path).json();if(!document.vocabularies||!document.extensions?.['umf.visual'])continue;const visual=getVisual(document),key=`${visual.kind}/${visual.form}`,scene=emptyScene(document,'dot');
   if(additional.has(key)){forms.add(key);expect(appendAdditionalScene(scene,visual),path).toBe(true);expect(scene.nodes.length+scene.edges.length+scene.groups.length).toBeGreaterThan(0);expect(recoverFullRecords(scene.records)).toEqual(document);}
   else if(expectedOriginal.has(key))expect(appendAdditionalScene(scene,visual),path).toBe(false);
  }
  expect([...forms].sort()).toEqual([...additional].sort());
 });

 test('keeps all 53 source documents recoverable from the native common-primitive outputs',async()=>{
  let sourceCount=0;
  for(const path of await fixtures()){
   const document=await Bun.file(path).json();if(!document.vocabularies||!document.extensions?.['umf.visual'])continue;sourceCount++;const visual=getVisual(document),key=`${visual.kind}/${visual.form}`;
   if(!additional.has(key))continue;
   for(const adapter of [dotFullAdapter,mermaidFullAdapter,liniFullAdapter]){
    const scene=emptyScene(document,adapter.format);
    expect(appendAdditionalScene(scene,visual),`${path} ${adapter.format}`).toBe(true);
    const native=adapter.emit(scene),parsed=adapter.read(native);
    expect(recoverFullRecords(parsed.records),`${path} ${adapter.format}`).toEqual(document);
   }
  }
  expect(sourceCount).toBe(53);
 });

 test('binds source labels and endpoint values once and records honest geometry limits',async()=>{
  for(const path of await fixtures()){
   const document=await Bun.file(path).json();if(!document.vocabularies||!document.extensions?.['umf.visual'])continue;const visual=getVisual(document),key=`${visual.kind}/${visual.form}`;
   if(!additional.has(key))continue;
   const scene=emptyScene(document,'dot');appendAdditionalScene(scene,visual);
   const bound=[...scene.nodes.flatMap(node=>[node.recordId,node.identityRecordId]),...scene.groups.map(group=>group.recordId),...scene.edges.flatMap(edge=>[edge.recordId,edge.fromRecordId,edge.toRecordId])].filter((id):id is string=>id!==undefined);
   expect(new Set(bound).size,`${path} duplicate record binding`).toBe(bound.length);
   for(const id of bound)expect(scene.records.some(record=>record.id===id),`${path} missing record ${id}`).toBe(true);
   for(const approximation of scene.approximations)expect(approximation.path.startsWith('/extensions/umf.visual/')).toBe(true);
  }
 });

 test('projects period order, state conditions, sequence groups, and shared metric categories as native structure',async()=>{
  const timeline=await Bun.file('fixtures/visual/forms/visuals-roadmap.json').json(),timelineVisual=getVisual(timeline),timelineScene=emptyScene(timeline,'dot');appendAdditionalScene(timelineScene,timelineVisual);
  const periods=timeline.extensions['umf.visual'].timeline.scale.periods.map((_:unknown,i:number)=>`v_${fullRecordId(`/extensions/umf.visual/timeline/scale/periods/${i}`).slice(2)}`);
  expect(timelineScene.edges.filter(edge=>edge.text==='Period order').map(edge=>[edge.from,edge.to])).toEqual(periods.slice(0,-1).map((id:string,i:number)=>[id,periods[i+1]]));

  const state=await Bun.file('fixtures/visual/forms/helix-authoring-state.json').json(),stateVisual=getVisual(state),stateScene=emptyScene(state,'dot');appendAdditionalScene(stateScene,stateVisual);
  expect(stateScene.nodes.some(node=>node.recordId===fullRecordId('/extensions/umf.visual/state/transitions/0/action'))).toBe(true);
  expect(stateScene.nodes.some(node=>node.text==='Action')).toBe(true);
  expect(stateScene.edges.some(edge=>edge.fromRecordId===fullRecordId('/extensions/umf.visual/state/transitions/0/from'))).toBe(true);
  expect(stateScene.edges.some(edge=>edge.toRecordId===fullRecordId('/extensions/umf.visual/state/transitions/0/to'))).toBe(true);
  for(const adapter of [dotFullAdapter,mermaidFullAdapter,liniFullAdapter])expect(recoverFullRecords(adapter.read(adapter.emit({...stateScene,format:adapter.format,profile:`umf.visual.${adapter.format}.full/1`})).records)).toEqual(state);

  const sequence=await Bun.file('fixtures/visual/inventory/beacon-reply-draft.json').json();
  sequence.extensions['umf.visual'].groups=[{id:'response-loop',label:'Response loop',role:'loop',detail:'Draft and review'}];
  sequence.extensions['umf.visual'].sequence.messages[0].group='response-loop';
  const sequenceVisual=getVisual(sequence),sequenceScene=emptyScene(sequence,'dot');appendAdditionalScene(sequenceScene,sequenceVisual);
  const groupId=`v_${fullRecordId('/extensions/umf.visual/groups/0').slice(2)}`;
  expect(sequenceScene.groups.some(group=>group.id===groupId&&group.recordId===fullRecordId('/extensions/umf.visual/groups/0/label'))).toBe(true);
  expect(sequenceScene.nodes.find(node=>node.recordId===fullRecordId('/extensions/umf.visual/sequence/messages/0/label'))?.group).toBe(groupId);
  expect(sequenceScene.nodes.some(node=>node.recordId===fullRecordId('/extensions/umf.visual/groups/0/role'))).toBe(true);
  expect(sequenceScene.nodes.some(node=>node.recordId===fullRecordId('/extensions/umf.visual/groups/0/detail'))).toBe(true);
  for(const adapter of [dotFullAdapter,mermaidFullAdapter,liniFullAdapter])expect(recoverFullRecords(adapter.read(adapter.emit({...sequenceScene,format:adapter.format,profile:`umf.visual.${adapter.format}.full/1`})).records)).toEqual(sequence);

  const metric=await Bun.file('fixtures/visual/forms/umf-ac-trend.json').json();
  const metricVisual=metric.extensions['umf.visual'];
  metricVisual.metric.axis={kind:'category',categories:[{id:'first',label:'First'},{id:'second',label:'Second'}]};
  for(const series of metricVisual.metric.series){series.points=series.points.slice(0,2);series.points[0].at='first';series.points[1].at='second';}
  metricVisual.metric.series.push({...structuredClone(metricVisual.metric.series[0]),id:'second-series',label:'Second series'});
  const metricScene=emptyScene(metric,'dot');appendAdditionalScene(metricScene,getVisual(metric));
  const categories=metricVisual.metric.axis.categories;
  for(let i=0;i<categories.length;i++){
   const recordId=fullRecordId(`/extensions/umf.visual/metric/axis/categories/${i}/label`);
   expect(metricScene.nodes.filter(node=>node.recordId===recordId)).toHaveLength(1);
   expect(metricScene.edges.filter(edge=>edge.from===`v_${fullRecordId(`/extensions/umf.visual/metric/axis/categories/${i}`).slice(2)}`)).toHaveLength(metricVisual.metric.series.length);
  }
  for(const adapter of [dotFullAdapter,mermaidFullAdapter,liniFullAdapter])expect(recoverFullRecords(adapter.read(adapter.emit({...metricScene,format:adapter.format,profile:`umf.visual.${adapter.format}.full/1`})).records)).toEqual(metric);
 });
});
