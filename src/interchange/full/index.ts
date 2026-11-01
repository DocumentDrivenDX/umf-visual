// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson,type Document} from '@umf/core';
import {getVisual,inspectVisual} from '../../extensions/visual';
import {dotFullAdapter} from '../dot/full';
import {mermaidFullAdapter} from '../mermaid/full';
import {liniFullAdapter} from '../lini/full';
import type {ExportVisualResult,ImportVisualResult,RetainedVisualSource,FullInterchangeProfile,InterchangeFormat,IdentityMapping} from '../types';
import type {ProjectionCoverage} from '../annotations';
import type {FullScene,FullProjectionRepresentation,VisualApproximation} from './types';
import {compileFullRecords,recoverFullRecords} from './records';
import {compileFullScene} from './scene';
import {readNativeFirstSource,tryNativeFirstExport} from './native-first';

const adapters={dot:dotFullAdapter,mermaid:mermaidFullAdapter,lini:liniFullAdapter};
const MAX_BYTES=262_144;
const bounded=(text:string)=>text.length<=MAX_BYTES&&new TextEncoder().encode(text).length<=MAX_BYTES;
const error=(reason:unknown)=>({code:'INTERCHANGE_FULL_PROFILE',path:'/source',message:reason instanceof Error?reason.message:String(reason),severity:'error' as const,loss:false});
const plain=(value:any):value is Record<string,any>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const canonical=(input:unknown):string=>JSON.stringify(input,(_,value)=>plain(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value);
function options(input:unknown,allowed:string[]):Record<string,any>{
 const safe:any=copyJson(input);
 if(!plain(safe)||Object.keys(safe).some(key=>!allowed.includes(key))||!Object.hasOwn(adapters,safe.format)||safe.profile!=='umf.visual.'+safe.format+'.full/1')throw new TypeError('Unknown or mismatched full profile options');
 if(safe.mode!==undefined&&safe.mode!=='strict'&&safe.mode!=='allow-reported-loss')throw new TypeError('Unknown interchange policy');
 return safe;
}
function documentFrom(scene:FullScene):Document {
 if(scene.version!=='1'||scene.profile!=='umf.visual.'+scene.format+'.full/1')throw new TypeError('Unqualified native full profile or version');
 const document=copyJson(recoverFullRecords(scene.records)) as unknown as Document;
 if(!inspectVisual(document).valid)throw new TypeError('Native slots no longer describe a valid visual');
 const visual=getVisual(document);
 if(scene.kind!==visual.kind||scene.form!==visual.form)throw new TypeError('Native scene family differs from visible source records');
 const expected=compileFullScene(document,scene.format);
 for(const collection of ['nodes','edges','groups'] as const){
  // Approximate presentation is allowed only when it still realizes the
  // authored primary structure. A metadata appendix alone never qualifies.
  const ordered=(items:{id:string}[])=>items.map(item=>collection==='edges'?{...item,directed:(item as FullScene['edges'][number]).directed??true}:item).sort((a,b)=>a.id.localeCompare(b.id));
  if(canonical(ordered(scene[collection]))!==canonical(ordered(expected[collection])))throw new TypeError('Native '+collection+' do not realize the recovered visual; primary structure or quantitative geometry differs');
 }
 const adapter=adapters[scene.format],expectedApproximations=adapter.read(adapter.emit(expected)).approximations;
 if(canonical(scene.approximations)!==canonical(expectedApproximations))throw new TypeError('Native approximation declarations differ from the qualified visual projection');
 return document;
}
function evidence(scene:FullScene):{identityMap:IdentityMapping[];coverage:ProjectionCoverage[]}{
 const identityMap:IdentityMapping[]=[],coverage:ProjectionCoverage[]=[];
 const document=recoverFullRecords(scene.records);
 const modelId=(path:string):string=>{
  let value:any=document,last=plain(document)&&typeof (document as any).id==='string'?(document as any).id:'';
  for(const part of path===''?[]:path.slice(1).split('/')){
   if(value===null||typeof value!=='object')break;
   value=value[part.replace(/~1/g,'/').replace(/~0/g,'~')];
   if(plain(value)&&typeof value.id==='string')last=value.id;
  }
  return last;
 };
 for(const record of scene.records){
  const node=scene.nodes.find(item=>item.recordId===record.id),edge=scene.edges.find(item=>item.recordId===record.id||item.fromRecordId===record.id||item.toRecordId===record.id),group=scene.groups.find(item=>item.recordId===record.id);
  const carriers=scene.locators?.[record.id];
  if(!carriers?.length||carriers.some(carrier=>typeof carrier.id!=='string'||!carrier.id||typeof carrier.slot!=='string'||!carrier.slot))throw new TypeError('Full native readback lacks an actual carrier for '+record.path);
  identityMap.push({kind:node?'node':edge?'edge':group?'group':'field',nativeId:carriers[0]!.id,visualId:modelId(record.path),path:record.path});
  coverage.push({path:record.path,aspect:record.type==='array'?'order':record.type==='object'?'members':'value',representation:node||edge||group?'native-concept':'profile-annotation',native:carriers});
 }
 return {identityMap,coverage};
}
interface FullReadback {
 document:Document;
 identityMap:IdentityMapping[];
 coverage:ProjectionCoverage[];
 approximations:VisualApproximation[];
 representation:FullProjectionRepresentation;
}
function readFullSource(text:string,format:InterchangeFormat):FullReadback {
 const native=readNativeFirstSource(text,format);
 if(native)return {document:native.document,identityMap:native.identityMap,coverage:native.coverage,approximations:[],representation:native.representation};
 const scene=adapters[format].read(text),document=documentFrom(scene);
 return {document,...evidence(scene),approximations:scene.approximations,representation:{tier:'primitive-fallback',sourceProfile:scene.profile,sourceMappingVersion:'0.1.0',coverageModel:'visible-record-tree',wholeDocumentReadback:true}};
}
function receipt(text:string,format:InterchangeFormat,parsed:FullReadback):RetainedVisualSource {
 const visual=getVisual(parsed.document);return {format,text,importOptions:{id:visual.id,question:visual.question,profile:('umf.visual.'+format+'.full/1') as FullInterchangeProfile},baseline:canonical(parsed.document),identityMap:parsed.identityMap};
}
function retained(input:unknown):{source:RetainedVisualSource;parsed:FullReadback}{
 const safe:any=copyJson(input);
 if(!plain(safe)||Object.keys(safe).some(key=>!['format','text','importOptions','baseline','identityMap'].includes(key))||!plain(safe.importOptions)||Object.keys(safe.importOptions).some(key=>!['id','question','profile'].includes(key))||typeof safe.text!=='string'||!bounded(safe.text))throw new TypeError('Malformed full profile receipt');
 const selected=options({format:safe.format,profile:safe.importOptions.profile},['format','profile']),parsed=readFullSource(safe.text,selected.format);
 if(canonical(receipt(safe.text,selected.format,parsed))!==canonical(safe))throw new TypeError('Full receipt differs from independent native readback');
 return {source:safe as unknown as RetainedVisualSource,parsed};
}
export function hasFullProfile(input:unknown):boolean {
 try{
  if(!plain(input))return false;
  const descriptor=Object.getOwnPropertyDescriptor(input,'profile');
  return !!descriptor&&Object.hasOwn(descriptor,'value')&&typeof descriptor.value==='string'&&/^umf\.visual\.(dot|mermaid|lini)\.full\/1$/.test(descriptor.value);
 }catch{return false;}
}
export function importFullVisual(input:unknown,requested:unknown):ImportVisualResult {
 const empty:RetainedVisualSource={format:'dot',text:typeof input==='string'?input:'',importOptions:{id:'',question:''},baseline:'',identityMap:[]};
 try{
  const safe=options(requested,['format','profile','id','question','mode']);empty.format=safe.format;empty.importOptions.profile=safe.profile;
  if(typeof safe.id!=='string'||!safe.id.trim()||typeof safe.question!=='string'||!safe.question.trim())throw new TypeError('Import context requires nonempty id and question');
  if(typeof input!=='string'||!bounded(input))throw new RangeError('Full native input must be a string of at most 256 KiB UTF-8');
  const parsed=readFullSource(input,safe.format);
  return {ok:true,...parsed,source:receipt(input,safe.format,parsed),diagnostics:[],profile:safe.profile};
 }catch(reason){return {ok:false,source:empty,diagnostics:[error(reason)],identityMap:[]};}
}
export function exportFullVisual(input:unknown,requested:unknown):ExportVisualResult {
 let source:RetainedVisualSource|undefined;
 try{
  if(plain(requested)){const descriptor=Object.getOwnPropertyDescriptor(requested,'source');if(descriptor&&Object.hasOwn(descriptor,'value'))source=retained(descriptor.value).source;}
 }catch{/* Invalid companions are not trusted. */}
 try{
  const safe=options(requested,['format','profile','mode','source','original']),document=copyJson(input) as unknown as Document;
  if(safe.original!==undefined&&typeof safe.original!=='boolean')throw new TypeError('Original selector must be boolean');
  const prior=safe.source===undefined?undefined:retained(safe.source);source=prior?.source??source;
  if(prior&&(prior.source.format!==safe.format||prior.source.importOptions.profile!==safe.profile))throw new TypeError('Retained native profile does not match requested format');
  if(safe.original){
   if(!prior||canonical(document)!==prior.source.baseline)throw new TypeError('Original replay requires an unchanged independently reparsed source');
   const {document:_document,...proof}=prior.parsed;
   return {ok:true,text:prior.source.text,source:prior.source,diagnostics:[],profile:safe.profile,...proof};
  }
  // A preserving native update is a separate operation. Refuse rather than drop
  // native edits that are not expressible through the authored visual fields.
  if(prior)throw new TypeError('Full profile updates with retained native content require original replay; regenerate explicitly without source to replace native presentation');
  const native=tryNativeFirstExport(document,safe.format);
  if(native){
   if(!bounded(native.text))throw new RangeError('Native-profile output exceeds 256 KiB UTF-8');
   return {ok:true,text:native.text,diagnostics:[],profile:safe.profile,identityMap:native.identityMap,coverage:native.coverage,approximations:[],representation:native.representation};
  }
  const scene=compileFullScene(document,safe.format),adapter=adapters[safe.format as InterchangeFormat],text=adapter.emit(scene);
  if(!bounded(text))throw new RangeError('Full native output exceeds 256 KiB UTF-8');
  const actual=adapter.read(text),readback=documentFrom(actual);
  if(canonical(compileFullRecords(document))!==canonical(compileFullRecords(readback)))throw new TypeError('Independent full native readback differs from authored source');
  return {ok:true,text,diagnostics:[],profile:safe.profile,...evidence(actual),approximations:actual.approximations,representation:{tier:'primitive-fallback',sourceProfile:actual.profile,sourceMappingVersion:'0.1.0',coverageModel:'visible-record-tree',wholeDocumentReadback:true}};
 }catch(reason){return {ok:false,...(source?{source}:{}),diagnostics:[error(reason)],identityMap:[]};}
}
