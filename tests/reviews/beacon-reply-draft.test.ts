// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/beacon-reply-draft.json';
const modelPath='fixtures/visual/sources/beacon/architecture-model.toml';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
const sourceBytes=readFileSync(sourcePath),source=read<Document>(sourcePath),visual=getVisual(source) as Visual;
const modelBytes=readFileSync(modelPath),model=Bun.TOML.parse(modelBytes.toString('utf8')) as any;
const journey=model.journey.find((candidate:any)=>candidate.id==='reply-draft')!;
const manifest=read<{examples:Array<any>}>(manifestPath),review=manifest.examples.find(item=>item.id==='beacon-reply-draft')!;
const sentenceCase=(value:string)=>value.charAt(0).toUpperCase()+value.slice(1);
const role=(element:any)=>element.kind==='person'?'actor':element.kind==='store'?'store':element.kind==='external'&&element.owner==='platform'?'platform':'own';

test('reply-draft is an exact sequence alias of the source journey in journey order',()=>{
 const digest=hash(sourceBytes),modelDigest=hash(modelBytes);
 expect(digest).toBe('27bd905cb5b93ba2f7f788375c6ea07f6ee06e92f6592f5e153f884a9448a9a5');
 expect(modelDigest).toBe('5506076ecd96344bd6b203c4d2a36ed983a7d9c37883c0e4dc65f9a59f689910');
 expect(modelBytes.toString('utf8')).toContain("A fictional system's architecture model");
 expect(source).toMatchObject({id:'visual:beacon-reply-draft',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'beacon-reply-draft',kind:'sequence',form:'lifelines',title:journey.title,takeaway:journey.takeaway,audience:'developer'});
 expect(visual.source).toEqual({path:`umf:${modelPath}`,view:'reply-draft',digest:`sha256:${modelDigest}`});
 const participantIds=[...new Set((journey.step as any[]).flatMap(step=>[step.from,step.to]))];
 const elements=participantIds.map(id=>model.element.find((element:any)=>element.id===id));
 expect(participantIds).toEqual(['agent','proxy','web','api','db','drafter','gateway','models']);
 expect(visual.sequence?.participants).toHaveLength(8);
 expect(visual.sequence?.participants?.map(({id,label,detail,role:participantRole,status})=>({id,label,...(detail===undefined?{}:{detail}),role:participantRole,status}))).toEqual(elements.map((element:any)=>({id:element.id,label:element.name,...(element.detail===undefined?{}:{detail:element.detail}),role:role(element),status:element.status})));
 expect(visual.sequence?.messages).toHaveLength(8);
 expect(visual.sequence?.messages?.map(({id,from,to,label,kind})=>({id,from,to,label,kind}))).toEqual((journey.step as any[]).map((step:any,index:number)=>({id:`m${index+1}`,from:step.from,to:step.to,label:step.label,kind:model.relation.some((relation:any)=>relation.from===step.from&&relation.to===step.to&&relation.label===step.label&&relation.kind==='return')?'return':'call'})));
 expect(visual.sequence?.messages?.at(-1)).toMatchObject({id:'m8',from:'api',to:'web',label:'returns the draft',kind:'return'});
 expect(visual.steps?.map(({id,title,focus})=>({id,title,focus}))).toEqual((journey.step as any[]).map((step:any,index:number)=>({id:`s${index+1}`,title:sentenceCase(step.label),focus:[`m${index+1}`]})));
 expect(visual.question).toBe('What happens when an agent asks for a draft?');
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 const json=readVisualDocument(sourceBytes.toString('utf8'),'json');expect(JSON.parse(writeVisualDocument(json,'json'))).toEqual(source);
 const yaml=writeVisualDocument(json,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');expect(getVisual(yamlRead)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
 const payload=visualPayloadYaml(source);for(const step of journey.step)expect(payload).toContain(step.label);
 expect(hash(readFileSync(sourcePath))).toBe(digest);expect(hash(readFileSync(modelPath))).toBe(modelDigest);
});

test('reply-draft review binds and publishes the original UMF fixture and exact fictional TOML bytes',async()=>{
 const digest=hash(sourceBytes),modelDigest=hash(modelBytes);
 expect(review).toMatchObject({id:'beacon-reply-draft',title:'Drafting a reply',kind:visual.kind,form:visual.form,definitionPath:sourcePath,definitionSha256:digest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies the eight participant fields, eight ordered message fields including their UMF call/return kinds, eight focused steps, the question, and the source locator.'},
  {path:modelPath,sha256:modelDigest,pointer:'/journey/reply-draft',label:'Fictional architecture-model source',description:'The exact checked-in TOML bytes define the `reply-draft` journey and its eight ordered from/to/label steps; participant fields are drawn from the matching source elements, and the final step also matches the source relation explicitly marked `return`. The source labels the model fictional.'},
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:digest,outputPath:'reviews/beacon-reply-draft/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:modelPath,sha256:modelDigest,outputPath:'reviews/beacon-reply-draft/architecture-model.toml',mediaType:'application/toml',description:'Exact fictional architecture-model TOML bytes cited by the original UMF fixture.'},
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,documentId:'visual:beacon-reply-draft',visualId:'beacon-reply-draft',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/beacon-reply-draft/authoritative-source.json',scope:'This exact UMF fixture JSON is the review definition. It preserves eight participant identities and fields, eight ordered messages and their authored UMF call/return kinds, and eight steps focused one-to-one on those messages. The TOML `reply-draft` journey supplies eight ordered from/to/label steps; its matching elements supply the participant names, details, kinds and statuses. The final step matches the TOML relation explicitly marked `return`; the journey itself has no message-kind field, so the other seven UMF `call` kinds are fixture-authored defaults, not explicit TOML declarations. The first-appearance participant order, step titles/focus, and the fixture question are UMF projections; the TOML journey has no question field. The architecture-model source identifies itself as fictional. Neither file establishes activations, durations, concurrency, current state, or deployment.'});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
