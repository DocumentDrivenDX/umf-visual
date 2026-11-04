// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,describe,expect,it} from 'bun:test';
import {chromium,type Browser} from 'playwright';
import type {Document} from '@umf/core';
import {createVisualDocument,getVisual,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';

let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});

async function dot(plan:PresentationPlan,format:'svg'|'json'){
 const child=Bun.spawn(['dot','-T'+format],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 child.stdin.write(plan.source);child.stdin.end();
 const [out,err,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 expect(exit).toBe(0);expect(err).toBe('');return out;
}
async function check(document:Document){
 const compiled=compilePresentation(document,{backend:'graphviz',theme:'presentation/1'});expect(compiled.ok).toBe(true);if(!compiled.ok)throw Error(JSON.stringify(compiled));
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  const [svg,json]=await Promise.all([dot(compiled,'svg'),dot(compiled,'json')]);
  return{page,plan:compiled,svg,ast:JSON.parse(json) as {objects:Array<{name:string;label?:string}>},checks:await verifyPresentationQuality(page,{svg,document,plan:compiled,nativeAst:JSON.parse(json)})};
 }catch(error){await page.close();throw error;}
}
const fieldCheck=(checks:Awaited<ReturnType<typeof verifyPresentationQuality>>) => checks.find(item=>item.check==='graphviz-entity-field-rows')?.result;
const entityNativeId=(plan:PresentationPlan,id:string)=>plan.elementMap.find(item=>(item.kind==='node'||item.kind==='entity')&&item.logicalId===id)?.nativeId;
const workspacePath='fixtures/reviews/definitions/beacon-schema-workspace.json';
const workspaceRaw=await Bun.file(workspacePath).text();
const workspaceDefinition=JSON.parse(workspaceRaw) as Document;
const workspaceVisual=getVisual(workspaceDefinition) as Visual;
const withSettings=workspaceDefinition;

describe('Graphviz entity field badge ownership',()=>{
 it('accepts combined PK/FK plus nullability in the exact mapped SVG row and AST port',async()=>{
  const good=await check(withSettings);
  try{
   expect(fieldCheck(good.checks),good.checks.find(item=>item.check==='graphviz-entity-field-rows')?.details).toBe('pass');
   const settingsId=entityNativeId(good.plan,'settings');
   expect(settingsId).toBeDefined();
   expect(workspaceDefinition.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
   expect(good.plan.source).toContain('PK, FK · NOT NULL');
   expect(good.ast.objects.find(object=>object.name===settingsId)?.label).toContain('PK, FK · NOT NULL');
   expect(await Bun.file(workspacePath).text()).toBe(workspaceRaw);
  }finally{await good.page.close();}
 });

 it('accepts different valid key orders and does not mistake field names or types for badges',async()=>{
  const visual:Visual={id:'field-badge-atomic-controls',kind:'structure',form:'entities',question:'Which field declarations are visible?',nodes:[{id:'record',label:'records'},{id:'lookup',label:'lookup'}],structure:{entities:[
   {node:'record',fields:[{id:'composite',name:'workspace_id',type:'uuid',keys:['pk','fk'],nullable:false},{id:'reordered',name:'lookup_id',type:'uuid',keys:['uk','fk','pk'],nullable:true},{id:'marker-name',name:'PK',type:'FK'},{id:'html-name',name:'label<&>"owner',type:'varchar<&>"value',keys:['pk','fk'],nullable:true}]},
   {node:'lookup',fields:[{id:'marker-type',name:'not_null',type:'NULL'}],},
  ],references:[{id:'record-lookup',from:{node:'record',fieldId:'composite'},to:{node:'lookup',fieldId:'marker-type'},label:'references',fromCardinality:'exactly-one',toCardinality:'zero-or-many'}]}};
  const good=await check(createVisualDocument(visual,'quality:field-badge-atomic-controls','1.1.0'));
  try{expect(fieldCheck(good.checks),good.checks.find(item=>item.check==='graphviz-entity-field-rows')?.details).toBe('pass');}finally{await good.page.close();}
 });

 it('rejects missing, extra, or nullability-confused badges independently in SVG and native AST',async()=>{
  const good=await check(withSettings);
  try{
   const label='PK, FK · NOT NULL';
   for(const replacement of ['FK · NOT NULL','PK, FK · NULL','PK, FK, BOGUS · NOT NULL']){
    const svg=good.svg.replace(label,replacement);expect(svg).not.toBe(good.svg);
    expect(fieldCheck(await verifyPresentationQuality(good.page,{svg,document:withSettings,plan:good.plan,nativeAst:good.ast}))).toBe('fail');
   }
   const settingsId=entityNativeId(good.plan,'settings');
   expect(settingsId).toBeDefined();
   for(const replacement of ['FK · NOT NULL','PK, FK · NULL','PK, FK, BOGUS · NOT NULL']){
    const ast={...good.ast,objects:good.ast.objects.map(object=>object.name===settingsId?{...object,label:object.label?.replace(label,replacement)}:object)};
    expect(ast.objects.find(object=>object.name===settingsId)?.label).not.toBe(good.ast.objects.find(object=>object.name===settingsId)?.label);
    expect(fieldCheck(await verifyPresentationQuality(good.page,{svg:good.svg,document:withSettings,plan:good.plan,nativeAst:ast}))).toBe('fail');
   }
  }finally{await good.page.close();}
 });

 it('rejects marker text moved to a neighboring row or a different entity owner',async()=>{
  const good=await check(withSettings);
  try{
   const settingsId=entityNativeId(good.plan,'settings');
   const otherId=entityNativeId(good.plan,'agents');
   expect(settingsId).toBeDefined();expect(otherId).toBeDefined();
   const neighbor=await good.page.locator('#frame svg').evaluate((root,nativeId)=>{
    const entity=[...root.querySelectorAll('g.node')].find(node=>node.querySelector(':scope > title')?.textContent?.trim()===nativeId);
    const badge=[...(entity?.querySelectorAll('text')??[])].find(text=>text.textContent?.trim()==='PK, FK · NOT NULL');
    const field=[...(entity?.querySelectorAll('text')??[])].find(text=>text.textContent?.includes('default_tone: text'));
    if(!badge||!field)throw Error('The mapped combined badge or neighboring field row is missing.');
    badge.setAttribute('y',field.getAttribute('y')??'');
    return(root as SVGSVGElement).outerHTML;
   },settingsId!);
   expect(neighbor).not.toBe(good.svg);
   expect(fieldCheck(await verifyPresentationQuality(good.page,{svg:neighbor,document:withSettings,plan:good.plan,nativeAst:good.ast}))).toBe('fail');

   const wrongOwner=await good.page.locator('#frame svg').evaluate((root,ids)=>{
    const owner=[...root.querySelectorAll('g.node')].find(node=>node.querySelector(':scope > title')?.textContent?.trim()===ids.settings);
    const other=[...root.querySelectorAll('g.node')].find(node=>node.querySelector(':scope > title')?.textContent?.trim()===ids.other);
    const badge=[...(owner?.querySelectorAll('text')??[])].find(text=>text.textContent?.trim()==='PK, FK · NOT NULL');
    if(!owner||!other||!badge)throw Error('The exact source badge owner or target entity is missing.');
    other.append(badge);return(root as SVGSVGElement).outerHTML;
   },{settings:settingsId!,other:otherId!});
   expect(wrongOwner).not.toBe(good.svg);
   expect(fieldCheck(await verifyPresentationQuality(good.page,{svg:wrongOwner,document:withSettings,plan:good.plan,nativeAst:good.ast}))).toBe('fail');
  }finally{await good.page.close();}
 });
});
