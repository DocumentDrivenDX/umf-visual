# umf-visual

A system library for `umf.visual`: visual meaning carried as a versioned UMF
extension, consumed by producers and independent renderers.

The initial implementation is extracted from
[UMF #62](https://github.com/DocumentDrivenDX/umf/pull/62), commit
`351c4802caf34eb7f4174e7b730f86f4befcf909`. It describes seven kinds and
22 forms, validates identity/references, preserves unknown content, and exposes
read/write/inspect/create/edit APIs. See [provenance](UPSTREAM.json).

The package is `@documentdrivendx/umf-visual` (unpublished bootstrap 0.1.0).
The vocabulary remains `umf.visual` 1.0.0 and the core envelope 0.10.0.
These versions have different owners. Core comes from the pinned released SDK
`umf-v0.5.7`; its public APIs are the only core dependency.

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check:source
bun run typecheck
bun test
bun run build
bun run test:browser
```

```ts
import {createVisualDocument, inspectVisual} from '@documentdrivendx/umf-visual';

const doc = createVisualDocument({
  id: 'service-map', kind: 'flow', form: 'network',
  question: 'What calls the API?',
  nodes: [{id: 'client', label: 'Client'}, {id: 'api', label: 'API'}],
  edges: [{id: 'request', from: 'client', to: 'api', label: 'Request'}],
});
console.log(inspectVisual(doc));
```

The build produces browser-compatible ESM and TypeScript declarations. It leaves
the core dependency external. CI exercises a packed installation as well as source.
No renderer or native-format adapter is implemented in this bootstrap.

[Project direction and HELIX artifacts](docs/helix/README.md) cover the planned
UMF-authored definition and versioned DOT, Mermaid and Lini interchange profiles.
Those profiles require native source retention, identity maps and explicit loss
reports. They are not blanket equivalence or round-trip claims.

The inherited 15-node rule, restricted IDs, four conventional cardinalities and
early-year date conversion issue remain visible in the extraction record. They
need governed revisions before broad interchange claims.

License: MIT OR Apache-2.0. Original attribution is retained in the license files.

TypeScript declaration evidence uses `moduleResolution: Bundler`. A packed
NodeNext consumer fails to resolve inherited validation fields because SDK
0.5.7 declarations re-export extensionless relative paths. Bun/Node runtime
checks pass. NodeNext types need an upstream SDK packaging correction; no
private-source alias or SDK mutation is used here.
