// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import type {Document} from '@umf/core';
import {getVisual,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';

const sourcePath='fixtures/visual/forms/visuals-roadmap.json';
const base='/extensions/umf.visual';
const load=async()=>readVisualDocument(await Bun.file(sourcePath).text(),'json');
const compile=(document:Document,backend:'lini'|'graphviz'|'mermaid'='lini')=>compilePresentation(document,{backend,theme:'presentation/1'});

test('Lini roadmap maps original period, lane, and span pointers without changing the source',async()=>{
 const document=await load(),before=JSON.stringify(document),visual=getVisual(document),plan=compile(document);
 expect(plan.ok).toBe(true);if(!plan.ok)return;
 expect(plan.elementMap.filter(item=>item.kind==='period'&&item.sourcePath.endsWith('/timeline/scale/periods/0'))).toContainEqual({logicalId:'m0',sourcePath:`${base}/timeline/scale/periods/0`,nativeId:'roadmap-period-1',kind:'period'});
 expect(plan.elementMap).toContainEqual({logicalId:'m0',sourcePath:`${base}/timeline/scale/periods/0/label`,nativeId:'roadmap-period-1',kind:'period'});
 expect(plan.elementMap).toContainEqual({logicalId:'helix',sourcePath:`${base}/timeline/lanes/2`,nativeId:'roadmap-lane-3',kind:'lane'});
 expect(plan.elementMap).toContainEqual({logicalId:'span-m0',sourcePath:`${base}/timeline/spans/0`,nativeId:'roadmap-span-1',kind:'span'});
 expect(plan.elementMap).toContainEqual({logicalId:'span-m0',sourcePath:`${base}/timeline/spans/0/label`,nativeId:'roadmap-span-label-1-line-1',kind:'span'});
 expect(plan.elementMap).toContainEqual({logicalId:'span-m0',sourcePath:`${base}/timeline/spans/0/status`,nativeId:'roadmap-span-status-1',kind:'span'});
 expect(plan.elementMap.filter(item=>item.kind==='period'&&item.sourcePath.startsWith(`${base}/timeline/scale/periods/`))).toHaveLength(24);
 expect(plan.elementMap.filter(item=>item.kind==='lane')).toHaveLength(12);
 expect(plan.elementMap.filter(item=>item.kind==='span'&&/^\/extensions\/umf\.visual\/timeline\/spans\/\d+$/u.test(item.sourcePath))).toHaveLength(8);
 expect(new Set(plan.elementMap.filter(item=>item.kind==='span'&&item.sourcePath.endsWith('/label')).map(item=>item.sourcePath))).toHaveLength(8);
 expect(plan.elementMap.filter(item=>item.kind==='span'&&item.sourcePath.endsWith('/status'))).toHaveLength(8);
 expect(plan.source).toContain('HELIX PR #95 lands as it is');expect(plan.source).toContain('built');expect(plan.source).toContain('M0');
 expect(plan.approximations.some(item=>/no calendar dates, elapsed durations, delivery completion, or causal links are inferred/iu.test(item.representation))).toBe(true);
 expect(JSON.stringify(document)).toBe(before);expect(visual.timeline?.spans?.map(span=>span.id)).toEqual(['span-m0','span-m1','span-m2','span-m3','span-m4','span-m5','span-m6','span-m7']);
});

test('roadmap joins remain ID-based when period and lane declarations are reordered',async()=>{
 const document=await load(),changed=structuredClone(document),timeline=(changed.extensions!['umf.visual'] as any).timeline as NonNullable<Visual['timeline']>;
 const periodScale=timeline.scale;if(periodScale.kind!=='period')throw new Error('Fixture period scale is required.');
 periodScale.periods=[...periodScale.periods].reverse();
 timeline.lanes=[...(timeline.lanes??[])].reverse();
 const before=JSON.stringify(changed),plan=compile(changed);
 expect(plan.ok).toBe(true);if(!plan.ok)return;
 for(const[index,span]of timeline.spans!.entries()){
  const mapping=plan.elementMap.find(item=>item.kind==='span'&&item.sourcePath===`${base}/timeline/spans/${index}`);
  expect(mapping).toEqual({logicalId:span.id,sourcePath:`${base}/timeline/spans/${index}`,nativeId:`roadmap-span-${index+1}`,kind:'span'});
  const periodStart=periodScale.periods.findIndex(period=>period.id===span.start);
  const periodEnd=periodScale.periods.findIndex(period=>period.id===span.end);
  const lane=timeline.lanes!.findIndex(item=>item.id===span.lane);
  expect(periodStart).toBeGreaterThanOrEqual(0);expect(periodEnd).toBeGreaterThanOrEqual(periodStart);expect(lane).toBeGreaterThanOrEqual(0);
  expect(plan.source).toContain(`roadmap-span-${index+1}`);
 }
 expect(plan.elementMap).toContainEqual({logicalId:'m7',sourcePath:`${base}/timeline/scale/periods/0/id`,nativeId:'roadmap-period-1',kind:'period'});
 expect(plan.elementMap).toContainEqual({logicalId:'documentor',sourcePath:`${base}/timeline/lanes/0/id`,nativeId:'roadmap-lane-1',kind:'lane'});
 expect(JSON.stringify(changed)).toBe(before);
});

test('roadmap remains explicitly Lini-only and refuses unprojected span details at their source path',async()=>{
 const document=await load();
 for(const backend of ['graphviz','mermaid'] as const){const result=compile(document,backend);expect(result.ok).toBe(false);if(!result.ok)expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'PRESENTATION_BACKEND_SUBSET',path:`${base}/form`}));}
 const changed=structuredClone(document);((changed.extensions!['umf.visual'] as any).timeline.spans[0] as any).detail='Extra text';
 const result=compile(changed);expect(result.ok).toBe(false);if(!result.ok)expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'PRESENTATION_LINI_ROADMAP_SCOPE',path:`${base}/timeline/spans/0/detail`}));
});

test('roadmap unsafe native text returns a located refusal for each authored text field',async()=>{
 const controls:Array<[string,(document:Document)=>void]>=[
  [`${base}/question`,document=>{(document.extensions!['umf.visual'] as any).question='Question\u007f';}],
  [`${base}/timeline/scale/periods/0/label`,document=>{(document.extensions!['umf.visual'] as any).timeline.scale.periods[0].label='Period\u007f';}],
  [`${base}/timeline/lanes/0/label`,document=>{(document.extensions!['umf.visual'] as any).timeline.lanes[0].label='Lane\u007f';}],
  [`${base}/timeline/spans/0/label`,document=>{(document.extensions!['umf.visual'] as any).timeline.spans[0].label='Milestone\u007f';}],
  [`${base}/timeline/spans/0/label`,document=>{(document.extensions!['umf.visual'] as any).timeline.spans[0].label='Milestone\u0085 label';}],
 ];
 for(const[path,mutate]of controls){const document=await load();mutate(document);let result:ReturnType<typeof compile>;try{result=compile(document);}catch(error){throw new Error(`Compile threw for ${path}: ${String(error)}`);}expect(result.ok).toBe(false);if(!result.ok)expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'PRESENTATION_LINI_ROADMAP_TEXT',path}));}
});

test('unknown roadmap content remains present and its diagnostic escapes JSON Pointer keys',async()=>{
 const document=await load(),span=(document.extensions!['umf.visual'] as any).timeline.spans[0];span['vendor/x~y']={payload:'kept'};
 let result:ReturnType<typeof compile>;try{result=compile(document);}catch(error){throw new Error(`Compile threw for unknown content: ${String(error)}`);}
 expect(span['vendor/x~y']).toEqual({payload:'kept'});expect(result.ok).toBe(false);
 if(!result.ok)expect(result.diagnostics.some(diagnostic=>diagnostic.path===`${base}/timeline/spans/0/vendor~1x~0y`)).toBe(true);
});
