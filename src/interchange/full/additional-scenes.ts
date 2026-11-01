// SPDX-License-Identifier: MIT OR Apache-2.0
/** Common visible-primitive projections for the second full-scene slice.
 * These are explicit diagram approximations, not qualified native equivalents. */
import {visualDateValue,type Visual} from '../../extensions/visual';
import {fullRecordId} from './records';
import type {FullEdge,FullGroup,FullNode,FullScene,VisualApproximation} from './types';

const ROOT='/extensions/umf.visual';
const nativeId=(path:string)=>'v_'+fullRecordId(path).slice(2);
const hasOwn=(value:object,key:string)=>Object.hasOwn(value,key);

/** Append a truthful, readable common-primitive fallback for forms outside the
 * first flow/entity/bar/stat/meter slice. Existing families return false. */
export function appendAdditionalScene(scene:FullScene,visual:Visual):boolean {
 const form=visual.form,kind=visual.kind;
 if(kind==='flow'||kind==='structure'&&form==='entities'||kind==='metric'&&['bar','stat','meter'].includes(form))return false;
 const recordPaths=new Set(scene.records.map(row=>row.path));
 const record=(path:string):string|undefined=>recordPaths.has(path)?fullRecordId(path):undefined;
 const requiredRecord=(path:string):string=>{const value=record(path);if(!value)throw new TypeError(`Missing source record for native projection: ${path}`);return value;};
 // Internal captions/field carriers choose an available primitive directly.
 // Model-significant document roles are handled separately in scene.ts.
 const primitiveShape=(shape:FullNode['shape']):FullNode['shape']=>scene.format==='lini'||scene.format==='mermaid'&&shape==='note'?'box':shape;
 const addNode=(path:string,labelPath:string,options:{identityPath?:string;shape?:FullNode['shape'];group?:string;text?:string;width?:number}={}):string=>{
  const id=nativeId(path),recordId=requiredRecord(labelPath),identityRecordId=options.identityPath?requiredRecord(options.identityPath):undefined;
  if(scene.nodes.some(node=>node.id===id))throw new TypeError(`Duplicate additional native node: ${path}`);
  scene.nodes.push({id,recordId,...(identityRecordId?{identityRecordId}:{}),shape:primitiveShape(options.shape??'box'),...(options.group?{group:options.group}:{}),...(options.text===undefined?{}:{text:options.text}),...(options.width===undefined?{}:{width:options.width})});
  return id;
 };
 const addNodeText=(path:string,text:string,options:{shape?:FullNode['shape'];group?:string;width?:number}={}):string=>{
  const id=nativeId(path);if(scene.nodes.some(node=>node.id===id))throw new TypeError(`Duplicate additional native node: ${path}`);
  scene.nodes.push({id,text,shape:primitiveShape(options.shape??'note'),...(options.group?{group:options.group}:{}),...(options.width===undefined?{}:{width:options.width})});return id;
 };
 const addGroup=(path:string,labelPath?:string,parent?:string,text?:string):string=>{
  const id=nativeId(path);if(scene.groups.some(group=>group.id===id))throw new TypeError(`Duplicate additional native group: ${path}`);
  const group:FullGroup={id,...(labelPath?{recordId:requiredRecord(labelPath)}:{}),...(parent?{parent}:{}),...(text===undefined?{}:{text})};scene.groups.push(group);return id;
 };
 const addEdge=(path:string,from:string,to:string,options:{labelPath?:string;fromPath?:string;toPath?:string;text?:string;directed?:boolean}={}):void=>{
  const id=nativeId(path);if(scene.edges.some(edge=>edge.id===id))throw new TypeError(`Duplicate additional native edge: ${path}`);
  const edge:FullEdge={id,from,to,...(options.labelPath?{recordId:requiredRecord(options.labelPath)}:{}),...(options.fromPath?{fromRecordId:requiredRecord(options.fromPath)}:{}),...(options.toPath?{toRecordId:requiredRecord(options.toPath)}:{}),...(options.text===undefined?{}:{text:options.text}),...(options.directed===undefined?{}:{directed:options.directed})};scene.edges.push(edge);
 };
 const approximation=(path:string,requested:string,renderedAs:string,reason:string):void=>{const entry:VisualApproximation={path,requested,renderedAs,reason};scene.approximations.push(entry);};
 const baseNode=(i:number,group?:string,shape:FullNode['shape']='box'):string=>addNode(`${ROOT}/nodes/${i}`,`${ROOT}/nodes/${i}/label`,{identityPath:`${ROOT}/nodes/${i}/id`,group,shape});
 const addSourceGroups=(groups:any[],basePath:string):Map<string,string>=>{
  const map=new Map<string,string>();for(let i=0;i<groups.length;i++)map.set(groups[i].id,nativeId(`${basePath}/${i}`));
  for(let i=0;i<groups.length;i++)addGroup(`${basePath}/${i}`,`${basePath}/${i}/label`,groups[i].parent?map.get(groups[i].parent):undefined);
  return map;
 };

 if(kind==='structure'&&['stack','tree','nested'].includes(form)){
  const v=visual as any,nodes=v.nodes??[],sourceGroups=v.groups??[],groups=addSourceGroups(sourceGroups,`${ROOT}/groups`),layers=v.structure?.layers??[],layerGroups=new Map<string,string>();
  for(let i=0;i<layers.length;i++){
   const group=addGroup(`${ROOT}/structure/layers/${i}`,`${ROOT}/structure/layers/${i}/label`);layerGroups.set(layers[i].id,group);
   addNodeText(`${ROOT}/structure/layers/${i}/ordinal`,`Layer ${i+1} of ${layers.length}`,{group});
  }
  const nodesById=new Map<string,string>();
  nodes.forEach((node:any,i:number)=>nodesById.set(node.id,baseNode(i,form==='stack'?(layerGroups.get(node.layer)??(node.group?groups.get(node.group):undefined)):(node.group?groups.get(node.group):undefined))));
  nodes.forEach((node:any,i:number)=>{if(!node.parent)return;const parentIndex=nodes.findIndex((candidate:any)=>candidate.id===node.parent),from=nodesById.get(node.parent),to=nodesById.get(node.id);if(parentIndex<0||!from||!to)throw new TypeError('Structure parent is not present in the native scene.');addEdge(`${ROOT}/nodes/${i}/parent-edge`,from,to,{fromPath:`${ROOT}/nodes/${i}/parent`,text:'Contains',directed:true});});
  if(form==='stack')approximation(`${ROOT}/structure/layers`,'Layered stack with bounded ordered bands','Layer-labelled containment clusters with ordinal headers','Layer membership and order are explicit in the numbered headers; the common primitive scene does not define a calibrated band geometry.');
  if(form==='nested')approximation(`${ROOT}/nodes`,'Nested containment boxes','Directed parent-to-child containment links','The common primitive scene preserves every parent relation as a labelled native connection, but does not draw nested node boxes.');
  return true;
 }

 if(kind==='sequence'&&['lifelines','ladder'].includes(form)){
  const sequence=(visual as any).sequence,participants=sequence?.participants??[],messages=sequence?.messages??[],nodes=new Map<string,string>(),sourceGroups=(visual as any).groups??[],groupNodes=new Map<string,string>();
  for(let i=0;i<sourceGroups.length;i++)groupNodes.set(sourceGroups[i].id,nativeId(`${ROOT}/groups/${i}`));
  for(let i=0;i<sourceGroups.length;i++){
   const source=sourceGroups[i],groupPath=`${ROOT}/groups/${i}`,groupId=addGroup(groupPath,`${groupPath}/label`,source.parent?groupNodes.get(source.parent):undefined);
   if(source.role!==undefined){const value=addNode(`${groupPath}/role`,`${groupPath}/role`,{group:groupId,shape:'note'}),tag=addNodeText(`${groupPath}/role-tag`,'Role',{group:groupId,shape:'diamond'});addEdge(`${groupPath}/role-label`,tag,value,{text:'Role'});}
   if(source.detail!==undefined){const value=addNode(`${groupPath}/detail`,`${groupPath}/detail`,{group:groupId,shape:'note'}),tag=addNodeText(`${groupPath}/detail-tag`,'Detail',{group:groupId,shape:'diamond'});addEdge(`${groupPath}/detail-label`,tag,value,{text:'Detail'});}
  }
  participants.forEach((participant:any,i:number)=>nodes.set(participant.id,addNode(`${ROOT}/sequence/participants/${i}`,`${ROOT}/sequence/participants/${i}/label`,{identityPath:`${ROOT}/sequence/participants/${i}/id`,shape:'box'})));
  for(let i=0;i<messages.length;i++){const message=messages[i],from=nodes.get(message.from),to=nodes.get(message.to),messagePath=`${ROOT}/sequence/messages/${i}`,group=message.group?groupNodes.get(message.group):undefined;if(message.group&&!group)throw new TypeError(`Sequence message refers to missing group: ${message.group}`);if(!from||!to)throw new TypeError('Sequence message endpoint is missing.');const label=addNode(`${messagePath}/label`,`${messagePath}/label`,{shape:'note',group}),step=addNodeText(`${messagePath}/step`,`Step ${String(i+1).padStart(2,'0')}${message.kind?` · ${message.kind}`:''}`,{shape:'diamond',group});addEdge(`${messagePath}/from`,from,label,{fromPath:`${messagePath}/from`,directed:true});addEdge(`${messagePath}/to`,label,to,{toPath:`${messagePath}/to`,directed:true});addEdge(`${messagePath}/order`,step,label,{text:'Order'});}
  approximation(`${ROOT}/sequence`,'Ordered participant ladder or lifelines with native message arrows','Participants, message-label nodes, and directed endpoint connections with numbered steps','Step numbers follow source order. The common scene does not provide lifeline rails, ladder rows, or call/return line styling.');
  return true;
 }

 if(kind==='state'&&['machine','lifecycle'].includes(form)){
  const v=visual as any,nodes=v.nodes??[],state=v.state,nodeIds=new Map<string,string>();
  nodes.forEach((node:any,i:number)=>nodeIds.set(node.id,addNode(`${ROOT}/nodes/${i}`,`${ROOT}/nodes/${i}/label`,{identityPath:`${ROOT}/nodes/${i}/id`,shape:'ellipse'})));
  const initial=nodeIds.get(state.initial);if(!initial)throw new TypeError('State initial marker refers to a missing state.');const initialMark=addNode(`${ROOT}/state/initial`,`${ROOT}/state/initial`,{shape:'diamond'});addEdge(`${ROOT}/state/initial-edge`,initialMark,initial,{text:'Initial'});
  for(let i=0;i<(state.final??[]).length;i++){const finalId=state.final[i],target=nodeIds.get(finalId);if(!target)throw new TypeError('State final marker refers to a missing state.');const mark=addNode(`${ROOT}/state/final/${i}`,`${ROOT}/state/final/${i}`,{shape:'diamond'});addEdge(`${ROOT}/state/final/${i}/edge`,target,mark,{text:'Final'});}
  for(let i=0;i<state.transitions.length;i++){
   const transition=state.transitions[i],from=nodeIds.get(transition.from),to=nodeIds.get(transition.to),transitionPath=`${ROOT}/state/transitions/${i}`;if(!from||!to)throw new TypeError('State transition endpoint is missing.');
   const conditions:string[]=[];
   if(transition.guard!==undefined){const guard=addNode(`${transitionPath}/guard`,`${transitionPath}/guard`,{shape:'box'}),tag=addNodeText(`${transitionPath}/guard-tag`,'Guard',{shape:'diamond'});conditions.push(guard);addEdge(`${transitionPath}/guard-tag-edge`,tag,guard,{text:'Condition'});}
   if(transition.action!==undefined){const action=addNode(`${transitionPath}/action`,`${transitionPath}/action`,{shape:'box'}),tag=addNodeText(`${transitionPath}/action-tag`,'Action',{shape:'diamond'});conditions.push(action);addEdge(`${transitionPath}/action-tag-edge`,tag,action,{text:'Effect'});}
   const event=addNode(`${transitionPath}/event`,`${transitionPath}/event`,{shape:'note'}),chain=[from,event,...conditions,to];
   for(let j=0;j<chain.length-1;j++)addEdge(`${transitionPath}/chain/${j}`,chain[j]!,chain[j+1]!,{...(j===0?{fromPath:`${transitionPath}/from`}:{}),...(j===chain.length-2?{toPath:`${transitionPath}/to`}:{}),directed:true});
  }
  approximation(`${ROOT}/state`,'State-machine transitions and initial/final markers','Labelled state and transition chains with explicit guard/action nodes','Events, conditions, effects and initial/final membership remain explicit; this composition uses graph primitives rather than renderer-specific state notation.');
  return true;
 }

 if(kind==='timeline'&&['milestones','roadmap','history'].includes(form)){
  const timeline=(visual as any).timeline,laneGroups=new Map<string,string>(),lanes=timeline.lanes??[];
  lanes.forEach((lane:any,i:number)=>laneGroups.set(lane.id,addGroup(`${ROOT}/timeline/lanes/${i}`,`${ROOT}/timeline/lanes/${i}/label`)));
  const periodNodes=new Map<string,string>();for(let i=0;i<(timeline.scale.periods??[]).length;i++){const period=timeline.scale.periods[i];periodNodes.set(period.id,addNode(`${ROOT}/timeline/scale/periods/${i}`,`${ROOT}/timeline/scale/periods/${i}/label`,{identityPath:`${ROOT}/timeline/scale/periods/${i}/id`,shape:'diamond'}));}
  for(let i=0;i<(timeline.scale.periods??[]).length-1;i++){const from=periodNodes.get(timeline.scale.periods[i]!.id),to=periodNodes.get(timeline.scale.periods[i+1]!.id);if(!from||!to)throw new TypeError('Timeline period order refers to a missing period.');addEdge(`${ROOT}/timeline/scale/period-order/${i}`,from,to,{text:'Period order',directed:true});}
  const orderedDates:{value:string;node:string;sourceIndex:number}[]=[];
  const events=timeline.events??[];for(let i=0;i<events.length;i++){
   const event=events[i],group=event.lane?laneGroups.get(event.lane):undefined,labelNode=addNode(`${ROOT}/timeline/events/${i}`,`${ROOT}/timeline/events/${i}/label`,{identityPath:`${ROOT}/timeline/events/${i}/id`,group});
   const timeNode=addNode(`${ROOT}/timeline/events/${i}/at`,`${ROOT}/timeline/events/${i}/at`,{shape:'diamond',group});
   addEdge(`${ROOT}/timeline/events/${i}/occurs-at`,timeNode,labelNode,{text:'Event'});
   const period=periodNodes.get(event.at);if(period)addEdge(`${ROOT}/timeline/events/${i}/period-link`,timeNode,period,{text:'Period',directed:false});
   if(typeof event.at==='string')orderedDates.push({value:event.at,node:timeNode,sourceIndex:i});
  }
  const markers=timeline.markers??[];for(let i=0;i<markers.length;i++){
   const marker=markers[i],labelNode=addNode(`${ROOT}/timeline/markers/${i}`,`${ROOT}/timeline/markers/${i}/label`),timeNode=addNode(`${ROOT}/timeline/markers/${i}/at`,`${ROOT}/timeline/markers/${i}/at`,{shape:'diamond'});
   addEdge(`${ROOT}/timeline/markers/${i}/at-edge`,timeNode,labelNode,{text:marker.kind});
   const period=periodNodes.get(marker.at);if(period)addEdge(`${ROOT}/timeline/markers/${i}/period-link`,timeNode,period,{text:'Period',directed:false});
   if(typeof marker.at==='string')orderedDates.push({value:marker.at,node:timeNode,sourceIndex:events.length+i});
  }
  const periodOrder=new Map<string,number>((timeline.scale.periods??[]).map((period:any,index:number)=>[period.id,index] as [string,number]));
  const orderOf=(value:string):number=>timeline.scale.kind==='period'?periodOrder.get(value)??Number.POSITIVE_INFINITY:visualDateValue(value)??Number.POSITIVE_INFINITY;
  orderedDates.sort((a,b)=>orderOf(a.value)-orderOf(b.value)||a.sourceIndex-b.sourceIndex);
  for(let i=0;i<orderedDates.length-1;i++)addEdge(`${ROOT}/timeline/date-order/${i}`,orderedDates[i]!.node,orderedDates[i+1]!.node,{text:'Chronological order',directed:true});
  const spans=timeline.spans??[];for(let i=0;i<spans.length;i++){
   const span=spans[i],group=span.lane?laneGroups.get(span.lane):undefined,startPath=`${ROOT}/timeline/spans/${i}/start`,endPath=`${ROOT}/timeline/spans/${i}/end`,start=addNode(startPath,startPath,{shape:'diamond',group}),end=addNode(endPath,endPath,{shape:'diamond',group});
   addEdge(`${ROOT}/timeline/spans/${i}`,start,end,{labelPath:`${ROOT}/timeline/spans/${i}/label`,directed:false});
   const periodStart=periodNodes.get(span.start),periodEnd=periodNodes.get(span.end);if(periodStart)addEdge(`${ROOT}/timeline/spans/${i}/start-period`,start,periodStart,{text:'Start period',directed:false});if(periodEnd)addEdge(`${ROOT}/timeline/spans/${i}/end-period`,end,periodEnd,{text:'End period',directed:false});
  }
  if(timeline.scale.kind==='period')approximation(`${ROOT}/timeline/scale`,'Ordered timeline periods','Period labels linked by spans and events','The common scene shows the authored period ordering and endpoints without calibrated horizontal time spacing.');
  else approximation(`${ROOT}/timeline/scale`,'Date-scaled timeline','Date-labelled events and span endpoints with chronological links','Date order is exact and visible, but graph layout does not encode elapsed duration or calibrated time distance.');
  return true;
 }

 if(kind==='comparison'&&['matrix','before-after','quadrant'].includes(form)){
  const comparison=(visual as any).comparison,criteria=comparison.criteria??[],items=comparison.items??[],values=comparison.values??[];
  if(form==='quadrant'){
   const axes=comparison.axes;if(!axes)throw new TypeError('Quadrant projection requires authored axes.');const xIndex=criteria.findIndex((item:any)=>item.id===axes.x),yIndex=criteria.findIndex((item:any)=>item.id===axes.y);if(xIndex<0||yIndex<0)throw new TypeError('Quadrant axes must reference declared criteria.');
   const xCriterion=criteria[xIndex],yCriterion=criteria[yIndex],xPath=`${ROOT}/comparison/criteria/${xIndex}`,yPath=`${ROOT}/comparison/criteria/${yIndex}`;
   addNode(`${ROOT}/comparison/axes/x`,xPath+'/label',{shape:'box'});addNode(`${ROOT}/comparison/axes/y`,yPath+'/label',{shape:'box'});
   const regionGroups=new Map<string,string>();for(const xHigh of [false,true])for(const yHigh of [false,true]){const key=`${Number(xHigh)}${Number(yHigh)}`,name=`${xHigh?'High':'Low'} ${xCriterion.label} · ${yHigh?'High':'Low'} ${yCriterion.label}`;regionGroups.set(key,addGroup(`${ROOT}/comparison/regions/${key}`,undefined,undefined,name));}
   for(let i=0;i<items.length;i++){
    const item=items[i],xValue=values.find((entry:any)=>entry.item===item.id&&entry.criterion===axes.x),yValue=values.find((entry:any)=>entry.item===item.id&&entry.criterion===axes.y);
    if(!xValue||!yValue||typeof xValue.rating!=='number'||typeof yValue.rating!=='number')throw new TypeError('Quadrant projection requires numeric values on both axes.');
    const xMax=xCriterion.max??1,yMax=yCriterion.max??1,xHigh=xValue.rating>=xMax/2,yHigh=yValue.rating>=yMax/2,group=regionGroups.get(`${Number(xHigh)}${Number(yHigh)}`)!;
    const itemNode=addNode(`${ROOT}/comparison/items/${i}`,`${ROOT}/comparison/items/${i}/label`,{identityPath:`${ROOT}/comparison/items/${i}/id`,group});
    const valueEntries=[[xValue,values.indexOf(xValue),axes.x],[yValue,values.indexOf(yValue),axes.y]] as const;
    for(const[value,valueIndex,axis]of valueEntries){const field=hasOwn(value,'rating')?'rating':hasOwn(value,'text')?'text':'support',ratingNode=addNode(`${ROOT}/comparison/values/${valueIndex}/${field}`,`${ROOT}/comparison/values/${valueIndex}/${field}`,{shape:'box',group});addEdge(`${ROOT}/comparison/values/${valueIndex}/axis-link`,itemNode,ratingNode,{text:axis,directed:false});}
   }
   approximation(`${ROOT}/comparison/axes`,'Four labelled rating quadrants','Items grouped by midpoint of the authored x/y rating maxima','Quadrant membership uses the declared rating maxima midpoint as a cutoff; coordinates are not to scale.');
   return true;
  }
  const criterionNodes=new Map<string,string>();for(let i=0;i<criteria.length;i++)criterionNodes.set(criteria[i].id,addNode(`${ROOT}/comparison/criteria/${i}`,`${ROOT}/comparison/criteria/${i}/label`,{identityPath:`${ROOT}/comparison/criteria/${i}/id`}));
  const itemGroups=new Map<string,string>();for(let i=0;i<items.length;i++)itemGroups.set(items[i].id,addGroup(`${ROOT}/comparison/items/${i}`,`${ROOT}/comparison/items/${i}/label`));
  for(let i=0;i<values.length;i++){
   const value=values[i],criterion=criterionNodes.get(value.criterion),group=itemGroups.get(value.item);if(!criterion||!group)throw new TypeError('Comparison value references a missing item or criterion.');
   const field=hasOwn(value,'text')?'text':hasOwn(value,'rating')?'rating':'support',cell=addNode(`${ROOT}/comparison/values/${i}/${field}`,`${ROOT}/comparison/values/${i}/${field}`,{shape:'box',group});addEdge(`${ROOT}/comparison/values/${i}/criterion`,criterion,cell,{text:'Cell',directed:false});
  }
  approximation(`${ROOT}/comparison`,'Item-by-criterion comparison table','Item clusters containing exact value cells linked to criterion headers','The common scene exposes the matrix records but does not guarantee column alignment or spreadsheet-style cell geometry.');
  return true;
 }

 if(kind==='metric'&&form==='line'){
  const metric=(visual as any).metric,seriesList=metric.series??[],max=Math.max(1,...seriesList.flatMap((series:any)=>series.points.map((point:any)=>Math.abs(point.value)))),categoryList=metric.axis?.kind==='category'?metric.axis.categories:[],categoryNodes=new Map<string,string>();
  for(let j=0;j<categoryList.length;j++){const category=categoryList[j],categoryPath=`${ROOT}/metric/axis/categories/${j}`;categoryNodes.set(category.id,addNode(categoryPath,`${categoryPath}/label`,{shape:'diamond'}));}
  for(let i=0;i<seriesList.length;i++){
   const series=seriesList[i],seriesPath=`${ROOT}/metric/series/${i}`,group=addGroup(seriesPath,`${seriesPath}/label`),points:string[]=[];
   for(let j=0;j<series.points.length;j++){
    const point=series.points[j],pointPath=`${seriesPath}/points/${j}`,valueNode=addNode(`${pointPath}/value`,`${pointPath}/value`,{group,shape:'ellipse',width:36+360*Math.abs(point.value)/max});points.push(valueNode);
    if(metric.axis?.kind==='category'&&typeof point.at==='string'){
     const categoryNode=categoryNodes.get(point.at);if(!categoryNode)throw new TypeError(`Metric point refers to missing category: ${point.at}`);addEdge(`${pointPath}/category-association`,categoryNode,valueNode,{text:'Sample category',directed:false});
    }else if(typeof point.at==='string'){
     const atNode=addNode(`${pointPath}/at`,`${pointPath}/at`,{group,shape:'diamond'});addEdge(`${pointPath}/at-association`,atNode,valueNode,{text:'Sample date',directed:false});
    }
    if(j>0)addEdge(`${pointPath}/sequence`,points[j-1]!,valueNode,{text:`Point ${j+1}`,directed:true});
   }
  }
  if(metric.target!==undefined)addNode(`${ROOT}/metric/target`,`${ROOT}/metric/target`,{shape:'diamond'});
  if(metric.baseline!==undefined)addNode(`${ROOT}/metric/baseline`,`${ROOT}/metric/baseline`,{shape:'diamond'});
  approximation(`${ROOT}/metric`,'Time/category line chart','Connected ordered points labelled with exact values and dates/categories; point widths and optional quantized glyphs indicate magnitude','The common scene links point order and retains exact values; point positions do not encode calibrated x/y coordinates or elapsed distance.');
  return true;
 }
 return false;
}
