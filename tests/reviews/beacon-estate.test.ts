// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {readVisualDocument,getVisual,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';

const sourcePath='fixtures/visual/inventory/beacon-estate.json';
const mermaidPath='fixtures/visual/sources/estate/estate.mmd';
const read=(path:string)=>readFileSync(path);
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=read(sourcePath),mermaidBytes=read(mermaidPath);
const document=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document;
const visual=getVisual(document) as Visual;
const review=(JSON.parse(read('fixtures/reviews/review-sources.json').toString('utf8')) as any).examples.find((item:any)=>item.id==='beacon-estate');

test('Beacon estate is an exact original-fixture alias bound to its cited Mermaid source',()=>{
 expect(sha(sourceBytes)).toBe('e0ff673ac336f1a031d8d40c16078f9f63d12ffc6c489d1b133f7ab07a8c5eef');
 expect(sha(mermaidBytes)).toBe('67e0ca2948db794b31a2c1b0d8de8f876912098dc4d0705813879b286cdb6ceb');
 expect(document).toMatchObject({id:'visual:beacon-estate',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(review.definitionPath).toBe(sourcePath);
 expect(review.definitionSha256).toBe(sha(sourceBytes));
 expect(review.sources).toEqual(expect.arrayContaining([
  expect.objectContaining({path:sourcePath,sha256:sha(sourceBytes),pointer:'/extensions/umf.visual'}),
  expect.objectContaining({path:mermaidPath,sha256:sha(mermaidBytes),pointer:'/'})
 ]));
 expect(review.publishedAssets).toEqual(expect.arrayContaining([
  expect.objectContaining({path:sourcePath,sha256:sha(sourceBytes),outputPath:'reviews/beacon-estate/authoritative-source.json',mediaType:'application/json'}),
  expect.objectContaining({path:mermaidPath,sha256:sha(mermaidBytes),outputPath:'reviews/beacon-estate/estate.mmd',mediaType:'text/vnd.mermaid'})
 ]));
 expect(review.originalEvidence).toMatchObject({kind:'authoritative-umf-source',sourcePath,sourceSha256:sha(sourceBytes),documentId:'visual:beacon-estate',visualId:'beacon-estate',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/beacon-estate/authoritative-source.json'});
 expect(review.originalEvidence.scope).toContain('is the review definition');
 expect(review.originalEvidence.scope).toContain('neither source establishes ownership, concurrency, current state, or deployment');
 expect(visual.source).toEqual({path:'umf:fixtures/visual/sources/estate/estate.mmd',digest:`sha256:${sha(mermaidBytes)}`});
});

test('fixture labels, details, direction, and control kind match the exact Mermaid declarations',()=>{
 expect(visual.nodes).toEqual([
  {id:'beacon',label:'Beacon',detail:'drafts support replies',role:'own'},
  {id:'ledger',label:'Ledger',detail:'billing and invoices',role:'own'},
  {id:'portal',label:'Customer portal',detail:'self-service help',role:'own'},
  {id:'insight',label:'Insight',detail:'support analytics',role:'own'}
 ]);
 expect(visual.edges).toEqual([
  {id:'portal--beacon',from:'portal',to:'beacon',label:'hands unsolved questions to'},
  {id:'beacon--ledger',from:'beacon',to:'ledger',label:"looks up a customer's plan in"},
  {id:'portal--ledger',from:'portal',to:'ledger',label:'shows invoices from'},
  {id:'beacon--insight',from:'beacon',to:'insight',label:'sends ticket events to'},
  {id:'ledger--insight',from:'ledger',to:'insight',label:'sends usage to',kind:'control'}
 ]);
 const source=mermaidBytes.toString('utf8');
 for(const declaration of [
  'beacon["Beacon<br>drafts support replies"]','ledger["Ledger<br>billing and invoices"]',
  'portal["Customer portal<br>self-service help"]','insight["Insight<br>support analytics"]',
  'portal -->|"hands unsolved questions to"| beacon',
  'beacon -->|"looks up a customer\'s plan in"| ledger',
  'portal -->|"shows invoices from"| ledger','beacon -->|"sends ticket events to"| insight',
  'ledger -.->|"sends usage to"| insight'
 ])expect(source).toContain(declaration);
 expect(visual.edges?.filter(edge=>edge.kind==='control').map(edge=>[edge.from,edge.to])).toEqual([['ledger','insight']]);
});

test('published YAML payload and public native maps preserve only the four nodes and five authored relations',()=>{
 const yaml=visualPayloadYaml(document);
 for(const value of ['drafts support replies','billing and invoices','self-service help','support analytics','hands unsolved questions to',"looks up a customer's plan in",'shows invoices from','sends ticket events to','sends usage to'])expect(yaml).toContain(value);
 for(const backend of ['graphviz','mermaid','lini'] as const){
  const plan=compilePresentation(document,{backend});expect(plan.ok,`${backend} compiles the exact source model`).toBe(true);if(!plan.ok)continue;
  const nodeMap=plan.elementMap.filter(item=>item.kind==='node'),edgeMap=plan.elementMap.filter(item=>item.kind==='edge');
  expect(nodeMap).toHaveLength(4);expect(edgeMap).toHaveLength(5);
  for(const[index,node]of visual.nodes!.entries()){const mapped=nodeMap.filter(item=>item.logicalId===node.id);expect(mapped).toHaveLength(1);expect(mapped[0]).toMatchObject({nativeId:`n${index+1}`,kind:'node'});expect(mapped[0]!.sourcePath).toStartWith(`/extensions/umf.visual/nodes/${index}`);}
  for(const[index,edge]of visual.edges!.entries()){const mapped=edgeMap.filter(item=>item.logicalId===edge.id);expect(mapped).toHaveLength(1);expect(mapped[0]).toMatchObject({nativeId:`e${index+1}`,kind:'edge'});expect(mapped[0]!.sourcePath).toStartWith(`/extensions/umf.visual/edges/${index}`);}
  expect(plan.elementMap.filter(item=>item.kind==='group')).toHaveLength(0);
 }
 expect(read(sourcePath)).toEqual(sourceBytes);
 expect(read(mermaidPath)).toEqual(mermaidBytes);
});
