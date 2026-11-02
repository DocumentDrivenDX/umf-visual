// SPDX-License-Identifier: MIT OR Apache-2.0
/** Portable, display-only projections of the public umf.visual vocabulary. */
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,type Visual,type VisualNode,type VisualGroup,type VisualField,type VisualMultiplicity,type VisualDefs} from '../extensions/visual';
import {compileLiniPresentation} from './lini';

export type PresentationBackend='graphviz'|'mermaid'|'lini';
export interface PresentationOptions {backend:PresentationBackend;direction?:'LR'|'TB';theme?:'presentation/1';}
export interface PresentationDiagnostic {code:string;path:string;message:string;severity:'error'|'warning';}
export interface PresentationElement {logicalId:string;sourcePath:string;nativeId:string;kind:'visual'|'group'|'node'|'edge'|'layer'|'entity'|'field'|'port'|'reference'|'participant'|'message'|'note';}
export interface PresentationOmission {sourcePath:string;reason:string;}
export interface PresentationApproximation {sourcePath:string;requested:string;representation:string;code?:'ROUTING_SCOPE_CONFLICT'|'ROUTING_NATIVE_INTERPOLATION';}
export interface PresentationPlan {
 ok:true;profileId:'umf.visual.presentation/1';backend:PresentationBackend;nativeFormat:'dot'|'mermaid'|'lini';source:string;
 elementMap:PresentationElement[];omissions:PresentationOmission[];approximations:PresentationApproximation[];
}
export interface PresentationFailure {ok:false;diagnostics:PresentationDiagnostic[];}
export type PresentationResult=PresentationPlan|PresentationFailure;

const BASE='/extensions/umf.visual';
const safeId=(prefix:string,index:number)=>prefix+(index+1);
const ptr=(s:string)=>s.replace(/~/g,'~0').replace(/\//g,'~1');
const dot=(s:string)=>'"'+s.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\t/g,'\\t')+'"';
const dotHtml=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<BR ALIGN="LEFT"/>');
const mermaidChar=(char:string)=>({ ' ':'#32;','#':'#35;','&':'#38;','"':'#34;','<':'#60;','>':'#62;',';':'#59;','(':'#40;',')':'#41;','[':'#91;',']':'#93;','{':'#123;','}':'#125;','\\':'#92;' } as Record<string,string>)[char]??char;
const mermaidText=(s:string)=>s.replace(/\r/g,'').split('\n').map(line=>Array.from(line,mermaidChar).join('')).join('<br/>');
const displayTitle=(visual:Visual)=>visual.title??visual.question;
const ordered = <T extends {id:string}>(items:T[],order:string[]|undefined):T[]=>{
 if(!order)return items;const rank=new Map(order.map((id,index)=>[id,index]));
 return items.map((item,index)=>({item,index})).sort((a,b)=>(rank.get(a.item.id)??Number.MAX_SAFE_INTEGER)-(rank.get(b.item.id)??Number.MAX_SAFE_INTEGER)||a.index-b.index).map(row=>row.item);
};
const layoutDirection=(layout:VisualDefs['layout']|undefined,fallback:'LR'|'TB'):'LR'|'TB'=>
 layout&&(layout.kind==='flow'||layout.kind==='stack')?(layout.direction??fallback):layout?.kind==='grid'&&layout.columns===1?'TB':fallback;
const shapeOptions:Record<NonNullable<VisualNode['shape']>,{dot:string;mermaid:string;label:string}>={
 rectangle:{dot:'box',mermaid:'rect',label:'rectangle'},'rounded-rectangle':{dot:'box',mermaid:'rounded',label:'rounded rectangle'},ellipse:{dot:'ellipse',mermaid:'circle',label:'ellipse'},diamond:{dot:'diamond',mermaid:'diam',label:'diamond'},hexagon:{dot:'hexagon',mermaid:'hex',label:'hexagon'},cylinder:{dot:'cylinder',mermaid:'cyl',label:'cylinder'},'folded-corner':{dot:'note',mermaid:'doc',label:'folded-corner document'},parallelogram:{dot:'parallelogram',mermaid:'lean_right',label:'parallelogram'}
};
const nativePortId=(nodeId:string,portIndex:number)=>nodeId+'.p'+(portIndex+1);
const findPort=(node:VisualNode|undefined,id:string|undefined)=>id===undefined?undefined:node?.ports?.find(port=>port.id===id);
const portRows=(node:VisualNode)=>node.ports??[];
const processRoleCaption=(node:VisualNode)=>node.role==='process'&&node.detail!=='Process'?'Process':undefined;
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
 const rich=visual.kind==='sequence'||visual.kind==='structure'&&visual.form==='tree';
 const supported=visual.kind==='flow'&&visual.form==='network'
  ||visual.kind==='structure'&&(visual.form==='stack'||visual.form==='entities'||visual.form==='tree')
  ||visual.kind==='sequence'&&visual.form==='lifelines';
 if(!supported)return {ok:false,diagnostics:[diag('PRESENTATION_FORM',BASE+'/form','No presentation projection is qualified for '+visual.kind+'/'+visual.form+'. The current flow projection covers only network diagrams.')]};

 const backend=optionValues.backend as PresentationBackend,dir=(optionValues.direction??'LR') as 'LR'|'TB';
 if(rich&&backend!=='lini')return {ok:false,diagnostics:[diag('PRESENTATION_BACKEND_SUBSET',BASE+'/form','This tree or sequence presentation is currently qualified only for the native Lini backend.')]};
 if(backend==='lini')return compileLiniPresentation(visual,dir);
 const errors:PresentationDiagnostic[]=[];
 const map:PresentationElement[]=[],omissions:PresentationOmission[]=[],approximations:PresentationApproximation[]=[];
 const addMap=(logicalId:string,sourcePath:string,nativeId:string,kind:PresentationElement['kind'])=>map.push({logicalId,sourcePath,nativeId,kind});
 const approx=(sourcePath:string,requested:string,representation:string)=>approximations.push({sourcePath,requested,representation});
 const omit=(sourcePath:string,reason:string)=>omissions.push({sourcePath,reason});
 addMap(visual.id,BASE,'visual','visual');
 const title=visual.title??visual.question;
 if(visual.title&&visual.question!==visual.title)omit(path('/question'),'The source question is distinct from the concise display title and remains in the original document.');
 if(visual.takeaway)omit(path('/takeaway'),'Takeaway remains in the definition source; the presentation image uses the concise display title only.');
 if(visual.source)omit(path('/source'),'Source provenance remains in the original UMF document and is not embedded in diagram geometry.');
 if(visual.omissions)for(let i=0;i<visual.omissions.length;i++)omit(path('/omissions/'+i),'Authored omission inventory is retained in the source document, not drawn.');

 const nodes=visual.nodes??[],groups=visual.groups??[],edges=visual.edges??[];
 const nodeIds=new Map(nodes.map((n,i)=>[n.id,safeId('n',i)]));
 const groupIds=new Map(groups.map((g,i)=>[g.id,safeId('g',i)]));
 const edgeIds=new Map(edges.map((e,i)=>[e.id,safeId('e',i)]));
 const layerIds=new Map((visual.structure?.layers??[]).map((l,i)=>[l.id,safeId('l',i)]));
 const wrap=(text:string,limit=22)=>text.split('\n').flatMap(line=>{const words=line.split(/\s+/);const out:string[]=[];let current='';for(const word of words){if(current&&current.length+1+word.length>limit){out.push(current);current=word;}else current=current?current+' '+word:word;}if(current)out.push(current);return out;}).join('\n');
 const labelNode=(n:VisualNode)=>[n.icon?wrap('Icon: '+n.icon):undefined,wrap(n.label),n.detail?wrap(n.detail,38):undefined,processRoleCaption(n),...(n.ports??[]).map(port=>wrap('Port '+port.id+(port.label?' · '+port.label:'')+(port.side?' · '+port.side:''),32))].filter(Boolean).join('\n');
 const labelGroup=(g:VisualGroup)=>[wrap(g.label),g.detail?wrap(g.detail,38):undefined].filter(Boolean).join('\n');
 const labelLayer=(layer:{label:string;detail?:string})=>[wrap(layer.label),layer.detail?wrap(layer.detail,38):undefined].filter(Boolean).join('\n');
 const mapPorts=(node:VisualNode,index:number)=>node.ports?.forEach((port,portIndex)=>{
  const portPath=path('/nodes/'+index+'/ports/'+portIndex);
  addMap(port.id,portPath,backend==='mermaid'?nodeIds.get(node.id)!:nativePortId(nodeIds.get(node.id)!,portIndex),'port');
  if(backend==='mermaid')approx(portPath,'Named port '+port.id+(port.label?' ('+port.label+')':'')+' at '+(port.side??'unspecified')+' side','The port label is shown on its host node, which is the actual mapped native carrier; Mermaid has no distinct named port row or side attachment, including for ports without linked edges.');
  else if(backend==='graphviz'&&port.side)approx(portPath+'/side','Port side '+port.side,'Graphviz applies the compass side to the named HTML row port. The row attachment can differ from the outer node glyph boundary; source and row identity remain native.');
 });
 nodes.forEach((n,i)=>{if(n.evidence)omit(path('/nodes/'+i+'/evidence'),'Evidence locators remain in UMF and are not drawn in the presentation view.');if(n.icon)approx(path('/nodes/'+i+'/icon'),'Icon '+n.icon,'The icon name is retained as a visible caption in the native node label; Graphviz and Mermaid do not have the corresponding qualified UMF icon carrier.');});
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
  const entityNative=new Map(nodes.map(n=>[n.id,nodeIds.get(n.id)!]));
  const fieldNative=new Map<string,string>();
  for(let i=0;i<nodes.length;i++)if(!entities.some(e=>e.node===nodes[i]!.id)){addMap(nodes[i]!.id,path('/nodes/'+i),entityNative.get(nodes[i]!.id)!,'node');mapPorts(nodes[i]!,i);}
  for(let i=0;i<entities.length;i++){
   const e=entities[i]!,node=nodeById.get(e.node)!;const id=entityNative.get(e.node)!;
   addMap(e.node,path('/structure/entities/'+i),id,'entity');
   mapPorts(node,nodes.indexOf(node));
   e.fields.forEach((f,j)=>{const fid=f.id??f.name;const native=backend==='graphviz'?id+'_f'+(j+1):id+'.'+f.name;fieldNative.set(e.node+'\0'+fid,native);fieldNative.set(e.node+'\0'+f.name,native);addMap(fid,path('/structure/entities/'+i+'/fields/'+j),native,'field');});
  }
  if(backend==='graphviz')for(let i=0;i<(structure.references??[]).length;i++)addMap(structure.references![i]!.id,path('/structure/references/'+i),safeId('r',i),'reference');
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
    for(let j=0;j<(n.ports??[]).length;j++){const port=n.ports![j]!;rows.push(`<TR><TD PORT="p${j+1}" ALIGN="LEFT" CELLPADDING="4" BORDER="1" COLOR="#8aa0a7"><FONT COLOR="#536e78" POINT-SIZE="11">${dotHtml(port.label??port.id)} · ${dotHtml(port.id)}${port.side?' · '+port.side:''}</FONT></TD></TR>`);}
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
   if((structure.references??[]).some(reference=>!reference.identification)){
    return {ok:false,diagnostics:[diag('PRESENTATION_MERMAID_RELATIONSHIP',path('/structure/references'),'These references leave identification unspecified; Mermaid requires an explicit identifying or non-identifying choice. Graphviz preserves the relationship without inventing it.')]};
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
    for(const n of ordered(members,stackLayout?.order))lines.push('    '+nodeIds.get(n.id)+' [label='+dot(labelNode(n))+nodeStyle(n)+shapeOverride(n)+'];');
    if(!members.length)lines.push('    '+lid+'_empty [label="(empty layer)", shape=plain, fontcolor="#71838a"];');
    lines.push('    '+lid+'_anchor [label="", shape=point, width=0.01, height=0.01, style=invis];');
    lines.push('  }');
   }
   if(layers.length>1){for(let i=0;i<layerNodeIds.length-1;i++)lines.push('  '+layerNodeIds[i]+' -> '+layerNodeIds[i+1]+' [style=invis, weight=100];');}
  for(const n of nodes)if(n.layer===undefined)lines.push('  '+nodeIds.get(n.id)+' [label='+dot(labelNode(n))+nodeStyle(n)+shapeOverride(n)+'];');
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
  const rootLayout=visual.layout,flowDirection=layoutDirection(rootLayout,rootLayout?.kind==='stack'||rootLayout?.kind==='grid'?'TB':dir);
  const splines=routeMode==='curved'&&!mixedRouteIntent?'curved':routeMode==='straight'&&!mixedRouteIntent?'line':'true';
  const lines=['digraph UMFPresentation {','  graph [rankdir='+dot(flowDirection)+', bgcolor="transparent", pad="0.34", nodesep="0.46", ranksep="0.62", splines='+splines+', overlap=false, compound=true, fontname="Arial", fontsize=22, fontcolor="#203746", labelloc="t", label='+dot(displayTitle(visual))+'];','  node [shape=box, style="rounded,filled", fillcolor="#e8f2f3", color="#577782", penwidth=1.7, fontname="Arial", fontsize=16, fontcolor="#203746", margin="0.22,0.17", width=2.35, height=1.08];','  edge [fontname="Arial", fontsize=12, color="#617984", fontcolor="#304652", penwidth=1.7, arrowsize=0.85];'];
  const nodeStatement=(n:VisualNode):string=>{
   const id=nodeIds.get(n.id)!;
   if(!n.ports?.length)return '  '+id+' [label='+dot(labelNode(n))+nodeStyle(n)+shapeOverride(n)+'];';
   const portHtml=n.ports.map((port,portIndex)=>`<TR><TD PORT="p${portIndex+1}" ALIGN="LEFT" CELLPADDING="4" BORDER="1" COLOR="#c8d6da"><FONT COLOR="#536e78" POINT-SIZE="11">${dotHtml(port.label??port.id)} · ${port.id}${port.side?' · '+port.side:''}</FONT></TD></TR>`).join('');
   const roleCaption=processRoleCaption(n)?'<BR/><FONT POINT-SIZE="11">Process</FONT>':'';
   return '  '+id+' [label=< <TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="0"><TR><TD ALIGN="LEFT" CELLPADDING="8"><B>'+dotHtml(n.label)+'</B>'+(n.detail?'<BR/><FONT POINT-SIZE="11">'+dotHtml(n.detail)+'</FONT>':'')+roleCaption+'</TD></TR>'+portHtml+'</TABLE> >'+nodeStyle(n)+shapeOverride(n)+'];';
  };
  const representative=(id:string):string|undefined=>{
   const node=nodes.find(n=>n.id===id);if(node)return nodeIds.get(id);
   const group=groups.find(g=>g.id===id);if(!group)return;
   const direct=nodes.find(n=>n.group===id);if(direct)return nodeIds.get(direct.id);
   for(const child of groups.filter(g=>g.parent===id)){const found=representative(child.id);if(found)return found;}
  };
  const layoutConstraints=(layout:VisualDefs['layout']|undefined,indent:string,layoutPath:string)=>{
   if(!layout?.order)return;
   const targets=layout.order.map(representative).filter((id):id is string=>!!id);
   for(let i=0;i<targets.length-1;i++)lines.push(indent+targets[i]+' -> '+targets[i+1]+' [style=invis, weight=100];');
   if(layout.kind==='grid')approx(layoutPath,'Grid layout with '+layout.columns+' columns','Graphviz preserves component order with invisible constraints; fixed grid rows are not native semantics and rank grouping can conflict with routed edges.');
  };
  const children=(id:string)=>groups.filter(g=>g.parent===id),members=(id:string)=>nodes.filter(n=>n.group===id&&!n.parent);
  const emitGroup=(g:VisualGroup,indent:string)=>{
   const layout=g.layout,orientation=layout?layoutDirection(layout,'TB'):undefined;
   const gid=groupIds.get(g.id)!;lines.push(indent+'subgraph cluster_'+gid+' { label='+dot(labelGroup(g))+'; style="rounded,filled"; color="#c9d7da"; fillcolor="#f6f8f8"; fontname="Arial"; fontsize=13; fontcolor="#455d66";'+(orientation?' rankdir='+dot(orientation)+';':''));
   const items=ordered([...children(g.id),...members(g.id)],layout?.order);
   for(const item of items){if(groups.includes(item as VisualGroup))emitGroup(item as VisualGroup,indent+'  ');else lines.push(indent+nodeStatement(item as VisualNode).trimStart());}
   layoutConstraints(layout,indent+'  ',path('/groups/'+groups.indexOf(g)+'/layout'));
   if(layout?.kind==='grid'&&!layout.order)approx(path('/groups/'+groups.indexOf(g)+'/layout'),'Grid layout with '+layout.columns+' columns','Graphviz uses a native cluster rank approximation; exact grid geometry may vary with edge routing.');
   if(layout&&(layout.kind==='flow'||layout.kind==='stack')&&orientation!==flowDirection)approx(path('/groups/'+groups.indexOf(g)+'/layout'),'Nested '+layout.kind+' layout direction '+orientation,'Graphviz dot does not reliably honor a cluster rankdir that differs from the graph direction; native source retains the requested cluster direction, while component placement may follow the graph axis.');
   lines.push(indent+'}');
  };
  for(const g of ordered(groups.filter(g=>!g.parent),rootLayout?.order))emitGroup(g,'  ');
  for(const n of ordered(nodes.filter(n=>!n.group&&!n.parent),rootLayout?.order))lines.push(nodeStatement(n));
  for(const n of nodes)if(n.parent){
   const parent=nodeIds.get(n.parent),nid=nodeIds.get(n.id);if(parent&&nid){lines.push('  '+nid+' [label='+dot(labelNode(n))+nodeStyle(n)+shapeOverride(n)+'];');approx(path('/nodes/'+nodes.indexOf(n)+'/parent'),'Nested node parent','Parent relation shown as a dotted hierarchy connector.');lines.push('  '+parent+' -> '+nid+' [style=dotted, arrowhead=none, color="#aab9bd", constraint=false];');}
  }
  layoutConstraints(rootLayout,'  ',path('/layout'));
  edges.forEach((e,i)=>{
   const fromNode=nodes.find(n=>n.id===e.from),toNode=nodes.find(n=>n.id===e.to),fromPort=findPort(fromNode,e.fromPort),toPort=findPort(toNode,e.toPort);
   if((e.fromPort&&!fromPort)||(e.toPort&&!toPort)){errors.push(diag('PRESENTATION_PORT',path('/edges/'+i),'A flow edge port reference does not resolve within its endpoint node.'));return;}
   const style=e.kind==='data'?'dashed':e.kind==='control'?'dotted':e.kind==='return'?'bold':'solid';
   const inferredBoundarySides=e.routing?.kind==='curved'&&!mixedRouteIntent&&!fromPort&&!toPort;
   const graphUsesCurvedSplines=routeMode==='curved'&&!mixedRouteIntent;
   const attrs=[e.label?(graphUsesCurvedSplines?'xlabel':'label')+'='+dot(e.label):undefined,e.why?'tooltip='+dot(e.why):undefined,'style='+dot(style),e.directed===false?'dir=none':undefined,inferredBoundarySides?'tailport=e, headport=s':undefined,e.status==='placeholder'?'color="#ba8745"':e.status==='built'?'color="#668f78"':undefined,e.emphasis==='focus'?'penwidth=2.8':e.emphasis==='muted'?'color="#b8c4c7"':undefined].filter(Boolean).join(', ');
   const sideCode={north:'n',east:'e',south:'s',west:'w'} as const;
   const fromNative=nodeIds.get(e.from)!+(fromPort?':p'+(fromNode!.ports!.indexOf(fromPort)+1)+(fromPort.side?':'+sideCode[fromPort.side]:''):inferredBoundarySides?':e':''),toNative=nodeIds.get(e.to)!+(toPort?':p'+(toNode!.ports!.indexOf(toPort)+1)+(toPort.side?':'+sideCode[toPort.side]:''):inferredBoundarySides?':s':'');
   lines.push('  '+fromNative+' -> '+toNative+' [id='+dot(edgeIds.get(e.id)!) +(attrs?', '+attrs:'')+'];');
   if(e.routing){const routeApplicable=!mixedRouteIntent&&routeMode===e.routing.kind,routeCode=routeApplicable?(e.routing.kind==='curved'&&!inferredBoundarySides?'ROUTING_NATIVE_INTERPOLATION':undefined):'ROUTING_SCOPE_CONFLICT';routeApproximation(i,e,'Graphviz routing is graph-wide; the homogeneous declaration selects native splines='+routeMode+'.'+(inferredBoundarySides?' Native boundary compass sides east→south are selected because no named ports or sides were authored.':'')+' Exact control points and endpoint attachment coordinates remain native.',routeApplicable,routeCode);}
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
  groups.forEach((g,i)=>{for(const key of ['role','tier','status','emphasis'] as const)if(g[key]!==undefined)omit(path('/groups/'+i+'/'+key),'Group label and containment are visible; this group metadata is not encoded by cluster styling.');});
  edges.forEach((e,i)=>{if(e.why)approx(path('/edges/'+i+'/why'),'Connection rationale','Available as native hover tooltip; it is not persistently visible in a static presentation image.');});
  if(visual.steps)omit(path('/steps'),'Walkthrough steps are not part of the architecture graph view.');
  if(visual.audience)omit(path('/audience'),'Audience metadata is retained in UMF but not drawn.');
  if(visual.source){} // already inventoried
  lines.push('}');
  return {ok:true,profileId:'umf.visual.presentation/1',backend,nativeFormat:'dot',source:lines.join('\n')+'\n',elementMap:map,omissions,approximations};
 }
 const rootLayout=visual.layout,flowDirection=layoutDirection(rootLayout,rootLayout?.kind==='stack'||rootLayout?.kind==='grid'?'TB':dir);
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
  for(const component of ordered(components,g.layout?.order)){if(groups.includes(component as VisualGroup))emitGroup(component as VisualGroup,indent+'  ');else lines.push(mermaidNodeDeclaration(component as VisualNode,nodeIds.get(component.id)!,mermaidText));}
  if(g.layout?.kind==='grid')approx(path('/groups/'+groups.indexOf(g)+'/layout'),'Grid layout with '+g.layout.columns+' columns','Mermaid supports subgraph direction and source order but no fixed grid column count.');
  if(g.layout?.order){const ids=g.layout.order.map(id=>nodeIds.get(id)??groupIds.get(id)).filter((id):id is string=>!!id);for(let i=0;i<ids.length-1;i++){lines.push(indent+'  '+ids[i]+' ~~~ '+ids[i+1]);mermaidLinkIndex++;}}
  lines.push(indent+'end');
 };
 for(const g of ordered(groups.filter(g=>!g.parent),rootLayout?.order))emitGroup(g,'  ');
  for(const n of ordered(nodes.filter(n=>!n.group&&!n.parent),rootLayout?.order))lines.push(mermaidNodeDeclaration(n,nodeIds.get(n.id)!,mermaidText));
  if(rootLayout?.kind==='grid')approx(path('/layout'),'Grid layout with '+rootLayout.columns+' columns','Mermaid preserves requested source ordering but has no native fixed grid column count.');
  if(rootLayout?.order){const ids=rootLayout.order.map(id=>nodeIds.get(id)??groupIds.get(id)).filter((id):id is string=>!!id);for(let i=0;i<ids.length-1;i++){lines.push('  '+ids[i]+' ~~~ '+ids[i+1]);mermaidLinkIndex++;}}
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
 if(visual.steps)omit(path('/steps'),'Walkthrough steps are not part of the architecture graph view.');
 if(visual.audience)omit(path('/audience'),'Audience metadata is retained in UMF but not drawn.');
 nodes.forEach((n,i)=>{if(n.role)approx(path('/nodes/'+i+'/role'),'Node role '+n.role,n.role==='process'?'Rendered with the presentation/1 process color convention and visible “Process” caption; this names a depicted process/activity only.':'Rendered with the presentation/1 Mermaid role color convention.');if(n.status)approx(path('/nodes/'+i+'/status'),'Node status '+n.status,'Rendered with the presentation/1 Mermaid status color convention.');if(n.emphasis)approx(path('/nodes/'+i+'/emphasis'),'Node emphasis '+n.emphasis,'Rendered with the presentation/1 Mermaid emphasis stroke convention.');});
 groups.forEach((g,i)=>{for(const key of ['role','tier','status','emphasis'] as const)if(g[key]!==undefined)omit(path('/groups/'+i+'/'+key),'Group label and containment are visible; this metadata is not rendered by Mermaid presentation/1.');});
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
 return ', shape='+shapeOptions[node.shape]!.dot+', style="filled"';
}
function mermaidNodeDeclaration(node:VisualNode,nativeId:string,encode:(value:string)=>string):string {
 const wrap=(text:string,limit:number)=>text.split('\n').flatMap(line=>{const words=line.split(/\s+/),out:string[]=[];let current='';for(const word of words){if(current&&current.length+1+word.length>limit){out.push(current);current=word;}else current=current?current+' '+word:word;}if(current)out.push(current);return out;}).join('\n');
 const portText=portRows(node).map(port=>wrap('Port '+port.id+(port.label?' · '+port.label:'')+(port.side?' · '+port.side:''),32)).join('\n');
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
