// SPDX-License-Identifier: MIT OR Apache-2.0
// Operator-driven connector transport: each adapter request is dispatched to the
// connected Slides API, never satisfied by a replayed synthetic observation.
import {mkdir} from 'node:fs/promises';
import {applyGoogleSlidesExport, applyGoogleSlidesUpdate, importGoogleSlidesEdits, observeGoogleSlides, planGoogleSlidesExport, planGoogleSlidesUpdate} from '../../src/adapters/google-slides/index.js';
import {hostDigest} from '../../src/adapters/reconciliation/json.js';
import {readVisualDocument,writeVisualDocument} from '../../src/index.js';
const dir='.cache/p12-slides'; await mkdir(dir,{recursive:true});
const presentationId=process.env.UMF_SLIDES_PRESENTATION_ID;
if(!presentationId)throw new Error('Set UMF_SLIDES_PRESENTATION_ID to an explicitly authorized synthetic test presentation.');
let sequence=0, pending:any=null, resolvePending:any=null;
async function rpc(method:string,args:any):Promise<any>{
 if(pending)throw new Error('Concurrent connector request');
 const id=++sequence;
 return await new Promise((resolve)=>{pending={id,method,args};resolvePending=resolve;});
}
const server=Bun.serve({hostname:'127.0.0.1',port:4183,async fetch(req){
 const url=new URL(req.url);
 if(url.pathname==='/next')return Response.json(pending??{idle:true});
 if(url.pathname==='/result'&&req.method==='POST'){
  const r=await req.json();if(r.id!==pending?.id)return new Response('Wrong request',{status:409});
  const callback=resolvePending; pending=null; resolvePending=null;callback(r.value);return Response.json({ok:true});
 }
 return new Response('Operator connector bridge');
}});
const api={getPresentation:(id:string)=>rpc('get',{presentation_id:id}),batchUpdate:(id:string,batch:any)=>rpc('batch',{presentation_id:id,requests:batch.requests,write_control:batch.writeControl})};
const manifest=await Bun.file('fixtures/integrations/complex-miro/manifest.json').json();
const receipts:any[]=[];
try{
 for(const [index,item] of manifest.cases.filter((x:any)=>x.commonVisualPath).entries()){
  const sourceBytes=await Bun.file('fixtures/integrations/complex-miro/'+item.commonVisualPath).bytes();
  const source=JSON.parse(new TextDecoder().decode(sourceBytes));
  const v=source.extensions['umf.visual'];const nodes=v.nodes;
  const before=await observeGoogleSlides(await api.getPresentation(presentationId));
  const columns=Math.min(4,nodes.length), rows=Math.ceil(nodes.length/columns), width=850/columns, height=Math.min(94,350/rows);
  const boxes:any={};nodes.forEach((n:any,i:number)=>boxes[n.id]={x:45+i%columns*width,y:135+Math.floor(i/columns)*height,width:width-38,height:45});
  const labels:any={};for(const [i,e] of (v.edges??[]).entries())if(e.label!==undefined){const a=boxes[e.from],b=boxes[e.to];labels[e.id]={x:Math.min(800,(a.x+b.x)/2),y:Math.min(495,(a.y+b.y)/2+46+(i%2)*14),width:115,height:25};}
  const placement={title:{x:35,y:12,width:890,height:42},question:{x:35,y:62,width:890,height:54},nodes:boxes,edgeLabels:labels};
  const plan=await planGoogleSlidesExport(source,before,placement,{mode:'report',namespace:'p12s'+index});
  await Bun.write(dir+'/'+item.id+'-export-plan.json',JSON.stringify(plan,null,2));
  const exported=await applyGoogleSlidesExport(plan,api);await Bun.write(dir+'/'+item.id+'-exported.json',JSON.stringify(exported,null,2));
  const freshBefore=await observeGoogleSlides(await api.getPresentation(presentationId));
  const fresh=await observeGoogleSlides(await api.getPresentation(presentationId));
  const noop=await importGoogleSlidesEdits(exported.binding,source,freshBefore,fresh,0);
  if(noop.changes.length)throw new Error('No-op import changed source');
  const node=exported.binding.mappings.find(m=>m.kind==='node')!;
  const edge=exported.binding.mappings.find(m=>m.kind==='edge')!;
  const replacement=exported.binding.mappings.find(m=>m.kind==='node'&&m.logicalId!==v.edges[0].from&&m.logicalId!==v.edges[0].to);
  const element=(fresh.snapshot.slides.find((s:any)=>s.objectId===plan.slideId) as any).pageElements.find((e:any)=>e.objectId===node.nativeId);
  const transform={...element.transform,translateX:element.transform.translateX+3};
  const edits:any[]=[{deleteText:{objectId:node.nativeId,textRange:{type:'ALL'}}},{insertText:{objectId:node.nativeId,text:'Native '+nodes[0].label,insertionIndex:0}},{updateTextStyle:{objectId:node.nativeId,textRange:{type:'ALL'},style:{bold:true},fields:'bold'}},{updatePageElementTransform:{objectId:node.nativeId,applyMode:'ABSOLUTE',transform}}];
  if(replacement)edits.push({updateLineProperties:{objectId:edge.nativeId,lineProperties:{endConnection:{connectedObjectId:replacement.nativeId,connectionSiteIndex:0}},fields:'endConnection'}});
  await api.batchUpdate(presentationId,{requests:edits,writeControl:{requiredRevisionId:fresh.revisionId}});
  const editedBefore=await observeGoogleSlides(await api.getPresentation(presentationId));
  const edited=await observeGoogleSlides(await api.getPresentation(presentationId));
  const imported=await importGoogleSlidesEdits(exported.binding,source,editedBefore,edited,0);
  if(!imported.changes.some(c=>c.path.endsWith('/label')))throw new Error('Missing native label import');
  if(replacement&&!imported.changes.some(c=>c.path.endsWith('/to')))throw new Error('Missing native endpoint import');
  await Bun.write(dir+'/'+item.id+'-imported.json',JSON.stringify(imported,null,2));
  await Bun.write(dir+'/'+item.id+'-source.json',JSON.stringify(imported.document,null,2));
  const persisted=await Bun.file(dir+'/'+item.id+'-source.json').json();
  const yaml=writeVisualDocument(persisted,'yaml');await Bun.write(dir+'/'+item.id+'-source.yaml',yaml);
  if(await hostDigest(readVisualDocument(yaml,'yaml'))!==await hostDigest(imported.document))throw new Error('YAML persistence lost meaning');
  const desired=structuredClone(persisted);desired.extensions['umf.visual'].question+=' Preserving update verified.';
  const update=await planGoogleSlidesUpdate(imported.binding,persisted,desired,edited,{mode:'report',expectedBindingRevision:imported.binding.bindingRevision});
  const updated=await applyGoogleSlidesUpdate(update,imported.binding,persisted,api);
  const finalBefore=await observeGoogleSlides(await api.getPresentation(presentationId));
  const final=await observeGoogleSlides(await api.getPresentation(presentationId));
  const finalImport=await importGoogleSlidesEdits(updated.binding,desired,finalBefore,final,updated.binding.bindingRevision);
  if(finalImport.changes.length)throw new Error('Updated native readback differs');
  const finalElement=(final.snapshot.slides.find((s:any)=>s.objectId===plan.slideId) as any).pageElements.find((e:any)=>e.objectId===node.nativeId);
  if(JSON.stringify(finalElement.transform)!==JSON.stringify((edited.snapshot.slides.find((s:any)=>s.objectId===plan.slideId) as any).pageElements.find((e:any)=>e.objectId===node.nativeId).transform))throw new Error('Native movement lost');
  if(!JSON.stringify(finalElement.shape.text).includes('"bold":true'))throw new Error('Native bold style lost');
  await Bun.write(dir+'/'+item.id+'-final.json',JSON.stringify({binding:updated.binding,observation:final,document:desired},null,2));
  const fence=(a:typeof fresh,b:typeof fresh)=>({before:{revision:a.revisionId,captureDigestSha256:a.captureDigestSha256},after:{revision:b.revisionId,captureDigestSha256:b.captureDigestSha256}});
  const receipt={id:item.id,sourceSha256:new Bun.CryptoHasher('sha256').update(sourceBytes).digest('hex'),sourceDigestSha256:await hostDigest(source),modelVersion:plan.modelVersion,profileId:plan.profile,mappingVersion:'1',slideId:plan.slideId,losses:plan.losses,roundTrip:{transport:'direct connected Slides API through injected adapter',editMethod:'native Slides API; no UI-edit claim',noop:true,label:true,reconnection:!!replacement,movement:true,style:true,jsonPersistence:true,yamlPersistence:true,preservingUpdate:true,readback:true,changePaths:imported.changes.map(c=>c.path)},captureFences:{noop:fence(freshBefore,fresh),nativeImport:fence(editedBefore,edited),finalReadback:fence(finalBefore,final)},preview:{revision:exported.observation.revisionId,stage:'export',captureDigestSha256:exported.observation.captureDigestSha256}};
  receipts.push(receipt);await Bun.write(dir+'/receipts.json',JSON.stringify(receipts,null,2));
  console.log(JSON.stringify({completed:item.id,slideId:plan.slideId}));
 }
 console.log('All five native Slides cycles passed');
}catch(error){console.error(error);process.exitCode=1;}finally{server.stop();}
