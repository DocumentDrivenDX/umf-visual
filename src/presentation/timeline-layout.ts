// SPDX-License-Identifier: MIT OR Apache-2.0
/** Calendar ordering helpers for date-history presentations; values are UTC days, not pixels. */
import type {Visual} from '../extensions/visual';
import {utcCalendarDay} from './calendar';
export {utcCalendarDate,utcCalendarDay} from './calendar';

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
