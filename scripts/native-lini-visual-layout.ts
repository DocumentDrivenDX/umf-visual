// SPDX-License-Identifier: MIT OR Apache-2.0
// Browser geometry qualification for the three comparison profiles and roadmap.
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Document} from '@umf/core';
import {chromium} from 'playwright';
import {exportVisual} from '../src';
import {verifyLiniRuntime,liniDirectory} from './interchange-runtime';

const fixtures=[
 {form:'matrix',file:'fixtures/visual/inventory/helix-adr-options.json'},
 {form:'before-after',file:'fixtures/visual/forms/visuals-before-after.json'},
 {form:'quadrant',file:'fixtures/visual/forms/layout-engines.json'},
 {form:'roadmap',file:'fixtures/visual/forms/visuals-roadmap.json'},
];
const pin=await verifyLiniRuntime();if(pin.version!=='1.1.0')throw new Error('Expected pinned Lini 1.1.0');
const runtime=await import(pathToFileURL(resolve(liniDirectory,'lini_wasm.js')).href) as {default(options:{module_or_path:Uint8Array}):Promise<void>;version?:()=>string;diagnostics(source:string,options:unknown):string;compile(source:string,options:unknown):string};
await runtime.default({module_or_path:await Bun.file(resolve(liniDirectory,'lini_wasm_bg.wasm')).bytes()});
if(runtime.version?.()!==pin.version)throw new Error('Loaded native runtime version differs from the verified pin');
const browser=await chromium.launch({headless:true}),browserVersion=browser.version(),hash=(value:string|Uint8Array)=>new Bun.CryptoHasher('sha256').update(value).digest('hex'),proof=[];
await mkdir('.cache/lini-visual-layout',{recursive:true});
try{
 for(const entry of fixtures){
  const input=await readFile(resolve(entry.file)),document=JSON.parse(input.toString()) as Document;
  const result=exportVisual(document,{format:'lini',profile:'umf.visual.lini.annotated/1'});if(!result.ok||!result.text)throw new Error(entry.form+': public export refused '+JSON.stringify(result.diagnostics));
  const nativeDiagnostics=JSON.parse(runtime.diagnostics(result.text,{})) as {diagnostics?:unknown[]};if(nativeDiagnostics.diagnostics?.length)throw new Error(entry.form+': pinned native diagnostics '+JSON.stringify(nativeDiagnostics.diagnostics));
  const svg=runtime.compile(result.text,{}),page=await browser.newPage({viewport:{width:1800,height:1200}});
  await page.setContent('<!doctype html><html><body style="margin:0;background:white;color-scheme:light">'+svg+'</body></html>');
  const geometry=await page.locator('svg').evaluate((root,form)=>{
   const rect=(element:Element)=>{const b=element.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};
   const overlap=(a:ReturnType<typeof rect>,b:ReturnType<typeof rect>)=>a.x<b.right-0.5&&b.x<a.right-0.5&&a.y<b.bottom-0.5&&b.y<a.bottom-0.5;
   const errors:string[]=[],rootSvg=root as SVGSVGElement;
   if(form==='roadmap'){
    const blocks=[...rootSvg.querySelectorAll('g.lini-block[data-id^="period_"],g.lini-block[data-id^="lane_"],g.lini-block[data-id^="span_"]')];
    const boxes=blocks.map(group=>({id:group.getAttribute('data-id')!,group,box:rect(group.querySelector(':scope > rect')!)}));
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)if(overlap(boxes[i]!.box,boxes[j]!.box))errors.push('native blocks overlap: '+boxes[i]!.id+' / '+boxes[j]!.id);
    const labelBoxes=boxes.flatMap(({id,group})=>{const text=group.querySelector(':scope > text'),shape=group.querySelector(':scope > rect');if(!text||!shape)return[];const tb=rect(text),rb=rect(shape),outside=Math.max(rb.x-tb.x,tb.right-rb.right,rb.y-tb.y,tb.bottom-rb.bottom,0);if(outside>5)errors.push('roadmap label exceeds grid block by '+outside.toFixed(1)+'px: '+id+' '+JSON.stringify({text:tb,block:rb}));return[{id,box:tb}];});
    for(let i=0;i<labelBoxes.length;i++)for(let j=i+1;j<labelBoxes.length;j++)if(overlap(labelBoxes[i]!.box,labelBoxes[j]!.box))errors.push('roadmap labels overlap: '+labelBoxes[i]!.id+' / '+labelBoxes[j]!.id);
    return{blocks:blocks.length,tables:0,labels:blocks.length,errors};
   }
   const tables=[...rootSvg.querySelectorAll('g.lini-table[data-id^="comparison-"],g.lini-table[data-id^="quadrant-"]')],tableBoxes=tables.map(group=>({id:group.getAttribute('data-id')!,box:rect(group)}));
   for(let i=0;i<tableBoxes.length;i++)for(let j=i+1;j<tableBoxes.length;j++)if(overlap(tableBoxes[i]!.box,tableBoxes[j]!.box))errors.push('native tables overlap: '+tableBoxes[i]!.id+' / '+tableBoxes[j]!.id);
   const labels=[...rootSvg.querySelectorAll('g.lini-cell[data-id]')].flatMap(group=>{const text=group.querySelector(':scope > text');return text?[{id:group.getAttribute('data-id')!,box:rect(text)}]:[];});
   for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)if(overlap(labels[i]!.box,labels[j]!.box))errors.push('table labels overlap: '+labels[i]!.id+' / '+labels[j]!.id);
   return{blocks:0,tables:tables.length,labels:labels.length,errors};
  },entry.form);
  const screenshot='.cache/lini-visual-layout/'+entry.form+'.png';await page.screenshot({path:screenshot,fullPage:true});
  await Bun.write('.cache/lini-visual-layout/'+entry.form+'.json',JSON.stringify(geometry,null,2)+'\n');
  if(geometry.errors.length)throw new Error(entry.form+': browser geometry failed '+JSON.stringify(geometry.errors));
  const fontStress=entry.form==='roadmap'?await page.locator('svg').evaluate(root=>{
   const svg=root as SVGSVGElement,previous=svg.style.getPropertyValue('--lini-font-family');svg.style.setProperty('--lini-font-family','monospace');
   const errors:string[]=[];let labels=0;
   for(const group of svg.querySelectorAll('g.lini-block[data-id^="span_"]')){const text=group.querySelector(':scope > text'),block=group.querySelector(':scope > rect');if(!text||!block)continue;labels++;const t=text.getBoundingClientRect(),b=block.getBoundingClientRect(),outside=Math.max(b.left-t.left,t.right-b.right,b.top-t.top,t.bottom-b.bottom,0);if(outside>5)errors.push(group.getAttribute('data-id')+': '+outside.toFixed(1)+'px');}
   if(previous)svg.style.setProperty('--lini-font-family',previous);else svg.style.removeProperty('--lini-font-family');return{font:'monospace',labels,errors};
  }):undefined;
  if(fontStress?.errors.length)throw new Error('Roadmap font fallback stress failed '+JSON.stringify(fontStress));
  proof.push({form:entry.form,fixture:entry.file,inputSha256:hash(input),sourceSha256:hash(result.text),svgSha256:hash(svg),nativeDiagnostics:nativeDiagnostics.diagnostics??[],browserGeometry:geometry,...(fontStress?{fontStress}:{}),screenshot});
  await page.close();
 }
}finally{await browser.close();}
const receipt={profile:'umf.visual.lini.annotated/1',model:'1.0.0',platform:process.platform,architecture:process.arch,runtime:{profile:pin.profile,version:pin.version,assets:pin.assets},browser:'Playwright Chromium '+browserVersion,cases:proof};
await Bun.write('.cache/native-lini-visual-layout.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
