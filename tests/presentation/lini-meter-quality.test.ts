// SPDX-License-Identifier: MIT OR Apache-2.0
import {readFile} from 'node:fs/promises';
import {afterAll,beforeAll,expect,it} from 'bun:test';
import {chromium,type Browser,type Page} from 'playwright';
import {readVisualDocument} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';

const source=JSON.parse(await readFile('fixtures/visual/forms/umf-ac-coverage.json','utf8')) as Record<string,any>;
const documentFor=(value:number,target:number)=>{
 const copy=structuredClone(source);copy.extensions['umf.visual'].metric.series[0].points[0].value=value;copy.extensions['umf.visual'].metric.target=target;
 return readVisualDocument(JSON.stringify(copy),'json');
};
const planFor=(document:ReturnType<typeof documentFor>):PresentationPlan=>{
 const result=compilePresentation(document,{backend:'lini',theme:'presentation/1'});if(!result.ok)throw Error(JSON.stringify(result.diagnostics));return result;
};
const meter=(checks:Awaited<ReturnType<typeof verifyPresentationQuality>>)=>checks.find(check=>check.check==='lini-meter-value-and-reference-geometry');
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});

async function verify(document:ReturnType<typeof documentFor>,plan=planFor(document),mutate?:(svg:string)=>string){
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900}});
 try{return await verifyPresentationQuality(page,{svg:mutate?mutate(native.svg):native.svg,document,plan,nativeAst:native.nativeAst});}finally{await page.close();}
}

it('qualifies exact source-owned value/target/unit/format/good cues with measured native scale geometry',async()=>{
 const document=readVisualDocument(JSON.stringify(source),'json'),plan=planFor(document),checks=await verify(document,plan);
 expect(checks.filter(check=>check.result==='fail')).toEqual([]);
 expect(meter(checks)?.details).toContain('raw 180 criteria value');
 expect(meter(checks)?.details).toContain('exact target 837');
 expect(checks.find(check=>check.check==='presentation-text-overlap')?.result).toBe('pass');
 expect(plan.approximations[0]?.representation).toContain('not a semantic maximum or percentage scale');
});

it('keeps negative, zero-degenerate, and over-target values on an uncapped numeric display scale',async()=>{
 for(const [value,target] of [[-12,0],[0,0],[12,10],[1.5,2.5],[0.1,0.2]] as const){
  const document=documentFor(value,target),plan=planFor(document),checks=await verify(document,plan);
  expect(checks.filter(check=>check.result==='fail'),`${value} against ${target}`).toEqual([]);
  expect(plan.source).toContain(`range:`);
  expect(plan.source).toContain(`data: ${value};`);
  expect(plan.source).toContain(`at: ${target};`);
  if(value===1.5)expect(plan.source).toContain('labels: "2";');
  if(value===0.1){const range=plan.source.match(/range: (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?);/u);expect(range).not.toBeNull();expect(Number(range?.[2])-Number(range?.[1])).toBeLessThan(1);expect(plan.source).toContain(`ticks: ${range?.[1]}, 0, ${range?.[2]};`);const native=await renderPresentationLini(plan.source),tickLabels=[...native.svg.matchAll(/<text class="lini-text lini-chart-text"[^>]*>([-−]?\d+)<\/text>/gu)].map(match=>match[1]);expect(tickLabels.length).toBeGreaterThanOrEqual(3);expect(tickLabels.every(label=>label==='0')).toBe(true);}
 }
});

it('groups coincident reference labels on one exact native rule without moving the coordinate',async()=>{
 const copy=structuredClone(source);copy.extensions['umf.visual'].metric.baseline=copy.extensions['umf.visual'].metric.target;
 const document=readVisualDocument(JSON.stringify(copy),'json'),plan=planFor(document),native=await renderPresentationLini(plan.source),checks=await verify(document,plan);
 expect(checks.filter(check=>check.result==='fail')).toEqual([]);
 expect(plan.elementMap.filter(row=>row.sourcePath.endsWith('/metric/target')||row.sourcePath.endsWith('/metric/baseline')).map(row=>row.nativeId)).toEqual(['metric-meter-target','metric-meter-target']);
 expect(plan.source).toContain('Target 837 · Baseline 837');
 const droppedRole=native.svg.replace('Target 837 · Baseline 837','Target 837');expect(droppedRole).not.toBe(native.svg);
 const dropPage=await browser.newPage({viewport:{width:1600,height:900}});try{expect(meter(await verifyPresentationQuality(dropPage,{svg:droppedRole,document,plan,nativeAst:native.nativeAst}))?.result).toBe('fail');}finally{await dropPage.close();}
 const movedRule=native.svg.replace(/(<g class="lini-node lini-line" style="stroke: var\(--lini-muted\); stroke-width: 1\.5"[^>]*>\s*<line x1=")(-?\d+(?:\.\d+)?)(" y1="[^"]+" x2=")(-?\d+(?:\.\d+)?)(")/u,(_all,prefix:string,x1:string,middle:string,x2:string,suffix:string)=>prefix+(Number(x1)+40)+middle+(Number(x2)+40)+suffix);expect(movedRule).not.toBe(native.svg);
 const movePage=await browser.newPage({viewport:{width:1600,height:900}});try{expect(meter(await verifyPresentationQuality(movePage,{svg:movedRule,document,plan,nativeAst:native.nativeAst}))?.result).toBe('fail');}finally{await movePage.close();}
});

it('binds distinct baseline and comparison labels to their own raw native marker positions',async()=>{
 const copy=structuredClone(source);copy.extensions['umf.visual'].metric.baseline=400;copy.extensions['umf.visual'].metric.comparison={label:'Prior',value:650};
 const document=readVisualDocument(JSON.stringify(copy),'json'),plan=planFor(document),checks=await verify(document,plan);
 expect(checks.filter(check=>check.result==='fail')).toEqual([]);
 expect(meter(checks)?.details).toContain('Authored baseline/comparison references are present');
});

it('rejects a moved target rule and a forged bar endpoint in native SVG geometry',async()=>{
 const document=documentFor(180,837),plan=planFor(document),native=await renderPresentationLini(plan.source);
 const movedTarget=native.svg.replace(/(<g class="lini-node lini-line" style="stroke: var\(--lini-muted\); stroke-width: 1\.5"[^>]*>\s*<line x1=")(-?\d+(?:\.\d+)?)(" y1="[^"]+" x2=")(-?\d+(?:\.\d+)?)(")/u,(_all,prefix:string,x1:string,middle:string,x2:string,suffix:string)=>prefix+(Number(x1)+45)+middle+(Number(x2)+45)+suffix);
 expect(movedTarget).not.toBe(native.svg);
 const targetPage=await browser.newPage({viewport:{width:1600,height:900}});
 try{const checks=await verifyPresentationQuality(targetPage,{svg:movedTarget,document,plan,nativeAst:native.nativeAst});expect(meter(checks)?.result).toBe('fail');expect(meter(checks)?.details).toContain('target line');}finally{await targetPage.close();}
 const movedBar=native.svg.replace(/(<g class="lini-node lini-hit-0 lini-block"[^>]*>[\s\S]*?<rect x="-?\d+(?:\.\d+)?" y="-?\d+(?:\.\d+)?" width=")(-?\d+(?:\.\d+)?)(")/u,(_all,prefix:string,width:string,suffix:string)=>prefix+(Number(width)+40)+suffix);
 expect(movedBar).not.toBe(native.svg);
 const barPage=await browser.newPage({viewport:{width:1600,height:900}});
 try{const checks=await verifyPresentationQuality(barPage,{svg:movedBar,document,plan,nativeAst:native.nativeAst});expect(meter(checks)?.result).toBe('fail');expect(meter(checks)?.details).toContain('bar endpoint');}finally{await barPage.close();}
});

it('measures only visible native text and fails when a required target caption is hidden',async()=>{
 const document=documentFor(180,837),plan=planFor(document),native=await renderPresentationLini(plan.source);
 const hiddenTarget=native.svg.replace(/(<text\b[^>]*style="[^"]*)">Target 837<\/text>/u,'$1; visibility: hidden">Target 837</text>');expect(hiddenTarget).not.toBe(native.svg);
 const hiddenPage=await browser.newPage({viewport:{width:1600,height:900}});
 try{const checks=await verifyPresentationQuality(hiddenPage,{svg:hiddenTarget,document,plan,nativeAst:native.nativeAst});expect(meter(checks)?.result).toBe('fail');expect(meter(checks)?.details).toContain('target reference');}finally{await hiddenPage.close();}
 const revealedTooltip=native.svg.replace(/(<g class="lini-node lini-chart-tip [^"]+")/u,'$1 style="visibility:visible"');expect(revealedTooltip).not.toBe(native.svg);
 const visiblePage=await browser.newPage({viewport:{width:1600,height:900}});
 try{const checks=await verifyPresentationQuality(visiblePage,{svg:revealedTooltip,document,plan,nativeAst:native.nativeAst});expect(checks.find(check=>check.check==='presentation-text-overlap')?.result).toBe('fail');}finally{await visiblePage.close();}
});
