// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/beacon-ticket-lifecycle.json';
const pythonPath='fixtures/visual/sources/beacon/beacon/ticket_state.py';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=readFileSync(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,visual=getVisual(source) as Visual;
const pythonBytes=readFileSync(pythonPath),python=pythonBytes.toString('utf8');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='beacon-ticket-lifecycle')!;
const enumValues=[...python.matchAll(/^\s{4}([A-Z]+)\s*=\s*"([^"]+)"/gmu)].map(match=>({name:match[1]!,value:match[2]!}));
const sourcePairs=[...python.matchAll(/^\s{4}Phase\.([A-Z]+):\s*\{([^}]+)\}/gmu)].flatMap(match=>[...match[2]!.matchAll(/Phase\.([A-Z]+)/gu)].map(target=>`${match[1]!.toLowerCase()}->${target[1]!.toLowerCase()}`)).sort();

test('ticket lifecycle preserves the exact Visual source and agrees with cited Phase values and transition pairs',()=>{
 const sourceDigest=hash(sourceBytes),pythonDigest=hash(pythonBytes);
 expect(sourceDigest).toBe('0e0b1724b647060b80754c4b3cc77ea92c08f2ab0f7607cf3cd69dfbe35403c8');
 expect(pythonDigest).toBe('9447e4c82588b667b7394bb0acb79607774dabed977bfe8e751ad6ca94603775');
 expect(source).toMatchObject({id:'visual:beacon-ticket-lifecycle',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'beacon-ticket-lifecycle',kind:'state',form:'lifecycle',title:"A ticket's phases",audience:'developer'});
 expect(visual.source).toEqual({path:`umf:${pythonPath}`,view:'Phase',digest:`sha256:${pythonDigest}`});
 expect(python).toContain('fictional example source');
 expect(enumValues).toEqual([{name:'NEW',value:'new'},{name:'ASSIGNED',value:'assigned'},{name:'ANSWERED',value:'answered'},{name:'CLOSED',value:'closed'}]);
 expect(visual.nodes?.map(node=>node.id)).toEqual(enumValues.map(item=>item.value));
 expect(sourcePairs).toHaveLength(6);
 expect((visual.state?.transitions??[]).map(item=>`${item.from}->${item.to}`).sort()).toEqual(sourcePairs);
 expect(visual.state?.transitions).toHaveLength(6);
 expect(visual.state?.transitions.map(item=>item.id)).toEqual(['t1','t2','t3','t4','t5','t6']);
 expect(visual.state?.initial).toBe('new');expect(visual.state?.final).toEqual(['closed']);
 expect(visual.state?.transitions.map(item=>item.event)).toEqual(['an agent picks it up','the agent sends a reply','close','reassign','close as spam','the customer writes back']);
 expect(visual.state?.transitions.map(item=>item.path)).toEqual(['main','main','main','alternate','alternate','alternate']);
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(source),parsed=readVisualDocument(sourceBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(parsed,'json'))).toEqual(source);
 const yaml=writeVisualDocument(parsed,'yaml'),yamlParsed=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlParsed)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlParsed,'json'))).toEqual(source);
 const payload=visualPayloadYaml(source);for(const transition of visual.state!.transitions)expect(payload).toContain(transition.event);
 expect(JSON.stringify(source)).toBe(before);expect(hash(readFileSync(sourcePath))).toBe(sourceDigest);expect(hash(readFileSync(pythonPath))).toBe(pythonDigest);
});

test('review manifest binds and publishes original JSON and the exact cited Python bytes',async()=>{
 const sourceDigest=hash(sourceBytes),pythonDigest=hash(pythonBytes);
 expect(review).toMatchObject({id:'beacon-ticket-lifecycle',title:'A ticket’s phases',kind:'state',form:'lifecycle',definitionPath:sourcePath,definitionSha256:sourceDigest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies the state and transition IDs, labels, initial/final markers, event captions, path groups, title, question, takeaway, and cited Python source locator.'},
  {path:pythonPath,sha256:pythonDigest,pointer:'Phase enum and TRANSITIONS mapping',label:'Cited fictional Python source',description:'The exact Python bytes define four Phase values and the possible transition pairs. They do not define the Visual event captions, main/alternate path labels, initial/final markers, or the diagram’s authoring metadata; those remain fixture-authored. The source docstring identifies the example as fictional.'},
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/beacon-ticket-lifecycle/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:pythonPath,sha256:pythonDigest,outputPath:'reviews/beacon-ticket-lifecycle/ticket_state.py',mediaType:'text/x-python',description:'Exact cited fictional Python source bytes for source-preserving download; the file is offered as text and is not executed.'},
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:beacon-ticket-lifecycle',visualId:'beacon-ticket-lifecycle',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/beacon-ticket-lifecycle/authoritative-source.json',scope:'The original Visual 1.0.0 fixture remains unchanged as the review definition. It preserves four state IDs and labels, six ordered transition IDs and endpoints, initial/final markers, event captions, main/alternate path annotations, and its question/takeaway. The cited Python source independently supports the four Phase values and the six possible endpoint pairs; it does not specify transition captions, path groups, initial/final markers, or ordering. Those are fixture-authored semantics, not claims attributed to the Python file. The source docstring calls Beacon a fictional example; neither file establishes a deployed or current lifecycle.'});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
