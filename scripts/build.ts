import {mkdir} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
const result=await Bun.build({entrypoints:['src/index.ts'],outdir:'dist',naming:'index.js',target:'browser',format:'esm',external:['@umf/core']});
if(!result.success)throw Error(result.logs.join('\n'));
const miro=await Bun.build({entrypoints:['src/adapters/miro/index.ts'],outdir:'dist',naming:'miro.js',target:'browser',format:'esm',external:['@umf/core']});
if(!miro.success)throw Error(miro.logs.join('\n'));
const types=Bun.spawn([process.execPath,'node_modules/typescript/bin/tsc','--noEmit','false','--declaration','--emitDeclarationOnly','--rootDir','src','--outDir','dist','--project','tsconfig.build.json'],{stdout:'inherit',stderr:'inherit'});
if(await types.exited)throw Error('Declaration build failed');
console.log('Built browser-compatible ESM and declarations; @umf/core stays external.');
