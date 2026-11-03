// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {chromium,type Browser,type Page} from 'playwright';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {readVisualDocument} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {inspectLiniVisibleInk,type LiniVisibleInkLink} from '../../scripts/presentation/lini-visible-ink';

const document=readVisualDocument(readFileSync('fixtures/visual/inventory/beacon-containers.json','utf8'),'json') as Document;
const compiled=compilePresentation(document,{backend:'lini',theme:'presentation/1'});if(!compiled.ok)throw new Error(JSON.stringify(compiled.diagnostics));
const plan:PresentationPlan=compiled;
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>await browser?.close());
const reset=async(page:Page,svg:string)=>page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:white"><div id="frame">${svg}</div></body>`,{waitUntil:'load'});
const queue=(rows:LiniVisibleInkLink[])=>rows.find(row=>row.nativeClass==='lini-style-e8');

test('pinned Lini luminance knockout preserves exact caption pixels, route stroke, and arrow ink',async()=>{
 const native=await renderPresentationLini(plan.source);expect(native.version).toBe('1.1.0');
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  await reset(page,native.svg);const report=await inspectLiniVisibleInk(page),edge=queue(report.links);
  expect(edge).toBeDefined();if(!report.ok)throw new Error(JSON.stringify(report,null,2));expect(edge?.from).toBe('visual.g1.n5');expect(edge?.to).toBe('visual.g2.n8');
  expect(edge?.maskId).toMatch(/^lini-label-cut-/u);expect(edge?.cutCount).toBeGreaterThan(0);expect(edge?.cutMarginCssPx).toBeGreaterThanOrEqual(1);
  expect(edge?.captionInkPixels).toBeGreaterThan(2);expect(edge?.maskPixelDeltaPixels).toBeGreaterThan(0);expect(edge?.visiblePathFraction).toBeGreaterThanOrEqual(.5);
  expect(edge?.startInkPixels).toBeGreaterThan(0);expect(edge?.endInkPixels).toBeGreaterThan(0);expect(edge?.arrowInkPixels).toBeGreaterThan(0);
  expect(plan.source).toContain('g1.n5 -> g2.n8 .e8');
 }finally{await page.close();}
});

test('independent disabled, shrunk, and overbroad masks fail the owned visible-ink proof',async()=>{
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  await reset(page,native.svg);await page.locator('g.lini-style-e8 > path').evaluate(path=>path.removeAttribute('mask'));
  const disabled=await inspectLiniVisibleInk(page),disabledEdge=queue(disabled.links);expect(disabledEdge?.ok).toBe(false);expect(disabledEdge?.problems.join(' ')).toContain('no qualified luminance mask');

  await reset(page,native.svg);await page.locator('g.lini-style-e8 mask rect.lini-cut').first().evaluate(rect=>{for(const key of ['x','y'] as const)rect.setAttribute(key,String(Number(rect.getAttribute(key))+7));for(const key of ['width','height'] as const)rect.setAttribute(key,String(Number(rect.getAttribute(key))-14));});
  const shrunk=await inspectLiniVisibleInk(page),shrunkEdge=queue(shrunk.links);expect(shrunkEdge?.ok).toBe(false);expect(shrunkEdge?.problems.join(' ')).toContain('glyph bounds');

  await reset(page,native.svg);await page.locator('g.lini-style-e8 mask').evaluate(mask=>{const bg=mask.querySelector('rect.lini-cut-bg')!,cut=mask.querySelector('rect.lini-cut')!;for(const key of ['x','y','width','height'] as const)cut.setAttribute(key,bg.getAttribute(key)!);});
  const broad=await inspectLiniVisibleInk(page),broadEdge=queue(broad.links);expect(broadEdge?.ok).toBe(false);expect(broadEdge?.problems.join(' ')).toContain('removes too much');

  await reset(page,native.svg);await page.locator('g.lini-style-e8 mask').evaluate(mask=>mask.setAttribute('mask-type','alpha'));
  const alpha=await inspectLiniVisibleInk(page),alphaEdge=queue(alpha.links);expect(alphaEdge?.ok).toBe(false);expect(alphaEdge?.problems.join(' ')).toContain('luminance mask');

  await reset(page,native.svg);await page.locator('g.lini-style-e8 > text.lini-link-label').evaluate(label=>{label.style.visibility='hidden';});
  const hidden=await inspectLiniVisibleInk(page),hiddenEdge=queue(hidden.links);expect(hiddenEdge?.ok).toBe(false);expect(hiddenEdge?.problems.join(' ')).toContain('hidden or has no visible rasterized glyph ink');

  await reset(page,native.svg);await page.locator('g.lini-style-e8 > path').evaluate(path=>{path.style.visibility='hidden';});
  const hiddenPath=await inspectLiniVisibleInk(page),hiddenPathEdge=queue(hiddenPath.links);expect(hiddenPathEdge?.ok).toBe(false);expect(hiddenPathEdge?.problems.join(' ')).toContain('owned route stroke is hidden');

  await reset(page,native.svg);await page.locator('g.lini-style-e8 > .lini-marker-arrow').evaluate(arrow=>{arrow.style.visibility='hidden';});
  const hiddenArrow=await inspectLiniVisibleInk(page),hiddenArrowEdge=queue(hiddenArrow.links);expect(hiddenArrowEdge?.ok).toBe(false);expect(hiddenArrowEdge?.problems.join(' ')).toContain('owned arrow is hidden');
 }finally{await page.close();}
});

test('a nonqualifying present mask is unnecessary when its caption clears the owned route by eight CSS pixels',async()=>{
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  await reset(page,native.svg);
  await page.locator('g.lini-style-e7').evaluate(group=>{
   const ns='http://www.w3.org/2000/svg',edge=group as SVGGElement,path=edge.querySelector<SVGPathElement>(':scope > path');if(!path)throw Error('Unlabeled-distance control route is missing.');
   const bounds=path.getBBox(),mask=globalThis.document.createElementNS(ns,'mask'),background=globalThis.document.createElementNS(ns,'rect'),cut=globalThis.document.createElementNS(ns,'rect');
   mask.id='offpath-nonqualifying-mask';mask.setAttribute('maskUnits','userSpaceOnUse');mask.setAttribute('mask-type','luminance');
   for(const[key,value]of Object.entries({x:bounds.x-8,y:bounds.y-8,width:bounds.width+16,height:bounds.height+16})){mask.setAttribute(key,String(value));background.setAttribute(key,String(value));}
   background.setAttribute('class','lini-cut-bg');background.setAttribute('fill','white');cut.setAttribute('class','lini-cut');cut.setAttribute('fill','black');cut.setAttribute('x',String(bounds.x+4));cut.setAttribute('y',String(bounds.y+4));cut.setAttribute('width','6');cut.setAttribute('height','6');
   mask.append(background,cut);edge.insertBefore(mask,path);path.setAttribute('mask','url(#offpath-nonqualifying-mask)');
  });
  const report=await inspectLiniVisibleInk(page),edge=report.links.find(row=>row.nativeClass==='lini-style-e7');expect(edge).toBeDefined();expect(edge?.clearanceCssPx).toBeGreaterThanOrEqual(8);expect(edge?.ok).toBe(true);expect(edge?.maskId).toBe('offpath-nonqualifying-mask');expect(edge?.cutMarginCssPx).toBeUndefined();expect(edge?.startInkPixels).toBeGreaterThan(0);expect(edge?.endInkPixels).toBeGreaterThan(0);
 }finally{await page.close();}
});
