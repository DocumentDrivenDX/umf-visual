// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/forms/umf-ac-status.json';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;

test('status bar source preserves its five category identities, authored order, values, and absent fields',()=>{
 const raw=readFileSync(sourcePath),digest=hash(raw),source=JSON.parse(raw.toString('utf8')) as Document,reviewed=read<Document>(sourcePath),visual=getVisual(reviewed) as Visual;
 expect(digest).toBe('7babed0d04fdf16f520a6e8b3e00118c81b229f8275e3dcde925e835cffc21ff');expect(reviewed).toEqual(source);
 expect(reviewed.id).toBe('visual:umf-ac-status');expect(reviewed.umf).toBe('0.10.0');expect(reviewed.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(visual.id).toBe('umf-ac-status');expect(visual.kind).toBe('metric');expect(visual.form).toBe('bar');
 expect(visual.title).toBe('Acceptance criteria by status');expect(visual.question).toBe("Where do umf's acceptance criteria stand?");expect(visual.audience).toBe('executive');
 expect(visual.source).toEqual({path:'umf:docs/helix/03-test/acceptance-criteria-ledger.json',digest:'sha256:5dc577fd1bce10c6da71052da019e17b351b01b2e5ea53fa59d00a3524f1ec23'});
 const metric=visual.metric!;
 expect(metric.unit).toBe('criteria');expect(metric.format).toEqual({kind:'number',decimals:0});
 expect(metric.axis).toEqual({kind:'category',categories:[
  {id:'satisfied',label:'Satisfied'},{id:'untested',label:'Untested'},{id:'uncited-coverage',label:'Uncited Coverage'},
  {id:'asserted-unbacked',label:'Asserted Unbacked'},{id:'reviewed-exception',label:'Reviewed Exception'},
 ]});
 expect(metric.series).toEqual([{id:'criteria',label:'Criteria',points:[
  {at:'satisfied',value:180},{at:'untested',value:407},{at:'uncited-coverage',value:233},{at:'asserted-unbacked',value:0},{at:'reviewed-exception',value:17},
 ]}]);
 expect(metric.series[0]?.points?.[3]?.value).toBe(0);expect(metric.series[0]?.points?.every(point=>Object.keys(point).sort().join(',')==='at,value')).toBe(true);
 expect(metric).not.toHaveProperty('good');expect(metric).not.toHaveProperty('target');expect(metric).not.toHaveProperty('baseline');expect(metric).not.toHaveProperty('comparison');
 expect(metric.axis?.kind).toBe('category');expect(metric.series[0]?.points?.every(point=>!/^\d{4}-\d{2}-\d{2}$/u.test(point.at??''))).toBe(true);
 expect(inspectVisual(reviewed)).toMatchObject({valid:true,complete:true});
 const jsonRead=readVisualDocument(raw.toString('utf8'),'json');expect(JSON.parse(writeVisualDocument(jsonRead,'json'))).toEqual(source);
 const yaml=writeVisualDocument(jsonRead,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
});

test('status bar review binds exact source bytes without interpreting labels or verifying the ledger',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(item=>item.id==='umf-ac-status')!,bytes=readFileSync(sourcePath),digest=hash(bytes);
 expect(row.title).toBe('Acceptance criteria by status');expect(row.definitionPath).toBe(sourcePath);expect(row.definitionSha256).toBe(digest);
 expect(row.sources).toEqual([{path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The checked-in Visual 1.0.0 fixture JSON is the complete definition and is used byte-for-byte as the review definition.'}]);
 expect(row.publishedAssets).toEqual([{path:sourcePath,sha256:digest,outputPath:'reviews/umf-ac-status/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'}]);
 expect(row.originalEvidence).toEqual({
  kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,documentId:'visual:umf-ac-status',visualId:'umf-ac-status',envelopeVersion:'0.10.0',modelVersion:'1.0.0',
  sourceDownloadPath:'reviews/umf-ac-status/authoritative-source.json',
  scope:'This exact UMF fixture JSON is the review definition. Its five category identifiers and labels, declared category order, series order, point category references, values including zero, unit, and number format are source-authored. Category labels are not interpreted as status styling or business roles. The source path and digest are locator metadata; this review does not retrieve or verify the referenced acceptance-criteria ledger, infer an aggregate, or make a current status claim.'
 });
 expect(row.originalEvidence).not.toHaveProperty('classification');expect(row.originalEvidence).not.toHaveProperty('captureSha256');expect(row.originalEvidence).not.toHaveProperty('knownOmissions');
 await verifyReviewSourceEvidence();
});
