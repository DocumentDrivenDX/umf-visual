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

**Profile:** `umf.visual` 1.0.0 (the visuals PRD's `umf.visual/1`). **Native representation:** UMF
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
vocabularies: {umf.visual: {version: "1.0.0"}}
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

A cycle through `node.parent` or `group.parent` is `VISUAL_CYCLE`. More than 15 nodes in
`flow`, `structure` or `state` is `VISUAL_SIZE`.

### Kind blocks

- **`sequence`**: `participants[]` (at least 2; node fields without `group`, `parent`, `layer`),
  in reading order; `messages[]` (at least 1) `{id, from, to, label, kind?, group?, status?,
  emphasis?, evidence?}` where `from`/`to` are participants, `kind` is `call`, `return`,
  `async` or `note`, and `group` names a phase, loop or alternative group.
- **`structure`**: `layers[]` `{id, label}`, top to bottom; `entities[]` `{node, fields[]}` with
  fields `{name, type?, keys?, nullable?}` (an entity may list none) and `keys` drawn from `pk`, `fk`, `uk`;
  `references[]` `{id, from: {node, field?}, to: {node, field?}, label?, fromCardinality?,
  toCardinality?}` with cardinalities `zero-or-one`, `exactly-one`, `zero-or-many`,
  `one-or-many`. A named field must exist in that node's entity. Field names are unique per
  entity and an entity is declared once per node (`VISUAL_ID`).
- **`state`**: `initial` (a state), `final[]` (states), `transitions[]` (at least 1) `{id, from,
  to, event, guard?, action?, path?, status?, emphasis?}`, `path` being `main`, `alternate` or
  `failure`.
- **`timeline`**: `scale` is `{kind: date}` or `{kind: period, periods[]}` (periods `{id, label}`,
  in order). `lanes[]` `{id, label}`; `events[]` `{id, label, at, lane?, detail?, status?,
  emphasis?}`; `spans[]` `{id, label, start, end, lane?, detail?, status?, emphasis?}`;
  `markers[]` `{id, label, at, kind}` with `kind` `today`, `deadline` or `marker`. On a date
  scale, `at`, `start` and `end` are ISO-8601 (`YYYY-MM`, `YYYY-MM-DD` or a date-time with
  offset) and must be real calendar values; on a period scale they are period ids. An invalid
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
`VISUAL_DENSITY` for more than seven nodes in a graph kind or more than eight participants, and
it changes neither `valid` nor `complete`.

## API

| Function | Behavior |
|---|---|
| `visualRegistry()` | Registry with structural and semantic validation |
| `inspectVisual(document)` | `{valid, complete, diagnostics, advice}` |
| `readVisualDocument(text, format)` | Requires vocabulary 1.0.0 and a payload (`VISUAL_PROFILE`); rejects invalid visuals (`VISUAL_DOCUMENT`) |
| `writeVisualDocument(document, format)` | Same checks, then serializes |
| `createVisualDocument(visual, id?)` | Wraps a payload in a document (`id` defaults to `visual:<visual id>`); rejects an invalid result |
| `getVisual(document)` | A copy of the payload |
| `editVisual(document, update)` | Requires complete interpretation before and after (`UNSAFE_EDIT`, `INVALID_EDIT`); input unchanged |
| `visualForms` | The kind-to-forms table |

## Examples

`fixtures/visual/inventory/` holds one document per visuals-inventory row with a target kind,
and `index.json` gives every inventory row a disposition: its documents, the row it embeds, or
`table`/`reference` when no visual is drawn. `fixtures/visual/forms/` adds one document for each
form the inventory does not exercise, so the two sets cover all 22 forms. Every document records
the source and digest it was read from, and every one is valid and complete.

## Non-Normative Notes

The renderer, layout engines, theme mapping and checks of the drawing (clipped text, crossings,
contrast) belong to `@ux-builder/visuals`; producers and evidence checks belong to documentor;
when to draw belongs to HELIX's catalog. No Python or Rust implementation of these semantics
exists; the standalone schema checks structure from any language.

## Validation Checklist

- [x] Every rule names its diagnostic code.
- [x] Unknown content behavior matches other UMF extensions.
- [x] Versioning rule stated.
