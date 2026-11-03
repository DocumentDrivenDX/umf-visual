// SPDX-License-Identifier: MIT OR Apache-2.0
/** Calendar ordering helpers for date-history presentations; values are UTC days, not pixels. */
import type {Visual} from '../extensions/visual';

export type DateHistoryEvent=NonNullable<NonNullable<Visual['timeline']>['events']>[number];

/** A stable display placement. `sourceIndex` always points back to the unchanged authored array. */
export interface DateHistoryEventPlacement {
 sourceIndex:number;
 event:DateHistoryEvent;
 day:number;
 dayOffset:number;
 sameDateStackIndex:number;
 sameDateCount:number;
}

export type DateHistoryEventPlan=
 |{ok:true;firstDay:number;lastDay:number;events:DateHistoryEventPlacement[]}
 |{ok:false;sourceIndex:number;date:string};

interface OrderedDateHistoryEvent {
 sourceIndex:number;
 event:DateHistoryEvent;
 day:number;
}

interface SuccessfulDateHistoryEventPlan {
 ok:true;
 firstDay:number;
 lastDay:number;
 events:DateHistoryEventPlacement[];
}

/** Convert a full proleptic-Gregorian YYYY-MM-DD date to an integer UTC day ordinal. */
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

/**
 * Build a stable chronological view for an exact-date history. Equal dates retain
 * authored array order and receive a deterministic zero-based same-date slot.
 * This returns presentation metadata only; it does not mutate or rewrite source data.
 */
export function planDateHistoryEvents(events:readonly DateHistoryEvent[]):DateHistoryEventPlan|undefined {
 if(events.length===0)return;
 const rows:OrderedDateHistoryEvent[]=[];
 for(const[sourceIndex,event]of events.entries()){
  const day=utcCalendarDay(event.at);if(day===undefined)return{ok:false,sourceIndex,date:event.at};
  rows.push({sourceIndex,event,day});
 }
 rows.sort((a,b)=>a.day-b.day||a.sourceIndex-b.sourceIndex);
 const firstDay=rows[0]!.day,lastDay=rows.at(-1)!.day,countByDay=new Map<number,number>();
 for(const row of rows)countByDay.set(row.day,(countByDay.get(row.day)??0)+1);
 const seenByDay=new Map<number,number>();
 const placements=rows.map(row=>{
  const sameDateStackIndex=seenByDay.get(row.day)??0;seenByDay.set(row.day,sameDateStackIndex+1);
  return{...row,dayOffset:row.day-firstDay,sameDateStackIndex,sameDateCount:countByDay.get(row.day)!};
 });
 return{ok:true,firstDay,lastDay,events:placements} satisfies SuccessfulDateHistoryEventPlan;
}
