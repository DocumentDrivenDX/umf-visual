// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';

const sourcePath='fixtures/visual/forms/umf-ac-coverage.json';
const sourceText=readFileSync(sourcePath,'utf8');
const source=readVisualDocument(sourceText,'json');
const visual=getVisual(source) as Visual;
const compile=(candidate:Document,backend:'graphviz'|'mermaid'|'lini'='lini')=>compilePresentation(candidate,{backend,theme:'presentation/1'});
const withVisual=(candidate:Visual):Document=>({...source,extensions:{...source.extensions,'umf.visual':candidate}} as Document);

test('public meter compilation preserves the authored metric and maps every visible declaration to its exact source pointer',()=>{
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(source),result=compile(source);
 expect(JSON.stringify(source)).toBe(before);
 expect(result.ok).toBe(true);if(!result.ok)return;
 expect(result.backend).toBe('lini');expect(result.nativeFormat).toBe('lini');
 expect(result.source).toContain('Acceptance criteria satisfied');
 expect(result.source).toContain('How far is umf from every acceptance criterion satisfied?');
 expect(result.source).toContain('criteria');expect(result.source).toContain('180');expect(result.source).toContain('837');
 expect(result.source).not.toContain('21%');
 const expected:[string,string,string][]=[
  ['metric-series','/extensions/umf.visual/metric/series/0/id','satisfied-now'],
  ['metric-series','/extensions/umf.visual/metric/series/0/label','satisfied-now'],
  ['metric-value','/extensions/umf.visual/metric/series/0/points/0/value','/metric/series/0/points/0/value'],
  ['metric-reference','/extensions/umf.visual/metric/target','837'],
 ];
 for(const[kind,sourcePath,logicalId]of expected)expect(result.elementMap).toContainEqual(expect.objectContaining({kind,sourcePath,logicalId}));
 for(const sourcePath of [
  '/extensions/umf.visual/metric/unit',
  '/extensions/umf.visual/metric/good',
  '/extensions/umf.visual/metric/format/kind',
  '/extensions/umf.visual/metric/format/decimals',
 ])expect(result.elementMap.some(element=>element.sourcePath===sourcePath)).toBe(true);
 expect(result.omissions.some(item=>item.sourcePath==='/extensions/umf.visual/source')).toBe(true);
 expect(result.omissions.some(item=>item.sourcePath==='/extensions/umf.visual/audience')).toBe(true);
 expect(result.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/metric'&&item.representation.includes('8% range padding'))).toBe(true);
});

test('meter projection refuses other backends and other metric forms with located diagnostics',()=>{
 for(const backend of ['graphviz','mermaid'] as const){
  const result=compile(source,backend);expect(result.ok).toBe(false);if(result.ok)continue;
  expect(result.diagnostics[0]?.code).toBe('PRESENTATION_BACKEND_SUBSET');
  expect(result.diagnostics[0]?.path).toBe('/extensions/umf.visual/form');
 }
 const other={...source,extensions:{...source.extensions,'umf.visual':{...visual,form:'stat'}}} as unknown as Document;
 const result=compile(other);expect(result.ok).toBe(false);if(result.ok)return;
 expect(result.diagnostics.some(diagnostic=>diagnostic.code==='PRESENTATION_FORM'&&diagnostic.path==='/extensions/umf.visual/form')).toBe(true);
});

test('optional takeaway, format, and reference owners exist exactly once in the public native source map',()=>{
 const richVisual=structuredClone(visual);
 richVisual.takeaway='The source reports the current value and target.';
 richVisual.metric!.baseline=0;
 richVisual.metric!.comparison={label:'Earlier reading',value:120};
 const result=compile(withVisual(richVisual));expect(result.ok).toBe(true);if(!result.ok)return;
 expect(result.source).toContain('The source reports the current value and target.');
 expect(result.source).toContain('Baseline 0');expect(result.source).toContain('Earlier reading 120');
 for(const nativeId of new Set(result.elementMap.map(element=>element.nativeId))){
  const declarations=result.source.match(new RegExp(`\\|[A-Za-z-]+#${nativeId}\\|`,'g'))??[];
  expect(declarations).toHaveLength(1);
 }
 for(const sourcePath of ['/extensions/umf.visual/metric/format/kind','/extensions/umf.visual/metric/format/decimals','/extensions/umf.visual/takeaway','/extensions/umf.visual/metric/baseline','/extensions/umf.visual/metric/comparison/label','/extensions/umf.visual/metric/comparison/value']){
  expect(result.elementMap.filter(element=>element.sourcePath===sourcePath)).toHaveLength(1);
 }
 expect(result.elementMap.find(element=>element.sourcePath==='/extensions/umf.visual/metric/format/kind')?.nativeId).toBe('metric-meter-axis');
 expect(result.elementMap.find(element=>element.sourcePath==='/extensions/umf.visual/metric/format/decimals')?.nativeId).toBe('metric-meter-axis');
});

test('unsupported emphasis and nonrepresentable finite ranges produce located failures instead of dropped or infinite output',()=>{
 const emphasizedVisual=structuredClone(visual);
 emphasizedVisual.metric!.series[0]!.emphasis='focus';
 const emphasisResult=compile(withVisual(emphasizedVisual));expect(emphasisResult.ok).toBe(false);if(!emphasisResult.ok)expect(emphasisResult.diagnostics).toContainEqual(expect.objectContaining({code:'PRESENTATION_LINI_METER_SCOPE',path:'/extensions/umf.visual/metric/series/0/emphasis'}));

 const extremeVisual=structuredClone(visual);
 extremeVisual.metric!.target=Number.MAX_VALUE;extremeVisual.metric!.series[0]!.points[0]!.value=-Number.MAX_VALUE;
 const extreme=withVisual(extremeVisual);
 const inspection=inspectVisual(extreme);expect(inspection.valid).toBe(false);
 expect(inspection.diagnostics).toContainEqual(expect.objectContaining({code:'NUMBER',path:'/extensions/umf.visual/metric/target'}));
 const extremeResult=compile(extreme);expect(extremeResult.ok).toBe(false);if(!extremeResult.ok){
  expect(extremeResult.diagnostics).toContainEqual(expect.objectContaining({path:'/extensions/umf.visual/metric/target'}));
  expect(JSON.stringify(extremeResult)).not.toMatch(/Infinity|NaN/);
 }
});

test('public meter text refusals point to the series label and unit that contain DEL',()=>{
 const invalidLabel=structuredClone(visual);invalidLabel.metric!.series[0]!.label='Satisfied \u007f now';
 const labelResult=compile(withVisual(invalidLabel));expect(labelResult.ok).toBe(false);if(!labelResult.ok)expect(labelResult.diagnostics).toContainEqual(expect.objectContaining({code:'PRESENTATION_LINI_METER_TEXT',path:'/extensions/umf.visual/metric/series/0/label'}));

 const invalidUnit=structuredClone(visual);invalidUnit.metric!.unit='criteria\u007f';
 const unitResult=compile(withVisual(invalidUnit));expect(unitResult.ok).toBe(false);if(!unitResult.ok)expect(unitResult.diagnostics).toContainEqual(expect.objectContaining({code:'PRESENTATION_LINI_METER_TEXT',path:'/extensions/umf.visual/metric/unit'}));
});
