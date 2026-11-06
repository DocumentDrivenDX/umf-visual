// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {chromium,type Browser} from 'playwright';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {createVisualDocument,getVisual,readVisualDocument} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';
import {verifyLiniPresentationQuality} from '../../scripts/presentation/lini-quality';
import {requiredPresentationChecks} from '../../scripts/presentation/verify';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {mermaidSvg} from '../../scripts/presentation/build';

const document=readVisualDocument(readFileSync('fixtures/visual/inventory/beacon-field-guide.json','utf8'),'json') as Document;
const runDot=async(plan:PresentationPlan,format:'svg'|'json')=>{
 const child=Bun.spawn(['dot',`-T${format}`],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});child.stdin.write(plan.source);child.stdin.end();
 const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);expect(exit).toBe(0);expect(stderr).toBe('');return stdout;
};
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>await browser?.close());
const finding=(checks:Awaited<ReturnType<typeof verifyPresentationQuality>>,name:string)=>checks.find(check=>check.check===name);

test('all three native backends preserve lane membership, seven nodes, and six authored connections',async()=>{
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 try{
  for(const backend of ['graphviz','mermaid','lini'] as const){
   const plan=compilePresentation(document,{backend,theme:'presentation/1'});expect(plan.ok,backend).toBe(true);if(!plan.ok)continue;
   expect(plan.elementMap.filter(item=>item.kind==='node'),backend).toHaveLength(7);expect(plan.elementMap.filter(item=>item.kind==='group'),backend).toHaveLength(4);expect(plan.elementMap.filter(item=>item.kind==='edge'),backend).toHaveLength(6);
   let svg:string,nativeAst:unknown;
   if(backend==='graphviz'){const [rendered,ast]=await Promise.all([runDot(plan,'svg'),runDot(plan,'json')]);svg=rendered;nativeAst=JSON.parse(ast);}
   else if(backend==='mermaid')svg=(await mermaidSvg(page,plan.source,'beacon-field-guide-quality')).svg;
   else{const rendered=await renderPresentationLini(plan.source);svg=rendered.svg;nativeAst=rendered.nativeAst;}
   const checks=await verifyPresentationQuality(page,{svg,document,plan,nativeAst});
   expect(checks.filter(check=>check.result==='fail'),`${backend}: ${JSON.stringify(checks.filter(check=>check.result==='fail'))}`).toEqual([]);
   for(const name of requiredPresentationChecks(backend,getVisual(document)!))expect(finding(checks,name)?.result,`${backend}/${name}`).toBe('pass');
   expect(plan.approximations.filter(item=>item.sourcePath.endsWith('/role')&&item.requested==='Lane group role')).toHaveLength(4);
   expect(plan.omissions.some(item=>item.sourcePath.endsWith('/steps'))).toBe(true);
  }
 }finally{await page.close();}
});

test('renamed source identities stay generic and a corrupted native group identity fails Lini ownership',async()=>{
 const renamed=structuredClone(getVisual(document)!),groupIds=new Map(renamed.groups!.map((group,index)=>[group.id,'lane_'+(index+1)])),nodeIds=new Map(renamed.nodes!.map((node,index)=>[node.id,'item_'+(index+1)])),edgeIds=new Map(renamed.edges!.map((edge,index)=>[edge.id,'connection_'+(index+1)]));
 for(const group of renamed.groups!)group.id=groupIds.get(group.id)!;
 for(const node of renamed.nodes!){node.id=nodeIds.get(node.id)!;if(node.group)node.group=groupIds.get(node.group)!;}
 for(const edge of renamed.edges!){edge.id=edgeIds.get(edge.id)!;edge.from=nodeIds.get(edge.from)!;edge.to=nodeIds.get(edge.to)!;}
 for(const step of renamed.steps??[])step.focus=step.focus?.map(id=>edgeIds.get(id)!);
 const renamedDocument=createVisualDocument(renamed,'visual:renamed-field-guide','1.4.0'),plan=compilePresentation(renamedDocument,{backend:'lini',theme:'presentation/1'});
 expect(plan.ok).toBe(true);if(!plan.ok)return;
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 try{
  const baseline=await verifyPresentationQuality(page,{svg:native.svg,document:renamedDocument,plan,nativeAst:native.nativeAst});
  expect(baseline.filter(check=>check.result==='fail')).toEqual([]);
  const firstLane=plan.elementMap.find(item=>item.kind==='group');expect(firstLane).toBeDefined();if(!firstLane)return;
  await page.setContent('<!doctype html><div id="frame">'+native.svg+'</div>');
  const mutated=await page.locator('#frame svg').evaluate((svgElement,nativeId)=>{const svg=svgElement as SVGSVGElement,carrier=svg.querySelector<SVGGElement>(`g.lini-group[data-id="${nativeId}"]`);if(!carrier)throw Error('Expected mapped native lane carrier.');carrier.setAttribute('data-id','forged-lane');return svg.outerHTML;},firstLane.nativeId);
  await page.locator('#frame').evaluate((frame,markup)=>{frame.innerHTML=markup;},mutated);
  const checks=await verifyLiniPresentationQuality(page,{document:renamedDocument,plan,nativeAst:native.nativeAst});
  expect(checks.find(check=>check.check==='lini-native-carriers')?.result).toBe('fail');
 }finally{await page.close();}
});
