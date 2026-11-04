// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/beacon-stack.json';
const modelPath='fixtures/visual/sources/beacon/architecture-model.toml';
const manifestPath='fixtures/reviews/review-sources.json';
const read=(path:string)=>readFileSync(path);
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=read(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,visual=getVisual(source) as Visual;
const modelBytes=read(modelPath),model=Bun.TOML.parse(modelBytes.toString('utf8')) as any;
const view=model.view.find((candidate:any)=>candidate.id==='stack')!;
const manifest=JSON.parse(read(manifestPath).toString('utf8')) as {examples:Array<any>};
const review=manifest.examples.find(example=>example.id==='beacon-stack');
const role=(element:any)=>element.kind==='person'?'actor':element.kind==='store'?'store':element.kind==='external'&&element.owner==='platform'?'platform':'own';
const layerId=(label:string)=>`layer-${label.toLowerCase().replaceAll(' ','-')}`;

test('Beacon stack is the exact source-selected element/layer projection and preserves authored order',()=>{
 const digest=sha(sourceBytes),modelDigest=sha(modelBytes);
 expect(digest).toBe('bfaf187d4763816fb331af03c39e79c9c9333f7c27576fe0f854ee860657c1a7');
 expect(modelDigest).toBe('5506076ecd96344bd6b203c4d2a36ed983a7d9c37883c0e4dc65f9a59f689910');
 expect(source).toMatchObject({id:'visual:beacon-stack',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'beacon-stack',kind:'structure',form:'stack',title:view.title,takeaway:view.takeaway,audience:'developer'});
 expect(visual.source).toEqual({path:`umf:${modelPath}`,view:'stack',digest:`sha256:${modelDigest}`});
 const selected=view.elements.map((id:string)=>model.element.find((element:any)=>element.id===id));
 expect(selected).toHaveLength(15);expect(visual.nodes).toHaveLength(15);
 expect(visual.nodes?.map(node=>node.id)).toEqual(view.elements);
 expect(visual.nodes?.map(({id,label,detail,role:nodeRole,status,layer})=>({id,label,...(detail===undefined?{}:{detail}),role:nodeRole,status,layer}))).toEqual(selected.map((element:any)=>({id:element.id,label:element.name,...(element.detail===undefined?{}:{detail:element.detail}),role:role(element),status:element.status,layer:layerId(element.layer)})));
 const layerLabels=[...new Set(selected.map((element:any)=>element.layer))] as string[];
 expect(layerLabels).toEqual(['People','Front door','Beacon','Beacon data','Platform']);
 expect(visual.structure?.layers?.map(({id,label})=>({id,label}))).toEqual(layerLabels.map(label=>({id:layerId(label),label})));
 expect(visual.groups).toBeUndefined();expect(visual.edges).toBeUndefined();expect(visual.steps).toBeUndefined();
 expect(model.zone.some((zone:any)=>zone.name==='App platform')).toBe(true);
 expect(visual.question).toBe('Where does each piece sit?');expect(view.question).toBeUndefined();
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 const json=readVisualDocument(sourceBytes.toString('utf8'),'json');expect(JSON.parse(writeVisualDocument(json,'json'))).toEqual(source);
 const yaml=writeVisualDocument(json,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');expect(getVisual(yamlRead)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
 const payload=visualPayloadYaml(source);for(const element of selected)expect(payload).toContain(element.name);
 expect(sha(read(sourcePath))).toBe(digest);expect(sha(read(modelPath))).toBe(modelDigest);
});

test('Beacon stack review binds and publishes only the exact UMF fixture and cited TOML bytes',async()=>{
 const digest=sha(sourceBytes),modelDigest=sha(modelBytes);
 expect(review).toMatchObject({id:'beacon-stack',title:'Where each piece sits',kind:'structure',form:'stack',definitionPath:sourcePath,definitionSha256:digest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies the selected stack view’s 15 ordered element identities and fields, five ordered layer declarations, title, question, takeaway, audience, and the cited architecture-model locator.'},
  {path:modelPath,sha256:modelDigest,pointer:'/view/stack',label:'Fictional architecture-model source',description:'The exact checked-in TOML bytes select the stack view’s 15 elements in order and provide its title/takeaway plus each selected element’s name, detail, kind, status, and layer label. Layer identifiers/order and the view question are Visual-fixture projections; the model labels itself fictional.'},
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:digest,outputPath:'reviews/beacon-stack/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:modelPath,sha256:modelDigest,outputPath:'reviews/beacon-stack/architecture-model.toml',mediaType:'application/toml',description:'Exact fictional architecture-model TOML bytes cited by the original UMF fixture.'},
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,documentId:'visual:beacon-stack',visualId:'beacon-stack',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/beacon-stack/authoritative-source.json',scope:'This exact Visual 1.0.0 fixture remains unchanged as the review definition. Its `stack` selection preserves the 15 element IDs and order; the checked-in fictional TOML supplies the same selected view order, title, takeaway, and each element’s name, optional detail, kind, status, and layer label. Actor/store/platform/own roles are the fixture mapping from source element kinds and platform ownership. The five displayed layer labels follow first appearance in the selected elements; layer IDs are presentation projections, not literal TOML identifiers. The question, audience, and source locator are authored in the Visual fixture; the TOML view has no question field. Zones, tiers, relations, and journey steps are not part of this stack selection and are not imported. Neither file establishes current deployment or runtime behavior.'});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});

test('public stack plans map only the exact source nodes and five layers without mutating the original fixture',()=>{
 const before=JSON.stringify(source),base='/extensions/umf.visual';
 for(const backend of ['graphviz','mermaid','lini'] as const){
  const plan=compilePresentation(source,{backend,theme:'presentation/1'});expect(plan.ok,backend).toBe(true);if(!plan.ok)continue;
  expect(plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(15);expect(plan.elementMap.filter(item=>item.kind==='layer')).toHaveLength(5);
  for(const[index,node]of visual.nodes!.entries())expect(plan.elementMap).toContainEqual({logicalId:node.id,sourcePath:`${base}/nodes/${index}${backend==='lini'?'/id':''}`,nativeId:`n${index+1}`,kind:'node'});
  for(const[index,layer]of visual.structure!.layers!.entries())expect(plan.elementMap).toContainEqual({logicalId:layer.id,sourcePath:`${base}/structure/layers/${index}`,nativeId:`l${index+1}`,kind:'layer'});
  expect(plan.elementMap.filter(item=>item.kind==='edge'||item.kind==='group')).toHaveLength(0);
 }
 expect(JSON.stringify(source)).toBe(before);expect(sha(read(sourcePath))).toBe(sha(sourceBytes));expect(sha(read(modelPath))).toBe(sha(modelBytes));
});
