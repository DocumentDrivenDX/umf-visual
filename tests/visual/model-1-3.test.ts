// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createVisualDocument,getVisual,inspectVisual,LATEST_VISUAL_VERSION,latestVisualPackage,upgradeVisualDocument,type Visual} from '../../src/extensions/visual';

const visual=(value:Visual,version:'1.2.0'|'1.3.0'='1.3.0')=>createVisualDocument(value,'visual:'+value.id,version);
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');

test('1.3 is the explicit latest schema while the complete 1.2 schema remains frozen',()=>{
 const schema=JSON.parse(readFileSync('spec/extensions/visual/schema.json','utf8'));
 const frozen=JSON.parse(readFileSync('spec/extensions/visual/1.2.0/schema.json','utf8'));
 const manifest=JSON.parse(readFileSync('spec/extensions/visual/package.json','utf8'));
 const frozenManifest=JSON.parse(readFileSync('spec/extensions/visual/1.2.0/package.json','utf8'));
 expect(schema.$id).toBe('urn:umf:visual:1.3.0');expect(manifest.version).toBe('1.3.0');expect(manifest.schema).toEqual(schema);
 expect(frozen.$id).toBe('urn:umf:visual:1.2.0');expect(frozenManifest.version).toBe('1.2.0');expect(frozenManifest.schema).toEqual(frozen);
 expect(hash(readFileSync('spec/extensions/visual/1.2.0/schema.json'))).toBe('318c08e4b5737d257f6f5af5fd6928e1d878ec799e0a9505ca9f9167bed1c923');
 expect(hash(readFileSync('spec/extensions/visual/1.2.0/package.json'))).toBe('7aa28523353854805e4bc759b8f699167cc64167c4cc6d9c17d7bb7d21dee7d8');
 expect(hash(readFileSync('src/extensions/visual/legacy-1-2.ts'))).toBe('03bb33e8ac613a92c01c0c24ad3b268db6cd8a54cdda8e2ac24890147d565adb');
 expect(LATEST_VISUAL_VERSION).toBe('1.3.0');expect(latestVisualPackage.version).toBe('1.3.0');
});

test('1.3 sequence notes are anchored, globally identified, and resolve messages and participants',()=>{
 const sequence:Visual={id:'notes',kind:'sequence',form:'lifelines',question:'What happens around the call?',sequence:{
  participants:[{id:'client',label:'Client',icon:'person'},{id:'worker',label:'Worker',icon:'service'}],
  messages:[{id:'call',from:'client',to:'worker',label:'Call',kind:'call'},{id:'self',from:'worker',to:'worker',label:'Self call',kind:'call'},{id:'async',from:'worker',to:'client',label:'Continue',kind:'async'}],
  notes:[{id:'context',text:'The worker checks cached state.',participants:['worker'],before:'call'},{id:'follow-up',text:'The client continues asynchronously.',participants:['client','worker'],after:'async'}]
 }};
 expect(inspectVisual(visual(sequence))).toMatchObject({valid:true,complete:true});
 const noAnchor=structuredClone(sequence);delete noAnchor.sequence!.notes![0]!.before;expect(()=>visual(noAnchor)).toThrow(/VISUAL_SEQUENCE_NOTE/);
 const twoAnchors=structuredClone(sequence);twoAnchors.sequence!.notes![0]!.after='async';expect(()=>visual(twoAnchors)).toThrow(/VISUAL_SEQUENCE_NOTE/);
 const unresolved=structuredClone(sequence);unresolved.sequence!.notes![0]!.before='missing';expect(()=>visual(unresolved)).toThrow(/VISUAL_REFERENCE/);
 const badParticipant=structuredClone(sequence);badParticipant.sequence!.notes![0]!.participants=['missing'];expect(()=>visual(badParticipant)).toThrow(/VISUAL_REFERENCE/);
 const duplicate=structuredClone(sequence);duplicate.sequence!.notes![0]!.id='call';expect(()=>visual(duplicate)).toThrow(/VISUAL_ID/);
});

test('1.3 tree composition orders only roots and is restricted to structure/tree',()=>{
 const tree:Visual={id:'mindmap',kind:'structure',form:'tree',question:'How do the topics relate?',nodes:[
  {id:'root',label:'Core'},{id:'left',label:'Storage',parent:'root'},{id:'right',label:'Compute',parent:'root'}
 ],layout:{kind:'tree',direction:'bilateral',order:['root']}};
 expect(inspectVisual(visual(tree))).toMatchObject({valid:true,complete:true});
 const includesChild=structuredClone(tree);includesChild.layout!.order=['root','left'];expect(()=>visual(includesChild)).toThrow(/VISUAL_LAYOUT/);
 const wrongKind:Visual={id:'flow-tree-layout',kind:'flow',form:'network',question:'What flows?',nodes:[{id:'n',label:'N'}],layout:{kind:'tree'}};
 expect(()=>visual(wrongKind)).toThrow(/VISUAL_LAYOUT/);
 const wrongForm:Visual={...tree,form:'nested'};expect(()=>visual(wrongForm)).toThrow(/VISUAL_LAYOUT/);
 const grouped:Visual={...tree,groups:[{id:'g',label:'A group',role:'region',layout:{kind:'tree'}}]};expect(()=>visual(grouped)).toThrow(/VISUAL_LAYOUT/);
 const flowGroup:Visual={id:'flow-group-tree',kind:'flow',form:'network',question:'What flows?',groups:[{id:'g',label:'A group',role:'region',layout:{kind:'tree'}}],nodes:[{id:'n',label:'N',group:'g'}]};expect(()=>visual(flowGroup)).toThrow(/VISUAL_LAYOUT/);
});

test('1.3 adds the shared parallelogram shape and validates generic icon identifiers',()=>{
 const model:Visual={id:'entities',kind:'structure',form:'entities',question:'Which entities exist?',nodes:[
  {id:'user',label:'User',shape:'parallelogram',icon:'person-user'},
  {id:'task',label:'Task',shape:'parallelogram',icon:'work-item'}
 ],structure:{entities:[{node:'user',fields:[{name:'id',keys:['pk']}]},{node:'task',fields:[{name:'id',keys:['pk']}]}]}};
 expect(inspectVisual(visual(model))).toMatchObject({valid:true,complete:true});
 const badIcon=structuredClone(model);badIcon.nodes![0]!.icon='raw-lini-|block';expect(()=>visual(badIcon)).toThrow();
 const participant:Visual={id:'participant-icon',kind:'sequence',form:'lifelines',question:'Who?',sequence:{participants:[{id:'a',label:'A',icon:'person'},{id:'b',label:'B',icon:'database'}],messages:[{id:'m',from:'a',to:'b',label:'Connect'}]}};
 expect(inspectVisual(visual(participant))).toMatchObject({valid:true,complete:true});
});

test('1.3 edge directedness is optional and explicit false is retained without a default',()=>{
 const base:Visual={id:'edge-directedness',kind:'flow',form:'network',question:'Which edges have arrowheads?',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],edges:[{id:'association',from:'a',to:'b',label:'Association',directed:false},{id:'ordinary',from:'b',to:'a',label:'Ordinary edge'}]};
 const latest=visual(base);expect(inspectVisual(latest)).toMatchObject({valid:true,complete:true});
 const edges=getVisual(latest).edges!;expect(edges[0]!.directed).toBe(false);expect(Object.hasOwn(edges[1]!,'directed')).toBe(false);
 const legacy=visual(base,'1.2.0');expect(inspectVisual(legacy)).toMatchObject({valid:true,complete:false,diagnostics:expect.arrayContaining([expect.objectContaining({code:'VISUAL_UNKNOWN',path:'/extensions/umf.visual/edges/0/directed'})])});
});

test('1.3 keeps sequence group semantics broad and 1.2 still reports 1.3 notes as unknown',()=>{
 const base:Visual={id:'grouping',kind:'sequence',form:'lifelines',question:'What repeats?',groups:[{id:'loop',label:'Retry',role:'loop'}],sequence:{
  participants:[{id:'a',label:'A'},{id:'b',label:'B'}],messages:[{id:'m1',from:'a',to:'b',label:'One',group:'loop'},{id:'m2',from:'b',to:'a',label:'Outside'},{id:'m3',from:'a',to:'b',label:'Three',group:'loop'}]
 }};
 expect(inspectVisual(visual(base))).toMatchObject({valid:true,complete:true});
 const extended:Visual={id:'unknown-note-content',kind:'sequence',form:'lifelines',question:'What is preserved?',sequence:{participants:[{id:'a',label:'A'},{id:'b',label:'B'}],messages:[{id:'m',from:'a',to:'b',label:'Call'}],notes:[{id:'n',text:'Retain annotation',participants:['a'],before:'m',sourceMetadata:{system:'native'}}]}} as any;
 const extendedDoc=visual(extended);expect(inspectVisual(extendedDoc)).toMatchObject({valid:true,complete:false,diagnostics:expect.arrayContaining([expect.objectContaining({code:'VISUAL_UNKNOWN',path:'/extensions/umf.visual/sequence/notes/0/sourceMetadata'})])});expect(getVisual(extendedDoc).sequence!.notes![0]!.text).toBe('Retain annotation');
 const legacy=visual({id:'legacy-note',kind:'sequence',form:'lifelines',question:'What is retained?',sequence:{participants:[{id:'a',label:'A'},{id:'b',label:'B'}],messages:[{id:'m',from:'a',to:'b',label:'Call'}],notes:[{id:'n',text:'Unknown in 1.2',participants:['a'],before:'m'}]}} as any,'1.2.0');
 expect(inspectVisual(legacy)).toMatchObject({valid:true,complete:false,diagnostics:expect.arrayContaining([expect.objectContaining({code:'VISUAL_UNKNOWN',path:'/extensions/umf.visual/sequence/notes'})])});
 const upgraded=upgradeVisualDocument(legacy,'1.3.0');expect(inspectVisual(upgraded)).toMatchObject({valid:true,complete:true});
 expect(()=>upgradeVisualDocument(upgraded,'1.2.0')).toThrow(/cannot be downgraded/);
});
