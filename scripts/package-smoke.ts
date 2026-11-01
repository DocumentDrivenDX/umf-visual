import {cp,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
await mkdir('.cache',{recursive:true});
const metadata=await Bun.file('package.json').json();
// Isolate the declared distributable files from accumulated installed-consumer
// trees. This also makes accidental undeclared workspace files impossible to ship.
const staging=await mkdtemp(resolve('.cache/package-stage-'));
await cp('package.json',join(staging,'package.json'));
for(const file of metadata.files){
 if(typeof file!=='string'||file.startsWith('/')||file.split('/').includes('..'))throw Error('Unsafe package file');
 await cp(file,join(staging,file),{recursive:true});
}
const pack=Bun.spawn([process.execPath,'pm','pack','--destination',resolve('.cache')],{cwd:staging,stdout:'inherit',stderr:'inherit'});
if(await pack.exited)throw Error('Packing failed');
const archive=resolve('.cache/documentdrivendx-umf-visual-'+metadata.version+'.tgz');
const consumer=await mkdtemp(resolve('.cache/consumer-'));
await Bun.write(join(consumer,'package.json'),JSON.stringify({private:true,type:'module',dependencies:{'@documentdrivendx/umf-visual':'file:'+archive}}));
const install=Bun.spawn([process.execPath,'install','--ignore-scripts'],{cwd:consumer,stdout:'inherit',stderr:'inherit'});
if(await install.exited)throw Error('Packed consumer installation failed');
const mermaidSequence=JSON.parse(await Bun.file('fixtures/visual/inventory/helix-request.json').text());
const liniFlow=JSON.parse(await Bun.file('fixtures/catalog/canary-flow.json').text());
const liniMetric=JSON.parse(await Bun.file('fixtures/visual/forms/umf-ac-coverage.json').text());
const fullEntity=JSON.parse(await Bun.file('fixtures/catalog/canary-entities.json').text());
await Bun.write(join(consumer,'consumer.mjs'),`import {createVisualDocument,getVisual,editVisual,inspectVisual,importVisual,exportVisual,upgradeVisualDocument,latestVisualPackage} from '@documentdrivendx/umf-visual';
import legacySchema from '@documentdrivendx/umf-visual/schema' with {type:'json'};
import modernSchema from '@documentdrivendx/umf-visual/schema/1.1.0' with {type:'json'};
import {planMiroExport} from '@documentdrivendx/umf-visual/miro';
import {exportPowerPoint,importPowerPoint} from '@documentdrivendx/umf-visual/powerpoint';
import {observeGoogleSlides,planGoogleSlidesExport} from '@documentdrivendx/umf-visual/google-slides';
import {hostDigest,admitHostObservation} from '@documentdrivendx/umf-visual/reconciliation';
import {planEditableMiroExport} from '@documentdrivendx/umf-visual/miro/editable';
const doc=createVisualDocument({id:'consumer',kind:'flow',form:'network',question:'Does installation work?',nodes:[{id:'n',label:'Installed consumer'}]});
if(planMiroExport(doc).shapes.length!==2)throw Error('Installed Miro entrypoint failed');
const editable=await planEditableMiroExport(doc,'strict');if(editable.nodes.length!==1)throw Error('Installed editable Miro entrypoint failed');
const digest=await hostDigest(doc);if(!/^[0-9a-f]{64}$/.test(digest))throw Error('Installed reconciliation entrypoint failed');
const ppt=await exportPowerPoint(doc,{mode:'report'});const pptBack=await importPowerPoint(ppt.bytes,{binding:ppt.binding,expectedBindingRevision:ppt.binding.bindingRevision,mode:'report'});if(getVisual(pptBack.document).question!==getVisual(doc).question)throw Error('Installed PowerPoint round trip failed');
const snapshot={presentationId:'consumer-presentation',revisionId:'consumer-rev-1',pageSize:{width:{magnitude:720,unit:'PT'},height:{magnitude:405,unit:'PT'}},slides:[{objectId:'consumer-slide',pageElements:[]}]};
const observed=await observeGoogleSlides(snapshot);await admitHostObservation({resource:{host:'google-slides',documentId:'consumer-presentation'},revision:{kind:'host-revision',value:'consumer-rev-1'},captureDigestSha256:observed.captureDigestSha256,payload:snapshot});
const slides=await planGoogleSlidesExport(doc,observed,{question:{x:20,y:20,width:400,height:50},nodes:{n:{x:100,y:120,width:180,height:80}}},{namespace:'consumer'});if(slides.batch.writeControl.requiredRevisionId!=='consumer-rev-1')throw Error('Installed Google Slides entrypoint failed');
if(legacySchema.$id!=='urn:umf:visual:1.0.0'||modernSchema.$id!=='urn:umf:visual:1.1.0'||latestVisualPackage.version!=='1.1.0')throw Error('Versioned package assets failed');
if(!inspectVisual(upgradeVisualDocument(doc)).complete||doc.vocabularies['umf.visual'].version!=='1.0.0')throw Error('Installed upgrade failed');
const report=inspectVisual(doc);if(!report.valid||!report.complete)throw Error('Installed package rejected valid data');
for(const format of ['dot','mermaid','lini']){
 const output=exportVisual(doc,{format});if(!output.ok)throw Error('Installed export failed '+format);
 const input=importVisual(output.text,{format,id:'installed',question:'Does interchange work?',mode:'allow-reported-loss'});if(!input.ok)throw Error('Installed import failed '+format);
 const replay=exportVisual(input.document,{format,source:input.source,original:true});if(!replay.ok||replay.text!==output.text)throw Error('Installed native replay failed '+format);
}
const profileCases=[
 {format:'dot',profile:'umf.visual.dot.annotated/1',document:createVisualDocument({id:'installed-state',kind:'state',form:'machine',title:'Installed state',question:'What changes?',source:{path:'package:smoke'},nodes:[{id:'ready',label:'Ready'},{id:'done',label:'Done'}],state:{initial:'ready',final:['done'],transitions:[{id:'finish',from:'ready',to:'done',event:'finish',action:'record result'}]}})},
 {format:'lini',profile:'umf.visual.lini.annotated/1',document:JSON.parse(${JSON.stringify(JSON.stringify(liniMetric))})},
 {format:'mermaid',profile:'umf.visual.mermaid.annotated/1',document:JSON.parse(${JSON.stringify(JSON.stringify(mermaidSequence))})},
 {format:'lini',profile:'umf.visual.lini.annotated/1',document:JSON.parse(${JSON.stringify(JSON.stringify(liniFlow))})},
];
/** @param {unknown} value */
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const fullCases=['dot','mermaid','lini'].flatMap(format=>[
 JSON.parse(${JSON.stringify(JSON.stringify(liniFlow))}),
 JSON.parse(${JSON.stringify(JSON.stringify(fullEntity))}),
 JSON.parse(${JSON.stringify(JSON.stringify(liniMetric))}),
].map(document=>({format,profile:'umf.visual.'+format+'.full/1',document})));
for(const entry of fullCases){
 const output=exportVisual(entry.document,{format:entry.format,profile:entry.profile});if(!output.ok)throw Error('Installed full export failed '+JSON.stringify(output.diagnostics));
 const imported=importVisual(output.text,{format:entry.format,profile:entry.profile,id:'installed',question:'What survives?'});
 if(!imported.ok||canonical(imported.document)!==canonical(entry.document)||!imported.coverage?.length)throw Error('Installed full readback differs');
 const replay=exportVisual(imported.document,{format:entry.format,profile:entry.profile,source:imported.source,original:true});
 if(!replay.ok||replay.text!==output.text)throw Error('Installed full native replay differs');
}
for(const entry of profileCases){
 const output=exportVisual(entry.document,{format:entry.format,profile:entry.profile});if(!output.ok)throw Error('Installed strict profile export failed '+JSON.stringify(output.diagnostics));
 const imported=importVisual(output.text,{format:entry.format,profile:entry.profile,id:'context',question:'Context'});if(!imported.ok||canonical(imported.document)!==canonical(entry.document))throw Error('Installed complete profile readback differs');
 const pair=JSON.parse(JSON.stringify({document:imported.document,source:imported.source}));
 if(exportVisual(pair.document,{format:entry.format,profile:entry.profile,source:pair.source,original:true}).text!==output.text)throw Error('Installed profile source replay differs');
 pair.document=editVisual(pair.document,v=>({...v,question:'Stale edit'}));if(exportVisual(pair.document,{format:entry.format,profile:entry.profile,source:pair.source,original:true}).ok)throw Error('Installed stale profile replay accepted');
}
for(const entry of profileCases.filter(p=>p.format==='mermaid'||p.document.extensions['umf.visual'].kind==='flow')){
 const visual=entry.document.extensions['umf.visual'];
 if(!visual.title||!visual.question||(!visual.nodes?.length&&!visual.sequence?.participants?.length))throw Error('Annotated package metadata/source fixture is incomplete '+entry.profile);
}
let unknownProfileRefused=false;try{unknownProfileRefused=!exportVisual(profileCases[2].document,{format:'mermaid',profile:'umf.visual.mermaid.unknown/999'}).ok;}catch{unknownProfileRefused=true;}
if(!unknownProfileRefused)throw Error('Unknown packed-consumer profile was accepted');
console.log(JSON.stringify({installed:true,valid:report.valid,complete:report.complete,interchange:['dot','mermaid','lini'],portableAdapters:['powerpoint','google-slides','reconciliation','miro/editable'],fullProfileCases:fullCases.length,annotatedProfiles:profileCases.map(p=>p.profile),annotatedSources:['helix-request','catalog-canary-flow'],unknownProfileRefused:true}));`);
const types=Bun.spawn([resolve('node_modules/.bin/tsc'),'--ignoreConfig','--allowJs','--checkJs','--noEmit','--module','ESNext','--moduleResolution','Bundler','--target','ES2022','--skipLibCheck','consumer.mjs'],{cwd:consumer,stdout:'inherit',stderr:'inherit'});
if(await types.exited)throw Error('Installed consumer declarations failed');
for(const runtime of [process.execPath,'node']){
 const run=Bun.spawn([runtime,'consumer.mjs'],{cwd:consumer,stdout:'inherit',stderr:'inherit'});
 if(await run.exited)throw Error('Packed consumer failed: '+runtime);
}
