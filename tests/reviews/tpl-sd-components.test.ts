// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/tpl-sd-components.json';
const definitionPath='fixtures/reviews/definitions/tpl-sd-components.json';
const examplePath='fixtures/visual/sources/helix/solution-design-example.md';
const manifestPath='fixtures/reviews/review-sources.json';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=readFileSync(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,visual=getVisual(source) as Visual;
const definitionBytes=readFileSync(definitionPath),definition=readVisualDocument(definitionBytes.toString('utf8'),'json') as Document,reviewed=getVisual(definition) as Visual;
const exampleBytes=readFileSync(examplePath),example=exampleBytes.toString('utf8');
const heading='### Component Interactions';
const headingIndex=example.indexOf(heading);
if(headingIndex<0)throw new Error('Cited solution-design example has no Component Interactions section.');
const graph=example.slice(headingIndex).match(/^```mermaid\s*\n([\s\S]*?)\n```/mu)?.[1];
if(!graph)throw new Error('Component Interactions section has no Mermaid graph.');
const sourceNodes=[...graph.matchAll(/\b([A-Za-z]\w*)\[(\(?[^\]]+?\)?)\]/gu)].map(([,id,raw])=>{
 const wrapped=raw!.startsWith('(')&&raw!.endsWith(')'),label=(wrapped?raw!.slice(1,-1):raw!).trim();
 return{id:id!,label,shape:wrapped?'cylinder' as const:'rectangle' as const};
});
const uniqueNodes=[...new Map(sourceNodes.map(node=>[node.id,node])).values()];
const sourceEdges=[...graph.matchAll(/^\s*([A-Za-z]\w*)(?:\[[^\]]+\])?\s*-->\s*([A-Za-z]\w*)(?:\[[^\]]+\])?\s*$/gmu)].map(([,from,to])=>({from:from!.toLowerCase(),to:to!.toLowerCase()}));
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='tpl-sd-components')!;

test('solution-design component graph preserves source node shapes, direction, and exact topology',()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),exampleDigest=sha(exampleBytes);
 expect(sourceDigest).toBe('90083a017055e3b3cb7ffecd16023f73707c4f45a0672fb7a0b38cc64c7bd202');
 expect(definitionDigest).toBe('ad290d4e4cbeb57c7d3a9e0d05cc82e22e420ef85902b24c7ea2ae978df0a1be');
 expect(exampleDigest).toBe('5fac95cb298eb6534f2622aff81438c9e144954f3d8760694ff039360e120ab2');
 expect(source).toMatchObject({id:'visual:tpl-sd-components',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'tpl-sd-components',kind:'flow',form:'pipeline',title:'Component Interactions',question:'Which component hands the import to which?'});
 expect(visual.source).toEqual({path:'helix:workflows/activities/02-design/artifacts/solution-design/example.md',view:'Component Interactions',digest:`sha256:${exampleDigest}`});
 expect(graph).toMatch(/^graph TD\r?\n/u);
 expect(uniqueNodes).toEqual([
  {id:'Upload',label:'Upload Controller',shape:'rectangle'},
  {id:'Mapping',label:'Mapping Service',shape:'rectangle'},
  {id:'Validation',label:'CSV Validation Service',shape:'rectangle'},
  {id:'Summary',label:'Import Summary',shape:'rectangle'},
  {id:'Commit',label:'Import Commit Service',shape:'rectangle'},
  {id:'Rows',label:'Source Rows',shape:'cylinder'},
  {id:'Evidence',label:'Evidence Service',shape:'rectangle'}
 ]);
 expect(sourceEdges).toHaveLength(6);
 expect(reviewed.nodes?.map(({id,label,shape})=>({id,label,shape}))).toEqual(uniqueNodes.map(({id,label,shape})=>({id:id.toLowerCase(),label,shape})));
 expect(reviewed.layout).toEqual({kind:'flow',direction:'TB'});
 expect(reviewed.edges?.map(({from,to})=>({from,to}))).toEqual(sourceEdges);
 expect(reviewed.edges).toEqual(visual.edges);
 expect(reviewed.nodes?.map(({id,label,role,detail})=>({id,label,role,detail}))).toEqual(visual.nodes?.map(({id,label,role,detail})=>({id,label,role,detail})));
 const expected=structuredClone(source) as any,expectedVisual=expected.extensions['umf.visual'];
 expected.vocabularies['umf.visual'].version='1.4.0';expectedVisual.layout={kind:'flow',direction:'TB'};
 for(const node of expectedVisual.nodes)node.shape=node.id==='rows'?'cylinder':'rectangle';
 expect(definition).toEqual(expected);
 expect(definition.id).toBe(source.id);expect(definition.umf).toBe(source.umf);
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});expect(inspectVisual(definition)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(source),parsed=readVisualDocument(sourceBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(parsed,'json'))).toEqual(source);
 const yaml=writeVisualDocument(definition,'yaml'),yamlParsed=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlParsed)).toEqual(reviewed);expect(JSON.parse(writeVisualDocument(yamlParsed,'json'))).toEqual(definition);
 const payload=visualPayloadYaml(definition);for(const node of reviewed.nodes??[])expect(payload).toContain(node.label);
 expect(JSON.stringify(source)).toBe(before);expect(sha(readFileSync(sourcePath))).toBe(sourceDigest);expect(sha(readFileSync(definitionPath))).toBe(definitionDigest);expect(sha(readFileSync(examplePath))).toBe(exampleDigest);
});

test('solution-design component review binds the exact fixture and cited historical Markdown',async()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),exampleDigest=sha(exampleBytes);
 const scope="The exact original Visual 1.0.0 fixture remains unchanged and is published byte-for-byte. The separate reviewed Visual 1.4.0 definition preserves all seven node IDs/labels/order, the existing `rows` store role, six edge IDs/endpoints, title/question, and source metadata; it upgrades only the visual vocabulary version and adds source-mapped node shapes plus a root flow direction. Mermaid square-bracket declarations map to rectangles, `Rows[(Source Rows)]` maps to a cylinder, and graph TD maps to flow direction TB. No roles, labels, or edges are inferred or changed. Component responsibilities, technology rationale, and traceability elsewhere in the source file are not merged into this selected interaction graph. The source digest matches HELIX commit ab76e319f7a98d5df8417d6f16bbd5791c356271.";
 expect(review).toMatchObject({id:'tpl-sd-components',title:'Component Interactions',kind:'flow',form:'pipeline',definitionPath,definitionSha256:definitionDigest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact original Visual 1.0.0 fixture supplies seven ordered component identities/labels, six directed interactions, title/question, and the cited solution-design example locator.'},
  {path:examplePath,sha256:exampleDigest,pointer:'Component Interactions Mermaid graph',label:'Cited HELIX solution-design example',originalLocator:'helix:workflows/activities/02-design/artifacts/solution-design/example.md',resolvedSource:'helix/workflows/activities/02-design/artifacts/solution-design/example.md',observedRevision:'ab76e319f7a98d5df8417d6f16bbd5791c356271',description:'Exact Markdown bytes resolved from the fixture locator at the recorded HELIX commit. The selected graph supplies seven node declarations, a top-to-bottom direction, a cylinder-shaped Source Rows node, and six directed component interactions. Adjacent component responsibilities, technology rationale, and traceability material are outside this selected view.'}
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/tpl-sd-components/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:examplePath,sha256:exampleDigest,outputPath:'reviews/tpl-sd-components/solution-design-example.md',mediaType:'text/markdown',description:'Exact historical solution-design example bytes resolved from the fixture locator.'}
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:tpl-sd-components',visualId:'tpl-sd-components',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/tpl-sd-components/authoritative-source.json',scope});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
