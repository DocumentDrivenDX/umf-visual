# Working in umf-visual

TypeScript and browser-compatible ESM; development uses Bun. Import core only through the public `@umf/core`
package, never sibling or private source. Keep adapters, native runtimes and renderers outside the portable
vocabulary, preserve native source and unknown content, and report unsupported meanings.

- `src/` library, `spec/` schemas/manifests, `microsite/` catalog site, `scripts/` builders and native/browser checks,
  `docs/` architecture and contracts, `UPSTREAM.json` provenance of the extraction from UMF PR #62.
- Before a PR: `bun run check:source && bun run typecheck && bun run test`. For native/catalog changes also
  `bun run test:native` (Graphviz on PATH), `bun run build:catalog`, `bun run build:site`, `bun run test:site`.
- Run native checks on your own platform only; CI is Linux. Do not commit run output (`.cache/`, `dist/`, `dist-site/`).
- Release: bump `package.json`, update `CHANGELOG.md`, tag `vX.Y.Z`; `release.yml` does the rest.
