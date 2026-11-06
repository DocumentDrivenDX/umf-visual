// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {mkdirSync,readFileSync} from 'node:fs';
import {chromium,type Browser, type Page} from 'playwright';
import type {Document} from '@umf/core';
import {getVisual,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyLiniPresentationQuality} from '../../scripts/presentation/lini-quality';

const fixture='fixtures/visual/forms/visuals-roadmap.json';
const source=readVisualDocument(readFileSync(fixture,'utf8'),'json');
const originalVisual=getVisual(source) as Visual;
const withVisual=(visual:Visual):Document=>({...source,extensions:{...source.extensions,'umf.visual':visual}} as Document);
const checkName='lini-roadmap-period-lane-span-ownership';
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>await browser?.close(),{timeout:30_000});

async function compiled(document:Document=source){
 const plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan));
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 await page.setContent('<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:#fff}#frame{width:1600px;height:900px;display:flex;align-items:center;justify-content:center}#frame svg{display:block;width:100%;height:100%}</style><div id="frame"></div>');
 await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},native.svg);
 await page.locator('#frame svg').evaluate(root=>{const svg=root as SVGSVGElement;svg.style.maxWidth='none';svg.style.maxHeight='none';svg.style.width='100%';svg.style.height='100%';});
 const checks=()=>verifyLiniPresentationQuality(page,{document,plan,nativeAst:native.nativeAst});
 return{page,plan,native,checks};
}
const proof=(checks:Awaited<ReturnType<typeof verifyLiniPresentationQuality>>)=>checks.find(check=>check.check===checkName);
const textCarrier=(page:Page,id:string)=>page.locator(`#frame svg [data-id="${id}"] text.lini-text`).first();

test('native roadmap proof owns every period, lane, span label, status, and source pointer',async()=>{
 const built=await compiled();try{
  const checks=await built.checks();expect(checks.map(check=>check.check)).toEqual(['lini-native-ast','lini-native-carriers',checkName]);
  expect(checks.every(check=>check.result==='pass'),JSON.stringify(checks)).toBe(true);
  expect(proof(checks)?.details).toContain('8 source spans');
  expect(built.plan.elementMap.filter(item=>item.kind==='period')).toHaveLength(24);
  expect(built.plan.elementMap.filter(item=>item.kind==='lane')).toHaveLength(12);
  expect(built.plan.elementMap.filter(item=>item.kind==='span'&&/^\/extensions\/umf\.visual\/timeline\/spans\/\d+$/u.test(item.sourcePath))).toHaveLength(originalVisual.timeline!.spans!.length);
  expect(new Set(built.plan.elementMap.filter(item=>item.kind==='span'&&item.sourcePath.endsWith('/label')).map(item=>item.sourcePath))).toHaveLength(originalVisual.timeline!.spans!.length);
  expect(built.plan.elementMap.filter(item=>item.kind==='span'&&item.sourcePath.endsWith('/status'))).toHaveLength(originalVisual.timeline!.spans!.length);
  mkdirSync('.cache/cycle21',{recursive:true});await built.page.screenshot({path:'.cache/cycle21/lini-roadmap.png',fullPage:true});
 }finally{await built.page.close();}
});

test('native ownership fails independently when period, lane, span label, status, or bar extent changes',async()=>{
 const mutations:Array<[string,(page:Page)=>Promise<void>]>= [
  ['period label',async page=>textCarrier(page,'roadmap-period-1').evaluate(element=>{element.textContent='invented period';})],
  ['lane label',async page=>textCarrier(page,'roadmap-lane-3').evaluate(element=>{element.textContent='invented lane';})],
  ['span label',async page=>textCarrier(page,'roadmap-span-label-1-line-1').evaluate(element=>{element.textContent='invented milestone';})],
  ['status',async page=>textCarrier(page,'roadmap-span-status-1').evaluate(element=>{element.textContent='decided';})],
  ['span extent',async page=>page.locator('#frame svg [data-id="roadmap-span-4"] rect').first().evaluate(element=>element.setAttribute('height',String(Number(element.getAttribute('height'))*.45)))],
 ];
 for(const[name,mutate]of mutations){const built=await compiled();try{await mutate(built.page);const checks=await built.checks();expect(checks.some(check=>check.result==='fail'),name).toBe(true);expect(proof(checks)?.result,'roadmap source-to-native ownership must fail for '+name).toBe('fail');}finally{await built.page.close();}}
});

test('native ownership rejects an extra unmapped interval bar',async()=>{
 const built=await compiled();try{
  await built.page.locator('#frame svg [data-id="roadmap-span-1"]').evaluate(element=>{const clone=element.cloneNode(true) as SVGGElement;clone.dataset.id='roadmap-span-phantom';element.parentElement?.appendChild(clone);});
  const checks=await built.checks(),ownership=proof(checks);
  expect(ownership?.result).toBe('fail');
  expect(ownership?.details).toContain('native interval bar IDs (9) do not exactly match the 8 source span IDs');
 }finally{await built.page.close();}
});

test('native period labels must be centered on their own row even when order remains monotonic',async()=>{
 const built=await compiled();try{
  const label=built.page.locator('#frame svg [data-id="roadmap-period-2"]'),first=built.page.locator('#frame svg [data-id="roadmap-period-1"]'),third=built.page.locator('#frame svg [data-id="roadmap-period-3"]');
  const centers=await Promise.all([first,label,third].map(item=>item.evaluate(element=>{const box=element.getBoundingClientRect();return box.y+box.height/2;})));
  expect(centers[0]).toBeLessThan(centers[1]!);expect(centers[1]).toBeLessThan(centers[2]!);
  const scale=await label.evaluate(element=>(element as SVGGraphicsElement).getScreenCTM()?.d??NaN),delta=(centers[2]!-centers[1]!)/3/scale;
  await label.evaluate((element,offset)=>{const original=element.getAttribute('transform')??'',match=/translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)/u.exec(original);if(!match)throw new Error(`Expected a native translate transform, received ${original}`);const changed=original.replace(match[0],`translate(${match[1]} ${Number(match[2])+offset})`);element.setAttribute('transform',changed);},delta);
  const shifted=await Promise.all([first,label,third].map(item=>item.evaluate(element=>{const box=element.getBoundingClientRect();return box.y+box.height/2;})));
  expect(shifted[0]).toBeLessThan(shifted[1]!);expect(shifted[1]).toBeLessThan(shifted[2]!);
  const checks=await built.checks(),ownership=proof(checks);
  expect(ownership?.result).toBe('fail');
  expect(ownership?.details).toContain('period m1 label is not centered in its mapped source-order row');
  expect(ownership?.details).not.toContain('period rows do not follow declared source order');
 }finally{await built.page.close();}
});

test('native period placement follows referenced IDs after source period and lane arrays are reordered',async()=>{
 const candidate=structuredClone(originalVisual);candidate.timeline!.scale.kind==='period'&&(candidate.timeline!.scale.periods.reverse());candidate.timeline!.lanes!.reverse();
 const built=await compiled(withVisual(candidate));try{
  const checks=await built.checks();expect(checks.every(check=>check.result==='pass'),JSON.stringify(checks)).toBe(true);
  expect(built.plan.elementMap).toContainEqual({logicalId:'m7',sourcePath:'/extensions/umf.visual/timeline/scale/periods/0/id',nativeId:'roadmap-period-1',kind:'period'});
  expect(built.plan.elementMap).toContainEqual({logicalId:'documentor',sourcePath:'/extensions/umf.visual/timeline/lanes/0/id',nativeId:'roadmap-lane-1',kind:'lane'});
 }finally{await built.page.close();}
});

test('native bars span multiple authored periods without turning a categorical scale into dates',async()=>{
 const candidate=structuredClone(originalVisual);candidate.timeline!.spans![0]!.end='m2';
 const built=await compiled(withVisual(candidate));try{
  const checks=await built.checks();expect(checks.every(check=>check.result==='pass'),JSON.stringify(checks)).toBe(true);
  expect(proof(checks)?.details).toContain('8 source spans');
  expect(built.plan.approximations.some(item=>/no calendar dates, elapsed durations/iu.test(item.representation))).toBe(true);
 }finally{await built.page.close();}
});

test('overlapping same-lane spans are packed into distinct visual subtracks without changing their interval',async()=>{
 const candidate=structuredClone(originalVisual);candidate.timeline!.spans!.push({id:'span-m0-overlap',label:'Overlapping milestone',start:'m0',end:'m2',lane:'helix',status:'decided'});
 const built=await compiled(withVisual(candidate));try{
  const checks=await built.checks();expect(checks.every(check=>check.result==='pass'),JSON.stringify(checks)).toBe(true);
  const first=await built.page.locator('#frame svg [data-id="roadmap-span-1"] rect').first().boundingBox();
  const second=await built.page.locator('#frame svg [data-id="roadmap-span-9"] rect').first().boundingBox();
  expect(first).not.toBeNull();expect(second).not.toBeNull();if(first&&second)expect(Math.abs((first.x+first.width/2)-(second.x+second.width/2))).toBeGreaterThan(20);
 }finally{await built.page.close();}
});
