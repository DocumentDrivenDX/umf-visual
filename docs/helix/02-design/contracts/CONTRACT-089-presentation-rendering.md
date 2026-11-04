---
ddx:
  id: CONTRACT-089
  type: contract
  activity: design
  authoring:
    home: repo
  links:
    - id: FEAT-036
      kind: informed_by
    - id: CONTRACT-083
      kind: references
    - id: CONTRACT-085
      kind: references
    - id: CONTRACT-086
      kind: references
---

# CONTRACT-089: Presentation rendering and diagram showcase

**Type:** library projection and static showcase. **Version:** 1.1.0.

## Purpose

Render the shared visual DSL as readable diagrams suitable for presentation
artifacts. Qualify visible output separately from complete interchange readback.

## Scope and Boundaries

The portable presentation compiler consumes the existing `umf.visual` payload
in a public UMF document. Themes, direction and typography are renderer options;
they MUST NOT introduce application-specific vocabulary definitions. Native
Graphviz, Mermaid and Lini execution remains host-side. The library MUST NOT import
Bun, Node or a native renderer into its browser-compatible entry point.

Initial presentation views cover flow/network, including grouped dependency
views, plus structure/stack and entities. Other forms MUST refuse until
implemented. Ordered stack membership and directed dependencies remain separate
authored views; the renderer MUST NOT invent arrows in a structure stack.

## Normative Surface

`compilePresentation(document, options)` is exported through the separate
`/presentation` package entry. Options select `backend: graphviz | mermaid | lini`,
optional `direction: LR | TB` and `theme: presentation/1`. The default direction
is LR. Themes are versioned independently of the visual model and interchange.

Success returns `ok:true`, `profileId:umf.visual.presentation/1`, backend, native
`nativeFormat` (`dot`, `mermaid` or `lini`), exact native `source`, `elementMap`, `omissions` and
`approximations`. Each mapped element identifies its logical ID, source pointer,
native ID and kind. Omissions identify source paths excluded from the visible
view and why. Approximations identify requested meaning and its actual visible
representation. Failure returns `ok:false` and actionable diagnostics; it MUST
NOT return a successful source. Input documents MUST remain unchanged.

The presentation route is a projection, not an editable interchange profile.
It MUST NOT claim round-trip preservation from its display source. The original
DSL document and full interchange routes remain separately available.

Architecture output MUST display each node label/detail, group label and nested
membership, and authored connection endpoints/labels. Store/document/actor roles
and emphasis MUST use a declared visual convention or an explicit approximation.
Stack output MUST display layer order and membership. E/R output MUST display
entity names, field names/types, supplied keys/nullability and association
multiplicity. A field-bound connection MUST attach to the actual field on a
qualified field-port backend. An entity-level backend MUST disclose its weaker
endpoint representation and MUST NOT qualify as field-port equivalent.

The static `showcase.json` has schemaVersion 1 and an `examples` array. Each
example has stable id/title/description/kind/form, exact `definition`, relative
`definitionPath`, `definitionSha256`, source references and rendered variants.
Each variant records backend, engine/nativeVersion, native source path/hash,
SVG path/hash, PNG path/hash, dimensions, element map, omissions, approximations
and source-bound quality evidence. Failed or unqualified output MUST be explicit.

The homepage MUST show a small curated set of diagrams with backend selection,
definition inspection and SVG/PNG downloads. Detailed schema and conformance
UI lives at `evidence.html`; existing example/profile/hash links preserve their
selection there. The original 53-example corpus and diagnostics stay unchanged.

The exact versioned visual payload MUST be visible as YAML by default, with a bounded
source panel, YAML copy access and a separate full-envelope JSON download. Each example
MUST show executable public API usage for reading, editing and compiling that
definition; hand-written summaries MUST NOT masquerade as the source.

Lini qualification uses the independently pinned runtime and native themeable
SVG, native nested containers, card/entity cells and real connection anchors.
Fields MUST remain associated with their owning entity and their own type,
key/nullability text and endpoint geometry. Conventional endpoint cardinalities
MUST use their actual native markers; nonstandard ranges require exact visible
relationship-owned labels and a located approximation. Unspecified endpoints
MUST remain unspecified. No identification classification is inferred.

For 1.2.0, declared shapes, layout intent, ports and relationship identification
are authored input, independent of an interpreter's capabilities. Each target
MUST realize them or report an explicit located approximation/refusal. Theme
colors, typography and pixel spacing remain outside the semantic payload.

## Precedence and Compatibility

CONTRACT-083 owns visual meaning; CONTRACT-086 owns native interchange.
CONTRACT-085 retains the existing catalog schema and its evidence obligations.
This contract amends reference-first page ordering through CAT-16–CAT-18 and
adds independent presentation assets. It does not upgrade model versions or
reinterpret existing profiles. Visual 1.0.0 and explicit 1.1.0/1.2.0 source identity
MUST remain visible. Unknown content is preserved in the original document;
content outside the visible view MUST be inventoried, not silently certified.

Gallery reproductions MUST bind exact upstream source bytes and a pinned commit.
Lini tree and sequence qualification additionally requires actual native hierarchy
connections and source-order messages, including self-call geometry, return/async
distinctions, participant-owned notes and the declared loop extent. A note MUST NOT
be implemented as an invented call. Native palette, icon styling and pixel
placement remain interpreter decisions; approximations must describe what changed.
Source-level claims do not qualify another backend or editable interchange profile.

The separate public `/renderers/lini` entry executes the pinned renderer in a
browser. `renderLiniPresentation(document, options?)` returns a promise of the
presentation plan plus `svg` and `nativeVersion`, or typed diagnostics. Options
include the existing direction/theme and optional `runtimeBaseUrl`; bundled
consumers may serve the distributable runtime assets there. Default asset URLs
are relative to the unbundled ESM entry. Assets are available through the
`/renderers/lini/assets/*` export and include the runtime manifest and license.
The loader MUST verify the pinned JS/WASM hashes before executing those exact
bytes and reject version mismatches or native diagnostics. Native imports are
lazy; the pure vocabulary and presentation compiler MUST NOT fetch or initialize
WASM. This renderer boundary may use browser Fetch, Web Crypto, Blob modules and
WebAssembly, and MUST NOT import Node/Bun APIs.

## Error Semantics

Invalid documents, dangling references, unsupported forms and unrepresentable
native constructs MUST fail before rendering. Native execution failure, missing
runtime or compiler diagnostic MUST prevent presentation qualification.
Malformed or stale hashes MUST prevent publication qualification. Verification
MUST recompute the current compiler output from the exact definition and compare
native source, element maps, omissions and approximations. A qualified receipt
MUST include every required source-bound native quality check for its backend
and view; an arbitrary list of passing strings is insufficient. A successful
SVG load alone is insufficient to claim presentation quality.

Native quality checks MUST bind labels and connections to actual drawn elements,
check containment and entity field ports where qualified, and inspect readable
output at presentation size. Truncation, label/node overlap or wrong E/R
endpoints blocks the affected presentation claim. Visual review supplements
these checks; a matching text appendix cannot substitute for the drawing.

## Examples

```ts
const plan = compilePresentation(document, {
  backend: 'graphviz', direction: 'LR', theme: 'presentation/1'
});
if (plan.ok) {
  // Execute plan.source with Graphviz outside the portable library.
  // Store the original definition and source-bound render receipt separately.
}
```

## Schema Basis

The compiler reuses public `@umf/core` Document and versioned `umf.visual` 1.0.0,
1.1.0 and 1.2.0 definitions at `spec/extensions/visual/`. Their groups/nodes/edges,
stack layers, entity fields and references are the authored semantics. No new
renderer-specific payload schema is introduced. Source references pin actual architecture
or schema facts; a conceptual metamodel E/R view MUST NOT invent SQL keys or
conflate required presence with non-nullability.


## Source-derived review presentations

Presentation inputs MAY explicitly select visual 1.4.0, including its process
role and per-edge curved/straight routing intent. A process convention MUST remain visible and its renderer mapping explicit;
rectangle geometry alone does not establish process meaning.

A review manifest MUST bind the derived definition and every semantic source by
exact relative path/hash, including common and native witnesses when both inform
the definition. Review output reuses the presentation receipt and quality model,
exact YAML and source downloads. Native-only content and unresolved interpretation
MUST remain explicit. Original host evidence and derived portable renderings MUST
show separate source/model/profile/native versions. Existing captures MUST remain
byte-identical and MUST NOT qualify the changed definition. Missing or unsupported
outputs remain visible. Review verification MUST reject stale source or evidence
joins; source authorship MUST distinguish synthetic witnesses from captures.


For explicit edge routing, native qualification MUST bind the drawn path to its
actual edge identity and endpoint carriers. Curved proof requires non-collinear
geometry, not just a cubic-path token; straight proof requires a direct route.
Negative controls MUST replace or straighten an owned curve while retaining its
label and endpoints. Mixed edge intents require faithful per-edge mapping or
located approximations/refusals for affected source paths. Exact native control
points remain outside this shared-intent qualification.


A `PresentationApproximation` MAY include optional stable `code` alongside its
existing source path, requested meaning and representation text. This is renderer
result metadata, not a field in the authored visual vocabulary. Routing uses
`ROUTING_SCOPE_CONFLICT` when incompatible per-edge requests share a native
routing scope, and `ROUTING_NATIVE_INTERPOLATION` when native route interpolation
cannot guarantee the authored route geometry for its layout/attachment points. Free prose MUST NOT
control qualification.

Quality verification MUST validate an allowed code against the exact edge source
pointer, its single matching located approximation, backend capability and actual
source constraint. A scope-conflict code requires conflicting declarations in
that backend's routing scope; an interpolation code requires the qualified native
interpolation limitation. Unsupported, misplaced or duplicate fallback codes MUST
NOT waive geometry checks. Without a valid located fallback, actual curved
segments plus non-collinear geometry, or direct straight geometry, are mandatory.
With a valid fallback, evidence MUST report observed geometry and the remaining
approximation. Native carrier ownership, labels, endpoint attachment, direction
and identity checks remain mandatory in every case.


## Document stencil presentation qualification

Draft 1.4.0 `document` and `multiple-documents` are independent authored shapes.
Interpreters MUST realize their distinct notations, report located approximations,
or refuse. A view qualifying multiple-document stencil realization MUST display an actual
legible multi-sheet glyph or composition owned by that node; concentric borders
or matching text alone MUST NOT qualify as a document stack. It MUST remain one authored logical node,
with one owned label and its actual incident connector endpoints. Decorative
sheets MUST NOT invent logical nodes, document identities or numeric cardinality.

Native qualification MUST bind the single/stacked notation to its mapped node,
check readable silhouette/label and drawn attachment, and reject removal or
replacement of the stack while retaining its text elsewhere. Backend shape
limitations MUST remain explicit; native `doc`/`docs` syntax or successful SVG
load alone does not qualify another backend or exact source-native fidelity.
Existing folded-corner behavior and frozen model profiles remain unchanged.
Fixed E/R field-table views retain their existing scoped shape-annotation
approximation: they MAY show requested shape in the owned table header and report
a located shape approximation without drawing sheets. Such qualification concerns
the field-table view and MUST NOT claim multi-sheet glyph realization. Mermaid's
existing folded-corner-to-wavy-document mapping MUST also remain an explicit
located approximation rather than redefining the authored folded-corner shape.


For pinned Mermaid straight requests, `ROUTING_NATIVE_INTERPOLATION` MAY qualify
an explicitly approximate native linear polyline that bends around layout or
attachment points. Admission requires authored `routing.kind: straight`, the
actual owned edge's `curve: linear` configuration, exactly one matching located
code and no native curved segments. Evidence and UI MUST describe observed bent
polyline geometry and deviation rather than claiming an exact straight route.
This exception MUST NOT broaden curved-request fallback: its interpolation
fallback remains collinear only; an angular polyline does not realize a curve.
Carrier, label, direction and endpoint checks remain mandatory. Other backends
retain their separately qualified routing conditions.


## Circular composition qualification

Draft circular layout is authored composition independent of graph topology.
Interpreters MUST identify their actually qualified forms, nesting and native
versions. Broader shared-model admission does not qualify renderer support;
unimplemented circular scopes MUST refuse or report a located layout
approximation instead of silently using grid/flow placement.

Native circle qualification MUST bind every direct child to its own drawn
carrier, inspect perimeter placement and authored clockwise order independently
of arbitrary rotation, and retain all actual connector identities, labels,
direction and endpoints. Scrambled order, displaced off-perimeter carriers and
missing/reconnected chords MUST fail the corresponding claim. Radius and pixel
coordinates MUST NOT be certified as source-exact without separate evidence.
A review-authored circular presentation based on a historical host output MUST
be distinguished from a source-native arrangement preserved in its witness.


## Typed native execution and route fidelity

A presentation plan and its render row MAY include optional
`execution: {runtime: 'graphviz', layoutEngine: 'neato', nodePositions: 'fixed'}`. It describes native execution, not authored visual
meaning. Absence preserves the existing dot/automatic route. Host executors MUST
validate supported combinations and translate them through a closed mapping;
source vocabulary MUST NOT carry arbitrary native CLI options. The qualified
neato/fixed route executes fixed node positions while retaining native edge
routing. Native DOT declares its engine, positions and pins; those declarations
MUST agree with the typed execution descriptor.

Build receipts and replay verification MUST bind execution to the recompiled
plan, exact source hash and native version. A client MAY derive a downloadable
recipe JSON containing execution, nativeVersion, sourcePath, sourceSha256 and
command argv from that verified row. The neato/fixed recipe uses the fixed argv
`['neato', '-n2', '-Tsvg', downloadedSourceBasename]`. The basename identifies the
hash-verified source download; the original artifact path remains recipe metadata.
Unknown execution combinations MUST NOT become commands. A generated recipe is
a derived reproduction instruction, not separately captured execution evidence.

Native route geometry MUST be measured in consistent coordinates. Absolute
screen/CSS deviation requires transforming sampled points; path/chord ratios
require matching units. Source direction, carrier ownership, endpoint attachment
and backtracking checks remain mandatory. Circular straight edges without authored
ports use native boundary clipping; interpreters MUST NOT force unrequested
compass anchors and then certify the resulting bends as source fidelity. Native
straight-path checks retain their qualified limits and reject bowed or
backtracking negative controls.


Circular Mermaid block-grid approximation uses stable
`PresentationApproximation.code: CIRCULAR_NATIVE_GRID` at the exact source layout
path. Admission requires one such record, the actually qualified native block
projection, retained clockwise order/owned carriers, and measured perimeter
deviation within its declared bounded policy. It MUST remain visibly distinct
from exact circular placement. Native data-line styling belongs in controlled
emitted Mermaid target configuration, not hidden host source-sniffing patches;
downloaded source and declared execution instructions must reproduce the qualified
style or disclose the remaining host-configuration requirement.


## Plain-text annotation presentation

Draft annotations are first-class source text independent of semantic graph nodes.
A presentation MUST draw each admitted annotation on an owned native text carrier,
report its located omission, or refuse the affected scope. Native plaintext
objects and invisible placement constraints MAY implement drawing/layout, but
MUST NOT invent logical nodes, calls, semantic edges or annotation anchors.
Each drawn item MUST have an `elementMap` entry of kind `annotation` binding its
logical ID and exact source pointer to its native carrier.

Annotation placement, typography and spacing are renderer policy. Carriers MUST
own the exact text/line content and remain readable without clipping, overlap or
false association with a node/group. Textual heading semantics MUST NOT be inferred
from an identifier or short line. Native checks MUST reject missing or changed annotation text, or text moved to
an unrelated carrier, even if matching text survives elsewhere.
Broader shared-model admission does not qualify every form/backend combination;
unsupported annotation scopes MUST be explicit before a successful render claim.
Region groups authored as a reviewed frame interpretation preserve declared
membership without asserting equivalence to a host's frame item identity or geometry.


## Authoritative UMF review provenance

Review `originalEvidence.kind: authoritative-umf-source` binds an authored UMF
source directly through exact source path/hash, document ID, visual ID and model
version. These identities MUST agree with parsed source bytes. The original
source MUST pass public UMF/Visual document validation for its declared supported
profile; valid but incomplete unknown content remains preserved and MUST NOT be
rejected merely for incompleteness. This provenance
variant MUST NOT require synthetic/native witness paths, captures or fabricated
historical omissions. It may alias the unchanged source as the reviewed definition, but generic
provenance admission MUST NOT require definition/source path or hash equality.
The reviewed definition is independently bound by its own path/hash and identity;
original source labels, missing properties and model version remain authoritative
for that original source. Explicit review-authored enrichment MUST be distinguished
from original authority. Valid provenance alone MUST NOT certify semantic
equivalence between independently bound documents.
The existing integration-witness variant retains its separate native/capture
qualification. Unknown or inconsistent provenance declarations MUST refuse.
Viewer branches MUST use declared provenance kind rather than fixture IDs or
path/name conventions. Exact source and YAML remain available even when a target
refuses; a source-authority panel MUST NOT masquerade as native capture evidence.


## Neutral entity-card projection

When a native E/R grammar requires identification that the source leaves
unspecified, a renderer MAY use a qualified neutral entity-card composition.
It MUST preserve source-owned fields, keys/nullability, relationship labels,
endpoint cardinalities and entity attachments. An unarrowed association with
explicit cardinality text MUST NOT invent identifying/non-identifying or
directional meaning. Located approximations MUST distinguish that composition
from a native E/R realization. Explicit identification in a mixed source MUST
be preserved or the affected projection MUST refuse; unspecified source meaning
MUST NOT be filled in merely to satisfy native syntax.


## Flow-caption ownership and visual boundaries

A qualified flow-caption realization MUST retain the exact caption on its owned
connection and preserve its endpoint identity. Position, wrapping and spacing
are renderer policy; conservative text/layout estimates are not measured native
clearance or a universal fit guarantee. Native qualification MUST inspect the
actual caption carrier against its connector, endpoint markers and node bounds.
For qualified grouped caption scopes, it MUST also reject straddling endpoint
group frames and intersection with unrelated group frames. Passing text coverage
alone MUST NOT certify these visual ownership or boundary claims.

A target policy MAY use midpoint placement, perpendicular offsets and separate
parallel-caption lanes without adding source semantics. It MUST respect authored
layout order, scoped direction and named endpoints. Native conformance scope and
limits remain explicit; support for one group/layout combination does not imply
all combinations are qualified.


## Flat state-machine presentation

A qualified flat state/machine projection MUST preserve each state node and each
authored transition as a separately owned native carrier. Presentation mappings
use kind `transition` at the whole `/state/transitions/i` item and kind
`state-marker` at `/state/initial` or `/state/final/i`; these are presentation
metadata, not portable vocabulary additions. A transition retains its directed
endpoints and exact event, optional guard and optional action in its owned caption.
Renderer-owned marker helpers MUST remain separate from authored transitions.
Only explicit initial/final declarations authorize their indicators; final
membership MUST NOT suppress outgoing transitions or infer dead-end rules.

Native mapping limitations MUST be disclosed. In the qualified Mermaid state
profile, transition `nativeId` is an encoded directed-endpoint/exact-caption
locator, not an assigned SVG ID. Same-pair transitions with distinct captions may
be uniquely bound; identical endpoint/caption tuples refuse until qualified.
The `[*]` marker locator resolves through its declaration source path and native
link endpoints. Graphviz uses exact assigned transition SVG IDs; Lini uses owned
transition classes and explicit marker cells. Native ownership, direction, marker
membership and readable captions MUST be verified independently from source text.

The current flat subset explicitly refuses unsupported composite/parented states,
layout combinations and node/transition properties with located diagnostics.
Runtime policy and native helper options remain outside the portable vocabulary.
Native title bounds MUST remain within the actual artifact viewport; no extra
case-specific padding requirement is implied.


## Date-history presentation

The bounded date/history profile maps kind `event` to each whole
`/timeline/events/i` item, retaining original array pointers, identities, exact
labels and dates. Shared renderer-only date planning validates real Gregorian
YYYY-MM-DD dates using timezone-independent day arithmetic and builds a stable
chronological view without mutating the source. Equal dates remain coincident;
source-index ties and collision rows add no intra-day order, lane or measure.
Axes, guides and ledger headers are renderer helpers, not authored causal edges.

A proportional-date realization MUST prove actual native event/marker positions
against the day-offset ratio, independently of source declarations or native
AST positions. Equal-date events MUST share the date coordinate; exact dates
MUST remain readable on owned event carriers or proven date groups. Native
collision packing MUST NOT expose an invented quantitative Y axis. A categorical
ledger MAY preserve exact dates in chronological row-major order, but MUST
disclose nonproportional spacing and reading order in the downloadable artifact
as well as the located presentation report. No duration or causal relationship
may be inferred from display order or spacing.

Current qualification is events-only date/history; unsupported item kinds,
properties, layouts and date forms MUST refuse with located diagnostics. Native
fixed-position execution remains under the existing typed target boundary, not
portable model options. Source tag locators/digests do not certify retrieved
external history.


## Sequence adaptation and participant metadata

A renderer MAY adapt a ladder form to a qualified native lifeline sequence only
with a located form/layout approximation; it MUST retain the authored source
form and MUST NOT claim a native narrow-screen ladder realization. Participant
order and identities, message order/endpoints/kinds and exact owned captions
remain independently verified. Native stage/title wrappers are presentation
helpers, not logical participants or messages.

Kind `participant-field` maps an authored participant property at its exact
source pointer to an owned native detail, role or status carrier. Each rendered
field MUST preserve its exact value or declared textual convention on the correct
participant in both native structure and rendered SVG. Matching text elsewhere
MUST NOT satisfy ownership. Missing, changed or reparented fields MUST fail the
corresponding realization proof. These mapping rows do not declare new Visual
identities or vocabulary fields.

Native automatic activation intervals MUST be suppressed where the source does
not authorize them. Explicitly typed call/return styling does not authorize
invented execution durations. Static sequence artifacts MAY retain walkthrough
steps as located native omissions while shared authored-context inspection
provides exact step/focus meaning under CONTRACT-085; this MUST NOT be advertised
as native focus activation or animation.


## Two-axis rating quadrant

The bounded quadrant profile uses two distinct authored rating criteria, positive
maxima and complete per-item values. It MUST bind declared x/y criterion identity
rather than criterion array order, retain exact ratings on a zero-to-maximum
coordinate plane, and preserve labels and low/high anchors. Native proof MUST
measure actual marker positions, including boundary values, without jitter or
invented midpoint classifications. Item/criterion/value/choice mappings are
presentation-only kinds at exact source pointers; they add no Visual identities.

Choice and rationale MUST remain explicitly authored claims, not a computed or
current recommendation. Source caveats MUST retain exact text and ownership.
Optional admitted detail, value notes and takeaway MUST have owned native text
carriers or an explicit located limit. An admitted unanchored annotation requires
its own exact native carrier under the source model version that declares it;
this does not unfreeze older model schemas.

A native chart scaffold MAY be renderer-owned and unmapped only when actually
invisible, without a line, point, legend, score or relationship. Native AST,
carrier and coordinate proofs complement the shared source-hash, fit, clipping,
font and overlap obligations; they MUST NOT silently bypass them. Unsupported
criteria, incomplete values or target subsets remain located refusals. Strict
interchange serialization is separate from this presentation profile.


## Scalar meter presentation

A bounded metric/meter profile MUST preserve the admitted scalar value, series
identity/label, unit, target and optional baseline/comparison references. Target
is a reference, not a semantic maximum; baseline is not automatically a minimum.
Unprovided zero anchors, padded numeric domains and native placement are renderer
policy and MUST be disclosed. Computed bounds MUST remain finite, ordered and
contain all admitted values/references, including zero, negative and over-target
cases without clamping. No progress percentage or completion status may be
inferred from a target.

Presentation-only metric-series/value/reference mappings bind exact source
pointers and owned native carriers; point indices MUST NOT become invented
portable identities. Authored good-direction and format remain independent of
domain policy. Formatting is a display instruction, not permission to alter raw
source values; admitted rounding views MUST retain source-bound raw-value proof.
Unsupported format/subset limits MUST be located and described as qualification
limits rather than model impossibility.

Native proof MUST calibrate bar endpoints and individual reference rules to
actual owned numeric-axis ticks in one coordinate space, excluding value captions
from tick calibration. Each admitted reference retains its own label/rule
association. Zero fills may be geometrically empty; negative values extend to the
correct side of the zero anchor. Shared fit, clipping, text/font and source-hash
checks remain required. Strict interchange and portable metric semantics are
unchanged by native meter composition.


## Dated temporal-stat presentation

A bounded time-axis stat profile MUST preserve each observation's original
series/point pointer, exact date and raw value, independently from display order
and number formatting. A headline based on greatest authored calendar date MUST
identify that historical date rather than imply current measurements. Tied latest
dates retain all authored readings; duplicate observations retain their separate
source indexes without selecting a winner or jittering raw coordinates.

Shared private calendar conversions MUST explicitly use the same integer-day
epoch in both directions, independent of timezone/DST and early-year host date
quirks. Actual native x positions MUST be affine to date intervals and y positions
to raw values under disclosed renderer-selected bounds. Tick text and positions,
including fractional or zero domains, require independent native verification;
formatted glyphs MUST NOT replace raw coordinate facts.

A separate readable observation grid MAY associate full dates/values with the
plot without crossing callout leaders. It MUST preserve chronological display
order with source-index ties and own every caption. Straight connecting segments
are renderer guides, not measured intermediate observations, smoothing, growth
rates or causal relationships; that distinction MUST remain visible in the
downloadable artifact. Native title, unit, series, good-direction, format and
admitted optional text retain exact source ownership. Unsupported formats,
backends and metric subsets remain located refusals without vocabulary changes.


## Categorical bar presentation

A bounded category-axis bar profile MUST resolve each point.at through the
authored category ID, follow declared category order and retain original point
source pointers. Array position MUST NOT substitute for that relationship. A
missing value MUST NOT become zero; an authored zero retains its visible category
row and exact value text even when no fill rectangle is painted. Neutral target
styling MUST NOT infer business-status colors, sorting, totals or recommendations
from category labels.

Qualified nativeId values MAY be structural chart-owner/category-slot or
series/data-slot locators where a native engine does not assign individual SVG
IDs. Their locator grammar and limits MUST be disclosed, with native declaration
and actual rendered slot ownership proved separately. Numeric labels matching a
category, unit or series label MUST NOT satisfy a different carrier's claim.
Absent formatting/decimals remain absent source facts; explicit precision changes
visible labels only, while raw bar geometry remains exact.

Shared target-side numeric-axis sampling/calibration MAY pair ordered raw tick
slots with visible CSS-space anchors independently of rounded glyphs. It MUST
exclude unrelated category/value/tooltip text, reject nonfinite or ambiguous
anchors and preserve profile-specific source/map checks. Negative and degenerate
domains remain renderer policy, without a semantic maximum or invented aggregate.
Unknown category extension content MUST remain preserved and receive located
unknown/unsupported accounting, not newly inferred typed meaning.


## Multi-series temporal-line presentation

A bounded temporal-line profile MUST share UTC-day and raw-value scales across
all admitted series while retaining original series/point pointers. Display
sorting MUST NOT mutate source order or join observations by array position.
Sparse dates remain absent readings, not zero-filled observations. A date-by-series
table MUST bind every value to both its exact date row and its own series column.
Repeated dates retain each original observation without aggregation, jitter or a
selected winner. Stable source-index ties MAY order renderer guides, with no
intra-day measurement claim; zero-length guides MAY be omitted. A single-date
view containing multiple observations MAY use disclosed renderer-selected date
padding without inventing readings. Core line cardinality remains authoritative;
a singleton is a located source-form validation error, not native inability.

Series identity styling is renderer policy independent of business labels. A
global authored good-direction cue MUST NOT become inferred per-series status.
Each guide joins adjacent dated observations only within its source series;
visible guide disclosures and exact owned metadata remain required. Shared pure
numeric-scale planning MUST preserve raw coordinate facts independently of
rounded labels, with finite bounds and explicit unsupported magnitude handling.


## Source-declared tree composition

A tree profile MAY select native direction/spacing when layout is absent, without
adding layout facts to the source. Explicit qualified tree hints retain precedence;
incompatible explicit layouts require located accounting. Parent references own
hierarchy independently of renderer-generated links. Sibling order and original
node identity MUST survive native nesting; helper links MUST NOT become authored
edge mappings. Shared spacing is a renderer budget qualified by actual native
geometry, not a universal routing guarantee. Metadata not drawn remains explicitly
accounted for rather than inferred from branch styling.


## Event-only milestone qualification

Qualified date-event profiles MAY admit history and milestones through the same
native adaptation when all authored event meanings are preserved. Form admission
MUST select identical source ownership, calendar geometry, categorical-ledger
limitations and mandatory native checks. It MUST NOT add duration, causality,
release-role or current external-history claims. Original event pointers and
same-date identities remain distinct. Exact-axis scale width MAY adapt to native
card/readability budgets while retaining one affine UTC-day factor and exact
same-date equality; a fixed points-per-day choice is not portable semantics.


## Typed before/after comparison tables

A bounded before/after profile MUST resolve each value through its declared item
and criterion IDs, retain original value pointers and preserve declared item/
criterion display order. Exact text and yes/no/partial support values remain
source-owned, without scores, ranking, inferred winners or current-state claims.
Incomplete matrices retain core form-validation boundaries; missing values MUST
NOT become no. Criterion measure MAY govern typed cell representation without
printing its enum literal, provided the mapping/view disclosure is explicit.

Long text, details and notes MAY use native wrapped blocks outside the matrix.
Each block MUST visibly identify its item/criterion owner and retain exact source
pointers. Full authored content MUST survive display line breaks without ellipsis
or truncation. Native proof MUST independently reconstruct actual AST and visible
text against source content, not rely solely on the compiler's wrapping oracle.
Native row/column order and cell ownership require separate structural and actual
rendered-geometry evidence. Unsupported subsets remain located target limitations.


## Categorical period/lane roadmaps

A bounded roadmap profile MUST resolve span start/end and lane references by ID,
retain original pointers and follow declared period/lane order. Inclusive period
cells MAY compose a visible interval, including a full cell for equal endpoints;
this categorical policy MUST be disclosed without calendar duration or causality.
Authored labels and literal statuses remain visibly owned by their span bars,
without inferred delivery completion or status-derived business meaning.

Overlapping same-lane spans MAY occupy renderer-only subtracks without adding
semantic lanes or sequence facts. Native proof MUST independently establish lane
containment, exact inclusive endpoints, disjoint bars and full visible text/status,
rather than reproduce a private packing algorithm. Period labels MUST align with
their actual grid cells; native insets require measured screen-space scaling.
Original full strings are validated before wrapping, and actual AST/visible lines
must reconstruct complete authored content. Unknown content remains preserved with
located accounting; vocabulary and historical source claims are unchanged.


## Directed-flow dependency composition

A compatible pipeline or ungrouped network MAY reuse directed-flow ranking while preserving every
source node, directed dependency and original pointer. Declaration order MUST NOT
create a serial dependency between independent roots. With no authored layout,
a renderer MAY use dependency-depth ranks and stable source-order ties; explicit
qualified layout takes precedence. Cycles, headless links or unresolved endpoints
MUST NOT be silently removed to manufacture a DAG. Return-link rank exclusion
requires explicit view disclosure while retaining the actual link.

Rank placement is target composition, not elapsed time, concurrency guarantees or
new source meaning. Native checks MUST preserve exact node/edge inventories,
endpoints and full text independently of rank styling. Authored question/takeaway
carriers require exact visible ownership where drawn; other backend views retain
truthful metadata omissions and source/context access without claiming those
meanings are present in standalone artifacts. No trigger or business-specific
vocabulary is inferred from authored prose.


## Native on-path caption cutouts

Caption clearance conformance MUST evaluate effective painted connector ink.
A qualified native on-path label cutout MAY satisfy clearance instead of an
off-path gap only when independently proved for the owned caption/connector.
Evidence MUST resolve local mask references, units and transforms, establish
opaque keep/knockout behavior covering complete visible glyph bounds with margin,
and preserve identifiable surviving connector ink plus endpoint/arrow attachment.
Unresolved/external masks or geometrical path proximity alone cannot establish
success. Native paint/pixel evidence MUST corroborate the bounded mask profile.

Removing/disabling/shrinking the knockout MUST expose a failing ink collision;
an overbroad knockout that destroys meaningful connector ink MUST also fail.
Mask qualification does not waive source ownership, group-frame crossing,
unrelated-caption association, readability or other native quality checks.
This is target rendering policy, without new portable routing/caption semantics.


## Automatic grouped-flow composition

With no authored root layout, a renderer MAY collapse top-level group subtrees and
ungrouped root nodes into private layout components, using authored cross-component
directed links to select placement. Explicit qualified layout retains precedence;
cycles/headless ambiguity preserve topology through a fallback. Every actual
internal, cross-group and return link remains source-owned and drawn or explicitly
accounted for. Private components/ranks add no semantic groups or execution order.
Caption wrapping validates original text before inserting display breaks and must
retain full visible content. Direction-specific qualification remains empirical:
a successful default direction MUST NOT imply another direction passes native
readability, frame ownership or mask/ink requirements.


## Qualified and unqualified native executions

Each reviewed example MUST have at least one individually qualified suitable
target. A successful source-bound native execution with failed required quality
checks MAY be retained as unqualified evidence; it MUST NOT be called qualified,
semantically unsupported or an execution failure. Compile/runtime/asset/replay
failures remain blocking. Semantic unsupported retains its explicit located
capability-refusal meaning.

Unqualified rows MUST retain exact native source/version/execution, maps/view
inventory, SVG/PNG hashes and the complete required-check inventory with exact
failed-check identifiers. Independent native replay MUST verify assets and source
bindings and reproduce the failed-check set; forged success, missing/unknown checks
or changed failure facts MUST fail verification. No individual quality threshold
or proof obligation is waived. UI inspection/downloads MUST state native quality
is not qualified and expose concrete source-bound limitations. Existing qualified
rows retain every qualification requirement.


## Native nested-node containment

A bounded structure/nested profile MUST preserve each logical source node identity
whether represented by a native container or leaf. Parent references require true
native enclosure, without invented semantic groups or hierarchy edges. Native proof
MUST bind exact node inventory, parent associations, direct/transitive bounds,
disjoint siblings and owned captions/details/role/status; renderer helpers remain
unmapped and may not hide phantom carriers. Metadata must belong to its nearest
logical owner. Original full content survives native wrapping.

A private source-ordered containment index MAY be shared across adapters without
backend geometry or source mutation. For structure/nested, admitted flow root layout/order governs only direct roots;
descendants retain source sibling order absent their own meaning. Tree layout
remains restricted by core validation to structure/tree and is not admitted by
this profile. Unsupported hints/content receive located accounting. Native AST and
actual SVG containment/visible ownership are both required; source parsing alone
cannot qualify a rendering. Missing/moved children, metadata or phantom carriers
must fail independently. Existing general quality and mixed-outcome gates apply.


Owned connector captions MUST remain disjoint from every unrelated logical node,
not only their source/target nodes or group frames. A native label cutout cannot
excuse placement inside an unrelated node. Skip-rank corridor placement MAY use
private rank/label geometry estimates, but actual native ownership, visible ink
and all-node clearance remain the conformance authority.
