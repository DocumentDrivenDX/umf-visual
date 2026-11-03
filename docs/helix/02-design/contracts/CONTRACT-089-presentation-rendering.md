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
