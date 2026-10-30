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
