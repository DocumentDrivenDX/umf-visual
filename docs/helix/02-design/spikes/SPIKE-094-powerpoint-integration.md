---
ddx:
  id: SPIKE-094
  type: tech-spike
  activity: design
  authoring:
    home: repo
  links:
    - id: visual.vision
      kind: informed_by
    - id: visual.architecture
      kind: informed_by
    - id: CONTRACT-083
      kind: references
    - id: FEAT-034
      kind: references
  schemas:
    - id: umf.visual
      version: "1.0.0"
      title: UMF visual vocabulary 1.0.0
      path: spec/extensions/visual/schema.json
      schemaFormat: json-schema
---

# PowerPoint edited round-trip spike

## Objective

Prove the owner's clarified workflow: export `umf.visual`, edit the `.pptx` in
Microsoft PowerPoint, then load those changes into `umf.visual`.

**Lead:** library maintainer role. **Time budget:** one additional investigation
session, bounded to one three-node `flow/network` visual and one native Mac host.
**Status:** completed for the tested subset on 2026-10-29.

Success requires actual native edit/save evidence, semantic reimport, unchanged
metadata retention, no-op checks, negative controls and browser replay. Production
API publication and arbitrary presentation ingestion remain outside the spike.
The first export-only experiment is retained under `powerpoint/evidence/`; it did
not satisfy the clarified round-trip objective. The evidence below supersedes its
open native-edit qualification for this exact profile.

## Hypothesis

A self-exported PPTX can carry its original UMF source and mapping profile in an
embedded custom XML part. Named native text shapes supply editable labels;
attached DrawingML connectors supply editable graph endpoints. Reimport can merge
those supported changes through `editVisual` without guessing from appearance.

PowerPoint's native package contains layout and styles that `umf.visual` 1.0.0
deliberately excludes. Those bytes need independent retention and an explicit
native-only qualification. Native source preservation and semantic projection
are distinct results.

## Approach

Use CONTRACT-083, the local architecture and extracted vocabulary APIs. Keep the
prototype under the HELIX spike directory and depend on released public
`@umf/core`; production exports, schema and dependencies are unchanged.

The experiment uses PptxGenJS 4.0.1, JSZip 3.10.1 and xml-js 1.6.11 from the
preinstalled Codex dependency runtime. The TypeScript runner checks dependency
versions. Bun 1.4.3 and Chromium 153.0.8010.12 execute the same import/control code.
The native host is Microsoft PowerPoint for Mac 16.114.3.

1. Export three nodes and one edge as native text shapes and a genuinely attached
   connector. Embed original source JSON, its SHA-256 and the exact spike profile
   in a related Office custom XML part. No source sidecar is needed for import.
2. Open and save through native PowerPoint as `native-noop.pptx`.
3. Change title, question, Unicode node label and edge label through PowerPoint's
   object model; move the client node. Reconnect the edge in PowerPoint's UI by
   dragging its API endpoint to Store. Save As `native-edited.pptx`.
4. Close and reopen the edited file in PowerPoint; inspect the displayed labels,
   moved node and redirected arrow. Import the saved file independently in Bun
   and Chromium and compare with explicit expected edits.
5. Cross-check embedded source, connector endpoints, movement and imported JSON
   with Python's independent ZIP/XML parser. Run malformed/ambiguous edit controls.

## Findings

**FINDING 1**: Native PowerPoint edits return as semantic changes.
The importer loaded five changes from the file actually saved by PowerPoint:

| UMF visual path | Before | After |
| --- | --- | --- |
| `/title` | Client calls API | Native round trip verified |
| `/question` | What calls the API? | What changed in PowerPoint? |
| `/nodes/0/label` | Client | Browser café 東京 |
| `/edges/0/label` | Request | Fetch via PowerPoint |
| `/edges/0/to` | api | store |

[The imported document](powerpoint/evidence/roundtrip/imported.umf.json) is a
valid, completely interpreted core 0.10.0 / `umf.visual` 1.0.0 document.
The [change list](powerpoint/evidence/roundtrip/changes.json) records each value.
The edited native file was reopened and displayed successfully in PowerPoint.
The UI observation is session evidence; no screenshot artifact is claimed.

**FINDING 2**: Embedded semantic metadata survives both native saves.
PowerPoint retained the related custom XML part, the original semantic source,
shape names and connector attachments. The no-op native save changes package
bytes but recovers the entire original UMF document with zero semantic changes.
Roles, status, evidence, edge kind, rationale, takeaway and source annotations
remain unchanged after the edited import. The importer reads them from embedded
source, not from the export fixture or a local sidecar.

The embedded digest checks source corruption; it is unsigned and provides no
provenance authentication. Original `visual.source` and evidence annotations
remain origin information. Native edits have not been revalidated against that
upstream authored source; preserved annotations do not establish current agreement.

**FINDING 3**: Explicit native connections preserve graph endpoint meaning.
The original writer probe emitted an unattached line. The round-trip exporter
now emits `p:cxnSp` with `a:stCxn` / `a:endCxn` referring to node shape IDs.
These are PresentationML/DrawingML XML structures in Office Open XML.

Dragging the native arrow endpoint from API to Store changes the saved connection
reference. Import resolves that native shape ID back to node `store`; line
position/proximity never determines a relation. Native movement also reroutes the
attached connector. This agrees with Microsoft's
[connector behavior documentation](https://support.microsoft.com/en-us/powerpoint/draw-or-delete-a-line-or-connector).

**FINDING 4**: Bun, browser and an independent parser agree.
[The execution receipt](powerpoint/evidence/roundtrip/receipt.json) pins native
input/output hashes and runtime/dependency versions. Both runtimes pass native
no-op recovery, label import, reconnection, native movement retention, untouched
semantic preservation and a second semantic export/import cycle. No browser page
errors occur. The second cycle checks semantic equality; its generated layout is
fresh and does not claim native-layout continuity.

[The independent Python check](powerpoint/evidence/roundtrip/independent-check.json)
checks ZIP/XML syntax, original embedded source equality across native saves,
text values, the new attached target, changed node position and exact agreement
between native edits and imported UMF JSON.

**FINDING 5**: Unsupported or ambiguous edits fail before publishing a result.
Eleven controls pass in Bun and Chromium:

- Exact no-op semantic/source recovery without a sidecar.
- XML-escaped Unicode text edits.
- Multiple text runs and line breaks.
- Refusal of a renamed node identity.
- Refusal of duplicate shape identity.
- Refusal of a deleted node instead of partial import.
- Refusal of an unattached endpoint instead of inferred connectivity.
- Refusal of an altered source digest.
- Refusal of duplicated source metadata.
- Refusal of XML document type declarations.
- Original source remains immutable.

The importer also requires the expected flat shape set and one slide. Structural
shape additions, grouping, new node/edge identities and multi-slide composition
are unsupported. It retains the edited PPTX bytes when import succeeds, including
native content outside its interpreted subset. Known fields are patched through
`editVisual`, which refuses incomplete interpretation.

**FINDING 6**: Native automation needs a UI step on this host.
The first native attempts encountered file/folder access prompts, an active-deck
targeting mismatch and a stale object reference after Save As. The preparation
script uses explicit names/full-path guards and the renamed presentation for close.
PowerPoint's scripted `end connect` calls failed with -1708/-50; they are not
passing native evidence. The successful reconnection, Save As and reopen were
performed through the native UI. The retained preparation script stops before
that UI step and makes no full-automation claim.

## Analysis

**Hypothesis:** confirmed for the bounded self-exported profile. Export, native
edit/save and semantic import work with the tested host. General PowerPoint
interchange remains unqualified.

| Property | Verified | Boundary |
| --- | --- | --- |
| Labels/title/question | Actual native edits imported | Plain text; formatting remains native |
| Edge endpoints | Native endpoint drag imported | Explicit mapped attachments required |
| Movement/style | Native bytes retained; movement observed | Excluded from semantic `umf.visual` fields |
| Embedded source | Survives native no-op and edited saves | Exact custom XML profile; unsigned metadata |
| Untouched semantics | Whole expected document comparison | Authored fixture, not an arbitrary corpus |
| Repeated semantic cycle | Imported edits survive re-export/import | Fresh layout; no layout-continuity claim |
| Bun/browser parity | Same native files and controls pass | Recorded runtime versions only |
| Native additions/deletions | Refused | Requires governed structural-edit mapping |

### Risks

- Shape names can be renamed or duplicated. This profile refuses ambiguous
  identities instead of matching text or geometry.
- The parser accepts a small trusted-fixture profile: canonical XML prefixes,
  one visual/slide, no groups and at most three nodes for fixed layout. Its basic
  file/XML limits are not a production ZIP-bomb or hostile-package security proof.
- The metadata digest detects accidental corruption, not an adversary who changes
  both source and hash. Untrusted provenance needs a separate trust design.
- Retained native layout is available as `native` bytes and geometry. Exporting
  only the semantic document creates fresh layout. A production adapter needs an
  explicit native-preserving rewrite/re-export API to keep authored positioning.
- This profile does not interpret charts, SmartArt, images, animations, master
  edits, arbitrary native decks, other visual forms or other PowerPoint builds.

## Conclusions

The requested loop works in a bounded prototype: UMF source → PPTX → native
PowerPoint edits → valid UMF source with those edits. Confidence is high for the
retained fixture and runtime/host versions. The importer is an experiment outside
the public package API, not a released PowerPoint adapter.

The correct integration unit is a round-trip adapter with embedded source,
identity reconciliation, explicit supported edits and retained native bytes.
An export-only profile does not meet the owner's stated goal.

## Recommendations

**RECOMMENDATION**: design the first production profile around this proven edited
round trip, then expand accepted edit operations and the native/version corpus.

Keep native parsing/export outside `src/extensions/visual`; use the existing
semantic schema and public core APIs. Specify source/profile versioning, identity
persistence, native-preserving re-export, geometry handling, source provenance
invalidation and atomic refusal before exposing a public adapter entry.

Add independent native witnesses for creation/deletion/grouping, label formatting,
multiple slides, metadata stripping and native host variants. Each new visual form
and edit class needs its own supported mapping and explicit negative cases.
Keep original package recovery, edited semantic import and rendered equivalence
as separate claims. No vocabulary expansion is needed to prove the tested loop.

## Artifacts

- [Round-trip exporter/importer](powerpoint/roundtrip.ts).
- [Controls and native expected-state checks](powerpoint/roundtrip-cases.ts).
- [Bun/Chromium and import runner](powerpoint/roundtrip-run.ts).
- [Native edit preparation](powerpoint/native-roundtrip.applescript), with an
  explicit manual/native-UI reconnection step.
- [Independent native-file verifier](powerpoint/verify-roundtrip.py).
- [Original export](powerpoint/evidence/roundtrip/baseline.pptx),
  [native no-op save](powerpoint/evidence/roundtrip/native-noop.pptx) and
  [native edited save](powerpoint/evidence/roundtrip/native-edited.pptx).
- [Imported UMF](powerpoint/evidence/roundtrip/imported.umf.json),
  [changes](powerpoint/evidence/roundtrip/changes.json),
  [controls](powerpoint/evidence/roundtrip/controls.json) and
  [native/browser receipt](powerpoint/evidence/roundtrip/receipt.json).

### Reproduce or load another edit

Set `UMF_PPTX_SPIKE_MODULES` to an existing `node_modules` containing PptxGenJS
4.0.1, JSZip 3.10.1 and xml-js 1.6.11. The observed run uses Codex's bundled
26.1026.10807 dependency runtime; no dependency install/lockfile change occurred.

```sh
export UMF_PPTX_SPIKE_MODULES=/path/to/existing/node_modules
bun docs/helix/02-design/spikes/powerpoint/roundtrip-run.ts export
```

Open `powerpoint/evidence/roundtrip/baseline.pptx` in PowerPoint. Save an unchanged
copy as `native-noop.pptx`; edit title/question/labels, move Client, drag the arrow
endpoint from API to Store, and save a separate `native-edited.pptx`. All paths
in that instruction are relative to this spike's directory. Grant access only to
the generated fixture/output folder if the native sandbox requests it.

```sh
bun docs/helix/02-design/spikes/powerpoint/roundtrip-run.ts verify
python3 docs/helix/02-design/spikes/powerpoint/verify-roundtrip.py
```

`verify` asserts the exact edits in the table. For different supported text or
endpoint edits, import the edited self-exported file without those fixed expectations:

```sh
bun docs/helix/02-design/spikes/powerpoint/roundtrip-run.ts import /path/to/edited.pptx
```

This writes `latest-imported.umf.json`, `latest-changes.json`,
`latest-native.pptx` and `latest-native-geometry.json` under
`docs/helix/02-design/spikes/powerpoint/evidence/roundtrip/`. The native output is
an exact copy of the imported edited package. It preserves layout/style independently
of the semantic document. No PowerPoint installation is needed to import the
already-saved edited file; only native edit/save reproduction needs PowerPoint.

### Verification notes

The standalone prototype typecheck passes against the preinstalled dependency
types. The native-file check, Bun/Chromium import checks and eleven controls pass.
The installed HELIX instance validator remains unavailable because Python lacks
PyYAML; frontmatter/schema references and required spike sections are checked
separately. Production source and package manifests remain unchanged.
