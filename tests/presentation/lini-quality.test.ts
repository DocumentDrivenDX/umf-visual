// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,describe,expect,it} from 'bun:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,type Browser, type Page} from 'playwright';
import {createVisualDocument,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyLiniPresentationQuality} from '../../scripts/presentation/lini-quality';

let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});

const required=['lini-native-ast','lini-native-carriers','lini-connection-endpoints','lini-containment-and-order','lini-entity-field-rows'];
const doc=(visual:Visual)=>createVisualDocument(visual,'lini-quality:'+visual.id,'1.1.0');
const result=(checks:Awaited<ReturnType<typeof verifyLiniPresentationQuality>>,name:string)=>checks.find(check=>check.check===name)?.result;
async function renderDocument(document:ReturnType<typeof createVisualDocument>){
 const plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});
 expect(plan.ok).toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan));
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900}});
 await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden}#frame{width:1600px;height:900px}#frame svg{width:100%;height:100%}</style><div id="frame"></div>',{waitUntil:'domcontentloaded'});
 await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},native.svg);
 const checks=await verifyLiniPresentationQuality(page,{document,plan,nativeAst:native.nativeAst});
 return{document,plan,page,svg:native.svg,nativeAst:native.nativeAst,checks};
}
async function render(visual:Visual){return renderDocument(doc(visual));}
async function recheck(page:Page,document:ReturnType<typeof doc>,plan:PresentationPlan,nativeAst:unknown){return verifyLiniPresentationQuality(page,{document,plan,nativeAst});}
function expectAll(checks:Awaited<ReturnType<typeof verifyLiniPresentationQuality>>){expect(checks.map(check=>check.check)).toEqual(required);const failed=checks.filter(check=>check.result!=='pass');if(failed.length)throw new Error(JSON.stringify(failed));}

describe('pinned Lini presentation quality',()=>{
 it('binds native identities, visible labels, nested group membership and directed network links',async()=>{
  const good=await render({id:'nested-flow',kind:'flow',form:'network',question:'Where does a record travel?',title:'Record route',groups:[{id:'platform',label:'Platform',detail:'Owned API boundary',role:'boundary'},{id:'storage',label:'Storage',parent:'platform',role:'zone'}],nodes:[{id:'api',label:'Public API',detail:'Stable client surface',group:'platform'},{id:'store',label:'Record store',group:'storage'}],edges:[{id:'write',from:'api',to:'store',label:'Write record'}]});
  try{
   expectAll(good.checks);
   await good.page.locator('g.lini-node[data-id="n1"] > text.lini-text').first().evaluate(element=>{element.textContent='Public APX';});
   const wrongLabel=await recheck(good.page,good.document,good.plan,good.nativeAst);
   expect(result(wrongLabel,'lini-native-carriers')).toBe('fail');
   await good.page.locator('g.lini-node[data-id="n1"] > text.lini-text').first().evaluate(element=>{element.textContent='Public API';});
   const firstText=good.page.locator('g.lini-node[data-id="n1"] > text.lini-text').first();
   await firstText.evaluate(element=>{(element as SVGTextElement).style.fontFamily='Helvetica';});
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-native-carriers')).toBe('fail');
   await firstText.evaluate(element=>{(element as SVGTextElement).style.removeProperty('font-family');});
   const edgeLabel=good.page.locator('g.lini-link.lini-style-e1 > text.lini-link-label');
   await edgeLabel.evaluate(element=>{(element as SVGTextElement).style.fontFamily='Helvetica';});
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-native-carriers')).toBe('fail');
   await edgeLabel.evaluate(element=>{(element as SVGTextElement).style.removeProperty('font-family');});
   const sourceAttrs=await good.page.locator('g.lini-link.lini-style-e1').evaluate(element=>({from:element.getAttribute('data-from'),to:element.getAttribute('data-to')}));
   await good.page.locator('g.lini-link.lini-style-e1 > path:not(.lini-marker)').evaluate(element=>{element.setAttribute('d','M 10000 10000 L 10100 10100');});
   const detached=await recheck(good.page,good.document,good.plan,good.nativeAst);
   expect(await good.page.locator('g.lini-link.lini-style-e1').evaluate(element=>({from:element.getAttribute('data-from'),to:element.getAttribute('data-to')}))).toEqual(sourceAttrs);
   expect(result(detached,'lini-connection-endpoints')).toBe('fail');
   await good.page.locator('g.lini-node[data-id="n2"]').evaluate(element=>{const node=element as SVGGElement,root=node.ownerSVGElement?.querySelector('g.lini-scene');if(root)root.append(node);});
   const outside=await recheck(good.page,good.document,good.plan,good.nativeAst);
   expect(result(outside,'lini-containment-and-order')).toBe('fail');
   const blankAst=await recheck(good.page,good.document,good.plan,'');
   expect(result(blankAst,'lini-native-ast')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('keeps entity fields in their exact rows with types, badges, field ports, and multiplicities',async()=>{
  const good=await render({id:'field-ports',kind:'structure',form:'entities',question:'Which records reference each other?',nodes:[{id:'account',label:'Account table'},{id:'event',label:'Event table'}],structure:{entities:[{node:'account',fields:[{id:'account-id',name:'id',type:'uuid',keys:['pk'],nullable:false},{id:'account-name',name:'name',type:'text',nullable:false}]},{node:'event',fields:[{id:'event-id',name:'id',type:'uuid',keys:['pk'],nullable:false},{id:'event-account',name:'account_id',type:'uuid',keys:['fk'],nullable:false},{id:'event-payload',name:'payload',type:'json',nullable:true}]}],references:[{id:'account-events',from:{node:'account',fieldId:'account-id'},to:{node:'event',fieldId:'event-account'},label:'owns',fromCardinality:'exactly-one',toCardinality:'zero-or-many'},{id:'payload-range',from:{node:'event',fieldId:'event-payload'},to:{node:'account',fieldId:'account-name'},label:'range',fromMultiplicity:{min:2,max:4,text:'2..4'},toMultiplicity:{min:0,max:1,text:'0..1'}}]}});
  try{
   expectAll(good.checks);
   const fieldChanged=await good.page.locator('g.lini-node[data-id="n1"] g.lini-node.lini-cell[data-id="f1"] text.lini-text').evaluate(element=>{element.textContent='ix · PK · NOT NULL';});
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-entity-field-rows')).toBe('fail');
   await good.page.locator('g.lini-node[data-id="n1"] g.lini-node.lini-cell[data-id="f1"] text.lini-text').evaluate(element=>{element.textContent='id · PK · NOT NULL';});
   await good.page.locator('g.lini-node[data-id="n1"] g.lini-node.lini-cell').nth(2).locator('text.lini-text').evaluate(element=>{element.textContent='integer';});
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-entity-field-rows')).toBe('fail');
   await good.page.locator('g.lini-node[data-id="n1"] g.lini-node.lini-cell').nth(2).locator('text.lini-text').evaluate(element=>{element.textContent='uuid';});
   const exactOneLink=good.page.locator('g.lini-link.lini-style-r1'),exactOneAttrs=await exactOneLink.evaluate(element=>({from:element.getAttribute('data-from'),to:element.getAttribute('data-to')}));
   const removedSourceBar=await exactOneLink.evaluate(link=>{const bars=[...link.querySelectorAll('path.lini-marker:not(.lini-marker-arrow)')].filter(marker=>(marker.getAttribute('d')?.match(/\bM\b/gu)?.length??0)===1&&(marker.getAttribute('d')?.match(/\bL\b/gu)?.length??0)===1);if(!bars.length)return'';const markup=bars[0]!.outerHTML;bars[0]!.remove();return markup;});
   expect(removedSourceBar).not.toBe('');
   expect(await exactOneLink.evaluate(element=>({from:element.getAttribute('data-from'),to:element.getAttribute('data-to')}))).toEqual(exactOneAttrs);
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
   await exactOneLink.evaluate((link,markup)=>link.insertAdjacentHTML('beforeend',markup),removedSourceBar);
   const rangeLink=good.page.locator('g.lini-link.lini-style-r2'),rangeLabel=rangeLink.locator('text.lini-link-label');
   await rangeLabel.evaluate(element=>{element.textContent='range [from 2..4; to 9..9]';});
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
   await rangeLabel.evaluate(element=>{element.textContent='range [from 2..4; to 0..1]';});
   const optionalMarker=rangeLink.locator('circle.lini-marker');
   expect(await optionalMarker.count()).toBe(1);
   const optionalMarkerMarkup=await optionalMarker.evaluate(element=>element.outerHTML);
   await optionalMarker.evaluate(element=>element.remove());
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
   await rangeLink.evaluate((link,markup)=>link.insertAdjacentHTML('beforeend',markup),optionalMarkerMarkup);
   const link=good.page.locator('g.lini-link.lini-style-r1');
   const attrs=await link.evaluate(element=>({from:element.getAttribute('data-from'),to:element.getAttribute('data-to')}));
   await link.locator('> path:not(.lini-marker)').evaluate(element=>{element.setAttribute('transform','translate(0,23)');});
   expect(await link.evaluate(element=>({from:element.getAttribute('data-from'),to:element.getAttribute('data-to')}))).toEqual(attrs);
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
   await link.locator('> path:not(.lini-marker)').evaluate(element=>{element.removeAttribute('transform');});
   await link.locator('.lini-marker').evaluateAll(elements=>elements.forEach(element=>element.remove()));
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
   const row=good.page.locator('g.lini-node[data-id="n1"] g.lini-node.lini-cell[data-id="f1"]');
   await row.locator('text.lini-text').evaluate(element=>{element.textContent='changed · PK · NOT NULL';});
   await good.page.locator('svg.lini').evaluate(svg=>{const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.textContent='id · PK · NOT NULL';svg.append(text);});
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-entity-field-rows')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('checks authored stack layer order and refuses reordered native bands',async()=>{
  const good=await render({id:'ordered-stack',kind:'structure',form:'stack',question:'Which layer comes first?',nodes:[{id:'client',label:'Client',layer:'interface'},{id:'engine',label:'Engine',layer:'runtime'},{id:'records',label:'Records',layer:'storage'}],structure:{layers:[{id:'interface',label:'Interface'},{id:'runtime',label:'Runtime'},{id:'storage',label:'Storage'}]}});
  try{
   expectAll(good.checks);
   const runtimeCaption=good.page.locator('g.lini-caption').filter({hasText:'Runtime'}).first();
   expect(await runtimeCaption.count()).toBe(1);
   await runtimeCaption.evaluate(element=>{(element as SVGGElement).style.translate='0px -100px';});
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-containment-and-order')).toBe('fail');
   await runtimeCaption.evaluate(element=>{(element as SVGGElement).style.removeProperty('translate');});
   expectAll(await recheck(good.page,good.document,good.plan,good.nativeAst));
   const before=await good.page.locator('g.lini-node[data-id="l1"]').getAttribute('transform'),after=await good.page.locator('g.lini-node[data-id="l3"]').getAttribute('transform');
   expect(before).toBeDefined();expect(after).toBeDefined();expect(before).not.toBe(after);
   await good.page.locator('g.lini-node[data-id="l1"]').evaluate((element,transform)=>element.setAttribute('transform',transform??''),after);
   await good.page.locator('g.lini-node[data-id="l3"]').evaluate((element,transform)=>element.setAttribute('transform',transform??''),before);
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-containment-and-order')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('checks authored nested flow order and horizontal stack direction from native container geometry',async()=>{
  const flowDoc=createVisualDocument({id:'group-flow-order',kind:'flow',form:'network',question:'Which child comes first?',groups:[{id:'zone',label:'Zone',role:'zone',layout:{kind:'flow',direction:'LR',order:['right','left']}}],nodes:[{id:'left',label:'Left child',group:'zone'},{id:'right',label:'Right child',group:'zone'}]},'test:group-flow-order','1.2.0');
  const flow=await renderDocument(flowDoc);
  try{
   expectAll(flow.checks);
   const left=await flow.page.locator('g.lini-node[data-id="n1"]').getAttribute('transform'),right=await flow.page.locator('g.lini-node[data-id="n2"]').getAttribute('transform');
   expect(left).toBeDefined();expect(right).toBeDefined();expect(left).not.toBe(right);
   await flow.page.locator('g.lini-node[data-id="n1"]').evaluate((element,transform)=>element.setAttribute('transform',transform??''),right);
   await flow.page.locator('g.lini-node[data-id="n2"]').evaluate((element,transform)=>element.setAttribute('transform',transform??''),left);
   expect(result(await recheck(flow.page,flow.document,flow.plan,flow.nativeAst),'lini-containment-and-order')).toBe('fail');
  }finally{await flow.page.close();}

  const stackDoc=createVisualDocument({id:'horizontal-stack',kind:'structure',form:'stack',question:'Which band is leftmost?',layout:{kind:'stack',direction:'LR',order:['first-node','second-node']},nodes:[{id:'first-node',label:'First node',layer:'first'},{id:'second-node',label:'Second node',layer:'second'}],structure:{layers:[{id:'first',label:'First band'},{id:'second',label:'Second band'}]}},'test:horizontal-stack','1.2.0');
  const stack=await renderDocument(stackDoc);
  try{
   expectAll(stack.checks);
   const first=await stack.page.locator('g.lini-node[data-id="l1"]').getAttribute('transform'),second=await stack.page.locator('g.lini-node[data-id="l2"]').getAttribute('transform');
   expect(first).toBeDefined();expect(second).toBeDefined();expect(first).not.toBe(second);
   await stack.page.locator('g.lini-node[data-id="l1"]').evaluate((element,transform)=>element.setAttribute('transform',transform??''),second);
   await stack.page.locator('g.lini-node[data-id="l2"]').evaluate((element,transform)=>element.setAttribute('transform',transform??''),first);
   expect(result(await recheck(stack.page,stack.document,stack.plan,stack.nativeAst),'lini-containment-and-order')).toBe('fail');
  }finally{await stack.page.close();}
 });

 it('binds stack caption clearance to its own layer when labels repeat elsewhere',async()=>{
  const document=createVisualDocument({id:'repeated-layer-labels',kind:'structure',form:'stack',question:'Shared',nodes:[{id:'component-one',label:'First component',layer:'layer-one'},{id:'component-two',label:'Second component',layer:'layer-two'}],structure:{layers:[{id:'layer-one',label:'Shared'},{id:'layer-two',label:'Shared'}]}},'test:repeated-layer-labels','1.2.0');
  const repeated=await renderDocument(document);
  try{
   expectAll(repeated.checks);
   const orderCheck=repeated.checks.find(check=>check.check==='lini-containment-and-order');
   expect(orderCheck?.details).toContain('layer-two ');
  }finally{await repeated.page.close();}
 });

 it('checks one-column entity order from native positions and rejects swapped geometry',async()=>{
  const document=createVisualDocument({id:'entity-column-order',kind:'structure',form:'entities',question:'Which entity is first?',layout:{kind:'grid',columns:1,order:['b','a']},nodes:[{id:'a',label:'Entity A'},{id:'b',label:'Entity B'}],structure:{entities:[{node:'a',fields:[{name:'id',type:'uuid'}]},{node:'b',fields:[{name:'id',type:'uuid'}]}]}},'test:entity-column-order','1.2.0');
  const good=await renderDocument(document);
  try{
   expectAll(good.checks);
   const first=await good.page.locator('g.lini-node[data-id="n1"]').getAttribute('transform'),second=await good.page.locator('g.lini-node[data-id="n2"]').getAttribute('transform');
   expect(first).toBeDefined();expect(second).toBeDefined();expect(first).not.toBe(second);
   await good.page.locator('g.lini-node[data-id="n1"]').evaluate((element,transform)=>element.setAttribute('transform',transform??''),second);
   await good.page.locator('g.lini-node[data-id="n2"]').evaluate((element,transform)=>element.setAttribute('transform',transform??''),first);
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-containment-and-order')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('verifies every standalone native shape and the located entity-shape approximation',async()=>{
  const visual:Visual={id:'native-shapes',kind:'flow',form:'network',question:'Which native shape is each component?',nodes:[
   {id:'rectangle',label:'Rectangle',shape:'rectangle'},{id:'round',label:'Rounded rectangle',shape:'rounded-rectangle'},
   {id:'ellipse',label:'Ellipse',shape:'ellipse'},{id:'diamond',label:'Diamond',shape:'diamond'},
   {id:'hexagon',label:'Hexagon',shape:'hexagon'},{id:'cylinder',label:'Cylinder',shape:'cylinder'},
   {id:'note',label:'Folded corner',shape:'folded-corner'},
  ]};
  const standalone=await renderDocument(createVisualDocument(visual,'test:native-shapes','1.2.0'));
  try{
   expectAll(standalone.checks);
   const hex=standalone.page.locator('g.lini-node[data-id="n5"]'),label=await hex.locator(':scope > text.lini-text').first().textContent();
   await hex.evaluate(element=>{element.classList.remove('lini-hex');element.classList.add('lini-diamond');});
   expect(await hex.locator(':scope > text.lini-text').first().textContent()).toBe(label);
   expect(result(await recheck(standalone.page,standalone.document,standalone.plan,standalone.nativeAst),'lini-native-carriers')).toBe('fail');
   await hex.evaluate(element=>{element.classList.remove('lini-diamond');element.classList.add('lini-hex');});
   const rect=standalone.page.locator('g.lini-node[data-id="n1"] > rect');
   await rect.evaluate(element=>element.setAttribute('rx','8'));
   expect(result(await recheck(standalone.page,standalone.document,standalone.plan,standalone.nativeAst),'lini-native-carriers')).toBe('fail');
  }finally{await standalone.page.close();}

  const entityDoc=createVisualDocument({id:'entity-shape',kind:'structure',form:'entities',question:'What shape was requested?',nodes:[{id:'table',label:'Table',shape:'hexagon'}],structure:{entities:[{node:'table',fields:[]}]}},'test:entity-shape','1.2.0');
  const entity=await renderDocument(entityDoc);
  try{
   expectAll(entity.checks);
   const shapeCell=entity.page.locator('g.lini-node[data-id="n1"] g.lini-node.lini-cell[data-id="shape"] text.lini-text');
   expect(await shapeCell.textContent()).toBe('(requested shape: hexagon)');
   await shapeCell.evaluate(element=>{element.textContent='(requested shape: diamond)';});
   expect(result(await recheck(entity.page,entity.document,entity.plan,entity.nativeAst),'lini-native-carriers')).toBe('fail');
  }finally{await entity.page.close();}
 });

 it('replays all six actual showcase definitions through pinned Lini and Chromium',async()=>{
  const root=resolve(import.meta.dir,'../..'),manifest=JSON.parse(readFileSync(resolve(root,'fixtures/showcase/showcase-sources.json'),'utf8')) as {examples:Array<{id:string;definitionPath:string}>};
  for(const example of manifest.examples){
   const document=readVisualDocument(readFileSync(resolve(root,example.definitionPath),'utf8'),'json'),plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});
   expect(plan.ok,`${example.id} must compile to current Lini`).toBe(true);if(!plan.ok)continue;
   const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900}});
   try{
    await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden}#frame{width:1600px;height:900px}#frame svg{width:100%;height:100%}</style><div id="frame"></div>',{waitUntil:'domcontentloaded'});
    await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},native.svg);
    expectAll(await verifyLiniPresentationQuality(page,{document,plan,nativeAst:native.nativeAst}));
   }finally{await page.close();}
  }
 });
});
