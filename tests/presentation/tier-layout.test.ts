// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {orderTiered} from '../../src/presentation/tier-layout';

test('numeric tiers sort ascending with stable source-order ties without mutating input',()=>{
 const first={id:'first',tier:3},early={id:'early',tier:1},second={id:'second',tier:3},middle={id:'middle',tier:2},input=[first,early,second,middle],snapshot=[...input];
 const result=orderTiered(input);
 expect(result).toEqual([early,middle,first,second]);
 expect(result[2]).toBe(first);expect(result[3]).toBe(second);
 expect(input).toEqual(snapshot);expect(input[0]).toBe(first);expect(input[1]).toBe(early);
});

test('missing child tiers remain missing and sort after authored numeric tiers',()=>{
 const outer={id:'outer',tier:8},inner:{id:string;parent:string;tier?:number}={id:'inner',parent:'outer'},peer={id:'peer',tier:10},items=[peer,inner,outer];
 const result=orderTiered(items);
 expect(result).toEqual([outer,peer,inner]);expect(inner.tier).toBeUndefined();expect(items).toEqual([peer,inner,outer]);
});

test('empty and singleton inputs return fresh arrays containing the original item references',()=>{
 const empty:{id:string;tier?:number}[]=[];expect(orderTiered(empty)).not.toBe(empty);expect(orderTiered(empty)).toEqual([]);
 const item={id:'only',tier:2},single=[item],ordered=orderTiered(single);expect(ordered).not.toBe(single);expect(ordered).toEqual([item]);expect(ordered[0]).toBe(item);
});
