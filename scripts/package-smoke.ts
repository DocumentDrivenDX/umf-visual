import {mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
await mkdir('.cache',{recursive:true});
const pack=Bun.spawn([process.execPath,'pm','pack','--destination','.cache'],{stdout:'inherit',stderr:'inherit'});
if(await pack.exited)throw Error('Packing failed');
const metadata=await Bun.file('package.json').json();
const archive=resolve('.cache/documentdrivendx-umf-visual-'+metadata.version+'.tgz');
const consumer=await mkdtemp(resolve('.cache/consumer-'));
await Bun.write(join(consumer,'package.json'),JSON.stringify({private:true,type:'module',dependencies:{'@documentdrivendx/umf-visual':'file:'+archive}}));
const install=Bun.spawn([process.execPath,'install','--ignore-scripts'],{cwd:consumer,stdout:'inherit',stderr:'inherit'});
if(await install.exited)throw Error('Packed consumer installation failed');
await Bun.write(join(consumer,'consumer.mjs'),`import {createVisualDocument,inspectVisual,importVisual,exportVisual,upgradeVisualDocument,latestVisualPackage} from '@documentdrivendx/umf-visual';
import legacySchema from '@documentdrivendx/umf-visual/schema' with {type:'json'};
import modernSchema from '@documentdrivendx/umf-visual/schema/1.1.0' with {type:'json'};
import {planMiroExport} from '@documentdrivendx/umf-visual/miro';
const doc=createVisualDocument({id:'consumer',kind:'flow',form:'network',question:'Does installation work?',nodes:[{id:'n',label:'Installed consumer'}]});
if(planMiroExport(doc).shapes.length!==2)throw Error('Installed Miro entrypoint failed');
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
 {format:'lini',profile:'umf.visual.lini.annotated/1',document:createVisualDocument({id:'installed-metric',kind:'metric',form:'meter',title:'Installed meter',question:'How many?',source:{path:'package:smoke'},metric:{unit:'requests',good:'up',format:{kind:'number',decimals:0},target:10,series:[{id:'requests',label:'Requests',points:[{value:4}]}]}})},
];
/** @param {unknown} value */
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
for(const entry of profileCases){
 const output=exportVisual(entry.document,{format:entry.format,profile:entry.profile});if(!output.ok)throw Error('Installed strict profile export failed '+JSON.stringify(output.diagnostics));
 const imported=importVisual(output.text,{format:entry.format,profile:entry.profile,id:'context',question:'Context'});if(!imported.ok||canonical(imported.document)!==canonical(entry.document))throw Error('Installed complete profile readback differs');
 const pair=JSON.parse(JSON.stringify({document:imported.document,source:imported.source}));
 if(exportVisual(pair.document,{format:entry.format,profile:entry.profile,source:pair.source,original:true}).text!==output.text)throw Error('Installed profile source replay differs');
 pair.document.extensions['umf.visual'].question='Stale edit';if(exportVisual(pair.document,{format:entry.format,profile:entry.profile,source:pair.source,original:true}).ok)throw Error('Installed stale profile replay accepted');
}
console.log(JSON.stringify({installed:true,valid:report.valid,complete:report.complete,interchange:['dot','mermaid','lini'],annotatedProfiles:profileCases.map(p=>p.profile)}));`);
const types=Bun.spawn([resolve('node_modules/.bin/tsc'),'--ignoreConfig','--allowJs','--checkJs','--noEmit','--module','ESNext','--moduleResolution','Bundler','--target','ES2022','--skipLibCheck','consumer.mjs'],{cwd:consumer,stdout:'inherit',stderr:'inherit'});
if(await types.exited)throw Error('Installed consumer declarations failed');
for(const runtime of [process.execPath,'node']){
 const run=Bun.spawn([runtime,'consumer.mjs'],{cwd:consumer,stdout:'inherit',stderr:'inherit'});
 if(await run.exited)throw Error('Packed consumer failed: '+runtime);
}
