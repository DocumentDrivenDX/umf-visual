// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import type {Document} from '@umf/core';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/forms/helix-request-ladder.json';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;

test('HELIX request ladder is an exact authoritative source with preserved participant, message, and step meanings',()=>{
 const raw=readFileSync(sourcePath),digest=hash(raw),source=JSON.parse(raw.toString('utf8')) as Document,reviewed=read<Document>(sourcePath),visual=getVisual(reviewed) as Visual;
 expect(digest).toBe('4cbfdea885f1e336ebf9602e06c8fcaef19d9be781280d99512609f636ff949e');
 expect(reviewed).toEqual(source);
 expect(reviewed.id).toBe('visual:helix-request-ladder');expect(reviewed.umf).toBe('0.10.0');expect(reviewed.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(visual.id).toBe('helix-request-ladder');expect(visual.kind).toBe('sequence');expect(visual.form).toBe('ladder');
 expect(visual.title).toBe('A request becomes a governing document');
 expect(visual.question).toBe('How does a request become a governing document, on a narrow screen?');
 expect(visual.takeaway).toBe('The runtime acts; HELIX gives it the scope, the shape, and the record.');expect(visual.audience).toBe('developer');
 expect(visual.source).toEqual({path:'helix:docs/helix/02-design/architecture-model.toml',view:'request',digest:'sha256:6e13adabec034747ed6d5505668e1daef353a3df6d2c54f3e4ff799cb92acff2'});
 const participants=visual.sequence?.participants??[],messages=visual.sequence?.messages??[],steps=visual.steps??[];
 expect(participants).toHaveLength(6);
 expect(participants.map(({id,label,detail,role,status})=>({id,label,detail,role,status}))).toEqual([
  {id:'team',label:'Software team',detail:'sets intent',role:'actor',status:'built'},
  {id:'runtime',label:'Agent runtime',detail:'model, tools, execution',role:'external',status:'built'},
  {id:'skill',label:'Routing skill',detail:'resolves scope and mode',role:'own',status:'built'},
  {id:'marker',label:'.helix.yml',detail:'project scope',role:'store',status:'built'},
  {id:'catalog',label:'Artifact catalog',detail:'templates, prompts, rules',role:'store',status:'built'},
  {id:'docs',label:'Project documents',detail:'intent, design, tests',role:'store',status:'built'},
 ]);
 expect(messages).toHaveLength(6);
 expect(messages.map(({id,from,to,label,kind})=>({id,from,to,label,kind}))).toEqual([
  {id:'m1',from:'team',to:'runtime',label:'asks for work',kind:'call'},
  {id:'m2',from:'runtime',to:'skill',label:'loads the skill',kind:'call'},
  {id:'m3',from:'skill',to:'marker',label:'reads the scope',kind:'call'},
  {id:'m4',from:'skill',to:'catalog',label:'reads the artifact type',kind:'call'},
  {id:'m5',from:'skill',to:'docs',label:'authors and reconciles',kind:'call'},
  {id:'m6',from:'docs',to:'runtime',label:'governs what runs next',kind:'return'},
 ]);
 expect(steps).toEqual([
  {id:'s1',title:'Asks for work',focus:['m1']},
  {id:'s2',title:'Loads the skill',focus:['m2']},
  {id:'s3',title:'Reads the scope',focus:['m3']},
  {id:'s4',title:'Reads the artifact type',focus:['m4']},
  {id:'s5',title:'Authors and reconciles',focus:['m5']},
  {id:'s6',title:'Governs what runs next',focus:['m6']},
 ]);
 expect(messages.every(message=>message.kind==='call'||message.kind==='return')).toBe(true);
 expect(reviewed.extensions?.['umf.visual']).not.toHaveProperty('timeline');
 expect(reviewed.extensions?.['umf.visual']).not.toHaveProperty('state');
 expect(reviewed.extensions?.['umf.visual']).not.toHaveProperty('layout');
 expect(visual.sequence).not.toHaveProperty('lifelines');
 expect(inspectVisual(reviewed)).toMatchObject({valid:true,complete:true});
 const jsonRead=readVisualDocument(raw.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(jsonRead,'json'))).toEqual(source);
 const yaml=writeVisualDocument(jsonRead,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(visual);
 expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
});

test('request-ladder review binds exact authoritative bytes and makes no external-source validation claim',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(item=>item.id==='helix-request-ladder')!,bytes=readFileSync(sourcePath),digest=hash(bytes);
 expect(row.title).toBe('A request becomes a governing document');expect(row.definitionPath).toBe(sourcePath);expect(row.definitionSha256).toBe(digest);
 expect(row.sources).toEqual([{path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The checked-in Visual 1.0.0 fixture JSON is the complete definition and is used byte-for-byte as the review definition.'}]);
 expect(row.publishedAssets).toEqual([{path:sourcePath,sha256:digest,outputPath:'reviews/helix-request-ladder/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'}]);
 expect(row.originalEvidence).toEqual({
  kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,
  documentId:'visual:helix-request-ladder',visualId:'helix-request-ladder',envelopeVersion:'0.10.0',modelVersion:'1.0.0',
  sourceDownloadPath:'reviews/helix-request-ladder/authoritative-source.json',
  scope:'This exact UMF fixture JSON is the review definition. Participant, message, and step IDs, labels, roles, statuses, endpoints, kinds, focus references, and array order remain source-authored. The path and digest are locator metadata and do not verify bytes of the referenced architecture file. The directed call/return message sequence adds no inferred lanes, activation periods, durations, or business-role meaning.'
 });
 expect(row.originalEvidence.scope).not.toContain('verified external');
 await verifyReviewSourceEvidence();
});
