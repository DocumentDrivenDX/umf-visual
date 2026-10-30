---
ddx:
  id: visual.language-inventory
  type: current-state-inventory
  activity: discover
  authoring:
    home: repo
  links:
    - id: CONTRACT-083
      kind: references
    - id: visual.architecture
      kind: informs
  schemas:
    - id: umf.visual
      version: "1.0.0"
      title: Visual vocabulary
      path: spec/extensions/visual/schema.json
      schemaFormat: json-schema
---

# Current-State Inventory: Visual language and example instances

## Scope and Boundary

Surveyed on 2026-10-29: the actual visual 1.0.0 schema, handwritten TypeScript
model/semantic validator, declared kind/form table and example corpus. The owner
asks whether this is a common visual language or an architectural-communication
profile. This inventory records existing structure; the architecture and model
roadmap own the proposed separation and future revisions.

Sources: [payload schema](../../../spec/extensions/visual/schema.json),
[types and semantic rules](../../../src/extensions/visual/index.ts),
[CONTRACT-083](../02-design/contracts/CONTRACT-083-visual-vocabulary.md), and
[fixture corpus](../../../fixtures/visual/). Evidence is source-level; no general
native semantic equivalence is inferred from the schema or example renders.

## Evidence Grades

**Evidenced** means the cited checked-in definition or implementation directly
establishes the observation on the survey date. **Partial** means a relevant
implementation exists but a design-defining claim lacks evidence. **Aspirational**
means desired future behavior with no claim of current implementation.

## Inventory

| Aspect | Observed current structure | Grade | Evidence, surveyed 2026-10-29 |
| --- | --- | --- | --- |
| Language declarations | The payload schema has 19 root properties and 19 reusable `$defs`; they include primitives, graph records and kind-specific blocks. | Evidenced | schema.json properties/$defs |
| Kinds and forms | Seven kinds and 22 forms are declared by visualForms. The schema has flat kind/form enums; the semantic validator enforces their pairing. | Evidenced | index.ts visualForms, semantics; schema.json kind/form |
| Authoring intent | A question is required on every picture. Audience, takeaway, source and omissions are root authoring metadata; evidence paths are retained without verification. | Evidenced | CONTRACT-083 common fields; Visual/VisualEvidence |
| Status vocabulary | `built`, `placeholder`, `decided`, `unknown` encode author/project interpretation rather than general native shape states. | Evidenced | schema.json $defs/status; VisualStatus |
| Node roles | `actor`, `own`, `platform`, `external`, `store`, `document` classify architectural participants. They do not define geometric node shape. | Evidenced | VisualRole and node schema |
| Node reuse | Flow, structure and state share nodes. Sequence uses separate participants with overlapping fields but no group/parent/layer slots. | Evidenced | VisualNode/VisualParticipant; content table |
| Link specialization | Flow edges, entity references, state transitions and sequence messages are different records with different required fields and meanings. There is no universal edge record covering all four. | Evidenced | VisualEdge/VisualReference/VisualTransition/VisualMessage |
| Group reuse and limits | Flow/structure use groups and node.group; sequence groups have phase/loop/alternative roles. Timeline lanes are separate labelled items; state has no root groups. | Evidenced | VisualGroup; content table; groupRoles; timeline schema |
| Root composition | One kind/form governs a visual. Mutually exclusive content blocks are enforced semantically; blocks from other kinds fail VISUAL_BLOCK. | Evidenced | content table and semantics |
| Density rules | More than 15 nodes invalidates flow/structure/state. More than seven nodes produces separate composition advice. These limits occur independently of native engine capacity. | Evidenced | MAX_NODES/ADVISED_NODES; VISUAL_SIZE/VISUAL_DENSITY |
| Common native properties absent | Node geometry, generic style/layout constraints, generic named ports and general edge-direction/decoration types have no current typed slots. Entity field endpoints and four cardinality values do exist. | Evidenced | Visual interfaces; schema definitions; adapter loss/refusal handling |
| Example corpus | Fifty visual documents are instances: 12 in forms/ and 38 in inventory/. Together they exercise 22 forms. Three catalog canaries are additional examples, not language definitions. | Evidenced | fixtures/visual and fixtures/catalog enumeration |

## Totals

All 12 observations are Evidenced by the current source; no inventory entry is
Assumed, Partial or Aspirational. These counts describe the audit rows, not
native support or model completeness. Separately, the language declares seven
kinds/22 forms and the schema's 19 `$defs`; the gallery's 50 fixtures/three canaries
must never be presented as 53 language definitions.

## Open Questions

| Question | Decision affected | Owner |
| --- | --- | --- |
| Which typed common elements and constraints should span views without erasing native differences? | Future common-model contract | Library maintainers |
| Which question/role/status/audience/density rules belong in authoring or application profiles? | Future profile separation and migration | Library maintainers |
| Which current losses need an existing-concept mapping versus a typed model addition? | Per-tool roadmap and evidence allocation | Adapter and model maintainers |

The observed 1.0.0 structure combines reusable visual elements with specialized
architectural-communication and composition rules. It therefore supplies an
initial domain-shaped vocabulary, not evidence that a general shared visual
language is already complete. Existing 1.0.0 meaning and imported authorities
remain unchanged by this finding.
