// SPDX-License-Identifier: MIT OR Apache-2.0
/** Bounded date-history projections for Graphviz and Mermaid. */
import type {Visual} from '../extensions/visual';
import {planDateHistoryEvents,type DateHistoryEventPlacement} from './timeline-layout';
import type {PresentationBackend,PresentationDiagnostic,PresentationElement,PresentationFailure,PresentationPlan} from './index';

const BASE='/extensions/umf.visual';
const path=(suffix:string)=>BASE+(suffix.startsWith('/')?suffix:'/'+suffix);
const diagnostic=(code:string,suffix:string,message:string):PresentationDiagnostic=>({code,path:path(suffix),message,severity:'error'});
const dot=(value:string)=>'"'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\t/g,'\\t')+'"';
const html=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<BR ALIGN="LEFT"/>');
const mermaidChar=(char:string)=>({' ':'#32;','#':'#35;','&':'#38;','"':'#34;','<':'#60;','>':'#62;',';':'#59;','(':'#40;',')':'#41;','[':'#91;',']':'#93;','{':'#123;','}':'#125;','\\':'#92;'} as Record<string,string>)[char]??char;
const mermaidText=(value:string)=>value.replace(/\r/g,'').split('\n').map(line=>Array.from(line,mermaidChar).join('')).join('<br/>');
const safeId=(prefix:string,index:number)=>prefix+(index+1);
function gridColumns(rows:DateHistoryEventPlacement[]):number {
 const widestLine=Math.max(1,...rows.flatMap(row=>[row.event.label,row.event.at,'id: '+row.event.id].flatMap(value=>value.split('\n')).map(line=>Array.from(line).length)));
 const estimatedCardWidth=widestLine*9+44,estimatedCardHeight=3*22+32,desiredAspect=16/9;
 return Math.max(2,Math.min(8,Math.round(Math.sqrt(rows.length*desiredAspect/(estimatedCardWidth/estimatedCardHeight)))));
}

function validateHistory(visual:Visual):PresentationFailure|undefined {
 if(visual.kind!=='timeline'||visual.form!=='history')return{ok:false,diagnostics:[diagnostic('PRESENTATION_TIMELINE_SCOPE','/form','The date-history projection supports timeline/history only.')]};
 const timeline=visual.timeline;
 if(!timeline||timeline.scale.kind!=='date')return{ok:false,diagnostics:[diagnostic('PRESENTATION_TIMELINE_SCOPE','/timeline/scale','This projection supports a date scale only; period timelines are not reinterpreted.') ]};
 const diagnostics:PresentationDiagnostic[]=[];
 for(const key of ['lanes','spans','markers'] as const)if(timeline[key]!==undefined)diagnostics.push(diagnostic('PRESENTATION_TIMELINE_SCOPE','/timeline/'+key,'This bounded date-history projection supports events only; other timeline item kinds are retained in the source but not drawn.'));
 if(visual.layout!==undefined)diagnostics.push(diagnostic('PRESENTATION_TIMELINE_SCOPE','/layout','Timeline layout hints have no qualified projection in this profile and are not silently discarded.'));
 if(visual.steps!==undefined)diagnostics.push(diagnostic('PRESENTATION_TIMELINE_SCOPE','/steps','Timeline walkthrough steps are not yet qualified for this profile.'));
 for(const[index,event]of(timeline.events??[]).entries())for(const key of ['lane','detail','status','emphasis'] as const)if(event[key]!==undefined)diagnostics.push(diagnostic('PRESENTATION_TIMELINE_SCOPE',`/timeline/events/${index}/${key}`,`Event ${key} is outside the qualified date-history subset.`));
 return diagnostics.length?{ok:false,diagnostics}:undefined;
}

const DATE_X_POINTS_PER_DAY=4.25;
const EVENT_CARD_HALF_WIDTH_POINTS=68;
function collisionTracks(rows:ReturnType<typeof planDateHistoryEvents> extends infer T?T extends {ok:true;events:infer R}?R:never:never):Array<{sourceIndex:number;track:number;halfWidth:number}> {
 const ends:number[]=[],placed:Array<{sourceIndex:number;track:number;halfWidth:number}>=[];
 for(const row of rows){
  const halfWidth=EVENT_CARD_HALF_WIDTH_POINTS,center=row.dayOffset*DATE_X_POINTS_PER_DAY;
  let track=ends.findIndex(end=>center-halfWidth>=end+12);if(track<0)track=ends.length;
  ends[track]=center+halfWidth;placed.push({sourceIndex:row.sourceIndex,track,halfWidth});
 }
 return placed;
}

function compileGraphviz(visual:Visual,rows:NonNullable<ReturnType<typeof planDateHistoryEvents>> & {ok:true}):PresentationPlan {
 const events=visual.timeline!.events!,placements=collisionTracks(rows.events),trackBySource=new Map(placements.map(row=>[row.sourceIndex,row.track]));
 const first=rows.events[0]!,last=rows.events.at(-1)!,hasRange=first.day!==last.day;
 // Graphviz neato -n2 interprets fixed node positions in points, not inches.
 const x=(offset:number)=>100+offset*DATE_X_POINTS_PER_DAY,y=(track:number)=>100+track*58;
 const title=visual.title??visual.question,elementMap:PresentationElement[]=[{logicalId:visual.id,sourcePath:BASE,nativeId:'visual',kind:'visual'}];
 const lines=[
  'digraph UMFDateHistory {',
  '  graph [layout="neato", bgcolor="transparent", pad="0.38", overlap=false, splines=false, fontname="Arial", fontsize=22, fontcolor="#203746", labelloc="t", label='+dot(title)+'];',
  '  node [shape=box, style="rounded,filled", fillcolor="#f7f5ef", color="#8f8b7b", penwidth=1.2, fontname="Arial", fontsize=12, fontcolor="#263a43", margin="0.08,0.06"];',
  '  edge [color="#8f9ca0", penwidth=1.2, arrowhead=none];'
 ];
 if(hasRange){
  lines.push(`  date_axis_start [id="date_axis_start", label="", shape=point, width=0.01, height=0.01, style=invis, pos="${x(0).toFixed(3)},45!", pin=true];`);
  lines.push(`  date_axis_end [id="date_axis_end", label="", shape=point, width=0.01, height=0.01, style=invis, pos="${x(last.dayOffset).toFixed(3)},45!", pin=true];`);
  lines.push('  date_axis_start -> date_axis_end [id="date_axis", dir=none, arrowhead=none, color="#748990", penwidth=1.4];');
 }
 for(const row of rows.events){
  const event=row.event,nativeId=safeId('event_',row.sourceIndex),index=row.sourceIndex;
  elementMap.push({logicalId:event.id,sourcePath:path('/timeline/events/'+index),nativeId,kind:'event'});
  const eventLabel='<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="5" COLOR="#8f8b7b" BGCOLOR="#f7f5ef"><TR><TD WIDTH="118" ALIGN="CENTER"><B>'+html(event.label)+'</B></TD></TR><TR><TD WIDTH="118" ALIGN="CENTER"><FONT POINT-SIZE="10">'+html(event.at)+'</FONT></TD></TR></TABLE>';
  lines.push(`  ${nativeId} [id=${dot(nativeId)}, label=<${eventLabel}>, shape=plain, pos="${x(row.dayOffset).toFixed(3)},${y(trackBySource.get(index)!).toFixed(3)}!", pin=true];`);
 }
 lines.push('}');
 const approximations=[{sourcePath:path('/timeline/events'),requested:'Date scale and stable event identities',representation:'Each event card is positioned with a linear x coordinate derived from its exact UTC calendar-day offset; the displayed date and event label remain together. Equal-date events share x and retain source order in separate label tracks. Y positions are collision packing only and carry no quantitative or business meaning.'}];
 if(!hasRange)approximations.push({sourcePath:path('/timeline/events'),requested:'Single-date history',representation:'All event cards share one date coordinate because the source contains one distinct date; no duration or date spacing is implied.'});
 const omissions=[
  ...(visual.title&&visual.question!==visual.title?[{sourcePath:path('/question'),reason:'The question is distinct from the concise display title and remains in the original document.'}]:[]),
  ...(visual.takeaway?[{sourcePath:path('/takeaway'),reason:'Takeaway remains in the source and is not drawn in the timeline.'}]:[]),
  ...(visual.source?[{sourcePath:path('/source'),reason:'Source provenance remains in the UMF document; its locator and digest do not certify external tag history.'}]:[]),
  ...(visual.audience?[{sourcePath:path('/audience'),reason:'Audience metadata remains in the UMF source and is not drawn.'}]:[]),
  ...(visual.omissions??[]).map((_,index)=>({sourcePath:path('/omissions/'+index),reason:'The authored omission inventory remains in the source document and is not drawn.'}))
 ];
 return{ok:true,profileId:'umf.visual.presentation/1',backend:'graphviz',nativeFormat:'dot',source:lines.join('\n')+'\n',elementMap,omissions,approximations,execution:{runtime:'graphviz',layoutEngine:'neato',nodePositions:'fixed'}};
}

function compileMermaid(visual:Visual,rows:NonNullable<ReturnType<typeof planDateHistoryEvents>> & {ok:true}):PresentationPlan {
 const events=visual.timeline!.events!,elementMap:PresentationElement[]=[{logicalId:visual.id,sourcePath:BASE,nativeId:'visual',kind:'visual'}];
 const title=visual.title??visual.question,columns=gridColumns(rows.events),maxLine=Math.max(...rows.events.flatMap(row=>[row.event.label,row.event.at,'id: '+row.event.id].map(line=>Array.from(line).length))),cardWidth=maxLine*9+44;
 const ledgerNote='Chronological order · equal dates adjacent · spacing is categorical, not elapsed time',blockText=(value:string)=>mermaidText(value).replace(/#32;/g,' ');
 const lines=['---','title: '+JSON.stringify(title),'---','block-beta',`  columns ${columns}`,`  heading["${blockText(title)}"]:${columns}`,`  ledger_note["${blockText(ledgerNote)}"]:${columns}`];
 for(const row of rows.events){
  const nativeId=safeId('event_',row.sourceIndex),index=row.sourceIndex,event=row.event;
  lines.push(`  ${nativeId}["${mermaidText(event.label)}<br/>${mermaidText(event.at)}<br/>id: ${mermaidText(event.id)}"]`);
  elementMap.push({logicalId:event.id,sourcePath:path('/timeline/events/'+index),nativeId,kind:'event'});
 }
 lines.push(`  style heading fill:none,stroke:none,color:#203746,font-size:24px,height:48px,width:${columns*cardWidth}px`,`  style ledger_note fill:none,stroke:none,color:#40545f,font-size:14px,height:34px,width:${columns*cardWidth}px`);
 const approximations=[{sourcePath:path('/timeline/events'),requested:'Date history with exact event dates and same-date grouping',representation:'Mermaid renders a categorical date ledger in chronological card order. Each card carries its exact date; equal-date events are adjacent in source order. Grid spacing is categorical and is not proportional to elapsed time. The blocks have no causal or duration relationships.'}];
 const omissions=[
  ...(visual.title&&visual.question!==visual.title?[{sourcePath:path('/question'),reason:'The question is distinct from the concise display title and remains in the original document.'}]:[]),
  ...(visual.takeaway?[{sourcePath:path('/takeaway'),reason:'Takeaway remains in the source and is not drawn in the timeline.'}]:[]),
  ...(visual.source?[{sourcePath:path('/source'),reason:'Source provenance remains in the UMF document; its locator and digest do not certify external tag history.'}]:[]),
  ...(visual.audience?[{sourcePath:path('/audience'),reason:'Audience metadata remains in the UMF source and is not drawn.'}]:[]),
  ...(visual.omissions??[]).map((_,index)=>({sourcePath:path('/omissions/'+index),reason:'The authored omission inventory remains in the source document and is not drawn.'}))
 ];
 return{ok:true,profileId:'umf.visual.presentation/1',backend:'mermaid',nativeFormat:'mermaid',source:lines.join('\n')+'\n',elementMap,omissions,approximations};
}

/** Compile the explicitly bounded date/history subset without mutating its event array. */
export function compileTimelinePresentation(visual:Visual,backend:'graphviz'|'mermaid'):PresentationPlan|PresentationFailure {
 const unsupported=validateHistory(visual);if(unsupported)return unsupported;
 const events=visual.timeline!.events??[],plan=planDateHistoryEvents(events);
 if(!plan)return{ok:false,diagnostics:[diagnostic('PRESENTATION_TIMELINE_SCOPE','/timeline/events','At least one event is required for a date history.') ]};
 if(!plan.ok)return{ok:false,diagnostics:[diagnostic('PRESENTATION_TIMELINE_DATE',`/timeline/events/${plan.sourceIndex}/at`,`Only exact real YYYY-MM-DD dates are currently qualified; ${JSON.stringify(plan.date)} cannot be mapped to a UTC calendar-day coordinate.`)]};
 return backend==='graphviz'?compileGraphviz(visual,plan):compileMermaid(visual,plan);
}
