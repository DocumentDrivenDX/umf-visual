---
ddx:
  id: visual.release.v0.1.0
  type: release-notes
  activity: deploy
  authoring:
    home: repo
  links:
    - id: CONTRACT-083
      kind: references
    - id: CONTRACT-085
      kind: references
    - id: CONTRACT-086
      kind: references
---

# umf-visual v0.1.0

## Release Scope

First GitHub release of the extracted visual library, bounded native interchange
and static comparison catalog. Package version is 0.1.0; vocabulary remains
umf.visual 1.0.0 and envelope 0.10.0. This release does not include concurrent
Miro, Slides or PowerPoint work. Distribution is through GitHub release assets;
the package remains private to prevent accidental npm publication.

## Audience and Channels

Library consumers receive a compiled ESM package with declarations and schemas.
Renderer and semantic-tool developers can inspect the GitHub Pages catalog or
download its static archive. Both archives have SHA-256 checksums.

## Changes and Fixes

- Portable validation, inspection, read/write, creation and edit APIs, using
  released @umf/core SDK 0.5.7 through its public boundary.
- DOT 0.2.0, Mermaid 1.1.0 and Lini 0.2.0 mapping profiles, explicit loss policies,
  identity maps and validated exact source replay.
- Schema-derived reference: seven kinds, 22 forms and 19 shared schema definitions,
  separated from 53 sample instances across 159 sample/target combinations.
- 59 actual native SVG renders, source comparison, diagnostics, search, filters,
  keyboard navigation, responsive layout and stable selection links.
- Atomic catalog updates and content-addressed SVGs fix stale inline renderings.
  Title and description mappings remove 129 previously reported loss diagnostics.

## Breaking Changes and Required Actions

Install the package archive from this release using Bun or npm with its download
URL. Its pinned public core dependency requires network access during install.
The catalog archive can be served by any static HTTP server; no native engine or
backend is required at browsing time. There is no prior release to migrate.

## Validation

The implementation passed 88 Bun tests (3,254 assertions), source boundaries,
typechecking, packed Bun/Node consumers, real Chromium library/UI checks and
native Graphviz, Mermaid and Lini checks.

Both Linux CI runs passed at the
implementation cut. The publication workflow repeats conformance before Pages
publication. UI verification checks all 59 SVGs, errors, deep links and 375px layout.
Native evidence is qualified by the versions recorded in the generated catalog
and execution reports; rendering success does not establish semantic equivalence.

## Known Issues and Support

The current vocabulary and adapter profiles are an initial bounded subset, not
a finished superset of native diagram tools. Unsupported forms refuse explicitly;
reported-loss exports require opt-in.

Styles, ports, richer relationships and
common model/profile separation remain future work. Original native source must
be retained with its companion receipt for exact replay. Model authority remains
handwritten.

Bundler declaration resolution is verified; NodeNext remains limited
by upstream SDK declarations. No npm publication or Miro integration is claimed.

## Migration or Rollback Guidance

Pin the release archive URL and verify SHA256SUMS before installation. To hold an
upgrade, retain the pinned archive. For a site regression, revert the affected
source change on main and rerun Library conformance; Pages deployment follows a
successful build. GitHub release source tags and downloadable archives identify
the library cut independently of later catalog deployments.

## References

- [Architecture](../02-design/architecture.md)
- [Native and catalog evidence](../04-build/interchange-catalog-evidence.md)
- [First loss-reduction wave](../04-build/loss-reduction-wave-1.md)
- [Publication workflow](../../../.github/workflows/ci.yml)
