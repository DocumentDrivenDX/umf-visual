// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {parse as parseYaml} from 'yaml';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/beacon-ci-preview.json';
const workflowPath='fixtures/visual/sources/beacon/workflows/preview.yml';
const definitionPath='fixtures/reviews/definitions/beacon-ci-preview.json';
const manifestPath='fixtures/reviews/review-sources.json';
const base='/extensions/umf.visual';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
const sourceBytes=readFileSync(sourcePath),source=read<Document>(sourcePath),sourceVisual=getVisual(source) as Visual;
const definitionBytes=readFileSync(definitionPath),definition=JSON.parse(definitionBytes.toString('utf8')) as Document,visual=getVisual(definition) as Visual;

test('preview source fixture remains exact and retains its original IDs, labels, takeaway and dependency chain',()=>{
 expect(hash(sourceBytes)).toBe('0809b7d8f348225a50e5549aaefd4a128a5132311be5b52300129d3dc9aa3872');
 expect(source.id).toBe('visual:beacon-ci-preview');expect(source.umf).toBe('0.10.0');expect(source.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(sourceVisual).toMatchObject({id:'beacon-ci-preview',kind:'flow',form:'pipeline',title:'Preview',question:'What runs, in what order, when preview.yml starts?',takeaway:'Starts on pull_request.',audience:'developer'});
 expect(sourceVisual.source).toEqual({path:'umf:fixtures/visual/sources/beacon/workflows/preview.yml',digest:'sha256:bfdf92086a2c3ec04c7dc246c760c2e4460e285a7e0cbeb836bab27aa5fac0e9'});
 expect(sourceVisual.nodes).toEqual([{id:'build',label:'build',detail:'ubuntu-latest'},{id:'preview',label:'Deploy a preview',detail:'ubuntu-latest'},{id:'smoke',label:'Smoke-test the preview',detail:'ubuntu-latest'}]);
 expect(sourceVisual.edges).toEqual([{id:'build--preview',from:'build',to:'preview'},{id:'preview--smoke',from:'preview',to:'smoke'}]);
 expect(sourceVisual.layout).toBeUndefined();expect(sourceVisual.steps).toBeUndefined();expect(sourceVisual.omissions).toBeUndefined();expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 const json=readVisualDocument(sourceBytes.toString('utf8'),'json');expect(JSON.parse(writeVisualDocument(json,'json'))).toEqual(source);
 const yaml=writeVisualDocument(json,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');expect(getVisual(yamlRead)).toEqual(sourceVisual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
});

test('review enrichment derives only the exact runner and command details from preview.yml',()=>{
 const workflowBytes=readFileSync(workflowPath),digest=hash(workflowBytes),workflow=parseYaml(workflowBytes.toString('utf8')) as {name:string;on:string;jobs:Record<string,{name?:string;needs?:string;'runs-on':string;steps:Array<{run:string}>}>};
 expect(digest).toBe('bfdf92086a2c3ec04c7dc246c760c2e4460e285a7e0cbeb836bab27aa5fac0e9');expect(sourceVisual.source?.digest).toBe(`sha256:${digest}`);
 expect(workflow.name).toBe('Preview');expect(workflow.on).toBe('pull_request');
 expect(workflow.jobs.build?.['runs-on']).toBe('ubuntu-latest');expect(workflow.jobs.build?.steps[0]?.run).toBe('make build');
 expect(workflow.jobs.preview?.needs).toBe('build');expect(workflow.jobs.preview?.['runs-on']).toBe('ubuntu-latest');expect(workflow.jobs.preview?.steps[0]?.run).toBe('make preview');
 expect(workflow.jobs.smoke?.needs).toBe('preview');expect(workflow.jobs.smoke?.['runs-on']).toBe('ubuntu-latest');expect(workflow.jobs.smoke?.steps[0]?.run).toBe('make smoke');
 expect(hash(sourceBytes)).toBe('0809b7d8f348225a50e5549aaefd4a128a5132311be5b52300129d3dc9aa3872');
 expect(definition.id).toBe(source.id);expect(definition.umf).toBe(source.umf);expect(definition.vocabularies?.['umf.visual']?.version).toBe(source.vocabularies?.['umf.visual']?.version);
 expect(visual).toMatchObject({id:sourceVisual.id,kind:sourceVisual.kind,form:sourceVisual.form,title:sourceVisual.title,question:sourceVisual.question,takeaway:sourceVisual.takeaway,audience:sourceVisual.audience,source:sourceVisual.source});
 expect(visual.nodes?.map(({id,label})=>({id,label}))).toEqual(sourceVisual.nodes?.map(({id,label})=>({id,label})));
 expect(visual.nodes?.map(({id,detail})=>({id,detail}))).toEqual(['build','preview','smoke'].map(id=>({id,detail:`${workflow.jobs[id]!['runs-on']} · ${workflow.jobs[id]!.steps[0]!.run}`})));
 expect(visual.edges).toEqual(sourceVisual.edges);expect(visual.layout).toBeUndefined();expect(inspectVisual(definition)).toMatchObject({valid:true,complete:true});
 const roundtrip=readVisualDocument(definitionBytes.toString('utf8'),'json'),yaml=writeVisualDocument(roundtrip,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(definition);
});

test('preview review binds and publishes unchanged UMF source bytes plus the exact YAML snapshot',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(item=>item.id==='beacon-ci-preview')!;
 const digest=hash(sourceBytes),workflowDigest=hash(readFileSync(workflowPath)),definitionDigest=hash(definitionBytes);
 expect(row).toMatchObject({id:'beacon-ci-preview',title:'Preview',kind:'flow',form:'pipeline',definitionPath,definitionSha256:definitionDigest});
 expect(row.sources).toEqual([
  {path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 source fixture supplies the original IDs, title, question, takeaway, graph, and provenance fields.'},
  {path:workflowPath,sha256:workflowDigest,pointer:'/',label:'Checked-in preview workflow snapshot',description:'The local YAML snapshot bytes match the digest cited in the original UMF source. The review derives each job runner and exact command from this snapshot.'},
 ]);
 expect(row.publishedAssets).toEqual([
  {path:sourcePath,sha256:digest,outputPath:'reviews/beacon-ci-preview/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes; this original remains available unchanged.'},
  {path:workflowPath,sha256:workflowDigest,outputPath:'reviews/beacon-ci-preview/preview.yml',mediaType:'application/yaml',description:'Exact checked-in workflow snapshot bytes used for the reviewed runner and command annotations.'},
 ]);
 expect(row.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,documentId:'visual:beacon-ci-preview',visualId:'beacon-ci-preview',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/beacon-ci-preview/authoritative-source.json',scope:'The original UMF fixture remains authoritative for its three node IDs/labels, two directed edge IDs/endpoints, title, question, original takeaway, audience, and historical source locator; its bytes remain available unchanged. This separate reviewed Visual 1.0.0 definition preserves that source and derives only the three runner and exact-command details from the checked-in preview YAML snapshot whose SHA-256 matches the source locator. The original takeaway remains a source-authored claim. The historical locator and matching local snapshot do not establish current workflow contents, execution, or repository state.'});
 const verification=await verifyReviewSourceEvidence();expect(verification.examples).toBe(manifest.examples.length);
});

test('preview pipeline plan maps exactly three authored nodes and two ordered edges on every backend',()=>{
 const before=JSON.stringify(definition);
 for(const backend of ['graphviz','mermaid','lini'] as const){
  const plan=compilePresentation(definition,{backend,theme:'presentation/1'});expect(plan.ok,backend).toBe(true);if(!plan.ok)continue;
  expect(plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(3);expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(2);
  for(const[index,id]of ['build','preview','smoke'].entries())expect(plan.elementMap).toContainEqual({logicalId:id,sourcePath:`${base}/nodes/${index}${backend==='lini'?'/id':''}`,nativeId:`n${index+1}`,kind:'node'});
  for(const[index,id]of ['build--preview','preview--smoke'].entries())expect(plan.elementMap).toContainEqual({logicalId:id,sourcePath:`${base}/edges/${index}`,nativeId:`e${index+1}`,kind:'edge'});
  expect(plan.elementMap.some(item=>item.kind==='edge'&&!['build--preview','preview--smoke'].includes(item.logicalId))).toBe(false);
 }
 expect(JSON.stringify(definition)).toBe(before);
});
