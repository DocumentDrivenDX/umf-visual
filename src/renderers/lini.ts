// SPDX-License-Identifier: MIT OR Apache-2.0
/** Browser-only, integrity-pinned native Lini rendering for compiled UMF visuals. */
import {compilePresentation,type PresentationDiagnostic,type PresentationOptions,type PresentationPlan} from '../presentation/index.js';
import type {Document} from '@umf/core';
import {SaxesParser,type SaxesAttributeNS,type SaxesTag} from 'saxes';
import pin from '../../spec/interchange/lini-runtime.json';

export interface LiniRendererOptions {
  direction?:PresentationOptions['direction'];
  theme?:PresentationOptions['theme'];
  /** Base URL containing the pinned Lini runtime assets; relative strings resolve from this module. */
  runtimeBaseUrl?:string|URL;
}
export type LiniPresentationResult=(PresentationPlan&{svg:string;nativeVersion:string})|{ok:false;diagnostics:PresentationDiagnostic[]};

interface LiniRuntime {
  default(options:{module_or_path:Uint8Array}):Promise<unknown>;
  version():string;
  diagnostics(source:string,options:unknown):string;
  compile(source:string,options:unknown):string;
}
interface NativeDiagnostic {message?:unknown;severity?:unknown;code?:unknown;range?:unknown}
interface NativeDiagnosticReport {diagnostics?:unknown}

const runtimeCache=new Map<string,Promise<{runtime:LiniRuntime;version:string}>>();
const diagnostic=(code:string,message:string,path='/'):PresentationDiagnostic=>({code,path,message,severity:'error'});
const fail=(code:string,message:string,path='/'):LiniPresentationResult=>({ok:false,diagnostics:[diagnostic(code,message,path)]});
const errorMessage=(error:unknown)=>error instanceof Error?error.message:String(error);
const expectedVersion=pin.version;
const runtimeAssets=pin.assets;

function optionValues(input:LiniRendererOptions|undefined):{direction?:PresentationOptions['direction'];theme?:PresentationOptions['theme'];runtimeBaseUrl?:string|URL}|undefined {
  if(input===undefined)return {};
  if(!input||typeof input!=='object'||Array.isArray(input))return;
  const prototype=Object.getPrototypeOf(input);
  if(prototype!==Object.prototype&&prototype!==null)return;
  const descriptors=Object.getOwnPropertyDescriptors(input),keys=Reflect.ownKeys(descriptors);
  if(keys.some(key=>typeof key!=='string'||!['direction','theme','runtimeBaseUrl'].includes(key)))return;
  const values:Record<string,unknown>=Object.create(null);
  for(const key of keys){const descriptor=descriptors[key as keyof typeof descriptors];if(!descriptor||!('value'in descriptor))return;values[key as string]=descriptor.value;}
  if(values.direction!==undefined&&values.direction!=='LR'&&values.direction!=='TB')return;
  if(values.theme!==undefined&&values.theme!=='presentation/1')return;
  if(values.runtimeBaseUrl!==undefined&&typeof values.runtimeBaseUrl!=='string'&&!(values.runtimeBaseUrl instanceof URL))return;
  return values as {direction?:PresentationOptions['direction'];theme?:PresentationOptions['theme'];runtimeBaseUrl?:string|URL};
}

function runtimeBaseUrl(value:string|URL|undefined):URL {
  const base=value===undefined?new URL('./lini-runtime/',import.meta.url):new URL(value,import.meta.url);
  if(base.protocol!=='http:'&&base.protocol!=='https:')throw new Error('The Lini runtime base URL must use HTTP or HTTPS.');
  if(base.username||base.password)throw new Error('The Lini runtime base URL cannot contain credentials.');
  if(!base.pathname.endsWith('/'))base.pathname+='/';
  return base;
}

async function sha256(bytes:Uint8Array):Promise<string> {
  if(!globalThis.crypto?.subtle)throw new Error('Web Crypto SHA-256 is unavailable; use a secure browser context.');
  const copy=new ArrayBuffer(bytes.byteLength);new Uint8Array(copy).set(bytes);
  const digest=await crypto.subtle.digest('SHA-256',copy);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function fetchVerifiedAsset(url:URL,name:string,expected:string):Promise<Uint8Array> {
  const response=await fetch(url,{cache:'force-cache'});
  if(!response.ok)throw new Error(`Pinned Lini asset ${name} request failed (${response.status}).`);
  const bytes=new Uint8Array(await response.arrayBuffer());
  const actual=await sha256(bytes);
  if(actual!==expected)throw new Error(`Pinned Lini asset ${name} failed SHA-256 verification.`);
  return bytes;
}

async function initializeLini(base:URL):Promise<{runtime:LiniRuntime;version:string}> {
  if(typeof URL.createObjectURL!=='function')throw new Error('Blob module URLs are unavailable in this browser context.');
  const jsAsset=runtimeAssets.find(asset=>asset.name==='lini_wasm.js');
  const wasmAsset=runtimeAssets.find(asset=>asset.name==='lini_wasm_bg.wasm');
  if(!jsAsset||!wasmAsset)throw new Error('The pinned Lini runtime manifest is incomplete.');
  const [javascript,wasm]=await Promise.all([
    fetchVerifiedAsset(new URL(jsAsset.name,base),jsAsset.name,jsAsset.sha256),
    fetchVerifiedAsset(new URL(wasmAsset.name,base),wasmAsset.name,wasmAsset.sha256),
  ]);
  const jsBuffer=new ArrayBuffer(javascript.byteLength);new Uint8Array(jsBuffer).set(javascript);
  const moduleUrl=URL.createObjectURL(new Blob([jsBuffer],{type:'text/javascript;charset=utf-8'}));
  let runtime:LiniRuntime;
  try{runtime=await import(/* @vite-ignore */ moduleUrl) as LiniRuntime;}
  finally{URL.revokeObjectURL(moduleUrl);}
  if(!runtime||typeof runtime.default!=='function'||typeof runtime.version!=='function'||typeof runtime.compile!=='function'||typeof runtime.diagnostics!=='function'){
    throw new Error('The pinned Lini JavaScript module is missing a required runtime export.');
  }
  await runtime.default({module_or_path:wasm});
  const version=runtime.version();
  if(version!==expectedVersion)throw new Error(`Pinned Lini runtime version mismatch: expected ${expectedVersion}, received ${String(version)}.`);
  return {runtime,version};
}

function loadLini(base:URL):Promise<{runtime:LiniRuntime;version:string}> {
  const key=base.href;
  let pending=runtimeCache.get(key);
  if(!pending){
    pending=initializeLini(base);
    runtimeCache.set(key,pending);
    void pending.catch(()=>{if(runtimeCache.get(key)===pending)runtimeCache.delete(key);});
  }
  return pending;
}

function nativeDiagnostics(text:string):PresentationDiagnostic[] {
  let report:NativeDiagnosticReport;
  try{report=JSON.parse(text) as NativeDiagnosticReport;}catch{return [diagnostic('LINI_DIAGNOSTICS','Pinned Lini returned malformed diagnostic JSON.')];}
  if(!Array.isArray(report?.diagnostics))return [diagnostic('LINI_DIAGNOSTICS','Pinned Lini returned an invalid diagnostic report.')];
  return (report.diagnostics as NativeDiagnostic[]).map(item=>({
    code:typeof item?.code==='string'?'LINI_'+item.code:'LINI_NATIVE_DIAGNOSTIC',
    path:'/',
    message:typeof item?.message==='string'?item.message:JSON.stringify(item),
    severity:item?.severity==='warning'?'warning':'error',
  }));
}

function safeSvg(svg:string):boolean {
  if(!svg||svg.length>8_000_000)return false;
  let rootSeen=false,ended=false,unsafe=false;
  const parser=new SaxesParser({xmlns:true});
  const checkTag=(tag:SaxesTag)=>{
    const local=(tag.local??tag.name).toLowerCase();
    if(!rootSeen){rootSeen=true;if(local!=='svg'||tag.uri!=='http://www.w3.org/2000/svg')unsafe=true;}
    if(['script','foreignobject','iframe','object','embed'].includes(local))unsafe=true;
    for(const value of Object.values(tag.attributes) as SaxesAttributeNS[]){
      if(/^on/iu.test(value.local))unsafe=true;
      if(value.local.toLowerCase()==='href'&&value.value.trim()&&!value.value.trim().startsWith('#'))unsafe=true;
      if(value.local.toLowerCase()==='style'&&/url\s*\(/iu.test(value.value))unsafe=true;
    }
  };
  parser.on('opentag',checkTag);
  parser.on('doctype',()=>{unsafe=true;});
  parser.on('processinginstruction',()=>{unsafe=true;});
  parser.on('error',()=>{unsafe=true;});
  parser.on('end',()=>{ended=true;});
  try{parser.write(svg).close();}catch{return false;}
  return rootSeen&&ended&&!unsafe;
}

/** Compile and render one unchanged UMF document with the exact pinned Lini 1.1.0 WASM runtime. */
export async function renderLiniPresentation(document:Document,options?:LiniRendererOptions):Promise<LiniPresentationResult> {
  const values=optionValues(options);
  if(!values)return fail('LINI_OPTIONS','Options must be a plain data object containing only direction, theme, and runtimeBaseUrl.');
  const plan=compilePresentation(document,{backend:'lini',...(values.direction?{direction:values.direction}:{}),...(values.theme?{theme:values.theme}:{})});
  if(!plan.ok)return plan;
  let base:URL;
  try{base=runtimeBaseUrl(values.runtimeBaseUrl);}catch(error){return fail('LINI_RUNTIME_URL',errorMessage(error));}
  let loaded:{runtime:LiniRuntime;version:string};
  try{loaded=await loadLini(base);}catch(error){return fail('LINI_RUNTIME',errorMessage(error));}
  let diagnostics:PresentationDiagnostic[];
  try{diagnostics=nativeDiagnostics(loaded.runtime.diagnostics(plan.source,{}));}
  catch(error){return fail('LINI_DIAGNOSTICS',`Pinned Lini diagnostics failed: ${errorMessage(error)}`);}
  if(diagnostics.length)return {ok:false,diagnostics};
  let svg:string;
  try{svg=loaded.runtime.compile(plan.source,{});}catch(error){return fail('LINI_COMPILE',`Pinned Lini compilation failed: ${errorMessage(error)}`);}
  if(!safeSvg(svg))return fail('LINI_SVG','Pinned Lini did not return safe, well-formed SVG.');
  return {...plan,svg,nativeVersion:loaded.version};
}
