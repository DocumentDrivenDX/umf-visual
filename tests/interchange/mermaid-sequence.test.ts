// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {createVisualDocument,inspectVisual,type Visual} from '../../src/extensions/visual';
import {mermaidAdapter} from '../../src/interchange/mermaid';

const files=[
 'visual/inventory/helix-request.json',
 'visual/inventory/beacon-reply-draft.json',
 'visual/inventory/documentor-pipeline.json',
 'visual/inventory/tpl-arch-dataflow.json',
 'visual/forms/helix-request-ladder.json',
];
const fixture=async(path:string):Promise<Visual>=>{
 const document=JSON.parse(await readFile(new URL('../../fixtures/'+path,import.meta.url),'utf8'));
 return document.extensions['umf.visual'] as Visual;
};
const ctx={id:'sequence-import',question:'What happens?'};

describe('Mermaid 12.2 bounded sequenceDiagram adapter',()=>{
 test('round-trips the five existing sequence fixtures with exact participant/message order and kinds',async()=>{
  let totalMessages=0,callCount=0,returnCount=0;
  for(const path of files){
   const original=await fixture(path),exported=mermaidAdapter.serialize(original,{id:original.id,question:original.question});
   expect(exported.text).toContain('sequenceDiagram');
   expect(exported.text).not.toBeUndefined();
   expect(exported.identityMap.filter(item=>item.kind==='participant')).toHaveLength(original.sequence!.participants.length);
   expect(exported.identityMap.filter(item=>item.kind==='message')).toHaveLength(original.sequence!.messages.length);
   const imported=mermaidAdapter.parse(exported.text!,ctx);
   expect(imported.visual?.kind).toBe('sequence');
   expect(imported.visual?.form).toBe('lifelines');
   expect(imported.visual?.title).toBe(original.title);
   expect(imported.visual?.sequence?.participants.map(item=>item.label)).toEqual(original.sequence!.participants.map(item=>item.label));
   expect(imported.visual?.sequence?.messages.map(item=>({from:item.from,to:item.to,label:item.label,kind:item.kind}))).toEqual(original.sequence!.messages.map(item=>({from:original.sequence!.participants.find(p=>p.id===item.from)!.id,to:original.sequence!.participants.find(p=>p.id===item.to)!.id,label:item.label,kind:item.kind})).map(item=>({...item,from:'p'+(original.sequence!.participants.findIndex(p=>p.id===item.from)+1),to:'p'+(original.sequence!.participants.findIndex(p=>p.id===item.to)+1)})));
   expect(inspectVisual(createVisualDocument(imported.visual!)).complete).toBe(true);
   expect(imported.identityMap.filter(item=>item.kind==='participant')).toHaveLength(original.sequence!.participants.length);
   expect(imported.identityMap.filter(item=>item.kind==='message')).toHaveLength(original.sequence!.messages.length);
   totalMessages+=original.sequence!.messages.length;
   callCount+=original.sequence!.messages.filter(message=>message.kind==='call').length;
   returnCount+=original.sequence!.messages.filter(message=>message.kind==='return').length;
   if(original.form==='ladder')expect(exported.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_SEQUENCE_LAYOUT',loss:true}));
   if(original.steps)expect(exported.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_SEQUENCE_STEPS',loss:true}));
  }
  expect({totalMessages,callCount,returnCount}).toEqual({totalMessages:43,callCount:35,returnCount:8});
 });

 test('parses participants, call/return/async/note messages and nested loops in source order',()=>{
  const source='sequenceDiagram\n  actor A as Alpha #38; One\n  participant B as Beta\n  loop retry #35;1\n    A->>B: call #34;quoted#34;\n    loop inner\n      B-->>A: response\n    end\n  end\n  A-)B: async\n  Note over A,B: note\n';
  const result=mermaidAdapter.parse(source,ctx);
  expect(result.visual?.sequence?.participants).toEqual([{id:'p1',label:'Alpha & One',role:'actor'},{id:'p2',label:'Beta'}]);
  expect(result.visual?.sequence?.messages.map(message=>({kind:message.kind,label:message.label,group:message.group}))).toEqual([
   {kind:'call',label:'call "quoted"',group:'g1'},
   {kind:'return',label:'response',group:'g2'},
   {kind:'async',label:'async',group:undefined},
   {kind:'note',label:'note',group:undefined},
  ]);
  expect(result.visual?.groups).toEqual([{id:'g1',label:'retry #1',role:'loop'},{id:'g2',label:'inner',role:'loop',parent:'g1'}]);
  expect(result.identityMap.map(item=>item.kind)).toEqual(['participant','participant','message','message','message','message','group','group']);
  expect(inspectVisual(createVisualDocument(result.visual!)).complete).toBe(true);
  const exported=mermaidAdapter.serialize(result.visual!,ctx);
  expect(exported.identityMap.filter(item=>item.kind==='group')).toEqual([
   expect.objectContaining({nativeId:'loop@1',visualId:'g1',path:'/extensions/umf.visual/groups/0/id'}),
   expect.objectContaining({nativeId:'loop@2',visualId:'g2',path:'/extensions/umf.visual/groups/1/id'}),
  ]);
 });

 test('exports bounded sequence text without inferring an absent message kind',()=>{
  const hostileParticipant='  Alpha "one" α & <tag> > `tick` #1;\nnext\tend  ';
  const hostileMessage='  say "hi" α & <tag> > `tick` #1;\nnext\tend  ';
  const visual:Visual={id:'v',kind:'sequence',form:'lifelines',question:'q',groups:[{id:'retry',label:'loop #1;\nnext\tend',role:'loop'}],sequence:{participants:[{id:'first',label:hostileParticipant,role:'actor'},{id:'second',label:'Beta'}],messages:[
   {id:'call',from:'first',to:'second',label:hostileMessage,kind:'call',group:'retry'},
   {id:'return',from:'second',to:'first',label:'return',kind:'return'},
   {id:'missing',from:'first',to:'second',label:'kind not inferred'},
  ]}};
  const result=mermaidAdapter.serialize(visual,ctx);
  expect(result.text).toContain('actor P1 as #32;#32;Alpha#32;#34;one#34;#32;α#32;#38;#32;#60;tag#62;#32;#62;#32;#96;tick#96;#32;#35;1#59;#10;next#9;end#32;#32;');
  expect(result.text).toContain('P1->>P2: #32;#32;say#32;#34;hi#34;#32;α#32;#38;#32;#60;tag#62;#32;#62;#32;#96;tick#96;#32;#35;1#59;#10;next#9;end#32;#32;');
  expect(result.text).toContain('P2-->>P1: return');
  expect(result.text).toContain('loop loop#32;#35;1#59;#10;next#9;end');
  expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_MESSAGE_KIND',path:'/extensions/umf.visual/sequence/messages/2/kind',loss:true}));
  const imported=mermaidAdapter.parse(result.text!,ctx);
  expect(imported.visual?.sequence?.participants[0]?.label).toBe(hostileParticipant);
  expect(imported.visual?.sequence?.messages.map(message=>message.label)).toEqual([hostileMessage,'return','kind not inferred']);
  expect(imported.visual?.groups?.[0].label).toBe('loop #1;\nnext\tend');
  expect(imported.identityMap.some(item=>item.kind==='group'&&item.nativeId==='loop@1')).toBe(true);
  expect(imported.visual?.sequence?.messages.map(message=>message.kind)).toEqual(['call','return','call']);
 });

 test('refuses syntax whose meaning is outside the sequence subset',()=>{
  for(const source of [
   'sequenceDiagram\n  A->B: no arrowhead\n',
   'sequenceDiagram\n  A->>B: call\n  alt condition\n  B-->>A: maybe\n  end\n',
   'sequenceDiagram\n  A->>B: call\n  activate B\n',
   'sequenceDiagram\n  Note right of A: attached note\n',
  ]){
   const result=mermaidAdapter.parse(source,ctx);
   expect(result.visual).toBeUndefined();
   expect(result.diagnostics.some(item=>item.severity==='error')).toBe(true);
  }
 });

 test('refuses participant alias redefinitions and late declarations while allowing actor references',()=>{
  const valid=mermaidAdapter.parse('sequenceDiagram\n  actor A as Alice\n  participant B as Bob\n  A->>B: hello\n',ctx);
  expect(valid.visual?.sequence?.participants).toEqual([{id:'p1',label:'Alice',role:'actor'},{id:'p2',label:'Bob'}]);
  expect(valid.visual?.sequence?.messages).toHaveLength(1);
  for(const source of [
   'sequenceDiagram\n  participant A as Alice\n  participant A as Alice\n  A->>A: hello\n',
   'sequenceDiagram\n  A->>B: hello\n  participant A as Alice\n',
   'sequenceDiagram\n  loop retry\n  A->>B: hello\n  end\n  actor A as Alice\n',
  ]){
   const result=mermaidAdapter.parse(source,ctx);
   expect(result.visual).toBeUndefined();
   expect(result.diagnostics.some(item=>item.severity==='error')).toBe(true);
  }
 });

 test('refuses CR, unsupported controls, and unpaired surrogates in imported or exported sequence text',()=>{
  for(const escaped of ['#13;','#0;','#1;','#127;','#55296;','#160;','#8232;','#8233;','#65279;']){
   const parsed=mermaidAdapter.parse('sequenceDiagram\n  A->>B: before'+escaped+'after\n',ctx);
   expect(parsed.visual).toBeUndefined();
   expect(parsed.diagnostics.some(item=>item.severity==='error')).toBe(true);
  }
  for(const raw of ['\u00a0','\u2028','\u2029','\ufeff']){
   const parsed=mermaidAdapter.parse('sequenceDiagram\n  A->>B: boundary'+raw+'\n',ctx);
   expect(parsed.visual).toBeUndefined();
   expect(parsed.diagnostics.some(item=>item.severity==='error')).toBe(true);
  }
  for(const invalid of ['before\rafter','before\u0000after','before\u0001after','before\u007fafter','before\ud800after','before\u00a0after','before\u2028after','before\u2029after','before\ufeffafter']){
   const visual:Visual={id:'bad',kind:'sequence',form:'lifelines',question:'q',sequence:{participants:[{id:'a',label:'A'},{id:'b',label:'B'}],messages:[{id:'m',from:'a',to:'b',kind:'call',label:invalid}]}};
   const result=mermaidAdapter.serialize(visual,ctx);
   expect(result.text).toBeUndefined();
   expect(result.diagnostics.some(item=>item.severity==='error')).toBe(true);
  }
  for(const invalid of ['bad\ractor','bad\u0001actor','bad\ud800actor']){
   const visual:Visual={id:'bad',kind:'sequence',form:'lifelines',question:'q',sequence:{participants:[{id:'a',label:invalid},{id:'b',label:'B'}],messages:[{id:'m',from:'a',to:'b',kind:'call',label:'ok'}]}};
   expect(mermaidAdapter.serialize(visual,ctx).text).toBeUndefined();
  }
  const badLoop:Visual={id:'bad',kind:'sequence',form:'lifelines',question:'q',groups:[{id:'g',label:'again\rnow',role:'loop'}],sequence:{participants:[{id:'a',label:'A'},{id:'b',label:'B'}],messages:[{id:'m',from:'a',to:'b',kind:'call',label:'ok',group:'g'}]}};
  expect(mermaidAdapter.serialize(badLoop,ctx).text).toBeUndefined();
 });

 test('qualifies exported loop identities by native emission order',()=>{
  const visual:Visual={id:'nested',kind:'sequence',form:'lifelines',question:'q',groups:[
   {id:'inner',label:'inner',role:'loop',parent:'outer'},
   {id:'outer',label:'outer',role:'loop'},
  ],sequence:{participants:[{id:'a',label:'A'},{id:'b',label:'B'}],messages:[{id:'m',from:'a',to:'b',kind:'call',label:'hello',group:'inner'}]}};
  const exported=mermaidAdapter.serialize(visual,ctx);
  expect(exported.identityMap.filter(item=>item.kind==='group')).toEqual([
   expect.objectContaining({nativeId:'loop@1',visualId:'outer',path:'/extensions/umf.visual/groups/1/id'}),
   expect.objectContaining({nativeId:'loop@2',visualId:'inner',path:'/extensions/umf.visual/groups/0/id'}),
  ]);
 });

 test('reports unsupported source, evidence, participant roles, and message metadata as losses',async()=>{
  const original=await fixture('visual/inventory/beacon-reply-draft.json');
  const withEvidence:Visual={...original,sequence:{...original.sequence!,messages:original.sequence!.messages.map(message=>({...message,evidence:[{path:'/docs/example'}]}))}};
  const result=mermaidAdapter.serialize(withEvidence,ctx);
  expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_PARTICIPANT_FIELDS',loss:true}));
  expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_PARTICIPANT_ROLE',loss:true}));
  expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_MESSAGE_FIELDS',loss:true}));
 });
});
