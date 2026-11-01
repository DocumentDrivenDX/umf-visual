// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {exportAnnotatedVisual} from '../../src/interchange/annotated';
import {DOT_ANNOTATED_PROFILE} from '../../src/interchange/dot/annotated';
import {LINI_ANNOTATED_PROFILE} from '../../src/interchange/lini/annotated';
import {MERMAID_ANNOTATED_PROFILE} from '../../src/interchange/mermaid/annotated';
import {tryNativeFirstExport,readNativeFirstSource} from '../../src/interchange/full/native-first';
import {interchangeCapabilities,exportVisual,importVisual} from '../../src/interchange';

const canonical=(value:unknown)=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v);

test('native-first dispatch reuses strict byte-identical annotated source only after whole-document readback',async()=>{
 const cases=[
  {format:'dot' as const,profile:DOT_ANNOTATED_PROFILE,path:'fixtures/catalog/canary-supported-flow.json',version:'0.1.0' as const},
  {format:'lini' as const,profile:LINI_ANNOTATED_PROFILE,path:'fixtures/catalog/canary-flow.json',version:'0.2.0' as const},
  {format:'mermaid' as const,profile:MERMAID_ANNOTATED_PROFILE,path:'fixtures/visual/inventory/helix-request.json',version:'0.1.0' as const},
 ];
 for(const item of cases){
  const capability=interchangeCapabilities.find(entry=>entry.profile===item.profile);
  expect(capability?.version).toBe(item.version);
  const document=JSON.parse(await readFile(item.path,'utf8'));
  const direct=exportAnnotatedVisual(document,{format:item.format,profile:item.profile,mode:'strict'});
  expect(direct.ok,`${item.format}: ${JSON.stringify(direct.diagnostics)}`).toBe(true);
  const result=tryNativeFirstExport(document,item.format);
  expect(result,`${item.format} should qualify`).toBeDefined();
  expect(result!.text).toBe(direct.text!);
  expect(result!.representation).toEqual({tier:'native-profile',sourceProfile:item.profile,sourceMappingVersion:item.version,coverageModel:'native-concepts-and-annotations',wholeDocumentReadback:true});
  expect(canonical(result!.document)).toBe(canonical(document));
  expect(result!.identityMap).toEqual(direct.identityMap);
  expect(result!.coverage).toEqual(direct.coverage!);
  const read=readNativeFirstSource(direct.text!,item.format);
  expect(read?.text).toBe(direct.text!);
  expect(canonical(read?.document)).toBe(canonical(document));
 }
});

test('native-first detection returns undefined only for unrecognized input and refuses malformed or mismatched declarations',()=>{
 for(const [source,format] of [
  ['digraph G { a -> b; }','dot'],
  ['|group#ordinary|','lini'],
  ['sequenceDiagram\n  A->>B: hi','mermaid'],
 ] as const)expect(readNativeFirstSource(source,format)).toBeUndefined();

 expect(()=>readNativeFirstSource('%% UMF_PROFILE {','mermaid')).toThrow();
 expect(()=>readNativeFirstSource('|group#umf_visual| [','lini')).toThrow();
 expect(()=>readNativeFirstSource('digraph "umf_visual" {\ngraph [umf_profile="umf.visual.dot.annotated/1";\n}','dot')).toThrow();
 expect(()=>readNativeFirstSource('%% UMF_PROFILE {"profile":"umf.visual.mermaid.annotated/1"}\nsequenceDiagram','dot')).toThrow(/cannot be read as/);

 const unknownProfile='digraph "umf_visual" {\ngraph [umf_profile="umf.visual.dot.annotated/999", umf_model="1.0.0"];\n}';
 expect(()=>readNativeFirstSource(unknownProfile,'dot')).toThrow();
});

test('native-first export declines documents outside the strict annotated subset',async()=>{
 const document=JSON.parse(await readFile('fixtures/visual/forms/helix-request-ladder.json','utf8'));
 expect(tryNativeFirstExport(document,'mermaid')).toBeUndefined();
});

test('native-first semantic fidelity fences fall through while direct annotated emitters remain unchanged',async()=>{
 const cases=[
  {path:'fixtures/catalog/canary-entities.json',format:'dot' as const,profile:DOT_ANNOTATED_PROFILE},
  {path:'fixtures/catalog/canary-flow.json',format:'dot' as const,profile:DOT_ANNOTATED_PROFILE},
  {path:'fixtures/visual/forms/umf-ac-status.json',format:'lini' as const,profile:LINI_ANNOTATED_PROFILE},
  {path:'fixtures/visual/inventory/beacon-context.json',format:'lini' as const,profile:LINI_ANNOTATED_PROFILE},
 ];
 for(const item of cases){
  const document=JSON.parse(await readFile(item.path,'utf8'));
  const native=exportAnnotatedVisual(document,{format:item.format,profile:item.profile,mode:'strict'});
  expect(native.ok,`${item.path}: ${JSON.stringify(native.diagnostics)}`).toBe(true);
  expect(tryNativeFirstExport(document,item.format),item.path).toBeUndefined();
  expect(()=>readNativeFirstSource(native.text!,item.format),item.path).toThrow(/fidelity eligibility/);
  const full=exportVisual(document,{format:item.format,profile:`umf.visual.${item.format}.full/1`});
  expect(full.ok,`${item.path}: ${JSON.stringify(full.diagnostics)}`).toBe(true);
  expect(full.representation?.tier).toBe('primitive-fallback');
  expect(full.text).not.toBe(native.text);
  const read=importVisual(full.text,{format:item.format,profile:`umf.visual.${item.format}.full/1`,id:'fence-test',question:'Context'});
  expect(read.ok,JSON.stringify(read.diagnostics)).toBe(true);
  expect(canonical(read.document)).toBe(canonical(document));
 }
});

test('the full umbrella reuses the 62-source native-first cohort and preserves 97 complete fallbacks',async()=>{
 const counts={dot:0,mermaid:0,lini:0};let examples=0,fallbacks=0;
 for(const pattern of ['fixtures/visual/forms/*.json','fixtures/visual/inventory/*.json','fixtures/catalog/*.json'])for await(const path of new Bun.Glob(pattern).scan('.')){
  if(path.endsWith('/index.json'))continue;examples++;
  const document=await Bun.file(path).json();
  for(const format of ['dot','mermaid','lini'] as const){
   const profile=`umf.visual.${format}.full/1` as const,output=exportVisual(document,{format,profile});
   expect(output.ok).toBe(true);expect(output.diagnostics).toEqual([]);expect(output.representation?.wholeDocumentReadback).toBe(true);
   const read=importVisual(output.text,{format,profile,id:'context',question:'Context'});
   expect(read.ok).toBe(true);expect(canonical(read.document)).toBe(canonical(document));expect(read.representation).toEqual(output.representation);
   if(output.representation?.tier==='native-profile'){
    counts[format]++;const old=exportAnnotatedVisual(document,{format,profile:output.representation.sourceProfile,mode:'strict'});
    expect(output.text).toBe(old.text);expect(output.coverage).toEqual(old.coverage);
   }else{fallbacks++;expect(output.representation?.coverageModel).toBe('visible-record-tree');}
  }
 }
 // The baseline 65 strict annotated pairs excludes DOT escaped entity captions,
 // Lini case-sensitive chart categories, and Lini high-degree routed networks.
 expect(examples).toBe(53);expect(counts).toEqual({dot:41,mermaid:4,lini:16});expect(fallbacks).toBe(98);
},60000);
