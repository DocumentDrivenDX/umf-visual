export {};
// SPDX-License-Identifier: MIT OR Apache-2.0
// Development only. Never imported by the portable library.
const bundle = await Bun.build({entrypoints: ['examples/miro/app.ts'], target: 'browser', format: 'esm'});
if (!bundle.success) throw Error(bundle.logs.join('\n'));
const js = await bundle.outputs[0]!.text();
const html = await Bun.file('examples/miro/index.html').text();
const server = Bun.serve({hostname: '127.0.0.1', port: 4178, fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === '/app.js') return new Response(js, {headers: {'content-type': 'text/javascript'}});
  if (path === '/') return new Response(html, {headers: {'content-type': 'text/html'}});
  return new Response('Not found', {status: 404});
}});
console.log('Miro App URL: http://localhost:' + server.port + '/ (Web SDK v2; boards:read and boards:write)');
