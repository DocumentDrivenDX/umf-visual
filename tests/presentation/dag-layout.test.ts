import {describe,expect,it} from 'bun:test';
import {directedDagRanks} from '../../src/presentation/dag-layout';

describe('renderer-owned DAG ranks',()=>{
 it('groups independent roots and keeps source order among ties',()=>{
  const ranks=directedDagRanks(['lint','test','migrations','build','deploy'],[
   {from:'lint',to:'build'},{from:'test',to:'build'},{from:'migrations',to:'build'},{from:'build',to:'deploy'},
  ]);
  expect(ranks).toBeDefined();
  expect([...ranks!.values()]).toEqual([0,0,0,1,2]);
 });
 it('keeps isolated declarations in the first rank and deduplicates repeated graph constraints',()=>{
  const ranks=directedDagRanks(['a','b','c'],[{from:'a',to:'b'},{from:'a',to:'b'}]);
  expect([...ranks!.values()]).toEqual([0,1,0]);
 });
 it('declines cycles, unresolved endpoints, duplicate IDs and headless links',()=>{
  expect(directedDagRanks(['a','b'],[{from:'a',to:'b'},{from:'b',to:'a'}])).toBeUndefined();
  expect(directedDagRanks(['a'],[{from:'a',to:'missing'}])).toBeUndefined();
  expect(directedDagRanks(['a','a'],[])).toBeUndefined();
  expect(directedDagRanks(['a','b'],[{from:'a',to:'b',directed:false}])).toBeUndefined();
 });
});
