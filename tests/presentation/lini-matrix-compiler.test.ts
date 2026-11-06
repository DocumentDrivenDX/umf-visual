// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,it} from 'bun:test';
import {createHash} from 'node:crypto';
import {createVisualDocument,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';

const visual=(overrides:Partial<Visual>={}):Visual=>({
 id:'options',kind:'comparison',form:'matrix',title:'Options',question:'Which option fits?',
 comparison:{
  items:[{id:'first',label:'First option'},{id:'second',label:'Second option'},{id:'third',label:'Third option'}],
  criteria:[{id:'effort',label:'Effort',measure:'text'},{id:'support',label:'Support',measure:'support'}],
  values:[
   {item:'first',criterion:'effort',text:'Low'},{item:'second',criterion:'effort',text:'Medium'},{item:'third',criterion:'effort',text:'High'},
   {item:'first',criterion:'support',support:'partial'},{item:'second',criterion:'support',support:'yes'},{item:'third',criterion:'support',support:'no'},
  ],chosen:{item:'second',reason:'Best fit for the stated constraints.'},
 },...overrides,
});
const doc=(payload:Visual)=>createVisualDocument(payload,'test:'+payload.id,'1.4.0');

describe('Lini comparison matrix compiler',()=>{
 it('keeps the existing before/after native source and map byte-identical',async()=>{
  const source=readVisualDocument(await Bun.file('fixtures/visual/forms/visuals-before-after.json').text(),'json'),result=compilePresentation(source,{backend:'lini',theme:'presentation/1'});
  expect(result.ok).toBe(true);if(!result.ok)return;
  const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
  expect(hash(result.source)).toBe('5441d1175de1f5e9ef7ded27f087a60d027ac786597c1a070d7c00be19e6c604');
  expect(hash(JSON.stringify(result.elementMap))).toBe('ff42783330125d110d3efbda75f2b9cc2377234e3f939ea9648e0c5b71114e2b');
 });

 it('preserves generic item/criterion order, typed values, choice, source paths, and input bytes',()=>{
  const source=doc(visual()),before=JSON.stringify(source),result=compilePresentation(source,{backend:'lini',theme:'presentation/1'});
  expect(result.ok).toBe(true);if(!result.ok)return;
  expect(JSON.stringify(source)).toBe(before);
  expect(result.source).toContain('|table#comparison-table| { columns: 300, 420, 420, 420; }');
  expect(result.source.indexOf('|cell#comparison-item-1|')).toBeLessThan(result.source.indexOf('|cell#comparison-item-2|'));
  expect(result.source.indexOf('|cell#comparison-item-2|')).toBeLessThan(result.source.indexOf('|cell#comparison-item-3|'));
  expect(result.source.indexOf('|cell#comparison-criterion-1|')).toBeLessThan(result.source.indexOf('|cell#comparison-criterion-2|'));
  for(const value of ['Low','Medium','High','partial','yes','no','Selected: Second option','Reason: Best fit for the stated constraints.'])expect(result.source).toContain(value);
  expect(result.elementMap).toContainEqual({logicalId:'["second","effort"]',sourcePath:'/extensions/umf.visual/comparison/values/1/text',nativeId:'comparison-cell-r2-c3',kind:'comparison-value'});
  expect(result.elementMap).toContainEqual({logicalId:'["third","support"]',sourcePath:'/extensions/umf.visual/comparison/values/5/support',nativeId:'comparison-cell-r3-c4',kind:'comparison-value'});
  expect(result.elementMap).toContainEqual({logicalId:'second',sourcePath:'/extensions/umf.visual/comparison/chosen/item',nativeId:'comparison-choice',kind:'comparison-choice'});
  expect(result.elementMap).toContainEqual({logicalId:'second',sourcePath:'/extensions/umf.visual/comparison/chosen/reason',nativeId:'comparison-choice',kind:'comparison-choice'});
  expect(result.approximations.find(item=>item.sourcePath==='/extensions/umf.visual/comparison')?.representation).toContain('No ranking, score normalization, winner');
 });

 it('wraps long cell content without flattening authored paragraph breaks and keeps pointers exact',()=>{
  const input=visual(),matrix=input.comparison!;matrix.values[0]!.text='First authored line\n\nSecond paragraph with enough words to wrap inside the cell without changing the source.';
  const before=JSON.stringify(input),result=compilePresentation(doc(input),{backend:'lini'});
  expect(result.ok).toBe(true);if(!result.ok)return;
  expect(JSON.stringify(input)).toBe(before);
  expect(result.source).toContain(String.raw`First authored line\n\nSecond paragraph`);
  expect(result.elementMap).toContainEqual({logicalId:'["first","effort"]',sourcePath:'/extensions/umf.visual/comparison/values/0/text',nativeId:'comparison-cell-r2-c2',kind:'comparison-value'});
 });

 it('qualifies only the complete typed matrix subset and keeps other backends explicit',()=>{
  const rating=visual();rating.comparison!.criteria[0]!.measure='rating';rating.comparison!.criteria[0]!.max=5;rating.comparison!.values=rating.comparison!.values.map(value=>value.criterion==='effort'?{item:value.item,criterion:value.criterion,rating:value.item==='first'?3:value.item==='second'?4:2}:value);
  const ratingPlan=compilePresentation(doc(rating),{backend:'lini'});expect(ratingPlan.ok).toBe(true);if(ratingPlan.ok)expect(ratingPlan.elementMap).toContainEqual({logicalId:'["first","effort"]',sourcePath:'/extensions/umf.visual/comparison/values/0/rating',nativeId:'comparison-cell-r2-c2',kind:'comparison-value'});
  const graphviz=compilePresentation(doc(visual()),{backend:'graphviz'});expect(graphviz.ok).toBe(false);if(!graphviz.ok)expect(graphviz.diagnostics[0]?.code).toBe('PRESENTATION_BACKEND_SUBSET');
 });

 it('keeps renamed items and a different number of columns source-ordered',()=>{
  const input=visual();input.comparison!.items=[{id:'redwood',label:'Redwood'},{id:'granite',label:'Granite'}];input.comparison!.values=input.comparison!.criteria.flatMap(criterion=>input.comparison!.items.map(item=>({item:item.id,criterion:criterion.id,...(criterion.measure==='text'?{text:item.id+' '+criterion.id}:{support:'partial' as const})})));input.comparison!.chosen={item:'granite',reason:'Authored selection.'};
  const result=compilePresentation(doc(input),{backend:'lini'});expect(result.ok).toBe(true);if(!result.ok)return;
  expect(result.source).toContain('columns: 300, 420, 420;');expect(result.source.indexOf('|cell#comparison-item-1|')).toBeLessThan(result.source.indexOf('|cell#comparison-item-2|'));
  expect(result.elementMap.filter(item=>item.kind==='comparison-item'&&item.sourcePath.endsWith('/label')).map(item=>item.logicalId)).toEqual(['redwood','granite']);
 });

 it('shows stable IDs when duplicate labels would hide item, criterion, or choice identity',()=>{
  const input=visual(),comparison=input.comparison!;comparison.items[0]!.label='Shared label';comparison.items[1]!.label='Shared label';comparison.items[0]!.detail='Item context';comparison.criteria[0]!.label='Shared criterion';comparison.criteria[1]!.label='Shared criterion';comparison.criteria[0]!.low='Lower anchor';comparison.criteria[0]!.high='Upper anchor';comparison.values[0]!.note='Value context';comparison.chosen={item:'second',reason:'Chosen by its authored identity.'};
  const result=compilePresentation(doc(input),{backend:'lini'});expect(result.ok).toBe(true);if(!result.ok)return;
  expect(result.source).toContain('Shared label (id: first)');expect(result.source).toContain('Shared label (id: second)');expect(result.source).toContain('Shared criterion (id: effort)');expect(result.source).toContain('Shared criterion (id: support)');
  expect(result.source).toContain('Selected: Shared label (id: second)');
  expect(result.source).toContain('Item detail (Shared label (id: first)): Item context');expect(result.source).toContain('Low (Shared criterion (id: effort)): Lower anchor');expect(result.source).toContain('High (Shared criterion (id: effort)): Upper anchor');expect(result.source).toContain('Note (Shared criterion (id: effort) · Shared label (id: first)): Value context');
 });
});
