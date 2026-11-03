// SPDX-License-Identifier: MIT OR Apache-2.0
/** Source-mapped Lini projection for dated, single-series scalar statistics. */
import type {Visual} from '../extensions/visual';
import {quoteLiniProfile} from '../interchange/lini/profile-syntax';
import {utcCalendarDate,utcCalendarDay} from './calendar';
import type {PresentationApproximation,PresentationElement,PresentationFailure,PresentationOmission,PresentationPlan} from './index';

const BASE='/extensions/umf.visual';
const path=(part:string)=>BASE+(part.startsWith('/')?part:'/'+part);
const fail=(code:string,suffix:string,message:string):PresentationFailure=>({ok:false,diagnostics:[{code,path:path(suffix),message,severity:'error'}]});
const num=(value:number)=>Object.is(value,-0)?'-0':String(value);
const displayNumber=(value:number,decimals:number|undefined)=>decimals===undefined?num(value):decimals===0?value.toFixed(0):value.toFixed(decimals);
const quote=quoteLiniProfile;

interface PointPlacement {sourceIndex:number;point:{at?:string;value:number};day:number;x:number;y:number;labelX:number;labelY:number;labelWidth:number;}

// Conservative text budget for collision packing only; actual SVG text bounds
// are measured by the native quality check before qualification.
const estimateTextWidth=(text:string)=>Array.from(text).reduce((sum,char)=>sum+9.4*(/[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uff01-\uff60]/u.test(char)?1:/[ilI.,'`!|:;]/u.test(char)?0.42:/[MW@#%&]/u.test(char)?0.9:0.62),0);
const niceStep=(span:number)=>{
 const rough=span/5||1,power=10**Math.floor(Math.log10(rough)),fraction=rough/power;
 const unit=fraction<=1?1:fraction<=2?2:fraction<=2.5?2.5:fraction<=5?5:10;
 return unit*power;
};
const stepPrecision=(step:number)=>{const exponent=Math.floor(Math.log10(step)),mantissa=step/10**exponent;return Math.max(0,-exponent+(Math.abs(mantissa-2.5)<1e-9?1:0));};
const cleanTick=(value:number,step:number)=>{const rounded=Number(value.toFixed(stepPrecision(step)));return Object.is(rounded,-0)?0:rounded;};

function validate(visual:Visual):PresentationFailure|undefined {
 if(visual.kind!=='metric'||visual.form!=='stat'||!visual.metric)return fail('PRESENTATION_LINI_STAT_SCOPE','/form','The Lini temporal-stat projection requires a metric/stat payload.');
 const metric=visual.metric;
 if(metric.axis?.kind!=='time')return fail('PRESENTATION_LINI_STAT_SCOPE','/metric/axis','The bounded stat profile requires an authored time axis.');
 if(metric.series.length!==1||metric.series[0]?.points.length<2)return fail('PRESENTATION_LINI_STAT_SCOPE','/metric/series','The bounded temporal-stat profile supports exactly one series with at least two observations.');
 if(metric.target!==undefined||metric.baseline!==undefined||metric.comparison!==undefined)return fail('PRESENTATION_LINI_STAT_SCOPE','/metric','Target, baseline, and comparison references are outside this bounded temporal-stat profile.');
 if(metric.format!==undefined&&(metric.format.kind!=='number'||metric.format.decimals!==0||metric.format.currency!==undefined||metric.format.compact!==undefined))return fail('PRESENTATION_LINI_STAT_SCOPE','/metric/format','The pinned temporal-stat profile supports number labels with zero decimals only.');
 if(metric.good!==undefined&&metric.good!=='up'&&metric.good!=='down')return fail('PRESENTATION_LINI_STAT_SCOPE','/metric/good','This temporal-stat profile supports only the authored up or down good direction.');
 if(visual.layout!==undefined)return fail('PRESENTATION_LINI_STAT_SCOPE','/layout','A separate layout directive is not interpreted by the bounded temporal-stat view.');
 if(visual.annotations?.length)return fail('PRESENTATION_LINI_STAT_SCOPE','/annotations','Free-text annotations do not have a qualified placement in the native temporal-stat scene.');
 if(visual.nodes?.length||visual.edges?.length||visual.groups?.length||visual.sequence||visual.structure||visual.state||visual.timeline)return fail('PRESENTATION_LINI_STAT_SCOPE','/metric','Additional diagram structures are not silently omitted from this temporal-stat profile.');
 if(metric.series[0]!.emphasis!==undefined)return fail('PRESENTATION_LINI_STAT_SCOPE','/metric/series/0/emphasis','Series emphasis has no qualified native temporal-stat mapping.');
 for(const[index,point]of metric.series[0]!.points.entries()){
  if(point.at===undefined||utcCalendarDay(point.at)===undefined)return fail('PRESENTATION_LINI_STAT_DATE',`/metric/series/0/points/${index}/at`,'Only exact real YYYY-MM-DD observation dates are qualified for the native temporal-stat axis.');
  if(!Number.isFinite(point.value))return fail('PRESENTATION_LINI_STAT_SCOPE',`/metric/series/0/points/${index}/value`,'Temporal-stat values must be finite.');
 }
 return undefined;
}

/** Draw a dated statistic with raw value geometry and exact source-index mappings. */
export function compileLiniStatPresentation(visual:Visual):PresentationPlan|PresentationFailure {
 const rejected=validate(visual);if(rejected)return rejected;
 const metric=visual.metric!,series=metric.series[0]!,decimals=metric.format?.kind==='number'?metric.format.decimals??0:undefined;
 const title=visual.title??visual.question,titlePath=visual.title!==undefined?'/title':'/question';
 const quoteAt=(value:string,suffix:string)=>{try{return quote(value);}catch(error){throw Object.assign(new Error(error instanceof Error?error.message:'Source text is not supported by the pinned Lini profile.'),{sourcePath:path(suffix)});}};
 try{quoteAt(title,titlePath);if(visual.title!==undefined&&visual.question!==visual.title)quoteAt(visual.question,'/question');quoteAt(series.label,'/metric/series/0/label');quoteAt(metric.unit,'/metric/unit');for(const[index,point]of series.points.entries())quoteAt(point.at!,`/metric/series/0/points/${index}/at`);if(visual.takeaway!==undefined)quoteAt(visual.takeaway,'/takeaway');for(const[index,note]of(visual.omissions??[]).entries())quoteAt(note,'/omissions/'+index);}catch(error){const suffix=error&&typeof error==='object'&&'sourcePath'in error&&typeof error.sourcePath==='string'?String(error.sourcePath).slice(BASE.length):'/metric';return fail('PRESENTATION_LINI_STAT_TEXT',suffix,error instanceof Error?error.message:'Source text is not supported by the pinned Lini profile.');}
 const points=series.points.map((point,sourceIndex)=>({sourceIndex,point,day:utcCalendarDay(point.at!)!})).sort((a,b)=>a.day-b.day||a.sourceIndex-b.sourceIndex);

 const latest=points.at(-1)!,latestGroup=points.filter(row=>row.day===latest.day);
 const firstDay=points[0]!.day,lastDay=latest.day,plotWidth=1120,plotLeft=-plotWidth/2,plotRight=plotWidth/2,plotTop=-160,plotBottom=150,plotHeight=plotBottom-plotTop;
 const rawValues=points.map(row=>row.point.value),rawMin=Math.min(...rawValues),rawMax=Math.max(...rawValues),includeZeroMin=Math.min(rawMin,0),includeZeroMax=Math.max(rawMax,0),rawSpan=includeZeroMax-includeZeroMin,step=niceStep(rawSpan||Math.max(Math.abs(includeZeroMax),1)),padding=(rawSpan||step)*0.08;
 let axisMin=rawMin>=0?0:Math.floor((includeZeroMin-padding)/step)*step,axisMax=Math.ceil((includeZeroMax+padding)/step)*step;
 if(axisMin===axisMax){axisMin-=step;axisMax+=step;}
 if(axisMin===includeZeroMin&&includeZeroMin<0)axisMin-=step;
 if(axisMax===includeZeroMax&&includeZeroMax>0)axisMax+=step;
 if(!Number.isFinite(axisMin)||!Number.isFinite(axisMax)||!(axisMin<axisMax))return fail('PRESENTATION_LINI_STAT_SCOPE','/metric/series/0/points','Finite source observations exceed the bounded native value-axis range.');
 const tickCount=Math.max(0,Math.round((axisMax-axisMin)/step)),valueTicks=Array.from({length:tickCount+1},(_,index)=>cleanTick(axisMin+index*step,step)).filter(value=>value<=axisMax+step*1e-9);
 const xFor=(day:number)=>firstDay===lastDay?0:plotLeft+(day-firstDay)/(lastDay-firstDay)*plotWidth;
 const yFor=(value:number)=>plotBottom-(value-axisMin)/(axisMax-axisMin)*plotHeight;
 const labelText=(row:typeof points[number])=>`${row.point.at} · ${displayNumber(row.point.value,decimals)} ${metric.unit}`;
 const columnGap=18,maxLabelWidth=Math.max(...points.map(row=>Math.max(112,Math.ceil(estimateTextWidth(labelText(row))+20)))),labelColumns=Math.min(3,Math.max(1,Math.floor((plotWidth+columnGap)/(maxLabelWidth+columnGap)))),slotWidth=plotWidth/labelColumns,labelRows=Math.ceil(points.length/labelColumns),captionStartY=plotBottom+104,goodY=captionStartY+labelRows*30+15,rendererNoteY=goodY+(metric.good!==undefined?26:0),takeawayY=rendererNoteY+24,omissionY=takeawayY+(visual.takeaway!==undefined?24:0),lastContentY=(visual.omissions?.length??0)>0?omissionY+(visual.omissions!.length-1)*24:visual.takeaway!==undefined?takeawayY:rendererNoteY,panelHeight=Math.max(820,Math.ceil((Math.max(355,lastContentY+8)+24)*2)),packed:PointPlacement[]=[];
 for(const [displayIndex,row] of points.entries()){
  const text=labelText(row),column=displayIndex%labelColumns,rowIndex=Math.floor(displayIndex/labelColumns),width=Math.min(slotWidth-12,Math.max(112,Math.ceil(estimateTextWidth(text)+20))),labelX=plotLeft+slotWidth*(column+0.5);
  packed.push({sourceIndex:row.sourceIndex,point:row.point,day:row.day,x:xFor(row.day),y:yFor(row.point.value),labelX,labelY:captionStartY+rowIndex*30,labelWidth:width});
 }
 const maps:PresentationElement[]=[],omissions:PresentationOmission[]=[],approximations:PresentationApproximation[]=[];
 const add=(logicalId:string,suffix:string,nativeId:string,kind:PresentationElement['kind'])=>maps.push({logicalId,sourcePath:path(suffix),nativeId,kind});
 const omit=(suffix:string,reason:string)=>omissions.push({sourcePath:path(suffix),reason});
 try {
  quote(title);if(visual.title!==undefined&&visual.question!==visual.title)quote(visual.question);quote(series.label);quote(metric.unit);if(visual.takeaway!==undefined)quote(visual.takeaway);for(const note of visual.omissions??[])quote(note);
  add(visual.id,'/id','metric-stat-panel','visual');add(visual.id,titlePath,'metric-stat-title','visual');
  if(visual.title!==undefined&&visual.question!==visual.title)add(visual.id,'/question','metric-stat-question','visual');
  add(series.id,'/metric/series/0/id','metric-stat-series','metric-series');add(series.id,'/metric/series/0/label','metric-stat-series','metric-series');
  add(metric.unit,'/metric/unit','metric-stat-unit','metric-reference');add('time','/metric/axis/kind','metric-stat-x-axis','metric-reference');
  if(metric.format){for(const row of packed){add('number','/metric/format/kind',`metric-stat-point-${row.sourceIndex+1}`,'metric-reference');add(String(metric.format.decimals??0),'/metric/format/decimals',`metric-stat-point-${row.sourceIndex+1}`,'metric-reference');}for(const[index]of valueTicks.entries()){add('number','/metric/format/kind',`metric-stat-y-tick-${index+1}`,'metric-reference');add(String(metric.format.decimals??0),'/metric/format/decimals',`metric-stat-y-tick-${index+1}`,'metric-reference');}add('number','/metric/format/kind','metric-stat-latest','metric-reference');add(String(metric.format.decimals??0),'/metric/format/decimals','metric-stat-latest','metric-reference');}
  for(const row of packed)add(metric.unit,'/metric/unit',`metric-stat-point-${row.sourceIndex+1}`,'metric-reference');
  for(const row of latestGroup)add(metric.unit,'/metric/unit','metric-stat-latest','metric-reference');
  if(metric.good!==undefined)add(metric.good,'/metric/good','metric-stat-good','metric-reference');
  if(visual.takeaway!==undefined)add(visual.id,'/takeaway','metric-stat-takeaway','visual');
  for(const[index,note]of(visual.omissions??[]).entries())add(visual.id,'/omissions/'+index,'metric-stat-note-'+(index+1),'annotation');
  for(const row of packed){
   const suffix=`/metric/series/0/points/${row.sourceIndex}`,logicalId=JSON.stringify([series.id,row.sourceIndex]),n=row.sourceIndex+1;
   add(logicalId,suffix,`metric-stat-point-${n}`,'metric-value');add(logicalId,suffix,`metric-stat-marker-${n}`,'metric-value');
   add(logicalId,suffix+'/at',`metric-stat-point-${n}`,'metric-value');add(logicalId,suffix+'/value',`metric-stat-point-${n}`,'metric-value');add(logicalId,suffix+'/value',`metric-stat-marker-${n}`,'metric-value');
  }
  for(const row of latestGroup){const logicalId=JSON.stringify([series.id,row.sourceIndex]);add(logicalId,`/metric/series/0/points/${row.sourceIndex}/at`,'metric-stat-latest','metric-value');add(logicalId,`/metric/series/0/points/${row.sourceIndex}/value`,'metric-stat-latest','metric-value');}
 }catch(error){const at=(error&&typeof error==='object'&&'sourcePath'in error&&typeof error.sourcePath==='string')?error.sourcePath:path('/metric');return fail('PRESENTATION_LINI_STAT_TEXT',at.replace(BASE,''),error instanceof Error?error.message:'Source text cannot be represented by the pinned Lini profile.');}

 if(visual.source!==undefined)omit('/source','Source provenance remains in the source document and is not rendered as a measurement.');
 if(visual.audience!==undefined)omit('/audience','Audience metadata remains in the source document.');
 if(visual.steps!==undefined)omit('/steps','Walkthrough steps remain in the source and are outside this static temporal-stat plot.');

 const titleText=`Latest dated observation${latestGroup.length>1?'s':''}: ${latest.point.at} · ${latestGroup.map(row=>displayNumber(row.point.value,decimals)+' '+metric.unit).join(' / ')}`;
 const firstYear=points[0]!.point.at!.slice(0,4),lastYear=latest.point.at!.slice(0,4);
 // Date-only labels must always land on whole UTC calendar days.
 const tickStep=Math.max(1,Math.ceil(niceStep(lastDay-firstDay||1))),xTicks=new Set<number>([firstDay,lastDay]);
 if(lastDay-firstDay>7)for(let day=firstDay+tickStep;day<lastDay;day+=tickStep)xTicks.add(day);
 const lines=[
  '{\n  --lini-font-family: Arial;\n  .lini-text { font-family: Arial; }\n  .lini-block { font-family: Arial; }\n}',
  `|group#metric-stat-panel| "" { layout: flow; direction: column; width: 1320; height: ${panelHeight}; padding: 24; fill: none; stroke: none; stroke-width: 0; } [`,
  `  |block#metric-stat-title| ${quote(title)} { pin: center; translate: 0 -355; width: 1240; font-size: 25; color: #304652; fill: none; stroke: none; font-weight: bold; }`,
  ...(visual.title!==undefined&&visual.question!==visual.title?[`  |block#metric-stat-question| ${quote(visual.question)} { pin: center; translate: 0 -320; width: 1240; font-size: 16; color: #304652; fill: none; stroke: none; }`]:[]),
  `  |block#metric-stat-latest| ${quote(titleText)} { pin: center; translate: 0 -270; width: 1240; font-size: 19; color: #304652; fill: none; stroke: none; font-weight: bold; }`,
  `  |block#metric-stat-series| ${quote(series.label)} { pin: center; translate: 0 -205; width: 300; font-size: 16; color: #304652; fill: none; stroke: none; font-weight: bold; }`,
  `  |line#metric-stat-y-axis| "" { pin: center; translate: ${plotLeft} ${(plotTop+plotBottom)/2}; points: ${plotLeft} ${plotTop}, ${plotLeft} ${plotBottom}; marker: none; stroke: #536e78; stroke-width: 2; }`,
  `  |line#metric-stat-x-axis| "" { pin: center; translate: 0 ${plotBottom}; points: ${plotLeft} ${plotBottom}, ${plotRight} ${plotBottom}; marker: none; stroke: #536e78; stroke-width: 2; }`,
  `  |block#metric-stat-unit| ${quote(metric.unit)} { pin: center; translate: ${plotLeft-65} ${plotTop-30}; width: 110; font-size: 14; color: #304652; fill: none; stroke: none; }`,
 ];
 for(const [tickIndex,tick] of valueTicks.entries()){const y=yFor(tick);lines.push(`  |line#metric-stat-y-grid-${tickIndex+1}| "" { pin: center; translate: 0 ${y}; points: ${plotLeft} ${y}, ${plotRight} ${y}; marker: none; stroke: #d6dfe3; stroke-width: 1; }`);lines.push(`  |block#metric-stat-y-tick-${tickIndex+1}| ${quote(displayNumber(tick,decimals))} { pin: center; translate: ${plotLeft-28} ${y}; width: 50; font-size: 13; color: #304652; fill: none; stroke: none; }`);}
 for(const[index,day]of [...xTicks].sort((a,b)=>a-b).entries()){const x=xFor(day),date=utcCalendarDate(day);if(!date)return fail('PRESENTATION_LINI_STAT_DATE','/metric/series/0/points','The native date axis requires an exact supported UTC calendar date.');const label=date.slice(5);lines.push(`  |line#metric-stat-x-tick-${index+1}| "" { pin: center; translate: ${x} ${plotBottom}; points: ${x} ${plotBottom-5}, ${x} ${plotBottom+5}; marker: none; stroke: #536e78; stroke-width: 1; }`);lines.push(`  |block#metric-stat-x-tick-label-${index+1}| ${quote(label)} { pin: center; translate: ${x} ${plotBottom+24}; width: 75; font-size: 13; color: #304652; fill: none; stroke: none; }`);}
 lines.push(`  |block#metric-stat-date-axis-label| ${quote('Date ('+firstYear+(firstYear===lastYear?'':'–'+lastYear)+', UTC)')} { pin: center; translate: 0 ${plotBottom+54}; width: 260; font-size: 14; color: #304652; fill: none; stroke: none; }`);
 lines.push(`  |block#metric-stat-observations-heading| ${quote('Dated observations')} { pin: center; translate: 0 ${plotBottom+76}; width: 240; font-size: 14; color: #304652; fill: none; stroke: none; font-weight: bold; }`);
 for(let index=1;index<packed.length;index++){const previous=packed[index-1]!,current=packed[index]!;if(current.day===previous.day)continue;const cx=(previous.x+current.x)/2,cy=(previous.y+current.y)/2;lines.push(`  |line#metric-stat-guide-${index}| "" { pin: center; translate: ${cx} ${cy}; points: ${previous.x} ${previous.y}, ${current.x} ${current.y}; marker: none; stroke: #356377; stroke-width: 2.5; }`);}
 for(const row of packed){const n=row.sourceIndex+1,text=labelText(row);lines.push(`  |oval#metric-stat-marker-${n}| { pin: center; translate: ${row.x} ${row.y}; width: 12; height: 12; fill: #b74469; stroke: #ffffff; stroke-width: 2; }`);lines.push(`  |box#metric-stat-point-${n}| ${quote(text)} { pin: center; translate: ${row.labelX} ${row.labelY}; width: ${row.labelWidth}; height: 25; padding: 0; fill: #ffffff; stroke: #b5c3c9; stroke-width: 1; font-size: 12; color: #304652; }`);}
 if(metric.good!==undefined)lines.push(`  |block#metric-stat-good| ${quote('Better: '+metric.good)} { pin: center; translate: 0 ${goodY}; width: 220; font-size: 16; color: #304652; fill: none; stroke: none; font-weight: bold; }`);
 lines.push(`  |block#metric-stat-guide-note| ${quote('Points are dated observations; straight lines are visual guides.')} { pin: center; translate: 0 ${rendererNoteY}; width: 720; font-size: 13; color: #304652; fill: none; stroke: none; }`);
 if(visual.takeaway!==undefined)lines.push(`  |block#metric-stat-takeaway| ${quote(visual.takeaway)} { pin: center; translate: 0 ${takeawayY}; width: 1240; font-size: 14; color: #304652; fill: none; stroke: none; }`);
 for(const[index,note]of(visual.omissions??[]).entries())lines.push(`  |block#metric-stat-note-${index+1}| ${quote(note)} { pin: center; translate: 0 ${omissionY+index*24}; width: 1240; font-size: 13; color: #304652; fill: none; stroke: none; }`);
 lines.push(']');

 approximations.push({sourcePath:path('/metric/series/0/points'),requested:'Dated observations with a time/value plot',representation:'Point x coordinates are affine to exact UTC calendar-day offsets and y coordinates use each raw source value on renderer-selected numeric bounds. Labels show each exact date, formatted value, and unit; the chronological caption grid is renderer-only placement. Straight native guide segments connect successive dated observations only; they do not assert measurements between the authored points, smoothing, growth rates, or causation.'});
 approximations.push({sourcePath:path('/metric/series/0/points'),requested:'Latest observation summary',representation:`The headline reports the observation(s) with greatest exact UTC date, ${latest.point.at}, and labels it/them as dated observations. Same-date readings are listed together; array order does not define intra-day chronology or a unique latest reading.`});
 const pointMapCount=packed.length;
 if(pointMapCount!==series.points.length)return fail('PRESENTATION_LINI_STAT_SCOPE','/metric/series/0/points','Every source observation must have one native point and caption.');
 return{ok:true,profileId:'umf.visual.presentation/1',backend:'lini',nativeFormat:'lini',source:lines.join('\n')+'\n',elementMap:maps,omissions,approximations};
}
