// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {mkdirSync,readFileSync} from 'node:fs';
import {chromium,type Browser, type Page} from 'playwright';
import type {Document} from '@umf/core';
import {createVisualDocument,getVisual,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {compileLiniNestedPresentation} from '../../src/presentation/lini-nested';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyPresentationQuality,type PresentationQualityCheck} from '../../scripts/presentation/quality';
import {verifyLiniPresentationQuality} from '../../scripts/presentation/lini-quality';
import {isUnsupportedPresentationDiagnostics} from '../../scripts/presentation/build';
import {requiredPresentationChecks} from '../../scripts/presentation/verify';

const document=readVisualDocument(readFileSync('fixtures/visual/inventory/beacon-estate-landscape.json','utf8'),'json') as Document;
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>await browser?.close(),{timeout:30_000});

async function built(documentToCompile:Document=document){
 const plan=compilePresentation(documentToCompile,{backend:'lini',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan));
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 const full=await verifyPresentationQuality(page,{svg:native.svg,document:documentToCompile,plan,nativeAst:native.nativeAst});
 return{plan:plan as PresentationPlan,native,page,full,focused:()=>verifyLiniPresentationQuality(page,{document:documentToCompile,plan,nativeAst:native.nativeAst})};
}
const result=(checks:PresentationQualityCheck[],name:string)=>checks.find(check=>check.check===name);

test('Lini draws exact source-parent containers and leaves with owned labels and metadata',async()=>{
 const output=await built();try{
  mkdirSync('.cache/cycle28',{recursive:true});await output.page.screenshot({path:'.cache/cycle28/lini-nested.png'});
  expect(output.full.filter(check=>check.result==='fail'),JSON.stringify(output.full)).toEqual([]);
 const required=requiredPresentationChecks('lini',getVisual(document)!);
  expect(required).toContain('lini-nested-parent-containment');
  for(const name of required)expect(result(output.full,name),`missing required check ${name}`).toMatchObject({result:'pass'});
  expect(result(output.full,'lini-nested-source-node-identity')?.result).toBe('pass');
  expect(result(output.full,'lini-nested-parent-containment')?.details).toContain('10 node carriers');
 }finally{await output.page.close();}
});

test('native proof rejects a node moved outside its source parent container',async()=>{
 const output=await built();try{
  await output.page.locator('#frame svg [data-id="n6"]').evaluate(element=>{
   const svg=(element as SVGElement).ownerSVGElement,destination=svg?.querySelector('[data-id="nested-roots"]');destination?.appendChild(element);
  });
  const checks=await output.focused();
  expect(result(checks,'lini-nested-parent-containment')?.result).toBe('fail');
  expect(result(checks,'lini-nested-parent-containment')?.details).toContain('nearest mapped native container');
 }finally{await output.page.close();}
});

test('native proof rejects hidden source status text and an unmapped phantom container',async()=>{
 const hidden=await built();try{
  await hidden.page.locator('#frame svg [data-id="n10-status"]').evaluate(element=>{(element as SVGElement).style.display='none';});
  const checks=await hidden.focused();
  expect(result(checks,'lini-native-carriers')?.result).toBe('fail');
  expect(result(checks,'lini-native-carriers')?.details).toContain('status');
 }finally{await hidden.page.close();}
 const phantom=await built();try{
  await phantom.page.locator('#frame svg [data-id="n3"]').evaluate(element=>{
   const clone=element.cloneNode(true) as Element;clone.setAttribute('data-id','n-phantom');element.parentElement?.appendChild(clone);
  });
  const checks=await phantom.focused();
  expect(result(checks,'lini-nested-parent-containment')?.result).toBe('fail');
  expect(result(checks,'lini-nested-parent-containment')?.details).toContain('unmapped native node/container');
 }finally{await phantom.page.close();}
});

test('native proof rejects an unmapped visible text block carrier',async()=>{
 const output=await built();try{
  await output.page.locator('#frame svg [data-id="n10-status"]').evaluate(element=>{
   const clone=element.cloneNode(true) as Element;clone.setAttribute('data-id','phantom-visible-text');element.closest('[data-id="nested-scene"]')?.appendChild(clone);
  });
  const checks=await output.focused();
  expect(result(checks,'lini-native-carriers')?.result).toBe('fail');
  expect(result(checks,'lini-native-carriers')?.details).toContain('phantom-visible-text');
 }finally{await output.page.close();}
});

test('two-root question-only trees honor authored root order without fixed node counts',async()=>{
 const smallVisual:Visual={id:'small-nested-forest',kind:'structure',form:'nested',question:'Which two roots contain their own children?',layout:{kind:'flow',direction:'LR',order:['root-a','root-z']},nodes:[
  {id:'root-z',label:'Root -> Z'},
  {id:'child-z',label:'Child Z',detail:'Z detail\ncontinued on another line',parent:'root-z'},
  {id:'root-a',label:'Root A'},
  {id:'child-a',label:'Child A',status:'built',parent:'root-a'},
 ]};
 const source=JSON.stringify(smallVisual),small=createVisualDocument(smallVisual,'test:small-nested-forest','1.4.0') as Document,output=await built(small);
 try{
  expect(JSON.stringify(smallVisual)).toBe(source);
  expect(output.plan.elementMap.filter(row=>row.kind==='node')).toHaveLength(4);
  expect(output.plan.elementMap.filter(row=>row.kind==='visual').map(row=>row.sourcePath)).toEqual(['/extensions/umf.visual/id','/extensions/umf.visual/question']);
  expect(output.plan.source).toContain('Root -> Z');
  expect(output.plan.elementMap.filter(row=>row.kind==='edge')).toHaveLength(0);
  expect(output.full.filter(check=>check.result==='fail'),JSON.stringify(output.full)).toEqual([]);
  expect(result(output.full,'lini-nested-parent-containment')?.result).toBe('pass');
 }finally{await output.page.close();}
});

test('Lini nested compiler refuses unknown keys at escaped source pointers',()=>{
 const base=getVisual(document)!;
 const topUnknown={...base,'vendor/key':'unmodeled'} as unknown as Visual;
 expect(compileLiniNestedPresentation(topUnknown)).toMatchObject({ok:false,diagnostics:[{path:'/extensions/umf.visual/vendor~1key'}]});
 const nodeUnknown={...base,nodes:base.nodes!.map((node,index)=>index===0?{...node,'vendor/key':'unmodeled'}:node)} as unknown as Visual;
 expect(compileLiniNestedPresentation(nodeUnknown)).toMatchObject({ok:false,diagnostics:[{path:'/extensions/umf.visual/nodes/0/vendor~1key'}]});
});

test('valid unsupported layout and malformed empty forest have distinct refusal classes',()=>{
 const visual=getVisual(document)!;
 const gridVisual={...visual,layout:{kind:'grid',columns:2,order:['estate']}} as Visual;
 const grid=compileLiniNestedPresentation(gridVisual);
 expect(grid).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_LINI_NESTED_LAYOUT',path:'/extensions/umf.visual/layout'}]});
 if(!grid.ok)expect(isUnsupportedPresentationDiagnostics(grid.diagnostics)).toBe(true);
 const emptyVisual={...visual,nodes:[]} as Visual;
 const empty=compileLiniNestedPresentation(emptyVisual);
 expect(empty).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_LINI_NESTED_INVALID',path:'/extensions/umf.visual/nodes'}]});
 if(!empty.ok)expect(isUnsupportedPresentationDiagnostics(empty.diagnostics)).toBe(false);
});
