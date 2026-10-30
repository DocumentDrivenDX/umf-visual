---
ddx:
  id: SPIKE-001
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
  schemas:
    - id: urn:umf:visual
      version: "1.0.0"
      title: UMF visual vocabulary
      path: spec/extensions/visual/schema.json
      schemaFormat: json-schema
---

# Technical Spike: Google Slides edited round trip

**Spike ID**: SPIKE-001 | **Lead**: Library maintainer | **Time Budget**: One session, maximum two hours | **Status**: Completed for the tested subset

## Objective

**Technical Question**: Can a consumer export `umf.visual`, edit the drawing in
Google Slides, and load the supported changes back into a valid visual?

**Goals**:
- [x] Export editable native objects to a real Google Slides presentation.
- [x] Change node/edge text and move a node through the Google Slides browser UI.
- [x] Import those edits, validate the resulting visual, and export it again.
- [x] Retain native/source content and test refusal/conflict behavior.

**Success Criteria**: Native API acceptance/readback, actual editor changes,
validated import, second-export semantic parity and replayable local evidence.

**Out of Scope**: Production package API, arbitrary deck import, structural
add/delete reconciliation, all visual forms, automatic layout and visual fidelity
across themes. This spike implements an adapter-owned `flow/network` subset.

## Hypothesis

**Primary**: A retained original visual, explicit native identity map and native
export baseline allow supported editor changes to update the visual's semantics.
Native appearance and layout remain separate retained content.

**Assumptions**: A host persists the sidecar and fetches full native presentation
JSON. The source remains unchanged during native editing; concurrent source
changes require an explicit merge. New exports append a slide in a fresh namespace.

**Expected Outcome**: A bounded bidirectional adapter experiment with native
round-trip evidence, rather than an export-only recommendation.

## Approach

**Method**: Official API research, portable prototype, real API/editor experiment
and captured-source replay in Bun/Chromium.

| Stage | Activity | Objective |
| --- | --- | --- |
| Inspect | Read local vision, concerns, architecture, CONTRACT-083, TD-093 and extraction/test plans | Reuse semantic authority and public boundaries |
| Export | Submit planner output through the Google Drive connector | Establish native acceptance and identity |
| Edit | Rename a node and edge label; move the node through the Slides UI | Exercise the intended human-edit surface |
| Import | Read native JSON and project supported edits through `editVisual` | Validate changed semantics and preserve native data |
| Reexport | Append a second slide from the imported visual and layout | Verify the edits survive another native export/readback |
| Refuse | Replay conflicts, structural changes and unsupported native constructs | Prevent silent semantic replacement |

Catalog: installed HELIX `workflows/graph.yml`, design mode and tech-spike
contract. No methodology catalog was copied into the repository.

## Findings

**FINDING 1**: The edited round trip works for the tested adapter-owned diagram.

The [live fixture](https://docs.google.com/presentation/d/1wcMKS2kuZWlmfHCvtKcY6gDxr2T4DOULrNG7zo3rHfk/edit)
contains two slides: the exported diagram edited in Slides, and a second export
of the imported result. The initial source has two nodes and one labelled edge.

| Change in Google Slides UI | Imported result | Evidence |
| --- | --- | --- |
| `Client` renamed to `Browser client` | Node `client.label` changes; ID remains `client` | Native text readback and imported.umf.json |
| `Request` renamed to `HTTPS request` | Edge `request.label` changes | Native text readback and imported.umf.json |
| Client node moved down 12 points | Placement y changes from 140 to 152; semantic node has no coordinates | Native transform readback and importer test |

The connected line moved with the node. The imported visual is valid and complete
under the existing vocabulary API. Reexporting it was accepted by Google, and a
second native readback reproduces the imported semantic visual. This is a real
edited import; it does not simply return the original sidecar.

**FINDING 2**: A retained baseline and identity binding make conservative import possible.

`bindRoundTrip(plan, baseline)` verifies native readback against the source's
semantic text/endpoints, then binds presentation ID, slide/object IDs, full native
baseline and a SHA-256 source digest. `importSlidesEdits(binding, native, currentSource)`
refuses a changed source, wrong presentation, missing revision, or missing/extra
mapped objects. It imports question/node/edge text and directed endpoint references.

The baseline/sidecar is trusted local adapter state; this spike does not implement
a signed or remote sidecar store. Losing it prevents supported semantic recovery.
A production host must persist it with the native presentation association.

Text comes from native text runs with exactly one structural final newline
removed. Native IDs map back to original UMF IDs; shape position never determines
semantic role or identity. The 5–50-character native ID limit is handled separately
from UMF's 128-character IDs using deterministic hashes and a collision check.
See Google's [request definitions](https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/request).

**FINDING 3**: Semantic and presentation round trips need separate preservation claims.

CONTRACT-083 excludes fonts, colors and coordinates. The experiment reuses UMF
core 0.10.0 and `umf.visual` 1.0.0 through the public package barrel; the visual
schema/types remain unchanged. Local adapter types carry geometry and native IDs.
No applicable geometry definition exists in the inspected visual schema, and no
duplicate semantic model or domain pack is introduced.

Import returns a validated document, normalized placement, the complete edited
native JSON and baseline, plus a `NATIVE_RETAINED` report. Native style, notes,
masters, layouts and unfamiliar fields remain in these snapshots. They are not
projected into semantic metadata. Reexport uses imported placement and semantic
text with native default styling; it does not reproduce arbitrary native styling.
The original JSON source text remains byte-exact in the export sidecar.

Strict export refuses unmapped known semantic metadata. Report export retains
it and lists JSON Pointer residuals. Invalid/incomplete visuals refuse both modes;
unknown semantic fields are retained by their owner, not silently projected.

**FINDING 4**: Unsupported structural edits and ambiguous native meaning must refuse.

Native object additions/deletions/grouping refuse this importer. Detached or
unmapped endpoints, self-connectors, arrow meanings outside the profile,
non-straight connectors, rotated/sheared/reflected shapes and out-of-bounds
placements also refuse. Failure returns no replacement semantic document.

Endpoint reversal is supported and tested by locally reversing native readback
connections. It has no browser-UI reconnect acceptance claim. The actual UI
cohort covers two label edits and axis-aligned node movement. Arbitrary
Google Slides-to-UMF import remains a separate design problem.

**FINDING 5**: Native normalization and concurrency require an integration host.

Google returned sizes/transforms in English Metric Units (EMU), normalized from
the submitted point-based sizes, and added terminal text newlines. The importer
handles these observed differences. Native connection sites/transform details
must not be compared byte-for-byte with the request plan.

A live write with the pre-edit revision was rejected with HTTP 400 after the UI
edits. The host must obtain a current opaque revision and reconcile uncertain
write outcomes before retrying object creation. See [batch write control](https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/batchUpdate)
and [presentation revision semantics](https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations).

Authentication and API calls stay outside the portable prototype. The native
experiment used the connected Google Drive service; no credential file or token
was read. A production host should use the narrowest applicable OAuth 2.0 scope,
such as per-file `drive.file`; see [Google scope guidance](https://developers.google.com/workspace/slides/api/scopes).

### Measurements

Observed locally on 2026-10-29: Bun 1.4.3, Chromium 153.0.8010.12, UMF SDK 0.5.7,
core 0.10.0, `umf.visual` 1.0.0, Google Slides REST API v1.

| Check | Result | Scope |
| --- | --- | --- |
| Export corpus | 21 assertions in Bun; 21 in Chromium | Synthetic positive/refusal planning cases |
| Edited round-trip corpus | 20 assertions in Bun; 20 in Chromium | Actual UI snapshots, local negative mutations and native reexport readback |
| Native initial export | Accepted, read back | Two nodes, labelled edge and question |
| Native editor | Text edits and movement saved/read back | Google Slides browser UI |
| Native second export | Accepted; imported semantics match readback | Fresh namespace on second slide |
| Stale native revision | HTTP 400 rejection observed | Pre-edit revision after UI changes |
| TypeScript | Pass | Separate spike config |
| Source-boundary checks and repository typecheck/tests | Pass before round-trip extension; replayed afterward | Existing source plus documentation tests |

No hosted CI or broad native-version matrix is inferred. Initial Chromium startup
was sandbox-denied; authorized execution outside the sandbox passed.

## Analysis

**Hypothesis**: CONFIRMED for adapter-owned `flow/network` labels, connected
endpoints and positive axis-aligned placement in the observed cohort.

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| Sidecar missing or native IDs replaced | Medium | High | Persist binding; refuse unmapped structures |
| Concurrent UMF/native edits | Medium | High | Source digest and native revision; explicit merge |
| Visual styling mistaken for semantic metadata | High | High | Retained native snapshots and explicit projection report |
| Blind retry creates duplicates/conflicts | Medium | High | Read current IDs/revision and reconcile outcomes |
| Structural changes exceed the mapped subset | High | High | Define explicit add/delete/group reconciliation before expansion |

## Conclusions

**Primary Conclusion**: Bidirectional integration is feasible for a bounded,
identified export. The prototype demonstrates export, actual Slides UI edits,
validated import and native reexport with the changed semantics.

**Confidence**: High for the recorded fixture; limited for untested editing forms.

**Limitations**: One diagram, one runtime pair, trusted local sidecar, JSON input,
no native structural reconciliation, arbitrary import, rich styling replay,
three-way merge, template fidelity, or public package release. Captured-native
replays are deterministic tests; they do not make fresh Google calls.

## Recommendations

**RECOMMENDATION**: Design a versioned round-trip adapter profile with a
persistent native/source binding and explicit ownership of each editable property.

1. Frame round-trip acceptance criteria and the adapter contract before moving
   this experiment into public `src/adapters/google-slides` exports.
2. Keep authentication/native I/O in the host. Define durable binding, explicit
   conflicts, current-source merge behavior and response-loss reconciliation.
3. Expand native editing tests to reconnect endpoints, add/delete nodes/edges,
   grouping and rich text before qualifying those operations. Preserve unknown
   native content and refuse unsupported semantic updates.
4. Define a native appearance replay path if preserving Slides styling across
   another export is required; the semantic vocabulary continues to exclude it.

**Concern Impact**: Preserves portability, encapsulation and preservation concerns.
No dependency or concern override is introduced. Adopt source-shape limits before
production source expansion. The extraction plan and public API remain unchanged.

## Artifacts

- [Export planner](google-slides/prototype.ts) and [import/binding prototype](google-slides/roundtrip.ts).
- [Imported visual](google-slides/imported.umf.json), [second export plan](google-slides/second-export-plan.json)
  and [live receipt](google-slides/live-receipt.json).
- [Native export baseline](google-slides/native-before.json), [actual UI edits](google-slides/native-after-ui.json)
  and [native reexport](google-slides/native-reexport.json): complete retained connector presentation resources.
- [Shared import cases](google-slides/roundtrip-cases.ts), [tests](google-slides/roundtrip.test.ts),
  [browser verifier](google-slides/verify-roundtrip.ts) and [round-trip receipt](google-slides/roundtrip-receipt.json).
- [Editor screenshot](google-slides/edited-slide.png).

Run from the repository root:

```sh
bun test docs/helix/02-design/spikes/google-slides
bun node_modules/typescript/bin/tsc -p docs/helix/02-design/spikes/google-slides/tsconfig.json
bun docs/helix/02-design/spikes/google-slides/verify.ts
bun docs/helix/02-design/spikes/google-slides/verify-roundtrip.ts
```

The verifiers replay local inputs in real headless Chromium using intercepted
fixture URLs; they do not contact Google. Native creation/read/edit calls were
performed through the connected service and Slides UI. The installed HELIX
validator could not run because available Python runtimes lacked PyYAML;
required sections/frontmatter were reviewed manually.
