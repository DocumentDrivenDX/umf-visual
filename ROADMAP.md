# Roadmap

Not commitments; the work most likely next.

- **UMF core 0.10.11.** Move `@umf/core` from the umf-v0.5.7 SDK tarball to the 0.10.11 SDK once it is released, and fix
  any diagnostic/serialization expectation changes in `tests/visual` and `tests/interchange`. The 0.10.x SDK tarballs are
  per-platform (Linux x86_64, macOS arm64) and large; a platform-neutral WASM SDK would make installation simpler.
- **npm publication** of `@documentdrivendx/umf-visual` (the release workflow has a gated, off-by-default publish step).
  Needs a decision, and `@umf/core` on npm or a documented two-step install.
- **Editable host integrations** (PowerPoint, Google Slides, Miro) are experimental: planning/import code is unit-tested
  but no CI job drives a live host. Qualifying them needs a host test environment.
- **Presentation quality**: more Lini/Mermaid/Graphviz views per vocabulary form; Mermaid E/R for unspecified
  identification is refused today.
- **Known vocabulary limits** in frozen 1.0.0 (15-node cap, restricted IDs, four cardinalities, early-year dates) are fixed
  in explicit 1.1.0+ models; the default authoring model stays 1.0.0 until an opt-in default change is decided.
