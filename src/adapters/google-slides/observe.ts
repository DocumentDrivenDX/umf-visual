// SPDX-License-Identifier: MIT OR Apache-2.0
import type {GoogleSlidesObservation,SlidesPresentation} from './types.js';
import {GOOGLE_SLIDES_LIMITS,GoogleSlidesError,canonical,checkDepth,copyOwned,isRecord,requireSlides,sha256,utf8Bytes} from './json.js';

export interface NativeElementRef {element:Record<string,unknown>;path:string;parentGroupId?:string;}

export async function observeGoogleSlides(input:unknown):Promise<GoogleSlidesObservation>{
 const snapshot=copyOwned(input) as unknown as SlidesPresentation;requireSlides(isRecord(snapshot),'INPUT','Expected a Google Slides presentation snapshot');
 checkDepth(snapshot);
 const serialized=JSON.stringify(snapshot);requireSlides(utf8Bytes(serialized)<=GOOGLE_SLIDES_LIMITS.maxCaptureBytes,'LIMIT','Google Slides capture exceeds 16 MiB');
 requireSlides(typeof snapshot.presentationId==='string'&&snapshot.presentationId.length>0,'RESOURCE','Presentation ID is required');
 requireSlides(typeof snapshot.revisionId==='string'&&snapshot.revisionId.length>0,'REVISION','An actual host revision ID is required');
 requireSlides(Array.isArray(snapshot.slides)&&snapshot.slides.length>0,'INPUT','Presentation snapshot must include at least one slide');
 const pageSize=snapshot.pageSize;requireSlides(isRecord(pageSize),'INPUT','Presentation page size is required');
 for(const side of ['width','height'] as const){const dimension=pageSize[side];requireSlides(isRecord(dimension)&&Number.isFinite(dimension.magnitude)&&Number(dimension.magnitude)>0&&['PT','EMU'].includes(String(dimension.unit)),'INPUT','Presentation page dimensions must be positive points or EMUs');}
 const allIds=new Set<string>();let objectCount=0;
 for(const[index,slideValue]of snapshot.slides.entries()){
  requireSlides(isRecord(slideValue)&&typeof slideValue.objectId==='string'&&slideValue.objectId.length>0,'INPUT','Every slide needs a native object ID',undefined,'/slides/'+index);
  for(const ref of flattenNativeElements(slideValue,'/slides/'+index)){
   objectCount++;requireSlides(objectCount<=GOOGLE_SLIDES_LIMITS.maxObjects,'LIMIT','Presentation exceeds 10,000 native objects');
   const id=ref.element.objectId;requireSlides(typeof id==='string'&&id.length>0,'INPUT','Native page elements need object IDs',undefined,ref.path);
   requireSlides(!allIds.has(id),'IDENTITY','Duplicate native object ID in presentation',undefined,ref.path);allIds.add(id);
  }
 }
 return{presentationId:snapshot.presentationId,revisionId:snapshot.revisionId,captureDigestSha256:await sha256(canonical(snapshot)),snapshot};
}

/** Re-admits a typed observation instead of trusting a caller-created digest or revision. */
export async function validateGoogleSlidesObservation(input:GoogleSlidesObservation):Promise<GoogleSlidesObservation>{
 const owned=copyOwned(input);
 requireSlides(isRecord(owned)&&isRecord(owned.snapshot),'INPUT','Expected a Slides observation with a full snapshot');
 const observed=await observeGoogleSlides(owned.snapshot);
 requireSlides(owned.presentationId===observed.presentationId&&owned.revisionId===observed.revisionId&&owned.captureDigestSha256===observed.captureDigestSha256,'CAPTURE','Observation fields do not match its full snapshot');
 return observed;
}

export function flattenNativeElements(slide:unknown,basePath:string):NativeElementRef[]{
 const result:NativeElementRef[]=[];const visit=(elements:unknown,parentGroupId:string|undefined,path:string,depth:number):void=>{
  if(elements===undefined)return;requireSlides(Array.isArray(elements),'INPUT','Slide pageElements must be an array',undefined,path);
  for(const[index,value]of elements.entries()){
   const item=value;requireSlides(isRecord(item),'INPUT','Native page element must be a JSON object',undefined,path+'/'+index);
   const itemPath=path+'/'+index;result.push({element:item,path:itemPath,...(parentGroupId?{parentGroupId}:{})});
   if(item.group!==undefined){requireSlides(depth<GOOGLE_SLIDES_LIMITS.maxGroupDepth,'LIMIT','Native group nesting exceeds eight levels',undefined,itemPath);const group=item.group;requireSlides(isRecord(group),'INPUT','Malformed native group',undefined,itemPath+'/group');visit(group.groupElements,item.objectId as string,itemPath+'/group/groupElements',depth+1);}
  }
 };
 requireSlides(isRecord(slide),'INPUT','Expected a native slide');visit(slide.pageElements,undefined,basePath+'/pageElements',0);return result;
}

export function pageDimensionsInPoints(snapshot:SlidesPresentation):{width:number;height:number}{
 const point=(dimension:{magnitude:number;unit:string})=>dimension.unit==='EMU'?dimension.magnitude/12700:dimension.magnitude;
 return{width:point(snapshot.pageSize.width),height:point(snapshot.pageSize.height)};
}
export function slideById(observation:GoogleSlidesObservation,slideId:string):Record<string,unknown>{
 const slides=observation.snapshot.slides.filter(slide=>slide.objectId===slideId);
 requireSlides(slides.length===1,'IDENTITY','Mapped slide is missing or duplicated',observation);
 return slides[0]!;
}
export function elementIndex(slide:unknown,slideId:string):Map<string,NativeElementRef>{
 const result=new Map<string,NativeElementRef>();
 for(const ref of flattenNativeElements(slide,'slides['+slideId+']')){const id=String(ref.element.objectId);requireSlides(!result.has(id),'IDENTITY','Duplicate native element object ID',undefined,ref.path);result.set(id,ref);}
 return result;
}
