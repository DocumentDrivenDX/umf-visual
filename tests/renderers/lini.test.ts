// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import pin from '../../spec/interchange/lini-runtime.json';

const runtimeDirectory=process.env.LINI_RUNTIME_DIR??'.cache/lini';
const mime:Record<string,string>={'.js':'text/javascript;charset=utf-8','.wasm':'application/wasm','.html':'text/html;charset=utf-8'};
const sha=(bytes:Uint8Array)=>new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
let nativeGeometryEvidence:Record<string,unknown>|undefined;

test('the public Lini renderer uses pinned browser assets, preserves rich cases, and fails closed',async()=>{
 const rendererSource=readFileSync('src/renderers/lini.ts','utf8');
 expect(rendererSource).not.toMatch(/from\s+['"]node:|require\s*\(/u);
 const assets=new Map(pin.assets.map(asset=>[asset.name,new Uint8Array(readFileSync(join(runtimeDirectory,asset.name)))]));
 for(const asset of pin.assets)expect(sha(assets.get(asset.name)!)).toBe(asset.sha256);
 const bundle=await Bun.build({entrypoints:['tests/renderers/lini.browser.ts'],target:'browser',format:'esm'});
 expect(bundle.success,bundle.logs.map(log=>log.message).join('\n')).toBe(true);
 const app=await bundle.outputs[0]!.text();
 const counts=new Map<string,number>();
 const browser=await chromium.launch({headless:true});
 const server=Bun.serve({hostname:'localhost',port:0,async fetch(request){
  const path=new URL(request.url).pathname;
  if(path==='/app.js')return new Response(app,{headers:{'content-type':'text/javascript;charset=utf-8'}});
  if(path==='/')return new Response('<!doctype html><meta charset="utf-8"><title>Lini renderer consumer</title><script type="module" src="/app.js"></script>',{headers:{'content-type':'text/html;charset=utf-8'}});
  const match=/^\/(?:(alternate|tampered|tampered-js)\/)?lini-runtime\/([^/]+)$/u.exec(path);
  if(match){
   const bucket=match[1]??'default';
   const asset=match[2]!;counts.set(`${bucket}/${asset}`,(counts.get(`${bucket}/${asset}`)??0)+1);
   const bytes=assets.get(asset);if(!bytes)return new Response('Not found',{status:404});
   const tamper=bucket==='tampered'&&asset==='lini_wasm_bg.wasm'||bucket==='tampered-js'&&asset==='lini_wasm.js';
   const returned=tamper?Uint8Array.from(bytes,(_,index)=>index===0?bytes[index]!^1:bytes[index]!):bytes;
   return new Response(returned,{headers:{'content-type':mime[asset.endsWith('.wasm')?'.wasm':'.js']!}});
  }
  return new Response('Not found',{status:404});
 }});
 try{
  const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(server.url.href,{waitUntil:'load'});
  await page.waitForFunction(()=>Boolean((window as any).liniBrowserResult),undefined,{timeout:60_000});
  const result=await page.evaluate(()=>{
   const value=(window as any).liniBrowserResult;
   return {
    renders:value.renders.map((render:any)=>render.ok?{
     ok:true,nativeVersion:render.nativeVersion,nativeFormat:render.nativeFormat,source:render.source,svg:render.svg,
     entityCount:render.elementMap.filter((item:any)=>item.kind==='entity').length,
     fieldCount:render.elementMap.filter((item:any)=>item.kind==='field').length,
     referenceCount:render.elementMap.filter((item:any)=>item.kind==='reference').length,
     mappedEdges:render.elementMap.filter((item:any)=>item.kind==='edge').map((item:any)=>({logicalId:item.logicalId,nativeId:item.nativeId,sourcePath:item.sourcePath})),
     participantCount:render.elementMap.filter((item:any)=>item.kind==='participant').length,
     messageCount:render.elementMap.filter((item:any)=>item.kind==='message').length,
     omissions:render.omissions,
    }:render),
     custom:value.custom.ok?{ok:true,nativeVersion:value.custom.nativeVersion}:value.custom,
     refused:value.refused,invalidOptions:value.invalidOptions,tampered:value.tampered,tamperedJavascript:value.tamperedJavascript,maliciousLabel:value.maliciousLabel,
   };
  });
  expect(errors).toEqual([]);
  expect(result.renders).toHaveLength(5);
  for(const render of result.renders){expect(render.ok).toBe(true);expect(render.nativeVersion).toBe('1.1.0');expect(render.nativeFormat).toBe('lini');}
  expect(result.renders[0]).toMatchObject({entityCount:100,fieldCount:100,referenceCount:99});
  expect(result.renders[1]).toMatchObject({participantCount:2,messageCount:3});
  expect(result.renders[1].source).toContain('p2 -> p2');
  expect(result.renders[1].source).toContain('parallel A');expect(result.renders[1].source).toContain('parallel B');
  expect(result.renders[2]).toMatchObject({entityCount:2,referenceCount:1});
  const nativeStructure=await page.evaluate(({records,flow})=>{
   const parse=(svg:string)=>new DOMParser().parseFromString(svg,'image/svg+xml');
   const recordSvg=parse(records),flowSvg=parse(flow);
   return {
    recordEntities:[...recordSvg.querySelectorAll('g.lini-entity')].map(group=>group.textContent?.trim()??''),
    recordHeaders:[...recordSvg.querySelectorAll('g.lini-header.lini-cell')].map(group=>group.textContent?.trim()??''),
    recordCells:[...recordSvg.querySelectorAll('g.lini-cell')].length,
    recordFieldCells:[...recordSvg.querySelectorAll('g.lini-cell.lini-align-start')].map(group=>group.textContent?.trim()??''),
    recordLinks:[...recordSvg.querySelectorAll('g.lini-link')].map(group=>({
     from:group.getAttribute('data-from')??'',to:group.getAttribute('data-to')??'',path:group.querySelector('path')?.getAttribute('d')??'',
    })),
    flowLinks:[...flowSvg.querySelectorAll('g.lini-link')].map(group=>({
     className:group.getAttribute('class')??'',from:group.getAttribute('data-from')??'',to:group.getAttribute('data-to')??'',
     path:group.querySelector('path')?.getAttribute('d')??'',
     arrowheads:[...group.querySelectorAll('polygon.lini-marker-arrow')].length,
     text:group.textContent?.trim()??'',
    })),
   };
  },{records:result.renders[0].svg,flow:result.renders[3].svg});
  const expectedRecords=Array.from({length:100},(_,index)=>`Record ${index+1}`);
  const expectedFields=Array.from({length:100},(_,index)=>`field_${index+1}`);
  expect(nativeStructure.recordEntities).toHaveLength(100);
  expect(nativeStructure.recordHeaders).toEqual(expectedRecords);
  expect(nativeStructure.recordCells).toBe(300);
  const nativeFieldNames=nativeStructure.recordFieldCells.filter((text:string)=>text.startsWith('field_')).sort((a:string,b:string)=>Number(a.slice(6))-Number(b.slice(6)));
  const nativeFieldTypes=nativeStructure.recordFieldCells.filter((text:string)=>text==='text');
  expect(nativeFieldNames).toEqual(expectedFields);expect(nativeFieldTypes).toHaveLength(100);
  expect(nativeStructure.recordLinks).toHaveLength(99);
  expect(nativeStructure.recordLinks.every((link:any)=>link.from&&link.to&&link.path.length>10)).toBe(true);
  const connected=new Set(['visual.n1.f1']);
  for(let changed=true;changed;){changed=false;for(const link of nativeStructure.recordLinks){if(connected.has(link.from)&&!connected.has(link.to)){connected.add(link.to);changed=true;}if(connected.has(link.to)&&!connected.has(link.from)){connected.add(link.from);changed=true;}}}
  expect(connected.size).toBe(100);expect(connected.has('visual.n100.f1')).toBe(true);
  expect(result.renders[0].mappedEdges).toHaveLength(0);
  expect(result.renders[0].referenceCount).toBe(99);
  expect(result.renders[3].mappedEdges).toEqual([
   {logicalId:'directed-link',nativeId:'e1',sourcePath:'/extensions/umf.visual/edges/0'},
   {logicalId:'parallel-link',nativeId:'e2',sourcePath:'/extensions/umf.visual/edges/1'},
   {logicalId:'self-link',nativeId:'e3',sourcePath:'/extensions/umf.visual/edges/2'},
  ]);
  expect(nativeStructure.flowLinks).toHaveLength(3);
  const [directed,parallel,self]=nativeStructure.flowLinks;
  expect(directed.className).toContain('lini-style-e1');expect(directed.from).toBe('visual.n1.p1');expect(directed.to).toBe('visual.n2.p1');
  expect(directed.path.length).toBeGreaterThan(20);expect(directed.arrowheads).toBe(1);expect(directed.text).toContain('directed link');
  expect(parallel.className).toContain('lini-style-e2');expect(parallel.from).toBe(directed.from);expect(parallel.to).toBe(directed.to);
  expect(parallel.path.length).toBeGreaterThan(20);expect(parallel.arrowheads).toBe(0);expect(parallel.text).toContain('parallel undirected link');
  expect(self.className).toContain('lini-style-e3');expect(self.from).toBe('visual.n1');expect(self.to).toBe('visual.n1');
  expect(self.path).toContain('A');expect(self.path.length).toBeGreaterThan(40);expect(self.arrowheads).toBe(0);expect(self.text).toContain('undirected self link');
  nativeGeometryEvidence={
   browser:browser.version(),nativeVersion:result.renders[3].nativeVersion,
   hundredRecordDiagram:{entityCarriers:nativeStructure.recordEntities.length,entityHeaders:nativeStructure.recordHeaders.length,
    entityLabels:nativeStructure.recordHeaders.length,ownedFieldNameCells:nativeFieldNames.length,ownedFieldTypeCells:nativeFieldTypes.length,
    nativeCellGroups:nativeStructure.recordCells,relationshipReferences:result.renders[0].referenceCount,linkGroups:nativeStructure.recordLinks.length,
    connectedEntityFields:connected.size,firstField:nativeStructure.recordLinks[0]?.from,lastField:nativeStructure.recordLinks.at(-1)?.to,
    everyLinkHasConnectorPath:nativeStructure.recordLinks.every((link:any)=>link.path.length>10)},
   flowNetwork:{linkGroups:nativeStructure.flowLinks.length,directedWithArrowheads:directed.arrowheads,parallelUndirectedArrowheads:parallel.arrowheads,
    selfUndirectedArrowheads:self.arrowheads,selfLoopHasCurvedPath:self.path.includes('A'),portEndpoints:[directed.from,directed.to],
    logicalEdges:result.renders[3].mappedEdges.length},
  };
  expect(result.renders[3].source).toContain('---');expect(result.renders[3].source).toContain('directed link');
  expect(result.renders[4].svg).not.toContain('<script>');
  const labels=await page.evaluate(svg=>{
   const parsed=new DOMParser().parseFromString(svg,'image/svg+xml');
   return {root:parsed.documentElement.localName,errors:parsed.querySelectorAll('parsererror').length,text:parsed.documentElement.textContent};
  },result.renders[4].svg);
  expect(labels.root).toBe('svg');expect(labels.errors).toBe(0);expect(labels.text).toContain(result.maliciousLabel);
  expect(result.custom).toEqual({ok:true,nativeVersion:'1.1.0'});
  expect(result.refused.ok).toBe(false);expect(result.refused.diagnostics[0].code).toBe('SEMANTIC_TYPE_STRUCTURE');
  expect(result.invalidOptions.ok).toBe(false);expect(result.invalidOptions.diagnostics[0].code).toBe('LINI_RUNTIME_URL');
  expect(result.tampered.ok).toBe(false);expect(result.tampered.diagnostics[0].code).toBe('LINI_RUNTIME');
  expect(result.tampered.diagnostics[0].message).toContain('SHA-256 verification');
  expect(result.tamperedJavascript.ok).toBe(false);expect(result.tamperedJavascript.diagnostics[0].code).toBe('LINI_RUNTIME');
  expect(result.tamperedJavascript.diagnostics[0].message).toContain('SHA-256 verification');
  expect(counts.get('default/lini_wasm.js')).toBe(1);expect(counts.get('default/lini_wasm_bg.wasm')).toBe(1);
  expect(counts.get('alternate/lini_wasm.js')).toBe(1);expect(counts.get('alternate/lini_wasm_bg.wasm')).toBe(1);
  expect(counts.get('tampered/lini_wasm.js')).toBe(1);expect(counts.get('tampered/lini_wasm_bg.wasm')).toBe(1);
  expect(counts.get('tampered-js/lini_wasm.js')).toBe(1);expect(counts.get('tampered-js/lini_wasm_bg.wasm')).toBe(1);
 }finally{await browser.close();await server.stop(true);}
},{timeout:60_000});

test('the public renderer runs in a same-origin module worker behind a strict page CSP',async()=>{
 const assets=new Map(pin.assets.map(asset=>[asset.name,new Uint8Array(readFileSync(join(runtimeDirectory,asset.name)))]));
 const workerBundle=await Bun.build({entrypoints:['tests/renderers/lini.worker.ts'],target:'browser',format:'esm'});
 expect(workerBundle.success,workerBundle.logs.map(log=>log.message).join('\n')).toBe(true);
 const workerJs=await workerBundle.outputs[0]!.text();
 const pageJs=`window.parentCspViolations=[];window.addEventListener('securitypolicyviolation',e=>window.parentCspViolations.push(e.violatedDirective+': '+e.blockedURI));const worker=new Worker('/worker.js',{type:'module'});worker.onmessage=e=>window.workerResult=e.data;worker.onerror=e=>window.workerResult={workerError:e.message};worker.postMessage({render:true});`;
 const pageCsp="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'";
 const workerCsp="default-src 'none'; script-src 'self' blob: 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self'; base-uri 'none'; object-src 'none'";
 const browser=await chromium.launch({headless:true});
 const server=Bun.serve({hostname:'localhost',port:0,fetch(request){
  const path=new URL(request.url).pathname;
  if(path==='/')return new Response('<!doctype html><meta charset="utf-8"><title>Worker renderer</title><script type="module" src="/page.js"></script>',{headers:{'content-type':'text/html;charset=utf-8','content-security-policy':pageCsp}});
  if(path==='/page.js')return new Response(pageJs,{headers:{'content-type':'text/javascript;charset=utf-8'}});
  if(path==='/worker.js')return new Response(workerJs,{headers:{'content-type':'text/javascript;charset=utf-8','content-security-policy':workerCsp}});
  const match=/^\/lini-runtime\/([^/]+)$/u.exec(path);
  if(match){const bytes=assets.get(match[1]!);if(!bytes)return new Response('Not found',{status:404});return new Response(bytes,{headers:{'content-type':match[1]!.endsWith('.wasm')?'application/wasm':'text/javascript;charset=utf-8'}});}
  return new Response('Not found',{status:404});
 }});
 try{
  const page=await browser.newPage();const pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(String(error)));
  await page.goto(server.url.href,{waitUntil:'load'});
  await page.waitForFunction(()=>Boolean((window as any).workerResult),undefined,{timeout:60_000});
  const result=await page.evaluate(()=>({
   worker:(window as any).workerResult,
   parentCspViolations:(window as any).parentCspViolations,
  }));
  expect(pageErrors).toEqual([]);
  expect(result.worker.workerError).toBeUndefined();
  expect(result.worker.domParserAvailable).toBe(false);
  expect(result.worker.result.ok).toBe(true);
  expect(result.worker.result.nativeVersion).toBe('1.1.0');
  expect(result.worker.result.nativeFormat).toBe('lini');
  expect(result.worker.result.svg).toContain('<svg');
  expect(result.worker.cspViolations).toEqual([]);
  expect(result.parentCspViolations).toEqual([]);
  expect(pageCsp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(pageCsp).not.toContain('blob:');expect(pageCsp).not.toContain("'unsafe-eval'");
  expect(workerCsp).toContain("script-src 'self' blob: 'unsafe-eval' 'wasm-unsafe-eval'");
  expect(nativeGeometryEvidence).toBeDefined();
  const receipt={
   profile:'umf.visual.presentation/1',nativeVersion:pin.version,browser:browser.version(),
   runtimeAssets:pin.assets.map(asset=>({name:asset.name,sha256:asset.sha256})),
   nativeGeometry:nativeGeometryEvidence,
   workerCsp:{
    parentPage:{scriptSrc:["'self'","'wasm-unsafe-eval'"],workerSrc:["'self'"],blobAllowed:false,javascriptUnsafeEvalAllowed:false,violations:result.parentCspViolations.length},
    worker:{scriptSrc:["'self'",'blob:',"'unsafe-eval'","'wasm-unsafe-eval'"],connectSrc:["'self'"],domParserAvailable:result.worker.domParserAvailable,violations:result.worker.cspViolations.length},
   },
  };
  await mkdir('.cache/presentation',{recursive:true});
  await Bun.write('.cache/presentation/lini-renderer-browser.json',JSON.stringify(receipt,null,2)+'\n');
 }finally{await browser.close();await server.stop(true);}
},{timeout:60_000});
