// SPDX-License-Identifier: MIT OR Apache-2.0
/** Native Lini proof for source-bound comparison quadrant marks and axes. */
import {createHash} from 'node:crypto';
import type {Page} from 'playwright';
import type {Document} from '@umf/core';
import {getVisual,type Visual} from '../../src/extensions/visual';
import type {PresentationElement,PresentationPlan} from '../../src/presentation';
import type {PresentationQualityCheck} from './quality';

const BASE='/extensions/umf.visual';
const sha=(source:string)=>createHash('sha256').update(Buffer.from(source,'utf8')).digest('hex');
const norm=(value:string)=>value.replace(/\s+/g,' ').trim();
const pass=(check:string,sourceSha256:string,ok:boolean,details:string):PresentationQualityCheck=>({check,sourceSha256,result:ok?'pass':'fail',details});
const element=(plan:PresentationPlan,kind:PresentationElement['kind'],sourcePath:string)=>plan.elementMap.find(item=>item.kind===kind&&item.sourcePath===BASE+sourcePath);
const hexRgb=(value:string):[number,number,number]|undefined=>{const match=value.match(/^#([0-9a-f]{6})$/i);if(!match)return undefined;return[parseInt(match[1]!.slice(0,2),16),parseInt(match[1]!.slice(2,4),16),parseInt(match[1]!.slice(4,6),16)];};
const contrastOnWhite=(value:string)=>{const rgb=hexRgb(value);if(!rgb)return 0;const linear=rgb.map(channel=>{const v=channel/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return 1.05/(.2126*linear[0]!+.7152*linear[1]!+.0722*linear[2]!);};

/** The caller has inserted the exact pinned-runtime SVG into the page. */
export async function verifyLiniQuadrantPresentationQuality(
 page:Page,
 input:{document:Document;plan:PresentationPlan;nativeAst:unknown},
):Promise<PresentationQualityCheck[]>{
 const {document,plan}=input,sourceSha256=sha(plan.source),checks:PresentationQualityCheck[]=[];
 let visual:Visual|undefined;try{visual=getVisual(document);}catch{/* reported as a failed scope */}
 const comparison=visual?.kind==='comparison'&&visual.form==='quadrant'?visual.comparison:undefined;
 if(!visual||!comparison||plan.backend!=='lini'){
  const details='The native quadrant proof requires a comparison/quadrant source and a Lini plan.';
  return[pass('lini-native-ast',sourceSha256,false,details),pass('lini-native-carriers',sourceSha256,false,details),pass('lini-quadrant-coordinate-ownership',sourceSha256,false,details)];
 }
 const axes=comparison.axes,x=axes&&comparison.criteria.find(item=>item.id===axes.x),y=axes&&comparison.criteria.find(item=>item.id===axes.y),nativeAst=typeof input.nativeAst==='string'?input.nativeAst:'';
 const astProblems:string[]=[],carrierProblems:string[]=[],geometryProblems:string[]=[];
 const ratingMap=new Map(comparison.values.map(value=>[JSON.stringify([value.item,value.criterion]),value]));
 const pointLabel=(item:NonNullable<typeof comparison.items[number]>)=>{
  const xValue=ratingMap.get(JSON.stringify([item.id,axes?.x]))!,yValue=ratingMap.get(JSON.stringify([item.id,axes?.y]))!;
  return[item.label+` (${xValue.rating}, ${yValue.rating})`,item.detail,xValue.note===undefined?undefined:x?.label+' note: '+xValue.note,yValue.note===undefined?undefined:y?.label+' note: '+yValue.note].filter((part):part is string=>part!==undefined).join('\n');
 };
 const expectedSourcePaths=new Map<string,{kind:PresentationElement['kind'];nativeId:string;logicalId:string}>();
 const expectMap=(kind:PresentationElement['kind'],sourcePath:string,nativeId:string,logicalId=visual?.id??'')=>expectedSourcePaths.set(BASE+sourcePath,{kind,nativeId,logicalId});
 const titleId='quadrant-chart';
 expectMap('visual','/id',titleId,visual.id);expectMap('visual',visual.title!==undefined?'/title':'/question',titleId,visual.id);
 if(visual.title!==undefined&&visual.title!==visual.question)expectMap('visual','/question','quadrant-question',visual.id);
 if(axes&&x&&y){
  const xIndex=comparison.criteria.indexOf(x),yIndex=comparison.criteria.indexOf(y);
  expectMap('comparison-criterion','/comparison/axes/x','quadrant-x-axis',x.id);expectMap('comparison-criterion','/comparison/axes/y','quadrant-y-axis',y.id);
  for(const [criterion,index,axisId,anchorId] of [[x,xIndex,'quadrant-x-axis','quadrant-x-anchors'],[y,yIndex,'quadrant-y-axis','quadrant-y-anchors']] as const){
   for(const field of ['id','label','max'] as const)if(criterion[field]!==undefined)expectMap('comparison-criterion',`/comparison/criteria/${index}/${field}`,axisId,criterion.id);
   for(const field of ['measure','low','high','detail'] as const)if(criterion[field]!==undefined)expectMap('comparison-criterion',`/comparison/criteria/${index}/${field}`,anchorId,criterion.id);
  }
  const valueRows=new Map(comparison.values.map((value,index)=>[JSON.stringify([value.item,value.criterion]),index]));
  comparison.items.forEach((item,index)=>{
   const nativeId=`quadrant-item-${index+1}`;expectMap('comparison-item',`/comparison/items/${index}/id`,nativeId,item.id);expectMap('comparison-item',`/comparison/items/${index}/label`,nativeId,item.id);
   if(item.detail!==undefined)expectMap('comparison-item',`/comparison/items/${index}/detail`,nativeId,item.id);
   for(const criterionId of [axes.x,axes.y]){const rowIndex=valueRows.get(JSON.stringify([item.id,criterionId]));if(rowIndex===undefined){geometryProblems.push(`source rating ${item.id}/${criterionId} is absent`);continue;}const valueLogicalId=JSON.stringify([item.id,criterionId]);expectMap('comparison-value',`/comparison/values/${rowIndex}/rating`,nativeId,valueLogicalId);const value=comparison.values[rowIndex]!;if(value.note!==undefined)expectMap('comparison-value',`/comparison/values/${rowIndex}/note`,nativeId,valueLogicalId);if(value.item!==item.id||value.criterion!==criterionId)geometryProblems.push(`source value mapping for ${valueLogicalId} is inconsistent`);}
  });
  if(comparison.chosen){const chosen=comparison.items.find(item=>item.id===comparison.chosen!.item);if(chosen){expectMap('comparison-choice','/comparison/chosen/item','quadrant-choice',chosen.id);expectMap('comparison-choice','/comparison/chosen/reason','quadrant-choice',chosen.id);}}
  if(visual.takeaway!==undefined)expectMap('visual','/takeaway','quadrant-takeaway',visual.id);
  for(const [index] of (visual.omissions??[]).entries())expectMap('annotation',`/omissions/${index}`,`quadrant-caveat-${index+1}`,visual.id);
  for(const [index,annotation] of (visual.annotations??[]).entries()){expectMap('annotation',`/annotations/${index}/id`,`quadrant-annotation-${index+1}`,annotation.id);expectMap('annotation',`/annotations/${index}/text`,`quadrant-annotation-${index+1}`,annotation.id);}
 }else geometryProblems.push('the authored x/y axes do not resolve to two declared criteria');

 const mapProblems:string[]=[];
 for(const [sourcePath,expected] of expectedSourcePaths){const found=plan.elementMap.filter(item=>item.sourcePath===sourcePath&&item.kind===expected.kind);if(found.length!==1||found[0]!.nativeId!==expected.nativeId||found[0]!.logicalId!==expected.logicalId)mapProblems.push(`${sourcePath} must map once to ${expected.nativeId} as ${expected.kind} for logical ID ${expected.logicalId}`);}
 const unexpected=plan.elementMap.filter(item=>(item.kind.startsWith('comparison-')||item.kind==='annotation'&&item.sourcePath.startsWith(BASE+'/omissions/'))&&!expectedSourcePaths.has(item.sourcePath));
 if(unexpected.length)mapProblems.push(`unexpected source map rows: ${unexpected.map(item=>item.sourcePath).join(', ')}`);
 const allMappedExpected=[...expectedSourcePaths.keys()];
 for(const sourcePath of allMappedExpected)if(!plan.elementMap.some(item=>item.sourcePath===sourcePath))mapProblems.push(`missing map row ${sourcePath}`);

 const nativeTokens:string[]=[];
 const nativeDeclaration=(id:string)=>{const start=nativeAst.indexOf(`#${id}|`);if(start<0)return'';const end=nativeAst.slice(start+id.length+2).search(/\n\s*\|(?:[A-Za-z*-]+|block)#/u);return nativeAst.slice(start,end<0?undefined:start+id.length+2+end);};
 if(!x||!y||!axes)astProblems.push('authored axes are unavailable');
 else{
  for(const [id,criterion,side] of [['quadrant-x-axis',x,'bottom'],['quadrant-y-axis',y,'left']] as const){
   const declaration=nativeDeclaration(id);
   if(!declaration||!declaration.includes(`range: 0 ${criterion.max}`)||!declaration.includes(`side: ${side}`)||!declaration.includes(`ticks: 0, ${criterion.max}`))astProblems.push(`${id} lacks its authored label/rating range/two endpoint ticks`);
   if(!declaration.includes('.lini-axis')||!declaration.includes(`[ "${criterion.label}" ]`))astProblems.push(`${id} does not own the exact criterion label`);
   nativeTokens.push(id);
  }
  const scaffold=nativeDeclaration('quadrant-renderer-scaffold');
  if(!scaffold.includes('data: 0 0, 0 0')||!scaffold.includes('marker: none')||!scaffold.includes('stroke: none')||!scaffold.includes('stroke-width: 0'))astProblems.push('the chart-only scaffold is not a duplicate-origin, zero-width, markerless series');
  for(const [index,item] of comparison.items.entries()){
   const nativeId=`quadrant-item-${index+1}`,xv=ratingMap.get(JSON.stringify([item.id,axes.x]))?.rating,yv=ratingMap.get(JSON.stringify([item.id,axes.y]))?.rating;
   const declaration=nativeDeclaration(nativeId);
   const expectedLabel=`${item.label} (${xv}, ${yv})`;
   if(!declaration||!declaration.includes('.lini-mark')||!declaration.includes(`at: ${xv} ${yv}`)||!declaration.includes('axis: quadrant-y-axis')||!declaration.includes('marker: circle')||!declaration.includes('fill: #304652')||!norm(declaration).includes(norm(expectedLabel)))astProblems.push(`${nativeId} does not bind its exact item label, numeric coordinate, dark marker, and authored axes`);
   nativeTokens.push(nativeId);
  }
 }
 const addNativeTextCheck=(sourcePath:string,nativeId:string,expectedText:string)=>{
  const declaration=nativeDeclaration(nativeId);
  if(!declaration||expectedText.split('\n').some(part=>part&&!norm(declaration).includes(norm(part))))carrierProblems.push(`${sourcePath} exact text is absent from native owner ${nativeId}`);
  nativeTokens.push(nativeId);
 };
 if(x&&y){
  for(const [criterion,index,nativeId] of [[x,comparison.criteria.indexOf(x),'quadrant-x-anchors'],[y,comparison.criteria.indexOf(y),'quadrant-y-anchors']] as const){
   addNativeTextCheck(`/comparison/criteria/${index}/low`,nativeId,`${criterion.label} rating: 0 = low — ${criterion.low}; ${criterion.max} = high — ${criterion.high}`);
   if(criterion.detail!==undefined&&!nativeAst.includes(criterion.detail))carrierProblems.push(`criterion detail ${criterion.id} is missing from its visible anchor owner`);
  }
 }
 comparison.items.forEach((item,index)=>addNativeTextCheck(`/comparison/items/${index}/label`,`quadrant-item-${index+1}`,pointLabel(item)));
 if(comparison.chosen){const chosen=comparison.items.find(item=>item.id===comparison.chosen!.item);if(chosen)addNativeTextCheck('/comparison/chosen/reason','quadrant-choice','Authored choice: '+chosen.label+' — '+comparison.chosen.reason);}
 for(const [index,caveat] of (visual.omissions??[]).entries())addNativeTextCheck(`/omissions/${index}`,`quadrant-caveat-${index+1}`,caveat);

 const rendered=await page.locator('#frame svg').evaluate((root)=>{
  const svg=root as SVGSVGElement,chart=svg.querySelector<SVGGElement>('[data-id="quadrant-chart"]'),normalize=(s:string)=>s.replace(/\s+/g,' ').trim();
  const toScreen=(el:SVGGraphicsElement,x:number,y:number)=>{const p=new DOMPoint(x,y).matrixTransform(el.getScreenCTM()!);return{x:p.x,y:p.y};};
  const markers=[...(chart?.querySelectorAll<SVGEllipseElement>('g.lini-oval > ellipse')??[])].map(el=>{const c=toScreen(el,Number(el.getAttribute('cx')??0),Number(el.getAttribute('cy')??0)),style=getComputedStyle(el.parentElement!);return{x:c.x,y:c.y,fill:style.fill,stroke:style.stroke,strokeWidth:parseFloat(style.strokeWidth)};});
  const labels=[...(chart?.querySelectorAll<SVGTextElement>('text.lini-chart-label')??[])].map(el=>{const box=el.getBoundingClientRect(),parts=[...el.querySelectorAll('tspan')].map(span=>span.textContent??'');return{text:normalize(parts.length?parts.join(' '):el.textContent??''),x:box.x+box.width/2,y:box.y+box.height/2,width:box.width,height:box.height,fill:getComputedStyle(el).fill,fontSize:parseFloat(getComputedStyle(el).fontSize)};});
  const lines=[...(chart?.querySelectorAll<SVGLineElement>('g.lini-line > line')??[])].map(el=>{const a=toScreen(el,Number(el.getAttribute('x1')??0),Number(el.getAttribute('y1')??0)),b=toScreen(el,Number(el.getAttribute('x2')??0),Number(el.getAttribute('y2')??0)),parent=getComputedStyle(el.parentElement!);return{a,b,length:Math.hypot(b.x-a.x,b.y-a.y),stroke:parent.stroke,strokeWidth:parseFloat(parent.strokeWidth),opacity:parseFloat(parent.opacity||'1')};});
  const texts=[...svg.querySelectorAll<SVGTextElement>('text')].map(el=>{const box=el.getBoundingClientRect();return{text:normalize(el.textContent??''),className:el.getAttribute('class')??'',x:box.x,y:box.y,width:box.width,height:box.height,fontSize:parseFloat(getComputedStyle(el).fontSize),fill:getComputedStyle(el).fill};});
  const ownedBlocks=Object.fromEntries([...svg.querySelectorAll<SVGGElement>('g.lini-block[data-id]')].map(group=>[group.getAttribute('data-id')??'',normalize([...group.querySelectorAll(':scope > text')].map(el=>el.textContent??'').join(' '))]));
  return{chartExists:!!chart,markers,labels,lines,texts,ownedBlocks,legends:chart?.querySelectorAll('.lini-chart-legend,[class*="legend"]').length??0};
 });
 const colorRatio=(fill:string)=>{const match=fill.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);if(!match)return 0;const rgb=[Number(match[1]),Number(match[2]),Number(match[3])].map(channel=>{const value=channel/255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;});return 1.05/(.2126*rgb[0]!+.7152*rgb[1]!+.0722*rgb[2]!);};
 if(!rendered.chartExists)geometryProblems.push('native chart carrier is absent');
 const labels=comparison.items.map(item=>norm(pointLabel(item)));
 if(rendered.markers.length!==comparison.items.length)geometryProblems.push(`native item marker count ${rendered.markers.length} differs from ${comparison.items.length} source items`);
 if(rendered.labels.length!==labels.length||rendered.labels.some((label,index)=>label.text!==labels[index]))geometryProblems.push('native point labels do not match source item/coordinate order');
 if(rendered.markers.some(marker=>marker.fill!=='rgb(48, 70, 82)'||marker.strokeWidth>0))geometryProblems.push('native point marks are not visible dark-ink dots without stray outlines');
 if(rendered.labels.some(label=>label.fill!=='rgb(48, 70, 82)'||label.fontSize<11||colorRatio(label.fill)<4.5))geometryProblems.push('native item labels fail dark-ink contrast or minimum-size proof');
 if(x&&y){for(const criterion of [x,y])if(!rendered.texts.some(item=>item.className.includes('lini-chart-text')&&item.text===norm(criterion.label)))geometryProblems.push(`native axis title ${criterion.label} is not visible`);if(rendered.texts.filter(item=>item.className.includes('lini-chart-text')&&item.text==='0').length<2)geometryProblems.push('native axes do not visibly carry both authored zero endpoints');for(const maximum of new Set([String(x.max),String(y.max)]))if(!rendered.texts.some(item=>item.className.includes('lini-chart-text')&&item.text===maximum))geometryProblems.push(`native axes do not visibly carry authored maximum tick ${maximum}`);}
 const grid=rendered.lines.filter(line=>line.length>1&&line.stroke.includes('0.1'));
 const scaffold=rendered.lines.filter(line=>line.length<.1&&line.strokeWidth===0&&line.opacity===1);
 if(grid.length!==4)geometryProblems.push(`native plot has ${grid.length} nondegenerate boundary/grid lines; expected the four axis endpoint lines`);
 if(scaffold.length!==1)geometryProblems.push(`renderer-only chart scaffold has ${scaffold.length} visible/native zero-width line carriers`);
 if(rendered.legends!==0)geometryProblems.push('native chart unexpectedly draws a legend for renderer-owned scaffolding');
 if(grid.length===4&&rendered.markers.length===comparison.items.length&&x&&y){
  const xs=grid.flatMap(line=>[line.a.x,line.b.x]),ys=grid.flatMap(line=>[line.a.y,line.b.y]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  for(const [index,item] of comparison.items.entries()){
   const point=rendered.markers[index]!,xRating=comparison.values.find(value=>value.item===item.id&&value.criterion===axes!.x)?.rating!,yRating=comparison.values.find(value=>value.item===item.id&&value.criterion===axes!.y)?.rating!;
   const expectedX=left+(xRating/x.max!)*(right-left),expectedY=bottom-(yRating/y.max!)*(bottom-top),error=Math.hypot(point.x-expectedX,point.y-expectedY);
   if(error>3)geometryProblems.push(`${item.id} marker is ${error.toFixed(2)} CSS px from its exact 0-to-maximum axis position`);
   if(point.x<left-2||point.x>right+2||point.y<top-2||point.y>bottom+2)geometryProblems.push(`${item.id} endpoint rating marker is clipped outside the native plot`);
   const label=rendered.labels[index]!;if(Math.hypot(label.x-point.x,label.y-point.y)<4)geometryProblems.push(`${item.id} point label is obscured by its own marker`);
  }
 }
 const expectedBlocks=new Map<string,string>();
 if(visual.title!==undefined&&visual.title!==visual.question)expectedBlocks.set('quadrant-question',visual.question);
 if(x)expectedBlocks.set('quadrant-x-anchors',`${x.label} rating: 0 = low — ${x.low}; ${x.max} = high — ${x.high}${x.detail===undefined?'':' '+x.detail}`);
 if(y)expectedBlocks.set('quadrant-y-anchors',`${y.label} rating: 0 = low — ${y.low}; ${y.max} = high — ${y.high}${y.detail===undefined?'':' '+y.detail}`);
 if(comparison.chosen){const chosen=comparison.items.find(item=>item.id===comparison.chosen!.item);if(chosen)expectedBlocks.set('quadrant-choice',`Authored choice: ${chosen.label} — ${comparison.chosen.reason}`);}
 if(visual.takeaway!==undefined)expectedBlocks.set('quadrant-takeaway',visual.takeaway);
 for(const [index,caveat] of (visual.omissions??[]).entries())expectedBlocks.set(`quadrant-caveat-${index+1}`,caveat);
 for(const [index,annotation] of (visual.annotations??[]).entries())expectedBlocks.set(`quadrant-annotation-${index+1}`,annotation.text);
 for(const [id,value] of expectedBlocks){const actual=rendered.ownedBlocks[id];if(!actual||norm(actual)!==norm(value))carrierProblems.push(`${id} does not visibly own its exact authored text`);}
 const fontFloor=rendered.texts.filter(item=>item.text).every(item=>item.fontSize>=11);
 if(!fontFloor)carrierProblems.push('one or more visible chart/context text runs render below 11 CSS px');
 if(rendered.texts.some(item=>item.text&&colorRatio(item.fill)<4.5))carrierProblems.push('one or more visible chart/context text runs fall below 4.5:1 contrast against the white presentation canvas');
 const anchorText=[...expectedBlocks.values()];if(anchorText.some(value=>!rendered.texts.some(item=>norm(item.text).includes(norm(value.slice(0,Math.min(24,value.length)))))))carrierProblems.push('one or more axis anchors, authored choice, or caveats are not visible in the SVG');

 const axesOk=astProblems.length===0&&nativeTokens.every(id=>nativeAst.includes('#'+id+'|'));
 checks.push(pass('lini-native-ast',sourceSha256,axesOk,axesOk?`Pinned Lini AST retains both exact axes, all ${comparison.items.length} source-bound rating marks and one invisible zero-length chart scaffold.`:astProblems.join('; ')||'Mapped native declarations are absent.'));
 const carriersOk=mapProblems.length===0&&carrierProblems.length===0;
 checks.push(pass('lini-native-carriers',sourceSha256,carriersOk,carriersOk?`Every item, rating, criterion descriptor, axis, choice and caveat resolves to its source-mapped native owner; visible text is exact and chart labels render in high-contrast ink.`:[...mapProblems,...carrierProblems].join('; ')));
 const geometryOk=geometryProblems.length===0;
 const deviations=grid.length===4&&rendered.markers.length===comparison.items.length?comparison.items.map((item,index)=>`${item.id} ${Math.hypot(rendered.markers[index]!.x-(Math.min(...grid.flatMap(line=>[line.a.x,line.b.x]))+(comparison.values.find(value=>value.item===item.id&&value.criterion===axes!.x)!.rating!/x!.max!)*(Math.max(...grid.flatMap(line=>[line.a.x,line.b.x]))-Math.min(...grid.flatMap(line=>[line.a.x,line.b.x])))),rendered.markers[index]!.y-(Math.max(...grid.flatMap(line=>[line.a.y,line.b.y]))-(comparison.values.find(value=>value.item===item.id&&value.criterion===axes!.y)!.rating!/y!.max!)*(Math.max(...grid.flatMap(line=>[line.a.y,line.b.y]))-Math.min(...grid.flatMap(line=>[line.a.y,line.b.y]))))).toFixed(2)}px`).join(', '):'unmeasured';
 checks.push(pass('lini-quadrant-coordinate-ownership',sourceSha256,geometryOk,geometryOk?`Native dots and labels retain source order; exact rating-to-axis CSS geometry deviations are ${deviations}. The renderer scaffold has no visible stroke, mark, or legend.`:geometryProblems.join('; ')));
 return checks;
}
