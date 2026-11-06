// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/tpl-arch-containers.json';
const definitionPath='fixtures/reviews/definitions/tpl-arch-containers.json';
const architecturePath='fixtures/visual/sources/helix/architecture-example.md';
const manifestPath='fixtures/reviews/review-sources.json';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=readFileSync(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,visual=getVisual(source) as Visual;
const definitionBytes=readFileSync(definitionPath),definition=readVisualDocument(definitionBytes.toString('utf8'),'json') as Document,reviewed=getVisual(definition) as Visual;
const architectureBytes=readFileSync(architecturePath),architecture=architectureBytes.toString('utf8');
const section=architecture.match(/^## Level 2: Container Diagram\s*\n([\s\S]*?)(?=^##\s)/mu)?.[1];
if(!section)throw new Error('Cited architecture example has no Level 2 container section.');
const rows=section.split(/\r?\n/u).filter(line=>/^\s*\|/u.test(line)&&!/^\s*\|[-|\s]+\|\s*$/u.test(line)).slice(1).map(line=>line.split('|').slice(1,-1).map(cell=>cell.trim().replaceAll('`','')));
const byName=new Map(rows.map(([name,technology,responsibilities,communication])=>[name!,{technology:technology!,responsibilities:responsibilities!,communication:communication!}]));
const diagram=section.match(/```mermaid\s*\n([\s\S]*?)\n```/u)?.[1];
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='tpl-arch-containers')!;

test('DepositMatch container fixture preserves six exact table rows and seven distinct graph edges',()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),architectureDigest=sha(architectureBytes);
 expect(sourceDigest).toBe('b4b476051ca9e53ec959411a0d4929abbacecbeca935939f82fb65630a9f1969');
 expect(definitionDigest).toBe('a90a9603d0c4897c206126bbba8cbbdf80250daafe93525be0a38c06afb83d8b');
 expect(architectureDigest).toBe('4c79ba17f9d9342592c062b9a51cef0232816004b59f110488f696e7a8e191b8');
 expect(rows).toHaveLength(6);expect(byName.size).toBe(6);
 expect(source).toMatchObject({id:'visual:tpl-arch-containers',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'tpl-arch-containers',kind:'flow',form:'network',title:'Level 2: Container Diagram',question:'What runs inside DepositMatch?'});
 expect(visual.source).toEqual({path:'helix:workflows/activities/02-design/artifacts/architecture/example.md',view:'Level 2: Container Diagram',digest:`sha256:${architectureDigest}`});
 const rowsById=new Map([['web','Web App'],['api','API Service'],['worker','Matching Worker'],['db','Database'],['s3','Source File Store'],['cw','Observability']]);
 for(const node of visual.nodes??[]){const row=byName.get(rowsById.get(node.id)!);expect(row).toBeDefined();expect(node.detail).toBeUndefined();expect(reviewed.nodes?.find(candidate=>candidate.id===node.id)?.detail).toBe(`Technology: ${row!.technology}\n\nResponsibilities: ${row!.responsibilities}\n\nCommunication: ${row!.communication}`);}
 expect(reviewed.nodes?.map(({id,label,role})=>({id,label,role}))).toEqual(visual.nodes?.map(({id,label,role})=>({id,label,role})));
 expect(reviewed.edges).toEqual(visual.edges);expect(reviewed.groups).toBeUndefined();
 expect(diagram).toContain('Web[React Web App] -->|HTTPS JSON| API[Fastify API Service]');
 expect(diagram).toContain('API -->|TLS SQL| DB[(PostgreSQL 16)]');
 expect(diagram).toContain('API -->|S3 SDK| S3[(S3 Source File Store)]');
 expect(diagram).toContain('Worker[Matching Worker] -->|TLS SQL| DB');
 expect(diagram).toContain('API -->|job rows| DB');
 expect(diagram).toContain('API -->|logs/metrics| CW[CloudWatch]');
 expect(diagram).toContain('Worker -->|logs/metrics| CW');
 expect(reviewed.edges?.filter(edge=>edge.id.startsWith('api--db'))).toEqual([
  {id:'api--db',from:'api',to:'db',label:'TLS SQL'},
  {id:'api--db-2',from:'api',to:'db',label:'job rows'}
 ]);
 const expected=structuredClone(source) as any;
 for(const node of expected.extensions['umf.visual'].nodes){const row=byName.get(rowsById.get(node.id)!)!;node.detail=`Technology: ${row.technology}\n\nResponsibilities: ${row.responsibilities}\n\nCommunication: ${row.communication}`;}
 expect(definition).toEqual(expected);
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});expect(inspectVisual(definition)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(source),sourceRoundtrip=readVisualDocument(sourceBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(sourceRoundtrip,'json'))).toEqual(source);
 const yaml=writeVisualDocument(definition,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(reviewed);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(definition);
 const payload=visualPayloadYaml(definition);for(const node of reviewed.nodes??[])expect(payload).toContain(node.label);
 expect(JSON.stringify(source)).toBe(before);expect(sha(readFileSync(sourcePath))).toBe(sourceDigest);expect(sha(readFileSync(definitionPath))).toBe(definitionDigest);expect(sha(readFileSync(architecturePath))).toBe(architectureDigest);
});

test('container-example review binds the exact UMF fixture and historical HELIX Markdown blob',async()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),architectureDigest=sha(architectureBytes);
 const scope='The exact original Visual 1.0.0 fixture remains unchanged and is published byte-for-byte. The separate reviewed Visual 1.0.0 definition preserves all original node IDs/labels/store roles, seven edge IDs/endpoints/labels, title/question and source metadata, then adds the exact Technology, Responsibilities, and Communication cells from each corresponding Level 2 container row to node detail. No nodes, edges, roles, or communications are inferred or changed; the two API-to-PostgreSQL connections remain separate (TLS SQL and job rows). The cited Markdown digest matches the fixture in HELIX commit 19065f860a9e26b0cb52831de59b524ed6a55de6. The file is a DepositMatch architecture example/template and does not establish current technology deployment or operational state.';
 expect(review).toMatchObject({id:'tpl-arch-containers',title:'Level 2: Container Diagram',kind:'flow',form:'network',definitionPath,definitionSha256:definitionDigest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies six container labels, seven directed communication edges, PostgreSQL/S3 store roles, title/question, and cited architecture-example locator.'},
  {path:architecturePath,sha256:architectureDigest,pointer:'Level 2: Container Diagram table and Mermaid graph',label:'Cited HELIX architecture example',originalLocator:'helix:workflows/activities/02-design/artifacts/architecture/example.md',resolvedSource:'helix/workflows/activities/02-design/artifacts/architecture/example.md',observedRevision:'19065f860a9e26b0cb52831de59b524ed6a55de6',description:'Exact Markdown bytes resolved from the fixture locator at the recorded HELIX commit. The Level 2 table supplies the six containers\' Technology, Responsibilities, and Communication fields; its Mermaid graph supplies the seven directed connections. The file is an architecture example for DepositMatch, not a claim about a deployed product.'}
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/tpl-arch-containers/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:architecturePath,sha256:architectureDigest,outputPath:'reviews/tpl-arch-containers/architecture-example.md',mediaType:'text/markdown',description:'Exact historical architecture-example Markdown bytes resolved from the original HELIX locator.'}
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:tpl-arch-containers',visualId:'tpl-arch-containers',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/tpl-arch-containers/authoritative-source.json',scope});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
