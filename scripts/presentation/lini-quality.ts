// SPDX-License-Identifier: MIT OR Apache-2.0
/** Lini-specific checks over the pinned desugared source and its inserted native SVG. */
import {createHash} from 'node:crypto';
import type {Page} from 'playwright';
import type {Document} from '@umf/core';
import {getVisual,type Visual,type VisualCardinality,type VisualMultiplicity} from '../../src/extensions/visual';
import type {PresentationPlan} from '../../src/presentation';
import type {PresentationQualityCheck} from './quality';
import {verifyLiniRichPresentationQuality} from './lini-rich-quality';

type Box={x:number;y:number;width:number;height:number};
type Carrier={id:string;classes:string[];texts:string[];title:string;style:string;bounds:Box;containerBounds:Box;rectRadii:number[];sheetPaths:number;sheetGeometry:Array<{bounds:Box;signature:string}>;groups:string[];parentId:string|null;cells:Array<{id:string|null;text:string;bounds:Box}>};
type Vector={x:number;y:number};
type Link={classes:string[];from:string|null;to:string|null;labels:string[];labelBounds:Box[];labelClearances:number[];bounds:Box;line:{start:Vector;end:Vector;startTangent:Vector;endTangent:Vector;samples:Vector[];d:string;curveDeviation:number}|null;markers:Array<{classes:string[];tag:string;d:string;length:number;center:Vector;orientation:Vector|null;points:Vector[];bounds:Box}>;arrows:number};
type EndpointProof={path:string;carrier:Carrier;host:Carrier;side?:string};
type NativeDom={svg:boolean;carriers:Carrier[];links:Link[];fontFamilies:Array<{text:string;inline:string;computed:string}>};
const sha=(value:string)=>createHash('sha256').update(Buffer.from(value,'utf8')).digest('hex');
const norm=(value:string)=>value.replace(/\s+/gu,' ').trim();
const hasOffsetSheetPair=(sheets:Array<{bounds:Box;signature:string}>)=>{for(let i=0;i<sheets.length;i++)for(let j=i+1;j<sheets.length;j++){const {bounds:a,signature:sa}=sheets[i]!,{bounds:b,signature:sb}=sheets[j]!,offset=Math.hypot(a.x+a.width/2-b.x-b.width/2,a.y+a.height/2-b.y-b.height/2),overlapWidth=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)),overlapHeight=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)),smaller=Math.min(a.width*a.height,b.width*b.height);if(sa===sb&&offset>1&&overlapWidth*overlapHeight>=smaller*.45)return true;}return false;};
const pass=(check:string,sourceSha256:string,ok:boolean,details:string):PresentationQualityCheck=>({check,sourceSha256,result:ok?'pass':'fail',details});
const at=(part:string)=>'/extensions/umf.visual'+(part.startsWith('/')?part:'/'+part);
const inside=(point:{x:number;y:number},box:Box,tolerance=20)=>point.x>=box.x-tolerance&&point.x<=box.x+box.width+tolerance&&point.y>=box.y-tolerance&&point.y<=box.y+box.height+tolerance;
const distToBox=(point:{x:number;y:number},box:Box)=>Math.hypot(Math.max(box.x-point.x,0,point.x-box.x-box.width),Math.max(box.y-point.y,0,point.y-box.y-box.height));
const boxGap=(a:Box,b:Box)=>Math.hypot(Math.max(b.x-a.x-a.width,0,a.x-b.x-b.width),Math.max(b.y-a.y-a.height,0,a.y-b.y-b.height));
const containsBox=(outer:Box,inner:Box)=>inner.x>=outer.x-2&&inner.y>=outer.y-2&&inner.x+inner.width<=outer.x+outer.width+2&&inner.y+inner.height<=outer.y+outer.height+2;
const nativeFor=(plan:PresentationPlan,kind:string,id:string)=>plan.elementMap.find(element=>element.kind===kind&&element.logicalId===id)?.nativeId;
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
 if(visual&&(visual.kind==='sequence'||visual.kind==='structure'&&visual.form==='tree'))return verifyLiniRichPresentationQuality(page,input);
 const nativeAst=typeof input.nativeAst==='string'?input.nativeAst:'';
 const maps=plan.elementMap;
 const requiredMapToken=(element:PresentationPlan['elementMap'][number]):string=>{
  if(element.kind==='edge'||element.kind==='reference')return'.'+element.nativeId;
  if(element.kind==='field'||element.kind==='port')return'#'+element.nativeId.split('.').at(-1);
  return'#'+element.nativeId;
 };
 const astAnchor=(element:PresentationPlan['elementMap'][number]):boolean=>{
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
   const ownTexts=(element:Element)=>[...element.querySelectorAll('text.lini-text')].filter(text=>text.closest('g.lini-node')===element).map(text=>normalize([...text.querySelectorAll('tspan')].map(span=>span.textContent??'').join(' ')||(text.textContent??''))).filter(Boolean);
   const carriers=[...svg.querySelectorAll('g.lini-node[data-id],g.lini-node.lini-caption')].map(element=>{
    const group=element as SVGGElement,id=group.dataset.id??'',ancestorGroups:string[]=[];let parent=group.parentElement;
    while(parent&&parent.tagName.toLowerCase()!=='svg'){if(parent.matches('g.lini-node.lini-group[data-id]'))ancestorGroups.unshift(parent.getAttribute('data-id')??'');parent=parent.parentElement;}
    const directCells=[...group.querySelectorAll(':scope > g.lini-node.lini-cell')].map(cell=>({id:cell.getAttribute('data-id'),text:ownTexts(cell).join(' '),bounds:box(cell)}));
    const ownShapes=[...group.querySelectorAll(':scope > rect,:scope > polygon,:scope > ellipse,:scope > path,:scope > circle')],shapeBoxes=ownShapes.map(box),containerBounds=shapeBoxes.length?{x:Math.min(...shapeBoxes.map(b=>b.x)),y:Math.min(...shapeBoxes.map(b=>b.y)),width:Math.max(...shapeBoxes.map(b=>b.x+b.width))-Math.min(...shapeBoxes.map(b=>b.x)),height:Math.max(...shapeBoxes.map(b=>b.y+b.height))-Math.min(...shapeBoxes.map(b=>b.y))}:box(group);
    const rectRadii=[...group.querySelectorAll(':scope > rect')].map(rect=>Number(rect.getAttribute('rx')??0));
    const sheetElements=[...group.querySelectorAll(':scope > path,:scope > g:not(.lini-node) > path')],sheetGeometry=sheetElements.map(element=>({bounds:box(element),signature:(element.getAttribute('d')??'').replace(/\s+/gu,' ').trim()})),sheetPaths=sheetElements.length;
    return{id,classes:[...group.classList],texts:ownTexts(group),title:group.querySelector(':scope > title')?.textContent?.trim()??'',style:group.getAttribute('style')??'',bounds:box(group),containerBounds,rectRadii,sheetPaths,sheetGeometry,groups:ancestorGroups,parentId:group.parentElement?.closest('g.lini-node[data-id]')?.getAttribute('data-id')??null,cells:directCells};
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
    return{classes:[...group.classList],from:group.getAttribute('data-from'),to:group.getAttribute('data-to'),labels:labelElements.map(text=>normalize(text.textContent??'')).filter(Boolean),labelBounds:labelElements.map(box),labelClearances,bounds:box(group),line:start&&end&&line?{start,end,startTangent:tangent(line,0,length)??{x:0,y:0},endTangent:tangent(line,length,length)??{x:0,y:0},samples,d:line.getAttribute('d')??'',curveDeviation:curveDeviation(line)}:null,markers:markerElements.map(marker=>{const graphics=marker as SVGGraphicsElement,b=box(marker),matrix=graphics.getScreenCTM(),vertices=marker instanceof SVGPolygonElement?[...marker.points].map(point=>{const screen=new DOMPoint(point.x,point.y).matrixTransform(matrix!);return{x:screen.x-origin.x,y:screen.y-origin.y};}):[],markerPath=marker instanceof SVGPathElement?marker:undefined,markerLength=markerPath?.getTotalLength()??0,orientation=markerPath&&markerLength>0?tangent(markerPath,0,markerLength):null;return{classes:[...marker.classList],tag:marker.tagName.toLowerCase(),d:marker.getAttribute('d')??'',length:markerLength,center:{x:b.x+b.width/2,y:b.y+b.height/2},orientation,points:vertices,bounds:b};}),arrows:group.querySelectorAll('.lini-marker-arrow').length};
   });
   const fontFamilies=[...svg.querySelectorAll('text')].map(element=>({text:normalize(element.textContent??''),inline:(element as SVGTextElement).style.fontFamily,computed:getComputedStyle(element).fontFamily}));
   return{svg:svg.matches('svg.lini'),carriers,links,fontFamilies};
  });
 }catch{/* emitted evidence below */}

 const carrier=(id:string,requiredClass?:string)=>dom?.carriers.find(item=>item.id===id&&(!requiredClass||item.classes.includes(requiredClass)));
 const linkFor=(element:PresentationPlan['elementMap'][number])=>dom?.links.find(link=>link.classes.includes('lini-style-'+element.nativeId));
 const sourcePointer=(kind:string,index:number,field='')=>at(`/${kind}/${index}${field?'/'+field:''}`);
 let carriersOk=!!dom?.svg&&!!dom.carriers.length;
 const missing:string[]=[];
 for(const item of maps){
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
  else if(item.kind==='annotation')expected=visual.annotations?.find(annotation=>annotation.id===item.logicalId)?.text??'';
  const groupCaption=item.kind==='group'?dom?.carriers.find(candidate=>candidate.classes.includes('lini-caption')&&candidate.texts.some(text=>text.includes(norm(expected)))&&containsBox(found.bounds,candidate.bounds)):undefined;
  const visibleLabel=!!expected&&(found.texts.includes(norm(expected))||found.cells.some(cell=>norm(cell.text)===norm(expected))||!!groupCaption||!!dom?.carriers.some(candidate=>candidate.classes.includes('lini-caption')&&candidate.texts.includes(norm(expected))&&containsBox(found.bounds,candidate.bounds)));
  const shape=visual.nodes?.find(node=>node.id===item.logicalId)?.shape,visibleShapeFallback=!!shape&&found.texts.some(text=>text.startsWith(norm(expected)+' (shape: '+shape+')'));
  if(expected&&!visibleLabel&&!visibleShapeFallback){carriersOk=false;missing.push(`${item.kind} label ${item.logicalId}`);}
  if(item.kind==='annotation'){
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
  if(expectedLabel&&link.labels.join(' ')!==norm(expectedLabel)){endpointOk=false;endpointProblems.push(`${mapItem.logicalId}: authored link label or exact range text is missing`);}
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
    if(!link?.line||!link.labelBounds.length||link.labelClearances.some(clearance=>clearance<8)){endpointOk=false;endpointProblems.push(`${edge.id}: owned caption is less than 8 CSS px clear of its native connector`);}
    if(link?.labelBounds.some(label=>link.markers.some(marker=>overlaps(label,marker.bounds))||!!fromCarrier&&overlaps(label,fromCarrier.bounds)||!!toCarrier&&overlaps(label,toCarrier.bounds))){endpointOk=false;endpointProblems.push(`${edge.id}: owned caption overlaps an endpoint marker or node`);}
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
  const layers=visual.structure?.layers??[],direction=visual.layout?.kind==='stack'?(visual.layout.direction??'LR'):'TB',axis=direction==='LR'?'x':'y';let previous=-Infinity,previousGroup:Carrier|undefined;
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
   const nodeMembers=(visual.nodes??[]).filter(node=>node.layer===layer.id).map(node=>layoutMember('node',node.id)).filter((item):item is LayoutMember=>!!item);
   if(nodeMembers.length>1)layoutSequence(`layer ${layer.id} nodes`,{kind:'grid',columns:1,order:visual.layout?.order?.filter(id=>nodeMembers.some(item=>item.id===id))},nodeMembers,'TB');
   previousGroup=group;
  }
 }
 checks.push(pass('lini-containment-and-order',sourceSha256,containmentOk,containmentOk?`Native group/layer bounds contain their authored members; nested group captions clear both parent and child boundaries${nestedCaptionClearances.length?` (${nestedCaptionClearances.join(', ')})`:''}; stack layers retain authored order${stackCaptionClearances.length?`; native stack caption clearance from preceding layer boundary: ${stackCaptionClearances.join(', ')}.`:'.'}`:containmentProblems.join('; ')||'The inserted Lini SVG is unavailable.'));

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
