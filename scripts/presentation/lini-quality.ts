// SPDX-License-Identifier: MIT OR Apache-2.0
/** Lini-specific checks over the pinned desugared source and its inserted native SVG. */
import {createHash} from 'node:crypto';
import type {Page} from 'playwright';
import type {Document} from '@umf/core';
import {getVisual,type Visual,type VisualCardinality,type VisualMultiplicity} from '../../src/extensions/visual';
import type {PresentationPlan} from '../../src/presentation';
import {directedDagRanks} from '../../src/presentation/dag-layout';
import {planDateHistoryEvents} from '../../src/presentation/timeline-layout';
import {stateTransitionCaption} from '../../src/presentation/state';
import type {PresentationQualityCheck} from './quality';
import {verifyLiniRichPresentationQuality} from './lini-rich-quality';
import {verifyLiniQuadrantPresentationQuality} from './lini-quadrant-quality';
import {verifyLiniMeterPresentationQuality} from './lini-meter-quality';
import {verifyLiniStatPresentationQuality} from './lini-stat-quality';
import {verifyLiniBarPresentationQuality} from './lini-bar-quality';
import {verifyLiniTrendPresentationQuality} from './lini-trend-quality';
import {verifyLiniBeforeAfterPresentationQuality} from './lini-before-after-quality';
import {verifyLiniMatrixPresentationQuality} from './lini-matrix-quality';
import {verifyLiniRoadmapPresentationQuality} from './lini-roadmap-quality';
import {verifyLiniNestedPresentationQuality} from './lini-nested-quality';
import {inspectLiniVisibleInk,type LiniVisibleInkReport} from './lini-visible-ink';

type Box={x:number;y:number;width:number;height:number};
type Carrier={id:string;classes:string[];texts:string[];title:string;style:string;bounds:Box;containerBounds:Box;paintedBounds:Box|null;rectRadii:number[];sheetPaths:number;sheetGeometry:Array<{bounds:Box;signature:string}>;groups:string[];parentId:string|null;cells:Array<{id:string|null;text:string;bounds:Box}>};
type Vector={x:number;y:number};
type Link={classes:string[];from:string|null;to:string|null;labels:string[];labelBounds:Box[];labelPainted:boolean[];labelClearances:number[];bounds:Box;line:{start:Vector;end:Vector;startTangent:Vector;endTangent:Vector;samples:Vector[];d:string;curveDeviation:number}|null;markers:Array<{classes:string[];tag:string;d:string;length:number;center:Vector;orientation:Vector|null;points:Vector[];bounds:Box}>;arrows:number};
type EndpointProof={path:string;carrier:Carrier;host:Carrier;side?:string};
type NativeDom={svg:boolean;svgBounds:Box;carriers:Carrier[];links:Link[];fontFamilies:Array<{text:string;inline:string;computed:string}>};
const sha=(value:string)=>createHash('sha256').update(Buffer.from(value,'utf8')).digest('hex');
const norm=(value:string)=>value.replace(/\s+/gu,' ').trim();
const stateCaptionFromSource=(transition:NonNullable<Visual['state']>['transitions'][number])=>transition.path===undefined
 ?stateTransitionCaption(transition)
 :[`Path: ${transition.path} —`,transition.event,transition.guard?`[${transition.guard}]`:undefined,transition.action?`/ ${transition.action}`:undefined].filter((part):part is string=>part!==undefined&&part!=='').join(' ');
const hasOffsetSheetPair=(sheets:Array<{bounds:Box;signature:string}>)=>{for(let i=0;i<sheets.length;i++)for(let j=i+1;j<sheets.length;j++){const {bounds:a,signature:sa}=sheets[i]!,{bounds:b,signature:sb}=sheets[j]!,offset=Math.hypot(a.x+a.width/2-b.x-b.width/2,a.y+a.height/2-b.y-b.height/2),overlapWidth=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)),overlapHeight=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)),smaller=Math.min(a.width*a.height,b.width*b.height);if(sa===sb&&offset>1&&overlapWidth*overlapHeight>=smaller*.45)return true;}return false;};
const pass=(check:string,sourceSha256:string,ok:boolean,details:string):PresentationQualityCheck=>({check,sourceSha256,result:ok?'pass':'fail',details});
const at=(part:string)=>'/extensions/umf.visual'+(part.startsWith('/')?part:'/'+part);
const inside=(point:{x:number;y:number},box:Box,tolerance=20)=>point.x>=box.x-tolerance&&point.x<=box.x+box.width+tolerance&&point.y>=box.y-tolerance&&point.y<=box.y+box.height+tolerance;
const distToBox=(point:{x:number;y:number},box:Box)=>Math.hypot(Math.max(box.x-point.x,0,point.x-box.x-box.width),Math.max(box.y-point.y,0,point.y-box.y-box.height));
const boxGap=(a:Box,b:Box)=>Math.hypot(Math.max(b.x-a.x-a.width,0,a.x-b.x-b.width),Math.max(b.y-a.y-a.height,0,a.y-b.y-b.height));
const containsBox=(outer:Box,inner:Box)=>inner.x>=outer.x-2&&inner.y>=outer.y-2&&inner.x+inner.width<=outer.x+outer.width+2&&inner.y+inner.height<=outer.y+outer.height+2;
const nativeFor=(plan:PresentationPlan,kind:string,id:string)=>plan.elementMap.find(element=>element.kind===kind&&element.logicalId===id)?.nativeId;
function outsideQuoteIndex(source:string,start:number,token:string):number{
 let quoted=false,escaped=false;
 for(let index=start;index<=source.length-token.length;index++){
  const char=source[index]!;
  if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
  if(char==='"'){quoted=true;continue;}
  if(source.startsWith(token,index))return index;
 }
 return-1;
}
function nativeTransitionCaption(source:string,from:string,to:string,nativeId:string):string|undefined{
 const token=`${from} -> ${to} .${nativeId}`,matches:number[]=[];let search=0;while(search<source.length){const start=outsideQuoteIndex(source,search,token);if(start<0)break;const after=start+token.length;if(/[\s{]/u.test(source[after]??''))matches.push(start);search=after;}if(matches.length!==1)return;const start=matches[0]!;
 const brace=outsideQuoteIndex(source,start+token.length,'{');if(brace<0)return;
 const braceEnd=matchingNativeDelimiter(source,brace,'{','}');if(braceEnd<0)return;
 let bodyStart=braceEnd+1;while(/\s/u.test(source[bodyStart]??''))bodyStart++;if(source[bodyStart]!=='[')return;
 const bodyEnd=matchingNativeDelimiter(source,bodyStart,'[',']');if(bodyEnd<0)return;
 const literal=/^\s*("(?:\\.|[^"\\])*")/su.exec(source.slice(bodyStart+1,bodyEnd))?.[1];if(!literal)return;
 try{const value=JSON.parse(literal);return typeof value==='string'?value:undefined;}catch{return;}
}
function matchingNativeDelimiter(source:string,openIndex:number,open:string,close:string):number{
 let depth=0,quoted=false,escaped=false;
 for(let index=openIndex;index<source.length;index++){
  const char=source[index]!;
  if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
  if(char==='"'){quoted=true;continue;}
  if(char===open)depth++;else if(char===close&&--depth===0)return index;
 }
 return-1;
}
type NativeBlockScope={properties:string;body:string};
function nativeMappedBlock(source:string,nativeId:string):NativeBlockScope|undefined{
 const marker=`block#${nativeId}`;let search=0,found:NativeBlockScope|undefined;
 while(search<source.length){
  const pipe=outsideQuoteIndex(source,search,'|');if(pipe<0)return found;
  const close=outsideQuoteIndex(source,pipe+1,'|');if(close<0)return found;
  const selector=source.slice(pipe+1,close);search=close+1;if(selector!==marker)continue;
  const brace=outsideQuoteIndex(source,close+1,'{');if(brace<0)return;
  const selectorClasses=source.slice(close+1,brace);
  if(!/\.lini-group\b/u.test(selectorClasses)||!/\.lini-block\b/u.test(selectorClasses))continue;
  const braceEnd=matchingNativeDelimiter(source,brace,'{','}');if(braceEnd<0)return;
  let bodyStart=braceEnd+1;while(/\s/u.test(source[bodyStart]??''))bodyStart++;
  if(source[bodyStart]!=='[')return;
  const bodyEnd=matchingNativeDelimiter(source,bodyStart,'[',']');if(bodyEnd<0)return;
  if(found)return;
  found={properties:source.slice(brace+1,braceEnd),body:source.slice(bodyStart+1,bodyEnd)};
 }
 return found;
}
function nativePropertyValues(properties:string,name:string):string[]{
 const values:string[]=[];for(const part of properties.split(';')){const match=/^\s*([\w-]+)\s*:\s*([^;]+?)\s*$/u.exec(part);if(match?.[1]===name)values.push(match[2]!);}return values;
}
function directNativeChildInventory(body:string):Array<{id?:string;caption:boolean}>{
 const children:Array<{id?:string;caption:boolean}>=[];let depth=0,quoted=false,escaped=false;
 for(let index=0;index<body.length;index++){
  const char=body[index]!;
  if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
  if(char==='"'){quoted=true;continue;}if(char==='['){depth++;continue;}if(char===']'){depth--;continue;}
  if(char==='|'&&depth===0){const close=outsideQuoteIndex(body,index+1,'|');if(close<0)break;const token=body.slice(index+1,close),id=/#([^|\s]+)$/u.exec(token)?.[1];
   const tail=body.slice(close+1,body.indexOf('[',close+1)<0?undefined:body.indexOf('[',close+1));
   children.push({id,caption:!id&&/\.lini-caption\b/u.test(tail)});index=close;
  }
 }
 return children;
}
const entityFor=(visual:Visual,node:string)=>visual.structure?.entities?.findIndex(entity=>entity.node===node)??-1;
const resolveField=(visual:Visual,node:string,fieldName?:string,fieldId?:string)=>{
 const index=entityFor(visual,node),fields=visual.structure?.entities?.[index]?.fields??[];
 return fields.findIndex(field=>(fieldId!==undefined&&field.id===fieldId)||(fieldName!==undefined&&field.name===fieldName));
};
function groupChain(visual:Visual,plan:PresentationPlan,nodeId:string):string[]{
 const groups=visual.groups??[],node=visual.nodes?.find(item=>item.id===nodeId);if(!node?.group)return[];
 const chain:string[]=[];let current=groups.find(group=>group.id===node.group);
 while(current){const native=nativeFor(plan,'group',current.id);if(!native)return[];chain.unshift(native);current=current.parent?groups.find(group=>group.id===current!.parent):undefined;}
 return chain;
}
function hasNativePeerCurveOffset(visual:Visual,plan:PresentationPlan,edge:NonNullable<Visual['edges']>[number]):boolean{
 if(visual.layout)return false;
 const groups=visual.groups??[],nodes=visual.nodes??[],pairs=new Set<string>();
 const pairFor=(candidate:NonNullable<Visual['edges']>[number])=>{
  if(candidate.routing?.kind!=='curved'||candidate.directed===false||!candidate.fromPort||!candidate.toPort)return;
  const fromNode=nodes.find(node=>node.id===candidate.from),toNode=nodes.find(node=>node.id===candidate.to),fromPort=fromNode?.ports?.find(port=>port.id===candidate.fromPort),toPort=toNode?.ports?.find(port=>port.id===candidate.toPort),from=groups.find(group=>group.id===fromNode?.group),to=groups.find(group=>group.id===toNode?.group);
  if(!from||!to||from.id===to.id||from.parent!==undefined||to.parent!==undefined||from.layout||to.layout||fromPort?.side!=='east'||toPort?.side!=='west')return;
  return{from,to,key:from.id+'\u0000'+to.id};
 };
 for(const candidate of visual.edges??[]){const pair=pairFor(candidate);if(pair)pairs.add(pair.key);}
 const pair=pairFor(edge);if(!pair||pairs.size!==1||!pairs.has(pair.key))return false;
 const native=nativeFor(plan,'group',pair.to.id),declaration=native?plan.source.split('\n').find(line=>line.trimStart().startsWith(`|group#${native}|`))??'':'';
 return declaration.includes('translate: 0 -24;');
}
function multiplicityCardinality(cardinality:VisualCardinality|undefined,multiplicity:VisualMultiplicity|undefined):VisualCardinality|undefined{
 if(!multiplicity)return cardinality;
 if(multiplicity.min===1&&multiplicity.max===1)return'exactly-one';
 if(multiplicity.min===0&&multiplicity.max===1)return'zero-or-one';
 if(multiplicity.min===0&&multiplicity.max===undefined)return'zero-or-many';
 if(multiplicity.min===1&&multiplicity.max===undefined)return'one-or-many';
 return undefined;
}
function markerMinimum(cardinality:VisualCardinality|undefined,multiplicity:VisualMultiplicity|undefined):number{
 return multiplicityCardinality(cardinality,multiplicity)?2:0;
}
function rangeText(multiplicity:VisualMultiplicity|undefined):string|undefined{
 if(!multiplicity)return;
 return multiplicity.text??`${multiplicity.min}..${multiplicity.max===undefined?'*':multiplicity.max}`;
}
function expectedReferenceLabel(reference:NonNullable<Visual['structure']>['references'] extends (infer T)[]|undefined?T:never):string{
 const from=rangeText(reference.fromMultiplicity),to=rangeText(reference.toMultiplicity);
 const exact=[from?`from ${from}`:undefined,to?`to ${to}`:undefined].filter(Boolean);
 return [reference.label,exact.length?`[${exact.join('; ')}]`:undefined].filter(Boolean).join(' ');
}
function fieldExpectedText(field:{name:string;keys?:string[];nullable?:boolean}):string{
 const badges=[...(field.keys??[]).map(key=>key.toUpperCase()),field.nullable===undefined?undefined:field.nullable?'NULL':'NOT NULL'].filter((entry):entry is string=>!!entry);
 return field.name+(badges.length?' · '+badges.join(' · '):'');
}
type ExplicitNodeShape=NonNullable<NonNullable<Visual['nodes']>[number]['shape']>;
const nativeShapeClass:Record<ExplicitNodeShape,string>={rectangle:'lini-box','rounded-rectangle':'lini-box',ellipse:'lini-oval',diamond:'lini-diamond',hexagon:'lini-hex',cylinder:'lini-cyl','folded-corner':'lini-note',parallelogram:'lini-slant',document:'lini-note','multiple-documents':'lini-note'};

/** The caller inserts the exact returned Lini SVG into `#frame` before invoking this check. */
export async function verifyLiniPresentationQuality(
 page:Page,
 input:{document:Document;plan:PresentationPlan;nativeAst:unknown},
):Promise<PresentationQualityCheck[]>{
 const {document,plan}=input,sourceSha256=sha(plan.source),checks:PresentationQualityCheck[]=[];
 let visual:Visual|undefined;try{visual=getVisual(document);}catch{/* checked below */}
 if(visual?.kind==='timeline'&&visual.form==='roadmap')return verifyLiniRoadmapPresentationQuality(page,input);
 if(visual?.kind==='structure'&&visual.form==='nested')return verifyLiniNestedPresentationQuality(page,input);
 if(visual&&(visual.kind==='sequence'||visual.kind==='structure'&&visual.form==='tree'))return verifyLiniRichPresentationQuality(page,input);
 if(visual?.kind==='comparison'&&visual.form==='quadrant')return verifyLiniQuadrantPresentationQuality(page,input);
 if(visual?.kind==='comparison'&&visual.form==='before-after')return verifyLiniBeforeAfterPresentationQuality(page,input);
 if(visual?.kind==='comparison'&&visual.form==='matrix')return verifyLiniMatrixPresentationQuality(page,input);
 if(visual?.kind==='metric'&&visual.form==='meter')return verifyLiniMeterPresentationQuality(page,input);
 if(visual?.kind==='metric'&&visual.form==='stat')return verifyLiniStatPresentationQuality(page,input);
 if(visual?.kind==='metric'&&visual.form==='bar')return verifyLiniBarPresentationQuality(page,input);
 if(visual?.kind==='metric'&&visual.form==='line')return verifyLiniTrendPresentationQuality(page,input);
 const nativeAst=typeof input.nativeAst==='string'?input.nativeAst:'';
 const maps=plan.elementMap;
 const requiredMapToken=(element:PresentationPlan['elementMap'][number]):string=>{
  if(element.kind==='edge'||element.kind==='reference'||element.kind==='transition'||element.kind==='state-path-caption')return'.'+element.nativeId;
  if(element.kind==='state-marker')return'#'+element.nativeId.split('.').at(-1);
  if(element.kind==='field'||element.kind==='port')return'#'+element.nativeId.split('.').at(-1);
  return'#'+element.nativeId;
 };
 const astAnchor=(element:PresentationPlan['elementMap'][number]):boolean=>{
  if(element.kind==='state-marker'){
   const [hostId,cellId]=element.nativeId.split('.'),hostToken=`#${hostId}|`,hostStart=nativeAst.indexOf(hostToken);
   if(hostStart<0||!cellId)return false;
   const following=nativeAst.slice(hostStart+hostToken.length).search(/#(?:n\d+|t\d+)\|/u),declaration=nativeAst.slice(hostStart,following<0?undefined:hostStart+following+hostToken.length);
   return declaration.includes(`#${cellId}|`);
  }
  if(element.kind!=='port')return nativeAst.includes(requiredMapToken(element));
  const match=element.sourcePath.match(/\/nodes\/(\d+)\/ports\/(\d+)$/),node=match?visual?.nodes?.[Number(match[1])]:undefined,port=match?node?.ports?.[Number(match[2])]:undefined;
  if(!match||!port)return false;
  const localId=element.nativeId.split('.').at(-1)!,nodeNative=nativeFor(plan,'entity',node!.id)??nativeFor(plan,'node',node!.id),nodeToken=`#${nodeNative}|`,nodeStart=nativeAst.indexOf(nodeToken);
  const nextNode=nativeAst.slice(nodeStart+nodeToken.length).search(/#n\d+\|/u),scope=nodeStart<0?'':nativeAst.slice(nodeStart,nextNode<0?undefined:nodeStart+nodeToken.length+nextNode);
  const portToken=`#${localId}|`,portStart=scope.indexOf(portToken),nextPort=scope.slice(portStart+portToken.length).search(/#p\d+\|/u),declaration=portStart<0?'':scope.slice(portStart,nextPort<0?undefined:portStart+portToken.length+nextPort);
  const side=port.side??'east',nativeSide=({north:'top',east:'right',south:'bottom',west:'left'} as const)[side];
  return !!nodeNative&&scope.includes(nodeToken)&&declaration.includes(portToken)&&declaration.includes(`pin: ${nativeSide};`);
 };
 const astMapped=!!nativeAst.trim()&&maps.length>0&&maps.every(astAnchor);
 checks.push(pass('lini-native-ast',sourceSha256,astMapped,astMapped?`Pinned desugared Lini source is nonempty and contains all ${maps.length} native identity anchors.`:`Desugared native source or one or more of ${maps.length} mapped identity anchors is missing.`));
 if(!visual){
  for(const check of ['lini-native-carriers','lini-connection-endpoints','lini-containment-and-order','lini-entity-field-rows'])checks.push(pass(check,sourceSha256,false,'The UMF document has no readable umf.visual payload.'));
  return checks;
 }

 let dom:NativeDom|undefined;
 try{
  dom=await page.locator('#frame svg').first().evaluate((root)=>{
   // Playwright serializes this callback into the page; keep its helpers local.
   const normalize=(value:string)=>value.replace(/\s+/gu,' ').trim();
   const svg=root as SVGSVGElement,origin=svg.getBoundingClientRect();
   const box=(element:Element):Box=>{const rect=element.getBoundingClientRect();return{x:rect.x-origin.x,y:rect.y-origin.y,width:rect.width,height:rect.height};};
   const paintAlpha=(value:string)=>{const color=value.trim().toLowerCase();if(!color||color==='none'||color==='transparent')return 0;if(/^#[\da-f]{3}$/u.test(color)||/^#[\da-f]{6}$/u.test(color))return 1;if(/^#[\da-f]{4}$/u.test(color))return parseInt(color[4]!,16)/15;if(/^#[\da-f]{8}$/u.test(color))return parseInt(color.slice(7),16)/255;const match=/^([a-z-]+)\(([^)]*)\)$/iu.exec(color);if(!match)return 0;const fn=match[1]!.toLowerCase(),body=match[2]!,supportsAlpha=['rgb','rgba','hsl','hsla','hwb','lab','lch','oklab','oklch','color'].includes(fn);if(!supportsAlpha)return 0;const slash=body.split('/');let alpha='1';if(slash.length>1){if(slash.length!==2)return 0;alpha=slash[1]!.trim().split(/[\s,]+/u)[0]??'1';}else{const comma=body.includes(','),parts=comma?body.split(',').map(item=>item.trim()):body.trim().split(/\s+/u);if(comma&&parts.length>=4)alpha=parts.at(-1)!;else if(!comma&&parts.length>=4&&['rgb','rgba','hsl','hsla'].includes(fn))alpha=parts.at(-1)!;}if(alpha==='none')return 0;const number=parseFloat(alpha);return Number.isFinite(number)?Math.max(0,Math.min(1,alpha.endsWith('%')?number/100:number)):0;};
   const paintedShape=(element:Element)=>{let current:Element|null=element,opacity=1;while(current){const style=getComputedStyle(current),alpha=Number.parseFloat(style.opacity||'1');if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||!Number.isFinite(alpha)||alpha<=0)return false;opacity*=alpha;current=current.parentElement;}if(opacity<=0)return false;const style=getComputedStyle(element),fill=paintAlpha(style.fill)*Number(style.fillOpacity),stroke=paintAlpha(style.stroke)*Number(style.strokeOpacity)*Number.parseFloat(style.strokeWidth||'0');return fill>0||stroke>0;};
   const paintedText=(element:Element)=>{const walker=globalThis.document.createTreeWalker(element,NodeFilter.SHOW_TEXT),leaves:boolean[]=[];while(walker.nextNode()){const node=walker.currentNode as Text;if(!(node.nodeValue??'').trim())continue;let current=node.parentElement,opacity=1,visible=true;while(current){const style=getComputedStyle(current),alpha=Number(style.opacity);if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse')visible=false;opacity*=Number.isFinite(alpha)?alpha:1;current=current.parentElement;}const style=getComputedStyle(node.parentElement!),svgText=node.parentElement!.namespaceURI==='http://www.w3.org/2000/svg',fill=paintAlpha(style.fill)*Number(style.fillOpacity),stroke=paintAlpha(style.stroke)*Number(style.strokeOpacity)*(Number.parseFloat(style.strokeWidth)||0),color=paintAlpha(style.color);leaves.push(visible&&opacity>0&&(svgText?fill>0||stroke>0:color>0));}return leaves.length>0&&leaves.every(Boolean);};
   const ownTexts=(element:Element)=>[...element.querySelectorAll('text.lini-text')].filter(text=>text.closest('g.lini-node')===element).map(text=>normalize([...text.querySelectorAll('tspan')].map(span=>span.textContent??'').join(' ')||(text.textContent??''))).filter(Boolean);
   const carriers=[...svg.querySelectorAll('g.lini-node[data-id],g.lini-node.lini-caption')].map(element=>{
    const group=element as SVGGElement,id=group.dataset.id??'',ancestorGroups:string[]=[];let parent=group.parentElement;
    while(parent&&parent.tagName.toLowerCase()!=='svg'){if(parent.matches('g.lini-node.lini-group[data-id]'))ancestorGroups.unshift(parent.getAttribute('data-id')??'');parent=parent.parentElement;}
    const directCells=[...group.querySelectorAll(':scope > g.lini-node.lini-cell')].map(cell=>({id:cell.getAttribute('data-id'),text:ownTexts(cell).join(' '),bounds:box(cell)}));
    const ownShapes=[...group.querySelectorAll(':scope > rect,:scope > polygon,:scope > ellipse,:scope > path,:scope > circle')],shapeBoxes=ownShapes.map(box),paintedCardBox=(element:Element):Box=>{const shape=element as SVGGraphicsElement,matrix=shape.getScreenCTM(),bounds=shape.getBBox();if(!matrix)return box(element);const corners=[new DOMPoint(bounds.x,bounds.y),new DOMPoint(bounds.x+bounds.width,bounds.y),new DOMPoint(bounds.x,bounds.y+bounds.height),new DOMPoint(bounds.x+bounds.width,bounds.y+bounds.height)].map(point=>point.matrixTransform(matrix)),style=getComputedStyle(element),stroke=paintAlpha(style.stroke)*Number(style.strokeOpacity)>0?Number.parseFloat(style.strokeWidth||'0'):0,halfX=stroke*Math.hypot(matrix.a,matrix.c)/2,halfY=stroke*Math.hypot(matrix.b,matrix.d)/2,x=Math.min(...corners.map(point=>point.x-origin.x))-halfX,y=Math.min(...corners.map(point=>point.y-origin.y))-halfY,right=Math.max(...corners.map(point=>point.x-origin.x))+halfX,bottom=Math.max(...corners.map(point=>point.y-origin.y))+halfY;return{x,y,width:right-x,height:bottom-y};},paintedBoxes=ownShapes.filter(paintedShape).map(paintedCardBox),boundsFor=(boxes:Box[])=>boxes.length?{x:Math.min(...boxes.map(b=>b.x)),y:Math.min(...boxes.map(b=>b.y)),width:Math.max(...boxes.map(b=>b.x+b.width))-Math.min(...boxes.map(b=>b.x)),height:Math.max(...boxes.map(b=>b.y+b.height))-Math.min(...boxes.map(b=>b.y))}:null,containerBounds=boundsFor(shapeBoxes)??box(group),paintedBounds=boundsFor(paintedBoxes);
    const rectRadii=[...group.querySelectorAll(':scope > rect')].map(rect=>Number(rect.getAttribute('rx')??0));
    const sheetElements=[...group.querySelectorAll(':scope > path,:scope > g:not(.lini-node) > path')],sheetGeometry=sheetElements.map(element=>({bounds:box(element),signature:(element.getAttribute('d')??'').replace(/\s+/gu,' ').trim()})),sheetPaths=sheetElements.length;
    return{id,classes:[...group.classList],texts:ownTexts(group),title:group.querySelector(':scope > title')?.textContent?.trim()??'',style:group.getAttribute('style')??'',bounds:box(group),containerBounds,paintedBounds,rectRadii,sheetPaths,sheetGeometry,groups:ancestorGroups,parentId:group.parentElement?.closest('g.lini-node[data-id]')?.getAttribute('data-id')??null,cells:directCells};
   });
   const point=(path:SVGPathElement,at:number)=>{try{const local=path.getPointAtLength(at),screen=new DOMPoint(local.x,local.y).matrixTransform(path.getScreenCTM()!);return{x:screen.x-origin.x,y:screen.y-origin.y};}catch{return null;}};
   const curveDeviation=(path:SVGPathElement)=>{const length=path.getTotalLength();if(length<=0)return 0;const point=(at:number)=>{const p=path.getPointAtLength(at),matrix=path.getScreenCTM();return matrix?new DOMPoint(p.x,p.y).matrixTransform(matrix):p;},a=point(0),b=point(length),dx=b.x-a.x,dy=b.y-a.y,span=Math.hypot(dx,dy)||1;let deviation=0;for(let index=1;index<12;index++){const p=point(length*index/12);deviation=Math.max(deviation,Math.abs(dy*p.x-dx*p.y+b.x*a.y-b.y*a.x)/span);}return deviation;};
   const tangent=(path:SVGPathElement,at:number,length:number):Vector|null=>{const delta=Math.min(1,length/4),a=point(path,Math.max(0,Math.min(length,at))),b=point(path,Math.max(0,Math.min(length,at+(at===0?delta:-delta))));if(!a||!b)return null;const sign=at===0?1:-1,dx=(b.x-a.x)*sign,dy=(b.y-a.y)*sign,magnitude=Math.hypot(dx,dy);return magnitude?{x:dx/magnitude,y:dy/magnitude}:null;};
   const links=[...svg.querySelectorAll('g.lini-link')].map(element=>{
    const group=element as SVGGElement,line=[...group.querySelectorAll(':scope > path')].find(path=>!path.classList.contains('lini-marker')) as SVGPathElement|undefined,length=line?.getTotalLength()??0;
    const start=line&&length>0?point(line,0):null,end=line&&length>0?point(line,length):null;
    const markerElements=[...group.querySelectorAll('.lini-marker')];
    const labelElements=[...group.querySelectorAll(':scope > text.lini-link-label')];
    const labelClearances=labelElements.map(label=>{if(!line||length<=0)return-1;const rect=label.getBoundingClientRect(),matrix=line.getScreenCTM();if(!matrix)return-1;let minimum=Infinity;for(let sample=0;sample<=180;sample++){const local=line.getPointAtLength(length*sample/180),screen=new DOMPoint(local.x,local.y).matrixTransform(matrix),dx=Math.max(rect.left-screen.x,0,screen.x-rect.right),dy=Math.max(rect.top-screen.y,0,screen.y-rect.bottom);minimum=Math.min(minimum,Math.hypot(dx,dy));}return minimum;});
    const samples=line&&length>0?Array.from({length:181},(_,index)=>point(line,length*index/180)).filter((value):value is Vector=>value!==null):[];
    return{classes:[...group.classList],from:group.getAttribute('data-from'),to:group.getAttribute('data-to'),labels:labelElements.map(text=>normalize([...text.querySelectorAll('tspan')].map(span=>span.textContent??'').join(' ')||text.textContent||'')).filter(Boolean),labelBounds:labelElements.map(box),labelPainted:labelElements.map(paintedText),labelClearances,bounds:box(group),line:start&&end&&line?{start,end,startTangent:tangent(line,0,length)??{x:0,y:0},endTangent:tangent(line,length,length)??{x:0,y:0},samples,d:line.getAttribute('d')??'',curveDeviation:curveDeviation(line)}:null,markers:markerElements.map(marker=>{const graphics=marker as SVGGraphicsElement,b=box(marker),matrix=graphics.getScreenCTM(),vertices=marker instanceof SVGPolygonElement?[...marker.points].map(point=>{const screen=new DOMPoint(point.x,point.y).matrixTransform(matrix!);return{x:screen.x-origin.x,y:screen.y-origin.y};}):[],markerPath=marker instanceof SVGPathElement?marker:undefined,markerLength=markerPath?.getTotalLength()??0,orientation=markerPath&&markerLength>0?tangent(markerPath,0,markerLength):null;return{classes:[...marker.classList],tag:marker.tagName.toLowerCase(),d:marker.getAttribute('d')??'',length:markerLength,center:{x:b.x+b.width/2,y:b.y+b.height/2},orientation,points:vertices,bounds:b};}),arrows:group.querySelectorAll('.lini-marker-arrow').length};
   });
   const fontFamilies=[...svg.querySelectorAll('text')].map(element=>({text:normalize(element.textContent??''),inline:(element as SVGTextElement).style.fontFamily,computed:getComputedStyle(element).fontFamily}));
   return{svg:svg.matches('svg.lini'),svgBounds:box(svg),carriers,links,fontFamilies};
  });
 }catch{/* emitted evidence below */}

 let visibleInk:LiniVisibleInkReport|undefined;
 if(dom?.svg)try{visibleInk=await inspectLiniVisibleInk(page);}catch{/* specialized link proof reports missing raster evidence below */}

 const carrier=(id:string,requiredClass?:string)=>dom?.carriers.find(item=>item.id===id&&(!requiredClass||item.classes.includes(requiredClass)));
 const linkFor=(element:PresentationPlan['elementMap'][number])=>dom?.links.find(link=>link.classes.includes('lini-style-'+element.nativeId));
 const visibleInkFor=(element:PresentationPlan['elementMap'][number])=>visibleInk?.links.find(link=>link.nativeClass==='lini-style-'+element.nativeId);
 const sourcePointer=(kind:string,index:number,field='')=>at(`/${kind}/${index}${field?'/'+field:''}`);
 let carriersOk=!!dom?.svg&&!!dom.carriers.length;
 const missing:string[]=[];
 if(visual.kind==='state'){
  const expectedTransitions=visual.state?.transitions.length??0,expectedMarkers=1+(visual.state?.final?.length??0),mappedTransitions=maps.filter(item=>item.kind==='transition').length,mappedMarkers=maps.filter(item=>item.kind==='state-marker').length;
  if(mappedTransitions!==expectedTransitions){carriersOk=false;missing.push(`state transition map count ${mappedTransitions} does not match authored count ${expectedTransitions}`);}
  if(mappedMarkers!==expectedMarkers){carriersOk=false;missing.push(`state marker map count ${mappedMarkers} does not match authored count ${expectedMarkers}`);}
  const expectedPaths=(visual.state?.transitions??[]).filter(transition=>transition.path!==undefined).length,mappedPaths=maps.filter(item=>item.kind==='state-path-caption').length;
  if(mappedPaths!==expectedPaths){carriersOk=false;missing.push(`state path-caption map count ${mappedPaths} does not match authored path count ${expectedPaths}`);}
 }
 for(const item of maps){
  if(item.kind==='state-marker'){
   const initial=item.sourcePath===at('/state/initial'),finalMatch=/^\/extensions\/umf\.visual\/state\/final\/(\d+)$/u.exec(item.sourcePath),finalIndex=finalMatch?Number(finalMatch[1]):-1,expectedState=initial?visual.state?.initial:finalIndex>=0?visual.state?.final?.[finalIndex]:undefined,expectedCell=initial?'initial':finalIndex>=0?'final'+(finalIndex+1):undefined,expectedHost=expectedState?nativeFor(plan,'node',expectedState):undefined,found=expectedHost?carrier(expectedHost,'lini-node'):undefined,cell=expectedCell?found?.cells.find(candidate=>candidate.id===expectedCell&&norm(candidate.text)===(initial?'Initial':'Final')):undefined;
   if(!expectedState||!expectedHost||item.logicalId!==expectedState||item.nativeId!==`${expectedHost}.${expectedCell}`||!cell){carriersOk=false;missing.push(`state marker ${item.sourcePath} is not mapped to its exact referenced state cell`);}
   continue;
  }
  if(item.kind==='transition'){
   const transitionIndex=visual.state?.transitions.findIndex(candidate=>candidate.id===item.logicalId)??-1,transition=transitionIndex>=0?visual.state?.transitions[transitionIndex]:undefined,link=linkFor(item),caption=transition?stateCaptionFromSource(transition):'';
   if(!transition||item.nativeId!==`t${transitionIndex+1}`||item.sourcePath!==at('/state/transitions/'+transitionIndex)||!link||link.labels.join(' ')!==norm(caption)){carriersOk=false;missing.push(`state transition ${item.logicalId} lacks its exact mapped native caption`);}
   continue;
  }
  if(item.kind==='state-path-caption'){
   const pathMatch=/^\/extensions\/umf\.visual\/state\/transitions\/(\d+)\/path$/u.exec(item.sourcePath),transitionIndex=pathMatch?Number(pathMatch[1]):-1,transition=transitionIndex>=0?visual.state?.transitions[transitionIndex]:undefined,transitionMaps=maps.filter(candidate=>candidate.kind==='transition'&&candidate.logicalId===item.logicalId),transitionMap=transitionMaps[0],from=transition?nativeFor(plan,'node',transition.from):undefined,to=transition?nativeFor(plan,'node',transition.to):undefined,link=linkFor(item),caption=transition?stateCaptionFromSource(transition):'',astCaption=transition&&from&&to?nativeTransitionCaption(nativeAst,from,to,item.nativeId):undefined;
   if(!transition||transition.path===undefined||transition.id!==item.logicalId||transitionMaps.length!==1||item.nativeId!==transitionMap?.nativeId||transitionMap?.sourcePath!==at('/state/transitions/'+transitionIndex)||!from||!to||!link||link.from!==`visual.${from}`||link.to!==`visual.${to}`||link.labels.join(' ')!==norm(caption)||astCaption!==caption){carriersOk=false;missing.push(`state path ${item.sourcePath} is not separately bound to its exact native caption and directed transition`);}
   continue;
  }
  if(item.kind==='edge'||item.kind==='reference'){
   const link=linkFor(item);if(!link){carriersOk=false;missing.push(`${item.kind} ${item.logicalId} (${item.nativeId})`);continue;}
   const visualEdge=item.kind==='edge'?(visual.edges??[]).find(edge=>edge.id===item.logicalId):undefined;
   const visualRef=item.kind==='reference'?(visual.structure?.references??[]).find(reference=>reference.id===item.logicalId):undefined;
   const expected=visualEdge?.label??(visualRef?expectedReferenceLabel(visualRef):'');
   if(expected&&link.labels.join(' ')!==norm(expected)){carriersOk=false;missing.push(`${item.kind} label ${item.logicalId}`);}
   continue;
  }
  if(item.kind==='field'||item.kind==='port')continue; // Rows and ports are checked against their owning native carrier below.
  const required=item.kind==='group'||item.kind==='layer'||item.kind==='visual'?'lini-group':item.kind==='entity'?'lini-entity':'lini-node';
  const found=carrier(item.nativeId,required);if(!found){carriersOk=false;missing.push(`${item.kind} ${item.logicalId} (${item.nativeId})`);continue;}
  let expected='';
  if(item.kind==='visual')expected=visual.title??visual.question;
  else if(item.kind==='node')expected=visual.nodes?.find(node=>node.id===item.logicalId)?.label??'';
  else if(item.kind==='group')expected=visual.groups?.find(group=>group.id===item.logicalId)?.label??'';
  else if(item.kind==='layer')expected=visual.structure?.layers?.find(layer=>layer.id===item.logicalId)?.label??'';
  else if(item.kind==='entity')expected=visual.nodes?.find(node=>node.id===item.logicalId)?.label??'';
  else if(item.kind==='annotation')expected=item.sourcePath===at('/question')?visual.question:item.sourcePath===at('/takeaway')?visual.takeaway??'':visual.annotations?.find(annotation=>annotation.id===item.logicalId)?.text??'';
  else if(item.kind==='event'){
   const match=item.sourcePath.match(/\/timeline\/events\/(\d+)$/u),event=match?visual.timeline?.events?.[Number(match[1])]:undefined;
   expected=event?event.label+' · '+event.at:'';
  }
  const groupCaption=item.kind==='group'?dom?.carriers.find(candidate=>candidate.classes.includes('lini-caption')&&candidate.texts.some(text=>text.includes(norm(expected)))&&containsBox(found.bounds,candidate.bounds)):undefined;
  const visibleLabel=!!expected&&(found.texts.includes(norm(expected))||found.cells.some(cell=>norm(cell.text)===norm(expected))||!!groupCaption||!!dom?.carriers.some(candidate=>candidate.classes.includes('lini-caption')&&candidate.texts.includes(norm(expected))&&containsBox(found.bounds,candidate.bounds)));
  const shape=visual.nodes?.find(node=>node.id===item.logicalId)?.shape,visibleShapeFallback=!!shape&&found.texts.some(text=>text.startsWith(norm(expected)+' (shape: '+shape+')'));
  if(expected&&!visibleLabel&&!visibleShapeFallback){carriersOk=false;missing.push(`${item.kind} label ${item.logicalId}`);}
  const mappedGroup=item.kind==='group'?visual.groups?.find(group=>group.id===item.logicalId):undefined;
  if(visual.kind==='flow'&&visual.form==='zoned'&&mappedGroup?.tier!==undefined){const tierText=norm('Tier '+mappedGroup.tier),tierOwned=!!groupCaption&&groupCaption.texts.some(text=>norm(text).includes(norm(mappedGroup.label))&&norm(text).includes(tierText)),tierApproximation=plan.approximations.some(item=>item.sourcePath===at('/groups/'+visual.groups!.indexOf(mappedGroup)+'/tier'));if(!tierOwned||!tierApproximation){carriersOk=false;missing.push(`group ${mappedGroup.id} literal tier ${mappedGroup.tier} is not visible in its mapped native caption and approximation`);}}
  if(item.kind==='annotation'){
   const metadataPointer=item.sourcePath===at('/question')||item.sourcePath===at('/takeaway');
   if(metadataPointer&&(item.logicalId!==item.sourcePath||item.nativeId!==(item.sourcePath===at('/question')?'pipeline-question-caption':'pipeline-takeaway-footer'))){carriersOk=false;missing.push(`pipeline text ${item.sourcePath} is not mapped to its exact native source carrier`);}
   const borderless=found.classes.includes('lini-box')&&found.style.includes('fill: none')&&found.style.includes('stroke: none')&&found.style.includes('stroke-width: 0');
   const connected=dom?.links.some(link=>[link.from,link.to].some(endpoint=>!!endpoint&&endpoint.split('.').includes(item.nativeId)));
   if(!borderless){carriersOk=false;missing.push(`annotation ${item.logicalId} is not a borderless native text carrier`);}
   if(connected){carriersOk=false;missing.push(`annotation ${item.logicalId} has a native graph connection`);}
  }
  const detail=item.kind==='group'?visual.groups?.find(group=>group.id===item.logicalId)?.detail:item.kind==='node'||item.kind==='entity'?visual.nodes?.find(node=>node.id===item.logicalId)?.detail:undefined;
  if(detail){const detailRow=found.cells.find(cell=>cell.id==='detail'),captionHasDetail=item.kind==='group'&&!!groupCaption&&groupCaption.texts.some(text=>text.includes(norm(detail)));if((!detailRow||norm(detailRow.text)!==norm(detail))&&!captionHasDetail){carriersOk=false;missing.push(`${item.kind} detail ${item.logicalId}`);}}
  const explicitNode=visual.nodes?.find(node=>node.id===item.logicalId);
  if(item.kind==='node'&&explicitNode?.role==='process'){
   const roleCell=found.cells.find(cell=>cell.id==='role'&&norm(cell.text)==='Process');
   const authoredDetail=explicitNode.detail==='Process'&&found.cells.some(cell=>cell.id==='detail'&&norm(cell.text)==='Process');
   const authoredLabel=explicitNode.label==='Process'&&found.texts.includes('Process');
   const processPalette=found.style.includes('--lini-rose-wash')&&found.style.includes('--lini-rose-deep');
   if((!roleCell&&!authoredDetail&&!authoredLabel)||!processPalette){carriersOk=false;missing.push(`node ${item.logicalId} process role caption/palette is not owned by its native carrier`);}
  }
  if(explicitNode?.shape){
   const nodeIndex=visual.nodes!.indexOf(explicitNode),shapePath=sourcePointer('nodes',nodeIndex,'shape');
   if(item.kind==='entity'){
    const shapeCell=found.cells.find(cell=>cell.id==='shape'),approximation=plan.approximations.find(candidate=>candidate.sourcePath===shapePath&&candidate.representation.includes('fixed table silhouette'));
    if(!shapeCell||norm(shapeCell.text)!==norm(`(requested shape: ${explicitNode.shape})`)||!approximation){carriersOk=false;missing.push(`entity ${item.logicalId} requested shape is not visibly captioned with its located silhouette approximation`);}
   }else if(item.kind==='node'){
    const expectedClass=nativeShapeClass[explicitNode.shape],radius=found.rectRadii[0],geometryOk=explicitNode.shape==='rectangle'?radius!==undefined&&radius<=0.5:explicitNode.shape==='rounded-rectangle'?radius!==undefined&&radius>0.5:explicitNode.shape==='document'?found.sheetPaths===1:explicitNode.shape==='multiple-documents'?found.sheetPaths>=2&&hasOffsetSheetPair(found.sheetGeometry):true;
    if(!found.classes.includes(expectedClass)||!geometryOk){carriersOk=false;missing.push(`node ${item.logicalId} does not use its declared native ${explicitNode.shape} geometry`);}
   }
  }
 }
 if(visual.kind==='state'){
  const expectedPaths=(visual.state?.transitions??[]).map((transition,index)=>({transition,index})).filter(item=>item.transition.path!==undefined),pathMaps=maps.filter(item=>item.kind==='state-path-caption'),problems:string[]=[];
  if(pathMaps.length!==expectedPaths.length)problems.push(`source-located path map count ${pathMaps.length} differs from ${expectedPaths.length} authored path fields`);
  for(const{transition,index}of expectedPaths){
   const sourcePath=`${at('/state/transitions/'+index)}/path`,rows=pathMaps.filter(item=>item.sourcePath===sourcePath),pathMap=rows[0],transitionRows=maps.filter(item=>item.kind==='transition'&&item.sourcePath===at('/state/transitions/'+index)),transitionMap=transitionRows[0],from=nativeFor(plan,'node',transition.from),to=nativeFor(plan,'node',transition.to),caption=stateCaptionFromSource(transition),link=pathMap?linkFor(pathMap):undefined,astCaption=pathMap&&from&&to?nativeTransitionCaption(nativeAst,from,to,pathMap.nativeId):undefined,paintedCaption=link?.labelPainted[0]===true;
   if(rows.length!==1||pathMap?.logicalId!==transition.id||transitionRows.length!==1||transitionMap?.logicalId!==transition.id||pathMap?.nativeId!==transitionMap?.nativeId)problems.push(`${transition.id} does not have one exact path source-map row joined to its transition map`);
   if(!from||!to||!link||link.from!==`visual.${from}`||link.to!==`visual.${to}`||link.labels.join(' ')!==norm(caption)||astCaption!==caption||link.labelPainted[0]!==true)problems.push(`${transition.id} explicit path text is missing or unpainted in its exact native AST/SVG transition carrier`);
  }
  if(expectedPaths.length||pathMaps.length)checks.push(pass('state-path-caption-ownership',sourceSha256,problems.length===0,problems.length?problems.join('; '):`${expectedPaths.length} explicit path fields have exact source-map, native AST, and owned-link captions.`));
 }
 for(const item of maps.filter(candidate=>candidate.kind==='port')){
  const match=item.sourcePath.match(/\/nodes\/(\d+)\/ports\/(\d+)$/),nodeIndex=match?Number(match[1]):-1,portIndex=match?Number(match[2]):-1,node=visual.nodes?.[nodeIndex],port=node?.ports?.[portIndex],nodeNative=node?nativeFor(plan,'entity',node.id)??nativeFor(plan,'node',node.id):undefined,localId=item.nativeId.split('.').at(-1)!;
  const found=nodeNative?dom?.carriers.find(candidate=>candidate.id===localId&&candidate.parentId===nodeNative&&(candidate.classes.includes('lini-port')||candidate.classes.includes('lini-cell'))):undefined;
  const expected=port?.label&&port.label!==port.id?`${port.label} · ${port.id}`:port?.id??'';
  if(!found||!expected||!found.texts.some(text=>norm(text)===norm(expected))){carriersOk=false;missing.push(`port ${item.logicalId} (${item.nativeId}) lacks its own labeled native cell`);}
 }
 const arialOnly=(value:string)=>!value.includes(',')&&value.trim().replace(/^['"]|['"]$/gu,'').toLowerCase()==='arial';
 for(const font of dom?.fontFamilies??[])if(!arialOnly(font.computed)||(font.inline&&!arialOnly(font.inline))){carriersOk=false;missing.push(`text ${JSON.stringify(font.text)} has inline/computed font-family ${font.inline||'(inherited)'} / ${font.computed}; expected single-family Arial`);}
 checks.push(pass('lini-native-carriers',sourceSha256,carriersOk,carriersOk?`All ${maps.length} mapped native identities own their visible Lini carriers; all ${dom?.fontFamilies.length??0} rendered text nodes use computed single-family Arial.`:`Missing or altered native-owned carriers: ${missing.join('; ')||'the inserted SVG is not a Lini SVG'}.`));

 let endpointOk=!!dom?.svg;const endpointProblems:string[]=[],routingObservations:string[]=[];
 if(visual.kind==='flow'){
  const expectedEdges=maps.filter(item=>item.kind==='edge'),expectedNativeIds=new Set(expectedEdges.map(item=>item.nativeId));
  const actualEdgeIds=(dom?.links??[]).flatMap(link=>link.classes.filter(className=>/^lini-style-e\d+$/u.test(className)).map(className=>className.slice('lini-style-'.length)));
  if((dom?.links.length??0)!==expectedEdges.length||actualEdgeIds.length!==expectedEdges.length||new Set(actualEdgeIds).size!==actualEdgeIds.length||actualEdgeIds.some(nativeId=>!expectedNativeIds.has(nativeId))||expectedEdges.some(item=>!actualEdgeIds.includes(item.nativeId))){
   endpointOk=false;endpointProblems.push(`native flow link inventory (${actualEdgeIds.join(', ')||'none'}; ${(dom?.links.length??0)} total native links) does not exactly match the ${expectedEdges.length} authored edge carriers (${expectedEdges.map(item=>item.nativeId).join(', ')||'none'})`);
  }
 }
 if(visual.kind==='state'){
  const actual=dom?.links.filter(link=>link.classes.some(className=>/^lini-style-t\d+$/u.test(className))).length??0,expected=visual.state?.transitions.length??0;
  if(actual!==expected){endpointOk=false;endpointProblems.push(`native state transition link count ${actual} does not match authored count ${expected}`);}
 }
 const endpoint=(nodeId:string,fieldName?:string,fieldId?:string,portId?:string):EndpointProof|undefined=>{
  const node=visual.nodes?.find(item=>item.id===nodeId);if(!node)return;
  const parentGroups=groupChain(visual,plan,nodeId),nodeNative=nativeFor(plan,'entity',nodeId)??nativeFor(plan,'node',nodeId);if(!nodeNative)return;
  if(portId!==undefined){
   const nodeIndex=visual.nodes?.findIndex(item=>item.id===nodeId)??-1,nodeWithPorts=visual.nodes?.[nodeIndex],portIndex=nodeWithPorts?.ports?.findIndex(port=>port.id===portId)??-1;
   if(nodeIndex<0||portIndex<0)return;
   const port=nodeWithPorts?.ports?.[portIndex];if(!port)return;
   const mapped=maps.find(item=>item.kind==='port'&&item.sourcePath===sourcePointer('nodes',nodeIndex,`ports/${portIndex}`));if(!mapped)return;
   const localId=mapped.nativeId.split('.').at(-1)!,row=dom?.carriers.find(item=>item.id===localId&&item.parentId===nodeNative&&(item.classes.includes('lini-port')||item.classes.includes('lini-cell'))),host=carrier(nodeNative);
   return row&&host?{path:[...host.groups,host.id,localId].join('.'),carrier:row,host,side:port.side??'east'}:undefined;
  }
  if(fieldName!==undefined||fieldId!==undefined){
   const fieldIndex=resolveField(visual,nodeId,fieldName,fieldId);if(fieldIndex<0)return;
   const entityIndex=entityFor(visual,nodeId),field=visual.structure?.entities?.[entityIndex]?.fields[fieldIndex];if(!field)return;
   const mapped=maps.find(item=>item.kind==='field'&&item.sourcePath===sourcePointer('structure/entities',entityIndex,`fields/${fieldIndex}`));
   if(!mapped)return;
   const localId=mapped.nativeId.split('.').at(-1)!;
   const row=dom?.carriers.find(item=>item.id===localId&&item.parentId===nodeNative);
   const host=carrier(nodeNative,'lini-entity');return row&&host?{path:[...host.groups,host.id,localId].join('.'),carrier:row,host}:undefined;
  }
  const row=carrier(nodeNative);if(!row)return;
  const mappedAncestors=row.groups.filter(id=>maps.some(item=>item.kind==='group'&&item.nativeId===id));
  const actualPath=[...row.groups,row.id].join('.');
  if(JSON.stringify(mappedAncestors)!==JSON.stringify(parentGroups))return;
  return{path:actualPath,carrier:row,host:row};
 };
 const verifyLink=(mapItem:PresentationPlan['elementMap'][number],fromId:string,fromField?:string,fromFieldId?:string,toId?:string,toField?:string,toFieldId?:string,directed=false,fromCardinality?:VisualCardinality,fromMultiplicity?:VisualMultiplicity,toCardinality?:VisualCardinality,toMultiplicity?:VisualMultiplicity,expectedLabel='',fromPort?:string,toPort?:string)=>{
  const link=linkFor(mapItem),from=endpoint(fromId,fromField,fromFieldId,fromPort),to=toId?endpoint(toId,toField,toFieldId,toPort):undefined;
  if(!link||!from||!to){endpointOk=false;endpointProblems.push(`${mapItem.logicalId}: link, endpoint, or mapped row is absent`);return;}
  if(link.from!==from.path||link.to!==to.path){endpointOk=false;endpointProblems.push(`${mapItem.logicalId}: data-from/to does not match mapped source carriers`);}
 const portNear=(point:{x:number;y:number},endpoint:EndpointProof)=>{
   const row=endpoint.carrier.bounds,host=endpoint.host.bounds;
   if(endpoint.side){
    const side=endpoint.side,coordinate=side==='west'?Math.abs(point.x-row.x):side==='east'?Math.abs(point.x-row.x-row.width):side==='north'?Math.abs(point.y-row.y):Math.abs(point.y-row.y-row.height);
    const withinSpan=side==='west'||side==='east'?point.y>=row.y-2&&point.y<=row.y+row.height+2:point.x>=row.x-2&&point.x<=row.x+row.width+2;
    return coordinate<=4&&withinSpan;
   }
   if(endpoint.carrier===endpoint.host)return distToBox(point,host)<=32;
   const rowAligned=point.y>=row.y-2&&point.y<=row.y+row.height+2;
   const onHostPerimeter=Math.min(Math.abs(point.x-host.x),Math.abs(point.x-host.x-host.width))<=50;
   return rowAligned&&onHostPerimeter;
  };
  const markerNear=(marker:Link['markers'][number],endpoint:EndpointProof)=>endpoint.side?portNear(marker.center,endpoint):endpoint.carrier===endpoint.host?boxGap(marker.bounds,endpoint.host.bounds)<=32:portNear(marker.center,endpoint);
  const targetArrow=link.markers.find(marker=>marker.classes.includes('lini-marker-arrow')&&marker.points.some(point=>portNear(point,to)));
  const bodyReferenceTarget=mapItem.kind==='reference'&&to.carrier===to.host&&!to.side;
  const targetCardinalityMarkers=link.markers.filter(marker=>!marker.classes.includes('lini-marker-arrow')&&(bodyReferenceTarget||markerNear(marker,to)));
  const targetCardinalityChain=new Set<Link['markers'][number]>();
  if(bodyReferenceTarget&&link.line){
   const routeLine=link.line,targetTailSamples=routeLine.samples.map((point,index)=>({point,remaining:routeLine.samples.slice(index).reduce((length,current,sampleIndex,tail)=>sampleIndex===0?length:length+Math.hypot(current.x-tail[sampleIndex-1]!.x,current.y-tail[sampleIndex-1]!.y),0)})).filter(sample=>sample.remaining<=32);
   for(const marker of targetCardinalityMarkers)if(targetTailSamples.some(sample=>distToBox(sample.point,marker.bounds)<=2))targetCardinalityChain.add(marker);
   let changed=true;while(changed){changed=false;for(const marker of targetCardinalityMarkers)if(!targetCardinalityChain.has(marker)&&[...targetCardinalityChain].some(previous=>boxGap(previous.bounds,marker.bounds)<=2)){targetCardinalityChain.add(marker);changed=true;}}
  }
  const targetCardinalityBridge=[...targetCardinalityChain].some(marker=>boxGap(marker.bounds,to.host.bounds)<=2);
  const bodyTerminalNear=(point:Vector,endpoint:EndpointProof)=>!endpoint.side&&endpoint.carrier===endpoint.host&&distToBox(point,endpoint.host.bounds)<=32;
  if(!link.line||(!portNear(link.line.start,from)&&!bodyTerminalNear(link.line.start,from))||(!portNear(link.line.end,to)&&!bodyTerminalNear(link.line.end,to)&&!targetArrow&&!targetCardinalityBridge)){endpointOk=false;endpointProblems.push(`${mapItem.logicalId}: path ${link.line?`(${link.line.start.x.toFixed(1)},${link.line.start.y.toFixed(1)})→(${link.line.end.x.toFixed(1)},${link.line.end.y.toFixed(1)})`: 'missing'} is outside source row ${JSON.stringify(from.carrier.bounds)} / host ${JSON.stringify(from.host.bounds)} or target row ${JSON.stringify(to.carrier.bounds)} / host ${JSON.stringify(to.host.bounds)}`);}
  if(directed&&(!link.arrows||!targetArrow)){endpointOk=false;endpointProblems.push(`${mapItem.logicalId}: directed target arrow is absent or detached`);}
  const visibleLinkInk=visibleInkFor(mapItem);
  if(expectedLabel&&(link.labels.join(' ')!==norm(expectedLabel)||(mapItem.kind==='edge'&&(!visibleLinkInk||visibleLinkInk.captionInkPixels<2)))){endpointOk=false;endpointProblems.push(`${mapItem.logicalId}: authored link label or exact visible glyphs are missing`);}
  const reference=mapItem.kind==='reference'?visual.structure?.references?.find(candidate=>candidate.id===mapItem.logicalId):undefined;
  const entityLevelReference=!!reference&&!reference.from.field&&!reference.from.fieldId&&!reference.from.portId&&!reference.to.field&&!reference.to.fieldId&&!reference.to.portId;
  if(entityLevelReference&&link.labelBounds.length){
   const overlaps=(a:Box,b:Box)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
   if(link.labelClearances.some(clearance=>clearance<8)) {endpointOk=false;endpointProblems.push(`${mapItem.logicalId}: relationship caption is less than 8 CSS px from its native connector`);}
   if(link.labelBounds.some(label=>link.markers.some(marker=>overlaps(label,marker.bounds))||overlaps(label,from.host.bounds)||overlaps(label,to.host.bounds))){endpointOk=false;endpointProblems.push(`${mapItem.logicalId}: relationship caption overlaps an endpoint marker or entity card`);}
  }
  if(mapItem.kind==='edge'&&link.labelBounds.length){const edge=(visual.edges??[]).find(candidate=>candidate.id===mapItem.logicalId),fromChain=groupChain(visual,plan,fromId),toChain=groupChain(visual,plan,toId!),isPrefix=(outer:string[],inner:string[])=>outer.length<inner.length&&outer.every((id,index)=>id===inner[index]),siblingGroups=fromChain.length>0&&toChain.length>0&&!isPrefix(fromChain,toChain)&&!isPrefix(toChain,fromChain);if(siblingGroups){const relatedGroups=new Set([...fromChain,...toChain]);for(const group of visual.groups??[]){const groupNative=nativeFor(plan,'group',group.id);if(!groupNative||relatedGroups.has(groupNative))continue;const frame=carrier(groupNative,'lini-group')?.containerBounds;if(!frame)continue;for(const label of link.labelBounds)if(label.x<frame.x+frame.width&&label.x+label.width>frame.x&&label.y<frame.y+frame.height&&label.y+label.height>frame.y){endpointOk=false;endpointProblems.push(`${mapItem.logicalId}: owned caption sits inside unrelated native group ${group.id}`);}}for(const groupId of new Set([...fromChain,...toChain])){const frame=carrier(groupId,'lini-group')?.containerBounds;if(!frame)continue;for(const label of link.labelBounds){const intersects=label.x<frame.x+frame.width&&label.x+label.width>frame.x&&label.y<frame.y+frame.height&&label.y+label.height>frame.y,fullyInside=label.x>=frame.x+2&&label.y>=frame.y+2&&label.x+label.width<=frame.x+frame.width-2&&label.y+label.height<=frame.y+frame.height-2;if(intersects&&!fullyInside){endpointOk=false;endpointProblems.push(`${mapItem.logicalId}: owned caption crosses native group frame ${groupId}`);}}if(edge?.routing?.kind==='curved'&&link.labelClearances.some(clearance=>clearance<2)){endpointOk=false;endpointProblems.push(`${mapItem.logicalId}: owned caption overlaps its native curved connector`);}}}}
  const sourceExpected=markerMinimum(fromCardinality,fromMultiplicity),targetExpected=markerMinimum(toCardinality,toMultiplicity);
  const symbolsAt=(endpoint:EndpointProof,source:boolean)=>link.markers.filter(marker=>!marker.classes.includes('lini-marker-arrow')&&(mapItem.kind==='reference'&&!source&&endpoint.carrier===endpoint.host&&!endpoint.side?targetCardinalityChain.has(marker):markerNear(marker,endpoint))).map(marker=>{
   if(marker.tag==='circle')return'circle';
   if((marker.d.match(/\bL\b/gu)?.length??0)>=3)return'fork';
   const oneSegment=(marker.d.match(/\bM\b/gu)?.length??0)===1&&(marker.d.match(/\bL\b/gu)?.length??0)===1&&marker.length>=5;
   if(oneSegment&&link.line&&marker.orientation){const tangent=source?link.line.startTangent:link.line.endTangent,dot=Math.abs(marker.orientation.x*tangent.x+marker.orientation.y*tangent.y);if(dot<=0.5)return'bar';return'connector';}
   if((marker.d.match(/\bM\b/gu)?.length??0)===1&&(marker.d.match(/\bL\b/gu)?.length??0)===1&&marker.length>0&&marker.length<5)return'connector';
   return'other';
  }).filter(symbol=>symbol!=='connector');
  const expectedSymbols=(cardinality:VisualCardinality|undefined,multiplicity:VisualMultiplicity|undefined):string[]=>{
   switch(multiplicityCardinality(cardinality,multiplicity)){case'exactly-one':return['bar','bar'];case'zero-or-one':return['circle','bar'];case'zero-or-many':return['circle','fork'];case'one-or-many':return['bar','fork'];default:return[];}
  };
  const actualStart=symbolsAt(from,true),actualEnd=symbolsAt(to,false),expectedStart=expectedSymbols(fromCardinality,fromMultiplicity),expectedEnd=expectedSymbols(toCardinality,toMultiplicity);
  if(mapItem.kind==='reference'&&to.carrier===to.host&&!to.side&&expectedEnd.length>0&&!targetCardinalityBridge){endpointOk=false;endpointProblems.push(`${mapItem.logicalId}: target cardinality glyph chain is not connected from the native link endpoint to its mapped entity card`);}
  if(!directed&&link.arrows>0){endpointOk=false;endpointProblems.push(`${mapItem.logicalId}: headless association carries ${link.arrows} native arrow markers`);}
  const sameSymbols=(actual:string[],expected:string[])=>actual.length===expected.length&&[...actual].sort().every((symbol,index)=>symbol===[...expected].sort()[index]);
  if(!sameSymbols(actualStart,expectedStart)||!sameSymbols(actualEnd,expectedEnd)){endpointOk=false;endpointProblems.push(`${mapItem.logicalId}: native endpoint cardinality symbols differ (${actualStart.join('+')||'none'} vs ${expectedStart.join('+')||'none'} at source; ${actualEnd.join('+')||'none'} vs ${expectedEnd.join('+')||'none'} at target)`);}
  if(!sourceExpected&&fromMultiplicity&&!multiplicityCardinality(fromCardinality,fromMultiplicity)&&!link.labels.some(label=>label.includes(rangeText(fromMultiplicity)!))){endpointOk=false;endpointProblems.push(`${mapItem.logicalId}: exact source multiplicity text is absent`);}
  if(!targetExpected&&toMultiplicity&&!multiplicityCardinality(toCardinality,toMultiplicity)&&!link.labels.some(label=>label.includes(rangeText(toMultiplicity)!))){endpointOk=false;endpointProblems.push(`${mapItem.logicalId}: exact target multiplicity text is absent`);}
 };
 for(let index=0;index<(visual.edges??[]).length;index++){
  const edge=visual.edges![index]!,item=maps.find(candidate=>candidate.kind==='edge'&&candidate.logicalId===edge.id);
  if(item){
   verifyLink(item,edge.from,undefined,undefined,edge.to,undefined,undefined,edge.directed!==false,undefined,undefined,undefined,undefined,edge.label??'',edge.fromPort,edge.toPort);
   if(edge.label){
    const link=linkFor(item),fromNative=nativeFor(plan,'entity',edge.from)??nativeFor(plan,'node',edge.from),toNative=nativeFor(plan,'entity',edge.to)??nativeFor(plan,'node',edge.to),fromCarrier=fromNative?carrier(fromNative):undefined,toCarrier=toNative?carrier(toNative):undefined;
    const overlaps=(a:Box,b:Box)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
    const ink=visibleInkFor(item);
    if(!link?.line||!link.labelBounds.length||!ink?.ok){endpointOk=false;endpointProblems.push(`${edge.id}: connector caption has neither 8 CSS px off-path clearance nor a qualified owned native cutout${ink?.problems.length?` (${ink.problems.join('; ')})`:''}`);}
    if(link?.labelBounds.some(label=>link.markers.some(marker=>overlaps(label,marker.bounds))||!!fromCarrier&&overlaps(label,fromCarrier.bounds)||!!toCarrier&&overlaps(label,toCarrier.bounds))){endpointOk=false;endpointProblems.push(`${edge.id}: owned caption overlaps an endpoint marker or node`);}
    if(link?.labelBounds.length){
     const endpointIds=new Set([fromNative,toNative]);
     for(const other of maps.filter(candidate=>candidate.kind==='node'||candidate.kind==='entity')){
      if(endpointIds.has(other.nativeId))continue;
      const host=carrier(other.nativeId),bounds=host?.containerBounds??host?.bounds;
      if(bounds&&link.labelBounds.some(label=>overlaps(label,bounds))){endpointOk=false;endpointProblems.push(`${edge.id}: owned caption overlaps unrelated native node ${other.logicalId}`);}
     }
    }
   }
   if(edge.routing){const link=linkFor(item),line=link?.line,sourcePath=at(`/edges/${index}/routing`),policy=plan.approximations.filter(entry=>entry.sourcePath===sourcePath),groups=visual.groups??[],chain=(nodeId:string)=>{const node=visual.nodes?.find(candidate=>candidate.id===nodeId),result:string[]=[];let current=groups.find(group=>group.id===node?.group);while(current){result.unshift(current.id);current=current.parent?groups.find(group=>group.id===current!.parent):undefined;}return result;},fromChain=chain(edge.from),toChain=chain(edge.to);let common=0;while(common<fromChain.length&&common<toChain.length&&fromChain[common]===toChain[common])common++;const scope=common?fromChain[common-1]:undefined,scopeEdges=(visual.edges??[]).filter(candidate=>{const a=chain(candidate.from),b=chain(candidate.to);let shared=0;while(shared<a.length&&shared<b.length&&a[shared]===b[shared])shared++;return(shared?a[shared-1]:undefined)===scope&&candidate.routing;}),routeKinds=[...new Set(scopeEdges.flatMap(candidate=>candidate.routing?[candidate.routing.kind]:[]))],conflict=routeKinds.length>1,fromNative=nativeFor(plan,'entity',edge.from)??nativeFor(plan,'node',edge.from),toNative=nativeFor(plan,'entity',edge.to)??nativeFor(plan,'node',edge.to),fromCarrier=fromNative?carrier(fromNative):undefined,toCarrier=toNative?carrier(toNative):undefined,fromGroups=fromCarrier?.groups??[],toGroups=toCarrier?.groups??[];let commonNative=0;while(commonNative<fromGroups.length&&commonNative<toGroups.length&&fromGroups[commonNative]===toGroups[commonNative])commonNative++;const containerNative=fromGroups[commonNative-1]??'visual',lineSource=plan.source.split('\n').find(value=>value.trimStart().startsWith(`|group#${containerNative}|`))??'',declared=/(?:^|[;{ ])routing:\s*(natural|straight);/u.exec(lineSource)?.[1],expected=edge.routing.kind==='curved'?'natural':'straight',modeOk=conflict?declared===undefined:declared===expected,approximation=policy[0],hasCurve=!!line&&/[CcQqSsAa]/u.test(line.d),deviation=line?.curveDeviation??Infinity;
    const scopeLayout=scope?groups.find(candidate=>candidate.id===scope)?.layout:visual.layout,hasExplicitGrid=scopeLayout?.kind==='grid'&&scopeLayout.columns>1,inferable=edge.routing.kind==='curved'&&!edge.fromPort&&!edge.toPort&&!hasExplicitGrid,nativePeerCurve=edge.routing.kind==='curved'&&hasNativePeerCurveOffset(visual,plan,edge),expectedCode=conflict?'ROUTING_SCOPE_CONFLICT':edge.routing.kind==='curved'&&!inferable&&!nativePeerCurve?'ROUTING_NATIVE_INTERPOLATION':undefined;
    if(policy.length!==1){endpointOk=false;endpointProblems.push(`${edge.id}: route needs exactly one source-located realization record`);}
    else if(approximation?.code!==expectedCode){endpointOk=false;endpointProblems.push(`${edge.id}: routing realization code does not match its actual Lini scope and anchor constraints`);}
    if(conflict){if(!modeOk){endpointOk=false;endpointProblems.push(`${edge.id}: mixed intent in its connection scope is not honestly preserved as a route conflict`);}}
    else{
     if(!modeOk){endpointOk=false;endpointProblems.push(`${edge.id}: its exact native container does not declare routing: ${expected}`);}
     if(edge.routing.kind==='curved'&&(!hasCurve||deviation<2)&&!(expectedCode==='ROUTING_NATIVE_INTERPOLATION'&&approximation?.code===expectedCode&&deviation<1.5)){endpointOk=false;endpointProblems.push(`${edge.id}: requested curved routing lacks a native curved segment with visible non-collinearity (${deviation.toFixed(1)}px deviation)`);}
     if(edge.routing.kind==='straight'&&deviation>1.5){endpointOk=false;endpointProblems.push(`${edge.id}: requested straight routing deviates ${deviation.toFixed(1)}px from a straight chord`);}
    }
    if(policy.length===1&&approximation?.code&&line){const geometryKind=deviation<1.5?'collinear':hasCurve&&deviation>=2?'curved':'bent-polyline';routingObservations.push(`${edge.id} requested ${edge.routing.kind}; observed ${geometryKind} native path with ${deviation.toFixed(1)}px chord deviation; admitted ${approximation.code}.`);}
   }}
 }
 for(let index=0;index<(visual.structure?.references??[]).length;index++){
  const reference=visual.structure!.references![index]!,item=maps.find(candidate=>candidate.kind==='reference'&&candidate.logicalId===reference.id);
  if(item)verifyLink(item,reference.from.node,reference.from.field,reference.from.fieldId,reference.to.node,reference.to.field,reference.to.fieldId,false,reference.fromCardinality,reference.fromMultiplicity,reference.toCardinality,reference.toMultiplicity,expectedReferenceLabel(reference),reference.from.portId,reference.to.portId);
 }
 for(let index=0;index<(visual.state?.transitions??[]).length;index++){
  const transition=visual.state!.transitions[index]!,item=maps.find(candidate=>candidate.kind==='transition'&&candidate.logicalId===transition.id);
  if(item){
   const label=stateTransitionCaption(transition),link=linkFor(item);
   verifyLink(item,transition.from,undefined,undefined,transition.to,undefined,undefined,true,undefined,undefined,undefined,undefined,label);
   if(link?.labelBounds.length){
    const overlaps=(a:Box,b:Box)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y,fromId=nativeFor(plan,'node',transition.from),toId=nativeFor(plan,'node',transition.to),from=fromId?carrier(fromId):undefined,to=toId?carrier(toId):undefined;
    if(link.labelClearances.some(clearance=>clearance<8)){endpointOk=false;endpointProblems.push(`${transition.id}: state transition caption is less than 8 CSS px clear of its connector`);}
    if(link.labelBounds.some(bounds=>link.markers.some(marker=>overlaps(bounds,marker.bounds))||!!from&&overlaps(bounds,from.bounds)||!!to&&overlaps(bounds,to.bounds))){endpointOk=false;endpointProblems.push(`${transition.id}: state transition caption overlaps an endpoint marker or state node`);}
   }
  }
 }
 if(visual.kind==='state'){
  const transitionMaps=maps.filter(item=>item.kind==='transition'),labels=transitionMaps.flatMap(item=>(linkFor(item)?.labelBounds??[]).map(bounds=>({id:item.logicalId,bounds}))),overlaps=(a:Box,b:Box)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
  for(let left=0;left<labels.length;left++)for(let right=left+1;right<labels.length;right++)if(overlaps(labels[left]!.bounds,labels[right]!.bounds)){endpointOk=false;endpointProblems.push(`state transition captions ${labels[left]!.id} and ${labels[right]!.id} overlap each other`);}
  const distanceToPath=(bounds:Box,link:Link)=>Math.min(Infinity,...(link.line?.samples??[]).map(point=>Math.hypot(Math.max(bounds.x-point.x,0,point.x-bounds.x-bounds.width),Math.max(bounds.y-point.y,0,point.y-bounds.y-bounds.height))));
  for(const item of transitionMaps){const own=linkFor(item),bounds=own?.labelBounds[0];if(!own||!bounds)continue;const ownDistance=distanceToPath(bounds,own);for(const otherItem of transitionMaps){if(otherItem===item)continue;const other=linkFor(otherItem);if(!other?.line)continue;const otherDistance=distanceToPath(bounds,other);if(ownDistance>=otherDistance){endpointOk=false;endpointProblems.push(`${item.logicalId}: caption is ${ownDistance.toFixed(1)} CSS px from its owned transition and ${otherDistance.toFixed(1)} px from ${otherItem.logicalId}; it is closer to another transition`);}}
  }
 }
 checks.push(pass('lini-connection-endpoints',sourceSha256,endpointOk,endpointOk?'Every link retains its mapped identity, full source/target path, owned label, native endpoint geometry, and authored direction/cardinality marks.'+(routingObservations.length?' Routing observations: '+routingObservations.join(' '):''):endpointProblems.join('; ')||'The inserted Lini SVG is unavailable.'));

 let containmentOk=!!dom?.svg;const containmentProblems:string[]=[],stackCaptionClearances:string[]=[],nestedCaptionClearances:string[]=[];
 const visualGroups=visual.groups??[];
 const expectedGroups=(nodeId:string)=>groupChain(visual,plan,nodeId);
 const contains=containsBox;
 for(const node of visual.nodes??[]){
  const nodeNative=nativeFor(plan,'entity',node.id)??nativeFor(plan,'node',node.id),found=nodeNative?carrier(nodeNative):undefined;
  if(!found){containmentOk=false;containmentProblems.push(`node ${node.id} carrier missing`);continue;}
  const expected=expectedGroups(node.id),actual=found.groups.filter(id=>maps.some(item=>item.kind==='group'&&item.nativeId===id));
  if(JSON.stringify(actual)!==JSON.stringify(expected)){containmentOk=false;containmentProblems.push(`node ${node.id} is outside its authored group path`);}
  for(const groupId of expected){const parent=carrier(groupId,'lini-group');if(!parent||!contains(parent.containerBounds,found.containerBounds)){containmentOk=false;containmentProblems.push(`group ${groupId} does not contain node ${node.id}`);}}
 }
 for(const group of visualGroups){
  const id=nativeFor(plan,'group',group.id),child=carrier(id??'','lini-group');if(!child){containmentOk=false;containmentProblems.push(`group ${group.id} carrier missing`);continue;}
  if(group.parent){
   const parentId=nativeFor(plan,'group',group.parent),parent=carrier(parentId??'','lini-group');
   if(!parent||!contains(parent.containerBounds,child.containerBounds)){containmentOk=false;containmentProblems.push(`nested group ${group.id} is outside its parent`);}
   const caption=dom?.carriers.find(candidate=>candidate.classes.includes('lini-caption')&&candidate.parentId===id&&candidate.texts.includes(norm(group.label)));
   const topClearance=parent&&caption?caption.bounds.y-parent.containerBounds.y:-Infinity;
   const childClearance=caption?child.containerBounds.y-(caption.bounds.y+caption.bounds.height):-Infinity;
   if(Number.isFinite(topClearance)&&Number.isFinite(childClearance))nestedCaptionClearances.push(`${group.id} ${topClearance.toFixed(2)}px parent / ${childClearance.toFixed(2)}px child`);
   if(!caption||topClearance<4||childClearance<4){containmentOk=false;containmentProblems.push(`nested group ${group.id} caption must clear its parent top boundary and child frame by 4 CSS px (measured ${Number.isFinite(topClearance)?topClearance.toFixed(2):'missing'}px / ${Number.isFinite(childClearance)?childClearance.toFixed(2):'missing'}px)`);}
  }
 }
 type LayoutMember={id:string;carrier:Carrier};
 const layoutSequence=(scope:string,layout:NonNullable<Visual['layout']>,members:LayoutMember[],defaultDirection:'LR'|'TB')=>{
  if(!members.length)return;
  if(layout.kind==='circular')return; // Dedicated presentation-circular-layout proof checks angular order and radius.
  const ids=new Set(members.map(member=>member.id)),ranked=(layout.order??[]).filter(id=>ids.has(id)),expected=[...ranked,...members.map(member=>member.id).filter(id=>!ranked.includes(id))];
  const center=(member:LayoutMember)=>({x:member.carrier.containerBounds.x+member.carrier.containerBounds.width/2,y:member.carrier.containerBounds.y+member.carrier.containerBounds.height/2});
  const direction=layout.kind==='flow'||layout.kind==='stack'?(layout.direction??defaultDirection):undefined;
  let actual:string[]=[];
  if(layout.kind!=='grid'){
   const axis=direction==='LR'?'x':'y';actual=[...members].sort((a,b)=>center(a)[axis]-center(b)[axis]).map(member=>member.id);
  }else{
   const columns=(layout as Extract<NonNullable<Visual['layout']>,{kind:'grid'}>).columns;
   const xCenters=[...members].map(member=>center(member).x).sort((a,b)=>a-b),clusters:number[]=[];
   for(const x of xCenters)if(!clusters.length||x-clusters.at(-1)!>12)clusters.push(x);
   if(clusters.length>columns||(members.length>=columns&&clusters.length<columns))containmentOk=false,containmentProblems.push(`${scope} grid uses ${clusters.length} visible columns; authored columns=${columns}`);
   if(columns===1&&xCenters.at(-1)!-xCenters[0]!>12)containmentOk=false,containmentProblems.push(`${scope} authored one-column grid is visibly spread across X`);
   const sorted=[...members].sort((a,b)=>center(a).y-center(b).y||center(a).x-center(b).x),rows:LayoutMember[][]=[];
   for(const member of sorted){const row=rows.at(-1);if(!row){rows.push([member]);continue;}const rowY=row.reduce((sum,item)=>sum+center(item).y,0)/row.length;if(Math.abs(center(member).y-rowY)>8)rows.push([member]);else row.push(member);}
   actual=rows.flatMap(row=>row.sort((a,b)=>center(a).x-center(b).x).map(member=>member.id));
  }
  if(JSON.stringify(actual)!==JSON.stringify(expected)){containmentOk=false;containmentProblems.push(`${scope} native direct-child order is ${actual.join(', ')}; expected ${expected.join(', ')}`);}
 };
 const layoutMember=(kind:'node'|'group'|'layer',id:string):LayoutMember|undefined=>{const native=kind==='node'?nativeFor(plan,'entity',id)??nativeFor(plan,'node',id):nativeFor(plan,kind,id),found=native?carrier(native):undefined;return found?{id,carrier:found}:undefined;};
 if(visual.form!=='stack'&&visual.layout){
  let rootMembers:LayoutMember[]=[];
  if(visual.kind==='structure'&&visual.form==='entities')rootMembers=(visual.nodes??[]).map(node=>layoutMember('node',node.id)).filter((item):item is LayoutMember=>!!item);
  else if(visual.kind==='flow')rootMembers=[...(visual.groups??[]).filter(group=>!group.parent).map(group=>layoutMember('group',group.id)),...(visual.nodes??[]).filter(node=>!node.group&&!node.parent).map(node=>layoutMember('node',node.id))].filter((item):item is LayoutMember=>!!item);
  layoutSequence('root',visual.layout,rootMembers,'LR');
 }
 for(const group of visualGroups){
  if(!group.layout)continue;
  const children=[...visualGroups.filter(child=>child.parent===group.id).map(child=>layoutMember('group',child.id)),...(visual.nodes??[]).filter(node=>node.group===group.id).map(node=>layoutMember('node',node.id))].filter((item):item is LayoutMember=>!!item);
  layoutSequence(`group ${group.id}`,group.layout,children,'TB');
 }
 if(visual.form==='stack'){
  const layers=visual.structure?.layers??[],direction=visual.layout?.kind==='stack'?(visual.layout.direction??'LR'):'TB',axis=direction==='LR'?'x':'y',implicitRowMembers=!visual.layout&&plan.approximations.some(item=>item.sourcePath===at('/structure/layers')&&item.representation.includes('members in source order from left to right'));let previous=-Infinity,previousGroup:Carrier|undefined;
  for(const layer of layers){
   const id=nativeFor(plan,'layer',layer.id),group=carrier(id??'','lini-group');if(!group){containmentOk=false;containmentProblems.push(`layer ${layer.id} carrier missing`);continue;}
   const position=axis==='x'?group.containerBounds.x+group.containerBounds.width/2:group.containerBounds.y+group.containerBounds.height/2;
   if(position<=previous){containmentOk=false;containmentProblems.push(`native layer bands do not follow authored ${direction==='LR'?'left-to-right':'top-to-bottom'} order`);}previous=position;
   if(direction==='TB'&&previousGroup){
    const layerNative=nativeFor(plan,'layer',layer.id),caption=dom?.carriers.find(candidate=>candidate.classes.includes('lini-caption')&&candidate.parentId===layerNative&&candidate.texts.includes(norm(layer.label)));
    const clearance=caption?caption.bounds.y-(previousGroup.containerBounds.y+previousGroup.containerBounds.height):-Infinity;
    if(Number.isFinite(clearance))stackCaptionClearances.push(`${layer.id} ${clearance.toFixed(2)}px`);
    if(!caption||clearance<4){containmentOk=false;containmentProblems.push(`layer ${layer.id} caption does not clear the preceding native layer boundary by 4 CSS px (measured ${Number.isFinite(clearance)?clearance.toFixed(2):'missing'}px)`);}
   }
    for(const node of (visual.nodes??[]).filter(item=>item.layer===layer.id)){const nodeId=nativeFor(plan,'node',node.id),nodeBox=nodeId?carrier(nodeId)?.containerBounds:undefined;if(!nodeBox||!contains(group.containerBounds,nodeBox)){containmentOk=false;containmentProblems.push(`layer ${layer.id} does not contain node ${node.id}`);}}
   const layerNodes=(visual.nodes??[]).filter(node=>node.layer===layer.id),nodeMembers=layerNodes.map(node=>layoutMember('node',node.id)).filter((item):item is LayoutMember=>!!item);
   if(implicitRowMembers){
    const scope=id?nativeMappedBlock(nativeAst,id):undefined,expectedIds=layerNodes.map(node=>nativeFor(plan,'node',node.id)),inventory=scope?directNativeChildInventory(scope.body):[],actualIds=inventory.flatMap(child=>child.id?[child.id]:[]),layoutValues=scope?nativePropertyValues(scope.properties,'layout'):[],directionValues=scope?nativePropertyValues(scope.properties,'direction'):[];
    if(!scope||layoutValues.length!==1||layoutValues[0]!=='flow'||directionValues.length!==1||directionValues[0]!=='row'){
     containmentOk=false;containmentProblems.push(`implicit stack layer ${layer.id} AST is not its mapped native flow row`);
    }
    if(expectedIds.some((id):id is undefined=>id===undefined)||JSON.stringify(actualIds)!==JSON.stringify(expectedIds)||inventory.length!==expectedIds.length+1||inventory.filter(child=>child.caption).length!==1){
     containmentOk=false;containmentProblems.push(`implicit stack layer ${layer.id} AST direct child order ${actualIds.join(', ')} differs from its mapped source members ${expectedIds.join(', ')}`);
    }
    for(const member of nodeMembers)if(member.carrier.parentId!==id){containmentOk=false;containmentProblems.push(`implicit stack layer ${layer.id} does not directly own mapped node ${member.id}`);}
    const centers=nodeMembers.map(member=>({id:member.id,x:member.carrier.containerBounds.x,y:member.carrier.containerBounds.y,width:member.carrier.containerBounds.width,height:member.carrier.containerBounds.height}));
    if(centers.length>1){
     const ys=centers.map(item=>item.y+item.height/2),aligned=Math.max(...ys)-Math.min(...ys)<=8;
     const leftToRight=centers.every((item,index)=>index===0||item.x>centers[index-1]!.x+centers[index-1]!.width-2);
     if(!aligned){containmentOk=false;containmentProblems.push(`implicit stack layer ${layer.id} members are not aligned in one visible row (center spread ${(Math.max(...ys)-Math.min(...ys)).toFixed(1)}px; limit 8px)`);}
     if(!leftToRight){containmentOk=false;containmentProblems.push(`implicit stack layer ${layer.id} members do not preserve mapped source order from left to right`);}
    }
   }else if(nodeMembers.length>1)layoutSequence(`layer ${layer.id} nodes`,{kind:'grid',columns:1,order:visual.layout?.order?.filter(id=>nodeMembers.some(item=>item.id===id))},nodeMembers,'TB');
   previousGroup=group;
  }
 }
 checks.push(pass('lini-containment-and-order',sourceSha256,containmentOk,containmentOk?`Native group/layer bounds contain their authored members; nested group captions clear both parent and child boundaries${nestedCaptionClearances.length?` (${nestedCaptionClearances.join(', ')})`:''}; stack layers retain authored order${stackCaptionClearances.length?`; native stack caption clearance from preceding layer boundary: ${stackCaptionClearances.join(', ')}.`:'.'}`:containmentProblems.join('; ')||'The inserted Lini SVG is unavailable.'));

 if(visual.kind==='flow'&&visual.form==='zoned'&&!visual.layout){
  const problems:string[]=[],tiered=(visual.groups??[]).map((group,index)=>({group,index})).filter(item=>!item.group.parent&&item.group.tier!==undefined).sort((a,b)=>a.group.tier!-b.group.tier!||a.index-b.index),tiers=[...new Set(tiered.map(item=>item.group.tier!))],wrapperByTier=new Map<number,string>(),rootLine=plan.source.split('\n').find(line=>line.trimStart().startsWith('|group#visual|'))??'',rootDirection=/direction:\s*(row|column);/u.exec(rootLine)?.[1],peerAxis=rootDirection==='row'?'y':rootDirection==='column'?'x':undefined;
  if(tiered.length&&!peerAxis)problems.push('renderer-owned zoned tier columns have no declared root flow direction');
  for(const tier of tiers){
   const peers=tiered.filter(item=>item.group.tier===tier),mapped=peers.map(item=>({group:item.group,item:plan.elementMap.find(candidate=>candidate.kind==='group'&&candidate.logicalId===item.group.id)}));
   const parents=mapped.map(({item})=>item?carrier(item.nativeId,'lini-group')?.parentId:undefined),parentIds=[...new Set(parents.filter((id):id is string=>!!id))];
   if(mapped.some(({item},index)=>!item||!parents[index])){problems.push(`tier ${tier} has a root group without a mapped native tier-column parent`);continue;}
   if(parentIds.length!==1){problems.push(`tier ${tier} peers do not share one renderer-owned column`);continue;}
   const wrapperId=parentIds[0]!,wrapper=carrier(wrapperId,'lini-group');wrapperByTier.set(tier,wrapperId);
   if(!wrapper||plan.elementMap.some(item=>item.nativeId===wrapperId)||wrapper.texts.length){problems.push(`tier ${tier} column ${wrapperId} is missing, mapped as source, or visibly labeled`);continue;}
   const orderedPeers=mapped.map(({group,item})=>({group,carrier:item?carrier(item.nativeId,'lini-group'):undefined}));
   for(const {group,carrier:child}of orderedPeers)if(!child||child.parentId!==wrapperId||!contains(wrapper.containerBounds,child.containerBounds))problems.push(`group ${group.id} is not contained by its renderer-owned tier ${tier} column`);
   if(peerAxis){const centers=orderedPeers.map(({carrier:child})=>child?child.containerBounds[peerAxis]+child.containerBounds[peerAxis==='x'?'width':'height']/2:NaN);if(centers.some((value,index)=>!Number.isFinite(value)||index>0&&value<=centers[index-1]!))problems.push(`tier ${tier} peer columns do not retain authored source order`);}
  }
  if(wrapperByTier.size!==tiers.length||new Set(wrapperByTier.values()).size!==tiers.length)problems.push('distinct root tiers do not have distinct renderer-owned columns');
  checks.push(pass('lini-zoned-tier-columns',sourceSha256,problems.length===0,problems.length?problems.join('; '):`${tiers.length} renderer-owned tier columns retain the exact mapped root groups, contain their peers, keep stable source order within equal tiers, and add no source group mappings.`));
 }

 if(visual.kind==='flow'&&(visual.form==='pipeline'||visual.form==='network')&&!visual.layout&&!(visual.groups?.length)&&(visual.nodes??[]).every(node=>!node.group&&!node.parent)&&plan.approximations.some(item=>item.sourcePath===at('/form')&&item.requested==='Directed flow with no authored layout')){
  const nodes=visual.nodes??[],edges=visual.edges??[],ranks=directedDagRanks(nodes.map(node=>node.id),edges.filter(edge=>edge.kind!=='return')),problems:string[]=[];
  const expectedNative=new Set(maps.filter(item=>item.kind==='node').map(item=>item.nativeId)),metadataNative=new Set(maps.filter(item=>item.kind==='annotation').map(item=>item.nativeId)),actualNative=(dom?.carriers??[]).filter(item=>item.classes.includes('lini-node')&&!item.classes.some(name=>['lini-group','lini-caption','lini-cell'].includes(name))&&!metadataNative.has(item.id)).map(item=>item.id);
  if(!ranks||ranks.size!==nodes.length)problems.push('authored non-return edges do not form the disclosed dependency-rank DAG');
  if(expectedNative.size!==nodes.length||actualNative.length!==nodes.length||actualNative.some(id=>!expectedNative.has(id))||[...expectedNative].some(id=>!actualNative.includes(id)))problems.push('native directed-flow node inventory differs from its mapped source-node inventory');
  const directionSource=plan.source.split('\n').find(line=>line.trimStart().startsWith('|group#diagram-content|'))??plan.source.split('\n').find(line=>line.trimStart().startsWith('|group#visual|'))??'',direction=/direction:\s*(row|column);/u.exec(directionSource)?.[1],axis=direction==='row'?'x':direction==='column'?'y':undefined,cross=axis==='x'?'y':'x';
  if(!axis)problems.push('compiled native dependency-rank direction is missing');
  const center=(id:string,coordinate:'x'|'y')=>{const item=carrier(id),box=item?.containerBounds;return box?box[coordinate]+box[coordinate==='x'?'width':'height']/2:undefined;};
  let previousRank=Number.NEGATIVE_INFINITY;
  if(ranks&&axis){
   const rankNumbers=[...new Set([...ranks.values()])].sort((a,b)=>a-b);
   for(const rank of rankNumbers){
    const members=nodes.filter(node=>ranks.get(node.id)===rank),rankCenters=members.map(node=>center(nativeFor(plan,'node',node.id)??'',axis)),crossCenters=members.map(node=>center(nativeFor(plan,'node',node.id)??'',cross));
    if(rankCenters.some(value=>value===undefined)||crossCenters.some(value=>value===undefined)){problems.push(`dependency rank ${rank} has a missing native node center`);continue;}
    const primary=rankCenters as number[],secondary=crossCenters as number[],rankCenter=primary.reduce((sum,value)=>sum+value,0)/primary.length;
    if(primary.some(value=>Math.abs(value-rankCenter)>4))problems.push(`dependency rank ${rank} nodes do not share their renderer-owned ${axis}-axis position`);
    if(rankCenter<=previousRank+8)problems.push(`dependency rank ${rank} does not follow its predecessor along native ${axis}`);
    previousRank=rankCenter;
    for(let index=1;index<secondary.length;index++)if(secondary[index]!<=secondary[index-1]!+1)problems.push(`dependency rank ${rank} does not preserve source sibling order along native ${cross}`);
   }
   for(const edge of edges.filter(item=>item.kind!=='return'))if((ranks.get(edge.to)??-1)<=(ranks.get(edge.from)??Number.MAX_SAFE_INTEGER))problems.push(`authored dependency ${edge.id} does not point to a later native rank`);
  }
  checks.push(pass('lini-directed-flow-dependency-ranks',sourceSha256,problems.length===0,problems.length?problems.join('; '):`All ${nodes.length} mapped source nodes occupy native longest-path ranks in compiled ${direction==='row'?'left-to-right':'top-to-bottom'} order; ties retain declaration order, and every authored non-return edge advances rank. No extra native node or dependency is present.`));
  const cardProblems:string[]=[],nodeMaps=maps.filter(item=>item.kind==='node'),seenNative=new Set<string>();if(nodeMaps.length!==nodes.length)cardProblems.push(`Source map has ${nodeMaps.length} node carriers for ${nodes.length} implicit DAG nodes.`);const cardRows:Array<{id:string;box:Box}>=[];
  for(const[index,node]of nodes.entries()){
   const rows=nodeMaps.filter(item=>item.logicalId===node.id);if(rows.length!==1||rows[0]?.sourcePath!==at(`/nodes/${index}/id`)){cardProblems.push(`Source node ${node.id} does not have exactly one source-indexed native card map.`);continue;}
   const nativeId=rows[0]!.nativeId;if(seenNative.has(nativeId)){cardProblems.push(`Multiple source nodes map to native card ${nativeId}.`);continue;}seenNative.add(nativeId);
   const carriers=dom?.carriers.filter(item=>item.id===nativeId&&item.classes.includes('lini-node')&&!item.classes.some(name=>['lini-group','lini-caption','lini-cell'].includes(name)))??[];if(carriers.length!==1){cardProblems.push(`Source node ${node.id} has ${carriers.length} exact native card carriers.`);continue;}
   const bounds=carriers[0]!.paintedBounds;if(!bounds||![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)||bounds.width<=0||bounds.height<=0){cardProblems.push(`Source node ${node.id} has no finite visible painted card outline.`);continue;}cardRows.push({id:node.id,box:bounds});
  }
  for(let left=0;left<cardRows.length;left++)for(let right=left+1;right<cardRows.length;right++){const first=cardRows[left]!,second=cardRows[right]!,overlapX=Math.min(first.box.x+first.box.width,second.box.x+second.box.width)-Math.max(first.box.x,second.box.x),overlapY=Math.min(first.box.y+first.box.height,second.box.y+second.box.height)-Math.max(first.box.y,second.box.y);if(overlapX>0&&overlapY>0)cardProblems.push(`Independent source node cards ${first.id} and ${second.id} overlap by ${overlapX.toFixed(2)}×${overlapY.toFixed(2)} CSS px.`);}
  checks.push(pass('lini-node-cards-non-overlap',sourceSha256,cardProblems.length===0,cardProblems.length?cardProblems.join('; '):`All ${cardRows.length} source-mapped implicit DAG node cards have unique painted native outlines and pairwise non-overlapping CSS bounds.`));
 }

 if(visual.kind==='timeline'&&(visual.form==='history'||visual.form==='milestones')){
  const events=visual.timeline?.events??[],datePlan=planDateHistoryEvents(events),eventMaps=maps.filter(item=>item.kind==='event'),problems:string[]=[];
  let timelineOk=!!dom?.svg&&!!datePlan?.ok;
  const rootMap=maps.find(item=>item.kind==='visual'&&item.logicalId===visual.id),scene=rootMap?carrier(rootMap.nativeId,'lini-group'):undefined,axis=carrier('timeline-axis','lini-line');
  if(eventMaps.length!==events.length){timelineOk=false;problems.push(`mapped event count ${eventMaps.length} differs from source event count ${events.length}`);}
  if(!scene){timelineOk=false;problems.push('native positioned timeline scene is missing');}
  if(!axis){timelineOk=false;problems.push('renderer-owned date baseline is missing');}
  if(dom?.carriers.some(item=>item.classes.includes('lini-chart'))||dom?.carriers.some(item=>item.classes.includes('lini-chart-text'))){timelineOk=false;problems.push('native scene exposes a quantitative chart axis for collision tracks');}
  if(!plan.approximations.some(item=>item.sourcePath===at('/timeline/events')&&item.representation.includes('rows carry no lane, measure, or chronology meaning'))){timelineOk=false;problems.push('renderer-only track meaning is not disclosed in the located event approximation');}
  const positions:Array<{index:number;day:number;marker:Carrier;label:Carrier}> = [];
  for(let index=0;index<events.length;index++){
   const event=events[index]!,mapped=eventMaps.find(item=>item.sourcePath===at('/timeline/events/'+index)),expectedNative='event'+(index+1),marker=carrier('mark'+(index+1),'lini-oval'),label=mapped?carrier(mapped.nativeId,'lini-node'):undefined;
   if(!mapped||mapped.logicalId!==event.id||mapped.nativeId!==expectedNative){timelineOk=false;problems.push(`event ${event.id} does not map to its original array index and native text carrier`);continue;}
   if(!marker){timelineOk=false;problems.push(`event ${event.id} native marker is missing`);continue;}
   if(!label||!label.texts.includes(norm(event.label+' · '+event.at))){timelineOk=false;problems.push(`event ${event.id} carrier does not own its exact source label and ISO date`);continue;}
   if(!containsBox(dom!.svgBounds,label.bounds)){timelineOk=false;problems.push(`event ${event.id} label is clipped by the native SVG viewport`);}
   const markerX=marker.containerBounds.x+marker.containerBounds.width/2,labelX=label.bounds.x+label.bounds.width/2;
   if(Math.abs(markerX-labelX)>2){timelineOk=false;problems.push(`event ${event.id} label is detached from its native date marker by ${(Math.abs(markerX-labelX)).toFixed(2)} CSS px`);}
   const markerY=marker.containerBounds.y+marker.containerBounds.height/2,axisY=axis?axis.containerBounds.y+axis.containerBounds.height/2:undefined;
   if(axisY!==undefined&&Math.abs(markerY-axisY)>2){timelineOk=false;problems.push(`event ${event.id} marker is detached from the shared date baseline`);}
   const match=mapped.sourcePath.match(/\/timeline\/events\/(\d+)$/u),row=match?datePlan?.ok?datePlan.events.find(item=>item.sourceIndex===Number(match[1])):undefined:undefined;
   if(!row){timelineOk=false;problems.push(`event ${event.id} has no validated UTC date coordinate`);continue;}
   positions.push({index,day:row.day,marker,label});
  }
  const sorted=[...positions].sort((a,b)=>a.day-b.day||a.index-b.index),first=sorted[0],last=sorted.at(-1),firstX=first?first.marker.containerBounds.x+first.marker.containerBounds.width/2:0,lastX=last?last.marker.containerBounds.x+last.marker.containerBounds.width/2:0,span=datePlan?.ok?datePlan.lastDay-datePlan.firstDay:0;
  if(span>0&&lastX<=firstX){timelineOk=false;problems.push('native event markers do not increase along the date axis');}
  if(span>0&&datePlan?.ok&&lastX>firstX){
   for(const row of datePlan.events){const current=positions.find(item=>item.index===row.sourceIndex);if(!current)continue;const x=current.marker.containerBounds.x+current.marker.containerBounds.width/2,actual=(x-firstX)/(lastX-firstX),expected=row.dayOffset/span;if(Math.abs(actual-expected)>0.006){timelineOk=false;problems.push(`event ${row.event.id} UTC date position differs from its affine axis ratio by ${Math.abs(actual-expected).toFixed(4)}`);}}
  }
  if(datePlan?.ok){
   for(let left=0;left<datePlan.events.length;left++)for(let right=left+1;right<datePlan.events.length;right++){
    const a=datePlan.events[left]!,b=datePlan.events[right]!,pa=positions.find(item=>item.index===a.sourceIndex),pb=positions.find(item=>item.index===b.sourceIndex);if(!pa||!pb)continue;
    const ax=pa.marker.containerBounds.x+pa.marker.containerBounds.width/2,bx=pb.marker.containerBounds.x+pb.marker.containerBounds.width/2;
    if(a.day===b.day&&Math.abs(ax-bx)>1){timelineOk=false;problems.push(`same-date events ${a.event.id} and ${b.event.id} do not share x`);}
    if(a.day===b.day){const ay=pa.label.bounds.y+pa.label.bounds.height/2,by=pb.label.bounds.y+pb.label.bounds.height/2;if(Math.abs(ay-by)<8){timelineOk=false;problems.push(`same-date event labels ${a.event.id} and ${b.event.id} share a collision row`);}}
   }
  }
  for(let left=0;left<positions.length;left++)for(let right=left+1;right<positions.length;right++){
   const a=positions[left]!.label.bounds,b=positions[right]!.label.bounds,overlapX=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x),overlapY=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
   if(overlapX>0&&overlapY>0){timelineOk=false;problems.push(`event labels ${positions[left]!.index} and ${positions[right]!.index} overlap by ${overlapX.toFixed(2)}×${overlapY.toFixed(2)} CSS px`);}
  }
  const dateDetails=timelineOk?`All ${events.length} mapped event carriers own their exact label and ISO date; native markers share the positioned date baseline and follow validated UTC day ratios. Equal dates share x, collision rows are distinct, and native label bounds are disjoint. No quantitative Y axis is present. Renderer-only date positioning and nonsemantic rows are disclosed.`:problems.join('; ')||'The native timeline proof is unavailable.';
  checks.push(pass('lini-timeline-events-and-date-scale',sourceSha256,timelineOk,dateDetails));
 }

 let fieldsOk=!!dom?.svg;const fieldProblems:string[]=[];
 for(let entityIndex=0;entityIndex<(visual.structure?.entities??[]).length;entityIndex++){
  const entity=visual.structure!.entities![entityIndex]!,entityId=nativeFor(plan,'entity',entity.node),entityCarrier=entityId?carrier(entityId,'lini-entity'):undefined;
  if(!entityCarrier){fieldsOk=false;fieldProblems.push(`entity ${entity.node} carrier missing`);continue;}
  for(let fieldIndex=0;fieldIndex<entity.fields.length;fieldIndex++){
   const field=entity.fields[fieldIndex]!,mapped=maps.find(item=>item.kind==='field'&&item.sourcePath===sourcePointer('structure/entities',entityIndex,`fields/${fieldIndex}`));
   const localId=mapped?.nativeId.split('.').at(-1),row=localId?entityCarrier.cells.find(cell=>cell.id===localId):undefined;
   const cells=entityCarrier.cells,position=row?cells.indexOf(row):-1,typeCell=position>=0?cells[position+1]:undefined;
   if(!row||norm(row.text)!==norm(fieldExpectedText(field))||!typeCell||norm(typeCell.text)!==norm(field.type??'')||Math.abs(typeCell.bounds.y-row.bounds.y)>2){fieldsOk=false;fieldProblems.push(`${entity.node}.${field.name}: name/badges and type are not in their native field row`);}
  }
 }
 checks.push(pass('lini-entity-field-rows',sourceSha256,fieldsOk,fieldsOk?`All ${visual.structure?.entities?.reduce((count,entity)=>count+entity.fields.length,0)??0} fields own their exact name/badges and same-row type cell${(visual.structure?.entities?.length??0)?'.':' (no entity fields are authored).'} `:fieldProblems.join('; ')||'The inserted Lini SVG is unavailable.' ));
 return checks;
}
