// SPDX-License-Identifier: MIT OR Apache-2.0
/** Mask-aware evidence for visible ink on pinned Lini flow connectors. */
import type {Page} from 'playwright';

export interface LiniVisibleInkLink {
 nativeClass:string;
 from:string|null;
 to:string|null;
 ok:boolean;
 clearanceCssPx:number;
 visiblePathFraction:number;
 startInkPixels:number;
 endInkPixels:number;
 arrowInkPixels:number;
 captionInkPixels:number;
 maskId?:string;
 cutCount:number;
 cutMarginCssPx?:number;
 maskPixelDeltaPixels:number;
 problems:string[];
}
export interface LiniVisibleInkReport {ok:boolean;links:LiniVisibleInkLink[];problems:string[];}

/** Inspect the already-inserted native SVG. All geometric distances are CSS px. */
export async function inspectLiniVisibleInk(page:Page):Promise<LiniVisibleInkReport>{
 return page.locator('svg').first().evaluate(async svg=>{
  type R={x:number;y:number;width:number;height:number};
  type P={x:number;y:number};
  type Raw={nativeClass:string;from:string|null;to:string|null;ok:boolean;clearanceCssPx:number;visiblePathFraction:number;startInkPixels:number;endInkPixels:number;arrowInkPixels:number;captionInkPixels:number;maskId?:string;cutCount:number;cutMarginCssPx?:number;maskPixelDeltaPixels:number;problems:string[]};
  const root=svg as SVGSVGElement,view=root.viewBox.baseVal,links=[...root.querySelectorAll<SVGGElement>('g.lini-link')],problems:string[]=[];
  const transformBox=(box:R,matrix:DOMMatrix):R=>{const points=[new DOMPoint(box.x,box.y),new DOMPoint(box.x+box.width,box.y),new DOMPoint(box.x,box.y+box.height),new DOMPoint(box.x+box.width,box.y+box.height)].map(point=>point.matrixTransform(matrix));const xs=points.map(point=>point.x),ys=points.map(point=>point.y);return{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};};
  const overlap=(a:R,b:R)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
  const boxDistance=(point:P,box:R)=>Math.hypot(Math.max(box.x-point.x,0,point.x-box.x-box.width),Math.max(box.y-point.y,0,point.y-box.y-box.height));
  const rootMatrix=root.getScreenCTM();
  if(!rootMatrix||!Number.isFinite(view.width)||view.width<=0||view.height<=0)return{ok:false,links:[],problems:['The SVG has no finite viewBox or screen transform.']};
  const screenToRoot=rootMatrix.inverse();
  const cssBox=(element:SVGGraphicsElement)=>transformBox(element.getBBox(),element.getScreenCTM()!);
  const rootBox=(element:SVGGraphicsElement)=>transformBox(element.getBBox(),screenToRoot.multiply(element.getScreenCTM()!));
  const raster=async(mutation?:{nativeClass:string;kind:'unmask'|'remove-path'|'remove-arrow'}):Promise<ImageData>=>{
   const clone=root.cloneNode(true) as SVGSVGElement;
   if(mutation){const edge=[...clone.querySelectorAll<SVGGElement>('g.lini-link')].find(item=>item.classList.contains(mutation.nativeClass));if(mutation.kind==='unmask')edge?.querySelector(':scope > path')?.removeAttribute('mask');if(mutation.kind==='remove-path')edge?.querySelector(':scope > path')?.remove();if(mutation.kind==='remove-arrow')edge?.querySelector(':scope > .lini-marker-arrow')?.remove();}
   const scale=Math.min(1,2048/Math.max(view.width,view.height)),width=Math.max(1,Math.ceil(view.width*scale)),height=Math.max(1,Math.ceil(view.height*scale)),blobUrl=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'}));
   try{const image=new Image();image.src=blobUrl;await image.decode();const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw Error('Canvas 2D context is unavailable for native ink sampling.');context.drawImage(image,0,0,width,height);return context.getImageData(0,0,width,height);}finally{URL.revokeObjectURL(blobUrl);}
  };
  const baseline=await raster();
  const pixelRect=(box:R)=>({x:(box.x-view.x)/view.width*baseline.width,y:(box.y-view.y)/view.height*baseline.height,width:box.width/view.width*baseline.width,height:box.height/view.height*baseline.height});
  const countDarkGlyphPixels=(data:ImageData,box:R)=>{const rect=pixelRect(box),left=Math.max(0,Math.floor(rect.x)),right=Math.min(data.width,Math.ceil(rect.x+rect.width)),top=Math.max(0,Math.floor(rect.y)),bottom=Math.min(data.height,Math.ceil(rect.y+rect.height));let count=0;for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){const i=(y*data.width+x)*4;if(data.data[i+3]!>=64&&Math.max(data.data[i]!,data.data[i+1]!,data.data[i+2]!)<=140)count++;}return count;};
  const glyphCutCoverage=(data:ImageData,box:R,cuts:R[],margin:number)=>{const rect=pixelRect(box),scale=Math.min(1,2048/Math.max(view.width,view.height)),left=Math.max(0,Math.floor(rect.x)),right=Math.min(data.width,Math.ceil(rect.x+rect.width)),top=Math.max(0,Math.floor(rect.y)),bottom=Math.min(data.height,Math.ceil(rect.y+rect.height));let glyphPixels=0,coveredPixels=0,minMargin=Infinity;for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){const i=(y*data.width+x)*4;if(data.data[i+3]!<64||Math.max(data.data[i]!,data.data[i+1]!,data.data[i+2]!)>140)continue;glyphPixels++;const rootPoint={x:view.x+(x+.5)/scale,y:view.y+(y+.5)/scale},screen=new DOMPoint(rootPoint.x,rootPoint.y).matrixTransform(rootMatrix),point={x:screen.x,y:screen.y};const distances=cuts.map(cut=>Math.min(point.x-cut.x,point.y-cut.y,cut.x+cut.width-point.x,cut.y+cut.height-point.y));const best=Math.max(...distances);if(best>=margin){coveredPixels++;minMargin=Math.min(minMargin,best);}}return{glyphPixels,coveredPixels,minMargin};};
  const deltaPixels=(a:ImageData,b:ImageData,boxes:R[])=>{let count=0;for(const box of boxes){const r=pixelRect(box),left=Math.max(0,Math.floor(r.x)),right=Math.min(a.width,Math.ceil(r.x+r.width)),top=Math.max(0,Math.floor(r.y)),bottom=Math.min(a.height,Math.ceil(r.y+r.height));for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){const i=(y*a.width+x)*4;if(Math.abs(a.data[i]!-b.data[i]!)>12||Math.abs(a.data[i+1]!-b.data[i+1]!)>12||Math.abs(a.data[i+2]!-b.data[i+2]!)>12||Math.abs(a.data[i+3]!-b.data[i+3]!)>12)count++;}}return count;};
  const rows:Raw[]=[];
  for(const link of links){
   const nativeClass=[...link.classList].find(value=>/^lini-style-e[0-9]+$/u.test(value))??'',from=link.getAttribute('data-from'),to=link.getAttribute('data-to'),path=link.querySelector<SVGPathElement>(':scope > path'),label=link.querySelector<SVGTextElement>(':scope > text.lini-link-label'),arrow=link.querySelector<SVGGraphicsElement>(':scope > .lini-marker-arrow'),issues:string[]=[];
   const row:Raw={nativeClass,from,to,ok:true,clearanceCssPx:Infinity,visiblePathFraction:0,startInkPixels:0,endInkPixels:0,arrowInkPixels:0,captionInkPixels:0,cutCount:0,maskPixelDeltaPixels:0,problems:issues};
   const fail=(message:string)=>{issues.push(message);row.ok=false;};
   if(!nativeClass||!path||!label){fail('The mapped native link, route path, or direct caption carrier is missing.');rows.push(row);continue;}
   if(label.closest('g.lini-link')!==link||path.closest('g.lini-link')!==link)fail('Caption and route do not belong to the same native link group.');
   const pathBox=cssBox(path),labelBox=cssBox(label),labelRoot=rootBox(label),pathRoot=rootBox(path),pathLength=path.getTotalLength(),pathMatrix=path.getScreenCTM(),strokeWidth=Number.parseFloat(getComputedStyle(path).strokeWidth)||0,strokeScale=pathMatrix?Math.max(Math.hypot(pathMatrix.a,pathMatrix.b),Math.hypot(pathMatrix.c,pathMatrix.d)):0,strokeRadius=strokeWidth*strokeScale/2;
   const paintIsVisible=(element:SVGGraphicsElement,paint:'stroke'|'fill')=>{const style=getComputedStyle(element);if(style.display==='none'||style.visibility!=='visible'||Number(style.opacity)===0||Number(paint==='stroke'?style.strokeOpacity:style.fillOpacity)===0||style[paint]==='none')return false;for(let ancestor:Element|null=element.parentElement;ancestor;ancestor=ancestor.parentElement){const parentStyle=getComputedStyle(ancestor);if(parentStyle.display==='none'||parentStyle.visibility!=='visible'||Number(parentStyle.opacity)===0)return false;}return true;};
   if(!Number.isFinite(pathLength)||pathLength<=0||!pathMatrix)fail('The native route has no measurable length or screen transform.');
   if(!paintIsVisible(path,'stroke'))fail('The owned route stroke is hidden or has no visible stroke paint.');
   if(arrow&&!paintIsVisible(arrow,'fill'))fail('The owned arrow is hidden or has no visible fill paint.');
   const maskRef=path.getAttribute('mask'),maskMatch=maskRef?.match(/^url\(#([^)]*)\)$/u),maskId=maskMatch?.[1],masks=maskId?[...root.querySelectorAll<SVGMaskElement>('mask')].filter(mask=>mask.id===maskId):[];
   let cutBoxes:R[]=[],glyphMargin=Infinity,glyphCoverageOk=false,activeMask=false;
   if(maskRef&&!maskMatch)fail('Route mask reference is external or is not a single local fragment URL.');
   if(maskId){
    row.maskId=maskId;const mask=masks[0];
    if(masks.length!==1||!mask)fail('Route mask reference is missing or ambiguous inside this SVG.');
    else{
     if(mask.closest('g.lini-link')!==link)fail('Route mask is not local to its owning native link group.');
     if(mask.getAttribute('maskUnits')!=='userSpaceOnUse'||(mask.getAttribute('maskContentUnits')!==null&&mask.getAttribute('maskContentUnits')!=='userSpaceOnUse'))fail('Route mask must use userSpaceOnUse geometry; objectBoundingBox mask content is unsupported.');
     if(getComputedStyle(mask).maskType!=='luminance'&&mask.getAttribute('mask-type')!=='luminance')fail('Route mask is not an actual luminance mask.');
     if(mask.hasAttribute('filter')||mask.hasAttribute('opacity')||mask.querySelector('filter,image,use,foreignObject,script'))fail('Route mask contains unsupported filters, opacity, external images, or nested rendering elements.');
     const children=[...mask.children],background=children.filter(child=>child.classList.contains('lini-cut-bg')&&child.tagName.toLowerCase()==='rect'),cuts=children.filter(child=>child.classList.contains('lini-cut')&&child.tagName.toLowerCase()==='rect');row.cutCount=cuts.length;
     if(children.length!==background.length+cuts.length||background.length!==1||cuts.length===0)fail('Luminance mask must contain exactly one opaque white keep rectangle and one or more black knockout rectangles.');
     const backgroundRect=background[0] as SVGRectElement|undefined;
     if(backgroundRect){const style=getComputedStyle(backgroundRect),box=backgroundRect.getBBox(),maskBox={x:Number(mask.getAttribute('x')),y:Number(mask.getAttribute('y')),width:Number(mask.getAttribute('width')),height:Number(mask.getAttribute('height'))};if(style.fill!=='rgb(255, 255, 255)'||style.fillOpacity!=='1'||style.opacity!=='1'||style.stroke!=='none')fail('Mask keep rectangle is not opaque white luminance.');if(![box.x,box.y,box.width,box.height,...Object.values(maskBox)].every(Number.isFinite)||Math.abs(box.x-maskBox.x)>.05||Math.abs(box.y-maskBox.y)>.05||Math.abs(box.width-maskBox.width)>.05||Math.abs(box.height-maskBox.height)>.05)fail('White mask keep rectangle does not match the authored user-space mask bounds.');}
     for(const child of cuts){const cut=child as SVGRectElement,style=getComputedStyle(cut),matrix=cut.getScreenCTM();if(style.fill!=='rgb(0, 0, 0)'||style.fillOpacity!=='1'||style.opacity!=='1'||style.stroke!=='none')fail('Mask knockout is not opaque black luminance.');if(cut.hasAttribute('filter')||cut.hasAttribute('transform')||!matrix)fail('Mask knockout uses unsupported filter/transform or has no native coordinate transform.');else cutBoxes.push(transformBox(cut.getBBox(),matrix));}
     const glyphCoverage=glyphCutCoverage(baseline,labelRoot,cutBoxes,1);
     glyphCoverageOk=glyphCoverage.glyphPixels>=2&&glyphCoverage.coveredPixels===glyphCoverage.glyphPixels;
     if(glyphCoverageOk)glyphMargin=glyphCoverage.minMargin;
     activeMask=true;
    }
   }
   const routePoint=(distance:number)=>{const point=path.getPointAtLength(Math.min(pathLength,Math.max(0,distance)));const screen=point.matrixTransform(pathMatrix!);return{x:screen.x,y:screen.y};};
   const pathPoints:P[]=[];const count=Math.max(100,Math.min(800,Math.ceil(pathLength/2)));for(let index=0;index<=count;index++)pathPoints.push(routePoint(pathLength*index/count));
   const cutExpanded=cutBoxes.map(box=>({x:box.x-strokeRadius-.5,y:box.y-strokeRadius-.5,width:box.width+2*(strokeRadius+.5),height:box.height+2*(strokeRadius+.5)}));
   const unmasked=pathPoints.filter(point=>!cutExpanded.some(box=>point.x>=box.x&&point.x<=box.x+box.width&&point.y>=box.y&&point.y<=box.y+box.height));row.visiblePathFraction=pathPoints.length?unmasked.length/pathPoints.length:0;
   // Sample separated route portions rather than the arrow-adjacent endpoints,
   // where the native node and arrow glyphs can legitimately cover the stroke.
   const firstPoints=pathPoints.filter((_,index)=>index/count>=.08&&index/count<=.36),lastPoints=pathPoints.filter((_,index)=>index/count>=.64&&index/count<=.92);
   let captionVisible=label.getBBox().width>0&&label.getBBox().height>0;for(let ancestor:Element|null=label;ancestor&&captionVisible;ancestor=ancestor.parentElement){const style=getComputedStyle(ancestor);if(style.display==='none'||style.visibility!=='visible'||Number(style.opacity)===0)captionVisible=false;}
   row.captionInkPixels=countDarkGlyphPixels(baseline,labelRoot);
   let clearance=Infinity;for(const point of pathPoints)clearance=Math.min(clearance,boxDistance(point,labelBox));row.clearanceCssPx=clearance;
   if(!captionVisible||row.captionInkPixels<2)fail('The actual native caption is hidden or has no visible rasterized glyph ink.');
   if(row.visiblePathFraction<.5)fail(`Mask removes too much of the owned route (${Math.round(row.visiblePathFraction*100)}% of sampled centerline remains).`);
   if(clearance<8&&activeMask&&!glyphCoverageOk)fail('Black knockout does not cover every rasterized caption glyph pixel with a 1 CSS px interior margin.');
   const removePath=await raster({nativeClass,kind:'remove-path'}),routeRegions=[...firstPoints,...lastPoints].map(point=>{const rootPoint=new DOMPoint(point.x,point.y).matrixTransform(screenToRoot),radius=5/Math.max(strokeScale,.01);return{x:rootPoint.x-radius,y:rootPoint.y-radius,width:2*radius,height:2*radius};});
   const routeDiffs=routeRegions.map((box,index)=>deltaPixels(baseline,removePath,[box]));const firstDiff=routeDiffs.slice(0,firstPoints.length),lastDiff=routeDiffs.slice(firstPoints.length);row.startInkPixels=Math.max(0,...firstDiff);row.endInkPixels=Math.max(0,...lastDiff);
   if(row.startInkPixels<1||row.endInkPixels<1)fail('Removing the owned route changes no pixels in both separated surviving-stroke regions.');
   if(arrow){const removeArrow=await raster({nativeClass,kind:'remove-arrow'});row.arrowInkPixels=deltaPixels(baseline,removeArrow,[rootBox(arrow)]);if(row.arrowInkPixels<1)fail('Removing the owned arrow changes no pixels in its native bounds.');}
   if(clearance<8&&!activeMask)fail(`Caption is only ${clearance.toFixed(2)} CSS px from the route and has no qualified luminance mask.`);
   if(activeMask&&maskId){
    const before=baseline,without=await raster({nativeClass,kind:'unmask'}),cutRootBoxes=cutBoxes.map(box=>transformBox(box,screenToRoot)),effectBoxes=cutRootBoxes.map(box=>{const overlapBox={x:Math.max(box.x,pathRoot.x),y:Math.max(box.y,pathRoot.y),width:Math.min(box.x+box.width,pathRoot.x+pathRoot.width)-Math.max(box.x,pathRoot.x),height:Math.min(box.y+box.height,pathRoot.y+pathRoot.height)-Math.max(box.y,pathRoot.y)};return overlapBox.width>0&&overlapBox.height>0?overlapBox:undefined;}).filter((box):box is R=>!!box);
    row.maskPixelDeltaPixels=deltaPixels(before,without,effectBoxes);
    if(clearance<8&&row.maskPixelDeltaPixels<1)fail('The native luminance mask changes no actual path pixels in the caption cut region; mask paint is not corroborated.');
   }
   if(clearance<8&&activeMask&&!Number.isFinite(glyphMargin))fail('Caption glyph bounds could not be related to native mask cut geometry.');
   if(Number.isFinite(glyphMargin))row.cutMarginCssPx=glyphMargin;
   rows.push(row);
  }
  for(const row of rows)for(const issue of row.problems)problems.push(`${row.nativeClass||'unmapped link'}: ${issue}`);
  return{ok:rows.length>0&&rows.every(row=>row.ok),links:rows,problems};
 });
}
