// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/tpl-design-investigation.json';
const definitionPath='fixtures/reviews/definitions/tpl-design-investigation.json';
const activityPath='fixtures/visual/sources/helix/design-activity-readme.md';
const manifestPath='fixtures/reviews/review-sources.json';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=readFileSync(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,visual=getVisual(source) as Visual;
const definitionBytes=readFileSync(definitionPath),definition=readVisualDocument(definitionBytes.toString('utf8'),'json') as Document,reviewed=getVisual(definition) as Visual;
const activityBytes=readFileSync(activityPath),activity=activityBytes.toString('utf8');
const heading='#### Investigation-Informed Design Process';
const headingIndex=activity.indexOf(heading);
if(headingIndex<0)throw new Error('Cited design activity README has no investigation-informed process section.');
const block=activity.slice(headingIndex).match(/^```mermaid\s*\n([\s\S]*?)\n```/mu)?.[1];
if(!block)throw new Error('Investigation-informed process section has no Mermaid graph.');
const definitions=[...block.matchAll(/\b([A-Z])(?:\[([^\]]+)\]|\{([^}]+)\})/gu)].map(([,id,square,brace])=>({id:id!,label:(square??brace)!.trim(),shape:brace?'diamond' as const:'rectangle' as const}));
const sourceNodes=[...new Map(definitions.map(node=>[node.id,node])).values()];
const sourceEdges=[...block.matchAll(/^\s*([A-Z])(?:\[[^\]]+\]|\{[^}]+\})?\s*-->\s*(?:\|([^|]+)\|\s*)?([A-Z])(?:\[[^\]]+\]|\{[^}]+\})?\s*$/gmu)].map(([,from,label,to])=>({from:from!.toLowerCase(),to:to!.toLowerCase(),...(label?{label:label.trim()}:{})}));
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='tpl-design-investigation')!;

test('investigation design graph preserves its source node shapes, direction, branches, and topology',()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),activityDigest=sha(activityBytes);
 expect(sourceDigest).toBe('73efc4d3b4706ccc25dd743763016e11952afc38344851dbf6bb3705e0e53aa0');
 expect(definitionDigest).toBe('d441d11ff5df4da095f0983a63f4201319ec1d31cc7d05dc0fb1d27762f4dde3');
 expect(activityDigest).toBe('17c6265784c4f8724d6950727a4cdbbbfe37cf42b184c22cabce1aa0198c3736');
 expect(source).toMatchObject({id:'visual:tpl-design-investigation',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'tpl-design-investigation',kind:'flow',form:'pipeline',title:'Investigation-Informed Design Process',question:'When does design need an investigation first?'});
 expect(visual.source).toEqual({path:'helix:workflows/activities/02-design/README.md',view:'Investigation-Informed Design Process',digest:`sha256:${activityDigest}`});
 expect(block).toMatch(/^graph TD\r?\n/u);
 expect(sourceNodes).toEqual([
  {id:'A',label:'Frame Requirements Available',shape:'rectangle'},
  {id:'B',label:'Technical Uncertainty Exists?',shape:'diamond'},
  {id:'C',label:'Identify Technical Questions',shape:'rectangle'},
  {id:'D',label:'Standard Design Artifacts',shape:'rectangle'},
  {id:'E',label:'Scope of Investigation',shape:'diamond'},
  {id:'F',label:'Technical Spike',shape:'rectangle'},
  {id:'G',label:'Proof of Concept',shape:'rectangle'},
  {id:'H',label:'Spike Findings',shape:'rectangle'},
  {id:'I',label:'PoC Results',shape:'rectangle'},
  {id:'J',label:'Sufficient Confidence?',shape:'diamond'},
  {id:'K',label:'Additional Investigation',shape:'rectangle'},
  {id:'L',label:'Solution Design & Architecture',shape:'rectangle'}
 ]);
 expect(sourceEdges).toHaveLength(14);
 expect(reviewed.nodes?.map(({id,label,shape})=>({id,label,shape}))).toEqual(sourceNodes.map(({id,label,shape})=>({id:id.toLowerCase(),label,shape})));
 expect(reviewed.layout).toEqual({kind:'flow',direction:'TB'});
 expect(reviewed.edges?.map(({from,to,label})=>({from,to,...(label?{label}:{})}))).toEqual(sourceEdges);
 expect(visual.edges?.filter(edge=>edge.kind==='return').map(({from,to})=>({from,to}))).toEqual([{from:'j',to:'d'},{from:'k',to:'e'}]);
 expect(reviewed.edges).toEqual(visual.edges);
 expect(reviewed.nodes?.map(({id,label,role,detail})=>({id,label,role,detail}))).toEqual(visual.nodes?.map(({id,label,role,detail})=>({id,label,role,detail})));
 const expected=structuredClone(source) as any,expectedVisual=expected.extensions['umf.visual'];
 expected.vocabularies['umf.visual'].version='1.4.0';expectedVisual.layout={kind:'flow',direction:'TB'};
 for(const node of expectedVisual.nodes){const sourceNode=sourceNodes.find(candidate=>candidate.id.toLowerCase()===node.id)!;node.shape=sourceNode.shape;}
 expect(definition).toEqual(expected);
 expect(definition.id).toBe(source.id);expect(definition.umf).toBe(source.umf);
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});expect(inspectVisual(definition)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(source),parsed=readVisualDocument(sourceBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(parsed,'json'))).toEqual(source);
 const yaml=writeVisualDocument(definition,'yaml'),yamlParsed=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlParsed)).toEqual(reviewed);expect(JSON.parse(writeVisualDocument(yamlParsed,'json'))).toEqual(definition);
 const payload=visualPayloadYaml(definition);for(const node of reviewed.nodes??[])expect(payload).toContain(node.label);
 expect(JSON.stringify(source)).toBe(before);expect(sha(readFileSync(sourcePath))).toBe(sourceDigest);expect(sha(readFileSync(definitionPath))).toBe(definitionDigest);expect(sha(readFileSync(activityPath))).toBe(activityDigest);
});

test('design-investigation review binds the exact fixture and historical HELIX activity README',async()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),activityDigest=sha(activityBytes);
 const scope="The exact original Visual 1.0.0 fixture remains unchanged and is published byte-for-byte. The separate reviewed Visual 1.4.0 definition preserves its twelve node IDs/labels/order, fourteen edge IDs/endpoints/labels, title/question, and source metadata; it upgrades only the visual vocabulary version and adds source-mapped node shapes plus a root flow direction. Mermaid square-bracket declarations map to rectangle shapes, brace-delimited B, E, and J map to diamonds, and graph TD maps to flow direction TB. The fixture's two `kind: return` values are Visual-flow projections; the cited source uses ordinary directed arrows for all edges. No roles or additional nodes/edges are inferred, and no time-budget guidance from surrounding sections is merged into the selected process. The source digest matches HELIX commit ceb218e6fffbb5c6e43dfc5b42aa0c665e2b5481.";
 expect(review).toMatchObject({id:'tpl-design-investigation',title:'Investigation-Informed Design Process',kind:'flow',form:'pipeline',definitionPath,definitionSha256:definitionDigest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact original Visual 1.0.0 fixture supplies twelve ordered node labels, fourteen directed edges and branch labels, title/question, and the cited activity README locator.'},
  {path:activityPath,sha256:activityDigest,pointer:'Investigation-Informed Design Process Mermaid graph',label:'Cited HELIX design activity README',originalLocator:'helix:workflows/activities/02-design/README.md',resolvedSource:'helix/workflows/activities/02-design/README.md',observedRevision:'ceb218e6fffbb5c6e43dfc5b42aa0c665e2b5481',description:'Exact historical Markdown bytes resolved from the fixture locator at the recorded HELIX commit. The selected Mermaid graph supplies twelve node labels, a top-to-bottom direction, three brace-delimited decision nodes, and fourteen directed edges with six branch captions. Other activity guidance, including investigation time budgets, is outside this selected view.'}
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/tpl-design-investigation/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:activityPath,sha256:activityDigest,outputPath:'reviews/tpl-design-investigation/design-activity-readme.md',mediaType:'text/markdown',description:'Exact historical design-activity README bytes resolved from the fixture locator.'}
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:tpl-design-investigation',visualId:'tpl-design-investigation',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/tpl-design-investigation/authoritative-source.json',scope});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
