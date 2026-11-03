// SPDX-License-Identifier: MIT OR Apache-2.0
/** Exact-date history projection to Lini's native positioned primitives. */
import type {Visual} from '../extensions/visual';
import {quoteLiniProfile} from '../interchange/lini/profile-syntax';
import {planDateHistoryEvents} from './timeline-layout';
import type {PresentationApproximation,PresentationElement,PresentationFailure,PresentationOmission,PresentationPlan} from './index';

const BASE='/extensions/umf.visual';
const path=(suffix:string)=>BASE+(suffix.startsWith('/')?suffix:'/'+suffix);
const fail=(code:string,suffix:string,message:string):PresentationFailure=>({ok:false,diagnostics:[{code,path:path(suffix),message,severity:'error'}]});
const safeId=(index:number)=>'event'+(index+1);
const quote=quoteLiniProfile;

// This is a conservative source-text budget, not a font measurement; native
// browser bounds remain the qualification check for actual caption clearance.
const textWidthEstimate=(text:string)=>Array.from(text).reduce((sum,char)=>sum+9.4*(/[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uff01-\uff60]/u.test(char)?1:/[ilI.,'`!|:;]/u.test(char)?0.42:/[MW@#%&]/u.test(char)?0.9:0.62),0);
interface TrackPlacement {sourceIndex:number;track:number;halfWidth:number;}

/** Greedy interval coloring in native scene coordinates; rows are only collision packing. */
function assignLabelTracks(rows:NonNullable<ReturnType<typeof planDateHistoryEvents>>&{ok:true},plotWidth:number):TrackPlacement[]{
 const span=rows.lastDay-rows.firstDay,trackEnds:number[]=[],placements:TrackPlacement[]=[];
 for(const row of rows.events){
  const eventText=row.event.label+' · '+row.event.at,halfWidth=textWidthEstimate(eventText)/2;
  const center=span===0?plotWidth/2:row.dayOffset/span*plotWidth;
  let track=trackEnds.findIndex(end=>center-halfWidth>=end+18);
  if(track<0)track=trackEnds.length;
  trackEnds[track]=center+halfWidth;placements.push({sourceIndex:row.sourceIndex,track,halfWidth});
 }
 return placements;
}

function validate(visual:Visual):PresentationFailure|undefined{
 const timeline=visual.timeline;
 if(visual.kind!=='timeline'||visual.form!=='history')return fail('PRESENTATION_LINI_TIMELINE_SCOPE','/form','Lini date-history presentation supports timeline/history only.');
 if(!timeline||timeline.scale.kind!=='date')return fail('PRESENTATION_LINI_TIMELINE_SCOPE','/timeline/scale','Lini history presentation requires an exact date scale.');
 for(const key of ['lanes','spans','markers'] as const)if(timeline[key]!==undefined)return fail('PRESENTATION_LINI_TIMELINE_SCOPE','/timeline/'+key,'This bounded history profile supports events only; lanes, spans, and markers are not silently dropped.');
 if(visual.layout!==undefined)return fail('PRESENTATION_LINI_TIMELINE_SCOPE','/layout','Timeline layout hints have no qualified native projection.');
 if(visual.annotations?.length)return fail('PRESENTATION_LINI_TIMELINE_SCOPE','/annotations','Unanchored annotations do not have a qualified placement in the native history scene.');
 if(visual.steps!==undefined)return fail('PRESENTATION_LINI_TIMELINE_SCOPE','/steps','Walkthrough steps are retained in UMF but are outside the static native history profile.');
 for(const[index,event]of(timeline.events??[]).entries())for(const key of ['lane','detail','status','emphasis'] as const)if(event[key]!==undefined)return fail('PRESENTATION_LINI_TIMELINE_SCOPE',`/timeline/events/${index}/${key}`,`Event ${key} is outside the qualified date-history subset.`);
 return undefined;
}

/** Compile an exact date history while preserving original event pointers and dates. */
export function compileLiniTimelinePresentation(visual:Visual):PresentationPlan|PresentationFailure{
 const unsupported=validate(visual);if(unsupported)return unsupported;
 const timeline=visual.timeline!,events=timeline.events??[],planned=planDateHistoryEvents(events);
 if(!planned)return fail('PRESENTATION_LINI_TIMELINE_EVENTS','/timeline/events','At least one dated event is required.');
 if(!planned.ok)return fail('PRESENTATION_LINI_TIMELINE_DATE',`/timeline/events/${planned.sourceIndex}/at`,`Invalid exact calendar date ${JSON.stringify(planned.date)} cannot be mapped to the date axis.`);
 const title=visual.title??visual.question;
 const plotStart=-540,plotWidth=1080,trackPlacements=assignLabelTracks(planned,plotWidth),tracksBySource=new Map(trackPlacements.map(placement=>[placement.sourceIndex,placement.track]));
 const trackCount=Math.max(1,...trackPlacements.map(item=>item.track+1));
 const rowSpacing=Math.max(26,...events.map(event=>(event.label.split('\n').length+1)*18+8)),rowOffset=(track:number)=>Math.ceil((track+1)/2)*rowSpacing*(track%2===0?-1:1);
 const chartHeight=Math.max(360,Math.max(...trackPlacements.map(item=>Math.abs(rowOffset(item.track))))*2+100);
 const maps:PresentationElement[]=[{logicalId:visual.id,sourcePath:path('/id'),nativeId:'timeline-history',kind:'visual'}];
 const omissions:PresentationOmission[]=[],approximations:PresentationApproximation[]=[];
 const omit=(suffix:string,reason:string)=>omissions.push({sourcePath:path(suffix),reason});
 if(visual.title&&visual.question!==visual.title)omit('/question','The full question remains in the source; the native chart displays the concise title.');
 if(visual.takeaway)omit('/takeaway','Takeaway remains in UMF and is not drawn as chart content.');
 if(visual.source)omit('/source','Source provenance remains in UMF and is not embedded in chart geometry.');
 if(visual.audience)omit('/audience','Audience metadata remains in the source document and is not drawn.');
 if(visual.omissions)for(let index=0;index<visual.omissions.length;index++)omit('/omissions/'+index,'The authored omission inventory remains in UMF and is not drawn.');
 const chartId='timeline-history';
 for(const[index,event]of events.entries())maps.push({logicalId:event.id,sourcePath:path('/timeline/events/'+index),nativeId:safeId(index),kind:'event'});
 const lines=[
  `{\n  --lini-font-family: Arial;\n  .lini-block { font-family: Arial; }\n  .lini-caption { font-size: 22; font-weight: 600; color: --blue-deep; }\n}\n`,
  `|group#${chartId}| ${quote(title)} { layout: flow; direction: row; width: 1280; height: ${chartHeight}; padding: 24; fill: none; stroke: none; stroke-width: 0; } [`,
  `  |line#timeline-axis| "" { points: ${plotStart} 0, ${plotStart+plotWidth} 0; marker: none; stroke: --blue-deep; stroke-width: 2; }`,
 ];
 for(const placement of planned.events){
  const index=placement.sourceIndex,event=placement.event,nativeId=safeId(index),markerId='mark'+(index+1),display=event.label+' · '+event.at;
  try{quote(display);}catch(error){return fail('PRESENTATION_LINI_TIMELINE_TEXT',`/timeline/events/${index}/label`,error instanceof Error?error.message:'Event text is not supported by the pinned Lini profile.');}
  const x=planned.firstDay===planned.lastDay?0:plotStart+placement.dayOffset/(planned.lastDay-planned.firstDay)*plotWidth,y=rowOffset(tracksBySource.get(index)!);
  lines.push(`  |oval#${markerId}| { pin: center; translate: ${x} 0; width: 8; height: 8; fill: --rose-deep; stroke: none; }`);
  lines.push(`  |box#${nativeId}| ${quote(display)} { pin: center; translate: ${x} ${y}; width: ${Math.ceil(textWidthEstimate(display)+10)}; padding: 0; fill: none; stroke: none; font-size: 12; color: --gray-deep; }`);
 }
 lines.push(']');
 approximations.push({sourcePath:path('/timeline/events'),requested:'Exact calendar-date timeline and readable event labels',representation:'Each renderer-owned event marker is positioned at its exact date on a linear horizontal time axis; the source-mapped native caption displays the exact source label and ISO date together at the same x coordinate. Equal-date events share x and receive stable separate y rows only to prevent label collisions. Those rows carry no lane, measure, or chronology meaning. The renderer uses native positioned Lini primitives rather than a chart because Lini 1.1 exposes an unavoidable numeric value axis for chart marks.'});
 if(planned.firstDay===planned.lastDay)approximations.push({sourcePath:path('/timeline/events'),requested:'Single-date history',representation:'All event markers share one date coordinate; row offsets are collision packing only and do not imply duration or sequence.'});
 return{ok:true,profileId:'umf.visual.presentation/1',backend:'lini',nativeFormat:'lini',source:lines.join('\n')+'\n',elementMap:maps,omissions,approximations};
}
