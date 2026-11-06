// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import type {Document} from '@umf/core';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/catalog/canary-flow.json';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;

test('catalog flow canary is reviewed byte-for-byte without adding visual semantics',()=>{
 const raw=readFileSync(sourcePath),digest=hash(raw),source=JSON.parse(raw.toString('utf8')) as Document;
 const reviewed=read<Document>(sourcePath),visual=getVisual(reviewed) as Visual;
 expect(digest).toBe('e3f8b85ee85418e391befd7d7fb3161553218d27e8b039a5889deb370dcf5db9');
 expect(reviewed).toEqual(source);
 expect(reviewed.id).toBe('visual:catalog-canary-flow');
 expect(reviewed.umf).toBe('0.10.0');
 expect(reviewed.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(visual.id).toBe('catalog-canary-flow');
 expect(visual.kind).toBe('flow');
 expect(visual.form).toBe('network');
 expect(visual.title).toBe('Quoted labels, Unicode, and projection loss');
 expect(visual.question).toBe('How does a label survive export and rendering?');
 expect(visual.nodes?.map(node=>[node.id,node.label])).toEqual([
  ['parser','Parser says "ready" · π'],['renderer','Renderer & output']
 ]);
 expect(visual.edges).toEqual([{id:'parse-to-render',from:'parser',to:'renderer',label:'keeps "meaning"'}]);
 expect(visual.source).toEqual({path:'catalog:canary-flow'});
 expect(visual.omissions).toEqual(['Unknown adapter-specific extensions stay in the source document.']);
 expect(inspectVisual(reviewed)).toMatchObject({valid:true,complete:true});
 expect(JSON.parse(writeVisualDocument(readVisualDocument(raw.toString('utf8'),'json'),'json'))).toEqual(source);
 expect(getVisual(readVisualDocument(writeVisualDocument(readVisualDocument(raw.toString('utf8'),'json'),'yaml'),'yaml'))).toEqual(visual);
});

test('catalog flow review binds original bytes, IDs, versions and a source-preserving download',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(item=>item.id==='catalog-canary-flow')!;
 const bytes=readFileSync(sourcePath),digest=hash(bytes);
 expect(row.definitionPath).toBe(sourcePath);expect(row.definitionSha256).toBe(digest);
 expect(row.sources).toEqual([{path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative catalog UMF source',description:'The checked-in catalog JSON is the complete authoritative source and is used byte-for-byte as the review definition.'}]);
 expect(row.publishedAssets).toEqual([{path:sourcePath,sha256:digest,outputPath:'reviews/catalog-canary-flow/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF catalog source bytes for source-preserving download.'}]);
 expect(row.originalEvidence).toEqual({
  kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,
  documentId:'visual:catalog-canary-flow',visualId:'catalog-canary-flow',envelopeVersion:'0.10.0',modelVersion:'1.0.0',
  sourceDownloadPath:'reviews/catalog-canary-flow/authoritative-source.json',
  scope:'This exact catalog JSON is the review definition. It preserves the authored flow, node and edge IDs; title, question, labels, source locator and omission statement. No route, layout, role or additional business meaning is authored by this review.'
 });
 expect(row.originalEvidence).not.toHaveProperty('classification');
 expect(row.originalEvidence).not.toHaveProperty('captureSha256');
 expect(row.originalEvidence).not.toHaveProperty('knownOmissions');
 const rows=manifest.examples;
 expect(await verifyReviewSourceEvidence()).toEqual({examples:rows.length,captures:rows.filter(item=>item.originalEvidence.kind==='synthetic-integration-witness').length,authoritativeSources:rows.filter(item=>item.originalEvidence.kind==='authoritative-umf-source').length});
});
