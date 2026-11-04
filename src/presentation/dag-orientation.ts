// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private, renderer-only direction estimate for un-authored Graphviz DAG layouts. */
import type {VisualEdge,VisualNode} from '../extensions/visual';
import {directedDagRanks} from './dag-layout';

export interface DagOrientationEstimate {direction:'LR'|'TB';lr:{width:number;height:number;fit:number};tb:{width:number;height:number;fit:number};}

export function hasFlatPipelineNodes(nodes:readonly VisualNode[],groups:readonly unknown[]):boolean{
 return groups.length===0&&nodes.every(node=>!node.group&&!node.parent);
}

const NODE_FONT_PX=16,EDGE_FONT_PX=12,TITLE_FONT_PX=22,LINE_PX=20,EDGE_LINE_PX=15,NODE_GAP=36,RANK_GAP=45,EDGE_LABEL_GAP=12,GRAPH_PAD=25,TITLE_GAP=10,TITLE_LINE_PX=28;
const glyphWidth=(text:string,fontSize:number)=>Array.from(text).reduce((width,char)=>width+fontSize*(char===' '?0.28:/[ilI.,'`!|:;]/u.test(char)?0.32:/[MW@#%&]/u.test(char)?0.84:0.57),0);
const textFootprint=(text:string,fontSize:number,linePx:number)=>{
 const lines=text.split('\n');
 return {width:Math.max(0,...lines.map(line=>glyphWidth(line,fontSize))),height:Math.max(1,lines.length)*linePx};
};

/** The callback must be the exact wrapped Graphviz node caption used by emission. */
export function estimateGraphvizDagOrientation(
 nodes:readonly VisualNode[],edges:readonly VisualEdge[],labelNode:(node:VisualNode)=>string,title:string,
 viewport:{width:number;height:number}={width:1600,height:900},
):DagOrientationEstimate|undefined{
 const ranks=directedDagRanks(nodes.map(node=>node.id),edges.filter(edge=>edge.kind!=='return'));
 if(!ranks)return undefined;
 const layers:VisualNode[][]=[];
 for(const node of nodes){const rank=ranks.get(node.id)!;(layers[rank]??=[]).push(node);}
 if(!layers.length)return undefined;
 const dimensions=new Map(nodes.map(node=>{
  const text=textFootprint(labelNode(node),NODE_FONT_PX,LINE_PX);
  return [node.id,{width:Math.max(169,text.width+38),height:Math.max(78,text.height+30)}] as const;
 }));
 const rankEdgeGap=(fromRank:number,direction:'LR'|'TB')=>{
  const crossing=edges.filter(edge=>edge.kind!=='return'&&edge.label!==undefined&&ranks.has(edge.from)&&ranks.has(edge.to)&&ranks.get(edge.from)!<=fromRank&&ranks.get(edge.to)!>fromRank);
  if(!crossing.length)return RANK_GAP;
  const sizes=crossing.map(edge=>({size:textFootprint(edge.label??'',EDGE_FONT_PX,EDGE_LINE_PX),span:Math.abs(ranks.get(edge.to)!-ranks.get(edge.from)!)}));
  // Edge labels use Graphviz's 12px edge font. Horizontal rank corridors must
  // carry their text width; vertical corridors carry the caption's line height.
  const alongAxis=Math.max(...sizes.map(({size,span})=>(direction==='LR'?size.width:size.height)/Math.max(1,span)));
  return Math.max(RANK_GAP,alongAxis+EDGE_LABEL_GAP);
 };
 const titleSize=textFootprint(title,TITLE_FONT_PX,TITLE_LINE_PX);
 const frame=(contentWidth:number,contentHeight:number)=>({
  width:Math.max(contentWidth,titleSize.width)+GRAPH_PAD*2,
  height:contentHeight+GRAPH_PAD*2+TITLE_GAP+titleSize.height,
 });
 const measure=(direction:'LR'|'TB')=>{
  if(direction==='LR'){
   const contentWidth=layers.reduce((sum,layer,index)=>sum+Math.max(...layer.map(node=>dimensions.get(node.id)!.width))+(index?rankEdgeGap(index-1,'LR'):0),0);
   const contentHeight=Math.max(...layers.map(layer=>layer.reduce((sum,node)=>sum+dimensions.get(node.id)!.height,0)+Math.max(0,layer.length-1)*NODE_GAP));
   const {width,height}=frame(contentWidth,contentHeight);
   return {width,height,fit:Math.min(1,viewport.width/width,viewport.height/height)};
  }
  const nodeWidth=Math.max(...layers.map(layer=>layer.reduce((sum,node)=>sum+dimensions.get(node.id)!.width,0)+Math.max(0,layer.length-1)*NODE_GAP));
  const captionWidth=Math.max(0,...edges.filter(edge=>edge.kind!=='return'&&edge.label!==undefined).map(edge=>textFootprint(edge.label??'',EDGE_FONT_PX,EDGE_LINE_PX).width));
  const contentWidth=Math.max(nodeWidth,captionWidth+EDGE_LABEL_GAP);
  const contentHeight=layers.reduce((sum,layer,index)=>sum+Math.max(...layer.map(node=>dimensions.get(node.id)!.height))+(index?rankEdgeGap(index-1,'TB'):0),0);
  const {width,height}=frame(contentWidth,contentHeight);
  return {width,height,fit:Math.min(1,viewport.width/width,viewport.height/height)};
 };
 const lr=measure('LR'),tb=measure('TB');
 return {direction:tb.fit>lr.fit?'TB':'LR',lr,tb};
}
