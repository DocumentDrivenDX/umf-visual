// SPDX-License-Identifier: MIT OR Apache-2.0
/** Renderer-only layering for an ungrouped directed acyclic graph. */

export interface DirectedDagEdge {from:string;to:string;directed?:boolean;}

/**
 * Assign longest-path ranks without mutating declaration order. A missing
 * result means the graph is not a directed acyclic graph this policy can lay
 * out (for example, a cycle, headless edge, or unresolved endpoint).
 */
export function directedDagRanks(nodeIds:readonly string[],edges:readonly DirectedDagEdge[]):Map<string,number>|undefined{
 const rank=new Map<string,number>(),outgoing=new Map<string,Set<string>>(),indegree=new Map<string,number>();
 for(const id of nodeIds){if(rank.has(id))return undefined;rank.set(id,0);outgoing.set(id,new Set());indegree.set(id,0);}
 for(const edge of edges){
  if(edge.directed===false||!rank.has(edge.from)||!rank.has(edge.to))return undefined;
  if(!outgoing.get(edge.from)!.has(edge.to)){outgoing.get(edge.from)!.add(edge.to);indegree.set(edge.to,indegree.get(edge.to)!+1);}
 }
 const remaining=new Set(nodeIds),ordered:string[]=[];
 while(remaining.size){
  const next=nodeIds.find(id=>remaining.has(id)&&indegree.get(id)===0);
  if(next===undefined)return undefined;
  remaining.delete(next);ordered.push(next);
  for(const target of outgoing.get(next)??[]){rank.set(target,Math.max(rank.get(target)!,rank.get(next)!+1));indegree.set(target,indegree.get(target)!-1);}
 }
 return ordered.length===nodeIds.length?rank:undefined;
}
