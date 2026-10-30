import {expect,test} from 'bun:test';
import {exportVisual,importVisual} from '../../src/interchange';

const dot='digraph G { a [label="A"]; b [label="B"]; a -> b [label="next"]; }';
const opts={format:'dot' as const,id:'facade',question:'How does this flow?',mode:'allow-reported-loss' as const};

test('facade retains source, creates a valid document and replays exact bytes after independent reparse',()=>{
 const imported=importVisual(dot,opts);expect(imported.ok).toBe(true);expect(imported.document).toBeDefined();expect(imported.source.text).toBe(dot);
 const replay=exportVisual(imported.document,{format:'dot',source:imported.source,original:true});
 expect(replay).toMatchObject({ok:true,text:dot});
 expect(replay.identityMap).toEqual(imported.identityMap);
});

test('original replay rejects a forged baseline after a semantic document edit',()=>{
 const imported=importVisual(dot,opts);expect(imported.document).toBeDefined();
 const changed=structuredClone(imported.document!);
 (changed.extensions!['umf.visual'] as any).nodes[0].label='Changed';
 const forged={...imported.source,baseline:imported.source.baseline.replace('"A"','"Changed"')};
 const result=exportVisual(changed,{format:'dot',source:forged,original:true});
 expect(result.ok).toBe(false);
 expect(result.diagnostics.some(d=>d.code==='INTERCHANGE_REPLAY_DERIVATION')).toBe(true);
});

test('safe JSON admission rejects getters without invoking them',()=>{
 let touched=false;const options=Object.defineProperty({format:'dot',id:'a',question:'q'},'mode',{enumerable:true,get(){touched=true;return 'strict';}});
 const result=importVisual(dot,options);
 expect(result.ok).toBe(false);expect(touched).toBe(false);
});

test('option refusal still retains a supplied source string exactly',()=>{
 const source='digraph G {\r\n  a -> b;\r\n}';let touched=false;
 const options=Object.defineProperty({format:'dot',id:'x',question:'q'},'unexpected',{enumerable:true,get(){touched=true;return 1;}});
 const result=importVisual(source,options);
 expect(result.ok).toBe(false);expect(result.source.text).toBe(source);expect(touched).toBe(false);
});

test('strict mode refuses reported native loss while preserving its receipt',()=>{
 const source='digraph G { graph [rankdir=LR]; a -> b; }';
 const result=importVisual(source,{...opts,mode:'strict'});
 expect(result.ok).toBe(false);expect(result.document).toBeUndefined();expect(result.source.text).toBe(source);
 expect(result.diagnostics.some(d=>d.loss)).toBe(true);
});

test('cross-format export reports native and visual projection losses',()=>{
 const imported=importVisual(dot,opts);const result=exportVisual(imported.document,{format:'mermaid',mode:'allow-reported-loss',source:imported.source});
 expect(result.ok).toBe(true);expect(result.text).toContain('flowchart TD');
 expect(result.diagnostics.some(d=>d.code==='DOT_GRAPH_IDENTITY'||d.code==='DOT_ATTRIBUTE_LOSS')).toBe(true);
});

test('unknown formats and unsafe source receipts return diagnostics without touching accessors',()=>{
 const unknown=importVisual(dot,{format:'unknown',id:'x',question:'q'});
 expect(unknown.ok).toBe(false);expect(unknown.diagnostics[0]?.code).toBe('INTERCHANGE_FORMAT');
 const imported=importVisual(dot,opts);let touched=false;
 const receipt=Object.defineProperty({...imported.source},'baseline',{enumerable:true,get(){touched=true;return imported.source.baseline;}});
 const result=exportVisual(imported.document,{format:'dot',source:receipt,original:true});
 expect(result.ok).toBe(false);expect(result.diagnostics.some(d=>d.code==='INTERCHANGE_INPUT')).toBe(true);expect(touched).toBe(false);
});

test('document and source companion serialize together for durable recovery',()=>{
 const imported=importVisual(dot,opts);const pair=JSON.parse(JSON.stringify({document:imported.document,source:imported.source}));
 const replay=exportVisual(pair.document,{format:'dot',source:pair.source,original:true});
 expect(replay.ok).toBe(true);expect(replay.text).toBe(dot);
});

test('replay derives identity maps from source instead of trusting caller map data',()=>{
 const imported=importVisual(dot,opts);const forged={...imported.source,identityMap:[]};
 const replay=exportVisual(imported.document,{format:'dot',source:forged,original:true});
 expect(replay.ok).toBe(true);expect(replay.identityMap.length).toBeGreaterThan(0);
});

test('export refuses accessor-bearing documents without invoking getters',()=>{
 let touched=false;const badDocument=Object.defineProperty({},'umf',{enumerable:true,get(){touched=true;return '0.5.7';}});
 const result=exportVisual(badDocument,{format:'dot'});
 expect(result.ok).toBe(false);expect(touched).toBe(false);
});

test('canonical export rejects malformed or unparsable source companions even when losses are allowed',()=>{
 const imported=importVisual(dot,opts);const common={format:'dot' as const,importOptions:{id:'x',question:'q'},baseline:'',identityMap:[]};
 const malformed=exportVisual(imported.document,{format:'mermaid',mode:'allow-reported-loss',source:7 as any});
 expect(malformed.ok).toBe(false);expect(malformed.diagnostics.some(d=>d.code==='INTERCHANGE_RECEIPT')).toBe(true);
 const unparsable=exportVisual(imported.document,{format:'mermaid',mode:'allow-reported-loss',source:{...common,text:'this is not DOT'}});
 expect(unparsable.ok).toBe(false);expect(unparsable.diagnostics.some(d=>d.severity==='error')).toBe(true);
 const oversizedSource='x'.repeat(262_145);
 const oversized=exportVisual(imported.document,{format:'dot',source:{...common,text:oversizedSource}});
 expect(oversized.ok).toBe(false);expect(oversized.source?.text).toBe(oversizedSource);
});

test('oversized import refusal retains the exact primitive source',()=>{
 const oversizedSource='x'.repeat(1_048_577);const result=importVisual(oversizedSource,opts);
 expect(result.ok).toBe(false);expect(result.source.text).toBe(oversizedSource);
 expect(result.diagnostics.some(d=>d.code==='INTERCHANGE_SOURCE_SIZE')).toBe(true);
});

test('invalid original selectors refuse instead of silently selecting canonical export',()=>{
 const imported=importVisual(dot,opts);
 for(const original of ['true',1,null,{}]){
  const result=exportVisual(imported.document,{format:'dot',source:imported.source,original});
  expect(result.ok).toBe(false);
  expect(result.text).toBeUndefined();
  expect(result.diagnostics.some(d=>d.code==='INTERCHANGE_OPTIONS'&&d.path==='/options/original')).toBe(true);
 }
});

test('strict Lini entity import refuses unrepresented arrow semantics but permits exact retained recovery',()=>{
 const text='|entity#a| "A" [\n|cell#id| "id"; "uuid"\n]\n|entity#b| "B" [\n|cell#id| "id"; "uuid"\n]\na.id -> b.id';
 const options={format:'lini',id:'entities',question:'What refers to what?'};
 const strict=importVisual(text,options);
 expect(strict.ok).toBe(false);expect(strict.source.text).toBe(text);
 const admitted=importVisual(text,{...options,mode:'allow-reported-loss'});
 expect(admitted.ok).toBe(true);
 const original=exportVisual(admitted.document,{format:'lini',source:admitted.source,original:true});
 expect(original.ok).toBe(true);expect(original.text).toBe(text);
});
