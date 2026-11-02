// SPDX-License-Identifier: MIT OR Apache-2.0
/** Portable, display-only projections of the public umf.visual vocabulary. */
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,type Visual,type VisualNode,type VisualGroup,type VisualField,type VisualMultiplicity} from '../extensions/visual';

export type PresentationBackend='graphviz'|'mermaid';
export interface PresentationOptions {backend:PresentationBackend;direction?:'LR'|'TB';theme?:'presentation/1';}
export interface PresentationDiagnostic {code:string;path:string;message:string;severity:'error'|'warning';}
export interface PresentationElement {logicalId:string;sourcePath:string;nativeId:string;kind:'visual'|'group'|'node'|'edge'|'layer'|'entity'|'field'|'reference';}
export interface PresentationOmission {sourcePath:string;reason:string;}
export interface PresentationApproximation {sourcePath:string;requested:string;representation:string;}
export interface PresentationPlan {
 ok:true;profileId:'umf.visual.presentation/1';backend:PresentationBackend;nativeFormat:'dot'|'mermaid';source:string;
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
 if(!['graphviz','mermaid'].includes(optionValues.backend as string))return {ok:false,diagnostics:[diag('PRESENTATION_BACKEND','/','Choose backend graphviz or mermaid.')]};
 if(optionValues.direction!==undefined&&!['LR','TB'].includes(optionValues.direction as string))return {ok:false,diagnostics:[diag('PRESENTATION_DIRECTION','/','Direction must be LR or TB.')]};
 if(optionValues.theme!==undefined&&optionValues.theme!=='presentation/1')return {ok:false,diagnostics:[diag('PRESENTATION_THEME','/','Only the versioned presentation/1 theme is supported.')]};
 const strings:{value:string;path:string}[]=[];const pending:{value:unknown;path:string}[]=[{value:visual,path:BASE}];
 while(pending.length){const current=pending.pop()!;if(typeof current.value==='string'){strings.push({value:current.value,path:current.path});continue;}if(Array.isArray(current.value)){for(let i=0;i<current.value.length;i++)pending.push({value:current.value[i],path:current.path+'/'+i});}else if(current.value&&typeof current.value==='object'){for(const[k,v]of Object.entries(current.value))pending.push({value:v,path:current.path+'/'+ptr(k)});}}
 for(const item of strings){for(let i=0;i<item.value.length;i++){const code=item.value.charCodeAt(i);if(code===13||code===0||(code<32&&code!==9&&code!==10)){return {ok:false,diagnostics:[diag('PRESENTATION_TEXT',item.path,'Carriage returns and control characters other than tab/newline cannot be represented by the presentation renderers.') ]};}if(code>=0xD800&&code<=0xDBFF){const next=item.value.charCodeAt(i+1);if(!(next>=0xDC00&&next<=0xDFFF))return {ok:false,diagnostics:[diag('PRESENTATION_TEXT',item.path,'Unpaired UTF-16 surrogates cannot be represented by the presentation renderers.') ]};i++;}else if(code>=0xDC00&&code<=0xDFFF)return {ok:false,diagnostics:[diag('PRESENTATION_TEXT',item.path,'Unpaired UTF-16 surrogates cannot be represented by the presentation renderers.') ]};}}
 const supported=visual.kind==='flow'&&visual.form==='network'
  ||visual.kind==='structure'&&(visual.form==='stack'||visual.form==='entities');
 if(!supported)return {ok:false,diagnostics:[diag('PRESENTATION_FORM',BASE+'/form','No presentation projection is qualified for '+visual.kind+'/'+visual.form+'. The current flow projection covers only network diagrams.')]};

 const backend=optionValues.backend as PresentationBackend,dir=(optionValues.direction??'LR') as 'LR'|'TB';
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
 const labelNode=(n:VisualNode)=>[wrap(n.label),n.detail?wrap(n.detail,38):undefined].filter(Boolean).join('\n');
 const labelGroup=(g:VisualGroup)=>[wrap(g.label),g.detail?wrap(g.detail,38):undefined].filter(Boolean).join('\n');
 const labelLayer=(layer:{label:string;detail?:string})=>[wrap(layer.label),layer.detail?wrap(layer.detail,38):undefined].filter(Boolean).join('\n');
 nodes.forEach((n,i)=>{if(n.evidence)omit(path('/nodes/'+i+'/evidence'),'Evidence locators remain in UMF and are not drawn in the presentation view.');});
 edges.forEach((e,i)=>{if(e.evidence)omit(path('/edges/'+i+'/evidence'),'Evidence locators remain in UMF and are not drawn in the presentation view.');});
 if(visual.kind==='flow'){
  nodes.forEach((n,i)=>{if(n.layer)omit(path('/nodes/'+i+'/layer'),'Stack layer membership is outside the flow/network view.');});
  for(const key of ['layers','entities','references'] as const)if(visual.structure?.[key])omit(path('/structure/'+key),'Structure metadata is outside the flow/network view.');
 }
 if(visual.kind==='flow'||visual.form==='stack')for(let i=0;i<nodes.length;i++)addMap(nodes[i]!.id,path('/nodes/'+i),nodeIds.get(nodes[i]!.id)!,'node');
 if(visual.kind==='flow'){
  for(let i=0;i<groups.length;i++)addMap(groups[i]!.id,path('/groups/'+i),groupIds.get(groups[i]!.id)!,'group');
  for(let i=0;i<edges.length;i++)addMap(edges[i]!.id,path('/edges/'+i),edgeIds.get(edges[i]!.id)!,'edge');
 }

 if(visual.kind==='structure'&&visual.form==='entities'){
  const structure=visual.structure!;const entities=structure.entities??[];const nodeById=new Map(nodes.map(n=>[n.id,n]));
  const entityNative=new Map(nodes.map(n=>[n.id,nodeIds.get(n.id)!]));
  const fieldNative=new Map<string,string>();
  for(let i=0;i<nodes.length;i++)if(!entities.some(e=>e.node===nodes[i]!.id))addMap(nodes[i]!.id,path('/nodes/'+i),entityNative.get(nodes[i]!.id)!,'node');
  for(let i=0;i<entities.length;i++){
   const e=entities[i]!,node=nodeById.get(e.node)!;const id=entityNative.get(e.node)!;
   addMap(e.node,path('/structure/entities/'+i),id,'entity');
   e.fields.forEach((f,j)=>{const fid=f.id??f.name;const native=backend==='graphviz'?id+'_f'+(j+1):id+'.'+f.name;fieldNative.set(e.node+'\0'+fid,native);fieldNative.set(e.node+'\0'+f.name,native);addMap(fid,path('/structure/entities/'+i+'/fields/'+j),native,'field');});
  }
  if(backend==='graphviz')for(let i=0;i<(structure.references??[]).length;i++)addMap(structure.references![i]!.id,path('/structure/references/'+i),safeId('r',i),'reference');
  else for(let i=0;i<(structure.references??[]).length;i++)omit(path('/structure/references/'+i+'/id'),'Mermaid ER draws this relationship but does not provide a qualified user-assigned native relationship identifier.');
  if(backend==='graphviz'){
   const lines=['digraph UMFPresentation {','  graph [rankdir='+dot(dir)+', bgcolor="transparent", pad="0.34", nodesep="0.56", ranksep="0.72", splines=true, overlap=false, fontname="Arial", fontsize=22, fontcolor="#203746", labelloc="t", label='+dot(displayTitle(visual))+'];','  node [shape=plain, fontname="Arial", fontsize=15, fontcolor="#203746"];','  edge [fontname="Arial", fontsize=12, color="#617984", fontcolor="#304652", penwidth=1.7, dir=none];'];
   for(let i=0;i<entities.length;i++){
    const e=entities[i]!,n=nodeById.get(e.node)!,id=entityNative.get(e.node)!;const rows=[`<TR><TD BGCOLOR="#e6eff2" ALIGN="LEFT" CELLPADDING="9"><B>${dotHtml(n.label)}</B>${n.detail?'<BR/><FONT POINT-SIZE="10">'+dotHtml(n.detail)+'</FONT>':''}</TD></TR>`];
    for(let j=0;j<e.fields.length;j++){
     const f=e.fields[j]!,port=id+'_f'+(j+1),keys=(f.keys??[]).map(k=>k.toUpperCase()).join(', '),nullable=f.nullable===undefined?'':f.nullable?'NULL':'NOT NULL';
     const left=[keys,nullable].filter(Boolean).join(' · ');const right=[f.name,f.type].filter(Boolean).join(': ');
     rows.push(`<TR><TD PORT="${port}" ALIGN="LEFT" CELLPADDING="6" BORDER="1" COLOR="#c8d6da">${left?'<FONT COLOR="#5b7480" POINT-SIZE="12">'+dotHtml(left)+'</FONT>  ':''}${dotHtml(right)}</TD></TR>`);
    }
    if(!e.fields.length)rows.push('<TR><TD ALIGN="LEFT" CELLPADDING="6"><FONT COLOR="#607780">(no fields declared)</FONT></TD></TR>');
    lines.push('  '+id+' [label=< <TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="0" BGCOLOR="white">'+rows.join('')+'</TABLE> >, tooltip='+dot(n.label)+'];');
   }
   for(const n of nodes)if(!entities.some(e=>e.node===n.id)){const id=entityNative.get(n.id)!;lines.push('  '+id+' [label='+dot(labelNode(n))+nodeStyle(n)+'];');}
   for(let i=0;i<(structure.references??[]).length;i++){
    const r=structure.references![i]!,fromField=r.from.fieldId??r.from.field,toField=r.to.fieldId??r.to.field;
    const from=entityNative.get(r.from.node)!,to=entityNative.get(r.to.node)!;
    const fromPort=fromField?fieldNative.get(r.from.node+'\0'+fromField):undefined,toPort=toField?fieldNative.get(r.to.node+'\0'+toField):undefined;
    if((fromField&&!fromPort)||(toField&&!toPort)){errors.push(diag('PRESENTATION_ENDPOINT',path('/structure/references/'+i),'A reference endpoint does not resolve to a rendered field.'));continue;}
    const ends=[multiplicityText(r.fromMultiplicity,r.fromCardinality),multiplicityText(r.toMultiplicity,r.toCardinality)];
    // Cardinalities beside field ports collide with the compact table rows on
    // dense ER layouts. Keep them with their relationship label in from→to
    // order so the ownership is explicit and the field-row text stays clear.
    const relationLabel=[r.label,ends.some(Boolean)?'('+ (ends[0]||'unspecified')+' → '+(ends[1]||'unspecified')+')':undefined].filter(Boolean).join('\n');
    const attrs=[relationLabel?'label='+dot(relationLabel):undefined].filter(Boolean).join(', ');
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
   if((structure.references??[]).length){
    return {ok:false,diagnostics:[diag('PRESENTATION_MERMAID_RELATIONSHIP',path('/structure/references'),'Mermaid ER requires choosing identifying (`--`) or non-identifying (`..`) semantics, while umf.visual references do not declare that distinction. Graphviz preserves the relationship without inventing it.')]};
   }
   const lines=[...mermaidHeader(visual),'erDiagram','  direction LR'];
  for(let i=0;i<entities.length;i++){
   const e=entities[i]!,n=nodeById.get(e.node)!,id=entityNative.get(e.node)!;
   lines.push('  '+id+'["'+mermaidText(n.label)+'"] {');
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
  for(const n of nodes)if(!entities.some(e=>e.node===n.id)){const id=entityNative.get(n.id)!;lines.push('  '+id+'["'+mermaidText(n.label)+'"]');if(n.detail)omit(path('/nodes/'+nodes.indexOf(n)+'/detail'),'The Mermaid ER profile has no qualified entity-header detail carrier for this node.');}
  for(let i=0;i<(structure.references??[]).length;i++){
   const r=structure.references![i]!,from=entityNative.get(r.from.node)!,to=entityNative.get(r.to.node)!;
   if(!r.fromMultiplicity&&!r.fromCardinality||!r.toMultiplicity&&!r.toCardinality){errors.push(diag('PRESENTATION_MERMAID_CARDINALITY',path('/structure/references/'+i),'Mermaid ER requires an endpoint cardinality; this relationship leaves one or both endpoint cardinalities unspecified.'));continue;}
   const left=mermaidCard(r.fromMultiplicity,r.fromCardinality,'left'),right=mermaidCard(r.toMultiplicity,r.toCardinality,'right');
   const multiplicities=[multiplicityText(r.fromMultiplicity,r.fromCardinality),multiplicityText(r.toMultiplicity,r.toCardinality)].filter(Boolean);
   const label=mermaidText([r.label,...(multiplicities.length?['['+multiplicities.join(' ↔ ')+']']:[])].filter(Boolean).join(' '));
   lines.push('  '+from+' '+left+'--'+right+' '+to+' : "'+label+'"');
   if(r.from.field||r.from.fieldId)approx(path('/structure/references/'+i+'/from'),'Field endpoint '+JSON.stringify(r.from.fieldId??r.from.field),'Relationship attached to entity '+JSON.stringify(r.from.node)+' because Mermaid ER has no field ports.');
   if(r.to.field||r.to.fieldId)approx(path('/structure/references/'+i+'/to'),'Field endpoint '+JSON.stringify(r.to.fieldId??r.to.field),'Relationship attached to entity '+JSON.stringify(r.to.node)+' because Mermaid ER has no field ports.');
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
   const lines=['digraph UMFPresentation {','  graph [rankdir="TB", bgcolor="transparent", pad="0.34", nodesep="0.44", ranksep="0.42", splines=ortho, compound=true, fontname="Arial", fontsize=22, fontcolor="#203746", labelloc="t", label='+dot(displayTitle(visual))+'];','  node [shape=box, style="rounded,filled", fillcolor="#e8f2f3", color="#577782", penwidth=1.7, fontname="Arial", fontsize=15, fontcolor="#203746", margin="0.22,0.17", width=3.0, height=0.78];','  edge [style=invis, weight=100];'];
   const layerNodeIds:string[]=[];
   for(let li=0;li<layers.length;li++){
    const layer=layers[li]!,lid=layerIds.get(layer.id)!;const members=nodes.filter(n=>n.layer===layer.id);layerNodeIds.push(lid+'_anchor');
    lines.push('  subgraph cluster_'+lid+' { label='+dot(labelLayer(layer))+'; style="rounded,filled"; color="#c9d7da"; fillcolor="#f6f8f8"; fontname="Arial"; fontsize=14; fontcolor="#455d66";');
    for(const n of members)lines.push('    '+nodeIds.get(n.id)+' [label='+dot(labelNode(n))+'];');
    if(!members.length)lines.push('    '+lid+'_empty [label="(empty layer)", shape=plain, fontcolor="#71838a"];');
    lines.push('    '+lid+'_anchor [label="", shape=point, width=0.01, height=0.01, style=invis];');
    lines.push('  }');
   }
   if(layers.length>1){for(let i=0;i<layerNodeIds.length-1;i++)lines.push('  '+layerNodeIds[i]+' -> '+layerNodeIds[i+1]+' [style=invis, weight=100];');}
   for(const n of nodes)if(n.layer===undefined)lines.push('  '+nodeIds.get(n.id)+' [label='+dot(labelNode(n))+'];');
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
  const lines=[...mermaidHeader(visual),'flowchart LR'];
  const anchors:string[]=[];
  for(let li=0;li<layers.length;li++){
   const layer=layers[li]!,lid=layerIds.get(layer.id)!;lines.push('  subgraph '+lid+'["'+mermaidText(labelLayer(layer))+'"]');
   for(const n of nodes.filter(n=>n.layer===layer.id))lines.push('    '+nodeIds.get(n.id)+'["'+mermaidText(labelNode(n))+'"]');
   if(!nodes.some(n=>n.layer===layer.id))lines.push('    '+lid+'_empty["(empty layer)"]');
   const anchor=lid+'_order';anchors.push(anchor);lines.push('    '+anchor+'(( ))');
   lines.push('  end');
  }
  for(let i=0;i<anchors.length;i++)lines.push('  style '+anchors[i]+' fill:transparent,stroke:transparent,color:transparent,stroke-width:0px');
  for(let i=0;i<anchors.length-1;i++)lines.push('  '+anchors[i]+' ~~~ '+anchors[i+1]);
  for(const n of nodes)if(n.layer===undefined)lines.push('  '+nodeIds.get(n.id)+'["'+mermaidText(labelNode(n))+'"]');
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
 if(backend==='graphviz'){
  const lines=['digraph UMFPresentation {','  graph [rankdir='+dot(dir)+', bgcolor="transparent", pad="0.34", nodesep="0.46", ranksep="0.62", splines=true, overlap=false, compound=true, fontname="Arial", fontsize=22, fontcolor="#203746", labelloc="t", label='+dot(displayTitle(visual))+'];','  node [shape=box, style="rounded,filled", fillcolor="#e8f2f3", color="#577782", penwidth=1.7, fontname="Arial", fontsize=16, fontcolor="#203746", margin="0.22,0.17", width=2.35, height=1.08];','  edge [fontname="Arial", fontsize=12, color="#617984", fontcolor="#304652", penwidth=1.7, arrowsize=0.85];'];
  const children=(id:string)=>groups.filter(g=>g.parent===id),members=(id:string)=>nodes.filter(n=>n.group===id&&!n.parent);
  const emitGroup=(g:VisualGroup,indent:string)=>{
   const gid=groupIds.get(g.id)!;lines.push(indent+'subgraph cluster_'+gid+' { label='+dot(labelGroup(g))+'; style="rounded,filled"; color="#c9d7da"; fillcolor="#f6f8f8"; fontname="Arial"; fontsize=13; fontcolor="#455d66";');
   for(const child of children(g.id))emitGroup(child,indent+'  ');
   for(const n of members(g.id))lines.push(indent+'  '+nodeIds.get(n.id)+' [label='+dot(labelNode(n))+nodeStyle(n)+'];');
   lines.push(indent+'}');
  };
  for(const g of groups)if(!g.parent)emitGroup(g,'  ');
  for(const n of nodes)if(!n.group&&!n.parent)lines.push('  '+nodeIds.get(n.id)+' [label='+dot(labelNode(n))+nodeStyle(n)+'];');
  for(const n of nodes)if(n.parent){
   const parent=nodeIds.get(n.parent),nid=nodeIds.get(n.id);if(parent&&nid){lines.push('  '+nid+' [label='+dot(labelNode(n))+nodeStyle(n)+'];');approx(path('/nodes/'+nodes.indexOf(n)+'/parent'),'Nested node parent','Parent relation shown as a dotted hierarchy connector.');lines.push('  '+parent+' -> '+nid+' [style=dotted, arrowhead=none, color="#aab9bd", constraint=false];');}
  }
  edges.forEach((e,i)=>{
   const style=e.kind==='data'?'dashed':e.kind==='control'?'dotted':e.kind==='return'?'bold':'solid';
   const attrs=[e.label?'label='+dot(e.label):undefined,e.why?'tooltip='+dot(e.why):undefined,'style='+dot(style),e.status==='placeholder'?'color="#ba8745"':e.status==='built'?'color="#668f78"':undefined,e.emphasis==='focus'?'penwidth=2.8':e.emphasis==='muted'?'color="#b8c4c7"':undefined].filter(Boolean).join(', ');
   lines.push('  '+nodeIds.get(e.from)+' -> '+nodeIds.get(e.to)+' [id='+dot(edgeIds.get(e.id)!) +(attrs?', '+attrs:'')+'];');
   if(e.kind)approx(path('/edges/'+i+'/kind'),'Connection kind '+e.kind,'Rendered by the presentation/1 convention: action solid, data dashed, control dotted, return bold.');
   if(e.emphasis)approx(path('/edges/'+i+'/emphasis'),'Connection emphasis '+e.emphasis,'Rendered by the presentation/1 stroke weight/color convention.');
   if(e.status)approx(path('/edges/'+i+'/status'),'Connection status '+e.status,'Rendered by the presentation/1 status color convention.');
  });
  for(let i=0;i<nodes.length;i++){
   const n=nodes[i]!;
   if(n.role)approx(path('/nodes/'+i+'/role'),'Node role '+n.role,'Rendered with the presentation/1 role shape/color convention.');
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
 const lines=[...mermaidHeader(visual),'flowchart '+dir];
 const children=(id:string)=>groups.filter(g=>g.parent===id),members=(id:string)=>nodes.filter(n=>n.group===id&&!n.parent);
 const emitGroup=(g:VisualGroup,indent:string)=>{
  const gid=groupIds.get(g.id)!;lines.push(indent+'subgraph '+gid+'["'+mermaidText(labelGroup(g))+'"]');
  for(const child of children(g.id))emitGroup(child,indent+'  ');
 for(const n of members(g.id))lines.push(indent+'  '+nodeIds.get(n.id)+'["'+mermaidText(labelNode(n))+'"]');
  lines.push(indent+'end');
 };
 for(const g of groups)if(!g.parent)emitGroup(g,'  ');
 for(const n of nodes)if(!n.group&&!n.parent)lines.push('  '+nodeIds.get(n.id)+'["'+mermaidText(labelNode(n))+'"]');
 for(const n of nodes)if(n.parent){const parent=nodeIds.get(n.parent),nid=nodeIds.get(n.id);if(parent&&nid){lines.push('  '+nid+'["'+mermaidText(labelNode(n))+'"]');lines.push('  '+parent+' -.-> '+nid);approx(path('/nodes/'+nodes.indexOf(n)+'/parent'),'Nested node parent','Parent relation shown as a dotted hierarchy connector.');}}
 edges.forEach((e,i)=>{
  const label=e.label;lines.push('  '+nodeIds.get(e.from)+' -->'+(label?'|"'+mermaidText(label)+'"|':'')+' '+nodeIds.get(e.to));
  const edgeStyle=e.kind==='data'?'stroke-dasharray: 5 5':e.kind==='control'?'stroke-dasharray: 2 5':e.kind==='return'?'stroke-width: 3':e.emphasis==='focus'?'stroke-width: 3':e.emphasis==='muted'?'stroke:#b8c4c7':'';
  if(edgeStyle)lines.push('  linkStyle '+i+' '+edgeStyle);
  if(e.why)approx(path('/edges/'+i+'/why'),'Connection rationale','Mermaid flow has no persistent static-drawing rationale carrier; the source document retains it.');
  if(e.emphasis)approx(path('/edges/'+i+'/emphasis'),'Connection emphasis '+e.emphasis,'Rendered with presentation/1 link stroke styling.');
  if(e.kind)approx(path('/edges/'+i+'/kind'),'Connection kind '+e.kind,'Rendered by the presentation/1 line-pattern convention: action solid, data dashed, control dotted, return bold.');
  if(e.status)omit(path('/edges/'+i+'/status'),'Mermaid flow has no per-link status style in the presentation/1 convention.');
 });
 for(const style of ['role_actor fill:#fff4dc,stroke:#be8741,stroke-width:2px','role_store fill:#e8efff,stroke:#637cae,stroke-width:2px','role_document fill:#f2ecfb,stroke:#8b72a6,stroke-width:2px','role_own fill:#e8f2ec,stroke:#668f78,stroke-width:2px','role_platform fill:#e8f2f3,stroke:#577782,stroke-width:2px','role_external fill:#f5f4ef,stroke:#96988e,stroke-width:2px','status_built fill:#e8f2ec,stroke:#668f78','status_placeholder fill:#fff5e4,stroke:#ba8745','status_decided fill:#edf2f8,stroke:#71869b','status_unknown fill:#f2f3f3,stroke:#98a3a6','emphasis_focus stroke-width:3px','emphasis_muted opacity:0.55'])lines.push('  classDef '+style);
 nodes.forEach(n=>{const classes=[n.role?'role_'+n.role:undefined,n.status?'status_'+n.status:undefined,n.emphasis?'emphasis_'+n.emphasis:undefined].filter(Boolean);if(classes.length)lines.push('  class '+nodeIds.get(n.id)+' '+classes.join(',')+';');});
 if(visual.steps)omit(path('/steps'),'Walkthrough steps are not part of the architecture graph view.');
 if(visual.audience)omit(path('/audience'),'Audience metadata is retained in UMF but not drawn.');
 nodes.forEach((n,i)=>{if(n.role)approx(path('/nodes/'+i+'/role'),'Node role '+n.role,'Rendered with the presentation/1 Mermaid role color convention.');if(n.status)approx(path('/nodes/'+i+'/status'),'Node status '+n.status,'Rendered with the presentation/1 Mermaid status color convention.');if(n.emphasis)approx(path('/nodes/'+i+'/emphasis'),'Node emphasis '+n.emphasis,'Rendered with the presentation/1 Mermaid emphasis stroke convention.');});
 groups.forEach((g,i)=>{for(const key of ['role','tier','status','emphasis'] as const)if(g[key]!==undefined)omit(path('/groups/'+i+'/'+key),'Group label and containment are visible; this metadata is not rendered by Mermaid presentation/1.');});
 return {ok:true,profileId:'umf.visual.presentation/1',backend,nativeFormat:'mermaid',source:lines.join('\n')+'\n',elementMap:map,omissions,approximations};
}

function nodeStyle(n:VisualNode):string {
 const shape=n.role==='actor'?'shape=ellipse, ':n.role==='store'?'shape=cylinder, ':n.role==='document'?'shape=note, ':'';
 const roleColor=n.role==='actor'?'fillcolor="#fff4dc", color="#be8741"':n.role==='store'?'fillcolor="#e8efff", color="#637cae"':n.role==='document'?'fillcolor="#f2ecfb", color="#8b72a6"':n.role==='own'?'fillcolor="#e8f2ec", color="#668f78"':n.role==='platform'?'fillcolor="#e8f2f3", color="#577782"':n.role==='external'?'fillcolor="#f5f4ef", color="#96988e"':'';
 const status=n.status==='placeholder'?'fillcolor="#fff5e4", color="#ba8745"':n.status==='built'?'fillcolor="#e8f2ec", color="#668f78"':n.status==='decided'?'fillcolor="#edf2f8", color="#71869b"':n.status==='unknown'?'fillcolor="#f2f3f3", color="#98a3a6"':'';
 const emphasis=n.emphasis==='focus'?'penwidth=3.2, ':n.emphasis==='muted'?'color="#b8c4c7", fontcolor="#718087", ':'';
 return ', '+shape+emphasis+(status||roleColor);
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
