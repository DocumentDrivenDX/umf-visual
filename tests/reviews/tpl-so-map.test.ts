// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/tpl-so-map.json';
const definitionPath='fixtures/reviews/definitions/tpl-so-map.json';
const markdownPath='fixtures/visual/sources/helix/tpl-so-map-example.md';
const manifestPath='fixtures/reviews/review-sources.json';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const normalized=(value:string)=>value.replace(/\s+/gu,' ').trim();
const sourceBytes=readFileSync(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,original=getVisual(source) as Visual;
const definitionBytes=readFileSync(definitionPath),definition=readVisualDocument(definitionBytes.toString('utf8'),'json') as Document,reviewed=getVisual(definition) as Visual;
const markdownBytes=readFileSync(markdownPath),markdown=markdownBytes.toString('utf8');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='tpl-so-map')!;
const expectedAnnotations=[
 'The shaded region identifies HELIX-owned content. Dashed arrows show guidance or constraints; solid arrows show actions or information. The catalog summarizes templates, prompts, metadata, and mode contracts. Repository paths and omitted packaging/validation mechanics remain in the adjacent reference material.',
 'Arrows describe information or actions; boxes are content or actors, not running services.',
 'The runtime provides model access, file operations, execution, and source control. HELIX supplies portable Markdown and YAML content plus one routing skill. A request to plan does not authorize implementation.'
];

test('TPL system map keeps its original fixture and adds only selected source prose and direction',()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),markdownDigest=sha(markdownBytes);
 expect(sourceDigest).toBe('09b7ec44040a73a7789c021e84e449622f6b845bce2583ea3e2c3a60ed1d3096');
 expect(markdownDigest).toBe('88d89ce44e5e77f273d1d352915ace98f143e2723de31932b8ab18dd37eeeb9b');
 expect(source).toMatchObject({id:'visual:tpl-so-map',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(original).toMatchObject({id:'tpl-so-map',kind:'flow',form:'lanes',title:'System map',question:'How does a request move between the team, the runtime and HELIX?',source:{path:'helix:workflows/activities/02-design/artifacts/solution-overview/example.md',view:'System map',digest:`sha256:${markdownDigest}`}});
 expect(markdown).toContain('## System map');
 expect(markdown).toContain('flowchart LR');
 for(const annotation of expectedAnnotations)expect(normalized(markdown)).toContain(normalized(annotation));
 expect(reviewed).toMatchObject({id:original.id,kind:original.kind,form:original.form,title:original.title,question:original.question,source:original.source,groups:original.groups,nodes:original.nodes,edges:original.edges,omissions:original.omissions,layout:{kind:'flow',direction:'LR'}});
 expect(reviewed.annotations?.map(annotation=>annotation.text)).toEqual(expectedAnnotations);
 expect(reviewed.edges?.every(edge=>edge.kind===undefined)).toBe(true);
 const expectedDefinition=structuredClone(source) as any,expectedVisual=expectedDefinition.extensions['umf.visual'];
 expectedDefinition.vocabularies['umf.visual'].version='1.4.0';
 expectedVisual.layout={kind:'flow',direction:'LR'};
 expectedVisual.annotations=expectedAnnotations.map((text,index)=>({id:['system-map-legend','system-map-actors','system-map-responsibilities'][index],text}));
 expect(definition).toEqual(expectedDefinition);
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 expect(inspectVisual(definition)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(source),yaml=writeVisualDocument(definition,'yaml'),yamlDocument=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlDocument)).toEqual(reviewed);
 expect(JSON.parse(writeVisualDocument(yamlDocument,'json'))).toEqual(definition);
 const payload=visualPayloadYaml(definition);for(const annotation of expectedAnnotations)expect(normalized(payload)).toContain(normalized(annotation));
 expect(JSON.stringify(source)).toBe(before);
 expect(sha(readFileSync(sourcePath))).toBe(sourceDigest);
 expect(sha(readFileSync(definitionPath))).toBe(definitionDigest);
 expect(sha(readFileSync(markdownPath))).toBe(markdownDigest);
});

test('TPL system-map review binds exact fixture and cited Markdown bytes',async()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),markdownDigest=sha(markdownBytes);
 const scope="The original Visual 1.0.0 fixture remains unchanged and is published byte-for-byte. The separate reviewed Visual 1.4.0 definition preserves the original envelope, visual ID, title, question, four lane groups, six nodes, six directed labeled edges, omissions and source metadata. It adds `layout: flow/LR` from the selected Mermaid `flowchart LR`, and preserves three exact selected-section prose paragraphs as annotations: the ownership/arrow/catalog/adjacent-reference legend, the statement that arrows describe information or actions and boxes are content or actors rather than running services, and the runtime-versus-HELIX responsibility/planning-authorization paragraph. The shaded-region statement is retained as text only; no group ownership is inferred from the referenced image. The global dashed/solid legend is retained as text only; no individual edge kind is inferred. The catalog label already summarizes templates, prompts, metadata and mode contracts. Other sections such as Parts and boundaries, Critical flows, Vocabulary and reading path, and Maintenance are outside this selected System map view. No present-day runtime or deployment claim is made.";
 expect(review).toMatchObject({id:'tpl-so-map',title:'System map',kind:'flow',form:'lanes',definitionPath,definitionSha256:definitionDigest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'Exact original Visual 1.0.0 fixture with four lanes, six nodes, six directed labeled edges, authored omissions, question, title and source locator.'},
  {path:markdownPath,sha256:markdownDigest,pointer:'selected `## System map` prose and Mermaid block',label:'Cited HELIX solution-overview example',originalLocator:'helix:workflows/activities/02-design/artifacts/solution-overview/example.md',resolvedSource:'helix/workflows/activities/02-design/artifacts/solution-overview/example.md',description:'Exact Markdown bytes resolved from the fixture locator. The selected System map supplies a left-to-right Mermaid direction and the exact explanatory paragraphs retained as unanchored annotations; no per-edge kind assignment is stated by its global arrow legend.'}
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/tpl-so-map/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:markdownPath,sha256:markdownDigest,outputPath:'reviews/tpl-so-map/solution-overview-example.md',mediaType:'text/markdown',description:'Exact cited HELIX Markdown bytes published without transformation.'}
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:tpl-so-map',visualId:'tpl-so-map',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/tpl-so-map/authoritative-source.json',scope});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
