// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {createVisualDocument,type Visual} from '../../src/extensions/visual';
import {MERMAID_ANNOTATED_PROFILE,focusedAnnotatedMermaidSource,parseAnnotatedMermaid,serializeAnnotatedMermaid} from '../../src/interchange/mermaid/annotated';

const cases=[
 'visual/inventory/helix-request.json',
 'visual/inventory/beacon-reply-draft.json',
 'visual/inventory/documentor-pipeline.json',
 'visual/inventory/tpl-arch-dataflow.json',
 'visual/forms/helix-request-ladder.json',
];
const fixture=async(path:string)=>JSON.parse(await readFile(new URL('../../fixtures/'+path,import.meta.url),'utf8'));
const canonical=(value:unknown):string=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);

describe('explicit Mermaid sequence annotation profile',()=>{
 test('round-trips all five sequence examples through visible typed notes and native sequence constructs',async()=>{
  let strictCases=0,ladderLosses=0;
  for(const path of cases){
   const document=await fixture(path),visual=document.extensions['umf.visual'] as Visual,result=serializeAnnotatedMermaid(document);
   expect(result.text).toContain('%% UMF_PROFILE');expect(result.text).toMatch(/Note over P1,P[2-9][0-9]*: UMF#32;annotation#32;\/1#32;·/);
   expect(result.text).toMatch(/<br\/>/);expect(result.text).not.toContain('#10;');
   expect(result.document&&canonical(result.document)).toBe(canonical(document));
   expect(result.coverage.some(item=>item.representation==='profile-annotation'&&item.path.endsWith('/question'))).toBe(true);
   expect(result.coverage.some(item=>item.representation==='native-concept'&&item.path.endsWith('/sequence/messages'))).toBe(true);
   const imported=parseAnnotatedMermaid(result.text!);
   expect(imported.document&&canonical(imported.document)).toBe(canonical(document));
   expect(imported.identityMap.filter(item=>item.kind==='participant').map(item=>item.visualId)).toEqual(visual.sequence!.participants.map(item=>item.id));
   expect(imported.identityMap.filter(item=>item.kind==='message').map(item=>item.visualId)).toEqual(visual.sequence!.messages.map(item=>item.id));
   const events=result.text!.split('\n').filter(line=>/^\s*(?:Note\s+(?:left|right|over)\b.*:|P\d+\s*(?:-->>|->>|-\)|--x|->|-->)\s*P\d+\s*:|loop\s+\S|end\s*$)/.test(line));
   expect(imported.identityMap.filter(item=>item.kind==='message').every(item=>Number(item.nativeId.split('@')[1])<=events.length)).toBe(true);
   expect(result.coverage.filter(item=>item.representation==='profile-annotation').every(item=>/^note@[1-9]\d*$/.test(item.native[0]?.id??''))).toBe(true);
   const losses=result.diagnostics.filter(item=>item.loss);
   if(visual.form==='ladder'){
    expect(losses).toContainEqual(expect.objectContaining({code:'MERMAID_SEQUENCE_LAYOUT',path:'/extensions/umf.visual/form'}));
    ladderLosses++;
   }else{expect(losses).toEqual([]);strictCases++;}
  }
  expect({strictCases,ladderLosses}).toEqual({strictCases:4,ladderLosses:1});
 });

 test('wraps annotation metadata and typed payload with native line breaks while escaping user markup',()=>{
  const hostile=' <script>alert("x")</script> '+('a'.repeat(140));
  const visual:Visual={id:'wrapped-hostile',kind:'sequence',form:'lifelines',question:'Keep this exact?',sequence:{participants:[{id:'caller',label:'Caller',detail:hostile},{id:'service',label:'Service'}],messages:[{id:'call',from:'caller',to:'service',kind:'call',label:'Fetch'}]}};
  const document=createVisualDocument(visual);
  const result=serializeAnnotatedMermaid(document);
  expect(result.document&&canonical(result.document)).toBe(canonical(document));
  expect(result.text).toContain('<br/>');expect(result.text).not.toContain('<script>');expect(result.text).toContain('#60;script#62;');
 });

 test('uses real Mermaid notes only for the reserved annotation carrier and leaves authored notes as messages',()=>{
  const visual:Visual={id:'native-notes',kind:'sequence',form:'lifelines',question:'What is said?',sequence:{participants:[{id:'caller',label:'Caller'},{id:'service',label:'Service'}],messages:[{id:'memo',from:'caller',to:'service',kind:'note',label:'Authored note'}]}};
  const result=serializeAnnotatedMermaid(createVisualDocument(visual));expect(result.text).toBeDefined();
  const imported=parseAnnotatedMermaid(result.text!);
  expect(imported.document?.extensions?.['umf.visual']).toMatchObject({sequence:{messages:[expect.objectContaining({id:'memo',kind:'note',label:'Authored note'})]}});
  expect(imported.diagnostics.some(item=>item.severity==='error'||item.loss)).toBe(false);
 });

 test('rejects missing, duplicate, mismatched, or unregistered annotation data',async()=>{
  const document=await fixture(cases[0]),result=serializeAnnotatedMermaid(document),source=result.text!;
  const lines=source.split('\n'),index=lines.findIndex(line=>line.includes('UMF#32;annotation#32;/1#32;·'));expect(index).toBeGreaterThan(-1);
  const missing=[...lines];missing.splice(index,1);expect(parseAnnotatedMermaid(missing.join('\n')).document).toBeUndefined();
  const duplicate=[...lines];duplicate.splice(index,0,lines[index]!);expect(parseAnnotatedMermaid(duplicate.join('\n')).document).toBeUndefined();
  expect(parseAnnotatedMermaid(source.replace('modelVersion":"1.0.0"','modelVersion":"1.1.0"')).document).toBeUndefined();
  expect(parseAnnotatedMermaid(source.replace('/extensions/umf.visual/question','/extensions/umf.visual/nodes/0/id')).document).toBeUndefined();
  expect(parseAnnotatedMermaid(source.replace('Participant#32;[team]','Participant#32;[forged]')).document).toBeUndefined();
 });

 test('keeps native ladder geometry loss distinct from the annotation metadata profile',async()=>{
  const document=await fixture(cases.at(-1)!),result=serializeAnnotatedMermaid(document);
  expect(result.text).toBeDefined();expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_SEQUENCE_LAYOUT',loss:true}));
  expect(result.coverage.some(item=>item.path==='/extensions/umf.visual/form')).toBe(false);
  expect(result.coverage.filter(item=>item.representation==='profile-annotation').length).toBeGreaterThan(0);
 });
});

test('coverage names only optional source properties that exist and full-source event locators distinguish notes and loop delimiters',()=>{
 const visual:Visual={id:'optional-fields',kind:'sequence',form:'lifelines',question:'A question',groups:[{id:'retry',label:'Try again',role:'loop'}],sequence:{participants:[{id:'a',label:'A'},{id:'b',label:'B'}],messages:[{id:'call',from:'a',to:'b',kind:'call',label:'work'},{id:'later',from:'b',to:'a',kind:'call',label:'again',group:'retry'}]}};
 const result=serializeAnnotatedMermaid(createVisualDocument(visual));expect(result.text).toBeDefined();
 const imported=parseAnnotatedMermaid(result.text!);expect(imported.document).toBeDefined();
 const paths=new Set(result.coverage.map(item=>item.path));
 expect(paths.has('/extensions/umf.visual/title')).toBe(false);
 expect(paths.has('/extensions/umf.visual/sequence/messages/0/kind')).toBe(true);
 expect(paths.has('/extensions/umf.visual/groups/0/role')).toBe(true);
 expect(imported.identityMap.find(item=>item.visualId==='call'&&item.kind==='message')?.nativeId).toBe('message@2');
 expect(imported.identityMap.find(item=>item.visualId==='later'&&item.kind==='message')?.nativeId).toBe('message@4');
 expect(imported.identityMap.find(item=>item.visualId==='retry'&&item.kind==='group')?.nativeId).toBe('loop@3');
 const nativeCoverage=(path:string)=>imported.coverage.find(item=>item.path===path&&item.representation==='native-concept')?.native.map(row=>row.id);
 expect(nativeCoverage('/extensions/umf.visual/sequence/messages')).toEqual(['message@2','message@4']);
 expect(nativeCoverage('/extensions/umf.visual/sequence/messages/0/kind')).toEqual(['message@2']);
 expect(nativeCoverage('/extensions/umf.visual/sequence/messages/1/group')).toEqual(['message@4']);
 expect(nativeCoverage('/extensions/umf.visual/groups/0/role')).toEqual(['loop@3']);
 expect(imported.coverage.filter(item=>item.representation==='profile-annotation').every(item=>/^note@[1-9]\d*$/.test(item.native[0]?.id??''))).toBe(true);
});

test('profile selector is pinned to the reviewed Mermaid annotated version',()=>expect(MERMAID_ANNOTATED_PROFILE).toBe('umf.visual.mermaid.annotated/1'));

test('focused view removes validated profile notes while preserving the title and sequence meaning',async()=>{
 const document=await fixture(cases[0]),result=serializeAnnotatedMermaid(document),focused=focusedAnnotatedMermaidSource(result.text!);
 expect(focused).not.toContain('UMF_PROFILE');expect(focused).not.toMatch(/Note over P\d+,P\d+: UMF#32;annotation/);
 expect(focused).toContain('title:');expect(focused).toContain('sequenceDiagram');
 const imported=parseAnnotatedMermaid(result.text!);
 expect(focused.match(/\bP\d+\s*(?:-->>|->>|-\))\s*P\d+:/g)).toHaveLength((document.extensions['umf.visual'] as Visual).sequence!.messages.length);
 expect(imported.document).toBeDefined();
});

test('reads earlier numeric-newline carrier sources after switching to native HTML line breaks',async()=>{
 const document=await fixture(cases[0]),result=serializeAnnotatedMermaid(document);
 const earlierSource=result.text!.replaceAll('<br/>','#10;');
 const imported=parseAnnotatedMermaid(earlierSource);
 expect(imported.document&&canonical(imported.document)).toBe(canonical(document));
});
