// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,test} from 'bun:test';
import {decodeAnnotationValue} from '../../src/interchange/annotations';
import {compileFullRecords,fullRecordId} from '../../src/interchange/full/records';
import type {FullRecord,FullScene} from '../../src/interchange/full/types';
import {dotFullAdapter} from '../../src/interchange/dot/full';
import {readDotProfile} from '../../src/interchange/dot/profile-syntax';

function scene():FullScene{
 const records=compileFullRecords({question:'How does the cache reach the store?',nodes:[{id:'source',label:'Read input'},{id:'store',label:'Write value'}],
  groups:[{id:'storage-group',label:'Storage'}],edges:[{id:'write-edge',from:'source',to:'store',label:'Persist'}]});
 const at=(path:string)=>{const found=records.find(record=>record.path===path);if(!found)throw new Error(`Missing source record ${path}`);return found;};
 return{format:'dot',profile:'umf.visual.dot.full/1',version:'1',kind:'flow',form:'network',records,
  nodes:[{id:'source',identityRecordId:at('/nodes/0/id').id,recordId:at('/nodes/0/label').id,shape:'ellipse',width:1.25,group:'storage-group'},
   {id:'store',identityRecordId:at('/nodes/1/id').id,recordId:at('/nodes/1/label').id,shape:'box',text:'Transactional target',group:'storage-group'}],
  edges:[{id:'write-edge',from:'source',to:'store',recordId:at('/edges/0/label').id,fromRecordId:at('/edges/0/from').id,toRecordId:at('/edges/0/to').id}],
  groups:[{id:'storage-group',recordId:at('/groups/0/label').id}],
  approximations:[{path:'/nodes/0/width',requested:'1.25',renderedAs:'minimum width',reason:'Graphviz may expand the native minimum width to fit visible label text.'}]};
}

describe('full native DOT scene adapter',()=>{
 test('round-trips visible bound values, residual notes, graph primitives, groups, endpoints and approximations',()=>{
  const source=scene(),native=dotFullAdapter.emit(source),read=dotFullAdapter.read(native);
  const {locators,...recovered}=read;expect(recovered).toEqual(source);
  expect(Object.keys(locators??{}).sort()).toEqual(source.records.map(record=>record.id).sort());
  for(const entries of Object.values(locators??{}))expect(entries).toHaveLength(1);
  expect(locators?.[source.nodes[0]!.recordId!]).toEqual([{id:'umf_full_node_736f75726365',slot:'label'}]);
  expect(locators?.[source.edges[0]!.fromRecordId!]).toEqual([{id:'umf_full_edge_77726974652d65646765',slot:'from'}]);
  expect(native).toContain('Additional properties');
  expect(native).toContain('umf_record_path');
  expect(native).toContain('shape="ellipse"');
  expect(native).toContain('shape="box"');
  expect(native).toContain('umf_from_record_id');
  expect(native).not.toContain('umf_record_path="/edges/0/from"');
  const ast=readDotProfile(native);
  expect(ast.statements.some(item=>item.kind==='subgraph'&&item.id.startsWith('cluster_umf_full_group_'))).toBe(true);
 });

 test('a visible native label edit changes the recovered primary record value',()=>{
  const source=scene(),text=dotFullAdapter.emit(source).replace('label="Read input"','label="Read from disk"');
  const result=dotFullAdapter.read(text),edited=result.records.find(record=>record.id===source.nodes[0]!.recordId);
  expect(edited?.value).toBe(JSON.stringify('Read from disk'));
 });

 test('string labels render as decoded text and recover the canonical typed wire',()=>{
  const source=scene(),text=dotFullAdapter.emit(source);
  expect(text).toContain('label="Read input"');
  expect(dotFullAdapter.read(text).records.find(record=>record.id===source.nodes[0]!.recordId)?.value).toBe(JSON.stringify('Read input'));
 });

 test('reads and derives endpoint records from actual edited native edges',()=>{
  const source=scene(),text=dotFullAdapter.emit(source);
  const changed=text.replace('"umf_full_node_736f75726365" -> "umf_full_node_73746f7265"','"umf_full_node_736f75726365" -> "umf_full_node_736f75726365"');
  const read=dotFullAdapter.read(changed),edge=read.edges[0]!;
  expect(edge.to).toBe('source');
  expect(read.records.find(record=>record.id===edge.toRecordId)?.value).toBe(JSON.stringify('source'));
 });

 test('preserves explicit undirected references as native dir=none edges',()=>{
  const source=scene();source.edges[0]!.directed=false;
  const native=dotFullAdapter.emit(source);
  expect(native).toContain('dir="none"');
  expect(dotFullAdapter.read(native)).toMatchObject({edges:[{id:'write-edge',directed:false}]});
  const rendered=Bun.spawnSync(['dot','-Tjson'],{stdin:new TextEncoder().encode(native)});
  expect(rendered.exitCode).toBe(0);
  expect(JSON.parse(rendered.stdout.toString()).edges[0].dir).toBe('none');
 });

 test('orders residual-property notes vertically with a strict parsed layout-only chain',()=>{
  const source=dotFullAdapter.emit(scene());
  expect((source.match(/umf_layout="additional-order"/g)??[]).length).toBeGreaterThan(0);
  expect(()=>dotFullAdapter.read(source.replace('style="invis"','style="dashed"'))).toThrow(/ordering chain/i);
  const svg=Bun.spawnSync(['dot','-Tsvg'],{stdin:new TextEncoder().encode(source)});
  expect(svg.exitCode).toBe(0);
  const dimensions=svg.stdout.toString().match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/);
  expect(dimensions).not.toBeNull();
  expect(Number(dimensions?.[2])).toBeGreaterThan(Number(dimensions?.[1])*0.6);
 });

 test('refuses ambiguous IDs, missing relationships, altered native IDs, unknown attributes and residual omissions',()=>{
  const source=dotFullAdapter.emit(scene());
  for(const altered of [
   source.replace('umf_nodes_count="2"','umf_nodes_count="3"'),
   source.replace('shape="ellipse"','shape="hexagon"'),
   source.replace('umf_has_record="true"','umf_has_record="false"'),
   source.replace('rankdir="TB"','rankdir="LR"'),
   source.replace('umf_record_path="/question"','umf_record_path="/changed"'),
   source.replace('umf_id="write-edge"','umf_id="different-edge"'),
  ])expect(()=>dotFullAdapter.read(altered)).toThrow();
  const duplicate=scene();duplicate.nodes[1]!.id='source';expect(()=>dotFullAdapter.emit(duplicate)).toThrow(/duplicate/i);
  const missing=scene();missing.edges[0]!.to='missing';expect(()=>dotFullAdapter.emit(missing)).toThrow(/endpoint/i);
  const recordReuse=scene();recordReuse.nodes[1]!.recordId=recordReuse.nodes[0]!.recordId;expect(()=>dotFullAdapter.emit(recordReuse)).toThrow(/multiple/i);
 });

 test('records use the common typed visible-wire codec for scalars and containers',()=>{
  for(const [type,wire] of [['number','-0'],['boolean','true'],['null','null'],['array','Length: 2'],['object','Members: ["a"]']] as const){
   const record:FullRecord={id:fullRecordId('/value'),path:'/value',name:'value',type,value:wire};
   expect(decodeAnnotationValue(type,record.value)).toBeDefined();
  }
  const records=compileFullRecords({value:4.5}),s:FullScene={...scene(),records,nodes:[],edges:[],groups:[],approximations:[]};
  const text=dotFullAdapter.emit(s);expect(text).toContain('label="4.5"');expect(dotFullAdapter.read(text).records).toEqual(records);
 });

 test('Graphviz natively renders declared shapes, visible values, groups and directed endpoint connections',()=>{
  const native=dotFullAdapter.emit(scene()),process=Bun.spawnSync(['dot','-Tjson'],{stdin:new TextEncoder().encode(native)});
  expect(process.exitCode).toBe(0);expect(process.stderr.toString()).toBe('');
  const rendered=JSON.parse(process.stdout.toString()),objects=rendered.objects as any[],edges=rendered.edges as any[];
  const source=objects.find(item=>item.name==='umf_full_node_736f75726365'),store=objects.find(item=>item.name==='umf_full_node_73746f7265');
  expect(source?.shape).toBe('ellipse');expect(source?.label).toBe('Read input');expect(source?.umf_width_px).toBe('1.25');expect(Number(source?.width)).toBeGreaterThanOrEqual(1.25/96);
  expect(store?.shape).toBe('box');expect(store?.label).toBe('Write value');
  const semanticEdges=edges.filter(item=>String(item.id).startsWith('umf_full_edge_'));
  expect(semanticEdges).toHaveLength(1);expect(semanticEdges[0]).toMatchObject({tail:source?._gvid,head:store?._gvid,label:'Persist'});
  expect(objects.some(item=>item.name.startsWith('umf_full_record_')&&item.label==='How does the cache reach the store?')).toBe(true);
 });
});
