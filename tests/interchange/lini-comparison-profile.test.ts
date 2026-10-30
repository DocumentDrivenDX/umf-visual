// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Visual} from '../../src/extensions/visual';
import {parseLiniComparison,serializeLiniComparison,type LiniComparisonForm} from '../../src/interchange/lini/comparison';
import {readLiniProfile} from '../../src/interchange/lini/profile-syntax';

const forms=['matrix','before-after','quadrant'] as const satisfies readonly LiniComparisonForm[];
const files:{[K in LiniComparisonForm]:string}={matrix:'fixtures/visual/inventory/helix-adr-options.json','before-after':'fixtures/visual/forms/visuals-before-after.json',quadrant:'fixtures/visual/forms/layout-engines.json'};
async function sample(form:LiniComparisonForm):Promise<Visual>{const doc=JSON.parse(await Bun.file(resolve(files[form])).text());return doc.extensions['umf.visual'] as Visual;}
const nativeJs=resolve('.cache/lini/lini_wasm.js'),nativeWasm=resolve('.cache/lini/lini_wasm_bg.wasm');
let native:undefined|{diagnostics(source:string,options:unknown):string;compile(source:string,options:unknown):string};
if(existsSync(nativeJs)&&existsSync(nativeWasm)){
 const runtime=await import(pathToFileURL(nativeJs).href) as {default(options:{module_or_path:Uint8Array}):Promise<void>;diagnostics(source:string,options:unknown):string;compile(source:string,options:unknown):string};
 await runtime.default({module_or_path:await readFile(nativeWasm)});native=runtime;
}
const partial=(visual:Visual)=>visual.comparison;
const svgText=(svg:string)=>[...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(match=>match[1]!.replace(/<\/tspan>\s*<tspan[^>]*>/g,' ').replace(/<[^>]*>/g,'').replaceAll('&amp;','&').replaceAll('&apos;',"'").replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&gt;','>'));
function tableBounds(svg:string){return [...svg.matchAll(/<g class="lini-node lini-table lini-group lini-block" data-id="([^"]+)" transform="translate\((-?[\d.]+),(-?[\d.]+)\)">\s*<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*\/>/g)].map(match=>({id:match[1]!,x:Number(match[2])+Number(match[4]),y:Number(match[3])+Number(match[5]),width:Number(match[6]),height:Number(match[7])}));}
function expectNoOverlappingTables(svg:string){const bounds=tableBounds(svg);expect(bounds.length).toBeGreaterThanOrEqual(3);for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){const a=bounds[i]!,b=bounds[j]!;expect(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y).toBe(true);}}

for(const form of forms)test('serializes and reads back the native '+form+' fixture with exact values and IDs',async()=>{
 const visual=await sample(form),serialized=serializeLiniComparison(visual),source=serialized.statements.join('\n')+'\n';
 expect(serialized.diagnostics.filter(item=>item.severity==='error')).toEqual([]);expect(serialized.statements.length).toBeGreaterThan(0);
 const parsed=parseLiniComparison(readLiniProfile(source),form);
 expect(parsed.diagnostics.filter(item=>item.severity==='error')).toEqual([]);expect(parsed.comparison).toEqual(partial(visual));
 expect(parsed.identityMap.filter(item=>item.kind==='item').map(item=>item.visualId)).toEqual(visual.comparison?.items.map(item=>item.id)??[]);
 expect(parsed.identityMap.filter(item=>item.kind==='criterion').map(item=>item.visualId)).toEqual(visual.comparison?.criteria.map(item=>item.id)??[]);
 expect(parsed.coverage.some(item=>(item.path==='/extensions/umf.visual/comparison/values'||/^\/extensions\/umf\.visual\/comparison\/values\/\d+$/.test(item.path))&&item.aspect==='order')).toBe(true);
 expect(parsed.coverage.some(item=>/\/comparison\/values\/\d+\/order$/.test(item.path))).toBe(false);
 if(form==='quadrant'){
  const labels=readLiniProfile(source).flatMap(node=>node.children.flatMap(child=>child.children.map(cell=>(cell.label??'').replace(/\n/g,' '))));
  for(const criterion of visual.comparison!.criteria){expect(source).toContain(criterion.label.split(' ')[0]!);expect(labels).toContain('measure: rating');expect(labels).toContain('max: '+criterion.max);expect(labels).toContain(('low: '+JSON.stringify(criterion.low)).replace(/\n/g,' '));expect(labels).toContain(('high: '+JSON.stringify(criterion.high)).replace(/\n/g,' '));}
 }
 if(native){
  const nativeDiagnostics=JSON.parse(native.diagnostics(source,{})) as {diagnostics:{severity:string;code:string}[]};expect(nativeDiagnostics.diagnostics).toEqual([]);
  const svg=native.compile(source,{});expect(svg.startsWith('<svg')).toBe(true);const text=svgText(svg);expectNoOverlappingTables(svg);
  for(const item of visual.comparison!.items)expect(text).toContain(item.label);
  for(const criterion of visual.comparison!.criteria)expect(text).toContain(criterion.label);
  for(const value of visual.comparison!.values){const expected=value.text??(value.rating===undefined?value.support:String(value.rating));if(expected!==undefined)expect(text.join('\n')).toContain(expected);}
  if(form==='matrix')for(const value of visual.comparison!.values)if(value.note)expect(text.join('\n')).toContain(value.note);
  if(form==='before-after')expect(svg).toContain('The theme&apos;s tokens');
  if(form==='quadrant'){const marks=[...svg.matchAll(/<title>([^<]+)<\/title>/g)].map(match=>match[1]);expect(marks).toEqual(visual.comparison!.items.map(item=>item.label+': 1'));expect(svg).toContain('transform="translate(368,-196.2)"');expect(svg).toContain('quadrant-chosen-item');expect(svg).toContain('Chosen item');}
 }
});

test('matrix text edits round trip while copied cells, missing headers and unknown properties refuse',async()=>{
 const visual=await sample('before-after'),source=serializeLiniComparison(visual).statements.join('\n')+'\n';
 const changed=source.replace('Four places','Five places');
 expect(parseLiniComparison(readLiniProfile(changed),'before-after').comparison?.values[0]?.text).toBe('Five places');
 const removed=source.replace('|cell#matrix-header-item| "Item ID";','');expect(parseLiniComparison(readLiniProfile(removed),'before-after').comparison).toBeUndefined();
 const extra=source.replace(/(\|table#comparison-criteria\|[^\n]*columns: [^;]+;)/,'$1 style: red;');expect(parseLiniComparison(readLiniProfile(extra),'before-after').comparison).toBeUndefined();
});

test('quadrant bubbles must match visible rating values, exact scales and stable axes',async()=>{
 const visual=await sample('quadrant'),source=serializeLiniComparison(visual).statements.join('\n')+'\n';
 const moved=source.replace('at: 3 3; value: 1;','at: 2 3; value: 1;');expect(parseLiniComparison(readLiniProfile(moved),'quadrant').comparison).toBeUndefined();
 const rating=source.replace('rating: 3','rating: 2');expect(parseLiniComparison(readLiniProfile(rating),'quadrant').comparison).toBeUndefined();
 const range=source.replace('range: 0 3; side: bottom;','range: 0 4; side: bottom;');expect(parseLiniComparison(readLiniProfile(range),'quadrant').comparison).toBeUndefined();
 const deletion=source.replace(/\s*\|bubble#bubble_656c6b6a73\|[^\n]+\n/,'\n');expect(parseLiniComparison(readLiniProfile(deletion),'quadrant').comparison).toBeUndefined();
});

test('quadrant decision identity is explicit when bubbles share coordinates and ratings map to emitted cells',async()=>{
 const visual=await sample('quadrant'),comparison=visual.comparison!;
 const sameCoordinates={...visual,comparison:{...comparison,values:comparison.values.map(value=>({...value,rating:1})),chosen:{item:comparison.items.at(-1)!.id,reason:'Keep the final item even when points coincide.'}}};
 const serialized=serializeLiniComparison(sameCoordinates),source=serialized.statements.join('\n')+'\n',parsed=parseLiniComparison(readLiniProfile(source),'quadrant');
 expect(parsed.comparison?.chosen).toEqual(sameCoordinates.comparison!.chosen);
 for(const mapping of parsed.identityMap.filter(entry=>entry.kind==='value')){
  expect(mapping.nativeId).toMatch(/_rating$/);expect(source).toContain('|cell#'+mapping.nativeId+'|');
  expect(mapping.path).toMatch(/\/comparison\/values\/\d+$/);
 }
 const changed=source.replace('|cell#quadrant-chosen-item| "id: '+sameCoordinates.comparison!.chosen!.item+'";','|cell#quadrant-chosen-item| "id: '+sameCoordinates.comparison!.items[0]!.id+'";');
 expect(parseLiniComparison(readLiniProfile(changed),'quadrant').comparison?.chosen?.item).toBe(sameCoordinates.comparison!.items[0]!.id);
});

test('comparison refuses unsupported values, duplicate pairs, missing choices and invalid axes',async()=>{
 const matrix=await sample('matrix'),values=matrix.comparison!.values;
 const duplicate={...matrix,comparison:{...matrix.comparison!,values:[...values,values[0]!]}};expect(serializeLiniComparison(duplicate).statements).toEqual([]);
 const badMeasure={...matrix,comparison:{...matrix.comparison!,values:values.map((value,index)=>index===0?{...value,rating:3}:value)}};expect(serializeLiniComparison(badMeasure).statements).toEqual([]);
 const quadrant=await sample('quadrant'),axes={...quadrant,comparison:{...quadrant.comparison!,axes:{x:'control',y:'missing'}}};expect(serializeLiniComparison(axes).statements).toEqual([]);
});

test('matrix notes and empty text values preserve exact typed content and presence',async()=>{
 const visual=await sample('before-after'),comparison=visual.comparison!;
 const detailed={...visual,comparison:{...comparison,items:comparison.items.map((item,index)=>index===0?{...item,detail:''}:item),criteria:comparison.criteria.map((item,index)=>index===0?{...item,detail:'Exact criterion detail'}:item),values:comparison.values.map((value,index)=>index===0?{...value,text:'',note:''}:value)}};
 const source=serializeLiniComparison(detailed).statements.join('\n')+'\n',parsed=parseLiniComparison(readLiniProfile(source),'before-after');
 expect(parsed.comparison).toEqual(detailed.comparison);
 expect(source).toContain('detail:');expect(source).toContain('text:');expect(source).toContain('note:');
});
