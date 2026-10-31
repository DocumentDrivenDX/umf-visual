// SPDX-License-Identifier: MIT OR Apache-2.0
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Document} from '@umf/core';
import {exportVisual} from '../src/interchange';
import {LATEST_VISUAL_VERSION,VISUAL_VERSION} from '../src/extensions/visual';
import {liniAdapter} from '../src/interchange/lini';
import {serializeAnnotatedLini,LINI_ANNOTATED_PROFILE} from '../src/interchange/lini/annotated';
import pin from '../spec/interchange/lini-runtime.json';
import {liniDirectory,verifyLiniRuntime} from './interchange-runtime';

const fixture='fixtures/integrations/complex-miro/common/network-16x24.json',fixtureHash='dc6d021a3a59b30bf45475e36b6bdfa86000e3e6d1b9291ed203bc6b604417d4';
const input=await readFile(resolve(fixture)),digest=(value:Uint8Array|string)=>new Bun.CryptoHasher('sha256').update(value).digest('hex');
if(digest(input)!==fixtureHash)throw new Error('UMF visual 1.1 boundary fixture changed from its pin');
const document=JSON.parse(input.toString()) as Document,visual=document.extensions?.['umf.visual'] as any;
if(document.vocabularies['umf.visual']?.version!=='1.1.0'||visual.nodes?.length!==16||visual.edges?.length!==24)throw new Error('Expected the explicit UMF visual 1.1 network 16x24 fixture');
if(VISUAL_VERSION!=='1.0.0'||LATEST_VISUAL_VERSION!=='1.1.0'||liniAdapter.version!=='0.3.0')throw new Error('Unexpected UMF/Lini adapter mapping versions');
const verified=await verifyLiniRuntime();if(verified.version!=='1.1.0'||pin.version!==verified.version)throw new Error('Pinned Lini runtime is not 1.1.0');
const runtimePath=resolve(liniDirectory,'lini_wasm.js'),wasmPath=resolve(liniDirectory,'lini_wasm_bg.wasm');
const runtime=await import(pathToFileURL(runtimePath).href) as {default(options:{module_or_path:Uint8Array}):Promise<void>;version?:()=>string;diagnostics(source:string,options:unknown):string;compile(source:string,options:unknown):string};
await runtime.default({module_or_path:await readFile(wasmPath)});if(runtime.version?.()!==undefined&&runtime.version()!==verified.version)throw new Error('Initialized Lini runtime differs from its verified 1.1.0 pin');
// The native language engine itself parses/renders 16 cards. This is independent of an UMF adapter mapping.
const nativeIds=new Map<string,string>(visual.nodes.map((node:any,index:number)=>[node.id,'n'+String(index+1).padStart(2,'0')]));
const nativeSource=['{ layout: grid; columns: repeat(4); gap: 72; }',...visual.nodes.map((node:any)=>'|block#'+nativeIds.get(node.id)+'| '+JSON.stringify(node.label)),...visual.edges.map((edge:any)=>nativeIds.get(edge.from)+' -> '+nativeIds.get(edge.to))].join('\n')+'\n';
const nativeDiagnostics=JSON.parse(runtime.diagnostics(nativeSource,{})) as {diagnostics:{code:string;severity:string;message:string}[]};if(nativeDiagnostics.diagnostics.length)throw new Error('Pinned Lini 1.1.0 rejected the standalone 16-block syntax: '+JSON.stringify(nativeDiagnostics.diagnostics));
const nativeSvg=runtime.compile(nativeSource,{});for(const node of visual.nodes)if(!nativeSvg.includes(node.label))throw new Error('Pinned Lini SVG omitted '+node.label);
const ordinaryDirect=liniAdapter.serialize(visual,{id:visual.id,question:visual.question});if(ordinaryDirect.text||!ordinaryDirect.diagnostics.some(item=>item.code==='LINI_VISUAL_SIZE'&&item.severity==='error'))throw new Error('Ordinary Lini profile did not clearly refuse the 16-node limit');
const ordinary=exportVisual(document,{format:'lini',mode:'allow-reported-loss'});if(ordinary.ok||!ordinary.diagnostics.some(item=>item.code==='LINI_VISUAL_SIZE'&&item.severity==='error'))throw new Error('Public ordinary Lini profile did not refuse the 16-node model');
const annotatedDirect=serializeAnnotatedLini(document);if(annotatedDirect.text||!annotatedDirect.diagnostics.some(item=>item.code==='LINI_ANNOTATED_PROFILE'&&item.message.includes('frozen visual 1.0.0')))throw new Error('Annotated Lini profile failed to refuse the visual 1.1 document');
const annotated=exportVisual(document,{format:'lini',profile:LINI_ANNOTATED_PROFILE,mode:'allow-reported-loss'});if(annotated.ok||!annotated.diagnostics.some(item=>item.code==='LINI_ANNOTATED_PROFILE'&&item.message.includes('frozen visual 1.0.0')))throw new Error('Public annotated Lini profile did not refuse its frozen visual 1.0.0 mapping boundary');
const receipt={fixture,fixtureSha256:fixtureHash,model:{version:document.vocabularies['umf.visual']?.version,nodes:visual.nodes.length,edges:visual.edges.length},umfApi:{currentVisualVersion:VISUAL_VERSION,latestVisualVersion:LATEST_VISUAL_VERSION,liniAdapterVersion:liniAdapter.version},liniRuntime:{profile:pin.profile,version:verified.version,assets:verified.assets.map(asset=>({name:asset.name,sha256:asset.sha256}))},nativeStandalone:{sourceSha256:digest(nativeSource),svgSha256:digest(nativeSvg),nodeCount:visual.nodes.length,edgeCount:visual.edges.length,diagnostics:nativeDiagnostics.diagnostics},ordinaryAdapterRefusal:ordinary.diagnostics,annotatedProfileRefusal:{profile:LINI_ANNOTATED_PROFILE,diagnostics:annotated.diagnostics}};
await Bun.write('.cache/native-lini-model-version-boundary.json',JSON.stringify(receipt,null,2)+'\n');console.log('PASS Lini runtime 1.1.0 parses 16 native blocks while the UMF Lini profiles explicitly refuse unsupported visual 1.1.0');console.log('Wrote .cache/native-lini-model-version-boundary.json');
