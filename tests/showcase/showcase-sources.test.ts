// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {inspectVisual,type Visual} from '../../src';
import type {Document} from '@umf/core';

type SourceRef={path:string;sha256:string;originPath:string;originSha256:string;pointer:string;description:string;originRepository?:string;originCommit?:string;originTag?:string;originTagObject?:string};
type ShowcaseExample={id:string;title:string;description:string;kind:Visual['kind'];form:Visual['form'];definitionPath:string;definitionSha256:string;sources:SourceRef[]};
const root=process.cwd();
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
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
 expect(v.takeaway).toContain('documented target design');
 expect(v.omissions?.join(' ')).toContain('not a deployment');
});

test('architecture network follows the exact documented container nodes and connections',()=>{
 const example=manifest.examples.find(row=>row.id==='umf-native-interchange-architecture')!;
 const v=visual(document(example));
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
});

test('UMF architecture stack has ordered memberships and introduces no directed edges',()=>{
 const example=manifest.examples.find(row=>row.id==='umf-architecture-stack')!;
 const v=visual(document(example));
 expect(v.kind).toBe('structure');expect(v.form).toBe('stack');expect(v.edges).toBeUndefined();
 expect(v.structure?.layers?.map(layer=>layer.label)).toEqual([
  'Authoring and consumers','Adapter boundary','Portable library','Versioned definitions','Native ecosystems'
 ]);
 expect(v.nodes?.map(node=>node.layer)).toEqual(['authors','adapters','library','vocabularies','ecosystems']);
 const source=read(example.sources[0]!.path).toString('utf8');
 for(const fact of ['Schema authors and tooling','Native adapters','UMF library/tooling','Vocabulary packages','Native ecosystem tools'])expect(source).toContain(fact);
});

test('logical metamodel E/R contains no invented database key or nullability claims',()=>{
 const example=manifest.examples.find(row=>row.id==='umf-logical-metamodel')!;
 const doc=document(example),v=visual(doc),source=read(example.sources[0]!.path).toString('utf8');
 expect(doc.vocabularies['umf.visual']?.version).toBe('1.1.0');
 expect(v.nodes?.map(node=>node.label)).toEqual(['Document','Module','Element','Relationship']);
 expect(v.structure?.entities).toHaveLength(4);
 expect(v.structure?.entities?.every(entity=>entity.fields.every(field=>field.keys===undefined&&field.nullable===undefined))).toBe(true);
 expect(v.structure?.references?.map(reference=>reference.label)).toEqual(['modules','elements','relationships']);
 for(const token of ['id: document.modules','id: module.elements','id: module.relationships','id: relationship.sourceMultiplicity','id: relationship.targetMultiplicity'])expect(source).toContain(token);
 expect(v.takeaway).toMatch(/do not assert relational primary keys, foreign keys or database nullability/u);
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
 for(const needle of ['CREATE TABLE workspaces','CREATE TABLE customers','CREATE TABLE tickets','CREATE TABLE messages','CREATE TABLE attachments','REFERENCES workspaces(id)','REFERENCES customers(id)','REFERENCES tickets(id)','REFERENCES messages(id)','bytes bigint'])expect(migration).toContain(needle);
 expect(v.structure!.entities!.flatMap(entity=>entity.fields).every(field=>field.nullable!==undefined)).toBe(true);
});
