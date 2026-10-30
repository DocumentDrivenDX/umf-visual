import {join} from 'node:path';
import pin from '../spec/interchange/lini-runtime.json';
import {liniDirectory,verifyLiniRuntime} from './interchange-runtime';
for(const asset of pin.assets){
 const response=await fetch(asset.url,{redirect:'error'});
 if(!response.ok)throw Error('Pinned Lini download failed: '+response.status);
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')!==asset.sha256)throw Error('Pinned Lini asset changed: '+asset.name);
 await Bun.write(join(liniDirectory,asset.name),bytes);
}
console.log('Verified pinned Lini runtime '+(await verifyLiniRuntime()).version);
