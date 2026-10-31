// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Document} from '@umf/core';
import {exportVisual,importVisual} from '../../src';
import {parseAnnotatedLini,serializeAnnotatedLini} from '../../src/interchange/lini/annotated';
import {readLiniProfile} from '../../src/interchange/lini/profile-syntax';
import {liniAdapter} from '../../src/interchange/lini/index';

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

test('signed metric values survive flow-link lexer additions and pinned native readback',async()=>{
 const document=JSON.parse(await Bun.file(resolve('fixtures/visual/forms/umf-ac-status.json')).text()) as Document;
 (document.extensions!['umf.visual'] as any).metric.series[0].points[0].value=-5;
 const exported=exportVisual(document,{format:'lini',profile:'umf.visual.lini.annotated/1'});
 expect(exported.ok,JSON.stringify(exported.diagnostics)).toBe(true);
 const imported=importVisual(exported.text!,{format:'lini',profile:'umf.visual.lini.annotated/1',id:document.id,question:(document.extensions!['umf.visual'] as any).question});
 expect(imported.ok,JSON.stringify(imported.diagnostics)).toBe(true);expect(imported.document).toEqual(document);
 const tokens=readLiniProfile('|block#negative| { width: -.5; }');
 expect(tokens[0]!.properties[0]!.value).toEqual([expect.objectContaining({kind:'number',value:'-.5'})]);
 if(native){
  expect(JSON.parse(native.diagnostics(exported.text!,{})).diagnostics).toEqual([]);
  expect(native.compile(exported.text!,{})).toContain('-5');
 }
});

test('ordinary titled flows and entities preserve actual nested native endpoint scopes',async()=>{
 for(const path of ['fixtures/catalog/canary-flow.json','fixtures/catalog/canary-entities.json']){
  const document=JSON.parse(await Bun.file(resolve(path)).text()) as Document,visual=document.extensions!['umf.visual'] as any;
  const emitted=liniAdapter.serialize(visual,{id:visual.id,question:visual.question});expect(emitted.text,JSON.stringify(emitted.diagnostics)).toBeDefined();
  const parsed=liniAdapter.parse(emitted.text!,{id:visual.id,question:visual.question});expect(parsed.visual,JSON.stringify(parsed.diagnostics)).toBeDefined();
  expect(parsed.visual?.title).toBe(visual.title);
  const mapped=(rows:typeof parsed.identityMap)=>rows.map(row=>row.kind+':'+row.nativeId).sort();expect(mapped(parsed.identityMap)).toEqual(mapped(emitted.identityMap));
  for(const mapping of parsed.identityMap){expect(mapping.nativeId).toStartWith('umf_visual.');if(mapping.kind==='edge'||mapping.kind==='reference')expect(mapping.nativeId).toContain('->umf_visual.');}
  if(native){expect(JSON.parse(native.diagnostics(emitted.text!,{})).diagnostics).toEqual([]);expect(native.compile(emitted.text!,{})).toContain('<svg');}
 }
 const escaped='|group#umf_visual| "T" {} [\n|block#a| "A"\n]\n|block#b| "B"\na -> b\n';
 expect(liniAdapter.parse(escaped,{id:'bounded',question:'Q?'}).visual).toBeUndefined();
 const before='a -> b\n|group#umf_visual| "T" {} [\n|block#a| "A"\n|block#b| "B"\n]\n';
 expect(liniAdapter.parse(before,{id:'bounded',question:'Q?'}).visual).toBeUndefined();
 const legacy=liniAdapter.parse('|block#a| "A"\n|block#b| "B"\na -> b\n',{id:'legacy',question:'Q?'});
 expect(legacy.visual).toBeDefined();expect(legacy.identityMap.every(row=>!row.nativeId.startsWith('umf_visual.'))).toBe(true);
});

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

test('annotated Lini flow maps native blocks and directed links, with visible IDs for edited-source readback',async()=>{
 for(const file of ['fixtures/catalog/canary-flow.json','fixtures/visual/inventory/beacon-ci-nightly.json']){
  const original=JSON.parse(await Bun.file(resolve(file)).text()) as Document,result=serializeAnnotatedLini(original);
  expect(result.text,file+': '+JSON.stringify(result.diagnostics)).toBeDefined();
  expect(result.document,file+' canonical readback').toEqual(original);
  const visual=(original.extensions!['umf.visual'] as any);
  if(visual.form==='pipeline')expect(result.diagnostics.some(item=>item.code==='LINI_PIPELINE_LAYOUT_LOSS'&&item.loss)).toBe(true);
  const tree=readLiniProfile(result.text!),root=tree[0]!,graph=root.children.find(node=>node.id==='umf_graph')!;
  expect(graph.type).toBe('group');expect(graph.children.filter(node=>node.type==='block').length).toBe((original.extensions!['umf.visual'] as any).nodes.length);
  expect(graph.children.filter(node=>node.type==='link').length).toBe((original.extensions!['umf.visual'] as any).edges.length);
  const identity=root.children.find(node=>node.id==='umf_identity')!;
  expect(identity.children.some(node=>node.label?.includes('node:umf_visual.umf_graph.n_0'))).toBe(true);
  expect(result.coverage.some(item=>item.path.endsWith('/nodes/0/id')&&item.representation==='profile-annotation')).toBe(true);
  expect(result.identityMap.some(item=>item.kind==='node'&&item.nativeId==='umf_visual.umf_graph.n_0')).toBe(true);
  const firstNode=graph.children.find(node=>node.type==='block')!;
  const edited=result.text!.replace('|block#'+firstNode.id+'| '+JSON.stringify(firstNode.label), '|block#'+firstNode.id+'| '+JSON.stringify(firstNode.label+' edited'));
  const readback=parseAnnotatedLini(edited);
  expect(readback.document,JSON.stringify(readback.diagnostics)).toBeDefined();
  expect((readback.document!.extensions!['umf.visual'] as any).nodes[0].label).toBe((original.extensions!['umf.visual'] as any).nodes[0].label+' edited');
 }
});

test('pipeline visual form remains explicit loss without native pipeline geometry evidence',async()=>{
 const document=JSON.parse(await Bun.file(resolve('fixtures/visual/inventory/beacon-ci-nightly.json')).text()) as Document;
 const strict=exportVisual(document,{format:'lini',profile:'umf.visual.lini.annotated/1'});
 expect(strict.ok).toBe(false);expect(strict.diagnostics.some(item=>item.code==='LINI_PIPELINE_LAYOUT_LOSS'&&item.loss)).toBe(true);
 const reported=exportVisual(document,{format:'lini',profile:'umf.visual.lini.annotated/1',mode:'allow-reported-loss'});
 expect(reported.ok).toBe(true);expect(reported.text).toBeDefined();
 const strictImport=importVisual(reported.text,{format:'lini',profile:'umf.visual.lini.annotated/1',id:document.id,question:(document.extensions!['umf.visual'] as any).question});
 expect(strictImport.ok).toBe(false);
 const readback=importVisual(reported.text,{format:'lini',profile:'umf.visual.lini.annotated/1',id:document.id,question:(document.extensions!['umf.visual'] as any).question,mode:'allow-reported-loss'});
 expect(readback.ok).toBe(true);expect(readback.document).toEqual(document);expect(readback.diagnostics.some(item=>item.code==='LINI_PIPELINE_LAYOUT_LOSS'&&item.loss)).toBe(true);
});
