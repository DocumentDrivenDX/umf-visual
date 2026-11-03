// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';

const sourcePath='fixtures/visual/forms/umf-ac-status.json';
const source=JSON.parse(readFileSync(sourcePath,'utf8')) as Document;
const visual=getVisual(source) as Visual;
const compile=(candidate:Document,backend:'graphviz'|'mermaid'|'lini'='lini')=>compilePresentation(candidate,{backend,theme:'presentation/1'});
const withVisual=(candidate:Visual):Document=>({...source,extensions:{...source.extensions,'umf.visual':candidate}} as Document);
const categoryPath=(index:number,field:'id'|'label')=>`/extensions/umf.visual/metric/axis/categories/${index}/${field}`;
const pointPath=(index:number,field?:'at'|'value')=>`/extensions/umf.visual/metric/series/0/points/${index}${field?'/'+field:''}`;

test('public bar compiler maps authored category labels and metric values to distinct source-backed slots',()=>{
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(source),result=compile(source);expect(JSON.stringify(source)).toBe(before);
 expect(result.ok).toBe(true);if(!result.ok)return;
 expect(result.backend).toBe('lini');expect(result.nativeFormat).toBe('lini');
 expect(result.source).toContain('Acceptance criteria by status');expect(result.source).toContain("Where do umf's acceptance criteria stand?");
 const categories=visual.metric!.axis!.kind==='category'?visual.metric!.axis!.categories:[];
 const points=visual.metric!.series[0]!.points;
 expect(categories).toHaveLength(5);expect(points).toHaveLength(5);
 for(const[index,category]of categories.entries()){
  const nativeId=`chart#metric-bar-chart/categories[${index}]`;
  expect(result.source).toContain(category.label);expect(result.elementMap).toContainEqual({logicalId:category.id,sourcePath:categoryPath(index,'id'),nativeId,kind:'metric-reference'});
  expect(result.elementMap).toContainEqual({logicalId:category.id,sourcePath:categoryPath(index,'label'),nativeId,kind:'metric-reference'});
 }
 const categoryPositions=categories.map(category=>result.source.indexOf(category.label));
 expect(categoryPositions.every(position=>position>=0)).toBe(true);expect(categoryPositions).toEqual([...categoryPositions].sort((a,b)=>a-b));
 expect(result.elementMap).toContainEqual({logicalId:'criteria',sourcePath:'/extensions/umf.visual/metric/series/0/id',nativeId:'bars#metric-bar-series',kind:'metric-series'});
 expect(result.elementMap).toContainEqual({logicalId:'criteria',sourcePath:'/extensions/umf.visual/metric/series/0/label',nativeId:'bars#metric-bar-series',kind:'metric-series'});
 expect(result.elementMap).toContainEqual(expect.objectContaining({sourcePath:'/extensions/umf.visual/metric/unit',nativeId:'axis#metric-bar-axis/unit'}));
 for(const[index,point]of points.entries()){
  const categoryIndex=categories.findIndex(category=>category.id===point.at),logicalId=`/metric/series/0/points/${index}`;
  expect(categoryIndex).toBeGreaterThanOrEqual(0);expect(result.source).toContain(String(point.value));
  expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(index),nativeId:`bars#metric-bar-series/data[${categoryIndex}]`,kind:'metric-value'});
  expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(index,'at'),nativeId:`chart#metric-bar-chart/categories[${categoryIndex}]`,kind:'metric-value'});
  expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(index,'value'),nativeId:`bars#metric-bar-series/data[${categoryIndex}]`,kind:'metric-value'});
 }
 expect(result.elementMap.some(element=>/metric\/(good|target|baseline|comparison)/u.test(element.sourcePath))).toBe(false);
 expect(visual.metric).not.toHaveProperty('good');expect(visual.metric).not.toHaveProperty('target');expect(visual.metric).not.toHaveProperty('baseline');expect(visual.metric).not.toHaveProperty('comparison');
 expect(result.source).not.toContain('Better:');
});

test('bar ordering follows category declarations while shuffled point maps retain original source indexes',()=>{
 const candidate=structuredClone(visual),points=candidate.metric!.series[0]!.points;
 points.reverse();const before=JSON.stringify(candidate),result=compile(withVisual(candidate));
 expect(JSON.stringify(candidate)).toBe(before);expect(result.ok).toBe(true);if(!result.ok)return;
 const categories=candidate.metric!.axis!.kind==='category'?candidate.metric!.axis!.categories:[];
 const expected=categories.map((category,index)=>({category:category.label,value:candidate.metric!.series[0]!.points.find(point=>point.at===category.id)!.value,slot:index+1}));
 for(const item of expected){expect(result.source.indexOf(item.category)).toBeGreaterThanOrEqual(0);expect(result.source).toContain(String(item.value));}
 for(const[index,point]of points.entries()){
  const categoryIndex=categories.findIndex(category=>category.id===point.at),logicalId=`/metric/series/0/points/${index}`;
  expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(index),nativeId:`bars#metric-bar-series/data[${categoryIndex}]`,kind:'metric-value'});
  expect(result.elementMap).toContainEqual({logicalId,sourcePath:pointPath(index,'at'),nativeId:`chart#metric-bar-chart/categories[${categoryIndex}]`,kind:'metric-value'});
 }
 expect(expected.map(item=>item.category)).toEqual(categories.map(category=>category.label));
});

test('bar profile refuses other backends and malformed category-to-point relations without default values',()=>{
 for(const backend of ['graphviz','mermaid'] as const){const result=compile(source,backend);expect(result.ok).toBe(false);if(!result.ok)expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'PRESENTATION_BACKEND_SUBSET',path:'/extensions/umf.visual/form'}));}
 const unknown=structuredClone(visual);unknown.metric!.series[0]!.points[0]!.at='not-declared';
 const unknownResult=compile(withVisual(unknown));expect(unknownResult.ok).toBe(false);if(!unknownResult.ok)expect(unknownResult.diagnostics.some(diagnostic=>diagnostic.path===pointPath(0,'at'))).toBe(true);
 const missing=structuredClone(visual);missing.metric!.series[0]!.points.pop();
 const missingResult=compile(withVisual(missing));expect(missingResult.ok).toBe(false);if(!missingResult.ok)expect(missingResult.diagnostics.some(diagnostic=>diagnostic.path===pointPath(4)||diagnostic.path==='/extensions/umf.visual/metric/series/0/points')).toBe(true);
 const duplicate=structuredClone(visual);duplicate.metric!.series[0]!.points[1]!.at=duplicate.metric!.series[0]!.points[0]!.at;
 const duplicateResult=compile(withVisual(duplicate));expect(duplicateResult.ok).toBe(false);if(!duplicateResult.ok)expect(duplicateResult.diagnostics.some(diagnostic=>diagnostic.path.startsWith('/extensions/umf.visual/metric/series/0/points'))).toBe(true);
});

test('absent format and number format without decimals preserve fractional values without fabricated decimals',()=>{
 for(const format of [undefined,{kind:'number' as const}]){
  const candidate=structuredClone(visual);if(format===undefined)delete candidate.metric!.format;else candidate.metric!.format=format;
  candidate.metric!.series[0]!.points=[{at:'satisfied',value:180.25},{at:'untested',value:407.375},{at:'uncited-coverage',value:233.5},{at:'asserted-unbacked',value:0},{at:'reviewed-exception',value:17.125}];
  const result=compile(withVisual(candidate));expect(result.ok).toBe(true);if(!result.ok)continue;
  expect(result.source).toContain('data: 180.25, 407.375, 233.5, 0, 17.125;');
  expect(result.source).toContain('labels: "180.25", "407.375", "233.5", "0", "17.125";');
  expect(result.elementMap.some(element=>element.sourcePath==='/extensions/umf.visual/metric/format/decimals')).toBe(false);
  expect(result.elementMap.some(element=>element.sourcePath==='/extensions/umf.visual/metric/format/kind')).toBe(format!==undefined);
 }
});

test('explicit zero-decimal format rounds labels but leaves raw bar data unchanged',()=>{
 const candidate=structuredClone(visual);candidate.metric!.format={kind:'number',decimals:0};
 candidate.metric!.series[0]!.points=[{at:'satisfied',value:180.25},{at:'untested',value:407.375},{at:'uncited-coverage',value:233.5},{at:'asserted-unbacked',value:0},{at:'reviewed-exception',value:17.125}];
 const result=compile(withVisual(candidate));expect(result.ok).toBe(true);if(!result.ok)return;
 expect(result.source).toContain('data: 180.25, 407.375, 233.5, 0, 17.125;');expect(result.source).toContain('labels: "180", "407", "234", "0", "17";');
 expect(result.elementMap).toContainEqual(expect.objectContaining({sourcePath:'/extensions/umf.visual/metric/format/decimals',nativeId:'axis#metric-bar-axis/format'}));
});

test('bar text errors identify their authored unit, category, and series fields',()=>{
 const cases:[(candidate:Visual)=>void,string][]=[
  [candidate=>{candidate.metric!.unit='criteria\u007f';},'/extensions/umf.visual/metric/unit'],
  [candidate=>{const axis=candidate.metric!.axis;if(axis?.kind==='category')axis.categories[1]!.label='Untested\u0085';},'/extensions/umf.visual/metric/axis/categories/1/label'],
  [candidate=>{candidate.metric!.series[0]!.label='Criteria\u007f';},'/extensions/umf.visual/metric/series/0/label'],
 ];
 for(const[mutate,path]of cases){const candidate=structuredClone(visual);mutate(candidate);const result=compile(withVisual(candidate));expect(result.ok).toBe(false);if(!result.ok)expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'PRESENTATION_LINI_BAR_TEXT',path}));}
});

test('rendered question, takeaway, and authored caveats have owners rather than omission claims',()=>{
 const candidate=structuredClone(visual);candidate.takeaway='Values are historical observations from the authored source.';candidate.omissions=['The source does not establish an aggregate or current ledger status.'];
 const result=compile(withVisual(candidate));expect(result.ok).toBe(true);if(!result.ok)return;
 expect(result.source).toContain(candidate.question);expect(result.source).toContain(candidate.takeaway);expect(result.source).toContain(candidate.omissions[0]!);
 expect(result.elementMap).toContainEqual(expect.objectContaining({sourcePath:'/extensions/umf.visual/question',nativeId:'metric-bar-question'}));
 expect(result.elementMap).toContainEqual(expect.objectContaining({sourcePath:'/extensions/umf.visual/takeaway',nativeId:'metric-bar-takeaway'}));
 expect(result.elementMap).toContainEqual(expect.objectContaining({sourcePath:'/extensions/umf.visual/omissions/0',nativeId:'metric-bar-note-1'}));
 expect(result.omissions.some(item=>item.sourcePath==='/extensions/umf.visual/question'||item.sourcePath==='/extensions/umf.visual/takeaway'||item.sourcePath==='/extensions/umf.visual/omissions/0')).toBe(false);
});
