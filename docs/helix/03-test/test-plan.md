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

# Extraction test plan

## Strategy

**Goal**: prove that extracting #62 preserves vocabulary behavior while replacing
private core imports with a released SDK and independently installable package.
**Out of scope**: native-format interchange, rendering quality, authoring the
definition in `umf.metamodel` and broad runtime/version equivalence.

## Framework Selection & Cost

| Layer | Framework | Justification | CI Time Impact | Maintenance Burden |
| --- | --- | --- | --- | --- |
| Contract/integration | Bun tests | Reuse original corpus and semantic corruptions | Measure in CI | Existing suite |
| Boundary | TypeScript AST and negative controls | Prove private imports are refused | Small local parse | Small checker |
| Package integration | Packed temporary consumer | Exercise distribution rather than source aliases | Dependency installation | One consumer |
| Browser integration | Playwright Chromium | Exercise real browser registration/serialization/edit | Browser startup and bundle | One harness |

**Cost/benefit summary**: reuse the broad vocabulary corpus; add tests only for
changed distribution and runtime boundaries. No coverage percentage is claimed.

## Critical Paths (P0)

1. Original vocabulary tests pass using released @umf/core.
2. Build and declarations support an installed consumer with no sibling checkout.
3. Chromium validates/round-trips the corpus and performs an isolated edit.
4. Outputs generated from the schema are current, checked without writing, and
   portable source has no private core imports.

## Acceptance Criteria Layer Allocation

| AC class / source | Story Test Plan | Primary Layer | Why this layer |
| --- | --- | --- | --- |
| US-093-AC1 through AC5 | Original named tests, amended for the review changes | Bun integration | Validation, unknowns, edits, advice and early-year dates |
| US-093-AC6 | Exact multiplicities and field ids | Bun integration | Reference semantics and round trips |
| US-093-AC7 | Generated outputs and schema mutation | Bun unit | Single authored definition |
| Public dependency/distribution | Extraction plan | Packed consumer integration | Changed package boundary |
| Browser portability | Extraction plan | Chromium integration | Changed independent browser build |
| Forbidden dependencies | Extraction plan | Boundary tests | Direct negative controls |

## Secondary Paths (P1-P2)

Add versioned native parser/compiler tests when adapters exist.

## Test Data Strategy

Keep original inventory/form fixtures and fictional sources byte-equivalent to
their pinned upstream snapshot. The external upstream fixture generator is not
available here; no regeneration claim is made.

## Known Gaps

The definition is authored as JSON Schema, not yet in `umf.metamodel`; semantic rules
stay handwritten and are listed in CONTRACT-083 (Authority). No DOT/Mermaid/Lini adapter
is implemented here.
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
