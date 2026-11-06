// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,it} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {chromium,type Browser} from 'playwright';
import {readVisualDocument} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';

const source=readVisualDocument(await readFile('fixtures/visual/forms/umf-ac-trend.json','utf8'),'json');
const planFor=(document:ReturnType<typeof readVisualDocument>):PresentationPlan=>{const result=compilePresentation(document,{backend:'lini',theme:'presentation/1'});if(!result.ok)throw Error(JSON.stringify(result.diagnostics));return result;};
const trend=(checks:Awaited<ReturnType<typeof verifyPresentationQuality>>)=>checks.find(check=>check.check==='lini-trend-series-and-date-value-geometry');
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});

async function verify(svg:string,document=source,plan=planFor(document)){
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 try{return await verifyPresentationQuality(page,{svg,document,plan,nativeAst:native.nativeAst});}finally{await page.close();}
}

it('proves exact source-indexed date rows/value cells, neutral series columns, and shared UTC/raw-value plot geometry',async()=>{
 const plan=planFor(source),native=await renderPresentationLini(plan.source),checks=await verify(native.svg,source,plan),proof=trend(checks);
 expect(proof?.result,proof?.details).toBe('pass');
 expect(proof?.details).toContain('18 dated observations');
 expect(checks.filter(check=>check.result==='fail')).toEqual([]);
 expect(plan.source).toContain('metric-trend-date-header');expect(plan.source).toContain('metric-trend-date-row-d1');
 expect(plan.source).not.toContain(' · criteria {');
});

it('rejects independent moved-marker, altered-date-row, and cross-series guide mutations',async()=>{
 const plan=planFor(source),native=await renderPresentationLini(plan.source),baseline=native.svg;
 const movedMarker=baseline.replace(/(<g class="lini-node lini-oval" data-id="metric-trend-marker-s1-p1"[^>]*transform="translate\()(-?[\d.]+),(-?[\d.]+)(\)">)/u,(_all,prefix:string,x:string,y:string,suffix:string)=>prefix+(Number(x)+36)+','+y+suffix);
 expect(movedMarker).not.toBe(baseline);expect(trend(await verify(movedMarker,source,plan))?.result).toBe('fail');
 const wrongDate=baseline.replace('>2026-10-02</text>','>2026-10-03</text>');expect(wrongDate).not.toBe(baseline);expect(trend(await verify(wrongDate,source,plan))?.result).toBe('fail');
 const wrongGuide=baseline.replace(/(<g class="lini-node lini-line" data-id="metric-trend-guide-s1-p1"[^>]*>\s*<line x1="[^"]+" y1="[^"]+" x2="[^"]+" y2=")([\d.-]+)("\s*\/?>)/u,'$1-18.05$3');
 expect(wrongGuide).not.toBe(baseline);expect(trend(await verify(wrongGuide,source,plan))?.result).toBe('fail');
});

it('binds each source value to its series column and proves the visible question and plot unit',async()=>{
 const plan=planFor(source),native=await renderPresentationLini(plan.source),baseline=native.svg;
 const translate=(svg:string,id:string)=>{const match=svg.match(new RegExp(`<g[^>]*data-id="${id}"[^>]*transform="translate\\((-?[\\d.]+),(-?[\\d.]+)\\)"`));if(!match)throw Error(`Missing native group ${id}`);return{x:Number(match[1]),y:Number(match[2])};};
 const move=(svg:string,id:string,x:number,y:number)=>svg.replace(new RegExp(`(<g[^>]*data-id="${id}"[^>]*transform="translate\\()(-?[\\d.]+),(-?[\\d.]+)(\\)")`),(_all,prefix:string,_x:string,_y:string,suffix:string)=>`${prefix}${x},${y}${suffix}`);
 const first=translate(baseline,'metric-trend-point-s1-p1'),second=translate(baseline,'metric-trend-point-s2-p1');
 const swapped=move(move(baseline,'metric-trend-point-s1-p1',second.x,first.y),'metric-trend-point-s2-p1',first.x,second.y);
 expect(swapped).not.toBe(baseline);expect(trend(await verify(swapped,source,plan))?.result).toBe('fail');
 const wrongQuestion=baseline.replace('How have satisfied and untested criteria changed?','How have satisfied and untested criteria moved?');expect(wrongQuestion).not.toBe(baseline);expect(trend(await verify(wrongQuestion,source,plan))?.result).toBe('fail');
 const wrongPlotUnit=baseline.replace(/(<g[^>]*data-id="metric-trend-plot-unit"[^>]*>[\s\S]*?<text[^>]*>)criteria(<\/text>)/u,'$1items$2');expect(wrongPlotUnit).not.toBe(baseline);expect(trend(await verify(wrongPlotUnit,source,plan))?.result).toBe('fail');
});

it('qualifies one series and repeated observations on a single date without invented chronology',async()=>{
 const oneSeriesRaw=JSON.parse(await readFile('fixtures/visual/forms/umf-ac-trend.json','utf8')) as Record<string,any>;
 oneSeriesRaw.extensions['umf.visual'].metric.series=[structuredClone(oneSeriesRaw.extensions['umf.visual'].metric.series[0])];
 oneSeriesRaw.extensions['umf.visual'].metric.series[0].points=[{at:'2026-10-02',value:55},{at:'2026-10-23',value:180}];
 const oneSeries=readVisualDocument(JSON.stringify(oneSeriesRaw),'json'),onePlan=planFor(oneSeries),oneNative=await renderPresentationLini(onePlan.source),oneChecks=await verify(oneNative.svg,oneSeries,onePlan);
 expect(oneChecks.filter(row=>row.result==='fail')).toEqual([]);expect(trend(oneChecks)?.result).toBe('pass');

 const repeatedRaw=JSON.parse(await readFile('fixtures/visual/forms/umf-ac-trend.json','utf8')) as Record<string,any>,repeatedVisual=repeatedRaw.extensions['umf.visual'];
 repeatedVisual.metric.series[0].points=[{at:'2026-10-02',value:55},{at:'2026-10-02',value:56}];
 repeatedVisual.metric.series[1].points=[{at:'2026-10-02',value:155},{at:'2026-10-02',value:156}];
 const repeated=readVisualDocument(JSON.stringify(repeatedRaw),'json'),repeatedPlan=planFor(repeated),repeatedNative=await renderPresentationLini(repeatedPlan.source),repeatedChecks=await verify(repeatedNative.svg,repeated,repeatedPlan);
 expect(repeatedChecks.filter(row=>row.result==='fail')).toEqual([]);expect(trend(repeatedChecks)?.result).toBe('pass');
 expect(repeatedPlan.elementMap.filter(row=>row.sourcePath.endsWith('/at')).map(row=>row.nativeId)).toEqual(['metric-trend-date-row-d1','metric-trend-date-row-d2','metric-trend-date-row-d3','metric-trend-date-row-d4']);
 expect(repeatedPlan.approximations[0]?.representation).toContain('rows do not establish intra-day chronology or pair observations across series');
});
