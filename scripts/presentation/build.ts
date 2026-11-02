// SPDX-License-Identifier: MIT OR Apache-2.0
/** Execute the browser-pure presentation plans and assemble source-bound showcase receipts. */
import {createHash} from 'node:crypto';
import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {dirname,join,resolve,sep} from 'node:path';
import {chromium,type Browser,type Page} from 'playwright';
import mermaidPackage from 'mermaid/package.json';
import type {Document} from '@umf/core';
import {createVisualDocument,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan,type PresentationBackend} from '../../src/presentation';
import {verifyPresentationQuality} from './quality';
import {loadPresentationLini,renderPresentationLini} from './lini-runtime';
import {visualPayloadYaml} from './payload-source';

const root=resolve(import.meta.dir,'../..');
const sourceManifestPath='fixtures/showcase/showcase-sources.json';
const outputPath='dist-site/showcase.json';
const sha=(data:string|Uint8Array)=>createHash('sha256').update(data).digest('hex');
const posix=(s:string)=>s.split(sep).join('/');
const safe=(s:string)=>s.replace(/[^a-zA-Z0-9_-]+/g,'-');
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);

interface SourceExample {id:string;title:string;description:string;kind:string;form:string;definitionPath:string;definitionSha256:string;sources:unknown[];}
interface SourceManifest {schemaVersion:1;examples:SourceExample[];}
interface QualityCheck {check:string;sourceSha256:string;result:'pass'|'fail';details:string;}
interface RenderRow {backend:PresentationBackend;engine:string;nativeVersion:string;nativeSourcePath:string;nativeSourceSha256:string;svgPath:string;svgSha256:string;pngPath:string;pngSha256:string;width:number;height:number;elementMap:unknown[];omissions:unknown[];approximations:unknown[];status:'qualified'|'unsupported'|'failed'|'unqualified';quality:{evidence:QualityCheck[]};diagnostics?:unknown[];error?:string;}

function assertRelative(path:string,label:string):void {if(!path||path.startsWith('/')||path.split(/[\\/]/).includes('..'))throw new Error(`${label} must be a safe relative path.`);}
async function command(args:string[],input?:string):Promise<{stdout:string;stderr:string;exit:number}> {
 const child=Bun.spawn(args,{stdin:input===undefined?'ignore':'pipe',stdout:'pipe',stderr:'pipe'});
 if(input!==undefined){if(!child.stdin)throw Error('Native renderer stdin was unavailable.');child.stdin.write(input);child.stdin.end();}
 const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 return {stdout,stderr,exit};
}
async function version(args:string[],regex:RegExp,label:string):Promise<string>{const r=await command(args);if(r.exit!==0)throw new Error(`${label} version command failed: ${r.stderr||r.stdout}`);const m=regex.exec(r.stdout+' '+r.stderr);if(!m)throw new Error(`Unable to parse ${label} native version.`);return m[1]!;}
function jsonDocument(raw:string):Document {return readVisualDocument(raw,'json');}
function visualOf(doc:Document):Visual{return doc.extensions!['umf.visual'] as unknown as Visual;}

async function renderDot(source:string,format:'svg'|'json'):Promise<{output:string;diagnostics:string}> {
 const r=await command(['dot','-T'+format],source);
 if(r.exit!==0)throw new Error(`Graphviz ${format} compile failed: ${(r.stderr||r.stdout).trim()}`);
 if(r.stderr.trim())throw new Error(`Graphviz emitted diagnostics: ${r.stderr.trim()}`);
 return {output:r.stdout,diagnostics:r.stderr};
}

async function mermaidSvg(page:Page,source:string,seed:string):Promise<{svg:string;version:string}> {
 await page.setContent('<!doctype html><meta charset="utf-8"><body><main id="out"></main></body>',{waitUntil:'domcontentloaded'});
 let external:string|undefined;const diagnostics:string[]=[];
 const listener=(msg:import('playwright').ConsoleMessage)=>{if(msg.type()==='error'||msg.type()==='warning')diagnostics.push(msg.type()+': '+msg.text());};
 page.on('console',listener);
 const route=async(r:import('playwright').Route)=>{const protocol=new URL(r.request().url()).protocol;if(['file:','data:','about:','blob:'].includes(protocol))await r.continue();else{external??=r.request().url();await r.abort();}};
 await page.route('**/*',route);
 try{
  await page.addScriptTag({path:resolve(root,'node_modules/mermaid/dist/mermaid.min.js')});
  const result=await page.evaluate(async({source,seed,version})=>{
   const api=(window as any).mermaid;if(!api)throw Error('Mermaid bundle did not initialize.');
   api.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',look:'classic',fontFamily:'Arial, "Avenir Next", "Segoe UI", sans-serif',deterministicIds:true,deterministicIDSeed:seed,themeVariables:{background:'#ffffff',primaryColor:'#e8f2f3',primaryTextColor:'#203746',primaryBorderColor:'#577782',lineColor:'#587582',secondaryColor:'#edf2f8',secondaryTextColor:'#203746',secondaryBorderColor:'#71869b',tertiaryColor:'#f5f4ef',tertiaryTextColor:'#263842',tertiaryBorderColor:'#96988e',mainBkg:'#e8f2f3',secondBkg:'#edf2f8',clusterBkg:'#f5f7f7',clusterBorder:'#c5d0d5',titleColor:'#203746',edgeLabelBackground:'#ffffff',fontSize:'16px'}});
   let state=2166136261;for(const c of seed)state=Math.imul(state^c.charCodeAt(0),16777619)>>>0;const random=Math.random;
   Math.random=()=>{state=(state+0x6D2B79F5)|0;let v=state;v=Math.imul(v^v>>>15,v|1);v^=v+Math.imul(v^v>>>7,v|61);return((v^v>>>14)>>>0)/4294967296;};
   try{const rendered=await api.render('showcase-'+seed,source);await document.fonts.ready;return{svg:rendered.svg,version:api.version??version};}finally{Math.random=random;}
  },{source,seed,version:mermaidPackage.version});
  if(external)throw Error(`Mermaid attempted external access: ${external}`);
  if(diagnostics.length)throw Error(`Mermaid native diagnostics: ${diagnostics.join('; ')}`);
  if(!result.svg.includes('<svg'))throw Error('Mermaid returned no SVG.');
  // Mermaid emits percentage-only root dimensions, which render inline but
  // have zero intrinsic size when the same SVG is opened as a downloaded file.
  // Give the artifact explicit dimensions equal to its native viewBox units.
  const size=svgBox(result.svg);
  const svg=result.svg.replace(/<svg\b([^>]*)>/,(_root:string,attributes:string)=>{
   const withoutDimensions=attributes.replace(/\s(?:width|height)="[^"]*"/g,'');
   return `<svg${withoutDimensions} width="${size.width}px" height="${size.height}px">`;
  }).replace(/<br>/g,'<br/>');
  return {svg,version:result.version};
 }finally{page.off('console',listener);await page.unroute('**/*',route);}
}

async function probeMermaidLabelEscapes(browser:Browser):Promise<{engine:string;version:string;sourceSha256:string;svgSha256:string;expected:string;rendered:string;result:'pass'}>{
 const expected='Quoted "value" & <tag> > # 🧭';
 const document=createVisualDocument({id:'native-text-probe',kind:'flow',form:'network',question:'Native text probe',nodes:[{id:'probe',label:expected}]},'presentation-native-probe','1.1.0');
 const plan=compilePresentation(document,{backend:'mermaid',theme:'presentation/1'});if(!plan.ok)throw Error('Mermaid native text probe did not compile: '+JSON.stringify(plan.diagnostics));
 const page=await browser.newPage();
 try{
  const rendered=await mermaidSvg(page,plan.source,'native-text-probe');
  await page.setContent('<!doctype html><meta charset="utf-8"><div id="svg"></div>');
  await page.locator('#svg').evaluate((el,svg)=>{el.innerHTML=svg;},rendered.svg);
  const texts=await page.locator('#svg g.node .nodeLabel').allInnerTexts();
  const observed=texts.map(x=>x.replace(/\s+/g,' ').trim()).find(x=>x.length>0)??'';
  if(observed!==expected)throw Error(`Mermaid native label escaping changed text: expected ${JSON.stringify(expected)}, received ${JSON.stringify(observed)}.`);
  return{engine:'mermaid',version:rendered.version,sourceSha256:sha(plan.source),svgSha256:sha(rendered.svg),expected,rendered:observed,result:'pass'};
 }finally{await page.close();}
}

function svgBox(svg:string):{width:number;height:number}{
 const root=/\<svg\b[^>]*\>/i.exec(svg)?.[0];if(!root)throw Error('Native renderer returned no SVG root.');
 const raw=/\bviewBox=["']([^"']+)["']/i.exec(root)?.[1];if(!raw)throw Error('Native SVG has no viewBox.');
 const values=raw.trim().split(/[ ,]+/).map(Number);if(values.length!==4||values.some(x=>!Number.isFinite(x))||values[2]!<=0||values[3]!<=0)throw Error('Native SVG viewBox is invalid.');
 return {width:values[2]!,height:values[3]!};
}
function textTokens(v:Visual,backend:PresentationBackend):string[]{
 const out=[v.title??v.question];
 if(v.kind==='flow'){
  for(const g of v.groups??[])out.push(g.label,...(g.detail?[g.detail]:[]));
  for(const n of v.nodes??[])out.push(n.label,...(n.detail?[n.detail]:[]));
  for(const e of v.edges??[])out.push(...(e.label?[e.label]:[]));
 }
 if(v.form==='stack'){
  for(const l of v.structure?.layers??[])out.push(l.label);
  for(const n of v.nodes??[])out.push(n.label,...(n.detail?[n.detail]:[]));
 }
 if(v.form==='entities'){
  const nodeById=new Map((v.nodes??[]).map(n=>[n.id,n]));
  for(const entity of v.structure?.entities??[]){const n=nodeById.get(entity.node)!;out.push(n.label,...(backend==='graphviz'&&n.detail?[n.detail]:[]));for(const f of entity.fields){out.push(f.name);if(f.type)out.push(backend==='mermaid'&&f.nullable===true?f.type+'?':f.type);if(f.keys)out.push(...f.keys.map(k=>k.toUpperCase()));if(backend==='graphviz'&&f.nullable!==undefined)out.push(f.nullable?'NULL':'NOT NULL');}}
  for(const r of v.structure?.references??[]){if(r.label)out.push(r.label);for(const m of [r.fromMultiplicity,r.toMultiplicity])if(m)out.push(m.text??(m.min+'..'+(m.max===undefined?'*':m.max)));}
 }
 return [...new Set(out.filter(Boolean))];
}

export async function screenshotSvg(browser:Browser,svg:string,dest:string):Promise<{width:number;height:number}>{
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 try{
  await page.setContent('<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#f7f9f9}#frame{width:1600px;height:900px;display:flex;align-items:center;justify-content:center}#frame svg{display:block;width:100%;height:100%;}</style><div id="frame"></div>',{waitUntil:'domcontentloaded'});
  await page.locator('#frame').evaluate((frame,markup)=>{frame.innerHTML=markup;},svg);
  if(!(await page.locator('#frame svg').count()))throw Error('The standalone SVG could not be inserted for screenshot capture.');
  await page.locator('#frame svg').evaluate(x=>{(x as SVGSVGElement).style.width='100%';(x as SVGSVGElement).style.height='100%';});
  const png=await page.screenshot({type:'png',fullPage:false});await mkdir(dirname(dest),{recursive:true});await writeFile(dest,png);
  return {width:1600,height:900};
 }finally{await page.close();}
}

async function verifyNativeSvg(browser:Browser,svg:string,tokens:string[]):Promise<QualityCheck[]> {
 const box=svgBox(svg),page=await browser.newPage({viewport:{width:1200,height:800}});
 try{
  await page.setContent('<!doctype html><meta charset="utf-8"><style>#svg{width:1200px;height:800px}#svg svg{width:100%;height:100%}</style><body><div id="svg"></div></body>',{waitUntil:'domcontentloaded'});
  await page.locator('#svg').evaluate((container,markup)=>{container.innerHTML=markup;},svg);
  const result=await page.locator('#svg svg').evaluate(svgElement=>{
   const svg=svgElement as SVGSVGElement,rect=svg.getBoundingClientRect();const text=[...svg.querySelectorAll('text,foreignObject *')].map(x=>({text:(x.textContent??'').replace(/\s+/g,' ').trim(),r:(()=>{const b=x.getBoundingClientRect();return{x:b.x-rect.x,y:b.y-rect.y,width:b.width,height:b.height};})()})).filter(x=>x.text);
   const overflow=text.filter(t=>t.r.x<0||t.r.y<0||t.r.x+t.r.width>rect.width||t.r.y+t.r.height>rect.height);
   return {text:text.map(t=>t.text),overflow:overflow.map(t=>t.text),width:rect.width,height:rect.height};
  });
  const joined=result.text.join('\n');const missing=tokens.filter(t=>!joined.toLocaleLowerCase().includes(t.toLocaleLowerCase()));
  return [
   {check:'native-svg-viewbox',sourceSha256:sha(svg),result:box.width>0&&box.height>0?'pass':'fail',details:`viewBox ${box.width} × ${box.height}px`},
   {check:'visible-label-coverage',sourceSha256:sha(svg),result:missing.length===0?'pass':'fail',details:missing.length?`Missing visible text: ${missing.join(' | ')}`:`${tokens.length} source-bound label tokens appear in SVG text.`},
   {check:'text-within-svg-bounds',sourceSha256:sha(svg),result:result.overflow.length===0?'pass':'fail',details:result.overflow.length?`Text outside viewBox: ${result.overflow.join(' | ')}`:`${result.text.length} SVG text runs fall within the SVG viewport.`},
  ];
 }finally{await page.close();}
}

async function buildRender(example:SourceExample,doc:Document,backend:PresentationBackend,browser:Browser,versions:{graphviz:string;mermaid:string;lini:string;chromium:string}):Promise<RenderRow>{
 const plan=compilePresentation(doc,{backend,theme:'presentation/1'});
 if(!plan.ok){const refused=plan.diagnostics.every(d=>d.code==='PRESENTATION_FORM'||d.code==='PRESENTATION_BACKEND_SUBSET'||d.code==='PRESENTATION_MERMAID_FIELD'||d.code==='PRESENTATION_MERMAID_CARDINALITY'||d.code==='PRESENTATION_MERMAID_RELATIONSHIP');return {backend,engine:backend,nativeVersion:backend==='graphviz'?versions.graphviz:backend==='lini'?versions.lini:`${versions.mermaid} / Chromium ${versions.chromium}`,nativeSourcePath:'',nativeSourceSha256:'',svgPath:'',svgSha256:'',pngPath:'',pngSha256:'',width:0,height:0,elementMap:[],omissions:[],approximations:[],status:refused?'unsupported':'failed',quality:{evidence:[]},diagnostics:plan.diagnostics};}
 const extension=backend==='graphviz'?'dot':backend==='lini'?'lini':'mmd',base=`showcase/${safe(example.id)}/${backend}`,diskBase=`dist-site/${base}`;
 const nativeSourcePath=`${base}/source.${extension}`,svgPath=`${base}/diagram.svg`,pngPath=`${base}/diagram.png`;
 assertRelative(nativeSourcePath,'Native source path');assertRelative(svgPath,'SVG path');assertRelative(pngPath,'PNG path');
 const nativeBytes=Buffer.from(plan.source,'utf8'),nativeSourceSha256=sha(nativeBytes);await mkdir(join(root,diskBase),{recursive:true});await writeFile(join(root,'dist-site',nativeSourcePath),nativeBytes);
 try{
  let svg:string,nativeVersion:string,nativeAst:unknown;
  if(backend==='graphviz'){
   const [svgResult,jsonResult]=await Promise.all([renderDot(plan.source,'svg'),renderDot(plan.source,'json')]);svg=svgResult.output;nativeVersion=versions.graphviz;
   const ast=JSON.parse(jsonResult.output) as {objects?:{name?:string}[];edges?:{tail?:string;head?:string;tailport?:string;headport?:string}[]};nativeAst=ast;const names=new Set((ast.objects??[]).map(o=>o.name));
   const expectedNodes=plan.elementMap.filter(x=>x.kind==='node'||x.kind==='entity');const missingNodes=expectedNodes.filter(x=>!names.has(x.nativeId));
   if(missingNodes.length)throw Error('Graphviz JSON AST omitted expected native nodes: '+missingNodes.map(x=>x.nativeId).join(', '));
   const sourceVisual=visualOf(doc);const expectedEdges=sourceVisual.kind==='flow'?(sourceVisual.edges??[]).length:(sourceVisual.form==='entities'?(sourceVisual.structure?.references??[]).length:0);
   const semanticEdges=(ast.edges??[]).filter(e=>String((e as any).style??'')!=='invis');
   if(semanticEdges.length!==expectedEdges)throw Error(`Graphviz JSON AST has ${semanticEdges.length} semantic edges; expected ${expectedEdges}.`);
   if(sourceVisual.form==='entities'){
    const missingPorts=plan.elementMap.filter(x=>x.kind==='field').filter(field=>!plan.source.includes('PORT="'+field.nativeId+'"'));
    if(missingPorts.length)throw Error('Graphviz source lacks expected field ports: '+missingPorts.map(x=>x.nativeId).join(', '));
   }
  }else if(backend==='lini'){
   const rendered=await renderPresentationLini(plan.source);svg=rendered.svg;nativeAst=rendered.nativeAst;nativeVersion=rendered.version;
  }else{const page=await browser.newPage();try{const rendered=await mermaidSvg(page,plan.source,safe(example.id));svg=rendered.svg;nativeVersion=`${rendered.version} / Chromium ${versions.chromium}`;}finally{await page.close();}}
  const page=await browser.newPage();let evidence:QualityCheck[];try{evidence=await verifyPresentationQuality(page,{svg,document:doc,plan,nativeAst});}finally{await page.close();}
  const q=evidence.every(x=>x.result==='pass')?'qualified':'unqualified';
  const image=await screenshotSvg(browser,svg,join(root,'dist-site',pngPath));
  await writeFile(join(root,'dist-site',svgPath),svg);
  const svgSha256=sha(svg),pngBytes=await readFile(join(root,'dist-site',pngPath)),pngSha256=sha(pngBytes);
  const row:RenderRow={backend,engine:backend,nativeVersion,nativeSourcePath,nativeSourceSha256,svgPath,svgSha256,pngPath,pngSha256,width:image.width,height:image.height,elementMap:plan.elementMap,omissions:plan.omissions,approximations:plan.approximations,status:q,quality:{evidence}};
  if(q!=='qualified')row.error='One or more source-bound native presentation checks did not pass.';
  return row;
 }catch(error){return {backend,engine:backend,nativeVersion:backend==='graphviz'?versions.graphviz:backend==='lini'?versions.lini:`${versions.mermaid} / Chromium ${versions.chromium}`,nativeSourcePath,nativeSourceSha256,svgPath:'',svgSha256:'',pngPath:'',pngSha256:'',width:0,height:0,elementMap:plan.elementMap,omissions:plan.omissions,approximations:plan.approximations,status:'failed',quality:{evidence:[]},error:errorText(error)};}
}

export async function buildShowcase():Promise<{outputPath:string;examples:number;qualified:number;failed:number}>{
 const manifestRaw=await readFile(join(root,sourceManifestPath),'utf8'),manifest=JSON.parse(manifestRaw) as SourceManifest;
 if(manifest.schemaVersion!==1||!Array.isArray(manifest.examples))throw Error('Unsupported or malformed presentation source manifest.');
 const graphviz=await version(['dot','-V'],/graphviz version\s+([^\s(]+)/i,'Graphviz');
 const lini=(await loadPresentationLini()).version;
 if(typeof mermaidPackage.version!=='string')throw Error('Mermaid package version is unavailable.');
 const browser=await chromium.launch({headless:true});const chromiumVersion=browser.version();const rows=[];let nativeProbes;
 try{
  nativeProbes={mermaidEscapedLabel:await probeMermaidLabelEscapes(browser)};
  // This subtree belongs to this build. Refused or removed outputs must not
  // leave previously generated downloads in a subsequent site artifact.
  await rm(join(root,'dist-site/showcase'),{recursive:true,force:true});
  for(const example of manifest.examples){
   if(!example.id||!example.title||!example.description||!example.definitionPath||!Array.isArray(example.sources))throw Error('Showcase source example is malformed.');
   assertRelative(example.definitionPath,'Definition path');
   const definitionBytes=await readFile(join(root,example.definitionPath));const definitionSha256=sha(definitionBytes);
   if(definitionSha256!==example.definitionSha256)throw Error(`Definition hash mismatch for ${example.id}: expected ${example.definitionSha256}, received ${definitionSha256}.`);
   for(const source of example.sources as any[]){
    if(!source||typeof source.path!=='string'||typeof source.sha256!=='string'||typeof source.pointer!=='string'||typeof source.description!=='string')throw Error(`Source reference is malformed for ${example.id}.`);
    assertRelative(source.path,'Source snapshot path');
    const sourceBytes=await readFile(join(root,source.path)),sourceHash=sha(sourceBytes);
    if(sourceHash!==source.sha256)throw Error(`Source snapshot hash mismatch for ${example.id} at ${source.path}.`);
    if(source.originPath){assertRelative(source.originPath,'Source origin path');if(source.originSha256!==sourceHash)throw Error(`Source origin hash does not identify the preserved snapshot for ${example.id} at ${source.originPath}.`);}
   }
   const raw=definitionBytes.toString('utf8'),doc=jsonDocument(raw),visual=visualOf(doc);
   if(visual.id!==example.id.replace(/^umf-/,'' )&&visual.id!==example.id)throw Error(`Definition id ${visual.id} does not match showcase id ${example.id}.`);
   if(visual.kind!==example.kind||visual.form!==example.form)throw Error(`Definition kind/form does not match manifest for ${example.id}.`);
   const renders:RenderRow[]=[];
   for(const backend of ['graphviz','mermaid','lini'] as const)renders.push(await buildRender(example,doc,backend,browser,{graphviz,mermaid:mermaidPackage.version,lini,chromium:chromiumVersion}));
   rows.push({...example,definition:JSON.parse(raw),visualPayloadYaml:visualPayloadYaml(doc),renders});
  }
 }finally{await browser.close();}
 const output={schemaVersion:1,nativeProbes,examples:rows};await mkdir(join(root,dirname(outputPath)),{recursive:true});await writeFile(join(root,outputPath),JSON.stringify(output,null,2)+'\n');
 return {outputPath,examples:rows.length,qualified:rows.reduce((n,x)=>n+x.renders.filter(r=>r.status==='qualified').length,0),failed:rows.reduce((n,x)=>n+x.renders.filter(r=>r.status==='failed'||r.status==='unqualified').length,0)};
}

if(import.meta.main){const result=await buildShowcase();console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=1;}
