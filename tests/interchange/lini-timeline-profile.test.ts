// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Visual} from '../../src/extensions/visual';
import {parseLiniTimeline,serializeLiniTimeline,type LiniTimelineForm} from '../../src/interchange/lini/timeline';
import {readLiniProfile} from '../../src/interchange/lini/profile-syntax';

const forms=['history','milestones','roadmap'] as const satisfies readonly LiniTimelineForm[];
const files={history:'helix-releases',milestones:'umf-releases',roadmap:'visuals-roadmap'} as const;
async function sample(form:LiniTimelineForm):Promise<Visual>{const doc=JSON.parse(await Bun.file(resolve('fixtures/visual/forms/'+files[form]+'.json')).text());return doc.extensions['umf.visual'] as Visual;}
const nativeJs=resolve('.cache/lini/lini_wasm.js'),nativeWasm=resolve('.cache/lini/lini_wasm_bg.wasm');
let native:undefined|{diagnostics(source:string,options:unknown):string;compile(source:string,options:unknown):string};
if(existsSync(nativeJs)&&existsSync(nativeWasm)){
 const runtime=await import(pathToFileURL(nativeJs).href) as {default(options:{module_or_path:Uint8Array}):Promise<void>;diagnostics(source:string,options:unknown):string;compile(source:string,options:unknown):string};
 await runtime.default({module_or_path:await readFile(nativeWasm)});native=runtime;
}
const partial=(visual:Visual)=>{
 const timeline=visual.timeline!;
 if(visual.form==='roadmap')return{scale:timeline.scale,lanes:timeline.lanes,spans:timeline.spans?.map(({id,label,start,end,lane})=>({id,label,start,end,lane}))};
 return{scale:timeline.scale,events:timeline.events?.map(({id,label,at})=>({id,label,at}))};
};
const textPosition=(svg:string,text:string):{x:number;y:number}|undefined=>{
 for(const match of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g))if(match[2]===text){const x=/\bx="(-?[0-9.]+)"/.exec(match[1]!),y=/\by="(-?[0-9.]+)"/.exec(match[1]!);if(x&&y)return{x:Number(x[1]),y:Number(y[1])};}
};
const markerPositions=(svg:string)=>[...svg.matchAll(/class="lini-node lini-oval"[^>]*transform="translate\((-?[0-9.]+),(-?[0-9.]+)\)"/g)].map(match=>({x:Number(match[1]),y:Number(match[2])}));
function roadmapBlockBounds(svg:string){return [...svg.matchAll(/<g class="lini-node lini-block" data-id="([^"]+)" transform="translate\((-?[\d.]+),(-?[\d.]+)\)">\s*<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*\/>\s*<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(match=>({id:match[1]!,x:Number(match[2])+Number(match[4]),y:Number(match[3])+Number(match[5]),width:Number(match[6]),height:Number(match[7]),text:match[8]!}));}

for(const form of forms)test('serializes and reads back the native '+form+' fixture without changing date or period identity',async()=>{
 const visual=await sample(form),serialized=serializeLiniTimeline(visual),source=serialized.statements.join('\n')+'\n';
 expect(serialized.diagnostics.filter(item=>item.severity==='error')).toEqual([]);
 expect(serialized.statements.length).toBeGreaterThan(0);
 if(form==='roadmap')expect(serialized.diagnostics.filter(item=>item.code==='LINI_TIMELINE_ANNOTATION').length).toBe(8);
 const parsed=parseLiniTimeline(readLiniProfile(source),form);
 expect(parsed.diagnostics.filter(item=>item.severity==='error')).toEqual([]);
 expect(parsed.timeline).toEqual(partial(visual));
 expect(parsed.identityMap.filter(item=>item.kind==='event').map(item=>item.visualId)).toEqual(visual.timeline?.events?.map(item=>item.id)??[]);
 if(form==='roadmap'){
  expect(parsed.identityMap.filter(item=>item.kind==='period').map(item=>item.visualId)).toEqual(visual.timeline?.scale.kind==='period'?visual.timeline.scale.periods.map(item=>item.id):[]);
  expect(parsed.identityMap.filter(item=>item.kind==='lane').map(item=>item.visualId)).toEqual(visual.timeline?.lanes?.map(item=>item.id)??[]);
  expect(parsed.identityMap.filter(item=>item.kind==='span').map(item=>item.visualId)).toEqual(visual.timeline?.spans?.map(item=>item.id)??[]);
 }else{
  expect(parsed.timeline?.events).toHaveLength(visual.timeline?.events?.length??0);
  expect(parsed.coverage.some(item=>item.path.endsWith('/events')&&item.aspect==='order')).toBe(true);
 }
 expect(parsed.coverage.some(item=>item.path.endsWith('/scale/kind')&&item.aspect==='value')).toBe(true);
 if(native){
  const nativeDiagnostics=JSON.parse(native.diagnostics(source,{})) as {diagnostics:{severity:string;code:string}[]};
  expect(nativeDiagnostics.diagnostics).toEqual([]);
  const svg=native.compile(source,{});expect(svg.startsWith('<svg')).toBe(true);
  if(form==='history'){
   for(const event of visual.timeline!.events!)expect(svg).toContain(event.label);
   expect(svg).toContain('Date');expect(svg).toContain('Events');
   const events=visual.timeline!.events!,positions=markerPositions(svg);expect(positions).toHaveLength(events.length);
   const sameDay=events.map((event,index)=>({event,position:positions[index]!})).filter(item=>item.event.at==='2026-04-06');
   expect(sameDay.length).toBeGreaterThan(1);expect(new Set(sameDay.map(item=>item.position.x)).size).toBe(1);expect(new Set(sameDay.map(item=>item.position.y)).size).toBe(sameDay.length);
   const uniqueDates=[...new Set(events.map(item=>item.at))].sort(),dateXs=uniqueDates.map(date=>positions[events.findIndex(item=>item.at===date)]!.x);
   expect(dateXs.every((x,index)=>index===0||x>=dateXs[index-1]!)).toBe(true);
  }else if(form==='milestones'){
   for(const event of visual.timeline!.events!)expect(svg).toContain(event.label);
   const dated=visual.timeline!.events!.map((event,index)=>({event,position:markerPositions(svg)[index]}));
   expect(dated.every(item=>item.position!==undefined)).toBe(true);
   const firstDate=dated.find(item=>item.event.at==='2026-10-13')!.position!,lastDate=dated.find(item=>item.event.at==='2026-10-23')!.position!;
   expect(lastDate.x).toBeGreaterThan(firstDate.x);
  }else{
   const blocks=roadmapBlockBounds(svg);expect(blocks.length).toBeGreaterThan(10);
   for(let i=0;i<blocks.length;i++)for(let j=i+1;j<blocks.length;j++){const a=blocks[i]!,b=blocks[j]!;expect(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y).toBe(true);}
   for(const block of blocks.filter(item=>item.id.startsWith('span_'))){const lines=(block.text.match(/<tspan\b/g)??[]).length||1;expect(block.height).toBeGreaterThanOrEqual(lines*28);const span=visual.timeline!.spans!.find(item=>'span_'+[...item.id].map(char=>char.codePointAt(0)!.toString(16).padStart(2,'0')).join('')===block.id)!;const periods=visual.timeline!.scale.kind==='period'?visual.timeline!.scale.periods:[],start=periods.findIndex(item=>item.id===span.start),end=periods.findIndex(item=>item.id===span.end);expect(block.width).toBe((end-start+1)*240-20);}
   const renderedText=[...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(match=>match[1]!.replace(/<\/tspan>\s*<tspan[^>]*>/g,' ').replace(/<[^>]*>/g,''));
   for(const period of visual.timeline!.scale.kind==='period'?visual.timeline!.scale.periods:[])expect(renderedText).toContain(period.label);
   for(const lane of visual.timeline!.lanes??[])expect(renderedText).toContain(lane.label);
   for(const span of visual.timeline!.spans??[])expect(renderedText).toContain(span.label);
   expect(renderedText.join('\n')).toContain('umf.visual/1');expect(renderedText.join('\n')).toContain('HELIX PR #95 lands as it is');
  }
 }
});

test('native event label and date edits are read back; deleting a valid event is a meaningful edit',async()=>{
 const visual=await sample('history'),source=serializeLiniTimeline(visual).statements.join('\n')+'\n';
 const first=visual.timeline!.events![0]!;
 const edited=source.replace('|mark#event_76302d312d30| "v0.1.0" { at: "2026-04-06"','|mark#event_76302d312d30| "First release" { at: "2026-04-07"');
 const changed=parseLiniTimeline(readLiniProfile(edited),'history');
 expect(changed.timeline?.events?.[0]).toEqual({...first,label:'First release',at:'2026-04-07'});
 const deleted=source.replace(/\s*\|mark#event_76302d312d30\|[^\n]+\n/,'\n');
 expect(parseLiniTimeline(readLiniProfile(deleted),'history').timeline?.events).toHaveLength(visual.timeline!.events!.length-1);
});

test('roadmap range edits round trip, while invalid periods, lanes, overlap and unknown IDs refuse',async()=>{
 const visual=await sample('roadmap'),source=serializeLiniTimeline(visual).statements.join('\n')+'\n';
 const moved=source.replace('|block#span_7370616e2d6d31| "umf: `umf.visual/1`" { cell: 3 2; span: 1 1; width: 220; height: 28; }','|block#span_7370616e2d6d31| "umf: `umf.visual/1`" { cell: 4 2; span: 2 1; width: 460; height: 28; }');
 const parsed=parseLiniTimeline(readLiniProfile(moved),'roadmap');
 expect(parsed.diagnostics.some(item=>item.severity==='error')).toBe(false);
 expect(parsed.timeline?.spans?.[1]).toMatchObject({start:'m2',end:'m3',lane:'umf'});
 const unknown=source.replace('span_7370616e2d6d31','unknown_7370616e2d6d31');
 expect(parseLiniTimeline(readLiniProfile(unknown),'roadmap').timeline).toBeUndefined();
 const noPeriod=source.replace('|block#period_6d37| "M7" { cell: 9 1; }','');
 expect(parseLiniTimeline(readLiniProfile(noPeriod),'roadmap').timeline).toBeUndefined();
 const badBounds=source.replace('cell: 3 2; span: 1 1;','cell: 3 2; span: 20 1;');
 expect(parseLiniTimeline(readLiniProfile(badBounds),'roadmap').timeline).toBeUndefined();
 const undersized=source.replace('height: 28;','height: 15;');
 expect(parseLiniTimeline(readLiniProfile(undersized),'roadmap').timeline).toBeUndefined();
 const narrow=source.replace('width: 220;','width: 200;');
 expect(parseLiniTimeline(readLiniProfile(narrow),'roadmap').timeline).toBeUndefined();
 const missingWidth=source.replace(' width: 220;','');
 expect(parseLiniTimeline(readLiniProfile(missingWidth),'roadmap').timeline).toBeUndefined();
});

test('overlapping roadmap spans occupy deterministic distinct subrows of the same lane',async()=>{
 const visual=await sample('roadmap'),timeline=visual.timeline!;
 const overlap={...visual,timeline:{...timeline,spans:[...timeline.spans!,{id:'overlap-proof',label:'Overlap proof',start:'m3',end:'m3',lane:'ux-builder'}]}};
 const source=serializeLiniTimeline(overlap).statements.join('\n')+'\n',parsed=parseLiniTimeline(readLiniProfile(source),'roadmap');
 expect(parsed.diagnostics.some(item=>item.severity==='error')).toBe(false);
 expect(parsed.timeline?.spans).toEqual(overlap.timeline.spans.map(({id,label,start,end,lane})=>({id,label,start,end,lane})));
 const rowOf=(id:string)=>{const block=readLiniProfile(source)[0]!.children.find(item=>item.id===id)!;return block.properties.find(item=>item.name==='cell')!.value[1]!.value;};
 expect(rowOf('span_7370616e2d6d33')).not.toBe(rowOf('span_6f7665726c61702d70726f6f66'));
 if(native){expect((JSON.parse(native.diagnostics(source,{})) as {diagnostics:unknown[]}).diagnostics).toEqual([]);expect(native.compile(source,{})).toContain('Overlap proof');}
 const collision=source.replace('cell: 5 4; span: 1 1;','cell: 5 3; span: 1 1;');
 expect(parseLiniTimeline(readLiniProfile(collision),'roadmap').timeline).toBeUndefined();
 const duplicate=source.replace('|block#span_6f7665726c61702d70726f6f66|','|block#span_7370616e2d6d33|');
 expect(()=>readLiniProfile(duplicate)).toThrow();
});

test('unsupported timeline meaning and malformed dates refuse without partial source',async()=>{
 const history=await sample('history'),badDate={...history,timeline:{...history.timeline!,events:[{...history.timeline!.events![0]!,at:'2026-02-30'}]}};
 expect(serializeLiniTimeline(badDate).statements).toEqual([]);
 const wrongScale={...history,timeline:{...history.timeline!,scale:{kind:'period' as const,periods:[]}}};
 expect(serializeLiniTimeline(wrongScale).statements).toEqual([]);
 const roadmap=await sample('roadmap'),missingLane={...roadmap,timeline:{...roadmap.timeline!,spans:roadmap.timeline!.spans!.map((span,index)=>index?span:{...span,lane:'missing'})}};
 expect(serializeLiniTimeline(missingLane).statements).toEqual([]);
});
