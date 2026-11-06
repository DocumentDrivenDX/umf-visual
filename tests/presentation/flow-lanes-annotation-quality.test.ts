// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {chromium,type Browser,type Page} from 'playwright';
import type {Document} from '@umf/core';
import {createVisualDocument,getVisual,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationBackend,type PresentationPlan} from '../../src/presentation';
import {mermaidSvg} from '../../scripts/presentation/build';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {requiredPresentationChecks} from '../../scripts/presentation/verify';
import {verifyPresentationQuality,type PresentationQualityCheck} from '../../scripts/presentation/quality';

const source=readVisualDocument(readFileSync('fixtures/reviews/definitions/tpl-so-map.json','utf8'),'json') as Document;
const annotationCheck='flow-annotation-native-text';
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>await browser?.close(),{timeout:30_000});
type Built={backend:PresentationBackend;document:Document;visual:Visual;plan:PresentationPlan;svg:string;nativeAst?:unknown;checks:PresentationQualityCheck[];page:Page};
const named=(checks:PresentationQualityCheck[],id:string)=>checks.find(item=>item.check===id);
async function dot(plan:PresentationPlan,format:'svg'|'json'){
 const child=Bun.spawn(['dot',`-T${format}`],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});child.stdin.write(plan.source);child.stdin.end();
 const[stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);expect(exit,stderr).toBe(0);expect(stderr).toBe('');return stdout;
}
async function render(document:Document,backend:PresentationBackend):Promise<Built>{
 const plan=compilePresentation(document,{backend,theme:'presentation/1'});expect(plan.ok,plan.ok?'':JSON.stringify(plan)).toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan));
 let svg:string,nativeAst:unknown;
 if(backend==='graphviz'){const[rendered,ast]=await Promise.all([dot(plan,'svg'),dot(plan,'json')]);svg=rendered;nativeAst=JSON.parse(ast);}
 else if(backend==='mermaid'){const page=await browser.newPage();try{svg=(await mermaidSvg(page,plan.source,`lane-annotations-${document.id.replace(/[^a-z0-9-]/giu,'-')}`)).svg;}finally{await page.close();}}
 else{const rendered=await renderPresentationLini(plan.source);svg=rendered.svg;nativeAst=rendered.nativeAst;}
 const visual=getVisual(document)!,page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1}),checks=await verifyPresentationQuality(page,{svg,document,plan,nativeAst});
 return{backend,document,visual,plan,svg,nativeAst,checks,page};
}
async function mutation(built:Built,change:(page:Page,ids:string[])=>Promise<void>,plan=built.plan){
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});try{
  const clean=await verifyPresentationQuality(page,{svg:built.svg,document:built.document,plan:built.plan,nativeAst:built.nativeAst});expect(named(clean,annotationCheck)?.result,`${built.backend} fresh negative baseline`).toBe('pass');
  await page.setContent('<!doctype html><div id="frame"></div>');await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},built.svg);
  const ids=built.visual.annotations!.map((_,index)=>built.plan.elementMap.find(item=>item.kind==='annotation'&&item.sourcePath===`/extensions/umf.visual/annotations/${index}/id`)!.nativeId);
  await change(page,ids);const svg=await page.locator('#frame svg').evaluate(element=>element.outerHTML);
  return named(await verifyPresentationQuality(page,{svg,document:built.document,plan,nativeAst:built.nativeAst}),annotationCheck);
 }finally{await page.close();}
}
async function replaceOwnedText(page:Page,id:string,text:string,hide=false){
 await page.locator('#frame svg').evaluate((root,{id,text,hide})=>{
  const svg=root as SVGSVGElement,owner=[...svg.querySelectorAll<SVGGElement>('g.node,g.lini-node[data-id]')].find(group=>group.getAttribute('data-id')===id||group.querySelector(':scope > title')?.textContent?.trim()===id||group.id.includes(`flowchart-${id}-`));
  const content=owner?.querySelector('text,foreignObject');if(!content)throw Error(`No mapped annotation owner for ${id}`);
  if(hide){const leaf=content.querySelector('tspan,span,p')??content;(leaf as HTMLElement|SVGElement).style.opacity='0';}else content.textContent=text;
 },{id,text,hide});
}
function renamedVariant():Document{
 const visual=structuredClone(getVisual(source)!) as Visual,nodeIds=new Map(visual.nodes!.map((node,index)=>[node.id,`renamed-node-${index+1}`])),groupIds=new Map(visual.groups!.map((group,index)=>[group.id,`renamed-lane-${index+1}`]));
 visual.id='renamed-lane-map';visual.title='Renamed request path';visual.groups=visual.groups!.map(group=>({...group,id:groupIds.get(group.id)!,label:`Lane ${group.label}`}));
 visual.nodes=visual.nodes!.map((node,index)=>({...node,id:nodeIds.get(node.id)!,label:`Step ${index+1}: ${node.label}`,group:groupIds.get(node.group!)!}));
 visual.edges=visual.edges!.map((edge,index)=>({...edge,id:`renamed-edge-${index+1}`,from:nodeIds.get(edge.from)!,to:nodeIds.get(edge.to)!}));
 visual.annotations=[{id:'renamed-map-note',text:'Renamed lane note preserves literal #a1| and |block#a999| markers, plus &lt; and &#32; exactly.\n\nA second paragraph remains source ordered.'},{id:'renamed-map-note-two',text:'The second annotation has its own exact native owner.'}];
 return createVisualDocument(visual,'test:renamed-lane-map','1.4.0');
}

test('flow/lanes annotations are mandatory and source-owned for reviewed and renamed lane maps',async()=>{
 const variant=renamedVariant();for(const candidate of [source,variant])for(const backend of ['graphviz','mermaid','lini'] as const){
  const built=await render(candidate,backend);try{
   const required=requiredPresentationChecks(backend,built.visual),check=named(built.checks,annotationCheck);
   expect(required).toContain(annotationCheck);expect(check?.result,`${backend}: ${check?.details??'missing annotation proof'}`).toBe('pass');
   expect(required).toContain('flow-lanes-native-membership-and-boundaries');
   const laneCheck=named(built.checks,'flow-lanes-native-membership-and-boundaries');expect(laneCheck?.result,`${backend} lane ownership: ${laneCheck?.details??'missing lane proof'}`).toBe('pass');
   const maps=built.plan.elementMap.filter(item=>item.kind==='annotation');expect(maps).toHaveLength(built.visual.annotations!.length);
   for(const[index,annotation]of built.visual.annotations!.entries())expect(maps.filter(item=>item.logicalId===annotation.id&&item.sourcePath===`/extensions/umf.visual/annotations/${index}/id`)).toHaveLength(1);
   if(candidate===variant){
    const hidden=await mutation(built,(page,ids)=>replaceOwnedText(page,ids[0]!,built.visual.annotations![0]!.text,true));expect(hidden?.result,`${backend} hidden annotation`).toBe('fail');
    const truncated=await mutation(built,(page,ids)=>replaceOwnedText(page,ids[0]!,built.visual.annotations![0]!.text.split(' ').slice(0,5).join(' ')));expect(truncated?.result,`${backend} truncated annotation`).toBe('fail');
    const wrongMap={...built.plan,elementMap:built.plan.elementMap.map(item=>item.kind==='annotation'&&item.sourcePath.endsWith('/0/id')?{...item,sourcePath:'/extensions/umf.visual/annotations/1/id'}:item.kind==='annotation'&&item.sourcePath.endsWith('/1/id')?{...item,sourcePath:'/extensions/umf.visual/annotations/0/id'}:item)};
    const swapped=await mutation(built,async()=>{},wrongMap);expect(swapped?.result,`${backend} swapped annotation map ownership`).toBe('fail');
   }
  }finally{await built.page.close();}
 }
},{timeout:180_000});
