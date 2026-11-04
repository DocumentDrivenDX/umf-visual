// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual,type VisualCardinality} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/tpl-sd-domain.json';
const definitionPath='fixtures/reviews/definitions/tpl-sd-domain.json';
const examplePath='fixtures/visual/sources/helix/solution-design-example.md';
const manifestPath='fixtures/reviews/review-sources.json';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=readFileSync(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,visual=getVisual(source) as Visual;
const definitionBytes=readFileSync(definitionPath),definition=readVisualDocument(definitionBytes.toString('utf8'),'json') as Document,reviewed=getVisual(definition) as Visual;
const exampleBytes=readFileSync(examplePath),example=exampleBytes.toString('utf8');
const heading='## Domain Model';
const headingIndex=example.indexOf(heading);
if(headingIndex<0)throw new Error('Cited solution-design example has no Domain Model section.');
const domainSection=example.slice(headingIndex).match(/^## Domain Model\s*\n([\s\S]*?)(?=^##\s)/mu)?.[1];
if(!domainSection)throw new Error('Cited solution-design example has no bounded Domain Model content.');
const diagram=domainSection.match(/```mermaid\s*\n([\s\S]*?)\n```/u)?.[1];
if(!diagram)throw new Error('Domain Model section has no ER diagram.');
const sourceReferences=[...diagram.matchAll(/^\s*([A-Z_]+)\s+(\|\|)--(o\{|\|\{)\s+([A-Z_]+)\s*:\s*(.*?)\s*$/gmu)].map(([,from,fromSymbol,toSymbol,to,label])=>({from:from!.toLowerCase(),to:to!.toLowerCase(),label:label!,fromCardinality:(fromSymbol==='||'?'exactly-one':'zero-or-one') as VisualCardinality,toCardinality:(toSymbol==='o{'?'zero-or-many':'one-or-many') as VisualCardinality}));
const rulesHeading='### Business Rules';
const rulesStart=domainSection.indexOf(rulesHeading);
const rulesSection=rulesStart<0?undefined:domainSection.slice(rulesStart+rulesHeading.length).replace(/^\s*\n/u,'');
if(!rulesSection)throw new Error('Domain Model section has no Business Rules subsection.');
const ruleLines=rulesSection.split(/\r?\n/u),sourceRules:string[]=[];
for(const line of ruleLines){
 const item=line.match(/^\s*\d+\.\s+\*\*(.+?)\*\*:\s*(.*)$/u);
 if(item){sourceRules.push(`${item[1]}: ${item[2]}`);continue;}
 if(sourceRules.length&&/^\s{2,}\S/u.test(line))sourceRules[sourceRules.length-1]+=` ${line.trim()}`;
}
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='tpl-sd-domain')!;

test('Domain Model preserves source entities, endpoint cardinalities, and its exact scoped business rules',()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),exampleDigest=sha(exampleBytes);
 expect(sourceDigest).toBe('b054796bb6031693eb3df54ff03cc7b27fb2ad8fa4ba90bd66f7f36573bd6471');
 expect(definitionDigest).toBe('2747f32a57d749413a6f74da0cd73765596ea438e573aa5ada1c101e1f1ffba7');
 expect(exampleDigest).toBe('5fac95cb298eb6534f2622aff81438c9e144954f3d8760694ff039360e120ab2');
 expect(source).toMatchObject({id:'visual:tpl-sd-domain',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'tpl-sd-domain',kind:'structure',form:'entities',title:'Domain Model',question:'What does the import domain hold?'});
 expect(visual.source).toEqual({path:'helix:workflows/activities/02-design/artifacts/solution-design/example.md',view:'Domain Model',digest:`sha256:${exampleDigest}`});
 expect([...diagram.matchAll(/\b([A-Z_]+)\b/gmu)].length).toBeGreaterThan(0);
 const entityIds=['client','import_session','import_file','source_row','mapping_profile','validation_result','match_evidence'];
 expect(visual.nodes?.map(({id,label})=>({id,label}))).toEqual([
  {id:'client',label:'Client'},{id:'import_session',label:'Import Session'},{id:'import_file',label:'Import File'},
  {id:'source_row',label:'Source Row'},{id:'mapping_profile',label:'Mapping Profile'},
  {id:'validation_result',label:'Validation Result'},{id:'match_evidence',label:'Match Evidence'}
 ]);
 expect(entityIds).toEqual((visual.structure?.entities??[]).map(entity=>entity.node));
 expect(visual.structure?.entities?.every(entity=>entity.fields.length===0)).toBe(true);
 expect(visual.omissions).toEqual(["The example's entity diagram lists no fields."]);
 expect(sourceReferences).toEqual([
  {from:'client',to:'import_session',label:'owns',fromCardinality:'exactly-one',toCardinality:'zero-or-many'},
  {from:'import_session',to:'import_file',label:'contains',fromCardinality:'exactly-one',toCardinality:'one-or-many'},
  {from:'import_session',to:'source_row',label:'accepts',fromCardinality:'exactly-one',toCardinality:'zero-or-many'},
  {from:'client',to:'mapping_profile',label:'saves',fromCardinality:'exactly-one',toCardinality:'zero-or-many'},
  {from:'import_file',to:'validation_result',label:'produces',fromCardinality:'exactly-one',toCardinality:'zero-or-many'},
  {from:'source_row',to:'match_evidence',label:'supports',fromCardinality:'exactly-one',toCardinality:'zero-or-many'}
 ]);
 expect((visual.structure?.references??[]).map(({from,to,label,fromCardinality,toCardinality})=>({from:from.node,to:to.node,label,fromCardinality,toCardinality}))).toEqual(sourceReferences);
 expect(sourceRules).toEqual([
  'Required source pair: A draft import session is not ready for mapping until it has one bank CSV and one invoice CSV.',
  'Mapping before import: Accepted rows cannot be committed until required mappings exist for amount, date, and source identifier.',
  'Validation before matching: Match suggestions cannot be created until the reviewer confirms an import summary.',
  'Traceability preservation: Every accepted row must retain file identity, row number, source identifier, normalized amount, and normalized date.'
 ]);
 expect(reviewed.annotations).toEqual(sourceRules.map((text,index)=>({id:`domain-rule-${index+1}`,text})));
 expect(reviewed.structure).toEqual(visual.structure);expect(reviewed.nodes).toEqual(visual.nodes);expect(reviewed.omissions).toEqual(visual.omissions);
 const expected=structuredClone(source) as any;expected.vocabularies['umf.visual'].version='1.4.0';expected.extensions['umf.visual'].annotations=sourceRules.map((text,index)=>({id:`domain-rule-${index+1}`,text}));
 expect(definition).toEqual(expected);
 expect(definition.id).toBe(source.id);expect(definition.umf).toBe(source.umf);
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});expect(inspectVisual(definition)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(source),parsed=readVisualDocument(sourceBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(parsed,'json'))).toEqual(source);
 const yaml=writeVisualDocument(definition,'yaml'),yamlParsed=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlParsed)).toEqual(reviewed);expect(JSON.parse(writeVisualDocument(yamlParsed,'json'))).toEqual(definition);
 const payload=visualPayloadYaml(definition);for(const node of reviewed.nodes??[])expect(payload).toContain(node.label);for(const annotation of reviewed.annotations??[])expect(payload).toContain(annotation.text);
 expect(JSON.stringify(source)).toBe(before);expect(sha(readFileSync(sourcePath))).toBe(sourceDigest);expect(sha(readFileSync(definitionPath))).toBe(definitionDigest);expect(sha(readFileSync(examplePath))).toBe(exampleDigest);
});

test('solution-design domain review binds the exact fixture and cited historical Markdown',async()=>{
 const sourceDigest=sha(sourceBytes),definitionDigest=sha(definitionBytes),exampleDigest=sha(exampleBytes);
 const scope="The exact original Visual 1.0.0 fixture remains unchanged and is published byte-for-byte. The separate reviewed Visual 1.4.0 definition preserves all seven entity IDs/labels/order, empty fields, six reference IDs/endpoints/labels/cardinalities, no-fields omission, title/question, and source metadata; it upgrades only the vocabulary version and adds four exact Business Rules as annotations. The selected ER diagram has no fields or key declarations; none are invented, and the 'one bank CSV and one invoice CSV' readiness rule does not change the relationship cardinalities. The fixture's reference IDs and structure vocabulary are Visual projections. The child Business Rules subsection is included because it belongs to the selected Domain Model; System Decomposition and later material are not merged into it. The source digest matches HELIX commit ab76e319f7a98d5df8417d6f16bbd5791c356271.";
 expect(review).toMatchObject({id:'tpl-sd-domain',title:'Domain Model',kind:'structure',form:'entities',definitionPath,definitionSha256:definitionDigest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact original Visual 1.0.0 fixture supplies seven entity identities/labels with empty field lists, six labeled references and endpoint cardinalities, an explicit no-fields omission, title/question, and the cited solution-design example locator.'},
  {path:examplePath,sha256:exampleDigest,pointer:'Domain Model ER diagram and child Business Rules section',label:'Cited HELIX solution-design example',originalLocator:'helix:workflows/activities/02-design/artifacts/solution-design/example.md',resolvedSource:'helix/workflows/activities/02-design/artifacts/solution-design/example.md',observedRevision:'ab76e319f7a98d5df8417d6f16bbd5791c356271',description:'Exact Markdown bytes resolved from the fixture locator at the recorded HELIX commit. The Domain Model ER diagram supplies seven entities and six relationship/cardinality pairs and contains no entity fields. Its child Business Rules subsection adds four domain constraints, captured as annotations without manufacturing fields or tightening ER cardinalities. The following System Decomposition section is outside the selected scope.'}
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/tpl-sd-domain/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:examplePath,sha256:exampleDigest,outputPath:'reviews/tpl-sd-domain/solution-design-example.md',mediaType:'text/markdown',description:'Exact historical solution-design example bytes resolved from the fixture locator.'}
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:tpl-sd-domain',visualId:'tpl-sd-domain',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/tpl-sd-domain/authoritative-source.json',scope});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
