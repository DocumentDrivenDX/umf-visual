---
ddx:
  id: visual.release.v0.6.0
  type: release-notes
  activity: deploy
  authoring:
    home: repo
  links:
    - id: FEAT-034
      kind: references
    - id: FEAT-036
      kind: references
    - id: CONTRACT-083
      kind: references
    - id: CONTRACT-089
      kind: references
    - id: visual.example-completion-plan
      kind: references
---

# umf-visual v0.6.0

## Release Scope

Version 0.6.0 targets the GitHub package archive and Pages microsite, prepared
2026-11-05 by the repository maintainers. The publication receipt records the
passing main commit, workflow, archive digests and deployed-file verification.
These notes describe the bounded release scope; they are not a publication receipt.

## Audience and Channels

Semantic producers and browser consumers receive ESM, declarations, versioned
schemas and pinned Lini assets through the GitHub release archive. Diagram authors
can inspect sources, native output and review evidence on the microsite.

## Highlights

- Explicit visual model 1.4.0 is released and frozen.
- Source-backed native presentation routes across the inventory and form examples.
- New Lini views for metrics, timelines, roadmaps, comparisons, state machines,
  nested structures, tiered zones and flat sequences.
- A reviews site that shows each example's source, native output and evidence.

## Changes and Fixes

Explicit model 1.4.0 adds a typed `process` role for nodes and sequence
participants, optional per-edge `routing: {kind: "curved" | "straight"}` intent,
`document` and `multiple-documents` shapes, circular container composition and
independent plain-text annotations. Absent routing stays unspecified. The 1.0.0
through 1.3.0 schemas and interpretation remain frozen; 1.3.0 now ships from
`spec/extensions/visual/1.3.0/`.

The presentation compiler renders bars, dated statistics, meters, ratings,
multi-series trends, release-history timelines, categorical roadmaps,
before/after tables, comparison matrices, authored state machines, nested and
tiered structures, circular networks, flat lifecycles and self-call sequences.
Each view binds its labels and marks to actual native drawing elements, with
negative controls that alter those elements while keeping matching text elsewhere.

The HELIX, Beacon and template examples now carry their source-backed
responsibilities, walkthrough notes, SQL constraints, deployment tiers and
participant provenance. Graphviz output keeps cluster captions clear of routed
edges, chooses legible defaults for pipelines without layouts and improves
decision-branch typography. Lini packs multiline DAG cards and aligns entity fields.

`build:reviews`, `test:reviews` and `test:site:reviews` build and verify the
reviews pages. Opaque Miro witness preservation and refusal are documented.

## Breaking Changes and Required Actions

None for existing documents. Default authoring remains visual 1.0.0 and the
no-argument upgrade still selects 1.1.0. Select 1.4.0 explicitly for the new
concepts. Editable interchange and host profiles keep their model-version bounds
and refuse 1.2.0 through 1.4.0 inputs until their mappings are qualified.

The `./schema/1.3.0` and `./manifest/1.3.0` exports now resolve to the
versioned 1.3.0 directory; their content is unchanged. `./schema/1.4.0` and
`./manifest/1.4.0` are new.

## Migration or Rollback Guidance

Install the public `documentdrivendx-umf-visual-0.6.0.tgz` archive and verify it
against `SHA256SUMS` and the publication receipt before updating a pinned
dependency. Consumers may retain the v0.5.0 archive. A Pages rollback does not
modify authored UMF documents or external host files.

## Known Issues and Support

The package still carries every released model version. Collapsing to a single
current spec is planned as a breaking change for a later release.

Presentation output does not establish editable round trips. The example catalog
is a finite evidence cohort, not a claim of universal visual or interchange
fidelity. Renderer font substitution is tested on macOS and Linux, not guaranteed
byte-identical across every viewer. The v0.5.0 strict-CSP worker boundary is unchanged.

## References

- [Library usage](../../../README.md)
- [Presentation contract](../02-design/contracts/CONTRACT-089-presentation-rendering.md)
- [Visual model contract](../02-design/contracts/CONTRACT-083-visual-vocabulary.md)
- [Execution and publication gates](../04-build/example-completion-plan.md)
- [Live microsite](https://documentdrivendx.github.io/umf-visual/)
