// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,describe,expect,it} from 'bun:test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,type Browser,type Page} from 'playwright';
import {createVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyPresentationQuality,type PresentationQualityCheck} from '../../scripts/presentation/quality';

let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});

const visual:Visual={
 id:'cycle-33-readable-sequence',kind:'sequence',form:'lifelines',question:'How does the reply draft move through review?',title:'Reply draft review, from first pass to release; literal |box#ghost|, .m77, .lini-group and .lini-rect stay text',
 steps:Array.from({length:8},(_,index)=>({id:`step-${index+1}`,title:`Review step ${index+1}`,focus:[`participant-${index+1}`],when:'scheduled' as const})),
 sequence:{participants:Array.from({length:8},(_,index)=>({
  id:`participant-${index+1}`,label:['Draft owner','Copy editor','Subject reviewer','Accessibility reviewer','Legal reviewer','Release manager','Mail platform','Recipient'][index]!,
  ...(index===0?{detail:'Preserve the authored meaning through every review\n\nwith final handoff recorded',role:'actor' as const,status:'built' as const}:{}),
 })),messages:[
  {id:'m1',from:'participant-1',to:'participant-2',label:'Share the complete reply draft\nwith the copy editor',kind:'call'},
  {id:'m2',from:'participant-2',to:'participant-3',label:'Request a careful review of the subject and opening',kind:'call'},
  {id:'m3',from:'participant-3',to:'participant-4',label:'Confirm the subject communicates the intended purpose',kind:'call'},
  {id:'m4',from:'participant-4',to:'participant-5',label:'Check accessibility wording and required legal language',kind:'call'},
  {id:'m5',from:'participant-5',to:'participant-6',label:'Record the approved language and release conditions',kind:'call'},
  {id:'m6',from:'participant-6',to:'participant-7',label:'Schedule the reviewed reply for the selected audience',kind:'call'},
  {id:'m7',from:'participant-7',to:'participant-8',label:'Deliver the final reply using the approved mail channel',kind:'call'},
  {id:'m8',from:'participant-8',to:'participant-1',label:'Confirm receipt of the released reply draft',kind:'return'},
 ]},
};
const captionVisual:Visual={id:'cycle-33-caption-clearance',kind:'sequence',form:'lifelines',question:'Which message reaches every review participant?',sequence:{
 participants:[{id:'author',label:'Author'},{id:'editor',label:'Editor'},{id:'legal',label:'Legal reviewer'},{id:'release',label:'Release coordinator'}],
 messages:[
  {id:'handoff',from:'author',to:'release',label:'Send the reviewed reply draft with complete author context and the approved release instructions',kind:'call'},
  {id:'legal-check',from:'editor',to:'legal',label:'Confirm the approved language',kind:'call'},
  {id:'publish',from:'legal',to:'release',label:'Approve the final release',kind:'call'},
  {id:'receipt',from:'release',to:'author',label:'Return the release confirmation',kind:'return'},
 ],
},steps:[{id:'prepare',title:'Prepare',focus:['author']},{id:'edit',title:'Edit',focus:['editor']},{id:'approve',title:'Approve',focus:['legal']},{id:'release-step',title:'Release',focus:['release']}]};
const document=createVisualDocument(visual,'test:cycle-33-readable-sequence','1.4.0');
const status=(checks:PresentationQualityCheck[],name:string)=>checks.find(check=>check.check===name)?.result;
const proof=(checks:PresentationQualityCheck[],name:string)=>checks.find(check=>check.check===name);
const pageMarkup='<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:#fff}#frame{width:1600px;height:900px}#frame svg{width:100%;height:100%}</style><div id="frame"></div>';
type Rendered={document:ReturnType<typeof createVisualDocument>;plan:PresentationPlan;svg:string;nativeAst:string;page:Page;checks:PresentationQualityCheck[]};
async function render(sourceDocument=document):Promise<Rendered>{
 const plan=compilePresentation(sourceDocument,{backend:'lini',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan));
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900}});
 mkdirSync(`${import.meta.dir}/../../.cache/cycle33`,{recursive:true});
 writeFileSync(`${import.meta.dir}/../../.cache/cycle33/generic-source.lini`,plan.source);writeFileSync(`${import.meta.dir}/../../.cache/cycle33/generic-ast.lini`,typeof native.nativeAst==='string'?native.nativeAst:JSON.stringify(native.nativeAst,null,2));writeFileSync(`${import.meta.dir}/../../.cache/cycle33/generic.svg`,native.svg);writeFileSync(`${import.meta.dir}/../../.cache/cycle33/generic-map.json`,JSON.stringify(plan.elementMap,null,2));
 if(sourceDocument===document)writeFileSync(`${import.meta.dir}/../../.cache/cycle33/sequence-readable.lini`,typeof native.nativeAst==='string'?native.nativeAst:JSON.stringify(native.nativeAst,null,2));
 await page.setContent(pageMarkup,{waitUntil:'domcontentloaded'});await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},native.svg);
 const checks=await verifyPresentationQuality(page,{svg:native.svg,document:sourceDocument,plan,nativeAst:native.nativeAst});
 return{document:sourceDocument,plan,svg:native.svg,nativeAst:native.nativeAst,page,checks};
}
async function checkSvg(good:Rendered,mutate:(page:Page)=>Promise<void>){
 await good.page.setContent(pageMarkup,{waitUntil:'domcontentloaded'});await good.page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},good.svg);
 await mutate(good.page);const changedSvg=await good.page.locator('#frame svg').evaluate(element=>element.outerHTML);
 return verifyPresentationQuality(good.page,{svg:changedSvg,document:good.document,plan:good.plan,nativeAst:good.nativeAst});
}
function mappedNativeId(plan:PresentationPlan,kind:string,sourcePath:string){const mapped=plan.elementMap.find(item=>item.kind===kind&&item.sourcePath===sourcePath);expect(mapped,`${sourcePath} must have a native source map`).toBeDefined();return mapped!.nativeId;}
function locatorFor(_kind:'field'|'message-caption',nativeId:string){return `g.lini-node[data-id="${nativeId}"] > text.lini-text`;}
async function reverseWordsAcrossExistingLines(label:import('playwright').Locator){
 await label.evaluate(element=>{
  const spans=[...element.querySelectorAll('tspan')],lines=spans.map(span=>(span.textContent??'').trim().split(/\s+/u).filter(Boolean)),nonempty=lines.map((line,index)=>({line,index})).filter(row=>row.line.length>0);
  if(nonempty.length<2)throw Error('Expected a wrapped native label with at least two nonempty lines.');
  const words=nonempty.flatMap(row=>row.line).reverse();let offset=0;
  for(const {line,index} of nonempty){spans[index]!.textContent=words.slice(offset,offset+line.length).join(' ');offset+=line.length;}
 });
}
async function flattenAuthoredBoundary(label:import('playwright').Locator,leftEnds:string,rightStarts:string){
 await label.evaluate((element,{left,right})=>{
  const spans=[...element.querySelectorAll('tspan')],index=spans.findIndex((span,i)=>i+1<spans.length&&(span.textContent??'').trim().endsWith(left)&&(spans[i+1]!.textContent??'').trim().startsWith(right));
  if(index<0)throw Error(`Expected visible line boundary between “${left}” and “${right}”.`);
  spans[index]!.textContent=(spans[index]!.textContent??'').trim()+' '+(spans[index+1]!.textContent??'').trim();spans[index+1]!.remove();
 },{left:leftEnds,right:rightStarts});
}
async function removeAuthoredBlankLine(label:import('playwright').Locator,leftEnds:string,rightStarts:string){
 await label.evaluate((element,{left,right})=>{
  const spans=[...element.querySelectorAll('tspan')],index=spans.findIndex((span,i)=>i+2<spans.length&&(span.textContent??'').trim().endsWith(left)&&!(spans[i+1]!.textContent??'').trim()&&(spans[i+2]!.textContent??'').trim().startsWith(right));
  if(index<0)throw Error(`Expected a preserved blank line between “${left}” and “${right}”.`);spans[index+1]!.remove();
 },{left:leftEnds,right:rightStarts});
}
async function setTransparentPaint(page:Page,selector:string){
 await page.locator(selector).locator('tspan').first().evaluate(element=>{
  const glyph=element as SVGElement;glyph.setAttribute('fill','transparent');glyph.setAttribute('stroke','none');
  const style=getComputedStyle(glyph);if(style.fill!=='rgba(0, 0, 0, 0)'||style.stroke!=='none')throw Error(`Transparent glyph paint did not take effect: ${style.fill} / ${style.stroke}`);
 });
}
function mappedElement(plan:PresentationPlan,kind:string,logicalId:string,sourcePath:string){
 const mapped=plan.elementMap.find(item=>item.kind===kind&&item.logicalId===logicalId&&item.sourcePath===sourcePath);expect(mapped,`${kind} ${logicalId} at ${sourcePath} must have a native map`).toBeDefined();return mapped!;
}
function replaceMappedNativeLabel(nativeAst:string,nativeId:string,replacement:string){
 const declaration=nativeAst.indexOf(`#${nativeId}|`);expect(declaration,`AST must contain mapped carrier ${nativeId}`).toBeGreaterThanOrEqual(0);
 const labelOpen=nativeAst.indexOf('[',declaration);expect(labelOpen,`AST carrier ${nativeId} must own a quoted label`).toBeGreaterThan(declaration);let start=labelOpen+1;while(/\s/u.test(nativeAst[start]??''))start++;expect(nativeAst[start],`AST carrier ${nativeId} must place its own quoted label after its bracket`).toBe('"');start++;let end=start;
 while(end<nativeAst.length){if(nativeAst[end]==='"'&&nativeAst[end-1]!=='\\')break;end++;}
 expect(end).toBeLessThan(nativeAst.length);return nativeAst.slice(0,start)+replacement+nativeAst.slice(end);
}
async function moveNativeCaptionIntoCollision(page:Page,captionId:string,targetId:string,target:'path'|'lifeline'|'caption'){
 await page.locator(`[data-id="${captionId}"]`).evaluate((caption,{captionId,targetId,kind})=>{
  const svg=(caption as SVGElement).ownerSVGElement;if(!svg)throw Error('Mapped native caption is outside the SVG.');
  const findCarrier=(id:string)=>[...svg.querySelectorAll('[data-id]')].find(item=>item.getAttribute('data-id')===id);
  const recipient=findCarrier(targetId);if(!recipient)throw Error(`Mapped native collision target ${targetId} is missing.`);
  const text=caption.querySelector('text');if(!text)throw Error(`Mapped caption ${captionId} has no native text glyphs.`);
  const glyphBoxes=()=>[...text.querySelectorAll('tspan')].map(span=>span.getBoundingClientRect()).filter(box=>box.width>0&&box.height>0);
  const union=(boxes:DOMRect[])=>({left:Math.min(...boxes.map(box=>box.left)),right:Math.max(...boxes.map(box=>box.right)),top:Math.min(...boxes.map(box=>box.top)),bottom:Math.max(...boxes.map(box=>box.bottom))});
  const initial=glyphBoxes();if(!initial.length)throw Error(`Mapped caption ${captionId} has no visible glyph bounds.`);
  let point:{x:number;y:number};
  if(kind==='caption'){
   const targetText=recipient.querySelector('text'),targetSpans=targetText?[...targetText.querySelectorAll('tspan')]:[],targetBoxes=targetSpans.map(span=>span.getBoundingClientRect()).filter(box=>box.width>0&&box.height>0);
   if(!targetBoxes.length)throw Error(`Neighboring caption ${targetId} has no visible glyph bounds.`);const bounds=union(targetBoxes);point={x:(bounds.left+bounds.right)/2,y:(bounds.top+bounds.bottom)/2};
  }else{
   const shape=recipient.matches('path,line')?recipient:recipient.querySelector('path:not(.lini-marker),line');if(!shape)throw Error(`Mapped ${kind} target ${targetId} has no native path geometry.`);
   if(shape instanceof SVGPathElement){const length=shape.getTotalLength(),matrix=shape.getScreenCTM();if(!length||!matrix)throw Error('Native target path has no measurable midpoint.');const local=shape.getPointAtLength(length/2),screen=new DOMPoint(local.x,local.y).matrixTransform(matrix);point={x:screen.x,y:screen.y};}
   else {const line=shape as SVGLineElement,matrix=line.getScreenCTM();if(!matrix)throw Error('Native target lifeline has no screen transform.');const start=new DOMPoint(Number(line.getAttribute('x1')),Number(line.getAttribute('y1'))).matrixTransform(matrix),end=new DOMPoint(Number(line.getAttribute('x2')),Number(line.getAttribute('y2'))).matrixTransform(matrix);point={x:(start.x+end.x)/2,y:(start.y+end.y)/2};}
  }
  const bounds=union(initial),closestLine=initial.reduce((best,box)=>Math.abs((box.top+box.bottom)/2-(point.y))<Math.abs((best.top+best.bottom)/2-point.y)?box:best,initial[0]!),targetY=kind==='caption'?point.y:point.y+(bounds.top+bounds.bottom)/2-(closestLine.top+closestLine.bottom)/2,dx=point.x-(bounds.left+bounds.right)/2,dy=targetY-(bounds.top+bounds.bottom)/2,parent=caption.parentElement as SVGGraphicsElement|null,parentMatrix=parent?.getScreenCTM();if(!parentMatrix)throw Error('Mapped native caption has no parent screen transform.');const inverse=parentMatrix.inverse(),delta=new DOMPoint(dx,dy).matrixTransform(inverse),origin=new DOMPoint(0,0).matrixTransform(inverse),localX=delta.x-origin.x,localY=delta.y-origin.y,existing=caption.getAttribute('transform')??'';caption.setAttribute('transform',`translate(${localX} ${localY}) ${existing}`.trim());
  const moved=glyphBoxes();if(!moved.length)throw Error('The moved native caption lost its glyph geometry.');
  if(kind==='caption'){
   const targetText=recipient.querySelector('text'),targetBoxes=targetText?[...targetText.querySelectorAll('tspan')].map(span=>span.getBoundingClientRect()).filter(box=>box.width>0&&box.height>0):[];
   if(!moved.some(a=>targetBoxes.some(b=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom)))throw Error('Native caption mutation did not create actual caption-to-caption glyph overlap.');
  }else if(!moved.some(box=>point.x>=box.left&&point.x<=box.right&&point.y>=box.top&&point.y<=box.bottom))throw Error(`Native caption mutation did not move actual glyphs onto the mapped ${kind}: target ${point.x},${point.y}; glyphs ${JSON.stringify(moved.map(box=>({left:box.left,right:box.right,top:box.top,bottom:box.bottom})))}`);
 },{captionId,targetId,kind:target});
}

describe('readable Lini sequence fidelity',()=>{
 it('fits an all-call/return flat sequence and rejects independently hidden, truncated, or reordered wrapped field and message glyphs',async()=>{
  const good=await render();
  try{
   const participantMaps=good.plan.elementMap.filter(item=>item.kind==='participant'),messageMaps=good.plan.elementMap.filter(item=>item.kind==='message'),fieldMaps=good.plan.elementMap.filter(item=>item.kind==='participant-field');
   expect(participantMaps).toHaveLength(8);expect(messageMaps).toHaveLength(8);expect(visual.steps).toHaveLength(8);
   expect(fieldMaps.map(item=>item.sourcePath)).toEqual(['detail','role','status'].map(field=>`/extensions/umf.visual/sequence/participants/0/${field}`));
   expect(mappedNativeId(good.plan,'participant-field','/extensions/umf.visual/sequence/participants/0/detail')).toBeTruthy();
   expect(mappedNativeId(good.plan,'message','/extensions/umf.visual/sequence/messages/0/id')).toBeTruthy();
   const allRequired=['native-source-hash','document-visual-present','lini-rich-native-semantics','lini-rich-svg-ownership-geometry','lini-rich-caption-clearance','lini-rich-typography','presentation-clipping','presentation-font-legibility'];
   for(const required of allRequired)expect(status(good.checks,required),`${required}: ${proof(good.checks,required)?.details??'missing check'}`).toBe('pass');
   expect(good.checks.filter(check=>check.result==='fail')).toEqual([]);
   expect(good.nativeAst).toContain('|box#ghost|');expect(good.nativeAst).toContain('.m77');
   expect(mappedNativeId(good.plan,'message-caption','/extensions/umf.visual/sequence/messages/0/label')).toBeTruthy();
   const fieldId=mappedNativeId(good.plan,'participant-field','/extensions/umf.visual/sequence/participants/0/detail'),messageId=mappedNativeId(good.plan,'message-caption','/extensions/umf.visual/sequence/messages/0/label'),messageOwner=visual.sequence!.messages[0]!.id;
   const fieldGlyph=good.page.locator(locatorFor('field',fieldId)),messageGlyph=good.page.locator(locatorFor('message-caption',messageId));
   expect(await fieldGlyph.locator('tspan').count()).toBeGreaterThan(1);expect(await messageGlyph.locator('tspan').count()).toBeGreaterThan(1);
   const fieldBaseline=await fieldGlyph.locator('tspan').allTextContents(),messageBaseline=await messageGlyph.locator('tspan').allTextContents();
   const authoredDetail=visual.sequence!.participants[0]!.detail!,authoredMessage=visual.sequence!.messages[0]!.label,normalize=(value:string)=>value.replace(/\s+/gu,' ').trim();
   expect(authoredDetail.includes('\n')).toBe(true);expect(authoredMessage.includes('\n')).toBe(true);
   expect(normalize(fieldBaseline.join(' '))).toBe(normalize(authoredDetail));expect(normalize(messageBaseline.join(' '))).toBe(normalize(authoredMessage));
   expect(authoredDetail.includes('\n\n')).toBe(true);
   const explicitBlankLine=fieldBaseline.findIndex((line,index)=>line.trim()==='review'&&fieldBaseline[index+1]?.trim()===''&&fieldBaseline[index+2]?.trim().startsWith('with '));expect(explicitBlankLine).toBeGreaterThanOrEqual(0);
   const messageBreak=messageBaseline.findIndex(line=>line.trim().endsWith('draft'));expect(messageBreak).toBeGreaterThanOrEqual(0);expect(messageBaseline[messageBreak+1]?.trim().startsWith('with ')).toBe(true);

   const hiddenField=await checkSvg(good,async page=>{const glyph=page.locator(locatorFor('field',fieldId)).locator('tspan').first();await glyph.evaluate(element=>(element as SVGElement).setAttribute('visibility','hidden'));});
   expect(status(hiddenField,'lini-rich-svg-ownership-geometry')).toBe('fail');
   expect(proof(hiddenField,'lini-rich-svg-ownership-geometry')?.details).toContain('detail glyphs');

   const fieldOpacity=await checkSvg(good,async page=>{const glyph=page.locator(locatorFor('field',fieldId)).locator('tspan').first();await glyph.evaluate(element=>{const text=element as SVGElement;text.setAttribute('opacity','0');if(getComputedStyle(text).opacity!=='0')throw Error('Field glyph opacity remained visible.');});});
   expect(status(fieldOpacity,'lini-rich-svg-ownership-geometry')).toBe('fail');expect(proof(fieldOpacity,'lini-rich-svg-ownership-geometry')?.details).toContain('detail glyphs');
   const transparentField=await checkSvg(good,async page=>setTransparentPaint(page,locatorFor('field',fieldId)));
   expect(status(transparentField,'lini-rich-svg-ownership-geometry')).toBe('fail');expect(proof(transparentField,'lini-rich-svg-ownership-geometry')?.details).toContain('detail glyphs');

   const truncatedField=await checkSvg(good,async page=>{const glyph=page.locator(locatorFor('field',fieldId));await glyph.locator('tspan').last().evaluate(element=>element.remove());});
   expect(status(truncatedField,'lini-rich-svg-ownership-geometry')).toBe('fail');
   expect(proof(truncatedField,'lini-rich-svg-ownership-geometry')?.details).toContain('detail glyphs');

   const reorderedField=await checkSvg(good,async page=>reverseWordsAcrossExistingLines(page.locator(locatorFor('field',fieldId))));
   expect(status(reorderedField,'lini-rich-svg-ownership-geometry')).toBe('fail');
   expect(proof(reorderedField,'lini-rich-svg-ownership-geometry')?.details).toContain('detail glyphs');

   const collapsedBlankLine=await checkSvg(good,async page=>removeAuthoredBlankLine(page.locator(locatorFor('field',fieldId)),'review','with'));
   expect(status(collapsedBlankLine,'lini-rich-svg-ownership-geometry')).toBe('fail');
   expect(proof(collapsedBlankLine,'lini-rich-svg-ownership-geometry')?.details).toContain('detail glyphs');

   const hiddenMessage=await checkSvg(good,async page=>{const glyph=page.locator(locatorFor('message-caption',messageId)).locator('tspan').first();await glyph.evaluate(element=>(element as SVGElement).setAttribute('visibility','hidden'));});
   expect(status(hiddenMessage,'lini-rich-svg-ownership-geometry')).toBe('fail');
   expect(proof(hiddenMessage,'lini-rich-svg-ownership-geometry')?.details).toContain(messageOwner);

   const messageOpacity=await checkSvg(good,async page=>{const glyph=page.locator(locatorFor('message-caption',messageId)).locator('tspan').first();await glyph.evaluate(element=>{const text=element as SVGElement;text.setAttribute('opacity','0');if(getComputedStyle(text).opacity!=='0')throw Error('Message glyph opacity remained visible.');});});
   expect(status(messageOpacity,'lini-rich-svg-ownership-geometry')).toBe('fail');expect(proof(messageOpacity,'lini-rich-svg-ownership-geometry')?.details).toContain(messageOwner);
   const transparentMessage=await checkSvg(good,async page=>setTransparentPaint(page,locatorFor('message-caption',messageId)));
   expect(status(transparentMessage,'lini-rich-svg-ownership-geometry')).toBe('fail');expect(proof(transparentMessage,'lini-rich-svg-ownership-geometry')?.details).toContain(messageOwner);

   const truncatedMessage=await checkSvg(good,async page=>{const glyph=page.locator(locatorFor('message-caption',messageId));await glyph.locator('tspan').last().evaluate(element=>element.remove());});
   expect(status(truncatedMessage,'lini-rich-svg-ownership-geometry')).toBe('fail');
   expect(proof(truncatedMessage,'lini-rich-svg-ownership-geometry')?.details).toContain(messageOwner);

   const reorderedMessage=await checkSvg(good,async page=>reverseWordsAcrossExistingLines(page.locator(locatorFor('message-caption',messageId))));
   expect(status(reorderedMessage,'lini-rich-svg-ownership-geometry')).toBe('fail');
   expect(proof(reorderedMessage,'lini-rich-svg-ownership-geometry')?.details).toContain(messageOwner);

   const flattenedMessage=await checkSvg(good,async page=>flattenAuthoredBoundary(page.locator(locatorFor('message-caption',messageId)),'draft','with'));
   expect(status(flattenedMessage,'lini-rich-svg-ownership-geometry')).toBe('fail');
   expect(proof(flattenedMessage,'lini-rich-svg-ownership-geometry')?.details).toContain(messageOwner);

   const flattenAstBoundary=(left:string,right:string)=>{
    const search=`${left}\\n${right}`,replacement=`${left} ${right}`,mutated=good.nativeAst.replace(search,replacement);
    expect(mutated,`Native AST must retain the explicit ${left}/${right} paragraph boundary`).not.toBe(good.nativeAst);return mutated;
   };
   const flatFieldAst=good.nativeAst.replace('review\\n\\nwith final handoff','review\\nwith final handoff');expect(flatFieldAst).not.toBe(good.nativeAst);
   const flatFieldAstChecks=await verifyPresentationQuality(good.page,{svg:good.svg,document,plan:good.plan,nativeAst:flatFieldAst});
   expect(status(flatFieldAstChecks,'lini-rich-native-semantics')).toBe('fail');
   const flatMessageAst=flattenAstBoundary('draft','with the copy editor'),flatMessageAstChecks=await verifyPresentationQuality(good.page,{svg:good.svg,document,plan:good.plan,nativeAst:flatMessageAst});
   expect(status(flatMessageAstChecks,'lini-rich-native-semantics')).toBe('fail');

   const missingFieldAst=replaceMappedNativeLabel(good.nativeAst,fieldId,'');expect(missingFieldAst).not.toBe(good.nativeAst);
   const missingFieldChecks=await verifyPresentationQuality(good.page,{svg:good.svg,document,plan:good.plan,nativeAst:missingFieldAst});
   expect(status(missingFieldChecks,'lini-rich-native-semantics')).toBe('fail');expect(proof(missingFieldChecks,'lini-rich-native-semantics')?.details).toContain('participant-1');
   const quotedPayloadAst=replaceMappedNativeLabel(good.nativeAst,messageId,'Literal |block#ghost| { .lini-line .m77 } remains caption text');
   expect(quotedPayloadAst).not.toBe(good.nativeAst);
   const quotedPayloadChecks=await verifyPresentationQuality(good.page,{svg:good.svg,document,plan:good.plan,nativeAst:quotedPayloadAst});
   expect(status(quotedPayloadChecks,'lini-rich-native-semantics')).toBe('fail');
  }finally{await good.page.close();}
 },{timeout:90_000});

 it('fully verifies a different four-participant message and step count',async()=>{
  const compact:Visual={id:'cycle-33-four-participant-control',kind:'sequence',form:'lifelines',question:'Which compact reply route is shown?',sequence:{
   participants:[{id:'writer',label:'Writer'},{id:'reviewer',label:'Reviewer'},{id:'approver',label:'Approver'},{id:'reader',label:'Reader'}],
   messages:[{id:'draft',from:'writer',to:'reviewer',label:'Send draft'},{id:'revise',from:'reviewer',to:'writer',label:'Return edits',kind:'return'},{id:'approve',from:'writer',to:'approver',label:'Request approval'},{id:'release',from:'approver',to:'reader',label:'Release reply',kind:'call'}],
  },steps:[{id:'draft-step',title:'Draft',focus:['writer']},{id:'review-step',title:'Review',focus:['reviewer']},{id:'approval-step',title:'Approve',focus:['approver']},{id:'release-step',title:'Release',focus:['reader']}]};
  const compactDocument=createVisualDocument(compact,'test:cycle-33-four-participant-control','1.4.0'),good=await render(compactDocument);
  try{
   expect(good.plan.elementMap.filter(item=>item.kind==='participant')).toHaveLength(4);expect(good.plan.elementMap.filter(item=>item.kind==='message')).toHaveLength(4);expect(compact.steps).toHaveLength(4);
   for(const required of ['native-source-hash','document-visual-present','lini-rich-native-semantics','lini-rich-svg-ownership-geometry','lini-rich-caption-clearance','lini-rich-typography','presentation-clipping','presentation-font-legibility'])expect(status(good.checks,required),`${required}: ${proof(good.checks,required)?.details??'missing check'}`).toBe('pass');
   expect(good.checks.filter(check=>check.result==='fail')).toEqual([]);
   const explicitCall:Visual={...compact,sequence:{...compact.sequence!,messages:compact.sequence!.messages.map(message=>message.id==='draft'?{...message,kind:'call' as const}:message)}};
   const explicitDocument=createVisualDocument(explicitCall,'test:cycle-33-explicit-call-control','1.4.0'),explicit=await render(explicitDocument);
   try{
    const sourceMessage=compact.sequence!.messages[0]!,mapPath='/extensions/umf.visual/sequence/messages/0/id',implicitArrow=mappedElement(good.plan,'message',sourceMessage.id,mapPath),explicitArrow=mappedElement(explicit.plan,'message',sourceMessage.id,mapPath);
    expect(implicitArrow.nativeId).toBe(explicitArrow.nativeId);
    const carrier=(svg:string,nativeId:string)=>{const escaped=nativeId.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&'),match=svg.match(new RegExp(`<g[^>]*data-id="${escaped}"[^>]*>[\\s\\S]*?<\\/g>`,'u'));expect(match,`Rendered arrow ${nativeId} must have an SVG carrier`).toBeTruthy();return match![0].replace(/\s+/gu,' ').trim();};
    expect(carrier(good.svg,implicitArrow.nativeId)).toBe(carrier(explicit.svg,explicitArrow.nativeId));
    expect(good.document.sourceJson).toBe(compactDocument.sourceJson);expect(explicit.document.sourceJson).toBe(explicitDocument.sourceJson);
   }finally{await explicit.page.close();}
  }finally{await good.page.close();}
 },{timeout:60_000});

 it('proves a long mapped caption clears its path, every lifeline, neighboring labels and paths',async()=>{
  const captionDocument=createVisualDocument(captionVisual,'test:cycle-33-caption-clearance','1.4.0'),good=await render(captionDocument);
  try{
   const participants=captionVisual.sequence!.participants,messages=captionVisual.sequence!.messages,focus=messages[0]!,other=messages[1]!,focusIndex=messages.indexOf(focus),otherIndex=messages.indexOf(other);
   expect(good.plan.elementMap.filter(item=>item.kind==='participant')).toHaveLength(participants.length);expect(good.plan.elementMap.filter(item=>item.kind==='message')).toHaveLength(messages.length);expect(good.plan.elementMap.filter(item=>item.kind==='message-caption')).toHaveLength(messages.length);
   expect(focus.from).toBe(participants[0]!.id);expect(focus.to).toBe(participants.at(-1)!.id);expect(focus.label.length).toBeGreaterThan(60);
   const captionMap=mappedElement(good.plan,'message-caption',focus.id,`/extensions/umf.visual/sequence/messages/${focusIndex}/label`),arrowMap=mappedElement(good.plan,'message',focus.id,`/extensions/umf.visual/sequence/messages/${focusIndex}/id`),otherCaption=mappedElement(good.plan,'message-caption',other.id,`/extensions/umf.visual/sequence/messages/${otherIndex}/label`),otherArrow=mappedElement(good.plan,'message',other.id,`/extensions/umf.visual/sequence/messages/${otherIndex}/id`),header=participants[0]!,headerMap=mappedElement(good.plan,'participant',header.id,`/extensions/umf.visual/sequence/participants/0/id`),intermediate=participants[1]!,participantIndex=participants.indexOf(intermediate),participantMap=mappedElement(good.plan,'participant',intermediate.id,`/extensions/umf.visual/sequence/participants/${participantIndex}/id`),lifelineMaps=participants.map((participant,index)=>mappedElement(good.plan,'participant-lifeline',participant.id,`/extensions/umf.visual/sequence/participants/${index}/id`)),lifelineMap=lifelineMaps[participantIndex]!;
   expect(lifelineMap.nativeId).toBe(`${participantMap.nativeId}-lifeline`);
   expect(new Set(lifelineMaps.map(item=>item.nativeId)).size).toBe(participants.length);
   for(const required of ['native-source-hash','document-visual-present','lini-rich-native-semantics','lini-rich-svg-ownership-geometry','lini-rich-caption-clearance','lini-rich-typography','presentation-clipping','presentation-font-legibility'])expect(status(good.checks,required),`${required}: ${proof(good.checks,required)?.details??'missing check'}`).toBe('pass');
   expect(good.checks.filter(check=>check.result==='fail')).toEqual([]);
   const missingMappedHeaderRect=await checkSvg(good,async page=>page.locator(`[data-id="${headerMap.nativeId}"]`).evaluate(element=>{const rect=element.querySelector('rect'),text=element.querySelector('text');if(!rect||!text)throw Error('Mapped participant header must initially have its rect and text.');rect.remove();if(element.querySelector('rect')||!element.querySelector('text'))throw Error('Participant header rect removal did not preserve the mapped text carrier.');}));
   expect(status(missingMappedHeaderRect,'lini-rich-svg-ownership-geometry')).toBe('fail');
   const ownerGroupId=`${headerMap.nativeId}-owner`,missingOwnerRect=await checkSvg(good,async page=>page.locator(`[data-id="${ownerGroupId}"]`).evaluate((owner,{headerId})=>{const direct=[...owner.children],rect=direct.find(child=>child.localName==='rect'),header=direct.find(child=>child.getAttribute('data-id')===headerId),headerText=header?.querySelector('text');if(!rect||!headerText)throw Error(`Mapped owner group must initially contain its transparent rect and mapped participant header text (${headerId}; children ${direct.map(child=>child.localName+':'+child.getAttribute('data-id')).join(',')}).`);rect.remove();if([...owner.children].some(child=>child.localName==='rect')||!direct.find(child=>child.getAttribute('data-id')===headerId)?.querySelector('text'))throw Error('Owner helper rect removal did not preserve participant header glyphs.');},{headerId:headerMap.nativeId}));
   expect(status(missingOwnerRect,'lini-rich-svg-ownership-geometry')).toBe('fail');expect(proof(missingOwnerRect,'lini-rich-svg-ownership-geometry')?.details).toContain(`carrier ${ownerGroupId}`);
   const captionCollisions:[string,string,'path'|'lifeline'|'caption'][]=[
    ['own path',arrowMap.nativeId,'path'],['intermediate lifeline',lifelineMap.nativeId,'lifeline'],['neighboring caption',otherCaption.nativeId,'caption'],['neighboring message path',otherArrow.nativeId,'path'],
   ];
   for(const [name,targetId,targetKind] of captionCollisions){
    const changed=await checkSvg(good,page=>moveNativeCaptionIntoCollision(page,captionMap.nativeId,targetId,targetKind));
    expect(status(changed,'lini-rich-svg-ownership-geometry'),`${name}: ${proof(changed,'lini-rich-svg-ownership-geometry')?.details??'missing geometry proof'}`).toBe('fail');
    expect(proof(changed,'lini-rich-svg-ownership-geometry')?.details).toContain(focus.id);
    expect(status(changed,'presentation-clipping'),`${name} mutation must remain within the viewport`).toBe('pass');
   }
   const messageNativeId=arrowMap.nativeId;
   const hiddenLine=await checkSvg(good,async page=>page.locator(`[data-id="${messageNativeId}"]`).evaluate(element=>(element as SVGElement).setAttribute('opacity','0')));
   expect(status(hiddenLine,'lini-rich-svg-ownership-geometry')).toBe('fail');expect(proof(hiddenLine,'lini-rich-svg-ownership-geometry')?.details).toContain(focus.id);
   const transparentLine=await checkSvg(good,async page=>page.locator(`[data-id="${messageNativeId}"]`).evaluate(element=>{const carrier=element as SVGElement;carrier.style.stroke='transparent';if(getComputedStyle(carrier).stroke!=='rgba(0, 0, 0, 0)')throw Error('Message line stroke remained visible.');}));
   expect(status(transparentLine,'lini-rich-svg-ownership-geometry')).toBe('fail');expect(proof(transparentLine,'lini-rich-svg-ownership-geometry')?.details).toContain(focus.id);
   const reversedArrow=await checkSvg(good,async page=>page.locator(`[data-id="${messageNativeId}"] polygon.lini-marker-arrow`).evaluate(element=>{const polygon=element as SVGPolygonElement,points=(polygon.getAttribute('points')??'').trim().split(/\s+/u).map(pair=>pair.split(',').map(Number));if(points.length<3)throw Error('Mapped arrow has no triangle points.');const xCenter=(Math.min(...points.map(point=>point[0]!))+Math.max(...points.map(point=>point[0]!)))/2,flipped=points.map(([x,y])=>`${2*xCenter-x},${y}`).join(' ');polygon.setAttribute('points',flipped);if(polygon.getAttribute('points')===(points.map(([x,y])=>`${x},${y}`).join(' ')))throw Error('Arrowhead direction did not change.');}));
   expect(status(reversedArrow,'lini-rich-svg-ownership-geometry')).toBe('fail');expect(proof(reversedArrow,'lini-rich-svg-ownership-geometry')?.details).toContain(focus.id);
   const lifelineId=lifelineMaps[0]!.nativeId;
   const hiddenLifeline=await checkSvg(good,async page=>page.locator(`[data-id="${lifelineId}"]`).evaluate(element=>(element as SVGElement).setAttribute('visibility','hidden')));
   expect(status(hiddenLifeline,'lini-rich-svg-ownership-geometry')).toBe('fail');expect(proof(hiddenLifeline,'lini-rich-svg-ownership-geometry')?.details).toContain(participants[0]!.id);
   const transparentLifeline=await checkSvg(good,async page=>page.locator(`[data-id="${lifelineId}"]`).evaluate(element=>{const carrier=element as SVGElement;carrier.style.stroke='transparent';if(getComputedStyle(carrier).stroke!=='rgba(0, 0, 0, 0)')throw Error('Lifeline stroke remained visible.');}));
   expect(status(transparentLifeline,'lini-rich-svg-ownership-geometry')).toBe('fail');expect(proof(transparentLifeline,'lini-rich-svg-ownership-geometry')?.details).toContain(participants[0]!.id);
   const fontOverride=await checkSvg(good,async page=>page.locator(`[data-id="${captionMap.nativeId}"] tspan`).first().evaluate(element=>{(element as SVGElement).style.fontFamily='Georgia';}));
   expect(status(fontOverride,'lini-rich-typography')).toBe('fail');
   const duplicatedCarrier=await checkSvg(good,async page=>page.locator(`[data-id="${messageNativeId}"]`).evaluate(element=>element.parentElement!.append(element.cloneNode(true))));
   expect(status(duplicatedCarrier,'lini-rich-svg-ownership-geometry')).toBe('fail');expect(proof(duplicatedCarrier,'lini-rich-svg-ownership-geometry')?.details).toContain(messageNativeId);
   const anonymousPhantom=await checkSvg(good,async page=>page.locator('#frame svg').evaluate(svg=>{const phantom=svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg','path');phantom.setAttribute('d','M 5 5 L 35 5');phantom.setAttribute('stroke','#000');phantom.setAttribute('stroke-width','3');svg.append(phantom);if(!phantom.isConnected)throw Error('Anonymous phantom path did not enter the SVG.');}));
   expect(status(anonymousPhantom,'lini-rich-svg-ownership-geometry')).toBe('fail');
   const anonymousLine=await checkSvg(good,async page=>page.locator('#frame svg').evaluate(svg=>{const phantom=svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg','line');phantom.setAttribute('x1','5');phantom.setAttribute('y1','5');phantom.setAttribute('x2','35');phantom.setAttribute('y2','5');phantom.setAttribute('stroke','#000');phantom.setAttribute('stroke-width','3');svg.append(phantom);if(!phantom.isConnected)throw Error('Anonymous phantom line did not enter the SVG.');}));
   expect(status(anonymousLine,'lini-rich-svg-ownership-geometry')).toBe('fail');
   const anonymousText=await checkSvg(good,async page=>page.locator('#frame svg').evaluate(svg=>{const phantom=svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg','text');phantom.setAttribute('x','5');phantom.setAttribute('y','20');phantom.textContent='unmapped text';svg.append(phantom);if(!phantom.isConnected)throw Error('Anonymous phantom text did not enter the SVG.');}));
   expect(status(anonymousText,'lini-rich-svg-ownership-geometry')).toBe('fail');
  }finally{await good.page.close();}
 },{timeout:90_000});
});
