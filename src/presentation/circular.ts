// SPDX-License-Identifier: MIT OR Apache-2.0
/** Renderer policy for a circular placement; the source stores order, never coordinates. */

export interface CircularItemSize {id:string;width:number;height:number;}
export interface CircularPosition {id:string;x:number;y:number;}
export interface CircularPlacement {radius:number;positions:CircularPosition[];}

/** Place the provided clockwise sequence on an evenly spaced circle, starting at the right. */
export function circularPlacement<T extends CircularItemSize>(items:readonly T[],gap=18):CircularPlacement {
 if(items.length===0)return{radius:0,positions:[]};
 const clearance=items.length===1?0:Math.max(...items.map(item=>Math.hypot(item.width,item.height)))+gap;
 const safeRadius=items.length===1?0:clearance/(2*Math.sin(Math.PI/items.length));
 return{radius:safeRadius,positions:items.map((item,index)=>{const angle=2*Math.PI*index/items.length;return{id:item.id,x:safeRadius*Math.cos(angle),y:safeRadius*Math.sin(angle)};})};
}
