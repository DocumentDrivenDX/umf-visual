// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/tpl-design-process.json';
const definitionPath='fixtures/reviews/definitions/tpl-design-process.json';
const activityPath='fixtures/visual/sources/helix/design-activity-readme.md';
const manifestPath='fixtures/reviews/review-sources.json';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=readFileSync(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,visual=getVisual(source) as Visual;
const definitionBytes=readFileSync(definitionPath),definition=readVisualDocument(definitionBytes.toString('utf8'),'json') as Document,reviewed=getVisual(definition) as Visual;
const activityBytes=readFileSync(activityPath),activity=activityBytes.toString('utf8');
const heading='## Process Flow';
const headingIndex=activity.indexOf(heading);
if(headingIndex<0)throw new Error('Cited design activity README has no Process Flow section.');
const block=activity.slice(headingIndex).match(/^```mermaid\s*\n([\s\S]*?)\n```/mu)?.[1];
if(!block)throw new Error('Process Flow section has no Mermaid graph.');
const definitions=[...block.matchAll(/\b([A-Z])(?:\[([^\]]+)\]|\{([^}]+)\})/gu)].map(([,id,square,brace])=>({id:id!,label:(square??brace)!.trim(),shape:brace?'diamond' as const:'rectangle' as const}));
const sourceNodes=[...new Map(definitions.map(node=>[node.id,node])).values()];
const sourceEdges=[...block.matchAll(/^\s*([A-Z])(?:\[[^\]]+\]|\{[^}]+\})?\s*-->\s*(?:\|([^|]+)\|\s*)?([A-Z])(?:\[[^\]]+\]|\{[^}]+\})?\s*$/gmu)].map(([,from,label,to])=>({from:from!.toLowerCase(),to:to!.toLowerCase(),...(label?{label:label.trim()}:{})}));
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='tpl-design-process')!;

test('design process graph preserves its source node shapes, direction, branch captions, and topology',()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),activityDigest=sha(activityBytes);
 expect(sourceDigest).toBe('8180efbffe52710582cb1fbd8583cb58661bf6d6706ef3dee3067de5e7d4116a');
 expect(definitionDigest).toBe('f84c1df247b07d5d6015946c64dea3bc0577547d8d709a929b31612e309c69cd');
 expect(activityDigest).toBe('17c6265784c4f8724d6950727a4cdbbbfe37cf42b184c22cabce1aa0198c3736');
 expect(source).toMatchObject({id:'visual:tpl-design-process',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'tpl-design-process',kind:'flow',form:'pipeline',title:'Process Flow',question:'What order does design work move in?'});
 expect(visual.source).toEqual({path:'helix:workflows/activities/02-design/README.md',view:'Process Flow',digest:`sha256:${activityDigest}`});
 expect(block).toMatch(/^graph TD\r?\n/u);
 expect(sourceNodes).toEqual([
  {id:'A',label:'Review Frame Outputs',shape:'rectangle'}, {id:'B',label:'Create Solution Design',shape:'rectangle'},
  {id:'C',label:'Design Architecture',shape:'rectangle'}, {id:'D',label:'Create Diagrams',shape:'rectangle'},
  {id:'E',label:'Define Contracts',shape:'rectangle'}, {id:'F',label:'Design Data Model',shape:'rectangle'},
  {id:'G',label:'Design Security',shape:'rectangle'}, {id:'H',label:'Document ADRs',shape:'rectangle'},
  {id:'I',label:'Validate Against Principles',shape:'rectangle'}, {id:'J',label:'Principles Met?',shape:'diamond'},
  {id:'K',label:'Simplify Design',shape:'rectangle'}, {id:'L',label:'Technical Review',shape:'rectangle'},
  {id:'M',label:'Material choices resolved?',shape:'diamond'}, {id:'N',label:'Gate to Test Activity',shape:'rectangle'}
 ]);
 expect(sourceEdges).toHaveLength(15);
 expect(sourceEdges.filter(edge=>edge.label!==undefined).map(edge=>edge.label)).toEqual(['No','Yes','No','Yes']);
 expect(reviewed.nodes?.map(({id,label,shape})=>({id,label,shape}))).toEqual(sourceNodes.map(({id,label,shape})=>({id:id.toLowerCase(),label,shape})));
 expect(reviewed.layout).toEqual({kind:'flow',direction:'TB'});
 expect(reviewed.edges?.map(({from,to,label})=>({from,to,...(label?{label}:{})}))).toEqual(sourceEdges);
 expect(visual.edges?.filter(edge=>edge.kind==='return').map(({from,to})=>({from,to}))).toEqual([{from:'k',to:'c'},{from:'m',to:'c'}]);
 expect(reviewed.edges).toEqual(visual.edges);
 const expected=structuredClone(source) as any,expectedVisual=expected.extensions['umf.visual'];
 expected.vocabularies['umf.visual'].version='1.4.0';expectedVisual.layout={kind:'flow',direction:'TB'};
 for(const node of expectedVisual.nodes){node.shape=node.id==='j'||node.id==='m'?'diamond':'rectangle';}
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

test('design-process review binds the exact fixture and historical HELIX activity README',async()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),activityDigest=sha(activityBytes);
 const scope="The exact original Visual 1.0.0 fixture remains unchanged and is published byte-for-byte. The separate reviewed Visual 1.4.0 definition preserves all fourteen node IDs/labels/order, fifteen edge IDs/endpoints/labels, title/question, and source metadata; it upgrades only the visual vocabulary version and adds source-mapped node shapes plus a root flow direction. Mermaid square-bracket declarations map to rectangles, brace-delimited J and M map to diamonds, and graph TD maps to flow direction TB. The fixture's two `kind: return` values are Visual-flow projections; the cited source uses ordinary directed arrows for all edges. No roles or additional nodes/edges are inferred, and no material from adjacent design-activity sections is merged into the selected Process Flow. The source digest matches HELIX commit ceb218e6fffbb5c6e43dfc5b42aa0c665e2b5481.";
 expect(review).toMatchObject({id:'tpl-design-process',title:'Process Flow',kind:'flow',form:'pipeline',definitionPath,definitionSha256:definitionDigest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact original Visual 1.0.0 fixture supplies fourteen ordered node labels, fifteen directed edges and branch labels, title/question, and the cited activity README locator.'},
  {path:activityPath,sha256:activityDigest,pointer:'Process Flow Mermaid graph',label:'Cited HELIX design activity README',originalLocator:'helix:workflows/activities/02-design/README.md',resolvedSource:'helix/workflows/activities/02-design/README.md',observedRevision:'ceb218e6fffbb5c6e43dfc5b42aa0c665e2b5481',description:'Exact historical Markdown bytes resolved from the fixture locator at the recorded HELIX commit. The selected Process Flow graph supplies fourteen node labels, a top-to-bottom direction, two brace-delimited decision nodes, and fifteen directed edges with four yes/no branch captions. Other design-activity material is outside this selected view.'}
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/tpl-design-process/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:activityPath,sha256:activityDigest,outputPath:'reviews/tpl-design-process/design-activity-readme.md',mediaType:'text/markdown',description:'Exact historical design-activity README bytes resolved from the fixture locator.'}
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:tpl-design-process',visualId:'tpl-design-process',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/tpl-design-process/authoritative-source.json',scope});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
