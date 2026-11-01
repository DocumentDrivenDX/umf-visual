// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,test} from 'bun:test';
import {compileFullRecords,recoverFullRecords} from '../../src/interchange/full/records';
import {mermaidFullAdapter} from '../../src/interchange/mermaid/full';
import type {FullScene} from '../../src/interchange/full/types';

const sample={
 nodes:[{id:'source/one',label:'Alpha <beta> & "gamma" #10;\nsecond'},{id:'target',label:'Beta'}],
 edges:[{from:'source/one',to:'target',label:'moves data'}],
 groups:[{label:'Outer'},{label:'Inner'}],
 additional:{'x/y':true,'tilde~key':null,items:[1,'two']},
};
const at=(records:ReturnType<typeof compileFullRecords>,path:string)=>records.find(row=>row.path===path)!.id;
function scene():FullScene {
 const records=compileFullRecords(sample);
 return {format:'mermaid',profile:'umf.visual.mermaid.full/1',version:'1',kind:'flow',form:'network',records,
  nodes:[
   {id:'visual-node-a',identityRecordId:at(records,'/nodes/0/id'),recordId:at(records,'/nodes/0/label'),shape:'ellipse',group:'outer',width:108},
   {id:'visual-node-b',identityRecordId:at(records,'/nodes/1/id'),recordId:at(records,'/nodes/1/label'),shape:'diamond',group:'inner'},
  ],
  edges:[{id:'visual-edge',from:'visual-node-a',to:'visual-node-b',recordId:at(records,'/edges/0/label'),fromRecordId:at(records,'/edges/0/from'),toRecordId:at(records,'/edges/0/to')}],
  groups:[{id:'outer',recordId:at(records,'/groups/0/label')},{id:'inner',recordId:at(records,'/groups/1/label'),parent:'outer'}],approximations:[]};
}

describe('Mermaid full-scene native carrier',()=>{
 test('emits readable primary concepts and typed residual records, then reconstructs the complete document',()=>{
  const input=scene(),source=mermaidFullAdapter.emit(input);
  expect(source).toStartWith('flowchart TD\n');expect(source).toContain('subgraph');expect(source).toContain('Additional properties');
  expect(source).toContain('Alpha #60;beta#62; #38; #34;gamma#34; #35;10;#10;second');
  expect(source).toContain('moves data');expect(source).toContain('▮▮▮ #124; ');expect(source).not.toContain('"value":"Alpha');
  const output=mermaidFullAdapter.read(source);
  expect(output.records).toEqual(input.records);expect(output.nodes).toEqual(input.nodes);expect(output.edges).toEqual(input.edges);expect(output.groups).toEqual(input.groups);
  expect(output.locators?.[at(input.records,'/nodes/0/label')]).toEqual([{id:expect.stringContaining('n_'),slot:'label'}]);
  expect(output.locators?.[at(input.records,'/edges/0/from')]).toEqual([{id:expect.stringContaining('-->'),slot:'from'}]);
  expect(recoverFullRecords(output.records)).toEqual(sample);
 });

 test('derives endpoint edits from native connections and label edits from visible labels',()=>{
  const input=scene(),source=mermaidFullAdapter.emit(input);
  const oldToken='n_'+Array.from('visual-node-a',char=>char.charCodeAt(0).toString(16).padStart(4,'0')).join('');
  const newToken='n_'+Array.from('visual-node-b',char=>char.charCodeAt(0).toString(16).padStart(4,'0')).join('');
  const changed=source.replace('Alpha #60;beta#62; #38; #34;gamma#34; #35;10;#10;second', 'Renamed node').replace(oldToken+' -->|', newToken+' -->|');
  const output=mermaidFullAdapter.read(changed),document=recoverFullRecords(output.records) as typeof sample;
  expect(document.nodes[0]!.label).toBe('Renamed node');expect(document.edges[0]!.from).toBe('target');expect(output.edges[0]!.from).toBe('visual-node-b');
 });

 test('refuses statements and structural edits outside its emitted grammar',()=>{
  const source=mermaidFullAdapter.emit(scene());
  expect(()=>mermaidFullAdapter.read(source.replace('flowchart TD','flowchart LR'))).toThrow();
  expect(()=>mermaidFullAdapter.read(source.replace('moves data','moves data\n  A --> B'))).toThrow();
  expect(mermaidFullAdapter.read(source.replace('subgraph g_006f0075007400650072["Outer"]','subgraph g_006f0075007400650072["Forged"]')).groups[0]!.recordId).toBe(scene().groups[0]!.recordId);
  const unsupported=source.replace('([' , '((').replace('])', '))');
  expect(()=>mermaidFullAdapter.read(unsupported)).toThrow();
  expect(()=>mermaidFullAdapter.read(source.replace('"shape":"ellipse"','"shape":"diamond"'))).toThrow();
  expect(()=>mermaidFullAdapter.read(source.replace('"profile":"umf.visual.mermaid.full/1"','"profile":"invented-profile"'))).toThrow();
  expect(()=>mermaidFullAdapter.read(source.replace('"profile":"umf.visual.mermaid.full/1"','"profile":"umf.visual.mermaid.full/1","unrecognized":true'))).toThrow();
 });

 test('emits and recovers undirected relationships as actual non-arrow Mermaid links',()=>{
  const input=scene();input.edges.push({id:'undirected',from:'visual-node-a',to:'visual-node-b',directed:false,text:'association'});
  const source=mermaidFullAdapter.emit(input);expect(source).toContain(' ---|"association"| ');
  expect(mermaidFullAdapter.read(source).edges[1]).toMatchObject({directed:false,text:'association'});
 });
});
