// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json} from '@umf/core';
import {getVisual,inspectVisual,type Visual} from '../../extensions/visual/index.js';
import {admitHostBinding,finishHostReconciliation,hostDigest,canonicalHostJson,copyHostJson} from '../reconciliation/index.js';
import type {HostObservation} from '../reconciliation/types.js';
import {GoogleSlidesError,canonical,copyOwned,isRecord,json,pointerJoin,requireSlides} from './json.js';
import {elementIndex,observeGoogleSlides,slideById,validateGoogleSlidesObservation} from './observe.js';
import {planGoogleSlidesExport} from './plan.js';
import {googleSlidesSourceLosses} from './plan.js';
import {GOOGLE_SLIDES_PROFILE,type GoogleSlidesAppliedExport,type GoogleSlidesAppliedUpdate,type GoogleSlidesBinding,type GoogleSlidesChange,type GoogleSlidesImportResult,type GoogleSlidesLoss,type GoogleSlidesMapping,type GoogleSlidesMappingKind,type GoogleSlidesObservation,type GoogleSlidesUpdateOptions,type GoogleSlidesUpdatePlan,type GoogleSlidesHostApi,type GoogleSlidesExportPlan} from './types.js';

const vp='/extensions/umf.visual';
const kindOrder:GoogleSlidesMappingKind[]=['title','question','node','edge','edge-label'];
const mapKey=(m:Pick<GoogleSlidesMapping,'kind'|'logicalId'>)=>m.kind+':'+m.logicalId;
function toHostObservation(observation:GoogleSlidesObservation,slideId:string):HostObservation{
 return{resource:{host:'google-slides',documentId:observation.presentationId,pageId:slideId},revision:{kind:'host-revision',value:observation.revisionId},captureDigestSha256:observation.captureDigestSha256,payload:copyHostJson(observation.snapshot) as Json};
}
function fromHostObservation(value:HostObservation):GoogleSlidesObservation{
 return{presentationId:value.resource.documentId,revisionId:value.revision.value,captureDigestSha256:value.captureDigestSha256,snapshot:copyOwned(value.payload) as unknown as GoogleSlidesObservation['snapshot']};
}
function sourceVersion(document:Document):'1.0.0'|'1.1.0'{const version=document.vocabularies['umf.visual']?.version;requireSlides(version==='1.0.0'||version==='1.1.0','BINDING','Unsupported Slides model version');return version;}
function visualSlot(m:GoogleSlidesMapping):string{return m.kind==='title'?vp+'/title':m.kind==='question'?vp+'/question':m.kind==='node'?m.path+'/label':m.path;}
function mappingsForSlide(binding:GoogleSlidesBinding):GoogleSlidesMapping[]{
 const slide=binding.baselineNative.resource.pageId;
 requireSlides(typeof slide==='string'&&slide.length>0,'BINDING','Binding must identify exactly one slide');
 const scope='slide:'+slide,seenLogical=new Set<string>(),seenNative=new Set<string>();
 requireSlides(binding.mappings.every(m=>m.nativeScope===scope&&kindOrder.includes(m.kind as GoogleSlidesMappingKind)),'IDENTITY','Mapping escapes the bound slide or kind profile');
 for(const m of binding.mappings){const key=mapKey(m);requireSlides(!seenLogical.has(key)&&!seenNative.has(m.nativeId),'IDENTITY','Mappings are not bijective');seenLogical.add(key);seenNative.add(m.nativeId);}
 return binding.mappings;
}
function nativeMarker(mapping:GoogleSlidesMapping,binding:Pick<GoogleSlidesBinding,'profile'|'modelVersion'|'resource'>):Record<string,unknown>{
 return{profile:binding.profile,modelVersion:binding.modelVersion,presentationId:binding.resource.documentId,scope:mapping.nativeScope,kind:mapping.kind,logicalId:mapping.logicalId,path:mapping.path};
}
function readMarker(element:Record<string,unknown>):unknown{
 const text=element.title==='UMF visual binding'&&typeof element.description==='string'?element.description:undefined;
 if(!text)return undefined;try{return JSON.parse(text);}catch{return null;}
}
function semanticText(element:Record<string,unknown>,path:string):string{
 requireSlides(isRecord(element.shape),'IDENTITY','Mapped text object changed native type',undefined,path);
 const shape=element.shape;requireSlides(typeof shape.shapeType==='string','IDENTITY','Mapped shape has no native shape type',undefined,path);
 const text=shape.text;
 requireSlides(isRecord(text)&&Array.isArray(text.textElements),'TEXT','Mapped shape text is unavailable',undefined,path);
 let result='';for(const [i,run] of text.textElements.entries()){
  requireSlides(isRecord(run)&&run.autoText===undefined,'TEXT','Dynamic or malformed Slides text is outside this profile',undefined,path+'/text/'+i);
  if(run.textRun!==undefined){requireSlides(isRecord(run.textRun)&&typeof run.textRun.content==='string','TEXT','Malformed text run',undefined,path+'/text/'+i);result+=run.textRun.content;}
  else if(run.paragraphMarker!==undefined){/* paragraph markers carry no semantic text */}
  else requireSlides(false,'TEXT','Unsupported Slides text element',undefined,path+'/text/'+i);
 }
 requireSlides(result.endsWith('\n'),'TEXT','Slides text lacks its required terminal paragraph newline',undefined,path);
 result=result.slice(0,-1);requireSlides(!result.includes('\n')&&!result.includes('\r'),'TEXT','Multiline Slides labels are outside this profile',undefined,path);
 return result;
}
function allMappingsExpected(binding:GoogleSlidesBinding):void{
 const visual=getVisual(binding.source),expected:Array<{kind:GoogleSlidesMappingKind;logicalId:string;path:string}>=[];
 if(visual.title!==undefined)expected.push({kind:'title',logicalId:visual.id,path:vp+'/title'});expected.push({kind:'question',logicalId:visual.id,path:vp+'/question'});
 for(const [i,n] of (visual.nodes??[]).entries())expected.push({kind:'node',logicalId:n.id,path:vp+'/nodes/'+i});
 for(const [i,e] of (visual.edges??[]).entries()){expected.push({kind:'edge',logicalId:e.id,path:vp+'/edges/'+i});if(e.label!==undefined)expected.push({kind:'edge-label',logicalId:e.id,path:vp+'/edges/'+i+'/label'});}
 const actual=mappingsForSlide(binding);requireSlides(actual.length===expected.length,'BINDING','Binding mapping cardinality differs from source');
 for(const wanted of expected)requireSlides(actual.some(m=>m.kind===wanted.kind&&m.logicalId===wanted.logicalId&&m.path===wanted.path),'BINDING','Binding mapping slots or paths differ from source',undefined,wanted.path);
}
type Projection={visual:ReturnType<typeof getVisual>;text:Map<string,string>;endpoint:Map<string,{from:string;to:string}>;nativeOnly:string[];unmapped:string[]};
function project(binding:GoogleSlidesBinding,observation:GoogleSlidesObservation):Projection{
 const maps=mappingsForSlide(binding),slideId=binding.baselineNative.resource.pageId!,slide=slideById(observation,slideId),elements=elementIndex(slide,slideId),visual=getVisual(copyOwned(binding.source)),text=new Map<string,string>(),endpoint=new Map<string,{from:string;to:string}>(),nativeOnly:string[]=[],unmapped:string[]=[];
 const byNative=new Map(maps.map(m=>[m.nativeId,m])),byLogical=new Map(maps.map(m=>[mapKey(m),m]));
 for(const ref of elements.values()){
  const marker=readMarker(ref.element);if(marker===undefined)continue;
  if(marker===null)throw new GoogleSlidesError('IDENTITY','Malformed Slides binding marker',undefined,ref.path);
  if(isRecord(marker)&&marker.profile===binding.profile&&marker.presentationId===binding.resource.documentId){
   const m=byNative.get(String(ref.element.objectId));requireSlides(m&&canonical(marker)===canonical(nativeMarker(m,binding)),'IDENTITY','Copied or altered native object claims this binding',undefined,ref.path);
  }
 }
 for(const mapping of maps){
  const ref=elements.get(mapping.nativeId);requireSlides(ref,'IDENTITY','Mapped native object was deleted',undefined,mapping.path);
  const marker=readMarker(ref.element);requireSlides(canonical(marker)===canonical(nativeMarker(mapping,binding)),'IDENTITY','Mapped object identity marker changed',undefined,mapping.path);
  if(mapping.kind==='edge'){
   requireSlides(isRecord(ref.element.line)&&ref.element.line.lineCategory==='STRAIGHT','IDENTITY','Mapped connector type changed',undefined,mapping.path);
   const props=ref.element.line.lineProperties;requireSlides(isRecord(props),'ENDPOINT','Connector properties are missing',undefined,mapping.path);
   requireSlides((props.startArrow===undefined||props.startArrow==='NONE')&&props.endArrow==='FILL_ARROW','STRUCTURE','Connector direction or arrow meaning changed',undefined,mapping.path);
   const start=props.startConnection,end=props.endConnection;requireSlides(isRecord(start)&&isRecord(end)&&typeof start.connectedObjectId==='string'&&typeof end.connectedObjectId==='string','ENDPOINT','Connector is detached',undefined,mapping.path);
   const fm=byNative.get(start.connectedObjectId),tm=byNative.get(end.connectedObjectId);requireSlides(fm?.kind==='node'&&tm?.kind==='node','ENDPOINT','Connector attaches to an unmapped native object',undefined,mapping.path);
   endpoint.set(mapping.logicalId,{from:fm.logicalId,to:tm.logicalId});
  }else{
   requireSlides(isRecord(ref.element.shape),'IDENTITY','Mapped shape changed native type',undefined,mapping.path);
   const shapeType=ref.element.shape.shapeType,expected=mapping.kind==='node'?'RECTANGLE':'TEXT_BOX';requireSlides(shapeType===expected,'IDENTITY','Mapped shape kind changed',undefined,mapping.path);
   text.set(mapKey(mapping),semanticText(ref.element,mapping.path));
  }
  const base=elements.get(mapping.nativeId)!.element;
  const baselineElements=elementIndex(slideById(fromHostObservation(binding.baselineNative),slideId),slideId);
  const baseRef=baselineElements.get(mapping.nativeId),baseElement=baseRef?.element;
  requireSlides(baseElement,'BINDING','Mapped object is absent from baseline',undefined,mapping.path);
  if(ref.parentGroupId!==baseRef?.parentGroupId||canonical(nativePresentationOnly(base,mapping))!==canonical(nativePresentationOnly(baseElement,mapping)))nativeOnly.push(mapping.nativeId);
 }
 for(const ref of elements.values())if(!byNative.has(String(ref.element.objectId)))unmapped.push(String(ref.element.objectId));
 for(const e of visual.edges??[]){const info=endpoint.get(e.id)!;e.from=info.from;e.to=info.to;if(e.label!==undefined)e.label=text.get('edge-label:'+e.id)!;else requireSlides(!maps.some(m=>m.kind==='edge-label'&&m.logicalId===e.id),'BINDING','Unexpected edge caption mapping');}
 for(const n of visual.nodes??[])n.label=text.get('node:'+n.id)!;
 visual.question=text.get('question:'+visual.id)!;
 if(visual.title!==undefined)visual.title=text.get('title:'+visual.id)!;
 return{visual,text,endpoint,nativeOnly:[...new Set(nativeOnly)].sort(),unmapped:unmapped.sort()};
}
function nativeOnlySnapshotChanges(binding:GoogleSlidesBinding,observation:GoogleSlidesObservation):string[]{
 const mapped=new Set(binding.mappings.map(m=>m.nativeId));
 const index=(value:GoogleSlidesObservation)=>{
  const result=new Map<string,{element:Record<string,unknown>;slide:string;parent?:string}>();
  for(const slide of value.snapshot.slides)for(const ref of elementIndex(slide,String(slide.objectId)).values())result.set(String(ref.element.objectId),{element:ref.element,slide:String(slide.objectId),...(ref.parentGroupId?{parent:ref.parentGroupId}:{})});
  return result;
 };
 const before=index(fromHostObservation(binding.baselineNative)),after=index(observation),changes:string[]=[];
 for(const id of new Set([...before.keys(),...after.keys()])){
  if(mapped.has(id))continue;const a=before.get(id),b=after.get(id);
  if(!a||!b||a.slide!==b.slide||a.parent!==b.parent||canonical(a.element)!==canonical(b.element))changes.push('native:'+id+(!a?':added':!b?':deleted':':changed'));
 }
 return changes.sort();
}
function nativePresentationOnly(element:Record<string,unknown>,mapping:GoogleSlidesMapping):unknown{
 const result=copyOwned(element);
 if(mapping.kind==='edge'){
  const line=result.line as Record<string,unknown>;const props=copyOwned(line.lineProperties) as Record<string,unknown>;
  for(const side of ['startConnection','endConnection'])if(isRecord(props[side])){const connection=props[side] as Record<string,unknown>;delete connection.connectedObjectId;}
  line.lineProperties=props;
 }else if(isRecord(result.shape)){
  const shape=result.shape as Record<string,unknown>;
  if(isRecord(shape.text)&&Array.isArray(shape.text.textElements))for(const item of shape.text.textElements){
   if(isRecord(item)&&isRecord(item.textRun))delete item.textRun.content;
   if(isRecord(item))delete item.endIndex;
  }
 }
 delete result.title;delete result.description;return result;
}
function applyProjection(source:Document,projection:Projection):{document:Document;changes:GoogleSlidesChange[]}{
 const document=copyOwned(source),visual=document.extensions!['umf.visual'] as unknown as Visual,changes:GoogleSlidesChange[]=[];
 const set=(path:string,target:Record<string,unknown>,field:string,value:string|undefined)=>{const old=target[field];if(old===value)return;changes.push({path,before:old===undefined?{present:false}:{present:true,value:old as Json},after:value===undefined?{present:false}:{present:true,value:value as Json}});if(value===undefined)delete target[field];else target[field]=value;};
 set(vp+'/question',visual as unknown as Record<string,unknown>,'question',projection.text.get('question:'+visual.id));
 if(visual.title!==undefined)set(vp+'/title',visual as unknown as Record<string,unknown>,'title',projection.text.get('title:'+visual.id));
 (visual.nodes??[]).forEach((node,index)=>set(vp+'/nodes/'+index+'/label',node as unknown as Record<string,unknown>,'label',projection.text.get('node:'+node.id)));
 (visual.edges??[]).forEach((edge,index)=>{const p=projection.endpoint.get(edge.id)!;set(vp+'/edges/'+index+'/from',edge as unknown as Record<string,unknown>,'from',p.from);set(vp+'/edges/'+index+'/to',edge as unknown as Record<string,unknown>,'to',p.to);if(edge.label!==undefined)set(vp+'/edges/'+index+'/label',edge as unknown as Record<string,unknown>,'label',projection.text.get('edge-label:'+edge.id));});
 requireSlides(inspectVisual(document).valid,'VISUAL_INVALID','Native edits produce an invalid UMF visual');return{document,changes};
}
function geometrySnapshot(element:Record<string,unknown>):unknown{
 const t=element.transform,s=element.size;return{transform:t,size:s};
}
function isMappedText(mapping:GoogleSlidesMapping):boolean{return mapping.kind!=='edge';}

/** Shared structural admission plus Slides-owned semantic loss and baseline proof. */
export async function admitGoogleSlidesBinding(input:unknown):Promise<GoogleSlidesBinding>{
 const binding=await admitHostBinding(input) as GoogleSlidesBinding;requireSlides(binding.profile===GOOGLE_SLIDES_PROFILE,'BINDING','Wrong Slides profile');
 requireSlides(canonical(binding.losses.filter(loss=>loss.family==='semantic'))===canonical(googleSlidesSourceLosses(binding.source)),'BINDING_LOSS','Semantic loss inventory does not match the bound source');
 allMappingsExpected(binding);
 const baseline=project(binding,fromHostObservation(binding.baselineNative));requireSlides(canonical(baseline.visual)===canonical(getVisual(binding.source)),'BINDING','Native baseline projection does not reconstruct bound UMF source');
 return binding;
}

/** Reconcile two identical, fully admitted host captures. No mutation or host access occurs here. */
export async function importGoogleSlidesEdits(input:unknown,currentDocument:Document,beforeInput:GoogleSlidesObservation,afterInput:GoogleSlidesObservation,expectedBindingRevision:number):Promise<GoogleSlidesImportResult>{
 const binding=await admitGoogleSlidesBinding(input);
 requireSlides(binding.state==='complete'&&binding.bindingRevision===expectedBindingRevision,'STALE_BINDING','Binding revision changed or write is incomplete');
 requireSlides(canonical(copyOwned(currentDocument))===canonical(binding.source),'STALE_SOURCE','UMF source changed since this binding');
 const [before,after]=await Promise.all([validateGoogleSlidesObservation(beforeInput),validateGoogleSlidesObservation(afterInput)]);
 requireSlides(before.presentationId===binding.resource.documentId&&after.presentationId===binding.resource.documentId,'RESOURCE','Observation belongs to a different presentation');
 requireSlides(before.revisionId===after.revisionId&&before.captureDigestSha256===after.captureDigestSha256,'CONCURRENT_EDIT','Repeated native captures differ');
 const now=project(binding,after),proposed=applyProjection(binding.source,now);
 const sharedFence={expectedBindingRevision,observedBefore:toHostObservation(before,binding.resource.pageId!),observedAfter:toHostObservation(after,binding.resource.pageId!)};
 const losses=[...binding.losses];
 for(const id of now.unmapped){const path=pointerJoin(pointerJoin(pointerJoin('/native/slides',binding.resource.pageId!),'pageElements'),id);if(!losses.some(loss=>loss.path===path))losses.push({path,code:'NATIVE_ONLY',family:'native',representation:'retained-only',message:'Unmapped native Slides element is retained in the full presentation snapshot.'});}
 for(const id of now.nativeOnly){const path=pointerJoin('/native/objects',id);if(!losses.some(loss=>loss.path===path))losses.push({path,code:'NATIVE_ONLY',family:'native',representation:'retained-only',message:'Native-only style, layout or grouping changes are retained in the full presentation snapshot.'});}
 const nativeSnapshotChanges=nativeOnlySnapshotChanges(binding,after);
 for(const change of nativeSnapshotChanges){const id=change.slice('native:'.length).replace(/:(added|deleted|changed)$/,'');const path=pointerJoin('/native/objects',id);if(!losses.some(loss=>loss.path===path))losses.push({path,code:'NATIVE_ONLY',family:'native',representation:'retained-only',message:'Unmapped native Slides object changed and remains only in the retained presentation capture.'});}
 const result=await finishHostReconciliation(binding,currentDocument,sharedFence,{document:proposed.document,changes:proposed.changes,nativeOnlyChanges:[...now.nativeOnly,...now.unmapped,...nativeSnapshotChanges],losses});
 requireSlides(result.ok,'RECONCILE',result.diagnostics[0]?.message??'Host reconciliation refused',result);
 return{document:result.document,original:copyOwned(binding.source),binding:result.binding as GoogleSlidesBinding,observation:after,changes:result.changes as GoogleSlidesChange[],nativeOnly:result.nativeOnlyChanges,unmapped:now.unmapped,losses:result.losses as GoogleSlidesLoss[]};
}

/** Apply a prepared create plan, then bind only after a complete host readback. */
export async function applyGoogleSlidesExport(plan:GoogleSlidesExportPlan,api:GoogleSlidesHostApi):Promise<GoogleSlidesAppliedExport>{
 const admitted=copyOwned(plan),before=await validateGoogleSlidesObservation(admitted.before);requireSlides(before.presentationId===admitted.before.presentationId&&before.revisionId===admitted.batch.writeControl.requiredRevisionId,'STALE_REVISION','Export plan no longer targets its captured revision');
 const namespace=admitted.slideId.match(/^(.+)_slide_[a-f0-9]{24}$/)?.[1];requireSlides(namespace,'PLAN','Cannot verify generated Slides plan namespace');
 const regenerated=await planGoogleSlidesExport(admitted.source,before,admitted.placement,{mode:admitted.mode,namespace});
 requireSlides(regenerated.sourceDigestSha256===admitted.sourceDigestSha256&&canonical(regenerated.batch)===canonical(admitted.batch)&&canonical(regenerated.mappings)===canonical(admitted.mappings)&&canonical(regenerated.losses)===canonical(admitted.losses)&&canonical(regenerated.placement)===canonical(admitted.placement)&&regenerated.slideId===admitted.slideId,'PLAN','Export plan was altered after planning');
 try{await api.batchUpdate(before.presentationId,copyOwned(regenerated.batch));}
 catch(error){throw new GoogleSlidesError('WRITE_INTERRUPTED','Google Slides batch outcome is uncertain; retain the plan and capture the presentation before recovery',{plan:admitted,error:String(error)});}
 const after=await observeGoogleSlides(await api.getPresentation(before.presentationId));
 requireSlides(after.presentationId===before.presentationId&&after.revisionId!==before.revisionId,'WRITE_UNVERIFIED','Slides write did not produce a new host revision',{plan:admitted,observation:after});
 const resource={host:'google-slides' as const,documentId:after.presentationId,pageId:admitted.slideId},mappings=copyOwned(regenerated.mappings),losses=copyOwned(regenerated.losses);
 const baselineNative=toHostObservation(after,admitted.slideId);
 const binding:GoogleSlidesBinding={profile:GOOGLE_SLIDES_PROFILE,modelVersion:regenerated.modelVersion,resource,bindingRevision:0,source:copyOwned(regenerated.source),sourceDigestSha256:await hostDigest(regenerated.source),baselineNative,mappings,losses,state:'complete'};
 await admitGoogleSlidesBinding(binding);
 const baseline=project(binding,after);requireSlides(canonical(baseline.visual)===canonical(getVisual(binding.source)),'WRITE_UNVERIFIED','Native export readback differs from source semantics',{plan,observation:after});
 return{binding,observation:after};
}

function visualMap(document:Document):Map<string,string>{const v=getVisual(document),m=new Map<string,string>();m.set('question:'+v.id,v.question);if(v.title!==undefined)m.set('title:'+v.id,v.title);for(const n of v.nodes??[])m.set('node:'+n.id,n.label);for(const e of v.edges??[]){if(e.label!==undefined)m.set('edge-label:'+e.id,e.label);}return m;}
function endpointMap(document:Document):Map<string,{from:string;to:string}>{return new Map((getVisual(document).edges??[]).map(e=>[e.id,{from:e.from,to:e.to}]));}
function textRequests(mapping:GoogleSlidesMapping,previous:string,value:string,style?:Record<string,unknown>):Json[]{
 const requests:Json[]=[];
 if(previous.length)requests.push(json({deleteText:{objectId:mapping.nativeId,textRange:{type:'FIXED_RANGE',startIndex:0,endIndex:previous.length}}}));
 if(value.length)requests.push(json({insertText:{objectId:mapping.nativeId,text:value,insertionIndex:0}}));
 if(value.length&&style&&Object.keys(style).length)requests.push(json({updateTextStyle:{objectId:mapping.nativeId,style,textRange:{type:'FIXED_RANGE',startIndex:0,endIndex:value.length},fields:Object.keys(style).sort().join(',')}}));
 return requests;
}
function uniformTextStyle(element:Record<string,unknown>):Record<string,unknown>|undefined{
 requireSlides(isRecord(element.shape)&&isRecord(element.shape.text)&&Array.isArray(element.shape.text.textElements),'UNSAFE_TEXT_STYLE','Mapped text runs are unavailable');
 const styles:Record<string,unknown>[]=[];
 for(const item of element.shape.text.textElements){
  if(!isRecord(item))throw new GoogleSlidesError('UNSAFE_TEXT_STYLE','Malformed native text run');
  if(isRecord(item.textRun)){
   requireSlides(item.textRun.autoText===undefined&&item.textRun.fieldId===undefined,'UNSAFE_TEXT_STYLE','Dynamic native text cannot be safely edited');
   styles.push(isRecord(item.textRun.style)?item.textRun.style:{});
  }
 }
 if(!styles.length)return undefined;
 const unique=new Set(styles.map(style=>canonical(style)));
 requireSlides(unique.size===1,'UNSAFE_TEXT_STYLE','Mapped text has multiple character styles; replacing it would flatten native run formatting');
 const style=copyOwned(styles[0]!),writable=new Set(['backgroundColor','foregroundColor','bold','italic','fontFamily','fontSize','baselineOffset','smallCaps','strikethrough','underline','weightedFontFamily']);
 requireSlides(Object.keys(style).every(key=>writable.has(key)),'UNSAFE_TEXT_STYLE','Native text has style fields outside the verified writable subset');
 return style;
}
function sameExceptOwnedFields(current:Document,desired:Document):void{
 const a=copyOwned(current),b=copyOwned(desired),va=a.extensions!['umf.visual'] as unknown as Record<string,unknown>,vb=b.extensions!['umf.visual'] as unknown as Record<string,unknown>;
 for(const key of ['title','question']){delete va[key];delete vb[key];}
 const an=(va.nodes as unknown as Record<string,unknown>[]),bn=(vb.nodes as unknown as Record<string,unknown>[]);requireSlides(an.length===bn.length,'UNSAFE_EDIT','Node insertion/deletion is outside the update profile');for(let i=0;i<an.length;i++){delete an[i]!.label;delete bn[i]!.label;}
 const ae=(va.edges as unknown as Record<string,unknown>[]),be=(vb.edges as unknown as Record<string,unknown>[]);requireSlides(ae.length===be.length,'UNSAFE_EDIT','Edge insertion/deletion is outside the update profile');for(let i=0;i<ae.length;i++)for(const key of ['label','from','to']){delete ae[i]![key];delete be[i]![key];}
 requireSlides(canonical(a)===canonical(b),'UNSAFE_EDIT','Desired source changes fields outside title/question/node label/edge label/endpoints');
}
/** Plan a native-preserving update. It never creates a fresh layout or rewrites unrelated objects. */
export async function planGoogleSlidesUpdate(input:unknown,currentSource:Document,desiredSource:Document,currentInput:GoogleSlidesObservation,options:GoogleSlidesUpdateOptions):Promise<GoogleSlidesUpdatePlan>{
 const safeOptions=copyOwned(options);requireSlides(isRecord(safeOptions)&&Object.keys(safeOptions).every(key=>key==='mode'||key==='expectedBindingRevision'),'OPTIONS','Invalid update options');
 const mode=safeOptions.mode??'strict';requireSlides(mode==='strict'||mode==='report','MODE','Expected strict or report mode');
 const binding=await admitGoogleSlidesBinding(input);requireSlides(binding.state==='complete','BINDING','Expected a complete Google Slides binding');requireSlides(Number.isSafeInteger(safeOptions.expectedBindingRevision)&&binding.bindingRevision===safeOptions.expectedBindingRevision,'STALE_BINDING','Expected binding revision differs');
 requireSlides(mode==='report'||!binding.losses.some(loss=>loss.family==='semantic'),'RENDER_LOSS','Strict update refuses retained-only semantic meaning',{losses:binding.losses});
 requireSlides(canonical(copyOwned(currentSource))===canonical(binding.source),'STALE_SOURCE','Current UMF source differs from bound source');
 const desired=copyOwned(desiredSource),inspection=inspectVisual(desired);requireSlides(inspection.valid,'UNSAFE_EDIT','Desired source must be valid');sameExceptOwnedFields(binding.source,desired);
 if(canonical(desired)!==canonical(binding.source))requireSlides(inspectVisual(binding.source).complete&&inspection.complete,'UNSAFE_EDIT','Semantic updates require a complete bound and desired Visual');
 const current=await validateGoogleSlidesObservation(currentInput);requireSlides(current.presentationId===binding.resource.documentId,'RESOURCE','Current capture belongs to another presentation');
 const currentProjected=project(binding,current);const representedCurrent=applyProjection(binding.source,currentProjected).document;requireSlides(canonical(getVisual(representedCurrent))===canonical(getVisual(binding.source)),'STALE_NATIVE','Native semantic content changed since binding; import edits before update');
 const baseline=project(binding,fromHostObservation(binding.baselineNative));requireSlides(canonical(baseline.visual)===canonical(getVisual(binding.source)),'BINDING','Bound native baseline does not match source');
 const oldText=visualMap(binding.source),newText=visualMap(desired),oldEndpoints=endpointMap(binding.source),newEndpoints=endpointMap(desired),requests:Json[]=[],changes:GoogleSlidesChange[]=[];
 const capturedSlide=slideById(current,binding.resource.pageId!),nativeElements=elementIndex(capturedSlide,binding.resource.pageId!);
 for(const mapping of binding.mappings){if(isMappedText(mapping)){const key=mapKey(mapping),old=oldText.get(key),next=newText.get(key);if(old!==next){requireSlides(old!==undefined&&next!==undefined,'UNSAFE_EDIT','Mapped text cannot be removed in this profile',undefined,mapping.path);const target=nativeElements.get(mapping.nativeId)?.element;requireSlides(target,'IDENTITY','Mapped shape is missing',undefined,mapping.path);const style=uniformTextStyle(target);requests.push(...textRequests(mapping,old,next,style));changes.push({path:visualSlot(mapping),before:{present:true,value:old as Json},after:{present:true,value:next as Json}});}}
  if(mapping.kind==='edge'){const old=oldEndpoints.get(mapping.logicalId)!,next=newEndpoints.get(mapping.logicalId)!;if(old.from!==next.from||old.to!==next.to){const nodeId=(logical:string)=>binding.mappings.find(m=>m.kind==='node'&&m.logicalId===logical)?.nativeId;const start=nodeId(next.from),end=nodeId(next.to);requireSlides(start&&end&&start!==end,'ENDPOINT','Desired connector endpoints must be distinct mapped nodes',undefined,mapping.path);const currentLine=nativeElements.get(mapping.nativeId)?.element.line as Record<string,unknown>|undefined,currentProps=isRecord(currentLine?.lineProperties)?currentLine!.lineProperties as Record<string,unknown>:{};const oldStart=isRecord(currentProps.startConnection)?currentProps.startConnection:{},oldEnd=isRecord(currentProps.endConnection)?currentProps.endConnection:{};requests.push(json({updateLineProperties:{objectId:mapping.nativeId,lineProperties:{startConnection:{...oldStart,connectedObjectId:start},endConnection:{...oldEnd,connectedObjectId:end}},fields:'startConnection.connectedObjectId,endConnection.connectedObjectId'}}));for(const field of ['from','to'] as const)if(old[field]!==next[field])changes.push({path:mapping.path+'/'+field,before:{present:true,value:old[field] as Json},after:{present:true,value:next[field] as Json}});}}
 }
 return{profile:GOOGLE_SLIDES_PROFILE,modelVersion:binding.modelVersion,mode,resource:copyOwned(binding.resource),expectedBindingRevision:binding.bindingRevision,sourceDigestSha256:binding.sourceDigestSha256,currentObservation:current,desiredSource:desired,desiredSourceDigestSha256:await hostDigest(desired),requests,changes,mappings:copyOwned(binding.mappings),losses:copyOwned(binding.losses)};
}
/** Execute with a host revision precondition, then demand a separate readback. */
export async function applyGoogleSlidesUpdate(plan:GoogleSlidesUpdatePlan,bindingInput:unknown,currentSource:Document,api:GoogleSlidesHostApi):Promise<GoogleSlidesAppliedUpdate>{
 const admitted=copyOwned(plan),binding=await admitGoogleSlidesBinding(bindingInput);
 requireSlides(admitted.profile===GOOGLE_SLIDES_PROFILE&&admitted.modelVersion===binding.modelVersion&&canonical(admitted.resource)===canonical(binding.resource)&&admitted.expectedBindingRevision===binding.bindingRevision,'BINDING','Update plan identity differs from its binding');
 requireSlides(admitted.sourceDigestSha256===binding.sourceDigestSha256&&canonical(copyOwned(currentSource))===canonical(binding.source),'STALE_SOURCE','Update source changed after planning');
 const regenerated=await planGoogleSlidesUpdate(binding,currentSource,admitted.desiredSource,admitted.currentObservation,{mode:admitted.mode,expectedBindingRevision:admitted.expectedBindingRevision});
 requireSlides(regenerated.profile===admitted.profile&&regenerated.modelVersion===admitted.modelVersion&&canonical(regenerated.resource)===canonical(admitted.resource)&&regenerated.mode===admitted.mode&&canonical(regenerated.requests)===canonical(admitted.requests)&&canonical(regenerated.changes)===canonical(admitted.changes)&&canonical(regenerated.desiredSource)===canonical(admitted.desiredSource)&&canonical(regenerated.mappings)===canonical(admitted.mappings)&&canonical(regenerated.losses)===canonical(admitted.losses)&&regenerated.desiredSourceDigestSha256===admitted.desiredSourceDigestSha256,'PLAN','Update plan was altered after planning');
 const current=await observeGoogleSlides(await api.getPresentation(admitted.resource.documentId));requireSlides(current.revisionId===admitted.currentObservation.revisionId&&current.captureDigestSha256===admitted.currentObservation.captureDigestSha256,'STALE_REVISION','Google Slides changed after update planning');
 if(!regenerated.requests.length)return{binding,observation:current};
 const batch={requests:copyOwned(regenerated.requests),writeControl:{requiredRevisionId:current.revisionId}};try{await api.batchUpdate(admitted.resource.documentId,batch);}catch(error){throw new GoogleSlidesError('WRITE_INTERRUPTED','Update outcome is uncertain; inspect the latest capture before recovery',{plan:admitted,error:String(error)});}
 const after=await observeGoogleSlides(await api.getPresentation(admitted.resource.documentId));requireSlides(after.revisionId!==current.revisionId,'WRITE_UNVERIFIED','Update did not produce a new Slides revision',{plan:admitted,observation:after});
 const updateLosses=copyOwned(binding.losses);for(const change of nativeOnlySnapshotChanges(binding,current)){const id=change.slice('native:'.length).replace(/:(added|deleted|changed)$/,'');const path=pointerJoin('/native/objects',id);if(!updateLosses.some(loss=>loss.path===path))updateLosses.push({path,code:'NATIVE_ONLY',family:'native',representation:'retained-only',message:'Unmapped native Slides object changed and remains only in the retained presentation capture.'});}
 const updatedProjection=project(binding,current);for(const id of updatedProjection.nativeOnly){const path=pointerJoin('/native/objects',id);if(!updateLosses.some(loss=>loss.path===path))updateLosses.push({path,code:'NATIVE_ONLY',family:'native',representation:'retained-only',message:'Mapped object style, layout or grouping remains native-only and is preserved in the captured presentation.'});}
 const checked:GoogleSlidesBinding={...binding,source:copyOwned(regenerated.desiredSource),sourceDigestSha256:await hostDigest(regenerated.desiredSource),baselineNative:toHostObservation(after,binding.resource.pageId!),bindingRevision:binding.bindingRevision+1,losses:updateLosses};
 const projection=project(checked,after);requireSlides(canonical(projection.visual)===canonical(getVisual(checked.source)),'WRITE_UNVERIFIED','Native update readback differs from desired UMF semantics',{plan:admitted,observation:after});
 return{binding:await admitGoogleSlidesBinding(checked),observation:after};
}
