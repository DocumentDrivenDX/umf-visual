// SPDX-License-Identifier: MIT OR Apache-2.0
/** Native Lini adapter for source-authored node containment. */
import type {Visual,VisualNode} from '../extensions/visual';
import {quoteLiniProfile} from '../interchange/lini/profile-syntax';
import {planContainmentForest} from './containment';
import type {PresentationApproximation,PresentationElement,PresentationFailure,PresentationOmission,PresentationPlan} from './index';

const BASE='/extensions/umf.visual';
const pointer=(value:string)=>value.replace(/~/g,'~0').replace(/\//g,'~1');
const at=(part:string)=>BASE+(part.startsWith('/')?part:'/'+part);
const safeId=(index:number)=>'n'+(index+1);
const failure=(code:string,path:string,message:string):PresentationFailure=>({ok:false,diagnostics:[{code,path,message,severity:'error'}]});
const quote=(text:string,path:string)=>{try{return quoteLiniProfile(text);}catch(reason){throw Object.assign(new Error(reason instanceof Error?reason.message:'Lini cannot encode this text.'),{sourcePath:path});}};

function orderRoots(roots:VisualNode[],order?:string[]):VisualNode[]{
 if(!order)return roots;
 const rank=new Map(order.map((id,index)=>[id,index]));
 return roots.map((node,index)=>({node,index})).sort((a,b)=>(rank.get(a.node.id)??Number.MAX_SAFE_INTEGER)-(rank.get(b.node.id)??Number.MAX_SAFE_INTEGER)||a.index-b.index).map(row=>row.node);
}

/** Render node.parent as native nested containers. Parent pointers never become edges. */
export function compileLiniNestedPresentation(visual:Visual,direction:'LR'|'TB'='LR'):PresentationPlan|PresentationFailure{
 const nodes=visual.nodes??[],groups=visual.groups??[],edges=visual.edges??[];
 const visualKeys=new Set(['id','kind','form','title','question','takeaway','audience','source','omissions','annotations','groups','nodes','edges','steps','sequence','structure','state','timeline','comparison','metric','layout']);
 for(const key of Object.keys(visual))if(!visualKeys.has(key))return failure('PRESENTATION_LINI_NESTED_SCOPE',at('/'+pointer(key)),'Unknown visual content cannot be represented by the native nested profile.');
 if(groups.length)return failure('PRESENTATION_LINI_NESTED_SCOPE',at('/groups'),'Nested structures use node.parent containment; source groups are not part of this native profile.');
 if(edges.length)return failure('PRESENTATION_LINI_NESTED_SCOPE',at('/edges'),'Nested structures preserve parent containment; authored graph edges are outside this native profile.');
 if(visual.annotations?.length)return failure('PRESENTATION_LINI_NESTED_SCOPE',at('/annotations'),'Free-text annotations are outside this native nested profile.');
 if(visual.steps?.length)return failure('PRESENTATION_LINI_NESTED_SCOPE',at('/steps'),'Authored steps are outside this native nested profile.');
 for(const key of ['sequence','structure','state','timeline','comparison','metric'] as const)if(visual[key]!==undefined)return failure('PRESENTATION_LINI_NESTED_SCOPE',at('/'+key),`The ${key} payload is outside this native nested profile.`);
 if(!nodes.length)return failure('PRESENTATION_LINI_NESTED_INVALID',at('/nodes'),'Nested structures require at least one source node.');
 if(visual.layout&&visual.layout.kind!=='flow')return failure('PRESENTATION_LINI_NESTED_LAYOUT',at('/layout'),'Lini nested containment supports authored flow root ordering; other valid root layout kinds are not reinterpreted.');
 const rootLayout=visual.layout;
 for(const[index,node]of nodes.entries()){
  const nodeKeys=new Set(['id','label','detail','role','status','emphasis','group','parent','layer','evidence','shape','ports','icon']);
  for(const key of Object.keys(node))if(!nodeKeys.has(key))return failure('PRESENTATION_LINI_NESTED_SCOPE',at(`/nodes/${index}/${pointer(key)}`),'Unknown node content cannot be represented by the native nested profile.');
  for(const field of ['group','layer','evidence','icon','ports','shape','emphasis'] as const)if(node[field]!==undefined)return failure('PRESENTATION_LINI_NESTED_SCOPE',at(`/nodes/${index}/${field}`),`Nested containment has no qualified native mapping for node ${field}.`);
 }
 if(visual.layout){const layoutKeys=new Set(['kind','direction','order']);for(const key of Object.keys(visual.layout))if(!layoutKeys.has(key))return failure('PRESENTATION_LINI_NESTED_SCOPE',at(`/layout/${pointer(key)}`),'Unknown layout content cannot be represented by the native nested profile.');}
 const forest=planContainmentForest(nodes),nativeId=new Map(nodes.map((node,index)=>[node.id,safeId(index)]));
 const elements:PresentationElement[]=[],omissions:PresentationOmission[]=[],approximations:PresentationApproximation[]=[];
 const add=(logicalId:string,sourcePath:string,id:string,kind:'node'|'visual'='node')=>elements.push({logicalId,sourcePath,nativeId:id,kind});
 const omit=(sourcePath:string,reason:string)=>omissions.push({sourcePath,reason});
 const approx=(sourcePath:string,requested:string,representation:string)=>approximations.push({sourcePath,requested,representation});
 const renderMetadata=(node:VisualNode,index:number,id:string):string[]=>{
  const lines:string[]=[],sideBySide:string[]=[];
  for(const field of ['detail','role','status'] as const){
   const value=node[field];if(value===undefined)continue;
   const sourcePath=at(`/nodes/${index}/${field}`),cell=id+'-'+field;
   approx(sourcePath,`Node ${field}`,`Exact authored text appears in the visible native ${cell} metadata block within node ${id}.`);
   const text=field==='role'?'Role: '+value:field==='status'?'Status: '+value:value;
   const statement=`|block#${cell}| ${quote(text,sourcePath)} { font-size: 12; color: #40545f; fill: none; stroke: none; padding: 2; }`;
   if(field==='detail')lines.push(statement);else sideBySide.push(statement);
  }
  if(sideBySide.length)lines.push(`|group#${id}-metadata| "" { layout: flow; direction: row; gap: 16; padding: 0; fill: none; stroke: none; stroke-width: 0; } [\n${sideBySide.map(line=>'  '+line).join('\n')}\n]`);
  return lines;
 };
 const rootDirection=rootLayout?.direction==='TB'||(!rootLayout&&direction==='TB')?'column':'row';
 const crossDirection=rootDirection==='row'?'column':'row';
 const encode=(node:VisualNode,depth=0):string=>{
  const index=forest.sourceIndexById.get(node.id)!;const id=nativeId.get(node.id)!;
  add(node.id,at(`/nodes/${index}/id`),id);
  approx(at(`/nodes/${index}/label`),'Node label',`The exact authored label is the visible title of native node/container ${id}.`);
  if(node.parent!==undefined)approx(at(`/nodes/${index}/parent`),'Node parent containment',`Native container ${nativeId.get(node.parent)} directly contains ${id}; no connector or semantic edge is added.`);
  const metadata=renderMetadata(node,index,id);
  const children=forest.childrenByParent.get(node.id)??[];
  if(children.length){
   const childDirection=depth%2===0?rootDirection:crossDirection;
   const childLayout=`|group#${id}-children| "" { layout: flow; direction: ${childDirection}; gap: 24; padding: 4; fill: none; stroke: none; stroke-width: 0; } [\n${children.map(child=>encode(child,depth+1)).map(line=>'  '+line.split('\n').join('\n  ')).join('\n')}\n]`;
   const body=[...metadata,childLayout];
   return`|group#${id}| ${quote(node.label,at(`/nodes/${index}/label`))} { layout: flow; direction: column; gap: 18; padding: 20; fill: #f6f8f8; stroke: #587985; stroke-width: 1.5; color: #243b45; } [\n${body.map(line=>'  '+line.split('\n').join('\n  ')).join('\n')}\n]`;
  }
  const label=quote(node.label,at(`/nodes/${index}/label`));
  return`|box#${id}| ${label} { fill: #edf3f4; stroke: #587985; stroke-width: 1.5; color: #243b45; }${metadata.length?` [\n${metadata.map(line=>'  '+line).join('\n')}\n]`:''}`;
 };
 try{
  for(const[index,node]of nodes.entries()){
   // The parent/root and every leaf are represented by their own native container/node carrier.
   if(node.label===undefined)return failure('PRESENTATION_LINI_NESTED_INVALID',at(`/nodes/${index}/label`),'Nested native nodes require a visible label.');
  }
  const roots=orderRoots(forest.roots,rootLayout?.order);
  const title=visual.title;
  elements.push({logicalId:visual.id,sourcePath:at('/id'),nativeId:'nested-scene',kind:'visual'});
  const parts:string[]=[];
  if(title){elements.push({logicalId:visual.id,sourcePath:at('/title'),nativeId:'nested-title',kind:'visual'});parts.push(`|block#nested-title| ${quote(title,at('/title'))} { font-size: 20; font-weight: bold; color: #173f59; fill: none; stroke: none; }`);}
  if(visual.question){elements.push({logicalId:visual.id,sourcePath:at('/question'),nativeId:'nested-question',kind:'visual'});parts.push(`|block#nested-question| ${quote(visual.question,at('/question'))} { font-size: 14; color: #304652; fill: none; stroke: none; }`);}
  parts.push(`|group#nested-roots| "" { layout: flow; direction: ${rootDirection}; gap: 24; padding: 8; fill: none; stroke: none; stroke-width: 0; } [\n${roots.map(encode).map(line=>'  '+line.split('\n').join('\n  ')).join('\n')}\n]`);
  const source=[`{ font-family: Arial; --lini-font-family: Arial;\n  .lini-text { font-family: Arial; }\n  .lini-block { font-family: Arial; }\n}`,`|group#nested-scene| "" { layout: flow; direction: column; gap: 24; padding: 24; fill: none; stroke: none; stroke-width: 0; } [`,...parts.map(part=>'  '+part.split('\n').join('\n  ')),' ]'].join('\n')+'\n';
  const layoutPolicy='Native parent nodes are containers. Child lists alternate the caller-selected axis with its cross-axis by nesting level to fit the frame; source order is retained at every level. These are nested bounds, not edges or calibrated distances.';
  if(!rootLayout)approx(at('/form'),'Nested structure with source parent relationships',layoutPolicy+' Direct roots follow source order.');
  else approx(at('/layout'),'Nested structure with authored root layout',layoutPolicy+' Authored root order and LR/TB direction govern the first level.');
  if(visual.takeaway)omit(at('/takeaway'),'Takeaway remains in the authored document and is not drawn in this native nested view.');
  if(visual.source)omit(at('/source'),'Source provenance remains in UMF and is not embedded in native geometry.');
  if(visual.omissions)for(const[index]of visual.omissions.entries())omit(at(`/omissions/${index}`),'Authored omission inventory remains in the source document.');
  return{ok:true,profileId:'umf.visual.presentation/1',backend:'lini',nativeFormat:'lini',source,elementMap:elements,omissions,approximations};
 }catch(reason){const path=reason&&typeof reason==='object'&&'sourcePath'in reason&&typeof reason.sourcePath==='string'?reason.sourcePath:at('/nodes');return failure('PRESENTATION_LINI_TEXT',path,reason instanceof Error?reason.message:'Lini could not encode nested node content.');}
}
