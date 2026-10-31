# Example completion milestone: execution evidence

## Published closure — 2026-10-30

[v0.2.0](https://github.com/DocumentDrivenDX/umf-visual/releases/tag/v0.2.0)
is published at `31cbca1e6f576fef8497edd54c9adc8119beb780`.
[Main Linux conformance and Pages](https://github.com/DocumentDrivenDX/umf-visual/actions/runs/41002367698)
passed. The served catalog and all 178 native asset hashes match the tested
main artifact: 53 complete examples and 22 forms. Archive digests match the
published SHA256SUMS. The [closure receipt](evidence/example-completion-release-v0.2.0.json)
pins these facts. P5 is complete; P6/P7 are authorized under CONTRACT-088.

The candidate sections below retain the pre-publication observation and its
then-pending Linux gate as execution history.

## P6/P7 closeout observation — 2026-10-30

CONTRACT-088 governs the additive editable-host work after v0.2.0. Six
synthetic/sanitized complex Miro witnesses now accompany the original suite:
five shared-model documents and one native-only witness. The sixteen-node
network declares model 1.1.0; the other four shared documents use frozen 1.0.0.
The integration catalog records fifteen shared-document/target outcomes and
three opaque-witness refusals, with projection gaps and target losses intact.
PPTX XML readback and Slides/Miro plans are labelled separately from live host
execution; these outcomes do not alter the original 53-example/22-form gate.

| Host proof | Actual evidence and boundary |
| --- | --- |
| PowerPoint | [Native conformance](powerpoint-native-conformance.md) and [sanitized receipt](evidence/powerpoint-native-conformance.json): Microsoft PowerPoint for Mac 16.114.3, one-slide 1.1.0 16-node/24-edge network; UI label, bold style, movement and reconnection; semantic import and preserving update/reopen without repair. A separate 1.0.0 case proves editable caption text shapes, native caption edit and preserving update/reopen. |
| Google Slides | [Live execution](../02-design/spikes/google-slides/live-execution.md) and [sanitized receipt](evidence/google-slides-live-2026-10-30.json): one adapter-owned 1.0.0 slide, UI label/style/movement/reconnection and a three-request conditional update. Captures prove unchanged original slide and retained post-UI style, transforms and attachments. Host-wrapper writes were live; adapter logic was checked through captured trace replay. |
| Miro | [Live conformance](miro-editable-live-2026-10-30.md) and [sanitized receipt](evidence/miro-editable-live-2026-10-30.json): synthetic standalone 1.0.0 network, three nodes/two edges/seven mappings; UI label/movement/fill/reconnection, two imported semantic changes and preserving question update through the actual Web SDK. Independent admission verifies revisions 0/1/2 and 82 unrelated items unchanged apart from excluded SDK modification metadata. |

These proofs qualify the named adapter-owned subsets. They do not establish
whole-presentation/board fidelity, all complex corpus cases, arbitrary native
edits, or other host versions. Native-only content remains retained with losses;
an embedded source or binding cannot promote it to native semantic coverage.
Miro's observed SDK runtime was 1.105538.0; its service release was not
independently pinned. Groups were not exercised, and an initial bold rich-text
command correctly refused with `RICH_TEXT`.
The Miro host witness is separate from the six corpus fixtures. Its repeatable
verifier is `bun scripts/evidence/verify-miro-editable-live.ts`; raw native
captures and private identifiers stay outside published receipts.

Sol's previous bounded review passed 56 focused tests and 457 assertions across
shared reconciliation, Miro, Slides, PPTX/XML/ZIP and the additive catalog.
The final closeout rerun passes 38 tests and 191 assertions. It includes repeated
Slides caption updates at the exact existing label pointer, native caption
import, and refusal of text bodies on qualified PPT connectors, whose labels
belong to separate editable caption shapes. Both final P2 findings are closed;
Sol found no remaining release-critical defect in this bounded review. Final
integrated CI and publication gates remain pending: no P6/P7 merge, deployment
or new release is claimed here.

## Candidate observation

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

## P8-P14 continuation review — 2026-10-31

This continuation is in progress. It does not reopen the published v0.2.0
closure or claim a new merge, release or deployment. The governing work and
remaining gates are in the [execution plan](example-completion-plan.md).

The [bounded loss/probe report](evidence/renderer-coverage-loss-progress.json)
keeps the same 53 source identities and separates ordinary results from opt-in
profiles. Ordinary emitted raw loss diagnostics remain DOT 629 and Mermaid 792;
Lini changes from 553 to 530 through its native title mapping. The 23 removed
incidences are measured on unchanged source pairs. The remaining 1,951 raw
incidences and 1,793 maximal groups are still current losses, not repaired by
selecting a different profile. Native role/style, port, ER identification and
Lini class probes have field- and version-bounded qualifications; they do not
establish blanket native impossibility.

Independent review reran the pinned Lini entity/model-boundary runners and the
Mermaid ER browser probe. The corrected Mermaid annotation runner also passes
all five sequence sources in Chromium 153.0.8010.12 with Mermaid 12.2.0: actual
message/coverage locators, editable note carriers, native line wrapping and
source-bound hashes. Maximum annotation widths are 330–551 pixels; the hostile
literal-break/markup value remains visible and creates no SVG script element.
Ladder geometry and Lini pipeline geometry remain reported losses. Focused
follow-up tests pass 20 tests/208 assertions; these do not replace the final
integrated regression for the eventual publication cut.

| Host cohort | Evidence now available | Open qualification |
| --- | --- | --- |
| PowerPoint | [Five native cycles](../../../fixtures/renderers/powerpoint/native-cycle-receipt.json), [operator attestations](../../../fixtures/renderers/powerpoint/native-ui-attestations.json) and [five preview receipts](../../../fixtures/renderers/powerpoint/preview-receipt.json) | Finish all-case completion-join checks and final published asset/UI validation. Preview engine is LibreOffice; actual PowerPoint 16.114.3 save/reopen proof is separate. |
| Google Slides | [Five source-bound receipts](../../../fixtures/renderers/google-slides/preview-receipt.json): actual API edit/import/different-UMF-update/readback cycles, fresh two-observation fences, JSON/YAML persistence and archived 1600×900 native thumbnails | Refresh the assembled receipt/assets after final native-only preview layout, then validate the public join and all hashes. These are native API edits; no editor-UI claim is made. |
| Miro | Process/documents/store has a clean observed cycle. Nested restore and Frames update/restore have separate later read-only recovery; seventeen qualified metadata-drift entries retain raw captures | Curved and network plus durable sanitized assembly remain open. Interrupted immediate fences stay refusals; any authorized cross-case changes require exact independent receipt attribution, not normalization. |

The source-restoration recovery is not an automatic retry or an atomicity
claim. A successful later native readback may qualify its stated recovery
boundary while the original failed fence remains a negative-control witness.
Observed SDK/server metadata drift during recovery must remain a separate
path-qualified comparison result, with both raw captures retained; it cannot
support a claim that all native properties stayed unchanged or justify weaker
adapter fences. Public receipts must retain that distinction. Private native snapshots, host
identifiers and account-tagged temporary thumbnail URLs are not public assets.

The separate host completion validator now requires fifteen source-bound
preview/cycle pairs and the six-renderer process/documents/store witness. Its
presence and unit tests do not close that gate while Miro cases or final assets
are missing. Remaining closure requires final catalog rebuild/reproducibility,
full native/browser/installed-package tests, desktop/mobile/keyboard selection
review, clean Linux CI, exact served asset hashes and publication evidence.

The [v0.3.0 candidate notes](../05-deploy/release-notes-v0.3.0.md) and
[publication checklist](../05-deploy/deployment-checklist-v0.3.0.md) are prepared.
Final completion, Linux CI, publication date and archive/served hashes remain
unestablished by this continuation record.

### Final local host-matrix review — 2026-10-31

The refreshed generated catalog passes an independent call to
`verifyHostCompletion`: six corpus cases, five shared-source cases, fifteen
actual host preview/cycle pairs, eighteen gate-counted renders (the fifteen host
images plus three portable renders for the same-source six-target witness),
and zero issues. The opaque witness remains an explicit refusal. This is local
evidence; final CI, public delivery and release archive verification remain
separate gates.

All five Miro cases independently pass `verifyMiroCase` against the private
actual stage captures and unchanged source files. Process/documents/store has a
clean cycle. Nested uses later read-only restore verification; Frames, Curved
and Network record later read-only update and restore verification. Every
interrupted immediate fence stays separately recorded with cause codes and a
receipt digest; no automatic write retry or atomic-board claim is introduced.
Curved and Network use fresh sequential lineages after an earlier interleaved
attempt correctly refused. Those earlier attempts do not qualify the new cycle.

The actual unowned metadata-drift counts are 17 for Nested and 26 for Frames;
other admitted transitions have zero qualified drift. The total is 43, not an
assertion that all native properties were unchanged. Full private before/after
captures retain timestamp, empty-presence and connector-order differences;
public receipts expose qualified counts and keep source losses. Unknown changes
and missing prior objects still refuse. Native style/movement and restored
semantic endpoints are checked separately.

The [PowerPoint](../../../fixtures/renderers/powerpoint/preview-receipt.json),
[Slides](../../../fixtures/renderers/google-slides/preview-receipt.json) and
[Miro](../../../fixtures/renderers/miro/preview-receipt.json) receipts expose all
five source/profile/model/mapping identities each. Actual Mac PowerPoint UI
cycles remain distinct from LibreOffice images and native-only preview layout
variants; Slides evidence names actual API transport without an editor-UI claim.
The reviewed Miro images contain only isolated synthetic objects.

The final bounded regression passes 28 tests/103 assertions covering host
completion, provenance/cleared-loss failures, recovery admission, capture fences
and PowerPoint single-endpoint reconnection. The final PowerPoint layout
provenance correction now records LibreOfficeDev 26.8.0.0.alpha0
`2c87e51eeaa2b413ff4ae097b2705eea1995d8e5` and admits the two exact
artifact-bound [native-open attestations](../../../fixtures/renderers/powerpoint/preview-layout-open-attestations.json).
Its missing/duplicate/mismatched controls pass two tests/seven assertions, and
the independent host-matrix gate passes again after the correction. No remaining
release-blocking defect was found in this bounded source/evidence review.

The final full local suite passes 424 tests/13,141 assertions, with those two
subsequent attestation tests also passing. Root has verified source checks,
typecheck, all six continuation native runners, public Chromium and installed
Bun/Node consumers. Final UI receipts pass all 214 SVGs, 53 examples/22 forms and
six-target desktop/mobile inspection, including Miro JPEG decoding. Repeated
catalog-byte verification passes: 53 items, 214 renders, 53 complete examples,
22 complete forms, and byte-identical repeated builds. Clean Linux CI, archive digests and served
hashes remain pending; this is a candidate review approval, not publication.
