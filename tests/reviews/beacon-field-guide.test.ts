// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';
import {compilePresentation} from '../../src/presentation';

const sourcePath='fixtures/visual/inventory/beacon-field-guide.json';
const modelPath='fixtures/visual/sources/beacon/architecture-model.toml';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
const sourceBytes=readFileSync(sourcePath),source=read<Document>(sourcePath),visual=getVisual(source) as Visual;
const modelBytes=readFileSync(modelPath),modelText=modelBytes.toString('utf8'),model=Bun.TOML.parse(modelText) as any;
const view=model.view.find((candidate:any)=>candidate.id==='field-guide')!;
const manifest=read<{examples:Array<any>}>(manifestPath),review=manifest.examples.find(example=>example.id==='beacon-field-guide')!;

test('field guide remains an exact alias for the selected fictional view and only its source facts',()=>{
 const digest=hash(sourceBytes),modelDigest=hash(modelBytes),selected=new Set<string>(view.elements),elements=model.element.filter((element:any)=>selected.has(element.id));
 expect(digest).toBe('1d7a4222d275d942157dd3531d438c825afcb6812576ab13b937c911c18aa007');
 expect(modelDigest).toBe('5506076ecd96344bd6b203c4d2a36ed983a7d9c37883c0e4dc65f9a59f689910');
 expect(modelText).toContain("A fictional system's architecture model");
 expect(source).toMatchObject({id:'visual:beacon-field-guide',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'beacon-field-guide',kind:'flow',form:'lanes',title:view.title,takeaway:view.takeaway,audience:'developer'});
 expect(visual.source).toEqual({path:`umf:${modelPath}`,view:'field-guide',digest:`sha256:${modelDigest}`});
 expect(visual.nodes?.map(node=>node.id)).toEqual(view.elements);
 const role=(element:any)=>element.kind==='person'?'actor':element.kind==='container'?'own':element.owner==='platform'?'platform':'external';
 expect(visual.nodes?.map(({id,label,detail,role:nodeRole,status,group})=>({id,label,...(detail===undefined?{}:{detail}),role:nodeRole,status,group}))).toEqual(elements.map((element:any)=>({id:element.id,label:element.name,...(element.detail===undefined?{}:{detail:element.detail}),role:role(element),status:element.status,group:view.group.find((group:any)=>group.elements.includes(element.id))?.id})));
 expect(visual.groups?.map(({id,label,role:groupRole})=>({id,label,role:groupRole,members:visual.nodes?.filter(node=>node.group===id).map(node=>node.id)}))).toEqual(view.group.map((group:any)=>({id:group.id,label:group.label,role:'lane',members:group.elements})));
 const relations=model.relation.filter((relation:any)=>selected.has(relation.from)&&selected.has(relation.to));
 expect(relations).toHaveLength(6);expect(visual.edges).toHaveLength(6);
 expect(visual.edges?.map(({id,from,to,label,why})=>({id,from,to,label,...(why===undefined?{}:{why})}))).toEqual(relations.map((relation:any)=>({id:`${relation.from}--${relation.to}`,from:relation.from,to:relation.to,label:relation.label,...(relation.why===undefined?{}:{why:relation.why})})));
 const numbered=relations.filter((relation:any)=>Number.isInteger(relation.step)).sort((a:any,b:any)=>a.step-b.step);
 const sentenceCase=(value:string)=>value.charAt(0).toUpperCase()+value.slice(1);
 expect(numbered).toHaveLength(4);expect(visual.steps?.slice(0,4).map((step,index)=>({id:step.id,title:step.title,caption:step.caption,focus:step.focus,sourceStep:numbered[index]?.step,sourceLabel:numbered[index]?.label,sourceNote:numbered[index]?.note}))).toEqual(numbered.map((relation:any,index:number)=>({id:`s${index+1}`,title:sentenceCase(relation.label),caption:relation.note,focus:[`${relation.from}--${relation.to}`],sourceStep:relation.step,sourceLabel:relation.label,sourceNote:relation.note})));
 const throughout=relations.find((relation:any)=>relation.throughout===true)!;
 expect(visual.steps?.[4]).toEqual({id:'throughout-audit-spans-otlp',title:sentenceCase(throughout.label),caption:throughout.note,focus:[`${throughout.from}--${throughout.to}`],when:'throughout'});
 expect(visual.edges?.find(edge=>edge.id===`${throughout.from}--${throughout.to}`)?.why).toBe(throughout.why);
 expect(visual.omissions).toHaveLength(1);
 const omission=visual.omissions![0]!;
 expect(omission).toContain('conceptual map, not a deployment topology');
 for(const id of ['customer','admin','idp','beacon','web','drafter','worker','rules','db','queue','files','helpdesk','kb','ci']){
  const element=model.element.find((candidate:any)=>candidate.id===id)!;
  expect(selected.has(id)).toBe(false);expect(omission).toContain(element.name);
 }
 expect(omission).toContain('Policy rules (placeholder)');expect(omission).toContain('Attachment store (unknown)');
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 const json=readVisualDocument(sourceBytes.toString('utf8'),'json');expect(JSON.parse(writeVisualDocument(json,'json'))).toEqual(source);
 const yaml=writeVisualDocument(json,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');expect(getVisual(yamlRead)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
 for(const value of ['opens a ticket','forwards with the agent\'s token','asks for a draft','routes to a model','Audit spans, OTLP','throughout'])expect(visualPayloadYaml(source)).toContain(value);
 expect(hash(readFileSync(sourcePath))).toBe(digest);
});

test('field guide review binds and publishes exact original UMF and architecture source bytes',async()=>{
 const digest=hash(sourceBytes),modelDigest=hash(modelBytes);
 expect(review).toMatchObject({id:'beacon-field-guide',title:"A developer's first map of Beacon",kind:'flow',form:'lanes',definitionPath:sourcePath,definitionSha256:digest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies seven node identities and fields, four lane groups with memberships, six induced relations, four numbered walkthrough steps, one throughout audit-span note, and the authored conceptual-scope caveat.'},
  {path:modelPath,sha256:modelDigest,pointer:'/view/field-guide',label:'Fictional architecture-model source',description:'The exact checked-in TOML bytes identify the selected field-guide view, its elements and groups, and the relations and journey notes retained by the fixture; the source labels the model fictional.'},
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:digest,outputPath:'reviews/beacon-field-guide/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:modelPath,sha256:modelDigest,outputPath:'reviews/beacon-field-guide/architecture-model.toml',mediaType:'application/toml',description:'Exact fictional architecture-model TOML bytes cited by the original fixture.'},
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,documentId:'visual:beacon-field-guide',visualId:'beacon-field-guide',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/beacon-field-guide/authoritative-source.json',scope:'This exact UMF fixture is the review definition. It preserves the seven elements selected by the `field-guide` view, their four authored lane groups and memberships, and the six relations induced by selected endpoints. Its four numbered steps reproduce the source relations marked 1 through 4; the final `throughout` note reproduces the source audit-span relation. The authored caveat names source elements left outside this view and preserves the placeholder/unknown statuses for Policy rules and Attachment store. The architecture-model source identifies itself as fictional; neither file establishes current state or deployment.'});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});

test('field guide public native plans retain node, lane, and induced-edge identity while locating static-step omission',()=>{
 const before=sourceBytes.slice(),base='/extensions/umf.visual';
 for(const backend of ['graphviz','mermaid','lini'] as const){
  const plan=compilePresentation(source,{backend,theme:'presentation/1'});
  expect(plan.ok,`${backend} admits the generic lanes view`).toBe(true);if(!plan.ok)continue;
  const nodes=plan.elementMap.filter(item=>item.kind==='node'),groups=plan.elementMap.filter(item=>item.kind==='group'),edges=plan.elementMap.filter(item=>item.kind==='edge');
  expect(nodes).toHaveLength(7);expect(groups).toHaveLength(4);expect(edges).toHaveLength(6);
  for(const[index,node]of visual.nodes!.entries())expect(nodes).toContainEqual({logicalId:node.id,sourcePath:`${base}/nodes/${index}${backend==='lini'?'/id':''}`,nativeId:`n${index+1}`,kind:'node'});
  for(const[index,group]of visual.groups!.entries())expect(groups).toContainEqual({logicalId:group.id,sourcePath:`${base}/groups/${index}`,nativeId:`g${index+1}`,kind:'group'});
  for(const[index,edge]of visual.edges!.entries())expect(edges).toContainEqual({logicalId:edge.id,sourcePath:`${base}/edges/${index}`,nativeId:`e${index+1}`,kind:'edge'});
  expect(plan.omissions.some(item=>item.sourcePath===`${base}/steps`)).toBe(true);
  const laneNotes=plan.approximations.filter(item=>item.requested==='Lane group role');
  expect(laneNotes).toHaveLength(4);
  for(const[index]of visual.groups!.entries()){
   const note=laneNotes.find(item=>item.sourcePath===`${base}/groups/${index}/role`);
   expect(note).toBeDefined();expect(note!.representation).toContain('represents this declared lane and its members');
   expect(note!.representation).toContain('no physical alignment, equal dimensions, or chronological order is implied');
  }
 }
 expect(readFileSync(sourcePath)).toEqual(before);
});
