// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import type {Document} from '@umf/core';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/forms/helix-releases.json';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;

test('HELIX release timeline review preserves its authoritative dates, identities, and source order',()=>{
 const raw=readFileSync(sourcePath),digest=hash(raw),source=JSON.parse(raw.toString('utf8')) as Document;
 const reviewed=read<Document>(sourcePath),visual=getVisual(reviewed) as Visual;
 expect(digest).toBe('c3f173bd6ca3bf49b158fdfc692d51a883534356e41cf8fbd2bbe54530c7bfbb');
 expect(reviewed).toEqual(source);
 expect(reviewed.id).toBe('visual:helix-releases');
 expect(reviewed.umf).toBe('0.10.0');
 expect(reviewed.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(visual.id).toBe('helix-releases');
 expect(visual.kind).toBe('timeline');
 expect(visual.form).toBe('history');
 expect(visual.title).toBe('HELIX releases');
 expect(visual.question).toBe('When did each HELIX release ship?');
 expect(visual.source).toEqual({path:'helix:refs/tags/v*',digest:'sha256:0a1fffb03e925b2fbd7d1c27c1f89ecc0e94bbf122b96f283f70ac3cf229d37a'});
 expect(visual.timeline?.scale).toEqual({kind:'date'});
 const events=visual.timeline?.events??[];
 expect(events).toHaveLength(41);
 expect(events.map(event=>event.id)).toEqual([
  'v0-1-0','v0-2-0','v0-2-1','v0-3-0','v0-3-1','v0-3-2','v0-3-3','v0-4-0','v0-4-1','v0-5-0',
  'v0-5-1','v0-5-2','v0-6-0','v0-6-1','v0-7-0','v0-7-1','v0-8-0','v0-9-0','v0-9-1','v0-10-0',
  'v0-10-1','v0-10-2','v0-10-3','v0-11-0','v0-11-1','v0-12-0','v0-13-0','v0-13-1','v0-13-2','v0-14-0',
  'v0-14-1','v0-15-0','v0-15-1','v0-15-2','v0-15-3','v0-15-4','v0-16-0','v0-17-0','v0-18-0','v0-19-0','v0-19-1'
 ]);
 expect(events.every(event=>Object.keys(event).sort().join(',')==='at,id,label')).toBe(true);
 expect(events.find(event=>event.id==='v0-15-4')).toMatchObject({label:'v0.15.4',at:'2026-10-09'});
 expect(events.find(event=>event.id==='v0-15-3')).toMatchObject({label:'v0.15.3',at:'2026-10-10'});
 expect(visual.timeline).not.toHaveProperty('lanes');
 expect(visual.timeline).not.toHaveProperty('spans');
 expect(visual.timeline).not.toHaveProperty('markers');
 expect(visual).not.toHaveProperty('steps');
 expect(visual).not.toHaveProperty('audience');
 expect(visual).not.toHaveProperty('omissions');
 expect(inspectVisual(reviewed)).toMatchObject({valid:true,complete:true});
 const jsonRead=readVisualDocument(raw.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(jsonRead,'json'))).toEqual(source);
 const yaml=writeVisualDocument(jsonRead,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(visual);
 expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
});

test('HELIX release timeline review binds the exact UMF fixture and source-preserving download',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(item=>item.id==='helix-releases')!;
 const bytes=readFileSync(sourcePath),digest=hash(bytes);
 expect(row.title).toBe('HELIX releases');
 expect(row.definitionPath).toBe(sourcePath);expect(row.definitionSha256).toBe(digest);
 expect(row.sources).toEqual([{path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The checked-in Visual 1.0.0 fixture JSON is the complete definition and is used byte-for-byte as the review definition.'}]);
 expect(row.publishedAssets).toEqual([{path:sourcePath,sha256:digest,outputPath:'reviews/helix-releases/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'}]);
 expect(row.originalEvidence).toEqual({
  kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,
  documentId:'visual:helix-releases',visualId:'helix-releases',envelopeVersion:'0.10.0',modelVersion:'1.0.0',
  sourceDownloadPath:'reviews/helix-releases/authoritative-source.json',
  scope:'This exact UMF fixture JSON is the review definition. Event IDs, labels, dates, and authored array order are preserved. The source path and digest are locator metadata; this review does not validate external HELIX tag history or infer release roles or durations.'
 });
 expect(row.originalEvidence).not.toHaveProperty('classification');
 expect(row.originalEvidence).not.toHaveProperty('captureSha256');
 expect(row.originalEvidence).not.toHaveProperty('knownOmissions');
 await verifyReviewSourceEvidence();
});
