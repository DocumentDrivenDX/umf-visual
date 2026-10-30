// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Visual} from '../../src/extensions/visual';
import {parseLiniMetric,serializeLiniMetric,type LiniMetricForm} from '../../src/interchange/lini/metric';
import {readLiniProfile} from '../../src/interchange/lini/profile-syntax';

const forms=['stat','bar','line','meter'] as const satisfies readonly LiniMetricForm[];
async function sample(form:LiniMetricForm):Promise<Visual>{
 const file=resolve('fixtures/visual/forms/umf-ac-'+({stat:'satisfied',bar:'status',line:'trend',meter:'coverage'} as const)[form]+'.json');
 const document=JSON.parse(await Bun.file(file).text());return document.extensions['umf.visual'] as Visual;
}
const nativeJs=resolve('.cache/lini/lini_wasm.js'),nativeWasm=resolve('.cache/lini/lini_wasm_bg.wasm');
let native:undefined|{diagnostics(source:string,options:unknown):string;compile(source:string,options:unknown):string};
if(existsSync(nativeJs)&&existsSync(nativeWasm)){
 const runtime=await import(pathToFileURL(nativeJs).href) as {default(options:{module_or_path:Uint8Array}):Promise<void>;diagnostics(source:string,options:unknown):string;compile(source:string,options:unknown):string};
 await runtime.default({module_or_path:await readFile(nativeWasm)});native=runtime;
}

for(const form of forms)test('serializes and reads back the native '+form+' fixture with exact chart data',async()=>{
 const visual=await sample(form),expected=visual.metric!,serialized=serializeLiniMetric(visual);
 expect(serialized.diagnostics.filter(item=>item.severity==='error')).toEqual([]);
 expect(serialized.statements.length).toBeGreaterThan(0);
 const source=serialized.statements.join('\n')+'\n',nodes=readLiniProfile(source),readback=parseLiniMetric(nodes,form);
 expect(readback.diagnostics.filter(item=>item.severity==='error')).toEqual([]);
 expect(readback.metric).toEqual(expected);
 expect(readback.identityMap.filter(item=>item.kind==='series').map(item=>item.visualId)).toEqual(expected.series.map(item=>item.id));
 expect(readback.identityMap.filter(item=>item.kind==='point')).toHaveLength(expected.series.reduce((count,series)=>count+series.points.length,0));
 expect(readback.coverage.some(item=>item.path==='/extensions/umf.visual/metric/unit'&&item.aspect==='value')).toBe(true);
 expect(readback.coverage.some(item=>item.path==='/extensions/umf.visual/metric/series'&&item.aspect==='order')).toBe(true);
 if(form==='bar')expect(readback.identityMap.filter(item=>item.kind==='category').map(item=>item.visualId)).toEqual(expected.axis?.kind==='category'?expected.axis.categories.map(item=>item.id):[]);
 if(native){
  const diagnostics=JSON.parse(native.diagnostics(source,{})) as {diagnostics:{severity:string;code:string}[]};
  expect(diagnostics.diagnostics).toEqual([]);
  const svg=native.compile(source,{});
  expect(svg.startsWith('<svg')).toBe(true);
  if(form==='stat'){
   expect(svg).toContain('180');expect(svg).toContain('Satisfied');expect(svg).toContain('2026');expect(svg).toContain('Better: up');
  }else if(form==='bar'){
   for(const label of ['Satisfied','Untested','Uncited Coverage','Asserted Unbacked','Reviewed Exception'])expect(svg).toContain(label);
   for(const value of ['180','407','233','0','17'])expect(svg).toContain(value);
   expect(svg).toContain('satisfied');expect(svg).toContain('uncited-coverage');
   const order=['Satisfied','Untested','Uncited Coverage','Asserted Unbacked','Reviewed Exception'].map(label=>svg.indexOf('>'+label+'</text>'));
   expect(order.every((at,index)=>at>=0&&(index===0||at>order[index-1]!))).toBe(true);
  }else if(form==='line'){
   for(const value of ['55','180','155','407','Oct 2 2026','Oct 23 2026','Satisfied','Untested','Better: up'])expect(svg).toContain(value);
   expect(svg.indexOf('Satisfied: Oct 2 2026')).toBeLessThan(svg.indexOf('Satisfied: Oct 23 2026'));
   expect(svg.indexOf('Satisfied: Oct 23 2026')).toBeLessThan(svg.indexOf('Untested: Oct 2 2026'));
  }else{
   expect(svg).toContain('180');expect(svg).toContain('837');expect(svg).toContain('Target 837');expect(svg).toContain('Satisfied');
  }
 }
});

test('an edited point value is read back as data and a category ID/label/order conflict refuses atomically',async()=>{
 const line=serializeLiniMetric(await sample('line')),source=line.statements.join('\n')+'\n';
 const edited=source.replace('"2026-10-02" 55','"2026-10-02" 56');
 const readback=parseLiniMetric(readLiniProfile(edited),'line');
 expect(readback.diagnostics.some(item=>item.severity==='error')).toBe(false);
 expect(readback.metric?.series[0]?.points[0]).toEqual({at:'2026-10-02',value:56});
 const bar=serializeLiniMetric(await sample('bar')),barSource=bar.statements.join('\n')+'\n';
 const mismatch=barSource.replace('categories: "Satisfied", "Untested"','categories: "Changed", "Untested"');
 const refused=parseLiniMetric(readLiniProfile(mismatch),'bar');
 expect(refused.metric).toBeUndefined();expect(refused.diagnostics.some(item=>item.code==='LINI_METRIC_CATEGORIES'&&item.severity==='error')).toBe(true);
 const idMismatch=barSource.replace('|cell#cat_736174697366696564-id| "satisfied";','|cell#cat_736174697366696564-id| "changed";');
 const refusedId=parseLiniMetric(readLiniProfile(idMismatch),'bar');
 expect(refusedId.metric).toBeUndefined();expect(refusedId.diagnostics.some(item=>item.code==='LINI_METRIC_CATEGORIES'&&item.severity==='error')).toBe(true);
});

test('unsupported metric formats, scales and series cardinalities refuse without producing source',async()=>{
 const baseline=await sample('bar');
 const currency={...baseline,metric:{...baseline.metric!,format:{kind:'currency' as const,currency:'USD'}}};
 expect(serializeLiniMetric(currency).statements).toEqual([]);
 expect(serializeLiniMetric(currency).diagnostics.some(item=>item.code==='LINI_METRIC_FORMAT'&&item.severity==='error')).toBe(true);
 const multiple={...baseline,metric:{...baseline.metric!,series:[...baseline.metric!.series,...baseline.metric!.series]}};
 expect(serializeLiniMetric(multiple).statements).toEqual([]);
 const badAxis={...baseline,metric:{...baseline.metric!,axis:{kind:'time' as const}}};
 expect(serializeLiniMetric(badAxis).statements).toEqual([]);
});

test('malformed native meter reference and stat value edits are refused',async()=>{
 const meter=serializeLiniMetric(await sample('meter')),source=meter.statements.join('\n')+'\n';
 const mismatch=source.replace('"Target 837" { at: 837;','"Target 838" { at: 837;');
 const parsed=parseLiniMetric(readLiniProfile(mismatch),'meter');
 expect(parsed.metric).toBeUndefined();expect(parsed.diagnostics.some(item=>item.severity==='error')).toBe(true);
 const stat=serializeLiniMetric(await sample('stat')),statSource=stat.statements.join('\n')+'\n';
 const bad=statSource.replace('"180" { font-size: 48; }','"181" { font-size: 48; }');
 expect(parseLiniMetric(readLiniProfile(bad),'stat').metric).toBeUndefined();
 for(const token of ['0xb4','0180',' 180','180.0','1.8e2']){
  const malformed=statSource.replace('"180" { font-size: 48; }','"'+token+'" { font-size: 48; }');
  expect(parseLiniMetric(readLiniProfile(malformed),'stat').metric,token).toBeUndefined();
 }
});

test('unknown nested metric constructs, native styles, and metadata child nodes refuse',async()=>{
 const visual=await sample('line'),nodes=readLiniProfile(serializeLiniMetric(visual).statements.join('\n')+'\n'),line=nodes[0]!.children.find(node=>node.type==='chart')!.children.find(node=>node.type==='line')!,axis=nodes[0]!.children.find(node=>node.type==='chart')!.children.find(node=>node.type==='axis')!;
 const extraStyle=structuredClone(nodes);extraStyle[0]!.children.find(node=>node.type==='chart')!.children.find(node=>node.type==='line')!.properties.push({name:'style',value:[{kind:'word',value:'red',offset:0}]});
 expect(parseLiniMetric(extraStyle,'line').metric).toBeUndefined();
 const extraChild=structuredClone(nodes);extraChild[0]!.children.find(node=>node.type==='chart')!.children.find(node=>node.type==='line')!.children.push({...line,id:'nested-copy'});
 expect(parseLiniMetric(extraChild,'line').metric).toBeUndefined();
 const axisChild=structuredClone(nodes);axisChild[0]!.children.find(node=>node.type==='chart')!.children.find(node=>node.type==='axis')!.children.push({...axis,id:'nested-axis'});
 expect(parseLiniMetric(axisChild,'line').metric).toBeUndefined();
 const stat=readLiniProfile(serializeLiniMetric(await sample('stat')).statements.join('\n')+'\n');
 const style=structuredClone(stat);style[0]!.children.find(node=>node.id==='metric-stat-value')!.properties[0]!.value[0]!.value='47';
 expect(parseLiniMetric(style,'stat').metric).toBeUndefined();
});

test('good, baseline and comparison values are visible native metadata around intrinsic chart data',async()=>{
 const base=await sample('meter'),visual={...base,metric:{...base.metric!,baseline:100,comparison:{label:'Plan',value:220}}};
 const serialized=serializeLiniMetric(visual),source=serialized.statements.join('\n')+'\n';
 expect(serialized.diagnostics.some(item=>item.severity==='error')).toBe(false);
 const parsed=parseLiniMetric(readLiniProfile(source),'meter');
 expect(parsed.metric).toEqual(visual.metric);
 expect(parsed.coverage.some(item=>item.path.endsWith('/baseline')&&item.aspect==='value')).toBe(true);
 expect(parsed.coverage.some(item=>item.path.endsWith('/target')&&item.aspect==='value'&&item.native.some(locator=>locator.id==='metric-meter-target'))).toBe(true);
 expect(parsed.coverage.some(item=>item.path.endsWith('/comparison/label')&&item.aspect==='value')).toBe(true);
 if(native){
  const nativeDiagnostics=JSON.parse(native.diagnostics(source,{})) as {diagnostics:{severity:string}[]};
  expect(nativeDiagnostics.diagnostics).toEqual([]);
  const svg=native.compile(source,{});
  expect(svg).toContain('Better: up');expect(svg).toContain('Baseline 100');expect(svg).toContain('Plan = 220');expect(svg).toContain('Target 837');
 }
});
