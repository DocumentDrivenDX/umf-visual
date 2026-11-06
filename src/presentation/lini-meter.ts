// SPDX-License-Identifier: MIT OR Apache-2.0
/** Source-mapped Lini projection for a bounded scalar meter profile. */
import type {Visual} from '../extensions/visual';
import {quoteLiniProfile} from '../interchange/lini/profile-syntax';
import type {PresentationElement,PresentationFailure,PresentationOmission,PresentationPlan} from './index';

const BASE='/extensions/umf.visual';
const path=(part:string)=>BASE+(part.startsWith('/')?part:'/'+part);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const num=(value:number)=>Object.is(value,-0)?'-0':String(value);
const fail=(sourcePath:string,message:string):PresentationFailure=>({ok:false,diagnostics:[{code:'PRESENTATION_LINI_METER_SCOPE',path:sourcePath,message,severity:'error'}]});
const q=(value:string,sourcePath:string)=>{try{return quoteLiniProfile(value);}catch(reason){throw Object.assign(new Error(reason instanceof Error?reason.message:'Text is outside the pinned Lini string subset.'),{sourcePath});}};
const color='#304652';
const blockStyle=(size:number)=>`width: 1200; font-size: ${size}; color: ${color}; fill: none; stroke: none; stroke-width: 0;`;

/** Compile one scalar reading and its explicit reference marks; the numeric axis is presentation policy. */
export function compileLiniMeter(visual:Visual):PresentationPlan|PresentationFailure {
 try{return unchecked(visual);}catch(reason){
  const error=reason as Error&{sourcePath?:unknown},located=typeof error?.sourcePath==='string';
  return {ok:false,diagnostics:[{code:located?'PRESENTATION_LINI_METER_TEXT':'PRESENTATION_LINI_METER_INTERNAL',path:located?error.sourcePath as string:path('/metric'),message:located&&error instanceof Error?error.message:'An internal native meter compilation error occurred; the projection was not emitted.',severity:'error'}]};
 }
}

function unchecked(visual:Visual):PresentationPlan|PresentationFailure {
 if(visual.kind!=='metric'||visual.form!=='meter'||!visual.metric)return fail(path('/metric'),'A metric/meter payload is required.');
 if(visual.layout!==undefined)return fail(path('/layout'),'This meter profile uses a native numeric axis; an additional layout directive is not silently reinterpreted.');
 if(visual.annotations?.length)return fail(path('/annotations'),'Free-text annotations are not yet qualified for the native meter composition.');
 const metric=visual.metric;
 if(metric.axis!==undefined)return fail(path('/metric/axis'),'The bounded meter has a numeric value axis and does not interpret a category or time axis.');
 if(metric.series.length!==1||metric.series[0]?.points.length!==1||metric.series[0].points[0]?.at!==undefined)return fail(path('/metric/series'),'This native meter profile requires exactly one scalar series point without a timestamp.');
 if(metric.target===undefined||!finite(metric.target))return fail(path('/metric/target'),'The scalar meter profile requires one finite authored target reference.');
 if(metric.format!==undefined&&(metric.format.kind!=='number'||metric.format.decimals!==0||metric.format.currency!==undefined||metric.format.compact!==undefined))return fail(path('/metric/format'),'The pinned scalar meter profile currently supports only number formatting with zero decimals.');
 if(metric.good!==undefined&&metric.good!=='up'&&metric.good!=='down')return fail(path('/metric/good'),'The authored good direction is not supported by this native meter profile.');
 const series=metric.series[0]!,point=series.points[0]!;
 if(series.emphasis!==undefined)return fail(path('/metric/series/0/emphasis'),'Series emphasis has no qualified native meter mapping.');
 const references=[metric.target,...(metric.baseline===undefined?[]:[metric.baseline]),...(metric.comparison===undefined?[]:[metric.comparison.value])];
 if(!finite(point.value))return fail(path('/metric/series/0/points/0/value'),'The meter value must be finite.');
 for(const [key,value] of [['target',metric.target],['baseline',metric.baseline],['comparison/value',metric.comparison?.value]] as const)if(value!==undefined&&!finite(value))return fail(path('/metric/'+key),'Reference values must be finite.');
 if(typeof metric.unit!=='string'||metric.unit.trim()==='')return fail(path('/metric/unit'),'A visible nonempty source unit is required for this meter profile.');

 const sourcePath=(part:string)=>path(part),elements:PresentationElement[]=[],omissions:PresentationOmission[]=[],approximations:PresentationPlan['approximations']=[];
 const add=(logicalId:string,at:string,nativeId:string,kind:PresentationElement['kind'])=>elements.push({logicalId,sourcePath:sourcePath(at),nativeId,kind});
 const omit=(at:string,reason:string)=>omissions.push({sourcePath:sourcePath(at),reason});
 const chartId='metric-meter-chart',seriesId='metric-meter-series-1',valueCaptionId='metric-meter-value';
 const title=visual.title??visual.question,titlePath=visual.title!==undefined?'/title':'/question';
 const displayNumber=(value:number)=>metric.format?.kind==='number'&&metric.format.decimals===0?value.toFixed(0):num(value);
 q(title,sourcePath(titlePath));if(visual.title!==undefined&&visual.question!==visual.title)q(visual.question,sourcePath('/question'));
 q(series.label,sourcePath('/metric/series/0/label'));q(metric.unit,sourcePath('/metric/unit'));
 if(metric.comparison)q(metric.comparison.label,sourcePath('/metric/comparison/label'));
 if(visual.takeaway!==undefined)q(visual.takeaway,sourcePath('/takeaway'));
 for(const[index,note]of (visual.omissions??[]).entries())q(note,sourcePath('/omissions/'+index));
 add(visual.id,'/id',chartId,'visual');add(visual.id,titlePath,'metric-meter-title','visual');
 if(visual.title!==undefined&&visual.question!==visual.title)add(visual.id,'/question','metric-meter-question','visual');
 add(series.id,'/metric/series/0/id',seriesId,'metric-series');add(series.id,'/metric/series/0/label',seriesId,'metric-series');
 const valuePath='/metric/series/0/points/0/value';
 add(valuePath,valuePath,valueCaptionId,'metric-value');add(valuePath,valuePath,seriesId,'metric-value');
 add(metric.unit,'/metric/unit','metric-meter-axis','metric-reference');
 const referenceEntries=[{value:metric.target,label:'Target '+displayNumber(metric.target),path:'/metric/target',nativeId:'metric-meter-target'},...(metric.baseline===undefined?[]:[{value:metric.baseline,label:'Baseline '+displayNumber(metric.baseline),path:'/metric/baseline',nativeId:'metric-meter-baseline'}]),...(metric.comparison===undefined?[]:[{value:metric.comparison.value,label:metric.comparison.label+' '+displayNumber(metric.comparison.value),path:'/metric/comparison/value',nativeId:'metric-meter-comparison'}])];
 const referenceGroups=new Map<number,typeof referenceEntries>();for(const entry of referenceEntries){const group=referenceGroups.get(entry.value)??[];group.push(entry);referenceGroups.set(entry.value,group);}
 for(const group of referenceGroups.values()){const owner=group[0]!.nativeId;for(const entry of group){add(String(entry.value),entry.path,owner,'metric-reference');if(entry.path==='/metric/comparison/value')add(metric.comparison!.label,'/metric/comparison/label',owner,'metric-reference');}}
 if(metric.format){add('number','/metric/format/kind','metric-meter-axis','metric-reference');add(String(metric.format.decimals??0),'/metric/format/decimals','metric-meter-axis','metric-reference');}
 if(metric.good!==undefined)add(metric.good,'/metric/good','metric-meter-good','metric-reference');
 if(visual.takeaway!==undefined)add(visual.id,'/takeaway','metric-meter-takeaway','visual');
 if(visual.source!==undefined)omit('/source','Source provenance remains in UMF and is not embedded in native chart geometry.');
 if(visual.audience!==undefined)omit('/audience','Audience metadata remains in UMF and does not change the authored meter values or scale.');
 if(visual.steps!==undefined)omit('/steps','Walkthrough steps are not represented by this static scalar meter.');
 if(visual.omissions)for(const[index,text]of visual.omissions.entries()){add(visual.id,'/omissions/'+index,'metric-meter-note-'+(index+1),'annotation');}

 const values=[0,point.value,...references],low=Math.min(...values),high=Math.max(...values),span=high-low,padding=span===0?Math.max(Math.abs(high)*0.08,1):span*0.08;
 let rangeLow=low-padding,rangeHigh=high+padding;
 if(!Number.isFinite(span)||!Number.isFinite(padding)||!Number.isFinite(rangeLow)||!Number.isFinite(rangeHigh)||!(rangeLow<rangeHigh))return fail(path('/metric'),'Finite source values exceed the native meter numeric range; renderer-selected bounds cannot be represented safely.');
 const scaleNumber=(value:number)=>Number(value.toPrecision(12));
 const displayLow=scaleNumber(rangeLow),displayHigh=scaleNumber(rangeHigh);
 const lines=[
  '{ font-family: Arial; --lini-font-family: Arial; --muted: #304652;\n  .lini-text { font-family: Arial; }\n  .lini-axis { color: #304652; stroke: #536e78; font-size: 14; }\n}',
  '|column#metric-meter-panel| { width: 1280; gap: 12; padding: 24; fill: none; stroke: none; stroke-width: 0; } [',
  `  |block#metric-meter-title| ${q(title,sourcePath(titlePath))} { ${blockStyle(24)} font-weight: bold; }`,
  ...(visual.title!==undefined&&visual.question!==visual.title?[`  |block#metric-meter-question| ${q(visual.question,sourcePath('/question'))} { ${blockStyle(16)} }`]:[]),
  `  |block#${valueCaptionId}| ${q(series.label+': '+displayNumber(point.value)+' '+metric.unit,sourcePath(valuePath))} { ${blockStyle(20)} font-weight: bold; }`,
  `  |chart#${chartId}| "" { layout: chart; direction: row; width: 1120; height: 150; categories: ${q(series.label,sourcePath('/metric/series/0/label'))}; } [`,
  `    |axis#metric-meter-axis| ${q(metric.unit,sourcePath('/metric/unit'))} { ${metric.format?'format: decimal 0;':''} range: ${num(displayLow)} ${num(displayHigh)}; ticks: ${num(displayLow)}, 0, ${num(displayHigh)}; side: bottom; }`,
  `    |bars#${seriesId}| ${q(series.label,sourcePath('/metric/series/0/label'))} { data: ${num(point.value)}; labels: ${q(displayNumber(point.value),sourcePath(valuePath))}; fill: #dceaf2; stroke: #356377; stroke-width: 2; }`,
  ...[...referenceGroups.values()].map(group=>`    |mark#${group[0]!.nativeId}| ${q(group.map(entry=>entry.label).join(' · '),sourcePath(group[0]!.path))} { at: ${num(group[0]!.value)}; axis: metric-meter-axis; }`),
  '  ]',
  ...(metric.good===undefined?[]:[`  |block#metric-meter-good| ${q('Better: '+metric.good,sourcePath('/metric/good'))} { ${blockStyle(16)} font-weight: bold; }`]),
  ...(visual.takeaway===undefined?[]:[`  |block#metric-meter-takeaway| ${q(visual.takeaway,sourcePath('/takeaway'))} { ${blockStyle(15)} }`]),
  ...(visual.omissions??[]).map((text,index)=>`  |block#metric-meter-note-${index+1}| ${q(text,sourcePath('/omissions/'+index))} { ${blockStyle(14)} }`),
  ']'
 ];
 approximations.push({sourcePath:sourcePath('/metric'),requested:'A scalar value, its references, unit and formatting',representation:`The native numeric axis uses renderer-selected bounds ${num(displayLow)} to ${num(displayHigh)}. Bounds include zero and every authored value/reference, with 8% range padding (or a nonzero fallback for a degenerate domain); explicit raw endpoint and zero tick anchors remain distinct even when zero-decimal labels round to the same text. These are display bounds, not a semantic maximum or percentage scale. Zero-decimal number formatting affects visible numeric labels only; native value and reference coordinates keep the original raw numbers.`});
 return {ok:true,profileId:'umf.visual.presentation/1',backend:'lini',nativeFormat:'lini',source:lines.join('\n')+'\n',elementMap:elements,omissions,approximations};
}
