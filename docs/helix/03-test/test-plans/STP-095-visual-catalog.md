---
ddx:
  id: STP-095
  type: story-test-plan
  activity: test
  authoring:
    home: repo
  links:
    - id: US-095
      kind: informed_by
    - id: CONTRACT-085
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-087
      kind: informed_by
---

# Story Test Plan: STP-095 visual catalog

## Story Reference

**User Story:** [[US-095-visual-catalog]]. **Technical Design:** [[TD-095-visual-catalog]].
**Contract:** CONTRACT-085. **Project Test Plan:** TP-001.
The feature is FEAT-036; CONTRACT-086 supplies the underlying adapter behavior.

## Scope and Objective

Prove complete corpus discovery, honest export/render distinctions, usable
comparison and a reproducible static artifact. Existing native/library tests
remain required; a passing catalog does not expand adapter support.

## Acceptance Criteria Test Mapping

The named tests are planned implementation obligations until executed. Each
covering test must cite its AC using the indicated `@covers` annotation.

| AC ID | New or Existing Test(s) to Create or Run | Asserted Behavior (what the test verifies) | AC-ID citation | Primary layer | File or command |
| --- | --- | --- | --- | --- | --- |
| US-095-AC8 | Actual language reference | Exact schema/hash and actual kind/form table; primary reference is distinct from examples | `@covers US-095-AC8` | Data and Chromium integration | Catalog data tests and browser checks |
| US-095-AC1 | Corpus coverage and matrix | Exact fixture set, all forms and three targets; canaries separate | `@covers US-095-AC1` | Bun build-data integration | Catalog data tests |
| US-095-AC2 | Export-result parity and comparison | Status/source/diagnostics/maps equal actual selected public API result | `@covers US-095-AC2` | Bun build-data integration | Catalog data tests |
| US-095-AC3 | Native evidence and failure display | SVG hashes/engine versions valid; export success and render failure remain distinct | `@covers US-095-AC3` | Native/build integration | Catalog generator and native canaries |
| US-095-AC4 | Search and filter recovery | Composed filters update matches/counts; clear resets empty state | `@covers US-095-AC4` | Chromium UI | `scripts/catalog-ui-browser.ts` |
| US-095-AC5 | Selection deep links | Reload restores selected item/target; invalid selection recovers | `@covers US-095-AC5` | Chromium UI | `scripts/catalog-ui-browser.ts` |
| US-095-AC6 | Keyboard and narrow screen | Keyboard discovers/opens/switches; focus visible; 375px page has no horizontal overflow | `@covers US-095-AC6` | Chromium UI | `scripts/catalog-ui-browser.ts` |
| US-095-AC7 | Deterministic rebuild | Input/result/render identities match across unchanged builds; unsupported targets lack source/SVG | `@covers US-095-AC7` | Build integration | Repeated catalog build and hashes |
| US-095-AC9 | Independent renderer/profile/view selection | Explicit native links stay native; qualified renderer switches preserve intent or show unavailable; exact profile and view survive reload/keyboard selection | `@covers US-095-AC9` | Chromium UI | `scripts/catalog-profile-ui-browser.ts`, `tests/catalog/ui.test.ts` |
| US-095-AC10 | Six-target evidence matrix and native cohorts | Same-source six-target witness has six actual previews/artifacts; five-case host cohort has fifteen actual previews and qualified repeated cycles; plans/converters/host edits remain distinct | `@covers US-095-AC10` | Build, native host and Chromium | Catalog/integration data tests, renderer evidence verifier, host cohort receipts, catalog browser harness |
| US-095-AC11 | Current loss ledger parity | Current ordinary/variant/host results match source APIs; normalization preserves raw diagnostics and cannot count as native mapping gain | `@covers US-095-AC11` | Bun data integration | `tests/catalog/loss-ledger.test.ts`, catalog evidence tests |
| US-095-AC12 | Preview input/revision fences | Changed source/profile/model/mapping, artifact/capture hash or host revision invalidates image qualification; missing assets and unavailable host remain explicit | `@covers US-095-AC12` | Build and Chromium negative controls | Renderer evidence verifier, `scripts/catalog-ui-browser.ts` |

## Executable Proof

### Active full-format gate

INT-10/11 and CAT-15 supersede the earlier suitable-target completion ceiling.
Qualify all 159 unchanged example/format pairs through explicit `/full/1`
profiles: strict export with no loss, actual named-engine rendering, complete
document readback and meaningful previews of all 22 forms in each format.
Approximation evidence is separate and cannot clear an omitted path.
Apply the same gate to the five common integration documents in each portable
format: 15 additional pairs, 174 total. Verify canonical full-route selection
in the six-target matrix, explicit compatibility access, exact complete/focused
input provenance and byte-identical existing host captures/receipts.

For each family, independently edit a native label/endpoint/value and an
owner-associated typed field, then import after JSON/YAML persistence. Test
empty/null/absent/order, unknown-content structure, conflicting/duplicate native
identities, hostile text, forged coverage/baselines and stale exact-source replay.
Check native AST completeness and actual SVG meaning separately from portable
self-roundtrips. Packed consumers and real Chromium must use the public API.
Compatibility profile sources, receipts and diagnostics must remain unchanged.

### Primary Commands

```sh
bun run build:catalog
bun run build:site
bun run test:site
bun run check:source
bun run typecheck
bun test
```

The implementation plan records actual command aliases and observed evidence.
Catalog UI checks live in `scripts/catalog-ui-browser.ts` and `tests/catalog/ui.test.ts`.
Data checks compare current source enumeration and selected facade outputs, not
hardcoded status totals. Keep generated verification receipts separate from
source-level intent; do not label planned tests as passing evidence.

### Coverage Focus

P0: actual language reference and complete example/target matrix, truthful losses, native-render provenance,
unsupported visibility, working comparison/navigation and safe source display.
P1: long labels/code, small-screen panels, missing images and catalog-load errors.

## Data and Setup

| Need | Source/strategy |
| --- | --- |
| Main corpus | All actual definitions under `fixtures/visual/`; current inventory is 50 definitions across 22 forms |
| Canaries | Repository-owned small graph/entities examples with explicit origin |
| Native engines | Actual Graphviz, Mermaid and pinned Lini runtimes; record separate versions |
| Browser | Real Chromium against assembled `dist-site/`, with desktop and 375px viewports |
| Error states | Deliberate missing catalog/image and a selected render failure without fabricated success |

## Edge Cases and Failure Modes

A timeline/metric with no supported target remains searchable and displays its
original source. A native render failure retains generated source and diagnostics.
Source text resembling markup remains inert. Long JSON and oversized SVGs scroll
inside their panels. No search matches provides a clear reset action.

## Build Handoff

### P8-P14 executable cohorts

Start with `process-documents-store` rendered through all six target families,
including actual host images. Then exercise all five shared integration cases
against each of PowerPoint, Slides and Miro: fifteen previews and fifteen
qualified repeated cycles. A supported semantic cycle includes native label
edit and an eligible attached-endpoint edit, native style/movement, fenced
import, serialized binding, a different UMF-owned update and actual native
readback. A structural operation outside the profile must explicitly refuse.
No-op/synthetic transport alone cannot satisfy the native cohort gate.
Record whether edits used UI or direct host API/SDK and whether the adapter
transport ran live or against trace replay. Do not promote API edits into UI
interaction evidence or offline transport into live execution.

For each pair assert source/profile/model/mapping identity, image input
artifact/capture hash, engine/runtime, positive dimensions, visible node/edge
text, arrow/endpoints and readable geometry. Keep native-only properties and
unrelated items unchanged; inspect captions and containment at useful zoom.
PPTX converter renders and actual PowerPoint application proofs are separate;
Slides/Miro captures must use isolated synthetic content. Stale or unavailable
host evidence leaves a pair open, not passed. Opaque-only refusal persists.

Portable profile tests cover complete-document native readback, annotation
carrier edits, version-specific fields, exact replay and stale/forged replay.
Native probes must independently justify Lini title/flow/pipeline/entity slots
and Mermaid sequence/ER eligibility. Unknown syntax/residual attributes, missing
or duplicate carriers, IDs/ports and unknown model/profile versions refuse.
Tests cite the applicable AC, but a citation alone is not passing evidence.

1. Finalize shared catalog data shape and enumerate fixture identities.
2. Generate matrix/native artifacts through public APIs and independent engines.
3. Build discovery/comparison UI against that data contract.
4. Run data/native/Chromium checks and inspect desktop/mobile screenshots.

Completion requires passing evidence for all ACs and real source/native versions.
No fake drawing may fill an unsupported target. Native/build dependencies remain
outside portable library source. Hosting success is verified separately from the
local static artifact and may not be inferred from a local build.

## Example Completion Increment

FEAT-035 INT-08/09, FEAT-036 CAT-09/10 and CONTRACT-087 add the owner-selected
release gate: every unchanged current example has at least one suitable strict,
complete target with independent native readback and a faithful preview. Preserve
native defaults and historical receipts; profile variants do not replace them.

| Gate | Required new evidence | Primary layer |
| --- | --- | --- |
| Field coverage | Exact typed annotation readback; per-pointer presence/order/member assertions; no parent-prefix suppression | Portable adapter and independent native |
| Edited recovery | Visible value edit adopted; missing/copied carrier, type/path conflict and stale receipt refuse atomically | Bun and actual Chromium |
| Complete corpus | 53 unchanged current source hashes, separate original/canary counts, selected strict target for each and all 22 forms | Catalog build/release |
| Faithful previews | Exact text/numbers/units/endpoints/order/membership; readable owner legends, no clipping/overlap; full and focused views | Native witnesses and browser visual review |
| Honest variants | Explicit annotation/native distinction, unchanged native targets, stable legacy and profile links | Catalog data and UI |

Tests MUST use actual current corpus enumeration. A nonempty SVG, source capture,
or self-roundtrip alone cannot satisfy these gates. The
[example completion plan](../../04-build/example-completion-plan.md) sequences
the packages and preserves post-release integration work as a later milestone.

## UX Coverage

| Pattern | Disposition | AC IDs or Reason | Evidence |
| --- | --- | --- | --- |
| navigation | covered | US-095-AC4, US-095-AC5, US-095-AC8, US-095-AC9 | Chromium target/profile/view selection and reload checks |
| keyboard-overlays | covered | US-095-AC6, US-095-AC9 | Native control/focus checks; no modal required |
| async-actions | covered | US-095-AC3, US-095-AC12 | Catalog/image loading, stale evidence and failure checks |
| forms | covered | US-095-AC4 | Labelled search and filter controls |
| data-states | covered | US-095-AC3, US-095-AC4, US-095-AC10, US-095-AC11, US-095-AC12 | Projection/render/cycle, current loss, unsupported, unavailable, stale, empty and loaded states |
| destructive-actions | not-applicable | Static read-only catalog has no mutation/destruction action | Source review |
