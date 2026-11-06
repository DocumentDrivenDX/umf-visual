// SPDX-License-Identifier: MIT OR Apache-2.0
/** Pure proleptic-Gregorian calendar conversions using integer UTC day ordinals. */

/** Convert a full proleptic-Gregorian YYYY-MM-DD date to an integer day since 0000-01-01 UTC. */
export function utcCalendarDay(date:string):number|undefined {
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);if(!match)return;
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
 if(month<1||month>12||day<1)return;
 const leap=year%4===0&&(year%100!==0||year%400===0),monthLengths=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(day>monthLengths[month-1]!)return;
 // Count leap years in [0, year), including year 0000. Avoid Date.UTC's special
 // handling of years 0000–0099 and keep the calculation timezone independent.
 const priorYears=year,leapYears=Math.floor((year+3)/4)-Math.floor((year+99)/100)+Math.floor((year+399)/400);
 let ordinal=365*priorYears+leapYears+day-1;
 for(let index=0;index<month-1;index++)ordinal+=monthLengths[index]!;
 return ordinal;
}

/** Convert an integer UTC day since 0000-01-01 back to a YYYY-MM-DD calendar date. */
export function utcCalendarDate(day:number):string|undefined {
 const last=utcCalendarDay('9999-12-31')!;
 if(!Number.isSafeInteger(day)||day<0||day>last)return;
 let low=0,high=10000;
 while(low+1<high){const middle=Math.floor((low+high)/2),start=utcCalendarDay(`${String(middle).padStart(4,'0')}-01-01`)!;if(start<=day)low=middle;else high=middle;}
 const year=low,isLeap=year%4===0&&(year%100!==0||year%400===0),monthLengths=[31,isLeap?29:28,31,30,31,30,31,31,30,31,30,31];
 let remaining=day-utcCalendarDay(`${String(year).padStart(4,'0')}-01-01`)!;
 let month=0;while(remaining>=monthLengths[month]!){remaining-=monthLengths[month]!;month++;}
 return`${String(year).padStart(4,'0')}-${String(month+1).padStart(2,'0')}-${String(remaining+1).padStart(2,'0')}`;
}
