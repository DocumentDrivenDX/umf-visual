// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,describe,expect,it} from 'bun:test';
import {chromium,type Browser,type Page} from 'playwright';
import {createVisualDocument,getVisual,readVisualDocument} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyLiniPresentationQuality} from '../../scripts/presentation/lini-quality';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';

let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});
const required=['lini-rich-native-semantics','lini-rich-svg-ownership-geometry','lini-rich-typography'];
const requiredSequence=[required[0]!,'lini-rich-caption-clearance',required[1]!,required[2]!];
const names=(checks:Awaited<ReturnType<typeof verifyLiniPresentationQuality>>)=>checks.map(check=>check.check);
const status=(checks:Awaited<ReturnType<typeof verifyLiniPresentationQuality>>,name:string)=>checks.find(check=>check.check===name)?.result;
const root=import.meta.dir+'/../..';
async function renderDocument(document:ReturnType<typeof readVisualDocument>,direction:'LR'|'TB'='LR'){
 const plan=compilePresentation(document,{backend:'lini',theme:'presentation/1',direction});expect(plan.ok,`${document.id} must compile`).toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan));
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900}});
 await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:#fff}#frame{width:1600px;height:900px}#frame svg{width:100%;height:100%}</style><div id="frame"></div>',{waitUntil:'domcontentloaded'});
 await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},native.svg);
 const checks=await verifyLiniPresentationQuality(page,{document,plan,nativeAst:native.nativeAst});return{document,plan,page,nativeAst:native.nativeAst,svg:native.svg,checks};
}
async function render(id:string){
 const document=readVisualDocument(await Bun.file(`${root}/fixtures/showcase/definitions/${id}.json`).text(),'json');
 return renderDocument(document);
}
async function recheck(page:Page,document:Awaited<ReturnType<typeof render>>['document'],plan:PresentationPlan,nativeAst:unknown){return verifyLiniPresentationQuality(page,{document,plan,nativeAst});}
function expectPass(checks:Awaited<ReturnType<typeof verifyLiniPresentationQuality>>,sequence=false){expect([...names(checks)].sort()).toEqual([...(sequence?requiredSequence:required)].sort());const failed=checks.filter(check=>check.result!=='pass');if(failed.length)throw Error(JSON.stringify(failed));}

type CheckoutSource={extensions:{'umf.visual':{groups:Array<{id:string;label:string;role:string}>;sequence:{participants:Array<{id:string;label:string;role:string;shape?:string;icon?:string}>;messages:Array<{id:string;from:string;to:string;label:string;kind:string;group?:string}>;notes:Array<{id:string;text:string;participants:string[];before?:string;after?:string}>}}};};
async function renamedThreeParticipantDocument(){
 const source=JSON.parse(await Bun.file(`${root}/fixtures/showcase/definitions/lini-gallery-checkout-sequence.json`).text()) as CheckoutSource,visual=source.extensions['umf.visual'],sequence=visual.sequence,renamed=(id:string)=>'renamed-'+id,groupIds=new Map(visual.groups.map(group=>[group.id,renamed(group.id)]));
 sequence.participants.splice(sequence.participants.findIndex(participant=>participant.id==='db'),1);
 const archive=sequence.participants.find(participant=>participant.id==='pay')!;archive.label='Archive';archive.role='document';archive.shape='folded-corner';
 for(const message of sequence.messages){if(message.from==='db')message.from='pay';if(message.to==='db')message.to='pay';}
 for(const participant of sequence.participants)participant.id=renamed(participant.id);
 for(const message of sequence.messages){message.id=renamed(message.id);message.from=renamed(message.from);message.to=renamed(message.to);if(message.group)message.group=groupIds.get(message.group)!;}
 for(const note of sequence.notes){note.id=renamed(note.id);note.participants=note.participants.map(renamed);if(note.before)note.before=renamed(note.before);if(note.after)note.after=renamed(note.after);}
 for(const group of visual.groups)group.id=groupIds.get(group.id)!;
 sequence.notes.push({id:'renamed-after-note',text:'after handoff',participants:['renamed-pay'],after:'renamed-track-parcel'});
 return readVisualDocument(JSON.stringify(source),'json');
}

describe('pinned Lini rich layouts',()=>{
 it('renders a source-ordered Visual 1.0 tree when layout is omitted',async()=>{
  const document=readVisualDocument(await Bun.file(`${root}/fixtures/visual/forms/umf-extensions.json`).text(),'json');
  const visual=getVisual(document);
  expect(visual.layout).toBeUndefined();
  const good=await renderDocument(document);
  try{
   expectPass(good.checks);
   expect(good.plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(9);
   expect(good.plan.elementMap.filter(item=>item.kind==='visual')).toHaveLength(1);
   expect(good.plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(0);
   expect(good.nativeAst.match(/n1\.n[2-9]:left/gu)).toHaveLength(8);
   const sourceOrder=(visual.nodes??[]).map(node=>node.label),nativeOrder=await good.page.locator('g.lini-node.lini-topic > text.lini-text').allTextContents();
   expect(nativeOrder).toEqual(sourceOrder);
   const titleCell=good.page.locator('g.lini-node[data-id="n1"] > g.lini-node.lini-cell[data-id="visual-title"]');
   expect(await titleCell.locator('text.lini-text').textContent()).toBe("umf's extensions");
   expect(await titleCell.boundingBox()).not.toBeNull();
   const omittedQuestion=good.plan.omissions.find(item=>item.sourcePath==='/extensions/umf.visual/question');
   expect(omittedQuestion?.reason).toContain('reader question remains in UMF');
   const missingRelationship=good.nativeAst.replace('n1.n8:left & n1.n9:left','n1.n8:left & n1.n8:left');
   expect(status(await recheck(good.page,document,good.plan,missingRelationship),'lini-rich-native-semantics')).toBe('fail');
   const topDown=await renderDocument(document,'TB');
   try{
    expectPass(topDown.checks);expect(topDown.plan.source).toContain('layout: tree; direction: column; gap: 120;');
    expect(await topDown.page.locator('g.lini-node.lini-topic > text.lini-text').allTextContents()).toEqual(sourceOrder);
   }finally{await topDown.page.close();}
  }finally{await good.page.close();}
 },{timeout:30_000});

 it('checks native declaration order within each parent instead of global preorder',async()=>{
  const document=createVisualDocument({id:'tree-non-preorder',kind:'structure',form:'tree',question:'Which branch is nested?',nodes:[
   {id:'root',label:'Root'},
   {id:'first',label:'First child',parent:'root'},
   {id:'second',label:'Second child',parent:'root'},
   {id:'nested',label:'Nested child',parent:'first'},
  ]},'test:tree-non-preorder','1.4.0');
  const good=await renderDocument(document);
  try{
   expectPass(good.checks);
   expect(good.nativeAst.indexOf('|block#n2|')).toBeLessThan(good.nativeAst.indexOf('|block#n4|'));
   expect(good.nativeAst.indexOf('|block#n4|')).toBeLessThan(good.nativeAst.indexOf('|block#n3|'));
  }finally{await good.page.close();}
 },{timeout:30_000});

 it('uses TB sibling geometry and rejects horizontally swapped SVG siblings',async()=>{
  const document=createVisualDocument({id:'tree-tb-sibling-order',kind:'structure',form:'tree',question:'Which order is shown?',layout:{kind:'tree',direction:'TB'},nodes:[
   {id:'root',label:'Root'},
   {id:'first',label:'First child',parent:'root'},
   {id:'second',label:'Second child',parent:'root'},
   {id:'third',label:'Third child',parent:'root'},
  ]},'test:tree-tb-sibling-order','1.4.0');
  const good=await renderDocument(document,'LR');
  try{
   expectPass(good.checks);expect(good.plan.source).toContain('direction: column;');
   const first=good.page.locator('g.lini-node[data-id="n2"]'),second=good.page.locator('g.lini-node[data-id="n3"]');
   const firstTransform=await first.getAttribute('transform'),secondTransform=await second.getAttribute('transform');
   expect(firstTransform).not.toBeNull();expect(secondTransform).not.toBeNull();
   await first.evaluate((node,transform)=>node.setAttribute('transform',transform??''),secondTransform);
   await second.evaluate((node,transform)=>node.setAttribute('transform',transform??''),firstTransform);
   const swapped=await recheck(good.page,document,good.plan,good.nativeAst),geometry=swapped.find(check=>check.check==='lini-rich-svg-ownership-geometry');
   expect(geometry?.result).toBe('fail');expect(geometry?.details).toContain('left-to-right order');
  }finally{await good.page.close();}
 },{timeout:30_000});

 it('proves the ladder adaptation, exact participant metadata cells, and native title margins',async()=>{
  const document=readVisualDocument(await Bun.file(`${root}/fixtures/visual/forms/helix-request-ladder.json`).text(),'json'),good=await renderDocument(document);
  try{
   expectPass(good.checks,true);expect(good.plan.elementMap.filter(item=>item.kind==='participant')).toHaveLength(6);expect(good.plan.elementMap.filter(item=>item.kind==='participant-field')).toHaveLength(18);expect(good.plan.elementMap.filter(item=>item.kind==='message')).toHaveLength(6);
   expect(good.plan.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/form'&&item.representation.includes('lifelines adaptation'))).toBe(true);
   const undisclosedPlan={...good.plan,approximations:good.plan.approximations.map(item=>item.sourcePath==='/extensions/umf.visual/form'?{...item,representation:'The ladder layout is drawn natively.'}:item)};
   expect(status(await recheck(good.page,good.document,undisclosedPlan,good.nativeAst),'lini-rich-native-semantics')).toBe('fail');
   expectPass(good.checks,true);
   for(const item of good.plan.elementMap.filter(item=>item.kind==='participant-field'))expect(item.sourcePath).toMatch(/^\/extensions\/umf\.visual\/sequence\/participants\/\d+\/(detail|role|status)$/u);
   const title=await good.page.locator('g.lini-node[data-id="visual-title"]').boundingBox(),svg=await good.page.locator('#frame svg').boundingBox();expect(title).not.toBeNull();expect(svg).not.toBeNull();if(title&&svg){expect(title.x-svg.x).toBeGreaterThanOrEqual(2);expect(title.y-svg.y).toBeGreaterThanOrEqual(2);expect(svg.x+svg.width-title.x-title.width).toBeGreaterThanOrEqual(2);expect(svg.y+svg.height-title.y-title.height).toBeGreaterThanOrEqual(2);}
   const statusCell=good.page.locator('g.lini-node[data-id="p1-status"]');expect(await statusCell.locator('text.lini-text').textContent()).toBe('Status: built');
   await statusCell.locator('text.lini-text').evaluate(element=>{element.textContent='Status: pending';});expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-svg-ownership-geometry')).toBe('fail');
   await statusCell.locator('text.lini-text').evaluate(element=>{element.textContent='Status: built';});
   const statusMarkup=await statusCell.evaluate(element=>element.outerHTML);await statusCell.evaluate(element=>element.remove());await good.page.locator('g.lini-node[data-id="p2-owner"]').evaluate((element,markup)=>element.insertAdjacentHTML('beforeend',markup),statusMarkup);
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-svg-ownership-geometry')).toBe('fail');
   const movedCell=good.page.locator('g.lini-node[data-id="p2-owner"] > g.lini-node[data-id="p1-status"]');await movedCell.evaluate(element=>element.remove());await good.page.locator('g.lini-node[data-id="p1-owner"]').evaluate((element,markup)=>element.insertAdjacentHTML('beforeend',markup),statusMarkup);
   const changedSource=good.nativeAst.replace('"sets intent"','"changes intent"');expect(changedSource).not.toBe(good.nativeAst);expect(status(await recheck(good.page,good.document,good.plan,changedSource),'lini-rich-native-semantics')).toBe('fail');
   const sequence=good.page.locator('g.lini-node[data-id="sequence-drawing"]');await sequence.evaluate(element=>{const bar=element.ownerDocument.createElementNS('http://www.w3.org/2000/svg','rect');bar.setAttribute('width','10');bar.setAttribute('height','80');element.appendChild(bar);});expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-svg-ownership-geometry')).toBe('fail');await sequence.locator(':scope > rect').last().evaluate(element=>element.remove());expectPass(await recheck(good.page,good.document,good.plan,good.nativeAst),true);
  }finally{await good.page.close();}
 },{timeout:30_000});

 it('renders and owns the sequence process role caption',async()=>{
  const document=createVisualDocument({id:'sequence-process-role',kind:'sequence',form:'lifelines',question:'Which activity is depicted?',sequence:{participants:[{id:'activity',label:'Reconcile records',detail:'Apply authored rules',role:'process'},{id:'shop',label:'Storefront',role:'own'},{id:'pay',label:'Payments',role:'platform'},{id:'store',label:'Records',role:'store',shape:'parallelogram'}],messages:[{id:'place',from:'activity',to:'shop',label:'place order',kind:'call'},{id:'charge',from:'shop',to:'pay',label:'charge amount',kind:'call'},{id:'verify',from:'pay',to:'pay',label:'verify card',kind:'call'},{id:'receipt',from:'pay',to:'shop',label:'receipt',kind:'return'},{id:'write',from:'shop',to:'store',label:'write order',kind:'call'},{id:'stored',from:'store',to:'shop',label:'stored',kind:'return'},{id:'finish',from:'shop',to:'activity',label:'order accepted',kind:'return'},{id:'track',from:'activity',to:'shop',label:'track order',kind:'async'}]}},'test:sequence-process-role','1.4.0');
  const plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)return;
  expect(plan.source).toContain('|rect#p1-role| "Process"');
  expect(plan.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/sequence/participants/0/role'&&item.representation.includes('depicted process/activity'))).toBe(true);
  const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900}});
  await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:#fff}#frame{width:1600px;height:900px}#frame svg{width:100%;height:100%}</style><div id="frame"></div>',{waitUntil:'domcontentloaded'});
  await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},native.svg);
  try{
   const checks=await verifyLiniPresentationQuality(page,{document,plan,nativeAst:native.nativeAst});expectPass(checks,true);
   const caption=page.locator('g.lini-node[data-id="p1-role"] > text.lini-text');
   expect(await caption.textContent()).toBe('Process');
   await caption.evaluate(element=>{element.textContent='Activity';});
   expect(status(await recheck(page,document,plan,native.nativeAst),'lini-rich-svg-ownership-geometry')).toBe('fail');
  }finally{await page.close();}
 },{timeout:30_000});

 it('keeps sequence document stencils visible when the note selector is reserved for annotations',async()=>{
  const document=createVisualDocument({id:'sequence-document-shapes',kind:'sequence',form:'lifelines',question:'Which documents are shown?',sequence:{participants:[
   {id:'activity',label:'Process',role:'process'},
   {id:'document',label:'Document',role:'document',shape:'document'},
   {id:'documents',label:'Multiple documents',shape:'multiple-documents'},
   {id:'folded',label:'Folded corner',shape:'folded-corner'},
  ],messages:[{id:'read',from:'activity',to:'document',label:'reads',kind:'call'},{id:'store',from:'activity',to:'documents',label:'stores',kind:'call'},{id:'open',from:'activity',to:'folded',label:'opens',kind:'call'}]}},'test:sequence-document-shapes','1.4.0');
  const plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)return;
  expect(plan.source).toContain('|box#p2| "Document\\n(requested shape:\\ndocument)"');expect(plan.source).toContain('|box#p3| "Multiple documents\\n(requested shape:\\nmultiple-documents)"');expect(plan.source).toContain('|box#p4| "Folded corner\\n(requested shape:\\nfolded-corner)"');expect(plan.source).toContain('multiple: 2;');
  const processLine=plan.source.split('\n').find(line=>line.includes('|box#p1|'))??'';expect(processLine.match(/\bProcess\b/gu)).toHaveLength(1);expect(processLine).not.toContain('|cell#role|');
  expect(plan.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/sequence/participants/2/shape'&&/does not assert document count/i.test(item.representation))).toBe(true);
  const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900}});
  await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:#fff}#frame{width:1600px;height:900px}#frame svg{width:100%;height:100%}</style><div id="frame"></div>');
  await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},native.svg);
  try{
   const checks=await verifyLiniPresentationQuality(page,{document,plan,nativeAst:native.nativeAst});expectPass(checks,true);
   const multi=page.locator('g.lini-node[data-id="p3"]'),backing=multi.locator(':scope > g:not(.lini-node)').first();expect(await backing.locator('rect').count()).toBeGreaterThan(0);
   const beforeTransform=await backing.getAttribute('transform'),outsideOwnerTransform='translate(250,-150)';expect(beforeTransform).not.toBe(outsideOwnerTransform);
   await backing.evaluate((group,value)=>group.setAttribute('transform',value),outsideOwnerTransform);
   expect(status(await verifyLiniPresentationQuality(page,{document,plan,nativeAst:native.nativeAst}),'lini-rich-svg-ownership-geometry')).toBe('fail');
  }finally{await page.close();}
 },{timeout:30_000});

 it('proves the 4-participant, 8-message checkout sequence in native syntax and SVG geometry',async()=>{
  const good=await render('lini-gallery-checkout-sequence');
  try{
   expectPass(good.checks,true);
   expect(good.plan.elementMap.filter(item=>item.kind==='message')).toHaveLength(8);
   expect(good.plan.elementMap.filter(item=>item.kind==='note')).toHaveLength(1);
   const expectClean=async()=>expectPass(await recheck(good.page,good.document,good.plan,good.nativeAst),true);
   expect(await good.page.locator('g.lini-node[data-id="message1"] line').count()).toBe(1);
   expect(await good.page.locator('g.lini-node[data-id="p1-icon"] circle').count()).toBe(1);
   await expectClean();
   const wrongEndpoint=good.nativeAst.replace('points: 0 0, 220 0; marker-end: arrow','points: 0 0, 190 0; marker-end: arrow');expect(wrongEndpoint).not.toBe(good.nativeAst);
   expect(status(await recheck(good.page,good.document,good.plan,wrongEndpoint),'lini-rich-native-semantics')).toBe('fail');
   await expectClean();
   const wrongLabel=good.nativeAst.replace('charge $42','charge 42');expect(wrongLabel).not.toBe(good.nativeAst);
   expect(status(await recheck(good.page,good.document,good.plan,wrongLabel),'lini-rich-native-semantics')).toBe('fail');
   await expectClean();
   const wrongReturn=good.nativeAst.replace('translate: 110 28; points: 0 0, -220 0; marker-end: arrow; stroke: --gray-deep; stroke-width: 2; stroke-style: dashed','translate: 110 28; points: 0 0, -220 0; marker-end: arrow; stroke: --gray-deep; stroke-width: 2; stroke-style: solid');expect(wrongReturn).not.toBe(good.nativeAst);
   expect(status(await recheck(good.page,good.document,good.plan,wrongReturn),'lini-rich-native-semantics')).toBe('fail');
   await expectClean();
   const badSelfReturn=good.nativeAst.replace('80 36, 0 36','80 36, 1 36');expect(badSelfReturn).not.toBe(good.nativeAst);
   expect(status(await recheck(good.page,good.document,good.plan,badSelfReturn),'lini-rich-native-semantics')).toBe('fail');
   await expectClean();
   const noteSource=good.nativeAst.replace('translate: -330 -219; width: 160; height: 40','translate: -330 -100; width: 160; height: 40');expect(noteSource).not.toBe(good.nativeAst);
   expect(status(await recheck(good.page,good.document,good.plan,noteSource),'lini-rich-native-semantics')).toBe('fail');
   await expectClean();
   const caption=good.page.locator('g.lini-node[data-id="message-caption1"]'),captionTransform=await caption.getAttribute('transform');
   expect(captionTransform).toBeTruthy();await caption.evaluate(element=>element.setAttribute('transform','translate(110,-179)'));
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-caption-clearance')).toBe('fail');
   await caption.evaluate((element,value)=>element.setAttribute('transform',value??''),captionTransform);
   await expectClean();
   const lifeline=good.page.locator('g.lini-node[data-id="p3-lifeline"]'),lifelineTransform=await lifeline.getAttribute('transform');
   expect(lifelineTransform).toBeTruthy();await lifeline.evaluate(element=>element.setAttribute('transform','translate(-220,-244)'));
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-caption-clearance')).toBe('fail');
   await lifeline.evaluate((element,value)=>element.setAttribute('transform',value??''),lifelineTransform);
   expectPass(await recheck(good.page,good.document,good.plan,good.nativeAst),true);
   const icon=good.page.locator('g.lini-node[data-id="p1-icon"]');await expectClean();
   const originalOpacity=await icon.getAttribute('opacity');await icon.evaluate(element=>element.setAttribute('opacity','0'));
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-svg-ownership-geometry')).toBe('fail');
   await icon.evaluate((element,value)=>value===null?element.removeAttribute('opacity'):element.setAttribute('opacity',value),originalOpacity);await expectClean();
   const iconStroke=good.page.locator('g.lini-node[data-id="p1-icon"] > g > g'),originalStroke=await iconStroke.getAttribute('stroke');await iconStroke.evaluate(element=>element.setAttribute('stroke','none'));
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-svg-ownership-geometry')).toBe('fail');
   await iconStroke.evaluate((element,value)=>value===null?element.removeAttribute('stroke'):element.setAttribute('stroke',value),originalStroke);await expectClean();
   await expectClean();const frame=good.page.locator('g.lini-node[data-id="f1"]'),frameTransform=await frame.getAttribute('transform');await frame.evaluate(element=>element.setAttribute('transform','translate(1000,1000)'));
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-caption-clearance')).toBe('fail');
   await frame.evaluate((element,value)=>element.setAttribute('transform',value??''),frameTransform);await expectClean();
   const note=good.page.locator('g.lini-node[data-id="n1"]'),noteTransform=await note.getAttribute('transform');await note.evaluate(element=>element.setAttribute('transform','translate(1000,1000)'));
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-svg-ownership-geometry')).toBe('fail');
   await note.evaluate((element,value)=>element.setAttribute('transform',value??''),noteTransform);await expectClean();
  }finally{await good.page.close();}
 },{timeout:30_000});

 it('keeps the extended native profile source-derived for a renamed three-participant sequence',async()=>{
  const good=await renderDocument(await renamedThreeParticipantDocument());
  try{
   expect(good.plan.elementMap.filter(item=>item.kind==='participant')).toHaveLength(3);
   expect(good.plan.elementMap.filter(item=>item.kind==='message')).toHaveLength(8);
   expect(good.plan.elementMap.filter(item=>item.kind==='note')).toHaveLength(2);
   const allChecks=await verifyPresentationQuality(good.page,{svg:good.svg,document:good.document,plan:good.plan,nativeAst:good.nativeAst}),failed=allChecks.filter(check=>check.result!=='pass');
   expect(failed,JSON.stringify(failed)).toEqual([]);
   expect(allChecks.map(check=>check.check)).toContain('lini-rich-caption-clearance');
   expect(await good.page.locator('g.lini-node[data-id="p3"] polygon').count()).toBe(0);
   expect(await good.page.locator('g.lini-node[data-id="p3"] rect').count()).toBe(1);
   expect((await good.page.locator('g.lini-node[data-id="p3"] > text.lini-text tspan').allTextContents()).join(' ')).toContain('(requested shape: folded-corner)');
  }finally{await good.page.close();}
 },{timeout:45_000});

 it('proves all 19 mindmap topics, 18 exact parent links, bilateral geometry, and owned icons',async()=>{
  const good=await render('lini-gallery-product-mindmap');
  try{
   expectPass(good.checks);expect(good.plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(19);
   await expect(good.page.locator('g.lini-link').count()).resolves.toBe(18);
   const lostParent=good.nativeAst.replace('n1:right - n1.n2:left','n1:right - n1.n5:left');expect(lostParent).not.toBe(good.nativeAst);
   expect(status(await recheck(good.page,good.document,good.plan,lostParent),'lini-rich-native-semantics')).toBe('fail');
   const label=good.page.locator('g.lini-node[data-id="n2"] > text.lini-text');await label.evaluate(element=>{element.textContent='Unrelated label';});
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-svg-ownership-geometry')).toBe('fail');
   await label.evaluate(element=>{element.textContent='Shipping cadence';});
   const icon=good.page.locator('g.lini-node[data-id="n2"] g.lini-icon');expect(await icon.count()).toBe(1);const iconMarkup=await icon.evaluate(element=>element.outerHTML);await icon.evaluate(element=>element.remove());
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-svg-ownership-geometry')).toBe('fail');
   await good.page.locator('g.lini-node[data-id="n2"]').evaluate((element,markup)=>element.insertAdjacentHTML('beforeend',markup),iconMarkup);
   const edge=good.page.locator('g.lini-link[data-from="n1"][data-to="n1.n2"]');await edge.evaluate(element=>element.remove());
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-svg-ownership-geometry')).toBe('fail');
   const rootLabel=good.page.locator('g.lini-node[data-id="n1"] > text.lini-text');await rootLabel.evaluate(element=>{(element as SVGTextElement).style.fontFamily='Helvetica';});
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-typography')).toBe('fail');
  }finally{await good.page.close();}
 });
});
