// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/forms/umf-releases.json';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
const eventIds=['umf-v0-2-0','umf-v0-3-0','umf-v0-4-0','umf-v0-4-1','umf-v0-5-0','umf-v0-5-1','umf-v0-5-2','umf-v0-5-3','umf-v0-5-4','umf-v0-5-5','umf-v0-5-6'];
const labels=['umf-v0.2.0','umf-v0.3.0','umf-v0.4.0','umf-v0.4.1','umf-v0.5.0','umf-v0.5.1','umf-v0.5.2','umf-v0.5.3','umf-v0.5.4','umf-v0.5.5','umf-v0.5.6'];
const dates=['2026-10-13','2026-10-16','2026-10-18','2026-10-18','2026-10-18','2026-10-19','2026-10-20','2026-10-20','2026-10-21','2026-10-23','2026-10-23'];

test('umf release milestones preserve their exact legacy source identities, dates, and order',()=>{
 const raw=readFileSync(sourcePath),digest=hash(raw),source=JSON.parse(raw.toString('utf8')) as Document,reviewed=read<Document>(sourcePath),visual=getVisual(reviewed) as Visual;
 expect(digest).toBe('2a0be94de504e1d400c4897f786b0976c93173558942d334eadab94c7f60f08f');expect(reviewed).toEqual(source);
 expect(reviewed.id).toBe('visual:umf-releases');expect(reviewed.umf).toBe('0.10.0');expect(reviewed.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(visual.id).toBe('umf-releases');expect(visual.kind).toBe('timeline');expect(visual.form).toBe('milestones');
 expect(visual.title).toBe('umf releases');expect(visual.question).toBe('When did each umf SDK release ship?');
 expect(visual.source).toEqual({path:'umf:refs/tags/umf-v*',digest:'sha256:4e697437ce963d7c2e03824f30f3bbcaa51f8f74533786fa320f8302de0a3228'});
 expect(visual.timeline?.scale).toEqual({kind:'date'});
 const events=visual.timeline?.events??[];
 expect(events).toHaveLength(11);expect(events.map(event=>event.id)).toEqual(eventIds);expect(events.map(event=>event.label)).toEqual(labels);expect(events.map(event=>event.at)).toEqual(dates);
 expect(new Set(dates).size).toBe(7);
 expect(events.filter(event=>event.at==='2026-10-18').map(event=>event.id)).toEqual(eventIds.slice(2,5));
 expect(events.filter(event=>event.at==='2026-10-20').map(event=>event.id)).toEqual(eventIds.slice(6,8));
 expect(events.filter(event=>event.at==='2026-10-23').map(event=>event.id)).toEqual(eventIds.slice(9,11));
 expect(events.every(event=>Object.keys(event).sort().join(',')==='at,id,label')).toBe(true);
 expect(visual.timeline).not.toHaveProperty('lanes');expect(visual.timeline).not.toHaveProperty('spans');expect(visual.timeline).not.toHaveProperty('markers');
 expect(visual).not.toHaveProperty('steps');expect(visual).not.toHaveProperty('audience');expect(visual).not.toHaveProperty('omissions');
 expect(inspectVisual(reviewed)).toMatchObject({valid:true,complete:true});
 const jsonRead=readVisualDocument(raw.toString('utf8'),'json');expect(JSON.parse(writeVisualDocument(jsonRead,'json'))).toEqual(source);
 const yaml=writeVisualDocument(jsonRead,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');expect(getVisual(yamlRead)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
});

test('umf milestones compile through the public plan with one source-bound event mapping each',()=>{
 const raw=readFileSync(sourcePath),document=readVisualDocument(raw.toString('utf8'),'json'),visual=getVisual(document);
 const before=JSON.stringify(document);
 for(const backend of ['graphviz','mermaid','lini'] as const){
  const plan=compilePresentation(document,{backend});expect(plan.ok,backend).toBe(true);if(!plan.ok)continue;
  expect(plan.elementMap.filter(item=>item.kind==='event')).toEqual(visual.timeline!.events!.map((event,index)=>({logicalId:event.id,sourcePath:`/extensions/umf.visual/timeline/events/${index}`,nativeId:backend==='lini'?`event${index+1}`:`event_${index+1}`,kind:'event'})));
  for(const event of visual.timeline!.events!){expect(plan.source).toContain(event.label);expect(plan.source).toContain(event.at);}
 }
 expect(JSON.stringify(document)).toBe(before);
});

test('umf release review publishes exact source bytes and limits release-history claims',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(item=>item.id==='umf-releases')!;
 const bytes=readFileSync(sourcePath),digest=hash(bytes);
 expect(row.title).toBe('umf releases');expect(row.kind).toBe('timeline');expect(row.form).toBe('milestones');
 expect(row.definitionPath).toBe(sourcePath);expect(row.definitionSha256).toBe(digest);
 expect(row.sources).toEqual([{path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The checked-in Visual 1.0.0 fixture JSON is the complete definition and is used byte-for-byte as the review definition.'}]);
 expect(row.publishedAssets).toEqual([{path:sourcePath,sha256:digest,outputPath:'reviews/umf-releases/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'}]);
 expect(row.originalEvidence).toEqual({
  kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,documentId:'visual:umf-releases',visualId:'umf-releases',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/umf-releases/authoritative-source.json',
  scope:'This exact UMF fixture JSON is the review definition. Event IDs, labels, dates, and authored array order are preserved. The source path and digest are locator metadata; this review does not verify external umf tag history or infer release roles or durations.'
 });
 expect(row.originalEvidence).not.toHaveProperty('classification');expect(row.originalEvidence).not.toHaveProperty('captureSha256');expect(row.originalEvidence).not.toHaveProperty('knownOmissions');
 const verified=await verifyReviewSourceEvidence();
 expect(verified.examples).toBe(manifest.examples.length);
 expect(verified.authoritativeSources).toBe(manifest.examples.filter(item=>item.originalEvidence.kind==='authoritative-umf-source').length);
});
