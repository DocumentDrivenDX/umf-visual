// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {authoredComparisonView} from '../../microsite/authored-context.js';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';
import {compilePresentation} from '../../src/presentation';

const sourcePath='fixtures/visual/forms/visuals-before-after.json';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;

test('before-and-after source preserves its exact comparison identities, value kinds, and order',()=>{
 const raw=readFileSync(sourcePath),digest=hash(raw),source=JSON.parse(raw.toString('utf8')) as Document,reviewed=read<Document>(sourcePath),visual=getVisual(reviewed) as Visual;
 expect(digest).toBe('e4f562d672bd9560fa02affe04f7e0eb1027baba8aa0c0bfcdf977ae8d28c147');expect(reviewed).toEqual(source);
 expect(reviewed.id).toBe('visual:visuals-before-after');expect(reviewed.umf).toBe('0.10.0');expect(reviewed.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(visual.id).toBe('visuals-before-after');expect(visual.kind).toBe('comparison');expect(visual.form).toBe('before-after');
 expect(visual.title).toBe('Visuals before and after');expect(visual.question).toBe('What changes when every visual is a umf.visual document?');
 expect(visual.source).toEqual({path:'visuals:PRD.md',view:'§1–§2',digest:'sha256:f944df076446c39a75b7f58323869af5337751e892b75d24cc749e8b9ff27aa5'});
 const comparison=visual.comparison!;
 expect(comparison.items).toEqual([{id:'today',label:'Today'},{id:'after',label:'With umf.visual'}]);
 expect(comparison.criteria).toEqual([
  {id:'colors',label:'Where colors come from',measure:'text'},
  {id:'renderers',label:'What draws the visuals',measure:'text'},
  {id:'theme',label:'A theme switch restyles every visual',measure:'support'},
  {id:'source',label:'Checked against the source',measure:'support'},
 ]);
 expect(comparison.values).toEqual([
  {item:'today',criterion:'colors',text:'Four places'},
  {item:'after',criterion:'colors',text:"The theme's tokens"},
  {item:'today',criterion:'renderers',text:'Mermaid, deploy.py, HTML plates, Eraser and hand SVG'},
  {item:'after',criterion:'renderers',text:'@ux-builder/visuals'},
  {item:'today',criterion:'theme',support:'no'},
  {item:'after',criterion:'theme',support:'yes'},
  {item:'today',criterion:'source',support:'partial'},
  {item:'after',criterion:'source',support:'yes'},
 ]);
 expect(comparison).not.toHaveProperty('axes');expect(comparison).not.toHaveProperty('chosen');
 expect(inspectVisual(reviewed)).toMatchObject({valid:true,complete:true});
 const jsonRead=readVisualDocument(raw.toString('utf8'),'json');expect(JSON.parse(writeVisualDocument(jsonRead,'json'))).toEqual(source);
 const yaml=writeVisualDocument(jsonRead,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
 const view=authoredComparisonView(visual)!;
 expect(view.items.map(item=>item.sourcePath)).toEqual(['/extensions/umf.visual/comparison/items/0','/extensions/umf.visual/comparison/items/1']);
 expect(view.criteria.map(item=>item.sourcePath)).toEqual(comparison.criteria.map((_,index)=>`/extensions/umf.visual/comparison/criteria/${index}`));
 expect(view.values.map(item=>item.sourcePath)).toEqual(comparison.values.map((_,index)=>`/extensions/umf.visual/comparison/values/${index}`));
 expect(view.values.map(item=>item.fields.map(field=>field.sourcePath))).toEqual(comparison.values.map((value,index)=>Object.keys(value).filter(key=>key!=='item'&&key!=='criterion').map(key=>`/extensions/umf.visual/comparison/values/${index}/${key}`)));
 expect(view.axes).toEqual([]);expect(view.chosen).toBeNull();
});

test('before-and-after review binds source bytes without current-PRD or derived-winner claims',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(item=>item.id==='visuals-before-after')!;
 const bytes=readFileSync(sourcePath),digest=hash(bytes);
 expect(row.title).toBe('Visuals before and after');expect(row.kind).toBe('comparison');expect(row.form).toBe('before-after');
 expect(row.definitionPath).toBe(sourcePath);expect(row.definitionSha256).toBe(digest);
 expect(row.sources).toEqual([{path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The checked-in Visual 1.0.0 fixture JSON is the complete definition and is used byte-for-byte as the review definition.'}]);
 expect(row.publishedAssets).toEqual([{path:sourcePath,sha256:digest,outputPath:'reviews/visuals-before-after/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'}]);
 expect(row.originalEvidence).toEqual({
  kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,documentId:'visual:visuals-before-after',visualId:'visuals-before-after',envelopeVersion:'0.10.0',modelVersion:'1.0.0',
  sourceDownloadPath:'reviews/visuals-before-after/authoritative-source.json',
  scope:'This exact UMF fixture JSON is the review definition. The two item IDs and labels, four criterion IDs, labels and measures, and eight text/support value records with their item and criterion references and array order are source-authored. The source path and digest are locator metadata; this review does not verify current PRD bytes, score or rank the items, infer missing support values, or add a chosen item.'
 });
 expect(row.originalEvidence).not.toHaveProperty('classification');expect(row.originalEvidence).not.toHaveProperty('captureSha256');expect(row.originalEvidence).not.toHaveProperty('knownOmissions');
 const evidence=await verifyReviewSourceEvidence(),rows=manifest.examples;
 expect(evidence.examples).toBe(rows.length);expect(evidence.authoritativeSources).toBe(rows.filter(item=>item.originalEvidence.kind==='authoritative-umf-source').length);
});

test('public before-after plan maps source items, criteria, and every text/support value to its table cell',()=>{
 const raw=readFileSync(sourcePath),document=readVisualDocument(raw.toString('utf8'),'json'),visual=getVisual(document),before=JSON.stringify(document);
 for(const backend of ['graphviz','mermaid'] as const)expect(compilePresentation(document,{backend})).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_BACKEND_SUBSET',path:'/extensions/umf.visual/form'}]});
 const plan=compilePresentation(document,{backend:'lini'});expect(plan.ok).toBe(true);if(!plan.ok)return;
 const comparison=visual.comparison!;
 expect(plan.source).toContain('Visuals before and after');expect(plan.source).toContain('What changes when every visual is a umf.visual document?');
 for(const item of comparison.items)expect(plan.source).toContain(item.label);
 for(const criterion of comparison.criteria)expect(plan.source).toContain(criterion.label);
 for(const value of comparison.values){
  expect(plan.source).toContain(value.text??value.support??'');
  const logicalId=JSON.stringify([value.item,value.criterion]);
  const valuePath=`/extensions/umf.visual/comparison/values/${comparison.values.indexOf(value)}`;
  for(const[suffix,expectedId]of[['',logicalId],['/item',value.item],['/criterion',value.criterion],[value.text!==undefined?'/text':'/support',logicalId]] as const){
   const map=plan.elementMap.find(element=>element.sourcePath===valuePath+suffix);
   expect(map).toMatchObject({logicalId:expectedId,kind:'comparison-value'});
   expect(map?.nativeId).toMatch(/^before-after-cell-r\d+-c\d+$/u);
  }
 }
 for(const[index,item]of comparison.items.entries())for(const field of ['id','label']){
  expect(plan.elementMap).toContainEqual(expect.objectContaining({logicalId:item.id,sourcePath:`/extensions/umf.visual/comparison/items/${index}/${field}`,nativeId:`before-after-item-${index+1}`,kind:'comparison-item'}));
 }
 for(const[index,criterion]of comparison.criteria.entries())for(const field of ['id','label']){
  expect(plan.elementMap).toContainEqual(expect.objectContaining({logicalId:criterion.id,sourcePath:`/extensions/umf.visual/comparison/criteria/${index}/${field}`,nativeId:`before-after-criterion-${index+1}`,kind:'comparison-criterion'}));
 }
 for(const[index,criterion]of comparison.criteria.entries())for(const[itemIndex,item]of comparison.items.entries()){
  expect(plan.elementMap).toContainEqual(expect.objectContaining({logicalId:criterion.id,sourcePath:`/extensions/umf.visual/comparison/criteria/${index}/measure`,nativeId:`before-after-cell-r${index+2}-c${itemIndex+2}`,kind:'comparison-criterion'}));
 }
 expect(plan.elementMap.filter(element=>element.kind==='comparison-value').some(element=>element.sourcePath==='/extensions/umf.visual/comparison/chosen')).toBe(false);
 const comparisonDisclosure=plan.approximations.find(item=>item.sourcePath==='/extensions/umf.visual/comparison')?.representation??'';
 expect(comparisonDisclosure).toContain('No ranking, winner');expect(comparisonDisclosure).toContain('never synthesizes “no”');
 expect(JSON.stringify(document)).toBe(before);

 const shuffled=structuredClone(document),shuffledVisual=shuffled.extensions?.['umf.visual'] as Visual;
 shuffledVisual.comparison!.values.reverse();
 const shuffledPlan=compilePresentation(shuffled,{backend:'lini'});expect(shuffledPlan.ok).toBe(true);if(!shuffledPlan.ok)return;
 for(const value of comparison.values){
  const logicalId=JSON.stringify([value.item,value.criterion]);
  const originalMap=plan.elementMap.find(item=>item.kind==='comparison-value'&&item.logicalId===logicalId&&item.sourcePath.endsWith(value.text!==undefined?'/text':'/support'));
  const shuffledIndex=shuffledVisual.comparison!.values.findIndex(item=>item.item===value.item&&item.criterion===value.criterion);
  const shuffledMap=shuffledPlan.elementMap.find(item=>item.kind==='comparison-value'&&item.logicalId===logicalId&&item.sourcePath===`/extensions/umf.visual/comparison/values/${shuffledIndex}`);
  expect(shuffledMap?.nativeId).toBe(originalMap?.nativeId);
 }
 expect(JSON.stringify(document)).toBe(before);

 const incomplete=structuredClone(document),incompleteVisual=incomplete.extensions?.['umf.visual'] as Visual;
 incompleteVisual.comparison!.values=incompleteVisual.comparison!.values.filter(value=>!(value.item==='after'&&value.criterion==='source'));
 expect(compilePresentation(incomplete,{backend:'lini'})).toMatchObject({ok:false,diagnostics:[{code:'VISUAL_FORM_RULE',path:'/extensions/umf.visual/comparison/values'}]});
 expect(incompleteVisual.comparison!.values.some(value=>value.item==='after'&&value.criterion==='source')).toBe(false);
 const authoredNoIndex=visual.comparison!.values.findIndex(value=>value.item==='today'&&value.criterion==='theme');
 const authoredNoMap=plan.elementMap.find(item=>item.kind==='comparison-value'&&item.sourcePath===`/extensions/umf.visual/comparison/values/${authoredNoIndex}/support`);
 expect(authoredNoMap).toMatchObject({logicalId:JSON.stringify(['today','theme'])});
});
