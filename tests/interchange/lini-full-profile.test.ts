// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileFullRecords,fullRecordId} from '../../src/interchange/full/records';
import type {FullScene} from '../../src/interchange/full/types';
import {liniFullAdapter} from '../../src/interchange/lini/full';
import {compileFullScene} from '../../src/interchange/full/scene';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {liniDirectory,verifyLiniRuntime} from '../../scripts/interchange-runtime';
import {readLiniProfile,type LiniProfileNode} from '../../src/interchange/lini/profile-syntax';

const profile='umf.visual.lini.full/1';
const scene=():FullScene=>({format:'lini',profile,version:'1',kind:'flow',form:'network',records:compileFullRecords({kind:'flow',form:'network',nodes:[{id:'api',label:'API'},{id:'db',label:'Database'}],edges:[{id:'request',from:'api',to:'db',label:'sends'}],note:'retained text'}),nodes:[{id:'api',recordId:fullRecordId('/nodes/0/label'),identityRecordId:fullRecordId('/nodes/0/id'),shape:'box',width:120},{id:'db',recordId:fullRecordId('/nodes/1/label'),identityRecordId:fullRecordId('/nodes/1/id'),shape:'box'}],edges:[{id:'request',from:'api',to:'db',recordId:fullRecordId('/edges/0/label'),fromRecordId:fullRecordId('/edges/0/from'),toRecordId:fullRecordId('/edges/0/to')}],groups:[{id:'boundary',text:'Service boundary'}],approximations:[{path:'/nodes/1/shape',requested:'cylinder',renderedAs:'box',reason:'Lini full supports block primitives'}]});

function assertNativeLocators(source:string,recovered:FullScene):void {
 const roots=readLiniProfile(source,{allowDeepEndpoints:true}),elements=new Map<string,LiniProfileNode>(),nativeNodes=new Map<string,LiniProfileNode>();let linkIndex=0;
 const visit=(node:LiniProfileNode,parent:string)=>{if(node.type==='link'){const address=`${parent}/link[${linkIndex++}]`;elements.set(address,node);return;}const address=`${parent}/${node.type}#${node.id}`;elements.set(address,node);nativeNodes.set(node.id,node);for(const child of node.children)visit(child,address);};
 for(const root of roots){elements.set('umf_full_scene',root);for(const child of root.children)visit(child,'umf_full_scene');}
 for(const record of recovered.records){const carrier=recovered.locators?.[record.id];expect(carrier?.length).toBeGreaterThan(0);for(const locator of carrier??[]){const element=elements.get(locator.id);expect(element).toBeDefined();if(locator.slot==='label'){expect(element?.label).toBeDefined();if(element?.type==='link'){const wire=element.label??'';expect(record.type==='string'?JSON.stringify(wire):wire).toBe(record.value);}else if(element?.type==='block'&&element.id.startsWith('r')){expect(element.label).toContain(`[${record.type}]: ${record.value}`);}else {let label=element?.label??'';if(element?.type==='block'){const width=element.properties.find(property=>property.name==='width')?.value[0];if(width?.kind==='number'){const prefix='▮'.repeat(Math.round(Number(width.value)/36))+' | ';expect(label.startsWith(prefix)).toBe(true);label=label.slice(prefix.length);}}expect(record.type==='string'?JSON.stringify(label):label).toBe(record.value);}}
   else {expect(element?.type).toBe('link');const endpoint=element?.properties.find(property=>property.name===locator.slot)?.value[0]?.value;expect(endpoint).toBeDefined();const target=endpoint?.split('.').at(-1);expect(target&&nativeNodes.has(target)).toBe(true);}
  }}
}

test('Lini full emits readable primitives and typed residual rows with complete scene readback',()=>{
 const original=scene(),source=liniFullAdapter.emit(original);
 expect(source).toContain('|block#n');expect(source).toContain('"▮▮▮ | API"');expect(source).toContain('"Database"');expect(source).toContain('Additional properties');expect(source).toContain('retained text');
 const recovered=liniFullAdapter.read(source);expect(recovered.nodes).toEqual(original.nodes);expect(recovered.edges).toEqual(original.edges);expect(recovered.groups).toEqual(original.groups);expect(recovered.approximations).toEqual(original.approximations);assertNativeLocators(source,recovered);
 expect(new Map(recovered.records.map(record=>[record.path,record.value]))).toEqual(new Map(original.records.map(record=>[record.path,record.value])));
});

test('native primary label edits update their bound wire records',()=>{
 const source=liniFullAdapter.emit(scene()).replace('"▮▮▮ | API"','"▮▮▮ | Gateway"');
 const edited=liniFullAdapter.read(source);
 expect(edited.records.find(record=>record.path==='/nodes/0/label')?.value).toBe('"Gateway"');
 expect(edited.records.find(record=>record.path==='/edges/0/label')?.value).toBe('"sends"');
});

test('width-bound numeric labels carry bounded visible magnitude glyphs and independently read back exactly',async()=>{
 const pin=await verifyLiniRuntime(),compiler=await import(pathToFileURL(resolve(liniDirectory,'lini_wasm.js')).href);
 await compiler.default({module_or_path:await Bun.file(resolve(liniDirectory,'lini_wasm_bg.wasm')).bytes()});expect(compiler.version()).toBe(pin.version);
 const document=JSON.parse(await Bun.file('fixtures/visual/forms/umf-ac-coverage.json').text()),original=compileFullScene(document,'lini');
 const source=liniFullAdapter.emit(original),read=liniFullAdapter.read(source),numeric=original.nodes.find(node=>node.width!==undefined)!;
 expect(numeric).toBeDefined();const record=original.records.find(item=>item.id===numeric.recordId)!;
 const visible=record.type==='string'?JSON.parse(record.value):record.value,prefix='▮'.repeat(Math.round(numeric.width!/36))+' | ';
 expect(source).toContain(prefix+visible);expect(read.records.find(item=>item.path===record.path)?.value).toBe(record.value);expect(read.nodes.find(node=>node.id===numeric.id)?.width).toBe(numeric.width);
 const diagnostics=JSON.parse(compiler.diagnostics(source,{})),items=Array.isArray(diagnostics)?diagnostics:diagnostics.diagnostics;expect(items).toEqual([]);
 const svg=compiler.compile(source,{});expect(svg).toContain(prefix);expect(svg).toContain(String(visible));assertNativeLocators(source,read);
});

test('Lini full reader rejects magnitude glyph count changes and unsafe or altered native widths',async()=>{
 const original=compileFullScene(await Bun.file('fixtures/visual/forms/umf-ac-coverage.json').json(),'lini'),source=liniFullAdapter.emit(original),node=original.nodes.find(item=>item.width!==undefined)!;
 const prefix='▮'.repeat(Math.round(node.width!/36))+' | ',wrong='▮'.repeat(Math.round(node.width!/36)+1)+' | ';
 expect(()=>liniFullAdapter.read(source.replace(prefix,wrong))).toThrow(/glyph count/);
 const altered=node.width!+100;expect(()=>liniFullAdapter.read(source.replace(`width: ${node.width};`,`width: ${altered};`))).toThrow(/glyph count/);
 expect(()=>liniFullAdapter.read(source.replace(`width: ${node.width};`,`width: ${node.width}; width: ${node.width};`))).toThrow(/Duplicate property width/);
 expect(()=>liniFullAdapter.emit({...original,nodes:original.nodes.map(item=>item.id===node.id?{...item,width:396.01}:item)})).toThrow(/Malformed Lini full node/);
});

test('strict Lini full reader rejects missing native slots, unknown properties and malformed bindings',()=>{
 const source=liniFullAdapter.emit(scene());
 expect(()=>liniFullAdapter.read(source.replace('"Full view: flow / network"','"Full view: flow / network" { bogus: value; }'))).toThrow();
 expect(()=>liniFullAdapter.read(source.replace('/note — note [string]:','/note — other [string]:'))).toThrow();
 expect(()=>liniFullAdapter.read(source.replace('Edge request','Edge changed'))).toThrow();
 expect(()=>liniFullAdapter.read(source.replace('"Additional properties"','"Changed appendix"'))).toThrow();
 expect(()=>liniFullAdapter.read(source.replace(/("\/note — note \[string\]:[^\n]*")/, '$1 { width: "garbage"; }'))).toThrow();
});

test('Lini 1.1.0 native compiler resolves cross-group metric links without diagnostics',async()=>{
 const pin=await verifyLiniRuntime();
 const compiler=await import(pathToFileURL(resolve(liniDirectory,'lini_wasm.js')).href);
 await compiler.default({module_or_path:await Bun.file(resolve(liniDirectory,'lini_wasm_bg.wasm')).bytes()});
 expect(compiler.version()).toBe(pin.version);
 for(const file of ['fixtures/catalog/canary-flow.json','fixtures/catalog/canary-entities.json','fixtures/visual/forms/umf-ac-coverage.json']){
  const full=compileFullScene(JSON.parse(await Bun.file(file).text()),'lini'),source=liniFullAdapter.emit(full),result=JSON.parse(compiler.diagnostics(source,{})),diagnostics=Array.isArray(result)?result:result.diagnostics;
  expect(diagnostics).toEqual([]);expect(compiler.compile(source,{})).toContain('<svg');
  const recovered=liniFullAdapter.read(source);expect(recovered.edges.length).toBe(full.edges.length);expect(Object.keys(recovered.locators??{})).toHaveLength(full.records.length);expect(new Map(recovered.records.map(record=>[record.path,record.value]))).toEqual(new Map(full.records.map(record=>[record.path,record.value])));assertNativeLocators(source,recovered);
 }
 const nested=scene();nested.groups=[{id:'outer',text:'Outer'},{id:'inner',text:'Inner',parent:'outer'}];nested.nodes[0]!.group='inner';
 const nestedSource=liniFullAdapter.emit(nested),native=JSON.parse(compiler.diagnostics(nestedSource,{}));
 expect((Array.isArray(native)?native:native.diagnostics)).toEqual([]);
 const nestedRead=liniFullAdapter.read(nestedSource);expect(nestedRead.groups).toEqual(nested.groups);assertNativeLocators(nestedSource,nestedRead);
});
