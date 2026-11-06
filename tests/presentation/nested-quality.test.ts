// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {mkdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,type Browser} from 'playwright';
import type {Document} from '@umf/core';
import {getVisual,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';
import {isUnsupportedPresentationDiagnostics,mermaidSvg,screenshotSvg} from '../../scripts/presentation/build';
import {requiredPresentationChecks} from '../../scripts/presentation/verify';
import {runNestedBrowserMutationControls} from '../../scripts/presentation/nested-quality';

const document=readVisualDocument(readFileSync('fixtures/reviews/definitions/beacon-estate-landscape.json','utf8'),'json') as Document;
const visual=getVisual(document) as Visual;
const screenshotDirectory=resolve('.cache/cycle28');
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});await mkdir(screenshotDirectory,{recursive:true});},{timeout:30_000});
afterAll(async()=>await browser?.close(),{timeout:30_000});

async function dot(plan:PresentationPlan,format:'svg'|'json'){
 const child=Bun.spawn(['dot','-T'+format],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});child.stdin.write(plan.source);child.stdin.end();
 const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 expect(exit,stderr||stdout).toBe(0);expect(stderr).toBe('');return stdout;
}

test('Graphviz nested native AST, SVG ownership, enclosure, and full presentation gates pass',async()=>{
 const plan=compilePresentation(document,{backend:'graphviz',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)return;
 const [svg,json]=await Promise.all([dot(plan,'svg'),dot(plan,'json')]),ast=JSON.parse(json),page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  const checks=await verifyPresentationQuality(page,{svg,document,plan,nativeAst:ast}),failed=checks.filter(check=>check.result==='fail');
  await screenshotSvg(browser,svg,resolve(screenshotDirectory,'graphviz-nested.png'));
  expect(checks.map(check=>check.check).sort()).toEqual(requiredPresentationChecks('graphviz',visual));
  expect(failed,JSON.stringify(failed)).toEqual([]);
  expect(checks.find(check=>check.check==='nested-native-carriers')?.details).toContain('10 source node identities');
  expect(checks.find(check=>check.check==='nested-no-synthetic-links')?.result).toBe('pass');
 }finally{await page.close();}
});

test('Mermaid nested SVG retains every owner and containment; its presentation font gate reports the measured loss',async()=>{
 const plan=compilePresentation(document,{backend:'mermaid',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)return;
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  const rendered=await mermaidSvg(page,plan.source,'beacon-estate-landscape'),checks=await verifyPresentationQuality(page,{svg:rendered.svg,document,plan});
  await screenshotSvg(browser,rendered.svg,resolve(screenshotDirectory,'mermaid-nested.png'));
  const failed=checks.filter(check=>check.result==='fail');
  expect(checks.map(check=>check.check).sort()).toEqual(requiredPresentationChecks('mermaid',visual));
  expect(rendered.version).toBe('12.2.0');
  expect(checks.find(check=>check.check==='nested-native-carriers')?.result).toBe('pass');
  expect(checks.find(check=>check.check==='nested-native-captions')?.result).toBe('pass');
  expect(checks.find(check=>check.check==='nested-native-containment')?.result).toBe('pass');
  expect(checks.find(check=>check.check==='nested-no-synthetic-links')?.result).toBe('pass');
  expect(failed.map(check=>check.check)).toEqual(['presentation-font-legibility']);
 }finally{await page.close();}
});

test('browser native mutations reject broken ownership, containment, inventory, and synthetic links',async()=>{
 for(const backend of ['graphviz','mermaid'] as const){
  const plan=compilePresentation(document,{backend,theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)continue;
  let svg:string,nativeAst:unknown;
  if(backend==='graphviz'){svg=await dot(plan,'svg');nativeAst=JSON.parse(await dot(plan,'json'));}
  else{const renderer=await browser.newPage();try{svg=(await mermaidSvg(renderer,plan.source,'nested-mutations')).svg;}finally{await renderer.close();}}
  const page=await browser.newPage({viewport:{width:1600,height:900}});
  try{
   const results=await runNestedBrowserMutationControls(page,{svg,plan,visual,nativeAst});
   expect(results.map(result=>result.mutation)).toEqual(['child-outside-parent','overlapping-siblings','hidden-owner-caption','transparent-owner-caption','removed-owner-caption','moved-owner-caption','phantom-carrier','synthetic-connector']);
   for(const result of results)expect(result,JSON.stringify({backend,mutation:result.mutation})).toMatchObject({applied:true,detected:true});
  }finally{await page.close();}
 }
});

test('bounded nested refusals classify as unsupported while invalid and mixed diagnostics stay failed',()=>{
 const grid={...visual,layout:{kind:'grid',columns:2}} as unknown as Visual;
 const refusal=compilePresentation((()=>{const copy=JSON.parse(JSON.stringify(document));copy.extensions['umf.visual']=grid;copy.vocabularies['umf.visual'].version='1.4.0';return copy;})(),{backend:'graphviz',theme:'presentation/1'});
 expect(refusal.ok).toBe(false);if(!refusal.ok)expect(isUnsupportedPresentationDiagnostics(refusal.diagnostics)).toBe(true);
 const empty=compilePresentation((()=>{const copy=JSON.parse(JSON.stringify(document));copy.extensions['umf.visual'].nodes=[];return copy;})(),{backend:'graphviz',theme:'presentation/1'});
 expect(empty.ok).toBe(false);if(!empty.ok)expect(isUnsupportedPresentationDiagnostics(empty.diagnostics)).toBe(false);
 const liniLayout={code:'PRESENTATION_LINI_NESTED_LAYOUT',message:'layout not supported',path:'/layout',severity:'error'} as const;
 const liniScope={code:'PRESENTATION_LINI_NESTED_SCOPE',message:'scope not supported',path:'/nodes',severity:'error'} as const;
 const invalid={code:'PRESENTATION_LINI_NESTED_INVALID',message:'invalid input',path:'/nodes',severity:'error'} as const;
 expect(isUnsupportedPresentationDiagnostics([liniLayout])).toBe(true);
 expect(isUnsupportedPresentationDiagnostics([liniScope])).toBe(true);
 expect(isUnsupportedPresentationDiagnostics([liniScope,invalid])).toBe(false);
});
