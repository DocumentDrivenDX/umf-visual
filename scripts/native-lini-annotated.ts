// SPDX-License-Identifier: MIT OR Apache-2.0
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Document} from '@umf/core';
import {exportVisual,importVisual} from '../src';
import {readLiniProfile} from '../src/interchange/lini/profile-syntax';
import {liniAdapter} from '../src/interchange/lini';
import pin from '../spec/interchange/lini-runtime.json';
import {liniDirectory,verifyLiniRuntime} from './interchange-runtime';

const examples=[
 'fixtures/visual/forms/umf-ac-satisfied.json','fixtures/visual/forms/umf-ac-status.json','fixtures/visual/forms/umf-ac-trend.json','fixtures/visual/forms/umf-ac-coverage.json',
 'fixtures/visual/forms/helix-releases.json','fixtures/visual/forms/umf-releases.json','fixtures/visual/forms/visuals-roadmap.json',
 'fixtures/visual/inventory/helix-adr-options.json','fixtures/visual/forms/visuals-before-after.json','fixtures/visual/forms/layout-engines.json',
 'fixtures/catalog/canary-flow.json','fixtures/visual/inventory/beacon-ci-nightly.json',
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
 const input=await readFile(resolve(file)),document=JSON.parse(input.toString()) as Document,visual=document.extensions?.['umf.visual'] as {question:string;form:string},result=exportVisual(document,{format:'lini',profile:'umf.visual.lini.annotated/1',mode:'allow-reported-loss'});
 if(!result.ok||!result.text)throw new Error(file+': public annotated Lini export refused: '+JSON.stringify(result.diagnostics));
 const roundTrip=importVisual(result.text,{format:'lini',profile:'umf.visual.lini.annotated/1',id:document.id,question:visual.question,mode:'allow-reported-loss'});
 if(!roundTrip.ok||!roundTrip.document)throw new Error(file+': public annotated Lini import refused: '+JSON.stringify(roundTrip.diagnostics));
 if(canonical(roundTrip.document)!==canonical(document))throw new Error(file+': public annotated Lini full-document round trip differed');
 const diagnostics=JSON.parse(runtime.diagnostics(result.text,{})) as {diagnostics:{severity:string;code:string}[]};if(diagnostics.diagnostics.length)throw new Error(file+': pinned Lini diagnostics: '+JSON.stringify(diagnostics.diagnostics));
 const svg=runtime.compile(result.text,{}),cells=readLiniProfile(result.text)[0]!.children.find(node=>node.id==='umf_annotations')!.children.filter(node=>node.id.startsWith('ann_value_'));
 for(const cell of cells)if(svgCellText(svg,cell.id)!==cell.label)throw new Error(file+': native SVG value mismatch for '+cell.id);
 const visualData=document.extensions?.['umf.visual'] as {kind:string;form:string;nodes?:{label:string}[];edges?:{label?:string}[]};
 const title=(document.extensions?.['umf.visual'] as any).title;if(title!==undefined&&!decodeXml(svg).includes(title))throw new Error(file+': native SVG omitted the visible title block');
 let nativeEditEvidence:Record<string,unknown>|undefined;
 if(visualData.kind==='flow'){
  const visible=decodeXml(svg).replace(/<[^>]*>/g,'');
  for(const node of visualData.nodes??[])if(!visible.includes(node.label))throw new Error(file+': native render omitted flow block label '+JSON.stringify(node.label));
  for(const edge of visualData.edges??[])if(edge.label!==undefined&&!visible.includes(edge.label))throw new Error(file+': native render omitted flow link label '+JSON.stringify(edge.label));
  const bindings=readLiniProfile(result.text)[0]!.children.find(node=>node.id==='umf_identity')!.children;
  for(const row of bindings.filter(node=>node.id.startsWith('umf_identity_visual_')&&!node.id.endsWith('_visual')))if(!visible.includes(row.label!))throw new Error(file+': native render omitted visible flow ID '+JSON.stringify(row.label));
  const firstBlock=readLiniProfile(result.text)[0]!.children.find(node=>node.id==='umf_graph')!.children.find(node=>node.type==='block')!;
  const editedLabel=firstBlock.label+' native edit',editedSource=result.text.replace('|block#'+firstBlock.id+'| '+JSON.stringify(firstBlock.label),'|block#'+firstBlock.id+'| '+JSON.stringify(editedLabel));
  const editedDiagnostics=JSON.parse(runtime.diagnostics(editedSource,{})) as {diagnostics:{severity:string;code:string}[]};if(editedDiagnostics.diagnostics.length)throw new Error(file+': pinned Lini rejected supported native label edit: '+JSON.stringify(editedDiagnostics.diagnostics));
  const editedSvg=runtime.compile(editedSource,{});if(!decodeXml(editedSvg).includes(editedLabel))throw new Error(file+': pinned Lini render did not show the native label edit');
  const editedReadback=importVisual(editedSource,{format:'lini',profile:'umf.visual.lini.annotated/1',id:document.id,question:visual.question,mode:'allow-reported-loss'});
  if(!editedReadback.ok||!editedReadback.document||((editedReadback.document.extensions?.['umf.visual'] as any).nodes?.[0]?.label!==editedLabel))throw new Error(file+': native flow label edit failed profile readback: '+JSON.stringify(editedReadback.diagnostics));
  nativeEditEvidence={nativeEditedReadback:true,editedLabel,editedSourceSha256:hash(editedSource),editedSvgSha256:hash(editedSvg)};
 }
 evidence.push({fixture:file,inputSha256:hash(input),sourceSha256:hash(result.text),svgSha256:hash(svg),annotations:cells.length,identityMappings:roundTrip.identityMap.length,coverageEntries:roundTrip.coverage?.length??0,nativeDiagnostics:diagnostics.diagnostics,profileDiagnostics:result.diagnostics,...(visualData.kind==='flow'?{nativeFlow:{form:visualData.form,nodeLabels:visualData.nodes?.length,edgeLabels:visualData.edges?.length},...nativeEditEvidence}:{})});
 console.log('PASS '+file+' ('+cells.length+' exact visible annotations)');
}
const receipt={profile:'umf.visual.lini.annotated/1',model:'1.0.0',nativeRuntime:{profile:pin.profile,version:verifiedPin.version,pinSha256:hash(await readFile(resolve('spec/interchange/lini-runtime.json'))),assets:verifiedPin.assets.map(asset=>({name:asset.name,sha256:asset.sha256}))},cases:evidence};
const titled=liniAdapter.serialize({id:'lini-title-native-proof',kind:'flow',form:'network',question:'Native title proof',title:'Native group title · π',nodes:[{id:'visual-node-id',label:'A'}]},{id:'lini-title-native-proof',question:'Native title proof'});
if(!titled.text)throw new Error('Ordinary Lini group-title mapping refused: '+JSON.stringify(titled.diagnostics));
const titleDiagnostics=JSON.parse(runtime.diagnostics(titled.text,{})) as {diagnostics:{severity:string;code:string}[]};if(titleDiagnostics.diagnostics.length)throw new Error('Pinned Lini rejected ordinary group-title mapping: '+JSON.stringify(titleDiagnostics.diagnostics));
const titleSvg=runtime.compile(titled.text,{});if(!decodeXml(titleSvg).includes('Native group title · π'))throw new Error('Pinned Lini render omitted ordinary native group title');
Object.assign(receipt,{ordinaryGroupTitle:{sourceSha256:hash(titled.text),svgSha256:hash(titleSvg),nativeDiagnostics:titleDiagnostics.diagnostics,title:'Native group title · π',identityNativeId:titled.identityMap.find(item=>item.kind==='node')?.nativeId}});
await Bun.write('.cache/native-lini-annotated.json',JSON.stringify(receipt,null,2)+'\n');
console.log('Wrote .cache/native-lini-annotated.json');
