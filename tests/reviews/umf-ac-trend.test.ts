// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {authoredMetricView} from '../../microsite/authored-context.js';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/forms/umf-ac-trend.json';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
const dates=['2026-10-02','2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11','2026-10-17','2026-10-18','2026-10-23'];
const expectedSeries=[
 {id:'satisfied-trend',label:'Satisfied',values:[55,63,74,117,117,117,163,168,180]},
 {id:'untested',label:'Untested',values:[155,155,288,288,316,316,387,405,407]},
];

test('trend source preserves both date-series identities, values, plateaus, and global metric metadata',()=>{
 const raw=readFileSync(sourcePath),digest=hash(raw),source=JSON.parse(raw.toString('utf8')) as Document,reviewed=read<Document>(sourcePath),visual=getVisual(reviewed) as Visual;
 expect(digest).toBe('8f8ed01cab2c6fd07470dfe7004631429849b06123ef139b866e17e207ccc5c9');expect(reviewed).toEqual(source);
 expect(reviewed.id).toBe('visual:umf-ac-trend');expect(reviewed.umf).toBe('0.10.0');expect(reviewed.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(visual.id).toBe('umf-ac-trend');expect(visual.kind).toBe('metric');expect(visual.form).toBe('line');
 expect(visual.title).toBe('Acceptance criteria over time');expect(visual.question).toBe('How have satisfied and untested criteria changed?');expect(visual.audience).toBe('executive');
 expect(visual.source).toEqual({path:'umf:docs/helix/03-test/acceptance-criteria-ledger.json',digest:'sha256:5dc577fd1bce10c6da71052da019e17b351b01b2e5ea53fa59d00a3524f1ec23'});
 const metric=visual.metric!;expect(metric.unit).toBe('criteria');expect(metric.good).toBe('up');expect(metric.format).toEqual({kind:'number',decimals:0});expect(metric.axis).toEqual({kind:'time'});
 expect(metric.series).toHaveLength(2);
 for(const[index,expected]of expectedSeries.entries())expect(metric.series[index]).toEqual({id:expected.id,label:expected.label,points:dates.map((at,pointIndex)=>({at,value:expected.values[pointIndex]}))});
 expect(metric.series[0]?.points?.filter(point=>point.value===117).map(point=>point.at)).toEqual(['2026-10-09','2026-10-10','2026-10-11']);
 expect(metric.series[1]?.points?.filter(point=>point.value===155).map(point=>point.at)).toEqual(['2026-10-02','2026-10-07']);
 expect(metric).not.toHaveProperty('target');expect(metric).not.toHaveProperty('baseline');expect(metric).not.toHaveProperty('comparison');
 expect(metric.series.every(series=>series.points.every(point=>Object.keys(point).sort().join(',')==='at,value'))).toBe(true);
 expect(inspectVisual(reviewed)).toMatchObject({valid:true,complete:true});
 const jsonRead=readVisualDocument(raw.toString('utf8'),'json');expect(JSON.parse(writeVisualDocument(jsonRead,'json'))).toEqual(source);
 const yaml=writeVisualDocument(jsonRead,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');expect(getVisual(yamlRead)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
 const context=authoredMetricView(visual)!;
 expect(context.series.map(series=>series.id)).toEqual(['satisfied-trend','untested']);
 expect(context.series[0]?.points).toHaveLength(9);expect(context.series[1]?.points).toHaveLength(9);
 expect(context.series[1]?.points[8]).toEqual({sourcePath:'/extensions/umf.visual/metric/series/1/points/8',fields:[{key:'at',value:'2026-10-23',sourcePath:'/extensions/umf.visual/metric/series/1/points/8/at'},{key:'value',value:407,sourcePath:'/extensions/umf.visual/metric/series/1/points/8/value'}]});
});

test('trend review binds exact source bytes without deriving totals, series preference, or current-ledger claims',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(item=>item.id==='umf-ac-trend')!,bytes=readFileSync(sourcePath),digest=hash(bytes);
 expect(row.title).toBe('Acceptance criteria over time');expect(row.definitionPath).toBe(sourcePath);expect(row.definitionSha256).toBe(digest);
 expect(row.sources).toEqual([{path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The checked-in Visual 1.0.0 fixture JSON is the complete definition and is used byte-for-byte as the review definition.'}]);
 expect(row.publishedAssets).toEqual([{path:sourcePath,sha256:digest,outputPath:'reviews/umf-ac-trend/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'}]);
 expect(row.originalEvidence).toEqual({
  kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,documentId:'visual:umf-ac-trend',visualId:'umf-ac-trend',envelopeVersion:'0.10.0',modelVersion:'1.0.0',
  sourceDownloadPath:'reviews/umf-ac-trend/authoritative-source.json',
  scope:'This exact UMF fixture JSON is the review definition. Its two series, nine date/value points per series, source order, shared time axis, unit, global good direction, and number format are source-authored. The global `good: up` value is not interpreted as a per-series preference or ranking. The source path and digest are locator metadata; this review does not retrieve or verify the referenced acceptance-criteria ledger, derive totals or growth claims, or treat the observations as current status.'
 });
 expect(row.originalEvidence).not.toHaveProperty('classification');expect(row.originalEvidence).not.toHaveProperty('captureSha256');expect(row.originalEvidence).not.toHaveProperty('knownOmissions');
 await verifyReviewSourceEvidence();
});
