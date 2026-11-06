// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {chromium,type Browser,type Page} from 'playwright';
import type {Document} from '@umf/core';
import {createVisualDocument,getVisual,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationBackend,type PresentationPlan} from '../../src/presentation';
import {mermaidSvg} from '../../scripts/presentation/build';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyPresentationQuality,type PresentationQualityCheck} from '../../scripts/presentation/quality';
import {requiredPresentationChecks} from '../../scripts/presentation/verify';

const source=readVisualDocument(readFileSync('fixtures/reviews/definitions/tpl-sd-domain.json','utf8'),'json') as Document;
const sourceVisual=getVisual(source) as Visual;
const annotationCheck='entity-annotation-native-text';
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>await browser?.close(),{timeout:30_000});

type Built={backend:PresentationBackend;document:Document;visual:Visual;plan:PresentationPlan;svg:string;nativeAst?:unknown;checks:PresentationQualityCheck[];page:Page};
async function dot(text:string,format:'svg'|'json'){
 const child=Bun.spawn(['dot',`-T${format}`],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});child.stdin.write(text);child.stdin.end();
 const[stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);expect(exit,stderr).toBe(0);expect(stderr).toBe('');return stdout;
}
async function render(document:Document,backend:PresentationBackend):Promise<Built>{
 const plan=compilePresentation(document,{backend,theme:'presentation/1'});expect(plan.ok,plan.ok?'':JSON.stringify(plan)).toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan));
 let svg:string,nativeAst:unknown;
 if(backend==='graphviz'){const[rendered,ast]=await Promise.all([dot(plan.source,'svg'),dot(plan.source,'json')]);svg=rendered;nativeAst=JSON.parse(ast);}
 else if(backend==='mermaid'){const page=await browser.newPage();try{svg=(await mermaidSvg(page,plan.source,`entity-annotations-${document.id.replace(/[^a-z0-9-]/giu,'-')}`)).svg;}finally{await page.close();}}
 else{const rendered=await renderPresentationLini(plan.source);svg=rendered.svg;nativeAst=rendered.nativeAst;}
 const visual=getVisual(document)!,page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1}),checks=await verifyPresentationQuality(page,{svg,document,plan,nativeAst});
 return{backend,document,visual,plan,svg,nativeAst,checks,page};
}
const named=(checks:PresentationQualityCheck[],name:string)=>checks.find(item=>item.check===name);
function exactSourceMap(plan:PresentationPlan,annotations:NonNullable<Visual['annotations']>){
 for(const[index,annotation]of annotations.entries())expect(plan.elementMap.filter(item=>item.kind==='annotation'&&item.logicalId===annotation.id&&item.sourcePath===`/extensions/umf.visual/annotations/${index}/id`)).toHaveLength(1);
}
async function verifyMutation(built:Built,mutate:(page:Page,ids:string[])=>Promise<void>,plan:PresentationPlan=built.plan,document:Document=built.document,nativeAst:unknown=built.nativeAst){
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});try{
  const clean=await verifyPresentationQuality(page,{svg:built.svg,document:built.document,plan:built.plan,nativeAst:built.nativeAst});expect(named(clean,annotationCheck)?.result,`${built.backend} fresh negative baseline`).toBe('pass');
  await page.setContent('<!doctype html><div id="frame"></div>');await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},built.svg);
  const ids=built.visual.annotations!.map((_,index)=>built.plan.elementMap.find(item=>item.kind==='annotation'&&item.sourcePath===`/extensions/umf.visual/annotations/${index}/id`)!.nativeId);
  await mutate(page,ids);const svg=await page.locator('#frame svg').evaluate(element=>element.outerHTML);
  return named(await verifyPresentationQuality(page,{svg,document,plan,nativeAst}),annotationCheck);
 }finally{await page.close();}
}
async function ownerFor(page:Page,nativeId:string){
 return page.locator('#frame svg').evaluate((root,id)=>{
  const svg=root as SVGSVGElement;
  return [...svg.querySelectorAll<SVGGElement>('g.node,g.lini-node[data-id]')].find(group=>group.getAttribute('data-id')===id||group.querySelector(':scope > title')?.textContent?.trim()===id||group.id.includes(`flowchart-${id}-`))??null;
 },nativeId);
}
async function mutateText(page:Page,nativeId:string,value:string,hide=false){
 await page.locator('#frame svg').evaluate((root,{nativeId,value,hide})=>{
  const svg=root as SVGSVGElement,group=[...svg.querySelectorAll<SVGGElement>('g.node,g.lini-node[data-id]')].find(item=>item.getAttribute('data-id')===nativeId||item.querySelector(':scope > title')?.textContent?.trim()===nativeId||item.id.includes(`flowchart-${nativeId}-`)),text=group?.querySelector('text,foreignObject');
  if(!group||!text)throw Error(`Mapped annotation carrier ${nativeId} has no visible text element.`);
  if(hide){const leaf=text.querySelector('tspan,span,p')??text; (leaf as HTMLElement|SVGElement).style.opacity='0';}
  else text.textContent=value;
 },{nativeId,value,hide});
}

const renamedVariant:Visual=(()=>{
 const visual=structuredClone(sourceVisual),idMap=new Map(visual.nodes!.map((node,index)=>[node.id,`renamed-${index+1}`]));
 visual.id='renamed-entity-annotations';visual.title='Renamed domain cards';
 visual.nodes=visual.nodes!.map((node,index)=>({...node,id:idMap.get(node.id)!,label:`Renamed entity ${index+1}`}));
 visual.structure!.entities=visual.structure!.entities!.map((entity,index)=>({...entity,node:idMap.get(entity.node)!,fields:index===0?[{name:'entity_id',type:'uuid',keys:['pk'],nullable:false}]:[]}));
 visual.structure!.references=visual.structure!.references!.map((reference,index)=>({...reference,id:`renamed-reference-${index+1}`,from:{...reference.from,node:idMap.get(reference.from.node)!},to:{...reference.to,node:idMap.get(reference.to.node)!}}));
 visual.annotations=[{id:'renamed-rule-a',text:'First renamed rule preserves its full ordered sentence and literal #a1| / |block#a999| tokens, plus &lt;, &amp;, and &#32; text.\n\nSecond paragraph preserves its authored blank-line boundary.'},{id:'renamed-rule-b',text:'Second renamed rule remains a separate source owned annotation.'}];
 return visual;
})();

test('entity annotation native proof preserves the reviewed source and a renamed ER model in all three backends',async()=>{
 const document=createVisualDocument(renamedVariant,'test:renamed-entity-annotations','1.4.0');
 for(const candidate of [source,document])for(const backend of ['graphviz','mermaid','lini'] as const){
  const built=await render(candidate,backend);try{
   const required=requiredPresentationChecks(backend,built.visual),check=named(built.checks,annotationCheck);
   expect(required).toContain(annotationCheck);expect(check?.result,`${backend}/${built.visual.id}: ${check?.details??'missing annotation proof'}`).toBe('pass');
   for(const name of required)expect(named(built.checks,name),`${backend}/${built.visual.id}/${name}`).toBeDefined();
   exactSourceMap(built.plan,built.visual.annotations!);
   const priorErCheck=backend==='graphviz'?'graphviz-entity-field-rows':backend==='mermaid'?'mermaid-er-fields-and-relations':'lini-entity-field-rows';
   expect(named(built.checks,priorErCheck),`${backend} existing ER field/reference proof remains present`).toBeDefined();
   expect(named(built.checks,priorErCheck)?.result,`${backend} ER field/reference proof is still passing`).toBe('pass');
   if(candidate===document)expect(built.visual.structure?.entities?.[0]?.fields.length).toBe(1);
   if(candidate===document){
    const wrongText=structuredClone(built.visual);wrongText.id='wrong-entity-annotation-text';wrongText.annotations![0]!.text+=' Source text changed.';
    const wrongDocument=createVisualDocument(wrongText,'test:wrong-entity-annotation-text','1.4.0');
    const wrongSource=await verifyMutation(built,async()=>{},built.plan,wrongDocument);expect(wrongSource?.result,`${backend} source/native mismatch`).toBe('fail');
   }
  }finally{await built.page.close();}
 }
},{timeout:180_000});

test('entity annotation proof rejects hidden, truncated, reordered, wrong-map, and phantom carriers from fresh native SVG',async()=>{
 for(const backend of ['graphviz','mermaid','lini'] as const){
  const built=await render(source,backend);try{
   expect(named(built.checks,annotationCheck)?.result,`${backend} clean native baseline`).toBe('pass');
   const ids=built.visual.annotations!.map((_,index)=>built.plan.elementMap.find(item=>item.kind==='annotation'&&item.sourcePath===`/extensions/umf.visual/annotations/${index}/id`)!.nativeId);
   const hidden=await verifyMutation(built,(page)=>mutateText(page,ids[0]!,built.visual.annotations![0]!.text,true));expect(hidden?.result,`${backend} hidden leaf`).toBe('fail');
   const truncated=await verifyMutation(built,(page)=>mutateText(page,ids[0]!,built.visual.annotations![0]!.text.split(' ').slice(0,5).join(' ')));expect(truncated?.result,`${backend} truncated text`).toBe('fail');
   const reordered=await verifyMutation(built,async page=>{await mutateText(page,ids[0]!,built.visual.annotations![1]!.text);await mutateText(page,ids[1]!,built.visual.annotations![0]!.text);});expect(reordered?.result,`${backend} cross-borrowed annotation text`).toBe('fail');
   const swapped={...built.plan,elementMap:built.plan.elementMap.map(item=>item.kind==='annotation'&&item.sourcePath.endsWith('/0/id')?{...item,sourcePath:'/extensions/umf.visual/annotations/1/id'}:item.kind==='annotation'&&item.sourcePath.endsWith('/1/id')?{...item,sourcePath:'/extensions/umf.visual/annotations/0/id'}:item)};
   const wrongMap=await verifyMutation(built,async()=>{},swapped);expect(wrongMap?.result,`${backend} swapped source map`).toBe('fail');
   const phantom=await verifyMutation(built,page=>page.locator('#frame svg').evaluate((root,targetBackend)=>{
    const svg=root as SVGSVGElement,extra=svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg','g'),text=svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg','text');text.textContent='unmapped annotation';
    if(targetBackend==='lini'){extra.setAttribute('class','lini-node lini-box lini-block');extra.setAttribute('data-id','unmapped-note');}
    else{extra.setAttribute('class','node');extra.setAttribute('id','flowchart-unmapped-note-999');const title=svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg','title');title.textContent='unmapped-note';extra.append(title);}
    extra.append(text);svg.append(extra);
   },backend));expect(phantom?.result,`${backend} phantom native carrier`).toBe('fail');
   if(backend==='lini'){
    const ast=String(built.nativeAst),firstId=ids[0]!,firstText=built.visual.annotations![0]!.text;
    const withoutSelector=await verifyMutation(built,async()=>{},built.plan,built.document,ast.replace(`|block#${firstId}| .lini-box.lini-block`,`|box#${firstId}| .lini-box.lini-block`));
    expect(withoutSelector?.result,'Lini missing quote-aware annotation block selector').toBe('fail');
    const wrongAstText=await verifyMutation(built,async()=>{},built.plan,built.document,ast.replace(JSON.stringify(firstText),JSON.stringify('wrong native AST text')));
    expect(wrongAstText?.result,'Lini wrong native AST block text').toBe('fail');
    const footerClose='\n  ]\n]\n',footerEnd=ast.lastIndexOf(footerClose);expect(footerEnd).toBeGreaterThanOrEqual(0);
    const phantomAst=ast.slice(0,footerEnd)+'\n    |block#unmapped-note| .lini-box.lini-block { width: 200; } [ "phantom text box" ]'+ast.slice(footerEnd);
    const extraAstBlock=await verifyMutation(built,async()=>{},built.plan,built.document,phantomAst);
    expect(extraAstBlock?.result,'Lini arbitrary-ID text block in annotation footer').toBe('fail');
   }
  }finally{await built.page.close();}
 }
},{timeout:180_000});
