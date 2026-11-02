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
