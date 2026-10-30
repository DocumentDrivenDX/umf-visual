// SPDX-License-Identifier: MIT OR Apache-2.0
import {createVisualDocument,inspectVisual,type Visual,type VisualCardinality,type VisualEntity,type VisualReference,type VisualGroup,type VisualMessage,type VisualParticipant} from '../../extensions/visual';
import {identityMapping,interchangeDiagnostic,syntheticId} from '../shared';
import type {AdapterParseResult,AdapterSerializeResult,IdentityMapping,InterchangeDiagnostic,VisualInterchangeAdapter} from '../types';

/** Bounded Mermaid 12.2 profile: simple flowcharts, ER diagrams and sequence diagrams. */
export const mermaidAdapter:VisualInterchangeAdapter={
 format:'mermaid',version:'1.2.0',
 subset:'Mermaid 12.2.0 flowchart: bare/rectangular nodes, directed links and JSON-quoted YAML frontmatter titles; erDiagram: entities, fields, four cardinalities, relationship labels and JSON-quoted YAML frontmatter titles; sequenceDiagram: participants, native solid-call/dotted-return/open-async arrow forms, notes over two participants, and loop groups. Sequence form/layout and non-native visual fields are reported as losses. Sequence labels support ASCII spaces, tabs, and line feeds, which are numeric-escaped; other Unicode whitespace, controls except tab/line feed, and unpaired surrogates are refused. Titles preserve plain Unicode, quotes, backslashes, hashes, tabs, and line feeds; carriage returns, ampersands, and angle brackets altered by strict rendering are refused. Labels are plain text/numeric-escaped; raw HTML, Markdown, named entities, and literal angle brackets are outside this profile.',
 parse(source,context){return parseMermaid(source,context);},
 serialize(visual,context){return serializeMermaid(visual,context);},
};

const diagnostic=(code:string,path:string,message:string,range?:{start:number;end:number},severity:'warning'|'error'='warning')=>interchangeDiagnostic(code,path,message,{range,severity,loss:true});
const advisory=(code:string,path:string,message:string,range?:{start:number;end:number})=>interchangeDiagnostic(code,path,message,{range,severity:'warning',loss:false});
const ptr=(part:string|number)=>'/source/'+String(part).replace(/~/g,'~0').replace(/\//g,'~1');
const visualPath=(part:string)=>{const suffix=part.replace(/^\/+/, '');return suffix?'/extensions/umf.visual/'+suffix:'/extensions/umf.visual';};
const quote=(value:string)=>'"'+value.replace(/#/g,'#35;').replace(/&/g,'#38;').replace(/\\/g,'#92;').replace(/"/g,'#34;').replace(/</g,'#60;').replace(/>/g,'#62;').replace(/\|/g,'#124;').replace(/`/g,'#96;').replace(/\r/g,'#13;').replace(/\n/g,'#10;')+'"';
const frontmatter=(title:string|undefined):string[]=>title===undefined?[]:['---','title: '+JSON.stringify(title),'---'];
const validTitle=(title:string):boolean=>title.length>0&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f&<>\r]/.test(title)&&!Array.from(title).some(char=>char.length===1&&char.charCodeAt(0)>=0xd800&&char.charCodeAt(0)<=0xdfff);
const decodeEntities=(value:string)=>value.replace(/#(\d+);/g,(_entity,number:string)=>String.fromCodePoint(Number(number)));
const invalidEntityCode=(value:string):string|undefined=>{
 for(const match of value.matchAll(/#(\d+);/g)){
  const codePoint=Number(match[1]);if(!Number.isInteger(codePoint)||codePoint===0||codePoint>0x10ffff||(codePoint>=0xd800&&codePoint<=0xdfff))return match[0];
 }
 return;
};
const invalidSequenceText=(value:string):boolean=>value.length===0||Array.from(value).some(char=>(/\p{Cc}/u.test(char)&&char!=='\t'&&char!=='\n')||(/\s/u.test(char)&&char!==' '&&char!=='\t'&&char!=='\n')||(char.length===1&&char.charCodeAt(0)>=0xd800&&char.charCodeAt(0)<=0xdfff));
const unsupportedRichText=(value:string):boolean=>value.includes('`')||/[<>]/.test(value.replace(/-->/g,''))||/(?:#[A-Za-z][A-Za-z0-9]*;|&(?:[A-Za-z][A-Za-z0-9]*|#(?:x[\da-f]+|\d+));)/i.test(value);
const has=(value:object,key:string)=>Object.prototype.hasOwnProperty.call(value,key);
const commentDiagnostic=(text:string,index:number,start:number,end:number)=>/^%%\{[\s\S]*\}%%$/.test(text.trim())
 ?diagnostic('MERMAID_DIRECTIVE',ptr(index),'Mermaid initialization directive is retained in the source receipt but not applied to the Visual projection.',{start,end})
 :advisory('MERMAID_COMMENT',ptr(index),'Comment text is retained in the original source receipt and treated as advisory.',{start,end});
const safeName=(value:string)=>/^[\p{L}_][\p{L}\p{N}_-]*$/u.test(value)&&value.toLowerCase()!=='end'?value:quote(value);
const LEFT_CARD:Record<string,VisualCardinality>={'|o':'zero-or-one','||':'exactly-one','}o':'zero-or-many','}|':'one-or-many'};
const RIGHT_CARD:Record<string,VisualCardinality>={'o|':'zero-or-one','||':'exactly-one','o{':'zero-or-many','|{':'one-or-many'};
const LEFT_CARD_MARK:Record<VisualCardinality,string>={'zero-or-one':'|o','exactly-one':'||','zero-or-many':'}o','one-or-many':'}|'};
const RIGHT_CARD_MARK:Record<VisualCardinality,string>={'zero-or-one':'o|','exactly-one':'||','zero-or-many':'o{','one-or-many':'|{'};
function parseMermaid(source:string,context:{id:string;question:string}):AdapterParseResult{
 const diagnostics:InterchangeDiagnostic[]=[],identityMap:IdentityMapping[]=[];
 const lines=source.split(/\r\n|\n|\r/);const offsets:number[]=[];let offset=0;
 for(const line of lines){offsets.push(offset);offset+=line.length+(source.startsWith('\r\n',offset+line.length)?2:offset+line.length<source.length?1:0);}
 let meaningful=lines.map((text,index)=>({text:text.trim(),index,range:{start:offsets[index],end:offsets[index]+lines[index].length}})).filter(x=>x.text&&!/^%%/.test(x.text));
 if(!meaningful.length)return{diagnostics:[diagnostic('MERMAID_EMPTY','/source','No Mermaid diagram header was found.',{start:0,end:source.length},'error')],identityMap};
 let title:string|undefined;
 if(meaningful[0].text==='---'){
  const close=meaningful.slice(1).find(row=>row.text==='---');
  if(!close)return{diagnostics:[diagnostic('MERMAID_FRONTMATTER',ptr(meaningful[0].index),'Frontmatter opening delimiter has no closing delimiter.',meaningful[0].range,'error')],identityMap};
  const closePosition=meaningful.indexOf(close);
  for(const row of meaningful.slice(1,closePosition)){
   if(/^\s/.test(lines[row.index]))return{diagnostics:[...diagnostics,diagnostic('MERMAID_FRONTMATTER',ptr(row.index),'Indented frontmatter entries are outside the supported root-key YAML subset.',row.range,'error')],identityMap};
   const match=/^title:\s*("(?:[^"\\]|\\.)*")\s*$/.exec(row.text);
   if(match){
    if(title!==undefined)return{diagnostics:[...diagnostics,diagnostic('MERMAID_TITLE',ptr(row.index),'Duplicate frontmatter title is ambiguous.',row.range,'error')],identityMap};
    try{title=JSON.parse(match[1]) as string;}catch{return{diagnostics:[...diagnostics,diagnostic('MERMAID_TITLE',ptr(row.index),'Frontmatter title must be a valid JSON-quoted YAML string.',row.range,'error')],identityMap};}
    if(typeof title!=='string'||!validTitle(title))return{diagnostics:[...diagnostics,diagnostic('MERMAID_TITLE',ptr(row.index),'Frontmatter title must be nonempty, use supported Unicode scalars, and exclude controls, carriage returns, and angle brackets or ampersands altered by Mermaid rendering.',row.range,'error')],identityMap};
    continue;
   }
   if(/^title\s*:/.test(row.text))return{diagnostics:[...diagnostics,diagnostic('MERMAID_TITLE',ptr(row.index),'Only JSON-quoted YAML title scalars are supported for exact title preservation.',row.range,'error')],identityMap};
   if(!/^[A-Za-z_][\w-]*\s*:/.test(row.text))return{diagnostics:[...diagnostics,diagnostic('MERMAID_FRONTMATTER',ptr(row.index),'Frontmatter entry is outside the supported YAML key/value subset.',row.range,'error')],identityMap};
   diagnostics.push(diagnostic('MERMAID_METADATA',ptr(row.index),'Non-title Mermaid frontmatter metadata is not represented in Visual 1.0.',row.range));
  }
  meaningful=meaningful.slice(closePosition+1);
  if(!meaningful.length)return{diagnostics:[...diagnostics,diagnostic('MERMAID_PROFILE','/source','Frontmatter must be followed by a supported diagram header.',undefined,'error')],identityMap};
 }
 const header=meaningful[0];const flow=/^(?:flowchart|graph)\s+(TB|TD|BT|RL|LR)\s*$/.exec(header.text);
 if(flow)return parseFlow(source,context,lines,offsets,meaningful,flow[1].toUpperCase(),diagnostics,identityMap,title);
 if(/^erDiagram\s*$/.test(header.text))return parseEr(source,context,lines,offsets,meaningful,diagnostics,identityMap,title);
 if(/^sequenceDiagram\s*$/.test(header.text))return parseSequence(source,context,lines,offsets,meaningful,diagnostics,identityMap,title);
 return{diagnostics:[diagnostic('MERMAID_PROFILE',ptr(header.index),'Only a simple flowchart, erDiagram, or sequenceDiagram is in this Mermaid profile.',header.range,'error')],identityMap};
}
function admission(visual:Visual,diagnostics:InterchangeDiagnostic[]):boolean{
 try{
  const validation=inspectVisual(createVisualDocument(visual));
  if(validation.complete)return true;
  diagnostics.push(diagnostic('MERMAID_VISUAL_INVALID',visualPath(''),'Parsed Mermaid content does not form a complete Visual 1.0 document: '+validation.diagnostics.map(d=>d.code+': '+d.message).join('; '),undefined,'error'));
 }catch(error){
  diagnostics.push(diagnostic('MERMAID_VISUAL_INVALID',visualPath(''),'Parsed Mermaid content was refused by Visual 1.0 validation: '+String(error),undefined,'error'));
 }
 return false;
}
function parseFlow(source:string,context:{id:string;question:string},lines:string[],offsets:number[],meaningful:{text:string;index:number;range:{start:number;end:number}}[],direction:string,diagnostics:InterchangeDiagnostic[],identityMap:IdentityMapping[],title?:string):AdapterParseResult{
 const nodes:{id:string;label:string;sourceId:string;line:number}[]=[],edges:{id:string;from:string;to:string;label?:string;line:number}[]=[];
 const byNative=new Map<string,typeof nodes[number]>();let fatal=false;
 const nodeExpr=String.raw`([A-Za-z_][A-Za-z0-9_-]*)(?:\[\s*("(?:[^"\\]|\\.)*"|[^\]]*)\s*\])?`;
 const unquote=(text:string)=>{const t=text.trim();return decodeEntities(t.startsWith('"')&&t.endsWith('"')?t.slice(1,-1).replace(/\\(["\\])/g,'$1'):t);};
 const declare=(id:string,label:string,line:number,explicitLabel=false)=>{let item=byNative.get(id);if(!item){item={id:syntheticId('node',nodes.length),label,sourceId:id,line};byNative.set(id,item);nodes.push(item);}else if(explicitLabel)item.label=label;return item;};
 if(direction!=='TD'&&direction!=='TB')diagnostics.push(diagnostic('MERMAID_DIRECTION',ptr(meaningful[0].index),'Flowchart header direction '+direction+' is not represented by Visual 1.0.',meaningful[0].range));
 for(const row of meaningful.slice(1)){
  const text=row.text;
  if(unsupportedRichText(text)){diagnostics.push(diagnostic('MERMAID_RICH_TEXT',ptr(row.index),'Named entities, raw HTML, Markdown strings, and literal angle brackets are outside this plain-text Mermaid profile; use numeric Mermaid escapes for angle-bracket text.',row.range,'error'));fatal=true;continue;}
  if(invalidEntityCode(text)){diagnostics.push(diagnostic('MERMAID_ENTITY_CODE',ptr(row.index),'Numeric Mermaid entity code is not a valid Unicode scalar value.',row.range,'error'));fatal=true;continue;}
  if(/^direction\s+(?:TB|TD|BT|RL|LR)$/i.test(text)){diagnostics.push(diagnostic('MERMAID_DIRECTION',ptr(row.index),'Flowchart direction has no field in Visual 1.0 and is not represented.',row.range));continue;}
  if(/^title\s+/.test(text)){diagnostics.push(diagnostic('MERMAID_TITLE',ptr(row.index),'Flowchart title statement is outside the supported profile and was not interpreted.',row.range));continue;}
  if(/^%%/.test(text)){diagnostics.push(diagnostic('MERMAID_COMMENT',ptr(row.index),'Comment text is retained in the original source receipt but not interpreted.',row.range));continue;}
  const edgeRe=new RegExp('^'+nodeExpr+String.raw`\s+-->(?:\s*\|("(?:[^"\\]|\\.)*"|[^|]*)\|)?\s*`+nodeExpr+'$');const em=edgeRe.exec(text);
  if(em){if(em[1]==='end'||em[4]==='end'){diagnostics.push(diagnostic('MERMAID_RESERVED_ID',ptr(row.index),'Lowercase node id "end" conflicts with Mermaid flowchart syntax.',row.range,'error'));fatal=true;continue;}const from=declare(em[1],em[2]===undefined?em[1]:unquote(em[2]),row.index,em[2]!==undefined),to=declare(em[4],em[5]===undefined?em[4]:unquote(em[5]),row.index,em[5]!==undefined);edges.push({id:syntheticId('edge',edges.length),from:from.id,to:to.id,...(em[3]===undefined?{}:{label:unquote(em[3])}),line:row.index});continue;}
  const nm=new RegExp('^'+nodeExpr+'$').exec(text);
  if(nm){if(nm[1]==='end'){diagnostics.push(diagnostic('MERMAID_RESERVED_ID',ptr(row.index),'Lowercase node id "end" conflicts with Mermaid flowchart syntax.',row.range,'error'));fatal=true;continue;}declare(nm[1],nm[2]===undefined?nm[1]:unquote(nm[2]),row.index,nm[2]!==undefined);continue;}
  diagnostics.push(diagnostic('MERMAID_UNSUPPORTED',ptr(row.index),'Statement is not a supported simple flowchart node or directed link.',row.range,'error'));fatal=true;
 }
 if(!nodes.length){diagnostics.push(diagnostic('MERMAID_EMPTY',ptr(meaningful[0].index),'Flowchart contains no nodes.',meaningful[0].range,'error'));fatal=true;}
 if(nodes.length>15){diagnostics.push(diagnostic('MERMAID_SIZE','/source','Flowchart has more than the Mermaid profile’s bound of 15 nodes.',undefined,'error'));fatal=true;}
 if(fatal)return{diagnostics,identityMap};
 for(const row of lines.map((text,index)=>({text:text.trim(),index})).filter(x=>/^%%/.test(x.text)))diagnostics.push(commentDiagnostic(row.text,row.index,offsets[row.index],offsets[row.index]+lines[row.index].length));
 const visual:Visual={id:context.id,kind:'flow',form:'network',question:context.question,...(title===undefined?{}:{title}),nodes:nodes.map(({id,label})=>({id,label})),...(edges.length?{edges:edges.map(({id,from,to,label})=>({id,from,to,...(label===undefined?{}:{label})}))}:{})};
 if(!admission(visual,diagnostics))return{diagnostics,identityMap};
 nodes.forEach((node,index)=>identityMap.push(identityMapping('node',node.sourceId,node.id,visualPath('/nodes/'+index+'/id'),ptr(node.line))));
 edges.forEach((edge,index)=>{const sourceId='edge@'+(index+1);identityMap.push(identityMapping('edge',sourceId,edge.id,visualPath('/edges/'+index+'/id'),ptr(edge.line)));});
 return{visual,diagnostics,identityMap};
}
function parseEr(source:string,context:{id:string;question:string},lines:string[],offsets:number[],meaningful:{text:string;index:number;range:{start:number;end:number}}[],diagnostics:InterchangeDiagnostic[],identityMap:IdentityMapping[],title?:string):AdapterParseResult{
 const nodes:{id:string;label:string;line:number}[]=[],entityDecls:VisualEntity[]=[],edges:VisualReference[]=[];const nodeMap=new Map<string,typeof nodes[number]>();let fatal=false;
 const entityName=String.raw`("[^"]*"|[\p{L}_][\p{L}\p{N}_-]*)`;
 const unquote=(s:string)=>decodeEntities(s.startsWith('"')&&s.endsWith('"')?s.slice(1,-1).replace(/\\(["\\])/g,'$1'):s);
 const getNode=(native:string,line:number)=>{const canonical=unquote(native);let n=nodeMap.get(canonical);if(!n){n={id:syntheticId('node',nodes.length),label:canonical,line};nodeMap.set(canonical,n);nodes.push(n);}return n;};
 const relation=new RegExp('^'+entityName+String.raw`\s+((?:[|o}][|o{])?(?:--|\.\.)?(?:[|o}][|o{])?)\s+`+entityName+String.raw`\s*:\s*(.+?)\s*$`,'u');
 let current:string|undefined;
 for(const row of meaningful.slice(1)){
  const t=row.text;
  if(unsupportedRichText(t)){diagnostics.push(diagnostic('MERMAID_RICH_TEXT',ptr(row.index),'Named entities, raw HTML, Markdown strings, and literal angle brackets are outside this plain-text Mermaid profile; use numeric Mermaid escapes for angle-bracket text.',row.range,'error'));fatal=true;continue;}
  if(invalidEntityCode(t)){diagnostics.push(diagnostic('MERMAID_ENTITY_CODE',ptr(row.index),'Numeric Mermaid entity code is not a valid Unicode scalar value.',row.range,'error'));fatal=true;continue;}
  if(/^direction\s+(?:TB|BT|LR|RL)$/i.test(t)){diagnostics.push(diagnostic('MERMAID_DIRECTION',ptr(row.index),'ER direction has no field in Visual 1.0 and is not represented.',row.range));continue;}
  if(t==='}'&&current){current=undefined;continue;}
  if(current){
   const fm=/^([A-Za-z][\w()[\]-]*\??)\s+(\*?[\w()[\]-]+)(?:\s+((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*))?(?:\s+"([^"]*)")?$/i.exec(t);
   if(!fm){diagnostics.push(diagnostic('MERMAID_FIELD',ptr(row.index),'ER attribute is outside the supported type/name/key/comment subset.',row.range,'error'));fatal=true;continue;}
   const ent=entityDecls.find(e=>e.node===current);if(!ent)continue;
   const starred=fm[2].startsWith('*'),rawName=fm[2].replace(/^\*/,'');const keys:('pk'|'fk'|'uk')[]=[...(fm[3]?.match(/PK|FK|UK/gi)??[]).map(key=>key.toLowerCase() as 'pk'|'fk'|'uk')];
   const fieldIndex=ent.fields.length;
   ent.fields.push({name:rawName,type:fm[1],...(keys.length?{keys:[...new Set(keys)]}:{})});
   if(fm[1].endsWith('?'))diagnostics.push(diagnostic('MERMAID_OPTIONAL_TYPE',ptr(row.index),'Mermaid optional/nullability marker is retained in the exact type text; Visual nullable is not inferred.',row.range));
   if(starred)diagnostics.push(diagnostic('MERMAID_PRIMARY_MARKER',ptr(row.index),'A leading asterisk is retained as an ER primary-key marker in source, but this adapter does not infer Visual field keys from it.',row.range));
   if(fm[4]!==undefined)diagnostics.push(diagnostic('MERMAID_FIELD_COMMENT',ptr(row.index),'ER field comment has no Visual field and is not represented in the projection.',row.range));
   identityMap.push(identityMapping('field',rawName,current,visualPath('/structure/entities/'+(entityDecls.indexOf(ent))+'/fields/'+fieldIndex+'/name'),ptr(row.index)));continue;
  }
  if(t.endsWith('{')){const nm=new RegExp('^('+entityName+')\\s*\\{$','u').exec(t);if(!nm){diagnostics.push(diagnostic('MERMAID_UNSUPPORTED',ptr(row.index),'Entity declaration is outside the supported profile.',row.range,'error'));fatal=true;continue;}const native=nm[2];const n=getNode(native,row.index);current=n.id;let ent=entityDecls.find(e=>e.node===current);if(!ent){ent={node:current,fields:[]};entityDecls.push(ent);}continue;}
  const rm=relation.exec(t);
  if(rm){const left=rm[1],mark=rm[2],right=rm[3],label=unquote(rm[4].trim());const split=mark.includes('--')?mark.split('--'):mark.split('..');const leftMark=split[0],rightMark=split[1];
   const l=getNode(left,row.index),r=getNode(right,row.index);const id=syntheticId('reference',edges.length);
   edges.push({id,from:{node:l.id},to:{node:r.id},label,...(LEFT_CARD[leftMark]?{fromCardinality:LEFT_CARD[leftMark]}:{}),...(RIGHT_CARD[rightMark]?{toCardinality:RIGHT_CARD[rightMark]}:{})});
   if(!LEFT_CARD[leftMark]||!RIGHT_CARD[rightMark]){diagnostics.push(diagnostic('MERMAID_CARDINALITY',ptr(row.index),'A relationship endpoint has no valid, explicit cardinality marker for its Mermaid end.',row.range,'error'));fatal=true;}
   diagnostics.push(diagnostic('MERMAID_IDENTIFICATION',ptr(row.index),'Mermaid identifying versus non-identifying relationship semantics have no Visual 1.0 field; the distinction is not represented.',row.range));
   identityMap.push(identityMapping('reference','reference@'+(edges.length),id,visualPath('/structure/references/'+(edges.length-1)+'/id'),ptr(row.index)));continue;
  }
  const entityOnly=new RegExp('^'+entityName+'$','u').exec(t);
  if(entityOnly){const native=entityOnly[1];const n=getNode(native,row.index);if(!entityDecls.some(e=>e.node===n.id))entityDecls.push({node:n.id,fields:[]});continue;}
  diagnostics.push(diagnostic('MERMAID_UNSUPPORTED',ptr(row.index),'Statement is not a supported ER entity, attribute, or relationship.',row.range,'error'));fatal=true;
 }
 if(current){diagnostics.push(diagnostic('MERMAID_FIELD',ptr(meaningful.at(-1)!.index),'Unclosed ER entity attribute block.',meaningful.at(-1)!.range,'error'));fatal=true;}
 if(nodes.length>15){diagnostics.push(diagnostic('MERMAID_SIZE','/source','ER diagram has more than the Mermaid profile’s bound of 15 nodes.',undefined,'error'));fatal=true;}
 if(fatal)return{diagnostics,identityMap};
 for(const row of lines.map((text,index)=>({text:text.trim(),index})).filter(x=>/^%%/.test(x.text)))diagnostics.push(commentDiagnostic(row.text,row.index,offsets[row.index],offsets[row.index]+lines[row.index].length));
 for(const node of nodes)if(!entityDecls.some(entity=>entity.node===node.id))entityDecls.push({node:node.id,fields:[]});
 const visual:Visual={id:context.id,kind:'structure',form:'entities',question:context.question,...(title===undefined?{}:{title}),nodes:nodes.map(({id,label})=>({id,label})),structure:{entities:entityDecls,...(edges.length?{references:edges}:{})}};
 if(!admission(visual,diagnostics))return{diagnostics,identityMap};
 nodes.forEach((node,index)=>identityMap.push(identityMapping('node',[...nodeMap].find(([,value])=>value===node)?.[0]??node.label,node.id,visualPath('/nodes/'+index+'/id'),ptr(node.line))));
 return{visual,diagnostics,identityMap};
}

function parseSequence(source:string,context:{id:string;question:string},lines:string[],offsets:number[],meaningful:{text:string;index:number;range:{start:number;end:number}}[],diagnostics:InterchangeDiagnostic[],identityMap:IdentityMapping[],title?:string):AdapterParseResult{
 const participants:VisualParticipant[]=[],messages:VisualMessage[]=[],groups:VisualGroup[]=[],participantRows:number[]=[],messageRows:number[]=[],groupRows:number[]=[];
 const byNative=new Map<string,VisualParticipant>(),declared=new Set<string>(),groupStack:{id:string;index:number}[]=[];let fatal=false,contentStarted=false;
 const addError=(code:string,row:{index:number;range:{start:number;end:number}},message:string)=>{diagnostics.push(diagnostic(code,ptr(row.index),message,row.range,'error'));fatal=true;};
 const checkedText=(value:string,row:{index:number;range:{start:number;end:number}},path:string):string|undefined=>{
  if(invalidEntityCode(value)){addError('MERMAID_ENTITY_CODE',row,'Sequence '+path+' contains an invalid numeric Mermaid entity.');return;}
  if(unsupportedRichText(value)){addError('MERMAID_RICH_TEXT',row,'Sequence '+path+' is outside the plain-text/numeric-escaped profile.');return;}
  const decoded=decodeEntities(value);
  if(invalidSequenceText(decoded)){addError('MERMAID_SEQUENCE_TEXT',row,'Sequence '+path+' is empty or contains unsupported whitespace, controls other than tab/line feed, or an unpaired surrogate.');return;}
  return decoded;
 };
 const participant=(native:string,row:{index:number;range:{start:number;end:number}},label?:string,actor=false):VisualParticipant|undefined=>{
  if(native.toLowerCase()==='end'){addError('MERMAID_RESERVED_ID',row,'Sequence participant id "end" is reserved by Mermaid.');return;}
  let item=byNative.get(native);
  const decoded=label===undefined?native:checkedText(label,row,'participant label');if(decoded===undefined)return;
  if(item){if(label!==undefined&&(item.label!==decoded||actor!==(item.role==='actor'))){addError('MERMAID_PARTICIPANT_DUPLICATE',row,'A sequence participant alias cannot be redeclared with a different label or actor shape.');return;}return item;}
  item={id:'p'+(participants.length+1),label:decoded,...(actor?{role:'actor' as const}:{})};byNative.set(native,item);participants.push(item);participantRows.push(row.index);return item;
 };
 for(const row of meaningful.slice(1)){
  const text=row.text;
  if(Array.from(lines[row.index]).some(char=>/\s/u.test(char)&&char!==' '&&char!=='\t')){addError('MERMAID_SEQUENCE_TEXT',row,'Sequence statement contains unsupported Unicode whitespace, including at a line boundary.');continue;}
  if(/^%%/.test(text)){continue;}
  if(/^participant\s+|^actor\s+/.test(text)){
   const declaration=/^(participant|actor)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+(.+))?$/.exec(text);
   if(!declaration){addError('MERMAID_PARTICIPANT',row,'Participant declaration is outside the supported alias subset.');continue;}
   if(contentStarted){addError('MERMAID_PARTICIPANT_ORDER',row,'Explicit participant declarations must precede messages and loop fragments to preserve Mermaid appearance order.');continue;}
   if(declared.has(declaration[2])||byNative.has(declaration[2])){addError('MERMAID_PARTICIPANT_DUPLICATE',row,'A native participant alias may be declared only once in this profile.');continue;}
   declared.add(declaration[2]);
   participant(declaration[2],row,declaration[3],declaration[1]==='actor');continue;
  }
  const loop=/^loop\s+(.+)$/.exec(text);
  if(loop){contentStarted=true;const label=checkedText(loop[1],row,'loop label');if(label===undefined)continue;const id=syntheticId('group',groups.length);groups.push({id,label,role:'loop',...(groupStack.length?{parent:groupStack.at(-1)!.id}:{})});groupRows.push(row.index);groupStack.push({id,index:messages.length});continue;}
  if(/^alt\s+/.test(text)||/^else(?:\s|$)/.test(text)||/^(?:opt|par|critical|break|rect|and)\b/.test(text)){
   addError('MERMAID_SEQUENCE_GROUP',row,'Only loop blocks map to Visual sequence groups in this profile; alternatives and combined fragments are not projected.');continue;
  }
  if(text==='end'){
   const closed=groupStack.pop();if(!closed){addError('MERMAID_SEQUENCE_GROUP',row,'Sequence end has no open supported loop block.');continue;}
   if(messages.length===closed.index){addError('MERMAID_SEQUENCE_GROUP',row,'Empty sequence loop blocks have no Visual message assignment.');}
   continue;
  }
  const note=/^Note\s+over\s+([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/.exec(text);
  if(note){
   contentStarted=true;
   const label=checkedText(note[3],row,'note text');if(label===undefined)continue;
   const from=participant(note[1],row),to=participant(note[2],row);if(!from||!to)continue;
   messages.push({id:'m'+(messages.length+1),from:from.id,to:to.id,label,kind:'note',...(groupStack.length?{group:groupStack.at(-1)!.id}:{})});messageRows.push(row.index);continue;
  }
  const message=/^([A-Za-z_][A-Za-z0-9_]*)\s*(-->>|->>|-\))\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/.exec(text);
  if(message){
   contentStarted=true;
   const label=checkedText(message[4],row,'message label');if(label===undefined)continue;
   const from=participant(message[1],row),to=participant(message[3],row);if(!from||!to)continue;
   const kind:VisualMessage['kind']=message[2]==='->>'?'call':message[2]==='-->>'?'return':'async';
   messages.push({id:'m'+(messages.length+1),from:from.id,to:to.id,label,kind,...(groupStack.length?{group:groupStack.at(-1)!.id}:{})});messageRows.push(row.index);continue;
  }
  if(/^Note\b/.test(text)){addError('MERMAID_SEQUENCE_NOTE',row,'Only Note over A,B statements map to a Visual note message.');continue;}
  addError('MERMAID_SEQUENCE_UNSUPPORTED',row,'Statement is outside the supported participant, message, note-over, or loop subset.');
 }
 for(const open of groupStack){const row=meaningful.at(-1)!;addError('MERMAID_SEQUENCE_GROUP',row,'Sequence loop block is not closed with end.');}
 if(fatal)return{diagnostics,identityMap};
 for(const row of lines.map((text,index)=>({text:text.trim(),index})).filter(x=>/^%%/.test(x.text)))diagnostics.push(commentDiagnostic(row.text,row.index,offsets[row.index],offsets[row.index]+lines[row.index].length));
 const visual:Visual={id:context.id,kind:'sequence',form:'lifelines',question:context.question,...(title===undefined?{}:{title}),...(groups.length?{groups}:{}),sequence:{participants,messages}};
 if(!admission(visual,diagnostics))return{diagnostics,identityMap};
 participants.forEach((item,index)=>identityMap.push(identityMapping('participant', [...byNative].find(([,value])=>value===item)?.[0]??item.id,item.id,visualPath('/sequence/participants/'+index+'/id'),ptr(participantRows[index]??meaningful[0].index))));
 messages.forEach((item,index)=>identityMap.push(identityMapping('message','message@'+(index+1),item.id,visualPath('/sequence/messages/'+index+'/id'),ptr(messageRows[index]))));
 groups.forEach((item,index)=>identityMap.push(identityMapping('group','loop@'+(index+1),item.id,visualPath('/groups/'+index+'/id'),ptr(groupRows[index]))));
 return{visual,diagnostics,identityMap};
}

function serializeMermaid(visual:Visual,context:{id:string;question:string}):AdapterSerializeResult{
 const diagnostics:InterchangeDiagnostic[]=[],identityMap:IdentityMapping[]=[];
 if(has(visual,'title')&&(typeof visual.title!=='string'||!validTitle(visual.title))){diagnostics.push(diagnostic('MERMAID_TITLE',visualPath('/title'),'Mermaid frontmatter requires a nonempty title with supported Unicode scalar values and excludes controls, carriage returns, angle brackets, and ampersands altered by rendering.',undefined,'error'));return{text:undefined,diagnostics,identityMap};}
 if(visual.kind==='sequence'&&(visual.form==='lifelines'||visual.form==='ladder'))return serializeSequence(visual,diagnostics,identityMap);
 if(visual.kind==='flow'&&(visual.form==='network'||visual.form==='pipeline')){
  const out=frontmatter(visual.title);out.push('flowchart TD');const nodes=visual.nodes??[];const nodeIds=new Set(nodes.map(n=>n.id));const nativeIds=new Map<string,string>();const used=new Set<string>();
  for(const [index,node]of nodes.entries()){let candidate=node.id==='end'?'umf_end':node.id;while(used.has(candidate))candidate='umf_'+candidate;used.add(candidate);nativeIds.set(node.id,candidate);}
  for(const [i,node]of nodes.entries()){
   const native=nativeIds.get(node.id)!;out.push('  '+native+'['+quote(node.label)+']');
   if(['detail','role','status','emphasis','evidence'].some(key=>has(node,key)))diagnostics.push(diagnostic('MERMAID_NODE_FIELDS',visualPath('/nodes/'+i),'Visual node fields beyond its label have no encoding in this Mermaid subset.',undefined));
   identityMap.push(identityMapping('node',native,node.id,visualPath('/nodes/'+i+'/id')));
  }
  for(const [i,edge]of (visual.edges??[]).entries()){
   if(!nodeIds.has(edge.from)||!nodeIds.has(edge.to)){diagnostics.push(diagnostic('MERMAID_REFERENCE',visualPath('/edges/'+i),'Edge endpoint is not a declared node.',undefined,'error'));continue;}
   if(['kind','why','status','emphasis','evidence'].some(key=>has(edge,key)))diagnostics.push(diagnostic('MERMAID_EDGE_FIELDS',visualPath('/edges/'+i),'Visual edge fields beyond endpoints and label have no encoding in this Mermaid subset.',undefined));
   const label=edge.label===undefined?'':'|'+quote(edge.label)+'|';out.push('  '+nativeIds.get(edge.from)+' -->'+label+' '+nativeIds.get(edge.to));
   identityMap.push(identityMapping('edge','edge@'+(i+1),edge.id,visualPath('/edges/'+i+'/id')));
  }
  return{ text:diagnostics.some(d=>d.severity==='error')?undefined:out.join('\n')+'\n',diagnostics,identityMap};
 }
 if(visual.kind==='structure'&&visual.form==='entities'){
  const nodes=visual.nodes??[], entityByNode=new Map((visual.structure?.entities??[]).map(e=>[e.node,e]));
  if(nodes.some(n=>!entityByNode.has(n.id))){diagnostics.push(diagnostic('MERMAID_ENTITY',visualPath('/structure/entities'),'Every Mermaid entity node needs a Visual entity field block.',undefined,'error'));return{diagnostics,identityMap};}
  const out=frontmatter(visual.title);out.push('erDiagram');const nativeIds=new Map(nodes.map(node=>[node.id,safeName(node.label)]));
  if(new Set(nativeIds.values()).size!==nativeIds.size){diagnostics.push(diagnostic('MERMAID_ENTITY_ID',visualPath('/nodes'),'Entity labels must be unique Mermaid identifiers.',undefined,'error'));return{diagnostics,identityMap};}
  for(const [i,node]of nodes.entries()){
   const n=nativeIds.get(node.id)!,entity=entityByNode.get(node.id)!;const entityIndex=(visual.structure?.entities??[]).findIndex(entry=>entry.node===node.id);out.push('  '+n+' {');
   if(['detail','role','status','emphasis','evidence'].some(key=>has(node,key)))diagnostics.push(diagnostic('MERMAID_NODE_FIELDS',visualPath('/nodes/'+i),'Visual node fields beyond its label have no encoding in this Mermaid subset.',undefined));
   for(const [j,field]of entity.fields.entries()){
    if(!field.type){diagnostics.push(diagnostic('MERMAID_FIELD_TYPE',visualPath('/structure/entities/'+entityIndex+'/fields/'+j+'/type'),'Mermaid requires a field type; no type is inferred for this export.',undefined,'error'));continue;}
    if(!/^[A-Za-z][\w()[\]-]*\??$/.test(field.type)||!/^[\w()[\]-]+$/.test(field.name)){diagnostics.push(diagnostic('MERMAID_FIELD_NAME',visualPath('/structure/entities/'+entityIndex+'/fields/'+j),'Field name or type is outside the Mermaid ER identifier syntax.',undefined,'error'));continue;}
    if(has(field,'nullable'))diagnostics.push(diagnostic('MERMAID_NULLABLE',visualPath('/structure/entities/'+entityIndex+'/fields/'+j+'/nullable'),'Visual nullable metadata has no explicit native ER representation in this adapter.',undefined));
    const key=field.keys?.length?' '+field.keys.map(k=>({pk:'PK',fk:'FK',uk:'UK'} as const)[k]).join(', '):'';out.push('    '+field.type+' '+field.name+key);
    identityMap.push(identityMapping('field',field.name,node.id,visualPath('/structure/entities/'+entityIndex+'/fields/'+j+'/name')));
   }
   out.push('  }');identityMap.push(identityMapping('node',nativeIds.get(node.id)!,node.id,visualPath('/nodes/'+i+'/id')));
  }
  for(const [i,ref]of (visual.structure?.references??[]).entries()){
   if(has(ref.from,'field')||has(ref.to,'field'))diagnostics.push(diagnostic('MERMAID_FIELD_REFERENCE',visualPath('/structure/references/'+i),'Mermaid ER relationship syntax cannot attach endpoints to specific fields.',undefined));
   if(!ref.fromCardinality||!ref.toCardinality){diagnostics.push(diagnostic('MERMAID_CARDINALITY',visualPath('/structure/references/'+i),'Both endpoint cardinalities must be explicit for Mermaid export.',undefined,'error'));continue;}
   if(!nativeIds.has(ref.from.node)||!nativeIds.has(ref.to.node)){diagnostics.push(diagnostic('MERMAID_REFERENCE',visualPath('/structure/references/'+i),'Reference endpoint is not a declared entity.',undefined,'error'));continue;}
   diagnostics.push(diagnostic('MERMAID_IDENTIFICATION',visualPath('/structure/references/'+i),'Visual 1.0 has no identifying versus non-identifying relationship field; export uses Mermaid’s identifying marker.',undefined));
   const mark=LEFT_CARD_MARK[ref.fromCardinality]+'--'+RIGHT_CARD_MARK[ref.toCardinality];out.push('  '+nativeIds.get(ref.from.node)+' '+mark+' '+nativeIds.get(ref.to.node)+' : '+quote(ref.label??''));
   identityMap.push(identityMapping('reference','reference@'+(i+1),ref.id,visualPath('/structure/references/'+i+'/id')));
  }
  return{text:diagnostics.some(d=>d.severity==='error')?undefined:out.join('\n')+'\n',diagnostics,identityMap};
 }
 diagnostics.push(diagnostic('MERMAID_FORM',visualPath('/form'),'This visual kind and form are outside the Mermaid 12.2 adapter profile.',undefined,'error'));
 return{diagnostics,identityMap};
}

function sequenceText(value:string):string{const entities:Record<string,string>={'#':'#35;','&':'#38;','<':'#60;','>':'#62;','"':'#34;','\\':'#92;','`':'#96;',';':'#59;','\t':'#9;','\n':'#10;',' ':'#32;'};return Array.from(value).map(char=>entities[char]??char).join('');}
function serializeSequence(visual:Visual,diagnostics:InterchangeDiagnostic[],identityMap:IdentityMapping[]):AdapterSerializeResult{
 const seq=visual.sequence!,participants=seq.participants,messages=seq.messages;
 const out=frontmatter(visual.title);out.push('sequenceDiagram');
 if(visual.form==='ladder')diagnostics.push(diagnostic('MERMAID_SEQUENCE_LAYOUT',visualPath('/form'),'Mermaid sequenceDiagram uses lifelines and has no native ladder layout distinction.',undefined));
 if(has(visual,'steps'))diagnostics.push(diagnostic('MERMAID_SEQUENCE_STEPS',visualPath('/steps'),'Mermaid sequenceDiagram has no equivalent of Visual walkthrough steps.',undefined));
 const native=new Map<string,string>();
 for(const [i,participant]of participants.entries()){
  native.set(participant.id,'P'+(i+1));
  if(['detail','status','emphasis','evidence'].some(key=>has(participant,key)))diagnostics.push(diagnostic('MERMAID_PARTICIPANT_FIELDS',visualPath('/sequence/participants/'+i),'Participant detail, status, emphasis, and evidence have no Mermaid sequence encoding.',undefined));
  if(participant.role!==undefined&&participant.role!=='actor')diagnostics.push(diagnostic('MERMAID_PARTICIPANT_ROLE',visualPath('/sequence/participants/'+i+'/role'),'Mermaid distinguishes actor shape from participant shape but cannot encode the Visual role '+participant.role+'.',undefined));
  if(invalidSequenceText(participant.label)){diagnostics.push(diagnostic('MERMAID_SEQUENCE_LABEL',visualPath('/sequence/participants/'+i+'/label'),'Participant label is empty or contains unsupported whitespace, controls other than tab/line feed, or an unpaired surrogate.',undefined,'error'));continue;}
  out.push('  '+(participant.role==='actor'?'actor ':'participant ')+native.get(participant.id)+' as '+sequenceText(participant.label));
  identityMap.push(identityMapping('participant',native.get(participant.id)!,participant.id,visualPath('/sequence/participants/'+i+'/id')));
 }
 const groupMap=new Map((visual.groups??[]).map(group=>[group.id,group]));
 const groupIndexes=new Map((visual.groups??[]).map((group,index)=>[group.id,index]));
 const emittedGroups=new Set<string>();let active:string[]=[];const closed=new Set<string>();let nativeLoopIndex=0;
 const ancestors=(id:string|undefined):string[]=>{
  const result:string[]=[],seen=new Set<string>();let group=id?groupMap.get(id):undefined;
  while(group){if(seen.has(group.id)){diagnostics.push(diagnostic('MERMAID_SEQUENCE_GROUP',visualPath('/groups/'+(groupIndexes.get(group.id)??0)),'Sequence group parent relationships contain a cycle.',undefined,'error'));return[];}seen.add(group.id);result.unshift(group.id);group=group.parent?groupMap.get(group.parent):undefined;}
  if(id&&!groupMap.has(id))diagnostics.push(diagnostic('MERMAID_SEQUENCE_GROUP',visualPath('/sequence/messages'),'Message references a missing Visual group.',undefined,'error'));
  return result;
 };
 for(const [i,message]of messages.entries()){
  const target=ancestors(message.group).filter(id=>groupMap.get(id)?.role==='loop');
  let common=0;while(common<active.length&&common<target.length&&active[common]===target[common])common++;
  for(const id of active.slice(common).reverse()){out.push('  end');active.pop();closed.add(id);}
  for(const id of target.slice(common)){
   if(closed.has(id)){diagnostics.push(diagnostic('MERMAID_SEQUENCE_GROUP',visualPath('/sequence/messages/'+i+'/group'),'A Visual loop group is used by noncontiguous messages and cannot be serialized as one Mermaid block.',undefined,'error'));continue;}
   const group=groupMap.get(id)!;const index=groupIndexes.get(id)??0;
   if(invalidSequenceText(group.label)){diagnostics.push(diagnostic('MERMAID_SEQUENCE_GROUP',visualPath('/groups/'+index+'/label'),'Loop label is empty or contains unsupported whitespace, controls other than tab/line feed, or an unpaired surrogate.',undefined,'error'));continue;}
   if(['detail','status','emphasis','tier'].some(key=>has(group,key)))diagnostics.push(diagnostic('MERMAID_GROUP_FIELDS',visualPath('/groups/'+index),'Group detail, status, emphasis, and tier have no Mermaid loop encoding.',undefined));
   if(group.role!=='loop')diagnostics.push(diagnostic('MERMAID_SEQUENCE_GROUP',visualPath('/groups/'+index+'/role'),'Only Visual loop groups have a direct Mermaid loop encoding.',undefined));
   out.push('  loop '+sequenceText(group.label));active.push(id);emittedGroups.add(id);
   identityMap.push(identityMapping('group','loop@'+(++nativeLoopIndex),group.id,visualPath('/groups/'+index+'/id')));
  }
  if(!native.has(message.from)||!native.has(message.to)){diagnostics.push(diagnostic('MERMAID_SEQUENCE_ENDPOINT',visualPath('/sequence/messages/'+i),'Message endpoint does not reference a declared participant.',undefined,'error'));continue;}
  if(['status','emphasis','evidence'].some(key=>has(message,key)))diagnostics.push(diagnostic('MERMAID_MESSAGE_FIELDS',visualPath('/sequence/messages/'+i),'Message status, emphasis, and evidence have no Mermaid sequence encoding.',undefined));
  let line:string;
  const from=native.get(message.from)!,to=native.get(message.to)!,label=sequenceText(message.label);
  if(invalidSequenceText(message.label)){diagnostics.push(diagnostic('MERMAID_SEQUENCE_TEXT',visualPath('/sequence/messages/'+i+'/label'),'Message label is empty or contains unsupported whitespace, controls other than tab/line feed, or an unpaired surrogate.',undefined,'error'));continue;}
  if(message.group&&groupMap.get(message.group)?.role!=='loop')diagnostics.push(diagnostic('MERMAID_MESSAGE_GROUP',visualPath('/sequence/messages/'+i+'/group'),'This message uses a non-loop group which Mermaid cannot encode as a loop fragment.',undefined));
  switch(message.kind){
   case 'call':line='  '+from+'->>'+to+': '+label;break;
   case 'return':line='  '+from+'-->>'+to+': '+label;break;
   case 'async':line='  '+from+'-)'+to+': '+label;break;
   case 'note':if(message.from===message.to){diagnostics.push(diagnostic('MERMAID_SEQUENCE_NOTE',visualPath('/sequence/messages/'+i),'A self-targeted Visual note has no verified Mermaid note-over encoding.',undefined,'error'));continue;}line='  Note over '+from+','+to+': '+label;break;
   default:diagnostics.push(diagnostic('MERMAID_MESSAGE_KIND',visualPath('/sequence/messages/'+i+'/kind'),'Message kind is absent; Mermaid requires an arrow form, so no call/return meaning is inferred.',undefined));line='  '+from+'->>'+to+': '+label;
  }
  out.push(line);
  identityMap.push(identityMapping('message','message@'+(i+1),message.id,visualPath('/sequence/messages/'+i+'/id')));
 }
 for(const id of active.slice().reverse()){out.push('  end');closed.add(id);}
 for(const group of visual.groups??[])if(!emittedGroups.has(group.id)){const index=groupIndexes.get(group.id)??0;diagnostics.push(diagnostic('MERMAID_SEQUENCE_GROUP',visualPath('/groups/'+index),'Sequence group has no message interval or is not a loop, so it has no direct Mermaid encoding.',undefined));}
 return{text:diagnostics.some(d=>d.severity==='error')?undefined:out.join('\n')+'\n',diagnostics,identityMap};
}
