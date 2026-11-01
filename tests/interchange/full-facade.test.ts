// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {exportVisual,importVisual} from '../../src';
import {compileFullScene} from '../../src/interchange/full/scene';
import {dotFullAdapter} from '../../src/interchange/dot/full';
import flow from '../../fixtures/catalog/canary-flow.json';
import entities from '../../fixtures/catalog/canary-entities.json';
import meter from '../../fixtures/visual/forms/umf-ac-coverage.json';

for(const format of ['dot','mermaid','lini'] as const)test('public full '+format+' first slice exact round trips and retained native replay',()=>{
 const profile=`umf.visual.${format}.full/1` as const;
 for(const document of [flow,entities,meter]){
  const result=exportVisual(document,{format,profile});expect(result.diagnostics).toEqual([]);expect(result.ok).toBe(true);
  const read=importVisual(result.text,{format,profile,id:'ignored-context',question:'Native source provides actual context'});
  expect(read.ok).toBe(true);expect(read.document).toEqual(document as any);
  expect(read.source.importOptions.id).toBe(document.extensions['umf.visual'].id);
  const replay=exportVisual(read.document,{format,profile,source:read.source,original:true});expect(replay.ok).toBe(true);expect(replay.text).toBe(result.text);
  const ambiguousUpdate=exportVisual(read.document,{format,profile,source:read.source});expect(ambiguousUpdate.ok).toBe(false);expect(ambiguousUpdate.source).toEqual(read.source);
 }
});
test('complete property rows alone cannot qualify as a rendered diagram',()=>{
 const scene=compileFullScene(flow,'dot');scene.nodes=[];scene.edges=[];
 const result=importVisual(dotFullAdapter.emit(scene),{format:'dot',profile:'umf.visual.dot.full/1',id:'test',question:'test'});
 expect(result.ok).toBe(false);expect(result.diagnostics[0]?.message).toContain('primary structure');
});
test('native approximation declarations cannot disguise the qualified presentation',()=>{
 const scene=compileFullScene(flow,'dot');scene.approximations.push({path:'/extensions/umf.visual',requested:'Original',renderedAs:'Invented',reason:'Forged declaration'});
 const result=importVisual(dotFullAdapter.emit(scene),{format:'dot',profile:'umf.visual.dot.full/1',id:'test',question:'test'});
 expect(result.ok).toBe(false);expect(result.diagnostics[0]?.message).toContain('approximation declarations');
});
test('public full import derives reconnected endpoints from native links alone',()=>{
 const authored=structuredClone(flow);authored.vocabularies['umf.visual'].version='1.1.0';
 for(const format of ['dot','mermaid','lini'] as const){
  const profile=`umf.visual.${format}.full/1` as const,output=exportVisual(authored,{format,profile});
  expect(output.ok).toBe(true);
  const nodeId=(index:number)=>{
   const locator=output.coverage!.find(item=>item.path===`/extensions/umf.visual/nodes/${index}/label`)!.native[0]!.id;
   return format==='lini'?locator.split('/').at(-1)!.replace(/^block#/, ''):locator;
  };
  const from=nodeId(0),to=nodeId(1);
  const edited=output.text!.split('\n').map(line=>{
   if(format==='dot'&&line.trimStart().startsWith('"'+from+'" ->'))return line.replace(' -> "'+to+'"',' -> "'+from+'"');
   if(format==='mermaid'&&line.startsWith(from+' -->'))return line.endsWith(to)?line.slice(0,-to.length)+from:line;
   if(format==='lini'&&line.trimStart().startsWith(from+' ->'))return line.replace(' -> '+to,' -> '+from);
   return line;
  }).join('\n');
  expect(edited).not.toBe(output.text);
  const read=importVisual(edited,{format,profile,id:'context',question:'Context'});
  expect(read.diagnostics).toEqual([]);expect(read.ok).toBe(true);
  expect((read.document?.extensions?.['umf.visual'] as any).edges[0].to).toBe('parser');
 }
});
test('primary group membership and quantitative geometry must match recovered meaning',()=>{
 const document:any=structuredClone(flow),visual=document.extensions['umf.visual'];
 visual.groups=[{id:'first',label:'First',role:'lane'},{id:'second',label:'Second',role:'lane'}];visual.nodes[0].group='first';
 const grouped=compileFullScene(document,'dot');
 grouped.nodes.find(node=>node.identityRecordId)!.group=grouped.groups[1]!.id;
 expect(importVisual(dotFullAdapter.emit(grouped),{format:'dot',profile:'umf.visual.dot.full/1',id:'test',question:'test'}).ok).toBe(false);
 const metric=compileFullScene(meter,'dot');metric.nodes.find(node=>node.width!==undefined)!.width=123;
 expect(importVisual(dotFullAdapter.emit(metric),{format:'dot',profile:'umf.visual.dot.full/1',id:'test',question:'test'}).ok).toBe(false);
});
test('full facade refuses unsafe options and preserves a trusted companion on refusal',()=>{
 const first=exportVisual(flow,{format:'dot',profile:'umf.visual.dot.full/1'}),read=importVisual(first.text,{format:'dot',profile:'umf.visual.dot.full/1',id:'test',question:'test'});
 let invoked=false;const unsafe=Object.defineProperty({format:'dot',profile:'umf.visual.dot.full/1',source:read.source},'mode',{enumerable:true,get(){invoked=true;return 'strict';}});
 const result=exportVisual(flow,unsafe);expect(result.ok).toBe(false);expect(invoked).toBe(false);expect(result.source).toEqual(read.source);
});
