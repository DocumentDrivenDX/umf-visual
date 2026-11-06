// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {chromium,type Browser} from 'playwright';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {createVisualDocument,getVisual,readVisualDocument} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';
import {requiredPresentationChecks} from '../../scripts/presentation/verify';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';

const document=readVisualDocument(readFileSync('fixtures/visual/inventory/beacon-context.json','utf8'),'json') as Document;
const visual=getVisual(document)!;
const runDot=async(plan:PresentationPlan,format:'svg'|'json')=>{
 const child=Bun.spawn(['dot',`-T${format}`],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});child.stdin.write(plan.source);child.stdin.end();
 const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);expect(exit).toBe(0);expect(stderr).toBe('');return stdout;
};
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>await browser?.close());
const finding=(checks:Awaited<ReturnType<typeof verifyPresentationQuality>>,name:string)=>checks.find(check=>check.check===name);

test('all three native backends fully qualify the 13-node 14-edge Beacon context view',async()=>{
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 try{
  for(const backend of ['graphviz','mermaid','lini'] as const){
   const plan=compilePresentation(document,{backend,theme:'presentation/1'});expect(plan.ok,backend).toBe(true);if(!plan.ok)continue;
   expect(plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(13);expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(14);
   let svg:string,nativeAst:unknown;
   if(backend==='graphviz'){
    const [rendered,ast]=await Promise.all([runDot(plan,'svg'),runDot(plan,'json')]);svg=rendered;nativeAst=JSON.parse(ast);
   }else if(backend==='mermaid'){
    await page.setContent('<!doctype html><meta charset="utf-8"><div id="out"></div>');
    await page.addScriptTag({path:resolve(import.meta.dir,'../../node_modules/mermaid/dist/mermaid.min.js')});
    svg=await page.evaluate(async source=>{const mermaid=(window as any).mermaid;mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',deterministicIds:true,deterministicIDSeed:'beacon-context-quality'});return(await mermaid.render('beacon-context-quality',source)).svg;},plan.source);
   }else{
    const rendered=await renderPresentationLini(plan.source);svg=rendered.svg;nativeAst=rendered.nativeAst;
   }
   const checks=await verifyPresentationQuality(page,{svg,document,plan,nativeAst});
   expect(checks.filter(check=>check.result==='fail'),`${backend} full native quality`).toEqual([]);
   for(const name of requiredPresentationChecks(backend,visual))expect(finding(checks,name)?.result,`${backend}/${name}`).toBe('pass');
  }
 }finally{await page.close();}
});

test('a caption moved onto its mapped endpoint is rejected by visible native geometry',async()=>{
 const plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)return;
 const edgeMap=plan.elementMap.find(item=>item.kind==='edge'&&item.logicalId==='customer--helpdesk'),customerMap=plan.elementMap.find(item=>item.kind==='node'&&item.logicalId==='customer');
 expect(edgeMap?.nativeId).toBe('e1');expect(customerMap?.nativeId).toBe('n1');if(!edgeMap||!customerMap)return;
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 try{
  const baseline=await verifyPresentationQuality(page,{svg:native.svg,document,plan,nativeAst:native.nativeAst});
  expect(baseline.filter(check=>check.result==='fail')).toEqual([]);
  const moved=await page.locator('#frame svg').evaluate((svgElement,ids)=>{
   const svg=svgElement as SVGSVGElement,link=svg.querySelector<SVGGElement>(`g.lini-link.lini-style-${ids.edge}`),label=link?.querySelector<SVGTextElement>(':scope > text.lini-link-label'),endpoint=svg.querySelector<SVGGElement>(`g.lini-node[data-id="${ids.customer}"]`);
   if(!link||!label||!endpoint)throw Error('Expected the source-owned caption and mapped customer endpoint carrier.');
   const style=getComputedStyle(label),caption=label.getBoundingClientRect(),host=endpoint.getBoundingClientRect(),matrix=svg.getScreenCTM();
   if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0||caption.width<=0||caption.height<=0||host.width<=0||host.height<=0||!matrix)throw Error('Caption/endpoint visible geometry is unavailable for a meaningful mutation.');
   const beforeOverlap=caption.left<host.right&&caption.right>host.left&&caption.top<host.bottom&&caption.bottom>host.top;
   if(beforeOverlap)throw Error('The source caption already overlaps its endpoint; mutation precondition is not met.');
   const dx=host.left+host.width/2-(caption.left+caption.width/2),dy=host.top+host.height/2-(caption.top+caption.height/2),inverse=matrix.inverse(),origin=new DOMPoint(0,0).matrixTransform(inverse),shifted=new DOMPoint(dx,dy).matrixTransform(inverse),existing=label.getAttribute('transform')??'';
   label.setAttribute('transform',`${existing} translate(${shifted.x-origin.x} ${shifted.y-origin.y})`.trim());
   const after=label.getBoundingClientRect(),overlapsEndpoint=after.left<host.right&&after.right>host.left&&after.top<host.bottom&&after.bottom>host.top;
   if(!overlapsEndpoint)throw Error('CTM-based caption move did not place visible glyph bounds over the endpoint.');
   return svg.outerHTML;
  },{edge:edgeMap.nativeId,customer:customerMap.nativeId});
  const changed=await verifyPresentationQuality(page,{svg:moved,document,plan,nativeAst:native.nativeAst}),endpointCheck=finding(changed,'lini-connection-endpoints');
  expect(endpointCheck?.result).toBe('fail');
  expect(endpointCheck?.details).toContain('customer--helpdesk: owned caption overlaps an endpoint marker or node');
 }finally{await page.close();}
});

test('Lini caption placement and native proofs remain valid when graph identities are renamed',async()=>{
 const renamed=structuredClone(visual),nodeIds=new Map(renamed.nodes!.map((node,index)=>[node.id,'node_'+(index+1)])),edgeIds=new Map(renamed.edges!.map((edge,index)=>[edge.id,'link_'+(index+1)]));
 for(const node of renamed.nodes!)node.id=nodeIds.get(node.id)!;
 for(const edge of renamed.edges!){edge.id=edgeIds.get(edge.id)!;edge.from=nodeIds.get(edge.from)!;edge.to=nodeIds.get(edge.to)!;}
 const renamedDocument=createVisualDocument(renamed,'visual:renamed-context','1.4.0'),plan=compilePresentation(renamedDocument,{backend:'lini',theme:'presentation/1'});
 expect(plan.ok).toBe(true);if(!plan.ok)return;
 expect(plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(13);expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(14);
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 try{
  const checks=await verifyPresentationQuality(page,{svg:native.svg,document:renamedDocument,plan,nativeAst:native.nativeAst});
  expect(checks.filter(check=>check.result==='fail'),JSON.stringify(checks.filter(check=>check.result==='fail'))).toEqual([]);
  for(const name of requiredPresentationChecks('lini',getVisual(renamedDocument)!))expect(finding(checks,name)?.result,`renamed/${name}`).toBe('pass');
 }finally{await page.close();}
});
