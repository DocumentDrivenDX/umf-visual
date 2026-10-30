// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson, type Document, type Json} from '@umf/core';

/** A visible, typed annotation value. Containers never carry nested JSON blobs. */
export type AnnotationValue =
 | {kind:'string';value:string}
 | {kind:'number';value:number}
 | {kind:'boolean';value:boolean}
 | {kind:'null'}
 | {kind:'array';length:number}
 | {kind:'object';members:string[]};

export interface AnnotationEntry {
 id:string;
 path:string;
 name:string;
 value:AnnotationValue;
}

export interface NativeLocator {id:string;slot:string;}
export interface ProjectionCoverage {
 path:string;
 aspect:'value'|'presence'|'order'|'members'|'identity';
 representation:'native-concept'|'profile-annotation';
 native:NativeLocator[];
}

export interface AnnotationWireValue {type:AnnotationValue['kind'];value:string;}
export interface JsonPointerRead {present:boolean;value?:Json;}
export interface AnnotationLimits {maxDepth?:number;maxEntries?:number;maxPathLength?:number;}

const ROOT='/extensions/umf.visual';
const MAX_DEPTH=64,MAX_ENTRIES=10_000,MAX_PATH_LENGTH=32_768,MAX_CONTAINER_SIZE=10_000;

/** Explicitly reviewed 1.0 application/provenance/presentation vocabulary.
 * These paths deliberately exclude IDs, labels, graph relations, entity data,
 * state/timeline/chart values, and unknown extension content.
 */
export const ANNOTATION_CANDIDATE_PATHS_1_0 = [
 ROOT+'/question', ROOT+'/takeaway', ROOT+'/audience',
 ROOT+'/source', ROOT+'/source/path', ROOT+'/source/view', ROOT+'/source/digest',
 ROOT+'/omissions', ROOT+'/omissions/*',
 ROOT+'/groups/*/status', ROOT+'/groups/*/emphasis',
 ROOT+'/nodes/*/detail', ROOT+'/nodes/*/role', ROOT+'/nodes/*/status', ROOT+'/nodes/*/emphasis',
 ROOT+'/nodes/*/evidence', ROOT+'/nodes/*/evidence/*', ROOT+'/nodes/*/evidence/*/path', ROOT+'/nodes/*/evidence/*/contains',
 ROOT+'/edges/*/why', ROOT+'/edges/*/kind', ROOT+'/edges/*/status', ROOT+'/edges/*/emphasis',
 ROOT+'/edges/*/evidence', ROOT+'/edges/*/evidence/*', ROOT+'/edges/*/evidence/*/path', ROOT+'/edges/*/evidence/*/contains',
 ROOT+'/sequence/participants/*/detail', ROOT+'/sequence/participants/*/role', ROOT+'/sequence/participants/*/status', ROOT+'/sequence/participants/*/emphasis',
 ROOT+'/sequence/participants/*/evidence', ROOT+'/sequence/participants/*/evidence/*', ROOT+'/sequence/participants/*/evidence/*/path', ROOT+'/sequence/participants/*/evidence/*/contains',
 ROOT+'/steps', ROOT+'/steps/*', ROOT+'/steps/*/id', ROOT+'/timeline/events/*/detail', ROOT+'/timeline/events/*/status', ROOT+'/timeline/events/*/emphasis',
 ROOT+'/timeline/spans/*/detail', ROOT+'/timeline/spans/*/status', ROOT+'/timeline/spans/*/emphasis',
 ROOT+'/steps/*/title', ROOT+'/steps/*/caption', ROOT+'/steps/*/focus', ROOT+'/steps/*/focus/*', ROOT+'/steps/*/when', ROOT+'/steps/*/tag',
 ROOT+'/sequence/messages/*/status', ROOT+'/sequence/messages/*/emphasis',
 ROOT+'/sequence/messages/*/evidence', ROOT+'/sequence/messages/*/evidence/*', ROOT+'/sequence/messages/*/evidence/*/path', ROOT+'/sequence/messages/*/evidence/*/contains',
 ROOT+'/state/transitions/*/status', ROOT+'/state/transitions/*/emphasis'
] as const;

const registryByVersion:Record<string,readonly string[]>={'1.0.0':ANNOTATION_CANDIDATE_PATHS_1_0};

function ownDataValue(value:unknown,key:string):{present:boolean;value?:unknown} {
 if(value===null||typeof value!=='object')return {present:false};
 const descriptor=Object.getOwnPropertyDescriptor(value,key);
 if(!descriptor)return {present:false};
 if(!Object.hasOwn(descriptor,'value'))throw new TypeError('JSON pointers cannot traverse accessors');
 return {present:true,value:descriptor.value};
}

function decodeSegment(segment:string):string {
 if(/~(?![01])/.test(segment))throw new TypeError('Invalid JSON Pointer escape');
 return segment.replace(/~1/g,'/').replace(/~0/g,'~');
}
function encodeSegment(segment:string):string {return segment.replace(/~/g,'~0').replace(/\//g,'~1');}
function pointerSegments(path:string,limits:AnnotationLimits={}):string[] {
 const maxDepth=limits.maxDepth??MAX_DEPTH,maxPathLength=limits.maxPathLength??MAX_PATH_LENGTH;
 if(typeof path!=='string'||path.length===0||path.length>maxPathLength||path[0]!=='/')throw new TypeError('Expected a bounded, non-root JSON Pointer');
 const segments=path.slice(1).split('/').map(decodeSegment);
 if(segments.length>maxDepth)throw new RangeError('JSON Pointer exceeds the depth limit');
 if(segments.some(s=>s==='__proto__'||s==='prototype'||s==='constructor'))throw new TypeError('JSON Pointer addresses a forbidden property');
 return segments;
}

/** Read an own-property JSON Pointer without invoking getters. */
function readPointerSnapshot(root:Json,path:string,limits:AnnotationLimits={}):JsonPointerRead {
 const segments=pointerSegments(path,limits);
 let current:unknown=root;
 for(const segment of segments){
  if(Array.isArray(current)){
   if(!/^(0|[1-9][0-9]*)$/.test(segment))return {present:false};
   const index=Number(segment);if(!Number.isSafeInteger(index)||index>=current.length)return {present:false};
   const item=ownDataValue(current,segment);if(!item.present)return {present:false};current=item.value;
  }else if(current!==null&&typeof current==='object'){
   const item=ownDataValue(current,segment);if(!item.present)return {present:false};current=item.value;
  }else return {present:false};
 }
 return {present:true,value:current as Json};
}
export function readJsonPointer(root:unknown,path:string,limits:AnnotationLimits={}):JsonPointerRead {
 pointerSegments(path,limits);
 return readPointerSnapshot(copyJson(root),path,limits);
}

function isRecord(value:unknown):value is Record<string,unknown> {
 return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function candidateMatches(path:string,patterns:readonly string[]):boolean {
 const actual=pointerSegments(path);return patterns.some(pattern=>{
  const declared=pointerSegments(pattern);
  return declared.length===actual.length&&declared.every((segment,index)=>segment==='*'?/^(0|[1-9][0-9]*)$/.test(actual[index]):segment===actual[index]);
 });
}

function safeSnapshot(document:Document):Json {return copyJson(document);}

/** Return present paths eligible for opt-in annotation, without claiming coverage. */
export function candidateAnnotationPaths(document:Document,modelVersion:string):string[] {
 const patterns=registryByVersion[modelVersion];if(!patterns)throw new RangeError('No annotation candidate registry for visual model '+JSON.stringify(modelVersion));
 const safe=safeSnapshot(document),found:string[]=[];let visited=0;
 const visit=(value:unknown,path:string,depth:number):void=>{
  if(depth>MAX_DEPTH||++visited>MAX_ENTRIES)throw new RangeError('Document exceeds annotation traversal bounds');
  if(path&&candidateMatches(path,patterns))found.push(path);
  if(Array.isArray(value))value.forEach((child,index)=>visit(child,path+'/'+index,depth+1));
  else if(isRecord(value))for(const key of Object.keys(value)){
   const child=ownDataValue(value,key);if(!child.present)throw new TypeError('Document contains an accessor');
   visit(child.value,path+'/'+encodeSegment(key),depth+1);
  }
 };
 visit(safe,'',0);
 return [...new Set(found)].sort();
}

/** Stable native-safe identity derived from the exact UTF-16 JSON Pointer. */
export function annotationIdForPath(path:string):string {
 pointerSegments(path);
 let hash=0xcbf29ce484222325n;
 for(let i=0;i<path.length;i++){
  hash^=BigInt(path.charCodeAt(i));hash=BigInt.asUintN(64,hash*0x100000001b3n);
 }
 return 'ann_'+hash.toString(16).padStart(16,'0');
}

function nameForPath(path:string):string {
 const segments=pointerSegments(path);return segments[segments.length-1];
}
function makeValue(value:Json):AnnotationValue {
 if(value===null)return {kind:'null'};
 if(typeof value==='string')return {kind:'string',value};
 if(typeof value==='number'){
  if(!Number.isFinite(value))throw new TypeError('Annotation numbers must be finite');
  return {kind:'number',value};
 }
 if(typeof value==='boolean')return {kind:'boolean',value};
 if(Array.isArray(value))return {kind:'array',length:value.length};
 if(isRecord(value))return {kind:'object',members:Object.keys(value)};
 throw new TypeError('Annotation value is not JSON');
}

/** Compile caller-selected, registered metadata paths into visible typed rows. */
export function compileAnnotations(document:Document,modelVersion:string,registeredPaths:readonly string[],limits:AnnotationLimits={}):AnnotationEntry[] {
 const patterns=registryByVersion[modelVersion];if(!patterns)throw new RangeError('No annotation registry for visual model '+JSON.stringify(modelVersion));
 const safe=safeSnapshot(document),maxDepth=limits.maxDepth??MAX_DEPTH,maxEntries=limits.maxEntries??MAX_ENTRIES,maxPathLength=limits.maxPathLength??MAX_PATH_LENGTH;
 const selected=new Set<string>();
 for(const path of registeredPaths){
  if(!candidateMatches(path,patterns))throw new TypeError('Unregistered annotation path '+JSON.stringify(path));
  selected.add(path);
 }
 const entries=new Map<string,AnnotationEntry>();let visits=0;
 const addTree=(value:Json,path:string,depth:number):void=>{
  if(depth>maxDepth||path.length>maxPathLength||++visits>maxEntries)throw new RangeError('Annotation content exceeds traversal bounds');
  if(!candidateMatches(path,patterns))throw new TypeError('Annotation container contains unregistered field '+JSON.stringify(path));
  const entry:AnnotationEntry={id:annotationIdForPath(path),path,name:nameForPath(path),value:makeValue(value)};
  const prior=entries.get(path);if(prior){if(JSON.stringify(prior)!==JSON.stringify(entry))throw new TypeError('Conflicting annotation path');return;}
  entries.set(path,entry);
  if(Array.isArray(value))value.forEach((child,index)=>addTree(child,path+'/'+index,depth+1));
  else if(isRecord(value))for(const key of Object.keys(value)){
   const child=ownDataValue(value,key);if(!child.present)throw new TypeError('Document contains an accessor');
   addTree(child.value as Json,path+'/'+encodeSegment(key),depth+1);
  }
 };
 for(const path of selected){
  const read=readPointerSnapshot(safe,path,{maxDepth,maxPathLength});
  if(read.present)addTree(read.value!,path,0);
 }
 const values=[...entries.values()].sort((a,b)=>a.path.localeCompare(b.path));
 const ids=new Set<string>();for(const entry of values){if(ids.has(entry.id))throw new TypeError('Annotation identity hash collision');ids.add(entry.id);}
 if(values.length>maxEntries)throw new RangeError('Too many annotation entries');
 return values;
}

/** Encode one visible scalar token or one bounded container descriptor. */
export function encodeAnnotationValue(value:AnnotationValue):AnnotationWireValue {
 switch(value.kind){
  case 'string':return {type:'string',value:JSON.stringify(value.value)};
  case 'number':
   if(!Number.isFinite(value.value))throw new TypeError('Annotation numbers must be finite');
   return {type:'number',value:Object.is(value.value,-0)?'-0':JSON.stringify(value.value)};
  case 'boolean':return {type:'boolean',value:value.value?'true':'false'};
  case 'null':return {type:'null',value:'null'};
  case 'array':
   if(!Number.isSafeInteger(value.length)||value.length<0||value.length>MAX_CONTAINER_SIZE)throw new RangeError('Invalid annotation array length');
   return {type:'array',value:'Length: '+value.length};
  case 'object':
   if(value.members.length>MAX_CONTAINER_SIZE||value.members.some(member=>typeof member!=='string')||new Set(value.members).size!==value.members.length)throw new TypeError('Invalid annotation object members');
   return {type:'object',value:'Members: '+JSON.stringify(value.members)};
 }
}

/** Decode visible annotation text while requiring its declared type to agree. */
export function decodeAnnotationValue(kind:AnnotationValue['kind'],wire:string):AnnotationValue {
 if(typeof wire!=='string')throw new TypeError('Annotation wire value must be text');
 if(kind==='array'){
  const match=/^Length: (0|[1-9][0-9]*)$/.exec(wire);if(!match)throw new TypeError('Invalid array length descriptor');
  const length=Number(match[1]);if(!Number.isSafeInteger(length)||length>MAX_CONTAINER_SIZE)throw new RangeError('Array length exceeds the annotation bound');
  return {kind:'array',length};
 }
 if(kind==='object'){
  if(!wire.startsWith('Members: '))throw new TypeError('Invalid object member descriptor');
  let members:unknown;try{members=JSON.parse(wire.slice(9));}catch{throw new TypeError('Invalid object member list');}
  if(!Array.isArray(members)||members.length>MAX_CONTAINER_SIZE||members.some(member=>typeof member!=='string')||new Set(members).size!==members.length)throw new TypeError('Invalid object member list');
  return {kind:'object',members:members as string[]};
 }
 let value:unknown;try{value=JSON.parse(wire);}catch{throw new TypeError('Invalid JSON scalar token');}
 if(kind==='null'&&value===null)return {kind:'null'};
 if(kind==='string'&&typeof value==='string')return {kind:'string',value};
 if(kind==='boolean'&&typeof value==='boolean')return {kind:'boolean',value};
 if(kind==='number'&&typeof value==='number'&&Number.isFinite(value))return {kind:'number',value};
 throw new TypeError('Annotation token does not match declared type '+kind);
}

function validEntry(entry:AnnotationEntry):void {
 if(!entry||typeof entry!=='object'||typeof entry.path!=='string'||typeof entry.id!=='string'||typeof entry.name!=='string')throw new TypeError('Malformed annotation entry');
 const name=nameForPath(entry.path);if(entry.name!==name)throw new TypeError('Annotation name does not match its JSON Pointer');
 if(entry.id!==annotationIdForPath(entry.path))throw new TypeError('Annotation ID does not match its JSON Pointer');
 const wire=encodeAnnotationValue(entry.value);const decoded=decodeAnnotationValue(wire.type,wire.value);
 if(!sameValue(entry.value,decoded))throw new TypeError('Malformed annotation value');
}
function sameValue(a:AnnotationValue,b:AnnotationValue):boolean {
 if(a.kind!==b.kind)return false;
 switch(a.kind){
  case 'null':return true;
  case 'string':return b.kind==='string'&&a.value===b.value;
  case 'number':return b.kind==='number'&&Object.is(a.value,b.value);
  case 'boolean':return b.kind==='boolean'&&a.value===b.value;
  case 'array':return b.kind==='array'&&a.length===b.length;
  case 'object':return b.kind==='object'&&a.members.length===b.members.length&&a.members.every((member,index)=>member===b.members[index]);
 }
}

/** Compare native readback to compiled rows and issue coverage only on exact equality. */
export function verifyAnnotationReadback(
 expected:readonly AnnotationEntry[],actual:readonly AnnotationEntry[],locators:Readonly<Record<string,readonly NativeLocator[]>>,
):ProjectionCoverage[] {
 const normalize=(entries:readonly AnnotationEntry[])=>{
  const byPath=new Map<string,AnnotationEntry>(),byId=new Map<string,AnnotationEntry>();
  for(const entry of entries){validEntry(entry);if(byPath.has(entry.path)||byId.has(entry.id))throw new TypeError('Duplicate annotation path or identity');byPath.set(entry.path,entry);byId.set(entry.id,entry);}
  return {byPath,byId};
 };
 const want=normalize(expected),got=normalize(actual);
 if(want.byPath.size!==got.byPath.size)throw new TypeError('Annotation readback is missing or adds entries');
 for(const[path,entry]of want.byPath){
  const found=got.byPath.get(path);if(!found||found.id!==entry.id||found.name!==entry.name||!sameValue(found.value,entry.value))throw new TypeError('Annotation readback differs at '+path);
 }
 // Parent containers must describe exactly the immediate child paths, including order.
 for(const entry of actual){
  if(entry.value.kind!=='array'&&entry.value.kind!=='object')continue;
  const childPaths=[...got.byPath.keys()].filter(path=>{
   const prefix=entry.path+'/';if(!path.startsWith(prefix))return false;
   const rest=path.slice(prefix.length);return !rest.includes('/');
  });
  if(entry.value.kind==='array'){
   if(childPaths.length!==entry.value.length||Array.from({length:entry.value.length},(_,i)=>entry.path+'/'+i).some(path=>!got.byPath.has(path)))throw new TypeError('Array annotation children do not match declared length at '+entry.path);
  }else{
   const members=entry.value.members;
   const children=childPaths.map(path=>decodeSegment(path.slice(entry.path.length+1)));
   if(children.length!==members.length||new Set(children).size!==children.length||children.some(name=>!members.includes(name)))throw new TypeError('Object annotation children do not match declared members at '+entry.path);
  }
 }
 const used=new Set<string>(),coverage:ProjectionCoverage[]=[];
 for(const entry of actual){
  const carriers=locators[entry.id];if(!Array.isArray(carriers)||carriers.length===0)throw new TypeError('Annotation has no native carrier at '+entry.path);
  const native=carriers.map(locator=>{
   if(!locator||typeof locator.id!=='string'||!locator.id||typeof locator.slot!=='string'||!locator.slot)throw new TypeError('Malformed native annotation locator');
   const key=locator.id+'\u0000'+locator.slot;if(used.has(key))throw new TypeError('Native annotation carrier is reused');used.add(key);return {id:locator.id,slot:locator.slot};
  });
  const aspects:ProjectionCoverage['aspect'][]=entry.value.kind==='array'?['presence','order','identity']:
   entry.value.kind==='object'?['presence','members','identity']:['value','identity'];
  for(const aspect of aspects)coverage.push({path:entry.path,aspect,representation:'profile-annotation',native});
 }
 return coverage;
}
