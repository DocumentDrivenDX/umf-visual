// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium,type Browser} from 'playwright';
import {readVisualDocument} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';
import {graphvizExecutionArgs,mermaidSvg,screenshotSvg} from '../../scripts/presentation/build';
import {requiredPresentationChecks} from '../../scripts/presentation/verify';

const document=readVisualDocument(await Bun.file('fixtures/visual/forms/umf-releases.json').text(),'json');
const screenshotDirectory=resolve('.cache/cycle19');
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});await mkdir(screenshotDirectory,{recursive:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});

async function graphviz(plan:ReturnType<typeof compilePresentation> & {ok:true},format:'svg'|'json'):Promise<string>{
 const invocation=graphvizExecutionArgs(plan.execution,format),child=Bun.spawn([invocation.command,...invocation.args],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 child.stdin.write(plan.source);child.stdin.end();const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 expect(exit).toBe(0);expect(stderr).toBe('');return stdout;
}
const named=(checks:Awaited<ReturnType<typeof verifyPresentationQuality>>,name:string)=>checks.find(check=>check.check===name);

test('milestone form uses the exact-date Graphviz event proof and rejects altered native ownership',async()=>{
 const plan=compilePresentation(document,{backend:'graphviz',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)return;
 const [svg,json]=await Promise.all([graphviz(plan,'svg'),graphviz(plan,'json')]),ast=JSON.parse(json),page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  const checks=await verifyPresentationQuality(page,{svg,document,plan,nativeAst:ast}),proof=named(checks,'graphviz-timeline-events-and-axis');
  await screenshotSvg(browser,svg,join(screenshotDirectory,'graphviz-milestones.png'));
  expect(requiredPresentationChecks('graphviz',document.extensions!['umf.visual'] as any)).toEqual(checks.map(check=>check.check).sort());
  expect(proof?.result).toBe('pass');expect(proof?.details).toContain('11 exact event/date cards');expect(checks.filter(row=>row.result==='fail')).toEqual([]);
  const wrong=structuredClone(ast);wrong.objects.find((object:any)=>object.name==='event_1').pos='500,500';
  const mutation=await verifyPresentationQuality(page,{svg,document,plan,nativeAst:wrong});
  expect(named(mutation,'graphviz-timeline-events-and-axis')?.result).toBe('fail');
 }finally{await page.close();}
},{timeout:90_000});

test('milestone form uses the exact-date Mermaid ledger proof and rejects changed event text',async()=>{
 const plan=compilePresentation(document,{backend:'mermaid',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)return;
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  const rendered=await mermaidSvg(page,plan.source,'milestone-event-ledger-quality');
  await page.setContent('<!doctype html><div id="fixture"></div>');await page.locator('#fixture').evaluate((fixture,svg)=>{fixture.innerHTML=svg;},rendered.svg);
  const checks=await verifyPresentationQuality(page,{svg:rendered.svg,document,plan}),proof=named(checks,'mermaid-timeline-event-ledger');
  await screenshotSvg(browser,rendered.svg,join(screenshotDirectory,'mermaid-milestones.png'));
  expect(requiredPresentationChecks('mermaid',document.extensions!['umf.visual'] as any)).toEqual(checks.map(row=>row.check).sort());
  expect(proof?.result).toBe('pass');expect(proof?.details).toContain('11 exact date/label/ID cards');expect(checks.filter(row=>row.result==='fail')).toEqual([]);
  const changed=rendered.svg.replace('umf-v0.2.0','invented release');expect(changed).not.toBe(rendered.svg);
  const mutation=await verifyPresentationQuality(page,{svg:changed,document,plan});
  expect(named(mutation,'mermaid-timeline-event-ledger')?.result).toBe('fail');
 }finally{await page.close();}
},{timeout:90_000});
