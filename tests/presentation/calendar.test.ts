// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {utcCalendarDate,utcCalendarDay} from '../../src/presentation/calendar';

test('calendar conversion roundtrips leap days, early years, and Gregorian century boundaries',()=>{
 const dates=['0000-01-01','0000-02-29','0000-12-31','0001-01-01','0004-02-29','0099-12-31','0100-01-01','0400-02-29','1900-03-01','2000-02-29','2026-10-23','9999-12-31'];
 for(const date of dates){const day=utcCalendarDay(date);expect(day).toBeDefined();expect(utcCalendarDate(day!)).toBe(date);}
 expect(utcCalendarDate(0)).toBe('0000-01-01');
 expect(utcCalendarDay('0000-01-01')).toBe(0);
 expect(utcCalendarDay('0001-01-01')).toBe(366);
});

test('inverse conversion rejects noninteger, nonfinite, negative, and out-of-calendar ordinals',()=>{
 const last=utcCalendarDay('9999-12-31')!;
 for(const invalid of [-1,0.5,NaN,Infinity,-Infinity,last+1,Number.MAX_SAFE_INTEGER])expect(utcCalendarDate(invalid)).toBeUndefined();
});

test('forward conversion rejects impossible dates and unsupported lexical forms',()=>{
 for(const invalid of ['1900-02-29','2026-02-30','2026-13-01','2026-00-01','2026-01-00','2026-1-01','2026-01','+2026-01-01'])expect(utcCalendarDay(invalid)).toBeUndefined();
});
