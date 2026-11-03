// SPDX-License-Identifier: MIT OR Apache-2.0
/** Source-mapped Lini presentation for dated multi-series metric lines. */
import type {Visual} from '../extensions/visual';
import {quoteLiniProfile} from '../interchange/lini/profile-syntax';
import {utcCalendarDate,utcCalendarDay} from './calendar';
import {niceMetricStep,planMetricNumericScale} from './numeric-scale';
import type {PresentationApproximation,PresentationElement,PresentationFailure,PresentationOmission,PresentationPlan} from './index';

const BASE='/extensions/umf.visual';
const path=(part:string)=>BASE+(part.startsWith('/')?part:'/'+part);
const pointer=(value:string)=>value.replace(/~/g,'~0').replace(/\//g,'~1');
const unknown=(value:object,allowed:readonly string[])=>Object.keys(value).find(key=>!allowed.includes(key));
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const fail=(code:string,suffix:string,message:string):PresentationFailure=>({ok:false,diagnostics:[{code,path:path(suffix),message,severity:'error'}]});
const quote=quoteLiniProfile;
const num=(value:number)=>Object.is(value,-0)?'-0':String(value);
const displayNumber=(value:number,decimals:number|undefined)=>decimals===undefined?num(value):Number(value.toFixed(decimals)).toFixed(decimals);
const palette=['#356377','#b74469','#7a6848','#70548d','#2d7b68','#a85e2b'];

interface TrendPoint{sourceIndex:number;day:number;at:string;value:number;seriesIndex:number;seriesId:string;seriesLabel:string;}
interface SeriesView{sourceIndex:number;id:string;label:string;color:string;points:TrendPoint[];}

function knownVisualPayload(visual:Visual):PresentationFailure|undefined{
 const unknownTop=unknown(visual,['id','kind','form','title','question','takeaway','audience','source','omissions','annotations','groups','nodes','edges','steps','sequence','structure','state','timeline','comparison','metric','layout']);
 if(unknownTop)return fail('PRESENTATION_LINI_TREND_SCOPE','/'+pointer(unknownTop),'Unknown visual content is retained in the source but has no qualified line presentation mapping.');
 if(visual.layout!==undefined)return fail('PRESENTATION_LINI_TREND_SCOPE','/layout','The bounded temporal line view uses a renderer-owned plot layout and does not reinterpret extra layout directives.');
 if(visual.annotations?.length)return fail('PRESENTATION_LINI_TREND_SCOPE','/annotations','Free-text annotations have no qualified placement in this native temporal line scene.');
 if(visual.groups?.length)return fail('PRESENTATION_LINI_TREND_SCOPE','/groups','Region groups are not mixed into the bounded metric line plot.');
 if(visual.nodes?.length)return fail('PRESENTATION_LINI_TREND_SCOPE','/nodes','Diagram nodes are not reinterpreted as metric series.');
 if(visual.edges?.length)return fail('PRESENTATION_LINI_TREND_SCOPE','/edges','Diagram edges are not reinterpreted as time-series guides.');
 for(const key of ['sequence','structure','state','timeline','comparison'] as const)if(visual[key]!==undefined)return fail('PRESENTATION_LINI_TREND_SCOPE','/'+key,'A separate visual-family payload is not silently dropped by this metric projection.');
 return undefined;
}

function validate(visual:Visual):{series:SeriesView[];dates:number[];scale:NonNullable<ReturnType<typeof planMetricNumericScale>>}|PresentationFailure{
 if(visual.kind!=='metric'||visual.form!=='line'||!visual.metric)return fail('PRESENTATION_LINI_TREND_SCOPE','/form','A metric/line payload is required.');
 const extra=knownVisualPayload(visual);if(extra)return extra;
 const metric=visual.metric,metricUnknown=unknown(metric,['unit','good','format','axis','series','target','baseline','comparison']);
 if(metricUnknown)return fail('PRESENTATION_LINI_TREND_SCOPE','/metric/'+pointer(metricUnknown),'An unrecognized metric property has no qualified temporal line interpretation.');
 if(metric.axis?.kind!=='time')return fail('PRESENTATION_LINI_TREND_SCOPE','/metric/axis','A time axis is required; category or numeric axes are not reinterpreted.');
 const axisUnknown=unknown(metric.axis,['kind']);if(axisUnknown)return fail('PRESENTATION_LINI_TREND_SCOPE','/metric/axis/'+pointer(axisUnknown),'Additional time-axis properties have no qualified native mapping.');
 if(metric.series.length<1)return fail('PRESENTATION_LINI_TREND_SCOPE','/metric/series','At least one authored metric series is required.');
 if(metric.series.length>palette.length)return fail('PRESENTATION_LINI_TREND_SCOPE','/metric/series','The bounded native palette distinguishes at most six source-ordered series.');
 if(metric.target!==undefined||metric.baseline!==undefined||metric.comparison!==undefined)return fail('PRESENTATION_LINI_TREND_SCOPE','/metric','Target, baseline and comparison references are outside this bounded trend view.');
 if(metric.good!==undefined&&metric.good!=='up'&&metric.good!=='down')return fail('PRESENTATION_LINI_TREND_SCOPE','/metric/good','The global good direction must be the authored up or down cue.');
 if(metric.format!==undefined){const formatUnknown=unknown(metric.format,['kind','decimals','currency','compact']);if(formatUnknown)return fail('PRESENTATION_LINI_TREND_SCOPE','/metric/format/'+pointer(formatUnknown),'An unrecognized number-format property has no qualified line label mapping.');if(metric.format.kind!=='number'||metric.format.currency!==undefined||metric.format.compact!==undefined||!Number.isInteger(metric.format.decimals??0)||metric.format.decimals!<0||metric.format.decimals!>6)return fail('PRESENTATION_LINI_TREND_SCOPE','/metric/format','The bounded temporal line profile supports plain number labels with zero through six decimal places.');}
 if(typeof metric.unit!=='string'||!metric.unit.trim())return fail('PRESENTATION_LINI_TREND_SCOPE','/metric/unit','A visible nonempty source unit is required.');
 const views:SeriesView[]=[],allDays=new Set<number>(),allValues:number[]=[];
 for(const[seriesIndex,series]of metric.series.entries()){
  const base=`/metric/series/${seriesIndex}`,seriesUnknown=unknown(series,['id','label','emphasis','points']);if(seriesUnknown)return fail('PRESENTATION_LINI_TREND_SCOPE',base+'/'+pointer(seriesUnknown),'An unrecognized series property has no qualified line rendering meaning.');
  if(series.emphasis!==undefined)return fail('PRESENTATION_LINI_TREND_SCOPE',base+'/emphasis','Series emphasis has no qualified neutral line styling.');
  if(series.points.length<2)return fail('PRESENTATION_LINI_TREND_SCOPE',base+'/points','Each authored line series requires at least two observations.');
  const points:TrendPoint[]=[];
  for(const[pointIndex,point]of series.points.entries()){
   const pointPath=base+'/points/'+pointIndex,pointUnknown=unknown(point,['at','value']);if(pointUnknown)return fail('PRESENTATION_LINI_TREND_SCOPE',pointPath+'/'+pointer(pointUnknown),'An unrecognized observation property has no qualified line mapping.');
   if(typeof point.at!=='string'||utcCalendarDay(point.at)===undefined)return fail('PRESENTATION_LINI_TREND_DATE',pointPath+'/at','Only valid exact YYYY-MM-DD UTC dates are qualified for the native temporal x axis.');
   const day=utcCalendarDay(point.at)!;allDays.add(day);
   if(!finite(point.value))return fail('PRESENTATION_LINI_TREND_SCOPE',pointPath+'/value','Observation values must be finite numbers.');allValues.push(point.value);
   points.push({sourceIndex:pointIndex,day,at:point.at,value:point.value,seriesIndex,seriesId:series.id,seriesLabel:series.label});
  }
  points.sort((a,b)=>a.day-b.day||a.sourceIndex-b.sourceIndex);
  views.push({sourceIndex:seriesIndex,id:series.id,label:series.label,color:palette[seriesIndex]!,points});
 }
 if(new Set(views.map(item=>item.id)).size!==views.length)return fail('PRESENTATION_LINI_TREND_SCOPE','/metric/series','Series IDs must be unique to preserve source ownership.');
 const scale=planMetricNumericScale(allValues);if(!scale)return fail('PRESENTATION_LINI_TREND_SCOPE','/metric/series','The finite observations cannot be represented on a common numeric display axis.');
 return{series:views,dates:[...allDays].sort((a,b)=>a-b),scale};
}

/** Compile time-aligned multi-series observations without index zipping or source mutation. */
export function compileLiniTrendPresentation(visual:Visual):PresentationPlan|PresentationFailure{
 try{return compile(visual);}catch(error){const located=error&&typeof error==='object'&&'sourcePath'in error&&typeof error.sourcePath==='string'?String(error.sourcePath):path('/metric');return fail(located.startsWith(BASE)?'PRESENTATION_LINI_TREND_TEXT':'PRESENTATION_LINI_TREND_INTERNAL',located.startsWith(BASE)?located.slice(BASE.length):'/metric',error instanceof Error?error.message:'Native line compilation failed without a source location.');}
}

function compile(visual:Visual):PresentationPlan|PresentationFailure{
 const checked=validate(visual);if('ok'in checked)return checked;
 const metric=visual.metric!,title=visual.title??visual.question,titleSuffix=visual.title!==undefined?'/title':'/question',decimals=metric.format?.kind==='number'?metric.format.decimals:undefined;
 const quoteAt=(text:string,suffix:string)=>{try{return quote(text);}catch(error){throw Object.assign(error instanceof Error?error:new Error('Source text is outside the native Lini subset.'),{sourcePath:path(suffix)});}};
 try{quoteAt(title,titleSuffix);quoteAt(visual.question,'/question');quoteAt(metric.unit,'/metric/unit');for(const[seriesIndex,series]of metric.series.entries())quoteAt(series.label,`/metric/series/${seriesIndex}/label`);for(const series of checked.series)for(const point of series.points)quoteAt(point.at,`/metric/series/${series.sourceIndex}/points/${point.sourceIndex}/at`);if(metric.good!==undefined)quoteAt('Better: '+metric.good,'/metric/good');if(visual.takeaway!==undefined)quoteAt(visual.takeaway,'/takeaway');for(const[index,note]of(visual.omissions??[]).entries())quoteAt(note,'/omissions/'+index);}
 catch(error){const at=error&&typeof error==='object'&&'sourcePath'in error&&typeof error.sourcePath==='string'?String(error.sourcePath):path('/metric');return fail('PRESENTATION_LINI_TREND_TEXT',at.startsWith(BASE)?at.slice(BASE.length):'/metric',error instanceof Error?error.message:'Source text is outside the native Lini subset.');}
 const {series,dates,scale}=checked,firstDay=dates[0]!,lastDay=dates.at(-1)!,plotLeft=-700,plotRight=-50,plotTop=-220,plotBottom=125,plotWidth=plotRight-plotLeft,plotHeight=plotBottom-plotTop;
 const dateDomainStart=firstDay===lastDay?firstDay-1:firstDay,dateDomainEnd=firstDay===lastDay?lastDay+1:lastDay;
 const xFor=(day:number)=>plotLeft+(day-dateDomainStart)/(dateDomainEnd-dateDomainStart)*plotWidth,yFor=(value:number)=>plotBottom-(value-scale.min)/(scale.max-scale.min)*plotHeight;
 const tickStep=Math.max(1,Math.ceil(niceMetricStep(lastDay-firstDay||1))),candidateTickDays=dates.length<=12?dates:[...new Set([firstDay,lastDay,...Array.from({length:Math.ceil((lastDay-firstDay)/tickStep)},(_,index)=>firstDay+(index+1)*tickStep).filter(day=>day<lastDay)])].sort((a,b)=>a-b),dateTickDays:number[]=[];
 for(const day of candidateTickDays){if(dateTickDays.length===0||xFor(day)-xFor(dateTickDays.at(-1)!)>=76)dateTickDays.push(day);}
 if(dateTickDays.at(-1)!==lastDay){if(dateTickDays.length>1&&xFor(lastDay)-xFor(dateTickDays.at(-1)!)<76)dateTickDays.pop();dateTickDays.push(lastDay);}
 const yearStart=utcCalendarDate(firstDay)!.slice(0,4),yearEnd=utcCalendarDate(lastDay)!.slice(0,4),yearLabel=yearStart===yearEnd?yearStart:`${yearStart}–${yearEnd}`;
 const rows=series.flatMap(item=>item.points).sort((a,b)=>a.day-b.day||a.seriesIndex-b.seriesIndex||a.sourceIndex-b.sourceIndex),tableRows:Array<{day:number;points:Array<TrendPoint|undefined>}>=[],tableRowForPoint=new Map<string,number>();
 for(const day of dates){const bySeries=series.map(item=>item.points.filter(point=>point.day===day).sort((a,b)=>a.sourceIndex-b.sourceIndex)),repeated=bySeries.some(points=>points.length>1);if(!repeated){const points=bySeries.map(group=>group[0]),rowIndex=tableRows.length;for(const point of points)if(point)tableRowForPoint.set(`${point.seriesIndex}:${point.sourceIndex}`,rowIndex);tableRows.push({day,points});}else for(const group of bySeries)for(const point of group){const points:Array<TrendPoint|undefined>=Array(series.length).fill(undefined);points[point.seriesIndex]=point;const rowIndex=tableRows.length;tableRowForPoint.set(`${point.seriesIndex}:${point.sourceIndex}`,rowIndex);tableRows.push({day,points});}}
 const tableDateX=155,tableDateWidth=145,tableSeriesStart=390,tableColumnGap=205,tableRowStart=-165,tableRowGap=37,tableHeaderY=-205,tableUnitY=-242,tableLastY=tableRowStart+Math.max(0,tableRows.length-1)*tableRowGap;
 const tableRight=tableSeriesStart+Math.max(0,series.length-1)*tableColumnGap+100,sceneLeft=plotLeft-100,sceneRight=Math.max(tableRight+130,plotRight+120),sceneWidth=sceneRight-sceneLeft;
 const goodY=Math.max(210,tableLastY+52),guideNoteY=goodY+(metric.good!==undefined?24:0),takeawayY=guideNoteY+24,omissionsY=takeawayY+(visual.takeaway!==undefined?23:0),lastY=(visual.omissions?.length??0)>0?omissionsY+(visual.omissions!.length-1)*22:visual.takeaway!==undefined?takeawayY:guideNoteY,panelHeight=Math.max(850,Math.ceil((Math.max(385,lastY+20)+56)*2));
 const maps:PresentationElement[]=[],omissions:PresentationOmission[]=[],approximations:PresentationApproximation[]=[];
 const add=(logicalId:string,suffix:string,nativeId:string,kind:PresentationElement['kind'])=>maps.push({logicalId,sourcePath:path(suffix),nativeId,kind});
 const omit=(suffix:string,reason:string)=>omissions.push({sourcePath:path(suffix),reason});
 const panelId='metric-trend-panel',titleId='metric-trend-title',questionId='metric-trend-question',xAxisId='metric-trend-x-axis',yAxisId='metric-trend-y-axis',unitId='metric-trend-unit';
 add(visual.id,'/id',panelId,'visual');add(visual.id,titleSuffix,titleId,'visual');if(visual.title!==undefined&&visual.question!==visual.title)add(visual.id,'/question',questionId,'visual');
 add('time','/metric/axis/kind',xAxisId,'metric-reference');add(metric.unit,'/metric/unit',unitId,'metric-reference');add(metric.unit,'/metric/unit','metric-trend-plot-unit','metric-reference');
 for(const item of series){const native=`metric-trend-series-s${item.sourceIndex+1}`;add(item.id,`/metric/series/${item.sourceIndex}`,native,'metric-series');add(item.id,`/metric/series/${item.sourceIndex}/id`,native,'metric-series');add(item.id,`/metric/series/${item.sourceIndex}/label`,native,'metric-series');}
 for(const row of rows){const s=row.seriesIndex+1,p=row.sourceIndex+1,caption=`metric-trend-point-s${s}-p${p}`,marker=`metric-trend-marker-s${s}-p${p}`,dateRow=`metric-trend-date-row-d${tableRowForPoint.get(`${row.seriesIndex}:${row.sourceIndex}`)!+1}`,logical=JSON.stringify([row.seriesId,row.sourceIndex]),suffix=`/metric/series/${row.seriesIndex}/points/${row.sourceIndex}`;add(logical,suffix,caption,'metric-value');add(logical,suffix+'/at',dateRow,'metric-value');add(logical,suffix+'/value',caption,'metric-value');add(logical,suffix,marker,'metric-value');add(logical,suffix+'/value',marker,'metric-value');if(metric.format){for(const field of ['kind','decimals'] as const)if(field==='kind'||metric.format.decimals!==undefined)add(field==='kind'?'number':String(metric.format[field]),`/metric/format/${field}`,caption,'metric-reference');}}
 for(const[index,day]of dateTickDays.entries())add(utcCalendarDate(day)!,`/metric/axis/kind`,`metric-trend-date-tick-${index+1}`,'metric-reference');
 for(const[index,tick]of scale.ticks.entries())if(metric.format){add('number','/metric/format/kind',`metric-trend-y-tick-${index+1}`,'metric-reference');if(metric.format.decimals!==undefined)add(String(metric.format.decimals),'/metric/format/decimals',`metric-trend-y-tick-${index+1}`,'metric-reference');}
 if(metric.good!==undefined)add(metric.good,'/metric/good','metric-trend-good','metric-reference');
 if(visual.takeaway!==undefined)add(visual.id,'/takeaway','metric-trend-takeaway','visual');for(const[index]of(visual.omissions??[]).entries())add(visual.id,'/omissions/'+index,`metric-trend-note-${index+1}`,'annotation');

 const lines=[
  '{\n  --lini-font-family: Arial;\n  .lini-text { font-family: Arial; }\n  .lini-block { font-family: Arial; }\n}',
  `|group#${panelId}| "" { layout: flow; direction: column; width: ${Math.ceil(sceneWidth)}; height: ${panelHeight}; padding: 28; fill: none; stroke: none; stroke-width: 0; } [`,
  `  |block#${titleId}| ${quote(title)} { pin: center; translate: 0 -405; width: 1240; font-size: 25; color: #304652; fill: none; stroke: none; font-weight: bold; }`,
  ...(visual.title!==undefined&&visual.question!==visual.title?[`  |block#${questionId}| ${quote(visual.question)} { pin: center; translate: 0 -372; width: 1240; font-size: 16; color: #304652; fill: none; stroke: none; }`]:[]),
 ];
 for(const item of series){const index=item.sourceIndex,x=tableSeriesStart+index*tableColumnGap,key=`metric-trend-legend-key-s${index+1}`,id=`metric-trend-series-s${index+1}`;lines.push(`  |line#${key}| "" { pin: center; translate: ${x-72} ${tableHeaderY}; points: ${x-84} ${tableHeaderY}, ${x-60} ${tableHeaderY}; marker: none; stroke: ${item.color}; stroke-width: 3; }`);lines.push(`  |block#${id}| ${quote(item.label)} { pin: center; translate: ${x} ${tableHeaderY}; width: 155; font-size: 14; color: ${item.color}; fill: none; stroke: none; font-weight: bold; }`);}
 lines.push(`  |line#metric-trend-y-axis| "" { pin: center; translate: ${plotLeft} ${(plotTop+plotBottom)/2}; points: ${plotLeft} ${plotTop}, ${plotLeft} ${plotBottom}; marker: none; stroke: #536e78; stroke-width: 2; }`);
 const plotCenterX=(plotLeft+plotRight)/2;
 lines.push(`  |line#metric-trend-x-axis| "" { pin: center; translate: ${plotCenterX} ${plotBottom}; points: ${plotLeft} ${plotBottom}, ${plotRight} ${plotBottom}; marker: none; stroke: #536e78; stroke-width: 2; }`);
 const decimalsForTicks=decimals??undefined;
 for(const[index,tick]of scale.ticks.entries()){
  const y=yFor(tick);lines.push(`  |line#metric-trend-y-grid-${index+1}| "" { pin: center; translate: ${plotCenterX} ${y}; points: ${plotLeft} ${y}, ${plotRight} ${y}; marker: none; stroke: #d6dfe3; stroke-width: 1; }`);
  lines.push(`  |block#metric-trend-y-tick-${index+1}| ${quote(displayNumber(tick,decimalsForTicks))} { pin: center; translate: ${plotLeft-34} ${y}; width: 60; font-size: 13; color: #304652; fill: none; stroke: none; }`);
 }
 for(const[index,day]of dateTickDays.entries()){
  const x=xFor(day),date=utcCalendarDate(day);if(!date)return fail('PRESENTATION_LINI_TREND_DATE','/metric/axis','The native date axis could not represent a UTC tick date.');
  lines.push(`  |line#metric-trend-x-tick-${index+1}| "" { pin: center; translate: ${x} ${plotBottom}; points: ${x} ${plotBottom-5}, ${x} ${plotBottom+5}; marker: none; stroke: #536e78; stroke-width: 1; }`);
  lines.push(`  |block#metric-trend-date-tick-${index+1}| ${quote(date.slice(5))} { pin: center; translate: ${x} ${plotBottom+22}; width: 58; font-size: 12; color: #304652; fill: none; stroke: none; }`);
 }
 lines.push(`  |block#metric-trend-date-axis-label| ${quote(`Date (${yearLabel}, UTC)`)} { pin: center; translate: ${plotCenterX} ${plotBottom+48}; width: 240; font-size: 14; color: #304652; fill: none; stroke: none; }`);
 lines.push(`  |block#metric-trend-plot-unit| ${quote(metric.unit)} { pin: center; translate: ${plotLeft-52} ${plotTop-18}; width: 100; font-size: 14; color: #304652; fill: none; stroke: none; }`);
 lines.push(`  |block#metric-trend-date-header| ${quote('Date')} { pin: center; translate: ${tableDateX} ${tableHeaderY}; width: ${tableDateWidth}; font-size: 14; color: #304652; fill: none; stroke: none; font-weight: bold; }`);
 lines.push(`  |block#${unitId}| ${quote(metric.unit)} { pin: center; translate: ${tableSeriesStart+(series.length-1)*tableColumnGap/2} ${tableUnitY}; width: ${Math.max(160,series.length*tableColumnGap-30)}; font-size: 14; color: #304652; fill: none; stroke: none; font-weight: bold; }`);
 for(const item of series)for(let index=1;index<item.points.length;index++){
  const previous=item.points[index-1]!,current=item.points[index]!;if(previous.day===current.day)continue;const native=`metric-trend-guide-s${item.sourceIndex+1}-p${index}`;
  lines.push(`  |line#${native}| "" { pin: center; translate: ${(xFor(previous.day)+xFor(current.day))/2} ${(yFor(previous.value)+yFor(current.value))/2}; points: ${xFor(previous.day)} ${yFor(previous.value)}, ${xFor(current.day)} ${yFor(current.value)}; marker: none; stroke: ${item.color}; stroke-width: 3; }`);
 }
 for(const row of rows){
  const item=series[row.seriesIndex]!,s=row.seriesIndex+1,p=row.sourceIndex+1,marker=`metric-trend-marker-s${s}-p${p}`,shape=s%2===1?'oval':'diamond';
  lines.push(`  |${shape}#${marker}| { pin: center; translate: ${xFor(row.day)} ${yFor(row.value)}; width: 12; height: 12; fill: ${item.color}; stroke: #ffffff; stroke-width: 2; }`);
 }
 for(const[index,{day}]of tableRows.entries()){
  const y=tableRowStart+index*tableRowGap,date=utcCalendarDate(day)!;
  lines.push(`  |block#metric-trend-date-row-d${index+1}| ${quote(date)} { pin: center; translate: ${tableDateX} ${y}; width: ${tableDateWidth}; font-size: 13; color: #304652; fill: none; stroke: none; }`);
 }
 for(const row of rows){
  const seriesView=series[row.seriesIndex]!,s=row.seriesIndex+1,p=row.sourceIndex+1,native=`metric-trend-point-s${s}-p${p}`,columnX=tableSeriesStart+row.seriesIndex*tableColumnGap,y=tableRowStart+tableRowForPoint.get(`${row.seriesIndex}:${row.sourceIndex}`)!*tableRowGap,caption=displayNumber(row.value,decimals);
  lines.push(`  |block#${native}| ${quote(caption)} { pin: center; translate: ${columnX} ${y}; width: 145; font-size: 13; color: #304652; fill: none; stroke: none; }`);
 }
 if(metric.good!==undefined)lines.push(`  |block#metric-trend-good| ${quote('Better: '+metric.good)} { pin: center; translate: 0 ${goodY}; width: 220; font-size: 15; color: #304652; fill: none; stroke: none; font-weight: bold; }`);
 lines.push(`  |block#metric-trend-guide-note| ${quote('Straight lines connect dated observations as visual guides; no intermediate measurements are implied.')} { pin: center; translate: 0 ${guideNoteY}; width: 1050; font-size: 12; color: #304652; fill: none; stroke: none; }`);
 if(visual.takeaway!==undefined)lines.push(`  |block#metric-trend-takeaway| ${quote(visual.takeaway)} { pin: center; translate: 0 ${takeawayY}; width: 1240; font-size: 14; color: #304652; fill: none; stroke: none; }`);
 for(const[index,note]of(visual.omissions??[]).entries())lines.push(`  |block#metric-trend-note-${index+1}| ${quote(note)} { pin: center; translate: 0 ${omissionsY+index*22}; width: 1240; font-size: 13; color: #304652; fill: none; stroke: none; }`);
 lines.push(']');
 const seriesPointers=series.map(item=>`/metric/series/${item.sourceIndex}/points`);
 approximations.push({sourcePath:path('/metric/series'),requested:'Dated metric series on one temporal/value plot',representation:`Series use a neutral palette in authored series order; each has source-indexed markers and its own native straight guide segments. Series share an exact UTC-day x scale and raw-value y scale. A compact date-by-series table shows union dates; absent values stay blank. When a date repeats within any series, its observations receive separate source-order display rows; rows do not establish intra-day chronology or pair observations across series. Guides skip same-date links and do not imply intermediate measurements, smoothing, totals, growth rates, or causation. A single-date domain receives renderer-only one-day padding so its marker remains visible at the center.`});
 if(metric.format)approximations.push({sourcePath:path('/metric/format'),requested:'Formatted numeric labels',representation:'The authored number format affects visible captions and ticks only; each marker remains positioned by its exact raw source value.'});
 if(visual.source!==undefined)omit('/source','Source provenance remains in the source document and does not alter plotted values.');if(visual.audience!==undefined)omit('/audience','Audience metadata remains in the source document and does not change the plotted series.');if(visual.steps!==undefined)omit('/steps','Walkthrough steps remain in UMF; this is a static time/value plot.');
 return{ok:true,profileId:'umf.visual.presentation/1',backend:'lini',nativeFormat:'lini',source:lines.join('\n')+'\n',elementMap:maps,omissions,approximations};
}
