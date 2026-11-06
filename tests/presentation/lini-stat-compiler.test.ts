// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';
import {utcCalendarDate,utcCalendarDay} from '../../src/presentation/calendar';

const sourcePath='fixtures/visual/forms/umf-ac-satisfied.json';
const sourceText=readFileSync(sourcePath,'utf8');
const source=readVisualDocument(sourceText,'json');
const visual=getVisual(source) as Visual;
const compile=(candidate:Document,backend:'graphviz'|'mermaid'|'lini'='lini')=>compilePresentation(candidate,{backend,theme:'presentation/1'});
const withVisual=(candidate:Visual):Document=>({...source,extensions:{...source.extensions,'umf.visual':candidate}} as Document);
const pointPath=(index:number,field?:'at'|'value')=>`/extensions/umf.visual/metric/series/0/points/${index}${field?'/'+field:''}`;

test('public stat compilation preserves all dated observations and maps original array pointers',()=>{
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(source),result=compile(source);
 expect(JSON.stringify(source)).toBe(before);
 expect(result.ok).toBe(true);if(!result.ok)return;
 expect(result.backend).toBe('lini');expect(result.nativeFormat).toBe('lini');
 expect(result.source).toContain('Satisfied acceptance criteria');
 expect(result.source).toContain("How many of umf's acceptance criteria are satisfied, and is that rising?");
 expect(result.source).toContain('Latest dated observation: 2026-10-23 · 180 criteria');
 expect(result.source).toContain('2026-10-23');expect(result.source).toContain('180');expect(result.source).toContain('criteria');
 expect(result.source).not.toContain('Target');expect(result.source).not.toContain('Baseline');expect(result.source).not.toContain('%');
 const points=visual.metric!.series[0]!.points;
 expect(points).toHaveLength(9);
 for(const[index,point]of points.entries()){
  const logicalId=JSON.stringify(['satisfied',index]),pointNativeId=`metric-stat-point-${index+1}`,markerNativeId=`metric-stat-marker-${index+1}`;
  expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(index),nativeId:pointNativeId,kind:'metric-value'});
  expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(index,'at'),nativeId:pointNativeId,kind:'metric-value'});
  expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(index,'value'),nativeId:pointNativeId,kind:'metric-value'});
  expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(index,'value'),nativeId:markerNativeId,kind:'metric-value'});
  expect(result.source).toContain(point.at!);expect(result.source).toContain(String(point.value));
 }
 for(const sourcePath of [
  '/extensions/umf.visual/metric/axis/kind','/extensions/umf.visual/metric/unit','/extensions/umf.visual/metric/good',
  '/extensions/umf.visual/metric/format/kind','/extensions/umf.visual/metric/format/decimals','/extensions/umf.visual/metric/series/0/id','/extensions/umf.visual/metric/series/0/label',
 ])expect(result.elementMap.some(element=>element.sourcePath===sourcePath)).toBe(true);
 for(const sourcePath of [pointPath(8,'at'),pointPath(8,'value')])expect(result.elementMap.some(element=>element.sourcePath===sourcePath&&element.nativeId==='metric-stat-latest'&&element.kind==='metric-value')).toBe(true);
 for(const sourcePath of ['/extensions/umf.visual/metric/unit','/extensions/umf.visual/metric/format/kind','/extensions/umf.visual/metric/format/decimals']) {
  const owners=result.elementMap.filter(element=>element.sourcePath===sourcePath).map(element=>element.nativeId);
  if(sourcePath.endsWith('/unit'))expect(owners).toContain('metric-stat-unit');
  expect(owners).toContain('metric-stat-latest');
  for(const index of points.keys())expect(owners).toContain(`metric-stat-point-${index+1}`);
  if(sourcePath.includes('/format/'))expect(owners.some(owner=>/^metric-stat-y-tick-\d+$/u.test(owner))).toBe(true);
 }
 expect(result.elementMap.some(element=>/metric\/(target|baseline|comparison)/.test(element.sourcePath))).toBe(false);
 expect(result.approximations.some(item=>item.representation.includes('exact UTC calendar-day offsets')&&item.representation.includes('do not assert measurements between')&&item.representation.includes('growth rates'))).toBe(true);
 expect(result.approximations.some(item=>item.representation.includes('greatest exact UTC date')&&item.representation.includes('dated observations'))).toBe(true);
});

test('chronological display chooses the latest authored date instead of the last source-array entry',()=>{
 const reversed=structuredClone(visual);reversed.metric!.series[0]!.points.reverse();
 const originalOrder=reversed.metric!.series[0]!.points.map(point=>point.at),result=compile(withVisual(reversed));
 expect(result.ok).toBe(true);if(!result.ok)return;
 expect(reversed.metric!.series[0]!.points.map(point=>point.at)).toEqual(originalOrder);
 expect(result.elementMap).toContainEqual({logicalId:'["satisfied",0]',sourcePath:pointPath(0,'at'),nativeId:'metric-stat-latest',kind:'metric-value'});
 expect(result.elementMap).toContainEqual({logicalId:'["satisfied",0]',sourcePath:pointPath(0,'value'),nativeId:'metric-stat-latest',kind:'metric-value'});
 expect(result.source).toContain('Latest dated observation: 2026-10-23 · 180 criteria');
 expect(result.source.indexOf('#metric-stat-marker-9|')).toBeLessThan(result.source.indexOf('#metric-stat-marker-1|'));
});

test('duplicate observations and tied latest dates retain each source index without selecting a winner',()=>{
 const candidate=structuredClone(visual),points=candidate.metric!.series[0]!.points;
 points.push({at:'2026-10-23',value:180},{at:'2026-10-23',value:200});
 const before=JSON.stringify(candidate),result=compile(withVisual(candidate));
 expect(result.ok).toBe(true);if(!result.ok)return;
 expect(JSON.stringify(candidate)).toBe(before);
 expect(result.source).toContain('Latest dated observations: 2026-10-23 · 180 criteria / 180 criteria / 200 criteria');
 for(const index of [8,9,10]){
  const logicalId=JSON.stringify(['satisfied',index]);
  expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(index),nativeId:`metric-stat-point-${index+1}`,kind:'metric-value'});
  expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(index,'at'),nativeId:`metric-stat-point-${index+1}`,kind:'metric-value'});
  expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(index,'value'),nativeId:`metric-stat-point-${index+1}`,kind:'metric-value'});
  expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(index,'value'),nativeId:'metric-stat-latest',kind:'metric-value'});
 }
});

test('stat projection locates invalid or absent dates and refuses other backends',()=>{
 const invalid=structuredClone(visual);invalid.metric!.series[0]!.points[0]!.at='2026-02-30';
 const invalidResult=compile(withVisual(invalid));expect(invalidResult.ok).toBe(false);if(!invalidResult.ok)expect(invalidResult.diagnostics).toContainEqual(expect.objectContaining({code:'VISUAL_DATE',path:pointPath(0,'at')}));
 const missing=structuredClone(visual);delete missing.metric!.series[0]!.points[0]!.at;
 const missingResult=compile(withVisual(missing));expect(missingResult.ok).toBe(false);if(!missingResult.ok)expect(missingResult.diagnostics).toContainEqual(expect.objectContaining({code:'VISUAL_VALUE',path:pointPath(0)}));
 for(const backend of ['graphviz','mermaid'] as const){
  const result=compile(source,backend);expect(result.ok).toBe(false);if(result.ok)continue;
  expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'PRESENTATION_BACKEND_SUBSET',path:'/extensions/umf.visual/form'}));
 }
});

test('calendar ticks use the authored year and real UTC dates rather than epoch ordinals',()=>{
 const result=compile(source);expect(result.ok).toBe(true);if(!result.ok)return;
 const labels=[...result.source.matchAll(/\|block#metric-stat-x-tick-label-\d+\| "([^"]+)"/gu)].map(match=>match[1]);
 expect(labels).toEqual(['10-02','10-07','10-12','10-17','10-22','10-23']);
 expect(result.source).toContain('Date (2026, UTC)');expect(result.source).not.toContain('1970');
});

test('a 12-day observation span emits only real integral UTC date ticks',()=>{
 const candidate=structuredClone(visual);candidate.metric!.series[0]!.points=[{at:'2026-10-01',value:1},{at:'2026-10-13',value:2}];
 const result=compile(withVisual(candidate));expect(result.ok).toBe(true);if(!result.ok)return;
 const labels=[...result.source.matchAll(/\|block#metric-stat-x-tick-label-\d+\| "([^"]+)"/gu)].map(match=>match[1]!);
 const days=labels.map(label=>utcCalendarDay(`2026-${label}`));
 const validDays=days.filter((day):day is number=>day!==undefined);
 expect(labels[0]).toBe('10-01');expect(labels.at(-1)).toBe('10-13');expect(validDays).toHaveLength(labels.length);
 expect(validDays).toEqual([...validDays].sort((a,b)=>a-b));
 for(const day of validDays)expect(utcCalendarDate(day)).toMatch(/^2026-10-\d{2}$/u);
 for(let index=1;index<validDays.length;index++)expect(Number.isInteger(validDays[index]!-validDays[index-1]!)).toBe(true);
});

test('absent number format preserves fractional source precision without inventing format mappings',()=>{
 const candidate=structuredClone(visual);delete candidate.metric!.format;
 candidate.metric!.series[0]!.points=[{at:'2026-10-02',value:1.25},{at:'2026-10-03',value:2.375}];
 const result=compile(withVisual(candidate));expect(result.ok).toBe(true);if(!result.ok)return;
 expect(result.source).toContain('2026-10-02 · 1.25 criteria');
 expect(result.source).toContain('2026-10-03 · 2.375 criteria');
 expect(result.source).toContain('Latest dated observation: 2026-10-03 · 2.375 criteria');
 expect(result.elementMap.some(element=>element.sourcePath==='/extensions/umf.visual/metric/format/kind'||element.sourcePath==='/extensions/umf.visual/metric/format/decimals')).toBe(false);
 expect(result.elementMap).toContainEqual(expect.objectContaining({sourcePath:'/extensions/umf.visual/metric/series/0/points/0/value',nativeId:'metric-stat-marker-1',kind:'metric-value'}));
 expect(result.elementMap).toContainEqual(expect.objectContaining({sourcePath:'/extensions/umf.visual/metric/series/0/points/1/value',nativeId:'metric-stat-marker-2',kind:'metric-value'}));
});

test('C1 and DEL in title, series label, or unit return a field-located refusal',()=>{
 const cases:[(visual:Visual)=>void,string][]=[
  [candidate=>{candidate.title='Title with DEL \u007f';},'/extensions/umf.visual/title'],
  [candidate=>{candidate.metric!.series[0]!.label='Series with DEL \u007f';},'/extensions/umf.visual/metric/series/0/label'],
  [candidate=>{candidate.metric!.unit='criteria\u007f';},'/extensions/umf.visual/metric/unit'],
  [candidate=>{candidate.title='Title with C1 \u0085';},'/extensions/umf.visual/title'],
  [candidate=>{candidate.metric!.series[0]!.label='Series with C1 \u0085';},'/extensions/umf.visual/metric/series/0/label'],
  [candidate=>{candidate.metric!.unit='criteria\u0085';},'/extensions/umf.visual/metric/unit'],
 ];
 for(const[mutate,expectedPath]of cases){
  const candidate=structuredClone(visual);mutate(candidate);
  const result=compile(withVisual(candidate));expect(result.ok).toBe(false);if(!result.ok)expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'PRESENTATION_LINI_STAT_TEXT',path:expectedPath}));
 }
});

test('optional takeaway and authored caveats are rendered and source-mapped instead of listed as omissions',()=>{
 const candidate=structuredClone(visual);candidate.takeaway='An authored historical summary.';candidate.omissions=['This time series does not establish why the values changed.'];
 const result=compile(withVisual(candidate));expect(result.ok).toBe(true);if(!result.ok)return;
 expect(result.source).toContain('An authored historical summary.');expect(result.source).toContain('This time series does not establish why the values changed.');
 expect(result.elementMap.filter(element=>element.sourcePath==='/extensions/umf.visual/takeaway')).toHaveLength(1);
 expect(result.elementMap).toContainEqual(expect.objectContaining({sourcePath:'/extensions/umf.visual/takeaway',nativeId:'metric-stat-takeaway'}));
 expect(result.elementMap).toContainEqual(expect.objectContaining({sourcePath:'/extensions/umf.visual/omissions/0',nativeId:'metric-stat-note-1'}));
 expect(result.omissions.some(item=>item.sourcePath==='/extensions/umf.visual/takeaway'||item.sourcePath==='/extensions/umf.visual/omissions/0')).toBe(false);
});
