// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Visual} from '../../extensions/visual';
import type {VisualDefs} from '../../extensions/visual/generated';
import {VISUAL_PATH,interchangeDiagnostic} from '../shared';
import type {InterchangeDiagnostic} from '../types';
import type {NativeLocator,ProjectionCoverage} from '../annotations';
import type {LiniProfileNode,LiniProfileToken} from './profile-syntax';
import {quoteLiniProfile} from './profile-syntax';

export type LiniMetricForm='stat'|'bar'|'line'|'meter';
export type LiniMetricIdentityKind='series'|'category'|'point';
/** Points have no Visual IDs: their nativeId is an exact ordered data-slot locator, not a fabricated native object. */
export interface LiniMetricIdentityMapping {
 kind:LiniMetricIdentityKind;
 nativeId:string;
 /** Visual series/category ID, or the exact JSON Pointer for an anonymous point. */
 visualId:string;
 path:string;
 sourcePath?:string;
}
export interface LiniMetricSerializeResult {statements:string[];identityMap:LiniMetricIdentityMapping[];coverage:ProjectionCoverage[];diagnostics:InterchangeDiagnostic[];}
export interface LiniMetricParseResult {metric?:VisualDefs['metric'];identityMap:LiniMetricIdentityMapping[];coverage:ProjectionCoverage[];diagnostics:InterchangeDiagnostic[];}

const METRIC=VISUAL_PATH+'/metric';
const path=(suffix:string)=>METRIC+suffix;
const diag=(code:string,at:string,message:string,severity:'warning'|'error'='warning',loss=true):InterchangeDiagnostic=>interchangeDiagnostic(code,at,message,{severity,loss});
const covers=(at:string,aspects:ProjectionCoverage['aspect'][],native:NativeLocator):ProjectionCoverage[]=>aspects.map(aspect=>({path:at,aspect,representation:'native-concept',native:[native]}));
const quote=(text:string)=>quoteLiniProfile(text);
const trimNative=(text:string)=>text.replace(/^\p{White_Space}+|\p{White_Space}+$/gu,'');
const validLiniDate=(text:string)=>{
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text);if(!match)return false;
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);if(month<1||month>12||day<1)return false;
 const leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];return day<=days[month-1]!;
};
const nativeChartId=(form:LiniMetricForm)=>'metric-'+form;
const nativeGroupId=(form:LiniMetricForm)=>'metric-'+form+'-group';
const nativeSeriesId=(id:string)=>'ser_'+[...id].map(character=>character.codePointAt(0)!.toString(16).padStart(2,'0')).join('');
const nativeCategoryId=(id:string)=>'cat_'+[...id].map(character=>character.codePointAt(0)!.toString(16).padStart(2,'0')).join('');
const decodeVisualId=(value:string,prefix:'ser_'|'cat_')=>{
 if(!value.startsWith(prefix))return;
 const hex=value.slice(prefix.length);if(!hex||hex.length%2||!/^[0-9a-f]+$/.test(hex))return;
 let decoded='';for(let i=0;i<hex.length;i+=2)decoded+=String.fromCharCode(Number.parseInt(hex.slice(i,i+2),16));
 return /^[a-z0-9]+(?:[_-]+[a-z0-9]+)*$/.test(decoded)&&decoded.length<=128?decoded:undefined;
};
const axisId='value-axis',timeAxisId='time-axis';
const finite=(value:number)=>Number.isFinite(value);
const num=(value:number)=>Object.is(value,-0)?'-0':String(value);

type Metric=VisualDefs['metric'];
interface ReadyMetric {visual:Visual;form:LiniMetricForm;metric:Metric;}
function preflight(visual:Visual):{ready?:ReadyMetric;diagnostics:InterchangeDiagnostic[]} {
 const diagnostics:InterchangeDiagnostic[]=[],reject=(code:string,at:string,message:string)=>diagnostics.push(diag(code,at,message,'error',false));
 if(visual.kind!=='metric'||!['stat','bar','line','meter'].includes(visual.form)){
  reject('LINI_METRIC_FORM',VISUAL_PATH+'/form','The native Lini metric subset accepts stat, bar, line and meter forms only.');return{diagnostics};
 }
 const form=visual.form as LiniMetricForm,metric=visual.metric;if(!metric){reject('LINI_METRIC_REQUIRED',METRIC,'Metric content is required.');return{diagnostics};}
 const safeText=(value:string,at:string)=>{
  try{quote(value);}catch{reject('LINI_METRIC_TEXT',at,'Text contains characters outside the pinned Lini string subset.');return;}
  if(trimNative(value)!==value)reject('LINI_METRIC_TRIM',at,'Pinned Lini trims boundary whitespace in visible labels.');
 };
 safeText(metric.unit,path('/unit'));if(trimNative(metric.unit)==='')reject('LINI_METRIC_UNIT',path('/unit'),'The native chart unit must be nonempty.');
 if(metric.format&&!(metric.format.kind==='number'&&metric.format.decimals===0))reject('LINI_METRIC_FORMAT',path('/format'),'Only number format with zero decimals has been proven by the pinned native runtime.');
 if(metric.format?.currency!==undefined||metric.format?.compact!==undefined)reject('LINI_METRIC_FORMAT',path('/format'),'Currency and compact presentation are outside the proven metric subset.');
 if(metric.series.length===0)reject('LINI_METRIC_SERIES',path('/series'),'A chart needs at least one data series.');
 metric.series.forEach((series,index)=>{
  if(!/^[a-z0-9]+(?:[_-]+[a-z0-9]+)*$/.test(series.id)||series.id.length>128)reject('LINI_METRIC_ID',path('/series/'+index+'/id'),'Series id is outside the visual id grammar.');
  safeText(series.label,path('/series/'+index+'/label'));
  if(series.emphasis!==undefined)reject('LINI_METRIC_EMPHASIS',path('/series/'+index+'/emphasis'),'Series emphasis has no qualified native chart mapping.');
  if(!series.points.length)reject('LINI_METRIC_POINTS',path('/series/'+index+'/points'),'A native series needs at least one point.');
  series.points.forEach((point,pointIndex)=>{
   if(!finite(point.value))reject('LINI_METRIC_VALUE',path('/series/'+index+'/points/'+pointIndex+'/value'),'Native values must be finite.');
   if(metric.format?.kind==='number'&&metric.format.decimals===0&&!Number.isInteger(point.value))reject('LINI_METRIC_PRECISION',path('/series/'+index+'/points/'+pointIndex+'/value'),'A zero-decimal metric format cannot faithfully display fractional values.');
   if((form==='line'||form==='stat')&&point.at===undefined)reject('LINI_METRIC_TIME',path('/series/'+index+'/points/'+pointIndex+'/at'),'Time-series points require an explicit date/time.');
   if(form==='bar'&&point.at===undefined)reject('LINI_METRIC_CATEGORY',path('/series/'+index+'/points/'+pointIndex+'/at'),'Bar points must identify an axis category.');
   if(point.at!==undefined){safeText(point.at,path('/series/'+index+'/points/'+pointIndex+'/at'));if((form==='line'||form==='stat')&&!validLiniDate(point.at))reject('LINI_METRIC_TIME',path('/series/'+index+'/points/'+pointIndex+'/at'),'Only full ISO calendar dates are qualified for the native time axis.');}
  });
 });
 if(form==='bar'){
  if(metric.axis?.kind!=='category')reject('LINI_METRIC_AXIS',path('/axis'),'Bar form requires a category axis.');
  if(metric.series.length!==1)reject('LINI_METRIC_SERIES',path('/series'),'Only one series is proven for this bar profile.');
  if(metric.axis?.kind==='category'){
   if(metric.axis.categories.length===0)reject('LINI_METRIC_CATEGORIES',path('/axis/categories'),'Bar form requires at least one category.');
   const declared=metric.axis.categories.map(category=>category.id),actual=metric.series[0]?.points.map(point=>point.at)??[];
   if(declared.length!==actual.length||declared.some((id,index)=>id!==actual[index]))reject('LINI_METRIC_CATEGORIES',path('/axis/categories'),'Bar points must occur exactly once in declared category order.');
   const ids=new Set<string>();metric.axis.categories.forEach((category,index)=>{if(!/^[a-z0-9]+(?:[_-]+[a-z0-9]+)*$/.test(category.id)||category.id.length>128)reject('LINI_METRIC_CATEGORY_ID',path('/axis/categories/'+index+'/id'),'Category id is outside the reversible identity mapping grammar.');if(ids.has(category.id))reject('LINI_METRIC_CATEGORY_ID',path('/axis/categories/'+index+'/id'),'Category IDs must be unique.');ids.add(category.id);safeText(category.label,path('/axis/categories/'+index+'/label'));});
  }
 }else if(form==='line'||form==='stat'){
  if(metric.axis?.kind!=='time')reject('LINI_METRIC_AXIS',path('/axis'),'Line and stat forms require a time axis.');
  if(form==='stat'&&metric.series.length!==1)reject('LINI_METRIC_SERIES',path('/series'),'Stat form needs exactly one sparkline series.');
 }else{
  const series=metric.series[0];if(metric.series.length!==1||series?.points.length!==1||series.points[0]?.at!==undefined)reject('LINI_METRIC_METER',path('/series'),'Meter form needs one current scalar value.');
  if(metric.target===undefined)reject('LINI_METRIC_TARGET',path('/target'),'Meter form requires a visible target mark.');
  if(metric.axis!==undefined)reject('LINI_METRIC_AXIS',path('/axis'),'Meter profile does not define an x axis; use target and baseline marks on the value axis.');
 }
 for(const [key,value] of [['target',metric.target],['baseline',metric.baseline],['comparison',metric.comparison?.value]] as const){
  if(value!==undefined&&!finite(value))reject('LINI_METRIC_VALUE',path('/'+key),'Reference values must be finite.');
  if(value!==undefined&&metric.format?.kind==='number'&&metric.format.decimals===0&&!Number.isInteger(value))reject('LINI_METRIC_PRECISION',path('/'+key),'Zero-decimal format cannot faithfully display a fractional reference value.');
 }
 if(metric.comparison)safeText(metric.comparison.label,path('/comparison/label'));
 if(visual.title!==undefined)safeText(visual.title,VISUAL_PATH+'/title');
 if(diagnostics.some(item=>item.severity==='error'))return{diagnostics};
 return{ready:{visual,form,metric},diagnostics};
}

function valueAxis(unit:string,format:Metric['format'],range='0 auto',side?:'left'|'bottom'):string {
 const properties=['unit: '+quote(unit)+';',...(format?['format: decimal 0;']:[]),'range: '+range+';',...(side?['side: '+side+';']:[])];
 return'|axis#'+axisId+'| '+quote(unit)+' { '+properties.join(' ')+' }';
}
function referenceRange(metric:Metric):string {
 const values=[...metric.series.flatMap(series=>series.points.map(point=>point.value)),...(metric.target===undefined?[]:[metric.target]),...(metric.baseline===undefined?[]:[metric.baseline]),...(metric.comparison===undefined?[]:[metric.comparison.value])];
 const low=Math.min(0,...values),high=Math.max(0,...values);return low===0&&high===0?'0 auto':num(low)+' '+num(high);
}
function timeAxis():string{return'|axis#'+timeAxisId+'| "Date" { side: bottom; scale: time; }';}
function seriesData(points:Metric['series'][number]['points'],timed:boolean):string {
 return points.map((point,index)=>(index?', ':'')+(timed?quote(point.at!)+' ':'')+num(point.value)).join('');
}
function pointLocator(series:string,index:number):NativeLocator{return{id:series+'.data['+index+']',slot:'series#'+series+'/data['+index+']'};}
function marker(id:string,label:string,value:number):string{return'|mark#'+id+'| '+quote(label)+' { at: '+num(value)+'; axis: '+axisId+'; }';}
function goodBlock(formId:string,good:Metric['good']):string|undefined {
 return good===undefined?undefined:'|block#'+formId+'-good| '+quote('Better: '+good);
}
function exactStatBlock(formId:string,value:number):string{return'|block#'+formId+'-value| '+quote(num(value))+' { font-size: 48; }';}
function categoryTable(categories:NonNullable<Extract<Metric['axis'],{kind:'category'}>>['categories']):string[] {
 const lines=['|table#metric-categories| "Category identities" { columns: 180, 260; } [','  |cell#category-header-id| "ID"; |cell#category-header-label| "Label";'];
 for(const category of categories){const id=nativeCategoryId(category.id);lines.push('  |cell#'+id+'-id| '+quote(category.id)+'; |cell#'+id+'-label| '+quote(category.label)+';');}
 lines.push(']');return lines;
}
function groupOpen(formId:string,title:string,columns:string):string[]{return['|group#'+formId+'| '+quote(title)+' { layout: grid; columns: '+columns+'; gap: 16; } ['];}
function finishGroup(lines:string[],good?:string):string[]{if(good)lines.push('  '+good);lines.push(']');return lines;}

/** Serialize a bounded chart profile. Every data value stays in a native chart primitive. */
export function serializeLiniMetric(visual:Visual):LiniMetricSerializeResult {
 const checked=preflight(visual),diagnostics=[...checked.diagnostics],identityMap:LiniMetricIdentityMapping[]=[],coverage:ProjectionCoverage[]=[];
 if(!checked.ready)return{statements:[],identityMap,coverage,diagnostics};
 const {visual:source,form,metric}=checked.ready,id=nativeChartId(form),groupId=nativeGroupId(form),chartLocator={id:groupId,slot:'group#'+groupId},rows:string[]=[];
 const seriesNative=metric.series.map(series=>nativeSeriesId(series.id));
 const addSeriesCoverage=(seriesIndex:number,native:string,primitive:'line'|'bars')=>{
  const series=metric.series[seriesIndex]!,loc={id:native,slot:primitive+'#'+native},seriesPath=path('/series/'+seriesIndex);
  identityMap.push({kind:'series',nativeId:native,visualId:series.id,path:seriesPath+'/id',sourcePath:loc.slot});
  coverage.push(...covers(seriesPath+'/id',['identity'],loc),...covers(seriesPath+'/label',['value'],loc),...covers(seriesPath+'/points',['presence','order'],loc));
  series.points.forEach((point,pointIndex)=>{
   const at=path('/series/'+seriesIndex+'/points/'+pointIndex),pointLoc=pointLocator(native,pointIndex);
   identityMap.push({kind:'point',nativeId:pointLoc.id,visualId:at,path:at,sourcePath:pointLoc.slot});
   if(point.at!==undefined)coverage.push(...covers(at+'/at',['value'],primitive==='line'?pointLoc:{id:id+'.categories['+pointIndex+']',slot:'chart#'+id+'/categories['+pointIndex+']'}));
   coverage.push(...covers(at+'/value',['value'],pointLoc));
  });
 };
 const addReferenceMarks=()=>{
  if(metric.target!==undefined){rows.push('  '+marker(id+'-target','Target '+num(metric.target),metric.target));coverage.push(...covers(path('/target'),['value'],{id:id+'-target',slot:'mark#'+id+'-target'}));}
  if(metric.baseline!==undefined){rows.push('  '+marker(id+'-baseline','Baseline '+num(metric.baseline),metric.baseline));coverage.push(...covers(path('/baseline'),['value'],{id:id+'-baseline',slot:'mark#'+id+'-baseline'}));}
  if(metric.comparison){const label=metric.comparison.label+' = '+num(metric.comparison.value);rows.push('  '+marker(id+'-comparison',label,metric.comparison.value));const loc={id:id+'-comparison',slot:'mark#'+id+'-comparison'};coverage.push(...covers(path('/comparison/label'),['value'],loc),...covers(path('/comparison/value'),['value'],loc));}
 };
 const addGood=()=>{const statement=goodBlock(id,metric.good);if(statement){rows.push('  '+statement);coverage.push(...covers(path('/good'),['value'],{id:id+'-good',slot:'block#'+id+'-good'}));}};
 if(form==='bar'){
  const categories=metric.axis?.kind==='category'?metric.axis.categories:[];
  rows.push(...groupOpen(groupId,source.title??source.question,'700, 460'));
  rows.push('  |chart#'+id+'| '+quote(source.title??source.question)+' { layout: chart; direction: row; width: 700; height: 420; categories: '+categories.map(category=>quote(category.label)).join(', ')+'; } [');
  rows.push('    '+valueAxis(metric.unit,metric.format,referenceRange(metric),'left'));
  const series=metric.series[0]!,native=seriesNative[0]!;
  rows.push('    |bars#'+native+'| '+quote(series.label)+' { data: '+series.points.map((point,index)=>(index?', ':'')+num(point.value)).join('')+'; labels: '+series.points.map((point,index)=>(index?', ':'')+quote(num(point.value))).join('')+'; }');
  addReferenceMarks();rows.push('  ]');rows.push(...categoryTable(categories).map(line=>'  '+line));addGood();rows.push(']');
  for(const [index,category]of categories.entries()){
   const native=nativeCategoryId(category.id),loc={id:native+'-id',slot:'cell#'+native+'-id'},at=path('/axis/categories/'+index);
   identityMap.push({kind:'category',nativeId:native+'-id',visualId:category.id,path:at+'/id',sourcePath:'table#metric-categories/'+loc.slot});
   coverage.push(...covers(at+'/id',['identity'],loc),...covers(at+'/label',['value'],{id:native+'-label',slot:'cell#'+native+'-label'}));
  }
  coverage.push(...covers(path('/axis/kind'),['value'],{id:id,slot:'chart#'+id+'/categories'}),...covers(path('/axis/categories'),['presence','order'],{id:'metric-categories',slot:'table#metric-categories/rows'}));
  addSeriesCoverage(0,native,'bars');
 }else if(form==='line'||form==='stat'){
  const timeChildren=[timeAxis(),valueAxis(metric.unit,metric.format,referenceRange(metric),'left')];
  for(const [index,series]of metric.series.entries()){
   const native=seriesNative[index]!;timeChildren.push('|line#'+native+'| '+quote(series.label)+' { data: '+seriesData(series.points,true)+'; marker: circle; }');
  }
  rows.push(...groupOpen(groupId,source.title??source.question,form==='stat'?'300, 300':'700, 260'));
  if(form==='stat'){
   const current=metric.series[0]!.points.at(-1)!.value;
   rows.push('  '+exactStatBlock(id,current));rows.push('  |chart#'+id+'-sparkline| '+quote(metric.series[0]!.label+' trend')+' { layout: chart; width: 300; height: 180; } [');
   rows.push(...timeChildren.map(line=>'    '+line));addReferenceMarks();rows.push('  ]');
   if(metric.series[0]!.points.at(-1)!.value!==current)diagnostics.push(diag('LINI_METRIC_STAT_VALUE',path('/series/0/points'),'Stat number must equal its last sparkline point.','error',false));
  }else{
   rows.push('  |chart#'+id+'| '+quote(source.title??source.question)+' { layout: chart; width: 700; height: 420; } [');
   rows.push(...timeChildren.map(line=>'    '+line));addReferenceMarks();rows.push('  ]');
  }
  addGood();rows.push(']');
  for(const [index,series]of metric.series.entries())addSeriesCoverage(index,seriesNative[index]!,'line');
  coverage.push(...covers(path('/axis/kind'),['value'],{id:timeAxisId,slot:'axis#'+timeAxisId+'/scale'}));
 }else{
  const series=metric.series[0]!,native=seriesNative[0]!;
  rows.push(...groupOpen(groupId,source.title??source.question,'700, 260'));
  rows.push('  |chart#'+id+'| '+quote(source.title??source.question)+' { layout: chart; direction: row; width: 700; height: 240; } [');
  rows.push('    '+valueAxis(metric.unit,metric.format,referenceRange(metric)));
  rows.push('    |bars#'+native+'| '+quote(series.label)+' { data: '+num(series.points[0]!.value)+'; }');addReferenceMarks();rows.push('  ]');addGood();rows.push(']');
  addSeriesCoverage(0,native,'bars');
 }
 coverage.push(...covers(path('/unit'),['value'],{id:axisId,slot:'axis#'+axisId+'/unit'}));
 if(metric.format)coverage.push(...covers(path('/format/kind'),['value'],{id:axisId,slot:'axis#'+axisId+'/format'}),...covers(path('/format/decimals'),['value'],{id:axisId,slot:'axis#'+axisId+'/format'}));
 coverage.push(...covers(path('/series'),['presence','order'],chartLocator));
 return{statements:rows,identityMap,coverage,diagnostics};
}

function prop(node:LiniProfileNode,name:string):LiniProfileToken[]|undefined{return node.properties.find(item=>item.name===name)?.value;}
function stringToken(tokens:LiniProfileToken[]|undefined):string|undefined{return tokens?.length===1&&tokens[0]!.kind==='string'?tokens[0]!.value:undefined;}
function numberToken(tokens:LiniProfileToken[]|undefined):number|undefined{if(tokens?.length!==1||tokens[0]!.kind!=='number')return;const value=Number(tokens[0]!.value);return finite(value)?value:undefined;}
function rangeText(tokens:LiniProfileToken[]|undefined):string|undefined {
 if(!tokens||tokens.length!==2||tokens[0]!.kind!=='number'||!finite(Number(tokens[0]!.value)))return;
 const lo=num(Number(tokens[0]!.value)),high=tokens[1]!;if(high.kind==='word'&&high.value==='auto')return lo+' auto';if(high.kind==='number'&&finite(Number(high.value)))return lo+' '+num(Number(high.value));
}
function isWord(tokens:LiniProfileToken[]|undefined,value:string):boolean{return tokens?.length===1&&tokens[0]!.kind==='word'&&tokens[0]!.value===value;}
function strings(tokens:LiniProfileToken[]|undefined):string[]|undefined{return list(tokens,'string');}
function list(tokens:LiniProfileToken[]|undefined,kind:'string'|'number'):string[]|undefined {
 if(!tokens?.length)return;const values:string[]=[];let valueExpected=true;
 for(const token of tokens){if(valueExpected){if(token.kind!==kind)return;values.push(token.value);valueExpected=false;}else{if(token.kind!=='symbol'||token.value!==',')return;valueExpected=true;}}
 return valueExpected?undefined:values;
}
function dataPairs(tokens:LiniProfileToken[]|undefined,time:boolean):{at?:string;value:number}[]|undefined {
 if(!tokens?.length)return;const points:{at?:string;value:number}[]=[];let i=0;
 while(i<tokens.length){let at:string|undefined;if(time){if(tokens[i]?.kind!=='string')return;at=tokens[i++]!.value;}
  const value=tokens[i++];if(value?.kind!=='number')return;const numeric=Number(value.value);if(!finite(numeric))return;points.push({...at===undefined?{}:{at},value:numeric});
  if(i<tokens.length){if(tokens[i]?.kind!=='symbol'||tokens[i]!.value!==',')return;i++;}
 }
 return points;
}
function onlyProperties(node:LiniProfileNode,names:readonly string[],diagnostics:InterchangeDiagnostic[]):void {for(const item of node.properties)if(!names.includes(item.name))diagnostics.push(diag('LINI_METRIC_PROPERTY','/source','Unsupported native metric property '+JSON.stringify(item.name)+'.','error',false));}
function axisFormat(node:LiniProfileNode,diagnostics:InterchangeDiagnostic[]):Metric['format']|undefined {
 const tokens=prop(node,'format');if(!tokens)return;
 if(tokens.length===2&&tokens[0]!.kind==='word'&&tokens[0]!.value==='decimal'&&tokens[1]!.kind==='number'&&Number(tokens[1]!.value)===0)return{kind:'number',decimals:0};
 diagnostics.push(diag('LINI_METRIC_FORMAT','/source','Only native decimal-zero format is supported.','error',false));return;
}
function seriesFromNode(node:LiniProfileNode,index:number,time:boolean,diagnostics:InterchangeDiagnostic[]):Metric['series'][number]|undefined {
 if(node.label===undefined){diagnostics.push(diag('LINI_METRIC_SERIES','/source','Native series has no visible label.','error',false));return;}
 const decodedId=decodeVisualId(node.id,'ser_');if(!decodedId){diagnostics.push(diag('LINI_METRIC_SERIES_ID','/source','Native series identity is not a reversible metric profile identity.','error',false));return;}
 onlyProperties(node,node.type==='line'?['data','marker']:['data','labels'],diagnostics);
 const points=dataPairs(prop(node,'data'),time);if(!points){diagnostics.push(diag('LINI_METRIC_DATA','/source','Native series data is not a supported ordered value list.','error',false));return;}
 if(node.type==='bars'){
  const labels=strings(prop(node,'labels'));if(prop(node,'labels')&&!labels){diagnostics.push(diag('LINI_METRIC_LABELS','/source','Bar value labels must be a list of quoted strings.','error',false));return;}
  if(labels&&(labels.length!==points.length||labels.some((label,i)=>label!==num(points[i]!.value)))){diagnostics.push(diag('LINI_METRIC_LABELS','/source','Visible bar value labels must exactly match the native data values.','error',false));return;}
 }
 return{id:decodedId,label:node.label,points};
}
function one(nodes:LiniProfileNode[],type:string):LiniProfileNode|undefined{const found=nodes.filter(node=>node.type===type);return found.length===1?found[0]:undefined;}
function visibleNumber(label:string|undefined,prefix:string):number|undefined {
 if(!label?.startsWith(prefix))return;const text=label.slice(prefix.length);if(!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(text))return;const value=Number(text);return finite(value)?value:undefined;
}
function parseCategoryTable(table:LiniProfileNode,chartCategories:string[],diagnostics:InterchangeDiagnostic[]):NonNullable<Extract<Metric['axis'],{kind:'category'}>>['categories'] {
 if(table.id!=='metric-categories'||table.label!=='Category identities')diagnostics.push(diag('LINI_METRIC_CATEGORIES','/source','Category table heading and identity must match the declared metric profile.','error',false));
 onlyProperties(table,['columns'],diagnostics);
 const cells=table.children;if(cells[0]?.type!=='cell'||cells[0]?.id!=='category-header-id'||cells[0]?.label!=='ID'||cells[1]?.type!=='cell'||cells[1]?.id!=='category-header-label'||cells[1]?.label!=='Label'){
  diagnostics.push(diag('LINI_METRIC_CATEGORIES','/source','Category identity table needs its explicit ID and Label headers.','error',false));return[];
 }
 for(const cell of cells){onlyProperties(cell,[],diagnostics);if(cell.type!=='cell'||cell.children.length)diagnostics.push(diag('LINI_METRIC_CATEGORIES','/source','Category identity table may contain only leaf cells.','error',false));}
  const rows=cells.slice(2);if(rows.length!==chartCategories.length*2){diagnostics.push(diag('LINI_METRIC_CATEGORIES','/source','Category identity table row count differs from native chart categories.','error',false));return[];}
 const categories:NonNullable<Extract<Metric['axis'],{kind:'category'}>>['categories']=[],seen=new Set<string>();
 for(let i=0;i<chartCategories.length;i++){
  const idCell=rows[i*2]!,labelCell=rows[i*2+1]!,id=decodeVisualId(idCell.id.replace(/-id$/,''),'cat_'),label=labelCell.label;
  if(idCell.type!=='cell'||labelCell.type!=='cell'||!id||idCell.id!==nativeCategoryId(id)+'-id'||labelCell.id!==nativeCategoryId(id)+'-label'||idCell.label!==id||label===undefined||seen.has(id)||label!==chartCategories[i]){
   diagnostics.push(diag('LINI_METRIC_CATEGORIES','/source','Category ID cells, labels and chart order must agree exactly.','error',false));return[];
  }
  seen.add(id);categories.push({id,label});
 }
 return categories;
}
function goodFromGroup(group:LiniProfileNode|undefined):Metric['good']|undefined {
 const node=group?.children.find(child=>child.type==='block'&&child.id.endsWith('-good'));
 return node?.label==='Better: up'?'up':node?.label==='Better: down'?'down':undefined;
}

/** Read only the native chart/profile constructs emitted by serializeLiniMetric. */
export function parseLiniMetric(nodes:LiniProfileNode[],form:LiniMetricForm):LiniMetricParseResult {
 const diagnostics:InterchangeDiagnostic[]=[],identityMap:LiniMetricIdentityMapping[]=[],coverage:ProjectionCoverage[]=[];
 const fail=(code:string,message:string)=>diagnostics.push(diag(code,'/source',message,'error',false));
 const group=nodes.length===1&&nodes[0]!.type==='group'&&nodes[0]!.id===nativeGroupId(form)?nodes[0]:undefined;
 if(!group){fail('LINI_METRIC_SHAPE','A metric profile is one group containing a chart and its visible metadata.');return{identityMap,coverage,diagnostics};}
 onlyProperties(group,['layout','columns','gap'],diagnostics);
 if(!isWord(prop(group,'layout'),'grid'))fail('LINI_METRIC_SHAPE','Metric owner must use the declared grid grouping.');
 const chart=one(group.children,'chart');if(!chart){fail('LINI_METRIC_SHAPE','Metric group must contain exactly one chart.');return{identityMap,coverage,diagnostics};}
 for(const child of group.children)if(child.type==='table')onlyProperties(child,['columns'],diagnostics);
 const allowedGroupKinds=form==='bar'?['chart','table','block']:form==='stat'?['chart','block']:['chart','block'];
 if(group.children.some(child=>!allowedGroupKinds.includes(child.type)))fail('LINI_METRIC_SHAPE','Metric group contains a native construct outside this form profile.');
 const goodBlocks=group.children.filter(child=>child.type==='block'&&child.id===nativeChartId(form)+'-good');
 if(group.children.some(child=>child.type==='block'&&child.id!==nativeChartId(form)+'-good'&&!(form==='stat'&&child.id===nativeChartId(form)+'-value')))fail('LINI_METRIC_SHAPE','Unexpected visible metric metadata block.');
 if(goodBlocks.length>1||goodBlocks.some(block=>block.label!=='Better: up'&&block.label!=='Better: down'))fail('LINI_METRIC_GOOD','Direction metadata must be exactly `Better: up` or `Better: down`.');
 for(const block of [...goodBlocks,...group.children.filter(child=>child.type==='block'&&child.id===nativeChartId(form)+'-value')]){const isValue=block.id===nativeChartId(form)+'-value';onlyProperties(block,isValue?['font-size']:[],diagnostics);if(block.children.length)fail('LINI_METRIC_SHAPE','Metric metadata blocks cannot contain child constructs.');if(isValue&&numberToken(prop(block,'font-size'))!==48)fail('LINI_METRIC_STAT_STYLE','The stat value block must use the qualified 48 point emphasis size.');}
 if(form==='bar'&&group.children.filter(child=>child.type==='table').length!==1)fail('LINI_METRIC_CATEGORIES','Bar form needs exactly one category identity table.');
 if(form!=='bar'&&group.children.some(child=>child.type==='table'))fail('LINI_METRIC_SHAPE','Only bar form has a category identity table.');
 if(chart.id!==nativeChartId(form)&&(form!=='stat'||chart.id!==nativeChartId(form)+'-sparkline')){fail('LINI_METRIC_SHAPE','Native chart identity does not match the declared metric form.');return{identityMap,coverage,diagnostics};}
 if(chart.children.some(child=>child.children.length))fail('LINI_METRIC_CHILD','Native axes, series, and reference marks cannot contain nested children in this profile.');
 if(form!=='stat'&&chart.label!==group.label)fail('LINI_METRIC_TITLE','Chart title must agree with its visible metric owner heading.');
 onlyProperties(chart,form==='bar'?['layout','direction','width','height','categories']:['layout','width','height',...(form==='meter'?['direction']:[])] ,diagnostics);
 if(!isWord(prop(chart,'layout'),'chart'))fail('LINI_METRIC_SHAPE','Metric child must declare native chart layout.');
 if((form==='bar'||form==='meter')&&!isWord(prop(chart,'direction'),'row'))fail('LINI_METRIC_SHAPE','Horizontal bar and meter charts must declare row direction.');
 const axisNodes=chart.children.filter(node=>node.type==='axis'),valueAxisNode=axisNodes.find(node=>node.id===axisId)||axisNodes.find(node=>prop(node,'unit')!==undefined);
 if(!valueAxisNode){fail('LINI_METRIC_AXIS','Chart has no value axis with a unit.');return{identityMap,coverage,diagnostics};}
 onlyProperties(valueAxisNode,['unit','format','range','side'],diagnostics);
 if(valueAxisNode.id!==axisId)fail('LINI_METRIC_AXIS','Value axis identity must match the declared metric profile.');
 const unit=stringToken(prop(valueAxisNode,'unit'));if(unit===undefined)fail('LINI_METRIC_UNIT','Value axis unit must be one quoted string.');
 if(unit!==undefined&&valueAxisNode.label!==unit)fail('LINI_METRIC_UNIT','Value axis heading must agree with its unit property.');
 const format=axisFormat(valueAxisNode,diagnostics);
 const emittedRange=rangeText(prop(valueAxisNode,'range'));
 if(!emittedRange)fail('LINI_METRIC_RANGE','Value axis range must be an explicit finite range or `auto`.');
 const chartMarks=chart.children.filter(node=>node.type==='mark');
 const ref=(suffix:string)=>chartMarks.find(node=>node.id===nativeChartId(form)+'-'+suffix);
 const targetNode=ref('target'),baselineNode=ref('baseline'),comparisonNode=ref('comparison');
 const target=targetNode?numberToken(prop(targetNode,'at')):undefined,baseline=baselineNode?numberToken(prop(baselineNode,'at')):undefined;
 let comparison:Metric['comparison'];
 if(targetNode&&target===undefined)fail('LINI_METRIC_TARGET','Target mark needs one finite numeric value.');
 if(targetNode&&target!==undefined&&targetNode.label!=='Target '+num(target))fail('LINI_METRIC_TARGET','Target text must agree exactly with its numeric mark.');
 if(baselineNode&&baseline===undefined)fail('LINI_METRIC_BASELINE','Baseline mark needs one finite numeric value.');
 if(baselineNode&&baseline!==undefined&&baselineNode.label!=='Baseline '+num(baseline))fail('LINI_METRIC_BASELINE','Baseline text must agree exactly with its numeric mark.');
 if(comparisonNode){const label=comparisonNode.label,last=label?.lastIndexOf(' = ');const value=last===undefined||last<0?undefined:visibleNumber(label!.slice(last+3),'');if(value===undefined)fail('LINI_METRIC_COMPARISON','Comparison mark label must end in its exact numeric value.');else comparison={label:label!.slice(0,last),value};if(value!==undefined&&numberToken(prop(comparisonNode,'at'))!==value)fail('LINI_METRIC_COMPARISON','Comparison mark text and value must agree exactly.');}
 const knownMarkIds=new Set([nativeChartId(form)+'-target',nativeChartId(form)+'-baseline',nativeChartId(form)+'-comparison']);
 const markIds=new Set<string>();for(const node of chartMarks){if(!knownMarkIds.has(node.id)||markIds.has(node.id))fail('LINI_METRIC_MARK','Unknown or duplicate reference mark identity.');markIds.add(node.id);onlyProperties(node,['at','axis'],diagnostics);if(!isWord(prop(node,'axis'),axisId))fail('LINI_METRIC_MARK','Reference marks must point at the value axis.');}
 const nativeBars=chart.children.filter(node=>node.type==='bars'),nativeLines=chart.children.filter(node=>node.type==='line');
 if(chart.children.some(node=>!['axis','bars','line','mark'].includes(node.type)))fail('LINI_METRIC_CHILD','Chart contains an unsupported native child.');
 let metric:Metric;
 if(form==='line'||form==='stat'){
  if(axisNodes.filter(node=>node.id===timeAxisId).length!==1)fail('LINI_METRIC_AXIS','Time chart needs one explicit time axis.');
  if(axisNodes.some(node=>node.id!==timeAxisId&&node.id!==axisId))fail('LINI_METRIC_AXIS','Time chart contains an unknown axis identity.');
  const timeNode=axisNodes.find(node=>node.id===timeAxisId);if(timeNode){onlyProperties(timeNode,['side','scale'],diagnostics);if(timeNode.label!=='Date'||!isWord(prop(timeNode,'scale'),'time')||!isWord(prop(timeNode,'side'),'bottom'))fail('LINI_METRIC_AXIS','Time axis must be labeled Date with native time scale and bottom side.');}
  if(nativeLines.length===0||nativeBars.length)fail('LINI_METRIC_SERIES','Time chart needs only line series.');
  const series=nativeLines.map((node,index)=>seriesFromNode(node,index,true,diagnostics)).filter((item):item is Metric['series'][number]=>item!==undefined);
  if(new Set(nativeLines.map(node=>node.id)).size!==nativeLines.length||new Set(series.map(row=>row.id)).size!==series.length)fail('LINI_METRIC_SERIES_ID','Native and visual series identities must be unique.');
  if(series.some(row=>row.points.some(point=>point.at===undefined||!validLiniDate(point.at))))fail('LINI_METRIC_TIME','Time data must use full valid ISO calendar dates.');
  if(nativeLines.some(node=>!isWord(prop(node,'marker'),'circle')))fail('LINI_METRIC_MARKER','This profile requires its proven circle marker setting.');
  if(form==='stat'&&chart.label!==series[0]?.label+' trend')fail('LINI_METRIC_TITLE','Stat sparkline heading must agree with its visible series label.');
  if(form==='stat'&&series.length!==1)fail('LINI_METRIC_SERIES','Stat profile needs exactly one sparkline.');
  if(axisNodes.length!==2)fail('LINI_METRIC_AXIS','Time chart must have exactly one time axis and one value axis.');
  if(!isWord(prop(valueAxisNode,'side'),'left'))fail('LINI_METRIC_AXIS','Time chart value axis must use the left side.');
  if(form==='stat'){
   const valueBlock=group.children.find(node=>node.type==='block'&&node.id===nativeChartId(form)+'-value');
   const statValue=valueBlock?.label===undefined?undefined:visibleNumber(valueBlock.label,''),last=series[0]?.points.at(-1)?.value;
   if(statValue===undefined||!finite(statValue)||valueBlock?.label!==num(statValue)||last===undefined||!Object.is(statValue,last))fail('LINI_METRIC_STAT_VALUE','Big stat value must use the canonical visible number token and exactly equal the final sparkline point.');
  }
  metric={unit:unit??'',...(format?{format}:{}),...(form==='line'||form==='stat'?{axis:{kind:'time' as const}}:{}),series,...(target===undefined?{}:{target}),...(baseline===undefined?{}:{baseline}),...(comparison?{comparison}:{}),...(goodFromGroup(group)?{good:goodFromGroup(group)}:{})};
  if(emittedRange!==referenceRange(metric))fail('LINI_METRIC_RANGE','Value axis range differs from the generated metric data/reference range.');
  nativeLines.forEach((node,index)=>{
   const row=series[index];if(!row)return;const loc={id:node.id,slot:'line#'+node.id};identityMap.push({kind:'series',nativeId:node.id,visualId:row.id,path:path('/series/'+index+'/id'),sourcePath:loc.slot});coverage.push(...covers(path('/series/'+index+'/id'),['identity'],loc),...covers(path('/series/'+index+'/label'),['value'],loc),...covers(path('/series/'+index+'/points'),['presence','order'],loc));
   row.points.forEach((point,pointIndex)=>{const pointPath=path('/series/'+index+'/points/'+pointIndex),pointLoc=pointLocator(node.id,pointIndex);identityMap.push({kind:'point',nativeId:pointLoc.id,visualId:pointPath,path:pointPath,sourcePath:pointLoc.slot});coverage.push(...covers(pointPath+'/at',['value'],pointLoc),...covers(pointPath+'/value',['value'],pointLoc));});
  });
 }else if(form==='bar'){
  onlyProperties(chart,['layout','direction','width','height','categories'],diagnostics);
  const chartCategories=strings(prop(chart,'categories'));if(!chartCategories)fail('LINI_METRIC_CATEGORIES','Bar chart requires ordered quoted categories.');
  if(nativeBars.length!==1||nativeLines.length)fail('LINI_METRIC_SERIES','Bar profile needs one bars series and no line series.');
  if(axisNodes.length!==1||!isWord(prop(valueAxisNode,'side'),'left'))fail('LINI_METRIC_AXIS','Bar profile needs exactly one left-side value axis.');
  const table=one(group.children,'table');if(!table)fail('LINI_METRIC_CATEGORIES','Bar profile needs the visible category ID binding table.');
  const categories=table?parseCategoryTable(table,chartCategories??[],diagnostics):[];
  const row=nativeBars[0],series=row?seriesFromNode(row,0,false,diagnostics):undefined;
  if(nativeBars.length===1&&(!row?.id||new Set(nativeBars.map(node=>node.id)).size!==nativeBars.length))fail('LINI_METRIC_SERIES_ID','Native series identities must be unique.');
  if(row&&!prop(row,'labels'))fail('LINI_METRIC_LABELS','Bar profile requires visible exact value labels.');
  if(series&&chartCategories&&series.points.length!==chartCategories.length)fail('LINI_METRIC_DATA','Bar values must match category count.');
  if(series)series.points=series.points.map((point,index)=>({...point,at:categories[index]?.id}));
  metric={unit:unit??'',...(format?{format}:{}),axis:{kind:'category',categories},series:series?[series]:[],...(target===undefined?{}:{target}),...(baseline===undefined?{}:{baseline}),...(comparison?{comparison}:{}),...(goodFromGroup(group)?{good:goodFromGroup(group)}:{})};
  if(emittedRange!==referenceRange(metric))fail('LINI_METRIC_RANGE','Bar value axis range differs from the generated metric data/reference range.');
  categories.forEach((category,index)=>{const native=nativeCategoryId(category.id),loc={id:native+'-id',slot:'cell#'+native+'-id'},at=path('/axis/categories/'+index);identityMap.push({kind:'category',nativeId:loc.id,visualId:category.id,path:at+'/id',sourcePath:'table#metric-categories/'+loc.slot});coverage.push(...covers(at+'/id',['identity'],loc),...covers(at+'/label',['value'],{id:native+'-label',slot:'cell#'+native+'-label'}));});
  if(row&&series){const loc={id:row.id,slot:'bars#'+row.id};identityMap.push({kind:'series',nativeId:row.id,visualId:series.id,path:path('/series/0/id'),sourcePath:loc.slot});coverage.push(...covers(path('/series/0/id'),['identity'],loc),...covers(path('/series/0/label'),['value'],loc),...covers(path('/series/0/points'),['presence','order'],loc));series.points.forEach((point,index)=>{const at=path('/series/0/points/'+index),pointLoc=pointLocator(row.id,index),category=categories[index];identityMap.push({kind:'point',nativeId:pointLoc.id,visualId:at,path:at,sourcePath:pointLoc.slot});if(category){const categoryNative=nativeCategoryId(category.id);coverage.push(...covers(at+'/at',['value'],{id:categoryNative+'-id',slot:'cell#'+categoryNative+'-id'}));}coverage.push(...covers(at+'/value',['value'],pointLoc));});}
 }else{
  onlyProperties(chart,['layout','direction','width','height'],diagnostics);
  if(nativeBars.length!==1||nativeLines.length)fail('LINI_METRIC_SERIES','Meter profile needs one scalar bars series.');
  if(!targetNode)fail('LINI_METRIC_TARGET','Meter profile requires a target mark.');
  const row=nativeBars[0],series=row?seriesFromNode(row,0,false,diagnostics):undefined;
  if(nativeBars.length===1&&(!row?.id||new Set(nativeBars.map(node=>node.id)).size!==nativeBars.length))fail('LINI_METRIC_SERIES_ID','Native series identities must be unique.');
  if(axisNodes.length!==1)fail('LINI_METRIC_AXIS','Meter needs exactly one value axis.');
  if(series&&(series.points.length!==1||series.points[0]?.at!==undefined))fail('LINI_METRIC_METER','Meter data must be one scalar.');
  if(target===undefined)fail('LINI_METRIC_TARGET','Meter target must have an exact finite numeric value.');
  metric={unit:unit??'',...(format?{format}:{}),...(target===undefined?{}:{target}),...(baseline===undefined?{}:{baseline}),...(comparison?{comparison}:{}),...(goodFromGroup(group)?{good:goodFromGroup(group)}:{}),series:series?[series]:[]};
  if(emittedRange!==referenceRange(metric))fail('LINI_METRIC_RANGE','Meter value axis range differs from its generated data/reference range.');
  if(row&&series){const loc={id:row.id,slot:'bars#'+row.id};identityMap.push({kind:'series',nativeId:row.id,visualId:series.id,path:path('/series/0/id'),sourcePath:loc.slot});coverage.push(...covers(path('/series/0/id'),['identity'],loc),...covers(path('/series/0/label'),['value'],loc),...covers(path('/series/0/points'),['presence','order'],loc));const pointLoc=pointLocator(row.id,0),pointPath=path('/series/0/points/0');identityMap.push({kind:'point',nativeId:pointLoc.id,visualId:pointPath,path:pointPath,sourcePath:pointLoc.slot});coverage.push(...covers(pointPath+'/value',['value'],pointLoc));}
 }
 const valueAxisLocator={id:valueAxisNode.id,slot:'axis#'+valueAxisNode.id};coverage.push(...covers(path('/unit'),['value'],{...valueAxisLocator,slot:valueAxisLocator.slot+'/unit'}));
 coverage.push(...covers(path('/series'),['presence','order'],{id:group.id,slot:'group#'+group.id+'/chart'}));
 if(format)coverage.push(...covers(path('/format/kind'),['value'],{...valueAxisLocator,slot:valueAxisLocator.slot+'/format'}),...covers(path('/format/decimals'),['value'],{...valueAxisLocator,slot:valueAxisLocator.slot+'/format'}));
 if(metric.good!==undefined)coverage.push(...covers(path('/good'),['value'],{id:nativeChartId(form)+'-good',slot:'block#'+nativeChartId(form)+'-good'}));
 if(metric.baseline!==undefined)coverage.push(...covers(path('/baseline'),['value'],{id:nativeChartId(form)+'-baseline',slot:'mark#'+nativeChartId(form)+'-baseline'}));
 if(metric.target!==undefined)coverage.push(...covers(path('/target'),['value'],{id:nativeChartId(form)+'-target',slot:'mark#'+nativeChartId(form)+'-target'}));
 if(metric.comparison)coverage.push(...covers(path('/comparison/label'),['value'],{id:nativeChartId(form)+'-comparison',slot:'mark#'+nativeChartId(form)+'-comparison'}),...covers(path('/comparison/value'),['value'],{id:nativeChartId(form)+'-comparison',slot:'mark#'+nativeChartId(form)+'-comparison'}));
 if(diagnostics.some(item=>item.severity==='error'))return{identityMap,coverage:[],diagnostics};
 return{metric,identityMap,coverage,diagnostics};
}
