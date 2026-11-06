// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,describe,expect,it} from 'bun:test';
import {chromium,type Browser,type Page} from 'playwright';
import {readVisualDocument} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyLiniFlatSequenceQuality} from '../../scripts/presentation/lini-flat-sequence-quality';

let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});
const fixture=import.meta.dir+'/../../fixtures/visual/inventory/documentor-pipeline.json';
async function sourceDocument(){return readVisualDocument(await Bun.file(fixture).text(),'json');}
async function render(document:Awaited<ReturnType<typeof sourceDocument>>){
 const plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});expect(plan.ok,'flat sequence must compile').toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan));
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900}});
 await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:#fff}#frame{width:1600px;height:900px}#frame svg{width:100%;height:100%}</style><div id="frame"></div>');
 await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},native.svg);
 return{document,plan,page,nativeAst:native.nativeAst};
}
async function checks(good:Awaited<ReturnType<typeof render>>,nativeAst=good.nativeAst){return verifyLiniFlatSequenceQuality(good.page,{document:good.document,plan:good.plan,nativeAst});}
function result(rows:Awaited<ReturnType<typeof checks>>,name:string){return rows.find(row=>row.check===name)?.result;}
async function selfCallDocument(which:'middle'|'first'|'last'|'many'){
 const source=JSON.parse(await Bun.file(fixture).text()) as {extensions:Record<string,unknown>},visual=source.extensions['umf.visual'] as {sequence:{participants:Array<{id:string}>;messages:Array<{id:string;from:string;to:string;label:string;kind?:string}>}};
 const self=visual.sequence.messages.find(message=>message.from===message.to)!;self.id='renamed-self-call';
 if(which==='first'){visual.sequence.messages=[self,...visual.sequence.messages.filter(message=>message!==self)];}
 if(which==='last'){self.from=visual.sequence.participants.at(-1)!.id;self.to=self.from;visual.sequence.messages=[...visual.sequence.messages.filter(message=>message!==self),self];}
 if(which==='many'){const second={...self,id:'second-self-call',label:'repeat internal validation'};visual.sequence.messages.splice(visual.sequence.messages.indexOf(self)+1,0,second);}
 return readVisualDocument(JSON.stringify(source),'json');
}

describe('native flat sequence self-call quality proof',()=>{
 it('proves the full inventory and a right-corridor self-call with exact native and SVG ownership',async()=>{
  const good=await render(await sourceDocument());
  try{
   const rows=await checks(good);expect(result(rows,'lini-rich-native-semantics'),JSON.stringify(rows.filter(row=>row.result==='fail'))).toBe('pass');expect(result(rows,'lini-rich-svg-ownership-geometry'),JSON.stringify(rows.filter(row=>row.result==='fail'))).toBe('pass');expect(result(rows,'lini-rich-caption-clearance'),JSON.stringify(rows.filter(row=>row.result==='fail'))).toBe('pass');
   expect(good.plan.elementMap.filter(item=>item.kind==='message')).toHaveLength(10);
   expect(good.plan.elementMap.filter(item=>item.kind==='message-caption')).toHaveLength(10);
   const loop=good.page.locator('g.lini-node[data-id="message7"] > polyline');expect(await loop.count()).toBe(1);
   const scales=await loop.evaluate(node=>{const element=node as SVGPolylineElement,matrix=element.getScreenCTM(),svg=element.ownerSVGElement!,viewBox=svg.viewBox.baseVal,rect=svg.getBoundingClientRect();return{actual:matrix?Math.hypot(matrix.a,matrix.b):NaN,widthRatio:rect.width/viewBox.width,heightRatio:rect.height/viewBox.height};});expect(scales.actual).toBeCloseTo(scales.heightRatio,4);expect(scales.actual).toBeLessThan(scales.widthRatio);
   expect(await good.page.locator('g.lini-node[data-id="message7"] > polygon.lini-marker-arrow').count()).toBe(1);
   expect(await good.page.locator('g.lini-node[data-id="message-caption7"] > text.lini-text').count()).toBe(1);
  }finally{await good.page.close();}
 },{timeout:30_000});

 it('supports renamed calls at different message counts and participant positions without ID-specific rules',async()=>{
  for(const variant of ['first','last','many'] as const){const good=await render(await selfCallDocument(variant));try{const rows=await checks(good);expect(result(rows,'lini-rich-native-semantics'),variant+': '+JSON.stringify(rows.filter(row=>row.result==='fail'))).toBe('pass');expect(result(rows,'lini-rich-svg-ownership-geometry'),variant+': '+JSON.stringify(rows.filter(row=>row.result==='fail'))).toBe('pass');expect(result(rows,'lini-rich-caption-clearance'),variant+': '+JSON.stringify(rows.filter(row=>row.result==='fail'))).toBe('pass');}finally{await good.page.close();}}
 },{timeout:60_000});

 it('rejects a wrong native return, missing path segment, reversed arrowhead, and row-order violation',async()=>{
  const good=await render(await sourceDocument());
  try{
   const badReturn=good.nativeAst.replace('points: 0 0, 80 0, 80 36, 0 36','points: 0 0, 80 0, 80 36, 40 36');expect(badReturn).not.toBe(good.nativeAst);expect(result(await checks(good,badReturn),'lini-rich-native-semantics')).toBe('fail');
   const loop=good.page.locator('g.lini-node[data-id="message7"] > polyline');await loop.evaluate(element=>element.setAttribute('points','0,0 80,0 0,36'));expect(result(await checks(good),'lini-rich-svg-ownership-geometry')).toBe('fail');
   await loop.evaluate(element=>element.setAttribute('points','0,0 80,0 80,36 4,36'));
   const marker=good.page.locator('g.lini-node[data-id="message7"] > polygon.lini-marker-arrow');await marker.evaluate(element=>element.setAttribute('points','9,36 0,31.5 0,40.5'));expect(result(await checks(good),'lini-rich-svg-ownership-geometry')).toBe('fail');
   await marker.evaluate(element=>element.setAttribute('points','0,36 9,31.5 9,40.5'));
   await good.page.locator('g.lini-node[data-id="message8"]').evaluate(element=>element.setAttribute('transform','translate(-330,170)'));expect(result(await checks(good),'lini-rich-svg-ownership-geometry')).toBe('fail');
  }finally{await good.page.close();}
 },{timeout:45_000});
});
