// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {chromium,type Browser} from 'playwright';
import {getVisual,readVisualDocument} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyLiniPresentationQuality} from '../../scripts/presentation/lini-quality';

const document=readVisualDocument(await Bun.file('fixtures/visual/forms/umf-releases.json').text(),'json');
const visual=getVisual(document),base='/extensions/umf.visual';
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});

async function render(plan:PresentationPlan){
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:#fff}#frame{width:1600px;height:900px}#frame svg{width:100%;height:100%}</style><div id="frame"></div>',{waitUntil:'domcontentloaded'});
 await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},native.svg);
 return{native,page,checks:await verifyLiniPresentationQuality(page,{document,plan,nativeAst:native.nativeAst})};
}
const named=(checks:Awaited<ReturnType<typeof verifyLiniPresentationQuality>>,name:string)=>checks.find(check=>check.check===name);

test('Lini native milestone markers preserve every source index and exact coincident date',async()=>{
 const result=compilePresentation(document,{backend:'lini',theme:'presentation/1'});expect(result.ok).toBe(true);if(!result.ok)return;
 expect(result.elementMap.filter(item=>item.kind==='event')).toEqual((visual.timeline?.events??[]).map((event,index)=>({logicalId:event.id,sourcePath:`${base}/timeline/events/${index}`,nativeId:`event${index+1}`,kind:'event'})));
 const good=await render(result);
 try{
  const proof=named(good.checks,'lini-timeline-events-and-date-scale');expect(proof?.result).toBe('pass');expect(proof?.details).toContain('11 mapped event carriers');
  expect(good.checks.filter(check=>check.result==='fail')).toEqual([]);
  const markers=await Promise.all([3,4,5].map(index=>good.page.locator(`g.lini-node[data-id="mark${index}"]`).boundingBox()));
  const centers=markers.map(box=>box?box.x+box.width/2:NaN);expect(centers.every(Number.isFinite)).toBe(true);expect(Math.max(...centers)-Math.min(...centers)).toBeLessThanOrEqual(1);
  const labels=await Promise.all([3,4,5].map(index=>good.page.locator(`g.lini-node[data-id="event${index}"]`).boundingBox()));
  expect(labels.every(box=>box!==null)).toBe(true);if(labels.every((box):box is NonNullable<typeof box>=>box!==null))expect(new Set(labels.map(box=>Math.round((box.y+box.height/2)*10)/10)).size).toBe(3);
  const marker=good.page.locator('g.lini-node[data-id="mark3"]'),original=await marker.getAttribute('transform');await marker.evaluate(element=>element.setAttribute('transform','translate(400 200)'));
  const moved=await verifyLiniPresentationQuality(good.page,{document,plan:result,nativeAst:good.native.nativeAst}),movedProof=named(moved,'lini-timeline-events-and-date-scale');expect(movedProof?.result).toBe('fail');expect(movedProof?.details).toContain('same-date events');
  await marker.evaluate((element,value)=>element.setAttribute('transform',value??''),original);
  const label=good.page.locator('g.lini-node[data-id="event3"] text.lini-text').first(),text=await label.textContent();await label.evaluate(element=>{element.textContent='invented release';});
  const changed=await verifyLiniPresentationQuality(good.page,{document,plan:result,nativeAst:good.native.nativeAst}),changedProof=named(changed,'lini-timeline-events-and-date-scale');expect(changedProof?.result).toBe('fail');expect(changedProof?.details).toContain('exact source label and ISO date');
  await label.evaluate((element,value)=>{element.textContent=value??'';},text);
 }finally{await good.page.close();}
},{timeout:60_000});
