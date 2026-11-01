// SPDX-License-Identifier: MIT OR Apache-2.0
import {readLiniProfile,quoteLiniProfile,type LiniProfileNode,type LiniProfileToken} from './profile-syntax';
import type {FullNativeAdapter,FullScene,FullRecord} from '../full/types';
import {fullRecordId,reconcileFullEndpoints,recoverFullRecords} from '../full/records';

/** Lini 1.1.0 full-scene projection. Native labels and link labels are the
 * authoritative slots; structural properties carry only identity/type/path. */
export const liniFullAdapter:FullNativeAdapter={format:'lini',emit:emitLiniFull,read:readLiniFull};

const PROFILE='umf.visual.lini.full/1';
const quote=quoteLiniProfile;
const idEncode=(value:string)=>'x'+[...new TextEncoder().encode(value)].map(byte=>byte.toString(16).padStart(2,'0')).join('')+'00';
const idDecode=(value:string)=>{if(!/^x(?:[0-9a-f]{2})*00$/u.test(value))throw new TypeError('Invalid Lini full identity');const hex=value.slice(1,-2),bytes=new Uint8Array(hex.length/2);for(let i=0;i<bytes.length;i++)bytes[i]=Number.parseInt(hex.slice(i*2,i*2+2),16);return new TextDecoder('utf-8',{fatal:true}).decode(bytes);};
const tag=(prefix:string,id:string,metadata?:unknown)=>prefix+idEncode(id)+(metadata===undefined?'':'z'+[...new TextEncoder().encode(JSON.stringify(metadata))].map(byte=>byte.toString(16).padStart(2,'0')).join(''));
const untag=(value:string,prefix:string):{id:string;metadata?:unknown}=>{if(!value.startsWith(prefix))throw new TypeError('Unexpected Lini full identity');const rest=value.slice(prefix.length),split=rest.indexOf('z'),encoded=split<0?rest:rest.slice(0,split),id=idDecode(encoded);if(split<0)return{id};const bytesHex=rest.slice(split+1);if(!/^(?:[0-9a-f]{2})+$/u.test(bytesHex))throw new TypeError('Malformed Lini full identity metadata');const bytes=new Uint8Array(bytesHex.length/2);for(let i=0;i<bytes.length;i++)bytes[i]=Number.parseInt(bytesHex.slice(i*2,i*2+2),16);return{id,metadata:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))};};
const block=(nativeId:string,label:string,width?:number)=>`|block#${nativeId}| ${quote(label)}${width===undefined?'':` { width: ${String(width)}; }`}`;
const magnitudePrefix=(width:number)=>{
 if(!Number.isFinite(width)||width<36||width>396)throw new TypeError('Lini full magnitude width must be from 36 to 396 CSS pixels');
 return '▮'.repeat(Math.round(width/36))+' | ';
};
const stripMagnitudePrefix=(label:string,width:number)=>{
 const prefix=magnitudePrefix(width);if(!label.startsWith(prefix))throw new TypeError('Lini full magnitude glyph count does not match native width');return label.slice(prefix.length);
};
const group=(nativeId:string,label:string,children:string[],properties='')=>`|group#${nativeId}| ${quote(label)}${properties?` { ${properties} }`:''} [\n${children.map(line=>'  '+line.replaceAll('\n','\n  ')).join('\n')}\n]`;
const validType=(value:string):value is FullRecord['type']=>['string','number','boolean','null','array','object'].includes(value);
function assertScene(scene:FullScene):void {
 if(scene.format!=='lini'||scene.profile!==PROFILE||scene.version!=='1')throw new TypeError('Lini full scene profile mismatch');
 if(!Array.isArray(scene.records)||!Array.isArray(scene.nodes)||!Array.isArray(scene.edges)||!Array.isArray(scene.groups)||!Array.isArray(scene.approximations))throw new TypeError('Malformed Lini full scene');
 const recordIds=new Set<string>(),recordPaths=new Set<string>();
 for(const record of scene.records){if(!record||typeof record.id!=='string'||typeof record.path!=='string'||record.id!==fullRecordId(record.path)||typeof record.name!=='string'||!validType(record.type)||typeof record.value!=='string'||recordIds.has(record.id)||recordPaths.has(record.path))throw new TypeError('Malformed or duplicate Lini full record');recordIds.add(record.id);recordPaths.add(record.path);}
 const ids=new Set<string>();
 for(const item of [...scene.nodes,...scene.edges,...scene.groups]){if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id))throw new TypeError('Malformed or duplicate Lini full element');ids.add(item.id);if(item.recordId&&!recordIds.has(item.recordId))throw new TypeError('Unknown Lini full record binding');}
 for(const node of scene.nodes)if(node.identityRecordId&&!recordIds.has(node.identityRecordId))throw new TypeError('Unknown Lini full identity record binding');
 for(const node of scene.nodes){if(!['box','ellipse','diamond','note'].includes(node.shape)||node.width!==undefined&&(!Number.isFinite(node.width)||node.width<36||node.width>396))throw new TypeError('Malformed Lini full node');}
 const nodeIds=new Set(scene.nodes.map(item=>item.id));for(const edge of scene.edges){if(!nodeIds.has(edge.from)||!nodeIds.has(edge.to))throw new TypeError('Lini full edge endpoint is missing');for(const id of [edge.fromRecordId,edge.toRecordId])if(id&&!recordIds.has(id))throw new TypeError('Unknown Lini full endpoint record binding');}
 for(const groupItem of scene.groups)if(groupItem.parent&&!scene.groups.some(item=>item.id===groupItem.parent))throw new TypeError('Lini full group parent is missing');
 for(const item of scene.groups){const seen=new Set([item.id]);let parent=item.parent;while(parent){if(seen.has(parent))throw new TypeError('Lini full group containment cycle');seen.add(parent);parent=scene.groups.find(group=>group.id===parent)?.parent;}}
 for(const node of scene.nodes)if(node.group&&!scene.groups.some(item=>item.id===node.group))throw new TypeError('Lini full node group is missing');
 for(const approximation of scene.approximations)if(!approximation||typeof approximation.path!=='string'||typeof approximation.requested!=='string'||typeof approximation.renderedAs!=='string'||typeof approximation.reason!=='string')throw new TypeError('Malformed Lini full approximation');
}
function visibleRecord(record:FullRecord):string{return `${record.path} — ${record.name} [${record.type}]: ${record.value}`;}
function emitLiniFull(scene:FullScene):string {
 assertScene(scene);
 const records=new Map(scene.records.map(item=>[item.id,item]));
 const groups=new Map(scene.groups.map(item=>[item.id,tag('g',item.id,{hasText:item.text!==undefined,...(item.recordId&&records.has(item.recordId)?{record:{path:records.get(item.recordId)!.path,type:records.get(item.recordId)!.type}}:{})})]));
 const consumed=new Set<string>(),lines:string[]=[];
 const recordMetadata=(record:FullRecord)=>({path:record.path,type:record.type});
 const nodeNativeId=(node:FullScene['nodes'][number])=>{const record=node.recordId?records.get(node.recordId):undefined;return tag('n',node.id,{hasText:node.text!==undefined,...(record?{record:recordMetadata(record)}:{}),...(node.identityRecordId?{identityPath:records.get(node.identityRecordId)?.path}:{})});};
 const nodeLine=(node:FullScene['nodes'][number])=>{
  const record=node.recordId?records.get(node.recordId):undefined;if(record)consumed.add(record.id);
  const value=record?(record.type==='string'?parseWireString(record.value):record.value):(node.text??node.id),label=node.width===undefined?value:magnitudePrefix(node.width)+value;
  return block(nodeNativeId(node),label,node.width);
 };
 const edgeLine=(edge:FullScene['edges'][number])=>{
  const record=edge.recordId?records.get(edge.recordId):undefined;if(record)consumed.add(record.id);
  const label=record?(record.type==='string'?parseWireString(record.value):record.value):(edge.text??'');
  const from=scene.nodes.find(node=>node.id===edge.from),to=scene.nodes.find(node=>node.id===edge.to);if(!from||!to)throw new TypeError('Lini full edge endpoint is missing');
  const endpoint=(node:typeof from)=>{if(!node)throw new TypeError('Lini full edge endpoint is missing');const ancestors:string[]=[];let parent=node.group;while(parent){const item=scene.groups.find(candidate=>candidate.id===parent);if(!item)throw new TypeError('Lini full edge group endpoint is missing');ancestors.unshift(groups.get(parent)!);parent=item.parent;}return [...ancestors,nodeNativeId(node)].join('.');};
  return `${endpoint(from)} ${edge.directed===false?'-':'->'} ${endpoint(to)}${label===''?'':' '+quote(label)}`;
 };
 const renderGroup=(item:FullScene['groups'][number]):string=>{
  const record=item.recordId?records.get(item.recordId):undefined;if(record)consumed.add(record.id);
  const label=record?(record.type==='string'?parseWireString(record.value):record.value):(item.text??item.id);
  const children:string[]=[];
  for(const child of scene.groups.filter(candidate=>candidate.parent===item.id))children.push(renderGroup(child));
  for(const node of scene.nodes.filter(candidate=>candidate.group===item.id))children.push(nodeLine(node));
  return group(groups.get(item.id)!,label,children,'layout: grid; columns: repeat(2); gap: 80; clearance: 16; padding: 16; routing: straight;');
 };
 const roots=scene.groups.filter(item=>item.parent===undefined);
 for(const item of roots)lines.push(renderGroup(item));
 for(const node of scene.nodes.filter(item=>item.group===undefined))lines.push(nodeLine(node));
 for(const edge of scene.edges)lines.push(edgeLine(edge));
 const readableLayout='layout: grid; columns: repeat(1); gap: 8; padding: 16;';
 if(scene.edges.length){const rows=scene.edges.map((edge,index)=>{const descriptor=(id:string|undefined)=>{const item=id?records.get(id):undefined;if(!item)return undefined;return{id:item.id,path:item.path,name:item.name,type:item.type};};const metadata={id:edge.id,hasText:edge.text!==undefined,directedSet:edge.directed!==undefined,...(edge.recordId?{record:descriptor(edge.recordId)}:{}),...(edge.fromRecordId?{fromRecord:descriptor(edge.fromRecordId)}:{}),...(edge.toRecordId?{toRecord:descriptor(edge.toRecordId)}:{})};return block(tag('e',String(index),metadata),edgeIdentityLabel(metadata));});lines.push(group('umf_full_edge_identities','Edge identities and source slots',rows,readableLayout));}
 const endpointRecordIds=new Set(scene.edges.flatMap(edge=>[edge.fromRecordId,edge.toRecordId].filter((id):id is string=>id!==undefined)));
 const residual=scene.records.filter(record=>!consumed.has(record.id)&&!endpointRecordIds.has(record.id));
 if(residual.length){
  const rows=residual.map(record=>block('r'+idEncode(record.path),visibleRecord(record)));
  lines.push(group('umf_full_additional','Additional properties',rows,readableLayout));
 }
 if(scene.approximations.length){
  const rows=scene.approximations.map((item,index)=>block(tag('a',String(index),item),`${item.path}: ${item.requested} rendered as ${item.renderedAs} — ${item.reason}`));
  lines.push(group('umf_full_approximations','Visual approximations',rows,readableLayout));
 }
 return group('umf_full_scene',`Full view: ${scene.kind} / ${scene.form}`,lines,'layout: grid; columns: repeat(3); gap: 200; clearance: 16; padding: 32; routing: straight;')+'\n';
}
function parseWireString(wire:string):string {let value:unknown;try{value=JSON.parse(wire);}catch{throw new TypeError('Invalid string record wire value');}if(typeof value!=='string')throw new TypeError('String record has non-string wire value');return value;}
function oneProperty(node:LiniProfileNode,name:string):LiniProfileToken[]|undefined{return node.properties.filter(item=>item.name===name).length===1?node.properties.find(item=>item.name===name)?.value:undefined;}
function stringProperty(node:LiniProfileNode,name:string,required=true):string|undefined {const tokens=oneProperty(node,name);if(!tokens){if(required)throw new TypeError(`Missing or duplicate ${name} metadata`);return;}if(tokens.length!==1||tokens[0]!.kind!=='string')throw new TypeError(`Malformed ${name} metadata`);return tokens[0]!.value;}
function wordProperty(node:LiniProfileNode,name:string,required=true):string|undefined {const tokens=oneProperty(node,name);if(!tokens){if(required)throw new TypeError(`Missing or duplicate ${name} metadata`);return;}if(tokens.length!==1||tokens[0]!.kind!=='word')throw new TypeError(`Malformed ${name} metadata`);return tokens[0]!.value;}
function readLiniFull(source:string):FullScene {
 let quoted=false,escaped=false;for(let i=0;i<source.length;i++){const ch=source[i]!;if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;}else if(ch==='"')quoted=true;else if(source.startsWith('//',i))throw new TypeError('Lini full reader refuses unrecognized comments');}
 const roots=readLiniProfile(source,{allowDeepEndpoints:true});if(roots.length!==1||roots[0]!.type!=='group'||roots[0]!.id!=='umf_full_scene')throw new TypeError('Expected one Lini full scene group');
 const root=roots[0]!;if(root.label===undefined)throw new TypeError('Unsupported Lini full scene header');const rootProperties=new Map(root.properties.map(property=>[property.name,property.value]));const expectedProperties=new Set(['layout','columns','gap','clearance','padding','routing']);if(rootProperties.size!==expectedProperties.size||[...rootProperties.keys()].some(key=>!expectedProperties.has(key)))throw new TypeError('Unsupported Lini full root layout properties');const propertyIs=(name:string,kinds:string[])=>{const value=rootProperties.get(name);return !!value&&value.map(token=>token.kind+':'+token.value).join('|')===kinds.join('|');};if(!propertyIs('layout',['word:grid'])||!propertyIs('columns',['word:repeat','symbol:(','number:3','symbol:)'])||!propertyIs('gap',['number:200'])||!propertyIs('clearance',['number:16'])||!propertyIs('padding',['number:32'])||!propertyIs('routing',['word:straight']))throw new TypeError('Unsupported Lini full root layout configuration');const title=/^Full view: ([^/]+) \/ (.+)$/u.exec(root.label);if(!title)throw new TypeError('Malformed Lini full scene title');const kind=title[1]!.trim(),form=title[2]!.trim();
 const scene:FullScene={format:'lini',profile:PROFILE,version:'1',kind,form,records:[],nodes:[],edges:[],groups:[],approximations:[]};
 const records=new Map<string,FullRecord>(),nodeNative=new Map<string,string>(),edgeMetadata:Array<{metadata:unknown;label:string}>=[],edgeNative:Array<{id:string;from:string;to:string}>=[];scene.locators=Object.create(null) as NonNullable<FullScene['locators']>;
 const elementPath=(parent:string|undefined,type:string,id:string)=>['umf_full_scene',...(parent?parent.split('.').slice(1).map(value=>'group#'+value):[]),type+'#'+id].join('/');
 const addRecord=(path:string,type:string,value:string,locator?:{id:string;slot:string}):FullRecord=>{if(!validType(type))throw new TypeError('Unsupported Lini full record type');const name=path===''?'document':decodePointerName(path),record:FullRecord={id:fullRecordId(path),path,name,type,value};if(records.has(record.id)||scene.records.some(item=>item.path===path))throw new TypeError('Duplicate Lini full record identity/path');records.set(record.id,record);scene.records.push(record);if(locator)scene.locators![record.id]=[locator];return record;};
 const readResidual=(node:LiniProfileNode,parent:string):void=>{if(node.type!=='block'||node.children.length)throw new TypeError('Malformed Lini full residual row');const path=untag(node.id,'r').id,label=node.label;if(label===undefined||!label.startsWith(path+' — '))throw new TypeError('Malformed visible Lini full residual row');const tail=label.slice((path+' — ').length),name=path===''?'document':decodePointerName(path);if(!tail.startsWith(name+' '))throw new TypeError('Lini full residual name does not match its path');const marker=/^\[(string|number|boolean|null|array|object)\]: /u.exec(tail.slice(name.length+1));if(!marker)throw new TypeError('Malformed visible Lini full residual type/value');const type=marker[1]!,value=tail.slice(name.length+1+marker[0].length);addRecord(path,type,value,{id:`${parent}/block#${node.id}`,slot:'label'});};
 const checkProps=(node:LiniProfileNode,allowed:string[])=>{for(const property of node.properties)if(!allowed.includes(property.name))throw new TypeError(`Unknown Lini full property ${property.name}`);};
 const readElement=(node:LiniProfileNode,parent?:string):void=>{
  if(node.type==='link'){
   checkProps(node,['from','operator','to','label']);
   const from=node.properties.find(item=>item.name==='from')?.value[0]?.value,to=node.properties.find(item=>item.name==='to')?.value[0]?.value;
   if(!from||!to)throw new TypeError('Malformed Lini full link');
   const fromId=nodeNative.get(from),toId=nodeNative.get(to);if(!fromId||!toId)throw new TypeError('Lini full link endpoint is undeclared');
   const op=node.properties.find(item=>item.name==='operator')?.value;if(!op||op.length!==1||op[0]!.kind!=='symbol'||!['->','-'].includes(op[0]!.value))throw new TypeError('Malformed Lini full link direction');scene.edges.push({id:'',from:fromId,to:toId,directed:op[0]!.value==='->',...(node.label===undefined?{}:{text:node.label})});edgeNative.push({id:node.id,from,to});return;
  }
  if(node.type==='group'&&['umf_full_additional','umf_full_approximations','umf_full_edge_identities'].includes(node.id)){
   const props=new Map(node.properties.map(property=>[property.name,property.value])),propertyIs=(name:string,kinds:string[])=>{const value=props.get(name);return !!value&&value.map(token=>token.kind+':'+token.value).join('|')===kinds.join('|');};if(props.size!==4||!propertyIs('layout',['word:grid'])||!propertyIs('columns',['word:repeat','symbol:(','number:1','symbol:)'])||!propertyIs('gap',['number:8'])||!propertyIs('padding',['number:16']))throw new TypeError('Unsupported Lini full readable section layout');const section=node.id==='umf_full_additional'?'additional':node.id==='umf_full_approximations'?'approximations':'edge-identities';
   const expectedLabel=section==='additional'?'Additional properties':section==='approximations'?'Visual approximations':'Edge identities and source slots';
   if(node.label!==expectedLabel)throw new TypeError('Unexpected Lini full readable section label');
   for(const row of node.children){if(row.type!=='block'||row.children.length||row.properties.length)throw new TypeError('Malformed Lini full readable row');const rowLabel=row.label;if(rowLabel===undefined)throw new TypeError('Missing visible Lini full row');
    if(section==='additional')readResidual(row,elementPath(parent,'group',node.id));
    else if(section==='approximations'){const tagged=untag(row.id,'a').metadata as {path?:unknown;requested?:unknown;renderedAs?:unknown;reason?:unknown};if(!tagged||Object.keys(tagged).some(key=>!['path','requested','renderedAs','reason'].includes(key))||typeof tagged.path!=='string'||typeof tagged.requested!=='string'||typeof tagged.renderedAs!=='string'||typeof tagged.reason!=='string'||rowLabel!==`${tagged.path}: ${tagged.requested} rendered as ${tagged.renderedAs} — ${tagged.reason}`)throw new TypeError('Malformed or edited Lini full approximation');scene.approximations.push({path:tagged.path,requested:tagged.requested,renderedAs:tagged.renderedAs,reason:tagged.reason});}
    else {const tagged=untag(row.id,'e');if(!tagged.metadata||typeof tagged.metadata!=='object'||Array.isArray(tagged.metadata)||Number(tagged.id)!==edgeMetadata.length)throw new TypeError('Malformed Lini full edge identity row');edgeMetadata.push({metadata:tagged.metadata,label:rowLabel});}
   }return;
  }
  if(node.type==='group'&&node.id!=='umf_full_scene'){
   const props=new Map(node.properties.map(property=>[property.name,property.value])),propertyIs=(name:string,kinds:string[])=>{const value=props.get(name);return !!value&&value.map(token=>token.kind+':'+token.value).join('|')===kinds.join('|');};if(props.size!==6||!propertyIs('layout',['word:grid'])||!propertyIs('columns',['word:repeat','symbol:(','number:2','symbol:)'])||!propertyIs('gap',['number:80'])||!propertyIs('clearance',['number:16'])||!propertyIs('padding',['number:16'])||!propertyIs('routing',['word:straight']))throw new TypeError('Unsupported Lini full group layout');const tagged=untag(node.id,'g'),metadata=tagged.metadata as {hasText?:unknown;record?:{path?:unknown;type?:unknown}}|undefined;if(!metadata||typeof metadata.hasText!=='boolean'||Object.keys(metadata).some(key=>!['hasText','record'].includes(key)))throw new TypeError('Malformed Lini full group metadata');let recordId:string|undefined;
   const locatorPath=elementPath(parent,'group',node.id);
   if(metadata.record){const item=metadata.record;if(!item||Object.keys(item).some(key=>!['path','type'].includes(key))||typeof item.path!=='string'||typeof item.type!=='string')throw new TypeError('Malformed Lini full group record binding');recordId=addRecord(item.path,item.type,nativeWire(item.type,node.label??''),{id:locatorPath,slot:'label'}).id;}
   scene.groups.push({id:tagged.id,...(recordId?{recordId}:metadata.hasText&&node.label!==undefined?{text:node.label}:{}),...(parent?{parent:untag(parent.slice(parent.lastIndexOf('.')+1),'g').id}:{})});
   for(const child of node.children)readElement(child,`${parent??root.id}.${node.id}`);return;
  }
  if(node.type==='block'){
   if(node.children.length)throw new TypeError('Lini full blocks cannot contain children');
   if(node.properties.some(item=>item.name!=='width'))throw new TypeError('Unknown Lini full block property');const tagged=untag(node.id,'n'),metadata=tagged.metadata as {hasText?:unknown;record?:{path?:unknown;type?:unknown};identityPath?:unknown}|undefined;if(!metadata||typeof metadata.hasText!=='boolean'||Object.keys(metadata).some(key=>!['hasText','record','identityPath'].includes(key)))throw new TypeError('Malformed Lini full node identity metadata');let recordId:string|undefined;
   const locatorPath=elementPath(parent,'block',node.id);
   const widthProperties=node.properties.filter(item=>item.name==='width');if(widthProperties.length>1)throw new TypeError('Duplicate Lini full width property');const widthTokens=widthProperties.length?widthProperties[0]!.value:undefined,width=widthTokens?widthTokens.length===1&&widthTokens[0]!.kind==='number'?Number(widthTokens[0]!.value):NaN:undefined;if(width!==undefined&&(!Number.isFinite(width)||width<36||width>396))throw new TypeError('Malformed or out-of-range Lini full width');
   const label=node.label??'',visible=width===undefined?label:stripMagnitudePrefix(label,width);
   if(metadata.record){const item=metadata.record;if(!item||Object.keys(item).some(key=>!['path','type'].includes(key))||typeof item.path!=='string'||typeof item.type!=='string')throw new TypeError('Malformed Lini full node record binding');recordId=addRecord(item.path,item.type,nativeWire(item.type,visible),{id:locatorPath,slot:'label'}).id;}
   if(metadata.identityPath!==undefined&&typeof metadata.identityPath!=='string')throw new TypeError('Malformed Lini full identity record path');const identityRecordId=typeof metadata.identityPath==='string'?fullRecordId(metadata.identityPath):undefined;scene.nodes.push({id:tagged.id,...(recordId?{recordId}:metadata.hasText&&node.label!==undefined?{text:visible}:{}),...(identityRecordId?{identityRecordId}:{}),shape:'box',...(parent?{group:untag(parent.slice(parent.lastIndexOf('.')+1),'g').id}:{}),...(width===undefined?{}:{width})});nodeNative.set(node.id,tagged.id);nodeNative.set(`${parent??root.id}.${node.id}`,tagged.id);if(parent)nodeNative.set(`${parent.replace(/^umf_full_scene\./u,'')}.${node.id}`,tagged.id);return;
  }
  throw new TypeError(`Unknown Lini full element ${node.type}`);
 };
 for(const child of root.children)readElement(child);
 if(edgeMetadata.length!==scene.edges.length)throw new TypeError('Lini full edge identity rows do not match native links');
 const addEdgeRecord=(value:unknown,wire:string):string=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('Malformed Lini full edge record descriptor');const descriptor=value as {id?:unknown;path?:unknown;name?:unknown;type?:unknown};if(typeof descriptor.id!=='string'||typeof descriptor.path!=='string'||typeof descriptor.name!=='string'||typeof descriptor.type!=='string'||!validType(descriptor.type)||descriptor.id!==fullRecordId(descriptor.path)||descriptor.name!==(descriptor.path===''?'document':decodePointerName(descriptor.path)))throw new TypeError('Malformed Lini full edge record descriptor');const prior=records.get(descriptor.id);if(prior){if(prior.path!==descriptor.path||prior.name!==descriptor.name||prior.type!==descriptor.type)throw new TypeError('Conflicting Lini full edge record descriptor');prior.value=descriptor.type==='string'?JSON.stringify(wire):wire;}else {const record:FullRecord={id:descriptor.id,path:descriptor.path,name:descriptor.name,type:descriptor.type,value:descriptor.type==='string'?JSON.stringify(wire):wire};records.set(record.id,record);scene.records.push(record);}return descriptor.id;};
 for(const[index,entry]of edgeMetadata.entries()){
  const metadata=entry.metadata as {id?:unknown;hasText?:unknown;directedSet?:unknown;record?:unknown;fromRecord?:unknown;toRecord?:unknown};if(Object.keys(metadata).some(key=>!['id','hasText','directedSet','record','fromRecord','toRecord'].includes(key))||typeof metadata.id!=='string'||typeof metadata.hasText!=='boolean'||typeof metadata.directedSet!=='boolean'||entry.label!==edgeIdentityLabel(metadata))throw new TypeError('Lini full edge identity metadata does not match its visible row');
  const edge=scene.edges[index]!;edge.id=metadata.id;if(!metadata.directedSet)delete edge.directed;
  if(metadata.record)edge.recordId=addEdgeRecord(metadata.record,edge.text??'');
  if(metadata.fromRecord)edge.fromRecordId=addEdgeRecord(metadata.fromRecord,'');
  if(metadata.toRecord)edge.toRecordId=addEdgeRecord(metadata.toRecord,'');
  if(edge.recordId)delete edge.text;else if(!metadata.hasText)delete edge.text;else if(edge.text===undefined)edge.text='';
  const native=edgeNative[index]!,address=`umf_full_scene/link[${index}]`;if(edge.recordId)scene.locators![edge.recordId]=[{id:address,slot:'label'}];
  for(const [key,slot]of [['fromRecord','from'],['toRecord','to']] as const){const recordId=edge[key==='fromRecord'?'fromRecordId':'toRecordId'];if(recordId)scene.locators![recordId]=[{id:address,slot}];}
 }
 for(const node of scene.nodes)if(node.group&&!scene.groups.some(item=>item.id===node.group))throw new TypeError('Lini full node group is undeclared');
 reconcileFullEndpoints(scene);assertScene(scene);recoverFullRecords(scene.records);return scene;
}

function decodePointerName(path:string):string{const value=path.slice(path.lastIndexOf('/')+1);return value.replace(/~1/g,'/').replace(/~0/g,'~');}
function nativeWire(type:string,label:string):string{return type==='string'?JSON.stringify(label):label;}
function edgeIdentityLabel(metadata:{id?:unknown;record?:unknown;fromRecord?:unknown;toRecord?:unknown}):string{const descriptor=(value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)?(value as {path?:unknown}).path:undefined;return `Edge ${String(metadata.id)}${metadata.record?`; label record ${descriptor(metadata.record)}`:''}${metadata.fromRecord?`; from record ${descriptor(metadata.fromRecord)}`:''}${metadata.toRecord?`; to record ${descriptor(metadata.toRecord)}`:''}`;}
