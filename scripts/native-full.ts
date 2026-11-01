// SPDX-License-Identifier: MIT OR Apache-2.0
/** Independent native render and visible-primary-value gate for full profiles. */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import mermaidPackage from 'mermaid/package.json';
import {exportVisual,importVisual,getVisual,type InterchangeFormat} from '../src';
import {compileFullScene} from '../src/interchange/full/scene';
import {decodeAnnotationValue} from '../src/interchange/annotations';
import {liniDirectory,verifyLiniRuntime} from './interchange-runtime';
import {nativePreviewPresentation} from './catalog/native-preview-presentation';
import {verifyFullNativeWitness,verifyNativeFirstWitness} from './full-native-witness';

const hash=(text:string|Uint8Array)=>new Bun.CryptoHasher('sha256').update(text).digest('hex');
const canonical=(value:unknown)=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const paths:string[]=[];
for(const pattern of ['fixtures/visual/forms/*.json','fixtures/visual/inventory/*.json','fixtures/catalog/*.json'])for await(const path of new Bun.Glob(pattern).scan('.'))if(!path.endsWith('/index.json'))paths.push(path);
paths.sort();if(paths.length!==53)throw new Error('Full native gate expects exactly 53 source examples');
const catalogExamples=paths.length;
for await(const path of new Bun.Glob('fixtures/integrations/complex-miro/common/*.json').scan('.'))paths.push(path);
if(paths.length-catalogExamples!==5)throw new Error('Full native gate expects exactly five common integration examples');
paths.sort();
const pin=await verifyLiniRuntime(),lini=await import(pathToFileURL(resolve(liniDirectory,'lini_wasm.js')).href);
await lini.default({module_or_path:await Bun.file(resolve(liniDirectory,'lini_wasm_bg.wasm')).bytes()});
if(lini.version()!==pin.version)throw new Error('Lini version differs from verified runtime pin');
const versionProcess=Bun.spawn(['dot','-V'],{stdout:'pipe',stderr:'pipe'}),graphviz=(await new Response(versionProcess.stdout).text())+(await new Response(versionProcess.stderr).text());
if(await versionProcess.exited)throw new Error('Graphviz version lookup failed');
const browser=await chromium.launch({headless:true}),page=await browser.newPage(),rows:any[]=[];
const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));
const normalize=(text:string)=>text.replace(/\s+/g,' ').trim();
try{
 for(const path of paths){
  const document=await Bun.file(path).json(),visual=getVisual(document);
  for(const format of ['dot','mermaid','lini'] as InterchangeFormat[]){
   const profile=`umf.visual.${format}.full/1` as const,output=exportVisual(document,{format,profile});
   if(!output.ok||!output.text||output.diagnostics.some(diagnostic=>diagnostic.loss||diagnostic.severity==='error'))throw new Error(path+'/'+format+': '+JSON.stringify(output.diagnostics));
   const imported=importVisual(output.text,{format,profile,id:visual.id,question:visual.question});
   if(!imported.ok||canonical(imported.document)!==canonical(document))throw new Error('Full native source readback differs: '+path+'/'+format);
   let svg:string,version:string;
   if(format==='dot'){
    const process=Bun.spawn(['dot',...nativePreviewPresentation.graphviz.args,'-Tsvg'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});process.stdin.write(output.text);process.stdin.end();
    svg=await new Response(process.stdout).text();const diagnostics=await new Response(process.stderr).text();if(await process.exited||diagnostics.trim())throw new Error('Graphviz native diagnostics '+path+': '+diagnostics);version=graphviz.trim();
   }else if(format==='mermaid'){
    await page.setContent('<!doctype html><html><body></body></html>');await page.addScriptTag({path:resolve('node_modules/mermaid/dist/mermaid.min.js')});
    svg=await page.evaluate(async({source,style})=>{const runtime=(window as any).mermaid;runtime.initialize({...style,startOnLoad:false,securityLevel:'strict',maxTextSize:262144,maxEdges:10000});return(await runtime.render('full-native-witness',source)).svg;},{source:output.text,style:nativePreviewPresentation.mermaid});version=mermaidPackage.version;
   }else{
    const diagnostics=JSON.parse(lini.diagnostics(output.text,{}));if((Array.isArray(diagnostics)?diagnostics:diagnostics.diagnostics).length)throw new Error('Lini native diagnostics '+path+': '+JSON.stringify(diagnostics));
    svg=lini.compile(output.text,{});version=lini.version();
   }
   const text=await page.evaluate(svg=>{const root=new DOMParser().parseFromString(svg,'image/svg+xml');if(root.querySelector('parsererror'))throw new Error('Invalid native SVG XML');return [...root.querySelectorAll('text,foreignObject')].map(element=>element.textContent??'').join(' ')+' '+[...root.querySelectorAll('tspan')].map(element=>element.textContent??'').join(' ');},svg);
   const primitive=output.representation?.tier==='primitive-fallback';
   const scene=compileFullScene(document,format),records=new Map(scene.records.map(record=>[record.id,record]));
   const expected=primitive?[...scene.nodes,...scene.edges,...scene.groups].map(item=>{
    const record=item.recordId?records.get(item.recordId):undefined;if(!record)return item.text??'';
    const decoded=decodeAnnotationValue(record.type,record.value);return decoded.kind==='string'?decoded.value:record.value;
   }).filter(value=>normalize(value)!==''):[];
   const missing=[...new Set(expected)].filter(value=>!normalize(text).includes(normalize(value)));
   if(missing.length)throw new Error('Native primary values missing '+path+'/'+format+': '+JSON.stringify(missing));
   const witness=primitive?await verifyFullNativeWitness(page,output.text,svg,document,format):await verifyNativeFirstWitness(page,output.text,svg,document,format);
   const name=visual.id.replace(/[^A-Za-z0-9_-]/g,'-')+'-'+format;
   await Bun.write('.cache/full-native/'+name+'.svg',svg);
   rows.push({id:visual.id,path,kind:visual.kind,form:visual.form,format,profile,mappingVersion:'0.1.0',representation:output.representation,modelVersion:document.vocabularies['umf.visual'].version,sourceSha256:hash(await Bun.file(path).bytes()),nativeSourceSha256:hash(output.text),svgSha256:hash(svg),engineVersion:version,browserVersion:browser.version(),rendererOptions:format==='dot'?{args:[...nativePreviewPresentation.graphviz.args,'-Tsvg']}:format==='mermaid'?{...nativePreviewPresentation.mermaid,startOnLoad:false,securityLevel:'strict',maxTextSize:262144,maxEdges:10000}:{},wholeDocumentReadback:true,witness,normalizedTextPresenceSmoke:expected.length,coveragePaths:output.coverage?.length,approximations:output.approximations??[]});
  }
 }
 if(errors.length)throw new Error('Native browser errors: '+errors.join('; '));
 const receipt={examples:paths.length,catalogExamples,integrationExamples:paths.length-catalogExamples,pairs:rows.length,rows};await Bun.write('.cache/full-native/receipt.json',JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({examples:paths.length,catalogExamples,integrationExamples:paths.length-catalogExamples,pairs:rows.length,formats:['dot','mermaid','lini'],forms:new Set(rows.map(row=>row.form)).size,normalizedTextPresenceSmoke:rows.reduce((sum,row)=>sum+row.normalizedTextPresenceSmoke,0)}));
}finally{await browser.close();}
