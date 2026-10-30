// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,test} from 'bun:test';
import {readVisualDocument,writeVisualDocument,createVisualDocument,getVisual,exportVisual,importVisual,type Visual} from '../../src';
import type {Document} from '@umf/core';
import machine from '../../fixtures/visual/forms/helix-authoring-state.json';
import lifecycle from '../../fixtures/visual/inventory/beacon-ticket-lifecycle.json';
import tree from '../../fixtures/visual/forms/umf-extensions.json';
import nested from '../../fixtures/visual/inventory/beacon-estate-landscape.json';
import stack from '../../fixtures/visual/inventory/beacon-stack.json';
import parts from '../../fixtures/visual/inventory/helix-parts.json';
const profile='umf.visual.dot.annotated/1' as const;
const options=(document:Document)=>({format:'dot' as const,profile,id:getVisual(document).id,question:getVisual(document).question});
describe('explicit annotated interchange facade',()=>{
 test('strictly preserves six unchanged full documents, including provenance/envelope identity',()=>{
  for(const document of [machine,lifecycle,tree,nested,stack,parts] as Document[]){
   const before=JSON.stringify(document),out=exportVisual(document,{format:'dot',profile});expect(out.ok,out.diagnostics.map(d=>d.message).join('; ')).toBe(true);expect(out.diagnostics).toEqual([]);
   expect(out.profile).toBe(profile);expect(out.coverage?.some(c=>c.representation==='profile-annotation')).toBe(true);
   const imported=importVisual(out.text,options(document));expect(imported.ok,JSON.stringify(imported.diagnostics)).toBe(true);expect(imported.document).toEqual(document);
   const persisted=JSON.parse(JSON.stringify({document:imported.document,source:imported.source}));
   expect(exportVisual(persisted.document,{format:'dot',profile,source:persisted.source,original:true})).toMatchObject({ok:true,text:out.text});expect(JSON.stringify(document)).toBe(before);
  }
 });
 test('preserves compound JSON/YAML and ordered walkthrough metadata through native edits',()=>{
  const v=getVisual(machine as Document);v.steps=[{id:'review',title:'Review',caption:'Review the result',focus:['checked-in'],when:'after',tag:'東京 😀'}];v.omissions=['No unrelated states'];
  const doc=createVisualDocument(v,'an-independent-envelope-id');
  for(const format of ['json','yaml'] as const){
   const written=writeVisualDocument(doc,format);const restored=readVisualDocument(written,format);
   const out=exportVisual(restored,{format:'dot',profile});expect(out.ok,JSON.stringify(out.diagnostics)).toBe(true);
   const edited=out.text!.replace(' = \\"Review\\"',' = \\"Review carefully\\"');expect(edited).not.toBe(out.text);
   const imported=importVisual(edited,options(doc));expect(imported.ok,JSON.stringify(imported.diagnostics)).toBe(true);expect(getVisual(imported.document!).steps![0].title).toBe('Review carefully');
   expect(getVisual(imported.document!).steps![0].tag).toBe('東京 😀');expect(getVisual(imported.document!).omissions).toEqual(['No unrelated states']);expect(imported.document!.id).toBe(doc.id);
   expect(exportVisual(imported.document,{format:'dot',profile}).ok).toBe(true);
  }
 });
 test('source interpretation comes from native carriers and stale/forged replay refuses',()=>{
  const out=exportVisual(machine,{format:'dot',profile}),imported=importVisual(out.text,options(machine as Document));expect(imported.ok).toBe(true);
  const changed=structuredClone(imported.document!);(changed.extensions!['umf.visual'] as any).question='Changed';
  expect(exportVisual(changed,{format:'dot',profile,source:imported.source,original:true})).toMatchObject({ok:false});
  for(const mutate of [(r:any)=>r.baseline=JSON.stringify(changed),(r:any)=>r.importOptions.profile='umf.visual.dot.annotated/2',(r:any)=>r.identityMap[0].visualId='forged',(r:any)=>r.importOptions.question='forged']){
   const receipt=structuredClone(imported.source);mutate(receipt);expect(exportVisual(imported.document,{format:'dot',profile,source:receipt,original:true}).ok).toBe(false);
  }
  expect(exportVisual(imported.document,{format:'dot',source:imported.source,original:true}).ok).toBe(false);
 });
 test('refuses deleted, copied, moved and conflicting annotation carriers atomically',()=>{
  const out=exportVisual(machine,{format:'dot',profile}),lines=out.text!.split('\n'),annotation=lines.find(line=>line.includes('umf_kind="annotation"')&&line.includes('/source/path'))!;
  expect(annotation).toBeDefined();
  for(const text of [out.text!.replace(annotation,''),out.text!.replace(annotation,annotation+'\n'+annotation),out.text!.replace('/source/path','/nodes/0/label'),out.text!.replace('umf_model="1.0.0"','umf_model="1.1.0"')])expect(importVisual(text,options(machine as Document)).ok).toBe(false);
 });
 test('unknown meaning/version/profile refuses without broadening released defaults',()=>{
  const unknown=structuredClone(machine) as any;unknown.extensions['umf.visual'].future={meaning:'retained'};
  expect(exportVisual(unknown,{format:'dot',profile}).ok).toBe(false);
  const versioned=structuredClone(machine) as any;versioned.vocabularies['umf.visual'].version='1.1.0';expect(exportVisual(versioned,{format:'dot',profile}).ok).toBe(false);
  expect(exportVisual(machine,{format:'mermaid',profile}).ok).toBe(false);expect(exportVisual(machine,{format:'dot',profile:'unknown'}).ok).toBe(false);
  expect(exportVisual(machine,{format:'dot'}).ok).toBe(false);
  const hostile=Object.defineProperty({},'profile',{get(){throw new Error('getter must not run');},enumerable:true});expect(()=>exportVisual(machine,hostile)).not.toThrow();expect(exportVisual(machine,hostile).ok).toBe(false);
 });
 test('retains an independently admitted companion when unsafe current input or mismatched options refuse',()=>{
  const output=exportVisual(machine,{format:'dot',profile}),imported=importVisual(output.text,options(machine as Document));expect(imported.ok).toBe(true);
  const cycle:any={};cycle.self=cycle;
  const getter=Object.defineProperty({},'secret',{get(){throw new Error('must not invoke getter');},enumerable:true});
  for(const unsafe of [cycle,getter]){const result=exportVisual(unsafe,{format:'dot',profile,source:imported.source});expect(result.ok).toBe(false);expect(result.source).toEqual(imported.source);}
  const mismatch=exportVisual(machine,{format:'lini',profile:'umf.visual.lini.annotated/1',source:imported.source});expect(mismatch.ok).toBe(false);expect(mismatch.source).toEqual(imported.source);
  const invalidOptions=exportVisual(machine,{format:'mermaid',profile,source:imported.source});expect(invalidOptions.ok).toBe(false);expect(invalidOptions.source).toEqual(imported.source);
 });
});
