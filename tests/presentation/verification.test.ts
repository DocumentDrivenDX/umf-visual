// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium,type Browser} from 'playwright';
import {createVisualDocument} from '../../src';
import {compilePresentation} from '../../src/presentation';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';
import {mermaidSvg,screenshotSvg} from '../../scripts/presentation/build';
import {verifyShowcaseData} from '../../scripts/presentation/verify';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';

const hash=(data:string|Uint8Array)=>createHash('sha256').update(data).digest('hex');
let manifest:any,receipt:any,assets:Map<string,Uint8Array>,browser:Browser;
const load=async(path:string)=>{const bytes=assets.get(path);if(!bytes)throw Error('Missing test artifact '+path);return bytes;};
const copy=()=>structuredClone(receipt);
async function native(args:string[],input?:string){
 const child=Bun.spawn(args,{stdin:input===undefined?'ignore':'pipe',stdout:'pipe',stderr:'pipe'});
 if(input!==undefined){child.stdin!.write(input);child.stdin!.end();}
 const [out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 if(code!==0)throw Error(err);return {out,err};
}

beforeAll(async()=>{
 const document=createVisualDocument({id:'proof-example',kind:'structure',form:'entities',title:'Proof example',question:'What is associated?',nodes:[{id:'a',label:'Alpha'},{id:'b',label:'Beta'}],structure:{entities:[{node:'a',fields:[{name:'id',type:'uuid'}]},{node:'b',fields:[{name:'alpha_id',type:'uuid'}]}],references:[{id:'ref',from:{node:'a',field:'id'},to:{node:'b',field:'alpha_id'},label:'association',fromCardinality:'exactly-one',toCardinality:'zero-or-many'}]}});
 const definition=Buffer.from(JSON.stringify(document,null,2)+'\n'),snapshot=Buffer.from('Synthetic verifier fixture: Alpha.id is associated with Beta.alpha_id.\n');
 const example={id:'proof-example',title:'Proof example',description:'Native verifier integration fixture.',kind:'structure',form:'entities',definitionPath:'fixtures/proof.json',definitionSha256:hash(definition),sources:[{path:'fixtures/source.txt',sha256:hash(snapshot),originPath:'source.txt',originSha256:hash(snapshot)}]};
 const plan=compilePresentation(document,{backend:'graphviz',theme:'presentation/1'}),mermaidPlan=compilePresentation(document,{backend:'mermaid',theme:'presentation/1'});
 if(!plan.ok||!mermaidPlan.ok)throw Error('Expected native Graphviz and Mermaid E/R plans.');
 const [svgResult,astResult,version]=await Promise.all([native(['dot','-Tsvg'],plan.source),native(['dot','-Tjson'],plan.source),native(['dot','-V'])]);
 if(svgResult.err||astResult.err)throw Error('Graphviz emitted diagnostics.');
 browser=await chromium.launch({headless:true});const page=await browser.newPage();
 const checks=await verifyPresentationQuality(page,{svg:svgResult.out,document,plan,nativeAst:JSON.parse(astResult.out)});await page.close();
 if(checks.some(check=>check.result!=='pass'))throw Error(JSON.stringify(checks));
 const directory=await mkdtemp(join(tmpdir(),'umf-presentation-proof-')),pngPath=join(directory,'diagram.png');
 await screenshotSvg(browser,svgResult.out,pngPath);const png=await readFile(pngPath);
 const row={backend:'graphviz',engine:'graphviz',nativeVersion:/version\s+(\S+)/.exec(version.err+version.out)![1],nativeSourcePath:'showcase/proof-example/graphviz/source.dot',nativeSourceSha256:hash(plan.source),svgPath:'showcase/proof-example/graphviz/diagram.svg',svgSha256:hash(svgResult.out),pngPath:'showcase/proof-example/graphviz/diagram.png',pngSha256:hash(png),width:1600,height:900,elementMap:plan.elementMap,omissions:plan.omissions,approximations:plan.approximations,status:'qualified',quality:{evidence:checks,failedChecks:[]}};
 assets=new Map([['fixtures/proof.json',definition],['fixtures/source.txt',snapshot],[row.nativeSourcePath,Buffer.from(plan.source)],[row.svgPath,Buffer.from(svgResult.out)],[row.pngPath,png]]);
 const mermaidPage=await browser.newPage(),mermaid=await mermaidSvg(mermaidPage,mermaidPlan.source,'proof-example');
 const mermaidChecks=await verifyPresentationQuality(mermaidPage,{svg:mermaid.svg,document,plan:mermaidPlan});await mermaidPage.close();
 if(mermaidChecks.some(check=>check.result!=='pass'))throw Error(JSON.stringify(mermaidChecks));
 const mermaidPngPath=join(directory,'mermaid.png');await screenshotSvg(browser,mermaid.svg,mermaidPngPath);const mermaidPng=await readFile(mermaidPngPath);
 const mermaidRow={...row,backend:'mermaid',engine:'mermaid',nativeVersion:`${mermaid.version} / Chromium ${browser.version()}`,nativeSourcePath:'showcase/proof-example/mermaid/source.mmd',nativeSourceSha256:hash(mermaidPlan.source),svgPath:'showcase/proof-example/mermaid/diagram.svg',svgSha256:hash(mermaid.svg),pngPath:'showcase/proof-example/mermaid/diagram.png',pngSha256:hash(mermaidPng),elementMap:mermaidPlan.elementMap,omissions:mermaidPlan.omissions,approximations:mermaidPlan.approximations,quality:{evidence:mermaidChecks,failedChecks:[]}};
 assets.set(mermaidRow.nativeSourcePath,Buffer.from(mermaidPlan.source));assets.set(mermaidRow.svgPath,Buffer.from(mermaid.svg));assets.set(mermaidRow.pngPath,mermaidPng);
 const liniPlan=compilePresentation(document,{backend:'lini'});if(!liniPlan.ok)throw Error('Expected native Lini E/R plan');
 const lini=await renderPresentationLini(liniPlan.source),liniPage=await browser.newPage();
 const liniChecks=await verifyPresentationQuality(liniPage,{svg:lini.svg,document,plan:liniPlan,nativeAst:lini.nativeAst});await liniPage.close();
 if(liniChecks.some(check=>check.result!=='pass'))throw Error(JSON.stringify(liniChecks));
 const liniPng=join(directory,'lini.png');await screenshotSvg(browser,lini.svg,liniPng);const pngBytes=await readFile(liniPng);
 const liniRow={...row,backend:'lini',engine:'lini',nativeVersion:lini.version,nativeSourcePath:'showcase/proof-example/lini/source.lini',nativeSourceSha256:hash(liniPlan.source),svgPath:'showcase/proof-example/lini/diagram.svg',svgSha256:hash(lini.svg),pngPath:'showcase/proof-example/lini/diagram.png',pngSha256:hash(pngBytes),elementMap:liniPlan.elementMap,omissions:liniPlan.omissions,approximations:liniPlan.approximations,quality:{evidence:liniChecks,failedChecks:[]}};
 assets.set(liniRow.nativeSourcePath,Buffer.from(liniPlan.source));assets.set(liniRow.svgPath,Buffer.from(lini.svg));assets.set(liniRow.pngPath,pngBytes);
 manifest={schemaVersion:1,examples:[example]};receipt={schemaVersion:1,examples:[{...example,definition:document,visualPayloadYaml:visualPayloadYaml(document),renders:[row,mermaidRow,liniRow]}]};
},30000);
afterAll(async()=>{await browser?.close();});

test('admits exact native-rendered assets and complete current proof obligations',async()=>{
 expect(await verifyShowcaseData(manifest,receipt,load)).toEqual({examples:1,qualified:3,unqualified:0,unsupported:0,assets:9});
});
test('rejects a forged Mermaid bundle version for a qualified render',async()=>{
 const changed=copy();changed.examples[0].renders.find((row:any)=>row.backend==='mermaid').nativeVersion=`0.0.0 / Chromium ${browser.version()}`;
 await expect(verifyShowcaseData(manifest,changed,load)).rejects.toThrow('pinned Mermaid bundle');
});
test('rejects fake, missing and duplicate native quality checks',async()=>{
 for(const mutation of ['fake','missing','duplicate']){
  const changed=copy(),row=changed.examples[0].renders[0];
  if(mutation==='fake')row.quality.evidence=[{check:'looks-good',result:'pass',sourceSha256:row.nativeSourceSha256,details:'A claim without native proof.'}];
  if(mutation==='missing')row.quality.evidence.pop();
  if(mutation==='duplicate')row.quality.evidence.push(row.quality.evidence[0]);
  await expect(verifyShowcaseData(manifest,changed,load)).rejects.toThrow('required native quality checks');
 }
});
test('rejects missing or changed visible YAML even when the definition is unchanged',async()=>{
 for(const yaml of [undefined,'id: unrelated\n']){
  const changed=copy();changed.examples[0].visualPayloadYaml=yaml;
  await expect(verifyShowcaseData(manifest,changed,load)).rejects.toThrow('visible YAML');
 }
});
test('rejects stale native source even when its artifact and all check hashes are updated',async()=>{
 const changed=copy(),row=changed.examples[0].renders[0],forged=Buffer.from(new TextDecoder().decode(assets.get(row.nativeSourcePath)!).replace('Alpha','Unrelated'));
 row.nativeSourceSha256=hash(forged);row.quality.evidence.forEach((check:any)=>check.sourceSha256=row.nativeSourceSha256);
 await expect(verifyShowcaseData(manifest,changed,async path=>path===row.nativeSourcePath?forged:load(path))).rejects.toThrow('current compiled presentation');
});
test('rejects stale element maps and view omissions',async()=>{
 for(const key of ['elementMap','omissions','approximations']){
  const changed=copy();changed.examples[0].renders[0][key]=[{sourcePath:'/wrong',reason:'forged'}];
  await expect(verifyShowcaseData(manifest,changed,load)).rejects.toThrow('stale presentation map or view inventory');
 }
});
test('rejects unsupported labels that disagree with the current compiler',async()=>{
 const changed=copy(),row=changed.examples[0].renders[0];Object.assign(row,{status:'unsupported',diagnostics:[{code:'NOT_IMPLEMENTED'}],nativeSourcePath:'',svgPath:'',pngPath:'',quality:{evidence:[]}});
 await expect(verifyShowcaseData(manifest,changed,load)).rejects.toThrow('mislabeled unsupported');
});
test('admits native execution with failed required checks only as an explicitly unqualified row',async()=>{
 const changed=copy(),row=changed.examples[0].renders.find((item:any)=>item.backend==='mermaid');
 const failed=row.quality.evidence.find((check:any)=>check.check==='presentation-clipping');
 failed.result='fail';failed.details='A source label is clipped in this native SVG.';
 row.quality.failedChecks=['presentation-clipping'];row.status='unqualified';row.error='One or more source-bound native presentation checks did not pass.';
 expect(await verifyShowcaseData(manifest,changed,load)).toEqual({examples:1,qualified:2,unqualified:1,unsupported:0,assets:9});
});
test('rejects unqualified evidence with an omitted or mismatched failed-check set',async()=>{
 for(const failures of [undefined,[],['presentation-font-legibility']]){
  const changed=copy(),row=changed.examples[0].renders.find((item:any)=>item.backend==='mermaid');
  const failed=row.quality.evidence.find((check:any)=>check.check==='presentation-clipping');
  failed.result='fail';failed.details='A source label is clipped in this native SVG.';row.status='unqualified';
  row.quality.failedChecks=failures;
  await expect(verifyShowcaseData(manifest,changed,load)).rejects.toThrow('failed-check receipt');
 }
});
test('rejects a qualified label when any required native check failed',async()=>{
 const changed=copy(),row=changed.examples[0].renders.find((item:any)=>item.backend==='mermaid');
 row.quality.evidence.find((check:any)=>check.check==='presentation-clipping').result='fail';
 row.quality.failedChecks=['presentation-clipping'];
 await expect(verifyShowcaseData(manifest,changed,load)).rejects.toThrow('claims qualification');
});
test('rejects a showcase with no qualified presentation backend',async()=>{
 const changed=copy();
 for(const row of changed.examples[0].renders){const check=row.quality.evidence[0];check.result='fail';row.quality.failedChecks=[check.check];row.status='unqualified';}
 await expect(verifyShowcaseData(manifest,changed,load)).rejects.toThrow('no qualified presentation backend');
});
test('rejects a rehashed PNG whose dimensions disagree with its receipt',async()=>{
 const changed=copy(),row=changed.examples[0].renders[0],bytes=Buffer.from(assets.get(row.pngPath)!);bytes.writeUInt32BE(1,16);row.pngSha256=hash(bytes);
 await expect(verifyShowcaseData(manifest,changed,async path=>path===row.pngPath?bytes:load(path))).rejects.toThrow('dimensions are malformed');
});
