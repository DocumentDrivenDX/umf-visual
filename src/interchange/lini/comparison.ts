// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Visual} from '../../extensions/visual';
import type {VisualDefs} from '../../extensions/visual/generated';
import {VISUAL_PATH,interchangeDiagnostic} from '../shared';
import type {InterchangeDiagnostic} from '../types';
import type {NativeLocator,ProjectionCoverage} from '../annotations';
import type {LiniProfileNode,LiniProfileToken} from './profile-syntax';
import {quoteLiniProfile} from './profile-syntax';

export type LiniComparisonForm='matrix'|'before-after'|'quadrant';
export type LiniComparisonIdentityKind='item'|'criterion'|'value';
export interface LiniComparisonIdentityMapping {kind:LiniComparisonIdentityKind;nativeId:string;visualId:string;path:string;sourcePath?:string;}
export interface LiniComparisonSerializeResult {statements:string[];identityMap:LiniComparisonIdentityMapping[];coverage:ProjectionCoverage[];diagnostics:InterchangeDiagnostic[];}
export interface LiniComparisonParseResult {comparison?:VisualDefs['comparison'];identityMap:LiniComparisonIdentityMapping[];coverage:ProjectionCoverage[];diagnostics:InterchangeDiagnostic[];}

type Comparison=VisualDefs['comparison'];
type Measure=Comparison['criteria'][number]['measure'];
type ComparisonValue=Comparison['values'][number];
const ROOT=VISUAL_PATH+'/comparison',p=(suffix:string)=>ROOT+suffix,quote=quoteLiniProfile;
const diagnostic=(code:string,at:string,message:string,severity:'warning'|'error'='warning',loss=true):InterchangeDiagnostic=>interchangeDiagnostic(code,at,message,{severity,loss});
const covers=(at:string,aspects:ProjectionCoverage['aspect'][],native:NativeLocator):ProjectionCoverage[]=>aspects.map(aspect=>({path:at,aspect,representation:'native-concept',native:[native]}));
const validId=(id:string)=>id.length<=128&&/^[a-z0-9]+(?:[_-]+[a-z0-9]+)*$/.test(id);
const encode=(prefix:string,id:string)=>prefix+[...id].map(c=>c.codePointAt(0)!.toString(16).padStart(2,'0')).join('');
const decode=(value:string,prefix:string):string|undefined=>{if(!value.startsWith(prefix))return;const hex=value.slice(prefix.length);if(!hex||hex.length%2||!/^[0-9a-f]+$/.test(hex))return;let id='';for(let i=0;i<hex.length;i+=2)id+=String.fromCharCode(Number.parseInt(hex.slice(i,i+2),16));return validId(id)?id:undefined;};
const decodeCellId=(value:string,prefix:string,suffix:string):string|undefined=>value.endsWith(suffix)?decode(value.slice(0,-suffix.length),prefix):undefined;
const finite=(value:number)=>Number.isFinite(value),num=(value:number)=>Object.is(value,-0)?'-0':String(value);
const trimNative=(value:string)=>value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu,'');
const textSafe=(value:string)=>{try{quote(value);return true;}catch{return false;}};
const jsonText=(value:string)=>JSON.stringify(value);
const absent='∅';

function fail(diagnostics:InterchangeDiagnostic[],code:string,at:string,message:string){diagnostics.push(diagnostic(code,at,message,'error',false));}
function warnTrim(diagnostics:InterchangeDiagnostic[],value:string,at:string){if(trimNative(value)!==value)diagnostics.push(diagnostic('LINI_COMPARISON_TRIM',at,'Pinned Lini trims boundary whitespace from visible labels.'));}
function textField(value:string,at:string,diagnostics:InterchangeDiagnostic[],trim=true){if(!textSafe(value))fail(diagnostics,'LINI_COMPARISON_TEXT',at,'Text contains characters outside the pinned Lini string subset.');if(trim)warnTrim(diagnostics,value,at);}
function cell(id:string,label:string):string{return'|cell#'+id+'| '+quote(label)+';';}
function wrapText(value:string,max:number):string{
 if(value.includes('\n'))return value;
 const pieces=value.split(/( +)/),out:string[]=[];let column=0;
 for(let i=0;i<pieces.length;i++){
  const piece=pieces[i]!;
  if(/^ +$/.test(piece)&&piece===' '&&pieces[i+1]&&column+1+pieces[i+1]!.length>max&&column>max*0.4){out.push('\n');column=0;continue;}
  out.push(piece);const last=piece.lastIndexOf('\n');column=last>=0?piece.length-last:column+piece.length;
 }
 return out.join('');
}
function wrappedCell(id:string,label:string,max:number):string{return cell(id,wrapText(label,max));}
function unwrapText(value:string):string{return value.replace(/\n/g,' ');}
function table(id:string,title:string,widths:number[],cells:string[]):string[]{return['|table#'+id+'| '+quote(title)+' { columns: '+widths.join(', ')+'; } [',...cells.map(value=>'  '+value),']'];}
function token(node:LiniProfileNode,name:string):LiniProfileToken[]|undefined{return node.properties.find(property=>property.name===name)?.value;}
function onlyProperties(node:LiniProfileNode,names:readonly string[],diagnostics:InterchangeDiagnostic[]):void{for(const property of node.properties)if(!names.includes(property.name))fail(diagnostics,'LINI_COMPARISON_PROPERTY','/source','Unsupported native property '+JSON.stringify(property.name)+'.');}
function idCell(id:string,kind:'item'|'criterion',suffix:string):string{return kind+'_'+encode(kind==='item'?'i_':'c_',id)+'_'+suffix;}
function criterionMetaCells(criterion:Comparison['criteria'][number],_index:number):string[]{const id=encode('criterion_',criterion.id);return[
 cell(id+'_id','id: '+criterion.id),wrappedCell(id+'_label',criterion.label,28),cell(id+'_measure','measure: '+criterion.measure),cell(id+'_max','max: '+(criterion.max===undefined?absent:num(criterion.max))),wrappedCell(id+'_low','low: '+(criterion.low===undefined?absent:jsonText(criterion.low)),27),wrappedCell(id+'_high','high: '+(criterion.high===undefined?absent:jsonText(criterion.high)),27),wrappedCell(id+'_detail','detail: '+(criterion.detail===undefined?absent:jsonText(criterion.detail)),50)];}
function itemMetaCells(item:Comparison['items'][number]):string[]{const id=encode('item_',item.id);return[cell(id+'_id','id: '+item.id),wrappedCell(id+'_label',item.label,36),wrappedCell(id+'_detail','detail: '+(item.detail===undefined?absent:jsonText(item.detail)),100)];}
function widthList(count:number,first=140,rest=240):number[]{return[first,...Array.from({length:count-1},()=>rest)];}
function tableCells(tableNode:LiniProfileNode,width:number,diagnostics:InterchangeDiagnostic[]):LiniProfileNode[][]{
 onlyProperties(tableNode,['columns'],diagnostics);const cells=tableNode.children;
 if(cells.some(item=>item.type!=='cell'||item.children.length||item.properties.length||item.label===undefined))fail(diagnostics,'LINI_COMPARISON_CELL','/source','Comparison tables contain only labeled native cells.');
 if(width<1||cells.length===0||cells.length%width!==0)fail(diagnostics,'LINI_COMPARISON_TABLE','/source','Table cells do not form a complete rectangular matrix.');
 const rows:LiniProfileNode[][]=[];for(let i=0;i<cells.length;i+=width)rows.push(cells.slice(i,i+width));return rows;
}
function colWidths(node:LiniProfileNode):number[]{const tokens=token(node,'columns');if(!tokens)return[];const values:number[]=[];for(const item of tokens){if(item.kind==='number')values.push(Number(item.value));else if(item.kind==='symbol'&&item.value===',')continue;else return[];}return values.every(value=>finite(value)&&value>0)?values:[];}
function valueText(value:ComparisonValue|undefined,measure:Measure):string{
 if(!value)return absent;
 if(measure==='text')return value.text===undefined?absent:'text: '+jsonText(value.text);
 if(measure==='support')return value.support===undefined?absent:'support: '+value.support;
 return value.rating===undefined?absent:'rating: '+num(value.rating);
}
function noteText(value:ComparisonValue|undefined):string{return value?.note===undefined?absent:'note: '+jsonText(value.note);}
function comparisonCellDisplay(value:ComparisonValue|undefined,measure:Measure):string{const content=valueText(value,measure),note=noteText(value);return content===absent?note:note===absent?content:content+'\nnote: '+jsonText(value!.note!);}
function readJsonString(text:string,prefix:string):string|undefined{if(!text.startsWith(prefix))return;try{const value=JSON.parse(text.slice(prefix.length));return typeof value==='string'?value:undefined;}catch{return;}}
function readMarker(text:string,prefix:string):string|undefined{if(!text.startsWith(prefix))return;const value=text.slice(prefix.length);return value===absent?undefined:value;}
function itemRows(c:Comparison):Map<string,ComparisonValue|undefined>{const values=new Map<string,ComparisonValue>();for(const value of c.values)values.set(value.item+'\0'+value.criterion,value);return values;}

interface Ready {visual:Visual;form:LiniComparisonForm;comparison:Comparison;}
function preflight(visual:Visual):{ready?:Ready;diagnostics:InterchangeDiagnostic[]} {
 const diagnostics:InterchangeDiagnostic[]=[],reject=(code:string,at:string,message:string)=>fail(diagnostics,code,at,message);
 if(visual.kind!=='comparison'||!['matrix','before-after','quadrant'].includes(visual.form)){reject('LINI_COMPARISON_FORM',VISUAL_PATH+'/form','Lini comparison profile accepts matrix, before-after, and quadrant forms only.');return{diagnostics};}
 const comparison=visual.comparison;if(!comparison){reject('LINI_COMPARISON_REQUIRED',ROOT,'Comparison content is required.');return{diagnostics};}
 const form=visual.form as LiniComparisonForm;
 if(!comparison.items.length||!comparison.criteria.length)reject('LINI_COMPARISON_SIZE',ROOT,'Comparison needs items and criteria.');
 if(comparison.items.length>100||comparison.criteria.length>40||comparison.values.length>4000)reject('LINI_COMPARISON_SIZE',ROOT,'Comparison exceeds the bounded native profile.');
 if(form==='before-after'&&comparison.items.length!==2)reject('LINI_COMPARISON_ITEMS',p('/items'),'Before-after profile requires exactly two items.');
 const ids=new Set<string>();for(const[kind,list]of [['item',comparison.items],['criterion',comparison.criteria]] as const){const set=new Set<string>();list.forEach((entry,index)=>{const at=p('/'+(kind==='item'?'items':'criteria')+'/'+index);if(!validId(entry.id))reject('LINI_COMPARISON_ID',at+'/id',kind+' ID is outside the reversible visual ID grammar.');if(set.has(entry.id))reject('LINI_COMPARISON_ID',at+'/id',kind+' IDs must be unique.');set.add(entry.id);textField(entry.label,at+'/label',diagnostics);if(entry.detail!==undefined)textField(entry.detail,at+'/detail',diagnostics);ids.add(kind+':'+entry.id);});}
 const criteria=new Map(comparison.criteria.map(item=>[item.id,item])),items=new Set(comparison.items.map(item=>item.id)),pairs=new Set<string>();
 comparison.criteria.forEach((criterion,index)=>{const at=p('/criteria/'+index);if(criterion.measure==='rating'){if(criterion.max===undefined||!finite(criterion.max)||criterion.max<0)reject('LINI_COMPARISON_MAX',at+'/max','Rating criteria need a finite nonnegative maximum.');}else if(criterion.max!==undefined&&(!finite(criterion.max)||criterion.max<0))reject('LINI_COMPARISON_MAX',at+'/max','Criterion maximum must be finite and nonnegative.');});
 comparison.values.forEach((value,index)=>{
  const at=p('/values/'+index),criterion=criteria.get(value.criterion);if(!items.has(value.item)||!criterion)reject('LINI_COMPARISON_REFERENCE',at,'Value must reference declared item and criterion IDs.');
  const key=value.item+'\0'+value.criterion;if(pairs.has(key))reject('LINI_COMPARISON_DUPLICATE',at,'Only one value may exist for each item and criterion.');pairs.add(key);
  const presence=[value.text!==undefined,value.rating!==undefined,value.support!==undefined].filter(Boolean).length;
  if(presence>1)reject('LINI_COMPARISON_VALUE',at,'A value has exactly one typed value form.');
  if(criterion){if(criterion.measure==='text'&&(value.text===undefined||value.rating!==undefined||value.support!==undefined))reject('LINI_COMPARISON_VALUE',at,'Text criterion values must have only a text value.');if(criterion.measure==='support'&&(value.support===undefined||value.text!==undefined||value.rating!==undefined))reject('LINI_COMPARISON_VALUE',at,'Support criterion values must have only a support value.');if(criterion.measure==='rating'&&(value.rating===undefined||value.text!==undefined||value.support!==undefined))reject('LINI_COMPARISON_VALUE',at,'Rating criterion values must have only a rating value.');}
  if(value.text!==undefined)textField(value.text,at+'/text',diagnostics,false);if(value.note!==undefined)textField(value.note,at+'/note',diagnostics,false);
  if(value.rating!==undefined&&(!finite(value.rating)||value.rating<0||criterion?.max!==undefined&&value.rating>criterion.max))reject('LINI_COMPARISON_RATING',at+'/rating','Rating must be finite and within its criterion scale.');
  if(value.support!==undefined&&!['yes','no','partial'].includes(value.support))reject('LINI_COMPARISON_SUPPORT',at+'/support','Support value must be yes, no, or partial.');
 });
 if(comparison.chosen&&!items.has(comparison.chosen.item))reject('LINI_COMPARISON_CHOSEN',p('/chosen/item'),'Chosen item must exist.');
 if(comparison.chosen)textField(comparison.chosen.reason,p('/chosen/reason'),diagnostics,false);
 if(form==='quadrant'){
  if(!comparison.axes)reject('LINI_COMPARISON_AXES',p('/axes'),'Quadrant form requires declared x and y axes.');
  if(comparison.criteria.length!==2||!comparison.axes||new Set([comparison.axes.x,comparison.axes.y]).size!==2||!criteria.has(comparison.axes.x)||!criteria.has(comparison.axes.y))reject('LINI_COMPARISON_AXES',p('/axes'),'Quadrant subset requires exactly two distinct declared rating criteria.');
  if(comparison.criteria.some(criterion=>criterion.measure!=='rating'))reject('LINI_COMPARISON_AXES',p('/criteria'),'Quadrant axes must both be rating criteria.');
  if(comparison.values.length!==comparison.items.length*2||comparison.items.some(item=>!comparison.axes||!pairs.has(item.id+'\0'+comparison.axes.x)||!pairs.has(item.id+'\0'+comparison.axes.y)))reject('LINI_COMPARISON_COORDINATES',p('/values'),'Every quadrant item must have exactly one rating on each axis.');
 }
 if(visual.title!==undefined)textField(visual.title,VISUAL_PATH+'/title',diagnostics);
 if(visual.question!==undefined)textField(visual.question,VISUAL_PATH+'/question',diagnostics);
 return diagnostics.some(item=>item.severity==='error')?{diagnostics}:{ready:{visual,form,comparison},diagnostics};
}

function matrixStatements(ready:Ready,identityMap:LiniComparisonIdentityMapping[],coverage:ProjectionCoverage[]):string[]{
 const{visual,comparison}=ready,values=itemRows(comparison),heading=visual.title??visual.question,rows:string[]=[],profileId='comparison-matrix';
 const shapeCells:string[]=[];
 if(ready.form==='matrix'){
  shapeCells.push(cell('comparison-shape-header-item','Item'));
  for(const criterion of comparison.criteria)shapeCells.push(wrappedCell('comparison-shape-header-'+encode('criterion_',criterion.id),criterion.label,28));
  for(const item of comparison.items){shapeCells.push(wrappedCell('comparison-shape-item-'+encode('item_',item.id),item.label,32));for(const criterion of comparison.criteria){const value=values.get(item.id+'\0'+criterion.id);shapeCells.push(wrappedCell('comparison-shape-value-'+encode('value_',item.id)+'_'+encode('criterion_',criterion.id),comparisonCellDisplay(value,criterion.measure),34));}}
 }else{
  const before=comparison.items[0]!,after=comparison.items[1]!;shapeCells.push(cell('comparison-shape-header-criterion','Criterion'),wrappedCell('comparison-shape-header-before','Before: '+before.label,30),wrappedCell('comparison-shape-header-after','After: '+after.label,30));
  for(const criterion of comparison.criteria){shapeCells.push(wrappedCell('comparison-shape-criterion-'+encode('criterion_',criterion.id),criterion.label,30));for(const item of [before,after])shapeCells.push(wrappedCell('comparison-shape-value-'+encode('value_',item.id)+'_'+encode('criterion_',criterion.id),comparisonCellDisplay(values.get(item.id+'\0'+criterion.id),criterion.measure),42));}
 }
 const shapeWidths=ready.form==='matrix'?widthList(comparison.criteria.length+1,260,520):[300,620,620];
 const shapeTable=table('comparison-matrix',ready.form==='matrix'?'Comparison matrix':'Before and after',shapeWidths,shapeCells);
 const criterionCells=['ID','Criterion','Measure','Maximum','Low','High','Detail'].map((label,index)=>cell('criterion-header-'+index,label));
 criterionCells.push(...comparison.criteria.flatMap((criterion,index)=>criterionMetaCells(criterion,index)));
 const criterionTable=table('comparison-criteria','Criterion definitions',[120,280,170,120,230,230,440],criterionCells);
 comparison.criteria.forEach((criterion,index)=>{const id=encode('criterion_',criterion.id),base=p('/criteria/'+index),loc={id:id+'_id',slot:'cell#'+id+'_id'};identityMap.push({kind:'criterion',nativeId:loc.id,visualId:criterion.id,path:base+'/id',sourcePath:loc.slot});coverage.push(...covers(base+'/id',['identity'],loc),...covers(base+'/label',['value'],{id:id+'_label',slot:'cell#'+id+'_label'}),...covers(base+'/measure',['value'],{id:id+'_measure',slot:'cell#'+id+'_measure'}));for(const field of ['max','low','high','detail'] as const)if(criterion[field]!==undefined)coverage.push(...covers(base+'/'+field,['value'],{id:id+'_'+field,slot:'cell#'+id+'_'+field}));});
 const itemCells=[cell('comparison-item-header-id','ID'),cell('comparison-item-header-label','Item'),cell('comparison-item-header-detail','Detail')],valueHeader=[cell('matrix-header-item','Item ID'),cell('matrix-header-criterion','Criterion ID'),cell('matrix-header-order','Order')],valueRows:string[]=[];
 comparison.items.forEach((item,itemIndex)=>{
  const native=encode('item_',item.id),base=p('/items/'+itemIndex),idLoc={id:native+'_id',slot:'cell#'+native+'_id'},labelLoc={id:native+'_label',slot:'cell#'+native+'_label'},detailLoc={id:native+'_detail',slot:'cell#'+native+'_detail'};
  itemCells.push(cell(native+'_id','id: '+item.id),wrappedCell(native+'_label',item.label,36),wrappedCell(native+'_detail','detail: '+(item.detail===undefined?absent:jsonText(item.detail)),100));
  identityMap.push({kind:'item',nativeId:idLoc.id,visualId:item.id,path:base+'/id',sourcePath:idLoc.slot});coverage.push(...covers(base+'/id',['identity'],idLoc),...covers(base+'/label',['value'],labelLoc));if(item.detail!==undefined)coverage.push(...covers(base+'/detail',['value'],detailLoc));
  comparison.criteria.forEach(criterion=>{
   const key=item.id+'\0'+criterion.id,value=values.get(key),present=values.has(key),valueId='comparison-shape-value-'+encode('value_',item.id)+'_'+encode('criterion_',criterion.id),pathIndex=comparison.values.findIndex(row=>row.item===item.id&&row.criterion===criterion.id),orderId=encode('value_',item.id)+'_'+encode('criterion_',criterion.id)+'_order',at=p('/values/'+pathIndex),valueLocator={id:valueId,slot:'cell#'+valueId},noteLocator={id:valueId,slot:'cell#'+valueId};
   if(present)valueRows.push(cell(valueId+'_item','item: '+item.id),cell(valueId+'_criterion','criterion: '+criterion.id),cell(orderId,'order: '+pathIndex));
   if(value){identityMap.push({kind:'value',nativeId:valueId,visualId:item.id+':'+criterion.id,path:at,sourcePath:valueLocator.slot});coverage.push(...covers(at,['presence','value'],valueLocator),...(value.note===undefined?[]:covers(at+'/note',['value'],noteLocator)));}
  });
 });
 const itemTable=table('comparison-items','Item identities and descriptions',[150,320,980],itemCells),matrix=table('comparison-value-details','Value identity and source order',[280,280,160],[...valueHeader,...valueRows]);
 const cells=[...shapeTable,...criterionTable,...itemTable,...matrix].map(line=>'  '+line);
 if(comparison.chosen){const item=comparison.items.find(row=>row.id===comparison.chosen!.item)!;const id='chosen_'+encode('item_',item.id),choice=table('comparison-choice','Decision',[220,1200],[cell('choice-header-item','Chosen item'),cell('choice-header-reason','Reason'),cell(id,'id: '+item.id),wrappedCell('chosen-reason','reason: '+jsonText(comparison.chosen.reason),130)]);cells.push(...choice.map(line=>'  '+line));const loc={id,slot:'cell#'+id};coverage.push(...covers(p('/chosen/item'),['identity','value'],loc),...covers(p('/chosen/reason'),['value'],{id:'chosen-reason',slot:'cell#chosen-reason'}));}
 rows.push('|group#'+profileId+'-profile| '+quote(heading)+' { layout: grid; columns: repeat(1); gap: 28; padding: 16; } [',...cells,']');
 coverage.push(...covers(p('/items'),['presence','order'],{id:'comparison-matrix',slot:'table#comparison-matrix/item-rows'}),...covers(p('/criteria'),['presence','order'],{id:'comparison-matrix',slot:'table#comparison-matrix/criterion-columns'}),...covers(p('/values'),['presence','order'],{id:'comparison-value-details',slot:'table#comparison-value-details/value-cells'}));
 return rows;
}

function metadataTables(comparison:Comparison,identityMap:LiniComparisonIdentityMapping[],coverage:ProjectionCoverage[]):string[][] {
 const criterionCells=[...['ID','Criterion','Measure','Maximum','Low','High','Detail'].map((label,index)=>cell('axis-header-'+index,label)),...comparison.criteria.flatMap(criterion=>criterionMetaCells(criterion,0))];
 const criteria=table('quadrant-criteria','Axis meanings',widthList(7,100,210),criterionCells);
 comparison.criteria.forEach((criterion,index)=>{const native=encode('criterion_',criterion.id),base=p('/criteria/'+index),loc={id:native+'_id',slot:'cell#'+native+'_id'};identityMap.push({kind:'criterion',nativeId:loc.id,visualId:criterion.id,path:base+'/id',sourcePath:loc.slot});coverage.push(...covers(base+'/id',['identity'],loc),...covers(base+'/label',['value'],{id:native+'_label',slot:'cell#'+native+'_label'}),...covers(base+'/measure',['value'],{id:native+'_measure',slot:'cell#'+native+'_measure'}));for(const field of ['max','low','high','detail'] as const)if(criterion[field]!==undefined)coverage.push(...covers(base+'/'+field,['value'],{id:native+'_'+field,slot:'cell#'+native+'_'+field}));});
 const itemCells=[cell('quadrant-item-header-id','Item ID'),cell('quadrant-item-header-label','Item'),cell('quadrant-item-header-detail','Detail')];
 comparison.items.forEach((item,index)=>{const native=encode('qitem_',item.id),base=p('/items/'+index);itemCells.push(cell(native+'_id','id: '+item.id),cell(native+'_label',item.label),cell(native+'_detail','detail: '+(item.detail===undefined?absent:jsonText(item.detail))));const loc={id:native+'_id',slot:'cell#'+native+'_id'};identityMap.push({kind:'item',nativeId:loc.id,visualId:item.id,path:base+'/id',sourcePath:loc.slot});coverage.push(...covers(base+'/id',['identity'],loc),...covers(base+'/label',['value'],{id:native+'_label',slot:'cell#'+native+'_label'}));if(item.detail!==undefined)coverage.push(...covers(base+'/detail',['value'],{id:native+'_detail',slot:'cell#'+native+'_detail'}));});
 const itemTable=table('quadrant-items','Items', [130,260,440],itemCells);
 const valueCells=[cell('quadrant-value-header-item','Item'),cell('quadrant-value-header-criterion','Criterion'),cell('quadrant-value-header-value','Rating'),cell('quadrant-value-header-note','Note'),cell('quadrant-value-header-order','Order')];
 comparison.values.forEach((value,index)=>{const item=comparison.items.find(row=>row.id===value.item)!,criterion=comparison.criteria.find(row=>row.id===value.criterion)!,id=encode('qvalue_',value.item)+'_'+encode('criterion_',value.criterion),base=p('/values/'+index),ratingLoc={id:id+'_rating',slot:'cell#'+id+'_rating'},itemLoc={id:id+'_item',slot:'cell#'+id+'_item'},criterionLoc={id:id+'_criterion',slot:'cell#'+id+'_criterion'},noteLoc={id:id+'_note',slot:'cell#'+id+'_note'},orderLoc={id:id+'_order',slot:'cell#'+id+'_order'};valueCells.push(wrappedCell(id+'_item','item: '+value.item+' · '+item.label,26),wrappedCell(id+'_criterion','criterion: '+value.criterion+' · '+criterion.label,30),cell(id+'_rating',valueText(value,criterion.measure)),cell(id+'_note',noteText(value)),cell(id+'_order','order: '+index));identityMap.push({kind:'value',nativeId:ratingLoc.id,visualId:value.item+':'+criterion.id,path:base,sourcePath:ratingLoc.slot});coverage.push(...covers(base+'/item',['identity'],itemLoc),...covers(base+'/criterion',['identity'],criterionLoc),...covers(base+'/rating',['value','presence'],ratingLoc),...covers(base,['order'],orderLoc),...(value.note===undefined?[]:covers(base+'/note',['value'],noteLoc)));});
 const values=table('quadrant-values','Ratings and notes',[260,340,180,440,120],valueCells);
 coverage.push(...covers(p('/criteria'),['presence','order'],{id:'quadrant-criteria',slot:'table#quadrant-criteria/rows'}),...covers(p('/items'),['presence','order'],{id:'quadrant-items',slot:'table#quadrant-items/rows'}),...covers(p('/values'),['presence','order'],{id:'quadrant-values',slot:'table#quadrant-values/rows'}));
 const tables=[criteria,itemTable,values];
 if(comparison.chosen){const item=comparison.items.find(row=>row.id===comparison.chosen!.item)!,chosen=table('quadrant-decision','Decision',[240,1200],[cell('quadrant-decision-header-item','Chosen item'),cell('quadrant-decision-header-reason','Reason'),cell('quadrant-chosen-item','id: '+item.id),wrappedCell('quadrant-chosen-reason','reason: '+jsonText(comparison.chosen.reason),110)]);tables.push(chosen);coverage.push(...covers(p('/chosen/item'),['identity','value'],{id:'quadrant-chosen-item',slot:'cell#quadrant-chosen-item'}),...covers(p('/chosen/reason'),['value'],{id:'quadrant-chosen-reason',slot:'cell#quadrant-chosen-reason'}));}
 return tables;
}
function ratingFor(comparison:Comparison,item:string,criterion:string):number{return comparison.values.find(value=>value.item===item&&value.criterion===criterion)!.rating!;}
function quadrantStatements(ready:Ready,identityMap:LiniComparisonIdentityMapping[],coverage:ProjectionCoverage[]):string[]{
 const{visual,comparison}=ready,axes=comparison.axes!,x=comparison.criteria.find(criterion=>criterion.id===axes.x)!,y=comparison.criteria.find(criterion=>criterion.id===axes.y)!,xAxis=encode('xaxis_',x.id),yAxis=encode('yaxis_',y.id),chartId='comparison-quadrant',title=visual.title??visual.question;
 const rows=['|group#comparison-quadrant-profile| '+quote(title)+' { layout: grid; columns: repeat(1); gap: 28; padding: 16; } [','  |chart#'+chartId+'| '+quote(title)+' { layout: chart; width: 760; height: 520; } [','    |axis#'+xAxis+'| '+quote(x.label)+' { range: 0 '+num(x.max!)+'; side: bottom; }','    |axis#'+yAxis+'| '+quote(y.label)+' { range: 0 '+num(y.max!)+'; side: left; }'];
 comparison.items.forEach((item,index)=>{const native=encode('bubble_',item.id),xValue=ratingFor(comparison,item.id,x.id),yValue=ratingFor(comparison,item.id,y.id),loc={id:native,slot:'bubble#'+native},base=p('/items/'+index);rows.push('    |bubble#'+native+'| '+quote(item.label)+' { at: '+num(xValue)+' '+num(yValue)+'; value: 1; }');identityMap.push({kind:'item',nativeId:native,visualId:item.id,path:base+'/id',sourcePath:loc.slot});coverage.push(...covers(base+'/id',['identity'],loc),...covers(base+'/label',['value'],loc));});
 rows.push('  ]');
 const tables=metadataTables(comparison,identityMap,coverage);for(const statement of tables.flat())rows.push('  '+statement);rows.push(']');
 comparison.items.forEach(item=>{for(const criterionId of [axes.x,axes.y]){const valueIndex=comparison.values.findIndex(value=>value.item===item.id&&value.criterion===criterionId),value=comparison.values[valueIndex]!,native=encode('qvalue_',value.item)+'_'+encode('criterion_',value.criterion);coverage.push(...covers(p('/values/'+valueIndex+'/rating'),['value'],{id:native+'_rating',slot:'cell#'+native+'_rating'}));}});
 coverage.push(...covers(p('/axes/x'),['identity','value'],{id:xAxis,slot:'axis#'+xAxis}),...covers(p('/axes/y'),['identity','value'],{id:yAxis,slot:'axis#'+yAxis}));
 return rows;
}

/** Serialize table and quadrant comparison subsets with visible typed values and exact ratings. */
export function serializeLiniComparison(visual:Visual):LiniComparisonSerializeResult {
 const checked=preflight(visual),identityMap:LiniComparisonIdentityMapping[]=[],coverage:ProjectionCoverage[]=[];
 if(!checked.ready)return{statements:[],identityMap,coverage,diagnostics:checked.diagnostics};
 const statements=checked.ready.form==='quadrant'?quadrantStatements(checked.ready,identityMap,coverage):matrixStatements(checked.ready,identityMap,coverage);
 return{statements,identityMap,coverage,diagnostics:checked.diagnostics};
}

function one(nodes:LiniProfileNode[],type:string,id:string):LiniProfileNode|undefined{const found=nodes.filter(node=>node.type===type&&node.id===id);return found.length===1?found[0]:undefined;}
function groups(nodes:LiniProfileNode[]):LiniProfileNode[]{return nodes.filter(node=>node.type==='group');}
function tablesIn(node:LiniProfileNode):LiniProfileNode[]{return node.children.filter(child=>child.type==='table');}
function field(text:string,prefix:string):string|undefined{return text.startsWith(prefix)?text.slice(prefix.length):undefined;}
function idValue(text:string,prefix:string):string|undefined{return field(text,prefix);}
function maybeString(text:string,prefix:string):{present:boolean;value?:string}|undefined{const value=field(text,prefix);if(value===undefined)return; if(value===absent)return{present:false};const parsed=readJsonString(text,prefix);return parsed===undefined?undefined:{present:true,value:parsed};}
function parseMetaTable(tableNode:LiniProfileNode|undefined,diagnostics:InterchangeDiagnostic[],prefix='criterion_',headerPrefix='criterion-header-'):Comparison['criteria'] {
 if(!tableNode){fail(diagnostics,'LINI_COMPARISON_CRITERIA','/source','Comparison requires a visible criterion metadata table.');return[];}
 const rows=tableCells(tableNode,7,diagnostics);if(rows.length<2){fail(diagnostics,'LINI_COMPARISON_CRITERIA','/source','Criterion metadata table requires headers and criteria.');return[];}
 if(rows[0]!.map(item=>item.label).join('\0')!=='ID\0Criterion\0Measure\0Maximum\0Low\0High\0Detail'||rows[0]!.some((item,index)=>item.id!==headerPrefix+index))fail(diagnostics,'LINI_COMPARISON_CRITERIA','/source','Criterion metadata headers must be exact and ordered.');
 const result:Comparison['criteria']=[],seen=new Set<string>();
 for(const[index,row]of rows.slice(1).entries()){
  const id=decodeCellId(row[0]!.id,prefix,'_id'),idText=idValue(row[0]!.label!,'id: '),label=unwrapText(row[1]!.label!),measureText=field(row[2]!.label!,'measure: '),measure=measureText as Measure;
  const maxText=field(row[3]!.label!,'max: '),low=maybeString(unwrapText(row[4]!.label!),'low: '),high=maybeString(unwrapText(row[5]!.label!),'high: '),detail=maybeString(unwrapText(row[6]!.label!),'detail: ');
  if(!id||idText!==id||!label||!['text','rating','support'].includes(measure)||maxText===undefined||!low||!high||!detail||seen.has(id)){fail(diagnostics,'LINI_COMPARISON_CRITERIA','/source','Criterion cells need a reversible unique ID and exact typed metadata.');continue;}
  seen.add(id);const max=maxText===absent?undefined:Number(maxText);if(max!==undefined&&!finite(max))fail(diagnostics,'LINI_COMPARISON_MAX','/source','Criterion maximum cell must be finite or absent.');
  result.push({id,label,measure,...(max===undefined?{}:{max}),...(low.present?{low:low.value!}:{}),...(high.present?{high:high.value!}:{}),...(detail.present?{detail:detail.value!}:{})});
 }
 return result;
}
function parseItemRow(row:LiniProfileNode[],diagnostics:InterchangeDiagnostic[],index:number,prefix='item_'):{id:string;label:string;detail?:string}|undefined{
 const id=decodeCellId(row[0]!.id,prefix,'_id'),idText=field(row[0]!.label!,'id: '),label=unwrapText(row[1]!.label!),detail=maybeString(unwrapText(row[2]!.label!),'detail: ');
 if(!id||idText!==id||label===undefined||!detail){fail(diagnostics,'LINI_COMPARISON_ITEM','/source','Item cells need a reversible ID, label, and explicit detail presence.');return;}
 return{id,label,...(detail.present?{detail:detail.value!}:{})};
}
function parseTypedValue(valueText:string,noteText:string,measure:Measure):Pick<ComparisonValue,'text'|'rating'|'support'|'note'>|undefined{
 valueText=unwrapText(valueText);noteText=unwrapText(noteText);
 const value=valueText===absent?undefined:valueText;
 let typed:Pick<ComparisonValue,'text'|'rating'|'support'>={};
 if(value!==undefined){if(measure==='text'){const text=readJsonString(value,'text: ');if(text===undefined)return;typed={text};}else if(measure==='support'){const support=field(value,'support: ');if(!support||!['yes','no','partial'].includes(support))return;typed={support:support as 'yes'|'no'|'partial'};}else{const ratingText=field(value,'rating: ');if(ratingText===undefined||!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(ratingText)||!finite(Number(ratingText)))return;typed={rating:Number(ratingText)};}}
 let note:string|undefined;if(noteText!==absent){note=readJsonString(noteText,'note: ');if(note===undefined)return;}
 return{...typed,...(note===undefined?{}:{note})};
}
function parseMatrix(nodes:LiniProfileNode[],form:LiniComparisonForm,diagnostics:InterchangeDiagnostic[],identityMap:LiniComparisonIdentityMapping[],coverage:ProjectionCoverage[]):Comparison|undefined{
 const group=nodes.length===1&&nodes[0]!.type==='group'&&nodes[0]!.id==='comparison-matrix-profile'?nodes[0]:undefined;
 if(!group){fail(diagnostics,'LINI_COMPARISON_SHAPE','/source','Comparison profile must be one declared group.');return;}
 onlyProperties(group,['layout','columns','gap','padding'],diagnostics);if(word(token(group,'layout'))!=='grid')fail(diagnostics,'LINI_COMPARISON_SHAPE','/source','Comparison container must use native grid layout.');
 const shapeTable=one(group.children,'table','comparison-matrix'),criteriaTable=one(group.children,'table','comparison-criteria'),itemTable=one(group.children,'table','comparison-items'),orderTable=one(group.children,'table','comparison-value-details'),choiceTable=one(group.children,'table','comparison-choice');
 if(group.children.some(child=>child.type!=='table'||![shapeTable,criteriaTable,itemTable,orderTable,choiceTable].includes(child)))fail(diagnostics,'LINI_COMPARISON_SHAPE','/source','Comparison group contains an unsupported native child.');
 const criteria=parseMetaTable(criteriaTable,diagnostics);if(!shapeTable||!itemTable||!orderTable){fail(diagnostics,'LINI_COMPARISON_SHAPE','/source','Comparison needs its primary matrix and identity/order appendices.');return;}
 criteria.forEach((criterion,index)=>{const id=encode('criterion_',criterion.id),at=p('/criteria/'+index),loc={id:id+'_id',slot:'cell#'+id+'_id'};identityMap.push({kind:'criterion',nativeId:loc.id,visualId:criterion.id,path:at+'/id',sourcePath:loc.slot});coverage.push(...covers(at+'/id',['identity'],loc),...covers(at+'/label',['value'],{id:id+'_label',slot:'cell#'+id+'_label'}),...covers(at+'/measure',['value'],{id:id+'_measure',slot:'cell#'+id+'_measure'}));for(const field of ['max','low','high','detail'] as const)if(criterion[field]!==undefined)coverage.push(...covers(at+'/'+field,['value'],{id:id+'_'+field,slot:'cell#'+id+'_'+field}));});
 const itemRowsParsed=tableCells(itemTable,3,diagnostics);if(itemRowsParsed.length<2||itemRowsParsed[0]!.map(item=>item.label).join('\0')!=='ID\0Item\0Detail'||itemRowsParsed[0]!.map(item=>item.id).join('\0')!=='comparison-item-header-id\0comparison-item-header-label\0comparison-item-header-detail')fail(diagnostics,'LINI_COMPARISON_ITEM','/source','Comparison needs its explicit item identity and detail table.');
 const items:Comparison['items']=[],itemIds=new Set<string>();
 for(const[rowIndex,row]of itemRowsParsed.slice(1).entries()){const parsed=parseItemRow(row,diagnostics,rowIndex);if(!parsed||itemIds.has(parsed.id)){fail(diagnostics,'LINI_COMPARISON_ITEM','/source','Item identities must be unique.');continue;}itemIds.add(parsed.id);items.push(parsed);const id=encode('item_',parsed.id),at=p('/items/'+rowIndex),loc={id:id+'_id',slot:'cell#'+id+'_id'};if(row[0]!.id!==id+'_id'||row[1]!.id!==id+'_label'||row[2]!.id!==id+'_detail')fail(diagnostics,'LINI_COMPARISON_ITEM','/source','Item identity, label and detail cells are out of order.');identityMap.push({kind:'item',nativeId:loc.id,visualId:parsed.id,path:at+'/id',sourcePath:loc.slot});coverage.push(...covers(at+'/id',['identity'],loc),...covers(at+'/label',['value'],{id:id+'_label',slot:'cell#'+id+'_label'}));if(parsed.detail!==undefined)coverage.push(...covers(at+'/detail',['value'],{id:id+'_detail',slot:'cell#'+id+'_detail'}));}
 const shapeRows=tableCells(shapeTable,form==='matrix'?criteria.length+1:3,diagnostics);
 if(form==='matrix'){
  const headers=shapeRows[0]!,expected=['Item',...criteria.map(item=>item.label)];if(shapeRows.length!==items.length+1||headers.map(item=>unwrapText(item.label??'')).join('\0')!==expected.join('\0')||headers[0]!.id!=='comparison-shape-header-item'||criteria.some((item,index)=>headers[index+1]!.id!=='comparison-shape-header-'+encode('criterion_',item.id)))fail(diagnostics,'LINI_COMPARISON_MATRIX','/source','Matrix must use item rows and ordered criterion columns.');
  for(const[index,row]of shapeRows.slice(1).entries()){const item=items[index];if(!item||row[0]!.id!=='comparison-shape-item-'+encode('item_',item.id)||unwrapText(row[0]!.label!)!==item.label)fail(diagnostics,'LINI_COMPARISON_MATRIX','/source','Matrix rows must visibly preserve item identity and order.');for(const[column,criterion]of criteria.entries()){const expectedId='comparison-shape-value-'+encode('value_',item?.id??'')+'_'+encode('criterion_',criterion.id);if(row[column+1]!.id!==expectedId)fail(diagnostics,'LINI_COMPARISON_MATRIX','/source','Matrix value cell identity does not match its row and column.');}}
 }else{
  const headers=shapeRows[0]!,before=items[0],after=items[1];if(items.length!==2||shapeRows.length!==criteria.length+1||headers[0]!.id!=='comparison-shape-header-criterion'||unwrapText(headers[0]!.label!)!=='Criterion'||headers[1]!.id!=='comparison-shape-header-before'||unwrapText(headers[1]!.label!)!=='Before: '+before?.label||headers[2]!.id!=='comparison-shape-header-after'||unwrapText(headers[2]!.label!)!=='After: '+after?.label)fail(diagnostics,'LINI_COMPARISON_BEFORE_AFTER','/source','Before-after table must preserve exactly two ordered item columns.');
  for(const[index,row]of shapeRows.slice(1).entries()){const criterion=criteria[index];if(!criterion||row[0]!.id!=='comparison-shape-criterion-'+encode('criterion_',criterion.id)||unwrapText(row[0]!.label!)!==criterion.label)fail(diagnostics,'LINI_COMPARISON_BEFORE_AFTER','/source','Before-after rows must preserve criterion identity and order.');for(const[column,item]of [before,after].entries())if(row[column+1]!.id!=='comparison-shape-value-'+encode('value_',item?.id??'')+'_'+encode('criterion_',criterion?.id??''))fail(diagnostics,'LINI_COMPARISON_BEFORE_AFTER','/source','Before-after value cells must match their item and criterion headers.');}
 }
 const orderRows=tableCells(orderTable,3,diagnostics);if(orderRows.length<1||orderRows[0]!.map(item=>item.label).join('\0')!=='Item ID\0Criterion ID\0Order'||orderRows[0]!.map(item=>item.id).join('\0')!=='matrix-header-item\0matrix-header-criterion\0matrix-header-order')fail(diagnostics,'LINI_COMPARISON_ORDER','/source','Value appendix must declare item, criterion and source order columns.');
 const orderedValues:Array<{order:number;value:ComparisonValue;nativeId:string}>=[],seenPairs=new Set<string>();
 for(const[index,row]of orderRows.slice(1).entries()){
  if(row.length!==3||row.some(item=>item.label===undefined)){fail(diagnostics,'LINI_COMPARISON_ORDER','/source','Value order rows must have three labeled cells.');continue;}
  const itemId=field(row[0]!.label!,'item: '),criterionId=field(row[1]!.label!,'criterion: '),orderText=field(row[2]!.label!,'order: '),itemIndex=items.findIndex(item=>item.id===itemId),criterionIndex=criteria.findIndex(item=>item.id===criterionId),item=items[itemIndex],criterion=criteria[criterionIndex],cellId='comparison-shape-value-'+encode('value_',itemId??'')+'_'+encode('criterion_',criterionId??''),pair=itemId+'\0'+criterionId;
  if(!item||!criterion||seenPairs.has(pair)||row[0]!.id!==cellId+'_item'||row[1]!.id!==cellId+'_criterion'||!orderText||!/^(0|[1-9][0-9]*)$/.test(orderText)){fail(diagnostics,'LINI_COMPARISON_ORDER','/source','Value order row must identify a unique declared matrix cell and nonnegative source index.');continue;}seenPairs.add(pair);
  const valueRow=form==='matrix'?shapeRows[itemIndex+1]:shapeRows[criterionIndex+1],valueCell=valueRow?.[form==='matrix'?criterionIndex+1:itemIndex+1];if(!valueCell||valueCell.id!==cellId){fail(diagnostics,'LINI_COMPARISON_VALUE_ID','/source','Value order identity does not resolve to its native matrix cell.');continue;}
  const display=unwrapText(valueCell.label!),noteOffset=display.indexOf(' note: '),typedText=noteOffset<0?display:display.slice(0,noteOffset),visibleNote=noteOffset<0?absent:display.slice(noteOffset+1),typed=parseTypedValue(typedText,visibleNote,criterion.measure);
  if(display===absent){fail(diagnostics,'LINI_COMPARISON_VALUE','/source','Absent matrix cells cannot appear in the present-value order appendix.');continue;}
  if(!typed||typed.text===undefined&&typed.rating===undefined&&typed.support===undefined){fail(diagnostics,'LINI_COMPARISON_VALUE','/source','Visible matrix values must match the criterion type and contain a typed value.');continue;}
  const itemIdentity=itemId!,criterionIdentity=criterionId!,order=Number(orderText),at=p('/values/'+order),locator={id:cellId,slot:'cell#'+cellId},orderLocator={id:encode('value_',itemIdentity)+'_'+encode('criterion_',criterionIdentity)+'_order',slot:'cell#'+encode('value_',itemIdentity)+'_'+encode('criterion_',criterionIdentity)+'_order'};orderedValues.push({order,value:{item:item.id,criterion:criterion.id,...typed},nativeId:cellId});identityMap.push({kind:'value',nativeId:cellId,visualId:item.id+':'+criterion.id,path:at,sourcePath:locator.slot});coverage.push(...covers(at,['presence','value'],locator),...covers(at+'/item',['identity'],{id:cellId+'_item',slot:'cell#'+cellId+'_item'}),...covers(at+'/criterion',['identity'],{id:cellId+'_criterion',slot:'cell#'+cellId+'_criterion'}),...covers(p('/values'),['order'],orderLocator),...(typed.note===undefined?[]:covers(at+'/note',['value'],locator)));
 }
 orderedValues.sort((a,b)=>a.order-b.order);if(orderedValues.some((entry,index)=>entry.order!==index))fail(diagnostics,'LINI_COMPARISON_ORDER','/source','Visible value-order markers must be unique and contiguous.');
 const values:Comparison['values']=orderedValues.map(entry=>entry.value);
 const presentPairs=new Set(orderedValues.map(entry=>entry.value.item+'\0'+entry.value.criterion));for(const item of items)for(const criterion of criteria){const cellNode=form==='matrix'?shapeRows[items.indexOf(item)+1]?.[criteria.indexOf(criterion)+1]:shapeRows[criteria.indexOf(criterion)+1]?.[items.indexOf(item)+1],pair=item.id+'\0'+criterion.id;if(!cellNode)continue;if((unwrapText(cellNode.label!)!==absent)!==presentPairs.has(pair))fail(diagnostics,'LINI_COMPARISON_PRESENCE','/source','Every nonempty matrix cell must have exactly one visible source-order entry.');}
 coverage.push(...covers(p('/items'),['presence','order'],{id:'comparison-items',slot:'table#comparison-items/rows'}),...covers(p('/criteria'),['presence','order'],{id:'comparison-criteria',slot:'table#comparison-criteria/rows'}),...covers(p('/values'),['presence','order'],{id:'comparison-value-details',slot:'table#comparison-value-details/rows'}));
 let chosen:Comparison['chosen'];
 if(choiceTable){const choiceRows=tableCells(choiceTable,2,diagnostics);if(choiceRows.length!==2||choiceRows[0]!.map(cell=>cell.label).join('\0')!=='Chosen item\0Reason')fail(diagnostics,'LINI_COMPARISON_CHOSEN','/source','Decision table needs a chosen-item and reason row.');else{const row=choiceRows[1]!,id=row[0]!.id.replace(/^chosen_/,'');const itemId=decode(id,'item_'),text=field(row[0]!.label!,'id: '),reason=readJsonString(unwrapText(row[1]!.label!),'reason: ');if(!itemId||text?.split(' · ')[0]!==itemId||!items.some(item=>item.id===itemId)||reason===undefined||row[1]!.id!=='chosen-reason')fail(diagnostics,'LINI_COMPARISON_CHOSEN','/source','Chosen item and reason cells must agree exactly with a declared item.');else{chosen={item:itemId,reason};coverage.push(...covers(p('/chosen/item'),['identity','value'],{id:row[0]!.id,slot:'cell#'+row[0]!.id}),...covers(p('/chosen/reason'),['value'],{id:'chosen-reason',slot:'cell#chosen-reason'}));}}}
 if(diagnostics.some(item=>item.severity==='error'))return;
 return{items,criteria,values,...(chosen?{chosen}:{})};
}

function parseQuadrant(nodes:LiniProfileNode[],diagnostics:InterchangeDiagnostic[],identityMap:LiniComparisonIdentityMapping[],coverage:ProjectionCoverage[]):Comparison|undefined{
 const group=nodes.length===1&&nodes[0]!.type==='group'&&nodes[0]!.id==='comparison-quadrant-profile'?nodes[0]:undefined;if(!group){fail(diagnostics,'LINI_COMPARISON_SHAPE','/source','Quadrant profile must be one declared grid group.');return;}
 onlyProperties(group,['layout','columns','gap','padding'],diagnostics);const chart=one(group.children,'chart','comparison-quadrant'),criteriaTable=one(group.children,'table','quadrant-criteria'),itemTable=one(group.children,'table','quadrant-items'),valueTable=one(group.children,'table','quadrant-values'),decisionTable=one(group.children,'table','quadrant-decision');
 if((group.children.length!==4&&group.children.length!==5)||!chart||!criteriaTable||!itemTable||!valueTable||group.children.some(child=>![chart,criteriaTable,itemTable,valueTable,decisionTable].includes(child)))fail(diagnostics,'LINI_COMPARISON_SHAPE','/source','Quadrant grid must contain its chart, three visible metadata tables, and optional decision table.');
 if(!chart)return;
 onlyProperties(chart,['layout','width','height'],diagnostics);if(word(token(chart,'layout'))!=='chart')fail(diagnostics,'LINI_COMPARISON_SHAPE','/source','Quadrant chart layout must be native chart.');
 const axes=chart.children.filter(child=>child.type==='axis'),bubbles=chart.children.filter(child=>child.type==='bubble'),marks=chart.children.filter(child=>child.type==='mark');if(axes.length!==2||bubbles.length===0||marks.length!==0||chart.children.some(child=>child.type!=='axis'&&child.type!=='bubble'))fail(diagnostics,'LINI_COMPARISON_SHAPE','/source','Quadrant chart supports two axes and item bubbles; decision data uses a visible table.');
 const xAxis=axes[0]!,yAxis=axes[1]!;onlyProperties(xAxis,['range','side'],diagnostics);onlyProperties(yAxis,['range','side'],diagnostics);if(word(token(xAxis,'side'))!=='bottom'||word(token(yAxis,'side'))!=='left')fail(diagnostics,'LINI_COMPARISON_AXES','/source','Quadrant axes must use bottom x and left y positions.');
 const criteria=parseMetaTable(criteriaTable,diagnostics,'criterion_','axis-header-'),itemRows=tableCells(itemTable!,3,diagnostics),valueRows=tableCells(valueTable!,5,diagnostics);
 criteria.forEach((criterion,index)=>{const native=encode('criterion_',criterion.id),base=p('/criteria/'+index),loc={id:native+'_id',slot:'cell#'+native+'_id'};identityMap.push({kind:'criterion',nativeId:loc.id,visualId:criterion.id,path:base+'/id',sourcePath:loc.slot});coverage.push(...covers(base+'/id',['identity'],loc),...covers(base+'/label',['value'],{id:native+'_label',slot:'cell#'+native+'_label'}),...covers(base+'/measure',['value'],{id:native+'_measure',slot:'cell#'+native+'_measure'}));for(const field of ['max','low','high','detail'] as const)if(criterion[field]!==undefined)coverage.push(...covers(base+'/'+field,['value'],{id:native+'_'+field,slot:'cell#'+native+'_'+field}));});
 if(criteria.length!==2||itemRows.length<2||itemRows[0]!.map(cell=>cell.label).join('\0')!=='Item ID\0Item\0Detail'||valueRows.length<2||valueRows[0]!.map(cell=>cell.label).join('\0')!=='Item\0Criterion\0Rating\0Note\0Order'||valueRows[0]!.map(cell=>cell.id).join('\0')!=='quadrant-value-header-item\0quadrant-value-header-criterion\0quadrant-value-header-value\0quadrant-value-header-note\0quadrant-value-header-order')fail(diagnostics,'LINI_COMPARISON_SHAPE','/source','Quadrant metadata tables are missing exact headers.');
 const xId=decode(xAxis.id,'xaxis_'),yId=decode(yAxis.id,'yaxis_'),x=criteria.find(item=>item.id===xId),y=criteria.find(item=>item.id===yId),range=(node:LiniProfileNode)=>{const value=token(node,'range');return value?.length===2&&value[0]!.kind==='number'&&value[1]!.kind==='number'&&Number(value[0]!.value)===0?Number(value[1]!.value):undefined;};
 if(!x||!y||x.id===y.id||x.measure!=='rating'||y.measure!=='rating'||range(xAxis)!==x.max||range(yAxis)!==y.max)fail(diagnostics,'LINI_COMPARISON_AXES','/source','Quadrant native axis identities, labels, measures, and scale maxima must agree.');
 const items:Comparison['items']=[],values:Comparison['values']=[],itemIds=new Set<string>();
 for(const[index,row]of itemRows.slice(1).entries()){const item=parseItemRow(row,diagnostics,index,'qitem_');if(!item||itemIds.has(item.id)){fail(diagnostics,'LINI_COMPARISON_ITEM','/source','Quadrant item identities must be unique.');continue;}itemIds.add(item.id);items.push(item);}
 const valuesByPair=new Map<string,ComparisonValue>(),orderedValues:Array<{order:number;value:ComparisonValue;nativeId:string}> = [];
 for(const row of valueRows.slice(1)){
  const itemCell=row[0]!,criterionCell=row[1]!,valueCell=row[2]!,noteCell=row[3]!,orderCell=row[4]!,itemPrefix=field(unwrapText(itemCell.label!),'item: '),criterionPrefix=field(unwrapText(criterionCell.label!),'criterion: '),itemId=itemPrefix?.split(' · ')[0],criterionId=criterionPrefix?.split(' · ')[0],criterion=criteria.find(item=>item.id===criterionId),item=items.find(candidate=>candidate.id===itemId),native=encode('qvalue_',itemId??'')+'_'+encode('criterion_',criterionId??'');
  if(!item||!criterion||itemCell.id!==native+'_item'||criterionCell.id!==native+'_criterion'||valueCell.id!==native+'_rating'||noteCell.id!==native+'_note'){fail(diagnostics,'LINI_COMPARISON_VALUE_ID','/source','Quadrant rating row must bind to exact item and criterion cells.');continue;}
  const typed=parseTypedValue(valueCell.label!,noteCell.label!,criterion.measure);if(!typed||typed.rating===undefined){fail(diagnostics,'LINI_COMPARISON_VALUE','/source','Quadrant value cells must carry a numeric rating token and optional note.');continue;}
  const orderText=field(orderCell.label!,'order: ');if(orderCell.id!==native+'_order'||!orderText||!/^(0|[1-9][0-9]*)$/.test(orderText)){fail(diagnostics,'LINI_COMPARISON_ORDER','/source','Quadrant rating rows need exact visible array-order markers.');continue;}
  const order=Number(orderText),value={item:itemId!,criterion:criterionId!,...typed},key=itemId+'\0'+criterionId;if(valuesByPair.has(key))fail(diagnostics,'LINI_COMPARISON_DUPLICATE','/source','Quadrant has duplicate item/criterion ratings.');valuesByPair.set(key,value);orderedValues.push({order,value,nativeId:native});
  // Ordering is witnessed by a visible native cell, but it is not a model
  // property on each value. Attach that evidence to the existing array entry.
  const base=p('/values/'+order);coverage.push(...covers(base+'/item',['identity'],{id:native+'_item',slot:'cell#'+native+'_item'}),...covers(base+'/criterion',['identity'],{id:native+'_criterion',slot:'cell#'+native+'_criterion'}),...covers(base+'/rating',['value','presence'],{id:native+'_rating',slot:'cell#'+native+'_rating'}),...covers(base,['order'],{id:native+'_order',slot:'cell#'+native+'_order'}),...(typed.note===undefined?[]:covers(base+'/note',['value'],{id:native+'_note',slot:'cell#'+native+'_note'})));
 }
 orderedValues.sort((a,b)=>a.order-b.order);if(orderedValues.some((entry,index)=>entry.order!==index))fail(diagnostics,'LINI_COMPARISON_ORDER','/source','Quadrant value-order markers must be unique and contiguous.');for(const entry of orderedValues){values.push(entry.value);const base=p('/values/'+entry.order),loc={id:entry.nativeId+'_rating',slot:'cell#'+entry.nativeId+'_rating'};identityMap.push({kind:'value',nativeId:loc.id,visualId:entry.value.item+':'+entry.value.criterion,path:base,sourcePath:loc.slot});}
 const bubbleValues=new Map<string,{x:number;y:number}>();
 for(const[index,bubble]of bubbles.entries()){
  onlyProperties(bubble,['at','value'],diagnostics);const id=decode(bubble.id,'bubble_'),at=token(bubble,'at'),value=token(bubble,'value'),item=items.find(row=>row.id===id);
  if(!id||!item||bubble.label!==item.label||at?.length!==2||at[0]!.kind!=='number'||at[1]!.kind!=='number'||value?.length!==1||value[0]!.kind!=='number'||Number(value[0]!.value)!==1){fail(diagnostics,'LINI_COMPARISON_BUBBLE','/source','Bubbles need reversible item IDs, exact labels, numeric coordinates, and the fixed native size token.');continue;}
  const xv=Number(at[0]!.value),yv=Number(at[1]!.value);if(!finite(xv)||!finite(yv)||xv!==valuesByPair.get(id+'\0'+xId)?.rating||yv!==valuesByPair.get(id+'\0'+yId)?.rating)fail(diagnostics,'LINI_COMPARISON_COORDINATES','/source','Bubble coordinates must exactly equal the visible x/y rating values.');bubbleValues.set(id,{x:xv,y:yv});
  const itemIndex=items.findIndex(row=>row.id===id),loc={id:bubble.id,slot:'bubble#'+bubble.id};identityMap.push({kind:'item',nativeId:bubble.id,visualId:id,path:p('/items/'+itemIndex+'/id'),sourcePath:loc.slot});coverage.push(...covers(p('/items/'+itemIndex+'/id'),['identity'],loc));
 }
 let chosen:Comparison['chosen'];if(decisionTable){const decisionRows=tableCells(decisionTable,2,diagnostics);if(decisionRows.length!==2||decisionRows[0]!.map(cell=>cell.label).join('\0')!=='Chosen item\0Reason'||decisionRows[0]!.map(cell=>cell.id).join('\0')!=='quadrant-decision-header-item\0quadrant-decision-header-reason')fail(diagnostics,'LINI_COMPARISON_CHOSEN','/source','Decision table must have one visible chosen identity and reason row.');else{const row=decisionRows[1]!,itemId=field(row[0]!.label!,'id: '),reason=readJsonString(unwrapText(row[1]!.label!),'reason: ');if(row[0]!.id!=='quadrant-chosen-item'||row[1]!.id!=='quadrant-chosen-reason'||!itemId||!items.some(item=>item.id===itemId)||reason===undefined)fail(diagnostics,'LINI_COMPARISON_CHOSEN','/source','Decision row needs an exact declared item ID and visible reason.');else{chosen={item:itemId,reason};coverage.push(...covers(p('/chosen/item'),['identity','value'],{id:row[0]!.id,slot:'cell#'+row[0]!.id}),...covers(p('/chosen/reason'),['value'],{id:row[1]!.id,slot:'cell#'+row[1]!.id}));}}}
 if(values.length!==items.length*2||items.some(item=>!bubbleValues.has(item.id)))fail(diagnostics,'LINI_COMPARISON_COORDINATES','/source','Quadrant requires two exact ratings and one bubble per item.');
 coverage.push(...covers(p('/criteria'),['presence','order'],{id:'quadrant-criteria',slot:'table#quadrant-criteria/rows'}),...covers(p('/items'),['presence','order'],{id:'quadrant-items',slot:'table#quadrant-items/rows'}),...covers(p('/values'),['presence','order'],{id:'quadrant-values',slot:'table#quadrant-values/rows'}),...covers(p('/axes/x'),['identity','value'],{id:xAxis.id,slot:'axis#'+xAxis.id}),...covers(p('/axes/y'),['identity','value'],{id:yAxis.id,slot:'axis#'+yAxis.id}));
 if(diagnostics.some(item=>item.severity==='error'))return;
 return{items,criteria,values,axes:{x:xId!,y:yId!},...(chosen?{chosen}:{})};
}

function word(tokens:LiniProfileToken[]|undefined):string|undefined{return tokens?.length===1&&tokens[0]!.kind==='word'?tokens[0]!.value:undefined;}
function parseOne(nodes:LiniProfileNode[],form:LiniComparisonForm,diagnostics:InterchangeDiagnostic[],identityMap:LiniComparisonIdentityMapping[],coverage:ProjectionCoverage[]):Comparison|undefined{return form==='quadrant'?parseQuadrant(nodes,diagnostics,identityMap,coverage):parseMatrix(nodes,form,diagnostics,identityMap,coverage);}
/** Parse the bounded, visible native comparison subset. */
export function parseLiniComparison(nodes:LiniProfileNode[],form:LiniComparisonForm):LiniComparisonParseResult {
 const diagnostics:InterchangeDiagnostic[]=[],identityMap:LiniComparisonIdentityMapping[]=[],coverage:ProjectionCoverage[]=[];
 if(!['matrix','before-after','quadrant'].includes(form)){fail(diagnostics,'LINI_COMPARISON_FORM','/source','Unsupported comparison form.');return{identityMap,coverage,diagnostics};}
 const comparison=parseOne(nodes,form,diagnostics,identityMap,coverage);if(!comparison||diagnostics.some(item=>item.severity==='error'))return{identityMap,coverage:[],diagnostics};
 return{comparison,identityMap,coverage,diagnostics};
}
