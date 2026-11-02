// SPDX-License-Identifier: MIT OR Apache-2.0
/** Browser-pure projection to the pinned Lini 1.1 layout and entity grammar. */
import type {Visual,VisualCardinality,VisualEntity,VisualGroup,VisualNode,VisualMultiplicity,VisualLayout} from '../extensions/visual';
import {quoteLiniProfile} from '../interchange/lini/profile-syntax';
import type {PresentationApproximation,PresentationElement,PresentationFailure,PresentationOmission,PresentationPlan} from './index';
import {compileLiniSequence,compileLiniTree} from './lini-rich';

const BASE='/extensions/umf.visual';
const pointer=(value:string)=>value.replace(/~/g,'~0').replace(/\//g,'~1');
const at=(value:string)=>BASE+(value.startsWith('/')?value:'/'+value);
const failure=(code:string,path:string,message:string):PresentationFailure=>({ok:false,diagnostics:[{code,path,message,severity:'error'}]});
const safeId=(prefix:string,index:number)=>prefix+(index+1);
const ordered=<T extends {id:string}>(items:T[],order:string[]|undefined):T[]=>{
 if(!order)return items;const rank=new Map(order.map((id,index)=>[id,index]));
 return items.map((item,index)=>({item,index})).sort((a,b)=>(rank.get(a.item.id)??Number.MAX_SAFE_INTEGER)-(rank.get(b.item.id)??Number.MAX_SAFE_INTEGER)||a.index-b.index).map(row=>row.item);
};
const q=(value:string)=>quoteLiniProfile(value);
const labelGroup=(group:VisualGroup)=>group.label;
const findPort=(node:VisualNode|undefined,id:string|undefined)=>id===undefined?undefined:node?.ports?.find(port=>port.id===id);
const property=(name:string,value:string|number)=>`${name}: ${typeof value==='string'?value:String(value)};`;
const liniIcons=new Set(['user','rocket','seal','presentation','heart','gear','cloud','house','database','folder-simple','cpu','bell','star','ghost','video-camera','wall','check','warning','globe','lock','key','lightning','magnifying-glass','arrow-right']);
const liniIcon=(value:string)=>liniIcons.has(value)?value:undefined;
const portCaption=(port:NonNullable<VisualNode['ports']>[number])=>port.label===undefined?port.id:port.label===port.id?port.id:port.label+' · '+port.id;
const joined=(items:Array<string|undefined>)=>items.filter((item):item is string=>!!item).join(' ');

type ColorSet={fill:string;stroke:string;color:string;shape?:string};
const roles:Record<string,ColorSet>={
 actor:{fill:'--amber-wash',stroke:'--amber-deep',color:'--amber-ink',shape:'oval'},
 own:{fill:'--teal-wash',stroke:'--teal-deep',color:'--teal-ink'},
 platform:{fill:'--sky-wash',stroke:'--sky-deep',color:'--sky-ink'},
 external:{fill:'--gray-wash',stroke:'--gray-deep',color:'--gray-ink'},
 store:{fill:'--blue-wash',stroke:'--blue-deep',color:'--blue-ink',shape:'cyl'},
 document:{fill:'--purple-wash',stroke:'--purple-deep',color:'--purple-ink',shape:'note'},
};
const statuses:Record<string,string>={built:'--green-deep',placeholder:'--amber-deep',decided:'--sky-deep',unknown:'--gray-deep'};
const groupColors:Record<string,ColorSet>={
 zone:{fill:'--teal-wash',stroke:'--teal-deep',color:'--teal-ink'},
 boundary:{fill:'--blue-wash',stroke:'--blue-deep',color:'--blue-ink'},
 lane:{fill:'--sky-wash',stroke:'--sky-deep',color:'--sky-ink'},
 tier:{fill:'--purple-wash',stroke:'--purple-deep',color:'--purple-ink'},
 region:{fill:'--gray-wash',stroke:'--gray-deep',color:'--gray-ink'},
 phase:{fill:'--amber-wash',stroke:'--amber-deep',color:'--amber-ink'},
 loop:{fill:'--green-wash',stroke:'--green-deep',color:'--green-ink'},
 alternative:{fill:'--rose-wash',stroke:'--rose-deep',color:'--rose-ink'},
};

function nodeStyle(node:VisualNode):{type:string;properties:string[];approximations:Array<[string,string,string]>}{
 const palette=node.role?roles[node.role]:undefined;
 const fill=palette?.fill??(node.status?({built:'--green-wash',placeholder:'--amber-wash',decided:'--sky-wash',unknown:'--gray-wash'} as Record<string,string>)[node.status]:undefined);
 const stroke=node.status?statuses[node.status]:palette?.stroke;
 const color=palette?.color??stroke;
 const portLabels=(node.ports??[]).map(port=>portCaption(port).length);
 const portWidth=portLabels.length?Math.max(320,Math.max(...portLabels)*8+190):240;
 const props=[fill?property('fill',fill):undefined,stroke?property('stroke',stroke):undefined,color?property('color',color):undefined,node.emphasis==='focus'?property('stroke-width',3):node.emphasis==='muted'?property('opacity',0.55):undefined,node.shape==='rectangle'?property('radius',0):undefined,property('width',portWidth)];
 const approximations:Array<[string,string,string]>=[];
 if(node.role)approximations.push(['role',`Node role ${node.role}`,node.shape?`Lini role ${node.role} palette color is shown independently from the authored native ${node.shape} shape.`:`Lini node shape/color convention (${palette?.shape??'box'} with palette ${node.role}).`]);
 if(node.status)approximations.push(['status',`Node status ${node.status}`,'Lini fill/stroke color convention.']);
 if(node.emphasis)approximations.push(['emphasis',`Node emphasis ${node.emphasis}`,node.emphasis==='focus'?'Lini uses a heavier native stroke.':'Lini uses reduced native opacity.']);
 const nativeShape:Record<NonNullable<VisualNode['shape']>,string>={rectangle:'box','rounded-rectangle':'box',ellipse:'oval',diamond:'diamond',hexagon:'hex',cylinder:'cyl','folded-corner':'note',parallelogram:'slant'};
 const type=node.shape?nativeShape[node.shape]:palette?.shape??'box';
 return{type,properties:props.filter((item):item is string=>!!item),approximations};
}
function layoutProperties(layout:VisualLayout|undefined,fallback:'flow'|'grid',defaultColumns=1,defaultDirection:'LR'|'TB'='LR'):string[]{
 const kind=layout?.kind??fallback;
 if(kind==='flow')return [`layout: flow;`,`direction: ${layout?.kind==='flow'?(layout.direction??defaultDirection)==='TB'?'column':'row':defaultDirection==='TB'?'column':'row'};`];
 if(kind==='stack')return ['layout: flow;',`direction: ${(layout?.kind==='stack'?(layout.direction??defaultDirection):defaultDirection)==='TB'?'column':'row'};`];
 if(layout?.kind==='grid'&&layout.columns===1)return ['layout: flow;','direction: column;'];
 return ['layout: grid;',`columns: repeat(${layout?.kind==='grid'?layout.columns:defaultColumns});`];
}
function groupProperties(group:VisualGroup|undefined,layout:VisualLayout|undefined,fallback:'flow'|'grid',defaultColumns=1,defaultDirection:'LR'|'TB'='LR'):string[]{
 const layoutKind=layout?.kind??fallback;
 const palette=group?.role?groupColors[group.role]:undefined;
 const statusFill=group?.status?({built:'--green-wash',placeholder:'--amber-wash',decided:'--sky-wash',unknown:'--gray-wash'} as Record<string,string>)[group.status]:undefined;
 const statusStroke=group?.status?statuses[group.status]:undefined;
 return [
  ...layoutProperties(layout,fallback,defaultColumns,defaultDirection),
  `gap: ${layoutKind==='flow'?52:24};`,
  `padding: ${layoutKind==='flow'?26:22};`,
  property('fill',statusFill??palette?.fill??'--gray-wash'),
  property('stroke',statusStroke??palette?.stroke??'--gray-deep'),
  property('color',palette?.color??statusStroke??'--gray-deep'),
  property('stroke-width',group?.emphasis==='focus'?3:1),
  group?.emphasis==='muted'?property('opacity',0.55):undefined,
 ].filter((item):item is string=>!!item);
}
function nodeDeclaration(node:VisualNode,nativeId:string):string{
 const style=nodeStyle(node);
 const caption=node.label;
 const symbol=node.icon?liniIcon(node.icon):undefined;
 const children=[node.detail?`|cell#detail| ${q(node.detail)}`:undefined,symbol?`|icon| { symbol: ${symbol}; width: 18; height: 18; fill: none; stroke: --blue-deep; }`:node.icon?`|cell#icon| ${q('Icon: '+node.icon)}`:undefined,...(node.ports??[]).map((port,index)=>`|cell#p${index+1}| ${q(portCaption(port))} { pin: ${port.side?({north:'top',east:'right',south:'bottom',west:'left'} as const)[port.side]:'right'}; font-size: 11; font-weight: 400; color: --gray-deep; padding: 2; }`)].filter((item):item is string=>!!item);
 const properties=style.properties;
 return `|${style.type}#${nativeId}| ${q(caption)}${properties.length?` { ${properties.join(' ')} }`:''}${children.length?` [\n${children.map(item=>'  '+item).join('\n')}\n]`:''}`;
}
function groupDeclaration(id:string,label:string,properties:string[],children:string[],indent=''):string{
 const body=children.map(line=>line.split('\n').map((part,index)=>index===0?indent+'  '+part:indent+'  '+part).join('\n')).join('\n');
 return `${indent}|group#${id}| ${q(label)} { ${properties.join(' ')} } [\n${body}\n${indent}]`;
}
function cardinalityMarker(cardinality:VisualCardinality|undefined,multiplicity:VisualMultiplicity|undefined,side:'from'|'to'):{marker:string;label?:string;approximate:boolean}{
 let conventional:VisualCardinality|undefined=cardinality;
 if(multiplicity){
  if(multiplicity.min===1&&multiplicity.max===1)conventional='exactly-one';
  else if(multiplicity.min===0&&multiplicity.max===1)conventional='zero-or-one';
  else if(multiplicity.min===0&&multiplicity.max===undefined)conventional='zero-or-many';
  else if(multiplicity.min===1&&multiplicity.max===undefined)conventional='one-or-many';
  else conventional=undefined;
 }
 const from:Record<VisualCardinality,string>={'exactly-one':'++','zero-or-one':'+o','zero-or-many':'>o','one-or-many':'>+'};
 const to:Record<VisualCardinality,string>={'exactly-one':'++','zero-or-one':'o+','zero-or-many':'o<','one-or-many':'+<'};
 if(conventional){
  const label=multiplicity?.text!==undefined?multiplicity.text:undefined;
  return{marker:(side==='from'?from:to)[conventional],...(label===undefined?{}:{label}),approximate:false};
 }
 if(multiplicity){const label=multiplicity.text??`${multiplicity.min}..${multiplicity.max===undefined?'*':multiplicity.max}`;return{marker:'',label,approximate:true};}
 return{marker:'',approximate:false};
}
function fieldReference(nodeId:string,fieldName:string|undefined,fieldId:string|undefined,entity:VisualEntity,entityNativeId:string):string|undefined{
 if(fieldName===undefined&&fieldId===undefined)return nodeId;
 const index=entity.fields.findIndex(field=>(fieldId!==undefined&&field.id===fieldId)||(fieldName!==undefined&&field.name===fieldName));
 return index<0?undefined:`${entityNativeId}.f${index+1}`;
}

/** Emit a deterministic, readable Lini source view; renderer effects stay in Lini. */
export function compileLiniPresentation(visual:Visual,direction:'LR'|'TB'='LR'):PresentationPlan|PresentationFailure{
 if(visual.kind==='sequence'||visual.kind==='structure'&&visual.form==='tree'){
  try{return visual.kind==='sequence'?compileLiniSequence(visual):compileLiniTree(visual,direction);}
  catch(reason){const path=reason&&typeof reason==='object'&&'sourcePath'in reason&&typeof reason.sourcePath==='string'?reason.sourcePath:'/extensions/umf.visual';return failure('PRESENTATION_LINI_TEXT',path,reason instanceof Error?reason.message:'Lini could not encode the authored presentation text.');}
 }
 const map:PresentationElement[]=[],omissions:PresentationOmission[]=[],approximations:PresentationApproximation[]=[];
 const styleRules:string[]=['--lini-font-family: Arial;','.lini-block { font-family: Arial; }','.lini-caption { translate: 0 -30; font-scale: 14 16; }'];
 const add=(logicalId:string,sourcePath:string,nativeId:string,kind:PresentationElement['kind'])=>map.push({logicalId,sourcePath,nativeId,kind});
 const mapPorts=(node:VisualNode,index:number,nativeId:string)=>node.ports?.forEach((port,portIndex)=>add(port.id,path('/nodes/'+index+'/ports/'+portIndex),nativeId+'.p'+(portIndex+1),'port'));
 const omit=(sourcePath:string,reason:string)=>omissions.push({sourcePath,reason});
 const approx=(sourcePath:string,requested:string,representation:string)=>approximations.push({sourcePath,requested,representation});
 const path=(part:string)=>at(part);
 const title=visual.title??visual.question;
 try{
  add(visual.id,path('/id'),'visual','visual');
  if(visual.title&&visual.question!==visual.title)omit(path('/question'),'The reader question remains in the UMF document; Lini displays the concise title in the native diagram frame.');
  if(visual.takeaway)omit(path('/takeaway'),'Takeaway remains in the definition source and is not drawn as diagram content.');
  if(visual.source)omit(path('/source'),'Source provenance remains in UMF and is not embedded in diagram geometry.');
  if(visual.omissions)for(let i=0;i<visual.omissions.length;i++)omit(path('/omissions/'+i),'Authored omission inventory remains in UMF and is not drawn.');
  if(visual.steps)omit(path('/steps'),'Walkthrough steps remain in UMF and are not part of this static Lini view.');
  if(visual.audience)omit(path('/audience'),'Audience metadata remains in UMF and is not drawn.');

  const nodes=visual.nodes??[],groups=visual.groups??[],edges=visual.edges??[];
  for(const[index,node]of nodes.entries())if(node.icon){const symbol=liniIcon(node.icon);approx(path('/nodes/'+index+'/icon'),'Icon '+node.icon,symbol?'Lini displays the exact native Phosphor icon; presentation/1 applies a generic blue outline.':'Lini Phosphor does not include this symbol; its name is shown in a visible native caption cell.');}
  const nodeIds=new Map(nodes.map((node,index)=>[node.id,safeId('n',index)]));
  const groupIds=new Map(groups.map((group,index)=>[group.id,safeId('g',index)]));
  const layerIds=new Map((visual.structure?.layers??[]).map((layer,index)=>[layer.id,safeId('l',index)]));
  const quoteChecked=(text:string,sourcePath:string)=>{try{return q(text);}catch(reason){throw Object.assign(new Error(reason instanceof Error?reason.message:'Lini cannot encode this text.'),{sourcePath});}};
  const qTitle=quoteChecked(title,path('/title'));
  const rootLayout:VisualLayout|undefined=visual.layout;
  const fallbackLayout=visual.form==='entities'||visual.form==='stack'||visual.form==='network'?'grid':'flow';
  const rootComponents=groups.filter(group=>!group.parent).length+nodes.filter(node=>!node.group&&!node.parent).length;
  const rootColumns=visual.form==='entities'?(direction==='TB'?1:2):visual.form==='stack'?(rootLayout?.kind==='stack'&&(rootLayout.direction??direction)==='LR'?Math.max(1,visual.structure?.layers?.length??nodes.length):1):visual.form==='network'?Math.max(1,Math.min(3,rootComponents)):undefined;
  const rootProperties=[...layoutProperties(rootLayout,fallbackLayout,rootColumns??1,direction),`gap: ${visual.form==='entities'?88:visual.form==='stack'?44:72};`,`padding: 36;`,`fill: none;`,`stroke: none;`,`stroke-width: 0;`].filter((item):item is string=>!!item);
  if(rootLayout?.kind==='grid'&&rootLayout.columns===1)approx(path('/layout'),'Grid layout with one column','Lini 1.1 represents a one-column grid with native column flow; requested component order and single-column containment are preserved.');
  let children:string[]=[];

  if(visual.kind==='flow'){
    for(const node of nodes){const index=nodes.indexOf(node),id=nodeIds.get(node.id)!;add(node.id,path('/nodes/'+index+'/id'),id,'node');mapPorts(node,index,id);for(const[field,value]of [['evidence',node.evidence],['parent',node.parent]] as const)if(value!==undefined)omit(path('/nodes/'+index+'/'+field),field==='parent'?'Lini groups preserve named group membership; the node-parent containment relation has no separate native meaning in this view.':'Evidence locators remain in UMF and are not drawn.');if(node.layer)omit(path('/nodes/'+index+'/layer'),'Stack layer assignment is outside the flow/network view.');const style=nodeStyle(node);for(const [field,requested,rendered]of style.approximations)approx(path('/nodes/'+index+'/'+field),requested,rendered);if(node.detail)approx(path('/nodes/'+index+'/detail'),'Node detail','Lini renders the authored detail as a persistent secondary native cell beneath the node title.');}
   const descendants=(parent:string|undefined)=>groups.filter(group=>group.parent===parent);
   const members=(group:string|undefined)=>nodes.filter(node=>node.group===group);
   const groupChain=(groupId:string|undefined):VisualGroup[]=>{if(!groupId)return[];const group=groups.find(item=>item.id===groupId);return group?[...groupChain(group.parent),group]:[];};
   const edgeRowsByScope=new Map<string|undefined,string[]>();
   const straightRoutingGroups=new Set<string>();let straightRootRouting=false;
   for(let i=0;i<edges.length;i++){
    const edge=edges[i]!,fromNode=nodes.find(node=>node.id===edge.from),toNode=nodes.find(node=>node.id===edge.to),from=nodeIds.get(edge.from),to=nodeIds.get(edge.to);if(!from||!to)return failure('PRESENTATION_LINI_ENDPOINT',path('/edges/'+i),'Lini link endpoint is not a declared visual node.');
    const fromPort=findPort(fromNode,edge.fromPort),toPort=findPort(toNode,edge.toPort);if((edge.fromPort&&!fromPort)||(edge.toPort&&!toPort))return failure('PRESENTATION_LINI_PORT',path('/edges/'+i),'A flow edge port reference does not resolve within its endpoint node.');
    const portSide={north:'top',east:'right',south:'bottom',west:'left'} as const;
    const fromGroups=groupChain(fromNode?.group),toGroups=groupChain(toNode?.group);let common=0;while(common<fromGroups.length&&common<toGroups.length&&fromGroups[common]!.id===toGroups[common]!.id)common++;
    const scope=common?fromGroups[common-1]!.id:undefined;
    if(fromPort?.side==='north'||fromPort?.side==='south'||toPort?.side==='north'||toPort?.side==='south'){if(scope)straightRoutingGroups.add(scope);else straightRootRouting=true;}
    const source=[...fromGroups.slice(common).map(group=>groupIds.get(group.id)!),from+(fromPort?'.p'+(fromNode!.ports!.indexOf(fromPort)+1)+(fromPort.side?':'+portSide[fromPort.side]:''):'')].join('.');
    const target=[...toGroups.slice(common).map(group=>groupIds.get(group.id)!),to+(toPort?'.p'+(toNode!.ports!.indexOf(toPort)+1)+(toPort.side?':'+portSide[toPort.side]:''):'')].join('.'),className=safeId('e',i);
    add(edge.id,path('/edges/'+i),className,'edge');
    const label=edge.label??'',style:string[]=[];
    if(edge.kind==='data')style.push(property('stroke-style','dashed'));else if(edge.kind==='control')style.push(property('stroke-style','dotted'));else if(edge.kind==='return')style.push(property('stroke-style','double'));
    if(edge.status)style.push(property('stroke',statuses[edge.status]??'--gray-deep'));
    if(edge.emphasis==='focus')style.push(property('stroke-width',3));else if(edge.emphasis==='muted')style.push(property('opacity',0.55));
    styleRules.push(`.${className} { ${style.length?style.join(' '):'stroke: --teal-deep;'} }`);
    const along=[0.35,0.5,0.65][i%3]!;
    const rows=edgeRowsByScope.get(scope)??[],operator=edge.directed===false?'---':'->';rows.push(`${source} ${operator} ${target}${label?' '+quoteChecked(label,path('/edges/'+i+'/label')):''} .${className} { along: ${along}; }`);edgeRowsByScope.set(scope,rows);
    for(const field of ['why','evidence'] as const)if(edge[field]!==undefined)omit(path('/edges/'+i+'/'+field),field==='why'?'Lini link hints do not appear on the native link SVG; rationale remains in the source document.':'Evidence locators remain in UMF and are not drawn.');
    if(edge.kind)approx(path('/edges/'+i+'/kind'),'Connection kind '+edge.kind,edge.kind==='data'?'Dashed Lini line style.':edge.kind==='control'?'Dotted Lini line style.':'Double Lini line style.');
    if(edge.status)approx(path('/edges/'+i+'/status'),'Connection status '+edge.status,'Lini stroke palette convention.');
    if(edge.emphasis)approx(path('/edges/'+i+'/emphasis'),'Connection emphasis '+edge.emphasis,edge.emphasis==='focus'?'Lini uses a heavier native stroke.':'Lini uses reduced native opacity.');
   }
   const renderGroup=(group:VisualGroup,indent=''):string=>{
    const index=groups.indexOf(group),id=groupIds.get(group.id)!,childRows:string[]=[];
    add(group.id,path('/groups/'+index),id,'group');
    const items=ordered([...descendants(group.id),...members(group.id)],group.layout?.order);
    for(const item of items){if(groups.includes(item as VisualGroup))childRows.push(renderGroup(item as VisualGroup,indent+'  '));else childRows.push(nodeDeclaration(item as VisualNode,nodeIds.get(item.id)!));}
    if(group.detail)childRows.unshift(`|cell#detail| ${quoteChecked(group.detail,path('/groups/'+index+'/detail'))}`);
    childRows.push(...(edgeRowsByScope.get(group.id)??[]));
    const props=groupProperties(group,group.layout,'flow',items.length,'TB');if(straightRoutingGroups.has(group.id))props.push('routing: straight;');
    if(group.layout?.kind==='grid'&&group.layout.columns===1)approx(path('/groups/'+index+'/layout'),'Grid layout with one column','Lini 1.1 represents a one-column grid with native column flow; requested node order and single-column containment are preserved.');
    if(group.role)approx(path('/groups/'+index+'/role'),'Group role '+group.role,'Lini applies the role palette convention to the native group boundary; this is a presentation styling choice, not an intrinsic Lini group semantic.');
    if(group.status)approx(path('/groups/'+index+'/status'),'Group status '+group.status,'Lini renders status through the native boundary fill and stroke color convention.');
    if(group.emphasis)approx(path('/groups/'+index+'/emphasis'),'Group emphasis '+group.emphasis,group.emphasis==='focus'?'Lini renders focus with a heavier native group boundary.':'Lini renders muted emphasis with reduced native group opacity.');
    if(group.tier!==undefined)omit(path('/groups/'+index+'/tier'),'Tier remains in the UMF source; Lini group rendering has no persistent tier carrier.');
    return groupDeclaration(id,labelGroup(group),props,childRows,indent);
   };
   const rootItems=ordered([...descendants(undefined),...members(undefined)],rootLayout?.order);
   for(const item of rootItems){if(groups.includes(item as VisualGroup))children.push(renderGroup(item as VisualGroup));else children.push(nodeDeclaration(item as VisualNode,nodeIds.get(item.id)!));}
   children.push(...(edgeRowsByScope.get(undefined)??[]));
   if(straightRootRouting)rootProperties.push('routing: straight;');
   if(rootLayout?.kind==='flow'&&rootLayout.order)approx(path('/layout/order'),'Explicit root component order','Declarations follow the requested order; native graph layout can still route links around that order.');
   for(const key of ['layers','entities','references'] as const)if(visual.structure?.[key])omit(path('/structure/'+key),'Structure metadata is outside the flow/network view.');
  }else if(visual.form==='stack'){
   const layers=visual.structure?.layers??[];
   for(let i=0;i<layers.length;i++)add(layers[i]!.id,path('/structure/layers/'+i),layerIds.get(layers[i]!.id)!,'layer');
    for(let i=0;i<nodes.length;i++){
     const node=nodes[i]!,id=nodeIds.get(node.id)!;add(node.id,path('/nodes/'+i+'/id'),id,'node');mapPorts(node,i,id);
     for(const key of ['parent','group'] as const)if(node[key]!==undefined)omit(path('/nodes/'+i+'/'+key),`Independent node ${key} metadata is outside the ordered layer view.`);
     if(node.evidence)omit(path('/nodes/'+i+'/evidence'),'Evidence locators remain in UMF and are not drawn.');
     for(const [field,requested,representation] of nodeStyle(node).approximations)approx(path('/nodes/'+i+'/'+field),requested,representation);
     if(node.detail)approx(path('/nodes/'+i+'/detail'),'Node detail','Lini renders the authored detail as a persistent secondary native cell beneath the node title.');
    }
   const stackComponents:Array<{id:string;source:string}> = layers.map(layer=>{
    const id=layerIds.get(layer.id)!,layerNodes=ordered(nodes.filter(node=>node.layer===layer.id),rootLayout?.order).map(node=>nodeDeclaration(node,nodeIds.get(node.id)!));
    const props=groupProperties(undefined,undefined,'grid',1,direction);
    return{id:layer.id,source:groupDeclaration(id,layer.label,props,layerNodes)};
   });
   children.push(...stackComponents.map(item=>item.source));
   children.push(...ordered(nodes.filter(item=>item.layer===undefined),rootLayout?.order).map(node=>nodeDeclaration(node,nodeIds.get(node.id)!)));
   if(rootLayout?.order)approx(path('/layout/order'),'Explicit stack node order','Nodes within each authored layer and unassigned nodes follow their requested declaration order; authored layer bands retain their required order.');
   if(edges.length)omit(path('/edges'),'A stack is an ordered containment view; authored connections are not drawn in this layout.');
   if(groups.length)omit(path('/groups'),'Stack membership is represented by structure.layers; independent visual groups are not drawn.');
   if(visual.structure?.entities)omit(path('/structure/entities'),'Entity declarations are outside the ordered stack view.');
   if(visual.structure?.references)omit(path('/structure/references'),'Entity references are outside the ordered stack view.');
   const stackLayout=rootLayout?.kind==='stack'?rootLayout:undefined;
   const stackDirection=stackLayout?.direction??'TB';
   approx(path('/structure/layers'),'Layer order',stackLayout?`Lini native ${stackDirection==='LR'?'row':'column'} flow follows authored layer order from ${stackDirection==='LR'?'left to right':'top to bottom'}.`:rootLayout?.kind==='grid'?`Lini native grid with ${rootLayout.columns} columns emits layer bands in authored order and places them row-major.`:'Lini native one-column layout follows authored layer order from top to bottom.');
  }else{
   const structure=visual.structure!,entities=structure.entities??[],entityByNode=new Map(entities.map((entity,index)=>[entity.node,{entity,index}]));
   const entityRows=new Map<string,string>(),standaloneRows=new Map<string,string>();
   for(let i=0;i<nodes.length;i++){
    const node=nodes[i]!,found=entityByNode.get(node.id),id=nodeIds.get(node.id)!;
    if(found){add(node.id,path('/structure/entities/'+found.index),id,'entity');mapPorts(node,i,id);if(node.detail)approx(path('/nodes/'+i+'/detail'),'Entity detail','Lini renders the authored detail visibly with the entity title.');}
    else{add(node.id,path('/nodes/'+i+'/id'),id,'node');mapPorts(node,i,id);standaloneRows.set(node.id,nodeDeclaration(node,id));}
    if(node.evidence)omit(path('/nodes/'+i+'/evidence'),'Evidence locators remain in UMF and are not drawn.');
    for(const key of ['group','parent','layer'] as const)if(node[key]!==undefined)omit(path('/nodes/'+i+'/'+key),'This node property is outside the entity relationship view.');
   }
   const fieldNative=new Map<string,string>();
   for(let i=0;i<entities.length;i++){
    const entity=entities[i]!,node=nodes.find(item=>item.id===entity.node);if(!node)return failure('PRESENTATION_LINI_ENTITY',path('/structure/entities/'+i),'Entity refers to a node that is not declared.');
    const id=nodeIds.get(entity.node)!;const fields:string[]=[];
    for(let j=0;j<entity.fields.length;j++){
     const field=entity.fields[j]!,native=id+'.f'+(j+1),logicalId=field.id??field.name;fieldNative.set(entity.node+'\0'+logicalId,native);fieldNative.set(entity.node+'\0'+field.name,native);add(logicalId,path('/structure/entities/'+i+'/fields/'+j),native,'field');
     const markers=[...(field.keys??[]).map(key=>key.toUpperCase()),field.nullable===undefined?undefined:field.nullable?'NULL':'NOT NULL'].filter((item):item is string=>!!item);
     const label=field.name+(markers.length?' · '+markers.join(' · '):''),type=field.type??'';
     fields.push(`|cell#f${j+1}| ${quoteChecked(label,path('/structure/entities/'+i+'/fields/'+j+'/name'))}; ${quoteChecked(type,path('/structure/entities/'+i+'/fields/'+j+'/type'))}`);
     if(field.keys?.length)approx(path('/structure/entities/'+i+'/fields/'+j+'/keys'),'Field keys '+field.keys.join(', ').toUpperCase(),'Lini displays these as visible field-row badges; the native entity row does not assert database key constraints.');
     if(field.nullable!==undefined)approx(path('/structure/entities/'+i+'/fields/'+j+'/nullable'),field.nullable?'Nullable field':'Non-nullable field','Lini displays NULL/NOT NULL as a visible field-row badge; the native entity row does not assert a database nullability constraint.');
    }
    const customPorts=(node.ports??[]).map((port,j)=>`|cell#p${j+1}| ${quoteChecked(portCaption(port),path('/nodes/'+nodes.indexOf(node)+'/ports/'+j+'/label'))} { pin: ${port.side?({north:'top',east:'right',south:'bottom',west:'left'} as const)[port.side]:'right'}; font-size: 11; font-weight: 400; color: --gray-deep; padding: 2; }`);
    const visibleEntityTitle=node.label;
    const props=nodeStyle(node).properties;
    const iconSymbol=node.icon?liniIcon(node.icon):undefined;
    const iconChild=iconSymbol?`|icon| { symbol: ${iconSymbol}; width: 18; height: 18; fill: none; stroke: --blue-deep; }`:node.icon?`|cell#icon| ${quoteChecked('Icon: '+node.icon,path('/nodes/'+nodes.indexOf(node)+'/icon'))}`:undefined;
    const secondary=[node.detail?`|cell#detail| ${quoteChecked(node.detail,path('/nodes/'+nodes.indexOf(node)+'/detail'))}`:undefined,node.shape?`|cell#shape| ${quoteChecked('(requested shape: '+node.shape+')',path('/nodes/'+nodes.indexOf(node)+'/shape'))}`:undefined,iconChild,...fields,...customPorts].filter((line):line is string=>!!line);
    entityRows.set(node.id,`|entity#${id}| ${quoteChecked(visibleEntityTitle,path('/nodes/'+nodes.indexOf(node)+'/label'))}${props.length?' { '+props.join(' ')+' }':''} [\n${secondary.map(line=>'  '+line).join('\n')}\n]`);
    for(const [field,requested,representation] of nodeStyle(node).approximations){
     const entityRepresentation=field==='role'?'Lini applies the role palette convention to the entity card fill, stroke, and text; entity cards keep a fixed table silhouette, so role-derived node glyphs do not apply.':representation;
     approx(path('/nodes/'+nodes.indexOf(node)+'/'+field),requested.replace(/^Node/u,'Entity'),entityRepresentation);
    }
    if(node.shape)approx(path('/nodes/'+nodes.indexOf(node)+'/shape'),'Entity shape '+node.shape,'A visible native detail cell identifies the requested shape; Lini entity cards have a fixed table silhouette.');
   }
   const entityComponents=nodes.map(node=>({id:node.id,row:entityRows.get(node.id)??standaloneRows.get(node.id)})).filter((item):item is {id:string;row:string}=>item.row!==undefined);
   children.push(...ordered(entityComponents,rootLayout?.order).map(item=>item.row));
   const endpoint=(end:{node:string;field?:string;fieldId?:string;portId?:string},refIndex:number,side:'from'|'to'):string|undefined=>{
    const id=nodeIds.get(end.node),entity=entityByNode.get(end.node)?.entity;if(!id||!entity)return;
    if(end.portId){const node=nodes.find(item=>item.id===end.node),port=findPort(node,end.portId);if(!port)return;const portSide={north:'top',east:'right',south:'bottom',west:'left'} as const;return id+'.p'+(node!.ports!.indexOf(port)+1)+(port.side?':'+portSide[port.side]:'');}
    const native=fieldReference(id,end.field,end.fieldId,entity,id);if(native&&native!==id){approx(path('/structure/references/'+refIndex+'/'+side),'Field endpoint '+JSON.stringify(end.fieldId??end.field),`Lini draws the native relationship to the exact entity field row ${native} on its ${side==='from'?'right':'left'} side.`);return native+(side==='from'?':right':':left');}
    return native;
   };
   for(let i=0;i<(structure.references??[]).length;i++){
    const reference=structure.references![i]!,from=endpoint(reference.from,i,'from'),to=endpoint(reference.to,i,'to');if(!from||!to)return failure('PRESENTATION_LINI_ENDPOINT',path('/structure/references/'+i),'A relationship endpoint does not resolve to an entity field or node.');
    const a=cardinalityMarker(reference.fromCardinality,reference.fromMultiplicity,'from'),b=cardinalityMarker(reference.toCardinality,reference.toMultiplicity,'to');
    const operator=`${a.marker}-${b.marker}`,exact=[a.label?`from ${a.label}`:undefined,b.label?`to ${b.label}`:undefined].filter(Boolean);
    const identificationLabel=reference.identification?(reference.identification==='identifying'?'Identifying':'Non-identifying'):undefined;
    const label=[identificationLabel,reference.label,exact.length?'['+exact.join('; ')+']':undefined].filter(Boolean).join(' '),className=safeId('r',i);
    add(reference.id,path('/structure/references/'+i),className,'reference');
    styleRules.push(`.${className} { stroke: --teal-deep;${reference.identification==='non-identifying'?' stroke-style: dashed;':''} }`);
    children.push(`${from} ${operator} ${to}${label?' '+quoteChecked(label,path('/structure/references/'+i+'/label')):''} .${className}`);
    if(a.approximate||b.approximate)approx(path('/structure/references/'+i),'Exact endpoint multiplicities',`Lini uses unmarked endpoint(s) for nonstandard exact ranges and prints their exact text in the relationship label${a.approximate&&b.approximate?'':'; conventional endpoints use native crow’s-foot markers'}.`);
    if(reference.identification)approx(path('/structure/references/'+i+'/identification'),'Relationship identification '+reference.identification,'Lini has no intrinsic identifying/non-identifying connector semantics; the distinction is written in the visible relationship label'+(reference.identification==='non-identifying'?' and a dashed line style.':'.'));
   }
   if(groups.length)omit(path('/groups'),'The entity view is driven by structure.entities/references; unrelated visual groups are not drawn.');
   if(edges.length)omit(path('/edges'),'The entity view uses structure.references; unrelated flow edges are not drawn.');
   if(structure.layers)omit(path('/structure/layers'),'Layer placement is outside the entity relationship view.');
  }
  const stylesheet=styleRules.length?`{\n${styleRules.map(line=>'  '+line).join('\n')}\n}\n`:'';
  const source=stylesheet+groupDeclaration('visual',title,rootProperties,children);
  if(source.length>250_000)return failure('PRESENTATION_SIZE',BASE,'Generated Lini source exceeds the 250,000 UTF-16 code-unit presentation limit.');
  return{ok:true,profileId:'umf.visual.presentation/1',backend:'lini',nativeFormat:'lini',source:source+'\n',elementMap:map,omissions,approximations};
 }catch(reason){const sourcePath=reason&&typeof reason==='object'&&'sourcePath'in reason?String((reason as {sourcePath:unknown}).sourcePath):BASE;return failure('PRESENTATION_LINI_TEXT',sourcePath,reason instanceof Error?reason.message:'Lini cannot encode a text value.');}
}
