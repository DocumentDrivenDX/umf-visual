// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/forms/umf-extensions.json';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
const expectedNodes=[
 ['extensions','src/extensions',undefined],
 ['actions','actions','extensions'],
 ['binding','binding','extensions'],
 ['dashboard','dashboard','extensions'],
 ['ddd','ddd','extensions'],
 ['security','security','extensions'],
 ['semantic-types','semantic-types','extensions'],
 ['tables','tables','extensions'],
 ['visual','visual','extensions'],
];

test('UMF extensions fixture preserves its exact historical tree and absent graph semantics',()=>{
 const raw=readFileSync(sourcePath),source=JSON.parse(raw.toString('utf8')) as Document,reviewed=read<Document>(sourcePath),visual=getVisual(reviewed) as Visual;
 expect(hash(raw)).toBe('a11c45838a97eddb397cc1a7d8a6e4f0ed8fb7e1ce998d2855b78d038a38e062');
 expect(reviewed).toEqual(source);
 expect(reviewed.id).toBe('visual:umf-extensions');expect(reviewed.umf).toBe('0.10.0');expect(reviewed.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(visual.id).toBe('umf-extensions');expect(visual.kind).toBe('structure');expect(visual.form).toBe('tree');
 expect(visual.title).toBe("umf's extensions");expect(visual.question).toBe("Which extensions does umf's TypeScript core implement?");
 expect(visual.source).toEqual({path:'umf:src/extensions',digest:'sha256:f3a0f26f9d775354d98195c09dbbeb707c4972fb63372ccee326dfeb1b63ab60'});
 expect(visual.nodes?.map(node=>[node.id,node.label,node.parent])).toEqual(expectedNodes);
 expect(visual.nodes).toHaveLength(9);expect(visual.edges).toBeUndefined();expect(visual.layout).toBeUndefined();
 expect(visual.structure).toBeUndefined();expect(visual.timeline).toBeUndefined();expect(visual.sequence).toBeUndefined();expect(visual.state).toBeUndefined();
 expect(source.modules).toEqual([]);expect(inspectVisual(reviewed)).toMatchObject({valid:true,complete:true});
 const jsonDocument=readVisualDocument(raw.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(jsonDocument,'json'))).toEqual(source);
 const yaml=writeVisualDocument(jsonDocument,'yaml'),yamlDocument=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlDocument)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlDocument,'json'))).toEqual(source);
});

test('UMF extensions review binds exact source bytes without claiming a current repository listing',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(item=>item.id==='umf-extensions')!;
 const bytes=readFileSync(sourcePath),digest=hash(bytes);
 expect(row.title).toBe("umf's extensions");expect(row.kind).toBe('structure');expect(row.form).toBe('tree');
 expect(row.definitionPath).toBe(sourcePath);expect(row.definitionSha256).toBe(digest);
 expect(row.sources).toEqual([{path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The checked-in Visual 1.0.0 fixture JSON is the complete definition and is used byte-for-byte as the review definition.'}]);
 expect(row.publishedAssets).toEqual([{path:sourcePath,sha256:digest,outputPath:'reviews/umf-extensions/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'}]);
 expect(row.originalEvidence).toEqual({
  kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,documentId:'visual:umf-extensions',visualId:'umf-extensions',envelopeVersion:'0.10.0',modelVersion:'1.0.0',
  sourceDownloadPath:'reviews/umf-extensions/authoritative-source.json',
  scope:'This exact UMF fixture JSON is the review definition. Its nine node IDs, labels, parent relationships, and child order are source-authored; the modules list is empty. The source path and digest are locator metadata, not verification of the referenced repository path. The tree preserves the fixture\'s historical claim and does not assert a current or exhaustive listing of implemented extensions.'
 });
 expect(row.originalEvidence).not.toHaveProperty('classification');expect(row.originalEvidence).not.toHaveProperty('captureSha256');expect(row.originalEvidence).not.toHaveProperty('knownOmissions');
 const evidence=await verifyReviewSourceEvidence();
 expect(evidence.examples).toBe(manifest.examples.length);
 expect(evidence.authoritativeSources).toBe(manifest.examples.filter(item=>item.originalEvidence.kind==='authoritative-umf-source').length);
});
