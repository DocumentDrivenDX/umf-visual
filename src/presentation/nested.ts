// SPDX-License-Identifier: MIT OR Apache-2.0
/** Native containment projections for the bounded structure/nested profile. */
import type {Visual,VisualNode} from '../extensions/visual';
import {planContainmentForest} from './containment';
import type {PresentationDiagnostic,PresentationElement,PresentationFailure,PresentationPlan} from './index';

const BASE='/extensions/umf.visual';
const path=(suffix:string)=>BASE+(suffix.startsWith('/')?suffix:'/'+suffix);
const pointer=(value:string)=>value.replace(/~/g,'~0').replace(/\//g,'~1');
const diag=(code:string,suffix:string,message:string):PresentationDiagnostic=>({code,path:path(suffix),message,severity:'error'});
const dot=(value:string)=>'"'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\t/g,'\\t')+'"';
const safe=(prefix:string,index:number)=>prefix+(index+1);
const mermaidChar=(char:string)=>({' ':'#32;','#':'#35;','&':'#38;','"':'#34;','<':'#60;','>':'#62;',';':'#59;','(':'#40;',')':'#41;','[':'#91;',']':'#93;','{':'#123;','}':'#125;','\\':'#92;'} as Record<string,string>)[char]??char;
const mermaidText=(value:string)=>value.replace(/\r/g,'').split('\n').map(line=>Array.from(line,mermaidChar).join('')).join('<br/>');
const caption=(node:VisualNode)=>[node.label,node.detail,node.role?'Role: '+node.role:undefined,node.status?'Status: '+node.status:undefined].filter(Boolean).join('\n');

/** Compile a nested structure into real native containers, with no hierarchy edges. */
export function compileNestedPresentation(visual:Visual,backend:'graphviz'|'mermaid',direction:'LR'|'TB'='TB'):PresentationPlan|PresentationFailure {
 const fail=(code:string,suffix:string,message:string):PresentationFailure=>({ok:false,diagnostics:[diag(code,suffix,message)]});
 if(visual.kind!=='structure'||visual.form!=='nested')return fail('PRESENTATION_NESTED_SCOPE','/form','The nested presentation profile supports only structure/nested.');
 const nodes=visual.nodes??[];
 if(!nodes.length)return fail('PRESENTATION_NESTED_EMPTY','/nodes','A nested structure needs at least one node.');
 if((visual.groups?.length??0)>0)return fail('PRESENTATION_NESTED_GROUPS','/groups','Nested structures with visual groups are outside this native containment profile.');
 if((visual.edges?.length??0)>0)return fail('PRESENTATION_NESTED_EDGES','/edges','Nested structures with semantic edges are outside this native containment profile.');
 if(visual.annotations?.length)return fail('PRESENTATION_NESTED_ANNOTATIONS','/annotations','Free text annotations are not qualified for this containment profile.');
 if(visual.steps?.length)return fail('PRESENTATION_NESTED_STEPS','/steps','Authored steps are not qualified for this containment profile.');
 if(visual.structure!==undefined)return fail('PRESENTATION_NESTED_STRUCTURE_DATA','/structure','Structure-specific payload is outside the nested containment profile.');
 for(const key of ['sequence','state','timeline','comparison','metric'] as const)if(visual[key]!==undefined)return fail('PRESENTATION_NESTED_CROSS_FAMILY',`/${key}`,`The ${key} payload is outside the structure/nested profile.`);
 const visualKeys=new Set(['id','kind','form','title','question','takeaway','audience','source','omissions','annotations','groups','nodes','edges','steps','sequence','structure','state','timeline','comparison','metric','layout']);
 for(const key of Object.keys(visual))if(!visualKeys.has(key))return fail('PRESENTATION_NESTED_UNKNOWN_CONTENT',`/${pointer(key)}`,'Unknown visual content cannot be represented by this bounded native profile.');
 const nodeKeys=new Set(['id','label','detail','role','status','emphasis','group','parent','layer','evidence','shape','ports','icon']);
 for(let i=0;i<nodes.length;i++){
  for(const key of Object.keys(nodes[i]!))if(!nodeKeys.has(key))return fail('PRESENTATION_NESTED_UNKNOWN_CONTENT',`/nodes/${i}/${pointer(key)}`,'Unknown node content cannot be represented by this bounded native profile.');
  for(const key of ['layer','shape','icon','ports','emphasis','group'] as const)if(nodes[i]![key]!==undefined)return fail('PRESENTATION_NESTED_NODE_PROPERTY',`/nodes/${i}/${key}`,`Node ${key} is not represented by this native containment profile.`);
 }
 const layout=visual.layout;
 if(layout&&layout.kind!=='flow')return fail('PRESENTATION_NESTED_LAYOUT','/layout/kind','Only root flow direction is qualified for structure/nested; grid layout is refused because its column count is not honored.');
 if(layout){const layoutKeys=new Set(['kind','direction','order']);for(const key of Object.keys(layout))if(!layoutKeys.has(key))return fail('PRESENTATION_NESTED_LAYOUT',`/layout/${pointer(key)}`,'Unknown layout content cannot be represented by this bounded native profile.');}
 const authoredDirection=layout?.kind==='flow'?layout.direction:undefined;
 const flowDirection=authoredDirection??direction;
 const forest=planContainmentForest(nodes);
 const authoredOrder=layout?.kind==='flow'?layout.order:undefined,rootIds=new Set(forest.roots.map(root=>root.id));
 if(authoredOrder?.some(id=>!rootIds.has(id)))return fail('PRESENTATION_NESTED_LAYOUT_ORDER','/layout/order','This profile scopes authored order to root nodes; descendant order remains in source declaration order.');
 if((authoredOrder?.length??0)>0&&forest.roots.length>1)return fail('PRESENTATION_NESTED_LAYOUT_ORDER','/layout/order','Graphviz and Mermaid do not currently provide a qualified stable native order for multiple root scopes; authored order is refused at this location.');
 const ordered=(items:VisualNode[])=>items;
 const nativeIds=new Map(nodes.map((node,index)=>[node.id,safe('n',index)]));
 const elementMap:PresentationElement[]=[{logicalId:visual.id,sourcePath:path('/id'),nativeId:'visual',kind:'visual'}];
 for(const node of nodes){const i=forest.sourceIndexById.get(node.id)!;elementMap.push({logicalId:node.id,sourcePath:path(`/nodes/${i}/id`),nativeId:nativeIds.get(node.id)!,kind:'node'});}
 const title=visual.title??visual.question;
 const omissions:PresentationPlan['omissions']=[];
 if(visual.title&&visual.question!==visual.title)omissions.push({sourcePath:path('/question'),reason:'The question remains in the unchanged UMF source; the native canvas uses the concise title.'});
 if(visual.takeaway)omissions.push({sourcePath:path('/takeaway'),reason:'The takeaway remains in the unchanged UMF source and is not part of containment geometry.'});
 if(visual.source)omissions.push({sourcePath:path('/source'),reason:'Source provenance remains in the unchanged UMF source.'});
 if(visual.omissions?.length)omissions.push({sourcePath:path('/omissions'),reason:'The authored omission inventory remains in the unchanged UMF source.'});
 if(visual.audience)omissions.push({sourcePath:path('/audience'),reason:'Audience metadata remains in the unchanged UMF source.'});
 for(let i=0;i<nodes.length;i++)if(nodes[i]!.evidence?.length)omissions.push({sourcePath:path(`/nodes/${i}/evidence`),reason:'Evidence locators remain in UMF and are not embedded in container geometry.'});
 if(backend==='graphviz'){
  const lines=['digraph visual {',`  graph [rankdir=${flowDirection}, compound=true, newrank=true, bgcolor="#ffffff", pad="0.4", nodesep="0.4", ranksep="0.6", label=${dot(title)}, labelloc=t, fontsize=20, fontname="Arial"];`,'  node [shape=box, style="rounded,filled", fontname="Arial", fontsize=13, color="#577782", fillcolor="#e8f2f3", fontcolor="#203746", margin="0.16,0.1"];'];
  const emit=(node:VisualNode,indent:string):void=>{
   const id=nativeIds.get(node.id)!;const kids=ordered(forest.childrenByParent.get(node.id)??[]);
   if(kids.length){lines.push(`${indent}subgraph cluster_${id} {`,`  `.repeat(indent.length/2+1)+`graph [id=${dot(id)}, label=${dot(caption(node))}, labelloc=t, color="#668f78", fillcolor="#f2f7f3", style="rounded,filled", fontname="Arial", fontsize=13];`);for(const child of kids)emit(child,indent+'  ');lines.push(indent+'}');}
   else lines.push(`${indent}${id} [id=${dot(id)}, label=${dot(caption(node))}];`);
  };
  for(const root of ordered(forest.roots))emit(root,'  ');lines.push('}');
  return {ok:true,profileId:'umf.visual.presentation/1',backend,nativeFormat:'dot',source:lines.join('\n')+'\n',elementMap,omissions,approximations:[]};
 }
 const lines=['---','title: '+JSON.stringify(title),'---','flowchart '+flowDirection];
 const emit=(node:VisualNode,indent:string):void=>{
  const id=nativeIds.get(node.id)!,kids=ordered(forest.childrenByParent.get(node.id)??[]);
  if(kids.length){lines.push(`${indent}subgraph ${id}["${mermaidText(caption(node))}"]`);for(const child of kids)emit(child,indent+'  ');lines.push(indent+'end');}
  else lines.push(`${indent}${id}["${mermaidText(caption(node))}"]`);
 };
 for(const root of ordered(forest.roots))emit(root,'  ');
 return {ok:true,profileId:'umf.visual.presentation/1',backend,nativeFormat:'mermaid',source:lines.join('\n')+'\n',elementMap,omissions,approximations:[]};
}
