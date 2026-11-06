// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import type {Document} from '@umf/core';
import {createVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';

function quadrant(overrides:Partial<Visual>={}):Visual{
 return {
  id:'rating-plane',kind:'comparison',form:'quadrant',title:'Authored rating plane',question:'Which option is shown?',takeaway:'The source author prefers the first option.',audience:'developer',
  source:{path:'example:source.md',view:'rating rationale',digest:'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'},
  omissions:['Ratings are author judgments, not measurements.'],
  comparison:{
   items:[{id:'ab',label:'First option',detail:'An authored item detail'},{id:'a',label:'Second option'}],
   criteria:[
    {id:'bc',label:'Vertical control',detail:'Vertical criterion detail',measure:'rating',max:8,low:'Less control',high:'More control'},
    {id:'c',label:'Horizontal runtime',measure:'rating',max:5,low:'More setup',high:'Runs locally'},
   ],
   values:[
    {item:'a',criterion:'bc',rating:8},
    {item:'ab',criterion:'c',rating:0,note:'Boundary note'},
    {item:'ab',criterion:'bc',rating:0},
    {item:'a',criterion:'c',rating:5},
   ],
   axes:{x:'c',y:'bc'},
   chosen:{item:'ab',reason:'The source author values direct control.'},
  },
  ...overrides,
 };
}
const doc=(visual:Visual,version:'1.0.0'|'1.4.0'='1.0.0'):Document=>createVisualDocument(visual,'visual:'+visual.id,version);
const compile=(visual:Visual,version:'1.0.0'|'1.4.0'='1.0.0')=>compilePresentation(doc(visual,version),{backend:'lini',theme:'presentation/1'});

test('quadrant compiler preserves authored axes, point coordinates, source pointers, metadata, choice, and caveat',()=>{
 const visual=quadrant(),document=doc(visual),before=JSON.stringify(document),result=compilePresentation(document,{backend:'lini',theme:'presentation/1'});
 expect(JSON.stringify(document)).toBe(before);
 expect(result.ok).toBe(true);if(!result.ok)return;
 expect(result.backend).toBe('lini');expect(result.nativeFormat).toBe('lini');
 expect(result.source).toContain('|axis#quadrant-x-axis| "Horizontal runtime" { range: 0 5;');
 expect(result.source).toContain('|axis#quadrant-y-axis| "Vertical control" { range: 0 8;');
 expect(result.source).toContain('ticks: 0, 5;');expect(result.source).toContain('ticks: 0, 8;');
 expect(result.source).toContain('|mark#quadrant-item-1| "First option (0, 0)');
 expect(result.source).toContain('at: 0 0; axis: quadrant-y-axis;');
 expect(result.source).toContain('|mark#quadrant-item-2| "Second option (5, 8)');
 expect(result.source).toContain('at: 5 8; axis: quadrant-y-axis;');
 expect(result.source).toContain('Horizontal runtime rating: 0 = low — More setup; 5 = high — Runs locally');
 expect(result.source).toContain('Vertical control rating: 0 = low — Less control; 8 = high — More control');
 expect(result.source).toContain('An authored item detail');expect(result.source).toContain('Boundary note');
 expect(result.source).toContain('Authored choice: First option — The source author values direct control.');
 expect(result.source).toContain('Ratings are author judgments, not measurements.');
 expect(result.elementMap).toContainEqual({logicalId:'rating-plane',sourcePath:'/extensions/umf.visual/title',nativeId:'quadrant-chart',kind:'visual'});
 expect(result.elementMap).toContainEqual({logicalId:'rating-plane',sourcePath:'/extensions/umf.visual/question',nativeId:'quadrant-question',kind:'visual'});
 expect(result.elementMap).toContainEqual({logicalId:'c',sourcePath:'/extensions/umf.visual/comparison/axes/x',nativeId:'quadrant-x-axis',kind:'comparison-criterion'});
 expect(result.elementMap).toContainEqual({logicalId:'bc',sourcePath:'/extensions/umf.visual/comparison/axes/y',nativeId:'quadrant-y-axis',kind:'comparison-criterion'});
 expect(result.elementMap).toContainEqual({logicalId:'ab',sourcePath:'/extensions/umf.visual/comparison/items/0/id',nativeId:'quadrant-item-1',kind:'comparison-item'});
 expect(result.elementMap).toContainEqual({logicalId:'["ab","c"]',sourcePath:'/extensions/umf.visual/comparison/values/1/rating',nativeId:'quadrant-item-1',kind:'comparison-value'});
 expect(result.elementMap).toContainEqual({logicalId:'["ab","bc"]',sourcePath:'/extensions/umf.visual/comparison/values/2/rating',nativeId:'quadrant-item-1',kind:'comparison-value'});
 expect(result.elementMap).toContainEqual({logicalId:'["a","bc"]',sourcePath:'/extensions/umf.visual/comparison/values/0/rating',nativeId:'quadrant-item-2',kind:'comparison-value'});
 expect(result.elementMap).toContainEqual({logicalId:'["a","c"]',sourcePath:'/extensions/umf.visual/comparison/values/3/rating',nativeId:'quadrant-item-2',kind:'comparison-value'});
 expect(result.elementMap).toContainEqual({logicalId:'["ab","c"]',sourcePath:'/extensions/umf.visual/comparison/values/1/note',nativeId:'quadrant-item-1',kind:'comparison-value'});
 expect(result.elementMap.filter(element=>element.sourcePath==='/extensions/umf.visual/comparison/criteria/0/measure')).toEqual([
  {logicalId:'bc',sourcePath:'/extensions/umf.visual/comparison/criteria/0/measure',nativeId:'quadrant-y-anchors',kind:'comparison-criterion'},
 ]);
 expect(result.elementMap).toContainEqual({logicalId:'bc',sourcePath:'/extensions/umf.visual/comparison/criteria/0/measure',nativeId:'quadrant-y-anchors',kind:'comparison-criterion'});
 expect(result.elementMap).toContainEqual({logicalId:'rating-plane',sourcePath:'/extensions/umf.visual/takeaway',nativeId:'quadrant-takeaway',kind:'visual'});
 expect(result.elementMap).toContainEqual({logicalId:'ab',sourcePath:'/extensions/umf.visual/comparison/chosen/item',nativeId:'quadrant-choice',kind:'comparison-choice'});
 expect(result.elementMap).toContainEqual({logicalId:'ab',sourcePath:'/extensions/umf.visual/comparison/chosen/reason',nativeId:'quadrant-choice',kind:'comparison-choice'});
 expect(result.elementMap).toContainEqual({logicalId:'rating-plane',sourcePath:'/extensions/umf.visual/omissions/0',nativeId:'quadrant-caveat-1',kind:'annotation'});
 expect(result.omissions).toContainEqual({sourcePath:'/extensions/umf.visual/source',reason:'Source provenance remains in UMF and is not embedded in the chart geometry.'});
 expect(result.omissions).toContainEqual({sourcePath:'/extensions/umf.visual/audience',reason:'Audience metadata remains in UMF and is not used to alter the authored score positions.'});
});

test('quadrant compiler refuses other backends and authored layouts rather than reinterpreting them',()=>{
 const document=doc(quadrant());
 for(const backend of ['graphviz','mermaid'] as const){
  const result=compilePresentation(document,{backend});expect(result.ok).toBe(false);if(result.ok)continue;
  expect(result.diagnostics[0]?.code).toBe('PRESENTATION_BACKEND_SUBSET');
 }
 const laidOut=quadrant({layout:{kind:'flow',direction:'LR'}} as Partial<Visual>);
 const layoutDocument={...doc(quadrant()),extensions:{'umf.visual':laidOut}} as unknown as Document;
 const result=compilePresentation(layoutDocument,{backend:'lini'});expect(result.ok).toBe(false);if(result.ok)return;
 expect(result.diagnostics.some(diagnostic=>diagnostic.path==='/extensions/umf.visual/layout')).toBe(true);
});

test('quadrant compiler refuses an unselected criterion and validates zero/max boundaries without synthesizing values',()=>{
 const extra=quadrant();extra.comparison!.criteria.push({id:'unused',label:'Unselected criterion',measure:'rating',max:4,low:'low',high:'high'});
 extra.comparison!.values.push({item:'ab',criterion:'unused',rating:2},{item:'a',criterion:'unused',rating:3});
 const extraResult=compile(extra);expect(extraResult.ok).toBe(false);if(!extraResult.ok)expect(extraResult.diagnostics[0]).toMatchObject({code:'PRESENTATION_LINI_QUADRANT_SCOPE',path:'/extensions/umf.visual/comparison/criteria'});
 const boundary=compile(quadrant());expect(boundary.ok).toBe(true);if(boundary.ok){expect(boundary.source).toContain('at: 0 0;');expect(boundary.source).toContain('at: 5 8;');}
 const missing=quadrant();missing.comparison!.values=missing.comparison!.values.filter(value=>!(value.item==='ab'&&value.criterion==='c'));
 const rawMissing={umf:'0.10.0',id:'visual:'+missing.id,vocabularies:{'umf.visual':{version:'1.0.0'}},extensions:{'umf.visual':missing},modules:[]} as unknown as Document;
 const missingResult=compilePresentation(rawMissing,{backend:'lini',theme:'presentation/1'});
 expect(missingResult.ok).toBe(false);if(!missingResult.ok)expect(missingResult.diagnostics.some(diagnostic=>diagnostic.path.includes('/comparison/values'))).toBe(true);
});

test('public dispatch maps quadrant annotations and returns a located refusal for native control text',()=>{
 const annotated=quadrant({annotations:[{id:'source-note',text:'A separate authored note.'}]});
 const annotationResult=compile(annotated,'1.4.0');
 expect(annotationResult.ok).toBe(true);if(annotationResult.ok){
  expect(annotationResult.source).toContain('A separate authored note.');
  expect(annotationResult.elementMap).toContainEqual({logicalId:'source-note',sourcePath:'/extensions/umf.visual/annotations/0/id',nativeId:'quadrant-annotation-1',kind:'annotation'});
  expect(annotationResult.elementMap).toContainEqual({logicalId:'source-note',sourcePath:'/extensions/umf.visual/annotations/0/text',nativeId:'quadrant-annotation-1',kind:'annotation'});
 }

 const unsafeQuestion=compile(quadrant({question:'Question with DEL \u007f'}));
 expect(unsafeQuestion.ok).toBe(false);if(!unsafeQuestion.ok)expect(unsafeQuestion.diagnostics).toContainEqual(expect.objectContaining({code:'PRESENTATION_LINI_QUADRANT_TEXT',path:'/extensions/umf.visual/question'}));
 const invalid=quadrant({annotations:[{id:'source-note',text:'Note with DEL \u007f'}]});
 const invalidResult=compile(invalid,'1.4.0');
 expect(invalidResult.ok).toBe(false);if(!invalidResult.ok)expect(invalidResult.diagnostics).toContainEqual(expect.objectContaining({code:'PRESENTATION_LINI_QUADRANT_TEXT',path:'/extensions/umf.visual/annotations/0/text'}));
});
