// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {parse as parseYaml} from 'yaml';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/beacon-ci-ci.json';
const workflowPath='fixtures/visual/sources/beacon/workflows/ci.yml';
const definitionPath='fixtures/reviews/definitions/beacon-ci-ci.json';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
const nodes=[
 {id:'lint',label:'lint',detail:'ubuntu-latest'},
 {id:'test',label:'test',detail:'ubuntu-latest'},
 {id:'migrations',label:'Migrations apply cleanly',detail:'ubuntu-latest'},
 {id:'build',label:'build',detail:'ubuntu-latest'},
 {id:'deploy',label:'Deploy to the app platform',detail:'ubuntu-latest'},
];
const edges=[
 {id:'lint--build',from:'lint',to:'build'},
 {id:'test--build',from:'test',to:'build'},
 {id:'migrations--build',from:'migrations',to:'build'},
 {id:'build--deploy',from:'build',to:'deploy'},
];

test('CI pipeline fixture preserves exact source bytes and its authored dependency graph',()=>{
 const raw=readFileSync(sourcePath),digest=hash(raw),source=JSON.parse(raw.toString('utf8')) as Document,reviewed=read<Document>(sourcePath),visual=getVisual(reviewed) as Visual;
 expect(digest).toBe('33f9ecfe707727e71f8a8a57c93995184f70f751ab14969a64d1ecdda8b8c084');expect(reviewed).toEqual(source);
 expect(reviewed.id).toBe('visual:beacon-ci-ci');expect(reviewed.umf).toBe('0.10.0');expect(reviewed.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(visual.id).toBe('beacon-ci-ci');expect(visual.kind).toBe('flow');expect(visual.form).toBe('pipeline');
 expect(visual.title).toBe('CI');expect(visual.question).toBe('What runs, in what order, when ci.yml starts?');
 expect(visual.takeaway).toBe('Starts on pull_request, push.');expect(visual.audience).toBe('developer');
 expect(visual.source).toEqual({path:'umf:fixtures/visual/sources/beacon/workflows/ci.yml',digest:'sha256:2a117bf9b9372c2c4e10d26c1abc40bc0c994bce5084a4c0c4b4af00036fe9c2'});
 expect(visual.nodes).toEqual(nodes);expect(visual.edges).toEqual(edges);
 expect(visual.edges?.filter(edge=>edge.to==='build').map(edge=>edge.from)).toEqual(['lint','test','migrations']);
 expect(visual.edges?.find(edge=>edge.id==='build--deploy')).toMatchObject({from:'build',to:'deploy'});
 expect(visual.layout).toBeUndefined();expect(visual.omissions).toBeUndefined();expect(visual.steps).toBeUndefined();
 expect(inspectVisual(reviewed)).toMatchObject({valid:true,complete:true});
 const jsonRead=readVisualDocument(raw.toString('utf8'),'json');expect(JSON.parse(writeVisualDocument(jsonRead,'json'))).toEqual(source);
 const yaml=writeVisualDocument(jsonRead,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
});

test('CI pipeline review publishes both original UMF bytes and the exact workflow snapshot',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(item=>item.id==='beacon-ci-ci')!;
 const bytes=readFileSync(sourcePath),digest=hash(bytes),definitionBytes=readFileSync(definitionPath),definitionDigest=hash(definitionBytes),workflowBytes=readFileSync(workflowPath),workflowDigest=hash(workflowBytes);
 expect(row.title).toBe('CI');expect(row.kind).toBe('flow');expect(row.form).toBe('pipeline');
 expect(row.definitionPath).toBe(definitionPath);expect(row.definitionSha256).toBe(definitionDigest);
 expect(row.sources).toEqual([
  {path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 source fixture supplies the original IDs, title, question, graph, and provenance fields.'},
  {path:workflowPath,sha256:workflowDigest,pointer:'/',label:'Checked-in CI workflow snapshot',description:'The local YAML snapshot bytes match the digest cited in the original UMF source. The review derives runner, command, and trigger text from this snapshot.'},
 ]);
 expect(row.publishedAssets).toEqual([
  {path:sourcePath,sha256:digest,outputPath:'reviews/beacon-ci-ci/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes; this original remains available unchanged.'},
  {path:workflowPath,sha256:workflowDigest,outputPath:'reviews/beacon-ci-ci/ci.yml',mediaType:'application/yaml',description:'Exact checked-in workflow snapshot bytes used for the reviewed runner, command, and trigger annotations.'},
 ]);
 expect(row.originalEvidence).toEqual({
  kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,documentId:'visual:beacon-ci-ci',visualId:'beacon-ci-ci',envelopeVersion:'0.10.0',modelVersion:'1.0.0',
  sourceDownloadPath:'reviews/beacon-ci-ci/authoritative-source.json',
  scope:'The original UMF fixture remains the authoritative source for its five node IDs, labels, four directed edge IDs/endpoints, title, question, audience, and historical source locator; its bytes remain available unchanged. This separate reviewed Visual 1.0.0 definition adds runner and single-command annotations, plus the concise takeaway, from the exact checked-in workflow YAML snapshot whose SHA-256 matches the locator digest in the original UMF source. It preserves three independent lint/test/migrations prerequisites to build and the build-to-deploy dependency, without inferring serial order among prerequisites. The historical source locator does not establish current workflow contents, execution, or repository state.'
 });
 expect(row.originalEvidence).not.toHaveProperty('classification');expect(row.originalEvidence).not.toHaveProperty('captureSha256');expect(row.originalEvidence).not.toHaveProperty('knownOmissions');
 const verified=await verifyReviewSourceEvidence();expect(verified.examples).toBe(manifest.examples.length);expect(verified.authoritativeSources).toBe(manifest.examples.filter(item=>item.originalEvidence.kind==='authoritative-umf-source').length);
});

test('reviewed CI definition derives trigger, runner and one exact command per job without changing source graph identity',()=>{
 const originalBytes=readFileSync(sourcePath),original=read<Document>(sourcePath),originalVisual=getVisual(original) as Visual;
 const definitionBytes=readFileSync(definitionPath),reviewed=JSON.parse(definitionBytes.toString('utf8')) as Document,reviewVisual=getVisual(reviewed) as Visual;
 const workflowBytes=readFileSync(workflowPath),workflowDigest=hash(workflowBytes),workflowText=workflowBytes.toString('utf8'),workflow=parseYaml(workflowText) as {name:string;on:{pull_request?:unknown;push?:{branches:string[]}};jobs:Record<string,{name?:string;'runs-on':string;steps:Array<{run:string}>}>};
 expect(hash(originalBytes)).toBe('33f9ecfe707727e71f8a8a57c93995184f70f751ab14969a64d1ecdda8b8c084');
 expect(originalVisual.source?.digest).toBe(`sha256:${workflowDigest}`);expect(workflow.name).toBe('CI');expect(workflow.on).toEqual({pull_request:null,push:{branches:['main']}});
 expect(reviewVisual.id).toBe(originalVisual.id);expect(reviewed.id).toBe(original.id);expect(reviewed.umf).toBe(original.umf);expect(reviewed.vocabularies?.['umf.visual']?.version).toBe(original.vocabularies?.['umf.visual']?.version);
 expect(reviewVisual.kind).toBe(originalVisual.kind);expect(reviewVisual.form).toBe(originalVisual.form);expect(reviewVisual.title).toBe(originalVisual.title);expect(reviewVisual.question).toBe(originalVisual.question);expect(reviewVisual.audience).toBe(originalVisual.audience);expect(reviewVisual.source).toEqual(originalVisual.source);
 expect(reviewVisual.takeaway).toBe('Starts on pull_request; push to main.');
 expect(reviewVisual.nodes?.map(({id,label})=>({id,label}))).toEqual(originalVisual.nodes?.map(({id,label})=>({id,label})));
 expect(reviewVisual.nodes?.map(({id,detail})=>({id,detail}))).toEqual(['lint','test','migrations','build','deploy'].map(id=>({id,detail:`${workflow.jobs[id]!['runs-on']} · ${workflow.jobs[id]!.steps[0]!.run}`})));
 expect(reviewVisual.edges).toEqual(originalVisual.edges);expect(reviewVisual.layout).toBeUndefined();expect(inspectVisual(reviewed)).toMatchObject({valid:true,complete:true});
 const roundtrip=readVisualDocument(definitionBytes.toString('utf8'),'json'),yaml=writeVisualDocument(roundtrip,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(reviewVisual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(reviewed);
});
