// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {createVisualDocument,inspectVisual} from '../../src/extensions/visual';
import {mermaidAdapter} from '../../src/interchange/mermaid';

const ctx={id:'diagram',question:'What is connected?'};
const fixture=(name:string)=>readFile(new URL('../../fixtures/interchange/mermaid/'+name,import.meta.url),'utf8');

describe('Mermaid 12.2 bounded adapter',()=>{
 test('imports directed simple flowcharts with labels and exact native identity maps',async()=>{
  const source=await fixture('flowchart-basic.mmd');const result=mermaidAdapter.parse(source,ctx);
  expect(result.visual?.kind).toBe('flow');expect(result.visual?.form).toBe('network');
  expect(result.visual?.nodes?.map(n=>n.label)).toEqual(['load "trusted" data & π','check #1']);
  expect(result.visual?.edges?.[0]).toMatchObject({id:'e1',from:'n1',to:'n2',label:'ready & safe'});
  expect(result.visual?.nodes?.[0]).not.toHaveProperty('sourceId');
  expect(result.visual?.nodes?.[0]).not.toHaveProperty('line');
  expect(result.visual?.edges?.[0]).not.toHaveProperty('line');
  expect(inspectVisual(createVisualDocument(result.visual!)).complete).toBe(true);
  expect(result.identityMap.map(m=>m.nativeId)).toEqual(['source','gate','edge@1']);
 });

 test('exports quote hostile labels with Mermaid entity escapes and keeps Unicode',()=>{
  const result=mermaidAdapter.serialize({id:'diagram',kind:'flow',form:'network',question:ctx.question,nodes:[
   {id:'n1',label:'A "quoted" <tag> & π `literal`'},{id:'n2',label:'end'}],edges:[{id:'e1',from:'n1',to:'n2',label:'x | y'}]},ctx);
  expect(result.text).toContain('A #34;quoted#34; #60;tag#62; #38; π #96;literal#96;');
  expect(result.text).toContain('x #124; y');
  expect(result.text).toContain('end');
  const decoded=mermaidAdapter.parse(result.text!,ctx);
  expect(decoded.visual?.nodes?.[0].label).toBe('A "quoted" <tag> & π `literal`');
  expect(decoded.visual?.edges?.[0].label).toBe('x | y');
 });

 test('accepts numeric-escaped plain text and refuses named entities, raw HTML, and Markdown strings',()=>{
  const numeric=mermaidAdapter.parse('flowchart TD\n  A["#34; #38; #60;tag#62;"]\n  B["x #60; y"]\n',ctx);
  expect(numeric.visual?.nodes?.map(n=>n.label)).toEqual(['" & <tag>','x < y']);
  for(const label of ['#quot;','&quot;','&amp;','A<br/>B','`**bold**`','x < y']){
   const result=mermaidAdapter.parse('flowchart TD\n  A["'+label+'"]\n',ctx);
   expect(result.visual).toBeUndefined();
   expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_RICH_TEXT',severity:'error'}));
  }
 });

 test('imports ER entities, fields, cardinalities, and explicitly reports identifying semantics',async()=>{
  const source=await fixture('entities-basic.mmd');const result=mermaidAdapter.parse(source,ctx);
  expect(result.visual?.kind).toBe('structure');expect(result.visual?.form).toBe('entities');
  expect(result.visual?.structure?.entities?.[0].fields).toEqual([
   {name:'customer_id',type:'string',keys:['pk']},{name:'display_name',type:'string?'},
  ]);
  expect(result.visual?.structure?.references?.[0]).toMatchObject({fromCardinality:'exactly-one',toCardinality:'zero-or-many',label:'places'});
  expect(result.diagnostics.some(d=>d.code==='MERMAID_IDENTIFICATION'&&d.loss)).toBe(true);
  expect(result.identityMap.some(m=>m.kind==='field'&&m.nativeId==='customer_id')).toBe(true);
  expect(result.visual?.nodes?.[0]).not.toHaveProperty('line');
  expect(result.visual&&inspectVisual(createVisualDocument(result.visual)).complete).toBe(true);
 });

 test('does not invent missing ER cardinality or silently accept unsupported statements',()=>{
  const missing=mermaidAdapter.parse('erDiagram\n  A --o{ B : links\n',ctx);
  expect(missing.visual).toBeUndefined();expect(missing.diagnostics.some(d=>d.code==='MERMAID_CARDINALITY'&&d.severity==='error')).toBe(true);
  const subgraph=mermaidAdapter.parse('flowchart LR\n  subgraph Group\n    A --> B\n  end\n',ctx);
  expect(subgraph.visual).toBeUndefined();expect(subgraph.diagnostics.some(d=>d.code==='MERMAID_UNSUPPORTED'&&d.severity==='error')).toBe(true);
  const wrongEnd=mermaidAdapter.parse('erDiagram\n  A o|--|| B : invalid\n',ctx);
  expect(wrongEnd.visual).toBeUndefined();expect(wrongEnd.diagnostics.some(d=>d.code==='MERMAID_CARDINALITY'&&d.severity==='error')).toBe(true);
  expect(mermaidAdapter.parse('FLOWCHART LR\n  A --> B\n',ctx).visual).toBeUndefined();
  expect(mermaidAdapter.parse('ERDIAGRAM\n  A\n',ctx).visual).toBeUndefined();
 });

 test('reports non-identifying ER semantics while preserving representable endpoint cardinalities',()=>{
  const result=mermaidAdapter.parse('erDiagram\n  PERSON }|..|{ CAR : drives\n',ctx);
  expect(result.visual?.structure?.references?.[0]).toMatchObject({fromCardinality:'one-or-many',toCardinality:'one-or-many'});
  expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_IDENTIFICATION',loss:true}));
 });

 test('normalizes equivalent quoted ER names and reports comments and layout directives',()=>{
  const source='erDiagram\n  "A"\n  A\n  %% keep this note\n  direction LR\n';
  const result=mermaidAdapter.parse(source,ctx);
  expect(result.visual?.nodes).toHaveLength(1);
  expect(result.visual?.nodes?.[0].label).toBe('A');
  expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_COMMENT',loss:false}));
  expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_DIRECTION',loss:true}));
  expect(result.visual&&inspectVisual(createVisualDocument(result.visual)).complete).toBe(true);
 });

 test('rejects invalid numeric entity code without throwing',()=>{
  const result=mermaidAdapter.parse('flowchart TD\n  A["#999999999999; unsafe"]\n',ctx);
  expect(result.visual).toBeUndefined();
  expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_ENTITY_CODE',severity:'error'}));
  const later=mermaidAdapter.parse('flowchart TD\n  A["#65;#1114112; unsafe"]\n',ctx);
  expect(later.visual).toBeUndefined();
  expect(later.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_ENTITY_CODE',severity:'error'}));
 });

 test('uses a later explicit flow label even when it matches the node id',()=>{
  const result=mermaidAdapter.parse('flowchart TD\n  A["before"]\n  A["A"]\n',ctx);
  expect(result.visual?.nodes?.[0].label).toBe('A');
 });

 test('does not infer ER nullable or primary-key semantics from display syntax',()=>{
  const result=mermaidAdapter.parse('erDiagram\n  PERSON {\n    string? *id\n  }\n',ctx);
  expect(result.visual?.structure?.entities?.[0].fields[0]).toEqual({name:'id',type:'string?'});
  expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_PRIMARY_MARKER',loss:true}));
  const exported=mermaidAdapter.serialize({id:'v',kind:'structure',form:'entities',question:'q',nodes:[{id:'n',label:'Person'}],structure:{entities:[{node:'n',fields:[{name:'id',type:'string',nullable:true}]}]}},ctx);
  expect(exported.text).toContain('string id');
  expect(exported.text).not.toContain('string? id');
  expect(exported.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_NULLABLE',loss:true}));
 });

 test('uses correct field and reference paths and reports present empty export fields',()=>{
  const er=mermaidAdapter.parse('erDiagram\n  A {\n    string a\n  }\n  B {\n    string b\n  }\n',ctx);
  expect(er.identityMap.find(m=>m.kind==='field'&&m.nativeId==='b')?.path).toBe('/extensions/umf.visual/structure/entities/1/fields/0/name');
  expect(er.identityMap.find(m=>m.kind==='field'&&m.nativeId==='b')?.sourcePath).toBe('/source/5');
  const flow=mermaidAdapter.serialize({id:'v',kind:'flow',form:'network',question:'q',nodes:[{id:'n',label:'N',detail:''}],edges:[]},ctx);
  expect(flow.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_NODE_FIELDS'}));
  const ref=mermaidAdapter.serialize({id:'v',kind:'structure',form:'entities',question:'q',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],structure:{entities:[{node:'a',fields:[]},{node:'b',fields:[]}],references:[{id:'r',from:{node:'a',field:''},to:{node:'b'},fromCardinality:'exactly-one',toCardinality:'exactly-one'}]}},ctx);
  expect(ref.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_FIELD_REFERENCE',path:'/extensions/umf.visual/structure/references/0'}));
 });

 test('uses entity declaration order for field pointers and occurrence ids for repeated references',()=>{
  const source=mermaidAdapter.parse('erDiagram\n  A ||--|| B : first\n  A ||--|| B : second\n',ctx);
  expect(source.identityMap.filter(m=>m.kind==='reference').map(m=>m.nativeId)).toEqual(['reference@1','reference@2']);
  const exported=mermaidAdapter.serialize({id:'v',kind:'structure',form:'entities',question:'q',nodes:[{id:'a',label:'Entity A'},{id:'b',label:'Entity B'}],structure:{entities:[{node:'b',fields:[{name:'b_id',type:'int',nullable:false}]},{node:'a',fields:[{name:'a_id',type:'string'}]}]}},ctx);
  expect(exported.identityMap.find(m=>m.kind==='node'&&m.visualId==='a')?.nativeId).toBe('"Entity A"');
  expect(exported.identityMap.find(m=>m.kind==='field'&&m.nativeId==='b_id')?.path).toBe('/extensions/umf.visual/structure/entities/0/fields/0/name');
  expect(exported.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_NULLABLE',path:'/extensions/umf.visual/structure/entities/0/fields/0/nullable',loss:true}));
 });

 test('reports field comments, frontmatter metadata, init directives, and title statements',()=>{
  const field=mermaidAdapter.parse('erDiagram\n  A {\n    string id PK "database key"\n  }\n',ctx);
  expect(field.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_FIELD_COMMENT',loss:true,path:'/source/2'}));
  const frontmatter=mermaidAdapter.parse('---\ntitle: Customer diagram\n---\nerDiagram\n  A\n',ctx);
  expect(frontmatter.visual).toBeUndefined();
  expect(frontmatter.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_METADATA',severity:'error'}));
  const directive=mermaidAdapter.parse('flowchart TD\n  %%{init: {"theme":"base"}}%%\n  A\n',ctx);
  expect(directive.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_DIRECTIVE',loss:true}));
  const title=mermaidAdapter.parse('flowchart TD\n  title My Flow\n  A\n',ctx);
  expect(title.diagnostics).toContainEqual(expect.objectContaining({code:'MERMAID_TITLE',loss:true}));
 });

 test('omits an empty graph edge array so the imported document remains complete',()=>{
  const result=mermaidAdapter.parse('flowchart TD\n  A\n',ctx);
  expect(result.visual).not.toHaveProperty('edges');
  expect(result.visual&&inspectVisual(createVisualDocument(result.visual)).complete).toBe(true);
 });

 test('ER export and import retain the representable cardinality subset',()=>{
  const visual={id:'diagram',kind:'structure' as const,form:'entities' as const,question:ctx.question,
   nodes:[{id:'person',label:'Person α'},{id:'order',label:'Order'}],
   structure:{entities:[{node:'person',fields:[{name:'id',type:'string',keys:['pk'] as ('pk')[]}]},{node:'order',fields:[{name:'id',type:'int'}]}],
    references:[{id:'places',from:{node:'person'},to:{node:'order'},label:'places',fromCardinality:'exactly-one' as const,toCardinality:'zero-or-many' as const}]}};
  const encoded=mermaidAdapter.serialize(visual,ctx);expect(encoded.text).toContain('||--o{');
  expect(encoded.diagnostics.some(d=>d.code==='MERMAID_IDENTIFICATION'&&d.loss)).toBe(true);
  const decoded=mermaidAdapter.parse(encoded.text!,ctx);expect(decoded.visual?.structure?.references?.[0]).toMatchObject({fromCardinality:'exactly-one',toCardinality:'zero-or-many'});
  expect(decoded.diagnostics.some(d=>d.code==='MERMAID_IDENTIFICATION')).toBe(true);
 });
});
