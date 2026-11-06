// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/tpl-arch-deployment.json';
const definitionPath='fixtures/reviews/definitions/tpl-arch-deployment.json';
const architecturePath='fixtures/visual/sources/helix/architecture-example.md';
const manifestPath='fixtures/reviews/review-sources.json';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=readFileSync(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,visual=getVisual(source) as Visual;
const definitionBytes=readFileSync(definitionPath),definition=readVisualDocument(definitionBytes.toString('utf8'),'json') as Document,reviewed=getVisual(definition) as Visual;
const architectureBytes=readFileSync(architecturePath),architecture=architectureBytes.toString('utf8');
const section=architecture.match(/^## Deployment\s*\n([\s\S]*?)(?=^##\s)/mu)?.[1];
if(!section)throw new Error('Cited architecture example has no Deployment section.');
const rows=section.split(/\r?\n/u).filter(line=>/^\s*\|/u.test(line)&&!/^\s*\|[-|\s]+\|\s*$/u.test(line)).slice(1).map(line=>line.split('|').slice(1,-1).map(cell=>cell.trim().replaceAll('`','')));
const byComponent=new Map(rows.map(([component,infrastructure,instances,scaling,backup])=>[component!,{infrastructure:infrastructure!,instances:instances!,scaling:scaling!,backup:backup!}]));
const diagram=section.match(/```mermaid\s*\n([\s\S]*?)\n```/u)?.[1];
if(!diagram)throw new Error('Cited Deployment section has no Mermaid topology.');
const nodeLabels=new Map([...diagram.matchAll(/\b(\w+)\[\(?([^\]]+?)\)?\]/gu)].map(([,id,label])=>[id!,label!.trim()]));
const sourceIdToVisualId:Record<string,string>={User:'user',CF:'cf',S3Web:'s3web',ALB:'alb',API1:'api1',API2:'api2',Worker:'worker',RDS:'rds',FileS3:'files3'};
const sourceEdges=[...diagram.matchAll(/^\s*(\w+)(?:\[[^\]]+\])?\s*-->\s*(\w+)(?:\[[^\]]+\])?\s*$/gmu)].map(([,from,to])=>({from:sourceIdToVisualId[from!],to:sourceIdToVisualId[to!]}));
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='tpl-arch-deployment')!;

const detail=(row:{infrastructure:string;instances:string;scaling:string;backup:string},scope:string)=>`${scope}\n\nInfrastructure: ${row.infrastructure}\n\nInstances: ${row.instances}\n\nScaling: ${row.scaling}\n\nBackup / Recovery: ${row.backup}`;

test('DepositMatch deployment view retains the exact component rows and source topology',()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),architectureDigest=sha(architectureBytes);
 expect(sourceDigest).toBe('0bcabc7503cbecbfa7487c097041df299a93e724937d8c50e73d262a6f3da497');
 expect(definitionDigest).toBe('5c2aa91b9f29be60e798960ea645294d395b4ca12db892aca2aeed56f6e0dd22');
 expect(architectureDigest).toBe('4c79ba17f9d9342592c062b9a51cef0232816004b59f110488f696e7a8e191b8');
 expect(rows).toHaveLength(5);
 expect([...byComponent.keys()]).toEqual(['Web App','API Service','Matching Worker','Database','Source File Store']);
 expect(source).toMatchObject({id:'visual:tpl-arch-deployment',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'tpl-arch-deployment',kind:'flow',form:'zoned',title:'Deployment',question:'Where does each part of DepositMatch run?'});
 expect(visual.source).toEqual({path:'helix:workflows/activities/02-design/artifacts/architecture/example.md',view:'Deployment',digest:`sha256:${architectureDigest}`});
 expect(nodeLabels.size).toBe(9);
 expect([...nodeLabels.entries()].map(([id,label])=>({id:sourceIdToVisualId[id],label}))).toEqual([
  {id:'user',label:'Browser'},{id:'cf',label:'CloudFront'},{id:'s3web',label:'S3 Web App'},
  {id:'alb',label:'Application Load Balancer'},{id:'api1',label:'ECS API Task A'},{id:'api2',label:'ECS API Task B'},
  {id:'worker',label:'ECS Matching Worker'},{id:'rds',label:'RDS PostgreSQL 16 Multi-AZ'},{id:'files3',label:'S3 Source Files'}
 ]);
 const nodeAssignments:Record<string,{row:string;scope:string}>= {
  cf:{row:'Web App',scope:'Web App (shared configuration across CloudFront and S3 Web App)'},
  s3web:{row:'Web App',scope:'Web App (shared configuration across CloudFront and S3 Web App)'},
  api1:{row:'API Service',scope:'API Service (service-level configuration shared by API Task A and API Task B)'},
  api2:{row:'API Service',scope:'API Service (service-level configuration shared by API Task A and API Task B)'},
  worker:{row:'Matching Worker',scope:'Matching Worker'},
  rds:{row:'Database',scope:'Database'},
  files3:{row:'Source File Store',scope:'Source File Store'}
 };
 for(const node of visual.nodes??[]){
  const assignment=nodeAssignments[node.id],row=assignment?byComponent.get(assignment.row):undefined;
  const reviewedNode=reviewed.nodes?.find(candidate=>candidate.id===node.id)!;
  if(!assignment){expect(['user','alb']).toContain(node.id);expect(node.detail).toBeUndefined();expect(reviewedNode.detail).toBeUndefined();continue;}
  expect(row).toBeDefined();expect(node.detail).toBeUndefined();expect(reviewedNode.detail).toBe(detail(row!,assignment.scope));
 }
 const expected=structuredClone(source) as any;
 for(const node of expected.extensions['umf.visual'].nodes){const assignment=nodeAssignments[node.id];if(assignment)node.detail=detail(byComponent.get(assignment.row)!,assignment.scope);}
 expect(definition).toEqual(expected);
 expect(reviewed.groups).toEqual(visual.groups);
 expect(reviewed.edges).toEqual(visual.edges);
 expect(reviewed.omissions).toEqual(visual.omissions);
 expect(reviewed.nodes?.map(({id,label,role,group})=>({id,label,role,group}))).toEqual(visual.nodes?.map(({id,label,role,group})=>({id,label,role,group})));
 expect(reviewed.groups?.map(({id,label,role,tier})=>({id,label,role,tier}))).toEqual([
  {id:'tier-1',label:'Tier 1',role:'tier',tier:1},{id:'tier-2',label:'Tier 2',role:'tier',tier:2},
  {id:'tier-3',label:'Tier 3',role:'tier',tier:3},{id:'tier-4',label:'Tier 4',role:'tier',tier:4}
 ]);
 expect(reviewed.omissions).toEqual(['The example names no zones; tiers are each part\'s depth from the browser.']);
 expect(diagram).toContain('User[Browser] --> CF[CloudFront]');
 expect(diagram).toContain('CF --> S3Web[S3 Web App]');
 expect(diagram).toContain('ALB --> API1[ECS API Task A]');
 expect(diagram).toContain('ALB --> API2[ECS API Task B]');
 expect(diagram).toContain('Worker[ECS Matching Worker] --> RDS[(RDS PostgreSQL 16 Multi-AZ)]');
 expect(sourceEdges).toHaveLength(10);
 expect(sourceEdges).toEqual((visual.edges??[]).map(({from,to})=>({from,to})));
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});expect(inspectVisual(definition)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(source),parsed=readVisualDocument(sourceBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(parsed,'json'))).toEqual(source);
 const yaml=writeVisualDocument(definition,'yaml'),yamlParsed=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlParsed)).toEqual(reviewed);expect(JSON.parse(writeVisualDocument(yamlParsed,'json'))).toEqual(definition);
 const payload=visualPayloadYaml(definition);for(const node of reviewed.nodes??[])expect(payload).toContain(node.label);for(const node of reviewed.nodes??[])if(node.detail)expect(payload).toContain(node.detail.split('\n')[0]!);
 expect(JSON.stringify(source)).toBe(before);expect(sha(readFileSync(sourcePath))).toBe(sourceDigest);expect(sha(readFileSync(definitionPath))).toBe(definitionDigest);expect(sha(readFileSync(architecturePath))).toBe(architectureDigest);
});

test('Deployment review binds the exact UMF fixture and historical HELIX Markdown source',async()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),architectureDigest=sha(architectureBytes);
 const scope="The exact original Visual 1.0.0 fixture remains unchanged and is published byte-for-byte. The separate reviewed Visual 1.0.0 definition preserves the original nine node IDs/labels, four tier groups/tier values, ten edge IDs/endpoints, omission, title/question and source metadata, then adds the exact Infrastructure, Instances, Scaling, and Backup / Recovery values from the corresponding Deployment table rows to node details. Web App's shared configuration is attributed to CloudFront and S3 Web App nodes; API Service's service-level configuration is attributed to API Task A and API Task B without implying that each task independently has the service's two-task minimum. Matching Worker, Database, and Source File Store use their respective rows; Browser and Application Load Balancer receive no invented per-node table facts. The four groups and tier values are Visual-fixture projections whose omission says tiers represent depth from the browser; the source names no zones, and no physical/cloud zone mapping is asserted. The cited Markdown digest matches the architecture example in HELIX commit 19065f860a9e26b0cb52831de59b524ed6a55de6. The file is an example/template, not evidence of a deployed or current system.";
 expect(review).toMatchObject({id:'tpl-arch-deployment',title:'Deployment',kind:'flow',form:'zoned',definitionPath,definitionSha256:definitionDigest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies nine deployment-node identities/labels, four tier groups, ten directed topology edges, the no-zones omission, title/question, and cited architecture-example locator.'},
  {path:architecturePath,sha256:architectureDigest,pointer:'Deployment table and Mermaid graph',label:'Cited HELIX architecture example',originalLocator:'helix:workflows/activities/02-design/artifacts/architecture/example.md',resolvedSource:'helix/workflows/activities/02-design/artifacts/architecture/example.md',observedRevision:'19065f860a9e26b0cb52831de59b524ed6a55de6',description:'Exact Markdown bytes resolved from the fixture locator at the recorded HELIX commit. The Deployment table supplies five component rows with infrastructure, instance, scaling, and backup/recovery details; the selected Mermaid graph supplies the ten directed topology edges. Web App and API Service settings apply at their table component/service scope, not as independent counts on each drawn child node. The file is an architecture example, not a claim about a deployed product.'}
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/tpl-arch-deployment/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:architecturePath,sha256:architectureDigest,outputPath:'reviews/tpl-arch-deployment/architecture-example.md',mediaType:'text/markdown',description:'Exact historical architecture-example Markdown bytes resolved from the original HELIX locator.'}
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:tpl-arch-deployment',visualId:'tpl-arch-deployment',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/tpl-arch-deployment/authoritative-source.json',scope});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
