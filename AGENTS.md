# Working in umf-visual

This is a system library and interchange project. Read `.helix.yml` and
`docs/helix/README.md`, and use the installed HELIX skill. Resolve methodology,
templates and prompts from HELIX; do not vendor its catalog.

Consumers are producer integrations, renderer implementations and library
maintainers. Frame requirements as API, preservation, compatibility and
conformance outcomes. Do not invent market, revenue or hosted-service requirements.

`UPSTREAM.json` pins the extraction from UMF PR #62. Preserve imported artifact
IDs/frontmatter and resolve inherited upstream links using the provenance guide.
The current schema/types/semantic implementation is handwritten; generated
UMF-authored authority and DOT/Mermaid/Lini interchange are future work.

Use TypeScript and browser-compatible ESM. Development uses Bun. Import core
through the released `@umf/core` public package, never sibling/private source.
Keep adapters, native runtimes and renderers outside the portable vocabulary.
Preserve native source and unknown content; report unsupported meanings and
qualify every support claim by version, subset, direction and observed evidence.

Run `bun run check:source`, `bun run typecheck`, `bun test`, `bun run build`
and `bun run test:browser` for extraction/public-boundary changes. The browser
test is a real Chromium consumer. Install hooks with
`git config core.hooksPath .githooks`.
