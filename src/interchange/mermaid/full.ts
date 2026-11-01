// SPDX-License-Identifier: MIT OR Apache-2.0
import {decodeAnnotationValue,encodeAnnotationValue} from '../annotations';
import {fullRecordId,reconcileFullEndpoints,recoverFullRecords} from '../full/records';
import type {FullEdge,FullGroup,FullNativeAdapter,FullNode,FullRecord,FullScene} from '../full/types';

/**
 * Readable full-scene carrier for Mermaid flowcharts. Semantic values live in
 * native labels; comments carry only identities, pointers and shape structure.
 * This intentionally accepts only the grammar emitted here.
 */
export const mermaidFullAdapter:FullNativeAdapter={format:'mermaid',emit,read};
export const fullMermaidAdapter=mermaidFullAdapter;
export const adapter:FullNativeAdapter=mermaidFullAdapter;

type Meta = Record<string,unknown>;
const idToken=(prefix:string,id:string)=>prefix+'_'+Array.from({length:id.length},(_,i)=>id.charCodeAt(i).toString(16).padStart(4,'0')).join('');
const quote=(text:string)=>'"'+text.replace(/#/g,'#35;').replace(/&/g,'#38;').replace(/\\/g,'#92;').replace(/"/g,'#34;').replace(/</g,'#60;').replace(/>/g,'#62;').replace(/\|/g,'#124;').replace(/`/g,'#96;').replace(/\r/g,'#13;').replace(/\n/g,'#10;')+'"';
const unquote=(value:string)=>value.slice(1,-1).replace(/\\(["\\])/g,'$1').replace(/#(\d+);/g,(_m,n:string)=>{const cp=Number(n);if(!Number.isInteger(cp)||cp<=0||cp>0x10ffff||(cp>=0xd800&&cp<=0xdfff))throw new TypeError('Invalid Mermaid numeric entity');return String.fromCodePoint(cp);});
const comment=(kind:string,value:unknown)=>'%% umf-full '+kind+' '+JSON.stringify(value);
const widthPrefix=(width:number)=>('▮'.repeat(Math.round(width/36)))+' | ';
function stripWidth(text:string,present:boolean,declared:unknown):{text:string;width?:number} {
 if(!present){if(declared!==undefined)throw new TypeError('Unexpected magnitude extent metadata');return {text};}
 const match=/^(▮+) \| ([\s\S]*)$/.exec(text);if(!match)throw new TypeError('Visible magnitude indicator is missing or malformed');
 if(typeof declared!=='number'||!Number.isFinite(declared)||declared<36||declared>396||match[1]!.length!==Math.round(declared/36))throw new TypeError('Visible magnitude indicator does not match its declared extent');
 return {text:match[2]!,width:declared};
}
function exactKeys(value:Meta,required:string[],optional:string[]=[]):void {
 const allowed=new Set([...required,...optional]);
 if(required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!allowed.has(key)))throw new TypeError('Unknown or missing Mermaid full-scene structural metadata field');
}

function recordDisplay(record:FullRecord):string {
 const decoded=decodeAnnotationValue(record.type,record.value);
 return decoded.kind==='string'?decoded.value:record.value;
}
function recordFromDisplay(record:FullRecord,display:string):FullRecord {
 if(record.type==='string')return {...record,value:encodeAnnotationValue({kind:'string',value:display}).value};
 decodeAnnotationValue(record.type,display);
 return {...record,value:display};
}
function validateScene(scene:FullScene):void {
 if(!scene||scene.format!=='mermaid'||scene.profile!=='umf.visual.mermaid.full/1'||scene.version!=='1'||scene.kind.length===0||scene.form.length===0)throw new TypeError('Expected the qualified umf.visual.mermaid.full/1 scene');
 const ids=new Set<string>(),paths=new Set<string>(),recordsById=new Map<string,FullRecord>();
 for(const row of scene.records){
  if(!row||typeof row.id!=='string'||row.id!==fullRecordId(row.path)||ids.has(row.id)||paths.has(row.path))throw new TypeError('Invalid or duplicate full-record identity');
  decodeAnnotationValue(row.type,row.value);ids.add(row.id);paths.add(row.path);recordsById.set(row.id,row);
 }
 if(!Array.isArray(scene.approximations)||scene.approximations.some(item=>!item||Object.keys(item).sort().join(',')!=='path,reason,renderedAs,requested'||![item.path,item.requested,item.renderedAs,item.reason].every(value=>typeof value==='string')))throw new TypeError('Invalid visual approximation metadata');
 // Also proves that the flat record table is a complete, internally coherent tree.
 recoverFullRecords(scene.records);
 const primaries=new Set<string>();
 const bind=(id:string|undefined)=>{if(id===undefined)return;if(!ids.has(id))throw new TypeError('Scene primitive references missing full record '+id);if(primaries.has(id))throw new TypeError('A full record cannot be bound to multiple primary primitives');primaries.add(id);};
 const nodeIds=new Set<string>(),identityRecords=new Set<string>();for(const node of scene.nodes){if(!node.id||node.id.length>256||nodeIds.has(node.id)||!['box','ellipse','diamond','note'].includes(node.shape))throw new TypeError('Invalid or duplicate full-scene node');nodeIds.add(node.id);bind(node.recordId);if(node.identityRecordId!==undefined){if(!ids.has(node.identityRecordId)||recordsById.get(node.identityRecordId)?.type!=='string'||identityRecords.has(node.identityRecordId))throw new TypeError('Node source identity must be a unique string record');identityRecords.add(node.identityRecordId);}if(node.identityRecordId!==undefined&&node.identityRecordId===node.recordId)throw new TypeError('Node label and source identity cannot share one record');if(node.text!==undefined&&node.recordId!==undefined)throw new TypeError('Node text is only valid when no primary record is bound');if(node.width!==undefined&&(!Number.isFinite(node.width)||node.width<36||node.width>396))throw new TypeError('Node width must be from 36 to 396 CSS pixels');}
 const groupMap=new Map<string,FullGroup>();for(const group of scene.groups){if(!group.id||group.id.length>256||group.id==='additional-properties'||groupMap.has(group.id))throw new TypeError('Invalid or duplicate full-scene group');groupMap.set(group.id,group);bind(group.recordId);if(group.text!==undefined&&group.recordId!==undefined)throw new TypeError('Group text is only valid when no primary record is bound');}
 for(const group of scene.groups){if(group.parent!==undefined&&!groupMap.has(group.parent))throw new TypeError('Group parent is missing');}
 for(const group of scene.groups){const visited=new Set<string>([group.id]);let parent=group.parent;while(parent!==undefined){if(visited.has(parent))throw new TypeError('Full-scene groups contain a parent cycle');visited.add(parent);parent=groupMap.get(parent)?.parent;}}
 for(const node of scene.nodes)if(node.group!==undefined&&!groupMap.has(node.group))throw new TypeError('Node refers to a missing group');
 const edgeIds=new Set<string>();for(const edge of scene.edges){if(!edge.id||edge.id.length>256||edgeIds.has(edge.id)||!nodeIds.has(edge.from)||!nodeIds.has(edge.to)||edge.directed!==undefined&&typeof edge.directed!=='boolean')throw new TypeError('Invalid edge identity, direction or endpoint');edgeIds.add(edge.id);bind(edge.recordId);if(edge.fromRecordId!==undefined&&!ids.has(edge.fromRecordId))throw new TypeError('Edge refers to a missing source endpoint record');if(edge.toRecordId!==undefined&&!ids.has(edge.toRecordId))throw new TypeError('Edge refers to a missing target endpoint record');if(edge.fromRecordId!==undefined&&recordsById.get(edge.fromRecordId)?.type!=='string')throw new TypeError('Edge source endpoint record must be a string');if(edge.toRecordId!==undefined&&recordsById.get(edge.toRecordId)?.type!=='string')throw new TypeError('Edge target endpoint record must be a string');if(edge.text!==undefined&&edge.recordId!==undefined)throw new TypeError('Edge text is only valid when no primary record is bound');}
 for(const identityRecordId of identityRecords)if(primaries.has(identityRecordId))throw new TypeError('Source identity record must remain visible as a residual row');
}
function visible(recordId:string|undefined,text:string|undefined,fallback:string,records:Map<string,FullRecord>):string {
 if(recordId!==undefined)return recordDisplay(records.get(recordId)!);
 return text===undefined?fallback:text;
}
function emit(scene:FullScene):string {
 validateScene(scene);
 const records=new Map(scene.records.map(row=>[row.id,row]));
 const approximations=[...scene.approximations];
 for(const node of scene.nodes)if(node.shape==='note')approximations.push({path:node.recordId?records.get(node.recordId)!.path:'',requested:'note shape',renderedAs:'labelled rectangle',reason:'The fallback uses a rectangle while preserving the complete authored text.'});
 for(const node of scene.nodes)if(node.width!==undefined)approximations.push({path:node.recordId?records.get(node.recordId)!.path:'',requested:'continuous magnitude extent',renderedAs:Math.round(node.width/36)+' magnitude bars',reason:'The visible bar length is quantized; the exact authored numeric value remains editable beside it.'});
 const nodesByGroup=new Map<string|undefined,FullNode[]>();for(const node of scene.nodes){const list=nodesByGroup.get(node.group)??[];list.push(node);nodesByGroup.set(node.group,list);}
 const children=new Map<string|undefined,FullGroup[]>();for(const group of scene.groups){const list=children.get(group.parent)??[];list.push(group);children.set(group.parent,list);}
 const lines=['flowchart TD',comment('scene',{profile:scene.profile,version:scene.version,kind:scene.kind,form:scene.form,approximations})];
 for(const record of scene.records)lines.push(comment('record',{id:record.id,path:record.path,name:record.name,type:record.type}));
 const nodeOrder=new Map(scene.nodes.map((node,index)=>[node.id,index]));
 const groupOrder=new Map(scene.groups.map((group,index)=>[group.id,index]));
 const emitNode=(node:FullNode)=>{
  const native=idToken('n',node.id),content=visible(node.recordId,node.text,node.id,records),label=(node.width===undefined?'':widthPrefix(node.width))+content;
  lines.push(comment('node',{id:node.id,index:nodeOrder.get(node.id),recordId:node.recordId,identityRecordId:node.identityRecordId,shape:node.shape,textPresent:node.text!==undefined,widthPresent:node.width!==undefined,width:node.width}));
  if(node.shape==='ellipse')lines.push(native+'(['+quote(label)+'])');
  else if(node.shape==='diamond')lines.push(native+'{'+quote(label)+'}');
  else if(node.shape==='note')lines.push(native+'['+quote(label)+']');
  else lines.push(native+'['+quote(label)+']');
 };
 const emittedGroups=new Set<string>();
 const emitGroup=(group:FullGroup)=>{
  if(emittedGroups.has(group.id))throw new TypeError('Group nesting contains a cycle');emittedGroups.add(group.id);
  const native=idToken('g',group.id),label=visible(group.recordId,group.text,group.id,records);
  lines.push(comment('group',{id:group.id,index:groupOrder.get(group.id),recordId:group.recordId,textPresent:group.text!==undefined}));
  lines.push('subgraph '+native+'['+quote(label)+']');
  for(const child of children.get(group.id)??[])emitGroup(child);
  for(const node of nodesByGroup.get(group.id)??[])emitNode(node);
  lines.push('end');
 };
 for(const group of children.get(undefined)??[])emitGroup(group);
 for(const node of nodesByGroup.get(undefined)??[])emitNode(node);
 const bound=new Set<string>([...scene.nodes,...scene.edges,...scene.groups].flatMap(item=>item.recordId===undefined?[]:[item.recordId]));
 const endpointRecords=new Set(scene.edges.flatMap(edge=>[edge.fromRecordId,edge.toRecordId].filter((id):id is string=>id!==undefined)));
 const residual=scene.records.filter(record=>!bound.has(record.id)&&!endpointRecords.has(record.id));
 if(residual.length){lines.push('subgraph '+idToken('g','additional-properties')+'['+quote('Additional properties')+']');const residualTokens:string[]=[];for(const record of residual){
  const native=idToken('r',record.id),display=recordDisplay(record),label=record.path+' = '+display;
  residualTokens.push(native);lines.push(comment('residual',{recordId:record.id}));lines.push(native+'['+quote(label)+']');
 }for(let index=1;index<residualTokens.length;index++)lines.push(residualTokens[index-1]+' ~~~ '+residualTokens[index]);lines.push('end');}
 const nodes=new Map(scene.nodes.map(node=>[node.id,node]));
 for(const [index,edge] of scene.edges.entries()){
  const label=visible(edge.recordId,edge.text,'',records),arrow=edge.directed===false?'---':'-->';lines.push(comment('edge',{id:edge.id,index,recordId:edge.recordId,fromRecordId:edge.fromRecordId,toRecordId:edge.toRecordId,textPresent:edge.text!==undefined}));
  lines.push(idToken('n',nodes.get(edge.from)!.id)+' '+arrow+(label===''?'':'|'+quote(label)+'|')+' '+idToken('n',nodes.get(edge.to)!.id));
 }
 return lines.join('\n')+'\n';
}

function read(source:string):FullScene {
 if(typeof source!=='string'||source.length>2_000_000)throw new TypeError('Expected bounded Mermaid full-scene source');
 const lines=source.replace(/\r\n?/g,'\n').split('\n').filter((line,index,array)=>!(index===array.length-1&&line===''));
 if(lines.shift()!=='flowchart TD')throw new TypeError('Full Mermaid reader accepts only flowchart TD');
 let sceneMeta:Meta|undefined;const records:FullRecord[]=[],nodes:FullNode[]=[],edges:FullEdge[]=[],groups:FullGroup[]=[],residuals=new Map<string,string>();
 const groupStack:string[]=[],nodeTokenMap=new Map<string,string>(),nodeOrders=new Map<string,number>(),groupOrders=new Map<string,number>(),edgeOrders=new Map<string,number>(),locators:NonNullable<FullScene['locators']>={},edgeOccurrences=new Map<string,number>(),residualOrder:string[]=[];let pending:{kind:string;data:Meta}|undefined,layoutIndex=0;
 const asString=(v:unknown,name:string)=>{if(typeof v!=='string')throw new TypeError('Invalid '+name+' in Mermaid structural comment');return v;};
 const parseMeta=(line:string)=>{
  const match=/^%% umf-full (scene|record|node|edge|group|residual) (\{.*\})$/.exec(line);
  if(!match)return undefined;let data:unknown;try{data=JSON.parse(match[2]!);}catch{throw new TypeError('Malformed Mermaid full-scene structural comment');}
  if(data===null||typeof data!=='object'||Array.isArray(data))throw new TypeError('Malformed Mermaid full-scene metadata');
  const kind=match[1]!,meta=data as Meta;
  if(kind==='scene')exactKeys(meta,['profile','version','kind','form','approximations']);
  else if(kind==='record')exactKeys(meta,['id','path','name','type']);
  else if(kind==='node')exactKeys(meta,['id','index','shape','textPresent','widthPresent'],['recordId','identityRecordId','width']);
  else if(kind==='group')exactKeys(meta,['id','index','textPresent'],['recordId']);
  else if(kind==='edge')exactKeys(meta,['id','index','textPresent'],['recordId','fromRecordId','toRecordId']);
  else exactKeys(meta,['recordId']);
  return {kind,data:meta};
 };
 const addLocator=(recordId:string,id:string,slot:string)=>{if(!records.some(record=>record.id===recordId))throw new TypeError('Native slot references missing record '+recordId);if(locators[recordId])throw new TypeError('Full record is reused across native slots');locators[recordId]=[{id,slot}];};
 const decodeLabel=(raw:string)=>unquote(raw);
 for(const line of lines){
  if(!line.trim())continue;
  const metadata=parseMeta(line);
  if(metadata){
   if(pending)throw new TypeError('Structural comment is not followed by its native statement');
   if(metadata.kind==='scene'){if(sceneMeta)throw new TypeError('Duplicate full-scene header');sceneMeta=metadata.data;continue;}
   if(metadata.kind==='record'){
    const row=metadata.data;const type=asString(row.type,'record type') as FullRecord['type'];
    if(!['string','number','boolean','null','array','object'].includes(type))throw new TypeError('Unsupported full-record type');
    const record={id:asString(row.id,'record id'),path:asString(row.path,'record path'),name:asString(row.name,'record name'),type,value:type==='string'?'""':type==='number'?'0':type==='boolean'?'false':type==='null'?'null':type==='array'?'Length: 0':'Members: []'};
    if(records.some(prior=>prior.id===record.id||prior.path===record.path))throw new TypeError('Duplicate Mermaid full-record metadata');records.push(record);
    continue;
   }
   pending=metadata;continue;
  }
  if(line.startsWith('%%'))throw new TypeError('Unsupported Mermaid comment in full-scene profile');
  const groupMatch=/^subgraph ([A-Za-z_][A-Za-z0-9_-]*)\[("(?:[^"\\]|\\.)*")\]$/.exec(line);
  if(groupMatch){
   if(!pending&&groupMatch[1]===idToken('g','additional-properties')){
    if(decodeLabel(groupMatch[2]!)!=='Additional properties'||groupStack.includes('additional-properties'))throw new TypeError('Malformed additional-properties section');
    groupStack.push('additional-properties');continue;
   }
   if(!pending||pending.kind!=='group')throw new TypeError('Subgraph has no full-scene group identity');
   const m=pending.data,id=asString(m.id,'group id'),token=idToken('g',id);if(groupMatch[1]!==token)throw new TypeError('Group token does not match its identity');
   if(!Number.isSafeInteger(m.index)||typeof m.textPresent!=='boolean')throw new TypeError('Malformed group order or text-presence metadata');
   const recordId=m.recordId===undefined?undefined:asString(m.recordId,'group record id');
   const textPresent=m.textPresent===true,raw=decodeLabel(groupMatch[2]!);const label=raw;
   if(recordId&&textPresent||!recordId&&!textPresent&&label!==id)throw new TypeError('Group label does not match its declared visible slot');
   const group:FullGroup={id,...(recordId?{recordId}:{}),...(textPresent&&!recordId?{text:label}:{}),...(groupStack.length?{parent:groupStack.at(-1)!}:{})};
   if(recordId){setRecordFromNative(records,recordId,label);addLocator(recordId,token,'label');}
   groups.push(group);if(Number.isSafeInteger(m.index))groupOrders.set(id,m.index as number);groupStack.push(id);pending=undefined;continue;
  }
  if(line==='end'){
   if(pending)throw new TypeError('Group end follows an unused structural comment');if(!groupStack.length)throw new TypeError('Unmatched Mermaid group end');if(groupStack.at(-1)==='additional-properties'&&layoutIndex!==Math.max(0,residualOrder.length-1))throw new TypeError('Additional-property layout chain is missing links');groupStack.pop();continue;
  }
  const layout=/^(r_[A-Za-z0-9_-]+) ~~~ (r_[A-Za-z0-9_-]+)$/.exec(line);
  if(layout){if(pending||groupStack.at(-1)!=='additional-properties'||layoutIndex>=residualOrder.length-1||layout[1]!==residualOrder[layoutIndex]||layout[2]!==residualOrder[layoutIndex+1])throw new TypeError('Unexpected Mermaid invisible layout link');layoutIndex++;continue;}
  const parsedEdge=/^([A-Za-z_][A-Za-z0-9_-]*) (-->|---)(?:\|("(?:[^"\\]|\\.)*")\|)? ([A-Za-z_][A-Za-z0-9_-]*)$/.exec(line);
  if(parsedEdge){
   if(groupStack.length)throw new TypeError('Full-scene edges must be declared after groups');if(!pending||pending.kind!=='edge')throw new TypeError('Edge has no full-scene identity');
   const m=pending.data,id=asString(m.id,'edge id'),from=nodeTokenMap.get(parsedEdge[1]!),to=nodeTokenMap.get(parsedEdge[4]!);
   if(!from||!to)throw new TypeError('Native edge references an undeclared node');
   if(!Number.isSafeInteger(m.index)||typeof m.textPresent!=='boolean')throw new TypeError('Malformed edge order or text-presence metadata');
   const recordId=m.recordId===undefined?undefined:asString(m.recordId,'edge record id'),fromRecordId=m.fromRecordId===undefined?undefined:asString(m.fromRecordId,'edge source record id'),toRecordId=m.toRecordId===undefined?undefined:asString(m.toRecordId,'edge target record id'),label=parsedEdge[3]===undefined?'':decodeLabel(parsedEdge[3]);
   if(recordId&&m.textPresent===true||!recordId&&m.textPresent===false&&label!=='')throw new TypeError('Edge label does not match its declared visible slot');
   if(recordId)setRecordFromNative(records,recordId,label);
   const edgeKey=parsedEdge[1]+'|'+parsedEdge[2]+'|'+parsedEdge[4],occurrence=(edgeOccurrences.get(edgeKey)??0)+1;edgeOccurrences.set(edgeKey,occurrence);const nativeEdgeId=edgeKey+'#'+occurrence;
   if(recordId)addLocator(recordId,nativeEdgeId,'label');if(fromRecordId)addLocator(fromRecordId,nativeEdgeId,'from');if(toRecordId)addLocator(toRecordId,nativeEdgeId,'to');
   edges.push({id,from,to,...(parsedEdge[2]==='---'?{directed:false}:{}),...(recordId?{recordId}:{}),...(fromRecordId?{fromRecordId}:{}),...(toRecordId?{toRecordId}:{}),...(m.textPresent===true&&!recordId?{text:label}:{})});if(Number.isSafeInteger(m.index))edgeOrders.set(id,m.index as number);pending=undefined;continue;
  }
  const nodeMatch=/^([A-Za-z_][A-Za-z0-9_-]*)(?:\(\[("(?:[^"\\]|\\.)*")\]\)|\[("(?:[^"\\]|\\.)*")\]|\{("(?:[^"\\]|\\.)*")\})$/.exec(line);
  if(nodeMatch){
   if(!pending||!['node','residual'].includes(pending.kind))throw new TypeError('Node has no full-scene identity');
   const variant=nodeMatch[2]!==undefined?'ellipse':nodeMatch[4]!==undefined?'diamond':'box',raw=nodeMatch[2]??nodeMatch[3]??nodeMatch[4]!;const label=decodeLabel(raw);
   if(pending.kind==='residual'){
    const recordId=asString(pending.data.recordId,'residual record id'),record=records.find(row=>row.id===recordId);if(!record)throw new TypeError('Residual references a missing record');
    const prefix=record.path+' = ';if(!label.startsWith(prefix))throw new TypeError('Residual label path does not match its record');if(residuals.has(recordId))throw new TypeError('Duplicate native residual row');setRecordFromNative(records,recordId,label.slice(prefix.length));residuals.set(recordId,nodeMatch[1]!);residualOrder.push(nodeMatch[1]!);addLocator(recordId,nodeMatch[1]!,'label');
   }else{
    const m=pending.data,id=asString(m.id,'node id'),token=idToken('n',id);if(nodeMatch[1]!==token)throw new TypeError('Native node token does not match its identity');
    const recordId=m.recordId===undefined?undefined:asString(m.recordId,'node record id'),shape=m.shape;
    if(!['box','ellipse','diamond','note'].includes(String(shape)))throw new TypeError('Unsupported node shape metadata');
    if(!Number.isSafeInteger(m.index)||typeof m.textPresent!=='boolean'||typeof m.widthPresent!=='boolean')throw new TypeError('Malformed node order, width or text-presence metadata');
    const expectedVariant=shape==='ellipse'?'ellipse':shape==='diamond'?'diamond':'box';if(variant!==expectedVariant)throw new TypeError('Native shape variant disagrees with its structural identity');
    const measured=stripWidth(label,m.widthPresent,m.width),shown=measured.text;
    if(recordId&&m.textPresent===true||!recordId&&m.textPresent===false&&shown!==id)throw new TypeError('Node label does not match its declared visible slot');
    const identityRecordId=m.identityRecordId===undefined?undefined:asString(m.identityRecordId,'node identity record id');
    const node:FullNode={id,...(recordId?{recordId}:{}),...(identityRecordId?{identityRecordId}:{}),...(m.textPresent===true&&!recordId?{text:shown}:{}),shape:shape as FullNode['shape'],...(groupStack.length?{group:groupStack.at(-1)!}:{}),...(measured.width===undefined?{}:{width:measured.width})};
    if(recordId){setRecordFromNative(records,recordId,shown);addLocator(recordId,token,'label');}
    nodes.push(node);if(nodeTokenMap.has(token))throw new TypeError('Duplicate native node identifier');nodeTokenMap.set(token,id);if(Number.isSafeInteger(m.index))nodeOrders.set(id,m.index as number);
   }
   pending=undefined;continue;
  }
  throw new TypeError('Unsupported Mermaid statement in full-scene profile: '+line.slice(0,80));
 }
 if(pending||groupStack.length)throw new TypeError('Incomplete Mermaid full-scene structure');
 if(!sceneMeta)throw new TypeError('Missing Mermaid full-scene metadata');
 if(records.length===0)throw new TypeError('Full scene has no record declarations');
 if(asString(sceneMeta.profile,'profile')!=='umf.visual.mermaid.full/1'||sceneMeta.version!=='1'||typeof sceneMeta.kind!=='string'||typeof sceneMeta.form!=='string'||!Array.isArray(sceneMeta.approximations))throw new TypeError('Mermaid full-scene metadata is not qualified');
 const structuralIds=new Set([...nodes.flatMap(x=>x.recordId?[x.recordId]:[]),...groups.flatMap(x=>x.recordId?[x.recordId]:[]),...edges.flatMap(x=>x.recordId?[x.recordId]:[]),...residuals.keys()]);
 for(const edge of edges){if(edge.fromRecordId)structuralIds.add(edge.fromRecordId);if(edge.toRecordId)structuralIds.add(edge.toRecordId);}
 if(structuralIds.size!==records.length)throw new TypeError('Full scene contains missing or unbound record rows');
 if(Object.keys(locators).length!==records.length||records.some(record=>!locators[record.id]||locators[record.id]!.length!==1))throw new TypeError('Every full record must have exactly one native locator');
 const contiguous=(rows:Map<string,number>,count:number)=>rows.size===count&&[...rows.values()].sort((a,b)=>a-b).every((value,index)=>value===index);
 if(!contiguous(nodeOrders,nodes.length)||!contiguous(groupOrders,groups.length)||!contiguous(edgeOrders,edges.length))throw new TypeError('Native full-scene item order is missing, duplicated or non-contiguous');
 nodes.sort((a,b)=>(nodeOrders.get(a.id)??Number.MAX_SAFE_INTEGER)-(nodeOrders.get(b.id)??Number.MAX_SAFE_INTEGER));edges.sort((a,b)=>(edgeOrders.get(a.id)??Number.MAX_SAFE_INTEGER)-(edgeOrders.get(b.id)??Number.MAX_SAFE_INTEGER));groups.sort((a,b)=>(groupOrders.get(a.id)??Number.MAX_SAFE_INTEGER)-(groupOrders.get(b.id)??Number.MAX_SAFE_INTEGER));
 const scene:FullScene={format:'mermaid',profile:asString(sceneMeta.profile,'profile'),version:sceneMeta.version as '1',kind:asString(sceneMeta.kind,'kind'),form:asString(sceneMeta.form,'form'),records,nodes,edges,groups,approximations:sceneMeta.approximations as FullScene['approximations'],locators};
 reconcileFullEndpoints(scene);validateScene(scene);return scene;
}
function setRecordFromNative(records:FullRecord[],id:string,display:string):void {
 const index=records.findIndex(row=>row.id===id);if(index<0)throw new TypeError('Native slot references missing record '+id);
 records[index]=recordFromDisplay(records[index]!,display);
}
