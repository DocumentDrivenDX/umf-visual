// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {dotAdapter} from '../../src/interchange/dot';
import type {Visual} from '../../src/extensions/visual';
import {createVisualDocument,inspectVisual} from '../../src/extensions/visual';

const context={id:'dot-fixture',question:'How does a request flow?'};
const fixture=async(name:string)=>await Bun.file('fixtures/interchange/dot/'+name+'.dot').text();

test('imports directed chains, quoted IDs, comments, labels and safe identity maps',async()=>{
 const source=await fixture('directed-chain');const result=dotAdapter.parse(source,context);
 expect(result.diagnostics.map(d=>d.code)).toEqual(['DOT_GRAPH_IDENTITY']);
 expect(result.visual).toEqual({id:'dot-fixture',kind:'flow',form:'network',question:context.question,nodes:[
  {id:'n1',label:'entry service'},{id:'n2',label:'API'},{id:'n3',label:'Ticket store'}
 ],edges:[
  {id:'e1',from:'n1',to:'n2',label:'writes'},{id:'e2',from:'n2',to:'n3',label:'writes'}
 ]});
 expect(result.identityMap.map(({kind,nativeId,visualId})=>({kind,nativeId,visualId}))).toEqual([
  {kind:'node',nativeId:'entry service',visualId:'n1'},
  {kind:'node',nativeId:'api',visualId:'n2'},
  {kind:'node',nativeId:'store',visualId:'n3'},
  {kind:'edge',nativeId:'["entry service","api"]#1',visualId:'e1'},
  {kind:'edge',nativeId:'["api","store"]#1',visualId:'e2'}
 ]);
});

test('maps graph labels and only reports attributes the projection does not understand',async()=>{
 const source=await fixture('unsupported-attributes');const result=dotAdapter.parse(source,context);
 expect(result.visual?.title).toBe('Service flow');
 expect(result.visual?.nodes).toEqual([{id:'n1',label:'Start'},{id:'n2',label:'b'}]);
 expect(result.visual?.edges).toEqual([{id:'e1',from:'n1',to:'n2',label:'submit'}]);
 expect(result.diagnostics.filter(d=>d.loss).map(d=>d.code)).toEqual([
  'DOT_ATTRIBUTE_LOSS','DOT_ATTRIBUTE_LOSS','DOT_ATTRIBUTE_LOSS','DOT_ATTRIBUTE_LOSS','DOT_ATTRIBUTE_LOSS','DOT_ATTRIBUTE_LOSS','DOT_GRAPH_IDENTITY'
 ]);
 expect(result.diagnostics.every(d=>d.severity==='warning')).toBe(true);
});

test('keeps case-sensitive attribute names out of recognized labels and direction controls',async()=>{
 const result=dotAdapter.parse(await fixture('case-sensitive-attributes'),context);
 expect(result.visual?.nodes).toEqual([{id:'n1',label:'a'},{id:'n2',label:'b'}]);
 expect(result.visual?.edges).toEqual([{id:'e1',from:'n1',to:'n2'}]);
 expect(result.diagnostics.filter(d=>d.code==='DOT_ATTRIBUTE_LOSS')).toHaveLength(2);
 expect(result.diagnostics.some(d=>d.severity==='error')).toBe(false);
});

test('honors defaults, implicit nodes, strict duplicate edges and native edge-chain expansion',async()=>{
 const defaults=dotAdapter.parse(await fixture('default-labels'),context);
 expect(defaults.visual?.nodes).toEqual([{id:'n1',label:'Source'},{id:'n2',label:'unnamed'}]);
 expect(defaults.visual?.edges).toEqual([{id:'e1',from:'n1',to:'n2',label:'flows'}]);
 const strict=dotAdapter.parse(await fixture('strict-duplicates'),context);
 expect(strict.visual?.edges).toEqual([{id:'e1',from:'n1',to:'n2',label:'last'}]);
 const chain=dotAdapter.parse('digraph { a -> b -> c; a,b -> c,d; c -> c }',context);
 expect(chain.visual?.nodes).toHaveLength(4);
 expect(chain.visual?.edges?.map(({from,to})=>[from,to])).toEqual([
  ['n1','n2'],['n2','n3'],['n1','n3'],['n1','n4'],['n2','n3'],['n2','n4'],['n3','n3']
 ]);
});

test.each([
 ['undirected','DOT_DIRECTION'],['subgraph','DOT_SUBGRAPH'],['port','DOT_PORT'],['html-label','DOT_HTML'],['escaped-label','DOT_LABEL_ESCAPE']
] as const)('refuses unsupported native meaning in %s',async(name,code)=>{
 const result=dotAdapter.parse(await fixture(name),context);
 expect(result.visual).toBeUndefined();expect(result.diagnostics[0]?.code).toBe(code);expect(result.diagnostics[0]?.severity).toBe('error');
 expect(result.diagnostics[0]?.range?.end).toBeGreaterThan(result.diagnostics[0]?.range?.start??-1);
});

test.each([
 ['digraph { a -> b [dir=back] }','DOT_DIRECTION'],
 ['digraph { a -> b [dir=none] }','DOT_DIRECTION'],
 ['digraph { edge [dir=back]; a -> b }','DOT_DIRECTION'],
 ['digraph { a -> b [arrowhead=none] }','DOT_DIRECTION'],
 ['digraph { a -> b [label="unterminated] }','DOT_SYNTAX'],
 ['digraph { a -> b /* unterminated','DOT_SYNTAX']
] as const)('rejects direction changes or malformed syntax: %s', (source,code)=>{
 const result=dotAdapter.parse(source,context);expect(result.visual).toBeUndefined();expect(result.diagnostics[0]?.code).toBe(code);
});

test('accepts quoted reserved words and decodes the bounded label escape subset',()=>{
 const source='digraph { "node" [label="line\\nnext"]; "graph" -> "edge" [label="literal \\\\ path"]; }';
 const result=dotAdapter.parse(source,context);
 expect(result.visual?.nodes?.map(n=>n.label)).toEqual(['line\nnext','graph','edge']);
 expect(result.visual?.edges?.[0]?.label).toBe('literal \\ path');
 expect(dotAdapter.parse('digraph { node }',context).visual).toBeUndefined();
});

test('uses collision-free native identity keys for edges whose IDs contain separators',()=>{
 const result=dotAdapter.parse('digraph { "a->b" -> c; a -> "b->c" }',context);
 const edgeIds=result.identityMap.filter(item=>item.kind==='edge').map(item=>item.nativeId);
 expect(edgeIds).toHaveLength(2);expect(new Set(edgeIds).size).toBe(2);
});

test('refuses a default label derived from a native ID containing Graphviz escapes',async()=>{
 const result=dotAdapter.parse(await fixture('escaped-default-id'),context);
 expect(result.visual).toBeUndefined();expect(result.diagnostics[0]?.code).toBe('DOT_LABEL_ESCAPE');
});

test('leaves optional empty edge lists out and returns a complete public visual document',()=>{
 const result=dotAdapter.parse('digraph { a }',context);
 expect(result.visual).toBeDefined();expect(result.visual).not.toHaveProperty('edges');
 expect(Object.keys(result.visual!.nodes![0]!)).toEqual(['id','label']);
 const checked=inspectVisual(createVisualDocument(result.visual!));
 expect(checked.valid).toBe(true);expect(checked.complete).toBe(true);expect(checked.diagnostics).toEqual([]);
});

test('refuses more than 15 nodes explicitly',()=>{
 const source='digraph { '+Array.from({length:16},(_,i)=>'n'+i).join('; ')+' }';
 const result=dotAdapter.parse(source,context);
 expect(result.visual).toBeUndefined();expect(result.diagnostics.at(-1)?.code).toBe('DOT_VISUAL_SIZE');
});

test('bounds direct adapter inputs before tokenizing',()=>{
 const result=dotAdapter.parse('x'.repeat(1_000_001),context);
 expect(result.visual).toBeUndefined();expect(result.diagnostics[0]?.code).toBe('DOT_SOURCE_SIZE');
});

test('exports quoted directed network source and reports visual fields DOT cannot carry',()=>{
 const visual:Visual={id:'exported graph',kind:'flow',form:'network',question:'What changes?',title:'Deployment',nodes:[
  {id:'start',label:'Start service',role:'own',detail:'',evidence:[]},{id:'db',label:'Ticket store'}
 ],edges:[{id:'write',from:'start',to:'db',label:'writes',kind:'data'}]};
 const result=dotAdapter.serialize(visual,context);
 expect(result.text).toBe('digraph "exported graph" {\n  graph [label="Deployment"];\n  "start" [label="Start service"];\n  "db" [label="Ticket store"];\n  "start" -> "db" [label="writes"];\n}\n');
 expect(result.diagnostics.map(d=>d.code)).toEqual(['DOT_NODE_DETAIL','DOT_NODE_FIELD','DOT_NODE_FIELD','DOT_EDGE_FIELD']);
 const reparsed=dotAdapter.parse(result.text!,context);
 expect(reparsed.visual?.nodes?.map(n=>n.label)).toEqual(['Start service','Ticket store']);
 expect(reparsed.visual?.edges?.map(e=>[e.from,e.to,e.label])).toEqual([['n1','n2','writes']]);
});

test('quotes labels containing quotes, literal backslashes and newlines without changing their text',()=>{
 const label='quote " slash \\ newline\nnext';
 const visual:Visual={id:'hostile-labels',kind:'flow',form:'network',question:'Where does it go?',nodes:[{id:'a',label}],edges:[]};
 const result=dotAdapter.serialize(visual,context);expect(result.text).toContain('quote \\" slash \\\\ newline\\nnext');
 const reparsed=dotAdapter.parse(result.text!,context);expect(reparsed.visual?.nodes?.[0]?.label).toBe(label);
});

test.each([
 ['graph ID', {id:'bad\u0000id'},'/extensions/umf.visual/id'],
 ['graph title', {title:'bad\rtitle'},'/extensions/umf.visual/title'],
 ['node ID', {nodes:[{id:'bad\ud800',label:'ok'}]},'/extensions/umf.visual/nodes/0/id'],
 ['node label', {nodes:[{id:'a',label:'bad\ud800'}]},'/extensions/umf.visual/nodes/0/label'],
 ['edge label', {edges:[{id:'e',from:'a',to:'a',label:'bad\u0000label'}]},'/extensions/umf.visual/edges/0/label']
] as const)('refuses unencodable text in %s with a field path',(_name,fields,path)=>{
 const visual:Visual={id:'base',kind:'flow',form:'network',question:'Q',nodes:[{id:'a',label:'A'}],...fields} as Visual;
 const result=dotAdapter.serialize(visual,context);
 expect(result.text).toBeUndefined();expect(result.diagnostics[0]?.code).toBe('DOT_TEXT');expect(result.diagnostics[0]?.path).toBe(path);
});

test('preserves emoji and LF labels while escaping them in native DOT text',()=>{
 const label='ready 😀\nnext';
 const visual:Visual={id:'safe-text',kind:'flow',form:'network',question:'Q',title:label,nodes:[{id:'a',label}],edges:[]};
 const result=dotAdapter.serialize(visual,context);
 expect(result.diagnostics.some(d=>d.code==='DOT_TEXT')).toBe(false);expect(result.text).toContain('ready 😀\\nnext');
 const reparsed=dotAdapter.parse(result.text!,context);
 expect(reparsed.visual?.title).toBe(label);expect(reparsed.visual?.nodes?.[0]?.label).toBe(label);
});
