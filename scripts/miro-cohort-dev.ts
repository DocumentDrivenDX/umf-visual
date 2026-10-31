// SPDX-License-Identifier: MIT OR Apache-2.0
// Local-only development server for the explicit five-case Miro SDK cohort.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';

const root = resolve(import.meta.dir, '..');
const port = 4184;
const ids = ['nested-environments', 'process-documents-store', 'network-16x24', 'frames-headings-annotations', 'curved-caption-cross-boundary'];
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(await readFile(join(root, 'fixtures/integrations/complex-miro/manifest.json'), 'utf8'));
const cases = await Promise.all(ids.map(async id => {
  const entry = manifest.cases.find((item: any) => item.id === id);
  if (!entry?.commonVisualPath) throw new Error(`Missing common UMF projection for ${id}`);
  const sourcePath = `fixtures/integrations/complex-miro/${entry.commonVisualPath}`;
  const bytes = await readFile(join(root, sourcePath));
  return {id, title: entry.title, sourcePath, sourceSha256: sha(bytes), document: JSON.parse(bytes.toString('utf8'))};
}));
const bundle = await Bun.build({entrypoints: [join(root, 'examples/miro/cohort-app.ts')], target: 'browser', format: 'esm'});
if (!bundle.success) throw new Error(bundle.logs.map(log => log.message).join('\n'));
const appJs = await bundle.outputs[0]!.text();
const html = await readFile(join(root, 'examples/miro/cohort.html'), 'utf8');
const server = Bun.serve({hostname: '127.0.0.1', port, fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === '/app.js') return new Response(appJs, {headers: {'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store'}});
  if (path === '/cases.json') return Response.json(cases, {headers: {'cache-control': 'no-store'}});
  if (path === '/' || path === '/index.html') return new Response(html, {headers: {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}});
  return new Response('Not found', {status: 404});
}});
console.log(`Miro five-case cohort app: http://localhost:${server.port}/ (Miro Web SDK v2; no board writes until an explicit action)`);
