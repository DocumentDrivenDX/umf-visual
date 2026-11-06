// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/helix-containers.json';
const architecturePath='fixtures/visual/sources/helix/architecture.md';
const manifestPath='fixtures/reviews/review-sources.json';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=readFileSync(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,visual=getVisual(source) as Visual;
const architectureBytes=readFileSync(architecturePath),architecture=architectureBytes.toString('utf8');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='helix-containers')!;

test('HELIX containers preserve the Visual fixture and select only the cited Level 2 architecture view',()=>{
 const sourceDigest=sha(sourceBytes),architectureDigest=sha(architectureBytes);
 expect(sourceDigest).toBe('6278e01d27da22e6424e9c7d4ed4acc75a04da1099560e627aebef8e66226da6');
 expect(architectureDigest).toBe('9296c500ec9c9b8382ab4d6e2b7ce1f39528dd49e2454c1d38722bddd12242ef');
 expect(source).toMatchObject({id:'visual:helix-containers',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'helix-containers',kind:'flow',form:'network',title:"HELIX's containers",question:"What are HELIX's containers?"});
 expect(visual.source).toEqual({path:'helix:docs/helix/02-design/architecture.md',view:'Level 2',digest:`sha256:${architectureDigest}`});
 const diagram=architecture.match(/^## Level 2: Container Diagram\s*\n```mermaid\s*\n([\s\S]*?)\n```/mu)?.[1];
 expect(diagram).toBeDefined();
 for(const boundary of ['HELIX (this system)','Project (dogfood or adopter)','Any compliant runtime'])expect(diagram).toContain(`subgraph ${boundary==='HELIX (this system)'?'helix':boundary==='Project (dogfood or adopter)'?'project':'runtime'}["${boundary}"]`);
 const aliases=[['skill','skills/helix/SKILL.md'],['catalog','workflows/activities/…'],['schema','workflows/artifact-schema.md'],['wfdocs','workflows/'],['instances','docs/helix/'],['engine','Execution engine'],['packages','Per-runtime packages']];
 for(const[alias,label]of aliases)expect(diagram).toContain(`${alias}["${label}`);
 for(const edge of [
  'skill -->|"reads artifact types"| catalog','skill -->|"reads/writes"| instances','catalog -->|"instances conform to"| schema',
  'packages -->|"wraps same source"| skill','packages -->|"wraps same source"| catalog','engine -->|"loads skill into agent session"| skill','engine -->|"installs per runtime contract"| packages'
 ])expect(diagram).toContain(edge);
 expect(visual.groups?.map(({id,label,role})=>({id,label,role}))).toEqual([
  {id:'group-helix',label:'HELIX (this system)',role:'boundary'},
  {id:'group-project',label:'Project (dogfood or adopter)',role:'boundary'},
  {id:'group-runtime',label:'Any compliant runtime',role:'boundary'}
 ]);
 expect(visual.nodes?.map(({id,label,detail,group,role})=>({id,label,detail,group,role}))).toEqual([
  {id:'skill',label:'skills/helix/SKILL.md',detail:'Routing skill',group:'group-helix',role:'own'},
  {id:'catalog',label:'workflows/activities/…',detail:'Artifact catalog · templates · prompts · meta.yml',group:'group-helix',role:'own'},
  {id:'schema',label:'workflows/artifact-schema.md',detail:'Instance schema',group:'group-helix',role:'own'},
  {id:'wfdocs',label:'workflows/',detail:'Methodology spec · principles · concerns · activities',group:'group-helix',role:'own'},
  {id:'instances',label:'docs/helix/',detail:'Artifact instances · activity-numbered layout',group:'group-project',role:'external'},
  {id:'engine',label:'Execution engine',detail:'tracker · queue · loop · evidence',group:'group-runtime',role:'external'},
  {id:'packages',label:'Per-runtime packages',detail:'DDx plugin · Claude Code skill · Genie skill',group:'group-runtime',role:'external'}
 ]);
 expect(visual.edges).toEqual([
  {id:'skill--catalog',from:'skill',to:'catalog',label:'reads artifact types'},
  {id:'skill--instances',from:'skill',to:'instances',label:'reads/writes'},
  {id:'catalog--schema',from:'catalog',to:'schema',label:'instances conform to'},
  {id:'packages--skill',from:'packages',to:'skill',label:'wraps same source'},
  {id:'packages--catalog',from:'packages',to:'catalog',label:'wraps same source'},
  {id:'engine--skill',from:'engine',to:'skill',label:'loads skill into agent session'},
  {id:'engine--packages',from:'engine',to:'packages',label:'installs per runtime contract'}
 ]);
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(source),parsed=readVisualDocument(sourceBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(parsed,'json'))).toEqual(source);
 const yaml=writeVisualDocument(parsed,'yaml'),yamlParsed=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlParsed)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlParsed,'json'))).toEqual(source);
 for(const node of visual.nodes??[])expect(visualPayloadYaml(source)).toContain(node.label);
 expect(JSON.stringify(source)).toBe(before);expect(sha(readFileSync(sourcePath))).toBe(sourceDigest);expect(sha(readFileSync(architecturePath))).toBe(architectureDigest);
});

test('HELIX containers review publishes the original fixture and exact cited architecture source',async()=>{
 const sourceDigest=sha(sourceBytes),architectureDigest=sha(architectureBytes);
 const scope='The exact Visual 1.0.0 fixture remains unchanged and is published byte-for-byte. Its three boundaries, seven containers, seven directed labeled relationships, title, question, node/group IDs, and role assignments are preserved. The cited architecture.md bytes match the fixture\'s SHA-256 exactly. Its Level 2 Mermaid diagram and container-responsibility table support the selected structure and descriptions. The title, question, IDs, and role assignments are Visual-fixture projections rather than literal architecture fields. The architecture document records authored design; it does not establish current deployment or runtime behavior.';
 expect(review).toMatchObject({id:'helix-containers',title:"HELIX's containers",kind:'flow',form:'network',definitionPath:sourcePath,definitionSha256:sourceDigest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies three boundaries, seven container nodes, seven labeled directed edges, roles, title, question, and the cited architecture locator.'},
  {path:architecturePath,sha256:architectureDigest,pointer:'Level 2: Container Diagram and container-responsibility table',label:'Cited HELIX architecture',originalLocator:'helix:docs/helix/02-design/architecture.md',resolvedSource:'helix/docs/helix/02-design/architecture.md',description:'Exact Markdown bytes resolved from the fixture locator. The Level 2 Mermaid diagram and following table support the depicted boundaries, containers, directed relationships, technologies, and responsibilities.'}
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/helix-containers/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:architecturePath,sha256:architectureDigest,outputPath:'reviews/helix-containers/architecture.md',mediaType:'text/markdown',description:'Exact cited architecture Markdown bytes published without transformation.'}
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:helix-containers',visualId:'helix-containers',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/helix-containers/authoritative-source.json',scope});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
