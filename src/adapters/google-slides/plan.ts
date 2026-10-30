// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json} from '@umf/core';
import {getVisual,inspectVisual,type Visual} from '../../extensions/visual/index.js';
import {GOOGLE_SLIDES_PROFILE,type GoogleSlidesBox,type GoogleSlidesExportOptions,type GoogleSlidesExportPlan,type GoogleSlidesLoss,type GoogleSlidesMapping,type GoogleSlidesMappingKind,type GoogleSlidesModelVersion,type GoogleSlidesMode,type GoogleSlidesObservation,type GoogleSlidesPlacement} from './types.js';
import {GOOGLE_SLIDES_LIMITS,GoogleSlidesError,canonical,checkSlidesText,copyOwned,isRecord,json,pointerJoin,requireSlides,sha256} from './json.js';
import {pageDimensionsInPoints,validateGoogleSlidesObservation} from './observe.js';
import {hostDigest} from '../reconciliation/json.js';

const visualPath='/extensions/umf.visual';
const documentFields=['umf','id','vocabularies','extensions','modules'];
const visualFields=['id','kind','form','title','question','nodes','edges'];

function visualVersion(source:Document):GoogleSlidesModelVersion{
 const vocabularies=(source as unknown as Record<string,unknown>).vocabularies,vocab=isRecord(vocabularies)?vocabularies['umf.visual']:undefined;requireSlides(isRecord(vocab)&&typeof vocab.version==='string','MODEL','Visual model version must be explicit');
 requireSlides(vocab.version==='1.0.0'||vocab.version==='1.1.0','MODEL','Google Slides supports only explicit visual model 1.0.0 or 1.1.0');return vocab.version;
}
function addLoss(losses:GoogleSlidesLoss[],path:string,code:GoogleSlidesLoss['code']='RETAINED_ONLY',family:GoogleSlidesLoss['family']='semantic',message='Retained in the source companion; not represented in Google Slides semantics'):void{
 if(!losses.some(loss=>loss.path===path&&loss.code===code))losses.push({path,code,family,representation:code==='UNREPRESENTED'?'unrepresented':'retained-only',message});
}
export function googleSlidesSourceLosses(input:Document):GoogleSlidesLoss[]{
 const source=copyOwned(input),inspection=inspectVisual(source);requireSlides(inspection.valid,'VISUAL_INVALID','Cannot compute Slides losses for an invalid Visual document');
 const visual=getVisual(source);
 const losses:GoogleSlidesLoss[]=[],document=source as unknown as Record<string,unknown>,v=visual as unknown as Record<string,unknown>;
 for(const key of Object.keys(document))if(!documentFields.includes(key))addLoss(losses,pointerJoin('',key),'UNREPRESENTED','semantic','Unknown envelope content is preserved but has no Slides mapping');
 if(source.modules.length)addLoss(losses,'/modules','RETAINED_ONLY','semantic','UMF modules are preserved in the binding source but not represented on the slide');
 for(const key of Object.keys(source.extensions??{}))if(key!=='umf.visual')addLoss(losses,pointerJoin('/extensions',key),'UNREPRESENTED','semantic','Other extension content is preserved but not represented');
 for(const[key,value]of Object.entries(source.vocabularies))if(key!=='umf.visual'||!isRecord(value)||Object.keys(value).some(field=>field!=='version'))addLoss(losses,pointerJoin('/vocabularies',key),'UNREPRESENTED','semantic','Vocabulary metadata outside the selected model version is not represented');
 const model=source.vocabularies['umf.visual'];if(isRecord(model)&&Object.keys(model).some(field=>field!=='version'))addLoss(losses,'/vocabularies/umf.visual','UNREPRESENTED','semantic','Unknown visual vocabulary metadata is not represented');
 for(const key of Object.keys(v))if(!visualFields.includes(key))addLoss(losses,pointerJoin(visualPath,key),'RETAINED_ONLY','semantic','Visual metadata is preserved but not represented by this network profile');
 const nodes=visual.nodes??[];nodes.forEach((node,index)=>{const record=node as unknown as Record<string,unknown>;for(const key of Object.keys(record))if(!['id','label'].includes(key))addLoss(losses,pointerJoin(pointerJoin(visualPath+'/nodes',index),key));});
 (visual.edges??[]).forEach((edge,index)=>{const record=edge as unknown as Record<string,unknown>;for(const key of Object.keys(record))if(!['id','from','to','label'].includes(key))addLoss(losses,pointerJoin(pointerJoin(visualPath+'/edges',index),key));});
 return losses.sort((a,b)=>a.path.localeCompare(b.path)||a.code.localeCompare(b.code));
}
function validNamespace(value:string):boolean{return/^[a-zA-Z][a-zA-Z0-9_]{2,11}$/.test(value);}
function validateBox(box:unknown,id:string,page:{width:number;height:number}):GoogleSlidesBox{
 requireSlides(isRecord(box),'PLACEMENT','Placement box is required',undefined,id);
 const normalized={x:box.x,y:box.y,width:box.width,height:box.height};
 requireSlides(Object.values(normalized).every(value=>typeof value==='number'&&Number.isFinite(value)),'PLACEMENT','Placement values must be finite',undefined,id);
 const result=normalized as GoogleSlidesBox;
 requireSlides(result.x>=0&&result.y>=0&&result.width>0&&result.height>0&&result.x+result.width<=page.width&&result.y+result.height<=page.height,'PLACEMENT','Placement box must be positive and inside the native slide',undefined,id);
 return result;
}
function exactPlacementKeys(value:Record<string,GoogleSlidesBox>|undefined,expected:string[],at:string):void{
 const record=value??{};const actual=Object.keys(record).sort(),want=[...expected].sort();requireSlides(canonical(actual)===canonical(want),'PLACEMENT','Placement keys must exactly match mapped visual identities',undefined,at);
}
function dimensions(box:GoogleSlidesBox){return{width:{magnitude:box.width,unit:'PT'},height:{magnitude:box.height,unit:'PT'} as const};}
function shapeProperties(slideId:string,box:GoogleSlidesBox){return{pageObjectId:slideId,size:dimensions(box),transform:{scaleX:1,scaleY:1,shearX:0,shearY:0,translateX:box.x,translateY:box.y,unit:'PT'}};}
function textSubset(value:string,path:string):void{
 checkSlidesText(value,path);
 requireSlides(value.length<=10_000,'LIMIT','Single Slides text value exceeds 10,000 UTF-16 code units',undefined,path);
}
function mappingMarker(mapping:GoogleSlidesMapping,presentationId:string,modelVersion:GoogleSlidesModelVersion):string{
 return JSON.stringify({profile:GOOGLE_SLIDES_PROFILE,modelVersion,presentationId,scope:mapping.nativeScope,kind:mapping.kind,logicalId:mapping.logicalId,path:mapping.path});
}
function addAltText(requests:Json[],mapping:GoogleSlidesMapping,presentationId:string,modelVersion:GoogleSlidesModelVersion):void{
 requests.push(json({updatePageElementAltText:{objectId:mapping.nativeId,title:'UMF visual binding',description:mappingMarker(mapping,presentationId,modelVersion)}}));
}

export async function planGoogleSlidesExport(input:Document,before:GoogleSlidesObservation,placementInput:GoogleSlidesPlacement,options:GoogleSlidesExportOptions={}):Promise<GoogleSlidesExportPlan>{
 let source:Document;try{source=copyOwned(input);}catch(error){throw new GoogleSlidesError('INPUT',error instanceof Error?error.message:'UMF source must be JSON');}
 before=await validateGoogleSlidesObservation(before);
 const safeOptions=copyOwned(options);requireSlides(isRecord(safeOptions)&&Object.keys(safeOptions).every(key=>key==='mode'||key==='namespace'),'OPTIONS','Invalid export options');
 const rawOptions=safeOptions as Record<string,unknown>,modeValue=rawOptions.mode??'strict';requireSlides(modeValue==='strict'||modeValue==='report','MODE','Expected strict or report mode');const selectedMode:GoogleSlidesMode=modeValue;
 const namespaceValue=rawOptions.namespace??'umfslides';requireSlides(typeof namespaceValue==='string'&&validNamespace(namespaceValue),'NAMESPACE','Object ID namespace must be 3–12 ASCII letters/digits/underscores and start with a letter');const namespace=namespaceValue;
 const byteLength=new TextEncoder().encode(canonical(source)).byteLength;requireSlides(byteLength<=GOOGLE_SLIDES_LIMITS.maxCaptureBytes,'LIMIT','UMF source exceeds 16 MiB');
 const version=visualVersion(source),inspection=inspectVisual(source);requireSlides(inspection.valid,'VISUAL_INVALID','Visual source is invalid');
 const visual=getVisual(source);requireSlides(visual.kind==='flow'&&visual.form==='network','SUBSET','Only flow/network visuals are supported');
 const nodes=visual.nodes??[],edges=visual.edges??[],limit=version==='1.0.0'?GOOGLE_SLIDES_LIMITS.maxNodes10:GOOGLE_SLIDES_LIMITS.maxNodes11;
 requireSlides(nodes.length>=1&&nodes.length<=limit,'LIMIT','Node count exceeds the selected visual model profile');requireSlides(edges.length<=GOOGLE_SLIDES_LIMITS.maxEdges,'LIMIT','Edge count exceeds the 256-edge profile');
 requireSlides((visual.groups?.length??0)<=GOOGLE_SLIDES_LIMITS.maxGroups,'LIMIT','Group count exceeds the 32-group profile');
 const losses=googleSlidesSourceLosses(source);requireSlides(selectedMode==='report'||losses.length===0,'RENDER_LOSS','Strict export refuses retained-only or unrepresented source meaning',{source,losses});
 const page=pageDimensionsInPoints(before.snapshot),placement=copyOwned(placementInput);
 requireSlides(isRecord(placement),'PLACEMENT','Placement must be a JSON object');
 exactPlacementKeys(placement.nodes,nodes.map(node=>node.id),'/nodes');
 exactPlacementKeys(placement.edgeLabels,edges.filter(edge=>edge.label!==undefined).map(edge=>edge.id),'/edgeLabels');
 requireSlides((visual.title!==undefined)===(placement.title!==undefined),'PLACEMENT','A title box is required exactly when the visual has a title');
 const boxed:GoogleSlidesPlacement={question:validateBox(placement.question,'question',page),nodes:{},...(placement.title?{title:validateBox(placement.title,'title',page)}:{}),...(placement.edgeLabels?{edgeLabels:{}}:{})};
 if(visual.title!==undefined)textSubset(visual.title,visualPath+'/title');textSubset(visual.question,visualPath+'/question');
 if(placement.title)boxed.title=validateBox(placement.title,'title',page);
 for(const node of nodes){textSubset(node.label,pointerJoin(visualPath+'/nodes/'+nodes.indexOf(node),'label'));boxed.nodes[node.id]=validateBox(placement.nodes[node.id],node.id,page);}
 for(const edge of edges){if(edge.label!==undefined){textSubset(edge.label,pointerJoin(visualPath+'/edges/'+edges.indexOf(edge),'label'));boxed.edgeLabels![edge.id]=validateBox(placement.edgeLabels![edge.id],edge.id,page);}requireSlides(nodes.some(node=>node.id===edge.from)&&nodes.some(node=>node.id===edge.to),'VISUAL_INVALID','Every edge must attach to declared nodes');}
 const slideId=await objectId(namespace,'slide',visual.id),requests:Json[]=[];
 const existing=new Set<string>();for(const slide of before.snapshot.slides){existing.add(String(slide.objectId));for(const ref of allElementRefs(slide))existing.add(String(ref.objectId));}
 const mappings:GoogleSlidesMapping[]=[],scope='slide:'+slideId;
 const makeMapping=async(kind:GoogleSlidesMappingKind,logicalId:string,path:string)=>{const nativeId=await objectId(namespace,kindCode(kind),visual.id+'\0'+logicalId);requireSlides(!existing.has(nativeId)&&!mappings.some(mapping=>mapping.nativeId===nativeId),'IDENTITY','Generated object ID collides with existing presentation content');const mapping={logicalId,kind,path,nativeId,nativeScope:scope};mappings.push(mapping);return mapping;};
 const title=visual.title!==undefined?await makeMapping('title',visual.id,visualPath+'/title'):undefined;
 const question=await makeMapping('question',visual.id,visualPath+'/question');
 const nodeMappings=new Map<string,GoogleSlidesMapping>();for(const node of nodes)nodeMappings.set(node.id,await makeMapping('node',node.id,visualPath+'/nodes/'+nodes.indexOf(node)));
 const edgeMappings=new Map<string,GoogleSlidesMapping>();for(const edge of edges)edgeMappings.set(edge.id,await makeMapping('edge',edge.id,visualPath+'/edges/'+edges.indexOf(edge)));
 const edgeLabelMappings=new Map<string,GoogleSlidesMapping>();for(const edge of edges)if(edge.label!==undefined)edgeLabelMappings.set(edge.id,await makeMapping('edge-label',edge.id,visualPath+'/edges/'+edges.indexOf(edge)+'/label'));
 requests.push(json({createSlide:{objectId:slideId,insertionIndex:before.snapshot.slides.length,slideLayoutReference:{predefinedLayout:'BLANK'}}}));
 const addShape=(mapping:GoogleSlidesMapping,box:GoogleSlidesBox,label:string,shapeType:'TEXT_BOX'|'RECTANGLE')=>{
  requests.push(json({createShape:{objectId:mapping.nativeId,shapeType,elementProperties:shapeProperties(slideId,box)}}));
  if(label.length)requests.push(json({insertText:{objectId:mapping.nativeId,text:label,insertionIndex:0}}));addAltText(requests,mapping,before.presentationId,version);
 };
 if(title)addShape(title,boxed.title!,visual.title!,'TEXT_BOX');
 addShape(question,boxed.question,visual.question,'TEXT_BOX');
 for(const node of nodes)addShape(nodeMappings.get(node.id)!,boxed.nodes[node.id]!,node.label,'RECTANGLE');
 for(const edge of edges){
  const mapping=edgeMappings.get(edge.id)!,from=boxed.nodes[edge.from]!,to=boxed.nodes[edge.to]!,sx=from.x+from.width/2,sy=from.y+from.height/2,dx=to.x+to.width/2-sx,dy=to.y+to.height/2-sy;
  requireSlides(dx!==0||dy!==0,'ENDPOINT','Coincident/self connectors have no qualified native route',undefined,mapping.path);
  requests.push(json({createLine:{objectId:mapping.nativeId,category:'STRAIGHT',elementProperties:{pageObjectId:slideId,size:{width:{magnitude:1,unit:'PT'},height:{magnitude:1,unit:'PT'}},transform:{scaleX:dx,scaleY:dy,shearX:0,shearY:0,translateX:sx,translateY:sy,unit:'PT'}}}}));
  requests.push(json({updateLineProperties:{objectId:mapping.nativeId,lineProperties:{startConnection:{connectedObjectId:nodeMappings.get(edge.from)!.nativeId,connectionSiteIndex:0},endConnection:{connectedObjectId:nodeMappings.get(edge.to)!.nativeId,connectionSiteIndex:0},startArrow:'NONE',endArrow:'FILL_ARROW'},fields:'startConnection,endConnection,startArrow,endArrow'}}));
  addAltText(requests,mapping,before.presentationId,version);
  if(edge.label!==undefined)addShape(edgeLabelMappings.get(edge.id)!,boxed.edgeLabels![edge.id]!,edge.label,'TEXT_BOX');
 }
 const allIds=[slideId,...mappings.map(mapping=>mapping.nativeId)];requireSlides(new Set(allIds).size===allIds.length,'IDENTITY','Generated native IDs are not bijective');
 const normalizedPlacement=copyOwned(boxed);
 return{profile:GOOGLE_SLIDES_PROFILE,modelVersion:version,mode:selectedMode,source,sourceDigestSha256:await hostDigest(source),placement:normalizedPlacement,before,slideId,mappings,losses,batch:{requests,writeControl:{requiredRevisionId:before.revisionId}}};
}

function kindCode(kind:GoogleSlidesMappingKind):string{return({title:'t',question:'q',node:'n',edge:'e','edge-label':'l'} as const)[kind];}
async function objectId(namespace:string,kind:string,identity:string):Promise<string>{return namespace+'_'+kind+'_'+(await sha256(identity)).slice(0,24);}
function allElementRefs(slide:Record<string,unknown>):Record<string,unknown>[]{
 const result:Record<string,unknown>[]=[];const visit=(items:unknown)=>{if(!Array.isArray(items))return;for(const item of items){if(!isRecord(item))continue;result.push(item);if(isRecord(item.group))visit(item.group.groupElements);}};visit(slide.pageElements);return result;
}
