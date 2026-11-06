// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createVisualDocument,readVisualDocument,getVisual,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';
import {stateTransitionCaption} from '../../src/presentation/state';
import {requiredPresentationChecks} from '../../scripts/presentation/verify';

const raw=await Bun.file('fixtures/visual/forms/helix-authoring-state.json').text();
const original=readVisualDocument(raw,'json');
const lifecycleRaw=await Bun.file('fixtures/visual/inventory/beacon-ticket-lifecycle.json').text();
const lifecycle=readVisualDocument(lifecycleRaw,'json');
const visual=()=>structuredClone(getVisual(original));
const document=(value:Visual)=>createVisualDocument(value,'test:'+value.id,'1.4.0');

test('compiles flat state machines to native plans with exact identity maps and no invented final state',()=>{
 for(const backend of ['graphviz','mermaid'] as const){
  const plan=compilePresentation(original,{backend});expect(plan.ok).toBe(true);if(!plan.ok)continue;
  expect(Bun.CryptoHasher.hash('sha256',plan.source,'hex')).toBe(backend==='graphviz'?'9ad7025171efab9753bda721fbfabf8f11099b6968204478918b7c5915b3d25a':'75b7bd9960f8fd3bd74609d518beed1963ff037ab279b7897c1058b58997a964');
  expect(plan.elementMap.some(item=>item.kind==='state-path-caption')).toBe(false);
  expect(plan.elementMap.filter(item=>item.kind==='node').map(item=>[item.logicalId,item.sourcePath])).toEqual([
   ['checked-out','/extensions/umf.visual/nodes/0/id'],['checked-in','/extensions/umf.visual/nodes/1/id']
  ]);
  expect(plan.elementMap.filter(item=>item.kind==='transition').map(item=>[item.logicalId,item.sourcePath])).toEqual([
   ['check-in','/extensions/umf.visual/state/transitions/0'],['check-out','/extensions/umf.visual/state/transitions/1']
  ]);
  if(backend==='mermaid')expect(plan.elementMap.filter(item=>item.kind==='transition').map(item=>item.nativeId)).toEqual([
   `n1->n2|${encodeURIComponent('check in / copy body, export and digest')}`,
   `n2->n1|${encodeURIComponent('check out / start the next revision')}`
  ]);
  expect(plan.elementMap.filter(item=>item.kind==='state-marker')).toEqual([
   {logicalId:'checked-out',sourcePath:'/extensions/umf.visual/state/initial',nativeId:backend==='graphviz'?'state_initial_marker':'[*]',kind:'state-marker'}
  ]);
  expect(plan.source).toContain(backend==='graphviz'?'check in / copy body, export and digest':'check#32;in#32;/#32;copy#32;body,#32;export#32;and#32;digest');
  expect(plan.source).toContain(backend==='graphviz'?'check out / start the next revision':'check#32;out#32;/#32;start#32;the#32;next#32;revision');
  expect(plan.source).not.toContain(backend==='graphviz'?'peripheries=2':'--> [*]');
  if(backend==='mermaid'){
   expect(plan.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/state/transitions'&&item.representation.includes('not a user-assigned SVG ID'))).toBe(true);
   expect(plan.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/state/initial'&&item.representation.includes('[*] pseudo-state'))).toBe(true);
  }
 }
});

test('uses one mapped native final marker without dropping outgoing authored transitions',()=>{
 const edited=visual();edited.state!.final=['checked-out'];
 for(const backend of ['graphviz','mermaid'] as const){
  const plan=compilePresentation(document(edited),{backend});expect(plan.ok).toBe(true);if(!plan.ok)continue;
  expect(plan.elementMap.filter(item=>item.kind==='transition')).toHaveLength(2);
  expect(plan.elementMap.filter(item=>item.kind==='state-marker').map(item=>item.sourcePath)).toEqual([
   '/extensions/umf.visual/state/initial','/extensions/umf.visual/state/final/0'
  ]);
  expect(plan.source).toContain(backend==='graphviz'?'peripheries=2':'n1 --> [*]');
  expect(plan.source).toContain(backend==='graphviz'?'n2 -> n1':'n2 --> n1: check#32;out');
 }
});

test('caption convention preserves event, optional guard, and optional action as one transition label',()=>{
 expect(stateTransitionCaption({id:'t',from:'a',to:'b',event:'submit',guard:'is valid',action:'store value'})).toBe('submit [is valid] / store value');
 expect(stateTransitionCaption({id:'t',from:'a',to:'b',event:'submit'})).toBe('submit');
 expect(stateTransitionCaption({id:'t',from:'a',to:'b',event:'submit',path:'alternate',guard:'is valid',action:'store value'})).toBe('Path: alternate — submit [is valid] / store value');
});

test('projects lifecycle path captions as separately source-mapped text without losing transition identity',()=>{
 const visual=getVisual(lifecycle);
 for(const backend of ['graphviz','mermaid'] as const){
  const plan=compilePresentation(lifecycle,{backend});expect(plan.ok).toBe(true);if(!plan.ok)continue;
  const transitions=plan.elementMap.filter(item=>item.kind==='transition');
  const paths=plan.elementMap.filter(item=>item.kind==='state-path-caption');
  expect(transitions.map(item=>item.logicalId)).toEqual(visual.state!.transitions.map(item=>item.id));
  expect(paths.map(item=>[item.logicalId,item.sourcePath,item.nativeId])).toEqual(visual.state!.transitions.map((item,index)=>[
   item.id,`/extensions/umf.visual/state/transitions/${index}/path`,transitions[index]!.nativeId
  ]));
  for(const[index,transition]of visual.state!.transitions.entries()){
   if(backend==='graphviz')expect(transitions[index]!.nativeId).toBe('t'+(index+1));
   else{
    const nativeState=(stateId:string)=>'n'+(visual.nodes!.findIndex(node=>node.id===stateId)+1);
    expect(transitions[index]!.nativeId).toBe(`${nativeState(transition.from)}->${nativeState(transition.to)}|${encodeURIComponent(stateTransitionCaption(transition))}`);
   }
   expect(plan.source).toContain(backend==='graphviz'?`Path: ${transition.path} — ${transition.event}`:`Path:#32;${transition.path}#32;—#32;${transition.event.replaceAll(' ','#32;')}`);
  }
  expect(plan.source.match(/Path:/gu)).toHaveLength(6);
 }
});

test('state machine receipts require dedicated backend-native transition and marker proofs',()=>{
 const state=getVisual(original);
 expect(requiredPresentationChecks('graphviz',state)).toContain('graphviz-state-transitions-and-markers');
 expect(requiredPresentationChecks('mermaid',state)).toContain('mermaid-state-transitions-and-markers');
 expect(requiredPresentationChecks('graphviz',state)).not.toContain('graphviz-containment-and-order');
 expect(requiredPresentationChecks('mermaid',state)).not.toContain('mermaid-containment-and-order');
});

test('refuses composite and unsupported state content with located diagnostics',()=>{
 const composite=visual();composite.nodes![1]!.parent='checked-out';
 expect(compilePresentation(document(composite),{backend:'graphviz'})).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_STATE_NODE_PROPERTY',path:'/extensions/umf.visual/nodes/1/parent'}]});
 const ordered=visual();ordered.layout={kind:'flow',direction:'LR',order:['checked-out','checked-in']};
 expect(compilePresentation(document(ordered),{backend:'mermaid'})).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_STATE_LAYOUT_ORDER',path:'/extensions/umf.visual/layout/order'}]});
 const annotated=visual();annotated.annotations=[{id:'note',text:'unanchored'}];
 expect(compilePresentation(document(annotated),{backend:'graphviz'})).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_STATE_ANNOTATION',path:'/extensions/umf.visual/annotations'}]});
});

test('refuses only identical Mermaid endpoint-and-caption transitions',()=>{
 const repeated=visual();repeated.state!.transitions.push({...repeated.state!.transitions[0]!,id:'check-in-again'});
 expect(compilePresentation(document(repeated),{backend:'mermaid'})).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_STATE_AMBIGUOUS_TRANSITION',path:'/extensions/umf.visual/state/transitions/2'}]});
 expect(compilePresentation(document(repeated),{backend:'graphviz'})).toMatchObject({ok:true});
 const distinct=visual();distinct.state!.transitions.push({...distinct.state!.transitions[0]!,id:'check-in-again',event:'check in again'});
 const mermaid=compilePresentation(document(distinct),{backend:'mermaid'});expect(mermaid.ok).toBe(true);if(mermaid.ok)expect(mermaid.elementMap.filter(item=>item.kind==='transition').map(item=>item.nativeId)).toEqual([
  `n1->n2|${encodeURIComponent('check in / copy body, export and digest')}`,
  `n2->n1|${encodeURIComponent('check out / start the next revision')}`,
  `n1->n2|${encodeURIComponent('check in again / copy body, export and digest')}`
 ]);
});

test('refuses Mermaid multiline state text at the exact authored field path',()=>{
 const multiline=visual();multiline.nodes![0]!.label='Checked\nout';
 expect(compilePresentation(document(multiline),{backend:'mermaid'})).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_STATE_MULTILINE',path:'/extensions/umf.visual/nodes/0/label'}]});
 expect(compilePresentation(document(multiline),{backend:'graphviz'})).toMatchObject({ok:true});
});
