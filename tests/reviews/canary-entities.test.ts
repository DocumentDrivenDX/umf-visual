// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {rm,writeFile} from 'node:fs/promises';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import type {Document} from '@umf/core';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/catalog/canary-entities.json';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;

test('catalog canary review uses the exact authoritative 1.0 UMF source and preserves authored entity semantics',()=>{
 const raw=readFileSync(sourcePath),digest=hash(raw),source=JSON.parse(raw.toString('utf8')) as Document;
 const reviewed=read<Document>(sourcePath),visual=getVisual(reviewed) as Visual;
 expect(digest).toBe('6b101dd70cab0fbb10a87b195515d76d06f62828afe02d1f368afe417ecfbd6e');
 expect(reviewed).toEqual(source);
 expect(reviewed.id).toBe('visual:catalog-canary-entities');
 expect(reviewed.umf).toBe('0.10.0');
 expect(reviewed.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(visual.id).toBe('catalog-canary-entities');
 expect(visual.title).toBe('Entity relationship canary');
 expect(visual.question).toBe('Which records retain identity and field labels?');
 expect(visual.nodes?.map(node=>[node.id,node.label])).toEqual([
  ['record','A "quoted" record · 東京'],['event','Event & audit']
 ]);
 expect(visual.structure?.entities).toEqual([
  {node:'record',fields:[
   {name:'id',type:'uuid',keys:['pk'],nullable:false},
   {name:'display_name',type:'text'}
  ]},
  {node:'event',fields:[{name:'record_id',type:'uuid'}]}
 ]);
 expect(visual.structure?.references).toEqual([
  {id:'record-events',from:{node:'record'},to:{node:'event'},label:'emits "events"',fromCardinality:'exactly-one',toCardinality:'zero-or-many'}
 ]);
 expect(inspectVisual(reviewed)).toMatchObject({valid:true,complete:true});
 expect(JSON.parse(writeVisualDocument(readVisualDocument(raw.toString('utf8'),'json'),'json'))).toEqual(source);
 expect(getVisual(readVisualDocument(writeVisualDocument(readVisualDocument(raw.toString('utf8'),'json'),'yaml'),'yaml'))).toEqual(visual);
});

test('authoritative source provenance binds exact bytes, IDs and versions without host evidence',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(item=>item.id==='catalog-canary-entities')!;
 const bytes=readFileSync(sourcePath),digest=hash(bytes);
 expect(row.definitionPath).toBe(sourcePath);expect(row.definitionSha256).toBe(digest);
 expect(row.sources).toEqual([{path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative catalog UMF source',description:'The checked-in catalog JSON is the complete authoritative source and is used byte-for-byte as the review definition.'}]);
 expect(row.publishedAssets).toEqual([{path:sourcePath,sha256:digest,outputPath:'reviews/catalog-canary-entities/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF catalog source bytes for source-preserving download.'}]);
 expect(row.originalEvidence).toEqual({
  kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,
  documentId:'visual:catalog-canary-entities',visualId:'catalog-canary-entities',envelopeVersion:'0.10.0',modelVersion:'1.0.0',
  sourceDownloadPath:'reviews/catalog-canary-entities/authoritative-source.json',
  scope:'This exact catalog JSON is the review definition. Its source payload, IDs, Visual version and authored field/reference values are preserved without adding semantics.'
 });
 expect(row.originalEvidence).not.toHaveProperty('classification');
 expect(row.originalEvidence).not.toHaveProperty('captureSha256');
 expect(row.originalEvidence).not.toHaveProperty('knownOmissions');
 const rows=manifest.examples;
 expect(await verifyReviewSourceEvidence()).toEqual({examples:rows.length,captures:rows.filter(item=>item.originalEvidence.kind==='synthetic-integration-witness').length,authoritativeSources:rows.filter(item=>item.originalEvidence.kind==='authoritative-umf-source').length});
});

test('authoritative provenance rejects stale hashes and mismatched source identity/version',async()=>{
 const original=read<any>(manifestPath),path='.cache/canary-authoritative-provenance-negative.json';
 const mutations=[
  (manifest:any)=>{manifest.examples.find((row:any)=>row.id==='catalog-canary-entities').originalEvidence.sourceSha256='0'.repeat(64);},
  (manifest:any)=>{manifest.examples.find((row:any)=>row.id==='catalog-canary-entities').originalEvidence.documentId='visual:other';},
  (manifest:any)=>{manifest.examples.find((row:any)=>row.id==='catalog-canary-entities').originalEvidence.modelVersion='1.4.0';},
  (manifest:any)=>{manifest.examples.find((row:any)=>row.id==='catalog-canary-entities').originalEvidence.captureSha256='0'.repeat(64);}
 ];
 try{
  for(const mutate of mutations){const changed=structuredClone(original);mutate(changed);await writeFile(path,JSON.stringify(changed));await expect(verifyReviewSourceEvidence(path)).rejects.toThrow();}
 }finally{await rm(path,{force:true});}
});

test('authoritative source validation rejects invalid Visual bytes even when their hash and identity metadata are updated',async()=>{
 const manifest=read<any>(manifestPath),row=manifest.examples.find((item:any)=>item.id==='catalog-canary-entities')!;
 const invalidSourcePath='.cache/canary-invalid-umf-source.json',invalidManifestPath='.cache/canary-invalid-umf-manifest.json';
 const invalid=read<any>(sourcePath);invalid.vocabularies['umf.visual'].version='99.0.0';
 const bytes=JSON.stringify(invalid)+'\n',digest=hash(bytes);
 row.originalEvidence.sourcePath=invalidSourcePath;row.originalEvidence.sourceSha256=digest;row.originalEvidence.modelVersion='99.0.0';
 row.sources[0].path=invalidSourcePath;row.sources[0].sha256=digest;
 row.publishedAssets[0].path=invalidSourcePath;row.publishedAssets[0].sha256=digest;
 try{
  await writeFile(invalidSourcePath,bytes);await writeFile(invalidManifestPath,JSON.stringify(manifest));
  await expect(verifyReviewSourceEvidence(invalidManifestPath)).rejects.toThrow('not a valid UMF Visual document');
 }finally{await rm(invalidSourcePath,{force:true});await rm(invalidManifestPath,{force:true});}
});
