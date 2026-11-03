// SPDX-License-Identifier: MIT OR Apache-2.0
/** Native chart ownership and value geometry checks for the bounded category bar profile. */
import {createHash} from 'node:crypto';
import type {Page} from 'playwright';
import type {Document} from '@umf/core';
import {getVisual,type Visual} from '../../src/extensions/visual';
import type {PresentationPlan} from '../../src/presentation';
import type {PresentationQualityCheck} from './quality';
import {calibrateNumericTicks,selectNumericTickRow} from './numeric-axis';

type Box={x:number;y:number;width:number;height:number};
type TextCarrier={text:string;className:string;box:Box;visible:boolean;fill:string;fontSize:number};
type BarCarrier={box:Box;visible:boolean;fill:string;stroke:string};
type IdCarrier={id:string;text:string;box:Box;visible:boolean};
type NativeDom={isLini:boolean;viewBox:{x:number;y:number;width:number;height:number};svg:Box;chart?:Box;text:TextCarrier[];bars:BarCarrier[];ids:IdCarrier[]};
const sha=(value:string)=>createHash('sha256').update(Buffer.from(value,'utf8')).digest('hex');
const norm=(value:string)=>value.replace(/\s+/gu,' ').trim();
const at=(part:string)=>'/extensions/umf.visual'+(part.startsWith('/')?part:'/'+part);
const result=(sourceSha256:string,check:string,ok:boolean,details:string):PresentationQualityCheck=>({check,sourceSha256,result:ok?'pass':'fail',details});
const close=(left:number,right:number,tolerance=3)=>Math.abs(left-right)<=tolerance;
const inside=(outer:Box,inner:Box,padding=2)=>inner.x>=outer.x-padding&&inner.y>=outer.y-padding&&inner.x+inner.width<=outer.x+outer.width+padding&&inner.y+inner.height<=outer.y+outer.height+padding;

function mapped(plan:PresentationPlan,sourcePath:string,kind:string,logicalId:string,nativeId:string):boolean{
 return plan.elementMap.filter(item=>item.sourcePath===at(sourcePath)&&item.kind===kind&&item.logicalId===logicalId&&item.nativeId===nativeId).length===1;
}
function hasNativeDeclaration(nativeAst:string,id:string,kind:string){return nativeAst.includes(`|${kind}#${id}|`);}

/** The standard presentation host has already inserted the exact SVG into #frame. */
export async function verifyLiniBarPresentationQuality(page:Page,input:{document:Document;plan:PresentationPlan;nativeAst:unknown}):Promise<PresentationQualityCheck[]>{
 const sourceSha256=sha(input.plan.source);let visual:Visual|undefined;
 try{visual=getVisual(input.document);}catch{/* return explicit failures below */}
 if(!visual||visual.kind!=='metric'||visual.form!=='bar'||!visual.metric){
  return [result(sourceSha256,'lini-native-ast',false,'The document is not a readable metric/bar category chart.'),result(sourceSha256,'lini-native-carriers',false,'The document is not a readable metric/bar category chart.'),result(sourceSha256,'lini-category-bar-values-and-category-ownership',false,'The document is not a readable metric/bar category chart.')];
 }
 const metric=visual.metric;
 if(!metric.axis||metric.axis.kind!=='category')return [result(sourceSha256,'lini-native-ast',false,'The metric/bar has no category axis.'),result(sourceSha256,'lini-native-carriers',false,'The metric/bar has no category axis.'),result(sourceSha256,'lini-category-bar-values-and-category-ownership',false,'The metric/bar has no category axis.')];
 const axis=metric.axis,series=metric.series[0],categories=axis.categories,sourcePoints=series?.points??[],categoryById=new Map(categories.map((category,index)=>[category.id,{category,index}]));
 const pointByCategory=new Map<string,{point:typeof sourcePoints[number];sourceIndex:number}>();
 for(const[sourceIndex,point]of sourcePoints.entries())if(typeof point.at==='string'&&!pointByCategory.has(point.at))pointByCategory.set(point.at,{point,sourceIndex});
 const ordered=categories.map(category=>({category,index:categoryById.get(category.id)!.index,relation:pointByCategory.get(category.id)}));
 const nativeAst=typeof input.nativeAst==='string'?input.nativeAst:'';
 const chartId='metric-bar-chart',seriesNative='metric-bar-series';
 const expectedValues=ordered.map(row=>row.relation?.point.value);
 const rawMinimum=Math.min(0,...expectedValues.filter((value):value is number=>value!==undefined)),rawMaximum=Math.max(0,...expectedValues.filter((value):value is number=>value!==undefined)),rawSpan=rawMaximum-rawMinimum,axisPadding=rawSpan===0?Math.max(Math.abs(rawMaximum)*.08,1):rawSpan*.08,axisLow=rawMinimum-axisPadding,axisHigh=rawMaximum+axisPadding,axisTicks=[axisLow,0,axisHigh];
 const displayNumber=(value:number,decimals:number|undefined)=>decimals===undefined?(Object.is(value,-0)?'-0':String(value)):Number(value.toFixed(decimals)).toFixed(decimals);
 const chartStart=nativeAst.indexOf(`|block#${chartId}|`),astBlock=nativeAst.slice(chartStart,chartStart<0?undefined:nativeAst.indexOf('\n  ]',chartStart));
 const categoryDisplay=(category:typeof categories[number])=>category.label;
 const astOk=!!astBlock&&chartStart>=0&&hasNativeDeclaration(nativeAst,seriesNative,'block')
  &&categories.every(category=>astBlock.includes(JSON.stringify(categoryDisplay(category))))
  &&series?.points.length===categories.length&&expectedValues.every(value=>value!==undefined)
  &&astBlock.includes('data: '+expectedValues.map(value=>Object.is(value,-0)?'-0':String(value)).join(', '))
  &&astBlock.includes(`ticks: ${Object.is(axisLow,-0)?'-0':String(axisLow)}, 0, ${Object.is(axisHigh,-0)?'-0':String(axisHigh)}`)
  &&astBlock.includes('labels: '+expectedValues.map(value=>JSON.stringify(displayNumber(value!,metric.format?.kind==='number'?metric.format.decimals:undefined))).join(', '));
 const astMaps=!!series&&hasNativeDeclaration(nativeAst,'metric-bar-axis','block')&&mapped(input.plan,'/metric/axis/kind','metric-reference','category',`chart#${chartId}/categories`)
  &&mapped(input.plan,'/metric/unit','metric-reference',metric.unit,'axis#metric-bar-axis/unit')
  &&categories.every((category,index)=>mapped(input.plan,`/metric/axis/categories/${index}/id`,'metric-reference',category.id,`chart#${chartId}/categories[${index}]`)
  &&mapped(input.plan,`/metric/axis/categories/${index}/label`,'metric-reference',category.id,`chart#${chartId}/categories[${index}]`)
  )
  &&!!series&&mapped(input.plan,'/metric/series/0/id','metric-series',series.id,`bars#${seriesNative}`)
  &&!!series&&mapped(input.plan,'/metric/series/0/label','metric-series',series.id,`bars#${seriesNative}`)
  &&!!series&&mapped(input.plan,'/metric/series/0/label','metric-series',series.id,'metric-bar-series-label')
  &&(metric.format===undefined?!input.plan.elementMap.some(item=>item.sourcePath===at('/metric/format/kind')):mapped(input.plan,'/metric/format/kind','metric-reference','number','axis#metric-bar-axis'))
  &&(metric.format?.decimals===undefined||mapped(input.plan,'/metric/format/decimals','metric-reference',String(metric.format.decimals),'axis#metric-bar-axis/format'))
  &&categories.every((category,index)=>{const relation=pointByCategory.get(category.id);if(!relation)return false;const pointPath=`/metric/series/0/points/${relation.sourceIndex}`;return mapped(input.plan,pointPath,'metric-value',pointPath,`bars#${seriesNative}/data[${index}]`)
   &&mapped(input.plan,pointPath+'/at','metric-value',pointPath,`chart#${chartId}/categories[${index}]`)
   &&mapped(input.plan,pointPath+'/value','metric-value',pointPath,`bars#${seriesNative}/data[${index}]`);});
 const sourceShaCheck=result(sourceSha256,'lini-native-ast',astOk&&astMaps,astOk&&astMaps?`Pinned Lini 1.1.0 AST binds the chart, category order, raw bar values and zero-decimal labels; all ${categories.length} category and point pointers use actual declaration/ordered-slot locators.`:'The native chart declarations, category/value order, or exact source-pointer slot maps are missing or altered.');

 let dom:NativeDom|undefined;
 try{dom=await page.locator('#frame svg').first().evaluate(root=>{
  const svg=root as SVGSVGElement,svgRect=svg.getBoundingClientRect(),view=svg.viewBox.baseVal;
  const box=(element:Element):Box=>{const rect=element.getBoundingClientRect();return{x:rect.x-svgRect.x,y:rect.y-svgRect.y,width:rect.width,height:rect.height};};
  const shown=(element:Element)=>{let current:Element|null=element;while(current&&current!==svg){const style=getComputedStyle(current);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;current=current.parentElement;}const rect=element.getBoundingClientRect();return rect.width>0&&rect.height>0;};
  const text=[...svg.querySelectorAll('text')].map(element=>({text:(element.textContent??'').replace(/\s+/gu,' ').trim(),className:element.getAttribute('class')??'',box:box(element),visible:shown(element),fill:getComputedStyle(element).fill,fontSize:Number.parseFloat(getComputedStyle(element).fontSize)||0}));
  const chart=svg.querySelector('[data-id="metric-bar-chart"]'),bars=[...svg.querySelectorAll('g[class*="lini-hit-"] rect')].map(element=>({box:box(element),visible:shown(element),fill:getComputedStyle(element).fill,stroke:getComputedStyle(element).stroke})),ids=[...svg.querySelectorAll('[data-id]')].map(element=>({id:element.getAttribute('data-id')??'',text:(element.textContent??'').replace(/\s+/gu,' ').trim(),box:box(element),visible:shown(element)}));
  return{isLini:svg.classList.contains('lini'),viewBox:{x:view.x,y:view.y,width:view.width,height:view.height},svg:{x:0,y:0,width:svgRect.width,height:svgRect.height},chart:chart?box(chart):undefined,text,bars,ids};
 });}catch{/* details below */}
 const problems:string[]=[];
 if(!dom?.isLini||!dom.chart||dom.viewBox.width<=0||dom.viewBox.height<=0)problems.push('native Lini chart carrier or viewBox is missing');
 const visibleTexts=dom?.text.filter(item=>item.visible)??[];
 const chartTexts=visibleTexts.filter(item=>item.className.includes('lini-chart-text')&&dom?.chart&&item.box.x>=dom.chart.x-2&&item.box.x+item.box.width<=dom.chart.x+dom.chart.width+2&&item.box.y>=dom.chart.y-2&&item.box.y+item.box.height<=dom.chart.y+dom.chart.height+2);
 const expectedCategoryLabels=categories.map(categoryDisplay);
 const candidateRows=chartTexts.filter(item=>expectedCategoryLabels.includes(item.text)&&dom?.chart&&item.box.y>dom.chart.y+20&&item.box.y+item.box.height<dom.chart.y+dom.chart.height).sort((a,b)=>a.box.y-b.box.y);
 const categoryTextOk=candidateRows.length>=categories.length&&candidateRows.slice(0,categories.length).every((item,index)=>item.text===norm(expectedCategoryLabels[index]!));
 const categoryRows=categories.map((_,index)=>candidateRows[index]?[candidateRows[index]!]:[]);
 const rowLabels=candidateRows.slice(0,categories.length);
 const uniqueCategoryPositions=rowLabels.map(item=>item.box.y+item.box.height/2);
 if(!categoryTextOk)problems.push('visible native category labels do not resolve one-per-category in authored top-to-bottom order');
 const categoryBottom=Math.max(...categoryRows.map(row=>row[0]?row[0].box.y+row[0].box.height:0));
 const decimals=metric.format?.kind==='number'?metric.format.decimals:undefined;
 const axisRegion:Box=dom?.chart?{x:dom.chart.x,y:categoryBottom+18,width:dom.chart.width,height:Math.max(0,dom.chart.y+dom.chart.height-categoryBottom-18)}:{x:0,y:0,width:0,height:0};
 const row=selectNumericTickRow(chartTexts.map(item=>({text:item.text,bounds:item.box,visible:item.visible,className:item.className})),axisRegion);
 const calibration=row.ok?calibrateNumericTicks(row.slots,axisTicks,axisTicks.map(value=>displayNumber(value,decimals)),3):{ok:false as const,reason:row.reason};
 if(!row.ok)problems.push(row.reason);else if(!calibration.ok)problems.push(calibration.reason);
 const numericAxisTicks=calibration.ok?calibration.ticks:[];
 const zeroTick=numericAxisTicks[1],nextTick=numericAxisTicks[2];
 const calibratedPxPerUnit=calibration.ok?calibration.pxPerUnit:NaN;
 const seriesLabelCarrier=dom?.ids.find(item=>item.id==='metric-bar-series-label');
 const axisTickBottom=row.ok?Math.max(...row.slots.map(item=>item.bounds.y+item.bounds.height)):Infinity;
 const axisTickLeft=row.ok?Math.min(...row.slots.map(item=>item.bounds.x+item.bounds.width/2)):-Infinity;
 const axisTickRight=row.ok?Math.max(...row.slots.map(item=>item.bounds.x+item.bounds.width/2)):-Infinity;
 const unitVisible=chartTexts.some(item=>item.text===norm(metric.unit)&&item.box.y>=axisTickBottom&&item.box.y+item.box.height<=((dom?.chart?.y??0)+(dom?.chart?.height??0))+2&&item.box.x+item.box.width/2>=axisTickLeft-3&&item.box.x+item.box.width/2<=axisTickRight+3);
 const seriesVisible=!!seriesLabelCarrier?.visible&&seriesLabelCarrier.text===norm(series?.label??'');
 const title=visual.title??visual.question,titlePath=visual.title!==undefined?'/title':'/question',titleCarrier=dom?.ids.find(item=>item.id==='metric-bar-title');
 const questionCarrier=dom?.ids.find(item=>item.id==='metric-bar-question');
 if(!unitVisible)problems.push('exact unit is not visible on the numeric axis');
 if(!seriesVisible||!seriesLabelCarrier)problems.push('exact series label is not visible in its mapped native text carrier');
 if(!titleCarrier)problems.push('presentation title is not visible in its mapped native text carrier');
 if(titleCarrier&&(!titleCarrier.visible||titleCarrier.text!==norm(title)))problems.push('presentation title is not visible in its exact native owner');
 if(titleCarrier&&!inside(dom!.svg,titleCarrier.box,2))problems.push('native title text is outside the SVG viewport');
 if(visual.title!==undefined&&visual.question!==visual.title&&(!questionCarrier?.visible||questionCarrier.text!==norm(visual.question)))problems.push('distinct authored question text is missing from its exact native owner');
 const valueLabels=visibleTexts.filter(item=>item.className.includes('lini-chart-label'));
 const bars=dom?.bars.filter(item=>item.visible)??[];
 let geometryOk=categoryTextOk&&calibration.ok&&numericAxisTicks.length===axisTicks.length&&!!zeroTick&&!!nextTick&&!!dom?.chart;
 if(geometryOk){
  const tickSpan=axisTicks[2]!-axisTicks[0]!,pxPerUnit=calibratedPxPerUnit;
  if(!(pxPerUnit>0&&Number.isFinite(pxPerUnit))){geometryOk=false;problems.push('visible numeric tick anchors do not define an increasing linear value scale');}
  for(let index=0;index<categories.length;index++){
   const row=categoryRows[index]?.[0],relation=pointByCategory.get(categories[index]!.id);if(!row||!relation){geometryOk=false;continue;}
   const y=rowLabels[index]!.box.y+rowLabels[index]!.box.height/2,value=relation.point.value,labelsAtRow=valueLabels.filter(item=>Math.abs(item.box.y+item.box.height/2-y)<22&&item.text===displayNumber(value,decimals));
   if(labelsAtRow.length!==1||!labelsAtRow[0]!.visible){geometryOk=false;problems.push(`category ${categories[index]!.id} has no unique visible exact value readout on its row; expected ${displayNumber(value,decimals)}, row texts ${valueLabels.filter(item=>Math.abs(item.box.y+item.box.height/2-y)<22).map(item=>JSON.stringify(item.text)).join(', ')}`);continue;}
   const rowBars=bars.filter(bar=>Math.abs(bar.box.y+bar.box.height/2-y)<22);
   if(value===0){if(rowBars.length!==0){geometryOk=false;problems.push(`zero category ${categories[index]!.id} has a painted bar instead of an empty zero extent`);}const label=labelsAtRow[0]!,zeroX=zeroTick!.x;if(Math.abs(label.box.x+label.box.width/2-zeroX)>8){geometryOk=false;problems.push(`zero value readout for ${categories[index]!.id} is not at the native zero origin`);}}
   else if(rowBars.length!==1){geometryOk=false;problems.push(`category ${categories[index]!.id} has ${rowBars.length} native bar extents; expected one`);}
   else {const bar=rowBars[0]!,zeroX=zeroTick!.x,expectedEnd=zeroX+value*pxPerUnit,actualEnd=value>0?bar.box.x+bar.box.width:bar.box.x,actualStart=value>0?bar.box.x:bar.box.x+bar.box.width;
    if(!close(actualStart,zeroX,4)||!close(actualEnd,expectedEnd,4)||bar.box.height<8){geometryOk=false;problems.push(`bar geometry for ${categories[index]!.id} does not preserve raw value ${value} at the visible zero/tick scale`);}
   }
  }
 }
 const mapOk=mapped(input.plan,'/metric/axis/kind','metric-reference','category',`chart#${chartId}/categories`)&&categories.every((category,index)=>mapped(input.plan,`/metric/axis/categories/${index}/id`,'metric-reference',category.id,`chart#${chartId}/categories[${index}]`)&&mapped(input.plan,`/metric/axis/categories/${index}/label`,'metric-reference',category.id,`chart#${chartId}/categories[${index}]`));
 const formatMapOk=metric.format===undefined?input.plan.elementMap.every(item=>item.sourcePath!==at('/metric/format/kind')&&item.sourcePath!==at('/metric/format/decimals')):input.plan.elementMap.filter(item=>item.sourcePath===at('/metric/format/kind')&&item.kind==='metric-reference'&&item.logicalId==='number'&&item.nativeId==='axis#metric-bar-axis').length===1&&(metric.format.decimals===undefined?input.plan.elementMap.every(item=>item.sourcePath!==at('/metric/format/decimals')):mapped(input.plan,'/metric/format/decimals','metric-reference',String(metric.format.decimals),'axis#metric-bar-axis/format'));
 const metadataOk=mapOk&&formatMapOk&&mapped(input.plan,titlePath,'visual',visual.id,'metric-bar-title')&&(visual.title===undefined||visual.title===visual.question||mapped(input.plan,'/question','visual',visual.id,'metric-bar-question'))&&(visual.takeaway===undefined||mapped(input.plan,'/takeaway','visual',visual.id,'metric-bar-takeaway'))&&(visual.omissions??[]).every((note,index)=>mapped(input.plan,`/omissions/${index}`,'annotation',visual.id,`metric-bar-note-${index+1}`))&&!!seriesLabelCarrier&&seriesLabelCarrier.visible&&seriesLabelCarrier.text===norm(series?.label??'');
 const carriersOk=!!dom?.chart&&titleCarrier?.visible===true&&unitVisible&&seriesVisible&&metadataOk&&categories.every((category,index)=>{
  const point=pointByCategory.get(category.id);if(!point)return false;const ptr=`/metric/series/0/points/${point.sourceIndex}`;return mapped(input.plan,ptr,'metric-value',ptr,`bars#${seriesNative}/data[${index}]`)
   &&mapped(input.plan,ptr+'/at','metric-value',ptr,`chart#${chartId}/categories[${index}]`)
   &&mapped(input.plan,ptr+'/value','metric-value',ptr,`bars#${seriesNative}/data[${index}]`);
 });
 if(visual.takeaway!==undefined){const owner=dom?.ids.find(item=>item.id==='metric-bar-takeaway');if(!owner?.visible||owner.text!==norm(visual.takeaway))problems.push('authored takeaway is not visible in its exact native owner');}
 for(const[index,note]of(visual.omissions??[]).entries()){const owner=dom?.ids.find(item=>item.id===`metric-bar-note-${index+1}`);if(!owner?.visible||owner.text!==norm(note))problems.push(`authored caveat ${index} is not visible in its exact native owner`);}
 for(const[field,reason]of [['source','Source provenance remains in UMF and is not chart geometry.'],['audience','Audience metadata remains in UMF and does not alter category values.'],['steps','Walkthrough steps are outside this static categorical chart.']] as const){const authored=field==='source'?visual.source!==undefined:field==='audience'?visual.audience!==undefined:visual.steps!==undefined;if(authored&&!input.plan.omissions.some(item=>item.sourcePath===at('/'+field)&&item.reason===reason))problems.push(`/${field} lacks its located retention record`);}
 const carrierCheck=result(sourceSha256,'lini-native-carriers',carriersOk&&problems.length===0,
carriersOk?`The native chart exposes one visible row per authored category, the exact series/unit labels, and source-indexed point/category slot maps; the zero row remains visible.`:problems.join('; ')||'One or more source-bound category, series, unit or value carriers are missing.');
 const geometryPass=geometryOk&&problems.length===0;
 const geometryCheck=result(sourceSha256,'lini-category-bar-values-and-category-ownership',geometryPass,geometryPass?`All ${categories.length} categories appear in authored order. Native bar extents were measured against visible zero and numeric tick anchors; each nonzero bar preserves its raw value ratio, and the zero category owns a visible exact zero label without a painted fill.`:problems.join('; ')||'Native category order or value geometry could not be proven.');
 return [sourceShaCheck,carrierCheck,geometryCheck];
}
