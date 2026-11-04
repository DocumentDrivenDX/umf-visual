// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/tpl-arch-dataflow.json';
const architecturePath='fixtures/visual/sources/helix/architecture-example.md';
const manifestPath='fixtures/reviews/review-sources.json';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=readFileSync(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,visual=getVisual(source) as Visual;
const architectureBytes=readFileSync(architecturePath),architecture=architectureBytes.toString('utf8');
const section=architecture.match(/^## Data Flow\s*\n([\s\S]*?)(?=^##\s)/mu)?.[1];
if(!section)throw new Error('Cited architecture example has no Data Flow section.');
const sequence=section.match(/```mermaid\s*\n([\s\S]*?)\n```/u)?.[1];
if(!sequence)throw new Error('Cited Data Flow section has no Mermaid sequence diagram.');
const declarations=[...sequence.matchAll(/^\s*participant\s+(\w+)(?:\s+as\s+(.+?))?\s*$/gmu)].map(([,alias,label])=>({alias:alias!,label:(label??alias)!.trim()}));
const aliasToId=new Map((visual.sequence?.participants??[]).map(({id,label})=>[label,id]));
const participantId=(alias:string)=>{const label=declarations.find(item=>item.alias===alias)?.label,id=label?aliasToId.get(label):undefined;if(!id)throw new Error(`Unknown Data Flow participant alias: ${alias}`);return id;};
const sourceMessages=[...sequence.matchAll(/^\s*(\w+)\s*(-->>|->>)\s*(\w+)\s*:\s*(.*?)\s*$/gmu)].map(([,from,arrow,to,label])=>({from:participantId(from!),to:participantId(to!),label:label!,kind:arrow==='-->>'?'return' as const:'call' as const}));
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='tpl-arch-dataflow')!;

test('DepositMatch Data Flow preserves the exact six participants and thirteen ordered messages',()=>{
 const sourceDigest=sha(sourceBytes),architectureDigest=sha(architectureBytes);
 expect(sourceDigest).toBe('1164b43bc602003376f4205fd6dcafcc2477cecfa333ace7182edfc32d474af2');
 expect(architectureDigest).toBe('4c79ba17f9d9342592c062b9a51cef0232816004b59f110488f696e7a8e191b8');
 expect(source).toMatchObject({id:'visual:tpl-arch-dataflow',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'tpl-arch-dataflow',kind:'sequence',form:'lifelines',title:'Data Flow',question:'What happens, step by step, when a client imports files?'});
 expect(visual.source).toEqual({path:'helix:workflows/activities/02-design/artifacts/architecture/example.md',view:'Data Flow',digest:`sha256:${architectureDigest}`});
 expect(declarations).toEqual([
  {alias:'Maya',label:'Maya'},
  {alias:'Web',label:'React Web App'},
  {alias:'API',label:'Fastify API'},
  {alias:'S3',label:'S3 Source File Store'},
  {alias:'DB',label:'PostgreSQL'},
  {alias:'Worker',label:'Matching Worker'}
 ]);
 expect(visual.sequence?.participants).toHaveLength(6);
 expect(visual.sequence?.participants.map(({id,label})=>({id,label}))).toEqual([
  {id:'maya',label:'Maya'}, {id:'web',label:'React Web App'}, {id:'api',label:'Fastify API'},
  {id:'s3',label:'S3 Source File Store'}, {id:'db',label:'PostgreSQL'}, {id:'worker',label:'Matching Worker'}
 ]);
 expect(sourceMessages).toHaveLength(13);
 expect(visual.sequence?.messages?.map(({from,to,label,kind})=>({from,to,label,kind}))).toEqual(sourceMessages);
 expect(sourceMessages.filter(message=>message.kind==='return')).toHaveLength(2);
 expect(sourceMessages[3]).toMatchObject({from:'api',to:'api',label:'Validate mapping and rows',kind:'call'});
 expect(sourceMessages.slice(0,10).map(({label})=>label)).toEqual([
  'Upload bank and invoice CSVs','POST import session files','Store encrypted originals','Validate mapping and rows',
  'Commit accepted rows and rejection reasons','Import summary','Confirm import summary','Confirm import',
  'Mark import confirmed and enqueue matching job','Read accepted rows and create suggestions'
 ]);
 expect(sourceMessages.slice(10).map(({label})=>label)).toEqual(['Load match review queue','Read suggestions with source-row evidence','Suggestions and evidence']);
 expect(visual.steps).toBeUndefined();expect(visual.edges).toBeUndefined();
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(source),parsed=readVisualDocument(sourceBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(parsed,'json'))).toEqual(source);
 const yaml=writeVisualDocument(parsed,'yaml'),yamlParsed=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlParsed)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlParsed,'json'))).toEqual(source);
 const payload=visualPayloadYaml(source);for(const participant of visual.sequence?.participants??[])expect(payload).toContain(participant.label);for(const message of visual.sequence?.messages??[])expect(payload).toContain(message.label);
 expect(JSON.stringify(source)).toBe(before);expect(sha(readFileSync(sourcePath))).toBe(sourceDigest);expect(sha(readFileSync(architecturePath))).toBe(architectureDigest);
});

test('Data Flow review publishes the exact fixture and historical architecture Markdown',async()=>{
 const sourceDigest=sha(sourceBytes),architectureDigest=sha(architectureBytes);
 const scope="The exact original Visual 1.0.0 fixture remains unchanged and is published byte-for-byte as the reviewed definition. Its six ordered participants and thirteen ordered messages match the selected Data Flow Mermaid sequence in the cited Markdown source. Participant/message IDs, the question, and the sequence/lifelines vocabulary are Visual-fixture projections. Message labels/endpoints and order are source-authored; the two dashed Mermaid replies are projected as Visual return kinds. The source does not assert elapsed time, duration, activation bars, or concurrency. No Level 2 container responsibilities or other architecture sections are merged into this selected Data Flow view. The cited digest matches the architecture example in HELIX commit 19065f860a9e26b0cb52831de59b524ed6a55de6.";
 expect(review).toMatchObject({id:'tpl-arch-dataflow',title:'Data Flow',kind:'sequence',form:'lifelines',definitionPath:sourcePath,definitionSha256:sourceDigest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies six participant identities/labels, thirteen ordered message labels/endpoints, two return-kind projections, title/question, and the cited architecture-example locator.'},
  {path:architecturePath,sha256:architectureDigest,pointer:'Data Flow Mermaid sequence diagram',label:'Cited HELIX architecture example',originalLocator:'helix:workflows/activities/02-design/artifacts/architecture/example.md',resolvedSource:'helix/workflows/activities/02-design/artifacts/architecture/example.md',observedRevision:'19065f860a9e26b0cb52831de59b524ed6a55de6',description:'Exact Markdown bytes resolved from the fixture locator at the recorded HELIX commit. The selected Data Flow sequence specifies six participants and thirteen ordered messages, including an API self-call and two dashed returns. It does not specify timing, activation bars, or concurrency. The file is a DepositMatch architecture example, not a claim about a deployed product.'}
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/tpl-arch-dataflow/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:architecturePath,sha256:architectureDigest,outputPath:'reviews/tpl-arch-dataflow/architecture-example.md',mediaType:'text/markdown',description:'Exact historical architecture-example Markdown bytes resolved from the original HELIX locator.'}
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:tpl-arch-dataflow',visualId:'tpl-arch-dataflow',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/tpl-arch-dataflow/authoritative-source.json',scope});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
