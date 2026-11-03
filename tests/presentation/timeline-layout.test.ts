// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {planDateHistoryEvents,utcCalendarDay} from '../../src/presentation/timeline-layout';

test('UTC calendar day ordinals validate real dates and support early four-digit years',()=>{
 expect(utcCalendarDay('0000-01-01')).toBe(0);
 expect(utcCalendarDay('0000-02-29')).toBe(59);
 expect(utcCalendarDay('0000-03-01')).toBe(60);
 expect(utcCalendarDay('0001-01-01')).toBe(366);
 expect(utcCalendarDay('1900-02-29')).toBeUndefined();
 expect(utcCalendarDay('2000-02-29')).toBeDefined();
 expect(utcCalendarDay('2026-02-30')).toBeUndefined();
 expect(utcCalendarDay('2026-01')).toBeUndefined();
});

test('date-history layout sorts for display, preserves stable ties and never mutates source order',()=>{
 const events=[
  {id:'late',label:'Late',at:'2026-01-03'},
  {id:'same-first',label:'Same first',at:'2026-01-02'},
  {id:'early',label:'Early',at:'2026-01-01'},
  {id:'same-second',label:'Same second',at:'2026-01-02'}
 ];
 const original=structuredClone(events),plan=planDateHistoryEvents(events);
 expect(plan?.ok).toBe(true);
 if(!plan||!plan.ok)return;
 expect(plan.lastDay-plan.firstDay).toBe(2);
 expect(plan.events.map(row=>[row.sourceIndex,row.event.id,row.dayOffset,row.sameDateStackIndex,row.sameDateCount])).toEqual([
  [2,'early',0,0,1],[1,'same-first',1,0,2],[3,'same-second',1,1,2],[0,'late',2,0,1]
 ]);
 expect(events).toEqual(original);
});

test('date-history layout identifies the exact invalid source row instead of normalizing it',()=>{
 const events=[{id:'valid',label:'Valid',at:'2026-01-01'},{id:'invalid',label:'Invalid',at:'2026-02-30'}];
 expect(planDateHistoryEvents(events)).toEqual({ok:false,sourceIndex:1,date:'2026-02-30'});
 expect(events[1]?.at).toBe('2026-02-30');
});
