// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/helix-request.json';
const definitionPath='fixtures/reviews/definitions/helix-request.json';
const modelPath='fixtures/visual/sources/helix/architecture-model.toml';
const manifestPath='fixtures/reviews/review-sources.json';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=readFileSync(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,visual=getVisual(source) as Visual;
const definitionBytes=readFileSync(definitionPath),definition=readVisualDocument(definitionBytes.toString('utf8'),'json') as Document,reviewed=getVisual(definition) as Visual;
const modelBytes=readFileSync(modelPath),model=Bun.TOML.parse(modelBytes.toString('utf8')) as any;
const view=model.view.find((candidate:any)=>candidate.id==='request')!;
const journey=model.journey.find((candidate:any)=>candidate.id===view.journey)!;
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='helix-request')!;
const roleFor=(kind:string)=>kind==='person'?'actor':kind==='external'?'external':kind==='container'?'own':kind==='store'?'store':undefined;

test('HELIX request sequence preserves the selected journey and exact participant provenance',()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),modelDigest=sha(modelBytes);
 expect(sourceDigest).toBe('48e390ee13102a71008162e8b69a5155c4817979f4eb45ebbfa73bc2477c6545');
 expect(definitionDigest).toBe('081e68ee39088788548a6e0cf96f3fc2ebc84a623080402dc14f57370873ee7d');
 expect(modelDigest).toBe('6e13adabec034747ed6d5505668e1daef353a3df6d2c54f3e4ff799cb92acff2');
 expect(source).toMatchObject({id:'visual:helix-request',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(view).toMatchObject({id:'request',type:'journey',journey:'request',elements:[]});
 expect(journey).toMatchObject({id:'request',title:'A request becomes a governing document',takeaway:'The runtime acts; HELIX gives it the scope, the shape, and the record.'});
 expect(visual).toMatchObject({id:'helix-request',kind:'sequence',form:'lifelines',title:journey.title,question:'How does a request become a governing document?',takeaway:journey.takeaway,audience:'developer'});
 expect(visual.source).toEqual({path:'helix:docs/helix/02-design/architecture-model.toml',view:'request',digest:`sha256:${modelDigest}`});
 const journeySteps=journey.step as any[];
 expect(journeySteps).toHaveLength(6);expect(visual.sequence?.messages).toHaveLength(6);expect(visual.sequence?.participants).toHaveLength(6);expect(visual.steps).toHaveLength(6);
 expect(visual.sequence!.messages.map(({id,from,to,label,kind,status,evidence})=>({id,from,to,label,kind,status,evidence}))).toEqual(journeySteps.map((step,index)=>({id:`m${index+1}`,from:step.from,to:step.to,label:step.label,kind:index===5?'return':'call',status:undefined,evidence:undefined})));
 expect(visual.steps!.map(({id,title,caption,focus,when,tag})=>({id,title,caption,focus,when,tag}))).toEqual(journeySteps.map((step,index)=>({id:`s${index+1}`,title:step.label[0].toUpperCase()+step.label.slice(1),caption:undefined,focus:[`m${index+1}`],when:undefined,tag:undefined})));
 const firstSeenNodeIds=[...new Set(journeySteps.flatMap(step=>[step.from,step.to]))] as string[];
 expect(firstSeenNodeIds).toEqual(visual.sequence!.participants.map(participant=>participant.id));
 const selected=firstSeenNodeIds.map(id=>model.element.find((element:any)=>element.id===id));
 expect(visual.sequence!.participants.map(({id,label,detail,role,status})=>({id,label,detail,role,status}))).toEqual(selected.map((element:any)=>({id:element.id,label:element.name,detail:element.detail,role:roleFor(element.kind),status:element.status})));
 expect(model.element.find((element:any)=>element.id==='documentor')).toBeDefined();expect(firstSeenNodeIds).not.toContain('documentor');
 expect(visual.sequence!.participants.every(participant=>participant.evidence===undefined)).toBe(true);
 expect(reviewed.sequence!.participants.map(({id,label,detail,role,status,evidence})=>({id,label,detail,role,status,evidence}))).toEqual(selected.map((element:any)=>({id:element.id,label:element.name,detail:element.detail,role:roleFor(element.kind),status:element.status,evidence:element.evidence})));
 expect(reviewed.sequence!.messages).toEqual(visual.sequence!.messages);expect(reviewed.steps).toEqual(visual.steps);
 const relations=model.relation as any[];
 expect(relations).toHaveLength(7);expect(relations.slice(0,6).map((relation:any)=>relation.step)).toEqual([1,2,3,4,5,6]);
 expect(relations[6].why).toBe('optional host tooling');
 expect(visual.sequence!.messages.every(message=>message.status===undefined&&message.evidence===undefined)).toBe(true);
 expect(visual.steps!.every(step=>step.caption===undefined)).toBe(true);
 expect(visual.sequence!.messages.at(-1)).toMatchObject({from:'docs',to:'runtime',kind:'return'});
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});expect(inspectVisual(definition)).toMatchObject({valid:true,complete:true});
 const expectedDefinition=structuredClone(source) as any;
 for(const participant of expectedDefinition.extensions['umf.visual'].sequence.participants){const element=selected.find((candidate:any)=>candidate.id===participant.id);participant.evidence=element.evidence;}
 expect(definition).toEqual(expectedDefinition);
 const originalBefore=JSON.stringify(source),sourceRoundtrip=readVisualDocument(sourceBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(sourceRoundtrip,'json'))).toEqual(source);
 const definitionYaml=writeVisualDocument(definition,'yaml'),definitionYamlRead=readVisualDocument(definitionYaml,'yaml');
 expect(getVisual(definitionYamlRead)).toEqual(reviewed);expect(JSON.parse(writeVisualDocument(definitionYamlRead,'json'))).toEqual(definition);
 const payload=visualPayloadYaml(definition);for(const participant of reviewed.sequence!.participants)for(const evidence of participant.evidence??[])expect(payload).toContain(evidence.path);
 expect(JSON.stringify(source)).toBe(originalBefore);expect(sha(readFileSync(sourcePath))).toBe(sourceDigest);expect(sha(readFileSync(definitionPath))).toBe(definitionDigest);expect(sha(readFileSync(modelPath))).toBe(modelDigest);
});

test('HELIX request review binds original fixture and exact architecture model bytes',async()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),modelDigest=sha(modelBytes);
 const scope="The original Visual 1.0.0 fixture remains unchanged and is published byte-for-byte. The separate reviewed Visual 1.0.0 definition adds only each selected participant's exact source element `evidence` array; all other payload fields are unchanged. The cited architecture-model TOML bytes match the fixture digest exactly. The request view explicitly points to journey `request`; its six ordered from/to/label steps, title, and takeaway match the six sequence message endpoints/labels, six step titles/focus IDs, sequence title, and takeaway. Participants are the first-seen unique journey endpoints and match source element IDs/labels/details/kinds/statuses/evidence through fixture role mappings. The final message `kind: return` is a Visual sequence projection for the final docs-to-runtime journey step, not an explicit journey field. The question, audience, form, kind, message/step IDs, call/return classifications, and role values are Visual fixture projections. Other source relations, notes, jobs, and the optional documentor relation belong to other model projections and are not merged into this request journey. The source evidence strings are authored provenance records, not independently checked citations or current operational facts. No current execution/deployment claim is made.";
 expect(review).toMatchObject({id:'helix-request',title:'A request becomes a governing document',kind:'sequence',form:'lifelines',definitionPath,definitionSha256:definitionDigest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies six participants, six ordered messages and focus steps, call/return kinds, role/status fields, title, question, takeaway, audience, and source locator.'},
  {path:modelPath,sha256:modelDigest,pointer:'/view/request, /journey/request and endpoint /element records',label:'Cited HELIX architecture model',originalLocator:'helix:docs/helix/02-design/architecture-model.toml',resolvedSource:'helix/docs/helix/02-design/architecture-model.toml',description:'Exact TOML bytes resolved from the fixture locator. The request view points to journey `request`, whose six ordered endpoint/label steps supply the sequence message order and labels; first-seen endpoints select participant element labels/details/kinds/status/evidence.'}
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/helix-request/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:modelPath,sha256:modelDigest,outputPath:'reviews/helix-request/architecture-model.toml',mediaType:'application/toml',description:'Exact cited architecture-model TOML bytes published without transformation.'}
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:helix-request',visualId:'helix-request',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/helix-request/authoritative-source.json',scope});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
