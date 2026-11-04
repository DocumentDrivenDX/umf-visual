// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/helix-overview-map.json';
const modelPath='fixtures/visual/sources/helix/architecture-model.toml';
const manifestPath='fixtures/reviews/review-sources.json';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=readFileSync(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,visual=getVisual(source) as Visual;
const modelBytes=readFileSync(modelPath),model=Bun.TOML.parse(modelBytes.toString('utf8')) as any;
const view=model.view.find((candidate:any)=>candidate.id==='request')!;
const journey=model.journey.find((candidate:any)=>candidate.id===view.journey)!;
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='helix-overview-map')!;
const roleFor=(kind:string)=>kind==='person'?'actor':kind==='external'?'external':kind==='container'?'own':kind==='store'?'store':undefined;

test('HELIX overview map exactly projects the request journey and keeps context relations separate',()=>{
 const sourceDigest=sha(sourceBytes),modelDigest=sha(modelBytes);
 expect(sourceDigest).toBe('06832538099d4b46334b6cb43bc0b674f4a2038924fe825c55ac427e2017e048');
 expect(modelDigest).toBe('6e13adabec034747ed6d5505668e1daef353a3df6d2c54f3e4ff799cb92acff2');
 expect(source).toMatchObject({id:'visual:helix-overview-map',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(view).toMatchObject({id:'request',type:'journey',journey:'request',elements:[]});
 expect(journey).toMatchObject({id:'request',title:'A request becomes a governing document',takeaway:'The runtime acts; HELIX gives it the scope, the shape, and the record.'});
 expect(visual).toMatchObject({id:'helix-overview-map',kind:'flow',form:'pipeline',title:journey.title,question:"How does a team's request become a project document?",takeaway:journey.takeaway,audience:'developer'});
 expect(visual.source).toEqual({path:'helix:docs/helix/02-design/architecture-model.toml',view:'request',digest:`sha256:${modelDigest}`});
 const journeySteps=journey.step as any[];
 expect(journeySteps).toHaveLength(6);expect(visual.steps).toHaveLength(6);expect(visual.edges).toHaveLength(6);
 expect(visual.edges!.map(({id,from,to,label,kind,why,status,evidence})=>({id,from,to,label,kind,why,status,evidence}))).toEqual(journeySteps.map((step,index)=>({id:`${step.from}--${step.to}`,from:step.from,to:step.to,label:step.label,kind:index===5?'return':undefined,why:undefined,status:undefined,evidence:undefined})));
 expect(visual.steps!.map(({id,title,caption,focus,when,tag})=>({id,title,caption,focus,when,tag}))).toEqual(journeySteps.map((step,index)=>({id:`s${index+1}`,title:step.label[0].toUpperCase()+step.label.slice(1),caption:undefined,focus:[`${step.from}--${step.to}`],when:undefined,tag:undefined})));
 const firstSeenNodeIds=[...new Set(journeySteps.flatMap(step=>[step.from,step.to]))] as string[];
 expect(firstSeenNodeIds).toEqual(visual.nodes!.map(node=>node.id));expect(visual.nodes).toHaveLength(6);
 const modelNodes=firstSeenNodeIds.map(id=>model.element.find((element:any)=>element.id===id));
 expect(visual.nodes?.map(({id,label,detail,role,status,evidence})=>({id,label,detail,role,status,evidence}))).toEqual(modelNodes.map((element:any)=>({id:element.id,label:element.name,detail:element.detail,role:roleFor(element.kind),status:element.status,evidence:element.evidence})));
 expect(model.element.some((element:any)=>element.id==='documentor')).toBe(true);expect(firstSeenNodeIds).not.toContain('documentor');
 expect(visual.groups).toBeUndefined();expect(visual.omissions).toBeUndefined();
 const contextRelations=model.relation as any[];
 expect(contextRelations).toHaveLength(7);expect(contextRelations.some(relation=>typeof relation.note==='string')).toBe(true);
 expect(visual.edges?.every(edge=>edge.why===undefined&&edge.status===undefined&&edge.evidence===undefined)).toBe(true);
 expect(visual.steps?.every(step=>step.caption===undefined)).toBe(true);
 expect(contextRelations.find(relation=>relation.from==='docs'&&relation.to==='runtime')).toMatchObject({label:'governs execution',why:'spec is the contract',step:6});
 expect(visual.edges?.at(-1)).toMatchObject({from:'docs',to:'runtime',label:'governs what runs next',kind:'return'});
 expect(contextRelations.find(relation=>relation.from==='runtime'&&relation.to==='documentor')).toMatchObject({why:'optional host tooling'});
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(source),parsed=readVisualDocument(sourceBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(parsed,'json'))).toEqual(source);
 const yaml=writeVisualDocument(parsed,'yaml'),yamlParsed=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlParsed)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlParsed,'json'))).toEqual(source);
 const payload=visualPayloadYaml(source);for(const node of visual.nodes??[])expect(payload).toContain(node.label);for(const step of visual.steps??[])expect(payload).toContain(step.title);
 expect(JSON.stringify(source)).toBe(before);expect(sha(readFileSync(sourcePath))).toBe(sourceDigest);expect(sha(readFileSync(modelPath))).toBe(modelDigest);
});

test('HELIX overview-map review publishes the exact fixture and cited architecture model',async()=>{
 const sourceDigest=sha(sourceBytes),modelDigest=sha(modelBytes);
 const scope="The exact Visual 1.0.0 fixture remains unchanged and is published byte-for-byte. The cited architecture-model TOML bytes match the fixture digest exactly. The request view has `type: journey` and points to journey `request`; that journey's six ordered endpoint/label steps, title, and takeaway match the fixture's six edge labels/endpoints, six Visual step titles/focus IDs, title, and takeaway. Node IDs, labels, details, role/status/evidence map to first-seen journey endpoints and their source element records. Visual edge and step IDs are fixture projections. The final `kind: return` is a Visual flow projection for the final docs-to-runtime edge, not a literal field on the journey step. The separate context-view relations, their why/status/evidence/notes, and element job descriptions are not merged into this selected journey; neither are the journey's separate labels replaced with relation labels. The question, audience, omissions, and flow/pipeline vocabulary are fixture-authored. Source metadata outside the request journey remains inspectable in the published exact TOML snapshot; no current deployment/runtime claim is made.";
 expect(review).toMatchObject({id:'helix-overview-map',title:'A request becomes a governing document',kind:'flow',form:'pipeline',definitionPath:sourcePath,definitionSha256:sourceDigest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies six ordered request-journey edges and focus steps, node identities/details/evidence, the return kind projection, omissions, question, and source locator.'},
  {path:modelPath,sha256:modelDigest,pointer:'/view/request, /journey/request and its steps, selected /element records',label:'Cited HELIX architecture model',originalLocator:'helix:docs/helix/02-design/architecture-model.toml',resolvedSource:'helix/docs/helix/02-design/architecture-model.toml',description:'Exact TOML bytes resolved from the fixture locator. The request view identifies a separate journey; that journey supplies its title/takeaway and six ordered from/to/label steps. First-seen endpoints select the corresponding source element records for node labels/details/kinds/status/evidence.'}
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/helix-overview-map/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:modelPath,sha256:modelDigest,outputPath:'reviews/helix-overview-map/architecture-model.toml',mediaType:'application/toml',description:'Exact cited architecture-model TOML bytes published without transformation.'}
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:helix-overview-map',visualId:'helix-overview-map',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/helix-overview-map/authoritative-source.json',scope});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
