# Interchange and catalog execution evidence

Observed locally on macOS, 2026-10-29, with Bun 1.4.3, Node 26.12.1,
Chromium 153.0.8010.12, Graphviz 16.1.0, Mermaid 12.2.0 and the SHA-256-pinned
Lini 1.1.0 WASM. Core remains the released SDK 0.5.7. This is a bounded local
qualification, not evidence for all native syntax, other runtime versions or
pixel equivalence. Hosted CI is separate evidence.

## Delivered boundaries

CONTRACT-086 governs both-direction DOT/Mermaid/Lini profiles, strict/default
loss policy, source companions, identity maps, safe input admission and independent
reparse before exact replay. The imported visual 1.0.0 schema/semantics and four
upstream authorities remain unchanged. Native engines are tooling dependencies,
not portable library dependencies. The public package exports the interchange
facade and types through its root.

CONTRACT-085 governs schema-derived language reference and sample evidence.
The language is 19 schema `$defs` and seven kind families/22 forms. Its gallery
contains 50 original example documents (12 form-folder examples, 38 application
samples) and three canaries. The 53 rows are not language definitions. Current
shared-element reuse and application-profile assumptions are audited in the
[current-state inventory](../00-discover/current-state-inventory-visual-language.md).
No new common shape/style/layout model or schema-to-visual producer is claimed.

## Executed checks

| Command | Observed result |
| --- | --- |
| `bun run check:source` | Public core boundary and schema agreement pass |
| `bun run typecheck` | Source, scripts, tests and site build pass |
| `bun test` | 76 pass, 0 fail; 3,160 assertions |
| `bun run build` | Browser ESM and declarations, core external |
| `bun run test:package` | Packed installation; Bundler declarations; Bun and Node public API consumers including all three interchange formats pass |
| `bun run test:native` | Actual Graphviz graph/label fidelity; pinned Lini graph/entities compile without native diagnostics |
| `bun run test:browser` | 50 fixtures/100 original round trips, atomic edit, all three interchange round trips; actual Mermaid and Lini render/label checks, zero page errors |
| `bun run build:catalog` | 53 examples, 159 evaluated target combinations; 59 actual native SVGs |
| `bun run test:catalog` | Source/schema hashes, native versions, asset hashes and refusal/no-SVG invariants pass |
| `bun scripts/catalog/verify.ts --rebuild` | Catalog JSON and SVG bytes match across unchanged local rebuilds |
| `bun run build:site` / `bun run test:site` | Actual Chromium discovery/filter/source/deep-link/keyboard/download/error-state checks, 375px overflow check, zero page errors |
| Installed HELIX validator | New/changed governed documents pass; imported identities preserved |

Native-render counts: DOT 11, Mermaid 24, Lini 24. Other combinations retain
refusal diagnostics and receive no surrogate picture. Render success is separate
from strict export success. Catalog source selection uses actual strict export,
then allow-reported-loss only on refusal; selected diagnostics/maps are tested
against the public facade. All emitted canaries must render successfully.

Mermaid rendering uses the native classic look with deterministic IDs and a
per-item seed. Its default neo look varied Bezier points across identical local
runs, so it did not satisfy byte reproducibility. Font/runtime/environment changes
may change drawings; reproducibility evidence is for unchanged local inputs and
runtimes, not cross-platform pixel identity.

Structured receipts are in [evidence/](evidence/): native engine results,
portable browser results and catalog UI checks. Desktop, native-render detail
and mobile screenshots were inspected. Source is displayed as text and SVG as an
image. Broken-image and missing-catalog states were exercised deliberately.

## Review and preservation

Luna agents implemented the adapters, facade and catalog/site. Sol planned and
reviewed contracts, native semantics, preservation and domain boundaries. Review
fixes include native escapes/Unicode fidelity, exact endpoint identities, forged
replay refusal, malformed option refusal, explicit native relationship losses,
deterministic renders, separation of language from application instances, and
mobile navigation overflow. The independent concurrent Miro/spike work in the
main checkout was preserved through a separate branch/worktree.

Remaining limits include handwritten model authority, no generic schema producer,
bounded native subsets, inherited 15-node/ID/cardinality/date constraints, and the
upstream SDK's NodeNext declaration resolution issue. Source retention does not
replace typed modeling of common concepts; the model/profile roadmap identifies
that work explicitly. No package release or vocabulary redesign is implied.
