// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/helix-field-guide.json';
const definitionPath='fixtures/reviews/definitions/helix-field-guide.json';
const modelPath='fixtures/visual/sources/helix/architecture-model.toml';
const manifestPath='fixtures/reviews/review-sources.json';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=readFileSync(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,visual=getVisual(source) as Visual;
const definitionBytes=readFileSync(definitionPath),definition=readVisualDocument(definitionBytes.toString('utf8'),'json') as Document,reviewed=getVisual(definition) as Visual;
const modelBytes=readFileSync(modelPath),model=Bun.TOML.parse(modelBytes.toString('utf8')) as any;
const view=model.view.find((candidate:any)=>candidate.id==='context')!;
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='helix-field-guide')!;
const roleFor=(kind:string)=>kind==='person'?'actor':kind==='external'?'external':kind==='container'?'own':kind==='store'?'store':undefined;
const laneId=(layer:string)=>`lane-${layer.toLowerCase().replaceAll(' ','-')}`;

test('HELIX field guide preserves source context and enriches responsibility details and optional relation walkthrough',()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),modelDigest=sha(modelBytes);
 expect(sourceDigest).toBe('6355a41023ce8cf89630e69e9e607d025e6b4d195b615870a0028a9337f38938');
 expect(definitionDigest).toBe('92c5d9fde6d9e310b8983feaf5d661d9d9fb579ea5f9418bed6e4b626a8ab440');
 expect(modelDigest).toBe('6e13adabec034747ed6d5505668e1daef353a3df6d2c54f3e4ff799cb92acff2');
 expect(source).toMatchObject({id:'visual:helix-field-guide',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'helix-field-guide',kind:'flow',form:'lanes',title:"A developer's first map of HELIX",question:'Where do I start in HELIX, and how does one request move through it?',audience:'developer'});
 expect(visual.source).toEqual({path:'helix:docs/helix/02-design/architecture-model.toml',view:'context',digest:`sha256:${modelDigest}`});
 expect(view.elements).toEqual(visual.nodes?.map(node=>node.id));
 const selected=view.elements.map((id:string)=>model.element.find((element:any)=>element.id===id));
 expect(selected).toHaveLength(7);expect(visual.nodes).toHaveLength(7);
 expect(visual.nodes?.map(({id,label,detail,role,status,group,evidence})=>({id,label,detail,role,status,group,evidence}))).toEqual(selected.map((element:any)=>({id:element.id,label:element.name,detail:element.detail,role:roleFor(element.kind),status:element.status,group:laneId(element.layer),evidence:element.evidence})));
 const firstSeenLayers=[...new Set(selected.map((element:any)=>element.layer))] as string[];
 expect(firstSeenLayers).toEqual(['People','Agent host','HELIX','Your repository']);
 expect(visual.groups?.map(({id,label,role})=>({id,label,role}))).toEqual(firstSeenLayers.map(layer=>({id:laneId(layer),label:layer,role:'lane'})));
 const relations=model.relation;
 expect(relations).toHaveLength(7);expect(visual.edges).toHaveLength(7);
 expect(visual.edges?.map(({id,from,to,label,why,status,evidence})=>({id,from,to,label,why,status,evidence}))).toEqual(relations.map((relation:any)=>({id:`${relation.from}--${relation.to}`,from:relation.from,to:relation.to,label:relation.label,why:relation.why,status:relation.status,evidence:relation.evidence})));
 const numberedRelations=relations.filter((relation:any)=>Number.isInteger(relation.step)).sort((a:any,b:any)=>a.step-b.step);
 expect(numberedRelations.map((relation:any)=>relation.step)).toEqual([1,2,3,4,5,6]);
 expect(visual.steps).toHaveLength(6);
 expect(visual.steps?.map((step,index)=>({id:step.id,title:step.title,caption:step.caption,focus:step.focus,when:step.when,tag:step.tag,sourceStep:numberedRelations[index]?.step}))).toEqual(numberedRelations.map((relation:any,index:number)=>({id:`s${index+1}`,title:relation.label[0].toUpperCase()+relation.label.slice(1),caption:relation.note,focus:[`${relation.from}--${relation.to}`],when:undefined,tag:undefined,sourceStep:index+1})));
 const optionalRelation=relations.find((relation:any)=>relation.step===undefined)!;
 expect(optionalRelation.why).toBe('optional host tooling');
 expect(reviewed.steps?.slice(0,6)).toEqual(visual.steps);
 expect(reviewed.steps?.[6]).toEqual({id:'s7',title:optionalRelation.label,caption:optionalRelation.note,focus:[`${optionalRelation.from}--${optionalRelation.to}`],when:'optional'});
 expect(reviewed.steps?.[6]?.tag).toBeUndefined();
 expect(reviewed.nodes?.map(({id,label,detail})=>({id,label,detail}))).toEqual(selected.map((element:any,index:number)=>({id:element.id,label:element.name,detail:`${visual.nodes?.[index]?.detail}\n\n${element.job}`})));
 expect(reviewed.nodes?.map(({id,role,status,group,evidence})=>({id,role,status,group,evidence}))).toEqual(visual.nodes?.map(({id,role,status,group,evidence})=>({id,role,status,group,evidence})));
 expect(reviewed.groups).toEqual(visual.groups);expect(reviewed.edges).toEqual(visual.edges);expect(reviewed.omissions).toEqual(visual.omissions);
 expect(reviewed.id).toBe(visual.id);expect(definition.id).toBe(source.id);expect(definition.umf).toBe(source.umf);expect(definition.vocabularies).toEqual(source.vocabularies);
 const expectedDefinition=structuredClone(source) as any;
 for(const node of expectedDefinition.extensions['umf.visual'].nodes){const element=selected.find((candidate:any)=>candidate.id===node.id);node.detail+=`\n\n${element.job}`;}
 expectedDefinition.extensions['umf.visual'].steps.push({id:'s7',title:optionalRelation.label,caption:optionalRelation.note,focus:[`${optionalRelation.from}--${optionalRelation.to}`],when:'optional'});
 expect(definition).toEqual(expectedDefinition);
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});expect(inspectVisual(definition)).toMatchObject({valid:true,complete:true});
 const sourceBefore=JSON.stringify(source),sourceRoundtrip=readVisualDocument(sourceBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(sourceRoundtrip,'json'))).toEqual(source);
 const definitionYaml=writeVisualDocument(definition,'yaml'),definitionYamlRead=readVisualDocument(definitionYaml,'yaml');
 expect(getVisual(definitionYamlRead)).toEqual(reviewed);expect(JSON.parse(writeVisualDocument(definitionYamlRead,'json'))).toEqual(definition);
 const payload=visualPayloadYaml(definition);
 for(const[index,node]of(reviewed.nodes??[]).entries()){expect(payload).toContain(visual.nodes?.[index]?.detail!);expect(payload).toContain(selected[index]?.job!);}
 expect(JSON.stringify(source)).toBe(sourceBefore);expect(sha(readFileSync(sourcePath))).toBe(sourceDigest);expect(sha(readFileSync(definitionPath))).toBe(definitionDigest);expect(sha(readFileSync(modelPath))).toBe(modelDigest);
});

test('HELIX field-guide review binds and publishes the original fixture and exact architecture model',async()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),modelDigest=sha(modelBytes);
 const scope='The original Visual 1.0.0 fixture remains unchanged and is published byte-for-byte. The separately reviewed Visual 1.0.0 definition preserves its seven nodes/groups/edges and six existing steps, then appends the exact source `job` sentence to each existing node detail with two line breaks, leaving the former detail as an exact prefix. It adds an unnumbered optional seventh step from the source relation with no `step`: exact relation label, note, and existing edge focus ID, with `when: optional` grounded by `why: optional host tooling`. The six existing step IDs, title capitalization, captions, focus IDs, order, numbering-by-order, lane memberships, role/status/evidence, omissions, title, question, audience, and source locator are unchanged. The cited architecture-model TOML bytes match the fixture digest exactly. The context view element order and the four lane groups correspond to source `layer` values; group IDs and lane role are Visual-fixture projections. Source `job` prose is included in the enriched details, not turned into a new schema field. The model\'s `built` statuses and evidence strings are authored records, not independent checks of current deployment or runtime behavior.';
 expect(review).toMatchObject({id:'helix-field-guide',title:"A developer's first map of HELIX",kind:'flow',form:'lanes',definitionPath,definitionSha256:definitionDigest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies the seven ordered context nodes, four lanes, seven relationships, six existing steps, omissions, title, question, audience, and cited architecture-model locator.'},
  {path:modelPath,sha256:modelDigest,pointer:'/view/context, selected /element, and /relation records',label:'Cited HELIX architecture model',originalLocator:'helix:docs/helix/02-design/architecture-model.toml',resolvedSource:'helix/docs/helix/02-design/architecture-model.toml',description:'Exact TOML bytes resolved from the fixture locator. The context view selects seven elements; selected element records supply layer, name/detail/job/kind/status/evidence; relation records supply the six numbered notes and one unnumbered optional relation note.'}
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/helix-field-guide/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:modelPath,sha256:modelDigest,outputPath:'reviews/helix-field-guide/architecture-model.toml',mediaType:'application/toml',description:'Exact cited architecture-model TOML bytes published without transformation.'}
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:helix-field-guide',visualId:'helix-field-guide',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/helix-field-guide/authoritative-source.json',scope});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
