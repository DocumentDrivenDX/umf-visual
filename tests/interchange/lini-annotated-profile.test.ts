// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Document} from '@umf/core';
import {parseAnnotatedLini,serializeAnnotatedLini} from '../../src/interchange/lini/annotated';
import {readLiniProfile} from '../../src/interchange/lini/profile-syntax';

const examples=[
 ['stat','fixtures/visual/forms/umf-ac-satisfied.json'],['bar','fixtures/visual/forms/umf-ac-status.json'],['line','fixtures/visual/forms/umf-ac-trend.json'],['meter','fixtures/visual/forms/umf-ac-coverage.json'],
 ['history','fixtures/visual/forms/helix-releases.json'],['milestones','fixtures/visual/forms/umf-releases.json'],['roadmap','fixtures/visual/forms/visuals-roadmap.json'],
 ['matrix','fixtures/visual/inventory/helix-adr-options.json'],['before-after','fixtures/visual/forms/visuals-before-after.json'],['quadrant','fixtures/visual/forms/layout-engines.json'],
] as const;
const decodeXml=(text:string)=>text.replace(/&amp;/g,'&').replace(/&apos;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#x([0-9a-f]+);/gi,(_,hex:string)=>String.fromCodePoint(parseInt(hex,16))).replace(/&#([0-9]+);/g,(_,decimal:string)=>String.fromCodePoint(Number(decimal)));
function svgCellText(svg:string,id:string):string|undefined {
 const escaped=id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),match=new RegExp('<g\\b[^>]*data-id="'+escaped+'"[^>]*>([\\s\\S]*?)<\\/g>').exec(svg);if(!match)return;
 const text=/<text\b[^>]*>([\s\S]*?)<\/text>/.exec(match[1]!);return text?decodeXml(text[1]!.replace(/<[^>]*>/g,'')):undefined;
}
const nativeJs=resolve('.cache/lini/lini_wasm.js'),nativeWasm=resolve('.cache/lini/lini_wasm_bg.wasm');
let native:undefined|{diagnostics(source:string,options:unknown):string;compile(source:string,options:unknown):string};
if(existsSync(nativeJs)&&existsSync(nativeWasm)){
 const runtime=await import(pathToFileURL(nativeJs).href) as {default(options:{module_or_path:Uint8Array}):Promise<void>;diagnostics(source:string,options:unknown):string;compile(source:string,options:unknown):string};
 await runtime.default({module_or_path:await readFile(nativeWasm)});native=runtime;
}

test('all ten original metric, timeline, and comparison forms survive the annotated Lini wrapper',async()=>{
 for(const[form,file]of examples){
  const document=JSON.parse(await Bun.file(resolve(file)).text()) as Document,result=serializeAnnotatedLini(document);
  expect(result.text,form+': '+JSON.stringify(result.diagnostics)).toBeDefined();expect(result.document).toEqual(document);expect(result.diagnostics.filter(item=>item.severity==='error')).toEqual([]);
  const parsed=parseAnnotatedLini(result.text!);expect(parsed.document,form+': '+JSON.stringify(parsed.diagnostics)).toEqual(document);
  const tree=readLiniProfile(result.text!),annotationCells=tree[0]!.children.find(node=>node.id==='umf_annotations')!.children.filter(node=>node.id.startsWith('ann_value_'));
  expect(annotationCells.length,form+' visible annotations').toBeGreaterThan(0);
  expect(parsed.coverage.some(item=>item.representation==='profile-annotation')).toBe(true);
  if(native){
   const diagnostics=JSON.parse(native.diagnostics(result.text!,{})) as {diagnostics:{severity:string;code:string}[]};expect(diagnostics.diagnostics,form+' native compiler diagnostics').toEqual([]);
   const svg=native.compile(result.text!,{});expect(svg.startsWith('<svg'),form).toBe(true);
   for(const cell of annotationCells)expect(svgCellText(svg,cell.id),form+' '+cell.id).toBe(cell.label);
   const visual=document.extensions!['umf.visual'] as {kind:string;form:string;metric?:{series:{points:{value:number;at?:string}[]}[]};timeline?:unknown;comparison?:unknown};
   if(visual.kind==='metric')for(const series of visual.metric!.series)for(const point of series.points)expect(svg).toContain(String(point.value));
   if(visual.kind==='comparison'){
    // Soft wraps are rendered as separate SVG tspans; they represent one
    // visible space in the native profile and must be rejoined for assertions.
    const visibleText=decodeXml(svg).replace(/<\/tspan>\s*<tspan\b[^>]*>/g,' ').replace(/<[^>]*>/g,'');
    for(const value of (visual.comparison as any).values){const text=value.text??value.support??value.rating;if(text!==undefined)expect(visibleText).toContain(String(text));}
   }
  }
 }
});

test('visible annotation edits survive readback; deleted, copied, moved, and styled carriers refuse',async()=>{
 const original=JSON.parse(await Bun.file(resolve('fixtures/visual/forms/umf-ac-satisfied.json')).text()) as Document;
 const emitted=serializeAnnotatedLini(original);expect(emitted.text,JSON.stringify(emitted.diagnostics)).toBeDefined();const source=emitted.text!,row=source.split('\n').find(line=>line.includes('ann_value_')&&line.includes('How many'));expect(row).toBeDefined();
 const edited=source.replace(row!,row!.replace('How many','How many exactly')).replace('"2026-10-02" 55','"2026-10-02" 56'),readback=parseAnnotatedLini(edited);expect(readback.document,JSON.stringify(readback.diagnostics)).toBeDefined();
 const actual=(readback.document!.extensions!['umf.visual'] as any);expect(actual.question).toBe('How many exactly of umf\'s acceptance criteria are satisfied, and is that rising?');expect(actual.metric.series[0].points[0]).toEqual({at:'2026-10-02',value:56});expect(actual.source.path).toBe('umf:docs/helix/03-test/acceptance-criteria-ledger.json');
 const key=/\|cell#(ann_key_[^|]+)\|/.exec(source);expect(key).not.toBeNull();
 for(const invalid of [source.replace(row![0],''),source.replace(row![0],row![0]+'\n'+row![0]),source.replace(key![1],key![1]+'_forged'),source.replace('|group#umf_visual| { layout: grid;','|group#umf_visual| { layout: grid; style: red;')])expect(parseAnnotatedLini(invalid).document).toBeUndefined();
});

test('native presentation edits that are outside the profile refuse after the canonical AST guard',async()=>{
 const document=JSON.parse(await Bun.file(resolve('fixtures/visual/forms/umf-ac-satisfied.json')).text()) as Document,source=serializeAnnotatedLini(document).text!;
 const styled=source.replace('{ layout: grid; columns: repeat(1); gap: 24; padding: 24; }','{ layout: grid; columns: repeat(1); gap: 24; padding: 24; style: red; }');
 expect(styled).not.toBe(source);expect(parseAnnotatedLini(styled).document).toBeUndefined();
});
