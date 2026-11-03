// SPDX-License-Identifier: MIT OR Apache-2.0
/** Source-bound native carrier and UTC/raw-value geometry proof for Lini trends. */
import {createHash} from 'node:crypto';
import type {Page} from 'playwright';
import type {Document} from '@umf/core';
import {getVisual,type Visual} from '../../src/extensions/visual';
import type {PresentationPlan} from '../../src/presentation';
import {utcCalendarDate,utcCalendarDay} from '../../src/presentation/calendar';
import {planMetricNumericScale} from '../../src/presentation/numeric-scale';
import type {PresentationQualityCheck} from './quality';

type Point={x:number;y:number};
type Box={x:number;y:number;width:number;height:number};
type Carrier={id:string;text:string;box:Box;center:Point;visible:boolean;fill:string;stroke:string;shape:string};
type Segment={id:string;start:Point;end:Point;visible:boolean;stroke:string};
type NativeDom={isLini:boolean;svg:Box;viewBox:{width:number;height:number};carriers:Carrier[];segments:Segment[]};
type MetricSeries=NonNullable<Visual['metric']>['series'];
const sha=(value:string)=>createHash('sha256').update(Buffer.from(value,'utf8')).digest('hex');
const norm=(value:string)=>value.replace(/\s+/gu,' ').trim();
const pointer=(part:string)=>'/extensions/umf.visual'+(part.startsWith('/')?part:'/'+part);
const near=(a:number,b:number,tolerance=4)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance;
const pass=(sourceSha256:string,check:string,ok:boolean,details:string):PresentationQualityCheck=>({check,sourceSha256,result:ok?'pass':'fail',details});
const displayNumber=(value:number,decimals:number|undefined)=>decimals===undefined?(Object.is(value,-0)?'-0':String(value)):Number(value.toFixed(decimals)).toFixed(decimals);
function dateRowIndexFor(series:MetricSeries,seriesIndex:number,sourceIndex:number):number|undefined{
 const sourceSeries=series[seriesIndex],point=sourceSeries?.points[sourceIndex];if(!point||!point.at)return;
 const day=utcCalendarDay(point.at);if(day===undefined)return;
 const days=[...new Set(series.flatMap(item=>item.points.map(candidate=>utcCalendarDay(candidate.at??'')).filter((value):value is number=>value!==undefined)))].sort((a,b)=>a-b);
 const occurrences=(targetDay:number)=>series.map(item=>item.points.filter(candidate=>utcCalendarDay(candidate.at??'')===targetDay).length);
 const dayRowCount=(targetDay:number)=>{const counts=occurrences(targetDay),maximum=Math.max(...counts);return maximum>1?counts.reduce((sum,count)=>sum+count,0):maximum;};
 let row=0;for(const priorDay of days){if(priorDay>=day)break;row+=dayRowCount(priorDay);}
 const counts=occurrences(day),hasRepeats=Math.max(...counts)>1;
 if(hasRepeats){for(let priorSeries=0;priorSeries<seriesIndex;priorSeries++)row+=counts[priorSeries]!;row+=sourceSeries.points.slice(0,sourceIndex).filter(candidate=>utcCalendarDay(candidate.at??'')===day).length;}
 else row= row;
 return row;
}

/** The standard presentation host has inserted the exact native SVG into #frame. */
export async function verifyLiniTrendPresentationQuality(page:Page,input:{document:Document;plan:PresentationPlan;nativeAst:unknown}):Promise<PresentationQualityCheck[]>{
 const sourceSha256=sha(input.plan.source),checks:PresentationQualityCheck[]=[];
 let visual:Visual|undefined;try{visual=getVisual(input.document);}catch{/* reported as a failed proof below */}
 if(!visual||visual.kind!=='metric'||visual.form!=='line'||!visual.metric){
  return [pass(sourceSha256,'lini-native-ast',false,'The document is not a readable metric/line payload.'),pass(sourceSha256,'lini-trend-series-and-date-value-geometry',false,'The document is not a readable metric/line payload.')];
 }
 const metric=visual.metric,series=metric.series,allPoints=series.flatMap((item,seriesIndex)=>item.points.map((point,sourceIndex)=>({point,series:item,seriesIndex,sourceIndex,day:utcCalendarDay(point.at??'')}))).sort((a,b)=>(a.day??0)-(b.day??0)||a.seriesIndex-b.seriesIndex||a.sourceIndex-b.sourceIndex);
 const nativeAst=typeof input.nativeAst==='string'?input.nativeAst:'',problems:string[]=[];
 const mapped=(logicalId:string,sourcePath:string,nativeId:string,kind:string)=>input.plan.elementMap.filter(item=>item.logicalId===logicalId&&item.sourcePath===pointer(sourcePath)&&item.nativeId===nativeId&&item.kind===kind).length===1;
 let astOk=!!nativeAst.trim();
 for(const item of input.plan.elementMap){if(!nativeAst.includes('#'+item.nativeId+'|')){astOk=false;problems.push(`${item.sourcePath} has no desugared native anchor ${item.nativeId}`);}}
 for(const[index,item]of series.entries()){
  const id=`metric-trend-series-s${index+1}`;
  for(const suffix of [`/metric/series/${index}`,`/metric/series/${index}/id`,`/metric/series/${index}/label`])if(!mapped(item.id,suffix,id,'metric-series')){astOk=false;problems.push(`series ${item.id} source mapping is missing at ${suffix}`);}
 }
 for(const row of allPoints){
  const {point,series:item,seriesIndex,sourceIndex}=row,logical=JSON.stringify([item.id,sourceIndex]),base=`/metric/series/${seriesIndex}/points/${sourceIndex}`,caption=`metric-trend-point-s${seriesIndex+1}-p${sourceIndex+1}`,marker=`metric-trend-marker-s${seriesIndex+1}-p${sourceIndex+1}`;
  const dateRowIndex=dateRowIndexFor(series,seriesIndex,sourceIndex),dateRow=`metric-trend-date-row-d${(dateRowIndex??-1)+1}`;
  for(const suffix of [base,base+'/value'])if(!mapped(logical,suffix,caption,'metric-value')){astOk=false;problems.push(`observation ${logical} does not map ${suffix} to its value cell`);}
  if(!mapped(logical,base+'/at',dateRow,'metric-value')){astOk=false;problems.push(`observation ${logical} date does not map to its shared exact-date row`);}
  for(const suffix of [base,base+'/value'])if(!mapped(logical,suffix,marker,'metric-value')){astOk=false;problems.push(`observation ${logical} does not map ${suffix} to its marker`);}
 }
 const dom=await page.locator('#frame svg').first().evaluate(root=>{
  const svg=root as SVGSVGElement,origin=svg.getBoundingClientRect(),view=svg.viewBox.baseVal;
  const box=(element:Element):Box=>{const r=element.getBoundingClientRect();return{x:r.x-origin.x,y:r.y-origin.y,width:r.width,height:r.height};};
  const visible=(element:Element)=>{let current:Element|null=element;while(current&&current!==svg){const style=getComputedStyle(current);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;current=current.parentElement;}const b=element.getBoundingClientRect();return b.width>0&&b.height>0;};
  const screen=(element:SVGGraphicsElement,x:number,y:number):Point=>{const matrix=element.getScreenCTM();if(!matrix)return{x:NaN,y:NaN};const p=new DOMPoint(x,y).matrixTransform(matrix);return{x:p.x-origin.x,y:p.y-origin.y};};
  const carriers=[...svg.querySelectorAll<SVGGElement>('g.lini-node[data-id]')].map(group=>{
   const shape=group.querySelector(':scope > ellipse,:scope > rect,:scope > circle,:scope > polygon,:scope > path,:scope > line') as SVGGraphicsElement|null,bounds=box(group),r=shape?.getBBox(),center=shape&&r?screen(shape,r.x+r.width/2,r.y+r.height/2):{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};
   return{id:group.dataset.id??'',text:[...group.querySelectorAll('text.lini-text')].map(text=>text.textContent??'').join(' ').replace(/\s+/gu,' ').trim(),box:bounds,center,visible:visible(group)&&[...group.querySelectorAll('text')].every(visible),fill:getComputedStyle(shape??group).fill,stroke:getComputedStyle(shape??group).stroke,shape:shape?.tagName.toLowerCase()??''};
  });
  const segments=[...svg.querySelectorAll<SVGGElement>('g.lini-node[data-id]')].flatMap(group=>{
   const line=group.querySelector(':scope > line') as SVGLineElement|null;if(!line)return[];
   const style=getComputedStyle(line),rect=group.getBoundingClientRect(),groupVisible=(()=>{let current:Element|null=group;while(current&&current!==svg){const parentStyle=getComputedStyle(current);if(parentStyle.display==='none'||parentStyle.visibility==='hidden'||Number(parentStyle.opacity)===0)return false;current=current.parentElement;}return rect.width>0||rect.height>0;})();
   return[{id:group.dataset.id??'',start:screen(line,Number(line.getAttribute('x1')),Number(line.getAttribute('y1'))),end:screen(line,Number(line.getAttribute('x2')),Number(line.getAttribute('y2'))),visible:groupVisible&&line.getTotalLength()>0&&style.stroke!=='none'&&Number.parseFloat(style.strokeWidth)>0,stroke:style.stroke}];
  });
  return{isLini:svg.matches('svg.lini'),svg:box(svg),viewBox:{width:view.width,height:view.height},carriers,segments};
 }) as NativeDom;
 const carrier=(id:string)=>dom.carriers.find(item=>item.id===id),segment=(id:string)=>dom.segments.find(item=>item.id===id);
 let geometryOk=dom.isLini&&dom.svg.width>0&&dom.svg.height>0&&dom.viewBox.width>0&&dom.viewBox.height>0;
 if(!geometryOk)problems.push('the inserted native Lini SVG or its viewBox is missing or degenerate');
 const expectedIds=new Set<string>();
 for(const[index,item]of series.entries()){
  const legend=carrier(`metric-trend-series-s${index+1}`);expectedIds.add(`metric-trend-series-s${index+1}`);
  if(!legend?.visible||!legend.text.includes(norm(item.label))){geometryOk=false;problems.push(`series ${item.id} does not own its visible legend label`);}
  const key=segment(`metric-trend-legend-key-s${index+1}`),seriesMarkers=allPoints.filter(row=>row.seriesIndex===index).map(row=>carrier(`metric-trend-marker-s${index+1}-p${row.sourceIndex+1}`));
  if(!key?.visible||!key.stroke||key.stroke==='none'||seriesMarkers.some(marker=>!marker||marker.fill!==key.stroke)){geometryOk=false;problems.push(`series ${item.id} legend color does not match its own native point markers`);}
 }
 const days=allPoints.map(row=>row.day).filter((day):day is number=>day!==undefined),firstDay=Math.min(...days),lastDay=Math.max(...days),scale=planMetricNumericScale(allPoints.map(row=>row.point.value));
 const xAxis=segment('metric-trend-x-axis'),yAxis=segment('metric-trend-y-axis');expectedIds.add('metric-trend-x-axis');expectedIds.add('metric-trend-y-axis');
 if(!xAxis||!yAxis||!scale||!near(xAxis.start.y,xAxis.end.y,1)||!near(yAxis.start.x,yAxis.end.x,1)||xAxis.end.x<=xAxis.start.x||yAxis.end.y<=yAxis.start.y){geometryOk=false;problems.push('native date/value axes are missing, reversed, or degenerate');}
 const left=xAxis?Math.min(xAxis.start.x,xAxis.end.x):0,right=xAxis?Math.max(xAxis.start.x,xAxis.end.x):0,top=yAxis?Math.min(yAxis.start.y,yAxis.end.y):0,bottom=yAxis?Math.max(yAxis.start.y,yAxis.end.y):0;
 const pointCenters=new Map<string,Point>();
 const uniqueDays=[...new Set(allPoints.map(row=>row.day).filter((day):day is number=>day!==undefined))].sort((a,b)=>a-b),dateRowCount=uniqueDays.reduce((count,day)=>{const counts=series.map(item=>item.points.filter(point=>utcCalendarDay(point.at??'')===day).length),maximum=Math.max(...counts);return count+(maximum>1?counts.reduce((sum,value)=>sum+value,0):maximum);},0);
 for(const row of allPoints){
  const {point,series:item,seriesIndex,sourceIndex,day}=row,s=seriesIndex+1,p=sourceIndex+1,captionId=`metric-trend-point-s${s}-p${p}`,markerId=`metric-trend-marker-s${s}-p${p}`;
  expectedIds.add(captionId);expectedIds.add(markerId);
  const dateRowNumber=dateRowIndexFor(series,seriesIndex,sourceIndex),dateRowId=`metric-trend-date-row-d${(dateRowNumber??-1)+1}`,dateRow=carrier(dateRowId),caption=carrier(captionId),marker=carrier(markerId),expectedValue=displayNumber(point.value,metric.format?.kind==='number'?metric.format.decimals:undefined);
  const seriesHeader=carrier(`metric-trend-series-s${s}`);
  expectedIds.add(dateRowId);
  if(!dateRow?.visible||dateRow.text!==point.at){geometryOk=false;problems.push(`point ${item.id}[${sourceIndex}] exact date is not owned by its shared chronological row`);}
  if(!caption?.visible||caption.text!==expectedValue){geometryOk=false;problems.push(`point ${item.id}[${sourceIndex}] value cell does not own its exact formatted numeric value`);}
  if(dateRow&&caption&&!near(dateRow.center.y,caption.center.y,2)){geometryOk=false;problems.push(`point ${item.id}[${sourceIndex}] value cell is not aligned with its exact-date row`);}
  if(!seriesHeader||!caption||!near(seriesHeader.center.x,caption.center.x,2)){geometryOk=false;problems.push(`point ${item.id}[${sourceIndex}] value cell is not aligned under its own source-series column`);}
  if(!marker?.visible||!['ellipse','polygon'].includes(marker.shape)){geometryOk=false;problems.push(`point ${item.id}[${sourceIndex}] has no visible native marker`);continue;}
  if(!near(marker.center.x,(marker.box.x+marker.box.width/2),1)||!near(marker.center.y,(marker.box.y+marker.box.height/2),1)){geometryOk=false;problems.push(`point ${item.id}[${sourceIndex}] marker geometry has no stable center`);}
  pointCenters.set(`${seriesIndex}:${sourceIndex}`,marker.center);
  if(day!==undefined&&right>left){const expectedX=lastDay===firstDay?(left+right)/2:left+(day-firstDay)/(lastDay-firstDay)*(right-left);if(!near(marker.center.x,expectedX,4)){geometryOk=false;problems.push(`point ${item.id}[${sourceIndex}] is not positioned by exact UTC-day ratio`);}}
  if(scale&&bottom>top){const expectedY=bottom-(point.value-scale.min)/(scale.max-scale.min)*(bottom-top);if(!near(marker.center.y,expectedY,4)){geometryOk=false;problems.push(`point ${item.id}[${sourceIndex}] does not preserve its raw value on the shared y scale`);}}
  if(marker.fill==='none'||!marker.fill){geometryOk=false;problems.push(`point ${item.id}[${sourceIndex}] marker has no visible series color`);}
 }
 let guideCount=0;
 for(const[index,item]of series.entries()){
  const chronological=item.points.map((point,sourceIndex)=>({point,sourceIndex,day:utcCalendarDay(point.at??'')})).sort((a,b)=>(a.day??0)-(b.day??0)||a.sourceIndex-b.sourceIndex);
  for(let offset=1;offset<chronological.length;offset++){
   const prior=chronological[offset-1]!,next=chronological[offset]!;if(prior.day===next.day)continue;
   const id=`metric-trend-guide-s${index+1}-p${offset}`;guideCount++;expectedIds.add(id);
   const line=segment(id),from=pointCenters.get(`${index}:${prior.sourceIndex}`),to=pointCenters.get(`${index}:${next.sourceIndex}`);
   if(!line||!from||!to||!line.visible||!near(line.start.x,from.x,3)||!near(line.start.y,from.y,3)||!near(line.end.x,to.x,3)||!near(line.end.y,to.y,3)){
    geometryOk=false;problems.push(`guide ${id} does not connect consecutive dated markers within series ${item.id}`);
   }
  }
 }
 const actualGuideCount=dom.segments.filter(item=>/^metric-trend-guide-s\d+-p\d+$/u.test(item.id)).length;
 if(actualGuideCount!==guideCount){geometryOk=false;problems.push(`native guide count ${actualGuideCount} differs from within-series adjacency count ${guideCount}`);}
 const title=carrier('metric-trend-title');expectedIds.add('metric-trend-title');
 if(!title?.visible||!title.text.includes(norm(visual.title??visual.question))){geometryOk=false;problems.push('native title does not own the authored title/question');}
 const unit=carrier('metric-trend-unit');expectedIds.add('metric-trend-unit');
 if(!unit?.visible||!unit.text.includes(norm(metric.unit))||!input.plan.elementMap.some(item=>item.sourcePath===pointer('/metric/unit')&&item.logicalId===metric.unit&&item.nativeId==='metric-trend-unit'&&item.kind==='metric-reference')){geometryOk=false;problems.push('table unit carrier does not visibly own the exact mapped source unit');}
 const plotUnit=carrier('metric-trend-plot-unit');expectedIds.add('metric-trend-plot-unit');
 if(!plotUnit?.visible||!plotUnit.text.includes(norm(metric.unit))||!input.plan.elementMap.some(item=>item.sourcePath===pointer('/metric/unit')&&item.logicalId===metric.unit&&item.nativeId==='metric-trend-plot-unit'&&item.kind==='metric-reference')){geometryOk=false;problems.push('plot-side unit carrier does not visibly own the exact mapped source unit');}
 const dateHeader=carrier('metric-trend-date-header');expectedIds.add('metric-trend-date-header');
 if(!dateHeader?.visible||!dateHeader.text.includes('Date')){geometryOk=false;problems.push('date-column header is not visible');}
 if(metric.good!==undefined){const good=carrier('metric-trend-good');expectedIds.add('metric-trend-good');if(!good?.visible||!good.text.includes('Better: '+metric.good)){geometryOk=false;problems.push('global good-direction cue is not visibly source-owned');}}
 const guideNote=carrier('metric-trend-guide-note');expectedIds.add('metric-trend-guide-note');
 if(!guideNote?.visible||!guideNote.text.includes('no intermediate measurements are implied')){geometryOk=false;problems.push('straight guide lines lack their visible no-intermediate-measurements caveat');}
 if(visual.takeaway!==undefined){const takeaway=carrier('metric-trend-takeaway');expectedIds.add('metric-trend-takeaway');if(!takeaway?.visible||!takeaway.text.includes(norm(visual.takeaway))){geometryOk=false;problems.push('authored takeaway is not visibly source-owned');}}
 for(const[index,note]of(visual.omissions??[]).entries()){const id=`metric-trend-note-${index+1}`,item=carrier(id);expectedIds.add(id);if(!item?.visible||!item.text.includes(norm(note))){geometryOk=false;problems.push(`authored caveat ${index} is not visible in its mapped native carrier`);}}
 const dateTickMaps=input.plan.elementMap.filter(item=>item.sourcePath===pointer('/metric/axis/kind')&&/^metric-trend-date-tick-\d+$/u.test(item.nativeId)).map(item=>({item,index:Number(item.nativeId.split('-').at(-1)),day:utcCalendarDay(item.logicalId)})).sort((a,b)=>a.index-b.index);
 if(dateTickMaps.length<(firstDay===lastDay?1:2)||dateTickMaps.some((row,index)=>row.index!==index+1||row.day===undefined||utcCalendarDate(row.day)!==row.item.logicalId)||dateTickMaps[0]?.day!==firstDay||dateTickMaps.at(-1)?.day!==lastDay||dateTickMaps.some((row,index)=>index>0&&row.day!<=dateTickMaps[index-1]!.day!)){geometryOk=false;problems.push('date tick source maps do not identify a strictly increasing set of exact UTC dates covering the plot endpoints');}
 for(const{item,index,day}of dateTickMaps){
  if(day===undefined)continue;const id=item.nativeId,tick=carrier(id),mark=segment(`metric-trend-x-tick-${index}`),date=utcCalendarDate(day),expectedX=lastDay===firstDay?(left+right)/2:left+(day-firstDay)/(lastDay-firstDay)*(right-left);expectedIds.add(id);expectedIds.add(`metric-trend-x-tick-${index}`);
  if(!tick?.visible||!date||tick.text!==date.slice(5)||!mark||!near((tick.box.x+tick.box.width/2),expectedX,4)||!near((mark.start.x+mark.end.x)/2,expectedX,3)){geometryOk=false;problems.push(`date tick ${index} does not own its exact UTC month/day at its affine date position`);}
 }
 const decimals=metric.format?.kind==='number'?metric.format.decimals:undefined;
 if(scale)for(const[index,value]of scale.ticks.entries()){
  const labelId=`metric-trend-y-tick-${index+1}`,grid=segment(`metric-trend-y-grid-${index+1}`),label=carrier(labelId),expectedY=bottom-(value-scale.min)/(scale.max-scale.min)*(bottom-top);expectedIds.add(labelId);expectedIds.add(`metric-trend-y-grid-${index+1}`);
  if(!label?.visible||label.text!==displayNumber(value,decimals)||!grid||!near((grid.start.y+grid.end.y)/2,expectedY,4)){geometryOk=false;problems.push(`raw-value tick ${index} does not own its exact displayed value on the shared y scale`);}
 }
 const missing=Array.from(new Set([...expectedIds,...input.plan.elementMap.map(item=>item.nativeId)])).filter(id=>!carrier(id)&&!segment(id));if(missing.length){geometryOk=false;problems.push(`mapped native carriers are absent: ${missing.slice(0,8).join(', ')}`);}
 const actualDateRows=dom.carriers.filter(item=>/^metric-trend-date-row-d\d+$/u.test(item.id)).length,actualValueCells=dom.carriers.filter(item=>/^metric-trend-point-s\d+-p\d+$/u.test(item.id)).length,actualMarkers=dom.carriers.filter(item=>/^metric-trend-marker-s\d+-p\d+$/u.test(item.id)).length;
 if(actualDateRows!==dateRowCount||actualValueCells!==allPoints.length||actualMarkers!==allPoints.length){geometryOk=false;problems.push(`table/plot carrier counts (date rows ${actualDateRows}, value cells ${actualValueCells}, markers ${actualMarkers}) do not match ${dateRowCount} stable date/tie rows and ${allPoints.length} source observations`);}
 for(const day of uniqueDays){
  const dayPoints=allPoints.filter(row=>row.day===day),multiplicity=Math.max(...series.map(item=>item.points.filter(point=>utcCalendarDay(point.at??'')===day).length)),rowIds=dayPoints.map(row=>input.plan.elementMap.find(item=>item.kind==='metric-value'&&item.sourcePath===pointer(`/metric/series/${row.seriesIndex}/points/${row.sourceIndex}/at`))?.nativeId),distinctRows=new Set(rowIds);
  const expectedRows=multiplicity>1?dayPoints.length:1;
  if(distinctRows.size!==expectedRows){geometryOk=false;problems.push(`date ${utcCalendarDate(day)} has ${distinctRows.size} source rows; expected ${expectedRows} under the stable tie-row policy`);}
  for(const rowId of distinctRows){const occupancy=rowIds.filter(candidate=>candidate===rowId).length,expectedOccupancy=multiplicity>1?1:dayPoints.length;if(occupancy!==expectedOccupancy){geometryOk=false;problems.push(`date row ${rowId} contains ${occupancy} source observations; expected ${expectedOccupancy} without cross-series tie pairing`);}}
 }
 if(series.some(item=>{const counts=new Map<number,number>();for(const point of item.points){const day=utcCalendarDay(point.at??'');if(day!==undefined)counts.set(day,(counts.get(day)??0)+1);}return[...counts.values()].some(count=>count>1);})&&!input.plan.approximations.some(item=>item.sourcePath===pointer('/metric/series')&&item.representation.includes('rows do not establish intra-day chronology or pair observations across series'))){geometryOk=false;problems.push('repeated-date presentation does not disclose that rows establish neither intra-day chronology nor cross-series pairing');}
 const allMappedIds=new Set(input.plan.elementMap.map(item=>item.nativeId));
 const unmappedSegments=dom.segments.filter(item=>/^metric-trend-guide-/u.test(item.id)&&!allMappedIds.has(item.id));
 if(unmappedSegments.length!==guideCount){geometryOk=false;problems.push('renderer-owned guide segment count is inconsistent with the source series; guides must remain distinct from authored points');}
 const dateLabel=carrier('metric-trend-date-axis-label');expectedIds.add('metric-trend-date-axis-label');
 const yearStart=utcCalendarDate(firstDay)?.slice(0,4),yearEnd=utcCalendarDate(lastDay)?.slice(0,4),yearText=yearStart===yearEnd?yearStart:`${yearStart}–${yearEnd}`;
 if(!dateLabel?.visible||!dateLabel.text.includes(`Date (${yearText}, UTC)`)||!xAxis||!near(dateLabel.center.x,(xAxis.start.x+xAxis.end.x)/2,2)||dateLabel.center.y<=Math.max(xAxis.start.y,xAxis.end.y)){geometryOk=false;problems.push('native date-axis label does not identify the UTC calendar year range centered below the plot');}
 if(visual.title!==undefined&&visual.question!==visual.title){const question=carrier('metric-trend-question');expectedIds.add('metric-trend-question');if(!question?.visible||!question.text.includes(norm(visual.question))){geometryOk=false;problems.push('native question carrier does not own the exact authored question');}}
 else if(!title?.text.includes(norm(visual.question))){geometryOk=false;problems.push('the title fallback does not preserve the exact authored question');}
 checks.push(pass(sourceSha256,'lini-native-ast',astOk,astOk?`Pinned desugared Lini source contains all ${input.plan.elementMap.length} source-map anchors for ${series.length} series and ${allPoints.length} original-index observations.`:problems.filter(item=>item.includes('desugared')||item.includes('mapping')).slice(0,10).join('; ')||'One or more native AST anchors are missing.'));
 checks.push(pass(sourceSha256,'lini-trend-series-and-date-value-geometry',geometryOk,geometryOk?`All ${allPoints.length} dated observations own exact captions and markers; markers follow the shared UTC-day/raw-value affine axes, and ${guideCount} native guide segments connect only adjacent dates within their source series.`:problems.join('; ')||'The native temporal line proof is unavailable.'));
 return checks;
}
