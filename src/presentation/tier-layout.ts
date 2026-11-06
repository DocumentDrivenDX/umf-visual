// SPDX-License-Identifier: MIT OR Apache-2.0
/** Stable ascending sort for authored tiers; missing tiers remain unranked and come last. */
export function orderTiered<T extends {id:string;tier?:number}>(items:readonly T[]):T[]{
 return items.map((item,index)=>({item,index})).sort((left,right)=>{
  const a=left.item.tier,b=right.item.tier;
  if(a===undefined&&b!==undefined)return 1;
  if(a!==undefined&&b===undefined)return -1;
  if(a!==undefined&&b!==undefined&&a!==b)return a-b;
  return left.index-right.index;
 }).map(row=>row.item);
}
