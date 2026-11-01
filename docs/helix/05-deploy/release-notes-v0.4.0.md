---
ddx:
  id: visual.release.v0.4.0
  type: release-notes
  activity: deploy
  authoring:
    home: repo
  links:
    - id: FEAT-035
      kind: references
    - id: FEAT-036
      kind: references
    - id: CONTRACT-085
      kind: references
    - id: CONTRACT-086
      kind: references
    - id: CONTRACT-087
      kind: references
    - id: visual.example-completion-plan
      kind: references
---

# umf-visual v0.4.0

## Release Scope

Version 0.4.0 targets the GitHub release archive and public Pages catalog.
Notes prepared 2026-11-01; repository maintainers own publication.

The three explicit `umf.visual.<format>.full/1` profiles provide complete-document
interchange for DOT, Mermaid and Lini. They prefer qualified existing native
diagrams and use labelled primitive compositions elsewhere. The original 53
examples and 22 forms remain the qualification corpus. Publication requires
all 159 example/format pairs and 15 complex integration/format pairs to pass strict whole-document readback, native
rendering and scoped SVG witnesses, followed by Linux CI and served-site checks.
The release's publication receipt records the actual passing workflow, archive
digests and served-site verification; this source document is not that receipt.

## Audience and Channels

Library consumers receive browser-compatible ESM and declarations through the
GitHub archive. Diagram authors and adapter maintainers inspect examples,
native sources and qualification receipts through the microsite and repository.

## Highlights

- Complete portable routes for all 53 catalog and five complex integration examples.
- Native diagrams where qualified; meaningful primitive compositions elsewhere.
- Focused previews, complete downloads and explicit visual approximations.

## Changes and Fixes

Primary diagram labels and connector topology supply their own source values.
Remaining properties, including unknown extension content, use visible typed
rows. A property appendix alone cannot qualify a missing drawing. Independent
native readers check values, structural presence, ordering, source identities
and actual drawing elements. Shape, layout and calibrated-axis approximations
remain explicit and separate from missing meaning.

The catalog makes these full routes the canonical comparison, with focused
previews, complete native renders and downloadable interchange source. Each
receipt identifies the requested profile and the actual source grammar,
mapping version and coverage model. Narrower released native/annotation
profiles keep their existing behavior and remain available for compatibility
inspection, including their historical diagnostics.

Native-first qualification excludes known source/render fidelity failures in
the pinned mappings: escaped DOT entity or flow-edge captions, case-changing Lini chart
categories and flow hubs outside the qualified native Lini layout subset.
These inputs use the complete primitive route. Those selection boundaries are
not claims that the target format cannot represent the requested content.

Generated captions select supported primitives directly. Approximation reports
describe changes to authored roles or diagram geometry, rather than an internal
caption style selected by the implementation. SVG checks now bind plotted
points, timeline markers, entity field rows and drawn connectors to their actual
native carriers; matching text elsewhere cannot substitute for those objects.

## Breaking Changes and Required Actions

No existing native or annotation profile is replaced. Library consumers select
the new full profiles explicitly. The microsite makes them canonical while
retaining compatibility profiles and exact older profile links.

## Migration or Rollback Guidance

Select `umf.visual.dot.full/1`, `umf.visual.mermaid.full/1` or
`umf.visual.lini.full/1` in `exportVisual` and `importVisual`. Inspect returned
`representation` and `approximations`, and store an imported document with its
source companion. Existing integrations can retain their current profile and
v0.3.0 archive. Reverting the Pages deployment does not modify native host files.

## Known Issues and Support

Exact retained-source replay requires independent reparsing and an unchanged
whole document. Preserving updates of retained full-profile presentation are
not qualified: they refuse explicitly. Regeneration requires omitting the
source companion. Unknown native constructs also refuse rather than disappear.
Admission is bounded to 256 KiB UTF-8 source, 10,000 typed scalar/container
records and 64 source nesting levels; individual native grammars can be stricter.

The browser-compatible ESM/declaration archive remains distributed through
GitHub releases. Existing PowerPoint, Slides and Miro APIs and captured host
evidence are unchanged by this release. No whole-language or arbitrary-host
losslessness is claimed.

See the [public API examples](../../../README.md#complete-examples-through-explicit-profiles)
and [execution evidence](../04-build/example-completion-plan.md).
