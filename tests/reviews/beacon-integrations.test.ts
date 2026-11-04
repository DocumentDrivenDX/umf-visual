// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/beacon-integrations.json';
const modelPath='fixtures/visual/sources/beacon/architecture-model.toml';
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
const sourceBytes=readFileSync(sourcePath),source=read<Document>(sourcePath),sourceVisual=getVisual(source) as Visual;
const modelBytes=readFileSync(modelPath),modelText=modelBytes.toString('utf8'),model=Bun.TOML.parse(modelText) as any;
const view=model.view.find((candidate:any)=>candidate.id==='integrations')!;

test('integrations source fixture preserves its exact visual fields and explicit source view',()=>{
 expect(hash(sourceBytes)).toBe('a2b4557ec0b86402e4da4a9195743e106af2d91ef216396b9a81534e382e539b');
 expect(hash(modelBytes)).toBe('5506076ecd96344bd6b203c4d2a36ed983a7d9c37883c0e4dc65f9a59f689910');
 expect(source).toMatchObject({id:'visual:beacon-integrations',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(sourceVisual).toMatchObject({id:'beacon-integrations',kind:'flow',form:'network',title:'What Beacon calls outside',question:'What does Beacon call outside?',takeaway:'Only the API and the drafter call out, and each call has one job.',audience:'developer'});
 expect(sourceVisual.source).toEqual({path:`umf:${modelPath}`,view:'integrations',digest:`sha256:${hash(modelBytes)}`});
 expect(modelText).toContain("A fictional system's architecture model");
 expect(view.title).toBe(sourceVisual.title);expect(view.takeaway).toBe(sourceVisual.takeaway);
 expect(sourceVisual.nodes?.map(node=>node.id)).toEqual(view.elements);
 const selected=new Set<string>(view.elements),elements=model.element.filter((element:any)=>selected.has(element.id));
 const role=(element:any)=>element.kind==='container'?'own':element.owner==='platform'?'platform':'external';
 const projectedElements=elements.map((element:any)=>({id:element.id,label:element.name,...(element.detail===undefined?{}:{detail:element.detail}),role:role(element),status:element.status,...(view.group.find((group:any)=>group.elements.includes(element.id))?{group:view.group.find((group:any)=>group.elements.includes(element.id)).id}:{})}));
 expect(sourceVisual.nodes?.map(({id,label,detail,role:nodeRole,status,group})=>({id,label,...(detail===undefined?{}:{detail}),role:nodeRole,status,...(group===undefined?{}:{group})}))).toEqual(projectedElements);
 expect(sourceVisual.groups?.map(({id,label,role:groupRole})=>({id,label,role:groupRole,members:view.group.find((group:any)=>group.id===id)?.elements}))).toEqual(view.group.map((group:any)=>({id:group.id,label:group.label,role:'boundary',members:group.elements})));
 const relations=model.relation.filter((relation:any)=>selected.has(relation.from)&&selected.has(relation.to));
 expect(relations).toHaveLength(6);expect(sourceVisual.edges).toHaveLength(6);
 expect(sourceVisual.edges?.map(({id,from,to,label,why})=>({id,from,to,label,...(why===undefined?{}:{why})}))).toEqual(relations.map((relation:any)=>({id:`${relation.from}--${relation.to}`,from:relation.from,to:relation.to,label:relation.label,...(relation.why===undefined?{}:{why:relation.why})})));
 expect(sourceVisual.steps).toBeUndefined();
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 const json=readVisualDocument(sourceBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(json,'json'))).toEqual(source);
 const yaml=writeVisualDocument(json,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(sourceVisual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(source);
});

test('integrations review binds exact original UMF and fictional TOML bytes without inventing source facts',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(item=>item.id==='beacon-integrations')!;
 const sourceDigest=hash(sourceBytes),modelDigest=hash(modelBytes);
 expect(row).toMatchObject({id:'beacon-integrations',title:'What Beacon calls outside',kind:'flow',form:'network',definitionPath:sourcePath,definitionSha256:sourceDigest});
 expect(row.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 source fixture supplies six node identities and fields, one authored boundary group, and six directed relations induced by the selected endpoints.'},
  {path:modelPath,sha256:modelDigest,pointer:'/view/integrations',label:'Fictional architecture-model source',description:'The exact checked-in TOML bytes explicitly define the integrations view, its six elements and one group, plus the source relations between selected endpoints; the source labels the model fictional.'},
 ]);
 expect(row.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/beacon-integrations/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:modelPath,sha256:modelDigest,outputPath:'reviews/beacon-integrations/architecture-model.toml',mediaType:'application/toml',description:'Exact fictional architecture-model TOML bytes cited by the original UMF fixture.'},
 ]);
 expect(row.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:beacon-integrations',visualId:'beacon-integrations',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/beacon-integrations/authoritative-source.json',scope:'This exact UMF fixture is the review definition. It preserves the six elements explicitly selected by the `integrations` view, their authored fields, the explicit process boundary group containing api and drafter, and the six relations induced by selected endpoints. The source TOML explicitly defines that view, its element list and group; it does not define a deployed system. The originating architecture-model source identifies itself as fictional; neither file establishes current state or deployment.'});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
