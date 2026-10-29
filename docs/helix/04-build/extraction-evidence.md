# Extraction evidence

Source: UMF #62 at `351c4802caf34eb7f4174e7b730f86f4befcf909`.
SDK: released `umf-v0.5.7`; source/archive hashes are in UPSTREAM.json and bun.lock.
Observed locally on macOS on 2026-10-29 with Bun 1.4.3, Node 26.12.1 and
Chromium 153.0.8010.12. These observations do not establish a broader matrix.

## Source and package ownership

Imported 66 source/spec/test/fixture/governed-document files. A hash comparison
against their source snapshot finds only two changed files: the implementation's
core imports and the tests' core-helper imports. Schemas, semantic code, fixtures
and the four governed documents otherwise remain byte-equivalent. The local
barrel, packaging, build/test tooling, stack and CI are new extraction work.
MIT/Apache license texts and SPDX headers are retained.

## Observed checks

| Check | Result | Scope |
| --- | --- | --- |
| bun run check:source | Pass | Schema equality; public core imports; negative controls |
| bun run typecheck | Pass | Source, tests and tooling |
| bun test | 6 pass, 0 fail, 730 assertions | Original five tests plus package-boundary negative controls |
| bun run build | Pass | Browser-compatible ESM and public declarations; core external |
| bun run test:package | Pass | Packed install, installed declarations, Bun/Node consumer |
| bun run test:browser | Pass | 50 fixtures, 100 JSON/YAML round trips, atomic edit, no page errors |
| HELIX installed validator | Pass | New vision, concerns, architecture, test plan and extraction plan |

The package archive contains the public build/declarations, schemas/manifest,
provenance, README and licenses. The consuming installation exercises the real
released core SDK, not a private source alias. Runtime browser receipts live in
`.cache/browser.json`; they are run output, while this compact summary is tracked.
CI runs the same commands independently; local success is not a hosted CI result.

## Limits and next work

This is a relocation of the existing handwritten vocabulary. It has no generated
UMF-model authority, DOT/Mermaid/Lini adapter, native import/rewrite support or
renderer. The inherited early-year date bug, 15-node limit, restricted IDs and
four-cardinality representation remain. The original fixture generator is
external and was not reconstructed. Adopt code-shape ratchets, frame adapter
contracts, fix the date regression and qualify independent consumers before a
package release. Package metadata deliberately remains private/unpublished.

TypeScript declaration evidence uses `moduleResolution: Bundler`. A packed
NodeNext consumer fails to resolve inherited validation fields because SDK
0.5.7 declarations re-export extensionless relative paths. Bun/Node runtime
checks pass. NodeNext types need an upstream SDK packaging correction; no
private-source alias or SDK mutation is used here.
