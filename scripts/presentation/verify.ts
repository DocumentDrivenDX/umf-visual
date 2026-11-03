// SPDX-License-Identifier: MIT OR Apache-2.0
/** Verify current compiler output, mandatory native checks and exact showcase assets. */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {compilePresentation,type PresentationBackend} from '../../src/presentation';
import {readVisualDocument,type Visual} from '../../src/extensions/visual';
import {chromium} from 'playwright';
import mermaidPackage from 'mermaid/package.json';
import {verifyPresentationQuality} from './quality';
import {mermaidSvg,safePresentationSeed,screenshotSvg} from './build';
import {renderPresentationLini} from './lini-runtime';
import {visualPayloadYaml} from './payload-source';
import {graphvizExecutionArgs} from './build';

const root=resolve(import.meta.dir,'../..');
const sha=(data:string|Uint8Array)=>createHash('sha256').update(data).digest('hex');
const relative=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9._/-]+$/.test(value)&&!value.startsWith('/')&&!value.split('/').includes('..');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function assertNativeVersionMatches(exampleId:string,backend:PresentationBackend,receiptVersion:string,actualVersion:string):void{
 if(receiptVersion!==actualVersion)throw Error(`${exampleId}/${backend} native version ${receiptVersion} does not match selected executable/runtime ${actualVersion}.`);
}
export function assertNativeSvgMatchesReceipt(exampleId:string,backend:PresentationBackend,svg:string,expectedSha256:string):void{
 const actual=sha(svg);if(actual!==expectedSha256)throw Error(`${exampleId}/${backend} native SVG replay hash ${actual} differs from receipt ${expectedSha256}.`);
}
export interface ShowcaseVerification {examples:number;qualified:number;unsupported:number;assets:number;nativeReplayed?:number;pngReplayed?:number;}
export type ArtifactReader=(path:string)=>Promise<Uint8Array>;

/** Explicit proof obligations; a renderer load or arbitrary passing check cannot replace them. */
export function requiredPresentationChecks(backend:PresentationBackend,visual:Visual):string[]{
 const checks=['native-source-hash','document-visual-present','native-svg-viewbox','presentation-svg-fit','presentation-clipping','presentation-font-legibility','presentation-text-overlap'];
 if(visual.layout?.kind==='circular')checks.push('presentation-circular-layout');
 if(backend==='graphviz')checks.push(...(visual.kind==='state'?['graphviz-native-ast','graphviz-state-transitions-and-markers']:visual.kind==='timeline'&&visual.form==='history'?['graphviz-native-ast','graphviz-timeline-events-and-axis']:['graphviz-native-ast','graphviz-native-carriers','graphviz-edge-endpoints-and-paths',visual.form==='entities'?'graphviz-entity-field-rows':'graphviz-containment-and-order']));
 else if(backend==='lini')checks.push(...(visual.kind==='comparison'&&visual.form==='quadrant'
  ?['lini-native-ast','lini-native-carriers','lini-quadrant-coordinate-ownership']
  :visual.kind==='metric'&&visual.form==='meter'
  ?['lini-meter-value-and-reference-geometry']
  :visual.kind==='metric'&&visual.form==='stat'
  ?['lini-native-ast','lini-native-carriers','lini-stat-events-and-date-scale']
  :visual.kind==='metric'&&visual.form==='bar'
  ?['lini-native-ast','lini-native-carriers','lini-category-bar-values-and-category-ownership']
  :visual.kind==='metric'&&visual.form==='line'
  ?['lini-native-ast','lini-trend-series-and-date-value-geometry']
  :visual.kind==='timeline'&&visual.form==='history'
  ?['lini-native-ast','lini-native-carriers','lini-connection-endpoints','lini-containment-and-order','lini-timeline-events-and-date-scale','lini-entity-field-rows']
  :visual.kind==='sequence'||visual.kind==='structure'&&visual.form==='tree'
  ?['lini-rich-native-semantics','lini-rich-svg-ownership-geometry','lini-rich-typography']
  :['lini-native-ast','lini-native-carriers','lini-connection-endpoints','lini-containment-and-order','lini-entity-field-rows']));
 else checks.push(...(visual.kind==='state'?['mermaid-state-transitions-and-markers']:visual.kind==='timeline'&&visual.form==='history'?['mermaid-timeline-event-ledger']:['mermaid-native-node-carriers',...(visual.form==='entities'?['mermaid-er-fields-and-relations']:[...(visual.kind==='flow'?['mermaid-flow-paths']:[]),'mermaid-containment-and-order'])]));
 if(backend!=='lini'&&visual.nodes?.some(node=>node.ports?.length))checks.push(backend==='graphviz'?'graphviz-node-port-rows':'mermaid-labeled-port-fallbacks');
 return checks.sort();
}

/** Receipt/asset admission. The CLI additionally replays the actual native SVG checks. */
export async function verifyShowcaseData(manifest:any,receipt:any,readArtifact:ArtifactReader,options:{assetDirectory?:string}={}):Promise<ShowcaseVerification>{
 const assetDirectory=options.assetDirectory??'showcase';
 if(!/^[a-z][a-z0-9-]*$/.test(assetDirectory)||assetDirectory==='dist-site')throw Error('Asset directory must be a safe lowercase namespace such as showcase or reviews.');
 if(manifest?.schemaVersion!==1||receipt?.schemaVersion!==1||!Array.isArray(manifest.examples)||!manifest.examples.length||!Array.isArray(receipt.examples))throw Error('Showcase manifests must use schemaVersion 1 and contain nonempty examples arrays.');
 const rendered=new Map<string,any>();for(const item of receipt.examples){if(!item||typeof item.id!=='string'||rendered.has(item.id))throw Error('Rendered showcase contains a malformed or duplicate example id.');rendered.set(item.id,item);}
 const expectedIds=new Set<string>();let qualified=0,unsupported=0,assets=0;
 for(const example of manifest.examples){
  if(!example||typeof example.id!=='string'||!/^[a-z0-9-]+$/.test(example.id)||expectedIds.has(example.id))throw Error('Source manifest contains a malformed or duplicate example id.');expectedIds.add(example.id);
  const output=rendered.get(example.id);if(!output)throw Error(`Rendered showcase is missing ${example.id}.`);
  for(const field of ['title','description','kind','form','definitionPath','definitionSha256'] as const)if(output[field]!==example[field])throw Error(`${example.id} rendered ${field} differs from its source manifest.`);
  if(!same(output.sources,example.sources)||!Array.isArray(example.sources)||!example.sources.length)throw Error(`${example.id} rendered source provenance differs from its source manifest.`);
  if(!same(output.publishedAssets,example.publishedAssets))throw Error(`${example.id} rendered published assets differ from its source manifest.`);
  if(!relative(example.definitionPath))throw Error(`${example.id} definition path is unsafe.`);
  const definitionBytes=await readArtifact(example.definitionPath);if(sha(definitionBytes)!==example.definitionSha256)throw Error(`${example.id} definition hash is stale.`);
  for(const source of example.sources){
   if(!relative(source.path))throw Error(`${example.id} source snapshot path is unsafe.`);
   const sourceBytes=await readArtifact(source.path);if(sha(sourceBytes)!==source.sha256||source.originPath&&source.originSha256!==sha(sourceBytes))throw Error(`${example.id} source snapshot hash is stale at ${source.path}.`);
  }
  for(const asset of example.publishedAssets??[]){
   if(!asset||!relative(asset.path)||!relative(asset.outputPath)||!asset.outputPath.startsWith(assetDirectory+'/')||typeof asset.sha256!=='string'||!/^[a-f0-9]{64}$/.test(asset.sha256))throw Error(`${example.id} published asset reference is malformed or unsafe.`);
   const sourceBytes=await readArtifact(asset.path),publishedBytes=await readArtifact(asset.outputPath);
   if(sha(sourceBytes)!==asset.sha256||sha(publishedBytes)!==asset.sha256)throw Error(`${example.id} published asset hash is stale at ${asset.path}.`);
  }
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(definitionBytes),document=readVisualDocument(raw,'json');
  if(!same(output.definition,JSON.parse(raw)))throw Error(`${example.id} rendered definition differs from its hashed definition artifact.`);
  if(output.visualPayloadYaml!==visualPayloadYaml(document))throw Error(`${example.id} visible YAML differs from its exact authored visual payload.`);
  const visual=document.extensions!['umf.visual'] as unknown as Visual;
  if(visual.kind!==example.kind||visual.form!==example.form||visual.id!==example.id)throw Error(`${example.id} classification differs from its definition.`);
  if(!Array.isArray(output.renders))throw Error(`${example.id} has no render rows.`);
  const rows=new Map<string,any>();for(const row of output.renders){if(!row||!['graphviz','mermaid','lini'].includes(row.backend)||rows.has(row.backend))throw Error(`${example.id} has a malformed or duplicate backend row.`);rows.set(row.backend,row);}
  for(const backend of ['graphviz','mermaid','lini'] as const){
   const row=rows.get(backend);if(!row)throw Error(`${example.id} is missing ${backend} render evidence.`);
   if(row.engine!==backend||typeof row.nativeVersion!=='string'||!row.nativeVersion.trim()||row.nativeVersion.includes('unknown'))throw Error(`${example.id}/${backend} has no exact native engine version.`);
   if(backend==='mermaid'&&(!row.nativeVersion.startsWith(`${mermaidPackage.version} / Chromium `)||!/^\d+\.\d+\.\d+\.\d+$/.test(row.nativeVersion.slice(`${mermaidPackage.version} / Chromium `.length))))throw Error(`${example.id}/mermaid native version does not match the pinned Mermaid bundle and a concrete Chromium version.`);
   const plan=compilePresentation(document,{backend,theme:'presentation/1'});
   if(row.status==='unsupported'){
    if(plan.ok||!same(row.diagnostics,plan.diagnostics)||row.nativeSourcePath||row.svgPath||row.pngPath||row.quality?.evidence?.length)throw Error(`${example.id}/${backend} is mislabeled unsupported.`);
    unsupported++;continue;
   }
   if(row.status!=='qualified'||!plan.ok)throw Error(`${example.id}/${backend} is not qualified by the current presentation compiler.`);
   if(!same(row.elementMap,plan.elementMap)||!same(row.omissions,plan.omissions)||!same(row.approximations,plan.approximations))throw Error(`${example.id}/${backend} has a stale presentation map or view inventory.`);
   if(!same(row.execution,plan.execution))throw Error(`${example.id}/${backend} execution metadata differs from the current typed compiler plan.`);
   if(sha(plan.source)!==row.nativeSourceSha256)throw Error(`${example.id}/${backend} source is not the current compiled presentation.`);
   const checks=row.quality?.evidence;
   if(!Array.isArray(checks)||checks.some((check:any)=>!check||check.result!=='pass'||check.sourceSha256!==row.nativeSourceSha256||typeof check.details!=='string'||!check.details.trim()))throw Error(`${example.id}/${backend} has incomplete or failing source-bound quality evidence.`);
   if(!same(checks.map((check:any)=>check.check).sort(),requiredPresentationChecks(backend,visual)))throw Error(`${example.id}/${backend} is missing required native quality checks or includes duplicate/unknown checks.`);
   if(row.width!==1600||row.height!==900)throw Error(`${example.id}/${backend} is not a 1600×900 presentation asset.`);
   for(const [assetPath,expectedHash,label] of [[row.nativeSourcePath,row.nativeSourceSha256,'native source'],[row.svgPath,row.svgSha256,'SVG'],[row.pngPath,row.pngSha256,'PNG']] as const){
    const prefix=`${assetDirectory}/${example.id}/${backend}/`;
    if(!relative(assetPath)||!assetPath.startsWith(prefix)||typeof expectedHash!=='string'||!/^[a-f0-9]{64}$/.test(expectedHash))throw Error(`${example.id}/${backend} has an unsafe or unhashed ${label} path.`);
    const bytes=Buffer.from(await readArtifact(assetPath));if(sha(bytes)!==expectedHash)throw Error(`${example.id}/${backend} ${label} hash mismatch.`);assets++;
    if(label==='native source'&&new TextDecoder('utf-8',{fatal:true}).decode(bytes)!==plan.source)throw Error(`${example.id}/${backend} native source bytes differ from the current compiler.`);
    if(label==='PNG'&&(bytes.length<24||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.readUInt32BE(16)!==row.width||bytes.readUInt32BE(20)!==row.height))throw Error(`${example.id}/${backend} PNG artifact or dimensions are malformed.`);
    if(label==='SVG'&&!bytes.toString('utf8').includes('<svg'))throw Error(`${example.id}/${backend} SVG artifact is malformed.`);
   }
   const suffix=backend==='graphviz'?'.dot':backend==='lini'?'.lini':'.mmd';if(!row.nativeSourcePath.endsWith(suffix))throw Error(`${example.id}/${backend} native source has the wrong extension.`);
   qualified++;
  }
  if(!['graphviz','mermaid','lini'].some(backend=>rows.get(backend)?.status==='qualified'))throw Error(`${example.id} has no qualified presentation backend.`);
 }
 if(rendered.size!==expectedIds.size||[...rendered.keys()].some(id=>!expectedIds.has(id)))throw Error('Rendered showcase has unexpected or missing examples.');
 return {examples:expectedIds.size,qualified,unsupported,assets};
}

export interface VerifyShowcaseOptions {manifestPath?:string;receiptPath?:string;assetDirectory?:string;}
export async function verifyShowcase(options:VerifyShowcaseOptions={}):Promise<ShowcaseVerification>{
 const manifestPath=options.manifestPath??'fixtures/showcase/showcase-sources.json',receiptPath=options.receiptPath??'dist-site/showcase.json',assetDirectory=options.assetDirectory??'showcase';
 if(!/^[a-z][a-z0-9-]*$/.test(assetDirectory)||assetDirectory==='dist-site')throw Error('Asset directory must be a safe lowercase namespace such as showcase or reviews.');
 const manifest=JSON.parse(await readFile(join(root,manifestPath),'utf8'));
 const receipt=JSON.parse(await readFile(join(root,receiptPath),'utf8'));
 const readArtifact:ArtifactReader=path=>readFile(join(root,path.startsWith(assetDirectory+'/')?'dist-site':'',path));
 const summary=await verifyShowcaseData(manifest,receipt,readArtifact,{assetDirectory});
 const browser=await chromium.launch({headless:true});let nativeReplayed=0,pngReplayed=0;
 try{
  const chromiumVersion=browser.version();
  for(const example of receipt.examples){
   const document=readVisualDocument(new TextDecoder().decode(await readArtifact(example.definitionPath)),'json');
   const visual=document.extensions!['umf.visual'] as unknown as Visual;
   for(const row of example.renders.filter((entry:any)=>entry.status==='qualified')){
    const plan=compilePresentation(document,{backend:row.backend,theme:'presentation/1'});
    if(!plan.ok)throw Error('Current compiler refused an admitted presentation.');
    let nativeAst:unknown;
    if(row.backend==='graphviz'){
     const versionInvocation=graphvizExecutionArgs(plan.execution,'json'),versionChild=Bun.spawn([versionInvocation.command,'-V'],{stdout:'pipe',stderr:'pipe'}),[versionOut,versionErr,versionExit]=await Promise.all([new Response(versionChild.stdout).text(),new Response(versionChild.stderr).text(),versionChild.exited]);
     if(versionExit!==0)throw Error(`${example.id}/graphviz version probe failed: ${versionErr||versionOut}`);
     const actualVersion=/graphviz version\s+([^\s(]+)/i.exec(versionOut+' '+versionErr)?.[1];if(!actualVersion)throw Error(`${example.id}/graphviz selected executable did not report a version.`);
     assertNativeVersionMatches(example.id,'graphviz',row.nativeVersion,actualVersion);
     const svgInvocation=graphvizExecutionArgs(plan.execution,'svg'),svgChild=Bun.spawn([svgInvocation.command,...svgInvocation.args],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
     svgChild.stdin.write(plan.source);svgChild.stdin.end();
     const [nativeSvg,svgError,svgExit]=await Promise.all([new Response(svgChild.stdout).text(),new Response(svgChild.stderr).text(),svgChild.exited]);
     if(svgExit!==0||svgError.trim())throw Error(`${example.id}/graphviz SVG replay failed: ${svgError||nativeSvg}`);
     assertNativeSvgMatchesReceipt(example.id,'graphviz',nativeSvg,row.svgSha256);
     const jsonInvocation=graphvizExecutionArgs(plan.execution,'json'),astChild=Bun.spawn([jsonInvocation.command,...jsonInvocation.args],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
     astChild.stdin.write(plan.source);astChild.stdin.end();
     const [output,error,code]=await Promise.all([new Response(astChild.stdout).text(),new Response(astChild.stderr).text(),astChild.exited]);
     if(code!==0||error.trim())throw Error(`Graphviz native AST replay failed: ${error||output}`);
     nativeAst=JSON.parse(output);
     nativeReplayed++;
    }else if(row.backend==='mermaid'){
     const page=await browser.newPage();
     try{
      const rendered=await mermaidSvg(page,plan.source,safePresentationSeed(example.id));
      assertNativeVersionMatches(example.id,'mermaid',row.nativeVersion,`${rendered.version} / Chromium ${chromiumVersion}`);
      if(rendered.version!==mermaidPackage.version)throw Error(`${example.id}/mermaid rendered bundle version ${rendered.version} differs from pinned package ${mermaidPackage.version}.`);
      assertNativeSvgMatchesReceipt(example.id,'mermaid',rendered.svg,row.svgSha256);
     }finally{await page.close();}
     nativeReplayed++;
    }else if(row.backend==='lini'){
     const rendered=await renderPresentationLini(plan.source);nativeAst=rendered.nativeAst;
     assertNativeVersionMatches(example.id,'lini',row.nativeVersion,rendered.version);
     assertNativeSvgMatchesReceipt(example.id,'lini',rendered.svg,row.svgSha256);
     nativeReplayed++;
    }
    const svg=new TextDecoder('utf-8',{fatal:true}).decode(await readArtifact(row.svgPath));
    const page=await browser.newPage();
    try{
     const checks=await verifyPresentationQuality(page,{svg,document,plan,nativeAst});
     if(!same(checks.map(check=>check.check).sort(),requiredPresentationChecks(row.backend,visual))||checks.some(check=>check.result!=='pass'||check.sourceSha256!==row.nativeSourceSha256))throw Error(`${example.id}/${row.backend} failed independent native SVG replay: ${checks.filter(check=>check.result!=='pass').map(check=>check.details).join('; ')}`);
    }finally{await page.close();}
    const pngPath=join(root,'.cache/presentation/replay',assetDirectory,example.id,row.backend+'.png');
    await screenshotSvg(browser,svg,pngPath);
    if(sha(await readFile(pngPath))!==row.pngSha256)throw Error(`${example.id}/${row.backend} PNG does not match the native SVG derivative.`);
    pngReplayed++;
   }
  }
 }finally{await browser.close();}
 return {...summary,nativeReplayed,pngReplayed};
}
if(import.meta.main)console.log(JSON.stringify(await verifyShowcase(),null,2));
