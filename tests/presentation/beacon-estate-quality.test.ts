// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {chromium,type Browser} from 'playwright';
import type {Document} from '@umf/core';
import {getVisual,readVisualDocument} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {mermaidSvg} from '../../scripts/presentation/build';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';
import {verifyLiniPresentationQuality} from '../../scripts/presentation/lini-quality';
import {requiredPresentationChecks} from '../../scripts/presentation/verify';

const document=readVisualDocument(readFileSync('fixtures/visual/inventory/beacon-estate.json','utf8'),'json') as Document;
const runDot=async(plan:PresentationPlan,format:'svg'|'json')=>{
 const child=Bun.spawn(['dot',`-T${format}`],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});child.stdin.write(plan.source);child.stdin.end();
 const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);expect(exit).toBe(0);expect(stderr).toBe('');return stdout;
};
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>await browser?.close());
const finding=(checks:Awaited<ReturnType<typeof verifyPresentationQuality>>,name:string)=>checks.find(check=>check.check===name);

test('Graphviz, Mermaid, and Lini preserve the four source nodes and five authored edges',async()=>{
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 try{
  for(const backend of ['graphviz','mermaid','lini'] as const){
   const plan=compilePresentation(document,{backend,theme:'presentation/1'});expect(plan.ok,backend).toBe(true);if(!plan.ok)continue;
   expect(plan.elementMap.filter(item=>item.kind==='node'),backend).toHaveLength(4);
   expect(plan.elementMap.filter(item=>item.kind==='edge'),backend).toHaveLength(5);
   let svg:string,nativeAst:unknown;
   if(backend==='graphviz'){svg=await runDot(plan,'svg');nativeAst=JSON.parse(await runDot(plan,'json'));}
   else if(backend==='mermaid')svg=(await mermaidSvg(page,plan.source,'beacon-estate')).svg;
   else{const rendered=await renderPresentationLini(plan.source);svg=rendered.svg;nativeAst=rendered.nativeAst;}
   const checks=await verifyPresentationQuality(page,{svg,document,plan,nativeAst});
   expect(checks.filter(check=>check.result==='fail'),`${backend}: ${JSON.stringify(checks.filter(check=>check.result==='fail'))}`).toEqual([]);
   for(const required of requiredPresentationChecks(backend,getVisual(document)!))expect(finding(checks,required),`${backend} missing ${required}`).toMatchObject({result:'pass'});
   if(backend==='lini'){
    await page.setContent('<!doctype html><div id="frame"></div>');
    await page.locator('#frame').evaluate((element,markup)=>{element.innerHTML=markup;},svg);
    await page.locator('g.lini-style-e2').evaluate(link=>link.setAttribute('data-to','visual.n3'));
    const mutation=await verifyLiniPresentationQuality(page,{document,plan,nativeAst});
    expect(mutation.find(check=>check.check==='lini-connection-endpoints')?.result).toBe('fail');
    expect(mutation.find(check=>check.check==='lini-connection-endpoints')?.details).toContain('beacon--ledger');
   }
  }
 }finally{await page.close();}
});

test('Lini rejects a connection caption moved onto an unrelated native node',async()=>{
 const plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)return;
 const edge=plan.elementMap.find(item=>item.kind==='edge'&&item.logicalId==='portal--ledger'),middle=plan.elementMap.find(item=>item.kind==='node'&&item.logicalId==='beacon');
 expect(edge?.nativeId).toBe('e3');expect(middle?.nativeId).toBe('n1');if(!edge||!middle)return;
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 try{
  const baseline=await verifyPresentationQuality(page,{svg:native.svg,document,plan,nativeAst:native.nativeAst});
  expect(baseline.filter(check=>check.result==='fail'),JSON.stringify(baseline.filter(check=>check.result==='fail'))).toEqual([]);
  const mutated=await page.locator('#frame svg').evaluate((svgElement,ids)=>{
   const svg=svgElement as SVGSVGElement,link=svg.querySelector<SVGGElement>(`g.lini-link.lini-style-${ids.edge}`),label=link?.querySelector<SVGTextElement>(':scope > text.lini-link-label'),host=svg.querySelector<SVGGElement>(`g.lini-node[data-id="${ids.middle}"]`);
   if(!link||!label||!host)throw Error('Expected the mapped edge caption and unrelated middle-node carrier.');
   const caption=label.getBoundingClientRect(),node=host.getBoundingClientRect(),matrix=svg.getScreenCTM();
   if(caption.width<=0||caption.height<=0||node.width<=0||node.height<=0||!matrix)throw Error('Visible caption/node geometry is unavailable for the overlap mutation.');
   if(caption.left<node.right&&caption.right>node.left&&caption.top<node.bottom&&caption.bottom>node.top)throw Error('The baseline caption already overlaps its unrelated node.');
   const dx=node.left+node.width/2-(caption.left+caption.width/2),dy=node.top+node.height/2-(caption.top+caption.height/2),inverse=matrix.inverse(),origin=new DOMPoint(0,0).matrixTransform(inverse),shifted=new DOMPoint(dx,dy).matrixTransform(inverse);
   label.setAttribute('transform',`${label.getAttribute('transform')??''} translate(${shifted.x-origin.x} ${shifted.y-origin.y})`.trim());
   const moved=label.getBoundingClientRect();if(!(moved.left<node.right&&moved.right>node.left&&moved.top<node.bottom&&moved.bottom>node.top))throw Error('The CTM-based mutation did not move visible caption glyphs onto the unrelated node.');
   return svg.outerHTML;
  },{edge:edge.nativeId,middle:middle.nativeId});
  const checks=await verifyPresentationQuality(page,{svg:mutated,document,plan,nativeAst:native.nativeAst}),endpoint=finding(checks,'lini-connection-endpoints');
  expect(endpoint?.result).toBe('fail');expect(endpoint?.details).toContain('portal--ledger: owned caption overlaps unrelated native node beacon');
 }finally{await page.close();}
});
