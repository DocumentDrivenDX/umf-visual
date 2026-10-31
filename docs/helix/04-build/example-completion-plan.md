---
ddx:
  id: visual.example-completion-plan
  type: implementation-plan
  activity: build
  authoring:
    home: repo
  links:
    - id: visual.architecture
      kind: informed_by
    - id: FEAT-035
      kind: informed_by
    - id: FEAT-036
      kind: informed_by
    - id: CONTRACT-083
      kind: informed_by
    - id: CONTRACT-084
      kind: informed_by
    - id: CONTRACT-085
      kind: informed_by
    - id: CONTRACT-086
      kind: informed_by
    - id: CONTRACT-087
      kind: informed_by
    - id: CONTRACT-088
      kind: informed_by
    - id: STP-095
      kind: informed_by
---

# Build Plan: Complete example coverage, then expand editable integrations

## Scope

Execution design authorized by the owner, reconciled against merged main
3139590 on 2026-10-29 (America/New_York), continued after release 31cbca1 on
2026-10-30. CONTRACT-087 owns the opt-in readable
annotation profile; this plan owns package ordering and acceptance gates.
The existing implementation plan links this goal-specific continuation.

The owner selected **at least one suitable target per example**. Before the
next release, all 53 current examples (50 originals and three canaries) must
have complete meaning under at least one qualified target profile, strict export
success, independent native readback and a faithful preview. All 22 forms must
be covered. This does not require every example to work in all three formats;
other target limitations remain visible in the catalog and loss ledger.

After that release, extend the suite with sanitized complex Miro examples and
build the PowerPoint, Google Slides and Miro integrations in parallel. Each
integration must support a tested edited round trip, not just an export.

Governing artifacts read: local vision, architecture, language inventory,
FEAT-035/036, CONTRACT-083/084/085/086, STP-095, project test plan, build plan and
wave-two evidence. Integration inputs are SPIKE-094 PowerPoint, SPIKE-001 Google
Slides, SPIKE-011 Miro and its reduced counterexamples. The installed HELIX
0.20.0 graph and implementation-plan contract supply this document's structure.

## Shared Constraints

- Preserve the released visual 1.0.0 schema, manifest and interpretation.
  The merged foundation registers frozen 1.0.0 and explicit 1.1.0 together.
  Default authoring/import/schema/manifest aliases remain 1.0.0. The latest
  schema generates 1.1.0 types/manifest; freshness is checked by check:source.
  Field identity and multiplicity require declared 1.1.0 support; other model
  additions need their own versioned design, not changes to generated files.
- Preserve the exact 53 fixture source hashes. Add migrated/projection/native
  witnesses separately; modifying examples cannot count as loss reduction.
- Use current public APIs: inspectVisual, getVisual, createVisualDocument,
  editVisual, importVisual and exportVisual. Adapters remain behind the existing
  parse(source, context)/serialize(visual, context) interface until a reviewed
  profile change is required. No private @umf/core imports or sibling aliases.
- Keep native engines, filesystem/network/authentication and host applications
  outside portable source. Root owns facade/build/CI/catalog integration and
  shared entry points; Luna packages own isolated implementation/tests.
- Strict success requires complete meaning under the declared profile. A
  retained source, embedded original, sidecar, image or native clipboard alone
  cannot remove semantic loss. Unknown meaning remains incomplete/refused.
- Native concepts and explicit profile annotations are separate representations.
  A readable, typed annotation may convey provenance/status/question/steps; it
  cannot substitute for graph connectivity, state transitions, chart values,
  containment or other available native diagram constructs.
- No inference of roles from shape icons, zones from geometry, relationships
  from proximity, identifying relationships from absent metadata, or dates from
  categorical periods. Renderer defaults that add meaning require qualification.

## Implementation Slices

| Package | Bounded outcome and owner | Depends on | Owned paths / seam | Completion evidence |
| --- | --- | --- | --- | --- |
| P0 | Luna ledger: normalized, classified loss inventory; no adapter behavior change | Main 3139590 | New scripts/catalog/loss-ledger.ts and tests/catalog/loss-ledger.test.ts; root wires command/data/UI | Raw diagnostics unchanged; 159 current pairs and 53 hashes preserved; stable classifications and parent/child normalization |
| P1-D | Sol/root: annotation profile contract and executable examples | P0 inventory; CONTRACT-087 | Governed contract/test updates and new shared annotation types; root alone edits facade/shared types | Explicit field ownership, native addressing and loss rules reviewed before adapter work |
| P1-A | Luna: portable typed annotation compiler/reader | P1-D | New src/interchange/annotations/ and tests/interchange/annotations.test.ts | Exact optional/empty/scalar/list distinctions, safe text, duplicates/conflicts and unknown-version refusals |
| P1-B | Luna per format: native annotation carriers and readback | P1-A | Existing format directory plus its own new annotation tests; one agent per directory | Independent native object/text readback, supported native edits, JSON/YAML/replay parity |
| P2-S | Luna state cohort: machine and lifecycle | P1 contract; native probe | New src/interchange/dot/state.ts and state tests; DOT owner integrates dispatch | Both state originals strict through selected profile; native states, initial/final endpoints and transition parts verified |
| P2-H | Luna structural cohort: tree, nested, stack | P1 contract; native probe | New src/interchange/dot/structure.ts and structure tests; DOT owner integrates dispatch | Four structure originals strict through selected profile; parent/layer/order/containment proven |
| P3-T | Luna timeline cohort: history, milestones, roadmap | P2 stable; native family probe | One new format-local timeline module and tests; format owner approves seam | Three originals strict; exact scale, period/date, lanes, event/span/marker meaning and text |
| P3-C | Luna comparison cohort: before-after, matrix, quadrant | P2 stable; native family probe | One new format-local comparison module and tests | Three originals strict; exact items/criteria/cell values/choice/axes; no invented numeric positions |
| P3-M | Luna metric cohort: stat, bar, line, meter | P2 stable; native family probe | One new format-local metric module and tests | Four originals strict; exact series, values, axes, units/format/target/baseline and direction meaning |
| P4 | Root/catalog Luna: all-example release gate and high-fidelity site | P1-P3; selected target for every example | Catalog scripts/tests, microsite assets, native/browser proofs; no model edits | 53/53 chosen strict native-backed projections, 22/22 forms, complete fidelity matrix and green release checks |
| P5 | Root release and Pages verification | P4 evidence; Sol review | Release notes/workflow/artifacts only | Tested archive, checksums, release tag and deployed catalog verified |
| P6 | Luna corpus + Sol/root binding contract | P5 released | New fixtures/integrations/complex-miro/; root-owned src/adapters/reconciliation/ under CONTRACT-088 | Sanitized semantic/native witnesses and shared reconciliation acceptance approved |
| P7-P | Luna PowerPoint production cohort | P6 | New src/adapters/powerpoint/ and tests/powerpoint/; host runner separate | Edited native file, semantic import, retained native bytes and native-preserving re-export |
| P7-G | Luna Google Slides production cohort | P6 | New src/adapters/google-slides/ and tests/google-slides/; host I/O separate | Real editor changes, revision-aware reconciliation and appearance-preserving update/readback |
| P7-M | Luna Miro expansion cohort | P6 | Existing src/adapters/miro/ and tests/miro/; bounded profile revisions | Complex grouping/attachments/shape intent subset with real edits, identity and native preservation |

P2-S and P2-H are the first two form cohorts. Do not edit the same format index
from two agents: owners expose small module functions and root/format owner
performs the dispatch integration. P3 packages run in parallel only when their
native-family probes assign nonoverlapping modules and one owner controls each
parser/serializer entry point. Do not launch all chart types as one large slice.

### P0 data and normalization contract

Draft report schema version 2, separate from catalog schema version 1:

```ts
type FieldFamily = 'diagram' | 'application' | 'provenance'
  | 'presentation' | 'envelope' | 'unknown';
type Representation = 'native-concept' | 'profile-annotation'
  | 'retained-only' | 'unrepresented';
type GapOwner = 'mapping' | 'model' | 'native-capability' | 'unknown';
interface LossGroup {
  path: string;
  family: FieldFamily;
  gapOwner: GapOwner;
  rawDiagnosticIndexes: number[];
  descendantPaths: string[];
}
// Per pair: input hash, model/profile/runtime versions, actual export result,
// unchanged raw diagnostics, normalized loss groups, representation inventory,
// native render/readback evidence and selected-for-release flag.
```

Normalize omitted subtrees only when ancestor and descendants describe the same
omission/family/reason. Compare JSON Pointer segments, not string prefixes.
Retain the raw diagnostic indexes and all distinct error/meaning reasons.
Unknown classifications stay unknown; do not label an unexamined native limit a
model gap. Inventory mappings even when a target refuses and therefore emits no
loss-counted source. Track losses on comparable old emitted pairs separately
from newly emitted pairs. Historical reports and baselines remain unchanged;
reclassification/deduplication is not a semantic improvement.

### P1 typed visible annotation profile

The shared compiler produces typed entries with source JSON Pointer, exact
field name, value kind and exact scalar/list values. Format owners derive owner
identity/headings from the registered pointer and native correspondence.
The compiler does not serialize a whole UMF document into an annotation blob.
Compact owner-scoped blocks
show exact property names and typed values; full JSON Pointers live in native
identity descriptors and the catalog inspector. Avoid repeated four-column
path/name/type/value tables. Keep the primary diagram readable; provide a
complete annotated view and a focused diagram view of the same native output.
The current fields are question, source path/view/digest, audience, takeaway,
omissions, roles/status/emphasis/evidence, edge kind/rationale where not natively
represented, and ordered walkthrough steps/focus/when/tag. Structural fields are
excluded from this fallback and keep their native mapping obligations.

Each target owns a visible native carrier: an actual title/caption/annotation
object or native text field with a bounded readable grammar. Carrier identities
must be independently addressable in that format, versioned and collision-safe.
Carrier text names the property rather than communicating it through guessed
colors/icons. Role/status semantics are explicit values, not inferred styling.
No semantic node is fabricated merely to draw an annotation panel.

Reader acceptance requires exact native readback, including arrays, missing
versus empty values, text escaping and Unicode. Duplicate/missing carriers,
changed identity, unsupported rich text and conflicting native/profile meaning
must refuse atomically. Preserve source annotations as claims about their
recorded origin; a native edit does not reverify source digests/evidence.
Unknown envelope/extension content is never promoted to an understood annotation.

Strict export may remove a field's loss only after visible representation and
independent edited recovery are proven. The catalog must disclose annotation
profile participation separately from intrinsic native diagram concepts.

### First form cohorts and target-selection probes

- State: start with a DOT typed state profile against both actual state fixtures.
  Independently inspect initial/final markers, event, guard and action, including
  separators/escaping. Do not concatenate transition parts ambiguously or turn
  path/status into inferred line style. Use P1 for explicit remaining metadata.
- Structure: evaluate DOT for tree/nested/stack, separating node.parent, group
  membership and structure.layers. A native containment construct must preserve
  parent identity; rank/order heuristics alone cannot establish layer meaning.
  Preserve node counts, labels and shared model refinements exactly.
- Timeline/charts: inspect installed native runtimes and source fixtures before
  choosing Lini, Mermaid or DOT. Native family availability is not semantic
  equivalence. Make a one-example positive/negative probe per form first.
  Reject inferred dates, omitted series, rounded values, fabricated quadrant
  coordinates or labels that replace the chart's actual values/relationships.
- If no existing target can faithfully express a form, record the exact missing
  affordance and design a suitable target/profile through governing artifacts.
  Do not call a generic SVG fallback a successful native adapter. The release
  gate remains open until every chosen example target passes.

## Acceptance Matrix

| Gate | Required acceptance | Failure disposition |
| --- | --- | --- |
| A0 Foundation | Main3139590 version/generation boundary; frozen 1.0 artifacts and explicit 1.1 migration/registry | Block model-dependent work only; continue P0 inventory |
| A1 Corpus | Exact original 53 IDs and hashes; 50 originals/three canaries counted separately | Fail report/build; no baseline rewrite |
| A2 Meaning | Every example has a selected suitable target with strict success and no known omitted meaning | Release blocked; retain target's actual loss/refusal |
| A3 Recovery | Selected output independently parses/readbacks; supported native edits update intended typed fields; untouched content survives | Refuse ambiguous adoption; keep original/native material |
| A4 All forms | Actual native previews cover all 22 forms and all 53 examples | Release blocked; unsupported remains visible |
| A5 Fidelity | Exact text/numbers/units/endpoints/order/membership; no clipped/overlapping labels; appropriate form and annotation legibility | Fix renderer/profile; a nonempty SVG is insufficient |
| A6 Repeated cycle | JSON/YAML compound persistence, native no-op/edit/import/re-export, stale/forged binding controls | Fail profile qualification |
| A7 Catalog | Source/result parity, explicit native-vs-annotation support, honest other targets, native versions/hashes, deep links/accessibility/mobile | Fail site/release build |
| A8 Release | Full checks, Sol signoff, tested package archive/checksums, Pages build+served data/assets verified | No release completion claim |
| A9 Integrations | Each new host has supported-edit matrix, actual native witnesses, preservation limits and loss tracking | Keep host/profile experimental for unproven operations |

Fidelity witnesses include full diagram and readable detail views, desktop and
375px browser inspection, positive asset dimensions and independent semantic
assertions. Check chart scales/baselines, arrowheads/cardinalities, nested bounds,
labels and annotation associations. Record renderer/font/runtime versions and
numerical tolerances; rendering success alone is not pixel equivalence.

## Integration Contract and Packages After Release

Package v0.2.0 is released at `31cbca1`. [CONTRACT-088](../02-design/contracts/CONTRACT-088-editable-host-bindings.md)
now owns the new reconciliation boundary. P6 and bounded P7 implementation are
authorized; the existing host spikes are inputs, not completed public profiles.

| Slice / owner | Isolated deliverable | Gate before integration |
| --- | --- | --- |
| P6-C Luna corpus | Six reduced cases under fixtures/integrations/miro-complex/: nesting/store boundary, explicit shape intent, 16 nodes/24 edges, independent frame/heading/annotation, curved attached caption, opaque symbol | Sanitization review; explicit source-model version; expected semantic/retained-only paths and negative cases; no actual company content |
| P6-B Root + Sol | Shared HostBinding/Observation/Mapping/Loss types and admitHostBinding/checkHostFence/finishHostReconciliation under src/adapters/reconciliation/; shared tests | Baseline/source rederivation, exact revision/resource fence, bijective scoped IDs, atomic failure, interrupted state and safe admission |
| P7-P Luna PowerPoint | New src/adapters/powerpoint/ plus tests/powerpoint/; bounded ZIP/namespace-aware XML codec and owned-slot native patch | No-op/text/reconnect/movement second cycle; unknown part preservation; ZIP/XML safety; strict/report paths; real PowerPoint save/reopen evidence |
| P7-G Luna Slides | New src/adapters/google-slides/ plus tests/google-slides/; pure plan/bind/reconcile/update requests, injected host I/O | Exact resource/revision fence; preserved style/native extras; connector reconnect in real UI; repeated cycle and conflicts |
| P7-M Luna Miro | Separate editable-network profile in existing src/adapters/miro/ plus tests/miro/ | Existing network/1 remains compatible; explicit 1.1 sixteen-node case; grouping/frames/opaque symbols remain retained-only unless mapped; real board repeated cycle |
| P7-I Root catalog/package | Add host capability/loss rows and public subpath build/packed/browser consumers | Actual evidence separated from test doubles; native-only and semantic losses both visible; no source-blob equivalence |

Owners consume root's shared seam and do not edit each other's entry points.
PowerPoint alone may use the pinned reviewed `fflate`/`saxes` dependencies;
portable vocabulary code cannot depend on them. Authentication and host write
runners remain outside portable source. Root integrates package exports,
check:source allowlists, browser/packed tests and catalog wiring.

P6 first records source model/profile version, source digest/revision, native
document identity, native baseline/revision, bijective logical/native maps,
supported semantic changes by path, native-only changes, retained opaque data
and complete/interrupted write state. Reuse safe JSON admission, ownership and
conflict principles, not a forced single wire shape for all hosts. Unknown
fields remain retained; digests do not authenticate a caller-controlled binding.

All three P7 packages implement this ladder: export, actual native no-op save,
native text edit, explicit connector reconnect, movement/grouping within the
declared subset, atomic import, JSON/YAML persistence, a second native-preserving
export/update and native readback. Test deleted/copied/renamed identities,
metadata stripping, stale local/native source, concurrent changes, unknown
content and interrupted operations. Creation/deletion are separately qualified
edit classes, not silently inferred from an arbitrary deck or board.

- PowerPoint: promote SPIKE-094 incrementally. Replace prototype prefix-specific
  parsing with namespace-aware bounded OOXML handling; bound expanded ZIP size,
  entries/depth and XML. Refuse external fetch/DTD behavior. Add path-level
  strict/report losses and a rewrite/update path retaining native layout/style,
  not only the spike's fresh semantic export. Independent ZIP/XML verification
  and real PowerPoint save/reopen/edit remain required.
- Google Slides: promote SPIKE-001. Validate retained-only vocabulary/envelope
  content, exact binding identity and native revision ownership rather than a
  merely truthy revision. Separate known native edits from concurrent source
  conflicts. Preserve existing native style/layout via planned object updates;
  a new default-styled slide is not appearance continuity. Actual UI reconnect
  needs new evidence; the spike tested that operation only through local data.
- Miro: retain CONTRACT-084/network profile compatibility. Introduce a reviewed
  expanded profile for grouping/frames/attachments/shape intent. Keep semantic
  groups, frame ownership and geometric enclosure distinct. Retain SDK-opaque
  symbols without guessing actor semantics. Public API capture and observed
  browser clipboard reproduction keep separate capability/evidence records.

Sanitized complex examples cover two independent source diagrams: development
data processing and nested deployment. Add minimal witnesses for nested
environment/store connectivity; process/document/multidocument/store intent;
16 nodes/24 links; independent frame/view heading/free annotations; curved
captioned attached connectors; and an opaque symbol. Preserve relevant topology,
multiplicity, geometry relations and unsupported witnesses while replacing
company names, board IDs, URLs and raw private assets. A native-only 1.0 witness
may demonstrate an existing limit; it must not fabricate a valid 1.0 graph.

## Execution Contract

The owner authorized Sol planning/review and parallel Luna implementation.
Root controls shared interfaces, integration order, merge/release and host I/O.
P0-P5 are complete through released v0.2.0. P6/P7 now execute against 31cbca1
without mutating frozen models. New model concepts require their own reviewed
version; the existing 1.1.0 registration handles the sixteen-node case.
Each package ends in a small reviewable change and its own meaningful checks.
Sol reviews native meaning, unknown-content handling and independent evidence.

Token usage/total spending ceiling: not specified by the owner; no numerical
budget is invented. Existing receipts contain technical validation, not reliable
per-package token estimates. Root/runtime meters usage where available and
records actual package completion; this plan makes no timing/budget promise.

## Continuation Evidence

P0-P5 closed at v0.2.0/31cbca1: 53 unchanged examples, 22 forms, 43 selected DOT
and ten selected Lini projections; 178 served assets hash-verified. Linux
[main conformance and Pages](https://github.com/DocumentDrivenDX/umf-visual/actions/runs/41002367698)
passed. The [milestone evidence](example-completion-evidence.md) records the
qualified outcome; older wave reports remain historical baselines.

P6 adds six synthetic/sanitized witnesses under
`fixtures/integrations/complex-miro/`: five shared-model documents and one
native-only witness. Four shared documents use 1.0.0; the sixteen-node case
explicitly uses 1.1.0. The additive integration catalog preserves each source,
projection gap and target loss. Its format-readback/planning results do not
replace the original 53-example gate or qualify live use of every corpus case.

P7 implements the three explicit CONTRACT-088 profiles with shared admission,
source/revision fences, bijective native slots and retained-only loss reporting.
The [current evidence](example-completion-evidence.md#p6p7-closeout-observation--2026-10-30)
separates local tests, host execution and publication gates:

| Package | Observed qualification | Remaining gate |
| --- | --- | --- |
| P7-P | [PowerPoint native evidence](powerpoint-native-conformance.md): Mac 16.114.3, one-slide 16-node/24-edge 1.1.0 network and a separate 1.0.0 caption case; semantic edit/import and preserving update/reopen | Exact-candidate CI/package/browser gates; other presentations and host versions remain unqualified |
| P7-G | [Slides live evidence](../02-design/spikes/google-slides/live-execution.md): one owned 1.0.0 slide, UI text/style/movement/reconnection and conditional preserving update; original slide unchanged | Adapter logic uses captured trace replay; direct injected adapter transport is not a live end-to-end claim |
| P7-M | [Miro live evidence](miro-editable-live-2026-10-30.md): synthetic 1.0.0 network, observed Web SDK runtime 1.105538.0, UI label/movement/fill/reconnection, semantic import and preserving question update; 82 unrelated items unchanged | Service release is not independently pinned; groups and rich-text editing remain unqualified |

Sol's bounded closeout checks cover the shared/Miro/Slides preservation fixes,
loss-forgery controls, PPTX expansion/XML bounds and separate caption slots.
Both final findings are closed: Slides caption changes use the existing label
pointer through repeated updates, and qualified PPT connectors reject text
bodies rather than erasing unowned text from residual fingerprints. The focused
closeout rerun passes 38 tests and 191 assertions. Root owns final integrated checks and CI.
P6/P7 are not merged, deployed or released by this record. Use
createVisualDocument(visual, id, '1.1.0') or upgradeVisualDocument explicitly for
larger source witnesses; no model or historical profile is silently upgraded.

## Validation Plan

Use the actual existing command surface, broadening only when a new package
adds required checks:

```sh
bun run check:source
bun run typecheck
bun test
bun run build
bun run test:package
bun run fetch:lini
bun run test:native
bun run test:native:wave2
bun run test:browser
bun run build:catalog
bun run test:catalog
bun run report:loss
bun run report:loss:wave2
bun run build:site
bun run test:site
```

The existing ledger command is report:loss:ledger. New host-family checks must
be wired by root before public qualification and require real host/readback
witnesses; script names are not invented as completed evidence here.
check:source remains the local/pre-commit/CI portability boundary. Add packed
consumer tests for every new public adapter export and generated SDK version.
Validate persisted HELIX changes with the installed catalog; do not copy it.

## Risks and Rollbacks

| Risk | Response | Rollback |
| --- | --- | --- |
| Foundation merge silently changes published meaning | Version-check schema/manifest/generated SDK and run both-version fixtures | Preserve released 1.0 exports; revert new profile wiring |
| Annotation is mistaken for intrinsic native semantics | Separate representation inventory, visible field labels and independent native edits | Keep field loss until annotation profile qualifies |
| Generic renderer fakes a chart or layout | Native-family probe and per-form exact semantic/fidelity tests | Leave target unsupported; retain existing working profiles |
| Ledger normalization looks like loss reduction | Keep raw diagnostics/historical reports and comparable-pair accounting | Disable new summary without changing adapter results |
| Host access is unavailable | Continue pure/binary/snapshot/browser tests; record native evidence as pending | Keep affected integration experimental; do not fabricate live acceptance |
| Native metadata is stripped or IDs collide | Atomic refusal, captured native retention and explicit recovery/conflict path | Retain prior document/binding; no blind write retry |
| Complex Miro material exposes private content | Reduced synthetic/sanitized witnesses; inspect committed assets | Remove publication candidate before commit; keep raw capture ignored |

## Exit Criteria

- All 53 unchanged current examples pass A1-A8 through at least one suitable
  target each; all 22 forms have faithful native previews and other limits stay
  visible. The chosen release gate is confirmed, not pending approval.
- The example milestone is released and its microsite verified before P6/P7.
- Sanitized complex examples then enter the suite and ledger, with explicit
  shared/native-only meaning rather than manufactured common semantics.
- PowerPoint, Google Slides and Miro each pass A9 for a named profile/version
  and edited round-trip cohort. Missing external access remains an explicit
  blocker to that host's completion, not a passing replay claim.
- Required contracts, generated-model migration, tests and Sol reviews are
  recorded; no required work or material blocker is hidden by a capture/blob.

## P8+ continuation: current losses and six-target previews

### Planning basis — 2026-10-31

This addition is a plan only. It does not authorize or record implementation,
merge, deployment or a release. It reconciles the earlier dated P6/P7 observations
with planning checkout `40cf24a` after merged main `21c41a2`.
Root's 2026-10-31 remote-ref and fresh public JSON checks confirm the P6/P7
integration cut is merged and deployed through [PR 9](https://github.com/DocumentDrivenDX/umf-visual/pull/9)
and [main CI/Pages](https://github.com/DocumentDrivenDX/umf-visual/actions/runs/41089778556).
The public [catalog](https://documentdrivendx.github.io/umf-visual/catalog.json)
and [integration data](https://documentdrivendx.github.io/umf-visual/integrations.json)
are the inspected deployed outcomes. A v0.3.0 release is not published; the
narrow host receipts do not qualify every corpus case.
CONTRACT-085/086/087/088 and STP-095 remain governing authorities.
Contract/test amendments precede dependent implementation; no new framework,
language, renderer service or common-model redesign is required by this plan.

The inspected current catalog snapshots are `.cache/planning-catalog.json` and
`.cache/planning-integrations.json`. These are planning inputs, not new durable
execution receipts. Current ordinary profiles still have substantial losses:

| Ordinary target | Supported / reported-loss / unsupported, across 53 examples | Loss diagnostics on emitted outputs |
| --- | --- | --- |
| DOT | 1 / 18 / 34 | 629 |
| Mermaid | 1 / 28 / 24 | 792 |
| Lini | 1 / 23 / 29 | 553 |

The diagnostic totals are raw incidences, not distinct lost concepts. The
53 complete selected projections (43 annotated DOT, ten annotated Lini) meet
the previous one-suitable-target gate. They do not repair the ordinary profiles
or establish every renderer for every form. Ordinary target records describe
current behavior; only genuinely older receipts are historical. For example,
`visual-catalog-canary-flow` currently has four Lini loss diagnostics for
source/omissions/title/source-path; its annotated Lini flow variant is unsupported.
The 178 existing SVG assets comprise 72 ordinary-target renders, 53 complete
annotated views and 53 focused views; none of that count establishes a
PowerPoint, Slides or Miro preview. Existing ledger gap ownership is still
`unknown`: neither reason-code counts nor family labels establish adapter fault.

The integration catalog contains six witnesses: five shared-model documents
and one opaque-only case. Its five PPTX format readbacks, ten Slides/Miro plans
and three refusals are not fifteen native-host renders. Four host receipts
cover only two exact corpus cases and two standalone canaries. All five shared
cases need actual previews and repeated edited cycles in each suitable host;
the opaque witness must retain its unsupported meaning explicitly.

### Ordered packages

Root owns catalog contracts, shared interfaces, integration and CI. Luna owns
isolated implementation packages after execution authorization; Sol reviews
native meaning, admission, preservation and claim accuracy. Preview work starts
alongside mapping work rather than waiting for all losses to be resolved.

| Package | Bounded outcome / owned paths | Depends on | Acceptance evidence |
| --- | --- | --- | --- |
| P8 | Catalog selection/discovery: `microsite/`, existing UI tests and STP-095 amendment | Current audit | Format, profile and diagram/complete view are explicit selections; target switches preserve a compatible profile intent or show unavailable, never silently substitute a different profile. Deep links/reload and keyboard navigation retain selection. Coverage/loss summaries identify their active profile. |
| P8-V | First six-target vertical slice: root joins one existing shared flow source, format/host owners capture it | P8 selection/data seam; parallel with P9 | Start with `process-documents-store`: one exact source hash, actual DOT/Mermaid/Lini/PowerPoint/Slides/Miro images, downloadable emitted artifacts or host captures, and visible losses. Reported-loss previews are useful; plans or an image from another renderer do not satisfy this slice. |
| P9 | Current loss inventory and ranked cohorts: `scripts/catalog/loss-ledger*`, data tests; root updates governing mapping contracts | Current audit; P8 data needs | Include ordinary profiles, variants and all three host families. Rank maximal omitted pointer subtrees by affected fixtures and fixability; preserve raw diagnostics and source hashes. Each candidate names native mapping, adapter gap, model gap, native limit, additional annotation or unknown cause, with a qualified probe and owner. |
| P10-D | Native DOT eligibility/mapping cohort: `src/interchange/dot/` and format tests | P9 approved role/status/style cohort | Run native positive/negative and edited-readback probes. Implement demonstrated native-to-model equivalences; otherwise retain losses/refusals and record bounded negative evidence, zero comparable delta and separate mapping candidates. The reviewed amendment below preserves the original unachieved reduction forecast. |
| P10-M | Native Mermaid mapping cohort: `src/interchange/mermaid/` and format tests | P9 approved Mermaid cohort | Start with five sequence examples and a separate four-example ER eligibility probe. Verify participant/message/note/group meaning; ladder layout remains unsupported if native geometry cannot satisfy it. Probe field ports and identifying relationships without assuming equivalence. Actual database/render evidence distinguishes intrinsic semantics from text. |
| P10-L | Native Lini mapping cohort: `src/interchange/lini/` and format tests | P9 approved Lini cohort | Probe title loss across 23 emitted cases, then flow/pipeline cohorts and four entity examples. Qualify native key/cardinality/reference slots individually; preserve unspecified values and refuse unsupported direction rather than choosing defaults. Native proofs precede any promised reduction. |
| P11-M / P11-L | Separate opt-in Mermaid and Lini-flow visible annotation packages, with format-local modules/tests; root integrates facade | Relevant P10 native cohort; reviewed CONTRACT-087 extension | Registered additional metadata has readable owner-associated editable native carriers and independent typed readback. No annotation replaces intrinsic connectivity/layout/chart meaning. Lini flow canary is a required positive case; all unrepresented paths remain loss/refusal. |
| P11-V | Explicit model-version qualification of affected profiles: capability/facade tests owned by root | Each P10/P11 mapping contract | Frozen 1.0 defaults/receipts unchanged. Qualify 1.1 field identity, multiplicity and resource limits separately; unknown versions refuse. New metadata profiles get explicit identity/version, not silent reinterpretation of existing receipts. |
| P12-P | Five-case PowerPoint preview/edit cohort: host runners/evidence and `src/adapters/powerpoint/` fixes only as needed | P8-V; P9 case inventory; parallel with P10/P11 | All five common documents have hashed static previews and editable PPTX downloads, exact source/profile provenance, named losses, actual PowerPoint save/edit/import/update/reopen witnesses for qualified operations. Conversion-engine renders remain separately labelled. |
| P12-G | Five-case Google Slides preview/edit cohort: host runners/evidence and isolated Slides fixes | P8-V; P9 case inventory; parallel with P12-P/M | Actual page thumbnails for all five common documents, source/revision/capture hashes and actual conditional writes; native text/reconnect plus presentation retention through a second cycle. Direct adapter transport versus host-wrapper trace evidence stays explicit. |
| P12-M | Five-case Miro preview/edit cohort: host runners/evidence and isolated editable-Miro fixes | P8-V; P9 case inventory; parallel with P12-P/G | Actual synthetic viewport/frame captures for all five common documents, stable before/after SDK observations, native edits/import/preserving updates and item preservation. Group/frame/annotation/shape-intent gaps remain separately named until mapped and proven. |
| P13 | Renderer-neutral catalog join: CONTRACT-085 amendment, `scripts/catalog/`, `microsite/` and tests | Data contract after P8/P9; incremental evidence from P10-P12 | One discoverable six-target capability/coverage matrix joins original examples and the separate integration cohort. Each target/profile cell distinguishes semantic export, rendering, edit/readback and retained-only coverage. Unsupported or unattempted cells show their actual reason; no synthetic host previews or plan-as-render badges. |
| P14 | Integrated regression and publication readiness: root CI/package/site gates and Sol review | Committed P8-P13 cohorts | Verify fixed hashes, current loss ledger, native/browser/packed public APIs, served preview hashes and fidelity. Close only cohorts with complete evidence; remaining target limits stay visible. Implementation completion or publication needs a later execution record. |

The P12 preview target is fifteen actual images: five shared corpus cases
times three host families, following the first same-source six-target slice.
Reported-loss images qualify as previews when visibly labelled with their
actual omissions; they do not qualify as complete semantic projections.

Each P10 package starts from P9's ranked mapping list, not a promise that every
format can represent all 22 forms. Group membership versus frame enclosure,
entity field IDs versus display names, directional arrows versus references,
and exact versus four-valued multiplicities require explicit probes. A genuine
model gap is deferred to a reviewed new model version. The current schemas are
not widened to make a renderer pass. Kroki, if later selected, is a renderer
backend for existing formats rather than another semantic target.

### Preview and evidence contract

Preview delivery is an early, independently useful outcome. P12 packages may
publish an honestly labelled lossy projection while its corresponding mapping
cohort is still open. A screenshot proves appearance, not semantic round-trip
or complete native interpretation. For every case retain exact input hash,
model/profile/mapping version, native engine/API/runtime, artifact/capture hash,
dimensions, observation stage, losses and bounded native-edit results. Tie a
preview to the current artifact/revision; refuse a stale or mismatched receipt.
Public host images must use isolated synthetic slides, viewports or frames.
The earlier Miro proof's 82 unrelated board items are not approved public image
content. A fresh regenerated artifact cannot inherit an older host capture
merely because its common source is unchanged.

- PPTX: use a named versioned conversion engine for automated PNG/SVG assets
  where suitable; qualify those as LibreOffice-rendered, not Microsoft
  PowerPoint-rendered. PowerPoint application evidence remains independent.
  The official [conversion-filter documentation](https://help.libreoffice.org/latest/en-US/text/shared/guide/convertfilters.html)
  supports command-line conversion, not visual equivalence across applications.
- Slides: obtain the actual latest-page PNG through
  [pages.getThumbnail](https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/getThumbnail).
  Request LARGE, then store approved synthetic image bytes and their hash with
  page/revision provenance. Returned URLs are account-tagged and short-lived;
  do not publish those URLs as permanent catalog assets.
- Miro: capture actual synthetic board viewport/frame views and compare SDK
  observations around capture. No automated Miro image API is promised without
  a separate verified capability. Preserve the current rich-text refusal;
  flattening rich text or interpreting opaque stencils is not an acceptable fix.

Owner-scoped annotation legends must stay legible without drowning the main
diagram. Provide focused and complete views where qualified, with an explicit
statement of omitted-from-focus metadata. Preserve unknown opaque native
material and all source projection gaps. Source blobs, bindings and screenshots
cannot remove a semantic loss.

### Continuation acceptance and validation

| Gate | Observable completion criterion |
| --- | --- |
| B1 Current truth | Current ordinary outcomes, selected profiles and older receipts are distinguishable; target/profile/view selection is stable and no fallback hides a refusal. |
| B2 Comparable improvement | Each implemented mapping cohort records before/after raw and normalized losses on identical source/profile pairs; newly supported pairs are separate. No gains from deduplication, changing fixtures or replacing ordinary results with annotated ones. |
| B3 Model and metadata bounds | Additional annotations have actual visible carrier identities and independent edited readback; intrinsic constructs stay native. Frozen 1.0 and explicit 1.1 cases pass their declared profile/version rules. |
| B4 Host examples | All fifteen shared-case/host pairs have actual previews and a repeated supported native edit/import/preserving-update cycle. An unavailable/unsupported pair remains open until resolved or explicitly deferred by the owner; it is not a passing completion outcome. The opaque-only refusal remains visible. |
| B5 Six-target inspection | Original 53 hashes and six integration witnesses remain intact. Catalog/export/ledger/source/readback/preview records agree by target/profile/version. Broken image, render failure, stale receipt and unavailable host are tested states. |
| B6 Fidelity and integration | Review all newly rendered cohort examples at readable scale for text, connectors, containment and clipping; real Chromium checks desktop/375px, keyboard/deep links, downloads and asset hashes. Packed Bun/Node and browser APIs pass; CI repeats required native gates before any publication. |

Reuse `bun run check:source`, `typecheck`, `test`, `build`, `test:package`,
`test:browser`, `build:catalog`, `test:catalog`, `report:loss:ledger`,
`build:site`, `test:site` and existing qualified native/profile checks. Root
must add named cohort/preview gates before claiming they ran; no new passing
command is invented here. Native engines, conversion, credentials and host I/O
stay outside portable source. Live captures are versioned evidence inputs;
offline CI verifies hashes, parsers and preservation without pretending to
rerun a live host. Missing host access blocks that host cohort only.

The next execution decision is to start P8/P9 and the P8-V six-target preview
slice in parallel within isolated files, then expand the five-case P12 cohorts
alongside P10/P11 mapping work. This plan sets no deadline, token budget or arbitrary count
of unsupported targets to eliminate. The previous selected-53 milestone remains
closed; it cannot substitute for these new current-loss and host-preview gates.

### Execution authorization and first allocation — 2026-10-31

After the planning-only snapshot above, the owner authorized P8-P14 execution
through completion. The dated planning observation remains historical; the
active runtime instruction now authorizes implementation and required
verification. No numerical usage budget was supplied and reliable usage
metering is unavailable here. Root retains shared integration, host I/O, CI,
source control and publication ownership; Sol maintains governance and reviews.

- Luna site owns P8/P13 UI selection and presentation in `microsite/` plus its
  UI/browser tests. Root owns the additive CONTRACT-085 data seam.
- Luna catalog owns P9 ranked current inventory and the P12-P preview runner
  with isolated data/native tests. The root alone joins catalog build outputs.
- Root starts P8-V/P12-G/P12-M actual host runners using the already approved
  isolated synthetic resources. No credentials or host I/O enter portable code.
- Next available Luna packages own format-local Lini and Mermaid cohorts under
  CONTRACT-087. Lini starts with the four-path flow canary, native title probes,
  flow/pipeline and entity eligibility; Mermaid starts sequence/ER probes.
  Root alone changes shared facade/types/capability dispatch.

Every completed package records exact source/evidence identities and test
outcomes here or in a linked execution receipt. Sol reviews semantic attribution,
native carrier fidelity, refusal/preservation and UI truthfulness before its
gate closes. Partial or blocked host pairs remain open under B4; none inherit
the earlier one-target-per-example success.

### Bounded review checkpoint — 2026-10-31

This checkpoint records partial execution, not P8-P14 completion. Sol found and
fixed Lini signed-number lexing, titled entity/scope/endpoint identity handling,
PPT cycle-verifier no-op acceptance and renderer receipt loss/provenance gaps.
Fresh focused integration checks pass 30 tests/517 assertions; source typecheck
passes. A later bounded follow-up passes 10 tests/419 assertions and typecheck,
including reported-loss pipeline/ladder receipt persistence and strict/report
replay policy with forged-baseline and identity-map refusals. Those checks do
not substitute for the remaining native/UI/CI gates.

| Gate / package | Observed result | Remaining evidence |
| --- | --- | --- |
| P9 current inventory | Separate ordinary/variant/host populations and raw evidence retained; repository-owned immutable planning baseline and exact ordinary-profile selection fix the clean-checkout/version attribution findings. Current ordinary raw counts are 629/792/530; 23 Lini title losses removed | Final generated ledger/probe report after integration; preserve bounded attribution and unknowns outside the actual field probes |
| P10-D | Graphviz JSON/SVG presentation/port probe in `scripts/native-dot-cohort.ts`; no new intrinsic ordinary-role/status mapping qualified | Completed under the reviewed amended eligibility criterion below; ordinary losses remain 629 → 629, with presentation losses and port refusal retained. Entity/field-port mapping remains a separate open candidate |
| P10-L/P11-L / P11-V | Native title/flow and signed-number/scope regressions pass. Independently rerun pinned entity and model-boundary probes pass: exact fields/declared endpoint edit, no inferred keys/cardinality, native runtime 1.1.0 can render 16 blocks while the frozen UMF mapping refuses its unsupported model | Keep key/cardinality/direction losses and pipeline geometry loss. These negative feature attempts establish the bounded mapping, not universal native impossibility; final ledger must retain that qualification |
| P10-M/P11-M | Independent Chromium rerun passes all five sources after wrapping and full-source coverage-locator corrections. Annotation widths are 330–551 pixels; hostile literal markup remains text. Source/model/mapping/native-source hashes are recorded. Four-fixture ER DB/SVG probe preserves field/cardinality meaning and explicit port/identification losses | Preserve final native receipts/assets through integration; ladder geometry remains reported loss and identifying metadata is not inferred into the frozen model |
| P12-P | Five required native no-op saves, exact independently declared UI label/endpoint edits, JSON/YAML source and binding persistence, changed UMF question, preserving update and actual PowerPoint Save As readback pass | Final preview/cycle join, visual inspection and integrated CI |
| P12-G | Five actual API cycles, different UMF preserving updates/readback, fresh double captures and JSON/YAML persistence are recorded; source-restored thumbnails are archived at 1600×900 | Final sanitized assembly after native-only preview layout, public receipt joins and asset/hash/UI validation; native API evidence does not claim editor UI actions |
| P12-M | All five exact-source cases pass independent private verification and sanitized assembly. Process has a clean cycle; other final update/restore recoveries retain interrupted fences. Nested/Frames have 17/26 qualified drift entries; fresh Curved/Network lineages have no unqualified drift | Preserve raw private captures and explicit recovery boundaries. Earlier interleaved attempts remain refusals and do not qualify fresh sequential cycles; no write retry or weaker fence is introduced |
| P8/P8-V/P13 | Independent generated-data gate passes all fifteen host pairs and the same-source six-target witness with zero issues. Final provenance and desktop/mobile six-target UI pass with 214 SVGs,53 examples and22 forms | Preserve the exact tested assets through final byte-reproducibility, Linux CI and served-site verification |
| P14 | Focused native/public tests and typecheck pass; CI adds native runners, installed-package/browser cases and the separate fifteen-preview/fifteen-cycle plus same-source six-target validator | Final integrated rerun after remaining join/assembler fixes and complete receipts; clean Linux CI, source/asset hashes, served-artifact verification and publication evidence remain required |

PowerPoint native proof is pinned in
[cycle receipt](../../../fixtures/renderers/powerpoint/native-cycle-receipt.json)
and [operator UI attestations](../../../fixtures/renderers/powerpoint/native-ui-attestations.json).
The verifier requires exact input/output hashes for the observed Mac 16.114.3
reopen/no-repair evidence. LibreOffice previews remain conversion evidence,
separate from those native UI cycles. Source semantic losses are retained.

No new merge, deployment or release is established by this checkpoint. Unproven
host pairs and unsupported native constructs remain open and visible.

The [continuation evidence](example-completion-evidence.md#p8-p14-continuation-review--2026-10-31)
records the refreshed review, current ordinary losses, host boundaries and
remaining publication checks. It does not close the open Miro or P14 gates.

Publication uses the [v0.3.0 candidate notes](../05-deploy/release-notes-v0.3.0.md)
and [release checklist](../05-deploy/deployment-checklist-v0.3.0.md). Both retain
the open fifteen-pair, final-source Linux and served-artifact gates; drafting
them does not establish a release or replace earlier closure history.

The [final local matrix review](example-completion-evidence.md#final-local-host-matrix-review--2026-10-31)
records the independent fifteen-pair pass and remaining publication gates.
Local host completion does not establish clean Linux or served release artifacts.

Post-fix local review closes the PowerPoint conversion-version and artifact-bound
native-open attestation findings. The final full suite passes 424 tests/13,141
assertions, plus 2 later attestation tests; all local native/public browser/packed
and host-matrix gates pass. Root is verifying repeated catalog bytes. Clean
Linux CI, archive digests and served-site identity remain open.

### P10-D fulfillment audit before merge — 2026-10-31

The original P10-D acceptance says, “Show reduced comparable ordinary-profile
omissions.” **That outcome is not achieved by this cut:** ordinary DOT remains
629 raw emitted-loss diagnostics on the same source/profile population. The
probe must not be described as an implemented loss reduction or as satisfying
that sentence.

The reviewed DOT assignment was the ranked role/status/style eligibility
cohort. Native Graphviz JSON/SVG and edited readback establish presentation
changes without an equivalent typed role/status interpretation. CONTRACT-086
requires actual meaning before mapping; choosing colors/shapes to manufacture
such an equivalence would violate that authority. The probe phase is complete;
its planned reduction outcome remains unmet. B2's implemented-mapping comparison
does not create a reduction where no mapping was implemented.

The native record-port witness identifies a separate adapter mapping candidate.
It does not qualify an ordinary entity/table parser, field identity transport or
reference semantics. Ordinary DOT currently exports the bounded flow family;
implementing entity/port support would add newly supported pairs, which B2
requires counting separately rather than subtracting from the comparable 629.
That candidate remains open in the bounded probe/loss report and is not silently
promoted into implemented support or dismissed as a native impossibility.

At this audit, the original acceptance remained active and its reduction outcome
was unfinished. The reviewed amendment below supersedes that acceptance, while
preserving the unachieved forecast and all source/metric scope. Future native
DOT mapping needs an approved field-specific cohort, independent native meaning
and edited readback. No deadline or completion version is established here.

### Reviewed P10-D eligibility amendment — 2026-10-31

Root implementation review accepted this evidence-driven amendment after Sol's
scope review. P10-D now closes the approved role/status/style eligibility cohort when
native and edited-readback evidence either qualifies a mapping or records its
bounded negative result. Demonstrated equivalences still require implementation;
this amendment does not permit replacing available native semantics with annotations.

The original forecast, “Show reduced comparable ordinary-profile omissions,”
remains **unachieved**. The comparable ordinary DOT population remains 629 → 629
raw emitted-loss diagnostics across the unchanged 53-source corpus. Graphviz
presentation changes do not establish typed role/status meaning, so no such
mapping or reduction is claimed.

P10-D's negative eligibility package is **completed under this amended
criterion**. Its source hashes, native JSON/SVG, edited-readback probes and
retained losses/refusals remain in `scripts/native-dot-cohort.ts` and the
[bounded probe/loss report](evidence/renderer-coverage-loss-progress.json).
This result establishes the tested profile boundary, not universal native impossibility.

Native record ports remain a separate **open entity/field-port mapping
candidate**. They do not qualify entity parsing, field identities or reference
semantics. New supported entity pairs must be counted separately from changes
to the existing comparable 629-loss population.

This amendment changes one package's acceptance, not the frozen models, fixture
scope or publication gates. The earlier 53-example/22-form suitable-target gate
is met separately; neither that milestone nor this probe establishes all-format
or whole-language completeness. Final follow-up CI, served-artifact identity and
release archive verification remain required.
