// SPDX-License-Identifier: MIT OR Apache-2.0
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Document} from '@umf/core';
import {liniAdapter} from '../src/interchange/lini';
import pin from '../spec/interchange/lini-runtime.json';
import {liniDirectory,verifyLiniRuntime} from './interchange-runtime';

const fixtures=[
 {path:'fixtures/catalog/canary-entities.json',sha256:'6b101dd70cab0fbb10a87b195515d76d06f62828afe02d1f368afe417ecfbd6e'},
 {path:'fixtures/visual/inventory/beacon-schema-tickets.json',sha256:'3ea8d7e5c8941457901cecb9a6755bc02fd5119c0a9e6fb92bf9e21d4881054e'},
 {path:'fixtures/visual/inventory/beacon-schema-workspace.json',sha256:'74cc43f6171ed212876b6fab8fc9ee1429dbd4bca2e7c79394d46e9800bb3dad'},
 {path:'fixtures/visual/inventory/tpl-sd-domain.json',sha256:'b054796bb6031693eb3df54ff03cc7b27fb2ad8fa4ba90bd66f7f36573bd6471'},
];
const runtimePath=resolve(liniDirectory,'lini_wasm.js'),wasmPath=resolve(liniDirectory,'lini_wasm_bg.wasm');
const runtime=await import(pathToFileURL(runtimePath).href) as {default(options:{module_or_path:Uint8Array}):Promise<void>;version?:()=>string;diagnostics(source:string,options:unknown):string;compile(source:string,options:unknown):string;desugar(source:string,options:unknown):string};
const verified=await verifyLiniRuntime();if(verified.version!=='1.1.0')throw new Error('Expected pinned Lini 1.1.0');
await runtime.default({module_or_path:await readFile(wasmPath)});if(runtime.version?.()!==undefined&&runtime.version()!==verified.version)throw new Error('Initialized Lini runtime differs from the verified pin');
const hash=(value:Uint8Array|string)=>new Bun.CryptoHasher('sha256').update(value).digest('hex');
const visible=(svg:string)=>svg.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&apos;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const nativeDiagnostics=(source:string)=>JSON.parse(runtime.diagnostics(source,{})) as {diagnostics:{code:string;severity:string;message:string}[]};
const cases=[];
for(const fixture of fixtures){
 const input=await readFile(resolve(fixture.path));if(hash(input)!==fixture.sha256)throw new Error('Entity fixture changed from its pinned source: '+fixture.path);
 const document=JSON.parse(input.toString()) as Document,visual=document.extensions?.['umf.visual'] as any,result=liniAdapter.serialize(visual,{id:document.id,question:visual.question});
 if(!result.text)throw new Error(fixture.path+': adapter did not emit source: '+JSON.stringify(result.diagnostics));
 const diagnostics=nativeDiagnostics(result.text);if(diagnostics.diagnostics.length)throw new Error(fixture.path+': pinned Lini diagnostics: '+JSON.stringify(diagnostics.diagnostics));
 const svg=runtime.compile(result.text,{}),desugared=runtime.desugar(result.text,{}),rendered=visible(svg);
 if(!desugared.includes('.lini-entity.lini-table')||!desugared.includes(' -> '))throw new Error(fixture.path+': native desugared AST did not retain entity and directed-reference structure');
 for(const node of visual.nodes)if(!rendered.includes(node.label))throw new Error(fixture.path+': SVG omitted entity label '+JSON.stringify(node.label));
 for(const entity of visual.structure.entities)for(const field of entity.fields)for(const value of [field.name,field.type])if(value!==undefined&&(!rendered.includes(value)||!desugared.includes(JSON.stringify(value))))throw new Error(fixture.path+': SVG/native AST omitted field display value '+JSON.stringify(value));
 for(const reference of visual.structure.references??[])if(reference.label!==undefined&&!rendered.includes(reference.label))throw new Error(fixture.path+': SVG omitted reference label '+JSON.stringify(reference.label));
 const parsed=liniAdapter.parse(result.text,{id:document.id,question:visual.question});if(!parsed.visual||parsed.visual.kind!=='structure'||!parsed.visual.structure?.entities)throw new Error(fixture.path+': adapter refused native entity readback');const readback=parsed.visual,structure=readback.structure!,entities=structure.entities!;
 if(readback.nodes?.length!==visual.nodes.length||entities.length!==visual.structure.entities.length||structure.references?.length!==(visual.structure.references?.length??0))throw new Error(fixture.path+': native entity/link count changed on readback');
 for(const[index,entity]of visual.structure.entities.entries())for(const[fieldIndex,field]of entity.fields.entries()){
  const nativeField=entities[index]?.fields[fieldIndex];if(!nativeField||nativeField.name!==field.name||nativeField.type!==field.type)throw new Error(fixture.path+': field display readback mismatch');
  if(field.keys!==undefined&&nativeField.keys!==undefined)throw new Error(fixture.path+': adapter inferred key semantics from a native field');
 }
 for(const[index,reference]of (visual.structure.references??[]).entries()){
  const nativeRef=structure.references?.[index];if(!nativeRef||nativeRef.label!==reference.label)throw new Error(fixture.path+': native reference label/order changed');
  if(nativeRef.fromCardinality!==undefined||nativeRef.toCardinality!==undefined)throw new Error(fixture.path+': adapter inferred cardinality from an arrow or label');
 }
 cases.push({fixture:fixture.path,inputSha256:fixture.sha256,liniSourceSha256:hash(result.text),desugaredAstSha256:hash(desugared),svgSha256:hash(svg),nativeDiagnostics:diagnostics.diagnostics,nodes:visual.nodes.length,fields:visual.structure.entities.reduce((n:number,e:any)=>n+e.fields.length,0),references:visual.structure.references?.length??0,adapterLossCodes:[...new Set(result.diagnostics.filter(item=>item.loss).map(item=>item.code))],identityMappings:result.identityMap.length,readback:{nodes:readback.nodes?.length,entities:entities.length,references:structure.references?.length??0}});
 console.log('PASS '+fixture.path+' (native parse/render, '+visual.nodes.length+' entities)');
}
// These syntax attempts are real native-parser refusals, not semantic labels.
const keyAttempt='|entity#n_0| "Account" [\n|cell#f_0| "id" .pk; "uuid"\n]';
const cardinalityAttempt='|entity#n_0| "Account" [\n|cell#f_0| "id"; "uuid"\n]\n|entity#n_1| "Event" [\n|cell#f_0| "id"; "uuid"\n]\nn_0 -> n_1 .one-to-many';
const keyDiagnostics=nativeDiagnostics(keyAttempt),cardinalityDiagnostics=nativeDiagnostics(cardinalityAttempt);
if(!keyDiagnostics.diagnostics.some(item=>item.code==='R002'&&item.message.includes('unknown class')))throw new Error('Pinned Lini did not refuse the unqualified `.pk` field class');
if(!cardinalityDiagnostics.diagnostics.some(item=>item.code==='R002'&&item.message.includes('unknown class')))throw new Error('Pinned Lini did not refuse the unqualified cardinality class');
const labelOnly=liniAdapter.parse(cardinalityAttempt.replace(' .one-to-many',' "one-to-many"'),{id:'proof',question:'q'});
if(!labelOnly.visual||labelOnly.visual.structure?.references?.[0]?.label!=='one-to-many'||labelOnly.visual.structure.references[0]?.toCardinality!==undefined)throw new Error('Adapter promoted display text into cardinality semantics');
// A real endpoint edit changes the referenced field while leaving its native path identity explicit.
const workspace=JSON.parse((await readFile(fixtures[2].path)).toString()) as Document,workspaceVisual=workspace.extensions?.['umf.visual'] as any,workspaceSource=liniAdapter.serialize(workspaceVisual,{id:workspace.id,question:workspaceVisual.question}).text!;
const endpointBefore='n_0 -> n_1.f_1 "workspace_id"',endpointAfter='n_0 -> n_1.f_2 "workspace_id"';if(!workspaceSource.includes(endpointBefore))throw new Error('Expected qualified endpoint fixture locator changed');
const editedEndpointSource=workspaceSource.replace(endpointBefore,endpointAfter),editedEndpointDiagnostics=nativeDiagnostics(editedEndpointSource);if(editedEndpointDiagnostics.diagnostics.length)throw new Error('Pinned Lini rejected a declared-field endpoint edit: '+JSON.stringify(editedEndpointDiagnostics.diagnostics));
const editedEndpointSvg=runtime.compile(editedEndpointSource,{}),editedReadback=liniAdapter.parse(editedEndpointSource,{id:workspace.id,question:workspaceVisual.question});
if(editedReadback.visual?.kind!=='structure'||!editedReadback.visual.structure||editedReadback.visual.structure.references?.[0]?.to.field!=='email'||!editedReadback.identityMap.some(item=>item.kind==='field'&&item.nativeId==='umf_visual.n_1.f_2'))throw new Error('Native field endpoint edit did not retain the exact target identity');
const receipt={profile:pin.profile,version:verified.version,runtimeAssets:verified.assets.map(asset=>({name:asset.name,sha256:asset.sha256})),fixtures:cases,probes:{keyClass:{sourceSha256:hash(keyAttempt),diagnostics:keyDiagnostics.diagnostics},cardinalityClass:{sourceSha256:hash(cardinalityAttempt),diagnostics:cardinalityDiagnostics.diagnostics},labelOnly:{accepted:true,label:labelOnly.visual?.kind==='structure'?labelOnly.visual.structure?.references?.[0]?.label:undefined,cardinalityInferred:false},fieldEndpointEdit:{sourceSha256:hash(editedEndpointSource),svgSha256:hash(editedEndpointSvg),targetField:editedReadback.visual?.kind==='structure'&&editedReadback.visual.structure?editedReadback.visual.structure.references?.[0]?.to.field:undefined,nativeDiagnostics:editedEndpointDiagnostics.diagnostics}}};
await Bun.write('.cache/native-lini-entities-cohort.json',JSON.stringify(receipt,null,2)+'\n');console.log('Wrote .cache/native-lini-entities-cohort.json');
