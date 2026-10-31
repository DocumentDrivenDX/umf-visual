// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {readJsonValue,writeJsonValue} from '@umf/core';
import {exportVisual,importVisual} from '../../src';

const canonical=(value:unknown)=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v);

test('public Mermaid annotation facade retains a real sequence document and exact source replay',async()=>{
 const document=JSON.parse(await readFile('fixtures/visual/inventory/helix-request.json','utf8'));
 const options={format:'mermaid' as const,profile:'umf.visual.mermaid.annotated/1' as const};
 const output=exportVisual(document,options);expect(output.ok,JSON.stringify(output.diagnostics)).toBe(true);
 const imported=importVisual(output.text!,{...options,id:'facade-mermaid',question:'Context'});
 expect(imported.ok,JSON.stringify(imported.diagnostics)).toBe(true);expect(canonical(imported.document)).toBe(canonical(document));
 const replay=exportVisual(imported.document!,{...options,source:imported.source,original:true});
 expect(replay.ok).toBe(true);expect(replay.text).toBe(output.text);
 const unknown=exportVisual(document,{format:'mermaid',profile:'umf.visual.mermaid.unknown/999'});
 expect(unknown.ok).toBe(false);
});

test('public Lini annotation facade retains the titled canary flow without metadata leakage',async()=>{
 const document=JSON.parse(await readFile('fixtures/catalog/canary-flow.json','utf8'));
 const options={format:'lini' as const,profile:'umf.visual.lini.annotated/1' as const};
 const output=exportVisual(document,options);expect(output.ok,JSON.stringify(output.diagnostics)).toBe(true);
 const imported=importVisual(output.text!,{...options,id:'facade-lini',question:'Context'});
 expect(imported.ok,JSON.stringify(imported.diagnostics)).toBe(true);expect(canonical(imported.document)).toBe(canonical(document));
 const replay=exportVisual(imported.document!,{...options,source:imported.source,original:true});
 expect(replay.ok).toBe(true);expect(replay.text).toBe(output.text);
 const visual=(imported.document!.extensions!['umf.visual'] as any);
 expect(visual.title).toBe('Quoted labels, Unicode, and projection loss');
 expect(visual.nodes[0].label).toBe('Parser says "ready" · π');
 expect(Object.values(visual).some(value=>value===undefined)).toBe(false);
 expect(exportVisual(document,{format:'lini',profile:'umf.visual.lini.unknown/999'}).ok).toBe(false);
});

test('reported-loss annotated receipts persist and replay only under the reported policy with independent stale/forged checks',async()=>{
 const cases=[
  {format:'mermaid' as const,profile:'umf.visual.mermaid.annotated/1' as const,path:'fixtures/visual/forms/helix-request-ladder.json',code:'MERMAID_SEQUENCE_LAYOUT'},
  {format:'lini' as const,profile:'umf.visual.lini.annotated/1' as const,path:'fixtures/visual/inventory/beacon-ci-nightly.json',code:'LINI_PIPELINE_LAYOUT_LOSS'},
 ];
 for(const entry of cases){
  const document=JSON.parse(await readFile(entry.path,'utf8')),options={format:entry.format,profile:entry.profile};
  const emitted=exportVisual(document,{...options,mode:'allow-reported-loss'});
  expect(emitted.ok,JSON.stringify(emitted.diagnostics)).toBe(true);
  const imported=importVisual(emitted.text!,{...options,mode:'allow-reported-loss',id:'receipt-context',question:'Context'});
  expect(imported.ok).toBe(true);expect(canonical(imported.document)).toBe(canonical(document));
  for(const persistence of ['json','yaml'] as const){
   const pair=readJsonValue(writeJsonValue({document:imported.document,source:imported.source},persistence),persistence) as any;
   const strict=exportVisual(pair.document,{...options,source:pair.source,original:true});
   expect(strict.ok).toBe(false);expect(strict.text).toBeUndefined();expect(strict.source).toEqual(pair.source);
   expect(strict.diagnostics.some(item=>item.code===entry.code&&item.loss)).toBe(true);
   const replay=exportVisual(pair.document,{...options,mode:'allow-reported-loss',source:pair.source,original:true});
   expect(replay.ok).toBe(true);expect(replay.text).toBe(emitted.text);expect(replay.source).toEqual(pair.source);
   expect(replay.diagnostics.some(item=>item.code===entry.code&&item.loss)).toBe(true);
   const changed=structuredClone(pair.document);changed.extensions['umf.visual'].question+=' edited';
   const stale=exportVisual(changed,{...options,mode:'allow-reported-loss',source:pair.source,original:true});
   expect(stale.ok).toBe(false);expect(stale.source).toEqual(pair.source);expect(stale.diagnostics.some(item=>item.code==='INTERCHANGE_REPLAY_CHANGED')).toBe(true);
   const forged={...pair.source,baseline:canonical(changed)};
   const forgery=exportVisual(changed,{...options,mode:'allow-reported-loss',source:forged,original:true});
   expect(forgery.ok).toBe(false);expect(forgery.text).toBeUndefined();
   const wrongMap=structuredClone(pair.source);wrongMap.identityMap[0].nativeId='forged@1';
   expect(exportVisual(pair.document,{...options,mode:'allow-reported-loss',source:wrongMap,original:true}).ok).toBe(false);
  }
 }
});
