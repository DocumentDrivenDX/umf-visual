---
ddx:
  id: SPIKE-011
  type: tech-spike
  activity: design
  authoring:
    home: repo
  links:
    - id: visual.vision
      kind: informed_by
    - id: visual.architecture
      kind: informed_by
    - id: FEAT-034
      kind: informed_by
    - id: CONTRACT-083
      kind: informed_by
---

# SPIKE-011: Miro integration for umf.visual

**Spike ID**: SPIKE-011 | **Lead**: Codex investigation; delivery owner unassigned
**Time Budget**: 30 minutes for this research/probe pass
**Status**: Completed research and vocabulary probe; live integration unverified
**As of**: 2026-10-29

## Objective

Can Miro exchange editable diagrams with `umf.visual` 1.0.0 without putting
layout into the semantic vocabulary or claiming unsupported native fidelity?
The user requested a Miro integration spike and identified the `umf-visual`
repository. The package name is `@documentdrivendx/umf-visual`; the extension
name is singular, `umf.visual`.

Success means selecting an initial direction/subset, checking the decisive API
and vocabulary constraints, and defining a live proof with explicit failure
and preservation behavior. This pass excludes production adapter code, account
connection, remote board writes, synchronization services and package release.

## Hypothesis

A Miro Web SDK v2 app can render an authored `flow/network` visual as native
shapes and connectors. The semantic document, board identity map and captured
native data must travel together for recovery. Arbitrary Miro boards cannot
be treated as complete `umf.visual` documents automatically.

The first-use assumption is an interactive workflow initiated inside Miro.
The request did not select interactive versus headless operation. This spike
recommends an initial proof; it does not settle that product choice or change
the existing vocabulary contract.

## Approach

Bound the HELIX catalog to the installed plugin's `workflows/graph.yml`
(HELIX 0.20.0). Read local vision, FEAT-034, CONTRACT-083, TD-093,
architecture, concerns, extraction plan and evidence, then inspect the source
and public API. Compare official Miro documentation for Web SDK v2 and REST
API v2. Run five local vocabulary controls against the actual library.

The probe uses synthetic data, not API captures. Stop after answering transport,
semantic mapping and recovery questions; defer account-specific behavior to a
separate live proof. No Miro dependency or credentials were added or read.

## Findings

**FINDING 1**: The vocabulary and a Miro board have different responsibilities.
CONTRACT-083 excludes coordinates, fonts, colors and sizes. The current package
owns seven kinds and 22 forms, one visual per document, restricted identifiers
and a maximum of 15 nodes for graph kinds. Its architecture separates adapters
and renderers from portable vocabulary validation. Miro-specific fields added
to semantic nodes survive serialization but make interpretation incomplete and
block conservative edits; the local probe verifies this behavior.

Implication: keep native presentation and integration receipts outside the
`umf.visual` payload. Define an adapter-owned companion bundle before delivery;
do not invent undocumented fields in the existing vocabulary. Existing source
metadata is provenance, not storage for an entire native board snapshot.

**FINDING 2**: Both Miro surfaces can support a diagram integration, with
different operating models. The Web SDK runs TypeScript/JavaScript while the
board is open and supports in-board UI. REST supports operation without an
open board and integration initiated by another tool. Miro documents backend
hosting for the REST approach. A combined app is possible.
[Miro comparison](https://developers.miro.com/docs/miro-web-sdk-vs-rest-apis)

Recommendation from these facts: start with Web SDK v2 for an interactive proof
without introducing a service. Choose REST v2 if the first consumer instead
requires CLI/CI or documentor-driven headless publication. OAuth credentials,
token lifecycle and network execution belong to that host, outside the portable
library. No SDK patch release or production deployment is qualified here.

**FINDING 3**: Shapes and connectors supply an achievable first target.
Miro exposes shape creation with content and placement. Connectors use native
endpoint item IDs and support captions; programmatic creation requires both
attached ends. Loose/dangling connectors cannot be created through either API.
[Shapes](https://developers.miro.com/docs/websdk-reference-shape),
[connectors](https://developers.miro.com/docs/websdk-reference-connector)

Create nodes before resolving connector endpoints. An exported drawing can be
editable without being a complete semantic representation. Shape appearance
does not establish node role, and an arrow does not establish action/data/control
meaning. Import needs authored mapping and the reader's question.

**FINDING 4**: App metadata helps correspondence but cannot be the sole archive.
Miro documents app-scoped item metadata, a 6 KB item limit, no item metadata on
frames/groups/unsupported items, and duplication that copies metadata. Reading
uses `boards:read`; writing uses `boards:write`.
[Board API](https://developers.miro.com/docs/websdk-reference-board),
[metadata lifecycle](https://developers.miro.com/docs/websdk-reference-card)

Store a small mapping hint on supported items and retain the full original UMF
document and identity map in an explicitly exported companion bundle. Duplicated
metadata must produce an identity conflict, not merge two items silently. IDs
remain strings; mapping keys include board identity and visual identity. The
local probe confirms long digit strings can be valid logical IDs, but arbitrary
native spelling is not a safe general identifier policy.

**FINDING 5**: A complete native-board round trip is unavailable as an initial
claim. Miro identifies unsupported item classes whose contents cannot be created
or updated programmatically, including strokes and tables. API-visible raw JSON
therefore cannot stand for a complete native board backup.
[Board item support](https://developers.miro.com/docs/board-items)

Frames also change child coordinate reference: frame children use the parent's
top-left origin. Retain `relativeTo` and parent identity instead of flattening
positions without provenance.
[Coordinate conversion](https://developers.miro.com/docs/frame-coordinates-to-board-coordinates)

## Analysis

**Hypothesis**: PARTIALLY CONFIRMED. The API provides the required primitives and
the existing vocabulary accepts a small semantic graph. Native execution,
editable reconciliation and independent round-trip comparisons are untested.

| Meaning | Proposed first profile | Boundary or loss |
| --- | --- | --- |
| `flow/network` nodes | Native rectangle shapes with escaped plain labels | Coordinates/theme supplied by renderer; roles/statuses retained as semantic metadata |
| Edges | Connectors after native node IDs exist; escaped label caption | Preserve edge meaning separately; do not infer direction from arbitrary native styling |
| Question/title/takeaway | Companion semantic source; optional visible text | Text placement does not encode its semantic role |
| Steps/evidence/unknown fields | Preserve complete original document | No walkthrough or evidence-checking behavior claimed in Miro |
| Native position/style/rich text | Preserve captured data in adapter bundle | Original board rendering/reconstruction not guaranteed |
| Groups/frames | Defer first export; retain references during capture | Geometric containment is not automatically a semantic zone or boundary |
| Other kinds/forms | Refuse first export profile | Sequence, state, entities, timeline, comparison and metric need separate profiles |
| Unsupported native items | Inventory accessible identity/type; report capture gaps | Never describe API capture as full preservation |

Proposed initial export accepts complete, validated network visuals of 1–15
nodes, with plain node/edge labels and no groups. Every other authored field
needs an explicit rendered, retained-only or unsupported classification. A
retained-only field is recoverable but may still be absent from the drawing.
Strict rendering refuses any requested meaning it cannot communicate; report
mode requires visible diagnostics with semantic paths. Recovery completeness
and rendering completeness must be separate results.

Import should initially reconcile only app-authored items with an available
original bundle. Label and endpoint edits may be candidates for adoption;
layout edits remain native-only. Refuse ambiguous copied IDs, missing endpoints,
stale source, unknown edited content and selections above 15 nodes. New/deleted
items require explicit reconciliation. Arbitrary board-to-network conversion
is a later guided workflow; refuse rather than guess kind, question or roles.

| Risk | Probability / impact | Proposed control |
| --- | --- | --- |
| Board semantics guessed from appearance | High / high | Guided import; preserve source and refuse ambiguous meaning |
| Partial writes, timeouts and retries duplicate items | Medium / high | Host-owned operation journal and reconciliation; no blind replay |
| Copied metadata aliases two native items | Medium / high | Check mapping bijection and surface conflict |
| Board changes while reconciling | Medium / high | Re-read affected items and compare captured fields; no unsupported atomicity claim |
| Rich text or resource links execute/fetch unexpectedly | Medium / high | Escape export text; sanitize import preview; never auto-fetch evidence/assets |

Miro SDK operations are rate limited; bounded queues and failure receipts belong
in the host. No throughput or board-wide transaction guarantee was measured.
[SDK rate limits](https://developers.miro.com/docs/websdk-reference-rate-limiting)

## Conclusions

Proceed with a bounded interactive Web SDK proof for authored network visuals.
Confidence is medium for API feasibility and low for native fidelity until a
real Miro board is exercised. Current versions are package bootstrap 0.1.0,
`umf.visual` 1.0.0, core envelope 0.10.0 and released SDK `umf-v0.5.7`.
External evidence covers the documented Miro v2 surfaces as reviewed on the
as-of date, not an installed Miro SDK version.

No full Miro support, live sync, arbitrary-board import, pixel fidelity or native
round-trip claim follows from this spike. Account installation, SDK build pin,
permissions, conflict behavior and the final companion format remain open.

## Recommendations

**RECOMMENDATION**: Frame a Miro network adapter profile, then prove export and
bounded re-import before expanding coverage. Preserve CONTRACT-083 and the
portable vocabulary boundary. No concern or runtime replacement is proposed;
an ADR is needed only if a later choice changes those boundaries.

1. Define the adapter contract: direction/subset, companion schema, identity
   rules, strict/report behavior, field-level losses and reconciliation policy.
   Keep pure projection/capture helpers separate from the Miro host that owns
   authentication, layout, I/O, retries and board writes.
2. Time-box a live proof to one engineering day (proposed, not a commitment).
   In a developer board, create two shapes and a labeled connector from an
   authored visual. Capture returned IDs, visible result and API version/build.
3. Edit a label, move a node and change an endpoint in Miro. Re-import supported
   changes, preserve native geometry, and recover the original semantic source
   and unknown content through UMF JSON and YAML. Compare values independently
   of the adapter's own serializer.
4. Exercise copied metadata, removed endpoint, unsupported item, stale bundle,
   16-node selection, HTML label, permission failure and interrupted write/retry.
   Publish accepted/refused cases and residuals. The current five local controls
   are prerequisites for understanding the model, not native acceptance tests.

## Artifacts

- [Vocabulary probe](miro/probe.test.ts): five tests, 11 assertions, pass with
  Bun 1.4.3 on macOS, 2026-10-29. Run from the repository root:
  `bun test docs/helix/02-design/spikes/miro/probe.test.ts`.
- Baseline inspected: `b34268f185b6eee57718bb8f751e2a14bba9c47a`; local source
  `src/extensions/visual/index.ts` and standalone visual schema.
- Probe scope: semantic validation, JSON/YAML preservation, IDs, node ceiling,
  dangling references and incomplete interpretation. No Miro execution or new
  browser claim. An initial probe run failed on its relative import; correcting
  the path produced the passing result above.
- Official API evidence is linked beside each finding. No authenticated board
  capture, prototype adapter, credential file or remote artifact was produced.
- HELIX validator could not run: both system and bundled Python lack PyYAML.
  Required sections, frontmatter and source links were reviewed manually;
  `git diff --check` passes. No dependency installation was performed.
