// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/helix-context.json';
const definitionPath='fixtures/reviews/definitions/helix-context.json';
const modelPath='fixtures/visual/sources/helix/architecture-model.toml';
const manifestPath='fixtures/reviews/review-sources.json';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=readFileSync(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,visual=getVisual(source) as Visual;
const definitionBytes=readFileSync(definitionPath),definition=readVisualDocument(definitionBytes.toString('utf8'),'json') as Document,reviewed=getVisual(definition) as Visual;
const modelBytes=readFileSync(modelPath),model=Bun.TOML.parse(modelBytes.toString('utf8')) as any;
const view=model.view.find((candidate:any)=>candidate.id==='context')!;
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='helix-context')!;
const roleFor=(kind:string)=>kind==='person'?'actor':kind==='external'?'external':kind==='container'?'own':kind==='store'?'store':undefined;

test('HELIX context preserves the selected source elements and relations without upgrading the source projection',()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),modelDigest=sha(modelBytes);
 expect(sourceDigest).toBe('2bc7de3649b9592a66a28c17f9e64ad3648a03a4efee4c7a601d1f271d9f7f9c');
 expect(definitionDigest).toBe('40360767d43ef319918d32b73f525e43025f3f3b99893b278e9aaa6e698114e4');
 expect(modelDigest).toBe('6e13adabec034747ed6d5505668e1daef353a3df6d2c54f3e4ff799cb92acff2');
 expect(source).toMatchObject({id:'visual:helix-context',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'helix-context',kind:'flow',form:'network',title:view.title,question:'What does HELIX touch, and what touches it?',takeaway:view.takeaway,audience:'developer'});
 expect(visual.source).toEqual({path:'helix:docs/helix/02-design/architecture-model.toml',view:'context',digest:`sha256:${modelDigest}`});
 const selected=view.elements.map((id:string)=>model.element.find((element:any)=>element.id===id));
 expect(selected).toHaveLength(7);expect(visual.nodes).toHaveLength(7);
 expect(visual.nodes?.map(node=>node.id)).toEqual(view.elements);
 expect(visual.nodes?.map(({id,label,detail,role,status,evidence})=>({id,label,detail,role,status,evidence}))).toEqual(selected.map((element:any)=>({id:element.id,label:element.name,detail:element.detail,role:roleFor(element.kind),status:element.status,evidence:element.evidence})));
 expect(view.direction).toBe('LR');expect((visual as any).direction).toBeUndefined();
 const relations=model.relation;
 expect(relations).toHaveLength(7);expect(visual.edges).toHaveLength(7);
 expect(visual.edges?.map(({id,from,to,label,why,status,evidence})=>({id,from,to,label,why,status,evidence}))).toEqual(relations.map((relation:any)=>({id:`${relation.from}--${relation.to}`,from:relation.from,to:relation.to,label:relation.label,why:relation.why,status:relation.status,evidence:relation.evidence})));
 expect(relations.slice(0,6).every((relation:any)=>Number.isInteger(relation.step))).toBe(true);
 expect(relations[6].step).toBeUndefined();expect(relations.some((relation:any)=>typeof relation.note==='string')).toBe(true);
 expect(visual.steps).toBeUndefined();expect(visual.groups).toBeUndefined();expect(visual.structure).toBeUndefined();
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 expect(inspectVisual(definition)).toMatchObject({valid:true,complete:true});
 expect(definition.id).toBe(source.id);expect(definition.umf).toBe(source.umf);expect(definition.vocabularies).toEqual(source.vocabularies);
 expect(reviewed.steps).toHaveLength(7);
 const numberedRelations=relations.filter((relation:any)=>Number.isInteger(relation.step)).sort((a:any,b:any)=>a.step-b.step);
 expect(numberedRelations.map((relation:any)=>relation.step)).toEqual([1,2,3,4,5,6]);
 expect(reviewed.steps?.slice(0,6).map((step,index)=>({id:step.id,title:step.title,caption:step.caption,focus:step.focus,when:step.when,tag:step.tag,relationStep:numberedRelations[index]?.step}))).toEqual(numberedRelations.map((relation:any,index:number)=>({id:`context-step-${index+1}`,title:relation.label,caption:relation.note,focus:[`${relation.from}--${relation.to}`],when:undefined,tag:undefined,relationStep:index+1})));
 const optionalRelation=relations.find((relation:any)=>relation.step===undefined)!;
 expect(reviewed.steps?.[6]).toEqual({id:'context-optional-documentor-checks',title:optionalRelation.label,caption:optionalRelation.note,focus:[`${optionalRelation.from}--${optionalRelation.to}`],when:'optional'});
 expect(optionalRelation.why).toBe('optional host tooling');expect(reviewed.steps?.[6]?.tag).toBeUndefined();
 expect(reviewed.nodes).toEqual(visual.nodes);expect(reviewed.edges).toEqual(visual.edges);
 const sourceWithSteps=structuredClone(source) as any;sourceWithSteps.extensions['umf.visual'].steps=reviewed.steps;
 expect(definition).toEqual(sourceWithSteps);
 const before=JSON.stringify(source),parsed=readVisualDocument(sourceBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(parsed,'json'))).toEqual(source);
 const yaml=writeVisualDocument(parsed,'yaml'),yamlParsed=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlParsed)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlParsed,'json'))).toEqual(source);
 for(const node of visual.nodes??[])expect(visualPayloadYaml(definition)).toContain(node.label);
 const yamlDefinition=writeVisualDocument(definition,'yaml'),yamlDefinitionRead=readVisualDocument(yamlDefinition,'yaml');
 expect(getVisual(yamlDefinitionRead)).toEqual(reviewed);expect(JSON.parse(writeVisualDocument(yamlDefinitionRead,'json'))).toEqual(definition);
 expect(JSON.stringify(source)).toBe(before);expect(sha(readFileSync(sourcePath))).toBe(sourceDigest);expect(sha(readFileSync(definitionPath))).toBe(definitionDigest);expect(sha(readFileSync(modelPath))).toBe(modelDigest);
});

test('HELIX context review binds and publishes the exact fixture and cited architecture model',async()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),modelDigest=sha(modelBytes);
 const scope='The original Visual 1.0.0 fixture remains unchanged and is published byte-for-byte. The separately reviewed Visual 1.0.0 definition adds six ordered walkthrough steps for the architecture model\'s numbered relations 1–6: each exact relation label becomes the step title, its exact note becomes the caption, and its existing edge ID is the focus. A final unnumbered `when: optional` item uses the seventh relation\'s exact label/note/focus; optionality is supported by `why: optional host tooling` and the source element\'s optional-tool description, and it carries no invented step number. All original nodes and edges, their IDs, labels, details, role/status/evidence fields, explanations, title, question, takeaway, and source locator remain unchanged. The architecture-model TOML bytes match the fixture\'s digest exactly. Role values are fixture mappings from source element kinds. The context view\'s direction remains source-only because Visual 1.0.0 has no layout direction field. The model\'s `built` statuses and evidence strings are authored records, not independent checks of current deployment or runtime behavior.';
 expect(review).toMatchObject({id:'helix-context',title:'HELIX in a repository',kind:'flow',form:'network',definitionPath,definitionSha256:definitionDigest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies seven selected nodes and seven labeled, explained relationships with their evidence, plus the title, question, takeaway, and cited architecture-model locator.'},
  {path:modelPath,sha256:modelDigest,pointer:'/view/context and selected /element and /relation records',label:'Cited HELIX architecture model',originalLocator:'helix:docs/helix/02-design/architecture-model.toml',resolvedSource:'helix/docs/helix/02-design/architecture-model.toml',description:'Exact TOML bytes resolved from the fixture locator. The context view selects the seven element IDs and provides its title/takeaway; selected element and relation records provide labels, details, kinds, statuses, evidence, captions, and explanations.'}
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/helix-context/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:modelPath,sha256:modelDigest,outputPath:'reviews/helix-context/architecture-model.toml',mediaType:'application/toml',description:'Exact cited architecture-model TOML bytes published without transformation.'}
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:helix-context',visualId:'helix-context',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/helix-context/authoritative-source.json',scope});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
