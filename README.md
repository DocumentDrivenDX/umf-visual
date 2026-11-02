# umf-visual

A system library for `umf.visual`: visual meaning carried as a versioned UMF
extension, consumed by producers and independent renderers. The microsite leads
with sourced architecture, stack and E/R diagrams, their shared DSL definitions
and native SVG/PNG artifacts. The secondary evidence page retains the complete
language reference, interchange catalog, identity mappings and diagnostics.

The intended model is a superset of common visual types and properties exposed
by these tools, serving both interchange and generic authoring by semantic
producers such as UMF schemas: `semantic producer → umf.visual → native targets`.
The released 1.0.0 vocabulary and native adapter profiles are an initial subset; explicit 1.1.0 vocabulary corrections are described below.
Explicit 1.2.0 adds common geometric shapes, container layout intent, named
node-local ports and authored E/R identification. These are shared model
concepts, independent of renderer capabilities. Interpreters realize them or
describe a faithful approximation; themes own colors, fonts and pixel spacing.
Retained source is a preservation mechanism, not a replacement for that model.

The vocabulary describes seven kinds and 22 forms. Its validation and
read/write/inspect/create/edit APIs were extracted from
[UMF #62](https://github.com/DocumentDrivenDX/umf/pull/62), commit
`351c4802caf34eb7f4174e7b730f86f4befcf909`; see [provenance](UPSTREAM.json).

Version 0.5.0 is packaged as `@documentdrivendx/umf-visual`, distributed through a
[GitHub release archive](https://github.com/DocumentDrivenDX/umf-visual/releases/tag/v0.5.0).
The release publication receipt records the actual archive and deployment checks.
It is not published to npm.

Browse the [umf.visuals catalog](https://documentdrivendx.github.io/umf-visual/).
Default authoring remains `umf.visual` 1.0.0 and the core envelope 0.10.0. The
0.5.0 release adds explicit models 1.2.0/1.3.0, Graphviz/Mermaid/Lini presentation
compilers, and a separate browser Lini runtime with distributable assets. Earlier
editable interchange profiles retain their qualified model versions.
Core comes from the pinned released SDK `umf-v0.5.7`; only its public APIs are used.
The authored latest schema generates the 1.3.0 manifest and TypeScript shapes;
1.0.0, 1.1.0 and 1.2.0 assets and interpretation remain frozen. Unversioned
schema/manifest and authoring defaults remain 1.0.0; new versions require opt-in.

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check:source
bun run typecheck
bun test
bun run fetch:lini
bun run build
bun run test:package
bunx playwright install chromium
bun run test:native       # requires Graphviz dot and Python 3 on PATH
bun run test:native:annotated
bun run test:native:full
bun run test:browser
bun run build:catalog     # actual DOT, Mermaid and Lini native SVG generation
bun run test:catalog     # validate exact source and SVG hashes
bun run build:showcase    # themed native drawings from sourced DSL definitions
bun run test:showcase     # source/image identities and scoped visual checks
bun run build:site        # assemble dist-site/
bun run test:site
bun run test:site:showcase
bun run test:release:catalog
bun run test:site:profiles
```

Serve `dist-site/` with any static HTTP server to browse the microsite. Source lives
in `microsite/`; `scripts/catalog/` derives the data from every checked-in visual
fixture plus dedicated canaries. Generated data and SVGs are build outputs. Native
engines are build/test dependencies; the portable library does not load them.

### Presentation rendering

The separate presentation compiler draws the existing DSL with renderer-owned
themes and layout options. Graphviz, Mermaid and Lini execution stays outside the
portable vocabulary/compiler. The separate `/renderers/lini` entry executes the
pinned Lini runtime in a browser. This is a drawing projection, with explicit omissions and
approximations; it is separate from editable interchange and full readback.

```ts
import {createVisualDocument} from '@documentdrivendx/umf-visual';
import {compilePresentation} from '@documentdrivendx/umf-visual/presentation';

const diagram = createVisualDocument({
  id: 'request', kind: 'flow', form: 'network', question: 'What calls the API?',
  nodes: [{id: 'client', label: 'Client'}, {id: 'api', label: 'API'}],
  edges: [{id: 'request', from: 'client', to: 'api', label: 'Request'}]
});
const plan = compilePresentation(diagram, {
  backend: 'graphviz', direction: 'LR', theme: 'presentation/1'
});
if (plan.ok) {
  console.log(plan.source); // Execute with the named native renderer.
  console.log(plan.elementMap, plan.omissions, plan.approximations);
}
```

Architecture dependencies, ordered stack composition and entity/relationship
views reuse the current nodes, groups, layers, fields and references. Renderer
support is qualified per view and backend; a successful complete interchange
round trip does not establish presentation quality. Graphviz qualifies for all
the architecture/stack/entity showcase views, including field-bound E/R connections.
Lini adds native sequence and tree projections for the gallery checkout and
product-vision examples. Mermaid E/R refuses relationships whose identification
is unspecified. Qualification is per view, source and engine version.

Every example shows its exact visual payload as YAML, a separate full UMF JSON
download and executable create/read/edit/compile usage. The gallery sources are
pinned to Lini v1.1.0 with their original MIT license. Shared model 1.3.0 adds
symbolic icons, parallelograms, tree composition, positioned sequence notes and
explicit `edge.directed: false` associations. Colors and pixel positions remain
theme/layout decisions. A node's parent and ordered message records remain data,
not native Lini snippets. `upgradeVisualDocument(document, '1.3.0')` selects the
latest model; omitting the target still selects 1.1.0.

```ts
import {renderLiniPresentation} from '@documentdrivendx/umf-visual/renderers/lini';

const drawing = await renderLiniPresentation(diagram, {
  runtimeBaseUrl: '/vendor/lini/'
});
if (drawing.ok) {
  console.log(drawing.svg, drawing.nativeVersion, drawing.elementMap);
}
```

The package includes `lini_wasm.js`, `lini_wasm_bg.wasm`, `runtime-manifest.json`
and `LICENSE` through `/renderers/lini/assets/*`. Bundled applications copy these
files to their served `runtimeBaseUrl`; unbundled ESM uses package-relative URLs
by default. The loader verifies both runtime hashes, initializes lazily and
refuses native diagnostics. Successful output is the actual native SVG, with
source and identity mappings. Browser execution requires an HTTP(S) secure context
(or localhost), Fetch, Web Crypto, Blob module loading and WebAssembly.

Current core registration uses fixed-schema code generation. A page that forbids
JavaScript `unsafe-eval` can use a separately served same-origin module worker:
keep the parent policy strict and explicitly allow code generation and verified
Blob module loading only in that trusted worker's policy. This worker boundary
is qualified separately; direct strict-CSP import of the current core is not.
The renderer uses portable XML verification and does not require a DOM in the
worker. SVG embedding/style policy remains the host application's responsibility.
Native node carriers expose `data-id`; link identities are classes such as
`lini-style-e1`. Match the returned map and native endpoint paths rather than
assuming every native link has a DOM `id` attribute.

Existing editable interchange/host profiles keep their qualified model-version
scope and refuse 1.2.0/1.3.0 until their new mappings are qualified. Presentation
output does not claim editable round trips merely because the original payload
is available beside it.

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

The full profiles prefer qualified native diagrams and provide complete-document
interchange with visible primitive fallbacks where needed:

```ts
const profile = 'umf.visual.dot.full/1' as const;
const output = exportVisual(document, {format: 'dot', profile});
if (output.ok) {
  console.log(output.text, output.representation, output.approximations);
  const imported = importVisual(output.text!, {
    format: 'dot', profile, id: 'context', question: 'What survives?',
  });
  // The native source supplies the recovered document and interpretation context.
}
```

`umf.visual.dot.full/1`, `umf.visual.mermaid.full/1` and
`umf.visual.lini.full/1` use mapping version `0.1.0`. They reuse an existing
strict native annotation profile byte-for-byte only when independent import
recovers the entire document. `representation` names that underlying profile,
mapping version and coverage model. Other documents use visible primitive
compositions with exhaustive typed records. The compositions cover
the vocabulary's graph, containment, state, ordered sequence, timeline,
comparison and metric forms. Layout and shape approximations are explicit in
`approximations`; they are separate from omitted meaning. For example, a line
chart can use connected, dated value points with magnitude indicators instead
of calibrated axes. Entity field rows remain associated with their owner.
The catalog qualifies each example with complete and focused native renders.

Full import accepts the declared native or primitive grammar, independently reads
visible values and connections, and checks that the primary drawing realizes
the recovered document. It preserves unknown document content as typed visible
rows without claiming to interpret that content. The limits are 256 KiB UTF-8
native source, 10,000 scalar/container records and 64 source nesting levels;
native grammar and renderer limits can be stricter. Unknown native constructs
refuse rather than disappear. Exact retained-source replay requires an unchanged,
independently reparsed document. Updating retained native presentation is not
qualified: regenerate explicitly without the companion, or request exact replay.

The omitted-profile native defaults and the following annotation profiles keep
their released behavior. They remain useful when their native diagram family
provides a more specific visual presentation.

The full-profile qualification corpus contains 53 unchanged catalog examples
across all 22 forms, plus five complex integration documents. Each is evaluated
in all three portable formats: 174 strict whole-document readbacks and native
renders. Integration matrix cells use additive full routes with their own
complete/focused source and preview receipts. Existing host captures and
upstream Miro projection gaps retain their original scope.

The earlier [v0.3.0 release](https://github.com/DocumentDrivenDX/umf-visual/releases/tag/v0.3.0)
qualified one preferred annotation route per catalog example (31 DOT, 18 Lini,
four Mermaid). Those choices and its [publication receipt](https://github.com/DocumentDrivenDX/umf-visual/releases/download/v0.3.0/publication-receipt.json)
remain independently recorded compatibility evidence. Native acceptance, exact
text and semantic readback are checked separately from faithful geometry and
readable previews.
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
Generated vocabulary types alone do not establish native support for stable field IDs,
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
stale receipts. The current standalone schema generates the 1.2 manifest and
TypeScript shapes; generation freshness is checked without writing.
