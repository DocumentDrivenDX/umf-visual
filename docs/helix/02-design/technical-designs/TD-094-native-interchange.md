---
ddx:
  id: TD-094
  type: technical-design
  activity: design
  authoring:
    home: repo
  links:
    - id: US-094
      kind: informed_by
    - id: CONTRACT-086
      kind: informed_by
    - id: SD-094
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

# TD-094: Bounded native visual interchange

**User Story:** [[US-094-native-interchange]]. **Solution Design:** [[SD-094-native-interchange]].

## Scope

Implement US-094 under CONTRACT-086 without revising CONTRACT-083 or the visual
schema. Architecture owns the portable adapter boundary; TP-001 owns test layers.

## Technical Approach

A small synchronous facade validates a candidate projection through the existing
public visual API. Each native adapter owns its scanner/parser, mapping and
canonical serializer. Native engines remain independent test oracles outside
portable source. The facade owns policy, admission, source retention and replay.

Retain the exact native string in a JSON-compatible companion. On replay, parse
that string again under recorded interpretation options and compare the derived
document with the current safe copy. Also compare the recorded baseline and regenerate identity maps from the reparse.
Exact recovery may replay an unchanged source originally admitted with losses,
because replay retains the native constructs that canonical projection cannot carry. This
protects against stale replay after the caller overwrites only the baseline;
it is an integrity check, not authentication of an untrusted receipt.

Use occurrence-qualified identities and generated visual IDs to preserve case,
punctuation and parallel edges. Do not change the visual's identity regex, graph
size limit or cardinality values to admit a native construct.

## Component Changes

| Module | Change | Verification |
| --- | --- | --- |
| `src/interchange/types.ts` | Authoritative shared operation and adapter types | Typecheck and packed declarations |
| `src/interchange/shared.ts` | Diagnostic, identity and path helpers | Adapter contract tests |
| `src/interchange/index.ts` | Facade, capabilities, admission, policy, companions and replay | Cross-format and forged-receipt tests |
| `src/interchange/dot/index.ts` | Bounded DOT parsing and emission | DOT corpus and Graphviz oracle |
| `src/interchange/dot/structure.ts` | Opt-in tree, nested-containment and stack profiles with visible exact labels/details | Strict readback plus Graphviz JSON endpoint and cluster bounds |
| `src/interchange/dot/sequence.ts` | Opt-in DOT-native sequence/lifelines and ladder rows, participant rails, message forms and nested contiguous group blocks | Sequence round-trip tests plus Graphviz JSON geometry and SVG labels |
| `src/interchange/mermaid/index.ts` | Flowchart and ER parsing/emission | Mermaid corpus and native parser oracle |
| `src/interchange/lini/index.ts` | Graph/entity parsing/emission | Lini corpus and pinned WASM oracle |
| `src/index.ts` | Export portable interchange API | Built-package and Chromium consumers |
| `tests/interchange/` | Format and preservation contract coverage | Bun; shared browser scenarios |
| `scripts/` | Native oracle runner and receipts | Exact native versions and accepted/rejected fixtures |

The facade is the integration owner. Adapters may import their shared types,
shared helpers and the local visual API, plus public core types where needed.
They must not import one another or host-native engines. `bun run check:source`
remains the executable public-core and host-dependency boundary check.

## API/Interface Design

CONTRACT-086 and `types.ts` own exact fields and signatures. Adapter parse results
are candidates until the facade admits them. A warning with semantic loss and a
nonblocking advisory are different cases; the facade applies policy centrally.

The DOT structural profile distinguishes tree and nested containment in native
geometry. Trees use directed parent-to-child containment edges, keyed to the
child's source `parent` field; these edges are structural containment, never
authored flow relationships. Graphviz JSON checks the edge endpoints and that
parents sit above their children. Nested structures use native containment
clusters, with explicit invisible constraints arranging each parent's direct
children in compact rows; the parser validates those constraints but does not
import them as authored relationships. Cluster membership is the parent
identity. Both forms place exact label and optional detail values in visible
node labels. Stack layers remain ordered native bands with separately checked
rank and ordering constraints. These qualified layouts avoid presenting a tree
as a flat cluster or a nested form as one long horizontal row.

## Integration Points

Producer → public facade → native adapter → visual/core validation → result pair.
Canonical export follows the reverse path and audits unsupported visual content.
Exact replay reuses the parser rather than trusting a mutable stored snapshot.
Native parser/compiler oracles run only in scripts/tests, never inside this path.

## Security

Treat source and companions as untrusted data. Safe-copy documents and companion
metadata before traversal. Bound source/output length and parser item work. Do
not evaluate native directives or follow evidence, image, click or URL references.
Serialize strings through grammar-aware quoting; test quotes, newlines, delimiters,
Unicode and control characters in the independent native parser.

## Performance

The graph size is bounded at 15 nodes, the profile's own bound (it was the vocabulary's
cap when the profile was written; the vocabulary now advises a split there). Source text and
statement/item limits must prevent large unsupported input from causing unbounded
work before visual validation. No latency or throughput claim is made without
measurement. Original strings remain available after limit refusal.

## Testing

US-094-AC1/AC5 need cross-format expected-meaning assertions, not only a parser
round trip. US-094-AC2/AC3/AC4 need retained bytes, explicit loss, strict default,
forged baseline, changed receipt text/options and companion JSON serialization.
US-094-AC6 needs source limits, 16 nodes, malformed strings and dangling endpoints.
US-094-AC7 requires public built exports in Chromium plus independent native
syntax acceptance. Native parser success alone cannot prove field/cardinality
mapping or preservation of unsupported source.

## Migration & Rollback

This adds a new portable API. Existing vocabulary APIs and imported authorities
stay stable. Remove the new facade exports/modules to roll back; existing visual
documents need no migration. Companions remain ordinary retained data.

## Implementation Sequence

1. Adopt the architecture boundary and authoritative types before native work.
2. Implement facade/policy/replay tests and native adapters in separate directories.
3. Integrate exports and run shared Bun, build, packed-consumer and Chromium gates.
4. Run independent native oracles, review loss coverage and record exact limits.

## Risks

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| Simplified parser accepts unsupported grammar | False support claim | Refuse unknown forms; negative native fixtures |
| Distinct IDs collapse | Wrong endpoints | Synthetic IDs and per-item native identity maps |
| Native markers imply extra semantics | False equivalence | Explicit loss/refusal and native counterexamples |
| Sidecar omitted by consumer | Source unavailable | Document compound persistence and test it |
| Mutable baseline authorizes stale source | Edited meaning replays old native text | Reparse + current-document comparison |

## Schema Basis

Reuse the existing visual schema and public core Document rather than duplicate
a picture model. CONTRACT-086 records the public SDK release and the gap addressed
by local operation-result/companion types. Native source remains native text;
this design does not label it as an authoritative UMF schema.


## Additive grouping and sequence mappings

CONTRACT-086 1.1 governs DOT 0.3.0 and Mermaid 1.2.0. DOT carries grouping through
named nested clusters, scoped defaults, group/node tooltips and independent edge
explanations. A missing child description clears inherited native tooltip state.
Cluster meaning projects to region with an explicit role loss on import; it does
not infer architectural zone, lane or tier semantics. Named cluster count/depth,
ambiguous membership and graph/cluster identity collisions have bounded tests.

Mermaid sequence transport carries ordered participants and messages, actor
roles, call/return/async arrow forms, two-participant notes and contiguous nested
loops. Native message and loop identities are occurrence-qualified; group array
order is not native loop emission order. Explicit participant declarations must
precede content and cannot be redefined. Labels use qualified numeric escaping;
decoded controls, carriage returns, unpaired surrogates and whitespace outside
ASCII space/tab/line feed refuse in sequence labels. Other unknown
syntax, alternative fragments, metadata and ladder layout remain loss/refusal.

The separate DOT sequence profile maps both released `sequence/lifelines` and
`sequence/ladder` forms through explicit native geometry. Participant headers
share a native rank and use invisible ordered constraints to retain source
column order. The profile fixes `nodesep=0.7` and `ranksep=1.5` so long header details
and message labels do not touch; the importer requires these geometry settings. Native message text is carried by external edge labels (`xlabel`) while the native message edges use straight-line splines, preventing long cross-column messages from curving through other rows. The importer requires `splines=line`; native JSON checks each non-self rung has effectively constant y coordinates, while self-messages retain their visible native loop. Each message has a same-rank row of participant anchors; ordered
participant rails connect the header through every row. Lifelines use dashed
rails and ladder uses solid rails, while the directed message rungs remain
independent native edges. Calls use solid normal arrows, returns use dashed
normal arrows, and async messages use open arrowheads. A note is a native note
node attached without arrowheads to its declared two row anchors. Self-messages
remain directed self-edges. Layout-only rails never become authored messages.

Loop, phase, and alternative groups are nested native clusters with visible
typed labels. Every group must cover a nonempty contiguous interval; nested
intervals must form a proper hierarchy. Import checks cluster membership against
each message's participant anchors and identity descriptors, and refuses
unknown DOT statements or altered rail/rung constraints. Native identity attributes carry participant and message IDs, while the visible labels carry names, optional detail and participant role. Status, emphasis, evidence, provenance, question and walkthrough data remain annotation-profile responsibilities. This mapping is
limited to visual model 1.0.0 and does not claim that the DOT profile is a
general-purpose UML sequence grammar.

Sequence labels use compact typed lines (`Participant`, `Role`, `Detail`, `From`, `To`, `Message`, `Kind`, and the visible group role) with JSON-quoted text values for exact multiline recovery; native IDs stay in identity attributes. The entities profile uses a visible entity title and a `Field / Type / Keys / Nullable` table, with JSON-quoted text values and explicit unspecified cells. Flow group and edge labels use `Role / Tier / Label / Detail` and `Kind / Label / Why` rows. These user-facing carriers avoid debug prefixes and length codes while preserving strict parsing. The DOT entities profile fixes `rankdir=LR`, `ranksep=2.5`, and `splines=polyline`; the wider inter-card span separates the visible reference label from both endpoint cardinality labels. Its Graphviz JSON regression checks label text bounds against each other and against both native cards for the quoted/Unicode entities canary.

The sequence profile's native qualification uses `dot -Tjson` to assert
participant column order, message row order, directed endpoints, nested group
membership, and the form-specific rail geometry. SVG checks verify that the
headers, message text, group labels, and native arrow forms render visibly.
Portable parser tests separately prove exact edited-source readback and
refusal of foreign attributes or changed identities. This is the bounded DOT
profile addition; Mermaid's native sequence subset and its alternative-fragment
limitations above remain unchanged.

`test:native:wave2` uses independent Graphviz JSON memberships/endpoints/tooltips
and Mermaid 12.2 parser database order/endpoints/arrow types plus SVG text. The
browser library consumer independently checks public import/export and source
replay for all sixteen affected original examples. `report:loss:wave2` checks
the v0.1.0 source hashes and separates reduced losses on previously emitted pairs
from newly emitted pairs. Existing full semantic support claims remain unchanged.

## Opt-in Readable Annotation Profiles

CONTRACT-087 governs optional DOT/Lini profiles with compact owner-scoped
legends. Shared helpers in src/interchange/annotations own typed values and exact
candidate pointers; format modules derive owner headings and actual native
carrier locators. Root integrates optional profile/coverage results, independently
parses emitted carriers, and compares recovered values/presence/order before
admitting coverage. A parent container cannot suppress unknown descendant losses.

Default native profiles, frozen 1.0.0 companions and replay checks retain their
behavior. Explicit generated 1.1.0 support requires a declared profile/model
implementation. CONTRACT-085 variants keep old native outcomes visible and show
which readable profile satisfies the 53-example/22-form release gate. No native
engine enters portable source; independent native and Chromium witnesses qualify
carrier fidelity and edited recovery separately from local self-roundtrip.
