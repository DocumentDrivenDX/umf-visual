import {cp,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const destination=resolve('dist-site');
await mkdir(destination,{recursive:true});
for(const file of ['index.html','styles.css','app.js'])await cp(new URL(`./${file}`,import.meta.url),resolve(destination,file));
console.log(`Copied the static umf.visuals microsite into ${destination}`);
