// SPDX-License-Identifier: MIT OR Apache-2.0
/** Source-mapped native presentation for one categorical bar series. */
import type {Visual,VisualDefs} from '../extensions/visual';
import {quoteLiniProfile} from '../interchange/lini/profile-syntax';
import type {PresentationElement,PresentationFailure,PresentationOmission,PresentationPlan} from './index';

const BASE='/extensions/umf.visual';
const path=(part:string)=>BASE+(part.startsWith('/')?part:'/'+part);
const ptr=(value:string)=>value.replace(/~/g,'~0').replace(/\//g,'~1');
const unknown=(value:object,allowed:readonly string[])=>Object.keys(value).find(key=>!allowed.includes(key));
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const raw=(value:number)=>Object.is(value,-0)?'-0':String(value);
const scope=(part:string,message:string):PresentationFailure=>({ok:false,diagnostics:[{code:'PRESENTATION_LINI_BAR_SCOPE',path:path(part),message,severity:'error'}]});
const quote=(value:string,sourcePath:string)=>{try{return quoteLiniProfile(value);}catch(reason){throw Object.assign(new Error(reason instanceof Error?reason.message:'Text is outside the pinned Lini string subset.'),{sourcePath});}};
const style=(fontSize:number)=>`width: 1200; font-size: ${fontSize}; color: #243b45; fill: none; stroke: none; stroke-width: 0;`;
type Metric=VisualDefs['metric'];

/**
 * Compile a category-axis, single-series bar chart. Categories own display order;
 * point.at resolves by category id, while source pointers retain original indexes.
 */
export function compileLiniBarPresentation(visual:Visual):PresentationPlan|PresentationFailure {
 try{return compile(visual);}catch(reason){
  const error=reason as Error&{sourcePath?:unknown},located=typeof error?.sourcePath==='string';
  return {ok:false,diagnostics:[{code:located?'PRESENTATION_LINI_BAR_TEXT':'PRESENTATION_LINI_BAR_INTERNAL',path:located?error.sourcePath as string:path('/metric'),message:located&&error instanceof Error?error.message:'An internal native bar compilation error occurred; no projection was emitted.',severity:'error'}]};
 }
}

function compile(visual:Visual):PresentationPlan|PresentationFailure {
 if(visual.kind!=='metric'||visual.form!=='bar'||!visual.metric)return scope('/metric','A metric/bar payload is required.');
 const metric=visual.metric;
 const metricUnknown=unknown(metric,['unit','good','format','axis','series','target','baseline','comparison']);if(metricUnknown)return scope('/metric/'+ptr(metricUnknown),'An unrecognized metric property is retained in the source but has no qualified category-bar presentation mapping.');
 const topUnknown=unknown(visual,['id','kind','form','title','question','takeaway','audience','source','omissions','annotations','groups','nodes','edges','steps','sequence','structure','state','timeline','comparison','metric','layout']);
 if(topUnknown)return scope('/'+ptr(topUnknown),'An unrecognized visual property is retained in the source but has no qualified category-bar presentation mapping.');
 if(visual.layout!==undefined)return scope('/layout','The bounded categorical bar profile uses native chart layout; additional layout directives are not silently reinterpreted.');
 if(visual.nodes?.length)return scope('/nodes','The bounded categorical bar profile does not mix diagram actors with metric categories.');
 if(visual.edges?.length)return scope('/edges','The bounded categorical bar profile does not mix relationships with metric categories.');
 if(visual.groups?.length)return scope('/groups','The bounded categorical bar profile does not mix region groups with metric categories.');
 if(visual.structure!==undefined)return scope('/structure','The bounded categorical bar profile does not mix structure metadata with metric categories.');
 for(const field of ['sequence','state','timeline','comparison'] as const)if(visual[field]!==undefined)return scope('/'+field,'The bounded categorical bar profile does not reinterpret another visual-family payload.');
 if(visual.annotations?.length)return scope('/annotations','Free-text annotations are not yet qualified for this native chart composition.');
 if(metric.axis?.kind!=='category')return scope('/metric/axis','A categorical axis is required; time or numeric axes are not reinterpreted.');
 if(metric.series.length!==1)return scope('/metric/series','The bounded native bar profile supports exactly one series.');
 const axisUnknown=unknown(metric.axis,['kind','categories']);if(axisUnknown)return scope('/metric/axis/'+ptr(axisUnknown),'An unrecognized category-axis property is retained in the source but has no qualified bar mapping.');
 const categories=metric.axis.categories,series=metric.series[0]!;
 const seriesUnknown=unknown(series,['id','label','emphasis','points']);if(seriesUnknown)return scope('/metric/series/0/'+ptr(seriesUnknown),'An unrecognized series property is retained in the source but has no qualified bar mapping.');
 if(categories.length===0)return scope('/metric/axis/categories','At least one authored category is required.');
 if(series.points.length!==categories.length)return scope('/metric/series/0/points','Each declared category must have exactly one explicitly related point; missing values are not synthesized.');
 if(series.emphasis!==undefined)return scope('/metric/series/0/emphasis','Series emphasis has no qualified native bar mapping.');
 if(metric.target!==undefined||metric.baseline!==undefined||metric.comparison!==undefined||metric.good!==undefined)return scope('/metric','References and good-direction metadata do not have a qualified categorical bar mapping.');
 if(metric.format!==undefined){const formatUnknown=unknown(metric.format,['kind','decimals','currency','compact']);if(formatUnknown)return scope('/metric/format/'+ptr(formatUnknown),'An unrecognized number-format property is retained in the source but has no qualified category-bar mapping.');}
 if(metric.format!==undefined&&(metric.format.kind!=='number'||metric.format.currency!==undefined||metric.format.compact!==undefined||!Number.isInteger(metric.format.decimals??0)||metric.format.decimals!<0||metric.format.decimals!>6))return scope('/metric/format','Only plain number formatting with zero through six decimal places is qualified.');
 if(typeof metric.unit!=='string'||!metric.unit.trim())return scope('/metric/unit','A visible nonempty source unit is required for this bar profile.');
 const categoryById=new Map<string,{category:typeof categories[number];index:number}>();
 for(const[index,category]of categories.entries()){
  const categoryUnknown=unknown(category,['id','label']);if(categoryUnknown)return scope(`/metric/axis/categories/${index}/${ptr(categoryUnknown)}`,'An unrecognized category property is retained in the source but has no qualified text slot.');
  if(categoryById.has(category.id))return scope('/metric/axis/categories/'+index+'/id','Category IDs must be unique for point.at resolution.');
  categoryById.set(category.id,{category,index});
 }
 const pointByCategory=new Map<string,{point:typeof series.points[number];sourceIndex:number}>();
 for(const[sourceIndex,point]of series.points.entries()){
  const pointUnknown=unknown(point,['at','value']);if(pointUnknown)return scope(`/metric/series/0/points/${sourceIndex}/${ptr(pointUnknown)}`,'An unrecognized point property is retained in the source but has no qualified bar mapping.');
  if(!finite(point.value))return scope(`/metric/series/0/points/${sourceIndex}/value`,'Bar values must be finite numbers.');
  if(typeof point.at!=='string'||!categoryById.has(point.at))return scope(`/metric/series/0/points/${sourceIndex}/at`,'Every point.at must resolve to one declared category ID.');
  if(pointByCategory.has(point.at))return scope(`/metric/series/0/points/${sourceIndex}/at`,'A category cannot have multiple points in this single-series bar profile.');
  pointByCategory.set(point.at,{point,sourceIndex});
 }
 const missing=categories.findIndex(category=>!pointByCategory.has(category.id));
 if(missing>=0)return scope('/metric/series/0/points','Every category needs one explicit point; zero is not inferred for missing values.');

 const elements:PresentationElement[]=[],omissions:PresentationOmission[]=[],approximations:PresentationPlan['approximations']=[];
 const add=(logicalId:string,sourceSuffix:string,nativeId:string,kind:PresentationElement['kind'])=>elements.push({logicalId,sourcePath:path(sourceSuffix),nativeId,kind});
 const omit=(sourceSuffix:string,reason:string)=>omissions.push({sourcePath:path(sourceSuffix),reason});
 const title=visual.title??visual.question,titlePath=visual.title!==undefined?'/title':'/question';
 quote(title,path(titlePath));quote(visual.question,path('/question'));quote(series.label,path('/metric/series/0/label'));quote(metric.unit,path('/metric/unit'));
 if(visual.takeaway!==undefined)quote(visual.takeaway,path('/takeaway'));
 for(const[index,category]of categories.entries())quote(category.label,path('/metric/axis/categories/'+index+'/label'));
 if(visual.source!==undefined)omit('/source','Source provenance remains in UMF and is not chart geometry.');
 if(visual.audience!==undefined)omit('/audience','Audience metadata remains in UMF and does not alter category values.');
 if(visual.steps!==undefined)omit('/steps','Walkthrough steps are outside this static categorical chart.');
 if(visual.omissions)for(const[index,note]of visual.omissions.entries()){quote(note,path('/omissions/'+index));}

 const chartId='metric-bar-chart',seriesNative='metric-bar-series';
 add(visual.id,'/id',chartId,'visual');add(visual.id,titlePath,'metric-bar-title','visual');
 if(visual.title!==undefined&&visual.title!==visual.question)add(visual.id,'/question','metric-bar-question','visual');
 add(series.id,'/metric/series/0/id',`bars#${seriesNative}`,'metric-series');add(series.id,'/metric/series/0/label',`bars#${seriesNative}`,'metric-series');add(series.id,'/metric/series/0/label','metric-bar-series-label','metric-series');
 add(metric.unit,'/metric/unit','axis#metric-bar-axis/unit','metric-reference');
 add('category','/metric/axis/kind',`chart#${chartId}/categories`,'metric-reference');
 for(const[index,category]of categories.entries()){
  const nativeId=`chart#${chartId}/categories[${index}]`;
  add(category.id,`/metric/axis/categories/${index}/id`,nativeId,'metric-reference');
  add(category.id,`/metric/axis/categories/${index}/label`,nativeId,'metric-reference');
 }
 for(const[index,category]of categories.entries()){
  const relation=pointByCategory.get(category.id)!,sourceIndex=relation.sourceIndex,pointPath=`/metric/series/0/points/${sourceIndex}`;
  add(pointPath,pointPath,`bars#${seriesNative}/data[${index}]`,'metric-value');
  add(pointPath,pointPath+'/at',`chart#${chartId}/categories[${index}]`,'metric-value');
  add(pointPath,pointPath+'/value',`bars#${seriesNative}/data[${index}]`,'metric-value');
 }
 if(metric.format){add('number','/metric/format/kind','axis#metric-bar-axis','metric-reference');if(metric.format.decimals!==undefined)add(String(metric.format.decimals),'/metric/format/decimals','axis#metric-bar-axis/format','metric-reference');}
 if(visual.takeaway!==undefined)add(visual.id,'/takeaway','metric-bar-takeaway','visual');
 if(visual.omissions)for(const[index]of visual.omissions.entries())add(visual.id,'/omissions/'+index,`metric-bar-note-${index+1}`,'annotation');

 const values=categories.map(category=>pointByCategory.get(category.id)!.point.value),min=Math.min(0,...values),max=Math.max(0,...values),span=max-min,padding=span===0?Math.max(Math.abs(max)*.08,1):span*.08;
 const low=min-padding,high=max+padding;
 if(!Number.isFinite(low)||!Number.isFinite(high)||!(low<high))return scope('/metric/series/0/points','The finite values cannot be represented safely on a padded native numeric axis.');
 const decimals=metric.format?.kind==='number'?metric.format.decimals:undefined;
 const display=(value:number)=>decimals===undefined?(Object.is(value,-0)?'-0':String(value)):Number(value.toFixed(decimals)).toFixed(decimals);
 const categoryDisplay=(category:typeof categories[number])=>category.label;
 const categoriesText=categories.map((category,index)=>quote(categoryDisplay(category),path('/metric/axis/categories/'+index+'/label'))).join(', ');
 const valueText=categories.map(category=>quote(display(pointByCategory.get(category.id)!.point.value),path('/metric/series/0/points/'+pointByCategory.get(category.id)!.sourceIndex+'/value'))).join(', ');
 const source=`{ font-family: Arial; --lini-font-family: Arial; --muted: #243b45;\n  .lini-text { font-family: Arial; }\n  .lini-chart-text { fill: #243b45; color: #243b45; }\n  .lini-chart-label { fill: #243b45; color: #243b45; }\n  .lini-axis { color: #243b45; stroke: #536e78; font-size: 14; }\n}\n|column#metric-bar-panel| { width: 1280; gap: 16; padding: 24; fill: none; stroke: none; stroke-width: 0; } [\n  |block#metric-bar-title| ${quote(title,path(titlePath))} { ${style(26)} font-weight: bold; }\n${visual.title!==undefined&&visual.title!==visual.question?`  |block#metric-bar-question| ${quote(visual.question,path('/question'))} { ${style(16)} }\n`:''}  |chart#${chartId}| "" { layout: chart; direction: row; width: 1120; height: 510; categories: ${categoriesText}; } [\n    |axis#metric-bar-axis| ${quote(metric.unit,path('/metric/unit'))} { ${decimals===undefined?'':'format: decimal '+String(decimals)+';'} range: ${raw(low)} ${raw(high)}; ticks: ${raw(low)}, 0, ${raw(high)}; side: bottom; }\n    |bars#${seriesNative}| ${quote(series.label,path('/metric/series/0/label'))} { data: ${values.map(raw).join(', ')}; labels: ${valueText}; fill: #dceaf2; stroke: #356377; stroke-width: 2; }\n  ]\n  |block#metric-bar-series-label| ${quote(series.label,path('/metric/series/0/label'))} { ${style(16)} font-weight: bold; }\n${visual.takeaway===undefined?'':`  |block#metric-bar-takeaway| ${quote(visual.takeaway,path('/takeaway'))} { ${style(15)} }\n`}${(visual.omissions??[]).map((note,index)=>`  |block#metric-bar-note-${index+1}| ${quote(note,path('/omissions/'+index))} { ${style(14)} }\n`).join('')}]\n`;
 approximations.push({sourcePath:path('/metric'),requested:'One category axis and one category-valued series',representation:'The native bar chart displays categories in authored axis order. Each point is resolved by its `at` category ID and placed in that category slot; source point indexes remain unchanged in the element map. Category and data nativeId values are structural chart-owner/slot locators, not individually assigned SVG IDs; Lini emits ordered category and data slots. Axis unit and format locators refer to their declared axis owner and property. Numeric axis bounds include zero and the raw values with 8% renderer-selected padding (or a nonzero fallback for a degenerate domain). The axis is a display scale, not a source-defined maximum. Explicit number formatting controls visible precision only; absent formatting uses shortest round-trip labels. Raw bar geometry is unchanged.'});
 return{ok:true,profileId:'umf.visual.presentation/1',backend:'lini',nativeFormat:'lini',source,elementMap:elements,omissions,approximations};
}
