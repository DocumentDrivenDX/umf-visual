import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {liniDirectory,verifyLiniRuntime} from './interchange-runtime';
await verifyLiniRuntime();
const build=await Bun.build({entrypoints:['tests/browser-entry.ts'],target:'browser',format:'esm'});
if(!build.success)throw Error(build.logs.join('\n'));
const js=await build.outputs[0]!.text();
const fixtures:unknown[]=[];
for await(const file of new Bun.Glob('fixtures/visual/{forms,inventory}/*.json').scan('.'))if(!file.endsWith('/index.json'))fixtures.push(await Bun.file(file).json());
for await(const file of new Bun.Glob('fixtures/catalog/*.json').scan('.'))fixtures.push(await Bun.file(file).json());
const reviewSourceManifest=await Bun.file('fixtures/reviews/review-sources.json').json() as {schemaVersion:number;examples:Array<{id:string;definitionPath:string}>};
if(reviewSourceManifest.schemaVersion!==1||!Array.isArray(reviewSourceManifest.examples)||!reviewSourceManifest.examples.length)throw Error('Review browser fixtures require a nonempty schemaVersion 1 source manifest.');
const reviewIds=new Set<string>();
const reviewFixtures:unknown[]=await Promise.all(reviewSourceManifest.examples.map(async example=>{
 if(!example||typeof example.id!=='string'||reviewIds.has(example.id)||typeof example.definitionPath!=='string'||example.definitionPath.split(/[\\/]/).includes('..'))throw Error('Review source manifest has an unsafe or duplicate definition reference.');
 reviewIds.add(example.id);const file=resolve(example.definitionPath);
 if(!file.startsWith(resolve('.')+sep))throw Error(`Review definition is outside the repository: ${example.definitionPath}`);
 return Bun.file(file).json();
}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){
 const path=new URL(req.url).pathname;
 if(path==='/app.js')return new Response(js,{headers:{'content-type':'text/javascript'}});
 if(path==='/fixtures')return Response.json(fixtures);
 if(path==='/reviews')return Response.json(reviewFixtures);
 if(path==='/lini_wasm.js')return new Response(Bun.file(join(liniDirectory,'lini_wasm.js')),{headers:{'content-type':'text/javascript'}});
 if(path==='/lini_wasm_bg.wasm')return new Response(Bun.file(join(liniDirectory,'lini_wasm_bg.wasm')),{headers:{'content-type':'application/wasm'}});
 if(path==='/')return new Response('<!doctype html><title>UMF visual conformance</title><script type="module" src="/app.js"></script>',{headers:{'content-type':'text/html'}});
 return new Response('Not found',{status:404});
}});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();const errors:string[]=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(server.url.href);
 await page.waitForFunction(()=>window.visualResult!==undefined,{},{timeout:60000});
 const result=await page.evaluate(()=>window.visualResult) as {ok:boolean};
 const receipt={...result,browser:browser.version(),errors};
 await mkdir('.cache',{recursive:true});await Bun.write('.cache/browser.json',JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify(receipt));
 if(!result.ok||errors.length)throw Error('Browser conformance failed');
}finally{await browser.close();await server.stop(true);}
