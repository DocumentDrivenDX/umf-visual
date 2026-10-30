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
await Bun.write(join(consumer,'consumer.mjs'),`import {createVisualDocument,inspectVisual,importVisual,exportVisual} from '@documentdrivendx/umf-visual';
const doc=createVisualDocument({id:'consumer',kind:'flow',form:'network',question:'Does installation work?',nodes:[{id:'n',label:'Installed consumer'}]});
const report=inspectVisual(doc);if(!report.valid||!report.complete)throw Error('Installed package rejected valid data');
for(const format of ['dot','mermaid','lini']){
 const output=exportVisual(doc,{format});if(!output.ok)throw Error('Installed export failed '+format);
 const input=importVisual(output.text,{format,id:'installed',question:'Does interchange work?',mode:'allow-reported-loss'});if(!input.ok)throw Error('Installed import failed '+format);
 const replay=exportVisual(input.document,{format,source:input.source,original:true});if(!replay.ok||replay.text!==output.text)throw Error('Installed native replay failed '+format);
}
console.log(JSON.stringify({installed:true,valid:report.valid,complete:report.complete,interchange:['dot','mermaid','lini']}));`);
const types=Bun.spawn([resolve('node_modules/.bin/tsc'),'--ignoreConfig','--allowJs','--checkJs','--noEmit','--module','ESNext','--moduleResolution','Bundler','--target','ES2022','--skipLibCheck','consumer.mjs'],{cwd:consumer,stdout:'inherit',stderr:'inherit'});
if(await types.exited)throw Error('Installed consumer declarations failed');
for(const runtime of [process.execPath,'node']){
 const run=Bun.spawn([runtime,'consumer.mjs'],{cwd:consumer,stdout:'inherit',stderr:'inherit'});
 if(await run.exited)throw Error('Packed consumer failed: '+runtime);
}
