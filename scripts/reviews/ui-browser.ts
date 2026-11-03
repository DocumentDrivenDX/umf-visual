// SPDX-License-Identifier: MIT OR Apache-2.0
import {chromium,type Page} from 'playwright';
import {createHash} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {extname,join,resolve,sep} from 'node:path';
import {readJsonValue} from '@umf/core';
import {authoredComparisonView,authoredFocusTargets,authoredMetricView,authoredStepListPolicy} from '../../microsite/authored-context.js';

const siteRoot=resolve('dist-site'),receipt=await Bun.file(join(siteRoot,'reviews.json')).json();
if(receipt.schemaVersion!==1||!Array.isArray(receipt.examples)||receipt.examples.length===0)throw Error('Build source-derived review presentations first.');
const reviews=receipt.examples,sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
function citationAssets(review:any){
 const evidence=review.originalEvidence,primary=new Set([evidence?.sourceDownloadPath,evidence?.capturePath].filter((value:any)=>typeof value==='string'));
 const published=Array.isArray(review.publishedAssets)?review.publishedAssets:[];
 return (Array.isArray(review.sources)?review.sources:[]).flatMap((source:any)=>{
  const item=typeof source==='string'?{path:source}:source;
  if(!item||typeof item.path!=='string'||typeof item.sha256!=='string')return [];
  return published.filter((asset:any)=>asset?.path===item.path&&asset.sha256===item.sha256&&typeof asset.outputPath==='string'&&!primary.has(asset.outputPath));
 });
}
const raceProbe=structuredClone(reviews[0]);raceProbe.id='race-probe';raceProbe.title=`${raceProbe.title} selection race`;raceProbe.originalEvidence={...raceProbe.originalEvidence,integrationCaseId:'race-probe'};
const uiReviews=[...reviews,raceProbe];
async function downloadBytes(page:Page,selector:string,target:string):Promise<{filename:string;bytes:Uint8Array}>{
 const resource=await page.locator(selector).evaluate(async element=>{
  const anchor=element as HTMLAnchorElement,response=await fetch(anchor.href);
  if(!response.ok)throw Error(`Download resource request failed (${response.status})`);
  return{filename:anchor.download,disabled:anchor.getAttribute('aria-disabled'),href:anchor.href,bytes:Array.from(new Uint8Array(await response.arrayBuffer()))};
 });
 if(resource.disabled==='true'||!resource.filename)throw Error(`${selector} is not an enabled named download.`);
 if(await page.evaluate(href=>(window as any).__revokedBlobUrls.includes(href),resource.href))throw Error(`${selector} download points at a revoked blob URL.`);
 const [download]=await Promise.all([page.waitForEvent('download',{timeout:10000}),page.locator(selector).click({timeout:10000})]);
 await download.saveAs(target);
 const bytes=await readFile(target);
 if(!bytes.length)throw Error(`${selector} download is empty.`);
 return{filename:download.suggestedFilename(),bytes};
}
async function exerciseViewerZoom(page:Page,expectedSvgSha256:string,selectionChanges:Array<()=>Promise<void>>):Promise<void>{
 const viewer=page.locator('#diagram-viewer'),frame=page.locator('#viewer-image-frame'),level=page.locator('#viewer-zoom-level');
 await page.locator('#enlarge-diagram').click();if(!(await viewer.isVisible()))throw Error('Review diagram viewer did not open.');
 await page.locator('#viewer-image').evaluate(async element=>{await (element as HTMLImageElement).decode();});
 const fitLabel=(await level.innerText()).trim(),fitPercent=Number(/Fit · (\d+)%/u.exec(fitLabel)?.[1]);
 if(!fitLabel.startsWith('Fit')||!Number.isFinite(fitPercent))throw Error('Opening the review viewer did not expose its effective Fit percentage.');
 const fit=await frame.evaluate(element=>{const f=element as HTMLElement,i=document.querySelector('#viewer-image') as HTMLImageElement,r=i.getBoundingClientRect();return{width:r.width,height:r.height,frameWidth:f.clientWidth,frameHeight:f.clientHeight};});
 if(fit.width>fit.frameWidth+1||fit.height>fit.frameHeight+1)throw Error('Review viewer Fit mode exceeds its available viewport.');
 await page.locator('#viewer-zoom-in').focus();await page.keyboard.press('Enter');if((await level.innerText()).trim()!==`${Math.min(400,fitPercent+25)}%`)throw Error(`Review zoom in did not advance Fit's ${fitPercent}% effective scale by 25 points.`);
 await page.locator('#viewer-actual-size').click();if((await level.innerText()).trim()!=='100%')throw Error('Review viewer actual size did not select 100%.');
 const actual=await frame.evaluate(element=>{const f=element as HTMLElement,i=document.querySelector('#viewer-image') as HTMLImageElement,r=i.getBoundingClientRect();return{width:r.width,height:r.height,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,scrollWidth:f.scrollWidth,scrollHeight:f.scrollHeight,clientWidth:f.clientWidth,clientHeight:f.clientHeight,tabIndex:f.tabIndex};});
 if(Math.abs(actual.width-actual.naturalWidth)>2||Math.abs(actual.height-actual.naturalHeight)>2)throw Error('Review 100% mode does not display intrinsic SVG dimensions.');
 if(actual.tabIndex<0)throw Error('Review diagram viewport is not keyboard focusable.');
 await page.locator('#viewer-zoom-in').click();if((await level.innerText()).trim()!=='125%')throw Error('Review zoom in did not advance by 25%.');
 for(let i=0;i<20&&await page.locator('#viewer-zoom-in').isEnabled();i++)await page.locator('#viewer-zoom-in').click();if((await level.innerText()).trim()!=='400%')throw Error('Review zoom in did not clamp at 400%.');
 for(let i=0;i<20&&await page.locator('#viewer-zoom-out').isEnabled();i++)await page.locator('#viewer-zoom-out').click();if((await level.innerText()).trim()!=='25%')throw Error('Review zoom out did not clamp at 25%.');
 await page.locator('#viewer-fit').click();if(!(await level.innerText()).trim().startsWith('Fit'))throw Error('Review Fit control did not restore Fit mode.');
 await page.setViewportSize({width:375,height:812});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Open review viewer causes page-level horizontal overflow on mobile.');
 const mobileFit=await frame.evaluate(element=>{const f=element as HTMLElement,i=document.querySelector('#viewer-image') as HTMLImageElement,r=i.getBoundingClientRect();return{width:r.width,height:r.height,frameWidth:f.clientWidth,frameHeight:f.clientHeight};});
 if(mobileFit.width>mobileFit.frameWidth+1||mobileFit.height>mobileFit.frameHeight+1)throw Error('Mobile review Fit mode exceeds its available viewport.');
 if(!(await page.locator('#viewer-actual-size').isEnabled()))throw Error('Mobile review Fit mode unexpectedly disables Actual size.');
 await page.locator('#viewer-actual-size').click();
 const mobileActual=await frame.evaluate(element=>{const f=element as HTMLElement,i=document.querySelector('#viewer-image') as HTMLImageElement,r=i.getBoundingClientRect();return{width:r.width,height:r.height,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,scrollWidth:f.scrollWidth,scrollHeight:f.scrollHeight,clientWidth:f.clientWidth,clientHeight:f.clientHeight};});
 if((await level.innerText()).trim()!=='100%'||Math.abs(mobileActual.width-mobileActual.naturalWidth)>2||Math.abs(mobileActual.height-mobileActual.naturalHeight)>2||(mobileActual.scrollWidth<=mobileActual.clientWidth&&mobileActual.scrollHeight<=mobileActual.clientHeight))throw Error('Mobile review 100% mode does not preserve the intrinsic-size scrollable image.');
 await frame.evaluate(element=>{const f=element as HTMLElement;f.scrollTo(f.scrollWidth>f.clientWidth?120:0,f.scrollHeight>f.clientHeight?120:0);});
 if(await frame.evaluate(element=>{const f=element as HTMLElement;return f.scrollLeft+f.scrollTop;})<=0)throw Error('Native overflow scrolling did not pan the mobile review viewport.');
 await frame.focus();if(await page.evaluate(()=>document.activeElement?.id)!=='viewer-image-frame')throw Error('Review diagram viewport did not accept keyboard focus.');
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const fixedAfterResize=await frame.evaluate(element=>{const f=element as HTMLElement,i=document.querySelector('#viewer-image') as HTMLImageElement,r=i.getBoundingClientRect();return{width:r.width,height:r.height,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight};});
 if((await level.innerText()).trim()!=='100%'||Math.abs(fixedAfterResize.width-fixedAfterResize.naturalWidth)>2||Math.abs(fixedAfterResize.height-fixedAfterResize.naturalHeight)>2)throw Error('Manual review 100% zoom changed size when the viewport resized.');
 await page.locator('#viewer-fit').click();
 const refit=await frame.evaluate(element=>{const f=element as HTMLElement,i=document.querySelector('#viewer-image') as HTMLImageElement,r=i.getBoundingClientRect();return{width:r.width,height:r.height,frameWidth:f.clientWidth,frameHeight:f.clientHeight};});
 if(!(await level.innerText()).trim().startsWith('Fit')||refit.width>refit.frameWidth+1||refit.height>refit.frameHeight+1)throw Error('Review Fit mode did not recompute after a viewport resize.');
 const downloadedHash=await page.evaluate(async()=>{const link=document.querySelector('#viewer-svg-download') as HTMLAnchorElement,response=await fetch(link.href),bytes=await response.arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');});
 if(downloadedHash!==expectedSvgSha256)throw Error('Review viewer zoom changed the hash-verified SVG download.');
 await page.keyboard.press('Escape');if(await viewer.isVisible()||await page.evaluate(()=>document.activeElement?.id)!=='enlarge-diagram')throw Error('Review viewer Escape did not close and restore focus.');
 for(const changeSelection of selectionChanges){await changeSelection();await page.locator('#enlarge-diagram').click();
  if(!(await level.innerText()).trim().startsWith('Fit'))throw Error('Changing review scene/backend did not reset the viewer to Fit.');
  await page.keyboard.press('Escape');}
}
async function openHistoricalDisclosure(page:Page):Promise<void>{
 const details=page.locator('#review-evidence-disclosure'),summary=details.locator(':scope > summary');
 if(!(await details.evaluate(element=>(element as HTMLDetailsElement).open)))await summary.click();
 if(!(await details.evaluate(element=>(element as HTMLDetailsElement).open)))throw Error('Source evidence did not open from its summary.')
 await summary.focus();await page.keyboard.press('Enter');
 if(await details.evaluate(element=>(element as HTMLDetailsElement).open))throw Error('Source evidence disclosure did not close with Enter.')
 await summary.focus();await page.keyboard.press('Enter');
 if(!(await details.evaluate(element=>(element as HTMLDetailsElement).open)))throw Error('Source evidence disclosure did not reopen with Enter.')
}
async function assertHistoricalImageFits(page:Page,caseId:string):Promise<void>{
 await page.waitForFunction(id=>{const image=document.querySelector('#historical-capture') as HTMLImageElement|null,frame=image?.parentElement,box=image?.getBoundingClientRect();return !!image&&!image.hidden&&image.alt.endsWith(id)&&image.naturalWidth>0&&!!frame&&box!.width>0&&box!.height>0&&box!.width<=frame.clientWidth+1;},caseId,{timeout:10000});
 const layout=await page.locator('#historical-capture').evaluate(element=>{const image=element as HTMLImageElement,box=image.getBoundingClientRect(),frame=image.parentElement!.getBoundingClientRect(),frameWidth=image.parentElement!.clientWidth;return{naturalRatio:image.naturalWidth/image.naturalHeight,ratio:box.width/box.height,width:box.width,height:box.height,frameWidth,inside:box.left>=frame.left-1&&box.right<=frame.right+1};});
 if(!layout.inside||layout.width>layout.frameWidth+1||layout.height<1||Math.abs(layout.ratio-layout.naturalRatio)>.02)throw Error(`${caseId} historical capture does not fit responsively with its source aspect ratio: ${JSON.stringify(layout)}.`);
}
async function assertWidePreviewFits(page:Page,reviewId:string,backend:string):Promise<void>{
 const layout=await page.locator('#diagram-image').evaluate(element=>{const image=element as HTMLImageElement,frame=image.parentElement!,box=frame.getBoundingClientRect(),style=getComputedStyle(image),paddingTop=parseFloat(style.paddingTop),paddingBottom=parseFloat(style.paddingBottom),paddingLeft=parseFloat(style.paddingLeft),paddingRight=parseFloat(style.paddingRight);return{ratio:image.naturalWidth/image.naturalHeight,frameHeight:box.height,frameWidth:box.width,expectedHeight:(box.width-2-paddingLeft-paddingRight)/(image.naturalWidth/image.naturalHeight)+paddingTop+paddingBottom+2};});
 if(layout.ratio>3&&layout.frameHeight>layout.expectedHeight+8)throw Error(`${reviewId}/${backend} wide diagram is letterboxed in an unnecessarily tall preview frame: ${JSON.stringify(layout)}.`);
}
async function assertAuthoredContext(page:Page,review:any):Promise<void>{
 const details=page.locator('#authored-context'),summary=details.locator(':scope > summary'),visual=review.definition?.extensions?.['umf.visual'];
 if(!visual||typeof visual!=='object'){
  if(await details.isVisible())throw Error(`${review.id} shows authored context without a Visual definition.`);
  return;
 }
 if(await details.evaluate(element=>(element as HTMLDetailsElement).open))throw Error(`${review.id} inherited an open authored-context panel from another selection.`);
 if(await details.getAttribute('hidden')!==null)throw Error(`${review.id} authored context is hidden despite a verified Visual definition.`);
 await summary.focus();await page.keyboard.press('Enter');
 if(!(await details.evaluate(element=>(element as HTMLDetailsElement).open)))throw Error(`${review.id} authored context did not open from the keyboard.`);
 const content=page.locator('#authored-context-content'),text=await content.innerText();
 for(const key of ['title','question','takeaway','audience'])if(typeof visual[key]==='string'){
  if(!text.includes(visual[key])||!(await content.locator('code').allTextContents()).includes(`/extensions/umf.visual/${key}`))throw Error(`${review.id} authored ${key} is missing or has no full source pointer.`);
 }
 if(visual.source&&typeof visual.source==='object'){
  for(const key of ['path','view','digest'])if(typeof visual.source[key]==='string'&&(!text.includes(visual.source[key])||!(await content.locator('code').allTextContents()).includes(`/extensions/umf.visual/source/${key}`)))throw Error(`${review.id} authored source ${key} is missing or has no full source pointer.`);
  if(!text.includes('does not independently retrieve or verify the referenced resource'))throw Error(`${review.id} source locator is presented as externally verified.`);
 }
 const comparison=authoredComparisonView(visual),pointers=await content.locator('code').allTextContents();
 if(comparison){
  if(!text.includes('Authored comparison'))throw Error(`${review.id} comparison context is not labeled as authored source content.`);
  for(const axis of comparison.axes){if(!pointers.includes(axis.sourcePath)||!text.includes(String(axis.value)))throw Error(`${review.id} comparison axis ${axis.key} is missing or unlocated.`);}
  for(const collection of [comparison.items,comparison.criteria])for(const row of collection){
   if(!pointers.includes(row.sourcePath)||!text.includes(String(row.id))||!text.includes(String(row.label)))throw Error(`${review.id} comparison row ${row.id} is missing or unlocated.`);
   for(const field of row.fields){if(!pointers.includes(field.sourcePath)||!text.includes(typeof field.value==='string'?field.value:JSON.stringify(field.value)??String(field.value)))throw Error(`${review.id} comparison field ${field.key} is missing or unlocated.`);}
  }
  for(const value of comparison.values){
   if(!pointers.includes(value.sourcePath)||!text.includes(String(value.item))||!text.includes(String(value.criterion)))throw Error(`${review.id} comparison value references are missing or unlocated.`);
   for(const field of value.fields){if(!pointers.includes(field.sourcePath)||!text.includes(typeof field.value==='string'?field.value:JSON.stringify(field.value)??String(field.value)))throw Error(`${review.id} comparison value ${field.key} is missing or unlocated.`);}
  }
  if(comparison.chosen){
   if(!text.includes('Authored choice')||!text.includes(String(comparison.chosen.item))||!text.includes(String(comparison.chosen.reason))||!pointers.includes(comparison.chosen.itemSourcePath)||!pointers.includes(comparison.chosen.reasonSourcePath))throw Error(`${review.id} chosen item/reason is missing, unlocated, or not identified as authored.`);
  }
 }
 const metric=authoredMetricView(visual);
 if(metric){
  if(!text.includes('Authored metric fields')||!text.includes('does not calculate progress, percentages, or recommendations'))throw Error(`${review.id} metric context is not labeled as authored or avoids derived progress.`);
  for(const field of metric.fields)if(!pointers.includes(field.sourcePath)||!text.includes(typeof field.value==='string'?field.value:JSON.stringify(field.value)??String(field.value)))throw Error(`${review.id} metric field ${field.key} is missing or unlocated.`);
  for(const series of metric.series){
   if(!pointers.includes(series.sourcePath)||!text.includes(String(series.id))||!text.includes(String(series.label)))throw Error(`${review.id} metric series ${series.id} is missing or unlocated.`);
   if(!pointers.includes(series.idSourcePath)||!pointers.includes(series.labelSourcePath))throw Error(`${review.id} metric series identity fields lack exact pointers.`);
   for(const field of series.fields)if(!pointers.includes(field.sourcePath)||!text.includes(typeof field.value==='string'?field.value:JSON.stringify(field.value)??String(field.value)))throw Error(`${review.id} metric series field ${field.key} is missing or unlocated.`);
   for(const point of series.points){
    if(!pointers.includes(point.sourcePath))throw Error(`${review.id} metric point index is missing or unlocated.`);
    for(const field of point.fields)if(!pointers.includes(field.sourcePath)||!text.includes(typeof field.value==='string'?field.value:JSON.stringify(field.value)??String(field.value)))throw Error(`${review.id} metric point field ${field.key} is missing or unlocated.`);
   }
  }
 }
 const visualOmissions=Array.isArray(visual.omissions)?visual.omissions:[];
 for(let index=0;index<visualOmissions.length;index++)if(!text.includes(String(visualOmissions[index]))||!pointers.includes(`/extensions/umf.visual/omissions/${index}`))throw Error(`${review.id} authored caveat ${index} is missing or lacks its full source pointer.`);
 const steps=Array.isArray(visual.steps)?visual.steps:[],items=content.locator('.authored-step-list > li');
 if(await items.count()!==steps.length)throw Error(`${review.id} authored step count differs from its Visual payload.`);
 const policy=authoredStepListPolicy(steps),targets=authoredFocusTargets(visual);
 for(let stepIndex=0;stepIndex<steps.length;stepIndex++){
  const step=steps[stepIndex],item=items.nth(stepIndex);
  if(await item.getAttribute('data-step-id')!==step.id)throw Error(`${review.id} authored step identity/order changed at ${stepIndex}.`);
  const isNumbered=await item.evaluate(element=>!(element as HTMLElement).classList.contains('authored-step-unordered'));
  if(isNumbered!==policy[stepIndex]?.numbered)throw Error(`${review.id} authored step numbering does not preserve the source when policy.`);
  if(typeof step.when==='string'&&await item.getAttribute('data-when')!==step.when)throw Error(`${review.id} authored step when value changed.`);
  for(const field of ['title','caption','when','tag'] as const)if(typeof step[field]==='string'&&!(await item.innerText()).includes(step[field]))throw Error(`${review.id} step ${step.id} omits authored ${field}.`);
  const focus=Array.isArray(step.focus)?step.focus:[],focusItems=item.locator('.authored-focus-list > li');
  if(!focus.length){if(await focusItems.count()!==1||!(await focusItems.first().innerText()).includes('No focus IDs authored.'))throw Error(`${review.id} step ${step.id} empty focus state is not explicit.`);continue;}
  if(await focusItems.count()!==focus.length)throw Error(`${review.id} step ${step.id} focus reference count changed.`);
  for(let focusIndex=0;focusIndex<focus.length;focusIndex++){
   const id=focus[focusIndex],focusItem=focusItems.nth(focusIndex),candidate=targets.get(id)||[];
   if(await focusItem.getAttribute('data-focus-id')!==id||!(await focusItem.innerText()).includes(`/extensions/umf.visual/steps/${stepIndex}/focus/${focusIndex}`))throw Error(`${review.id} step ${step.id} focus pointer/identity changed.`);
   if(!candidate.length){if(!(await focusItem.innerText()).includes('Unresolved focus ID'))throw Error(`${review.id} unresolved focus ${id} was dropped or guessed.`);}
   else for(const target of candidate){
    const targetRows=focusItem.locator('.authored-focus-targets > li'),rows=await targetRows.allInnerTexts();
    if(!rows.some(row=>row.includes(target.kind)&&row.includes(target.label)&&row.includes(target.sourcePath)))throw Error(`${review.id} focus ${id} lost typed target ${target.kind} at ${target.sourcePath}.`);
   }
  }
 }
 await summary.focus();await page.keyboard.press('Enter');
 if(await details.evaluate(element=>(element as HTMLDetailsElement).open))throw Error(`${review.id} authored context did not close from the keyboard.`);
}
function expectedRenderingNoteGroups(row:any){
 const entries=[...(Array.isArray(row.omissions)?row.omissions.map((note:any)=>({label:'Omission',note})):[]),...(Array.isArray(row.approximations)?row.approximations.map((note:any)=>({label:'Native representation',note})):[])],groups=new Map<string,{label:string;note:unknown;sourcePaths:string[]}>();
 for(const entry of entries){const note=entry.note,sourcePath=note&&typeof note==='object'&&!Array.isArray(note)&&typeof note.sourcePath==='string'?note.sourcePath:undefined,content=note&&typeof note==='object'&&!Array.isArray(note)?Object.fromEntries(Object.entries(note).filter(([key])=>key!=='sourcePath')):note,key=JSON.stringify([entry.label,content]);if(!groups.has(key))groups.set(key,{label:entry.label,note:content,sourcePaths:[]});if(sourcePath)groups.get(key)!.sourcePaths.push(sourcePath);}
 return [...groups.values()];
}
function stableJson(value:any):any{
 if(Array.isArray(value))return value.map(stableJson);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableJson(value[key])]));
 return value;
}
async function assertRenderingNotes(page:Page,row:any,reviewId:string,backend:string):Promise<void>{
 const expected=expectedRenderingNoteGroups(row),sourceDetails=page.locator('#source-details');
 if(!(await sourceDetails.evaluate(element=>(element as HTMLDetailsElement).open)))await sourceDetails.locator(':scope > summary').click();
 const notesPanel=page.locator('#rendering-notes');
 if(expected.length&&!(await notesPanel.evaluate(element=>(element as HTMLDetailsElement).open)))await notesPanel.locator(':scope > summary').click();
 const list=page.locator('#rendering-notes-list'),actual=list.locator(':scope > li');
 if(await actual.count()!==expected.length)throw Error(`${reviewId}/${backend} rendering notes were not grouped by content while retaining all source pointers.`);
 for(const[index,group]of expected.entries()){
  const item=actual.nth(index),detail=await item.locator(':scope > code').textContent(),expectedDetail=typeof group.note==='string'?group.note:JSON.stringify(group.note);
  let detailMatches=detail===expectedDetail;
  if(!detailMatches&&group.note&&typeof group.note==='object')try{detailMatches=JSON.stringify(stableJson(JSON.parse(detail??'')))===JSON.stringify(stableJson(group.note));}catch{}
  const actualLabel=await item.locator(':scope > strong').textContent();
  if(!(actualLabel??'').includes(group.label)||!detailMatches)throw Error(`${reviewId}/${backend} rendering note content differs from its receipt: expected ${JSON.stringify(stableJson(group.note))} / ${group.label}, received ${JSON.stringify(detail)} / ${actualLabel}.`);
  const disclosure=item.locator(':scope > details.rendering-note-sources');
  if(group.sourcePaths.length){
   if(await disclosure.count()!==1)throw Error(`${reviewId}/${backend} grouped rendering note hid source pointers without a disclosure.`);
   await disclosure.locator(':scope > summary').click();
   const visiblePaths=await disclosure.locator('li code').allTextContents();
   if(JSON.stringify(visiblePaths)!==JSON.stringify(group.sourcePaths))throw Error(`${reviewId}/${backend} grouped rendering note omitted or changed source paths.`);
   await disclosure.locator(':scope > summary').click();
  }else if(await disclosure.count())throw Error(`${reviewId}/${backend} added a source-path disclosure with no source pointers.`);
 }
 const expectedCircularGrid=(row.approximations??[]).some((item:any)=>item.code==='CIRCULAR_NATIVE_GRID'),caveat=page.locator('#render-caveat');
 if(expectedCircularGrid&&!(await caveat.innerText()).includes('native block grid approximates circular node placement while retaining the authored clockwise order'))throw Error(`${reviewId}/${backend} circular native-grid approximation is not explained beside the preview.`);
 if(expected.length&&await notesPanel.evaluate(element=>(element as HTMLDetailsElement).open))await notesPanel.locator(':scope > summary').click();
}
const mime:Record<string,string>={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json;charset=utf-8','.yaml':'application/yaml;charset=utf-8','.yml':'application/yaml;charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.dot':'text/vnd.graphviz;charset=utf-8','.mmd':'text/plain;charset=utf-8','.lini':'text/plain;charset=utf-8'};
let corruptPath:string|undefined;
let delayedCapturePath:string|undefined,delayedCaptureCount=0,signalDelayedRequest!:()=>void;
let corruptCitationChecked=false,delayedCitationPath:string|undefined,delayedCitationCount=0,signalDelayedCitation!:()=>void,signalDelayedCitationFulfilled!:()=>void;
let includeRaceProbe=true;
let previousRecipeUrl:string|undefined;
const delayedCaptureRequested=new Promise<void>(resolve=>{signalDelayedRequest=resolve;});
const delayedCitationRequested=new Promise<void>(resolve=>{signalDelayedCitation=resolve;});
const delayedCitationFulfilled=new Promise<void>(resolve=>{signalDelayedCitationFulfilled=resolve;});
const browser=await chromium.launch({headless:true}),errors:string[]=[],checks:string[]=[];
await mkdir('.cache',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});page.on('pageerror',e=>errors.push(String(e)));
 let contextModuleLoaded=false;page.on('response',response=>{if(new URL(response.url()).pathname.endsWith('/authored-context.js'))contextModuleLoaded=response.ok();});
 await page.addInitScript(()=>{const original=URL.revokeObjectURL.bind(URL),create=URL.createObjectURL.bind(URL);(window as any).__revokedBlobUrls=[];(window as any).__createdBlobUrls=[];URL.revokeObjectURL=(url:string)=>{(window as any).__revokedBlobUrls.push(url);original(url);};URL.createObjectURL=(blob:Blob)=>{const url=create(blob),record:{url:string;type:string;size:number;sha256?:string}={url,type:blob.type,size:blob.size};(window as any).__createdBlobUrls.push(record);void blob.arrayBuffer().then(bytes=>crypto.subtle.digest('SHA-256',bytes)).then(digest=>{record.sha256=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');});return url;};});
 await page.route('https://umf-review.local/**',async route=>{
  const url=new URL(route.request().url()),pathname=decodeURIComponent(url.pathname);
  if(pathname==='/reviews.json'){await route.fulfill({status:200,body:JSON.stringify({...receipt,examples:includeRaceProbe?uiReviews:reviews}),contentType:'application/json'});return;}
  if(delayedCapturePath&&pathname===`/${delayedCapturePath}`&&delayedCaptureCount++===0){signalDelayedRequest();await new Promise(resolve=>setTimeout(resolve,700));}
  if(delayedCitationPath&&pathname===`/${delayedCitationPath}`&&delayedCitationCount++===0){signalDelayedCitation();await new Promise(resolve=>setTimeout(resolve,700));}
  if(corruptPath&&pathname===`/${corruptPath}`){await route.fulfill({status:200,body:'corrupt-content',contentType:'image/svg+xml'});return;}
  const filePath=resolve(siteRoot,`.${pathname==='/'?'/reviews.html':pathname}`);
  if(filePath===siteRoot||!filePath.startsWith(siteRoot+sep)){await route.fulfill({status:404,body:'Not found'});return;}
  const file=Bun.file(filePath);if(!(await file.exists())){await route.fulfill({status:404,body:'Not found'});return;}
  await route.fulfill({status:200,body:Buffer.from(await file.arrayBuffer()),contentType:mime[extname(filePath)]||'application/octet-stream',headers:{'cache-control':'no-store'}});
  if(delayedCitationPath&&pathname===`/${delayedCitationPath}`)signalDelayedCitationFulfilled();
 });
 const first=reviews[0];
 await page.goto(`https://umf-review.local/reviews.html?review=${encodeURIComponent(first.id)}`,{waitUntil:'networkidle'});
 if(!contextModuleLoaded)throw Error('The reviews page did not load its packaged authored-context ES module.');
 await page.locator('#scenario-list .scenario-button').first().waitFor();
 if(await page.locator('#scenario-list .scenario-button').count()!==uiReviews.length)throw Error('Review selector count differs from the review source manifest plus its browser-only race fixture.');
 if(new URL(page.url()).pathname!=='/reviews.html'||new URL(page.url()).searchParams.get('review')!==first.id)throw Error('Review deep link did not select the requested reviewed document.');
 if(await page.locator('#review-evidence-disclosure').evaluate(element=>(element as HTMLDetailsElement).open))throw Error('Original host evidence must start collapsed so the reviewed rendering is primary.');
 const [downloadProbe]=await Promise.all([page.waitForEvent('download',{timeout:5000}),page.evaluate(()=>{const link=document.createElement('a');link.href=URL.createObjectURL(new Blob(['probe']));link.download='review-download-probe.txt';document.body.append(link);link.click();link.remove();})]);
 if(downloadProbe.suggestedFilename()!=='review-download-probe.txt')throw Error('Browser download event baseline failed.');
 await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:'https://umf-review.local'});

 const raceCapture=reviews[0]!.originalEvidence;
 if(raceCapture){
  delayedCapturePath=raceCapture.capturePath;
  await page.locator('[data-example-id="race-probe"]').click();
  await Promise.race([delayedCaptureRequested,new Promise((_,reject)=>setTimeout(()=>reject(Error('The delayed historical capture request did not start.')),5000))]);
  await page.locator(`[data-example-id="${first.id}"]`).click();
  await page.waitForFunction(id=>(document.querySelector('#historical-capture') as HTMLImageElement|null)?.alt.endsWith(id)===true,raceCapture.integrationCaseId,{timeout:10000});
  await page.waitForTimeout(800);
  const finalAlt=await page.locator('#historical-capture').getAttribute('alt');
  if(!finalAlt?.endsWith(raceCapture.integrationCaseId))throw Error('A delayed prior review replaced the currently selected historical capture.');
  await openHistoricalDisclosure(page);
  const raceDownload=await downloadBytes(page,'#historical-capture-download',`.cache/review-${first.id}-race-original${extname(raceCapture.capturePath)}`);
  if(sha(raceDownload.bytes)!==raceCapture.captureSha256)throw Error('A delayed prior review revoked or replaced the selected capture download.');
  const captureUrlBeforeBackendChange=await page.locator('#historical-capture-download').getAttribute('href');
  await page.locator('[data-backend="mermaid"]').click();
  await page.waitForFunction(()=>document.querySelector('#download-svg')?.getAttribute('aria-disabled')==='false'||document.querySelector('#diagram-status')?.classList.contains('error')===true,undefined,{timeout:30000});
  if(await page.locator('#historical-capture-download').getAttribute('href')!==captureUrlBeforeBackendChange)throw Error('Changing render backend replaced the still-current historical capture URL.');
  await assertHistoricalImageFits(page,raceCapture.integrationCaseId);
  const captureAfterBackendChange=await downloadBytes(page,'#historical-capture-download',`.cache/review-${first.id}-after-backend-change${extname(raceCapture.capturePath)}`);
  if(sha(captureAfterBackendChange.bytes)!==raceCapture.captureSha256)throw Error('Changing render backend revoked or changed the selected historical capture.');
  delayedCapturePath=undefined;
  checks.push('A→B→A late captures and backend changes preserve the current historical capture and hash-verified download');
 }
 includeRaceProbe=false;
 await page.locator('[data-example-id="race-probe"]').evaluate(element=>element.remove());

 const stepReview=reviews.find((candidate:any)=>(candidate.definition?.extensions?.['umf.visual']?.steps?.length??0)>0);
 if(stepReview){
  const disclosure=page.locator('#authored-context'),summary=disclosure.locator(':scope > summary');
  await page.locator(`[data-example-id="${stepReview.id}"]`).click();
  await page.waitForFunction(title=>document.querySelector('#diagram-title')?.textContent===title,stepReview.title,{timeout:30000});
  const stepLini=stepReview.renders.find((render:any)=>render.backend==='lini'&&render.status==='qualified');
  if(!stepLini)throw Error('The authored walkthrough review has no qualified Lini backend for reset coverage.');
  await page.locator('[data-backend="lini"]').click();
  await page.waitForFunction(()=>document.querySelector('#download-svg')?.getAttribute('aria-disabled')==='false',undefined,{timeout:30000});
  if(await page.locator('[data-backend="lini"]').getAttribute('aria-pressed')!=='true')throw Error('The walkthrough scene did not switch to its qualified Lini backend.');
  await assertAuthoredContext(page,stepReview);
  await summary.focus();await page.keyboard.press('Enter');
  await page.locator('[data-backend="mermaid"]').click();
  await page.waitForFunction(()=>document.querySelector('#download-svg')?.getAttribute('aria-disabled')==='false'||document.querySelector('#diagram-status')?.classList.contains('error')===true,undefined,{timeout:30000});
  if(await page.locator('[data-backend="mermaid"]').getAttribute('aria-pressed')!=='true')throw Error('The walkthrough scene did not switch to the selected Mermaid backend.');
  if(await disclosure.evaluate(element=>(element as HTMLDetailsElement).open))throw Error('Changing backend did not collapse the authored walkthrough.');
  const other=reviews.find((candidate:any)=>candidate.id!==stepReview.id&&candidate.definition?.extensions?.['umf.visual']);
  if(other){
   await summary.focus();await page.keyboard.press('Enter');
   await page.locator(`[data-example-id="${other.id}"]`).click();
   await page.waitForFunction(title=>document.querySelector('#diagram-title')?.textContent===title,other.title,{timeout:30000});
   if(await disclosure.evaluate(element=>(element as HTMLDetailsElement).open))throw Error('Changing review selection did not collapse the authored walkthrough.');
   const otherVisual=other.definition.extensions?.['umf.visual'],otherContext=await page.locator('#authored-context-content').textContent()??'';
   if(typeof otherVisual.question==='string'&&!otherContext.includes(otherVisual.question))throw Error('Changing review selection left stale authored context.');
   await page.locator(`[data-example-id="${first.id}"]`).click();
   await page.waitForFunction(title=>document.querySelector('#diagram-title')?.textContent===title,first.title,{timeout:30000});
  }
  checks.push('authored walkthrough keyboard, typed focus, backend reset, and scene reset are verified');
 }

 for(const review of reviews){
  if(review.id!==first.id)await page.locator(`[data-example-id="${review.id}"]`).click();
  await page.waitForFunction(title=>document.querySelector('#diagram-title')?.textContent===title,review.title,{timeout:30000});
  if(await page.locator('#diagram-title').innerText()!==review.title)throw Error(`${review.id} selection did not show its title.`);
  if(new URL(page.url()).searchParams.get('review')!==review.id)throw Error(`${review.id} selection did not update its deep link.`);
  await assertAuthoredContext(page,review);
  const yaml=await page.locator('#visual-payload').innerText(),parsed=readJsonValue(yaml,'yaml');
  if(yaml!==review.visualPayloadYaml||JSON.stringify(parsed)!==JSON.stringify(review.definition.extensions['umf.visual']))throw Error(`${review.id} visible YAML differs from its exact UMF payload.`);
  await page.locator('#copy-payload').click();if(await page.evaluate(()=>navigator.clipboard.readText())!==yaml)throw Error(`${review.id} payload copy differs from its exact visible YAML.`);
  const evidence=review.originalEvidence;
  if(Array.isArray(review.sources)&&review.sources.some((source:any)=>source.label)){
   await page.locator('#source-details').evaluate(element=>{(element as HTMLDetailsElement).open=true;});
   const citations=await page.locator('#source-citations').innerText();
   for(const source of review.sources as Array<{label?:string;path?:string}>){
    if(source.label&&(!citations.includes(source.label)||!citations.includes(source.path?.split('/').pop()??'')))throw Error(`${review.id} source details do not expose its labeled source citation ${source.label}.`);
   }
  }
  for(const asset of citationAssets(review)){
   const selector=`.source-asset-download[data-output-path="${asset.outputPath}"]`;
   await page.waitForFunction(path=>[...document.querySelectorAll('.source-asset-download')].some(element=>(element as HTMLAnchorElement).dataset.outputPath===path&&element.getAttribute('aria-disabled')==='false'),asset.outputPath,{timeout:10000});
   const downloaded=await downloadBytes(page,selector,`.cache/review-${review.id}-${String(asset.path).split('/').pop()}`);
   const expected=await readFile(resolve(siteRoot,asset.outputPath));
   if(downloaded.filename!==String(asset.path).split('/').pop()||sha(downloaded.bytes)!==asset.sha256||!Buffer.from(downloaded.bytes).equals(expected))throw Error(`${review.id} cited source asset ${asset.path} download differs from its exact hash-verified published bytes.`);
   checks.push(`${review.id} cited source asset ${asset.path} downloads exact hash-verified bytes`);
   if(!corruptCitationChecked){
    const next=reviews.find((candidate:any)=>candidate.id!==review.id);if(!next)throw Error('No second review exists for the corrupt cited-source control.');
    corruptPath=asset.outputPath;await page.locator(`[data-example-id="${next.id}"]`).click();await page.waitForFunction(title=>document.querySelector('#diagram-title')?.textContent===title,next.title,{timeout:30000});
    await page.locator(`[data-example-id="${review.id}"]`).click();await page.waitForFunction(path=>{const link=[...document.querySelectorAll('.source-asset-download')].find(element=>(element as HTMLAnchorElement).dataset.outputPath===path) as HTMLAnchorElement|undefined;return !!link&&link.getAttribute('aria-disabled')==='true'&&link.title.includes('hash does not match');},asset.outputPath,{timeout:10000});
    corruptPath=undefined;await page.locator(`[data-example-id="${next.id}"]`).click();await page.waitForFunction(title=>document.querySelector('#diagram-title')?.textContent===title,next.title,{timeout:30000});
    await page.locator(`[data-example-id="${review.id}"]`).click();await page.waitForFunction(path=>[...document.querySelectorAll('.source-asset-download')].some(element=>(element as HTMLAnchorElement).dataset.outputPath===path&&element.getAttribute('aria-disabled')==='false'),asset.outputPath,{timeout:10000});
    corruptCitationChecked=true;checks.push(`${review.id} corrupt cited source asset is hash-refused and recovers on a fresh selection`);
   }
  }
  if(evidence?.kind==='synthetic-integration-witness'){
   await openHistoricalDisclosure(page);
   await assertHistoricalImageFits(page,evidence.integrationCaseId);
   const identity=await page.locator('#historical-identity').innerText();
   for(const value of [evidence.rendererId,evidence.rendererProfileId,evidence.modelVersion,evidence.mappingVersion,evidence.nativeVersion,evidence.stage])if(!identity.includes(value))throw Error(`${review.id} historical identity omits ${value}.`);
   if(!(await page.locator('#historical-scope').innerText()).includes(evidence.scope))throw Error(`${review.id} historical scope differs from its manifest.`);
   for(const omission of evidence.knownOmissions)if(!(await page.locator('#historical-omissions').innerText()).includes(omission))throw Error(`${review.id} historical note is missing: ${omission}`);
   const asset=review.publishedAssets.find((item:any)=>item.outputPath===evidence.capturePath);
   if(!asset||asset.sha256!==evidence.captureSha256)throw Error(`${review.id} historical capture is not present in the source manifest.`);
   const capture=await downloadBytes(page,'#historical-capture-download',`.cache/review-${review.id}-original${extname(evidence.capturePath)}`);
   if(capture.filename!==evidence.capturePath.split('/').pop())throw Error(`${review.id} original capture download has an unexpected filename.`);
   if(sha(capture.bytes)!==evidence.captureSha256)throw Error(`${review.id} original host capture differs from its verified receipt hash.`);
   for(const width of [375,1440]){
    await page.setViewportSize({width,height:width===375?812:1000});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await assertHistoricalImageFits(page,evidence.integrationCaseId);
   }
   checks.push(`${review.id} historical capture resizes from desktop to 375px and back without clipping or aspect-ratio distortion`);
   const historicalScreenshot=review.id===first.id?'.cache/reviews-ui-historical.png':`.cache/reviews-ui-${review.id}-historical.png`;
   await page.locator('#review-evidence').screenshot({path:historicalScreenshot});
  }else if(evidence?.kind==='authoritative-umf-source'){
   await openHistoricalDisclosure(page);
   const identity=await page.locator('#historical-identity').innerText();
   for(const value of [evidence.documentId,evidence.visualId,evidence.envelopeVersion,evidence.modelVersion])if(!identity.includes(value))throw Error(`${review.id} authoritative source identity omits ${value}.`);
   if(!(await page.locator('#historical-scope').innerText()).includes(evidence.scope))throw Error(`${review.id} authoritative source scope differs from its manifest.`);
   const sourceCitation=await page.locator('#historical-sources').innerText();
   if(!sourceCitation.includes(evidence.sourcePath.split('/').pop())||!sourceCitation.includes(evidence.sourceSha256))throw Error(`${review.id} authoritative source path/hash is not visibly identified.`);
   if(!(await page.locator('#historical-omissions-title').evaluate(element=>(element as HTMLElement).hidden))||await page.locator('#historical-omissions').innerText()!=='')throw Error(`${review.id} authoritative source is shown with forced omission notes.`);
   if(!(await page.locator('#historical-capture').evaluate(element=>(element as HTMLImageElement).hidden)))throw Error(`${review.id} authoritative UMF source was given a fabricated host preview.`);
   const asset=review.publishedAssets.find((item:any)=>item.outputPath===evidence.sourceDownloadPath);
   if(!asset||asset.path!==evidence.sourcePath||asset.sha256!==evidence.sourceSha256)throw Error(`${review.id} authoritative source download is not in the published asset manifest.`);
   const source=await downloadBytes(page,'#historical-capture-download',`.cache/review-${review.id}-authoritative-source.json`);
   if(source.filename!==evidence.sourcePath.split('/').pop()||sha(source.bytes)!==evidence.sourceSha256)throw Error(`${review.id} authoritative source download differs from the checked source bytes.`);
   checks.push(`${review.id} authoritative UMF source identity and exact-byte download are verified without host-capture claims`);
   const historicalScreenshot=review.id===first.id?'.cache/reviews-ui-historical.png':`.cache/reviews-ui-${review.id}-historical.png`;
   await page.locator('#review-evidence').screenshot({path:historicalScreenshot});
  }else if(evidence)throw Error(`${review.id} uses an unsupported original-evidence provenance kind.`);
  else if(await page.locator('#review-evidence').isVisible())throw Error(`${review.id} shows source evidence that is not declared.`);

  for(const backend of ['graphviz','mermaid','lini'] as const){
   const row=review.renders.find((item:any)=>item.backend===backend);if(!row)throw Error(`${review.id} is missing ${backend} render state.`);
   await page.locator(`[data-backend="${backend}"]`).click();
   if(previousRecipeUrl){
    await page.waitForFunction(url=>(window as any).__revokedBlobUrls.includes(url),previousRecipeUrl,{timeout:5000});
    previousRecipeUrl=undefined;
   }
   if(row.status==='qualified'){
    await page.waitForFunction(()=>(document.querySelector('#download-native-source')?.getAttribute('aria-disabled')==='false'&&(document.querySelector('#diagram-image') as HTMLImageElement|null)?.hidden===false),undefined,{timeout:30000});
    await assertWidePreviewFits(page,review.id,backend);
    await assertRenderingNotes(page,row,review.id,backend);
    if(!(await page.locator('#engine-caption').innerText()).toLowerCase().includes(backend))throw Error(`${review.id}/${backend} selection does not show its target identity.`);
    for(const [selector,path,hash] of [['#download-svg',row.svgPath,row.svgSha256],['#download-png',row.pngPath,row.pngSha256],['#download-native-source',row.nativeSourcePath,row.nativeSourceSha256]] as const){
     if(selector==='#download-native-source')await page.locator('#source-details').evaluate(element=>{(element as HTMLDetailsElement).open=true;});
     const target=`.cache/review-${review.id}-${backend}-${path.split('/').pop()}`;
     const download=await downloadBytes(page,selector,target);
     if(sha(download.bytes)!==hash||download.filename!==path.split('/').pop())throw Error(`${review.id}/${backend} download differs from its asset hash.`);
     if(selector==='#download-native-source'){
      const executionPanel=page.locator('#execution-provenance');
      if(row.execution){
       if(!(await executionPanel.isVisible()))throw Error(`${review.id}/${backend} execution provenance is not shown with its native source.`);
       const metadata=JSON.parse(await page.locator('#execution-metadata').innerText());
       if(JSON.stringify(metadata)!==JSON.stringify(row.execution))throw Error(`${review.id}/${backend} execution metadata differs from the selected receipt row.`);
       const visibleSource=await page.locator('#native-source').textContent();
       const downloadedSource=new TextDecoder().decode(download.bytes);
       if(visibleSource!==downloadedSource)throw Error(`${review.id}/${backend} displayed source differs from its hash-verified execution input download.`);
        const execution=row.execution;
        const command=backend==='graphviz'&&Object.keys(execution).sort().join(',')==='layoutEngine,nodePositions,runtime'&&execution.runtime==='graphviz'&&execution.layoutEngine==='neato'&&execution.nodePositions==='fixed'?['neato','-n2','-Tsvg',row.nativeSourcePath.split('/').pop()]:undefined;
        if(command){
         if(await page.locator('#execution-command').innerText()!==command.map(value=>JSON.stringify(value)).join(' '))throw Error(`${review.id}/${backend} displayed command differs from its execution metadata.`);
         const recipeDownload=await downloadBytes(page,'#download-execution-recipe',`.cache/review-${review.id}-${backend}-execution-recipe.json`);
         previousRecipeUrl=await page.locator('#download-execution-recipe').getAttribute('href')??undefined;
         if(previousRecipeUrl&&await page.evaluate(url=>(window as any).__revokedBlobUrls.includes(url),previousRecipeUrl))throw Error(`${review.id}/${backend} execution recipe URL was revoked before the current selection changed.`);
         const recipe=JSON.parse(new TextDecoder().decode(recipeDownload.bytes));
         const expectedRecipe={schemaVersion:1,execution:row.execution,nativeVersion:row.nativeVersion,sourcePath:row.nativeSourcePath,sourceSha256:row.nativeSourceSha256,command};
         if(recipeDownload.filename!==`${review.id}-${backend}-execution-recipe.json`||JSON.stringify(recipe)!==JSON.stringify(expectedRecipe))throw Error(`${review.id}/${backend} downloaded execution recipe differs from the verified render row.`);
         checks.push(`${review.id}/${backend} execution recipe download, provenance, and source bytes match the verified render row`);
        }else if(await page.locator('#download-execution-recipe').getAttribute('aria-disabled')!=='true'||!(await page.locator('#download-execution-recipe').evaluate(element=>(element as HTMLElement).hidden)))throw Error(`${review.id}/${backend} exposed a recipe for unsupported execution metadata.`);
      }else if(await executionPanel.isVisible())throw Error(`${review.id}/${backend} retained execution provenance from another render.`);
     }
    }
   }else{
    const renderer=backend==='graphviz'?'Graphviz':backend==='mermaid'?'Mermaid':'Lini';
    await page.waitForFunction(name=>document.querySelector('#diagram-status')?.textContent?.includes(`No qualified ${name}`)===true,renderer,{timeout:30000});
    if(await page.locator('#diagram-image').isVisible())throw Error(`${review.id}/${backend} unavailable state left an old render visible.`);
   }
  }
  if(review.renders.find((item:any)=>item.backend==='lini')?.status==='qualified'){
   const disclosure=page.locator('#review-evidence-disclosure');
   if(await disclosure.evaluate(element=>(element as HTMLDetailsElement).open))await disclosure.locator(':scope > summary').click();
   if(await disclosure.evaluate(element=>(element as HTMLDetailsElement).open))throw Error('Desktop review screenshot must keep historical evidence collapsed by default.');
   const desktopScreenshot=review.id===first.id?'.cache/reviews-ui-desktop.png':`.cache/reviews-ui-${review.id}-desktop.png`;
   await page.screenshot({path:desktopScreenshot,fullPage:true});
  }
 }
 checks.push('every review selection exposes exact parsed/copyable YAML, declared source provenance, and hash-verified SVG, PNG and native-source outcomes for all three backends');

 const citationReview=reviews.find((review:any)=>citationAssets(review).some((asset:any)=>/\.ya?ml$/i.test(asset.outputPath)));
 if(!citationReview)throw Error('No review source has a matching additional published YAML asset to verify.');
 const citationAsset=citationAssets(citationReview).find((asset:any)=>/\.ya?ml$/i.test(asset.outputPath))!,away=reviews.find((review:any)=>review.id!==citationReview.id)!;
 await page.locator(`[data-example-id="${away.id}"]`).click();await page.waitForFunction(title=>document.querySelector('#diagram-title')?.textContent===title,away.title,{timeout:30000});
 delayedCitationPath=citationAsset.outputPath;delayedCitationCount=0;
 const createdCitationCount=await page.evaluate(()=>((window as any).__createdBlobUrls as Array<{url:string}>).length);
 await page.locator(`[data-example-id="${citationReview.id}"]`).click();
 await Promise.race([delayedCitationRequested,new Promise((_,reject)=>setTimeout(()=>reject(Error('The delayed cited-source asset request did not start.')),5000))]);
 await page.locator(`[data-example-id="${away.id}"]`).click();await page.waitForFunction(title=>document.querySelector('#diagram-title')?.textContent===title,away.title,{timeout:30000});
 await Promise.race([delayedCitationFulfilled,new Promise((_,reject)=>setTimeout(()=>reject(Error('The delayed cited-source response did not fulfill.')),5000))]);
 await page.waitForFunction(({createdCount,hash})=>((window as any).__createdBlobUrls as Array<{sha256?:string}>).slice(createdCount).some(item=>item.sha256===hash),{createdCount:createdCitationCount,hash:citationAsset.sha256},{timeout:5000});
 await page.waitForTimeout(900);
 const staleCitationState=await page.evaluate(({path,createdCount,hash})=>{
  const links=[...document.querySelectorAll('.source-asset-download')] as HTMLAnchorElement[];
  const created=(window as any).__createdBlobUrls as Array<{url:string;sha256?:string}>;
  const revoked=new Set((window as any).__revokedBlobUrls as string[]);
  const late=created.slice(createdCount).filter(item=>item.sha256===hash);
  return{staleLink:links.some(link=>link.dataset.outputPath===path),matchingLateBlobCount:late.length,matchingLateBlobRevoked:late.length>0&&late.every(item=>revoked.has(item.url))};
 },{path:citationAsset.outputPath,createdCount:createdCitationCount,hash:citationAsset.sha256});
 if(delayedCitationCount!==1||staleCitationState.staleLink||staleCitationState.matchingLateBlobCount===0||!staleCitationState.matchingLateBlobRevoked)throw Error(`Late cited-source asset survived selection cleanup: ${JSON.stringify({...staleCitationState,delayedRequests:delayedCitationCount})}.`);
 delayedCitationPath=undefined;
 checks.push(`late cited-source downloads are revoked and never appear in the newly selected review (${staleCitationState.matchingLateBlobCount} hash-matched late Blob URL${staleCitationState.matchingLateBlobCount===1?'':'s'} created; all revoked)`);

 const probe=reviews.find((review:any)=>review.renders?.some((item:any)=>item.backend==='graphviz'&&item.status==='qualified'));
 if(!probe)throw Error('No review has a qualified Graphviz render for corrupt-asset and modal checks.');
 await page.locator(`[data-example-id="${probe.id}"]`).click();
 const graphviz=probe.renders.find((item:any)=>item.backend==='graphviz');corruptPath=graphviz.svgPath;
 await page.locator('[data-backend="graphviz"]').click();
 await page.waitForFunction(()=>document.querySelector('#diagram-status')?.textContent?.includes('hash does not match')===true,undefined,{timeout:30000});
 if(await page.locator('#diagram-image').isVisible()||await page.locator('#download-svg').getAttribute('aria-disabled')!=='true')throw Error('Corrupt review image was not rejected visibly and safely.');
 corruptPath=undefined;await page.locator('[data-backend="graphviz"]').click();
 await page.waitForFunction(()=>document.querySelector('#download-svg')?.getAttribute('aria-disabled')==='false');
 checks.push('corrupt rendered assets fail hash verification and disable stale downloads');

 await page.setViewportSize({width:375,height:812});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 for(const selector of ['#source-details','#review-evidence-disclosure','#authored-context','#rendering-notes']){const disclosure=page.locator(selector);if(await disclosure.count())await disclosure.evaluate(element=>{(element as HTMLDetailsElement).open=true;});}
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Expanded review source/evidence panels cause horizontal page overflow at 375px.');
 for(const selector of ['#source-details','#review-evidence-disclosure','#authored-context','#rendering-notes']){const disclosure=page.locator(selector);if(await disclosure.count()&&await disclosure.evaluate(element=>(element as HTMLDetailsElement).open))await disclosure.evaluate(element=>{(element as HTMLDetailsElement).open=false;});}
 await page.setViewportSize({width:1440,height:1000});
 const alternateBackend=probe.renders.find((item:any)=>item.status==='qualified'&&item.backend!=='graphviz');
 const nextReview=reviews.find((review:any)=>review.id!==probe.id&&review.renders?.some((item:any)=>item.backend==='graphviz'&&item.status==='qualified'));
 const resetReviewSelections:Array<()=>Promise<void>>=[];
 if(alternateBackend)resetReviewSelections.push(async()=>{await page.locator(`[data-backend="${alternateBackend.backend}"]`).click();await page.waitForFunction(()=>document.querySelector('#download-svg')?.getAttribute('aria-disabled')==='false');});
 if(nextReview)resetReviewSelections.push(async()=>{await page.locator(`[data-example-id="${nextReview.id}"]`).click();await page.locator('[data-backend="graphviz"]').click();await page.waitForFunction(()=>document.querySelector('#download-svg')?.getAttribute('aria-disabled')==='false');});
 if(!resetReviewSelections.length)throw Error('No scene/backend selection is available to verify viewer reset.');
 await exerciseViewerZoom(page,graphviz.svgSha256,resetReviewSelections);
 checks.push('review viewer supports Fit/100%, bounded 25% zoom, keyboard controls, a focusable scroll viewport, reset after scene/backend changes, and preserves SVG hash');
 await page.setViewportSize({width:375,height:812});await page.reload({waitUntil:'networkidle'});
 await page.waitForFunction(()=>document.querySelector('#download-svg')?.getAttribute('aria-disabled')==='false');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Review page overflows horizontally on mobile.');
 await page.screenshot({path:'.cache/reviews-ui-mobile.png',fullPage:true});
 checks.push('review modal closes by keyboard and the page fits a 375px mobile viewport');
 if(errors.length)throw Error(`Browser errors: ${errors.join('; ')}`);
 const result={ok:true,examples:reviews.length,checks,browser:browser.version(),errors};
 await Bun.write('.cache/reviews-ui-browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
