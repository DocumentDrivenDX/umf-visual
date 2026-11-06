// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';

const sourcePath='fixtures/visual/inventory/beacon-ci-ci.json';
const base='/extensions/umf.visual';
const document=readVisualDocument(readFileSync(sourcePath,'utf8'),'json') as Document;

test('pipeline plans map all five nodes and four authored edges by exact source index on all backends',()=>{
 const before=JSON.stringify(document);
 for(const backend of ['graphviz','mermaid','lini'] as const){
  const plan=compilePresentation(document,{backend,theme:'presentation/1'});expect(plan.ok,backend).toBe(true);if(!plan.ok)continue;
  expect(plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(5);
  expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(4);
  for(const[index,id]of ['lint','test','migrations','build','deploy'].entries())expect(plan.elementMap).toContainEqual({logicalId:id,sourcePath:`${base}/nodes/${index}${backend==='lini'?'/id':''}`,nativeId:`n${index+1}`,kind:'node'});
  for(const[index,id]of ['lint--build','test--build','migrations--build','build--deploy'].entries())expect(plan.elementMap).toContainEqual({logicalId:id,sourcePath:`${base}/edges/${index}`,nativeId:`e${index+1}`,kind:'edge'});
  expect(plan.elementMap.some(item=>item.kind==='edge'&&item.logicalId==='lint--test')).toBe(false);
  expect(plan.elementMap.some(item=>item.kind==='edge'&&item.logicalId==='test--migrations')).toBe(false);
  expect(plan.elementMap.some(item=>item.kind==='edge'&&item.logicalId==='migrations--lint')).toBe(false);
 }
 expect(JSON.stringify(document)).toBe(before);
});

test('pipeline keeps its four declared DAG endpoints when native layout varies',()=>{
 for(const backend of ['graphviz','mermaid','lini'] as const){
  const plan=compilePresentation(document,{backend});expect(plan.ok,backend).toBe(true);if(!plan.ok)continue;
  expect(plan.elementMap.filter(item=>item.kind==='edge').map(item=>item.logicalId)).toEqual(['lint--build','test--build','migrations--build','build--deploy']);
  expect(plan.source).toContain(backend==='mermaid'?'n1':'n1');
  expect(plan.source).toContain(backend==='graphviz'?'n4 -> n5':backend==='mermaid'?'n4 --> n5':'n4 -> n5');
 }
 const lini=compilePresentation(document,{backend:'lini'});expect(lini.ok).toBe(true);
 if(lini.ok){expect(lini.elementMap).toContainEqual({logicalId:`${base}/question`,sourcePath:`${base}/question`,nativeId:'pipeline-question-caption',kind:'annotation'});expect(lini.elementMap).toContainEqual({logicalId:`${base}/takeaway`,sourcePath:`${base}/takeaway`,nativeId:'pipeline-takeaway-footer',kind:'annotation'});}
});

test('pipeline caller direction controls automatic ranks while unsupported authored layout stays explicit',()=>{
 const callerTb=compilePresentation(document,{backend:'lini',direction:'TB'}),callerLr=compilePresentation(document,{backend:'lini',direction:'LR'});
 expect(callerTb.ok).toBe(true);expect(callerLr.ok).toBe(true);
 if(callerTb.ok)expect(callerTb.source).toMatch(/direction:\s*column;/u);
 if(callerLr.ok)expect(callerLr.source).toMatch(/direction:\s*row;/u);
 expect((getVisual(document) as Visual).layout).toBeUndefined();
 const authoredUnknown=structuredClone(document);(authoredUnknown.extensions!['umf.visual'] as Visual).layout={kind:'flow',direction:'TB'};
 const refused=compilePresentation(authoredUnknown,{backend:'lini',direction:'LR'});
 expect(refused.ok).toBe(false);if(!refused.ok)expect(refused.diagnostics).toContainEqual(expect.objectContaining({code:'VISUAL_UNKNOWN',path:`${base}/layout`}));
});

test('valid Visual 1.4 authored pipeline layout takes precedence over caller direction and auto-ranks',()=>{
 const authored=structuredClone(document) as Document & {vocabularies:Record<string,{version:string}>;extensions:Record<string,Visual>};
 authored.vocabularies['umf.visual']={version:'1.4.0'};
 const rawVisual=authored.extensions['umf.visual'] as unknown as Record<string,unknown>;
 authored.extensions['umf.visual']={...rawVisual,layout:{kind:'flow',direction:'TB',order:['migrations','lint','test','build','deploy']}} as unknown as Visual;
 const validation=inspectVisual(authored);expect(validation.valid).toBe(true);expect(validation.complete).toBe(true);
 const plan=compilePresentation(authored,{backend:'lini',direction:'LR'});expect(plan.ok).toBe(true);
 if(plan.ok){expect(plan.source).toMatch(/direction:\s*column;/u);expect(plan.approximations.some(item=>item.requested==='Directed flow with no authored layout')).toBe(false);}
 expect(getVisual(document).layout).toBeUndefined();
});
