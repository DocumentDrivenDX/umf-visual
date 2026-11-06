// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {chromium,type Browser} from 'playwright';
import type {Document} from '@umf/core';
import {compilePresentation} from '../../src/presentation';
import {createVisualDocument,getVisual,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {verifyPresentationQuality,type PresentationQualityCheck} from '../../scripts/presentation/quality';
import {verifyLiniPresentationQuality} from '../../scripts/presentation/lini-quality';
import {requiredPresentationChecks} from '../../scripts/presentation/verify';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';

const document=readVisualDocument(readFileSync('fixtures/visual/inventory/beacon-deployment.json','utf8'),'json') as Document;
const visual=getVisual(document) as Visual;
const directionCheck='graphviz-zoned-tier-direction';
const tierColumnsCheck='lini-zoned-tier-columns';
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>await browser?.close(),{timeout:30_000});

async function dot(plan:ReturnType<typeof compilePresentation> extends infer R?Extract<R,{ok:true}>:never,format:'svg'|'json'){
 const child=Bun.spawn(['dot',`-T${format}`],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});child.stdin.write(plan.source);child.stdin.end();
 const[stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);expect(exit).toBe(0);expect(stderr).toBe('');return stdout;
}
async function graphviz(){
 const plan=compilePresentation(document,{backend:'graphviz',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan));
 const[svg,json]=await Promise.all([dot(plan,'svg'),dot(plan,'json')]),nativeAst=JSON.parse(json),page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 const checks=()=>verifyPresentationQuality(page,{svg,document,plan,nativeAst});
 return{plan,svg,nativeAst,page,checks};
}
async function liniDocument(documentToCompile:Document=document){
 const plan=compilePresentation(documentToCompile,{backend:'lini',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan));
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 await page.setContent('<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:#fff}#frame{width:1600px;height:900px;display:flex;align-items:center;justify-content:center}#frame svg{display:block;width:100%;height:100%}</style><div id="frame"></div>');
 await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},native.svg);
 await page.locator('#frame svg').evaluate(root=>{const svg=root as SVGSVGElement;svg.style.maxWidth='none';svg.style.maxHeight='none';svg.style.width='100%';svg.style.height='100%';});
 const checks=()=>verifyLiniPresentationQuality(page,{document:documentToCompile,plan,nativeAst:native.nativeAst});return{plan,native,page,checks};
}
const lini=()=>liniDocument();
const result=(checks:PresentationQualityCheck[],name:string)=>checks.find(check=>check.check===name);

test('Graphviz zoned layout qualifies exact tiers and its default TB direction',async()=>{
 const built=await graphviz();try{
  const checks=await built.checks();
  expect(checks.filter(check=>check.result==='fail'),JSON.stringify(checks)).toEqual([]);
  expect(requiredPresentationChecks('graphviz',(await import('../../src/extensions/visual')).getVisual(document)!)).toContain(directionCheck);
  expect(result(checks,directionCheck)?.result).toBe('pass');
  expect(built.nativeAst.rankdir).toBe('TB');
  expect(built.plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(13);
  expect(built.plan.elementMap.filter(item=>item.kind==='group')).toHaveLength(5);
  expect(built.plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(15);
 }finally{await built.page.close();}
});

test('Graphviz direction proof rejects a corrupted native rankdir',async()=>{
 const built=await graphviz();try{
  const wrongAst={...built.nativeAst,rankdir:'LR'},corrupt=await verifyPresentationQuality(built.page,{svg:built.svg,document,plan:built.plan,nativeAst:wrongAst});
  expect(result(corrupt,directionCheck)?.result).toBe('fail');
 }finally{await built.page.close();}
});

test('Lini qualifies literal tier captions and renderer-owned tier columns',async()=>{
 const built=await lini();try{
  const checks=await built.checks();
  expect(result(checks,'lini-native-carriers')?.result).toBe('pass');
  expect(result(checks,tierColumnsCheck)?.result).toBe('pass');
  expect(requiredPresentationChecks('lini',(await import('../../src/extensions/visual')).getVisual(document)!)).toContain(tierColumnsCheck);
  expect(built.plan.elementMap.filter(item=>item.kind==='group')).toHaveLength(5);
  expect(built.plan.approximations.filter(item=>item.sourcePath.startsWith('/extensions/umf.visual/groups/')&&item.sourcePath.endsWith('/tier'))).toHaveLength(5);
  for(let index=0;index<5;index++){
   const group=built.plan.elementMap.find(item=>item.kind==='group'&&item.sourcePath===`/extensions/umf.visual/groups/${index}`)!;
   const parent=await built.page.locator(`#frame svg g.lini-group[data-id="${group.nativeId}"]`).evaluate(element=>element.parentElement?.closest('g.lini-group')?.getAttribute('data-id')??null);
   expect(parent).toMatch(/^tc\d+$/u);
  }
 }finally{await built.page.close();}
});

test('Lini mapped tier caption mutation fails the native carrier proof',async()=>{
 const built=await lini();try{
  const caption=built.page.locator('#frame svg g.lini-group[data-id="g1"] g.lini-caption text.lini-text');
  expect(await caption.count()).toBe(1);
  await caption.evaluate(element=>{element.textContent='Corrupted tier caption';});
  const checks=await built.checks();expect(result(checks,'lini-native-carriers')?.result).toBe('fail');
  expect(result(checks,'lini-native-carriers')?.details).toContain('literal tier 1');
 }finally{await built.page.close();}
});

test('Lini tier-column proof rejects a peer removed from its renderer-owned wrapper',async()=>{
 const built=await lini();try{
  const peer=built.page.locator('#frame svg g.lini-group[data-id="g1"]');
  const parent=await peer.evaluate(element=>element.parentElement?.closest('g.lini-group')?.getAttribute('data-id')??null);expect(parent).toMatch(/^tc\d+$/u);
  await peer.evaluate(element=>element.parentElement?.parentElement?.appendChild(element));
  const checks=await built.checks();expect(result(checks,tierColumnsCheck)?.result).toBe('fail');
  expect(result(checks,tierColumnsCheck)?.details).toContain('tier 1 column visual is missing');
 }finally{await built.page.close();}
});

test('authored Lini root layout bypasses helper columns and keeps tier captions',async()=>{
 const authored:Visual={...visual,id:'zoned-explicit-native-layout',layout:{kind:'flow',direction:'LR',order:[...visual.groups!].reverse().map(group=>group.id)}};
 const documentWithLayout=createVisualDocument(authored,'test:zoned-explicit-native-layout','1.4.0');
 const built=await liniDocument(documentWithLayout);try{
  const checks=await built.checks();expect(result(checks,'lini-native-carriers')?.result).toBe('pass');
  expect(requiredPresentationChecks('lini',authored)).not.toContain(tierColumnsCheck);
  expect(built.plan.source).not.toContain('|group#tc');
  expect(built.plan.approximations.filter(item=>item.sourcePath.startsWith('/extensions/umf.visual/groups/')&&item.sourcePath.endsWith('/tier'))).toHaveLength(5);
  const texts=(await built.page.locator('#frame svg text.lini-text').allTextContents()).join(' ');
  for(const group of authored.groups!)expect(texts).toContain(`Tier ${group.tier}`);
 }finally{await built.page.close();}
});
