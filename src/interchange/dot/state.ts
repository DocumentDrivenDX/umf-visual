// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Visual,VisualNode,VisualTransition} from '../../extensions/visual';
import type {ProjectionCoverage} from '../annotations';
import type {IdentityMapping,InterchangeDiagnostic} from '../types';
import {quoteDotProfile as q,type DotProfileGraph,type DotProfileStatement} from './profile-syntax';

const ROOT='/extensions/umf.visual';
export interface DotStateResult {
 statements:string[];identityMap:IdentityMapping[];coverage:ProjectionCoverage[];diagnostics:InterchangeDiagnostic[];
 visual?:Pick<Visual,'nodes'|'state'>;
}
const empty=():DotStateResult=>({statements:[],identityMap:[],coverage:[],diagnostics:[]});
const failure=(message:string):DotStateResult=>({...empty(),diagnostics:[{code:'DOT_STATE_PROFILE',path:ROOT+'/state',message,severity:'error',loss:false}]});
const nativeId=(id:string)=>'state_'+Array.from(id).map(c=>c.codePointAt(0)!.toString(16)).join('_');
const attrs=(statement:Extract<DotProfileStatement,{kind:'node'|'edge'|'attributes'}>)=>Object.fromEntries(statement.attributes.map(a=>[a.name,a.value]));
const coverage=(path:string,id:string,slot:string,aspect:ProjectionCoverage['aspect']='value'):ProjectionCoverage=>({path,aspect,representation:'native-concept',native:[{id,slot}]});
function transitionLabel(transition:VisualTransition):string {
 return (['event','guard','action','path'] as const).filter(key=>Object.hasOwn(transition,key)).map(key=>key+': '+JSON.stringify(transition[key])).join('\n');
}
function readTransitionLabel(label:string):Pick<VisualTransition,'event'|'guard'|'action'|'path'> {
 const out:Record<string,string>={};
 for(const line of label.split('\n')){
  const match=/^(event|guard|action|path): (.*)$/.exec(line);if(!match||Object.hasOwn(out,match[1]))throw new Error('Ambiguous transition label');
  const value:unknown=JSON.parse(match[2]);if(typeof value!=='string')throw new Error('Transition parts must be typed strings');out[match[1]]=value;
 }
 if(!Object.hasOwn(out,'event')||out.path!==undefined&&!['main','alternate','failure'].includes(out.path))throw new Error('Invalid transition event/path');
 return out as Pick<VisualTransition,'event'|'guard'|'action'|'path'>;
}

/** Adapter-owned state view: genuine state circles, directed transitions and
 * visible, unambiguous transition parts. Additional metadata belongs to the
 * explicit annotation profile, never hidden scalar attributes. */
export function serializeDotState(visual:Visual,graphId='umf_visual'):DotStateResult {
 if(visual.kind!=='state'||!['machine','lifecycle'].includes(visual.form)||!visual.state||!visual.nodes)return failure('Expected a state machine or lifecycle.');
 try{
  const result=empty(),nodes=visual.nodes,state=visual.state,known=new Set(nodes.map(n=>n.id));
  if(nodes.length>15||new Set(nodes.map(n=>n.id)).size!==nodes.length||!known.has(state.initial))return failure('Invalid or oversized state identity set.');
  if(Object.keys(state).some(key=>!['initial','final','transitions'].includes(key)))return failure('Unknown state meaning.');
  if(state.final?.some(id=>!known.has(id))||new Set(state.final).size!==(state.final?.length??0))return failure('Invalid final-state set.');
  result.statements.push('graph [rankdir=LR, bgcolor="transparent", nodesep="0.6", ranksep="1.2"];','node [fontname="Arial", fontsize="14", style="filled", fillcolor="#f5f8ff", color="#526783"];','edge [fontname="Arial", fontsize="11", color="#526783"];');
  for(const [i,node]of nodes.entries()){
   if(Object.keys(node).some(key=>!['id','label','detail','role','status','emphasis','evidence'].includes(key)))return failure('Unsupported state-node relation.');
   const id=nativeId(node.id),path=ROOT+'/nodes/'+i;
   result.statements.push(q(id)+' [umf_kind="state", umf_id='+q(node.id)+', label='+q(node.label)+', shape='+q(state.final?.includes(node.id)?'doublecircle':'ellipse')+(node.detail===undefined?'':', xlabel='+q(node.detail))+'];');
   result.identityMap.push({kind:'node',nativeId:id,visualId:node.id,path});
   result.coverage.push(coverage(path+'/id',id,'identity','identity'),coverage(path+'/label',id,'label'));
   if(node.detail!==undefined)result.coverage.push(coverage(path+'/detail',id,'xlabel'));
  }
  result.statements.push('"__umf_initial" [umf_kind="initial", label="", shape=point, width="0.16", fillcolor="#263b59"];','"__umf_initial" -> '+q(nativeId(state.initial))+' [umf_kind="initial", label="initial"];');
  result.coverage.push(coverage(ROOT+'/nodes',graphId,'statements[umf_kind=state]/order','order'),coverage(ROOT+'/state/initial','__umf_initial','directed-endpoint'));
  if(state.final!==undefined){
   // A dedicated visible legend carries the ordered final identities; every
   // declared identity must independently have the double-circle native mark.
   result.statements.push('"__umf_final_order" [umf_kind="final-order", shape=plaintext, label='+q('Final states (in order): '+state.final.map(id=>JSON.stringify(id)).join(', '))+'];');
   result.coverage.push(coverage(ROOT+'/state/final','__umf_final_order','label','order'));
  }
  if(state.transitions.length>10_000||new Set(state.transitions.map(t=>t.id)).size!==state.transitions.length)return failure('Invalid transition identity set.');
  for(const [i,t]of state.transitions.entries()){
   if(!known.has(t.from)||!known.has(t.to)||Object.keys(t).some(key=>!['id','from','to','event','guard','action','path','status','emphasis'].includes(key)))return failure('Unsupported transition meaning or endpoint.');
   const id='transition_'+i,path=ROOT+'/state/transitions/'+i;
   result.statements.push(q(nativeId(t.from))+' -> '+q(nativeId(t.to))+' [umf_kind="transition", id='+q(id)+', umf_id='+q(t.id)+', label='+q(transitionLabel(t))+'];');
   result.identityMap.push({kind:'edge',nativeId:id,visualId:t.id,path});
   for(const key of ['id','from','to','event','guard','action','path'] as const)if(Object.hasOwn(t,key))result.coverage.push(coverage(path+'/'+key,id,key==='from'||key==='to'?'directed-'+key:key==='id'?'identity':'label/'+key,key==='id'?'identity':'value'));
  }
  result.coverage.push(coverage(ROOT+'/state/transitions',graphId,'statements[umf_kind=transition]/order','order'));
  return result;
 }catch(error){return failure(error instanceof Error?error.message:String(error));}
}

/** Parse intrinsic state objects only. The wrapper removes its separately
 * validated profile header and annotation objects before calling this reader. */
export function parseDotState(graph:DotProfileGraph):DotStateResult {
 try{
  const result=empty(),nodes:VisualNode[]=[],byNative=new Map<string,VisualNode>(),pending:Extract<DotProfileStatement,{kind:'edge'}>[]=[],finalNative=new Set<string>();
  let marker=false,initial:string|undefined,final:string[]|undefined;const defaults=new Set<string>();
  const ensureAttrs=(attributes:Record<string,string>,allowed:string[])=>{if(Object.keys(attributes).some(key=>!allowed.includes(key)))throw new Error('Unrecognized native state attribute');};
  for(const statement of graph.statements){
   if(statement.kind==='attributes'){
    const a=attrs(statement),canonical:Record<string,string>=statement.target==='graph'?{rankdir:'LR',bgcolor:'transparent',nodesep:'0.6',ranksep:'1.2'}:statement.target==='node'?{fontname:'Arial',fontsize:'14',style:'filled',fillcolor:'#f5f8ff',color:'#526783'}:{fontname:'Arial',fontsize:'11',color:'#526783'};ensureAttrs(a,Object.keys(canonical));
    if(defaults.has(statement.target)||Object.keys(a).some(key=>a[key]!==canonical[key]))throw new Error('Unsupported or repeated state presentation defaults');defaults.add(statement.target);continue;
   }
   if(statement.kind==='edge'){pending.push(statement);continue;}
   if(statement.kind!=='node')throw new Error('Foreign statement in state diagram');const a=attrs(statement);
   if(statement.id==='__umf_initial'){
    ensureAttrs(a,['umf_kind','label','shape','width','fillcolor']);if(marker||a.umf_kind!=='initial'||a.shape!=='point'||a.label!==''||a.width!=='0.16'||a.fillcolor!=='#263b59')throw new Error('Invalid initial marker');marker=true;continue;
   }
   if(statement.id==='__umf_final_order'){
    ensureAttrs(a,['umf_kind','shape','label']);if(final!==undefined||a.umf_kind!=='final-order'||a.shape!=='plaintext'||!a.label?.startsWith('Final states (in order): '))throw new Error('Invalid ordered final-state legend');
    final=JSON.parse('['+a.label.slice('Final states (in order): '.length)+']');if(!Array.isArray(final)||final.some(id=>typeof id!=='string')||new Set(final).size!==final.length)throw new Error('Invalid final-state identities');continue;
   }
   ensureAttrs(a,['umf_kind','umf_id','label','shape','xlabel']);
   if(a.umf_kind!=='state'||typeof a.umf_id!=='string'||statement.id!==nativeId(a.umf_id)||a.label===undefined||!['ellipse','doublecircle'].includes(a.shape)||byNative.has(statement.id))throw new Error('Invalid or duplicate state identity/shape');
   const node:VisualNode={id:a.umf_id,label:a.label,...(a.xlabel===undefined?{}:{detail:a.xlabel})};nodes.push(node);byNative.set(statement.id,node);if(a.shape==='doublecircle')finalNative.add(node.id);
  }
  if(!marker||nodes.length===0||nodes.length>15||defaults.size!==3)throw new Error('Missing or oversized state objects/defaults');
  const transitions:VisualTransition[]=[],ids=new Set<string>();
  for(const edge of pending){
   const a=attrs(edge);if(a.umf_kind==='initial'){
    ensureAttrs(a,['umf_kind','label']);if(initial!==undefined||edge.from!=='__umf_initial'||a.label!=='initial'||!byNative.has(edge.to))throw new Error('Invalid initial endpoint');initial=byNative.get(edge.to)!.id;continue;
   }
   ensureAttrs(a,['umf_kind','id','umf_id','label']);const from=byNative.get(edge.from),to=byNative.get(edge.to);
   if(a.umf_kind!=='transition'||!from||!to||!a.umf_id||ids.has(a.umf_id)||a.id!=='transition_'+transitions.length||a.label===undefined)throw new Error('Invalid transition identity or attachment');ids.add(a.umf_id);
   transitions.push({id:a.umf_id,from:from.id,to:to.id,...readTransitionLabel(a.label)});
  }
  if(initial===undefined||final===undefined&&finalNative.size||final?.some(id=>!finalNative.has(id))||final!==undefined&&final.length!==finalNative.size)throw new Error('Conflicting initial/final native representations');
  const visual={nodes,state:{initial,...(final===undefined?{}:{final}),transitions}};
  // Reuse the writer's independently addressed coverage; exact diagram values
  // are reconstructed above from the actual admitted native AST.
  const rebuilt=serializeDotState({id:'readback',question:'readback',kind:'state',form:'machine',...visual},graph.id);
  if(rebuilt.diagnostics.length)throw new Error('Readback cannot be represented by the state profile');
  return {...rebuilt,statements:[],visual};
 }catch(error){return failure(error instanceof Error?error.message:String(error));}
}
