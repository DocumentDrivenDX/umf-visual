// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,describe,expect,it} from 'bun:test';
import {chromium,type Browser} from 'playwright';
import {readVisualDocument} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';
import {createHash} from 'node:crypto';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyLiniMatrixPresentationQuality} from '../../scripts/presentation/lini-matrix-quality';

let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});
const fixture='fixtures/reviews/definitions/helix-adr-options.json';
async function documentFrom(text?:string){return readVisualDocument(text??await Bun.file(fixture).text(),'json');}
async function render(document:Awaited<ReturnType<typeof documentFrom>>){
 const plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});if(!plan.ok)throw Error(JSON.stringify(plan));expect(plan.ok,'matrix must compile').toBe(true);
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900}});
 await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:#fff}#frame{width:1600px;height:900px}#frame svg{width:100%;height:100%}</style><div id="frame"></div>');
 await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},native.svg);
 return{document,plan,page,nativeAst:native.nativeAst,svg:native.svg};
}
async function verify(good:Awaited<ReturnType<typeof render>>,nativeAst=good.nativeAst,plan=good.plan){return verifyLiniMatrixPresentationQuality(good.page,{document:good.document,plan,nativeAst});}
const row=(checks:Awaited<ReturnType<typeof verify>>,id:string)=>checks.find(check=>check.check===id);
type ProofCase=Awaited<ReturnType<typeof render>>;
type Mutation={check:string;verify?:()=>Promise<Awaited<ReturnType<typeof verify>>>;ast?:string;plan?:ProofCase['plan']};
async function negative(mutate:(good:ProofCase)=>Promise<Mutation>,sourceText?:string){
 const good=await render(await documentFrom(sourceText));
 try{
  const baseline=await verify(good);expect(baseline.every(check=>check.result==='pass'),`unmutated matrix is a passing baseline: ${JSON.stringify(baseline.filter(check=>check.result==='fail'))}`).toBe(true);
  const changed=await mutate(good),checks=changed.verify?await changed.verify():await verify(good,changed.ast??good.nativeAst,changed.plan??good.plan);
  expect(row(checks,changed.check)?.result,`mutation must fail ${changed.check}`).toBe('fail');
 }finally{await good.page.close();}
}
async function mixedMatrix(){
 const source=JSON.parse(await Bun.file(fixture).text()) as any,visual=source.extensions['umf.visual'],comparison=visual.comparison;
 const ids=new Map(comparison.items.map((item:any,index:number)=>[item.id,`item-renamed-${index+1}`]));for(const item of comparison.items)item.id=ids.get(item.id);
 const criterionIds=new Map(comparison.criteria.map((criterion:any,index:number)=>[criterion.id,`criterion-renamed-${index+1}`]));for(const criterion of comparison.criteria)criterion.id=criterionIds.get(criterion.id);
 for(const value of comparison.values){value.item=ids.get(value.item);value.criterion=criterionIds.get(value.criterion);}
 comparison.chosen.item=ids.get(comparison.chosen.item);
 comparison.items[1].label=comparison.items[0].label;comparison.items[0].detail='Keep the source format.\nPreserve the reviewable workflow.';
 comparison.criteria[1].label=comparison.criteria[0].label;comparison.criteria[0].measure='support';comparison.criteria[0].detail='Check support explicitly.\nDo not infer missing cells.';
 comparison.criteria[1].measure='rating';comparison.criteria[1].max=5;comparison.criteria[1].low='low';comparison.criteria[1].high='high';
 comparison.criteria.push({id:'criterion-renamed-4',label:'Operational clarity',measure:'text',detail:'Optional detail with an explicit\nparagraph boundary.'});
 for(const item of comparison.items)comparison.values.push({item:item.id,criterion:'criterion-renamed-4',text:`${item.label} keeps the source record intact.`});
 for(const value of comparison.values){if(value.criterion==='criterion-renamed-1'){delete value.text;value.support=value.item==='item-renamed-1'?'yes':value.item==='item-renamed-2'?'partial':'no';}else if(value.criterion==='criterion-renamed-2'){delete value.text;value.rating=value.item==='item-renamed-1'?4:value.item==='item-renamed-2'?2:5;}if(value.item==='item-renamed-1'&&value.criterion==='criterion-renamed-3')value.note='The claim remains linked to this exact cell.\nIts authored second paragraph is retained.';}
 comparison.items.push({id:'item-renamed-4',label:'Fourth candidate'});for(const criterion of comparison.criteria){comparison.values.push(criterion.measure==='support'?{item:'item-renamed-4',criterion:criterion.id,support:'partial'}:criterion.measure==='rating'?{item:'item-renamed-4',criterion:criterion.id,rating:3}:{item:'item-renamed-4',criterion:criterion.id,text:'Explicit fourth-column value'});}
 comparison.values.reverse();comparison.chosen.item='item-renamed-2';comparison.chosen.reason='Choose the JSONL contract.\nIt is the smallest sufficient change.';visual.question='Which authored option meets the review criteria?';visual.title='Quoted literal |table#comparison-table| [not a carrier]';
 return JSON.stringify(source);
}

describe('independent native Lini comparison matrix proof',()=>{
 it('proves source-ordered complete typed cells, exact joins, and the authored choice',async()=>{
  const good=await render(await documentFrom());
  try{const checks=await verify(good);expect(checks.map(check=>check.check).sort()).toEqual(['lini-matrix-values-choice','lini-native-ast','lini-native-carriers']);expect(checks.filter(check=>check.result==='fail')).toEqual([]);expect(await good.page.locator('g.lini-node[data-id="comparison-table"] > g.lini-node.lini-cell').count()).toBe(16);expect(await good.page.locator('g.lini-node[data-id="comparison-choice"] text').textContent()).toContain('Reason: smallest sufficient hardening');}
  finally{await good.page.close();}
 },{timeout:30_000});

 it('proves renamed IDs, a different 4×4 dimension, mixed typed values, notes, hard breaks, and duplicate-label disambiguation',async()=>{
  const good=await render(await documentFrom(await mixedMatrix()));
  try{const checks=await verify(good);expect(checks.filter(check=>check.result==='fail'),JSON.stringify(checks.filter(check=>check.result==='fail'))).toEqual([]);expect(await good.page.locator('g.lini-node[data-id="comparison-item-2"] text').textContent()).toContain('(id: item-renamed-2)');expect(await good.page.locator('g.lini-node[data-id="comparison-criterion-2"] text').textContent()).toContain('(id: criterion-renamed-2)');expect(await good.page.locator('g.lini-node[data-id="comparison-choice"] text').textContent()).toContain('(id: item-renamed-2)');expect(await good.page.locator('g.lini-node[data-id="comparison-cell-r2-c2"] text').textContent()).toBe('yes');expect(await good.page.locator('g.lini-node[data-id="comparison-cell-r3-c2"] text').textContent()).toBe('4');}
  finally{await good.page.close();}
 },{timeout:45_000});

 it('rejects swapped cell maps, wrong choice identity, missing/extra/borrowed owners, hidden glyphs, and truncated native words',async()=>{
  const sourcePath='/extensions/umf.visual/comparison/values/0';
  await negative(async good=>({check:'lini-matrix-values-choice',plan:{...good.plan,elementMap:good.plan.elementMap.map(item=>item.sourcePath===sourcePath?{...item,nativeId:'comparison-cell-r4-c4'}:item)}}));
  await negative(async good=>({check:'lini-matrix-values-choice',plan:{...good.plan,elementMap:good.plan.elementMap.map(item=>item.sourcePath==='/extensions/umf.visual/comparison/chosen/item'?{...item,logicalId:'option-naive'}:item)}}));
  await negative(async good=>{await good.page.locator('g.lini-node[data-id="comparison-cell-r2-c2"] text.lini-text').evaluate(element=>element.textContent='wrong value');return{check:'lini-matrix-values-choice'};});
  await negative(async good=>{await good.page.locator('g.lini-node[data-id="comparison-choice"] text.lini-text').evaluate(element=>element.textContent='Selected: another option');return{check:'lini-matrix-values-choice'};});
  await negative(async good=>{await good.page.locator('g.lini-node[data-id="comparison-cell-r2-c2"]').evaluate(element=>element.remove());return{check:'lini-native-carriers'};});
  await negative(async good=>{await good.page.locator('g.lini-node[data-id="comparison-cell-r2-c2"] text.lini-text').evaluate(element=>(element as SVGElement).setAttribute('opacity','0'));return{check:'lini-native-carriers'};});
  await negative(async good=>{await good.page.locator('#frame svg').evaluate(element=>element.setAttribute('opacity','0'));return{check:'lini-native-carriers'};});
  await negative(async good=>{await good.page.locator('g.lini-node[data-id="comparison-cell-r3-c2"] text.lini-text tspan').first().evaluate(element=>(element as SVGTSpanElement).style.setProperty('fill','color(srgb 0 0 0 / 0)'));return{check:'lini-native-carriers'};});
  await negative(async good=>{await good.page.locator('g.lini-node[data-id="comparison-cell-r3-c2"] text.lini-text tspan').first().evaluate(element=>(element as SVGTSpanElement).setAttribute('opacity','0'));return{check:'lini-native-carriers'};});
  await negative(async good=>{await good.page.locator('g.lini-node[data-id="comparison-cell-r2-c2"]').evaluate(element=>element.setAttribute('data-id','comparison-cell-r2-c2-extra'));return{check:'lini-native-carriers'};});
  await negative(async good=>{await good.page.locator('g.lini-node[data-id="comparison-table"]').evaluate(element=>element.insertAdjacentHTML('beforeend','<line x1="0" y1="0" x2="1" y2="1"/>'));return{check:'lini-native-carriers'};});
  const auxSource=JSON.parse(await Bun.file(fixture).text());auxSource.extensions['umf.visual'].comparison.items[0].detail='First paragraph.\n\nThird paragraph.';const withAux=JSON.stringify(auxSource);
  await negative(async good=>({check:'lini-native-ast',plan:{...good.plan,elementMap:good.plan.elementMap.filter(item=>!item.sourcePath.endsWith('/items/0/detail'))}}),withAux);
  await negative(async good=>{await good.page.locator('g.lini-node[data-id="comparison-item-detail-1"]').evaluate(element=>element.remove());return{check:'lini-native-carriers'};},withAux);
  await negative(async good=>{const line=good.page.locator('g.lini-node[data-id="comparison-item-detail-1"] text.lini-text');await line.evaluate(element=>element.textContent='Item detail (Keep naive JSONL read/modify/write and rely on careful operator usage): First paragraph. Third paragraph.');return{check:'lini-native-carriers'};},withAux);
  await negative(async good=>{await good.page.locator('g.lini-node[data-id="comparison-choice"] text.lini-text').evaluate(element=>element.textContent='Selected: JSON Lines\nReason: Choose another contract.');return{check:'lini-native-carriers'};});
  await negative(async good=>{const ast=good.nativeAst.replace('|block#comparison-cell-r2-c2|','|block#TEMP|').replace('|block#comparison-cell-r2-c3|','|block#comparison-cell-r2-c2|').replace('|block#TEMP|','|block#comparison-cell-r2-c3|');return{check:'lini-native-ast',ast};});
  await negative(async good=>{const ast=good.nativeAst.replace('|block#comparison-cell-r2-c2|','|table#comparison-cell-r2-c2|');return{check:'lini-native-ast',ast};});
  await negative(async good=>{const ast=good.nativeAst.replace('Lowest implementation effort','Lowest implementation');return{check:'lini-native-ast',ast};});
 },{timeout:45_000});

 it('keeps the before/after native source bytes unchanged and refuses incomplete matrices',async()=>{
  const beforeAfter=readVisualDocument(await Bun.file('fixtures/visual/forms/visuals-before-after.json').text(),'json'),plan=compilePresentation(beforeAfter,{backend:'lini'});expect(plan.ok).toBe(true);if(plan.ok)expect(createHash('sha256').update(plan.source).digest('hex')).toBe('5441d1175de1f5e9ef7ded27f087a60d027ac786597c1a070d7c00be19e6c604');
  const incomplete=JSON.parse(await Bun.file(fixture).text());incomplete.extensions['umf.visual'].comparison.values.pop();expect(()=>readVisualDocument(JSON.stringify(incomplete),'json')).toThrow();
  const empty=JSON.parse(await Bun.file(fixture).text());empty.extensions['umf.visual'].comparison.values[0].text='';expect(()=>readVisualDocument(JSON.stringify(empty),'json')).toThrow();
 });
});
