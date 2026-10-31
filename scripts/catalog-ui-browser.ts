import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {join,resolve,sep,extname} from 'node:path';

const TARGETS=['dot','mermaid','lini'];
const siteRoot=resolve('dist-site');
const baseUrl='https://umf.local/';
const catalog=await Bun.file(join(siteRoot,'catalog.json')).json() as {schemaVersion:number;items:Array<any>;capabilities:Array<{format:string;profile:string;version:string}>;language:{schema:{sourcePath:string;sourceSha256:string;schema:any};forms:{sourcePath:string;sourceSha256:string;kinds:Array<{kind:string;forms:string[]}>}}};
const integrationCatalog=await Bun.file(join(siteRoot,'integrations.json')).json() as {schemaVersion:number;complete:boolean;counts:Record<string,number>;cases:Array<any>;hostConformance:Array<any>};
if(catalog.schemaVersion!==1||!Array.isArray(catalog.items)||catalog.items.length===0||!catalog.language?.schema?.schema||!catalog.language?.forms?.kinds)throw new Error('Build the site first; dist-site/catalog.json is missing or invalid.');
if(integrationCatalog.schemaVersion!==1||integrationCatalog.complete!==false||integrationCatalog.cases?.length!==6)throw new Error('Build the integration site first; dist-site/integrations.json is missing or invalid.');
const formExamples=catalog.items.filter(item=>item.sourcePath.startsWith('fixtures/visual/forms/'));
const formCount=catalog.language.forms.kinds.reduce((count,kind)=>count+kind.forms.length,0);
const secondaryCount=catalog.items.length-formExamples.length;
const applicationCount=catalog.items.filter(item=>item.origin!=='canary'&&!item.sourcePath.startsWith('fixtures/visual/forms/')).length;
const canaryCount=catalog.items.filter(item=>item.origin==='canary').length;
if(catalog.language.forms.kinds.length!==7||formCount!==22||catalog.items.length!==53)throw new Error('Expected independent totals of 7 kinds, 22 forms, and 53 sample instances.');
const mime:Record<string,string>={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json;charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
const browser=await chromium.launch({headless:true});
const errors:string[]=[];
const exercised:string[]=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  page.on('pageerror',error=>errors.push(String(error)));
  await page.route('https://umf.local/**',async route=>{
    const pathname=decodeURIComponent(new URL(route.request().url()).pathname);
    const path=resolve(siteRoot,`.${pathname==='/'?'/index.html':pathname}`);
    if(path!==siteRoot&&!path.startsWith(siteRoot+sep)){await route.fulfill({status:404,body:'Not found'});return;}
    const file=Bun.file(path);if(!(await file.exists())){await route.fulfill({status:404,body:'Not found'});return;}
    await route.fulfill({status:200,body:Buffer.from(await file.arrayBuffer()),contentType:mime[extname(path)]||'application/octet-stream',headers:{'cache-control':'no-store'}});
  });
  await page.goto(baseUrl,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>((document.querySelector('#definition-list')?.children.length??0)>0));
  const baselineRenderAssets=catalog.items.flatMap(item=>TARGETS.flatMap(target=>{
    const render=item.targets[target]?.render;
    return render?.ok&&render.svgPath?[{id:item.id,target,path:render.svgPath,sha256:render.svgSha256}]:[];
  }));
  const profileRenderAssets=catalog.items.flatMap(item=>(item.profileVariants||[]).flatMap((variant:any)=>[
    ...(variant.result?.render?.ok&&variant.result.render.svgPath?[{id:item.id,target:`${variant.format} complete`,path:variant.result.render.svgPath,sha256:variant.result.render.svgSha256}]:[]),
    ...(variant.diagramRender?.ok&&variant.diagramRender.svgPath?[{id:item.id,target:`${variant.format} focused`,path:variant.diagramRender.svgPath,sha256:variant.diagramRender.svgSha256}]:[])
  ]));
  const renderAssets=[...baselineRenderAssets,...profileRenderAssets];
  if(renderAssets.length<178)throw new Error(`Expected all 178 verified baseline and qualified profile SVG assets, saw ${renderAssets.length}`);
  const assetResults=await page.evaluate(async assets=>Promise.all(assets.map(asset=>new Promise<{id:string;target:string;ok:boolean;width:number;height:number;url:string}>(resolve=>{
    const image=new Image();const url=new URL(asset.path,location.href);if(asset.sha256)url.searchParams.set('v',asset.sha256);
    const finish=(ok:boolean)=>resolve({id:asset.id,target:asset.target,ok,width:image.naturalWidth,height:image.naturalHeight,url:url.href});
    image.onload=()=>finish(true);image.onerror=()=>finish(false);image.src=url.href;
  }))),renderAssets);
  const failedAssets=assetResults.filter(result=>!result.ok||result.width<=0||result.height<=0);
  if(failedAssets.length)throw new Error(`Native SVG previews failed browser image loading: ${JSON.stringify(failedAssets.slice(0,5))}`);
  exercised.push(`all ${renderAssets.length} native SVGs load in-browser with positive dimensions`);
  if(await page.locator('#kind-count').textContent()!=='07'||await page.locator('#form-count').textContent()!=='22')throw new Error('Language counts do not reflect canonical kinds/forms');
  if(await page.locator('.form-chip').count()!==22)throw new Error('Primary reference does not list all 22 canonical forms');
  const languageText=(await page.locator('#language').innerText()).toLowerCase();
  for(const token of ['nodes','edges','groups','sequence','structure','state','timeline','comparison','metric','question','visual 1.0.0','15','visual 1.1.0','500','10,000','narrower bounds'])if(!languageText.includes(token))throw new Error(`Language reference omitted schema concept or versioned limit: ${token}`);
  if(languageText.includes('beacon'))throw new Error('Application example leaked into language headings/reference');
  if(!(await page.locator('#language-provenance').innerText()).includes(catalog.language.schema.sourcePath))throw new Error('Schema provenance was not exposed');
  exercised.push('schema-backed language reference and separate kind/form counts');
  await page.waitForFunction(()=>document.querySelectorAll('#integration-catalog .integration-case').length===6);
  if(await page.locator('#integration-catalog .integration-case').count()!==integrationCatalog.cases.length||integrationCatalog.cases.length!==6)throw new Error('Integration evidence section did not render all six independent witnesses');
  if(await page.locator('#integration-catalog .integration-target').count()!==integrationCatalog.cases.length*3)throw new Error('Integration evidence matrix does not show the three baseline targets per witness');
  if(await page.locator('#integration-catalog .integration-status.format-readback').count()!==integrationCatalog.counts.formatReadbacks)throw new Error('PPTX XML format-readback outcomes differ from the integration catalogue');
  if(await page.locator('#integration-catalog .integration-status.planned').count()!==integrationCatalog.counts.plannedTargets||await page.locator('#integration-catalog .integration-status.refused').count()!==integrationCatalog.counts.refusedTargets)throw new Error('Planned-target or opaque-case refusal totals differ from the integration catalogue');
  const integrationNotice=(await page.locator('#integration-catalog .integration-release-state').innerText()).toLowerCase();
  if(!integrationNotice.includes('not complete')||!integrationNotice.includes('exact source'))throw new Error('Integration section overstates native-host coverage or omits source-scoped evidence');
  const hostProofs=page.locator('#integration-catalog article.integration-host-proof');
  const matchedProofs=integrationCatalog.hostConformance.filter(proof=>proof.matchedCaseId&&!proof.standalone);
  const standaloneProofs=integrationCatalog.hostConformance.filter(proof=>proof.standalone);
  if(await hostProofs.count()!==integrationCatalog.hostConformance.length)throw new Error('Native-host receipts were not all rendered as separately scoped evidence');
  if(await page.locator('#integration-catalog .integration-host-proof-list:not(.integration-standalone-proofs) article.integration-host-proof').count()!==matchedProofs.length)throw new Error('Source-matched native-host receipt count differs from the input evidence');
  if(await page.locator('#integration-catalog .integration-standalone-proofs article.integration-host-proof').count()!==standaloneProofs.length)throw new Error('Standalone native-host receipt count differs from the input evidence');
  for(const proof of matchedProofs){
    const sourceCase=integrationCatalog.cases.find(item=>item.id===proof.matchedCaseId);
    if(!sourceCase||proof.source?.sha256!==sourceCase.commonSha256)throw new Error(`Host receipt ${proof.id} does not match its declared common source`);
    const proofCard=page.locator('#integration-catalog article.integration-host-proof').filter({hasText:proof.source.sha256});
    if(await proofCard.count()!==1||!(await proofCard.innerText()).includes(proof.source.sha256))throw new Error(`Source-bound host proof ${proof.id} is not visibly scoped by source hash`);
  }
  const miroProof=page.locator('#integration-catalog .integration-standalone-proofs article.integration-host-proof').filter({hasText:'miro.editable-network/1'});
  if(await miroProof.count()!==1||!(await miroProof.innerText()).includes('Standalone proof'))throw new Error('Standalone Miro proof scope was not exposed separately from corpus cases');
  const opaqueCard=page.locator('#integration-catalog .integration-case').filter({hasText:'opaque-stencils'});
  if(await opaqueCard.count()!==1||await opaqueCard.locator('.integration-status.refused').count()!==3||await opaqueCard.locator('a[download]').count()!==1)throw new Error('Opaque native-only witness incorrectly generated target output or a common UMF download');
  const expectedPowerPointArtifacts=integrationCatalog.cases.filter(item=>item.targets?.powerpoint?.artifact).length;
  if(await page.locator('#integration-catalog a[href*=".pptx"]').count()!==expectedPowerPointArtifacts)throw new Error('Downloadable PPTX format artifacts differ from the input evidence');
  const integrationLinks=integrationCatalog.cases.flatMap(item=>[item.downloads.nativeWitness,...(item.downloads.commonDocument?[item.downloads.commonDocument]:[]),...(item.targets.powerpoint.artifact?[item.targets.powerpoint.artifact]:[])]);
  for(const artifact of integrationLinks)if(!(await Bun.file(join(siteRoot,artifact.path)).exists()))throw new Error(`Integration download is missing: ${artifact.path}`);
  exercised.push('six-case integration gallery, truthful target evidence, opaque refusal, and downloadable artifacts');
  const sixTargets=page.locator('#six-target-matrix .six-target-card');
  await page.waitForFunction(()=>document.querySelectorAll('#six-target-matrix .six-target-card').length===6);
  if(await sixTargets.count()!==6)throw new Error('Six-destination preview matrix did not render all targets');
  const processCase=integrationCatalog.cases.find(item=>item.id==='process-documents-store');
  if(!processCase||await page.locator('#six-target-case-select').inputValue()!=='process-documents-store')throw new Error('Six-target matrix did not default to the shared process/document/store source');
  for(const [rendererId] of [['dot'],['mermaid'],['lini'],['powerpoint'],['google-slides'],['miro']]){
    if(await page.locator(`#six-target-matrix .six-target-card[data-target="${rendererId}"]`).count()!==1)throw new Error(`Six-target matrix is missing ${rendererId}`);
  }
  for(const target of processCase.rendererTargets||[]){
    const card=page.locator(`#six-target-matrix .six-target-card[data-target="${target.rendererId}"]`);
    const expectedImage=target.preview?.state==='rendered'&&target.preview.sourceSha256===processCase.commonSha256&&target.preview.profileId===target.profileId&&target.preview.modelVersion===target.modelVersion&&target.preview.mappingVersion===target.mappingVersion&&Boolean(target.preview.inputArtifactSha256||target.preview.captureDigestSha256)&&Boolean(target.preview.asset?.sha256&&target.preview.asset?.mediaType&&target.preview.asset?.width>0&&target.preview.asset?.height>0);
    if(Boolean(await card.locator('.six-target-preview img').count())!==Boolean(expectedImage))throw new Error(`Six-target UI did not faithfully gate the ${target.rendererId} preview on its receipt`);
    if(expectedImage){
      const image=card.locator('.six-target-preview img');await image.scrollIntoViewIfNeeded();
      await image.evaluate(async element=>{const image=element as HTMLImageElement;await image.decode();if(image.naturalWidth<=0||image.naturalHeight<=0)throw new Error('Preview image decoded without dimensions');});
    }
  }
  for(const rendererId of ['dot','mermaid','lini','powerpoint','google-slides','miro']){
    const card=page.locator(`#six-target-matrix .six-target-card[data-target="${rendererId}"]`);
    if(!(await card.getByRole('heading',{level:3}).count()))throw new Error(`Six-target ${rendererId} card has no semantic heading`);
    if(!(await card.locator('.six-target-badge').textContent())?.trim())throw new Error(`Six-target ${rendererId} projection status is not visible`);
    if(!(await card.locator('.six-target-preview').textContent())?.trim()&&!(await card.locator('.six-target-preview img').count()))throw new Error(`Six-target ${rendererId} preview state is not exposed`);
  }
  exercised.push('six-destination coverage matrix and receipt-gated preview slots');
  await page.locator('#six-target-section').scrollIntoViewIfNeeded();
  await page.locator('#six-target-section').screenshot({path:'.cache/catalog-ui-six-targets.png'});
  const miroPreviewCase=integrationCatalog.cases.find(item=>(item.rendererTargets||[]).some((target:any)=>target.rendererId==='miro'&&target.preview?.state==='rendered'&&target.preview.asset?.mediaType==='image/jpeg'));
  if(!miroPreviewCase)throw new Error('No receipt-backed Miro JPEG preview is available for the six-target browser check');
  await page.locator('#six-target-case-select').selectOption(miroPreviewCase.id);
  const miroCard=page.locator('#six-target-matrix .six-target-card[data-target="miro"]'),miroImage=miroCard.locator('.six-target-preview img');
  if(await miroImage.count()!==1)throw new Error('Miro JPEG receipt was replaced by a placeholder instead of an image');
  await miroImage.scrollIntoViewIfNeeded();
  const miroDimensions=await miroImage.evaluate(async element=>{const image=element as HTMLImageElement;await image.decode();return {width:image.naturalWidth,height:image.naturalHeight,src:image.currentSrc,alt:image.alt};});
  const miroTarget=miroPreviewCase.rendererTargets.find((target:any)=>target.rendererId==='miro');
  if(miroTarget.preview.asset.mediaType!=='image/jpeg'||!miroTarget.preview.asset.path.toLowerCase().endsWith('.jpg')||miroDimensions.width<=0||miroDimensions.height<=0||!miroDimensions.alt.includes('Miro'))throw new Error('Miro preview did not decode as a JPEG with positive image dimensions');
  exercised.push('source-bound Miro JPEG preview decodes and displays as an image');
  await page.locator('#six-target-case-select').selectOption('process-documents-store');
  await page.setViewportSize({width:375,height:812});
  await page.locator('#six-target-section').scrollIntoViewIfNeeded();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Six-target matrix overflows the 375px mobile viewport');
  const mobileTargetCards=await page.locator('#six-target-matrix .six-target-card').evaluateAll(cards=>cards.map(card=>{const rect=card.getBoundingClientRect();return {width:rect.width,scrollWidth:(card as HTMLElement).scrollWidth,clientWidth:(card as HTMLElement).clientWidth};}));
  if(mobileTargetCards.some(card=>card.width>375||card.scrollWidth>card.clientWidth+1))throw new Error(`Six-target cards overflow their mobile column: ${JSON.stringify(mobileTargetCards)}`);
  const caseSelect=page.getByLabel('Integration example');
  await caseSelect.selectOption('network-16x24');
  if(await caseSelect.inputValue()!=='network-16x24'||await page.locator('#six-target-matrix .six-target-card').count()!==6)throw new Error('Mobile example selector did not retain all six destination cards');
  for(const image of await page.locator('#six-target-matrix .six-target-preview img').all()){
    await image.scrollIntoViewIfNeeded();await image.evaluate(async element=>{const image=element as HTMLImageElement;await image.decode();if(image.naturalWidth<=0||image.naturalHeight<=0)throw new Error('Mobile preview image decoded without dimensions');});
  }
  await page.locator('#six-target-section').scrollIntoViewIfNeeded();
  await page.locator('#six-target-section').screenshot({path:'.cache/catalog-ui-six-targets-mobile.png'});
  await caseSelect.selectOption('process-documents-store');
  exercised.push('six-target mobile matrix, visible status labels, accessible case selector and overflow checks');
  await page.setViewportSize({width:1440,height:1100});
  const count=await page.locator('.definition-card').count();
  if(count!==formExamples.length)throw new Error(`Expected ${formExamples.length} form example cards, saw ${count}`);
  if(await page.locator('.coverage-card').count()!==3)throw new Error('Expected coverage for all three targets');
  for(const [index,target]of TARGETS.entries()){
    const results=catalog.items.map(item=>item.targets[target]);
    const rendered=results.filter(result=>result.render?.ok).length;
    const losses=results.filter(result=>result.ok).reduce((sum,result)=>sum+result.diagnostics.filter((diagnostic:any)=>diagnostic.loss).length,0);
    const expected=`${rendered} native renders · ${losses} remaining loss reports across emitted samples`;
    if(await page.locator('.native-coverage').nth(index).innerText()!==expected)throw Error('Native progress counters differ from catalog for '+target);
    const ordinaryProfile=`umf.visual.${target}/1`;
    const capability=catalog.capabilities.find(entry=>entry.format===target&&entry.profile===ordinaryProfile);
    if(!capability)throw Error(`Ordinary renderer capability ${ordinaryProfile} is missing from the catalog`);
    const capabilitySummary=page.locator('.coverage-card').nth(index).locator('.capability-details summary');
    const summaryText=(await capabilitySummary.innerText()).trim();
    if(!summaryText.includes(ordinaryProfile)||!summaryText.includes(`v${capability.version}`))throw Error(`Coverage summary for ${target} selected the wrong profile or mapping version: ${summaryText}`);
  }
  exercised.push('native counts remain separate from losses and coverage summaries name exact ordinary profiles and mapping versions');
  const firstCardLabel=await page.locator('.definition-card').first().getAttribute('aria-label');
  if(!firstCardLabel?.includes('DOT')||!firstCardLabel.includes('Mermaid')||!firstCardLabel.includes('Lini'))throw new Error('Definition card accessible name omits one or more profile outcomes');
  await mkdir('.cache',{recursive:true});
  await page.screenshot({path:'.cache/catalog-ui-desktop.png'});
  exercised.push('desktop catalogue screenshot');

  const first=formExamples[0];
  await page.locator('#search').fill(first.id);
  if(await page.locator('.definition-card').count()!==1)throw new Error('Search did not isolate a definition by ID');
  await page.locator('.definition-card').click();
  await page.locator('#detail-dialog').waitFor({state:'visible'});
  const firstRelease=first.preferredRelease;
  if(new URL(page.url()).searchParams.get('target')!==(firstRelease?.format||'dot'))throw new Error('Opening a sample did not select its preferred native target');
  const firstPreferredVariant=firstRelease&&first.profileVariants?.find((variant:any)=>variant.format===firstRelease.format&&variant.profileId===firstRelease.profileId);
  if(firstPreferredVariant){
    if(new URL(page.url()).searchParams.get('profile')!==firstPreferredVariant.profileId)throw new Error('Opening a preferred annotation profile did not add its profile deep link');
    if(await page.locator('#profile-select').inputValue()!==firstPreferredVariant.profileId)throw new Error('Preferred profile was not selected in the annotation control');
    const diagram=page.locator('#target-panel .render-preview img');await diagram.waitFor({state:'visible'});
    await page.waitForFunction(()=>{const img=document.querySelector('#target-panel .render-preview img') as HTMLImageElement|null;return !!img&&img.complete&&img.naturalWidth>0&&img.naturalHeight>0});
    if(!(await page.locator('#target-panel').getByText('QUALIFIED ANNOTATION PROFILE · PREFERRED RELEASE').count()))throw new Error('Preferred profile was not explicitly distinguished from the baseline');
    await page.getByRole('tab',{name:'Complete annotated view'}).click();
    if(!(await page.locator('#target-panel').getByText(/Complete view: all readable native annotations are included/).count()))throw new Error('Complete annotation view was not described');
    const complete=page.locator('#target-panel .render-preview img');await page.waitForFunction(()=>{const img=document.querySelector('#target-panel .render-preview img') as HTMLImageElement|null;return !!img&&img.complete&&img.naturalWidth>0&&img.naturalHeight>0});
    if(!(await page.locator('#target-panel .profile-native-source').count()))throw new Error('Complete annotated source was not available');
    await page.locator('#target-panel .profile-coverage summary').click();
    if(!(await page.locator('#target-panel .profile-coverage tbody tr').count()))throw new Error('Annotated field coverage was not displayed');
    const completeBounds=await complete.evaluate(element=>{const rect=element.getBoundingClientRect();const parent=element.parentElement!.getBoundingClientRect();return {width:rect.width,height:rect.height,parentWidth:parent.width,parentHeight:parent.height}});
    if(completeBounds.width<=0||completeBounds.height<=0||completeBounds.width>completeBounds.parentWidth||completeBounds.height>completeBounds.parentHeight)throw new Error(`Complete native render is not scaled into its view: ${JSON.stringify(completeBounds)}`);
    await page.locator('#profile-select').selectOption('native');
    if(new URL(page.url()).searchParams.has('profile'))throw new Error('Native baseline selection retained the annotation profile URL parameter');
    if(new URL(page.url()).searchParams.get('view')!=='native')throw new Error('Explicit native baseline selection did not persist its view mode');
    if(!(await page.locator('#baseline-label').innerText()).includes('NATIVE BASELINE'))throw new Error('Native baseline tab is not distinguished from the annotation profile');
    exercised.push('preferred focused diagram, complete annotation view, coverage, native source and baseline access');
  }
  if(new URL(page.url()).searchParams.has('profile')&& !firstPreferredVariant)throw new Error('An unqualified target was mislabeled as an annotation profile');
  const sourceText=await page.locator('#umf-source').textContent();
  if(sourceText!==JSON.stringify(first.document,null,2))throw new Error('UMF definition source was not shown faithfully');
  await page.screenshot({path:'.cache/catalog-ui-detail.png'});
  await page.getByRole('tab',{name:'Mermaid'}).click();
  if(!new URL(page.url()).searchParams.has('id')||new URL(page.url()).searchParams.get('target')!=='mermaid')throw new Error('Target selection did not update the deep link');
  if(new URL(page.url()).searchParams.has('profile'))throw new Error('Native baseline target selection retained the optional profile parameter');
  if(await page.locator('#tab-mermaid').getAttribute('tabindex')!=='0'||await page.locator('#tab-dot').getAttribute('tabindex')!=='-1')throw new Error('Selected target tab did not receive the roving tab stop');
  await page.getByRole('tab',{name:'Lini'}).focus();
  await page.keyboard.press('ArrowRight');
  if(new URL(page.url()).searchParams.get('target')!=='dot')throw new Error('Arrow-key target navigation failed');
  if(await page.locator('#tab-dot').getAttribute('tabindex')!=='0')throw new Error('Keyboard target selection did not update the roving tab stop');
  await page.locator('#close-detail').click();
  await page.goto(`${baseUrl}?id=${encodeURIComponent(first.id)}&target=mermaid`);
  await page.locator('#detail-dialog').waitFor({state:'visible'});
  if(!(await page.getByRole('tab',{name:'Mermaid'}).getAttribute('aria-selected')==='true'))throw new Error('Initial deep link did not restore its selected target');
  if(new URL(page.url()).searchParams.get('view')!=='native')throw new Error('Unqualified target deep link did not resolve to native view');
  await page.locator('#close-detail').click();

  const mermaidProfile=formExamples.find(item=>item.profileVariants?.some((variant:any)=>variant.format==='mermaid'&&variant.result?.ok&&variant.diagramRender?.ok));
  if(mermaidProfile){
    const variant=mermaidProfile.profileVariants.find((candidate:any)=>candidate.format==='mermaid'&&candidate.result?.ok&&candidate.diagramRender?.ok);
    await page.goto(`${baseUrl}?id=${encodeURIComponent(mermaidProfile.id)}&target=mermaid&profile=${encodeURIComponent(variant.profileId)}&view=diagram`);
    await page.locator('#detail-dialog').waitFor({state:'visible'});
    if(await page.locator('#profile-select').inputValue()!==variant.profileId||new URL(page.url()).searchParams.get('profile')!==variant.profileId)throw new Error('Qualified Mermaid profile was not restored from its deep link');
    const image=page.locator('#target-panel .render-preview img');await image.waitFor({state:'visible'});
    await page.waitForFunction(()=>{const img=document.querySelector('#target-panel .render-preview img') as HTMLImageElement|null;return !!img&&img.complete&&img.naturalWidth>0&&img.naturalHeight>0});
    if(!(await page.locator('#target-panel').getByText(/mapping 0\.1\.0/).count()))throw new Error('Qualified Mermaid profile mapping version was not shown');
    await page.getByRole('tab',{name:'Complete annotated view'}).click();
    if(new URL(page.url()).searchParams.get('view')!=='complete')throw new Error('Mermaid complete-view intent was not persisted');
    await page.reload();await page.locator('#detail-dialog').waitFor({state:'visible'});
    if(new URL(page.url()).searchParams.get('profile')!==variant.profileId||new URL(page.url()).searchParams.get('view')!=='complete')throw new Error('Mermaid annotation profile and complete view did not survive reload');
    const sourceDetails=page.locator('#target-panel .profile-complete-source');await sourceDetails.locator('summary').click();
    const download=page.waitForEvent('download');await sourceDetails.getByRole('button',{name:'Download annotated source'}).click();
    if(!(await download).suggestedFilename().endsWith('.mmd'))throw new Error('Annotated Mermaid download used the wrong extension');
    exercised.push('qualified Mermaid annotation preview, exact profile/view deep link, and source download');
    await page.locator('#close-detail').click();
  }

  const dualProfile=formExamples.find(item=>item.profileVariants?.some((variant:any)=>variant.format==='dot'&&variant.result?.ok)&&item.profileVariants?.some((variant:any)=>variant.format==='lini'&&variant.result?.ok)&&!item.profileVariants?.some((variant:any)=>variant.format==='mermaid'&&variant.result?.ok));
  if(dualProfile){
    const dotVariant=dualProfile.profileVariants.find((variant:any)=>variant.format==='dot'),liniVariant=dualProfile.profileVariants.find((variant:any)=>variant.format==='lini');
    await page.goto(`${baseUrl}?id=${encodeURIComponent(dualProfile.id)}&target=dot&profile=${encodeURIComponent(dotVariant.profileId)}&view=complete`);
    await page.locator('#detail-dialog').waitFor({state:'visible'});
    if(new URL(page.url()).searchParams.get('view')!=='complete'||new URL(page.url()).searchParams.get('profile')!==dotVariant.profileId)throw new Error('Exact annotation deep link did not preserve its profile and complete view');
    await page.getByRole('tab',{name:'Lini'}).click();
    if(new URL(page.url()).searchParams.get('view')!=='complete'||new URL(page.url()).searchParams.get('profile')!==liniVariant.profileId)throw new Error('Target switch did not preserve qualified complete-view intent and select the target-compatible profile');
    await page.reload();await page.locator('#detail-dialog').waitFor({state:'visible'});
    if(new URL(page.url()).searchParams.get('view')!=='complete'||new URL(page.url()).searchParams.get('profile')!==liniVariant.profileId||await page.locator('#view-complete').getAttribute('aria-selected')!=='true')throw new Error('Reload did not restore the qualified profile and complete view');
    await page.getByRole('tab',{name:'Mermaid'}).click();
    if(new URL(page.url()).searchParams.get('view')!=='complete'||new URL(page.url()).searchParams.has('profile'))throw new Error('Missing qualified target hid explicit annotation-view intent');
    if(!(await page.locator('#target-panel').getByText(/Qualified annotation view.*unavailable/i).count())||!(await page.locator('#target-panel').getByRole('button',{name:'Switch to Mermaid native baseline'}).count()))throw new Error('Missing qualified target silently fell back instead of offering an explicit baseline switch');
    await page.getByRole('button',{name:'Switch to Mermaid native baseline'}).click();
    if(new URL(page.url()).searchParams.get('view')!=='native'||!(await page.locator('#baseline-label').innerText()).includes('NATIVE BASELINE'))throw new Error('Explicit switch to baseline did not change the target view mode');
    await page.getByRole('tab',{name:'Lini'}).click();
    if(new URL(page.url()).searchParams.get('view')!=='native'||new URL(page.url()).searchParams.has('profile'))throw new Error('Baseline mode was not preserved across subsequent target changes');
    exercised.push('native/qualified target-mode consistency, unavailable qualified state, and view deep-link restoration');
    await page.locator('#close-detail').click();
  }

  const renamedCanary=catalog.items.find(item=>item.origin==='canary'&&item.sourcePath.endsWith('/canary-supported-flow.json'));
  if(renamedCanary){
    const legacyId='visual-canary-supported-flow';
    if(renamedCanary.id===legacyId)throw new Error('Canary identifier unexpectedly matches the legacy alias');
    await page.goto(`${baseUrl}?id=${legacyId}&target=dot`);
    await page.locator('#detail-dialog').waitFor({state:'visible'});
    if(new URL(page.url()).searchParams.get('id')!==renamedCanary.id)throw new Error('Legacy sample deep link did not canonicalize to the current ID');
    const canaryImage=page.locator('#target-panel .render-preview img');
    await canaryImage.waitFor({state:'visible'});
    await page.waitForFunction(()=>{const img=document.querySelector('#target-panel .render-preview img') as HTMLImageElement|null;return !!img&&img.complete&&img.naturalWidth>0&&img.naturalHeight>0});
    exercised.push('legacy sample deep link resolves to current ID and native SVG');
    await page.locator('#close-detail').click();
  }

  const targetLabel=page.locator('#target-filters').getByLabel('mermaid');
  await targetLabel.check();
  const targetStatus=await page.locator('.status-cell').first().textContent();
  if(!['MER OK','MER LOSS','MER NO','MER —'].includes(targetStatus||''))throw new Error('Target filter did not scope the visible result status strip');
  const statusLabel=page.locator('#status-filters').getByLabel('Unsupported');
  await statusLabel.check();
  const unsupportedForTarget=formExamples.filter(item=>item.targets.mermaid?.status==='unsupported').length;
  if(await page.locator('.definition-card').count()!==unsupportedForTarget)throw new Error('Target plus status filters returned an unexpected set');
  await page.locator('#reset-filters').click();
  if(await page.locator('.definition-card').count()!==formExamples.length)throw new Error('Reset button did not restore form examples');
  await page.locator('#secondary-gallery-summary').click();
  await page.waitForFunction(expected=>document.querySelectorAll('.definition-card').length===expected,catalog.items.length);
  if(await page.locator('.definition-card').count()!==catalog.items.length)throw new Error('Secondary gallery did not include all sample instances');
  const scopeNote=await page.locator('#sample-scope-note').innerText();
  if(!scopeNote.includes(`${formExamples.length} form fixture examples`)||!scopeNote.includes(`${applicationCount} application samples`)||!scopeNote.includes(`${canaryCount} canary samples`)||applicationCount+canaryCount!==secondaryCount)throw new Error('Gallery did not clearly count form examples and secondary samples');
  await page.locator('#secondary-gallery-summary').click();
  await page.waitForFunction(expected=>document.querySelectorAll('.definition-card').length===expected,formExamples.length);
  if(await page.locator('.definition-card').count()!==formExamples.length)throw new Error('Closing secondary gallery did not restore the primary example scope');
  if(!(await page.locator('.status-cell').first().getAttribute('aria-label'))||!(await page.locator('.status-cell').first().textContent()))throw new Error('Target status matrix lacks a visible or accessible status label');
  exercised.push('target/status and origin filters','visible accessible profile status matrix');

  const loss=catalog.items.find(item=>Object.values(item.targets).some((target:any)=>target.status==='reported-loss'));
  if(loss){const target=Object.entries(loss.targets).find(([,result]:any)=>result.status==='reported-loss')![0];await page.goto(`${baseUrl}?id=${encodeURIComponent(loss.id)}&target=${target}`);await page.locator('#detail-dialog').waitFor({state:'visible'});if(!(await page.locator('#target-panel').getByText('Reported loss').count()))throw new Error('Reported-loss status was not made explicit');exercised.push('reported-loss display');}
  const unsupported=catalog.items.find(item=>Object.values(item.targets).some((target:any)=>target.status==='unsupported'));
  if(unsupported){const target=Object.entries(unsupported.targets).find(([,result]:any)=>result.status==='unsupported')![0];await page.goto(`${baseUrl}?id=${encodeURIComponent(unsupported.id)}&target=${target}`);await page.locator('#detail-dialog').waitFor({state:'visible'});if(!(await page.locator('#target-panel').getByText('Unsupported').count()))throw new Error('Unsupported status was not made explicit');exercised.push('unsupported profile display');}
  const renderFailure=catalog.items.find(item=>TARGETS.some(target=>item.targets[target]?.render&&!item.targets[target].render.ok&&item.targets[target].render.error));
  if(renderFailure){const target=TARGETS.find(key=>renderFailure.targets[key]?.render&&!renderFailure.targets[key].render.ok&&renderFailure.targets[key].render.error)!;await page.goto(`${baseUrl}?id=${encodeURIComponent(renderFailure.id)}&target=${target}`);await page.locator('#detail-dialog').waitFor({state:'visible'});if(!(await page.locator('#target-panel').getByText(/Native render unavailable:/).count()))throw new Error('Native render failure details were hidden');if(!(await page.locator('#target-panel').getByText(/Renderer/).count()))throw new Error('Native renderer version was hidden on failure');exercised.push('native render failure and version display');}
  const rendered=catalog.items.find(item=>TARGETS.some(target=>item.targets[target]?.render?.ok&&item.targets[target]?.render?.svgPath));
  if(rendered){
    const target=TARGETS.find(key=>rendered.targets[key]?.render?.ok&&rendered.targets[key]?.render?.svgPath)!;
    await page.goto(`${baseUrl}?id=${encodeURIComponent(rendered.id)}&target=${target}`);
    const image=page.locator('.render-preview img');await image.waitFor({state:'visible'});await page.waitForFunction(()=>{const img=document.querySelector('.render-preview img') as HTMLImageElement|null;return !!img&&img.complete&&img.naturalWidth>0&&img.naturalHeight>0});
    const previewBounds=await image.evaluate(element=>{const rect=element.getBoundingClientRect();const parent=element.parentElement!.getBoundingClientRect();return {image:{width:rect.width,height:rect.height},container:{width:parent.width,height:parent.height}}});
    if(previewBounds.image.width<=0||previewBounds.image.height<=0||previewBounds.image.width>previewBounds.container.width||previewBounds.image.height>previewBounds.container.height)throw new Error(`Inline render preview did not scale into its container: ${JSON.stringify(previewBounds)}`);
    await page.screenshot({path:'.cache/catalog-ui-render.png'});
    exercised.push('native SVG detail render loads and scales within preview');
    const svgUrl=new URL(rendered.targets[target].render.svgPath,baseUrl);if(rendered.targets[target].render.svgSha256)svgUrl.searchParams.set('v',rendered.targets[target].render.svgSha256);
    await page.route(svgUrl.href,route=>route.fulfill({status:404,body:'missing render fixture'}));
    await page.reload();await page.locator('.render-preview .render-error').waitFor({state:'visible'});
    await page.unroute(svgUrl.href);
    exercised.push('broken SVG asset shows an explicit error');
  }

  await page.goto(baseUrl);
  await page.locator('#search').fill('no-such-umf-definition-should-exist');
  if(!(await page.locator('#empty-state').isVisible()))throw new Error('Search empty state was not displayed');
  await page.locator('#empty-reset').click();
  if(await page.locator('.definition-card').count()!==formExamples.length)throw new Error('Clear filters did not restore form examples');
  exercised.push('empty state and clear filters');
  const sourceExample=catalog.items.find(item=>TARGETS.some(target=>typeof item.targets[target]?.source==='string'));
  if(sourceExample){
    const target=TARGETS.find(key=>typeof sourceExample.targets[key]?.source==='string')!;
    await page.goto(`${baseUrl}?id=${encodeURIComponent(sourceExample.id)}&target=${target}`);await page.locator('#detail-dialog').waitFor({state:'visible'});
    const downloadSource=page.waitForEvent('download');await page.getByRole('button',{name:'Download source'}).click();const sourceDownload=await downloadSource;
    if(!sourceDownload.suggestedFilename().endsWith(target==='mermaid'?'.mmd':target==='dot'?'.dot':'.lini'))throw new Error('Native source download used the wrong extension');
    const downloadUmf=page.waitForEvent('download');await page.getByRole('button',{name:'Download',exact:true}).click();if(!(await downloadUmf).suggestedFilename().endsWith('.json'))throw new Error('UMF JSON download was unavailable');
    exercised.push('native source and UMF JSON downloads');
  }
  await page.route('https://umf.local/catalog.json',route=>route.fulfill({status:404,body:'catalog missing'}));
  await page.goto(baseUrl);await page.locator('#load-error').waitFor({state:'visible'});
  await page.unroute('https://umf.local/catalog.json');
  exercised.push('catalog fetch failure state');
  await page.goto(baseUrl);
  await page.waitForFunction(()=>((document.querySelector('#definition-list')?.children.length??0)>0));
  await page.setViewportSize({width:375,height:812});
  const pageWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
  if(pageWidth>375)throw new Error(`Integration page overflows a 375px mobile viewport (${pageWidth}px)`);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'.cache/catalog-ui-mobile.png'});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  if(overflow)throw new Error('Mobile layout has horizontal page overflow');
  exercised.push('375px mobile layout');

  const testRender=catalog.items.flatMap(item=>TARGETS.map(target=>item.targets[target]?.render)).find(render=>render?.ok&&render.svgPath);
  if(testRender){
    const mockData=structuredClone(integrationCatalog);const mockCase=mockData.cases.find((item:any)=>item.id==='process-documents-store');
    const testAsset=mockCase.rendererTargets.find((target:any)=>target.rendererId==='dot')?.preview?.asset;if(!testAsset)throw new Error('No receipt-matched integration preview asset is available for the UI contract probe.');
    const mockTarget={rendererId:'dot',profileId:'synthetic.dot/1',modelVersion:'1.0.0',mappingVersion:'synthetic-map/1',projection:{state:'emitted',status:'reported-loss',diagnostics:[{code:'SIX_TARGET_TEST',message:'Synthetic UI contract probe'}],losses:[{path:'/extensions/umf.visual/nodes/0/role',representation:'retained-only'}]},preview:{state:'rendered',engine:'Graphviz',nativeVersion:'test-engine',sourceSha256:mockCase.commonSha256,profileId:'synthetic.dot/1',modelVersion:'1.0.0',mappingVersion:'synthetic-map/1',inputArtifactSha256:'a'.repeat(64),stage:'native-render',asset:testAsset},roundTrip:{state:'planned',stage:'UI test only',reason:'Synthetic browser test receipt'},artifacts:[{label:'test source package',path:mockCase.downloads.commonDocument.path,sha256:mockCase.downloads.commonDocument.sha256},testAsset]};
    mockCase.rendererTargets=[mockTarget];
    await page.route('https://umf.local/integrations.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(mockData)}));
    await page.goto(baseUrl,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelectorAll('#six-target-matrix .six-target-card').length===6);
    const dotCard=page.locator('#six-target-matrix .six-target-card[data-target="dot"]');
    if(await dotCard.locator('.six-target-preview img').count()!==1||!(await dotCard.innerText()).includes('Graphviz test-engine')||!(await dotCard.innerText()).includes('reported-loss')||!(await dotCard.getByRole('link',{name:'Download test source package'}).count())||!(await dotCard.getByRole('link',{name:'Download rendered preview (SVG)'}).count()))throw new Error('Receipt-matched renderer, actual loss, or distinct named artifacts were not shown together');
    await dotCard.locator('.six-target-details summary').filter({hasText:'Projection losses'}).click();
    if(!(await dotCard.getByText('/extensions/umf.visual/nodes/0/role').count()))throw new Error('Raw six-target losses were suppressed');
    mockTarget.preview.sourceSha256='0'.repeat(64);
    await page.unroute('https://umf.local/integrations.json');
    await page.route('https://umf.local/integrations.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(mockData)}));
    await page.goto(baseUrl,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelectorAll('#six-target-matrix .six-target-card').length===6);
    const mismatchCard=page.locator('#six-target-matrix .six-target-card[data-target="dot"]');
    if(await mismatchCard.locator('.six-target-preview img').count()!==0||!(await mismatchCard.getByText(/Render withheld: receipt does not match the exact source/).count()))throw new Error('A preview with a mismatched source hash was not withheld');
    await page.unroute('https://umf.local/integrations.json');
    exercised.push('exact-source preview verification, raw loss inspection, and artifact link contract');
  }
  const receipt={ok:true,language:{kinds:catalog.language.forms.kinds.length,forms:formCount},examples:{formFixtures:formExamples.length,secondaryInstances:secondaryCount,totalInstances:catalog.items.length},checks:['schema-backed language reference','all form examples and sample coverage profiles load','search by ID','UMF example JSON source fidelity','deep-link target selection and restoration','keyboard target navigation and roving tab stop',...exercised],screenshots:['.cache/catalog-ui-desktop.png','.cache/catalog-ui-detail.png','.cache/catalog-ui-render.png','.cache/catalog-ui-mobile.png','.cache/catalog-ui-six-targets.png','.cache/catalog-ui-six-targets-mobile.png'],browser:browser.version(),errors};
  await Bun.write('.cache/catalog-ui-browser.json',JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt));
  if(errors.length)throw new Error(`Browser reported page errors: ${errors.join('; ')}`);
}finally{await browser.close();}

