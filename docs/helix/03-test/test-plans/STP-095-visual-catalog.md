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

## Executable Proof

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

1. Finalize shared catalog data shape and enumerate fixture identities.
2. Generate matrix/native artifacts through public APIs and independent engines.
3. Build discovery/comparison UI against that data contract.
4. Run data/native/Chromium checks and inspect desktop/mobile screenshots.

Completion requires passing evidence for all ACs and real source/native versions.
No fake drawing may fill an unsupported target. Native/build dependencies remain
outside portable library source. Hosting success is verified separately from the
local static artifact and may not be inferred from a local build.

## UX Coverage

| Pattern | Disposition | AC IDs or Reason | Evidence |
| --- | --- | --- | --- |
| navigation | covered | US-095-AC4, US-095-AC5, US-095-AC8 | Planned Chromium checks |
| keyboard-overlays | covered | US-095-AC6 | Native control/focus checks; no modal required |
| async-actions | covered | US-095-AC3 | Catalog/image loading and failure checks |
| forms | covered | US-095-AC4 | Labelled search and filter controls |
| data-states | covered | US-095-AC3, US-095-AC4 | Unsupported, failure, empty, selected and loaded states |
| destructive-actions | not-applicable | Static read-only catalog has no mutation/destruction action | Source review |
