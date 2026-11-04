// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/tpl-arch-components.json';
const definitionPath='fixtures/reviews/definitions/tpl-arch-components.json';
const architecturePath='fixtures/visual/sources/helix/architecture-example.md';
const manifestPath='fixtures/reviews/review-sources.json';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=readFileSync(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,visual=getVisual(source) as Visual;
const definitionBytes=readFileSync(definitionPath),definition=readVisualDocument(definitionBytes.toString('utf8'),'json') as Document,reviewed=getVisual(definition) as Visual;
const architectureBytes=readFileSync(architecturePath),architecture=architectureBytes.toString('utf8');
const section=architecture.match(/^## Level 3: Component Diagram\s*\n([\s\S]*?)(?=^##\s)/mu)?.[1];
if(!section)throw new Error('Cited architecture example has no Level 3 component section.');
const lead=section.split(/\r?\n\s*\r?\n/u,1)[0]!.split(/\s+/u).join(' ').trim();
const rows=section.split(/\r?\n/u).filter(line=>/^\s*\|/u.test(line)&&!/^\s*\|[-|\s]+\|\s*$/u.test(line)).slice(1).map(line=>line.split('|').slice(1,-1).map(cell=>cell.trim().replaceAll('`','')));
const byName=new Map(rows.map(([name,container,purpose,notes])=>[name!,{container:container!,purpose:purpose!,notes:notes!}]));
const diagram=section.match(/```mermaid\s*\n([\s\S]*?)\n```/u)?.[1];
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='tpl-arch-components')!;

test('DepositMatch component example preserves exact source purposes, notes, container membership and topology',()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),architectureDigest=sha(architectureBytes);
 expect(sourceDigest).toBe('e6fad659ece00591cb3481052dcb819ad212a0a6abde38a0df7e537f4bd7770d');
 expect(definitionDigest).toBe('1716aa182027bac5676e3aa630a61041bcea142df35d05f4743b8044e400fbec');
 expect(architectureDigest).toBe('4c79ba17f9d9342592c062b9a51cef0232816004b59f110488f696e7a8e191b8');
 expect(source).toMatchObject({id:'visual:tpl-arch-components',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'tpl-arch-components',kind:'flow',form:'network',title:'Level 3: Component Diagram',question:"How is the API Service's import path built?"});
 expect(visual.source).toEqual({path:'helix:workflows/activities/02-design/artifacts/architecture/example.md',view:'Level 3: Component Diagram',digest:`sha256:${architectureDigest}`});
 expect(lead).toBe('The API Service needs component detail because CSV import, traceability, and matching are coupled at the boundary.');
 expect(rows).toHaveLength(5);expect([...byName.keys()]).toEqual(['Upload Controller','Mapping Service','CSV Validation Service','Import Commit Service','Evidence Service']);
 const nodeId=new Map([['Upload Controller','upload'],['Mapping Service','mapping'],['CSV Validation Service','validate'],['Import Commit Service','commit'],['Evidence Service','evidence']]);
 for(const[name,id]of nodeId){const row=byName.get(name)!;expect(row.container).toBe('API Service');const original=visual.nodes?.find(node=>node.id===id)!;expect(original.label).toBe(name);expect(original.detail).toBeUndefined();const enriched=reviewed.nodes?.find(node=>node.id===id)!;expect(enriched.detail).toBe(`Purpose: ${row.purpose}\n\nNotes: ${row.notes}`);expect(enriched.group).toBe('api-service');}
 expect(reviewed.takeaway).toBe(lead);expect(visual.takeaway).toBeUndefined();
 expect(reviewed.groups).toEqual([{id:'api-service',label:'API Service',role:'boundary'}]);
 expect(reviewed.nodes?.filter(node=>node.group==='api-service').map(node=>node.id)).toEqual(['upload','mapping','validate','commit','evidence']);
 expect(reviewed.nodes?.find(node=>node.id==='db')).toMatchObject({label:'PostgreSQL',role:'store'});expect(reviewed.nodes?.find(node=>node.id==='db')?.group).toBeUndefined();
 expect(diagram).toContain('Upload[Upload Controller] --> Mapping[Mapping Service]');
 expect(diagram).toContain('Mapping --> Validate[CSV Validation Service]');
 expect(diagram).toContain('Validate --> Commit[Import Commit Service]');
 expect(diagram).toContain('Commit --> Evidence[Evidence Service]');
 expect(diagram).toContain('Commit --> DB[(PostgreSQL)]');
 expect(diagram).toContain('Evidence --> DB');
 expect(reviewed.edges).toEqual(visual.edges);expect(reviewed.nodes?.map(({id,label,role,layer,group})=>({id,label,role,layer,group}))).toEqual(visual.nodes?.map(({id,label,role,layer,group})=>({id,label,role,layer,group}))?.map((node,index)=>({ ...node,group:index<5?'api-service':undefined })));
 expect(reviewed.id).toBe(visual.id);expect(definition.id).toBe(source.id);expect(definition.umf).toBe(source.umf);expect(definition.vocabularies).toEqual(source.vocabularies);
 const expectedDefinition=structuredClone(source) as any,expectedVisual=expectedDefinition.extensions['umf.visual'];
 expectedVisual.takeaway=lead;expectedVisual.groups=[{id:'api-service',label:'API Service',role:'boundary'}];
 for(const node of expectedVisual.nodes){const name=node.label,row=byName.get(name);if(row){node.detail=`Purpose: ${row.purpose}\n\nNotes: ${row.notes}`;node.group='api-service';}}
 expect(definition).toEqual(expectedDefinition);
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});expect(inspectVisual(definition)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(source),sourceRoundtrip=readVisualDocument(sourceBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(sourceRoundtrip,'json'))).toEqual(source);
 const yaml=writeVisualDocument(definition,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(reviewed);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(definition);
 const payload=visualPayloadYaml(definition);expect(payload).toContain(lead);for(const node of reviewed.nodes??[])if(node.detail)expect(payload).toContain(node.detail.split('\n')[0]!);
 expect(JSON.stringify(source)).toBe(before);expect(sha(readFileSync(sourcePath))).toBe(sourceDigest);expect(sha(readFileSync(definitionPath))).toBe(definitionDigest);expect(sha(readFileSync(architecturePath))).toBe(architectureDigest);
});

test('component-example review binds the exact UMF fixture and historical HELIX Markdown blob',async()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),architectureDigest=sha(architectureBytes);
 const scope="The exact original Visual 1.0.0 fixture remains unchanged and is published byte-for-byte. The separate reviewed Visual 1.0.0 definition preserves all original IDs, labels, question, source metadata, and six graph connections. It adds the exact Level 3 section rationale as takeaway, adds exact Purpose and Notes text from each of the five component rows to that node's detail, and maps the table's `Container: API Service` membership to a Visual `boundary` group for exactly those five components. PostgreSQL remains outside that group; no API Service membership or deployment fact is inferred for it. Existing edge topology is preserved from the Level 3 graph; no labels or extra edges are added. The source digest matches the fixture in HELIX commit 19065f860a9e26b0cb52831de59b524ed6a55de6. Source title/question, group ID, and boundary role are Visual projections. The cited file is a DepositMatch architecture example/template, not evidence of a deployed system or current operational behavior.";
 expect(review).toMatchObject({id:'tpl-arch-components',title:'Level 3: Component Diagram',kind:'flow',form:'network',definitionPath,definitionSha256:definitionDigest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies six component labels, six directed connections, source title/question, and cited architecture-example locator.'},
  {path:architecturePath,sha256:architectureDigest,pointer:'Level 3: Component Diagram introduction, component table and Mermaid graph',label:'Cited HELIX architecture example',originalLocator:'helix:workflows/activities/02-design/artifacts/architecture/example.md',resolvedSource:'helix/workflows/activities/02-design/artifacts/architecture/example.md',observedRevision:'19065f860a9e26b0cb52831de59b524ed6a55de6',description:'Exact Markdown bytes resolved from the fixture locator at the recorded HELIX commit. The Level 3 table supplies five API Service components with exact Purpose and Notes; its Container column grounds their shared membership. The Level 3 Mermaid graph supplies the six directed connections, including PostgreSQL. The file is an architecture example for DepositMatch, not a claim about a deployed product.'}
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/tpl-arch-components/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:architecturePath,sha256:architectureDigest,outputPath:'reviews/tpl-arch-components/architecture-example.md',mediaType:'text/markdown',description:'Exact historical architecture-example Markdown bytes resolved from the original HELIX locator.'}
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:tpl-arch-components',visualId:'tpl-arch-components',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/tpl-arch-components/authoritative-source.json',scope});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
