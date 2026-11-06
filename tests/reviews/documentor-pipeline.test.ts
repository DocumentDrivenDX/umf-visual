// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const definitionPath='fixtures/visual/inventory/documentor-pipeline.json';
const sourcePath='fixtures/visual/sources/helix/documentor-walkthrough.md';
const manifestPath='fixtures/reviews/review-sources.json';
const digest=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const definitionBytes=readFileSync(definitionPath),definition=readVisualDocument(definitionBytes.toString('utf8'),'json') as Document,visual=getVisual(definition) as Visual;
const walkthroughBytes=readFileSync(sourcePath),walkthrough=walkthroughBytes.toString('utf8');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='documentor-pipeline')!;
const diagram=walkthrough.match(/```mermaid\r?\n([\s\S]*?)\r?\n```/u)?.[1];
const parsedDiagram=():{participants:Array<{id:string;label:string}>;messages:Array<{from:string;to:string;label:string;kind:'call'|'return'}>}=>{
 if(!diagram)throw Error('The cited walkthrough is missing its Mermaid sequence diagram.');
 const participants=diagram.split(/\r?\n/u).map(line=>/^\s*participant\s+(\w+)\s+as\s+(.+?)\s*$/u.exec(line)).filter((item):item is RegExpExecArray=>item!==null).map(match=>({id:match[1]!.toLowerCase(),label:match[2]!}));
 const messages=diagram.split(/\r?\n/u).map(line=>/^\s*(\w+)(-->>|->>)(\w+):\s*(.*?)\s*$/u.exec(line)).filter((item):item is RegExpExecArray=>item!==null).map(match=>({from:match[1]!.toLowerCase(),kind:(match[2]==='-->>'?'return':'call') as 'return'|'call',to:match[3]!.toLowerCase(),label:match[4]!}));
 return{participants,messages};
};

test('documentor pipeline preserves the exact Visual source and matches the cited Sequence diagram',()=>{
 const fixtureHash=digest(definitionBytes),walkthroughHash=digest(walkthroughBytes),source=parsedDiagram();
 expect(fixtureHash).toBe('fd9e8c9ecf5b851e56b578627e29bc596ac609e477c0a86827b910bc3adefc46');
 expect(walkthroughHash).toBe('c56f18a68ed719c9c1936ab87b491b95e7266726ab05e48bac84a6126f0a6e31');
 expect(definition).toMatchObject({id:'visual:documentor-pipeline',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'documentor-pipeline',kind:'sequence',form:'lifelines',title:'documentor check',question:'What happens in documentor check?'});
 expect(visual.source).toEqual({path:'helix:tools/documentor/docs/guide/developer/walkthrough.md',view:'Sequence',digest:`sha256:${walkthroughHash}`});
 expect(source.participants).toHaveLength(6);expect(visual.sequence?.participants).toHaveLength(6);
 expect(visual.sequence?.participants.map(({id,label})=>({id,label}))).toEqual(source.participants);
 expect(source.messages).toHaveLength(10);expect(visual.sequence?.messages).toHaveLength(10);
 expect(visual.sequence?.messages.map(({from,to,label,kind})=>({from,to,label,kind}))).toEqual(source.messages);
 expect(visual.sequence?.messages.map(({id})=>id)).toEqual(Array.from({length:10},(_,index)=>`m${index+1}`));
 expect(visual.sequence?.messages.filter(({kind})=>kind==='return').map(({id})=>id)).toEqual(['m3','m9','m10']);
 expect(visual.sequence?.messages.find(({id})=>id==='m7')).toMatchObject({from:'cli',to:'cli',kind:'call'});
 expect(Object.hasOwn(visual.sequence??{},'lifelines')).toBe(false);expect(visual.steps).toBeUndefined();expect(visual.state).toBeUndefined();
 expect(walkthrough).toContain('A `check` writes nothing to disk.');
 expect(visual.title).not.toBe('Request walkthrough');expect(visual.question).not.toBe('Request walkthrough');
 expect(inspectVisual(definition)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(definition),parsed=readVisualDocument(definitionBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(parsed,'json'))).toEqual(definition);
 const yaml=writeVisualDocument(parsed,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(definition);
 const payload=visualPayloadYaml(definition);expect(payload).toContain('documentor check --root .');expect(payload).toContain('run_check([out], root, False)');
 expect(JSON.stringify(definition)).toBe(before);expect(digest(readFileSync(definitionPath))).toBe(fixtureHash);expect(digest(readFileSync(sourcePath))).toBe(walkthroughHash);
});

test('documentor review cites and publishes exact original fixture and HELIX Markdown bytes',async()=>{
 const fixtureHash=digest(definitionBytes),walkthroughHash=digest(walkthroughBytes);
 expect(review).toMatchObject({id:'documentor-pipeline',title:'documentor check',kind:'sequence',form:'lifelines',definitionPath,definitionSha256:fixtureHash});
 expect(review.sources).toEqual([
  {path:definitionPath,sha256:fixtureHash,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies participant and message IDs, labels, endpoints, call/return kinds and order, plus the diagram title, question, and source locator.'},
  {path:sourcePath,sha256:walkthroughHash,pointer:'Sequence section / Mermaid diagram',label:'Cited HELIX walkthrough snapshot',originalLocator:'helix:tools/documentor/docs/guide/developer/walkthrough.md',resolvedSource:'helix/tools/documentor/docs/guide/developer/walkthrough.md',description:'Byte-identical snapshot of the exact Markdown source resolved from the fixture locator. Its Mermaid Sequence diagram supplies the participant aliases, labels, message text, direction, and authored order. The page also describes `check` as read-only; it does not establish a current execution or deployed system.'},
 ]);
 expect(review.publishedAssets).toEqual([
  {path:definitionPath,sha256:fixtureHash,outputPath:'reviews/documentor-pipeline/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:sourcePath,sha256:walkthroughHash,outputPath:'reviews/documentor-pipeline/walkthrough.md',mediaType:'text/markdown',description:'Exact Markdown bytes resolved from helix:tools/documentor/docs/guide/developer/walkthrough.md and published without transformation.'},
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath:definitionPath,sourceSha256:fixtureHash,documentId:'visual:documentor-pipeline',visualId:'documentor-pipeline',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/documentor-pipeline/authoritative-source.json',scope:'The exact Visual 1.0.0 fixture remains unchanged as the review definition and preserves its participant/message IDs, labels, endpoints, kinds, order, title, question, and source locator. The fixture’s locator `helix:tools/documentor/docs/guide/developer/walkthrough.md` resolves to the HELIX repository path `tools/documentor/docs/guide/developer/walkthrough.md`; its SHA-256 exactly matches the checked-in byte-identical Markdown snapshot published here. The source’s Mermaid Sequence diagram confirms the participant aliases/labels, message captions, directions, and ordering. The message IDs and `lifelines` form are fixture projections. The surrounding walkthrough says `check` writes nothing to disk, but no check run or current deployment is claimed. Other prose steps and test evidence in the walkthrough are outside this selected Sequence view.'});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
