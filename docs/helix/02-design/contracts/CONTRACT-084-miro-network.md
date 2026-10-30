---
ddx:
  id: CONTRACT-084
  type: contract
  activity: design
  authoring:
    home: repo
  links:
    - id: SPIKE-011
      kind: informed_by
    - id: CONTRACT-083
      kind: informed_by
    - id: visual.architecture
      kind: informed_by
  schemas:
    - id: umf.visual
      version: "1.0.0"
      title: Visual vocabulary
      path: spec/extensions/visual/schema.json
      schemaFormat: json-schema
---

# CONTRACT-084: Miro network round trip

## Purpose

Export an authored `umf.visual` network to editable Miro items, then adopt
question, node-label, edge-caption and connector-endpoint changes into the
same logical visual. Keep native presentation and all original UMF content.
This contract implements the owner's 2026-10-29 round-trip request.

## Scope and Boundaries

Profile `umf.visual.miro.network/1` targets Web SDK v2, `umf.visual` 1.0.0,
core envelope 0.10.0 and released core SDK 0.5.7. It accepts 1–15 nodes in
`flow/network`, with no nonempty groups. It does not infer arbitrary boards,
adopt item creation/deletion, synchronize continuously or reconstruct native
boards. Unsupported topology changes MUST refuse, not discard items.

`src/adapters/miro/types.ts` owns TypeScript interfaces for this library boundary;
`validateMiroBundle` owns companion validation. This is a local adapter receipt,
not the common visual vocabulary. Reuse CONTRACT-083's source document and identity
rules. Write progress stays in the companion. The separately versioned native
extension below retains source-specific board JSON; common concepts absent
from visual 1.0.0 remain candidates for coordinated model evolution. JSON is the
companion wire format; original UMF JSON/YAML remains usable through existing APIs.

## Normative Surface

Public entry point: `@documentdrivendx/umf-visual/miro`.

| Operation | Behavior |
| --- | --- |
| `planMiroExport(document, mode='strict')` | Pure validation and field-level loss inventory; returns copied source, shape requests and logical connectors |
| `exportMiroVisual(board, document, {exportId, mode?, checkpoint?})` | Creates the question shape, node shapes, then attached connectors; writes item correspondence metadata and returns a complete companion |
| `captureMiroBoard(board, {experimentalShapes?})` | Captures API-visible items/app metadata; explicit experimental shape expansion is recorded; no full-board fidelity claim |
| `recoverMiroExport(bundle, capture)` | Read-only interrupted-receipt recovery; requires every expected item/source correspondence and unchanged metadata; never retries writes |
| `reconcileMiroVisual(bundle, currentDocument, capture)` | Pure atomic adoption; returns document, original, next companion, full capture, semantic changes and native-only changed IDs |
| `importMiroVisual(board, bundle, currentDocument)` | Two captures surround reconciliation; refuses if observations differ |
| `attachMiroCapture(document, capture, mappings?)`, `getMiroCapture(document)` | Preserve/retrieve native capture inside a copied UMF document with explicit native and semantic references |
| `miroRegistry()` | Registers visual 1.0.0 and the Miro native extension for validation |
| `readMiroBundle(text)`, `writeMiroBundle(bundle)` | Validate exact profile, source, identity bijection, baseline correspondence and loss inventory; preserve unknown JSON content |

The injected board is the documented Web SDK subset (`getInfo`, `get`,
`createShape`, `createConnector`); it owns authorization and actual I/O. There
are no global SDK imports or host APIs in portable source. Adapter helpers MUST
NOT become dependencies of vocabulary validation. New adapter files have a
300-line ceiling and new functions a 60-line ceiling; existing vocabulary is
an unchanged extraction baseline. `check:source` enforces the adapter boundary
and ratchets. No new lint dependency is needed for these measured checks.

Companion fields are `profile`, `boardId`, `exportId`, copied `source`, `mode`,
`losses`, `mappings`, `baseline`, `state` and optional `pending`. State is
`writing`, `complete` or `interrupted`. Mappings contain `logicalId`, `nativeId`
and `kind` (`question`, `node`, `edge`). Native IDs MUST be strings. Metadata
under key `umf-visual` contains profile, boardId, exportId, visualId, logicalId
and kind. Question identity uses the visual ID and a separate mapping kind.

The question, node labels and at most one caption per connector are rendered
as escaped plain text. Paragraph wrappers, line breaks and a bounded HTML
entity vocabulary may be decoded on import; formatting tags MUST refuse.
Connector endpoints MUST resolve to mapped nodes. Native geometry, styles,
attachment positions and unknown API-visible properties remain in capture.
They MUST NOT be promoted into semantic roles/statuses.

Strict mode MUST reject any retained-only semantic field. Report mode MUST
return one loss path per retained-only field, including provenance, roles,
statuses, steps and unknown content. IDs/kind/form are represented through the
profile and correspondence map. Question is drawn explicitly. Original source
is always retained; recoverability does not imply complete rendering.

Import MUST require an unchanged current document relative to the companion
source, matching board ID, complete receipt and a bijective identity map. It
MUST detect copied metadata and missing/mutated mapped identities. New unrelated
board items are retained in capture and ignored; new items carrying this
export's metadata are conflicts. An unmapped connector endpoint is a conflict.
Unknown semantic content may be recovered unchanged but blocks semantic edits
until understood. Adoption MUST NOT mutate input documents or receipts.
The returned companion starts the next round-trip revision.

Export IDs are caller-supplied unique strings of 1–128 characters. Writes are
sequential. Checkpoint receives detached receipts before mutation, after known
IDs and after complete items; callers SHOULD persist every checkpoint. A failed
write MUST return an interrupted receipt on `MiroAdapterError.receipt` with
pending logical/native identity when available. It MUST NOT automatically retry,
delete partial work or claim transactionality. A timeout can leave an unknown
remote outcome; callers MUST reconcile rather than replay blindly.

## Precedence and Compatibility

CONTRACT-083 owns visual semantics; this contract cannot weaken it. Exact
profile matching is required. New companion profiles need explicit migration.
Companions are untrusted data, not signatures or authoritative access tokens.
Capture is bounded to 10,000 API-visible items, JSON depth below 128 and
companion input text at most 16 million characters. Captures are not atomic;
two equal observations reduce races but cannot exclude every concurrent edit.

## Error Semantics

| Condition | Code | Recovery |
| --- | --- | --- |
| Invalid source or unsupported kind/group/size | `VISUAL_INVALID`, `SUBSET` | Correct or select a supported visual before writing |
| Retained-only meaning in strict mode | `RENDER_LOSS` | Inspect report plan and explicitly use report mode |
| Source changed locally | `STALE_SOURCE` | Resolve the source revision conflict |
| Wrong board, missing/copied metadata or endpoint | `BOARD`, `IDENTITY`, `ENDPOINT` | Repair correspondence explicitly |
| Incomplete receipt or unknown semantic edit | `INCOMPLETE`, `UNSAFE_EDIT` | Recover partial writes or supply understood semantics |
| Rich text or multiple captions | `RICH_TEXT`, `CAPTION` | Use supported plain text; original capture remains available |
| Changing board observations | `CONCURRENT_EDIT` | Retry capture after edits settle |
| SDK/checkpoint failure after export begins | `WRITE_INTERRUPTED` | Save attached receipt; investigate remote outcomes |
| Malformed companion/capture/non-JSON values | `BUNDLE`, `CAPTURE`, `JSON`, `LIMIT` | Reject input without side effects |

## Examples

```ts
import {exportMiroVisual, importMiroVisual} from '@documentdrivendx/umf-visual/miro';
const bundle = await exportMiroVisual(miro.board, document, {
  exportId: crypto.randomUUID(), mode: 'report', checkpoint: persistCompanion,
});
// A person edits shapes, question, captions or attached endpoints on the board.
const result = await importMiroVisual(miro.board, bundle, document);
persistDocument(result.document);
persistCompanion(result.bundle); // use this with the returned document next time
```

Acceptance tests MUST execute export, native item edits, import, JSON/YAML
serialization, second import and rejection controls. A fake SDK or Chromium
consumer verifies adapter behavior only. Miro server acceptance and actual board
editing require separate live evidence with versions and observed results.

## Miro native extension

`umf.visual.miro` 1.0.0 is adapter-owned, document-scoped and independent of
`umf.visual` 1.0.0 and network profile 1. Its payload contains `sdk: "2"`,
`capture`, `mappings` and `reproduction` (`capture-only` or `native-clipboard`),
with optional `clipboard` native reproduction data. `miroNativePackage`
is the public registration authority. The capture contains opaque JSON from
API-visible items plus this app's metadata; it does not interpret every field.
Native IDs resolve only within `capture.boardId`. Mappings are bijective and
resolve to captured items and existing question/node/edge identities. Unknown
payload keys and nested native JSON MUST survive capture refresh and JSON/YAML
serialization. A declared different extension version MUST refuse refresh;
there is no implicit upgrade or downgrade. Caller inputs remain untouched.

Native capture admission uses the same finite JSON/depth/size/identity bounds
as companion capture. Opaque retention is distinct from semantic understanding
and from executable native reconstruction. Version 1 MUST NOT claim a full
Miro backup, pixel fidelity or stable-API reconstruction of unsupported item types.
Existing network import remains companion-based; adding this extension to its
source requires a deliberate new companion revision, not stale-source bypass.

Raw company boards stay private and ignored. Reduced, sanitized semantic
counterexamples are coordinated through the diagram-language task before
common schema changes. Geometry, grouping, ports and relationship meaning are
not permanently classified as vendor noise merely because visual 1.0.0 lacks
fields for them.

### Observed browser clipboard reproduction

`miro.browser-clipboard/observed-2026-10-29` identifies an opaque preservation
profile, observed on browser client 1.105493.0. Clipboard fields are `profile`,
`sourceBoardId`, `client`, `coverage: selection`, `html` and `text`. Native HTML
and plain text are preserved exactly as strings (each at most 16 million
characters); the native HTML must contain a `data-meta` envelope. This is
admission validation, not an interpreter or proof of authenticity. The library
MUST NOT execute/render the HTML or infer common semantics from its internals.

`createMiroDocument(capture, clipboard?, id?)` creates native-only UMF without
fabricating a shared visual. Source board IDs must agree. `readMiroDocument`
and `writeMiroDocument` validate through `miroRegistry`; `getMiroClipboard`
returns a detached payload only for native-clipboard reproduction. Host UI
may explicitly copy its HTML/plain-text representations to the browser clipboard
and let Miro paste them. No automatic board writes or private Miro endpoint
are introduced by this native-preservation API.

Clipboard coverage is the copied selection, not necessarily all captured board
items. Callers MUST select the corresponding source deliberately and qualify
proof by client/version and tested selection. Native capture refresh resets
reproduction to capture-only; an old opaque clipboard may survive as historical
unknown content but MUST NOT be presented as the refreshed reconstruction.
An unversioned Miro internal copy format can change; no compatibility beyond
observed tests is claimed. Exact source recovery and edited shared-semantic
projection remain distinct from native clipboard reproduction.

The live 72-item selection proves JSON/YAML preservation and app-mediated native
replay including SDK-opaque symbols. Tested item data, references and layout
match after identity remapping/common paste translation, with sub-4e-13
connector rounding. This is not a comprehensive pixel or inaccessible-data
equivalence claim. See implementation evidence and reduced model counterexamples.
