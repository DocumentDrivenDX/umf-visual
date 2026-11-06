// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/tpl-arch-context.json';
const definitionPath='fixtures/reviews/definitions/tpl-arch-context.json';
const architecturePath='fixtures/visual/sources/helix/architecture-example.md';
const manifestPath='fixtures/reviews/review-sources.json';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=readFileSync(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,visual=getVisual(source) as Visual;
const definitionBytes=readFileSync(definitionPath),definition=readVisualDocument(definitionBytes.toString('utf8'),'json') as Document,reviewed=getVisual(definition) as Visual;
const architectureBytes=readFileSync(architecturePath),architecture=architectureBytes.toString('utf8');
const section=architecture.match(/^## Level 1: System Context\s*\n([\s\S]*?)(?=^##\s)/mu)?.[1];
if(!section)throw new Error('Cited architecture example has no Level 1 system-context section.');
const rows=section.split(/\r?\n/u).filter(line=>/^\s*\|/u.test(line)&&!/^\s*\|[-|\s]+\|\s*$/u.test(line)).slice(1).map(line=>line.split('|').slice(1,-1).map(cell=>cell.trim().replaceAll('`','')));
const byName=new Map(rows.map(([name,type,purpose,protocol])=>[name!,{type:type!,purpose:purpose!,protocol:protocol!}]));
const diagram=section.match(/```mermaid\s*\n([\s\S]*?)\n```/u)?.[1];
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='tpl-arch-context')!;

test('DepositMatch context view preserves five exact table rows and four directed protocol edges',()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),architectureDigest=sha(architectureBytes);
 expect(sourceDigest).toBe('2c8dbd646b2b3eec38e9f07024967321768713f2083b7aa30d5cd3ab60bffdb0');
 expect(definitionDigest).toBe('94af9370b6e3cb391fc1b56802ba1d346b37eb60919e97d6eb7c000d46316d4a');
 expect(architectureDigest).toBe('4c79ba17f9d9342592c062b9a51cef0232816004b59f110488f696e7a8e191b8');
 expect(rows).toHaveLength(5);
 expect(source).toMatchObject({id:'visual:tpl-arch-context',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'tpl-arch-context',kind:'flow',form:'network',title:'Level 1: System Context',question:'Who and what does DepositMatch talk to?'});
 expect(visual.source).toEqual({path:'helix:workflows/activities/02-design/artifacts/architecture/example.md',view:'Level 1: System Context',digest:`sha256:${architectureDigest}`});
 const sourceName=new Map([['maya','Maya, Reconciliation Lead'],['andre','Andre, Firm Owner'],['dm','DepositMatch'],['bank','Bank portal exports'],['accounting','Accounting exports']]);
 for(const node of visual.nodes??[]){
  const row=byName.get(sourceName.get(node.id)!);expect(row).toBeDefined();expect(node.detail).toBeUndefined();
  expect(reviewed.nodes?.find(candidate=>candidate.id===node.id)?.detail).toBe(`Type: ${row!.type}\n\nPurpose: ${row!.purpose}\n\nProtocol: ${row!.protocol}`);
 }
 expect(reviewed.nodes?.map(({id,label,role})=>({id,label,role}))).toEqual(visual.nodes?.map(({id,label,role})=>({id,label,role})));
 expect(reviewed.edges).toEqual(visual.edges);
 expect(diagram).toContain('Maya[Maya - Reconciliation Lead] -->|HTTPS| DM[DepositMatch]');
 expect(diagram).toContain('Andre[Andre - Firm Owner] -->|HTTPS| DM');
 expect(diagram).toContain('Bank[Bank portal exports] -->|CSV upload| DM');
 expect(diagram).toContain('Accounting[Accounting exports] -->|CSV upload| DM');
 expect(byName.get('Maya, Reconciliation Lead')?.protocol).toBe('HTTPS browser');
 expect(reviewed.edges?.map(edge=>edge.label)).toEqual(['HTTPS','HTTPS','CSV upload','CSV upload']);
 const expected=structuredClone(source) as any;
 for(const node of expected.extensions['umf.visual'].nodes){const row=byName.get(sourceName.get(node.id)!)!;node.detail=`Type: ${row.type}\n\nPurpose: ${row.purpose}\n\nProtocol: ${row.protocol}`;}
 expect(definition).toEqual(expected);
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});expect(inspectVisual(definition)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(source),sourceRoundtrip=readVisualDocument(sourceBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(sourceRoundtrip,'json'))).toEqual(source);
 const yaml=writeVisualDocument(definition,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(reviewed);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(definition);
 const payload=visualPayloadYaml(definition);for(const node of reviewed.nodes??[])expect(payload).toContain(node.label);
 expect(JSON.stringify(source)).toBe(before);expect(sha(readFileSync(sourcePath))).toBe(sourceDigest);expect(sha(readFileSync(definitionPath))).toBe(definitionDigest);expect(sha(readFileSync(architecturePath))).toBe(architectureDigest);
});

test('context review binds the exact UMF fixture and historical HELIX Markdown source',async()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),architectureDigest=sha(architectureBytes);
 const scope="The exact original Visual 1.0.0 fixture remains unchanged and is published byte-for-byte. The separate reviewed Visual 1.0.0 definition preserves all original node IDs/labels, four edge IDs/endpoints/protocol labels, title/question and source metadata, then adds the exact Type, Purpose, and Protocol cells from each corresponding Level 1 system-context table row to node detail. It does not infer or rewrite Visual roles; source types remain literal in the added detail. Existing graph edges preserve the source Mermaid protocol labels, while node details retain the table's more specific Protocol cells (for example, HTTPS browser versus HTTPS). The cited Markdown digest matches the fixture in HELIX commit 19065f860a9e26b0cb52831de59b524ed6a55de6. The file is a DepositMatch architecture example/template and does not establish a deployed system or current operational state.";
 expect(review).toMatchObject({id:'tpl-arch-context',title:'Level 1: System Context',kind:'flow',form:'network',definitionPath,definitionSha256:definitionDigest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies five system-context labels, four directed protocol edges, title/question, and cited architecture-example locator.'},
  {path:architecturePath,sha256:architectureDigest,pointer:'Level 1: System Context table and Mermaid graph',label:'Cited HELIX architecture example',originalLocator:'helix:workflows/activities/02-design/artifacts/architecture/example.md',resolvedSource:'helix/workflows/activities/02-design/artifacts/architecture/example.md',observedRevision:'19065f860a9e26b0cb52831de59b524ed6a55de6',description:"Exact Markdown bytes resolved from the fixture locator at the recorded HELIX commit. The Level 1 table supplies each element's Type, Purpose, and Protocol; its Mermaid graph supplies the four directed connections and their protocol labels. The file is an architecture example for DepositMatch, not a claim about a deployed product."}
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/tpl-arch-context/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:architecturePath,sha256:architectureDigest,outputPath:'reviews/tpl-arch-context/architecture-example.md',mediaType:'text/markdown',description:'Exact historical architecture-example Markdown bytes resolved from the original HELIX locator.'}
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:tpl-arch-context',visualId:'tpl-arch-context',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/tpl-arch-context/authoritative-source.json',scope});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
