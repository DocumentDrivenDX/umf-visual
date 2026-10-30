// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json} from '@umf/core';
import {inspectVisual} from '../../extensions/visual/index.js';
import {canonicalHostJson,copyHostJson,demand,exactKeys,hostDigest,HostBindingError,nonempty,record,sha256} from './json.js';
import type {HostBinding,HostChange,HostLoss,HostObservation,HostPresence,HostReconcileProposal,HostReconcileResult,HostResource,ReconcileFence} from './types.js';
export * from './types.js';
export {canonicalHostJson,copyHostJson,hostDigest,HostBindingError} from './json.js';
const profiles:Record<string,HostResource['host']>={
 'umf.visual.powerpoint.network/1':'powerpoint','umf.visual.google-slides.network/1':'google-slides','umf.visual.miro.editable-network/1':'miro',
};
function resource(value:unknown):asserts value is HostResource {
 demand(record(value),'BINDING','Missing host resource');exactKeys(value,['host','documentId','pageId'],['host','documentId']);
 demand(['powerpoint','google-slides','miro'].includes(String(value.host))&&nonempty(value.documentId)&&(value.pageId===undefined||nonempty(value.pageId)),'BINDING','Invalid resource identity');
}
export async function admitHostObservation(input:unknown):Promise<HostObservation>{
 const value=copyHostJson(input);demand(record(value),'BINDING','Missing native observation');exactKeys(value,['resource','revision','captureDigestSha256','payload']);resource(value.resource);
 demand(record(value.revision),'BINDING','Missing native revision');exactKeys(value.revision,['kind','value']);
 demand(['host-revision','content-digest'].includes(String(value.revision.kind))&&nonempty(value.revision.value),'BINDING','Invalid native revision');
 demand(sha256(value.captureDigestSha256)&&await hostDigest(value.payload)===value.captureDigestSha256,'BINDING','Native capture digest differs from its payload');
 if(value.revision.kind==='content-digest')demand(value.revision.value===value.captureDigestSha256,'BINDING','Content revision must be the actual capture digest');
 return value as unknown as HostObservation;
}
function pointerParts(path:unknown):string[]{
 demand(typeof path==='string'&&(path===''||path.startsWith('/'))&&!/~(?![01])/u.test(path),'INPUT','Invalid JSON Pointer');
 return path===''?[]:path.slice(1).split('/').map(key=>key.replace(/~1/g,'/').replace(/~0/g,'~'));
}
function presence(document:unknown,path:string):HostPresence {
 let value:unknown=document;
 for(const key of pointerParts(path)){
  if(Array.isArray(value)&&(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=value.length))return{present:false};
  if(!value||typeof value!=='object'||!Object.hasOwn(value,key))return{present:false};
  value=(value as Record<string,unknown>)[key];
 }
 return{present:true,value:value as Json};
}
function losses(value:unknown):asserts value is HostLoss[]{
 demand(Array.isArray(value)&&value.length<=10_000,'BINDING','Invalid loss inventory');const seen=new Set<string>();
 for(const loss of value){demand(record(loss),'BINDING','Invalid loss entry');exactKeys(loss,['path','code','family','representation','message']);pointerParts(loss.path);
  demand(nonempty(loss.code)&&nonempty(loss.message)&&['semantic','native'].includes(String(loss.family))&&['retained-only','unrepresented'].includes(String(loss.representation)),'BINDING','Invalid loss classification');
  const key=canonicalHostJson(loss);demand(!seen.has(key),'BINDING','Duplicate loss entry');seen.add(key);
 }
}
/** Structural admission only; each adapter must independently prove native baseline correspondence. */
export async function admitHostBinding(input:unknown):Promise<HostBinding>{
 const value=copyHostJson(input);demand(record(value),'BINDING','Missing host binding');
 exactKeys(value,['profile','modelVersion','resource','bindingRevision','source','sourceDigestSha256','baselineNative','mappings','losses','state','pending'],['profile','modelVersion','resource','bindingRevision','source','sourceDigestSha256','baselineNative','mappings','losses','state']);
 resource(value.resource);demand(typeof value.profile==='string'&&profiles[value.profile]===value.resource.host,'BINDING','Unqualified or mismatched host profile');
 demand(['1.0.0','1.1.0'].includes(String(value.modelVersion))&&Number.isSafeInteger(value.bindingRevision)&&Number(value.bindingRevision)>=0,'BINDING','Invalid model or binding revision');
 demand(record(value.source)&&inspectVisual(value.source as unknown as Document).valid,'BINDING','Invalid visual source');
 const source=value.source as unknown as Document;
 demand(source.vocabularies?.['umf.visual']?.version===value.modelVersion,'BINDING','Binding/source model mismatch');
 const visual=source.extensions?.['umf.visual'];demand(record(visual)&&visual.kind==='flow'&&visual.form==='network'&&Array.isArray(visual.nodes)&&visual.nodes.length<=64&&(!Array.isArray(visual.edges)||visual.edges.length<=256)&&(!Array.isArray(visual.groups)||visual.groups.length<=32),'BINDING','Source exceeds the qualified network profile');
 if(Array.isArray(visual.groups))for(const group of visual.groups){let depth=1,parent=record(group)?group.parent:undefined;while(typeof parent==='string'){demand(++depth<=8,'LIMIT','Group nesting exceeds eight levels');const owner=visual.groups.find(g=>record(g)&&g.id===parent);parent=record(owner)?owner.parent:undefined;}}
 demand(sha256(value.sourceDigestSha256)&&await hostDigest(source)===value.sourceDigestSha256,'BINDING','Source digest differs from admitted document');
 const baseline=await admitHostObservation(value.baselineNative);demand(canonicalHostJson(baseline.resource)===canonicalHostJson(value.resource),'BINDING','Baseline resource mismatch');
 demand(Array.isArray(value.mappings)&&value.mappings.length<=10_000,'BINDING','Invalid native mappings');const logical=new Set<string>(),native=new Set<string>();
 for(const mapping of value.mappings){demand(record(mapping),'IDENTITY','Invalid native mapping');exactKeys(mapping,['logicalId','kind','path','nativeId','nativeScope']);
  demand([mapping.logicalId,mapping.kind,mapping.nativeId,mapping.nativeScope].every(nonempty),'IDENTITY','Missing mapping identity');
  demand(typeof mapping.path==='string'&&presence(source,mapping.path).present,'IDENTITY','Mapped source path is absent');
  const l=canonicalHostJson([mapping.kind,mapping.logicalId,mapping.path]),n=canonicalHostJson([mapping.nativeScope,mapping.nativeId]);demand(!logical.has(l)&&!native.has(n),'IDENTITY','Mapping slots are not bijective');logical.add(l);native.add(n);
 }
 losses(value.losses);demand(['writing','complete','interrupted'].includes(String(value.state)),'BINDING','Invalid write state');
 if(value.state==='complete')demand(value.pending===undefined,'BINDING','Complete binding has a pending write');
 return value as unknown as HostBinding;
}
/** Baseline revision may differ from an edited revision. Fence the two *current* observations. */
export async function checkHostFence(input:unknown,currentDocument:Document,fence:ReconcileFence):Promise<{binding:HostBinding;capture:HostObservation}>{
 const binding=await admitHostBinding(input),current=copyHostJson(currentDocument),safeFence=copyHostJson(fence);
 demand(record(safeFence),'BINDING','Missing reconciliation fence');exactKeys(safeFence as unknown as Record<string,unknown>,['expectedBindingRevision','observedBefore','observedAfter']);
 demand(binding.state==='complete','WRITE_INTERRUPTED','Interrupted or incomplete writes require recovery');
 demand(Number.isSafeInteger(safeFence.expectedBindingRevision)&&safeFence.expectedBindingRevision===binding.bindingRevision,'STALE_BINDING','Binding revision changed');
 demand(await hostDigest(current)===binding.sourceDigestSha256,'STALE_SOURCE','UMF source changed since this binding');
 const before=await admitHostObservation(safeFence.observedBefore),after=await admitHostObservation(safeFence.observedAfter);
 demand(canonicalHostJson(before.resource)===canonicalHostJson(binding.resource)&&canonicalHostJson(after.resource)===canonicalHostJson(binding.resource),'BINDING','Current resource differs from binding');
 demand(canonicalHostJson(before.revision)===canonicalHostJson(after.revision)&&before.captureDigestSha256===after.captureDigestSha256,'CONCURRENT_EDIT','Current native observations disagree');
 return{binding,capture:after};
}
function admitPresence(input:unknown):asserts input is HostPresence {
 demand(record(input)&&typeof input.present==='boolean','INPUT','Invalid presence-aware change');exactKeys(input,input.present?['present','value']:['present']);
}
function applyChange(document:Document,change:HostChange):void {
 demand(record(change),'INPUT','Invalid semantic patch');exactKeys(change as unknown as Record<string,unknown>,['path','before','after']);admitPresence(change.before);admitPresence(change.after);
 demand(/^\/extensions\/umf\.visual\/(title|question|nodes\/(0|[1-9]\d*)\/label|edges\/(0|[1-9]\d*)\/(label|from|to))$/.test(change.path),'UNSAFE_EDIT','Unqualified semantic edit',change.path);
 demand(canonicalHostJson(presence(document,change.path))===canonicalHostJson(change.before),'STALE_SOURCE','Patch baseline differs',change.path);
 if(change.after.present)demand(typeof change.after.value==='string','UNSAFE_EDIT','Qualified edit must contain plain text',change.path);
 const parts=pointerParts(change.path),key=parts.pop()!,parent=presence(document,'/'+parts.map(p=>p.replaceAll('~','~0').replaceAll('/','~1')).join('/'));
 demand(parent.present&&record(parent.value),'UNSAFE_EDIT','Patch owner is absent',change.path);
 if(change.after.present)Object.defineProperty(parent.value,key,{value:copyHostJson(change.after.value),enumerable:true,writable:true,configurable:true});else delete parent.value[key];
}
export async function finishHostReconciliation(input:unknown,currentDocument:Document,fence:ReconcileFence,proposal:HostReconcileProposal):Promise<HostReconcileResult>{
 let binding:HostBinding|undefined,capture:HostObservation|undefined;
 try{
  binding=await admitHostBinding(input);const current=copyHostJson(currentDocument),safeFence=copyHostJson(fence);capture=await admitHostObservation(safeFence.observedAfter);
  const safe=copyHostJson(proposal);({binding,capture}=await checkHostFence(binding,current,safeFence));
  demand(record(safe),'INPUT','Missing reconciliation proposal');exactKeys(safe as unknown as Record<string,unknown>,['document','changes','nativeOnlyChanges','losses'],['document','changes','nativeOnlyChanges']);
  demand(Array.isArray(safe.changes)&&safe.changes.length<=1024&&Array.isArray(safe.nativeOnlyChanges)&&safe.nativeOnlyChanges.every(nonempty),'LIMIT','Invalid change inventory');
  if(safe.changes.length)demand(inspectVisual(current).complete,'UNSAFE_EDIT','Unknown source meaning prevents semantic adoption');
  const expected=copyHostJson(binding.source),paths=new Set<string>();for(const change of safe.changes){demand(!paths.has(change.path),'INPUT','Duplicate semantic patch');demand(binding.mappings.some(mapping=>change.path===mapping.path||change.path.startsWith(mapping.path+'/')),'IDENTITY','Semantic patch has no owned native mapping',change.path);paths.add(change.path);applyChange(expected,change);}
  demand(canonicalHostJson(expected)===canonicalHostJson(safe.document),'UNSAFE_EDIT','Proposed document contains undeclared edits');
  demand(inspectVisual(expected).valid,'VISUAL_INVALID','Native edits violate visual semantics');
  const nextLosses=safe.losses??binding.losses;losses(nextLosses);
  for(const prior of binding.losses)demand(nextLosses.some(loss=>canonicalHostJson(loss)===canonicalHostJson(prior)),'UNSAFE_EDIT','These edit classes cannot erase prior loss entries',prior.path);
  demand(binding.bindingRevision<Number.MAX_SAFE_INTEGER,'LIMIT','Binding revision exhausted');
  const next:HostBinding={...binding,source:expected,sourceDigestSha256:await hostDigest(expected),baselineNative:capture,bindingRevision:binding.bindingRevision+1,losses:copyHostJson(nextLosses)};
  return{ok:true,document:expected,binding:await admitHostBinding(next),capture,changes:safe.changes,nativeOnlyChanges:safe.nativeOnlyChanges,losses:copyHostJson(nextLosses),diagnostics:[]};
 }catch(error){
  const e=error instanceof HostBindingError?error:new HostBindingError('INPUT',error instanceof Error?error.message:'Invalid reconciliation input');
  return{ok:false,...(binding?{original:copyHostJson(binding.source),binding}:{}),...(capture?{capture}:{}),diagnostics:[{code:e.code,path:e.path,message:e.message}]};
 }
}
