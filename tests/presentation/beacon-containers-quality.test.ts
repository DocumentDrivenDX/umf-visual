// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {chromium,type Browser} from 'playwright';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {readVisualDocument} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {inspectLiniVisibleInk} from '../../scripts/presentation/lini-visible-ink';

const document=readVisualDocument(readFileSync('fixtures/visual/inventory/beacon-containers.json','utf8'),'json') as Document;
const runDot=async(plan:PresentationPlan,format:'svg'|'json')=>{
 const child=Bun.spawn(['dot',`-T${format}`],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});child.stdin.write(plan.source);child.stdin.end();
 const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);expect(exit).toBe(0);expect(stderr).toBe('');return stdout;
};
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>await browser?.close());
const finding=(checks:Awaited<ReturnType<typeof verifyPresentationQuality>>,name:string)=>checks.find(check=>check.check===name);

test('Graphviz maps all containers nodes and induced edges, including a tooltip-wrapped why edge',async()=>{
 const plan=compilePresentation(document,{backend:'graphviz',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)return;
 const [svg,json]=await Promise.all([runDot(plan,'svg'),runDot(plan,'json')]),ast=JSON.parse(json);
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  const checks=await verifyPresentationQuality(page,{svg,document,plan,nativeAst:ast});
  expect(finding(checks,'graphviz-native-ast')?.result).toBe('pass');expect(finding(checks,'graphviz-native-carriers')?.result).toBe('pass');
  expect(finding(checks,'graphviz-edge-endpoints-and-paths')?.result).toBe('pass');expect(finding(checks,'graphviz-containment-and-order')?.result).toBe('pass');
  expect(plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(9);expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(10);
  await page.setContent('<!doctype html><meta charset="utf-8"><div id="frame"></div>');
  const tooltipOwnsPathAndArrow=await page.locator('#frame').evaluate((frame,markup)=>{frame.innerHTML=markup;const edge=frame.querySelector('svg g#e2');const anchor=edge?.querySelector('a');return Boolean(anchor?.getAttributeNS('http://www.w3.org/1999/xlink','title')&&anchor.querySelector('path')&&anchor.querySelector('polygon'));},svg);
  expect(tooltipOwnsPathAndArrow).toBe(true);
  const pathless=await page.locator('#frame').evaluate((frame,markup)=>{frame.innerHTML=markup;const edge=frame.querySelector('svg g#e2');if(!edge)throw Error('why-bearing edge e2 is missing');edge.querySelector('path')?.remove();return frame.querySelector('svg')!.outerHTML;},svg);
  const noPath=await verifyPresentationQuality(page,{svg:pathless,document,plan,nativeAst:ast});expect(finding(noPath,'graphviz-edge-endpoints-and-paths')?.result).toBe('fail');
  await page.setContent('<!doctype html><meta charset="utf-8"><div id="frame"></div>');
  const arrowless=await page.locator('#frame').evaluate((frame,markup)=>{frame.innerHTML=markup;const edge=frame.querySelector('svg g#e2');if(!edge)throw Error('why-bearing edge e2 is missing');edge.querySelector('polygon')?.remove();return frame.querySelector('svg')!.outerHTML;},svg);
  const noArrow=await verifyPresentationQuality(page,{svg:arrowless,document,plan,nativeAst:ast});expect(finding(noArrow,'graphviz-edge-endpoints-and-paths')?.result).toBe('fail');
 }finally{await page.close();}
});

test('Mermaid preserves all containers node and induced edge carriers',async()=>{
 const plan=compilePresentation(document,{backend:'mermaid',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)return;
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  await page.setContent('<!doctype html><meta charset="utf-8"><div id="out"></div>');
  await page.addScriptTag({path:resolve(import.meta.dir,'../../node_modules/mermaid/dist/mermaid.min.js')});
  const svg=await page.evaluate(async source=>{const mermaid=(window as any).mermaid;mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',deterministicIds:true,deterministicIDSeed:'beacon-containers-quality'});return(await mermaid.render('beacon-containers-quality',source)).svg;},plan.source);
  const checks=await verifyPresentationQuality(page,{svg,document,plan});
  expect(finding(checks,'mermaid-native-node-carriers')?.result).toBe('pass');expect(finding(checks,'mermaid-flow-paths')?.result).toBe('pass');expect(finding(checks,'mermaid-containment-and-order')?.result).toBe('pass');
  expect(plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(9);expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(10);
 }finally{await page.close();}
});

test('Lini preserves grouped containers and proves a masked sibling-group connector',async()=>{
 const plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)return;
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 try{
  const checks=await verifyPresentationQuality(page,{svg:native.svg,document,plan,nativeAst:native.nativeAst});
  const required=['lini-native-ast','lini-native-carriers','lini-connection-endpoints','lini-containment-and-order','lini-entity-field-rows'];for(const name of required)if(finding(checks,name)?.result!=='pass')throw new Error(JSON.stringify(checks.filter(check=>required.includes(check.check)),null,2));
  expect(plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(9);expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(10);
  const ink=await inspectLiniVisibleInk(page),masked=ink.links.find(link=>link.nativeClass==='lini-style-e8');expect(masked?.ok).toBe(true);expect(masked?.maskPixelDeltaPixels).toBeGreaterThan(0);expect(masked?.cutMarginCssPx).toBeGreaterThanOrEqual(1);

  const movedData=await page.locator('#frame svg').evaluate(svgElement=>{
   const svg=svgElement as SVGSVGElement,label=svg.querySelector<SVGTextElement>('g.lini-style-e8 > text.lini-link-label'),frame=svg.querySelector<SVGRectElement>('g.lini-node.lini-group[data-id="g2"] > rect'),matrix=svg.getScreenCTM();
   if(!label||!frame||!matrix)throw Error('The source caption or data-group frame is missing.');
   const labelBox=label.getBoundingClientRect(),frameBox=frame.getBoundingClientRect(),desiredCssX=frameBox.left-(labelBox.left+labelBox.width/2),desiredCssY=frameBox.top-(labelBox.top+labelBox.height/2),inverse=matrix.inverse(),origin=new DOMPoint(0,0).matrixTransform(inverse),shifted=new DOMPoint(desiredCssX,desiredCssY).matrixTransform(inverse),nativeX=shifted.x-origin.x,nativeY=shifted.y-origin.y,existing=label.getAttribute('transform')??'';
   label.setAttribute('transform',`${existing} translate(${nativeX} ${nativeY})`.trim());return svg.outerHTML;
  });
  const movedChecks=await verifyPresentationQuality(page,{svg:movedData,document,plan,nativeAst:native.nativeAst}),frameCheck=finding(movedChecks,'lini-connection-endpoints');
  expect(frameCheck?.result).toBe('fail');expect(frameCheck?.details).toContain('owned caption crosses native group frame g2');
 }finally{await page.close();}
});
