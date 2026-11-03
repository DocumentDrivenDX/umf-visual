// SPDX-License-Identifier: MIT OR Apache-2.0
/** Native ownership and row/column proof for the bounded before/after table. */
import {createHash} from 'node:crypto';
import type {Page} from 'playwright';
import type {Document} from '@umf/core';
import {getVisual,type Visual} from '../../src/extensions/visual';
import {quoteLiniProfile} from '../../src/interchange/lini/profile-syntax';
import {estimateBeforeAfterTextWidth,wrapBeforeAfterNote} from '../../src/presentation/lini-before-after';
import type {PresentationElement,PresentationPlan} from '../../src/presentation';
import type {PresentationQualityCheck} from './quality';

type Box={x:number;y:number;width:number;height:number};
type Cell={id:string;text:string;bounds:Box;visible:boolean};
const BASE='/extensions/umf.visual';
const sha=(source:string)=>createHash('sha256').update(Buffer.from(source,'utf8')).digest('hex');
const norm=(value:string)=>value.replace(/\s+/gu,' ').trim();
const result=(check:string,sourceSha256:string,ok:boolean,details:string):PresentationQualityCheck=>({check,sourceSha256,result:ok?'pass':'fail',details});
const sourcePath=(suffix:string)=>BASE+(suffix.startsWith('/')?suffix:'/'+suffix);
const slot=(row:number,column:number)=>`before-after-cell-r${row+1}-c${column+1}`;
const cellBody=(item:{label:string;detail?:string})=>[item.label,item.detail].filter((value):value is string=>value!==undefined).join('\n');
const criterionBody=(criterion:{label:string;detail?:string;measure:string;max?:number;low?:string;high?:string})=>[
 criterion.label,criterion.max===undefined?undefined:`Maximum: ${String(criterion.max)}`
].filter((value):value is string=>value!==undefined).join('\n');
const wrapped=(id:string,text:string,prefix:string)=>wrapBeforeAfterNote(text,prefix).map((line,index)=>({id:`${id}-line-${index+1}`,text:line}));

/** The caller inserts the exact pinned-runtime SVG into `#frame` before invoking this check. */
export async function verifyLiniBeforeAfterPresentationQuality(page:Page,input:{document:Document;plan:PresentationPlan;nativeAst:unknown}):Promise<PresentationQualityCheck[]> {
 const {document,plan}=input,sourceSha256=sha(plan.source),checks:PresentationQualityCheck[]=[];
 let visual:Visual|undefined;try{visual=getVisual(document);}catch{/* checked below */}
 const comparison=visual?.kind==='comparison'&&visual.form==='before-after'?visual.comparison:undefined;
 if(!visual||!comparison||plan.backend!=='lini'){
  const reason='The before/after native proof requires a comparison/before-after source and a Lini plan.';
  return[result('lini-native-ast',sourceSha256,false,reason),result('lini-native-carriers',sourceSha256,false,reason),result('lini-before-after-values-and-ownership',sourceSha256,false,reason)];
 }
 const expected=new Map<string,{kind:PresentationElement['kind'];nativeId:string;logicalId:string}>();
 const expectMap=(kind:PresentationElement['kind'],suffix:string,nativeId:string,logicalId:string)=>expected.set(sourcePath(suffix),{kind,nativeId,logicalId});
 const title=visual.title??visual.question,titlePath=visual.title!==undefined?'/title':'/question';
 expectMap('visual','/id','before-after-title',visual.id);expectMap('visual',titlePath,'before-after-title',visual.id);
 if(visual.title!==undefined&&visual.question!==visual.title)expectMap('visual','/question','before-after-question',visual.id);
 if(visual.takeaway!==undefined)expectMap('visual','/takeaway','before-after-takeaway',visual.id);
 const auxiliary:Array<{path:string;logicalId:string;id:string;text:string;sourceText:string;prefix:string;lineIndex:number}>=[];
 comparison.items.forEach((item,index)=>{for(const field of ['id','label'] as const)if(item[field]!==undefined)expectMap('comparison-item',`/comparison/items/${index}/${field}`,`before-after-item-${index+1}`,item.id);if(item.detail!==undefined){const path=sourcePath(`/comparison/items/${index}/detail`),prefix=`Item detail (${item.label}): `;for(const[lineIndex,line]of wrapped(`before-after-item-detail-${index+1}`,item.detail,prefix).entries())auxiliary.push({path,logicalId:item.id,...line,sourceText:item.detail,prefix,lineIndex});}});
 comparison.criteria.forEach((criterion,index)=>{for(const field of ['id','label','max'] as const)if(criterion[field]!==undefined)expectMap('comparison-criterion',`/comparison/criteria/${index}/${field}`,`before-after-criterion-${index+1}`,criterion.id);for(const field of ['detail','low','high'] as const)if(criterion[field]!==undefined){const path=sourcePath(`/comparison/criteria/${index}/${field}`),prefix=`${field[0]!.toUpperCase()+field.slice(1)} (${criterion.label}): `;for(const[lineIndex,line]of wrapped(`before-after-criterion-${index+1}-${field}`,criterion[field]!,prefix).entries())auxiliary.push({path,logicalId:criterion.id,...line,sourceText:criterion[field]!,prefix,lineIndex});}});
 const values=new Map(comparison.values.map((value,index)=>[JSON.stringify([value.item,value.criterion]),{value,index}])),noteExpectations:Array<{path:string;logicalId:string;ids:string[];lines:string[]}>=[];
 comparison.criteria.forEach((criterion,r)=>comparison.items.forEach((item,c)=>{
  const entry=values.get(JSON.stringify([item.id,criterion.id]));if(!entry)return;
  const nativeId=slot(r+1,c+1),logicalId=JSON.stringify([item.id,criterion.id]),base=`/comparison/values/${entry.index}`;
  for(const suffix of ['', '/item','/criterion','/text','/support'])if(suffix===''||suffix==='/item'||suffix==='/criterion'||suffix==='/'+(entry.value.text!==undefined&&estimateBeforeAfterTextWidth(entry.value.text)<=400?'text':entry.value.text===undefined?'support':'none')){
   if(suffix==='/none')continue;expectMap('comparison-value',base+suffix,nativeId,suffix==='/item'?item.id:suffix==='/criterion'?criterion.id:logicalId);
  }
  if(entry.value.text!==undefined&&estimateBeforeAfterTextWidth(entry.value.text)>400){const textPath=sourcePath(base+'/text'),prefix=`Text (${criterion.label} · ${item.label}): `;for(const[lineIndex,line]of wrapped(`before-after-value-text-${entry.index+1}`,entry.value.text,prefix).entries())auxiliary.push({path:textPath,logicalId,...line,sourceText:entry.value.text,prefix,lineIndex});}
  if(entry.value.note!==undefined){const prefix=`Note (${criterion.label} · ${item.label}): `,lines=wrapBeforeAfterNote(entry.value.note,prefix,1040,14),ids=lines.map((_,index)=>`before-after-value-note-${entry.index+1}-line-${index+1}`);noteExpectations.push({path:sourcePath(base+'/note'),logicalId,ids,lines});for(const[index,line]of lines.entries())auxiliary.push({path:sourcePath(base+'/note'),logicalId,id:ids[index]!,text:line,sourceText:entry.value.note,prefix,lineIndex:index});}
 }));
 (visual.omissions??[]).forEach((_,index)=>expectMap('annotation',`/omissions/${index}`,`before-after-note-${index+1}`,visual.id));
 (visual.annotations??[]).forEach((annotation,index)=>{expectMap('annotation',`/annotations/${index}/id`,`before-after-annotation-${index+1}`,annotation.id);expectMap('annotation',`/annotations/${index}/text`,`before-after-annotation-${index+1}`,annotation.id);});
 const mapProblems:string[]=[];
 for(const [path,definition]of expected){const found=plan.elementMap.filter(item=>item.sourcePath===path);if(found.length!==1||found[0]!.kind!==definition.kind||found[0]!.nativeId!==definition.nativeId||found[0]!.logicalId!==definition.logicalId)mapProblems.push(`${path} must map once to ${definition.nativeId} as ${definition.kind} for ${definition.logicalId}`);}
 for(const note of noteExpectations){const found=plan.elementMap.filter(item=>item.sourcePath===note.path);if(found.length!==note.ids.length||note.ids.some(id=>!found.some(item=>item.nativeId===id&&item.kind==='comparison-value'&&item.logicalId===note.logicalId)))mapProblems.push(`${note.path} must map every wrapped native text line to its exact comparison value`);}
 for(const group of new Set(auxiliary.map(item=>item.path))){const expectedRows=auxiliary.filter(item=>item.path===group),found=plan.elementMap.filter(item=>item.sourcePath===group);if(found.length!==expectedRows.length||expectedRows.some(row=>!found.some(item=>item.nativeId===row.id&&item.logicalId===row.logicalId)))mapProblems.push(`${group} must map each wrapped native text line to its exact source owner`);}
 comparison.criteria.forEach((criterion,row)=>{const path=sourcePath(`/comparison/criteria/${row}/measure`),found=plan.elementMap.filter(item=>item.sourcePath===path),expectedIds=comparison.items.map((_,column)=>slot(row+1,column+1));if(found.length!==expectedIds.length||found.some(item=>item.kind!=='comparison-criterion'||item.logicalId!==criterion.id)||expectedIds.some(id=>!found.some(item=>item.nativeId===id)))mapProblems.push(`${path} must map the authored measure to every typed native value cell in its criterion row`);});
 const relevant=plan.elementMap.filter(item=>item.kind==='comparison-item'||item.kind==='comparison-criterion'||item.kind==='comparison-value'||item.kind==='annotation'&&item.sourcePath.startsWith(BASE+'/annotations/'));
 const measurePaths=new Set(comparison.criteria.map((_,index)=>sourcePath(`/comparison/criteria/${index}/measure`))),notePaths=new Set(noteExpectations.map(note=>note.path)),auxPaths=new Set(auxiliary.map(item=>item.path));
 for(const item of relevant)if(!expected.has(item.sourcePath)&&!measurePaths.has(item.sourcePath)&&!notePaths.has(item.sourcePath)&&!auxPaths.has(item.sourcePath))mapProblems.push(`unexpected source mapping at ${item.sourcePath}`);

 const ast=typeof input.nativeAst==='string'?input.nativeAst:'',profileProblems:string[]=[];
 const expectedRows=comparison.criteria.length+1,expectedColumns=comparison.items.length+1,expectedCells=expectedRows*expectedColumns,columns=[360,...comparison.items.map(()=>420)];
 const nativeCells:Array<{id:string;text:string}>=[{id:slot(0,0),text:'Criterion'},...comparison.items.map((item,index)=>({id:`before-after-item-${index+1}`,text:item.label}))];
 const nativeNotes:Array<{id:string;text:string;path:string}>=[];
 comparison.criteria.forEach((criterion,row)=>{
  nativeCells.push({id:`before-after-criterion-${row+1}`,text:criterionBody(criterion)});
  comparison.items.forEach((item,column)=>{const entry=values.get(JSON.stringify([item.id,criterion.id]))!,value=entry.value,text=value.text===undefined?value.support!:estimateBeforeAfterTextWidth(value.text)>400?'Text detail below':value.text;nativeCells.push({id:slot(row+1,column+1),text});});
 });
 nativeNotes.push(...auxiliary.map(item=>({id:item.id,text:item.text,path:item.path})));
 const tableMarker='|table#before-after-table|',sourceTableStart=plan.source.indexOf(tableMarker),astTableStart=ast.indexOf('|block#before-after-table|'),columnList=columns.join(', ');
 if(sourceTableStart<0||!plan.source.slice(sourceTableStart,plan.source.indexOf('[',sourceTableStart)).includes(`columns: ${columnList};`))profileProblems.push('native source table declaration or its item-ordered column count is missing');
 if(astTableStart<0)profileProblems.push('pinned Lini AST is missing the table carrier');
 const sourceOrder:number[]=[],astOrder:number[]=[],astTableEnd=ast.indexOf('\n  ]',astTableStart);
 for(const item of nativeCells){
  const sourceToken=`|cell#${item.id}| ${quoteLiniProfile(item.text)};`,sourceAt=plan.source.indexOf(sourceToken,sourceTableStart),astToken=`|block#${item.id}|`,astAt=ast.indexOf(astToken,astTableStart),astNext=ast.indexOf('|block#',astAt+astToken.length),astDeclaration=ast.slice(astAt,astNext<0?undefined:astNext);
  if(sourceAt<0||plan.source.indexOf(sourceToken,sourceAt+sourceToken.length)>=0)profileProblems.push(`native source table is missing a unique cell ${item.id} with exact text`);else sourceOrder.push(sourceAt);
  if(astAt<0||astTableEnd<0||astAt<=astTableStart||astAt>=astTableEnd||ast.indexOf(astToken,astAt+astToken.length)>=0||!astDeclaration.includes(JSON.stringify(item.text)))profileProblems.push(`pinned native AST table cell ${item.id} does not retain its exact text and table ownership`);else astOrder.push(astAt);
 }
 if(sourceOrder.length===expectedCells&&sourceOrder.some((offset,index)=>index>0&&offset<=sourceOrder[index-1]!))profileProblems.push('native source table cells are not in declared row-major item/criterion order');
 if(astOrder.length===expectedCells&&astOrder.some((offset,index)=>index>0&&offset<=astOrder[index-1]!))profileProblems.push('pinned native AST cells are not in declared row-major item/criterion order');
 if(astTableStart>=0){const firstCell=ast.indexOf('|block#',astTableStart+tableMarker.length),tableDeclaration=ast.slice(astTableStart,firstCell<0?undefined:firstCell);if(!tableDeclaration.includes(`columns: ${columnList};`))profileProblems.push('pinned native AST table does not preserve the declared item column count and order');}
 for(const note of nativeNotes){const token=`|block#${note.id}|`,at=ast.indexOf(token),next=ast.indexOf('|block#',at+token.length),declaration=ast.slice(at,next<0?undefined:next);if(at<0||at<=astTableEnd||!declaration.includes(JSON.stringify(note.text)))profileProblems.push(`pinned native AST note block ${note.id} does not retain its exact text outside the table`);}
 const astAuxText=(id:string):string|undefined=>{const token=`|block#${id}|`,at=ast.indexOf(token),next=ast.indexOf('|block#',at+token.length),declaration=ast.slice(at,next<0?undefined:next),match=declaration.match(/\[\s+"((?:\\.|[^"\\])*)"\s+\]/su);if(at<0||!match)return undefined;try{return JSON.parse(`"${match[1]}"`) as string;}catch{return undefined;}};
 for(const path of new Set(auxiliary.map(item=>item.path))){const group=auxiliary.filter(item=>item.path===path).sort((a,b)=>a.lineIndex-b.lineIndex),actual=group.map(item=>astAuxText(item.id));if(actual.some((text,index)=>text===undefined||text!==group[index]!.text)){profileProblems.push(`${path} wrapped native AST text lines do not match their owned source text`);continue;}const first=actual[0]??'',prefix=group[0]?.prefix??'',body=first.startsWith(prefix)?first.slice(prefix.length):undefined,tail=actual.slice(1).filter((text):text is string=>text!==undefined);if(body===undefined||norm([body,...tail].join(' '))!==norm(group[0]!.sourceText))profileProblems.push(`${path} wrapped native AST lines do not reconstruct the full authored text`);}
 const astOk=profileProblems.length===0;
 checks.push(result('lini-native-ast',sourceSha256,astOk,astOk?`Pinned Lini source and native AST retain ${expectedRows} rows, ${expectedColumns} columns, and the mapped comparison declarations.`:profileProblems.join('; ')));

 let svg:{isLini:boolean;viewBox:Box;carriers:Cell[];table:Cell|undefined}|undefined;
 try{svg=await page.locator('#frame svg').first().evaluate(root=>{
  const element=root as SVGSVGElement,origin=element.getBoundingClientRect(),box=(node:Element):Box=>{const r=node.getBoundingClientRect();return{x:r.x-origin.x,y:r.y-origin.y,width:r.width,height:r.height};};
  const visible=(node:Element)=>{let current:Element|null=node;while(current&&current!==element){const style=getComputedStyle(current);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;current=current.parentElement;}const r=node.getBoundingClientRect();return r.width>0&&r.height>0;};
  const carriers=[...element.querySelectorAll('g.lini-node[data-id]')].map(node=>({id:node.getAttribute('data-id')??'',text:[...node.querySelectorAll('text')].filter(visible).map(text=>text.textContent??'').join(' ').replace(/\s+/gu,' ').trim(),bounds:box(node),visible:visible(node)}));
  const view=element.viewBox.baseVal,table=carriers.find(carrier=>carrier.id==='before-after-table');
  return{isLini:element.classList.contains('lini'),viewBox:{x:view.x,y:view.y,width:view.width,height:view.height},carriers,table};
 });}catch{/* failed below */}
 const carrierProblems=[...mapProblems];
 if(!svg?.isLini||svg.viewBox.width<=0||svg.viewBox.height<=0)carrierProblems.push('native Lini SVG or a nonzero viewBox is missing');
 const byId=new Map<string,Cell[]>();for(const item of svg?.carriers??[]){const list=byId.get(item.id)??[];list.push(item);byId.set(item.id,list);}
 const visibleText=(id:string,text:string)=>{const candidates=byId.get(id)??[];return candidates.some(item=>item.visible&&norm(item.text)===norm(text));};
 if(!svg?.table?.visible)carrierProblems.push('comparison table is not a visible native SVG carrier');
 if(!visibleText('before-after-title',title))carrierProblems.push('exact title is not visible in its mapped native owner');
 if(visual.title!==undefined&&visual.question!==visual.title&&!visibleText('before-after-question',visual.question))carrierProblems.push('exact question is not visible in its mapped native owner');
 if(visual.takeaway!==undefined&&!visibleText('before-after-takeaway',visual.takeaway))carrierProblems.push('exact takeaway is not visible in its mapped native owner');
 for(const[index,item]of comparison.items.entries())if(!visibleText(`before-after-item-${index+1}`,item.label))carrierProblems.push(`comparison item ${item.id} is not visibly owned by its exact header cell`);
 for(const[index,criterion]of comparison.criteria.entries())if(!visibleText(`before-after-criterion-${index+1}`,criterionBody(criterion)))carrierProblems.push(`criterion ${criterion.id} is not visibly owned by its exact row heading`);
 for(const[index,note]of(visual.omissions??[]).entries())if(!visibleText(`before-after-note-${index+1}`,note))carrierProblems.push(`authored omission ${index} is not visibly owned by its native note`);
 for(const[index,annotation]of(visual.annotations??[]).entries())if(!visibleText(`before-after-annotation-${index+1}`,annotation.text))carrierProblems.push(`annotation ${annotation.id} is not visible in its exact native owner`);
 for(const note of nativeNotes)if(!visibleText(note.id,note.text))carrierProblems.push(`authored value note ${note.id} is not fully visible in its native note block`);
 for(const path of new Set(auxiliary.map(item=>item.path))){const group=auxiliary.filter(item=>item.path===path).sort((a,b)=>a.lineIndex-b.lineIndex),actual=group.map(item=>(byId.get(item.id)??[]).find(carrier=>carrier.visible)?.text),first=actual[0]??'',prefix=group[0]?.prefix??'',body=first.startsWith(prefix)?first.slice(prefix.length):undefined;if(actual.some((text,index)=>text===undefined||text!==group[index]!.text)||body===undefined||norm([body,...actual.slice(1).filter((text):text is string=>text!==undefined)].join(' '))!==norm(group[0]!.sourceText))carrierProblems.push(`${path} visible native text lines do not reconstruct the full authored text`);}
 const panel=byId.get('before-after-panel')?.[0];if(!panel?.visible)carrierProblems.push('native before/after composition container is not visible');
 for(const text of auxiliary){const carrier=byId.get(text.id)?.[0];if(!carrier||!panel||carrier.bounds.x<panel.bounds.x-2||carrier.bounds.y<panel.bounds.y-2||carrier.bounds.x+carrier.bounds.width>panel.bounds.x+panel.bounds.width+2||carrier.bounds.y+carrier.bounds.height>panel.bounds.y+panel.bounds.height+2)carrierProblems.push(`wrapped text owner ${text.id} falls outside its native comparison composition`);}
 if(carrierProblems.length===0&&svg?.table){
  const tableBox=svg.table.bounds;
  const itemHeaders=comparison.items.map((_,index)=>byId.get(`before-after-item-${index+1}`)?.[0]);
  if(itemHeaders.every((item):item is Cell=>item!==undefined)&&itemHeaders.some((item,index)=>index>0&&item.bounds.x+item.bounds.width/2<=itemHeaders[index-1]!.bounds.x+itemHeaders[index-1]!.bounds.width/2))carrierProblems.push('item header columns are not left-to-right in authored order');
  const criterionHeaders=comparison.criteria.map((_,index)=>byId.get(`before-after-criterion-${index+1}`)?.[0]);
  if(criterionHeaders.every((item):item is Cell=>item!==undefined)&&criterionHeaders.some((item,index)=>index>0&&item.bounds.y+item.bounds.height/2<=criterionHeaders[index-1]!.bounds.y+criterionHeaders[index-1]!.bounds.height/2))carrierProblems.push('criterion heading rows are not top-to-bottom in authored order');
  for(const[index,item]of comparison.items.entries()){
   const header=byId.get(`before-after-item-${index+1}`)?.[0];if(!header)continue;
   for(let row=1;row<expectedRows;row++){
    const value=byId.get(slot(row,index+1))?.[0];if(!value){carrierProblems.push(`item column ${item.id} is missing table cell at row ${row+1}`);continue;}
    if(Math.abs((header.bounds.x+header.bounds.width/2)-(value.bounds.x+value.bounds.width/2))>4)carrierProblems.push(`value cell for item ${item.id} is not aligned beneath its declared column header`);
    if(!tableBox||value.bounds.x<tableBox.x-2||value.bounds.y<tableBox.y-2||value.bounds.x+value.bounds.width>tableBox.x+tableBox.width+2||value.bounds.y+value.bounds.height>tableBox.y+tableBox.height+2)carrierProblems.push(`value cell for item ${item.id} falls outside the visible table`);
   }
  }
  for(const[index,criterion]of comparison.criteria.entries()){
   const row=byId.get(`before-after-criterion-${index+1}`)?.[0];if(!row)continue;
   for(let column=1;column<expectedColumns;column++){
    const value=byId.get(slot(index+1,column))?.[0];if(!value){carrierProblems.push(`criterion row ${criterion.id} is missing cell at column ${column+1}`);continue;}
    if(Math.abs((row.bounds.y+row.bounds.height/2)-(value.bounds.y+value.bounds.height/2))>4)carrierProblems.push(`value cell for criterion ${criterion.id} is not aligned in its declared row`);
   }
  }
 }
 const carriersOk=carrierProblems.length===0;
 checks.push(result('lini-native-carriers',sourceSha256,carriersOk,carriersOk?`All ${comparison.items.length} item headers and ${comparison.criteria.length} criterion rows are visible in source order; the table geometry binds each value cell to its declared item column and criterion row.`:carrierProblems.join('; ')));

 const valueProblems:string[]=[];
 comparison.criteria.forEach((criterion,row)=>comparison.items.forEach((item,column)=>{
  const id=slot(row+1,column+1),carrier=byId.get(id)?.[0],entry=values.get(JSON.stringify([item.id,criterion.id]));
  if(!carrier?.visible){valueProblems.push(`cell ${item.id}/${criterion.id} is not a visible native value owner`);return;}
  if(entry){const value=entry.value,expectedText=value.text===undefined?value.support!:estimateBeforeAfterTextWidth(value.text)>400?'Text detail below':value.text;if(norm(carrier.text)!==norm(expectedText))valueProblems.push(`cell ${item.id}/${criterion.id} does not preserve its exact authored ${criterion.measure} value`);const note=noteExpectations.find(item=>item.path===sourcePath(`/comparison/values/${entry.index}/note`));if(note&&note.lines.some((line,index)=>!visibleText(note.ids[index]!,line)))valueProblems.push(`cell ${item.id}/${criterion.id} note is not fully visible in its related native note blocks`);if(value.text!==undefined&&estimateBeforeAfterTextWidth(value.text)>400&&auxiliary.filter(text=>text.path===sourcePath(`/comparison/values/${entry.index}/text`)).some(text=>!visibleText(text.id,text.text)))valueProblems.push(`cell ${item.id}/${criterion.id} text is not fully visible in its related native text blocks`);}
  else if(norm(carrier.text)!=='Not supplied')valueProblems.push(`missing cell ${item.id}/${criterion.id} is not visibly distinguished as “Not supplied”`);
 }));
 const pointerOwnerOk=[...expected.entries()].filter(([path,definition])=>definition.kind==='comparison-value').every(([path,definition])=>{
  const mapping=plan.elementMap.find(item=>item.sourcePath===path);return !!mapping&&mapping.nativeId===definition.nativeId&&mapping.kind===definition.kind&&mapping.logicalId===definition.logicalId&&byId.get(definition.nativeId)?.some(carrier=>carrier.visible);
 });
 if(!pointerOwnerOk)valueProblems.push('one or more value/item/criterion source pointers do not resolve to a visible native cell');
 const dataOk=valueProblems.length===0;
 checks.push(result('lini-before-after-values-and-ownership',sourceSha256,dataOk,dataOk?`${comparison.values.length} source values retain their exact text or yes/no/partial support labels and map by item/criterion identity; missing cells remain distinct from “no”.`:valueProblems.join('; ')));
 return checks;
}
