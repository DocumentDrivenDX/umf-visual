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
distinguishes the current 1.0.0 language declarations from example instances and
identifies application-profile constraints requiring explicit future model design.

[Interchange and catalog execution evidence](04-build/interchange-catalog-evidence.md)
records native, packed-package, browser, catalog and reproducibility checks.

[First loss-reduction wave](04-build/loss-reduction-wave-1.md) records measured
title/description mappings, native character limits and the next worklist.

[Miro integration spike](02-design/spikes/SPIKE-011-miro-integration.md) and
[CONTRACT-084](02-design/contracts/CONTRACT-084-miro-network.md) govern the
bounded network adapter and native preservation extension. The
[implementation evidence](04-build/miro-integration.md) records actual Miro UI
edit/adoption, a 72-item native reproduction and scoped fidelity limits.

[PowerPoint integration spike](02-design/spikes/SPIKE-094-powerpoint-integration.md)
records an actual PowerPoint 16.114.3 export/edit/save/import round trip.
Bun and Chromium recover edited labels and a reconnected edge from embedded source;
native layout is retained separately. Structural edits and broader forms remain
unqualified.
