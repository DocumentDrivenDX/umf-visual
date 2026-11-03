// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';
import {requiredPresentationChecks} from '../../scripts/presentation/verify';

const sourcePath='fixtures/visual/forms/umf-ac-trend.json';
const source=JSON.parse(readFileSync(sourcePath,'utf8')) as Document;
const visual=getVisual(source) as Visual;
const compile=(candidate:Document,backend:'graphviz'|'mermaid'|'lini'='lini')=>compilePresentation(candidate,{backend,theme:'presentation/1'});
const withVisual=(candidate:Visual):Document=>({...source,extensions:{...source.extensions,'umf.visual':candidate}} as Document);
const seriesPath=(index:number,field?:'id'|'label')=>`/extensions/umf.visual/metric/series/${index}${field?'/'+field:''}`;
const pointPath=(series:number,point:number,field?:'at'|'value')=>`/extensions/umf.visual/metric/series/${series}/points/${point}${field?'/'+field:''}`;
const pointId=(series:number,point:number)=>`metric-trend-point-s${series+1}-p${point+1}`;
const markerId=(series:number,point:number)=>`metric-trend-marker-s${series+1}-p${point+1}`;
const unionDays=(items:Visual)=>[...new Set(items.metric!.series.flatMap(series=>series.points.map(point=>point.at!)))].sort();
const dateRowId=(items:Visual,seriesIndex:number,pointIndex:number)=>{
 const series=items.metric!.series,day=series[seriesIndex]!.points[pointIndex]!.at!,days=unionDays(items),dayIndex=days.indexOf(day);
 const rowCount=(target:string)=>{const counts=series.map(item=>item.points.filter(point=>point.at===target).length),maximum=Math.max(...counts);return maximum>1?counts.reduce((sum,count)=>sum+count,0):maximum;};
 let precedingRows=0;for(const priorDay of days.slice(0,dayIndex))precedingRows+=rowCount(priorDay);
 const counts=series.map(item=>item.points.filter(point=>point.at===day).length),hasRepeats=Math.max(...counts)>1;
 const tieSlot=hasRepeats?series.slice(0,seriesIndex).reduce((sum,item)=>sum+item.points.filter(point=>point.at===day).length,0)+series[seriesIndex]!.points.slice(0,pointIndex).filter(point=>point.at===day).length:0;
 return`metric-trend-date-row-d${precedingRows+tieSlot+1}`;
};

test('public trend compiler preserves both dated series and maps each source-index point to its own marker/caption',()=>{
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(source),result=compile(source);expect(JSON.stringify(source)).toBe(before);
 expect(result.ok).toBe(true);if(!result.ok)return;
 expect(result.backend).toBe('lini');expect(result.nativeFormat).toBe('lini');
 expect(result.source).toContain('Acceptance criteria over time');expect(result.source).toContain('How have satisfied and untested criteria changed?');
 const series=visual.metric!.series;expect(series).toHaveLength(2);
 for(const[seriesIndex,item]of series.entries()){
  const nativeSeries=`metric-trend-series-s${seriesIndex+1}`;
  expect(result.elementMap).toContainEqual({logicalId:item.id,sourcePath:seriesPath(seriesIndex),nativeId:nativeSeries,kind:'metric-series'});
  expect(result.elementMap).toContainEqual({logicalId:item.id,sourcePath:seriesPath(seriesIndex,'id'),nativeId:nativeSeries,kind:'metric-series'});
  expect(result.elementMap).toContainEqual({logicalId:item.id,sourcePath:seriesPath(seriesIndex,'label'),nativeId:nativeSeries,kind:'metric-series'});
  expect(result.source).toContain(item.label);
  for(const[pointIndex,point]of item.points.entries()){
   const logicalId=JSON.stringify([item.id,pointIndex]),caption=pointId(seriesIndex,pointIndex),marker=markerId(seriesIndex,pointIndex);
   expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(seriesIndex,pointIndex),nativeId:caption,kind:'metric-value'});
   expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(seriesIndex,pointIndex,'at'),nativeId:dateRowId(visual,seriesIndex,pointIndex),kind:'metric-value'});
   expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(seriesIndex,pointIndex,'value'),nativeId:caption,kind:'metric-value'});
   expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(seriesIndex,pointIndex),nativeId:marker,kind:'metric-value'});
   expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(seriesIndex,pointIndex,'value'),nativeId:marker,kind:'metric-value'});
   expect(result.source).toContain(point.at!);expect(result.source).toContain(String(point.value));
  }
 }
 expect(result.source).not.toMatch(/\b(total|combined)\b/iu);
 expect(result.elementMap.some(element=>/metric\/(target|baseline|comparison)/u.test(element.sourcePath))).toBe(false);
 expect(result.approximations.some(item=>item.representation.includes('exact UTC')&&item.representation.includes('intermediate'))).toBe(true);
});

test('point and series reordering preserves original array pointers while displaying dates chronologically',()=>{
 const candidate=structuredClone(visual);candidate.metric!.series.reverse();for(const item of candidate.metric!.series)item.points.reverse();
 const before=JSON.stringify(candidate),result=compile(withVisual(candidate));expect(JSON.stringify(candidate)).toBe(before);
 expect(result.ok).toBe(true);if(!result.ok)return;
 for(const[seriesIndex,item]of candidate.metric!.series.entries())for(const[pointIndex,point]of item.points.entries()){
  const logicalId=JSON.stringify([item.id,pointIndex]);
  expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(seriesIndex,pointIndex),nativeId:pointId(seriesIndex,pointIndex),kind:'metric-value'});
  expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(seriesIndex,pointIndex,'at'),nativeId:dateRowId(candidate,seriesIndex,pointIndex),kind:'metric-value'});
  expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(seriesIndex,pointIndex,'value'),nativeId:markerId(seriesIndex,pointIndex),kind:'metric-value'});
 }
 const sourceDateOrder=candidate.metric!.series[0]!.points.map(point=>point.at!);
 expect(sourceDateOrder).toEqual([...sourceDateOrder].sort((a,b)=>b.localeCompare(a)));
 expect(result.source.indexOf('2026-10-02')).toBeLessThan(result.source.indexOf('2026-10-23'));
});

test('different per-series date sets use the common calendar axis without zipping by point index',()=>{
 const candidate=structuredClone(visual);candidate.metric!.series[1]!.points[1]!.at='2026-10-05';
 const result=compile(withVisual(candidate));expect(result.ok).toBe(true);if(!result.ok)return;
 expect(result.source).toContain('2026-10-05');
 expect(result.elementMap).toContainEqual({logicalId:JSON.stringify(['untested',1]),sourcePath:pointPath(1,1,'at'),nativeId:dateRowId(candidate,1,1),kind:'metric-value'});
 expect(result.elementMap).not.toContainEqual(expect.objectContaining({sourcePath:pointPath(0,1,'at'),nativeId:dateRowId(candidate,1,1)}));
 expect(result.approximations.some(item=>item.representation.includes('UTC'))).toBe(true);
});

test('trend profile refuses other backends and locates invalid dates',()=>{
 for(const backend of ['graphviz','mermaid'] as const){const result=compile(source,backend);expect(result.ok).toBe(false);if(!result.ok)expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'PRESENTATION_BACKEND_SUBSET',path:'/extensions/umf.visual/form'}));}
 const invalid=structuredClone(visual);invalid.metric!.series[0]!.points[0]!.at='2026-02-30';
 const invalidResult=compile(withVisual(invalid));expect(invalidResult.ok).toBe(false);if(!invalidResult.ok)expect(invalidResult.diagnostics).toContainEqual(expect.objectContaining({path:pointPath(0,0,'at')}));
});

test('repeated dates remain separate stable source-indexed observations without an intra-day guide',()=>{
 const candidate=structuredClone(visual);candidate.metric!.series[0]!.points[1]!.at=candidate.metric!.series[0]!.points[0]!.at;
 const before=JSON.stringify(candidate),result=compile(withVisual(candidate));expect(JSON.stringify(candidate)).toBe(before);expect(result.ok).toBe(true);if(!result.ok)return;
 expect(result.elementMap).toContainEqual({logicalId:JSON.stringify(['satisfied-trend',0]),sourcePath:pointPath(0,0),nativeId:pointId(0,0),kind:'metric-value'});
 expect(result.elementMap).toContainEqual({logicalId:JSON.stringify(['satisfied-trend',1]),sourcePath:pointPath(0,1),nativeId:pointId(0,1),kind:'metric-value'});
 expect(result.elementMap).toContainEqual({logicalId:JSON.stringify(['satisfied-trend',0]),sourcePath:pointPath(0,0,'at'),nativeId:dateRowId(candidate,0,0),kind:'metric-value'});
 expect(result.elementMap).toContainEqual({logicalId:JSON.stringify(['satisfied-trend',1]),sourcePath:pointPath(0,1,'at'),nativeId:dateRowId(candidate,0,1),kind:'metric-value'});
 expect(result.elementMap).toContainEqual({logicalId:JSON.stringify(['untested',0]),sourcePath:pointPath(1,0,'at'),nativeId:dateRowId(candidate,1,0),kind:'metric-value'});
 expect(dateRowId(candidate,0,0)).not.toBe(dateRowId(candidate,0,1));
 expect(dateRowId(candidate,0,1)).not.toBe(dateRowId(candidate,1,0));
 expect(result.source).not.toContain('|line#metric-trend-guide-s1-p1|');
 expect(result.source).toContain(String(candidate.metric!.series[0]!.points[0]!.value));expect(result.source).toContain(String(candidate.metric!.series[0]!.points[1]!.value));
});

test('public singleton line remains a located core form refusal',()=>{
 const candidate=structuredClone(visual);candidate.metric!.series=[{...candidate.metric!.series[0]!,points:[candidate.metric!.series[0]!.points[0]!]}];
 const result=compile(withVisual(candidate));expect(result.ok).toBe(false);if(!result.ok)expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'VISUAL_FORM_RULE',path:'/extensions/umf.visual/metric/series/0/points'}));
});

test('public line profile accepts one series with multiple authored dates',()=>{
 const candidate=structuredClone(visual);candidate.metric!.series=[{...candidate.metric!.series[0]!,points:candidate.metric!.series[0]!.points.slice(0,2)}];
 const result=compile(withVisual(candidate));expect(result.ok).toBe(true);if(!result.ok)return;
 expect(result.elementMap).toContainEqual({logicalId:JSON.stringify(['satisfied-trend',0]),sourcePath:pointPath(0,0),nativeId:pointId(0,0),kind:'metric-value'});
 expect(result.elementMap).toContainEqual({logicalId:JSON.stringify(['satisfied-trend',1]),sourcePath:pointPath(0,1),nativeId:pointId(0,1),kind:'metric-value'});
 expect(result.source).toContain('|line#metric-trend-guide-s1-p1|');
});

test('multiple observations on one date keep distinct rows and use renderer-only axis padding',()=>{
 const candidate=structuredClone(visual);candidate.metric!.series=[{...candidate.metric!.series[0]!,points:candidate.metric!.series[0]!.points.slice(0,2)}];candidate.metric!.series[0]!.points[1]!.at=candidate.metric!.series[0]!.points[0]!.at;
 const result=compile(withVisual(candidate));expect(result.ok).toBe(true);if(!result.ok)return;
 expect(result.elementMap).toContainEqual({logicalId:JSON.stringify(['satisfied-trend',0]),sourcePath:pointPath(0,0,'at'),nativeId:'metric-trend-date-row-d1',kind:'metric-value'});
 expect(result.elementMap).toContainEqual({logicalId:JSON.stringify(['satisfied-trend',1]),sourcePath:pointPath(0,1,'at'),nativeId:'metric-trend-date-row-d2',kind:'metric-value'});
 expect(result.approximations.some(item=>item.representation.includes('single-date domain receives renderer-only one-day padding'))).toBe(true);expect(result.source).not.toMatch(/\|line#metric-trend-guide-/u);
});

test('review verification requires the trend-specific native ownership and geometry proof',()=>{
 expect(requiredPresentationChecks('lini',visual)).toContain('lini-trend-series-and-date-value-geometry');
 expect(requiredPresentationChecks('lini',visual)).toContain('lini-native-ast');
 expect(requiredPresentationChecks('lini',visual)).not.toContain('lini-connection-endpoints');
});
