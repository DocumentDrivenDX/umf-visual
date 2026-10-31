// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash} from 'node:crypto';
import {describe,expect,test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {exportVisual} from '../../src/interchange';
import {mermaidAdapter} from '../../src/interchange/mermaid';

const cases=[
 {id:'visual-catalog-canary-entities',path:'fixtures/catalog/canary-entities.json',sha256:'6b101dd70cab0fbb10a87b195515d76d06f62828afe02d1f368afe417ecfbd6e',losses:{MERMAID_IDENTIFICATION:1,MERMAID_NULLABLE:1}},
 {id:'visual-inventory-beacon-schema-tickets',path:'fixtures/visual/inventory/beacon-schema-tickets.json',sha256:'3ea8d7e5c8941457901cecb9a6755bc02fd5119c0a9e6fb92bf9e21d4881054e',losses:{INTERCHANGE_UNREPRESENTED_FIELD:15,MERMAID_FIELD_REFERENCE:9,MERMAID_IDENTIFICATION:9,MERMAID_NODE_FIELDS:10}},
 {id:'visual-inventory-beacon-schema-workspace',path:'fixtures/visual/inventory/beacon-schema-workspace.json',sha256:'74cc43f6171ed212876b6fab8fc9ee1429dbd4bca2e7c79394d46e9800bb3dad',losses:{INTERCHANGE_UNREPRESENTED_FIELD:12,MERMAID_FIELD_REFERENCE:6,MERMAID_IDENTIFICATION:6,MERMAID_NODE_FIELDS:7}},
 {id:'visual-inventory-tpl-sd-domain',path:'fixtures/visual/inventory/tpl-sd-domain.json',sha256:'b054796bb6031693eb3df54ff03cc7b27fb2ad8fa4ba90bd66f7f36573bd6471',losses:{INTERCHANGE_UNREPRESENTED_FIELD:5,MERMAID_IDENTIFICATION:6}},
] as const;
const sha256=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const counts=(rows:{code:string;loss:boolean}[])=>Object.fromEntries([...new Set(rows.filter(row=>row.loss).map(row=>row.code))].sort().map(code=>[code,rows.filter(row=>row.loss&&row.code===code).length]));

describe('Mermaid ER native probe inputs',()=>{
 test('keeps exact fixture hashes and raw projection-loss baselines for the four entity cases',async()=>{
  for(const item of cases){
   const bytes=await readFile(item.path);expect(sha256(bytes),item.id).toBe(item.sha256);
   const document=JSON.parse(bytes.toString('utf8'));
   const result=exportVisual(document,{format:'mermaid',mode:'allow-reported-loss'});
   expect(result.text,item.id).toBeTruthy();expect(counts(result.diagnostics),item.id).toEqual(item.losses);
  }
 });

 test('does not treat a leading star as a key or nullable type punctuation as metadata',()=>{
  const source='erDiagram\n  RECORD {\n    string? *name\n  }\n';
  const parsed=mermaidAdapter.parse(source,{id:'literal-er-field',question:'What is literal?'});
  expect(parsed.visual?.structure?.entities?.[0].fields).toEqual([{name:'*name',type:'string?'}]);
  expect(parsed.visual?.structure?.entities?.[0].fields?.[0]).not.toHaveProperty('keys');
  expect(parsed.visual?.structure?.entities?.[0].fields?.[0]).not.toHaveProperty('nullable');
 });
});
