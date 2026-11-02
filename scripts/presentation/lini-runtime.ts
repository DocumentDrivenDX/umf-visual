// SPDX-License-Identifier: MIT OR Apache-2.0
/** Host-only execution of the independently pinned Lini compiler. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {liniDirectory,verifyLiniRuntime} from '../interchange-runtime';

interface LiniRuntime {
 default(options:{module_or_path:Uint8Array}):Promise<void>;
 version?:()=>string;
 diagnostics(source:string,options:unknown):string;
 compile(source:string,options:unknown):string;
 desugar(source:string,options:unknown):string;
}
let initialized:Promise<{runtime:LiniRuntime;version:string}>|undefined;
export function loadPresentationLini(){
 return initialized??= (async()=>{
  const pin=await verifyLiniRuntime();
  const runtime=await import(pathToFileURL(resolve(liniDirectory,'lini_wasm.js')).href) as LiniRuntime;
  await runtime.default({module_or_path:await readFile(resolve(liniDirectory,'lini_wasm_bg.wasm'))});
  if(runtime.version&&runtime.version()!==pin.version)throw Error('Lini initialized version differs from the pinned runtime.');
  return {runtime,version:pin.version};
 })();
}
export async function renderPresentationLini(source:string):Promise<{svg:string;nativeAst:string;version:string}>{
 const {runtime,version}=await loadPresentationLini();
 const report=JSON.parse(runtime.diagnostics(source,{}));
 if(!Array.isArray(report.diagnostics)||report.diagnostics.length)throw Error('Lini native diagnostics: '+JSON.stringify(report.diagnostics??report));
 const svg=runtime.compile(source,{}),nativeAst=runtime.desugar(source,{});
 if(!svg.includes('<svg')||!nativeAst.trim())throw Error('Lini did not produce native SVG and desugared source.');
 return {svg,nativeAst,version};
}
