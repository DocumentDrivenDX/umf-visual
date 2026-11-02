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
import {screenshotSvg} from '../../scripts/presentation/build';
import {verifyShowcaseData} from '../../scripts/presentation/verify';

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
 const plan=compilePresentation(document,{backend:'graphviz',theme:'presentation/1'}),unsupported=compilePresentation(document,{backend:'mermaid',theme:'presentation/1'});
 if(!plan.ok||unsupported.ok)throw Error('Expected native Graphviz and explicit unsupported Mermaid E/R plans.');
 const [svgResult,astResult,version]=await Promise.all([native(['dot','-Tsvg'],plan.source),native(['dot','-Tjson'],plan.source),native(['dot','-V'])]);
 if(svgResult.err||astResult.err)throw Error('Graphviz emitted diagnostics.');
 browser=await chromium.launch({headless:true});const page=await browser.newPage();
 const checks=await verifyPresentationQuality(page,{svg:svgResult.out,document,plan,nativeAst:JSON.parse(astResult.out)});await page.close();
 if(checks.some(check=>check.result!=='pass'))throw Error(JSON.stringify(checks));
 const directory=await mkdtemp(join(tmpdir(),'umf-presentation-proof-')),pngPath=join(directory,'diagram.png');
 await screenshotSvg(browser,svgResult.out,pngPath);const png=await readFile(pngPath);
 const row={backend:'graphviz',engine:'graphviz',nativeVersion:/version\s+(\S+)/.exec(version.err+version.out)![1],nativeSourcePath:'showcase/proof-example/graphviz/source.dot',nativeSourceSha256:hash(plan.source),svgPath:'showcase/proof-example/graphviz/diagram.svg',svgSha256:hash(svgResult.out),pngPath:'showcase/proof-example/graphviz/diagram.png',pngSha256:hash(png),width:1600,height:900,elementMap:plan.elementMap,omissions:plan.omissions,approximations:plan.approximations,status:'qualified',quality:{evidence:checks}};
 assets=new Map([['fixtures/proof.json',definition],['fixtures/source.txt',snapshot],[row.nativeSourcePath,Buffer.from(plan.source)],[row.svgPath,Buffer.from(svgResult.out)],[row.pngPath,png]]);
 manifest={schemaVersion:1,examples:[example]};receipt={schemaVersion:1,examples:[{...example,definition:document,renders:[row,{backend:'mermaid',engine:'mermaid',nativeVersion:'12.2.0',status:'unsupported',diagnostics:unsupported.diagnostics,nativeSourcePath:'',svgPath:'',pngPath:'',quality:{evidence:[]}}]}]};
},30000);
afterAll(async()=>{await browser?.close();});

test('admits exact native-rendered assets and complete current proof obligations',async()=>{
 expect(await verifyShowcaseData(manifest,receipt,load)).toEqual({examples:1,qualified:1,unsupported:1,assets:3});
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
test('rejects a rehashed PNG whose dimensions disagree with its receipt',async()=>{
 const changed=copy(),row=changed.examples[0].renders[0],bytes=Buffer.from(assets.get(row.pngPath)!);bytes.writeUInt32BE(1,16);row.pngSha256=hash(bytes);
 await expect(verifyShowcaseData(manifest,changed,async path=>path===row.pngPath?bytes:load(path))).rejects.toThrow('dimensions are malformed');
});
