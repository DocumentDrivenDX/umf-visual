# umf-visual

A system library for `umf.visual`: visual meaning carried as a versioned UMF
extension, consumed by producers and independent renderers. The microsite references the language schema and its shared types separately
from its example gallery, which compares UMF sample documents, native sources, actual SVG renders,
identity mappings and explicit losses for DOT, Mermaid and Lini.

The intended model is a superset of common visual types and properties exposed
by these tools, serving both interchange and generic authoring by semantic
producers such as UMF schemas: `semantic producer → umf.visual → native targets`.
The current 1.0.0 vocabulary and adapter profiles are an initial subset.
Common shapes, layout/style, ports and richer native relationships still need
first-class model/mapping work; retained source is a preservation mechanism,
not a replacement for that typed model.

The vocabulary describes seven kinds and 22 forms. Its validation and
read/write/inspect/create/edit APIs were extracted from
[UMF #62](https://github.com/DocumentDrivenDX/umf/pull/62), commit
`351c4802caf34eb7f4174e7b730f86f4befcf909`; see [provenance](UPSTREAM.json).

The package is `@documentdrivendx/umf-visual` (unpublished 0.1.0).
The vocabulary remains `umf.visual` 1.0.0 and the core envelope 0.10.0.
Core comes from the pinned released SDK `umf-v0.5.7`; only its public APIs are used.
The implementation is handwritten; generated UMF-authored model authority remains
future work.

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check:source
bun run typecheck
bun test
bun run build
bun run test:package
bun run fetch:lini
bunx playwright install chromium
bun run test:native       # requires Graphviz dot on PATH
bun run test:browser
bun run build:catalog     # actual DOT, Mermaid and Lini native SVG generation
bun run test:catalog     # validate exact source and SVG hashes
bun run build:site        # assemble dist-site/
bun run test:site
```

Serve `dist-site/` with any static HTTP server to browse the microsite. Source lives
in `microsite/`; `scripts/catalog/` derives the data from every checked-in visual
fixture plus dedicated canaries. Generated data and SVGs are build outputs. Native
engines are build/test dependencies; the portable library does not load them.

```ts
import {
  createVisualDocument, exportVisual, importVisual,
} from '@documentdrivendx/umf-visual';

const document = createVisualDocument({
  id: 'service-map', kind: 'flow', form: 'network',
  question: 'What calls the API?',
  nodes: [{id: 'client', label: 'Client'}, {id: 'api', label: 'API'}],
  edges: [{id: 'request', from: 'client', to: 'api', label: 'Request'}],
});
const output = exportVisual(document, {format: 'dot'});
if (output.ok) console.log(output.text);
console.log(output.diagnostics, output.identityMap);

const imported = importVisual('digraph { client -> api; }', {
  format: 'dot', id: 'imported', question: 'What calls the API?',
});
if (imported.ok) {
  // Persist the pair together to retain exact native source across storage.
  const stored = JSON.parse(JSON.stringify({document: imported.document, source: imported.source}));
  const original = exportVisual(stored.document, {
    format: 'dot', source: stored.source, original: true,
  });
  console.log(original.text);
}
```

Strict mode is the default. `mode: 'allow-reported-loss'` permits explicitly
reported projection losses; syntax, validation and safety errors still refuse.
Import always returns the original source companion, including on refusal. Exact
replay requires the same format, an unchanged whole document and independent
reparsing of the retained source. Changed documents cannot replay stale source.
Canonical conversion is a projection, not an equivalence claim.

| Format | Implemented profile subset | Native qualification |
| --- | --- | --- |
| Graphviz DOT | Directed flow/network nodes and labeled edges; source defaults and chains | Graphviz native parser/render |
| Mermaid | Bounded flowchart nodes/links and ER entities, fields and four cardinalities | Mermaid 12.2.0 in Chromium |
| Lini | Flat block/entity cards, quoted fields and directed links to cards/declared fields | Pinned Lini 1.1.0 WASM |

The public `interchangeCapabilities` array describes the exact profile versions
and subsets. These adapters do not translate every UMF form. Unsupported content,
layout, styling and richer semantics produce located diagnostics; the catalog
shows refusals as well as emitted results. A native render success is recorded
separately from semantic support. Native input is bounded to 256 KiB UTF-8.

The build produces browser-compatible ESM and declarations with core external.
CI exercises source, packed consumers, native engines, Chromium and the catalog.
[HELIX artifacts](docs/helix/README.md) govern preservation and support claims.
The inherited 15-node rule, restricted IDs, four conventional cardinalities and
early-year date conversion issue remain visible in the extraction record.

TypeScript declaration evidence uses `moduleResolution: Bundler`. A packed
NodeNext consumer cannot resolve inherited validation fields because SDK 0.5.7
re-exports extensionless relative paths. Bun/Node runtime checks pass; no private
SDK alias or mutation is used here.

License: MIT OR Apache-2.0. Original attribution is retained in the license files.
