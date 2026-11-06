// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {readVisualDocument,inspectVisual,getVisual,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {compilePresentation} from '../../src/presentation';

const read=(path:string)=>readFileSync(path);
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourcePath='fixtures/visual/inventory/beacon-estate-landscape.json';
const definitionPath='fixtures/reviews/definitions/beacon-estate-landscape.json';
const estatePath='fixtures/visual/sources/estate/estate.toml';
const architecturePath='fixtures/visual/sources/beacon/architecture-model.toml';
const sourceDocument=readVisualDocument(read(sourcePath).toString('utf8'),'json');
const document=readVisualDocument(read(definitionPath).toString('utf8'),'json');
const visual=getVisual(document) as Visual;
const reviewManifest=JSON.parse(read('fixtures/reviews/review-sources.json').toString('utf8')) as any;
const review=reviewManifest.examples.find((item:any)=>item.id==='beacon-estate-landscape');

test('beacon estate landscape preserves original bytes and keeps the reviewed omission in a separate definition',()=>{
 expect(sha(read(sourcePath))).toBe('47a6ec51e97ccef53755874423d80975526cf05a381432cddbc6f92518e69063');
 expect(sha(read(definitionPath))).toBe(review.definitionSha256);
 expect(review.definitionPath).toBe(definitionPath);
 const original=getVisual(sourceDocument) as Visual;
 expect(sourceDocument).toMatchObject({id:'visual:beacon-estate-landscape',umf:'0.10.0'});
 expect(original.nodes).toEqual(visual.nodes);
 expect(original.omissions).toEqual(['The other systems\' own parts: only Beacon has an architecture model here.']);
 expect(visual.omissions?.slice(0,1)).toEqual(original.omissions);
 expect(visual.omissions).toHaveLength(2);
 expect(visual.source).toEqual({path:'umf:fixtures/visual/sources/estate/estate.toml',digest:'sha256:fba6a89d5fb778b126ed386fab82eb92759d04240522073ef48c363fbd7bd59a'});
 expect(document.id).toBe('visual:beacon-estate-landscape');
 expect(document.umf).toBe('0.10.0');
 expect(document.vocabularies['umf.visual']?.version).toBe('1.0.0');
 expect(visual.kind).toBe('structure');expect(visual.form).toBe('nested');
 expect(visual.title).toBe('Support tools estate');
 expect(visual.question).toBe('Which systems make up the estate, and what is inside Beacon?');
 expect(visual.takeaway).toBe('Four systems, each owned by one team; Beacon is the only one that writes to customers.');
 expect(visual.nodes).toEqual([
  {id:'estate',label:'Support tools estate'},
  {id:'system-beacon',label:'beacon',detail:'example/beacon',role:'own',parent:'estate'},
  {id:'system-ledger',label:'ledger',detail:'example/ledger',role:'own',parent:'estate'},
  {id:'system-portal',label:'portal',detail:'example/customer-portal',role:'own',parent:'estate'},
  {id:'system-insight',label:'insight',detail:'example/insight',role:'own',parent:'estate'},
  {id:'web',label:'Web app',detail:'the agent\'s inbox and draft editor',role:'own',status:'built',parent:'system-beacon'},
  {id:'api',label:'Beacon API',detail:'every request runs as the agent',role:'own',status:'built',parent:'system-beacon'},
  {id:'drafter',label:'Reply drafter',detail:'builds the prompt from the ticket and its history',role:'own',status:'built',parent:'system-beacon'},
  {id:'worker',label:'Job worker',detail:'imports, re-indexing, nightly digests',role:'own',status:'built',parent:'system-beacon'},
  {id:'rules',label:'Policy rules',detail:'a fixed allow-list until the rules engine lands',role:'own',status:'placeholder',parent:'system-beacon'}
 ]);
 expect(visual.edges).toBeUndefined();
 expect(visual.omissions).toEqual([
  'The other systems\' own parts: only Beacon has an architecture model here.',
  'The Beacon container view also includes the sign-in proxy and Beacon database, job queue, and attachment store; this landscape shows only the five application containers in the Beacon layer.'
 ]);
 expect(inspectVisual(document).valid&&inspectVisual(document).complete).toBe(true);
});

test('estate and architecture sources are published with exact hashes and the microsite payload remains exact YAML',()=>{
 const estateBytes=read(estatePath),architectureBytes=read(architecturePath),definitionBytes=read(definitionPath),sourceBytes=read(sourcePath);
 expect(sha(estateBytes)).toBe('fba6a89d5fb778b126ed386fab82eb92759d04240522073ef48c363fbd7bd59a');
 expect(sha(architectureBytes)).toBe('5506076ecd96344bd6b203c4d2a36ed983a7d9c37883c0e4dc65f9a59f689910');
 expect(review.sources).toEqual(expect.arrayContaining([
  expect.objectContaining({path:sourcePath,sha256:sha(sourceBytes),pointer:'/extensions/umf.visual'}),
  expect.objectContaining({path:estatePath,sha256:sha(estateBytes),pointer:'/system'}),
  expect.objectContaining({path:architecturePath,sha256:sha(architectureBytes),pointer:'/view/containers'})
 ]));
 expect(review.publishedAssets).toEqual(expect.arrayContaining([
  expect.objectContaining({path:sourcePath,sha256:sha(sourceBytes),outputPath:'reviews/beacon-estate-landscape/authoritative-source.json'}),
  expect.objectContaining({path:estatePath,sha256:sha(estateBytes),outputPath:'reviews/beacon-estate-landscape/estate.toml',mediaType:'application/toml'}),
  expect.objectContaining({path:architecturePath,sha256:sha(architectureBytes),outputPath:'reviews/beacon-estate-landscape/architecture-model.toml',mediaType:'application/toml'})
 ]));
 expect(review.originalEvidence).toMatchObject({kind:'authoritative-umf-source',sourcePath,sourceSha256:sha(sourceBytes),documentId:'visual:beacon-estate-landscape',visualId:'beacon-estate-landscape',envelopeVersion:'0.10.0',modelVersion:'1.0.0'});
 expect(review.originalEvidence.scope).toContain('retains its original caveat');
 expect(review.originalEvidence.scope).toContain('sign-in proxy and Beacon database, job queue, and attachment store');
 expect(review.originalEvidence.scope).toContain('neither describes a current organization or deployed estate');
 expect(visualPayloadYaml(document)).toContain('The other systems\' own parts: only Beacon has an architecture model here.');
 expect(visualPayloadYaml(document)).toContain('sign-in proxy and Beacon database, job queue, and attachment store');
});

test('fictional source authorities support only the named estate systems and Beacon-layer parts',()=>{
 const estate=read(estatePath).toString('utf8'),architecture=read(architecturePath).toString('utf8');
 for(const [id,repo] of [['beacon','example/beacon'],['ledger','example/ledger'],['portal','example/customer-portal'],['insight','example/insight']]){
  expect(estate).toContain(`id = "${id}"`);expect(estate).toContain(`repo = "${repo}"`);
 }
 expect(estate).toContain('A fictional estate');
 expect(architecture).toContain('A fictional system');
 for(const [id,name,status] of [['web','Web app','built'],['api','Beacon API','built'],['drafter','Reply drafter','built'],['worker','Job worker','built'],['rules','Policy rules','placeholder']]){
  const start=architecture.indexOf(`id = "${id}"`),next=architecture.indexOf('[[element]]',start+1),element=architecture.slice(start,next<0?undefined:next);
  expect(start,`source element ${id}`).toBeGreaterThanOrEqual(0);
  expect(element).toContain(`name = "${name}"`);expect(element).toContain(`status = "${status}"`);expect(element).toContain('layer = "Beacon"');
 }
 for(const excluded of ['name = "Sign-in proxy"','name = "Beacon database"','name = "Job queue"','name = "Attachment store"'])expect(architecture).toContain(excluded);
});

test('public nested projections map each source node once without inventing groups or edges',()=>{
 const originalBytes=read(sourcePath),reviewedBytes=read(definitionPath);
 for(const backend of ['graphviz','mermaid','lini'] as const){
  const result=compilePresentation(document as any,{backend});
  expect(result.ok,`${backend} compiles reviewed nested definition`).toBe(true);
  if(!result.ok)continue;
  const nodes=result.elementMap.filter(row=>row.kind==='node');
  expect(nodes,`${backend} maps exactly one node per source node`).toHaveLength(10);
  for(const[index,node]of visual.nodes!.entries()){
   expect(nodes,`${backend} maps source node ${node.id} once`).toContainEqual({logicalId:node.id,sourcePath:`/extensions/umf.visual/nodes/${index}/id`,nativeId:`n${index+1}`,kind:'node'});
  }
  expect(result.elementMap.filter(row=>row.kind==='group'||row.kind==='edge'),`${backend} creates no logical groups or edges`).toHaveLength(0);
 }
 expect(read(sourcePath)).toEqual(originalBytes);
 expect(read(definitionPath)).toEqual(reviewedBytes);
});
