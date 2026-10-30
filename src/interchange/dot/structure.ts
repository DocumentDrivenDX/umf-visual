// SPDX-License-Identifier: MIT OR Apache-2.0
/** Explicit DOT mapping for structure tree, nested and stack forms. */
import type {Visual} from '../../extensions/visual';
import {VISUAL_PATH, identityMapping, interchangeDiagnostic} from '../shared';
import type {IdentityMapping, InterchangeDiagnostic} from '../types';
import {quoteDotProfile, type DotProfileAttribute, type DotProfileGraph, type DotProfileStatement} from './profile-syntax';

export type StructureForm = 'tree' | 'nested' | 'stack';
export interface DotStructureLocator {id:string;slot:string;}
export interface DotStructureCoverage {
  path:string;
  aspect:'value'|'presence'|'order'|'members'|'identity';
  representation:'native-concept';
  native:DotStructureLocator[];
}
export interface DotStructureSerializeResult {
  statements:string[];
  identityMap:IdentityMapping[];
  coverage:DotStructureCoverage[];
  diagnostics:InterchangeDiagnostic[];
}
export interface DotStructureParseResult extends DotStructureSerializeResult {
  visual?:Pick<Visual,'nodes'|'structure'>;
}

const nodePrefix='umf_node_';
const nodeClusterPrefix='cluster_umf_node_';
const layerClusterPrefix='cluster_umf_layer_';
const forms:readonly StructureForm[]=['tree','nested','stack'];
const p=(suffix:string)=>VISUAL_PATH+suffix;
const pointerSegment=(value:string)=>value.replace(/~/g,'~0').replace(/\//g,'~1');
const pointerParts=(path:string)=>path.split('/').slice(1).map(part=>part.replace(/~1/g,'/').replace(/~0/g,'~'));
const jsonPointer=(parts:string[])=>'/'+parts.map(pointerSegment).join('/');
const utf8Hex=(value:string)=>Array.from(new TextEncoder().encode(value),byte=>byte.toString(16).padStart(2,'0')).join('');
function encodeNative(prefix:string,id:string):string{return prefix+utf8Hex(id);}
function decodeNative(prefix:string,value:string):string|undefined{
 if(!value.startsWith(prefix))return;
 const hex=value.slice(prefix.length);if(!hex||hex.length%2||!/^[0-9a-f]+$/.test(hex))return;
 try{const decoded=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(hex.match(/../g)!,byte=>parseInt(byte,16)));return encodeNative(prefix,decoded)===value?decoded:undefined;}catch{return;}
}
function diag(code:string,path:string,message:string,severity:'warning'|'error'='error',loss=false):InterchangeDiagnostic{return interchangeDiagnostic(code,path,message,{severity,loss});}
function quote(value:string):string{return quoteDotProfile(value);}
function attr(name:string,value:string):string{return name+'='+quote(value);}
function visibleStructureLabel(node:any):string{return 'Label: '+JSON.stringify(node.label)+(node.detail===undefined?'':'\nDetail: '+JSON.stringify(node.detail));}
function parseStructureLabel(text:string):{label:string;detail?:string}{const rows=text.split('\n');if(rows.length<1||rows.length>2||!rows[0]!.startsWith('Label: '))throw new Error('Structural visible node label is malformed.');let label:string;try{label=JSON.parse(rows[0]!.slice(7));}catch{throw new Error('Structural node label must be a readable JSON string.');}if(typeof label!=='string')throw new Error('Structural node label must be a string.');if(rows.length===1)return{label};if(!rows[1]!.startsWith('Detail: '))throw new Error('Structural node detail row is malformed.');let detail:unknown;try{detail=JSON.parse(rows[1]!.slice(8));}catch{throw new Error('Structural node detail must be a readable JSON string.');}if(typeof detail!=='string')throw new Error('Structural node detail must be a string.');return{label,detail};}
function attributes(target:'graph'|'node'|'edge',items:readonly [string,string][]):string{return target+' ['+items.map(([name,value])=>attr(name,value)).join(', ')+'];';}
function graphAttrs(graph:DotProfileGraph):DotProfileAttribute[]{
 const result:DotProfileAttribute[]=[];
 for(const statement of graph.statements)if(statement.kind==='attributes'&&statement.target==='graph')result.push(...statement.attributes);
 return result;
}
function oneAttribute(attributes:DotProfileAttribute[],name:string):string|undefined{
 const found=attributes.filter(item=>item.name===name);return found.length===1?found[0]!.value:undefined;
}
function onlyAttributes(attributes:DotProfileAttribute[],allowed:readonly string[]):boolean{return attributes.every(item=>allowed.includes(item.name));}
function pointerIndex(path:string,collection:string):number|undefined{
 const parts=pointerParts(path),expected=collection==='layers'?['extensions','umf.visual','structure','layers']:['extensions','umf.visual','nodes'];
 if(parts.length!==expected.length+1||expected.some((part,index)=>parts[index]!==part)||!/^(0|[1-9][0-9]*)$/.test(parts.at(-1)!))return;
 const value=Number(parts.at(-1));return Number.isSafeInteger(value)?value:undefined;
}
function identityAttrs(attrs:DotProfileAttribute[],index:number,collection:'nodes'|'layers'):boolean{
 return oneAttribute(attrs,'umf_path')===p('/'+(collection==='layers'?'structure/':'')+collection+'/'+index);
}
function addCoverage(coverage:DotStructureCoverage[],path:string,aspect:DotStructureCoverage['aspect'],id:string,slot:string):void{
 coverage.push({path,aspect,representation:'native-concept',native:[{id,slot}]});
}
function annotationLosses(visual:Visual,diagnostics:InterchangeDiagnostic[]):void{
 const root=visual as any;
 for(const field of ['question','takeaway','audience','source','omissions','steps'])if(Object.hasOwn(root,field))diagnostics.push(diag('DOT_STRUCTURE_ANNOTATION_REQUIRED',p('/'+field),'This application or provenance field requires the explicit readable annotation carrier.', 'warning',true));
 for(const [index,node]of (root.nodes??[]).entries())for(const field of ['role','status','emphasis','evidence'])if(Object.hasOwn(node,field))diagnostics.push(diag('DOT_STRUCTURE_ANNOTATION_REQUIRED',p('/nodes/'+index+'/'+field),'This application or provenance field requires the explicit readable annotation carrier.','warning',true));
}
function validateInput(visual:Visual):{form?:StructureForm;diagnostics:InterchangeDiagnostic[]} {
 const diagnostics:InterchangeDiagnostic[]=[],value=visual as any;
 if(value.kind!=='structure'||!forms.includes(value.form))diagnostics.push(diag('DOT_STRUCTURE_FORM',p('/form'),'DOT structure profile accepts only structure/tree, structure/nested, or structure/stack.'));
 const form=forms.includes(value.form)?value.form as StructureForm:undefined;
 if(Object.hasOwn(value,'groups'))diagnostics.push(diag('DOT_STRUCTURE_GROUPS',p('/groups'),'Visual groups, including an explicitly empty list, are outside this structural profile.'));
 if(Object.hasOwn(value,'edges'))diagnostics.push(diag('DOT_STRUCTURE_EDGES',p('/edges'),'Authored flow edges, including an explicitly empty list, are outside this structural profile.'));
 const nodes=Array.isArray(value.nodes)?value.nodes:[],ids=new Set<string>();
 if(!nodes.length)diagnostics.push(diag('DOT_STRUCTURE_NODES',p('/nodes'),'A structural visual requires at least one node.'));
 if(nodes.length>500)diagnostics.push(diag('DOT_STRUCTURE_SIZE',p('/nodes'),'The DOT structure profile is bounded to 500 nodes.'));
 for(const [index,node]of nodes.entries()){
  if(!node||typeof node.id!=='string'||!node.id||ids.has(node.id))diagnostics.push(diag('DOT_STRUCTURE_ID',p('/nodes/'+index+'/id'),'Structural node IDs must be nonempty and unique.'));
  else ids.add(node.id);
  if(typeof node.label!=='string')diagnostics.push(diag('DOT_STRUCTURE_LABEL',p('/nodes/'+index+'/label'),'Structural nodes require an exact text label.'));
  if(Object.hasOwn(node??{},'group'))diagnostics.push(diag('DOT_STRUCTURE_GROUP',p('/nodes/'+index+'/group'),'Node group membership is outside this structural form mapping.'));
  if(form!=='stack'&&Object.hasOwn(node??{},'layer'))diagnostics.push(diag('DOT_STRUCTURE_LAYER',p('/nodes/'+index+'/layer'),'Layer membership is valid only for structure/stack.'));
  if(form==='stack'&&Object.hasOwn(node??{},'parent'))diagnostics.push(diag('DOT_STRUCTURE_PARENT',p('/nodes/'+index+'/parent'),'Stack layer membership and parent containment are distinct fields; this profile does not combine them.'));
 }
 if(form==='stack'){
  const layers=value.structure?.layers;
  if(!Array.isArray(layers)||layers.length===0)diagnostics.push(diag('DOT_STRUCTURE_LAYERS',p('/structure/layers'),'A stack requires an ordered, nonempty structure.layers list.'));
  const layerIds=new Set<string>();
  for(const [index,layer]of (Array.isArray(layers)?layers:[]).entries()){
   if(typeof layer?.id!=='string'||!layer.id||layerIds.has(layer.id))diagnostics.push(diag('DOT_STRUCTURE_LAYER_ID',p('/structure/layers/'+index+'/id'),'Layer IDs must be nonempty and unique.'));
   else layerIds.add(layer.id);
   if(typeof layer?.label!=='string')diagnostics.push(diag('DOT_STRUCTURE_LAYER_LABEL',p('/structure/layers/'+index+'/label'),'Every stack layer requires a visible label.'));
   if(!nodes.some((node:any)=>node.layer===layer?.id))diagnostics.push(diag('DOT_STRUCTURE_EMPTY_LAYER',p('/structure/layers/'+index),'An empty layer has no native representative for the explicit layer-order constraint.'));
  }
  for(const [index,node]of nodes.entries())if(typeof node.layer!=='string'||!layerIds.has(node.layer))diagnostics.push(diag('DOT_STRUCTURE_NODE_LAYER',p('/nodes/'+index+'/layer'),'Every stack node must belong to exactly one declared layer.'));
  if(value.structure&&Object.keys(value.structure).some((key:string)=>key!=='layers'))diagnostics.push(diag('DOT_STRUCTURE_BLOCK',p('/structure'),'Stack structure accepts only its ordered layers field.'));
 }else if(value.structure!==undefined)diagnostics.push(diag('DOT_STRUCTURE_BLOCK',p('/structure'),'Tree and nested forms do not accept a structure block.'));
 if(form==='tree'||form==='nested'){
  const parent=new Map<string,string>();
  for(const [index,node]of nodes.entries())if(node.parent!==undefined){if(typeof node.parent!=='string'||!ids.has(node.parent)||node.parent===node.id)diagnostics.push(diag('DOT_STRUCTURE_PARENT',p('/nodes/'+index+'/parent'),'A structural parent must identify a different declared node.'));else parent.set(node.id,node.parent);}
  for(const [id]of parent){const seen=new Set<string>([id]);let current=parent.get(id);while(current){if(seen.has(current)){diagnostics.push(diag('DOT_STRUCTURE_CYCLE',p('/nodes'),'Structural parent links contain a cycle.'));break;}seen.add(current);current=parent.get(current);}}
 }
 return{form,diagnostics};
}

function structureNodeStatement(node:any,index:number):string{
 const native=encodeNative(nodePrefix,node.id),path=p('/nodes/'+index),attrs:[string,string][]=[['shape','box'],['label',visibleStructureLabel(node)],['umf_path',path]];return quote(native)+' ['+attrs.map(([name,value])=>attr(name,value)).join(', ')+'];';
}
function serializeTree(visual:Visual,coverage:DotStructureCoverage[],identityMap:IdentityMapping[]):string[]{
 const nodes=(visual.nodes??[]) as any[],byId=new Map(nodes.map((node,index)=>[node.id,{node,index}])),statements=[attributes('graph',[['umf_kind','structure'],['umf_form','tree'],['rankdir','TB'],['ordering','out'],['nodesep','0.6'],['ranksep','0.8'],['compound','true'],['newrank','true']])];
 for(const [index,node]of nodes.entries()){
  const native=encodeNative(nodePrefix,node.id),path=p('/nodes/'+index);statements.push(structureNodeStatement(node,index));identityMap.push(identityMapping('node',native,node.id,path));addCoverage(coverage,path+'/id','identity',native,'node-id');addCoverage(coverage,path+'/label','value',native,'label');addCoverage(coverage,path+'/detail',node.detail===undefined?'presence':'value',native,node.detail===undefined?'xlabel-absent':'xlabel');
  if(node.parent===undefined)addCoverage(coverage,path+'/parent','presence',native,'root-level-node');
  else{const parent=byId.get(node.parent);if(!parent)continue;const edge=encodeNative('umf_containment_',node.id),parentNative=encodeNative(nodePrefix,node.parent);statements.push(quote(parentNative)+' -> '+quote(native)+' ['+attr('id',edge)+', '+attr('umf_kind','containment')+', '+attr('umf_path',path+'/parent')+', '+attr('constraint','true')+', '+attr('arrowhead','normal')+'];');identityMap.push(identityMapping('edge',edge,node.id,path+'/parent'));addCoverage(coverage,path+'/parent','value',edge,'directed-containment-edge');}
 }
 return statements;
}
function serializeNested(visual:Visual,diagnostics:InterchangeDiagnostic[],coverage:DotStructureCoverage[],identityMap:IdentityMapping[]):string[]{
 const nodes=(visual.nodes??[]) as any[],byId=new Map(nodes.map((node,index)=>[node.id,{node,index}])),children=new Map<string|undefined,typeof nodes>();for(const node of nodes){const key=node.parent as string|undefined;children.set(key,[...(children.get(key)??[]),node]);}
 const emitted=new Set<string>(),statements=[attributes('graph',[['umf_kind','structure'],['umf_form','nested'],['rankdir','TB'],['nodesep','0.6'],['ranksep','0.8'],['compound','true'],['newrank','false']])];
 const emitNode=(node:any):string=>{const index=byId.get(node.id)!.index,native=encodeNative(nodePrefix,node.id),path=p('/nodes/'+index);emitted.add(node.id);identityMap.push(identityMapping('node',native,node.id,path));addCoverage(coverage,path+'/id','identity',native,'node-id');addCoverage(coverage,path+'/label','value',native,'label');addCoverage(coverage,path+'/detail',node.detail===undefined?'presence':'value',native,node.detail===undefined?'detail-absent':'visible-node-label');addCoverage(coverage,path+'/parent',node.parent===undefined?'presence':'value',native,node.parent===undefined?'root-level-node':'nested-cluster-membership');return structureNodeStatement(node,index);};
 const emitSubtree=(node:any):string[]=>{
  const nested=children.get(node.id)??[],index=byId.get(node.id)!.index,path=p('/nodes/'+index);if(!nested.length)return[emitNode(node)];
  const cluster=encodeNative(nodeClusterPrefix,node.id),result=['subgraph '+quote(cluster)+' {',attributes('graph',[['umf_path',path]]),emitNode(node)],representatives:string[]=[];
  for(let row=0;row<nested.length;row++){const child=nested[row]!,first=encodeNative(nodePrefix,child.id);representatives.push(first);result.push(...emitSubtree(child));const layoutId='umf_nested_depth_'+utf8Hex(node.id)+`_${row}`;result.push(quote(row===0?encodeNative(nodePrefix,node.id):representatives[row-1]!)+' -> '+quote(first)+' ['+attr('id',layoutId)+', '+attr('style','invis')+', '+attr('constraint','true')+', '+attr('weight','1000')+', '+attr('umf_layout',row===0?'nested-depth':'nested-row-order')+', '+attr('umf_parent',node.id)+', '+attr('umf_row_index',String(row))+'];');addCoverage(coverage,p('/nodes/'+byId.get(child.id)!.index)+'/parent','value',cluster,'nested-cluster-membership');}
  result.push('}');return result;
 };
 for(const root of children.get(undefined)??[])statements.push(...emitSubtree(root));for(const node of nodes)if(!emitted.has(node.id))diagnostics.push(diag('DOT_STRUCTURE_ORPHAN',p('/nodes/'+byId.get(node.id)!.index+'/parent'),'Node is unreachable from the structural roots.'));return statements;
}

function serializeStack(visual:Visual,coverage:DotStructureCoverage[],identityMap:IdentityMapping[]):string[]{
 const nodes=(visual.nodes??[]) as any[],layers=(visual as any).structure.layers as {id:string;label:string}[];
 const statements=[attributes('graph',[['umf_kind','structure'],['umf_form',visual.form],['rankdir','TB'],['compound','true'],['newrank','true']])],representatives:string[]=[];
 for(const [layerIndex,layer]of layers.entries()){
  const cluster=encodeNative(layerClusterPrefix,layer.id),layerPath=p('/structure/layers/'+layerIndex),members=nodes.flatMap((node,index)=>node.layer===layer.id?[{node,index}]:[]);
  const rep=encodeNative(nodePrefix,members[0]!.node.id);representatives.push(rep);
  statements.push('subgraph '+quote(cluster)+' {',attributes('graph',[['label',layer.label],['rank','same'],['umf_path',layerPath]]));
  identityMap.push(identityMapping('group',cluster,layer.id,layerPath));
  addCoverage(coverage,layerPath+'/id','identity',cluster,'cluster-id');
  addCoverage(coverage,layerPath+'/label','value',cluster,'cluster-label');
  addCoverage(coverage,p('/structure/layers'),'order',cluster,'cluster-order');
  for(const {node,index}of members){
   const native=encodeNative(nodePrefix,node.id),nodePath=p('/nodes/'+index),attrs:[string,string][]=[['shape','box'],['label',visibleStructureLabel(node)],['umf_path',nodePath]];
   statements.push('  '+quote(native)+' ['+attrs.map(([name,value])=>attr(name,value)).join(', ')+'];');
   identityMap.push(identityMapping('node',native,node.id,nodePath));
   addCoverage(coverage,nodePath+'/id','identity',native,'node-id');addCoverage(coverage,nodePath+'/label','value',native,'label');
   addCoverage(coverage,nodePath+'/detail',node.detail===undefined?'presence':'value',native,node.detail===undefined?'xlabel-absent':'xlabel');
   addCoverage(coverage,nodePath+'/layer','value',cluster,'cluster-membership');
   addCoverage(coverage,layerPath,'members',native,'layer-membership');
  }
  statements.push('}');
 }
 for(let index=1;index<representatives.length;index++)statements.push(quote(representatives[index-1]!)+' -> '+quote(representatives[index]!)+' [style="invis", constraint="true", weight="1000", umf_layout="layer-order"];');
 return statements;
}

/** Emit only the native constructs that carry structure meaning; wrappers own kind/form and annotation profile markers. */
export function serializeDotStructure(visual:Visual):DotStructureSerializeResult{
 const checked=validateInput(visual),diagnostics=checked.diagnostics,coverage:DotStructureCoverage[]=[],identityMap:IdentityMapping[]=[];
 if(diagnostics.some(item=>item.severity==='error')||!checked.form)return{statements:[],identityMap,coverage,diagnostics};
 annotationLosses(visual,diagnostics);
 try{
  const statements=checked.form==='stack'?serializeStack(visual,coverage,identityMap):checked.form==='tree'?serializeTree(visual,coverage,identityMap):serializeNested(visual,diagnostics,coverage,identityMap);
  return diagnostics.some(item=>item.severity==='error')?{statements:[],identityMap:[],coverage:[],diagnostics}:{statements,identityMap,coverage,diagnostics};
 }catch(error){
  diagnostics.push(diag('DOT_STRUCTURE_TEXT',p(''),'A structural value cannot be encoded as exact visible DOT text: '+(error instanceof Error?error.message:String(error))));
  return{statements:[],identityMap:[],coverage:[],diagnostics};
 }
}

interface ParsedNode {id:string;label:string;detail?:string;parent?:string;layer?:string;index:number;nativeId:string;}
interface ParsedLayer {id:string;label:string;index:number;nativeId:string;members:string[];}
function attrMap(attrs:DotProfileAttribute[]):Map<string,string>{return new Map(attrs.map(item=>[item.name,item.value]));}
function nodeAttributes(statement:Extract<DotProfileStatement,{kind:'node'}>,index:number,collection:'nodes'):ParsedNode{
 const id=decodeNative(nodePrefix,statement.id);if(id===undefined)throw new Error('Node identity is not a canonical reversible UMF ID.');
 if(!onlyAttributes(statement.attributes,['shape','label','umf_path'])||oneAttribute(statement.attributes,'shape')!=='box')throw new Error('Structural node must be a native box with only qualified identity and visible fields.');
 const attrs=attrMap(statement.attributes),path=attrs.get('umf_path'),arrayIndex=path===undefined?undefined:pointerIndex(path,'nodes');
 if(arrayIndex===undefined||!identityAttrs(statement.attributes,arrayIndex,collection))throw new Error('Node identity path is missing or malformed.');
 const sourceLabel=attrs.get('label');if(sourceLabel===undefined)throw new Error('Node visible label is missing.');const decoded=parseStructureLabel(sourceLabel);
 return{id,...decoded,index:arrayIndex,nativeId:statement.id};
}
function structuralGraphForm(graph:DotProfileGraph,requested?:StructureForm):StructureForm{
 if(graph.statements.some(statement=>statement.kind==='attributes'&&statement.target!=='graph'))throw new Error('Wrapper may declare graph attributes only.');
 const attrs=graphAttrs(graph);
 if(!onlyAttributes(attrs,['umf_kind','umf_form','umf_profile','rankdir','compound','newrank','ordering','nodesep','ranksep']))throw new Error('Graph has an attribute outside the structural profile wrapper.');
 if(new Set(attrs.map(item=>item.name)).size!==attrs.length)throw new Error('Graph wrapper repeats an attribute.');
 const kind=oneAttribute(attrs,'umf_kind'),form=oneAttribute(attrs,'umf_form'),profile=oneAttribute(attrs,'umf_profile');
 if(kind!=='structure')throw new Error('Native profile must mark the graph as structure.');
 if(profile!==undefined&&profile!=='umf.visual.dot.annotated/1')throw new Error('Unexpected DOT profile marker.');
 const chosen=requested??(form as StructureForm|undefined);
 if(!chosen||!forms.includes(chosen)||form!==chosen)throw new Error('Tree, nested, or stack form must be selected explicitly and agree with native graph attributes.');
 const rankdir=oneAttribute(attrs,'rankdir');if(rankdir!=='TB')throw new Error('Structural diagrams require an explicit top-to-bottom rank direction.');
 if(oneAttribute(attrs,'compound')!=='true'||oneAttribute(attrs,'newrank')!==(chosen==='nested'?'false':'true'))throw new Error('Structural profile requires the qualified compound and form-specific rank settings.');
 if(chosen==='tree'&&(oneAttribute(attrs,'ordering')!=='out'||oneAttribute(attrs,'nodesep')!=='0.6'||oneAttribute(attrs,'ranksep')!=='0.8'))throw new Error('Tree profile requires its qualified branching layout settings.');if(chosen==='nested'&&(oneAttribute(attrs,'nodesep')!=='0.6'||oneAttribute(attrs,'ranksep')!=='0.8'))throw new Error('Nested profile requires its qualified compact-grid spacing.');
 return chosen;
}
function pathIndex(attrs:DotProfileAttribute[],collection:'nodes'|'layers'):number{
 const path=oneAttribute(attrs,'umf_path'),index=path===undefined?undefined:pointerIndex(path,collection);if(index===undefined||!identityAttrs(attrs,index,collection))throw new Error('Structural identity path is missing, duplicated, or malformed.');return index;
}

function parseTree(graph:DotProfileGraph,coverage:DotStructureCoverage[],identityMap:IdentityMapping[]):Pick<Visual,'nodes'> {
 const nodes:ParsedNode[]=[],edges:Extract<DotProfileStatement,{kind:'edge'}>[]=[],seen=new Set<string>();for(const statement of graph.statements){if(statement.kind==='attributes'){if(statement.target!=='graph')throw new Error('Tree profile refuses node and edge defaults.');continue;}if(statement.kind==='node'){const node=nodeAttributes(statement,nodes.length,'nodes');if(seen.has(statement.id))throw new Error('Tree node is duplicated.');seen.add(statement.id);nodes.push(node);continue;}if(statement.kind==='edge'){if(!onlyAttributes(statement.attributes,['id','umf_kind','umf_path','constraint','arrowhead']))throw new Error('Tree containment edge contains an unknown native attribute.');const attrs=attrMap(statement.attributes),child=decodeNative(nodePrefix,statement.to),parent=decodeNative(nodePrefix,statement.from),path=attrs.get('umf_path'),match=path===undefined?undefined:/^\/extensions\/umf\.visual\/nodes\/(0|[1-9][0-9]*)\/parent$/.exec(path),index=match?Number(match[1]):undefined;if(!child||!parent||child===parent||attrs.get('id')!==encodeNative('umf_containment_',child)||attrs.get('umf_kind')!=='containment'||attrs.get('constraint')!=='true'||attrs.get('arrowhead')!=='normal'||!Number.isSafeInteger(index))throw new Error('Tree native edge is not an exact parent-to-child containment relation.');if(edges.some(item=>item.to===statement.to))throw new Error('Tree child has multiple native parents.');edges.push(statement);continue;}throw new Error('Tree profile refuses clusters and foreign statements.');}
 nodes.sort((a,b)=>a.index-b.index);if(nodes.some((node,index)=>node.index!==index)||new Set(nodes.map(node=>node.id)).size!==nodes.length)throw new Error('Tree node identity paths must be contiguous and unique.');for(const node of nodes)node.parent=undefined;
 for(const edge of edges){const attrs=attrMap(edge.attributes),childId=decodeNative(nodePrefix,edge.to)!,parentId=decodeNative(nodePrefix,edge.from)!,match=/^\/extensions\/umf\.visual\/nodes\/(0|[1-9][0-9]*)\/parent$/.exec(attrs.get('umf_path')!),child=nodes[Number(match![1])],parent=nodes.find(node=>node.id===parentId);if(!child||child.id!==childId||!parent)throw new Error('Tree containment edge endpoints do not identify exact source nodes.');child.parent=parentId;const id=attrs.get('id')!;identityMap.push(identityMapping('edge',id,childId,attrs.get('umf_path')!));addCoverage(coverage,attrs.get('umf_path')!,'value',id,'directed-containment-edge');}
 for(const node of nodes){const path=p('/nodes/'+node.index);identityMap.push(identityMapping('node',node.nativeId,node.id,path));addCoverage(coverage,path+'/id','identity',node.nativeId,'node-id');addCoverage(coverage,path+'/label','value',node.nativeId,'label');addCoverage(coverage,path+'/detail',node.detail===undefined?'presence':'value',node.nativeId,node.detail===undefined?'xlabel-absent':'xlabel');if(node.parent===undefined)addCoverage(coverage,path+'/parent','presence',node.nativeId,'root-level-node');else if(!edges.some(edge=>edge.to===node.nativeId))throw new Error('Tree parent value lacks its native containment edge.');}
 if(edges.length!==nodes.filter(node=>node.parent!==undefined).length)throw new Error('Tree has a missing or extra containment edge.');return{nodes:nodes.map(({id,label,detail,parent})=>({id,label,...(detail===undefined?{}:{detail}),...(parent===undefined?{}:{parent})}))};
}

function parseNested(graph:DotProfileGraph,coverage:DotStructureCoverage[],identityMap:IdentityMapping[]):Pick<Visual,'nodes'> {
 const nodes:ParsedNode[]=[],seenNative=new Set<string>(),seenClusters=new Set<string>(),childrenByParent=new Map<string,string[]>(),layoutByParent=new Map<string,Map<number,{layout:string;from:string;to:string}>>();
 const addNode=(statement:Extract<DotProfileStatement,{kind:'node'}>,parent:string|undefined)=>{const node=nodeAttributes(statement,nodes.length,'nodes');if(seenNative.has(statement.id))throw new Error('Duplicate native node ID.');seenNative.add(statement.id);node.parent=parent;nodes.push(node);const path=p('/nodes/'+node.index);identityMap.push(identityMapping('node',node.nativeId,node.id,path));addCoverage(coverage,path+'/id','identity',node.nativeId,'node-id');addCoverage(coverage,path+'/label','value',node.nativeId,'visible-node-label');addCoverage(coverage,path+'/detail',node.detail===undefined?'presence':'value',node.nativeId,node.detail===undefined?'detail-absent':'visible-node-label');};
 const walk=(statements:DotProfileStatement[],container:string|undefined,inside:boolean):void=>{for(const statement of statements){
  if(statement.kind==='attributes'){if(statement.target!=='graph'||inside&&!onlyAttributes(statement.attributes,['umf_path']))throw new Error('Unexpected graph/node/edge defaults.');continue;}
  if(statement.kind==='node'){addNode(statement,container);continue;}
  if(statement.kind==='edge'){if(!inside||!container||!onlyAttributes(statement.attributes,['id','style','constraint','weight','umf_layout','umf_parent','umf_row_index']))throw new Error('Nested layout edges are permitted only as qualified cluster-local constraints.');const attrs=attrMap(statement.attributes),parent=attrs.get('umf_parent'),row=Number(attrs.get('umf_row_index')),layout=attrs.get('umf_layout'),id=attrs.get('id');if(parent!==container||!Number.isSafeInteger(row)||row<0||!['nested-depth','nested-row-order'].includes(layout??'')||attrs.get('style')!=='invis'||attrs.get('constraint')!=='true'||attrs.get('weight')!=='1000'||id!=='umf_nested_depth_'+utf8Hex(parent)+'_'+row)throw new Error('Nested layout constraint is malformed.');const edges=layoutByParent.get(parent)??new Map();if(edges.has(row))throw new Error('Nested layout constraint is duplicated.');edges.set(row,{layout:layout!,from:statement.from,to:statement.to});layoutByParent.set(parent,edges);continue;}
  if(statement.kind!=='subgraph')throw new Error('Nested profile refuses foreign statements.');const owner=decodeNative(nodeClusterPrefix,statement.id);if(owner===undefined||seenClusters.has(statement.id))throw new Error('Unknown, malformed, or duplicate structural cluster.');seenClusters.add(statement.id);const attrsStatements=statement.statements.filter((child):child is Extract<DotProfileStatement,{kind:'attributes'}>=>child.kind==='attributes');if(attrsStatements.length!==1||attrsStatements[0]!.target!=='graph'||!onlyAttributes(attrsStatements[0]!.attributes,['umf_path']))throw new Error('Containment cluster requires one identity-only graph attribute statement.');const clusterIndex=pathIndex(attrsStatements[0]!.attributes,'nodes');if(attrsStatements[0]!.attributes.some(item=>item.value!==p('/nodes/'+clusterIndex)))throw new Error('Containment cluster path does not identify its owner.');const ownerNative=encodeNative(nodePrefix,owner),ownerStatements=statement.statements.filter((child):child is Extract<DotProfileStatement,{kind:'node'}>=>child.kind==='node'&&child.id===ownerNative);if(ownerStatements.length!==1)throw new Error('Containment cluster must contain its owner exactly once.');let ownerSeen=false;const directChildren:string[]=[];for(const child of statement.statements){if(child.kind==='attributes')continue;if(child.kind==='node'){if(child.id===ownerNative){if(ownerSeen)throw new Error('Containment cluster owner is duplicated.');ownerSeen=true;addNode(child,container);continue;}const childId=decodeNative(nodePrefix,child.id);if(childId===undefined)throw new Error('Nested child node identity is malformed.');directChildren.push(childId);addNode(child,owner);continue;}if(child.kind==='subgraph'){const childId=decodeNative(nodeClusterPrefix,child.id);if(childId===undefined)throw new Error('Nested child cluster identity is malformed.');directChildren.push(childId);walk([child],owner,true);continue;}if(child.kind==='edge'){walk([child],owner,true);continue;}throw new Error('Containment cluster contains an unsupported statement.');}
  childrenByParent.set(owner,directChildren);if(nodes.find(node=>node.id===owner)?.index!==clusterIndex)throw new Error('Containment cluster path does not match its owner node.');
 }};
 walk(graph.statements,undefined,false);for(const [parent,children]of childrenByParent){if(children.length===0)throw new Error('A nested containment cluster must have a child.');const layout=layoutByParent.get(parent);if(layout?.size!==children.length)throw new Error('Nested parent/child layout constraints are missing or duplicated.');for(let row=0;row<children.length;row++){const edge=layout!.get(row),from=row===0?encodeNative(nodePrefix,parent):encodeNative(nodePrefix,children[row-1]!),to=encodeNative(nodePrefix,children[row]!);if(!edge||edge.layout!==(row===0?'nested-depth':'nested-row-order')||edge.from!==from||edge.to!==to)throw new Error('Nested native child order does not match its containment cluster.');}}
 for(const [parent,layout]of layoutByParent)if(!childrenByParent.has(parent)||layout.size!==childrenByParent.get(parent)!.length)throw new Error('Nested layout constraints have no corresponding parent cluster.');if(nodes.some(node=>node.id!==decodeNative(nodePrefix,node.nativeId)))throw new Error('Node identities did not round-trip.');const indexes=[...nodes].map(node=>node.index).sort((a,b)=>a-b);if(indexes.some((index,position)=>index!==position)||new Set(indexes).size!==indexes.length)throw new Error('Node identity paths must cover a contiguous unique index range.');nodes.sort((a,b)=>a.index-b.index);for(const node of nodes){const path=p('/nodes/'+node.index);if(node.parent!==undefined)addCoverage(coverage,path+'/parent','value',encodeNative(nodeClusterPrefix,node.parent),'nested-cluster-membership');else addCoverage(coverage,path+'/parent','presence',node.nativeId,'root-level-node');}return{nodes:nodes.map(({id,label,detail,parent})=>({id,label,...(detail===undefined?{}:{detail}),...(parent===undefined?{}:{parent})}))};
}

function parseStack(graph:DotProfileGraph,coverage:DotStructureCoverage[],identityMap:IdentityMapping[]):Pick<Visual,'nodes'|'structure'> {
 const layers:ParsedLayer[]=[],nodes:ParsedNode[]=[],seenClusters=new Set<string>(),seenNative=new Set<string>(),edges:Extract<DotProfileStatement,{kind:'edge'}>[]=[];
 for(const statement of graph.statements){
  if(statement.kind==='attributes')continue;
  if(statement.kind==='edge'){
   if(!onlyAttributes(statement.attributes,['style','constraint','weight','umf_layout'])||attrMap(statement.attributes).get('umf_layout')!=='layer-order')throw new Error('Stack accepts only explicit generated layer-order constraints.');edges.push(statement);continue;
  }
  if(statement.kind!=='subgraph')throw new Error('Stack nodes must be inside their declared layer clusters.');
  const layerId=decodeNative(layerClusterPrefix,statement.id);if(layerId===undefined||seenClusters.has(statement.id))throw new Error('Unknown, malformed, or duplicate layer cluster.');seenClusters.add(statement.id);
  const clusterAttrs=statement.statements.filter((child):child is Extract<DotProfileStatement,{kind:'attributes'}>=>child.kind==='attributes');
  if(clusterAttrs.length!==1||clusterAttrs[0]!.target!=='graph'||!onlyAttributes(clusterAttrs[0]!.attributes,['label','rank','umf_path']))throw new Error('Layer cluster requires one visible label, same-rank band and identity path; defaults and other attributes are not admitted.');
  const attrs=clusterAttrs[0]!.attributes,index=pathIndex(attrs,'layers'),label=oneAttribute(attrs,'label');if(label===undefined)throw new Error('Layer cluster visible label is missing.');
  if(oneAttribute(attrs,'rank')!=='same')throw new Error('Each stack cluster must explicitly place all members in one native rank.');
  const layer:ParsedLayer={id:layerId,label,index,nativeId:statement.id,members:[]};layers.push(layer);
  for(const child of statement.statements){
   if(child.kind==='attributes')continue; // The single graph-only label/rank/identity statement was validated above.
   if(child.kind!=='node')throw new Error('Nested content and subgraphs are not valid stack members.');
   const node=nodeAttributes(child,nodes.length,'nodes');if(seenNative.has(child.id))throw new Error('Duplicate stack node identity.');seenNative.add(child.id);node.layer=layerId;layer.members.push(child.id);nodes.push(node);
   const nodePath=p('/nodes/'+node.index);identityMap.push(identityMapping('node',node.nativeId,node.id,nodePath));
   addCoverage(coverage,nodePath+'/id','identity',node.nativeId,'node-id');addCoverage(coverage,nodePath+'/label','value',node.nativeId,'label');
   addCoverage(coverage,nodePath+'/detail',node.detail===undefined?'presence':'value',node.nativeId,node.detail===undefined?'xlabel-absent':'xlabel');
   addCoverage(coverage,nodePath+'/layer','value',layer.nativeId,'cluster-membership');addCoverage(coverage,p('/structure/layers/'+index),'members',node.nativeId,'layer-member');
  }
 }
 layers.sort((a,b)=>a.index-b.index);nodes.sort((a,b)=>a.index-b.index);
 if(!layers.length||layers.some(layer=>!layer.members.length))throw new Error('Stack has a missing or empty layer.');
 if(nodes.some((node,index)=>node.index!==index)||new Set(nodes.map(node=>node.id)).size!==nodes.length)throw new Error('Stack node identity paths are missing, duplicated, or noncontiguous.');
 if(layers.some((layer,index)=>layer.index!==index)||new Set(layers.map(layer=>layer.id)).size!==layers.length)throw new Error('Stack layer identity paths are missing, duplicated, or noncontiguous.');
 const reps=layers.map(layer=>{
  const member=nodes.filter(node=>node.layer===layer.id).sort((a,b)=>a.index-b.index)[0];if(!member)throw new Error('Layer lacks its native representative node.');return member.nativeId;
 });
 if(edges.length!==Math.max(0,layers.length-1))throw new Error('Stack layer ordering constraints are missing or duplicated.');
 for(const [index,edge]of edges.entries()){
  const attrs=attrMap(edge.attributes);if(attrs.get('style')!=='invis'||attrs.get('constraint')!=='true'||attrs.get('weight')!=='1000'||edge.from!==reps[index]||edge.to!==reps[index+1])throw new Error('Stack native ordering constraint disagrees with declared layer order.');
 }
 for(const layer of layers){const layerPath=p('/structure/layers/'+layer.index);identityMap.push(identityMapping('group',layer.nativeId,layer.id,layerPath));addCoverage(coverage,layerPath+'/id','identity',layer.nativeId,'cluster-id');addCoverage(coverage,layerPath+'/label','value',layer.nativeId,'cluster-label');addCoverage(coverage,p('/structure/layers'),'order',layer.nativeId,'ordered-cluster-chain');}
 return{nodes:nodes.map(({id,label,detail,layer})=>({id,label,...(detail===undefined?{}:{detail}),...(layer===undefined?{}:{layer})})),structure:{layers:layers.map(({id,label})=>({id,label}))}};
}

/** Parse the reviewed bounded profile AST; any foreign statement or ambiguity is a refusal. */
export function parseDotStructure(graph:DotProfileGraph,requestedForm?:StructureForm):DotStructureParseResult{
 const diagnostics:InterchangeDiagnostic[]=[],identityMap:IdentityMapping[]=[],coverage:DotStructureCoverage[]=[];
 try{
  const form=structuralGraphForm(graph,requestedForm),visual=form==='stack'?parseStack(graph,coverage,identityMap):form==='tree'?parseTree(graph,coverage,identityMap):parseNested(graph,coverage,identityMap);
  return{statements:[],identityMap,coverage,diagnostics,visual};
 }catch(error){
  diagnostics.push(diag('DOT_STRUCTURE_PARSE','/source',error instanceof Error?error.message:'Structural DOT profile could not be parsed.'));
  return{statements:[],identityMap:[],coverage:[],diagnostics};
 }
}
