// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/helix-solution-overview.json';
const definitionPath='fixtures/reviews/definitions/helix-solution-overview.json';
const modelPath='fixtures/visual/sources/helix/architecture-model.toml';
const manifestPath='fixtures/reviews/review-sources.json';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=readFileSync(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,visual=getVisual(source) as Visual;
const definitionBytes=readFileSync(definitionPath),definition=readVisualDocument(definitionBytes.toString('utf8'),'json') as Document,reviewed=getVisual(definition) as Visual;
const modelBytes=readFileSync(modelPath),model=Bun.TOML.parse(modelBytes.toString('utf8')) as any;
const view=model.view.find((candidate:any)=>candidate.id==='context')!;
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='helix-solution-overview')!;
const roleFor=(kind:string)=>kind==='person'?'actor':kind==='external'?'external':kind==='container'?'own':kind==='store'?'store':undefined;
const laneId=(layer:string)=>`lane-${layer.toLowerCase().replaceAll(' ','-')}`;

test('HELIX solution overview preserves source context while adding scoped jobs, takeaway, and relation notes',()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),modelDigest=sha(modelBytes);
 expect(sourceDigest).toBe('c17c672fa2c31f27012648e6282506bb92b1a975fde16d6fecc36046269c5084');
 expect(definitionDigest).toBe('14ed788f646f68c067b6e8fbeac187bca86edd5a168ca1c05e9c08e2989b6c7a');
 expect(modelDigest).toBe('6e13adabec034747ed6d5505668e1daef353a3df6d2c54f3e4ff799cb92acff2');
 expect(source).toMatchObject({id:'visual:helix-solution-overview',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(view).toMatchObject({id:'context',elements:['team','runtime','skill','catalog','marker','docs','documentor'],direction:'LR',title:'HELIX in a repository',takeaway:'The runtime acts; HELIX gives it a document discipline.'});
 expect(visual).toMatchObject({id:'helix-solution-overview',kind:'flow',form:'lanes',title:'How HELIX turns intent into governing documents',question:'How does HELIX turn intent into governing documents?',audience:'developer'});
 expect(visual.takeaway).toBeUndefined();expect(reviewed.takeaway).toBe(view.takeaway);
 expect(visual.source).toEqual({path:'helix:docs/helix/02-design/architecture-model.toml',view:'context',digest:`sha256:${modelDigest}`});
 const selected=view.elements.map((id:string)=>model.element.find((element:any)=>element.id===id));
 expect(selected).toHaveLength(7);expect(visual.nodes).toHaveLength(7);
 expect(visual.nodes?.map(({id,label,detail,role,status,group,evidence})=>({id,label,detail,role,status,group,evidence}))).toEqual(selected.map((element:any)=>({id:element.id,label:element.name,detail:element.detail,role:roleFor(element.kind),status:element.status,group:laneId(element.layer),evidence:element.evidence})));
 const firstSeenLayers=[...new Set(selected.map((element:any)=>element.layer))] as string[];
 expect(firstSeenLayers).toEqual(['People','Agent host','HELIX','Your repository']);
 expect(visual.groups?.map(({id,label,role})=>({id,label,role}))).toEqual(firstSeenLayers.map(layer=>({id:laneId(layer),label:layer,role:'lane'})));
 const relations=model.relation as any[];
 expect(relations).toHaveLength(7);expect(visual.edges).toHaveLength(7);
 expect(visual.edges?.map(({id,from,to,label,why,status,evidence})=>({id,from,to,label,why,status,evidence}))).toEqual(relations.map((relation:any)=>({id:`${relation.from}--${relation.to}`,from:relation.from,to:relation.to,label:relation.label,why:relation.why,status:relation.status,evidence:relation.evidence})));
 const numbered=relations.filter((relation:any)=>Number.isInteger(relation.step)).sort((a:any,b:any)=>a.step-b.step);
 expect(numbered.map((relation:any)=>relation.step)).toEqual([1,2,3,4,5,6]);expect(visual.steps).toBeUndefined();
 expect(reviewed.steps?.slice(0,6).map((step,index)=>({id:step.id,title:step.title,caption:step.caption,focus:step.focus,when:step.when,tag:step.tag,sourceStep:numbered[index]?.step}))).toEqual(numbered.map((relation:any,index:number)=>({id:`context-step-${index+1}`,title:relation.label,caption:relation.note,focus:[`${relation.from}--${relation.to}`],when:undefined,tag:undefined,sourceStep:index+1})));
 const optional=relations.find((relation:any)=>relation.step===undefined)!;
 expect(optional.why).toBe('optional host tooling');
 expect(reviewed.steps?.[6]).toEqual({id:'context-optional-documentor-checks',title:optional.label,caption:optional.note,focus:[`${optional.from}--${optional.to}`],when:'optional'});
 expect(reviewed.steps?.[6]?.tag).toBeUndefined();
 expect(reviewed.nodes?.map(({id,label,detail,role,status,group,evidence})=>({id,label,detail,role,status,group,evidence}))).toEqual(selected.map((element:any,index:number)=>({id:element.id,label:element.name,detail:`${visual.nodes?.[index]?.detail}\n\n${element.job}`,role:roleFor(element.kind),status:element.status,group:laneId(element.layer),evidence:element.evidence})));
 expect(reviewed.groups).toEqual(visual.groups);expect(reviewed.edges).toEqual(visual.edges);
 const expectedDefinition=structuredClone(source) as any,expectedVisual=expectedDefinition.extensions['umf.visual'];
 expectedVisual.takeaway=view.takeaway;
 for(const node of expectedVisual.nodes){const element=selected.find((candidate:any)=>candidate.id===node.id);node.detail+=`\n\n${element.job}`;}
 expectedVisual.steps=numbered.map((relation:any,index:number)=>({id:`context-step-${index+1}`,title:relation.label,caption:relation.note,focus:[`${relation.from}--${relation.to}`]}));
 expectedVisual.steps.push({id:'context-optional-documentor-checks',title:optional.label,caption:optional.note,focus:[`${optional.from}--${optional.to}`],when:'optional'});
 expect(definition).toEqual(expectedDefinition);
 expect(definition.id).toBe(source.id);expect(definition.umf).toBe(source.umf);expect(definition.vocabularies).toEqual(source.vocabularies);
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});expect(inspectVisual(definition)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(source),sourceRoundtrip=readVisualDocument(sourceBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(sourceRoundtrip,'json'))).toEqual(source);
 const yaml=writeVisualDocument(definition,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(reviewed);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(definition);
 const payload=visualPayloadYaml(definition);for(const node of reviewed.nodes??[])expect(payload).toContain(node.label);for(const step of reviewed.steps??[])expect(payload).toContain(step.caption!);
 expect(JSON.stringify(source)).toBe(before);expect(sha(readFileSync(sourcePath))).toBe(sourceDigest);expect(sha(readFileSync(definitionPath))).toBe(definitionDigest);expect(sha(readFileSync(modelPath))).toBe(modelDigest);
});

test('HELIX solution-overview review binds the exact fixture and cited architecture model',async()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),modelDigest=sha(modelBytes);
 const scope="The original Visual 1.0.0 fixture remains unchanged and is published byte-for-byte. The separate reviewed Visual 1.0.0 definition preserves all original fields and adds the exact context-view takeaway; appends each selected element's exact `job` sentence to its existing detail with two line breaks, retaining the detail as prefix; and adds six ordered walkthrough steps from relation records with source `step` 1–6 (exact relation label/note and existing edge focus ID), followed by one unnumbered `when: optional` step from the final relation (exact label/note/focus), grounded by `why: optional host tooling`. All nodes, labels, existing details, role/status/evidence fields, edges, why/status/evidence fields, lanes/memberships, IDs, title/question/audience, and source metadata otherwise remain unchanged. The cited architecture-model TOML bytes match the fixture digest exactly. The four lane groups correspond to selected source element `layer` values; lane IDs/role are Visual projections. The context view's source title remains in the published TOML; the authored Visual title is not replaced. Its `direction: LR` is source-only because this Visual 1.0.0 shape has no direction field. The source model's built statuses and evidence are authored records, not checks of current deployment or runtime behavior.";
 expect(review).toMatchObject({id:'helix-solution-overview',title:'How HELIX turns intent into governing documents',kind:'flow',form:'lanes',definitionPath,definitionSha256:definitionDigest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies seven ordered nodes, four lanes and their memberships, seven relationships with why/status/evidence, title, question, and source locator.'},
  {path:modelPath,sha256:modelDigest,pointer:'/view/context, selected /element and /relation records',label:'Cited HELIX architecture model',originalLocator:'helix:docs/helix/02-design/architecture-model.toml',resolvedSource:'helix/docs/helix/02-design/architecture-model.toml',description:'Exact TOML bytes resolved from the fixture locator. The context view supplies its source title, direction, takeaway and ordered element selection; selected element records supply layer and responsibility job; relation records supply the six numbered notes and one unnumbered optional note.'}
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/helix-solution-overview/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:modelPath,sha256:modelDigest,outputPath:'reviews/helix-solution-overview/architecture-model.toml',mediaType:'application/toml',description:'Exact cited architecture-model TOML bytes published without transformation.'}
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:helix-solution-overview',visualId:'helix-solution-overview',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/helix-solution-overview/authoritative-source.json',scope});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
