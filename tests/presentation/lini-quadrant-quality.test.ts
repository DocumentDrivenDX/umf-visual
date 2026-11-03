// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,it} from 'bun:test';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium,type Browser, type Page} from 'playwright';
import {readVisualDocument} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyLiniPresentationQuality} from '../../scripts/presentation/lini-quality';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';
import {requiredPresentationChecks} from '../../scripts/presentation/verify';

const document=readVisualDocument(await Bun.file('fixtures/visual/forms/layout-engines.json').text(),'json');
const screenshotPath=resolve('/private/tmp/cycle13-lini-quadrant.png');
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});await mkdir('/private/tmp',{recursive:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});

async function prepare(page:Page,svg:string){
 await page.setViewportSize({width:1600,height:900});
 await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:#fff}#frame{width:1600px;height:900px;display:flex;align-items:center;justify-content:center}#frame svg{display:block;max-width:none;max-height:none;width:100%;height:100%}</style><div id="frame"></div>',{waitUntil:'domcontentloaded'});
 await page.locator('#frame').evaluate((frame,markup)=>{frame.innerHTML=markup;},svg);
}
const quadrant=(checks:Awaited<ReturnType<typeof verifyLiniPresentationQuality>>)=>checks.find(check=>check.check==='lini-quadrant-coordinate-ownership');

it('proves exact source ratings, authored axes, visible context, and native chart geometry',async()=>{
 const plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)return;
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  const checks=await verifyPresentationQuality(page,{svg:native.svg,document,plan,nativeAst:native.nativeAst});
  const required=requiredPresentationChecks('lini',document.extensions!['umf.visual'] as any);
  expect(checks.map(check=>check.check).sort()).toEqual(required);
  expect(checks.filter(check=>check.result==='fail')).toEqual([]);
  expect(quadrant(checks)?.details).toContain('exact rating-to-axis CSS geometry deviations');
  await page.screenshot({path:screenshotPath,fullPage:false});

  const svg= native.svg;
  await prepare(page,svg);
  await page.locator('g.lini-chart').locator('g.lini-oval > ellipse').first().evaluate(element=>element.setAttribute('transform','translate(170, 90)'));
  const moved=await verifyLiniPresentationQuality(page,{document,plan,nativeAst:native.nativeAst});
  expect(quadrant(moved)?.result).toBe('fail');

  await prepare(page,svg);
  await page.locator('g.lini-chart text.lini-chart-label').first().evaluate(element=>{element.textContent='fabricated item';});
  const relabelled=await verifyLiniPresentationQuality(page,{document,plan,nativeAst:native.nativeAst});
  expect(quadrant(relabelled)?.result).toBe('fail');

  await prepare(page,svg);
  const scaffold=page.locator('g.lini-chart g.lini-line').filter({has:page.locator('line')}).last();
  await scaffold.evaluate(element=>{(element as SVGGElement).style.strokeWidth='2px';});
  const visibleScaffold=await verifyLiniPresentationQuality(page,{document,plan,nativeAst:native.nativeAst});
  expect(quadrant(visibleScaffold)?.result).toBe('fail');

  const remapped={...plan,elementMap:plan.elementMap.map(item=>item.sourcePath.endsWith('/comparison/values/0/rating')?{...item,nativeId:'quadrant-item-5'}:item)};
  const wrongOwner=await verifyPresentationQuality(page,{svg,document,plan:remapped,nativeAst:native.nativeAst});
  expect(wrongOwner.find(check=>check.check==='lini-native-carriers')?.result).toBe('fail');
 }finally{await page.close();}
},{timeout:120_000});

it('keeps supported item detail, rating note, takeaway and free-text annotation visible and mapped',async()=>{
 const raw=await Bun.file('fixtures/visual/forms/layout-engines.json').text(),copy=JSON.parse(raw),visual=copy.extensions['umf.visual'];
 visual.comparison.items[0].detail='An authored item detail.';
 visual.comparison.values.find((value:any)=>value.item===visual.comparison.items[0].id&&value.criterion===visual.comparison.axes.x).note='An authored point note.';
 visual.takeaway='Authored takeaway text.';
 visual.annotations=[{id:'source-note',text:'An unanchored source annotation.'}];
 copy.vocabularies['umf.visual'].version='1.4.0';
 const variant=readVisualDocument(JSON.stringify(copy),'json'),plan=compilePresentation(variant,{backend:'lini',theme:'presentation/1'});
 expect(plan.ok).toBe(true);if(!plan.ok)return;
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  const checks=await verifyPresentationQuality(page,{svg:native.svg,document:variant,plan,nativeAst:native.nativeAst});
  expect(checks.filter(check=>check.result==='fail')).toEqual([]);
  const captions=await page.locator('#frame text.lini-chart-label').allTextContents();
  expect(captions.join(' ')).toContain('An authored item detail.');expect(captions.join(' ')).toContain('Runtime fit note: An authored point note.');
  expect(await page.locator('#frame [data-id="quadrant-takeaway"] text').textContent()).toContain('Authored takeaway text.');
  expect(await page.locator('#frame [data-id="quadrant-annotation-1"] text').textContent()).toContain('An unanchored source annotation.');
 }finally{await page.close();}
},{timeout:120_000});
