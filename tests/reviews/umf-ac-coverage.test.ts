// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import type {Document} from '@umf/core';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/forms/umf-ac-coverage.json';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;

test('acceptance criteria meter is the exact Visual 1.0.0 source with one authored point',()=>{
 const raw=readFileSync(sourcePath),digest=hash(raw),source=JSON.parse(raw.toString('utf8')) as Document,reviewed=read<Document>(sourcePath),visual=getVisual(reviewed) as Visual;
 expect(digest).toBe('68dfc3164c722dc21eb9430e77c179d8f90fb27af8fb167d644e6a803edc71c7');
 expect(reviewed).toEqual(source);
 expect(reviewed.id).toBe('visual:umf-ac-coverage');expect(reviewed.umf).toBe('0.10.0');expect(reviewed.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(visual.id).toBe('umf-ac-coverage');expect(visual.kind).toBe('metric');expect(visual.form).toBe('meter');
 expect(visual.title).toBe('Acceptance criteria satisfied');expect(visual.question).toBe('How far is umf from every acceptance criterion satisfied?');
 expect(visual.audience).toBe('executive');
 expect(visual.source).toEqual({path:'umf:docs/helix/03-test/acceptance-criteria-ledger.json',digest:'sha256:5dc577fd1bce10c6da71052da019e17b351b01b2e5ea53fa59d00a3524f1ec23'});
 expect(visual.metric).toEqual({unit:'criteria',good:'up',format:{kind:'number',decimals:0},target:837,series:[{id:'satisfied-now',label:'Satisfied',points:[{value:180}]}]});
 expect(visual.metric).not.toHaveProperty('axis');expect(visual.metric?.series?.[0]?.points?.[0]).not.toHaveProperty('at');
 expect(inspectVisual(reviewed)).toMatchObject({valid:true,complete:true});
 const jsonRead=readVisualDocument(raw.toString('utf8'),'json');expect(JSON.parse(writeVisualDocument(jsonRead,'json'))).toEqual(source);
 const yaml=writeVisualDocument(jsonRead,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
});

test('acceptance criteria meter review binds exact source and avoids external verification or derived progress claims',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(item=>item.id==='umf-ac-coverage')!,bytes=readFileSync(sourcePath),digest=hash(bytes);
 expect(row.title).toBe('Acceptance criteria satisfied');expect(row.definitionPath).toBe(sourcePath);expect(row.definitionSha256).toBe(digest);
 expect(row.sources).toEqual([{path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The checked-in Visual 1.0.0 fixture JSON is the complete definition and is used byte-for-byte as the review definition.'}]);
 expect(row.publishedAssets).toEqual([{path:sourcePath,sha256:digest,outputPath:'reviews/umf-ac-coverage/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'}]);
 expect(row.originalEvidence).toEqual({
  kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,documentId:'visual:umf-ac-coverage',visualId:'umf-ac-coverage',envelopeVersion:'0.10.0',modelVersion:'1.0.0',
  sourceDownloadPath:'reviews/umf-ac-coverage/authoritative-source.json',
  scope:'This exact UMF fixture JSON is the review definition. The value, target, unit, direction, and format are source-authored and are shown without deriving a percentage, progress claim, or recommendation. The source path and digest are locator metadata; this review does not retrieve or verify the referenced acceptance-criteria ledger.'
 });
 expect(row.originalEvidence).not.toHaveProperty('classification');expect(row.originalEvidence).not.toHaveProperty('captureSha256');expect(row.originalEvidence).not.toHaveProperty('knownOmissions');
 await verifyReviewSourceEvidence();
});
