import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {extname,join,resolve,sep} from 'node:path';

const siteRoot=resolve('dist-site');
const baseUrl='https://umf.local/';
const catalog=await Bun.file(join(siteRoot,'catalog.json')).json() as {schemaVersion:number;items:Array<any>;language:any};
if(catalog.schemaVersion!==1||!Array.isArray(catalog.items)||catalog.items.length!==53)throw new Error('Profile UI acceptance requires the current 53-example catalog. Build the catalog first.');
const forms=catalog.language?.forms?.kinds?.flatMap((entry:any)=>entry.forms.map((form:string)=>`${entry.kind}/${form}`))||[];
if(forms.length!==22)throw new Error(`Expected the 22 canonical kind/form combinations, found ${forms.length}.`);
const hasNativeRender=(render:any)=>Boolean(render?.ok&&render.svgPath&&/^[a-f0-9]{64}$/.test(render.svgSha256||''));
const fullNativeClean=(render:any)=>hasNativeRender(render)&&!(render.nativeDiagnostics?.length);
function releaseEvidence(item:any):boolean {
  const choice=item.preferredRelease;if(!choice)return false;
  const variant=item.profileVariants?.find((entry:any)=>entry.profileId===choice.profileId&&entry.format===choice.format);
  if(variant)return variant.result?.status==='supported'&&variant.result?.ok===true&&typeof variant.result?.source==='string'&&hasNativeRender(variant.result?.render)&&hasNativeRender(variant.diagramRender)&&Array.isArray(variant.coverage)&&variant.coverage.length>0;
  const target=item.targets?.[choice.format];return target?.status==='supported'&&target.ok===true&&typeof target.source==='string'&&hasNativeRender(target.render);
}
const incomplete=catalog.items.filter(item=>!releaseEvidence(item));
const qualifiedItems=catalog.items.filter(releaseEvidence);
const coveredForms=new Set(qualifiedItems.map(item=>`${item.kind}/${item.form}`));
const missingForms=forms.filter((form:string)=>!coveredForms.has(form));
const allowPartial=process.env.UMF_PROFILE_UI_ALLOW_PARTIAL==='1';
if((incomplete.length&&!allowPartial)||(!allowPartial&&missingForms.length))throw new Error(`Preferred-profile browser checks are gated until complete release evidence exists: ${qualifiedItems.length}/53 examples qualify; ${forms.length-missingForms.length}/22 forms are covered. First incomplete examples: ${incomplete.slice(0,8).map(item=>item.id).join(', ')||'none'}. Missing forms: ${missingForms.join(', ')||'none'}. Set UMF_PROFILE_UI_ALLOW_PARTIAL=1 only for interim UI QA.`);
const renderAssets=catalog.items.flatMap(item=>[
  ...['dot','mermaid','lini'].flatMap(format=>{const render=item.targets?.[format]?.render;return hasNativeRender(render)?[{id:item.id,view:`baseline ${format}`,path:render.svgPath,sha256:render.svgSha256}]:[];}),
  ...(item.profileVariants||[]).flatMap((variant:any)=>[
    ...(hasNativeRender(variant.result?.render)?[{id:item.id,view:`${variant.profileId} complete`,path:variant.result.render.svgPath,sha256:variant.result.render.svgSha256}]:[]),
    ...(hasNativeRender(variant.diagramRender)?[{id:item.id,view:`${variant.profileId} focused`,path:variant.diagramRender.svgPath,sha256:variant.diagramRender.svgSha256}]:[]),
  ]),
  ...(item.fullProfileVariants||[]).flatMap((variant:any)=>[
    ...(hasNativeRender(variant.result?.render)?[{id:item.id,view:`${variant.profileId} complete`,path:variant.result.render.svgPath,sha256:variant.result.render.svgSha256}]:[]),
    ...(hasNativeRender(variant.diagramRender)?[{id:item.id,view:`${variant.profileId} focused`,path:variant.diagramRender.svgPath,sha256:variant.diagramRender.svgSha256}]:[]),
  ]),
]);
if(renderAssets.length===0)throw new Error('No verified baseline or annotation SVG assets were found.');
const mime:Record<string,string>={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json;charset=utf-8','.svg':'image/svg+xml'};
const browser=await chromium.launch({headless:true});
const errors:string[]=[];const checks:string[]=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',error=>errors.push(String(error)));
  await page.route('https://umf.local/**',async route=>{
    const pathname=decodeURIComponent(new URL(route.request().url()).pathname);
    const path=resolve(siteRoot,`.${pathname==='/'?'/index.html':pathname}`);
    if(path!==siteRoot&&!path.startsWith(siteRoot+sep)){await route.fulfill({status:404,body:'Not found'});return;}
    const file=Bun.file(path);if(!(await file.exists())){await route.fulfill({status:404,body:'Not found'});return;}
    await route.fulfill({status:200,body:Buffer.from(await file.arrayBuffer()),contentType:mime[extname(path)]||'application/octet-stream',headers:{'cache-control':'no-store'}});
  });
  await page.goto(baseUrl,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelectorAll('.definition-card').length>0);
  const assets=await page.evaluate(async entries=>Promise.all(entries.map(entry=>new Promise<{id:string;view:string;ok:boolean;width:number;height:number}>(resolve=>{
    const image=new Image();const url=new URL(entry.path,location.href);url.searchParams.set('v',entry.sha256);
    const finish=(ok:boolean)=>resolve({id:entry.id,view:entry.view,ok,width:image.naturalWidth,height:image.naturalHeight});
    image.onload=()=>finish(true);image.onerror=()=>finish(false);image.src=url.href;
  }))),renderAssets);
  const failed=assets.filter(asset=>!asset.ok||asset.width<=0||asset.height<=0);
  if(failed.length)throw new Error(`Native preview assets failed browser loading/dimension checks: ${JSON.stringify(failed.slice(0,8))}`);
  checks.push(`all ${assets.length} baseline, focused and complete SVG assets load with intrinsic dimensions`);
  const representativeByForm=new Map<string,any>();
  for(const item of qualifiedItems){const form=`${item.kind}/${item.form}`;if(representativeByForm.has(form))continue;const choice=item.preferredRelease;const full=(item.fullProfileVariants||[]).find((entry:any)=>entry.format===choice?.format&&entry.result?.status==='supported'&&entry.result?.ok&&fullNativeClean(entry.result?.render)&&fullNativeClean(entry.diagramRender)&&!(entry.result?.diagnostics||[]).some((d:any)=>d.loss||d.severity==='error'));const fallback=(item.profileVariants||[]).find((entry:any)=>entry.profileId===choice?.profileId&&entry.format===choice?.format);const variant=full||fallback;const render=variant?.diagramRender||item.targets?.[choice?.format]?.render;if(render?.svgPath)representativeByForm.set(form,{form,id:item.id,title:item.title,format:variant?.format||choice?.format,path:render.svgPath,sha256:render.svgSha256,profile:variant?.profileId||'ordinary baseline'});}
  const formReview=[...representativeByForm.values()].sort((a,b)=>a.form.localeCompare(b.form));
  if(formReview.length!==22)throw new Error(`Visual review set must contain one native focused diagram for every canonical form; found ${formReview.length}/22.`);
  const reviewPage=await browser.newPage({viewport:{width:1680,height:1180}});
  await reviewPage.route('https://umf.local/**',async route=>{const pathname=decodeURIComponent(new URL(route.request().url()).pathname);const path=resolve(siteRoot,`.${pathname==='/'?'/index.html':pathname}`);if(path!==siteRoot&&!path.startsWith(siteRoot+sep)){await route.fulfill({status:404,body:'Not found'});return;}const file=Bun.file(path);if(!(await file.exists())){await route.fulfill({status:404,body:'Not found'});return;}await route.fulfill({status:200,body:Buffer.from(await file.arrayBuffer()),contentType:mime[extname(path)]||'application/octet-stream',headers:{'cache-control':'no-store'}});});
  await reviewPage.goto(baseUrl);
  await reviewPage.evaluate(entries=>{const style=document.createElement('style');style.textContent='*{box-sizing:border-box}body{margin:0;background:#eef1ee;color:#1a211f;font:14px system-ui,sans-serif}.sheet{padding:20px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.card{min-width:0;background:white;border:1px solid #d5dcd7;border-radius:8px;padding:12px;break-inside:avoid}.card h2{font:600 15px system-ui;margin:0 0 4px}.card p{font:11px ui-monospace,monospace;color:#5b6861;overflow-wrap:anywhere;margin:0 0 8px}.card img{display:block;width:100%;height:280px;object-fit:contain;background:white;border:1px solid #e0e5e1}';document.head.append(style);const sheet=document.createElement('main');sheet.className='sheet';for(const entry of entries){const card=document.createElement('section');card.className='card';const title=document.createElement('h2');title.textContent=entry.form;const provenance=document.createElement('p');provenance.textContent=`${entry.id} · ${entry.format} · ${entry.profile} focused native view`;const image=document.createElement('img');image.className='native-review-image';image.alt=`${entry.form}: ${entry.title}`;const src=new URL(entry.path,location.href);src.searchParams.set('v',entry.sha256);image.src=src.href;card.append(title,provenance,image);sheet.append(card);}document.body.replaceChildren(sheet);},formReview);
  await reviewPage.waitForFunction(()=>{const images=[...document.querySelectorAll<HTMLImageElement>('.native-review-image')];return images.length===22&&images.every(image=>image.complete&&image.naturalWidth>0&&image.naturalHeight>0);});
  await reviewPage.screenshot({path:'.cache/catalog-profile-forms-contact.png',fullPage:true});
  const visualSummaries=await reviewPage.locator('.card').evaluateAll(cards=>cards.map(card=>{const image=card.querySelector('img') as HTMLImageElement;return {form:card.querySelector('h2')?.textContent,width:image.naturalWidth,height:image.naturalHeight,ratio:Number((image.naturalWidth/image.naturalHeight).toFixed(2))};}));
  const keyForms=new Set(['sequence/lifelines','sequence/ladder','structure/entities','flow/lanes','comparison/matrix','metric/line','timeline/roadmap']);
  await mkdir('.cache/catalog-profile-form-review',{recursive:true});
  for(const entry of formReview){if(!keyForms.has(entry.form))continue;const safe=entry.form.replaceAll('/','-');await reviewPage.evaluate(entry=>{const main=document.createElement('main');const image=document.createElement('img');image.id='single-native-review';image.alt=`${entry.form}: ${entry.title}`;const src=new URL(entry.path,location.href);src.searchParams.set('v',entry.sha256);image.src=src.href;image.onload=()=>{image.style.width=`${image.naturalWidth}px`;image.style.height=`${image.naturalHeight}px`;image.style.maxWidth='none';image.style.maxHeight='none';};main.append(image);document.body.replaceChildren(main);},entry);await reviewPage.waitForFunction(()=>{const image=document.querySelector<HTMLImageElement>('#single-native-review');return !!image&&image.complete&&image.naturalWidth>0&&image.naturalHeight>0;});await reviewPage.locator('#single-native-review').screenshot({path:`.cache/catalog-profile-form-review/${safe}.png`});}
  const roadmap=catalog.items.find((item:any)=>item.kind==='timeline'&&item.form==='roadmap');const roadmapChoice=roadmap?.preferredRelease;const roadmapFull=(roadmap?.fullProfileVariants||[]).find((entry:any)=>entry.format===roadmapChoice?.format&&entry.result?.status==='supported'&&entry.result?.ok&&fullNativeClean(entry.result?.render)&&fullNativeClean(entry.diagramRender));const roadmapVariant=roadmapFull||roadmap?.profileVariants?.find((entry:any)=>entry.profileId===roadmapChoice?.profileId&&entry.format===roadmapChoice?.format);const roadmapComplete=roadmapVariant?.result?.render;
  if(roadmapComplete?.ok&&roadmapComplete.svgPath){const entry={form:'timeline/roadmap complete',title:roadmap.title,path:roadmapComplete.svgPath,sha256:roadmapComplete.svgSha256};await reviewPage.evaluate(entry=>{const main=document.createElement('main');const image=document.createElement('img');image.id='single-native-review';image.alt=`${entry.form}: ${entry.title}`;const src=new URL(entry.path,location.href);src.searchParams.set('v',entry.sha256);image.src=src.href;image.onload=()=>{image.style.width=`${image.naturalWidth}px`;image.style.height=`${image.naturalHeight}px`;image.style.maxWidth='none';image.style.maxHeight='none';};main.append(image);document.body.replaceChildren(main);},entry);await reviewPage.waitForFunction(()=>{const image=document.querySelector<HTMLImageElement>('#single-native-review');return !!image&&image.complete&&image.naturalWidth>0&&image.naturalHeight>0;});await reviewPage.locator('#single-native-review').screenshot({path:'.cache/catalog-profile-form-review/timeline-roadmap-complete.png'});}
  await reviewPage.close();checks.push('all 22 canonical forms have focused native review images; seven dense/key cases exported individually');
  const sample=catalog.items.find(item=>{const c=item.preferredRelease;return c&&item.profileVariants?.some((v:any)=>v.profileId===c.profileId&&v.format===c.format);});
  if(!sample)throw new Error('No preferred annotated profile is available to exercise in the browser.');
  const choice=sample.preferredRelease;const variant=sample.profileVariants.find((v:any)=>v.profileId===choice.profileId&&v.format===choice.format);
  await mkdir('.cache',{recursive:true});
  const profileUrl=`${baseUrl}?id=${encodeURIComponent(sample.id)}&target=${choice.format}&profile=${encodeURIComponent(choice.profileId)}`;
  await page.goto(profileUrl);await page.locator('#detail-dialog').waitFor({state:'visible'});
  if(new URL(page.url()).searchParams.get('profile')!==choice.profileId||await page.locator('#profile-select').inputValue()!==choice.profileId)throw new Error('Optional profile deep link did not restore the selected annotation profile.');
  if(await page.locator('#view-diagram').getAttribute('aria-selected')!=='true')throw new Error('Profile deep link did not default to its focused diagram view.');
  if(!(await page.locator('#target-panel').getByText('QUALIFIED ANNOTATION PROFILE · PREFERRED RELEASE').count()))throw new Error('Preferred annotation profile was not explicitly labeled.');
  const focused=page.locator('#target-panel .profile-render-img');
  await page.waitForFunction(()=>{const img=document.querySelector('#target-panel .profile-render-img') as HTMLImageElement|null;return !!img&&img.complete&&img.naturalWidth>0&&img.naturalHeight>0;});
  const fitBounds=await focused.evaluate(img=>{const rect=img.getBoundingClientRect(),container=img.parentElement!.getBoundingClientRect();return {width:rect.width,height:rect.height,containerWidth:container.width,containerHeight:container.height};});
  if(fitBounds.width<=0||fitBounds.height<=0||fitBounds.width>fitBounds.containerWidth||fitBounds.height>fitBounds.containerHeight)throw new Error(`Focused preview did not fit its available panel: ${JSON.stringify(fitBounds)}`);
  if(fitBounds.containerWidth<900||fitBounds.containerHeight<400)throw new Error(`Native preview is not given a dominant readable canvas: ${JSON.stringify(fitBounds)}`);
  for(const label of ['Zoom in','Zoom out','Fit to view','100%'])if(!(await page.getByRole('button',{name:label}).count()))throw new Error(`Missing native preview control: ${label}`);
  if(!(await page.getByRole('link',{name:/Open focused diagram display SVG in a new tab/}).count()))throw new Error('Missing focused display SVG link with a clear accessible name.');
  const zoomBefore=await focused.evaluate(img=>(img as HTMLImageElement).getBoundingClientRect().width);
  await page.getByRole('button',{name:'Zoom in'}).click();
  const zoomAfter=await focused.evaluate(img=>(img as HTMLImageElement).getBoundingClientRect().width);
  if(zoomAfter<=zoomBefore)throw new Error('Zoom in did not enlarge the actual SVG view.');
  await page.getByRole('button',{name:'100%'}).click();
  const nativeSize=await focused.evaluate(img=>({width:(img as HTMLImageElement).getBoundingClientRect().width,naturalWidth:(img as HTMLImageElement).naturalWidth}));
  if(Math.abs(nativeSize.width-nativeSize.naturalWidth)>1)throw new Error(`100% control did not expose native SVG size: ${JSON.stringify(nativeSize)}`);
  await page.getByRole('button',{name:'Fit to view'}).click();
  if(await page.locator('.zoom-readout').innerText()!=='Fit')throw new Error('Fit control did not restore the view.');
  await page.screenshot({path:'.cache/catalog-profile-focused.png'});
  checks.push('full-width native diagram, fit/zoom/100% controls and new-tab SVG access');

  await page.getByRole('tab',{name:'Complete annotated view'}).click();
  if(new URL(page.url()).searchParams.get('profile')!==choice.profileId)throw new Error('Changing annotation view did not preserve the optional profile deep link.');
  const full=page.locator('#target-panel .profile-render-img');
  await page.waitForFunction(()=>{const img=document.querySelector('#target-panel .profile-render-img') as HTMLImageElement|null;return !!img&&img.complete&&img.naturalWidth>0&&img.naturalHeight>0;});
  if(!(await page.locator('#target-panel .profile-complete-source').count()))throw new Error('Complete annotated native source is not available.');
  const coverage=page.locator('#target-panel .profile-coverage');await coverage.locator('summary').click();
  if(await coverage.locator('tbody tr').count()!==variant.coverage.length)throw new Error('Visible representation table differs from typed per-path coverage.');
  const coverageText=(await coverage.innerText()).toLowerCase();
  if(!coverageText.includes('profile-annotation')||!coverageText.includes('native-concept'))throw new Error('Coverage does not distinguish native concepts from profile annotations.');
  const completeSource=await page.locator('#target-panel .profile-complete-source pre code').textContent();
  if(completeSource!==variant.result.source)throw new Error('Complete native source view does not match the emitted annotated source.');
  await page.screenshot({path:'.cache/catalog-profile-complete.png'});
  if(await page.locator('#sample-document-details').getAttribute('open')!==null)throw new Error('Example JSON should remain collapsed while native evidence is the primary view.');
  checks.push('complete annotated native render/source, coverage and representation distinctions; example JSON stays collapsed');

  const completeWidth=await full.evaluate(img=>(img as HTMLImageElement).naturalWidth);
  await page.locator('#profile-select').selectOption('native');
  if(new URL(page.url()).searchParams.has('profile'))throw new Error('Native baseline selection did not clear the optional profile parameter.');
  if(!(await page.locator('#baseline-label').innerText()).includes('NATIVE BASELINE'))throw new Error('Existing native target was not retained as an explicit baseline.');
  const baseline=sample.targets[choice.format];
  if(!(await page.locator('#target-panel').getByText(statusText(baseline.status)).count()))throw new Error('Baseline outcome is not visible after leaving annotation mode.');
  await page.screenshot({path:'.cache/catalog-profile-baseline.png'});
  checks.push(`unchanged ${choice.format} baseline remains reachable with its own outcome`);

  await page.goto(profileUrl);await page.locator('#detail-dialog').waitFor({state:'visible'});
  await page.getByRole('tab',{name:'Diagram'}).focus();await page.keyboard.press('ArrowRight');
  if(await page.locator('#view-complete').getAttribute('aria-selected')!=='true'||await page.locator('#view-complete').getAttribute('tabindex')!=='0')throw new Error('Keyboard navigation did not select the complete view with a roving tab stop.');
  await page.keyboard.press('ArrowLeft');
  if(await page.locator('#view-diagram').getAttribute('aria-selected')!=='true')throw new Error('Keyboard navigation did not return to the focused diagram.');
  await page.setViewportSize({width:375,height:812});await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'.cache/catalog-profile-mobile.png'});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Profile dialog creates horizontal page overflow at 375px.');
  const mobileWidth=await page.locator('#detail-dialog').evaluate(dialog=>(dialog as HTMLElement).getBoundingClientRect().width);
  if(mobileWidth>375)throw new Error(`Profile dialog exceeds mobile viewport: ${mobileWidth}px`);
  checks.push('keyboard-operable profile tabs and 375px mobile dialog');
  const fullSample=catalog.items.find(item=>(item.fullProfileVariants||[]).some((entry:any)=>entry.result?.status==='supported'&&entry.result?.ok&&fullNativeClean(entry.result?.render)&&fullNativeClean(entry.diagramRender)));
  if(!fullSample)throw new Error('No strict, source-readback, complete-render and focused-render full profile is available for browser selection.');
  const fullVariant=fullSample.fullProfileVariants.find((entry:any)=>entry.result?.status==='supported'&&entry.result?.ok&&fullNativeClean(entry.result?.render)&&fullNativeClean(entry.diagramRender));
  await page.goto(`${baseUrl}?id=${encodeURIComponent(fullSample.id)}`);await page.locator('#detail-dialog').waitFor({state:'visible'});
  if(await page.locator('#profile-select').inputValue()!==fullVariant.profileId)throw new Error('A fresh example open did not prefer the qualified canonical full-profile route.');
  await page.goto(`${baseUrl}?id=${encodeURIComponent(fullSample.id)}&target=${fullVariant.format}`);await page.locator('#detail-dialog').waitFor({state:'visible'});
  if(await page.locator('#profile-select').inputValue()!=='native'||new URL(page.url()).searchParams.has('profile'))throw new Error('An explicit target-only deep link did not retain the ordinary native baseline.');
  checks.push('fresh examples prefer qualified full profiles while explicit target-only links retain ordinary native behavior');
  const fullUrl=`${baseUrl}?id=${encodeURIComponent(fullSample.id)}&target=${fullVariant.format}&profile=${encodeURIComponent(fullVariant.profileId)}&view=diagram`;
  await page.setViewportSize({width:1440,height:1000});await page.goto(fullUrl);await page.locator('#detail-dialog').waitFor({state:'visible'});
  if(new URL(page.url()).searchParams.get('profile')!==fullVariant.profileId||await page.locator('#profile-select').inputValue()!==fullVariant.profileId)throw new Error('Full-profile deep link did not restore its exact selected profile.');
  if(!(await page.locator('#target-panel').getByText('FULL INTERCHANGE PROFILE · STRICT RENDER QUALIFIED').count()))throw new Error('Strict full-profile native render qualification is not labeled.');
  await page.waitForFunction(()=>{const image=document.querySelector('#target-panel .profile-render-img') as HTMLImageElement|null;return !!image&&image.complete&&image.naturalWidth>0&&image.naturalHeight>0;});
  if(!(await page.locator('#target-panel .profile-approximations').count()))throw new Error('Full profile does not expose visual approximations separately from losses.');
  const approximationSummary=await page.locator('#target-panel .profile-approximations summary').innerText();
  if(!approximationSummary.includes('separate from reported semantic losses'))throw new Error('Approximation counts are conflated with semantic losses.');
  await page.getByRole('tab',{name:'Complete native view'}).click();
  if(new URL(page.url()).searchParams.get('view')!=='complete'||new URL(page.url()).searchParams.get('profile')!==fullVariant.profileId)throw new Error('Complete full view did not preserve profile and view deep-link state.');
  const fullSource=await page.locator('#target-panel .profile-complete-source pre code').textContent();
  if(fullSource!==fullVariant.result.source)throw new Error('Full-profile interchange source differs from the exact emitted source.');
  const completeRouteCopy=await page.locator('#target-panel .profile-view-note').innerText();
  if(fullVariant.representation.tier==='native-profile'?!completeRouteCopy.includes('Whole-document readback is verified'):!completeRouteCopy.includes('readable typed property records'))throw new Error('Complete-view description does not match the selected full-profile representation tier.');
  if(!(await page.locator('#target-panel').getByText('renderer-only and is not used for interchange').count()))throw new Error('Focused full-profile display is not distinguished from complete interchange source.');
  await page.locator('#target-panel .profile-complete-source > summary').click();
  const [sourceDownload]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download complete native source'}).click()]);
  if(sourceDownload.suggestedFilename()!==`${fullSample.id}.full-${fullVariant.format==='mermaid'?'mmd':fullVariant.format}`)throw new Error(`Unexpected full-profile source download name: ${sourceDownload.suggestedFilename()}`);
  await page.screenshot({path:'.cache/catalog-full-profile-complete.png'});
  checks.push(`full-profile ${fullVariant.profileId} deep link, exact source view/download, render and separate approximation details`);
  const routeExamples=['native-profile','primitive-fallback'].map(tier=>catalog.items.flatMap(item=>(item.fullProfileVariants||[]).filter((entry:any)=>entry.representation?.tier===tier&&entry.result?.status==='supported'&&entry.result?.ok&&fullNativeClean(entry.result?.render)&&fullNativeClean(entry.diagramRender)).map((entry:any)=>({item,entry}))).find(Boolean));
  if(routeExamples.some(value=>!value))throw new Error('Browser route proof requires one rendered native-profile and one rendered primitive-fallback full route.');
  for(const {item,entry} of routeExamples as Array<{item:any;entry:any}>){
    if(entry.representation.tier==='native-profile'){
      const nativeSource=item.profileVariants?.find((candidate:any)=>candidate.profileId===entry.representation.sourceProfile&&candidate.format===entry.format)?.result?.source;
      if(typeof nativeSource!=='string'||entry.result.source!==nativeSource)throw new Error('Catalog native-first route is not the exact strict annotated source.');
    }else if(entry.representation.sourceProfile!==entry.profileId||entry.representation.coverageModel!=='visible-record-tree')throw new Error('Generic full-profile route lacks explicit record-tree provenance.');
    await page.goto(`${baseUrl}?id=${encodeURIComponent(item.id)}&target=${entry.format}&profile=${encodeURIComponent(entry.profileId)}&view=diagram`);await page.locator('#detail-dialog').waitFor({state:'visible'});
    const routeText=await page.locator('#target-panel .profile-representation').innerText();
    const expected=entry.representation.tier==='native-profile'?'Existing native profile reused after full-document readback.':'Primitive diagram shapes and links; all remaining fields are shown as readable typed property records.';
    if(!routeText.includes(expected)||!routeText.includes(entry.representation.sourceProfile)||!routeText.includes(entry.representation.sourceMappingVersion))throw new Error(`UI hides or misstates the actual ${entry.representation.tier} renderer route: ${routeText}`);
  }
  checks.push('native-profile route selection reuses exact annotated bytes and shows the renderer mapping version');
  const warningSample=catalog.items.find(item=>(item.fullProfileVariants||[]).some((entry:any)=>[...(entry.result?.render?.nativeDiagnostics||[]),...(entry.diagramRender?.nativeDiagnostics||[])].length));
  if(warningSample){const warningVariant=warningSample.fullProfileVariants.find((entry:any)=>[...(entry.result?.render?.nativeDiagnostics||[]),...(entry.diagramRender?.nativeDiagnostics||[])].length);await page.goto(`${baseUrl}?id=${encodeURIComponent(warningSample.id)}&target=${warningVariant.format}&profile=${encodeURIComponent(warningVariant.profileId)}`);await page.locator('#detail-dialog').waitFor({state:'visible'});if(!(await page.locator('#target-panel').getByText('FULL INTERCHANGE PROFILE · EXPORT OUTCOME').count())||!(await page.locator('#target-panel .native-render-diagnostics').count()))throw new Error('Native compiler diagnostics were hidden or still counted as full-profile qualification.');checks.push('native compiler diagnostics remain visible and exclude full-profile qualification');}
  const refused=catalog.items.find(item=>(item.fullProfileVariants||[]).some((entry:any)=>entry.result?.status==='unsupported'));
  if(refused){const refusal=refused.fullProfileVariants.find((entry:any)=>entry.result?.status==='unsupported');const refusalUrl=`${baseUrl}?id=${encodeURIComponent(refused.id)}&target=${refusal.format}&profile=${encodeURIComponent(refusal.profileId)}`;await page.goto(refusalUrl);await page.locator('#detail-dialog').waitFor({state:'visible'});if(!(await page.locator('#target-panel').getByText('Unsupported').count())||await page.locator('#target-panel .profile-render-img').count())throw new Error('An unsupported full profile was hidden, mislabeled, or given a fabricated render.');checks.push('unsupported full-profile refusal remains inspectable without source or render');}
  await page.setViewportSize({width:375,height:812});await page.goto(fullUrl);await page.locator('#detail-dialog').waitFor({state:'visible'});await page.evaluate(()=>window.scrollTo(0,0));
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Full-profile dialog creates horizontal page overflow at 375px.');
  await page.screenshot({path:'.cache/catalog-full-profile-mobile.png'});checks.push('375px full-profile selection and preview layout');
  const missingCatalog=structuredClone(catalog);const removed=missingCatalog.items[0];removed.fullProfileVariants=(removed.fullProfileVariants||[]).filter((entry:any)=>entry.format!=='dot');
  const missingPage=await browser.newPage({viewport:{width:1440,height:1000}});
  await missingPage.route('https://umf.local/**',async route=>{const pathname=decodeURIComponent(new URL(route.request().url()).pathname);if(pathname==='/catalog.json'){await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(missingCatalog)});return;}const path=resolve(siteRoot,`.${pathname==='/'?'/index.html':pathname}`);if(path!==siteRoot&&!path.startsWith(siteRoot+sep)){await route.fulfill({status:404,body:'Not found'});return;}const file=Bun.file(path);if(!(await file.exists())){await route.fulfill({status:404,body:'Not found'});return;}await route.fulfill({status:200,body:Buffer.from(await file.arrayBuffer()),contentType:mime[extname(path)]||'application/octet-stream',headers:{'cache-control':'no-store'}});});
  await missingPage.goto(baseUrl,{waitUntil:'networkidle'});await missingPage.waitForFunction(()=>document.querySelectorAll('#full-profile-coverage-grid .full-profile-coverage-card').length===3);
  const missingText=await missingPage.locator('#full-profile-coverage-grid .full-profile-coverage-card').first().innerText();if(!missingText.includes('52/53 strict rendered examples')||!missingText.includes('1 not evaluated'))throw new Error('A missing full-profile row incorrectly changed the all-example denominator or was counted as a refusal.');await missingPage.close();checks.push('missing full-profile candidates remain not-evaluated against the fixed 53-example denominator');
  const fullProfileAssets=catalog.items.flatMap(item=>(item.fullProfileVariants||[]).flatMap((entry:any)=>[entry.result?.render,entry.diagramRender].filter(hasNativeRender)));
  const fullReceipt={fullProfileCandidates:catalog.items.reduce((sum,item)=>sum+(item.fullProfileVariants||[]).length,0),fullProfileRenderedVariants:catalog.items.reduce((sum,item)=>sum+(item.fullProfileVariants||[]).filter((entry:any)=>entry.result?.render?.ok&&entry.diagramRender?.ok).length,0),fullProfileAssets:fullProfileAssets.length};
  const receipt={ok:true,interim:incomplete.length>0,qualifiedExamples:qualifiedItems.length,totalExamples:catalog.items.length,forms:forms.length,renderAssets:assets.length,...fullReceipt,sample:sample.id,preferred:choice,fullSample:fullSample.id,fullProfile:fullVariant.profileId,focusedWidth:fitBounds.width,completeNativeWidth:completeWidth,visualReview:visualSummaries,checks,screenshots:['.cache/catalog-profile-focused.png','.cache/catalog-profile-complete.png','.cache/catalog-profile-baseline.png','.cache/catalog-profile-mobile.png','.cache/catalog-full-profile-complete.png','.cache/catalog-full-profile-mobile.png','.cache/catalog-profile-forms-contact.png'],keyScreenshots:[...keyForms].map(form=>`.cache/catalog-profile-form-review/${form.replaceAll('/','-')}.png`).concat('.cache/catalog-profile-form-review/timeline-roadmap-complete.png'),browser:browser.version(),errors};
  await Bun.write('.cache/catalog-profile-ui-browser.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
  if(errors.length)throw new Error(`Browser reported page errors: ${errors.join('; ')}`);
}finally{await browser.close();}

function statusText(status:string){return status==='reported-loss'?'Reported loss':status==='supported'?'Supported':status==='unsupported'?'Unsupported':'Not evaluated';}
