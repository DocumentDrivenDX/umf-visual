// SPDX-License-Identifier: MIT OR Apache-2.0
// Development-only Miro SDK panel. Separate from the legacy app on port 4178.
export {};
const bundle = await Bun.build({entrypoints: ['examples/miro/editable-app.ts'], target: 'browser', format: 'esm'});
if (!bundle.success) throw Error(bundle.logs.join('\n'));
const js = await bundle.outputs[0]!.text();
const html = await Bun.file('examples/miro/editable.html').text();
const server = Bun.serve({hostname: '127.0.0.1', port: 4180, fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === '/app.js') return new Response(js, {headers: {'content-type': 'text/javascript', 'cache-control': 'no-store'}});
  if (path === '/' || path === '/index.html') return new Response(html, {headers: {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}});
  return new Response('Not found', {status: 404});
}});
console.log('Editable Miro development app: http://localhost:' + server.port + '/ (Web SDK v2; synthetic conformance flow; board:read and boards:write)');
