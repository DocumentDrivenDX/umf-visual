// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {chromium,type Browser, type Page} from 'playwright';
import type {Document} from '@umf/core';
import {getVisual,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyLiniBarPresentationQuality} from '../../scripts/presentation/lini-bar-quality';

const fixture='fixtures/visual/forms/umf-ac-status.json';
const source=readVisualDocument(readFileSync(fixture,'utf8'),'json');
const originalVisual=getVisual(source) as Visual;
const withVisual=(visual:Visual):Document=>({...source,extensions:{...source.extensions,'umf.visual':visual}} as Document);
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>await browser?.close());

async function compiled(document:Document=source){
 const plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan));
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 await page.setContent('<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:#f7f9f9}#frame{width:1600px;height:900px;display:flex;align-items:center;justify-content:center}#frame svg{display:block;width:100%;height:100%}</style><div id="frame"></div>');
 await page.locator('#frame').evaluate((frame,markup)=>{frame.innerHTML=markup;},native.svg);
 await page.locator('#frame svg').evaluate(root=>{const svg=root as SVGSVGElement;svg.style.maxWidth='none';svg.style.maxHeight='none';svg.style.width='100%';svg.style.height='100%';});
 return{page,plan,native,checks:()=>verifyLiniBarPresentationQuality(page,{document,plan,nativeAst:native.nativeAst})};
}

test('pinned Lini chart owns categories by declared slot and preserves each raw value, including zero',async()=>{
 const built=await compiled();
 try{
  const checks=await built.checks();expect(checks.map(item=>item.check)).toEqual(['lini-native-ast','lini-native-carriers','lini-category-bar-values-and-category-ownership']);
  expect(checks.every(item=>item.result==='pass')).toBe(true);
  expect(checks.at(-1)?.details).toContain('zero category owns a visible exact zero label without a painted fill');
  expect(await built.page.locator('#frame svg [data-id="metric-bar-chart"]').count()).toBe(1);
  await built.page.screenshot({path:'/private/tmp/cycle16-lini-bar-final.png'});
 }finally{await built.page.close();}
});

test('native proof rejects a missing zero label, changed bar extent, reordered category labels, and forged source slot',async()=>{
 const cases:[string,(page:Page)=>Promise<void>][]=[
  ['zero-label',async page=>page.locator('.lini-chart-label').filter({hasText:/^0$/u}).first().evaluate(element=>element.remove())],
  ['bar-width',async page=>page.locator('g[class*="lini-hit-"] rect').nth(0).evaluate(element=>element.setAttribute('width',String(Number(element.getAttribute('width'))*.6)))],
  ['category-order',async page=>page.locator('#frame svg [data-id="metric-bar-chart"] text.lini-chart-text').evaluateAll(elements=>{const first=elements.find(element=>element.textContent?.trim()==='Satisfied'),second=elements.find(element=>element.textContent?.trim()==='Untested');if(first&&second){first.textContent='Untested';second.textContent='Satisfied';}})],
 ];
 for(const[name,mutate]of cases){
  const built=await compiled();try{await mutate(built.page);const checks=await built.checks();expect(checks.some(item=>item.result==='fail'),name).toBe(true);}finally{await built.page.close();}
 }
 const forged=await compiled();try{
  const firstPointer='/extensions/umf.visual/metric/series/0/points/0';
  const element=forged.plan.elementMap.find(item=>item.sourcePath===firstPointer&&item.nativeId==='bars#metric-bar-series/data[0]');expect(element).toBeDefined();
  if(element)element.logicalId='/forged';
  const checks=await forged.checks();expect(checks.find(item=>item.check==='lini-native-ast')?.result).toBe('fail');
 }finally{await forged.page.close();}
});

test('native category slots resolve shuffled source points by at ID while retaining original source indexes',async()=>{
 const candidate=structuredClone(originalVisual);candidate.metric!.series[0]!.points.reverse();
 const built=await compiled(withVisual(candidate));try{
  const checks=await built.checks();expect(checks.every(item=>item.result==='pass'),JSON.stringify(checks)).toBe(true);
  const pointPath='/extensions/umf.visual/metric/series/0/points/0';
  expect(built.plan.elementMap).toContainEqual({logicalId:'/metric/series/0/points/0',sourcePath:pointPath+'/at',nativeId:'chart#metric-bar-chart/categories[4]',kind:'metric-value'});
  expect(built.plan.elementMap).toContainEqual({logicalId:'/metric/series/0/points/0',sourcePath:pointPath+'/value',nativeId:'bars#metric-bar-series/data[4]',kind:'metric-value'});
 }finally{await built.page.close();}
});

test('unknown category properties are refused at their exact pointer instead of being dropped',()=>{
 const candidate=structuredClone(originalVisual);Object.assign(candidate.metric!.axis!.kind==='category'?candidate.metric!.axis!.categories[0]!: {},{detail:'unqualified'});
 const result=compilePresentation(withVisual(candidate),{backend:'lini',theme:'presentation/1'});
 expect(result.ok).toBe(false);if(result.ok)return;
 expect(result.diagnostics).toContainEqual(expect.objectContaining({path:'/extensions/umf.visual/metric/axis/categories/0/detail',severity:'error'}));
});

test('numeric category labels remain category slots rather than axis tick anchors',async()=>{
 const candidate=structuredClone(originalVisual);candidate.metric!.axis!.kind==='category'&&(candidate.metric!.axis!.categories[0]!.label='0',candidate.metric!.axis!.categories[1]!.label='2026');
 const built=await compiled(withVisual(candidate));try{const checks=await built.checks();expect(checks.every(item=>item.result==='pass'),JSON.stringify(checks)).toBe(true);}finally{await built.page.close();}
});

test('axis unit ownership cannot be borrowed from a colliding category label',async()=>{
 const candidate=structuredClone(originalVisual);candidate.metric!.axis!.kind==='category'&&(candidate.metric!.axis!.categories[0]!.label='criteria');
 const built=await compiled(withVisual(candidate));try{
  expect((await built.checks()).every(item=>item.result==='pass')).toBe(true);
  await built.page.locator('#frame svg [data-id="metric-bar-chart"]').evaluate(chart=>{
   const same=[...chart.querySelectorAll('text.lini-chart-text')].filter(item=>item.textContent?.trim()==='criteria');
   const axisUnit=same.sort((a,b)=>a.getBoundingClientRect().y-b.getBoundingClientRect().y).at(-1);
   if(axisUnit)axisUnit.setAttribute('visibility','hidden');
  });
  const checks=await built.checks();expect(checks.some(item=>item.result==='fail')).toBe(true);
 }finally{await built.page.close();}
});

test('native value geometry handles negative, fractional, and all-zero inputs without dropping categories',async()=>{
 for(const entry of [{values:[-1.25,2.5,0,-.5,1.25],decimals:0},{values:[-.125,2.375,0,-.5,1.25],decimals:2},{values:[-.125,.125,0,-.05,.12],decimals:0},{values:[0,0,0,0,0],decimals:0}]){
  const candidate=structuredClone(originalVisual);candidate.metric!.format={kind:'number',decimals:entry.decimals};for(const[index,value]of entry.values.entries())candidate.metric!.series[0]!.points[index]!.value=value;
  const built=await compiled(withVisual(candidate));try{const checks=await built.checks();expect(checks.every(item=>item.result==='pass'),JSON.stringify(checks)).toBe(true);}finally{await built.page.close();}
 }
});
