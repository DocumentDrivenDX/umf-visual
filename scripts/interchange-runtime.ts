import {join} from 'node:path';
import pin from '../spec/interchange/lini-runtime.json';
export const liniDirectory=process.env.LINI_RUNTIME_DIR??'.cache/lini';
export async function verifyLiniRuntime(directory=liniDirectory){
 for(const asset of pin.assets){
  const file=Bun.file(join(directory,asset.name));
  if(!await file.exists())throw Error('Missing pinned Lini runtime; run bun run fetch:lini');
  if(new Bun.CryptoHasher('sha256').update(await file.bytes()).digest('hex')!==asset.sha256)throw Error('Lini runtime integrity mismatch: '+asset.name);
 }
 return pin;
}
