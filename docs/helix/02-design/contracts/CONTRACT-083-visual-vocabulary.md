---
ddx:
  id: CONTRACT-083
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: US-093
      kind: informed_by
---

# CONTRACT-083: Visual vocabulary

**Profiles:** frozen `umf.visual` 1.0.0/1.1.0/1.2.0/1.3.0, plus additive 1.4.0 below. **Native representation:** UMF
JSON/YAML with the visual package registered. No renderer, layout or Mermaid output is claimed.

## Purpose

Describe one picture as data: its kind and form, the reader's question, its parts and their
relationships, and an optional walkthrough. Renderers draw it in a theme; producers check it
against its source. The payload carries roles and statuses, never colors, fonts, sizes or
coordinates.

## Scope and Boundaries

One visual per document. The payload is the document-scope extension `umf.visual`; the package
declares only the `document` scope, so a payload on a module or element is core
`EXTENSION_SCOPE`. Modules and elements carry no visual meaning. The complete payload schema
is `spec/extensions/visual/schema.json`, embedded in `package.json`.

```yaml
umf: "0.10.0"
id: visual:beacon-deployment
vocabularies: {umf.visual: {version: "1.1.0"}}
extensions:
  umf.visual: {id: beacon-deployment, kind: flow, form: zoned, question: "...", ...}
modules: []
```

## Normative Surface

### Identity

`Id` is `^[a-z0-9]+(?:[_-]+[a-z0-9]+)*$`, at most 128 characters (underscores admit
architecture-model ids such as `support_agent`). Every identified item in a visual (groups, nodes,
edges, steps, participants, messages, layers, references, transitions, lanes, periods, events,
spans, markers, items, criteria, categories, series) shares one namespace: a repeated id is
`VISUAL_ID`. A reference that does not resolve to an item of the expected sort is
`VISUAL_REFERENCE`.

### Common fields

| Field | Required | Values |
|---|---|---|
| `id` | yes | `Id`, stable across regenerations |
| `kind` | yes | `flow`, `sequence`, `structure`, `state`, `timeline`, `comparison`, `metric` |
| `form` | yes | one of the kind's forms below; otherwise `VISUAL_FORM` |
| `question` | yes | the one question the visual answers |
| `title`, `takeaway` | no | text |
| `audience` | no | `developer`, `operator`, `user`, `data`, `executive` |
| `source` | no | `{path, view?, digest?}`, the governed source it was drawn from |
| `omissions` | no | text list of what was left out |
| `steps` | no | walkthrough (below) |

| Kind | Forms | Top-level content | Kind block |
|---|---|---|---|
| `flow` | `network`, `pipeline`, `zoned`, `lanes` | `nodes` (required), `edges`, `groups` | none |
| `sequence` | `lifelines`, `ladder` | `groups` (phases) | `sequence` (required) |
| `structure` | `stack`, `tree`, `nested`, `entities` | `nodes` (required), `groups` | `structure` |
| `state` | `machine`, `lifecycle` | `nodes` (the states, required) | `state` (required) |
| `timeline` | `milestones`, `roadmap`, `history` | none | `timeline` (required) |
| `comparison` | `matrix`, `quadrant`, `before-after` | none | `comparison` (required) |
| `metric` | `stat`, `bar`, `line`, `meter` | none | `metric` (required) |

Content or a kind block not listed for the visual's kind, or a missing required one, is
`VISUAL_BLOCK`. `node.parent` is for `structure` and `state` (composite states) only;
`node.layer` is for `structure` only; otherwise `VISUAL_BLOCK`.

### Roles and statuses

| Field | Values |
|---|---|
| `node.role` | `actor`, `own`, `platform`, `external`, `store`, `document` |
| `status` (nodes, edges, messages, transitions, events, spans) | `built`, `placeholder`, `decided`, `unknown` |
| `edge.kind` | `action`, `data`, `control`, `return` |
| `emphasis` | `focus`, `muted` |
| `group.role` | `zone`, `boundary`, `lane`, `tier`, `region` (flow, structure); `phase`, `loop`, `alternative` (sequence) |

A group role outside its kind's set is `VISUAL_FORM_RULE`.

### Graph content

- `groups[]`: `{id, label, detail?, role, tier?, parent?, status?, emphasis?}`. `detail` is a
  short caption a renderer may set under or beside the label (a zone's "Deployed by CI over
  OIDC"); `tier` is an integer ≥ 1; `parent` names a group.
- `nodes[]`: `{id, label, detail?, role?, status?, emphasis?, group?, parent?, layer?, evidence?}`.
  A node belongs to at most one group because membership is one field.
- `edges[]`: `{id, from, to, label?, why?, kind?, status?, emphasis?, evidence?}`; ends are nodes.
- `evidence[]`: `{path, contains?}`. Retained, never checked by UMF.

A cycle through `node.parent` or `group.parent` is `VISUAL_CYCLE`. `VISUAL_SIZE` is a resource
limit, not a legibility rule: more than 500 nodes, or more than 10,000 `edges`, `references`,
`transitions` or `messages`. Legibility is advice (Error Semantics).

### Kind blocks

- **`sequence`**: `participants[]` (at least 2; node fields without `group`, `parent`, `layer`),
  in reading order; `messages[]` (at least 1) `{id, from, to, label, kind?, group?, status?,
  emphasis?, evidence?}` where `from`/`to` are participants, `kind` is `call`, `return`,
  `async` or `note`, and `group` names a phase, loop or alternative group.
- **`structure`**: `layers[]` `{id, label}`, top to bottom; `entities[]` `{node, fields[]}` with
  fields `{id?, name, type?, keys?, nullable?}` (an entity may list none) and `keys` drawn from `pk`, `fk`, `uk`;
  `references[]` `{id, from: {node, field?, fieldId?}, to: {node, field?, fieldId?}, label?,
  fromCardinality?, toCardinality?, fromMultiplicity?, toMultiplicity?}` with cardinalities
  `zero-or-one`, `exactly-one`, `zero-or-many`, `one-or-many`. A field's `id` is a stable `Id`
  scoped to its entity, separate from the displayed `name`. An end names its field by `field`
  (the name), `fieldId`, or both; each must exist in that node's entity and both must name the
  same field (`VISUAL_REFERENCE`). Field names and field ids are unique per entity and an entity
  is declared once per node (`VISUAL_ID`). A multiplicity `{min, max?, text?}` gives exact
  bounds: `min` and `max` are integers ≥ 0, an absent `max` is unbounded, and `text` keeps the
  source's notation (`2..5`). `max` below `min`, or a cardinality whose bounds differ from the
  multiplicity's (`zero-or-one` 0..1, `exactly-one` 1..1, `zero-or-many` 0.., `one-or-many`
  1..), is `VISUAL_VALUE`. A producer whose source states bounds no cardinality names gives the
  multiplicity alone; it never widens them to the nearest marker.
- **`state`**: `initial` (a state), `final[]` (states), `transitions[]` (at least 1) `{id, from,
  to, event, guard?, action?, path?, status?, emphasis?}`, `path` being `main`, `alternate` or
  `failure`.
- **`timeline`**: `scale` is `{kind: date}` or `{kind: period, periods[]}` (periods `{id, label}`,
  in order). `lanes[]` `{id, label}`; `events[]` `{id, label, at, lane?, detail?, status?,
  emphasis?}`; `spans[]` `{id, label, start, end, lane?, detail?, status?, emphasis?}`;
  `markers[]` `{id, label, at, kind}` with `kind` `today`, `deadline` or `marker`. On a date
  scale, `at`, `start` and `end` are ISO-8601 (`YYYY-MM`, `YYYY-MM-DD` or a date-time with
  offset) and must be real proleptic-Gregorian UTC calendar values, years 0000–9999 (a year
  below 100 is that year, not one in the 1900s); on a period scale they are period ids. An invalid
  date, or a span ending before it starts, is `VISUAL_DATE`.
- **`comparison`**: `items[]` (at least 2) and `criteria[]` (at least 1), each `{id, label,
  detail?}`; a criterion also has `measure` (`text`, `rating` or `support`), `max` (an integer
  2–10, required for and only for `rating`), and optional `low`/`high` end labels. `values[]`
  `{item, criterion, text | rating | support, note?}`, `support` being `yes`, `no` or
  `partial`. A value without exactly one value key, a value key that disagrees with its
  criterion's measure, or a rating outside 0..`max`, is `VISUAL_VALUE`; two values for one item and criterion is `VISUAL_ID`.
  `chosen` `{item, reason}`; `axes` `{x, y}` naming criteria.
- **`metric`**: `unit` (required), `good` (`up` or `down`), `format` `{kind, decimals?,
  currency?, compact?}` with `kind` `number`, `percent`, `currency` or `duration`, `decimals`
  0–6 and `currency` a three-letter code. `axis` is `{kind: time}` or `{kind: category,
  categories[]}`. `series[]` (at least 1) `{id, label, points[], emphasis?}` with points `{at?,
  value}`, `value` a JSON number. `target`, `baseline` and `comparison {label, value}` are
  numbers. With an axis every point has an `at` (`VISUAL_VALUE`): an ISO-8601 date on a time
  axis (`VISUAL_DATE`) or a category id on a category axis (`VISUAL_REFERENCE`).

### Walkthroughs

`steps[]` `{id, title, caption?, focus[], when?, tag?}` (`focus` at least one id of any
identified item) is permitted on `flow`, `sequence`, `state` and `timeline`; elsewhere
`VISUAL_STEPS`.

Steps are numbered in order. A step with `when` stands outside the numbering: it is marked with
words instead of a number and said after the numbered steps. `when` says when it happens:

| `when` | Default mark | Meaning |
|---|---|---|
| `throughout` | THROUGHOUT | alongside every numbered step (an audit trail, tracing, an auth check) |
| `before` | BEFORE | ahead of the sequence (setup, a deploy, a sign-in done once) |
| `after` | AFTER | once the sequence ends (clean-up, a notification, billing) |
| `background` | IN THE BACKGROUND | off the request's path (a queue, a job worker) |
| `scheduled` | SCHEDULED | on a timer (a nightly sync, a sweep) |
| `on-failure` | ON FAILURE | when a step fails (a retry, a fallback, an alert) |
| `optional` | IF NEEDED | only in some runs (an approval, a cache miss) |
| `other` | its `tag` | any other moment, named by `tag` |

`tag` (1–24 characters) replaces the default mark's words, for example `NIGHTLY` on a
`scheduled` step or `ON RETRY` on an `other` step. `when: other` without a `tag`, or a `tag`
without a `when`, is `VISUAL_STEPS`. Renderers draw marks in upper case and may lead the step's
text with the mark in sentence case ("Throughout: …").

### Form rules (`VISUAL_FORM_RULE`)

| Form | Rule |
|---|---|
| `flow/pipeline` | Edges other than `return` form no cycle |
| `flow/zoned` | Every node is in a group; every root group has a `tier` |
| `flow/lanes` | Every node is in a `lane` group or a group inside one |
| `structure/stack` | `structure.layers` is present and every node has a `layer` |
| `structure/tree` | Exactly one node has no `parent` |
| `structure/entities` | `structure.entities` is present and non-empty |
| `state/lifecycle` | `main` transitions form one unbranched path from `initial` |
| `timeline/milestones` | At least one event |
| `timeline/roadmap` | At least one span, lanes declared, every span in a lane |
| `timeline/history` | At least one event or span |
| `comparison/matrix`, `comparison/before-after` | Every item has a value for every criterion; `before-after` has exactly two items |
| `comparison/quadrant` | `axes` names two `rating` criteria with `low` and `high` labels, and every item is rated on both |
| `metric/stat` | Exactly one series; `good` declared |
| `metric/bar`, `metric/line` | `axis` declared; `line` series have at least two points |
| `metric/meter` | Exactly one series; `target` and `good` declared |

## Precedence and Compatibility

Core validation runs first; the payload schema next (`EXTENSION_STRUCTURE`); semantics last.
Unknown fields, at any depth, are retained and reported once each as `VISUAL_UNKNOWN`
(warning): the document stays valid, interpretation is incomplete and edits are refused.
Adding an optional field or a form is a minor version (`1.x.0`); changing a field's meaning or
removing one is `2.0.0`. A document declaring a version this registry lacks is core
`UNKNOWN_EXTENSION` (warning, content retained); renderers refuse a major version they do not
read.

## Error Semantics

All codes above are errors except `VISUAL_UNKNOWN`. Paths are JSON Pointers from the document
root. Composition advice is not a diagnostic: `inspectVisual` returns it as `advice` with code
`VISUAL_DENSITY` for eight to fifteen nodes in a graph kind or more than eight participants, or
`VISUAL_SPLIT` for more than fifteen nodes, and it changes neither `valid` nor `complete`. A
profile may enforce advice as its own rule: HELIX's explanatory visuals hold at most fifteen
parts, so a HELIX producer splits a visual that draws `VISUAL_SPLIT`.

## Authority

`spec/extensions/visual/schema.json` is the authored definition of every shape.
`bun run generate` writes the manifest's embedded schema and `src/extensions/visual/generated.ts`
(the shape of each definition, from which the public types are named); `bun run check:source`
fails, without writing, when either differs from what the schema generates. Semantic rules stay
handwritten in `src/extensions/visual/index.ts`: form membership (`visualForms`, checked against
the schema's kinds and forms), kind blocks, the id namespace and references, field and
multiplicity agreement, cycles, form rules, dates, resource limits and advice. Authoring the
schema in `umf.metamodel` waits for UMF to publish its compiler; the released SDK carries the
metamodel's data, not the compiler.

## Released compatibility

The rules above describe 1.1.0. Version 1.0.0 shipped with package v0.1.0 and remains
registered with its exact released schema and semantic validator. Its fifteen-node
limit and early-year date behavior remain unchanged, and fields added in 1.1.0 are
retained as unknown content, never interpreted under 1.0.0. Existing fixture bytes,
native import defaults and retained-source receipts remain 1.0.0.

`visualPackage`, `VISUAL_VERSION`, `./schema`, `./manifest` and default creation
continue to designate 1.0.0. `latestVisualPackage`, `LATEST_VISUAL_VERSION`,
`./schema/1.1.0` and `./manifest/1.1.0` designate 1.1.0. Generated TypeScript shapes
include 1.1.0 additions; runtime validation follows the document's declared version.
`upgradeVisualDocument(document)` copies, changes the declaration to 1.1.0 and
validates the target; it may refuse and never mutates the input. `visualDateValue`
uses the corrected date calculation; declared 1.0.0 validation uses the frozen helper.
Native adapter subset limits and loss policies are independent of vocabulary size.

## API

| Function | Behavior |
|---|---|
| `visualRegistry()` | Registry with structural and semantic validation |
| `inspectVisual(document)` | `{valid, complete, diagnostics, advice}` |
| `readVisualDocument(text, format)` | Requires declared vocabulary 1.0.0, 1.1.0, 1.2.0, 1.3.0 or 1.4.0 and a payload (`VISUAL_PROFILE`); rejects invalid visuals (`VISUAL_DOCUMENT`) |
| `writeVisualDocument(document, format)` | Same checks, then serializes |
| `createVisualDocument(visual, id?, version?)` | Wraps a payload in a document (`id` defaults to `visual:<visual id>`); version defaults to frozen 1.0.0, with explicit 1.1.0/1.2.0/1.3.0/1.4.0 opt-in; rejects an invalid result |
| `getVisual(document)` | A copy of the payload |
| `editVisual(document, update)` | Requires complete interpretation before and after (`UNSAFE_EDIT`, `INVALID_EDIT`); input unchanged |
| `visualForms` | The kind-to-forms table |

## Examples

`fixtures/visual/inventory/` holds one document per visuals-inventory row with a target kind,
and `index.json` gives every inventory row a disposition: its documents, the row it embeds, or
`table`/`reference` when no visual is drawn. `fixtures/visual/forms/` adds one document for each
form the inventory does not exercise, so the two sets cover all 22 forms. Every document records
the source and digest it was read from, and every one is valid and complete.

### Additive visual 1.2.0 concepts

The model is an expansive shared authoring target. A target's current rendering
limitations MUST NOT constrain which common concepts the model can express.
Version 1.2.0 adds the concepts below; 1.0.0 and 1.1.0 keep their exact schemas
and interpretation. Renderer-specific syntax and theme mechanics remain outside
the payload.

| Element | Type | Meaning |
|---|---|---|
| `node.shape`, `participant.shape` | geometric enum | `rectangle`, `rounded-rectangle`, `ellipse`, `diamond`, `hexagon`, `cylinder`, `folded-corner`; independent of semantic role |
| `layout`, `group.layout` | discriminated object | `kind: flow` or `stack` with optional `direction: LR | TB`; or `kind: grid` with positive integer `columns`; each may declare `order: Id[]` |
| `node.ports` | `{id,label?,side?}[]` | Stable node-local connection anchors; side is `north`, `east`, `south` or `west`; no transport protocol is inferred |
| `edge.fromPort`, `edge.toPort` | port id | An anchor on the corresponding endpoint node |
| reference endpoint `portId` | port id | A generic anchor, mutually exclusive with `field` and `fieldId` |
| reference `identification` | enum | Explicit `identifying` or `non-identifying`; absence is unspecified |

Layout describes visual composition, not execution order or dependency meaning.
Root layout is admitted for flow, structure and state node-based views. An explicit `order` MUST
be an exact permutation of direct children; stack layer order MUST remain
consistent with the authored layers. Group nesting reuses `group.parent`.
State root order includes only top-level states, excluding `node.parent`
children, and MUST NOT change transition or execution semantics.
Ports MUST be unique within their owning node and references MUST resolve there.
An identification classification MUST NOT be inferred from key absence,
nullability, line style or a renderer's default convention.

Interpreters MUST realize each authored concept, report a located faithful
approximation, or refuse the affected mapping. A metadata appendix or retained
source alone MUST NOT qualify it as interpreted. Released interchange profiles
retain their declared model-version scope until their mappings are qualified.

The authored latest schema and generated shapes describe 1.4.0. Explicit
1.0.0, 1.1.0, 1.2.0 and 1.3.0 schema/manifest exports point to frozen snapshots;
1.4.0 has its own exports. Default authoring and unversioned schema/manifest
exports remain 1.0.0. `upgradeVisualDocument(document)` still selects 1.1.0;
`upgradeVisualDocument(document, '1.2.0')` explicitly selects the new model.
Downgrading through that operation MUST refuse.

### Additive visual 1.3.0 concepts

| Element | Type | Meaning |
|---|---|---|
| `node.icon`, `participant.icon` | stable symbolic name | A generic icon cue, independent of role and shape; not a native snippet, image URL or style declaration |
| `node.shape`, `participant.shape` | geometric enum addition | `parallelogram`, alongside the existing shapes |
| `edge.directed` | optional boolean | Explicit `false` is an undirected association; absence retains the existing directed interpretation |
| root `layout` | `kind: tree`, optional `direction: LR | TB | bilateral` and `order: Id[]` | Tree composition for `structure/tree`; order names the roots, while sibling order follows the authored node array |
| `sequence.notes[]` | `{id,text,participants,before?,after?}` | An independently identified note attached to one or more participants and positioned relative to an actual message |

A positioned note MUST declare exactly one of `before` and `after`, resolving to
a message. Its participant list MUST be nonempty, unique and resolve to actual
participants. A note is not a message and MUST NOT introduce a call. Note IDs
share the visual's identity namespace and may be used by walkthrough focus.
The existing `message.kind: note` remains available under its prior meaning.

Tree layout is not allowed on groups or on a different form. Parentage reuses
`node.parent`; the existing single-root and cycle rules continue to apply.
The model retains broad sequence group membership. A renderer unable to draw a
noncontiguous or nested group faithfully must approximate explicitly or refuse;
it MUST NOT narrow the shared model merely to suit its native interval model.
Version 1.2.0 keeps its exact unknown-content behavior for these new fields.
An undirected edge retains its endpoint identifiers for stable authoring, but
MUST NOT acquire a causal direction or native arrowhead from their `from`/`to`
field names. Parallel edges and self-edges retain separate identities.

### Additive visual 1.4.0 process role and routing intent

Draft, unreleased explicit 1.4.0 adds `process` to the shared `node.role` and
sequence `participant.role` enum: an authored diagram process or
activity, independent of geometric shape. It MUST NOT imply an operating-system
process, executable behavior, deployment placement or ownership. A rectangle or
label alone MUST NOT cause inference of this role. Source adapters may map an
explicit process stencil identity with a source-bound qualification.

The inspected 1.3.0 node-role enum lacks process identity; reuse the existing
role property with this bounded addition instead of encoding typed meaning only
in `detail`. Earlier profiles retain their prior known/unknown-field behavior.
Default authoring and no-argument upgrading remain unchanged; selecting 1.4.0 is
explicit. Interpreters MUST render a declared process convention, report a located
approximation, or refuse. Metadata retention alone is not interpretation.

Optional `edge.routing` is `{kind: 'curved' | 'straight'}`. It expresses authored
visual route intent for that edge, independently of relation kind, direction,
endpoint identity and attachment. Absence leaves routing unspecified; it MUST NOT
mean straight. Curved requests visibly curved, non-collinear geometry; straight requests
a direct line between endpoint attachments. Neither requests exact native control
points, source coordinates, bend count or original placement. This bounded enum
is grounded in the synthetic curved cross-boundary and straight network witnesses;
no orthogonal mode is asserted. Existing 1.3.0 handling remains frozen.

An interpreter MUST realize each declared route, report a located approximation,
or refuse. A backend-wide switch MUST NOT silently override another edge's
contradictory intent. Native path evidence MUST distinguish an actual curve from
a nominal curve command whose points are collinear. Exact native geometry remains
preserved separately; shared intent does not qualify pixel-identical reproduction.

### Draft 1.4.0 document stencil shapes

The shared `node.shape` and sequence `participant.shape` enums add `document` and
`multiple-documents`. These identify a single-document notation and a visible
stack-of-document-sheets notation respectively. They express authored visual
stencil intent, independently of `role`, business type, ownership and geometric
coordinates. `multiple-documents` MUST NOT imply an exact document count,
business cardinality or numeric minimum; decorative sheet count is an interpreter
choice, not source data. Neither shape causes inference of a document role.

The existing `folded-corner` remains its distinct geometric shape; interpreters
MUST NOT silently redefine it as either new notation. Map explicit native stencil
identity only with source-bound evidence. Unknown extensions and exact native
geometry remain preserved under the existing rules. Version 1.4.0 is unreleased;
this addition does not mutate frozen 1.3.0 or older interpretation/defaults.

## Non-Normative Notes

The renderer, layout engines, theme mapping and checks of the drawing (clipped text, crossings,
contrast) belong to `@ux-builder/visuals`; producers and evidence checks belong to documentor;
when to draw belongs to HELIX's catalog. No Python or Rust implementation of these semantics
exists; the standalone schema checks structure from any language.

## Validation Checklist

- [x] Every rule names its diagnostic code.
- [x] Unknown content behavior matches other UMF extensions.
- [x] Versioning rule stated.
