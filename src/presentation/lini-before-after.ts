// SPDX-License-Identifier: MIT OR Apache-2.0
/** Native Lini table projection for an explicitly authored before/after comparison. */
import type {Visual,VisualDefs} from '../extensions/visual';
import {quoteLiniProfile} from '../interchange/lini/profile-syntax';
import type {PresentationElement,PresentationFailure,PresentationOmission,PresentationPlan} from './index';

const BASE='/extensions/umf.visual';
const path=(part:string)=>BASE+(part.startsWith('/')?part:'/'+part);
const ptr=(value:string)=>value.replace(/~/g,'~0').replace(/\//g,'~1');
const unknown=(value:object,allowed:readonly string[])=>Object.keys(value).find(key=>!allowed.includes(key));
const scope=(part:string,message:string):PresentationFailure=>({ok:false,diagnostics:[{code:'PRESENTATION_LINI_BEFORE_AFTER_SCOPE',path:path(part),message,severity:'error'}]});
const quote=(value:string,sourcePath:string)=>{try{return quoteLiniProfile(value);}catch(reason){throw Object.assign(new Error(reason instanceof Error?reason.message:'Text is outside the pinned Lini string subset.'),{sourcePath});}};
type Comparison=NonNullable<VisualDefs['comparison']>;
const style=(fontSize:number)=>`width: 1200; font-size: ${fontSize}; color: #243b45; fill: none; stroke: none; stroke-width: 0;`;
const slot=(row:number,column:number)=>`before-after-cell-r${row+1}-c${column+1}`;
/** Renderer estimate for wrapping notes into native text blocks; browser geometry remains the quality authority. */
export function estimateBeforeAfterTextWidth(value:string,fontSize=14):number{return Array.from(value).reduce((sum,char)=>sum+fontSize*(char===' '?0.28:/[ilI.,'`|]/u.test(char)?0.3:/[MW@#%&]/u.test(char)?0.85:0.56),0);}
export function wrapBeforeAfterNote(text:string,prefix:string,maxWidth=1040,fontSize=14):string[]{
 const width=(value:string)=>estimateBeforeAfterTextWidth(value,fontSize);
 const lines:string[]=[];for(const paragraph of `${prefix}${text}`.split('\n')){let line='';for(const word of paragraph.split(/\s+/u).filter(Boolean)){const next=line?`${line} ${word}`:word;if(line&&width(next)>maxWidth){lines.push(line);line=word;}else line=next;}if(line||paragraph==='')lines.push(line);}return lines.length?lines:[''];
}

/** Compile exact item-by-criterion values without inferring a winner or missing support. */
export function compileLiniBeforeAfterPresentation(visual:Visual):PresentationPlan|PresentationFailure {
 try{return compile(visual);}catch(reason){
  const error=reason as Error&{sourcePath?:unknown},located=typeof error?.sourcePath==='string';
  return{ok:false,diagnostics:[{code:located?'PRESENTATION_LINI_BEFORE_AFTER_TEXT':'PRESENTATION_LINI_BEFORE_AFTER_INTERNAL',path:located?error.sourcePath as string:path('/comparison'),message:located&&error instanceof Error?error.message:'An internal native before/after compilation error occurred; no projection was emitted.',severity:'error'}]};
 }
}

function compile(visual:Visual):PresentationPlan|PresentationFailure {
 if(visual.kind!=='comparison'||visual.form!=='before-after'||!visual.comparison)return scope('/comparison','A comparison/before-after payload is required.');
 const comparison=visual.comparison;
 const topUnknown=unknown(visual,['id','kind','form','title','question','takeaway','audience','source','omissions','annotations','groups','nodes','edges','steps','sequence','structure','state','timeline','comparison','metric','layout']);
 if(topUnknown)return scope('/'+ptr(topUnknown),'An unknown visual property is retained in the source but has no qualified before/after table mapping.');
 if(visual.layout!==undefined)return scope('/layout','The native table controls its own layout; authored layout directives are not silently reinterpreted.');
 for(const key of ['groups','nodes','edges','steps','sequence','structure','state','timeline','metric'] as const)if(visual[key]!==undefined)return scope('/'+key,'The bounded comparison table does not reinterpret another visual-family payload.');
 if(visual.annotations?.length&&visual.annotations.some(annotation=>unknown(annotation,['id','text'])))return scope('/annotations','An annotation contains properties without a qualified native table mapping.');
 const comparisonUnknown=unknown(comparison,['items','criteria','values','chosen','axes']);if(comparisonUnknown)return scope('/comparison/'+ptr(comparisonUnknown),'An unknown comparison property is retained but has no qualified before/after table mapping.');
 if(comparison.items.length!==2)return scope('/comparison/items','This before/after table requires exactly two explicitly declared comparison items.');
 if(comparison.criteria.length===0)return scope('/comparison/criteria','At least one comparison criterion is required.');
 if(comparison.chosen!==undefined)return scope('/comparison/chosen','A chosen-item claim is not rendered as a property of a before/after matrix.');
 if(comparison.axes!==undefined)return scope('/comparison/axes','Quadrant axes are not part of a before/after table.');
 if(comparison.items.length>2||comparison.criteria.length>40||comparison.values.length>4000)return scope('/comparison','The comparison exceeds this bounded native table profile.');

 for(const[index,item]of comparison.items.entries()){
  const extra=unknown(item,['id','label','detail']);if(extra)return scope(`/comparison/items/${index}/${ptr(extra)}`,'An unknown item property has no qualified before/after table mapping.');
 }
 for(const[index,criterion]of comparison.criteria.entries()){
  const extra=unknown(criterion,['id','label','detail','measure','max','low','high']);if(extra)return scope(`/comparison/criteria/${index}/${ptr(extra)}`,'An unknown criterion property has no qualified before/after table mapping.');
  if(criterion.measure!=='text'&&criterion.measure!=='support')return scope(`/comparison/criteria/${index}/measure`,'This table profile preserves text and support criteria; numeric ratings are not rendered as text or inferred as scores.');
 }
 const itemIds=new Set(comparison.items.map(item=>item.id)),criteriaById=new Map(comparison.criteria.map(criterion=>[criterion.id,criterion])),valueByPair=new Map<string,{value:Comparison['values'][number];sourceIndex:number}>();
 for(const[sourceIndex,value]of comparison.values.entries()){
  const extra=unknown(value,['item','criterion','text','support','rating','note']);if(extra)return scope(`/comparison/values/${sourceIndex}/${ptr(extra)}`,'An unknown value property has no qualified native cell mapping.');
  if(!itemIds.has(value.item)||!criteriaById.has(value.criterion))return scope(`/comparison/values/${sourceIndex}`,'Every value must resolve by its declared item and criterion IDs.');
  const key=JSON.stringify([value.item,value.criterion]);if(valueByPair.has(key))return scope(`/comparison/values/${sourceIndex}`,'Only one value may be supplied for each item/criterion pair.');
  const criterion=criteriaById.get(value.criterion)!;
  if(criterion.measure==='text'&&(value.text===undefined||value.support!==undefined||value.rating!==undefined))return scope(`/comparison/values/${sourceIndex}`,'Text criteria require exactly one authored text value.');
  if(criterion.measure==='support'&&(value.support===undefined||value.text!==undefined||value.rating!==undefined))return scope(`/comparison/values/${sourceIndex}`,'Support criteria require exactly one authored yes/no/partial value.');
  if(value.text!==undefined&&value.text.length===0)return scope(`/comparison/values/${sourceIndex}/text`,'An empty text value has no visible distinction from an unsupplied cell in this native profile.');
  valueByPair.set(key,{value,sourceIndex});
 }
 for(const item of comparison.items)for(const criterion of comparison.criteria)if(!valueByPair.has(JSON.stringify([item.id,criterion.id])))return scope('/comparison/values','This Visual before/after profile requires one explicit value for every item/criterion pair; absence is not converted to “no”.');
 const elements:PresentationElement[]=[],omissions:PresentationOmission[]=[];
 const add=(logicalId:string,suffix:string,nativeId:string,kind:PresentationElement['kind'])=>elements.push({logicalId,sourcePath:path(suffix),nativeId,kind});
 const quoteAt=(value:string,suffix:string)=>quote(value,path(suffix));
 const title=visual.title??visual.question,titlePath=visual.title!==undefined?'/title':'/question';
 quoteAt(title,titlePath);quoteAt(visual.question,'/question');
 for(const[index,item]of comparison.items.entries()){
  quoteAt(item.label,`/comparison/items/${index}/label`);if(item.detail!==undefined)quoteAt(item.detail,`/comparison/items/${index}/detail`);
 }
 for(const[index,criterion]of comparison.criteria.entries()){
  quoteAt(criterion.label,`/comparison/criteria/${index}/label`);if(criterion.detail!==undefined)quoteAt(criterion.detail,`/comparison/criteria/${index}/detail`);if(criterion.low!==undefined)quoteAt(criterion.low,`/comparison/criteria/${index}/low`);if(criterion.high!==undefined)quoteAt(criterion.high,`/comparison/criteria/${index}/high`);
 }
 for(const[sourceIndex,value]of comparison.values.entries()){
  if(value.text!==undefined)quoteAt(value.text,`/comparison/values/${sourceIndex}/text`);
  if(value.note!==undefined)quoteAt(value.note,`/comparison/values/${sourceIndex}/note`);
 }
 if(visual.takeaway!==undefined)quoteAt(visual.takeaway,'/takeaway');
 for(const[index,note]of(visual.omissions??[]).entries())quoteAt(note,`/omissions/${index}`);
 for(const[index,annotation]of(visual.annotations??[]).entries())quoteAt(annotation.text,`/annotations/${index}/text`);

 add(visual.id,'/id','before-after-title','visual');add(visual.id,titlePath,'before-after-title','visual');
 if(visual.title!==undefined&&visual.question!==visual.title)add(visual.id,'/question','before-after-question','visual');
 if(visual.takeaway!==undefined)add(visual.id,'/takeaway','before-after-takeaway','visual');
 comparison.items.forEach((item,index)=>{const nativeId=`before-after-item-${index+1}`;for(const field of ['id','label'] as const)if(item[field]!==undefined)add(item.id,`/comparison/items/${index}/${field}`,nativeId,'comparison-item');});
 comparison.criteria.forEach((criterion,index)=>{const nativeId=`before-after-criterion-${index+1}`;for(const field of ['id','label','max'] as const)if(criterion[field]!==undefined)add(criterion.id,`/comparison/criteria/${index}/${field}`,nativeId,'comparison-criterion');});

 const tableCells:string[]=[],noteBlocks:string[]=[],valueTextBlocks:Array<{sourcePath:string;logicalId:string;nativeId:string;text:string}>=[];
 const putWrapped=(nativeId:string,text:string,prefix:string,sourceSuffix:string,logicalId:string)=>{const lines=wrapBeforeAfterNote(text,prefix),ids=lines.map((_,index)=>`${nativeId}-line-${index+1}`);for(const[index,line]of lines.entries()){const id=ids[index]!;add(logicalId,sourceSuffix,id,sourceSuffix.includes('/values/')?'comparison-value':sourceSuffix.includes('/items/')?'comparison-item':'comparison-criterion');noteBlocks.push(`  |block#${id}| ${quote(line,path(sourceSuffix))} { ${style(14)} }`);}};
 const putCell=(nativeId:string,value:string,sourceSuffix?:string)=>{
  tableCells.push(`|cell#${nativeId}| ${quote(value,sourceSuffix?path(sourceSuffix):path('/comparison'))};`);
 };
 putCell(slot(0,0),'Criterion');
 comparison.items.forEach((item,index)=>{
  putCell(`before-after-item-${index+1}`,item.label,`/comparison/items/${index}/label`);
  if(item.detail!==undefined)putWrapped(`before-after-item-detail-${index+1}`,item.detail,`Item detail (${item.label}): `,`/comparison/items/${index}/detail`,item.id);
 });
 for(const[criterionIndex,criterion]of comparison.criteria.entries()){
  const row=criterionIndex+1,parts=[criterion.label,criterion.max===undefined?undefined:`Maximum: ${String(criterion.max)}`].filter((part):part is string=>part!==undefined);
  putCell(`before-after-criterion-${criterionIndex+1}`,parts.join('\n'),`/comparison/criteria/${criterionIndex}/label`);
  for(const[field,value]of[['detail',criterion.detail],['low',criterion.low],['high',criterion.high]] as const)if(value!==undefined)putWrapped(`before-after-criterion-${criterionIndex+1}-${field}`,value,`${field[0]!.toUpperCase()+field.slice(1)} (${criterion.label}): `,`/comparison/criteria/${criterionIndex}/${field}`,criterion.id);
  for(const[itemIndex,item]of comparison.items.entries()){
   const relation=valueByPair.get(JSON.stringify([item.id,criterion.id]))!,rowSlot=slot(row,itemIndex+1);
   const value=relation.value,content=value.text??value.support!,nativeId=rowSlot,logicalId=JSON.stringify([item.id,criterion.id]);
   const valuePath=`/comparison/values/${relation.sourceIndex}/${value.text!==undefined?'text':'support'}`;
   if(value.text!==undefined&&estimateBeforeAfterTextWidth(content)>400){putCell(nativeId,'Text detail below',valuePath);const lines=wrapBeforeAfterNote(content,`Text (${criterion.label} · ${item.label}): `);for(const[lineIndex,line]of lines.entries()){const lineId=`before-after-value-text-${relation.sourceIndex+1}-line-${lineIndex+1}`;add(logicalId,valuePath,lineId,'comparison-value');noteBlocks.push(`  |block#${lineId}| ${quote(line,path(valuePath))} { ${style(14)} }`);valueTextBlocks.push({sourcePath:path(valuePath),logicalId,nativeId:lineId,text:line});}}
   else{putCell(nativeId,content,valuePath);}
   add(logicalId,`/comparison/values/${relation.sourceIndex}`,nativeId,'comparison-value');
   add(item.id,`/comparison/values/${relation.sourceIndex}/item`,nativeId,'comparison-value');
   add(criterion.id,`/comparison/values/${relation.sourceIndex}/criterion`,nativeId,'comparison-value');
   add(criterion.id,`/comparison/criteria/${criterionIndex}/measure`,nativeId,'comparison-criterion');
   if(value.text!==undefined&&estimateBeforeAfterTextWidth(content)<=400)add(logicalId,`/comparison/values/${relation.sourceIndex}/text`,nativeId,'comparison-value');
   if(value.support!==undefined)add(logicalId,`/comparison/values/${relation.sourceIndex}/support`,nativeId,'comparison-value');
   if(value.note!==undefined)putWrapped(`before-after-value-note-${relation.sourceIndex+1}`,value.note,`Note (${criterion.label} · ${item.label}): `,`/comparison/values/${relation.sourceIndex}/note`,logicalId);
  }
 }
 if(visual.source)omissions.push({sourcePath:path('/source'),reason:'Source locator and digest are retained in UMF; they do not independently verify the historical comparison claims.'});
 if(visual.audience)omissions.push({sourcePath:path('/audience'),reason:'Audience metadata is retained in UMF and does not alter the comparison values.'});
 if(visual.omissions)for(const[index]of visual.omissions.entries())add(visual.id,`/omissions/${index}`,`before-after-note-${index+1}`,'annotation');
 if(visual.annotations)for(const[index,annotation]of visual.annotations.entries()){add(annotation.id,`/annotations/${index}/id`,`before-after-annotation-${index+1}`,'annotation');add(annotation.id,`/annotations/${index}/text`,`before-after-annotation-${index+1}`,'annotation');}

 const columns=[360,...comparison.items.map(()=>420)];
 const source=['{ font-family: Arial; --lini-font-family: Arial; --muted: #243b45;','  .lini-text { font-family: Arial; }','  .lini-table { color: #243b45; }','}','|column#before-after-panel| { width: 1280; gap: 18; padding: 24; fill: none; stroke: none; stroke-width: 0; } [',
  `  |block#before-after-title| ${quote(title,path(titlePath))} { ${style(26)} font-weight: bold; }`,
  visual.title!==undefined&&visual.question!==visual.title?`  |block#before-after-question| ${quote(visual.question,path('/question'))} { ${style(16)} }`:undefined,
  `  |table#before-after-table| { columns: ${columns.join(', ')}; } [`,
  ...tableCells.map(cell=>'    '+cell),
  '  ]',
  visual.takeaway!==undefined?`  |block#before-after-takeaway| ${quote(visual.takeaway,path('/takeaway'))} { ${style(16)} font-weight: bold; }`:undefined,
  ...noteBlocks,
  ...(visual.omissions??[]).map((note,index)=>`  |block#before-after-note-${index+1}| ${quote(note,path('/omissions/'+index))} { ${style(14)} }`),
  ...(visual.annotations??[]).map((annotation,index)=>`  |block#before-after-annotation-${index+1}| ${quote(annotation.text,path('/annotations/'+index+'/text'))} { ${style(14)} }`),
  ']'
 ].filter((line):line is string=>line!==undefined).join('\n')+'\n';
 const approximations=[{sourcePath:path('/comparison'),requested:'Before/after comparison with typed text and support criteria',representation:'A native comparison table uses item declaration order for columns and criterion declaration order for rows. Each populated cell is resolved by its item and criterion IDs, while source value indexes remain unchanged. Text values and yes/no/partial support values remain visibly distinct and use neutral styling; the source measure stays typed in UMF and maps to the row’s native value cells rather than repeating its enum in the heading. No ranking, winner, or current-state verification is inferred. The Visual contract requires explicit item/criterion values; the renderer never synthesizes “no” for an absent value.'}];
 return{ok:true,profileId:'umf.visual.presentation/1',backend:'lini',nativeFormat:'lini',source,elementMap:elements,omissions,approximations};
}
