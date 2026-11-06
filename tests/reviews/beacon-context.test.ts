// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/beacon-context.json';
const modelPath='fixtures/visual/sources/beacon/architecture-model.toml';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
const sourceBytes=readFileSync(sourcePath),source=read<Document>(sourcePath),visual=getVisual(source) as Visual;
const modelBytes=readFileSync(modelPath),modelText=modelBytes.toString('utf8'),model=Bun.TOML.parse(modelText) as any;

test('context fixture is an exact Visual source for the selected fictional context view',()=>{
 const digest=hash(sourceBytes),view=model.view.find((candidate:any)=>candidate.id==='context')!;
 expect(digest).toBe('967f17879a33a42f1fe9421d4114dafdde3b82dd3218f9ce098ba246e96c3962');
 expect(source.id).toBe('visual:beacon-context');expect(source.umf).toBe('0.10.0');expect(source.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(visual).toMatchObject({id:'beacon-context',kind:'flow',form:'network',title:view.title,question:'Who and what does Beacon talk to?',takeaway:view.takeaway,audience:'developer'});
 expect(visual.source).toEqual({path:'umf:fixtures/visual/sources/beacon/architecture-model.toml',view:'context',digest:'sha256:5506076ecd96344bd6b203c4d2a36ed983a7d9c37883c0e4dc65f9a59f689910'});
 expect(hash(modelBytes)).toBe('5506076ecd96344bd6b203c4d2a36ed983a7d9c37883c0e4dc65f9a59f689910');expect(modelText).toContain("A fictional system's architecture model");
 const selected=new Set(view.elements as string[]),elements=(view.elements as string[]).map(id=>model.element.find((element:any)=>element.id===id));
 expect(visual.nodes?.map(node=>node.id)).toEqual(view.elements);
 expect(visual.nodes?.map(({id,label,detail,role,status})=>({id,label,...(detail===undefined?{}:{detail}),role,status}))).toEqual(elements.map((element:any)=>({id:element.id,label:element.name,...(element.detail===undefined?{}:{detail:element.detail}),role:element.kind==='person'?'actor':element.kind==='system'?'own':element.owner==='platform'?'platform':'external',status:element.status})));
 const relations=model.relation.filter((relation:any)=>selected.has(relation.from)&&selected.has(relation.to));
 expect(relations).toHaveLength(14);expect(visual.edges).toHaveLength(14);
 expect(visual.edges?.map(({id,from,to,label,kind,status,why})=>({id,from,to,label,...(kind===undefined?{}:{kind}),...(status===undefined?{}:{status}),...(why===undefined?{}:{why})}))).toEqual(relations.map((relation:any)=>({id:`${relation.from}--${relation.to}`,from:relation.from,to:relation.to,label:relation.label,...(relation.kind===undefined?{}:{kind:relation.kind}),...(relation.status===undefined?{}:{status:relation.status}),...(relation.why===undefined?{}:{why:relation.why})})));
 expect(visual.nodes?.some(node=>['web','api','drafter','worker','rules','db','queue','files'].includes(node.id))).toBe(false);
 expect(visual.groups).toBeUndefined();expect(visual.steps).toBeUndefined();expect(visual.layout).toBeUndefined();expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 const json=readVisualDocument(sourceBytes.toString('utf8'),'json');expect(JSON.parse(writeVisualDocument(json,'json'))).toEqual(source);
 const yaml=writeVisualDocument(json,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');expect(getVisual(yamlRead)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
});

test('context review binds and publishes original JSON and exact fictional TOML bytes',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(example=>example.id==='beacon-context')!,digest=hash(sourceBytes),modelDigest=hash(modelBytes);
 expect(row).toMatchObject({id:'beacon-context',title:'Beacon and its neighbours',kind:'flow',form:'network',definitionPath:sourcePath,definitionSha256:digest});
 expect(row.sources).toEqual([
  {path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 source fixture supplies the selected context view\'s 13 node IDs, labels, details, roles, statuses, 14 relations, and authored title, question, takeaway, audience, and source locator.'},
  {path:modelPath,sha256:modelDigest,pointer:'/view/context',label:'Fictional architecture-model source',description:'The exact checked-in TOML bytes identify the selected context view and its elements and relations; the source labels the model fictional.'},
 ]);
 expect(row.publishedAssets).toEqual([
  {path:sourcePath,sha256:digest,outputPath:'reviews/beacon-context/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:modelPath,sha256:modelDigest,outputPath:'reviews/beacon-context/architecture-model.toml',mediaType:'application/toml',description:'Exact fictional architecture-model TOML bytes cited by the original fixture.'},
 ]);
 expect(row.originalEvidence).toMatchObject({kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,documentId:'visual:beacon-context',visualId:'beacon-context',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/beacon-context/authoritative-source.json'});
 expect(row.originalEvidence.scope).toContain('No content from other views or journey steps is added');
 const verified=await verifyReviewSourceEvidence();expect(verified.examples).toBe(manifest.examples.length);
});

test('context public plans map all exact selected nodes and induced relations without source mutation',()=>{
 const before=JSON.stringify(source),base='/extensions/umf.visual';
 for(const backend of ['graphviz','mermaid','lini'] as const){
  const plan=compilePresentation(source,{backend,theme:'presentation/1'});expect(plan.ok,backend).toBe(true);if(!plan.ok)continue;
  expect(plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(13);expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(14);
  for(const[index,node]of visual.nodes!.entries())expect(plan.elementMap).toContainEqual({logicalId:node.id,sourcePath:`${base}/nodes/${index}${backend==='lini'?'/id':''}`,nativeId:`n${index+1}`,kind:'node'});
  for(const[index,edge]of visual.edges!.entries())expect(plan.elementMap).toContainEqual({logicalId:edge.id,sourcePath:`${base}/edges/${index}`,nativeId:`e${index+1}`,kind:'edge'});
 }
 expect(JSON.stringify(source)).toBe(before);
});
