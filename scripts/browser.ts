import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const build=await Bun.build({entrypoints:['tests/browser-entry.ts'],target:'browser',format:'esm'});
if(!build.success)throw Error(build.logs.join('\n'));
const js=await build.outputs[0]!.text();
const fixtures:unknown[]=[];
for await(const file of new Bun.Glob('fixtures/visual/{forms,inventory}/*.json').scan('.'))if(!file.endsWith('/index.json'))fixtures.push(await Bun.file(file).json());
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){
 const path=new URL(req.url).pathname;
 if(path==='/app.js')return new Response(js,{headers:{'content-type':'text/javascript'}});
 if(path==='/fixtures')return Response.json(fixtures);
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
