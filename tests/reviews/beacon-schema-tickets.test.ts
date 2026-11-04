// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/beacon-schema-tickets.json';
const definitionPath='fixtures/reviews/definitions/beacon-schema-tickets.json';
const migrationDirectory='fixtures/visual/sources/beacon/migrations';
const migrationPaths=[
 `${migrationDirectory}/0001_workspace.sql`,
 `${migrationDirectory}/0002_tickets.sql`,
 `${migrationDirectory}/0003_drafts.sql`,
 `${migrationDirectory}/0004_jobs.sql`,
];
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
const sourceBytes=readFileSync(sourcePath),source=read<Document>(sourcePath),sourceVisual=getVisual(source) as Visual;
const definitionBytes=readFileSync(definitionPath),definition=read<Document>(definitionPath),visual=getVisual(definition) as Visual;
const migrationBytes=migrationPaths.map(path=>readFileSync(path));

type SqlKey='pk'|'fk'|'uk';
type SqlColumn={table:string;name:string;type:string;nullable:boolean;keys:SqlKey[];references?:{table:string;field:string}};
const sqlKeys=(constraints:string):SqlKey[]=>{const keys:SqlKey[]=[];if(/\bPRIMARY KEY\b/.test(constraints))keys.push('pk');if(/\bREFERENCES\b/.test(constraints))keys.push('fk');return keys;};
function selectedSqlColumns():SqlColumn[]{
 const columns:SqlColumn[]=[];
 for(const bytes of migrationBytes){
  const text=bytes.toString('utf8');
  for(const match of text.matchAll(/CREATE TABLE ([a-z_]+) \(([\s\S]*?)\);/g)){
   const table=match[1]!;
   for(const raw of match[2]!.split('\n')){
    const line=raw.trim().replace(/,$/,'');if(!line)continue;
    const column=line.match(/^([a-z_]+)\s+([a-z]+)(.*)$/);if(!column)continue;
    const [,name,type,constraints]=column;
    const references=constraints!.match(/REFERENCES\s+([a-z_]+)\s*\(([a-z_]+)\)/);
    columns.push({table,name:name!,type:type!,nullable:!(/\bNOT NULL\b|\bPRIMARY KEY\b/.test(constraints!)),keys:sqlKeys(constraints!),...(references?{references:{table:references[1]!,field:references[2]!}}:{})});
   }
  }
  for(const match of text.matchAll(/ALTER TABLE ([a-z_]+) ADD COLUMN ([a-z_]+) ([a-z]+)([^;]*);/g)){
   const [,table,name,type,constraints]=match;
   columns.push({table:table!,name:name!,type:type!,nullable:!(/\bNOT NULL\b|\bPRIMARY KEY\b/.test(constraints!)),keys:sqlKeys(constraints!)});
  }
 }
 return columns;
}

const selectedTables=['customers','tickets','messages','attachments','tags','ticket_tags','kb_articles','drafts','draft_sources','reviews'];
const internalReferences=selectedSqlColumns().filter(column=>selectedTables.includes(column.table)&&column.references&&selectedTables.includes(column.references.table));
const externalReferences=selectedSqlColumns().filter(column=>selectedTables.includes(column.table)&&column.references&&!selectedTables.includes(column.references.table));

test('original ticket fixture remains exact and the review adds only migration-backed facts',()=>{
 expect(hash(sourceBytes)).toBe('3ea8d7e5c8941457901cecb9a6755bc02fd5119c0a9e6fb92bf9e21d4881054e');
 expect(source.id).toBe('visual:beacon-schema-tickets');expect(source.umf).toBe('0.10.0');expect(source.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(hash(Buffer.concat(migrationBytes))).toBe('8a3e9b961a37bcce32cad3187344203535e63994b6a1d46e02f8bb99e6649c90');
 expect(migrationPaths.map(path=>path.split('/').at(-1))).toEqual(['0001_workspace.sql','0002_tickets.sql','0003_drafts.sql','0004_jobs.sql']);
 expect(sourceVisual.source).toEqual({path:'umf:fixtures/visual/sources/beacon/migrations',digest:'sha256:8a3e9b961a37bcce32cad3187344203535e63994b6a1d46e02f8bb99e6649c90'});
 expect(visual.id).toBe(sourceVisual.id);expect(definition.id).toBe(source.id);expect(definition.umf).toBe(source.umf);expect(definition.vocabularies).toEqual(source.vocabularies);
 expect(visual).toMatchObject({id:sourceVisual.id,kind:'structure',form:'entities',title:sourceVisual.title,question:sourceVisual.question,audience:sourceVisual.audience,source:sourceVisual.source});
 expect(visual.nodes).toEqual(sourceVisual.nodes);
 const originalEntities=sourceVisual.structure!.entities!,reviewEntities=visual.structure!.entities!,columns=selectedSqlColumns();
 expect(originalEntities).toHaveLength(10);expect(reviewEntities).toHaveLength(10);expect(columns.filter(column=>selectedTables.includes(column.table))).toHaveLength(35);
 expect(reviewEntities.map(entity=>entity.node)).toEqual(selectedTables);
 for(let index=0;index<reviewEntities.length;index++){
  const original=originalEntities[index]!,review=reviewEntities[index]!,sourceFields=columns.filter(column=>column.table===review.node);
  expect(review.node).toBe(original.node);expect(review.fields).toHaveLength(sourceFields.length);
  expect(review.fields.map(({name,type,keys,nullable})=>({name,type,keys:keys??[],nullable}))).toEqual(sourceFields.map(({name,type,keys,nullable})=>({name,type,keys,nullable})));
  expect(review.fields.map(({name,type,keys})=>({name,type,...(keys===undefined?{}:{keys})}))).toEqual(original.fields.map(({name,type,keys})=>({name,type,...(keys===undefined?{}:{keys})})));
 }
 expect(internalReferences).toHaveLength(9);expect(externalReferences.map(({table,name,references})=>`${table}.${name} -> ${references!.table}`).sort()).toEqual(['customers.workspace_id -> workspaces','drafts.agent_id -> agents','tickets.workspace_id -> workspaces']);
 expect(visual.structure!.references).toEqual(sourceVisual.structure!.references!.map(reference=>({...reference,from:{...reference.from,field:'id'}})));
 for(const reference of visual.structure!.references!)expect(reference.from.field).toBe('id');
 expect(visual.omissions).toEqual(sourceVisual.omissions);
 expect(selectedSqlColumns().filter(column=>selectedTables.includes(column.table)&&column.nullable).map(({table,name})=>`${table}.${name}`).sort()).toEqual(['attachments.bytes','drafts.tone']);
 expect(selectedSqlColumns().filter(column=>column.table==='ticket_tags'||column.table==='draft_sources').every(column=>!column.keys.includes('pk'))).toBe(true);
 expect(inspectVisual(definition)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(definition),json=readVisualDocument(definitionBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(json,'json'))).toEqual(definition);
 const yaml=writeVisualDocument(json,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlRead)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(definition);expect(JSON.stringify(definition)).toBe(before);
});

test('review source manifest binds original JSON and all four exact SQL migration files',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(example=>example.id==='beacon-schema-tickets')!;
 const originalDigest=hash(sourceBytes),definitionDigest=hash(definitionBytes);
 expect(row).toMatchObject({id:'beacon-schema-tickets',title:'What Beacon keeps for a ticket',kind:'structure',form:'entities',definitionPath,definitionSha256:definitionDigest});
 expect(row.sources).toHaveLength(5);expect(row.sources[0]).toEqual({path:sourcePath,sha256:originalDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies the original ten entity IDs, roles and field order/types/key markers, nine internal references and three explicit out-of-scope reference omissions, plus the ticket-focused title, question, audience and migration-directory locator.'});
 expect(row.sources.slice(1).map((item:any)=>({path:item.path,sha256:item.sha256}))).toEqual(migrationPaths.map(path=>({path,sha256:hash(readFileSync(path))})));
 expect(row.publishedAssets.map((item:any)=>({path:item.path,sha256:item.sha256}))).toEqual([{path:sourcePath,sha256:originalDigest},...migrationPaths.map(path=>({path,sha256:hash(readFileSync(path))}))]);
 expect(row.publishedAssets.slice(1).map((item:any)=>({outputPath:item.outputPath,mediaType:item.mediaType}))).toEqual(migrationPaths.map(path=>({outputPath:`reviews/beacon-schema-tickets/migrations/${path.split('/').at(-1)}`,mediaType:'text/plain'})));
 expect(row.originalEvidence).toMatchObject({kind:'authoritative-umf-source',sourcePath,sourceSha256:originalDigest,documentId:'visual:beacon-schema-tickets',visualId:'beacon-schema-tickets',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/beacon-schema-tickets/authoritative-source.json'});
 expect(row.originalEvidence.scope).toContain('SHA-256 over their raw bytes concatenated in lexicographic filename order with no separators');
 expect(row.originalEvidence.scope).toContain('not the complete migration directory');
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
