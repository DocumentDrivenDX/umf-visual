// SPDX-License-Identifier: MIT OR Apache-2.0
/** Native ownership and measured value/reference geometry for Lini meter views. */
import {createHash} from 'node:crypto';
import type {Page} from 'playwright';
import type {Document} from '@umf/core';
import {getVisual,type Visual} from '../../src/extensions/visual';
import type {PresentationPlan} from '../../src/presentation';
import type {PresentationQualityCheck} from './quality';

type Box={x:number;y:number;width:number;height:number};
type PlotText={text:string;bounds:Box;fill:string;fontSize:number;className:string;visible:boolean};
const sha=(value:string)=>createHash('sha256').update(Buffer.from(value,'utf8')).digest('hex');
const norm=(value:string)=>value.replace(/\s+/gu,' ').trim();
const check=(sourceSha256:string,ok:boolean,details:string):PresentationQualityCheck=>({check:'lini-meter-value-and-reference-geometry',sourceSha256,result:ok?'pass':'fail',details});
const ptr=(part:string)=>'/extensions/umf.visual'+(part.startsWith('/')?part:'/'+part);
const labelRuleGap=(bounds:Box,x:number)=>x<bounds.x?bounds.x-x:x>bounds.x+bounds.width?x-(bounds.x+bounds.width):0;

/** The enclosing verifier establishes the common viewport/font/clipping obligations first. */
export async function verifyLiniMeterPresentationQuality(page:Page,input:{document:Document;plan:PresentationPlan;nativeAst?:unknown}):Promise<PresentationQualityCheck[]> {
 const {document,plan}=input,sourceSha256=sha(plan.source),problems:string[]=[];
 let visual:Visual|undefined;try{visual=getVisual(document);}catch{/* reported as a failed profile check below */}
 if(!visual||visual.kind!=='metric'||visual.form!=='meter'||!visual.metric){return[check(sourceSha256,false,'A readable metric/meter source is required.')]}
 const metric=visual.metric,series=metric.series[0],point=series?.points[0];
 if(!series||!point||metric.series.length!==1||series.points.length!==1||metric.target===undefined)return[check(sourceSha256,false,'The bounded scalar meter subset is not present.')];
 const target=metric.target;
 const displayNumber=(value:number)=>metric.format?.kind==='number'&&metric.format.decimals===0?value.toFixed(0):String(value);
 const referenceEntries=[{value:target,label:'Target '+displayNumber(target),nativeId:'metric-meter-target'},...(metric.baseline===undefined?[]:[{value:metric.baseline,label:'Baseline '+displayNumber(metric.baseline),nativeId:'metric-meter-baseline'}]),...(metric.comparison===undefined?[]:[{value:metric.comparison.value,label:metric.comparison.label+' '+displayNumber(metric.comparison.value),nativeId:'metric-meter-comparison'}])];
 const referenceOwner=(value:number)=>referenceEntries.find(entry=>entry.value===value)!.nativeId;
 const expected:Array<{sourcePath:string;logicalId:string;nativeId:string;kind:string}>=[
  {sourcePath:ptr('/id'),logicalId:visual.id,nativeId:'metric-meter-chart',kind:'visual'},
  {sourcePath:ptr(visual.title!==undefined?'/title':'/question'),logicalId:visual.id,nativeId:'metric-meter-title',kind:'visual'},
  {sourcePath:ptr('/metric/series/0/id'),logicalId:series.id,nativeId:'metric-meter-series-1',kind:'metric-series'},
  {sourcePath:ptr('/metric/series/0/label'),logicalId:series.id,nativeId:'metric-meter-series-1',kind:'metric-series'},
  {sourcePath:ptr('/metric/series/0/points/0/value'),logicalId:'/metric/series/0/points/0/value',nativeId:'metric-meter-value',kind:'metric-value'},
  {sourcePath:ptr('/metric/series/0/points/0/value'),logicalId:'/metric/series/0/points/0/value',nativeId:'metric-meter-series-1',kind:'metric-value'},
  {sourcePath:ptr('/metric/target'),logicalId:String(target),nativeId:referenceOwner(target),kind:'metric-reference'},
  {sourcePath:ptr('/metric/unit'),logicalId:metric.unit,nativeId:'metric-meter-axis',kind:'metric-reference'},
 ];
 if(visual.title!==undefined&&visual.question!==visual.title)expected.push({sourcePath:ptr('/question'),logicalId:visual.id,nativeId:'metric-meter-question',kind:'visual'});
 if(metric.format)expected.push({sourcePath:ptr('/metric/format/kind'),logicalId:'number',nativeId:'metric-meter-axis',kind:'metric-reference'},{sourcePath:ptr('/metric/format/decimals'),logicalId:String(metric.format.decimals??0),nativeId:'metric-meter-axis',kind:'metric-reference'});
 if(metric.good!==undefined)expected.push({sourcePath:ptr('/metric/good'),logicalId:metric.good,nativeId:'metric-meter-good',kind:'metric-reference'});
 if(metric.baseline!==undefined)expected.push({sourcePath:ptr('/metric/baseline'),logicalId:String(metric.baseline),nativeId:referenceOwner(metric.baseline),kind:'metric-reference'});
 if(metric.comparison)expected.push({sourcePath:ptr('/metric/comparison/label'),logicalId:metric.comparison.label,nativeId:referenceOwner(metric.comparison.value),kind:'metric-reference'},{sourcePath:ptr('/metric/comparison/value'),logicalId:String(metric.comparison.value),nativeId:referenceOwner(metric.comparison.value),kind:'metric-reference'});
 if(visual.takeaway!==undefined)expected.push({sourcePath:ptr('/takeaway'),logicalId:visual.id,nativeId:'metric-meter-takeaway',kind:'visual'});
 for(const [index] of (visual.omissions??[]).entries())expected.push({sourcePath:ptr('/omissions/'+index),logicalId:visual.id,nativeId:'metric-meter-note-'+(index+1),kind:'annotation'});
 for(const sourcePath of new Set(expected.map(item=>item.sourcePath))){const wanted=expected.filter(item=>item.sourcePath===sourcePath),rows=plan.elementMap.filter(item=>item.sourcePath===sourcePath);if(rows.length!==wanted.length||wanted.some(item=>!rows.some(row=>row.logicalId===item.logicalId&&row.nativeId===item.nativeId&&row.kind===item.kind)))problems.push(`source map ${sourcePath} does not identify its exact native owner(s)`);}

 const ast=typeof input.nativeAst==='string'?input.nativeAst:'';
 for(const token of ['#metric-meter-panel|','#metric-meter-title|','#metric-meter-chart|','#metric-meter-series-1|','#metric-meter-target|','#metric-meter-axis|'])if(!ast.includes(token))problems.push(`native Lini source is missing ${token}`);
 if(!ast.includes(`data: ${String(point.value)};`))problems.push('native bars declaration does not retain the exact source value');
 if(metric.format?.kind==='number'&&metric.format.decimals===0&&!ast.includes('format: decimal 0;'))problems.push('native axis does not retain the authored number format');
 const axisTicks=plan.source.match(/ticks:\s*(-?(?:\d+(?:\.\d*)?|\.\d+)),\s*(-?(?:\d+(?:\.\d*)?|\.\d+)),\s*(-?(?:\d+(?:\.\d*)?|\.\d+))/u)?.slice(1).map(Number)??[];
 if(axisTicks.length!==3||axisTicks[0]!>=axisTicks[1]!||axisTicks[1]!>=axisTicks[2]||axisTicks[1]!==0)problems.push('native numeric axis does not declare exact renderer tick anchors at its padded endpoints and zero');
 if(series.emphasis!==undefined)problems.push('unsupported series emphasis entered the bounded native meter profile');
 if(metric.good!==undefined&&!ast.includes(`Better: ${metric.good}`))problems.push('native good-direction cue is absent from the desugared source');
 for(const owner of new Set(referenceEntries.map(entry=>referenceEntries.find(candidate=>candidate.value===entry.value)!.nativeId)))if(!ast.includes(`#${owner}|`))problems.push(`native reference declaration ${owner} is absent`);
 const range=plan.source.match(/#metric-meter-axis\|[^\n]*range:\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s+(-?(?:\d+(?:\.\d*)?|\.\d+))/u);
 const min=range?Number(range[1]):NaN,max=range?Number(range[2]):NaN;
 const values=[0,point.value,metric.target,...(metric.baseline===undefined?[]:[metric.baseline]),...(metric.comparison===undefined?[]:[metric.comparison.value])];
 if(!Number.isFinite(min)||!Number.isFinite(max)||!(min<max)||values.some(value=>value<min||value>max)||min>=Math.min(...values)||max<=Math.max(...values))problems.push('renderer-selected numeric display bounds do not enclose every source value/reference plus visible padding');
 if(plan.approximations.filter(item=>item.sourcePath===ptr('/metric')).length!==1||!plan.approximations.find(item=>item.sourcePath===ptr('/metric'))?.representation.includes('not a semantic maximum or percentage scale'))problems.push('renderer-only axis-bound policy is not disclosed exactly once');

 let dom:{svgBounds:Box;carriers:Array<{id:string;texts:string[];bounds:Box}>;chart?:{bounds:Box;barRects:Box[];barFill:string;barStroke:string;hitTitles:string[];texts:PlotText[];lines:Array<{x1:number;x2:number;y1:number;y2:number;stroke:string}>};} | undefined;
 try{dom=await page.locator('#frame svg').first().evaluate((root)=>{
  const svg=root as SVGSVGElement,origin=svg.getBoundingClientRect(),box=(element:Element):Box=>{const rect=element.getBoundingClientRect();return{x:rect.x-origin.x,y:rect.y-origin.y,width:rect.width,height:rect.height};};
  const normalize=(value:string)=>value.replace(/\s+/gu,' ').trim();
  const visible=(element:Element)=>{let opacity=1,current:Element|null=element;while(current&&current!==svg){const style=getComputedStyle(current);if(style.display==='none'||style.visibility==='hidden')return false;opacity*=Number.parseFloat(style.opacity||'1');current=current.parentElement;}const bounds=element.getBoundingClientRect();return opacity>.05&&bounds.width>0&&bounds.height>0;};
  const texts=(root:Element)=>[...root.querySelectorAll('text')].map(text=>({text:normalize(text.textContent??''),bounds:box(text),fill:(text as SVGTextElement).style.fill||getComputedStyle(text).fill,fontSize:Number.parseFloat(getComputedStyle(text).fontSize)||0,className:text.getAttribute('class')??'',visible:visible(text)})).filter(item=>item.text);
  const carriers=[...svg.querySelectorAll('g.lini-node[data-id]')].map(element=>({id:element.getAttribute('data-id')??'',texts:texts(element).filter(item=>item.visible&&item.bounds.x>=box(element).x-1&&item.bounds.x<=box(element).x+box(element).width+1).map(item=>item.text),bounds:box(element)}));
  const chart=svg.querySelector('g.lini-chart[data-id="metric-meter-chart"]') as SVGGElement|null;
  const bar=chart?.querySelector('g.lini-hit-0 rect') as SVGRectElement|null;
  const chartInfo=chart?{bounds:box(chart),barRects:[...chart.querySelectorAll('g.lini-hit-0 rect')].map(box),barFill:bar?getComputedStyle(bar).fill:'',barStroke:bar?getComputedStyle(bar).stroke:'',hitTitles:[...chart.querySelectorAll('g.lini-hit-0 title')].map(item=>normalize(item.textContent??'')),texts:texts(chart),lines:[...chart.querySelectorAll('g.lini-line line')].map(item=>{const rect=item.getBoundingClientRect(),parent=item.parentElement;return{x1:(rect.left+rect.right)/2-origin.x,x2:(rect.left+rect.right)/2-origin.x,y1:rect.top-origin.y,y2:rect.bottom-origin.y,stroke:parent?.getAttribute('style')?.match(/stroke:\s*([^;]+)/u)?.[1]??(parent?getComputedStyle(parent).stroke:'')};})}:undefined;
  return{svgBounds:box(svg),carriers,chart:chartInfo};
 });}catch{/* reported below */}
 const carrier=(id:string)=>dom?.carriers.find(item=>item.id===id);
 const exactCarrier=(id:string,text:string)=>carrier(id)?.texts.includes(norm(text))??false;
 if(!dom?.chart){problems.push('native chart SVG carrier is missing');}
 if(!exactCarrier('metric-meter-title',visual.title??visual.question))problems.push('title is not owned by its mapped native carrier');
 if(visual.title!==undefined&&visual.question!==visual.title&&!exactCarrier('metric-meter-question',visual.question))problems.push('distinct source question is not visible in its mapped carrier');
 if(!exactCarrier('metric-meter-value',`${series.label}: ${displayNumber(point.value)} ${metric.unit}`))problems.push('formatted scalar and exact unit are not visible together in the mapped value carrier');
 if(metric.good!==undefined&&!exactCarrier('metric-meter-good',`Better: ${metric.good}`))problems.push('authored good-direction cue is not visible in its mapped native carrier');
 if(visual.takeaway!==undefined&&!exactCarrier('metric-meter-takeaway',visual.takeaway))problems.push('authored takeaway is not visible in its mapped native carrier');
 const plot=dom?.chart;
 if(plot){
  const zeroValue=point.value===0;
 if(plot.barRects.length!==(zeroValue?0:1))problems.push(`expected ${zeroValue?'no zero-width bar for the zero value':'one visible bar rectangle'} but found ${plot.barRects.length}`);
  if(!zeroValue&&(!plot.barFill||plot.barFill==='none'||plot.barFill==='rgba(0, 0, 0, 0)'||!plot.barStroke||plot.barStroke==='none'))problems.push('native bar fill or outline is not visibly rendered');
  if(!zeroValue&&!plot.hitTitles.some(title=>title.includes(series.label)&&title.includes(String(point.value))))problems.push('native bar hit region does not own the source series label and raw value');
  if(!plot.texts.some(item=>item.visible&&item.text===series.label))problems.push('source series label is not visible as the native category');
  if(!plot.texts.some(item=>item.visible&&item.className.includes('lini-chart-label')&&item.text===displayNumber(point.value)))problems.push('native chart does not visibly label the formatted source value on its bar');
   if(!plot.texts.some(item=>item.visible&&item.text.includes(`Target ${displayNumber(target)}`)))problems.push('native chart does not visibly label the exact target reference');
  if(!plot.texts.some(item=>item.visible&&item.text===metric.unit))problems.push('native chart does not visibly label the exact unit on its value axis');
   const bar=plot.barRects[0];if(bar&&(!(bar.height>0)||bar.width<0||bar.x<plot.bounds.x||bar.x+bar.width>plot.bounds.x+plot.bounds.width||bar.y<plot.bounds.y||bar.y+bar.height>plot.bounds.y+plot.bounds.height))problems.push('source bar geometry is invalid or clipped by the native chart');
  const numericTexts=plot.texts.filter(item=>item.visible&&item.className.includes('lini-chart-text')&&/^-?\d+$/u.test(item.text)&&item.bounds.y+item.bounds.height/2>plot.bounds.y+plot.bounds.height*.55);
  const byRow=new Map<number,PlotText[]>();for(const item of numericTexts){const y=Math.round((item.bounds.y+item.bounds.height/2)/2)*2,rows=byRow.get(y)??[];rows.push(item);byRow.set(y,rows);}
  const tickTexts=[...byRow.values()].sort((a,b)=>b.length-a.length)[0]??[],orderedTicks=[...tickTexts].sort((a,b)=>a.bounds.x-b.bounds.x),tickRows=orderedTicks.map(item=>Number(item.text)),tickXs=orderedTicks.map(item=>item.bounds.x+item.bounds.width/2);
  const zeroIndex=tickRows.indexOf(0),last=tickRows.length-1;
  const vertical=plot.lines.filter(line=>Math.abs(line.x2-line.x1)<1&&Math.abs(line.y2-line.y1)>plot.bounds.height*.45&&line.stroke.includes('--lini-muted'));
  if(vertical.length!==new Set(referenceEntries.map(entry=>entry.value)).size)problems.push(`native reference rule count ${vertical.length} does not match ${new Set(referenceEntries.map(entry=>entry.value)).size} distinct authored reference coordinates`);
  const tickCalibration=axisTicks.map((value,index)=>({value,x:orderedTicks[index]?.bounds.x===undefined?NaN:orderedTicks[index]!.bounds.x+orderedTicks[index]!.bounds.width/2}));
  if(zeroIndex<0||orderedTicks.length!==axisTicks.length||tickCalibration.some(item=>!Number.isFinite(item.x))||vertical.length===0)problems.push(`native axis tick anchors or numeric-reference rule are missing (ticks=${tickRows.join(',')}; expected=${axisTicks.join(',')}; referenceRules=${vertical.length})`);
  else {
   const first=tickCalibration[0]!,lastTick=tickCalibration.at(-1)!,scale=(lastTick.x-first.x)/(lastTick.value-first.value),xFor=(value:number)=>first.x+(value-first.value)*scale,expectedTarget=xFor(target),targetLine=vertical.reduce((best,line)=>Math.abs(line.x1-expectedTarget)<Math.abs(best.x1-expectedTarget)?line:best,vertical[0]!);
   if(Math.abs(targetLine.x1-expectedTarget)>3)problems.push(`target line is ${Math.abs(targetLine.x1-expectedTarget).toFixed(2)} CSS px from its source value coordinate`);
   const targetText=plot.texts.find(item=>item.visible&&item.text.includes(`Target ${displayNumber(target)}`));if(targetText&&labelRuleGap(targetText.bounds,expectedTarget)>32)problems.push('target caption is not positioned beside its own native reference rule');
   const zeroX=xFor(0),valueX=xFor(point.value),expectedLeft=Math.min(zeroX,valueX),expectedRight=Math.max(zeroX,valueX);
   if(bar&&Math.abs(bar.x+bar.width-expectedRight)>4)problems.push(`bar endpoint is ${Math.abs(bar.x+bar.width-expectedRight).toFixed(2)} CSS px from its source value coordinate`);
   if(bar&&Math.abs(bar.x-expectedLeft)>4)problems.push(`bar origin is ${Math.abs(bar.x-expectedLeft).toFixed(2)} CSS px from zero`);
   if(!(min<target&&target<max))problems.push('target is at or beyond a display bound rather than inside the padded axis');
   const otherReferences=referenceEntries.slice(1);
   for(const entry of otherReferences){const labelText=plot.texts.find(item=>item.visible&&item.text.includes(entry.label));if(!labelText){problems.push(`native chart does not visibly label authored reference ${entry.label}`);continue;}const expectedX=xFor(entry.value),nearest=vertical.reduce((best,line)=>Math.abs(line.x1-expectedX)<Math.abs(best.x1-expectedX)?line:best,vertical[0]!);if(Math.abs(nearest.x1-expectedX)>3)problems.push(`reference ${entry.label} is detached from its source coordinate`);if(labelRuleGap(labelText.bounds,expectedX)>32)problems.push(`reference caption ${entry.label} is not positioned beside its own native rule`);}
  }
  const tickLabels=orderedTicks.map(item=>item.text);
  if(metric.format?.kind==='number'&&metric.format.decimals===0&&tickLabels.some(value=>!/^[-−]?\d+$/u.test(value)))problems.push('native axis tick labels do not honor zero-decimal number formatting');
 }
 const details=problems.length?problems.join('; '):`Native SVG and desugared source bind the one logical series and point, raw ${point.value} ${metric.unit} value (visible numeric labels honor the authored format), ${metric.good===undefined?'no authored good-direction cue':`“Better: ${metric.good}”`}, and exact target ${target} to their owned carriers. The visible bar starts at zero and its endpoint and target rule match the raw numeric axis coordinates; padded axis bounds include all admitted values/references without presenting target as a maximum. `+(metric.baseline!==undefined||metric.comparison!==undefined?'Authored baseline/comparison references are present and checked against the source axis bounds.':'No baseline or comparison reference is authored.');
 return[check(sourceSha256,problems.length===0,details)];
}
