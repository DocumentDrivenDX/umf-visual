// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {chromium,type Browser} from 'playwright';
import {readVisualDocument} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';
import {requiredPresentationChecks} from '../../scripts/presentation/verify';

const document=readVisualDocument(await Bun.file('fixtures/visual/forms/visuals-before-after.json').text(),'json');
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});
const named=(checks:Awaited<ReturnType<typeof verifyPresentationQuality>>,id:string)=>checks.find(check=>check.check===id);
const swapTranslation=(svg:string,first:string[],second:string[],axis:'x'|'y')=>{
 const read=(id:string)=>{const match=svg.match(new RegExp(`data-id="${id}" transform="translate\\((-?[0-9.]+),(-?[0-9.]+)\\)"`));if(!match)throw new Error(`Missing native transform for ${id}`);return{match:match[0],x:match[1]!,y:match[2]!};};
 const left=first.map(read),right=second.map(read);if(left.length!==right.length)throw new Error('Mutation groups must have equal size');
 const replacements=new Map<string,string>();for(let index=0;index<left.length;index++){const a=left[index]!,b=right[index]!,aX=axis==='x'?b.x:a.x,aY=axis==='y'?b.y:a.y,bX=axis==='x'?a.x:b.x,bY=axis==='y'?a.y:b.y;replacements.set(a.match,a.match.replace(`translate(${a.x},${a.y})`,`translate(${aX},${aY})`));replacements.set(b.match,b.match.replace(`translate(${b.x},${b.y})`,`translate(${bX},${bY})`));}
 for(const[before,after]of replacements)svg=svg.replace(before,after);return svg;
};

test('Lini native table binds exact before/after values to declared item columns and criterion rows',async()=>{
 const plan=compilePresentation(document,{backend:'lini'});expect(plan.ok).toBe(true);if(!plan.ok)return;
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  await page.setContent('<!doctype html><meta charset="utf-8"><div id="frame"></div>');
  await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},native.svg);
  const checks=await verifyPresentationQuality(page,{svg:native.svg,document,plan,nativeAst:native.nativeAst});
  expect(requiredPresentationChecks('lini',document.extensions!['umf.visual'] as any)).toEqual(checks.map(row=>row.check).sort());
  expect(checks.filter(row=>row.result==='fail')).toEqual([]);
  expect(named(checks,'lini-before-after-values-and-ownership')?.details).toContain('8 source values');
  expect(named(checks,'lini-before-after-values-and-ownership')?.details).toContain('yes/no/partial');

  const swapped={...plan,elementMap:plan.elementMap.map(item=>item.sourcePath==='/extensions/umf.visual/comparison/values/0/text'?{...item,nativeId:'before-after-cell-r2-c3'}:item)};
  const wrongMap=await verifyPresentationQuality(page,{svg:native.svg,document,plan:swapped,nativeAst:native.nativeAst});
  expect(named(wrongMap,'lini-before-after-values-and-ownership')?.result).toBe('fail');

  const hiddenTextSvg=native.svg.replace('<text class="lini-text" x="0" y="0" dy="0.358em" style="font-family: Arial">Four places</text>','<text class="lini-text" x="0" y="0" dy="0.358em" style="font-family: Arial; display: none">Four places</text>');
  expect(hiddenTextSvg).not.toBe(native.svg);
  const hiddenText=await verifyPresentationQuality(page,{svg:hiddenTextSvg,document,plan,nativeAst:native.nativeAst});
  expect(named(hiddenText,'lini-before-after-values-and-ownership')?.result).toBe('fail');

  const marker='<g class="lini-node lini-cell lini-block" data-id="before-after-cell-r2-c2" transform="translate(-30,-23)"';
  expect(native.svg).toContain(marker);
  const movedSvg=native.svg.replace(marker,'<g class="lini-node lini-cell lini-block" data-id="before-after-cell-r2-c2" transform="translate(300,-23)"');
  const moved=await verifyPresentationQuality(page,{svg:movedSvg,document,plan,nativeAst:native.nativeAst});
  expect(named(moved,'lini-native-carriers')?.result).toBe('fail');

  const leftColumn=['before-after-item-1',...Array.from({length:4},(_,index)=>`before-after-cell-r${index+2}-c2`)];
  const rightColumn=['before-after-item-2',...Array.from({length:4},(_,index)=>`before-after-cell-r${index+2}-c3`)];
  const swappedColumns=swapTranslation(native.svg,leftColumn,rightColumn,'x');
  const columnOrder=await verifyPresentationQuality(page,{svg:swappedColumns,document,plan,nativeAst:native.nativeAst});
  expect(named(columnOrder,'lini-native-carriers')?.result).toBe('fail');
  expect(named(columnOrder,'lini-native-carriers')?.details).toContain('item header columns are not left-to-right in authored order');

  const firstRow=['before-after-criterion-1','before-after-cell-r2-c2','before-after-cell-r2-c3'];
  const secondRow=['before-after-criterion-2','before-after-cell-r3-c2','before-after-cell-r3-c3'];
  const swappedRows=swapTranslation(native.svg,firstRow,secondRow,'y');
  const rowOrder=await verifyPresentationQuality(page,{svg:swappedRows,document,plan,nativeAst:native.nativeAst});
  expect(named(rowOrder,'lini-native-carriers')?.result).toBe('fail');
  expect(named(rowOrder,'lini-native-carriers')?.details).toContain('criterion heading rows are not top-to-bottom in authored order');

  const authored=JSON.parse(await Bun.file('fixtures/visual/forms/visuals-before-after.json').text());
  authored.extensions['umf.visual'].comparison.values[0].text='A deliberately long primary text value demonstrates that comparison data stays complete when it needs more than one line. The second sentence remains attached to this exact item and criterion.\nThe explicit second paragraph is preserved as authored content.';
  authored.extensions['umf.visual'].comparison.values[0].note='An intentionally multiline native note that tests whether authored detail text expands its table row without clipping.\nThe second line remains part of the same authored value.';
  authored.extensions['umf.visual'].comparison.items[0].detail='This item detail is deliberately long enough to require native text wrapping while remaining visibly attached to its item heading.\nIts second line is preserved.';
  authored.extensions['umf.visual'].comparison.criteria[0].detail='This criterion detail is deliberately long enough to use wrapped native text without losing its row association.\nIts second line remains visible.';
  const notedDocument=readVisualDocument(JSON.stringify(authored),'json'),notedPlan=compilePresentation(notedDocument,{backend:'lini'});
  expect(notedPlan.ok).toBe(true);if(notedPlan.ok){const notedNative=await renderPresentationLini(notedPlan.source);await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},notedNative.svg);const notedChecks=await verifyPresentationQuality(page,{svg:notedNative.svg,document:notedDocument,plan:notedPlan,nativeAst:notedNative.nativeAst});expect(notedChecks.filter(row=>row.result==='fail')).toEqual([]);if(typeof notedNative.nativeAst==='string'){const shortenedAst=notedNative.nativeAst.replace('Its second line is preserved.','Its second line.');expect(shortenedAst).not.toBe(notedNative.nativeAst);const shortenedAstChecks=await verifyPresentationQuality(page,{svg:notedNative.svg,document:notedDocument,plan:notedPlan,nativeAst:shortenedAst});expect(named(shortenedAstChecks,'lini-native-ast')?.result).toBe('fail');}const shortenedSvg=notedNative.svg.replace('Its second line is preserved.','Its second line.');expect(shortenedSvg).not.toBe(notedNative.svg);const shortenedSvgChecks=await verifyPresentationQuality(page,{svg:shortenedSvg,document:notedDocument,plan:notedPlan,nativeAst:notedNative.nativeAst});expect(named(shortenedSvgChecks,'lini-native-carriers')?.result).toBe('fail');}
 }finally{await page.close();}
},{timeout:90_000});
