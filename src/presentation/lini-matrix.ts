// SPDX-License-Identifier: MIT OR Apache-2.0
/** Native Lini table projection for a complete, explicitly authored comparison matrix. */
import type {Visual,VisualDefs} from '../extensions/visual';
import {quoteLiniProfile} from '../interchange/lini/profile-syntax';
import type {PresentationElement,PresentationFailure,PresentationOmission,PresentationPlan} from './index';

const BASE='/extensions/umf.visual';
const path=(part:string)=>BASE+(part.startsWith('/')?part:'/'+part);
const ptr=(value:string)=>value.replace(/~/g,'~0').replace(/\//g,'~1');
const unknown=(value:object,allowed:readonly string[])=>Object.keys(value).find(key=>!allowed.includes(key));
const scope=(part:string,message:string):PresentationFailure=>({ok:false,diagnostics:[{code:'PRESENTATION_LINI_MATRIX_SCOPE',path:path(part),message,severity:'error'}]});
const quote=(value:string,sourcePath:string)=>{try{return quoteLiniProfile(value);}catch(reason){throw Object.assign(new Error(reason instanceof Error?reason.message:'Text is outside the pinned Lini string subset.'),{sourcePath});}};
type Comparison=NonNullable<VisualDefs['comparison']>;
const style=(fontSize:number,width=1200)=>`width: ${width}; font-size: ${fontSize}; color: #243b45; fill: none; stroke: none; stroke-width: 0;`;
const slot=(row:number,column:number)=>`comparison-cell-r${row+1}-c${column+1}`;
/** Renderer estimate for wrapping notes into native text blocks; browser geometry remains the quality authority. */
function estimateMatrixTextWidth(value:string,fontSize=14):number{return Array.from(value).reduce((sum,char)=>sum+fontSize*(char===' '?0.28:/[ilI.,'`|]/u.test(char)?0.3:/[MW@#%&]/u.test(char)?0.85:0.56),0);}
function wrapMatrixText(text:string,prefix:string,maxWidth=1040,fontSize=14):string[]{
 const width=(value:string)=>estimateMatrixTextWidth(value,fontSize);
 const lines:string[]=[];for(const paragraph of `${prefix}${text}`.split('\n')){let line='';for(const word of paragraph.split(/\s+/u).filter(Boolean)){const next=line?`${line} ${word}`:word;if(line&&width(next)>maxWidth){lines.push(line);line=word;}else line=next;}if(line||paragraph==='')lines.push(line);}return lines.length?lines:[''];
}

/** Compile exact item-by-criterion values without inferring a winner or missing support. */
export function compileLiniMatrixPresentation(visual:Visual):PresentationPlan|PresentationFailure {
 try{return compile(visual);}catch(reason){
  const error=reason as Error&{sourcePath?:unknown},located=typeof error?.sourcePath==='string';
  return{ok:false,diagnostics:[{code:located?'PRESENTATION_LINI_MATRIX_TEXT':'PRESENTATION_LINI_MATRIX_INTERNAL',path:located?error.sourcePath as string:path('/comparison'),message:located&&error instanceof Error?error.message:'An internal native comparison matrix compilation error occurred; no projection was emitted.',severity:'error'}]};
 }
}

function compile(visual:Visual):PresentationPlan|PresentationFailure {
 if(visual.kind!=='comparison'||visual.form!=='matrix'||!visual.comparison)return scope('/comparison','A comparison/matrix payload is required.');
 const comparison=visual.comparison;
 const topUnknown=unknown(visual,['id','kind','form','title','question','takeaway','audience','source','omissions','annotations','groups','nodes','edges','steps','sequence','structure','state','timeline','comparison','metric','layout']);
 if(topUnknown)return scope('/'+ptr(topUnknown),'An unknown visual property is retained in the source but has no qualified matrix table mapping.');
 if(visual.layout!==undefined)return scope('/layout','The native table controls its own layout; authored layout directives are not silently reinterpreted.');
 for(const key of ['groups','nodes','edges','steps','sequence','structure','state','timeline','metric'] as const)if(visual[key]!==undefined)return scope('/'+key,'The bounded comparison table does not reinterpret another visual-family payload.');
 if(visual.annotations?.length&&visual.annotations.some(annotation=>unknown(annotation,['id','text'])))return scope('/annotations','An annotation contains properties without a qualified native table mapping.');
 const comparisonUnknown=unknown(comparison,['items','criteria','values','chosen','axes']);if(comparisonUnknown)return scope('/comparison/'+ptr(comparisonUnknown),'An unknown comparison property is retained but has no qualified matrix table mapping.');
 if(comparison.criteria.length===0)return scope('/comparison/criteria','At least one comparison criterion is required.');
 if(comparison.axes!==undefined)return scope('/comparison/axes','Quadrant axes are not part of a comparison matrix table.');
 if(comparison.chosen!==undefined){const extra=unknown(comparison.chosen,['item','reason']);if(extra)return scope('/comparison/chosen/'+ptr(extra),'An unknown chosen-item property has no qualified native choice mapping.');}
 if(comparison.criteria.length>40||comparison.values.length>4000)return scope('/comparison','The comparison exceeds this bounded native table profile.');

 for(const[index,item]of comparison.items.entries()){
  const extra=unknown(item,['id','label','detail']);if(extra)return scope(`/comparison/items/${index}/${ptr(extra)}`,'An unknown item property has no qualified matrix table mapping.');
 }
 for(const[index,criterion]of comparison.criteria.entries()){
  const extra=unknown(criterion,['id','label','detail','measure','max','low','high']);if(extra)return scope(`/comparison/criteria/${index}/${ptr(extra)}`,'An unknown criterion property has no qualified matrix table mapping.');
  if(!['text','support','rating'].includes(criterion.measure))return scope(`/comparison/criteria/${index}/measure`,'This matrix profile supports text, explicit numeric ratings, and yes/no/partial support values only.');
 }
 const itemIds=new Set(comparison.items.map(item=>item.id)),criteriaById=new Map(comparison.criteria.map(criterion=>[criterion.id,criterion])),valueByPair=new Map<string,{value:Comparison['values'][number];sourceIndex:number}>();
 if(comparison.chosen!==undefined&&!itemIds.has(comparison.chosen.item))return scope('/comparison/chosen/item','A chosen item must resolve to one declared comparison item.');
 const itemLabelCounts=new Map<string,number>();for(const item of comparison.items)itemLabelCounts.set(item.label,(itemLabelCounts.get(item.label)??0)+1);
 const criterionLabelCounts=new Map<string,number>();for(const criterion of comparison.criteria)criterionLabelCounts.set(criterion.label,(criterionLabelCounts.get(criterion.label)??0)+1);
 const itemDisplayLabel=(item:Comparison['items'][number])=>itemLabelCounts.get(item.label)!>1?`${item.label} (id: ${item.id})`:item.label;
 const criterionDisplayLabel=(criterion:Comparison['criteria'][number])=>criterionLabelCounts.get(criterion.label)!>1?`${criterion.label} (id: ${criterion.id})`:criterion.label;
 for(const[sourceIndex,value]of comparison.values.entries()){
  const extra=unknown(value,['item','criterion','text','support','rating','note']);if(extra)return scope(`/comparison/values/${sourceIndex}/${ptr(extra)}`,'An unknown value property has no qualified native cell mapping.');
  if(!itemIds.has(value.item)||!criteriaById.has(value.criterion))return scope(`/comparison/values/${sourceIndex}`,'Every value must resolve by its declared item and criterion IDs.');
  const key=JSON.stringify([value.item,value.criterion]);if(valueByPair.has(key))return scope(`/comparison/values/${sourceIndex}`,'Only one value may be supplied for each item/criterion pair.');
  const criterion=criteriaById.get(value.criterion)!;
  if(criterion.measure==='text'&&(value.text===undefined||value.support!==undefined||value.rating!==undefined))return scope(`/comparison/values/${sourceIndex}`,'Text criteria require exactly one authored text value.');
  if(criterion.measure==='support'&&(value.support===undefined||value.text!==undefined||value.rating!==undefined))return scope(`/comparison/values/${sourceIndex}`,'Support criteria require exactly one authored yes/no/partial value.');
  if(criterion.measure==='rating'&&(value.rating===undefined||value.text!==undefined||value.support!==undefined))return scope(`/comparison/values/${sourceIndex}`,'Rating criteria require exactly one authored numeric rating.');
  if(value.text!==undefined&&value.text.length===0)return scope(`/comparison/values/${sourceIndex}/text`,'An empty text value has no visible distinction from an unsupplied cell in this native profile.');
  valueByPair.set(key,{value,sourceIndex});
 }
 for(const item of comparison.items)for(const criterion of comparison.criteria)if(!valueByPair.has(JSON.stringify([item.id,criterion.id])))return scope('/comparison/values','This Visual comparison matrix profile requires one explicit value for every item/criterion pair; absence is not converted to “no”.');
 const columns=[300,...comparison.items.map(()=>420)],panelWidth=columns.reduce((sum,column)=>sum+column,0),contentWidth=panelWidth-48;
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
 if(comparison.chosen!==undefined)quoteAt(comparison.chosen.reason,'/comparison/chosen/reason');
 if(visual.takeaway!==undefined)quoteAt(visual.takeaway,'/takeaway');
 for(const[index,note]of(visual.omissions??[]).entries())quoteAt(note,`/omissions/${index}`);
 for(const[index,annotation]of(visual.annotations??[]).entries())quoteAt(annotation.text,`/annotations/${index}/text`);

 add(visual.id,titlePath,'comparison-title','visual');
 if(visual.title!==undefined&&visual.question!==visual.title)add(visual.id,'/question','comparison-question','visual');
 if(visual.takeaway!==undefined)add(visual.id,'/takeaway','comparison-takeaway','visual');
 comparison.items.forEach((item,index)=>{const nativeId=`comparison-item-${index+1}`;for(const field of ['id','label'] as const)if(item[field]!==undefined)add(item.id,`/comparison/items/${index}/${field}`,nativeId,'comparison-item');});
 comparison.criteria.forEach((criterion,index)=>{const nativeId=`comparison-criterion-${index+1}`;for(const field of ['id','label','max'] as const)if(criterion[field]!==undefined)add(criterion.id,`/comparison/criteria/${index}/${field}`,nativeId,'comparison-criterion');});
 if(comparison.chosen!==undefined){add(comparison.chosen.item,`/comparison/chosen/item`,`comparison-choice`,'comparison-choice');add(comparison.chosen.item,`/comparison/chosen/reason`,`comparison-choice`,'comparison-choice');}

 const tableCells:string[]=[],noteBlocks:string[]=[];
 const putWrapped=(nativeId:string,text:string,prefix:string,sourceSuffix:string,logicalId:string)=>{const lines=wrapMatrixText(text,prefix,contentWidth,14);add(logicalId,sourceSuffix,nativeId,sourceSuffix.includes('/values/')?'comparison-value':sourceSuffix.includes('/items/')?'comparison-item':'comparison-criterion');noteBlocks.push(`  |block#${nativeId}| ${quote(lines.join('\n'),path(sourceSuffix))} { ${style(14,contentWidth)} }`);};
 const putCell=(nativeId:string,value:string,sourceSuffix?:string,maxWidth=370)=>{
  const display=wrapMatrixText(value,'',maxWidth).join('\n');
  tableCells.push(`|cell#${nativeId}| ${quote(display,sourceSuffix?path(sourceSuffix):path('/comparison'))};`);
 };
 putCell(slot(0,0),'Criterion',undefined,250);
 comparison.items.forEach((item,index)=>{
  putCell(`comparison-item-${index+1}`,itemDisplayLabel(item),`/comparison/items/${index}/label`,360);
  if(item.detail!==undefined)putWrapped(`comparison-item-detail-${index+1}`,item.detail,`Item detail (${itemDisplayLabel(item)}): `,`/comparison/items/${index}/detail`,item.id);
 });
 for(const[criterionIndex,criterion]of comparison.criteria.entries()){
  const row=criterionIndex+1,parts=[criterionDisplayLabel(criterion),criterion.max===undefined?undefined:`Maximum: ${String(criterion.max)}`].filter((part):part is string=>part!==undefined);
  putCell(`comparison-criterion-${criterionIndex+1}`,parts.join('\n'),`/comparison/criteria/${criterionIndex}/label`,250);
  for(const[field,value]of[['detail',criterion.detail],['low',criterion.low],['high',criterion.high]] as const)if(value!==undefined)putWrapped(`comparison-criterion-${criterionIndex+1}-${field}`,value,`${field[0]!.toUpperCase()+field.slice(1)} (${criterionDisplayLabel(criterion)}): `,`/comparison/criteria/${criterionIndex}/${field}`,criterion.id);
  for(const[itemIndex,item]of comparison.items.entries()){
   const relation=valueByPair.get(JSON.stringify([item.id,criterion.id]))!,rowSlot=slot(row,itemIndex+1);
   const value=relation.value,content=value.text!==undefined?value.text:value.support!==undefined?value.support:String(value.rating),nativeId=rowSlot,logicalId=JSON.stringify([item.id,criterion.id]);
   const valueField=value.text!==undefined?'text':value.support!==undefined?'support':'rating';
   const valuePath=`/comparison/values/${relation.sourceIndex}/${valueField}`;
   putCell(nativeId,content,valuePath,380);
   add(logicalId,`/comparison/values/${relation.sourceIndex}`,nativeId,'comparison-value');
   add(item.id,`/comparison/values/${relation.sourceIndex}/item`,nativeId,'comparison-value');
   add(criterion.id,`/comparison/values/${relation.sourceIndex}/criterion`,nativeId,'comparison-value');
   add(criterion.id,`/comparison/criteria/${criterionIndex}/measure`,nativeId,'comparison-criterion');
   add(logicalId,valuePath,nativeId,'comparison-value');
  if(value.note!==undefined)putWrapped(`comparison-value-note-${relation.sourceIndex+1}`,value.note,`Note (${criterionDisplayLabel(criterion)} · ${itemDisplayLabel(item)}): `,`/comparison/values/${relation.sourceIndex}/note`,logicalId);
  }
 }
 if(visual.source)omissions.push({sourcePath:path('/source'),reason:'Source locator and digest are retained in UMF; they do not independently verify the historical comparison claims.'});
 if(visual.audience)omissions.push({sourcePath:path('/audience'),reason:'Audience metadata is retained in UMF and does not alter the comparison values.'});
 if(visual.omissions)for(const[index]of visual.omissions.entries())add(visual.id,`/omissions/${index}`,`comparison-note-${index+1}`,'annotation');
 if(visual.annotations)for(const[index,annotation]of visual.annotations.entries()){add(annotation.id,`/annotations/${index}/id`,`comparison-annotation-${index+1}`,'annotation');add(annotation.id,`/annotations/${index}/text`,`comparison-annotation-${index+1}`,'annotation');}

 const chosenItem=comparison.chosen===undefined?undefined:comparison.items.find(item=>item.id===comparison.chosen!.item)!;
 const choiceText=comparison.chosen===undefined?undefined:`Selected: ${itemLabelCounts.get(chosenItem!.label)!>1?`${chosenItem!.label} (id: ${chosenItem!.id})`:chosenItem!.label}\nReason: ${comparison.chosen.reason}`;
 const source=['{ font-family: Arial; --lini-font-family: Arial; --muted: #243b45;','  .lini-text { font-family: Arial; }','  .lini-table { color: #243b45; }','}',`|column#comparison-panel| { width: ${panelWidth}; gap: 18; padding: 24; fill: none; stroke: none; stroke-width: 0; } [`,
  `  |block#comparison-title| ${quote(wrapMatrixText(title,'',contentWidth,26).join('\n'),path(titlePath))} { ${style(26,contentWidth)} font-weight: bold; }`,
  visual.title!==undefined&&visual.question!==visual.title?`  |block#comparison-question| ${quote(wrapMatrixText(visual.question,'',contentWidth,16).join('\n'),path('/question'))} { ${style(16,contentWidth)} }`:undefined,
  `  |table#comparison-table| { columns: ${columns.join(', ')}; } [`,
  ...tableCells.map(cell=>'    '+cell),
  '  ]',
  choiceText!==undefined?`  |block#comparison-choice| ${quote(wrapMatrixText(choiceText,'',contentWidth,16).join('\n'),path('/comparison/chosen/reason'))} { ${style(16,contentWidth)} font-weight: bold; }`:undefined,
  visual.takeaway!==undefined?`  |block#comparison-takeaway| ${quote(wrapMatrixText(visual.takeaway,'',contentWidth,16).join('\n'),path('/takeaway'))} { ${style(16,contentWidth)} font-weight: bold; }`:undefined,
  ...noteBlocks,
  ...(visual.omissions??[]).map((note,index)=>`  |block#comparison-note-${index+1}| ${quote(wrapMatrixText(note,'',contentWidth).join('\n'),path('/omissions/'+index))} { ${style(14,contentWidth)} }`),
  ...(visual.annotations??[]).map((annotation,index)=>`  |block#comparison-annotation-${index+1}| ${quote(wrapMatrixText(annotation.text,'',contentWidth).join('\n'),path('/annotations/'+index+'/text'))} { ${style(14,contentWidth)} }`),
  ']'
 ].filter((line):line is string=>line!==undefined).join('\n')+'\n';
 const approximations=[{sourcePath:path('/comparison'),requested:'Authored comparison matrix with typed text, rating, and support criteria',representation:'A native table uses item declaration order for columns and criterion declaration order for rows. Exact text, numeric rating, and yes/no/partial support values remain in their mapped cells; criterion measure and optional maximum/low/high labels remain explicit in UMF and are represented through their typed native values or visible labels. An explicitly authored chosen item and reason are shown as written. No ranking, score normalization, winner, current-state claim, or missing value is inferred.'}];
 return{ok:true,profileId:'umf.visual.presentation/1',backend:'lini',nativeFormat:'lini',source,elementMap:elements,omissions,approximations};
}
