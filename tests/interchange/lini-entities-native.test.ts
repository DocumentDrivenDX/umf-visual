// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {Document} from '@umf/core';
import {liniAdapter} from '../../src/interchange/lini';

const fixtures=[
 ['fixtures/catalog/canary-entities.json','6b101dd70cab0fbb10a87b195515d76d06f62828afe02d1f368afe417ecfbd6e'],
 ['fixtures/visual/inventory/beacon-schema-tickets.json','3ea8d7e5c8941457901cecb9a6755bc02fd5119c0a9e6fb92bf9e21d4881054e'],
 ['fixtures/visual/inventory/beacon-schema-workspace.json','74cc43f6171ed212876b6fab8fc9ee1429dbd4bca2e7c79394d46e9800bb3dad'],
 ['fixtures/visual/inventory/tpl-sd-domain.json','b054796bb6031693eb3df54ff03cc7b27fb2ad8fa4ba90bd66f7f36573bd6471'],
] as const;
const context={id:'lini-entity-proof',question:'What does the schema show?'};
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');

test('four frozen entity fixtures project native fields and directed references without inventing keys or cardinality',async()=>{
 for(const[path,expectedHash]of fixtures){
  const bytes=await readFile(path);expect(sha(bytes),path+' fixture pin').toBe(expectedHash);
  const document=JSON.parse(bytes.toString()) as Document,visual=document.extensions!['umf.visual'] as any,result=liniAdapter.serialize(visual,context);
  expect(result.text,path).toBeDefined();expect(result.identityMap.filter(item=>item.kind==='node')).toHaveLength(visual.nodes.length);
  expect(result.identityMap.filter(item=>item.kind==='field')).toHaveLength(visual.structure.entities.reduce((count:number,entity:any)=>count+entity.fields.length,0));
  expect(result.identityMap.filter(item=>item.kind==='reference')).toHaveLength(visual.structure.references?.length??0);
  const parsed=liniAdapter.parse(result.text!,context);expect(parsed.visual?.nodes).toHaveLength(visual.nodes.length);expect(parsed.visual?.structure?.entities).toHaveLength(visual.structure.entities.length);expect(parsed.visual?.structure?.references).toHaveLength(visual.structure.references?.length??0);
  for(const[index,entity]of visual.structure.entities.entries())for(const[fieldIndex,field]of entity.fields.entries()){
   const mapped=parsed.visual?.structure?.entities?.[index]?.fields[fieldIndex];expect(mapped).toMatchObject({name:field.name,type:field.type});
   if(field.keys!==undefined)expect(mapped).not.toHaveProperty('keys');
   if(field.nullable!==undefined)expect(mapped).not.toHaveProperty('nullable');
  }
  const importedNode=(sourceId:string)=>{const label=visual.nodes.find((node:any)=>node.id===sourceId)?.label;return parsed.visual?.nodes?.find(node=>node.label===label)?.id;};
  for(const[index,reference]of (visual.structure.references??[]).entries()){
   const mapped=parsed.visual?.structure?.references?.[index];expect(mapped).toMatchObject({from:{node:importedNode(reference.from.node),...(reference.from.field?{field:reference.from.field}:{})},to:{node:importedNode(reference.to.node),...(reference.to.field?{field:reference.to.field}:{})},...(reference.label!==undefined?{label:reference.label}:{})});
   if(reference.fromCardinality!==undefined)expect(mapped).not.toHaveProperty('fromCardinality');
   if(reference.toCardinality!==undefined)expect(mapped).not.toHaveProperty('toCardinality');
  }
  const losses=result.diagnostics.filter(item=>item.loss);
  for(const[index,entity]of visual.structure.entities.entries())for(const[fieldIndex,field]of entity.fields.entries()){
   if(field.keys!==undefined)expect(losses.some(item=>item.code==='LINI_FIELD_KEYS'&&item.path.endsWith('/structure/entities/'+index+'/fields/'+fieldIndex+'/keys'))).toBe(true);
   if(field.nullable!==undefined)expect(losses.some(item=>item.code==='LINI_FIELD_NULLABILITY'&&item.path.endsWith('/structure/entities/'+index+'/fields/'+fieldIndex+'/nullable'))).toBe(true);
  }
  for(const[index,reference]of (visual.structure.references??[]).entries()){
   expect(losses.some(item=>item.code==='LINI_REFERENCE_DIRECTION'&&item.path.endsWith('/structure/references/'+index))).toBe(true);
   if(reference.fromCardinality!==undefined)expect(losses.some(item=>item.code==='LINI_CARDINALITY'&&item.path.endsWith('/structure/references/'+index+'/fromCardinality'))).toBe(true);
   if(reference.toCardinality!==undefined)expect(losses.some(item=>item.code==='LINI_CARDINALITY'&&item.path.endsWith('/structure/references/'+index+'/toCardinality'))).toBe(true);
  }
  // This serializer emits no key hints; native labels and data types remain the only mapped cell content.
 }
});

test('editing a native field endpoint changes only that reference endpoint and retains native identity',async()=>{
 const document=JSON.parse((await readFile(fixtures[2][0])).toString()) as Document,visual=document.extensions!['umf.visual'] as any;
 const result=liniAdapter.serialize(visual,context),needle='n_0 -> n_1.f_1 "workspace_id"';expect(result.text).toContain(needle);
 const edited=result.text!.replace(needle,'n_0 -> n_1.f_2 "workspace_id"');const parsed=liniAdapter.parse(edited,context);
 expect(parsed.visual?.structure?.references?.[0]).toMatchObject({from:{node:'n1'},to:{node:'n2',field:'email'},label:'workspace_id'});
 expect(parsed.identityMap.some(item=>item.kind==='field'&&item.nativeId==='umf_visual.n_1.f_2')).toBe(true);
});

test('UMF-authored keys, nullability, and cardinality stay explicit loss with no fake native encoding',async()=>{
 const document=JSON.parse((await readFile(fixtures[0][0])).toString()) as Document,original=document.extensions!['umf.visual'] as any,first=liniAdapter.serialize(original,context);
 const keyEdit=structuredClone(original);keyEdit.structure.entities[0].fields[0].keys=['fk'];const keyResult=liniAdapter.serialize(keyEdit,context);
 expect(keyResult.text).toBe(first.text);expect(keyResult.diagnostics.some(item=>item.code==='LINI_FIELD_KEYS'&&item.loss)).toBe(true);
 const nullabilityEdit=structuredClone(original);nullabilityEdit.structure.entities[0].fields[0].nullable=true;const nullabilityResult=liniAdapter.serialize(nullabilityEdit,context);
 expect(nullabilityResult.text).toBe(first.text);expect(nullabilityResult.diagnostics.some(item=>item.code==='LINI_FIELD_NULLABILITY'&&item.loss)).toBe(true);
 const cardinalityEdit=structuredClone(original);cardinalityEdit.structure.references[0].toCardinality='one-or-many';const cardinalityResult=liniAdapter.serialize(cardinalityEdit,context);
 expect(cardinalityResult.text).toBe(first.text);expect(cardinalityResult.diagnostics.some(item=>item.code==='LINI_CARDINALITY'&&item.loss)).toBe(true);
});

test('Lini has no qualified key or cardinality class mapping; native feature attempts are hard refusals',()=>{
 const keySource='|entity#n_0| "Account" [\n|cell#f_0| "id" .pk; "uuid"\n]';
 const key=liniAdapter.parse(keySource,context);expect(key.visual).toBeUndefined();expect(key.diagnostics.some(item=>item.severity==='error')).toBe(true);
 const cardinalitySource='|entity#n_0| "Account" [\n|cell#f_0| "id"; "uuid"\n]\n|entity#n_1| "Event" [\n|cell#f_0| "id"; "uuid"\n]\nn_0 -> n_1 .one-to-many';
 const cardinality=liniAdapter.parse(cardinalitySource,context);expect(cardinality.visual).toBeDefined();expect(cardinality.diagnostics.some(item=>item.code==='LINI_LINK_CLASS'&&item.loss)).toBe(true);
 const labelOnly=liniAdapter.parse(cardinalitySource.replace(' .one-to-many',' "one-to-many"'),context);
 expect(labelOnly.visual?.structure?.references?.[0]).toMatchObject({label:'one-to-many'});
 expect(labelOnly.visual?.structure?.references?.[0]?.toCardinality).toBeUndefined();
 expect(labelOnly.diagnostics.some(item=>item.code==='LINI_REFERENCE_DIRECTION'&&item.loss)).toBe(true);
});
