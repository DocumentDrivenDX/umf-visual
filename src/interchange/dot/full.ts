// SPDX-License-Identifier: MIT OR Apache-2.0
/** Bounded full-scene DOT projection. Values are always visible label text;
 * custom attributes carry only identity, ordering, and graph structure. */
import {decodeAnnotationValue, encodeAnnotationValue} from '../annotations';
import {fullRecordId, reconcileFullEndpoints, recoverFullRecords} from '../full/records';
import type {FullNativeAdapter, FullRecord, FullScene} from '../full/types';
import {quoteDotProfile, readDotProfile, type DotProfileAttribute, type DotProfileGraph, type DotProfileStatement} from './profile-syntax';

const PROFILE='umf.visual.dot.full/1';
const graphId='umf_full_scene';
const nodePrefix='umf_full_node_',edgePrefix='umf_full_edge_',groupPrefix='cluster_umf_full_group_',recordPrefix='umf_full_record_';
const recordTypes=['string','number','boolean','null','array','object'] as const;
const shapes=['box','ellipse','diamond','note'] as const;
const q=quoteDotProfile;
const hex=(value:string)=>Array.from(new TextEncoder().encode(value),byte=>byte.toString(16).padStart(2,'0')).join('');
const native=(prefix:string,id:string)=>prefix+hex(id);
function decodeNative(prefix:string,value:string):string|undefined{if(!value.startsWith(prefix))return;const encoded=value.slice(prefix.length);if(!encoded||encoded.length%2||!/^[0-9a-f]+$/.test(encoded))return;try{const decoded=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(encoded.match(/../g)!,part=>parseInt(part,16)));return native(prefix,decoded)===value?decoded:undefined;}catch{return;}}
const pointerIndex=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const ordered=(values:unknown[],name:string)=>{
 if(!Array.isArray(values)||values.length>10_000)throw new TypeError(`Invalid ${name} collection.`);
};
const attr=(key:string,value:string)=>`${key}=${q(value)}`;
const list=(target:'graph'|'node'|'edge',entries:readonly (readonly [string,string])[])=>`${target} [${entries.map(([key,value])=>attr(key,value)).join(', ')}];`;
const mapOf=(attrs:DotProfileAttribute[])=>new Map(attrs.map(item=>[item.name,item.value]));
function exactKeys(attrs:DotProfileAttribute[],keys:readonly string[]):boolean{return attrs.length===keys.length&&attrs.every(item=>keys.includes(item.name))&&new Set(attrs.map(item=>item.name)).size===attrs.length;}
function required(map:Map<string,string>,key:string):string{const value=map.get(key);if(value===undefined)throw new TypeError(`Missing ${key} DOT attribute.`);return value;}
function requiredOptional(map:Map<string,string>,key:string):string|undefined{return map.get(key);}
function bool(map:Map<string,string>,key:string):boolean{const value=required(map,key);if(value!=='true'&&value!=='false')throw new TypeError(`Invalid ${key} DOT marker.`);return value==='true';}
function safeString(value:unknown,name:string,allowEmpty=true):string{
 if(typeof value!=='string'||(!allowEmpty&&!value)||/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(value)||/[\ud800-\udfff]/u.test(value))throw new TypeError(`Invalid ${name}.`);
 return value;
}
function recordById(records:FullRecord[]):Map<string,FullRecord>{
 const out=new Map<string,FullRecord>();for(const record of records){safeString(record.id,'record id',false);safeString(record.path,'record path');safeString(record.name,'record name');if(record.id!==fullRecordId(record.path)||record.path!==''&&(!record.path.startsWith('/')||/~(?![01])/.test(record.path)))throw new TypeError('Full record id does not bind its JSON Pointer path.');if(!recordTypes.includes(record.type))throw new TypeError('Unknown full record type.');
  if(out.has(record.id))throw new TypeError('Duplicate full record id.');const decoded=decodeAnnotationValue(record.type,record.value),canonical=encodeAnnotationValue(decoded).value;if(canonical!==record.value)throw new TypeError('Non-canonical full record value wire.');out.set(record.id,record);
 }return out;
}
function checkRecordRef(recordId:string|undefined,records:Map<string,FullRecord>,used:Set<string>):FullRecord|undefined{
 if(recordId===undefined)return;
 const record=records.get(recordId);if(!record)throw new TypeError('Full scene record reference is missing.');if(used.has(recordId))throw new TypeError('A full record cannot be bound to multiple native slots.');used.add(recordId);return record;
}
function valueText(record:FullRecord):string{
 const decoded=decodeAnnotationValue(record.type,record.value);
 return decoded.kind==='string'?decoded.value:record.value;
}
function wireFromVisible(type:string,label:string):string{
 if(type==='string')return JSON.stringify(label);
 return label;
}
function recordLabel(record:FullRecord):string{return valueText(record);}
function recordMeta(record:FullRecord):[string,string][]{
 return [['umf_record_id',record.id],['umf_record_path',record.path],['umf_record_type',record.type],['umf_record_index',String((record as any).__index)]];
}
function humanRecordMeta(name:string,path?:string,text?:string,type?:string):string{
 return [`Name: ${JSON.stringify(name)}`,...(path===undefined?[]:[`Path: ${JSON.stringify(path)}`]),...(type===undefined?[]:[`Type: ${JSON.stringify(type)}`]),...(text===undefined?[]:[`Text: ${JSON.stringify(text)}`])].join('\n');
}
function parseHumanMeta(value:string):{name:string;path?:string;text?:string;type?:string}{
 const result:Record<string,string>={};if(value==='')return{name:''};
 for(const row of value.split('\n')){const at=row.indexOf(': ');if(at<0)throw new TypeError('Malformed visible DOT metadata row.');const key=row.slice(0,at);if(!['Name','Path','Type','Text'].includes(key)||Object.hasOwn(result,key))throw new TypeError('Unknown or duplicate visible DOT metadata row.');let decoded:unknown;try{decoded=JSON.parse(row.slice(at+2));}catch{throw new TypeError(`Invalid visible ${key} metadata.`);}if(typeof decoded!=='string')throw new TypeError(`Visible ${key} metadata must be a string.`);result[key]=decoded;}
 if(!Object.hasOwn(result,'Name'))throw new TypeError('Visible record name is missing.');return{name:result.Name!,...(Object.hasOwn(result,'Path')?{path:result.Path}:{}),...(Object.hasOwn(result,'Type')?{type:result.Type}:{}),...(Object.hasOwn(result,'Text')?{text:result.Text}:{})};
}
function recordFrom(attrs:DotProfileAttribute[],label:string):{record:FullRecord;index:number;name:string;text?:string}{
 const values=mapOf(attrs),id=required(values,'umf_record_id'),path=required(values,'umf_record_path'),type=required(values,'umf_record_type'),index=Number(required(values,'umf_record_index'));
 if(!recordTypes.includes(type as any)||!pointerIndex(index))throw new TypeError('Invalid record type or index.');
 const meta=parseHumanMeta(values.get('xlabel')??'');const record:FullRecord={id,path,name:meta.name,type:type as FullRecord['type'],value:wireFromVisible(type,label)};
 decodeAnnotationValue(record.type,record.value);
 if(meta.path!==undefined&&meta.path!==path)throw new TypeError('Visible record path disagrees with structural path.');
 return{record,index,name:meta.name,...(meta.text===undefined?{}:{text:meta.text})};
}
function addIndexed<T>(array:T[],index:number,item:T,label:string):void{if(!pointerIndex(index)||index>=10_000||array[index]!==undefined)throw new TypeError(`Duplicate or out-of-range ${label} index.`);array[index]=item;}
function assertContiguous(values:unknown[],label:string):void{if(values.some(item=>item===undefined))throw new TypeError(`${label} indices are not contiguous.`);}
function attrString(attrs:DotProfileAttribute[],keys:readonly string[]):Map<string,string>{if(!exactKeys(attrs,keys))throw new TypeError('Unknown, missing, or duplicate native DOT attributes.');return mapOf(attrs);}
function indexed(map:Map<string,string>,key:string):number{const value=Number(required(map,key));if(!pointerIndex(value)||String(value)!==map.get(key))throw new TypeError(`Invalid ${key} index.`);return value;}

function validateScene(scene:FullScene):{records:Map<string,FullRecord>;groups:Map<string,FullScene['groups'][number]>}{
 if(!scene||scene.format!=='dot'||scene.profile!==PROFILE||scene.version!=='1')throw new TypeError('DOT full adapter accepts only its declared profile/version.');
 safeString(scene.kind,'scene kind',false);safeString(scene.form,'scene form',false);
 for(const [name,values]of Object.entries({records:scene.records,nodes:scene.nodes,edges:scene.edges,groups:scene.groups,approximations:scene.approximations}))ordered(values,name);
 const records=recordById(scene.records),used=new Set<string>(),nodes=new Map<string,any>(),groups=new Map<string,any>(),identityBindings=new Set<string>();
 recoverFullRecords(scene.records);
 for(const node of scene.nodes){safeString(node.id,'node id',false);if(nodes.has(node.id)||!shapes.includes(node.shape))throw new TypeError('Duplicate node id or unsupported node shape.');if(node.width!==undefined&&(!Number.isFinite(node.width)||node.width<=0))throw new TypeError('Node width must be finite and positive.');if(node.text!==undefined)safeString(node.text,'node text');checkRecordRef(node.recordId,records,used);if(node.identityRecordId!==undefined){const identity=records.get(node.identityRecordId);if(!identity||identity.type!=='string'||identityBindings.has(identity.id))throw new TypeError('Invalid or repeated node identity record.');identityBindings.add(identity.id);}nodes.set(node.id,node);}
 for(const group of scene.groups){safeString(group.id,'group id',false);if(groups.has(group.id))throw new TypeError('Duplicate group id.');if(group.text!==undefined)safeString(group.text,'group text');checkRecordRef(group.recordId,records,used);groups.set(group.id,group);}
 for(const group of scene.groups){if(group.parent!==undefined&&!groups.has(group.parent))throw new TypeError('Missing group parent.');const seen=new Set([group.id]);let parent=group.parent;while(parent!==undefined){if(seen.has(parent))throw new TypeError('Group parent cycle.');seen.add(parent);parent=groups.get(parent)?.parent;}}
 for(const node of scene.nodes)if(node.group!==undefined&&!groups.has(node.group))throw new TypeError('Node references a missing group.');
 const edges=new Set<string>();for(const edge of scene.edges){safeString(edge.id,'edge id',false);if(edges.has(edge.id)||!nodes.has(edge.from)||!nodes.has(edge.to))throw new TypeError('Duplicate edge id or missing endpoint.');if(edge.text!==undefined)safeString(edge.text,'edge text');checkRecordRef(edge.recordId,records,used);for(const [end,nodeId]of [['from',edge.from],['to',edge.to]] as const){const id=edge[end==='from'?'fromRecordId':'toRecordId'];if(id===undefined)continue;const endpoint=records.get(id),identity=nodes.get(nodeId)?.identityRecordId?records.get(nodes.get(nodeId).identityRecordId):undefined;if(!endpoint||endpoint.type!=='string'||!identity||endpoint.value!==identity.value)throw new TypeError(`Invalid ${end} endpoint record binding.`);if(used.has(id))throw new TypeError('Endpoint record is reused by another native slot.');used.add(id);}edges.add(edge.id);}
 for(const id of identityBindings)if(used.has(id))throw new TypeError('A node identity record must remain an independent visible residual.');
 for(const approximation of scene.approximations){safeString(approximation.path,'approximation path');safeString(approximation.requested,'approximation requested value');safeString(approximation.renderedAs,'approximation native value');safeString(approximation.reason,'approximation reason');}
 if(used.size>records.size)throw new TypeError('Record binding inconsistency.');return{records,groups};
}

/** Emit a complete bounded DOT scene. Bound record values live only on their
 * native owner; unbound records appear once in the Additional properties box. */
function emit(scene:FullScene):string{
 const {records,groups}=validateScene(scene);const recordIndexes=new Map(scene.records.map((record,index)=>[record.id,index]));
 const lines=[`digraph ${q(graphId)} {`];
 const header:[string,string][]=[['umf_full_profile',PROFILE],['umf_format',scene.format],['umf_version',scene.version],['umf_scene_profile',scene.profile],['umf_kind',scene.kind],['umf_form',scene.form],['umf_nodes_count',String(scene.nodes.length)],['umf_edges_count',String(scene.edges.length)],['umf_groups_count',String(scene.groups.length)],['umf_records_count',String(scene.records.length)],['umf_approximations_count',String(scene.approximations.length)],['rankdir','TB']];
 scene.approximations.forEach((item,index)=>header.push([`umf_approx_${index}_path`,item.path],[`umf_approx_${index}_requested`,item.requested],[`umf_approx_${index}_rendered_as`,item.renderedAs],[`umf_approx_${index}_reason`,item.reason]));
 lines.push(list('graph',header));
 const childGroups=new Map<string|undefined,typeof scene.groups>();for(const group of scene.groups){const key=group.parent;childGroups.set(key,[...(childGroups.get(key)??[]),group]);}
 const directNodes=new Map<string|undefined,typeof scene.nodes>();for(const node of scene.nodes){const key=node.group;directNodes.set(key,[...(directNodes.get(key)??[]),node]);}
 const recordAttrs=(id:string|undefined):[string,string][]=>{if(id===undefined)return [['umf_has_record','false']];const index=recordIndexes.get(id)!,record=records.get(id)!;return [['umf_has_record','true'],['umf_record_id',record.id],['umf_record_path',record.path],['umf_record_type',record.type],['umf_record_index',String(index)]];};
 const nodeLines=(node:FullScene['nodes'][number],index:number):string=>{
  const bound=node.recordId===undefined?undefined:records.get(node.recordId),label=bound?recordLabel(bound):node.text??'',meta=bound?humanRecordMeta(bound.name,undefined,node.text):'',identity=node.identityRecordId===undefined?undefined:records.get(node.identityRecordId),attrs:[string,string][]=[['umf_id',node.id],['umf_index',String(index)],['umf_group',node.group??''],['umf_has_text',String(node.text!==undefined)],...recordAttrs(node.recordId),...(identity?[['umf_identity_record_id',identity.id] as [string,string]]:[]),['shape',node.shape],...(node.width===undefined?[]:[['width',String(node.width/96)] as [string,string],['umf_width_px',String(node.width)] as [string,string]]),['label',label],...(meta? [['xlabel',meta] as [string,string]]:[])];
  return `${q(native(nodePrefix,node.id))} [${attrs.map(([key,value])=>attr(key,value)).join(', ')}];`;
 };
 const groupAttrs=(group:FullScene['groups'][number],index:number,parent?:string):[string,string][]=>{
  const bound=group.recordId===undefined?undefined:records.get(group.recordId),label=bound?recordLabel(bound):group.text??'',meta=bound?humanRecordMeta(bound.name,undefined,group.text):'';
  return [['umf_id',group.id],['umf_index',String(index)],['umf_parent',parent??''],['umf_has_text',String(group.text!==undefined)],...recordAttrs(group.recordId),['label',label],...(meta? [['xlabel',meta] as [string,string]]:[])];
 };
 const emitGroup=(group:FullScene['groups'][number],depth:number):void=>{
  const index=scene.groups.indexOf(group),ident=native(groupPrefix,group.id),pad='  '.repeat(depth+1);
  lines.push(`${pad}subgraph ${q(ident)} {`,`${pad}  ${list('graph',groupAttrs(group,index,group.parent))}`);
  for(const node of directNodes.get(group.id)??[])lines.push(`${pad}  ${nodeLines(node,scene.nodes.indexOf(node))}`);
  for(const child of childGroups.get(group.id)??[])emitGroup(child,depth+1);
  lines.push(`${pad}}`);
 };
 for(const node of directNodes.get(undefined)??[])lines.push(nodeLines(node,scene.nodes.indexOf(node)));
 for(const group of childGroups.get(undefined)??[])emitGroup(group,0);
 for(const [index,edge]of scene.edges.entries()){
  const bound=edge.recordId===undefined?undefined:records.get(edge.recordId),label=bound?recordLabel(bound):edge.text??'',meta=bound?humanRecordMeta(bound.name,undefined,edge.text):'',entries:[string,string][]=[['id',native(edgePrefix,edge.id)],['umf_id',edge.id],['umf_index',String(index)],['umf_has_text',String(edge.text!==undefined)],...(edge.directed===undefined?[]:[['dir',edge.directed?'forward':'none'] as [string,string]]),...recordAttrs(edge.recordId),...(['from','to'] as const).flatMap(end=>{const id=edge[end==='from'?'fromRecordId':'toRecordId'];if(id===undefined)return[];const record=records.get(id)!;return [[`umf_${end}_record_id`,record.id],[`umf_${end}_record_path`,record.path],[`umf_${end}_record_name`,record.name],[`umf_${end}_record_type`,record.type],[`umf_${end}_record_index`,String(recordIndexes.get(record.id))]] as [string,string][];}),['label',label],...(meta? [['xlabel',meta] as [string,string]]:[])];
  lines.push(`${q(native(nodePrefix,edge.from))} -> ${q(native(nodePrefix,edge.to))} [${entries.map(([key,value])=>attr(key,value)).join(', ')}];`);
 }
 const endpointRecordIds=new Set(scene.edges.flatMap(edge=>[edge.fromRecordId,edge.toRecordId].filter((id):id is string=>id!==undefined)));
 const unbound=scene.records.map((record,index)=>({record,index})).filter(({record})=>!endpointRecordIds.has(record.id)&&!scene.nodes.some(node=>node.recordId===record.id)&&!scene.edges.some(edge=>edge.recordId===record.id)&&!scene.groups.some(group=>group.recordId===record.id));
 if(unbound.length){lines.push('  subgraph "cluster_umf_full_additional" {','    graph [label="Additional properties", style="dashed"];');for(const {record,index}of unbound){const entries:[string,string][]=[['umf_element','additional-record'],['umf_record_id',record.id],['umf_record_path',record.path],['umf_record_type',record.type],['umf_record_index',String(index)],['shape','note'],['label',recordLabel(record)],['xlabel',humanRecordMeta(record.name,record.path,undefined,record.type)]];lines.push(`    ${q(native(recordPrefix,record.id))} [${entries.map(([key,value])=>attr(key,value)).join(', ')}];`);}
  for(let i=0;i<unbound.length-1;i++)lines.push(`    ${q(native(recordPrefix,unbound[i]!.record.id))} -> ${q(native(recordPrefix,unbound[i+1]!.record.id))} [${attr('umf_layout','additional-order')}, ${attr('style','invis')}, ${attr('weight','100')}, ${attr('minlen','1')}, ${attr('dir','none')}];`);
  lines.push('  }');}
 lines.push('}');const source=lines.join('\n')+'\n';if(new TextEncoder().encode(source).length>262_144)throw new RangeError('DOT full scene exceeds 256 KiB.');return source;
}

function rootHeader(graph:DotProfileGraph):{attrs:Map<string,string>;content:DotProfileStatement[]}{
 if(graph.id!==graphId)throw new TypeError('Unexpected DOT full scene graph identity.');const first=graph.statements[0];if(first?.kind!=='attributes'||first.target!=='graph')throw new TypeError('DOT full scene declaration must be first.');
 const base=['umf_full_profile','umf_format','umf_version','umf_scene_profile','umf_kind','umf_form','umf_nodes_count','umf_edges_count','umf_groups_count','umf_records_count','umf_approximations_count','rankdir'];
 const dynamic=first.attributes.map(a=>a.name).filter(name=>name.startsWith('umf_approx_'));
 const count=Number(mapOf(first.attributes).get('umf_approximations_count'));if(!Number.isSafeInteger(count)||count<0||count>10_000)throw new TypeError('Invalid approximation count.');
 const expected=[...base,...Array.from({length:count},(_,i)=>[`umf_approx_${i}_path`,`umf_approx_${i}_requested`,`umf_approx_${i}_rendered_as`,`umf_approx_${i}_reason`]).flat()];
 if(dynamic.length!==count*4||!exactKeys(first.attributes,expected))throw new TypeError('Invalid full scene header or approximation declarations.');
 const attrs=mapOf(first.attributes);if(attrs.get('umf_full_profile')!==PROFILE||attrs.get('umf_format')!=='dot'||attrs.get('umf_version')!=='1'||attrs.get('umf_scene_profile')!==PROFILE||attrs.get('rankdir')!=='TB')throw new TypeError('Unqualified DOT full scene profile or layout.');
 return{attrs,content:graph.statements.slice(1)};
}
function indexedCount(attrs:Map<string,string>,name:string):number{const value=Number(required(attrs,`umf_${name}_count`));if(!pointerIndex(value)||value>10_000||String(value)!==attrs.get(`umf_${name}_count`))throw new TypeError(`Invalid ${name} count.`);return value;}
function readRecordBound(attrs:DotProfileAttribute[],label:string,hasRecord:boolean,hasText:boolean):{record?:FullRecord;recordIndex?:number;text?:string}{
 if(!hasRecord){if(attrs.some(a=>a.name.startsWith('umf_record_')))throw new TypeError('Unbound native object carries a record descriptor.');return{...(hasText?{text:label}:{})};}
 const map=mapOf(attrs),id=required(map,'umf_record_id'),path=required(map,'umf_record_path'),type=required(map,'umf_record_type'),index=Number(required(map,'umf_record_index'));
 if(!recordTypes.includes(type as any)||!pointerIndex(index))throw new TypeError('Invalid bound full record descriptor.');
 const meta=parseHumanMeta(required(map,'xlabel'));if(meta.path!==undefined||meta.type!==undefined||hasText!== (meta.text!==undefined))throw new TypeError('Text presence marker disagrees with visible text.');
 const record:FullRecord={id,path,name:meta.name,type:type as FullRecord['type'],value:wireFromVisible(type,label)};decodeAnnotationValue(record.type,record.value);
 return{record,recordIndex:index,...(meta.text===undefined?{}:{text:meta.text})};
}
function addRecord(rows:(FullRecord|undefined)[],record:FullRecord,index:number):void{addIndexed(rows,index,record,'record');}

/** Parse only output from this profile; foreign defaults, shapes and syntax refuse. */
function read(source:string):FullScene{
 const graph=readDotProfile(source),{attrs:header,content}=rootHeader(graph),nodeCount=indexedCount(header,'nodes'),edgeCount=indexedCount(header,'edges'),groupCount=indexedCount(header,'groups'),recordCount=indexedCount(header,'records'),approxCount=indexedCount(header,'approximations');
 const kind=required(header,'umf_kind'),form=required(header,'umf_form');safeString(kind,'scene kind',false);safeString(form,'scene form',false);
 const nodes:(FullScene['nodes'][number]|undefined)[]=[],edges:(FullScene['edges'][number]|undefined)[]=[],groups:(FullScene['groups'][number]|undefined)[]=[],records:(FullRecord|undefined)[]=[],approx=[] as FullScene['approximations'];
 for(let i=0;i<approxCount;i++)approx.push({path:required(header,`umf_approx_${i}_path`),requested:required(header,`umf_approx_${i}_requested`),renderedAs:required(header,`umf_approx_${i}_rendered_as`),reason:required(header,`umf_approx_${i}_reason`)});
 const seenNative=new Set<string>(),pendingEdges:{statement:Extract<DotProfileStatement,{kind:'edge'}>;parent?:string}[]=[],locators:NonNullable<FullScene['locators']>={},residualNodes:{index:number;nativeId:string}[]=[],additionalOrderEdges:Extract<DotProfileStatement,{kind:'edge'}>[]=[];let residualSeen=false;
 const addLocator=(recordId:string,nativeId:string,slot:string):void=>{
  if(!recordId||!nativeId||!slot)throw new TypeError('Invalid native record locator.');
  const entries=locators[recordId]??=[];
  if(entries.some(item=>item.id===nativeId&&item.slot===slot))throw new TypeError('Duplicate native record locator.');
  entries.push({id:nativeId,slot});
 };
 const parseNode=(statement:Extract<DotProfileStatement,{kind:'node'}>,parent?:string,residual=false):void=>{
  const a=statement.attributes;
  if(residual){const keys=['umf_element','umf_record_id','umf_record_path','umf_record_type','umf_record_index','shape','label','xlabel'];const m=attrString(a,keys);if(m.get('umf_element')!=='additional-record'||m.get('shape')!=='note'||statement.id!==native(recordPrefix,required(m,'umf_record_id')))throw new TypeError('Invalid residual record note.');const parsed=recordFrom(a,required(m,'label')),path=required(m,'umf_record_path'),type=required(m,'umf_record_type'),meta=parseHumanMeta(required(m,'xlabel'));if(parsed.record.path!==path||parsed.record.type!==type||parsed.index!==Number(required(m,'umf_record_index'))||String(parsed.index)!==m.get('umf_record_index')||parsed.name!==meta.name||meta.path!==path||meta.type!==type||meta.text!==undefined)throw new TypeError('Residual note descriptor mismatch.');addRecord(records,parsed.record,parsed.index);addLocator(parsed.record.id,statement.id,'label');residualNodes.push({index:parsed.index,nativeId:statement.id});return;}
  const fixed=['umf_id','umf_index','umf_group','umf_has_text','umf_has_record','shape','label'];const names=a.map(x=>x.name),hasX=names.includes('xlabel'),hasWidth=names.includes('width'),hasWidthPx=names.includes('umf_width_px'),recordId=names.includes('umf_record_id'),identityId=names.includes('umf_identity_record_id');const allowed=[...fixed,...(hasWidth?['width']:[]),...(hasWidthPx?['umf_width_px']:[]),...(recordId?['umf_record_id','umf_record_path','umf_record_type','umf_record_index']:[]),...(identityId?['umf_identity_record_id']:[]),...(hasX?['xlabel']:[])];const m=attrString(a,allowed);
  const id=required(m,'umf_id'),index=indexed(m,'umf_index'),group=required(m,'umf_group')||undefined,shape=required(m,'shape'),label=required(m,'label'),hasText=bool(m,'umf_has_text'),hasRecord=bool(m,'umf_has_record');
  if(!shapes.includes(shape as any)||statement.id!==native(nodePrefix,id)||group!==parent||seenNative.has(statement.id)||hasX!==hasRecord)throw new TypeError('Native node identity, shape or group containment mismatch.');seenNative.add(statement.id);
  let width:number|undefined;if(hasWidth!==hasWidthPx)throw new TypeError('Native DOT width and UMF pixel width must appear together.');if(hasWidth){const nativeWidth=Number(required(m,'width')),pixelWidth=Number(required(m,'umf_width_px'));if(!Number.isFinite(nativeWidth)||nativeWidth<=0||String(nativeWidth)!==m.get('width')||!Number.isFinite(pixelWidth)||pixelWidth<=0||String(pixelWidth)!==m.get('umf_width_px')||Math.abs(nativeWidth-pixelWidth/96)>Math.max(1e-12,Math.abs(pixelWidth/96)*1e-12))throw new TypeError('Native DOT width does not match its exact UMF pixel width.');width=pixelWidth;}
  let recordRef:string|undefined,text:string|undefined;
  if(hasRecord){const parsed=readRecordBound(a,label,true,hasText);recordRef=parsed.record!.id;addRecord(records,parsed.record!,parsed.recordIndex!);addLocator(recordRef,statement.id,'label');text=parsed.text;}
  else if(hasText)text=label;else if(label!=='')throw new TypeError('Unmarked native node label.');
  const identityRecordId=requiredOptional(m,'umf_identity_record_id');
  addIndexed(nodes,index,{id,...(recordRef?{recordId:recordRef}:{}),...(identityRecordId?{identityRecordId}:{}),...(text!==undefined?{text}:{}),shape:shape as any,...(group?{group}:{}),...(width===undefined?{}:{width})},'node');
 };
 const parseGroup=(statement:Extract<DotProfileStatement,{kind:'subgraph'}>,parent?:string):void=>{
  const id=decodeNative(groupPrefix,statement.id);if(id===undefined||seenNative.has(statement.id))throw new TypeError('Invalid native group identity.');seenNative.add(statement.id);
  const headers=statement.statements.filter((child):child is Extract<DotProfileStatement,{kind:'attributes'}>=>child.kind==='attributes');if(headers.length!==1||headers[0]!.target!=='graph')throw new TypeError('Group requires exactly one graph descriptor.');
  const a=headers[0]!.attributes,names=a.map(x=>x.name),hasX=names.includes('xlabel'),hasRecord=names.includes('umf_record_id'),hasPath=names.includes('umf_record_path');const fixed=['umf_id','umf_index','umf_parent','umf_has_text','umf_has_record','label'];const allowed=[...fixed,...(hasRecord?['umf_record_id','umf_record_path','umf_record_type','umf_record_index']:[]),...(hasX?['xlabel']:[])];const m=attrString(a,allowed),label=required(m,'label'),groupId=required(m,'umf_id'),index=indexed(m,'umf_index'),declaredParent=required(m,'umf_parent')||undefined,hasText=bool(m,'umf_has_text'),bound=bool(m,'umf_has_record');
  if(groupId!==id||declaredParent!==parent||hasX!==hasRecord)throw new TypeError('Group identity or parent descriptor disagrees with native nesting.');
  let recordId:string|undefined,text:string|undefined;
  if(bound){const parsed=readRecordBound(a,label,true,hasText);recordId=parsed.record!.id;addRecord(records,parsed.record!,parsed.recordIndex!);addLocator(recordId,statement.id,'label');text=parsed.text;}
  else if(hasText)text=label;else if(label!=='')throw new TypeError('Unmarked native group label.');
  addIndexed(groups,index,{id,...(recordId?{recordId}:{}),...(text!==undefined?{text}:{}),...(parent?{parent}:{})},'group');
  for(const child of statement.statements){if(child===headers[0])continue;if(child.kind==='node')parseNode(child,id);else if(child.kind==='subgraph')parseGroup(child,id);else throw new TypeError('Unsupported statement inside native group.');}
 };
 for(const statement of content){
  if(statement.kind==='attributes'||statement.kind==='assignment')throw new TypeError('Unexpected graph defaults or assignment.');
  if(statement.kind==='node')parseNode(statement);
  else if(statement.kind==='edge')pendingEdges.push({statement});
  else if(statement.kind==='subgraph'){
   if(statement.id==='cluster_umf_full_additional'){
    if(residualSeen)throw new TypeError('Duplicate Additional properties box.');residualSeen=true;const headers=statement.statements.filter((s):s is Extract<DotProfileStatement,{kind:'attributes'}>=>s.kind==='attributes');if(headers.length!==1||headers[0]!.target!=='graph'||!exactKeys(headers[0]!.attributes,['label','style'])||mapOf(headers[0]!.attributes).get('label')!=='Additional properties'||mapOf(headers[0]!.attributes).get('style')!=='dashed')throw new TypeError('Invalid Additional properties box.');for(const child of statement.statements){if(child===headers[0])continue;if(child.kind==='node')parseNode(child,undefined,true);else if(child.kind==='edge')additionalOrderEdges.push(child);else throw new TypeError('Unexpected Additional properties statement.');}continue;
   }
   parseGroup(statement);
  }
 }
 residualNodes.sort((a,b)=>a.index-b.index);
 if(additionalOrderEdges.length!==Math.max(0,residualNodes.length-1))throw new TypeError('Additional properties ordering chain is incomplete.');
 for(let i=0;i<additionalOrderEdges.length;i++){
  const edge=additionalOrderEdges[i]!,expectedFrom=residualNodes[i]!.nativeId,expectedTo=residualNodes[i+1]!.nativeId;
  if(edge.from!==expectedFrom||edge.to!==expectedTo||!exactKeys(edge.attributes,['umf_layout','style','weight','minlen','dir'])||mapOf(edge.attributes).get('umf_layout')!=='additional-order'||mapOf(edge.attributes).get('style')!=='invis'||mapOf(edge.attributes).get('weight')!=='100'||mapOf(edge.attributes).get('minlen')!=='1'||mapOf(edge.attributes).get('dir')!=='none')throw new TypeError('Additional properties ordering chain is not the qualified layout-only sequence.');
 }
 assertContiguous(nodes,'node');assertContiguous(groups,'group');
 const nodeByNative=new Map(nodes.map(node=>[native(nodePrefix,node!.id),node!]));
 for(const {statement} of pendingEdges){const a=statement.attributes,names=a.map(x=>x.name),hasX=names.includes('xlabel'),hasRecord=names.includes('umf_record_id'),hasDir=names.includes('dir'),fromBound=names.includes('umf_from_record_id'),toBound=names.includes('umf_to_record_id');const fixed=['id','umf_id','umf_index','umf_has_text','umf_has_record','label'];const endpointKeys=(end:'from'|'to',present:boolean)=>present?[`umf_${end}_record_id`,`umf_${end}_record_path`,`umf_${end}_record_name`,`umf_${end}_record_type`,`umf_${end}_record_index`]:[];const allowed=[...fixed,...(hasDir?['dir']:[]),...(hasRecord?['umf_record_id','umf_record_path','umf_record_type','umf_record_index']:[]),...endpointKeys('from',fromBound),...endpointKeys('to',toBound),...(hasX?['xlabel']:[])];const m=attrString(a,allowed),id=required(m,'umf_id'),index=indexed(m,'umf_index'),nativeId=required(m,'id'),label=required(m,'label'),hasText=bool(m,'umf_has_text'),hasRecordMarker=bool(m,'umf_has_record'),dir=requiredOptional(m,'dir');
  const sourceNode=nodeByNative.get(statement.from),targetNode=nodeByNative.get(statement.to);
  if(nativeId!==native(edgePrefix,id)||!sourceNode||!targetNode||fromBound!==names.includes('umf_from_record_path')||toBound!==names.includes('umf_to_record_path'))throw new TypeError('Native edge endpoints or identity disagree with its descriptors.');
  if(hasX!==hasRecordMarker)throw new TypeError('Edge text metadata presence disagrees with record binding.');let recordId:string|undefined,text:string|undefined;if(hasRecordMarker){const parsed=readRecordBound(a,label,true,hasText);recordId=parsed.record!.id;addRecord(records,parsed.record!,parsed.recordIndex!);text=parsed.text;}else if(hasText)text=label;else if(label!=='')throw new TypeError('Unmarked native edge label.');
  if(hasRecordMarker&&recordId)addLocator(recordId,nativeId,'label');
  const endpointRecordId=(end:'from'|'to',present:boolean):string|undefined=>{if(!present)return;const recordId=required(m,`umf_${end}_record_id`),path=required(m,`umf_${end}_record_path`),name=required(m,`umf_${end}_record_name`),type=required(m,`umf_${end}_record_type`),recordIndex=Number(required(m,`umf_${end}_record_index`));if(type!=='string'||!pointerIndex(recordIndex))throw new TypeError('Invalid endpoint record descriptor.');addRecord(records,{id:recordId,path,name,type,value:''},recordIndex);addLocator(recordId,nativeId,end);return recordId;};
  if(dir!==undefined&&dir!=='forward'&&dir!=='none')throw new TypeError('Unsupported directedness value.');
  const fromRecordId=endpointRecordId('from',fromBound),toRecordId=endpointRecordId('to',toBound);
  addIndexed(edges,index,{id,from:sourceNode.id,to:targetNode.id,...(dir===undefined?{}:{directed:dir==='forward'}),...(recordId?{recordId}:{}),...(fromRecordId?{fromRecordId}:{}),...(toRecordId?{toRecordId}:{}),...(text!==undefined?{text}:{})},'edge');
 }
 assertContiguous(edges,'edge');assertContiguous(records,'record');if(records.length!==recordCount||nodes.length!==nodeCount||edges.length!==edgeCount||groups.length!==groupCount||approx.length!==approxCount)throw new TypeError('Declared DOT full scene counts do not match native content.');
 for(const record of records as FullRecord[])if(!locators[record.id]?.length)throw new TypeError(`Full record ${record.id} has no actual native locator.`);
 const scene:FullScene={format:'dot',profile:required(header,'umf_scene_profile'),version:'1',kind,form,records:records as FullRecord[],nodes:nodes as FullScene['nodes'],edges:edges as FullScene['edges'],groups:groups as FullScene['groups'],approximations:approx,locators};reconcileFullEndpoints(scene);validateScene(scene);return scene;
}

export const dotFullAdapter:FullNativeAdapter={format:'dot',emit,read};
