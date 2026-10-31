# umf-visual project stack

This stack governs a system library. Producers and renderers are its consumers;
compatibility, preservation and portable behavior are its outcomes.

- [Vision](00-discover/product-vision.md) establishes the library's direction.
- [Research and provenance](00-discover/extraction-research.md) identifies source
  ownership, the dashboard precedent and inherited artifact links.
- [Concerns](01-frame/concerns.md) scopes quality work to a library.
- [FEAT-034](01-frame/features/FEAT-034-visual-vocabulary.md),
  [US-093](01-frame/user-stories/US-093-visual-vocabulary.md),
  [CONTRACT-083](02-design/contracts/CONTRACT-083-visual-vocabulary.md) and
  [TD-093](02-design/technical-designs/TD-093-visual-vocabulary.md) are the
  semantic authorities imported from #62, with their IDs/frontmatter, amended
  2026-10-30 for that PR's review (early-year dates, size as advice, exact
  multiplicities and field ids, the schema as the single authored definition).
  Their repository-location/ownership descriptions and inherited graph links
  refer to that source cut; extraction packaging is governed locally below.
- [Architecture](02-design/architecture.md) defines the public package boundary.
- [Test plan](03-test/test-plan.md) defines verification and its limits.
- [Extraction plan](04-build/implementation-plan.md) records bootstrap scope and
  the ordered work that remains after extraction.
- [Verification](04-build/extraction-evidence.md) records observed results.
- [Library workflow gap](04-build/library-workflow-gap.md) records the proposed
  upstream HELIX improvement without inventing a local methodology fork.

The installed HELIX catalog supplies templates and workflow definitions. It is
not copied here. [FEAT-035](01-frame/features/FEAT-035-native-interchange.md),
[US-094](01-frame/user-stories/US-094-native-interchange.md),
[CONTRACT-086](02-design/contracts/CONTRACT-086-native-interchange.md) and
[TD-094](02-design/technical-designs/TD-094-native-interchange.md) govern bounded
DOT/Mermaid/Lini interchange. The existing vocabulary semantics remain unchanged.
Extraction evidence establishes vocabulary behavior; native adapter qualification
requires its own versioned execution receipts.


[FEAT-036](01-frame/features/FEAT-036-visual-catalog.md),
[US-095](01-frame/user-stories/US-095-visual-catalog.md),
[CONTRACT-085](02-design/contracts/CONTRACT-085-visual-catalog.md) and
[STP-095](03-test/test-plans/STP-095-visual-catalog.md) govern the umf.visuals
catalog microsite. It compares original definitions, real export outcomes and
independent native render results across the complete fixture corpus.


The [visual-language source inventory](00-discover/current-state-inventory-visual-language.md)
distinguishes the current versioned language declarations from example instances and
identifies application-profile constraints requiring explicit future model design.

[Interchange and catalog execution evidence](04-build/interchange-catalog-evidence.md)
records native, packed-package, browser, catalog and reproducibility checks.

[First loss-reduction wave](04-build/loss-reduction-wave-1.md) records measured
title/description mappings, native character limits and the next worklist.

[Second loss-reduction wave](04-build/loss-reduction-wave-2.md) records native
cluster/sequence mappings, 13 additional renders and qualified remaining losses.

[Miro integration spike](02-design/spikes/SPIKE-011-miro-integration.md) and
[CONTRACT-084](02-design/contracts/CONTRACT-084-miro-network.md) govern the
bounded network adapter and native preservation extension. The
[implementation evidence](04-build/miro-integration.md) records actual Miro UI
edit/adoption, a 72-item native reproduction and scoped fidelity limits.

[Versioned review integration](04-build/visual-1-1-integration.md) qualifies the explicit 1.1.0 corrections and frozen released 1.0.0 defaults.

[PowerPoint integration spike](02-design/spikes/SPIKE-094-powerpoint-integration.md)
records an actual PowerPoint 16.114.3 export/edit/save/import round trip.
Bun and Chromium recover edited labels and a reconnected edge from embedded source;
native layout is retained separately. Structural edits and broader forms remain
unqualified.

[PowerPoint native conformance](04-build/powerpoint-native-conformance.md) records
the 16-node/24-edge network edit and the independently edited/reopened edge
caption, with sanitized package digests in its [evidence receipt](04-build/evidence/powerpoint-native-conformance.json).

[Miro editable live conformance](04-build/miro-editable-live-2026-10-30.md)
records the bounded editable-network import, native-preserving update and
sanitized revision/capture evidence. Its [receipt](04-build/evidence/miro-editable-live-2026-10-30.json)
contains only counts, hashes and logical source paths; the live board bindings
and screenshot remain private.

[Google Slides integration spike](02-design/spikes/SPIKE-001-google-slides.md)
demonstrates export, actual Google Slides UI label/movement edits, validated
import and a second native export for an adapter-owned flow/network diagram.
Bun/Chromium replays cover preservation and refusal; arbitrary native import and
structural edit reconciliation remain unqualified. The prototype is outside the public API.

[Readable annotation profiles](02-design/contracts/CONTRACT-087-readable-annotations.md)
govern optional typed native legends, coverage/readback and unchanged native
defaults. The [example completion plan](04-build/example-completion-plan.md)
sequences the confirmed release gate: every current example has at least one
suitable complete target and all 22 forms have faithful previews, followed by
sanitized complex Miro examples and expanded edited integrations.

[Example milestone evidence](04-build/example-completion-evidence.md) records
complete semantic/native readback and local preview approval, with Linux CI
and publication still pending. [Prepared v0.2.0 notes](05-deploy/release-notes-v0.2.0.md)
describe that candidate and its qualified scope.

The example milestone is now released as
[v0.2.0](https://github.com/DocumentDrivenDX/umf-visual/releases/tag/v0.2.0),
with main CI/Pages and served asset hashes verified. P6/P7 use
[CONTRACT-088](02-design/contracts/CONTRACT-088-editable-host-bindings.md) for
source/native revision fences, editable host identities and atomic reconciliation.
The reader-facing [editable host integration guide](../editable-integrations.md)
documents the current package APIs and example flows; it does not replace this
contract or its host-specific evidence.

[v0.3.0 candidate release notes](05-deploy/release-notes-v0.3.0.md) and the
[publication checklist](05-deploy/deployment-checklist-v0.3.0.md) record the local
fifteen-pair host pass and retain final CI and artifact-verification gates. They are not a
published release claim.
