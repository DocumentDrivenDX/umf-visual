import {join} from 'node:path';
import {chromium, type Page} from 'playwright';

const assetRoot = 'node_modules/@excalidraw/excalidraw/dist/prod';

/** Run a local, network-isolated instance of the pinned editor's public API. */
export async function withHeadlessExcalidraw<T>(run: (page: Page, browserVersion: string) => Promise<T>): Promise<T> {
  const built = await Bun.build({entrypoints: ['examples/excalidraw/editor.ts'], target: 'browser',
    format: 'esm', define: {'process.env.NODE_ENV': '"production"'}});
  if (!built.success) throw Error(built.logs.join('\n'));
  const script = await built.outputs[0]!.text();
  const server = Bun.serve({hostname: '127.0.0.1', port: 0, async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/') return new Response(
      '<!doctype html><title>Excalidraw headless</title><link rel="stylesheet" href="/index.css">' +
      '<div id="root" style="height:100vh"></div><script type="module" src="/editor.js"></script>',
      {headers: {'content-type': 'text/html'}});
    if (path === '/editor.js') return new Response(script, {headers: {'content-type': 'text/javascript'}});
    if (path === '/index.css' || /^\/fonts\/[\w/-]+\.woff2$/u.test(path)) {
      const asset = Bun.file(join(assetRoot, path));
      if (await asset.exists()) return new Response(asset);
    }
    return new Response('Not found', {status: 404});
  }});
  try {
    const browser = await chromium.launch({headless: true});
    try {
      const page = await browser.newPage({serviceWorkers: 'block'});
      await page.route('**/*', route => new URL(route.request().url()).origin === server.url.origin
        ? route.continue() : route.abort());
      await page.goto(server.url.href);
      await page.waitForFunction(() => window.editor?.elements() !== undefined);
      return await run(page, browser.version());
    } finally {
      await browser.close();
    }
  } finally {
    server.stop(true);
  }
}

if (import.meta.main) {
  const input = Bun.argv[2];
  if (!input || Bun.argv.length !== 3) throw Error('Usage: bun examples/excalidraw/headless.ts input.excalidraw > output.svg');
  const text = await Bun.file(input).text();
  const svg = await withHeadlessExcalidraw(async page => {
    await page.evaluate(scene => window.editor.open(scene), text);
    return page.evaluate(() => window.editor.svg());
  });
  console.log(svg);
}
