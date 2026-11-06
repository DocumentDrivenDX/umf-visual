// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/beacon-schema-workspace.json';
const definitionPath='fixtures/reviews/definitions/beacon-schema-workspace.json';
const migrationDirectory='fixtures/visual/sources/beacon/migrations';
const migrationPaths=['0001_workspace.sql','0002_tickets.sql','0003_drafts.sql','0004_jobs.sql'].map(name=>`${migrationDirectory}/${name}`);
const manifestPath='fixtures/reviews/review-sources.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
const sourceBytes=readFileSync(sourcePath),source=read<Document>(sourcePath),sourceVisual=getVisual(source) as Visual;
const definitionBytes=readFileSync(definitionPath),definition=read<Document>(definitionPath),visual=getVisual(definition) as Visual;
const migrationBytes=migrationPaths.map(path=>readFileSync(path));
type SqlKey='pk'|'fk'|'uk';
type SqlColumn={table:string;name:string;type:string;nullable:boolean;keys:SqlKey[];references?:{table:string;field:string}};
function sqlColumns():SqlColumn[]{
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
    const keys:SqlKey[]=[];if(/\bPRIMARY KEY\b/.test(constraints!))keys.push('pk');if(/\bREFERENCES\b/.test(constraints!))keys.push('fk');
    columns.push({table,name:name!,type:type!,nullable:!(/\bNOT NULL\b|\bPRIMARY KEY\b/.test(constraints!)),keys,...(references?{references:{table:references[1]!,field:references[2]!}}:{})});
   }
  }
 }
 return columns;
}
const selectedTables=['workspaces','agents','settings','integrations','jobs','job_runs','schedules'];
const columns=sqlColumns().filter(column=>selectedTables.includes(column.table));
const selectedReferences=columns.filter(column=>column.references&&selectedTables.includes(column.references.table));
const externalReferences=columns.filter(column=>column.references&&!selectedTables.includes(column.references.table));

test('original workspace fixture remains exact and review semantics follow the checked-in SQL',()=>{
 expect(hash(sourceBytes)).toBe('74cc43f6171ed212876b6fab8fc9ee1429dbd4bca2e7c79394d46e9800bb3dad');
 expect(source.id).toBe('visual:beacon-schema-workspace');expect(source.umf).toBe('0.10.0');expect(source.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(hash(Buffer.concat(migrationBytes))).toBe('8a3e9b961a37bcce32cad3187344203535e63994b6a1d46e02f8bb99e6649c90');
 expect(migrationPaths.map(path=>path.split('/').at(-1))).toEqual(['0001_workspace.sql','0002_tickets.sql','0003_drafts.sql','0004_jobs.sql']);
 expect(sourceVisual.source).toEqual({path:'umf:fixtures/visual/sources/beacon/migrations',digest:'sha256:8a3e9b961a37bcce32cad3187344203535e63994b6a1d46e02f8bb99e6649c90'});
 expect(definition.id).toBe(source.id);expect(definition.umf).toBe(source.umf);expect(definition.vocabularies).toEqual(source.vocabularies);
 expect(visual).toMatchObject({id:sourceVisual.id,kind:'structure',form:'entities',title:sourceVisual.title,question:sourceVisual.question,audience:sourceVisual.audience,source:sourceVisual.source});expect(visual.nodes).toEqual(sourceVisual.nodes);
 const original=sourceVisual.structure!.entities!,review=visual.structure!.entities!;expect(original).toHaveLength(7);expect(review).toHaveLength(7);expect(columns).toHaveLength(24);expect(review.map(entity=>entity.node)).toEqual(selectedTables);
 for(let i=0;i<review.length;i++){
  const entity=review[i]!,originalEntity=original[i]!,sql=columns.filter(column=>column.table===entity.node);
  expect(entity.node).toBe(originalEntity.node);expect(entity.fields).toHaveLength(sql.length);
  expect(entity.fields.map(({name,type,keys,nullable})=>({name,type,keys:keys??[],nullable}))).toEqual(sql.map(({name,type,keys,nullable})=>({name,type,keys,nullable})));
  expect(entity.fields.map(({name,type,keys})=>({name,type,...(keys===undefined?{}:{keys})}))).toEqual(originalEntity.fields.map(({name,type,keys})=>({name,type,...(keys===undefined?{}:{keys})})));
 }
 expect(selectedReferences).toHaveLength(6);expect(selectedReferences.map(c=>`${c.table}.${c.name}->${c.references!.table}(${c.references!.field})`).sort()).toEqual(['agents.workspace_id->workspaces(id)','integrations.workspace_id->workspaces(id)','job_runs.job_id->jobs(id)','jobs.workspace_id->workspaces(id)','schedules.job_id->jobs(id)','settings.workspace_id->workspaces(id)']);
 expect(externalReferences).toHaveLength(0);
 expect(visual.structure!.references).toHaveLength(6);
 for(const [index,reference] of visual.structure!.references!.entries()){
  const originalReference=sourceVisual.structure!.references![index]!;
  expect(reference).toMatchObject({...originalReference,from:{...originalReference.from,field:'id'},...(reference.to.node==='settings'?{toCardinality:'zero-or-one'}:{})});
  expect(reference.from.field).toBe('id');
  expect(reference.toCardinality).toBe(reference.to.node==='settings'?'zero-or-one':'zero-or-many');
 }
 expect(columns.filter(column=>column.nullable).map(c=>`${c.table}.${c.name}`).sort()).toEqual(['integrations.connected_at','job_runs.finished_at','settings.default_tone']);
 expect(visual.omissions).toEqual(sourceVisual.omissions);
 expect(inspectVisual(definition)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(definition),json=readVisualDocument(definitionBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(json,'json'))).toEqual(definition);
 const yaml=writeVisualDocument(json,'yaml'),yamlRead=readVisualDocument(yaml,'yaml');expect(getVisual(yamlRead)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlRead,'json'))).toEqual(definition);expect(JSON.stringify(definition)).toBe(before);
});

test('review manifest binds the unchanged source and all four exact SQL snapshots',async()=>{
 const manifest=read<{examples:Array<any>}>(manifestPath),row=manifest.examples.find(example=>example.id==='beacon-schema-workspace')!;
 const originalDigest=hash(sourceBytes),definitionDigest=hash(definitionBytes);
 expect(row).toMatchObject({id:'beacon-schema-workspace',title:'What a workspace keeps',kind:'structure',form:'entities',definitionPath,definitionSha256:definitionDigest});
 expect(row.sources).toHaveLength(5);expect(row.sources[0]).toMatchObject({path:sourcePath,sha256:originalDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture'});
 expect(row.sources.slice(1).map((item:any)=>({path:item.path,sha256:item.sha256}))).toEqual(migrationPaths.map(path=>({path,sha256:hash(readFileSync(path))})));
 expect(row.publishedAssets.map((item:any)=>({path:item.path,sha256:item.sha256}))).toEqual([{path:sourcePath,sha256:originalDigest},...migrationPaths.map(path=>({path,sha256:hash(readFileSync(path))}))]);
 expect(row.publishedAssets.slice(1).map((item:any)=>({outputPath:item.outputPath,mediaType:item.mediaType}))).toEqual(migrationPaths.map(path=>({outputPath:`reviews/beacon-schema-workspace/migrations/${path.split('/').at(-1)}`,mediaType:'text/plain'})));
 expect(row.originalEvidence).toMatchObject({kind:'authoritative-umf-source',sourcePath,sourceSha256:originalDigest,documentId:'visual:beacon-schema-workspace',visualId:'beacon-schema-workspace',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/beacon-schema-workspace/authoritative-source.json'});
 expect(row.originalEvidence.scope).toContain('SHA-256 over raw bytes concatenated in lexicographic filename order with no separators');expect(row.originalEvidence.scope).toContain('do not expand this selection');
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
