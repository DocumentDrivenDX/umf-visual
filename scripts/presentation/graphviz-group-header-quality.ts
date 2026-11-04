// SPDX-License-Identifier: MIT OR Apache-2.0
/** Independent Graphviz proof that owned cluster header glyphs clear painted edge paths. */
import {createHash} from 'node:crypto';
import type {Page} from 'playwright';
import type {Document} from '@umf/core';
import {getVisual,type Visual} from '../../src/extensions/visual';
import type {PresentationPlan} from '../../src/presentation';
import type {PresentationQualityCheck} from './quality';

type Box={x:number;y:number;width:number;height:number};
type GroupProof={nativeId:string;expected:string;visible:boolean;glyphs:Array<{text:string;box:Box}>;allTextCount:number;runCount:number;clusterCount:number};
type EdgeProof={nativeId:string;pathCount:number;visiblePathCount:number;invalid:string[];samples:Array<{x:number;y:number;radius:number}>};
type SvgProof={groups:GroupProof[];edges:EdgeProof[];clusterCount:number;error?:string};
const base='/extensions/umf.visual';
const sha=(value:string)=>createHash('sha256').update(Buffer.from(value,'utf8')).digest('hex');
const norm=(value:string)=>value.replace(/\s+/gu,' ').trim();
const pass=(sourceSha256:string,ok:boolean,details:string):PresentationQualityCheck=>({check:'graphviz-group-header-edge-clearance',sourceSha256,result:ok?'pass':'fail',details});
const mapPath=(kind:string,index:number)=>`${base}/${kind}/${index}`;
const groupExpected=(visual:Visual,index:number)=>{
 const group=visual.groups?.[index];if(!group)return '';
 return norm([group.label,group.detail,visual.kind==='flow'&&visual.form==='zoned'&&group.tier!==undefined?'Tier '+group.tier:undefined].filter((item):item is string=>typeof item==='string').join(' '));
};

/** Collect renderer-owned glyph boxes and dense, painted edge-path samples in CSS pixels. */
async function inspectSvg(page:Page,groupIds:string[],edgeIds:string[],expected:string[]):Promise<SvgProof>{
 try{return await page.locator('#frame svg').first().evaluate((root,args)=>{
  const svg=root as SVGSVGElement,normalize=(value:string)=>value.replace(/\s+/gu,' ').trim();
  const alpha=(value:string):number|null=>{const color=value.trim().toLowerCase();if(!color)return null;if(color==='none'||color==='transparent')return 0;const hex=/^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/u.exec(color)?.[1];if(hex){if(hex.length===3)return 1;if(hex.length===4)return parseInt(hex[3]!,16)/15;if(hex.length===6)return 1;return parseInt(hex.slice(6),16)/255;}const rgb=/^rgba?\(\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?\s*(?:[,/]\s*([\d.]+)%?\s*)?\)$/u.exec(color);if(rgb){const channels=rgb.slice(1,4).map(Number);if(channels.some(channel=>!Number.isFinite(channel)||channel<0||channel>255))return null;const raw=rgb[4];if(raw===undefined)return 1;const value=Number(raw),isPercent=/\d%\s*\)$/.test(color);if(!Number.isFinite(value)||value<0||value>(isPercent?100:1))return null;return isPercent?value/100:value;}return null;};
  const opacity=(element:Element)=>{let result=1;for(let current:Element|null=element;current;current=current.parentElement){const style=getComputedStyle(current);if(style.display==='none'||style.visibility==='hidden')return 0;const value=Number(style.opacity);if(!Number.isFinite(value)||value<0||value>1)return 0;result*=value;}return result;};
  const visibleText=(element:Element)=>{const style=getComputedStyle(element),fill=alpha(style.fill),fillOpacity=Number(style.fillOpacity);return opacity(element)>0&&fill!==null&&Number.isFinite(fillOpacity)&&fillOpacity>0&&fillOpacity<=1&&fill*fillOpacity>0;};
  const rect=(element:Element):Box=>{const bounds=element.getBoundingClientRect(),rootBounds=svg.getBoundingClientRect();return{x:bounds.left-rootBounds.left,y:bounds.top-rootBounds.top,width:bounds.width,height:bounds.height};};
  const groups:GroupProof[]=args.groupIds.map((nativeId,index)=>{
   const selectorTitle='cluster_'+nativeId,candidates=[...svg.querySelectorAll<SVGGElement>('g.cluster')].filter(group=>normalize(group.querySelector(':scope > title')?.textContent??'')===selectorTitle);
   const cluster=candidates[0],allText=cluster?[...cluster.querySelectorAll<SVGTextElement>('text')].filter(text=>text.closest('g.cluster,g.node,g.edge')===cluster):[],allTextCount=allText.length,runs:Array<{text:string;box:Box;visible:boolean}>=[];
   for(const text of allText){const walker=text.ownerDocument.createTreeWalker(text,NodeFilter.SHOW_TEXT);let node:Node|null;while((node=walker.nextNode())){const value=node.nodeValue??'';if(!normalize(value))continue;const parent=node.parentElement??text,range=text.ownerDocument.createRange();range.selectNodeContents(node);const rootBounds=svg.getBoundingClientRect(),rects=[...range.getClientRects()].map(bounds=>({x:bounds.left-rootBounds.left,y:bounds.top-rootBounds.top,width:bounds.width,height:bounds.height}));if(!rects.length)runs.push({text:value,box:{x:NaN,y:NaN,width:0,height:0},visible:false});else{const x=Math.min(...rects.map(box=>box.x)),y=Math.min(...rects.map(box=>box.y));runs.push({text:value,box:{x,y,width:Math.max(...rects.map(box=>box.x+box.width))-x,height:Math.max(...rects.map(box=>box.y+box.height))-y},visible:visibleText(parent)});}range.detach();}}
   const runCount=runs.length,visible=runs.length>0&&allText.length>0&&runs.every(run=>run.visible),glyphs=runs.filter(run=>run.visible).map(({text,box})=>({text:normalize(text),box})),textStream=normalize(runs.map(item=>item.text).join(' '));return{nativeId,expected:args.expected[index]??'',visible:visible&&textStream===(args.expected[index]??''),glyphs,allTextCount,runCount,clusterCount:candidates.length};
  });
  const edges:EdgeProof[]=args.edgeIds.map(nativeId=>{
   const candidates=[...svg.querySelectorAll<SVGGElement>('g.edge')].filter(group=>group.getAttribute('id')===nativeId||normalize(group.querySelector(':scope > title')?.textContent??'')===nativeId),edge=candidates[0],paths=edge?[...edge.querySelectorAll<SVGPathElement>('path')].filter(path=>path.closest('g.edge')===edge):[],samples:EdgeProof['samples']=[],invalid:string[]=[];let visiblePathCount=0;
   if(candidates.length!==1)invalid.push('mapped edge carrier missing or duplicated');
   for(const path of paths){
    const style=getComputedStyle(path),strokeAlpha=alpha(style.stroke),strokeOpacity=Number(style.strokeOpacity),paintAlpha=strokeAlpha===null?Number.NaN:strokeAlpha*strokeOpacity*opacity(path),localWidth=parseFloat(style.strokeWidth),matrix=path.getScreenCTM(),length=path.getTotalLength();
    if(!matrix||!Number.isFinite(length)||length<=0||!Number.isFinite(localWidth)||localWidth<=0||!Number.isFinite(strokeOpacity)||strokeOpacity<0||strokeOpacity>1||!Number.isFinite(paintAlpha)||paintAlpha<=0){invalid.push('edge path is hidden, unpainted, or has nonfinite geometry');continue;}
    visiblePathCount++;
    const a=matrix.a,b=matrix.b,c=matrix.c,d=matrix.d,trace=a*a+b*b+c*c+d*d,det=a*d-b*c,scale=Math.sqrt(Math.max(0,(trace+Math.sqrt(Math.max(0,trace*trace-4*det*det)))/2)),strokeRadius=(style.vectorEffect==='non-scaling-stroke'?localWidth:localWidth*scale)/2;
    if(!Number.isFinite(scale)||scale<=0||!Number.isFinite(strokeRadius)){invalid.push('edge path transform or stroke width is nonfinite');continue;}
    const rootBounds=svg.getBoundingClientRect(),cssLength=length*scale,count=Math.max(1,Math.ceil(cssLength/.5));if(count>50000){invalid.push('edge path exceeds bounded geometry sampling');continue;}
    for(let step=0;step<=count;step++){const local=path.getPointAtLength(length*step/count),screen=new DOMPoint(local.x,local.y).matrixTransform(matrix),x=screen.x-rootBounds.left,y=screen.y-rootBounds.top;if(!Number.isFinite(x)||!Number.isFinite(y)){invalid.push('edge path sample is nonfinite');break;}samples.push({x,y,radius:strokeRadius});}
   }
   if(!paths.length||visiblePathCount!==paths.length)invalid.push('mapped edge has no complete painted path inventory');
   return{nativeId,pathCount:paths.length,visiblePathCount,invalid,samples};
  });
  return{groups,edges,clusterCount:svg.querySelectorAll('g.cluster').length};
 },{groupIds,edgeIds,expected});}catch(reason){return{groups:[],edges:[],clusterCount:0,error:reason instanceof Error?reason.message:String(reason)};}
}

/** Prove source-bound group headings clear every authored Graphviz flow edge in the rendered SVG. */
export async function verifyGraphvizGroupHeaderQuality(page:Page,input:{document:Document;plan:PresentationPlan}):Promise<PresentationQualityCheck>{
 const sourceSha256=sha(input.plan.source),failures:string[]=[];let visual:Visual|undefined;
 try{visual=getVisual(input.document);}catch{/* reported below */}
 const groups=visual?.kind==='flow'?visual.groups??[]:[],edges=visual?.kind==='flow'?visual.edges??[]:[];
 let eligible=visual?.kind==='flow'&&['network','pipeline','zoned','lanes'].includes(visual.form)&&groups.length>0&&input.plan.backend==='graphviz';
 if(!eligible)failures.push('The source is outside the bounded Graphviz grouped-flow profile.');
 const groupRows=groups.map((group,index)=>({group,index,path:mapPath('groups',index),rows:input.plan.elementMap.filter(item=>item.kind==='group'&&item.logicalId===group.id&&item.sourcePath===mapPath('groups',index))}));
 const edgeRows=edges.map((edge,index)=>({edge,index,path:mapPath('edges',index),rows:input.plan.elementMap.filter(item=>item.kind==='edge'&&item.logicalId===edge.id&&item.sourcePath===mapPath('edges',index))}));
 for(const row of groupRows)if(row.rows.length!==1)failures.push(`Group source ownership is missing or duplicated at ${row.path}.`);
 for(const row of edgeRows)if(row.rows.length!==1)failures.push(`Edge source ownership is missing or duplicated at ${row.path}.`);
 const groupIds=groupRows.map(row=>row.rows[0]?.nativeId??''),edgeIds=edgeRows.map(row=>row.rows[0]?.nativeId??''),expected=groupRows.map(row=>groupExpected(visual!,row.index)),dom=await inspectSvg(page,groupIds,edgeIds,expected);
 if(dom.error)failures.push(`Rendered SVG group/edge geometry is unavailable: ${dom.error}.`);
 if(dom.groups.length!==groups.length||dom.edges.length!==edges.length)failures.push('Mapped group or edge geometry inventory is incomplete.');
 if(dom.clusterCount!==groups.length)failures.push(`Rendered SVG has ${dom.clusterCount} cluster carriers for ${groups.length} source groups; unexpected or missing native group headers are present.`);
 for(let index=0;index<dom.groups.length;index++){const group=dom.groups[index]!;if(group.clusterCount!==1||!group.expected||!group.visible||group.runCount===0||!group.glyphs.length||group.glyphs.some(glyph=>!Number.isFinite(glyph.box.x)||!Number.isFinite(glyph.box.y)||!Number.isFinite(glyph.box.width)||!Number.isFinite(glyph.box.height)||glyph.box.width<=0||glyph.box.height<=0))failures.push(`Mapped group header glyph runs are missing, hidden, extra, or not owned by its exact cluster at ${groupRows[index]?.path??index}.`);}
 for(let index=0;index<dom.edges.length;index++)if(dom.edges[index]!.invalid.length)failures.push(`Mapped edge geometry is not a complete visible path inventory at ${edgeRows[index]?.path??index}: ${dom.edges[index]!.invalid.join(', ')}.`);
 const glyphs=dom.groups.flatMap((group,groupIndex)=>group.glyphs.map(glyph=>({...glyph,groupIndex}))),paths=dom.edges.flatMap((edge,edgeIndex)=>edge.samples.map(sample=>({...sample,edgeIndex})));let minimum=Infinity;const collisionPairs=new Set<string>();
 for(const sample of paths)for(const glyph of glyphs){const box=glyph.box,dx=Math.max(box.x-sample.x,0,sample.x-(box.x+box.width)),dy=Math.max(box.y-sample.y,0,sample.y-(box.y+box.height)),clearance=Math.hypot(dx,dy)-sample.radius-.25;minimum=Math.min(minimum,clearance);if(clearance<2)collisionPairs.add(`${sample.edgeIndex}:${glyph.groupIndex}`);}
 if(collisionPairs.size)failures.push(`${collisionPairs.size} mapped group-header/edge pair(s) intersect or have less than 2 CSS px of painted-path clearance after stroke width.`);
 const ok=eligible&&failures.length===0&&(Number.isFinite(minimum)||paths.length===0);
 return pass(sourceSha256,ok,ok?`All ${groups.length} source-mapped Graphviz cluster headers preserve their exact visible text, and all ${edges.length} mapped edge path(s) clear every visible header glyph by at least 2 CSS px after stroke width. ${Number.isFinite(minimum)?`Minimum measured clearance: ${minimum.toFixed(1)} CSS px.`:'No authored edge paths are present.'}`:failures.join('; ')||'Graphviz group-header edge clearance failed.');
}
