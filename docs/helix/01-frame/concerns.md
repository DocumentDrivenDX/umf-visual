---
ddx:
  id: concerns
  type: concerns
  activity: frame
  authoring:
    home: repo
  links:
    - id: visual.vision
      kind: informed_by
---

# Project Concerns

## Active Concerns

| Concern | Source | Areas | Why Active | Key Practices |
| --- | --- | --- | --- | --- |
| typescript-bun | assumption from imported source and user context | api, build | Portable library developed with Bun | Browser-compatible ESM; host APIs only in tooling |
| testing | shipped-default | all | Observable API contracts | Reuse upstream behavioral corpus and targeted boundary tests |
| verification | shipped-default | all | Extraction changes the consuming boundary | Released SDK, packed installation and real Chromium proof |
| modularity-and-encapsulation | shipped-default | all | Keep core, vocabulary, adapters and renderers independent | Minimal public imports; check:source in local hooks and CI |
| code-shape-ceilings | shipped-default | api, build | Handwritten source requires explicit size/complexity ownership | Existing upstream module is retained; adopt ratchets before feature expansion |
| preservation-and-compatibility | project-local, user instruction | api, adapters | Cross-format meaning must survive or be reported | Exact versions/subsets; original source and identity maps |

## Project Overrides

| Concern | Practice | Override | Authority |
| --- | --- | --- | --- |
| code-shape-ceilings | Greenfield source defaults | Treat the imported module as an extraction baseline; ratchet adoption remains a named follow-up, not a passing claim | User-directed move from #62; extraction plan |
| o11y-otel | Application/service signals | No hosted service, endpoint or GenAI operation exists; test/build receipts are the applicable diagnostic surface | Library architecture |

## Area Labels

- `area:api`: portable vocabulary and public library API.
- `area:adapters`: native format boundaries and conformance.
- `area:build`: packaging, generation and verification.

## Concern Conflicts

| Conflict | Resolution |
| --- | --- |
| Native fidelity vs neutral portability | Preserve native content and disclose projection loss |
| Extraction stability vs desired redesign | Keep the copied semantic baseline; govern later changes separately |

## Observability Applicability

Build/test receipts capture commands, runtime versions, outcomes and limits.
No OTel receiver integration is claimed or needed for this library bootstrap.

## Formal Methods Applicability

No formal-methods toolchain is selected. Invariant and negative-control tests
cover the extraction boundary; stronger methods can be scoped to future adapters.
