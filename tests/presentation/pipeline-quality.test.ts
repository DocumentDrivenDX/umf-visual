// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {mkdirSync,readFileSync} from 'node:fs';
import {chromium,type Browser, type Page} from 'playwright';
import type {Document} from '@umf/core';
import {getVisual,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyLiniPresentationQuality} from '../../scripts/presentation/lini-quality';

const fixture='fixtures/visual/inventory/beacon-ci-ci.json';
const source=readVisualDocument(readFileSync(fixture,'utf8'),'json');
const originalVisual=getVisual(source) as Visual;
const withVisual=(visual:Visual):Document=>({...source,extensions:{...source.extensions,'umf.visual':visual}} as Document);
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>await browser?.close());

async function compiled(document:Document=source){
 const plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan));
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 await page.setContent('<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:#fff}#frame{width:1600px;height:900px;display:flex;align-items:center;justify-content:center}#frame svg{display:block;width:100%;height:100%}</style><div id="frame"></div>');
 await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},native.svg);
 await page.locator('#frame svg').evaluate(root=>{const svg=root as SVGSVGElement;svg.style.maxWidth='none';svg.style.maxHeight='none';svg.style.width='100%';svg.style.height='100%';});
 return{page,plan,native,checks:()=>verifyLiniPresentationQuality(page,{document,plan,nativeAst:native.nativeAst})};
}
const result=(checks:Awaited<ReturnType<typeof verifyLiniPresentationQuality>>,name:string)=>checks.find(check=>check.check===name);

test('native pipeline preserves five node carriers and all four independent dependency paths',async()=>{
 const built=await compiled();try{
  const checks=await built.checks();expect(result(checks,'lini-native-ast')?.result).toBe('pass');expect(result(checks,'lini-native-carriers')?.result).toBe('pass');expect(result(checks,'lini-connection-endpoints')?.result).toBe('pass');expect(result(checks,'lini-containment-and-order')?.result).toBe('pass');
  expect(built.plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(5);expect(built.plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(4);
  const expected=[['lint','build'],['test','build'],['migrations','build'],['build','deploy']];
  for(const[index,[from,to]]of expected.entries()){
   const link=built.page.locator(`g.lini-link.lini-style-e${index+1}`);
   expect(await link.count()).toBe(1);expect(await link.getAttribute('data-from')).toBe(`visual.diagram-content.n${['lint','test','migrations','build','deploy'].indexOf(from!)+1}`);expect(await link.getAttribute('data-to')).toBe(`visual.diagram-content.n${['lint','test','migrations','build','deploy'].indexOf(to!)+1}`);
  }
  const text=(await built.page.locator('#frame svg text.lini-text').allTextContents()).join(' ');for(const label of ['CI','What runs, in what order, when ci.yml starts?','Starts on pull_request, push.','lint','test','Migrations apply cleanly','build','Deploy to the app platform','ubuntu-latest'])expect(text).toContain(label);
  expect(built.plan.elementMap).toContainEqual({logicalId:'/extensions/umf.visual/question',sourcePath:'/extensions/umf.visual/question',nativeId:'pipeline-question-caption',kind:'annotation'});
  expect(built.plan.elementMap).toContainEqual({logicalId:'/extensions/umf.visual/takeaway',sourcePath:'/extensions/umf.visual/takeaway',nativeId:'pipeline-takeaway-footer',kind:'annotation'});
  expect(result(checks,'lini-directed-flow-dependency-ranks')?.result).toBe('pass');
  mkdirSync('.cache/cycle22',{recursive:true});await built.page.screenshot({path:'.cache/cycle22/lini-beacon-ci-ci.png',fullPage:true});
 }finally{await built.page.close();}
});

test('native proof rejects a phantom node, a fabricated serial prerequisite edge, and a moved authored endpoint',async()=>{
 const phantom=await compiled();try{
  await phantom.page.locator('#frame svg g.lini-node[data-id="n1"]').evaluate(element=>{const clone=element.cloneNode(true) as SVGGElement;clone.dataset.id='phantom-node';element.parentElement?.appendChild(clone);});
  const checks=await phantom.checks();expect(checks.some(check=>check.result==='fail')).toBe(true);
 }finally{await phantom.page.close();}

 const serial=await compiled();try{
  await serial.page.locator('#frame svg g.lini-link.lini-style-e1').evaluate(element=>{const clone=element.cloneNode(true) as SVGGElement;clone.classList.remove('lini-style-e1');clone.classList.add('lini-style-e5');clone.setAttribute('data-id','e5');clone.setAttribute('data-from','visual.diagram-content.n1');clone.setAttribute('data-to','visual.diagram-content.n2');element.parentElement?.appendChild(clone);});
  const checks=await serial.checks();expect(result(checks,'lini-connection-endpoints')?.result).toBe('fail');
 }finally{await serial.page.close();}

 const moved=await compiled();try{
  const link=moved.page.locator('#frame svg g.lini-link.lini-style-e1');expect(await link.getAttribute('data-from')).toBe('visual.diagram-content.n1');expect(await link.getAttribute('data-to')).toBe('visual.diagram-content.n4');
  await link.evaluate(element=>element.setAttribute('data-to','visual.diagram-content.n2'));
  const checks=await moved.checks();expect(result(checks,'lini-connection-endpoints')?.result).toBe('fail');
 }finally{await moved.page.close();}
});

test('native automatic pipeline ranks place all prerequisites before build and deploy',async()=>{
 const built=await compiled();try{
  const check=result(await built.checks(),'lini-directed-flow-dependency-ranks');expect(check?.result).toBe('pass');
  const node=built.page.locator('#frame svg g.lini-node[data-id="n1"]');const transform=await node.getAttribute('transform');expect(transform).toMatch(/^translate\([-\d.]+,[-\d.]+\)$/u);
  await node.evaluate(element=>{const match=/^translate\(([-\d.]+),([-\d.]+)\)$/u.exec(element.getAttribute('transform')??'');if(!match)throw Error('expected native translation');element.setAttribute('transform',`translate(${Number(match[1])+200},${Number(match[2])})`);});
  const moved=result(await built.checks(),'lini-directed-flow-dependency-ranks');expect(moved?.result).toBe('fail');expect(moved?.details).toContain('rank');
 }finally{await built.page.close();}
});

test('native endpoint geometry fails when an authored prerequisite connector is moved away from its target',async()=>{
 const built=await compiled();try{
  const edge=built.page.locator('g.lini-link.lini-style-e1 > path:not(.lini-marker)');expect(await edge.count()).toBe(1);
  await edge.evaluate(element=>element.setAttribute('d','M 10000 10000 L 10100 10100'));
  const checks=await built.checks();expect(result(checks,'lini-connection-endpoints')?.result).toBe('fail');
 }finally{await built.page.close();}
});
