// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {chromium,type Browser,type Page} from 'playwright';
import type {Document} from '@umf/core';
import {createVisualDocument,getVisual,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {verifyPresentationQuality,type PresentationQualityCheck} from '../../scripts/presentation/quality';
import {verifyGraphvizGroupHeaderQuality} from '../../scripts/presentation/graphviz-group-header-quality';
import {requiredPresentationChecks} from '../../scripts/presentation/verify';

const fixture=readVisualDocument(readFileSync('fixtures/visual/inventory/beacon-reply-presentation.json','utf8'),'json') as Document;
const checkName='graphviz-group-header-edge-clearance';
const markup='<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:#fff}#frame{width:1600px;height:900px}#frame svg{width:100%;height:100%}</style><div id="frame"></div>';
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>await browser?.close(),{timeout:30_000});

type Built={document:Document;visual:Visual;plan:PresentationPlan;svg:string;ast:unknown;page:Page;checks:PresentationQualityCheck[]};
async function dot(source:string,format:'svg'|'json'){
 const process=Bun.spawn(['dot',`-T${format}`],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});process.stdin.write(source);process.stdin.end();
 const [stdout,stderr,exit]=await Promise.all([new Response(process.stdout).text(),new Response(process.stderr).text(),process.exited]);expect(exit,stderr).toBe(0);expect(stderr).toBe('');return stdout;
}
async function attach(page:Page,svg:string){await page.setContent(markup,{waitUntil:'domcontentloaded'});await page.locator('#frame').evaluate((frame,content)=>{frame.innerHTML=content;},svg);}
async function render(document:Document):Promise<Built>{
 const plan=compilePresentation(document,{backend:'graphviz',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan));
 const [svg,json]=await Promise.all([dot(plan.source,'svg'),dot(plan.source,'json')]),ast=JSON.parse(json),page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});await attach(page,svg);
 const checks=await verifyPresentationQuality(page,{svg,document,plan,nativeAst:ast});return{document,visual:getVisual(document)!,plan,svg,ast,page,checks};
}
async function verifyFresh(built:Built,mutate:(page:Page)=>Promise<void>){
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});try{await attach(page,built.svg);await mutate(page);const svg=await page.locator('#frame svg').evaluate(element=>element.outerHTML);await page.locator('#frame').evaluate((frame,content)=>{frame.innerHTML=content;},svg);return[await verifyGraphvizGroupHeaderQuality(page,{document:built.document,plan:built.plan})];}finally{await page.close();}
}
async function clusterByTitle(page:Page,nativeId:string){
 const all=page.locator('#frame svg g.cluster'),index=await all.evaluateAll((clusters,id)=>clusters.findIndex(item=>item.querySelector(':scope > title')?.textContent?.trim()==='cluster_'+id),nativeId);
 expect(index,`Graphviz cluster ${nativeId} exists`).toBeGreaterThanOrEqual(0);return all.nth(index);
}
async function nodeByTitle(page:Page,nativeId:string){
 const all=page.locator('#frame svg g.node'),index=await all.evaluateAll((nodes,id)=>nodes.findIndex(item=>item.querySelector(':scope > title')?.textContent?.trim()===id),nativeId);
 expect(index,`Graphviz node ${nativeId} exists`).toBeGreaterThanOrEqual(0);return all.nth(index);
}
const result=(checks:PresentationQualityCheck[],name=checkName)=>checks.find(check=>check.check===name);
function mapped(plan:PresentationPlan,kind:'group'|'edge',sourceId:string,index:number){const row=plan.elementMap.find(item=>item.kind===kind&&item.logicalId===sourceId&&item.sourcePath===`/extensions/umf.visual/${kind==='group'?'groups':'edges'}/${index}`);expect(row,`${kind} ${sourceId} source-map row`).toBeDefined();return row!;}
async function placeHeaderOverEdge(page:Page,groupId:string,edgeId:string,wrapInAnchor=false){
 await page.locator('#frame svg').evaluate((root,{groupId,edgeId,wrapInAnchor})=>{
  const svg=root as SVGSVGElement,group=[...svg.querySelectorAll<SVGGElement>('g.cluster')].find(item=>item.querySelector(':scope > title')?.textContent?.trim()==='cluster_'+groupId),header=group?.querySelector<SVGTextElement>(':scope > text'),edge=[...svg.querySelectorAll<SVGGElement>('g.edge')].find(item=>item.id===edgeId||item.querySelector(':scope > title')?.textContent?.trim()===edgeId),path=edge?.querySelector<SVGPathElement>('path');
  if(!group||!header||!edge||!path)throw Error(`Mapped ${groupId}/${edgeId} group and edge carriers must exist.`);
  if(wrapInAnchor){const anchor=svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg','a');path.parentNode!.insertBefore(anchor,path);anchor.append(path);if(!path.closest('a')?.isSameNode(anchor))throw Error('Mapped edge path did not become an SVG anchor descendant.');}
  const length=path.getTotalLength(),matrix=path.getScreenCTM();if(!length||!matrix)throw Error('Mapped painted edge has no measurable path center.');const point=path.getPointAtLength(length/2),screen=new DOMPoint(point.x,point.y).matrixTransform(matrix),rootBounds=svg.getBoundingClientRect(),target={x:screen.x-rootBounds.left,y:screen.y-rootBounds.top},bounds=header.getBoundingClientRect(),dx=target.x-(bounds.left+bounds.right)/2,dy=target.y-(bounds.top+bounds.bottom)/2,parent=header.parentElement as SVGGraphicsElement|null,parentMatrix=parent?.getScreenCTM();if(!parentMatrix)throw Error('Mapped cluster heading has no parent SVG transform.');const inverse=parentMatrix.inverse(),delta=new DOMPoint(dx,dy).matrixTransform(inverse),origin=new DOMPoint(0,0).matrixTransform(inverse),existing=header.getAttribute('transform')??'';header.setAttribute('transform',`translate(${delta.x-origin.x} ${delta.y-origin.y}) ${existing}`.trim());
  const moved=header.getBoundingClientRect();if(!(target.x>=moved.left&&target.x<=moved.right&&target.y>=moved.top&&target.y<=moved.bottom))throw Error(`Header collision mutation did not move actual text glyph bounds onto the mapped edge: target ${target.x},${target.y}, bounds ${moved.x},${moved.y},${moved.width},${moved.height}.`);
 },{groupId,edgeId,wrapInAnchor});
}

const generic:Visual={id:'renamed-group-header-proof',kind:'flow',form:'network',question:'Which boundary contains the reviewed release?',groups:[
 {id:'review-cell',label:'Review cell',detail:'Authored review boundary',role:'region'},
 {id:'delivery-zone',label:'Delivery zone',detail:'Release boundary',role:'zone'},
],nodes:[
 {id:'writer',label:'Writer',group:'review-cell'},
 {id:'editor',label:'Editor',group:'review-cell'},
 {id:'sender',label:'Message sender',group:'delivery-zone'},
 {id:'inbox',label:'Recipient inbox',group:'delivery-zone'},
],edges:[
 {id:'reviewed-handoff',from:'writer',to:'sender',label:'send approved text',why:'The source-owned tooltip stays associated with this edge.'},
 {id:'delivery-return',from:'sender',to:'editor',label:'return delivery receipt'},
]};

const exactTierLabels:Visual={id:'exact-tier-label-dedup-proof',kind:'flow',form:'zoned',question:'Which tier owns each service?',groups:[
 {id:'first-tier-one',label:'Tier 1',role:'zone',tier:1},
 {id:'second-tier-one',label:'Tier 1',role:'zone',tier:1},
 {id:'services',label:'Services',role:'zone',tier:2},
 {id:'fourth-tier',label:'Tier 4',role:'zone',tier:4},
],nodes:[
 {id:'first-node',label:'First service',group:'first-tier-one'},
 {id:'second-node',label:'Second service',group:'second-tier-one'},
 {id:'service-node',label:'Service cluster',group:'services'},
 {id:'fourth-node',label:'Fourth service',group:'fourth-tier'},
],edges:[{id:'first-to-second',from:'first-node',to:'second-node',label:'separate source owners'}]};

async function verifyFreshCheck(built:Built,mutate:(page:Page)=>Promise<void>,documentOverride:Document=built.document,planOverride:PresentationPlan=built.plan){
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});try{await attach(page,built.svg);await mutate(page);const svg=await page.locator('#frame svg').evaluate(element=>element.outerHTML);await page.locator('#frame').evaluate((frame,content)=>{frame.innerHTML=content;},svg);return await verifyGraphvizGroupHeaderQuality(page,{document:documentOverride,plan:planOverride});}finally{await page.close();}
}
async function setGroupCaption(page:Page,nativeId:string,value:string|undefined){
 const cluster=await clusterByTitle(page,nativeId),caption=cluster.locator(':scope > text').first();expect(await caption.count()).toBe(1);
 if(value===undefined)await caption.evaluate(element=>element.remove());else await caption.evaluate((element,text)=>{element.textContent=text;},value);
}

test('Graphviz zoned tier captions deduplicate only exact authored labels and retain source-owned groups',async()=>{
 const source=createVisualDocument(exactTierLabels,'test:exact-tier-label-dedup-proof','1.4.0'),built=await render(source);try{
  expect(built.plan.elementMap.filter(item=>item.kind==='group')).toHaveLength(4);
  const mappedGroups=exactTierLabels.groups!.map((group,index)=>mapped(built.plan,'group',group.id,index));
  expect(new Set(mappedGroups.map(group=>group.nativeId)).size).toBe(4);
  const baseline=result(built.checks);expect(baseline?.result,baseline?.details).toBe('pass');
  for(const [index,expected] of ['Tier 1','Tier 1','Services Tier 2','Tier 4'].entries()){
   const cluster=await clusterByTitle(built.page,mappedGroups[index]!.nativeId),text=await cluster.locator(':scope > text').allTextContents();
   expect(text.join(' ').replace(/\s+/gu,' ').trim(),`group ${exactTierLabels.groups![index]!.id} native caption`).toBe(expected);
  }

  const first=await verifyFreshCheck(built,page=>setGroupCaption(page,mappedGroups[0]!.nativeId,undefined));
  expect(first.result).toBe('fail');expect(first.details).toContain('glyph runs are missing');
  const wrongTier=await verifyFreshCheck(built,page=>setGroupCaption(page,mappedGroups[2]!.nativeId,'Services Tier 9'));
  expect(wrongTier.result).toBe('fail');expect(wrongTier.details).toContain('glyph runs are missing');
  const crossBorrow=await verifyFreshCheck(built,page=>setGroupCaption(page,mappedGroups[2]!.nativeId,'Tier 4'));
  expect(crossBorrow.result).toBe('fail');expect(crossBorrow.details).toContain('glyph runs are missing');

  const wrongTierSource=createVisualDocument({...exactTierLabels,groups:exactTierLabels.groups!.map((group,index)=>index===2?{...group,tier:9}:group)},'test:wrong-source-tier','1.4.0');
  const wrongSource=await verifyFreshCheck(built,async()=>{},wrongTierSource,built.plan);
  expect(wrongSource.result).toBe('fail');expect(wrongSource.details).toContain('glyph runs are missing');
  const swappedMap={...built.plan,elementMap:built.plan.elementMap.map(item=>item.kind==='group'&&item.logicalId==='services'?{...item,sourcePath:'/extensions/umf.visual/groups/3'}:item.kind==='group'&&item.logicalId==='fourth-tier'?{...item,sourcePath:'/extensions/umf.visual/groups/2'}:item)};
  const wrongOwner=await verifyFreshCheck(built,async()=>{},built.document,swappedMap);
  expect(wrongOwner.result).toBe('fail');expect(wrongOwner.details).toContain('Group source ownership is missing or duplicated');
 }finally{await built.page.close();}
 const derived=readVisualDocument(readFileSync('fixtures/reviews/definitions/tpl-arch-deployment.json','utf8'),'json') as Document,derivedBuilt=await render(derived);try{
  expect(derivedBuilt.visual.groups?.length).toBeGreaterThan(0);
  expect(result(derivedBuilt.checks)?.result,result(derivedBuilt.checks)?.details).toBe('pass');
  expect(derivedBuilt.plan.elementMap.filter(item=>item.kind==='group')).toHaveLength(derivedBuilt.visual.groups!.length);
 }finally{await derivedBuilt.page.close();}
},{timeout:90_000});

 test('Graphviz group headers preserve bottom-left clearance, while centered native DOT reproduces the Cycle 34 collision',async()=>{
  const built=await render(fixture);try{
   const required=requiredPresentationChecks('graphviz',built.visual);expect(required).toContain(checkName);
   for(const name of required)expect(result(built.checks,name)?.result,`${name}: ${result(built.checks,name)?.details??'missing check'}`).toBe('pass');
   expect(built.plan.elementMap.filter(item=>item.kind==='group')).toHaveLength(5);expect(built.plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(15);
   const centeredSource=built.plan.source.replace(/;\s*labelloc="b";/gu,';');expect(centeredSource).not.toBe(built.plan.source);expect([...centeredSource.matchAll(/subgraph cluster_/gu)]).toHaveLength(5);
   const centeredSvg=await dot(centeredSource,'svg'),centeredPage=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});try{await attach(centeredPage,centeredSvg);const centered=await verifyGraphvizGroupHeaderQuality(centeredPage,{document:built.document,plan:built.plan});expect(centered.result).toBe('fail');expect(centered.details).toContain('mapped group-header/edge pair(s) intersect');}finally{await centeredPage.close();}
  }finally{await built.page.close();}
 },{timeout:90_000});

 test('Graphviz group-header clearance preserves the earlier LR fixtures and the current TB fixture',async()=>{
  const cases=[
   {path:'fixtures/reviews/definitions/miro-nested-environments.json',rankdir:'LR'},
   {path:'fixtures/visual/inventory/beacon-containers.json',rankdir:'LR'},
   {path:'fixtures/visual/inventory/beacon-reply-presentation.json',rankdir:'TB'},
  ] as const;
  for(const {path,rankdir} of cases){
   const document=readVisualDocument(readFileSync(path,'utf8'),'json') as Document,built=await render(document);try{
    expect((built.ast as {rankdir?:string}).rankdir,`${path} native Graphviz axis`).toBe(rankdir);
    const required=requiredPresentationChecks('graphviz',built.visual);expect(required).toContain(checkName);
    for(const name of required)expect(result(built.checks,name),`${path}/${name}: ${result(built.checks,name)?.details??'missing check'}`).toMatchObject({result:'pass'});
   }finally{await built.page.close();}
  }
 },{timeout:90_000});

 test('Graphviz group-header proof supports renamed groups, a different count, and tooltip-wrapped edge paths',async()=>{
  const document=createVisualDocument(generic,'test:renamed-group-header-proof','1.4.0'),built=await render(document);try{
   const required=requiredPresentationChecks('graphviz',built.visual);expect(required).toContain(checkName);
   for(const name of required)expect(result(built.checks,name)?.result,`${name}: ${result(built.checks,name)?.details??'missing check'}`).toBe('pass');
   expect(built.plan.elementMap.filter(item=>item.kind==='group')).toHaveLength(2);expect(built.plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(2);
   const tooltipEdge=mapped(built.plan,'edge','reviewed-handoff',0),path=await built.page.locator(`#frame svg g.edge[id="${tooltipEdge.nativeId}"] path`).count();expect(path).toBeGreaterThan(0);
   expect(await built.page.locator(`#frame svg g.edge[id="${tooltipEdge.nativeId}"] path`).evaluate(element=>element.closest('a')!==null)).toBe(true);
  }finally{await built.page.close();}
 },{timeout:90_000});

 test('Graphviz group-header proof rejects source-owned SVG text and painted-path corruption independently',async()=>{
  const built=await render(fixture);try{
   const appGroup=mapped(built.plan,'group',built.visual.groups![2]!.id,2),appNodeSource=built.visual.nodes!.findIndex(node=>node.group===built.visual.groups![2]!.id),appNode=built.visual.nodes![appNodeSource]!,appNodeMap=built.plan.elementMap.find(item=>item.kind==='node'&&item.logicalId===appNode.id&&item.sourcePath===`/extensions/umf.visual/nodes/${appNodeSource}`)!;
   expect(await built.page.locator('#frame svg g.cluster > title').count()).toBe(5);
   const hiddenHeader=await verifyFresh(built,async page=>{const cluster=await clusterByTitle(page,appGroup.nativeId);await cluster.locator(':scope > text').first().evaluate(element=>{(element as SVGElement).setAttribute('visibility','hidden');});});
   expect(result(hiddenHeader)?.result).toBe('fail');expect(result(hiddenHeader)?.details).toContain('group header glyph runs');
   const transparentHeader=await verifyFresh(built,async page=>{const cluster=await clusterByTitle(page,appGroup.nativeId);await cluster.locator(':scope > text').first().evaluate(element=>{const text=element as SVGElement;text.setAttribute('fill-opacity','0');if(getComputedStyle(text).fillOpacity!=='0')throw Error('Header glyph transparency did not take effect.');});});
   expect(result(transparentHeader)?.result).toBe('fail');expect(result(transparentHeader)?.details).toContain('group header glyph runs');
   const requiredLine=await verifyFresh(built,async page=>{const cluster=await clusterByTitle(page,appGroup.nativeId);await cluster.locator(':scope > text').evaluateAll(elements=>{const header=elements.find(element=>(element.textContent??'').trim()==='App platform');if(!header)throw Error('Expected first App platform header line.');header.remove();});});
   expect(result(requiredLine)?.result).toBe('fail');
   const hiddenTspan=await verifyFresh(built,async page=>{const cluster=await clusterByTitle(page,appGroup.nativeId);await cluster.locator(':scope > text').first().evaluate(element=>{const text=element as SVGTextElement;if(text.textContent?.trim()!=='App platform')throw Error('Expected complete visible header words.');text.replaceChildren();const shown=text.ownerDocument.createElementNS('http://www.w3.org/2000/svg','tspan'),hidden=text.ownerDocument.createElementNS('http://www.w3.org/2000/svg','tspan');shown.textContent='App ';hidden.textContent='platform';hidden.setAttribute('visibility','hidden');text.append(shown,hidden);if(text.textContent!=='App platform'||getComputedStyle(hidden).visibility!=='hidden')throw Error('Hidden header tspan mutation did not preserve textContent while hiding glyphs.');});});
   expect(result(hiddenTspan)?.result).toBe('fail');
   const transparentTspan=await verifyFresh(built,async page=>{const cluster=await clusterByTitle(page,appGroup.nativeId);await cluster.locator(':scope > text').first().evaluate(element=>{const text=element as SVGTextElement;if(text.textContent?.trim()!=='App platform')throw Error('Expected complete visible header words.');text.replaceChildren();const shown=text.ownerDocument.createElementNS('http://www.w3.org/2000/svg','tspan'),transparent=text.ownerDocument.createElementNS('http://www.w3.org/2000/svg','tspan');shown.textContent='App ';transparent.textContent='platform';transparent.setAttribute('fill-opacity','0');text.append(shown,transparent);if(text.textContent!=='App platform'||getComputedStyle(transparent).fillOpacity!=='0')throw Error('Transparent header tspan mutation did not preserve textContent while removing glyph paint.');});});
   expect(result(transparentTspan)?.result).toBe('fail');
   const rootOpacity=await verifyFresh(built,async page=>page.locator('#frame svg').evaluate(svg=>{svg.style.opacity='0';if(getComputedStyle(svg).opacity!=='0'||svg.querySelectorAll('g.cluster,g.edge').length===0)throw Error('Root SVG opacity mutation did not preserve mapped geometry.');}));
   expect(result(rootOpacity)?.result).toBe('fail');
   const extraHeader=await verifyFresh(built,async page=>{const cluster=await clusterByTitle(page,appGroup.nativeId);await cluster.evaluate(element=>{const extra=element.ownerDocument.createElementNS('http://www.w3.org/2000/svg','text');extra.setAttribute('x','800');extra.setAttribute('y','400');extra.textContent='Unmapped extra heading';element.append(extra);});});
   expect(result(extraHeader)?.result).toBe('fail');
   const nodeOwnedHeader=await verifyFresh(built,async page=>{const cluster=await clusterByTitle(page,appGroup.nativeId);await cluster.locator(':scope > text').evaluateAll(elements=>{const line=elements.find(text=>(text.textContent??'').trim()==='App platform');if(!line)throw Error('Expected App platform group header text.');line.remove();});const node=await nodeByTitle(page,appNodeMap.nativeId);await node.evaluate((node,{groupName})=>{const substitute=node.ownerDocument.createElementNS('http://www.w3.org/2000/svg','text');substitute.setAttribute('x','700');substitute.setAttribute('y','500');substitute.textContent=groupName;node.append(substitute);if([...node.querySelectorAll('text')].every(text=>(text.textContent??'').trim()!==groupName))throw Error('Wrong-owner node text mutation was not applied.');},{groupName:'App platform'});});
   expect(result(nodeOwnedHeader)?.result).toBe('fail');
   const sourceOwner=mapped(built.plan,'group',built.visual.groups![2]!.id,2),paintedEdge=mapped(built.plan,'edge',built.visual.edges![0]!.id,0);
   const overlap=await verifyFresh(built,page=>placeHeaderOverEdge(page,sourceOwner.nativeId,paintedEdge.nativeId));
   expect(result(overlap)?.result).toBe('fail');expect(result(overlap)?.details).toContain('mapped group-header/edge pair(s) intersect');
   const anchoredOverlap=await verifyFresh(built,page=>placeHeaderOverEdge(page,sourceOwner.nativeId,mapped(built.plan,'edge',built.visual.edges![1]!.id,1).nativeId,true));
   expect(result(anchoredOverlap)?.result).toBe('fail');expect(result(anchoredOverlap)?.details).toContain('mapped group-header/edge pair(s) intersect');
  }finally{await built.page.close();}
 },{timeout:120_000});
