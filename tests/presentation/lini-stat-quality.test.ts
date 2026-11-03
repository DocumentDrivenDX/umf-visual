// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,it} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {chromium,type Browser,type Page} from 'playwright';
import {readVisualDocument} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';
import {requiredPresentationChecks} from '../../scripts/presentation/verify';

const source=readVisualDocument(await readFile('fixtures/visual/forms/umf-ac-satisfied.json','utf8'),'json');
const planFor=(document:ReturnType<typeof readVisualDocument>):PresentationPlan=>{const result=compilePresentation(document,{backend:'lini',theme:'presentation/1'});if(!result.ok)throw Error(JSON.stringify(result.diagnostics));return result;};
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});

async function check(svg:string,document=source,plan=planFor(document)){
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 try{
  const checks=await verifyPresentationQuality(page,{svg,document,plan,nativeAst:native.nativeAst});
  return{checks,page,native};
 }catch(error){await page.close();throw error;}
}

it('proves each exact source date/value at its native affine x/y position and preserves plateaus',async()=>{
 const plan=planFor(source),native=await renderPresentationLini(plan.source),result=await check(native.svg,source,plan);
 try{
  const proof=result.checks.find(row=>row.check==='lini-stat-events-and-date-scale');
  expect(proof?.result,proof?.details).toBe('pass');
  expect(proof?.details).toContain('exact UTC-day');
  expect(result.checks.map(row=>row.check).sort()).toEqual(requiredPresentationChecks('lini',source.extensions!['umf.visual'] as any));
  expect(result.checks.filter(row=>row.result==='fail')).toEqual([]);
 }finally{await result.page.close();}
});

it('rejects a moved source marker, altered exact-date caption, and missing straight guide',async()=>{
 const plan=planFor(source),native=await renderPresentationLini(plan.source);
 const moved=native.svg.replace(/(<g[^>]*data-id="metric-stat-marker-5"[^>]*transform="translate\()(-?[\d.]+),(-?[\d.]+)(\)"?)/u,(_all,prefix:string,x:string,y:string,suffix:string)=>prefix+(Number(x)+28)+','+y+suffix);
 expect(moved).not.toBe(native.svg);
 let result=await check(moved,source,plan);try{expect(result.checks.find(row=>row.check==='lini-stat-events-and-date-scale')?.result).toBe('fail');}finally{await result.page.close();}
 const caption=native.svg.replace('2026-10-11 · 117 criteria','2026-10-12 · 117 criteria');expect(caption).not.toBe(native.svg);
 result=await check(caption,source,plan);try{expect(result.checks.find(row=>row.check==='lini-stat-events-and-date-scale')?.result).toBe('fail');}finally{await result.page.close();}
 const missingGuide=native.svg.replace(/\s*<g class="lini-node lini-line" data-id="metric-stat-guide-4"[\s\S]*?<\/g>/u,'');expect(missingGuide).not.toBe(native.svg);
 result=await check(missingGuide,source,plan);try{expect(result.checks.find(row=>row.check==='lini-stat-events-and-date-scale')?.result).toBe('fail');}finally{await result.page.close();}
});

it('keeps duplicate same-date observations source-owned without moving coincident x coordinates',async()=>{
 const raw=JSON.parse(await readFile('fixtures/visual/forms/umf-ac-satisfied.json','utf8')) as Record<string,any>,visual=raw.extensions['umf.visual'];
 visual.metric.series[0].points.push({at:'2026-10-23',value:180});const document=readVisualDocument(JSON.stringify(raw),'json'),plan=planFor(document),native=await renderPresentationLini(plan.source),result=await check(native.svg,document,plan);
 try{const proof=result.checks.find(row=>row.check==='lini-stat-events-and-date-scale');expect(proof?.result,proof?.details).toBe('pass');}finally{await result.page.close();}
});

it('keeps fractional, narrow-range, and zero-degenerate raw value domains calibrated',async()=>{
 for(const values of [[1.25,2.375],[0,1],[0,0]] as const){
  const raw=JSON.parse(await readFile('fixtures/visual/forms/umf-ac-satisfied.json','utf8')) as Record<string,any>,visual=raw.extensions['umf.visual'];
  delete visual.metric.format;visual.metric.series[0].points=[{at:'2026-10-02',value:values[0]},{at:'2026-10-14',value:values[1]}];
  const document=readVisualDocument(JSON.stringify(raw),'json'),plan=planFor(document),native=await renderPresentationLini(plan.source),result=await check(native.svg,document,plan);
  try{const proof=result.checks.find(row=>row.check==='lini-stat-events-and-date-scale');expect(proof?.result,`${values.join('/')} · ${proof?.details}`).toBe('pass');expect(plan.source).toContain(`2026-10-02 · ${values[0]} criteria`);expect(plan.source).toContain(`2026-10-14 · ${values[1]} criteria`);}finally{await result.page.close();}
 }
});
