// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {chromium,type Browser,type Page} from 'playwright';
import {createVisualDocument,getVisual,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationBackend,type PresentationPlan} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {mermaidSvg} from '../../scripts/presentation/build';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';
import {requiredPresentationChecks} from '../../scripts/presentation/verify';

let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>await browser?.close(),{timeout:30_000});

const document=readVisualDocument(readFileSync('fixtures/visual/inventory/beacon-ticket-lifecycle.json','utf8'),'json') as Document;
const visual=getVisual(document) as Visual,base='/extensions/umf.visual';
const named=(checks:Awaited<ReturnType<typeof verifyPresentationQuality>>,id='state-path-caption-ownership')=>checks.find(check=>check.check===id);
const expectedCaption=(transition:NonNullable<Visual['state']>['transitions'][number])=>transition.path===undefined?transition.event:[`Path: ${transition.path} —`,transition.event,transition.guard?`[${transition.guard}]`:undefined,transition.action?`/ ${transition.action}`:undefined].filter((part):part is string=>part!==undefined&&part!=='').join(' ');

async function dot(plan:PresentationPlan,format:'svg'|'json'){
 const child=Bun.spawn(['dot','-T'+format],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});child.stdin.write(plan.source);child.stdin.end();
 const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);expect(exit,stderr||stdout).toBe(0);expect(stderr).toBe('');return stdout;
}
async function render(page:Page,sourceDocument:Document,backend:PresentationBackend){
 const plan=compilePresentation(sourceDocument,{backend,theme:'presentation/1'});expect(plan.ok,backend).toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan));
 let svg:string,nativeAst:unknown;
 if(backend==='graphviz'){const [rendered,ast]=await Promise.all([dot(plan,'svg'),dot(plan,'json')]);svg=rendered;nativeAst=JSON.parse(ast);}
 else if(backend==='mermaid')svg=(await mermaidSvg(page,plan.source,'state-lifecycle')).svg;
 else{const native=await renderPresentationLini(plan.source);svg=native.svg;nativeAst=native.nativeAst;}
 const checks=await verifyPresentationQuality(page,{svg,document:sourceDocument,plan,nativeAst});
 return{plan,svg,nativeAst,checks};
}
async function recheck(page:Page,sourceDocument:Document,plan:PresentationPlan,svg:string,nativeAst?:unknown){return verifyPresentationQuality(page,{svg,document:sourceDocument,plan,nativeAst});}
async function mutateCaptionSvg(page:Page,svg:string,backend:PresentationBackend,nativeId:string,caption:string,kind:'hidden'|'transparent'|'zero-stroke'|'hidden-tspan'){
 await page.setContent('<!doctype html><meta charset="utf-8"><div id="frame"></div>',{waitUntil:'domcontentloaded'});
 await page.locator('#frame').evaluate((frame,markup)=>{frame.innerHTML=markup;},svg);
 return page.locator('#frame svg').evaluate((root,input)=>{
  const svg=root as SVGSVGElement;let owner:Element|null=null,label:Element|null=null;
  if(input.backend==='graphviz'){owner=[...svg.querySelectorAll('g.edge')].find(item=>item.id===input.nativeId)??null;label=owner?.querySelector(':scope > text')??owner?.querySelector('text')??null;}
  else if(input.backend==='lini'){owner=svg.querySelector(`g.lini-link.lini-style-${input.nativeId}`);label=owner?.querySelector(':scope > text.lini-link-label')??null;}
  else{owner=[...svg.querySelectorAll('g.edgeLabel')].find(item=>(item.textContent??'').replace(/\s+/gu,' ').trim()===input.caption)??null;label=owner?.querySelector('foreignObject, text')??null;}
  if(!owner||!label)throw Error(`Mapped caption carrier ${input.nativeId} is missing.`);
  if(input.kind==='hidden')label.setAttribute('opacity','0');
  else if(input.kind==='hidden-tspan'){
   if(input.backend!=='lini')throw Error('Hidden child tspan control is scoped to native Lini text.');
   const text=label as SVGTextElement,content=text.textContent??'',span=globalThis.document.createElementNS('http://www.w3.org/2000/svg','tspan');span.textContent=content;span.setAttribute('fill','rgba(0, 0, 0, 0)');text.replaceChildren(span);
  }else if(input.kind==='zero-stroke'){
   if(label.namespaceURI!=='http://www.w3.org/2000/svg')throw Error('Zero-width stroke control requires an SVG text leaf.');
   const leaf=(label.querySelector('tspan')??label) as SVGElement;leaf.style.setProperty('fill','transparent','important');leaf.style.setProperty('fill-opacity','1','important');leaf.style.setProperty('stroke','#000','important');leaf.style.setProperty('stroke-opacity','1','important');leaf.style.setProperty('stroke-width','0','important');
  }else{
   const leaf=label.querySelector('tspan,span')??label;
   if(leaf.namespaceURI==='http://www.w3.org/2000/svg'){
    (leaf as SVGElement).style.setProperty('fill','rgba(0, 0, 0, 0)','important');
    (leaf as SVGElement).style.setProperty('fill-opacity','0','important');
   }else (leaf as HTMLElement).style.setProperty('color','rgba(0, 0, 0, 0)','important');
  }
  return svg.outerHTML;
 },{backend,nativeId,caption,kind});
}

test('the untouched lifecycle fixture keeps all explicit path values source-bound on Graphviz, Mermaid, and Lini',async()=>{
 const original=readFileSync('fixtures/visual/inventory/beacon-ticket-lifecycle.json');
 for(const backend of ['graphviz','mermaid','lini'] as const){
  const page=await browser.newPage({viewport:{width:1600,height:900}});
  try{
   const rendered=await render(page,document,backend),pathRows=rendered.plan.elementMap.filter(item=>item.kind==='state-path-caption');
   expect(pathRows).toHaveLength(visual.state!.transitions.filter(item=>item.path!==undefined).length);
   for(const[index,transition]of visual.state!.transitions.entries()){
    const transitionRow=rendered.plan.elementMap.filter(item=>item.kind==='transition'&&item.sourcePath===`${base}/state/transitions/${index}`),pathRow=rendered.plan.elementMap.filter(item=>item.kind==='state-path-caption'&&item.sourcePath===`${base}/state/transitions/${index}/path`);
    expect(transitionRow).toHaveLength(1);expect(pathRow).toHaveLength(1);expect(pathRow[0]?.logicalId).toBe(transition.id);expect(pathRow[0]?.nativeId).toBe(transitionRow[0]?.nativeId);
   }
   expect(rendered.checks.map(check=>check.check).sort()).toEqual(requiredPresentationChecks(backend,visual));
   const failed=rendered.checks.filter(check=>check.result==='fail');
   if(backend==='lini'){
    expect(failed.map(check=>check.check).sort(),JSON.stringify(failed)).toEqual(['lini-connection-endpoints','presentation-font-legibility']);
    const sourceSha=named(rendered.checks)!.sourceSha256;expect(failed.every(check=>check.sourceSha256===sourceSha&&check.details.length>0)).toBe(true);
    expect(named(rendered.checks)?.result).toBe('pass');
   }else expect(failed,JSON.stringify({backend,failed})).toEqual([]);
   if(backend!=='lini')expect(named(rendered.checks)?.result).toBe('pass');
  }finally{await page.close();}
 }
 expect(readFileSync('fixtures/visual/inventory/beacon-ticket-lifecycle.json')).toEqual(original);
});

test('path proof rejects missing, borrowed, AST-only altered, hidden, and transparent caption evidence',async()=>{
 for(const backend of ['graphviz','mermaid','lini'] as const){
  const page=await browser.newPage({viewport:{width:1600,height:900}});
  try{
   const good=await render(page,document,backend),transitions=visual.state!.transitions,first=transitions[0]!,second=transitions[1]!,firstIndex=0,firstPath=`${base}/state/transitions/${firstIndex}/path`,firstTransition=`${base}/state/transitions/${firstIndex}`,firstMap=good.plan.elementMap.find(item=>item.kind==='state-path-caption'&&item.sourcePath===firstPath)!,otherMap=good.plan.elementMap.find(item=>item.kind==='state-path-caption'&&item.logicalId===second.id)!;
   const removed={...good.plan,elementMap:good.plan.elementMap.filter(item=>item!==firstMap)};
   expect(named(await recheck(page,document,removed,good.svg,good.nativeAst))?.result,'missing path map').toBe('fail');
   const borrowed={...good.plan,elementMap:good.plan.elementMap.map(item=>item===firstMap?{...item,nativeId:otherMap.nativeId}:item)};
   expect(named(await recheck(page,document,borrowed,good.svg,good.nativeAst))?.result,'borrowed path carrier').toBe('fail');

   if(backend==='graphviz'){
    const ast=structuredClone(good.nativeAst) as {edges:Array<Record<string,unknown>>};const edge=ast.edges.find(item=>item.id===firstMap.nativeId)!;edge.label='Path: wrong — altered native AST only';
    expect(named(await recheck(page,document,good.plan,good.svg,ast))?.result,'Graphviz AST-only wrong path').toBe('fail');
   }else if(backend==='mermaid'){
    const from=good.plan.elementMap.find(item=>item.kind==='node'&&item.logicalId===first.from)!.nativeId,to=good.plan.elementMap.find(item=>item.kind==='node'&&item.logicalId===first.to)!.nativeId,caption=expectedCaption(first),encoded=Array.from(caption,char=>char===' '?'#32;':char).join(''),line=`${from} --> ${to}: ${encoded}`;
    const altered={...good.plan,source:good.plan.source.replace(line,`${from} --> ${to}: Path:#32;wrong#32;—#32;altered`)};
    expect(altered.source).not.toBe(good.plan.source);expect(named(await recheck(page,document,altered,good.svg))?.result,'Mermaid source-only wrong path').toBe('fail');
   }else{
    const caption=expectedCaption(first),ast=(good.nativeAst as string).replace(caption,'Path: wrong — altered native AST only');
    expect(ast).not.toBe(good.nativeAst);expect(named(await recheck(page,document,good.plan,good.svg,ast))?.result,'Lini AST-only wrong path').toBe('fail');
   }

   for(const kind of ['hidden','transparent'] as const){
   const changed=await mutateCaptionSvg(page,good.svg,backend,firstMap.nativeId,expectedCaption(first),kind);
    expect(changed).not.toBe(good.svg);expect(named(await recheck(page,document,good.plan,changed,good.nativeAst))?.result,`${backend} SVG-only ${kind}`).toBe('fail');
   }
   if(backend!=='mermaid'){
    const zeroWidth=await mutateCaptionSvg(page,good.svg,backend,firstMap.nativeId,expectedCaption(first),'zero-stroke');
    expect(zeroWidth).not.toBe(good.svg);expect(named(await recheck(page,document,good.plan,zeroWidth,good.nativeAst))?.result,`${backend} zero-width transparent fill/opaque stroke`).toBe('fail');
   }
   if(backend==='lini'){
    const leafHidden=await mutateCaptionSvg(page,good.svg,backend,firstMap.nativeId,expectedCaption(first),'hidden-tspan');
    expect(leafHidden).not.toBe(good.svg);expect(named(await recheck(page,document,good.plan,leafHidden,good.nativeAst))?.result,'hidden path tspan').toBe('fail');
   }
  }finally{await page.close();}
 }
});

test('path-looking event text without a path stays an event, while identical Mermaid transitions remain ambiguous',()=>{
 const noPath:Visual={id:'path-looking-event',kind:'state',form:'machine',question:'Which state changes?',nodes:[{id:'alpha',label:'Alpha'},{id:'beta',label:'Beta'}],state:{initial:'alpha',transitions:[{id:'event-only',from:'alpha',to:'beta',event:'Path: alternate — customer reply'}]}};
 const sourceDocument=createVisualDocument(noPath,'test:path-looking-event','1.4.0');
 for(const backend of ['graphviz','mermaid','lini'] as const){const plan=compilePresentation(sourceDocument,{backend,theme:'presentation/1'});expect(plan.ok,backend).toBe(true);if(!plan.ok)continue;expect(plan.elementMap.some(item=>item.kind==='state-path-caption')).toBe(false);expect(requiredPresentationChecks(backend,noPath)).not.toContain('state-path-caption-ownership');expect(plan.source).toContain(backend==='mermaid'?'Path:#32;alternate':backend==='graphviz'?'Path: alternate':'Path: alternate');}
 const duplicate:Visual={...noPath,id:'ambiguous-path-looking-event',state:{...noPath.state!,transitions:[...noPath.state!.transitions,{id:'event-only-2',from:'alpha',to:'beta',event:'Path: alternate — customer reply'}]}};
 const duplicateDocument=createVisualDocument(duplicate,'test:ambiguous-path-looking-event','1.4.0'),mermaid=compilePresentation(duplicateDocument,{backend:'mermaid',theme:'presentation/1'});
 expect(mermaid.ok).toBe(false);if(!mermaid.ok)expect(mermaid.diagnostics).toContainEqual(expect.objectContaining({code:'PRESENTATION_STATE_AMBIGUOUS_TRANSITION'}));
});

test('same caption on a separate reciprocal path cannot lend visible glyphs to a hidden owner',async()=>{
 const reciprocal:Visual={id:'reciprocal-paths',kind:'state',form:'machine',question:'Which directions are possible?',nodes:[{id:'first',label:'First'},{id:'second',label:'Second'}],state:{initial:'first',transitions:[{id:'forward',from:'first',to:'second',event:'retry',path:'main'},{id:'reverse',from:'second',to:'first',event:'retry',path:'main'},{id:'self-loop',from:'first',to:'first',event:'again',path:'alternate'}]}};
 const reciprocalDocument=createVisualDocument(reciprocal,'test:reciprocal-paths','1.4.0'),page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  const good=await render(page,reciprocalDocument,'lini'),forward=good.plan.elementMap.find(item=>item.kind==='state-path-caption'&&item.logicalId==='forward')!,reverse=good.plan.elementMap.find(item=>item.kind==='state-path-caption'&&item.logicalId==='reverse')!;
  expect(forward.nativeId).not.toBe(reverse.nativeId);expect(named(good.checks)?.result).toBe('pass');
  const hidden=await mutateCaptionSvg(page,good.svg,'lini',forward.nativeId,expectedCaption(reciprocal.state!.transitions[0]!),'hidden');
  const hiddenChecks=await recheck(page,reciprocalDocument,good.plan,hidden,good.nativeAst);
  expect(named(hiddenChecks)?.result).toBe('fail');
 }finally{await page.close();}
});

test('Lini native selectors bind t1 exactly and cannot borrow the t10 caption',async()=>{
 const transitions:NonNullable<Visual['state']>['transitions']=Array.from({length:10},(_,index)=>({id:`transition-${index+1}`,from:index===0||index===9?'first':`node-${index+1}`,to:`node-${index+2}`,event:index===9?'retry':index===0?'retry':'event '+(index+1),path:index===0||index===9?'main':index%2===0?'failure':'alternate'}));
 const nodes:NonNullable<Visual['nodes']>=Array.from({length:11},(_,index)=>({id:index===0?'first':`node-${index+1}`,label:index===0?'First':'Node '+(index+1)}));
 const visual:Visual={id:'ten-transition-prefixes',kind:'state',form:'machine',question:'Which transition occurs?',nodes,state:{initial:'first',transitions}};
 const sourceDocument=createVisualDocument(visual,'test:ten-transition-prefixes','1.4.0'),page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  const good=await render(page,sourceDocument,'lini'),first=good.plan.elementMap.find(item=>item.kind==='state-path-caption'&&item.logicalId==='transition-1')!,tenth=good.plan.elementMap.find(item=>item.kind==='state-path-caption'&&item.logicalId==='transition-10')!;
  expect(first.nativeId).toBe('t1');expect(tenth.nativeId).toBe('t10');expect(named(good.checks)?.result).toBe('pass');
  const source=good.nativeAst as string,selector=`${good.plan.elementMap.find(item=>item.kind==='node'&&item.logicalId==='first')!.nativeId} -> ${good.plan.elementMap.find(item=>item.kind==='node'&&item.logicalId==='node-2')!.nativeId} .${first.nativeId}`,start=source.indexOf(selector);
  expect(start).toBeGreaterThanOrEqual(0);const bracket=source.indexOf('[',start+selector.length),literal=JSON.stringify(expectedCaption(transitions[0]!));expect(source.slice(bracket+1).trimStart().startsWith(literal)).toBe(true);
  const ast=source.slice(0,bracket+1)+source.slice(bracket+1).replace(literal,'""');expect(ast).not.toBe(source);
  expect(named(await recheck(page,sourceDocument,good.plan,good.svg,ast))?.result,'missing t1 cannot borrow t10').toBe('fail');
 }finally{await page.close();}
});
