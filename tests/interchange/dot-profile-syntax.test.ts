// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,test} from 'bun:test';
import {quoteDotProfile,readDotProfile} from '../../src/interchange/dot/profile-syntax';
describe('bounded explicit-profile DOT reader',()=>{
 test('retains nested ownership, exact strings, attributes and parallel edges',()=>{
  const label='Path: /source\nValue: "C:\\work\\N" 😀';
  const graph=readDotProfile('digraph "d" { graph [rankdir=LR]; subgraph "cluster_a" { label="A"; "n" [label='+quoteDotProfile(label)+']; } "n" -> "m" [label="one"]; "n" -> "m" [label="two"]; }');
  expect(graph.statements[1]).toEqual({kind:'subgraph',id:'cluster_a',statements:[{kind:'assignment',name:'label',value:'A'},{kind:'node',id:'n',attributes:[{name:'label',value:label}]}]});
  expect(graph.statements.filter(s=>s.kind==='edge')).toHaveLength(2);
 });
 test('refuses unsupported and ambiguous grammar instead of skipping it',()=>{
  for(const source of ['digraph d { a [label="x",label="y"]; }','digraph d { a:p -> b; }','digraph d { a [label=<b>]; }','digraph d { a -> b -> c; }','digraph d { a [label="\\N"]; }','digraph d { a; } trailing','digraph d { /* broken'])expect(()=>readDotProfile(source)).toThrow();
  expect(()=>readDotProfile('digraph d {'+'subgraph s {'.repeat(34)+'}'.repeat(35))).toThrow('depth');
 });
 test('does not normalize hostile scalar strings',()=>{
  for(const value of ['\t','\r','\u0000','\ud800'])expect(()=>quoteDotProfile(value)).toThrow();
  for(const value of ['', '[] {} ; -> # // " \\', '😀\nline', '\\N'])expect((readDotProfile('digraph d { n [label='+quoteDotProfile(value)+']; }').statements[0] as any).attributes[0].value).toBe(value);
 });
 test('entities option reads HTML label tokens and endpoint ports',()=>{
  const graph=readDotProfile('digraph x { a [label=<<TABLE><TR><TD PORT="p">x</TD></TR></TABLE>>]; a:p -> b:q; }',{entities:true});
  const node=graph.statements.find(item=>item.kind==='node');
  const edge=graph.statements.find(item=>item.kind==='edge');
  expect(node?.kind==='node'&&node.attributes[0]).toMatchObject({name:'label',html:true});
  expect(edge).toMatchObject({kind:'edge',from:'a',fromPort:'p',to:'b',toPort:'q'});
  expect(()=>readDotProfile('digraph x { a:p -> b; }')).toThrow();
  expect(()=>readDotProfile('digraph x { a -> b:p; }')).toThrow();
  expect(()=>readDotProfile('digraph x { a [label=<b>]; }')).toThrow();
 });
});
