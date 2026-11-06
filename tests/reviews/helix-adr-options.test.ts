// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const originalPath='fixtures/visual/inventory/helix-adr-options.json';
const definitionPath='fixtures/reviews/definitions/helix-adr-options.json';
const sourcePath='fixtures/visual/sources/helix/ADR-002-tracker-write-safety-model.md';
const manifestPath='fixtures/reviews/review-sources.json';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=(path:string)=>readFileSync(path);
const originalBytes=read(originalPath),original=readVisualDocument(originalBytes.toString('utf8'),'json') as Document,originalVisual=getVisual(original) as Visual;
const definitionBytes=read(definitionPath),definition=readVisualDocument(definitionBytes.toString('utf8'),'json') as Document,visual=getVisual(definition) as Visual;
const adrBytes=read(sourcePath),adr=adrBytes.toString('utf8');
const manifest=JSON.parse(read(manifestPath).toString('utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='helix-adr-options')!;
function sourceAlternatives(){
 const section=adr.match(/^## Alternatives\s*\n([\s\S]*?)(?=^##\s)/mu)?.[1];if(!section)throw Error('Cited ADR is missing its Alternatives section.');
 return section.split(/\r?\n/u).filter(line=>/^\s*\|/u.test(line)&&!/^\s*\|[-|\s]+\|\s*$/u.test(line)).slice(1).map(line=>line.split('|').slice(1,-1).map(cell=>cell.trim().replaceAll('**','')));
}
const alternatives=sourceAlternatives();

test('ADR-002 reviewed definition adds exactly the source-backed omitted alternative',()=>{
 const originalHash=sha(originalBytes),definitionHash=sha(definitionBytes),adrHash=sha(adrBytes);
 expect(originalHash).toBe('b5fabfd6b990fbd2ee3b388cc98ac662e322b76d8bd1cfca89cb68d52885f391');
 expect(definitionHash).toBe('a09483cfd0581afa6c5b6661c7d533b3a27843e361aa3f2885e1dcb8e31a1026');
 expect(adrHash).toBe('888950fe3ebb754719453419e8315243784fe08847327ba88a189c9c14c93dc5');
 expect(original).toMatchObject({id:'visual:helix-adr-options',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(originalVisual).toMatchObject({id:'helix-adr-options',kind:'comparison',form:'matrix',title:'ADR-002: options considered',question:'Which tracker write-safety option, and why?'});
 expect(originalVisual.source).toEqual({path:'helix:docs/helix/02-design/adr/ADR-002-tracker-write-safety-model.md',view:'Alternatives',digest:`sha256:${adrHash}`});
 expect(alternatives).toHaveLength(3);expect(alternatives[0]).toEqual(['Keep naive JSONL read/modify/write and rely on careful operator usage','Lowest implementation effort','Proven corruption risk, no race semantics, unsafe for agent-driven refinement','Rejected: already failing in real use']);
 expect(alternatives[1]).toEqual(['Replace the tracker immediately with a database-backed system','Stronger concurrency primitives','Much larger implementation jump, higher distribution complexity, changes HELIX surface area substantially','Rejected for now: too large for the immediate hardening goal']);
 expect(alternatives[2]).toEqual(['Keep JSONL but define and enforce a conservative write-safety contract','Preserves the current HELIX tracker shape, addresses current failures, enables deterministic testing','Requires explicit conflict/corruption handling and careful write-path design','Selected: smallest sufficient hardening']);
 expect(visual.id).toBe(originalVisual.id);expect(definition.id).toBe(original.id);expect(definition.umf).toBe(original.umf);expect(definition.vocabularies).toEqual(original.vocabularies);
 expect(visual).toMatchObject({id:originalVisual.id,kind:originalVisual.kind,form:originalVisual.form,title:originalVisual.title,question:originalVisual.question,source:originalVisual.source});
 expect(visual.comparison?.items.map(({id,label})=>({id,label}))).toEqual([
  {id:'option-naive',label:alternatives[0]![0]!},
  ...originalVisual.comparison!.items.map(({id,label})=>({id,label}))
 ]);
 expect(visual.comparison?.criteria).toEqual(originalVisual.comparison?.criteria);
 expect(visual.comparison?.values.filter(value=>value.item==='option-naive').map(({criterion,text})=>({criterion,text}))).toEqual([
  {criterion:'pros',text:alternatives[0]![1]},
  {criterion:'cons',text:alternatives[0]![2]},
  {criterion:'evaluation',text:alternatives[0]![3]}
 ]);
 expect(visual.comparison?.values.filter(value=>value.item!=='option-naive')).toEqual(originalVisual.comparison?.values);
 expect(visual.comparison?.chosen).toEqual(originalVisual.comparison?.chosen);
 expect(visual.comparison?.chosen).toEqual({item:'option-2',reason:'smallest sufficient hardening'});
 const expected=structuredClone(original) as Document,expectedVisual=expected.extensions!['umf.visual'] as unknown as Visual;
 expectedVisual.comparison!.items.unshift({id:'option-naive',label:alternatives[0]![0]!});
 expectedVisual.comparison!.values.unshift(...(['pros','cons','evaluation'] as const).map((criterion,index)=>({item:'option-naive',criterion,text:alternatives[0]![index+1]!})));
 expect(definition).toEqual(expected);expect(inspectVisual(definition)).toMatchObject({valid:true,complete:true});
 const originalJson=readVisualDocument(originalBytes.toString('utf8'),'json');expect(JSON.parse(writeVisualDocument(originalJson,'json'))).toEqual(original);
 const yaml=writeVisualDocument(definition,'yaml'),yamlParsed=readVisualDocument(yaml,'yaml');expect(getVisual(yamlParsed)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlParsed,'json'))).toEqual(definition);
 const payload=visualPayloadYaml(definition);for(const cell of alternatives[0]!)expect(payload).toContain(cell);
 expect(sha(read(originalPath))).toBe(originalHash);expect(sha(read(definitionPath))).toBe(definitionHash);expect(sha(read(sourcePath))).toBe(adrHash);
});

test('ADR-002 review binds original fixture, source-matched definition, and exact cited Markdown',async()=>{
 const originalHash=sha(originalBytes),definitionHash=sha(definitionBytes),adrHash=sha(adrBytes),scope='The original Visual 1.0.0 fixture remains unchanged and is published byte-for-byte. The separately reviewed definition adds one source-backed matrix item, `option-naive`, with the exact first alternative and its Pros, Cons, and Evaluation cells from the cited ADR’s Alternatives table. Original `option-1` and `option-2` IDs and relative order, all three criterion IDs/types, the selected `option-2`, and its reason are preserved. The cited ADR’s raw SHA-256 exactly matches the digest in the fixture locator. The selected decision is the ADR’s historical authored evaluation, not a claim about current tracker implementation, concurrency, corruption handling, or safety guarantees. No weights, numeric ratings, or other claims are added.';
 expect(review).toMatchObject({id:'helix-adr-options',title:'ADR-002: options considered',kind:'comparison',form:'matrix',definitionPath,definitionSha256:definitionHash});
 expect(review.sources).toEqual([
  {path:originalPath,sha256:originalHash,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies the two original options, three text criteria, their cells, the selected option and reason, and the cited ADR locator.'},
  {path:sourcePath,sha256:adrHash,pointer:'Alternatives table',label:'Cited HELIX ADR-002',originalLocator:'helix:docs/helix/02-design/adr/ADR-002-tracker-write-safety-model.md',resolvedSource:'helix/docs/helix/02-design/adr/ADR-002-tracker-write-safety-model.md',description:'Exact Markdown bytes resolved from the fixture locator. The Alternatives table contains three options and their exact Pros, Cons, and Evaluation text, including the naive JSONL alternative omitted from the original Visual fixture. The ADR records a historical decision; it does not establish current tracker behavior or safety.'}
 ]);
 expect(review.publishedAssets).toEqual([
  {path:originalPath,sha256:originalHash,outputPath:'reviews/helix-adr-options/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:sourcePath,sha256:adrHash,outputPath:'reviews/helix-adr-options/ADR-002-tracker-write-safety-model.md',mediaType:'text/markdown',description:'Exact cited ADR Markdown bytes published without transformation.'}
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath:originalPath,sourceSha256:originalHash,documentId:'visual:helix-adr-options',visualId:'helix-adr-options',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/helix-adr-options/authoritative-source.json',scope});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
