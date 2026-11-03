import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {extname,join,resolve,sep} from 'node:path';
import {readJsonValue} from '@umf/core';
import {authoredComparisonView,authoredFocusTargets,authoredMetricView,authoredStepListPolicy} from '../microsite/authored-context.js';

const siteRoot=resolve('dist-site');
const showcase=await Bun.file(join(siteRoot,'showcase.json')).json() as {schemaVersion:number;examples:Array<any>};
if(showcase.schemaVersion!==1||showcase.examples.length===0)throw new Error('Build the curated authored showcase examples before running the homepage browser gate.');
const mime:Record<string,string>={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json;charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.dot':'text/vnd.graphviz;charset=utf-8','.mmd':'text/plain;charset=utf-8','.lini':'text/plain;charset=utf-8'};
const browser=await chromium.launch({headless:true});
const errors:string[]=[];const checks:string[]=[];
async function assertAuthoredContext(page:import('playwright').Page,example:any):Promise<void>{
  const details=page.locator('#authored-context'),summary=details.locator(':scope > summary'),visual=example.definition?.extensions?.['umf.visual'];
  if(!visual||typeof visual!=='object'){if(await details.isVisible())throw new Error(`${example.id} shows authored context without a Visual payload.`);return;}
  if(await details.evaluate(element=>(element as HTMLDetailsElement).open))throw new Error(`${example.id} inherited an open authored-context panel from a previous selection.`);
  await summary.focus();await page.keyboard.press('Enter');
  if(!(await details.evaluate(element=>(element as HTMLDetailsElement).open)))throw new Error(`${example.id} authored context does not open from the keyboard.`);
  const content=page.locator('#authored-context-content'),text=await content.innerText();
  for(const key of ['title','question','takeaway','audience'])if(typeof visual[key]==='string'&&(!text.includes(visual[key])||!(await content.locator('code').allTextContents()).includes(`/extensions/umf.visual/${key}`)))throw new Error(`${example.id} authored ${key} is missing or lacks its full source pointer.`);
  if(visual.source&&typeof visual.source==='object')for(const key of ['path','view','digest'])if(typeof visual.source[key]==='string'&&(!text.includes(visual.source[key])||!(await content.locator('code').allTextContents()).includes(`/extensions/umf.visual/source/${key}`)))throw new Error(`${example.id} authored source ${key} is missing or lacks its full source pointer.`);
  const comparison=authoredComparisonView(visual),pointers=await content.locator('code').allTextContents();
  if(comparison){
    if(!text.includes('Authored comparison'))throw new Error(`${example.id} comparison context is not labeled as authored source content.`);
    for(const axis of comparison.axes)if(!pointers.includes(axis.sourcePath)||!text.includes(String(axis.value)))throw new Error(`${example.id} comparison axis ${axis.key} is missing or unlocated.`);
    for(const collection of [comparison.items,comparison.criteria])for(const row of collection){
      if(!pointers.includes(row.sourcePath)||!text.includes(String(row.id))||!text.includes(String(row.label)))throw new Error(`${example.id} comparison row ${row.id} is missing or unlocated.`);
      for(const field of row.fields)if(!pointers.includes(field.sourcePath)||!text.includes(typeof field.value==='string'?field.value:JSON.stringify(field.value)??String(field.value)))throw new Error(`${example.id} comparison field ${field.key} is missing or unlocated.`);
    }
    for(const value of comparison.values){
      if(!pointers.includes(value.sourcePath)||!text.includes(String(value.item))||!text.includes(String(value.criterion)))throw new Error(`${example.id} comparison value references are missing or unlocated.`);
      for(const field of value.fields)if(!pointers.includes(field.sourcePath)||!text.includes(typeof field.value==='string'?field.value:JSON.stringify(field.value)??String(field.value)))throw new Error(`${example.id} comparison value ${field.key} is missing or unlocated.`);
    }
    if(comparison.chosen&&(!text.includes('Authored choice')||!text.includes(String(comparison.chosen.item))||!text.includes(String(comparison.chosen.reason))||!pointers.includes(comparison.chosen.itemSourcePath)||!pointers.includes(comparison.chosen.reasonSourcePath)))throw new Error(`${example.id} authored choice is missing or unlocated.`);
  }
  const metric=authoredMetricView(visual);
  if(metric){
    if(!text.includes('Authored metric fields')||!text.includes('does not calculate progress, percentages, or recommendations'))throw new Error(`${example.id} metric context is not labeled as authored or avoids derived progress.`);
    for(const field of metric.fields)if(!pointers.includes(field.sourcePath)||!text.includes(typeof field.value==='string'?field.value:JSON.stringify(field.value)??String(field.value)))throw new Error(`${example.id} metric field ${field.key} is missing or unlocated.`);
    for(const series of metric.series){
      if(!pointers.includes(series.sourcePath)||!text.includes(String(series.id))||!text.includes(String(series.label)))throw new Error(`${example.id} metric series ${series.id} is missing or unlocated.`);
      if(!pointers.includes(series.idSourcePath)||!pointers.includes(series.labelSourcePath))throw new Error(`${example.id} metric series identity fields lack exact pointers.`);
      for(const field of series.fields)if(!pointers.includes(field.sourcePath)||!text.includes(typeof field.value==='string'?field.value:JSON.stringify(field.value)??String(field.value)))throw new Error(`${example.id} metric series field ${field.key} is missing or unlocated.`);
      for(const point of series.points){
        if(!pointers.includes(point.sourcePath))throw new Error(`${example.id} metric point index is missing or unlocated.`);
        for(const field of point.fields)if(!pointers.includes(field.sourcePath)||!text.includes(typeof field.value==='string'?field.value:JSON.stringify(field.value)??String(field.value)))throw new Error(`${example.id} metric point field ${field.key} is missing or unlocated.`);
      }
    }
  }
  const omissions=Array.isArray(visual.omissions)?visual.omissions:[];
  for(let index=0;index<omissions.length;index++)if(!text.includes(String(omissions[index]))||!pointers.includes(`/extensions/umf.visual/omissions/${index}`))throw new Error(`${example.id} authored caveat ${index} is missing or unlocated.`);
  const steps=Array.isArray(visual.steps)?visual.steps:[],items=content.locator('.authored-step-list > li'),policy=authoredStepListPolicy(steps),targets=authoredFocusTargets(visual);
  if(await items.count()!==steps.length)throw new Error(`${example.id} authored step list differs from its Visual payload.`);
  for(let i=0;i<steps.length;i++){
    const step=steps[i],item=items.nth(i),unordered=await item.evaluate(element=>(element as HTMLElement).classList.contains('authored-step-unordered'));
    if(await item.getAttribute('data-step-id')!==step.id||unordered===policy[i]?.numbered)throw new Error(`${example.id} authored step identity, order, or numbering changed.`);
    for(const field of ['title','caption','when','tag'] as const)if(typeof step[field]==='string'&&!(await item.innerText()).includes(step[field]))throw new Error(`${example.id} step ${step.id} omits authored ${field}.`);
    const focus=Array.isArray(step.focus)?step.focus:[],focusItems=item.locator('.authored-focus-list > li');
    if(!focus.length){if(await focusItems.count()!==1||!(await focusItems.first().innerText()).includes('No focus IDs authored.'))throw new Error(`${example.id} step ${step.id} empty focus state is not explicit.`);continue;}
    if(await focusItems.count()!==focus.length)throw new Error(`${example.id} step ${step.id} focus IDs changed.`);
    for(let j=0;j<focus.length;j++){
      const id=focus[j],focusItem=focusItems.nth(j),matches=targets.get(id)||[];
      if(await focusItem.getAttribute('data-focus-id')!==id||!(await focusItem.innerText()).includes(`/extensions/umf.visual/steps/${i}/focus/${j}`))throw new Error(`${example.id} step ${step.id} focus path/identity changed.`);
      if(!matches.length){if(!(await focusItem.innerText()).includes('Unresolved focus ID'))throw new Error(`${example.id} unresolved focus ${id} was guessed or hidden.`);}
      else for(const target of matches){const rows=await focusItem.locator('.authored-focus-targets > li').allInnerTexts();if(!rows.some(row=>row.includes(target.kind)&&row.includes(target.label)&&row.includes(target.sourcePath)))throw new Error(`${example.id} focus ${id} target ${target.kind} was not shown.`);}
    }
  }
  await summary.focus();await page.keyboard.press('Enter');
  if(await details.evaluate(element=>(element as HTMLDetailsElement).open))throw new Error(`${example.id} authored context does not close from the keyboard.`);
}
async function exerciseViewerZoom(page:import('playwright').Page,expectedSvgSha256:string,selectionChanges:Array<()=>Promise<void>>):Promise<void>{
  const viewer=page.locator('#diagram-viewer'),frame=page.locator('#viewer-image-frame'),image=page.locator('#viewer-image'),level=page.locator('#viewer-zoom-level');
  await page.locator('#enlarge-diagram').click();
  if(!(await viewer.isVisible()))throw new Error('The diagram viewer did not open.');
  await image.evaluate(async element=>{await (element as HTMLImageElement).decode();});
  const fitLabel=(await level.innerText()).trim(),fitPercent=Number(/Fit · (\d+)%/u.exec(fitLabel)?.[1]);
  if(!fitLabel.startsWith('Fit')||!Number.isFinite(fitPercent))throw new Error('Opening the diagram viewer did not expose its effective Fit percentage.');
  const fit=await frame.evaluate(element=>{const f=element as HTMLElement,i=document.querySelector('#viewer-image') as HTMLImageElement,r=i.getBoundingClientRect();return{width:r.width,height:r.height,frameWidth:f.clientWidth,frameHeight:f.clientHeight};});
  if(fit.width>fit.frameWidth+1||fit.height>fit.frameHeight+1)throw new Error('Fit mode exceeds the available diagram viewport.');
  await page.locator('#viewer-zoom-in').focus();await page.keyboard.press('Enter');
  if((await level.innerText()).trim()!==`${Math.min(400,fitPercent+25)}%`)throw new Error(`Zoom in did not advance Fit's ${fitPercent}% effective scale by 25 points.`);
  await page.locator('#viewer-actual-size').click();
  if((await level.innerText()).trim()!=='100%')throw new Error('Actual size did not select 100%.');
  const actual=await frame.evaluate(element=>{const f=element as HTMLElement,i=document.querySelector('#viewer-image') as HTMLImageElement,r=i.getBoundingClientRect();return{width:r.width,height:r.height,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,scrollWidth:f.scrollWidth,scrollHeight:f.scrollHeight,clientWidth:f.clientWidth,clientHeight:f.clientHeight,tabIndex:f.tabIndex};});
  if(Math.abs(actual.width-actual.naturalWidth)>2||Math.abs(actual.height-actual.naturalHeight)>2)throw new Error('100% mode does not display the SVG at its intrinsic pixel dimensions.');
  if(actual.tabIndex<0)throw new Error('The diagram viewport is not keyboard focusable.');
  await page.locator('#viewer-zoom-in').click();
  if((await level.innerText()).trim()!=='125%')throw new Error('Zoom in did not advance by one 25% step.');
  for(let index=0;index<20&&await page.locator('#viewer-zoom-in').isEnabled();index++)await page.locator('#viewer-zoom-in').click();
  if((await level.innerText()).trim()!=='400%')throw new Error('Zoom in did not clamp at 400%.');
  for(let index=0;index<20&&await page.locator('#viewer-zoom-out').isEnabled();index++)await page.locator('#viewer-zoom-out').click();
  if((await level.innerText()).trim()!=='25%')throw new Error('Zoom out did not clamp at 25%.');
  await page.locator('#viewer-fit').click();
  if(!(await level.innerText()).trim().startsWith('Fit'))throw new Error('Fit control did not restore Fit mode.');
  await page.setViewportSize({width:375,height:812});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const pageOverflow=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].map(element=>({element,rect:element.getBoundingClientRect()})).filter(item=>item.rect.right>innerWidth+1).slice(0,8).map(item=>({id:(item.element as HTMLElement).id,className:(item.element as HTMLElement).className,right:item.rect.right,width:item.rect.width}))}));
  if(pageOverflow.scrollWidth>pageOverflow.width)throw new Error(`The open diagram viewer causes page-level horizontal overflow on mobile: ${JSON.stringify(pageOverflow)}.`);
  const mobileFit=await frame.evaluate(element=>{const f=element as HTMLElement,i=document.querySelector('#viewer-image') as HTMLImageElement,r=i.getBoundingClientRect();return{width:r.width,height:r.height,frameWidth:f.clientWidth,frameHeight:f.clientHeight};});
  if(mobileFit.width>mobileFit.frameWidth+1||mobileFit.height>mobileFit.frameHeight+1)throw new Error('Mobile Fit mode exceeds the available diagram viewport.');
  if(!(await page.locator('#viewer-actual-size').isEnabled()))throw new Error('Mobile Fit mode unexpectedly disables Actual size.');
  await page.locator('#viewer-actual-size').click();
  if((await level.innerText()).trim()!=='100%')throw new Error('Mobile actual-size control did not select 100%.');
  const mobileNative=await frame.evaluate(element=>{const f=element as HTMLElement,i=document.querySelector('#viewer-image') as HTMLImageElement,r=i.getBoundingClientRect();return{width:r.width,height:r.height,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,scrollWidth:f.scrollWidth,scrollHeight:f.scrollHeight,clientWidth:f.clientWidth,clientHeight:f.clientHeight};});
  if(Math.abs(mobileNative.width-mobileNative.naturalWidth)>2||Math.abs(mobileNative.height-mobileNative.naturalHeight)>2||(mobileNative.scrollWidth<=mobileNative.clientWidth&&mobileNative.scrollHeight<=mobileNative.clientHeight))throw new Error('Mobile 100% mode does not preserve a scrollable intrinsic-size diagram.');
  await frame.evaluate(element=>{const f=element as HTMLElement;f.scrollTo(f.scrollWidth>f.clientWidth?120:0,f.scrollHeight>f.clientHeight?120:0);});
  if(await frame.evaluate(element=>{const f=element as HTMLElement;return f.scrollLeft+f.scrollTop;})<=0)throw new Error('Native overflow scrolling did not pan the mobile diagram viewport.');
  await frame.focus();if(await page.evaluate(()=>document.activeElement?.id)!=='viewer-image-frame')throw new Error('The diagram viewport did not accept keyboard focus.');
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const fixedAfterResize=await frame.evaluate(element=>{const f=element as HTMLElement,i=document.querySelector('#viewer-image') as HTMLImageElement,r=i.getBoundingClientRect();return{width:r.width,height:r.height,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight};});
  if((await level.innerText()).trim()!=='100%'||Math.abs(fixedAfterResize.width-fixedAfterResize.naturalWidth)>2||Math.abs(fixedAfterResize.height-fixedAfterResize.naturalHeight)>2)throw new Error('Manual 100% zoom changed size when the viewport resized.');
  await page.locator('#viewer-fit').click();
  const refit=await frame.evaluate(element=>{const f=element as HTMLElement,i=document.querySelector('#viewer-image') as HTMLImageElement,r=i.getBoundingClientRect();return{width:r.width,height:r.height,frameWidth:f.clientWidth,frameHeight:f.clientHeight};});
  if(!(await level.innerText()).trim().startsWith('Fit')||refit.width>refit.frameWidth+1||refit.height>refit.frameHeight+1)throw new Error('Fit mode did not recompute after a viewport resize.');
  const before=await page.evaluate(async()=>{const link=document.querySelector('#viewer-svg-download') as HTMLAnchorElement;const response=await fetch(link.href);const bytes=await response.arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');});
  if(before!==expectedSvgSha256)throw new Error('Zooming changed the hash-verified SVG download.');
  await page.keyboard.press('Escape');
  if(await viewer.isVisible()||await page.evaluate(()=>document.activeElement?.id)!=='enlarge-diagram')throw new Error('Escape did not close the viewer and restore focus.');
  for(const changeSelection of selectionChanges){
    await changeSelection();await page.locator('#enlarge-diagram').click();
    if(!(await level.innerText()).trim().startsWith('Fit'))throw new Error('Changing the selected scene or backend did not reset the viewer to Fit.');
    await page.keyboard.press('Escape');
  }
}
await mkdir('.cache',{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1050},acceptDownloads:true});
  page.on('pageerror',error=>errors.push(String(error)));
  let contextModuleLoaded=false;page.on('response',response=>{if(new URL(response.url()).pathname.endsWith('/authored-context.js'))contextModuleLoaded=response.ok();});
  await page.route('https://umf.local/**',async route=>{
    let pathname:string;
    try{pathname=decodeURIComponent(new URL(route.request().url()).pathname);}catch{await route.fulfill({status:400,body:'Invalid path'});return;}
    const filePath=resolve(siteRoot,`.${pathname==='/'?'/index.html':pathname}`);
    if(filePath===siteRoot||!filePath.startsWith(siteRoot+sep)){await route.fulfill({status:404,body:'Not found'});return;}
    const file=Bun.file(filePath);if(!(await file.exists())){await route.fulfill({status:404,body:'Not found'});return;}
    await route.fulfill({status:200,body:Buffer.from(await file.arrayBuffer()),contentType:mime[extname(filePath)]||'application/octet-stream',headers:{'cache-control':'no-store'}});
  });
  await page.goto('https://umf.local/',{waitUntil:'networkidle'});
  if(!contextModuleLoaded)throw new Error('The homepage did not load its packaged authored-context ES module.');
  await page.locator('#scenario-list .scenario-button').first().waitFor();
  if(await page.locator('#scenario-list .scenario-button').count()!==showcase.examples.length)throw new Error('The homepage scenario list differs from the curated source manifest.');
  await page.waitForFunction(()=>document.querySelector('#download-svg')?.getAttribute('aria-disabled')==='false'&&(document.querySelector('#diagram-image') as HTMLImageElement|null)?.hidden===false);
  if(await page.locator('#diagram-image').isVisible()!==true)throw new Error('The main visual explorer does not show a real qualified native diagram.');
  await page.locator('#diagram-image').evaluate(async element=>{const image=element as HTMLImageElement;await image.decode();if(image.naturalWidth<100||image.naturalHeight<80)throw new Error('The hero render has implausible intrinsic dimensions.');});
  if(await page.locator('#engine-caption').innerText()==='NATIVE ENGINE · SELECT A VARIANT')throw new Error('The initial render has no actual engine/version caption.');
  if(await page.locator('#quality-caption').innerText()!=='Native SVG')throw new Error('The qualified preview does not identify the native SVG presentation.');
  const initialLini=showcase.examples[0].renders.find((render:any)=>render.backend==='lini'&&render.status==='qualified');
  const preferredBackend=initialLini?'lini':showcase.examples[0].renders.find((render:any)=>render.backend==='graphviz'&&render.status==='qualified')?'graphviz':'mermaid';
  if(await page.locator(`#backend-options [data-backend="${preferredBackend}"]`).getAttribute('aria-pressed')!=='true')throw new Error(`The initial selection did not prefer the available ${preferredBackend} renderer.`);
  const initialVersion=showcase.examples[0].definition?.vocabularies?.['umf.visual']?.version;
  if(await page.locator('#scenario-provenance').innerText()!==`umf.visual ${initialVersion} · sourced definition`)throw new Error('The scenario rail does not show the source definition vocabulary version.');
  const initialYaml=await page.locator('#visual-payload').innerText();
  const initialPayload=readJsonValue(initialYaml,'yaml');
  if(initialYaml!==showcase.examples[0].visualPayloadYaml||JSON.stringify(initialPayload)!==JSON.stringify(showcase.examples[0].definition.extensions?.['umf.visual']))throw new Error('The visible YAML umf.visual payload does not parse to the exact extension value from the selected envelope.');
  if(await page.locator('#visual-version').innerText()!==String(initialVersion))throw new Error('The visible payload version does not match the selected UMF envelope.');
  await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:'https://umf.local'});
  await page.locator('#copy-payload').click();
  if(await page.evaluate(()=>navigator.clipboard.readText())!==initialYaml)throw new Error('Copy payload did not copy the exact visible YAML.');
  checks.push('the visible versioned umf.visual YAML parses to the exact extension value and copies exactly');
  if(await page.locator('#showcase-error').isVisible())throw new Error('The showcase load error is visible despite a successful page load.');
  const adjacency=await page.locator('#diagram-frame').evaluate(frame=>({previous:frame.previousElementSibling?.className,scenarioBefore:!!(document.querySelector('#scenario-list')!.compareDocumentPosition(frame)&Node.DOCUMENT_POSITION_FOLLOWING)}));
  if(!String(adjacency.previous).includes('diagram-toolbar')||!adjacency.scenarioBefore)throw new Error('Scenario and renderer controls are separated from the primary diagram preview.');
  checks.push('homepage loads curated examples with scenario and renderer controls adjacent to the primary preview');

  const qualifiedByExample=new Map<string,string[]>();
  for(const example of showcase.examples){
    const qualified=(example.renders||[]).filter((render:any)=>render?.status==='qualified');
    if(!qualified.length)throw new Error(`No qualified native render is available for curated example ${example.id}.`);
    qualifiedByExample.set(example.id,qualified.map((render:any)=>render.backend));
    for(const render of qualified){
      for(const [key,extension,hash] of [['svgPath','.svg','svgSha256'],['pngPath','.png','pngSha256'],['nativeSourcePath',render.backend==='mermaid'?'.mmd':render.backend==='lini'?'.lini':'.dot','nativeSourceSha256']] as const){
        const assetPath=render[key];if(typeof assetPath!=='string'||!assetPath.startsWith('showcase/')||assetPath.includes('..')||!assetPath.endsWith(extension))throw new Error(`${example.id}/${render.backend} has an unsafe or unexpected ${key}.`);
        const bytes=await Bun.file(join(siteRoot,assetPath)).arrayBuffer();
        if(createHash('sha256').update(Buffer.from(bytes)).digest('hex')!==render[hash])throw new Error(`${example.id}/${render.backend} ${key} bytes do not match the showcase receipt.`);
      }
    }
  }
  const allPreviews=showcase.examples.flatMap(example=>example.renders.filter((render:any)=>render.status==='qualified').flatMap((render:any)=>[render.svgPath,render.pngPath]));
  const decoded=await page.evaluate(async paths=>Promise.all(paths.map(path=>new Promise<{path:string;width:number;height:number}>(resolve=>{
    const image=new Image();image.onload=()=>resolve({path,width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>resolve({path,width:0,height:0});image.src='./'+path;
  }))),allPreviews);
  const failedDecode=decoded.filter(image=>image.width<=0||image.height<=0);
  if(failedDecode.length)throw new Error(`Native showcase previews did not decode in Chromium: ${JSON.stringify(failedDecode)}`);
  checks.push(`all ${decoded.length} qualified native SVG/PNG previews decode in Chromium`);
  checks.push('all qualified SVG, PNG, and native-source downloads match their content hashes');

  const selected=page.locator('#scenario-list .scenario-button');
  for(let index=0;index<showcase.examples.length;index++){
    await selected.nth(index).click();
    const example=showcase.examples[index];
    const visibleYaml=await page.locator('#visual-payload').innerText();
    const visiblePayload=readJsonValue(visibleYaml,'yaml');
    if(visibleYaml!==example.visualPayloadYaml||JSON.stringify(visiblePayload)!==JSON.stringify(example.definition.extensions?.['umf.visual']))throw new Error(`Scenario ${example.id} YAML does not parse to its exact umf.visual payload.`);
    await page.locator('#copy-payload').click();
    if(await page.evaluate(()=>navigator.clipboard.readText())!==visibleYaml)throw new Error(`Scenario ${example.id} does not copy its exact YAML payload.`);
    await assertAuthoredContext(page,example);
    if(index===0){
      const context=page.locator('#authored-context'),summary=context.locator(':scope > summary');
      await summary.focus();await page.keyboard.press('Enter');
      const currentBackend=await page.locator('#backend-options [aria-pressed="true"]').getAttribute('data-backend');
      const resetBackend=example.renders.find((render:any)=>render.status==='qualified'&&render.backend!==currentBackend)?.backend;
      if(!resetBackend)throw new Error('The first showcase example has no alternate qualified backend for context-reset coverage.');
      await page.locator(`[data-backend="${resetBackend}"]`).click();
      if(await page.locator(`[data-backend="${resetBackend}"]`).getAttribute('aria-pressed')!=='true')throw new Error('The context reset probe did not switch to an alternate backend.');
      if(await context.evaluate(element=>(element as HTMLDetailsElement).open))throw new Error('Changing backend did not collapse the authored-context panel.');
    }
    if(await page.locator('#visual-version').innerText()!==String(example.definition.vocabularies?.['umf.visual']?.version))throw new Error(`Scenario ${example.id} shows the wrong umf.visual version.`);
    for(const backend of ['lini','graphviz','mermaid']){
      const button=page.locator(`[data-backend="${backend}"]`);
      await button.click();
      const apiExample=await page.locator('#programmatic-code').innerText();
      const modelVersion=example.definition.vocabularies?.['umf.visual']?.version;
      if(!apiExample.includes('editAndCompile(payload: Visual)')||!apiExample.includes('Start with the umf.visual value shown above as a Visual object.')||!apiExample.includes('createVisualDocument(payload, undefined, modelVersion)')||!apiExample.includes(`const modelVersion: VisualVersion = '${modelVersion}';`)||!apiExample.includes("getVisual, editVisual")||!apiExample.includes('compilePresentation')||!apiExample.includes(`backend: '${backend}'`))throw new Error(`The public API example does not carry the selected ${modelVersion} payload through to the selected ${backend} renderer.`);
      const expectedRender=example.renders.find((render:any)=>render.backend===backend&&render.status==='qualified');
      const versionNote=await page.locator('#compile-target-note').innerText();
      if(expectedRender&&!versionNote.toLowerCase().includes(`${expectedRender.engine} ${expectedRender.nativeVersion}`.toLowerCase()))throw new Error(`${example.id}/${backend} API example omits its native renderer version.`);
      if(!expectedRender){
        await page.waitForFunction(()=>document.querySelector('#diagram-status')?.classList.contains('error')&&(document.querySelector('#diagram-image') as HTMLImageElement|null)?.hidden===true);
        if(await page.locator('#download-svg').getAttribute('aria-disabled')!=='true'||await page.locator('#download-png').getAttribute('aria-disabled')!=='true'||await page.locator('#download-native-source').getAttribute('aria-disabled')!=='true')throw new Error(`Unavailable ${backend} selection for ${example.id} retained a stale download.`);
        continue;
      }
      await page.waitForFunction(({title,filename,backend})=>document.querySelector('#diagram-title')?.textContent===title&&document.querySelector('#download-svg')?.getAttribute('download')===filename&&document.querySelector('#download-svg')?.getAttribute('aria-disabled')==='false'&&(document.querySelector('#diagram-image') as HTMLImageElement|null)?.hidden===false&&document.querySelector(`#backend-options [data-backend="${backend}"]`)?.getAttribute('aria-pressed')==='true',{title:example.title,filename:expectedRender.svgPath.split('/').pop(),backend});
      await page.locator('#diagram-image').evaluate(async element=>{const image=element as HTMLImageElement;await image.decode();if(image.naturalWidth<=0||image.naturalHeight<=0)throw new Error('Scenario image did not decode.');});
      if(!(await page.locator('#engine-caption').innerText()).toLowerCase().includes(backend))throw new Error(`${example.id}/${backend} preview did not identify its actual renderer and version.`);
      const hasNotes=(expectedRender.omissions?.length||0)+(expectedRender.approximations?.length||0)>0;
      if(await page.locator('#rendering-notes').evaluate(element=>(element as HTMLElement).hidden)===hasNotes)throw new Error(`Scenario ${example.id}/${backend} hides or fabricates rendering notes relative to its receipt.`);
      if(await page.locator('#download-png').getAttribute('aria-disabled')!=='false'||await page.locator('#download-native-source').getAttribute('aria-disabled')!=='false')throw new Error(`Scenario ${example.id}/${backend} did not expose the actual qualified render downloads.`);
      if(!(await page.locator('#source-details').evaluate(element=>(element as HTMLDetailsElement).open)))await page.locator('#source-details > summary').click();
      if(!(await page.locator('#native-source').innerText()).trim())throw new Error(`${example.id}/${backend} has no exact native source in the inspector.`);
      const [svgDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#download-svg').click()]);
      const svgDownloadPath=`.cache/showcase-${example.id}-${backend}-SVG`;await svgDownload.saveAs(svgDownloadPath);
      if(svgDownload.suggestedFilename()!==expectedRender.svgPath.split('/').pop()||createHash('sha256').update(Buffer.from(await Bun.file(svgDownloadPath).arrayBuffer())).digest('hex')!==expectedRender.svgSha256)throw new Error(`${example.id}/${backend} SVG download differs from its verified receipt.`);
      for(const [selector,path,hash,label] of [['#download-png',expectedRender.pngPath,expectedRender.pngSha256,'PNG'],['#download-native-source',expectedRender.nativeSourcePath,expectedRender.nativeSourceSha256,'native source']] as const){
        const link=page.locator(selector);
        if(await link.getAttribute('download')!==path.split('/').pop()||await link.getAttribute('aria-disabled')!=='false')throw new Error(`${example.id}/${backend} ${label} link is missing its source-bound download filename.`);
        const href=await link.getAttribute('href');
        if(!href)throw new Error(`${example.id}/${backend} ${label} download has no target URL.`);
        const actualHash=await page.evaluate(async url=>{const response=await fetch(url);const bytes=await response.arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');},href);
        if(actualHash!==hash)throw new Error(`${example.id}/${backend} ${label} download link bytes differ from its verified receipt.`);
      }
    }
    if(index===0&&showcase.examples.length>1){
      const context=page.locator('#authored-context'),summary=context.locator(':scope > summary');
      await summary.focus();await page.keyboard.press('Enter');
      await selected.nth(1).click();
      const next=showcase.examples[1];
      if(await context.evaluate(element=>(element as HTMLDetailsElement).open))throw new Error('Changing scenario did not collapse the authored-context panel.');
      const nextVisual=next.definition?.extensions?.['umf.visual'],contextText=await page.locator('#authored-context-content').textContent()??'';
      if(typeof nextVisual?.question==='string'&&!contextText.includes(nextVisual.question))throw new Error('Changing scenario left stale authored context instead of the new question.');
      await selected.nth(0).click();
    }
  }
  checks.push('all available native renderers are selected per scenario; unavailable choices clear stale previews and downloads');
  checks.push('every qualified renderer exposes hash-matching SVG, PNG, and native-source downloads');

  for(let index=0;index<showcase.examples.length;index++){
    const example=showcase.examples[index];
    for(const render of example.renders.filter((entry:any)=>entry.status==='unsupported')){
      await selected.nth(index).click();await page.locator(`[data-backend="${render.backend}"]`).click();
      await page.waitForFunction(()=>document.querySelector('#diagram-status')?.textContent?.includes('No qualified'));
      if(await page.locator('#diagram-image').isVisible())throw new Error(`${example.id}/${render.backend} displays a stale qualified preview after refusal.`);
      for(const id of ['download-svg','download-png','download-native-source'])if(await page.locator(`#${id}`).getAttribute('aria-disabled')!=='true')throw new Error(`${example.id}/${render.backend} exposes a download after refusal.`);
      for(const diagnostic of render.diagnostics||[])if(diagnostic.message&&!(await page.locator('#diagram-status').innerText()).includes(diagnostic.message))throw new Error(`${example.id}/${render.backend} hides its specific refusal reason.`);
    }
  }
  checks.push('unsupported renderer choices hide stale previews and downloads and explain the source-bound refusal');

  const stackIndex=showcase.examples.findIndex((example:any)=>example.id==='umf-architecture-stack');
  if(stackIndex<0)throw new Error('The authored stack example is absent from the showcase manifest.');
  await selected.nth(stackIndex).click();
  await page.waitForFunction(()=>document.querySelector('#render-caveat')?.textContent?.includes('authored reading order'));
  if(!(await page.locator('#render-caveat').innerText()).includes('authored reading order'))throw new Error('The stack preview does not state that vertical bands are an authored reading order.');
  const logicalMetamodel=showcase.examples.findIndex((example:any)=>example.id==='umf-logical-metamodel');
  const mermaidQualified=qualifiedByExample.get('umf-logical-metamodel')?.includes('mermaid');
  if(logicalMetamodel>=0&&mermaidQualified){
    await selected.nth(logicalMetamodel).click();await page.locator('[data-backend="mermaid"]').click();
    await page.waitForFunction(()=>document.querySelector('#render-caveat')?.textContent?.includes('field bindings are labelled'));
    if(!(await page.locator('#render-caveat').innerText()).includes('field bindings are labelled'))throw new Error('The Mermaid entity preview hides its field-binding qualification.');
  }
  checks.push('visual caveats describe stack reading order and Mermaid entity-level connections');

  await selected.nth(0).click();
  for(const backend of ['lini','graphviz','mermaid']){
    const button=page.locator(`[data-backend="${backend}"]`);await button.click();
    const available=qualifiedByExample.get(showcase.examples[0].id)?.includes(backend);
    if(available){
      const expected=showcase.examples[0].renders.find((render:any)=>render.backend===backend&&render.status==='qualified');
      await page.waitForFunction(filename=>document.querySelector('#download-svg')?.getAttribute('download')===filename&&document.querySelector('#download-svg')?.getAttribute('aria-disabled')==='false'&&(document.querySelector('#diagram-image') as HTMLImageElement|null)?.hidden===false,expected.svgPath.split('/').pop());
      await page.locator('#diagram-image').evaluate(async element=>{const image=element as HTMLImageElement;await image.decode();if(image.naturalWidth<=0)throw new Error('Selected backend image failed to decode.');});
      if(!(await page.locator('#engine-caption').innerText()).toLowerCase().includes(backend))throw new Error(`The ${backend} toggle did not identify the actual rendering engine.`);
    }else if(!(await page.locator('#diagram-status').innerText()).toLowerCase().includes('qualified')||await page.locator('#diagram-image').isVisible())throw new Error(`The unavailable ${backend} path was not explicitly described or hid the prior render.`);
  }
  checks.push('backend selection shows qualified renders or an explicit unavailable state');

  const firstQualified=qualifiedByExample.get(showcase.examples[0].id)!;
  const sourceBackend=firstQualified.includes('lini')?'lini':firstQualified.includes('graphviz')?'graphviz':'mermaid';
  await page.locator(`[data-backend="${sourceBackend}"]`).click();
  await page.waitForFunction(()=>document.querySelector('#download-native-source')?.getAttribute('aria-disabled')==='false');
  await page.locator('#diagram-image').evaluate(async element=>{const image=element as HTMLImageElement;await image.decode();});
  if(!(await page.locator('#source-details').evaluate(element=>(element as HTMLDetailsElement).open)))await page.locator('#source-details > summary').click();
  if(!(await page.locator('#definition-source').innerText()).includes('"kind"'))throw new Error('The authored definition is not available for inspection.');
  if(!(await page.locator('#native-source').innerText()).trim())throw new Error('The exact emitted native source is not available for inspection.');
  const selectedReceipt=showcase.examples[0].renders.find((render:any)=>render.backend===sourceBackend&&render.status==='qualified');
  if((selectedReceipt.omissions||[]).length+(selectedReceipt.approximations||[]).length)await page.locator('#rendering-notes > summary').click();
  for(const disclosure of await page.locator('#rendering-notes-list details').all()){
    if(!(await disclosure.evaluate(element=>(element as HTMLDetailsElement).open)))await disclosure.locator(':scope > summary').click();
  }
  const notesText=await page.locator('#rendering-notes-list').innerText();
  for(const note of [...(selectedReceipt.omissions||[]),...(selectedReceipt.approximations||[])])if(!notesText.includes(note.sourcePath))throw new Error(`Rendering note for ${note.sourcePath} is not visible in the source inspection disclosure.`);
  const [definitionDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#download-full-umf').click()]);
  if(!definitionDownload.suggestedFilename().endsWith('.umf.json'))throw new Error('The full UMF envelope download is not clearly distinguished from the visual payload.');
  const fullUmfPath='.cache/showcase-full-umf.json';await definitionDownload.saveAs(fullUmfPath);
  const downloadedUmf=JSON.parse(await Bun.file(fullUmfPath).text());
  if(JSON.stringify(downloadedUmf)!==JSON.stringify(showcase.examples[0].definition))throw new Error('The full UMF envelope download differs from the selected definition.');
  checks.push('collapsed source inspection exposes exact native source; separate download contains the complete UMF envelope');

  await page.locator('#enlarge-diagram').click();
  if(!(await page.locator('#diagram-viewer').isVisible()))throw new Error('The accessible image viewer did not open.');
  await page.screenshot({path:'.cache/showcase-diagram-enlarged.png'});
  await page.keyboard.press('Escape');
  if(await page.locator('#diagram-viewer').isVisible())throw new Error('Escape did not close the enlarged diagram viewer.');
  if(await page.evaluate(()=>document.activeElement?.id)!=='enlarge-diagram')throw new Error('Closing the image viewer did not restore focus to its opener.');
  const alternateBackend=firstQualified.find(backend=>backend!==sourceBackend);
  const resetSelections:Array<()=>Promise<void>>=[];
  if(alternateBackend)resetSelections.push(async()=>{await page.locator(`[data-backend="${alternateBackend}"]`).click();await page.waitForFunction(()=>document.querySelector('#download-svg')?.getAttribute('aria-disabled')==='false');});
  if(showcase.examples.length>1)resetSelections.push(async()=>{await selected.nth(1).click();await page.waitForFunction(()=>document.querySelector('#download-svg')?.getAttribute('aria-disabled')==='false');});
  await page.setViewportSize({width:375,height:812});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.locator('#source-details').evaluate(element=>{(element as HTMLDetailsElement).open=true;});
  await page.locator('#authored-context').evaluate(element=>{(element as HTMLDetailsElement).open=true;});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Expanded source inspection causes horizontal page overflow at 375px.');
  await page.locator('#source-details').evaluate(element=>{(element as HTMLDetailsElement).open=false;});
  for(const selector of ['#source-details','#authored-context','#rendering-notes']){const disclosure=page.locator(selector);if(await disclosure.count()&&await disclosure.evaluate(element=>(element as HTMLDetailsElement).open))await disclosure.evaluate(element=>{(element as HTMLDetailsElement).open=false;});}
  await page.setViewportSize({width:1440,height:1050});
  await exerciseViewerZoom(page,selectedReceipt.svgSha256,resetSelections);
  checks.push('enlarged diagram supports Fit/100%, bounded 25% zoom, keyboard controls, a focusable scroll viewport, reset after scene/backend changes, and preserves the SVG hash');

  await page.setViewportSize({width:390,height:844});await page.goto('https://umf.local/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('#download-svg')?.getAttribute('aria-disabled')==='false');
  await page.locator('#diagram-image').evaluate(async element=>{const image=element as HTMLImageElement;await image.decode();});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('The new homepage overflows horizontally at 390px.');
  await page.screenshot({path:'.cache/showcase-home-mobile.png',fullPage:true});
  const mobileOrder=await page.locator('#scenario-list').evaluate(list=>!!(list.compareDocumentPosition(document.querySelector('#diagram-frame')!)&Node.DOCUMENT_POSITION_FOLLOWING));
  if(!mobileOrder)throw new Error('Mobile layout places the main diagram before its scenario controls.');
  checks.push('mobile homepage has no horizontal overflow and places the scenario choices before the main diagram');

  await page.goto('https://umf.local/?id=visual-canary-supported-flow&target=dot&profile=legacy&view=diagram#coverage',{waitUntil:'networkidle'});
  if(new URL(page.url()).pathname!=='/evidence.html'||!new URL(page.url()).searchParams.has('id')||new URL(page.url()).hash!=='#coverage')throw new Error(`A legacy catalogue deep link did not resolve to the evidence page while preserving item/hash state (${page.url()}).`);
  await page.locator('#detail-dialog').waitFor({state:'visible'});
  checks.push('legacy catalogue query/hash URLs redirect to the preserved evidence page');
  await page.goto('https://umf.local/#kind-reference-grid',{waitUntil:'networkidle'});
  if(new URL(page.url()).pathname!=='/evidence.html'||new URL(page.url()).hash!=='#kind-reference-grid')throw new Error('A legacy language-reference anchor did not redirect to its original evidence section.');
  await page.goto('https://umf.local/#language',{waitUntil:'networkidle'});
  if(new URL(page.url()).pathname!=='/evidence.html'||new URL(page.url()).hash!=='#language')throw new Error('The prior primary language anchor did not redirect to the evidence reference.');
  checks.push('legacy language-reference anchors retain their original destination');

  await page.goto('https://umf.local/',{waitUntil:'networkidle'});await page.setViewportSize({width:1440,height:1050});
  await page.screenshot({path:'.cache/showcase-home-desktop.png',fullPage:true});
  if(errors.length)throw new Error(`Browser errors: ${errors.join('; ')}`);
  const receipt={ok:true,examples:showcase.examples.length,qualifiedRenders:[...qualifiedByExample.values()].reduce((sum,items)=>sum+items.length,0),checks,screenshots:['.cache/showcase-home-desktop.png','.cache/showcase-home-mobile.png','.cache/showcase-diagram-enlarged.png'],browser:browser.version(),errors};
  await Bun.write('.cache/showcase-ui-browser.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{await browser.close();}
