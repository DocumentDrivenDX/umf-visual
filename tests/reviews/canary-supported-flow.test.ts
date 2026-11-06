// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import type {Document} from '@umf/core';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/catalog/canary-supported-flow.json';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;

test('supported flow review preserves its exact authoritative UMF bytes and omitted properties',()=>{
 const raw=readFileSync(sourcePath),digest=hash(raw),source=JSON.parse(raw.toString('utf8')) as Document;
 const reviewed=read<Document>(sourcePath),visual=getVisual(reviewed) as Visual;
 expect(digest).toBe('d3f865c73aa04f9720b60153b280817a4919282cbdf30fc3703c9b4f364b1baf');
 expect(reviewed).toEqual(source);
 expect(reviewed.id).toBe('visual:catalog-canary-supported-flow');
 expect(reviewed.umf).toBe('0.10.0');
 expect(reviewed.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(visual.id).toBe('catalog-canary-supported-flow');
 expect(visual.kind).toBe('flow');
 expect(visual.form).toBe('network');
 expect(visual.question).toBe('Can two nodes and one edge be emitted without loss?');
 expect(visual).not.toHaveProperty('title');
 expect(visual).not.toHaveProperty('source');
 expect(visual).not.toHaveProperty('omissions');
 expect(visual).not.toHaveProperty('layout');
 expect(visual.nodes).toEqual([
  {id:'source',label:'Source · π'},
  {id:'target',label:'Target "quoted"'}
 ]);
 expect(visual.nodes?.every(node=>!('role'in node))).toBe(true);
 expect(visual.edges).toEqual([{id:'source-target',from:'source',to:'target',label:'transfers data'}]);
 expect(visual.edges?.[0]).not.toHaveProperty('directed');
 expect(visual.edges?.[0]).not.toHaveProperty('kind');
 expect(visual.edges?.[0]).not.toHaveProperty('routing');
 expect(inspectVisual(reviewed)).toMatchObject({valid:true,complete:true});
 const jsonRead=readVisualDocument(raw.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(jsonRead,'json'))).toEqual(source);
 const yaml=writeVisualDocument(jsonRead,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(visual);
 expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
});

test('supported flow review binds exact source identity and source-preserving download',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(item=>item.id==='catalog-canary-supported-flow')!;
 const bytes=readFileSync(sourcePath),digest=hash(bytes);
 expect(row.title).toBe('Catalog file canary-supported-flow.json');
 expect(row.definitionPath).toBe(sourcePath);expect(row.definitionSha256).toBe(digest);
 expect(row.sources).toEqual([{path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative catalog UMF source',description:'The checked-in catalog JSON is the complete authoritative source and is used byte-for-byte as the review definition.'}]);
 expect(row.publishedAssets).toEqual([{path:sourcePath,sha256:digest,outputPath:'reviews/catalog-canary-supported-flow/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF catalog source bytes for source-preserving download.'}]);
 expect(row.originalEvidence).toEqual({
  kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,
  documentId:'visual:catalog-canary-supported-flow',visualId:'catalog-canary-supported-flow',envelopeVersion:'0.10.0',modelVersion:'1.0.0',
  sourceDownloadPath:'reviews/catalog-canary-supported-flow/authoritative-source.json',
  scope:'This exact catalog JSON is the review definition. Its Visual payload has no authored title, source locator or omissions list; these remain absent. No directed override, edge kind, route, layout or node roles are authored. The Visual 1.0 default edge direction remains applicable; no business roles are inferred from the labels.'
 });
 expect(row.originalEvidence).not.toHaveProperty('classification');
 expect(row.originalEvidence).not.toHaveProperty('captureSha256');
 expect(row.originalEvidence).not.toHaveProperty('knownOmissions');
 await verifyReviewSourceEvidence();
});
