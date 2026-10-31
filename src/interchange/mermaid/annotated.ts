// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson,type Document} from '@umf/core';
import {createVisualDocument,getVisual,inspectVisual,type Visual} from '../../extensions/visual';
import {annotationIdForPath,candidateAnnotationPaths,compileAnnotations,decodeAnnotationValue,encodeAnnotationValue,verifyAnnotationReadback,type AnnotationEntry,type AnnotationValue,type ProjectionCoverage} from '../annotations';
import {applyAnnotationEntries} from '../annotations/projection';
import type {IdentityMapping,InterchangeDiagnostic} from '../types';
import {mermaidAdapter} from './index';

export const MERMAID_ANNOTATED_PROFILE='umf.visual.mermaid.annotated/1' as const;
export interface AnnotatedMermaidResult {text?:string;document?:Document;identityMap:IdentityMapping[];coverage:ProjectionCoverage[];diagnostics:InterchangeDiagnostic[];}
const ROOT='/extensions/umf.visual';
const error=(message:string,path='/source'):AnnotatedMermaidResult=>({identityMap:[],coverage:[],diagnostics:[{code:'MERMAID_ANNOTATED_PROFILE',path,message,severity:'error',loss:false}]});
const canonical=(value:unknown):string=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const nativeText=(value:string):string=>value.split(/\r\n|\n|\r/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('%%')).join('\n');
const visualPath=(field:string)=>ROOT+'/'+field;
const encodeText=(value:string):string=>Array.from(value).map(char=>({'#':'#35;','&':'#38;','<':'#60;','>':'#62;','"':'#34;','\\':'#92;','`':'#96;',';':'#59;','\t':'#9;','\n':'#10;',' ':'#32;','|':'#124;'} as Record<string,string>)[char]??char).join('');
const decodeText=(value:string):string=>value.replace(/#(\d+);/g,(_token,decimal:string)=>String.fromCodePoint(Number(decimal)));
function owner(entry:AnnotationEntry,visual:Visual):string {
 const parts=entry.path.slice(ROOT.length+1).split('/').map(part=>part.replace(/~1/g,'/').replace(/~0/g,'~'));
 if(parts[0]==='sequence'&&parts[1]==='participants')return 'Participant ['+String(visual.sequence!.participants[Number(parts[2])]?.id)+']';
 if(parts[0]==='sequence'&&parts[1]==='messages')return 'Message ['+String(visual.sequence!.messages[Number(parts[2])]?.id)+']';
 if(parts[0]==='groups')return 'Group ['+String(visual.groups?.[Number(parts[1])]?.id)+']';
 if(parts[0]==='steps'&&/^\d+$/.test(parts[1]??''))return 'Step ['+String(parts[1])+']';
 return 'Visual';
}
function coveredByAnnotation(path:string,entries:readonly AnnotationEntry[]):boolean {
 return entries.some(entry=>entry.path===path||path.startsWith(entry.path+'/')||entry.path.startsWith(path+'/'));
}
function nativePaths(visual:Visual):Set<string> {
 const paths=new Set<string>([visualPath('kind')]);if(visual.title!==undefined)paths.add(visualPath('title'));
 if(visual.form==='lifelines')paths.add(visualPath('form'));
 const seq=visual.sequence!;
 paths.add(visualPath('sequence/participants'));paths.add(visualPath('sequence/messages'));
 seq.participants.forEach((participant,index)=>{
  for(const key of ['id','label'])paths.add(visualPath(`sequence/participants/${index}/${key}`));
  if(participant.role==='actor')paths.add(visualPath(`sequence/participants/${index}/role`));
 });
 seq.messages.forEach((message,index)=>{
  for(const key of ['id','from','to','label'])paths.add(visualPath(`sequence/messages/${index}/${key}`));
  if(message.kind!==undefined)paths.add(visualPath(`sequence/messages/${index}/kind`));
  if(message.group!==undefined)paths.add(visualPath(`sequence/messages/${index}/group`));
 });
 for(const [index,group] of (visual.groups??[]).entries()){
  for(const key of ['id','label'])paths.add(visualPath(`groups/${index}/${key}`));
  if(group.role==='loop')paths.add(visualPath(`groups/${index}/role`));
  if(group.parent!==undefined)paths.add(visualPath(`groups/${index}/parent`));
 }
 return paths;
}
function projectionCoverage(visual:Visual,entries:readonly AnnotationEntry[]):ProjectionCoverage[] {
 const result:ProjectionCoverage[]=[];
 const add=(path:string,id:string,aspect:ProjectionCoverage['aspect']='value')=>result.push({path,aspect,representation:'native-concept',native:[{id,slot:path}]});
 add(visualPath('kind'),'sequenceDiagram');if(visual.title!==undefined)add(visualPath('title'),'frontmatter.title');
 if(visual.form==='lifelines')add(visualPath('form'),'sequenceDiagram');
 add(visualPath('sequence/participants'),'participants','order');add(visualPath('sequence/messages'),'messages','order');
 visual.sequence!.participants.forEach((participant,index)=>{
  const native='P'+(index+1);
  for(const key of ['id','label'])add(visualPath(`sequence/participants/${index}/${key}`),native,key==='id'?'identity':'value');
  if(participant.role==='actor')add(visualPath(`sequence/participants/${index}/role`),native);
 });
 visual.sequence!.messages.forEach((message,index)=>{
  const id='message@'+(index+1);
  for(const key of ['id','from','to','label'])add(visualPath(`sequence/messages/${index}/${key}`),id,key==='id'?'identity':'value');
  if(message.kind!==undefined)add(visualPath(`sequence/messages/${index}/kind`),id);
  if(message.group!==undefined)add(visualPath(`sequence/messages/${index}/group`),id);
 });
 for(const [index,group] of (visual.groups??[]).entries()){
  const id='loop@'+(index+1);
  for(const key of ['id','label'])add(visualPath(`groups/${index}/${key}`),id,key==='id'?'identity':'value');
  if(group.role!==undefined)add(visualPath(`groups/${index}/role`),id);
  if(group.parent!==undefined)add(visualPath(`groups/${index}/parent`),id);
 }
 const descriptors=carrierDescriptors(entries,visual),locators=Object.fromEntries(entries.map(entry=>{const descriptor=descriptors.find(item=>item.id===entry.id)!;return [entry.id,[{id:descriptor.carrierId,slot:'note#'+descriptor.carrierId+'/'+entry.id}]];}));
 result.push(...verifyAnnotationReadback(entries,entries,locators));
 return result;
}
function annotationEntries(document:Document):AnnotationEntry[] {
 const visual=getVisual(document),intrinsic=nativePaths(visual);
 const paths=candidateAnnotationPaths(document,'1.0.0').filter(path=>!intrinsic.has(path));
 return compileAnnotations(document,'1.0.0',paths);
}
function carrierDescriptors(entries:readonly AnnotationEntry[],visual:Visual):Array<{id:string;path:string;type:AnnotationValue['kind'];owner:string;name:string;carrierId:string;participant:string}> {
 return entries.map((entry,entryIndex)=>{
  const ownerLabel=owner(entry,visual),participant=/^Participant \[([^\]]+)\]$/.exec(ownerLabel),index=participant?visual.sequence!.participants.findIndex(item=>item.id===participant[1]):-1;
  // Keep carriers in a compact, fixed part of the sequence. Spanning the first and last actor
  // makes every note rectangle as wide as the whole diagram, independent of its wrapped text.
  return {id:entry.id,path:entry.path,type:entry.value.kind,owner:ownerLabel,name:entry.name,carrierId:'annotation@'+(entryIndex+1),participant:'P1,P2'};
 });
}
function makeCarriers(entries:readonly AnnotationEntry[],visual:Visual):string[] {
 const descriptors=carrierDescriptors(entries,visual);
 return entries.map(entry=>{
  const descriptor=descriptors.find(item=>item.id===entry.id)!,wire=encodeAnnotationValue(entry.value);
  const rows=['UMF annotation /1 · '+entry.id,descriptor.owner+' · '+entry.name+' ('+wire.type+')',wire.value],wrapped:string[]=[];
  for(const row of rows){
   const tokens=encodeText(row).match(/#[0-9]+;|./gu)??[];let current='';
   for(const token of tokens){if(Array.from(current+token).length>38&&current){wrapped.push(current);current='';}current+=token;}
   if(current||!tokens.length)wrapped.push(current);
  }
  // Only these generated structural breaks become HTML. Annotation content is encoded first,
  // so a user-provided literal '<br/>' stays numeric-escaped and cannot become markup.
  return '  Note over '+descriptor.participant+': '+wrapped.join('<br/>');
 });
}
function carrierSegments(label:string):string[] {return label.includes('<br/>')?label.split('<br/>'):label.split('#10;');}
function dropAnnotationLosses(diagnostics:InterchangeDiagnostic[],entries:readonly AnnotationEntry[],visual:Visual):InterchangeDiagnostic[] {
 return diagnostics.filter(diagnostic=>{
  if(!diagnostic.loss)return true;
  if(coveredByAnnotation(diagnostic.path,entries))return false;
  const participant= /^\/extensions\/umf\.visual\/sequence\/participants\/(\d+)$/.exec(diagnostic.path);
  if(diagnostic.code==='MERMAID_PARTICIPANT_FIELDS'&&participant){
   const p=visual.sequence!.participants[Number(participant[1])];
   return ['detail','status','emphasis','evidence'].some(key=>Object.hasOwn(p,key)&&!coveredByAnnotation(diagnostic.path+'/'+key,entries));
  }
  if(diagnostic.code==='MERMAID_PARTICIPANT_ROLE'&&coveredByAnnotation(diagnostic.path,entries))return false;
  const message=/^\/extensions\/umf\.visual\/sequence\/messages\/(\d+)$/.exec(diagnostic.path);
  if(diagnostic.code==='MERMAID_MESSAGE_FIELDS'&&message){
   const item=visual.sequence!.messages[Number(message[1])];
   return ['status','emphasis','evidence'].some(key=>Object.hasOwn(item,key)&&!coveredByAnnotation(diagnostic.path+'/'+key,entries));
  }
  if(diagnostic.code==='MERMAID_SEQUENCE_STEPS'&&diagnostic.path===visualPath('steps'))return !coveredByAnnotation(diagnostic.path,entries);
  return true;
 });
}
function emit(documentInput:Document):AnnotatedMermaidResult {
 try{
  const document=copyJson(documentInput) as Document,checked=inspectVisual(document);
  if(!checked.valid||!checked.complete)throw new Error('A complete valid source document is required');
  if(canonical((document as any).vocabularies)!==canonical({'umf.visual':{version:'1.0.0'}}))throw new Error('This profile qualifies only frozen visual model 1.0.0 and its canonical vocabulary declaration');
  const visual=getVisual(document);
  if(visual.kind!=='sequence'||!['lifelines','ladder'].includes(visual.form))throw new Error('This Mermaid annotation profile qualifies sequence lifelines and ladder examples only.');
  if(!visual.sequence?.participants.length)throw new Error('A native sequence needs at least one participant for its visible annotation carrier.');
  const native=mermaidAdapter.serialize(visual,{id:visual.id,question:visual.question});
  if(!native.text||native.diagnostics.some(item=>item.severity==='error'))return {identityMap:[],coverage:[],diagnostics:native.diagnostics};
  const entries=annotationEntries(document),lines=native.text.split(/(?<=\n)/),identity=(kind:IdentityMapping['kind'])=>native.identityMap.filter(item=>item.kind===kind).sort((a,b)=>Number(a.nativeId.replace(/\D/g,''))-Number(b.nativeId.replace(/\D/g,''))).map(item=>item.visualId),annotations=carrierDescriptors(entries,visual),carrierCount=new Set(annotations.map(item=>item.carrierId)).size,header='%% UMF_PROFILE '+JSON.stringify({profile:MERMAID_ANNOTATED_PROFILE,modelVersion:'1.0.0',visualId:visual.id,documentId:document.id,kind:visual.kind,form:visual.form,participantIds:identity('participant'),messageIds:identity('message'),groupIds:identity('group'),annotationCount:entries.length,carrierCount,annotations})+'\n';
  const carriers=makeCarriers(entries,visual);
  let afterParticipants=0,headerPassed=false;
  for(let i=0;i<lines.length;i++){
   if(!headerPassed&&lines[i].trim()==='sequenceDiagram'){headerPassed=true;afterParticipants=i+1;continue;}
   if(headerPassed&&/^\s*(?:participant|actor)\s+/.test(lines[i]))afterParticipants=i+1;
   else if(headerPassed&&lines[i].trim()&&afterParticipants>0)break;
  }
  const profileLines=[...lines.slice(0,afterParticipants),...carriers.map(carrier=>carrier+'\n'),...lines.slice(afterParticipants)];
  let headerAt=profileLines.findIndex(line=>line.trim()==='sequenceDiagram');
  if(profileLines[0]?.trim()==='---'){
   const close=profileLines.findIndex((line,index)=>index>0&&line.trim()==='---');if(close<0)throw new Error('Mermaid title frontmatter is unclosed');headerAt=close+1;
  }
  const text=[...profileLines.slice(0,headerAt),header,...profileLines.slice(headerAt)].join('');
  const parsed=parseAnnotatedMermaid(text);
  if(!parsed.document||parsed.diagnostics.some(item=>item.severity==='error'))return parsed;
  if(canonical(parsed.document)!==canonical(document))return error('Mermaid visible annotation/intrinsic readback differs from the complete source document.','/');
  return {...parsed,text};
 }catch(reason){return error(reason instanceof Error?reason.message:String(reason),'/');}
}
function splitRow(row:string):string[]|undefined {
 const cells:string[]=[];let start=0;
 for(let i=0;i<5;i++){const next=row.indexOf('|',start);if(next<0)return;cells.push(row.slice(start,next));start=next+1;}
 cells.push(row.slice(start));return cells;
}
function parseCarrier(label:string,descriptor:{id:string;path:string;type:AnnotationValue['kind'];owner:string;name:string;carrierId:string;participant:string}):AnnotationEntry & {ownerLabel:string} {
 const chunks=carrierSegments(label),first=encodeText('UMF annotation /1 · '+descriptor.id),second=encodeText(descriptor.owner+' · '+descriptor.name+' ('+descriptor.type+')');
 const take=(expected:string)=>{let actual='';while(actual.length<expected.length&&chunks.length)actual+=chunks.shift()!;if(actual!==expected)throw new Error('Visible Mermaid annotation note differs from its exact identity descriptor');};
 take(first);take(second);if(!chunks.length)throw new Error('Visible Mermaid annotation note has no typed value');
 if(descriptor.id!==annotationIdForPath(descriptor.path)||descriptor.name!==descriptor.path.slice(descriptor.path.lastIndexOf('/')+1).replace(/~1/g,'/').replace(/~0/g,'~'))throw new Error('Mermaid annotation identity/name does not match its exact path');
 const row=decodeText(chunks.join('')),value=decodeAnnotationValue(descriptor.type,row),wire=encodeAnnotationValue(value);
 if(row!==wire.value)throw new Error('Visible Mermaid typed value is not in canonical form');
 return {id:descriptor.id,path:descriptor.path,name:descriptor.name,value,ownerLabel:descriptor.owner};
}
type NativeEvent={line:number;kind:'note'|'message'|'loop-start'|'loop-end';index:number};
function nativeEvents(source:string):NativeEvent[] {
 const events:NativeEvent[]=[];
 for(const [line,text] of source.split(/\r\n|\n|\r/).entries()){
  const trimmed=text.trim();if(!trimmed||trimmed.startsWith('%%'))continue;
  let kind:NativeEvent['kind']|undefined;
  if(/^Note\s+(?:left|right|over|left of|right of)\b.*:\s*/i.test(trimmed))kind='note';
  else if(/^loop\s+\S/.test(trimmed))kind='loop-start';
  else if(/^end\s*$/.test(trimmed))kind='loop-end';
  else if(/^P[1-9][0-9]*\s*(?:-->>|->>|-\)|--x|->|-->)\s*P[1-9][0-9]*\s*:/.test(trimmed))kind='message';
  if(kind)events.push({line,kind,index:events.length});
 }
 return events;
}
function retargetNativeIdentities(identityMap:IdentityMapping[],events:NativeEvent[]):void {
 for(const mapping of identityMap){
  if(mapping.kind!=='message'&&mapping.kind!=='group')continue;
  const line=mapping.sourcePath?Number(mapping.sourcePath.slice('/source/'.length)):Number.NaN;
  if(!Number.isSafeInteger(line))throw new Error('Native semantic identity has no source-line locator');
  const event=events.find(item=>item.line===line);
  if(!event||mapping.kind==='message'&&event.kind!=='message'&&event.kind!=='note'||mapping.kind==='group'&&event.kind!=='loop-start')throw new Error('Native semantic identity does not point to its actual full-source Mermaid event');
  mapping.nativeId=(mapping.kind==='message'?(event.kind==='note'?'note@':'message@'):'loop@')+(event.index+1);
 }
}
function profileHeader(source:string):{line:number;metadata:any} {
 const lines=source.split(/\r\n|\n|\r/),matches=lines.map((line,index)=>({line,index})).filter(row=>/^%% UMF_PROFILE /.test(row.line));
 if(matches.length!==1)throw new Error('Expected one explicit Mermaid annotated-profile header');
 let metadata:any;try{metadata=JSON.parse(matches[0].line.slice('%% UMF_PROFILE '.length));}catch{throw new Error('Malformed Mermaid profile header');}
 if(!metadata||Object.keys(metadata).sort().join(',')!=='annotationCount,annotations,carrierCount,documentId,form,groupIds,kind,messageIds,modelVersion,participantIds,profile,visualId'||metadata.profile!==MERMAID_ANNOTATED_PROFILE||metadata.modelVersion!=='1.0.0'||metadata.kind!=='sequence'||!['lifelines','ladder'].includes(metadata.form)||typeof metadata.visualId!=='string'||!metadata.visualId||typeof metadata.documentId!=='string'||!metadata.documentId||!Number.isSafeInteger(metadata.annotationCount)||metadata.annotationCount<1||!Number.isSafeInteger(metadata.carrierCount)||metadata.carrierCount<1||!Array.isArray(metadata.annotations)||metadata.annotations.length!==metadata.annotationCount||metadata.annotations.some((item:any)=>!item||Object.keys(item).sort().join(',')!=='carrierId,id,name,owner,participant,path,type'||typeof item.id!=='string'||typeof item.path!=='string'||typeof item.name!=='string'||typeof item.owner!=='string'||typeof item.carrierId!=='string'||typeof item.participant!=='string'||!/^P[1-9][0-9]*,P[1-9][0-9]*$/.test(item.participant)||!['string','number','boolean','null','array','object'].includes(item.type))||![metadata.participantIds,metadata.messageIds,metadata.groupIds].every((ids:any)=>Array.isArray(ids)&&ids.every((id:any)=>typeof id==='string'&&id.length>0)&&new Set(ids).size===ids.length))throw new Error('Unknown or mismatched Mermaid profile/model declaration');
 return {line:matches[0].index,metadata};
}
function restoreIdentities(visual:Visual,identityMap:IdentityMapping[],metadata:any):void {
 const rekey=(kind:IdentityMapping['kind'],ids:string[],objects:{id:string}[])=>{
  const links=identityMap.filter(item=>item.kind===kind).sort((a,b)=>Number(a.nativeId.replace(/\D/g,''))-Number(b.nativeId.replace(/\D/g,'')));
  if(links.length!==ids.length||objects.length!==ids.length)throw new Error('Mermaid profile identity manifest cardinality differs from native sequence content: '+kind);
  const remap=new Map<string,string>();
  for(let index=0;index<links.length;index++){
   const object=objects.find(item=>item.id===links[index].visualId);if(!object)throw new Error('Mermaid generated identity is absent from the parsed sequence: '+kind);
   remap.set(object.id,ids[index]);object.id=ids[index];links[index].visualId=ids[index];
  }
  return remap;
 };
 const participants=rekey('participant',metadata.participantIds,visual.sequence!.participants);
 const groups=rekey('group',metadata.groupIds,visual.groups??[]);
 const messages=rekey('message',metadata.messageIds,visual.sequence!.messages);
 for(const message of visual.sequence!.messages){message.from=participants.get(message.from)!;message.to=participants.get(message.to)!;if(message.group!==undefined)message.group=groups.get(message.group)!;}
 for(const group of visual.groups??[])if(group.parent!==undefined)group.parent=groups.get(group.parent)!;
 void messages;
}
export function parseAnnotatedMermaid(source:string):AnnotatedMermaidResult {
 try{
  const {line:headerLine,metadata}=profileHeader(source),lines=source.split(/\r\n|\n|\r/),carrierRows=lines.map((text,index)=>({text,index})).filter(row=>/^\s*Note over P[1-9][0-9]*,P[1-9][0-9]*: UMF#32;annotation#32;\/1#32;/.test(row.text));
  if(carrierRows.length!==metadata.carrierCount)throw new Error('Mermaid annotation carrier count differs from its profile descriptor');
  const descriptors=new Map<string,typeof metadata.annotations[number]>();for(const descriptor of metadata.annotations){if(descriptors.has(descriptor.carrierId))throw new Error('Mermaid annotation carrier identity is duplicated');descriptors.set(descriptor.carrierId,descriptor);}
  if(descriptors.size!==metadata.carrierCount||new Set(metadata.annotations.map((item:any)=>item.id)).size!==metadata.annotations.length||new Set(metadata.annotations.map((item:any)=>item.path)).size!==metadata.annotations.length)throw new Error('Mermaid annotation identity manifest contains duplicate or incomplete entries');
  const carrierInfo=carrierRows.map(row=>{
   const match=/^\s*Note over (P[1-9][0-9]*,P[1-9][0-9]*):\s*(.*)$/.exec(row.text);if(!match)throw new Error('Malformed Mermaid annotation note locator');
   const flattened=decodeText(carrierSegments(match[2]).join(''));
   const descriptor=[...descriptors.values()].find(item=>item.participant===match[1]&&flattened.startsWith('UMF annotation /1 · '+item.id+item.owner+' · '+item.name+' ('+item.type+')'));
   if(!descriptor)throw new Error('Mermaid annotation note does not match a declared owner locator');
   return {row,carrierId:descriptor.carrierId,descriptor,entries:parseCarrier(match[2],descriptor)};
  });
  if(new Set(carrierInfo.map(item=>item.carrierId)).size!==carrierInfo.length||carrierInfo.length!==metadata.annotationCount)throw new Error('Mermaid annotation carrier identities are duplicate or incomplete');
  const entries=carrierInfo.map(item=>item.entries).sort((a,b)=>a.path.localeCompare(b.path));
  if(new Set(entries.map(entry=>entry.path)).size!==entries.length)throw new Error('Duplicate Mermaid annotation path');
  const events=nativeEvents(source),carrierLocators=new Map(carrierInfo.map(item=>[item.entries.id,'note@'+((events.find(event=>event.line===item.row.index)?.index??-1)+1)]));
  if([...carrierLocators.values()].some(locator=>locator==='note@0'))throw new Error('Mermaid annotation note has no native event locator');
  const stripped=lines.map((_text,index)=>index===headerLine||carrierRows.some(row=>row.index===index)?'':_text).join('\n');
  const base=mermaidAdapter.parse(stripped,{id:metadata.visualId,question:'Annotation readback pending'});
  if(!base.visual||base.visual.kind!=='sequence'||base.visual.form!=='lifelines'||base.diagnostics.some(item=>item.severity==='error'))return {identityMap:[],coverage:[],diagnostics:base.diagnostics};
  const visual=base.visual;visual.form=metadata.form;restoreIdentities(visual,base.identityMap,metadata);
  for(const entry of entries){
   const suppliedOwner=(entry as AnnotationEntry & {ownerLabel:string}).ownerLabel;
   if(suppliedOwner!==owner(entry,visual))throw new Error('Visible annotation owner conflicts with its exact path: '+entry.path);
   delete (entry as AnnotationEntry & {ownerLabel?:string}).ownerLabel;
  }
  const doc=createVisualDocument(visual,metadata.documentId) as Document;
  (doc.extensions!['umf.visual'] as any).question=undefined;
  delete (doc.extensions!['umf.visual'] as any).question;
  compileAnnotations(doc,'1.0.0',entries.map(item=>item.path));
  applyAnnotationEntries(doc,entries);
  const checkedEntries=compileAnnotations(doc,'1.0.0',entries.map(item=>item.path));
  if(canonical(checkedEntries)!==canonical(entries))throw new Error('Mermaid annotation rows are duplicate, incomplete, or inconsistent with the registered Visual 1.0 paths');
  const recovered=getVisual(doc),validation=inspectVisual(doc);
  if(!validation.valid||!validation.complete)throw new Error('Visible Mermaid annotations do not reconstruct a valid complete Visual 1.0 document');
  const regenerated=mermaidAdapter.serialize(recovered,{id:recovered.id,question:recovered.question});
  if(!regenerated.text||nativeText(regenerated.text)!==nativeText(stripped))throw new Error('Mermaid native source contains sequence meaning or presentation outside this canonical profile');
  const diagnostics=dropAnnotationLosses(base.diagnostics,entries,recovered);
  const residual=dropAnnotationLosses(regenerated.diagnostics,entries,recovered).filter(item=>item.loss);
  for(const item of residual)if(!diagnostics.some(prior=>prior.code===item.code&&prior.path===item.path))diagnostics.push(item);
  retargetNativeIdentities(base.identityMap,events);
  const coverage=projectionCoverage(recovered,entries);
  for(const item of coverage){
   if(item.representation!=='native-concept')continue;
   const messageList=visualPath('sequence/messages');
   if(item.path===messageList){
    item.native=recovered.sequence!.messages.map(message=>{const nativeId=base.identityMap.find(row=>row.kind==='message'&&row.visualId===message.id)?.nativeId;if(!nativeId)throw new Error('Sequence message coverage has no native identity for '+message.id);return{id:nativeId,slot:'order'};});
    continue;
   }
   const message=/^\/extensions\/umf\.visual\/sequence\/messages\/(\d+)(?:\/|$)/.exec(item.path);
   if(message){const id=recovered.sequence!.messages[Number(message[1])]?.id,nativeId=base.identityMap.find(row=>row.kind==='message'&&row.visualId===id)?.nativeId;if(nativeId)item.native=[{id:nativeId,slot:item.native[0]?.slot??item.path}];continue;}
   const group=/^\/extensions\/umf\.visual\/groups\/(\d+)(?:\/|$)/.exec(item.path);
   if(group){const id=recovered.groups?.[Number(group[1])]?.id,nativeId=base.identityMap.find(row=>row.kind==='group'&&row.visualId===id)?.nativeId;if(nativeId)item.native=[{id:nativeId,slot:item.native[0]?.slot??item.path}];}
  }
  for(const item of coverage)if(item.representation==='profile-annotation'){
   const id=entries.find(entry=>entry.path===item.path)?.id,locator=id?carrierLocators.get(id):undefined;
   if(locator)item.native=[{id:locator,slot:'label'}];
  }
  return {document:doc,identityMap:base.identityMap,coverage,diagnostics};
 }catch(reason){return error(reason instanceof Error?reason.message:String(reason));}
}
/** Remove only profile-owned annotation notes from a successfully validated full export. */
export function focusedAnnotatedMermaidSource(source:string):string {
 const parsed=parseAnnotatedMermaid(source);
 if(!parsed.document||parsed.diagnostics.some(item=>item.severity==='error'))throw new Error('Focused Mermaid view requires a valid complete annotated profile source');
 const {line:headerLine,metadata}=profileHeader(source),lines=source.split(/\r\n|\n|\r/);
 const owned=new Set<string>(metadata.annotations.map((item:any)=>item.id));
 const output=lines.filter((text,index)=>{
  if(index===headerLine)return false;
  const match=/^\s*Note over P[1-9][0-9]*,P[1-9][0-9]*:\s*(.*)$/.exec(text);
  if(!match)return true;
  const visible=decodeText(carrierSegments(match[1]!).join(''));
  for(const id of owned)if(visible.startsWith('UMF annotation /1 · '+id))return false;
  return true;
 });
 return output.join('\n').replace(/^\n+/, '');
}
export function serializeAnnotatedMermaid(input:Document):AnnotatedMermaidResult {return emit(input);}
