---
ddx:
  id: visual.deploy.v0.3.0
  type: deployment-checklist
  activity: deploy
  authoring:
    home: repo
  links:
    - id: visual.example-completion-plan
      kind: informed_by
    - id: CONTRACT-085
      kind: references
    - id: CONTRACT-088
      kind: references
    - id: STP-095
      kind: references
---

# Deployment Checklist: umf-visual v0.3.0 candidate

## Release

Candidate GitHub archive release and conformance-gated static Pages publication.
Final commit, release date, workflow run, archive digests and served hashes are
not yet established. **Hold publication while any gate below is open.**
The [candidate notes](release-notes-v0.3.0.md) describe scope; the
[execution record](../04-build/example-completion-evidence.md#p8-p14-continuation-review--2026-10-31)
retains partial observations and the earlier published closure.

## Before Deploy

- Review the final diff and the explicit [P10-D fulfillment disposition](../04-build/example-completion-plan.md#p10-d-fulfillment-audit-before-merge--2026-10-31): its DOT reduction outcome remains unmet. Do not label this cut all-plan completion.
- Review CONTRACT-085/087/088; retain frozen 1.0.0,
  the 53-source manifest, six integration witnesses and opaque-case refusal.
- Complete host evidence before the catalog build; do not perform live host
  writes in CI. Keep credentials, raw snapshots, private object IDs and temporary
  account-tagged image URLs out of public assets.
- Verify real renderer/version/source/artifact/capture tuples. Distinguish
  PowerPoint UI proof from LibreOffice images, Slides API from UI activity, and
  Miro clean cycles from interrupted operations with later read-only recovery.
- Confirm final package/profile versions, all required relative asset paths,
  repository-owned baseline fixture and static site entry/data files are present.
  No runtime secrets/configuration are required by the static site.
- Check the actual passing workflow's Pages deployment principal/environment
  before claiming delivery. Main-only workflow configuration alone is not an
  observed successful publication.

## Validation Gates

| Gate | Current decision | Required exit evidence |
| --- | --- | --- |
| Source and portable package | Local full suite424/13,141 plus2 attestation tests, browser and packed consumers pass; final CI cut pending | `check:source`, typecheck, full Bun tests, build, real Chromium and installed Bun/Node package checks for exact candidate |
| Native semantics/geometry | Six continuation native probes pass locally; final cut pending | Existing native/profile/layout gates plus new DOT/Lini/Mermaid probes; same source/model/mapping identities and readable actual previews |
| Loss accounting | Measured 23-incidence Lini title reduction; final ledger pending | Unchanged fixture hashes, ordinary629/792/530 census, raw/normalized/annotated/host populations distinct; no loss removal by sidecar or normalization |
| Fifteen host pairs | Local independent gate passes: fifteen cycles, eighteen gate-counted renders, zero issues | `bun scripts/catalog/verify-host-completion.ts` reports complete, five common cases, fifteen actual previews and fifteen qualified cycles; exact-source six-renderer process witness also passes |
| Recovery qualification | All five private Miro verifications pass; forty-three explicit drift entries across Nested/Frames | Original interrupted receipts retained; later read-only agreeing captures and source/native preservation proven; exact drift exceptions visible; no retry/atomicity claim |
| Catalog and site | Final provenance and desktop/mobile six-target UI pass;214SVG/53examples/22forms; repeated build check running | Build/verify catalog, repeated byte-reproducibility check, selected53/22 gate, all claimed assets hashed; desktop/375px/keyboard/deep-link/broken-asset browser checks |
| Clean Linux CI | Pending | Passing exact-commit conformance workflow including the new host-completion gate; no ignored local cache prerequisite |
| Archives and public delivery | Pending | Tested package archive and SHA256SUMS, unchanged prior release; served catalog/integration JSON and every preview/receipt hash equal passing Pages artifact |

## Rollout Stages

| Stage | Action | Exit condition |
| --- | --- | --- |
| Candidate | Finish source-bound host receipts and final local checks; update evidence without deleting failed observations | All local gates pass; final diff/review and notes agree with actual support |
| Reviewed cut | Root commits/opens review and runs clean CI | Exact cut passes conformance, host matrix and visual/site checks; no release claim from a local-only result |
| Main and Pages | Merge through normal review and deploy that conformance artifact | Passing main workflow; public JSON and asset hashes match that artifact |
| Release | Root publishes v0.3.0 from the verified cut with tested archive and checksums | Release tag/asset digests verified; notes/evidence updated with actual links/date/hashes |

## Rollback

Keep the last verified release tag/assets and working Pages artifact. A failed
conformance run must not deploy its candidate. If a published candidate fails
source/hash, rendering, loss or privacy checks, hold release delivery and restore
the last verified static artifact through the main conformance workflow. Retain
the failed cut/receipts for diagnosis; do not rewrite old release history.

| Signal | Threshold | Immediate action |
| --- | --- | --- |
| Missing/stale preview or cycle; cleared loss; unsupported case marked successful | Any occurrence | Hold merge/publication, correct and rerun the exact affected gates |
| Private content/temporary host URL exposed | Any occurrence | Stop publication; remove the exposed artifact through the normal review/deploy path and verify the served replacement |
| Served JSON/assets differ from tested artifact; broken selection or unreadable preview | Any required case | Hold release, restore the verified site cut if necessary, then repeat hash/browser checks |

No rollback mutates external native host documents or retries interrupted writes.
Those need their own preserved receipts and explicit recovery under CONTRACT-088.
