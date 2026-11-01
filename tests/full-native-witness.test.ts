// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {chromium,type Browser, type Page} from 'playwright';
import type {Document} from '@umf/core';
import type {InterchangeFormat} from '../src/interchange/types';
import {compileFullScene} from '../src/interchange/full/scene';
import {recoverFullRecords} from '../src/interchange/full/records';
import {decodeAnnotationValue} from '../src/interchange/annotations';
import {dotFullAdapter} from '../src/interchange/dot/full';
import {mermaidFullAdapter} from '../src/interchange/mermaid/full';
import {liniFullAdapter} from '../src/interchange/lini/full';
import {verifyFullNativeWitness} from '../scripts/full-native-witness';
import {verifyNativeFirstWitness} from '../scripts/full-native-witness';
import {tryNativeFirstExport} from '../src/interchange/full/native-first';
import {exportVisual} from '../src';
import {liniDirectory,verifyLiniRuntime} from '../scripts/interchange-runtime';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {FullScene} from '../src/interchange/full/types';

const adapters={dot:dotFullAdapter,mermaid:mermaidFullAdapter,lini:liniFullAdapter} as const;
let browser:Browser,page:Page;
beforeAll(async()=>{await setup();});
afterAll(async()=>{await browser?.close();},30000);
const xml=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const hexBytes=(value:string)=>Array.from(new TextEncoder().encode(value),byte=>byte.toString(16).padStart(2,'0')).join('');
const mermaidToken=(prefix:string,value:string)=>prefix+'_'+Array.from({length:value.length},(_,index)=>value.charCodeAt(index).toString(16).padStart(4,'0')).join('');
const liniIdEncode=(value:string)=>'x'+Array.from(new TextEncoder().encode(value),byte=>byte.toString(16).padStart(2,'0')).join('')+'00';
const liniTag=(prefix:string,id:string,metadata:unknown)=>prefix+liniIdEncode(id)+'z'+hexBytes(JSON.stringify(metadata));
const recordText=(scene:FullScene,id:string|undefined,text:string|undefined,fallback:string)=>{if(!id)return text??fallback;const row=scene.records.find(record=>record.id===id)!;const decoded=decodeAnnotationValue(row.type,row.value);return decoded.kind==='string'?decoded.value:row.value;};
const groupMeta=(scene:FullScene,id:string)=>{const group=scene.groups.find(item=>item.id===id)!,record=scene.records.find(item=>item.id===group.recordId);return{hasText:group.text!==undefined,...(record?{record:{path:record.path,type:record.type}}:{})};};
const nodeMeta=(scene:FullScene,id:string)=>{const node=scene.nodes.find(item=>item.id===id)!,record=scene.records.find(item=>item.id===node.recordId),identity=scene.records.find(item=>item.id===node.identityRecordId);return{hasText:node.text!==undefined,...(record?{record:{path:record.path,type:record.type}}:{}),...(identity?{identityPath:identity.path}:{})};};
function nativeNodeId(scene:FullScene,id:string):string{return scene.format==='dot'?'umf_full_node_'+hexBytes(id):scene.format==='mermaid'?mermaidToken('n',id):liniTag('n',id,nodeMeta(scene,id));}
function nativeGroupId(scene:FullScene,id:string):string{return scene.format==='dot'?'cluster_umf_full_group_'+hexBytes(id):scene.format==='mermaid'?mermaidToken('g',id):liniTag('g',id,groupMeta(scene,id));}
function liniAddress(scene:FullScene,id:string):string{const node=scene.nodes.find(item=>item.id===id)!;const parent:string[]=[];let group=node.group;while(group){const item=scene.groups.find(entry=>entry.id===group)!;parent.unshift(nativeGroupId(scene,item.id));group=item.parent;}return['umf_full_scene',...parent,nativeNodeId(scene,id)].join('.');}
function syntheticSvg(scene:FullScene):string{
 const width=scene.nodes.length*120+100,height=180,positions=new Map(scene.nodes.map((node,index)=>[node.id,{x:60+index*120,y:90}]));
 const carrier=(kind:'node'|'group',id:string,label:string)=>{
  const nativeId=kind==='node'?nativeNodeId(scene,id):nativeGroupId(scene,id);
  if(scene.format==='dot')return kind==='node'?`<g class="node"><title>${xml(nativeId)}</title><ellipse cx="${positions.get(id)?.x??30}" cy="${positions.get(id)?.y??30}" rx="18" ry="12"/><text x="${positions.get(id)?.x??30}" y="${positions.get(id)?.y??30}">${xml(label)}</text></g>`:`<g class="cluster"><title>${xml(nativeId)}</title><rect x="0" y="0" width="30" height="30"/><text x="15" y="15">${xml(label)}</text></g>`;
  if(scene.format==='mermaid')return kind==='node'?`<g class="node default" id="test-flowchart-${nativeId}-0"><rect x="${positions.get(id)?.x??30}" y="${positions.get(id)?.y??30}" width="36" height="24"/><foreignObject><div><span class="nodeLabel"><p>${xml(label)}</p></span></div></foreignObject></g>`:`<g class="cluster" id="test-${nativeId}"><g class="cluster-label"><text>${xml(label)}</text></g></g>`;
  if(kind==='group')return`<g class="lini-node lini-group" data-id="${xml(nativeId)}"><rect x="0" y="0" width="30" height="30"/><g class="lini-node lini-caption lini-block"><text class="lini-text">${xml(label)}</text></g></g>`;
  return`<g class="lini-node lini-block" data-id="${xml(nativeId)}" transform="translate(${positions.get(id)?.x??30},${positions.get(id)?.y??30})"><rect x="-18" y="-12" width="36" height="24"/><text class="lini-text">${xml(label)}</text></g>`;
 };
 const nodes=scene.nodes.map(node=>carrier('node',node.id,((scene.format==='mermaid'||scene.format==='lini')&&node.width!==undefined?'▮'.repeat(Math.max(0,Math.round(node.width/36)))+' | ':'')+recordText(scene,node.recordId,node.text,node.id))).join('');
 const groups=scene.groups.map(group=>carrier('group',group.id,recordText(scene,group.recordId,group.text,group.id))).join('');
 let pairCount=0;
 const links=scene.edges.map((edge,index)=>{
  const from=positions.get(edge.from)!,to=positions.get(edge.to)!,label=recordText(scene,edge.recordId,edge.text,'');
  if(scene.format==='dot')return`<g class="edge" id="umf_full_edge_${hexBytes(edge.id)}"><title>${xml(nativeNodeId(scene,edge.from))}-&gt;${xml(nativeNodeId(scene,edge.to))}</title><path d="M ${from.x} ${from.y} L ${to.x} ${to.y}"/>${edge.directed===false?'':'<polygon points="0,0 1,1 2,0"/>'}${edge.recordId||edge.text!==undefined?`<text>${xml(label)}</text>`:''}</g>`;
  if(scene.format==='mermaid'){
   const id=`L_${nativeNodeId(scene,edge.from)}_${nativeNodeId(scene,edge.to)}_${pairCount++}`;
   return`<path class="edge-thickness-normal" data-id="${id}" d="M ${from.x} ${from.y} L ${to.x} ${to.y}" ${edge.directed===false?'':'marker-end="url(#arrow)"'}/>${edge.recordId||edge.text!==undefined?`<g class="edgeLabel" transform="translate(${(from.x+to.x)/2},${(from.y+to.y)/2})"><g class="label" data-id="${id}"><span class="edgeLabel"><p>${xml(label)}</p></span></g></g>`:''}`;
  }
  const path=`<g class="lini-link" data-from="${xml(liniAddress(scene,edge.from))}" data-to="${xml(liniAddress(scene,edge.to))}"><path d="M ${from.x} ${from.y} L ${to.x} ${to.y}"/>${edge.directed===false?'':'<polygon class="lini-marker-arrow" points="0,0 1,1 2,0"/>'}${edge.recordId||edge.text!==undefined?`<text class="lini-link-label">${xml(label)}</text>`:''}</g>`;return path;
 }).join('');
 if(scene.format==='dot')return`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${groups}${nodes}${links}</svg>`;
 if(scene.format==='mermaid')return`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g class="clusters">${groups}</g><g class="nodes">${nodes}</g><g class="edges edgePaths">${links}</g></svg>`;
 return`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g class="lini-scene">${groups}${nodes}<g class="lini-links">${links}</g></g></svg>`;
}

async function setup(){browser=await chromium.launch({headless:true});page=await browser.newPage();}
test('native SVG witness scopes labels to each native primitive for every full profile',async()=>{
 const document=await Bun.file('fixtures/catalog/canary-supported-flow.json').json() as Document;
 for(const format of ['dot','mermaid','lini'] as InterchangeFormat[]){const adapter=adapters[format],source=adapter.emit(compileFullScene(document,format)),scene=adapter.read(source),svg=syntheticSvg(scene);const result=await verifyFullNativeWitness(page,source,svg,document,format);expect(result.primaryCarriers).toBeGreaterThan(0);expect(result.connections).toBe(scene.edges.length);expect(result.endpointAssociations).toBeGreaterThan(0);}
});

test('Lini metric width is witnessed as visible glyphs beside its exact scalar',async()=>{
 const document=await Bun.file('fixtures/visual/forms/umf-ac-trend.json').json() as Document;
 const source=liniFullAdapter.emit(compileFullScene(document,'lini')),scene=liniFullAdapter.read(source);
 const widthNode=scene.nodes.find(node=>node.width!==undefined);expect(widthNode).toBeDefined();
 const svg=syntheticSvg(scene),good=await verifyFullNativeWitness(page,source,svg,document,'lini');expect(good.primaryCarriers).toBeGreaterThan(0);
 const glyphs='▮'.repeat(Math.max(0,Math.round(widthNode!.width!/36)))+' | ';
 expect(svg).toContain(xml(glyphs+recordText(scene,widthNode!.recordId,widthNode!.text,widthNode!.id)));
 const missing=svg.replace(xml(glyphs+recordText(scene,widthNode!.recordId,widthNode!.text,widthNode!.id)),xml(recordText(scene,widthNode!.recordId,widthNode!.text,widthNode!.id)));
 await expect(verifyFullNativeWitness(page,source,missing,document,'lini')).rejects.toThrow(/label differs/);
});

test('a primary label cannot be supplied by an identical Additional properties string',async()=>{
 const document=await Bun.file('fixtures/catalog/canary-supported-flow.json').json() as Document,source=dotFullAdapter.emit(compileFullScene(document,'dot')),scene=dotFullAdapter.read(source),svg=syntheticSvg(scene);
 const primary=scene.nodes.find(node=>node.recordId)!;const record=scene.records.find(row=>row.id===primary.recordId)!;const expected=recordText(scene,record.id,undefined,'');
 const mutated=svg.replace(`<text x="${scene.nodes.indexOf(primary)*120+60}" y="90">${xml(expected)}</text>`,`<text x="${scene.nodes.indexOf(primary)*120+60}" y="90">missing-primary</text>`).replace('</svg>',`<g class="additional-properties"><text>${xml(expected)}</text></g></svg>`);
 await expect(verifyFullNativeWitness(page,source,mutated,document,'dot')).rejects.toThrow(/label differs/);
});

test('reversed geometry cannot pass under the original directed edge identity',async()=>{
 const document=await Bun.file('fixtures/catalog/canary-supported-flow.json').json() as Document,source=dotFullAdapter.emit(compileFullScene(document,'dot')),scene=dotFullAdapter.read(source),edge=scene.edges.find(item=>item.directed!==false);expect(edge).toBeDefined();const correct=syntheticSvg(scene),from=scene.nodes.findIndex(node=>node.id===edge!.from),to=scene.nodes.findIndex(node=>node.id===edge!.to),fx=60+from*120,tx=60+to*120;
 const reversed=correct.replace(`d="M ${fx} 90 L ${tx} 90"`,`d="M ${tx} 90 L ${fx} 90"`);
 await expect(verifyFullNativeWitness(page,source,reversed,document,'dot')).rejects.toThrow(/does not attach/);
});

test('primitive Lini endpoint attributes cannot mask a connector path detached from the endpoint shapes',async()=>{
 const document=await Bun.file('fixtures/catalog/canary-supported-flow.json').json() as Document,source=liniFullAdapter.emit(compileFullScene(document,'lini'));
 await verifyLiniRuntime();const runtime=await import(pathToFileURL(resolve(liniDirectory,'lini_wasm.js')).href) as {default(options:{module_or_path:Uint8Array}):Promise<void>;compile(source:string,options:unknown):string};await runtime.default({module_or_path:await Bun.file(resolve(liniDirectory,'lini_wasm_bg.wasm')).bytes()});
 const svg=runtime.compile(source,{}),scene=liniFullAdapter.read(source),good=await verifyFullNativeWitness(page,source,svg,document,'lini');expect(good.connections).toBe(scene.edges.length);
 const link=/<g class="lini-link" data-from="([^"]+)" data-to="([^"]+)">[\s\S]*?<path d="[^"]+"/.exec(svg);expect(link).toBeTruthy();const shifted=svg.replace(link![0],link![0].replace(/<path d="[^"]+"/,'<path d="M 10000 10000 L 10100 10100"'));expect(shifted).not.toBe(svg);expect(shifted).toContain(`data-from="${link![1]}" data-to="${link![2]}"`);
 await expect(verifyFullNativeWitness(page,source,shifted,document,'lini')).rejects.toThrow(/path does not attach to its declared endpoints/i);
},{timeout:30000});

async function graphvizSvg(source:string):Promise<string>{
 const child=Bun.spawn(['dot','-Tsvg'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});child.stdin.write(source);child.stdin.end();const [svg,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);if(exit!==0)throw new Error(stderr);return svg;
}
test('native-first DOT witness binds old-profile SVG nodes and directed edges',async()=>{
 const document=await Bun.file('fixtures/catalog/canary-supported-flow.json').json() as Document;
 const exported=exportVisual(document,{format:'dot',profile:'umf.visual.dot.annotated/1',mode:'strict'});expect(exported.ok&&exported.text).toBeTruthy();
 const witness=await verifyNativeFirstWitness(page,exported.text!,await graphvizSvg(exported.text!),document,'dot');
 expect(witness.tier).toBe('native-profile');expect(witness.sourceProfile).toBe('umf.visual.dot.annotated/1');expect(witness.connections).toBe(1);expect(witness.endpointAssociations).toBe(2);expect(witness.primaryCarriers).toBeGreaterThanOrEqual(3);
});
test('native-first SVG witness rejects a matching label moved outside the native node carrier',async()=>{
 const document=await Bun.file('fixtures/catalog/canary-supported-flow.json').json() as Document;
 const exported=exportVisual(document,{format:'dot',profile:'umf.visual.dot.annotated/1',mode:'strict'});expect(exported.ok&&exported.text).toBeTruthy();
 const svg=await graphvizSvg(exported.text!),mapping=exported.identityMap.find(item=>item.kind==='node')!;expect(mapping).toBeDefined();
 const title=`<title>${mapping.nativeId}</title>`,at=svg.indexOf(title),start=svg.lastIndexOf('<g ',at),end=svg.indexOf('</g>',at)+4,group=svg.slice(start,end),textNode=/<text\b[^>]*>[\s\S]*?<\/text>/.exec(group)?.[0];expect(at).toBeGreaterThanOrEqual(0);expect(textNode).toBeDefined();
 const nodeLabel=textNode!.replace(/^(<text\b[^>]*>)[\s\S]*?(<\/text>)$/,'$1Changed primary label$2'),changed=svg.slice(0,start)+group.replace(textNode!,nodeLabel)+svg.slice(end).replace('</svg>',`<text>${nodeLabel.replace(/^<text\b[^>]*>|<\/text>$/g,'')}</text></svg>`);
 await expect(verifyNativeFirstWitness(page,exported.text!,changed,document,'dot')).rejects.toThrow(/primary source value/);
});

test('native-first DOT entity field witness scopes exact type to its owner port row',async()=>{
 const document=await Bun.file('fixtures/visual/inventory/beacon-schema-workspace.json').json() as Document;
 const exported=exportVisual(document,{format:'dot',profile:'umf.visual.dot.annotated/1',mode:'strict'});expect(exported.ok&&exported.text).toBeTruthy();
 const field=exported.identityMap.find(item=>item.kind==='field')!;expect(field).toBeDefined();const owner=field.nativeId.slice(0,field.nativeId.indexOf(':'));
 const svg=await graphvizSvg(exported.text!),title=`<title>${owner}</title>`,at=svg.indexOf(title),start=svg.lastIndexOf('<g ',at),end=svg.indexOf('</g>',at)+4,group=svg.slice(start,end);expect(at).toBeGreaterThanOrEqual(0);expect(group).toContain('&quot;uuid&quot;');
 const changedGroup=group.replace('&quot;uuid&quot;','&quot;changed-type&quot;');expect(changedGroup).not.toBe(group);const changed=svg.slice(0,start)+changedGroup+svg.slice(end);
 await expect(verifyNativeFirstWitness(page,exported.text!,changed,document,'dot')).rejects.toThrow(/exactly one matching visible type cell/i);
});

test('native-first Mermaid witness binds sequence events to actual participant endpoints',async()=>{
 const document=await Bun.file('fixtures/visual/inventory/helix-request.json').json() as Document;
 const exported=exportVisual(document,{format:'mermaid',profile:'umf.visual.mermaid.annotated/1',mode:'strict'});expect(exported.ok&&exported.text).toBeTruthy();
 await page.setContent('<!doctype html><html><body></body></html>');await page.addScriptTag({path:resolve('node_modules/mermaid/dist/mermaid.min.js')});
 const svg=await page.evaluate(async(source)=>{const api=(window as any).mermaid;api.initialize({startOnLoad:false,securityLevel:'strict',deterministicIds:true,deterministicIDSeed:'native-first-test'});return(await api.render('native-first-test',source)).svg;},exported.text!);
 const witness=await verifyNativeFirstWitness(page,exported.text!,svg,document,'mermaid');
 expect(witness.sourceProfile).toBe('umf.visual.mermaid.annotated/1');expect(witness.connections).toBe((document.extensions?.['umf.visual'] as any).sequence.messages.length);expect(witness.endpointAssociations).toBe(witness.connections*2);
},{timeout:30000});

test('native-first Lini witness binds actual timeline period/event carriers',async()=>{
 const document=await Bun.file('fixtures/visual/forms/umf-releases.json').json() as Document;
 const exported=exportVisual(document,{format:'lini',profile:'umf.visual.lini.annotated/1',mode:'strict'});expect(exported.ok&&exported.text).toBeTruthy();
 const runtimePin=await verifyLiniRuntime(),runtimePath=resolve(liniDirectory,'lini_wasm.js'),wasmPath=resolve(liniDirectory,'lini_wasm_bg.wasm');
 const runtime=await import(pathToFileURL(runtimePath).href) as {default(options:{module_or_path:Uint8Array}):Promise<void>;version:()=>string;compile(source:string,options:unknown):string};await runtime.default({module_or_path:await Bun.file(wasmPath).bytes()});expect(runtime.version()).toBe(runtimePin.version);
 const svg=runtime.compile(exported.text!,{}),witness=await verifyNativeFirstWitness(page,exported.text!,svg,document,'lini');
 expect(witness.sourceProfile).toBe('umf.visual.lini.annotated/1');expect(witness.nativeIdsChecked).toBeGreaterThan(0);expect(witness.primaryCarriers).toBeGreaterThan(0);expect((document.extensions?.['umf.visual'] as any).timeline.events).toHaveLength(11);
 const marker=/<g class="lini-node lini-oval"[^>]*>[\s\S]*?<\/g>/.exec(svg);expect(marker).toBeTruthy();const missingMarker=svg.replace(marker![0],'');await expect(verifyNativeFirstWitness(page,exported.text!,missingMarker,document,'lini')).rejects.toThrow(/marker|event count/i);
 const label=/<text class="lini-text lini-chart-label"[^>]*>[^<]*<\/text>/.exec(svg);expect(label).toBeTruthy();const changedLabel=svg.replace(label![0],label![0].replace(/>([^<]*)<\/text>$/,'>$1 changed</text>'));await expect(verifyNativeFirstWitness(page,exported.text!,changedLabel,document,'lini')).rejects.toThrow(/marker\/label pair/i);
 const markerTransform=/<g class="lini-node lini-oval"[^>]*transform="translate\((-?[0-9.]+),(-?[0-9.]+)\)"/.exec(svg);expect(markerTransform).toBeTruthy();const shifted=svg.replace(markerTransform![0],markerTransform![0].replace(`translate(${markerTransform![1]},${markerTransform![2]})`,`translate(${Number(markerTransform![1])+35},${markerTransform![2]})`));expect(shifted).not.toBe(svg);await expect(verifyNativeFirstWitness(page,exported.text!,shifted,document,'lini')).rejects.toThrow(/date-scale position/i);
},{timeout:30000});

test('native-first Lini metric point carrier is series-scoped, not satisfied by its legend or another value',async()=>{
 const document=await Bun.file('fixtures/visual/forms/umf-ac-trend.json').json() as Document;
 const exported=exportVisual(document,{format:'lini',profile:'umf.visual.lini.annotated/1',mode:'strict'});expect(exported.ok&&exported.text).toBeTruthy();
 const runtimePath=resolve(liniDirectory,'lini_wasm.js'),wasmPath=resolve(liniDirectory,'lini_wasm_bg.wasm');await verifyLiniRuntime();
 const runtime=await import(pathToFileURL(runtimePath).href) as {default(options:{module_or_path:Uint8Array}):Promise<void>;compile(source:string,options:unknown):string};await runtime.default({module_or_path:await Bun.file(wasmPath).bytes()});
 const svg=runtime.compile(exported.text!,{}),point=exported.identityMap.find(item=>item.kind==='point'&&item.path.endsWith('/series/1/points/0'));expect(point).toBeDefined();expect(svg).toContain('<title>Untested: Oct 2 2026, 155</title>');
 const removed=svg.replace(/<g class="lini-node lini-hit-9 lini-oval"[^>]*>[\s\S]*?<\/g>/,'');expect(removed).not.toBe(svg);
 await expect(verifyNativeFirstWitness(page,exported.text!,removed,document,'lini')).rejects.toThrow(/Missing native-first point SVG carrier/);
 const changed=svg.replace('<title>Untested: Oct 2 2026, 155</title>','<title>Untested: Oct 2 2026, 999</title>');expect(changed).not.toBe(svg);
 await expect(verifyNativeFirstWitness(page,exported.text!,changed,document,'lini')).rejects.toThrow(/Missing native-first point SVG carrier/);
},{timeout:30000});

test('native-first Lini connector geometry cannot move while retaining endpoint attributes',async()=>{
 const document=await Bun.file('fixtures/catalog/canary-supported-flow.json').json() as Document;
 const exported=exportVisual(document,{format:'lini',profile:'umf.visual.lini.annotated/1',mode:'strict'});expect(exported.ok&&exported.text).toBeTruthy();
 await verifyLiniRuntime();const runtimePath=resolve(liniDirectory,'lini_wasm.js'),wasmPath=resolve(liniDirectory,'lini_wasm_bg.wasm'),runtime=await import(pathToFileURL(runtimePath).href) as {default(options:{module_or_path:Uint8Array}):Promise<void>;compile(source:string,options:unknown):string};await runtime.default({module_or_path:await Bun.file(wasmPath).bytes()});
 const svg=runtime.compile(exported.text!,{}),witness=await verifyNativeFirstWitness(page,exported.text!,svg,document,'lini');expect(witness.connections).toBe(1);
 const link=/<g class="lini-link" data-from="([^"]+)" data-to="([^"]+)">[\s\S]*?<path d="[^"]+"/.exec(svg);expect(link).toBeTruthy();const changed=svg.replace(link![0],link![0].replace(/<path d="[^"]+"/,'<path d="M 10000 10000 L 10100 10100"'));expect(changed).not.toBe(svg);expect(changed).toContain(`data-from="${link![1]}" data-to="${link![2]}"`);
 await expect(verifyNativeFirstWitness(page,exported.text!,changed,document,'lini')).rejects.toThrow(/not attached to its declared source\/target shapes/i);
},{timeout:30000});

test('native-first witness covers every strictly reusable corpus source with its exact native renderer',async()=>{
 const fixtures:string[]=[];
 for(const pattern of ['fixtures/visual/forms/*.json','fixtures/visual/inventory/*.json','fixtures/catalog/*.json'])for await(const path of new Bun.Glob(pattern).scan('.'))if(!path.endsWith('/index.json'))fixtures.push(path);
 fixtures.sort();let checked=0,mermaidReady=false,liniRuntime:{version:()=>string;compile(source:string,options:unknown):string}|undefined;const mismatches:string[]=[];
 for(const fixture of fixtures){
  const document=await Bun.file(fixture).json() as Document;
  for(const format of ['dot','mermaid','lini'] as InterchangeFormat[]){
   const profile=`umf.visual.${format}.annotated/1`,exported=tryNativeFirstExport(document,format);if(!exported?.text)continue;
   let svg:string;
    if(format==='dot')svg=await graphvizSvg(exported.text);
   else if(format==='mermaid'){
    if(!mermaidReady){await page.setContent('<!doctype html><html><body></body></html>');await page.addScriptTag({path:resolve('node_modules/mermaid/dist/mermaid.min.js')});mermaidReady=true;}
    svg=await page.evaluate(async({source,id})=>{const api=(window as any).mermaid;api.initialize({startOnLoad:false,securityLevel:'strict',deterministicIds:true,deterministicIDSeed:id});return(await api.render(id,source)).svg;},{source:exported.text,id:`native-first-corpus-${checked}`});
   }else{
    if(!liniRuntime){await verifyLiniRuntime();const modulePath=resolve(liniDirectory,'lini_wasm.js');const runtime=await import(pathToFileURL(modulePath).href) as {default(options:{module_or_path:Uint8Array}):Promise<void>;version:()=>string;compile(source:string,options:unknown):string};await runtime.default({module_or_path:await Bun.file(resolve(liniDirectory,'lini_wasm_bg.wasm')).bytes()});liniRuntime=runtime;}
    svg=liniRuntime.compile(exported.text,{});
   }
   checked++;try{const witness=await verifyNativeFirstWitness(page,exported.text,svg,document,format);expect(witness.tier).toBe('native-profile');expect(witness.sourceProfile).toBe(profile);expect(witness.nativeIdsChecked).toBeGreaterThan(0);}catch(error){mismatches.push(`${format} ${fixture}: ${error instanceof Error?error.message:String(error)}`);}
  }
 }
 expect(checked).toBe(61);
 expect(mismatches).toEqual([]);
},{timeout:120000});
