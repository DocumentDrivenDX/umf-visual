// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {inspectVisual,type Visual} from '../../src';
import type {Document} from '@umf/core';
import {parse as parseYaml} from 'yaml';

type SourceRef={path:string;sha256:string;originPath:string;originSha256:string;pointer:string;description:string;originRepository?:string;originCommit?:string;originTag?:string;originTagObject?:string};
type ShowcaseExample={id:string;title:string;description:string;kind:Visual['kind'];form:Visual['form'];definitionPath:string;definitionSha256:string;sources:SourceRef[];publishedAssets?:Array<{path:string;sha256:string;outputPath:string;mediaType?:string;description?:string}>};
const root=process.cwd();
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const normalizedSourceText=(value:string)=>value.replace(/\s+/gu,' ').trim();
const read=(path:string)=>readFileSync(resolve(root,path));
const manifest=JSON.parse(readFileSync(resolve(root,'fixtures/showcase/showcase-sources.json'),'utf8')) as {schemaVersion:number;examples:ShowcaseExample[]};
const document=(example:ShowcaseExample)=>JSON.parse(read(example.definitionPath).toString('utf8')) as Document;
const visual=(doc:Document)=>doc.extensions?.['umf.visual'] as unknown as Visual;

test('showcase examples are isolated from the frozen 53-example interchange inventory',()=>{
 expect(manifest.schemaVersion).toBe(1);
 expect(manifest.examples.map(example=>example.id)).toEqual([
  'umf-engine-target-architecture',
  'umf-native-interchange-architecture','umf-architecture-stack','umf-logical-metamodel','beacon-relational-core','umf-logical-interface-architecture',
  'lini-gallery-checkout-sequence','lini-gallery-product-mindmap','lini-gallery-commerce-entities'
 ]);
 expect(new Set(manifest.examples.map(example=>example.id)).size).toBe(9);
 expect(manifest.examples.every(example=>example.definitionPath.startsWith('fixtures/showcase/definitions/'))).toBe(true);
});

test('definition and source snapshots have exact pinned bytes and valid complete visual DSL',()=>{
 for(const example of manifest.examples){
  const definitionBytes=read(example.definitionPath);
  expect(hash(definitionBytes),example.id+' definition digest').toBe(example.definitionSha256);
  expect(example.definitionSha256).toMatch(/^[0-9a-f]{64}$/u);
  expect(example.sources.length).toBeGreaterThan(0);
  for(const source of example.sources){
   expect(source.path.startsWith('fixtures/')).toBe(true);
   expect(source.path.split('/').includes('..')).toBe(false);
   expect(source.sha256).toMatch(/^[0-9a-f]{64}$/u);
   expect(hash(read(source.path)),example.id+' source '+source.path).toBe(source.sha256);
   expect(source.originPath.length).toBeGreaterThan(0);
   expect(source.originSha256).toMatch(/^[0-9a-f]{64}$/u);
   expect(source.originSha256,example.id+' origin snapshot '+source.path).toBe(source.sha256);
   expect(source.pointer.length).toBeGreaterThan(0);
   expect(source.description.length).toBeGreaterThan(0);
   if(source.originRepository==='monfa-red/lini'){
    expect(source.originCommit).toBe('0502d381dbd779d72b2ac4329a19b64201422a21');
    expect(source.originTag).toBe('v1.1.0');
    expect(source.originTagObject).toBe('54872af4a4186fc0a621864f7ba8faa087e55b1e');
   }
  }
  const doc=document(example),v=visual(doc),checked=inspectVisual(doc);
  expect(v.kind,example.id).toBe(example.kind);
  expect(v.form,example.id).toBe(example.form);
  expect(checked.valid,JSON.stringify(checked.diagnostics)).toBe(true);
  expect(checked.complete,JSON.stringify(checked.diagnostics)).toBe(true);
 }
});

test('the three pinned Lini gallery examples preserve only their authored semantics',()=>{
 const sequenceExample=manifest.examples.find(row=>row.id==='lini-gallery-checkout-sequence')!;
 const sequenceDoc=document(sequenceExample),sequence=visual(sequenceDoc).sequence!;
 expect(sequenceDoc.vocabularies['umf.visual']?.version).toBe('1.3.0');
 expect(sequence.participants.map(participant=>participant.label)).toEqual(['user','Storefront','Payments','Orders']);
 expect(sequence.participants.map(participant=>participant.shape)).toEqual([undefined,'rectangle','rectangle','parallelogram']);
 expect(sequence.participants[0]?.icon).toBe('user');
 expect(sequence.messages.map(message=>[message.label,message.from,message.to,message.kind,message.group])).toEqual([
  ['place order','user','shop','call',undefined],['charge $42','shop','pay','call',undefined],['verify card','pay','pay','call',undefined],['receipt','pay','shop','return',undefined],
  ['reserve stock','shop','db','call','each-item'],['in stock','db','shop','return','each-item'],['order #1024','shop','user','return',undefined],['track parcel','user','shop','async',undefined]
 ]);
 expect(sequence.notes).toEqual([{id:'checkout-note',text:'starts checkout',participants:['user'],before:'place-order'}]);
 expect(visual(sequenceDoc).groups?.map(group=>[group.id,group.label,group.role])).toEqual([['each-item','each item','loop']]);
 expect(read(sequenceExample.sources[0]!.path).toString('utf8')).toContain('user ~> shop "track parcel"');

 const mindmapExample=manifest.examples.find(row=>row.id==='lini-gallery-product-mindmap')!;
 const mindmapDoc=document(mindmapExample),mindmap=visual(mindmapDoc);
 expect(mindmapDoc.vocabularies['umf.visual']?.version).toBe('1.3.0');
 expect(mindmap.nodes).toHaveLength(19);
 expect(mindmap.nodes?.[0]).toMatchObject({id:'product-vision',label:'Product Vision'});
 expect(mindmap.layout).toEqual({kind:'tree',direction:'bilateral',order:['product-vision']});
 expect(mindmap.nodes?.filter(node=>node.parent==='product-vision').map(node=>node.label)).toEqual([
  'Shipping cadence','Build quality','Learning loop','Planning','Team','Customer care'
 ]);
 expect(mindmap.nodes?.filter(node=>node.parent!==undefined).map(node=>node.label)).toEqual([
  'Shipping cadence','Weekly release train','Feature flags gate the risky work','Build quality','Snapshot tests on every output','Zero clippy debt',
  'Learning loop','Dogfood the tool daily','User interviews every sprint','Planning','One-page specs before code','Stages sized for one session',
  'Team','Small and senior','Ownership over process','Customer care','Support rotations','Bug fixes beat features'
 ]);
 expect(mindmap.nodes?.filter(node=>node.icon).map(node=>[node.label,node.icon])).toEqual([
  ['Shipping cadence','rocket'],['Build quality','seal'],['Planning','presentation'],['Customer care','heart']
 ]);
 const mindmapSource=read(mindmapExample.sources[0]!.path).toString('utf8');
 for(const topic of ['Product Vision','Weekly release train','Feature flags gate the risky work','Snapshot tests on every output','Zero clippy debt','Dogfood the tool daily','User interviews every sprint','One-page specs before code','Stages sized for one session','Small and senior','Ownership over process','Support rotations','Bug fixes beat features'])expect(mindmapSource).toContain(topic);

 const commerceExample=manifest.examples.find(row=>row.id==='lini-gallery-commerce-entities')!;
 const commerceDoc=document(commerceExample),commerce=visual(commerceDoc);
 expect(commerceDoc.vocabularies['umf.visual']?.version).toBe('1.3.0');
 expect(commerce.nodes?.map(node=>node.label)).toEqual(['User','Order','LineItem','Product','Cart','Category']);
 expect(commerce.layout).toEqual({kind:'grid',columns:3,order:['user','order','item','product','cart','category']});
 const fields=new Map(commerce.structure!.entities!.map(entity=>[entity.node,entity.fields]));
 expect(fields.get('user')?.map(field=>[field.name,field.type,field.keys])).toEqual([
  ['id','int',['pk']],['name','varchar',undefined],['email','varchar',undefined]
 ]);
 expect(fields.get('order')?.map(field=>[field.name,field.type,field.keys])).toEqual([
  ['id','int',['pk']],['user_id','int',['fk']],['total','decimal',undefined]
 ]);
 expect(fields.get('item')?.map(field=>[field.name,field.type,field.keys])).toEqual([
  ['id','int',['pk']],['order_id','int',['fk']],['product_id','int',['fk']]
 ]);
 expect(fields.get('product')?.map(field=>[field.name,field.type,field.keys])).toEqual([
  ['id','int',['pk']],['name','varchar',undefined],['price','decimal',undefined]
 ]);
 expect(fields.get('cart')?.map(field=>[field.name,field.type])).toEqual([['items','int'],['updated','timestamp']]);
 expect(fields.get('category')?.map(field=>[field.name,field.type])).toEqual([['name','varchar'],['slug','varchar']]);
 expect(commerce.structure!.entities!.flatMap(entity=>entity.fields).every(field=>field.nullable===undefined)).toBe(true);
 expect(commerce.structure?.references?.map(reference=>[
  reference.from.node,reference.from.field,reference.to.node,reference.to.field,reference.fromCardinality,reference.toCardinality
 ])).toEqual([
  ['user','id','order','user_id',undefined,'zero-or-many'],
  ['user',undefined,'cart',undefined,undefined,'zero-or-one'],
  ['order',undefined,'item',undefined,undefined,'one-or-many'],
  ['product','id','item','product_id',undefined,'zero-or-many'],
  ['category',undefined,'product',undefined,undefined,'zero-or-many']
 ]);
 expect(commerce.omissions?.join(' ')).toContain('right wall');
 expect(commerce.omissions?.join(' ')).toContain('no endpoint wall-side property');
 for(const source of commerceExample.sources)if(source.originPath==='LICENSE')expect(read(source.path).toString('utf8')).toContain('MIT License');
 for(const example of [sequenceExample,mindmapExample,commerceExample])expect(example.sources.filter(source=>source.originPath==='LICENSE')).toHaveLength(1);
});

test('engine-target architecture keeps the documented SDK and engine ownership boundaries',()=>{
 const example=manifest.examples.find(row=>row.id==='umf-engine-target-architecture')!;
 const v=visual(document(example)),source=read(example.sources[0]!.path).toString('utf8');
 expect(example.definitionPath).toBe('fixtures/showcase/definitions/umf-engine-target-architecture-reviewed.json');
 expect(v.layout).toEqual({kind:'flow',direction:'LR'});
 expect(v.groups?.map(group=>group.label)).toEqual(['UMF access SDK','Truss','Ashlar']);
 expect(v.nodes?.filter(node=>node.group==='sdk').map(node=>node.label)).toEqual(['Catalog function','Actions client']);
 expect(v.nodes?.filter(node=>node.group==='truss').map(node=>node.label)).toEqual(['Read path','Action admission','Bulk coordination']);
 expect(v.nodes?.filter(node=>node.group==='ashlar').map(node=>node.label)).toEqual(['Publication resolver','Pinned read']);
 expect(v.edges?.map(edge=>[edge.from,edge.to])).toEqual([
  ['catalog','truss-read'],['actions','truss-action'],['catalog','truss-bulk'],
  ['catalog','ashlar-resolver'],['ashlar-resolver','ashlar-read']
 ]);
 for(const relationship of ['Q --> TR','A --> TA','Q --> TB','Q --> AR --> AP'])expect(source).toContain(relationship);
 expect(source).toContain('Ashlar provides no `ActionExecutor` or');
 expect(v.annotations?.map(annotation=>annotation.text)).toEqual([
  'The conformance boundary that lets Truss and Ashlar act as SDK targets. UMF owns the protocols, the conformance suite, the adoption packet shape and the engine-specific witness list. Each engine owns its adapter, its adoption design and its execution authority. This design changes no engine storage and amends no sibling contract.',
  'Selected: engines implement the same target protocols as raw tables, over their own protected paths. Weft compiles catalog entries for each engine through its existing backend. The adapter adds no semantics: it routes catalog entries and encoded inputs into the engine and maps results back to SDK outcomes.',
  'Rejected: Latest-table reads on Ashlar. They can mix table versions from different publications. Every read is resolver-pinned instead.',
  'Rejected: Ashlar actions or bulk through the SDK. Ashlar writes, ACK progress and publication are its own protocol. Ashlar provides no `ActionExecutor` or `BulkTarget`.'
 ]);
 expect(v.annotations?.[1]?.text.startsWith('Selected:')).toBe(true);
 expect(v.annotations?.[2]?.text.startsWith('Rejected:')).toBe(true);
 expect(v.annotations?.[3]?.text.startsWith('Rejected:')).toBe(true);
 expect(normalizedSourceText(v.annotations?.[2]?.text??'')).toContain('Every read is resolver-pinned instead');
 expect(normalizedSourceText(v.annotations?.[3]?.text??'')).toContain('provides no `ActionExecutor` or `BulkTarget`');
 expect(example.sources.map(source=>source.path)).toContain('fixtures/showcase/definitions/umf-engine-target-architecture.json');
 expect(example.publishedAssets?.map(asset=>asset.outputPath)).toContain('showcase/umf-engine-target-architecture/original-visual-1.1.json');
 expect(v.takeaway).toContain('documented target design');
 expect(v.omissions?.join(' ')).toContain('not a deployment');
});

test('engine-target reviewed showcase preserves its original Visual definition and binds the pinned source',()=>{
 const example=manifest.examples.find(row=>row.id==='umf-engine-target-architecture')!;
 const originalPath='fixtures/showcase/definitions/umf-engine-target-architecture.json';
 const sourcePath='fixtures/showcase/sources/umf/engine-target-adapters.md';
 const originalBytes=read(originalPath),originalDoc=JSON.parse(originalBytes.toString('utf8')) as Document;
 const reviewedDoc=document(example),expected=structuredClone(originalDoc) as any;
 const source=read(sourcePath).toString('utf8');
 expected.vocabularies['umf.visual'].version='1.4.0';
 expected.extensions['umf.visual'].layout={kind:'flow',direction:'LR'};
 expected.extensions['umf.visual'].annotations=[
  {id:'adapter-ownership',text:'The conformance boundary that lets Truss and Ashlar act as SDK targets. UMF owns the protocols, the conformance suite, the adoption packet shape and the engine-specific witness list. Each engine owns its adapter, its adoption design and its execution authority. This design changes no engine storage and amends no sibling contract.'},
  {id:'selected-target-approach',text:'Selected: engines implement the same target protocols as raw tables, over their own protected paths. Weft compiles catalog entries for each engine through its existing backend. The adapter adds no semantics: it routes catalog entries and encoded inputs into the engine and maps results back to SDK outcomes.'},
  {id:'ashlar-resolver-pinning',text:'Rejected: Latest-table reads on Ashlar. They can mix table versions from different publications. Every read is resolver-pinned instead.'},
  {id:'ashlar-write-scope',text:'Rejected: Ashlar actions or bulk through the SDK. Ashlar writes, ACK progress and publication are its own protocol. Ashlar provides no `ActionExecutor` or `BulkTarget`.'}
 ];
 expect(reviewedDoc).toEqual(expected);
 expect(originalDoc.vocabularies['umf.visual']?.version).toBe('1.1.0');
 expect((originalDoc.extensions?.['umf.visual'] as any)?.annotations).toBeUndefined();
 expect(source).toContain('flowchart LR');
 expect(normalizedSourceText(source)).toContain('Every read is resolver-pinned instead.');
 expect(normalizedSourceText(source)).toContain('Ashlar provides no `ActionExecutor` or `BulkTarget`.');
 expect(example.sources.map(ref=>ref.path)).toContain(sourcePath);
 expect(example.sources.find(ref=>ref.path===sourcePath)).toMatchObject({originRepository:'DocumentDrivenDX/umf',originPath:'docs/helix/02-design/solution-designs/SD-031-engine-target-adapters.md',originSha256:'f6b8f1642cc3db729db1ac3364b50e7797b5ee05cf81f8225b8c05ff21c45021'});
 expect(hash(read(sourcePath))).toBe('f6b8f1642cc3db729db1ac3364b50e7797b5ee05cf81f8225b8c05ff21c45021');
 expect(hash(originalBytes)).toBe('6d36dad240aa9b88904ba05a74de02adc5ec78b7f8fd427ea63423debe30247f');
});

test('architecture network follows the exact documented container nodes and connections',()=>{
 const example=manifest.examples.find(row=>row.id==='umf-native-interchange-architecture')!;
 const v=visual(document(example));
 expect(example.definitionPath).toBe('fixtures/showcase/definitions/umf-native-interchange-architecture-reviewed.json');
 expect(v.layout).toEqual({kind:'flow',direction:'LR'});
 expect(v.nodes?.map(node=>node.label)).toEqual([
  'Native source','Native parser / compiler','Importer','UMF programmatic model','Versioned vocabularies',
  'Explicit target projection','Exporter','Native serializer / compiler','Fidelity and provenance','YAML / JSON artifact'
 ]);
 expect(v.edges).toHaveLength(10);
 expect(v.edges?.map(edge=>[edge.from,edge.to])).toEqual([
  ['native-source','native-parser'],['native-parser','importer'],['importer','umf-model'],
  ['vocabularies','umf-model'],['umf-model','projection'],['projection','exporter'],
  ['exporter','native-serializer'],['projection','fidelity'],['umf-model','artifact'],['artifact','umf-model']
 ]);
 const source=read(example.sources[0]!.path).toString('utf8');
 for(const label of v.nodes!.map(node=>node.label))expect(source).toContain('['+label+']');
 expect(source).toContain('M <--> Y[YAML / JSON artifact]');
 expect(v.annotations?.map(annotation=>annotation.text)).toEqual([
  'The implementation provides a browser-compatible library and host-side tooling sharing the same programmatic model. No persistent service, database, cloud runtime, or network registry is required by the brief.',
  'UMF library/tooling — Technology Direction: TypeScript compiled to JavaScript; JSON-compatible values; YAML authoring. Responsibility: Model access, operations, diagnostics. Boundary: Browser-compatible dependencies and packaged vocabularies; host I/O stays outside the library.',
  'Vocabulary packages — Technology Direction: JSON Schema structural definitions plus semantic specifications. Responsibility: Versions, validation, capabilities, fixtures. Boundary: Package metadata is data; it does not authorize code execution.',
  'Native adapters — Technology Direction: Selected ecosystem parsers/compiler APIs. Responsibility: Import/export through native semantic representations. Boundary: Native output must pass native validation.',
  'Conformance harness — Technology Direction: Bun test runner; separate browser execution and pinned native oracles. Responsibility: Round-trip and projection evidence. Boundary: Evidence generation is separate from support declarations.'
 ]);
 expect(v.annotations?.[4]?.text).toContain('Evidence generation is separate from support declarations');
});

test('reviewed native interchange showcase preserves the original definition and exact Level 2 scope',()=>{
 const example=manifest.examples.find(row=>row.id==='umf-native-interchange-architecture')!;
 const originalPath='fixtures/showcase/definitions/umf-native-interchange-architecture.json';
 const sourcePath='fixtures/showcase/sources/umf/architecture.md';
 const originalBytes=read(originalPath),originalDoc=JSON.parse(originalBytes.toString('utf8')) as Document;
 const reviewedDoc=document(example),expected=structuredClone(originalDoc) as any;
 const source=read(sourcePath).toString('utf8');
 expected.vocabularies['umf.visual'].version='1.4.0';
 expected.extensions['umf.visual'].layout={kind:'flow',direction:'LR'};
 expected.extensions['umf.visual'].annotations=[
  {id:'container-overview',text:'The implementation provides a browser-compatible library and host-side tooling sharing the same programmatic model. No persistent service, database, cloud runtime, or network registry is required by the brief.'},
  {id:'unit-library-tooling',text:'UMF library/tooling — Technology Direction: TypeScript compiled to JavaScript; JSON-compatible values; YAML authoring. Responsibility: Model access, operations, diagnostics. Boundary: Browser-compatible dependencies and packaged vocabularies; host I/O stays outside the library.'},
  {id:'unit-vocabulary-packages',text:'Vocabulary packages — Technology Direction: JSON Schema structural definitions plus semantic specifications. Responsibility: Versions, validation, capabilities, fixtures. Boundary: Package metadata is data; it does not authorize code execution.'},
  {id:'unit-native-adapters',text:'Native adapters — Technology Direction: Selected ecosystem parsers/compiler APIs. Responsibility: Import/export through native semantic representations. Boundary: Native output must pass native validation.'},
  {id:'unit-conformance-harness',text:'Conformance harness — Technology Direction: Bun test runner; separate browser execution and pinned native oracles. Responsibility: Round-trip and projection evidence. Boundary: Evidence generation is separate from support declarations.'}
 ];
 expect(reviewedDoc).toEqual(expected);
 expect(originalDoc.vocabularies['umf.visual']?.version).toBe('1.0.0');
 expect((originalDoc.extensions?.['umf.visual'] as any)?.annotations).toBeUndefined();
 expect(source).toContain('## Level 2: Container Diagram');
 expect(source).toContain('No persistent service,');
 expect(source).toContain('Evidence generation is separate from support declarations');
 expect(source).toContain('flowchart LR');
 expect(example.sources.map(ref=>ref.path)).toContain(sourcePath);
 expect(example.sources.map(ref=>ref.path)).toContain(originalPath);
 expect(example.publishedAssets?.map(asset=>asset.outputPath)).toContain('showcase/umf-native-interchange-architecture/original-visual-1.0.json');
 expect(hash(originalBytes)).toBe('bdab026d978f400b0bbebbf3debed991ff2e710a7eed6b559387c4eeeb5992b0');
 expect(hash(read(sourcePath))).toBe('b46437fbd1cdf9657adb12f78e2b4385c90581b2bab8ef0f1445f0d1495e34db');
});

test('UMF architecture stack has ordered memberships and introduces no directed edges',()=>{
 const example=manifest.examples.find(row=>row.id==='umf-architecture-stack')!;
 const v=visual(document(example));
 expect(example.definitionPath).toBe('fixtures/showcase/definitions/umf-architecture-stack-reviewed.json');
 expect(v.kind).toBe('structure');expect(v.form).toBe('stack');expect(v.edges).toBeUndefined();
 expect(v.structure?.layers?.map(layer=>layer.label)).toEqual([
  'Authoring and consumers','Adapter boundary','Portable library','Versioned definitions','Native ecosystems'
 ]);
 expect(v.nodes?.map(node=>node.layer)).toEqual(['authors','adapters','library','vocabularies','ecosystems']);
 expect(v.nodes?.map(node=>node.detail)).toEqual([
  'Create, inspect, validate, compare and transform artifacts',
  'Pair native parsers and serializers around explicit projections. Native output must pass native validation. Native semantics remain source-specific where no safe common mapping exists.',
  'Model access, operations and diagnostics. Browser-compatible dependencies and packaged vocabularies; host I/O stays outside the library.',
  'Versioned structural definitions and semantic specifications. Versions, validation, capabilities and fixtures. Package metadata is data; it does not authorize code execution.',
  'Selected native parsers, compilers and serializers'
 ]);
 const source=read(example.sources[0]!.path).toString('utf8');
 for(const fact of ['Schema authors and tooling','Native adapters','UMF library/tooling','Vocabulary packages','Native ecosystem tools'])expect(source).toContain(fact);
});

test('reviewed architecture stack preserves the original order and adds only selected component boundaries',()=>{
 const example=manifest.examples.find(row=>row.id==='umf-architecture-stack')!;
 const originalPath='fixtures/showcase/definitions/umf-architecture-stack.json';
 const sourcePath='fixtures/showcase/sources/umf/architecture.md';
 const originalBytes=read(originalPath),originalDoc=JSON.parse(originalBytes.toString('utf8')) as Document;
 const reviewedDoc=document(example),expected=structuredClone(originalDoc) as any;
 const source=read(sourcePath).toString('utf8');
 const originalNodes=expected.extensions['umf.visual'].nodes;
 originalNodes.find((node:any)=>node.id==='native-adapters').detail+='. Native output must pass native validation. Native semantics remain source-specific where no safe common mapping exists.';
 originalNodes.find((node:any)=>node.id==='umf-library').detail+='. Browser-compatible dependencies and packaged vocabularies; host I/O stays outside the library.';
 originalNodes.find((node:any)=>node.id==='vocabulary-packages').detail+='. Versions, validation, capabilities and fixtures. Package metadata is data; it does not authorize code execution.';
 expect(reviewedDoc).toEqual(expected);
 expect(originalDoc.vocabularies['umf.visual']?.version).toBe('1.0.0');
 expect(originalNodes.map((node:any)=>node.label)).toEqual(['Schema authors and tooling','Native adapters','UMF library / tooling','Vocabulary packages','Native ecosystem tools']);
 expect((originalDoc.extensions?.['umf.visual'] as any)?.edges).toBeUndefined();
 for(const fact of [
  'Browser-compatible dependencies and packaged vocabularies; host I/O stays outside the library',
  'Package metadata is data; it does not authorize code execution',
  'Native output must pass native validation',
  'Native semantics remain source-specific where no safe common mapping exists'
 ])expect(source).toContain(fact);
 expect(example.sources.map(ref=>ref.path)).toContain(originalPath);
 expect(example.publishedAssets?.map(asset=>asset.outputPath)).toContain('showcase/umf-architecture-stack/original-visual-1.0.json');
 expect(hash(originalBytes)).toBe('c2b689e760568953d82e3fbb37b3fd8a182875a88f470bdcb788aee7893730c5');
 expect(hash(read(sourcePath))).toBe('b46437fbd1cdf9657adb12f78e2b4385c90581b2bab8ef0f1445f0d1495e34db');
});

test('logical metamodel E/R contains no invented database key or nullability claims',()=>{
 const example=manifest.examples.find(row=>row.id==='umf-logical-metamodel')!;
 const doc=document(example),v=visual(doc),source=read(example.sources[0]!.path).toString('utf8');
 expect(doc.vocabularies['umf.visual']?.version).toBe('1.1.0');
 expect(example.definitionPath).toBe('fixtures/showcase/definitions/umf-logical-metamodel-reviewed.json');
 expect(v.nodes?.map(node=>node.label)).toEqual(['Document','Module','Element','Relationship']);
 expect(v.nodes?.map(node=>node.detail)).toEqual([
  'A Document groups Modules and declares the vocabularies used by its extension content. Its identifier names the complete metadata envelope.',
  'A Module gives Elements and Relationships a namespace within a Document.',
  'An Element describes a Field, Record or Group within a Module. References connect Elements without assuming a particular storage or compute implementation.',
  'UMF language relationship'
 ]);
 expect(v.structure?.entities).toHaveLength(4);
 expect(v.structure?.entities?.every(entity=>entity.fields.every(field=>field.keys===undefined&&field.nullable===undefined))).toBe(true);
 expect(v.structure?.references?.map(reference=>reference.label)).toEqual(['modules','elements','relationships']);
 expect(v.structure?.references?.map(reference=>reference.to)).toEqual([{node:'module'},{node:'element'},{node:'relationship'}]);
 expect(v.structure?.references?.every(reference=>reference.fromCardinality===undefined&&reference.toCardinality===undefined&&reference.fromMultiplicity===undefined&&reference.toMultiplicity===undefined)).toBe(true);
 expect(v.structure?.entities?.flatMap(entity=>entity.fields).find(field=>field.name==='extensions')?.type).toBe('link<extensions>');
 expect(v.structure?.entities?.flatMap(entity=>entity.fields).filter(field=>field.name.endsWith('Multiplicity')).map(field=>field.type)).toEqual(['link<relationshipMultiplicity>','link<relationshipMultiplicity>']);
 expect(v.omissions).toEqual(['Other members and source-defined presence and shape constraints are outside this selected fields view.']);
 for(const token of ['id: document.modules','id: module.elements','id: module.relationships','id: relationship.sourceMultiplicity','id: relationship.targetMultiplicity'])expect(source).toContain(token);
 expect(v.takeaway).toMatch(/do not assert relational primary keys, foreign keys or database nullability/u);
});

test('reviewed logical metamodel preserves original bytes and maps only selected source members and record links',()=>{
 const example=manifest.examples.find(row=>row.id==='umf-logical-metamodel')!;
 const originalPath='fixtures/showcase/definitions/umf-logical-metamodel.json';
 const sourcePath='fixtures/showcase/sources/umf/metamodel.yaml';
 const originalBytes=read(originalPath),originalDoc=JSON.parse(originalBytes.toString('utf8')) as Document;
 const reviewedDoc=document(example),expected=structuredClone(originalDoc) as any;
 const sourceText=read(sourcePath).toString('utf8'),metamodel=parseYaml(sourceText) as any;
 const sourceModule=metamodel.modules.find((module:any)=>module.id==='umf');
 const sourceElements=sourceModule.elements as any[],sourceElementById=new Map(sourceElements.map(element=>[element.id,element]));
 const expectedDetails:Record<string,string>={
  document:'A Document groups Modules and declares the vocabularies used by its extension content. Its identifier names the complete metadata envelope.',
  module:'A Module gives Elements and Relationships a namespace within a Document.',
  element:'An Element describes a Field, Record or Group within a Module. References connect Elements without assuming a particular storage or compute implementation.',
  relationship:'UMF language relationship'
 };
 const expectedFields:Record<string,string[]>={
  document:['id','vocabularies','modules','extensions','title'],
  module:['id','namespace','elements','relationships'],
  element:['id','name','scalarType','references','kind','members','keys'],
  relationship:['id','name','source','target','sourceMultiplicity','targetMultiplicity','directed']
 };
 const expectedTypes:Record<string,string>={
  'document.id':'link<id>','document.vocabularies':'object<versioned vocabulary entries>','document.modules':'sequence<link<Module>>','document.extensions':'link<extensions>','document.title':'string',
  'module.id':'link<id>','module.namespace':'string','module.elements':'sequence<link<Element>>','module.relationships':'sequence<link<Relationship>>',
  'element.id':'link<id>','element.name':'string','element.scalarType':'link<scalarType>','element.references':'sequence<link<reference>>','element.kind':'text','element.members':'sequence<link<keyFieldReference>>','element.keys':'sequence<link<key>>',
  'relationship.id':'link<id>','relationship.name':'link<id>','relationship.source':'sequence<link<relationshipEndpoint>>','relationship.target':'sequence<link<relationshipTarget>>','relationship.sourceMultiplicity':'link<relationshipMultiplicity>','relationship.targetMultiplicity':'link<relationshipMultiplicity>','relationship.directed':'boolean'
 };
 const originalVisual=expected.extensions['umf.visual'];
 originalVisual.nodes.forEach((node:any)=>node.detail=expectedDetails[node.id]);
 const docExtensions=originalVisual.structure.entities.find((entity:any)=>entity.node==='document').fields.find((field:any)=>field.name==='extensions');docExtensions.type='link<extensions>';
 const relationFields=originalVisual.structure.entities.find((entity:any)=>entity.node==='relationship').fields;
 for(const field of relationFields.filter((field:any)=>field.name.endsWith('Multiplicity')))field.type='link<relationshipMultiplicity>';
 const elementFields=originalVisual.structure.entities.find((entity:any)=>entity.node==='element').fields;
 originalVisual.structure.entities.find((entity:any)=>entity.node==='element').fields=['id','name','scalarType','references','kind','members','keys'].map((name:string)=>elementFields.find((field:any)=>field.name===name));
 for(const reference of originalVisual.structure.references){delete reference.to.field;delete reference.to.fieldId;}
 originalVisual.omissions=['Other members and source-defined presence and shape constraints are outside this selected fields view.'];
 expect(reviewedDoc).toEqual(expected);
 expect(reviewedDoc.vocabularies['umf.visual']?.version).toBe('1.1.0');
 expect(originalDoc.vocabularies['umf.visual']?.version).toBe('1.1.0');
 expect((originalDoc.extensions?.['umf.visual'] as any)?.omissions).toBeUndefined();
 const reviewed=visual(reviewedDoc);
 for(const entity of reviewed.structure!.entities!){
  const record=sourceElementById.get(entity.node) as any;
  expect(record?.kind,entity.node).toBe('record');
  expect(reviewed.nodes?.find(node=>node.id===entity.node)?.detail).toBe(expectedDetails[entity.node]);
  const sourceMemberNames=record.members.map((member:any)=>(sourceElementById.get(member.element) as any)?.name);
  const selectedNames=new Set(expectedFields[entity.node]);
  expect(sourceMemberNames.filter((name:string)=>selectedNames.has(name))).toEqual(expectedFields[entity.node]);
  expect(entity.fields.map(field=>field.name)).toEqual(expectedFields[entity.node]);
  for(const field of entity.fields){
   const sourceField=sourceElementById.get(`${entity.node}.${field.name}`) as any;
   expect(sourceField?.kind,`${entity.node}.${field.name}`).toBe('field');
   expect(sourceField?.name).toBe(field.name);
   expect(field.type).toBe(expectedTypes[`${entity.node}.${field.name}`]);
  }
 }
 const field=(id:string)=>sourceElementById.get(id) as any;
 expect(field('document.extensions').extensions['umf.metamodel'].shape).toEqual({tag:'link',target:'extensions'});
 expect(field('document.vocabularies').extensions['umf.metamodel'].shape.key).toEqual({tag:'link',target:'id'});
 expect(field('document.vocabularies').extensions['umf.metamodel'].shape.open.fields.version).toEqual({tag:'link',target:'version'});
 expect(field('element.members').extensions['umf.metamodel'].shape).toMatchObject({tag:'sequence',item:{tag:'link',target:'keyFieldReference'},unique:true});
 expect(field('relationship.source').extensions['umf.metamodel'].shape).toMatchObject({tag:'sequence',item:{tag:'link',target:'relationshipEndpoint'},min:1});
 expect(field('relationship.target').extensions['umf.metamodel'].shape).toMatchObject({tag:'sequence',item:{tag:'link',target:'relationshipTarget'},min:1});
 expect(reviewed.structure?.references?.map(reference=>[reference.from.node,reference.from.field,reference.to.node,reference.to.field])).toEqual([
  ['document','modules','module',undefined],['module','elements','element',undefined],['module','relationships','relationship',undefined]
 ]);
 expect(example.sources.map(ref=>ref.path)).toContain(originalPath);
 expect(example.publishedAssets?.map(asset=>asset.outputPath)).toContain('showcase/umf-logical-metamodel/original-visual-1.1.json');
 expect(hash(originalBytes)).toBe('7bb3b9096f1af8206e301a1880e454bc515f2ed58302567c321ef970047a2990');
 expect(hash(read(sourcePath))).toBe('1e406ee49b0c4c08b8eb996bb1fcb6e96fa8d6f4673f0877aa1800986b2dbbce');
});

test('Beacon relational rows and links match the pinned SQL migrations',()=>{
 const example=manifest.examples.find(row=>row.id==='beacon-relational-core')!;
 const doc=document(example),v=visual(doc),migration=read(example.sources[0]!.path).toString('utf8')+'\n'+read(example.sources[1]!.path).toString('utf8');
 expect(doc.vocabularies['umf.visual']?.version).toBe('1.1.0');
 expect(v.structure?.entities?.map(entity=>entity.node)).toEqual(['workspaces','customers','tickets','messages','attachments']);
 const fields=new Map(v.structure!.entities!.map(entity=>[entity.node,new Map(entity.fields.map(field=>[field.name,field]))]));
 expect(fields.get('workspaces')!.get('id')).toMatchObject({type:'uuid',keys:['pk'],nullable:false});
 expect(fields.get('customers')!.get('workspace_id')).toMatchObject({type:'uuid',keys:['fk'],nullable:false});
 expect(fields.get('tickets')!.get('customer_id')).toMatchObject({type:'uuid',keys:['fk'],nullable:false});
 expect(fields.get('messages')!.get('ticket_id')).toMatchObject({type:'uuid',keys:['fk'],nullable:false});
 expect(fields.get('attachments')!.get('message_id')).toMatchObject({type:'uuid',keys:['fk'],nullable:false});
 expect(fields.get('attachments')!.get('bytes')).toMatchObject({type:'bigint',nullable:true});
 expect(v.structure?.references).toHaveLength(5);
 const expectedLinks=[
  ['workspaces','customers','id','workspace_id'],['customers','tickets','id','customer_id'],
  ['workspaces','tickets','id','workspace_id'],['tickets','messages','id','ticket_id'],['messages','attachments','id','message_id']
 ];
 expect(v.structure!.references!.map(reference=>[reference.from.node,reference.to.node,reference.from.field,reference.to.field])).toEqual(expectedLinks);
 const sourceTables=new Map<string,Map<string,{type:string;keys:string[];nullable:boolean;reference?:{table:string;field:string}}>>();
 for(const match of migration.matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\n\);/gu)){
  const table=match[1]!,columns=new Map<string,{type:string;keys:string[];nullable:boolean;reference?:{table:string;field:string}}>();
  for(const line of match[2]!.split('\n')){
   const column=line.match(/^\s{2}(\w+)\s+([\w]+)(.*?)[,]?\s*$/u);
   if(!column)continue;
   const [,name,type,tail]=column;
   const ref=tail!.match(/REFERENCES (\w+)\((\w+)\)/u);
   columns.set(name!,{type:type!,keys:[...(tail!.includes('PRIMARY KEY')?['pk']:[]),...(ref?['fk']:[])],nullable:!tail!.includes('NOT NULL')&&!tail!.includes('PRIMARY KEY'),...(ref?{reference:{table:ref[1]!,field:ref[2]!}}:{})});
  }
  sourceTables.set(table,columns);
 }
 expect([...sourceTables.keys()]).toEqual(['workspaces','agents','settings','integrations','customers','tickets','messages','attachments','tags','ticket_tags']);
 expect(v.structure!.entities!.map(entity=>entity.fields.length).reduce((sum,count)=>sum+count,0)).toBe(19);
 for(const entity of v.structure!.entities!){
  const columns=sourceTables.get(entity.node)!;
  for(const field of entity.fields){
   const source=columns.get(field.name)!;
   expect(source,`${entity.node}.${field.name} exists in SQL`).toBeDefined();
   expect(field.type).toBe(source.type);
   expect(JSON.stringify(field.keys??[])).toBe(JSON.stringify(source.keys));
   expect(field.nullable).toBe(source.nullable);
  }
 }
 const sqlLinks=[...sourceTables].flatMap(([table,columns])=>[...columns].flatMap(([field,column])=>column.reference?[[column.reference.table,table,column.reference.field,field]]:[]));
 expect(sqlLinks.filter(link=>expectedLinks.some(expected=>expected.every((part,index)=>part===link[index])))).toEqual(expectedLinks);
 for(const needle of ['CREATE TABLE workspaces','CREATE TABLE customers','CREATE TABLE tickets','CREATE TABLE messages','CREATE TABLE attachments','REFERENCES workspaces(id)','REFERENCES customers(id)','REFERENCES tickets(id)','REFERENCES messages(id)','bytes bigint'])expect(migration).toContain(needle);
 expect(v.structure!.entities!.flatMap(entity=>entity.fields).every(field=>field.nullable!==undefined)).toBe(true);
});

test('Beacon relational showcase publishes its exact selected sources and original definition',()=>{
 const example=manifest.examples.find(row=>row.id==='beacon-relational-core')!;
 const sqlPaths=[
  'fixtures/visual/sources/beacon/migrations/0001_workspace.sql',
  'fixtures/visual/sources/beacon/migrations/0002_tickets.sql'
 ];
 const originalPath='fixtures/showcase/definitions/beacon-relational-core.json';
 expect(example.definitionPath).toBe(originalPath);
 expect(example.description).toContain('selected five-table relational slice');
 expect(example.sources.map(source=>source.path)).toEqual(sqlPaths);
 expect(example.publishedAssets?.map(asset=>asset.path)).toEqual([...sqlPaths,originalPath]);
 for(const [index,path] of sqlPaths.entries()){
  const source=example.sources[index]!,asset=example.publishedAssets![index]!;
  const bytes=read(path);
  expect(hash(bytes)).toBe(source.sha256);
  expect(asset.sha256).toBe(source.sha256);
  expect(asset.mediaType).toBe('text/plain');
  expect(asset.outputPath).toMatch(/\.sql$/u);
 }
 const originalBytes=read(originalPath),definitionAsset=example.publishedAssets![2]!;
 expect(hash(originalBytes)).toBe('ec5d648e2ef6db90831fa8a41fc83f9e998017c2fd22919be52188d733b98556');
 expect(definitionAsset.sha256).toBe(hash(originalBytes));
 expect(definitionAsset.outputPath).toBe('showcase/beacon-relational-core/original-visual-1.1.json');
 const payload=JSON.parse(originalBytes.toString('utf8')) as Document;
 expect(visual(payload).kind).toBe('structure');
 expect(visual(payload).structure?.entities?.map(entity=>entity.node)).toEqual(['workspaces','customers','tickets','messages','attachments']);
});

test('UMF logical interface review preserves the diagram and adds only selected Ashlar pinning context',()=>{
 const example=manifest.examples.find(row=>row.id==='umf-logical-interface-architecture')!;
 const originalPath='fixtures/showcase/definitions/umf-logical-interface-architecture.json';
 const sourcePath='fixtures/showcase/sources/umf/engine-target-adapters.md';
 const originalBytes=read(originalPath),originalDoc=JSON.parse(originalBytes.toString('utf8')) as Document;
 const reviewedDoc=document(example),expected=structuredClone(originalDoc) as any;
 const source=read(sourcePath).toString('utf8'),sourcePlain=normalizedSourceText(source.replace(/[`*]/gu,'')),originalVisual=expected.extensions['umf.visual'];
 const annotations=[
  {id:'ashlar-latest-read-rejected',text:'Rejected: Latest-table reads on Ashlar. They can mix table versions from different publications. Every read is resolver-pinned instead.'},
  {id:'ashlar-continuation-identity',text:'The Ashlar target identity includes the publication vector, so a Continuation[K] recording its digest raises StaleContinuation on any other publication.'}
 ];
 expected.vocabularies['umf.visual'].version='1.4.0';
 originalVisual.annotations=annotations;
 expect(reviewedDoc).toEqual(expected);
 expect(originalDoc.vocabularies['umf.visual']?.version).toBe('1.2.0');
 expect(reviewedDoc.vocabularies['umf.visual']?.version).toBe('1.4.0');
 expect(visual(reviewedDoc).layout).toEqual(visual(originalDoc).layout);
 expect(visual(reviewedDoc).groups).toEqual(visual(originalDoc).groups);
 expect(visual(reviewedDoc).nodes).toEqual(visual(originalDoc).nodes);
 expect(visual(reviewedDoc).edges).toEqual(visual(originalDoc).edges);
 expect(visual(reviewedDoc).annotations).toEqual(annotations);
 for(const fact of [
  'Latest-table reads on Ashlar.',
  'They can mix table versions from different publications.',
  'Every read is resolver-pinned instead.',
  'The Ashlar target identity includes the publication vector,',
  'a Continuation[K] recording its digest raises StaleContinuation on any other publication.'
 ])expect(sourcePlain).toContain(normalizedSourceText(fact));
 expect(visual(reviewedDoc).annotations?.some(annotation=>/ActionExecutor|BulkTarget|latest-table reads/iu.test(annotation.text)&&annotation.id!=='ashlar-latest-read-rejected')).toBe(false);
 expect(example.definitionPath).toBe('fixtures/showcase/definitions/umf-logical-interface-architecture-reviewed.json');
 expect(example.sources[0]?.path).toBe(sourcePath);
 expect(example.sources[0]?.pointer).toContain('Solution Approaches');
 expect(example.publishedAssets?.map(asset=>asset.path)).toEqual([sourcePath,originalPath]);
 expect(example.publishedAssets?.[0]?.sha256).toBe('f6b8f1642cc3db729db1ac3364b50e7797b5ee05cf81f8225b8c05ff21c45021');
 expect(example.publishedAssets?.[1]?.sha256).toBe(hash(originalBytes));
 expect(example.publishedAssets?.[1]?.outputPath).toBe('showcase/umf-logical-interface-architecture/original-visual-1.2.json');
 expect(hash(originalBytes)).toBe('f47d185a7e1c900cb9bea7da5f12d75489e521e737a432c6b47fc263b5d8ef00');
 expect(hash(read(sourcePath))).toBe('f6b8f1642cc3db729db1ac3364b50e7797b5ee05cf81f8225b8c05ff21c45021');
});
