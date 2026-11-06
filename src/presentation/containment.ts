// SPDX-License-Identifier: MIT OR Apache-2.0
/** Source-ordered parent index shared by native nested-containment adapters. */
import type {VisualNode} from '../extensions/visual';

export interface ContainmentForest {
 roots:VisualNode[];
 childrenByParent:ReadonlyMap<string,VisualNode[]>;
 sourceIndexById:ReadonlyMap<string,number>;
}

/**
 * Index the authored node-parent relation without changing node identity,
 * parent values, or declaration order. Native adapters decide how to draw the
 * resulting containers; this helper has no layout or edge semantics.
 */
export function planContainmentForest(nodes:readonly VisualNode[]):ContainmentForest{
 const roots:VisualNode[]=[],children=new Map<string,VisualNode[]>(),sourceIndexById=new Map<string,number>();
 nodes.forEach((node,index)=>{
  sourceIndexById.set(node.id,index);
  if(node.parent===undefined)roots.push(node);
  else{
   const siblings=children.get(node.parent)??[];
   siblings.push(node);
   children.set(node.parent,siblings);
  }
 });
 return{roots,childrenByParent:children,sourceIndexById};
}
