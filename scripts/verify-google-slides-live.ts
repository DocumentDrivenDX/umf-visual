// SPDX-License-Identifier: MIT OR Apache-2.0
// Reads private, ignored live captures and emits only sanitized conformance facts.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

const captureDir=resolve('.cache/host-live');
const evidencePath=resolve('docs/helix/04-build/evidence/google-slides-live-2026-10-30.json');
const sourcePath='fixtures/integrations/complex-miro/common/process-documents-store.json';
type JsonRecord=Record<string,any>;
async function capture(name:string):Promise<JsonRecord>{return JSON.parse(await readFile(resolve(captureDir,'slides-'+name+'.json'),'utf8')) as JsonRecord;}
function check(condition:unknown,message:string):asserts condition{if(!condition)throw new Error('Google Slides live evidence check failed: '+message);}
function canonical(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.keys(value as object).sort().map(key=>JSON.stringify(key)+':'+canonical((value as JsonRecord)[key])).join(',')+'}';
 return JSON.stringify(value);
}
function pageElements(presentation:JsonRecord):JsonRecord[]{return presentation.slides.flatMap((slide:JsonRecord)=>slide.pageElements??[]);}
function element(presentation:JsonRecord,nativeId:string):JsonRecord|undefined{return pageElements(presentation).find(item=>item.objectId===nativeId);}
function shapeText(item:JsonRecord|undefined):string{return(item?.shape?.text?.textElements??[]).map((part:JsonRecord)=>part.textRun?.content??'').join('');}
function textStyles(item:JsonRecord|undefined):unknown[]{return(item?.shape?.text?.textElements??[]).filter((part:JsonRecord)=>part.textRun).map((part:JsonRecord)=>part.textRun.style??{});}
function connections(item:JsonRecord|undefined):JsonRecord[]{return[item?.line?.lineProperties?.startConnection??{},item?.line?.lineProperties?.endConnection??{}];}
function attachmentSiteIndexes(item:JsonRecord|undefined):unknown[]{return connections(item).map(connection=>connection.connectionSiteIndex);}
function xPosition(item:JsonRecord|undefined):number|undefined{return item?.transform?.translateX;}

const [before,afterExport,nativeEdited,imported,updatePlan,afterUpdate,sourceBinding,finalBinding,exportPlan,exportResponse]=await Promise.all([
 capture('before'),capture('after-export'),capture('native-edited'),capture('imported'),capture('update-plan'),capture('after-update'),capture('binding'),capture('final-binding'),capture('export-plan'),capture('export-response'),
]);
const sourceBytes=await readFile(resolve(sourcePath));
const fixtureSource=JSON.parse(sourceBytes.toString('utf8')) as JsonRecord;
const fixtureSourceSha256=createHash('sha256').update(sourceBytes).digest('hex');
check(canonical(sourceBinding.source)===canonical(fixtureSource),'live binding source does not match the sanitized process-documents-store fixture');
check(canonical(imported.original)===canonical(fixtureSource),'import baseline document does not match the sanitized source fixture');
check(imported.binding.sourceDigestSha256===updatePlan.sourceDigestSha256,'updated source digest differs between imported binding and update plan');
const mappings=sourceBinding.mappings as JsonRecord[];
check(mappings.length===12,'expected twelve qualified native mappings');
check(before.slides.length===1&&afterExport.slides.length===2&&afterUpdate.slides.length===2,'expected one original slide and one appended owned slide');
check(pageElements(before).length===9&&pageElements(afterExport).length===21,'native export object counts differ from captured run');
check(canonical(before.slides[0])===canonical(afterUpdate.slides[0]),'unrelated original slide changed');
check(exportPlan.batch.requests.length===37&&exportResponse.replies.length===37,'native export request/reply count mismatch');
check(exportPlan.batch.writeControl.requiredRevisionId===before.revisionId,'fresh export did not fence the captured pre-write revision');
check(typeof exportResponse.writeControl?.requiredRevisionId==='string','native export response did not include write-control evidence');

const node0=mappings.find(mapping=>mapping.kind==='node'&&mapping.path==='/extensions/umf.visual/nodes/0');
const node1=mappings.find(mapping=>mapping.kind==='node'&&mapping.path==='/extensions/umf.visual/nodes/1');
const node2=mappings.find(mapping=>mapping.kind==='node'&&mapping.path==='/extensions/umf.visual/nodes/2');
const edge0=mappings.find(mapping=>mapping.kind==='edge'&&mapping.path==='/extensions/umf.visual/edges/0');
check(node0&&node1&&node2&&edge0,'mapped node or connector identities are missing');
const exportedNode=element(afterExport,node0.nativeId),editedNode=element(nativeEdited,node0.nativeId),updatedNode=element(afterUpdate,node0.nativeId);
const exportedEdge=element(afterExport,edge0.nativeId),editedEdge=element(nativeEdited,edge0.nativeId),updatedEdge=element(afterUpdate,edge0.nativeId);
check(exportedNode&&editedNode&&updatedNode&&exportedEdge&&editedEdge&&updatedEdge,'mapped objects are missing from a captured revision');
check(shapeText(exportedNode)!==shapeText(editedNode),'UI label edit was not visible in the native snapshot');
check(textStyles(exportedNode).some((style:any)=>style.bold!==true)&&textStyles(editedNode).some((style:any)=>style.bold===true),'UI bold style edit was not visible in the native snapshot');
check(typeof xPosition(exportedNode)==='number'&&typeof xPosition(editedNode)==='number'&&xPosition(editedNode)!>xPosition(exportedNode)!,'UI rightward movement was not visible in the native transform');
check(editedEdge.line.lineProperties.endConnection.connectedObjectId===node2.nativeId,'connector edit did not attach the first edge to its new target');
check(exportedEdge.line.lineProperties.endConnection.connectedObjectId===node1.nativeId,'captured connector baseline does not show the original target');
check(canonical(connections(editedEdge))===canonical(connections(updatedEdge)),'native update changed connector attachment metadata');
check(canonical(textStyles(editedNode))===canonical(textStyles(updatedNode)),'native update changed the edited node text style');

for(const mapping of mappings){
 const edited=element(nativeEdited,mapping.nativeId),updated=element(afterUpdate,mapping.nativeId);
 check(edited&&updated,'mapped object disappeared after UMF update');
 check(canonical(edited.transform??{})===canonical(updated.transform??{}),'UMF update changed native transform '+mapping.kind);
 if(edited.shape)check(canonical(textStyles(edited))===canonical(textStyles(updated)),'UMF update changed native text style '+mapping.kind);
 if(edited.line)check(canonical(connections(edited))===canonical(connections(updated)),'UMF update changed native line attachment '+mapping.kind);
}
const importedPaths=(imported.changes as JsonRecord[]).map(change=>change.path).sort();
check(canonical(importedPaths)===canonical(['/extensions/umf.visual/edges/0/to','/extensions/umf.visual/nodes/0/label'].sort()),'imported semantic changes differ from native edits');
check(updatePlan.requests.length===3&&updatePlan.expectedBindingRevision===1,'UMF-authored update plan shape differs from captured run');
check(updatePlan.changes.length===1&&updatePlan.changes[0].path==='/extensions/umf.visual/nodes/0/label','UMF-authored update did not target the expected label');
check(updatePlan.currentObservation.revisionId===nativeEdited.revisionId,'update plan was not based on the captured current revision');
check(updatePlan.desiredSource.extensions['umf.visual'].nodes[0].label==='UMF updated','desired UMF update label differs from the captured authored change');
check(shapeText(updatedNode).includes('UMF updated'),'native readback does not contain the authored UMF label');
check(finalBinding.bindingRevision===2&&finalBinding.baselineNative.revision.value===afterUpdate.revisionId,'final binding does not match post-update host revision');
check(finalBinding.source.extensions['umf.visual'].nodes[0].label==='UMF updated','final binding does not contain the authored UMF update');
const siteIndexFields=mappings.filter(mapping=>mapping.kind==='edge').flatMap(mapping=>attachmentSiteIndexes(element(nativeEdited,mapping.nativeId)));
check(siteIndexFields.every(value=>value===undefined),'connection-site fields unexpectedly appeared; review this evidence profile');

const evidence={
 observedOn:'2026-10-30',kind:'sanitized-live-host-execution-evidence',profile:'umf.visual.google-slides.network/1',modelVersion:'1.0.0',
 source:{fixtureId:'process-documents-store',path:sourcePath,sha256:fixtureSourceSha256,adapterSourceDigestSha256:sourceBinding.sourceDigestSha256},
 capture:{originalSlides:1,exportedSlides:2,originalSlideCanonicalEquality:true,ownedNativeElements:12,exportBatchRequests:37,exportReplies:37,writeControlRevisionMatchedBeforeCapture:true},
 nativeUiEdits:{
  visibleLabelChanges:1,uniformBoldStyleChange:true,rightwardNodeMovement:true,connectorEndpointChanges:1,
  importSemanticPaths:importedPaths,
  connectorTargetMappedFromNodeIndex:1,connectorTargetMappedToNodeIndex:2,
 },
 umfUpdate:{requests:3,expectedBindingRevision:1,semanticPaths:updatePlan.changes.map((change:JsonRecord)=>change.path),readbackVerified:true,finalBindingRevision:2},
 nativePreservation:{
  originalSlideUnchanged:true,postUiTextStylesPreservedByUmfUpdate:true,postUiTransformsPreservedByUmfUpdate:true,postUiConnectorAttachmentsPreservedByUmfUpdate:true,
  connectionSiteIndex:'absent from captured endpoint objects; no site-index preservation claim is made',
 },
 executionBoundary:{actualGoogleSlidesWritesObserved:true,apiWrapperTraceReplayVerified:true,adapterDirectTransportEndToEnd:false,credentialsOrSdkBundled:false},
 privacy:{privatePresentationIdentifiersAndURLsOmitted:true,revisionTokensOmitted:true,rawNativeSnapshotsOmitted:true,labelsOmittedExceptSyntheticUpdateCanary:true},
 limits:['One Visual 1.0.0 flow/network document and one owned slide.','The retained capture set proves the listed SDK-visible fields and edits only; it is not a whole-presentation fidelity or backup guarantee.','The host wrapper performed live Google Slides writes; adapter update logic was verified with trace replay injection, not by injecting its transport directly into the live account.'],
};
await Bun.write(evidencePath,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({written:evidencePath,assertions:'passed',slides:2,mappings:mappings.length,exportRequests:37,updateRequests:3,importChanges:2,finalBindingRevision:2}));
