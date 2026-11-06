// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/beacon-overview.json';
const modelPath='fixtures/visual/sources/beacon/architecture-model.toml';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
const sourceBytes=readFileSync(sourcePath),source=read<Document>(sourcePath),visual=getVisual(source) as Visual;
const modelBytes=readFileSync(modelPath),modelText=modelBytes.toString('utf8'),model=Bun.TOML.parse(modelText) as any;
const view=model.view.find((candidate:any)=>candidate.id==='overview')!;
const manifest=read<{examples:Array<any>}>(manifestPath),review=manifest.examples.find(item=>item.id==='beacon-overview')!;

test('overview remains an exact source-selected pipeline alias',()=>{
 const digest=hash(sourceBytes),modelDigest=hash(modelBytes),selected=new Set<string>(view.elements);
 expect(digest).toBe('d84472162bc0367eb28bda2c11659c997cc09ef39bf6b08b0ad436f2983663da');
 expect(modelDigest).toBe('5506076ecd96344bd6b203c4d2a36ed983a7d9c37883c0e4dc65f9a59f689910');
 expect(modelText).toContain("A fictional system's architecture model");
 expect(source).toMatchObject({id:'visual:beacon-overview',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'beacon-overview',kind:'flow',form:'pipeline',title:view.title,takeaway:view.takeaway,audience:'developer'});
 expect(visual.source).toEqual({path:`umf:${modelPath}`,view:'overview',digest:`sha256:${modelDigest}`});
 expect(visual.nodes?.map(node=>node.id)).toEqual(view.elements);
 const elements=model.element.filter((element:any)=>selected.has(element.id));
 const role=(element:any)=>element.kind==='person'?'actor':element.kind==='container'?'own':element.owner==='platform'?'platform':'external';
 expect(visual.nodes?.map(({id,label,detail,role:nodeRole,status})=>({id,label,...(detail===undefined?{}:{detail}),role:nodeRole,status}))).toEqual(elements.map((element:any)=>({id:element.id,label:element.name,...(element.detail===undefined?{}:{detail:element.detail}),role:role(element),status:element.status})));
 expect(visual.groups).toBeUndefined();
 const relations=model.relation.filter((relation:any)=>selected.has(relation.from)&&selected.has(relation.to));
 expect(relations).toHaveLength(9);expect(visual.edges).toHaveLength(9);
 expect(visual.edges?.map(({id,from,to,label,kind,why})=>({id,from,to,label,...(kind===undefined?{}:{kind}),...(why===undefined?{}:{why})}))).toEqual(relations.map((relation:any)=>({id:`${relation.from}--${relation.to}`,from:relation.from,to:relation.to,label:relation.label,...(relation.kind===undefined?{}:{kind:relation.kind}),...(relation.why===undefined?{}:{why:relation.why})})));
 const returned=relations.find((relation:any)=>relation.from==='api'&&relation.to==='web')!;
 expect(returned).toMatchObject({label:'returns the draft',kind:'return'});
 expect(visual.edges?.find(edge=>edge.id==='api--web')).toMatchObject({from:'api',to:'web',label:returned.label,kind:'return'});
 const numbered=relations.filter((relation:any)=>Number.isInteger(relation.step)).sort((a:any,b:any)=>a.step-b.step);
 const sentenceCase=(value:string)=>value.charAt(0).toUpperCase()+value.slice(1);
 expect(numbered).toHaveLength(4);expect(visual.steps).toHaveLength(4);
 expect(visual.steps?.map((step,index)=>({id:step.id,title:step.title,caption:step.caption,focus:step.focus,sourceStep:numbered[index]?.step,sourceLabel:numbered[index]?.label,sourceNote:numbered[index]?.note}))).toEqual(numbered.map((relation:any,index:number)=>({id:`s${index+1}`,title:sentenceCase(relation.label),caption:relation.note,focus:[`${relation.from}--${relation.to}`],sourceStep:relation.step,sourceLabel:relation.label,sourceNote:relation.note})));
 for(const id of ['customer','admin','beacon','worker','helpdesk','kb','ci','telemetry','secrets'])expect(selected.has(id)).toBe(false);
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 expect(visualPayloadYaml(source)).toContain('returns the draft');
 expect(hash(readFileSync(sourcePath))).toBe(digest);
 expect(hash(readFileSync(modelPath))).toBe(modelDigest);
});

test('overview review binds exact original UMF and fictional TOML bytes',async()=>{
 const digest=hash(sourceBytes),modelDigest=hash(modelBytes);
 expect(review).toMatchObject({id:'beacon-overview',title:'One draft, end to end',kind:'flow',form:'pipeline',definitionPath:sourcePath,definitionSha256:digest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies seven node identities and fields, nine induced directed relations including the API return edge, and four numbered journey steps.'},
  {path:modelPath,sha256:modelDigest,pointer:'/view/overview',label:'Fictional architecture-model source',description:'The exact checked-in TOML bytes explicitly define the overview view and its seven selected elements, plus the induced source relations and numbered journey notes; the source labels the model fictional.'},
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:digest,outputPath:'reviews/beacon-overview/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:modelPath,sha256:modelDigest,outputPath:'reviews/beacon-overview/architecture-model.toml',mediaType:'application/toml',description:'Exact fictional architecture-model TOML bytes cited by the original UMF fixture.'},
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,documentId:'visual:beacon-overview',visualId:'beacon-overview',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/beacon-overview/authoritative-source.json',scope:'This exact UMF fixture is the review definition. It preserves the seven elements selected by the `overview` view, their authored fields, and the nine relations induced by selected endpoints, including the distinct API-to-web return relation. Its four numbered steps reproduce the source relations marked 1 through 4 and their captions. The fixture question remains UMF-authored because the TOML view has no question field. The architecture-model source identifies itself as fictional; neither file establishes current state or deployment.'});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
