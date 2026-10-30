// SPDX-License-Identifier: MIT OR Apache-2.0
// Compare actual emitted-loss diagnostics with the committed example baseline.
import {createHash} from 'node:crypto';
import {createCatalogData} from './build';
import baseline from '../../fixtures/interchange/progress/baseline.json';
const formats=['dot','mermaid','lini'] as const;
const catalog=await createCatalogData();
const lossCounts=(diagnostics:{code:string;loss:boolean}[])=>Object.fromEntries([...new Set(diagnostics.filter(d=>d.loss).map(d=>d.code))].sort().map(code=>[code,diagnostics.filter(d=>d.loss&&d.code===code).length]));
const records=baseline.records.map(before=>{
 const item=catalog.items.find(candidate=>candidate.id===before.id);
 if(!item)throw Error('Baseline example missing: '+before.id);
 if(item.sourceSha256!==before.sourceSha256)throw Error('Baseline example source changed; review comparison before claiming less loss: '+before.id);
 const format=before.format as typeof formats[number],target=item.targets[format];
 const after={status:target.status,emitted:target.ok,lossCounts:target.ok?lossCounts(target.diagnostics):{}};
 if(before.emitted&&!after.emitted)throw Error('Previously emitted example now refuses: '+before.id+'/'+format);
 return{id:item.id,sourcePath:item.sourcePath,format,before:{status:before.status,emitted:before.emitted,lossCounts:before.lossCounts},after};
});
const summary=formats.map(format=>{
 const selected=records.filter(r=>r.format===format);
 const codes=[...new Set(selected.flatMap(r=>[...Object.keys(r.before.lossCounts),...Object.keys(r.after.lossCounts)]))].sort();
 return{format,emittedBefore:selected.filter(r=>r.before.emitted).length,emittedAfter:selected.filter(r=>r.after.emitted).length,strictBefore:selected.filter(r=>r.before.status==='supported').length,strictAfter:selected.filter(r=>r.after.status==='supported').length,changes:codes.map(code=>({code,before:selected.reduce((sum,r)=>sum+((r.before.lossCounts as Record<string,number>)[code]??0),0),after:selected.reduce((sum,r)=>sum+((r.after.lossCounts as Record<string,number>)[code]??0),0)})).filter(r=>r.before!==r.after)};
});
const report={schemaVersion:1,baselineCommit:baseline.baselineCommit,baselineSha256:createHash('sha256').update(await Bun.file('fixtures/interchange/progress/baseline.json').bytes()).digest('hex'),profiles:catalog.capabilities,policy:baseline.policy,summary,records};
await Bun.write('.cache/loss-progress.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({baselineCommit:report.baselineCommit,summary}));
