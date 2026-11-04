// SPDX-License-Identifier: MIT OR Apache-2.0
/** Bounded native projections for flat state machines. */
import type {Visual,VisualNode,VisualTransition} from '../extensions/visual';
import type {PresentationDiagnostic,PresentationElement,PresentationFailure,PresentationPlan} from './index';

const BASE='/extensions/umf.visual';
const path=(suffix:string)=>BASE+(suffix.startsWith('/')?suffix:'/'+suffix);
const diag=(code:string,suffix:string,message:string):PresentationDiagnostic=>({code,path:path(suffix),message,severity:'error'});
const ptr=(value:string)=>value.replace(/~/g,'~0').replace(/\//g,'~1');
const safeId=(prefix:string,index:number)=>prefix+(index+1);
const dot=(value:string)=>'"'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\t/g,'\\t')+'"';
const mermaidChar=(char:string)=>({' ':'#32;','#':'#35;','&':'#38;','"':'#34;','<':'#60;','>':'#62;',';':'#59;','(':'#40;',')':'#41;','[':'#91;',']':'#93;','{':'#123;','}':'#125;','\\':'#92;'} as Record<string,string>)[char]??char;
const mermaidText=(value:string)=>Array.from(value,mermaidChar).join('');

/** One visible caption convention shared with the Lini projection. */
export function stateTransitionCaption(transition:VisualTransition):string {
 return [transition.path?`Path: ${transition.path} —`:undefined,transition.event,transition.guard?`[${transition.guard}]`:undefined,transition.action?`/ ${transition.action}`:undefined].filter(Boolean).join(' ');
}

/** Reject state content that this flat state projection cannot yet carry exactly. */
export function validateStateMachineScope(visual:Visual):PresentationDiagnostic[] {
 const errors:PresentationDiagnostic[]=[];
 const add=(code:string,suffix:string,message:string)=>errors.push(diag(code,suffix,message));
 if(visual.kind!=='state'||!['machine','lifecycle'].includes(visual.form)){
  add('PRESENTATION_STATE_SCOPE','/form','The state presentation profile currently supports only state/machine and flat state/lifecycle.');
  return errors;
 }
 if(visual.groups?.length)add('PRESENTATION_STATE_COMPOSITE','/groups','Grouped state scopes are not qualified; this profile renders only flat state nodes.');
 if(visual.annotations?.length)add('PRESENTATION_STATE_ANNOTATION','/annotations','Unanchored free-text annotations are not yet qualified for state/machine.');
 if(visual.steps!==undefined)add('PRESENTATION_STATE_STEPS','/steps','State walkthrough steps are not yet qualified; no step captions are silently dropped.');
 if(visual.layout){
  if(visual.layout.kind!=='flow')add('PRESENTATION_STATE_LAYOUT','/layout/kind','Only flow layout direction is currently supported for flat state/machine.');
  if(visual.layout.kind==='flow'&&visual.layout.order)add('PRESENTATION_STATE_LAYOUT_ORDER','/layout/order','Authored state order is not yet qualified for the current native graph layout; no order constraint is inferred.');
 }
 for(let index=0;index<(visual.nodes??[]).length;index++){
  const node=visual.nodes![index]!;
  for(const key of ['parent','group','layer','role','shape','icon','ports','status','emphasis'] as const)if(node[key]!==undefined){
   const reason=key==='parent'?'Composite/parented states are not yet qualified; this profile renders flat state nodes.':`The ${key} node property is not yet qualified for state/machine and would not be silently dropped.`;
   add('PRESENTATION_STATE_NODE_PROPERTY',`/nodes/${index}/${key}`,reason);
  }
 }
 for(let index=0;index<(visual.state?.transitions??[]).length;index++){
  const transition=visual.state!.transitions[index]!;
  for(const key of ['status','emphasis'] as const)if(transition[key]!==undefined)add('PRESENTATION_STATE_TRANSITION_PROPERTY',`/state/transitions/${index}/${key}`,`The transition ${key} property is not yet qualified for this state profile.`);
 }
 return errors;
}

export function compileStatePresentation(visual:Visual,backend:'graphviz'|'mermaid',direction:'LR'|'TB'):PresentationPlan|PresentationFailure {
 const scopeErrors=validateStateMachineScope(visual);if(scopeErrors.length)return {ok:false,diagnostics:scopeErrors};
 if(backend==='mermaid'){
  const renderedStrings:Array<[string,string]>=[[visual.title??visual.question,visual.title?'/title':'/question']];
  for(let index=0;index<(visual.nodes??[]).length;index++){const node=visual.nodes![index]!;renderedStrings.push([node.label,`/nodes/${index}/label`]);if(node.detail)renderedStrings.push([node.detail,`/nodes/${index}/detail`]);}
  for(let index=0;index<(visual.state?.transitions??[]).length;index++){const transition=visual.state!.transitions[index]!;for(const key of ['event','guard','action'] as const)if(transition[key])renderedStrings.push([transition[key]!,`/state/transitions/${index}/${key}`]);}
  const multiline=renderedStrings.find(([value])=>value.includes('\n'));
  if(multiline)return {ok:false,diagnostics:[diag('PRESENTATION_STATE_MULTILINE',multiline[1],'Mermaid state labels currently do not have a qualified multiline text carrier; no line break is flattened or discarded.')]};
 }
 const nodes=visual.nodes??[],transitions=visual.state!.transitions,finals=new Set(visual.state!.final??[]);
 const nodeIds=new Map(nodes.map((node,index)=>[node.id,safeId('n',index)]));
 // Mermaid stateDiagram has no edge-ID syntax. Its native path is identified by
 // the directed endpoints and exact caption; encode that tuple in the map.
 const transitionIds=new Map(transitions.map((transition,index)=>[transition.id,backend==='graphviz'?safeId('t',index):`${nodeIds.get(transition.from)}->${nodeIds.get(transition.to)}|${encodeURIComponent(stateTransitionCaption(transition))}`]));
 if(backend==='mermaid'){
  const selectors=new Set<string>();
  for(let index=0;index<transitions.length;index++){const transition=transitions[index]!,selector=transitionIds.get(transition.id)!;if(selectors.has(selector))return {ok:false,diagnostics:[diag('PRESENTATION_STATE_AMBIGUOUS_TRANSITION',`/state/transitions/${index}`,'Mermaid stateDiagram has no authored transition-ID carrier; identical endpoint and caption tuples cannot be uniquely mapped to native paths.') ]};selectors.add(selector);}
 }
 const map:PresentationElement[]=[];
 const add=(logicalId:string,sourcePath:string,nativeId:string,kind:PresentationElement['kind'])=>map.push({logicalId,sourcePath:path(sourcePath),nativeId,kind});
 add(visual.id,'','visual','visual');
 for(let index=0;index<nodes.length;index++)add(nodes[index]!.id,`/nodes/${index}/id`,nodeIds.get(nodes[index]!.id)!,'node');
 for(let index=0;index<transitions.length;index++){
  const transition=transitions[index]!,nativeId=transitionIds.get(transition.id)!;
  add(transition.id,`/state/transitions/${index}`,nativeId,'transition');
  if(transition.path)add(transition.id,`/state/transitions/${index}/path`,nativeId,'state-path-caption');
 }
 const initialMarker=backend==='graphviz'?'state_initial_marker':'[*]';
 add(visual.state!.initial,'/state/initial',initialMarker,'state-marker');
 for(let index=0;index<(visual.state!.final??[]).length;index++){
  const finalId=visual.state!.final![index]!;
  add(finalId,`/state/final/${index}`,backend==='graphviz'?nodeIds.get(finalId)!:'[*]','state-marker');
 }
 const omissions:{sourcePath:string;reason:string}[]=[];
 if(visual.title&&visual.question!==visual.title)omissions.push({sourcePath:path('/question'),reason:'The question is distinct from the concise display title and remains in the original UMF document.'});
 if(visual.takeaway)omissions.push({sourcePath:path('/takeaway'),reason:'Takeaway remains in the definition source; the presentation image uses the concise display title only.'});
 if(visual.source)omissions.push({sourcePath:path('/source'),reason:'Source provenance remains in the original UMF document and is not embedded in diagram geometry.'});
 for(let index=0;index<(visual.omissions??[]).length;index++)omissions.push({sourcePath:path('/omissions/'+index),reason:'Authored omission inventory is retained in the source document, not drawn.'});
 for(let index=0;index<nodes.length;index++)if(nodes[index]!.evidence)omissions.push({sourcePath:path('/nodes/'+index+'/evidence'),reason:'Evidence locators remain in UMF and are not embedded in state geometry.'});
 if(visual.audience)omissions.push({sourcePath:path('/audience'),reason:'Audience metadata remains in UMF but is not drawn in the state diagram.'});
 const approximations:PresentationPlan['approximations']=[];
 if(backend==='mermaid'){
  approximations.push({sourcePath:path('/state/transitions'),requested:'Authored transition identity',representation:'Mermaid stateDiagram has no authored transition-ID syntax. Each nativeId is an encoded directed-endpoint + exact-caption locator, not a user-assigned SVG ID; identical endpoint/caption tuples are refused because they cannot be uniquely bound.'});
  for(const marker of map.filter(item=>item.kind==='state-marker'))approximations.push({sourcePath:marker.sourcePath,requested:'Authored state marker identity',representation:'Mermaid represents initial/final markers with the [*] pseudo-state, which has no unique SVG ID. This map row is resolved by its exact declaration source path and link endpoints.'});
 }

 const title=visual.title??visual.question;direction=visual.layout?.kind==='flow'?(visual.layout.direction??direction):direction;
 if(backend==='graphviz'){
  const lines=[
   'digraph visual {',
   `  graph [rankdir=${direction}, bgcolor="#ffffff", pad="0.45", nodesep="0.55", ranksep="0.78", label=${dot(title)}, labelloc=t, fontsize=20, fontname="Arial", splines=true];`,
   '  node [shape=box, style="rounded,filled", fontname="Arial", fontsize=16, color="#577782", fillcolor="#e8f2f3", fontcolor="#203746", penwidth=1.6, margin="0.20,0.13"];',
   '  edge [fontname="Arial", fontsize=13, color="#587582", fontcolor="#203746", arrowsize=0.8];',
  ];
  for(let index=0;index<nodes.length;index++){
   const node=nodes[index]!,nativeId=nodeIds.get(node.id)!,label=[node.label,node.detail].filter(Boolean).join('\n');
   lines.push(`  ${nativeId} [id=${dot(nativeId)}, label=${dot(label)}${finals.has(node.id)?', peripheries=2':''}];`);
  }
  lines.push(`  state_initial_marker [id=${dot('state_initial_marker')}, shape=point, label="", width=0.13, color="#d27b54", fillcolor="#d27b54"];`);
  lines.push(`  state_initial_marker -> ${nodeIds.get(visual.state!.initial)} [id="state_initial_link", color="#d27b54", penwidth=1.6, arrowsize=0.8];`);
  for(const transition of transitions){
   lines.push(`  ${nodeIds.get(transition.from)} -> ${nodeIds.get(transition.to)} [id=${dot(transitionIds.get(transition.id)!)}, label=${dot(stateTransitionCaption(transition))}];`);
  }
  lines.push('}');
  return {ok:true,profileId:'umf.visual.presentation/1',backend,nativeFormat:'dot',source:lines.join('\n')+'\n',elementMap:map,omissions,approximations};
 }
 const lines=['---','title: '+JSON.stringify(title),'---','stateDiagram-v2',`direction ${direction}`];
 for(const node of nodes){
  const id=nodeIds.get(node.id)!;
  lines.push(`state "${mermaidText(node.label)}" as ${id}`);
  if(node.detail)lines.push(`  ${id} : ${mermaidText(node.detail)}`);
 }
 lines.push(`[*] --> ${nodeIds.get(visual.state!.initial)}`);
 for(const transition of transitions){
  lines.push(`${nodeIds.get(transition.from)} --> ${nodeIds.get(transition.to)}: ${mermaidText(stateTransitionCaption(transition))}`);
 }
 for(const finalId of visual.state!.final??[])lines.push(`${nodeIds.get(finalId)} --> [*]`);
 return {ok:true,profileId:'umf.visual.presentation/1',backend,nativeFormat:'mermaid',source:lines.join('\n')+'\n',elementMap:map,omissions,approximations};
}
