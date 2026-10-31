// SPDX-License-Identifier: MIT OR Apache-2.0
/** Focused views remove only the explicit annotation appendix and profile
 * boilerplate. They are native renderer inputs, not interchange exports. */
import {quoteDotProfile,readDotProfile,type DotProfileStatement} from '../../src/interchange/dot/profile-syntax';
import {quoteLiniProfile,readLiniProfile,type LiniProfileNode,type LiniProfileToken} from '../../src/interchange/lini/profile-syntax';
import {focusedAnnotatedMermaidSource} from '../../src/interchange/mermaid/annotated';
import type {InterchangeFormat} from '../../src';

function dotStatement(statement:DotProfileStatement):string {
 const attributes=(items:{name:string;value:string;html?:boolean}[])=>' ['+items.map(a=>quoteDotProfile(a.name)+'='+(a.html?a.value:quoteDotProfile(a.value))).join(', ')+']';
 switch(statement.kind){
  case 'attributes':return statement.target+attributes(statement.attributes)+';';
  case 'assignment':return quoteDotProfile(statement.name)+'='+quoteDotProfile(statement.value)+';';
  case 'node':return quoteDotProfile(statement.id)+attributes(statement.attributes)+';';
  case 'edge':return quoteDotProfile(statement.from)+(statement.fromPort?':'+quoteDotProfile(statement.fromPort):'')+' -> '+quoteDotProfile(statement.to)+(statement.toPort?':'+quoteDotProfile(statement.toPort):'')+attributes(statement.attributes)+';';
  case 'subgraph':return 'subgraph '+quoteDotProfile(statement.id)+' {\n'+statement.statements.map(dotStatement).join('\n')+'\n}';
 }
}
function liniToken(token:LiniProfileToken):string{return token.kind==='string'?quoteLiniProfile(token.value):token.value;}
function liniTokens(tokens:LiniProfileToken[]):string {
 let out='';let previous:LiniProfileToken|undefined;
 for(const token of tokens){
  if(token.kind==='symbol'&&['(',')',','].includes(token.value))out+=token.value;
  else out+=(out&&previous?.value!=='('?' ':'')+liniToken(token);
  previous=token;
 }return out;
}
function liniNode(node:LiniProfileNode):string {
 if(node.type==='link'){
  const property=(name:string)=>node.properties.find(item=>item.name===name)?.value??[];
  const from=property('from').map(token=>token.value).join(''),operator=property('operator').map(token=>token.value).join(''),to=property('to').map(token=>token.value).join(''),label=property('label'),className=property('class').map(token=>token.value).join('');
  if(!from||!to||!['->','-'].includes(operator))throw new Error('Malformed Lini link in annotated profile source');
  return from+' '+operator+' '+to+(label.length?' '+liniTokens(label):'')+(className?' .'+className:'')+';';
 }
 const props=node.properties.length?' { '+node.properties.map(p=>p.name+': '+liniTokens(p.value)+';').join(' ')+' }':'';
 return '|'+node.type+'#'+node.id+'|'+(node.label===undefined?'':' '+quoteLiniProfile(node.label))+props+(node.children.length?' [\n'+node.children.map(liniNode).join('\n')+'\n]':';');
}
export function focusedProfileSource(source:string,format:InterchangeFormat):string {
 if(format==='mermaid')return focusedAnnotatedMermaidSource(source);
 if(format==='dot'){
  const graph=readDotProfile(source,{entities:true});
  const statements=graph.statements.filter(s=>!(s.kind==='subgraph'&&s.id==='cluster_umf_annotations'));
  return 'digraph '+quoteDotProfile(graph.id)+' {\n'+statements.map(dotStatement).join('\n')+'\n}\n';
 }
 if(format==='lini'){
  const roots=readLiniProfile(source);if(roots.length!==1||roots[0].id!=='umf_visual')throw new Error('Unexpected native profile owner for focused view');
  const focused=(node:LiniProfileNode):LiniProfileNode=>{
   const keep=node.id==='comparison-matrix-profile'?new Set(['comparison-matrix','comparison-choice']):node.id==='comparison-quadrant-profile'?new Set(['comparison-quadrant','quadrant-decision']):undefined;
   return {...node,children:node.children.filter(child=>keep?keep.has(child.id):node.id==='metric-bar-group'?child.id!=='metric-categories':true).map(focused)};
  };
  const root=focused({...roots[0],children:roots[0].children.filter(n=>!['umf_profile','umf_annotations','umf_title'].includes(n.id))});
  return liniNode(root)+'\n';
 }
 throw new Error('No focused view implementation for this profile format');
}
