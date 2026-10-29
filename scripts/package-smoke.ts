import {mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
await mkdir('.cache',{recursive:true});
const pack=Bun.spawn([process.execPath,'pm','pack','--destination','.cache'],{stdout:'inherit',stderr:'inherit'});
if(await pack.exited)throw Error('Packing failed');
const archive=resolve('.cache/documentdrivendx-umf-visual-0.1.0.tgz');
const consumer=await mkdtemp(resolve('.cache/consumer-'));
await Bun.write(join(consumer,'package.json'),JSON.stringify({private:true,type:'module',dependencies:{'@documentdrivendx/umf-visual':'file:'+archive}}));
const install=Bun.spawn([process.execPath,'install','--ignore-scripts'],{cwd:consumer,stdout:'inherit',stderr:'inherit'});
if(await install.exited)throw Error('Packed consumer installation failed');
await Bun.write(join(consumer,'consumer.mjs'),`import {createVisualDocument,inspectVisual} from '@documentdrivendx/umf-visual';
const doc=createVisualDocument({id:'consumer',kind:'flow',form:'network',question:'Does installation work?',nodes:[{id:'n',label:'Installed consumer'}]});
const report=inspectVisual(doc);if(!report.valid||!report.complete)throw Error('Installed package rejected valid data');console.log(JSON.stringify({installed:true,valid:report.valid,complete:report.complete}));`);
const types=Bun.spawn([resolve('node_modules/.bin/tsc'),'--ignoreConfig','--allowJs','--checkJs','--noEmit','--module','ESNext','--moduleResolution','Bundler','--target','ES2022','--skipLibCheck','consumer.mjs'],{cwd:consumer,stdout:'inherit',stderr:'inherit'});
if(await types.exited)throw Error('Installed consumer declarations failed');
for(const runtime of [process.execPath,'node']){
 const run=Bun.spawn([runtime,'consumer.mjs'],{cwd:consumer,stdout:'inherit',stderr:'inherit'});
 if(await run.exited)throw Error('Packed consumer failed: '+runtime);
}
