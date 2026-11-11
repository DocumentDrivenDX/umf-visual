# Working in umf-visual

TypeScript and browser-compatible ESM; development uses Bun. Import core through
the released `@umf/core` public package, never sibling or private source.
Keep adapters, native runtimes and renderers outside the portable vocabulary.
Preserve native source and unknown content and report unsupported meanings.

`UPSTREAM.json` records the extraction from UMF PR #62. The catalog microsite
source lives in `microsite/`. Design notes are in `docs/helix/02-design/`.

Before a PR run `bun run check:source && bun run typecheck && bun run test`.
For native/catalog changes also run `bun run test:native` (Graphviz on PATH),
`bun run build:catalog`, `bun run build:site` and `bun run test:site`.
Do not commit run output, receipts or evidence; CI uploads `.cache/` as an artifact.
