// SPDX-License-Identifier: MIT OR Apache-2.0
/** Lini projection for period-scaled lane roadmaps. */
import type {Visual} from '../extensions/visual';
import {quoteLiniProfile} from '../interchange/lini/profile-syntax';
import type {PresentationElement,PresentationFailure,PresentationPlan} from './index';

const BASE='/extensions/umf.visual';
const at=(path:string)=>path.startsWith(BASE)?path:BASE+(path.startsWith('/')?path:'/'+path);
const fail=(path:string,message:string,code='PRESENTATION_LINI_ROADMAP_SCOPE'):PresentationFailure=>({ok:false,diagnostics:[{code,path:at(path),message,severity:'error'}]});
const quote=(text:string,path:string)=>{try{return quoteLiniProfile(text);}catch(reason){throw Object.assign(new Error(reason instanceof Error?reason.message:'Text is outside the pinned Lini profile.'),{sourcePath:path});}};
const pointerPart=(value:string)=>value.replace(/~/gu,'~0').replace(/\//gu,'~1');
const unknown=(value:object,allowed:readonly string[],path:string):PresentationFailure|undefined=>{for(const key of Object.keys(value))if(!allowed.includes(key)){const pointer=`${path}/${pointerPart(key)}`;return fail(pointer,`Unknown roadmap content at ${pointer} is preserved by UMF but has no qualified native representation.`);}};
const safe=(index:number)=>index+1;
const periodId=(index:number)=>`roadmap-period-${safe(index)}`;
const laneId=(index:number)=>`roadmap-lane-${safe(index)}`;
const spanId=(index:number)=>`roadmap-span-${safe(index)}`;
const statusId=(index:number)=>`roadmap-span-status-${safe(index)}`;
const labelLineId=(index:number,line:number)=>`roadmap-span-label-${safe(index)}-line-${safe(line)}`;
const LABEL_FONT=15,LABEL_LINE_STEP=20,STATUS_FONT=13,STATUS_BLOCK=18,STATUS_GAP=6;
const wrapLabel=(text:string,maxWidth:number,fontSize=LABEL_FONT):string[]=>{const estimate=(value:string)=>Array.from(value).reduce((sum,char)=>sum+fontSize*(char===' '?0.28:/[ilI.,'`|]/u.test(char)?0.3:/[MW@#%&]/u.test(char)?0.85:0.56),0),lines:string[]=[];for(const paragraph of text.split('\n')){let line='';for(const word of paragraph.split(/\s+/u).filter(Boolean)){const next=line?`${line} ${word}`:word;if(line&&estimate(next)>maxWidth){lines.push(line);line=word;}else line=next;}if(line||paragraph==='')lines.push(line);}return lines.length?lines:[''];};

/** Compile a period/lane roadmap without converting categorical spans into dates or durations. */
export function compileLiniRoadmapPresentation(visual:Visual):PresentationPlan|PresentationFailure {
 try{return compile(visual);}catch(reason){const error=reason as Error&{sourcePath?:unknown},located=typeof error?.sourcePath==='string';return fail(located?error.sourcePath as string:'/timeline',located&&error instanceof Error?error.message:'An internal native roadmap compilation error occurred; no projection was emitted.',located?'PRESENTATION_LINI_ROADMAP_TEXT':'PRESENTATION_LINI_ROADMAP_INTERNAL');}
}

function compile(visual:Visual):PresentationPlan|PresentationFailure {
 if(visual.kind!=='timeline'||visual.form!=='roadmap'||!visual.timeline)return fail('/form','A timeline/roadmap payload is required.');
 const timeline=visual.timeline;
 if(timeline.scale.kind!=='period')return fail('/timeline/scale','A roadmap requires its authored period scale.');
 const periods=timeline.scale.periods,lanes=timeline.lanes??[],spans=timeline.spans??[];
 const rootUnknown=unknown(visual,['id','kind','form','question','title','takeaway','audience','source','omissions','annotations','groups','nodes','edges','steps','sequence','structure','state','timeline','comparison','metric','layout'],'');if(rootUnknown)return rootUnknown;
 const timelineUnknown=unknown(timeline,['scale','lanes','events','spans','markers'],'/timeline');if(timelineUnknown)return timelineUnknown;
 const scaleUnknown=unknown(timeline.scale,['kind','periods'],'/timeline/scale');if(scaleUnknown)return scaleUnknown;
 if(!periods.length)return fail('/timeline/scale/periods','At least one ordered period is required.');
 if(!lanes.length)return fail('/timeline/lanes','A roadmap requires authored lanes.');
 if(!spans.length)return fail('/timeline/spans','A roadmap requires authored spans.');
 if(timeline.events!==undefined)return fail('/timeline/events','Date events are not merged into a period roadmap.');
 if(timeline.markers!==undefined)return fail('/timeline/markers','Date markers are not reinterpreted as roadmap periods.');
 if(visual.layout!==undefined)return fail('/layout','The bounded native roadmap uses the declared period and lane order; additional layout hints are not silently ignored.');
 if(visual.annotations?.length)return fail('/annotations','Unanchored annotations do not have a qualified placement in the native roadmap.');
 if(visual.steps!==undefined)return fail('/steps','Walkthrough steps are outside the static native roadmap subset.');
 for(const key of ['groups','nodes','edges','sequence','structure','state','metric','comparison'] as const)if(visual[key]!==undefined)return fail('/'+key,'A roadmap projection does not reinterpret another visual-family payload.');
 for(const[index,period]of periods.entries()){const extra=unknown(period,['id','label'],`/timeline/scale/periods/${index}`);if(extra)return extra;}
 for(const[index,lane]of lanes.entries()){const extra=unknown(lane,['id','label'],`/timeline/lanes/${index}`);if(extra)return extra;}
 for(const[index,span]of spans.entries()){
  const extra=unknown(span,['id','label','start','end','lane','detail','status','emphasis'],`/timeline/spans/${index}`);if(extra)return extra;
  for(const field of ['detail','emphasis'] as const)if(span[field]!==undefined)return fail(`/timeline/spans/${index}/${field}`,`Span ${field} is outside the currently qualified native roadmap profile.`);
  quote(span.label,at(`/timeline/spans/${index}/label`));
 }
 const periodIndex=new Map(periods.map((period,index)=>[period.id,index])),laneIndex=new Map(lanes.map((lane,index)=>[lane.id,index]));
 for(const[index,span]of spans.entries()){
  if(!periodIndex.has(span.start))return fail(`/timeline/spans/${index}/start`,'Span start must resolve to an authored period.');
  if(!periodIndex.has(span.end))return fail(`/timeline/spans/${index}/end`,'Span end must resolve to an authored period.');
  if(periodIndex.get(span.start)!>periodIndex.get(span.end)!)return fail(`/timeline/spans/${index}/end`,'Span end must not precede its start in declared period order.');
  if(span.lane===undefined||!laneIndex.has(span.lane))return fail(`/timeline/spans/${index}/lane`,'Every displayed span must resolve to an authored lane.');
 }
 // First-fit interval partitioning gives concurrent spans separate renderer
 // tracks inside their authored lane, regardless of source or period order.
 // Track number is layout only.
 const spanTrack=new Map<number,number>(),trackIntervalsByLane=lanes.map(()=>[] as Array<Array<{start:number;end:number}>>);
 spans.forEach((span,index)=>{const lane=laneIndex.get(span.lane!)!,start=periodIndex.get(span.start)!,end=periodIndex.get(span.end)!,tracks=trackIntervalsByLane[lane]!;let track=tracks.findIndex(intervals=>intervals.every(interval=>end<interval.start||start>interval.end));if(track<0){track=tracks.length;tracks.push([]);}tracks[track]!.push({start,end});spanTrack.set(index,track);});
 const title=visual.title??visual.question,titlePath=visual.title!==undefined?'/title':'/question';
 const maps:PresentationElement[]=[{logicalId:visual.id,sourcePath:at('/id'),nativeId:'roadmap-title',kind:'visual'},{logicalId:visual.id,sourcePath:at(titlePath),nativeId:'roadmap-title',kind:'visual'}];
 if(visual.title!==undefined&&visual.question!==visual.title)maps.push({logicalId:visual.id,sourcePath:at('/question'),nativeId:'roadmap-question',kind:'visual'});
 if(visual.takeaway!==undefined)maps.push({logicalId:visual.id,sourcePath:at('/takeaway'),nativeId:'roadmap-takeaway',kind:'visual'});
 const omissions:Array<{sourcePath:string;reason:string}>=[],approximations:Array<{sourcePath:string;requested:string;representation:string}>=[];
 if(visual.source!==undefined)omissions.push({sourcePath:at('/source'),reason:'The source locator is retained in UMF and does not independently verify delivery claims.'});
 if(visual.audience!==undefined)omissions.push({sourcePath:at('/audience'),reason:'Audience metadata remains in UMF and does not alter roadmap geometry.'});
 (visual.omissions??[]).forEach((_,index)=>omissions.push({sourcePath:at(`/omissions/${index}`),reason:'The authored omission note remains in UMF and is not drawn as roadmap geometry.'}));
 periods.forEach((period,index)=>{const id=periodId(index);for(const field of ['id','label'] as const)maps.push({logicalId:period.id,sourcePath:at(`/timeline/scale/periods/${index}/${field}`),nativeId:id,kind:'period'});maps.push({logicalId:period.id,sourcePath:at(`/timeline/scale/periods/${index}`),nativeId:id,kind:'period'});});
 lanes.forEach((lane,index)=>{const id=laneId(index);for(const field of ['id','label'] as const)maps.push({logicalId:lane.id,sourcePath:at(`/timeline/lanes/${index}/${field}`),nativeId:id,kind:'lane'});maps.push({logicalId:lane.id,sourcePath:at(`/timeline/lanes/${index}`),nativeId:id,kind:'lane'});});
 spans.forEach((span,index)=>{
  const id=spanId(index),stateCell=statusId(index);maps.push({logicalId:span.id,sourcePath:at(`/timeline/spans/${index}`),nativeId:id,kind:'span'});
  for(const field of ['id','start','end','lane'] as const)maps.push({logicalId:span.id,sourcePath:at(`/timeline/spans/${index}/${field}`),nativeId:id,kind:'span'});
  for(let line=0;line<wrapLabel(span.label,264).length;line++)maps.push({logicalId:span.id,sourcePath:at(`/timeline/spans/${index}/label`),nativeId:labelLineId(index,line),kind:'span'});
  if(span.status!==undefined)maps.push({logicalId:span.id,sourcePath:at(`/timeline/spans/${index}/status`),nativeId:stateCell,kind:'span'});
 });
 const laneWidth=300,laneTrackCounts=trackIntervalsByLane.map(tracks=>Math.max(1,tracks.length)),totalWidth=laneTrackCounts.reduce((sum,count)=>sum+count*laneWidth,0),plotLeft=-totalWidth/2,plotRight=totalWidth/2,laneStarts:number[]=[];
 let nextLaneX=plotLeft;for(const count of laneTrackCounts){laneStarts.push(nextLaneX);nextLaneX+=count*laneWidth;}
 const periodTop=-205;
 // Uniform row height is derived from the fullest authored span label/status
 // that must fit in any inclusive period cell. This is a layout budget, not data.
 const periodStep=Math.max(64,...spans.map(span=>{
  const covered=(periodIndex.get(span.end)!-periodIndex.get(span.start)!+1),labelLines=wrapLabel(span.label,laneWidth-36).length;
  const contentHeight=labelLines*LABEL_LINE_STEP+(span.status===undefined?0:STATUS_BLOCK+STATUS_GAP);
  return Math.ceil((contentHeight+12)/covered);
 }));
 const height=periodStep*periods.length+270;
 const lines=['{','  --lini-font-family: Arial;','  .lini-block { font-family: Arial; }','  .lini-table { color: #243b45; }','}',
  `|group#roadmap-panel| "" { layout: flow; direction: column; width: ${totalWidth+280}; height: ${height}; padding: 28; fill: none; stroke: none; stroke-width: 0; } [`,
  `  |block#roadmap-title| ${quote(title,at(titlePath))} { pin: center; translate: 0 -325; width: ${totalWidth+200}; font-size: 25; color: #243b45; fill: none; stroke: none; font-weight: bold; }`,
  ...(visual.title!==undefined&&visual.question!==visual.title?[`  |block#roadmap-question| ${quote(visual.question,at('/question'))} { pin: center; translate: 0 -295; width: ${totalWidth+200}; font-size: 15; color: #304652; fill: none; stroke: none; }`]:[]),
 ];
 const gridTop=periodTop-periodStep/2,gridBottom=gridTop+periodStep*periods.length,periodLabelX=plotLeft-90;
 lanes.forEach((lane,index)=>{const width=laneTrackCounts[index]!*laneWidth,x=laneStarts[index]!+width/2,id=laneId(index);lines.push(`  |block#${id}| ${quote(lane.label,at(`/timeline/lanes/${index}/label`))} { pin: center; translate: ${x} ${gridTop-34}; width: ${width-8}; font-size: 15; color: #243b45; fill: none; stroke: none; font-weight: bold; }`);});
 periods.forEach((period,index)=>{const y=periodTop+index*periodStep,id=periodId(index);lines.push(`  |block#${id}| ${quote(period.label,at(`/timeline/scale/periods/${index}/label`))} { pin: center; translate: ${periodLabelX} ${y}; width: 100; font-size: 14; color: #243b45; fill: none; stroke: none; font-weight: bold; }`);});
 const gridCenterY=gridTop+periodStep*periods.length/2;
 for(let index=0;index<=lanes.length;index++){const x=index===lanes.length?plotRight:laneStarts[index]!;lines.push(`  |line#roadmap-lane-grid-${safe(index)}| "" { pin: center; translate: ${x} ${gridCenterY}; points: 0 ${gridTop-gridCenterY}, 0 ${gridBottom-gridCenterY}; marker: none; stroke: #d8e0e3; stroke-width: 1; }`);}
 for(let index=0;index<=periods.length;index++){const y=gridTop+index*periodStep;lines.push(`  |line#roadmap-period-grid-${safe(index)}| "" { pin: center; translate: 0 ${y}; points: ${plotLeft} 0, ${plotRight} 0; marker: none; stroke: #d8e0e3; stroke-width: 1; }`);}
 spans.forEach((span,index)=>{const lane=laneIndex.get(span.lane!)!,start=periodIndex.get(span.start)!,end=periodIndex.get(span.end)!,track=spanTrack.get(index)!,x=laneStarts[lane]!+track*laneWidth+laneWidth/2,y=periodTop+(start+end)*periodStep/2,barHeight=(end-start+1)*periodStep-8,id=spanId(index),labelLines=wrapLabel(span.label,laneWidth-36),contentHeight=labelLines.length*LABEL_LINE_STEP+(span.status===undefined?0:STATUS_BLOCK+STATUS_GAP),firstLabelY=y-contentHeight/2+LABEL_LINE_STEP/2;lines.push(`  |box#${id}| "" { pin: center; translate: ${x} ${y}; width: ${laneWidth-16}; height: ${barHeight}; padding: 0; fill: #e8f0f2; stroke: #587985; stroke-width: 1.5; }`);const linesBlock=labelLines.map((text,line)=>`  |block#${labelLineId(index,line)}| ${quote(text,at(`/timeline/spans/${index}/label`))} { pin: center; translate: ${x} ${firstLabelY+line*LABEL_LINE_STEP}; width: ${laneWidth-36}; font-size: ${LABEL_FONT}; color: #243b45; fill: none; stroke: none; }`);lines.push(...linesBlock);if(span.status!==undefined)lines.push(`  |block#${statusId(index)}| ${quote(span.status,at(`/timeline/spans/${index}/status`))} { pin: center; translate: ${x} ${y-contentHeight/2+labelLines.length*LABEL_LINE_STEP+STATUS_GAP+STATUS_BLOCK/2}; width: ${laneWidth-36}; font-size: ${STATUS_FONT}; color: #40545f; fill: none; stroke: none; }`);});
 if(visual.takeaway!==undefined)lines.push(`  |block#roadmap-takeaway| ${quote(visual.takeaway,at('/takeaway'))} { pin: center; translate: 0 ${gridBottom+36}; width: ${totalWidth+200}; font-size: 14; color: #304652; fill: none; stroke: none; }`);
 lines.push(']');
 approximations.push({sourcePath:at('/timeline'),requested:'Period-scaled roadmap with ordered lanes and inclusive spans',representation:'The native roadmap uses the authored lane sequence as columns and authored period sequence as rows. Each span is a native bar within its lane column and occupies every period cell from its inclusive start through end; same-period spans retain a visible one-cell height. When same-lane spans overlap, deterministic renderer-owned subtracks separate their bars without adding semantic lanes or ordering meaning. Wrapped exact source labels and literal statuses appear inside their span bars. The grid is categorical. No calendar dates, elapsed durations, delivery completion, or causal links are inferred.'});
 return{ok:true,profileId:'umf.visual.presentation/1',backend:'lini',nativeFormat:'lini',source:lines.join('\n')+'\n',elementMap:maps,omissions,approximations};
}
