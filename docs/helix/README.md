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
  [TD-093](02-design/technical-designs/TD-093-visual-vocabulary.md) are unchanged
  imported semantic authorities from #62, including their IDs/frontmatter.
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
not copied here. Next: Frame the interchange requirements, then define the model
and adapter contracts before changing vocabulary semantics. Existing source
evidence covers vocabulary validation, not native-format interchange.

[Google Slides integration spike](02-design/spikes/SPIKE-001-google-slides.md)
demonstrates export, actual Google Slides UI label/movement edits, validated
import and a second native export for an adapter-owned flow/network diagram.
Bun/Chromium replays cover preservation and refusal; arbitrary native import and
structural edit reconciliation remain unqualified. The prototype is outside the public API.
