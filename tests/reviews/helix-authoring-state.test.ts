// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import type {Document} from '@umf/core';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/forms/helix-authoring-state.json';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;

test('HELiX authoring-state review preserves the complete typed state machine without added semantics',()=>{
 const raw=readFileSync(sourcePath),digest=hash(raw),source=JSON.parse(raw.toString('utf8')) as Document;
 const reviewed=read<Document>(sourcePath),visual=getVisual(reviewed) as Visual;
 expect(digest).toBe('695db96052209c59f803c88eea456f30bf750ccdc9e44f8e944a5057d0ca24c8');
 expect(reviewed).toEqual(source);
 expect(reviewed.id).toBe('visual:helix-authoring-state');
 expect(reviewed.umf).toBe('0.10.0');
 expect(reviewed.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(visual.id).toBe('helix-authoring-state');
 expect(visual.kind).toBe('state');
 expect(visual.form).toBe('machine');
 expect(visual.title).toBe('An externally authored artifact');
 expect(visual.question).toBe('When can a repository depend on an externally authored artifact?');
 expect(visual.source).toEqual({path:'helix:skills/helix/SKILL.md',view:'Externally authored artifacts',digest:'sha256:8dcd70d687371fc41849086979abc80a79ea72b9090e1eb966c71a1d2762b9b3'});
 expect(visual.nodes).toEqual([
  {id:'checked-out',label:'Checked out',detail:'undependable'},
  {id:'checked-in',label:'Checked in',detail:'the read surface'}
 ]);
 expect(visual.state).toEqual({
  initial:'checked-out',
  transitions:[
   {id:'check-in',from:'checked-out',to:'checked-in',event:'check in',action:'copy body, export and digest'},
   {id:'check-out',from:'checked-in',to:'checked-out',event:'check out',action:'start the next revision'}
  ]
 });
 expect(visual.state).not.toHaveProperty('final');
 expect(visual.state!.transitions?.every(transition=>!('guard'in transition)&&!('path'in transition)&&!('status'in transition)&&!('emphasis'in transition))).toBe(true);
 expect(visual).not.toHaveProperty('layout');
 expect(inspectVisual(reviewed)).toMatchObject({valid:true,complete:true});
 const jsonRead=readVisualDocument(raw.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(jsonRead,'json'))).toEqual(source);
 const yaml=writeVisualDocument(jsonRead,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(visual);
 expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
});

test('HELiX authoring-state review binds exact UMF bytes without asserting historical source retrieval',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(item=>item.id==='helix-authoring-state')!;
 const bytes=readFileSync(sourcePath),digest=hash(bytes);
 expect(row.title).toBe('An externally authored artifact');
 expect(row.definitionPath).toBe(sourcePath);expect(row.definitionSha256).toBe(digest);
 expect(row.sources).toEqual([{path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The checked-in Visual 1.0.0 fixture JSON is the complete definition and is used byte-for-byte as the review definition.'}]);
 expect(row.publishedAssets).toEqual([{path:sourcePath,sha256:digest,outputPath:'reviews/helix-authoring-state/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'}]);
 expect(row.originalEvidence).toEqual({
  kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,
  documentId:'visual:helix-authoring-state',visualId:'helix-authoring-state',envelopeVersion:'0.10.0',modelVersion:'1.0.0',
  sourceDownloadPath:'reviews/helix-authoring-state/authoritative-source.json',
  scope:'This exact UMF fixture JSON is the review definition. Its source locator and digest are retained as authored metadata; this provenance binds only the checked-in fixture bytes and does not attest to historical HELIX skill bytes.'
 });
 expect(row.originalEvidence).not.toHaveProperty('classification');
 expect(row.originalEvidence).not.toHaveProperty('captureSha256');
 expect(row.originalEvidence).not.toHaveProperty('knownOmissions');
 await verifyReviewSourceEvidence();
});
