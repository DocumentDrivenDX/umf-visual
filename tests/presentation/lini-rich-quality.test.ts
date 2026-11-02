// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,describe,expect,it} from 'bun:test';
import {chromium,type Browser,type Page} from 'playwright';
import {readVisualDocument} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyLiniPresentationQuality} from '../../scripts/presentation/lini-quality';

let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});
const required=['lini-rich-native-semantics','lini-rich-svg-ownership-geometry','lini-rich-typography'];
const names=(checks:Awaited<ReturnType<typeof verifyLiniPresentationQuality>>)=>checks.map(check=>check.check);
const status=(checks:Awaited<ReturnType<typeof verifyLiniPresentationQuality>>,name:string)=>checks.find(check=>check.check===name)?.result;
const root=import.meta.dir+'/../..';
async function render(id:string){
 const document=readVisualDocument(await Bun.file(`${root}/fixtures/showcase/definitions/${id}.json`).text(),'json');
 const plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});expect(plan.ok,`${id} must compile`).toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan));
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900}});
 await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:#fff}#frame{width:1600px;height:900px}#frame svg{width:100%;height:100%}</style><div id="frame"></div>',{waitUntil:'domcontentloaded'});
 await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},native.svg);
 const checks=await verifyLiniPresentationQuality(page,{document,plan,nativeAst:native.nativeAst});return{document,plan,page,nativeAst:native.nativeAst,checks};
}
async function recheck(page:Page,document:Awaited<ReturnType<typeof render>>['document'],plan:PresentationPlan,nativeAst:unknown){return verifyLiniPresentationQuality(page,{document,plan,nativeAst});}
function expectPass(checks:Awaited<ReturnType<typeof verifyLiniPresentationQuality>>){expect(names(checks)).toEqual(required);const failed=checks.filter(check=>check.result!=='pass');if(failed.length)throw Error(JSON.stringify(failed));}

describe('pinned Lini rich layouts',()=>{
 it('proves the 4-participant, 8-message checkout sequence in native syntax and SVG geometry',async()=>{
  const good=await render('lini-gallery-checkout-sequence');
  try{
   expectPass(good.checks);
   const expectedMessages=good.plan.elementMap.filter(item=>item.kind==='message');expect(expectedMessages).toHaveLength(8);
   const links=good.page.locator('g.lini-link.lini-style-m1');expect(await links.getAttribute('data-from')).toBe('p1');expect(await links.getAttribute('data-to')).toBe('p2');
   const wrongEndpoint=good.nativeAst.replace('p2 -> p3 .m2','p2 -> p1 .m2');expect(wrongEndpoint).not.toBe(good.nativeAst);
   expect(status(await recheck(good.page,good.document,good.plan,wrongEndpoint),'lini-rich-native-semantics')).toBe('fail');
   const wrongLabel=good.nativeAst.replace('charge $42','charge 42');expect(wrongLabel).not.toBe(good.nativeAst);
   expect(status(await recheck(good.page,good.document,good.plan,wrongLabel),'lini-rich-native-semantics')).toBe('fail');
   const reordered=[...good.nativeAst.split('\n')],firstIndex=reordered.findIndex(line=>/\bp1\s+->\s+p2\b/u.test(line)&&line.includes('.m1')),secondIndex=reordered.findIndex(line=>/\bp2\s+->\s+p3\b/u.test(line)&&line.includes('.m2'));
   expect(firstIndex).toBeGreaterThanOrEqual(0);expect(secondIndex).toBeGreaterThan(firstIndex);[reordered[firstIndex],reordered[secondIndex]]=[reordered[secondIndex]!,reordered[firstIndex]!];
   expect(status(await recheck(good.page,good.document,good.plan,reordered.join('\n')),'lini-rich-native-semantics')).toBe('fail');
   const wrongReturn=good.nativeAst.replace('p3 --> p2 .m4','p3 -> p2 .m4');expect(wrongReturn).not.toBe(good.nativeAst);
   expect(status(await recheck(good.page,good.document,good.plan,wrongReturn),'lini-rich-native-semantics')).toBe('fail');
   const noteWrongParticipant=good.nativeAst.replace('place: over p1;','place: over p2;');expect(noteWrongParticipant).not.toBe(good.nativeAst);
   expect(status(await recheck(good.page,good.document,good.plan,noteWrongParticipant),'lini-rich-native-semantics')).toBe('fail');
   const wrongTitle=good.nativeAst.replace('A checkout, from order to tracking','Checkout title moved');expect(wrongTitle).not.toBe(good.nativeAst);
   expect(status(await recheck(good.page,good.document,good.plan,wrongTitle),'lini-rich-native-semantics')).toBe('fail');
   const titleCarrier=good.page.locator('g.lini-node[data-id="visual-title"] > text.lini-text');await titleCarrier.evaluate(element=>{element.textContent='A different title';});
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-svg-ownership-geometry')).toBe('fail');
   await titleCarrier.evaluate(element=>{element.textContent='A checkout, from order to tracking';});
   const wrongLoop=good.nativeAst.replace('.lini-block.f1 [','.lini-block.f9 [');expect(wrongLoop).not.toBe(good.nativeAst);
   expect(status(await recheck(good.page,good.document,good.plan,wrongLoop),'lini-rich-native-semantics')).toBe('fail');
   const note=good.page.locator('g.lini-node[data-id="n1"]'),noteTransform=await note.getAttribute('transform');await note.evaluate(element=>element.setAttribute('transform','translate(1000,1000)'));
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-svg-ownership-geometry')).toBe('fail');
   await note.evaluate((element,value)=>element.setAttribute('transform',value??''),noteTransform);
   const loop=good.page.locator('g.lini-node[style*="stroke-dasharray"]');expect(await loop.count()).toBe(1);const loopTransform=await loop.getAttribute('transform');await loop.evaluate(element=>element.setAttribute('transform','translate(1000,1000)'));
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-svg-ownership-geometry')).toBe('fail');
   await loop.evaluate((element,value)=>element.setAttribute('transform',value??''),loopTransform);
   const guard=good.page.locator('text.lini-sequence-guard'),guardHandle=await guard.elementHandle();expect(await guard.textContent()).toBe('[each item]');await guardHandle?.evaluate(element=>element.classList.remove('lini-sequence-guard'));
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-svg-ownership-geometry')).toBe('fail');
   await guardHandle?.evaluate(element=>element.classList.add('lini-sequence-guard'));
   const frameMarkup=await loop.evaluate(element=>element.outerHTML);await loop.evaluate((element,markup)=>element.insertAdjacentHTML('afterend',markup),frameMarkup);
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-svg-ownership-geometry')).toBe('fail');
   await good.page.locator('g.lini-node[style*="stroke-dasharray"]').nth(1).evaluate(element=>element.remove());
   const first=good.page.locator('g.lini-link.lini-style-m1'),attrs=await first.evaluate(element=>({from:element.getAttribute('data-from'),to:element.getAttribute('data-to')}));
   await first.evaluate(element=>element.setAttribute('data-to','p4'));
   expect(await first.evaluate(element=>({from:element.getAttribute('data-from'),to:element.getAttribute('data-to')}))).not.toEqual(attrs);
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-svg-ownership-geometry')).toBe('fail');
   await first.evaluate((element,value)=>element.setAttribute('data-to',value??''),attrs.to);
   const originalTransform=await first.getAttribute('transform');await first.evaluate(element=>element.setAttribute('transform','translate(300,0)'));
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-svg-ownership-geometry')).toBe('fail');
   await first.evaluate((element,value)=>element.setAttribute('transform',value??''),originalTransform);
   const messageLabel=first.locator('text.lini-sequence-message');await messageLabel.evaluate(element=>{element.textContent='wrong label';});
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-svg-ownership-geometry')).toBe('fail');
   await messageLabel.evaluate(element=>{element.textContent='place order';});
   const returned=good.page.locator('g.lini-link.lini-style-m4');expect(await returned.evaluate(element=>element.classList.contains('lini-link-dashed'))).toBe(true);await returned.evaluate(element=>element.classList.remove('lini-link-dashed'));
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-svg-ownership-geometry')).toBe('fail');
   const p1Label=good.page.locator('g.lini-node[data-id="p1"] > text.lini-text');await p1Label.evaluate(element=>{(element as SVGTextElement).style.fontFamily='Helvetica';});
   expect(status(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-rich-typography')).toBe('fail');
  }finally{await good.page.close();}
 },{timeout:30_000});

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
