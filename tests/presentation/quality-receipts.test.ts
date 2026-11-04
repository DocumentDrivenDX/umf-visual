// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import mermaidPackage from 'mermaid/package.json';
import {createVisualDocument,getVisual,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationBackend} from '../../src/presentation';
import {assertReplayedQualityMatches,requiredPresentationChecks,verifyShowcaseData} from '../../scripts/presentation/verify';

const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const png=()=>{const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.writeUInt32BE(1600,16);bytes.writeUInt32BE(900,20);return bytes;};
async function receiptFixture(document=createVisualDocument({id:'quality-receipt',kind:'flow',form:'network',question:'How does the record move?',nodes:[{id:'source',label:'Source'},{id:'target',label:'Target'}],edges:[{id:'route',from:'source',to:'target',label:'transfers'}]})){
 const visual=getVisual(document) as Visual;
 const definition=Buffer.from(JSON.stringify(document)),snapshot=Buffer.from('Source-bound fixture.\n'),artifacts=new Map<string,Uint8Array>();
 const example={id:visual.id,title:'Quality receipt',description:'Receipt admission fixture.',kind:visual.kind,form:visual.form,definitionPath:`fixtures/${visual.id}.json`,definitionSha256:hash(definition),sources:[{path:`fixtures/${visual.id}-source.txt`,sha256:hash(snapshot)}]};
 artifacts.set(example.definitionPath,definition);artifacts.set(example.sources[0]!.path,snapshot);
 const renders:any[]=[];
 for(const backend of ['graphviz','mermaid','lini'] as const satisfies readonly PresentationBackend[]){
  const plan=compilePresentation(document,{backend,theme:'presentation/1'});if(!plan.ok)throw Error(`${backend} fixture did not compile.`);
  const prefix=`showcase/${example.id}/${backend}`,sourcePath=`${prefix}/source.${backend==='graphviz'?'dot':backend==='mermaid'?'mmd':'lini'}`,svgPath=`${prefix}/diagram.svg`,pngPath=`${prefix}/diagram.png`;
  const source=Buffer.from(plan.source),svg=Buffer.from('<svg viewBox="0 0 10 10"></svg>'),image=png();
  artifacts.set(sourcePath,source);artifacts.set(svgPath,svg);artifacts.set(pngPath,image);
  const evidence=requiredPresentationChecks(backend,visual).map(check=>({check,sourceSha256:hash(source),result:'pass' as const,details:'Fixture evidence.'}));
  renders.push({backend,engine:backend,nativeVersion:backend==='mermaid'?`${mermaidPackage.version} / Chromium 1.2.3.4`:'fixture native 1.0',nativeSourcePath:sourcePath,nativeSourceSha256:hash(source),svgPath,svgSha256:hash(svg),pngPath,pngSha256:hash(image),width:1600,height:900,elementMap:plan.elementMap,omissions:plan.omissions,approximations:plan.approximations,...(plan.execution?{execution:plan.execution}:{}),status:'qualified',quality:{evidence,failedChecks:[]}});
 }
 const manifest={schemaVersion:1,examples:[example]},receipt:any={schemaVersion:1,examples:[{...example,definition:JSON.parse(definition.toString()),visualPayloadYaml:'id: quality-receipt\n',renders}]};
 // The exact payload serializer is part of receipt verification; keep fixture construction paired with it.
 const {visualPayloadYaml}=await import('../../scripts/presentation/payload-source');
 receipt.examples[0]!.visualPayloadYaml=visualPayloadYaml(document);
 return {manifest,receipt,artifacts,load:async(path:string)=>{const value=artifacts.get(path);if(!value)throw Error(`Missing test artifact ${path}`);return value;}};
}

test('accepts source-bound native execution receipts with a complete disclosed failure set',async()=>{
 const fixture=await receiptFixture(),row=fixture.receipt.examples[0]!.renders.find((item:any)=>item.backend==='mermaid')!;
 const failed=row.quality.evidence.find((check:any)=>check.check==='presentation-clipping')!;failed.result='fail';failed.details='A source label extends outside the native SVG viewport.';
 row.quality.failedChecks=['presentation-clipping'];row.status='unqualified';
 expect(await verifyShowcaseData(fixture.manifest,fixture.receipt,fixture.load)).toEqual({examples:1,qualified:2,unqualified:1,unsupported:0,assets:9});
});

test('rejects omitted or mismatched native failed-check receipts',async()=>{
 for(const failedChecks of [undefined,[],['presentation-font-legibility']]){
  const fixture=await receiptFixture(),row=fixture.receipt.examples[0]!.renders.find((item:any)=>item.backend==='mermaid')!;
  row.quality.evidence.find((check:any)=>check.check==='presentation-clipping')!.result='fail';row.status='unqualified';row.quality.failedChecks=failedChecks as string[];
  await expect(verifyShowcaseData(fixture.manifest,fixture.receipt,fixture.load)).rejects.toThrow('failed-check receipt');
 }
});

test('rejects qualified rows with failed checks and examples with no qualified backend',async()=>{
 const forged=await receiptFixture(),row=forged.receipt.examples[0]!.renders.find((item:any)=>item.backend==='mermaid')!;
 row.quality.evidence.find((check:any)=>check.check==='presentation-clipping')!.result='fail';row.quality.failedChecks=['presentation-clipping'];
 await expect(verifyShowcaseData(forged.manifest,forged.receipt,forged.load)).rejects.toThrow('claims qualification');

 const none=await receiptFixture();
 for(const render of none.receipt.examples[0]!.renders){const check=render.quality.evidence[0]!;check.result='fail';render.quality.failedChecks=[check.check];render.status='unqualified';}
 await expect(verifyShowcaseData(none.manifest,none.receipt,none.load)).rejects.toThrow('no qualified presentation backend');
});

test('rejects a Graphviz zoned artifact after its default direction policy evidence is removed',async()=>{
 const document=createVisualDocument({id:'synthetic-zoned-receipt',kind:'flow',form:'zoned',question:'Which tiers contain the components?',groups:[{id:'tier-one',label:'Tier one',role:'zone',tier:1},{id:'tier-two',label:'Tier two',role:'zone',tier:2}],nodes:[{id:'source',label:'Source',group:'tier-one'},{id:'target',label:'Target',group:'tier-two'}],edges:[{id:'handoff',from:'source',to:'target',label:'hands off'}]});
 const fixture=await receiptFixture(document),row=fixture.receipt.examples[0]!.renders.find((item:any)=>item.backend==='graphviz')!;
 expect(row.approximations).toContainEqual(expect.objectContaining({sourcePath:'/extensions/umf.visual/form',requested:'Default Graphviz direction TB for zoned groups'}));
 row.approximations=row.approximations.filter((item:any)=>item.sourcePath!=='/extensions/umf.visual/form');
 await expect(verifyShowcaseData(fixture.manifest,fixture.receipt,fixture.load)).rejects.toThrow('stale presentation map or view inventory');
});

test('rejects an incomplete required check inventory, a missing asset, and an execution failure',async()=>{
 const incomplete=await receiptFixture(),row=incomplete.receipt.examples[0]!.renders.find((item:any)=>item.backend==='graphviz')!;
 row.quality.evidence.pop();
 await expect(verifyShowcaseData(incomplete.manifest,incomplete.receipt,incomplete.load)).rejects.toThrow('required native quality checks');

 const missingAsset=await receiptFixture(),assetRow=missingAsset.receipt.examples[0]!.renders.find((item:any)=>item.backend==='graphviz')!;
 missingAsset.artifacts.delete(assetRow.svgPath);
 await expect(verifyShowcaseData(missingAsset.manifest,missingAsset.receipt,missingAsset.load)).rejects.toThrow('Missing test artifact');

 const failed=await receiptFixture(),failedRow=failed.receipt.examples[0]!.renders.find((item:any)=>item.backend==='graphviz')!;
 failedRow.status='failed';failedRow.error='Native renderer exited unsuccessfully.';
 await expect(verifyShowcaseData(failed.manifest,failed.receipt,failed.load)).rejects.toThrow('not a successful source-bound native execution');
});

test('native replay rejects a qualified row downgraded with a fabricated failure',async()=>{
 const fixture=await receiptFixture(),example=fixture.receipt.examples[0],row=example.renders.find((item:any)=>item.backend==='mermaid')!;
 row.status='unqualified';row.quality.failedChecks=['presentation-clipping'];
 expect(()=>assertReplayedQualityMatches({exampleId:example.id,backend:'mermaid',status:row.status,sourceSha256:row.nativeSourceSha256,failedChecks:row.quality.failedChecks,visual:getVisual(fixture.receipt.examples[0].definition) as Visual,replayed:row.quality.evidence})).toThrow('failed independent native SVG replay');
});
