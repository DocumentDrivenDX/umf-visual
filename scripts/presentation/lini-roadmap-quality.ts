// SPDX-License-Identifier: MIT OR Apache-2.0
/** Source-bound geometry checks for the native categorical roadmap projection. */
import {createHash} from 'node:crypto';
import type {Page} from 'playwright';
import type {Document} from '@umf/core';
import {getVisual,type Visual} from '../../src/extensions/visual';
import type {PresentationPlan} from '../../src/presentation';
import type {PresentationQualityCheck} from './quality';

type Box={x:number;y:number;width:number;height:number};
type NativeText={text:string;bounds:Box;fontSize:number;visible:boolean};
type NativeCarrier={id:string;classes:string[];texts:NativeText[];shape:Box|null;bounds:Box};
type NativeRoadmapDom={svgBounds:Box;scaleX:number;scaleY:number;carriers:NativeCarrier[];periodGridY:number[];laneGridX:number[]};
const BASE='/extensions/umf.visual',norm=(value:string)=>value.replace(/\s+/gu,' ').trim();
const sha=(value:string)=>createHash('sha256').update(Buffer.from(value,'utf8')).digest('hex');
const pass=(check:string,sourceSha256:string,ok:boolean,details:string):PresentationQualityCheck=>({check,sourceSha256,result:ok?'pass':'fail',details});
const periodId=(index:number)=>`roadmap-period-${index+1}`,laneId=(index:number)=>`roadmap-lane-${index+1}`,spanId=(index:number)=>`roadmap-span-${index+1}`;
const labelPrefix=(index:number)=>`roadmap-span-label-${index+1}-line-`,statusId=(index:number)=>`roadmap-span-status-${index+1}`;
const contains=(outer:Box,inner:Box,tolerance=2)=>inner.x>=outer.x-tolerance&&inner.y>=outer.y-tolerance&&inner.x+inner.width<=outer.x+outer.width+tolerance&&inner.y+inner.height<=outer.y+outer.height+tolerance;
const overlaps=(a:Box,b:Box)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const sourcePath=(kind:'periods'|'lanes'|'spans',index:number,field?:string)=>`${BASE}/timeline/${kind==='periods'?'scale/periods':kind}/${index}${field?'/'+field:''}`;
const mapHas=(plan:PresentationPlan,kind:string,logicalId:string,path:string,nativeId:string)=>plan.elementMap.some(item=>item.kind===kind&&item.logicalId===logicalId&&item.sourcePath===path&&item.nativeId===nativeId);
const escaped=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
const declarationFor=(ast:string,id:string):string|undefined=>{const lines=ast.split(/\r?\n/u),start=lines.findIndex(line=>new RegExp(`^\\s*\\|block#${escaped(id)}\\|`).test(line));if(start<0)return;let end=start+1;while(end<lines.length&&!/^\s*\|(?:block|line|group)#/u.test(lines[end]!)&&!/^\s*\]\s*$/u.test(lines[end]!))end++;return lines.slice(start,end).join('\n');};
const declaredText=(declaration:string|undefined):string|undefined=>{const match=declaration?.match(/\[\s*"((?:\\.|[^"\\])*)"\s*\]/u);if(!match)return;try{return JSON.parse(`"${match[1]}"`) as string;}catch{return;}};

/** The caller inserts the renderer-produced SVG in #frame before this check. */
export async function verifyLiniRoadmapPresentationQuality(page:Page,input:{document:Document;plan:PresentationPlan;nativeAst:unknown}):Promise<PresentationQualityCheck[]>{
 const sourceSha256=sha(input.plan.source),checkName='lini-roadmap-period-lane-span-ownership';let visual:Visual|undefined;
 try{visual=getVisual(input.document);}catch{/* A malformed input is reported as failed checks below. */}
 if(!visual||visual.kind!=='timeline'||visual.form!=='roadmap'||!visual.timeline||visual.timeline.scale.kind!=='period')return[pass('lini-native-ast',sourceSha256,false,'The document is not a readable period-roadmap payload.'),pass('lini-native-carriers',sourceSha256,false,'The document is not a readable period-roadmap payload.'),pass(checkName,sourceSha256,false,'The document is not a readable period-roadmap payload.')];
 const periods=visual.timeline.scale.periods,lanes=visual.timeline.lanes??[],spans=visual.timeline.spans??[],nativeAst=typeof input.nativeAst==='string'?input.nativeAst:'';
 const problems:string[]=[],astProblems:string[]=[];
 const expectedMaps:Array<{kind:string;logicalId:string;path:string;nativeId:string}>=[
  {kind:'visual',logicalId:visual.id,path:`${BASE}/id`,nativeId:'roadmap-title'},
  {kind:'visual',logicalId:visual.id,path:`${BASE}/${visual.title!==undefined?'title':'question'}`,nativeId:'roadmap-title'},
 ];
 if(visual.title!==undefined&&visual.question!==visual.title)expectedMaps.push({kind:'visual',logicalId:visual.id,path:`${BASE}/question`,nativeId:'roadmap-question'});
 if(visual.takeaway!==undefined)expectedMaps.push({kind:'visual',logicalId:visual.id,path:`${BASE}/takeaway`,nativeId:'roadmap-takeaway'});
 periods.forEach((period,index)=>{const id=periodId(index);expectedMaps.push({kind:'period',logicalId:period.id,path:sourcePath('periods',index),nativeId:id},{kind:'period',logicalId:period.id,path:sourcePath('periods',index,'id'),nativeId:id},{kind:'period',logicalId:period.id,path:sourcePath('periods',index,'label'),nativeId:id});});
 lanes.forEach((lane,index)=>{const id=laneId(index);expectedMaps.push({kind:'lane',logicalId:lane.id,path:sourcePath('lanes',index),nativeId:id},{kind:'lane',logicalId:lane.id,path:sourcePath('lanes',index,'id'),nativeId:id},{kind:'lane',logicalId:lane.id,path:sourcePath('lanes',index,'label'),nativeId:id});});
 spans.forEach((span,index)=>{const id=spanId(index);expectedMaps.push({kind:'span',logicalId:span.id,path:sourcePath('spans',index),nativeId:id});for(const field of ['id','start','end','lane'] as const)expectedMaps.push({kind:'span',logicalId:span.id,path:sourcePath('spans',index,field),nativeId:id});const lineCount=input.plan.elementMap.filter(item=>item.kind==='span'&&item.logicalId===span.id&&item.sourcePath===sourcePath('spans',index,'label')).length;for(let line=0;line<lineCount;line++)expectedMaps.push({kind:'span',logicalId:span.id,path:sourcePath('spans',index,'label'),nativeId:`${labelPrefix(index)}${line+1}`});if(span.status!==undefined)expectedMaps.push({kind:'span',logicalId:span.id,path:sourcePath('spans',index,'status'),nativeId:statusId(index)});});
 if(input.plan.elementMap.length!==expectedMaps.length)problems.push(`element map has ${input.plan.elementMap.length-expectedMaps.length} unexpected or missing native roadmap mapping rows`);
 for(const expected of expectedMaps)if(!mapHas(input.plan,expected.kind,expected.logicalId,expected.path,expected.nativeId))problems.push(`source map does not bind ${expected.path} (${expected.logicalId}) to ${expected.nativeId}`);
 for(const item of input.plan.elementMap){const isSpanShape=item.kind==='span'&&!item.sourcePath.endsWith('/label')&&!item.sourcePath.endsWith('/status'),declaration=new RegExp(`^\\s*\\|block#${escaped(item.nativeId)}\\|([^\\n]*)`,'mu').exec(nativeAst)?.[0];if(!declaration)astProblems.push(`${item.nativeId} has no native block declaration`);else if(isSpanShape&&!declaration.includes('.lini-box'))astProblems.push(`${item.nativeId} has no native box shape class`);}
 let astOk=nativeAst.trim().length>0&&astProblems.length===0&&expectedMaps.every(item=>mapHas(input.plan,item.kind,item.logicalId,item.path,item.nativeId));
 let dom:NativeRoadmapDom|undefined;
 try{dom=await page.locator('#frame svg').first().evaluate((root,counts)=>{
  const svg=root as SVGSVGElement,origin=svg.getBoundingClientRect(),box=(element:Element):Box=>{const r=element.getBoundingClientRect();return{x:r.x-origin.x,y:r.y-origin.y,width:r.width,height:r.height};};
  const visible=(element:Element)=>{let current:Element|null=element;while(current&&current!==svg){const style=getComputedStyle(current);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;current=current.parentElement;}return true;};
  const textOf=(element:Element):NativeText[]=>[...element.querySelectorAll(':scope > text.lini-text')].map(text=>({text:(text.textContent??'').replace(/\s+/gu,' ').trim(),bounds:box(text),fontSize:Number.parseFloat(getComputedStyle(text).fontSize)||0,visible:visible(text)&&box(text).width>0&&box(text).height>0})).filter(item=>item.text);
  const carriers=[...svg.querySelectorAll('g.lini-node[data-id]')].map(element=>{const group=element as SVGGElement,shape=group.querySelector(':scope > rect,:scope > polygon,:scope > ellipse,:scope > circle'),line=group.querySelector(':scope > line'),bounds=box(group),shapeBounds=shape?box(shape):null;return{id:group.dataset.id??'',classes:[...group.classList],texts:textOf(group),shape:shapeBounds,bounds:shapeBounds??(line?box(line):bounds)};});
  const lineCoordinate=(id:string,axis:'x'|'y')=>{const group=carriers.find(item=>item.id===id),line=group&&svg.querySelector(`g[data-id="${CSS.escape(id)}"] > line`) as SVGLineElement|null;if(!group||!line)return undefined;const matrix=line.getScreenCTM();if(!matrix)return undefined;const first=new DOMPoint(Number(line.getAttribute('x1')),Number(line.getAttribute('y1'))).matrixTransform(matrix),second=new DOMPoint(Number(line.getAttribute('x2')),Number(line.getAttribute('y2'))).matrixTransform(matrix);return ((first[axis]+second[axis])/2)-(axis==='x'?origin.x:origin.y);};
  const periodGridY=Array.from({length:counts.periods+1},(_,index)=>lineCoordinate(`roadmap-period-grid-${index+1}`,'y')).filter((value):value is number=>value!==undefined),laneGridX=Array.from({length:counts.lanes+1},(_,index)=>lineCoordinate(`roadmap-lane-grid-${index+1}`,'x')).filter((value):value is number=>value!==undefined);
  const matrix=svg.getScreenCTM();return{svgBounds:box(svg),scaleX:matrix?.a??NaN,scaleY:matrix?.d??NaN,carriers,periodGridY,laneGridX};
 },{periods:periods.length,lanes:lanes.length});}catch{/* Missing native SVG becomes a failed proof below. */}
 const carrier=(id:string)=>dom?.carriers.find(item=>item.id===id),svgOk=!!dom&&dom.svgBounds.width>0&&dom.svgBounds.height>0;
 for(const native of dom?.carriers??[]){const declaration=declarationFor(nativeAst,native.id),text=declaredText(declaration),visibleTexts=native.texts.filter(item=>item.visible).map(item=>item.text);if(visibleTexts.length===1&&text!==visibleTexts[0])astProblems.push(`${native.id} desugared text does not match its actual SVG glyph`);if(visibleTexts.length>1)astProblems.push(`${native.id} unexpectedly combines multiple text glyphs in one mapped carrier`);}
 astOk=nativeAst.trim().length>0&&astProblems.length===0&&expectedMaps.every(item=>mapHas(input.plan,item.kind,item.logicalId,item.path,item.nativeId));
 let carrierOk=svgOk&&problems.length===0;
 if(!svgOk)problems.push('native roadmap SVG is missing or has no usable viewport');
 const expectedBars=new Set(spans.map((_span,index)=>spanId(index))),nativeBars=new Set((dom?.carriers??[]).filter(item=>item.classes.includes('lini-box')).map(item=>item.id));
 if(nativeBars.size!==expectedBars.size||[...nativeBars].some(id=>!expectedBars.has(id)))problems.push(`native interval bar IDs (${nativeBars.size}) do not exactly match the ${expectedBars.size} source span IDs`);
 if(dom&& (dom.periodGridY.length!==periods.length+1||dom.laneGridX.length!==lanes.length+1))problems.push('native period/lane grid does not expose every categorical cell boundary');
 if(dom?.periodGridY.some((value,index)=>!Number.isFinite(value)||index>0&&value<=dom.periodGridY[index-1]!))problems.push('native period grid boundaries are not finite and strictly ordered');
 if(dom?.laneGridX.some((value,index)=>!Number.isFinite(value)||index>0&&value<=dom.laneGridX[index-1]!))problems.push('native lane grid boundaries are not finite and strictly ordered');
 const title=visual.title??visual.question,titleCarrier=carrier('roadmap-title'),titleText=titleCarrier?.texts.filter(item=>item.visible).map(item=>item.text).join(' ');
 if(!mapHas(input.plan,'visual',visual.id,`${BASE}/id`,'roadmap-title')||!mapHas(input.plan,'visual',visual.id,`${BASE}/${visual.title!==undefined?'title':'question'}`,'roadmap-title')||norm(titleText??'')!==norm(title))problems.push('native title does not own its exact source text and identity mapping');
 if(visual.title!==undefined&&visual.question!==visual.title){const question=carrier('roadmap-question'),text=question?.texts.filter(item=>item.visible).map(item=>item.text).join(' ');if(!mapHas(input.plan,'visual',visual.id,`${BASE}/question`,'roadmap-question')||norm(text??'')!==norm(visual.question))problems.push('native question does not own its exact source text and identity mapping');}
 if(visual.takeaway!==undefined){const takeaway=carrier('roadmap-takeaway'),text=takeaway?.texts.filter(item=>item.visible).map(item=>item.text).join(' ');if(!mapHas(input.plan,'visual',visual.id,`${BASE}/takeaway`,'roadmap-takeaway')||norm(text??'')!==norm(visual.takeaway))problems.push('native takeaway does not own its exact source text and identity mapping');}
 const periodCenters:number[]=[],laneCenters:number[]=[];
 periods.forEach((period,index)=>{const id=periodId(index),found=carrier(id),text=found?.texts.filter(item=>item.visible).map(item=>item.text).join(' ');if(!found||norm(text??'')!==norm(period.label))problems.push(`period ${period.id} does not own its exact visible label`);if(found&&!found.shape)problems.push(`period ${period.id} has no native text carrier`);if(found){const center=found.bounds.y+found.bounds.height/2;periodCenters.push(center);const top=dom?.periodGridY[index],bottom=dom?.periodGridY[index+1],expected=top!==undefined&&bottom!==undefined?(top+bottom)/2:undefined;if(expected===undefined||Math.abs(center-expected)>2)problems.push(`period ${period.id} label is not centered in its mapped source-order row`);if(found.texts.some(item=>item.visible&&!contains(dom!.svgBounds,item.bounds,1)))problems.push(`period ${period.id} is clipped by the native SVG`);}});
 lanes.forEach((lane,index)=>{const id=laneId(index),found=carrier(id),text=found?.texts.filter(item=>item.visible).map(item=>item.text).join(' ');if(!found||norm(text??'')!==norm(lane.label))problems.push(`lane ${lane.id} does not own its exact visible label`);if(found){laneCenters.push(found.bounds.x+found.bounds.width/2);if(found.texts.some(item=>item.visible&&!contains(dom!.svgBounds,item.bounds,1)))problems.push(`lane ${lane.id} is clipped by the native SVG`);const left=dom?.laneGridX[index],right=dom?.laneGridX[index+1],expectedInset=4*(dom?.scaleX??NaN);if(left===undefined||right===undefined||!Number.isFinite(expectedInset)||Math.abs((found.bounds.x-left)-expectedInset)>2||Math.abs((right-(found.bounds.x+found.bounds.width))-expectedInset)>2)problems.push(`lane ${lane.id} header does not span its full authored lane column`);}});
 if(periodCenters.some((value,index)=>index>0&&value<=periodCenters[index-1]!))problems.push('period rows do not follow declared source order from top to bottom');
 if(laneCenters.some((value,index)=>index>0&&value<=laneCenters[index-1]!))problems.push('lane columns do not follow declared source order from left to right');
 const periodById=new Map(periods.map((period,index)=>[period.id,index])),laneById=new Map(lanes.map((lane,index)=>[lane.id,index]));
 spans.forEach((span,index)=>{
  const id=spanId(index),bar=carrier(id),start=periodById.get(span.start),end=periodById.get(span.end),lane=laneById.get(span.lane??'');
  if(!bar?.shape||!bar.classes.includes('lini-box')){problems.push(`span ${span.id} has no owned native interval bar`);return;}
  if(start===undefined||end===undefined||lane===undefined){problems.push(`span ${span.id} does not resolve to its authored period/lane declarations`);return;}
  const labelItems=input.plan.elementMap.filter(item=>item.kind==='span'&&item.logicalId===span.id&&item.sourcePath===sourcePath('spans',index,'label')).map(item=>({item,native:carrier(item.nativeId)})).sort((a,b)=>Number(a.item.nativeId.split('-line-').at(-1))-Number(b.item.nativeId.split('-line-').at(-1)));
  const labelTexts=labelItems.flatMap(({native})=>native?.texts.filter(text=>text.visible).map(text=>text.text)??[]),recovered=norm(labelTexts.join(' '));
  if(!labelItems.length||recovered!==norm(span.label))problems.push(`span ${span.id} label lines do not reconstruct the exact authored label`);
  for(const {item,native} of labelItems){if(item.logicalId!==span.id||!native||!native.texts.some(text=>text.visible&&text.text.length>0))problems.push(`span ${span.id} label source mapping has no visible native text`);else if(native.texts.some(text=>text.visible&&(!contains(dom!.svgBounds,text.bounds,1)||!contains(bar.shape!,text.bounds,2))))problems.push(`span ${span.id} label is clipped or not contained in its native bar`);else if(native.texts.some(text=>text.visible&&text.fontSize<14))problems.push(`span ${span.id} label font is below the qualified readable native size`);}
  const status=span.status===undefined?undefined:carrier(statusId(index)),statusText=status?.texts.filter(item=>item.visible).map(item=>item.text).join(' ');
  if(span.status!==undefined){if(!mapHas(input.plan,'span',span.id,sourcePath('spans',index,'status'),statusId(index))||norm(statusText??'')!==norm(span.status))problems.push(`span ${span.id} does not own its exact visible status`);if(status?.texts.some(text=>text.visible&&(!contains(dom!.svgBounds,text.bounds,1)||!contains(bar.shape!,text.bounds,2)||text.fontSize<12)))problems.push(`span ${span.id} status is clipped, too small, or outside its bar`);}
  const laneLeft=dom?.laneGridX[lane],laneRight=dom?.laneGridX[lane+1];if(laneLeft===undefined||laneRight===undefined||bar.shape.x<laneLeft-2||bar.shape.x+bar.shape.width>laneRight+2)problems.push(`span ${span.id} bar is outside its mapped lane column`);if(Math.abs(bar.shape.width-284*(dom?.scaleX??NaN))>2)problems.push(`span ${span.id} bar width differs from its native 284-unit track inset after measured SVG scaling`);
  const firstBoundary=dom?.periodGridY[start],lastBoundary=dom?.periodGridY[end+1],top=bar.shape.y,bottom=bar.shape.y+bar.shape.height;
  const expectedPeriodInset=4*(dom?.scaleY??NaN);if(firstBoundary===undefined||lastBoundary===undefined||!Number.isFinite(expectedPeriodInset)||Math.abs((top-firstBoundary)-expectedPeriodInset)>2||Math.abs((lastBoundary-bottom)-expectedPeriodInset)>2)problems.push(`span ${span.id} does not occupy its inclusive start/end period cells`);
  if(bar.shape.width<10||bar.shape.height<10)problems.push(`span ${span.id} has a zero or unusable native interval area`);
  const containedTexts=[...labelItems.map(({native})=>native),status].filter((item):item is NativeCarrier=>!!item).flatMap(item=>item.texts.filter(text=>text.visible));
  for(let left=0;left<containedTexts.length;left++)for(let right=left+1;right<containedTexts.length;right++)if(overlaps(containedTexts[left]!.bounds,containedTexts[right]!.bounds))problems.push(`span ${span.id} label and status glyph bounds overlap`);
 });
 const spanGroups=new Map<string,Box[]>();
 const allSpanBoxes:Box[]=[];
 spans.forEach((span,index)=>{const id=spanId(index),bar=carrier(id)?.shape;if(!bar)return;allSpanBoxes.push(bar);const key=span.lane??'';spanGroups.set(key,[...(spanGroups.get(key)??[]),bar]);});
 for(const[lane,boxes]of spanGroups)for(let left=0;left<boxes.length;left++)for(let right=left+1;right<boxes.length;right++)if(overlaps(boxes[left]!,boxes[right]!))problems.push(`span intervals overlap within lane ${lane}`);
 for(let left=0;left<allSpanBoxes.length;left++)for(let right=left+1;right<allSpanBoxes.length;right++)if(overlaps(allSpanBoxes[left]!,allSpanBoxes[right]!))problems.push('native span bar shapes overlap across source records');
 if(input.plan.approximations.every(item=>item.sourcePath!==`${BASE}/timeline`||!item.representation.includes('categorical')||!item.representation.includes('inclusive')))problems.push('the categorical period scale and inclusive-span policy are not disclosed');
 const qualityOk=carrierOk&&problems.length===0;
 return[
  pass('lini-native-ast',sourceSha256,astOk,astOk?`Pinned Lini desugared source contains native declarations for all ${expectedMaps.length} source-bound roadmap mappings.`:astProblems.slice(0,12).join('; ')||'Native declarations or exact source-map ownership are incomplete.'),
  pass('lini-native-carriers',sourceSha256,svgOk,svgOk?'The inserted pinned native SVG has a measurable viewport.':'The inserted pinned native SVG is unavailable.'),
  pass(checkName,sourceSha256,qualityOk,qualityOk?`All ${periods.length} ordered period rows, ${lanes.length} lane columns, and ${spans.length} source spans preserve visible text ownership and actual inclusive cell geometry; labels/statuses fit within their native bars. Categorical spacing is disclosed without date/duration or causal meaning.`:problems.join('; ')||'The native roadmap proof is unavailable.')
 ];
}
