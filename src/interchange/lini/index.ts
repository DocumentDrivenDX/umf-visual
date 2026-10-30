// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Visual,VisualCardinality} from '../../extensions/visual';
import {VISUAL_PATH,identityMapping,interchangeDiagnostic,syntheticId} from '../shared';
import type {AdapterContext,AdapterParseResult,AdapterSerializeResult,IdentityMapping,InterchangeDiagnostic,VisualInterchangeAdapter} from '../types';

/** Bounded Lini 1.1.0 profile: flat entity cards, tooltips, entity fields and links. */
export const liniAdapter:VisualInterchangeAdapter={
 format:'lini',version:'0.2.0',
 subset:'Lini 1.1.0 flat block/entity cards with quoted labels and optional tooltip hints mapped to Visual node detail, quoted field display types, and directed links between cards or declared fields; undirected links refuse; field tooltips and layout/style declarations are retained with loss reports.',
 parse(source,context){return parseLini(source,context);},
 serialize(visual,context){return serializeLini(visual,context);},
};

const MAX_SOURCE=262_144,MAX_NODES=15,MAX_EDGES=10_000,MAX_LINES=20_000;
const linePath=(line:number)=>'/source/lines/'+line;
const vp=(text:string)=>VISUAL_PATH+text;
const diag=(code:string,path:string,message:string,range?:{start:number;end:number},severity:'warning'|'error'='warning',loss=true)=>interchangeDiagnostic(code,path,message,{range,severity,loss});
const quote=(text:string)=>JSON.stringify(text);
const supportedNativeText=(text:string)=>{
 if(/[\u0000-\u0008\u000b-\u000d\u000e-\u001f\u007f]/.test(text))return false;
 for(let i=0;i<text.length;i++){
  const code=text.charCodeAt(i);
  if(code>=0xd800&&code<=0xdbff){const next=text.charCodeAt(i+1);if(!(next>=0xdc00&&next<=0xdfff))return false;i++;}
  else if(code>=0xdc00&&code<=0xdfff)return false;
 }
 return true;
};
const trimNativeWhitespace=(text:string)=>text.replace(/^\p{White_Space}+|\p{White_Space}+$/gu,'');
function parseString(text:string):string|undefined {
 const t=trimNativeWhitespace(text);if(t.length<2||t[0]!=='"'||t.at(-1)!=='"')return;
 let value='';for(let i=1;i<t.length-1;i++){
  const c=t[i]!;if(c==='"'||c<' ')return;
  if(c!=='\\'){value+=c;continue;}
  const next=t[++i];if(next==='"'||next==='\\')value+=next;else if(next==='n')value+='\n';else if(next==='t')value+='\t';else return;
 }
 return value;
}
const trimNativeLabel=(value:string,line:Line,diagnostics:InterchangeDiagnostic[],path:string):string=>{
 const trimmed=trimNativeWhitespace(value);if(trimmed!==value)diagnostics.push(diag('LINI_TEXT_TRIM',path,'Lini trims boundary whitespace from labels; the exact source remains in the receipt.',{start:line.start,end:line.end}));return trimmed;
};
const trimNativeDetail=(value:string,line:Line,diagnostics:InterchangeDiagnostic[],path:string):string=>{
 const trimmed=trimNativeWhitespace(value);if(trimmed!==value)diagnostics.push(diag('LINI_DETAIL_TRIM',path,'Lini normalizes boundary whitespace in card tooltip hints; the exact source remains in the receipt.',{start:line.start,end:line.end}));return trimmed;
};
function braceDelta(text:string):{delta:number;closedAt?:number;invalid:boolean}{
 let depth=0,quote=false,escaped=false;
 for(let i=0;i<text.length;i++){
  const c=text[i]!;if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quote=false;continue;}
  if(c==='"'){quote=true;continue;}if(c==='/'&&text[i+1]==='/')break;if(c==='{')depth++;else if(c==='}'){depth--;if(depth<0)return{delta:depth,closedAt:i,invalid:false};}
 }
 return{delta:depth,...(depth===0&&text.includes('}')?{closedAt:text.lastIndexOf('}')}:{}),invalid:quote};
}
interface Line {text:string;start:number;end:number;number:number;}
interface NodeRec {path:string;kind:'entity'|'node';id:string;label:string;detail?:string;line:Line;fields:{path:string;name:string;type?:string;line:Line}[];}
function parseLini(source:string,context:AdapterContext):AdapterParseResult{
 const diagnostics:InterchangeDiagnostic[]=[],identityMap:IdentityMapping[]=[];
 const fail=(code:string,line:Line|undefined,message:string)=>diagnostics.push(diag(code,line?linePath(line.number):'/source',message,line?{start:line.start,end:line.end}:{start:0,end:source.length},'error',false));
 if(new TextEncoder().encode(source).byteLength>MAX_SOURCE){fail('LINI_SOURCE_SIZE',undefined,'Lini source exceeds the adapter size limit.');return{diagnostics,identityMap};}
 const lines:Line[]=[];let offset=0;for(const [number,text]of source.split(/\r\n|\n|\r/).entries()){lines.push({text,start:offset,end:offset+text.length,number});offset+=text.length+(source.startsWith('\r\n',offset+text.length)?2:offset+text.length<source.length?1:0);}
 if(lines.length>MAX_LINES){fail('LINI_SOURCE_SIZE',undefined,'Lini source exceeds the adapter line limit.');return{diagnostics,identityMap};}
 const nodes:NodeRec[]=[],byPath=new Map<string,NodeRec>(),usedVisualIds=new Set<string>();const refs:{from:string;to:string;label?:string;line:Line;directed:boolean}[]=[];
 const allocate=(kind:'node'|'edge'|'reference',index:number):string=>{let n=index,id=syntheticId(kind,n);while(usedVisualIds.has(id))id=syntheticId(kind,++n);usedVisualIds.add(id);return id;};
 let inEntity:NodeRec|undefined,fatal=false,braceDepth=0;
 const issue=(code:string,line:Line|undefined,message:string)=>{fail(code,line,message);fatal=true;};
 for(const line of lines){const text=trimNativeWhitespace(line.text);if(!text||text.startsWith('//'))continue;
  // Layout and style blocks are opaque presentation metadata. Balance braces so
  // their body cannot be mistaken for graph statements.
  if(!inEntity&&braceDepth>0){const balance=braceDelta(text);if(balance.invalid||braceDepth+balance.delta<0){issue('LINI_STYLE',line,'Malformed layout or style block.');continue;}braceDepth+=balance.delta;if(braceDepth===0&&balance.closedAt!==undefined&&trimNativeWhitespace(text.slice(balance.closedAt+1))){issue('LINI_STYLE_TRAILING',line,'Graph statements after a style block on the same line are outside the supported statement boundaries.');}continue;}
  if(!inEntity&&(/^(?:\{\s*(?:layout|padding|gap|clearance|columns)\b|\|[^|]+\|\s*\{)/.test(text))){const balance=braceDelta(text);if(balance.invalid){issue('LINI_STYLE',line,'Malformed quoted text in layout or style block.');continue;}braceDepth+=balance.delta;if(braceDepth<0){issue('LINI_STYLE',line,'Malformed layout or style block.');braceDepth=0;}else if(braceDepth===0&&balance.closedAt!==undefined&&trimNativeWhitespace(text.slice(balance.closedAt+1)))issue('LINI_STYLE_TRAILING',line,'Graph statements after a style block on the same line are outside the supported statement boundaries.');continue;}
  if(inEntity){
   if(text===']'){inEntity=undefined;continue;}
   const fm=/^\|cell#([A-Za-z_][A-Za-z0-9_]*)\|\s*("(?:\\.|[^"\\])*")\s*(?:\{\s*hint:\s*("(?:\\.|[^"\\])*");\s*\})?\s*;\s*("(?:\\.|[^"\\])*"|[^;]+)\s*;?$/.exec(text);
   if(fm){const rawName=parseString(fm[2]),parsedType=parseString(fm[4]!);if(rawName===undefined||parsedType===undefined||(fm[3]!==undefined&&parseString(fm[3])===undefined)){issue('LINI_FIELD',line,'Lini field name, type and optional hint must be valid Lini strings.');continue;}if(inEntity.fields.some(field=>field.path===fm[1])){issue('LINI_FIELD_ID',line,'Repeated field source path '+JSON.stringify(fm[1])+' is ambiguous.');continue;}const fieldPath=vp('/structure/entities/'+nodes.indexOf(inEntity)+'/fields/'+inEntity.fields.length),name=trimNativeLabel(rawName,line,diagnostics,fieldPath+'/name'),type=trimNativeLabel(parsedType,line,diagnostics,fieldPath+'/type');inEntity.fields.push({path:fm[1]!,name,type,line});identityMap.push(identityMapping('field',inEntity.path+'.'+fm[1],inEntity.id,fieldPath+'/name',linePath(line.number)));if(fm[3])diagnostics.push(diag('LINI_HINT_LOSS',linePath(line.number),'Lini field hint is tooltip text and has no Visual field.',{start:line.start,end:line.end}));continue;}
   if(/^\|footer\|/.test(text)){diagnostics.push(diag('LINI_FOOTER_LOSS',linePath(line.number),'Lini footer content is preserved by the source receipt but has no visual field.',{start:line.start,end:line.end}));continue;}
   issue('LINI_ENTITY_ROW',line,'Entity rows outside the supported field subset are refused.');continue;
  }
  if(text==='['){issue('LINI_ENTITY',line,'Entity body must open on the entity declaration line.');continue;}
  const em=/^\|(entity|block)#([A-Za-z_][A-Za-z0-9_]*)\|\s*("(?:\\.|[^"\\])*")(?:\s+\.([A-Za-z_][\w-]*))?(?:\s*\{\s*hint:\s*("(?:\\.|[^"\\])*");\s*\})?(\s*\[)?$/.exec(text);
  if(em){if(nodes.length>=MAX_NODES){issue('LINI_VISUAL_SIZE',line,'The visual vocabulary limit is 15 nodes; no nodes were truncated.');continue;}const rawLabel=parseString(em[3]),path=em[2]!,rawDetail=em[5]===undefined?undefined:parseString(em[5]);if(rawLabel===undefined||rawDetail===undefined&&em[5]!==undefined){issue('LINI_ENTITY',line,'Card label and optional hint must be valid Lini strings.');continue;}if(rawDetail!==undefined&&trimNativeWhitespace(rawDetail)===''){issue('LINI_EMPTY_HINT',line,'An empty Lini card hint cannot map to the nonempty Visual node detail field.');continue;}if(byPath.has(path)){issue('LINI_NODE_ID',line,'Repeated Lini card source path '+JSON.stringify(path)+' is ambiguous.');continue;}const label=trimNativeLabel(rawLabel,line,diagnostics,linePath(line.number)),detail=rawDetail===undefined?undefined:trimNativeDetail(rawDetail,line,diagnostics,vp('/nodes/'+nodes.length+'/detail')),id=allocate('node',nodes.length),node={path,kind:em[1]==='block'?'node' as const:'entity' as const,id,label,...(detail===undefined?{}:{detail}),line,fields:[]};nodes.push(node);byPath.set(path,node);if(em[4])diagnostics.push(diag('LINI_NODE_CLASS',linePath(line.number),'Lini card class is presentation metadata without a corresponding Visual status.',{start:line.start,end:line.end}));if(em[6])inEntity=node;continue;}
  const edge=/^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\s*(->|-)\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)(?:\s+("(?:\\.|[^"\\])*"))?(?:\s+\.([A-Za-z_][\w-]*))?$/.exec(text);
  if(edge){if(refs.length>=MAX_EDGES){issue('LINI_EDGE_SIZE',line,'Lini link count exceeds the adapter limit.');continue;}const rawLabel=edge[4]===undefined?undefined:parseString(edge[4]);if(edge[4]!==undefined&&rawLabel===undefined){issue('LINI_LINK',line,'Link label must be a valid Lini string.');continue;}const label=rawLabel===undefined?undefined:trimNativeLabel(rawLabel,line,diagnostics,linePath(line.number));if(edge[5])diagnostics.push(diag('LINI_LINK_CLASS',linePath(line.number),'Lini link class is presentation metadata without a corresponding Visual edge status.',{start:line.start,end:line.end}));refs.push({from:edge[1]!,to:edge[3]!,...(label===undefined?{}:{label}),line,directed:edge[2]==='->'});continue;}
  issue('LINI_UNSUPPORTED',line,'Statement is outside the supported flat entity and link subset.');
 }
 if(inEntity)issue('LINI_ENTITY',inEntity.line,'Entity body is not closed.');
 if(braceDepth!==0)issue('LINI_STYLE',undefined,'Unclosed layout or style block.');
 if(!nodes.length){issue('LINI_EMPTY',undefined,'No supported entity cards were found.');}
 const isFlow=nodes.every(n=>n.kind==='node');
 if(nodes.some(n=>n.kind==='node')&&!isFlow){issue('LINI_PROFILE_MIXED',undefined,'Flow blocks and entity cards cannot be mixed in one diagram.');return{diagnostics,identityMap:[]};}
 if(isFlow&&nodes.some(node=>node.fields.length)){issue('LINI_FLOW_FIELDS',undefined,'Flow blocks with entity field rows are outside the supported graph profile.');return{diagnostics,identityMap:[]};}
 const references:{id:string;from:{node:string;field?:string};to:{node:string;field?:string};label?:string}[]=[];
 const occurrences=new Map<string,number>();
 for(const [index,edge]of refs.entries()){
  const endpoint=(value:string)=>{const [native,field]=value.split('.');const node=byPath.get(native!);if(!node)return;const found=field?node.fields.find(item=>item.path===field):undefined;if(field&&!found)return;return{node:node.id,...(field?{field:found!.name}:{})};};
  const from=endpoint(edge.from),to=endpoint(edge.to);if(!from||!to){issue('LINI_ENDPOINT',edge.line,'Every link endpoint must name a declared card or declared field.');continue;}
  if(!edge.directed){diagnostics.push(diag('LINI_DIRECTION',linePath(edge.line.number),'This profile accepts only directed native links; undirected Lini links are outside its declared subset.',{start:edge.line.start,end:edge.line.end},'error',false));fatal=true;continue;}
  if(!isFlow)diagnostics.push(diag('LINI_REFERENCE_DIRECTION',linePath(edge.line.number),'The native link arrow direction has no explicit direction property on a Visual entity reference; retained source preserves it.',{start:edge.line.start,end:edge.line.end}));
  const fromPath=edge.from.split('.')[0]!,toPath=edge.to.split('.')[0]!,pair=JSON.stringify([fromPath,edge.from.split('.')[1]??'',toPath,edge.to.split('.')[1]??'']),occurrence=(occurrences.get(pair)??0)+1;occurrences.set(pair,occurrence);
  references.push({id:allocate(isFlow?'edge':'reference',references.length),from,to,...(edge.label===undefined?{}:{label:edge.label})});
  identityMap.push(identityMapping(isFlow?'edge':'reference',`${edge.from}->${edge.to}#${occurrence}`,references.at(-1)!.id,isFlow?vp('/edges/'+(references.length-1)+'/id'):vp('/structure/references/'+(references.length-1)+'/id'),linePath(edge.line.number)));
 }
 if(fatal)return{diagnostics,identityMap:[]};
 const visual:Visual=isFlow
  ?{id:context.id,kind:'flow',form:'network',question:context.question,nodes:nodes.map(n=>({id:n.id,label:n.label,...(n.detail===undefined?{}:{detail:n.detail})})),...(references.length?{edges:references.map(r=>({id:r.id,from:r.from.node,to:r.to.node,...(r.label===undefined?{}:{label:r.label})}))}:{})}
  :{id:context.id,kind:'structure',form:'entities',question:context.question,nodes:nodes.map(n=>({id:n.id,label:n.label,...(n.detail===undefined?{}:{detail:n.detail})})),structure:{entities:nodes.map(n=>({node:n.id,fields:n.fields.map(f=>({name:f.name,...(f.type!==undefined?{type:f.type}:{})}))})),...(references.length?{references}:{})}};
 nodes.forEach((n,i)=>identityMap.push(identityMapping('node',n.path,n.id,vp('/nodes/'+i+'/id'),linePath(n.line.number))));
 for(const line of lines)if(/^\s*(?:\{|\|[^|]+\|\s*\{)/.test(trimNativeWhitespace(line.text)))diagnostics.push(diag('LINI_PRESENTATION',linePath(line.number),'Lini layout and style declarations are retained in the source receipt but are not represented in Visual.',{start:line.start,end:line.end}));
 return{visual,diagnostics,identityMap};
}

function serializeLini(visual:Visual,_context:AdapterContext):AdapterSerializeResult{
 const diagnostics:InterchangeDiagnostic[]=[],identityMap:IdentityMapping[]=[];
 const bad=(code:string,path:string,message:string,severity:'warning'|'error'='warning')=>diagnostics.push(diag(code,path,message,undefined,severity,true));
 if(visual.kind!=='structure'||visual.form!=='entities'){
  if(visual.kind==='flow'&&(visual.form==='network'||visual.form==='pipeline')){const result=serializeFlow(visual);if(visual.form==='pipeline')result.diagnostics.push(diag('LINI_FORM_LOSS',vp('/form'),'Lini output is a network projection and does not retain the Visual pipeline form.'));return result;}
  bad('LINI_FORM',vp('/form'),'Lini supports flow network and structure entities in this profile.','error');return{diagnostics,identityMap};
 }
 const nodes=visual.nodes??[],entities=visual.structure?.entities??[],entityByNode=new Map(entities.map(e=>[e.node,e]));
 if(nodes.length>MAX_NODES){bad('LINI_VISUAL_SIZE',vp('/nodes'),'Visual exceeds the 15-node limit.','error');return{diagnostics,identityMap};}
 if((visual.structure?.references?.length??0)>MAX_EDGES){bad('LINI_EDGE_SIZE',vp('/structure/references'),'Reference count exceeds the Lini adapter limit.','error');return{diagnostics,identityMap};}
 for(const [i,node]of nodes.entries()){for(const [key,value]of [['label',node.label],['id',node.id]] as const)if(!supportedNativeText(value))bad('LINI_TEXT',vp('/nodes/'+i+'/'+key),'Text contains controls that Lini 1.1.0 cannot encode.','error');if(node.detail!==undefined){if(node.detail.length===0||!supportedNativeText(node.detail))bad('LINI_DETAIL',vp('/nodes/'+i+'/detail'),'Lini card hints require nonempty text with supported native characters.','error');else if(trimNativeWhitespace(node.detail)!==node.detail)bad('LINI_DETAIL_TRIM',vp('/nodes/'+i+'/detail'),'Lini normalizes boundary whitespace in card tooltip hints.');}}
 for(const [i,entity]of entities.entries())for(const [j,field]of entity.fields.entries())for(const [key,value]of [['name',field.name],['type',field.type??'']] as const)if(!supportedNativeText(value))bad('LINI_TEXT',vp('/structure/entities/'+i+'/fields/'+j+'/'+key),'Text contains controls that Lini 1.1.0 cannot encode.','error');
 for(const [i,reference]of (visual.structure?.references??[]).entries())if(reference.label!==undefined&&!supportedNativeText(reference.label))bad('LINI_TEXT',vp('/structure/references/'+i+'/label'),'Text contains controls that Lini 1.1.0 cannot encode.','error');
 if(diagnostics.some(d=>d.severity==='error'))return{diagnostics,identityMap};
 if(nodes.some(n=>!entityByNode.has(n.id))){bad('LINI_ENTITY',vp('/structure/entities'),'Every Lini entity card requires an entity declaration.','error');return{diagnostics,identityMap};}
 const nativeIds=new Map(nodes.map((node,index)=>[node.id,'n_'+index])),lines=['{ layout: grid; columns: repeat(2); gap: 100 140; clearance: 16; padding: 32; }'];
 for(const [i,node]of nodes.entries()){
  const native=nativeIds.get(node.id)!,entity=entityByNode.get(node.id)!,entityIndex=entities.indexOf(entity);
  lines.push('|entity#'+native+'| '+quote(node.label)+(node.detail===undefined?'':' { hint: '+quote(node.detail)+'; }')+' [');
  entity.fields.forEach((field,j)=>{const fieldPath=vp('/structure/entities/'+entityIndex+'/fields/'+j);if(field.type===undefined)bad('LINI_FIELD_TYPE',fieldPath+'/type','A field type is absent; Lini displays an empty type string and does not infer a constraint.');if(field.keys!==undefined)bad('LINI_FIELD_KEYS',fieldPath+'/keys','Lini field rows do not encode primary, foreign or unique key meaning.');if(field.nullable!==undefined)bad('LINI_FIELD_NULLABILITY',fieldPath+'/nullable','Lini field rows do not encode nullability constraints.');if(trimNativeWhitespace(field.name)!==field.name)bad('LINI_TEXT_TRIM',fieldPath+'/name','Lini trims boundary whitespace from field labels.');if(field.type!==undefined&&trimNativeWhitespace(field.type)!==field.type)bad('LINI_TEXT_TRIM',fieldPath+'/type','Lini trims boundary whitespace from field type labels.');lines.push('  |cell#f_'+j+'| '+quote(field.name)+'; '+quote(field.type??''));identityMap.push(identityMapping('field',native+'.f_'+j,node.id,fieldPath+'/name'));});
  if(trimNativeWhitespace(node.label)!==node.label)bad('LINI_TEXT_TRIM',vp('/nodes/'+i+'/label'),'Lini trims boundary whitespace from card labels.');
  lines.push(']');identityMap.push(identityMapping('node',native,node.id,vp('/nodes/'+i+'/id')));
  for(const field of ['role','status','emphasis','evidence','group','parent','layer'] as const)if(node[field]!==undefined)bad('LINI_NODE_FIELD',vp('/nodes/'+i+'/'+field),'Lini entity cards do not represent node '+field+'.');
 }
 const refOccurrences=new Map<string,number>();for(const [i,reference]of (visual.structure?.references??[]).entries()){
  const from=nativeIds.get(reference.from.node),to=nativeIds.get(reference.to.node);if(!from||!to){bad('LINI_REFERENCE',vp('/structure/references/'+i),'Reference endpoint is not a declared entity.','error');continue;}
  const fromField=reference.from.field?entityByNode.get(reference.from.node)?.fields.find(f=>f.name===reference.from.field):undefined,toField=reference.to.field?entityByNode.get(reference.to.node)?.fields.find(f=>f.name===reference.to.field):undefined;
  if(reference.from.field&&!fromField||reference.to.field&&!toField){bad('LINI_FIELD_REFERENCE',vp('/structure/references/'+i),'Reference field endpoint is not declared.','error');continue;}
  const source=from+(fromField?'.f_'+entityByNode.get(reference.from.node)!.fields.indexOf(fromField!):''),target=to+(toField?'.f_'+entityByNode.get(reference.to.node)!.fields.indexOf(toField!):'');
  lines.push(source+' -> '+target+(reference.label===undefined?'':' '+quote(reference.label)));const pair=JSON.stringify([source,target]),occurrence=(refOccurrences.get(pair)??0)+1;refOccurrences.set(pair,occurrence);identityMap.push(identityMapping('reference',source+'->'+target+'#'+occurrence,reference.id,vp('/structure/references/'+i+'/id')));
  if(reference.label!==undefined&&trimNativeWhitespace(reference.label)!==reference.label)bad('LINI_TEXT_TRIM',vp('/structure/references/'+i+'/label'),'Lini trims boundary whitespace from link labels.');
  bad('LINI_REFERENCE_DIRECTION',vp('/structure/references/'+i),'Visual references have no direction property; Lini output uses an arrow and reports that projection choice.');
  for(const key of ['fromCardinality','toCardinality'] as const)if(reference[key]!==undefined)bad('LINI_CARDINALITY',vp('/structure/references/'+i+'/'+key),'Lini link labels have no cardinality semantics; the value is omitted.');
  if(reference.label!==undefined){const nums=[reference.fromCardinality,reference.toCardinality].filter((x):x is VisualCardinality=>x!==undefined);if(nums.length)bad('LINI_REFERENCE_LABEL',vp('/structure/references/'+i+'/label'),'Cardinality is not appended to the user label and needs a distinct Lini mapping.');}
 }
 if(visual.title!==undefined)bad('LINI_TITLE',vp('/title'),'Lini card diagrams have no visual title field.');
 for(const field of ['groups','edges','steps','sequence','state','timeline','comparison','metric','takeaway','audience','source','omissions'] as const)if(visual[field]!==undefined)bad('LINI_VISUAL_FIELD',vp('/'+field),'Lini entity export does not represent visual '+field+'.');
 return{text:diagnostics.some(d=>d.severity==='error')?undefined:lines.join('\n')+'\n',diagnostics,identityMap};
}

function serializeFlow(visual:Visual):AdapterSerializeResult{
 const diagnostics:InterchangeDiagnostic[]=[],identityMap:IdentityMapping[]=[],nodes=visual.nodes??[],edges=visual.edges??[];
 const bad=(code:string,path:string,message:string,severity:'warning'|'error'='warning')=>diagnostics.push(diag(code,path,message,undefined,severity,true));
 if(nodes.length>MAX_NODES){bad('LINI_VISUAL_SIZE',vp('/nodes'),'Visual exceeds the 15-node limit.','error');return{diagnostics,identityMap};}
 if(edges.length>MAX_EDGES){bad('LINI_EDGE_SIZE',vp('/edges'),'Edge count exceeds the Lini adapter limit.','error');return{diagnostics,identityMap};}
 for(const [i,node]of nodes.entries()){for(const [key,value]of [['label',node.label],['id',node.id]] as const)if(!supportedNativeText(value))bad('LINI_TEXT',vp('/nodes/'+i+'/'+key),'Text contains controls that Lini 1.1.0 cannot encode.','error');if(node.detail!==undefined){if(node.detail.length===0||!supportedNativeText(node.detail))bad('LINI_DETAIL',vp('/nodes/'+i+'/detail'),'Lini card hints require nonempty text with supported native characters.','error');else if(trimNativeWhitespace(node.detail)!==node.detail)bad('LINI_DETAIL_TRIM',vp('/nodes/'+i+'/detail'),'Lini normalizes boundary whitespace in card tooltip hints.');}}
 for(const [i,edge]of edges.entries())if(edge.label!==undefined&&!supportedNativeText(edge.label))bad('LINI_TEXT',vp('/edges/'+i+'/label'),'Text contains controls that Lini 1.1.0 cannot encode.','error');
 if(diagnostics.some(d=>d.severity==='error'))return{diagnostics,identityMap};
 const names=new Map(nodes.map((n,i)=>[n.id,'n_'+i]));const lines=['{ layout: grid; columns: repeat(2); gap: 100 140; clearance: 16; padding: 32; }'];
 for(const [i,node]of nodes.entries()){const native=names.get(node.id)!;lines.push('|block#'+native+'| '+quote(node.label)+(node.detail===undefined?'':' { hint: '+quote(node.detail)+'; }'));identityMap.push(identityMapping('node',native,node.id,vp('/nodes/'+i+'/id')));if(trimNativeWhitespace(node.label)!==node.label)bad('LINI_TEXT_TRIM',vp('/nodes/'+i+'/label'),'Lini trims boundary whitespace from card labels.');}
 const edgeOccurrences=new Map<string,number>();
 for(const [i,edge]of edges.entries()){
  const from=names.get(edge.from),to=names.get(edge.to);if(!from||!to){bad('LINI_REFERENCE',vp('/edges/'+i),'Edge endpoint is not a declared node.','error');continue;}
  lines.push(from+' -> '+to+(edge.label===undefined?'':' '+quote(edge.label)));const pair=JSON.stringify([from,to]),occurrence=(edgeOccurrences.get(pair)??0)+1;edgeOccurrences.set(pair,occurrence);identityMap.push(identityMapping('edge',from+'->'+to+'#'+occurrence,edge.id,vp('/edges/'+i+'/id')));if(edge.label!==undefined&&trimNativeWhitespace(edge.label)!==edge.label)bad('LINI_TEXT_TRIM',vp('/edges/'+i+'/label'),'Lini trims boundary whitespace from link labels.');
  for(const key of ['why','kind','status','emphasis','evidence'] as const)if(edge[key]!==undefined)bad('LINI_EDGE_FIELD',vp('/edges/'+i+'/'+key),'Lini links do not represent edge '+key+'.');
 }
 for(const [i,node]of nodes.entries())for(const key of ['role','status','emphasis','evidence','group','parent','layer'] as const)if(node[key]!==undefined)bad('LINI_NODE_FIELD',vp('/nodes/'+i+'/'+key),'Lini cards do not represent node '+key+'.');
 for(const field of ['groups','steps','sequence','structure','state','timeline','comparison','metric','takeaway','audience','source','omissions'] as const)if(visual[field]!==undefined)bad('LINI_VISUAL_FIELD',vp('/'+field),'Lini flow export does not represent visual '+field+'.');
 if(visual.title!==undefined)bad('LINI_TITLE',vp('/title'),'Lini source has no visual title field.');
 return{text:diagnostics.some(d=>d.severity==='error')?undefined:lines.join('\n')+'\n',diagnostics,identityMap};
}
