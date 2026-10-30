---
ddx:
  id: visual.extraction-plan
  type: implementation-plan
  activity: build
  authoring:
    home: repo
  links:
    - id: visual.architecture
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Extraction and continuation plan

## Scope

The user authorized bootstrapping a sibling repository and moving umf.visual
from UMF #62, including a HELIX stack. Governing local artifacts are the vision,
architecture and TP-001. Imported CONTRACT-083 and US-093 own the copied semantics.

## Shared Constraints

Retain source attribution, vocabulary identity and imported artifact IDs. Depend
only on released public core APIs. Keep unrelated local UMF work untouched.
Extraction does not claim that proposed adapters or model generation exist.

## Implementation Slices

| Slice | Story / Area | Governing Artifacts | Depends On | Validation Gate | Notes |
| --- | --- | --- | --- | --- | --- |
| E1 | Extraction ownership | User instruction; source #62 | None | Source pin and license inventory | Preserve semantic source and corpus |
| E2 | Package boundaries | visual.architecture | E1 | check:source and negative controls | Public core dependency; pre-commit/CI |
| E3 | Distribution | TP-001 | E2 | Typecheck, build, tests, packed consumer | No deep imports or sibling alias |
| E4 | Browser portability | TP-001 | E3 | Real Chromium corpus round trips/edit | Record exact runtime/version |
| E5 | Repository and stack | visual.vision | E4 | Commit/push, remote files, HELIX validation | Independent repository; no package publication |

## Execution Contract

Implementation authorization is the user's repository-bootstrap request. Token
usage is not metered as a project budget; no numeric spending ceiling was given.
Execute the extraction slices, record actual checks and keep semantic expansion
separate. No tracker was selected.

## Continuation Evidence

See extraction-evidence.md for completed gates and runtime receipts. Next work:
Frame native adapter subsets, independent consumers and preservation contracts;
define the authoritative visual model in UMF; qualify generic constraint coverage;
then implement DOT/Mermaid/Lini profiles one at a time with source retention and
native parser/compiler oracles. The #62 review changes (early-year dates, size as
advice, exact multiplicities, field ids, generated shapes) are applied. Adopt code-shape ratchets before growing the inherited module.

## Optional Tracking

No external tracker mutation is requested. This plan owns the bootstrap sequence.

## Validation Plan

- Reuse US-093 coverage and verify the changed package/browser boundaries.
- Record installed-runtime evidence separately from source-level tests.
- Validate authored HELIX artifacts using the installed catalog.
- Review private imports, package contents, source pins and remaining claims.

## Risks and Rollbacks

| Risk | Impact | Response | Rollback |
| --- | --- | --- | --- |
| Upstream SDK dependency changes | Broken consumers | Pinned release and lockfile | Select previously verified release |
| Two visual authorities | Divergent definitions | New repo owns extraction; link from #62 | Do not merge duplicate implementation |
| Existing semantic limits hidden by movement | False interchange claim | Preserve known gaps and scoped evidence | No adapter claim until qualification |

## Exit Criteria

The independent repository contains the extracted implementation/corpus,
public SDK dependency, build/types, CI, scoped HELIX stack and provenance.
Local test, package and browser gates pass; commit/remote are verified.
No package release, upstream PR closure or vocabulary redesign is implied.

## Diagnostic Evidence Sequencing (when applicable)

Local receipts precede publication of extraction results. Hosted CI remains
separate evidence; do not label local passing checks as hosted CI success.
