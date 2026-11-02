// SPDX-License-Identifier: MIT OR Apache-2.0
/** Independent native-source and SVG checks for Lini's sequence and tree layouts. */
import {createHash} from 'node:crypto';
import type {Page} from 'playwright';
import type {Document} from '@umf/core';
import {getVisual,type Visual} from '../../src/extensions/visual';
import type {PresentationPlan,PresentationElement} from '../../src/presentation';
import type {PresentationQualityCheck} from './quality';

type Box={x:number;y:number;width:number;height:number};
type Point={x:number;y:number};
type NativeNode={nativeId:string;logicalId:string;kind:string;selector:string;parent:string|undefined;label:string;line:number;depth:number};
type NativeLink={from:string;to:string;operator:string;label:string;styleId:string|undefined;line:number;groups:string[]};
type NativeTreeEdge={from:string;to:string;line:number};
type NativeRead={nodes:NativeNode[];links:NativeLink[];treeEdges:NativeTreeEdge[];symbols:Map<string,string[]>;notes:Map<string,{participants:string[];line:number}>;frames:Map<string,Box>};
type DomNode={id:string;classes:string[];texts:string[];cells:Array<{id:string|null;text:string}>;bounds:Box;shape:Box;parentId:string|null;glyphs:number;icons:Array<{symbols:string[];glyphs:number}>};
type DomLink={from:string|null;to:string|null;classes:string[];labels:string[];bounds:Box;labelBounds:Box|null;paths:Array<{d:string;start:Point|null;end:Point|null;bounds:Box}>;arrowCount:number};
type DomLine={bounds:Box;start:Point;end:Point};
type DomFrame={classes:string[];guards:string[];bounds:Box};
type RichDom={svg:boolean;nodes:DomNode[];frames:DomFrame[];links:DomLink[];lines:DomLine[];fonts:Array<{text:string;family:string}>};
const sha=(value:string)=>createHash('sha256').update(Buffer.from(value,'utf8')).digest('hex');
const norm=(value:string)=>value.replace(/\s+/gu,' ').trim();
const pass=(check:string,sourceSha256:string,ok:boolean,details:string):PresentationQualityCheck=>({check,sourceSha256,result:ok?'pass':'fail',details});
const close=(a:number,b:number,tolerance:number)=>Math.abs(a-b)<=tolerance;
const dist=(point:Point,box:Box)=>Math.hypot(Math.max(box.x-point.x,0,point.x-box.x-box.width),Math.max(box.y-point.y,0,point.y-box.y-box.height));
const inside=(inner:Box,outer:Box,pad=2)=>inner.x>=outer.x-pad&&inner.y>=outer.y-pad&&inner.x+inner.width<=outer.x+outer.width+pad&&inner.y+inner.height<=outer.y+outer.height+pad;
const element=(plan:PresentationPlan,kind:PresentationElement['kind'],logicalId:string)=>plan.elementMap.find(item=>item.kind===kind&&item.logicalId===logicalId);
const quoted=(value:string):string[]=>[...value.matchAll(/"(?:\\.|[^"\\])*"/gu)].flatMap(match=>{try{return[JSON.parse(match[0]) as string];}catch{return[];}});
const countBrackets=(line:string)=>{let quote=false,escape=false,open=0,close=0;for(const char of line){if(escape){escape=false;continue;}if(char==='\\'&&quote){escape=true;continue;}if(char==='"'){quote=!quote;continue;}if(quote)continue;if(char==='[')open++;else if(char===']')close++;}return{open,close};};

/** Parse only the stable structural surface emitted by pinned `lini desugar`. */
function readNative(source:string,plan:PresentationPlan):NativeRead {
 const nodes:NativeNode[]=[],links:NativeLink[]=[],treeEdges:NativeTreeEdge[]=[],symbols=new Map<string,string[]>(),notes=new Map<string,{participants:string[];line:number}>();
 const byNative=new Map<string,PresentationPlan['elementMap'][number]>();for(const item of plan.elementMap){if(item.kind==='visual'&&byNative.has(item.nativeId))continue;byNative.set(item.nativeId,item);}
 const frames=new Map<string,Box>(),stack:Array<{id?:string;kind?:string;depth:number}>=[];
 const lines=source.split(/\r?\n/u);
 for(let lineIndex=0;lineIndex<lines.length;lineIndex++){
  const line=lines[lineIndex]!,indent=/^\s*/u.exec(line)![0].length,trim=line.trim();if(!trim)continue;
  // Close containers before reading a line that starts with its closing bracket.
  const leadingClose=line.trimStart().match(/^\]+/u)?.[0].length??0;for(let i=0;i<leadingClose;i++)stack.pop();
  const selector=/\|([a-z][a-z0-9-]*)(?:#([A-Za-z0-9_.-]+))?\|/u.exec(line);
  if(selector){
   const selectorKind=selector[1]!,nativeId=selector[2],mapped=nativeId?byNative.get(nativeId):undefined;
   const frameClass=/\.f(\d+)\b/u.exec(line)?.[1],frameNative=frameClass?'f'+frameClass:undefined,frameMap=frameNative?byNative.get(frameNative):undefined,semantic=mapped??(frameMap?.kind==='group'?frameMap:undefined),semanticId=mapped?.nativeId??(frameMap?.kind==='group'?frameNative:undefined);
   if(semantic?.kind==='node')while(stack.length&&stack[stack.length-1]!.kind==='node'&&stack[stack.length-1]!.depth>=indent)stack.pop();
   if(semantic&&semanticId&&['visual','node','participant','note','message','group'].includes(semantic.kind)){
    const parent=[...stack].reverse().find(entry=>entry.kind==='node')?.id;
    const labelPieces:string[]=[];
    for(let look=lineIndex;look<lines.length;look++){
     const candidate=lines[look]!;if(look>lineIndex&&(/^\s*\|[a-z][a-z0-9-]*(?:#[A-Za-z0-9_.-]+)?\|/u.test(candidate)||/^\s*\]/u.test(candidate)||/^\s*\S+\s+(?:-->|~>|->)\s+\S+/u.test(candidate)))break;
     labelPieces.push(...quoted(candidate));if(labelPieces.length)break;
    }
    nodes.push({nativeId:semanticId,logicalId:semantic.logicalId,kind:semantic.kind,selector:selectorKind,parent,label:labelPieces[0]??'',line:lineIndex,depth:stack.filter(entry=>entry.kind==='node').length});
    if(semantic.kind==='note'){
     const region=lines.slice(lineIndex,Math.min(lines.length,lineIndex+4)).join('\n'),place=/place:\s*over\s+([^;]+);/u.exec(region)?.[1]??'';
     notes.set(semanticId,{participants:place.trim().split(/\s+/u).filter(Boolean),line:lineIndex});
    }
   }
   if(selectorKind==='icon'){
    const owner=[...stack].reverse().find(entry=>entry.kind==='node'||entry.kind==='participant')?.id;
    const symbol=/symbol:\s*([a-z0-9-]+)\s*;/u.exec(lines.slice(lineIndex,Math.min(lines.length,lineIndex+4)).join('\n'))?.[1];
    if(owner&&symbol)symbols.set(owner,[...(symbols.get(owner)??[]),symbol]);
   }
   // Sequence loop blocks use a selector class (for example `.f1`) as their stable handle.
   const bracket=countBrackets(line),hasOpen=bracket.open>bracket.close;
   if((hasOpen||semantic?.kind==='node')&&(semantic?.kind==='node'||semantic?.kind==='participant'||semantic?.kind==='group'))stack.push({id:semanticId,kind:semantic.kind==='node'||semantic.kind==='participant'?semantic.kind:'group',depth:indent});
  }
  const connector=/^\s*([A-Za-z0-9_.-]+)(?::(?:left|right|top|bottom))?\s+(-->|~>|->)\s+([A-Za-z0-9_.-]+)(?::(?:left|right|top|bottom))?\b/u.exec(line);
  if(connector){
   const idMatch=/\.m(\d+)\b/u.exec(line),styleId=idMatch?'m'+idMatch[1]:undefined;
   const label=quoted(line)[0]??'',groups=stack.flatMap(entry=>entry.kind==='group'&&entry.id?[entry.id]:[]);
   links.push({from:connector[1]!,to:connector[3]!,operator:connector[2]!,label,styleId,line:lineIndex,groups});
  }
  const tree=/^\s*([A-Za-z0-9_.-]+)(?::(?:left|right|top|bottom))?\s+-\s+(.+)$/u.exec(line);
  if(tree){
   const from=tree[1]!,targets=tree[2]!.split('&').map(part=>part.trim().split(/\s+/u)[0]!).filter(Boolean);
   for(const target of targets){const clean=target.replace(/:(?:left|right|top|bottom)$/u,'');treeEdges.push({from,to:clean,line:lineIndex});}
  }
  {const bracket=countBrackets(line),closesAfter=Math.max(0,bracket.close-bracket.open-(leadingClose?1:0));for(let i=0;i<closesAfter;i++)stack.pop();}
 }
 return{nodes,links,treeEdges,symbols,notes,frames};
}

/** The caller inserts the pinned Lini SVG into #frame, then supplies the exact `desugar()` output. */
export async function verifyLiniRichPresentationQuality(page:Page,input:{document:Document;plan:PresentationPlan;nativeAst:unknown}):Promise<PresentationQualityCheck[]> {
 const {document,plan}=input,sourceSha256=sha(plan.source),checks:PresentationQualityCheck[]=[];let visual:Visual|undefined;
 try{visual=getVisual(document);}catch{/* checks below explain missing evidence */}
 const ast=typeof input.nativeAst==='string'?input.nativeAst:'',read=ast?readNative(ast,plan):undefined;
 const problems:string[]=[];let nativeOk=!!visual&&!!read&&read.nodes.length>0;
 if(!visual){nativeOk=false;problems.push('The UMF document has no readable visual payload.');}
 if(!read){nativeOk=false;problems.push('Pinned Lini desugared source is missing.');}
 if(visual&&read){
  if(visual.kind==='sequence'&&visual.sequence){
   const title=visual.title??visual.question,titleElement=element(plan,'visual',visual.id),nativeTitle=titleElement?read.nodes.find(item=>item.kind==='visual'&&item.nativeId===titleElement.nativeId):undefined;
   if(!titleElement||!nativeTitle||nativeTitle.label!==title){nativeOk=false;problems.push('Sequence title is missing from its mapped native title carrier.');}
   const expectedParticipants=visual.sequence.participants.map(participant=>({participant,native:element(plan,'participant',participant.id)}));
   const nativeNodes=read.nodes.filter(item=>item.kind==='participant');
   if(nativeNodes.length!==expectedParticipants.length)nativeOk=false,problems.push(`Native AST has ${nativeNodes.length} participants; expected ${expectedParticipants.length}.`);
   expectedParticipants.forEach(({participant,native},index)=>{const found=nativeNodes.find(item=>item.nativeId===native?.nativeId);if(!found||found.label!==participant.label||nativeNodes[index]?.nativeId!==native?.nativeId){nativeOk=false;problems.push(`Participant ${participant.id} native ID, label, or order differs.`);}});
   const expectedMessages=visual.sequence.messages;
   const links=read.links.filter(link=>link.styleId?.startsWith('m'));
   if(links.length!==expectedMessages.length)nativeOk=false,problems.push(`Native AST has ${links.length} identified message links; expected ${expectedMessages.length}.`);
   for(let index=0;index<expectedMessages.length;index++){
    const message=expectedMessages[index]!,mapped=element(plan,'message',message.id),found=links.find(link=>link.styleId===mapped?.nativeId),from=element(plan,'participant',message.from)?.nativeId,to=element(plan,'participant',message.to)?.nativeId;
    const operator=message.kind==='return'?'-->':message.kind==='async'?'~>':'->';
    if(message.kind==='note'){nativeOk=false;problems.push(`Message ${message.id} uses note kind; use sequence.notes so it cannot become a synthetic message edge.`);}
    if(!found||found.from!==from||found.to!==to||found.operator!==operator||found.label!==message.label||links[index]?.styleId!==mapped?.nativeId){nativeOk=false;problems.push(`Message ${message.id} has incorrect AST endpoint, operator, label, native identity, or source order.`);}
    if(found&&message.group){const group=element(plan,'group',message.group);if(!group||!found.groups.includes(group.nativeId)){nativeOk=false;problems.push(`Message ${message.id} is outside its declared AST group frame.`);}}
    if(found&&!message.group&&found.groups.some(id=>plan.elementMap.some(item=>item.kind==='group'&&item.nativeId===id))){nativeOk=false;problems.push(`Ungrouped message ${message.id} is inside a native group frame.`);}
   }
   for(const note of visual.sequence.notes??[]){
    const mapped=element(plan,'note',note.id),found=mapped?read.notes.get(mapped.nativeId):undefined,nativeNote=mapped?read.nodes.find(item=>item.kind==='note'&&item.nativeId===mapped.nativeId):undefined,expectedParticipants=note.participants.map(id=>element(plan,'participant',id)?.nativeId).filter((id):id is string=>!!id),anchor=element(plan,'message',note.before??note.after!)?.nativeId,anchorLink=read.links.find(link=>link.styleId===anchor);
    if(!found||!nativeNote||nativeNote.label!==note.text||JSON.stringify(found.participants)!==JSON.stringify(expectedParticipants)||!anchorLink||(note.before!==undefined?found.line>=anchorLink.line:found.line<=anchorLink.line)){nativeOk=false;problems.push(`Note ${note.id} has an incorrect AST text, participant attachment, or message position.`);}
   }
   for(const group of visual.groups??[]){
    const mapped=element(plan,'group',group.id);if(!mapped)continue;
    const nativeGroup=read.nodes.find(item=>item.kind==='group'&&item.nativeId===mapped.nativeId);if(!nativeGroup||nativeGroup.label!==group.label){nativeOk=false;problems.push(`Group ${group.id} native AST frame label is missing or differs.`);}
    const expected=visual.sequence.messages.filter(message=>{let current=message.group;while(current){if(current===group.id)return true;current=visual!.groups?.find(item=>item.id===current)?.parent;}return false;}).map(message=>element(plan,'message',message.id)?.nativeId).filter((id):id is string=>!!id);
    const actual=read.links.filter(link=>link.groups.includes(mapped.nativeId)).map(link=>link.styleId??'');
    if(JSON.stringify(actual)!==JSON.stringify(expected)){nativeOk=false;problems.push(`Group ${group.id} AST frame membership differs: ${actual.join(', ')} vs ${expected.join(', ')}.`);}
   }
   for(const participant of visual.sequence.participants){if(!participant.icon)continue;const mapped=element(plan,'participant',participant.id),symbol=mapped?read.symbols.get(mapped.nativeId):undefined;if(!symbol?.includes(participant.icon)){nativeOk=false;problems.push(`Participant ${participant.id} native AST icon symbol differs from ${participant.icon}.`);}}
  } else if(visual.kind==='structure'&&visual.form==='tree'){
   const nodes=visual.nodes??[],nativeNodes=read.nodes.filter(item=>item.kind==='node'),idToNative=new Map(nodes.map(node=>[node.id,element(plan,'node',node.id)?.nativeId??'']));
   const fullNative=(id:string):string=>{const node=nodes.find(item=>item.id===id),own=idToNative.get(id)??'';return node?.parent?fullNative(node.parent)+'.'+own:own;};
   if(nativeNodes.length!==nodes.length)nativeOk=false,problems.push(`Native AST has ${nativeNodes.length} topic nodes; expected ${nodes.length}.`);
   for(const [index,node] of nodes.entries()){
    const nativeId=idToNative.get(node.id)!,found=nativeNodes.find(item=>item.nativeId===nativeId),parentNative=node.parent?idToNative.get(node.parent):undefined;
    if(!found||found.label!==node.label||found.parent!==parentNative||nativeNodes[index]?.nativeId!==nativeId){nativeOk=false;problems.push(`Tree topic ${node.id} native mismatch ${JSON.stringify({found,expected:{nativeId,label:node.label,parent:parentNative},atIndex:nativeNodes[index]?.nativeId})}.`);}
    const symbols=read.symbols.get(nativeId)??[];if(node.icon&&(!symbols.includes(node.icon)||symbols.some(symbol=>symbol!==node.icon))){nativeOk=false;problems.push(`Topic ${node.id} native AST icon symbol does not equal ${node.icon}.`);}
   }
   const root=nodes.find(node=>node.parent===undefined),rootNative=root?idToNative.get(root.id):undefined;
   const expectedPairs=nodes.filter(node=>node.parent).map(node=>[idToNative.get(node.parent!)??'',`${idToNative.get(node.parent!)??''}.${idToNative.get(node.id)??''}`] as const);
   for(const[from,to]of expectedPairs)if(!read.treeEdges.some(edge=>edge.from===from&&edge.to===to)){nativeOk=false;problems.push(`Native AST has no exact tree edge ${from} → ${to}.`);}
   if(read.treeEdges.length!==expectedPairs.length)nativeOk=false,problems.push(`Native AST has ${read.treeEdges.length} tree edges; expected exactly ${expectedPairs.length}.`);
   const direction=visual.layout?.kind==='tree'?visual.layout.direction:undefined;if(direction&& !ast.includes(`direction: ${direction==='LR'?'row':direction==='TB'?'column':'bilateral'}`)){nativeOk=false;problems.push(`Native AST direction does not match ${direction}.`);}
  } else {nativeOk=false;problems.push('Rich Lini quality applies only to sequence and structure/tree visuals.');}
 }
 checks.push(pass('lini-rich-native-semantics',sourceSha256,nativeOk,nativeOk?'Pinned Lini desugared source preserves every mapped native identity, label, endpoint, operator, note anchor, group interval, and tree parent-child relationship.':problems.join('; ')||'Native semantic correspondence failed.'));

 let dom:RichDom|undefined;
 try{dom=await page.locator('#frame svg').first().evaluate(root=>{
  const svg=root as SVGSVGElement,origin=svg.getBoundingClientRect(),normalize=(value:string)=>value.replace(/\s+/gu,' ').trim();
  const box=(item:Element):Box=>{const rect=item.getBoundingClientRect();return{x:rect.x-origin.x,y:rect.y-origin.y,width:rect.width,height:rect.height};};
  const ownedText=(group:Element)=>[...group.querySelectorAll('text')].filter(item=>item.closest('g.lini-node[data-id]')===group).map(item=>normalize([...item.querySelectorAll('tspan')].map(span=>span.textContent??'').join(' ')||(item.textContent??''))).filter(Boolean);
  const nodes=[...svg.querySelectorAll('g.lini-node[data-id]')].map(item=>{const group=item as SVGGElement,shapeEls=[...group.querySelectorAll(':scope > rect,:scope > polygon,:scope > ellipse,:scope > path,:scope > circle')],shapeBoxes=shapeEls.map(box),shape=shapeBoxes.length?{x:Math.min(...shapeBoxes.map(value=>value.x)),y:Math.min(...shapeBoxes.map(value=>value.y)),width:Math.max(...shapeBoxes.map(value=>value.x+value.width))-Math.min(...shapeBoxes.map(value=>value.x)),height:Math.max(...shapeBoxes.map(value=>value.y+value.height))-Math.min(...shapeBoxes.map(value=>value.y))}:box(group),cells=[...group.querySelectorAll(':scope > g.lini-node.lini-cell')].map(cell=>({id:cell.getAttribute('data-id'),text:ownedText(cell).join(' ')})),icons=[...group.querySelectorAll('g.lini-node.lini-icon')].filter(icon=>icon.closest('g.lini-node[data-id]')===group).map(icon=>({symbols:[],glyphs:icon.querySelectorAll('path,line,rect,circle,ellipse,polygon').length}));return{id:group.dataset.id??'',classes:[...group.classList],texts:ownedText(group),cells,bounds:box(group),shape,parentId:group.parentElement?.closest('g.lini-node[data-id]')?.getAttribute('data-id')??null,glyphs:group.querySelectorAll('path,line,rect,circle,ellipse,polygon').length,icons};});
  const point=(path:SVGPathElement,at:number):Point|null=>{try{const local=path.getPointAtLength(at),matrix=path.getScreenCTM();if(!matrix)return null;const value=new DOMPoint(local.x,local.y).matrixTransform(matrix);return{x:value.x-origin.x,y:value.y-origin.y};}catch{return null;}};
  const guardTexts=[...svg.querySelectorAll('text.lini-sequence-guard')].map(text=>({text:normalize(text.textContent??''),bounds:box(text)}));
  const frames=[...svg.querySelectorAll('g.lini-node')].filter(item=>[...item.querySelectorAll(':scope > rect')].some(rect=>getComputedStyle(rect).strokeDasharray!=='none')).map(item=>{const group=item as SVGGElement,bounds=box(group),guards=guardTexts.filter(guard=>guard.bounds.x>=bounds.x-2&&guard.bounds.x+guard.bounds.width<=bounds.x+bounds.width+2&&guard.bounds.y>=bounds.y-3&&guard.bounds.y+guard.bounds.height<=bounds.y+28).map(guard=>guard.text);return{classes:[...group.classList],guards,bounds};});
  const links=[...svg.querySelectorAll('g.lini-link[data-from][data-to]')].map(item=>{const group=item as SVGGElement,label=group.querySelector(':scope > text'),paths=[...group.querySelectorAll(':scope > path:not(.lini-marker)')].map(path=>{const vector=path as SVGPathElement,length=vector.getTotalLength();return{d:vector.getAttribute('d')??'',start:length?point(vector,0):null,end:length?point(vector,length):null,bounds:box(path)};});return{from:group.dataset.from??null,to:group.dataset.to??null,classes:[...group.classList],labels:[...group.querySelectorAll(':scope > text')].map(text=>normalize(text.textContent??'')).filter(Boolean),bounds:box(group),labelBounds:label?box(label):null,paths,arrowCount:group.querySelectorAll('.lini-marker-arrow').length};});
  const lines=[...svg.querySelectorAll('g.lini-node.lini-line line')].map(item=>{const line=item as SVGLineElement,matrix=line.getScreenCTM()!,start=new DOMPoint(Number(line.getAttribute('x1')),Number(line.getAttribute('y1'))).matrixTransform(matrix),end=new DOMPoint(Number(line.getAttribute('x2')),Number(line.getAttribute('y2'))).matrixTransform(matrix);return{bounds:box(line),start:{x:start.x-origin.x,y:start.y-origin.y},end:{x:end.x-origin.x,y:end.y-origin.y}};});
  const fonts=[...svg.querySelectorAll('text')].map(item=>({text:normalize(item.textContent??''),family:getComputedStyle(item).fontFamily}));
  return{svg:svg.matches('svg.lini'),nodes,frames,links,lines,fonts};
 });}catch{/* missing SVG is reported below */}
 let geometryOk=!!visual&&!!dom?.svg;const geometryProblems:string[]=[];
 if(visual&&dom){
  const nodeCarrier=(id:string)=>{const found=dom!.nodes.filter(item=>item.id===id);if(found.length!==1){geometryOk=false;geometryProblems.push(`Native SVG has ${found.length} node carriers for ${id}.`);}return found[0];};
  if(visual.kind==='sequence'&&visual.sequence){
   const title=visual.title??visual.question,titleId=element(plan,'visual',visual.id)?.nativeId??'',titleCarrier=nodeCarrier(titleId);if(!titleCarrier||!titleCarrier.texts.some(text=>norm(text)===norm(title))){geometryOk=false;geometryProblems.push('Sequence title does not own its visible native SVG label.');}
   const participants=visual.sequence.participants.map(participant=>({participant,id:element(plan,'participant',participant.id)?.nativeId??''}));
   const boxes=participants.map(item=>({id:item.id,box:nodeCarrier(item.id)?.shape}));
   if(boxes.some(item=>!item.box)||boxes.some((item,index)=>index>0&&item.box!.x+item.box!.width/2<=boxes[index-1]!.box!.x+boxes[index-1]!.box!.width/2)){geometryOk=false;geometryProblems.push('Sequence participant shapes are not laid out left-to-right in authored order.');}
   for(const {participant,id} of participants){const carrier=nodeCarrier(id);if(!carrier||!carrier.texts.some(text=>norm(text)===norm(participant.label))){geometryOk=false;geometryProblems.push(`Participant ${participant.id} does not own its visible label.`);}if(participant.role==='process'&&(!carrier||!carrier.cells.some(cell=>cell.id==='role'&&norm(cell.text)==='Process'))){geometryOk=false;geometryProblems.push(`Participant ${participant.id} process role caption is not owned by its native participant carrier.`);}if(participant.icon&&(!carrier||!carrier.icons.some(icon=>icon.glyphs>0))){geometryOk=false;geometryProblems.push(`Participant ${participant.id} does not own a rendered native icon glyph.`);}}
   const messageLabelCenters:number[]=[];
   for(const message of visual.sequence.messages){
    const id=element(plan,'message',message.id)?.nativeId??'',from=element(plan,'participant',message.from)?.nativeId??'',to=element(plan,'participant',message.to)?.nativeId??'',link=dom.links.find(item=>item.classes.includes('lini-style-'+id));
    if(!link||link.from!==from||link.to!==to){geometryOk=false;geometryProblems.push(`Message ${message.id} native SVG endpoint IDs differ from its participants.`);continue;}
    const label=link.labelBounds?link.labelBounds.y+link.labelBounds.height/2:NaN;if(Number.isFinite(label))messageLabelCenters.push(label);
    const isDashed=link.classes.includes('lini-link-dashed'),expectedDashed=message.kind==='return';
    if(isDashed!==expectedDashed||link.arrowCount<1){geometryOk=false;geometryProblems.push(`Message ${message.id} SVG arrow style does not preserve ${message.kind??'call'} semantics.`);}
    if(!link.labels.some(value=>norm(value)===norm(message.label))){geometryOk=false;geometryProblems.push(`Message ${message.id} does not own its exact native label.`);}
    const fromBox=boxes.find(item=>item.id===from)?.box,toBox=boxes.find(item=>item.id===to)?.box,path=link.paths[0],lineFor=(box:Box|undefined)=>box?dom!.lines.filter(line=>close(line.start.x,line.end.x,1)&&close(line.start.x,box.x+box.width/2,3)):[],fromLine=lineFor(fromBox).find(line=>!!path?.start&&Math.abs(path.start.x-line.start.x)<=12&&path.start.y>=Math.min(line.start.y,line.end.y)-2&&path.start.y<=Math.max(line.start.y,line.end.y)+2),toLines=lineFor(toBox),toLine=toLines.find(line=>!!path?.end&&Math.abs(path.end.x-line.start.x)<=18&&path.end.y>=Math.min(line.start.y,line.end.y)-2&&path.end.y<=Math.max(line.start.y,line.end.y)+2);
    if(!path||!fromLine||!toLine){geometryOk=false;geometryProblems.push(`Message ${message.id} path endpoint coordinates ${JSON.stringify({start:path?.start,end:path?.end,fromCenter:fromBox?fromBox.x+fromBox.width/2:null,toCenter:toBox?toBox.x+toBox.width/2:null,lines:dom.lines.map(line=>line.start.x)})} do not attach to the declared participant lifelines.`);}
    if(message.from===message.to){const lifelineX=fromLine?.start.x??0,excursion=path?path.bounds.x+path.bounds.width-lifelineX:0;if(!path||(path.d.match(/A/gu)?.length??0)<2||excursion<12){geometryOk=false;geometryProblems.push(`Self-call ${message.id} lacks its own right-side U path (${path?.d} / excursion ${excursion}).`);}}
    if(message.kind==='async'&&(!link.paths.some(path=>/[CcSsQqTt]/u.test(path.d))||isDashed)){geometryOk=false;geometryProblems.push(`Async message ${message.id} lacks its native curved async path.`);}
   }
   if(messageLabelCenters.some((value,index)=>index>0&&value<=messageLabelCenters[index-1]!)){geometryOk=false;geometryProblems.push('Sequence message rows are not in authored top-to-bottom order.');}
   for(const group of visual.groups??[]){
    const frameCandidates=dom.frames.filter(item=>item.guards.some(text=>norm(text.replace(/^\[|\]$/gu,''))===norm(group.label))),frame=frameCandidates.length===1?frameCandidates[0]:undefined;
    if(!frame){geometryOk=false;geometryProblems.push(`Loop ${group.id} has ${frameCandidates.length} dashed frame candidates paired with its exact native guard in the header band; expected one.`);continue;}
    const memberIds=visual.sequence.messages.filter(message=>{let current=message.group;while(current){if(current===group.id)return true;current=visual!.groups?.find(item=>item.id===current)?.parent;}return false;}).map(message=>element(plan,'message',message.id)?.nativeId??'');
    for(const message of visual.sequence.messages){const id=element(plan,'message',message.id)?.nativeId??'',link=dom.links.find(item=>item.classes.includes('lini-style-'+id)),label=link?.labelBounds,path=link?.paths[0]?.bounds;if(!link||!label||!path)continue;const expected=memberIds.includes(id),insideLabel=inside(label,frame.bounds,2),insidePath=inside(path,frame.bounds,2);if(expected!==insideLabel||expected!==insidePath){geometryOk=false;geometryProblems.push(`Loop ${group.id} does not contain exactly its declared message ${message.id} label and path.`);}}
   }
   for(const note of visual.sequence.notes??[]){
    const id=element(plan,'note',note.id)?.nativeId??'',noteNode=nodeCarrier(id),anchorId=element(plan,'message',note.before??note.after!)?.nativeId??'',anchor=dom.links.find(item=>item.classes.includes('lini-style-'+anchorId)),labelBox=anchor?.labelBounds;
    if(!noteNode||!noteNode.classes.includes('lini-note')||!noteNode.texts.some(text=>norm(text)===norm(note.text))||!labelBox){geometryOk=false;geometryProblems.push(`Note ${note.id} lacks its own native label carrier or anchor row.`);continue;}
    const attachment=note.participants.map(participant=>boxes.find(item=>item.id===element(plan,'participant',participant)?.nativeId)?.box).filter((box):box is Box=>!!box),minX=Math.min(...attachment.map(box=>box.x)),maxX=Math.max(...attachment.map(box=>box.x+box.width)),noteX=noteNode.shape.x+noteNode.shape.width/2;
    if(!attachment.length||noteX<minX-8||noteX>maxX+8){geometryOk=false;geometryProblems.push(`Note ${note.id} is not horizontally attached over its declared participants.`);}
    const before=note.before!==undefined,anchorIndex=visual.sequence.messages.findIndex(message=>message.id===(note.before??note.after)),neighbor=visual.sequence.messages[anchorIndex+(before?-1:1)],neighborLink=neighbor?dom.links.find(item=>item.classes.includes('lini-style-'+(element(plan,'message',neighbor.id)?.nativeId??''))):undefined,anchorY=labelBox.y+labelBox.height/2,noteY=noteNode.shape.y+noteNode.shape.height/2,neighborY=neighborLink?.labelBounds?neighborLink.labelBounds.y+neighborLink.labelBounds.height/2:undefined,sideOk=before?noteNode.shape.y+noteNode.shape.height<=labelBox.y+4:noteNode.shape.y>=labelBox.y+labelBox.height-4,intervalOk=neighborY===undefined||(before?neighborY<noteY&&noteY<anchorY:anchorY<noteY&&noteY<neighborY),positionOk=sideOk&&intervalOk;
    if(!positionOk){geometryOk=false;geometryProblems.push(`Note ${note.id} is not on the declared ${before?'before':'after'} side of message ${note.before??note.after}.`);}
   }
  } else if(visual.kind==='structure'&&visual.form==='tree'){
   const nodes=visual.nodes??[],nativeId=new Map(nodes.map(node=>[node.id,element(plan,'node',node.id)?.nativeId??'']));
   const fullNative=(id:string):string=>nativeId.get(id)??'';
   const hierarchyNative=(id:string):string=>{const node=nodes.find(item=>item.id===id),own=nativeId.get(id)??'';return node?.parent?hierarchyNative(node.parent)+'.'+own:own;};
   for(const node of nodes){const id=nativeId.get(node.id)??'',carrier=nodeCarrier(fullNative(node.id));if(!carrier||!carrier.texts.some(text=>norm(text)===norm(node.label))){geometryOk=false;geometryProblems.push(`Tree topic ${node.id} does not own its visible label.`);continue;}
    if(node.icon){const declared=read?.symbols.get(id)?.includes(node.icon)??false,owned=carrier.icons.some(icon=>icon.glyphs>0);if(!declared||!owned){geometryOk=false;geometryProblems.push(`Tree topic ${node.id} does not own the native ${node.icon} glyph.`);}}
   }
   const expected=nodes.filter(node=>node.parent).map(node=>({child:node,parent:node.parent!,from:hierarchyNative(node.parent!),to:`${hierarchyNative(node.parent!)}.${nativeId.get(node.id)??''}`}));
   const actualTreeLinks=dom.links.filter(link=>expected.some(item=>link.from===item.from&&link.to===item.to));
   if(actualTreeLinks.length!==expected.length||dom.links.length!==expected.length){geometryOk=false;geometryProblems.push(`Tree SVG has ${dom.links.length} native relationships; expected exactly ${expected.length}.`);}
   for(const pair of expected){const link=dom.links.find(item=>item.from===pair.from&&item.to===pair.to),parent=nodeCarrier(nativeId.get(pair.parent)??''),child=nodeCarrier(nativeId.get(pair.child.id)??''),path=link?.paths.find(item=>item.start&&item.end);if(!link||!parent||!child||!path||dist(path.start!,parent.shape)>32||dist(path.end!,child.shape)>32){geometryOk=false;geometryProblems.push(`Tree relationship ${pair.parent} → ${pair.child.id} lacks a native path joining the mapped topic shapes.`);}}
   const root=nodes.find(node=>node.parent===undefined),rootBox=root?nodeCarrier(fullNative(root.id))?.shape:undefined;
   if(visual.layout?.kind==='tree'&&visual.layout.direction==='bilateral'&&rootBox){const sides=nodes.filter(node=>node.parent===root?.id).map(node=>{const box=nodeCarrier(fullNative(node.id))?.shape;return box?Math.sign((box.x+box.width/2)-(rootBox.x+rootBox.width/2)):0;});if(!sides.includes(-1)||!sides.includes(1)){geometryOk=false;geometryProblems.push('Bilateral tree does not place root branches on both native sides.');}}
   for(const parent of nodes){const children=nodes.filter(node=>node.parent===parent.id),sameSide=new Map<number,typeof children>();for(const child of children){const parentBox=nodeCarrier(fullNative(parent.id))?.shape,childBox=nodeCarrier(fullNative(child.id))?.shape;if(!parentBox||!childBox)continue;const side=Math.sign(childBox.x+childBox.width/2-parentBox.x-parentBox.width/2),items=sameSide.get(side)??[];items.push(child);sameSide.set(side,items);}for(const items of sameSide.values()){const actual=[...items].sort((a,b)=>{const aa=nodeCarrier(fullNative(a.id))!.shape,bb=nodeCarrier(fullNative(b.id))!.shape;return aa.y+aa.height/2-bb.y-bb.height/2;});if(actual.length>1&&actual.some((child,index)=>child.id!==items[index]?.id)){geometryOk=false;geometryProblems.push(`Tree siblings under ${parent.id} changed vertical order within their native side.`);}}}
  }
 }
 checks.push(pass('lini-rich-svg-ownership-geometry',sourceSha256,geometryOk,geometryOk?'Pinned SVG carriers own labels, paths, note attachments, icon glyphs, and authored relationships; anonymous loop rectangles are spatially paired with unique native guard text and contain exactly the declared member paths.':geometryProblems.join('; ')||'Pinned Lini SVG or required geometry is unavailable.'));
 const fonts=dom?.fonts??[],fontOk=fonts.length>0&&fonts.every(font=>font.family.trim().replace(/^['"]|['"]$/gu,'').toLowerCase()==='arial');
 checks.push(pass('lini-rich-typography',sourceSha256,fontOk,fontOk?`All ${fonts.length} native SVG text nodes use computed single-family Arial.`:`${fonts.filter(font=>font.family.trim().replace(/^['"]|['"]$/gu,'').toLowerCase()!=='arial').length} of ${fonts.length} native text nodes use a non-Arial family or the SVG is unavailable: ${JSON.stringify(fonts.filter(font=>font.family.trim().replace(/^['"]|['"]$/gu,'').toLowerCase()!=='arial'))}.`));
 return checks;
}
