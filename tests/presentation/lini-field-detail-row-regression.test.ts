// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {chromium,type Browser} from 'playwright';
import type {Document} from '@umf/core';
import {createVisualDocument,getVisual,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyLiniPresentationQuality} from '../../scripts/presentation/lini-quality';
import type {PresentationQualityCheck} from '../../scripts/presentation/quality';

const source=readVisualDocument(readFileSync('fixtures/showcase/definitions/umf-logical-metamodel-reviewed.json','utf8'),'json') as Document;
const checkId='lini-entity-field-rows';let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>await browser?.close());
const result=(checks:PresentationQualityCheck[])=>checks.find(check=>check.check===checkId);
async function dotlessRender(document:Document){
 const plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});expect(plan.ok,plan.ok?'':JSON.stringify(plan)).toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan));
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden}#frame{width:1600px;height:900px}#frame svg{width:100%;height:100%}</style><div id="frame"></div>',{waitUntil:'domcontentloaded'});
 await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},native.svg);
 const checks=await verifyLiniPresentationQuality(page,{document,plan,nativeAst:native.nativeAst});
 return{document,plan,page,svg:native.svg,nativeAst:native.nativeAst,checks};
}
function renamedVariant():Document{
 const visual:Visual={id:'unicode-reviewed-schema',kind:'structure',form:'entities',title:'Authored schema rows',question:'How do these source records connect?',nodes:[
  {id:'catalog',label:'資料 Catalog',detail:'A multilingual catalog description\n\nwith a distinct second paragraph.'},
  {id:'entry',label:'Entry',detail:'An entry remains an independent logical record.'},
 ],structure:{entities:[
  {node:'catalog',fields:[
   {id:'catalog-key',name:'識別子',type:'identifier<UUID>',keys:['pk'],nullable:false},
   {id:'catalog-title',name:'display_name',type:'text<Unicode>',keys:['uk'],nullable:true},
   {id:'catalog-entries',name:'entries',type:'sequence<link<Entry>>',nullable:false},
  ]},
  {node:'entry',fields:[
   {id:'entry-key',name:'entry_id',type:'link<id>',keys:['pk'],nullable:false},
   {id:'entry-value',name:'value',type:'object<arbitrary UMF>',nullable:true},
  ]},
 ],references:[{id:'catalog-entry-ref',from:{node:'catalog',fieldId:'catalog-entries'},to:{node:'entry'},label:'contains'}]}};
 return createVisualDocument(visual,'test:unicode-reviewed-schema','1.1.0');
}

test('Lini keeps detail cells separate from complete field name/type rows on reviewed and renamed entities',async()=>{
 for(const document of [source,renamedVariant()]){
  const built=await dotlessRender(document);try{
   const visual=getVisual(document)!,fields=visual.structure?.entities?.flatMap(entity=>entity.fields)??[];
   expect(fields.length,`${visual.id} includes paired fields`).toBeGreaterThan(0);
   const required=['lini-native-ast','lini-native-carriers','lini-connection-endpoints','lini-containment-and-order',checkId];
   for(const id of required){const found=built.checks.find(check=>check.check===id);expect(found,`${visual.id} required ${id}`).toBeDefined();expect(found?.result,`${visual.id}/${id}: ${found?.details}`).toBe('pass');}
   expect(result(built.checks)?.result,`${visual.id}: ${result(built.checks)?.details}`).toBe('pass');
   expect(result(built.checks)?.details).toContain(`All ${fields.length} fields`);
   expect(built.plan.elementMap.filter(item=>item.kind==='field')).toHaveLength(fields.length);
   if(visual.id==='unicode-reviewed-schema'){
    expect(built.plan.elementMap.filter(item=>item.kind==='reference')).toHaveLength(1);
    const references=visual.structure?.references??[];
    expect(references[0]?.from.fieldId).toBe('catalog-entries');
   }
   const mapping=built.plan.elementMap.find(item=>item.kind==='field');expect(mapping).toBeDefined();if(!mapping)continue;
   const localId=mapping.nativeId.split('.').at(-1)!;
   const checkMutation=async(name:string,mutation:'shift-field'|'wrong-title'|'truncate-detail',token:string,target:string)=>{
    await built.page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},built.svg);
    const clean=await verifyLiniPresentationQuality(built.page,{document,plan:built.plan,nativeAst:built.nativeAst});expect(result(clean)?.result,`${visual.id} fresh ${name} baseline`).toBe('pass');
    await built.page.locator('#frame svg').evaluate((root,{mutation,token})=>{
     const svg=root as SVGSVGElement;
     if(mutation==='shift-field'){
      const row=svg.querySelector<SVGGElement>(`g.lini-node.lini-entity g.lini-node.lini-cell[data-id="${token}"]`),type=row?.nextElementSibling as SVGGElement|null;
      if(!row||!type||!type.classList.contains('lini-cell'))throw Error(`Field ${token} has no adjacent native type cell`);
      type.setAttribute('transform',`${type.getAttribute('transform')??''} translate(0,24)`);
     }else if(mutation==='wrong-title'){
      const title=svg.querySelector(`g.lini-node.lini-entity[data-id="${token}"] g.lini-node.lini-header text.lini-text tspan`);if(!title)throw Error('Mapped entity title tspan is missing');title.textContent='Wrong title';
     }else{
      const title=svg.querySelector(`g.lini-node.lini-entity[data-id="${token}"] g.lini-node.lini-header text.lini-text`),spans=title?[...title.querySelectorAll('tspan')]:[],detail=spans.filter(span=>(span.textContent??'').trim()).at(-1);if(!detail)throw Error('Mapped entity detail tspan is missing');detail.textContent='truncated detail';
     }
    },{mutation,token});
    const changed=await verifyLiniPresentationQuality(built.page,{document,plan:built.plan,nativeAst:built.nativeAst}),targetCheck=changed.find(check=>check.check===target);expect(targetCheck?.result,`${visual.id} ${name} (${target}): ${targetCheck?.details}`).toBe('fail');
   };
   await checkMutation('field type shifted away from its row','shift-field',localId,checkId);
   if(visual.id==='unicode-reviewed-schema'){
    const entityId=built.plan.elementMap.find(item=>item.kind==='entity'&&item.logicalId==='catalog')!.nativeId;
    await checkMutation('entity title changed','wrong-title',entityId,'lini-native-carriers');
    expect(await built.page.locator(`g.lini-node.lini-entity[data-id="${entityId}"] g.lini-node.lini-header text.lini-text tspan`).first().textContent()).toBe('Wrong title');
    await checkMutation('entity detail truncated','truncate-detail',entityId,'lini-native-carriers');
   }
  }finally{await built.page.close();}
 }
},{timeout:120_000});
