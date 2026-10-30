# Miro network integration

[CONTRACT-084](../02-design/contracts/CONTRACT-084-miro-network.md) governs the
public `@documentdrivendx/umf-visual/miro` entry point. The owner requested
export → edit in Miro → import into the same `umf.visual` on 2026-10-29.

## Run the app

From the `umf-visual` repository:

```sh
bun run dev:miro
```

The local server listens on loopback. Use `http://localhost:4178/` as the Miro
App URL: Miro accepts plain HTTP only for the literal localhost hostname.
In Miro, create a Web SDK
app with that App URL and only `boards:read` and `boards:write`, install it in
the team containing the test board and launch it from the board's tools menu.
The host page registers the app icon; clicking it opens the round-trip panel.
Miro may require an organization administrator to create a Developer team and
accept its company Developer Terms before an app can be registered. Account,
legal and permission steps are separate from local implementation checks.

The example app is local development tooling, not a deployed service. It uses
Miro's official Web SDK v2 script; a concrete SDK patch build is not pinned by
that remotely served URL. No OAuth token, app secret or backend is used here.

## Exercise the round trip

1. Open the panel. The sample has one question, three nodes and one connection.
   Choose **Preview export**, then **Export to Miro**. The panel stores a
   companion checkpoint locally as it writes. Download the companion and UMF.
2. In Miro, edit `UMF test client` to `Edited in Miro`. Change the connector's
   caption from `Request` to `Dispatch`, and attach its end to `UMF test worker`.
   Move the API shape. You can also edit the question shape.
3. Return to the panel and choose **Load edited board**. Check the change paths:
   the client label, edge caption and edge `to` must change. Geometry stays in
   native capture; it does not become a semantic field.
4. Download the updated UMF and companion. The same document must survive
   JSON/YAML serialization and a second import without additional changes.
   Edit another label and repeat using the returned companion revision.
5. Negative controls: a copied mapped item, deleted mapped item, connector end
   attached outside the diagram, formatted label, changed local source or
   multiple captions must refuse rather than produce a lossy semantic result.
   **Capture board** lets you retain API-visible state after a refusal.

The source-format selector accepts JSON or YAML. Report mode is required for
roles, statuses, provenance, evidence, steps and other fields that are retained
in the companion rather than communicated by this drawing. The panel shows
those loss paths. It never guesses a role from a shape's color. Creation and
removal of semantic nodes/edges are outside this first reconciliation profile;
new untagged board items appear under `unmapped` and remain in full capture.

Companion checkpoints and source use browser localStorage for convenience;
download them for durable storage. Native capture includes only API-visible
JSON, not a full board backup or inaccessible metadata from other apps. No
failure automatically deletes board items or retries a possibly committed write.

## Implementation and boundaries

- `src/adapters/miro/plan.ts`: pure profile admission, layout requests and loss inventory.
- `types.ts`, `json.ts`, `bundle.ts`: public shapes, JSON safety, identity and receipt validation.
- `reconcile.ts`: atomic question/label/caption/endpoint adoption into copied source.
- `web-sdk.ts`: sequential injected SDK calls, checkpoints and two-read conflict detection.
- `examples/miro/`: working Miro icon/panel host; `scripts/miro-dev.ts` serves it locally.
- `tests/miro/`, `tests/miro-browser.ts`: behavioral and browser consumer controls.

The vocabulary does not import the adapter. `check:source` denies that dependency
and enforces 300-line adapter files and 60-line functions. It adds no new
runtime or lint dependency. Existing inherited vocabulary debt is unchanged.

## Execution evidence

Local observations use Bun 1.4.3 and the released `@umf/core` SDK 0.5.7.
The focused suite passes export, simulated SDK edits, import, JSON/YAML
serialization, repeat round trips, native-only capture, strict/report losses,
unknown retention, identity conflicts, stale source, read races and interrupted
write/checkpoint controls. Simulated SDK tests are not native Miro evidence.

Chromium 153.0.8010.12 passes the original 50 visual fixtures/100 serialization
round trips and the Miro adapter round trip with two semantic edits, no page
errors and an explicitly identified in-memory SDK test double.

## Live Miro evidence — 2026-10-29

The [sanitized evidence receipt](evidence/miro-live-2026-10-29.json) records
versions, the live edit, item counts, reproduction comparisons and evidence limits.

The owner-supplied [test board](https://miro.com/app/board/uXjVETu7kq0=/)
opens in the real Synaptiq team. The owner created a Developer team, approved
installation of UMF Visual Round Trip with board read/write scopes, approved
its generated outline icon upload and allowed Chrome local-app access. No
OAuth token, app secret or backend is used. The observed Miro browser client
is 1.105493.0; the SDK script is remotely served Web SDK v2.

The first real export created four shapes and a connector. Capture initially
stopped at an SDK endpoint's undefined optional `position`; verified read-only
receipt recovery completed the existing export without another write. The
fix retains JSON fields and records omitted callable/undefined SDK members.
The owner-authorized UI edit changed `UMF test client` to `Edited in Miro`.
**Load edited board** updated `/extensions/umf.visual/nodes/0/label`; a second
import returned no semantic changes. A UI connector-edit attempt created a
new connector instead; it was correctly reported as unmapped and preserved,
not claimed as a successful caption or endpoint adoption. The sanitized
synthetic-board receipt/capture is `tests/miro/fixtures/live-edited-network.json`.
A subsequent clean export completed four items without recovery; a fresh Miro
UI edit changed `Final proof source` to `Final proof edited in Miro`, imported
successfully, and a repeat import returned no changes. Its sanitized receipt is
`tests/miro/fixtures/live-clean-roundtrip.json`.

A real private architecture board was read without mutation. Its 72 API-visible
items include two diagrams, nested environments, process/document/store shapes,
free text, frame/group hierarchy and curved links. Stable capture sees 22
opaque stencils. **Capture experimental shapes** expands 20 into flowchart
shapes and records `sdkMode: experimental-shapes`; 2 remain opaque. Frame
metadata is explicitly unsupported and recorded as unavailable; permission and
other read failures still stop capture. The actual private captures are ignored.

### Native UMF preservation and reproduction

1. On a source board, select the objects to preserve and copy with Miro's UI.
2. Open the app and choose **Capture experimental shapes** (or stable capture).
3. Paste into **Native Miro copy**. The paste handler stores native HTML as opaque
   text, prevents rendering it, and retains selection/client/board provenance.
4. Choose **Download native board UMF**. This document uses adapter-owned
   `umf.visual.miro` 1.0.0; it does not invent a common visual for unknown content.
5. Load that JSON/YAML into the app's document editor on a target board. Choose
   **Copy native content from UMF**, click the target canvas and paste in Miro.

The private 72-item example passed exact opaque payload retention through UMF
JSON/YAML. Both direct native copy/paste and **UMF → app clipboard → Miro paste**
produced 72 items with matching tested content, styles, captions, node dimensions,
endpoint references, frame parents and group memberships. Coordinates differ by
a common paste translation; connector dimension rounding is below 4e-13. The
second native copy replaced the temporary direct paste using Miro's reversible
Undo. Source boards were never edited. The supplied test board contains the
original test diagram and the reconstructed complex example.

This is an observed, opaque Miro browser-copy profile, not a published stable
Miro interchange format or pixel/whole-board guarantee. It includes unsupported
symbols which the SDK cannot independently describe. Clipboard coverage is the
copied selection; board capture coverage is API-visible items. They must be
chosen together deliberately. A refreshed capture is marked capture-only, so a
historical clipboard is not silently advertised as the current reconstruction.
Semantic editing of arbitrary native diagrams and shared vocabulary expansion
remain separate from this reproduction path.

Public native APIs are `createMiroDocument`, `readMiroDocument`,
`writeMiroDocument`, `getMiroCapture`, `getMiroClipboard`, `attachMiroCapture` and
`miroRegistry`. Use the registered native extension validator when consuming
these documents. Never render or evaluate preserved native HTML. App storage
is board-scoped; durable downloads are still required.

### Validation and coordination

Required gates pass: source boundary/ratchets, typecheck, 33 tests / 838
assertions, build and Chromium 153.0.8010.12. Nineteen tests cover the Miro
adapter/native extension, including a sanitized live capture. The browser
consumer proves network round trips and native-extension JSON/YAML retention
with an explicitly identified SDK double; the live observations above are
separate evidence. Node public entry-point resolution was also checked.
Fresh package installation was not completed because dependency resolution
stalled. HELIX's Python validator is unavailable without PyYAML; document
structure and links were reviewed manually. `git diff --check` passes.

[Reduced counterexamples](../02-design/spikes/miro/counterexamples.md) distinguish
existing common vocabulary support, adapter gaps and shared model questions.
The explicitly authorized **UMF Diagram Language** chat received the structural
inventory, experimental-shape correction and reconstruction evidence. Common
visual 1.0.0 is unchanged; model versions, native extension and adapter profiles
remain independent. See [coordination](visual-integration-coordination.md).

### PR integration validation

The Miro-only PR branch was based on main commit `10fdb00` after shared
interchange/catalog PR #3 merged. It preserves those public APIs, browser
checks, package consumer checks and catalog tooling. Source boundary, typecheck,
112 tests / 3,357 assertions and build pass on the integrated branch.
The [combined Chromium receipt](evidence/miro-pr-browser.json) verifies both
interchange and the Miro SDK-double/native-extension tests with no page errors.
The [native-engine receipt](evidence/miro-pr-native-interchange.json) records
Graphviz 16.1.0 and Lini 1.1.0 compatibility checks. Cached pinned Lini assets
were checksum-verified via the existing `LINI_RUNTIME_DIR` option.

A fresh package consumer tarball was produced with the Miro bundle/declarations,
but its local dependency installation stalled and was cancelled. It is not
a passing fresh-install result. Original checkout observations above remain
historical evidence; they are distinct from this integrated branch's test total.
Private source captures, clipboard payloads and screenshots are not in the PR.
