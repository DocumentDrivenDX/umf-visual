// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import type {Document} from '@umf/core';
import {createVisualDocument,type Visual} from '../../src/extensions/visual';
import {
 ANNOTATION_CANDIDATE_PATHS_1_0,annotationIdForPath,candidateAnnotationPaths,compileAnnotations,type AnnotationValue,
 decodeAnnotationValue,encodeAnnotationValue,readJsonPointer,verifyAnnotationReadback
} from '../../src/interchange/annotations';

const makeDocument=(visual:Visual)=>createVisualDocument(visual) as Document;
const visual:Visual={id:'annotation-fixture',kind:'flow',form:'network',question:'Where is the data?',takeaway:'Keep evidence visible',audience:'developer',
 source:{path:'docs/architecture.md',view:'api',digest:'sha256:123'},omissions:['runtime deployment'],
 nodes:[{id:'client',label:'Client',detail:'An application',role:'actor',status:'built',emphasis:'focus',evidence:[{path:'docs/client.md',contains:'request'}]},
  {id:'service',label:'Service'}],edges:[{id:'call',from:'client',to:'service',label:'calls',why:'Routes the request',kind:'action'}],
 steps:[{id:'inspect',title:'Inspect',caption:'Read first',focus:['client','service'],when:'before'}]};

test('candidate registry is explicit and excludes graph identities and intrinsic relations',()=>{
 const doc=makeDocument(visual),paths=candidateAnnotationPaths(doc,'1.0.0');
 expect(paths).toContain('/extensions/umf.visual/question');
 expect(paths).toContain('/extensions/umf.visual/nodes/0/status');
 expect(paths).toContain('/extensions/umf.visual/nodes/0/evidence/0/path');
 expect(paths).toContain('/extensions/umf.visual/steps/0/focus/0');
 expect(paths).toContain('/extensions/umf.visual/steps');
 expect(paths).toContain('/extensions/umf.visual/steps/0/id');
 expect(paths).not.toContain('/extensions/umf.visual/nodes/0/id');
 expect(paths).not.toContain('/extensions/umf.visual/nodes/0/label');
 expect(paths).not.toContain('/extensions/umf.visual/edges/0/from');
 expect(paths).not.toContain('/extensions/umf.visual/edges/0/to');
 expect(paths).not.toContain('/extensions/umf.visual/metric/series/0/points/0/value');
 expect(ANNOTATION_CANDIDATE_PATHS_1_0.some(path=>path.includes('/metric/'))).toBe(false);
 expect(()=>candidateAnnotationPaths(doc,'1.1.0')).toThrow();
});

test('candidate registry includes only reviewed sequence and transition metadata',()=>{
 const sequence=makeDocument({id:'sequence-fixture',kind:'sequence',form:'lifelines',question:'Who responds?',sequence:{
  participants:[{id:'caller',label:'Caller'},{id:'service',label:'Service'}],
  messages:[{id:'request',from:'caller',to:'service',label:'request',status:'built',emphasis:'focus',evidence:[{path:'spec.md'}]}]
 }});
 const sequencePaths=candidateAnnotationPaths(sequence,'1.0.0');
 expect(sequencePaths).toContain('/extensions/umf.visual/sequence/messages/0/status');
 expect(sequencePaths).toContain('/extensions/umf.visual/sequence/messages/0/evidence/0/path');
 expect(sequencePaths).not.toContain('/extensions/umf.visual/sequence/messages/0/from');
 expect(sequencePaths).not.toContain('/extensions/umf.visual/sequence/messages/0/to');
 const state=makeDocument({id:'state-fixture',kind:'state',form:'machine',question:'What transitions?',nodes:[{id:'idle',label:'Idle'},{id:'ready',label:'Ready'}],state:{initial:'idle',transitions:[{id:'activate',from:'idle',to:'ready',event:'activate',status:'decided',emphasis:'focus'}]}});
 const statePaths=candidateAnnotationPaths(state,'1.0.0');
 expect(statePaths).toContain('/extensions/umf.visual/state/transitions/0/status');
 expect(statePaths).toContain('/extensions/umf.visual/state/transitions/0/emphasis');
 expect(statePaths).not.toContain('/extensions/umf.visual/state/transitions/0/event');
 expect(statePaths).not.toContain('/extensions/umf.visual/state/transitions/0/from');
});

test('compiles only selected registered paths and preserves typed empty/container distinctions',()=>{
 const doc=makeDocument({id:'container-fixture',kind:'flow',form:'network',question:'Where?',source:{path:'x'},omissions:['one'],nodes:[{id:'a',label:'A',evidence:[{path:'p'}]}]});
 const entries=compileAnnotations(doc,'1.0.0',[
  '/extensions/umf.visual/source','/extensions/umf.visual/omissions','/extensions/umf.visual/nodes/0/evidence'
 ]);
 const byPath=new Map(entries.map(entry=>[entry.path,entry]));
 expect(byPath.get('/extensions/umf.visual/source')?.value).toEqual({kind:'object',members:['path']});
 expect(byPath.get('/extensions/umf.visual/source/path')?.value).toEqual({kind:'string',value:'x'});
 expect(byPath.get('/extensions/umf.visual/omissions')?.value).toEqual({kind:'array',length:1});
 expect(byPath.get('/extensions/umf.visual/nodes/0/evidence')?.value).toEqual({kind:'array',length:1});
 expect(byPath.get('/extensions/umf.visual/nodes/0/evidence/0')?.value).toEqual({kind:'object',members:['path']});
 expect(byPath.get('/extensions/umf.visual/nodes/0/evidence/0/path')?.value).toEqual({kind:'string',value:'p'});
 expect(()=>compileAnnotations(doc,'1.0.0',['/extensions/umf.visual/nodes/0/id'])).toThrow(/Unregistered/);
 expect(()=>compileAnnotations(doc,'1.0.0',['/extensions/umf.visual/nodes/0/evidence/0/unreviewed'])).toThrow(/Unregistered/);
 expect(()=>compileAnnotations(doc,'1.0.0',['/extensions/umf.visual/nodes/0/evidence'],{maxEntries:2})).toThrow(/bounds/);
});

test('container selection refuses unknown child properties instead of hiding them in annotations',()=>{
 const doc=makeDocument({id:'unknown-fixture',kind:'flow',form:'network',question:'Where?',source:{path:'x'},nodes:[{id:'a',label:'A'}]});
 const payload=doc.extensions!['umf.visual'] as Record<string,unknown>;
 (payload.source as Record<string,unknown>).nativeSecret='unreviewed';
 expect(candidateAnnotationPaths(doc,'1.0.0')).not.toContain('/extensions/umf.visual/source/nativeSecret');
 expect(()=>compileAnnotations(doc,'1.0.0',['/extensions/umf.visual/source'])).toThrow(/unregistered field/);
});

test('JSON Pointer traversal decodes escaped segments, checks own data properties and applies bounds',()=>{
 const root={extensions:{'umf.visual':{source:{'a/b~c':'value'}}}};
 expect(readJsonPointer(root,'/extensions/umf.visual/source/a~1b~0c')).toEqual({present:true,value:'value'});
 expect(readJsonPointer(root,'/extensions/umf.visual/source/missing')).toEqual({present:false});
 expect(()=>readJsonPointer(root,'/extensions/umf.visual/source/~2bad')).toThrow(/escape/);
 expect(()=>readJsonPointer(root,'/extensions/umf.visual/source/__proto__')).toThrow(/forbidden/);
 expect(()=>readJsonPointer(root,'/extensions/umf.visual/source/a', {maxDepth:2})).toThrow(/depth/);
 let getterCalls=0;const hostile={get value(){getterCalls++;return 'unsafe';}};
 expect(()=>readJsonPointer(hostile,'/value')).toThrow();expect(getterCalls).toBe(0);
});

test('visible scalar and container wire forms round trip exact JSON types',()=>{
 const values:AnnotationValue[]=[
  {kind:'string',value:''},{kind:'string',value:'line\n"東京" 😀'},
  {kind:'number',value:-0},{kind:'number',value:12.5},
  {kind:'boolean',value:false},{kind:'null'},
  {kind:'array',length:3},{kind:'object',members:['z','a/b','~key']}
 ];
 for(const value of values){const encoded=encodeAnnotationValue(value);const decoded=decodeAnnotationValue(encoded.type,encoded.value);expect(decoded).toEqual(value);if(value.kind==='number'&&Object.is(value.value,-0))expect(Object.is((decoded as {value:number}).value,-0)).toBe(true);}
 expect(()=>decodeAnnotationValue('number','"3"')).toThrow(/match/);
 expect(()=>decodeAnnotationValue('array','Length: 01')).toThrow(/length/);
 expect(()=>decodeAnnotationValue('object','Members: ["x","x"]')).toThrow(/member/);
 expect(()=>decodeAnnotationValue('string','[1]')).toThrow(/match/);
});

test('native readback yields coverage only for exact entries, names, typed values and container structure',()=>{
 const doc=makeDocument({...visual,source:{path:'source.md',view:'api'},omissions:['excluded']});
 const expected=compileAnnotations(doc,'1.0.0',['/extensions/umf.visual/source','/extensions/umf.visual/omissions']);
 const locators=Object.fromEntries(expected.map((entry,index)=>[entry.id,[{id:'cell_'+index,slot:'table#ann/cell#cell_'+index}]]));
 const coverage=verifyAnnotationReadback(expected,expected,locators);
 expect(coverage.some(item=>item.path.endsWith('/source')&&item.aspect==='members')).toBe(true);
 expect(coverage.some(item=>item.path.endsWith('/omissions')&&item.aspect==='presence')).toBe(true);
 expect(coverage.every(item=>item.representation==='profile-annotation')).toBe(true);
 const changed=expected.map(entry=>entry.path.endsWith('/source/path')?{...entry,value:{kind:'string' as const,value:'changed'}}:entry);
 expect(()=>verifyAnnotationReadback(expected,changed,locators)).toThrow(/differs/);
 const wrongName=expected.map(entry=>entry.path.endsWith('/source/path')?{...entry,name:'view'}:entry);
 expect(()=>verifyAnnotationReadback(expected,wrongName,locators)).toThrow(/name/);
 const missingChild=expected.filter(entry=>!entry.path.endsWith('/source/view'));
 expect(()=>verifyAnnotationReadback(expected,missingChild,locators)).toThrow(/missing|differs/i);
 expect(()=>verifyAnnotationReadback(expected,expected,{})).toThrow(/carrier/);
});

test('annotation identities are deterministic and pointer-specific',()=>{
 const a='/extensions/umf.visual/nodes/0/status',b='/extensions/umf.visual/nodes/1/status';
 expect(annotationIdForPath(a)).toBe(annotationIdForPath(a));expect(annotationIdForPath(a)).not.toBe(annotationIdForPath(b));
});
