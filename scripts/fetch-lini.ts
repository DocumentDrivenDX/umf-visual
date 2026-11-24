import {join} from 'node:path';
import pin from '../spec/interchange/lini-runtime.json';
import {liniDirectory, verifyLiniRuntime} from './interchange-runtime';

// The upstream site replaces its live WASM. This released package carries the
// original Lini 1.1.0 bytes without changing the renderer's per-file pins.
const runtimeArchive = {
  url: 'https://github.com/DocumentDrivenDX/umf-visual/releases/download/v0.6.0/documentdrivendx-umf-visual-0.6.0.tgz',
  sha256: 'ac9b4e04ceacc491e3dd66136a8a42626adc53955aaa22373c22140af6389ec0',
  prefix: 'package/dist/lini-runtime/',
};

const sha256 = (bytes: Uint8Array) => Bun.CryptoHasher.hash('sha256', bytes, 'hex');

if (!await verifyLiniRuntime().then(() => true, () => false)) {
  const response = await fetch(runtimeArchive.url);
  if (!response.ok) throw Error('Pinned Lini archive download failed: ' + response.status);
  const archiveBytes = await response.bytes();
  if (sha256(archiveBytes) !== runtimeArchive.sha256) throw Error('Pinned Lini archive changed');
  const files = await new Bun.Archive(archiveBytes).files(runtimeArchive.prefix + '*');
  const assets = await Promise.all(pin.assets.map(async asset => {
    const file = files.get(runtimeArchive.prefix + asset.name);
    if (!file) throw Error('Pinned Lini archive is missing ' + asset.name);
    const bytes = await file.bytes();
    if (sha256(bytes) !== asset.sha256) throw Error('Pinned Lini asset changed: ' + asset.name);
    return {name: asset.name, bytes};
  }));
  for (const {name, bytes} of assets) await Bun.write(join(liniDirectory, name), bytes);
}
console.log('Verified pinned Lini runtime ' + (await verifyLiniRuntime()).version);
