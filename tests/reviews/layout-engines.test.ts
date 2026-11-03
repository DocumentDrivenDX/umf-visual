// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import type {Document} from '@umf/core';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/forms/layout-engines.json';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;

test('layout engines is an exact Visual 1.0.0 comparison with authored ratings and choice',()=>{
 const raw=readFileSync(sourcePath),digest=hash(raw),source=JSON.parse(raw.toString('utf8')) as Document,reviewed=read<Document>(sourcePath),visual=getVisual(reviewed) as Visual;
 expect(digest).toBe('534e2ee82b0ca6afa66403d15073bb33c2528f87b57ffb5ff0495766ed6af862');
 expect(reviewed).toEqual(source);
 expect(reviewed.id).toBe('visual:layout-engines');expect(reviewed.umf).toBe('0.10.0');expect(reviewed.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(visual.id).toBe('layout-engines');expect(visual.kind).toBe('comparison');expect(visual.form).toBe('quadrant');
 expect(visual.title).toBe('Graph layout engines');expect(visual.question).toBe('Which graph layout engine gives control without a browser?');
 expect(visual.source).toEqual({path:'visuals:PRD.md',view:'§6.2',digest:'sha256:f944df076446c39a75b7f58323869af5337751e892b75d24cc749e8b9ff27aa5'});
 expect(visual.omissions).toEqual(['Ratings are this example\'s reading of the reasons PRD §6.2 gives, not measurements.']);
 const comparison=visual.comparison!;
 expect(comparison.items).toEqual([
  {id:'elkjs',label:'elkjs'},{id:'dagre',label:'dagre'},{id:'graphviz',label:'Graphviz WASM'},{id:'d2',label:'D2'},{id:'mermaid',label:'Mermaid'},
 ]);
 expect(comparison.criteria).toEqual([
  {id:'control',label:'Layout control',measure:'rating',max:3,low:'Not controllable',high:'Compound nodes, ports, layer constraints'},
  {id:'runtime',label:'Runtime fit',measure:'rating',max:3,low:'Needs a browser or a binary',high:'Runs in Node with no DOM'},
 ]);
 expect(comparison.values).toEqual([
  {item:'elkjs',criterion:'control',rating:3},{item:'elkjs',criterion:'runtime',rating:3},
  {item:'dagre',criterion:'control',rating:1},{item:'dagre',criterion:'runtime',rating:3},
  {item:'graphviz',criterion:'control',rating:1},{item:'graphviz',criterion:'runtime',rating:2},
  {item:'d2',criterion:'control',rating:2},{item:'d2',criterion:'runtime',rating:0},
  {item:'mermaid',criterion:'control',rating:0},{item:'mermaid',criterion:'runtime',rating:1},
 ]);
 expect(comparison.axes).toEqual({x:'runtime',y:'control'});
 expect(comparison.chosen).toEqual({item:'elkjs',reason:'The only JS engine with compound nodes, layer and port constraints, and orthogonal routing.'});
 expect(inspectVisual(reviewed)).toMatchObject({valid:true,complete:true});
 const jsonRead=readVisualDocument(raw.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(jsonRead,'json'))).toEqual(source);
 const yaml=writeVisualDocument(jsonRead,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(visual);
 expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
});

test('layout engines review binds exact source bytes without current-PRD or recommendation claims',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(item=>item.id==='layout-engines')!,bytes=readFileSync(sourcePath),digest=hash(bytes);
 expect(row.title).toBe('Graph layout engines');expect(row.definitionPath).toBe(sourcePath);expect(row.definitionSha256).toBe(digest);
 expect(row.sources).toEqual([{path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The checked-in Visual 1.0.0 fixture JSON is the complete definition and is used byte-for-byte as the review definition.'}]);
 expect(row.publishedAssets).toEqual([{path:sourcePath,sha256:digest,outputPath:'reviews/layout-engines/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'}]);
 expect(row.originalEvidence).toEqual({
  kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,documentId:'visual:layout-engines',visualId:'layout-engines',envelopeVersion:'0.10.0',modelVersion:'1.0.0',
  sourceDownloadPath:'reviews/layout-engines/authoritative-source.json',
  scope:'This exact UMF fixture JSON is the review definition. Item and criterion IDs, labels, rating anchors and values, axes, chosen item, reason, and source-authored omissions are preserved. The source path and digest are locator metadata; this review does not validate current PRD bytes or present the ratings as measurements or a current recommendation.'
 });
 expect(row.originalEvidence.scope).not.toContain('current recommendation is elkjs');
 await verifyReviewSourceEvidence();
});
