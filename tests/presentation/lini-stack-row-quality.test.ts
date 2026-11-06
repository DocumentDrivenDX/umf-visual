// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,describe,expect,it} from 'bun:test';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {chromium,type Browser,type Page} from 'playwright';
import {createVisualDocument,readVisualDocument,getVisual,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyLiniPresentationQuality} from '../../scripts/presentation/lini-quality';

let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});

const required=['lini-native-ast','lini-native-carriers','lini-connection-endpoints','lini-containment-and-order','lini-entity-field-rows'];
const result=(checks:Awaited<ReturnType<typeof verifyLiniPresentationQuality>>,name:string)=>checks.find(check=>check.check===name)?.result;
const documentFromFile=(path:string)=>readVisualDocument(readFileSync(path,'utf8'),'json') as Document;
async function render(document:Document){
 const plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan));
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden}#frame{width:1600px;height:900px}#frame svg{width:100%;height:100%}</style><div id="frame"></div>',{waitUntil:'domcontentloaded'});
  await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},native.svg);
  return{document,plan,page,svg:native.svg,nativeAst:native.nativeAst,checks:await verifyLiniPresentationQuality(page,{document,plan,nativeAst:native.nativeAst})};
 }catch(error){await page.close();throw error;}
}
async function recheck(page:Page,document:Document,plan:PresentationPlan,nativeAst:unknown){return verifyLiniPresentationQuality(page,{document,plan,nativeAst});}
function expectAll(checks:Awaited<ReturnType<typeof verifyLiniPresentationQuality>>){
 expect(checks.map(check=>check.check)).toEqual(required);
 const failed=checks.filter(check=>check.result!=='pass');if(failed.length)throw Error(JSON.stringify(failed));
}
async function insertSvg(page:Page,svg:string){await page.locator('#frame').evaluate((frame,markup)=>{frame.innerHTML=markup;},svg);}
function mapNative(plan:PresentationPlan,kind:'layer'|'node',logicalId:string){return plan.elementMap.find(item=>item.kind===kind&&item.logicalId===logicalId)?.nativeId;}

describe('Lini implicit stack member rows',()=>{
 it('proves distinct-count/renamed and legacy stack fixtures with exact native maps',async()=>{
  const renamed:Visual={id:'renamed-six-part-stack',kind:'structure',form:'stack',question:'Which bands contain each part?',nodes:[
   {id:'edge-ui',label:'Console',layer:'people-band'},{id:'reviewer',label:'Reviewer',layer:'people-band'},
   {id:'web-shell',label:'Browser shell',layer:'service-band'},{id:'reply-core',label:'Composer',layer:'service-band'},{id:'worker-pool',label:'Indexer',layer:'service-band'},
   {id:'history-db',label:'History store',layer:'data-band'},
  ],structure:{layers:[{id:'people-band',label:'People'},{id:'service-band',label:'Services'},{id:'data-band',label:'Data'}]}};
  const documents=[
   createVisualDocument(renamed,'quality:renamed-six-part-stack','1.4.0'),
   documentFromFile('fixtures/visual/inventory/helix-parts.json'),
   documentFromFile('fixtures/showcase/definitions/umf-architecture-stack.json'),
  ];
  for(const document of documents){
   const native=await render(document);
   try{
    const visual=getVisual(document);expect(visual?.form).toBe('stack');expect(visual?.layout).toBeUndefined();expectAll(native.checks);
    for(const layer of visual?.structure?.layers??[]){
     const layerMap=mapNative(native.plan,'layer',layer.id);expect(layerMap).toBeDefined();
     const members=(visual?.nodes??[]).filter(node=>node.layer===layer.id),expected=members.map(node=>mapNative(native.plan,'node',node.id));
     expect(expected).not.toContain(undefined);
     const line=`|block#${layerMap}| .lini-group.lini-block`;
     expect(native.nativeAst).toContain(line);
     for(const id of expected)expect(native.nativeAst).toContain(`#${id}|`);
    }
   }finally{await native.page.close();}
  }
 },{timeout:60_000});

 it('requires each exact mapped layer block to be a native row with source-ordered direct children',async()=>{
  const document=documentFromFile('fixtures/visual/inventory/beacon-stack.json'),native=await render(document),visual=getVisual(document)!;
  try{
   expectAll(native.checks);
   const firstLayer=visual.structure!.layers![0]!,layerNative=mapNative(native.plan,'layer',firstLayer.id)!;
   const wrongDirection=native.nativeAst.replace(`|block#${layerNative}| .lini-group.lini-block {\n    layout: flow; direction: row;`,`|block#${layerNative}| .lini-group.lini-block {\n    layout: flow; direction: column;`);
   expect(wrongDirection).not.toBe(native.nativeAst);
   expect(result(await recheck(native.page,document,native.plan,wrongDirection),'lini-containment-and-order')).toBe('fail');

   const duplicateDirection=native.nativeAst.replace('layout: flow; direction: row;','layout: flow; direction: row; direction: column;');
   expect(duplicateDirection).not.toBe(native.nativeAst);
   expect(result(await recheck(native.page,document,native.plan,duplicateDirection),'lini-containment-and-order')).toBe('fail');

   const duplicateSelector=`${native.nativeAst}\n|block#${layerNative}| .lini-group.lini-block { layout: flow; direction: row; } [ ]`;
   expect(result(await recheck(native.page,document,native.plan,duplicateSelector),'lini-containment-and-order')).toBe('fail');

   const blockStart=native.nativeAst.indexOf(`|block#${layerNative}|`),bodyStart=native.nativeAst.indexOf('[',blockStart);
   const anonymousPhantom=native.nativeAst.slice(0,bodyStart+1)+'\n    |oval| .lini-oval [ "phantom" ]'+native.nativeAst.slice(bodyStart+1);
   expect(anonymousPhantom).not.toBe(native.nativeAst);
   expect(result(await recheck(native.page,document,native.plan,anonymousPhantom),'lini-containment-and-order')).toBe('fail');

   const actualNodes=(visual.nodes??[]).filter(node=>node.layer===firstLayer.id),first=mapNative(native.plan,'node',actualNodes[0]!.id)!,second=mapNative(native.plan,'node',actualNodes[1]!.id)!;
   const lineA=`|oval#${first}|`,lineB=`|oval#${second}|`;
   expect(native.nativeAst).toContain(lineA);expect(native.nativeAst).toContain(lineB);
   const swappedAst=native.nativeAst.replace(lineA,'|oval#TEMP_NODE|').replace(lineB,lineA).replace('|oval#TEMP_NODE|',lineB);
   expect(swappedAst).not.toBe(native.nativeAst);
   expect(result(await recheck(native.page,document,native.plan,swappedAst),'lini-containment-and-order')).toBe('fail');
  }finally{await native.page.close();}
 },{timeout:45_000});

 it('rejects moved, cross-layer, and horizontally swapped SVG members against unchanged native AST',async()=>{
  const document=documentFromFile('fixtures/visual/inventory/beacon-stack.json'),native=await render(document),visual=getVisual(document)!;
  try{
   expectAll(native.checks);
   const firstLayer=visual.structure!.layers![0]!,secondLayer=visual.structure!.layers![1]!,members=(visual.nodes??[]).filter(node=>node.layer===firstLayer.id);
   expect(members.length).toBeGreaterThan(1);
   const first=mapNative(native.plan,'node',members[0]!.id)!,second=mapNative(native.plan,'node',members[1]!.id)!,targetLayer=mapNative(native.plan,'layer',secondLayer.id)!;
   const firstSelector=`g.lini-node[data-id="${first}"]`,secondSelector=`g.lini-node[data-id="${second}"]`,layerSelector=`g.lini-node[data-id="${targetLayer}"]`;
   const baseline=native.svg;

   await insertSvg(native.page,baseline);
   const down=await native.page.locator(firstSelector).evaluate(element=>{
    const svgElement=element as SVGElement,before=element.getBoundingClientRect();svgElement.style.translate='0px 72px';const after=element.getBoundingClientRect();return{before:{top:before.top,bottom:before.bottom},after:{top:after.top,bottom:after.bottom}};
   });
   expect(Math.abs((down.after.top+down.after.bottom)-(down.before.top+down.before.bottom))).toBeGreaterThan(100);
   expect(result(await recheck(native.page,document,native.plan,native.nativeAst),'lini-containment-and-order')).toBe('fail');

   await insertSvg(native.page,baseline);
   const intoOtherLayer=await native.page.locator(firstSelector).evaluate((element,selector)=>{
    const target=(element as Element).ownerDocument.querySelector(selector);if(!target)throw Error('Mapped adjacent layer carrier is missing.');
    const before=element.getBoundingClientRect(),targetBox=target.getBoundingClientRect();
    (element as SVGGElement).style.translate=`0px ${targetBox.top+targetBox.height/2-(before.top+before.bottom)/2}px`;
    const after=element.getBoundingClientRect();return{inside:after.top>=targetBox.top&&after.bottom<=targetBox.bottom};
   },layerSelector);
   expect(intoOtherLayer.inside).toBe(true);
   expect(result(await recheck(native.page,document,native.plan,native.nativeAst),'lini-containment-and-order')).toBe('fail');

   await insertSvg(native.page,baseline);
   const reparented=await native.page.locator('#frame svg').evaluate((root,ids)=>{
    const node=root.querySelector(`g.lini-node[data-id="${ids.first}"]`) as SVGGElement|null,target=root.querySelector(`g.lini-node[data-id="${ids.layer}"]`) as SVGGElement|null;
    if(!node||!target)throw Error('Mapped node or adjacent layer is missing.');
    const before=node.getBoundingClientRect(),nodeScreen=node.getScreenCTM(),targetScreen=target.getScreenCTM();if(!nodeScreen||!targetScreen)throw Error('Mapped carrier transform is missing.');
    const relative=targetScreen.inverse().multiply(nodeScreen);target.appendChild(node);node.setAttribute('transform',`matrix(${relative.a} ${relative.b} ${relative.c} ${relative.d} ${relative.e} ${relative.f})`);
    const after=node.getBoundingClientRect();return{before:{x:before.x,y:before.y,width:before.width,height:before.height},after:{x:after.x,y:after.y,width:after.width,height:after.height},parent:node.parentElement?.getAttribute('data-id')};
   },{first,layer:targetLayer});
   expect(reparented.parent).toBe(targetLayer);
   expect(Math.abs(reparented.before.x-reparented.after.x)).toBeLessThan(0.1);expect(Math.abs(reparented.before.y-reparented.after.y)).toBeLessThan(0.1);
   expect(result(await recheck(native.page,document,native.plan,native.nativeAst),'lini-containment-and-order')).toBe('fail');

   await insertSvg(native.page,baseline);
   const swap=await native.page.locator('#frame svg').evaluate((root,ids)=>{
    const a=root.querySelector(`g.lini-node[data-id="${ids.first}"]`),b=root.querySelector(`g.lini-node[data-id="${ids.second}"]`);
    if(!a||!b)throw Error('Mapped row members are missing.');
    const beforeA=a.getBoundingClientRect(),beforeB=b.getBoundingClientRect(),transformA=a.getAttribute('transform'),transformB=b.getAttribute('transform');
    if(!transformA||!transformB)throw Error('Mapped native row member transforms are missing.');
    a.setAttribute('transform',transformB);b.setAttribute('transform',transformA);
    const afterA=a.getBoundingClientRect(),afterB=b.getBoundingClientRect();
    return{before:[beforeA.left,beforeB.left],after:[afterA.left,afterB.left],svg:(root as SVGSVGElement).outerHTML};
   },{first,second});
   expect(swap.before[0]).toBeLessThan(swap.before[1]);expect(swap.after[0]).toBeGreaterThan(swap.after[1]);
   expect(result(await recheck(native.page,document,native.plan,native.nativeAst),'lini-containment-and-order')).toBe('fail');
  }finally{await native.page.close();}
 },{timeout:45_000});
});
