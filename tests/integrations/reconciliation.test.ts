// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {readJsonValue,writeJsonValue,type Json} from '@umf/core';
import {createVisualDocument,inspectVisual} from '../../src';
import {admitHostBinding,admitHostObservation,canonicalHostJson,checkHostFence,copyHostJson,finishHostReconciliation,hostDigest,type HostBinding,type HostChange,type HostObservation,type HostReconcileProposal,type ReconcileFence} from '../../src/adapters/reconciliation';

async function fixture(){
 const document=createVisualDocument({id:'editable',kind:'flow',form:'network',question:'What connects?',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],edges:[{id:'e',from:'a',to:'b'}]});
 const resource={host:'google-slides' as const,documentId:'synthetic-deck',pageId:'slide-1'};
 const observe=async(payload:Json,revision='r1'):Promise<HostObservation>=>({resource,revision:{kind:'host-revision',value:revision},payload,captureDigestSha256:await hostDigest(payload)});
 const baseline=await observe({nodes:[{id:'native-a',text:'A'},{id:'native-b',text:'B'}],edge:{id:'native-e',from:'native-a',to:'native-b'},futureNative:{kept:'unknown'}});
 const binding:HostBinding={profile:'umf.visual.google-slides.network/1',modelVersion:'1.0.0',resource,bindingRevision:0,source:document,sourceDigestSha256:await hostDigest(document),baselineNative:baseline,mappings:[
  {logicalId:'editable',kind:'question',path:'/extensions/umf.visual/question',nativeId:'native-q',nativeScope:'slide-1'},
  ...['a','b'].map((id,i)=>({logicalId:id,kind:'node',path:'/extensions/umf.visual/nodes/'+i,nativeId:'native-'+id,nativeScope:'slide-1'})),
  {logicalId:'e',kind:'edge',path:'/extensions/umf.visual/edges/0',nativeId:'native-e',nativeScope:'slide-1'},
 ],losses:[],state:'complete'};
 const observation=await observe({nodes:[{id:'native-a',text:'Browser'},{id:'native-b',text:'B'}],edge:{id:'native-e',from:'native-b',to:'native-a'},futureNative:{kept:'unknown',added:[1,2]}},'r2');
 const fence:ReconcileFence={expectedBindingRevision:0,observedBefore:observation,observedAfter:observation};
 return{document,binding,baseline,observation,fence,observe};
}
const labelChange:HostChange={path:'/extensions/umf.visual/nodes/0/label',before:{present:true,value:'A'},after:{present:true,value:'Browser'}};
function proposalFor(document:any):HostReconcileProposal {
 const next=copyHostJson(document);next.extensions['umf.visual'].nodes[0].label='Browser';
 return{document:next,changes:[copyHostJson(labelChange)],nativeOnlyChanges:['/futureNative/added']};
}
test('edited native revision is permitted while two current observations and current source are fenced',async()=>{
 const f=await fixture(),original=canonicalHostJson(f.binding),result=await finishHostReconciliation(f.binding,f.document,f.fence,proposalFor(f.document));
 expect(result.ok).toBe(true);if(!result.ok)return;
 expect(result.binding.bindingRevision).toBe(1);expect(result.binding.baselineNative.revision.value).toBe('r2');
 expect(result.binding.baselineNative.payload).toEqual(f.observation.payload);expect(result.nativeOnlyChanges).toEqual(['/futureNative/added']);
 expect(canonicalHostJson(f.binding)).toBe(original);expect(result.document).not.toBe(f.document);
 for(const format of ['json','yaml'] as const){const persisted=readJsonValue(writeJsonValue(result.binding as unknown as Json,format),format);expect(await admitHostBinding(persisted)).toEqual(result.binding);}
});
test('current-observation digest/revision, source, binding and interrupted-write conflicts refuse atomically',async()=>{
 const f=await fixture(),changed=copyHostJson(f.document);(changed.extensions!['umf.visual'] as any).question='Edited locally';
 const revised=await f.observe(f.observation.payload,'r3');
 const cases:Array<[string,HostBinding,typeof f.document,ReconcileFence]>=[
  ['STALE_SOURCE',f.binding,changed,f.fence],
  ['STALE_BINDING',f.binding,f.document,{...f.fence,expectedBindingRevision:1}],
  ['CONCURRENT_EDIT',f.binding,f.document,{...f.fence,observedAfter:revised}],
  ['CONCURRENT_EDIT',f.binding,f.document,{...f.fence,observedAfter:await f.observe({different:'capture'},'r2')}],
  ['WRITE_INTERRUPTED',{...f.binding,state:'interrupted'},f.document,f.fence],
 ];
 for(const[code,binding,current,fence]of cases){const result=await finishHostReconciliation(binding,current,fence,proposalFor(f.document));expect(result.ok).toBe(false);if(result.ok)continue;expect(result.diagnostics[0].code).toBe(code);expect('document'in result).toBe(false);expect(result.original).toEqual(f.document);expect(result.capture).toEqual(fence.observedAfter);}
});
test('admission rejects forged digests, model/profile/resource mismatches and duplicate mapping slots',async()=>{
 const f=await fixture();
 const bad:unknown[]=[{...f.binding,sourceDigestSha256:'0'.repeat(64)},{...f.binding,modelVersion:'1.1.0'},{...f.binding,profile:'umf.visual.miro.editable-network/1'},{...f.binding,baselineNative:{...f.baseline,resource:{...f.baseline.resource,documentId:'other'}}},{...f.binding,mappings:[...f.binding.mappings,f.binding.mappings[0]]},{...f.binding,unexpected:'ignored meaning'}];
 for(const input of bad)await expect(admitHostBinding(input)).rejects.toBeInstanceOf(Error);
 await expect(admitHostObservation({...f.observation,captureDigestSha256:'0'.repeat(64)})).rejects.toThrow();
 await expect(admitHostObservation({...f.observation,revision:{kind:'content-digest',value:'truthy-not-a-digest'}})).rejects.toThrow();
 expect((await admitHostObservation({...f.observation,revision:{kind:'content-digest',value:f.observation.captureDigestSha256}})).payload).toEqual(f.observation.payload);
});
test('whole-document reconstruction refuses undeclared edits, identity edits, stale patches and unowned paths',async()=>{
 const f=await fixture(),hidden=proposalFor(f.document);(hidden.document.extensions!['umf.visual'] as any).question='Undeclared';
 const unowned=copyHostJson(f.binding);unowned.mappings=unowned.mappings.filter(m=>m.logicalId!=='a');
 const cases:Array<[HostBinding,HostReconcileProposal]>=[
  [f.binding,hidden],
  [f.binding,{...proposalFor(f.document),changes:[{...labelChange,path:'/extensions/umf.visual/nodes/0/id'}]}],
  [f.binding,{...proposalFor(f.document),changes:[{...labelChange,before:{present:true,value:'Wrong baseline'}}]}],
  [f.binding,{...proposalFor(f.document),changes:[labelChange,labelChange]}],
  [unowned,proposalFor(f.document)],
 ];
 for(const[binding,proposal]of cases){const result=await finishHostReconciliation(binding,f.document,f.fence,proposal);expect(result.ok).toBe(false);expect('document'in result).toBe(false);}
});
test('optional caption presence survives add/remove and cannot be collapsed to null',async()=>{
 const f=await fixture(),next=copyHostJson(f.document);(next.extensions!['umf.visual'] as any).edges[0].label='Caption';
 const change:HostChange={path:'/extensions/umf.visual/edges/0/label',before:{present:false},after:{present:true,value:'Caption'}};
 const result=await finishHostReconciliation(f.binding,f.document,f.fence,{document:next,changes:[change],nativeOnlyChanges:[]});expect(result.ok).toBe(true);if(!result.ok)return;
 const remove:HostChange={path:change.path,before:change.after,after:{present:false}};
 const second=await finishHostReconciliation(result.binding,result.document,{...f.fence,expectedBindingRevision:1},{document:f.document,changes:[remove],nativeOnlyChanges:[]});expect(second.ok).toBe(true);if(second.ok)expect(Object.hasOwn((second.document.extensions!['umf.visual'] as any).edges[0],'label')).toBe(false);
 const nullBefore=await finishHostReconciliation(f.binding,f.document,f.fence,{document:next,changes:[{...change,before:{present:true,value:null}}],nativeOnlyChanges:[]});expect(nullBefore.ok).toBe(false);
});
test('unknown source/native content is preserved on no-op and semantic edits cannot erase prior losses',async()=>{
 const f=await fixture(),source=copyHostJson(f.document);(source.extensions!['umf.visual'] as any).future={unknown:[1,'two']};
 const loss={path:'/extensions/umf.visual/future',code:'RETAINED_ONLY',family:'semantic' as const,representation:'retained-only' as const,message:'Unknown common field retained without native interpretation'};
 const binding={...f.binding,source,sourceDigestSha256:await hostDigest(source),losses:[loss]};expect(inspectVisual(source).complete).toBe(false);
 const noop=await finishHostReconciliation(binding,source,f.fence,{document:source,changes:[],nativeOnlyChanges:[]});expect(noop.ok).toBe(true);if(noop.ok){expect(noop.document).toEqual(source);expect(noop.binding.baselineNative.payload).toEqual(f.observation.payload);}
 const edit=await finishHostReconciliation(binding,source,f.fence,proposalFor(source));expect(edit.ok).toBe(false);if(!edit.ok)expect(edit.diagnostics[0].code).toBe('UNSAFE_EDIT');
 const noLoss=await finishHostReconciliation(binding,source,f.fence,{document:source,changes:[],nativeOnlyChanges:[],losses:[]});expect(noLoss.ok).toBe(false);
});
test('unsafe objects/getters are refused without invocation and a valid admitted binding is retained',async()=>{
 const f=await fixture();let invoked=0;const fence=Object.defineProperty({},'observedAfter',{enumerable:true,get(){invoked++;return f.observation;}});
 const result=await finishHostReconciliation(f.binding,f.document,fence as ReconcileFence,proposalFor(f.document));expect(result.ok).toBe(false);expect(invoked).toBe(0);if(!result.ok)expect(result.binding).toEqual(f.binding);
 for(const input of [[,1],{value:NaN},{value:Infinity},Object.assign(Object.create({inherited:true}),{own:1})])expect(()=>copyHostJson(input)).toThrow();
 const cyclic:any={};cyclic.self=cyclic;expect(()=>copyHostJson(cyclic)).toThrow();
 expect(await hostDigest(-0)).not.toBe(await hostDigest(0));
 const ownProto=JSON.parse('{"__proto__":{"retained":true}}');expect(canonicalHostJson(copyHostJson(ownProto))).toBe('{"__proto__":{"retained":true}}');expect(({} as any).retained).toBeUndefined();
});
test('a declared reconnection must still yield a valid whole visual',async()=>{
 const f=await fixture(),next=copyHostJson(f.document);(next.extensions!['umf.visual'] as any).edges[0].to='missing';
 const result=await finishHostReconciliation(f.binding,f.document,f.fence,{document:next,changes:[{path:'/extensions/umf.visual/edges/0/to',before:{present:true,value:'b'},after:{present:true,value:'missing'}}],nativeOnlyChanges:[]});expect(result.ok).toBe(false);if(!result.ok)expect(result.diagnostics[0].code).toBe('VISUAL_INVALID');
 await expect(checkHostFence(f.binding,f.document,{...f.fence,expectedBindingRevision:NaN})).rejects.toThrow();
});
