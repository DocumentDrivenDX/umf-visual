// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,test} from 'bun:test';
import {quoteLiniProfile,readLiniProfile} from '../../src/interchange/lini/profile-syntax';
describe('bounded explicit-profile Lini reader',()=>{
 test('reads nested charts, typed date/value tuples, tables and grid functions',()=>{
  const roots=readLiniProfile('|group#g| { layout: grid; columns: 140, repeat(8, 110); } [ |chart#c| "Trend" { width: 700; } [ |axis#time| { scale: time; } |line#s| "Series" { data: "2026-10-02" 55, "2026-10-07" 63; } ] |table#t| [ |cell#v| "value"; ] ]');
  expect(roots[0].children[0].children[1].properties[0].value.map(t=>[t.kind,t.value])).toEqual([['string','2026-10-02'],['number','55'],['symbol',','],['string','2026-10-07'],['number','63']]);
  expect(roots[0].children[1].children[0].label).toBe('value');
 });
 test('refuses duplicate identities/properties and unsupported/trailing syntax',()=>{
  for(const source of ['|block#a|; |block#a|;', '|chart#a| { width: 1; width: 2; }','|block#a| "x" ???','|group#a| [ |block#b|','|block#a| { width: repeat(2; }','|block#a| { width: ; }','|block#a| "\\u0041"','|block#a| ]'])expect(()=>readLiniProfile(source)).toThrow();
  expect(()=>readLiniProfile('|group#g0| ['+Array.from({length:34},(_,i)=>'|group#g'+(i+1)+'| [').join('')+']'.repeat(35))).toThrow('depth');
 });
 test('preserves scalar escaping and refuses normalization-prone controls',()=>{
  for(const value of ['', '[] {} ; // " \\', '😀\nline\ttab'])expect(readLiniProfile('|cell#a| '+quoteLiniProfile(value))[0].label).toBe(value);
  for(const value of ['\r','\u0000','\ud800'])expect(()=>quoteLiniProfile(value)).toThrow();
 });
});
