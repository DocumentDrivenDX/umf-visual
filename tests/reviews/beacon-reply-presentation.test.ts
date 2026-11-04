// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/beacon-reply-presentation.json';
const modelPath='fixtures/visual/sources/beacon/architecture-model.toml';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
const sourceBytes=readFileSync(sourcePath),source=read<Document>(sourcePath),visual=getVisual(source) as Visual;
const modelBytes=readFileSync(modelPath),model=Bun.TOML.parse(modelBytes.toString('utf8')) as any;
const deployment=model.view.find((candidate:any)=>candidate.id==='deployment')!;
const journey=model.journey.find((candidate:any)=>candidate.id==='reply-draft')!;
const manifest=read<{examples:Array<any>}>(manifestPath),review=manifest.examples.find(item=>item.id==='beacon-reply-presentation')!;
const nodeRole=(element:any)=>element.kind==='person'?'actor':element.kind==='container'?'own':element.kind==='store'?'store':element.owner==='platform'?'platform':element.kind==='system'?'own':'external';

test('reply-presentation preserves the selected deployment graph and adds the ordered journey focus',()=>{
 const digest=hash(sourceBytes),modelDigest=hash(modelBytes),selected=new Set(deployment.elements as string[]);
 expect(digest).toBe('e3cf905c0300313c71508db3a08f4f82b4a4022dc31cb6a3502f1b564b5aa156');
 expect(modelDigest).toBe('5506076ecd96344bd6b203c4d2a36ed983a7d9c37883c0e4dc65f9a59f689910');
 expect(modelBytes.toString('utf8')).toContain("A fictional system's architecture model");
 expect(source).toMatchObject({id:'visual:beacon-reply-presentation',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'beacon-reply-presentation',kind:'flow',form:'zoned',title:journey.title,question:'What happens, where, when an agent asks for a draft?',takeaway:journey.takeaway,audience:'developer'});
 expect(visual.source).toEqual({path:`umf:${modelPath}`,view:'deployment',digest:`sha256:${modelDigest}`});

 const elements=model.element.filter((element:any)=>selected.has(element.id));
 expect(elements).toHaveLength(13);expect(visual.nodes).toHaveLength(13);expect(visual.nodes?.map(node=>node.id)).toEqual(deployment.elements);
 expect(visual.nodes?.map(({id,label,detail,role,status,group})=>({id,label,...(detail===undefined?{}:{detail}),role,status,group}))).toEqual(elements.map((element:any)=>({id:element.id,label:element.name,...(element.detail===undefined?{}:{detail:element.detail}),role:nodeRole(element),status:element.status,group:`zone-${element.zone.toLowerCase().replaceAll(' ','-')}`})));
 const zones=[...new Set(elements.map((element:any)=>element.zone))] as string[];
 expect(visual.groups).toHaveLength(5);
 expect(visual.groups?.map(({id,label,detail,role,tier})=>({id,label,...(detail===undefined?{}:{detail}),role,tier}))).toEqual(zones.map(zone=>{
  const members=elements.filter((element:any)=>element.zone===zone),caption=model.zone.find((candidate:any)=>candidate.name===zone)?.caption,tiers=[...new Set<number>(members.map((element:any)=>element.tier as number))];
  expect(tiers).toHaveLength(1);
  return{id:`zone-${zone.toLowerCase().replaceAll(' ','-')}`,label:zone,...(caption===undefined?{}:{detail:caption}),role:'zone',tier:tiers[0]};
 }));
 const relations=model.relation.filter((relation:any)=>selected.has(relation.from)&&selected.has(relation.to));
 expect(relations).toHaveLength(15);expect(visual.edges).toHaveLength(15);
 expect(visual.edges?.map(({id,from,to,label,kind,status,why})=>({id,from,to,label,...(kind===undefined?{}:{kind}),...(status===undefined?{}:{status}),...(why===undefined?{}:{why})}))).toEqual(relations.map((relation:any)=>({id:`${relation.from}--${relation.to}`,from:relation.from,to:relation.to,label:relation.label,...(relation.kind===undefined?{}:{kind:relation.kind}),...(relation.status===undefined?{}:{status:relation.status}),...(relation.why===undefined?{}:{why:relation.why})})));

 expect(journey.step).toHaveLength(8);expect(visual.steps).toHaveLength(8);
 expect(visual.steps?.map(({id,title,focus})=>({id,title,focus}))).toEqual(journey.step.map((step:any,index:number)=>{
  const edge=relations.find((relation:any)=>relation.from===step.from&&relation.to===step.to&&relation.label===step.label);
  expect(edge,'journey step must match a deployment relation').toBeDefined();
  return{id:`s${index+1}`,title:step.label.charAt(0).toUpperCase()+step.label.slice(1),focus:[`${edge.from}--${edge.to}`]};
 }));
 expect(visual.edges).toHaveLength(15); // Eight focus steps annotate the larger graph; they do not replace its other relations.
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 const json=readVisualDocument(sourceBytes.toString('utf8'),'json');expect(JSON.parse(writeVisualDocument(json,'json'))).toEqual(source);
 const yaml=writeVisualDocument(json,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');expect(getVisual(yamlRead)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
 const payload=visualPayloadYaml(source);for(const step of journey.step)expect(payload).toContain(step.label);
 expect(hash(readFileSync(sourcePath))).toBe(digest);expect(hash(readFileSync(modelPath))).toBe(modelDigest);
});

test('reply-presentation review binds exact UMF JSON and both relevant fictional TOML sections',async()=>{
 const digest=hash(sourceBytes),modelDigest=hash(modelBytes);
 expect(review).toMatchObject({id:'beacon-reply-presentation',title:visual.title,kind:visual.kind,form:visual.form,definitionPath:sourcePath,definitionSha256:digest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture preserves the deployment view projection: 13 node identities and fields, five tiered zones, and all 15 induced relations. Its eight ordered steps focus eight of those relations; the question and source locator are fixture-authored.'},
  {path:modelPath,sha256:modelDigest,pointer:'/view/deployment',label:'Fictional architecture-model source',description:'The checked-in TOML defines the selected deployment view, its elements and source zone/tier assignments, and the relations induced by the view endpoints. The source labels the model fictional; it does not establish a current deployment.'},
  {path:modelPath,sha256:modelDigest,pointer:'/journey/reply-draft',label:'Fictional reply-draft journey',description:'The checked-in TOML defines the eight ordered from/to/label journey steps. Each corresponds to a focused fixture step and a matching deployment relation; the journey supplies the fixture title and takeaway but no question field.'},
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:digest,outputPath:'reviews/beacon-reply-presentation/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:modelPath,sha256:modelDigest,outputPath:'reviews/beacon-reply-presentation/architecture-model.toml',mediaType:'application/toml',description:'Exact fictional architecture-model TOML bytes cited by the original UMF fixture.'},
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,documentId:'visual:beacon-reply-presentation',visualId:'beacon-reply-presentation',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/beacon-reply-presentation/authoritative-source.json',scope:'This exact UMF fixture JSON is the review definition. It preserves the selected deployment projection: thirteen node identities and authored fields, five tiered zones, and all fifteen relations induced by endpoints in the `deployment` view, including authored return, why, and unknown-status meaning. Eight ordered steps focus eight of those fifteen relations; they correspond to the eight ordered from/to/label steps in the TOML `reply-draft` journey, whose title and takeaway are also reflected in the fixture. The TOML has no `reply-presentation` view: the fixture retains its historical `deployment` source locator and separately cites the deployment view and reply-draft journey. The fixture question is UMF-authored. Source roles/group IDs, step titles/focus, and selected presentation metadata are fixture mappings or projections, not additional TOML declarations. Both sources describe a fictional model; neither establishes a live/current deployment, runtime timing, or concurrency.'});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
