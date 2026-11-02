import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import pin from '../spec/interchange/lini-runtime.json';
import {liniDirectory,verifyLiniRuntime} from './interchange-runtime';
await mkdir('dist',{recursive:true});
const result=await Bun.build({entrypoints:['src/index.ts'],outdir:'dist',naming:'index.js',target:'browser',format:'esm',external:['@umf/core']});
if(!result.success)throw Error(result.logs.join('\n'));
for(const [entry,name]of [['miro','miro'],['miro/editable','miro-editable'],['powerpoint','powerpoint'],['google-slides','google-slides'],['reconciliation','reconciliation']]){
 const adapter=await Bun.build({entrypoints:['src/adapters/'+entry+'/index.ts'],outdir:'dist',naming:name+'.js',target:'browser',format:'esm',external:['@umf/core']});
 if(!adapter.success)throw Error(adapter.logs.join('\n'));
}
const presentation=await Bun.build({entrypoints:['src/presentation/index.ts'],outdir:'dist',naming:'presentation.js',target:'browser',format:'esm',external:['@umf/core']});
if(!presentation.success)throw Error(presentation.logs.join('\n'));
const lini=await Bun.build({entrypoints:['src/renderers/lini.ts'],outdir:'dist',naming:'lini.js',target:'browser',format:'esm',external:['@umf/core']});
if(!lini.success)throw Error(lini.logs.join('\n'));
await verifyLiniRuntime();
const liniAssetsDirectory='dist/lini-runtime';await mkdir(liniAssetsDirectory,{recursive:true});
for(const asset of pin.assets){
 const source=join(liniDirectory,asset.name),bytes=await readFile(source);
 const actual=new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
 if(actual!==asset.sha256)throw Error(`Pinned Lini asset failed integrity verification during package build: ${asset.name}`);
 await writeFile(join(liniAssetsDirectory,asset.name),bytes);
}
await copyFile('spec/interchange/lini-runtime.json',join(liniAssetsDirectory,'runtime-manifest.json'));
const licenses=await Bun.file('spec/interchange/lini-licenses/manifest.json').json();
await mkdir(join(liniAssetsDirectory,'licenses'),{recursive:true});
for(const license of licenses.files){
 if(!/^[a-z-]+\.txt$/.test(license.name))throw Error('Unsafe runtime license path');
 const bytes=await readFile(join('spec/interchange/lini-licenses',license.name));
 if(Bun.CryptoHasher.hash('sha256',bytes,'hex')!==license.sha256)throw Error('Pinned Lini license changed: '+license.name);
 await writeFile(join(liniAssetsDirectory,'licenses',license.name),bytes);
}
await copyFile('spec/interchange/lini-licenses/manifest.json',join(liniAssetsDirectory,'licenses/manifest.json'));
const types=Bun.spawn([process.execPath,'node_modules/typescript/bin/tsc','--noEmit','false','--declaration','--emitDeclarationOnly','--rootDir','src','--outDir','dist','--project','tsconfig.build.json'],{stdout:'inherit',stderr:'inherit'});
if(await types.exited)throw Error('Declaration build failed');
console.log('Built browser-compatible ESM, declarations, and integrity-pinned Lini 1.1.0 browser assets; @umf/core stays external.');
