---
ddx:
  id: visual.release.v0.2.0
  type: release-notes
  activity: deploy
  authoring:
    home: repo
  links:
    - id: FEAT-035
      kind: references
    - id: FEAT-036
      kind: references
    - id: CONTRACT-083
      kind: references
    - id: CONTRACT-085
      kind: references
    - id: CONTRACT-086
      kind: references
    - id: CONTRACT-087
      kind: references
---

# umf-visual v0.2.0

## Release Scope

Prepared notes for package 0.2.0. **Not yet released:** local checks and preview
review pass; Linux CI and publication remain pending. The repository
maintainer owns release; publication date, tag and archive checksums must be
recorded after these gates pass.

The candidate adds complete example projections through explicit readable
annotation profiles and versioned vocabulary corrections. Distribution remains
GitHub archives; package privacy prevents accidental npm publication. Pages
publishes the verified catalog artifact.

## Audience and Channels

Library and semantic-producer developers receive browser-compatible ESM,
declarations, frozen/default schemas and explicit 1.1.0 assets. Renderer authors
can compare native source, coverage and focused/complete previews in umf.visuals.
Release archives and checksums identify the cut independently of later Pages.

## Highlights

- Explicit DOT/Lini profiles preserve intrinsic native diagrams and additional
  registered meaning as editable, visible typed notes/cells.
- All 53 unchanged examples currently have a selected strict complete semantic
  projection; faithful previews for all 22 forms remain a release gate.
- Frozen vocabulary 1.0.0 defaults coexist with explicit 1.1.0 corrections and
  generated latest manifest/types.

## Changes and Fixes

Profiles `umf.visual.dot.annotated/1` and `umf.visual.lini.annotated/1` expose
explicit selection and per-pointer native/annotation coverage through public
import/export. Initial mapping version is 0.1.0 and model support is 1.0.0.
Native engines remain build/test dependencies outside the portable library.

DOT gains bounded flow, structural/entity, state and sequence views; Lini gains
bounded metric, timeline and comparison views. Whole-document native readback
and a canonical native-AST guard reject omitted native content. Qualified edits
are reparsed; stale/forged source replay refuses.

The catalog retains all 159 original native pairs and adds 106 profile
evaluations. Current selection is 43 DOT plus ten Lini examples, with zero
selected diagnostics. It separates qualified profiles from vanilla-native
support and offers focused/complete views, zoom, source, diagnostics and
identity/coverage inspection. Current output contains 178 SVG assets.

Refreshed tree/nested/sequence and Lini geometry checks pass locally. The final entity
connector spacing correction and all 22 form previews have passed local review.

Vocabulary 1.1.0 corrects early-year dates, changes size validity to a 500-node
bound with split advice, and adds exact multiplicities and stable field IDs.
The authored latest schema generates its manifest/types. Default aliases and
validation interpretation remain frozen 1.0.0.

## Breaking Changes and Required Actions

No implicit vocabulary migration or profile selection is introduced. Existing
native defaults and historical source interpretation remain. Select the new
profile explicitly for its additional representation. Select vocabulary 1.1.0
explicitly for creation/upgrade; these annotated profiles do not qualify it yet.

Persist `{document, source}` together for exact replay. Saving only the document
does not retain native bytes. Install the published archive and verify its
checksum once available; there is no npm publication.

## Validation

The final local suite passes 295 tests and 11,178 assertions, source/type checks
and packed Bun/Node consumers. Public Chromium covers complete readback,
persistence and stale replay for all 53 examples. Native evidence covers 43
Graphviz cases, ten pinned Lini cases and four Lini browser-geometry cases.
Receipt source/fixture hashes match current exports.

Native rendering and exact text remain separate from geometry approval; the
reviewed candidate has both.
Durable local receipts are linked from the milestone evidence. Linux CI and
archive checksums must be added at the release cut.
The [milestone evidence](../04-build/example-completion-evidence.md) records
commands, measured results and remaining blockers.

## Known Issues and Support

The model/profiles remain bounded; other target outcomes can still lose meaning
or refuse. Shared style/layout/ports and richer native relationships need
versioned work. Unknown presentation/structural edits can refuse under the
canonical subset. Annotations do not establish arbitrary host reconciliation,
use an opaque whole-document JSON carrier or make every property a built-in
DOT/Lini concept.

PowerPoint, Google Slides and Miro retain separately qualified integration/spike
scope. Sanitized complex Miro examples and broader edited integrations follow
this release. NodeNext declaration resolution remains limited by inherited SDK
declarations; Bundler resolution and packed Bun/Node runtimes are qualified.

## Migration or Rollback Guidance

Keep the prior archive pinned until the new archive/checksums are published.
Adopt profiles/versions explicitly and retain receipts with their original
interpretation. For site rollback, revert the affected source change on main
and rerun Library conformance to deploy the matching verified artifact. Never
relabel a changed document's old receipt.

## References

- [Example completion plan](../04-build/example-completion-plan.md)
- [Milestone evidence and release gates](../04-build/example-completion-evidence.md)
- [Annotation contract](../02-design/contracts/CONTRACT-087-readable-annotations.md)
- [Versioned integration](../04-build/visual-1-1-integration.md)
- [Publication workflow](../../../.github/workflows/ci.yml)
