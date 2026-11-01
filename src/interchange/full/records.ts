// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson,type Json} from '@umf/core';
import {decodeAnnotationValue,encodeAnnotationValue,type AnnotationValue} from '../annotations';
import type {FullRecord,FullScene} from './types';

const escape=(key:string)=>key.replace(/~/g,'~0').replace(/\//g,'~1');
export function fullRecordId(path:string):string {
 let hash=0xcbf29ce484222325n;
 for(let i=0;i<path.length;i++)hash=BigInt.asUintN(64,(hash^BigInt(path.charCodeAt(i)))*0x100000001b3n);
 return 'r_'+hash.toString(16).padStart(16,'0');
}
/** Complete own-data traversal, including the root and empty containers. */
export function compileFullRecords(input:unknown):FullRecord[] {
 const source=copyJson(input),records:FullRecord[]=[],ids=new Set<string>();
 const visit=(value:Json,path:string,name:string,depth:number):void=>{
  if(depth>64||records.length>=10_000||path.length>32_768)throw new RangeError('Full projection exceeds record bounds');
  const entry:AnnotationValue=value===null?{kind:'null'}:Array.isArray(value)?{kind:'array',length:value.length}:
   typeof value==='object'?{kind:'object',members:Object.keys(value)}:
   typeof value==='string'?{kind:'string',value}:typeof value==='number'?{kind:'number',value}:{kind:'boolean',value};
  const wire=encodeAnnotationValue(entry),id=fullRecordId(path);
  if(ids.has(id))throw new TypeError('Full record identity collision');ids.add(id);
  records.push({id,path,name,type:wire.type,value:wire.value});
  if(Array.isArray(value))value.forEach((child,index)=>visit(child,path+'/'+index,String(index),depth+1));
  else if(value!==null&&typeof value==='object')for(const key of Object.keys(value))visit(value[key]!,path+'/'+escape(key),key,depth+1);
 };
 visit(source,'','document',0);return records;
}

/** Rebuild from visible scalar/container slots, rejecting omissions and orphan rows. */
export function recoverFullRecords(records:readonly FullRecord[]):Json {
 if(!Array.isArray(records)||records.length===0||records.length>10_000)throw new TypeError('Expected bounded full records');
 const byPath=new Map<string,FullRecord>(),used=new Set<string>();
 for(const record of records){
  if(!record||typeof record.path!=='string'||record.path.length>32_768||record.id!==fullRecordId(record.path)||byPath.has(record.path))throw new TypeError('Invalid or repeated full record identity');
  if(record.path!==''&&(!record.path.startsWith('/')||/~(?![01])/.test(record.path)))throw new TypeError('Invalid record JSON Pointer');
  byPath.set(record.path,record);
 }
 const visit=(path:string,name:string,depth:number):Json=>{
  if(depth>64)throw new RangeError('Full readback exceeds depth bound');
  const record=byPath.get(path);if(!record||record.name!==name)throw new TypeError('Missing or misnamed native slot at '+path);
  used.add(path);const value=decodeAnnotationValue(record.type,record.value);
  if(value.kind==='array')return Array.from({length:value.length},(_,i)=>visit(path+'/'+i,String(i),depth+1));
  if(value.kind==='object'){
   const result:Record<string,Json>=Object.create(null);
   for(const key of value.members)Object.defineProperty(result,key,{value:visit(path+'/'+escape(key),key,depth+1),enumerable:true,writable:true,configurable:true});
   return result;
  }
  return value.kind==='null'?null:value.value;
 };
 const result=visit('','document',0);
 if(used.size!==records.length)throw new TypeError('Native source contains orphan full records');
 return result;
}

/** Endpoint values come from native connections, never a stale duplicate text row. */
export function reconcileFullEndpoints(scene:FullScene):void {
 const records=new Map(scene.records.map(record=>[record.id,record])),nodes=new Map(scene.nodes.map(node=>[node.id,node]));
 const derived=new Set<string>();
 for(const edge of scene.edges)for(const end of ['from','to'] as const){
  const id=edge[end==='from'?'fromRecordId':'toRecordId'];if(!id)continue;
  if(derived.has(id))throw new TypeError('Endpoint record bound more than once');derived.add(id);
  const endpoint=records.get(id),node=nodes.get(edge[end]),identity=node?.identityRecordId?records.get(node.identityRecordId):undefined;
  if(!endpoint||endpoint.type!=='string'||!identity||identity.type!=='string')throw new TypeError('Native endpoint lacks a source identity binding');
  decodeAnnotationValue('string',identity.value);endpoint.value=identity.value;
 }
}
