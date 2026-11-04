// SPDX-License-Identifier: MIT OR Apache-2.0
/** Portable, display-only projections of the public umf.visual vocabulary. */
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,type Visual,type VisualNode,type VisualGroup,type VisualField,type VisualMultiplicity,type VisualDefs} from '../extensions/visual';
import {compileLiniPresentation} from './lini';
import {circularPlacement} from './circular';
import {compileStatePresentation} from './state';
import {compileTimelinePresentation} from './timeline';
import {compileLiniQuadrant} from './lini-quadrant';
import {compileLiniMeter} from './lini-meter';
import {compileLiniStatPresentation} from './lini-stat';
import {compileLiniBarPresentation} from './lini-bar';
import {compileLiniTrendPresentation} from './lini-trend';
import {compileLiniBeforeAfterPresentation} from './lini-before-after';
import {compileLiniMatrixPresentation} from './lini-matrix';
import {compileLiniRoadmapPresentation} from './lini-roadmap';
import {compileNestedPresentation} from './nested';
import {orderTiered} from './tier-layout';
import {estimateGraphvizDagOrientation,hasFlatPipelineNodes} from './dag-orientation';

export type PresentationBackend='graphviz'|'mermaid'|'lini';
export interface PresentationOptions {backend:PresentationBackend;direction?:'LR'|'TB';theme?:'presentation/1';}
export interface PresentationDiagnostic {code:string;path:string;message:string;severity:'error'|'warning';}
export interface PresentationExecution {runtime:'graphviz';layoutEngine:'neato';nodePositions:'fixed';}
export interface PresentationElement {logicalId:string;sourcePath:string;nativeId:string;kind:'visual'|'group'|'node'|'edge'|'layer'|'entity'|'field'|'port'|'reference'|'participant'|'participant-field'|'participant-lifeline'|'message'|'message-caption'|'note'|'annotation'|'transition'|'state-marker'|'state-path-caption'|'event'|'period'|'lane'|'span'|'comparison-item'|'comparison-value'|'comparison-criterion'|'comparison-choice'|'metric-series'|'metric-value'|'metric-reference';}
export interface PresentationOmission {sourcePath:string;reason:string;}
export interface PresentationApproximation {sourcePath:string;requested:string;representation:string;code?:'ROUTING_SCOPE_CONFLICT'|'ROUTING_NATIVE_INTERPOLATION'|'CIRCULAR_NATIVE_GRID';}
export interface PresentationPlan {
 ok:true;profileId:'umf.visual.presentation/1';backend:PresentationBackend;nativeFormat:'dot'|'mermaid'|'lini';source:string;
 elementMap:PresentationElement[];omissions:PresentationOmission[];approximations:PresentationApproximation[];execution?:PresentationExecution;
}
export interface PresentationFailure {ok:false;diagnostics:PresentationDiagnostic[];}
export type PresentationResult=PresentationPlan|PresentationFailure;

const BASE='/extensions/umf.visual';
const safeId=(prefix:string,index:number)=>prefix+(index+1);
const ptr=(s:string)=>s.replace(/~/g,'~0').replace(/\//g,'~1');
const dot=(s:string)=>'"'+s.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\t/g,'\\t')+'"';
const dotHtml=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<BR ALIGN="LEFT"/>');
const graphvizDefaultRanksep=0.62;
const graphvizCurvedLabelMinlen=(label:string)=>Math.max(2,Math.ceil((Array.from(label).length*6.3+24)/(graphvizDefaultRanksep*96))+1);
const dotRolePalette:Record<string,{fill:string;stroke:string}>={actor:{fill:'#fff4dc',stroke:'#be8741'},own:{fill:'#e8f2ec',stroke:'#668f78'},platform:{fill:'#e8f2f3',stroke:'#577782'},external:{fill:'#f5f4ef',stroke:'#96988e'},store:{fill:'#e8efff',stroke:'#637cae'},document:{fill:'#f2ecfb',stroke:'#8b72a6'},process:{fill:'#f4eef4',stroke:'#8c6b87'}};
const dotStatusPalette:Record<string,{fill:string;stroke:string}>={built:{fill:'#e8f2ec',stroke:'#668f78'},placeholder:{fill:'#fff5e4',stroke:'#ba8745'},decided:{fill:'#edf2f8',stroke:'#71869b'},unknown:{fill:'#f2f3f3',stroke:'#98a3a6'}};
function graphvizMultipleDocumentLabel(node:VisualNode):string{
 const palette=(node.status?dotStatusPalette[node.status]:undefined)??(node.role?dotRolePalette[node.role]:undefined)??{fill:'#e8f2f3',stroke:'#577782'},width='170',height='68';
 const roleCaption=processRoleCaption(node)?'<BR/><FONT POINT-SIZE="11">Process</FONT>':'';
 const lines=(node.icon?'<FONT POINT-SIZE="9">Icon: '+dotHtml(node.icon)+'</FONT><BR/>':'')+'<B>'+dotHtml(node.label)+'</B>'+(node.detail?'<BR/><FONT POINT-SIZE="11">'+dotHtml(node.detail)+'</FONT>':'')+roleCaption;
 const ports=(node.ports??[]).map((port,index)=>`<TR><TD PORT="p${index+1}" ALIGN="LEFT" CELLPADDING="4" BORDER="1" COLOR="#c8d6da"><FONT COLOR="#536e78" POINT-SIZE="11">${dotHtml(portCaption(port))}</FONT></TD></TR>`).join('');
 const front=`<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="6" COLOR="${palette.stroke}" BGCOLOR="${palette.fill}"><TR><TD ALIGN="LEFT" WIDTH="${width}" HEIGHT="${height}">${lines}</TD></TR>${ports}</TABLE>`;
 return `<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="0"><TR><TD BORDER="1" SIDES="T" WIDTH="${width}" HEIGHT="8" COLOR="${palette.stroke}" BGCOLOR="${palette.fill}"></TD><TD BORDER="1" SIDES="TR" WIDTH="8" HEIGHT="8" COLOR="${palette.stroke}" BGCOLOR="${palette.fill}"></TD></TR><TR><TD>${front}</TD><TD BORDER="1" SIDES="R" WIDTH="8" HEIGHT="68" COLOR="${palette.stroke}" BGCOLOR="${palette.fill}"></TD></TR></TABLE>`;
}
const graphvizMultipleDocumentStatement=(node:VisualNode,nativeId:string,indent='  '):string=>indent+nativeId+' [label=<'+graphvizMultipleDocumentLabel(node)+'>'+nodeStyle(node)+shapeOverride(node)+'];';
const mermaidChar=(char:string)=>({ ' ':'#32;','#':'#35;','&':'#38;','"':'#34;','<':'#60;','>':'#62;',';':'#59;','(':'#40;',')':'#41;','[':'#91;',']':'#93;','{':'#123;','}':'#125;','\\':'#92;' } as Record<string,string>)[char]??char;
const mermaidText=(s:string)=>s.replace(/\r/g,'').split('\n').map(line=>Array.from(line,mermaidChar).join('')).join('<br/>');
const displayTitle=(visual:Visual)=>visual.title??visual.question;
const mermaidNeutralFieldRow=(field:VisualField)=>{const keys=(field.keys??[]).map(key=>key.toUpperCase()).join(', '),nullable=field.nullable===undefined?'':field.nullable?'NULL':'NOT NULL',qualifiers=[keys,nullable].filter(Boolean).join(' · ');return(qualifiers?qualifiers+' · ':'')+field.name+(field.type?': '+field.type:'');};
const mermaidNeutralWrappingWidth=(rows:string[],cardCount:number,referenceCount:number)=>{
 const longest=rows.flatMap(row=>row.split('\n')).reduce((max,row)=>Math.max(max,Array.from(row).reduce((width,char)=>width+(char.codePointAt(0)!>0xFF?18:9),0)),0);
 const rowWidth=Math.ceil(longest+40),aggregateWidth=Math.floor(1600/Math.max(1,cardCount+referenceCount*.6));
 return Math.min(420,Math.max(200,Math.min(rowWidth,aggregateWidth)));
};
const mermaidNeutralHeader=(visual:Visual,width:number)=>['---','title: '+JSON.stringify(displayTitle(visual)),'config:','  flowchart:','    wrappingWidth: '+width,'---'];
const ordered = <T extends {id:string}>(items:T[],order:string[]|undefined):T[]=>{
 if(!order)return items;const rank=new Map(order.map((id,index)=>[id,index]));
 return items.map((item,index)=>({item,index})).sort((a,b)=>(rank.get(a.item.id)??Number.MAX_SAFE_INTEGER)-(rank.get(b.item.id)??Number.MAX_SAFE_INTEGER)||a.index-b.index).map(row=>row.item);
};
const layoutDirection=(layout:VisualDefs['layout']|undefined,fallback:'LR'|'TB'):'LR'|'TB'=>
 layout&&(layout.kind==='flow'||layout.kind==='stack')?(layout.direction??fallback):layout?.kind==='grid'&&layout.columns===1?'TB':fallback;
const shapeOptions:Record<NonNullable<VisualNode['shape']>,{dot:string;mermaid:string;label:string}>={
 rectangle:{dot:'box',mermaid:'rect',label:'rectangle'},'rounded-rectangle':{dot:'box',mermaid:'rounded',label:'rounded rectangle'},ellipse:{dot:'ellipse',mermaid:'circle',label:'ellipse'},diamond:{dot:'diamond',mermaid:'diam',label:'diamond'},hexagon:{dot:'hexagon',mermaid:'hex',label:'hexagon'},cylinder:{dot:'cylinder',mermaid:'cyl',label:'cylinder'},'folded-corner':{dot:'note',mermaid:'doc',label:'folded-corner document'},parallelogram:{dot:'parallelogram',mermaid:'lean_right',label:'parallelogram'},document:{dot:'note',mermaid:'doc',label:'document'},'multiple-documents':{dot:'plain',mermaid:'docs',label:'multiple documents'}
};
const nativePortId=(nodeId:string,portIndex:number)=>nodeId+'.p'+(portIndex+1);
const findPort=(node:VisualNode|undefined,id:string|undefined)=>id===undefined?undefined:node?.ports?.find(port=>port.id===id);
const portCaption=(port:NonNullable<VisualNode['ports']>[number])=>`${port.label!==undefined&&port.label!==port.id?port.label+' · ':''}${port.id}${port.side?' · '+port.side:''}`;
const portRows=(node:VisualNode)=>node.ports??[];
const processRoleCaption=(node:VisualNode)=>node.role==='process'&&node.label!=='Process'&&node.detail!=='Process'?'Process':undefined;
const mermaidHeader=(visual:Visual)=>['---','title: '+JSON.stringify(displayTitle(visual)),'---'];
const diag=(code:string,path:string,message:string):PresentationDiagnostic=>({code,path,message,severity:'error'});
const path=(part:string)=>BASE+(part.startsWith('/')?part:'/'+part);

/** Compile an unchanged UMF document to native diagram source. This is not an interchange route. */
export function compilePresentation(document:Document,options:PresentationOptions):PresentationResult {
 if(!document||typeof document!=='object')return {ok:false,diagnostics:[diag('PRESENTATION_DOCUMENT','/','Expected a UMF document.')]};
 let validation;
 try{validation=inspectVisual(document);}catch{return {ok:false,diagnostics:[diag('PRESENTATION_DOCUMENT','/','The input is not a safely readable UMF document.')]};}
 if(!validation.valid||!validation.complete)return {ok:false,diagnostics:validation.diagnostics.map(d=>diag(d.code,d.path,d.message))};
 let visual:Visual;
 try{visual=getVisual(document);}catch{return {ok:false,diagnostics:[diag('PRESENTATION_VISUAL',BASE,'The document has no valid umf.visual payload.')]};}
 let serialized:string;try{serialized=JSON.stringify(visual);}catch{return {ok:false,diagnostics:[diag('PRESENTATION_VISUAL',BASE,'The visual payload cannot be safely serialized.')]};}
 if(serialized.length>250_000)return {ok:false,diagnostics:[diag('PRESENTATION_SIZE',BASE,'The visual payload exceeds the 250,000 UTF-16 code-unit presentation limit.')]};
 let optionValues:{backend?:unknown;direction?:unknown;theme?:unknown};
 try{
  if(!options||typeof options!=='object'||Array.isArray(options))throw new Error();
  const prototype=Object.getPrototypeOf(options);if(prototype!==Object.prototype&&prototype!==null)throw new Error();
  const descriptors=Object.getOwnPropertyDescriptors(options),keys=Reflect.ownKeys(descriptors);
  if(keys.some(key=>typeof key!=='string'||!['backend','direction','theme'].includes(key)))throw new Error();
  for(const key of keys){const descriptor=descriptors[key as keyof typeof descriptors];if(!descriptor||!('value'in descriptor))throw new Error();}
  optionValues={backend:descriptors.backend?.value,direction:descriptors.direction?.value,theme:descriptors.theme?.value};
 }catch{return {ok:false,diagnostics:[diag('PRESENTATION_OPTIONS','/','Options must be a plain data object containing only backend, direction, and theme values.')]};}
 if(!['graphviz','mermaid','lini'].includes(optionValues.backend as string))return {ok:false,diagnostics:[diag('PRESENTATION_BACKEND','/','Choose backend graphviz, mermaid, or lini.')]};
 if(optionValues.direction!==undefined&&!['LR','TB'].includes(optionValues.direction as string))return {ok:false,diagnostics:[diag('PRESENTATION_DIRECTION','/','Direction must be LR or TB.')]};
 if(optionValues.theme!==undefined&&optionValues.theme!=='presentation/1')return {ok:false,diagnostics:[diag('PRESENTATION_THEME','/','Only the versioned presentation/1 theme is supported.')]};
 const strings:{value:string;path:string}[]=[];const pending:{value:unknown;path:string}[]=[{value:visual,path:BASE}];
 while(pending.length){const current=pending.pop()!;if(typeof current.value==='string'){strings.push({value:current.value,path:current.path});continue;}if(Array.isArray(current.value)){for(let i=0;i<current.value.length;i++)pending.push({value:current.value[i],path:current.path+'/'+i});}else if(current.value&&typeof current.value==='object'){for(const[k,v]of Object.entries(current.value))pending.push({value:v,path:current.path+'/'+ptr(k)});}}
 for(const item of strings){for(let i=0;i<item.value.length;i++){const code=item.value.charCodeAt(i);if(code===13||code===0||(code<32&&code!==9&&code!==10)){return {ok:false,diagnostics:[diag('PRESENTATION_TEXT',item.path,'Carriage returns and control characters other than tab/newline cannot be represented by the presentation renderers.') ]};}if(code>=0xD800&&code<=0xDBFF){const next=item.value.charCodeAt(i+1);if(!(next>=0xDC00&&next<=0xDFFF))return {ok:false,diagnostics:[diag('PRESENTATION_TEXT',item.path,'Unpaired UTF-16 surrogates cannot be represented by the presentation renderers.') ]};i++;}else if(code>=0xDC00&&code<=0xDFFF)return {ok:false,diagnostics:[diag('PRESENTATION_TEXT',item.path,'Unpaired UTF-16 surrogates cannot be represented by the presentation renderers.') ]};}}
 if(visual.annotations?.length&&(visual.kind!=='flow'||visual.form!=='network')&&visual.kind!=='state'&&!(visual.kind==='comparison'&&(visual.form==='quadrant'||visual.form==='before-after'||visual.form==='matrix')))return {ok:false,diagnostics:[diag('PRESENTATION_ANNOTATION_SCOPE',BASE+'/annotations','Free-text annotations are currently qualified only for flow/network diagrams, state machines, and bounded Lini comparison profiles; this renderer does not silently drop them from another presentation form.')]};
 if(visual.annotations?.length&&visual.layout?.kind==='circular')return {ok:false,diagnostics:[diag('PRESENTATION_ANNOTATION_CIRCULAR',BASE+'/annotations','Circular layout with free-text annotations is not yet qualified: the native fixed-position flow currently has no reviewed placement policy for unanchored text.')]};
 const unsupportedCircularGroup=visual.groups?.find(group=>group.layout?.kind==='circular');
 if(unsupportedCircularGroup)return {ok:false,diagnostics:[diag('PRESENTATION_CIRCULAR_SCOPE',BASE+'/groups/'+visual.groups!.indexOf(unsupportedCircularGroup)+'/layout','Circular placement is not qualified for nested group scopes; no grid or flow fallback is selected.')]};
 if(visual.layout?.kind==='circular'&&(visual.kind!=='flow'||visual.form!=='network'))return {ok:false,diagnostics:[diag('PRESENTATION_CIRCULAR_SCOPE',BASE+'/layout','Circular placement is currently qualified only for a root flow/network presentation.')]};
 if(visual.layout?.kind==='circular'&&((visual.groups?.length??0)>0||(visual.nodes??[]).some(node=>node.group||node.parent)))return {ok:false,diagnostics:[diag('PRESENTATION_CIRCULAR_SCOPE',BASE+'/layout','Circular placement is currently qualified only for ungrouped root flow/network nodes; no nested-layout fallback is selected.')]};
 const rich=visual.kind==='sequence'||visual.kind==='structure'&&visual.form==='tree';
 const supported=visual.kind==='flow'&&(visual.form==='network'||visual.form==='pipeline'||visual.form==='zoned'||visual.form==='lanes')
  ||visual.kind==='structure'&&(visual.form==='stack'||visual.form==='entities'||visual.form==='tree'||visual.form==='nested')
  ||visual.kind==='sequence'&&(visual.form==='lifelines'||visual.form==='ladder')
  ||visual.kind==='state'&&(visual.form==='machine'||visual.form==='lifecycle')
  ||visual.kind==='timeline'&&(visual.form==='history'||visual.form==='milestones')
  ||visual.kind==='timeline'&&visual.form==='roadmap'
  ||visual.kind==='comparison'&&(visual.form==='quadrant'||visual.form==='before-after'||visual.form==='matrix')
  ||visual.kind==='metric'&&(visual.form==='meter'||visual.form==='stat'||visual.form==='bar'||visual.form==='line');
 if(!supported)return {ok:false,diagnostics:[diag('PRESENTATION_FORM',BASE+'/form','No presentation projection is qualified for '+visual.kind+'/'+visual.form+'.')]};

 const backend=optionValues.backend as PresentationBackend,dir=(optionValues.direction??'LR') as 'LR'|'TB';
 if(visual.kind==='structure'&&visual.form==='nested'&&backend!=='lini')return compileNestedPresentation(visual,backend,dir);
 if(visual.kind==='timeline'&&visual.form==='roadmap'){
  if(backend!=='lini')return {ok:false,diagnostics:[diag('PRESENTATION_BACKEND_SUBSET',BASE+'/form','This period-scaled lane roadmap is currently qualified only for the pinned Lini backend.')]};
  return compileLiniRoadmapPresentation(visual);
 }
 if(visual.kind==='metric'&&visual.form==='meter'){
  if(backend!=='lini')return {ok:false,diagnostics:[diag('PRESENTATION_BACKEND_SUBSET',BASE+'/form','This bounded scalar meter profile is currently qualified only for the pinned Lini chart backend.')]};
  return compileLiniMeter(visual);
 }
 if(visual.kind==='metric'&&visual.form==='stat'){
  if(backend!=='lini')return {ok:false,diagnostics:[diag('PRESENTATION_BACKEND_SUBSET',BASE+'/form','This bounded date-series stat presentation is currently qualified only for the pinned Lini chart backend.')]};
  return compileLiniStatPresentation(visual);
 }
 if(visual.kind==='metric'&&visual.form==='bar'){
  if(backend!=='lini')return {ok:false,diagnostics:[diag('PRESENTATION_BACKEND_SUBSET',BASE+'/form','This bounded category-bar presentation is currently qualified only for the pinned Lini chart backend.')]};
  return compileLiniBarPresentation(visual);
 }
 if(visual.kind==='metric'&&visual.form==='line'){
  if(backend!=='lini')return {ok:false,diagnostics:[diag('PRESENTATION_BACKEND_SUBSET',BASE+'/form','This bounded multi-series temporal line presentation is currently qualified only for the pinned Lini chart backend.')]};
  return compileLiniTrendPresentation(visual);
 }
 if(visual.kind==='comparison'&&visual.form==='quadrant'){
  if(backend!=='lini')return {ok:false,diagnostics:[diag('PRESENTATION_BACKEND_SUBSET',BASE+'/form','This bounded native quadrant presentation is currently qualified only for the pinned Lini chart backend.')]};
  return compileLiniQuadrant(visual);
 }
 if(visual.kind==='comparison'&&visual.form==='before-after'){
  if(backend!=='lini')return {ok:false,diagnostics:[diag('PRESENTATION_BACKEND_SUBSET',BASE+'/form','This bounded before/after comparison table is currently qualified only for the pinned Lini backend.')]};
  return compileLiniBeforeAfterPresentation(visual);
 }
 if(visual.kind==='comparison'&&visual.form==='matrix'){
  if(backend!=='lini')return {ok:false,diagnostics:[diag('PRESENTATION_BACKEND_SUBSET',BASE+'/form','This bounded typed comparison matrix is currently qualified only for the pinned Lini backend.')]};
  return compileLiniMatrixPresentation(visual);
 }
 if(rich&&backend!=='lini')return {ok:false,diagnostics:[diag('PRESENTATION_BACKEND_SUBSET',BASE+'/form','This tree or sequence presentation is currently qualified only for the native Lini backend.')]};
 if(visual.kind==='state'&&(visual.form==='machine'||visual.form==='lifecycle')&&backend!=='lini')return compileStatePresentation(visual,backend,dir);
 if(visual.kind==='timeline'&&(visual.form==='history'||visual.form==='milestones')&&backend!=='lini')return compileTimelinePresentation(visual,backend);
 if(backend==='lini')return compileLiniPresentation(visual,dir);
 const errors:PresentationDiagnostic[]=[];
 const map:PresentationElement[]=[],omissions:PresentationOmission[]=[],approximations:PresentationApproximation[]=[];
 const addMap=(logicalId:string,sourcePath:string,nativeId:string,kind:PresentationElement['kind'])=>map.push({logicalId,sourcePath,nativeId,kind});
 const approx=(sourcePath:string,requested:string,representation:string,code?:PresentationApproximation['code'])=>approximations.push({sourcePath,requested,representation,...(code?{code}:{})});
 const omit=(sourcePath:string,reason:string)=>omissions.push({sourcePath,reason});
 addMap(visual.id,BASE,'visual','visual');
 const title=visual.title??visual.question;
 if(visual.title&&visual.question!==visual.title)omit(path('/question'),'The source question is distinct from the concise display title and remains in the original document.');
 if(visual.takeaway)omit(path('/takeaway'),'Takeaway remains in the definition source; the presentation image uses the concise display title only.');
 if(visual.source)omit(path('/source'),'Source provenance remains in the original UMF document and is not embedded in diagram geometry.');
 if(visual.omissions)for(let i=0;i<visual.omissions.length;i++)omit(path('/omissions/'+i),'Authored omission inventory is retained in the source document, not drawn.');

 const nodes=visual.nodes??[],groups=visual.groups??[],edges=visual.edges??[];
 const neutralMermaidEntityView=backend==='mermaid'&&visual.kind==='structure'&&visual.form==='entities'&&(
  (visual.structure?.references??[]).some(reference=>!reference.identification||(!reference.fromMultiplicity&&!reference.fromCardinality)||(!reference.toMultiplicity&&!reference.toCardinality))
  ||(visual.structure?.entities??[]).some(entity=>entity.fields.some(field=>!field.type||!/^[A-Za-z\u00C0-\uFFFF][A-Za-z0-9_\-()[\]\u00C0-\uFFFF]*$/u.test(field.type)||!/^[A-Za-z_*\u00C0-\uFFFF][A-Za-z0-9_\-()[\]\u00C0-\uFFFF]*$/u.test(field.name)))
 );
 const nodeIds=new Map(nodes.map((n,i)=>[n.id,safeId('n',i)]));
 const annotationIds=new Map((visual.annotations??[]).map((annotation,i)=>[annotation.id,safeId('a',i)]));
 const groupIds=new Map(groups.map((g,i)=>[g.id,safeId('g',i)]));
 const edgeIds=new Map(edges.map((e,i)=>[e.id,safeId('e',i)]));
 const layerIds=new Map((visual.structure?.layers??[]).map((l,i)=>[l.id,safeId('l',i)]));
 const wrap=(text:string,limit=22)=>text.split('\n').flatMap(line=>{const words=line.split(/\s+/);const out:string[]=[];let current='';for(const word of words){if(current&&current.length+1+word.length>limit){out.push(current);current=word;}else current=current?current+' '+word:word;}if(current)out.push(current);return out;}).join('\n');
 const labelNode=(n:VisualNode)=>[n.icon?wrap('Icon: '+n.icon):undefined,wrap(n.label),n.detail?wrap(n.detail,38):undefined,processRoleCaption(n),...(n.ports??[]).map(port=>wrap('Port '+portCaption(port),32))].filter(Boolean).join('\n');
 const labelGroup=(g:VisualGroup)=>{const generatedTier=visual.kind==='flow'&&visual.form==='zoned'&&g.tier!==undefined?'Tier '+g.tier:undefined;return[wrap(g.label),g.detail?wrap(g.detail,38):undefined,generatedTier&&g.label!==generatedTier?generatedTier:undefined].filter(Boolean).join('\n');};
 const orderedFlowItems=(items:Array<VisualGroup|VisualNode>,order:string[]|undefined,authoredLayout=false):Array<VisualGroup|VisualNode>=>{
  if(visual.kind!=='flow'||visual.form!=='zoned'||order||authoredLayout)return ordered(items,order);
  return orderTiered(items.map(item=>({id:item.id,tier:groups.find(group=>group.id===item.id)?.tier,item}))).map(entry=>entry.item);
 };
 const labelLayer=(layer:{label:string;detail?:string})=>[wrap(layer.label),layer.detail?wrap(layer.detail,38):undefined].filter(Boolean).join('\n');
 const mapPorts=(node:VisualNode,index:number)=>node.ports?.forEach((port,portIndex)=>{
  const portPath=path('/nodes/'+index+'/ports/'+portIndex);
  addMap(port.id,portPath,backend==='mermaid'?nodeIds.get(node.id)!:nativePortId(nodeIds.get(node.id)!,portIndex),'port');
  if(backend==='mermaid')approx(portPath,'Named port '+port.id+(port.label?' ('+port.label+')':'')+' at '+(port.side??'unspecified')+' side','The port label is shown on its host node, which is the actual mapped native carrier; Mermaid has no distinct named port row or side attachment, including for ports without linked edges.');
  else if(backend==='graphviz'&&port.side)approx(portPath+'/side','Port side '+port.side,'Graphviz applies the compass side to the named HTML row port. The row attachment can differ from the outer node glyph boundary; source and row identity remain native.');
 });
 nodes.forEach((n,i)=>{if(n.evidence)omit(path('/nodes/'+i+'/evidence'),'Evidence locators remain in UMF and are not drawn in the presentation view.');if(n.icon)approx(path('/nodes/'+i+'/icon'),'Icon '+n.icon,'The icon name is retained as a visible caption in the native node label; Graphviz and Mermaid do not have the corresponding qualified UMF icon carrier.');if(backend==='mermaid'&&!(visual.kind==='structure'&&visual.form==='entities')&&n.shape==='folded-corner')approx(path('/nodes/'+i+'/shape'),'Node shape folded-corner','Mermaid renders its native doc silhouette with a wavy footer; the requested folded-corner contour is represented by that located native document approximation.');});
 edges.forEach((e,i)=>{if(e.evidence)omit(path('/edges/'+i+'/evidence'),'Evidence locators remain in UMF and are not drawn in the presentation view.');});
 if(visual.kind==='flow'){
  nodes.forEach((n,i)=>{if(n.layer)omit(path('/nodes/'+i+'/layer'),'Stack layer membership is outside the flow/network view.');});
  for(const key of ['layers','entities','references'] as const)if(visual.structure?.[key])omit(path('/structure/'+key),'Structure metadata is outside the flow/network view.');
 }
 if(visual.kind==='flow'||visual.form==='stack')for(let i=0;i<nodes.length;i++){addMap(nodes[i]!.id,path('/nodes/'+i),nodeIds.get(nodes[i]!.id)!,'node');mapPorts(nodes[i]!,i);}
 if(visual.kind==='flow'){
  for(let i=0;i<groups.length;i++)addMap(groups[i]!.id,path('/groups/'+i),groupIds.get(groups[i]!.id)!,'group');
  for(let i=0;i<edges.length;i++)addMap(edges[i]!.id,path('/edges/'+i),edgeIds.get(edges[i]!.id)!,'edge');
 }

 if(visual.kind==='structure'&&visual.form==='entities'){
  const structure=visual.structure!;const entities=structure.entities??[];const nodeById=new Map(nodes.map(n=>[n.id,n]));
  const references=structure.references??[];
  const entityNative=new Map(nodes.map(n=>[n.id,nodeIds.get(n.id)!]));
  const fieldNative=new Map<string,string>();
  for(let i=0;i<nodes.length;i++)if(!entities.some(e=>e.node===nodes[i]!.id)){addMap(nodes[i]!.id,path('/nodes/'+i),entityNative.get(nodes[i]!.id)!,'node');mapPorts(nodes[i]!,i);}
  for(let i=0;i<entities.length;i++){
   const e=entities[i]!,node=nodeById.get(e.node)!;const id=entityNative.get(e.node)!;
   addMap(e.node,path('/structure/entities/'+i),id,'entity');
   mapPorts(node,nodes.indexOf(node));
   e.fields.forEach((f,j)=>{const fid=f.id??f.name;const native=backend==='graphviz'?id+'_f'+(j+1):neutralMermaidEntityView?id:id+'.'+f.name;fieldNative.set(e.node+'\0'+fid,native);fieldNative.set(e.node+'\0'+f.name,native);addMap(fid,path('/structure/entities/'+i+'/fields/'+j),native,'field');});
  }
  if(backend==='graphviz')for(let i=0;i<(structure.references??[]).length;i++)addMap(structure.references![i]!.id,path('/structure/references/'+i),safeId('r',i),'reference');
  else if(neutralMermaidEntityView)for(let i=0;i<references.length;i++)addMap(references[i]!.id,path('/structure/references/'+i),safeId('r',i),'reference');
  else for(let i=0;i<(structure.references??[]).length;i++)omit(path('/structure/references/'+i+'/id'),'Mermaid ER draws this relationship but does not provide a qualified user-assigned native relationship identifier.');
  if(backend==='graphviz'){
   const entityDirection=layoutDirection(visual.layout,dir);
   const lines=['digraph UMFPresentation {','  graph [rankdir='+dot(entityDirection)+', bgcolor="transparent", pad="0.34", nodesep="0.56", ranksep="0.72", splines=true, overlap=false, fontname="Arial", fontsize=22, fontcolor="#203746", labelloc="t", label='+dot(displayTitle(visual))+'];','  node [shape=plain, fontname="Arial", fontsize=15, fontcolor="#203746"];','  edge [fontname="Arial", fontsize=12, color="#617984", fontcolor="#304652", penwidth=1.7, dir=none];'];
   const entityRows=new Map<string,string>(),standaloneRows=new Map<string,string>();
   for(let i=0;i<entities.length;i++){
    const e=entities[i]!,n=nodeById.get(e.node)!,id=entityNative.get(e.node)!;const rows=[`<TR><TD BGCOLOR="#e6eff2" ALIGN="LEFT" CELLPADDING="9">${n.icon?'<FONT POINT-SIZE="9">Icon: '+dotHtml(n.icon)+'</FONT><BR/>':''}<B>${dotHtml(n.label)}</B>${n.detail?'<BR/><FONT POINT-SIZE="10">'+dotHtml(n.detail)+'</FONT>':''}${n.shape?'<BR/><FONT POINT-SIZE="9">Requested node shape: '+dotHtml(shapeOptions[n.shape]!.label)+'</FONT>':''}</TD></TR>`];
    if(n.shape)approx(path('/nodes/'+nodes.indexOf(n)+'/shape'),'Node shape '+n.shape,'Graphviz entity tables require a tabular card silhouette; the requested shape is displayed as a visible header annotation.');
    for(let j=0;j<e.fields.length;j++){
     const f=e.fields[j]!,port=id+'_f'+(j+1),keys=(f.keys??[]).map(k=>k.toUpperCase()).join(', '),nullable=f.nullable===undefined?'':f.nullable?'NULL':'NOT NULL';
     const left=[keys,nullable].filter(Boolean).join(' · ');const right=[f.name,f.type].filter(Boolean).join(': ');
     rows.push(`<TR><TD PORT="${port}" ALIGN="LEFT" CELLPADDING="6" BORDER="1" COLOR="#c8d6da">${left?'<FONT COLOR="#5b7480" POINT-SIZE="12">'+dotHtml(left)+'</FONT>  ':''}${dotHtml(right)}</TD></TR>`);
    }
    for(let j=0;j<(n.ports??[]).length;j++){const port=n.ports![j]!;rows.push(`<TR><TD PORT="p${j+1}" ALIGN="LEFT" CELLPADDING="4" BORDER="1" COLOR="#8aa0a7"><FONT COLOR="#536e78" POINT-SIZE="11">${dotHtml(portCaption(port))}</FONT></TD></TR>`);}
    if(!e.fields.length)rows.push('<TR><TD ALIGN="LEFT" CELLPADDING="6"><FONT COLOR="#607780">(no fields declared)</FONT></TD></TR>');
    entityRows.set(e.node,'  '+id+' [label=< <TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="0" BGCOLOR="white">'+rows.join('')+'</TABLE> >, tooltip='+dot(n.label)+'];');
   }
   for(const n of nodes)if(!entities.some(e=>e.node===n.id)){const id=entityNative.get(n.id)!;standaloneRows.set(n.id,'  '+id+' [label='+dot(labelNode(n))+nodeStyle(n)+'];');}
   const entityComponents=nodes.map(node=>({id:node.id,row:entityRows.get(node.id)??standaloneRows.get(node.id)})).filter((item):item is {id:string;row:string}=>item.row!==undefined);
   const orderedEntityComponents=visual.layout?.order?ordered(entityComponents,visual.layout.order):[
    ...entities.map(entity=>entityComponents.find(item=>item.id===entity.node)).filter((item):item is {id:string;row:string}=>!!item),
    ...nodes.filter(node=>!entities.some(entity=>entity.node===node.id)).map(node=>entityComponents.find(item=>item.id===node.id)!).filter(Boolean),
   ];
   for(const item of orderedEntityComponents)lines.push(item.row);
   if(visual.layout?.order){const ids=visual.layout.order.map(id=>entityNative.get(id)).filter((id):id is string=>!!id);for(let i=0;i<ids.length-1;i++)lines.push('  '+ids[i]+' -> '+ids[i+1]+' [style=invis, weight=100];');}
   if(visual.layout?.kind==='grid'&&visual.layout.columns>1)approx(path('/layout'),'Grid layout with '+visual.layout.columns+' columns','Graphviz preserves authored entity order with invisible constraints; exact fixed grid columns are not native under routed ER references.');
   for(let i=0;i<(structure.references??[]).length;i++){
    const r=structure.references![i]!,fromField=r.from.fieldId??r.from.field,toField=r.to.fieldId??r.to.field;
    const from=entityNative.get(r.from.node)!,to=entityNative.get(r.to.node)!;
    const fromFieldPort=fromField?fieldNative.get(r.from.node+'\0'+fromField):undefined,toFieldPort=toField?fieldNative.get(r.to.node+'\0'+toField):undefined;
    const fromNode=nodeById.get(r.from.node),toNode=nodeById.get(r.to.node),fromNamedPort=findPort(fromNode,r.from.portId),toNamedPort=findPort(toNode,r.to.portId);
    const sideCode={north:'n',east:'e',south:'s',west:'w'} as const;
    const fromPort=fromNamedPort?'p'+(fromNode!.ports!.indexOf(fromNamedPort)+1)+(fromNamedPort.side?':'+sideCode[fromNamedPort.side]:''):fromFieldPort,toPort=toNamedPort?'p'+(toNode!.ports!.indexOf(toNamedPort)+1)+(toNamedPort.side?':'+sideCode[toNamedPort.side]:''):toFieldPort;
    if((fromField&&!fromFieldPort)||(toField&&!toFieldPort)||(r.from.portId&&!fromNamedPort)||(r.to.portId&&!toNamedPort)){errors.push(diag('PRESENTATION_ENDPOINT',path('/structure/references/'+i),'A reference endpoint does not resolve to a rendered field or declared port.'));continue;}
    const ends=[multiplicityText(r.fromMultiplicity,r.fromCardinality),multiplicityText(r.toMultiplicity,r.toCardinality)];
    // Cardinalities beside field ports collide with the compact table rows on
    // dense ER layouts. Keep them with their relationship label in from→to
    // order so the ownership is explicit and the field-row text stays clear.
    const identification=r.identification,identificationLabel=identification?(identification==='identifying'?'Identifying':'Non-identifying'):undefined;
    const relationLabel=[identificationLabel,r.label,ends.some(Boolean)?'('+ (ends[0]||'unspecified')+' → '+(ends[1]||'unspecified')+')':undefined].filter(Boolean).join('\n');
    const attrs=[relationLabel?'label='+dot(relationLabel):undefined,identification==='non-identifying'?'style=dashed':undefined,visual.layout?.order?'constraint=false':undefined].filter(Boolean).join(', ');
    lines.push('  '+from+(fromPort?':'+fromPort:'')+' -> '+to+(toPort?':'+toPort:'')+' [id='+dot(safeId('r',i))+(attrs?', '+attrs:'')+'];');
   }
   if(errors.length)return {ok:false,diagnostics:errors};
   for(const key of ['groups','edges'] as const)if(visual[key])omit(path('/'+key),'The entity view is driven by structure.entities/references; unrelated visual '+key+' are not drawn.');
   nodes.forEach((n,i)=>{for(const key of ['role','status','emphasis','group','parent','layer'] as const)if(n[key]!==undefined)omit(path('/nodes/'+i+'/'+key),'This node property is outside the entity view.');});
   if(structure.layers)omit(path('/structure/layers'),'Layer placement is outside the entity view.');
   if(visual.steps)omit(path('/steps'),'Walkthrough steps are not part of the entity relationship view.');
   if(visual.audience)omit(path('/audience'),'Audience metadata is retained in UMF but not drawn.');
   lines.push('}');
   return {ok:true,profileId:'umf.visual.presentation/1',backend,nativeFormat:'dot',source:lines.join('\n')+'\n',elementMap:map,omissions,approximations};
  }
   if(neutralMermaidEntityView){
    const direction=layoutDirection(visual.layout,'LR');
    const widthRows:string[]=[];
    for(const entity of entities){const node=nodeById.get(entity.node)!;if(node.icon)widthRows.push('Icon: '+node.icon);widthRows.push(node.label);if(node.detail)widthRows.push(node.detail);if(node.shape)widthRows.push('Shape: '+shapeOptions[node.shape]!.label);widthRows.push(...entity.fields.map(mermaidNeutralFieldRow),...(node.ports??[]).map(port=>'Port '+portCaption(port)));}
    for(const node of nodes)if(!entities.some(entity=>entity.node===node.id)){if(node.icon)widthRows.push('Icon: '+node.icon);widthRows.push(node.label);if(node.detail)widthRows.push(node.detail);if(node.shape)widthRows.push('Shape: '+shapeOptions[node.shape]!.label);widthRows.push(...(node.ports??[]).map(port=>'Port '+portCaption(port)));}
    const lines=[...mermaidNeutralHeader(visual,mermaidNeutralWrappingWidth(widthRows,nodes.length,references.length)),'flowchart '+direction];
    if(references.length)approx(path('/structure/references'),'Entity references in a neutral Mermaid flowchart profile','Mermaid uses unarrowed flowchart associations. Only authored identification, endpoint references, and endpoint cardinalities are shown as text; unspecified values are not inferred.');
    for(const {entity,index} of entities.map((entity,index)=>({entity,index}))){
     const node=nodeById.get(entity.node)!,id=entityNative.get(entity.node)!;
     const fields=entity.fields.map(mermaidNeutralFieldRow);
     const shape=node.shape?shapeOptions[node.shape]!.label:undefined;
     const content=[node.icon?'Icon: '+node.icon:undefined,node.label,node.detail,shape?'Shape: '+shape:undefined,...fields,...(node.ports??[]).map(port=>'Port '+portCaption(port))].filter((part):part is string=>!!part).join('\n');
     lines.push('  '+id+'["'+mermaidText(content)+'"]');
     if(node.shape)approx(path('/nodes/'+nodes.indexOf(node)+'/shape'),'Node shape '+node.shape,'The requested node shape is retained as visible text inside the neutral Mermaid card; the card outline is renderer policy.');
     for(const key of ['role','status','emphasis'] as const)if(node[key]!==undefined)omit(path('/nodes/'+nodes.indexOf(node)+'/'+key),'This neutral Mermaid card profile does not encode this node property.');
     for(let j=0;j<entity.fields.length;j++)if(entity.fields[j]!.nullable!==undefined)approx(path('/structure/entities/'+index+'/fields/'+j+'/nullable'),entity.fields[j]!.nullable?'Nullable field':'Non-nullable field','Mermaid flowchart preserves the authored nullability as exact row text; the row is a labelled card, not a native schema field declaration.');
    }
    for(const node of nodes)if(!entities.some(entity=>entity.node===node.id)){
     lines.push('  '+entityNative.get(node.id)+'["'+mermaidText([node.icon?'Icon: '+node.icon:undefined,node.label,node.detail,node.shape?'Shape: '+shapeOptions[node.shape]!.label:undefined,...(node.ports??[]).map(port=>'Port '+portCaption(port))].filter(Boolean).join('\n'))+'"]');
     if(node.shape)approx(path('/nodes/'+nodes.indexOf(node)+'/shape'),'Node shape '+node.shape,'The requested node shape is retained as visible text inside the neutral Mermaid card; the card outline is renderer policy.');
     for(const key of ['role','status','emphasis'] as const)if(node[key]!==undefined)omit(path('/nodes/'+nodes.indexOf(node)+'/'+key),'This neutral Mermaid card profile does not encode this node property.');
    }
    for(let i=0;i<references.length;i++){
     const reference=references[i]!,from=entityNative.get(reference.from.node)!,to=entityNative.get(reference.to.node)!;
     const endpoint=(side:'from'|'to')=>{const value=reference[side];return value.fieldId?side+' field ID: '+value.fieldId:value.field?side+' field: '+value.field:value.portId?side+' port ID: '+value.portId:undefined;};
     if(reference.from.fieldId||reference.from.field||reference.from.portId)approx(path('/structure/references/'+i+'/from'),'Field or port endpoint '+(reference.from.fieldId??reference.from.field??reference.from.portId),'The neutral Mermaid association attaches to the endpoint entity card; the exact authored endpoint identity is included in its visible label because no field/port anchor is asserted.');
     if(reference.to.fieldId||reference.to.field||reference.to.portId)approx(path('/structure/references/'+i+'/to'),'Field or port endpoint '+(reference.to.fieldId??reference.to.field??reference.to.portId),'The neutral Mermaid association attaches to the endpoint entity card; the exact authored endpoint identity is included in its visible label because no field/port anchor is asserted.');
     const cardinalities=[multiplicityText(reference.fromMultiplicity,reference.fromCardinality),multiplicityText(reference.toMultiplicity,reference.toCardinality)];
     const label=[reference.identification?reference.identification==='identifying'?'Identifying':'Non-identifying':undefined,reference.label,endpoint('from'),endpoint('to'),cardinalities.some(Boolean)?cardinalities.map(value=>value||'unspecified').join(' → '):undefined].filter(Boolean).join(' · ');
     lines.push('  '+from+' r'+(i+1)+'@---'+(label?'|'+mermaidText(label)+'|':'')+' '+to);
    }
    if(visual.layout?.order){const ids=visual.layout.order.map(id=>entityNative.get(id)).filter((id):id is string=>!!id);for(let i=0;i<ids.length-1;i++)lines.push('  '+ids[i]+' ~~~ '+ids[i+1]);}
    if(visual.layout?.kind==='grid'&&visual.layout.columns>1)approx(path('/layout'),'Grid layout with '+visual.layout.columns+' columns','Mermaid preserves authored entity order but does not encode an exact fixed grid column count.');
    for(const key of ['groups','edges'] as const)if(visual[key])omit(path('/'+key),'The entity view is driven by structure.entities/references; unrelated visual '+key+' are retained in UMF but are not drawn.');
    nodes.forEach((node,index)=>{for(const key of ['group','parent','layer'] as const)if(node[key]!==undefined)omit(path('/nodes/'+index+'/'+key),'This node property is outside the neutral Mermaid entity-card view.');});
    if(structure.layers)omit(path('/structure/layers'),'Layer placement is outside the entity view.');
    if(visual.audience)omit(path('/audience'),'Audience metadata is retained in UMF but not drawn.');
    if(visual.steps)omit(path('/steps'),'Walkthrough steps are not part of the entity relationship view.');
    return {ok:true,profileId:'umf.visual.presentation/1',backend,nativeFormat:'mermaid',source:lines.join('\n')+'\n',elementMap:map,omissions,approximations};
   }
   const erDirection=layoutDirection(visual.layout,'LR');
   const lines=[...mermaidHeader(visual),'erDiagram','  direction '+erDirection];
   const orderedEntities=visual.layout?.order?ordered(entities.map((entity,index)=>({id:entity.node,entity,index})),visual.layout.order):entities.map((entity,index)=>({id:entity.node,entity,index}));
  for(const {entity:e,index:i} of orderedEntities){
   const n=nodeById.get(e.node)!,id=entityNative.get(e.node)!;
   const entityLabel=(n.icon?'Icon: '+n.icon+' · ':'')+n.label+(n.shape?' · '+shapeOptions[n.shape]!.label:'');
   lines.push('  '+id+'["'+mermaidText(entityLabel)+'"] {');
   if(n.shape)approx(path('/nodes/'+nodes.indexOf(n)+'/shape'),'Node shape '+n.shape,'Mermaid ER uses its native entity-card shape; the requested shape is shown in the entity header.');
   for(const key of ['detail','role','status','emphasis'] as const)if(n[key]!==undefined)omit(path('/nodes/'+nodes.indexOf(n)+'/'+key),'Mermaid ER has no qualified entity-header carrier for this node property; Graphviz renders it.');
   for(let j=0;j<e.fields.length;j++){
    const f=e.fields[j]!;const type=f.type;
    if(!type||!/^[A-Za-z\u00C0-\uFFFF][A-Za-z0-9_\-()[\]\u00C0-\uFFFF]*$/u.test(type)||!/^[A-Za-z_*\u00C0-\uFFFF][A-Za-z0-9_\-()[\]\u00C0-\uFFFF]*$/u.test(f.name)){errors.push(diag('PRESENTATION_MERMAID_FIELD',path('/structure/entities/'+i+'/fields/'+j),'Mermaid ER cannot safely tokenize this field name or type; use Graphviz to display it exactly.'));continue;}
    const tags=(f.keys??[]).map(k=>k.toUpperCase()).join(', ');
    const nullability=f.nullable===true?' "NULL"':f.nullable===false?' "NOT NULL"':'';
    lines.push('    '+type+' '+f.name+(tags?' '+tags:'')+nullability);
    if(f.nullable!==undefined)approx(path('/structure/entities/'+i+'/fields/'+j+'/nullable'),f.nullable?'Nullable field':'Non-nullable field',`Mermaid presents the authored type unchanged and displays ${f.nullable?'"NULL"':'"NOT NULL"'} as a renderer comment.`);
   }
   lines.push('  }');
  }
  if(visual.layout?.kind==='grid'&&visual.layout.columns>1)approx(path('/layout'),'Grid layout with '+visual.layout.columns+' columns','Mermaid ER preserves authored entity declaration order but has no fixed native grid column count.');
  for(const n of nodes)if(!entities.some(e=>e.node===n.id)){const id=entityNative.get(n.id)!;lines.push('  '+id+'["'+mermaidText((n.icon?'Icon: '+n.icon+' · ':'')+n.label)+'"]');if(n.detail)omit(path('/nodes/'+nodes.indexOf(n)+'/detail'),'The Mermaid ER profile has no qualified entity-header detail carrier for this node.');}
  for(let i=0;i<(structure.references??[]).length;i++){
   const r=structure.references![i]!,from=entityNative.get(r.from.node)!,to=entityNative.get(r.to.node)!;
  if(!r.identification){errors.push(diag('PRESENTATION_MERMAID_RELATIONSHIP',path('/structure/references/'+i),'These references leave identification unspecified; Mermaid requires an explicit identifying or non-identifying choice.'));continue;}
   if(!r.fromMultiplicity&&!r.fromCardinality||!r.toMultiplicity&&!r.toCardinality){errors.push(diag('PRESENTATION_MERMAID_CARDINALITY',path('/structure/references/'+i),'Mermaid ER requires an endpoint cardinality; this relationship leaves one or both endpoint cardinalities unspecified.'));continue;}
   const left=mermaidCard(r.fromMultiplicity,r.fromCardinality,'left'),right=mermaidCard(r.toMultiplicity,r.toCardinality,'right');
   const multiplicities=[multiplicityText(r.fromMultiplicity,r.fromCardinality),multiplicityText(r.toMultiplicity,r.toCardinality)].filter(Boolean);
   const fromPort=findPort(nodeById.get(r.from.node),r.from.portId),toPort=findPort(nodeById.get(r.to.node),r.to.portId);
   if((r.from.portId&&!fromPort)||(r.to.portId&&!toPort)){errors.push(diag('PRESENTATION_PORT',path('/structure/references/'+i),'A reference port does not resolve within its endpoint entity.'));continue;}
   const portLabels=[fromPort?'from port '+(fromPort.label??fromPort.id)+' ('+fromPort.id+')':undefined,toPort?'to port '+(toPort.label??toPort.id)+' ('+toPort.id+')':undefined].filter(Boolean);
   const identLabel=r.identification==='identifying'?'Identifying':'Non-identifying';
   const label=mermaidText([identLabel,r.label,...portLabels,...(multiplicities.length?['['+multiplicities.join(' ↔ ')+']']:[])].filter(Boolean).join(' '));
   lines.push('  '+from+' '+left+(r.identification==='identifying'?'--':'..')+right+' '+to+' : "'+label+'"');
   if(r.from.field||r.from.fieldId||r.from.portId)approx(path('/structure/references/'+i+'/from'),'Field/port endpoint','Relationship attached to entity '+JSON.stringify(r.from.node)+' and exact endpoint text is added to its label because Mermaid ER has no field/port anchors.');
   if(r.to.field||r.to.fieldId||r.to.portId)approx(path('/structure/references/'+i+'/to'),'Field/port endpoint','Relationship attached to entity '+JSON.stringify(r.to.node)+' and exact endpoint text is added to its label because Mermaid ER has no field/port anchors.');
   if((r.fromMultiplicity&&!(r.fromMultiplicity.min===0&&r.fromMultiplicity.max===undefined))||(r.toMultiplicity&&!(r.toMultiplicity.min===0&&r.toMultiplicity.max===undefined))||r.fromCardinality||r.toCardinality)approx(path('/structure/references/'+i),'Exact endpoint multiplicities','Mermaid endpoint marks show cardinality conventions; explicit exact ranges are also placed in the relationship label.');
  }
  if(errors.length)return {ok:false,diagnostics:errors};
  for(const key of ['groups','edges'] as const)if(visual[key])omit(path('/'+key),'The entity view is driven by structure.entities/references; unrelated visual '+key+' are not drawn.');
  nodes.forEach((n,i)=>{for(const key of ['detail','role','status','emphasis','group','parent','layer'] as const)if(n[key]!==undefined)omit(path('/nodes/'+i+'/'+key),'This Mermaid ER profile uses the node label as its entity alias; Graphviz can show this additional node property.');});
  if(structure.layers)omit(path('/structure/layers'),'Layer placement is outside the entity view.');
  if(visual.steps)omit(path('/steps'),'Walkthrough steps are not part of the entity relationship view.');
  if(visual.takeaway){} // included in the visible title frontmatter
  if(visual.title&&visual.title!==visual.question){} // question is included in the visible title frontmatter
  if(errors.length)return {ok:false,diagnostics:errors};
  if(visual.audience)omit(path('/audience'),'Audience metadata is retained in UMF but not drawn.');
  return {ok:true,profileId:'umf.visual.presentation/1',backend,nativeFormat:'mermaid',source:lines.join('\n')+'\n',elementMap:map,omissions,approximations};
 }

 // Remaining supported views are flow or ordered stack diagrams.
 if(visual.kind==='structure'&&visual.form==='stack'){
  const layers=visual.structure?.layers??[];
  layers.forEach((l,i)=>addMap(l.id,path('/structure/layers/'+i),layerIds.get(l.id)!,'layer'));
  const nodeById=new Map(nodes.map(n=>[n.id,n]));
  if(backend==='graphviz'){
   const stackLayout=visual.layout,stackDirection=layoutDirection(stackLayout,'TB');
   const lines=['digraph UMFPresentation {','  graph [rankdir='+dot(stackDirection)+', bgcolor="transparent", pad="0.34", nodesep="0.44", ranksep="0.42", splines=ortho, compound=true, fontname="Arial", fontsize=22, fontcolor="#203746", labelloc="t", label='+dot(displayTitle(visual))+'];','  node [shape=box, style="rounded,filled", fillcolor="#e8f2f3", color="#577782", penwidth=1.7, fontname="Arial", fontsize=15, fontcolor="#203746", margin="0.22,0.17", width=3.0, height=0.78];','  edge [style=invis, weight=100];'];
   const layerNodeIds:string[]=[];
   for(let li=0;li<layers.length;li++){
    const layer=layers[li]!,lid=layerIds.get(layer.id)!;const members=nodes.filter(n=>n.layer===layer.id);layerNodeIds.push(lid+'_anchor');
    lines.push('  subgraph cluster_'+lid+' { label='+dot(labelLayer(layer))+'; style="rounded,filled"; color="#c9d7da"; fillcolor="#f6f8f8"; fontname="Arial"; fontsize=14; fontcolor="#455d66";');
   for(const n of ordered(members,stackLayout?.order)){if(n.shape==='multiple-documents'){approx(path('/nodes/'+nodes.indexOf(n)+'/shape'),'Node shape multiple-documents','Graphviz uses one native HTML-like node label with a bordered front sheet and offset top/right backing-sheet strokes. The page layers are one logical node; they do not encode a document count.');lines.push(graphvizMultipleDocumentStatement(n,nodeIds.get(n.id)!,'    '));}else lines.push('    '+nodeIds.get(n.id)+' [label='+dot(labelNode(n))+nodeStyle(n)+shapeOverride(n)+'];');}
    if(!members.length)lines.push('    '+lid+'_empty [label="(empty layer)", shape=plain, fontcolor="#71838a"];');
    lines.push('    '+lid+'_anchor [label="", shape=point, width=0.01, height=0.01, style=invis];');
    lines.push('  }');
   }
   if(layers.length>1){for(let i=0;i<layerNodeIds.length-1;i++)lines.push('  '+layerNodeIds[i]+' -> '+layerNodeIds[i+1]+' [style=invis, weight=100];');}
  for(const n of nodes)if(n.layer===undefined){if(n.shape==='multiple-documents'){approx(path('/nodes/'+nodes.indexOf(n)+'/shape'),'Node shape multiple-documents','Graphviz uses one native HTML-like node label with a bordered front sheet and offset top/right backing-sheet strokes. The page layers are one logical node; they do not encode a document count.');lines.push(graphvizMultipleDocumentStatement(n,nodeIds.get(n.id)!));}else lines.push('  '+nodeIds.get(n.id)+' [label='+dot(labelNode(n))+nodeStyle(n)+shapeOverride(n)+'];');}
   if(edges.length)omit(path('/edges'),'A stack is an ordered containment view; authored flow connections are not drawn to avoid conflating the two views.');
   if(groups.length)omit(path('/groups'),'Stack layer membership is rendered; independent visual groups are not represented.');
   if(visual.audience)omit(path('/audience'),'Audience metadata is retained in UMF but not drawn.');
   nodes.forEach((n,i)=>{for(const key of ['parent','group','role','status','emphasis'] as const)if(n[key]!==undefined)omit(path('/nodes/'+i+'/'+key),key==='parent'?'Nested node parent relationships are not represented alongside layer clusters.':'This node property is outside the stack layer view.');});
   if(visual.structure?.entities)omit(path('/structure/entities'),'Entity field declarations are outside the stack view.');
   if(visual.structure?.references)omit(path('/structure/references'),'Entity references are outside the stack view.');
   if(visual.steps)omit(path('/steps'),'Walkthrough steps are not part of the ordered stack view.');
   approx(BASE+'/structure/layers','Layer order','Graphviz invisible constraints express authored layer order without visible arrows.');
   lines.push('}');
   return {ok:true,profileId:'umf.visual.presentation/1',backend,nativeFormat:'dot',source:lines.join('\n')+'\n',elementMap:map,omissions,approximations};
  }
  // Mermaid subgraphs communicate layer membership; their vertical order is a renderer layout convention.
  const stackLayout=visual.layout,stackDirection=layoutDirection(stackLayout,'LR');
  const lines=[...mermaidHeader(visual),'flowchart '+stackDirection];
  const anchors:string[]=[];
  for(let li=0;li<layers.length;li++){
   const layer=layers[li]!,lid=layerIds.get(layer.id)!;lines.push('  subgraph '+lid+'["'+mermaidText(labelLayer(layer))+'"]');
   for(const n of ordered(nodes.filter(n=>n.layer===layer.id),stackLayout?.order))lines.push('    '+mermaidNodeDeclaration(n,nodeIds.get(n.id)!,mermaidText).trimStart());
   if(!nodes.some(n=>n.layer===layer.id))lines.push('    '+lid+'_empty["(empty layer)"]');
   const anchor=lid+'_order';anchors.push(anchor);lines.push('    '+anchor+'(( ))');
   lines.push('  end');
  }
  for(let i=0;i<anchors.length;i++)lines.push('  style '+anchors[i]+' fill:transparent,stroke:transparent,color:transparent,stroke-width:0px');
  for(let i=0;i<anchors.length-1;i++)lines.push('  '+anchors[i]+' ~~~ '+anchors[i+1]);
  for(const n of ordered(nodes.filter(n=>n.layer===undefined),stackLayout?.order))lines.push(mermaidNodeDeclaration(n,nodeIds.get(n.id)!,mermaidText));
  if(edges.length)omit(path('/edges'),'A stack is an ordered containment view; authored flow connections are not drawn to avoid conflating the two views.');
  if(groups.length)omit(path('/groups'),'Stack layer membership is rendered; independent visual groups are not represented.');
  nodes.forEach((n,i)=>{for(const key of ['parent','group','role','status','emphasis'] as const)if(n[key]!==undefined)omit(path('/nodes/'+i+'/'+key),key==='parent'?'Nested node parent relationships are not represented alongside layer subgraphs.':'This node property is outside the stack layer view.');});
  if(visual.structure?.entities)omit(path('/structure/entities'),'Entity field declarations are outside the stack view.');
  if(visual.structure?.references)omit(path('/structure/references'),'Entity references are outside the stack view.');
  if(visual.steps)omit(path('/steps'),'Walkthrough steps are not part of the ordered stack view.');
  approx(BASE+'/structure/layers','Layer order','Mermaid invisible links between renderer-only layer anchors enforce authored left-to-right order; the anchors are not authored visual nodes.');
  return {ok:true,profileId:'umf.visual.presentation/1',backend,nativeFormat:'mermaid',source:lines.join('\n')+'\n',elementMap:map,omissions,approximations};
 }

 // Flow family.
 const requestedRoutes=[...new Set(edges.flatMap(edge=>edge.routing?[edge.routing.kind]:[]))];
 const routeMode=requestedRoutes.length===1?requestedRoutes[0]:undefined;
 const mixedRouteIntent=requestedRoutes.length>1;
 const routeApproximation=(i:number,edge:NonNullable<Visual['edges']>[number],backendName:string,applicable:boolean,code?:PresentationApproximation['code'])=>{const reason=applicable?backendName:`${backendName} cannot apply both curved and straight edge intent per edge; this edge keeps the backend's default route and its requested ${edge.routing!.kind} geometry is not guaranteed.`;approximations.push({sourcePath:path('/edges/'+i+'/routing'),requested:'Edge routing '+edge.routing!.kind,representation:reason,...(code?{code}:{})});};
 if(backend==='graphviz'){
  const rootLayout=visual.layout,zonedFlow=visual.kind==='flow'&&visual.form==='zoned',zonedDefaultTb=zonedFlow&&!rootLayout&&optionValues.direction===undefined;
  const adaptivePipeline=backend==='graphviz'&&visual.kind==='flow'&&visual.form==='pipeline'&&!rootLayout&&optionValues.direction===undefined&&hasFlatPipelineNodes(nodes,groups);
  const pipelineOrientation=adaptivePipeline?estimateGraphvizDagOrientation(nodes,edges,labelNode,displayTitle(visual)):undefined;
  const flowDirection=layoutDirection(rootLayout,rootLayout?.kind==='stack'||rootLayout?.kind==='grid'?'TB':zonedDefaultTb?'TB':pipelineOrientation?.direction??dir);
  // Ungrouped TB network/pipeline diagrams with diamond-shaped nodes need larger
  // edge captions to remain legible after fitting their tall native layout.
  // The shape is only a structural selector; this changes no source meaning.
  const verticalDiamondFlowTypography=visual.kind==='flow'&&(visual.form==='network'||visual.form==='pipeline')&&rootLayout?.kind!=='circular'&&flowDirection==='TB'&&groups.length===0&&nodes.some(node=>node.shape==='diamond')&&nodes.every(node=>!node.group&&!node.parent);
  const circular=rootLayout?.kind==='circular'&&visual.kind==='flow'?ordered(nodes,rootLayout.order):[];
  const circularSize=(node:VisualNode)=>{const text=labelNode(node).split('\n'),portWidth=Math.max(0,...(node.ports??[]).map(port=>(port.label??port.id).length+port.id.length+8)),width=Math.max(1.35,...text.map(line=>line.length*.105+.38),portWidth*.085+.45),height=Math.max(.58,text.length*.22+.22);return{id:node.id,width,height};};
  const circleSizes=circular.map(circularSize);
  const circle=circular.length?circularPlacement(circleSizes,0.38):undefined;
  const circlePosition=new Map(circle?.positions.map(position=>[position.id,{x:position.x*72,y:-position.y*72}])??[]);
  const splines=routeMode==='curved'&&!mixedRouteIntent?'curved':routeMode==='straight'&&!mixedRouteIntent?'line':'true';
  const nodeDefaults=circle?'margin="0.12,0.10"':'margin="0.22,0.17", width=2.35, height=1.08';
  const lines=['digraph UMFPresentation {','  graph ['+(circle?'layout="neato",':'rankdir='+dot(flowDirection)+',')+' bgcolor="transparent", pad="0.34", nodesep="0.46", ranksep="'+graphvizDefaultRanksep.toFixed(2)+'", splines='+splines+', overlap=false, compound=true, fontname="Arial", fontsize=22, fontcolor="#203746", labelloc="t", label='+dot(displayTitle(visual))+'];','  node [shape=box, style="rounded,filled", fillcolor="#e8f2f3", color="#577782", penwidth=1.7, fontname="Arial", fontsize=16, fontcolor="#203746", '+nodeDefaults+'];','  edge [fontname="Arial", fontsize='+(verticalDiamondFlowTypography?'18':zonedFlow?'16':'12')+', color="#617984", fontcolor="#304652", penwidth=1.7, arrowsize=0.85];'];
  if(zonedDefaultTb)approx(path('/form'),'Default Graphviz direction TB for zoned groups','The renderer selects top-to-bottom placement when no caller direction or root layout is authored; literal tier values remain ordinal labels, not distance or timing.');
  if(pipelineOrientation)approx(path('/form'),'Default Graphviz direction '+pipelineOrientation.direction+' for a pipeline without an authored layout','A private text-and-rank extent estimate compares left-to-right and top-to-bottom fit in a 1600×900 presentation frame. The selected direction is a renderer placement choice; authored node and edge content, including return links, remains unchanged.');
  const nodeStatement=(n:VisualNode):string=>{
   const id=nodeIds.get(n.id)!;
   if(n.shape==='multiple-documents'){
    approx(path('/nodes/'+nodes.indexOf(n)+'/shape'),'Node shape multiple-documents','Graphviz uses one native HTML-like node label with a bordered front sheet and offset top/right backing-sheet strokes. The page layers are one logical node; they do not encode a document count.');
    return graphvizMultipleDocumentStatement(n,id);
   }
   const position=circlePosition.get(n.id),fixed=position?`, pos="${position.x.toFixed(2)},${position.y.toFixed(2)}!", pin=true`:'';
   const measured=position?circularSize(n):undefined,sizeAttrs=measured?`, width="${measured.width.toFixed(2)}", height="${measured.height.toFixed(2)}"`:'';
   if(!n.ports?.length)return '  '+id+' [label='+dot(labelNode(n))+nodeStyle(n)+shapeOverride(n)+sizeAttrs+fixed+'];';
    const portHtml=n.ports.map((port,portIndex)=>`<TR><TD PORT="p${portIndex+1}" ALIGN="LEFT" CELLPADDING="4" BORDER="1" COLOR="#c8d6da"><FONT COLOR="#536e78" POINT-SIZE="11">${dotHtml(portCaption(port))}</FONT></TD></TR>`).join('');
   const roleCaption=processRoleCaption(n)?'<BR/><FONT POINT-SIZE="11">Process</FONT>':'';
   return '  '+id+' [label=< <TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="0"><TR><TD ALIGN="LEFT" CELLPADDING="8"><B>'+dotHtml(n.label)+'</B>'+(n.detail?'<BR/><FONT POINT-SIZE="11">'+dotHtml(n.detail)+'</FONT>':'')+roleCaption+'</TD></TR>'+portHtml+'</TABLE> >'+nodeStyle(n)+shapeOverride(n)+sizeAttrs+fixed+'];';
  };
  const representative=(id:string):string|undefined=>{
   const node=nodes.find(n=>n.id===id);if(node)return nodeIds.get(id);
   const group=groups.find(g=>g.id===id);if(!group)return;
   const direct=nodes.find(n=>n.group===id);if(direct)return nodeIds.get(direct.id);
   for(const child of groups.filter(g=>g.parent===id)){const found=representative(child.id);if(found)return found;}
  };
  const layoutConstraints=(layout:VisualDefs['layout']|undefined,indent:string,layoutPath:string)=>{
   if(!layout?.order)return;
   const componentNodes=(id:string):Set<string>=>{
    if(nodes.some(node=>node.id===id))return new Set([id]);
    const direct=nodes.filter(node=>node.group===id&&!node.parent).map(node=>node.id),nested=groups.filter(group=>group.parent===id).flatMap(group=>[...componentNodes(group.id)]);
    return new Set([...direct,...nested]);
   };
   for(let i=0;i<layout.order.length-1;i++){
    const from=layout.order[i]!,to=layout.order[i+1]!,sourceNodes=componentNodes(from),targetNodes=componentNodes(to),alreadyOrdered=edges.some(edge=>edge.directed!==false&&sourceNodes.has(edge.from)&&targetNodes.has(edge.to));
    if(alreadyOrdered)continue;
    const source=representative(from),target=representative(to);if(source&&target)lines.push(indent+source+' -> '+target+' [style=invis, weight=100];');
   }
   if(layout.kind==='grid')approx(layoutPath,'Grid layout with '+layout.columns+' columns','Graphviz preserves component order with invisible constraints; fixed grid rows are not native semantics and rank grouping can conflict with routed edges.');
  };
  const rootComponents=[...groups.filter(group=>!group.parent),...nodes.filter(node=>!node.group&&!node.parent)];
  const lastRootComponent=rootLayout?.order?.at(-1)??rootComponents.at(-1)?.id;
  const annotationAnchor=lastRootComponent?representative(lastRootComponent):undefined;
  const children=(id:string)=>groups.filter(g=>g.parent===id),members=(id:string)=>nodes.filter(n=>n.group===id&&!n.parent);
  const emitGroup=(g:VisualGroup,indent:string)=>{
   const layout=g.layout,orientation=layout?layoutDirection(layout,'TB'):undefined;
   const gid=groupIds.get(g.id)!;lines.push(indent+'subgraph cluster_'+gid+' { label='+dot(labelGroup(g))+';'+(flowDirection==='TB'?' labeljust="l"; labelloc="b";':'')+' style="rounded,filled"; color="#c9d7da"; fillcolor="#f6f8f8"; fontname="Arial"; fontsize='+(zonedFlow?'16':'13')+'; fontcolor="#455d66";'+(orientation?' rankdir='+dot(orientation)+';':''));
   const items=orderedFlowItems([...children(g.id),...members(g.id)],layout?.order,!!layout);
   for(const item of items){if(groups.includes(item as VisualGroup))emitGroup(item as VisualGroup,indent+'  ');else lines.push(indent+nodeStatement(item as VisualNode).trimStart());}
   layoutConstraints(layout,indent+'  ',path('/groups/'+groups.indexOf(g)+'/layout'));
   if(layout?.kind==='grid'&&!layout.order)approx(path('/groups/'+groups.indexOf(g)+'/layout'),'Grid layout with '+layout.columns+' columns','Graphviz uses a native cluster rank approximation; exact grid geometry may vary with edge routing.');
   if(layout&&(layout.kind==='flow'||layout.kind==='stack')&&orientation!==flowDirection)approx(path('/groups/'+groups.indexOf(g)+'/layout'),'Nested '+layout.kind+' layout direction '+orientation,'Graphviz dot does not reliably honor a cluster rankdir that differs from the graph direction; native source retains the requested cluster direction, while component placement may follow the graph axis.');
   lines.push(indent+'}');
  };
  for(const g of orderedFlowItems(groups.filter(g=>!g.parent),rootLayout?.order,!!rootLayout) as VisualGroup[])emitGroup(g,'  ');
  for(const n of ordered(nodes.filter(n=>!n.group&&!n.parent),rootLayout?.order))lines.push(nodeStatement(n));
  for(const n of nodes)if(n.parent){
   const parent=nodeIds.get(n.parent),nid=nodeIds.get(n.id);if(parent&&nid){lines.push('  '+nid+' [label='+dot(labelNode(n))+nodeStyle(n)+shapeOverride(n)+'];');approx(path('/nodes/'+nodes.indexOf(n)+'/parent'),'Nested node parent','Parent relation shown as a dotted hierarchy connector.');lines.push('  '+parent+' -> '+nid+' [style=dotted, arrowhead=none, color="#aab9bd", constraint=false];');}
  }
  if(!circle)layoutConstraints(rootLayout,'  ',path('/layout'));
  if(visual.annotations?.length){
   lines.push('  subgraph { rank=sink;');
   for(let i=0;i<visual.annotations.length;i++){
    const annotation=visual.annotations[i]!,id=annotationIds.get(annotation.id)!;
    addMap(annotation.id,path('/annotations/'+i+'/id'),id,'annotation');
    lines.push('    '+id+' [shape=plaintext, style="", label='+dot(annotation.text)+', fontname="Arial", fontsize=14, fontcolor="#304652", color=none, fillcolor=none, penwidth=0, margin=0, width=0, height=0, fixedsize=false];');
    approx(path('/annotations/'+i+'/text'),'Unanchored annotation text','Graphviz emits a native plaintext carrier at the trailing rank. Its placement is renderer policy because the source provides no anchor or coordinates.');
   }
   lines.push('  }');
   if(annotationAnchor){let from=annotationAnchor;for(const annotation of visual.annotations){const to=annotationIds.get(annotation.id)!;lines.push('  '+from+' -> '+to+' [style=invis, weight=100, constraint=true];');from=to;}}
  }
  edges.forEach((e,i)=>{
   const fromNode=nodes.find(n=>n.id===e.from),toNode=nodes.find(n=>n.id===e.to),fromPort=findPort(fromNode,e.fromPort),toPort=findPort(toNode,e.toPort);
   if((e.fromPort&&!fromPort)||(e.toPort&&!toPort)){errors.push(diag('PRESENTATION_PORT',path('/edges/'+i),'A flow edge port reference does not resolve within its endpoint node.'));return;}
   const style=e.kind==='data'?'dashed':e.kind==='control'?'dotted':e.kind==='return'?'bold':'solid';
   const inferredBoundarySides=e.routing?.kind==='curved'&&!mixedRouteIntent&&!fromPort&&!toPort;
   const graphUsesCurvedSplines=routeMode==='curved'&&!mixedRouteIntent;
   const attrs=[e.label?(graphUsesCurvedSplines?'xlabel':'label')+'='+dot(e.label):undefined,graphUsesCurvedSplines&&e.label?'minlen='+graphvizCurvedLabelMinlen(e.label):undefined,e.why?'tooltip='+dot(e.why):undefined,'style='+dot(style),e.directed===false?'dir=none':undefined,inferredBoundarySides?'tailport=e':undefined,inferredBoundarySides?'headport=s':undefined,e.status==='placeholder'?'color="#ba8745"':e.status==='built'?'color="#668f78"':undefined,e.emphasis==='focus'?'penwidth=2.8':e.emphasis==='muted'?'color="#b8c4c7"':undefined].filter(Boolean).join(', ');
   const sideCode={north:'n',east:'e',south:'s',west:'w'} as const;
   const fromNative=nodeIds.get(e.from)!+(fromPort?':p'+(fromNode!.ports!.indexOf(fromPort)+1)+(fromPort.side?':'+sideCode[fromPort.side]:''):inferredBoundarySides?':e':''),toNative=nodeIds.get(e.to)!+(toPort?':p'+(toNode!.ports!.indexOf(toPort)+1)+(toPort.side?':'+sideCode[toPort.side]:''):inferredBoundarySides?':s':'');
   lines.push('  '+fromNative+' -> '+toNative+' [id='+dot(edgeIds.get(e.id)!) +(attrs?', '+attrs:'')+'];');
   if(e.routing){const routeApplicable=!mixedRouteIntent&&routeMode===e.routing.kind,routeCode=routeApplicable?undefined:'ROUTING_SCOPE_CONFLICT';routeApproximation(i,e,'Graphviz routing is graph-wide; the homogeneous declaration selects native splines='+routeMode+'.'+(inferredBoundarySides?' Native boundary compass sides east→south are selected because no named ports or sides were authored.':'')+' Exact control points and endpoint attachment coordinates remain native.',routeApplicable,routeCode);}
   if(graphUsesCurvedSplines&&e.label)approx(path('/edges/'+i+'/label'),'Edge label '+e.label,'Graphviz curved splines use the native external xlabel carrier because Graphviz does not support normal edge labels with splines=curved.');
   if(e.kind)approx(path('/edges/'+i+'/kind'),'Connection kind '+e.kind,'Rendered by the presentation/1 convention: action solid, data dashed, control dotted, return bold.');
   if(e.emphasis)approx(path('/edges/'+i+'/emphasis'),'Connection emphasis '+e.emphasis,'Rendered by the presentation/1 stroke weight/color convention.');
   if(e.status)approx(path('/edges/'+i+'/status'),'Connection status '+e.status,'Rendered by the presentation/1 status color convention.');
  });
  if(errors.length)return {ok:false,diagnostics:errors};
  for(let i=0;i<nodes.length;i++){
   const n=nodes[i]!;
   if(n.role)approx(path('/nodes/'+i+'/role'),'Node role '+n.role,n.role==='process'?'Rendered with the presentation/1 process color convention and visible “Process” caption; this names a depicted process/activity only.':'Rendered with the presentation/1 role shape/color convention.');
   if(n.status)approx(path('/nodes/'+i+'/status'),'Node status '+n.status,'Rendered with the presentation/1 status color convention.');
   if(n.emphasis)approx(path('/nodes/'+i+'/emphasis'),'Node emphasis '+n.emphasis,'Rendered with the presentation/1 stroke weight/color convention.');
  }
  groups.forEach((g,i)=>{for(const key of ['role','status','emphasis'] as const)if(g[key]!==undefined){if(visual.form==='lanes'&&key==='role'&&g.role==='lane')approx(path('/groups/'+i+'/role'),'Lane group role','The mapped native group container represents this declared lane and its members. Native placement is renderer-selected; no physical alignment, equal dimensions, or chronological order is implied.');else omit(path('/groups/'+i+'/'+key),'Group label and containment are visible; this group metadata is not encoded by cluster styling.');}if(g.tier!==undefined){if(visual.kind==='flow'&&visual.form==='zoned')approx(path('/groups/'+i+'/tier'),'Group tier '+g.tier,'The exact integer appears as “Tier '+g.tier+'” in this group’s native cluster caption. Without authored layout/order at this scope, declarations are emitted by ascending tier with stable source-order ties; Graphviz may position clusters differently to route edges. Tier values are ordinal labels, not calibrated distances.');else omit(path('/groups/'+i+'/tier'),'Group label and containment are visible; this metadata is not encoded by cluster styling.');}});
  edges.forEach((e,i)=>{if(e.why)approx(path('/edges/'+i+'/why'),'Connection rationale','Available as native hover tooltip; it is not persistently visible in a static presentation image.');});
  if(visual.steps)omit(path('/steps'),'Walkthrough step titles, captions, focus references, and throughout annotations remain in the UMF source; this static graph does not render or animate them.');
  if(visual.audience)omit(path('/audience'),'Audience metadata is retained in UMF but not drawn.');
  if(visual.source){} // already inventoried
  lines.push('}');
  return {ok:true,profileId:'umf.visual.presentation/1',backend,nativeFormat:'dot',source:lines.join('\n')+'\n',elementMap:map,omissions,approximations,...(circle?{execution:{runtime:'graphviz' as const,layoutEngine:'neato' as const,nodePositions:'fixed' as const}}:{})};
 }
 const rootLayout=visual.layout,flowDirection=layoutDirection(rootLayout,rootLayout?.kind==='stack'||rootLayout?.kind==='grid'?'TB':dir);
 if(rootLayout?.kind==='circular'&&backend==='mermaid'){
  if(nodes.some(node=>node.shape!==undefined&&node.shape!=='rectangle'||node.ports?.length||node.role||node.status||node.emphasis||node.icon)||edges.some(edge=>edge.kind!==undefined&&edge.kind!=='data'||edge.directed===false||edge.routing!==undefined&&edge.routing.kind!=='straight'||edge.label||edge.status||edge.emphasis))return {ok:false,diagnostics:[diag('PRESENTATION_MERMAID_CIRCULAR_SUBSET',BASE+'/layout','Mermaid circular block projection currently admits rectangular nodes without ports, roles, or node styling and directed, unlabeled, unstyled edges with absent or data kind and absent or straight routing.') ]};
  const pairs=new Set<string>();for(const edge of edges){const key=edge.from+'\0'+edge.to;if(pairs.has(key))return {ok:false,diagnostics:[diag('PRESENTATION_MERMAID_CIRCULAR_SUBSET',BASE+'/edges','Mermaid block connectors do not expose stable edge IDs; parallel links with identical endpoints are refused rather than conflated.') ]};pairs.add(key);}
  const circular=ordered(nodes,rootLayout.order),side=Math.max(5,Math.ceil(Math.sqrt(Math.max(1,circular.length))*3.5+1)|1),center=(side-1)/2,radius=center*.92,occupied=new Set<string>(),locations=new Map<string,{row:number;column:number}>();
  for(let i=0;i<circular.length;i++){
   const angle=2*Math.PI*i/circular.length,desired=circular.length===1?{column:center,row:center}:{column:center+radius*Math.cos(angle),row:center+radius*Math.sin(angle)};
   const candidates=Array.from({length:side*side},(_,index)=>({row:Math.floor(index/side),column:index%side})).sort((a,b)=>Math.hypot(a.row-desired.row,a.column-desired.column)-Math.hypot(b.row-desired.row,b.column-desired.column)||Math.abs(Math.hypot(a.row-center,a.column-center)-radius)-Math.abs(Math.hypot(b.row-center,b.column-center)-radius));
   const chosen=candidates.find(point=>!occupied.has(point.row+','+point.column));if(!chosen)return {ok:false,diagnostics:[diag('PRESENTATION_MERMAID_CIRCULAR_SUBSET',BASE+'/layout','This circular order cannot be placed on distinct Mermaid block cells without adding logical helper nodes.') ]};
   occupied.add(chosen.row+','+chosen.column);locations.set(circular[i]!.id,chosen);
  }
  const labelWidths=circular.map(node=>Math.max(node.label.length,node.detail?.length??0)),nodeWidth=Math.max(90,...labelWidths.map(length=>Math.ceil(length*9+24))),nodeHeight=Math.max(68,...circular.map(node=>node.detail?88:68));
  const blockText=(value:string)=>mermaidText(value).replace(/#32;/g,' ');
  const lines=['---','title: '+JSON.stringify(displayTitle(visual)),"config:",'  themeCSS: '.concat(JSON.stringify('.edge-pattern-dotted { stroke-dasharray: 6 4 !important; }')),'---','block-beta',`  columns ${side}`,`  heading["${blockText(displayTitle(visual))}"]:${side}`];
  for(let row=0;row<side;row++){const cells:string[]=[];for(let column=0;column<side;column++){const node=circular.find(item=>{const point=locations.get(item.id);return point?.row===row&&point.column===column;});if(!node)cells.push('space');else{const label=[node.label,node.detail,processRoleCaption(node)].filter((value):value is string=>!!value).map(blockText).join('<br/>');cells.push(`${nodeIds.get(node.id)}["${label}"]`);}}lines.push('  '+cells.join(' '));}
  lines.push(`  style heading fill:none,stroke:none,color:#203746,font-size:22px,height:46px,width:${side*nodeWidth}px`);
  for(const node of circular){const palette=node.role==='process'?'fill:#f4eef4,stroke:#8c6b87':node.role==='store'?'fill:#e8efff,stroke:#637cae':node.status==='built'?'fill:#e8f2ec,stroke:#668f78':'fill:#e8f2f3,stroke:#577782',id=nodeIds.get(node.id)!;lines.push(`  style ${id} ${palette},stroke-width:1.5px,width:${nodeWidth}px,height:${nodeHeight}px,font-size:16px`);}
  for(let i=0;i<edges.length;i++){
   const edge=edges[i]!,from=nodeIds.get(edge.from),to=nodeIds.get(edge.to);if(!from||!to)return {ok:false,diagnostics:[diag('PRESENTATION_ENDPOINT',path('/edges/'+i),'A circular edge endpoint is not a declared visual node.')]};
   const nativeId=`${from}-${to}`,mapIndex=map.findIndex(item=>item.kind==='edge'&&item.logicalId===edge.id);if(mapIndex>=0)map[mapIndex]={...map[mapIndex]!,nativeId};else addMap(edge.id,path('/edges/'+i),nativeId,'edge');const operator=edge.kind==='data'?'-.->':'-->';lines.push(`  ${from} ${operator} ${to}`);
   if(edge.routing)approx(path('/edges/'+i+'/routing'),'Edge routing straight','Mermaid block-beta routes block links through native smooth interpolation that can deviate from a direct chord; endpoint ownership and direction are checked against the emitted path.', 'ROUTING_NATIVE_INTERPOLATION');
   if(edge.kind==='data')approx(path('/edges/'+i+'/kind'),'Connection kind data','Mermaid 12.2 block-beta has a dotted native arrow but no native dashed connector selector. This source embeds a Mermaid frontmatter themeCSS rule that renders the data connector pattern dashed.');
   if(edge.why)omit(path('/edges/'+i+'/why'),'Connection rationale is retained in UMF but not visible in the static block diagram.');
  }
  approx(path('/layout'),'Circular node placement','Mermaid 12.2 block-beta places the authored clockwise node order on grid-quantized circular cells. Cell centers approximate the circle; native cells, edge paths, and endpoints remain individually visible.','CIRCULAR_NATIVE_GRID');
  if(visual.steps)omit(path('/steps'),'Walkthrough steps are retained in the UMF source and are not part of the static circular diagram.');
  if(visual.audience)omit(path('/audience'),'Audience metadata is retained in UMF but not drawn.');
  return {ok:true,profileId:'umf.visual.presentation/1',backend,nativeFormat:'mermaid',source:lines.join('\n')+'\n',elementMap:map,omissions,approximations};
 }
 const lines=[...mermaidHeader(visual),'flowchart '+flowDirection];
 let mermaidLinkIndex=0;
 const children=(id:string)=>groups.filter(g=>g.parent===id),members=(id:string)=>nodes.filter(n=>n.group===id&&!n.parent);
 const emitGroup=(g:VisualGroup,indent:string)=>{
  const gid=groupIds.get(g.id)!;lines.push(indent+'subgraph '+gid+'["'+mermaidText(labelGroup(g))+'"]');
  if(g.layout&&(g.layout.kind==='flow'||g.layout.kind==='stack')){
   const groupDirection=layoutDirection(g.layout,flowDirection);
   lines.push(indent+'  direction '+groupDirection);
   if(groupDirection!==flowDirection&&edges.some(edge=>nodes.some(node=>node.group===g.id&&node.id===edge.from)&&nodes.some(node=>node.group!==g.id&&node.id===edge.to)||nodes.some(node=>node.group===g.id&&node.id===edge.to)&&nodes.some(node=>node.group!==g.id&&node.id===edge.from)))approx(path('/groups/'+groups.indexOf(g)+'/layout'),'Nested '+g.layout.kind+' layout direction '+groupDirection,'Mermaid may override a subgraph direction when connections cross its boundary; the requested native direction is declared but placement may follow the outer graph.');
  }
  const components=[...children(g.id),...members(g.id)];
  for(const component of orderedFlowItems(components,g.layout?.order,!!g.layout)){if(groups.includes(component as VisualGroup))emitGroup(component as VisualGroup,indent+'  ');else lines.push(mermaidNodeDeclaration(component as VisualNode,nodeIds.get(component.id)!,mermaidText));}
  if(g.layout?.kind==='grid')approx(path('/groups/'+groups.indexOf(g)+'/layout'),'Grid layout with '+g.layout.columns+' columns','Mermaid supports subgraph direction and source order but no fixed grid column count.');
  if(g.layout?.order){const ids=g.layout.order.map(id=>nodeIds.get(id)??groupIds.get(id)).filter((id):id is string=>!!id);for(let i=0;i<ids.length-1;i++){lines.push(indent+'  '+ids[i]+' ~~~ '+ids[i+1]);mermaidLinkIndex++;}}
  lines.push(indent+'end');
 };
 for(const g of orderedFlowItems(groups.filter(g=>!g.parent),rootLayout?.order,!!rootLayout) as VisualGroup[])emitGroup(g,'  ');
  for(const n of ordered(nodes.filter(n=>!n.group&&!n.parent),rootLayout?.order))lines.push(mermaidNodeDeclaration(n,nodeIds.get(n.id)!,mermaidText));
  if(rootLayout?.kind==='grid')approx(path('/layout'),'Grid layout with '+rootLayout.columns+' columns','Mermaid preserves requested source ordering but has no native fixed grid column count.');
  if(rootLayout?.order){for(let i=0;i<rootLayout.order.length-1;i++){const from=rootLayout.order[i]!,to=rootLayout.order[i+1]!,mappedFrom=nodeIds.get(from)??groupIds.get(from),mappedTo=nodeIds.get(to)??groupIds.get(to);if(!mappedFrom||!mappedTo)continue;const alreadyOrdered=edges.some(edge=>edge.routing&&edge.directed!==false&&edge.from===from&&edge.to===to);if(!alreadyOrdered){lines.push('  '+mappedFrom+' ~~~ '+mappedTo);mermaidLinkIndex++;}}}
  if(visual.annotations?.length){
   const representative=(id:string):string|undefined=>{
    const node=nodes.find(item=>item.id===id);if(node)return nodeIds.get(id);
    const group=groups.find(item=>item.id===id);if(!group)return;
    const items=ordered([...groups.filter(item=>item.parent===id),...nodes.filter(item=>item.group===id&&!item.parent)],group.layout?.order),last=items.at(-1);
    return last?representative(last.id):undefined;
   };
   const rootComponents=ordered([...groups.filter(group=>!group.parent),...nodes.filter(node=>!node.group&&!node.parent)],rootLayout?.order),last=rootLayout?.order?.at(-1)??rootComponents.at(-1)?.id;
   let previous=last?representative(last):undefined;
   for(let i=0;i<visual.annotations.length;i++){
    const annotation=visual.annotations[i]!,id=annotationIds.get(annotation.id)!;
    addMap(annotation.id,path('/annotations/'+i+'/id'),id,'annotation');
    lines.push('  '+id+'@{ shape: text, label: "'+mermaidText(annotation.text)+'" }');
    if(previous){lines.push('  '+previous+' ~~~ '+id);mermaidLinkIndex++;}
    previous=id;
    approx(path('/annotations/'+i+'/text'),'Unanchored annotation text','Mermaid flowchart renders a native text-only shape. Its trailing placement follows invisible renderer-owned ordering constraints because the source gives no anchor or coordinates.');
   }
  }
 for(const n of nodes)if(n.parent){const parent=nodeIds.get(n.parent),nid=nodeIds.get(n.id);if(parent&&nid){lines.push('  '+nid+'["'+mermaidText(labelNode(n))+'"]');lines.push('  '+parent+' -.-> '+nid);approx(path('/nodes/'+nodes.indexOf(n)+'/parent'),'Nested node parent','Parent relation shown as a dotted hierarchy connector.');}}
 edges.forEach((e,i)=>{
  const fromNode=nodes.find(n=>n.id===e.from),toNode=nodes.find(n=>n.id===e.to),fromPort=findPort(fromNode,e.fromPort),toPort=findPort(toNode,e.toPort);
  if((e.fromPort&&!fromPort)||(e.toPort&&!toPort)){errors.push(diag('PRESENTATION_PORT',path('/edges/'+i),'A flow edge port reference does not resolve within its endpoint node.'));return;}
  const label=e.label,operator=e.directed===false?'---':'-->',edgeNativeId=edgeIds.get(e.id)!;lines.push('  '+nodeIds.get(e.from)+(e.routing?' '+edgeNativeId+'@':' ')+operator+(label?'|"'+mermaidText(label)+'"|':'')+' '+nodeIds.get(e.to));
  if(e.routing){const curve=e.routing.kind==='curved'?'natural':'linear';lines.push('  '+edgeNativeId+'@{ curve: '+curve+' }');routeApproximation(i,e,'Mermaid 12.2 edge-ID configuration requests native curve: '+curve+'. The pinned renderer may still emit a straight segment when its layout points are collinear; exact control points and endpoint attachment coordinates remain native.',true,'ROUTING_NATIVE_INTERPOLATION');}
  if(fromPort)approx(path('/edges/'+i+'/fromPort'),'From port '+fromPort.id,'The port ID, label, and side appear on the host node; Mermaid has no distinct named port carrier and does not attach this link to it.');
  if(toPort)approx(path('/edges/'+i+'/toPort'),'To port '+toPort.id,'The port ID, label, and side appear on the host node; Mermaid has no distinct named port carrier and does not attach this link to it.');
  const edgeStyle=e.kind==='data'?'stroke-dasharray: 5 5':e.kind==='control'?'stroke-dasharray: 2 5':e.kind==='return'?'stroke-width: 3':e.emphasis==='focus'?'stroke-width: 3':e.emphasis==='muted'?'stroke:#b8c4c7':'';
  if(edgeStyle)lines.push('  linkStyle '+mermaidLinkIndex+' '+edgeStyle);
  mermaidLinkIndex++;
  if(e.why)approx(path('/edges/'+i+'/why'),'Connection rationale','Mermaid flow has no persistent static-drawing rationale carrier; the source document retains it.');
  if(e.emphasis)approx(path('/edges/'+i+'/emphasis'),'Connection emphasis '+e.emphasis,'Rendered with presentation/1 link stroke styling.');
  if(e.kind)approx(path('/edges/'+i+'/kind'),'Connection kind '+e.kind,'Rendered by the presentation/1 line-pattern convention: action solid, data dashed, control dotted, return bold.');
  if(e.status)omit(path('/edges/'+i+'/status'),'Mermaid flow has no per-link status style in the presentation/1 convention.');
 });
 if(errors.length)return {ok:false,diagnostics:errors};
 for(const style of ['role_actor fill:#fff4dc,stroke:#be8741,stroke-width:2px','role_store fill:#e8efff,stroke:#637cae,stroke-width:2px','role_document fill:#f2ecfb,stroke:#8b72a6,stroke-width:2px','role_own fill:#e8f2ec,stroke:#668f78,stroke-width:2px','role_platform fill:#e8f2f3,stroke:#577782,stroke-width:2px','role_external fill:#f5f4ef,stroke:#96988e,stroke-width:2px','role_process fill:#f4eef4,stroke:#8c6b87,stroke-width:2px','status_built fill:#e8f2ec,stroke:#668f78','status_placeholder fill:#fff5e4,stroke:#ba8745','status_decided fill:#edf2f8,stroke:#71869b','status_unknown fill:#f2f3f3,stroke:#98a3a6','emphasis_focus stroke-width:3px','emphasis_muted opacity:0.55'])lines.push('  classDef '+style);
 nodes.forEach(n=>{const classes=[n.role?'role_'+n.role:undefined,n.status?'status_'+n.status:undefined,n.emphasis?'emphasis_'+n.emphasis:undefined].filter(Boolean);if(classes.length)lines.push('  class '+nodeIds.get(n.id)+' '+classes.join(',')+';');});
 if(visual.steps)omit(path('/steps'),'Walkthrough step titles, captions, focus references, and throughout annotations remain in the UMF source; this static graph does not render or animate them.');
 if(visual.audience)omit(path('/audience'),'Audience metadata is retained in UMF but not drawn.');
 nodes.forEach((n,i)=>{if(n.role)approx(path('/nodes/'+i+'/role'),'Node role '+n.role,n.role==='process'?'Rendered with the presentation/1 process color convention and visible “Process” caption; this names a depicted process/activity only.':'Rendered with the presentation/1 Mermaid role color convention.');if(n.status)approx(path('/nodes/'+i+'/status'),'Node status '+n.status,'Rendered with the presentation/1 Mermaid status color convention.');if(n.emphasis)approx(path('/nodes/'+i+'/emphasis'),'Node emphasis '+n.emphasis,'Rendered with the presentation/1 Mermaid emphasis stroke convention.');});
 groups.forEach((g,i)=>{for(const key of ['role','status','emphasis'] as const)if(g[key]!==undefined){if(visual.form==='lanes'&&key==='role'&&g.role==='lane')approx(path('/groups/'+i+'/role'),'Lane group role','The mapped native subgraph represents this declared lane and its members. Native placement is renderer-selected; no physical alignment, equal dimensions, or chronological order is implied.');else omit(path('/groups/'+i+'/'+key),'Group label and containment are visible; this metadata is not rendered by Mermaid presentation/1.');}if(g.tier!==undefined){if(visual.kind==='flow'&&visual.form==='zoned')approx(path('/groups/'+i+'/tier'),'Group tier '+g.tier,'The exact integer appears as “Tier '+g.tier+'” in this group’s native subgraph caption. Without authored layout/order at this scope, declarations are emitted by ascending tier with stable source-order ties; Mermaid may position subgraphs differently to route edges. Tier values are ordinal labels, not calibrated distances.');else omit(path('/groups/'+i+'/tier'),'Group label and containment are visible; this metadata is not rendered by Mermaid presentation/1.');}});
 return {ok:true,profileId:'umf.visual.presentation/1',backend,nativeFormat:'mermaid',source:lines.join('\n')+'\n',elementMap:map,omissions,approximations};
}

function nodeStyle(n:VisualNode):string {
 const shape=n.role==='actor'?'shape=ellipse, ':n.role==='store'?'shape=cylinder, ':n.role==='document'?'shape=note, ':'';
 const roleColor=n.role==='actor'?'fillcolor="#fff4dc", color="#be8741"':n.role==='store'?'fillcolor="#e8efff", color="#637cae"':n.role==='document'?'fillcolor="#f2ecfb", color="#8b72a6"':n.role==='own'?'fillcolor="#e8f2ec", color="#668f78"':n.role==='platform'?'fillcolor="#e8f2f3", color="#577782"':n.role==='external'?'fillcolor="#f5f4ef", color="#96988e"':n.role==='process'?'fillcolor="#f4eef4", color="#8c6b87"':'';
 const status=n.status==='placeholder'?'fillcolor="#fff5e4", color="#ba8745"':n.status==='built'?'fillcolor="#e8f2ec", color="#668f78"':n.status==='decided'?'fillcolor="#edf2f8", color="#71869b"':n.status==='unknown'?'fillcolor="#f2f3f3", color="#98a3a6"':'';
 const emphasis=n.emphasis==='focus'?'penwidth=3.2, ':n.emphasis==='muted'?'color="#b8c4c7", fontcolor="#718087", ':'';
 const attributes=[shape.trim().replace(/,$/u,''),emphasis.trim().replace(/,$/u,''),status||roleColor].filter(Boolean).join(', ');
 return attributes?', '+attributes:'';
}
function shapeOverride(node:VisualNode):string {
 if(!node.shape)return '';
 if(node.shape==='rounded-rectangle')return ', shape=box, style="rounded,filled"';
 if(node.shape==='rectangle')return ', shape=box, style="filled"';
 if(node.shape==='multiple-documents')return ', shape=plain';
 return ', shape='+shapeOptions[node.shape]!.dot+', style="filled"';
}
function mermaidNodeDeclaration(node:VisualNode,nativeId:string,encode:(value:string)=>string):string {
 const wrap=(text:string,limit:number)=>text.split('\n').flatMap(line=>{const words=line.split(/\s+/),out:string[]=[];let current='';for(const word of words){if(current&&current.length+1+word.length>limit){out.push(current);current=word;}else current=current?current+' '+word:word;}if(current)out.push(current);return out;}).join('\n');
 const portText=portRows(node).map(port=>wrap('Port '+portCaption(port),32)).join('\n');
 const label=encode([node.icon?wrap('Icon: '+node.icon,22):undefined,wrap(node.label,22),node.detail?wrap(node.detail,38):undefined,processRoleCaption(node),portText].filter(Boolean).join('\n'));
 const roleShape=node.role==='actor'?'ellipse':node.role==='store'?'cylinder':node.role==='document'?'folded-corner':undefined;
 const shape=node.shape??roleShape;
 return shape?`  ${nativeId}@{ shape: ${shapeOptions[shape]!.mermaid}, label: "${label}" }`:`  ${nativeId}["${label}"]`;
}
function multiplicityText(m:VisualMultiplicity|undefined,cardinality?:'zero-or-one'|'exactly-one'|'zero-or-many'|'one-or-many'):string {
 if(!m){if(cardinality==='zero-or-one')return '0..1';if(cardinality==='exactly-one')return '1';if(cardinality==='one-or-many')return '1..*';if(cardinality==='zero-or-many')return '0..*';return '';}
 return m.text??(m.min+'..'+(m.max===undefined?'*':m.max));
}
function mermaidCard(m:VisualMultiplicity|undefined,cardinality:'zero-or-one'|'exactly-one'|'zero-or-many'|'one-or-many'|undefined,side:'left'|'right'):string {
 const standard=!m?cardinality:m.min===1&&m.max===1?'exactly-one':m.min===0&&m.max===1?'zero-or-one':m.min>=1?'one-or-many':'zero-or-many';
 if(side==='left')return standard==='exactly-one'?'||':standard==='zero-or-one'?'|o':standard==='one-or-many'?'}|':'}o';
 return standard==='exactly-one'?'||':standard==='zero-or-one'?'o|':standard==='one-or-many'?'|{':'o{';
}
