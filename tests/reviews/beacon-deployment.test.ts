// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/beacon-deployment.json';
const modelPath='fixtures/visual/sources/beacon/architecture-model.toml';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
const sourceBytes=readFileSync(sourcePath),source=read<Document>(sourcePath),visual=getVisual(source) as Visual;
const modelBytes=readFileSync(modelPath),modelText=modelBytes.toString('utf8'),model=Bun.TOML.parse(modelText) as any;

test('deployment fixture preserves the selected fictional view, zone memberships, tiers, and induced relations',()=>{
 const digest=hash(sourceBytes),modelDigest=hash(modelBytes),view=model.view.find((candidate:any)=>candidate.id==='deployment')!;
 expect(digest).toBe('7f94f529ed7350c9c5d49caedb93eddfcf56f5aa60f43e0557d8220d2c0ad14c');
 expect(modelDigest).toBe('5506076ecd96344bd6b203c4d2a36ed983a7d9c37883c0e4dc65f9a59f689910');
 expect(source.id).toBe('visual:beacon-deployment');expect(source.umf).toBe('0.10.0');expect(source.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(visual).toMatchObject({id:'beacon-deployment',kind:'flow',form:'zoned',title:view.title,question:'Where does everything run?',takeaway:view.takeaway,audience:'developer'});
 expect(visual.source).toEqual({path:'umf:fixtures/visual/sources/beacon/architecture-model.toml',view:'deployment',digest:`sha256:${modelDigest}`});
 const selected=new Set(view.elements as string[]),elements=model.element.filter((element:any)=>selected.has(element.id));
 expect(elements).toHaveLength(13);expect(visual.nodes).toHaveLength(13);expect(visual.nodes?.map(node=>node.id)).toEqual(view.elements);
 const role=(element:any)=>element.kind==='person'?'actor':element.kind==='container'?'own':element.kind==='store'?'store':element.owner==='platform'?'platform':element.kind==='system'?'own':'external';
 expect(visual.nodes?.map(({id,label,detail,role:nodeRole,status,group})=>({id,label,...(detail===undefined?{}:{detail}),role:nodeRole,status,group}))).toEqual(elements.map((element:any)=>({id:element.id,label:element.name,...(element.detail===undefined?{}:{detail:element.detail}),role:role(element),status:element.status,group:`zone-${element.zone.toLowerCase().replaceAll(' ','-')}`})));
 const zoneNames=[...new Set(elements.map((element:any)=>element.zone))] as string[];
 expect(visual.groups).toHaveLength(5);expect(visual.groups?.map(({id,label,detail,role:groupRole,tier})=>({id,label,...(detail===undefined?{}:{detail}),role:groupRole,tier}))).toEqual(zoneNames.map(zone=>{
  const members=elements.filter((element:any)=>element.zone===zone),caption=model.zone.find((candidate:any)=>candidate.name===zone)?.caption,tierValues=[...new Set<number>(members.map((element:any)=>element.tier as number))];
  expect(tierValues).toHaveLength(1);
  return{id:`zone-${zone.toLowerCase().replaceAll(' ','-')}`,label:zone,...(caption===undefined?{}:{detail:caption}),role:'zone',tier:tierValues[0]};
 }));
 const relations=model.relation.filter((relation:any)=>selected.has(relation.from)&&selected.has(relation.to));
 expect(relations).toHaveLength(15);expect(visual.edges).toHaveLength(15);
 expect(visual.edges?.map(({id,from,to,label,kind,status,why})=>({id,from,to,label,...(kind===undefined?{}:{kind}),...(status===undefined?{}:{status}),...(why===undefined?{}:{why})}))).toEqual(relations.map((relation:any)=>({id:`${relation.from}--${relation.to}`,from:relation.from,to:relation.to,label:relation.label,...(relation.kind===undefined?{}:{kind:relation.kind}),...(relation.status===undefined?{}:{status:relation.status}),...(relation.why===undefined?{}:{why:relation.why})})));
 expect(visual.edges?.find(edge=>edge.kind==='return')).toMatchObject({id:'api--web',from:'api',to:'web',label:'returns the draft'});
 expect(visual.edges?.find(edge=>edge.status==='unknown')).toMatchObject({id:'api--files',status:'unknown'});
 expect(visual.edges?.filter(edge=>edge.why)).toHaveLength(4);
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 const json=readVisualDocument(sourceBytes.toString('utf8'),'json');expect(JSON.parse(writeVisualDocument(json,'json'))).toEqual(source);
 const yaml=writeVisualDocument(json,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');expect(getVisual(yamlRead)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
});

test('deployment review binds and publishes the original fixture and exact fictional architecture model',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(example=>example.id==='beacon-deployment')!,digest=hash(sourceBytes),modelDigest=hash(modelBytes);
 expect(row).toMatchObject({id:'beacon-deployment',title:'Where Beacon runs',kind:'flow',form:'zoned',definitionPath:sourcePath,definitionSha256:digest});
 expect(row.sources).toEqual([
  {path:sourcePath,sha256:digest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies the selected deployment view\'s 13 node identities and fields, five zones with tiers, and 15 induced relations, including authored return, why, and unknown-status meaning.'},
  {path:modelPath,sha256:modelDigest,pointer:'/view/deployment',label:'Fictional architecture-model source',description:'The exact checked-in TOML bytes identify the selected deployment view and its elements, zone assignments, tiers, and relations; the source labels the model fictional.'},
 ]);
 expect(row.publishedAssets).toEqual([
  {path:sourcePath,sha256:digest,outputPath:'reviews/beacon-deployment/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:modelPath,sha256:modelDigest,outputPath:'reviews/beacon-deployment/architecture-model.toml',mediaType:'application/toml',description:'Exact fictional architecture-model TOML bytes cited by the original fixture.'},
 ]);
 expect(row.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:digest,documentId:'visual:beacon-deployment',visualId:'beacon-deployment',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/beacon-deployment/authoritative-source.json',scope:'This exact UMF fixture JSON is the review definition. It retains all thirteen node IDs, labels, details, roles, statuses, and five authored zones with tier ordering and present details; all fifteen relations induced by endpoints in the selected `deployment` view are preserved, including the return kind, `why` text, and unknown status. Title, question, takeaway, audience, and historical source locator remain source-authored. The exact architecture-model TOML is separately cited and downloadable; it labels itself fictional and supplies the selected elements\' zone assignments and tiers. No elements from other views or journey steps are added, and neither source establishes a deployed or current Beacon system.'});
 expect(await verifyReviewSourceEvidence()).toMatchObject({examples:manifest.examples.length});
});

test('deployment public plans map the exact zoned nodes, groups, and induced relations without source mutation',()=>{
 const before=JSON.stringify(source),base='/extensions/umf.visual';
 for(const backend of ['graphviz','mermaid','lini'] as const){
  const plan=compilePresentation(source,{backend,theme:'presentation/1'});expect(plan.ok,backend).toBe(true);if(!plan.ok)continue;
  expect(plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(13);expect(plan.elementMap.filter(item=>item.kind==='group')).toHaveLength(5);expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(15);
  for(const[index,node]of visual.nodes!.entries())expect(plan.elementMap).toContainEqual({logicalId:node.id,sourcePath:`${base}/nodes/${index}${backend==='lini'?'/id':''}`,nativeId:`n${index+1}`,kind:'node'});
  for(const[index,group]of visual.groups!.entries())expect(plan.elementMap).toContainEqual({logicalId:group.id,sourcePath:`${base}/groups/${index}`,nativeId:`g${index+1}`,kind:'group'});
  for(const[index,edge]of visual.edges!.entries())expect(plan.elementMap).toContainEqual({logicalId:edge.id,sourcePath:`${base}/edges/${index}`,nativeId:`e${index+1}`,kind:'edge'});
 }
 expect(JSON.stringify(source)).toBe(before);
});
