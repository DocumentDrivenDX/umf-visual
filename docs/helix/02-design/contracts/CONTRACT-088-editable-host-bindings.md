---
ddx:
  id: CONTRACT-088
  type: contract
  activity: design
  authoring:
    home: repo
  links:
    - id: CONTRACT-083
      kind: informed_by
    - id: CONTRACT-084
      kind: informed_by
    - id: CONTRACT-085
      kind: informed_by
    - id: CONTRACT-087
      kind: informed_by
    - id: SPIKE-094
      kind: informed_by
    - id: SPIKE-001
      kind: informed_by
    - id: SPIKE-011
      kind: informed_by
    - id: visual.architecture
      kind: informed_by
---

# CONTRACT-088: Editable host bindings and reconciliation

## Purpose

Version 1 design for the P6/P7 continuation after package v0.2.0. Export an
adapter-owned visual, adopt qualified native edits atomically, and update the
native artifact without resetting unrelated layout/content. Original UMF and
native material remain recoverable; retention is distinct from semantic support.

## Scope and Boundaries

Initial profiles are `umf.visual.powerpoint.network/1`,
`umf.visual.google-slides.network/1` and
`umf.visual.miro.editable-network/1`. They begin with bounded `flow/network`,
one explicit slide or board export scope, plain text, declared directed edges
and qualified group membership. Existing Miro `network/1` and its receipts
remain unchanged under CONTRACT-084.

Each profile MUST declare its supported model versions and native runtime/API
evidence. Frozen 1.0.0 remains frozen; the sixteen-node fixture MUST explicitly
use 1.1.0. Initial resource ceilings are 64 semantic nodes, 256 edges, 32 groups,
group depth eight, 10,000 captured native objects, JSON depth 64 and 16 MiB
admitted capture/receipt text. Narrower host limits MUST be declared. PPTX also
needs separate compressed/expanded ZIP, entry-count and relationship bounds.

Root owns shared types/helpers, public exports, package/browser and catalog
wiring. Luna owners implement isolated PowerPoint, Slides and Miro modules.
Native I/O, authorization and credentials stay in injected hosts/runners outside
portable source. No common vocabulary changes are authorized by this contract.

## Normative Surface

The following is the shared seam; root-owned source types pin exact exported
names before adapter integration. Host payloads stay adapter-owned JSON or
bounded opaque-part records, rather than a universal native drawing model.

```ts
type Host = 'powerpoint' | 'google-slides' | 'miro';
type NativeRevision = {kind:'host-revision'|'content-digest'; value:string};
interface HostResource {host:Host; documentId:string; pageId?:string}
interface HostMapping {
  logicalId:string; kind:string; path:string;
  nativeId:string; nativeScope:string;
}
interface HostLoss {
  path:string; code:string; family:'semantic'|'native';
  representation:'retained-only'|'unrepresented'; message:string;
}
interface HostObservation {
  resource:HostResource; revision:NativeRevision;
  captureDigestSha256:string; payload:Json;
}
interface HostBinding {
  profile:string; modelVersion:string; resource:HostResource;
  bindingRevision:number; source:Document; sourceDigestSha256:string;
  baselineNative:HostObservation; mappings:HostMapping[]; losses:HostLoss[];
  state:'writing'|'complete'|'interrupted'; pending?:Json;
}
interface ReconcileFence {
  expectedBindingRevision:number;
  observedBefore:HostObservation; observedAfter:HostObservation;
}
type HostPresence = {present:false} | {present:true; value:Json};
interface HostChange {path:string; before:HostPresence; after:HostPresence}
// Root helpers: admitHostBinding, checkHostFence, finishHostReconciliation.
// A host adapter independently reads baseline/current native semantics first.
// Pure reconciliation then returns:
// success: copied document + next binding + capture + changes/nativeOnly/losses;
// refusal: admitted binding/source/capture + diagnostics, no replacement document.
```

The shared layer admits bindings, checks fences and validates final semantic
changes; it MUST NOT infer OOXML, Slides or Miro meaning from `payload`. Each
adapter independently projects its admitted baseline/current observations.
PowerPoint binary retention may use bounded host-specific base64-part records
or a separately serialized byte companion; a generic JSON field does not make
the archive understood. External parsing dependencies may enter only the
reviewed PowerPoint adapter allowlist, never vocabulary validation.

`finishHostReconciliation` MUST reconstruct the whole next document from the
declared presence-aware patches and compare it with the proposed result. The
initial semantic edit allowlist is fixed: visual title/question, node label,
edge label/from/to. Model/source identity and unknown content cannot change.
Semantic edits require complete current inspection; a no-op may preserve
unknown content unchanged. These edit classes cannot erase prior loss entries.

All inputs MUST be admitted as owned finite JSON before reads/traversal. Native
IDs MUST resolve to actual objects, shape/part slots or qualified connector
addresses in the bound resource. A logical entity may own multiple native
slots, such as line and caption; each slot needs its own mapping key. Mapping
keys and scoped native addresses MUST be bijective. Labels, position and shape
icons MUST NOT substitute for identity or infer roles/status/containment.

Bindings MUST be validated by reconstructing their baseline native projection
and comparing it with the bound source's represented fields. A caller-supplied
source digest or baseline alone is insufficient. Source-only unknown fields
remain in the copied source and receive path-specific losses. A binding is a
consistency artifact, not a signature or authorization token.

### Revision and concurrency rules

Reconcile MUST require a complete binding, exact resource/profile/model match,
the expected binding revision, and unchanged current UMF relative to the bound
source. Digests MUST cover the declared complete canonical source/snapshot,
with adapter-owned normalization documented and tested; no semantic fields may
be excluded merely to make a fence pass.

An edited host revision may legitimately differ from the baseline revision.
The two current observations MUST agree in resource, revision and capture
digest. A missing token or arbitrary truthy revision string is not a fence.
Hosts with conditional revision writes MUST use them when applying an update;
file workflows MUST check the input/output artifact digests. Two matching
captures reduce races but do not claim a transaction or exclude ABA changes.

Success MUST validate the entire resulting document before exposing it, retain
the full current native observation, increment `bindingRevision`, and bind the
new source/native baseline for the next cycle. Failures MUST expose no partial
semantic replacement and MUST retain safely admitted recovery material.

### Field ownership and preservation

Each profile MUST list owned JSON Pointer/native-slot pairs and edit classes.
The first semantic edits are title/question, node text, edge captions and
explicit attached endpoints. Movement, resize, styles, routing and unknown host
content stay native-only unless a separate qualified mapping exists. Group
reparenting is outside the initial semantic edit allowlist. Changing a mapped
semantic membership MUST refuse; presentation-only native grouping may remain
native-only. Frame/group presentation is not inferred as common containment.

Native-preserving update MUST patch only owned slots against the latest fenced
artifact, preserving unrelated objects, metadata, native-only properties and
unknown extensions. PPTX must preserve untouched part bytes and unknown content
inside modified parts, or refuse. Slides/Miro must use bounded property updates
and retain the rest of the capture. Regenerating a fresh default layout is an
export operation, not a native-preserving update.

Strict mode MUST refuse every retained-only semantic field. Report mode MUST
list exact source/native paths and distinguish semantic omission, native-only
retention and unknown capability. Original JSON, embedded OOXML source, sidecar,
clipboard or image alone MUST NOT clear a loss. Registered visible annotations
require actual editable object identities and readback under CONTRACT-087's
principles; they never replace intrinsic graph meaning.

### Writes and interrupted operations

Create/update plans MUST name affected objects, native slots and revision
preconditions before host execution. Checkpoints MUST retain detached progress
before mutation, after assigned IDs and after verification. On partial failure
or timeout, return `interrupted` with known and uncertain outcomes; do not
automatically retry, delete partial work or claim remote atomicity. Recovery is
read-only until correspondence and current host state are independently checked.

A later explicit read-only recovery MAY establish final readback after a host
write's immediate verification fence refused. It MUST retain that interrupted
receipt and cause, take two fresh agreeing actual observations, validate all
mapped identities and the complete expected source, and check native-only and
unowned content. It MUST NOT retry the write, mark the failed fence successful,
or claim atomicity. A complete recovered binding needs independent semantic
reconciliation against a previously admitted correspondence; changing a state
flag alone is insufficient. Evidence records the successful later readback and
its recovery method separately from the original interrupted operation.
If host-managed metadata drifts while observations settle, a bounded evidence
comparison MAY report exact path/value, presence or order exceptions separately.
Both raw captures and native-only differences MUST remain retained; every other
property and prior identity must still compare. Such exceptions do not establish
semantic equivalence, permit adapter-wide normalization, remove losses, or
support an unqualified claim that all native properties were unchanged.
Separately authorized operations on unowned objects MAY explain an interleaved
change only through independent receipts matching the same resource, identities
and exact before/after property deltas. Evidence MUST name that separate
operation rather than label the change normalization or unchanged preservation.
Unmatched drift remains a conflict; a matching final capture alone is not
causal proof that an earlier write preserved the whole board.

## Precedence and Compatibility

CONTRACT-083 owns model semantics, CONTRACT-084 owns existing Miro profiles,
and CONTRACT-085 owns catalog/loss truthfulness. This contract governs the new
binding/reconciliation boundary only. Profile/model mismatches refuse; no
implicit upgrade or re-interpretation of old receipts is allowed.

## Error Semantics

| Condition | Outcome | Recovery |
| --- | --- | --- |
| Local source or expected binding revision changed | `STALE_SOURCE` / `STALE_BINDING` | Explicitly resolve revisions; never merge silently |
| Wrong resource/profile/model; forged baseline or digest | `BINDING` | Reject before host mutation |
| Duplicate, copied, missing, stripped or renamed mapped identities | `IDENTITY` | Atomic refusal; retain current native capture |
| Unmapped/detached endpoint or ambiguous grouping | `ENDPOINT` / `STRUCTURE` | Refuse unsupported structural adoption |
| Current observations/revision preconditions disagree | `CONCURRENT_EDIT` | Capture again after edits settle |
| Unknown/unrepresented semantic edit | `UNSAFE_EDIT` / path loss | Preserve material; select explicit report mode if applicable |
| Malformed JSON/XML/ZIP, external entity or unsafe part target | `INPUT` / `LIMIT` | Reject without evaluation, fetching or writes |
| Host/checkpoint timeout or partial write | `WRITE_INTERRUPTED` | Persist receipt and inspect uncertain outcomes |

New unrelated native objects may remain native-only in capture. Objects claiming
this binding's identity are conflicts. Creation/deletion, grouping, rich text,
rotation and connector-type changes need explicit positive/negative admission
tests; an unqualified operation MUST refuse rather than disappear.

## Examples

One node-label edit and one connector reconnection yield two source-path
changes; a moved shape appears separately in `nativeOnly`. Reconciliation
updates all three in one returned binding, preserving unrelated master/theme or
board content. If the document changed locally or a copied native object claims
the same slot, return the original binding/current capture and no document.

## Verification Handoff

P12 extends qualification to each of the five shared synthetic integration
cases in each of the three host families. Fifteen actual previews and fifteen
supported repeated cycles are separate gates under CONTRACT-085. Every pair
must bind exact source/profile/model/mapping identity to actual native artifact
or fenced capture and final readback. A previous canary or different case's
host receipt MUST NOT qualify an untested pair. Unavailable/unsupported pairs
stay open unless explicitly deferred by the owner.

Each cycle exercises qualified native text and eligible attached-endpoint edits,
native style/movement, fenced semantic import, serialized binding and a
different UMF-owned preserving update followed by actual native readback.
Unsupported structural edits MUST refuse; unknown/native-only properties and
losses MUST survive the cycle. A plan, format parser, screenshot or converted
PPTX alone does not establish this host cycle. Public images use isolated
synthetic resources, with no unrelated private native content.
The receipt distinguishes editor UI actions, direct native API/SDK edits and
offline trace replay. Actual host API cycles may qualify their stated boundary;
they MUST NOT be described as UI-edited or direct live transport if that route
was not exercised.

Every profile needs export → actual native no-op/save → native text/reconnect
and movement/group edits → fenced import → JSON/YAML persistence → a second
native-preserving update and host readback. Exercise stale/forged/concurrent,
duplicate/missing/stripped identity and interrupted-write controls independently.
Portable Bun/Chromium and injected test doubles prove library behavior only;
actual PowerPoint, Google Slides and Miro evidence must identify tested host
versions, resource scope and capture limitations. Missing host access is an
explicit qualification blocker, not a successful native round trip.

## Schema Basis

Inspected public core SDK 0.5.7 Document/Json and the core envelope 0.10.0,
frozen visual 1.0.0 schema under spec/extensions/visual/1.0.0/, and explicit
visual 1.1.0 authored schema under spec/extensions/visual/. Reuse those semantic
authorities unchanged. Bindings/captures are adapter-owned companion data, not
a new common visual vocabulary or an inferred graph model. Unknown document
extensions survive through the copied source, with retained-only loss where
their meaning has no qualified editable native representation.
