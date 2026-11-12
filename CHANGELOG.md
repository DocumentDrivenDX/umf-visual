# Changelog

Releases are tagged `vX.Y.Z` and published as a GitHub Release (tarball + `SHA256SUMS`). The package is not on npm yet.

## Unreleased

## 0.6.1 - 2026-11-11
- Tag-driven `release.yml` (tests, build, fresh-install smoke of the packed tarball, GitHub Release with SHA256SUMS and provenance attestation).
  An npm publish step exists but is off by default; the package is still `private` and distributed as a GitHub Release tarball.
- The README quickstart is installed from the packed tarball and run in CI.
- Microsite footer shows the released version.
- Removed committed evidence, receipt gates and process docs; documentation lives in `docs/`, this changelog and `ROADMAP.md`. Small Linux-only CI.

## 0.6.0 - 2026-11-05
- Explicit visual model 1.4.0 released and frozen (process/activity role, `edge.routing`).
- Source-backed native presentation routes across the inventory and form examples.
- New Lini views: metrics, timelines, roadmaps, comparisons, state machines, nested structures, tiered zones, flat sequences.
- Reviews gallery showing each example's source and native output.

## 0.5.0 - 2026-11-02
- Presentation compiler for native Graphviz, Mermaid and Lini source.
- Public browser Lini renderer with identity maps and distributable runtime assets.
- Nine sourced showcase examples; visible, copyable YAML payloads; models 1.2.0 and 1.3.0.

## 0.4.0 - 2026-11-01
- Complete portable routes (`umf.visual.{dot,mermaid,lini}.full/1`) for all 53 catalog examples and five complex integration examples.
- Focused previews, complete downloads and explicit visual approximations.

## 0.3.0 - 2026-10-31
- Annotation profiles for DOT, Lini flow and Mermaid sequence recover registered additional meaning through visible native carriers.
- Catalog separates renderer, profile and view selection. Native Lini titles remove 23 ordinary-profile loss diagnostics.

## 0.2.0 - 2026-10-30
- Explicit DOT/Lini profiles; strict complete projections for all 53 examples across 22 forms.
- Model 1.1.0 corrections (early-year dates, exact multiplicities, stable field IDs) alongside frozen 1.0.0 defaults.

## 0.1.0 - 2026-10-29
- First release of the extracted visual library (from UMF #62): `umf.visual` 1.0.0 vocabulary, bounded native
  interchange (DOT, Mermaid, Lini) and a static comparison catalog.
