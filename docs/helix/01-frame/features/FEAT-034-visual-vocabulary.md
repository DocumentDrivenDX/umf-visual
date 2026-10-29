---
ddx:
  id: FEAT-034
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.cross-cutting-requirements
      kind: informed_by
    - id: FEAT-026
      kind: informed_by
---

# FEAT-034: Visual vocabulary (`umf.visual`)

**Feature ID:** FEAT-034. **Status:** Draft. **Priority:** Milestone M1 of the DocumentDrivenDX
visuals PRD (owner: David Mautz, 2026-10-22). **Owner:** UMF maintainers.
**Covered PRD Subsystem(s):** Extensions and Unknown Semantics; Programmatic Consumers.
**Covered PRD Requirements:** FR-4, FR-27, FR-41.
**Cross-Subsystem Rationale:** An independently versioned vocabulary (FR-4/27) whose consumers
are a renderer (`@ux-builder/visuals`), producers (HELIX documentor) and authoring agents
(FR-41: visualization and human explanation from selected metadata). FR-5/22 govern unknown content.

## Overview

Describe one picture as data: a system's parts and what moves between them, a call sequence, a
layered or nested structure, a lifecycle, a timeline, a comparison of options or a metric. The
document names a closed kind and form, the reader's question, roles and statuses, and an
optional walkthrough. It names no colors, fonts, sizes or coordinates. A renderer draws it in a
product's theme; a producer checks it against the source it was drawn from.

## Ideal Future State

Every DocumentDrivenDX visual (guide pages, sites, presentations, app screens) is produced as a
`umf.visual` document from a governed source and drawn by one renderer. Changing a theme
restyles every visual with no regeneration. A stale or dangling visual fails the build instead
of reaching a reader.

## Problem Statement

HELIX's documentor, HELIX's own site, ux-builder and the deck renderer each draw pictures their
own way: Mermaid strings, a hand-written SVG router, HTML plates, Eraser presentations and
hand-drawn files. They take colors from four places and drift from the code. There is no
neutral record of what a picture says that a renderer, a producer and a checker can share.

## Functional Areas

Vocabulary (kinds, forms, roles), identity and references, walkthroughs and evidence, the API.

## Requirements

### Functional Requirements by Area

#### Vocabulary

- VIS-01: Declare exactly one visual per document at document scope, with a stable id, a kind
  (`flow`, `sequence`, `structure`, `state`, `timeline`, `comparison`, `metric`) and a form that
  belongs to that kind (22 forms; CONTRACT-083).
- VIS-02: Declare the reader's question, and optionally a title, a takeaway, an audience, the
  source it was drawn from (path, view, digest) and omissions.
- VIS-03: Declare graph content (groups, nodes, edges) for `flow`, `structure` and `state`, and
  one kind block for `sequence`, `structure`, `state`, `timeline`, `comparison` and `metric`.
  A block for another kind is a contradiction.
- VIS-04: Carry meaning as roles and statuses (`node.role`, `status`, `edge.kind`, `emphasis`)
  from closed sets, never as colors, fonts, sizes or coordinates.

#### Identity and references

- VIS-05: Every identified item shares one id namespace per visual; ids are unique and every
  reference (edge ends, groups, parents, layers, messages, transitions, lanes, comparison
  values, metric points, step focus) resolves to an item of the right sort.
- VIS-06: Reject form contradictions a renderer would otherwise guess at: a zoned flow with an
  untiered zone, a stack without layers, a tree with several roots, a parent cycle, an
  incomplete comparison matrix, a quadrant without rated axes, a meter without a target,
  invalid or reversed dates, more than 15 nodes in a graph kind.

#### Walkthroughs and evidence

- VIS-07: `flow`, `sequence`, `state` and `timeline` visuals may carry ordered steps (title,
  caption, focused ids). Other kinds may not.
- VIS-08: Any node, participant or edge may cite evidence (`path`, `contains`). UMF retains it
  and does not check it; producers do.

#### API

- VIS-09: Read, write, inspect, copy and atomically edit a visual document; wrap a payload in a
  document; report composition advice (more than seven nodes, more than eight participants)
  separately from validity.

### Non-Functional Requirements

Browser-compatible TypeScript under ADR-002. Unknown fields survive round trips as incomplete
interpretation (`VISUAL_UNKNOWN`) and block conservative edits, as in every UMF extension.
Composition advice does not affect `valid` or `complete`. The standalone payload schema is plain
JSON Schema 2020-12 so non-TypeScript producers can check structure without UMF.

## User Stories

- [US-093: Describe a visual as data, independent of its renderer](../user-stories/US-093-visual-vocabulary.md).

## Edge Cases and Error Handling

A node belongs to at most one group because membership is a single field. Steps may focus any
identified item, including groups. A comparison value that disagrees with its criterion's
measure, or a rating outside the criterion's scale, is an error. A metric point whose `at` does
not match the axis (an ISO date on a time axis, a category id on a category axis) is an error.

## Success Metrics

Every inventory item with a target kind (visuals inventory, 2026-10-22) validates as a
`umf.visual` document, plus one example for each of the 22 forms; each declared contradiction
is rejected independently; documents round-trip JSON/YAML unchanged.

## Constraints and Assumptions

Version `1.0.0` stands for the PRD's `umf.visual/1`. Adding an optional field or a form is a
minor version; changing or removing a field's meaning is `2.0.0`. No Python binding in M1 (owner
decision, 2026-10-22): the renderer validates through TypeScript, and ADR-006 places future
shared semantics in Rust. Python producers may check structure with the standalone schema.

## Dependencies

Core extension registration (CONTRACT-001), document read/write and validation.

## Out of Scope

Rendering, layout, theming and the role-to-token mapping (`@ux-builder/visuals`); producing
visuals from models and checking evidence (documentor); deciding when a visual earns its place
(HELIX catalog); Mermaid emission; a Python or Rust implementation of the semantic checks.
