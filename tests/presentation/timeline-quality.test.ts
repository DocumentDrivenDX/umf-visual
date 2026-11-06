// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium,type Browser} from 'playwright';
import {readVisualDocument} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';
import {graphvizExecutionArgs,mermaidSvg,screenshotSvg} from '../../scripts/presentation/build';
import {requiredPresentationChecks} from '../../scripts/presentation/verify';

const document=readVisualDocument(await Bun.file('fixtures/visual/forms/helix-releases.json').text(),'json');
const screenshotDirectory=resolve('.cache/cycle11');
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});await mkdir(screenshotDirectory,{recursive:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});

async function graphviz(plan:PresentationPlan,format:'svg'|'json'):Promise<string>{
 const invocation=graphvizExecutionArgs(plan.execution,format),child=Bun.spawn([invocation.command,...invocation.args],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 child.stdin.write(plan.source);child.stdin.end();const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 expect(exit).toBe(0);expect(stderr).toBe('');return stdout;
}
const named=(checks:Awaited<ReturnType<typeof verifyPresentationQuality>>,name:string)=>checks.find(check=>check.check===name);

test('Graphviz native SVG and AST bind every release event to its exact date and proportional x coordinate',async()=>{
 const plan=compilePresentation(document,{backend:'graphviz',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)return;
 const [svg,json]=await Promise.all([graphviz(plan,'svg'),graphviz(plan,'json')]),page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  const checks=await verifyPresentationQuality(page,{svg,document,plan,nativeAst:JSON.parse(json)}),proof=named(checks,'graphviz-timeline-events-and-axis');
  await screenshotSvg(browser,svg,join(screenshotDirectory,'graphviz-history.png'));
  expect(requiredPresentationChecks('graphviz',document.extensions!['umf.visual'] as any)).toEqual(checks.map(check=>check.check).sort());
  expect(proof?.result).toBe('pass');expect(proof?.details).toContain('41 exact event/date cards');expect(checks.filter(check=>check.result==='fail')).toEqual([]);
  const wrongPosition=JSON.parse(json);wrongPosition.objects.find((object:any)=>object.name==='event_1').pos='500,500';
  const wrongPositionChecks=await verifyPresentationQuality(page,{svg,document,plan,nativeAst:wrongPosition});
  expect(named(wrongPositionChecks,'graphviz-timeline-events-and-axis')?.result).toBe('fail');
  const wrongLabel=JSON.parse(json);wrongLabel.objects.find((object:any)=>object.name==='event_1').label='invented release';
  const wrongLabelChecks=await verifyPresentationQuality(page,{svg,document,plan,nativeAst:wrongLabel});
  expect(named(wrongLabelChecks,'graphviz-timeline-events-and-axis')?.result).toBe('fail');
  const wrongAxis=JSON.parse(json);wrongAxis.edges.find((edge:any)=>edge.id==='date_axis').dir='forward';
  const wrongAxisChecks=await verifyPresentationQuality(page,{svg,document,plan,nativeAst:wrongAxis});
  expect(named(wrongAxisChecks,'graphviz-timeline-events-and-axis')?.result).toBe('fail');
  const movedSvg=svg.replace('<g id="event_1"','<g id="event_1" style="transform: translate(200px, 0px);"');expect(movedSvg).not.toBe(svg);
  const movedSvgChecks=await verifyPresentationQuality(page,{svg:movedSvg,document,plan,nativeAst:JSON.parse(json)});
  expect(named(movedSvgChecks,'graphviz-timeline-events-and-axis')?.details).toContain('Rendered Graphviz event centers');
 }finally{await page.close();}
},{timeout:90_000});

test('Graphviz single-date history qualifies without inventing an axis or requiring an empty native edge array',async()=>{
 const single=structuredClone(document),visual=single.extensions!['umf.visual'] as any;visual.timeline.events=visual.timeline.events.slice(0,1);
 const singleDocument=readVisualDocument(JSON.stringify(single),'json'),plan=compilePresentation(singleDocument,{backend:'graphviz'});expect(plan.ok).toBe(true);if(!plan.ok)return;
 const [svg,json]=await Promise.all([graphviz(plan,'svg'),graphviz(plan,'json')]),page=await browser.newPage({viewport:{width:1600,height:900}});
 try{const checks=await verifyPresentationQuality(page,{svg,document:singleDocument,plan,nativeAst:JSON.parse(json)}),proof=named(checks,'graphviz-timeline-events-and-axis');expect(proof?.result).toBe('pass');expect(proof?.details).toContain('1 exact event/date cards');expect(checks.filter(check=>check.result==='fail')).toEqual([]);}
 finally{await page.close();}
},{timeout:90_000});

test('Mermaid native SVG binds every date card in a readable row-major categorical ledger',async()=>{
 const plan=compilePresentation(document,{backend:'mermaid',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)return;
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  const rendered=await mermaidSvg(page,plan.source,'timeline-history-quality');
  await page.setContent('<!doctype html><div id="fixture"></div>');await page.locator('#fixture').evaluate((fixture,svg)=>{fixture.innerHTML=svg;},rendered.svg);
  const checks=await verifyPresentationQuality(page,{svg:rendered.svg,document,plan}),proof=named(checks,'mermaid-timeline-event-ledger');
  await screenshotSvg(browser,rendered.svg,join(screenshotDirectory,'mermaid-history.png'));
  expect(requiredPresentationChecks('mermaid',document.extensions!['umf.visual'] as any)).toEqual(checks.map(check=>check.check).sort());
  if(proof?.result!=='pass')throw Error(JSON.stringify(proof));expect(proof.details).toContain('41 exact date/label/ID cards');expect(checks.filter(check=>check.result==='fail')).toEqual([]);
  const missingLabel=rendered.svg.replace('v0.1.0','fabricated event label');
  const missingLabelChecks=await verifyPresentationQuality(page,{svg:missingLabel,document,plan});
  expect(named(missingLabelChecks,'mermaid-timeline-event-ledger')?.result).toBe('fail');
  const wrongMap={...plan,elementMap:plan.elementMap.map(item=>item.sourcePath.endsWith('/events/0')?{...item,nativeId:'event_missing'}:item)};
  const wrongMapChecks=await verifyPresentationQuality(page,{svg:rendered.svg,document,plan:wrongMap});
  expect(named(wrongMapChecks,'mermaid-timeline-event-ledger')?.result).toBe('fail');
 }finally{await page.close();}
},{timeout:90_000});
