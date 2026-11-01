// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson,type Document} from '@umf/core';
import {getVisual,inspectVisual} from '../../extensions/visual';
import type {InterchangeFormat} from '../types';
import {compileFullRecords,fullRecordId} from './records';
import type {FullScene} from './types';
import {appendAdditionalScene} from './additional-scenes';

const ROOT='/extensions/umf.visual';
const id=(path:string)=>'v_'+fullRecordId(path).slice(2);
/** Complete, explicitly qualified primitive fallback projections. */
export function compileFullScene(input:unknown,format:InterchangeFormat):FullScene {
 const document=copyJson(input) as unknown as Document,inspection=inspectVisual(document);
 if(!inspection.valid)throw new TypeError('Full projection requires a valid visual document');
 const visual=getVisual(document),records=compileFullRecords(document),paths=new Set(records.map(record=>record.path));
 const record=(path:string)=>paths.has(path)?fullRecordId(path):undefined;
 const scene:FullScene={format,profile:'umf.visual.'+format+'.full/1',version:'1',kind:visual.kind,form:visual.form,records,nodes:[],edges:[],groups:[],approximations:[]};
 const note=(path:string,text?:string,group?:string)=>{
  // These are generated caption/property carriers, not authored note shapes.
  const native=id(path);scene.nodes.push({id:native,shape:format==='dot'?'note':'box',...(record(path)?{recordId:record(path)}:{text:text??path}),...(group?{group}:{})});return native;
 };
 note(ROOT+'/title',visual.id);note(ROOT+'/question');
 if(visual.kind==='flow'||visual.kind==='structure'&&visual.form==='entities'){
  const nativeNodes=new Map<string,string>(),nativeGroups=new Map<string,string>();
  for(const [i,group]of (visual.groups??[]).entries())nativeGroups.set(group.id,id(ROOT+'/groups/'+i));
  for(const[i,group]of(visual.groups??[]).entries())scene.groups.push({id:nativeGroups.get(group.id)!,recordId:record(ROOT+'/groups/'+i+'/label'),...(group.parent?{parent:nativeGroups.get(group.parent)}:{})});
  for(const[i,node]of(visual.nodes??[]).entries()){
   const path=ROOT+'/nodes/'+i,native=id(path);nativeNodes.set(node.id,native);
   const shape=node.role==='actor'?'ellipse':node.role==='document'?'note':'box';
   scene.nodes.push({id:native,recordId:record(path+'/label'),identityRecordId:record(path+'/id'),shape:format==='lini'?'box':shape,...(node.group?{group:nativeGroups.get(node.group)}:{})});
   if(format==='lini'&&shape!=='box')scene.approximations.push({path:path+'/role',requested:shape,renderedAs:'box',reason:'The current Lini block projection uses a labelled rectangle; the original role remains visible in the additional properties.'});
  }
  for(const[i,edge]of(visual.edges??[]).entries()){
   const path=ROOT+'/edges/'+i;scene.edges.push({id:id(path),from:nativeNodes.get(edge.from)!,to:nativeNodes.get(edge.to)!,recordId:record(path+'/label'),fromRecordId:record(path+'/from'),toRecordId:record(path+'/to')});
  }
  if(visual.form==='entities'){
   for(const[i,entity]of(visual.structure?.entities??[]).entries()){
    const owner=nativeNodes.get(entity.node)!;
    for(const[j,field]of entity.fields.entries()){
     const path=ROOT+'/structure/entities/'+i+'/fields/'+j,fieldId=note(path+'/name');
     scene.edges.push({id:id(path+'/owner'),from:owner,to:fieldId,text:'field'});
     if(field.type!==undefined){const typeId=note(path+'/type');scene.edges.push({id:id(path+'/type-edge'),from:fieldId,to:typeId,text:'type'});}
    }
   }
   for(const[i,reference]of(visual.structure?.references??[]).entries()){
    const path=ROOT+'/structure/references/'+i;scene.edges.push({id:id(path),from:nativeNodes.get(reference.from.node)!,to:nativeNodes.get(reference.to.node)!,directed:false,recordId:record(path+'/label'),fromRecordId:record(path+'/from/node'),toRecordId:record(path+'/to/node')});
   }
   scene.approximations.push({path:ROOT+'/structure/entities',requested:'Entity field tables',renderedAs:'Entity boxes with attached field and type rows',reason:'The common primitive scene uses explicit field connections; types and relationship cardinalities remain visible and editable.'});
  }
  if(format==='lini'&&(visual.form==='lanes'||visual.form==='zoned'))scene.approximations.push({path:ROOT+'/form',requested:visual.form+' flow layout',renderedAs:'Labelled grid groups with native flow connections',reason:'Group membership and connections are preserved; this Lini 1.1 composition does not guarantee lane-band placement, and dense straight routes can cross caption text. Use another qualified target when those crossings impede reading.'});
 }else if(visual.kind==='metric'&&(visual.form==='bar'||visual.form==='stat'||visual.form==='meter')){
  const metric=visual.metric!,max=Math.max(1,...metric.series.flatMap(series=>series.points.map(point=>Math.abs(point.value))),Math.abs(metric.target??0));
  const unit=note(ROOT+'/metric/unit');
  const categoryNodes=new Map<string,string>();
  if(metric.axis?.kind==='category')for(const [i,category]of metric.axis.categories.entries()){
   const path=ROOT+'/metric/axis/categories/'+i,native=id(path);
   scene.nodes.push({id:native,recordId:record(path+'/label'),identityRecordId:record(path+'/id'),shape:'box'});
   categoryNodes.set(category.id,native);
  }
  for(const[i,series]of metric.series.entries()){
   const path=ROOT+'/metric/series/'+i,group=id(path);scene.groups.push({id:group,recordId:record(path+'/label')});
   for(const[j,point]of series.points.entries()){
    const pointPath=path+'/points/'+j,valueId=id(pointPath+'/value');
    scene.nodes.push({id:valueId,recordId:record(pointPath+'/value'),shape:'box',group,width:36+360*Math.abs(point.value)/max});
    if(point.at!==undefined){
     const category=categoryNodes.get(point.at);
     const at=category??note(pointPath+'/at',undefined,group);
     scene.edges.push({id:id(pointPath+'/at-edge'),from:at,to:valueId,...(category?{fromRecordId:record(pointPath+'/at')}:{}),text:category?'Sample category':'value'});
    }
   }
  }
  if(metric.target!==undefined){const target=note(ROOT+'/metric/target');scene.edges.push({id:id(ROOT+'/metric/target-edge'),from:target,to:unit,text:'target'});}
  scene.approximations.push({path:ROOT+'/metric',requested:visual.form+' chart',renderedAs:'Value-labelled magnitude indicators with series, unit and target',reason:'Minimum-width extents and any quantized magnitude glyphs expose exact numeric values; geometry approximates magnitude and is not a calibrated native chart axis.'});
 }else if(!appendAdditionalScene(scene,visual))throw new TypeError('Full profile has no reviewed projection for '+visual.kind+'/'+visual.form);
 return scene;
}
