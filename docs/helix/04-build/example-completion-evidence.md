# Example completion milestone: execution evidence

Working-tree observation on 2026-10-29, based on merged main
`31395903ee1bba6ab5720bc3077068bdb3179ca7`, following the initial
`87eadb4` review. Final source hashes are recorded in the receipts below. This supplementary execution record
implements the [example completion plan](example-completion-plan.md) under
[CONTRACT-087](../02-design/contracts/CONTRACT-087-readable-annotations.md),
[CONTRACT-085](../02-design/contracts/CONTRACT-085-visual-catalog.md) and
[STP-095](../03-test/test-plans/STP-095-visual-catalog.md).

**Local candidate review passes; Linux CI and publication remain pending.**
Complete semantic readback, refreshed native/render geometry and final catalog
checks pass for the current corpus, including the corrected entity connector
labels. A successful SVG load or source readback alone was not used as
visual-fidelity approval.

## Accepted gate and measured scope

The owner selected at least one suitable complete target per example, rather
than every format for every example. All 53 unchanged examples (50 originals
and three canaries) and all 22 forms remain in scope. No fixture content was
removed to reduce loss counts.

| Observation | Current result | Qualification |
| --- | --- | --- |
| Original native sample/target pairs | 159 retained | Existing DOT/Mermaid/Lini outcomes remain accessible |
| Explicit annotation profile pairs | 106 evaluated | DOT and Lini variants are additional outcomes |
| Selected complete examples | 53 of 53 | 43 DOT, 10 Lini; strict export, zero selected diagnostics |
| Forms represented by selected examples | 22 of 22 | Native construction and final local preview review pass |
| Complete public Chromium readbacks | 53 of 53 | Whole document, compound JSON/YAML persistence, exact and stale replay |
| Native SVG assets in the catalog | 178 | Baseline plus focused/complete views; not 178 examples |

Generated inputs are `dist-site/catalog.json` and the `.cache/` reports. Durable
copies for the final local candidate are linked below. They do not claim that a
tag has been published; CI must repeat the gates for the exact candidate commit.

## Representation and preservation

Selected profiles are `umf.visual.dot.annotated/1` and
`umf.visual.lini.annotated/1`, initial mapping version 0.1.0, for frozen
`umf.visual` 1.0.0. Both are explicit opt-ins. Default native profiles and
historical receipts keep their interpretation; registering 1.1.0 does not give
these profiles a 1.1.0 mapping.

Native connectivity, state markers, containment, sequence rungs/rails, entity
ports/cardinalities, chart data/axes and timeline/table placement carry intrinsic
meaning. Readable typed notes/cells carry registered additional metadata such as
question, provenance, status and walkthrough fields. Scalar values are visible
native text; no embedded whole-document JSON or recovery companion counts as
native semantic coverage.

Portable parsing reconstructs and compares the whole document. A complete
native-AST comparison refuses residual attributes, objects, containment or
presentation that the canonical subset would omit. Independently reparsed
source, baseline and current document must agree before exact replay. Persist
`{document, source}` together: storing only the document loses native bytes.

Released 1.0.0 assets/validation and fixture hashes remain frozen. Explicit
1.1.0 authoring, upgrade and generated schema/type boundaries are qualified in
[versioned integration](visual-1-1-integration.md). Unknown envelope/vocabulary
fields and unqualified native edits still refuse or report loss. The profiles
do not promise arbitrary host editing or vanilla DOT/Lini types for every field.

## Executed proofs and review

- The public Chromium harness reports 53 complete annotated document readbacks,
  JSON/YAML compound persistence, exact replay and stale replay refusal, with no
  browser errors. Visible question edits come from native carriers; context
  does not substitute for their value.
- `scripts/native-annotated.ts` checks 43 DOT examples through Graphviz 16.1.0,
  real object/edge/port locators and exact annotation text drawn in SVG. Graphviz
  xdot JSON can add backslashes before quotes in text operations; actual SVG
  text decoded once as XML is the visible-text witness. Source strings must not
  be changed to match that serialization quirk.
- Ten Lini metric/timeline/comparison examples compile through pinned Lini
  1.1.0 WASM with no diagnostics. Native checks verify chart/table/grid constructs
  and exact visible annotation cell text. The WASM stays outside portable code.
- The refreshed four-case `.cache/native-lini-visual-layout.json` records
  Chromium geometry checks for matrix, before-after, quadrant and roadmap:
  no overlapping tables/cell text; roadmap blocks and labels are checked for
  overlaps and label overflow. Every case has no native diagnostics or geometry
  errors. Receipt source/fixture hashes were checked against public exports,
  and affected proofs were refreshed after the final entity spacing change.
- The 22-form contact sheet now shows real branching for tree, compact nested
  containment and straight sequence rails. Sol inspected that refreshed sheet
  and the corrected entity canary: connector/cardinality labels no longer
  collide. The contact sheet is navigation evidence, not a
  substitute for inspecting dense native views at useful zoom.
- The final local integration run passes 295 Bun tests and 11,188 assertions,
  source/type checks, the packed Bun/Node consumers, legacy native/wave-two
  checks and the new annotated/native/browser checks. The final entity regression
  and affected proofs pass. Linux CI remains pending.
- Sol reviewed safe JSON admission, the field registry/path writes,
  scalar/container presence, native locators, complete readback, canonical-AST
  refusal and retained-source reparse. Findings drove bounded-index,
  entity-order, node-qualified port, quadrant locator/choice, note consistency
  and descendant-group regressions.
- Catalog/UI checks distinguish old outcomes from qualified profiles and expose
  focused/complete native views, diagnostics, coverage, source and downloads.
  Full-width/100% preview controls and collapsed source improve inspection;
  they do not repair native geometry.
- Final catalog rebuild verification passes with byte-identical current JSON
  and SVGs, while retaining previously referenced immutable assets.

Linux CI found and corrected a false-positive sequence box-width assertion and
a five-second full-corpus test timeout. It also identified real roadmap text
overflow with Linux font metrics. Native span blocks now reserve 28 pixels per
visible text line and period columns provide 240 pixels for the unchanged
22-character wrap limit. The height change alone did not resolve the CI
overflow. Saved Linux bounds then showed that grid width does not stretch
intrinsically sized span blocks. Spans now explicitly reserve their covered
period width minus a 20-pixel gutter, enforced on import. The secondary
monospace font check passes; removing explicit widths reproduces 12–24 pixel
overflow in seven spans. Local native, browser and full-suite proofs were refreshed.
Linux validation of that correction remains pending.

## Candidate gate status

| Gate | Current status | Required evidence |
| --- | --- | --- |
| Semantic readback and unchanged examples | Passed locally | Repeat for final source/artifact hashes |
| Tree/nested view | Refreshed local native/render review passes | Preserve true branching and compact nesting in final artifacts |
| Comparison/roadmap layout | Four current-source native/Chromium cases pass | Preserve readable tables, quadrant geometry and collision-free roadmap |
| Sequence view | Straight rails and native order/endpoints pass locally | Preserve refreshed geometry after final regeneration |
| Entity connectors and catalog previews | Final corrected local preview and 53/22/178 UI checks pass | Preserve approved sources/assets in candidate artifacts |
| Package/browser/native regression | Final local suite and affected proofs pass | CI repeats the same gates |
| Linux CI | Pending | Passing workflow for the exact candidate commit |
| Release archive and Pages artifact | Not published by this record | Verified archives and checksums from the passing cut |

Sol found no remaining release-critical source or local visual-fidelity blocker
in the reviewed candidate. Commit/PR review may proceed; publish only after CI
passes for that cut and the verified archives/checksums are prepared.

## Durable local receipts

- [Public Chromium library](evidence/example-completion-browser.json)
- [Qualified-profile catalog/UI](evidence/example-completion-catalog-profile-ui-browser.json)
- [Baseline catalog/UI](evidence/example-completion-catalog-ui-browser.json)
- [43 DOT native cases](evidence/example-completion-native-annotated.json)
- [10 pinned Lini native cases](evidence/example-completion-native-lini-annotated.json)
- [Four Lini native/Chromium geometry cases](evidence/example-completion-native-lini-visual-layout.json)
- [Loss-ledger summary and full-report digest](evidence/example-completion-loss-ledger.json)

The complete generated ledger remains a CI artifact; its compact committed
receipt records the report's SHA-256 and byte size. Historical raw diagnostics
and profile coverage remain inspectable without committing the large report.

## Reproduction and continuation

```sh
bun run check:source
bun run typecheck
bun test
bun run build
bun run test:package
bun run fetch:lini
bun run test:native
bun run test:native:wave2
bun run test:native:annotated
bun run test:native:layout
bun run test:browser
bun run build:catalog
bun run test:catalog
bun run report:loss:ledger
bun run build:site
bun run test:release:catalog
bun run test:site
bun run test:site:profiles
```

Graphviz, Python and installed Chromium are prerequisites; Lini fetching verifies
the pinned runtime. Receipts and SVGs must describe the same final sources.
Release precedes P6/P7: sanitized complex Miro counterexamples, a common
binding/reconciliation contract, then separate PowerPoint, Google Slides and
Miro packages with real host edit/save/import evidence. Existing spikes do not
satisfy that future scope.
