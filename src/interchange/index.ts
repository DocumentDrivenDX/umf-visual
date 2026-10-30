// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson,type Document} from '@umf/core';
import {VISUAL_EXTENSION,createVisualDocument,getVisual,inspectVisual} from '../extensions/visual';
import {dotAdapter} from './dot';
import {liniAdapter} from './lini';
import {mermaidAdapter} from './mermaid';
import {interchangeDiagnostic} from './shared';
import {exportAnnotatedVisual,hasExplicitProfile,importAnnotatedVisual} from './annotated';
import type {ExportVisualOptions,ExportVisualResult,IdentityMapping,ImportVisualOptions,ImportVisualResult,InterchangeDiagnostic,InterchangeFormat,InterchangeMode,RetainedVisualSource,VisualInterchangeAdapter} from './types';
export * from './types';
export {dotAdapter} from './dot';
export {mermaidAdapter} from './mermaid';
export {liniAdapter} from './lini';

const MAX_SOURCE_BYTES=262_144;
const VISUAL_EXTENSION_PATH='/extensions/'+VISUAL_EXTENSION;
const adapters:Record<InterchangeFormat,VisualInterchangeAdapter>={dot:dotAdapter,mermaid:mermaidAdapter,lini:liniAdapter};
export const interchangeCapabilities=[
 ...Object.values(adapters).map(({format,version,subset})=>({format,profile:format==='lini'?'umf.visual.lini/1':'umf.visual.'+format+'/1',version,subset,directions:['import','export'] as ('import'|'export')[]})),
 {format:'dot' as const,profile:'umf.visual.dot.annotated/1',version:'0.1.0',subset:'Explicit opt-in visual 1.0.0 profile: directed flows, entity/containment structures, sequence rails/rungs and state views, with visible typed application/provenance annotations; full-document and canonical native AST readback. Other families refuse until independently qualified.',directions:['import','export'] as ('import'|'export')[]},
 {format:'lini' as const,profile:'umf.visual.lini.annotated/1',version:'0.1.0',subset:'Explicit opt-in visual 1.0.0 profile for pinned Lini 1.1.0 chart/table/grid metric, timeline and comparison forms, with visible typed application/provenance annotations; full-document and canonical native AST readback.',directions:['import','export'] as ('import'|'export')[]},
];
const error=(code:string,path:string,message:string)=>interchangeDiagnostic(code,path,message,{severity:'error',loss:false});
const loss=(code:string,path:string,message:string)=>interchangeDiagnostic(code,path,message,{severity:'warning',loss:true});
function canonical(value:unknown):string{
 const sort=(v:any):any=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
 return JSON.stringify(sort(value));
}
function admitted<T>(value:unknown):T{return copyJson(value) as T;}
function policyRefusal(diagnostics:InterchangeDiagnostic[],mode:InterchangeMode):boolean{return diagnostics.some(d=>d.severity==='error'||(mode==='strict'&&d.loss));}
function adapterFor(format:unknown):VisualInterchangeAdapter|undefined{return typeof format==='string'&&Object.hasOwn(adapters,format)?adapters[format as InterchangeFormat]:undefined;}
function canonicalDoc(doc:Document):string{return canonical(doc);}

/** Safe facade over bounded native adapters. All caller JSON is admitted before traversal. */
export function importVisual(source:unknown,options:unknown):ImportVisualResult{
 if(hasExplicitProfile(options))return importAnnotatedVisual(source,options);
 let safeOptions:ImportVisualOptions|undefined,text='';const diagnostics:InterchangeDiagnostic[]=[],empty:RetainedVisualSource={format:'dot',text:'',importOptions:{id:'',question:''},baseline:'',identityMap:[]};
 try{safeOptions=admitted<ImportVisualOptions>(options);}catch{return{ok:false,source:{...empty,text:typeof source==='string'?source:''},diagnostics:[error('INTERCHANGE_OPTIONS','/options','Options are not safe JSON data.')],identityMap:[]};}
 if(!safeOptions||typeof safeOptions!=='object'||Array.isArray(safeOptions)||Object.keys(safeOptions).some(key=>!['format','id','question','mode'].includes(key)))return{ok:false,source:{...empty,text:typeof source==='string'?source:''},diagnostics:[error('INTERCHANGE_OPTIONS','/options','Options must be a plain object containing only format, id, question and optional mode.')],identityMap:[]};
 const format=safeOptions?.format,adapter=adapterFor(format);if(!adapter){const receipt={...empty,...(format==='dot'||format==='mermaid'||format==='lini'?{format}:{}),text:typeof source==='string'?source:''};return{ok:false,source:receipt,diagnostics:[error('INTERCHANGE_FORMAT','/options/format','Unknown interchange format.')],identityMap:[]};}
 if(typeof source==='string'){
  text=source;
  if(text.length>MAX_SOURCE_BYTES||new TextEncoder().encode(text).byteLength>MAX_SOURCE_BYTES)return{ok:false,source:{...empty,format:adapter.format,text},diagnostics:[error('INTERCHANGE_SOURCE_SIZE','/source','Native source exceeds the 256 KiB UTF-8 limit.')],identityMap:[]};
 }
 let safeSource:unknown;try{safeSource=admitted(source);}catch{return{ok:false,source:{...empty,format:adapter.format,text:typeof source==='string'?source:''},diagnostics:[error('INTERCHANGE_SOURCE','/source','Native source must be a safe JSON string.')],identityMap:[]};}
 if(typeof safeSource!=='string')return{ok:false,source:{...empty,format:adapter.format},diagnostics:[error('INTERCHANGE_SOURCE','/source','Native source must be a string.')],identityMap:[]};text=safeSource;
 const receipt:RetainedVisualSource={format:adapter.format,text,importOptions:{id:typeof safeOptions.id==='string'?safeOptions.id:'',question:typeof safeOptions.question==='string'?safeOptions.question:''},baseline:'',identityMap:[]};
 if(typeof safeOptions.id!=='string'||!safeOptions.id.trim()||typeof safeOptions.question!=='string'||!safeOptions.question.trim())diagnostics.push(error('INTERCHANGE_CONTEXT','/options','Import id and question must be nonempty strings.'));
 if(safeOptions.mode!==undefined&&safeOptions.mode!=='strict'&&safeOptions.mode!=='allow-reported-loss')diagnostics.push(error('INTERCHANGE_MODE','/options/mode','Unknown interchange loss policy.'));
 if(new TextEncoder().encode(text).byteLength>MAX_SOURCE_BYTES)diagnostics.push(error('INTERCHANGE_SOURCE_SIZE','/source','Native source exceeds the 256 KiB UTF-8 limit.'));
 if(diagnostics.length)return{ok:false,source:receipt,diagnostics,identityMap:[]};
 let parsed;try{parsed=adapter.parse(text,{id:safeOptions.id,question:safeOptions.question});}catch{return{ok:false,source:receipt,diagnostics:[error('INTERCHANGE_ADAPTER','/source','Adapter refused the input without producing a safe result.')],identityMap:[]};}
 diagnostics.push(...parsed.diagnostics);const mappings=parsed.identityMap;
 if(!parsed.visual){return{ok:false,source:receipt,diagnostics,identityMap:[]};}
 try{
  const document=createVisualDocument(parsed.visual);
  const checked=inspectVisual(document);
  for(const d of checked.diagnostics){diagnostics.push({code:d.code,path:d.path,message:d.message,severity:d.severity,loss:d.severity==='warning'});}
  if(!checked.valid||!checked.complete){return{ok:false,source:receipt,diagnostics,identityMap:[]};}
  receipt.baseline=canonicalDoc(document);receipt.identityMap=admitted(mappings);
  const mode=safeOptions.mode??'strict';
  if(policyRefusal(diagnostics,mode))return{ok:false,source:receipt,diagnostics,identityMap:[]};
  return{ok:true,document,source:receipt,diagnostics,identityMap:mappings};
 }catch{return{ok:false,source:receipt,diagnostics:[...diagnostics,error('INTERCHANGE_VISUAL','/source','Parsed content does not form a valid Visual document.')],identityMap:[]};}
}

function copyReceipt(value:unknown):RetainedVisualSource|undefined{
 try{const receipt=admitted<RetainedVisualSource>(value);if(!receipt||typeof receipt!=='object'||Array.isArray(receipt))return;
  if(Object.keys(receipt).some(key=>!['format','text','importOptions','baseline','identityMap'].includes(key))||!adapterFor(receipt.format)||typeof receipt.text!=='string'||typeof receipt.baseline!=='string'||!receipt.importOptions||typeof receipt.importOptions!=='object'||Array.isArray(receipt.importOptions))return;
  if(Object.keys(receipt.importOptions).some(key=>!['id','question'].includes(key))||typeof receipt.importOptions.id!=='string'||!receipt.importOptions.id.trim()||typeof receipt.importOptions.question!=='string'||!receipt.importOptions.question.trim())return;
  if(!Array.isArray(receipt.identityMap)||receipt.identityMap.some(item=>!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(key=>!['kind','nativeId','visualId','path','sourcePath'].includes(key))||!['node','edge','group','field','reference','participant','message'].includes(item.kind)||typeof item.nativeId!=='string'||typeof item.visualId!=='string'||typeof item.path!=='string'||(item.sourcePath!==undefined&&typeof item.sourcePath!=='string')))return;
  return receipt;
 }catch{return;}
}
function addDocumentLosses(document:Document,visual:any,diagnostics:InterchangeDiagnostic[]):void{
 const knownEnvelope=new Set(['umf','id','vocabularies','extensions','modules']);
 for(const key of Object.keys(document as any))if(!knownEnvelope.has(key))diagnostics.push(loss('INTERCHANGE_ENVELOPE','/'+key,'Envelope field is outside the visual projection and is omitted.'));
 const vocab=(document as any).vocabularies??{};for(const [key,value]of Object.entries(vocab))if(key!==VISUAL_EXTENSION||JSON.stringify(value)!==JSON.stringify({version:'1.0.0'}))diagnostics.push(loss('INTERCHANGE_VOCABULARY','/vocabularies/'+key,'Vocabulary metadata is outside the native visual projection and is omitted.'));
 const extensions=(document as any).extensions??{};for(const key of Object.keys(extensions))if(key!==VISUAL_EXTENSION)diagnostics.push(loss('INTERCHANGE_EXTENSION','/extensions/'+key,'Extension content is outside the native visual projection and is omitted.'));
 const modules=(document as any).modules??[];if(modules.length)diagnostics.push(loss('INTERCHANGE_MODULES','/modules','Module and element metadata are outside the native visual projection and are omitted.'));
 const inspected=inspectVisual(document);for(const item of inspected.diagnostics)if(item.code==='VISUAL_UNKNOWN')diagnostics.push(loss('INTERCHANGE_UNKNOWN_VISUAL',item.path,'Unknown visual extension content has no known native encoding and is omitted.'));
}
function auditVisualProjection(format:InterchangeFormat,visual:any,diagnostics:InterchangeDiagnostic[]):void{
 const root=VISUAL_EXTENSION_PATH,allowed=new Map<string,string[]>();
 const rootFields=['id','kind','form','question'];if(format==='dot'||format==='mermaid'||format==='lini')rootFields.push('title');
 if(visual.kind==='flow')rootFields.push('nodes','edges',...(format==='dot'?['groups']:[]));
 else if(format==='mermaid'&&visual.kind==='sequence')rootFields.push('sequence','groups');
 else if(format!=='dot'&&visual.kind==='structure'&&visual.form==='entities')rootFields.push('nodes','structure');
 allowed.set(root,rootFields);
 if(visual.kind==='flow'){
  allowed.set(root+'/nodes',format==='dot'?['id','label','detail','group']:format==='lini'?['id','label','detail']:['id','label']);allowed.set(root+'/edges',format==='dot'?['id','from','to','label','why']:['id','from','to','label']);
  if(format==='dot')allowed.set(root+'/groups/*',['id','label','detail','parent']);
 }else if(format==='mermaid'&&visual.kind==='sequence'){
  allowed.set(root+'/sequence',['participants','messages']);
  allowed.set(root+'/sequence/participants/*',['id','label','role']);
  allowed.set(root+'/sequence/messages/*',['id','from','to','label','kind','group']);
  allowed.set(root+'/groups/*',['id','label','role','parent']);
 }else if(format!=='dot'&&visual.kind==='structure'&&visual.form==='entities'){
  allowed.set(root+'/nodes',format==='lini'?['id','label','detail']:['id','label']);allowed.set(root+'/structure',['entities','references']);
  allowed.set(root+'/structure/entities/*',['node','fields']);allowed.set(root+'/structure/entities/*/fields/*',['name','type']);
  if(format==='mermaid')for(const p of [root+'/structure/entities/*/fields/*'])allowed.get(p)!.push('keys','nullable');
  allowed.set(root+'/structure/references/*',['id','from','to','label','fromCardinality','toCardinality']);
  allowed.set(root+'/structure/references/*/from',['node','field']);allowed.set(root+'/structure/references/*/to',['node','field']);
 }
 if(format==='mermaid'&&visual.kind==='structure')for(const [index,reference] of (visual.structure?.references??[]).entries())if(reference.label===undefined){const path=root+'/structure/references/'+index+'/label';diagnostics.push(loss('INTERCHANGE_UNREPRESENTED_FIELD',path,'Mermaid ER syntax emits an empty relationship label when the visual label is absent.'));}
 const emitted=new Set(diagnostics.map(d=>d.path));
 const walk=(value:any,path:string)=>{
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){value.forEach((item,index)=>walk(item,path+'/'+index));return;}
  const schemaPath=path.replace(/\/\d+(?=\/|$)/g,'/*');const accepted=allowed.get(schemaPath)??allowed.get(schemaPath.replace(/\/\*$/,''))??allowed.get(path);
  for(const key of Object.keys(value)){
   const itemPath=path+'/'+key;
   if(!accepted?.includes(key)&&!emitted.has(itemPath))diagnostics.push(loss('INTERCHANGE_UNREPRESENTED_FIELD',itemPath,'This visual field is not represented by the selected native subset.'));
   walk(value[key],itemPath);
  }
 };
 walk(visual,VISUAL_EXTENSION_PATH);
}
function modeOf(options:ExportVisualOptions):InterchangeMode{const mode=options.mode??'strict';return mode==='strict'||mode==='allow-reported-loss'?mode:'strict';}
function replay(document:Document,receipt:RetainedVisualSource,requested:InterchangeFormat):ExportVisualResult|undefined{
 if(receipt.format!==requested)return;
 const diagnostics:InterchangeDiagnostic[]=[],adapter=adapterFor(receipt.format);if(!adapter||typeof receipt.text!=='string'||typeof receipt.baseline!=='string')return;
 const sourceOptions=receipt.importOptions;if(!sourceOptions||typeof sourceOptions.id!=='string'||typeof sourceOptions.question!=='string'||!sourceOptions.id.trim()||!sourceOptions.question.trim())return;
 if(receipt.text.length>MAX_SOURCE_BYTES||new TextEncoder().encode(receipt.text).byteLength>MAX_SOURCE_BYTES)return;
 const current=canonicalDoc(document);if(current!==receipt.baseline){diagnostics.push(error('INTERCHANGE_REPLAY_CHANGED','/','Document differs from the retained import baseline.'));return{ok:false,source:receipt,diagnostics,identityMap:[]};}
 let fresh;try{fresh=adapter.parse(receipt.text,sourceOptions);}catch{return{ok:false,source:receipt,diagnostics:[error('INTERCHANGE_REPLAY_PARSE','/source','Retained source no longer parses in its adapter profile.')],identityMap:[]};}
 diagnostics.push(...fresh.diagnostics.filter(d=>d.severity==='error'));
 if(diagnostics.length||!fresh.visual)return{ok:false,source:receipt,diagnostics,identityMap:[]};
 let derived:Document;try{derived=createVisualDocument(fresh.visual);}catch{return{ok:false,source:receipt,diagnostics:[error('INTERCHANGE_REPLAY_VISUAL','/source','Retained source no longer derives a valid visual document.')],identityMap:[]};}
 if(canonicalDoc(derived)!==current){return{ok:false,source:receipt,diagnostics:[error('INTERCHANGE_REPLAY_DERIVATION','/','Current document does not match the visual independently rederived from retained source.')],identityMap:[]};}
 return{ok:true,text:receipt.text,source:receipt,diagnostics,identityMap:fresh.identityMap};
}
/** Export an admitted public core document to a bounded native profile. */
export function exportVisual(input:unknown,optionsInput:unknown):ExportVisualResult{
 if(hasExplicitProfile(optionsInput))return exportAnnotatedVisual(input,optionsInput);
 let document:Document,options:ExportVisualOptions;
 try{document=admitted<Document>(input);options=admitted<ExportVisualOptions>(optionsInput);}catch{return{ok:false,diagnostics:[error('INTERCHANGE_INPUT','/','Document and export options must be safe JSON data.')],identityMap:[]};}
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!['format','mode','source','original'].includes(key)))return{ok:false,diagnostics:[error('INTERCHANGE_OPTIONS','/options','Export options must be a plain object containing only format, mode, source and original.')],identityMap:[]};
 const adapter=adapterFor(options?.format);if(!adapter)return{ok:false,diagnostics:[error('INTERCHANGE_FORMAT','/options/format','Unknown interchange format.')],identityMap:[]};
 if(options.mode!==undefined&&options.mode!=='strict'&&options.mode!=='allow-reported-loss')return{ok:false,diagnostics:[error('INTERCHANGE_MODE','/options/mode','Unknown interchange loss policy.')],identityMap:[]};
 if(options.original!==undefined&&typeof options.original!=='boolean')return{ok:false,diagnostics:[error('INTERCHANGE_OPTIONS','/options/original','Original replay selector must be a boolean.')],identityMap:[]};
 const mode=modeOf(options),source=options.source===undefined?undefined:copyReceipt(options.source);
 if(options.source!==undefined&&!source)return{ok:false,diagnostics:[error('INTERCHANGE_RECEIPT','/options/source','Source companion is not safe JSON data.')],identityMap:[]};
 if(source&&(source.text.length>MAX_SOURCE_BYTES||new TextEncoder().encode(source.text).byteLength>MAX_SOURCE_BYTES))return{ok:false,source,diagnostics:[error('INTERCHANGE_SOURCE_SIZE','/options/source/text','Retained source exceeds the 256 KiB UTF-8 limit.')],identityMap:[]};
 if(options.original===true){if(!source)return{ok:false,diagnostics:[error('INTERCHANGE_REPLAY_SOURCE','/options/source','Original replay requires a retained source companion.')],identityMap:[]};return replay(document,source,adapter.format)??{ok:false,source,diagnostics:[error('INTERCHANGE_REPLAY_REFUSED','/options/source','Retained source cannot be safely replayed for this format and document.')],identityMap:[]};}
 let visual;try{const checked=inspectVisual(document);if(!checked.valid||!checked.complete)return{ok:false,diagnostics:checked.diagnostics.map(item=>({code:item.code,path:item.path,message:item.message,severity:item.severity,loss:false})),identityMap:[]};visual=getVisual(document);}catch{return{ok:false,diagnostics:[error('INTERCHANGE_DOCUMENT','/','Document does not contain a valid Visual payload.')],identityMap:[]};}
 const diagnostics:InterchangeDiagnostic[]=[];addDocumentLosses(document,visual,diagnostics);
 let serialized;try{serialized=adapter.serialize(visual,{id:visual.id,question:visual.question});}catch{return{ok:false,source,diagnostics:[...diagnostics,error('INTERCHANGE_ADAPTER','/','Adapter refused the document without producing a safe result.')],identityMap:[]};}
 diagnostics.push(...serialized.diagnostics);
 auditVisualProjection(adapter.format,visual,diagnostics);
 if(source){
  const sourceAdapter=adapterFor(source.format);
  try{if(!sourceAdapter)throw new Error('format');const parsed=sourceAdapter.parse(source.text,source.importOptions);for(const item of parsed.diagnostics)if(item.severity==='error'||item.loss)diagnostics.push({...item,path:'/source'+(item.path.startsWith('/source')?item.path.slice(7):item.path)});if(!parsed.visual)diagnostics.push(error('INTERCHANGE_SOURCE_PARSE','/source','Retained source does not produce a complete supported visual projection.'));}catch{diagnostics.push(error('INTERCHANGE_SOURCE_PARSE','/source','Retained source could not be safely reparsed.'));}
 }
 if(serialized.text&&new TextEncoder().encode(serialized.text).byteLength>MAX_SOURCE_BYTES)diagnostics.push(error('INTERCHANGE_OUTPUT_SIZE','/','Native output exceeds the 256 KiB UTF-8 limit.'));
 if(!serialized.text||policyRefusal(diagnostics,mode))return{ok:false,source,diagnostics,identityMap:serialized.identityMap};
 return{ok:true,text:serialized.text,source,diagnostics,identityMap:serialized.identityMap};
}
