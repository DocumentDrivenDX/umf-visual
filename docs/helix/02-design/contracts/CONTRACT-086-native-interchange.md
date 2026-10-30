---
ddx:
  id: CONTRACT-086
  type: contract
  activity: design
  authoring:
    home: repo
  links:
    - id: FEAT-035
      kind: informed_by
    - id: visual.architecture
      kind: informed_by
    - id: CONTRACT-083
      kind: informed_by
  schemas:
    - id: umf.visual
      version: "1.0.0"
      title: Visual vocabulary
      path: spec/extensions/visual/schema.json
      schemaFormat: json-schema
---

# CONTRACT-086: Source-preserving native visual interchange

**Type:** library. **Version:** 1.1.0. Exact TypeScript shared fields are owned by
`src/interchange/types.ts`. This contract owns behavior and qualified mappings.

## Purpose

Import and export bounded native diagrams while keeping native source, identity
and unsupported meaning inspectable. The neutral visual remains CONTRACT-083.

## Scope and Boundaries

The format selectors are `dot`, `mermaid` and `lini`. DOT covers Graphviz's DOT
language for `.dot` and `.gv` files. Mermaid covers flowchart and entity-relationship
(ER) subsets. Lini covers graph and entity subsets. A capability declaration
names each adapter profile, its version, subset and directions. Native engine
versions and actual observed acceptance belong in execution evidence.

Native syntax documentation is [DOT](https://graphviz.org/doc/info/lang.html),
[Mermaid flowchart](https://mermaid.js.org/syntax/flowchart.html),
[Mermaid ER](https://mermaid.js.org/syntax/entityRelationshipDiagram.html),
[Mermaid sequences](https://mermaid.js.org/syntax/sequenceDiagram.html), and
[Lini](https://lini.rs/). Mermaid documentation inspected on 2026-10-29 identified
12.2.0; the planned Lini oracle is the pinned 1.1.0 runtime. Declaring a profile
must not claim all syntax of these languages or acceptance by an untested version.

## Normative Surface

### Public calls and result ownership

| API | Input | Outcome |
| --- | --- | --- |
| `importVisual` | Native source string; format, id, question, optional mode | ImportVisualResult |
| `exportVisual` | Public core Document; format, optional mode/source/original | ExportVisualResult |
| `interchangeCapabilities` | Public capability records | Format/profile/version/subset/directions |

Mode defaults to `strict`; the alternative is `allow-reported-loss`.
A result MUST set `ok:false` when it has an error diagnostic or policy refusal.
Import id/question MUST be nonempty. Options and source companions MUST undergo
public core safe-JSON admission before property traversal; accessors and cycles
MUST NOT execute or reach adapter code.
A successful import MUST supply a valid visual document. A failed import MUST
retain the original source and MUST NOT expose a successful partial document.
A failed export MUST NOT expose usable native output as a successful result.

The native source is a **companion artifact**, represented by RetainedVisualSource.
Serializing only `result.document` does not preserve native bytes. Consumers
requiring durable recovery MUST retain the whole `{document,source}` pair.
The receipt MUST carry format, exact string, interpretation options, baseline
and identity mappings even when projection is refused; an unavailable baseline
may be an empty string. Source retention promises exact JavaScript string code
units, not a filesystem encoding/BOM recovery beyond the supplied string.

Neither native-source identity nor an integrity comparison is cryptographic
provenance. Callers can author a different source and document pair.

### Adapter boundary

Each adapter MUST implement VisualInterchangeAdapter from `types.ts`: parse
native text into a candidate Visual, and serialize a Visual into native text.
AdapterContext carries the caller's id/question. The facade owns core copying,
validation, limits, policy, result copying, replay and capability selection.
Adapters MUST NOT import core internals, execute native engines, fetch resources,
read paths or depend on renderer implementation APIs.

### Identity and semantic scope

Every mapped node, edge and reference MUST have an IdentityMapping. Fields MUST
map by owning visual node and full document path. Anonymous or parallel edges
MUST have occurrence-qualified native identities; endpoint pairs alone cannot
identify repeated edges. Different native IDs MUST NOT merge through case folding,
slugging or display-label equality. Synthetic visual IDs are permitted; every
reference MUST use the mapped target, and maps MUST retain native identities.

The caller supplies `id` and `question` because a native graph does not declare
the visual's reader question or UMF identity. These context values and standard
envelope carrier fields are outside graph-equivalence claims. Unknown envelope
content, unrelated vocabularies/modules and meaningful visual fields omitted by
native export MUST be reported or refused. Native identity transport through a
map is separate from raw identifier spelling in generated output.

The `umf.visual` 1.0.0 node cap remains 15. An adapter MUST NOT truncate a graph
to meet that cap. Native IDs outside the visual pattern MUST be mapped, never
weaken the vocabulary pattern. Only the four declared VisualCardinality values
may be represented. A missing value MUST stay unspecified; it must not silently
become `exactly-one`, `zero-or-many` or another native default.

### Bounded mapping rules

| Profile area | Supported meaning | Meaning requiring report or refusal |
| --- | --- | --- |
| DOT directed graph | Explicit nodes/edges, labels, node/cluster descriptive tooltips, edge explanations and bounded named nested clusters/membership | Undirected edges, unsupported attributes/defaults, ports, HTML labels, anonymous/non-cluster subgraphs and unrepresented role/tier/layout semantics |
| Mermaid flowchart | Explicit/implicit nodes, supported labels, directed links and bounded frontmatter title | Shapes with unrepresented meaning, undirected/multiple arrow markers, styles, clicks, directives, subgraph semantics and other syntax outside the adapter subset |
| Mermaid sequence | Ordered participants, actor role, call/return/async message arrows, two-participant notes, contiguous nested loops and bounded titles | Activation/timing/concurrency, alternative fragments, ladder layout, unrepresented participant/message metadata and unsupported text |
| Mermaid ER | Entities, supported fields/keys, bounded frontmatter title and relationships with four explicit cardinalities | Identifying/nonidentifying distinction, field comments, unsupported types/attributes and relationship meanings not carried by VisualReference |
| Lini graph/entity | Explicit node identities/labels, card hint/detail, supported entity rows, directed links and qualified field endpoints | Layout/styles, drawing/schematic/chart operations, unsupported markers, nested identity scope and other syntax outside the adapter subset |

### Existing-field descriptive mappings

The current profiles Mermaid 1.2.0, DOT 0.3.0 and Lini 0.2.0 map existing visual
fields; the visual vocabulary remains 1.0.0. Public capability records MUST name
the implemented adapter profile version; these numbers do not name native engines.

Mermaid title transport uses a single JSON-quoted YAML frontmatter `title` scalar
for both flowchart and ER output. The current exact-title subset refuses
ampersands, angle brackets and carriage returns altered by the qualified
Mermaid renderer. Line feeds, tabs, boundary spaces, quotes, backslashes,
literal backticks and supported Unicode scalars retain their title text under
the native checks; this does not broaden Mermaid label syntax.
Frontmatter keys must be unindented root entries; nested/indented metadata is
refused to prevent a nested title from being mistaken for the document title.
The bounded importer MUST reject duplicate,
malformed, empty or unrepresentable titles and report other frontmatter meaning;
it MUST NOT apply native configuration directives. Native title display and
escaping require independent engine checks. Metadata outside this subset remains
retained with loss or a safe refusal.

DOT node `tooltip` and Lini card `hint` transport VisualNode.detail as descriptive
text. Native tooltip presentation is a qualified rendering choice: it does not
promise that every renderer displays a persistent caption. These values MUST NOT
be used as native/visual identity, project status or role. Actual native path
identities remain in the identity map. Missing optional detail stays absent; an
explicit native empty hint/tooltip MUST NOT silently become absence if that
would discard native meaning or create an invalid empty visual detail.

Imports/exports MUST preserve supported detail string values and qualify each
native's escape, whitespace and default semantics. A DOT default tooltip applies
according to native node creation/override behavior or MUST be refused/reported.
Graphviz's raw tooltip value retains ordinary spaces; its SVG renderer may
encode consecutive spaces as nonbreaking spaces to preserve visible spacing.
Native checks must distinguish that display encoding from raw attribute text.
Unknown attributes and unsupported escapes remain losses/errors. Lini native
card hints normalize boundary whitespace: import maps the native-canonical
detail value and emits LINI_DETAIL_TRIM when normalization occurs; export must
report the same native alteration without mutating the supplied visual. Exact
source whitespace remains in the companion. Lini field hints
remain unrepresented because current VisualEntity fields have no detail slot;
card-detail support MUST NOT remove those field-level loss diagnostics.

The concrete supported grammar MUST be named in each capability's subset and
its tests. A construct MAY be refused even under reported-loss mode when the
parser cannot safely find its boundaries. Such refusal is narrower support,
not successful partial interpretation.

No adapter may promote an undirected relationship to a directed flow edge.
ER identity/enforcement semantics are not inferred from a visual line style.
A Lini many marker lacking a minimum cannot imply a zero or one minimum.
Native type strings are display metadata, not executable type constraints.

### Preservation, policy and replay

All unsupported native content MUST remain in the companion source string.
Projected-away meaning MUST have a diagnostic with `loss:true`. Keeping source
is not proof that the neutral projection carries that meaning. Strict canonical projection policy
MUST refuse any `loss:true` diagnostic; reported-loss policy MAY admit a valid
supported subset while returning all losses. Syntax, resource, invalid-reference
and invalid-visual errors remain errors in both modes.

Lexical whitespace and comments may change during canonical export without a
semantic-loss diagnostic. Exact formatting recovery is only the `original:true`
operation. Unknown attributes, styles or semantic directives are not lexical
whitespace and MUST be diagnosed when not represented.

For `original:true`, the facade MUST require a retained same-format source,
reparse it using recorded interpretation options, validate the resulting document,
and compare it with the supplied current document. The recorded baseline is an
additional guard, never the sole authority. A caller-overwritten baseline MUST
NOT permit stale source replay. Any unsupported edit, changed source identity,
failed reparse or mismatch MUST refuse exact replay. This first profile MAY
conservatively refuse all edits; it does not promise arbitrary source rewriting. Original recovery MAY succeed under
default strict mode for a source whose initial projection required reported-loss
mode: replay retains its native constructs rather than discarding them. Reparse
hard errors and mismatches still refuse; the original projection is not thereby
claimed complete. Returned identity maps MUST come from the reparse rather than
trusting caller-editable companion mappings.

Canonical export after import MUST carry forward relevant retained-source losses
when supplied a companion; it MUST NOT claim lossless output merely because the
current neutral payload has already forgotten the unsupported construct.

### Diagnostics and bounds

Diagnostic code, JSON Pointer path, message, severity and `loss` are required.
An import diagnostic path MUST begin `/source`; export paths address the input
UMF document. Optional source ranges are half-open UTF-16 offsets into the
original supplied string. Reports MUST distinguish semantic loss from nonblocking
advice. Unknown future native constructs MUST not be called fully interpreted.

Import source is bounded to 262,144 UTF-8 bytes before parsing, measured portably
without host APIs. Input/output and parser item limits MUST be explicit and tested. Core's released safe
JSON limits still apply. Limits MUST fail atomically, without successful partial
output, and import MUST retain the original source after refusal.

## Precedence and Compatibility

CONTRACT-083 governs visual validity; this contract cannot relax it. The released
core package governs document admission and unknown-content copying. The exact
shared shape is TypeScript in `types.ts`; changing meanings or removing fields
requires a major interchange profile revision. Additive syntax support needs
new tests and updated capability qualification. A native engine accepting output
does not establish neutral semantic equivalence or layout quality.

## Error Semantics

| Condition | Outcome | Recovery |
| --- | --- | --- |
| Malformed or safely unparseable source | Error; failed result with source | Correct source or select supported subset |
| Unsupported meaning in strict mode | Policy refusal and located loss reports | Explicitly allow reported loss or preserve source |
| More than 15 nodes or a resource bound | Error without truncation | Split the authored diagram |
| Invalid visual/reference | Error in either policy | Repair the source/document |
| Missing/wrong/stale source for exact replay | Error without source output | Supply unchanged imported pair or use canonical export |
| Unknown/omitted native or visual content | Report loss or refuse | Retain companion and review projection |

## Examples

```ts
const imported = importVisual('digraph { A -> B; }', {
  format:'dot', id:'example', question:'What calls what?',
});
if (imported.ok && imported.document) {
  const saved = JSON.stringify({document:imported.document, source:imported.source});
  const pair = JSON.parse(saved);
  const exact = exportVisual(pair.document, {
    format:'dot', source:pair.source, original:true,
  });
  // exact.text equals the supplied original string when replay guards pass.
}
```

## Schema Basis

Inspected and reused `umf.visual` 1.0.0 and released `@umf/core` 0.5.7's public
Document/validation/copying boundary. Core's generic elements do not encode a
picture's nodes, fields and links with this visual vocabulary's exact semantics;
no new core/domain model is introduced. The local structured addition is the
operation result, identity map and retained native companion, whose TypeScript
source is authoritative. The existing visual JSON Schema remains unchanged.


## Second-wave additive mappings

DOT clusters may carry group labels, descriptive tooltips, parent nesting and
node membership. Import MUST distinguish native cluster grouping from inferred
Visual group role: lane, tier, zone and other domain/profile roles are not
established by cluster syntax alone. Export of zoned or lanes forms MUST report
unrepresented lane/tier/layout meaning. Node parent containment is separate from
group membership. Scoped native defaults, unknown attributes, multi-membership
and ambiguous cluster/edge syntax MUST be interpreted precisely or refused.
An edge tooltip may carry its existing `why` explanatory text independently of
its label, with the same qualified escape/default rules as node detail.
A child cluster with absent detail MUST NOT inherit an unauthored parent detail.
The bounded exporter uses native empty cluster tooltip reset when necessary;
the importer maps that reset to absent secondary detail, preserving native label
fallback. Empty node/edge tooltip rules remain separately qualified.

Mermaid sequence diagrams may carry ordered participant labels and messages,
explicit call/return arrow kinds and titles. They MUST NOT infer activation,
timing, concurrency or application status. An absent message kind MUST NOT
silently become an explicit call without a loss diagnostic. Lifelines versus
ladder layout and unsupported message/group meanings MUST remain explicit.
Participant and message identity mappings have distinct `participant` and
`message` kinds, preserving occurrence-qualified native message addresses.
Native-engine checks MUST verify the existing examples' participant labels,
ordered message text, group membership and cross-boundary edge cardinality.

All fixture source bytes remain unchanged. Provenance, evidence, roles, status,
walkthrough steps and other unrepresented fields still require reported loss.
The catalog MUST distinguish native render success from full semantic support.
Progress comparisons count losses on previously emitted pairs separately from
newly emitted pairs; widening coverage must not masquerade as losing less meaning.
