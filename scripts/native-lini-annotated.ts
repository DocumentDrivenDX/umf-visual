// SPDX-License-Identifier: MIT OR Apache-2.0
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Document} from '@umf/core';
import {exportVisual,importVisual} from '../src';
import {readLiniProfile} from '../src/interchange/lini/profile-syntax';
import pin from '../spec/interchange/lini-runtime.json';
import {liniDirectory,verifyLiniRuntime} from './interchange-runtime';

const examples=[
 'fixtures/visual/forms/umf-ac-satisfied.json','fixtures/visual/forms/umf-ac-status.json','fixtures/visual/forms/umf-ac-trend.json','fixtures/visual/forms/umf-ac-coverage.json',
 'fixtures/visual/forms/helix-releases.json','fixtures/visual/forms/umf-releases.json','fixtures/visual/forms/visuals-roadmap.json',
 'fixtures/visual/inventory/helix-adr-options.json','fixtures/visual/forms/visuals-before-after.json','fixtures/visual/forms/layout-engines.json',
];
const runtimePath=resolve(liniDirectory,'lini_wasm.js'),wasmPath=resolve(liniDirectory,'lini_wasm_bg.wasm');
const runtime=await import(pathToFileURL(runtimePath).href) as {default(options:{module_or_path:Uint8Array}):Promise<void>;version?:()=>string;diagnostics(source:string,options:unknown):string;compile(source:string,options:unknown):string};
const verifiedPin=await verifyLiniRuntime();if(verifiedPin.version!=='1.1.0')throw new Error('Expected pinned Lini 1.1.0');
await runtime.default({module_or_path:await readFile(wasmPath)});
if(runtime.version?.()!==undefined&&runtime.version()!==verifiedPin.version)throw new Error('Initialized Lini runtime version differs from the verified pin');
const hash=(value:Uint8Array|string)=>new Bun.CryptoHasher('sha256').update(value).digest('hex');
const canonical=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const decodeXml=(text:string)=>text.replace(/&amp;/g,'&').replace(/&apos;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#x([0-9a-f]+);/gi,(_,hex:string)=>String.fromCodePoint(parseInt(hex,16))).replace(/&#([0-9]+);/g,(_,decimal:string)=>String.fromCodePoint(Number(decimal)));
function svgCellText(svg:string,id:string):string|undefined {
 const escaped=id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),match=new RegExp('<g\\b[^>]*data-id="'+escaped+'"[^>]*>([\\s\\S]*?)<\\/g>').exec(svg);if(!match)return;
 const text=/<text\b[^>]*>([\s\S]*?)<\/text>/.exec(match[1]!);return text?decodeXml(text[1]!.replace(/<[^>]*>/g,'')):undefined;
}
const evidence=[];
for(const file of examples){
 const input=await readFile(resolve(file)),document=JSON.parse(input.toString()) as Document,visual=document.extensions?.['umf.visual'] as {question:string},result=exportVisual(document,{format:'lini',profile:'umf.visual.lini.annotated/1'});
 if(!result.ok||!result.text)throw new Error(file+': public annotated Lini export refused: '+JSON.stringify(result.diagnostics));
 const roundTrip=importVisual(result.text,{format:'lini',profile:'umf.visual.lini.annotated/1',id:document.id,question:visual.question});
 if(!roundTrip.ok||!roundTrip.document)throw new Error(file+': public annotated Lini import refused: '+JSON.stringify(roundTrip.diagnostics));
 if(canonical(roundTrip.document)!==canonical(document))throw new Error(file+': public annotated Lini full-document round trip differed');
 const diagnostics=JSON.parse(runtime.diagnostics(result.text,{})) as {diagnostics:{severity:string;code:string}[]};if(diagnostics.diagnostics.length)throw new Error(file+': pinned Lini diagnostics: '+JSON.stringify(diagnostics.diagnostics));
 const svg=runtime.compile(result.text,{}),cells=readLiniProfile(result.text)[0]!.children.find(node=>node.id==='umf_annotations')!.children.filter(node=>node.id.startsWith('ann_value_'));
 for(const cell of cells)if(svgCellText(svg,cell.id)!==cell.label)throw new Error(file+': native SVG value mismatch for '+cell.id);
 evidence.push({fixture:file,inputSha256:hash(input),sourceSha256:hash(result.text),svgSha256:hash(svg),annotations:cells.length,identityMappings:roundTrip.identityMap.length,coverageEntries:roundTrip.coverage?.length??0,nativeDiagnostics:diagnostics.diagnostics});
 console.log('PASS '+file+' ('+cells.length+' exact visible annotations)');
}
const receipt={profile:'umf.visual.lini.annotated/1',model:'1.0.0',nativeRuntime:{profile:pin.profile,version:verifiedPin.version,pinSha256:hash(await readFile(resolve('spec/interchange/lini-runtime.json'))),assets:verifiedPin.assets.map(asset=>({name:asset.name,sha256:asset.sha256}))},cases:evidence};
await Bun.write('.cache/native-lini-annotated.json',JSON.stringify(receipt,null,2)+'\n');
console.log('Wrote .cache/native-lini-annotated.json');
