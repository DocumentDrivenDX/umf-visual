---
ddx:
  id: TP-001
  type: test-plan
  activity: test
  authoring:
    home: repo
  links:
    - id: US-093
      kind: informed_by
    - id: visual.architecture
      kind: informed_by
---

# Visual library test plan

## Strategy

**Goal**: prove that extracting #62 preserves vocabulary behavior while replacing
private core imports with a released SDK and independently installable package.
US-094 adds bounded native interchange, retained companions and explicit loss.
**Out of scope**: rendering quality, authoring the definition in `umf.metamodel`, arbitrary native
syntax and broad runtime/version equivalence beyond CONTRACT-086.

## Framework Selection & Cost

| Layer | Framework | Justification | CI Time Impact | Maintenance Burden |
| --- | --- | --- | --- | --- |
| Contract/integration | Bun tests | Reuse original corpus and semantic corruptions | Measure in CI | Existing suite |
| Boundary | TypeScript AST and negative controls | Prove private imports are refused | Small local parse | Small checker |
| Package integration | Packed temporary consumer | Exercise distribution rather than source aliases | Dependency installation | One consumer |
| Browser integration | Playwright Chromium | Exercise public vocabulary and interchange APIs | Browser startup and bundle | One harness |
| Native syntax oracle | Graphviz, Mermaid parser, pinned Lini WASM | Independently accept emitted syntax | Record measured execution only | Versioned tooling outside source |

**Cost/benefit summary**: reuse the broad vocabulary corpus; add tests only for
changed distribution and runtime boundaries. No coverage percentage is claimed.

## Critical Paths (P0)

1. Original vocabulary tests pass using released @umf/core.
2. Build and declarations support an installed consumer with no sibling checkout.
3. Chromium validates/round-trips the corpus and performs an isolated edit.
4. Outputs generated from the schema are current, checked without writing, and
   portable source has no private core imports.
5. US-094 supported mappings retain identity and meaning; strict policy refuses losses.
6. The whole document/source companion survives serialization; stale or forged replay refuses.
7. Malformed and oversized inputs refuse atomically, retaining source.
8. Independent native engines accept their declared output subset.

## Acceptance Criteria Layer Allocation

| AC class / source | Story Test Plan | Primary Layer | Why this layer |
| --- | --- | --- | --- |
| US-093-AC1 through AC5 | Original named tests, amended for the review changes | Bun integration | Validation, unknowns, edits, advice and early-year dates |
| US-093-AC6 | Exact multiplicities and field ids | Bun integration | Reference semantics and round trips |
| US-093-AC7 | Generated outputs and schema mutation | Bun unit | Single authored definition |
| Public dependency/distribution | Extraction plan | Packed consumer integration | Changed package boundary |
| Browser portability | Extraction plan | Chromium integration | Changed independent browser build |
| Forbidden dependencies | Extraction plan | Boundary tests | Direct negative controls |
| Native meaning, identity, policy, source retention/replay and limits (US-094) | TD-094 and CONTRACT-086 | Bun public API integration | Distinct expected semantic and negative assertions |
| Portable public interchange (US-094) | TD-094 | Chromium integration | Real browser execution of built exports |
| Native emitted syntax (US-094) | TD-094 | Independent native engine | Separate parser/compiler from library parser |

## Secondary Paths (P1-P2)

Add versioned native parser/compiler tests when adapters exist.

## Test Data Strategy

Keep original inventory/form fixtures and fictional sources byte-equivalent to
their pinned upstream snapshot. The external upstream fixture generator is not
available here; no regeneration claim is made.

## Known Gaps

The definition is authored as JSON Schema, not yet in `umf.metamodel`; semantic rules
stay handwritten and are listed in CONTRACT-083 (Authority). Native interchange claims are limited to CONTRACT-086 subsets and recorded
native engine versions. Layout equivalence and all other Mermaid families remain
unqualified. Native parser acceptance does not establish semantic equivalence.
No hosted CI result is inferred from local execution. Source import checks do
not certify runtime-computed imports, arbitrary cycles or all semantic boundaries.

## Build Commands

```sh
bun run check:source
bun run typecheck
bun test
bun run build
bun run test:package
bun run test:browser
```

**Blocking gate**: all extraction checks pass, receipts name runtime versions,
and no private/sibling dependency appears in the distributed library.

## Diagnostic Test Strategy (when applicable)

Test output and compact receipts record commands, observed outcomes and limits.
OTel service/receiver integration is outside the library bootstrap.

## Interchange Test Data and Evidence

Use small authored directed graphs and entity fixtures with explicit expected
identities/cardinalities. Include case/punctuation collisions, parallel edges,
styles/directives/unknowns, undirected lines, ER identifying distinctions, missing
cardinalities, invalid endpoints, delimiters/Unicode and 16-node input. Round-trip
assertions must compare expected meaning, not only adapter output against itself.

Serialize and reload the entire `{document,source}` pair. Change a label and forge
only its baseline; exact replay must still refuse. Change retained text/options
and test mismatch refusal. Strict failures retain exact source strings.

Oracle receipts name executable/package/runtime versions, fixtures, direction,
outcome and bounds. Graphviz syntax checks, Mermaid parsing and Lini WASM render
acceptance are separate from browser portability. Unavailable oracles are explicit
qualification gaps, never inferred passes.


## Visual Catalog Verification

FEAT-036/US-095 add a static demonstration boundary. STP-095 owns per-AC tests:
build-data integration proves corpus coverage, status parity and determinism;
independent engines prove observed SVG generation; real Chromium proves discovery,
source comparison, deep links, keyboard operation and a 375px layout. A successful
export and a successful render remain separate observations.

The main corpus is enumerated from fixture definitions; canaries are additional
and cannot pad coverage. The matrix includes every target even when unsupported.
Native-render failure is a visible result, while missing engines or missing
sources block a fully qualified catalog build. Existing library/browser/package
checks remain required because the site demonstrates the public facade.


## Existing-field Loss Reduction

The first follow-on mapping wave uses existing fields only: Visual.title through
Mermaid native frontmatter, and VisualNode.detail through DOT tooltip/Lini card
hint. Bun tests must assert the actual text/mapping values, absence versus empty
cases, safe refusals, unknown metadata, native default/override behavior and
strict policy. Independent native output checks must inspect actual SVG title/
tooltip content for quotes, backslashes, Unicode, newline/whitespace and supported
escapes. Self-roundtrip alone cannot establish native value preservation.

Rebuild the complete language/example catalog and compare path-level loss counts.
Remaining loss diagnostics, especially Lini field hints, status/role, grouping,
layout and unimplemented forms, stay explicit. A sidecar alone cannot justify
removing a projection-loss report. Adapter profile versions change independently
of the unchanged visual vocabulary version.
