// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {parse as parseYaml} from 'yaml';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/beacon-ci-nightly.json';
const workflowPath='fixtures/visual/sources/beacon/workflows/nightly.yml';
const definitionPath='fixtures/reviews/definitions/beacon-ci-nightly.json';
const manifestPath='fixtures/reviews/review-sources.json';
const base='/extensions/umf.visual';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
const sourceBytes=readFileSync(sourcePath),source=read<Document>(sourcePath),sourceVisual=getVisual(source) as Visual;
const definitionBytes=readFileSync(definitionPath),definition=JSON.parse(definitionBytes.toString('utf8')) as Document,visual=getVisual(definition) as Visual;

test('nightly source fixture remains exact and retains only its authored graph facts',()=>{
 expect(hash(sourceBytes)).toBe('98c57c8abfc9f2ad7058c76577d8e51fafffa4330c74e42141852f6c95beb427');
 expect(sourceVisual).toMatchObject({id:'beacon-ci-nightly',kind:'flow',form:'pipeline',title:'Nightly',question:'What runs, in what order, when nightly.yml starts?',takeaway:'Starts on schedule, workflow_dispatch.',audience:'developer'});
 expect(source.id).toBe('visual:beacon-ci-nightly');expect(source.umf).toBe('0.10.0');expect(source.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(sourceVisual.source).toEqual({path:'umf:fixtures/visual/sources/beacon/workflows/nightly.yml',digest:'sha256:2ceec4ca0d9eef1e92f16bb2b86ca25281bad95ec1a1f8126ad7924bfe323c1a'});
 expect(sourceVisual.nodes).toEqual([{id:'eval',label:'Draft quality evaluation',detail:'ubuntu-latest'},{id:'report',label:'report',detail:'reuses ./.github/workflows/report.yml'}]);
 expect(sourceVisual.edges).toEqual([{id:'eval--report',from:'eval',to:'report'}]);
 expect(sourceVisual.layout).toBeUndefined();expect(sourceVisual.steps).toBeUndefined();expect(sourceVisual.omissions).toBeUndefined();
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 const json=readVisualDocument(sourceBytes.toString('utf8'),'json');expect(JSON.parse(writeVisualDocument(json,'json'))).toEqual(source);
 const yaml=writeVisualDocument(json,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');expect(getVisual(yamlRead)).toEqual(sourceVisual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
});

test('reviewed nightly claim is derived only from the exact workflow snapshot and keeps source identity',()=>{
 const workflowBytes=readFileSync(workflowPath),digest=hash(workflowBytes),workflow=parseYaml(workflowBytes.toString('utf8')) as {name:string;on:{schedule:Array<{cron:string}>;workflow_dispatch:unknown};jobs:Record<string,{name?:string;'runs-on'?:string;steps?:Array<{run:string}>;needs?:string;uses?:string}>};
 expect(digest).toBe('2ceec4ca0d9eef1e92f16bb2b86ca25281bad95ec1a1f8126ad7924bfe323c1a');
 expect(sourceVisual.source?.digest).toBe(`sha256:${digest}`);expect(workflow.name).toBe('Nightly');
 expect(workflow.on.schedule).toEqual([{cron:'0 3 * * *'}]);expect(workflow.on.workflow_dispatch).toBeNull();
 expect(workflow.jobs.eval?.['runs-on']).toBe('ubuntu-latest');expect(workflow.jobs.eval?.steps?.[0]?.run).toBe('make eval');
 expect(workflow.jobs.report?.needs).toBe('eval');expect(workflow.jobs.report?.uses).toBe('./.github/workflows/report.yml');
 expect(hash(sourceBytes)).toBe('98c57c8abfc9f2ad7058c76577d8e51fafffa4330c74e42141852f6c95beb427');
 expect(definition.id).toBe(source.id);expect(definition.umf).toBe(source.umf);expect(definition.vocabularies?.['umf.visual']?.version).toBe(source.vocabularies?.['umf.visual']?.version);
 expect(visual).toMatchObject({id:sourceVisual.id,kind:sourceVisual.kind,form:sourceVisual.form,title:sourceVisual.title,question:sourceVisual.question,audience:sourceVisual.audience,source:sourceVisual.source});
 expect(visual.takeaway).toBe('Schedule: 0 3 * * *; also workflow_dispatch.');
 expect(visual.nodes?.map(({id,label})=>({id,label}))).toEqual(sourceVisual.nodes?.map(({id,label})=>({id,label})));
 expect(visual.nodes?.map(({id,detail})=>({id,detail}))).toEqual([
  {id:'eval',detail:`${workflow.jobs.eval!['runs-on']} · ${workflow.jobs.eval!.steps![0]!.run}`},
  {id:'report',detail:sourceVisual.nodes?.[1]?.detail},
 ]);
 expect(visual.edges).toEqual(sourceVisual.edges);expect(visual.layout).toBeUndefined();expect(inspectVisual(definition)).toMatchObject({valid:true,complete:true});
 const roundtrip=readVisualDocument(definitionBytes.toString('utf8'),'json'),yaml=writeVisualDocument(roundtrip,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(definition);
});

test('nightly review binds the original fixture and exact YAML as separately downloadable sources',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(item=>item.id==='beacon-ci-nightly')!;
 const digest=hash(sourceBytes),workflowDigest=hash(readFileSync(workflowPath)),definitionDigest=hash(definitionBytes);
 expect(row).toMatchObject({id:'beacon-ci-nightly',title:'Nightly',kind:'flow',form:'pipeline',definitionPath,definitionSha256:definitionDigest});
 expect(row.sources).toEqual([
  {path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 source fixture supplies the original IDs, title, question, graph, and provenance fields.'},
  {path:workflowPath,sha256:workflowDigest,pointer:'/',label:'Checked-in nightly workflow snapshot',description:'The local YAML snapshot bytes match the digest cited in the original UMF source. The review derives the raw schedule expression, manual-dispatch trigger, runner, and eval command from this snapshot.'},
 ]);
 expect(row.publishedAssets).toEqual([
  {path:sourcePath,sha256:digest,outputPath:'reviews/beacon-ci-nightly/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes; this original remains available unchanged.'},
  {path:workflowPath,sha256:workflowDigest,outputPath:'reviews/beacon-ci-nightly/nightly.yml',mediaType:'application/yaml',description:'Exact checked-in workflow snapshot bytes used for the reviewed schedule, manual-dispatch, runner, and command annotations.'},
 ]);
 expect(row.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,documentId:'visual:beacon-ci-nightly',visualId:'beacon-ci-nightly',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/beacon-ci-nightly/authoritative-source.json',scope:'The original UMF fixture remains the authoritative source for its two node IDs and labels, one directed edge ID/endpoints, title, question, audience, and historical source locator; its bytes remain available unchanged. This separate reviewed Visual 1.0.0 definition adds the raw schedule expression `0 3 * * *`, the workflow_dispatch claim, and the eval runner/command from the exact checked-in nightly YAML snapshot whose SHA-256 matches the locator digest in the original UMF source. It preserves the report node\'s authored reusable-workflow path without inferring that workflow\'s internals. The historical source locator does not establish timezone, current workflow contents, execution, report behavior, or repository state.'});
 const verification=await verifyReviewSourceEvidence();expect(verification.examples).toBe(manifest.examples.length);
});

test('nightly pipeline plan retains the two source nodes and one authored edge on each supported backend',()=>{
 const before=JSON.stringify(definition);
 for(const backend of ['graphviz','mermaid','lini'] as const){
  const plan=compilePresentation(definition,{backend,theme:'presentation/1'});expect(plan.ok,backend).toBe(true);if(!plan.ok)continue;
  expect(plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(2);
  expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(1);
  for(const[index,id]of ['eval','report'].entries())expect(plan.elementMap).toContainEqual({logicalId:id,sourcePath:`${base}/nodes/${index}${backend==='lini'?'/id':''}`,nativeId:`n${index+1}`,kind:'node'});
  expect(plan.elementMap).toContainEqual({logicalId:'eval--report',sourcePath:`${base}/edges/0`,nativeId:'e1',kind:'edge'});
  expect(plan.elementMap.some(item=>item.kind==='edge'&&item.logicalId!=='eval--report')).toBe(false);
  expect(plan.source).toContain(backend==='mermaid'?'n1 --> n2':'n1 -> n2');
 }
 expect(JSON.stringify(definition)).toBe(before);
});
