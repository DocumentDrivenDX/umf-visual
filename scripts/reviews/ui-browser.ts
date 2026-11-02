// SPDX-License-Identifier: MIT OR Apache-2.0
import {chromium,type Page} from 'playwright';
import {createHash} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {extname,join,resolve,sep} from 'node:path';
import {readJsonValue} from '@umf/core';

const siteRoot=resolve('dist-site'),receipt=await Bun.file(join(siteRoot,'reviews.json')).json();
if(receipt.schemaVersion!==1||!Array.isArray(receipt.examples)||receipt.examples.length===0)throw Error('Build source-derived review presentations first.');
const reviews=receipt.examples,sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
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
async function openHistoricalDisclosure(page:Page):Promise<void>{
 const details=page.locator('#review-evidence-disclosure'),summary=details.locator(':scope > summary');
 if(!(await details.evaluate(element=>(element as HTMLDetailsElement).open)))await summary.click();
 if(!(await details.evaluate(element=>(element as HTMLDetailsElement).open)))throw Error('Original host evidence did not open from its summary.');
 await summary.focus();await page.keyboard.press('Enter');
 if(await details.evaluate(element=>(element as HTMLDetailsElement).open))throw Error('Original host evidence disclosure did not close with Enter.');
 await summary.focus();await page.keyboard.press('Enter');
 if(!(await details.evaluate(element=>(element as HTMLDetailsElement).open)))throw Error('Original host evidence disclosure did not reopen with Enter.');
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
const mime:Record<string,string>={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json;charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.dot':'text/vnd.graphviz;charset=utf-8','.mmd':'text/plain;charset=utf-8','.lini':'text/plain;charset=utf-8'};
let corruptPath:string|undefined;
let delayedCapturePath:string|undefined,delayedCaptureCount=0,signalDelayedRequest!:()=>void;
let includeRaceProbe=true;
const delayedCaptureRequested=new Promise<void>(resolve=>{signalDelayedRequest=resolve;});
const browser=await chromium.launch({headless:true}),errors:string[]=[],checks:string[]=[];
await mkdir('.cache',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{const original=URL.revokeObjectURL.bind(URL);(window as any).__revokedBlobUrls=[];URL.revokeObjectURL=(url:string)=>{(window as any).__revokedBlobUrls.push(url);original(url);};});
 await page.route('https://umf-review.local/**',async route=>{
  const url=new URL(route.request().url()),pathname=decodeURIComponent(url.pathname);
  if(pathname==='/reviews.json'){await route.fulfill({status:200,body:JSON.stringify({...receipt,examples:includeRaceProbe?uiReviews:reviews}),contentType:'application/json'});return;}
  if(delayedCapturePath&&pathname===`/${delayedCapturePath}`&&delayedCaptureCount++===0){signalDelayedRequest();await new Promise(resolve=>setTimeout(resolve,700));}
  if(corruptPath&&pathname===`/${corruptPath}`){await route.fulfill({status:200,body:'corrupt-content',contentType:'image/svg+xml'});return;}
  const filePath=resolve(siteRoot,`.${pathname==='/'?'/reviews.html':pathname}`);
  if(filePath===siteRoot||!filePath.startsWith(siteRoot+sep)){await route.fulfill({status:404,body:'Not found'});return;}
  const file=Bun.file(filePath);if(!(await file.exists())){await route.fulfill({status:404,body:'Not found'});return;}
  await route.fulfill({status:200,body:Buffer.from(await file.arrayBuffer()),contentType:mime[extname(filePath)]||'application/octet-stream',headers:{'cache-control':'no-store'}});
 });
 const first=reviews[0];
 await page.goto(`https://umf-review.local/reviews.html?review=${encodeURIComponent(first.id)}`,{waitUntil:'networkidle'});
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
  delayedCapturePath=undefined;
  checks.push('rapid review changes keep the latest original capture and its download when an earlier capture resolves last');
 }
 includeRaceProbe=false;
 await page.locator('[data-example-id="race-probe"]').evaluate(element=>element.remove());

 for(const review of reviews){
  if(review.id!==first.id)await page.locator(`[data-example-id="${review.id}"]`).click();
  await page.waitForFunction(title=>document.querySelector('#diagram-title')?.textContent===title,review.title,{timeout:30000});
  if(await page.locator('#diagram-title').innerText()!==review.title)throw Error(`${review.id} selection did not show its title.`);
  if(new URL(page.url()).searchParams.get('review')!==review.id)throw Error(`${review.id} selection did not update its deep link.`);
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
  if(evidence){
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
  }else if(await page.locator('#review-evidence').isVisible())throw Error(`${review.id} shows original-host evidence that is not declared.`);

  for(const backend of ['graphviz','mermaid','lini'] as const){
   const row=review.renders.find((item:any)=>item.backend===backend);if(!row)throw Error(`${review.id} is missing ${backend} render state.`);
   await page.locator(`[data-backend="${backend}"]`).click();
   if(row.status==='qualified'){
    await page.waitForFunction(()=>(document.querySelector('#download-native-source')?.getAttribute('aria-disabled')==='false'&&(document.querySelector('#diagram-image') as HTMLImageElement|null)?.hidden===false),undefined,{timeout:30000});
    await assertWidePreviewFits(page,review.id,backend);
    if(!(await page.locator('#engine-caption').innerText()).toLowerCase().includes(backend))throw Error(`${review.id}/${backend} selection does not show its target identity.`);
    for(const [selector,path,hash] of [['#download-svg',row.svgPath,row.svgSha256],['#download-png',row.pngPath,row.pngSha256],['#download-native-source',row.nativeSourcePath,row.nativeSourceSha256]] as const){
     if(selector==='#download-native-source')await page.locator('#source-details').evaluate(element=>{(element as HTMLDetailsElement).open=true;});
     const target=`.cache/review-${review.id}-${backend}-${path.split('/').pop()}`;
     const download=await downloadBytes(page,selector,target);
     if(sha(download.bytes)!==hash||download.filename!==path.split('/').pop())throw Error(`${review.id}/${backend} download differs from its asset hash.`);
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
 checks.push('every review selection exposes exact parsed/copyable YAML, original-host provenance where declared, and hash-verified SVG, PNG and native-source outcomes for all three backends');

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

 await page.locator('#enlarge-diagram').click();if(!(await page.locator('#diagram-viewer').isVisible()))throw Error('Review image modal did not open.');
 await page.keyboard.press('Escape');if(await page.locator('#diagram-viewer').isVisible()||await page.evaluate(()=>document.activeElement?.id)!=='enlarge-diagram')throw Error('Review modal keyboard close did not restore focus.');
 await page.setViewportSize({width:375,height:812});await page.reload({waitUntil:'networkidle'});
 await page.waitForFunction(()=>document.querySelector('#download-svg')?.getAttribute('aria-disabled')==='false');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Review page overflows horizontally on mobile.');
 await page.screenshot({path:'.cache/reviews-ui-mobile.png',fullPage:true});
 checks.push('review modal closes by keyboard and the page fits a 375px mobile viewport');
 if(errors.length)throw Error(`Browser errors: ${errors.join('; ')}`);
 const result={ok:true,examples:reviews.length,checks,browser:browser.version(),errors};
 await Bun.write('.cache/reviews-ui-browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
