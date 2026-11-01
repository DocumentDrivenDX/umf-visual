---
ddx:
  id: CONTRACT-085
  type: contract
  activity: design
  authoring:
    home: repo
  links:
    - id: FEAT-036
      kind: informed_by
    - id: CONTRACT-086
      kind: informed_by
    - id: CONTRACT-083
      kind: informed_by
    - id: CONTRACT-087
      kind: references
  schemas:
    - id: umf.visual
      version: "1.1.0"
      title: Latest explicitly versioned visual vocabulary
      path: spec/extensions/visual/schema.json
      schemaFormat: json-schema
    - id: umf.visual
      version: "1.0.0"
      title: Frozen released visual vocabulary and current example model
      path: spec/extensions/visual/1.0.0/schema.json
      schemaFormat: json-schema
---

# CONTRACT-085: Static visual catalog data

**Type:** build/browser data interface. **Version:** 1.4.0.

## Purpose

Give the `umf.visuals` microsite a reproducible source of definitions, qualified
translation results and native render artifacts. CONTRACT-086 owns adapter
behavior; this contract does not expand supported native forms.

## Scope and Boundaries

Repository-owned `microsite/` consumes generated catalog data and native SVG
(Scalable Vector Graphics) images. `dist-site/` is the self-contained static
output. Build scripts may use Bun, native engines and Chromium; portable `src/`
may not import them. Site hosting is a separate deployment step.

## Normative Surface

The generated JSON root MUST contain `schemaVersion:1`, `language`, `capabilities`
and `items`. Items are example instances, never the definition of the language.

The `language` record MUST contain `schema:{sourcePath,sourceSha256,schema}` and
`forms:{sourcePath,sourceSha256,kinds}`. The schema value MUST be the exact parsed
repository payload schema, preserving properties, `$defs`, constraints and refs.
Its sourcePath is `spec/extensions/visual/schema.json`. Forms sourcePath is
`src/extensions/visual/index.ts`; kinds contains `{kind,forms}` records copied
from the actual exported visualForms table. Both hashes identify exact source
bytes. The builder MUST check kind/form enum agreement with the schema, while
qualifying that semantic pairing rules live in TypeScript rather than the flat
schema enums. The browser MUST present this language reference before the
secondary example gallery and MUST distinguish its counts from example counts.

The primary schema reference currently exposes explicit latest version 1.1.0;
the original example documents and public default aliases remain frozen 1.0.0.
The UI must show that distinction. Generating latest TypeScript shapes does not
upgrade example documents or establish a native profile's 1.1.0 interpretation.

Capabilities are copied from the public interchange API. Each example item MUST contain:

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Unique, stable across rebuilds; derived from source identity |
| `title` | string | Reader-facing title; use visual title or a deterministic fallback |
| `kind`, `form`, `question` | string | Exact visual classification and reader question |
| `origin` | `fixture` or `canary` | Distinguish corpus coverage from added demonstrations |
| `sourcePath` | string | Existing repository-relative definition path |
| `sourceSha256` | string | Lowercase 64-character SHA-256 of exact source bytes |
| `document` | public core Document | Original parsed UMF definition, without target-specific mutation |
| `targets` | object | Exactly one record for each of `dot`, `mermaid`, `lini` |

Every current visual JSON instance under `fixtures/visual/` MUST appear once;
collection index/metadata files are not examples. The gallery contains 50
fixture instances across forms/ and inventory/ plus separately identified canaries;
seven kinds, 22 forms and schema `$defs` are language declarations, not examples. Additional canaries MUST be
backed by repository files and MUST NOT count as corpus coverage. The build MUST
verify the current corpus/form inventory rather than silently skip new fixtures.

Each target record MUST contain:

| Field | Type | Rules |
| --- | --- | --- |
| `status` | `supported`, `reported-loss`, `unsupported` | Derived by the policy algorithm below |
| `ok` | boolean | Whether native source was successfully emitted |
| `source` | optional string | Exact generated native source; present only when `ok:true` |
| `diagnostics` | InterchangeDiagnostic array | Actual selected export result; preserve severity, loss and locations |
| `identityMap` | IdentityMapping array | Actual selected export result; no fabricated identities |
| `render` | optional render record | Native engine attempt for emitted source |

The builder MUST call strict export first. If it succeeds, status is `supported`.
Otherwise it MUST call `allow-reported-loss`; success gives `reported-loss`, and
failure gives `unsupported`. The record MUST retain the selected actual result.
A supported status means an export under the recorded mapping profile, not full
native-format support, rendering success or equivalence outside that example.

### Opt-in profile variants

Items MAY additionally contain `profileVariants` and `preferredRelease` without
replacing `targets.dot/mermaid/lini`. Each variant contains `profileId`,
`mappingVersion`, `modelVersion`, `format`, `result` and `coverage`; result obeys
the same actual-export/native-render rules as a target. CONTRACT-087 owns the
readable annotation profile and per-pointer coverage semantics. Variant IDs must
be unique per item and match a declared capability; versions stay independent.

`preferredRelease:{format,profileId}` selects either an existing native target's
declared profile or a variant. Its actual strict export and native readback/render
must pass before it qualifies for release. All 53 unchanged current examples must
have a qualified choice, spanning all 22 forms; the builder must check the actual
corpus rather than perpetually assume those counts. Canaries remain distinct.

The UI MUST label a qualified annotation profile explicitly, keep native defaults
accessible, and expose which fields use annotations versus intrinsic constructs.
A compact diagram view MAY focus on the diagram, but the complete annotated view
and native download must retain all meaning. Owner-scoped legends must remain
readable without obscuring the diagram. Existing links without a profile parameter
retain native-target meaning; an optional profile parameter selects a variant.

A render record MUST contain `ok`, `engine` and `nativeVersion`. Engine is
`graphviz`, `mermaid` or `lini` for the corresponding target. `nativeVersion` MUST
identify the actual executing runtime separately from the adapter profile version.
Successful rendering MUST include `svgPath` and lowercase SHA-256 `svgSha256`.
Failed rendering MUST include an explanatory `error` and no successful SVG path.
A target with no emitted source MUST have no render record. Missing runtime is
an unavailable build prerequisite; it must not be recorded as a successful render.

A rendering MUST be produced from that record's exact native source by its named
engine. The builder MUST NOT substitute a renderer or picture for an unsupported
form. All SVG asset paths MUST resolve within the static output, use relative
URLs and match their recorded hashes. Native parsing/rendering errors remain
visible even when export succeeded. Successful rendering is not a semantic or
pixel-layout equivalence claim.

### Additive six-target evidence

Existing schemaVersion 1 `targets`, `profileVariants`, integration planning
records and historical receipts keep their meanings. Additive renderer evidence
MAY be attached through `rendererTargets` on a catalog item or integration case.
The build may mechanically join equivalent records; it MUST retain their actual
source and policy outcomes. It MUST NOT cast Slides/Miro plans into successful
native exports or replace ordinary results with a selected annotated variant.

Each row is keyed by `rendererId` (`dot`, `mermaid`, `lini`, `powerpoint`,
`google-slides`, `miro`), `profileId`, `modelVersion` and `mappingVersion`.
These identities MUST be distinct from native engine/API versions. The row has
`projection:{state,status,diagnostics,losses}`. State is `emitted`, `planned`,
`refused` or `not-attempted`; status is `supported`, `reported-loss`,
`unsupported` or `not-evaluated`. A plan cannot qualify complete native support.
Unattempted output MUST NOT be labelled unsupported without a capability reason.
Artifacts, preview evidence and edited-cycle receipts are separate optional data.
The current CONTRACT-088 host implementation profiles declare mappingVersion
`1`; this does not substitute a package version or a host runtime version.

The optional fields are `artifacts` (an array of `{path,sha256,mediaType,bytes}`),
`preview` (the record below), and `roundTrip` with `state` (`passed`, `failed`,
`unavailable`), a hashed `receipt` artifact and optional error. A passed cycle
receipt MUST match the row's source/profile/model/mapping and state its actual
native execution boundary; an arbitrary caller boolean is insufficient.
Native edits MUST state whether they used the editor UI or direct host API/SDK.
API-edited cycles do not establish UI interaction, and captured trace replay
does not establish direct injected transport to the live host.
Legacy `targets.googleSlides` is not renamed: the additive `google-slides`
renderer identity is a mechanical join only. Native InterchangeFormat stays the
existing three-format public API; a catalog destination is not a new parser.

A preview contains `state` (`rendered`, `failed`, `unavailable`), `engine`,
`nativeVersion`, `sourceSha256`, `profileId`, `modelVersion`, `mappingVersion`
and `stage`. It MUST identify at least `inputArtifactSha256` or
`captureDigestSha256`; host captures also record their revision/observation fence.
A rendered preview has an asset `{path,sha256,mediaType,width,height}` with
positive dimensions. Failure/unavailability has a reason, no successful asset
and no host-verification badge. Paths MUST resolve within the static output.
Captured images MAY be PNG; existing SVG fields retain their current meaning.

The exact input artifact/capture and source/profile tuple MUST match the
verified result. Regenerated PPTX or host objects cannot inherit old screenshots
merely because their UMF source is unchanged. Preview receipts MUST identify
whether they show initial export, native edit or preserving update. Round-trip
receipts separately name qualified semantic edit paths, native preservation,
source/native revision fences, final readback and the actual execution boundary.
An image or receipt from another case MUST NOT mark a pair host-verified.

PowerPoint application output and LibreOffice PPTX conversion are separate
engines; a conversion thumbnail is not a PowerPoint host test. Slides thumbnails
are fetched during approved host execution, persisted as synthetic image bytes
with hashes, and never published as expiring account-tagged image URLs. Miro
previews use isolated synthetic viewports/frames and stable SDK observations;
unrelated private board content MUST NOT enter public image assets. Portable
source and the browsing site receive neither credentials nor host runtimes.

The first cross-target witness is the existing `process-documents-store` source:
six actual renderer images/artifacts with visible actual losses. The subsequent
host cohort is five common cases times three hosts: fifteen previews and fifteen
qualified repeated edit/import/preserving-update cycles. Missing/unsupported
pairs remain open unless the owner explicitly defers them. The opaque-only
witness retains its refusal and native-only content, not a fabricated graph.

### Selection and current loss evidence

The owner's subsequent full-format goal makes qualified `/full/1` output the
canonical presentation for each format once implemented. Ordinary and annotated
profiles MUST remain explicitly selectable compatibility subsets with their
actual current diagnostics. Existing exact-profile links and receipts retain
their meaning. No headline zero-loss claim may be derived by hiding these rows.

Canonical cells MUST expose meaningful native images, complete source/readback
evidence and any separate visual approximations. The gate is all 53 unchanged
examples in all three formats, spanning all 22 forms per format: 159 strict
zero-loss pairs. The earlier one-suitable-target milestone is a separate
historical success and does not satisfy this stronger requirement.

The five complex common integration documents add 15 portable-format pairs to
this gate. Integration cases expose additive `fullRendererTargets` for DOT,
Mermaid and Lini. Their canonical matrix cells use these full routes; original
`rendererTargets` remain separately inspectable compatibility evidence. Each
full row identifies the requested and actual source profile/mapping, source
hash, representation, approximations, complete-source readback and scoped
native SVG witness. Complete and focused previews have distinct exact input
artifacts and image hashes. Focused source is a display-only derivative and
MUST NOT be advertised as complete interchange input. All 15 pairs must pass;
native compiler warnings cannot qualify as a successful full route.

Host rows, captured assets and host-cycle receipts retain their original
profile scope. Common-document preservation does not recover meaning already
lost in the upstream native Miro projection. Those gaps and opaque-only
witnesses remain separate; portable full routes do not establish universal
six-host losslessness.

Explicit target links without a profile preserve ordinary/native meaning.
Exact profile links remain exact. Renderer changes MUST preserve native-versus-
qualified intent and compatible per-target selection, with an explicit
unavailable state when no matching profile exists. Multiple compatible profiles
require an explicit choice. Selection URLs MUST preserve view intent as well as
target/profile; existing URLs continue to resolve. A focused image MUST NOT be
labelled complete. Coverage/status/filter summaries MUST state and use the same
active target/profile scope as the visible result.

The ledger MUST include current ordinary outcomes, current variants and host
projection/evidence independently. It retains raw diagnostics and normalizes
only equivalent omitted pointer subtrees. Gap ownership stays `unknown` until
manual/native evidence establishes a mapping, model or capability cause.
Comparable reductions require unchanged source hashes and explicit profile/
mapping versions; new supported pairs and annotations are separate gains.
Current ordinary results MUST NOT be dismissed as historical data.

### Reproducibility and display requirements

Stable source identity determines item order and identifiers. Unchanged inputs,
profile versions and pinned native runtimes MUST produce matching data/artifact
hashes; wall-clock generation timestamps MUST NOT create false differences.
The builder MUST validate original documents and fail on missing/duplicate sources
or inconsistent target/status combinations. It MUST record per-item render
failures honestly; designated baseline native canaries must pass the release gate.

The browser MUST distinguish export policy from native rendering. It MUST show
unsupported entries, original UMF JSON, generated native source when present,
diagnostics and identity mappings. Source strings MUST be displayed as text.
SVG images MUST be embedded as images or through an equivalently isolated surface;
source values MUST NOT become executable HTML. No external engine/CDN is required
at browsing time. Catalog/image loading errors MUST have an explicit UI state.

Search MUST cover meaningful definition text. Kind, form, target and status
filters MUST compose predictably, expose current matching counts and support
clearing to the full corpus. Canonical selection links use `?id=<URL-encoded item id>&target=<dot|mermaid|lini>`.
Opening a definition and changing target MUST update that selection URL.
Stable item/target links MUST survive reload; unknown
items/targets recover to a safe explicit selection or useful error state.
The site MUST retain keyboard-operable labelled controls and visible focus.
Long code and large drawings MAY scroll inside their own panels; the whole page
MUST fit a 375 CSS-pixel viewport without horizontal overflow.

### Preview presentation and image inspection

Preview cards SHOULD provide enough space to recognize diagram structure and
read their source/profile/render captions. Every successful portable SVG or
host image MUST offer the same isolated-image inspection surface. That surface
MUST provide fit, actual-size and bounded zoom controls without changing the
selected target, profile or complete-versus-focused view.

The viewer MUST have labelled keyboard-operable controls, visible focus, an
accessible name, Escape dismissal and focus restoration to its opener. Fullscreen
MAY use the browser API when available, with an in-page expanded fallback.
Missing images MUST show an error and preserve close/open/download actions.
The viewer MUST keep SVG isolated as an image; source markup remains inert.

Build-time DOT/Mermaid preview themes MAY adjust palette, typography and spacing.
They MUST preserve text, endpoint direction, ports, grouping and all visible
annotation meaning. A theme MUST NOT override a semantic style encoding or
imply a source/model change, reduced loss or newly qualified native capability.
The build MUST identify the presentation policy separately from adapter mapping
and native runtime versions. Existing native-source downloads remain exact exports.

Portable render records MAY add `presentation:{id,version,rendererOptions,
svgNormalization}`. The current policy is `umf.visual.preview` version `1`;
renderer options identify actual Graphviz defaults, Mermaid configuration or
unchanged Lini compiler defaults. `rawSvgPath/rawSvgSha256` identify exact engine
output under those options; `svgPath/svgSha256` identify its display derivative.
Raw does not mean an earlier unthemed render.

Portable integration previews use the same `presentation` record and optional
`rawAsset:{path,sha256,mediaType,width,height}`. Their existing `asset` remains
the displayed image. Both assets MUST be hashed and downloadable. Verification
MUST establish that display bytes equal the declared normalization of raw bytes,
not merely that each file has a valid independent hash.

SVG dimension normalization MUST preserve the full native drawing, including
labels, connectors and legends. If post-processing changes native SVG bytes,
the original native image MUST remain separately downloadable and hashed.
Host screenshots and thumbnails MUST remain byte-identical to their captured
receipts; card layout and viewer magnification do not create new host evidence.

Presentation changes require browser checks for clipping, desktop/mobile layout,
image loading failures, keyboard/focus and fit/actual-size/zoom behavior. Existing
source, loss, native-meaning, receipt-provenance and repeated-build gates remain
in force. A visual polish pass does not reopen or silently replace host cycles.

## Precedence and Compatibility

CONTRACT-083 governs definitions; CONTRACT-086 governs projection and loss.
This versioned site data is a build product, not a new UMF vocabulary. An
incompatible field/status change requires a new schemaVersion and matched
consumer update. Native versions, adapter versions and catalog schemaVersion
are separate identities and MUST NOT substitute for one another.

## Error Semantics

| Condition | Outcome |
| --- | --- |
| Strict export fails but reported-loss succeeds | Preserve loss reports; `reported-loss`, source available |
| Both export policies refuse | `unsupported`; no native source or invented render |
| Native engine refuses generated source | Keep export status; render failure with error/version |
| Fixture missing, duplicate ID or invalid document | Build fails; no successful coverage claim |
| Missing/corrupt catalog or SVG | Browser error/unavailable state; no successful render claim |
| Source text resembles HTML/script | Display as text; never execute |

## Examples

```json
{
  "status": "unsupported",
  "ok": false,
  "diagnostics": [{"code":"LINI_FORM","path":"/extensions/umf.visual/form","message":"Unsupported form","severity":"error","loss":false}],
  "identityMap": []
}
```

A sequence, timeline or metric can therefore remain discoverable while all native
targets truthfully refuse its current form.

## Schema Basis

Reuse the existing public core Document, visual 1.0.0 and CONTRACT-086 operation
results. Core generic elements and the visual payload do not own native engine
receipts, local SVG paths or UI inventory statuses. Those are local build-product
metadata under this contract, not a competing visual model. No new vocabulary or
generation authority is introduced.
