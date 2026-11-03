// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/beacon-containers.json';
const modelPath='fixtures/visual/sources/beacon/architecture-model.toml';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
const sourceBytes=readFileSync(sourcePath),source=read<Document>(sourcePath),visual=getVisual(source) as Visual;
const modelBytes=readFileSync(modelPath),modelText=modelBytes.toString('utf8'),model=Bun.TOML.parse(modelText) as any;

test('containers fixture is an exact Visual source for one selected view of a fictional model',()=>{
 const digest=hash(sourceBytes),view=model.view.find((candidate:any)=>candidate.id==='containers')!;
 expect(digest).toBe('b6cc883738063075c31ee3c1e0e9f2fe484dc3e8538e2e9508fcd7fa2788b472');
 expect(source.id).toBe('visual:beacon-containers');expect(source.umf).toBe('0.10.0');expect(source.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(visual).toMatchObject({id:'beacon-containers',kind:'flow',form:'network',title:'Inside Beacon',question:'What runs inside Beacon?',takeaway:view.takeaway,audience:'developer'});
 expect(view.title).toBe(visual.title);expect(view.takeaway).toBe(visual.takeaway);
 expect(visual.source).toEqual({path:'umf:fixtures/visual/sources/beacon/architecture-model.toml',view:'containers',digest:'sha256:5506076ecd96344bd6b203c4d2a36ed983a7d9c37883c0e4dc65f9a59f689910'});
 expect(hash(modelBytes)).toBe('5506076ecd96344bd6b203c4d2a36ed983a7d9c37883c0e4dc65f9a59f689910');expect(modelText).toContain("A fictional system's architecture model");
 const selected=new Set(view.elements as string[]),elements=model.element.filter((element:any)=>selected.has(element.id));
 expect(visual.nodes?.map(node=>node.id)).toEqual(view.elements);
 expect(visual.nodes?.map(({id,label,detail,role,status})=>({id,label,...(detail===undefined?{}:{detail}),role,status}))).toEqual(elements.map((element:any)=>({id:element.id,label:element.name,...(element.detail===undefined?{}:{detail:element.detail}),role:element.kind==='store'?'store':element.owner==='platform'?'platform':'own',status:element.status})));
 expect(view.group.map((group:any)=>({id:group.id,label:group.label,members:group.elements}))).toEqual([
  {id:'app',label:'Beacon app',members:['web','api','drafter','worker','rules']},
  {id:'state',label:'Beacon data',members:['db','queue','files']},
 ]);
 expect(visual.groups?.map(({id,label,role})=>({id,label,role}))).toEqual(view.group.map((group:any)=>({id:group.id,label:group.label,role:'boundary'})));
 for(const group of view.group)expect(visual.nodes?.filter(node=>node.group===group.id).map(node=>node.id)).toEqual(group.elements);
 const relations=model.relation.filter((relation:any)=>selected.has(relation.from)&&selected.has(relation.to));
 expect(relations).toHaveLength(10);expect(visual.edges).toHaveLength(10);
 expect(visual.edges?.map(({id,from,to,label,kind,status,why})=>({id,from,to,label,...(kind===undefined?{}:{kind}),...(status===undefined?{}:{status}),...(why===undefined?{}:{why})}))).toEqual(relations.map((relation:any)=>({id:`${relation.from}--${relation.to}`,from:relation.from,to:relation.to,label:relation.label,...(relation.kind===undefined?{}:{kind:relation.kind}),...(relation.status===undefined?{}:{status:relation.status}),...(relation.why===undefined?{}:{why:relation.why})})));
 expect(visual.edges?.find(edge=>edge.id==='api--web')).toMatchObject({kind:'return',label:'returns the draft'});
 expect(visual.edges?.find(edge=>edge.id==='proxy--api')?.why).toBe('the API acts as the agent, never as a service account');
 expect(visual.edges?.find(edge=>edge.id==='api--rules')?.status).toBe('placeholder');expect(visual.edges?.find(edge=>edge.id==='api--files')?.status).toBe('unknown');
 expect(visual.nodes?.some(node=>['customer','agent','gateway','models'].includes(node.id))).toBe(false);
 expect(visual.steps).toBeUndefined();expect(visual.layout).toBeUndefined();expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 const json=readVisualDocument(sourceBytes.toString('utf8'),'json');expect(JSON.parse(writeVisualDocument(json,'json'))).toEqual(source);
 const yaml=writeVisualDocument(json,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');expect(getVisual(yamlRead)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
});

test('containers review binds and publishes original JSON plus the exact fictional TOML bytes',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(example=>example.id==='beacon-containers')!,digest=hash(sourceBytes),modelDigest=hash(modelBytes);
 expect(row).toMatchObject({id:'beacon-containers',title:'Inside Beacon',kind:'flow',form:'network',definitionPath:sourcePath,definitionSha256:digest});
 expect(row.sources).toEqual([
  {path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 source fixture supplies the selected view\'s IDs, details, roles, statuses, groups, relations, question, and takeaway.'},
  {path:modelPath,sha256:modelDigest,pointer:'/view/containers',label:'Fictional architecture-model source',description:'The exact checked-in TOML bytes identify the selected containers view and its elements, groups, and relations; the source labels the model fictional.'},
 ]);
 expect(row.publishedAssets).toEqual([
  {path:sourcePath,sha256:digest,outputPath:'reviews/beacon-containers/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:modelPath,sha256:modelDigest,outputPath:'reviews/beacon-containers/architecture-model.toml',mediaType:'application/toml',description:'Exact fictional architecture-model TOML bytes cited by the original fixture.'},
 ]);
 expect(row.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,documentId:'visual:beacon-containers',visualId:'beacon-containers',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/beacon-containers/authoritative-source.json',scope:'This exact UMF fixture JSON is the review definition. It retains all nine element IDs and their labels, details, roles and statuses for the selected `containers` view; both view groups and their explicit memberships; and all ten relations induced by endpoints in that view, including the return kind, `why` text, and placeholder/unknown statuses. Its title, question and takeaway remain source-authored. The exact architecture-model TOML is separately cited and downloadable; it labels itself fictional. No elements from other views or steps from journeys are added, and neither source asserts a deployed or current Beacon system.'});
 const verified=await verifyReviewSourceEvidence();expect(verified.examples).toBe(manifest.examples.length);
});

test('containers public plans map the exact nine selected nodes and ten induced relations without source mutation',()=>{
 const before=JSON.stringify(source),base='/extensions/umf.visual';
 for(const backend of ['graphviz','mermaid','lini'] as const){
  const plan=compilePresentation(source,{backend,theme:'presentation/1'});expect(plan.ok,backend).toBe(true);if(!plan.ok)continue;
  expect(plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(9);expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(10);
  for(const[index,node]of visual.nodes!.entries())expect(plan.elementMap).toContainEqual({logicalId:node.id,sourcePath:`${base}/nodes/${index}${backend==='lini'?'/id':''}`,nativeId:`n${index+1}`,kind:'node'});
  for(const[index,edge]of visual.edges!.entries())expect(plan.elementMap).toContainEqual({logicalId:edge.id,sourcePath:`${base}/edges/${index}`,nativeId:`e${index+1}`,kind:'edge'});
 }
 expect(JSON.stringify(source)).toBe(before);
});
