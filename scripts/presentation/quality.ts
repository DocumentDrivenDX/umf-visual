// SPDX-License-Identifier: MIT OR Apache-2.0
/** Independent checks against the native AST and the renderer's own SVG carriers. */
import {createHash} from 'node:crypto';
import type {Page} from 'playwright';
import type {Document} from '@umf/core';
import {getVisual,type Visual,type VisualMultiplicity} from '../../src/extensions/visual';
import type {PresentationElement,PresentationPlan} from '../../src/presentation';
import {stateTransitionCaption} from '../../src/presentation/state';
import {planDateHistoryEvents} from '../../src/presentation/timeline-layout';
import {nativeAnnotationFooterChildren,verifyLiniPresentationQuality} from './lini-quality';
import {verifyNestedBrowserQuality} from './nested-quality';
import {verifyLanesPresentationQuality} from './lanes-quality';
import {verifyGraphvizGroupHeaderQuality} from './graphviz-group-header-quality';

export interface PresentationQualityCheck {
 check:string;
 sourceSha256:string;
 result:'pass'|'fail';
 details:string;
}

type NativeAst={objects?:Record<string,unknown>[];edges?:Record<string,unknown>[];rankdir?:string};
type QualityBox={x:number;y:number;width:number;height:number};
const sha=(s:string)=>createHash('sha256').update(Buffer.from(s,'utf8')).digest('hex');
const pass=(check:string,sourceSha256:string,ok:boolean,details:string):PresentationQualityCheck=>({check,sourceSha256,result:ok?'pass':'fail',details});
const text=(v:unknown)=>typeof v==='string'?v:'';
const norm=(s:string)=>s.replace(/\s+/g,' ').trim();
const compact=(s:string)=>s.replace(/\s+/g,'');
const normLabel=(s:string)=>norm(s).replace(/\s*\/\s*/g,'/');
const mermaidStateText=(value:string)=>Array.from(value,(char)=>({' ':'#32;','#':'#35;','&':'#38;','"':'#34;','<':'#60;','>':'#62;',';':'#59;','(':'#40;',')':'#41;','[':'#91;',']':'#93;','{':'#123;','}':'#125;','\\':'#92;'} as Record<string,string>)[char]??char).join('');
const decodeMermaidText=(value:string)=>value.replace(/<br\s*\/?>/giu,'\n').replace(/#(\d+);/gu,(_,digits:string)=>String.fromCodePoint(Number(digits)));
const mermaidTimelineText=(value:string)=>value.replace(/\r/g,'').split('\n').map(line=>Array.from(line,(char)=>({' ':'#32;','#':'#35;','&':'#38;','"':'#34;','<':'#60;','>':'#62;',';':'#59;','(':'#40;',')':'#41;','[':'#91;',']':'#93;','{':'#123;','}':'#125;','\\':'#92;'} as Record<string,string>)[char]??char).join('')).join('<br/>');
const hasOffsetSheetPair=(boxes:QualityBox[])=>{const unique=boxes.filter((box,index)=>!boxes.slice(0,index).some(other=>Math.abs(box.x-other.x)<1&&Math.abs(box.y-other.y)<1&&Math.abs(box.width-other.width)<1&&Math.abs(box.height-other.height)<1));for(let i=0;i<unique.length;i++)for(let j=i+1;j<unique.length;j++){const a=unique[i]!,b=unique[j]!,offset=Math.hypot(a.x+a.width/2-b.x-b.width/2,a.y+a.height/2-b.y-b.height/2),overlapWidth=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)),overlapHeight=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)),smaller=Math.min(a.width*a.height,b.width*b.height);if(offset>2&&overlapWidth*overlapHeight>=smaller*.45)return true;}return false;};
const decodeDotLabel=(s:string)=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n:string)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n:string)=>String.fromCodePoint(parseInt(n,16)));
// Entity annotation labels protect authored ampersands with one DOT-visible
// `&amp;` layer; remove only that wrapper, never resolve the user's entity text.
const decodeGraphvizLabel=(source:string)=>{const dotText=source.replace(/&amp;/gu,'&');let result='';for(let index=0;index<dotText.length;index++){const char=dotText[index]!;if(char==='\\'&&index+1<dotText.length){const next=dotText[++index]!;if(next==='n'||next==='l'||next==='r')result+='\n';else if(next==='t')result+='\t';else if(next==='\\'||next==='"')result+=next;else result+='\\'+next;}else result+=char;}return result;};
const escRe=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const exactFieldText=(candidate:string,name:string,type:string|undefined)=>{
 const value=norm(candidate.replace(/\u00a0/g,' '));
 if(!type)return value===norm(name);
 return new RegExp(`(?:^|\\s)${escRe(name)}\\s*:\\s*${escRe(type)}(?:$|\\s)`).test(value);
};
const FIELD_BADGE_TOKENS=new Set(['PK','FK','UK','NULL','NOT NULL']);
const fieldBadgeTokens=(value:string):string[]|undefined=>{
 const normalized=norm(value).toUpperCase();if(!normalized)return[];
 const tokens=normalized.split(/\s*[·,]\s*/u).map(norm);
 return tokens.every(token=>FIELD_BADGE_TOKENS.has(token))?tokens:undefined;
};
const exactBadgeSet=(actual:string[],expected:string[])=>actual.length===expected.length&&[...actual].sort().every((token,index)=>token===[...expected].sort()[index]);
const dotRowBadgeTokens=(row:string):string[]|undefined=>{
 const fontRuns=[...row.matchAll(/<FONT\b[^>]*>([\s\S]*?)<\/FONT>/giu)].map(match=>decodeDotLabel((match[1]??'').replace(/<[^>]*>/gu,' ')));
 const tokens:string[]=[];
 for(const run of fontRuns){const parsed=fieldBadgeTokens(run);if(!parsed||parsed.length===0)return undefined;tokens.push(...parsed);}
 return tokens;
};
const dotRowHasOrderedBadgePrefix=(row:string,expectsBadges:boolean,fieldText:string)=>{
 const runs=[...row.matchAll(/<FONT\b[^>]*>[\s\S]*?<\/FONT>/giu)];
 const structural=norm(decodeDotLabel(row.replace(/<FONT\b[^>]*>[\s\S]*?<\/FONT>/giu,' __UMF_FIELD_BADGE__ ').replace(/<[^>]*>/gu,' ')));
 const expected=norm(`${Array.from({length:runs.length},()=> '__UMF_FIELD_BADGE__').join(' ')} ${fieldText}`);
 return (expectsBadges?runs.length>0:runs.length===0)&&structural===expected;
};
const elementFor=(plan:PresentationPlan,kind:PresentationElement['kind'],sourcePath:string)=>plan.elementMap.find(e=>e.kind===kind&&e.sourcePath===sourcePath);
const stateCaptionFromSource=(transition:NonNullable<Visual['state']>['transitions'][number])=>transition.path===undefined
 ?stateTransitionCaption(transition)
 :[`Path: ${transition.path} —`,transition.event,transition.guard?`[${transition.guard}]`:undefined,transition.action?`/ ${transition.action}`:undefined].filter((part):part is string=>part!==undefined&&part!=='').join(' ');
const objectName=(o:Record<string,unknown>)=>text(o.name);
const nativeIdForNode=(plan:PresentationPlan,id:string)=>plan.elementMap.find(e=>e.kind==='node'&&e.logicalId===id)?.nativeId
 ??plan.elementMap.find(e=>e.kind==='entity'&&e.logicalId===id)?.nativeId;
const portFor=(plan:PresentationPlan,nodeId:string,field:string|undefined,visual:Visual)=>{
 if(!field)return undefined;
 const entityIndex=(visual.structure?.entities??[]).findIndex(e=>e.node===nodeId);
 const entity=(visual.structure?.entities??[])[entityIndex];if(!entity)return undefined;
 const fieldIndex=entity.fields.findIndex(f=>f.id===field||f.name===field);if(fieldIndex<0)return undefined;
 return elementFor(plan,'field',`/extensions/umf.visual/structure/entities/${entityIndex}/fields/${fieldIndex}`)?.nativeId;
};
const namedPortFor=(plan:PresentationPlan,nodeId:string,portId:string|undefined,visual:Visual)=>{
 if(!portId)return undefined;
 const nodeIndex=(visual.nodes??[]).findIndex(node=>node.id===nodeId),node=visual.nodes?.[nodeIndex],portIndex=node?.ports?.findIndex(port=>port.id===portId)??-1;
 if(nodeIndex<0||portIndex<0)return undefined;
 const sourcePath=`/extensions/umf.visual/nodes/${nodeIndex}/ports/${portIndex}`,rows=plan.elementMap.filter(item=>item.kind==='port'&&item.sourcePath===sourcePath),element=rows[0];
 const authoredSide=node!.ports![portIndex]!.side,side=authoredSide?({'north':'n',east:'e',south:'s',west:'w'} as const)[authoredSide]:undefined;
 const owner=nativeIdForNode(plan,nodeId);
 return rows.length===1&&element?.logicalId===portId&&!!owner&&element.nativeId===`${owner}.p${portIndex+1}`?{port:`p${portIndex+1}${side?`:${side}`:''}`,side}:undefined;
};

/**
 * Checks that source-bound records have native carriers and that rendered geometry
 * remains usable at the declared 1600×900 presentation viewport. The verifier never
 * accepts a word elsewhere in the SVG as evidence for an element.
 */
export async function verifyPresentationQuality(
 page:Page,
 input:{svg:string;document:Document;plan:PresentationPlan;nativeAst?:unknown},
):Promise<PresentationQualityCheck[]> {
 const {svg,document,plan}=input,sourceSha256=sha(plan.source),checks:PresentationQualityCheck[]=[];
 let visual:Visual|undefined;
 try{visual=getVisual(document);}catch{/* reported below */}
 checks.push(pass('native-source-hash',sourceSha256,sourceSha256.length===64,`SHA-256 of ${new TextEncoder().encode(plan.source).length} UTF-8 source bytes.`));
 checks.push(pass('document-visual-present',sourceSha256,!!visual,'The supplied UMF document contains a readable umf.visual payload.'));
 if(!visual){return checks;}

 // Native SVG inspection is isolated in the page and uses object ownership / bounds.
 await page.setViewportSize({width:1600,height:900});
 await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:#fff}#frame{width:1600px;height:900px;display:flex;align-items:center;justify-content:center}#frame svg{display:block;max-width:1600px;max-height:900px;width:auto;height:auto}</style><div id="frame"></div>',{waitUntil:'domcontentloaded'});
 await page.locator('#frame').evaluate((el,markup)=>{el.innerHTML=markup;},svg);
 await page.locator('#frame svg').evaluate(root=>{const element=root as SVGSVGElement;element.style.maxWidth='none';element.style.maxHeight='none';element.style.width='100%';element.style.height='100%';});
 if(visual.kind==='flow'&&visual.form==='lanes')checks.push(...await verifyLanesPresentationQuality(page,{plan,visual,nativeAst:input.nativeAst}));
 if(plan.backend!=='lini'&&visual.kind==='structure'&&visual.form==='nested')checks.push(...await verifyNestedBrowserQuality(page,{plan,visual,nativeAst:input.nativeAst}));
 const dom=await page.locator('#frame svg').evaluate((root)=>{
  const s=root as SVGSVGElement,view=s.viewBox.baseVal,rootRect=s.getBoundingClientRect();
  const normalize=(s:string)=>s.replace(/\s+/g,' ').trim();
  const visibleText=(el:Element)=>{
   // Mermaid commonly wraps a single visible label across HTML <br> elements
   // inside foreignObject. `textContent` erases those visual separators and can
   // make "target projection" appear as "targetprojection" to this verifier.
   const html=(el.matches('foreignObject')?el.querySelector('div,p,span'):el) as HTMLElement|null;
   if(html&&typeof html.innerText==='string')return normalize(html.innerText);
   const collect=(node:Node):string=>{
    if(node.nodeType===Node.TEXT_NODE)return node.nodeValue??'';
    if(node.nodeType!==Node.ELEMENT_NODE)return '';
    const element=node as Element,tag=element.tagName.toLowerCase();
    if(tag==='br')return ' ';
    let value='';
    for(const child of [...node.childNodes]){
     if(child instanceof Element&&child.tagName.toLowerCase()==='tspan'&&value&& (child.hasAttribute('dy')||child.hasAttribute('x')))value+=' ';
     value+=collect(child);
    }
    return value;
   };
   return normalize(collect(el));
  };
  const box=(el:Element)=>{const r=el.getBoundingClientRect();return{x:r.x-rootRect.x,y:r.y-rootRect.y,width:r.width,height:r.height};};
  const paintAlpha=(value:string)=>{const color=value.trim().toLowerCase();if(color==='none'||color==='transparent')return 0;if(/^#[\da-f]{3,8}$/u.test(color)||/^[a-z]+$/u.test(color))return 1;const match=/^([a-z-]+)\(([^)]*)\)$/iu.exec(color);if(!match)return 0;const fn=match[1]!.toLowerCase(),body=match[2]!,supportsAlpha=['rgb','rgba','hsl','hsla','hwb','lab','lch','oklab','oklch','color'].includes(fn);if(!supportsAlpha)return 0;const slash=body.split('/');let alpha='1';if(slash.length>1){if(slash.length!==2)return 0;alpha=slash[1]!.trim().split(/[\s,]+/u)[0]??'1';}else{const comma=body.includes(','),parts=comma?body.split(',').map(item=>item.trim()):body.trim().split(/\s+/u);if(comma&&parts.length>=4)alpha=parts.at(-1)!;else if(!comma&&parts.length>=4&&['rgb','rgba','hsl','hsla'].includes(fn))alpha=parts.at(-1)!;}if(alpha==='none')return 0;const number=parseFloat(alpha);return Number.isFinite(number)?alpha.endsWith('%')?number/100:number:0;};
  const paintedGraphic=(element:Element)=>{let ancestor:Element|null=element,opacity=1;while(ancestor){const style=getComputedStyle(ancestor),alpha=Number(style.opacity);if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||!Number.isFinite(alpha))return false;opacity*=alpha;ancestor=ancestor.parentElement;}const style=getComputedStyle(element);return opacity>0&&(paintAlpha(style.stroke)*Number(style.strokeOpacity)*Number.parseFloat(style.strokeWidth||'0')>0||paintAlpha(style.fill)*Number(style.fillOpacity)>0);};
  const paintedLeaves=(el:Element)=>{const walker=globalThis.document.createTreeWalker(el,NodeFilter.SHOW_TEXT);const leaves:Array<{value:string;painted:boolean}>=[];while(walker.nextNode()){const node=walker.currentNode as Text,value=node.nodeValue??'';if(!value.trim())continue;let current=node.parentElement,opacity=1,visible=true;while(current){const style=getComputedStyle(current),alpha=Number(style.opacity);if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse')visible=false;opacity*=Number.isFinite(alpha)?alpha:1;current=current.parentElement;}const style=getComputedStyle(node.parentElement!),svgText=node.parentElement!.namespaceURI==='http://www.w3.org/2000/svg',fill=paintAlpha(style.fill)*Number(style.fillOpacity),stroke=paintAlpha(style.stroke)*Number(style.strokeOpacity)*(Number.parseFloat(style.strokeWidth)||0),color=paintAlpha(style.color);leaves.push({value,painted:visible&&opacity>0&&(svgText?fill>0||stroke>0:color>0)});}return leaves;};
  const curveDeviation=(path:SVGPathElement)=>{const length=path.getTotalLength();if(length<=0)return 0;const point=(at:number)=>{const p=path.getPointAtLength(at),matrix=path.getScreenCTM();return matrix?new DOMPoint(p.x,p.y).matrixTransform(matrix):p;},a=point(0),b=point(length),dx=b.x-a.x,dy=b.y-a.y,span=Math.hypot(dx,dy)||1;let deviation=0;for(let index=1;index<12;index++){const p=point(length*index/12);deviation=Math.max(deviation,Math.abs(dy*p.x-dx*p.y+b.x*a.y-b.y*a.x)/span);}return deviation;};
  const titleOf=(g:Element)=>normalize(g.querySelector(':scope > title')?.textContent??'');
  const ownedPolygonElements=[...s.querySelectorAll('g.node,g.cluster,g.edge,g.lini-node[data-id]')].map(g=>({g,elements:[...g.querySelectorAll('polygon')].filter(polygon=>polygon.closest('g.node,g.cluster,g.edge')===g)}));
  const carriers=[...s.querySelectorAll('g.node,g.cluster,g.edge,g.lini-node[data-id]')].map(g=>{const elements=ownedPolygonElements.find(item=>item.g===g)?.elements??[],nativePolygons=elements.map(box),paintedPolygonFlags=elements.map(paintedGraphic),primaryPolygon=[...nativePolygons].sort((a,b)=>b.width*b.height-a.width*a.height)[0],shapeTags=[...g.querySelectorAll(':scope > rect,:scope > polygon,:scope > ellipse,:scope > path,:scope > circle')].map(shape=>({tag:shape.tagName.toLowerCase(),radius:Number(shape.getAttribute('rx')??0)}));return({
   cls:g.getAttribute('class')??'',title:titleOf(g),id:g.getAttribute('id')??g.getAttribute('data-id')??'',shapeTags,nativeAnnotationShape:g.classList.contains('lini-box')&&g.classList.contains('lini-block')&&!g.classList.contains('lini-group')||g.classList.contains('node')&&(g.querySelector('rect.text')!==null||shapeTags.length===0),polygonPoints:[...g.querySelectorAll(':scope > polygon')].map(polygon=>{const element=polygon as SVGPolygonElement,points=[...element.points].map(point=>{const screen=new DOMPoint(point.x,point.y).matrixTransform(element.getScreenCTM()!);return{x:screen.x-rootRect.x,y:screen.y-rootRect.y};});return points.length>1&&Math.hypot(points[0]!.x-points.at(-1)!.x,points[0]!.y-points.at(-1)!.y)<.5?points.slice(0,-1):points;}),
   ancestorClusters:(()=>{const ids:string[]=[];let p=g.parentElement;while(p&&p.tagName.toLowerCase()!=='svg'){if(p.matches('g.cluster'))ids.push(p.getAttribute('id')??'');p=p.parentElement;}return ids;})(),
   ownText:[...g.querySelectorAll('text,foreignObject')].filter(el=>el.closest('g.node,g.cluster,g.edge,g.lini-node[data-id]')===g).map(visibleText).filter(Boolean),
   ownTextDetails:[...g.querySelectorAll('text,foreignObject')].filter(el=>el.closest('g.node,g.cluster,g.edge,g.lini-node[data-id]')===g).map(el=>{const baseline=el instanceof SVGTextElement&&el.y.baseVal.length?new DOMPoint(0,el.y.baseVal.getItem(0).value).matrixTransform(el.getScreenCTM()!).y-rootRect.y:undefined,paintLeaves=paintedLeaves(el);return({value:visibleText(el),bounds:box(el),baseline,paintLeaves,painted:paintLeaves.length>0&&paintLeaves.every(leaf=>leaf.painted)});}).filter(x=>x.value),
   bounds:box(g),
   polygon:primaryPolygon??null,
   polygons:nativePolygons,paintedPolygonFlags,
   paths:[...g.querySelectorAll(':scope path')].filter(path=>!g.classList.contains('edge')||path.closest('g.edge')===g).map(p=>{
    const path=p as SVGPathElement,point=(at:number)=>{try{const q=path.getPointAtLength(at),screen=new DOMPoint(q.x,q.y).matrixTransform(path.getScreenCTM()!);return{x:screen.x-rootRect.x,y:screen.y-rootRect.y};}catch{return null;}};
    const length=path.getTotalLength(),matrix=path.getScreenCTM()!,lengthCss=length*Math.sqrt((matrix.a**2+matrix.b**2+matrix.c**2+matrix.d**2)/2);return{d:path.getAttribute('d')??'',length,lengthCss,scaleX:Math.hypot(matrix.a,matrix.b),scaleY:Math.hypot(matrix.c,matrix.d),dashArray:getComputedStyle(path).strokeDasharray,markerEnd:path.getAttribute('marker-end'),painted:paintedGraphic(path),bounds:box(p),start:point(0),end:point(length),curveDeviation:curveDeviation(path)};
   }),
   // Graphviz wraps an edge's path and arrow in a nested <a> when `tooltip`
   // is present. Keep ownership scoped to this nearest edge group while
   // allowing those native link wrappers.
   arrow:(g.classList.contains('edge')?[...g.querySelectorAll('polygon')].some(polygon=>polygon.closest('g.edge')===g):g.querySelector(':scope > polygon')!==null),
   arrowPoints:(()=>{const polygon=(g.classList.contains('edge')?[...g.querySelectorAll('polygon')].find(candidate=>candidate.closest('g.edge')===g):g.querySelector(':scope > polygon')) as SVGPolygonElement|undefined;if(!polygon||polygon.points.numberOfItems<3)return[];return[...polygon.points].map(point=>{const screen=new DOMPoint(point.x,point.y).matrixTransform(polygon.getScreenCTM()!);return{x:screen.x-rootRect.x,y:screen.y-rootRect.y};});})(),
   fontSizes:[...g.querySelectorAll('text')].map(t=>{const v=parseFloat(getComputedStyle(t).fontSize);return Number.isFinite(v)?v:0;}).filter(v=>v>0),
  });});
  const allText=[...s.querySelectorAll('text,foreignObject')].map(el=>({value:visibleText(el),bounds:box(el),size:el instanceof SVGTextElement?parseFloat(getComputedStyle(el).fontSize):parseFloat(getComputedStyle(el).fontSize),owner:(el.closest('g.node,g.cluster,g.edge')?.querySelector(':scope > title')?.textContent??'').trim()})).filter(x=>x.value);
  const paths=[...s.querySelectorAll('path[data-edge="true"]')].map(p=>{
   const path=p as SVGPathElement,point=(at:number)=>{try{const q=path.getPointAtLength(at),screen=new DOMPoint(q.x,q.y).matrixTransform(path.getScreenCTM()!);return{x:screen.x-rootRect.x,y:screen.y-rootRect.y};}catch{return null;}};
   const length=path.getTotalLength(),matrix=path.getScreenCTM()!,lengthCss=length*Math.sqrt((matrix.a**2+matrix.b**2+matrix.c**2+matrix.d**2)/2),samples=Array.from({length:49},(_,index)=>point(length*(index+1)/50));return{id:path.getAttribute('id')??'',dataId:path.getAttribute('data-id')??'',className:path.getAttribute('class')??'',dashArray:getComputedStyle(path).strokeDasharray,d:path.getAttribute('d')??'',lengthCss,markerStart:path.getAttribute('marker-start'),markerEnd:path.getAttribute('marker-end'),start:point(0),end:point(length),samples,curveDeviation:curveDeviation(path)};
  });
  const edgeLabels=[...s.querySelectorAll('g.edgeLabel')].map(el=>{const label=el.querySelector('g.label') as Element|null;return{id:label?.getAttribute('data-id')??'',text:visibleText(el),painted:!!label&&paintedLeaves(label).length>0&&paintedLeaves(label).every(leaf=>leaf.painted)};}).filter(x=>x.text);
  const statePaths=[...s.querySelectorAll('g.edgePath')].map(group=>{const path=group.querySelector(':scope > path') as SVGPathElement|null;if(!path)return undefined;const length=path.getTotalLength(),matrix=path.getScreenCTM()!,point=(at:number)=>{try{const p=path.getPointAtLength(at),screen=new DOMPoint(p.x,p.y).matrixTransform(matrix);return{x:screen.x-rootRect.x,y:screen.y-rootRect.y};}catch{return null;}};return{id:group.getAttribute('id')??'',cls:group.getAttribute('class')??'',title:titleOf(group),dataId:path.getAttribute('data-id')??'',markerStart:path.getAttribute('marker-start'),markerEnd:path.getAttribute('marker-end'),d:path.getAttribute('d')??'',start:point(0),end:point(length),bounds:box(path)};}).filter((item):item is NonNullable<typeof item>=>!!item);
  const stateNodes=carriers.filter(item=>item.cls.split(/\s+/u).includes('node')).map(item=>({id:item.id,title:item.title,cls:item.cls,ownText:item.ownText,bounds:item.bounds,shapeTags:item.shapeTags}));
  return {viewBox:{x:view.x,y:view.y,width:view.width,height:view.height},root:{width:rootRect.width,height:rootRect.height},svgId:s.id,carriers,allText,paths,edgeLabels,statePaths,stateNodes};
 });
 const meaningfulSvg=dom.viewBox.width>0&&dom.viewBox.height>0&&svg.includes('<svg');
 checks.push(pass('native-svg-viewbox',sourceSha256,meaningfulSvg,`Native viewBox ${dom.viewBox.width} × ${dom.viewBox.height}; rendered at ${dom.root.width} × ${dom.root.height} CSS px.`));

 if(plan.backend==='graphviz'){
  const ast=input.nativeAst as NativeAst|undefined;
  checks.push(pass('graphviz-native-ast',sourceSha256,!!ast&&Array.isArray(ast.objects)&&(Array.isArray(ast.edges)||(visual.edges?.length??0)===0),'Graphviz JSON AST is required for endpoint, port, and layout checks; an empty authored edge list may omit the native edge array.'));
  if(visual.kind==='flow'&&visual.form==='zoned'&&!visual.layout){const direction=/rankdir\s*=\s*"(LR|TB)"/u.exec(plan.source)?.[1],defaultTb=plan.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/form'&&item.requested==='Default Graphviz direction TB for zoned groups'),ok=!!ast&&!!direction&&ast.rankdir===direction&&(!defaultTb||direction==='TB');checks.push(pass('graphviz-zoned-tier-direction',sourceSha256,ok,ok?`Graphviz native AST retains effective ${direction} direction${defaultTb?' selected by the located zoned default policy':''}.`:`Graphviz native direction ${ast?.rankdir??'(missing)'} does not match the emitted/qualified zoned direction ${direction??'(missing)'}.`));}
  if(visual.kind==='state'){
   const problems:string[]=[],objects=Array.isArray(ast?.objects)?ast.objects:[],edges=Array.isArray(ast?.edges)?ast.edges:[],byName=new Map(objects.map(object=>[objectName(object),object])),byGvid=new Map(objects.map(object=>[Number(object._gvid),objectName(object)]));
   const nodeNative=(id:string)=>nativeIdForNode(plan,id);
   const svgNode=(id:string)=>dom.carriers.find(item=>item.cls.split(/\s+/u).includes('node')&&item.title===id);
   const distance=(point:{x:number;y:number}|null,box:QualityBox|undefined)=>!point||!box?Infinity:Math.hypot(Math.max(box.x-point.x,0,point.x-(box.x+box.width)),Math.max(box.y-point.y,0,point.y-(box.y+box.height)));
   const visualNodes=visual.nodes??[],state=visual.state!;
   for(let index=0;index<visualNodes.length;index++){
    const node=visualNodes[index]!,mapping=elementFor(plan,'node',`/extensions/umf.visual/nodes/${index}/id`),nativeId=nodeNative(node.id),record=nativeId?byName.get(nativeId):undefined,carrier=nativeId?svgNode(nativeId):undefined;
    if(!mapping||mapping.logicalId!==node.id||mapping.nativeId!==nativeId)problems.push(`state ${node.id} has no exact source-to-native node mapping`);
    if(!record||!carrier||!norm(carrier.ownText.join(' ')).includes(norm(node.label))||(node.detail&&!norm(carrier.ownText.join(' ')).includes(norm(node.detail))))problems.push(`state ${node.id} label/detail is not owned by its mapped native node`);
    if(text(record?.shape)!=='box')problems.push(`state ${node.id} does not retain the qualified native state box`);
   }
   const transitionIds=new Set<string>();
   for(let index=0;index<state.transitions.length;index++){
    const transition=state.transitions[index]!,mapping=elementFor(plan,'transition',`/extensions/umf.visual/state/transitions/${index}`),from=nodeNative(transition.from),to=nodeNative(transition.to),nativeId=mapping?.nativeId;
    if(!mapping||mapping.logicalId!==transition.id||!nativeId||transitionIds.has(nativeId)){problems.push(`transition ${transition.id} does not have one unique item-level mapping`);continue;}
    transitionIds.add(nativeId);
    const nativeEdges=edges.filter(edge=>text(edge.id)===nativeId),edge=nativeEdges[0],svgEdge=dom.carriers.find(item=>item.cls.split(/\s+/u).includes('edge')&&item.id===nativeId),caption=norm(stateCaptionFromSource(transition));
    if(nativeEdges.length!==1||!edge||byGvid.get(Number(edge.tail))!==from||byGvid.get(Number(edge.head))!==to||norm(text(edge.label))!==caption)problems.push(`transition ${transition.id} native AST does not preserve one exact directed event/action edge`);
    const route=svgEdge?.paths.find(path=>path.d),sourceCarrier=from?svgNode(from):undefined,targetCarrier=to?svgNode(to):undefined;
    if(!svgEdge||!norm(svgEdge.ownText.join(' ')).includes(caption)||!route||!svgEdge.arrow)problems.push(`transition ${transition.id} label/path/arrow is not owned by its mapped SVG edge`);
    if(route&&(distance(route.start,sourceCarrier?.bounds)>40||distance(route.end,targetCarrier?.bounds)>40))problems.push(`transition ${transition.id} SVG path is detached from its mapped source/target states`);
   }
   const expectedPathTransitions=state.transitions.map((transition,index)=>({transition,index})).filter(item=>item.transition.path!==undefined),pathMaps=plan.elementMap.filter(item=>item.kind==='state-path-caption'),pathProblems:string[]=[];
   if(pathMaps.length!==expectedPathTransitions.length)pathProblems.push(`explicit path map count ${pathMaps.length} differs from ${expectedPathTransitions.length} authored path fields`);
   for(const{transition,index}of expectedPathTransitions){
    const sourcePath=`/extensions/umf.visual/state/transitions/${index}/path`,rows=pathMaps.filter(item=>item.sourcePath===sourcePath),transitionMap=elementFor(plan,'transition',`/extensions/umf.visual/state/transitions/${index}`),pathMap=rows[0],nativeId=transitionMap?.nativeId,caption=norm(stateCaptionFromSource(transition)),edgeRows=edges.filter(edge=>text(edge.id)===nativeId),svgEdge=nativeId?dom.carriers.find(item=>item.cls.split(/\s+/u).includes('edge')&&item.id===nativeId):undefined,paintedCaption=svgEdge?.ownTextDetails.some(row=>norm(row.value)===caption&&row.painted);
    if(rows.length!==1||pathMap?.logicalId!==transition.id||pathMap.nativeId!==nativeId||!transitionMap||transitionMap.logicalId!==transition.id)pathProblems.push(`${transition.id} path field has no unique map to its exact transition carrier`);
    if(edgeRows.length!==1||norm(decodeDotLabel(text(edgeRows[0]?.label)))!==caption)pathProblems.push(`${transition.id} native AST edge does not retain its exact explicit Path caption`);
    if(!svgEdge||norm(svgEdge.ownText.join(' '))!==caption||!paintedCaption)pathProblems.push(`${transition.id} SVG edge carrier does not visibly paint its exact explicit Path caption`);
   }
   if(expectedPathTransitions.length||pathMaps.length)checks.push(pass('state-path-caption-ownership',sourceSha256,pathProblems.length===0,pathProblems.length?pathProblems.join('; '):`${expectedPathTransitions.length} source-located path values are visible in their exact mapped native transition carriers.`));
   const initialMap=elementFor(plan,'state-marker','/extensions/umf.visual/state/initial'),initialNode=nodeNative(state.initial),initialObject=byName.get('state_initial_marker'),initialEdges=edges.filter(edge=>text(edge.id)==='state_initial_link'),initialSvgEdge=dom.carriers.find(item=>item.cls.split(/\s+/u).includes('edge')&&item.id==='state_initial_link'),markerCarrier=svgNode('state_initial_marker'),initialCarrier=initialNode?svgNode(initialNode):undefined,initialRoute=initialSvgEdge?.paths.find(path=>path.d);
   if(!initialMap||initialMap.logicalId!==state.initial||initialMap.nativeId!=='state_initial_marker'||text(initialObject?.shape)!=='point'||initialEdges.length!==1||byGvid.get(Number(initialEdges[0]?.head))!==initialNode||!initialRoute||!initialSvgEdge?.arrow||distance(initialRoute.start,markerCarrier?.bounds)>40||distance(initialRoute.end,initialCarrier?.bounds)>40)problems.push('authored initial marker is not separately mapped and connected to its exact state in native AST and SVG');
   for(let index=0;index<(state.final??[]).length;index++){
    const finalId=state.final![index]!,mapping=elementFor(plan,'state-marker',`/extensions/umf.visual/state/final/${index}`),nativeId=nodeNative(finalId),record=nativeId?byName.get(nativeId):undefined;
    const finalCarrier=nativeId?svgNode(nativeId):undefined;
    if(!mapping||mapping.logicalId!==finalId||mapping.nativeId!==nativeId||text(record?.peripheries)!=='2'||(finalCarrier?.paths.length??0)<2)problems.push(`explicit final marker ${finalId} is not separately mapped to its double-outline SVG state carrier`);
   }
   const finalStates=new Set(state.final??[]);
   for(const node of visualNodes)if(!finalStates.has(node.id)){
    const nativeId=nodeNative(node.id),record=nativeId?byName.get(nativeId):undefined,carrier=nativeId?svgNode(nativeId):undefined;
    if((record&&text(record.peripheries)&&text(record.peripheries)!=='1')||(carrier&&carrier.paths.length>1))problems.push(`state ${node.id} has an unrequested final-state outline`);
   }
   if(edges.length!==state.transitions.length+1)problems.push(`native edge count ${edges.length} includes a missing or extra helper/transition path`);
   checks.push(pass('graphviz-state-transitions-and-markers',sourceSha256,!!ast&&Array.isArray(ast.objects)&&Array.isArray(ast.edges)&&problems.length===0,problems.length?problems.join('; '):`${visualNodes.length} state nodes, ${state.transitions.length} item-mapped transitions, and the authored initial${(state.final??[]).length?' and final':''} marker(s) have native AST and SVG ownership.`));
  }else if(visual.kind==='timeline'&&(visual.form==='history'||visual.form==='milestones')&&ast&&Array.isArray(ast.objects)){
   const problems:string[]=[],layout=planDateHistoryEvents(visual.timeline?.events??[]),objects=ast.objects,edges=Array.isArray(ast.edges)?ast.edges:[],byName=new Map(objects.map(object=>[objectName(object),object])),byGvid=new Map(objects.map(object=>[Number(object._gvid),objectName(object)]));
   if(ast.edges!==undefined&&!Array.isArray(ast.edges))problems.push('Graphviz timeline AST has a malformed non-array edge collection');
   if(!layout?.ok){problems.push('source date-history events do not have exact valid UTC calendar-day positions');}
   else{
    const xs:Array<{sourceIndex:number;dayOffset:number;x:number;y:number}>=[],svgXs:Array<{sourceIndex:number;dayOffset:number;x:number;y:number}>=[],boxes:QualityBox[]=[];
    for(const row of layout.events){
     const sourcePath=`/extensions/umf.visual/timeline/events/${row.sourceIndex}`,mapping=elementFor(plan,'event',sourcePath),record=mapping?byName.get(mapping.nativeId):undefined,nodeCarrier=mapping?dom.carriers.find(item=>item.cls.split(/\s+/u).includes('node')&&item.title===mapping.nativeId):undefined,pos=text(record?.pos).split(/[ ,]+/u).map(Number);
     if(!mapping||mapping.logicalId!==row.event.id||mapping.nativeId!==`event_${row.sourceIndex+1}`)problems.push(`event ${row.event.id} has no exact source-index identity map`);
     const astLabel=norm(decodeDotLabel(text(record?.label).replace(/<[^>]*>/g,' ')));
     if(!record||text(record?.id)!==mapping?.nativeId||!nodeCarrier||pos.length<2||pos.some(value=>!Number.isFinite(value))||!astLabel.includes(norm(row.event.label))||!astLabel.includes(row.event.at)||!norm(nodeCarrier.ownText.join(' ')).includes(norm(row.event.label))||!norm(nodeCarrier.ownText.join(' ')).includes(row.event.at))problems.push(`event ${row.event.id} exact ID, label, and date are not owned by its mapped Graphviz node`);
     if(pos.length>=2&&pos.every(Number.isFinite))xs.push({sourceIndex:row.sourceIndex,dayOffset:row.dayOffset,x:pos[0]!,y:pos[1]!});
     if(nodeCarrier){boxes.push(nodeCarrier.bounds);svgXs.push({sourceIndex:row.sourceIndex,dayOffset:row.dayOffset,x:nodeCarrier.bounds.x+nodeCarrier.bounds.width/2,y:nodeCarrier.bounds.y+nodeCarrier.bounds.height/2});}
    }
    const minimumX=Math.min(...xs.map(item=>item.x)),maximumX=Math.max(...xs.map(item=>item.x)),span=maximumX-minimumX;
    for(const item of xs){const expected=layout.lastDay===layout.firstDay?0:(item.dayOffset/(layout.lastDay-layout.firstDay)),actual=span===0?0:(item.x-minimumX)/span;if(Math.abs(actual-expected)>.003)problems.push('Graphviz event x coordinates do not preserve the exact linear UTC-day ordering');}
    const svgMinimumX=Math.min(...svgXs.map(item=>item.x)),svgMaximumX=Math.max(...svgXs.map(item=>item.x)),svgSpan=svgMaximumX-svgMinimumX;
    for(const item of svgXs){const expected=layout.lastDay===layout.firstDay?0:(item.dayOffset/(layout.lastDay-layout.firstDay)),actual=svgSpan===0?0:(item.x-svgMinimumX)/svgSpan;if(Math.abs(actual-expected)>.006)problems.push('Rendered Graphviz event centers do not preserve the exact linear UTC-day positions');}
    for(const date of new Set(layout.events.map(row=>row.event.at))){const sameDate=layout.events.filter(row=>row.event.at===date).map(row=>({ast:xs.find(position=>position.sourceIndex===row.sourceIndex),svg:svgXs.find(position=>position.sourceIndex===row.sourceIndex)}));if(sameDate.length>1&&(new Set(sameDate.map(item=>item.ast?.y)).size!==sameDate.length||new Set(sameDate.map(item=>Math.round((item.svg?.x??NaN)*10)/10)).size!==1||new Set(sameDate.map(item=>item.svg?.y)).size!==sameDate.length))problems.push(`same-date events on ${date} do not share rendered and native x while retaining distinct label tracks`);}
    for(let left=0;left<boxes.length;left++)for(let right=left+1;right<boxes.length;right++){const a=boxes[left]!,b=boxes[right]!,overlapWidth=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)),overlapHeight=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));if(overlapWidth>1&&overlapHeight>1)problems.push('Graphviz event cards overlap in the rendered SVG');}
     const axisEdges=edges.filter(edge=>text(edge.id)==='date_axis'),axisSvg=dom.carriers.find(item=>item.cls.split(/\s+/u).includes('edge')&&item.id==='date_axis');
    if(layout.firstDay!==layout.lastDay){
     const axis=axisEdges[0],start=byName.get('date_axis_start'),end=byName.get('date_axis_end'),startPos=text(start?.pos).split(/[ ,]+/u).map(Number),endPos=text(end?.pos).split(/[ ,]+/u).map(Number);
     if(axisEdges.length!==1||!axis||text(axis.dir)!=='none'||text(axis.arrowhead)!=='none'||byGvid.get(Number(axis.tail))!=='date_axis_start'||byGvid.get(Number(axis.head))!=='date_axis_end'||text(start?.style)!=='invis'||text(end?.style)!=='invis'||startPos.length<2||endPos.length<2||startPos.some(value=>!Number.isFinite(value))||endPos.some(value=>!Number.isFinite(value))||Math.abs(startPos[0]!-minimumX)>.01||Math.abs(endPos[0]!-maximumX)>.01||!axisSvg||axisSvg.arrow||!axisSvg.paths.some(item=>item.d))problems.push('the undirected date-axis helper is missing, directed, or detached from the exact first/last event coordinates');
    }else if(axisEdges.length||axisSvg||byName.has('date_axis_start')||byName.has('date_axis_end'))problems.push('single-date history invents a nonzero axis span');
    if(edges.length!==axisEdges.length)problems.push('Graphviz contains a native event-to-event connection not present in the timeline source');
   }
   checks.push(pass('graphviz-timeline-events-and-axis',sourceSha256,problems.length===0,problems.length?problems.join('; '):`${visual.timeline?.events?.length??0} exact event/date cards have source-index ownership, nonoverlapping native carriers, and linear UTC-day x positions; the axis is undirected and unmapped.`));
  }else if(visual.kind==='timeline'&&(visual.form==='history'||visual.form==='milestones')){
   checks.push(pass('graphviz-timeline-events-and-axis',sourceSha256,false,'Graphviz JSON AST is required to bind every date-history event and the unmapped date-axis helper.'));
  }else if(ast&&Array.isArray(ast.objects)&&(Array.isArray(ast.edges)||visual.kind==='structure'&&visual.form==='nested'&&!(visual.edges?.length))){
   const objects=ast.objects,edges=Array.isArray(ast.edges)?ast.edges:[];
   const byName=new Map(objects.map(o=>[objectName(o),o]));
   const carrier=(cls:string,title:string)=>dom.carriers.find(c=>c.cls.split(/\s+/).includes(cls)&&c.title===title);
   const fieldPortEntry=(port:string|undefined)=>port?plan.elementMap.find(e=>e.kind==='field'&&e.nativeId===port):undefined;
   const fieldRowForPort=(nodeId:string,port:string|undefined)=>{
    if(port?.startsWith('p')){
     const index=Number(port.split(':')[0]!.slice(1))-1;
     const node=visual.nodes?.find(node=>nativeIdForNode(plan,node.id)===nodeId),definition=node?.ports?.[index],owner=carrier('node',nodeId);
     if(!definition||!owner)return undefined;
     const expected=(definition.label!==undefined&&definition.label!==definition.id?definition.label+' · ':'')+definition.id+(definition.side?' · '+definition.side:'');
     return owner.ownTextDetails.find(row=>norm(row.value)===norm(expected));
    }
    const entry=fieldPortEntry(port),match=entry?.sourcePath.match(/\/structure\/entities\/(\d+)\/fields\/(\d+)$/);
    if(!entry||!match)return undefined;
    const entityIndex=Number(match[1]),fieldIndex=Number(match[2]),entity=visual.structure?.entities?.[entityIndex],field=entity?.fields[fieldIndex];
    const node=carrier('node',nodeId);if(!node||!field||!entity)return undefined;
    const occurrences=entity.fields.slice(0,fieldIndex).filter(f=>f.name===field.name&&f.type===field.type).length;
    return node.ownTextDetails.filter(t=>exactFieldText(t.value,field.name,field.type))[occurrences];
   };
   const missing:string[]=[];
   for(const e of plan.elementMap){
    if(e.kind==='visual'||e.kind==='reference'||e.kind==='field'||e.kind==='edge'||e.kind==='port')continue;
    const nestedContainer=visual.kind==='structure'&&visual.form==='nested'&&visual.nodes?.some(node=>node.parent===e.logicalId);
    const title=e.kind==='group'||e.kind==='layer'||nestedContainer?'cluster_'+e.nativeId:e.nativeId;
    const cls=e.kind==='group'||e.kind==='layer'||nestedContainer?'cluster':'node';
    if(!carrier(cls,title))missing.push(`${e.kind} ${e.nativeId}`);
   }
   const expectedNodeElements=plan.elementMap.filter(e=>e.kind==='node'||e.kind==='entity');
   const byNativeId=new Map(objects.filter(object=>typeof object.id==='string').map(object=>[text(object.id),object]));
   const astNodeMissing=expectedNodeElements.filter(e=>!byName.has(e.nativeId)&&!byNativeId.has(e.nativeId)).map(e=>e.nativeId);
   if(visual.kind==='flow')for(const node of visual.nodes??[]){
    const id=nativeIdForNode(plan,node.id),nodeSvg=id?carrier('node',id):undefined;
    if(!nodeSvg||!norm(nodeSvg.ownText.join(' ')).includes(norm(node.label)))missing.push(`node label ${node.id}`);
    if(node.role==='process'){
     const expected=norm([node.label,node.detail,node.label==='Process'||node.detail==='Process'?undefined:'Process'].filter(Boolean).join(' '));
     if(!nodeSvg||!norm(nodeSvg.ownText.join(' ')).includes(expected))missing.push(`node ${node.id} process caption is not owned by its native carrier`);
     const object=id?byName.get(id):undefined,processFill=node.status==='built'?'#e8f2ec':node.status==='placeholder'?'#fff5e4':node.status==='decided'?'#edf2f8':node.status==='unknown'?'#f2f3f3':'#f4eef4';
     if(!object||text(object.fillcolor).toLowerCase()!==processFill)missing.push(`node ${node.id} process role palette is not applied to its native carrier`);
    }
   if(node.shape==='document'||node.shape==='folded-corner'||(!node.shape&&node.role==='document')){const object=id?byName.get(id):undefined;if(text(object?.shape)!=='note')missing.push(`node ${node.id} single-document shape is not a native Graphviz note`);}
    if(node.shape==='multiple-documents'){const object=id?byName.get(id):undefined,topSheet=nodeSvg?.polygons.find(box=>box.width>=(nodeSvg.bounds.width*.8)&&box.height<box.width*.1),sideSheet=nodeSvg?.polygons.find(box=>box.width<=(nodeSvg.bounds.width*.1)&&box.height>=(nodeSvg.bounds.height*.7));if(text(object?.shape)!=='plain'||!topSheet||!sideSheet||!nodeSvg?.ownText.join(' ').includes(node.label))missing.push(`node ${node.id} multiple-document sheet composition is not owned by one native Graphviz node`);}
   }
   if(visual.kind==='flow')for(const group of visual.groups??[]){
    const id=plan.elementMap.find(e=>e.kind==='group'&&e.logicalId===group.id)?.nativeId;
    const cluster=id?carrier('cluster','cluster_'+id):undefined;
    if(!cluster||!cluster.ownText.join(' ').includes(group.label)||(group.detail&&!cluster.ownText.join(' ').includes(group.detail)))missing.push(`group label ${group.id}`);
    if(visual.kind==='flow'&&visual.form==='zoned'&&group.tier!==undefined&&(!cluster||!norm(cluster.ownText.join(' ')).includes(norm('Tier '+group.tier))))missing.push(`group ${group.id} literal tier ${group.tier} is not visible in its mapped Graphviz cluster`);
   }
   if(visual.form==='stack')for(const node of visual.nodes??[]){if(node.shape!=='document'&&node.shape!=='folded-corner'&&node.shape!=='multiple-documents')continue;const id=nativeIdForNode(plan,node.id),nodeSvg=id?carrier('node',id):undefined,object=id?byName.get(id):undefined;if(node.shape==='multiple-documents'){const topSheet=nodeSvg?.polygons.some(box=>box.width>=nodeSvg.bounds.width*.8&&box.height<box.width*.1),sideSheet=nodeSvg?.polygons.some(box=>box.width<=nodeSvg.bounds.width*.1&&box.height>=nodeSvg.bounds.height*.7);if(text(object?.shape)!=='plain'||!topSheet||!sideSheet||!nodeSvg?.ownText.join(' ').includes(node.label))missing.push(`stack node ${node.id} multiple-document offset sheets are not owned by its one Graphviz node`);}else if(text(object?.shape)!=='note')missing.push(`stack node ${node.id} document stencil is not a Graphviz note`);}
   if(visual.form==='stack')for(const layer of visual.structure?.layers??[]){
    const id=plan.elementMap.find(e=>e.kind==='layer'&&e.logicalId===layer.id)?.nativeId;
    const cluster=id?carrier('cluster','cluster_'+id):undefined;
    if(!cluster||!cluster.ownText.join(' ').includes(layer.label))missing.push(`layer label ${layer.id}`);
   }
   checks.push(pass('graphviz-native-carriers',sourceSha256,missing.length===0&&astNodeMissing.length===0,
    missing.length||astNodeMissing.length?`Missing native carriers: ${[...missing,...astNodeMissing.map(x=>'AST '+x)].join(', ')}.`:`${expectedNodeElements.length} nodes/entities and all mapped groups, layers, and authored edges have their own Graphviz SVG carrier.`));

   const endpointFailures:string[]=[];
   const expectedEdges:{id:string;from:string;to:string;fromPort?:string;toPort?:string;fromAttachmentSide?:'n'|'e'|'s'|'w';toAttachmentSide?:'n'|'e'|'s'|'w';directed:boolean;sourcePath:string;routing?:'curved'|'straight';routeIntent?:'curved'|'straight'}[]=[];
   if(visual.kind==='flow'){
    visual.edges?.forEach((e,i)=>{
     const mapped=elementFor(plan,'edge',`/extensions/umf.visual/edges/${i}`),from=nativeIdForNode(plan,e.from),to=nativeIdForNode(plan,e.to);
     const namedPort=(id:string,portId:string|undefined)=>{
      if(portId===undefined)return undefined;
      const ports=visual.nodes?.find(node=>node.id===id)?.ports??[],index=ports.findIndex(port=>port.id===portId),port=ports[index];
      const side={north:'n',east:'e',south:'s',west:'w'} as const;
      return index<0?undefined:'p'+(index+1)+(port?.side?':'+side[port.side]:'');
     };
     const declaredRoutes=[...new Set((visual.edges??[]).flatMap(edge=>edge.routing?[edge.routing.kind]:[]))],uniformRoute=declaredRoutes.length===1?declaredRoutes[0]:undefined,compiledRoute=plan.source.match(/splines=(curved|line|true)/u)?.[1],policy=plan.approximations.filter(item=>item.sourcePath===`/extensions/umf.visual/edges/${i}/routing`),routeConfigOk=uniformRoute?compiledRoute===(uniformRoute==='curved'?'curved':'line'):compiledRoute==='true',routing=e.routing&&e.routing.kind===uniformRoute&&routeConfigOk?e.routing.kind:undefined,inferred=routing==='curved'&&!e.fromPort&&!e.toPort;
     const expectedRouteCode=e.routing?(!uniformRoute?'ROUTING_SCOPE_CONFLICT':undefined):undefined;
     if(e.routing&&policy.length!==1)endpointFailures.push(`${e.id} needs exactly one source-located routing realization record`);
     if(e.routing&&policy.length===1&&policy[0]?.code!==expectedRouteCode)endpointFailures.push(`${e.id} routing realization code does not match Graphviz's actual scope and anchor constraints`);
     if(e.routing&&!routeConfigOk)endpointFailures.push(`${e.id} native Graphviz splines setting does not implement the homogeneous route intent`);
     if(mapped&&from&&to)expectedEdges.push({id:mapped.nativeId,from,to,fromPort:namedPort(e.from,e.fromPort)??(inferred?'e':undefined),toPort:namedPort(e.to,e.toPort)??(inferred?'s':undefined),fromAttachmentSide:inferred?'e':undefined,toAttachmentSide:inferred?'s':undefined,directed:e.directed!==false,sourcePath:mapped.sourcePath,routing,routeIntent:e.routing?.kind});
    });
   }else if(visual.form==='entities'){
     visual.structure?.references?.forEach((r,i)=>{const sourcePath=`/extensions/umf.visual/structure/references/${i}`,mappedRows=plan.elementMap.filter(item=>item.kind==='reference'&&item.sourcePath===sourcePath),mapped=mappedRows[0],from=nativeIdForNode(plan,r.from.node),to=nativeIdForNode(plan,r.to.node),fromNamed=r.from.portId?namedPortFor(plan,r.from.node,r.from.portId,visual):undefined,toNamed=r.to.portId?namedPortFor(plan,r.to.node,r.to.portId,visual):undefined;if(mappedRows.length!==1||mapped?.logicalId!==r.id||!from||!to||r.from.portId&&!fromNamed||r.to.portId&&!toNamed){endpointFailures.push(`${r.id} lacks its exact native reference/port source mapping`);return;}expectedEdges.push({id:mapped.nativeId,from,to,fromPort:fromNamed?.port??portFor(plan,r.from.node,r.from.fieldId??r.from.field,visual),toPort:toNamed?.port??portFor(plan,r.to.node,r.to.fieldId??r.to.field,visual),directed:false,sourcePath});});
   }
   const objectGvid=new Map(objects.map((o,i)=>[objectName(o),Number(o._gvid??i)]));
   const semanticEdges=edges.filter(e=>{
    const style=text(e.style);return style!=='invis'&&!(Array.isArray(e.style)&&e.style.includes('invis'));
   });
   const usedSvgEdges=new Set<string>();
   const usedAstEdges=new Set<Record<string,unknown>>();
   const routingObservations:string[]=[];
   for(const exp of expectedEdges){
    const astIdMatches=edges.filter(e=>text(e.id)===exp.id),edge=astIdMatches.length===1&&!usedAstEdges.has(astIdMatches[0]!)?astIdMatches[0]:undefined;
    if(edge)usedAstEdges.add(edge);
    const tail=objectGvid.get(exp.from),head=objectGvid.get(exp.to);
    if(!edge||Number(edge.tail)!==tail||Number(edge.head)!==head|| (exp.fromPort!==undefined&&text(edge.tailport)!==exp.fromPort)||(exp.toPort!==undefined&&text(edge.headport)!==exp.toPort))endpointFailures.push(`${exp.id} expected ${exp.from}${exp.fromPort?':'+exp.fromPort:''} → ${exp.to}${exp.toPort?':'+exp.toPort:''}`);
    const expectedTitle=`${exp.from}${exp.fromPort?':'+exp.fromPort:''}->${exp.to}${exp.toPort?':'+exp.toPort:''}`;
    const canonicalHtmlPort=(value:string|undefined)=>value?.replace(/^p\d+(?::([nesw]))?$/u,(_match,side:string|undefined)=>side??'');
    const canonicalHtmlPortTitle=exp.fromPort?.startsWith('p')||exp.toPort?.startsWith('p')?`${exp.from}${canonicalHtmlPort(exp.fromPort)?':'+canonicalHtmlPort(exp.fromPort):''}->${exp.to}${canonicalHtmlPort(exp.toPort)?':'+canonicalHtmlPort(exp.toPort):''}`:undefined;
    const svgIdMatches=dom.carriers.filter(c=>c.cls.split(/\s+/).includes('edge')&&c.id===exp.id),svgEdge=svgIdMatches.length===1&&!usedSvgEdges.has(svgIdMatches[0]!.id||svgIdMatches[0]!.title)?svgIdMatches[0]:undefined;
    if(svgEdge)usedSvgEdges.add(svgEdge.id||svgEdge.title);
    if(svgEdge&&svgEdge.title!==expectedTitle&&svgEdge.title!==canonicalHtmlPortTitle&&!( !exp.fromPort&&!exp.toPort&&svgEdge.title===`${exp.from}->${exp.to}`))endpointFailures.push(`${exp.id} SVG edge title does not preserve its exact mapped endpoint identities and ports`);
    // Graphviz nests path + arrow inside <a> when an authored edge tooltip is
    // present. `paths` and `arrow` were collected only from descendants whose
    // closest edge owner is this exact mapped edge, so the wrapper is native
    // presentation detail rather than a different owner.
    const drawn=svgEdge?.paths.find(p=>p.d.trim()&&p.start&&p.end);
    if(!svgEdge||!drawn||(exp.directed&&!svgEdge.arrow))endpointFailures.push(`${exp.id} has no native SVG path${exp.directed?' and arrow':''}`);
    if(visual.form==='entities'&&(exp.fromPort?.startsWith('p')||exp.toPort?.startsWith('p'))&&drawn&&!drawn.painted)endpointFailures.push(`${exp.id} named-port route has no painted native SVG path`);
    const sourceEdge=visual.kind==='flow'?visual.edges?.find(candidate=>elementFor(plan,'edge',exp.sourcePath)?.logicalId===candidate.id):undefined;
    if(sourceEdge?.kind==='data'&&(!edge||text(edge.style)!=='dashed'||!drawn?.dashArray||drawn.dashArray==='none'))endpointFailures.push(`${exp.id} data connection is not carried by an owned dashed native edge`);
    if(exp.routeIntent&&drawn){const sourceIndex=visual.edges?.findIndex(candidate=>elementFor(plan,'edge',exp.sourcePath)?.logicalId===candidate.id)??-1,records=plan.approximations.filter(item=>item.sourcePath===`/extensions/umf.visual/edges/${sourceIndex}/routing`),record=records.length===1?records[0]:undefined;if(record?.code){const nativeCurve=/[CcQqSsAa]/u.test(drawn.d),geometryKind=drawn.curveDeviation<1.5?'collinear':nativeCurve&&drawn.curveDeviation>=2?'curved':'bent-polyline';routingObservations.push(`${exp.id} requested ${exp.routeIntent}; observed ${geometryKind} native path with ${drawn.curveDeviation.toFixed(1)}px chord deviation; admitted ${record.code}.`);}}
    if(exp.routing==='curved'&&(!drawn||!/[CcQqSsAa]/u.test(drawn.d)||drawn.curveDeviation<2))endpointFailures.push(`${exp.id} requested curved routing but its owned Graphviz path lacks a native curved segment with visible non-collinearity (${drawn?.curveDeviation.toFixed(1)??'missing'}px deviation)`);
    if(exp.routing==='straight'&&drawn){const chord=drawn.start&&drawn.end?Math.hypot(drawn.end.x-drawn.start.x,drawn.end.y-drawn.start.y):0,fixedNative=plan.execution?.runtime==='graphviz'&&plan.execution.layoutEngine==='neato'&&plan.execution.nodePositions==='fixed'&&/splines=line/u.test(plan.source),tolerance=1.5,lengthRatio=chord?drawn.lengthCss/chord:Infinity;if(drawn.curveDeviation>tolerance||fixedNative&&lengthRatio>1.02)endpointFailures.push(`${exp.id} requested straight routing but its owned Graphviz path has ${drawn.curveDeviation.toFixed(1)}px chord deviation over ${chord.toFixed(1)}px (${(lengthRatio*100).toFixed(2)}% path/chord length; limits 1.5px and 102%).`);else if(fixedNative)routingObservations.push(`${exp.id} requested straight; fixed-position Graphviz native path measured ${drawn.curveDeviation.toFixed(1)}px deviation over ${chord.toFixed(1)}px chord (${(lengthRatio*100).toFixed(2)}% path/chord length; limits 1.5px and 102%).`);}
    if(!exp.directed&&svgEdge?.arrow)endpointFailures.push(`${exp.id} is undirected but has a native arrowhead`);
    const authoredLabel=visual.kind==='flow'?visual.edges?.find(e=>elementFor(plan,'edge',exp.sourcePath)?.logicalId===e.id)?.label:visual.structure?.references?.[Number(exp.sourcePath.split('/').at(-1))]?.label;
    if(authoredLabel&&!svgEdge?.ownText.some(t=>norm(t)===norm(authoredLabel)))endpointFailures.push(`${exp.id} label is not owned by its native edge carrier`);
    if(visual.form==='entities'){
     const ref=visual.structure?.references?.[Number(exp.sourcePath.split('/').at(-1))];
     const multiplicity=(m:VisualMultiplicity|undefined,cardinality:string|undefined)=>m?(m.text??`${m.min}..${m.max===undefined?'*':m.max}`):cardinality==='zero-or-one'?'0..1':cardinality==='exactly-one'?'1':cardinality==='zero-or-many'?'0..*':cardinality==='one-or-many'?'1..*':'';
     const ends=ref?[multiplicity(ref.fromMultiplicity,ref.fromCardinality),multiplicity(ref.toMultiplicity,ref.toCardinality)]:[];
     if(ends.some(Boolean)){
      const expected=`(${ends[0]||'unspecified'} → ${ends[1]||'unspecified'})`;
      if(!svgEdge?.ownText.some(t=>norm(t).includes(norm(expected))))endpointFailures.push(`${exp.id} endpoint multiplicities ${expected} are not visible in its own native edge label`);
     }
    }
    if(svgEdge&&drawn){
     const nodeByTitle=(id:string)=>{const found=dom.carriers.find(c=>c.cls.split(/\s+/).includes('node')&&c.title===id);return found?.polygon??found?.bounds;};
     const sourceBox=nodeByTitle(exp.from),targetBox=nodeByTitle(exp.to);
     const distance=(p:{x:number;y:number}|null,b:any)=>!p||!b?Infinity:Math.hypot(Math.max(b.x-p.x,0,p.x-(b.x+b.width)),Math.max(b.y-p.y,0,p.y-(b.y+b.height)));
     const sourceDistance=distance(drawn.start,sourceBox),arrowTip=exp.directed&&svgEdge.arrowPoints.length?svgEdge.arrowPoints.reduce((best,point)=>distance(point,targetBox)<distance(best,targetBox)?point:best,svgEdge.arrowPoints[0]!):drawn.end,targetDistance=distance(arrowTip,targetBox);
     const arrowGap=exp.directed&&svgEdge.arrowPoints.length&&drawn.end?Math.min(...svgEdge.arrowPoints.map((a,index)=>{const b=svgEdge.arrowPoints[(index+1)%svgEdge.arrowPoints.length]!,dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((drawn.end!.x-a.x)*dx+(drawn.end!.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(drawn.end!.x-(a.x+t*dx),drawn.end!.y-(a.y+t*dy));})):0;
     if(sourceDistance>32||targetDistance>32||arrowGap>8)endpointFailures.push(`${exp.id} SVG path is detached from its mapped endpoint shapes (start ${sourceDistance.toFixed(1)}px vs source shape, arrow tip ${targetDistance.toFixed(1)}px vs target shape, path/arrow gap ${arrowGap.toFixed(1)}px)`);
     const sideAttachment=(point:{x:number;y:number}|null,box:any,side:'n'|'e'|'s'|'w')=>{if(!point||!box)return false;const horizontal=side==='e'||side==='w',boundary=side==='n'?box.y:side==='s'?box.y+box.height:side==='w'?box.x:box.x+box.width,along=horizontal?point.y:point.x,low=horizontal?box.y:box.x,high=low+(horizontal?box.height:box.width);return Math.abs((horizontal?point.x:point.y)-boundary)<=8&&along>=low-4&&along<=high+4;};
     if(exp.fromAttachmentSide&&!sideAttachment(drawn.start,sourceBox,exp.fromAttachmentSide))endpointFailures.push(`${exp.id} source endpoint does not meet inferred native ${exp.fromAttachmentSide} shape boundary`);
     if(exp.toAttachmentSide&&!sideAttachment(arrowTip,targetBox,exp.toAttachmentSide))endpointFailures.push(`${exp.id} target arrow tip does not meet inferred native ${exp.toAttachmentSide} shape boundary`);
     const portRowOk=(point:{x:number;y:number}|null,nodeId:string,port:string|undefined,target=false)=>{
      if(!port)return true;
      if(port.startsWith('p')&&point){
       const node=visual.nodes?.find(node=>nativeIdForNode(plan,node.id)===nodeId),named=node?.ports?.[Number(port.split(':')[0]!.slice(1))-1],owner=carrier('node',nodeId),row=fieldRowForPort(nodeId,port);
       if(visual.form==='entities'&&named&&owner&&row&&named.side){
        const rowBorders=owner.polygons.map((bounds,index)=>({bounds,index})).filter(({bounds})=>row.bounds.x>=bounds.x-1&&row.bounds.y>=bounds.y-1&&row.bounds.x+row.bounds.width<=bounds.x+bounds.width+1&&row.bounds.y+row.bounds.height<=bounds.y+bounds.height+1).sort((a,b)=>a.bounds.width*a.bounds.height-b.bounds.width*b.bounds.height),portBorder=rowBorders[0];if(!portBorder||!owner.paintedPolygonFlags[portBorder.index])return false;
        const border=portBorder.bounds;
        const side=named.side,horizontal=side==='east'||side==='west',boundary=side==='north'?border.y:side==='south'?border.y+border.height:side==='west'?border.x:border.x+border.width,axis=horizontal?point.x:point.y,along=horizontal?point.y:point.x,axisScale=horizontal?drawn.scaleX:drawn.scaleY,nativeClip=axisScale+0.5;
        return Math.abs(axis-boundary)<=nativeClip&&(horizontal?along>=border.y-1&&along<=border.y+border.height+1:along>=border.x-1&&along<=border.x+border.width+1);
       }
       if(named&&owner&&row){
        // Graphviz HTML row ports have their own border polygons. Selecting
        // the smallest one containing this row avoids confusing it with a
        // hexagon outline or another port's border.
        const borders=owner.polygons.map((bounds,index)=>({bounds,index})).filter(({bounds:b})=>row.bounds.x>=b.x-1&&row.bounds.y>=b.y-1&&row.bounds.x+row.bounds.width<=b.x+b.width+1&&row.bounds.y+row.bounds.height<=b.y+b.height+1).sort((a,b)=>a.bounds.width*a.bounds.height-b.bounds.width*b.bounds.height);
        const borderEntry=borders[0];if(!borderEntry||!owner.paintedPolygonFlags[borderEntry.index])return false;const border=borderEntry.bounds;
        const side=named.side,horizontal=side==='east'||side==='west';
        if(!side){const pointOn=(axis:'x'|'y',boundary:number,along:'x'|'y',low:number,high:number)=>Math.abs(point![axis]-boundary)<=(target?8:6)&&point![along]>=low-4&&point![along]<=high+4;return pointOn('x',border.x,'y',border.y,border.y+border.height)||pointOn('x',border.x+border.width,'y',border.y,border.y+border.height)||pointOn('y',border.y,'x',border.x,border.x+border.width)||pointOn('y',border.y+border.height,'x',border.x,border.x+border.width);}
        const boundary=side==='north'?border.y:side==='south'?border.y+border.height:side==='west'?border.x:border.x+border.width;
        // Graphviz's filled arrowhead tip stops a few CSS px before the HTML
        // row border; use a slightly wider bounded target tolerance than the
        // path-start tolerance while still binding the nearest native vertex.
        if(target&&svgEdge.arrowPoints.length)point=svgEdge.arrowPoints.reduce((closest,candidate)=>Math.abs(candidate[horizontal?'x':'y']-boundary)<Math.abs(closest[horizontal?'x':'y']-boundary)?candidate:closest,svgEdge.arrowPoints[0]!);
        return Math.abs(point[horizontal?'x':'y']-boundary)<=(target?8:6)&&(horizontal?point.y>=border.y-4&&point.y<=border.y+border.height+4:point.x>=border.x-4&&point.x<=border.x+border.width+4);
       }
      }
      const row=fieldRowForPort(nodeId,port);if(!row||!point)return false;
      const halfBand=Math.max(4,row.bounds.height/2+3),center=row.bounds.y+row.bounds.height/2;
      return point.y>=center-halfBand&&point.y<=center+halfBand;
     };
     if(exp.fromPort&&!exp.fromAttachmentSide&&!portRowOk(drawn.start,exp.from,exp.fromPort))endpointFailures.push(`${exp.id} path source does not attach at the SVG row for port ${exp.fromPort}`);
     if(exp.toPort&&!exp.toAttachmentSide&&!portRowOk(drawn.end,exp.to,exp.toPort,true))endpointFailures.push(`${exp.id} path target does not attach at the SVG row for port ${exp.toPort}`);
    }
   }
   const annotationFailures:string[]=[];
   for(let i=0;i<(visual.annotations??[]).length;i++){
    const annotation=visual.annotations![i]!,mapped=elementFor(plan,'annotation',`/extensions/umf.visual/annotations/${i}/id`),native=mapped?byName.get(mapped.nativeId):undefined,owner=mapped?carrier('node',mapped.nativeId):undefined;
    if(!mapped||!native||text(native.shape)!=='plaintext'||!owner||!owner.ownText.some(value=>norm(value)===norm(annotation.text))||decodeDotLabel(text(native.label))!==annotation.text)annotationFailures.push(`annotation ${annotation.id} text is not owned by its exact Graphviz plaintext carrier`);
    const gvid=mapped?objectGvid.get(mapped.nativeId):undefined,incident=gvid===undefined?[]:edges.filter(edge=>Number(edge.tail)===gvid||Number(edge.head)===gvid);
    if(incident.some(edge=>text(edge.style)!=='invis'))annotationFailures.push(`annotation ${annotation.id} has a visible native graph connection`);
    if(plan.elementMap.some(item=>item.kind==='edge'&&item.logicalId===annotation.id))annotationFailures.push(`annotation ${annotation.id} is incorrectly mapped as a semantic edge`);
   }
   endpointFailures.push(...annotationFailures);
   const expectCount=expectedEdges.length,astConnectionPass=endpointFailures.length===0&&semanticEdges.length===expectCount;
   checks.push(pass('graphviz-edge-endpoints-and-paths',sourceSha256,astConnectionPass,endpointFailures.length?endpointFailures.join('; '):`${expectCount} authored connections match exact Graphviz tail/head${visual.form==='entities'?' ports':''}; each has a drawn SVG path${visual.form==='entities'?' (entity references are nondirected)':' and arrowhead'}. Invisible layout constraints are excluded; ${(visual.annotations??[]).length} annotations, when present, are owned by separate plaintext carriers with no visible connections.${routingObservations.length?' Routing observations: '+routingObservations.join(' '):''}`));

   if(visual.form==='entities'){
    const problems:string[]=[];
    visual.structure?.entities?.forEach((entity,ei)=>{
     const nodeId=nativeIdForNode(plan,entity.node),nodeCarrier=nodeId?carrier('node',nodeId):undefined;
     if(!nodeCarrier){problems.push(`entity ${entity.node} has no node carrier`);return;}
     const nativeObject=byName.get(nodeId!);const label=text(nativeObject?.label);
     const fields=entity.fields;
     fields.forEach(field=>{
      const port=portFor(plan,entity.node,field.id??field.name,visual);
      const renderedPort=plan.source.match(new RegExp(`PORT=["']${port}["']`))!==null;
      // The Graphviz SVG emits each HTML-table row as text in the owning entity group.
      const fieldRow=fieldPortEntry(port)?fieldRowForPort(nodeId!,port):undefined;
      if(!renderedPort||!fieldRow)problems.push(`${entity.node}.${field.name} and its type are not visible together in its own entity row/port`);
      const keys=(field.keys??[]).map(k=>k.toUpperCase());
      const nullText=field.nullable===undefined?'':field.nullable?'NULL':'NOT NULL';
      const expectedBadgeTokens=[...keys,...(nullText?[nullText]:[])];
      const sameRow=(detail:typeof nodeCarrier.ownTextDetails[number])=>!!fieldRow&&(detail.baseline!==undefined&&fieldRow.baseline!==undefined?Math.abs(detail.baseline-fieldRow.baseline)<=.75:Math.min(detail.bounds.y+detail.bounds.height,fieldRow.bounds.y+fieldRow.bounds.height)-Math.max(detail.bounds.y,fieldRow.bounds.y)>0&&Math.abs((detail.bounds.y+detail.bounds.height/2)-(fieldRow.bounds.y+fieldRow.bounds.height/2))<=4);
      const visibleRowText=nodeCarrier.ownTextDetails.filter(sameRow),fieldText=norm(`${field.name}${field.type?': '+field.type:''}`);
      const fieldGlyphs=visibleRowText.filter(detail=>norm(detail.value.replace(/\u00a0/gu,' '))===fieldText);
      const badgeGlyphs=visibleRowText.filter(detail=>norm(detail.value.replace(/\u00a0/gu,' '))!==fieldText);
      const visibleTokens:string[]=[];let visibleBadgesValid=true;
      for(const glyph of badgeGlyphs){const tokens=fieldBadgeTokens(glyph.value);if(!tokens){visibleBadgesValid=false;continue;}visibleTokens.push(...tokens);}
      if(fieldGlyphs.length!==1||!visibleBadgesValid||!exactBadgeSet(visibleTokens,expectedBadgeTokens))problems.push(`${entity.node}.${field.name} SVG field row does not contain exactly its own name/type and key/nullability badge tokens (field runs ${fieldGlyphs.length}, observed ${visibleBadgesValid?visibleTokens.join(', '):'unrecognized'}; expected ${expectedBadgeTokens.join(', ')||'none'})`);
      if(fieldRow&&fieldGlyphs[0]&&badgeGlyphs.some(glyph=>glyph.bounds.x>fieldGlyphs[0]!.bounds.x))problems.push(`${entity.node}.${field.name} badge tokens do not precede the field name in its SVG row`);
      const astLabel=text(byName.get(nodeId!)?.label),portPattern=new RegExp(`<TD\\b(?=[^>]*\\bPORT=["']${escRe(port??'')}["'])[^>]*>([\\s\\S]*?)<\\/TD>`,'i');
      const astRowHtml=portPattern.exec(astLabel)?.[1];
      const astBadgeTokens=astRowHtml?dotRowBadgeTokens(astRowHtml):undefined;
      const astFieldText=astRowHtml?norm(decodeDotLabel(astRowHtml.replace(/<FONT\b[^>]*>[\s\S]*?<\/FONT>/giu,' ').replace(/<[^>]*>/gu,' '))):'';
      if(!astRowHtml||astBadgeTokens===undefined||!exactBadgeSet(astBadgeTokens,expectedBadgeTokens)||astFieldText!==fieldText||!dotRowHasOrderedBadgePrefix(astRowHtml,expectedBadgeTokens.length>0,fieldText))problems.push(`${entity.node}.${field.name} row is absent from its exact Graphviz AST port or has incorrect key/nullability tokens`);
     });
     if(entity.fields.length===0&&!label.includes(text(visual.nodes?.find(n=>n.id===entity.node)?.label)))problems.push(`empty entity ${entity.node} is missing its label`);
    });
    checks.push(pass('graphviz-entity-field-rows',sourceSha256,problems.length===0,problems.length?problems.join('; '):`${visual.structure?.entities?.reduce((n,e)=>n+e.fields.length,0)??0} fields, types, key markers, and declared nullability are visible in their owning entity SVG carriers; port identifiers are attached to those row declarations.`));
   }

   const hierarchyProblems:string[]=[];
   if(visual.kind==='flow'){
    const groups=visual.groups??[],nodes=visual.nodes??[];
    const bounds=(kind:string,id:string)=>carrier(kind,id)?.polygon??carrier(kind,id)?.bounds;
    const contains=(a:any,b:any)=>!!a&&!!b&&b.x>=a.x-2&&b.y>=a.y-2&&b.x+b.width<=a.x+a.width+2&&b.y+b.height<=a.y+a.height+2;
    for(const g of groups){if(g.parent){const child=bounds('cluster','cluster_'+(plan.elementMap.find(e=>e.kind==='group'&&e.logicalId===g.id)?.nativeId??''));const parent=bounds('cluster','cluster_'+(plan.elementMap.find(e=>e.kind==='group'&&e.logicalId===g.parent)?.nativeId??''));if(!contains(parent,child))hierarchyProblems.push(`group ${g.id} is not geometrically inside ${g.parent}`);}}
    for(const n of nodes){if(n.group){const child=bounds('node',nativeIdForNode(plan,n.id)??'');const parentId=plan.elementMap.find(e=>e.kind==='group'&&e.logicalId===n.group)?.nativeId??'';const parent=bounds('cluster','cluster_'+parentId);if(!contains(parent,child))hierarchyProblems.push(`node ${n.id} is not geometrically inside group ${n.group}`);}}
   }
   if(visual.kind==='structure'&&visual.form==='stack'){
    const layers=visual.structure?.layers??[];const ys=layers.map(l=>{const id=plan.elementMap.find(e=>e.kind==='layer'&&e.logicalId===l.id)?.nativeId;return id?carrier('cluster','cluster_'+id)?.bounds.y:undefined;});
    if(ys.some(y=>y===undefined)||ys.some((y,i)=>i>0&&Number(y)<=Number(ys[i-1])))hierarchyProblems.push('layer cluster bounds do not follow source top-to-bottom order');
    const semanticVisible=semanticEdges.length>0;if(semanticVisible)hierarchyProblems.push('stack contains a visible connector; only invisible layout constraints are qualified');
   }
   if(visual.form==='entities'){} // references are not containment edges.
   if(visual.kind==='flow'||visual.form==='stack'||visual.kind==='structure'&&visual.form==='nested'){
    if(visual.kind==='structure'&&visual.form==='nested'){const nested=checks.find(check=>check.check==='nested-native-containment');checks.push(pass('graphviz-containment-and-order',sourceSha256,nested?.result==='pass',nested?.details??'Nested native containment proof is missing.'));}
    else checks.push(pass('graphviz-containment-and-order',sourceSha256,hierarchyProblems.length===0,hierarchyProblems.length?hierarchyProblems.join('; '):visual.form==='stack'?'Layer cluster geometry follows authored order; invisible constraints are excluded as semantic connections.':'Every nested group and grouped node is geometrically contained by its mapped native cluster.'));
   }
   if(visual.kind==='flow'&&['network','pipeline','zoned','lanes'].includes(visual.form)&&(visual.groups?.length??0)>0)checks.push(await verifyGraphvizGroupHeaderQuality(page,{document,plan}));
  }
 }else if(plan.backend==='lini'){
  checks.push(...await verifyLiniPresentationQuality(page,{document,plan,nativeAst:input.nativeAst}));
 }else{
  if(visual.kind==='state'){
   const state=visual.state!,problems:string[]=[],nodes=visual.nodes??[];
   const stateNode=(nativeId:string)=>dom.stateNodes.find(item=>item.title===nativeId||item.id.includes(`-state-${nativeId}-`));
   for(let index=0;index<nodes.length;index++){
    const node=nodes[index]!,mapped=elementFor(plan,'node',`/extensions/umf.visual/nodes/${index}/id`),owner=mapped?stateNode(mapped.nativeId):undefined;
    if(!mapped||mapped.logicalId!==node.id||!owner||!norm(owner.ownText.join(' ')).includes(norm(node.label))||(node.detail&&!norm(owner.ownText.join(' ')).includes(norm(node.detail))))problems.push(`state ${node.id} label/detail is not owned by its mapped Mermaid state node`);
   }
   const initial=elementFor(plan,'state-marker','/extensions/umf.visual/state/initial');
   const initialTarget=plan.elementMap.find(item=>item.kind==='node'&&item.logicalId===state.initial)?.nativeId;
   const initialLinks=plan.source.split('\n').filter(line=>line.trim()==='[*] --> '+initialTarget),pseudoStart=dom.stateNodes.find(item=>item.id.includes('-state-root_start-')),initialStateNode=initialTarget?stateNode(initialTarget):undefined;
   const distance=(point:{x:number;y:number}|null,box:QualityBox|undefined)=>!point||!box?Infinity:Math.hypot(Math.max(box.x-point.x,0,point.x-(box.x+box.width)),Math.max(box.y-point.y,0,point.y-(box.y+box.height)));
   const initialPath=dom.paths.find(path=>path.markerEnd&&!path.markerStart&&distance(path.start,pseudoStart?.bounds)<=40&&distance(path.end,initialStateNode?.bounds)<=40);
   if(!initial||initial.logicalId!==state.initial||initial.nativeId!=='[*]'||initialLinks.length!==1||!pseudoStart||!initialPath)problems.push('authored initial marker is not separately mapped to its exact native initial-state link');
   const finalStateMarkers=(state.final??[]).map((stateId,index)=>({stateId,index,mapping:elementFor(plan,'state-marker',`/extensions/umf.visual/state/final/${index}`)}));
   const pseudoEnd=dom.stateNodes.find(item=>item.id.includes('-state-root_end-'));
   for(const marker of finalStateMarkers){const nativeId=plan.elementMap.find(item=>item.kind==='node'&&item.logicalId===marker.stateId)?.nativeId,sourceState=nativeId?stateNode(nativeId):undefined,finalPath=dom.paths.find(path=>path.markerEnd&&!path.markerStart&&distance(path.start,sourceState?.bounds)<=40&&distance(path.end,pseudoEnd?.bounds)<=40);if(!marker.mapping||marker.mapping.logicalId!==marker.stateId||marker.mapping.nativeId!=='[*]'||!plan.source.split('\n').includes(`${nativeId} --> [*]`)||!pseudoEnd||!finalPath)problems.push(`explicit final marker ${marker.stateId} is not mapped to its own Mermaid final link`);}
   for(let index=0;index<state.transitions.length;index++){
    const transition=state.transitions[index]!,mapping=elementFor(plan,'transition',`/extensions/umf.visual/state/transitions/${index}`),from=plan.elementMap.find(item=>item.kind==='node'&&item.logicalId===transition.from)?.nativeId,to=plan.elementMap.find(item=>item.kind==='node'&&item.logicalId===transition.to)?.nativeId,caption=norm(stateCaptionFromSource(transition));
    const expectedNativeId=`${from}->${to}|${encodeURIComponent(stateCaptionFromSource(transition))}`;
    if(!mapping||mapping.logicalId!==transition.id||mapping.nativeId!==expectedNativeId){problems.push(`transition ${transition.id} has no exact endpoint-and-caption Mermaid mapping`);continue;}
    const expectedSourceLine=`${from} --> ${to}: ${mermaidStateText(stateCaptionFromSource(transition))}`;
    const declaration=plan.source.split('\n').filter(line=>line.trim()===expectedSourceLine);
    if(declaration.length!==1)problems.push(`transition ${transition.id} source does not preserve one exact directed caption and endpoint pair`);
    const source=from?stateNode(from):undefined,target=to?stateNode(to):undefined;
    const candidates=dom.paths.filter(path=>{const label=dom.edgeLabels.find(item=>item.id===path.dataId);return !!path.d&&!!path.markerEnd&&!path.markerStart&&label!==undefined&&norm(label.text)===caption&&distance(path.start,source?.bounds)<=40&&distance(path.end,target?.bounds)<=40;});
    if(candidates.length!==1)problems.push(`transition ${transition.id} does not have one unique directed native path with its exact owned caption and endpoint pair`);
   }
   const expectedPathTransitions=state.transitions.map((transition,index)=>({transition,index})).filter(item=>item.transition.path!==undefined),pathMaps=plan.elementMap.filter(item=>item.kind==='state-path-caption'),pathProblems:string[]=[];
   if(pathMaps.length!==expectedPathTransitions.length)pathProblems.push(`explicit path map count ${pathMaps.length} differs from ${expectedPathTransitions.length} authored path fields`);
   for(const{transition,index}of expectedPathTransitions){
    const sourcePath=`/extensions/umf.visual/state/transitions/${index}/path`,rows=pathMaps.filter(item=>item.sourcePath===sourcePath),transitionMap=elementFor(plan,'transition',`/extensions/umf.visual/state/transitions/${index}`),pathMap=rows[0],from=plan.elementMap.find(item=>item.kind==='node'&&item.logicalId===transition.from)?.nativeId,to=plan.elementMap.find(item=>item.kind==='node'&&item.logicalId===transition.to)?.nativeId,caption=norm(stateCaptionFromSource(transition)),expectedNativeId=`${from}->${to}|${encodeURIComponent(stateCaptionFromSource(transition))}`,expectedSourceLine=`${from} --> ${to}: ${mermaidStateText(stateCaptionFromSource(transition))}`,declarations=plan.source.split('\n').filter(line=>line.trim()===expectedSourceLine),sourceNode=from?stateNode(from):undefined,targetNode=to?stateNode(to):undefined,candidates=dom.paths.filter(path=>{const label=dom.edgeLabels.find(item=>item.id===path.dataId);return !!path.d&&!!path.markerEnd&&!path.markerStart&&label!==undefined&&norm(label.text)===caption&&distance(path.start,sourceNode?.bounds)<=40&&distance(path.end,targetNode?.bounds)<=40;});
    if(rows.length!==1||pathMap?.logicalId!==transition.id||pathMap.nativeId!==expectedNativeId||transitionMap?.nativeId!==expectedNativeId)pathProblems.push(`${transition.id} path field has no unique map to its exact endpoint-and-caption path`);
    const labelElement=candidates.length===1?dom.edgeLabels.find(item=>item.id===candidates[0]?.dataId):undefined;
    if(declarations.length!==1||candidates.length!==1||!labelElement?.painted)pathProblems.push(`${transition.id} explicit Path caption is absent, unpainted, or not uniquely visible on its directed native path`);
   }
   if(expectedPathTransitions.length||pathMaps.length)checks.push(pass('state-path-caption-ownership',sourceSha256,pathProblems.length===0,pathProblems.length?pathProblems.join('; '):`${expectedPathTransitions.length} source-located path values are visible in their exact mapped Mermaid transition carriers.`));
   const expectedPathCount=state.transitions.length+1+(state.final?.length??0);
   if(dom.paths.length!==expectedPathCount)problems.push(`native Mermaid path count ${dom.paths.length} differs from the ${state.transitions.length} authored transitions plus ${expectedPathCount-state.transitions.length} explicit marker links`);
   checks.push(pass('mermaid-state-transitions-and-markers',sourceSha256,problems.length===0,problems.length?problems.join('; '):`${nodes.length} state nodes, ${state.transitions.length} mapped directed transitions, and authored initial/final markers are visible in their native carriers.`));
  }else if(visual.kind==='timeline'&&(visual.form==='history'||visual.form==='milestones')){
   const layout=planDateHistoryEvents(visual.timeline?.events??[]),problems:string[]=[];
   if(!layout?.ok)problems.push('source event dates do not form a valid chronological ledger');
   else{
    const sourceLines=plan.source.split('\n'),cardPositions:Array<{sourceIndex:number;box:QualityBox}>=[],boxes:QualityBox[]=[];
    const displayTitle=visual.title??visual.question,readingNote='Chronological order · equal dates adjacent · spacing is categorical, not elapsed time',columns=plan.source.match(/\n  columns (\d+)/u)?.[1],header=dom.carriers.find(item=>item.cls.split(/\s+/u).includes('node')&&(item.id.endsWith('-heading')||item.title==='heading')),note=dom.carriers.find(item=>item.cls.split(/\s+/u).includes('node')&&(item.id.endsWith('-ledger_note')||item.title==='ledger_note'));
    const insideFrame=(box:QualityBox|undefined)=>!!box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=dom.root.width+1&&box.y+box.height<=dom.root.height+1;
    const headerLine=`  heading["${mermaidTimelineText(displayTitle).replace(/#32;/g,' ')}"]:${columns}`,noteLine=`  ledger_note["${mermaidTimelineText(readingNote).replace(/#32;/g,' ')}"]:${columns}`;
    if(!header||!norm(header.ownText.join(' ')).includes(norm(displayTitle))||!sourceLines.includes(headerLine)||!insideFrame(header.bounds))problems.push('Mermaid date-ledger title has no visible, contained native header carrier');
    if(!note||!norm(note.ownText.join(' ')).includes(norm(readingNote))||!sourceLines.includes(noteLine)||!insideFrame(note.bounds))problems.push('Mermaid date ledger does not visibly disclose reading order and categorical spacing');
    for(const row of layout.events){
     const sourcePath=`/extensions/umf.visual/timeline/events/${row.sourceIndex}`,mapping=elementFor(plan,'event',sourcePath),nativeId=`event_${row.sourceIndex+1}`,carrier=dom.carriers.find(item=>item.cls.split(/\s+/u).includes('node')&&(item.id.endsWith('-'+nativeId)||item.title===nativeId));
     const expected=`  ${nativeId}["${mermaidTimelineText(row.event.label)}<br/>${mermaidTimelineText(row.event.at)}<br/>id: ${mermaidTimelineText(row.event.id)}"]`,declarationIndex=sourceLines.indexOf(expected);
     if(!mapping||mapping.nativeId!==nativeId||mapping.logicalId!==row.event.id)problems.push(`event ${row.event.id} has no exact source-index Mermaid identity map`);
     const expectedOwnedText=compact(`${row.event.label}${row.event.at}id: ${row.event.id}`),actualOwnedText=compact(carrier?.ownText.join(' ')??'');
     if(declarationIndex<0||!carrier||!actualOwnedText.includes(expectedOwnedText))problems.push(`event ${row.event.id} exact ID, label, and date are not owned by its Mermaid card`);
     if(declarationIndex<0)problems.push(`event ${row.event.id} has no exact block-beta source card`);
     if(carrier){boxes.push(carrier.bounds);cardPositions.push({sourceIndex:row.sourceIndex,box:carrier.bounds});}
    }
    const chronologicalPositions=[...cardPositions].sort((a,b)=>Math.abs(a.box.y+a.box.height/2-(b.box.y+b.box.height/2))>3?(a.box.y+a.box.height/2)-(b.box.y+b.box.height/2):(a.box.x+a.box.width/2)-(b.box.x+b.box.width/2));
    if(chronologicalPositions.length!==layout.events.length||chronologicalPositions.some((item,index)=>item.sourceIndex!==layout.events[index]!.sourceIndex))problems.push('Mermaid event cards are not arranged row-major in chronological order with stable source-order ties');
    const eventDeclarations=sourceLines.filter(line=>/^\s+event_\d+\["/u.test(line));
    if(eventDeclarations.length!==layout.events.length||eventDeclarations.some(line=>!layout.events.some(row=>line===`  event_${row.sourceIndex+1}["${mermaidTimelineText(row.event.label)}<br/>${mermaidTimelineText(row.event.at)}<br/>id: ${mermaidTimelineText(row.event.id)}"]`)))problems.push('Mermaid event source cards do not preserve the exact label, date, and ID payloads');
    for(let left=0;left<boxes.length;left++)for(let right=left+1;right<boxes.length;right++){const a=boxes[left]!,b=boxes[right]!,overlapWidth=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)),overlapHeight=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));if(overlapWidth>1&&overlapHeight>1)problems.push('Mermaid event cards overlap in the rendered SVG');}
    if(dom.paths.length)problems.push('Mermaid date ledger contains a relationship path not present in the source');
    if(!plan.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/timeline/events'&&/not proportional to elapsed time/u.test(item.representation)&&/no causal or duration/u.test(item.representation)))problems.push('Mermaid ledger does not disclose categorical spacing and the absence of causal/duration meaning');
   }
   checks.push(pass('mermaid-timeline-event-ledger',sourceSha256,problems.length===0,problems.length?problems.join('; '):`${visual.timeline?.events?.length??0} exact date/label/ID cards are source-mapped, row-major in chronological order with equal dates adjacent, nonoverlapping, and contain no relationship paths.`));
  }else{
  // Mermaid IDs are generated by Mermaid but preserve the compiler's safe native IDs.
  const blockCircular=visual.layout?.kind==='circular'&&plan.source.includes('\nblock-beta\n');
  const mermaidNodeCarrier=(nativeId:string)=>{const logicalId=plan.elementMap.find(item=>item.kind==='node'&&item.nativeId===nativeId)?.logicalId;return dom.carriers.find(c=>blockCircular?c.id.endsWith('-'+nativeId):visual.kind==='structure'&&visual.form==='nested'&&visual.nodes?.some(node=>node.parent===logicalId)&&c.cls.split(/\s+/u).includes('cluster')&&c.id.endsWith('-'+nativeId))??dom.carriers.find(c=>blockCircular?c.id.endsWith('-'+nativeId):c.id.includes(`flowchart-${nativeId}-`)||c.id.includes(`entity-${nativeId}-`)||c.title===nativeId);};
  const missing:string[]=[];
  for(const e of plan.elementMap){
   if(e.kind==='visual'||e.kind==='reference'||e.kind==='field'||e.kind==='edge')continue;
   const safe=e.nativeId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   const found=dom.carriers.some(c=>c.id.includes(e.nativeId)||c.title===e.nativeId||c.id.includes(safe));
   if(!found)missing.push(`${e.kind} ${e.nativeId}`);
  }
  const expectedNodeLabels=plan.elementMap.filter(e=>e.kind==='node'||e.kind==='entity').map(e=>{
   const index=Number(e.sourcePath.split('/').filter(Boolean).at(-1)==='id'?e.sourcePath.split('/').filter(Boolean).at(-2):e.sourcePath.split('/').filter(Boolean).at(-1));
   const label=e.kind==='entity'?visual.structure?.entities?.[index]?visual.nodes?.find(n=>n.id===visual.structure!.entities![index]!.node)?.label:undefined:visual.nodes?.find(node=>node.id===e.logicalId)?.label;
   const nodeId=e.kind==='entity'?visual.structure?.entities?.[index]?.node:e.logicalId;
   const node=visual.nodes?.find(n=>n.id===nodeId);
   const requiredText=node?.role==='process'?norm([label,node.detail,label==='Process'||node.detail==='Process'?undefined:'Process'].filter(Boolean).join(' ')):label??'';
   return{nativeId:e.nativeId,label:label??'',requiredText,processRole:node?.role==='process'};
  });
  const shapeFailures=visual.kind==='flow'||visual.form==='stack'?(visual.nodes??[]).flatMap(node=>{
   if(node.shape!=='document'&&node.shape!=='folded-corner'&&node.shape!=='multiple-documents')return[];
   const nativeId=nativeIdForNode(plan,node.id),owner=nativeId?dom.carriers.find(c=>c.id.includes(`flowchart-${nativeId}-`)):undefined,requiredPaths=node.shape==='multiple-documents'?4:2,declaration=node.shape==='multiple-documents'?'docs':'doc',hasDeclaredShape=!!nativeId&&plan.source.split('\n').some(line=>line.includes(`${nativeId}@{ shape: ${declaration},`)),hasOffsetStack=node.shape!=='multiple-documents'||!!owner&&hasOffsetSheetPair(owner.paths.map(path=>path.bounds));
   return owner&&owner.paths.length>=requiredPaths&&hasOffsetStack&&hasDeclaredShape?[]:[`${node.id} ${node.shape} native path composition${node.shape==='multiple-documents'?' with offset sheet geometry':''}`];
  }):[];
  const ownLabelsMissing=expectedNodeLabels.filter(({nativeId,label,requiredText,processRole})=>{
   const expectedCarrier=mermaidNodeCarrier(nativeId);
   const owned=expectedCarrier?normLabel(expectedCarrier.ownText.join(' ')):'';
   return !label||!expectedCarrier||!owned.includes(normLabel(label))||(processRole&&!owned.includes(normLabel(requiredText)));
  }).map(x=>`${x.nativeId}:${x.processRole?'process role caption / ':''}${x.label}`);
  const processRoleMissing=expectedNodeLabels.filter(({nativeId,processRole})=>{if(!processRole)return false;const owner=mermaidNodeCarrier(nativeId);return!owner?.cls.split(/\s+/u).includes('role_process');}).map(item=>`${item.nativeId}:role_process carrier class`);
  const annotationFailures:string[]=[];
  for(let i=0;i<(visual.annotations??[]).length;i++){
   const annotation=visual.annotations![i]!,mapped=elementFor(plan,'annotation',`/extensions/umf.visual/annotations/${i}/id`),owner=mapped?mermaidNodeCarrier(mapped.nativeId):undefined,sourceDeclaration=mapped&&plan.source.split('\n').some(line=>line.trim().startsWith(`${mapped.nativeId}@{ shape: text, label:`)),visibleIncident=mapped?dom.paths.filter(path=>path.dataId.includes(`_${mapped.nativeId}_`)).filter(path=>!path.className.includes('edge-thickness-invisible')||path.markerStart||path.markerEnd):[];
   if(!mapped||!owner||!sourceDeclaration||normLabel(owner.ownText.join(' '))!==normLabel(annotation.text)||plan.elementMap.filter(item=>item.logicalId===annotation.id).length!==1)annotationFailures.push(`annotation ${annotation.id} text is not owned by its exact Mermaid text-shape carrier`);
   if(visibleIncident.length)annotationFailures.push(`annotation ${annotation.id} has a visible native graph connection`);
  }
  checks.push(pass('mermaid-native-node-carriers',sourceSha256,missing.length===0&&ownLabelsMissing.length===0&&shapeFailures.length===0&&processRoleMissing.length===0&&annotationFailures.length===0,missing.length||ownLabelsMissing.length||shapeFailures.length||processRoleMissing.length||annotationFailures.length?`Missing native node carriers: ${[...missing,...ownLabelsMissing.map(x=>'label '+x),...shapeFailures,...processRoleMissing,...annotationFailures].join(', ')}.`:`${expectedNodeLabels.length} source labels, all requested document shapes, and ${(visual.annotations??[]).length} unanchored annotations appear in their exact ID-mapped Mermaid carriers.`));
  if(visual.form==='entities'){
   if(plan.source.includes('\nflowchart ')){
    const problems:string[]=[];
    for(let entityIndex=0;entityIndex<(visual.structure?.entities??[]).length;entityIndex++){
     const entity=visual.structure!.entities![entityIndex]!,mapped=elementFor(plan,'entity',`/extensions/umf.visual/structure/entities/${entityIndex}`),owner=mapped?mermaidNodeCarrier(mapped.nativeId):undefined,node=visual.nodes?.find(item=>item.id===entity.node);
     if(!mapped||!owner||!node||!normLabel(owner.ownText.join(' ')).includes(normLabel(node.label)))problems.push(`${entity.node} label is not owned by its mapped Mermaid card`);
     for(let fieldIndex=0;fieldIndex<entity.fields.length;fieldIndex++){
      const field=entity.fields[fieldIndex]!,mappedField=elementFor(plan,'field',`/extensions/umf.visual/structure/entities/${entityIndex}/fields/${fieldIndex}`),qualifiers=[(field.keys??[]).map(key=>key.toUpperCase()).join(', ')||undefined,field.nullable===undefined?undefined:field.nullable?'NULL':'NOT NULL'].filter((item):item is string=>!!item),expected=(qualifiers.length?qualifiers.join(' · ')+' · ':'')+field.name+(field.type?': '+field.type:'');
      if(!mapped||!mappedField||mappedField.nativeId!==mapped.nativeId||!owner||!normLabel(owner.ownText.join(' ')).includes(normLabel(expected)))problems.push(`${entity.node}.${field.name} exact field row is not owned by its mapped card`);
     }
    }
    const multiplicity=(value:VisualMultiplicity|undefined,cardinality:string|undefined)=>value?(value.text??`${value.min}..${value.max===undefined?'*':value.max}`):cardinality==='zero-or-one'?'0..1':cardinality==='exactly-one'?'1':cardinality==='zero-or-many'?'0..*':cardinality==='one-or-many'?'1..*':'';
    for(let index=0;index<(visual.structure?.references??[]).length;index++){
     const reference=visual.structure!.references![index]!,mapped=elementFor(plan,'reference',`/extensions/umf.visual/structure/references/${index}`),fromId=nativeIdForNode(plan,reference.from.node),toId=nativeIdForNode(plan,reference.to.node),path=mapped?dom.paths.find(item=>item.id.endsWith('-'+mapped.nativeId)||item.dataId.endsWith('-'+mapped.nativeId)):undefined;
     if(!mapped||mapped.logicalId!==reference.id||!fromId||!toId||!path?.d)problems.push(`${reference.id} has no unique ID-mapped Mermaid association path`);
     const sourceLine=plan.source.split('\n').find(line=>line.trim().startsWith(`${fromId} ${mapped?.nativeId}@---`));
     if(!sourceLine||!sourceLine.includes(` ${toId}`)||!sourceLine.includes('@---')||sourceLine.includes('-->')||sourceLine.includes('-.->'))problems.push(`${reference.id} source does not preserve an unarrowed association between its authored endpoints`);
     if(path){
      if(path.markerStart||path.markerEnd)problems.push(`${reference.id} native association path invents an arrowhead`);
      const label=dom.edgeLabels.find(item=>item.id===path.dataId),labelParts=[reference.identification?reference.identification==='identifying'?'Identifying':'Non-identifying':undefined,reference.label,reference.from.fieldId?'from field ID: '+reference.from.fieldId:reference.from.field?'from field: '+reference.from.field:reference.from.portId?'from port ID: '+reference.from.portId:undefined,reference.to.fieldId?'to field ID: '+reference.to.fieldId:reference.to.field?'to field: '+reference.to.field:reference.to.portId?'to port ID: '+reference.to.portId:undefined],ends=[multiplicity(reference.fromMultiplicity,reference.fromCardinality),multiplicity(reference.toMultiplicity,reference.toCardinality)];
      if(ends.some(Boolean))labelParts.push(ends.map(value=>value||'unspecified').join(' → '));
      const expected=normLabel(labelParts.filter(Boolean).join(' · '));
      if(expected&&(!label||normLabel(label.text)!==expected))problems.push(`${reference.id} exact authored label/identification/cardinality text is absent from its own native edge label`);
      if(!expected&&label)problems.push(`${reference.id} has an unrequested native label`);
      const source=fromId?mermaidNodeCarrier(fromId):undefined,target=toId?mermaidNodeCarrier(toId):undefined,distance=(point:{x:number;y:number}|null,box:QualityBox|undefined)=>!point||!box?Infinity:Math.hypot(Math.max(box.x-point.x,0,point.x-(box.x+box.width)),Math.max(box.y-point.y,0,point.y-(box.y+box.height)));
      if(!source||!target||Math.min(distance(path.start,source.bounds)+distance(path.end,target.bounds),distance(path.end,source.bounds)+distance(path.start,target.bounds))>64)problems.push(`${reference.id} path is detached from its mapped endpoint cards`);
     }
    }
    const relationCount=visual.structure?.references?.length??0;
    checks.push(pass('mermaid-er-fields-and-relations',sourceSha256,problems.length===0,problems.length?problems.join('; '):`${visual.structure?.entities?.reduce((count,entity)=>count+entity.fields.length,0)??0} exact field rows belong to their mapped cards; ${relationCount} neutral relationships preserve mapped endpoints, authored labels and declared cardinalities without arrowheads.`));
   }else{
   // Mermaid ER has entity-level relationship endpoints, never field-port attachment.
   const nodesWithFields=dom.carriers.filter(c=>c.cls.includes('node')&&c.ownText.length>0);
   const problems:string[]=[];
   for(const entity of visual.structure?.entities??[]){
    const label=visual.nodes?.find(n=>n.id===entity.node)?.label??'';
    const owner=nodesWithFields.find(c=>c.ownText.some(t=>norm(t)===norm(label)));
    if(!owner){problems.push(`${label} has no entity-local Mermaid carrier`);continue;}
    const all=owner.ownText.join(' ');
    for(const field of entity.fields){
     if(!all.includes(field.name)||(field.type&&!all.includes(field.type))||(field.keys??[]).some(k=>!all.includes(k.toUpperCase())))problems.push(`${label}.${field.name} missing from own entity carrier`);
     if(field.type&&field.nullable===true&&!all.includes(field.type+'?'))problems.push(`${label}.${field.name} nullable marker is absent from its Mermaid field row`);
     if(field.type&&field.nullable===false&&all.includes(field.type+'?'))problems.push(`${label}.${field.name} field row incorrectly marks a non-nullable field as nullable`);
    }
   }
   const relationCount=visual.structure?.references?.length??0;
   visual.structure?.references?.forEach((reference,i)=>{
    const from=nativeIdForNode(plan,reference.from.node),to=nativeIdForNode(plan,reference.to.node);
    const edge=dom.paths.find(p=>p.dataId.includes(`entity-${from}-`)&&p.dataId.includes(`entity-${to}-`));
    if(!edge||!edge.d||!edge.markerStart||!edge.markerEnd)problems.push(`relationship ${reference.id} has no native entity-level relation path from ${from} to ${to}`);
    if(edge){
     const fromNode=dom.carriers.find(c=>c.id.includes(`entity-${from}-`)),toNode=dom.carriers.find(c=>c.id.includes(`entity-${to}-`));
     const distance=(p:{x:number;y:number}|null,b:any)=>!p||!b?Infinity:Math.hypot(Math.max(b.x-p.x,0,p.x-(b.x+b.width)),Math.max(b.y-p.y,0,p.y-(b.y+b.height)));
     if(distance(edge.start,fromNode?.bounds)>32||distance(edge.end,toNode?.bounds)>32)problems.push(`relationship ${reference.id} path is detached from its mapped entity shapes`);
    }
    if(reference.label&&edge&&!dom.edgeLabels.some(l=>l.text.includes(reference.label!)&&l.id===edge.dataId))problems.push(`relationship ${reference.id} label is not carried by its own Mermaid edge label`);
   });
   checks.push(pass('mermaid-er-fields-and-relations',sourceSha256,problems.length===0,problems.length?problems.join('; '):`${visual.structure?.entities?.reduce((n,e)=>n+e.fields.length,0)??0} fields are scoped to entity carriers and ${relationCount} relationships have native paths with cardinality markers. Mermaid ER endpoints are entity-level; this check makes no field-port claim.`));
   }
  }else if(visual.kind==='flow'){
   const failures:string[]=[];
   const routeFallbacks:string[]=[];
   const usedPaths=new Set<string>();
   visual.edges?.forEach(edge=>{
    const from=nativeIdForNode(plan,edge.from),to=nativeIdForNode(plan,edge.to),mapped=plan.elementMap.find(item=>item.kind==='edge'&&item.logicalId===edge.id);
    const candidates=dom.paths.filter(p=>!usedPaths.has(p.id||p.dataId)&&p.d&&!p.className.includes('invisible')&&(blockCircular?p.dataId.endsWith('-'+mapped?.nativeId):(p.dataId===mapped?.nativeId||p.id===mapped?.nativeId||p.dataId.startsWith(`L_${from}_${to}_`))));
    const path=candidates.find(p=>!edge.label||dom.edgeLabels.some(label=>label.id===p.dataId&&label.text===norm(edge.label!)))??candidates[0];
    if(!path||!path.d){failures.push(`${edge.id} has no Mermaid path ${from} to ${to}`);return;}
    if(edge.routing&&blockCircular){
     const routePolicy=plan.approximations.filter(item=>item.sourcePath===`/extensions/umf.visual/edges/${visual.edges!.indexOf(edge)}/routing`);
     if(routePolicy.length!==1||routePolicy[0]?.code!=='ROUTING_NATIVE_INTERPOLATION')failures.push(`${edge.id} needs exactly one located native-interpolation receipt for Mermaid block routing`);
     const chord=path.start&&path.end?Math.hypot(path.end.x-path.start.x,path.end.y-path.start.y):0,ratio=chord?path.lengthCss/chord:Infinity,validBlockPolicy=plan.source.includes('\nblock-beta\n')&&edge.routing.kind==='straight'&&(edge.kind===undefined||edge.kind==='data')&&edge.directed!==false&&routePolicy.length===1&&routePolicy[0]?.code==='ROUTING_NATIVE_INTERPOLATION';
     if(!validBlockPolicy)failures.push(`${edge.id} native interpolation fallback is not justified by the exact block-beta straight edge profile`);
     const operator=edge.kind==='data'?`${from} -.-> ${to}`:`${from} --> ${to}`;
     if(!mapped||mapped.nativeId!==`${from}-${to}`||!plan.source.split('\n').some(line=>line.trim()===operator))failures.push(`${edge.id} mapped Mermaid block edge is absent or its source/target identity differs from the authored endpoints`);
     else if(path.curveDeviation>10||ratio>1.08)failures.push(`${edge.id} native block route exceeds the bounded straight approximation (${path.curveDeviation.toFixed(1)}px chord deviation, ${(ratio*100).toFixed(1)}% path/chord length)`);
     else routeFallbacks.push(`${edge.id} native block connector observed ${path.curveDeviation.toFixed(1)}px deviation over ${chord.toFixed(1)}px chord (${(ratio*100).toFixed(1)}% path/chord); admitted ROUTING_NATIVE_INTERPOLATION`);
     const nonincident=(visual.nodes??[]).filter(node=>node.id!==edge.from&&node.id!==edge.to),hit=nonincident.find(node=>{const carrier=mermaidNodeCarrier(nativeIdForNode(plan,node.id)??'');return !!carrier&&path.samples.some(point=>point&&point.x>=carrier.bounds.x+1&&point.x<=carrier.bounds.x+carrier.bounds.width-1&&point.y>=carrier.bounds.y+1&&point.y<=carrier.bounds.y+carrier.bounds.height-1);});
     if(hit)failures.push(`${edge.id} native path crosses nonincident node ${hit.id}`);
    }else if(edge.routing){
     const curve=edge.routing.kind==='curved'?'natural':'linear',config=new RegExp(`^[ \\t]*${mapped?.nativeId}@\\{\\s*curve:\\s*${curve}\\s*\\}$`,'mu');
     const routePolicy=plan.approximations.filter(item=>item.sourcePath===`/extensions/umf.visual/edges/${visual.edges!.indexOf(edge)}/routing`);
     if(routePolicy.length!==1||routePolicy[0]?.code!=='ROUTING_NATIVE_INTERPOLATION')failures.push(`${edge.id} needs exactly one Mermaid ROUTING_NATIVE_INTERPOLATION record for its per-edge curve request`);
     if(!mapped||!config.test(plan.source))failures.push(`${edge.id} native edge has no owned Mermaid ${curve} curve configuration`);
     const hasNativeCurve=/[CcQqSsAa]/u.test(path.d);
     if(edge.routing.kind==='curved'&&(!hasNativeCurve||path.curveDeviation<2)){
      if(path.curveDeviation<1.5&&routePolicy.length===1&&routePolicy[0]?.code==='ROUTING_NATIVE_INTERPOLATION')routeFallbacks.push(`${edge.id} native layout is collinear; the located natural-curve approximation is retained (${path.curveDeviation.toFixed(1)}px deviation)`);
      else failures.push(`${edge.id} requested curved routing but its owned Mermaid path lacks a native curved segment or visible non-collinearity (${path.curveDeviation.toFixed(1)}px deviation)`);
     }
     if(edge.routing.kind==='straight'&&(hasNativeCurve||path.curveDeviation>1.5)){
      if(!hasNativeCurve&&path.curveDeviation>1.5&&routePolicy.length===1&&routePolicy[0]?.code==='ROUTING_NATIVE_INTERPOLATION')routeFallbacks.push(`${edge.id} requested straight routing; native linear interpolation produced a bent polyline with ${path.curveDeviation.toFixed(1)}px chord deviation, retained as a located approximation`);
      else failures.push(`${edge.id} requested straight routing but its owned Mermaid path is curved or deviates ${path.curveDeviation.toFixed(1)}px from a straight chord`);
     }
    }
    if(blockCircular&&edge.kind==='data'&&!/\b6px,\s*4px\b/u.test(path.dashArray))failures.push(`${edge.id} data edge class does not retain the source-configured dashed stroke pattern (${path.dashArray})`);
    if(edge.directed!==false&&!path.markerEnd)failures.push(`${edge.id} has no directed target marker`);
    if(edge.directed===false&&(path.markerStart||path.markerEnd))failures.push(`${edge.id} is undirected but has a native arrow marker`);
    usedPaths.add(path.id||path.dataId);
    const sourceCarrier=from?mermaidNodeCarrier(from):undefined,targetCarrier=to?mermaidNodeCarrier(to):undefined;
    const distance=(p:{x:number;y:number}|null,b:any)=>!p||!b?Infinity:Math.hypot(Math.max(b.x-p.x,0,p.x-(b.x+b.width)),Math.max(b.y-p.y,0,p.y-(b.y+b.height)));
    if(distance(path.start,sourceCarrier?.bounds)>32||distance(path.end,targetCarrier?.bounds)>32)failures.push(`${edge.id} path is detached from its mapped Mermaid node shapes`);
    if(edge.label&&!dom.edgeLabels.some(l=>l.text===norm(edge.label!)&&l.id===path.dataId))failures.push(`${edge.id} label is not owned by its native Mermaid edge-label carrier`);
   });
   const unownedVisiblePaths=dom.paths.filter(path=>path.d&&!path.className.includes('invisible')&&!usedPaths.has(path.id||path.dataId));
   if(unownedVisiblePaths.length)failures.push(`${unownedVisiblePaths.length} visible Mermaid flow path(s) have no authored edge owner`);
   checks.push(pass('mermaid-flow-paths',sourceSha256,failures.length===0,failures.length?failures.join('; '):`${visual.edges?.length??0} authored flow connections have native SVG paths with exact mapped endpoint IDs and their declared direction.${routeFallbacks.length?' Located routing fallback: '+routeFallbacks.join('; ')+'.':''}`));
  }
  if(visual.kind==='flow'||(visual.kind==='structure'&&visual.form==='stack')){
   const problems:string[]=[];
   const clusterFor=(logicalId:string,kind:'group'|'layer')=>{
    const nativeId=plan.elementMap.find(e=>e.kind===kind&&e.logicalId===logicalId)?.nativeId;
    return nativeId?dom.carriers.find(c=>c.cls.split(/\s+/).includes('cluster')&&c.id.endsWith(`-${nativeId}`)):undefined;
   };
   const inside=(parent:typeof dom.carriers[number]|undefined,child:typeof dom.carriers[number]|undefined)=>!!parent&&!!child&&child.bounds.x>=parent.bounds.x-2&&child.bounds.y>=parent.bounds.y-2&&child.bounds.x+child.bounds.width<=parent.bounds.x+parent.bounds.width+2&&child.bounds.y+child.bounds.height<=parent.bounds.y+parent.bounds.height+2;
   const nodeFor=(logicalId:string)=>{
    const nativeId=nativeIdForNode(plan,logicalId);
    return nativeId?dom.carriers.find(c=>c.cls.split(/\s+/).includes('node')&&c.id.includes(`flowchart-${nativeId}-`)):undefined;
   };
   if(visual.kind==='flow'){
    for(const group of visual.groups??[]){
     const child=clusterFor(group.id,'group');
     if(!child)problems.push(`group ${group.id} has no Mermaid subgraph carrier`);
     else if(!normLabel(child.ownText.join(' ')).includes(normLabel(group.label)))problems.push(`group ${group.id} label is not visible in its mapped subgraph`);
     if(visual.kind==='flow'&&visual.form==='zoned'&&group.tier!==undefined&&(!child||!normLabel(child.ownText.join(' ')).includes(normLabel('Tier '+group.tier))))problems.push(`group ${group.id} literal tier ${group.tier} is not visible in its mapped Mermaid subgraph`);
     if(group.parent){
      const parent=clusterFor(group.parent,'group');
      if(!inside(parent,child))problems.push(`group ${group.id} is not geometrically contained by its mapped Mermaid parent ${group.parent}`);
     }
    }
    for(const node of visual.nodes??[])if(node.group){
     const parent=clusterFor(node.group,'group'),mapped=nodeFor(node.id);
     if(!inside(parent,mapped))problems.push(`node ${node.id} is not geometrically inside its mapped Mermaid group ${node.group}`);
    }
   }
   if(visual.kind==='structure'&&visual.form==='stack'){
    const layers=visual.structure?.layers??[];
    const mapped=layers.map(layer=>({layer,carrier:clusterFor(layer.id,'layer')}));
    for(const {layer,carrier} of mapped){
     if(!carrier)problems.push(`layer ${layer.id} has no Mermaid subgraph carrier`);
     else if(!normLabel(carrier.ownText.join(' ')).includes(normLabel(layer.label)))problems.push(`layer ${layer.id} label is not visible in its mapped subgraph`);
     for(const node of (visual.nodes??[]).filter(n=>n.layer===layer.id)){
      const carrierNode=nodeFor(node.id);
      if(!inside(carrier,carrierNode))problems.push(`node ${node.id} is not geometrically contained by Mermaid layer ${layer.id}`);
     }
    }
    const centers=mapped.map(({layer,carrier})=>({layer,x:carrier?carrier.bounds.x+carrier.bounds.width/2:undefined}));
    if(centers.some(c=>c.x===undefined)||centers.some((c,i)=>i>0&&Number(c.x)<=Number(centers[i-1]?.x)))problems.push('Mermaid layer geometry does not follow the authored left-to-right order');
   }
   checks.push(pass('mermaid-containment-and-order',sourceSha256,problems.length===0,problems.length?problems.join('; '):visual.form==='stack'?'Mapped layer subgraphs contain their nodes and follow authored left-to-right geometry.':'Mapped Mermaid subgraphs geometrically contain each child group and grouped node.'));
  }
  if(visual.kind==='structure'&&visual.form==='nested'){const nested=checks.find(check=>check.check==='nested-native-containment');checks.push(pass('mermaid-containment-and-order',sourceSha256,nested?.result==='pass',nested?.details??'Nested native containment proof is missing.'));}
  }
 }

 const annotationProfile=visual.kind==='structure'&&visual.form==='entities'||visual.kind==='flow'&&visual.form==='lanes';
 if(annotationProfile&&(visual.annotations?.length??0)>0){
  const annotations=visual.annotations!,maps=plan.elementMap.filter(item=>item.kind==='annotation'),failures:string[]=[],expectedIds:string[]=[];
  if(maps.length!==annotations.length)failures.push(`annotation map inventory ${maps.length} differs from ${annotations.length} source annotations`);
  for(let index=0;index<annotations.length;index++){
   const annotation=annotations[index]!,sourcePath=`/extensions/umf.visual/annotations/${index}/id`,rows=maps.filter(item=>item.sourcePath===sourcePath),mapping=rows[0];
   if(rows.length!==1||mapping?.logicalId!==annotation.id||mapping.kind!=='annotation'||!mapping.nativeId){failures.push(`annotation ${annotation.id} does not have exactly one source-indexed identity map at ${sourcePath}`);continue;}
   expectedIds.push(mapping.nativeId);
   if(plan.elementMap.filter(item=>item.logicalId===annotation.id).length!==1)failures.push(`annotation ${annotation.id} has a duplicate or borrowed logical identity`);
   const escapedNativeId=mapping.nativeId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),escapedSvgId=dom.svgId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),mermaidIdPattern=new RegExp(`^${escapedSvgId}-flowchart-${escapedNativeId}-\\d+$`,'u');
   const matching=dom.carriers.filter(carrier=>plan.backend==='lini'
    ?carrier.id===mapping.nativeId&&carrier.cls.split(/\s+/u).includes('lini-box')&&carrier.cls.split(/\s+/u).includes('lini-block')&&!carrier.cls.split(/\s+/u).includes('lini-group')
    :plan.backend==='graphviz'
     ?carrier.cls.split(/\s+/u).includes('node')&&carrier.title===mapping.nativeId
     :carrier.cls.split(/\s+/u).includes('node')&&mermaidIdPattern.test(carrier.id));
   const owner=matching[0];
   if(matching.length!==1||!owner){failures.push(`annotation ${annotation.id} has ${matching.length} native SVG owners for mapped ID ${mapping.nativeId}`);continue;}
   const details=owner.ownTextDetails.filter(detail=>detail.value.trim()),actual=norm(details.map(detail=>detail.value).join(' '));
   if(!details.length||actual!==norm(annotation.text)||details.some(detail=>!detail.painted||!detail.paintLeaves.length||detail.paintLeaves.some(leaf=>!leaf.painted)))failures.push(`annotation ${annotation.id} full ordered text is missing, altered, borrowed, or unpainted in its mapped SVG carrier (observed ${JSON.stringify(actual)}; expected ${JSON.stringify(norm(annotation.text))})`);
  }
  if(new Set(expectedIds).size!==expectedIds.length)failures.push('source annotations share a native carrier ID');
  const escapedSvgId=dom.svgId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),mermaidNativeIdPattern=new RegExp(`^${escapedSvgId}-flowchart-(.+)-\\d+$`,'u');
  const annotationCarrierId=(carrier:(typeof dom.carriers)[number])=>plan.backend==='lini'?carrier.id:plan.backend==='graphviz'?carrier.title:mermaidNativeIdPattern.exec(carrier.id)?.[1]??'';
  const otherMappedIds=new Set(plan.elementMap.filter(item=>item.kind!=='annotation').map(item=>item.nativeId));
  const svgAnnotationCarriers=dom.carriers.filter(carrier=>carrier.nativeAnnotationShape&&!otherMappedIds.has(annotationCarrierId(carrier))),svgAnnotationIds=svgAnnotationCarriers.map(annotationCarrierId).filter((id):id is string=>!!id);
  if(svgAnnotationCarriers.length!==annotations.length||svgAnnotationIds.length!==annotations.length||new Set(svgAnnotationIds).size!==svgAnnotationIds.length||expectedIds.some(id=>!svgAnnotationIds.includes(id)))failures.push(`native SVG annotation carrier inventory contains a phantom, missing, or duplicate text carrier (${svgAnnotationCarriers.map(annotationCarrierId).join(', ')||'none'}; expected ${expectedIds.join(', ')})`);
  if(plan.backend==='graphviz'){
   const ast=input.nativeAst as NativeAst|undefined,plaintext=(ast?.objects??[]).filter(object=>text(object.shape)==='plaintext'),astIds=plaintext.map(object=>objectName(object));
   if(plaintext.length!==annotations.length||new Set(astIds).size!==astIds.length||expectedIds.some(id=>!astIds.includes(id)))failures.push('Graphviz AST plaintext annotation inventory differs from the exact source maps');
   for(let index=0;index<annotations.length;index++){
    const annotation=annotations[index]!,id=expectedIds[index],object=plaintext.find(candidate=>objectName(candidate)===id);
    if(!id||!object||decodeGraphvizLabel(text(object.label))!==annotation.text)failures.push(`annotation ${annotation.id} native Graphviz plaintext declaration does not preserve exact text and owner`);
   }
  }else if(plan.backend==='mermaid'){
   const declarations=plan.source.split(/\r?\n/u).flatMap(line=>{
    const match=/^\s*([A-Za-z][A-Za-z0-9_-]*)@\{\s*shape:\s*text\s*,\s*label:\s*("(?:\\.|[^"\\])*")\s*\}\s*$/u.exec(line);if(!match)return[];
    try{const encoded=JSON.parse(match[2]!);return typeof encoded==='string'?[{id:match[1]!,text:decodeMermaidText(encoded)}]:[];}catch{return[];}
   });
   const declaredIds=declarations.map(item=>item.id);
   if(declarations.length!==annotations.length||new Set(declaredIds).size!==declaredIds.length||expectedIds.some((id,index)=>id!==declaredIds[index])||declarations.some((item,index)=>item.text!==annotations[index]?.text))failures.push('Mermaid text-shape declarations do not preserve exact source-indexed IDs and annotation text');
  }else{
   const nativeAst=typeof input.nativeAst==='string'?input.nativeAst:'';
   const footerChildren=nativeAnnotationFooterChildren(nativeAst),astIds=footerChildren?.map(child=>child.id)??[];
   if(astIds.length!==annotations.length||new Set(astIds).size!==astIds.length||expectedIds.some((id,index)=>id!==astIds[index]))failures.push('Lini AST annotation carrier inventory differs from the exact source maps');
   for(let index=0;index<annotations.length;index++){
    const id=expectedIds[index],child=footerChildren?.[index];
    if(!id||child?.id!==id||child.values.length!==1||child.values[0]!==annotations[index]!.text)failures.push(`annotation ${annotations[index]!.id} does not have exact owned Lini AST text in footer block ${id??'(missing)'}`);
   }
  }
  const checkId=visual.kind==='structure'?'entity-annotation-native-text':'flow-annotation-native-text';
  checks.push(pass(checkId,sourceSha256,failures.length===0,failures.length?failures.join('; '):`${annotations.length} source-indexed ${visual.kind==='structure'?'entity':'flow/lanes'} annotations preserve their complete ordered text in unique, painted native SVG carriers with exact AST/source ownership.`));
 }

 if(plan.backend!=='lini'&&visual.nodes?.some(node=>node.ports?.length)){
  const failures:string[]=[];
  for(const [nodeIndex,node] of visual.nodes.entries())for(const [portIndex,port] of (node.ports??[]).entries()){
   const nativeId=nativeIdForNode(plan,node.id),owner=dom.carriers.find(item=>item.title===nativeId||item.id.includes(`flowchart-${nativeId}-`));
   const portPath=`/extensions/umf.visual/nodes/${nodeIndex}/ports/${portIndex}`;
   const mapping=plan.elementMap.find(item=>item.kind==='port'&&item.sourcePath===portPath);
   if(!owner||!mapping){failures.push(`${node.id}.${port.id} has no mapped native host`);continue;}
   const portLabel=(port.label!==undefined&&port.label!==port.id?port.label+' · ':'')+port.id+(port.side?' · '+port.side:'');
   const expected=plan.backend==='graphviz'?portLabel:'Port '+portLabel;
   if(!norm(owner.ownText.join(' ')).includes(norm(expected)))failures.push(`${node.id}.${port.id} label/side is not visible on its own native host`);
   if(plan.backend==='graphviz'){
    const ast=input.nativeAst as NativeAst|undefined,record=ast?.objects?.find(item=>text(item.name)===nativeId);
    if(!new RegExp(`PORT=["']p${portIndex+1}["']`).test(text(record?.label)))failures.push(`${node.id}.${port.id} has no declared Graphviz HTML row port`);
   }else if(mapping.nativeId!==nativeId)failures.push(`${node.id}.${port.id} claims a distinct Mermaid port carrier that does not exist`);
  }
  checks.push(pass(plan.backend==='graphviz'?'graphviz-node-port-rows':'mermaid-labeled-port-fallbacks',sourceSha256,failures.length===0,failures.length?failures.join('; '):plan.backend==='graphviz'?'Every named port has an owned visible row and native HTML port declaration; connection checks verify its actual attachment.':'Every named port is visibly labeled on its real host node; this is an explicit node-level fallback, not a distinct native port.'));
 }
 const fit=await page.locator('#frame svg').evaluate(root=>{
  const s=root as SVGSVGElement,r=s.getBoundingClientRect(),textEls=[...s.querySelectorAll('text,foreignObject')].filter(el=>{const style=getComputedStyle(el);return style.display!=='none'&&style.visibility!=='hidden'&&style.opacity!=='0';});
  const normalize=(s:string)=>s.replace(/\s+/g,' ').trim();
  const texts=textEls.map(el=>{const b=el.getBoundingClientRect(),font=parseFloat(getComputedStyle(el).fontSize)||0;return{value:normalize(el.textContent??''),x:b.x-r.x,y:b.y-r.y,w:b.width,h:b.height,font};}).filter(x=>x.value);
  const out=texts.filter(x=>x.x<-1||x.y<-1||x.x+x.w>r.width+1||x.y+x.h>r.height+1);
  const scale=Math.min(1600/(s.viewBox.baseVal.width||1),900/(s.viewBox.baseVal.height||1));
  const small=texts.filter(x=>x.font*scale<10);
  const overlaps:string[]=[];
  for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++){
   const a=texts[i]!,b=texts[j]!;if(!a.w||!a.h||!b.w||!b.h)continue;
   const ix=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),iy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
   if(ix>2&&iy>2)overlaps.push(`${a.value.slice(0,36)} / ${b.value.slice(0,36)}`);
  }
  return{width:r.width,height:r.height,viewWidth:s.viewBox.baseVal.width,viewHeight:s.viewBox.baseVal.height,texts:texts.length,out:out.map(x=>x.value),small:small.map(x=>x.value),overlaps:overlaps.slice(0,12)};
 });
 const svgFitsFrame=fit.width>=1598&&fit.width<=1602&&fit.height>=898&&fit.height<=902;
 checks.push(pass('presentation-svg-fit',sourceSha256,svgFitsFrame,svgFitsFrame?`The host SVG root fills the 1600×900 presentation frame (viewBox ${fit.viewWidth}×${fit.viewHeight}); intrinsic drawing aspect ratio remains governed by the SVG viewBox.`:`The SVG root measures ${fit.width}×${fit.height}px in a 1600×900 presentation frame; it must fill both frame dimensions within 2px.`));
 checks.push(pass('presentation-clipping',sourceSha256,fit.out.length===0,fit.out.length?`SVG text exceeds the rendered viewport: ${fit.out.join(' | ')}.`:`${fit.texts} visible text carriers fit within the 1600×900 presentation viewport.`));
 checks.push(pass('presentation-font-legibility',sourceSha256,fit.small.length===0,fit.small.length?`Text falls below 10 CSS px when fitted: ${fit.small.join(' | ')}.`:'All measured text remains at least 10 CSS px when fitted to 1600×900.'));
 checks.push(pass('presentation-text-overlap',sourceSha256,fit.overlaps.length===0,fit.overlaps.length?`Intersecting text bounds: ${fit.overlaps.join('; ')}.`:'No measured text bounds overlap at the presentation viewport.'));
 if(visual.layout?.kind==='circular'){
  const order=visual.layout.order??(visual.nodes??[]).map(node=>node.id),items=order.map(id=>{
   const mapped=nativeIdForNode(plan,id),carrier=dom.carriers.find(candidate=>candidate.id===mapped||candidate.title===mapped||candidate.id.endsWith('-'+mapped));
   const node=visual.nodes?.find(candidate=>candidate.id===id);
   return{id,node,carrier,center:carrier?{x:carrier.bounds.x+carrier.bounds.width/2,y:carrier.bounds.y+carrier.bounds.height/2}:undefined};
  });
  const missing=items.filter(item=>!item.node||!item.carrier||!item.center).map(item=>item.id),centers=items.flatMap(item=>item.center?[item.center]:[]),mean=centers.length?{x:centers.reduce((sum,item)=>sum+item.x,0)/centers.length,y:centers.reduce((sum,item)=>sum+item.y,0)/centers.length}:undefined,radii=centers.map(item=>Math.hypot(item.x-mean!.x,item.y-mean!.y)),radius=radii.length?radii.reduce((sum,item)=>sum+item,0)/radii.length:0,radialDeviation=radius?Math.max(...radii.map(value=>Math.abs(value-radius)))/radius:Infinity;
  const angles=items.flatMap(item=>item.center&&mean?[Math.atan2(item.center.y-mean.y,item.center.x-mean.x)]:[]),clockwiseSteps=angles.map((angle,index)=>{let delta=angles[(index+1)%angles.length]!-angle;while(delta<=0)delta+=Math.PI*2;return delta;}),clockwiseSweep=clockwiseSteps.reduce((sum,delta)=>sum+delta,0);
  const layoutRecords=plan.approximations.filter(item=>item.sourcePath==='/extensions/umf.visual/layout'),mermaidApprox=plan.backend==='mermaid'&&plan.source.includes('\nblock-beta\n')&&layoutRecords.length===1&&layoutRecords[0]?.code==='CIRCULAR_NATIVE_GRID';
  const radialLimit=mermaidApprox?.24:.06,orderOk=!visual.layout.order||angles.length===order.length&&(angles.length<3||clockwiseSteps.every(step=>step<Math.PI))&&Math.abs(clockwiseSweep-Math.PI*2)<.08,radialError=centers.length===1?0:radialDeviation;
  const shapesOk=items.every(item=>{if(!item.node?.shape||item.node.shape!=='rectangle')return true;if(item.carrier?.shapeTags.some(shape=>shape.tag==='rect'&&shape.radius<=.5))return true;if(plan.backend!=='graphviz')return false;const object=(input.nativeAst as NativeAst|undefined)?.objects?.find(candidate=>objectName(candidate)===item.carrier?.title),outline=item.carrier?.polygonPoints.find(points=>points.length===4),axisAligned=!!outline&&outline.every((point,index)=>{const next=outline[(index+1)%outline.length]!;return Math.abs(point.x-next.x)<.5||Math.abs(point.y-next.y)<.5;});return text(object?.shape)==='box'&&axisAligned;});
  const boxes=items.flatMap(item=>item.carrier?[item.carrier.bounds]:[]),overlap=boxes.some((a,index)=>boxes.slice(index+1).some(b=>Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>1)),layoutCodeOk=plan.backend==='mermaid'?mermaidApprox:layoutRecords.length===0;
  const ok=!missing.length&&radialError<=radialLimit&&orderOk&&shapesOk&&!overlap&&layoutCodeOk;
  const details=missing.length?`Missing mapped circular node carriers: ${missing.join(', ')}.`:`${items.length} native node carriers; mean radius ${radius.toFixed(1)}px, maximum normalized radial deviation ${(radialError*100).toFixed(1)}% (limit ${(radialLimit*100).toFixed(0)}%); clockwise cyclic order ${visual.layout.order?'matches the authored sequence':'unspecified'}; authored rectangle geometry ${shapesOk?'retained':'not proven'}; node boxes ${overlap?'overlap':'do not overlap'}; located approximation code ${mermaidApprox?'CIRCULAR_NATIVE_GRID':'none'}.`;
  checks.push(pass('presentation-circular-layout',sourceSha256,ok,details));
 }
 return checks;
}
