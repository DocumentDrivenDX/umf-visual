// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/helix-parts.json';
const definitionPath='fixtures/reviews/definitions/helix-parts.json';
const guidePath='fixtures/visual/sources/helix/developer-index.md';
const manifestPath='fixtures/reviews/review-sources.json';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=readFileSync(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,visual=getVisual(source) as Visual;
const definitionBytes=readFileSync(definitionPath),definition=readVisualDocument(definitionBytes.toString('utf8'),'json') as Document,reviewed=getVisual(definition) as Visual;
const guideBytes=readFileSync(guidePath),guide=guideBytes.toString('utf8');
const section=guide.match(/^## The parts\s*\n([\s\S]*?)(?=^##\s)/mu)?.[1];
if(!section)throw new Error('Cited developer guide has no The parts section.');
const rows=section.split(/\r?\n/u).filter(line=>/^\s*\|/u.test(line)&&!/^\s*\|[-|\s]+\|\s*$/u.test(line)).slice(1).map(line=>line.split('|').slice(1,-1).map(cell=>cell.trim().replaceAll('`','')));
const table=new Map(rows.map(([label,paths,change])=>[label!,{paths:paths!,change:change!}]));
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='helix-parts')!;

test('HELIX parts source table exactly grounds every stack member and change-selection detail',()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),guideDigest=sha(guideBytes);
 expect(sourceDigest).toBe('5d47d470fd3b934f8d548a03c51559d4f5c7bedd7996ff7a71ce7953bc2556f5');
 expect(definitionDigest).toBe('654d8ce7cb7715f42cb38990c3f7b5370575c19fc605e0e04d0b94c37f21966b');
 expect(guideDigest).toBe('ebe885e3093fa1e0ab8319320d67586ec8d51b3420df36c4d5beecc6b36b9bc3');
 expect(rows).toHaveLength(9);expect(table.size).toBe(9);
 expect(source).toMatchObject({id:'visual:helix-parts',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'helix-parts',kind:'structure',form:'stack',title:'The parts',question:'Which part does a change belong in?',audience:'developer'});
 expect(visual.source).toEqual({path:'helix:docs/guide/developer/index.md',view:'The parts',digest:`sha256:${guideDigest}`});
 expect(visual.nodes).toHaveLength(9);expect(visual.nodes?.map(node=>node.label)).toEqual(rows.map(([label])=>label));
 const portable=visual.nodes!.slice(0,5),support=visual.nodes!.slice(5);
 expect(portable.map(node=>node.layer)).toEqual(Array(5).fill('portable'));expect(support.map(node=>node.layer)).toEqual(Array(4).fill('support'));
 expect(guide).toContain('The first five are the portable content that every runtime receives. The other four support, package, or publish that content.');
 expect(visual.structure?.layers).toEqual([
  {id:'portable',label:'Portable content every runtime receives'},
  {id:'support',label:'Support, packaging and publishing'}
 ]);
 for(const[index,node]of visual.nodes!.entries()){
  const row=table.get(node.label)!;
  expect(row.paths.startsWith(node.detail!)).toBe(true);
  expect(reviewed.nodes?.[index]?.id).toBe(node.id);
  expect(reviewed.nodes?.[index]?.label).toBe(node.label);
  expect(reviewed.nodes?.[index]?.layer).toBe(node.layer);
  expect(reviewed.nodes?.[index]?.detail).toBe(`${row.paths}\n\nChange it when: ${row.change}`);
 }
 expect(table.get('Methodology spec')?.paths).toBe('workflows/ (non-activity files)');
 expect(table.get('Per-runtime packaging')?.paths).toBe('docs/install/, scripts/');
 expect(table.get('Microsite')?.paths).toBe('docs/website/content/, website/');
 expect(visual.nodes?.[7]?.detail).toBe('docs/install/');expect(reviewed.nodes?.[7]?.detail).toContain(', scripts/');
 expect(visual.nodes?.[8]?.detail).toBe('docs/website/content/');expect(reviewed.nodes?.[8]?.detail).toContain(', website/');
 expect(reviewed.nodes?.[4]?.detail).toContain('workflows/ (non-activity files)');
 const expectedDefinition=structuredClone(source) as any;
 for(const node of expectedDefinition.extensions['umf.visual'].nodes){const row=table.get(node.label)!;node.detail=`${row.paths}\n\nChange it when: ${row.change}`;}
 expect(definition).toEqual(expectedDefinition);
 expect(reviewed.edges).toBeUndefined();expect(reviewed.structure).toEqual(visual.structure);expect(reviewed.groups).toEqual(visual.groups);
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});expect(inspectVisual(definition)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(source),sourceRoundtrip=readVisualDocument(sourceBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(sourceRoundtrip,'json'))).toEqual(source);
 const yaml=writeVisualDocument(definition,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(reviewed);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(definition);
 const payload=visualPayloadYaml(definition);
 for(const node of reviewed.nodes??[]){const row=table.get(node.label)!;expect(payload).toContain(row.paths);expect(payload).toContain(`Change it when: ${row.change}`);}
 expect(JSON.stringify(source)).toBe(before);expect(sha(readFileSync(sourcePath))).toBe(sourceDigest);expect(sha(readFileSync(definitionPath))).toBe(definitionDigest);expect(sha(readFileSync(guidePath))).toBe(guideDigest);
});

test('HELIX parts review binds the original Visual fixture and exact developer-guide Markdown',async()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),guideDigest=sha(guideBytes);
 const scope='The original Visual 1.0.0 fixture remains unchanged and is published byte-for-byte. The separate reviewed Visual 1.0.0 definition preserves its nine node IDs/labels and order, two stack layers and memberships, original title/question/source metadata, then enriches each existing detail from the exact `The parts` table: complete path cell followed by the exact `Change it when` criterion. Existing detail text remains the prefix; this restores the omitted `scripts/`, `website/`, and `(non-activity files)` qualifiers. The source states that the first five parts are portable content every runtime receives and the other four support/package/publish it; the existing layers represent that split. This review selects only the parts table, not the separate Level 2 deployment-container view or the guide\'s request journey. The title/form/layer IDs are Visual projections. The source describes intended change-placement guidance, not current deployment/runtime behavior.';
 expect(review).toMatchObject({id:'helix-parts',title:'The parts',kind:'structure',form:'stack',definitionPath,definitionSha256:definitionDigest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies the nine ordered part identities/labels, existing path details, five-versus-four layer membership, stack labels, title, question, and cited developer-guide locator.'},
  {path:guidePath,sha256:guideDigest,pointer:'The parts table and its adjacent 5/4 grouping statement',label:'Cited HELIX developer guide',originalLocator:'helix:docs/guide/developer/index.md',resolvedSource:'helix/docs/guide/developer/index.md',description:'Exact Markdown bytes resolved from the fixture locator. The parts table supplies each part\'s path(s) and the change-it-when selection criterion; surrounding text states the five portable/four support split.'}
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/helix-parts/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:guidePath,sha256:guideDigest,outputPath:'reviews/helix-parts/developer-index.md',mediaType:'text/markdown',description:'Exact cited HELIX developer-guide Markdown bytes published without transformation.'}
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:helix-parts',visualId:'helix-parts',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/helix-parts/authoritative-source.json',scope});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
