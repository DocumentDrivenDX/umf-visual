# umf-visual

Visual meaning as a versioned UMF extension (`umf.visual`): author a diagram once as data (nodes, edges, groups,
sequences, state machines, timelines, metrics, entities), then compile it to native Graphviz DOT, Mermaid or Lini
source, or export/import it through bounded native interchange profiles. Seven kinds and 22 forms.
Flow: `semantic producer -> umf.visual -> native targets`.

The package is `@documentdrivendx/umf-visual` 0.6.0 (see [CHANGELOG](CHANGELOG.md)). It is distributed as a
[GitHub release tarball](https://github.com/DocumentDrivenDX/umf-visual/releases); it is not on npm yet.
Browse the [microsite](https://documentdrivendx.github.io/umf-visual/): a catalog of examples with their `umf.visual`
payload, native source and rendered output for each target.

## Status

| Area | Status |
| --- | --- |
| Vocabulary `umf.visual` 1.0.0 to 1.4.0, validate/read/write/create/edit APIs | Released; unit-tested. Default authoring model is 1.0.0, newer models are opt-in |
| Presentation compilers and native interchange for DOT, Mermaid 12.2.0, Lini 1.1.0 | Released; nightly CI renders every catalog example with the real engines (Graphviz, Mermaid in Chromium, Lini WASM) |
| Browser Lini renderer (`/renderers/lini`) | Released; tested in Chromium |
| PowerPoint, Google Slides, Miro editable adapters | Experimental: planning and import code is unit-tested; no CI job drives a live host |

Native interchange is bounded: unsupported content produces located diagnostics instead of silent loss, and
retained native source is kept alongside the document. Core comes from the UMF SDK (`@umf/core`, pinned to the
`umf-v0.5.7` release tarball in this version) through its public API only.

## Install

```sh
npm install ./documentdrivendx-umf-visual-0.6.0.tgz \
  https://github.com/DocumentDrivenDX/umf/releases/download/umf-v0.5.7/umf-sdk.tgz
```

Download the tarball and `SHA256SUMS` from the release page. Each release is built, smoke-installed in a fresh
project and attested by `release.yml`.

## Quickstart

<!-- quickstart -->
```js
import {createVisualDocument} from '@documentdrivendx/umf-visual';
import {compilePresentation} from '@documentdrivendx/umf-visual/presentation';
const doc = createVisualDocument({id: 'hello', kind: 'flow', form: 'network', question: 'What calls what?',
  nodes: [{id: 'client', label: 'Client'}, {id: 'api', label: 'API'}],
  edges: [{id: 'call', from: 'client', to: 'api'}]});
const plan = compilePresentation(doc, {backend: 'mermaid'});
if (!plan.ok) throw new Error(JSON.stringify(plan.diagnostics));
console.log(plan.source);
```
<!-- /quickstart -->

`backend` is `'graphviz'`, `'mermaid'` or `'lini'`; the plan also carries `elementMap` (logical id to native id),
`omissions` and `approximations`. Execute the source with the named engine, or render Lini in a browser:

```ts
import {renderLiniPresentation} from '@documentdrivendx/umf-visual/renderers/lini';
const drawing = await renderLiniPresentation(doc, {runtimeBaseUrl: '/vendor/lini/'});
if (drawing.ok) console.log(drawing.svg, drawing.elementMap);
```

Copy the files exposed under `@documentdrivendx/umf-visual/renderers/lini/assets/*` to the served `runtimeBaseUrl`.
Browser execution needs a secure context, Fetch, Web Crypto and WebAssembly; the loader verifies the runtime hashes.

## Native interchange

```ts
import {exportVisual, importVisual} from '@documentdrivendx/umf-visual';
const out = exportVisual(doc, {format: 'dot'});          // 'dot' | 'mermaid' | 'lini'
if (out.ok) console.log(out.text, out.diagnostics, out.identityMap);
const back = importVisual('digraph { client -> api; }', {format: 'dot', id: 'imported', question: 'What calls the API?'});
```

Strict mode is the default; `mode: 'allow-reported-loss'` permits explicitly reported projection losses. Import returns
the original source so that exact replay is possible; a changed document never replays stale source. Explicit
profiles (`umf.visual.<format>.annotated/1`, `umf.visual.<format>.full/1`) cover more of the vocabulary; the public
`interchangeCapabilities` array lists exactly which. Native input is limited to 256 KiB. See the
[editable host guide](docs/editable-integrations.md) for the experimental PowerPoint, Slides and Miro adapters.

## Develop

```sh
bun install --frozen-lockfile --ignore-scripts
bunx playwright install chromium
bun run check:source && bun run typecheck
bun run test            # fetches the pinned Lini runtime, then bun test
bun run build && bun run test:package
bun run test:native     # needs Graphviz (dot) on PATH
bun run test:browser
```

Slower renderer and microsite suites (`test:native:full`, `test:native:wave2`, `build:catalog`, `build:site`,
`test:site*`) run in the nightly CI job; `.cache/` output is uploaded as a workflow artifact, not committed.
Serve `dist-site/` with any static server to browse the microsite locally.

Documentation: [architecture](docs/architecture.md), [contracts](docs/contracts/), [design notes](docs/design/),
[roadmap](ROADMAP.md), [provenance](UPSTREAM.json) (extracted from UMF PR #62).
Known limits of the frozen 1.0.0 vocabulary (15-node cap, restricted ids, four cardinalities, early-year dates) are
corrected by opting in to model 1.1.0 or later.

License: MIT OR Apache-2.0.
