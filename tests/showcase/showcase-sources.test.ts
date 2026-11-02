// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {inspectVisual,type Visual} from '../../src';
import type {Document} from '@umf/core';

type SourceRef={path:string;sha256:string;originPath:string;originSha256:string;pointer:string;description:string;originRepository?:string};
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
  'umf-native-interchange-architecture','umf-architecture-stack','umf-logical-metamodel','beacon-relational-core'
 ]);
 expect(new Set(manifest.examples.map(example=>example.id)).size).toBe(5);
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
  }
  const doc=document(example),v=visual(doc),checked=inspectVisual(doc);
  expect(v.kind,example.id).toBe(example.kind);
  expect(v.form,example.id).toBe(example.form);
  expect(checked.valid,JSON.stringify(checked.diagnostics)).toBe(true);
  expect(checked.complete,JSON.stringify(checked.diagnostics)).toBe(true);
 }
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
