# umf-visual

A system library for `umf.visual`: visual meaning carried as a versioned UMF
extension, consumed by producers and independent renderers. The microsite references the language schema and its shared types separately
from its example gallery, which compares UMF sample documents, native sources, actual SVG renders,
identity mappings and explicit losses for DOT, Mermaid and Lini.

The intended model is a superset of common visual types and properties exposed
by these tools, serving both interchange and generic authoring by semantic
producers such as UMF schemas: `semantic producer → umf.visual → native targets`.
The released 1.0.0 vocabulary and native adapter profiles are an initial subset; explicit 1.1.0 vocabulary corrections are described below.
Common shapes, layout/style, ports and richer native relationships still need
first-class model/mapping work; retained source is a preservation mechanism,
not a replacement for that typed model.

The vocabulary describes seven kinds and 22 forms. Its validation and
read/write/inspect/create/edit APIs were extracted from
[UMF #62](https://github.com/DocumentDrivenDX/umf/pull/62), commit
`351c4802caf34eb7f4174e7b730f86f4befcf909`; see [provenance](UPSTREAM.json).

The released package is `@documentdrivendx/umf-visual` 0.2.0, distributed as a
[GitHub release archive](https://github.com/DocumentDrivenDX/umf-visual/releases/tag/v0.2.0).
It is not published to npm.

Browse the [umf.visuals catalog](https://documentdrivendx.github.io/umf-visual/).
Default authoring remains `umf.visual` 1.0.0 and the core envelope 0.10.0. The
released package is 0.2.0; Linux CI and deployed preview verification pass. It adds
opt-in vocabulary 1.1.0 and explicit readable annotation profiles.
Core comes from the pinned released SDK `umf-v0.5.7`; only its public APIs are used.
The authored latest schema generates the 1.1.0 manifest and TypeScript shapes;
released 1.0.0 assets and interpretation remain frozen.

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check:source
bun run typecheck
bun test
bun run build
bun run test:package
bun run fetch:lini
bunx playwright install chromium
bun run test:native       # requires Graphviz dot and Python 3 on PATH
bun run test:native:annotated
bun run test:browser
bun run build:catalog     # actual DOT, Mermaid and Lini native SVG generation
bun run test:catalog     # validate exact source and SVG hashes
bun run build:site        # assemble dist-site/
bun run test:site
bun run test:release:catalog
bun run test:site:profiles
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
| Graphviz DOT | Directed flows, nested named clusters/membership, labels and descriptive tooltips; scoped defaults and chains | Graphviz native parser/render |
| Mermaid | Bounded flowchart and ER diagrams; ordered sequences with call/return/async messages, notes and loops | Mermaid 12.2.0 in Chromium |
| Lini | Native outer-group titles, flat block/entity cards, quoted fields and directed links to cards/declared fields | Pinned Lini 1.1.0 WASM |

The public `interchangeCapabilities` array describes the exact profile versions
and subsets. These adapters do not translate every UMF form. Unsupported content,
layout, styling and richer semantics produce located diagnostics; the catalog
shows refusals as well as emitted results. A native render success is recorded
separately from semantic support. Native input is bounded to 256 KiB UTF-8.

## Complete examples through explicit profiles

The released catalog evaluates all 53 unchanged examples across all 22 forms. Each has
a selected strict, complete projection through one suitable target: 31 DOT,
18 Lini and four Mermaid profiles. Preview review and Linux CI pass for all 22 forms.
The [v0.3.0 release](https://github.com/DocumentDrivenDX/umf-visual/releases/tag/v0.3.0)
adds qualified renderer/host evidence; its [publication receipt](https://github.com/DocumentDrivenDX/umf-visual/releases/download/v0.3.0/publication-receipt.json)
binds the passing main workflow and verified artifacts. Native acceptance, exact text and semantic readback
are checked separately from faithful geometry and readable previews.
See [milestone evidence and release gates](docs/helix/04-build/example-completion-evidence.md).

The catalog provides larger previews and an image viewer with fit, actual-size,
zoom and full-screen controls. Versioned display styling preserves model semantics,
exported native source, reported losses and captured host images.

Select a readable annotation profile explicitly:

```ts
const profile = 'umf.visual.dot.annotated/1' as const;
const projected = exportVisual(document, {format: 'dot', profile});
if (projected.ok) {
  console.log(projected.text, projected.coverage);
  const recovered = importVisual(projected.text!, {
    format: 'dot', profile, id: 'service-map', question: 'What calls the API?',
  });
  // Store recovered.document and recovered.source together for exact replay.
}
```

Current source profiles qualify these bounded subsets:

| Explicit profile | Mapping version | Subset |
| --- | --- | --- |
| `umf.visual.dot.annotated/1` | 0.1.0 | Flow, structural/entity, state and sequence views |
| `umf.visual.lini.annotated/1` | 0.2.0 | Metric, timeline, comparison and directed flow networks; pipeline geometry remains reported loss |
| `umf.visual.mermaid.annotated/1` | 0.1.0 | Sequence lifelines with visible typed notes; ladder geometry remains reported loss |

These profiles require the canonical frozen 1.0.0 vocabulary declaration.
Generated 1.1.0 types do not establish native support for stable field IDs,
exact multiplicities or the larger model's resource bounds. Strict mode refuses
remaining geometry losses; reported-loss mode exposes them, including on exact
retained-source replay.

The source tree also contains bounded editable-network host APIs for PowerPoint,
Google Slides and Miro. See the [editable host integration guide](docs/editable-integrations.md)
for package imports, strict/report behavior, revision-fenced readback and update
examples. Named native-host proofs qualify specific PowerPoint, Slides and Miro
cases; the older Miro capture/clipboard evidence is a separate profile. The
[current continuation evidence](docs/helix/04-build/example-completion-evidence.md#p8-p14-continuation-review--2026-10-31)
distinguishes the fifteen locally qualified host cycles from conversion
previews and the still-pending release/CI gates. It does not claim whole-board
or arbitrary-edit support.

Intrinsic meaning uses native connections, markers, ports, chart data or
table/grid geometry. Registered additional metadata uses visible, typed native
notes/cells with independent identities. Coverage distinguishes these two
representations. No opaque whole-document JSON, hidden scalar copy or source
companion counts as native semantic support. The catalog labels qualified
profiles separately and keeps ordinary target losses/refusals visible.

Import reconstructs the complete document and refuses native content outside
the qualified subset. Supported text/data edits require valid native identity,
typing and readback; arbitrary styling, structural edits and host-specific
content remain unqualified and can refuse. Exact replay reparses the companion
and compares its derived document with the baseline/current document. It proves
consistency, not cryptographic provenance. Omitting `profile` keeps the existing
native behavior and historical receipts unchanged.

The first loss-reduction wave preserves Mermaid diagram titles and secondary node
descriptions as DOT tooltips/Lini card hints. `bun run report:loss` compares actual
results with the unchanged example baseline; [evidence and remaining work](docs/helix/04-build/loss-reduction-wave-1.md)
record native text limits.

The build produces browser-compatible ESM and declarations with core external.
CI exercises source, packed consumers, native engines, Chromium and the catalog.
[HELIX artifacts](docs/helix/README.md) govern preservation and support claims.
The inherited 15-node rule, restricted IDs, four conventional cardinalities and
early-year date conversion issue remain visible in the extraction record and frozen 1.0.0 behavior. Explicit 1.1.0 corrects dates, adds exact multiplicities and changes the node cap; restricted IDs and native profile limits remain.

TypeScript declaration evidence uses `moduleResolution: Bundler`. A packed
NodeNext consumer cannot resolve inherited validation fields because SDK 0.5.7
re-exports extensionless relative paths. Bun/Node runtime checks pass; no private
SDK alias or mutation is used here.

License: MIT OR Apache-2.0. Original attribution is retained in the license files.

## GitHub Pages publication

The Library conformance workflow builds and verifies the library and complete
native-render catalog. Successful pushes to `main` publish that same `dist-site/`
artifact through GitHub Actions Pages. Pull requests run verification without
deploying. A manual workflow dispatch on `main` can redeploy a verified build.
The site uses relative assets so catalog selections work below `/umf-visual/`.
To restore a previous site, revert the affected source change on `main` and let
the same verification and deployment workflow complete.

The second mapping wave adds eight DOT grouped-flow projections and five Mermaid
sequence projections from the unchanged existing examples. DOT cluster hierarchy,
node membership and edge explanations now survive their native mappings. Sequence
participants, message order, endpoints and explicit arrow kinds have independent
native checks. Group roles, tier/lane layout, walkthrough steps, provenance and
other unrepresented metadata remain explicit losses. The catalog reports native
render counts separately from full semantic support; these are qualified subsets.

## Miro integration spike

Miro development app: `bun run dev:miro`. It exports question/node shapes and
connectors, then adopts plain-label and attached-endpoint edits into the original
visual. Keep the companion with the document. Additional kinds and arbitrary
semantic board import require separate profiles. A live label round trip and
a 72-item native UMF reproduction pass. `umf.visual.miro` preserves API-visible
JSON and optional opaque native browser-copy content, with qualified fidelity
and shared-model gaps recorded in the guide.

See the [Miro integration guide](docs/helix/04-build/miro-integration.md) for the runnable app, versioned scope and native evidence.

## Versioned review fixes

David's #62 review fixes are introduced as `umf.visual` 1.1.0 because package
v0.1.0 already published the 1.0.0 contract. The released schema, manifest,
validator and fixture bytes remain available unchanged. Both versions register
together; default authoring/public manifest aliases retain 1.0.0. Use the third
`createVisualDocument` argument `1.1.0` or explicit `upgradeVisualDocument` to
opt into early-year date corrections, 500-node resource bounds with split advice,
exact multiplicities and stable field IDs. Native companions remain unchanged;
a changed vocabulary declaration is a source revision change and cannot replay
stale receipts. The current standalone schema generates the 1.1 manifest and
TypeScript shapes; generation freshness is checked without writing.
