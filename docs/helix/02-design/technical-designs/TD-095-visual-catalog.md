---
ddx:
  id: TD-095
  type: technical-design
  activity: design
  authoring:
    home: repo
  links:
    - id: US-095
      kind: informed_by
    - id: CONTRACT-085
      kind: informed_by
    - id: SD-095
      kind: informed_by
    - id: visual.architecture
      kind: informed_by
---

# TD-095: Visual catalog build and browser

**User Story:** [[US-095-visual-catalog]]. **Solution Design:** [[SD-095-visual-catalog]].

## Technical Approach

Build the catalog once through actual facade exports and independent native
engines. Publish the resulting data and SVGs alongside a small static browser.
This keeps native engines outside portable source and browsing-time execution.
CONTRACT-085 owns the data shape and UI selection interface.

## Component Changes

Catalog build scripts own fixture enumeration, source hashing, policy-result
selection and native rendering. They implement US-095-AC1/AC2/AC3/AC7 without
editing the original definitions. Stable ordering and pinned runtimes make
rebuild differences attributable to changed inputs.

`microsite/index.html`, `styles.css` and `app.js` own discovery, filters,
comparison panels, image states and query selection for US-095-AC4/AC5/AC6.
Source and JSON panels use text content; SVG previews use image isolation.
The build assembles repository-owned assets into `dist-site/`. For US-095-AC8,
the primary language reference reads the exact payload schema and actual
visualForms table, independently of gallery instances. Counts distinguish
reusable schema definitions/kinds/forms from fixtures and canaries.

The architecture's module boundary applies: scripts may use host/native APIs;
portable src may not; the browser consumes only CONTRACT-085 static output.
The existing `bun run check:source` continues to protect the library boundary.

## Testing

STP-095 owns acceptance/test mapping and the UX coverage matrix. Build tests
compare the discovered fixture set and actual facade results; native engine
receipts qualify emitted source separately. Chromium exercises search, filters,
comparison states, deep-link reload and keyboard/narrow-screen operation.
Desktop/mobile visual inspection supplements assertions and must not be inferred
from a build passing. Verify source-like markup remains inert.

## Security

This static site needs no account or privileged server. Native source is generated
from repository data at build time. Code panels never interpret source as HTML;
SVG paths stay within the static output and are embedded as images. Native
engines and their downloads remain build tooling, not user-triggered browser code.

## Migration & Rollback

The increment adds site source and generated publication assets without changing
visual documents or adapter meaning. Rebuild from previous repository sources to
roll back the site. Hosting rollback belongs to the deployment workflow.

## Implementation Sequence

1. Finalize CONTRACT-085 and corpus enumeration with build-data assertions.
2. Generate native results while implementing the browser against the same contract.
3. Assemble output and run STP-095 gates, then inspect desktop/mobile views.
4. Hand the verified static artifact to the hosting workflow.

## Schema Basis

CONTRACT-085 composes existing core/visual documents and interchange operation
results with local build metadata. This TD introduces no competing schema or
visual vocabulary and does not make unsupported forms renderable.
