// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readVisualDocument,getVisual,type Visual} from '../../src/extensions/visual';
import {expectedGraphvizConnectionCount,isUnsupportedPresentationDiagnostics} from '../../scripts/presentation/build';

test('Graphviz native connection-count probe includes state transitions and its initial helper only',async()=>{
 const raw=await Bun.file('fixtures/visual/forms/helix-authoring-state.json').text(),document=readVisualDocument(raw,'json'),state=getVisual(document);
 expect(expectedGraphvizConnectionCount(state)).toBe(3);
 state.state!.final=['checked-out'];
 expect(expectedGraphvizConnectionCount(state)).toBe(3);
});

test('Graphviz native connection-count probe follows each supported source relation collection',()=>{
 const flow:Visual={id:'flow-count',kind:'flow',form:'network',question:'?',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],edges:[{id:'ab',from:'a',to:'b'}]};
 const entities:Visual={id:'entity-count',kind:'structure',form:'entities',question:'?',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],structure:{entities:[{node:'a',fields:[]},{node:'b',fields:[]}],references:[{id:'ab',from:{node:'a'},to:{node:'b'}},{id:'ba',from:{node:'b'},to:{node:'a'}}]}};
 const sequence:Visual={id:'sequence-count',kind:'sequence',form:'lifelines',question:'?',sequence:{participants:[],messages:[]}};
 expect(expectedGraphvizConnectionCount(flow)).toBe(1);
 expect(expectedGraphvizConnectionCount(entities)).toBe(2);
 expect(expectedGraphvizConnectionCount(sequence)).toBe(0);
});

test('Graphviz date-history axis helper is not counted as an event relation',async()=>{
 const document=readVisualDocument(await Bun.file('fixtures/visual/forms/helix-releases.json').text(),'json'),timeline=getVisual(document);
 expect(expectedGraphvizConnectionCount(timeline)).toBe(1);
 timeline.timeline!.events=timeline.timeline!.events!.filter(event=>event.at==='2026-04-06');
 expect(expectedGraphvizConnectionCount(timeline)).toBe(0);
});

test('build classifies only known valid-source projection refusals as unsupported',()=>{
 const diagnostic=(code:string)=>({code,path:'/extensions/umf.visual',message:'test classification',severity:'error' as const});
 expect(isUnsupportedPresentationDiagnostics([diagnostic('PRESENTATION_STATE_AMBIGUOUS_TRANSITION')])).toBe(true);
 expect(isUnsupportedPresentationDiagnostics([diagnostic('PRESENTATION_STATE_NODE_PROPERTY')])).toBe(true);
 expect(isUnsupportedPresentationDiagnostics([diagnostic('PRESENTATION_FORM')])).toBe(true);
 expect(isUnsupportedPresentationDiagnostics([diagnostic('PRESENTATION_OPTIONS')])).toBe(false);
 expect(isUnsupportedPresentationDiagnostics([diagnostic('PRESENTATION_STATE_INTERNAL')])).toBe(false);
 expect(isUnsupportedPresentationDiagnostics([diagnostic('VISUAL_UNKNOWN')])).toBe(false);
 expect(isUnsupportedPresentationDiagnostics([diagnostic('PRESENTATION_STATE_LAYOUT'),diagnostic('VISUAL_UNKNOWN')])).toBe(false);
 expect(isUnsupportedPresentationDiagnostics([diagnostic('PRESENTATION_TIMELINE_SCOPE')])).toBe(true);
 expect(isUnsupportedPresentationDiagnostics([diagnostic('PRESENTATION_TIMELINE_DATE')])).toBe(true);
 expect(isUnsupportedPresentationDiagnostics([diagnostic('PRESENTATION_TIMELINE_INTERNAL')])).toBe(false);
 expect(isUnsupportedPresentationDiagnostics([diagnostic('PRESENTATION_LINI_TIMELINE_SCOPE')])).toBe(true);
 expect(isUnsupportedPresentationDiagnostics([diagnostic('PRESENTATION_LINI_TIMELINE_EVENTS')])).toBe(true);
 expect(isUnsupportedPresentationDiagnostics([diagnostic('PRESENTATION_LINI_TIMELINE_DATE')])).toBe(true);
 expect(isUnsupportedPresentationDiagnostics([diagnostic('PRESENTATION_LINI_TIMELINE_TEXT')])).toBe(true);
 expect(isUnsupportedPresentationDiagnostics([diagnostic('PRESENTATION_LINI_TIMELINE_INTERNAL')])).toBe(false);
 expect(isUnsupportedPresentationDiagnostics([diagnostic('PRESENTATION_LINI_TIMELINE_SCOPE'),diagnostic('VISUAL_INVALID')])).toBe(false);
});
