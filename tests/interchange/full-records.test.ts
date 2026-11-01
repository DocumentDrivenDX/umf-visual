// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {compileFullRecords,recoverFullRecords,reconcileFullEndpoints} from '../../src/interchange/full/records';
import {compileFullScene} from '../../src/interchange/full/scene';
import flow from '../../fixtures/catalog/canary-flow.json';
import entities from '../../fixtures/catalog/canary-entities.json';
import meter from '../../fixtures/visual/forms/umf-ac-coverage.json';

test('complete visible record codec preserves unknown data, empty containers and exact scalars',()=>{
 const source={text:'  quote " · 東京\nline\tend  ',empty:'',negative:-42,a:[],o:{},unknown:{'a/b':{'~':[false,null,42]}},'':true};
 const records=compileFullRecords(source),recovered=recoverFullRecords(records) as any;
 expect(recovered).toEqual(source);expect(()=>compileFullRecords({negativeZero:-0})).toThrow();
 expect(records.some(record=>record.path==='/unknown/a~1b/~0/0')).toBe(true);
 expect(()=>recoverFullRecords(records.slice(1))).toThrow();
 expect(()=>recoverFullRecords([...records,records[0]!])).toThrow();
 expect(()=>recoverFullRecords(records.filter(record=>record.path!=='/unknown/a~1b/~0/1'))).toThrow();
});
test('record compiler does not invoke getters',()=>{
 let called=false;const source=Object.defineProperty({},'hostile',{enumerable:true,get(){called=true;throw new Error('getter');}});
 expect(()=>compileFullRecords(source)).toThrow();expect(called).toBe(false);
});
test('first slice has meaningful primary diagrams plus exhaustive source slots',()=>{
 for(const format of ['dot','mermaid','lini'] as const)for(const document of [flow,entities,meter]){
  const scene=compileFullScene(document,format);
  expect(recoverFullRecords(scene.records)).toEqual(document as any);
  expect(scene.nodes.length).toBeGreaterThan(2);expect(scene.edges.length).toBeGreaterThan(0);
  if(scene.kind==='metric')expect(scene.nodes.some(node=>node.width!==undefined)).toBe(true);
 }
});
test('source endpoint edits follow the actual native connection',()=>{
 const scene=compileFullScene(flow,'dot'),edge=scene.edges.find(edge=>edge.fromRecordId)!;
 edge.to=edge.from;reconcileFullEndpoints(scene);
 const recovered=recoverFullRecords(scene.records) as any;
 expect(recovered.extensions['umf.visual'].edges[0].to).toBe('parser');
});
