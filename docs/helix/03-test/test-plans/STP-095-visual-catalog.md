---
ddx:
  id: STP-095
  type: story-test-plan
  activity: test
  authoring:
    home: repo
  links:
    - id: US-095
      kind: informed_by
    - id: CONTRACT-085
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-087
      kind: informed_by
---

# Story Test Plan: STP-095 visual catalog

## Story Reference

**User Story:** [[US-095-visual-catalog]]. **Technical Design:** [[TD-095-visual-catalog]].
**Contract:** CONTRACT-085. **Project Test Plan:** TP-001.
The feature is FEAT-036; CONTRACT-086 supplies the underlying adapter behavior.

## Scope and Objective

Prove complete corpus discovery, honest export/render distinctions, usable
comparison and a reproducible static artifact. Existing native/library tests
remain required; a passing catalog does not expand adapter support.

Gallery expansion covers the pinned Lini checkout sequence, product mindmap and
commerce entities. YAML source must parse back to the exact payload, including
scalar types, multiline strings and ordered arrays; altered or stale displayed
YAML refuses qualification. Native sequence checks cover message order, endpoints,
self-call, return/async marks, note attachment/position and loop membership. Native
tree checks cover every topic, parent-child link, sibling order and icon ownership.
Entity checks retain exact fields, endpoint rows and asymmetric multiplicities.
Negative controls alter these actual native carriers while preserving matching
text elsewhere. Inspect each SVG/PNG and desktop/mobile source interaction.

## Acceptance Criteria Test Mapping

The named tests are planned implementation obligations until executed. Each
covering test must cite its AC using the indicated `@covers` annotation.

| AC ID | New or Existing Test(s) to Create or Run | Asserted Behavior (what the test verifies) | AC-ID citation | Primary layer | File or command |
| --- | --- | --- | --- | --- | --- |
| US-095-AC8 | Actual language reference | Exact schema/hash and actual kind/form table; primary reference is distinct from examples | `@covers US-095-AC8` | Data and Chromium integration | Catalog data tests and browser checks |
| US-095-AC1 | Corpus coverage and matrix | Exact fixture set, all forms and three targets; canaries separate | `@covers US-095-AC1` | Bun build-data integration | Catalog data tests |
| US-095-AC2 | Export-result parity and comparison | Status/source/diagnostics/maps equal actual selected public API result | `@covers US-095-AC2` | Bun build-data integration | Catalog data tests |
| US-095-AC3 | Native evidence and failure display | SVG hashes/engine versions valid; export success and render failure remain distinct | `@covers US-095-AC3` | Native/build integration | Catalog generator and native canaries |
| US-095-AC4 | Search and filter recovery | Composed filters update matches/counts; clear resets empty state | `@covers US-095-AC4` | Chromium UI | `scripts/catalog-ui-browser.ts` |
| US-095-AC5 | Selection deep links | Reload restores selected item/target; invalid selection recovers | `@covers US-095-AC5` | Chromium UI | `scripts/catalog-ui-browser.ts` |
| US-095-AC6 | Keyboard and narrow screen | Keyboard discovers/opens/switches; focus visible; 375px page has no horizontal overflow | `@covers US-095-AC6` | Chromium UI | `scripts/catalog-ui-browser.ts` |
| US-095-AC7 | Deterministic rebuild | Input/result/render identities match across unchanged builds; unsupported targets lack source/SVG | `@covers US-095-AC7` | Build integration | Repeated catalog build and hashes |
| US-095-AC9 | Independent renderer/profile/view selection | Explicit native links stay native; qualified renderer switches preserve intent or show unavailable; exact profile and view survive reload/keyboard selection | `@covers US-095-AC9` | Chromium UI | `scripts/catalog-profile-ui-browser.ts`, `tests/catalog/ui.test.ts` |
| US-095-AC10 | Six-target evidence matrix and native cohorts | Same-source six-target witness has six actual previews/artifacts; five-case host cohort has fifteen actual previews and qualified repeated cycles; plans/converters/host edits remain distinct | `@covers US-095-AC10` | Build, native host and Chromium | Catalog/integration data tests, renderer evidence verifier, host cohort receipts, catalog browser harness |
| US-095-AC11 | Current loss ledger parity | Current ordinary/variant/host results match source APIs; normalization preserves raw diagnostics and cannot count as native mapping gain | `@covers US-095-AC11` | Bun data integration | `tests/catalog/loss-ledger.test.ts`, catalog evidence tests |
| US-095-AC12 | Preview input/revision fences | Changed source/profile/model/mapping, artifact/capture hash or host revision invalidates image qualification; missing assets and unavailable host remain explicit | `@covers US-095-AC12` | Build and Chromium negative controls | Renderer evidence verifier, `scripts/catalog-ui-browser.ts` |

## Executable Proof

### Presentation showcase gate

CAT-16–CAT-18 and CONTRACT-089 add a separate visual-quality gate. Validate each
sourced showcase document using its declared vocabulary version; verify pinned
source snapshots and claimed architecture/schema relationships. Keep logical
metamodel containment distinct from database keys and nullability.

Exercise the public presentation compiler in packed consumers and Chromium.
Render its exact output through the named Graphviz/Mermaid runtime. Verify
labels on their own drawn objects, connection endpoints, group containment,
ordered stack membership, E/R field ports and exact multiplicities within each
backend's declared scope. Fail claims for clipping, obstructive overlap or
unreadable output at presentation size. Inspect the SVG and high-resolution PNG
artifacts, not a typed metadata appendix. Unknown native/visual content must
refuse or remain explicitly excluded from the visible view.

Build and verify `showcase.json` independently of the unchanged 53-example
catalog. The browser gate checks large diagram selection, backend switching,
exact DSL inspection, SVG/PNG downloads, keyboard access, mobile layout and
load/render failure states. Existing example/profile/hash links must reach the
same selection on `evidence.html`. Preserve all prior evidence checks there.
Visual review covers the primary diagrams and downloaded artifacts; structural
readback success alone cannot satisfy this gate.

### Active full-format gate

INT-10/11 and CAT-15 supersede the earlier suitable-target completion ceiling.
Qualify all 159 unchanged example/format pairs through explicit `/full/1`
profiles: strict export with no loss, actual named-engine rendering, complete
document readback and meaningful previews of all 22 forms in each format.
Approximation evidence is separate and cannot clear an omitted path.
Apply the same gate to the five common integration documents in each portable
format: 15 additional pairs, 174 total. Verify canonical full-route selection
in the six-target matrix, explicit compatibility access, exact complete/focused
input provenance and byte-identical existing host captures/receipts.

For each family, independently edit a native label/endpoint/value and an
owner-associated typed field, then import after JSON/YAML persistence. Test
empty/null/absent/order, unknown-content structure, conflicting/duplicate native
identities, hostile text, forged coverage/baselines and stale exact-source replay.
Check native AST completeness and actual SVG meaning separately from portable
self-roundtrips. Packed consumers and real Chromium must use the public API.
Compatibility profile sources, receipts and diagnostics must remain unchanged.

### Primary Commands

```sh
bun run build:catalog
bun run build:site
bun run test:site
bun run check:source
bun run typecheck
bun test
```

The implementation plan records actual command aliases and observed evidence.
Catalog UI checks live in `scripts/catalog-ui-browser.ts` and `tests/catalog/ui.test.ts`.
Data checks compare current source enumeration and selected facade outputs, not
hardcoded status totals. Keep generated verification receipts separate from
source-level intent; do not label planned tests as passing evidence.

### Coverage Focus

P0: actual language reference and complete example/target matrix, truthful losses, native-render provenance,
unsupported visibility, working comparison/navigation and safe source display.
P1: long labels/code, small-screen panels, missing images and catalog-load errors.

## Data and Setup

| Need | Source/strategy |
| --- | --- |
| Main corpus | All actual definitions under `fixtures/visual/`; current inventory is 50 definitions across 22 forms |
| Canaries | Repository-owned small graph/entities examples with explicit origin |
| Native engines | Actual Graphviz, Mermaid and pinned Lini runtimes; record separate versions |
| Browser | Real Chromium against assembled `dist-site/`, with desktop and 375px viewports |
| Error states | Deliberate missing catalog/image and a selected render failure without fabricated success |

## Edge Cases and Failure Modes

A timeline/metric with no supported target remains searchable and displays its
original source. A native render failure retains generated source and diagnostics.
Source text resembling markup remains inert. Long JSON and oversized SVGs scroll
inside their panels. No search matches provides a clear reset action.

## Build Handoff

### P8-P14 executable cohorts

Start with `process-documents-store` rendered through all six target families,
including actual host images. Then exercise all five shared integration cases
against each of PowerPoint, Slides and Miro: fifteen previews and fifteen
qualified repeated cycles. A supported semantic cycle includes native label
edit and an eligible attached-endpoint edit, native style/movement, fenced
import, serialized binding, a different UMF-owned update and actual native
readback. A structural operation outside the profile must explicitly refuse.
No-op/synthetic transport alone cannot satisfy the native cohort gate.
Record whether edits used UI or direct host API/SDK and whether the adapter
transport ran live or against trace replay. Do not promote API edits into UI
interaction evidence or offline transport into live execution.

For each pair assert source/profile/model/mapping identity, image input
artifact/capture hash, engine/runtime, positive dimensions, visible node/edge
text, arrow/endpoints and readable geometry. Keep native-only properties and
unrelated items unchanged; inspect captions and containment at useful zoom.
PPTX converter renders and actual PowerPoint application proofs are separate;
Slides/Miro captures must use isolated synthetic content. Stale or unavailable
host evidence leaves a pair open, not passed. Opaque-only refusal persists.

Portable profile tests cover complete-document native readback, annotation
carrier edits, version-specific fields, exact replay and stale/forged replay.
Native probes must independently justify Lini title/flow/pipeline/entity slots
and Mermaid sequence/ER eligibility. Unknown syntax/residual attributes, missing
or duplicate carriers, IDs/ports and unknown model/profile versions refuse.
Tests cite the applicable AC, but a citation alone is not passing evidence.

1. Finalize shared catalog data shape and enumerate fixture identities.
2. Generate matrix/native artifacts through public APIs and independent engines.
3. Build discovery/comparison UI against that data contract.
4. Run data/native/Chromium checks and inspect desktop/mobile screenshots.

Completion requires passing evidence for all ACs and real source/native versions.
No fake drawing may fill an unsupported target. Native/build dependencies remain
outside portable library source. Hosting success is verified separately from the
local static artifact and may not be inferred from a local build.

## Example Completion Increment

FEAT-035 INT-08/09, FEAT-036 CAT-09/10 and CONTRACT-087 add the owner-selected
release gate: every unchanged current example has at least one suitable strict,
complete target with independent native readback and a faithful preview. Preserve
native defaults and historical receipts; profile variants do not replace them.

| Gate | Required new evidence | Primary layer |
| --- | --- | --- |
| Field coverage | Exact typed annotation readback; per-pointer presence/order/member assertions; no parent-prefix suppression | Portable adapter and independent native |
| Edited recovery | Visible value edit adopted; missing/copied carrier, type/path conflict and stale receipt refuse atomically | Bun and actual Chromium |
| Complete corpus | 53 unchanged current source hashes, separate original/canary counts, selected strict target for each and all 22 forms | Catalog build/release |
| Faithful previews | Exact text/numbers/units/endpoints/order/membership; readable owner legends, no clipping/overlap; full and focused views | Native witnesses and browser visual review |
| Honest variants | Explicit annotation/native distinction, unchanged native targets, stable legacy and profile links | Catalog data and UI |

Tests MUST use actual current corpus enumeration. A nonempty SVG, source capture,
or self-roundtrip alone cannot satisfy these gates. The
[example completion plan](../../04-build/example-completion-plan.md) sequences
the packages and preserves post-release integration work as a later milestone.

## Lini and expansive-model presentation qualification

CAT-19 adds default-visible exact payloads and executable public API examples.
For each showcased source, Chromium MUST compare the visible payload with its
versioned envelope, copy it unchanged, download the full envelope, and exercise
every available backend. Creation, copied reads, atomic edits and JSON/YAML
serialization MUST also pass in portable and installed Bun/Node/browser clients.

Visual 1.2.0 tests cover explicit geometric shapes, generic container composition,
node-local ports and relationship identification. Frozen 1.0/1.1 snapshots and
interpretation MUST remain unchanged. Unknown nested layout content is retained
but incomplete; invalid targets, downgrades, dangling ports, ambiguous field/port
endpoints and foreign/duplicate layout members MUST refuse. Released interpreters
MUST NOT certify new model semantics through generic visible-record retention.

Pinned Lini native qualification MUST verify owned glyphs, visible labels/details,
group membership, actual layer/container direction and child order, field names
and same-row types/keys/nullability, exact row/port attachment and endpoint symbols.
Negative controls MUST include one adjacent-row path shift with unchanged native
endpoint attributes, removal of one exactly-one bar or nullable-end circle,
changed exact range text, altered port/glyph/label, and reordered native bands.
Compiler acceptance, matching text elsewhere and metadata alone are insufficient.
The native SVG MUST reproduce the stored PNG and the exact native source MUST
recompile to the admitted Lini artifact under the pinned runtime.

Public renderer package gates MUST resolve its declarations and all runtime
assets from an installed archive, verify the pinned executable hashes and bundled
notices, and execute actual browser output. The finite 100-record case must own
all declared record/field carriers; self and parallel connections must have distinct
native paths, while explicit undirected flow edges have no arrowheads. Corrupt
JS/WASM and malformed/active SVG refuse. A strict-parent-CSP test uses a separately
served same-origin module worker with its own explicit runtime/code-generation
policy; it MUST NOT claim direct strict-CSP import of the current core library.

## UX Coverage

| Pattern | Disposition | AC IDs or Reason | Evidence |
| --- | --- | --- | --- |
| navigation | covered | US-095-AC4, US-095-AC5, US-095-AC8, US-095-AC9 | Chromium target/profile/view selection and reload checks |
| keyboard-overlays | covered | US-095-AC6, US-095-AC9 | Native control/focus checks; no modal required |
| async-actions | covered | US-095-AC3, US-095-AC12 | Catalog/image loading, stale evidence and failure checks |
| forms | covered | US-095-AC4 | Labelled search and filter controls |
| data-states | covered | US-095-AC3, US-095-AC4, US-095-AC10, US-095-AC11, US-095-AC12 | Projection/render/cycle, current loss, unsupported, unavailable, stale, empty and loaded states |
| destructive-actions | not-applicable | Static read-only catalog has no mutation/destruction action | Source review |


## Source-derived review qualification

Verify exact definition/common/native hashes, unchanged capture bytes, synthetic
source attribution, exact YAML copy and downloads, and stale/forged evidence join
refusal. Recompile each portable variant and replay native geometry/image checks.
Visually inspect every emitted original and derived output at presentation size
and mobile width; verify nesting, carrier labels and connector attachment.
Unsupported targets and retained-only host meaning remain visible rather than
being promoted by new portable output. Exercise generic viewer selection and
keyboard controls; reject fixture-specific renderer branches in interface review.
For explicit 1.4.0, verify typed node/participant process role and independent shape, frozen 1.3.0
schema/manifest behavior, explicit upgrading and unchanged authoring defaults.


Draft 1.4.0 routing checks cover optional curved/straight edge intent, unspecified
absence, frozen 1.3.0 behavior and JSON/YAML persistence. Native checks bind each
route to its own connector and endpoints, distinguish non-collinear curves from
straight paths, and reject straightened-curve mutations. Include mixed-intent
inputs so global renderer settings cannot silently flatten edge distinctions.
Exact control points are preserved native evidence, not common-model equality.


## Second-cycle document stencil checks

Verify explicit draft 1.4.0 single-document and multiple-document shapes, role/count
independence, unknown-content preservation, exact JSON/YAML editing and frozen
1.3.0 behavior. Qualified native output must own distinct readable stencil
geometry, labels and attached connectors. Negative controls remove the multi-sheet
geometry or substitute concentric borders while leaving matching text; those
controls must fail the stack claim. Verify no invented sheet nodes or cardinality.
Pinned Mermaid 12.2 `doc`/`docs`, Graphviz and Lini mappings each require their own
execution proof and located approximations. Recheck generic shape consumers,
cycle 1 receipts and public browser/package boundaries when touched. Preserve
original host source/profile/capture identity; no new host capability follows
from improved portable presentation.


For Mermaid document-stencil connections, test actual native linear routes whose
shape attachments yield bent polylines. Admit only source-straight, owned-linear,
single-code, no-curve interpolation approximations; require measured geometry and
visible caveat. Curved-request angular-polyline negative controls MUST still fail.
Graphviz document stacks must have genuinely offset sheet geometry; concentric
peripheries fail the stack claim even when text and outlines remain present.


## Third-cycle circular composition checks

Verify circular layout admission in existing root/group composition scopes,
optional exact direct-child clockwise order, state top-level membership, stack
order consistency, JSON/YAML persistence and frozen-model behavior. Test located
renderer refusal/approximation outside the actually qualified circular subset.
For supported native output, bind all node/edge identities and labels, perimeter
placement, cyclic clockwise order and actual endpoints. Scrambled-order,
off-perimeter and missing/reconnected-edge controls must fail their claims.
Review manifests must distinguish a new circular presentation choice based on
historical host output from the native witness's separate 4×4 geometry; neither
arrangement silently replaces the other's source identity.


Circular execution checks bind the optional typed Graphviz engine/fixed-position
descriptor to native source, receipt, replay and client-derived recipe JSON.
Unknown engine/mode combinations and forged descriptor/source pairs refuse.
Verify recipe source hash, native version and downloaded basename; never infer
executable options from arbitrary source text. For neato/fixed native line routes,
measure actual CSS deviation and unit-consistent chord ratio, retain the strict
qualified straightness checks, and reject bowed or backtracking mutations.
Compare unrequested compass anchors with natural boundary clipping; preserve
authored ports and curved-route policies. Circular Lini output replaces
only linear-order proof with circular-order proof; ownership, attachment and
containment checks remain in force.


## Fourth-cycle annotation checks

Verify optional annotations across all diagram kinds, exact JSON/YAML text editing,
shared identity collisions, walkthrough focus where already supported, and refusal
as graph endpoints/layout members. Preserve sequence-note semantics and frozen
1.3.0 unknown annotation behavior. Native annotation maps must bind stable source
IDs to their own exact text carriers; removal, changed text and matching text in
a different carrier must fail. Inspect readable text placement independently of
node/group membership and native frame identity. Recheck primary endpoints,
scoped routing and containment after any drawing wrapper/layout change. Unsupported
annotation forms/combinations must refuse or disclose omission explicitly;
source admission alone is not native support.


## Fifth-cycle port and curved-caption checks

Preserve existing caption/edge ownership, source identities and region membership.
Distinguish native attachment-name normalization from explicitly review-authored
side hints; neither creates business interface meaning. Native checks bind the
named endpoints, authored sides, actual non-collinear curved path and its own
caption. Straightened-path, reconnected-endpoint and caption-moved-to-another-
carrier controls must fail the corresponding realization claim. Exact native
control points remain companion content. An interpolation approximation or retained
source cannot certify actual curvature; preserve earlier source/profile limits
and recheck affected generic port/routing consumers.


## Authoritative entity-source review checks

Bind authoritative-UMF provenance to exact source bytes, source path/hash,
document/visual IDs and model version; reject mismatches and unknown kinds.
Verify exact source/YAML downloads without forced capture/omission fields and
retain prior integration-witness UI behavior. Inspect actual quoted/Unicode glyphs,
owned entity/field/key/nullability rows and relationship endpoint cardinalities.
Missing glyphs cannot pass through string coverage alone. Preserve unspecified FK,
field binding and identification meaning; native grammar constraints require
neutral composition or explicit refusal. Mutated source identities, moved field
labels, altered relationship multiplicity and wrong entity attachments must fail
corresponding claims. Check prior native/catalog/review and public boundaries
when their generic rendering or provenance interfaces change.

A neutral entity-card fallback must prove source-owned field rows and reference
carriers, exact label/cardinality text, and attachment to the correct entities.
An unarrowed association must not manufacture identifying/non-identifying or
directional meaning. Test missing/moved cardinalities, changed reference labels,
wrong entity attachments and mixed explicit identification: preserve the explicit
meaning or refuse the affected projection. For Lini body-level endpoint markers,
prove one connected same-link assembly from the line terminal to the entity
boundary; detached, wrong-end and missing bridge mutations must fail. Field/port
endpoints retain their row/side-specific attachment checks.

Cycle 7 closeout: the unchanged authoritative entity canary qualifies all three
native presentation backends, including the neutral Mermaid projection. Actual
quoted/Unicode glyphs and complete field rows were visually approved. The quiet
full suite passes 672 tests with 19,712 assertions across 98 files; current
source/type, native replay, corpus, browser, packed-consumer and shared-site
gates pass. This evidence qualifies the bounded presentation profiles, without
expanding historical host support or changing the canary's Visual 1.0.0 source.


## Flow-caption native conformance

Check exact owned caption text, actual connector clearance and endpoint marker/node
overlap across renamed LR/TB, multiline and parallel-edge controls. Include
compatible grouped layouts with authored member order; test both partial crossing
of endpoint frames and placement inside an unrelated frame. Restore the original
native baseline before each independent mutation so one earlier failure cannot
mask a later ineffective control. Renderer sizing/offset estimates remain
heuristics; native measurements and visual inspection establish qualification.
Recheck affected grouped, curved, ancestor/descendant and named-port views after
changing shared caption policy, preserving source meanings and existing strict
clearance thresholds.

Cycle 8 closeout: quiet full suite passes 677 tests, zero failures and 19,765
assertions across 99 files in 160.82 seconds. Actual three-backend flow canary
images and the affected grouped Lini view were visually approved. Native/corpus,
source/type, browser, packed-consumer and shared-site gates pass, including
independent caption/path/frame mutation controls. This qualifies the tested
generic caption policies without changing the authoritative Visual 1.0.0 source
or expanding historical host support.


## Shared inspection UX checks

Verify Fit and fixed native-size modes independently across viewport resize,
bounded zoom controls, visible scale and scroll/pan reach. Test reopening, scene
and backend resets, unsupported-state cleanup and late image-decode races.
Maintain keyboard dialog focus, Escape closure and focus restoration. At a narrow
viewport, leave source disclosures expanded while checking page bounds: exact
YAML/code must scroll internally and long references/hashes wrap without
truncation or text mutation. Recheck original SVG download hashes after viewer
interactions. Shared showcase/review views must use the same behavior without
fixture-specific dispatch; no change in native rendering or model support is
implied by these inspection controls.

Cycle 9 closeout: quiet full suite passes 679 tests, zero failures and 19,797
assertions across 100 files in 178.54 seconds. Both shared inspection browser
suites pass native-size/Fit, bounded zoom/pan, lifecycle cleanup/reset, keyboard
and narrow expanded-source checks, preserving original download hashes. The
exact Visual 1.0.0 source and its absent/default properties are unchanged; no
native compiler/model support expansion is claimed.


## Flat state-machine conformance

Verify exact state label/detail ownership, one native transition per authored
item, directed attachment and event/guard/action caption ownership. Separate
initial/final helper paths from authored transition counts; reject missing,
misattached and unrequested final markers. Preserve outgoing transitions from
final states and initial/final overlap. Include renamed reciprocal/self and
distinct-caption parallel controls; identical ambiguous Mermaid locator tuples
must refuse. Mutation tests must independently fail wrong SVG IDs, changed
captions, missing helper links and forged final outlines. Check actual title
containment and reciprocal-caption association/clearance visually and natively.
Unsupported composite/layout/property subsets must refuse without source edits;
no final/guard meaning may be inferred from source labels.

Cycle 10 closeout: quiet full suite passes 699 tests, zero failures and 19,949
assertions across 104 files in 210.87 seconds. All native/corpus/review/UI,
public-browser, packed-consumer, source/type/build and actual visual audits pass.
The exact Visual 1.0.0 authority remains unchanged. Evidence qualifies the
bounded flat state-machine profiles and disclosed Mermaid locator uniqueness;
unsupported composite/order/property subsets remain explicit refusals, without
vocabulary changes or expanded historical host qualification.


## Date-history native conformance

Verify UTC/Gregorian date validation, early years, leap boundaries, stable equal
dates, unsorted source arrays and source immutability. Bind every event's exact
label/date to its whole-item pointer and native owner. For proportional views,
check rendered SVG positions as well as AST day ratios; moving only the SVG
carrier must fail. Test same-date shared x and readable separate labels, and a
single-date native case without an invented nonzero span. Native axis helpers
must remain undirected/unmapped and no event-to-event causal paths may appear.
For categorical ledgers, inspect actual row-major card bounds, visible title and
nonproportional-spacing/reading-order cue, exact dates, no event edges and helper
exclusion from event counts. Reject overlap/clipping and quantitative packing
axes; inspect actual artifact readability. Known unsupported subset codes remain
explicit capability refusals; unknown/internal or mixed invalid-source errors
must remain failures.

Cycle 11 closeout: quiet full suite passes 712 tests, zero failures and 20,317
assertions across 108 files in 178.83 seconds. All source/type/build, native
corpus/review, shared UI, public-browser, packed-consumer and actual visual audits
pass. Exact G/L date geometry, same-date ownership and the visible categorical
Mermaid ledger qualify their bounded profiles; all Lini base checks remain
required. The exact Visual 1.0.0 authority and historical locator limits are
unchanged, without vocabulary or host-support expansion.


## Sequence adaptation and authored-context checks

Verify disclosed ladder/lifelines adaptation, native title containment and exact
participant/message order, endpoints and kinds. Inspect owned detail/role/status
cells in both native structure and actual SVG; independently mutate text or
move a cell to another participant and require failure. Recheck process-role
conventions and other sequence shape/note/frame profiles after shared carrier
changes. Assert actual SVG has no unrequested activation intervals.

Shared context tests must cover the validator's global focus declaration universe,
full source pointers, explicit unresolved/ambiguous targets, exclusion of local
fields/ports, and numbering unaffected by when/tag steps. Verify exact authored
metadata and ordered focus lists on both pages, without a native highlighting
claim. Check scene/backend refresh, digest-versioned shared helper deployment,
expanded mobile bounds and unchanged source/download hashes.

Cycle 12 closeout: quiet full suite passes 720 tests, zero failures and 20,440
assertions across 110 files in 152.09 seconds. All native/corpus/review/shared UI,
public-browser, packed-consumer, source/type/build and actual visual/interface
audits pass. Evidence qualifies owned participant metadata, suppressed native
activation, disclosed ladder/lifelines adaptation and read-only authored-context
inspection. Exact Visual 1.0.0 source and historical locator limits remain
unchanged; unsupported backends remain explicit, without vocabulary or host
support expansion.


## Rating-quadrant conformance

Check exact axis identity/ranges, owned labels/low-high anchors, logical/source
map identities, and actual affine marker positions at zero/max and interior
ratings. Swapped axes, moved markers, forged map IDs, changed caveat/choice and
visible chart scaffolds must independently fail. Keep optional detail/value-note/
takeaway/annotation ownership controls under appropriate source model versions;
never infer support for newer annotation fields in frozen legacy models. Inspect
contrast, marker/label containment, no invented causal/midpoint meaning and all
shared fit/clipping/font/overlap checks. Context tests cover mixed measure types,
missing values, exact pointers and authored rather than computed choice, plus
expanded mobile table scrolling and unchanged source/download hashes.

Cycle 13 closeout: quiet full suite passes 729 tests, zero failures and 20,546
assertions across 113 files in 145.96 seconds. All source/type/build, native
corpus/review/shared UI, public-browser, packed-consumer and actual visual/interface
audits pass. Exact rating geometry, owned text and invisible scaffold qualify the
bounded Lini profile; read-only comparison context preserves absent values and
authored claims without ranking. The exact Visual 1.0.0 authority and historical
caveat/locator remain unchanged, without vocabulary or host-support expansion.


## Scalar-meter conformance

Check exact value/unit/series, target and admitted baseline/comparison/good/format
ownership. Native geometry must use actual axis-owned ticks and screen-space
transforms consistently; independently move the bar, reference rule or label and
require failure. Include over-target, negative, zero and degenerate-domain cases,
finite computed bounds and source immutability. Formatting checks must inspect
tick carriers rather than unrelated numeric labels, and authored literal percent
text must not be mistaken for a newly calculated percentage. Qualify admitted
fractional-format behavior or report its exact subset limit without changing
source numbers. Context checks preserve raw values, absent fields, point indices
and full pointers without derived progress or external-ledger claims.

Cycle 14 closeout: quiet full suite passes 743 tests, zero failures and 20,700
assertions across 116 files in 149.31 seconds. All native/corpus/review/shared UI,
public-browser, packed-consumer, source/type/build and actual visual/interface/
model audits pass. Raw-domain calibration remains independent of rounded glyphs;
negative/zero/over-target and coincident-reference ownership controls qualify the
bounded native meter. Exact Visual 1.0.0 source and historical ledger limits are
unchanged, without a semantic maximum, derived progress or host-support expansion.


## Temporal-stat conformance

Verify forward/inverse calendar round trips across epoch, early-year and leap
boundaries; inspect actual native tick date strings and affine positions. Test
source reversal without mutation, uneven gaps, plateaus, duplicate observations
and tied latest dates retaining all source pointers/readings. Validate raw y
geometry and exact format/default precision on fractional, narrow and all-zero
domains, using the raw tick plan rather than recomputing a step from padded bounds.
Changed date captions, moved markers, missing guides and forged ownership maps
must fail independently. Check exact optional text and metadata carriers, native
observation-grid heading/reading order and visible straight-guide disclaimer,
with readable unclipped artifact bounds and no inferred current/growth claim.

Cycle 15 closeout: final isolated suite passes 762 tests, zero failures and
21,000 assertions across 120 files in 180.53 seconds. All native/corpus/review/UI,
public-browser, packed-consumer, source/type/build and actual visual/interface
audits pass. A prior full run caught a stale test-only whole-form stat refusal;
the corrected test preserves the precise subset boundary and production/source
were unchanged. Calendar/tick geometry, duplicate/tied observations and readable
dated summaries qualify the bounded profile without current-ledger, inferred
growth or host-support claims; exact Visual 1.0.0 authority remains unchanged.


## Categorical-bar conformance

Verify category order and ID joins with a permuted point array, preserving
original source pointers. Inspect exact category/unit/series/value ownership and
a visible zero row. Test negative/fractional/explicit-precision/default-format
controls, numeric category labels and text collisions across metadata carriers;
hiding a required unit/series label must not pass by borrowing category text.
Raw tick-slot calibration must remain independent of rounded glyphs and reject
nonfinite/ambiguous/displaced anchors. Structural native locators require exact
AST slots plus rendered row/value geometry, not fabricated SVG IDs. Unknown
category extensions and unsupported relation subsets remain located refusals;
shared fit/clipping/font/overlap and prior meter regressions remain required.

Cycle 16 closeout: isolated full suite passes 782 tests, zero failures and
21,218 assertions across 124 files in 148.18 seconds. All native/corpus/review/UI,
public-browser, packed-consumer, source/type/build and actual visual/model/interface
audits pass. Category-ID joins, exact zero rows, structural locators and shared
raw-tick calibration qualify the bounded native bar profile without changing
source values or inferring status semantics/aggregates. Exact Visual 1.0.0 source,
strict interchange and historical locator limits remain unchanged.


## Multi-series temporal-line conformance

Verify shared UTC/value scales with reordered series/points, unequal date sets,
plateaus, fractional/default precision and source immutability. Bind each exact
value cell to its date row and source-series column; swapping columns, changing
dates or redirecting a guide across series must fail. Inspect source-order neutral
legend identity, every original point mapping and visible title/question/unit,
format, global good-direction and admitted optional text carriers. Missing dates
must remain blank. Include valid single-series and repeated-date controls retaining all original
pointers, with no invented intra-day measurements or duplicate zero-length guides.
A public singleton must retain the located core VISUAL_FORM_RULE boundary rather
than become a target capability refusal.
Shared numeric-scale extraction retains stat regressions, raw tick calibration and
finite-domain checks; standard native fit/clipping/font/overlap remain mandatory.


Cycle 17 closeout: isolated full suite passes 802 tests, zero failures and
21,620 assertions across 128 files in 152.99 seconds. All native/corpus/review/UI,
public-browser, packed-consumer, source/type/build and actual visual/model/interface
checks pass. Shared UTC/raw-value scales, exact source-indexed date/series cells,
neutral legend and within-series guide ownership qualify the bounded Lini line
profile. Sparse/repeated dates, raw/default precision and existing stat behavior
remain covered. Exact Visual 1.0.0 authority, core cardinality, historical locator
limits, strict interchange and host qualification remain unchanged.


## Tree composition conformance

Compare absent-layout and explicit-tree views across supported directions, exact
parent/nesting ownership and authored sibling order. Missing or redirected native
hierarchy links must fail; generated links do not count as authored edges. Verify
explicit hint precedence, located incompatible-layout refusal, metadata ownership
or omissions and immutable source bytes. Native spacing changes require existing
bilateral/deeper-tree regressions and actual route readability, alongside shared
fit/clipping/font/overlap checks.


Cycle 18 closeout: final isolated suite passes 810 tests, zero failures and
21,720 assertions across 130 files in 152.15 seconds. All required native/corpus,
review/UI, public-browser, packed-consumer, source/type/build and actual visual/
model/interface audits pass. Per-parent AST order and direction-aware SVG sibling
checks cover non-preorder arrays and TB horizontal swaps without changing source
semantics. A prior full run exposed stale header adjacency assertions only;
independent semantic expectations remain retained. Absent-layout tree composition
qualifies the existing Lini profile without current-inventory verification,
vocabulary changes, invented authored edges or host-support expansion.


## Event-only milestone conformance

Exercise history and milestones through public compilation, native build, replay
and mandatory-check dispatch with identical event/date ownership obligations.
Include coincident events, moved same-date markers, altered labels and ledger
order mutations. Exact-axis short/long date ranges retain affine rendered-center
ratios and exact same-date equality under renderer-selected width; categorical
ledgers retain their visible nonproportional-spacing caveat. Existing history and
single-date regressions remain required. No source-array mutation or external tag
verification may be inferred from the review.


Cycle 19 closeout: isolated full suite passes 817 tests, zero failures and
21,989 assertions across 133 files in 165.57 seconds. All native/corpus/review/UI,
public-browser, packed-consumer, source/type/build and actual visual/model/interface
checks pass. Milestone and history forms share exact event ownership and mandatory
native proofs; short-range adaptive width preserves affine dates/same-date equality
without changing tolerances or long-range behavior. Exact Visual 1.0.0 authority,
historical tag-locator limits, portable vocabulary and strict interchange remain
unchanged; no current external-history or host-support expansion is claimed.


## Before/after comparison conformance

Verify exact item/criterion joins with reordered value arrays, original pointers,
text/support distinctions and immutable source. Preserve core incomplete-matrix
validation without invented no values. Check actual native AST cell text/order and
rendered declared header/criterion order; whole-row/column swaps, changed support,
hidden text and forged AST cells must fail independently. Inspect typed measure
projection disclosures and exact optional-field diagnostics. Long/multiline text,
notes and details retain visibly identified owners, unclipped native blocks and
full-source reconstruction from actual AST/visible lines; missing final lines or
words must fail even when expected wrapping shares compiler utilities. Existing
comparison and shared fit/clipping/font/overlap checks remain required.


Cycle 20 closeout: isolated full suite passes 821 tests, zero failures and
22,168 assertions across 135 files in 188.98 seconds. All native/corpus/review/UI,
public-browser, packed-consumer, source/type/build and actual visual/model/interface
checks pass. Typed text/support cells, declared matrix order and independently
reconstructed complete wrapped content qualify the bounded Lini table. Core form
validation, exact Visual 1.0.0 authority and historical PRD locator limits remain
unchanged; no inferred winner, current-state verification, portable vocabulary
change or host capability expansion is claimed.


## Period/lane roadmap conformance

Test reordered period/lane arrays and ID joins, same-period and multi-period spans,
overlap subtracks, source-index stability and source immutability. Inspect actual
AST/SVG identities and complete wrapped label/status recovery, exact bar counts,
period midpoint alignment and declared order. Moved lanes/endpoints, shifted period
labels, hidden or changed statuses, missing label lines and phantom bars must fail.
Verify finite ordered grid boundaries and actual CSS-scaled inclusive insets across
native fit sizes. Packing remains renderer policy; proof requires disjoint owned
intervals rather than a particular first-fit assignment. Control-character errors
and escaped unknown-field paths remain precisely located, with shared native
fit/clipping/font/overlap and earlier timeline regressions retained.


Cycle 21 closeout: isolated full suite passes 835 tests, zero failures and
22,333 assertions across 138 files in 152.16 seconds. All native/corpus/review/UI,
public-browser, packed-consumer, source/type/build and actual visual/model/interface
checks pass. Exact period/lane joins, inclusive span cells, literal statuses and
complete wrapped labels qualify the bounded Lini roadmap. Native source/order,
midpoint/interval geometry, hidden/phantom controls and overlap subtracks retain
independent source ownership without imposing private packing choices. Exact
Visual 1.0.0 authority and historical PRD/status limits remain unchanged; no elapsed
time, current delivery verification, vocabulary or host expansion is inferred.


## Dependency-pipeline conformance

Verify converging independent roots and downstream dependencies across native
backends, with exact node/edge identity and no extra serial/helper dependencies.
Test DAG source-order ties, both presentation directions, explicit layout precedence,
cycles/headless fallback and retained return links. Native moved-rank, redirected
endpoint and extra/missing node/edge controls must fail their applicable checks.
Where native question/takeaway are drawn, verify exact text/owner maps and remove
stale omission claims; backend-specific retained omissions remain explicit. Shared
flow fit/clipping/font/overlap, caption ownership and mandatory check inventories
remain required without inferred timing, business status or producer semantics.


Cycle 22 closeout: isolated full suite passes 849 tests, zero failures and
22,520 assertions across 142 files in 151.97 seconds. All required runtime/corpus
and final affected review/UI, public-browser, packed-consumer, source/type/build
and actual visual/model/interface checks pass. Generic dependency ranking preserves
DAG edges and explicit layouts; source-backed review enrichment retains original
JSON plus matching YAML as separately hash-bound evidence. Positive late-Blob
creation/revocation, exact source downloads and fresh native replays pass. Existing
Visual 1.0.0 fields carry runner/command/trigger prose without new domain vocabulary,
current-workflow verification or host-support expansion.


Cycle 23 data-only closeout: source 4/67 and native 1/38 focused checks, typecheck,
fresh 22-document/48-variant SVG/PNG review replays, review/showcase UI, source
hash/download/race controls and public-browser/packed-consumer checks pass. The
review preserves exact original JSON plus matching YAML and enriches existing
fields with literal schedule/dispatch and eval-command facts only. Runtime and
source-authority code are unchanged; full/unchanged corpus suites were deliberately
not rerun. Shared UI test correction uses actual Fit scale without weakening 100%
intrinsic sizing or clamp/reset/mobile behavior. No timezone/callee/current-state,
model or host qualification is inferred.


Cycle 24 data-only closeout: source 4/72 and native 1/39 focused checks, typecheck,
fresh 23-document/51-variant SVG/PNG review replays, 23-example review UI, exact
source/YAML download/hash/race/viewer controls and public-browser/packed-consumer
checks pass. Exactly three runner/command details derive from the matching local
snapshot; original IDs/DAG/version and trigger prose remain unchanged. Real native
PNG bytes match the visually approved preview. Runtime/proof/source-authority code
is unchanged, so full/unchanged corpus suites were intentionally not rerun. No
current execution, environment, result or host qualification is inferred.


## Native caption-cutout conformance

For a qualified native on-path label strategy, inspect connector-owned mask
references, exact mask/element transforms, glyph coverage margin and surviving
painted stroke near the caption and endpoints. Corroborate effective visible ink
with pinned native paint/pixel evidence. Removed/disabled/shrunken masks and
unresolved ownership must fail; overbroad cutouts removing meaningful connector
ink must fail independently. Retain off-path clearance controls and all caption/
frame/source ownership checks; do not replace these with a numerical waiver.


Grouped-flow native conformance additionally checks top-level component placement
without source mutation, explicit-layout precedence and cycle/headless fallback.
Retain internal/return/cross-group edges, exact caption recovery and independent
frame-crossing negatives. Graphviz tooltip wrappers require owned descendant
path/arrow traversal constrained by the nearest native edge carrier; missing owned
paths/arrows still fail. Default-direction qualification does not qualify alternate
directions with failed font/mask/frame checks.


Cycle 25 closeout: final isolated suite passes 868 tests, zero failures and 22,904
assertions across 149 files in 158.05 seconds. All required native/corpus/review/UI,
public-browser, packed-consumer, source/type/build and actual visual/model/interface
checks pass. Default-LR grouped-flow composition and owned native label cutouts
qualify with differential path/arrow paint, mask mutations and independent frame
controls; TB remains unqualified. Exact fictional selected-view JSON/TOML source
and all graph semantics remain preserved. No current deployment, vocabulary,
strict-interchange or host capability expansion is inferred.
