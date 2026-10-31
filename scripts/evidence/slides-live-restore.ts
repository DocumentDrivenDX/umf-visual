// SPDX-License-Identifier: MIT OR Apache-2.0
// Operator-driven connector transport: each adapter request is dispatched to the
// connected Slides API, never satisfied by a replayed synthetic observation.
import {readVisualDocument,writeVisualDocument} from '../../src/index.js';
import {mkdir} from 'node:fs/promises';
import {applyGoogleSlidesExport, applyGoogleSlidesUpdate, importGoogleSlidesEdits, observeGoogleSlides, planGoogleSlidesExport, planGoogleSlidesUpdate} from '../../src/adapters/google-slides/index.js';
import {hostDigest} from '../../src/adapters/reconciliation/json.js';
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
const receipts:any[]=await Bun.file(dir+'/receipts.json').json();
try{
 for(const receipt of receipts){
  const id=receipt.id;
  const final=await Bun.file(dir+'/'+id+'-final.json').json();
  const sourceBytes=await Bun.file('fixtures/integrations/complex-miro/common/'+id+'.json').text();
  const source=JSON.parse(sourceBytes);
  let current=await observeGoogleSlides(await api.getPresentation(presentationId));
  let binding=final.binding, document=final.document;
  const v=document.extensions['umf.visual'];
  const firstNode=binding.mappings.find((m:any)=>m.kind==='node');
  const edge=binding.mappings.find((m:any)=>m.kind==='edge');
  const from=binding.mappings.find((m:any)=>m.kind==='node'&&m.logicalId===v.edges[0].from);
  const to=binding.mappings.find((m:any)=>m.kind==='node'&&m.logicalId===v.edges[0].to);
  const element=(current.snapshot.slides.find((s:any)=>s.objectId===receipt.slideId) as any).pageElements.find((e:any)=>e.objectId===firstNode.nativeId);
  const transform={...element.transform,translateX:element.transform.translateX+(element.transform.unit==='EMU'?38100:3)};
  const edits:any[]=[{updatePageElementTransform:{objectId:firstNode.nativeId,applyMode:'ABSOLUTE',transform}}];
  if(!receipt.roundTrip.reconnection)edits.push({updateLineProperties:{objectId:edge.nativeId,lineProperties:{startConnection:{connectedObjectId:to.nativeId,connectionSiteIndex:0},endConnection:{connectedObjectId:from.nativeId,connectionSiteIndex:0}},fields:'startConnection,endConnection'}});
  await api.batchUpdate(presentationId,{requests:edits,writeControl:{requiredRevisionId:current.revisionId}});
  const currentBefore=await observeGoogleSlides(await api.getPresentation(presentationId));
  current=await observeGoogleSlides(await api.getPresentation(presentationId));
  const imported=await importGoogleSlidesEdits(binding,document,currentBefore,current,binding.bindingRevision);
  if(!receipt.roundTrip.reconnection&&!imported.changes.some(c=>c.path.endsWith('/to')))throw new Error('Endpoint reversal missing');
  const yaml=writeVisualDocument(imported.document,'yaml');
  await Bun.write(dir+'/'+id+'-source.yaml',yaml);
  const persisted=readVisualDocument(await Bun.file(dir+'/'+id+'-source.yaml').text(),'yaml');
  if(await hostDigest(persisted)!==await hostDigest(imported.document))throw Error('YAML persistence lost meaning');
  const plan=await planGoogleSlidesUpdate(imported.binding,persisted,source,current,{mode:'report',expectedBindingRevision:imported.binding.bindingRevision});
  const restored=await applyGoogleSlidesUpdate(plan,imported.binding,persisted,api);
  const afterBefore=await observeGoogleSlides(await api.getPresentation(presentationId));
  const after=await observeGoogleSlides(await api.getPresentation(presentationId));
  const checked=await importGoogleSlidesEdits(restored.binding,source,afterBefore,after,restored.binding.bindingRevision);
  if(checked.changes.length)throw Error('Restored original source readback differs');
  const moved=(after.snapshot.slides.find((s:any)=>s.objectId===receipt.slideId) as any).pageElements.find((e:any)=>e.objectId===firstNode.nativeId);
  if(moved.transform.translateX!==transform.translateX)throw Error('Movement not preserved');
  if(!JSON.stringify(moved.shape.text).includes('"bold":true'))throw Error('Bold not preserved');
  receipt.sourceDigestSha256=await hostDigest(source);
  receipt.sourceSha256=new Bun.CryptoHasher('sha256').update(sourceBytes).digest('hex');
  receipt.roundTrip.reconnection=true;receipt.roundTrip.yamlPersistence=true;receipt.roundTrip.movementDelta={value:3,unit:'PT'};
  receipt.restoreCaptureFences={nativeImport:{before:{revision:currentBefore.revisionId,captureDigestSha256:currentBefore.captureDigestSha256},after:{revision:current.revisionId,captureDigestSha256:current.captureDigestSha256}},finalReadback:{before:{revision:afterBefore.revisionId,captureDigestSha256:afterBefore.captureDigestSha256},after:{revision:after.revisionId,captureDigestSha256:after.captureDigestSha256}}};
  receipt.preview={revision:after.revisionId,stage:'restored-original',captureDigestSha256:after.captureDigestSha256};
  await Bun.write(dir+'/'+id+'-restored.json',JSON.stringify({binding:restored.binding,observation:after,document:source},null,2));
  await Bun.write(dir+'/receipts.json',JSON.stringify(receipts,null,2));
  console.log(JSON.stringify({restored:id}));
 }
}catch(error){console.error(error);process.exitCode=1;}finally{server.stop();}
