import {resolve} from 'node:path';
import {mkdir, unlink} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
const modules = process.env.UMF_PPTX_SPIKE_MODULES;
if (!modules) throw Error('Set UMF_PPTX_SPIKE_MODULES to the preinstalled experimental dependencies.');
const here = import.meta.dir, output = resolve(here, 'evidence/roundtrip');
await mkdir(output, {recursive: true});
const aliases: Record<string, string> = {};
for (const [name, version, file] of [['pptxgenjs', '4.0.1', 'dist/pptxgen.es.js'], ['jszip', '3.10.1', 'lib/index.js'], ['xml-js', '1.6.11', 'lib/index.js']]) {
  if ((await Bun.file(resolve(modules, name!, 'package.json')).json()).version !== version) throw Error('Version mismatch: ' + name);
  aliases[name!] = resolve(modules, name!, file!);
}
async function bundle(entry: string, target: 'bun' | 'browser') {
  const result = await Bun.build({entrypoints: [entry], target, format: 'esm', plugins: [{name: 'spike-dependencies', setup(build) {
    build.onResolve({filter: /^(pptxgenjs|jszip|xml-js)$/}, ({path}) => ({path: aliases[path]!}));
  }}]});
  if (!result.success) throw Error(result.logs.join('\n'));
  return result.outputs[0]!.text();
}
const localEntry = resolve(output, 'runner.bun.mjs');
await Bun.write(localEntry, await bundle(resolve(here, 'roundtrip-cases.ts'), 'bun'));
const cases = await import(pathToFileURL(localEntry).href);
try {
  if (process.argv[2] === 'export') {
    await Bun.write(resolve(output, 'baseline.pptx'), await cases.exportRoundTrip(cases.sourceDocument()));
    const result = await cases.controls();
    await Bun.write(resolve(output, 'controls.json'), JSON.stringify({bun: Bun.version, ...result}, null, 2) + '\n');
    console.log(JSON.stringify(result));
  } else if (process.argv[2] === 'import') {
    if (!process.argv[3]) throw Error('Provide a self-exported PPTX path');
    const bytes = new Uint8Array(await Bun.file(process.argv[3]).arrayBuffer());
    const imported = await cases.importRoundTrip(bytes);
    await Bun.write(resolve(output, 'latest-imported.umf.json'), JSON.stringify(imported.document, null, 2) + '\n');
    await Bun.write(resolve(output, 'latest-changes.json'), JSON.stringify(imported.changes, null, 2) + '\n');
    await Bun.write(resolve(output, 'latest-native.pptx'), imported.native);
    await Bun.write(resolve(output, 'latest-native-geometry.json'), JSON.stringify(imported.geometry, null, 2) + '\n');
    console.log(JSON.stringify({ok: true, changes: imported.changes, output: resolve(output, 'latest-imported.umf.json'), preservation: imported.preservation}, null, 2));
  } else if (process.argv[2] === 'verify') {
    const noop = new Uint8Array(await Bun.file(resolve(output, 'native-noop.pptx')).arrayBuffer());
    const edited = new Uint8Array(await Bun.file(resolve(output, 'native-edited.pptx')).arrayBuffer());
    const native = await cases.verifyNative(noop, edited);
    await Bun.write(resolve(output, 'imported.umf.json'), native.imported);
    await Bun.write(resolve(output, 'changes.json'), JSON.stringify(native.edited.changes, null, 2) + '\n');
    const browserEntry = resolve(output, 'browser-entry.ts');
    await Bun.write(browserEntry, `import {controls,verifyNative} from '../../roundtrip-cases.ts';\ntry { const load=async p=>new Uint8Array(await (await fetch(p)).arrayBuffer()); const native=await verifyNative(await load('/noop'),await load('/edited')); window.result={ok:true,controls:await controls(),checks:native.checks,imported:native.imported}; } catch(error) { window.result={ok:false,error:String(error)}; }`);
    const js = await bundle(browserEntry, 'browser');
    const server = Bun.serve({hostname: '127.0.0.1', port: 0, fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === '/app.js') return new Response(js, {headers: {'content-type': 'text/javascript'}});
      if (path === '/noop') return new Response(noop);
      if (path === '/edited') return new Response(edited);
      return new Response('<!doctype html><script type="module" src="/app.js"></script>', {headers: {'content-type': 'text/html'}});
    }});
    let browser;
    try {
      browser = await chromium.launch({headless: true});
      const page = await browser.newPage(), errors: string[] = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto(server.url.href);
      await page.waitForFunction(() => (window as any).result !== undefined, {}, {timeout: 30000});
      const result = await page.evaluate(() => (window as any).result);
      if (!result.ok || errors.length || result.imported !== native.imported) throw Error(JSON.stringify({result, errors}));
      const hash = async (file: string) => new Bun.CryptoHasher('sha256').update(await Bun.file(file).arrayBuffer()).digest('hex');
      const receipt = {bun: Bun.version, chromium: browser.version(), dependencies: {'pptxgenjs': '4.0.1', 'jszip': '3.10.1', 'xml-js': '1.6.11'},
        powerpoint: (await Bun.file(resolve(output, 'powerpoint-version.txt')).text()).trim(),
        sha256: {baseline: await hash(resolve(output, 'baseline.pptx')), nativeNoop: await hash(resolve(output, 'native-noop.pptx')), nativeEdited: await hash(resolve(output, 'native-edited.pptx')), imported: await hash(resolve(output, 'imported.umf.json'))},
        checks: native.checks, browser: result, errors};
      await Bun.write(resolve(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
      console.log(JSON.stringify(receipt, null, 2));
    } finally { await browser?.close(); await server.stop(true); await unlink(browserEntry); }
  } else throw Error('Choose export, import <file.pptx>, or verify');
} finally { await unlink(localEntry); }
