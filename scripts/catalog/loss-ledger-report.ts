// SPDX-License-Identifier: MIT OR Apache-2.0
import {mkdir} from 'node:fs/promises';
import {createLossLedger,type HistoricalPair} from './loss-ledger';
import {verifyCatalog} from './verify';
import type {VisualCatalog} from './build';

const catalog=await Bun.file('dist-site/catalog.json').json() as VisualCatalog;
const verified=await verifyCatalog(catalog,process.argv.includes('--release'));
const baseline=await Bun.file('fixtures/interchange/progress/v0.1.0.json').json() as {baselineCommit:string;records:HistoricalPair[]};
const nativeLedger=createLossLedger(catalog,baseline.records);
const profiles=catalog.items.flatMap(item=>(item.profileVariants??[]).map(variant=>({
 itemId:item.id,origin:item.origin,sourcePath:item.sourcePath,sourceSha256:item.sourceSha256,
 format:variant.format,profile:variant.profileId,mappingVersion:variant.mappingVersion,modelVersion:variant.modelVersion,
 status:variant.result.status,rawDiagnostics:variant.result.diagnostics,coverage:variant.coverage,
 completeDocumentReadback:variant.result.status==='supported',
 nativeRender:variant.result.render??null,focusedNativeRender:variant.diagramRender??null,
 selectedForRelease:item.preferredRelease?.format===variant.format&&item.preferredRelease.profileId===variant.profileId,
})));
const selected=profiles.filter(pair=>pair.selectedForRelease);
const report={schemaVersion:2,baselineCommit:baseline.baselineCommit,
 policy:'Historical native-format diagnostics remain unchanged. Complete meaning is qualified through an explicit selected profile with independent native renders and complete-document readback; annotations remain distinct from intrinsic native concepts. Every example needs at least one suitable target, not every format.',
 summary:{examples:catalog.items.length,originalExamples:catalog.items.filter(item=>item.origin==='fixture').length,canaries:catalog.items.filter(item=>item.origin==='canary').length,baselineNativePairs:nativeLedger.pairs.length,profilePairs:profiles.length,selectedCompleteExamples:selected.length,selectedLossDiagnostics:selected.reduce((n,p)=>n+p.rawDiagnostics.filter(d=>d.loss).length,0),...verified},
 nativeLedger,profiles};
await mkdir('.cache',{recursive:true});await Bun.write('.cache/loss-ledger.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary));
