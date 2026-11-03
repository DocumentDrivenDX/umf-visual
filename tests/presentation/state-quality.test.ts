// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium,type Browser} from 'playwright';
import {createVisualDocument,getVisual,readVisualDocument} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';
import {mermaidSvg,screenshotSvg} from '../../scripts/presentation/build';

let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});

const document=readVisualDocument(await Bun.file('fixtures/visual/forms/helix-authoring-state.json').text(),'json');
const screenshotDirectory=resolve('.cache/cycle10');
await mkdir(screenshotDirectory,{recursive:true});
async function dot(plan:PresentationPlan,format:'svg'|'json'){
 const child=Bun.spawn(['dot','-T'+format],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 child.stdin.write(plan.source);child.stdin.end();
 const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 expect(exit).toBe(0);expect(stderr).toBe('');return stdout;
}
const named=(checks:Awaited<ReturnType<typeof verifyPresentationQuality>>,name:string)=>checks.find(check=>check.check===name);

test('Graphviz native AST and SVG own every state, transition caption, endpoint and initial marker',async()=>{
 const plan=compilePresentation(document,{backend:'graphviz'});expect(plan.ok).toBe(true);if(!plan.ok)return;
 const [svg,json]=await Promise.all([dot(plan,'svg'),dot(plan,'json')]),page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  const checks=await verifyPresentationQuality(page,{svg,document,plan,nativeAst:JSON.parse(json)}),proof=named(checks,'graphviz-state-transitions-and-markers');
  await screenshotSvg(browser,svg,join(screenshotDirectory,'graphviz-state.png'));
  expect(proof?.result).toBe('pass');
  expect(proof?.details).toContain('2 item-mapped transitions');
  expect(checks.filter(check=>check.result==='fail')).toEqual([]);
  const changed=JSON.parse(json);changed.edges.find((edge:any)=>edge.id==='t1').label='invented caption';
  const negative=await verifyPresentationQuality(page,{svg,document,plan,nativeAst:changed});
  expect(named(negative,'graphviz-state-transitions-and-markers')?.result).toBe('fail');
  const wrongId=JSON.parse(json);wrongId.edges.find((edge:any)=>edge.id==='t1').id='unexpected-id';
  const wrongIdChecks=await verifyPresentationQuality(page,{svg,document,plan,nativeAst:wrongId});
  expect(named(wrongIdChecks,'graphviz-state-transitions-and-markers')?.result).toBe('fail');
  const svgMissingId=svg.replace('id="t1"','id="unexpected-id"');
  const missingIdChecks=await verifyPresentationQuality(page,{svg:svgMissingId,document,plan,nativeAst:JSON.parse(json)});
  expect(named(missingIdChecks,'graphviz-state-transitions-and-markers')?.result).toBe('fail');
  const extraFinalPlan={...plan,source:plan.source.replace('n2 [id="n2", label=','n2 [id="n2", peripheries=2, label=')};
  const [extraSvg,extraJson]=await Promise.all([dot(extraFinalPlan,'svg'),dot(extraFinalPlan,'json')]);
  const extraFinalChecks=await verifyPresentationQuality(page,{svg:extraSvg,document,plan,nativeAst:JSON.parse(extraJson)});
  expect(named(extraFinalChecks,'graphviz-state-transitions-and-markers')?.result).toBe('fail');
 }finally{await page.close();}
});

test('Mermaid state SVG owns every state, directed transition path and exact transition caption',async()=>{
 const plan=compilePresentation(document,{backend:'mermaid'});expect(plan.ok).toBe(true);if(!plan.ok)return;
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  const rendered=await mermaidSvg(page,plan.source,'state-quality'),checks=await verifyPresentationQuality(page,{svg:rendered.svg,document,plan}),proof=named(checks,'mermaid-state-transitions-and-markers');
  await screenshotSvg(browser,rendered.svg,join(screenshotDirectory,'mermaid-state.png'));
  if(proof?.result!=='pass')throw Error(JSON.stringify(proof));
  expect(checks.filter(check=>check.result==='fail')).toEqual([]);
  const title=await page.locator('#frame svg').evaluate(root=>{const svg=root as SVGSVGElement,text=svg.querySelector('text.statediagramTitleText') as SVGTextElement|null,box=text?.getBoundingClientRect(),frame=svg.getBoundingClientRect();return text&&box?{topInset:box.top-frame.top,bottomInset:frame.bottom-box.bottom}:undefined;});
  expect(title).toBeDefined();expect(title!.topInset).toBeGreaterThanOrEqual(2);expect(title!.bottomInset).toBeGreaterThanOrEqual(2);
 }finally{await page.close();}
});

test('Mermaid distinguishes parallel transitions by their authored captions',async()=>{
 const visual=getVisual(document);visual.state!.transitions.push({...visual.state!.transitions[0]!,id:'check-in-again',event:'check in again'});
 const parallelDocument=createVisualDocument(visual,'test:parallel-state-transitions','1.4.0'),plan=compilePresentation(parallelDocument,{backend:'mermaid'});expect(plan.ok).toBe(true);if(!plan.ok)return;
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  const rendered=await mermaidSvg(page,plan.source,'state-parallel'),checks=await verifyPresentationQuality(page,{svg:rendered.svg,document:parallelDocument,plan});
  const proof=named(checks,'mermaid-state-transitions-and-markers');if(proof?.result!=='pass')throw Error(JSON.stringify(proof));
  expect(checks.filter(check=>check.result==='fail')).toEqual([]);
 }finally{await page.close();}
});

test('native final marker remains distinct when its state is also initial and has outgoing transitions',async()=>{
 const authored=getVisual(document);authored.state!.final=['checked-out'];
 const finalDocument=createVisualDocument(authored,'test:state-final-overlap','1.4.0');
 for(const backend of ['graphviz','mermaid'] as const){
  const plan=compilePresentation(finalDocument,{backend});expect(plan.ok).toBe(true);if(!plan.ok)continue;
  const page=await browser.newPage({viewport:{width:1600,height:900}});
  try{
   let svg:string,nativeAst:unknown;
   if(backend==='graphviz'){svg=await dot(plan,'svg');nativeAst=JSON.parse(await dot(plan,'json'));}
   else svg=(await mermaidSvg(page,plan.source,'state-final-overlap')).svg;
   const checks=await verifyPresentationQuality(page,{svg,document:finalDocument,plan,nativeAst});
   expect(named(checks,backend==='graphviz'?'graphviz-state-transitions-and-markers':'mermaid-state-transitions-and-markers')?.result).toBe('pass');
   expect(checks.filter(check=>check.result==='fail')).toEqual([]);
  }finally{await page.close();}
 }
});
