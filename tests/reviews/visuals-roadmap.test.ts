// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/forms/visuals-roadmap.json';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
const periods=Array.from({length:8},(_,index)=>({id:'m'+index,label:'M'+index}));
const lanes=[{id:'umf',label:'umf'},{id:'ux-builder',label:'ux-builder'},{id:'helix',label:'helix'},{id:'documentor',label:'documentor'}];
const spans:NonNullable<Visual['timeline']>['spans']=[
 {id:'span-m0',label:'HELIX PR #95 lands as it is',start:'m0',end:'m0',lane:'helix',status:'built'},
 {id:'span-m1',label:'umf: `umf.visual/1`',start:'m1',end:'m1',lane:'umf',status:'decided'},
 {id:'span-m2',label:'ux-builder: tokens',start:'m2',end:'m2',lane:'ux-builder',status:'decided'},
 {id:'span-m3',label:'ux-builder: `@ux-builder/visuals` 0.1 (graph kinds)',start:'m3',end:'m3',lane:'ux-builder',status:'decided'},
 {id:'span-m4',label:'ux-builder: 0.2 (the rest)',start:'m4',end:'m4',lane:'ux-builder',status:'decided'},
 {id:'span-m5',label:'HELIX: decision layer',start:'m5',end:'m5',lane:'helix',status:'decided'},
 {id:'span-m6',label:'documentor: producers and embedding',start:'m6',end:'m6',lane:'documentor',status:'decided'},
 {id:'span-m7',label:'Proof',start:'m7',end:'m7',lane:'helix',status:'decided'},
];

test('roadmap fixture preserves exact period, lane, and span IDs, values, and order',()=>{
 const raw=readFileSync(sourcePath),digest=hash(raw),source=JSON.parse(raw.toString('utf8')) as Document,reviewed=read<Document>(sourcePath),visual=getVisual(reviewed) as Visual;
 expect(digest).toBe('7d6a37e0bbd89a5795aa095ae9b855ea771c28daf78f675e508fdc390310dc12');expect(reviewed).toEqual(source);
 expect(reviewed.id).toBe('visual:visuals-roadmap');expect(reviewed.umf).toBe('0.10.0');expect(reviewed.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(visual.id).toBe('visuals-roadmap');expect(visual.kind).toBe('timeline');expect(visual.form).toBe('roadmap');
 expect(visual.title).toBe('Visuals milestones');expect(visual.question).toBe('Which repository delivers each visuals milestone, in what order?');
 expect(visual.source).toEqual({path:'visuals:PRD.md',view:'§11',digest:'sha256:f944df076446c39a75b7f58323869af5337751e892b75d24cc749e8b9ff27aa5'});
 expect(visual.timeline?.scale).toEqual({kind:'period',periods});expect(visual.timeline?.lanes).toEqual(lanes);expect(visual.timeline?.spans).toEqual(spans);
 expect(visual.timeline).not.toHaveProperty('events');expect(visual.timeline).not.toHaveProperty('markers');
 expect(visual).not.toHaveProperty('steps');expect(visual).not.toHaveProperty('audience');expect(visual).not.toHaveProperty('omissions');
 expect(inspectVisual(reviewed)).toMatchObject({valid:true,complete:true});
 const jsonRead=readVisualDocument(raw.toString('utf8'),'json');expect(JSON.parse(writeVisualDocument(jsonRead,'json'))).toEqual(source);
 const yaml=writeVisualDocument(jsonRead,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
});

test('roadmap review publishes exact source bytes with historical period-scale limits',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(item=>item.id==='visuals-roadmap')!;
 const bytes=readFileSync(sourcePath),digest=hash(bytes);
 expect(row.title).toBe('Visuals milestones');expect(row.kind).toBe('timeline');expect(row.form).toBe('roadmap');
 expect(row.definitionPath).toBe(sourcePath);expect(row.definitionSha256).toBe(digest);
 expect(row.sources).toEqual([{path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The checked-in Visual 1.0.0 fixture JSON is the complete definition and is used byte-for-byte as the review definition.'}]);
 expect(row.publishedAssets).toEqual([{path:sourcePath,sha256:digest,outputPath:'reviews/visuals-roadmap/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'}]);
 expect(row.originalEvidence).toEqual({
  kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,documentId:'visual:visuals-roadmap',visualId:'visuals-roadmap',envelopeVersion:'0.10.0',modelVersion:'1.0.0',
  sourceDownloadPath:'reviews/visuals-roadmap/authoritative-source.json',
  scope:'This exact UMF fixture JSON is the review definition. Period, lane, and span IDs, labels, declared order, start/end period references, lane assignments, and statuses are source-authored. The source path and digest are locator metadata; this review does not verify current PRD bytes or infer calendar dates, elapsed durations, or current delivery status from the period scale or status labels.'
 });
 expect(row.originalEvidence).not.toHaveProperty('classification');expect(row.originalEvidence).not.toHaveProperty('captureSha256');expect(row.originalEvidence).not.toHaveProperty('knownOmissions');
 const verified=await verifyReviewSourceEvidence();
 expect(verified.examples).toBe(manifest.examples.length);expect(verified.authoritativeSources).toBe(manifest.examples.filter(item=>item.originalEvidence.kind==='authoritative-umf-source').length);
});
