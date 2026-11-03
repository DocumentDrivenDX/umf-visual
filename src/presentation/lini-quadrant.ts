// SPDX-License-Identifier: MIT OR Apache-2.0
/** A concise, source-mapped Lini rendering of a two-axis rating quadrant. */
import type {Visual} from '../extensions/visual';
import {quoteLiniProfile} from '../interchange/lini/profile-syntax';
import type {PresentationElement,PresentationFailure,PresentationOmission,PresentationPlan} from './index';

const BASE='/extensions/umf.visual';
const path=(value:string)=>BASE+(value.startsWith('/')?value:'/'+value);
const fail=(sourcePath:string,message:string):PresentationFailure=>({ok:false,diagnostics:[{code:'PRESENTATION_LINI_QUADRANT_SCOPE',path:sourcePath,message,severity:'error'}]});
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const q=(value:string,sourcePath:string)=>{try{return quoteLiniProfile(value);}catch(reason){throw Object.assign(new Error(reason instanceof Error?reason.message:'Text is outside the pinned Lini string subset.'),{sourcePath});}};
const style=(fontSize:number,color:string)=>`width: 1200; font-size: ${fontSize}; color: ${color}; fill: none; stroke: none; stroke-width: 0;`;

/** Compile exact x/y ratings to native Lini points; no thresholds or positions are invented. */
export function compileLiniQuadrant(visual:Visual):PresentationPlan|PresentationFailure {
 try{return compileLiniQuadrantUnchecked(visual);}catch(reason){
  const error=reason as Error&{sourcePath?:unknown},hasTextLocation=typeof error?.sourcePath==='string',sourcePath=hasTextLocation?error.sourcePath as string:path('/comparison');
  return {ok:false,diagnostics:[{code:hasTextLocation?'PRESENTATION_LINI_QUADRANT_TEXT':'PRESENTATION_LINI_QUADRANT_INTERNAL',path:sourcePath,message:hasTextLocation&&error instanceof Error?error.message:'An internal native quadrant compilation error occurred; the projection was not emitted.',severity:'error'}]};
 }
}

function compileLiniQuadrantUnchecked(visual:Visual):PresentationPlan|PresentationFailure {
 const comparison=visual.comparison;
 if(visual.kind!=='comparison'||visual.form!=='quadrant'||!comparison)return fail(path('/comparison'),'A quadrant comparison payload is required.');
 if(visual.layout!==undefined)return fail(path('/layout'),'This profile uses the native chart coordinate plane; an additional visual layout directive is not silently reinterpreted.');
 const axes=comparison.axes;
 if(!axes||axes.x===axes.y)return fail(path('/comparison/axes'),'A quadrant requires two distinct authored criterion axes.');
 if(comparison.criteria.length!==2)return fail(path('/comparison/criteria'),'This profile plots exactly the two authored rating criteria selected by the quadrant axes.');
 const x=comparison.criteria.find(criterion=>criterion.id===axes.x),y=comparison.criteria.find(criterion=>criterion.id===axes.y);
 if(!x||!y)return fail(path('/comparison/axes'),'The authored x and y axes must resolve to the two declared criteria.');
 for(const [criterion,index] of [[x,comparison.criteria.indexOf(x)],[y,comparison.criteria.indexOf(y)]] as const){
  if(criterion.measure!=='rating'||!finite(criterion.max)||criterion.max<=0||!criterion.low||!criterion.high)return fail(path('/comparison/criteria/'+index),'The bounded quadrant profile requires rating criteria with a positive maximum and authored low/high labels.');
 }
 if(comparison.items.length===0)return fail(path('/comparison/items'),'A quadrant needs at least one rated item.');
 const itemIndex=new Map(comparison.items.map((item,index)=>[item.id,index]));
 const criterionIndex=new Map(comparison.criteria.map((criterion,index)=>[criterion.id,index]));
 const valueIndex=new Map<string,number>();
 for(const [index,value] of comparison.values.entries()){
  if(value.criterion!==axes.x&&value.criterion!==axes.y)return fail(path('/comparison/values/'+index),'Every value in this bounded quadrant must belong to one of its two authored rating axes.');
  if(!finite(value.rating)||value.rating<0||value.rating>comparison.criteria.find(criterion=>criterion.id===value.criterion)!.max!)return fail(path('/comparison/values/'+index+'/rating'),'Ratings in this profile must fall within the authored 0-to-maximum axis range.');
  const key=JSON.stringify([value.item,value.criterion]);
  if(valueIndex.has(key))return fail(path('/comparison/values/'+index),'A plotted item/criterion pair must have one unambiguous authored rating.');
  valueIndex.set(key,index);
 }
 for(const item of comparison.items)for(const criterion of [x,y])if(!valueIndex.has(JSON.stringify([item.id,criterion.id])))return fail(path('/comparison/values'),'Each plotted item requires one authored rating on each selected axis.');
 if(comparison.chosen&&!itemIndex.has(comparison.chosen.item))return fail(path('/comparison/chosen/item'),'The chosen item must resolve to a declared item.');

 const elements:PresentationElement[]=[],omissions:PresentationOmission[]=[];
 const add=(logicalId:string,sourcePath:string,nativeId:string,kind:PresentationElement['kind'])=>elements.push({logicalId,sourcePath,nativeId,kind});
 const xIndex=criterionIndex.get(x.id)!,yIndex=criterionIndex.get(y.id)!,xAxisId='quadrant-x-axis',yAxisId='quadrant-y-axis';
 add(visual.id,path('/id'),'quadrant-chart','visual');
 add(visual.id,path(visual.title!==undefined?'/title':'/question'),'quadrant-chart','visual');
 if(visual.title!==undefined&&visual.title!==visual.question)add(visual.id,path('/question'),'quadrant-question','visual');
 add(x.id,path('/comparison/axes/x'),xAxisId,'comparison-criterion');
 add(y.id,path('/comparison/axes/y'),yAxisId,'comparison-criterion');
 for(const [criterion,index,axisId,anchorId] of [[x,xIndex,xAxisId,'quadrant-x-anchors'],[y,yIndex,yAxisId,'quadrant-y-anchors']] as const){
  for(const field of ['id','label','max'] as const)if(criterion[field]!==undefined)add(criterion.id,path('/comparison/criteria/'+index+'/'+field),axisId,'comparison-criterion');
  add(criterion.id,path('/comparison/criteria/'+index+'/measure'),anchorId,'comparison-criterion');
  add(criterion.id,path('/comparison/criteria/'+index+'/low'),anchorId,'comparison-criterion');
  add(criterion.id,path('/comparison/criteria/'+index+'/high'),anchorId,'comparison-criterion');
  if(criterion.detail!==undefined)add(criterion.id,path('/comparison/criteria/'+index+'/detail'),anchorId,'comparison-criterion');
 }

 const itemLines:string[]=[];
 for(const [index,item] of comparison.items.entries()){
  const nativeId='quadrant-item-'+(index+1),xValue=comparison.values[valueIndex.get(JSON.stringify([item.id,x.id]))!]!,yValue=comparison.values[valueIndex.get(JSON.stringify([item.id,y.id]))!]!;
  const xRating=xValue.rating!,yRating=yValue.rating!,parts=[item.label+` (${xRating}, ${yRating})`];
  if(item.detail!==undefined)parts.push(item.detail);
  if(xValue.note!==undefined)parts.push(x.label+' note: '+xValue.note);
  if(yValue.note!==undefined)parts.push(y.label+' note: '+yValue.note);
  const display=parts.join('\n'),chosen=comparison.chosen?.item===item.id;
  itemLines.push(`    |mark#${nativeId}| ${q(display,path('/comparison/items/'+index+'/label'))} { at: ${xRating} ${yRating}; axis: ${yAxisId}; marker: circle; fill: #304652; }`);
  add(item.id,path('/comparison/items/'+index+'/id'),nativeId,'comparison-item');
  add(item.id,path('/comparison/items/'+index+'/label'),nativeId,'comparison-item');
  if(item.detail!==undefined)add(item.id,path('/comparison/items/'+index+'/detail'),nativeId,'comparison-item');
  for(const [criterionId,sourceValue] of [[x.id,xValue],[y.id,yValue]] as const){
   const sourceIndex=valueIndex.get(JSON.stringify([item.id,criterionId]))!,logicalId=JSON.stringify([item.id,criterionId]);
   add(logicalId,path('/comparison/values/'+sourceIndex+'/rating'),nativeId,'comparison-value');
   if(sourceValue.note!==undefined)add(logicalId,path('/comparison/values/'+sourceIndex+'/note'),nativeId,'comparison-value');
  }
 }

 const title=visual.title??visual.question;
 const lines=[
  '{ font-family: Arial; --lini-font-family: Arial; --muted: #304652;\n  .lini-text { font-family: Arial; }\n  .lini-axis { color: #304652; stroke: #304652; font-size: 15; }\n}',
  '|column#quadrant-panel| { width: 1280; gap: 18; align: center; padding: 24; fill: none; stroke: none; stroke-width: 0; } [',
  ...(visual.title!==undefined&&visual.title!==visual.question?[`  |block#quadrant-question| ${q(visual.question,path('/question'))} { ${style(16,'#304652')} }`]:[]),
  `  |chart#quadrant-chart| ${q(title,path(visual.title!==undefined?'/title':'/question'))} { layout: chart; width: 1100; height: 560; gap: 12; } [`,
  `    |axis#${xAxisId}| ${q(x.label,path('/comparison/criteria/'+xIndex+'/label'))} { range: 0 ${x.max}; side: bottom; ticks: 0, ${x.max}; color: #304652; fill: #304652; stroke: #304652; font-size: 15; }`,
  `    |axis#${yAxisId}| ${q(y.label,path('/comparison/criteria/'+yIndex+'/label'))} { range: 0 ${y.max}; side: left; ticks: 0, ${y.max}; color: #304652; fill: #304652; stroke: #304652; font-size: 15; }`,
  '    |line#quadrant-renderer-scaffold| "" { data: 0 0, 0 0; marker: none; stroke: none; stroke-width: 0; }',
  ...itemLines,
  '  ]',
  `  |block#quadrant-x-anchors| ${q(`${x.label} rating: 0 = low — ${x.low}; ${x.max} = high — ${x.high}${x.detail===undefined?'':'\n'+x.detail}`,path('/comparison/criteria/'+xIndex+'/low'))} { ${style(14,'#304652')} }`,
  `  |block#quadrant-y-anchors| ${q(`${y.label} rating: 0 = low — ${y.low}; ${y.max} = high — ${y.high}${y.detail===undefined?'':'\n'+y.detail}`,path('/comparison/criteria/'+yIndex+'/low'))} { ${style(14,'#304652')} }`,
 ];
 if(visual.takeaway!==undefined){lines.push(`  |block#quadrant-takeaway| ${q(visual.takeaway,path('/takeaway'))} { ${style(15,'#304652')} }`);add(visual.id,path('/takeaway'),'quadrant-takeaway','visual');}
 if(comparison.chosen){const chosen=comparison.items[itemIndex.get(comparison.chosen.item)!]!;lines.push(`  |block#quadrant-choice| ${q('Authored choice: '+chosen.label+' — '+comparison.chosen.reason,path('/comparison/chosen/reason'))} { ${style(15,'#1f5f9c')} font-weight: bold; }`);add(chosen.id,path('/comparison/chosen/item'),'quadrant-choice','comparison-choice');add(chosen.id,path('/comparison/chosen/reason'),'quadrant-choice','comparison-choice');}
 for(const [index,caveat] of (visual.omissions??[]).entries()){const nativeId='quadrant-caveat-'+(index+1);lines.push(`  |block#${nativeId}| ${q(caveat,path('/omissions/'+index))} { ${style(14,'#304652')} }`);add(visual.id,path('/omissions/'+index),nativeId,'annotation');}
 for(const [index,annotation] of (visual.annotations??[]).entries()){const nativeId='quadrant-annotation-'+(index+1);lines.push(`  |block#${nativeId}| ${q(annotation.text,path('/annotations/'+index+'/text'))} { ${style(14,'#304652')} }`);add(annotation.id,path('/annotations/'+index+'/id'),nativeId,'annotation');add(annotation.id,path('/annotations/'+index+'/text'),nativeId,'annotation');}
 lines.push(']');
 for(const [key,reason] of [['/audience','Audience metadata remains in UMF and is not used to alter the authored score positions.'],['/source','Source provenance remains in UMF and is not embedded in the chart geometry.'],['/steps','Walkthrough steps are not part of this static rating quadrant.']] as const)if(visual[key.slice(1) as 'audience'|'source'|'steps']!==undefined)omissions.push({sourcePath:path(key),reason});
 for(const key of ['groups','nodes','edges','sequence','structure','state','timeline','metric'] as const)if(visual[key]!==undefined)omissions.push({sourcePath:path('/'+key),reason:'Retained in UMF; not part of the native comparison quadrant.'});
 return {ok:true,profileId:'umf.visual.presentation/1',backend:'lini',nativeFormat:'lini',source:lines.join('\n')+'\n',elementMap:elements,omissions,approximations:[{sourcePath:path('/comparison/values'),requested:'Exact item rating positions on two authored axes',representation:'Lini 1.1 requires a chart series before it accepts point marks. The renderer uses an unmapped duplicate-origin, zero-length series as a native chart scaffold; it adds no visible line, point, rating, or semantic relation. Each visible item mark uses its exact authored x/y ratings without jitter.'}]};
}
