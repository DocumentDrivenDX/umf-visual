// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createVisualDocument,getVisual,type Visual} from '../../src/extensions/visual/index.js';
import {admitGoogleSlidesBinding,applyGoogleSlidesExport,applyGoogleSlidesUpdate,importGoogleSlidesEdits,observeGoogleSlides,planGoogleSlidesExport,planGoogleSlidesUpdate,type GoogleSlidesBatch,type GoogleSlidesHostApi,type GoogleSlidesPlacement} from '../../src/adapters/google-slides/index.js';
import type {Document} from '@umf/core';

const visual:Visual={id:'sample',kind:'flow',form:'network',question:'How does the request move?',nodes:[{id:'client',label:'Client'},{id:'service',label:'Service'}],edges:[{id:'calls',from:'client',to:'service',label:'sends request'}]};
const source=()=>createVisualDocument(structuredClone(visual),undefined,'1.1.0');
const presentation=()=>({presentationId:'pres-1',revisionId:'rev-1',pageSize:{width:{magnitude:720,unit:'PT'},height:{magnitude:540,unit:'PT'}},slides:[{objectId:'existing-slide',pageElements:[]}]});
const placement:GoogleSlidesPlacement={question:{x:20,y:20,width:280,height:45},nodes:{client:{x:70,y:130,width:130,height:70},service:{x:430,y:130,width:130,height:70}},edgeLabels:{calls:{x:280,y:145,width:90,height:28}}};
function fakeApi(initial:unknown=presentation()):{api:GoogleSlidesHostApi;current:()=>any;mutate:(fn:(snapshot:any)=>void)=>void;writes:GoogleSlidesBatch[]}{
 let snapshot=structuredClone(initial) as any;const writes:GoogleSlidesBatch[]=[];
 const api:GoogleSlidesHostApi={
  async getPresentation(){return structuredClone(snapshot);},
  async batchUpdate(_id,batch){expect(batch.writeControl.requiredRevisionId).toBe(snapshot.revisionId);writes.push(structuredClone(batch));for(const request of batch.requests as any[]){
   if(request.createSlide){snapshot.slides.push({objectId:request.createSlide.objectId,pageElements:[]});continue;}
   const targetSlide=(id:string)=>snapshot.slides.find((s:any)=>s.objectId===id);
   const find=(id:string)=>snapshot.slides.flatMap((s:any)=>s.pageElements).find((e:any)=>e.objectId===id);
   if(request.createShape){const r=request.createShape,e={objectId:r.objectId,size:r.elementProperties.size,transform:r.elementProperties.transform,shape:{shapeType:r.shapeType,text:{textElements:[{textRun:{content:'\n'}}]}}};targetSlide(r.elementProperties.pageObjectId).pageElements.push(e);continue;}
   if(request.createLine){const r=request.createLine,e={objectId:r.objectId,size:r.elementProperties.size,transform:r.elementProperties.transform,line:{lineCategory:r.category,lineProperties:{startArrow:'NONE',endArrow:'NONE'}}};targetSlide(r.elementProperties.pageObjectId).pageElements.push(e);continue;}
   if(request.insertText){const e=find(request.insertText.objectId);const runs=e.shape.text.textElements;e.shape.text.textElements=[{textRun:{content:request.insertText.text+'\n'}}];continue;}
   if(request.updateTextStyle){const e=find(request.updateTextStyle.objectId);for(const item of e.shape.text.textElements)if(item.textRun)item.textRun.style=request.updateTextStyle.style;continue;}
   if(request.updateLineProperties){const e=find(request.updateLineProperties.objectId);Object.assign(e.line.lineProperties,request.updateLineProperties.lineProperties);continue;}
   if(request.updatePageElementAltText){const v=request.updatePageElementAltText,e=find(v.objectId);e.title=v.title;e.description=v.description;continue;}
   if(request.deleteText){const e=find(request.deleteText.objectId);e.shape.text.textElements=[{textRun:{content:'\n'}}];continue;}
   throw new Error('Unimplemented fake request '+Object.keys(request)[0]);
  }snapshot.revisionId='rev-'+(Number(snapshot.revisionId.slice(4))+1);return{};}
 };
 return{api,current:()=>structuredClone(snapshot),mutate(fn){fn(snapshot);snapshot.revisionId='rev-'+(Number(snapshot.revisionId.slice(4))+1);},writes};
}
const element=(snapshot:any,id:string)=>snapshot.slides.flatMap((s:any)=>s.pageElements).find((e:any)=>e.objectId===id)!;
const textOf=(element:any)=>element.shape.text.textElements.map((x:any)=>x.textRun?.content??'').join('');
async function exported(){const host=fakeApi(),before=await observeGoogleSlides(await host.api.getPresentation('pres-1')),plan=await planGoogleSlidesExport(source(),before,placement);const applied=await applyGoogleSlidesExport(plan,host.api);return{host,before,plan,...applied};}

test('export is revision-fenced, binds actual native readback, and supports text/connector edits',async()=>{
 const {host,binding,observation}=await exported();expect(binding.state).toBe('complete');expect(binding.resource).toEqual({host:'google-slides',documentId:'pres-1',pageId:binding.baselineNative.resource.pageId});expect(host.writes[0]!.writeControl.requiredRevisionId).toBe('rev-1');
 const node=binding.mappings.find(m=>m.kind==='node'&&m.logicalId==='client')!,edge=binding.mappings.find(m=>m.kind==='edge')!,label=binding.mappings.find(m=>m.kind==='edge-label')!,target=binding.mappings.find(m=>m.kind==='node'&&m.logicalId==='service')!;
 host.mutate(snapshot=>{element(snapshot,node.nativeId).shape.text.textElements=[{textRun:{content:'Browser\n'}}];element(snapshot,label.nativeId).shape.text.textElements=[{textRun:{content:'HTTP request\n'}}];const p=element(snapshot,edge.nativeId).line.lineProperties;p.startConnection.connectedObjectId=target.nativeId;p.endConnection.connectedObjectId=node.nativeId;});
 const after=await observeGoogleSlides(await host.api.getPresentation('pres-1'));
 const imported=await importGoogleSlidesEdits(binding,binding.source,after,after,binding.bindingRevision);
 expect(getVisual(imported.document)).toMatchObject({nodes:[{id:'client',label:'Browser'},{id:'service',label:'Service'}],edges:[{id:'calls',from:'service',to:'client',label:'HTTP request'}]});
 expect(imported.changes.map(c=>c.path)).toEqual(['/extensions/umf.visual/nodes/0/label','/extensions/umf.visual/edges/0/from','/extensions/umf.visual/edges/0/to','/extensions/umf.visual/edges/0/label']);
 expect(imported.binding.bindingRevision).toBe(1);expect(imported.binding.baselineNative.revision.value).toBe('rev-3');expect(observation.revisionId).toBe('rev-2');
});

test('native-preserving update patches only owned text and attached endpoints under actual revision',async()=>{
 const {host,binding}=await exported();const desired=structuredClone(binding.source);const v=(desired.extensions!['umf.visual'] as unknown as Visual);v.nodes![0]!.label='Web client';v.edges![0]!.from='service';v.edges![0]!.to='client';
 const current=await observeGoogleSlides(await host.api.getPresentation('pres-1'));
 const plan=await planGoogleSlidesUpdate(binding,binding.source,desired,current,{expectedBindingRevision:0});
 expect(plan.requests.map(r=>Object.keys(r as object)[0])).toContain('deleteText');expect(plan.requests.some(r=>'updateLineProperties'in (r as object))).toBe(true);expect(plan.requests.some(r=>'createSlide'in (r as object))).toBe(false);
 const applied=await applyGoogleSlidesUpdate(plan,binding,binding.source,host.api),after=applied.observation;expect(after.revisionId).toBe('rev-3');expect(applied.binding.bindingRevision).toBe(1);expect(applied.binding.source).toEqual(desired);
 const newText=element(host.current(),binding.mappings.find(m=>m.kind==='node'&&m.logicalId==='client')!.nativeId);expect(textOf(newText)).toBe('Web client\n');
});

test('edge-caption update plans use the existing label pointer across a second cycle',async()=>{
 const {host,binding}=await exported(),path='/extensions/umf.visual/edges/0/label';
 const firstDesired=structuredClone(binding.source);(firstDesired.extensions!['umf.visual'] as unknown as Visual).edges![0]!.label='returns response';
 const firstCurrent=await observeGoogleSlides(await host.api.getPresentation('pres-1'));
 const firstPlan=await planGoogleSlidesUpdate(binding,binding.source,firstDesired,firstCurrent,{expectedBindingRevision:0});
 expect(firstPlan.changes.map(change=>change.path)).toEqual([path]);
 const firstApplied=await applyGoogleSlidesUpdate(firstPlan,binding,binding.source,host.api);
 expect(firstApplied.binding.bindingRevision).toBe(1);
 expect(textOf(element(host.current(),binding.mappings.find(mapping=>mapping.kind==='edge-label')!.nativeId))).toBe('returns response\n');

 const secondDesired=structuredClone(firstApplied.binding.source);(secondDesired.extensions!['umf.visual'] as unknown as Visual).edges![0]!.label='reply delivered';
 const secondCurrent=await observeGoogleSlides(await host.api.getPresentation('pres-1'));
 const secondPlan=await planGoogleSlidesUpdate(firstApplied.binding,firstApplied.binding.source,secondDesired,secondCurrent,{expectedBindingRevision:1});
 expect(secondPlan.changes.map(change=>change.path)).toEqual([path]);
 const secondApplied=await applyGoogleSlidesUpdate(secondPlan,firstApplied.binding,firstApplied.binding.source,host.api);
 expect(secondApplied.binding.bindingRevision).toBe(2);
 expect(textOf(element(host.current(),binding.mappings.find(mapping=>mapping.kind==='edge-label')!.nativeId))).toBe('reply delivered\n');

 host.mutate(snapshot=>{const label=secondApplied.binding.mappings.find(mapping=>mapping.kind==='edge-label')!;element(snapshot,label.nativeId).shape.text.textElements=[{textRun:{content:'native caption edit\n'}}];});
 const nativeAfter=await observeGoogleSlides(await host.api.getPresentation('pres-1'));
 const imported=await importGoogleSlidesEdits(secondApplied.binding,secondApplied.binding.source,nativeAfter,nativeAfter,2);
 expect(imported.changes.map(change=>change.path)).toEqual([path]);
 expect(getVisual(imported.document).edges![0]!.label).toBe('native caption edit');
});

test('native-only movement, style, and unrelated objects survive reconciliation as retained material',async()=>{
 const {host,binding}=await exported(),mapped=binding.mappings.find(m=>m.kind==='node')!;
 host.mutate(snapshot=>{const e=element(snapshot,mapped.nativeId);e.transform.translateX+=30;e.shape.shapeProperties={shapeBackgroundFill:{solidFill:{color:{rgbColor:{red:1}}}}};snapshot.slides.find((s:any)=>s.objectId===binding.resource.pageId).pageElements.push({objectId:'human-added',shape:{shapeType:'RECTANGLE',text:{textElements:[{textRun:{content:'Note\n'}}]}}});});
 const capture=await observeGoogleSlides(await host.api.getPresentation('pres-1'));
 const result=await importGoogleSlidesEdits(binding,binding.source,capture,capture,0);
 expect(result.nativeOnly).toContain(mapped.nativeId);expect(result.unmapped).toContain('human-added');expect(result.losses.some(l=>l.path.includes('human-added'))).toBe(true);
 expect(result.observation.snapshot.slides[1]!.pageElements).toHaveLength(6);
});

test('deletions, copied identity claims, stale revisions, and source drift refuse atomically',async()=>{
 const {host,binding}=await exported(),mapping=binding.mappings.find(m=>m.kind==='node')!;
 const deleted=structuredClone(binding.baselineNative.payload) as any;deleted.slides.find((s:any)=>s.objectId===binding.resource.pageId).pageElements=deleted.slides.find((s:any)=>s.objectId===binding.resource.pageId).pageElements.filter((e:any)=>e.objectId!==mapping.nativeId);
 const deletedObs=await observeGoogleSlides(deleted);await expect(importGoogleSlidesEdits(binding,binding.source,deletedObs,deletedObs,0)).rejects.toThrow(/deleted|missing/i);
 host.mutate(snapshot=>{const e=structuredClone(element(snapshot,mapping.nativeId));e.objectId='copied-object';snapshot.slides.find((s:any)=>s.objectId===binding.resource.pageId).pageElements.push(e);});const copied=await observeGoogleSlides(await host.api.getPresentation('pres-1'));
 await expect(importGoogleSlidesEdits(binding,binding.source,copied,copied,0)).rejects.toThrow(/claims this binding/i);
 await expect(importGoogleSlidesEdits(binding,binding.source,copied,copied,1)).rejects.toThrow(/revision/i);
 const edited=structuredClone(binding.source);(edited.extensions!['umf.visual'] as unknown as Visual).question='different';await expect(importGoogleSlidesEdits(binding,edited,copied,copied,0)).rejects.toThrow(/source changed/i);
});

test('unknown source meaning is reported, strict export refuses it, report retains it in the binding',async()=>{
 const doc=source();(doc as unknown as Record<string,unknown>).futureEnvelope={opaque:true};
 const before=await observeGoogleSlides(presentation());await expect(planGoogleSlidesExport(doc,before,placement)).rejects.toThrow(/Strict export refuses/);
 const plan=await planGoogleSlidesExport(doc,before,placement,{mode:'report'});expect(plan.losses.some(loss=>loss.path==='/futureEnvelope')).toBe(true);expect(plan.source.futureEnvelope).toEqual({opaque:true});
});

test('model versions and explicit resource ceilings are honored',async()=>{
 const before=await observeGoogleSlides(presentation());const tooMany=Array.from({length:16},(_,i)=>({id:'n'+i,label:'node '+i}));
 const v11=createVisualDocument({id:'many',kind:'flow',form:'network',question:'q',nodes:tooMany} as Visual,undefined,'1.1.0');
 const boxes=Object.fromEntries(tooMany.map((n,i)=>[n.id,{x:5+i*25,y:100,width:20,height:20}]));
 expect((await planGoogleSlidesExport(v11,before,{question:placement.question,nodes:boxes})).modelVersion).toBe('1.1.0');
 const relabelled=structuredClone(v11);relabelled.vocabularies['umf.visual']!.version='1.0.0';await expect(planGoogleSlidesExport(relabelled,before,{question:placement.question,nodes:boxes})).rejects.toThrow();
});

test('presentation snapshots with revision claims inconsistent with their actual digest are rejected',async()=>{
 const actual=await observeGoogleSlides(presentation());const forged={...actual,captureDigestSha256:'0'.repeat(64)};
 await expect(planGoogleSlidesExport(source(),forged,placement)).rejects.toThrow(/do not match|digest/i);
});

test('stale native revisions never receive an update and empty updates do not issue a write',async()=>{
 const {host,binding}=await exported(),same=structuredClone(binding.source),current=await observeGoogleSlides(await host.api.getPresentation('pres-1'));
 const noOp=await planGoogleSlidesUpdate(binding,binding.source,same,current,{expectedBindingRevision:0});expect(noOp.requests).toHaveLength(0);
 const writesBefore=host.writes.length,returned=await applyGoogleSlidesUpdate(noOp,binding,binding.source,host.api);expect(returned.observation.revisionId).toBe(current.revisionId);expect(returned.binding.bindingRevision).toBe(0);expect(host.writes).toHaveLength(writesBefore);
 const desired=structuredClone(binding.source);(desired.extensions!['umf.visual'] as unknown as Visual).question='Changed';const plan=await planGoogleSlidesUpdate(binding,binding.source,desired,current,{expectedBindingRevision:0});
 host.mutate(snapshot=>{snapshot.slides[0].pageProperties={notesPage:{}};});const writesAfter=host.writes.length;
 await expect(applyGoogleSlidesUpdate(plan,binding,binding.source,host.api)).rejects.toThrow(/changed after update planning/i);expect(host.writes).toHaveLength(writesAfter);
});

test('uncertain host writes are surfaced as interrupted recovery evidence without automatic retry',async()=>{
 const host=fakeApi(),before=await observeGoogleSlides(await host.api.getPresentation('pres-1')),plan=await planGoogleSlidesExport(source(),before,placement),failing:GoogleSlidesHostApi={
  async getPresentation(id){return host.api.getPresentation(id);},async batchUpdate(){throw new Error('connection lost after request submission');}
 };
 await expect(applyGoogleSlidesExport(plan,failing)).rejects.toThrow(/outcome is uncertain/i);expect(host.writes).toHaveLength(0);
});

test('source semantic loss inventories are recomputed and cannot be cleared from the binding',async()=>{
 const doc=source();(doc as unknown as Record<string,unknown>).futureEnvelope={opaque:'unknown'};const host=fakeApi(),before=await observeGoogleSlides(await host.api.getPresentation('pres-1'));
 const plan=await planGoogleSlidesExport(doc,before,placement,{mode:'report'}),applied=await applyGoogleSlidesExport(plan,host.api);
 expect(applied.binding.losses.some(loss=>loss.path==='/futureEnvelope'&&loss.family==='semantic')).toBe(true);
 const current=await observeGoogleSlides(await host.api.getPresentation('pres-1')),noOp=await planGoogleSlidesUpdate(applied.binding,applied.binding.source,applied.binding.source,current,{mode:'report',expectedBindingRevision:0});expect(noOp.requests).toHaveLength(0);
 const edited=structuredClone(applied.binding.source);(edited.extensions!['umf.visual'] as unknown as Visual).question='edited';await expect(planGoogleSlidesUpdate(applied.binding,applied.binding.source,edited,current,{mode:'report',expectedBindingRevision:0})).rejects.toThrow(/complete bound and desired/i);
 const forged=structuredClone(applied.binding);forged.losses=forged.losses.filter(loss=>loss.family!=='semantic');
 await expect(admitGoogleSlidesBinding(forged)).rejects.toThrow(/loss inventory/i);
 await expect(importGoogleSlidesEdits(forged,forged.source,current,current,0)).rejects.toThrow(/loss inventory/i);
 await expect(planGoogleSlidesUpdate(forged,forged.source,forged.source,current,{mode:'report',expectedBindingRevision:0})).rejects.toThrow(/loss inventory/i);
});

test('native text styles are compared and uniform styles are reapplied; mixed-style replacement refuses',async()=>{
 const {host,binding}=await exported(),node=binding.mappings.find(m=>m.kind==='node'&&m.logicalId==='client')!;
 host.mutate(snapshot=>{element(snapshot,node.nativeId).shape.text.textElements=[{endIndex:7,textRun:{content:'Client\n',style:{bold:true,fontSize:{magnitude:16,unit:'PT'}}}}];});
 const current=await observeGoogleSlides(await host.api.getPresentation('pres-1')),desired=structuredClone(binding.source);(desired.extensions!['umf.visual'] as unknown as Visual).nodes![0]!.label='Web client';
 const plan=await planGoogleSlidesUpdate(binding,binding.source,desired,current,{expectedBindingRevision:0});
 expect(plan.requests.some(r=>'updateTextStyle'in (r as object))).toBe(true);expect(plan.requests.find(r=>'updateTextStyle'in (r as object))).toMatchObject({updateTextStyle:{style:{bold:true,fontSize:{magnitude:16,unit:'PT'}},fields:'bold,fontSize'}});
 const applied=await applyGoogleSlidesUpdate(plan,binding,binding.source,host.api),updated=element(host.current(),node.nativeId);expect(updated.shape.text.textElements[0].textRun.style).toMatchObject({bold:true,fontSize:{magnitude:16,unit:'PT'}});
 expect(applied.binding.losses.some(loss=>loss.family==='native'&&loss.path.includes(node.nativeId))).toBe(true);
 const mixedHost=fakeApi(),base=await observeGoogleSlides(await mixedHost.api.getPresentation('pres-1')),freshPlan=await planGoogleSlidesExport(source(),base,placement),fresh=await applyGoogleSlidesExport(freshPlan,mixedHost.api);
 const map=fresh.binding.mappings.find(m=>m.kind==='node'&&m.logicalId==='client')!;mixedHost.mutate(snapshot=>{element(snapshot,map.nativeId).shape.text.textElements=[{textRun:{content:'Client',style:{bold:true}}},{textRun:{content:'\n',style:{bold:false}}}];});
 const mixed=await observeGoogleSlides(await mixedHost.api.getPresentation('pres-1'));
 await expect(planGoogleSlidesUpdate(fresh.binding,fresh.binding.source,desired,mixed,{expectedBindingRevision:0})).rejects.toThrow(/multiple character styles/i);
});

test('connector attachment subfields remain native-only and survive endpoint updates',async()=>{
 const {host,binding}=await exported(),edge=binding.mappings.find(m=>m.kind==='edge')!;
 host.mutate(snapshot=>{const props=element(snapshot,edge.nativeId).line.lineProperties;props.startConnection={...props.startConnection,connectionSiteIndex:7,vendorAttachment:'keep-start'};props.endConnection={...props.endConnection,connectionSiteIndex:9,vendorAttachment:'keep-end'};});
 const current=await observeGoogleSlides(await host.api.getPresentation('pres-1')),desired=structuredClone(binding.source),v=desired.extensions!['umf.visual'] as unknown as Visual;v.edges![0]!.from='service';v.edges![0]!.to='client';
 const plan=await planGoogleSlidesUpdate(binding,binding.source,desired,current,{expectedBindingRevision:0}),request=plan.requests.find(r=>'updateLineProperties'in (r as object)) as any;
 expect(request.updateLineProperties.fields).toBe('startConnection.connectedObjectId,endConnection.connectedObjectId');
 expect(request.updateLineProperties.lineProperties.startConnection).toMatchObject({connectionSiteIndex:7,vendorAttachment:'keep-start'});
 const applied=await applyGoogleSlidesUpdate(plan,binding,binding.source,host.api),properties=element(host.current(),edge.nativeId).line.lineProperties;
 expect(properties.startConnection).toMatchObject({connectionSiteIndex:7,vendorAttachment:'keep-start'});expect(properties.endConnection).toMatchObject({connectionSiteIndex:9,vendorAttachment:'keep-end'});expect(applied.binding.bindingRevision).toBe(1);
});
