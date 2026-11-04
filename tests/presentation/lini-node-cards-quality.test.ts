// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {chromium,type Browser,type Page} from 'playwright';
import type {Document} from '@umf/core';
import {createVisualDocument,getVisual,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {compileLiniPresentation} from '../../src/presentation/lini';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {requiredPresentationChecks} from '../../scripts/presentation/verify';
import {verifyPresentationQuality,type PresentationQualityCheck} from '../../scripts/presentation/quality';

const CHECK='lini-node-cards-non-overlap';
const sourcePath='fixtures/reviews/definitions/tpl-arch-context.json';
const sourceBytes=readFileSync(sourcePath,'utf8');
const sourceDocument=readVisualDocument(sourceBytes,'json') as Document;
const sourceVisual=getVisual(sourceDocument)! as Visual;
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>await browser?.close());
const finding=(checks:PresentationQualityCheck[])=>checks.find(check=>check.check===CHECK);
async function inspect(page:Page,document:Document,plan:PresentationPlan,svg:string,nativeAst:unknown){
 await page.setContent(`<!doctype html><html><body style="margin:0"><div id="frame">${svg}</div></body></html>`);
 return verifyPresentationQuality(page,{svg,document,plan,nativeAst});
}
function requirePlan(plan:ReturnType<typeof compilePresentation>):PresentationPlan{if(!plan.ok)throw Error(JSON.stringify(plan));return plan;}
function expectRequiredPass(checks:PresentationQualityCheck[],visual:Visual,variant:string){const required=requiredPresentationChecks('lini',visual),failures=required.map(id=>checks.find(check=>check.check===id)).filter(check=>check?.result!=='pass');expect(failures.map(check=>`${check?.check}: ${check?.details??'missing'}`),variant).toEqual([]);}
function expectOnlyRequiredFailures(checks:PresentationQualityCheck[],visual:Visual,allowed:string[],variant:string){const required=requiredPresentationChecks('lini',visual),failures=required.map(id=>checks.find(check=>check.check===id)).filter(check=>check?.result!=='pass');expect(failures.map(check=>check!.check).sort(),variant).toEqual([...allowed].sort());}
function renamed(visual:Visual):Visual{
 const copy=structuredClone(visual),ids=new Map((copy.nodes??[]).map((node,index)=>[node.id,`node-renamed-${index+1}`]));
 for(const node of copy.nodes??[])node.id=ids.get(node.id)!;
 for(const edge of copy.edges??[]){edge.from=ids.get(edge.from)!;edge.to=ids.get(edge.to)!;}
 return copy;
}

test('implicit Lini DAG cards must have independently measured, painted, nonoverlapping source-owned boxes',async()=>{
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 try{
  const compiled=requirePlan(compilePresentation(sourceDocument,{backend:'lini',theme:'presentation/1'}));
  expect(requiredPresentationChecks('lini',sourceVisual)).toContain(CHECK);

  // Re-render the exact pre-fix native source; the independent proof must reject its overlapping 165px cards.
  const oldSource=readFileSync('tests/fixtures/presentation/c52-implicit-dag-overlap.lini','utf8');expect(createHash('sha256').update(oldSource).digest('hex')).toBe('148385af37d49e7f71bf5337b431b12093fe21fd2b238de644f8f82cd99d9eeb');const oldRender=await renderPresentationLini(oldSource),baselinePlan={...compiled,source:oldSource};
  const baseline=await inspect(page,sourceDocument,baselinePlan,oldRender.svg,oldRender.nativeAst),baselineCheck=finding(baseline);
  expect(baselineCheck?.result,baselineCheck?.details).toBe('fail');expect(baselineCheck?.details).toContain('overlap');

  const current=await renderPresentationLini(compiled.source),fixed=await inspect(page,sourceDocument,compiled,current.svg,current.nativeAst);
  expect(finding(fixed)?.result,finding(fixed)?.details).toBe('pass');expectRequiredPass(fixed,sourceVisual,'current C52 candidate');

  const renamedVisual=renamed(sourceVisual),renamedDoc=createVisualDocument(renamedVisual,'visual:renamed-context','1.4.0'),renamedPlan=requirePlan(compilePresentation(renamedDoc,{backend:'lini',theme:'presentation/1'})),renamedRender=await renderPresentationLini(renamedPlan.source),renamedChecks=await inspect(page,renamedDoc,renamedPlan,renamedRender.svg,renamedRender.nativeAst);
  expect(finding(renamedChecks)?.result,`renamed IDs: ${finding(renamedChecks)?.details}`).toBe('pass');expectRequiredPass(renamedChecks,renamedVisual,'renamed multiline fan-in LR');

  const smallerVisual=structuredClone(sourceVisual);smallerVisual.nodes=smallerVisual.nodes?.slice(0,3);const retained=new Set(smallerVisual.nodes?.map(node=>node.id));smallerVisual.edges=smallerVisual.edges?.filter(edge=>retained.has(edge.from)&&retained.has(edge.to));
  const smallerDoc=createVisualDocument(smallerVisual,'visual:smaller-context','1.4.0'),smallerPlan=requirePlan(compilePresentation(smallerDoc,{backend:'lini',theme:'presentation/1'})),smallerRender=await renderPresentationLini(smallerPlan.source),smallerChecks=await inspect(page,smallerDoc,smallerPlan,smallerRender.svg,smallerRender.nativeAst);
  expect(finding(smallerChecks)?.result,`different count: ${finding(smallerChecks)?.details}`).toBe('pass');

  const verticalPlan=compileLiniPresentation(sourceVisual,'TB');if(!verticalPlan.ok)throw Error(JSON.stringify(verticalPlan));const verticalRender=await renderPresentationLini(verticalPlan.source),verticalChecks=await inspect(page,sourceDocument,verticalPlan,verticalRender.svg,verticalRender.nativeAst);
  expect(finding(verticalChecks)?.result,`top-to-bottom node-card proof: ${finding(verticalChecks)?.details}`).toBe('pass');expectOnlyRequiredFailures(verticalChecks,sourceVisual,['lini-connection-endpoints','presentation-font-legibility'],'top-to-bottom candidate keeps existing caption/font limitations visible while card proof passes');

  const singleLineVisual=structuredClone(sourceVisual);for(const node of singleLineVisual.nodes??[])node.detail=node.label;
  const singleLineDoc=createVisualDocument(singleLineVisual,'visual:single-line-context','1.4.0'),singleLinePlan=requirePlan(compilePresentation(singleLineDoc,{backend:'lini',theme:'presentation/1'}));const singleLineRender=await renderPresentationLini(singleLinePlan.source),singleLineChecks=await inspect(page,singleLineDoc,singleLinePlan,singleLineRender.svg,singleLineRender.nativeAst);
  expect(finding(singleLineChecks)?.result,`single-line cards: ${finding(singleLineChecks)?.details}`).toBe('pass');

  const explicitVisual=structuredClone(sourceVisual);explicitVisual.layout={kind:'flow',direction:'LR'};
  const explicitDoc=createVisualDocument(explicitVisual,'visual:explicit-context','1.4.0'),explicitPlan=requirePlan(compilePresentation(explicitDoc,{backend:'lini',theme:'presentation/1'}));
  expect(requiredPresentationChecks('lini',explicitVisual)).not.toContain(CHECK);const explicitRender=await renderPresentationLini(explicitPlan.source),explicitChecks=await inspect(page,explicitDoc,explicitPlan,explicitRender.svg,explicitRender.nativeAst);
  expect(finding(explicitChecks),`authored layout is outside implicit DAG card profile`).toBeUndefined();

  const nodeMaps=compiled.elementMap.filter(item=>item.kind==='node'),first=nodeMaps[0]!,second=nodeMaps[2]!;
  await inspect(page,sourceDocument,compiled,current.svg,current.nativeAst);
  const cleanBeforeMove=await inspect(page,sourceDocument,compiled,current.svg,current.nativeAst);expect(finding(cleanBeforeMove)?.result,'fresh CTM mutation baseline').toBe('pass');
  const shifted=await page.locator('#frame svg').evaluate((root,{firstId,secondId})=>{
   const svg=root as SVGSVGElement,first=svg.querySelector<SVGGElement>(`g.lini-node[data-id="${firstId}"]`),second=svg.querySelector<SVGGElement>(`g.lini-node[data-id="${secondId}"]`);if(!first||!second||!first.parentElement)throw Error('Mapped cards are missing for the CTM overlap control.');
   const parent=first.parentElement as unknown as SVGGElement,parentMatrix=parent.getScreenCTM(),firstMatrix=first.getScreenCTM(),secondMatrix=second.getScreenCTM();if(!parentMatrix||!firstMatrix||!secondMatrix)throw Error('A mapped card CTM is unavailable.');
   const firstRect=first.querySelector(':scope > rect')?.getBoundingClientRect(),secondRect=second.querySelector(':scope > rect')?.getBoundingClientRect();if(!firstRect||!secondRect)throw Error('Painted card rectangles are unavailable for the CTM overlap control.');const inverse=parentMatrix.inverse(),currentCenter=new DOMPoint(firstMatrix.e,firstMatrix.f).matrixTransform(inverse),targetScreen={x:secondRect.x+secondRect.width/2,y:secondRect.y+secondRect.height/2-(firstRect.height+secondRect.height)/2+.5},targetCenter=new DOMPoint(targetScreen.x,targetScreen.y).matrixTransform(inverse),dx=targetCenter.x-currentCenter.x,dy=targetCenter.y-currentCenter.y;
   if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.hypot(dx,dy)<1)throw Error('CTM-derived card move is not a finite nonzero translation.');
   const wrapper=document.createElementNS('http://www.w3.org/2000/svg','g');wrapper.setAttribute('transform',`translate(${dx} ${dy})`);parent.insertBefore(wrapper,first);wrapper.appendChild(first);return svg.outerHTML;
  },{firstId:first.nativeId,secondId:second.nativeId});
  const movedChecks=await inspect(page,sourceDocument,compiled,shifted,current.nativeAst);expect(finding(movedChecks)?.result,'CTM-composed card overlap').toBe('fail');

  const cleanBeforeDuplicate=await inspect(page,sourceDocument,compiled,current.svg,current.nativeAst);expect(finding(cleanBeforeDuplicate)?.result,'fresh duplicate mutation baseline').toBe('pass');
  const duplicated=await page.locator('#frame svg').evaluate((root,nativeId)=>{const svg=root as SVGSVGElement,node=svg.querySelector<SVGGElement>(`g.lini-node[data-id="${nativeId}"]`);if(!node)throw Error('Mapped card missing.');node.parentElement?.appendChild(node.cloneNode(true));return svg.outerHTML;},first.nativeId);
  const duplicateChecks=await inspect(page,sourceDocument,compiled,duplicated,current.nativeAst);expect(finding(duplicateChecks)?.result,'duplicate mapped card').toBe('fail');

  const cleanBeforeRootHide=await inspect(page,sourceDocument,compiled,current.svg,current.nativeAst);expect(finding(cleanBeforeRootHide)?.result,'fresh root-opacity mutation baseline').toBe('pass');
  const transparentRoot=await page.locator('#frame svg').evaluate(svg=>{(svg as SVGSVGElement).style.opacity='0';return svg.outerHTML;});
  const rootChecks=await inspect(page,sourceDocument,compiled,transparentRoot,current.nativeAst);expect(finding(rootChecks)?.result,'root opacity hides all card paint').toBe('fail');

  const cleanBeforeMap=await inspect(page,sourceDocument,compiled,current.svg,current.nativeAst);expect(finding(cleanBeforeMap)?.result,'fresh map mutation baseline').toBe('pass');
  const borrowedPlan={...compiled,elementMap:compiled.elementMap.map(item=>item.kind==='node'&&item.logicalId===sourceVisual.nodes![0]!.id?{...item,nativeId:nodeMaps[1]!.nativeId}:item)},borrowedChecks=await inspect(page,sourceDocument,borrowedPlan,current.svg,current.nativeAst);
  expect(finding(borrowedChecks)?.result,'borrowed source-map owner').toBe('fail');
  const cleanBeforeMissingMap=await inspect(page,sourceDocument,compiled,current.svg,current.nativeAst);expect(finding(cleanBeforeMissingMap)?.result,'fresh missing-map baseline').toBe('pass');
  const missingPlan={...compiled,elementMap:compiled.elementMap.filter(item=>!(item.kind==='node'&&item.logicalId===sourceVisual.nodes![0]!.id))},missingChecks=await inspect(page,sourceDocument,missingPlan,current.svg,current.nativeAst);
  expect(finding(missingChecks)?.result,'missing source-node map').toBe('fail');
 }finally{await page.close();}
},{timeout:90_000});
