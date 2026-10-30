// Host-side evidence runner. Reads preinstalled experimental dependencies only.
import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir, unlink} from 'node:fs/promises';
const runtime = process.env.UMF_PPTX_SPIKE_MODULES;
if (!runtime) throw Error('Set UMF_PPTX_SPIKE_MODULES to an existing node_modules with pptxgenjs 4.0.1 and jszip 3.10.1.');
const here = import.meta.dir;
const output = resolve(here, 'evidence');
await mkdir(output, {recursive: true});
for (const [name, version] of [['pptxgenjs', '4.0.1'], ['jszip', '3.10.1']]) {
  const manifest = await Bun.file(resolve(runtime, name!, 'package.json')).json();
  if (manifest.version !== version) throw Error(name + ' version mismatch');
}
const aliases = {
  pptxgenjs: resolve(runtime, 'pptxgenjs/dist/pptxgen.es.js'),
  jszip: resolve(runtime, 'jszip/lib/index.js'),
};
const bundle = async (entry: string, target: 'bun' | 'browser') => {
  const result = await Bun.build({entrypoints: [entry], target, format: 'esm', plugins: [{name: 'spike-dependencies', setup(build) { build.onResolve({filter: /^(pptxgenjs|jszip)$/}, ({path}) => ({path: aliases[path as keyof typeof aliases]})); }}]});
  if (!result.success) throw Error(result.logs.join('\n'));
  return result.outputs[0]!.text();
};
const bunEntry = resolve(output, 'probe.bun.mjs');
await Bun.write(bunEntry, await bundle(resolve(here, 'probe.ts'), 'bun'));
const {probe} = await import(pathToFileURL(bunEntry).href);
const result = await probe();
await Bun.write(resolve(output, 'probe.pptx'), result.bytes);
await Bun.write(resolve(output, 'source.umf.json'), result.source);
await Bun.write(resolve(output, 'identity-map.json'), JSON.stringify(result.identityMap, null, 2) + '\n');
const browserEntry = resolve(output, 'browser-entry.ts');
await Bun.write(browserEntry, `import {probe} from '../probe.ts';\ntry { window.result = (await probe()).receipt; } catch(error) { window.result = {ok:false,error:String(error)}; }`);
const browserJs = await bundle(browserEntry, 'browser');
const server = Bun.serve({hostname: '127.0.0.1', port: 0, fetch(req) {
  return new URL(req.url).pathname === '/app.js'
    ? new Response(browserJs, {headers: {'content-type': 'text/javascript'}})
    : new Response('<!doctype html><script type="module" src="/app.js"></script>', {headers: {'content-type': 'text/html'}});
}});
let browser;
try {
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(server.url.href);
  await page.waitForFunction(() => (window as any).result !== undefined);
  const browserResult = await page.evaluate(() => (window as any).result);
  if (!browserResult.ok || errors.length) throw Error(JSON.stringify({browserResult, errors}));
  if (JSON.stringify(browserResult) !== JSON.stringify(result.receipt)) throw Error('Bun/browser result mismatch');
  const receipt = {bun: Bun.version, chromium: browser.version(), writerSha256: new Bun.CryptoHasher('sha256').update(await Bun.file(aliases.pptxgenjs).arrayBuffer()).digest('hex'), bunResult: result.receipt, browserResult, errors};
  await Bun.write(resolve(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser?.close(); await server.stop(true);
  await unlink(bunEntry); await unlink(browserEntry);
}
