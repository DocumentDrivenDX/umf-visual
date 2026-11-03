// SPDX-License-Identifier: MIT OR Apache-2.0
/** Native SVG ownership and coordinate checks for the bounded Lini date/stat profile. */
import {createHash} from 'node:crypto';
import type {Page} from 'playwright';
import type {Document} from '@umf/core';
import {getVisual,type Visual} from '../../src/extensions/visual';
import type {PresentationPlan} from '../../src/presentation';
import {utcCalendarDate,utcCalendarDay} from '../../src/presentation/calendar';
import {niceMetricStep,planMetricNumericScale} from '../../src/presentation/numeric-scale';
import type {PresentationQualityCheck} from './quality';

type Box={x:number;y:number;width:number;height:number};
type Point={x:number;y:number};
type NativeCarrier={id:string;text:string;bounds:Box;visible:boolean;center:Point;stroke:string;fill:string;tag:string};
type NativeLine={id:string;start:Point;end:Point;stroke:string};
type NativeSvg={isLini:boolean;bounds:Box;viewBox:{x:number;y:number;width:number;height:number};carriers:NativeCarrier[];lines:NativeLine[]};
const sha=(value:string)=>createHash('sha256').update(Buffer.from(value,'utf8')).digest('hex');
const norm=(value:string)=>value.replace(/\s+/gu,' ').trim();
const at=(part:string)=>'/extensions/umf.visual'+(part.startsWith('/')?part:'/'+part);
const pass=(sourceSha256:string,ok:boolean,details:string):PresentationQualityCheck=>({check:'lini-stat-events-and-date-scale',sourceSha256,result:ok?'pass':'fail',details});
const close=(a:number,b:number,tolerance=2)=>Math.abs(a-b)<=tolerance;
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const displayNumber=(value:number,decimals:number|undefined)=>decimals===undefined?String(Object.is(value,-0)?'-0':value):decimals===0?value.toFixed(0):value.toFixed(decimals);
function nativeId(plan:PresentationPlan,kind:string,logicalId:string){return plan.elementMap.find(item=>item.kind===kind&&item.logicalId===logicalId)?.nativeId;}
function expectedDomain(visual:Visual){
 return planMetricNumericScale(visual.metric!.series[0]!.points.map(point=>point.value))!;
}

/** The caller inserts the exact native Lini SVG into #frame before running this check. */
export async function verifyLiniStatPresentationQuality(page:Page,input:{document:Document;plan:PresentationPlan;nativeAst:unknown}):Promise<PresentationQualityCheck[]>{
 const sourceSha256=sha(input.plan.source);let visual:Visual|undefined;try{visual=getVisual(input.document);}catch{/* diagnostic below */}
 if(!visual||visual.kind!=='metric'||visual.form!=='stat'||!visual.metric){return[pass(sourceSha256,false,'The document is not a readable metric/stat payload.')];}
 const metric=visual.metric,series=metric.series[0],points=series?.points??[],pointMaps=input.plan.elementMap.filter(item=>item.kind==='metric-value'&&item.nativeId.startsWith('metric-stat-point-')&&/^\/extensions\/umf\.visual\/metric\/series\/0\/points\/\d+$/u.test(item.sourcePath));
 const nativeAst=typeof input.nativeAst==='string'?input.nativeAst:'',astProblems:string[]=[];
 for(const item of input.plan.elementMap){if(!nativeAst.includes('#'+item.nativeId))astProblems.push(`${item.sourcePath} has no native declaration anchor`);}
 const astOk=!!nativeAst.trim()&&astProblems.length===0;
 const checkList:PresentationQualityCheck[]=[{check:'lini-native-ast',sourceSha256,result:astOk?'pass':'fail',details:astOk?`Pinned desugared source preserves all ${input.plan.elementMap.length} mapped stat identity anchors.`:astProblems.slice(0,8).join('; ')||'Native source is empty.'}];
 const dom=await page.locator('#frame svg').first().evaluate((root)=>{
  const svg=root as SVGSVGElement,origin=svg.getBoundingClientRect(),screen=(element:SVGGraphicsElement,x:number,y:number)=>{const ctm=element.getScreenCTM();if(!ctm)return{x:NaN,y:NaN};const point=new DOMPoint(x,y).matrixTransform(ctm);return{x:point.x-origin.x,y:point.y-origin.y};},box=(element:Element)=>{const r=element.getBoundingClientRect();return{x:r.x-origin.x,y:r.y-origin.y,width:r.width,height:r.height};},visible=(element:Element)=>{let current:Element|null=element;while(current&&current!==svg){const style=getComputedStyle(current);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;current=current.parentElement;}return true;};
  const carriers=[...svg.querySelectorAll<SVGGElement>('g.lini-node[data-id]')].map(group=>{const shape=group.querySelector(':scope > ellipse,:scope > rect,:scope > circle,:scope > path,:scope > polygon') as SVGGraphicsElement|null,r=shape?.getBBox(),center=shape&&r?screen(shape,r.x+r.width/2,r.y+r.height/2):(()=>{const b=box(group);return{x:b.x+b.width/2,y:b.y+b.height/2};})(),texts=[...group.querySelectorAll('text.lini-text')].map(text=>text.textContent??'').join(' ').replace(/\s+/gu,' ').trim(),style=getComputedStyle(shape??group);
   return{id:group.dataset.id??'',text:texts,bounds:box(group),visible:visible(group)&&[...group.querySelectorAll('text')].every(text=>visible(text)),center,stroke:style.stroke,fill:style.fill,tag:shape?.tagName.toLowerCase()??''};});
  const lines=[...svg.querySelectorAll<SVGGElement>('g.lini-node[data-id]')].flatMap(group=>{const line=group.querySelector(':scope > line') as SVGLineElement|null;if(!line)return[];return[{id:group.dataset.id??'',start:screen(line,Number(line.getAttribute('x1')),Number(line.getAttribute('y1'))),end:screen(line,Number(line.getAttribute('x2')),Number(line.getAttribute('y2'))),stroke:getComputedStyle(line).stroke}];});
  const vb=svg.viewBox.baseVal;return{isLini:svg.matches('svg.lini'),bounds:box(svg),viewBox:{x:vb.x,y:vb.y,width:vb.width,height:vb.height},carriers,lines};
 }) as NativeSvg;
 const problems:string[]=[];let visibleOk=dom.isLini&&dom.bounds.width>0&&dom.bounds.height>0&&dom.viewBox.width>0&&dom.viewBox.height>0,decimals=metric.format?.kind==='number'?metric.format.decimals??0:undefined;
 const carrier=(id:string)=>dom.carriers.find(item=>item.id===id),line=(id:string)=>dom.lines.find(item=>item.id===id);
 const map=(sourcePath:string,nativeId:string,logicalId:string,kind:string)=>input.plan.elementMap.some(item=>item.sourcePath===at(sourcePath)&&item.nativeId===nativeId&&item.logicalId===logicalId&&item.kind===kind);
 if(pointMaps.length!==points.length){visibleOk=false;problems.push(`source point-root map count ${pointMaps.length} differs from ${points.length} observations`);}
 const mappingsOk=points.every((point,index)=>pointMaps.some(item=>item.sourcePath===at(`/metric/series/0/points/${index}`)&&item.logicalId===JSON.stringify([series!.id,index])&&item.nativeId===`metric-stat-point-${index+1}`));
 if(!mappingsOk){visibleOk=false;problems.push('one or more observation roots do not preserve their original source index and mapped caption identity');}
 for(const[index,point]of points.entries()){
  const logicalId=JSON.stringify([series!.id,index]),root=`/metric/series/0/points/${index}`,caption=`metric-stat-point-${index+1}`,marker=`metric-stat-marker-${index+1}`;
  if(!map(root,caption,logicalId,'metric-value')||!map(root+'/at',caption,logicalId,'metric-value')||!map(root+'/value',caption,logicalId,'metric-value')||!map(root+'/value',marker,logicalId,'metric-value')){visibleOk=false;problems.push(`source observation ${index} date/value map ownership does not match its exact caption and marker`);}
 }
 const dateRows=points.map((point,index)=>({point,index,day:utcCalendarDay(point.at??'')})).sort((a,b)=>(a.day??0)-(b.day??0)||a.index-b.index),firstDay=dateRows[0]?.day,lastDay=dateRows.at(-1)?.day;
 const xAxis=line('metric-stat-x-axis'),yAxis=line('metric-stat-y-axis'),xLeft=xAxis?Math.min(xAxis.start.x,xAxis.end.x):NaN,xRight=xAxis?Math.max(xAxis.start.x,xAxis.end.x):NaN,yTop=yAxis?Math.min(yAxis.start.y,yAxis.end.y):NaN,yBottom=yAxis?Math.max(yAxis.start.y,yAxis.end.y):NaN,domain=expectedDomain(visual);
 if(!xAxis||!yAxis||!Number.isFinite(xLeft)||!Number.isFinite(yTop)||xRight<=xLeft||yBottom<=yTop){visibleOk=false;problems.push('native date/value axis endpoints are missing or degenerate');}
 if(dom.carriers.some(item=>/lini-chart/u.test(item.id))){visibleOk=false;problems.push('numeric chart scaffolding leaked into the native scene');}
 for(const {point,index,day} of dateRows){
  const n=index+1,caption=carrier(`metric-stat-point-${n}`),marker=carrier(`metric-stat-marker-${n}`),captionText=`${point.at} · ${displayNumber(point.value,decimals)} ${metric.unit}`;
  if(!caption||!marker){visibleOk=false;problems.push(`observation ${index} lacks its visible caption or native mark`);continue;}
  if(!caption.visible||!marker.visible||!caption.text.includes(norm(captionText))||marker.tag!=='ellipse'||!marker.fill||marker.fill==='none'){visibleOk=false;problems.push(`observation ${index} does not visibly own its exact date/value/unit caption and ellipse marker`);}
  if(!contains(dom.bounds,caption.bounds,2)||!contains(dom.bounds,marker.bounds,2)){visibleOk=false;problems.push(`observation ${index} is clipped by the SVG viewport`);}
  if(firstDay!==undefined&&lastDay!==undefined&&xRight>xLeft){const ratio=lastDay===firstDay?0.5:(day!-firstDay)/(lastDay-firstDay),expectedX=xLeft+ratio*(xRight-xLeft);if(!close(marker.center.x,expectedX,2)){visibleOk=false;problems.push(`observation ${index} x position does not follow exact UTC-day spacing`);}}
  if(yBottom>yTop){const expectedY=yBottom-(point.value-domain.min)/(domain.max-domain.min)*(yBottom-yTop);if(!close(marker.center.y,expectedY,2)){visibleOk=false;problems.push(`observation ${index} y position does not preserve its raw source value on the native scale`);}}
  if(!Number.isFinite(caption.bounds.x)||caption.bounds.width<=0||caption.bounds.height<=0){visibleOk=false;problems.push(`observation ${index} caption has invalid bounds`);}
 }
 for(let left=0;left<dateRows.length;left++)for(let right=left+1;right<dateRows.length;right++){
  const a=dateRows[left]!,b=dateRows[right]!,am=carrier(`metric-stat-marker-${a.index+1}`),bm=carrier(`metric-stat-marker-${b.index+1}`);
  if(!am||!bm)continue;if(a.day===b.day&&!close(am.center.x,bm.center.x,1)){visibleOk=false;problems.push(`same-date observations ${a.index} and ${b.index} do not share x`);}
  if(a.day!==b.day&&a.point.value===b.point.value&&!close(am.center.y,bm.center.y,1)){visibleOk=false;problems.push(`equal-value observations ${a.index} and ${b.index} do not preserve their plateau y`);}
  const ac=carrier(`metric-stat-point-${a.index+1}`)?.bounds,bc=carrier(`metric-stat-point-${b.index+1}`)?.bounds;if(ac&&bc&&overlaps(ac,bc)){visibleOk=false;problems.push(`observation captions ${a.index} and ${b.index} overlap`);}
 }
 const expectedGuideCount=dateRows.slice(1).filter((row,index)=>row.day!==dateRows[index]!.day).length,actualGuideCount=dom.lines.filter(item=>/^metric-stat-guide-\d+$/u.test(item.id)).length;
 if(actualGuideCount!==expectedGuideCount){visibleOk=false;problems.push(`native straight guide count ${actualGuideCount} differs from distinct-date adjacencies ${expectedGuideCount}`);}
 for(let index=1;index<dateRows.length;index++){const previous=dateRows[index-1]!,current=dateRows[index]!;if(previous.day===current.day)continue;const guide=line(`metric-stat-guide-${index}`),from=carrier(`metric-stat-marker-${previous.index+1}`),to=carrier(`metric-stat-marker-${current.index+1}`);if(!guide||!from||!to||distance(guide.start,from.center)>2||distance(guide.end,to.center)>2){visibleOk=false;problems.push(`native guide ${index} does not connect the adjacent dated observation marks`);}}
 const latest=dateRows.at(-1),latestRows=latest?dateRows.filter(row=>row.day===latest.day):[],latestText=carrier('metric-stat-latest');
 const latestExpected=latest?`Latest dated observation${latestRows.length>1?'s':''}: ${latest.point.at} · ${latestRows.map(row=>displayNumber(row.point.value,decimals)+' '+metric.unit).join(' / ')}`:'';
 if(!latestText?.visible||!latestText.text.includes(norm(latestExpected))){visibleOk=false;problems.push('latest dated observation headline does not own all values on the greatest UTC date');}
 for(const row of latestRows){const logicalId=JSON.stringify([series!.id,row.index]),suffix=`/metric/series/0/points/${row.index}`;if(!map(suffix+'/at','metric-stat-latest',logicalId,'metric-value')||!map(suffix+'/value','metric-stat-latest',logicalId,'metric-value')){visibleOk=false;problems.push(`latest observation ${row.index} is not source-mapped to the dated headline`);}}
 for(const [id,text] of [['metric-stat-title',visual.title??visual.question],['metric-stat-series',series!.label],['metric-stat-unit',metric.unit]] as const){const item=carrier(id);if(!item?.visible||!item.text.includes(norm(text))){visibleOk=false;problems.push(`${id} does not visibly own its exact source text`);}}
 if(!map('/id','metric-stat-panel',visual.id,'visual')||!map(visual.title!==undefined?'/title':'/question','metric-stat-title',visual.id,'visual')||!map('/metric/series/0/id','metric-stat-series',series!.id,'metric-series')||!map('/metric/series/0/label','metric-stat-series',series!.id,'metric-series')||!map('/metric/unit','metric-stat-unit',metric.unit,'metric-reference')||!map('/metric/axis/kind','metric-stat-x-axis','time','metric-reference')){visibleOk=false;problems.push('title, series, unit, or date-axis source ownership is incorrect');}
 if(visual.title!==undefined&&visual.question!==visual.title){const question=carrier('metric-stat-question');if(!question?.visible||!question.text.includes(norm(visual.question))){visibleOk=false;problems.push('question text is not visible in its mapped native carrier');}}
 if(visual.title!==undefined&&visual.question!==visual.title&&!map('/question','metric-stat-question',visual.id,'visual')){visibleOk=false;problems.push('question source pointer is not mapped to its visible carrier');}
 if(visual.takeaway!==undefined){const takeaway=carrier('metric-stat-takeaway');if(!takeaway?.visible||!takeaway.text.includes(norm(visual.takeaway))){visibleOk=false;problems.push('authored takeaway is not visible in its mapped native carrier');}}
 if(visual.takeaway!==undefined&&!map('/takeaway','metric-stat-takeaway',visual.id,'visual')){visibleOk=false;problems.push('takeaway source pointer is not mapped to its visible carrier');}
 for(const[index,note]of(visual.omissions??[]).entries()){const noteCarrier=carrier(`metric-stat-note-${index+1}`);if(!noteCarrier?.visible||!noteCarrier.text.includes(norm(note))){visibleOk=false;problems.push(`authored caveat ${index} is not visible in its mapped native carrier`);}}
 for(const[index]of(visual.omissions??[]).entries())if(!map('/omissions/'+index,`metric-stat-note-${index+1}`,visual.id,'annotation')){visibleOk=false;problems.push(`caveat ${index} source pointer is not mapped to its visible carrier`);}
 for(const [suffix,reason]of [['/source','Source provenance remains in the source document and is not rendered as a measurement.'],['/audience','Audience metadata remains in the source document.'],['/steps','Walkthrough steps remain in the source and are outside this static temporal-stat plot.']] as const){const authored=suffix==='/source'?visual.source!==undefined:suffix==='/audience'?visual.audience!==undefined:visual.steps!==undefined;if(authored&&!input.plan.omissions.some(item=>item.sourcePath===at(suffix)&&item.reason===reason)){visibleOk=false;problems.push(`${suffix} metadata lacks a located retention record`);}}
 const good=metric.good?carrier('metric-stat-good'):undefined;if(metric.good&&(!good?.visible||!good.text.includes('Better: '+metric.good))){visibleOk=false;problems.push('authored good direction is not visibly owned');}
 if(metric.good&&!map('/metric/good','metric-stat-good',metric.good,'metric-reference')){visibleOk=false;problems.push('good-direction source pointer is not mapped to its visible carrier');}
 const first=dateRows[0]?.day,last=dateRows.at(-1)?.day,span=first!==undefined&&last!==undefined?last-first:0,tickStep=Math.max(1,Math.ceil(niceMetricStep(span||1))),expectedTickDays=new Set<number>([first??0,last??0]);if(span>7&&first!==undefined&&last!==undefined)for(let day=first+tickStep;day<last;day+=tickStep)expectedTickDays.add(day);
 const expectedTicks=[...expectedTickDays].sort((a,b)=>a-b),actualTickLabels=dom.carriers.filter(item=>/^metric-stat-x-tick-label-\d+$/u.test(item.id)).sort((a,b)=>Number(a.id.split('-').at(-1))-Number(b.id.split('-').at(-1))),actualTickMarks=expectedTicks.map((_,index)=>line(`metric-stat-x-tick-${index+1}`));
 if(actualTickLabels.length!==expectedTicks.length||actualTickMarks.some(item=>!item)){visibleOk=false;problems.push('native date tick count does not match the integral UTC-day tick plan');}
 for(let index=0;index<Math.min(actualTickLabels.length,expectedTicks.length);index++){const day=expectedTicks[index]!,date=utcCalendarDate(day),tick=actualTickLabels[index]!,tickLine=actualTickMarks[index],expectedLabel=date?.slice(5),expectedX=first!==undefined&&last!==undefined&&last!==first?xLeft+(day-first)/(last-first)*(xRight-xLeft):(xLeft+xRight)/2;if(!date||tick.text!==expectedLabel||!tick.visible||!tickLine||!close((tick.bounds.x+tick.bounds.width/2),expectedX,3)||!close((tickLine.start.x+tickLine.end.x)/2,expectedX,2)){visibleOk=false;problems.push(`date tick ${index} does not own the exact UTC date ${date??'from the supported calendar'} at its affine x position`);}}
 const dateAxisLabel=carrier('metric-stat-date-axis-label'),orderedCaptions=dateRows.map(row=>carrier(`metric-stat-point-${row.index+1}`)).filter((item):item is NativeCarrier=>!!item);
 if(!dateAxisLabel||!orderedCaptions.every(item=>item.bounds.y>=dateAxisLabel.bounds.y+dateAxisLabel.bounds.height+3)){visibleOk=false;problems.push('exact observation captions are not in a clear ordered area below the date axis');}
 const observationsHeading=carrier('metric-stat-observations-heading'),guideNote=carrier('metric-stat-guide-note');
 if(!observationsHeading?.visible||observationsHeading.text!=='Dated observations'){visibleOk=false;problems.push('the chronological caption list lacks its native section heading');}
 if(!guideNote?.visible||guideNote.text!=='Points are dated observations; straight lines are visual guides.'||!input.plan.approximations.some(item=>item.sourcePath===at('/metric/series/0/points')&&item.representation.includes('do not assert measurements between the authored points'))){visibleOk=false;problems.push('visible straight-guide disclosure is missing or conflicts with the located approximation');}
 if(dateAxisLabel&&observationsHeading&&observationsHeading.bounds.y<dateAxisLabel.bounds.y+dateAxisLabel.bounds.height+3||observationsHeading&&orderedCaptions[0]&&orderedCaptions[0].bounds.y<observationsHeading.bounds.y+observationsHeading.bounds.height+3){visibleOk=false;problems.push('date-axis, observation-list heading, and first data row overlap');}
 for(let index=1;index<orderedCaptions.length;index++){const previous=orderedCaptions[index-1]!,current=orderedCaptions[index]!,previousY=previous.bounds.y+previous.bounds.height/2,currentY=current.bounds.y+current.bounds.height/2,previousX=previous.bounds.x+previous.bounds.width/2,currentX=current.bounds.x+current.bounds.width/2;if(currentY<previousY-3||close(currentY,previousY,3)&&currentX<=previousX){visibleOk=false;problems.push(`observation captions do not follow chronological row order at ${index}`);}}
 if(dom.lines.some(item=>/^metric-stat-callout-\d+$/u.test(item.id))){visibleOk=false;problems.push('native marker callout lines cross the plot/axis reading area; point captions must remain in the separate date/value list');}
 const expectedYTicks=domain.ticks;
 const actualYLabels=dom.carriers.filter(item=>/^metric-stat-y-tick-\d+$/u.test(item.id)).sort((a,b)=>Number(a.id.split('-').at(-1))-Number(b.id.split('-').at(-1)));
 if(actualYLabels.length!==expectedYTicks.length){visibleOk=false;problems.push('native value tick count differs from the renderer-selected raw-value axis');}
 for(let index=0;index<Math.min(actualYLabels.length,expectedYTicks.length);index++){const label=actualYLabels[index]!,grid=line(`metric-stat-y-grid-${index+1}`),raw=expectedYTicks[index]!,expectedY=yBottom-(raw-domain.min)/(domain.max-domain.min)*(yBottom-yTop),labelY=label.bounds.y+label.bounds.height/2,gridY=grid?(grid.start.y+grid.end.y)/2:NaN;if(!label.visible||label.text!==displayNumber(raw,decimals)||!grid||!close(labelY,expectedY,3)||!close(gridY,expectedY,2)){visibleOk=false;problems.push(`value tick ${index} label=${JSON.stringify(label.text)} expected=${JSON.stringify(displayNumber(raw,decimals))} raw=${raw} y(label/grid/expected)=${labelY.toFixed(2)}/${gridY.toFixed(2)}/${expectedY.toFixed(2)}`);}}
 if(metric.format){for(const[index]of points.entries())for(const suffix of ['/kind','/decimals'])if(!map('/metric/format'+suffix,`metric-stat-point-${index+1}`,suffix==='/kind'?'number':String(decimals),'metric-reference')){visibleOk=false;problems.push(`format ${suffix} is not mapped to observation caption ${index}`);}for(let index=0;index<expectedYTicks.length;index++)for(const suffix of ['/kind','/decimals'])if(!map('/metric/format'+suffix,`metric-stat-y-tick-${index+1}`,suffix==='/kind'?'number':String(decimals),'metric-reference')){visibleOk=false;problems.push(`format ${suffix} is not mapped to value tick ${index}`);}for(const suffix of ['/kind','/decimals'])if(!map('/metric/format'+suffix,'metric-stat-latest',suffix==='/kind'?'number':String(decimals),'metric-reference')){visibleOk=false;problems.push(`format ${suffix} is not mapped to dated headline`);}}
 const carrierOk=visibleOk&&pointMaps.length===points.length;
 checkList.push({check:'lini-native-carriers',sourceSha256,result:carrierOk?'pass':'fail',details:carrierOk?`All ${points.length} source-indexed observations visibly own exact date/value/unit captions and native ellipse marks; ${actualGuideCount} straight guide segments join distinct successive dates; raw UTC x and value y geometry, plateau values, latest-date ownership, and in-frame text were measured in the pinned native SVG.`:problems.join('; ')||'Native stat carriers are unavailable.'});
 checkList.push(pass(sourceSha256,visibleOk,visibleOk?`Native observation positions follow exact UTC-day/value affine ratios; same-date x and equal-value plateau y are preserved. Every point label and marker is source-index mapped and visible below the plot; the dated-observation headline owns all readings on the latest date. Native straight guide segments do not encode smoothing or intermediate values.`:problems.join('; ')||'Native stat geometry is unavailable.'));
 return checkList;
}

function contains(outer:Box,inner:Box,padding=0){return inner.x>=outer.x-padding&&inner.y>=outer.y-padding&&inner.x+inner.width<=outer.x+outer.width+padding&&inner.y+inner.height<=outer.y+outer.height+padding;}
function overlaps(a:Box,b:Box){return Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y);}
