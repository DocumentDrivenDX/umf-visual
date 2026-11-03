// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import type {Document} from '@umf/core';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/forms/umf-ac-satisfied.json';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;

test('satisfied criteria stat is the exact Visual 1.0.0 date series with stable source order',()=>{
 const raw=readFileSync(sourcePath),digest=hash(raw),source=JSON.parse(raw.toString('utf8')) as Document,reviewed=read<Document>(sourcePath),visual=getVisual(reviewed) as Visual;
 expect(digest).toBe('deb56df1ab320b4609086b78eb4ba4afa9f1e89ad457a2a877f529aa433a726e');
 expect(reviewed).toEqual(source);
 expect(reviewed.id).toBe('visual:umf-ac-satisfied');expect(reviewed.umf).toBe('0.10.0');expect(reviewed.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(visual.id).toBe('umf-ac-satisfied');expect(visual.kind).toBe('metric');expect(visual.form).toBe('stat');
 expect(visual.title).toBe('Satisfied acceptance criteria');expect(visual.question).toBe("How many of umf's acceptance criteria are satisfied, and is that rising?");
 expect(visual.audience).toBe('executive');
 expect(visual.source).toEqual({path:'umf:docs/helix/03-test/acceptance-criteria-ledger.json',digest:'sha256:5dc577fd1bce10c6da71052da019e17b351b01b2e5ea53fa59d00a3524f1ec23'});
 const metric=visual.metric!;
 expect(metric.unit).toBe('criteria');expect(metric.good).toBe('up');expect(metric.format).toEqual({kind:'number',decimals:0});expect(metric.axis).toEqual({kind:'time'});
 expect(metric.series).toEqual([{id:'satisfied',label:'Satisfied',points:[
  {at:'2026-10-02',value:55},{at:'2026-10-07',value:63},{at:'2026-10-08',value:74},{at:'2026-10-09',value:117},{at:'2026-10-10',value:117},{at:'2026-10-11',value:117},{at:'2026-10-17',value:163},{at:'2026-10-18',value:168},{at:'2026-10-23',value:180},
 ]}]);
 expect(metric.series[0]?.points).toHaveLength(9);
 expect(metric.series[0]?.points?.every(point=>Object.keys(point).sort().join(',')==='at,value')).toBe(true);
 expect(metric.series[0]?.points?.filter(point=>point.value===117).map(point=>point.at)).toEqual(['2026-10-09','2026-10-10','2026-10-11']);
 expect(metric).not.toHaveProperty('target');expect(metric).not.toHaveProperty('baseline');expect(metric).not.toHaveProperty('comparison');
 expect(inspectVisual(reviewed)).toMatchObject({valid:true,complete:true});
 const jsonRead=readVisualDocument(raw.toString('utf8'),'json');expect(JSON.parse(writeVisualDocument(jsonRead,'json'))).toEqual(source);
 const yaml=writeVisualDocument(jsonRead,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
});

test('satisfied criteria stat binds exact source without treating the locator as current-ledger evidence',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(item=>item.id==='umf-ac-satisfied')!,bytes=readFileSync(sourcePath),digest=hash(bytes);
 expect(row.title).toBe('Satisfied acceptance criteria');expect(row.definitionPath).toBe(sourcePath);expect(row.definitionSha256).toBe(digest);
 expect(row.sources).toEqual([{path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The checked-in Visual 1.0.0 fixture JSON is the complete definition and is used byte-for-byte as the review definition.'}]);
 expect(row.publishedAssets).toEqual([{path:sourcePath,sha256:digest,outputPath:'reviews/umf-ac-satisfied/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'}]);
 expect(row.originalEvidence).toEqual({
  kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,documentId:'visual:umf-ac-satisfied',visualId:'umf-ac-satisfied',envelopeVersion:'0.10.0',modelVersion:'1.0.0',
  sourceDownloadPath:'reviews/umf-ac-satisfied/authoritative-source.json',
  scope:'This exact UMF fixture JSON is the review definition. Its nine date/value points, series order, unit, direction, and number format are source-authored. The source path and digest are locator metadata; this review does not retrieve or verify the referenced acceptance-criteria ledger, infer growth, or treat the question as a current status claim.'
 });
 expect(row.originalEvidence).not.toHaveProperty('classification');expect(row.originalEvidence).not.toHaveProperty('captureSha256');expect(row.originalEvidence).not.toHaveProperty('knownOmissions');
 await verifyReviewSourceEvidence();
});
