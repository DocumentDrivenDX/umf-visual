// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/helix-deployment.json';
const definitionPath='fixtures/reviews/definitions/helix-deployment.json';
const modelPath='fixtures/visual/sources/helix/architecture-model.toml';
const manifestPath='fixtures/reviews/review-sources.json';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=readFileSync(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,visual=getVisual(source) as Visual;
const definitionBytes=readFileSync(definitionPath),definition=readVisualDocument(definitionBytes.toString('utf8'),'json') as Document,reviewed=getVisual(definition) as Visual;
const modelBytes=readFileSync(modelPath),model=Bun.TOML.parse(modelBytes.toString('utf8')) as any;
const view=model.view.find((candidate:any)=>candidate.id==='deployment')!;
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='helix-deployment')!;
const roleFor=(kind:string)=>kind==='person'?'actor':kind==='external'?'external':kind==='container'?'own':kind==='store'?'store':undefined;
const zoneId=(zone:string)=>`zone-${zone.toLowerCase().replaceAll(' ','-')}`;

test('HELIX deployment preserves source-selected nodes, zones, relations and relation walkthrough',()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),modelDigest=sha(modelBytes);
 expect(sourceDigest).toBe('0f09c9509a7dc52a98fdcbed5f8da5518d3f70371ebff7306569d0bde5ee6010');
 expect(definitionDigest).toBe('e452881ce41435b5cb9afd827472c99ae24f34e544fdaee21e87d38f57318c21');
 expect(modelDigest).toBe('6e13adabec034747ed6d5505668e1daef353a3df6d2c54f3e4ff799cb92acff2');
 expect(source).toMatchObject({id:'visual:helix-deployment',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'helix-deployment',kind:'flow',form:'zoned',title:view.title,question:'Where does HELIX run?',takeaway:view.takeaway,audience:'developer'});
 expect(visual.source).toEqual({path:'helix:docs/helix/02-design/architecture-model.toml',view:'deployment',digest:`sha256:${modelDigest}`});
 expect(view.elements).toEqual(visual.nodes?.map(node=>node.id));
 const selected=view.elements.map((id:string)=>model.element.find((element:any)=>element.id===id));
 expect(selected).toHaveLength(7);expect(visual.nodes).toHaveLength(7);
 expect(visual.nodes?.map(({id,label,detail,role,status,group,evidence})=>({id,label,detail,role,status,group,evidence}))).toEqual(selected.map((element:any)=>({id:element.id,label:element.name,detail:element.detail,role:roleFor(element.kind),status:element.status,group:zoneId(element.zone),evidence:element.evidence})));
 const firstSeenZones=[...new Set(selected.map((element:any)=>element.zone))] as string[];
 expect(firstSeenZones).toEqual(['People','Agent host','HELIX plugin','Your repository']);
 expect(visual.groups?.map(({id,label,role,tier})=>({id,label,role,tier}))).toEqual(firstSeenZones.map(zone=>({id:zoneId(zone),label:zone,role:'zone',tier:selected.find((element:any)=>element.zone===zone)?.tier})));
 expect(visual.groups?.map(group=>group.tier)).toEqual([1,2,3,4]);
 const relations=model.relation;
 expect(relations).toHaveLength(7);expect(visual.edges).toHaveLength(7);
 expect(visual.edges?.map(({id,from,to,label,why,status,evidence})=>({id,from,to,label,why,status,evidence}))).toEqual(relations.map((relation:any)=>({id:`${relation.from}--${relation.to}`,from:relation.from,to:relation.to,label:relation.label,why:relation.why,status:relation.status,evidence:relation.evidence})));
 const numberedRelations=relations.filter((relation:any)=>Number.isInteger(relation.step)).sort((a:any,b:any)=>a.step-b.step);
 expect(numberedRelations.map((relation:any)=>relation.step)).toEqual([1,2,3,4,5,6]);
 expect(reviewed.steps?.slice(0,6).map((step,index)=>({id:step.id,title:step.title,caption:step.caption,focus:step.focus,when:step.when,tag:step.tag,sourceStep:numberedRelations[index]?.step}))).toEqual(numberedRelations.map((relation:any,index:number)=>({id:`deployment-step-${index+1}`,title:relation.label,caption:relation.note,focus:[`${relation.from}--${relation.to}`],when:undefined,tag:undefined,sourceStep:index+1})));
 const optionalRelation=relations.find((relation:any)=>relation.step===undefined)!;
 expect(optionalRelation.why).toBe('optional host tooling');
 expect(reviewed.steps?.[6]).toEqual({id:'deployment-optional-documentor-checks',title:optionalRelation.label,caption:optionalRelation.note,focus:[`${optionalRelation.from}--${optionalRelation.to}`],when:'optional'});
 expect(reviewed.steps?.[6]?.tag).toBeUndefined();
 expect(model.journey[0].step.map((step:any)=>step.label)).not.toEqual(reviewed.steps?.map(step=>step.title));
 expect(reviewed.nodes).toEqual(visual.nodes);expect(reviewed.groups).toEqual(visual.groups);expect(reviewed.edges).toEqual(visual.edges);
 expect(reviewed.id).toBe(visual.id);expect(definition.id).toBe(source.id);expect(definition.umf).toBe(source.umf);expect(definition.vocabularies).toEqual(source.vocabularies);
 const sourceWithSteps=structuredClone(source) as any;sourceWithSteps.extensions['umf.visual'].steps=reviewed.steps;
 expect(definition).toEqual(sourceWithSteps);
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});expect(inspectVisual(definition)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(source),sourceRoundtrip=readVisualDocument(sourceBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(sourceRoundtrip,'json'))).toEqual(source);
 const definitionYaml=writeVisualDocument(definition,'yaml'),definitionYamlRead=readVisualDocument(definitionYaml,'yaml');
 expect(getVisual(definitionYamlRead)).toEqual(reviewed);expect(JSON.parse(writeVisualDocument(definitionYamlRead,'json'))).toEqual(definition);
 const payload=visualPayloadYaml(definition);
 for(const node of visual.nodes??[])expect(payload).toContain(node.label);
 for(const step of reviewed.steps??[])expect(payload).toContain(step.caption!);
 expect(JSON.stringify(source)).toBe(before);expect(sha(readFileSync(sourcePath))).toBe(sourceDigest);expect(sha(readFileSync(definitionPath))).toBe(definitionDigest);expect(sha(readFileSync(modelPath))).toBe(modelDigest);
});

test('HELIX deployment review binds and publishes the original fixture and exact TOML source',async()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),modelDigest=sha(modelBytes);
 const scope="The original Visual 1.0.0 fixture remains unchanged and is published byte-for-byte. The separate reviewed Visual 1.0.0 definition adds six ordered steps from architecture-model relation records with source `step` 1–6, preserving each relation label, exact note, and existing edge focus ID. It adds one unnumbered optional step from the final relation's exact label/note/focus; `when: optional` is supported by its `why: optional host tooling` and the documentor element's optional host-tool description. It does not import the separate `journey.step` labels. The cited architecture-model TOML bytes match the fixture digest exactly. The deployment view's ordered element list and title/takeaway match; four zones, tier values, and node memberships project from selected element `zone`/`tier` fields. Node role values are Visual-fixture mappings from source element kinds. Existing nodes/edges, evidence/status/why fields, question, audience, IDs, and source metadata are unchanged. The deployment view does not declare a direction. Source `job` prose is outside this selected projection. The model's `built` statuses and evidence strings are authored records, not independent checks of current deployment or runtime behavior.";
 expect(review).toMatchObject({id:'helix-deployment',title:'Where HELIX runs',kind:'flow',form:'zoned',definitionPath,definitionSha256:definitionDigest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies the deployment view\'s seven node identities and order, four group labels/tier values and memberships, seven labeled/explained relations with evidence, plus title, question, takeaway, and source locator.'},
  {path:modelPath,sha256:modelDigest,pointer:'/view/deployment, selected /element records, /relation records',label:'Cited HELIX architecture model',originalLocator:'helix:docs/helix/02-design/architecture-model.toml',resolvedSource:'helix/docs/helix/02-design/architecture-model.toml',description:'Exact TOML bytes resolved from the fixture locator. The deployment view provides its ordered element selection/title/takeaway; selected elements supply names, details, kinds, statuses, evidence, zones and tiers; relation records supply endpoint, caption, explanation, status, evidence and the numbered/optional walkthrough notes.'}
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/helix-deployment/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:modelPath,sha256:modelDigest,outputPath:'reviews/helix-deployment/architecture-model.toml',mediaType:'application/toml',description:'Exact cited architecture-model TOML bytes published without transformation.'}
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:helix-deployment',visualId:'helix-deployment',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/helix-deployment/authoritative-source.json',scope});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
