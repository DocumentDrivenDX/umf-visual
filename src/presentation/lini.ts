// SPDX-License-Identifier: MIT OR Apache-2.0
/** Browser-pure projection to the pinned Lini 1.1 layout and entity grammar. */
import type {Visual,VisualCardinality,VisualEdge,VisualEntity,VisualGroup,VisualNode,VisualMultiplicity,VisualLayout} from '../extensions/visual';
import {quoteLiniProfile} from '../interchange/lini/profile-syntax';
import {liniShapeDefinition} from './lini-shapes';
import {circularPlacement} from './circular';
import {directedDagRanks} from './dag-layout';
import {orderTiered} from './tier-layout';
import type {PresentationApproximation,PresentationElement,PresentationFailure,PresentationOmission,PresentationPlan} from './index';
import {compileLiniSequence,compileLiniTree} from './lini-rich';
import {compileLiniNestedPresentation} from './lini-nested';
import {compileLiniTimelinePresentation} from './lini-timeline';
import {stateTransitionCaption,validateStateMachineScope} from './state';

const BASE='/extensions/umf.visual';
const pointer=(value:string)=>value.replace(/~/g,'~0').replace(/\//g,'~1');
const at=(value:string)=>BASE+(value.startsWith('/')?value:'/'+value);
const failure=(code:string,path:string,message:string):PresentationFailure=>({ok:false,diagnostics:[{code,path,message,severity:'error'}]});
const safeId=(prefix:string,index:number)=>prefix+(index+1);
const ordered=<T extends {id:string}>(items:T[],order:string[]|undefined):T[]=>{
 if(!order)return items;const rank=new Map(order.map((id,index)=>[id,index]));
 return items.map((item,index)=>({item,index})).sort((a,b)=>(rank.get(a.item.id)??Number.MAX_SAFE_INTEGER)-(rank.get(b.item.id)??Number.MAX_SAFE_INTEGER)||a.index-b.index).map(row=>row.item);
};
const stableRoutedOrder=<T extends {id:string}>(items:T[],relations:Array<[string,string]>):T[]=>{
 const outgoing=new Map(items.map(item=>[item.id,new Set<string>()])),indegree=new Map(items.map(item=>[item.id,0]));
 for(const[from,to]of relations)if(from!==to&&outgoing.has(from)&&outgoing.has(to)&&!outgoing.get(from)!.has(to)){outgoing.get(from)!.add(to);indegree.set(to,indegree.get(to)!+1);}
 const remaining=new Set(items.map(item=>item.id)),result:T[]=[];
 while(remaining.size){const next=items.find(item=>remaining.has(item.id)&&indegree.get(item.id)===0);if(!next)return items;remaining.delete(next.id);result.push(next);for(const target of outgoing.get(next.id)??[])indegree.set(target,indegree.get(target)!-1);}
 return result;
};
const q=(value:string)=>quoteLiniProfile(value);
const labelGroup=(group:VisualGroup,showTier=false)=>[group.label,showTier&&group.tier!==undefined?'Tier '+group.tier:undefined].filter(Boolean).join('\n');
const findPort=(node:VisualNode|undefined,id:string|undefined)=>id===undefined?undefined:node?.ports?.find(port=>port.id===id);
const property=(name:string,value:string|number)=>`${name}: ${typeof value==='string'?value:String(value)};`;
const liniIcons=new Set(['user','rocket','seal','presentation','heart','gear','cloud','house','database','folder-simple','cpu','bell','star','ghost','video-camera','wall','check','warning','globe','lock','key','lightning','magnifying-glass','arrow-right']);
const liniIcon=(value:string)=>liniIcons.has(value)?value:undefined;
const portCaption=(port:NonNullable<VisualNode['ports']>[number])=>port.label===undefined?port.id:port.label===port.id?port.id:port.label+' · '+port.id;
const estimateTextWidth=(value:string)=>[...value].reduce((total,char)=>total+11*(/[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uff01-\uff60]/u.test(char)?1:/[ilI.,'`!|:;]/u.test(char)?0.32:/[MW@#%&]/u.test(char)?0.82:0.58),0);
const estimateMultilineTextWidth=(value:string)=>Math.max(0,...value.split(String.fromCharCode(10)).map(estimateTextWidth));
const estimateTextLines=(value:string,wrapWidth=190)=>value.split(String.fromCharCode(10)).reduce((total,line)=>total+Math.max(1,Math.ceil(estimateTextWidth(line)/wrapWidth)),0);
const wrapLiniCaption=(value:string,maxLineWidth=128)=>value.split(String.fromCharCode(10)).flatMap(line=>{const words=line.split(' '),rows:string[]=[];let current='';for(const word of words){const candidate=current?current+' '+word:word;if(current&&estimateTextWidth(candidate)>maxLineWidth){rows.push(current);current=word;}else current=candidate;}rows.push(current);return rows;}).join(String.fromCharCode(10));
const estimateNodeHalfHeight=(node:VisualNode|undefined)=>{
 if(!node)return 42;
 return 31+11*estimateTextLines(node.label)+(node.detail?11+11*estimateTextLines(node.detail):0)+(node.icon?10:0)+(node.role==='process'?11:0)+(node.ports?.length??0)*11;
};
const flowCaptionOffset=(direction:'LR'|'TB',label:string,from:VisualNode|undefined,to:VisualNode|undefined,along:number,gap:number,parallelIndex:number)=>{
 const lane=parallelIndex*18;
 if(direction==='TB')return Math.ceil(Math.max(24,estimateMultilineTextWidth(label)/2+10))+lane;
 const availableAlongGap=2*gap*Math.min(along,1-along);
 if(estimateMultilineTextWidth(label)<=availableAlongGap)return 24+lane;
 const captionHalfHeight=Math.max(1,estimateTextLines(label))*8;
 // This is a conservative native-layout estimate; the browser-side quality
 // proof measures actual caption, connector, marker, and endpoint bounds.
 return Math.ceil(Math.max(24,(Math.max(estimateNodeHalfHeight(from),estimateNodeHalfHeight(to))+captionHalfHeight+10)/1.5))+lane;
};
const dagCaptionPlacement=(direction:'LR'|'TB',label:string,from:VisualNode,to:VisualNode,fromPosition:{x:number;y:number}|undefined,toPosition:{x:number;y:number}|undefined,fromDegree:number,toDegree:number,gap:number,parallelIndex:number,rankSpan:number)=>{
 const crossAxisDelta=direction==='LR'?(toPosition?.y??0)-(fromPosition?.y??0):(toPosition?.x??0)-(fromPosition?.x??0),rankAxisDelta=direction==='LR'?(toPosition?.x??0)-(fromPosition?.x??0):(toPosition?.y??0)-(fromPosition?.y??0),degreeDelta=fromDegree-toDegree,along=degreeDelta>0?0.65:degreeDelta<0?0.38:Math.abs(crossAxisDelta)>Math.max(estimateNodeHalfHeight(from),estimateNodeHalfHeight(to))?(crossAxisDelta<0?0.38:0.65):0.5,offset=Math.max(40,flowCaptionOffset(direction,label,from,to,along,gap,parallelIndex)),side=crossAxisDelta>0?-1:1,lane=parallelIndex*18,dominantCrossAxis=Math.abs(crossAxisDelta)>gap/2,awayFromNearestEndpoint=dominantCrossAxis&&along<0.5?-Math.sign(crossAxisDelta):Math.sign(rankAxisDelta)*(along<0.5?1:-1),translate=direction==='LR'?dominantCrossAxis?`${awayFromNearestEndpoint*offset} ${lane}`:`0 ${side*offset+lane}`:dominantCrossAxis?`${lane} ${awayFromNearestEndpoint*offset}`:`${side*offset} ${lane}`;
 if(rankSpan>1){
  // Native Lini routes skip-rank links around the intermediate cards. Keep
  // their wrapped captions in the narrow corridor beside that route rather
  // than translating them back into the skipped node row.
  const corridorOffset=Math.max(14,Math.ceil(estimateTextLines(label)*7+13))+lane;
  return{along:0.5,crossAxisDelta,offset:corridorOffset,translate:direction==='LR'?`0 ${corridorOffset}`:`${corridorOffset} 0`,rankSpan};
 }
 return{along,crossAxisDelta,offset,translate,rankSpan};
};
const siblingGroupCaptionTranslate=(direction:'LR'|'TB',from:VisualNode|undefined,to:VisualNode|undefined,nodes:VisualNode[],groups:VisualGroup[],offset:number)=>{
 if(!from?.group||!to?.group||from.group===to.group)return undefined;
 const fromGroup=groups.find(group=>group.id===from.group),toGroup=groups.find(group=>group.id===to.group);
 if(!fromGroup||!toGroup||fromGroup.parent!==toGroup.parent)return undefined;
 const memberDirection=(group:VisualGroup)=>group.layout?.kind==='flow'||group.layout?.kind==='stack'?group.layout.direction??'TB':!group.layout?'TB':group.layout.kind==='grid'&&group.layout.columns===1?'TB':undefined;
 if(memberDirection(fromGroup)!==(direction==='LR'?'TB':'LR')||memberDirection(toGroup)!==(direction==='LR'?'TB':'LR')||groups.some(group=>group.parent===fromGroup.id||group.parent===toGroup.id))return undefined;
 const rankFromCenter=(group:VisualGroup,nodeId:string)=>{const members=ordered(nodes.filter(node=>node.group===group.id),group.layout?.order),index=members.findIndex(node=>node.id===nodeId);return index<0?undefined:index-(members.length-1)/2;};
 const fromRank=rankFromCenter(fromGroup,from.id),toRank=rankFromCenter(toGroup,to.id);
 if(fromRank===undefined||toRank===undefined)return undefined;
 const delta=toRank-fromRank,budget=Math.max(40,offset);
 if(delta===0){const diagonal=Math.ceil(budget/Math.SQRT2);return direction==='LR'?`-${diagonal} -${diagonal}`:`${diagonal} ${diagonal}`;}
 const magnitude=Math.hypot(delta,1),crossAxis=budget*Math.abs(delta)/magnitude,alongAxis=budget/magnitude;
 return direction==='LR'?`${-Math.sign(delta)*crossAxis} -${alongAxis}`:`${alongAxis} ${-Math.sign(delta)*crossAxis}`;
};
const curvedPeerGroupOffset=(visual:Visual,edges:VisualEdge[])=>{
 const offsets=new Map<string,number>(),edgeIds=new Set<string>();
 if(visual.layout)return{offsets,edgeIds};
 const groups=visual.groups??[],nodes=visual.nodes??[],byId=new Map(groups.map(group=>[group.id,group])),pairs=new Map<string,{from:string;to:string;edgeIds:Set<string>}>();
 for(const edge of edges){
  if(edge.routing?.kind!=='curved'||edge.directed===false||!edge.fromPort||!edge.toPort)continue;
  const fromNode=nodes.find(node=>node.id===edge.from),toNode=nodes.find(node=>node.id===edge.to),fromPort=fromNode?.ports?.find(port=>port.id===edge.fromPort),toPort=toNode?.ports?.find(port=>port.id===edge.toPort);
  if(fromPort?.side!=='east'||toPort?.side!=='west')continue;
  const from=byId.get(fromNode?.group??''),to=byId.get(toNode?.group??'');
  if(!from||!to||from.id===to.id||from.parent!==undefined||to.parent!==undefined||from.layout||to.layout)continue;
  const key=from.id+'\u0000'+to.id,pair=pairs.get(key)??{from:from.id,to:to.id,edgeIds:new Set<string>()};pair.edgeIds.add(edge.id);pairs.set(key,pair);
 }
 if(pairs.size!==1)return{offsets,edgeIds};
 const pair=pairs.values().next().value as {from:string;to:string;edgeIds:Set<string>}|undefined;
 if(!pair)return{offsets,edgeIds};
 offsets.set(pair.to,-24);for(const id of pair.edgeIds)edgeIds.add(id);
 return{offsets,edgeIds};
};
const joined=(items:Array<string|undefined>)=>items.filter((item):item is string=>!!item).join(' ');

type ColorSet={fill:string;stroke:string;color:string;shape?:string};
const roles:Record<string,ColorSet>={
 actor:{fill:'--amber-wash',stroke:'--amber-deep',color:'--amber-ink',shape:'oval'},
 own:{fill:'--teal-wash',stroke:'--teal-deep',color:'--teal-ink'},
 platform:{fill:'--sky-wash',stroke:'--sky-deep',color:'--sky-ink'},
 external:{fill:'--gray-wash',stroke:'--gray-deep',color:'--gray-ink'},
 store:{fill:'--blue-wash',stroke:'--blue-deep',color:'--blue-ink',shape:'cyl'},
 document:{fill:'--purple-wash',stroke:'--purple-deep',color:'--purple-ink',shape:'note'},
 process:{fill:'--rose-wash',stroke:'--rose-deep',color:'--rose-ink'},
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

function nodeStyle(node:VisualNode,width?:number):{type:string;properties:string[];approximations:Array<[string,string,string]>}{
 const palette=node.role?roles[node.role]:undefined;
 const fill=palette?.fill??(node.status?({built:'--green-wash',placeholder:'--amber-wash',decided:'--sky-wash',unknown:'--gray-wash'} as Record<string,string>)[node.status]:undefined);
 const stroke=node.status?statuses[node.status]:palette?.stroke;
 const color=palette?.color??stroke;
 const portLabels=(node.ports??[]).map(port=>portCaption(port).length);
 const portWidth=portLabels.length?Math.max(320,Math.max(...portLabels)*8+190):240;
 const shape=liniShapeDefinition(node.shape),props=[fill?property('fill',fill):undefined,stroke?property('stroke',stroke):undefined,color?property('color',color):undefined,node.emphasis==='focus'?property('stroke-width',3):node.emphasis==='muted'?property('opacity',0.55):undefined,...(shape?.properties??[]),property('width',width??portWidth)];
 const approximations:Array<[string,string,string]>=[];
 if(node.role)approximations.push(['role',`Node role ${node.role}`,node.role==='process'?'Lini shows the “Process” role caption and process palette while preserving the authored shape; this denotes a depicted process/activity.':node.shape?`Lini role ${node.role} palette color is shown independently from the authored native ${node.shape} shape.`:`Lini node shape/color convention (${palette?.shape??'box'} with palette ${node.role}).`]);
 if(node.status)approximations.push(['status',`Node status ${node.status}`,'Lini fill/stroke color convention.']);
 if(node.emphasis)approximations.push(['emphasis',`Node emphasis ${node.emphasis}`,node.emphasis==='focus'?'Lini uses a heavier native stroke.':'Lini uses reduced native opacity.']);
 const type=shape?.type??palette?.shape??'box';
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
  `padding: ${layoutKind==='flow'?40:22};`,
  property('fill',statusFill??palette?.fill??'--gray-wash'),
  property('stroke',statusStroke??palette?.stroke??'--gray-deep'),
  property('color',palette?.color??statusStroke??'--gray-deep'),
  property('stroke-width',group?.emphasis==='focus'?3:1),
  group?.emphasis==='muted'?property('opacity',0.55):undefined,
 ].filter((item):item is string=>!!item);
}
function nodeDeclaration(node:VisualNode,nativeId:string,placement?:{x:number;y:number;width:number},extraCells:string[]=[]):string{
 const style=nodeStyle(node,placement?.width);
 const caption=node.label;
 const symbol=node.icon?liniIcon(node.icon):undefined;
 const children=[node.detail?`|cell#detail| ${q(node.detail)}`:undefined,node.role==='process'&&node.label!=='Process'&&node.detail!=='Process'?`|cell#role| ${q('Process')}`:undefined,symbol?`|icon| { symbol: ${symbol}; width: 18; height: 18; fill: none; stroke: --blue-deep; }`:node.icon?`|cell#icon| ${q('Icon: '+node.icon)}`:undefined,...extraCells,...(node.ports??[]).map((port,index)=>`|cell#p${index+1}| ${q(portCaption(port))} { pin: ${port.side?({north:'top',east:'right',south:'bottom',west:'left'} as const)[port.side]:'right'}; font-size: 11; font-weight: 400; color: --gray-deep; padding: 2; }`)].filter((item):item is string=>!!item);
 const properties=style.properties;
 const positioned=placement?`pin: center; translate: ${Math.round(placement.x)} ${Math.round(placement.y)}; `:'';
 return `|${style.type}#${nativeId}| ${q(caption)}${properties.length||positioned?` { ${positioned}${properties.join(' ')} }`:''}${children.length?` [\n${children.map(item=>'  '+item).join('\n')}\n]`:''}`;
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
 if(visual.kind==='structure'&&visual.form==='nested')return compileLiniNestedPresentation(visual,direction);
 if(visual.kind==='timeline'&&(visual.form==='history'||visual.form==='milestones'))return compileLiniTimelinePresentation(visual);
 if(visual.kind==='sequence'||visual.kind==='structure'&&visual.form==='tree'){
  try{return visual.kind==='sequence'?compileLiniSequence(visual):compileLiniTree(visual,direction);}
  catch(reason){const path=reason&&typeof reason==='object'&&'sourcePath'in reason&&typeof reason.sourcePath==='string'?reason.sourcePath:'/extensions/umf.visual';return failure('PRESENTATION_LINI_TEXT',path,reason instanceof Error?reason.message:'Lini could not encode the authored presentation text.');}
 }
 const map:PresentationElement[]=[],omissions:PresentationOmission[]=[],approximations:PresentationApproximation[]=[];
 const styleRules:string[]=['--lini-font-family: Arial;','.lini-block { font-family: Arial; }','.lini-caption { translate: 0 -30; font-scale: 14 16; }'];
 const add=(logicalId:string,sourcePath:string,nativeId:string,kind:PresentationElement['kind'])=>map.push({logicalId,sourcePath,nativeId,kind});
 const mapPorts=(node:VisualNode,index:number,nativeId:string)=>node.ports?.forEach((port,portIndex)=>add(port.id,path('/nodes/'+index+'/ports/'+portIndex),nativeId+'.p'+(portIndex+1),'port'));
 const omit=(sourcePath:string,reason:string)=>omissions.push({sourcePath,reason});
 const approx=(sourcePath:string,requested:string,representation:string,code?:PresentationPlan['approximations'][number]['code'])=>approximations.push({sourcePath,requested,representation,...(code?{code}:{})});
 const path=(part:string)=>at(part);
 const title=visual.title??visual.question;
  const pipelineContext=visual.kind==='flow'&&visual.form==='pipeline';
 try{
  add(visual.id,path('/id'),'visual','visual');
  if(visual.title&&visual.question!==visual.title&&!pipelineContext)omit(path('/question'),'The reader question remains in the UMF document; Lini displays the concise title in the native diagram frame.');
  if(visual.takeaway&&!pipelineContext)omit(path('/takeaway'),'Takeaway remains in the definition source and is not drawn as diagram content.');
  if(visual.source)omit(path('/source'),'Source provenance remains in UMF and is not embedded in diagram geometry.');
  if(visual.omissions)for(let i=0;i<visual.omissions.length;i++)omit(path('/omissions/'+i),'Authored omission inventory remains in UMF and is not drawn.');
  if(visual.steps)omit(path('/steps'),'Walkthrough step titles, captions, focus references, and throughout annotations remain in the UMF source; this static Lini graph does not render or animate them.');
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
  const rootColumns=visual.form==='entities'?(direction==='TB'?1:2):visual.form==='stack'?(rootLayout?.kind==='stack'&&(rootLayout.direction??direction)==='LR'?Math.max(1,visual.structure?.layers?.length??nodes.length):1):visual.form==='network'?(direction==='TB'?1:Math.max(1,Math.min(3,rootComponents))):undefined;
  const rootComponentOf=(nodeId:string)=>{const node=nodes.find(candidate=>candidate.id===nodeId);let group=groups.find(candidate=>candidate.id===node?.group);while(group?.parent)group=groups.find(candidate=>candidate.id===group!.parent);return group?.id??nodeId;};
  const rootComponentIds=[...groups.filter(group=>!group.parent).map(group=>group.id),...nodes.filter(node=>!node.group&&!node.parent).map(node=>node.id)];
  const rootComponentEdges=edges.filter(edge=>edge.kind!=='return').map(edge=>({from:rootComponentOf(edge.from),to:rootComponentOf(edge.to),directed:edge.directed})).filter(edge=>edge.from!==edge.to);
  const rootComponentRanks=visual.kind==='flow'&&(visual.form==='network'||visual.form==='lanes')&&!rootLayout&&groups.length>0&&rootComponentIds.length>1&&nodes.every(node=>!node.parent)&&rootComponentEdges.length>0?directedDagRanks(rootComponentIds,rootComponentEdges):undefined;
  const rootComponentGap=rootComponentRanks?Math.max(72,...edges.filter(edge=>edge.kind!=='return'&&rootComponentOf(edge.from)!==rootComponentOf(edge.to)&&edge.label!==undefined).map(edge=>direction==='LR'?Math.ceil(estimateMultilineTextWidth(wrapLiniCaption(edge.label??''))+40):Math.ceil(estimateTextLines(wrapLiniCaption(edge.label??''))*16+32))):72;
  const zonedTierGap=visual.kind==='flow'&&visual.form==='zoned'&&!rootLayout?Math.max(112,...edges.filter(edge=>edge.label!==undefined&&rootComponentOf(edge.from)!==rootComponentOf(edge.to)).map(edge=>direction==='LR'?Math.ceil(estimateMultilineTextWidth(wrapLiniCaption(edge.label??'',160))+56):Math.ceil(estimateTextLines(wrapLiniCaption(edge.label??'',160))*18+40))):72;
  const stateDirection=visual.kind==='state'&&rootLayout?.kind==='flow'?(rootLayout.direction??direction):direction;
  const stateCaptionWidth=visual.kind==='state'?Math.max(0,...(visual.state?.transitions??[]).map(stateTransitionCaption).map(estimateMultilineTextWidth)):0;
  const stateGap=stateDirection==='LR'?Math.max(72,Math.ceil(stateCaptionWidth+48)):72;
  const stateNodeOrder=new Map(ordered(nodes,rootLayout?.kind==='flow'?rootLayout.order:undefined).map((node,index)=>[node.id,index]));
  const circularNodes=rootLayout?.kind==='circular'&&visual.kind==='flow'?ordered(nodes,rootLayout.order):[];
  const circularSizes=circularNodes.map(node=>({id:node.id,width:Math.max(120,(Math.max(node.label.length,node.detail?.length??0)*8)+32,...(node.ports??[]).map(port=>portCaption(port).length*8+190)),height:58+(node.detail?22:0)+(node.role==='process'&&node.label!=='Process'&&node.detail!=='Process'?18:0)}));
  const circle=circularNodes.length?circularPlacement(circularSizes,28):undefined;
  const circlePosition=new Map<string,{id:string;x:number;y:number;width:number}>(circle?.positions.map((position,index)=>[position.id,{...position,width:circularSizes[index]!.width}])??[]);
  const dagRanks=visual.kind==='flow'&&(visual.form==='pipeline'||visual.form==='network')&&!rootLayout&&!groups.length&&nodes.every(node=>!node.group&&!node.parent)?directedDagRanks(nodes.map(node=>node.id),edges.filter(edge=>edge.kind!=='return')):undefined;
  const dagLayers=dagRanks?Array.from({length:Math.max(0,...dagRanks.values())+1},(_,rank)=>nodes.filter(node=>dagRanks.get(node.id)===rank)):[];
  const dagNodeWidths=new Map(nodes.map(node=>[node.id,Math.max(240,estimateTextWidth(node.label)+48,node.detail?estimateTextWidth(node.detail)+48:0)]));
  const dagNodeHeight=(node:VisualNode)=>72+(node.detail?28:0)+(node.role==='process'&&node.label!=='Process'&&node.detail!=='Process'?18:0);
  const dagRowGap=40,dagColumnGap=176,dagRankGap=176,dagPadding=36;
  const dagColumnWidths=dagLayers.map(layer=>Math.max(0,...layer.map(node=>dagNodeWidths.get(node.id)!)));
  const dagLayerWidths=dagLayers.map(layer=>direction==='LR'?Math.max(0,...layer.map(node=>dagNodeWidths.get(node.id)!)):layer.reduce((sum,node)=>sum+dagNodeWidths.get(node.id)!,0)+Math.max(0,layer.length-1)*dagColumnGap);
  const dagLayerHeights=dagLayers.map(layer=>direction==='LR'?layer.reduce((sum,node)=>sum+dagNodeHeight(node),0)+Math.max(0,layer.length-1)*dagRowGap:Math.max(0,...layer.map(dagNodeHeight)));
  const dagWidth=dagRanks?direction==='LR'?dagPadding*2+dagColumnWidths.reduce((sum,width)=>sum+width,0)+Math.max(0,dagLayers.length-1)*dagRankGap:dagPadding*2+Math.max(0,...dagLayerWidths):0;
  const dagHeight=dagRanks?direction==='LR'?120+Math.max(0,...dagLayerHeights):120+dagLayerHeights.reduce((sum,height)=>sum+height,0)+Math.max(0,dagLayers.length-1)*dagRankGap:0;
  const dagPosition=new Map<string,{id:string;x:number;y:number;width:number}>();
  if(dagRanks&&direction==='LR'){let x=-dagWidth/2+dagPadding;for(let rank=0;rank<dagLayers.length;rank++){const layer=dagLayers[rank]!,columnWidth=Math.max(0,...layer.map(node=>dagNodeWidths.get(node.id)!)),height=dagLayerHeights[rank]!;let y=-height/2;for(const node of layer){const itemHeight=dagNodeHeight(node),width=dagNodeWidths.get(node.id)!;dagPosition.set(node.id,{id:node.id,x:x+columnWidth/2,y:y+itemHeight/2,width});y+=itemHeight+dagRowGap;}x+=columnWidth+dagRankGap;}}
  if(dagRanks&&direction==='TB'){let y=-dagHeight/2+60;for(let rank=0;rank<dagLayers.length;rank++){const layer=dagLayers[rank]!,width=dagLayerWidths[rank]!;let x=-width/2;for(const node of layer){const nodeWidth=dagNodeWidths.get(node.id)!;dagPosition.set(node.id,{id:node.id,x:x+nodeWidth/2,y:y+dagLayerHeights[rank]!/2,width:nodeWidth});x+=nodeWidth+dagColumnGap;}y+=dagLayerHeights[rank]!+dagRankGap;}}
  const dagDegrees=new Map(nodes.map(node=>[node.id,edges.filter(edge=>edge.from===node.id||edge.to===node.id).length]));
  if(circle||dagRanks){const sceneWidth=circle?Math.ceil(circle.radius*2+Math.max(...circularSizes.map(item=>item.width))+72):dagWidth,titleCenter=Math.round(sceneWidth/2-estimateTextWidth(qTitle)/2);styleRules.push(`.lini-caption { font-size: 22; font-weight: 600; color: --blue-deep; translate: ${titleCenter} -30; }`);}
  if(visual.kind==='flow'&&visual.form==='zoned'&&!rootLayout)styleRules.push('.lini-caption { font-size: 14; }');
  const rootProperties=[...(circle?['layout: flow;','direction: row;',`width: ${Math.ceil(circle.radius*2+Math.max(...circularSizes.map(item=>item.width))+72)};`,`height: ${Math.ceil(circle.radius*2+Math.max(...circularSizes.map(item=>item.height))+90)};`]:dagRanks?['layout: flow;',`direction: ${direction==='LR'?'row':'column'};`,`width: ${dagWidth};`,`height: ${dagHeight};`]:layoutProperties(rootLayout,fallbackLayout,rootColumns??1,direction)),`gap: ${visual.kind==='state'?stateGap:visual.form==='entities'?88:visual.form==='stack'?44:visual.form==='zoned'&&!rootLayout?zonedTierGap:rootComponentRanks?rootComponentGap:72};`,`padding: 36;`,`fill: none;`,`stroke: none;`,`stroke-width: 0;`].filter((item):item is string=>!!item);
  if(dagRanks)approx(path('/form'),'Directed flow with no authored layout','Renderer-owned dependency-depth ranks follow the requested presentation direction and use only authored directed non-return links; declaration order is preserved within each rank. Return links remain drawn but do not set rank. Placement adds no links and makes no concurrency claim.');
  if(rootComponentRanks)approx(path('/form'),'Grouped flow components with no authored layout','Renderer-owned root component ranks use only authored cross-component directed non-return edges; group subtrees and their members remain intact, and declaration order breaks equal-rank ties. Return links remain drawn but do not set ranks. This changes placement only, adds no links, and makes no concurrency claim.');
  if(rootLayout?.kind==='grid'&&rootLayout.columns===1)approx(path('/layout'),'Grid layout with one column','Lini 1.1 represents a one-column grid with native column flow; requested component order and single-column containment are preserved.');
  let children:string[]=[];
  let annotationFooter:string|undefined;

  if(visual.kind==='state'){
   const state=visual.state;
   const scopeDiagnostics=validateStateMachineScope(visual);if(scopeDiagnostics.length)return{ok:false,diagnostics:scopeDiagnostics};
   if(!state)return failure('PRESENTATION_LINI_STATE_SCOPE',path('/state'),'A state-machine definition is required.');
   const stateIndex=new Map(nodes.map((node,index)=>[node.id,index]));
   const markerCells=new Map<string,string[]>();
   const addMarker=(stateId:string,sourcePath:string,cellId:string,text:string)=>{
    const nodeIndex=stateIndex.get(stateId);if(nodeIndex===undefined)return false;
    const nativeId=nodeIds.get(stateId)!;
    add(stateId,sourcePath,nativeId+'.'+cellId,'state-marker');
    const rows=markerCells.get(stateId)??[];
    rows.push(`|cell#${cellId}| ${quoteChecked(text,sourcePath)} { fill: --amber-wash; stroke: --amber-deep; color: --amber-ink; font-size: 12; font-weight: 700; padding: 3; }`);
    approx(sourcePath,text+' state marker','Lini has no dedicated pseudostate; it places this exact marker label in a distinct native cell inside the referenced state carrier.');
    markerCells.set(stateId,rows);return true;
   };
   if(!addMarker(state.initial,path('/state/initial'),'initial','Initial'))return failure('PRESENTATION_LINI_STATE_INITIAL',path('/state/initial'),'The initial state does not resolve to a declared node.');
   for(let index=0;index<(state.final??[]).length;index++)if(!addMarker(state.final![index]!,path('/state/final/'+index),'final'+(index+1),'Final'))return failure('PRESENTATION_LINI_STATE_FINAL',path('/state/final/'+index),'A final state does not resolve to a declared node.');
   for(let index=0;index<nodes.length;index++){
    const node=nodes[index]!,nativeId=nodeIds.get(node.id)!;add(node.id,path('/nodes/'+index+'/id'),nativeId,'node');
    if(node.evidence)omit(path('/nodes/'+index+'/evidence'),'Evidence locators remain in UMF and are not drawn in the native state view.');
    for(const[field,requested,representation]of nodeStyle(node).approximations)approx(path('/nodes/'+index+'/'+field),requested,representation);
    if(node.detail)approx(path('/nodes/'+index+'/detail'),'State detail','Lini renders the authored detail as a persistent secondary native cell beneath the state title.');
   }
   for(let index=0;index<state.transitions.length;index++){
    const transition=state.transitions[index]!,from=nodeIds.get(transition.from),to=nodeIds.get(transition.to);
    if(!from||!to)return failure('PRESENTATION_LINI_STATE_ENDPOINT',path('/state/transitions/'+index),'A state transition endpoint is not a declared state node.');
    const nativeId=safeId('t',index);
    add(transition.id,path('/state/transitions/'+index),nativeId,'transition');
    styleRules.push(`.${nativeId} { stroke: --teal-deep; }`);
   }
   children=ordered(nodes,rootLayout?.kind==='flow'?rootLayout.order:undefined).map(node=>nodeDeclaration(node,nodeIds.get(node.id)!,undefined,markerCells.get(node.id)??[]));
   children.push(...state.transitions.map((transition,index)=>{
    const label=stateTransitionCaption(transition),parallel=state.transitions.filter(candidate=>candidate.from===transition.from&&candidate.to===transition.to),parallelIndex=parallel.indexOf(transition),offset=Math.max(40,flowCaptionOffset(stateDirection,label,nodes[stateIndex.get(transition.from)!],nodes[stateIndex.get(transition.to)!],0.5,stateGap,parallelIndex)),forward=stateNodeOrder.get(transition.from)!<=stateNodeOrder.get(transition.to)!,side=forward?-1:1,crossAxis=stateDirection==='LR'?side:-side,translate=stateDirection==='LR'?`0 ${crossAxis*offset}`:`${crossAxis*offset} 0`;
    return`${nodeIds.get(transition.from)} -> ${nodeIds.get(transition.to)} .${safeId('t',index)} { along: 0.5; } [ ${quoteChecked(label,path('/state/transitions/'+index))} { translate: ${translate}; } ]`;
   }));
  }else if(visual.kind==='flow'){
    for(const node of nodes){const index=nodes.indexOf(node),id=nodeIds.get(node.id)!;add(node.id,path('/nodes/'+index+'/id'),id,'node');mapPorts(node,index,id);for(const[field,value]of [['evidence',node.evidence],['parent',node.parent]] as const)if(value!==undefined)omit(path('/nodes/'+index+'/'+field),field==='parent'?'Lini groups preserve named group membership; the node-parent containment relation has no separate native meaning in this view.':'Evidence locators remain in UMF and are not drawn.');if(node.layer)omit(path('/nodes/'+index+'/layer'),'Stack layer assignment is outside the flow/network view.');const style=nodeStyle(node);for(const [field,requested,rendered]of style.approximations)approx(path('/nodes/'+index+'/'+field),requested,rendered);if(node.detail)approx(path('/nodes/'+index+'/detail'),'Node detail','Lini renders the authored detail as a persistent secondary native cell beneath the node title.');}
   const descendants=(parent:string|undefined)=>groups.filter(group=>group.parent===parent);
   const members=(group:string|undefined)=>nodes.filter(node=>node.group===group);
   const groupChain=(groupId:string|undefined):VisualGroup[]=>{if(!groupId)return[];const group=groups.find(item=>item.id===groupId);return group?[...groupChain(group.parent),group]:[];};
   const orderFlowItems=(items:Array<VisualGroup|VisualNode>,order:string[]|undefined,authoredLayout=false):Array<VisualGroup|VisualNode>=>{
    if(visual.kind!=='flow'||visual.form!=='zoned'||order||authoredLayout)return ordered(items,order);
    return orderTiered(items.map(item=>({id:item.id,tier:groups.find(group=>group.id===item.id)?.tier,item}))).map(entry=>entry.item);
   };
   const rootItems=orderFlowItems([...descendants(undefined),...members(undefined)],rootLayout?.order,!!rootLayout);
   const tierColumnByGroup=new Map<string,string>(),tierColumnGroups=new Map<number,VisualGroup[]>();
   if(visual.kind==='flow'&&visual.form==='zoned'&&!rootLayout){
    for(const item of rootItems)if(groups.includes(item as VisualGroup)&&(item as VisualGroup).tier!==undefined){const group=item as VisualGroup,tier=group.tier!,peers=tierColumnGroups.get(tier)??[];peers.push(group);tierColumnGroups.set(tier,peers);}
    const tiers=[...tierColumnGroups.keys()].sort((a,b)=>a-b);tiers.forEach((tier,index)=>{const wrapper=safeId('tc',index);for(const group of tierColumnGroups.get(tier)??[])tierColumnByGroup.set(group.id,wrapper);});
   }
   const componentAtScope=(nodeId:string,scope?:string)=>{const node=nodes.find(item=>item.id===nodeId),chain=groupChain(node?.group);if(scope===undefined)return chain[0]?.id??nodeId;const index=chain.findIndex(group=>group.id===scope);return index>=0?chain[index+1]?.id??nodeId:nodeId;};
   const directionAtScope=(scope?:string)=>{if(scope===undefined)return (rootLayout as {direction?:'LR'|'TB'}|undefined)?.direction??direction;const layout=groups.find(item=>item.id===scope)?.layout as {direction?:'LR'|'TB'}|undefined;return layout?.direction??'TB';};
   const routeKindsByScope=new Map<string|undefined,Set<'curved'|'straight'>>();
   for(const edge of edges)if(edge.routing){const fromGroups=groupChain(nodes.find(node=>node.id===edge.from)?.group),toGroups=groupChain(nodes.find(node=>node.id===edge.to)?.group);let common=0;while(common<fromGroups.length&&common<toGroups.length&&fromGroups[common]!.id===toGroups[common]!.id)common++;const scope=common?fromGroups[common-1]!.id:undefined,kinds=routeKindsByScope.get(scope)??new Set<'curved'|'straight'>();kinds.add(edge.routing.kind);routeKindsByScope.set(scope,kinds);}
   const rootRouteKinds=routeKindsByScope.get(undefined),peerCurvePolicy=rootRouteKinds?.size===1&&rootRouteKinds.has('curved')?curvedPeerGroupOffset(visual,edges):{offsets:new Map<string,number>(),edgeIds:new Set<string>()};
   if(rootComponentRanks){const declarationOrder=new Map(rootItems.map((item,index)=>[item.id,index]));rootItems.sort((left,right)=>rootComponentRanks.get(left.id)!-rootComponentRanks.get(right.id)!||declarationOrder.get(left.id)!-declarationOrder.get(right.id)!);}
   else if(visual.form!=='zoned'&&!rootLayout?.order&&routeKindsByScope.get(undefined)?.size===1&&routeKindsByScope.get(undefined)?.has('curved')){
    const relations=edges.filter(edge=>edge.routing?.kind==='curved'&&edge.directed!==false).map(edge=>[componentAtScope(edge.from),componentAtScope(edge.to)] as [string,string]);
    rootItems.splice(0,rootItems.length,...stableRoutedOrder(rootItems,relations));
   }
   const routeScopeItems=(scope:string)=>{
    const group=groups.find(item=>item.id===scope),order=group?.layout?.order,items=orderFlowItems([...descendants(scope),...members(scope)],order,!!group?.layout);
    if(visual.form==='zoned'||order||routeKindsByScope.get(scope)?.size!==1||!routeKindsByScope.get(scope)?.has('curved'))return items;
    const relations:Array<[string,string]>=[];
    for(const edge of edges)if(edge.routing?.kind==='curved'&&edge.directed!==false){const fromGroups=groupChain(nodes.find(item=>item.id===edge.from)?.group),toGroups=groupChain(nodes.find(item=>item.id===edge.to)?.group);let common=0;while(common<fromGroups.length&&common<toGroups.length&&fromGroups[common]!.id===toGroups[common]!.id)common++;if((common?fromGroups[common-1]!.id:undefined)===scope)relations.push([componentAtScope(edge.from,scope),componentAtScope(edge.to,scope)]);}
    return stableRoutedOrder(items,relations);
   };
   const edgeRowsByScope=new Map<string|undefined,string[]>();
   const straightRoutingGroups=new Set<string>();let straightRootRouting=false;
   for(let i=0;i<edges.length;i++){
    const edge=edges[i]!,fromNode=nodes.find(node=>node.id===edge.from),toNode=nodes.find(node=>node.id===edge.to),from=nodeIds.get(edge.from),to=nodeIds.get(edge.to);if(!from||!to)return failure('PRESENTATION_LINI_ENDPOINT',path('/edges/'+i),'Lini link endpoint is not a declared visual node.');
    const fromPort=findPort(fromNode,edge.fromPort),toPort=findPort(toNode,edge.toPort);if((edge.fromPort&&!fromPort)||(edge.toPort&&!toPort))return failure('PRESENTATION_LINI_PORT',path('/edges/'+i),'A flow edge port reference does not resolve within its endpoint node.');
    const portSide={north:'top',east:'right',south:'bottom',west:'left'} as const;
    const fromGroups=groupChain(fromNode?.group),toGroups=groupChain(toNode?.group);let common=0;while(common<fromGroups.length&&common<toGroups.length&&fromGroups[common]!.id===toGroups[common]!.id)common++;
    const scope=common?fromGroups[common-1]!.id:undefined;
    if(fromPort?.side==='north'||fromPort?.side==='south'||toPort?.side==='north'||toPort?.side==='south'){if(scope)straightRoutingGroups.add(scope);else straightRootRouting=true;}
    const scopedItems=scope?routeScopeItems(scope):rootItems,routeDirection=directionAtScope(scope),sourceOrder=scopedItems.findIndex(item=>item.id===componentAtScope(edge.from,scope)),targetOrder=scopedItems.findIndex(item=>item.id===componentAtScope(edge.to,scope)),sourceAfterTarget=sourceOrder>=0&&targetOrder>=0&&sourceOrder>targetOrder,scopeLayout=scope?groups.find(group=>group.id===scope)?.layout:rootLayout,hasExplicitGrid=scopeLayout?.kind==='grid'&&scopeLayout.columns>1;
    const inferNaturalSide=edge.routing?.kind==='curved'&&!fromPort&&!toPort&&!hasExplicitGrid,fromNaturalSide=inferNaturalSide?(routeDirection==='LR'?(sourceAfterTarget?'bottom':'right'):(sourceAfterTarget?'right':'bottom')):undefined,toNaturalSide=inferNaturalSide?(routeDirection==='LR'?(sourceAfterTarget?'right':'bottom'):(sourceAfterTarget?'bottom':'right')):undefined;
    const fromWrapper=common===0&&fromGroups.length?tierColumnByGroup.get(fromGroups[0]!.id):undefined,toWrapper=common===0&&toGroups.length?tierColumnByGroup.get(toGroups[0]!.id):undefined;
    const source=[...(fromWrapper?[fromWrapper]:[]),...fromGroups.slice(common).map(group=>groupIds.get(group.id)!),from+(fromPort?'.p'+(fromNode!.ports!.indexOf(fromPort)+1)+(fromPort.side?':'+portSide[fromPort.side]:''):(fromNaturalSide?':'+fromNaturalSide:''))].join('.');
    const target=[...(toWrapper?[toWrapper]:[]),...toGroups.slice(common).map(group=>groupIds.get(group.id)!),to+(toPort?'.p'+(toNode!.ports!.indexOf(toPort)+1)+(toPort.side?':'+portSide[toPort.side]:''):(toNaturalSide?':'+toNaturalSide:''))].join('.'),className=safeId('e',i);
    add(edge.id,path('/edges/'+i),className,'edge');
    const label=edge.label??'',style:string[]=[];
    if(edge.kind==='data')style.push(property('stroke-style','dashed'));else if(edge.kind==='control')style.push(property('stroke-style','dotted'));else if(edge.kind==='return')style.push(property('stroke-style','double'));
    if(edge.status)style.push(property('stroke',statuses[edge.status]??'--gray-deep'));
    if(edge.emphasis==='focus')style.push(property('stroke-width',3));else if(edge.emphasis==='muted')style.push(property('opacity',0.55));
    styleRules.push(`.${className} { ${style.length?style.join(' '):'stroke: --teal-deep;'} }`);
    const fromGroupPath=groupChain(fromNode?.group).map(group=>group.id),toGroupPath=groupChain(toNode?.group).map(group=>group.id),isPrefix=(outer:string[],inner:string[])=>outer.length<inner.length&&outer.every((id,index)=>id===inner[index]),crossingCaptionAlong=isPrefix(fromGroupPath,toGroupPath)?0.1:isPrefix(toGroupPath,fromGroupPath)?0.9:undefined,siblingGroupPaths=fromGroupPath.length>0&&toGroupPath.length>0&&fromGroupPath.at(-1)!==toGroupPath.at(-1),spansRootComponent=siblingGroupPaths&&scope===undefined&&sourceOrder>=0&&targetOrder>=0&&Math.abs(sourceOrder-targetOrder)>1,rootComponentCrossing=!!rootComponentRanks&&componentAtScope(edge.from)!==componentAtScope(edge.to),dagRankCrossing=!!dagRanks&&dagRanks.get(edge.from)!==dagRanks.get(edge.to),zonedRootCrossing=visual.kind==='flow'&&visual.form==='zoned'&&!rootLayout&&scope===undefined&&rootComponentOf(edge.from)!==rootComponentOf(edge.to),rankedCrossing=rootComponentCrossing||dagRankCrossing||zonedRootCrossing,parallelEdges=edges.filter(candidate=>candidate.from===edge.from&&candidate.to===edge.to),parallelIndex=parallelEdges.indexOf(edge),uniquePair=parallelEdges.length===1,sourceIsGroup=rootComponentIds.includes(componentAtScope(edge.from))&&groups.some(group=>group.id===componentAtScope(edge.from)),targetIsGroup=rootComponentIds.includes(componentAtScope(edge.to))&&groups.some(group=>group.id===componentAtScope(edge.to)),rootComponentAlong=sourceIsGroup&&!targetIsGroup?0.85:!sourceIsGroup&&targetIsGroup?0.15:0.5,fanoutToTargetComponent=rootComponentCrossing&&edges.filter(candidate=>candidate.from===edge.from&&rootComponentOf(candidate.to)===rootComponentOf(edge.to)).length>1?0.58:undefined,fromDag=dagPosition.get(edge.from),toDag=dagPosition.get(edge.to),nativeLabel=rankedCrossing?wrapLiniCaption(label,visual.kind==='flow'&&visual.form==='zoned'?160:128):label,dagRankSpan=dagRankCrossing?Math.abs(dagRanks!.get(edge.to)!-dagRanks!.get(edge.from)!):0,dagCaption=dagRankCrossing?dagCaptionPlacement(routeDirection,nativeLabel,fromNode!,toNode!,fromDag,toDag,dagDegrees.get(edge.from)??0,dagDegrees.get(edge.to)??0,dagRankGap,parallelIndex,dagRankSpan):undefined,along=spansRootComponent?(sourceOrder<targetOrder?0.85:0.15):crossingCaptionAlong??(dagCaption?.along??(rootComponentCrossing?(fanoutToTargetComponent??rootComponentAlong):siblingGroupPaths?0.5:uniquePair?0.5:0.25+0.5*parallelIndex/(parallelEdges.length-1))),captionGap=scope?52:visual.form==='entities'?88:rootComponentCrossing?rootComponentGap:dagRankCrossing?dagRankGap:zonedRootCrossing?zonedTierGap:72;
    if(label)quoteChecked(label,path('/edges/'+i+'/label'));
    const caption=nativeLabel?quoteChecked(nativeLabel,path('/edges/'+i+'/label')):'',rows=edgeRowsByScope.get(scope)??[],operator=edge.directed===false?'---':'->',captionOffset=(rankedCrossing?Math.max(rootComponentCrossing?56:24,dagCaption?.offset??flowCaptionOffset(routeDirection,nativeLabel,fromNode,toNode,along,captionGap,parallelIndex)):flowCaptionOffset(routeDirection,label,fromNode,toNode,along,captionGap,parallelIndex))+(visual.form==='lanes'?32:0),parallelLane=parallelIndex*18,rankDelta=rootComponentCrossing?rootComponentRanks!.get(componentAtScope(edge.to))!-rootComponentRanks!.get(componentAtScope(edge.from))!:0,captionShiftBudget=Math.min(48,Math.max(0,(captionGap-estimateMultilineTextWidth(nativeLabel))/2)),captionShiftSign=!sourceIsGroup&&targetIsGroup?-Math.sign(rankDelta):Math.sign(rankDelta),componentAlongShift=rootComponentCrossing&&routeDirection==='LR'&&!(sourceIsGroup&&targetIsGroup)?captionShiftSign*captionShiftBudget:0,captionTranslate=spansRootComponent?(routeDirection==='LR'?`${sourceOrder<targetOrder?22:-22} -${100+parallelLane}`:`${100+parallelLane} ${sourceOrder<targetOrder?22:-22}`):siblingGroupPaths&&edge.routing?.kind==='curved'?`0 -${24+parallelLane}`:rootComponentCrossing?(routeDirection==='LR'?`${componentAlongShift} -${captionOffset}`:`${captionOffset} 0`):dagCaption?.translate??(scope&&routeDirection==='TB'?`-${captionOffset} 0`:(siblingGroupPaths?siblingGroupCaptionTranslate(routeDirection,fromNode,toNode,nodes,groups,captionOffset):undefined)??(routeDirection==='LR'?`0 -${captionOffset}`:`${captionOffset} 0`));rows.push(`${source} ${operator} ${target} .${className} { along: ${along}; }${caption?` [ ${caption} { translate: ${captionTranslate};${visual.form==='zoned'||visual.form==='lanes'?' font-size: 16;':''} } ]`:''}`);edgeRowsByScope.set(scope,rows);
    if(rankedCrossing&&nativeLabel!==label)approx(path('/edges/'+i+'/label'),zonedRootCrossing?'Tier-column edge caption wrapping':'Ranked edge caption wrapping','Lini inserts display line breaks at existing spaces; joining the visible native lines preserves the exact authored caption.');
    for(const field of ['why','evidence'] as const)if(edge[field]!==undefined)omit(path('/edges/'+i+'/'+field),field==='why'?'Lini link hints do not appear on the native link SVG; rationale remains in the source document.':'Evidence locators remain in UMF and are not drawn.');
    if(edge.kind)approx(path('/edges/'+i+'/kind'),'Connection kind '+edge.kind,edge.kind==='data'?'Dashed Lini line style.':edge.kind==='control'?'Dotted Lini line style.':'Double Lini line style.');
    if(edge.routing){const scopeKinds=routeKindsByScope.get(scope),applicable=scopeKinds?.size===1,selected=scopeKinds?.values().next().value,peerOffset=peerCurvePolicy.edgeIds.has(edge.id),selectedSides=inferNaturalSide?' Native compass sides '+fromNaturalSide+'→'+toNaturalSide+' are chosen only because this edge has no authored named ports or sides.':'',code=applicable?(selected==='curved'&&!inferNaturalSide&&!peerOffset?'ROUTING_NATIVE_INTERPOLATION':undefined):'ROUTING_SCOPE_CONFLICT';approx(path('/edges/'+i+'/routing'),'Edge routing '+edge.routing.kind,applicable?'Lini applies native routing: '+(selected==='curved'?'natural':'straight')+' to this connection scope; '+(inferNaturalSide?'native compass anchors are selected to produce a curved path without overriding named ports or sides.':peerOffset?'a renderer-owned 24-unit offset separates the two peer groups when no layout is authored, allowing natural routing to curve while preserving the declared east/west ports.':'natural routing may remain straight when the layout is collinear.')+selectedSides+' Exact control points and endpoint attachment coordinates remain native.':'Lini routing is set on a container, not per edge; this scope mixes curved and straight intent, so no requested route is selected and this edge geometry is not guaranteed.',code);}
    if(edge.status)approx(path('/edges/'+i+'/status'),'Connection status '+edge.status,'Lini stroke palette convention.');
    if(edge.emphasis)approx(path('/edges/'+i+'/emphasis'),'Connection emphasis '+edge.emphasis,edge.emphasis==='focus'?'Lini uses a heavier native stroke.':'Lini uses reduced native opacity.');
   }
   const renderGroup=(group:VisualGroup,indent=''):string=>{
    const index=groups.indexOf(group),id=groupIds.get(group.id)!,childRows:string[]=[];
    add(group.id,path('/groups/'+index),id,'group');
   const items=routeScopeItems(group.id);
    for(const item of items){if(groups.includes(item as VisualGroup))childRows.push(renderGroup(item as VisualGroup,indent+'  '));else childRows.push(nodeDeclaration(item as VisualNode,nodeIds.get(item.id)!));}
    if(group.detail)childRows.unshift(`|cell#detail| ${quoteChecked(group.detail,path('/groups/'+index+'/detail'))}`);
    childRows.push(...(edgeRowsByScope.get(group.id)??[]));
    const props=groupProperties(group,group.layout,'flow',items.length,'TB'),routeKinds=routeKindsByScope.get(group.id);if(routeKinds?.size===1){const route=routeKinds.values().next().value;props.push('routing: '+(route==='curved'?'natural':'straight')+';');}else if(!routeKinds&&straightRoutingGroups.has(group.id))props.push('routing: straight;');const offset=peerCurvePolicy.offsets.get(group.id);if(offset!==undefined)props.push('translate: 0 '+offset+';');
    if(group.layout?.kind==='grid'&&group.layout.columns===1)approx(path('/groups/'+index+'/layout'),'Grid layout with one column','Lini 1.1 represents a one-column grid with native column flow; requested node order and single-column containment are preserved.');
    if(group.role)approx(path('/groups/'+index+'/role'),visual.form==='lanes'&&group.role==='lane'?'Lane group role':'Group role '+group.role,visual.form==='lanes'&&group.role==='lane'?'The mapped native group container represents this declared lane and its members. Native placement is renderer-selected; no physical alignment, equal dimensions, or chronological order is implied.':'Lini applies the role palette convention to the native group boundary; this is a presentation styling choice, not an intrinsic Lini group semantic.');
    if(group.status)approx(path('/groups/'+index+'/status'),'Group status '+group.status,'Lini renders status through the native boundary fill and stroke color convention.');
    if(group.emphasis)approx(path('/groups/'+index+'/emphasis'),'Group emphasis '+group.emphasis,group.emphasis==='focus'?'Lini renders focus with a heavier native group boundary.':'Lini renders muted emphasis with reduced native group opacity.');
    if(group.tier!==undefined){if(visual.kind==='flow'&&visual.form==='zoned')approx(path('/groups/'+index+'/tier'),'Group tier '+group.tier,'The exact integer appears as “Tier '+group.tier+'” in this group’s native caption. Without authored layout/order at this scope, declarations are emitted by ascending tier with stable source-order ties; root groups use unlabelled renderer columns only when no root layout is authored. Tier values are ordinal labels, not calibrated distances.');else omit(path('/groups/'+index+'/tier'),'Tier remains in the UMF source; this Lini group rendering has no persistent tier carrier.');}
    return groupDeclaration(id,labelGroup(group,visual.kind==='flow'&&visual.form==='zoned'),props,childRows,indent);
   };
   if(tierColumnGroups.size){
    const emitted=new Set<number>();
    for(const item of rootItems){
     if(groups.includes(item as VisualGroup)&&(item as VisualGroup).tier!==undefined){
      const tier=(item as VisualGroup).tier!;if(emitted.has(tier))continue;emitted.add(tier);
      const peers=tierColumnGroups.get(tier)??[],wrapper=tierColumnByGroup.get(peers[0]?.id??'')!,orientation=direction==='LR'?'column':'row';
      const wrapperProps=['layout: flow;',`direction: ${orientation};`,'gap: 24;','padding: 16;','fill: none;','stroke: none;','stroke-width: 0;'];
      children.push(groupDeclaration(wrapper,'',wrapperProps,peers.map(group=>renderGroup(group)),''));
     }else if(groups.includes(item as VisualGroup))children.push(renderGroup(item as VisualGroup));
     else children.push(nodeDeclaration(item as VisualNode,nodeIds.get(item.id)!,circlePosition.get(item.id)??dagPosition.get(item.id)));
    }
   }else for(const item of rootItems){if(groups.includes(item as VisualGroup))children.push(renderGroup(item as VisualGroup));else children.push(nodeDeclaration(item as VisualNode,nodeIds.get(item.id)!,circlePosition.get(item.id)??dagPosition.get(item.id)));}
   children.push(...(edgeRowsByScope.get(undefined)??[]));
   if(rootRouteKinds?.size===1){const route=rootRouteKinds.values().next().value;rootProperties.push('routing: '+(route==='curved'?'natural':'straight')+';');}else if(!rootRouteKinds&&straightRootRouting)rootProperties.push('routing: straight;');
   if(rootLayout?.kind==='flow'&&rootLayout.order)approx(path('/layout/order'),'Explicit root component order','Declarations follow the requested order; native graph layout can still route links around that order.');
  if(visual.annotations?.length||pipelineContext&&((visual.title&&visual.question!==visual.title)||visual.takeaway)){
    const footerChildren:string[]=[];
    if(pipelineContext&&visual.title&&visual.question!==visual.title){
     const nativeId='pipeline-question-caption';add(path('/question'),path('/question'),nativeId,'annotation');
     footerChildren.push(`|box#${nativeId}| ${quoteChecked(visual.question,path('/question'))} { width: ${Math.ceil(Math.max(360,Math.min(1000,estimateTextWidth(visual.question)+40)))}; padding: 8; fill: none; stroke: none; stroke-width: 0; font-size: 16; font-weight: 400; color: --gray-ink; }`);
    }
    if(pipelineContext&&visual.takeaway){
     const nativeId='pipeline-takeaway-footer';add(path('/takeaway'),path('/takeaway'),nativeId,'annotation');
     footerChildren.push(`|box#${nativeId}| ${quoteChecked(visual.takeaway,path('/takeaway'))} { width: ${Math.ceil(Math.max(360,Math.min(1000,estimateTextWidth(visual.takeaway)+40)))}; padding: 8; fill: none; stroke: none; stroke-width: 0; font-size: 16; font-weight: 600; color: --blue-deep; }`);
    }
    const annotations=visual.annotations??[];
    for(let i=0;i<annotations.length;i++){
     const annotation=annotations[i]!,id=safeId('a',i),width=Math.max(180,Math.min(440,annotation.text.length*8.5+24));
     add(annotation.id,path('/annotations/'+i+'/id'),id,'annotation');
     footerChildren.push(`|box#${id}| ${quoteChecked(annotation.text,path('/annotations/'+i+'/text'))} { width: ${Math.ceil(width)}; padding: 0; fill: none; stroke: none; stroke-width: 0; font-size: 16; font-weight: 400; color: --gray-ink; }`);
     approx(path('/annotations/'+i+'/text'),'Unanchored annotation placement','Lini places this exact text in a borderless native text carrier inside a renderer-owned trailing column. The source has no anchor or coordinates.');
    }
    const footerLayout:VisualLayout={kind:'flow',direction:'TB'};
    annotationFooter=groupDeclaration('annotation-footer','',[
     ...layoutProperties(footerLayout,'flow',1,'TB'),'gap: 8;','padding: 0;','fill: none;','stroke: none;','stroke-width: 0;'
    ],footerChildren);
   }
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
   const entityDirection=rootLayout?.kind==='grid'&&rootLayout.columns===1?'TB':rootLayout&&'direction'in rootLayout?rootLayout.direction??direction:direction;
   const relationshipCaptionTranslate=entityDirection==='TB'?'24 0':'0 -24';
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
    const caption=label?` [ ${quoteChecked(label,path('/structure/references/'+i+'/label'))} { translate: ${relationshipCaptionTranslate}; } ]`:'';
    children.push(`${from} ${operator} ${to} .${className} { along: 0.5; }${caption}`);
    if(a.approximate||b.approximate)approx(path('/structure/references/'+i),'Exact endpoint multiplicities',`Lini uses unmarked endpoint(s) for nonstandard exact ranges and prints their exact text in the relationship label${a.approximate&&b.approximate?'':'; conventional endpoints use native crow’s-foot markers'}.`);
    if(reference.identification)approx(path('/structure/references/'+i+'/identification'),'Relationship identification '+reference.identification,'Lini has no intrinsic identifying/non-identifying connector semantics; the distinction is written in the visible relationship label'+(reference.identification==='non-identifying'?' and a dashed line style.':'.'));
   }
   if(groups.length)omit(path('/groups'),'The entity view is driven by structure.entities/references; unrelated visual groups are not drawn.');
   if(edges.length)omit(path('/edges'),'The entity view uses structure.references; unrelated flow edges are not drawn.');
   if(structure.layers)omit(path('/structure/layers'),'Layer placement is outside the entity relationship view.');
  }
  const stylesheet=styleRules.length?`{\n${styleRules.map(line=>'  '+line).join('\n')}\n}\n`:'';
  const source=stylesheet+(annotationFooter?groupDeclaration('visual',title,[
   ...layoutProperties({kind:'flow',direction:'TB'},'flow',1,'TB'),'gap: 24;','padding: 36;','fill: none;','stroke: none;','stroke-width: 0;'
  ],[
   groupDeclaration('diagram-content','',rootProperties,children),annotationFooter
  ]):groupDeclaration('visual',title,rootProperties,children));
  if(source.length>250_000)return failure('PRESENTATION_SIZE',BASE,'Generated Lini source exceeds the 250,000 UTF-16 code-unit presentation limit.');
  return{ok:true,profileId:'umf.visual.presentation/1',backend:'lini',nativeFormat:'lini',source:source+'\n',elementMap:map,omissions,approximations};
 }catch(reason){const sourcePath=reason&&typeof reason==='object'&&'sourcePath'in reason?String((reason as {sourcePath:unknown}).sourcePath):BASE;return failure('PRESENTATION_LINI_TEXT',sourcePath,reason instanceof Error?reason.message:'Lini cannot encode a text value.');}
}
