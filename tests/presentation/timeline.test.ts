// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readVisualDocument,getVisual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';
import {planDateHistoryEvents} from '../../src/presentation/timeline-layout';

const load=async()=>readVisualDocument(await Bun.file('fixtures/visual/forms/helix-releases.json').text(),'json');

test('Graphviz history maps each unchanged source event to a fixed proportional date position',async()=>{
 const document=await load(),visual=getVisual(document),before=JSON.stringify(document),layout=planDateHistoryEvents(visual.timeline!.events!)!,plan=compilePresentation(document,{backend:'graphviz'});
 expect(plan.ok).toBe(true);if(!plan.ok||!layout.ok)return;
 expect(plan.execution).toEqual({runtime:'graphviz',layoutEngine:'neato',nodePositions:'fixed'});
 expect(plan.elementMap.filter(item=>item.kind==='event')).toEqual(layout.events.map(row=>({logicalId:row.event.id,sourcePath:`/extensions/umf.visual/timeline/events/${row.sourceIndex}`,nativeId:`event_${row.sourceIndex+1}`,kind:'event'})));
 const xByIndex=new Map<number,number>();
 for(const row of layout.events){
  const sourceLine=plan.source.split('\n').find(line=>line.trimStart().startsWith(`event_${row.sourceIndex+1} [`));
  expect(sourceLine).toContain(`<B>${row.event.label}</B>`);expect(sourceLine).toContain(row.event.at);
  const position=/pos="([\d.-]+),([\d.-]+)!"/u.exec(sourceLine??'');expect(position).not.toBeNull();if(position)xByIndex.set(row.sourceIndex,Number(position[1]));
 }
 const firstX=Math.min(...xByIndex.values()),lastX=Math.max(...xByIndex.values()),span=lastX-firstX;
 for(const row of layout.events)expect(Math.abs((xByIndex.get(row.sourceIndex)!-firstX)/span-row.dayOffset/(layout.lastDay-layout.firstDay))).toBeLessThan(0.001);
 const sameDate=layout.events.filter(row=>row.event.at==='2026-04-06');expect(new Set(sameDate.map(row=>xByIndex.get(row.sourceIndex))).size).toBe(1);
 expect(plan.source.match(/\bid="date_axis"/gu)).toHaveLength(1);
 expect(plan.source.match(/->/gu)).toHaveLength(1);
 expect(plan.approximations[0]?.representation).toContain('Y positions are collision packing only');
 expect(JSON.stringify(document)).toBe(before);
});

test('Mermaid history is a categorical date ledger with one carrier per source event and no relations',async()=>{
 const document=await load(),visual=getVisual(document),layout=planDateHistoryEvents(visual.timeline!.events!)!,plan=compilePresentation(document,{backend:'mermaid'});
 expect(plan.ok).toBe(true);if(!plan.ok||!layout.ok)return;
 expect(plan.nativeFormat).toBe('mermaid');
 expect(plan.elementMap.filter(item=>item.kind==='event')).toHaveLength(layout.events.length);
 expect(plan.source).toContain('heading["HELIX releases"]:');
 expect(plan.source).toContain('ledger_note["Chronological order');
 expect(plan.source).toMatch(/\n  columns [2-8]\n/u);
 const cardLines=plan.source.split('\n').filter(line=>/^\s+event_\d+\["/u.test(line));
 expect(cardLines).toHaveLength(layout.events.length);
 expect(cardLines).toEqual(layout.events.map(row=>`  event_${row.sourceIndex+1}["${row.event.label}<br/>${row.event.at}<br/>id: ${row.event.id}"]`));
 for(const row of layout.events){
  const mapping=plan.elementMap.find(item=>item.kind==='event'&&item.sourcePath===`/extensions/umf.visual/timeline/events/${row.sourceIndex}`);
  expect(mapping).toMatchObject({logicalId:row.event.id,nativeId:`event_${row.sourceIndex+1}`});
  expect(plan.source).toContain(`${mapping!.nativeId}["${row.event.label}<br/>${row.event.at}<br/>id: ${row.event.id}"]`);
 }
 expect(plan.approximations[0]?.representation).toContain('not proportional to elapsed time');
 expect(plan.approximations[0]?.representation).toContain('no causal or duration relationships');
});

test('history subset refuses period axes and unprojected event properties at their source paths',async()=>{
 const document=await load(),modified=structuredClone(document);
 (modified.extensions!['umf.visual'] as any).timeline.events[0].detail='Unqualified detail';
 let result=compilePresentation(modified,{backend:'graphviz'});
 expect(result.ok).toBe(false);if(!result.ok)expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'PRESENTATION_TIMELINE_SCOPE',path:'/extensions/umf.visual/timeline/events/0/detail'}));
 const periodDocument=structuredClone(document);
 (periodDocument.extensions!['umf.visual'] as any).timeline.scale={kind:'period',periods:[{id:'p1',label:'One'}]};
 for(const event of (periodDocument.extensions!['umf.visual'] as any).timeline.events)event.at='p1';
 result=compilePresentation(periodDocument,{backend:'mermaid'});
 expect(result.ok).toBe(false);if(!result.ok)expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'PRESENTATION_TIMELINE_SCOPE',path:'/extensions/umf.visual/timeline/scale'}));
});
