// SPDX-License-Identifier: MIT OR Apache-2.0
/** Explicit Graphviz DOT profile for relational entity cards and references. */
import type {Visual} from '../../extensions/visual';
import {VISUAL_PATH, identityMapping, interchangeDiagnostic} from '../shared';
import type {IdentityMapping, InterchangeDiagnostic} from '../types';
import {quoteDotProfile, type DotProfileAttribute, type DotProfileGraph, type DotProfileStatement} from './profile-syntax';

export interface DotEntityLocator {id:string;slot:string;}
export interface DotEntityCoverage {path:string;aspect:'value'|'presence'|'identity'|'members'|'order';representation:'native-concept';native:DotEntityLocator[];}
export interface DotEntitiesSerializeResult {statements:string[];identityMap:IdentityMapping[];coverage:DotEntityCoverage[];diagnostics:InterchangeDiagnostic[];}
export interface DotEntitiesParseResult extends DotEntitiesSerializeResult {visual?:Pick<Visual,'nodes'|'structure'>;}

const p=(suffix:string)=>VISUAL_PATH+suffix;
const nodePrefix='umf_entity_node_',referencePrefix='umf_entity_ref_',fieldPrefix='umf_field_';
const cardinalities=['zero-or-one','exactly-one','zero-or-many','one-or-many'] as const;
type Cardinality=typeof cardinalities[number];
const diag=(code:string,path:string,message:string,severity:'warning'|'error'='error',loss=false):InterchangeDiagnostic=>interchangeDiagnostic(code,path,message,{severity,loss});
const q=(value:string)=>quoteDotProfile(value);
const utf8Hex=(value:string)=>Array.from(new TextEncoder().encode(value),byte=>byte.toString(16).padStart(2,'0')).join('');
function encode(prefix:string,value:string):string{return prefix+utf8Hex(value);}
function decode(prefix:string,value:string):string|undefined{
 if(!value.startsWith(prefix))return;const hex=value.slice(prefix.length);if(!hex||hex.length%2||!/^[0-9a-f]+$/.test(hex))return;
 try{const result=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(hex.match(/../g)!,byte=>parseInt(byte,16)));return encode(prefix,result)===value?result:undefined;}catch{return;}
}
function ptr(value:string):string{return value.replace(/~/g,'~0').replace(/\//g,'~1');}
function addCoverage(rows:DotEntityCoverage[],path:string,aspect:DotEntityCoverage['aspect'],id:string,slot:string):void{rows.push({path,aspect,representation:'native-concept',native:[{id,slot}]});}
function xml(value:string):string{if(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(value)||/[\ud800-\udfff]/u.test(value))throw new Error('Unsupported control or unpaired surrogate in HTML text');return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');}
function unxml(value:string):string{
 let result='',at=0;const pattern=/&(#x[0-9A-Fa-f]+|#\d+|amp|lt|gt|quot|apos);/g;let match:RegExpExecArray|null;
 while((match=pattern.exec(value))){const prefix=value.slice(at,match.index);if(prefix.includes('&'))throw new Error('Unknown or unterminated XML entity');result+=prefix;const entity=match[1]!;
  if(entity==='amp')result+='&';else if(entity==='lt')result+='<';else if(entity==='gt')result+='>';else if(entity==='quot')result+='"';else if(entity==='apos')result+="'";else{const point=entity.startsWith('#x')?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10);if(!Number.isInteger(point)||point<0||point>0x10ffff||point>=0xd800&&point<=0xdfff||point<0x20&&point!==9&&point!==10&&point!==13)throw new Error('Invalid XML character reference');result+=String.fromCodePoint(point);}
  at=pattern.lastIndex;
 }
 const suffix=value.slice(at);if(suffix.includes('&'))throw new Error('Unknown or unterminated XML entity');return result+suffix;
}
const shown=(value:unknown)=>JSON.stringify(value);
const cell=(value:unknown)=>'<TD>'+xml(shown(value))+'</TD>';
const optionalCell=(present:boolean,value:unknown)=>present?cell(value):'<TD>—</TD>';
function cardLabel(node:any,entity:any):string{
 const title=xml(shown(node.label)),detail=node.detail===undefined?'<BR/><FONT POINT-SIZE="10">No detail</FONT>':'<BR/><FONT POINT-SIZE="10">Detail: '+xml(shown(node.detail))+'</FONT>';
 const headings='<TR><TD><B>Field</B></TD><TD><B>Type</B></TD><TD><B>Keys</B></TD><TD><B>Nullable</B></TD></TR>';
 return '<TABLE BORDER="1" CELLBORDER="1" CELLSPACING="0" CELLPADDING="5"><TR><TD COLSPAN="4"><B>'+title+'</B>'+detail+'</TD></TR>'+headings+entity.fields.map((field:any)=>{
  const port=encode(fieldPrefix,field.name),name=xml(shown(field.name)),type=optionalCell(Object.hasOwn(field,'type'),field.type),keys=optionalCell(Object.hasOwn(field,'keys'),field.keys),nullable=field.nullable===undefined?'<TD>—</TD>':'<TD>'+(field.nullable?'Yes':'No')+'</TD>';
  return '<TR><TD PORT="'+port+'">'+name+'</TD>'+type+keys+nullable+'</TR>';
 }).join('')+'</TABLE>';
}
function htmlAttr(name:string,html:string):string{return name+'=<'+html+'>';}
function quotedAttr(name:string,value:string):string{return name+'='+q(value);}
function attrs(target:'graph'|'node'|'edge',values:string[]):string{return target+' ['+values.join(', ')+'];';}
function pointerPath(base:string,index:number):string{return base+'/'+index;}
function arrow(cardinality:Cardinality|undefined):string{return cardinality===undefined?'none':({'zero-or-one':'odottee','exactly-one':'tee','zero-or-many':'odotcrow','one-or-many':'teecrow'} as const)[cardinality];}

function validate(visual:Visual):InterchangeDiagnostic[]{
 const v=visual as any,d:InterchangeDiagnostic[]=[],safeText=(value:unknown,path:string)=>{if(typeof value==='string')try{xml(shown(value));}catch{d.push(diag('DOT_ENTITIES_TEXT',path,'Text contains characters that the native HTML label cannot represent safely.'));}};
 if(v.kind!=='structure'||v.form!=='entities')d.push(diag('DOT_ENTITIES_FORM',p('/form'),'DOT entities profile accepts only structure/entities.'));
 for(const key of Object.keys(v))if(!['id','kind','form','title','question','takeaway','audience','source','omissions','groups','nodes','edges','steps','sequence','structure','state','timeline','comparison','metric'].includes(key))d.push(diag('DOT_ENTITIES_UNKNOWN',p('/'+key),'Unknown visual content is outside this native profile.'));
 if(!Array.isArray(v.nodes)||v.nodes.length===0)d.push(diag('DOT_ENTITIES_NODES',p('/nodes'),'Entities require at least one node.'));
 if(!Array.isArray(v.structure?.entities))d.push(diag('DOT_ENTITIES_BLOCK',p('/structure/entities'),'An entities structure block is required.'));
 for(const key of ['groups','edges','steps','sequence','state','timeline','comparison','metric'])if(Object.hasOwn(v,key))d.push(diag('DOT_ENTITIES_UNSUPPORTED',p('/'+key),'This field is outside the native entities profile.'));
 const nodes=Array.isArray(v.nodes)?v.nodes:[],entities=Array.isArray(v.structure?.entities)?v.structure.entities:[],references=Array.isArray(v.structure?.references)?v.structure.references:[];
 if(nodes.length>200||entities.length>200||references.length>1000)d.push(diag('DOT_ENTITIES_SIZE',p(''),'Entities profile limits are 200 nodes/entities and 1,000 references.'));
 const nodeById=new Map<string,any>(),entityByNode=new Map<string,any>();
 for(const [i,node]of nodes.entries()){
  if(!node||typeof node.id!=='string'||!node.id||nodeById.has(node.id))d.push(diag('DOT_ENTITIES_NODE_ID',p('/nodes/'+i+'/id'),'Node IDs must be nonempty and unique.'));else nodeById.set(node.id,node);
  if(typeof node?.label!=='string')d.push(diag('DOT_ENTITIES_NODE_LABEL',p('/nodes/'+i+'/label'),'Every entity node requires a visible exact label.'));
  safeText(node?.label,p('/nodes/'+i+'/label'));
  if(node?.detail!==undefined&&typeof node.detail!=='string')d.push(diag('DOT_ENTITIES_NODE_DETAIL',p('/nodes/'+i+'/detail'),'Node detail must be a string.'));
  safeText(node?.detail,p('/nodes/'+i+'/detail'));
  for(const key of ['group','parent','layer'])if(Object.hasOwn(node??{},key))d.push(diag('DOT_ENTITIES_NODE_STRUCTURE',p('/nodes/'+i+'/'+key),'Node grouping, containment, and layer fields are outside this profile.'));
  for(const key of Object.keys(node??{}))if(!['id','label','detail','role','status','emphasis','evidence','group','parent','layer'].includes(key))d.push(diag('DOT_ENTITIES_NODE_UNKNOWN',p('/nodes/'+i+'/'+key),'Unknown node content is outside this native profile.'));
 }
 const allIds=new Set(nodeById.keys());
 for(const [i,entity]of entities.entries()){
  const path=p('/structure/entities/'+i);
  if(typeof entity?.node!=='string'||!nodeById.has(entity.node))d.push(diag('DOT_ENTITIES_ENTITY_NODE',path+'/node','Entity must identify a declared node.'));
  if(entityByNode.has(entity?.node))d.push(diag('DOT_ENTITIES_DUPLICATE_ENTITY',path+'/node','A node may have only one native entity card.'));else if(typeof entity?.node==='string')entityByNode.set(entity.node,entity);
  if(!Array.isArray(entity?.fields))d.push(diag('DOT_ENTITIES_FIELDS',path+'/fields','Entity fields must be an array.'));
  const names=new Set<string>();
  for(const [j,field]of (Array.isArray(entity?.fields)?entity.fields:[]).entries()){
   const fpath=path+'/fields/'+j;
   if(typeof field?.name!=='string'||!field.name||names.has(field.name))d.push(diag('DOT_ENTITIES_FIELD_NAME',fpath+'/name','Field names must be nonempty and unique within an entity.'));else names.add(field.name);
   safeText(field?.name,fpath+'/name');
   if(field?.type!==undefined&&typeof field.type!=='string')d.push(diag('DOT_ENTITIES_FIELD_TYPE',fpath+'/type','Field type must be a string when present.'));
   safeText(field?.type,fpath+'/type');
   if(field?.keys!==undefined&&(!Array.isArray(field.keys)||field.keys.some((key:string)=>!['pk','fk','uk'].includes(key))||new Set(field.keys).size!==field.keys.length))d.push(diag('DOT_ENTITIES_FIELD_KEYS',fpath+'/keys','Field keys must be a unique ordered subset of pk, fk, and uk.'));
   if(field?.nullable!==undefined&&typeof field.nullable!=='boolean')d.push(diag('DOT_ENTITIES_FIELD_NULLABLE',fpath+'/nullable','Field nullable must be a boolean when present.'));
   for(const key of ['id','fieldId','multiplicity','default','constraints','description'])if(Object.hasOwn(field??{},key))d.push(diag('DOT_ENTITIES_FIELD_V11',fpath+'/'+key,'This field constraint or identity is outside the released 1.0 DOT entities subset.'));
   for(const key of Object.keys(field??{}))if(!['name','type','keys','nullable'].includes(key))d.push(diag('DOT_ENTITIES_FIELD_UNKNOWN',fpath+'/'+key,'Unqualified entity field content is refused.'));
  }
  for(const key of Object.keys(entity??{}))if(!['node','fields'].includes(key))d.push(diag('DOT_ENTITIES_ENTITY_UNKNOWN',path+'/'+key,'Unqualified entity content is refused.'));
 }
 if(entities.length!==nodes.length||nodes.some((node:any)=>!entityByNode.has(node?.id)))d.push(diag('DOT_ENTITIES_CARD_PRESENCE',p('/structure/entities'),'Every node must have exactly one explicit entity card.'));
 for(const [i,reference]of references.entries()){
  const path=p('/structure/references/'+i);if(!reference||typeof reference.id!=='string'||!reference.id||allIds.has(reference.id))d.push(diag('DOT_ENTITIES_REFERENCE_ID',path+'/id','Reference IDs must be nonempty and globally unique with node IDs.'));else allIds.add(reference.id);
  for(const side of ['from','to'] as const){const endpoint=reference?.[side];if(typeof endpoint?.node!=='string'||!nodeById.has(endpoint.node))d.push(diag('DOT_ENTITIES_ENDPOINT',path+'/'+side,'Reference endpoint must identify a declared entity node.'));else if(endpoint.field!==undefined&&!entityByNode.get(endpoint.node)?.fields?.some((field:any)=>field.name===endpoint.field))d.push(diag('DOT_ENTITIES_ENDPOINT_FIELD',path+'/'+side+'/field','Reference endpoint field must identify a declared field.'));for(const key of Object.keys(endpoint??{}))if(!['node','field'].includes(key))d.push(diag('DOT_ENTITIES_ENDPOINT_UNKNOWN',path+'/'+side+'/'+key,'Unqualified endpoint content is refused.'));}
  if(reference?.label!==undefined&&typeof reference.label!=='string')d.push(diag('DOT_ENTITIES_REFERENCE_LABEL',path+'/label','Reference label must be a string when present.'));
  safeText(reference?.label,path+'/label');
  for(const side of ['fromCardinality','toCardinality'] as const)if(reference?.[side]!==undefined&&!cardinalities.includes(reference[side]))d.push(diag('DOT_ENTITIES_CARDINALITY',path+'/'+side,'Reference cardinality is outside the visual vocabulary.'));
  for(const key of Object.keys(reference??{}))if(!['id','from','to','label','fromCardinality','toCardinality'].includes(key))d.push(diag('DOT_ENTITIES_REFERENCE_UNKNOWN',path+'/'+key,'Unqualified reference content is refused.'));
 }
 for(const key of Object.keys(v.structure??{}))if(!['entities','references'].includes(key))d.push(diag('DOT_ENTITIES_STRUCTURE_UNKNOWN',p('/structure/'+key),'This structure content is outside the entities profile.'));
 for(const key of ['question','title','takeaway','audience','source','omissions'])if(Object.hasOwn(v,key))d.push(diag('DOT_ENTITIES_ANNOTATION_REQUIRED',p('/'+key),'This application or provenance field requires the readable annotation carrier.','warning',true));
 for(const [i,node]of nodes.entries())for(const key of ['role','status','emphasis','evidence'])if(Object.hasOwn(node??{},key))d.push(diag('DOT_ENTITIES_ANNOTATION_REQUIRED',p('/nodes/'+i+'/'+key),'This application or provenance field requires the readable annotation carrier.','warning',true));
 return d;
}

/** Emit native HTML table cells, field ports and crow-foot relationship endpoints. */
export function serializeDotEntities(visual:Visual):DotEntitiesSerializeResult{
 const diagnostics=validate(visual),coverage:DotEntityCoverage[]=[],identityMap:IdentityMapping[]=[];
 if(diagnostics.some(item=>item.severity==='error'))return{statements:[],identityMap,coverage,diagnostics};
 const v=visual as any,nodes=v.nodes as any[],entities=v.structure.entities as any[],references=(v.structure.references??[]) as any[],nodesById=new Map(nodes.map((n:any,i:number)=>[n.id,{node:n,index:i}])),entitiesByNode=new Map(entities.map((e:any,i:number)=>[e.node,{entity:e,index:i}]));
 const statements=[attrs('graph',[quotedAttr('umf_kind','structure'),quotedAttr('umf_form','entities'),quotedAttr('umf_references_present',v.structure.references===undefined?'false':'true'),quotedAttr('rankdir','LR'),quotedAttr('ranksep','2.5'),quotedAttr('splines','polyline')])];
 addCoverage(coverage,p('/structure/references'),v.structure.references===undefined?'presence':'members','umf_visual','graph-attribute:umf_references_present');
 for(const [i,node]of nodes.entries()){
  const entityInfo=entitiesByNode.get(node.id)!,entity=entityInfo.entity,nodeNative=encode(nodePrefix,node.id),entityPath=p('/structure/entities/'+entityInfo.index),nodePath=p('/nodes/'+i);
  const html=cardLabel(node,entity);
  statements.push(q(nodeNative)+' ['+[htmlAttr('label',html),quotedAttr('shape','plain'),quotedAttr('margin','0'),quotedAttr('umf_path',nodePath),quotedAttr('umf_entity_path',entityPath)].join(', ')+'];');
  identityMap.push(identityMapping('node',nodeNative,node.id,nodePath),identityMapping('node',nodeNative,node.id,entityPath));
  addCoverage(coverage,nodePath+'/id','identity',nodeNative,'native-node-id');addCoverage(coverage,nodePath+'/label','value',nodeNative,'visible-card-label');
  addCoverage(coverage,nodePath+'/detail',node.detail===undefined?'presence':'value',nodeNative,node.detail===undefined?'card-detail-absent':'visible-card-detail');
  addCoverage(coverage,entityPath+'/node','identity',nodeNative,'entity-card-owner');
  addCoverage(coverage,entityPath+'/fields','members',nodeNative,'ordered-table-rows');
  for(const [j,field]of entity.fields.entries()){
   const fieldPath=entityPath+'/fields/'+j,port=encode(fieldPrefix,field.name);
   identityMap.push(identityMapping('field',nodeNative+':'+port,node.id,fieldPath));
   for(const [key,slot] of [['name','port-cell-name'],['type','table-type-cell'],['keys','table-key-cell'],['nullable','table-nullability-cell']] as const)addCoverage(coverage,fieldPath+'/'+key,Object.hasOwn(field,key)?'value':'presence',nodeNative,slot);
  }
 }
 for(const [i,reference]of references.entries()){
  const path=p('/structure/references/'+i),native=encode(referencePrefix,reference.id),from=nodesById.get(reference.from.node)!,to=nodesById.get(reference.to.node)!,fromNative=encode(nodePrefix,reference.from.node),toNative=encode(nodePrefix,reference.to.node);
  const fromPort=reference.from.field===undefined?'':':'+encode(fieldPrefix,reference.from.field),toPort=reference.to.field===undefined?'':':'+encode(fieldPrefix,reference.to.field);
  const tail=arrow(reference.fromCardinality),head=arrow(reference.toCardinality),tailLabel=reference.fromCardinality??'',headLabel=reference.toCardinality??'';
  const edgeAttrs=[quotedAttr('id',native),quotedAttr('umf_path',path),quotedAttr('dir','both'),quotedAttr('arrowtail',tail),quotedAttr('arrowhead',head)];
  edgeAttrs.push(quotedAttr('taillabel',tailLabel),quotedAttr('headlabel',headLabel));
  if(reference.label!==undefined)edgeAttrs.push(quotedAttr('label',reference.label));
  statements.push(q(fromNative)+fromPort+' -> '+q(toNative)+toPort+' ['+edgeAttrs.join(', ')+'];');
  identityMap.push(identityMapping('reference',native,reference.id,path));
  addCoverage(coverage,path+'/id','identity',native,'edge-id');addCoverage(coverage,path+'/from/node','identity',fromNative,'source-node-id');addCoverage(coverage,path+'/to/node','identity',toNative,'target-node-id');
  addCoverage(coverage,path+'/from/field',reference.from.field===undefined?'presence':'value',fromNative,reference.from.field===undefined?'unported-source-end':'source-table-port');
  addCoverage(coverage,path+'/to/field',reference.to.field===undefined?'presence':'value',toNative,reference.to.field===undefined?'unported-target-end':'target-table-port');
  for(const [key,slot]of [['label','edge-label'],['fromCardinality','tail-label-and-crowfoot'],['toCardinality','head-label-and-crowfoot']] as const)addCoverage(coverage,path+'/'+key,Object.hasOwn(reference,key)?'value':'presence',native,slot);
  void from;void to;
 }
 for(const field of ['question','title','takeaway','audience','source','omissions'])if(Object.hasOwn(v,field))diagnostics.push(diag('DOT_ENTITIES_ANNOTATION_REQUIRED',p('/'+field),'This application or provenance field requires the readable annotation carrier.','warning',true));
 for(const [i,node]of nodes.entries())for(const field of ['role','status','emphasis','evidence'])if(Object.hasOwn(node??{},field))diagnostics.push(diag('DOT_ENTITIES_ANNOTATION_REQUIRED',p('/nodes/'+i+'/'+field),'This application or provenance field requires the readable annotation carrier.','warning',true));
 if(new TextEncoder().encode(statements.join('\n')).length>240_000){diagnostics.push(diag('DOT_ENTITIES_SIZE',p(''),'Serialized native profile exceeds the safe 240 KiB bound.'));return{statements:[],identityMap:[],coverage:[],diagnostics};}
 return{statements,identityMap,coverage,diagnostics};
}

function attributesOf(attrs:DotProfileAttribute[],allowed:readonly string[]):Map<string,DotProfileAttribute>{
 const result=new Map<string,DotProfileAttribute>();for(const item of attrs){if(!allowed.includes(item.name)||result.has(item.name))throw new Error('Unexpected or duplicate DOT attribute '+item.name);result.set(item.name,item);}return result;
}
function attrText(map:Map<string,DotProfileAttribute>,name:string,required=true):string|undefined{const item=map.get(name);if(!item){if(required)throw new Error('Missing DOT attribute '+name);return;}if(item.html)throw new Error('DOT attribute '+name+' must be quoted text');return item.value;}
function readJsonCell(text:string,required:boolean):string|undefined{
 if(text==='—'){if(required)throw new Error('Required entity cell is absent');return;}
 let value:unknown;try{value=JSON.parse(text);}catch{throw new Error('Entity cells must contain readable JSON string literals');}if(typeof value!=='string')throw new Error('Entity text cell must be a JSON string');return value;
}
function parseCard(html:string):{label:string;detail?:string;fields:{name:string;type?:string;keys?:('pk'|'fk'|'uk')[];nullable?:boolean}[]} {
 const outer=/^<TABLE BORDER="1" CELLBORDER="1" CELLSPACING="0" CELLPADDING="5">([\s\S]*)<\/TABLE>$/.exec(html);if(!outer)throw new Error('Entity card is outside the qualified TABLE subset');
 const rows=[...outer[1]!.matchAll(/<TR>([\s\S]*?)<\/TR>/g)];if(rows.length<2||rows.map(row=>row[0]).join('')!==outer[1])throw new Error('Entity card has unrecognized table structure');
 const head=/^<TD COLSPAN="4"><B>([\s\S]*?)<\/B>(?:<BR\/><FONT POINT-SIZE="10">Detail: ([\s\S]*?)<\/FONT>|<BR\/><FONT POINT-SIZE="10">No detail<\/FONT>)<\/TD>$/.exec(rows[0]![1]!);if(!head)throw new Error('Entity card title or detail is missing or ambiguous');
 const label=readJsonCell(unxml(head[1]!),true)!,detail=head[2]===undefined?undefined:readJsonCell(unxml(head[2]),true);
 if(rows[1]![1]!=='<TD><B>Field</B></TD><TD><B>Type</B></TD><TD><B>Keys</B></TD><TD><B>Nullable</B></TD>')throw new Error('Entity table headings changed');
 const fields:{name:string;type?:string;keys?:('pk'|'fk'|'uk')[];nullable?:boolean}[]=[];
 for(const row of rows.slice(2)){
  const m=/^<TD PORT="([a-zA-Z0-9_]+)">([\s\S]*?)<\/TD><TD>([\s\S]*?)<\/TD><TD>([\s\S]*?)<\/TD><TD>([\s\S]*?)<\/TD>$/.exec(row[1]!);if(!m)throw new Error('Entity field row has unsupported or ambiguous cells');
  const name=readJsonCell(unxml(m[2]!),true)!;if(encode(fieldPrefix,name)!==m[1])throw new Error('Field port and visible field name disagree');
  const type=readJsonCell(unxml(m[3]!),false),keyText=unxml(m[4]!),nullableText=unxml(m[5]!);let keys:('pk'|'fk'|'uk')[]|undefined;
  if(keyText!=='—'){try{const parsed=JSON.parse(keyText);if(!Array.isArray(parsed)||parsed.some(key=>!['pk','fk','uk'].includes(key))||new Set(parsed).size!==parsed.length)throw new Error();keys=parsed;}catch{throw new Error('Entity key cell is malformed');}}
  let nullable:boolean|undefined;if(nullableText==='Yes')nullable=true;else if(nullableText==='No')nullable=false;else if(nullableText!=='—')throw new Error('Entity nullability cell is malformed');
  fields.push({name,...(type===undefined?{}:{type}),...(keys===undefined?{}:{keys}),...(nullable===undefined?{}:{nullable})});
 }
 return{label,...(detail===undefined?{}:{detail}),fields};
}

/** Parse only the exact native card/edge subset emitted by serializeDotEntities. */
export function parseDotEntities(graph:DotProfileGraph,requestedForm:'entities'='entities'):DotEntitiesParseResult{
 const diagnostics:InterchangeDiagnostic[]=[],coverage:DotEntityCoverage[]=[],identityMap:IdentityMapping[]=[],nodes:any[]=[],entities:any[]=[],references:any[]=[],nodeIds=new Map<string,string>(),seenRefs=new Set<string>(),entityByNode=new Map<string,any>(),seenEntityIndexes=new Set<number>();
 const fail=(code:string,path:string,message:string)=>diagnostics.push(diag(code,path,message));let headerCount=0,referencesPresent:string|undefined;
 if(requestedForm!=='entities')fail('DOT_ENTITIES_FORM',p('/form'),'Only structure/entities is supported.');
 try{
  for(const statement of graph.statements){
   if(statement.kind==='attributes'){
    if(statement.target==='graph'){
     if(++headerCount!==1)throw new Error('Entities graph header is duplicated.');
     const attrs=attributesOf(statement.attributes,['umf_kind','umf_form','umf_references_present','rankdir','ranksep','splines']);referencesPresent=attrText(attrs,'umf_references_present');
     if(attrText(attrs,'umf_kind')!=='structure'||attrText(attrs,'umf_form')!=='entities'||!['true','false'].includes(referencesPresent??'')||attrText(attrs,'rankdir')!=='LR'||attrText(attrs,'ranksep')!=='2.5'||attrText(attrs,'splines')!=='polyline')throw new Error('Graph header is not the qualified entities profile.');
    }else throw new Error('Node and edge defaults are outside the entities profile.');
   }else if(statement.kind==='node'){
    const nativeId=decode(nodePrefix,statement.id);if(nativeId===undefined||nodeIds.has(statement.id))throw new Error('Node ID is outside the qualified entities ID subset or duplicated.');
    const attrs=attributesOf(statement.attributes,['label','shape','margin','umf_path','umf_entity_path']);const label=attrs.get('label');if(!label?.html)throw new Error('Entity node must use a native HTML table label.');
    if(attrText(attrs,'shape')!=='plain'||attrText(attrs,'margin')!=='0')throw new Error('Entity node shape or margin changed from the qualified native card.');
    const path=attrText(attrs,'umf_path')!,entityPath=attrText(attrs,'umf_entity_path')!,card=parseCard(label.value.slice(1,-1));
    const matchNode=/^\/extensions\/umf\.visual\/nodes\/(0|[1-9][0-9]*)$/.exec(path),matchEntity=/^\/extensions\/umf\.visual\/structure\/entities\/(0|[1-9][0-9]*)$/.exec(entityPath);if(!matchNode||!matchEntity||Number(matchNode[1])!==nodes.length)throw new Error('Native node identity paths are malformed or out of source order.');
    const nodeIndex=Number(matchNode[1]),entityIndex=Number(matchEntity[1]);if(seenEntityIndexes.has(entityIndex))throw new Error('Entity identity index is duplicated.');seenEntityIndexes.add(entityIndex);
    const node={id:nativeId,label:card.label,...(card.detail===undefined?{}:{detail:card.detail})},entity={node:nativeId,fields:card.fields};nodes[nodeIndex]=node;entities[entityIndex]=entity;nodeIds.set(statement.id,nativeId);entityByNode.set(statement.id,entity);
    identityMap.push(identityMapping('node',statement.id,nativeId,path),identityMapping('node',statement.id,nativeId,entityPath));addCoverage(coverage,path+'/id','identity',statement.id,'native-node-id');addCoverage(coverage,path+'/label','value',statement.id,'visible-card-label');addCoverage(coverage,path+'/detail',card.detail===undefined?'presence':'value',statement.id,card.detail===undefined?'card-detail-absent':'visible-card-detail');addCoverage(coverage,entityPath+'/node','identity',statement.id,'entity-card-owner');
    for(const [i,field]of card.fields.entries()){const fieldPath=entityPath+'/fields/'+i,port=encode(fieldPrefix,field.name);identityMap.push(identityMapping('field',statement.id+':'+port,nativeId,fieldPath));for(const [key,slot]of [['name','port-cell-name'],['type','table-type-cell'],['keys','table-key-cell'],['nullable','table-nullability-cell']] as const)addCoverage(coverage,fieldPath+'/'+key,Object.hasOwn(field,key)?'value':'presence',statement.id,slot);}
   }else if(statement.kind==='edge'){
    if(statement.fromPort!==undefined&&!entityByNode.has(statement.from)||statement.toPort!==undefined&&!entityByNode.has(statement.to))throw new Error('Reference endpoint names an undeclared entity node.');
    const attrs=attributesOf(statement.attributes,['id','umf_path','dir','arrowtail','arrowhead','taillabel','headlabel','label']);const native=attrText(attrs,'id')!,refId=decode(referencePrefix,native);if(refId===undefined||seenRefs.has(refId))throw new Error('Reference ID is outside the qualified subset or duplicated.');seenRefs.add(refId);
    const path=attrText(attrs,'umf_path')!,match=/^\/extensions\/umf\.visual\/structure\/references\/(0|[1-9][0-9]*)$/.exec(path);if(!match||Number(match[1])!==references.length)throw new Error('Reference identity path is malformed or out of source order.');
    if(attrText(attrs,'dir')!=='both')throw new Error('Reference arrow direction metadata changed.');
    const readCard=(side:'tail'|'head'):Cardinality|undefined=>{const label=attrText(attrs,side+'label')!,shape=attrText(attrs,side==='tail'?'arrowtail':'arrowhead')!;if(label===''){if(shape!=='none')throw new Error('Cardinality arrow is present without a cardinality label.');return;}if(!cardinalities.includes(label as Cardinality)||arrow(label as Cardinality)!==shape)throw new Error('Cardinality label and native crow-foot symbol disagree.');return label as Cardinality;};
    const fromId=nodeIds.get(statement.from),toId=nodeIds.get(statement.to);if(fromId===undefined||toId===undefined)throw new Error('Reference endpoint node is undeclared.');
    const fromField=statement.fromPort===undefined?undefined:decode(fieldPrefix,statement.fromPort),toField=statement.toPort===undefined?undefined:decode(fieldPrefix,statement.toPort);if(statement.fromPort!==undefined&&fromField===undefined||statement.toPort!==undefined&&toField===undefined)throw new Error('Reference endpoint port is malformed.');
    for(const [owner,field]of [[statement.from,fromField],[statement.to,toField]] as const)if(field!==undefined&&!entityByNode.get(owner).fields.some((candidate:any)=>candidate.name===field))throw new Error('Reference port does not identify a field on its entity.');
    const fromCardinality=readCard('tail'),toCardinality=readCard('head'),label=attrText(attrs,'label',false),reference={id:refId,from:{node:fromId,...(fromField===undefined?{}:{field:fromField})},to:{node:toId,...(toField===undefined?{}:{field:toField})},...(label===undefined?{}:{label}),...(fromCardinality===undefined?{}:{fromCardinality}),...(toCardinality===undefined?{}:{toCardinality})};references.push(reference);
    identityMap.push(identityMapping('reference',native,refId,path));addCoverage(coverage,path+'/id','identity',native,'edge-id');for(const [key,side,id,field]of [['from','source',statement.from,fromField],['to','target',statement.to,toField]] as const){addCoverage(coverage,path+'/'+key+'/node','identity',id,side+'-node-id');addCoverage(coverage,path+'/'+key+'/field',field===undefined?'presence':'value',id,field===undefined?'unported-'+side+'-end':'native-table-port');}for(const [key,side]of [['label','edge-label'],['fromCardinality','tail-label-and-crowfoot'],['toCardinality','head-label-and-crowfoot']] as const)addCoverage(coverage,path+'/'+key,Object.hasOwn(reference,key)?'value':'presence',native,side);
   }else throw new Error('Subgraphs, assignments and other statements are outside the entities profile.');
  }
  if(!graph.statements.some(statement=>statement.kind==='attributes'&&statement.target==='graph'))throw new Error('Entities graph header is missing.');
  if(nodes.length===0)throw new Error('Entities graph has no entity cards.');
  if(entities.length!==nodes.length||entities.some((entity,index)=>!entity||!seenEntityIndexes.has(index)))throw new Error('Entity identity paths are not a contiguous unique source order.');
  if(referencesPresent==='false'&&references.length!==0)throw new Error('Reference-presence marker conflicts with native relationship edges.');
  const nodePositions=new Map(nodes.map((node:any,index:number)=>[node.id,index]));for(const [i,node]of nodes.entries())if(nodePositions.get(node.id)!==i)throw new Error('Nodes are not in contiguous identity order.');
  for(const [i,node]of nodes.entries()){if(!node)throw new Error('Node identity paths are not a contiguous source order.');const entity=entities.find((candidate:any)=>candidate?.node===node.id);if(!entity)throw new Error('Entity card owner does not identify a declared node.');}
  const visual:Pick<Visual,'nodes'|'structure'>={nodes,structure:{entities,...(referencesPresent==='true'?{references}:{})}};
  return{statements:[],identityMap,coverage,diagnostics,visual};
 }catch(error){fail('DOT_ENTITIES_NATIVE_SYNTAX',p(''),error instanceof Error?error.message:'Invalid native DOT entity graph.');return{statements:[],identityMap,coverage,diagnostics};}
}
