// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson,type Document} from '@umf/core';
import {getVisual} from '../extensions/visual';
import {DOT_ANNOTATED_PROFILE,parseAnnotatedDot,serializeAnnotatedDot} from './dot/annotated';
import {LINI_ANNOTATED_PROFILE,parseAnnotatedLini,serializeAnnotatedLini} from './lini/annotated';
import type {AnnotatedInterchangeProfile,ExportVisualOptions,ExportVisualResult,ImportVisualResult,RetainedVisualSource} from './types';

const MAX_SOURCE_BYTES=262_144;
const canonical=(value:unknown):string=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const error=(code:string,message:string,path='/options')=>({code,path,message,severity:'error' as const,loss:false});
const plain=(value:any):value is Record<string,any>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function bounded(source:string):boolean{return source.length<=MAX_SOURCE_BYTES&&new TextEncoder().encode(source).length<=MAX_SOURCE_BYTES;}
function adapter(format:unknown,profile:unknown){
 if(format==='dot'&&profile===DOT_ANNOTATED_PROFILE)return {format,profile,parse:parseAnnotatedDot,serialize:serializeAnnotatedDot} as const;
 if(format==='lini'&&profile===LINI_ANNOTATED_PROFILE)return {format,profile,parse:parseAnnotatedLini,serialize:serializeAnnotatedLini} as const;
 throw new Error('Unknown, mismatched or unqualified interchange profile');
}
function admittedOptions(value:unknown,keys:string[]):Record<string,any>{
 const safe:any=copyJson(value);if(!plain(safe)||Object.keys(safe).some(key=>!keys.includes(key)))throw new Error('Unknown or malformed profile options');
 adapter(safe.format,safe.profile);
 if(safe.mode!==undefined&&safe.mode!=='strict'&&safe.mode!=='allow-reported-loss')throw new Error('Unknown interchange policy');return safe;
}
function readReceipt(value:unknown):RetainedVisualSource {
 const safe:any=copyJson(value);if(!plain(safe)||Object.keys(safe).some(k=>!['format','text','importOptions','baseline','identityMap'].includes(k))||typeof safe.text!=='string'||!bounded(safe.text)||typeof safe.baseline!=='string'||!Array.isArray(safe.identityMap)||!plain(safe.importOptions))throw new Error('Malformed retained profile source');
 const options=safe.importOptions;if(Object.keys(options).some(k=>!['id','question','profile'].includes(k))||typeof options.id!=='string'||typeof options.question!=='string')throw new Error('Retained profile interpretation is missing or invalid');
 const selected=adapter(safe.format,options.profile),parsed=selected.parse(safe.text);if(!parsed.document||parsed.diagnostics.some(d=>d.severity==='error'||d.loss)||canonical(parsed.document)!==safe.baseline||canonical(parsed.identityMap)!==canonical(safe.identityMap))throw new Error('Retained profile baseline or identity map differs from independent source readback');
 const visual=getVisual(parsed.document);if(options.id!==visual.id||options.question!==visual.question)throw new Error('Retained interpretation context differs from native meaning');return safe as unknown as RetainedVisualSource;
}

/** Opt-in profiles are routed separately so legacy option/receipt admission and
 * historical native defaults keep their exact behavior. */
export function importAnnotatedVisual(source:unknown,options:unknown):ImportVisualResult {
 const text=typeof source==='string'?source:'',empty:RetainedVisualSource={format:'dot',text,importOptions:{id:'',question:'',profile:DOT_ANNOTATED_PROFILE},baseline:'',identityMap:[]};
 try{
  const safe=admittedOptions(options,['format','profile','id','question','mode']),selected=adapter(safe.format,safe.profile);
  empty.format=selected.format;empty.importOptions.profile=selected.profile;
  if(typeof safe.id!=='string'||!safe.id.trim()||typeof safe.question!=='string'||!safe.question.trim())throw new Error('Import context must contain nonempty id and question strings');
  if(typeof source!=='string'||!bounded(source))return {ok:false,source:empty,diagnostics:[error('INTERCHANGE_SOURCE_SIZE','Profile source must be a string of at most 256 KiB UTF-8.','/source')],identityMap:[]};
  const parsed=selected.parse(copyJson(source) as string),visual=parsed.document?getVisual(parsed.document):undefined;
  const receipt:RetainedVisualSource={...empty,importOptions:{id:visual?.id??safe.id,question:visual?.question??safe.question,profile:selected.profile},baseline:parsed.document?canonical(parsed.document):'',identityMap:parsed.identityMap};
  if(!parsed.document||parsed.diagnostics.some(d=>d.severity==='error'||(safe.mode!=='allow-reported-loss'&&d.loss)))return {ok:false,source:receipt,diagnostics:parsed.diagnostics,identityMap:[]};
  return {ok:true,document:parsed.document,source:receipt,diagnostics:parsed.diagnostics,identityMap:parsed.identityMap,profile:selected.profile,coverage:parsed.coverage};
 }catch(reason){return {ok:false,source:empty,diagnostics:[error('INTERCHANGE_PROFILE',reason instanceof Error?reason.message:String(reason))],identityMap:[]};}
}

export function exportAnnotatedVisual(input:unknown,options:unknown):ExportVisualResult {
 let retained:RetainedVisualSource|undefined;
 // Preserve a valid companion independently of unsafe current input/options.
 // Never invoke a caller getter while looking for the retained source.
 try{if(plain(options)){const descriptor=Object.getOwnPropertyDescriptor(options,'source');if(descriptor&&Object.hasOwn(descriptor,'value'))retained=readReceipt(descriptor.value);}}catch{/* An invalid companion is not promoted into a trusted receipt. */}
 try{
  const safe=admittedOptions(options,['format','profile','mode','source','original']) as unknown as ExportVisualOptions,selected=adapter(safe.format,safe.profile);
  if(safe.original!==undefined&&typeof safe.original!=='boolean')throw new Error('Original source selector must be boolean');
  const document=copyJson(input) as Document,source=safe.source===undefined?undefined:readReceipt(safe.source);
  retained=source??retained;
  if(source&&(source.format!==selected.format||source.importOptions.profile!==selected.profile))throw new Error('Retained source profile does not match the requested interpretation');
  if(safe.original===true){
   if(!source)throw new Error('Original profile replay requires its retained source');
   if(canonical(document)!==source.baseline)return {ok:false,source,diagnostics:[error('INTERCHANGE_REPLAY_CHANGED','Document differs from the independently reparsed retained baseline.','/')],identityMap:[]};
   const parsed=selected.parse(source.text);return {ok:true,text:source.text,source,diagnostics:parsed.diagnostics,identityMap:parsed.identityMap,profile:selected.profile,coverage:parsed.coverage};
  }
  const result=selected.serialize(document);if(result.text&&!bounded(result.text))return {ok:false,source,diagnostics:[error('INTERCHANGE_OUTPUT_SIZE','Native output exceeds 256 KiB UTF-8.','/')],identityMap:[]};
  const ok=Boolean(result.text)&&!result.diagnostics.some(d=>d.severity==='error'||(safe.mode!=='allow-reported-loss'&&d.loss));
  return {ok,...(ok?{text:result.text}:{}),...(source?{source}:{}),diagnostics:result.diagnostics,identityMap:ok?result.identityMap:[],profile:selected.profile,coverage:ok?result.coverage:[]};
 }catch(reason){return {ok:false,...(retained?{source:retained}:{}),diagnostics:[error('INTERCHANGE_PROFILE',reason instanceof Error?reason.message:String(reason))],identityMap:[]};}
}

/** Read selection without invoking getters; the full handler admits all data. */
export function hasExplicitProfile(options:unknown):boolean {
 try{if(options===null||typeof options!=='object'||Array.isArray(options))return false;
 const descriptor=Object.getOwnPropertyDescriptor(options,'profile');return Boolean(descriptor);}catch{return false;}
}
