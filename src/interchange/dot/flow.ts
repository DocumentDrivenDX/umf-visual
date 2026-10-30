// SPDX-License-Identifier: MIT OR Apache-2.0
/** Explicit, bounded DOT mapping for the UMF flow family. */
import type {Visual} from '../../extensions/visual';
import {VISUAL_PATH, identityMapping, interchangeDiagnostic} from '../shared';
import type {IdentityMapping, InterchangeDiagnostic} from '../types';
import {quoteDotProfile, type DotProfileAttribute, type DotProfileGraph, type DotProfileStatement} from './profile-syntax';

export type FlowForm='network'|'pipeline'|'zoned'|'lanes';
export interface DotFlowLocator{id:string;slot:string;}
export interface DotFlowCoverage{path:string;aspect:'value'|'presence'|'order'|'members'|'identity';representation:'native-concept';native:DotFlowLocator[];}
export interface DotFlowSerializeResult{statements:string[];identityMap:IdentityMapping[];coverage:DotFlowCoverage[];diagnostics:InterchangeDiagnostic[];}
export interface DotFlowParseResult extends DotFlowSerializeResult{visual?:Pick<Visual,'nodes'|'edges'|'groups'>;}

const nodePrefix='umf_flow_node_',edgePrefix='umf_flow_edge_',groupPrefix='cluster_umf_flow_group_',laneAnchorPrefix='umf_flow_lane_anchor_',laneRankPrefix='umf_flow_lane_rank_',tierRankPrefix='umf_flow_tier_rank_';
const forms:readonly FlowForm[]=['network','pipeline','zoned','lanes'];
const roles=['zone','boundary','lane','tier','region'] as const;
const p=(suffix:string)=>VISUAL_PATH+suffix;
const pointerSegment=(value:string)=>value.replace(/~/g,'~0').replace(/\//g,'~1');
const pointerParts=(path:string)=>path.split('/').slice(1).map(part=>part.replace(/~1/g,'/').replace(/~0/g,'~'));
const pointer=(parts:string[])=>'/'+parts.map(pointerSegment).join('/');
const hex=(value:string)=>Array.from(new TextEncoder().encode(value),byte=>byte.toString(16).padStart(2,'0')).join('');
function nativeId(prefix:string,id:string):string{return prefix+hex(id);}
function sourceId(prefix:string,value:string):string|undefined{
 if(!value.startsWith(prefix))return;
 const encoded=value.slice(prefix.length);if(!encoded||encoded.length%2||!/^[0-9a-f]+$/.test(encoded))return;
 try{const decoded=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(encoded.match(/../g)!,part=>parseInt(part,16)));return nativeId(prefix,decoded)===value?decoded:undefined;}catch{return;}
}
function diag(code:string,path:string,message:string,severity:'warning'|'error'='error',loss=false):InterchangeDiagnostic{return interchangeDiagnostic(code,path,message,{severity,loss});}
function quote(value:string):string{return quoteDotProfile(value);}
function attr(name:string,value:string):string{return name+'='+quote(value);}
function attrs(target:'graph'|'node'|'edge',values:readonly [string,string][]):string{return target+' ['+values.map(([name,value])=>attr(name,value)).join(', ')+'];';}
function addCoverage(rows:DotFlowCoverage[],path:string,aspect:DotFlowCoverage['aspect'],id:string,slot:string):void{rows.push({path,aspect,representation:'native-concept',native:[{id,slot}]});}
function indexPath(path:string,collection:'nodes'|'edges'|'groups'):number|undefined{
 const parts=pointerParts(path),wanted=['extensions','umf.visual',collection];
 if(parts.length!==4||wanted.some((part,index)=>parts[index]!==part)||!/^(0|[1-9][0-9]*)$/.test(parts[3]!))return;
 const index=Number(parts[3]);return Number.isSafeInteger(index)?index:undefined;
}
function attrMap(list:DotProfileAttribute[]):Map<string,string>{return new Map(list.map(item=>[item.name,item.value]));}
function exactly(attrs:DotProfileAttribute[],allowed:readonly string[]):boolean{return attrs.every(item=>allowed.includes(item.name))&&new Set(attrs.map(item=>item.name)).size===attrs.length;}
function one(attrs:DotProfileAttribute[],name:string):string|undefined{const found=attrs.filter(item=>item.name===name);return found.length===1?found[0]!.value:undefined;}
function visibleGroupLabel(role:string,tier:number|undefined,label:string,detail?:string):string{
 return ['Role: '+role,'Tier: '+(tier===undefined?'—':String(tier)),'Label: '+JSON.stringify(label),...(detail===undefined?[]:['Detail: '+JSON.stringify(detail)])].join('\n');
}
function visibleEdgeLabel(edge:any):string{
 const rows:string[]=[];if(edge.kind!==undefined)rows.push('Kind: '+edge.kind);if(edge.label!==undefined)rows.push('Label: '+JSON.stringify(edge.label));if(edge.why!==undefined)rows.push('Why: '+JSON.stringify(edge.why));return rows.join('\n');
}
function readVisibleFields(text:string,allowed:readonly string[]):Record<string,string>{
 const result:Record<string,string>={};if(text==='')return result;for(const row of text.split('\n')){const sep=row.indexOf(': ');if(sep<0)throw new Error('Visible flow field is malformed.');const key=row.slice(0,sep),value=row.slice(sep+2);if(!allowed.includes(key)||Object.hasOwn(result,key))throw new Error('Visible flow field is unknown or repeated.');result[key]=value;}return result;
}
function readVisibleEdgeLabel(text:string):{kind?:string;label?:string;why?:string}{
 const fields=readVisibleFields(text,['Kind','Label','Why']),result:{kind?:string;label?:string;why?:string}={};if(fields.Kind!==undefined)result.kind=fields.Kind;for(const [visible,key]of [['Label','label'],['Why','why']] as const)if(fields[visible]!==undefined){try{const value=JSON.parse(fields[visible]!);if(typeof value!=='string')throw new Error();result[key]=value;}catch{throw new Error('Visible flow '+visible+' must be a readable JSON string.');}}return result;
}
function validate(visual:Visual):{form?:FlowForm;diagnostics:InterchangeDiagnostic[]} {
 const value=visual as any,diagnostics:InterchangeDiagnostic[]=[];
 if(value.kind!=='flow'||!forms.includes(value.form))diagnostics.push(diag('DOT_FLOW_FORM',p('/form'),'DOT flow profile accepts only flow/network, flow/pipeline, flow/zoned, or flow/lanes.'));
 const form=forms.includes(value.form)?value.form as FlowForm:undefined;
 if(Object.hasOwn(value,'structure')||Object.hasOwn(value,'sequence')||Object.hasOwn(value,'state')||Object.hasOwn(value,'timeline')||Object.hasOwn(value,'comparison')||Object.hasOwn(value,'metric'))diagnostics.push(diag('DOT_FLOW_BLOCK',p(''),'Flow projection accepts only groups, nodes, and edges.'));
 const nodes=Array.isArray(value.nodes)?value.nodes:[],edges=Array.isArray(value.edges)?value.edges:[],groups=Array.isArray(value.groups)?value.groups:[];
 if(!nodes.length)diagnostics.push(diag('DOT_FLOW_NODES',p('/nodes'),'Flow visuals require at least one node.'));
 if(nodes.length>500||edges.length>10_000||groups.length>500)diagnostics.push(diag('DOT_FLOW_SIZE',p(''),'Flow profile exceeds its bounded native input size.'));
 const ids=new Set<string>();
 const declare=(id:unknown,path:string)=>{if(typeof id!=='string'||!id||ids.has(id))diagnostics.push(diag('DOT_FLOW_ID',path,'Flow node, edge, and group IDs must be nonempty and globally unique.'));else ids.add(id);};
 for(const [i,node]of nodes.entries()){
  declare(node?.id,p('/nodes/'+i+'/id'));
  if(typeof node?.label!=='string')diagnostics.push(diag('DOT_FLOW_LABEL',p('/nodes/'+i+'/label'),'Every flow node requires an exact visible label.'));
  if(node?.parent!==undefined)diagnostics.push(diag('DOT_FLOW_PARENT',p('/nodes/'+i+'/parent'),'Flow nodes do not have structural parent containment.'));
  if(node?.layer!==undefined)diagnostics.push(diag('DOT_FLOW_LAYER',p('/nodes/'+i+'/layer'),'Flow nodes do not have structure layer membership.'));
  if(node?.group!==undefined&&!groups.some((group:any)=>group?.id===node.group))diagnostics.push(diag('DOT_FLOW_GROUP_REF',p('/nodes/'+i+'/group'),'Node group must identify a declared flow group.'));
 }
 for(const [i,edge]of edges.entries()){
  declare(edge?.id,p('/edges/'+i+'/id'));
  if(typeof edge?.from!=='string'||!nodes.some((node:any)=>node?.id===edge.from)||typeof edge?.to!=='string'||!nodes.some((node:any)=>node?.id===edge.to))diagnostics.push(diag('DOT_FLOW_ENDPOINT',p('/edges/'+i),'Every flow edge endpoint must identify a declared node.'));
  if(edge?.kind!==undefined&&!['action','data','control','return'].includes(edge.kind))diagnostics.push(diag('DOT_FLOW_EDGE_KIND',p('/edges/'+i+'/kind'),'Edge kind is outside the visual vocabulary.'));
 }
 const groupById=new Map<string,any>();
 for(const [i,group]of groups.entries()){
  declare(group?.id,p('/groups/'+i+'/id'));if(typeof group?.id==='string')groupById.set(group.id,group);
  if(typeof group?.label!=='string'||typeof group?.role!=='string'||!roles.includes(group.role))diagnostics.push(diag('DOT_FLOW_GROUP',p('/groups/'+i),'A flow group requires a visible label and a qualified flow role.'));
  if(group?.tier!==undefined&&(!Number.isSafeInteger(group.tier)||group.tier<1))diagnostics.push(diag('DOT_FLOW_TIER',p('/groups/'+i+'/tier'),'Group tier is a positive safe integer.'));
  if(group?.parent!==undefined&&typeof group.parent!=='string')diagnostics.push(diag('DOT_FLOW_PARENT',p('/groups/'+i+'/parent'),'Group parent must be a group ID.'));
 }
 for(const [i,group]of groups.entries())if(group?.parent!==undefined&&!groupById.has(group.parent))diagnostics.push(diag('DOT_FLOW_PARENT',p('/groups/'+i+'/parent'),'Group parent must identify a declared group.'));
 for(const [id]of groupById){const seen=new Set<string>([id]);let next=groupById.get(id)?.parent;while(next!==undefined){if(seen.has(next)){diagnostics.push(diag('DOT_FLOW_CYCLE',p('/groups'),'Flow group parent links contain a cycle.'));break;}seen.add(next);next=groupById.get(next)?.parent;}}
 if(form==='lanes'&&groups.some((group:any)=>group.role!=='lane'))diagnostics.push(diag('DOT_FLOW_LANES_ROLE',p('/groups'),'Every group in the lanes form must have role lane.'));
 if(form==='lanes'&&groups.some((group:any)=>group.parent!==undefined))diagnostics.push(diag('DOT_FLOW_LANE_NESTING',p('/groups'),'Nested lanes are outside this native layout subset.'));
 if(form==='zoned'){
  const byId=new Map<string,any>(groups.map((group:any)=>[group.id,group]));
  for(const [i,node]of nodes.entries()){
   let current=node?.group as string|undefined,root:any,seen=new Set<string>();
   while(current&&byId.has(current)&&!seen.has(current)){seen.add(current);const group=byId.get(current);if(group?.parent===undefined){root=group;break;}current=group.parent;}
   if(!root||!Number.isSafeInteger(root.tier)||root.tier<1)diagnostics.push(diag('DOT_FLOW_ZONED_TIER',p('/nodes/'+i+'/group'),'Every zoned node must belong to a root group with an explicit positive tier.'));
  }
 }
 if((form==='zoned'||form==='lanes')&&groups.some((group:any)=>!nodes.some((node:any)=>{let current=node.group;const seen=new Set<string>();while(current&&!seen.has(current)){if(current===group.id)return true;seen.add(current);current=groupById.get(current)?.parent;}return false;})))diagnostics.push(diag('DOT_FLOW_EMPTY_GROUP',p('/groups'),'Each ordered zone/lane group needs at least one descendant node for a native order constraint.'));
 return{form,diagnostics};
}

interface FlowNode {id:string;label:string;detail?:string;index:number;native:string;group?:string;}
interface FlowEdge {id:string;from:string;to:string;label?:string;why?:string;kind?:'action'|'data'|'control'|'return';index:number;native:string;}
interface FlowGroup {id:string;label:string;detail?:string;role:typeof roles[number];tier?:number;parent?:string;index:number;native:string;children:string[];nodeIds:string[];}

/** Serialize only flow meaning represented by native graph structure and visible labels. */
export function serializeDotFlow(visual:Visual):DotFlowSerializeResult{
 const checked=validate(visual),diagnostics=checked.diagnostics,coverage:DotFlowCoverage[]=[],identityMap:IdentityMapping[]=[];
 if(!checked.form||diagnostics.some(item=>item.severity==='error'))return{statements:[],identityMap,coverage,diagnostics};
 const value=visual as any,form=checked.form,nodes=value.nodes as any[],edges=(value.edges??[]) as any[],groups=(value.groups??[]) as any[],nodeIndex=new Map(nodes.map((node,index)=>[node.id,index])),groupIndex=new Map(groups.map((group,index)=>[group.id,index]));
 for(const field of ['question','takeaway','audience','source','omissions','steps'])if(Object.hasOwn(value,field))diagnostics.push(diag('DOT_FLOW_ANNOTATION_REQUIRED',p('/'+field),'This application or provenance field requires the readable annotation carrier.','warning',true));
 for(const [i,node]of nodes.entries())for(const field of ['role','status','emphasis','evidence'])if(Object.hasOwn(node,field))diagnostics.push(diag('DOT_FLOW_ANNOTATION_REQUIRED',p('/nodes/'+i+'/'+field),'This application or provenance field requires the readable annotation carrier.','warning',true));
 for(const [i,edge]of edges.entries())for(const field of ['status','emphasis','evidence'])if(Object.hasOwn(edge,field))diagnostics.push(diag('DOT_FLOW_ANNOTATION_REQUIRED',p('/edges/'+i+'/'+field),'This application or provenance field requires the readable annotation carrier.','warning',true));
 for(const [i,group]of groups.entries())for(const field of ['status','emphasis'])if(Object.hasOwn(group,field))diagnostics.push(diag('DOT_FLOW_ANNOTATION_REQUIRED',p('/groups/'+i+'/'+field),'This application or provenance field requires the readable annotation carrier.','warning',true));
 const graphValues:[string,string][]=[['umf_kind','flow'],['umf_form',form],['umf_profile','umf.visual.dot.annotated/1'],['umf_has_groups',String(Object.hasOwn(value,'groups'))],['umf_has_edges',String(Object.hasOwn(value,'edges'))],['rankdir',form==='pipeline'||form==='zoned'?'LR':'TB']];if(form==='zoned')graphValues.push(['newrank','true']);
 const statements:string[]=[attrs('graph',graphValues)];
 const childGroups=new Map<string|undefined,any[]>();for(const group of groups){const parent=group.parent as string|undefined;childGroups.set(parent,[...(childGroups.get(parent)??[]),group]);}
 const nodesByGroup=new Map<string|undefined,any[]>();for(const node of nodes){const group=node.group as string|undefined;nodesByGroup.set(group,[...(nodesByGroup.get(group)??[]),node]);}
 const emitNode=(node:any,index:number,indent:string):string=>{
  const native=nativeId(nodePrefix,node.id),path=p('/nodes/'+index),values:[string,string][]=[['label',node.label],['umf_path',path],['umf_id',node.id]];
  if(node.detail!==undefined)values.push(['xlabel',node.detail]);
  identityMap.push(identityMapping('node',native,node.id,path));addCoverage(coverage,path+'/id','identity',native,'node-id');addCoverage(coverage,path+'/label','value',native,'label');addCoverage(coverage,path+'/detail',node.detail===undefined?'presence':'value',native,node.detail===undefined?'xlabel-absent':'xlabel');
  if(node.group!==undefined)addCoverage(coverage,path+'/group','value',nativeId(groupPrefix,node.group),'cluster-membership');else addCoverage(coverage,path+'/group','presence',native,'root-node');
  return indent+quote(native)+' ['+values.map(([name,value])=>attr(name,value)).join(', ')+'];';
 };
 const emitGroup=(group:any,depth:number):void=>{
  const index=groupIndex.get(group.id)!,native=nativeId(groupPrefix,group.id),path=p('/groups/'+index),values:[string,string][]=[['label',visibleGroupLabel(group.role,group.tier,group.label,group.detail)],['umf_path',path],['umf_id',group.id],['umf_role',group.role]];
  if(group.tier!==undefined)values.push(['umf_tier',String(group.tier)]);
  statements.push('  '.repeat(depth)+'subgraph '+quote(native)+' {','  '.repeat(depth+1)+attrs('graph',values));
  identityMap.push(identityMapping('group',native,group.id,path));addCoverage(coverage,path+'/id','identity',native,'cluster-id');addCoverage(coverage,path+'/role','value',native,'cluster-role');addCoverage(coverage,path+'/label','value',native,'visible-cluster-label');addCoverage(coverage,path+'/detail',group.detail===undefined?'presence':'value',native,group.detail===undefined?'detail-absent':'visible-cluster-label');addCoverage(coverage,path+'/tier',group.tier===undefined?'presence':'value',native,group.tier===undefined?'tier-absent':'visible-role-marker');
  if(group.parent!==undefined)addCoverage(coverage,path+'/parent','value',nativeId(groupPrefix,group.parent),'nested-cluster');else addCoverage(coverage,path+'/parent','presence',native,'root-cluster');
  for(const node of nodesByGroup.get(group.id)??[])statements.push(emitNode(node,nodeIndex.get(node.id)!, '  '.repeat(depth+1)));
  for(const child of childGroups.get(group.id)??[])emitGroup(child,depth+1);
  if(form==='lanes'){
   const anchor=nativeId(laneAnchorPrefix,group.id),members=nodes.filter(node=>node.group===group.id);
   statements.push('  '.repeat(depth+1)+quote(anchor)+' [label="", style="invis", shape="point", width="0", height="0", umf_layout="lane-anchor", umf_parent='+quote(group.id)+'];');
   const rankId=laneRankPrefix+hex(group.id);statements.push('  '.repeat(depth+1)+'subgraph '+quote(rankId)+' {', '  '.repeat(depth+2)+attrs('graph',[['rank','same'],['umf_layout','lane-members'],['umf_parent',group.id]]));
   statements.push('  '.repeat(depth+2)+quote(anchor)+';',...members.map(node=>'  '.repeat(depth+2)+quote(nativeId(nodePrefix,node.id))+';'),'  '.repeat(depth+1)+'}');
  }
  statements.push('  '.repeat(depth)+'}');
 };
 for(const node of nodesByGroup.get(undefined)??[])statements.push(emitNode(node,nodeIndex.get(node.id)!,''));
 for(const group of childGroups.get(undefined)??[])emitGroup(group,0);
 for(const [index,edge]of edges.entries()){
  const from=nativeId(nodePrefix,edge.from),to=nativeId(nodePrefix,edge.to),native=nativeId(edgePrefix,edge.id),path=p('/edges/'+index),values:[string,string][]=[['umf_path',path],['umf_id',edge.id]];
  const visible=visibleEdgeLabel(edge);if(visible!=='')values.push(['label',visible]);if(edge.kind!==undefined)values.push(['umf_kind',edge.kind]);
  values.push(['id',native]);statements.push(quote(from)+' -> '+quote(to)+' ['+values.map(([name,value])=>attr(name,value)).join(', ')+'];');
  identityMap.push(identityMapping('edge',native,edge.id,path));addCoverage(coverage,path+'/id','identity',native,'edge-id');addCoverage(coverage,path+'/from','value',from,'tail');addCoverage(coverage,path+'/to','value',to,'head');addCoverage(coverage,path+'/label',edge.label===undefined?'presence':'value',native,'visible-edge-label');addCoverage(coverage,path+'/why',edge.why===undefined?'presence':'value',native,edge.why===undefined?'why-absent':'visible-edge-label');addCoverage(coverage,path+'/kind',edge.kind===undefined?'presence':'value',native,edge.kind===undefined?'kind-absent':'visible-kind-header');
 }
 const emitOrder=(from:string,to:string,layout:string,parent?:string)=>statements.push(quote(from)+' -> '+quote(to)+' [style="invis", constraint="true", weight="1000", umf_layout='+quote(layout)+(parent===undefined?'':', umf_parent='+quote(parent))+'];');
 if(form==='pipeline'){
  for(let i=1;i<nodes.length;i++)emitOrder(nativeId(nodePrefix,nodes[i-1]!.id),nativeId(nodePrefix,nodes[i]!.id),'pipeline-order');
  for(const node of nodes)addCoverage(coverage,p('/nodes'),'order',nativeId(nodePrefix,node.id),'pipeline-order-chain');
 }
 if(form==='lanes'){
  for(let i=1;i<groups.length;i++)emitOrder(nativeId(laneAnchorPrefix,groups[i-1]!.id),nativeId(laneAnchorPrefix,groups[i]!.id),'lane-order');
  for(const group of groups)addCoverage(coverage,p('/groups'),'order',nativeId(groupPrefix,group.id),'lane-order-chain');
 }
 if(form==='zoned'){
  const groupById=new Map(groups.map((group:any)=>[group.id,group])),tierMembers=new Map<number,string[]>();
  const tierOf=(node:any):number|undefined=>{let current=node.group as string|undefined,seen=new Set<string>();while(current&&groupById.has(current)&&!seen.has(current)){seen.add(current);const group=groupById.get(current);if(group?.parent===undefined)return Number.isSafeInteger(group?.tier)?group.tier:undefined;current=group?.parent;}return;};
  for(const node of nodes){const tier=tierOf(node);if(tier!==undefined)tierMembers.set(tier,[...(tierMembers.get(tier)??[]),nativeId(nodePrefix,node.id)]);}
  const tiers=[...tierMembers.keys()].sort((a,b)=>a-b);
  for(const tier of tiers){const rankId=tierRankPrefix+String(tier);statements.push('subgraph '+quote(rankId)+' {',attrs('graph',[['rank','same'],['umf_layout','zoned-tier'],['umf_tier',String(tier)]]),...tierMembers.get(tier)!.map(id=>quote(id)+';'),'}');}
  for(let i=1;i<tiers.length;i++)emitOrder(tierMembers.get(tiers[i-1]!)![0]!,tierMembers.get(tiers[i]!)![0]!,'tier-order',undefined);
  for(const tier of tiers)addCoverage(coverage,p('/groups'),'order',tierRankPrefix+String(tier),'zoned-tier-rank');
 }
 if(diagnostics.some(item=>item.code==='DOT_FLOW_TEXT'))return{statements:[],identityMap:[],coverage:[],diagnostics};
 return{statements,identityMap,coverage,diagnostics};
}

function graphAttrs(graph:DotProfileGraph):DotProfileAttribute[]{return graph.statements.flatMap(statement=>statement.kind==='attributes'&&statement.target==='graph'?statement.attributes:[]);}
function chooseForm(graph:DotProfileGraph,requested?:FlowForm):FlowForm{
 if(graph.statements.some(statement=>statement.kind==='attributes'&&statement.target!=='graph'))throw new Error('Flow wrapper may declare graph attributes only.');
 if(graph.statements.filter(statement=>statement.kind==='attributes').length!==1)throw new Error('Flow graph must contain one qualified wrapper/header statement.');
 const attrs=graphAttrs(graph);if(!exactly(attrs,['umf_kind','umf_form','umf_profile','umf_has_groups','umf_has_edges','rankdir','newrank']))throw new Error('Flow graph has unsupported, duplicated, or unqualified wrapper attributes.');
 const form=one(attrs,'umf_form');if(one(attrs,'umf_kind')!=='flow'||one(attrs,'umf_profile')!=='umf.visual.dot.annotated/1'||!forms.includes(form as FlowForm)||requested!==undefined&&requested!==form)throw new Error('Native graph must declare the qualified flow form and profile.');
 const rankdir=one(attrs,'rankdir'),expected=form==='pipeline'||form==='zoned'?'LR':'TB';if(rankdir!==expected)throw new Error('Flow form has an unqualified native rank direction.');
 if(form==='zoned'?one(attrs,'newrank')!=='true':one(attrs,'newrank')!==undefined)throw new Error('Only zoned flow may enable the qualified newrank layout needed for tier bands.');
 for(const name of ['umf_has_groups','umf_has_edges'])if(!['true','false'].includes(one(attrs,name)??''))throw new Error('Flow presence marker is malformed.');
 return form as FlowForm;
}
function nodeFrom(statement:Extract<DotProfileStatement,{kind:'node'}>):FlowNode{
 const id=sourceId(nodePrefix,statement.id);if(id===undefined||!exactly(statement.attributes,['label','xlabel','umf_path','umf_id']))throw new Error('Flow node identity or attributes are outside the qualified subset.');
 const attrs=statement.attributes,index=indexPath(one(statement.attributes,'umf_path')??'','nodes'),label=one(attrs,'label');if(index===undefined||one(attrs,'umf_id')!==id||label===undefined)throw new Error('Flow node lacks exact identity path, id, or visible label.');
 return{id,label,...(one(attrs,'xlabel')===undefined?{}:{detail:one(attrs,'xlabel')!}),index,native:statement.id};
}
function groupFrom(statement:Extract<DotProfileStatement,{kind:'subgraph'}>,form:FlowForm):FlowGroup{
 const id=sourceId(groupPrefix,statement.id);if(id===undefined)throw new Error('Flow group identity is not canonical.');
 const attrStatements=statement.statements.filter((child):child is Extract<DotProfileStatement,{kind:'attributes'}>=>child.kind==='attributes');
 if(attrStatements.length!==1||attrStatements[0]!.target!=='graph'||!exactly(attrStatements[0]!.attributes,['label','umf_path','umf_id','umf_role','umf_tier','rank']))throw new Error('Flow group requires one exact visible label/role/tier and identity statement; defaults are refused.');
 const attrs=attrStatements[0]!.attributes,index=indexPath(one(attrs,'umf_path')??'','groups'),role=one(attrs,'umf_role'),visible=one(attrs,'label'),tierText=one(attrs,'umf_tier'),tier=tierText===undefined?undefined:Number(tierText);
 if(index===undefined||one(attrs,'umf_id')!==id||!role||!roles.includes(role as typeof roles[number])||visible===undefined||tierText!==undefined&&(!Number.isSafeInteger(tier)||tier!<1))throw new Error('Flow group header, tier, or identity metadata is not canonical.');
 const decoded=readVisibleGroupLabel(visible);if(decoded.role!==role||decoded.tier!==tier||visible!==visibleGroupLabel(decoded.role,decoded.tier,decoded.label,decoded.detail)||tierText!==(decoded.tier===undefined?undefined:String(decoded.tier)))throw new Error('Visible group role, tier, label, or detail does not agree with native identity descriptors.');
 if(one(attrs,'rank')!==undefined)throw new Error('Rank declarations belong only to the explicit lane-members subgraph.');
 return{id,label:decoded.label,...(decoded.detail===undefined?{}:{detail:decoded.detail}),role:role as typeof roles[number],...(tier===undefined?{}:{tier}),index,native:statement.id,children:[],nodeIds:[]};
}
function readVisibleGroupLabel(text:string):{role:string;tier?:number;label:string;detail?:string}{
 const rows=readVisibleFields(text,['Role','Tier','Label','Detail']);if(!rows.Role||!roles.includes(rows.Role as typeof roles[number])||rows.Tier===undefined||rows.Label===undefined)throw new Error('Visible flow group role, tier or label is missing.');let label:string,detail:string|undefined;try{label=JSON.parse(rows.Label);if(rows.Detail!==undefined)detail=JSON.parse(rows.Detail);}catch{throw new Error('Visible flow group label and detail must be readable JSON strings.');}if(typeof label!=='string'||rows.Detail!==undefined&&typeof detail!=='string')throw new Error('Visible flow group text must be JSON strings.');const tier=rows.Tier==='—'?undefined:Number(rows.Tier);if(tier!==undefined&&(!Number.isSafeInteger(tier)||tier<1))throw new Error('Visible flow group tier is invalid.');return{role:rows.Role,...(tier===undefined?{}:{tier}),label,...(detail===undefined?{}:{detail})};
}

/** Parse only the explicit flow profile; unknown defaults and statements refuse. */
export function parseDotFlow(graph:DotProfileGraph,requestedForm?:FlowForm):DotFlowParseResult{
 const diagnostics:InterchangeDiagnostic[]=[],coverage:DotFlowCoverage[]=[],identityMap:IdentityMapping[]=[];
 try{
  const form=chooseForm(graph,requestedForm),rootAttrs=graphAttrs(graph),hasGroups=one(rootAttrs,'umf_has_groups')==='true',hasEdges=one(rootAttrs,'umf_has_edges')==='true',nodes:FlowNode[]=[],groups:FlowGroup[]=[],edges:FlowEdge[]=[],seen=new Set<string>(),laneAnchors=new Map<string,string>(),laneRanks=new Map<string,string[]>();
  const parseChildren=(items:DotProfileStatement[],parent?:string):void=>{
   for(const statement of items){
    if(statement.kind==='attributes'){
     if(statement.target!=='graph')throw new Error('Flow accepts graph-only attributes in clusters.');
     continue;
    }
    if(statement.kind==='subgraph'){
     if(statement.id.startsWith(tierRankPrefix)){
      const header=statement.statements.find((child):child is Extract<DotProfileStatement,{kind:'attributes'}>=>child.kind==='attributes');
      const tierText=header&&one(header.attributes,'umf_tier'),tier=Number(tierText),members:string[]=[];
      if(form!=='zoned'||parent!==undefined||statement.id!==tierRankPrefix+tierText||!header||statement.statements.length<2||header.target!=='graph'||!exactly(header.attributes,['rank','umf_layout','umf_tier'])||one(header.attributes,'rank')!=='same'||one(header.attributes,'umf_layout')!=='zoned-tier'||!Number.isSafeInteger(tier)||tier<1)throw new Error('Zoned tier rank subgraph is not canonical.');
      for(const child of statement.statements){if(child===header)continue;if(child.kind!=='node'||child.attributes.length)throw new Error('Zoned tier rank contains unsupported members.');members.push(child.id);}
      if(laneRanks.has('tier:'+tier))throw new Error('Duplicate zoned tier rank.');laneRanks.set('tier:'+tier,members);continue;
     }
     if(statement.id.startsWith(laneRankPrefix)){
      const header=statement.statements.find((child):child is Extract<DotProfileStatement,{kind:'attributes'}>=>child.kind==='attributes');
      const groupId=header&&one(header.attributes,'umf_parent');
      if(form!=='lanes'||!groupId||parent!==groupId||statement.id!==laneRankPrefix+hex(groupId)||statement.statements.length<2||!header||header.target!=='graph'||!exactly(header.attributes,['rank','umf_layout','umf_parent'])||one(header.attributes,'rank')!=='same'||one(header.attributes,'umf_layout')!=='lane-members')throw new Error('Lane member rank subgraph is not canonical.');
      const members:string[]=[];for(const child of statement.statements){if(child===header)continue;if(child.kind!=='node'||child.attributes.length)throw new Error('Lane rank subgraph contains unsupported members.');members.push(child.id);}
      if(laneRanks.has(groupId))throw new Error('Duplicate lane rank subgraph.');laneRanks.set(groupId,members);continue;
     }
     const group=groupFrom(statement,form);if(seen.has(group.id))throw new Error('Duplicate flow group identity.');seen.add(group.id);group.parent=parent;groups.push(group);
     identityMap.push(identityMapping('group',group.native,group.id,p('/groups/'+group.index)));addCoverage(coverage,p('/groups/'+group.index)+'/id','identity',group.native,'cluster-id');addCoverage(coverage,p('/groups/'+group.index)+'/role','value',group.native,'cluster-role');addCoverage(coverage,p('/groups/'+group.index)+'/label','value',group.native,'visible-cluster-label');addCoverage(coverage,p('/groups/'+group.index)+'/detail',group.detail===undefined?'presence':'value',group.native,group.detail===undefined?'detail-absent':'visible-cluster-label');addCoverage(coverage,p('/groups/'+group.index)+'/tier',group.tier===undefined?'presence':'value',group.native,group.tier===undefined?'tier-absent':'visible-role-marker');
     if(parent!==undefined)addCoverage(coverage,p('/groups/'+group.index)+'/parent','value',nativeId(groupPrefix,parent),'nested-cluster');else addCoverage(coverage,p('/groups/'+group.index)+'/parent','presence',group.native,'root-cluster');
     for(const child of statement.statements){if(child.kind==='attributes')continue;if(child.kind==='edge'||child.kind==='assignment')throw new Error('Flow cluster cannot contain edges or assignments.');}
     parseChildren(statement.statements.filter(child=>child.kind!=='attributes'),group.id);continue;
    }
    if(statement.kind==='node'){
     if(statement.id.startsWith(laneAnchorPrefix)){
      const groupId=sourceId(laneAnchorPrefix,statement.id),attrs=statement.attributes;
      if(form!=='lanes'||!groupId||parent!==groupId||!exactly(attrs,['label','style','shape','width','height','umf_layout','umf_parent'])||one(attrs,'label')!==''||one(attrs,'style')!=='invis'||one(attrs,'shape')!=='point'||one(attrs,'width')!=='0'||one(attrs,'height')!=='0'||one(attrs,'umf_layout')!=='lane-anchor'||one(attrs,'umf_parent')!==groupId||laneAnchors.has(groupId))throw new Error('Lane layout anchor is not canonical.');laneAnchors.set(groupId,statement.id);continue;
     }
     const node=nodeFrom(statement);if(seen.has(node.id))throw new Error('Duplicate flow identity.');seen.add(node.id);node.group=parent;nodes.push(node);
     if(parent!==undefined){const group=groups.find(item=>item.id===parent)!;group.nodeIds.push(node.id);}
     identityMap.push(identityMapping('node',node.native,node.id,p('/nodes/'+node.index)));addCoverage(coverage,p('/nodes/'+node.index)+'/id','identity',node.native,'node-id');addCoverage(coverage,p('/nodes/'+node.index)+'/label','value',node.native,'label');addCoverage(coverage,p('/nodes/'+node.index)+'/detail',node.detail===undefined?'presence':'value',node.native,node.detail===undefined?'xlabel-absent':'xlabel');if(parent!==undefined)addCoverage(coverage,p('/nodes/'+node.index)+'/group','value',nativeId(groupPrefix,parent),'cluster-membership');else addCoverage(coverage,p('/nodes/'+node.index)+'/group','presence',node.native,'root-node');continue;
    }
    if(statement.kind==='edge'){
     if(parent!==undefined)throw new Error('Authored edges must be graph-level directed edges.');
     const attrs=statement.attributes,layout=one(attrs,'umf_layout');
     if(layout!==undefined){if(!exactly(attrs,['style','constraint','weight','umf_layout','umf_parent','umf_tier'])||one(attrs,'style')!=='invis'||one(attrs,'constraint')!=='true'||one(attrs,'weight')!=='1000'||!['pipeline-order','lane-order','tier-order'].includes(layout))throw new Error('Flow layout edge is not qualified.');continue;}
     if(!exactly(attrs,['label','umf_path','umf_id','umf_kind','id']))throw new Error('Flow edge has an attribute outside its qualified subset.');
     const index=indexPath(one(attrs,'umf_path')??'','edges'),id=one(attrs,'umf_id'),native=id===undefined?undefined:nativeId(edgePrefix,id),kind=one(attrs,'umf_kind'),visible=one(attrs,'label');
     if(index===undefined||!id||!native||one(attrs,'id')!==native||!sourceId(edgePrefix,native)||!sourceId(nodePrefix,statement.from)||!sourceId(nodePrefix,statement.to)||kind!==undefined&&!['action','data','control','return'].includes(kind))throw new Error('Flow edge identity, endpoints, or kind is malformed.');
     const decoded=readVisibleEdgeLabel(visible??'');
     if(decoded.kind!==kind)throw new Error('Flow edge visible kind header disagrees with native attributes.');
     if(seen.has(id))throw new Error('Duplicate flow identity.');seen.add(id);
     edges.push({id,from:sourceId(nodePrefix,statement.from)!,to:sourceId(nodePrefix,statement.to)!,...(decoded.label===undefined?{}:{label:decoded.label}),...(decoded.why===undefined?{}:{why:decoded.why}),...(decoded.kind===undefined?{}:{kind:decoded.kind as FlowEdge['kind']}),index,native});
     identityMap.push(identityMapping('edge',native,id,p('/edges/'+index)));addCoverage(coverage,p('/edges/'+index)+'/id','identity',native,'edge-id');addCoverage(coverage,p('/edges/'+index)+'/from','value',statement.from,'tail');addCoverage(coverage,p('/edges/'+index)+'/to','value',statement.to,'head');addCoverage(coverage,p('/edges/'+index)+'/label',decoded.label===undefined?'presence':'value',native,'visible-edge-label');addCoverage(coverage,p('/edges/'+index)+'/why',decoded.why===undefined?'presence':'value',native,decoded.why===undefined?'why-absent':'visible-edge-label');addCoverage(coverage,p('/edges/'+index)+'/kind',decoded.kind===undefined?'presence':'value',native,decoded.kind===undefined?'kind-absent':'visible-edge-header');continue;
    }
    if(statement.kind==='assignment')throw new Error('Flow profile refuses assignments and unknown native constructs.');
   }
  };
  for(const statement of graph.statements){if(statement.kind==='attributes')continue;if(statement.kind==='edge'||statement.kind==='node'||statement.kind==='subgraph'){}else throw new Error('Flow graph contains an unsupported statement.');}
  parseChildren(graph.statements);
  nodes.sort((a,b)=>a.index-b.index);edges.sort((a,b)=>a.index-b.index);groups.sort((a,b)=>a.index-b.index);
  const contiguous=(items:{index:number}[])=>items.every((item,index)=>item.index===index)&&new Set(items.map(item=>item.index)).size===items.length;
  if(!contiguous(nodes)||!contiguous(edges)||!contiguous(groups)||!hasGroups&&groups.length>0||!hasEdges&&edges.length>0)throw new Error('Flow presence markers or source identity paths disagree with native content.');
  if(groups.some(group=>group.parent!==undefined&&!groups.some(parent=>parent.id===group.parent)))throw new Error('Flow group parent is missing.');
  const expectedLayout:string[]=[];
  if(form==='pipeline')for(let i=1;i<nodes.length;i++)expectedLayout.push(nativeId(nodePrefix,nodes[i-1]!.id)+'>'+nativeId(nodePrefix,nodes[i]!.id));
  if(form==='lanes')for(let i=1;i<groups.length;i++)expectedLayout.push(nativeId(laneAnchorPrefix,groups[i-1]!.id)+'>'+nativeId(laneAnchorPrefix,groups[i]!.id));
  const rootTier=(node:FlowNode):number|undefined=>{let current=node.group,seen=new Set<string>();while(current&&!seen.has(current)){seen.add(current);const group=groups.find(item=>item.id===current);if(!group)return; if(group.parent===undefined)return group.tier;current=group.parent;}return;};
  const expectedTiers=form==='zoned'?[...new Set(nodes.map(rootTier))].filter((tier):tier is number=>Number.isSafeInteger(tier)).sort((a,b)=>a-b):[];
  if(form==='zoned')for(let i=1;i<expectedTiers.length;i++){const members=(tier:number)=>nodes.filter(node=>rootTier(node)===tier);const from=members(expectedTiers[i-1]!)[0],to=members(expectedTiers[i]!)[0];if(from&&to)expectedLayout.push(nativeId(nodePrefix,from.id)+'>'+nativeId(nodePrefix,to.id));}
  const layoutEdges=graph.statements.filter((item):item is Extract<DotProfileStatement,{kind:'edge'}>=>item.kind==='edge'&&one(item.attributes,'umf_layout')!==undefined);
  const actualLayout=layoutEdges.filter(edge=>one(edge.attributes,'umf_layout')!=='tier-order').map(edge=>edge.from+'>'+edge.to+(one(edge.attributes,'umf_parent')===undefined?'':'@'+one(edge.attributes,'umf_parent'))).concat(layoutEdges.filter(edge=>one(edge.attributes,'umf_layout')==='tier-order').map(edge=>edge.from+'>'+edge.to));
  if(JSON.stringify(actualLayout)!==JSON.stringify(expectedLayout))throw new Error('Native ordering constraints do not exactly match the declared flow order.');
  if(form==='pipeline')for(const node of nodes)addCoverage(coverage,p('/nodes'),'order',nativeId(nodePrefix,node.id),'pipeline-order-chain');
  if(form==='lanes'){
   if(laneAnchors.size!==groups.length||laneRanks.size!==groups.length)throw new Error('Lane layout anchors or rank subgraphs are missing or duplicated.');
   for(const group of groups){const anchor=laneAnchors.get(group.id),rank=laneRanks.get(group.id),members=nodes.filter(node=>node.group===group.id).map(node=>nativeId(nodePrefix,node.id));if(!anchor||!rank||JSON.stringify(rank)!==JSON.stringify([anchor,...members]))throw new Error('Lane native rank members do not match the declared group membership.');}
   for(const group of groups)addCoverage(coverage,p('/groups'),'order',nativeId(groupPrefix,group.id),'lane-order-chain');
  }
  if(form==='zoned'){
   if(laneRanks.size!==expectedTiers.length)throw new Error('Zoned tier rank subgraphs are missing or duplicated.');
   for(const tier of expectedTiers){const actual=laneRanks.get('tier:'+tier),expected=nodes.filter(node=>rootTier(node)===tier).map(node=>nativeId(nodePrefix,node.id));if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Zoned tier rank members do not match declared group tiers.');for(const id of actual??[])addCoverage(coverage,p('/groups'),'order',id,'zoned-tier-rank');}
  }
  const visual:Pick<Visual,'nodes'|'edges'|'groups'>={nodes:nodes.map(({id,label,detail,group})=>({id,label,...(detail===undefined?{}:{detail}),...(group===undefined?{}:{group})})),...(hasEdges?{edges:edges.map(({id,from,to,label,why,kind})=>({id,from,to,...(label===undefined?{}:{label}),...(why===undefined?{}:{why}),...(kind===undefined?{}:{kind})}))}:{}),...(hasGroups?{groups:groups.map(({id,label,detail,role,tier,parent})=>({id,label,...(detail===undefined?{}:{detail}),role,...(tier===undefined?{}:{tier}),...(parent===undefined?{}:{parent})}))}:{})};
  return{statements:[],identityMap,coverage,diagnostics,visual};
 }catch(error){diagnostics.push(diag('DOT_FLOW_PARSE','/source',error instanceof Error?error.message:String(error),'error',false));return{statements:[],identityMap:[],coverage:[],diagnostics};}
}
