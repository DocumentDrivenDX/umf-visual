---
ddx:
  id: US-095
  type: user-stories
  activity: frame
  authoring:
    home: repo
  links:
    - id: FEAT-036
      kind: informed_by
---

# US-095: Inspect a visual across native targets

**Feature:** FEAT-036. **Feature requirements:** CAT-00 through CAT-14.
The local vision names the maintainer persona; no local PRD FR-ID is invented.

## Story

**As a** renderer integration maintainer,
**I want** to inspect one visual definition across candidate native formats,
**So that** I can distinguish reusable meaning, reported loss and observed output.

## Context

The visual corpus spans more forms than the native adapters support. Readers
need to see those limits alongside examples, rather than infer capabilities
from a small selection of successful renderings.

## Walkthrough

1. The maintainer inspects the shared language reference, then filters example
   instances to a visual form or target.
2. They select a definition and read the reader question and target disposition.
3. They compare the original definition with native source and diagnostics.
4. They inspect the native rendering or its explicit failure/unavailable state.
5. They share a link that restores the definition and selected target.

## Acceptance Criteria

- **US-095-AC1:** Given the repository fixture corpus, when the catalog is built,
  then every definition appears once with all three target dispositions and
  optional canaries remain distinguishable from corpus coverage.
- **US-095-AC2:** Given a target translation, when the reader opens it, then its
  support status follows CONTRACT-085 and the original definition, diagnostics
  and available native source are inspectable.
- **US-095-AC3:** Given successful, failed or unavailable native rendering, when
  its target is selected, then the site shows the observed outcome and version
  without promoting export success into a render-success claim.
- **US-095-AC4:** Given search and filters, when the reader changes or clears
  them, then matching items/counts update and an empty result explains recovery.
- **US-095-AC5:** Given an item/target deep link, when the reader opens or reloads
  it, then selection is restored and invalid selections recover safely.
- **US-095-AC6:** Given keyboard input and a narrow viewport, when the reader
  discovers and compares examples, then controls remain operable and visible
  without page-wide horizontal overflow.
- **US-095-AC7:** Given unchanged sources and pinned engines, when generation is
  repeated, then catalog and SVG identities agree; unsupported forms acquire
  neither fabricated output nor a successful rendering marker.

- **US-095-AC8:** Given the current schema and kind/form declarations, when the
  reader opens the primary language reference, then shared elements/properties
  and composition declarations are sourced from those authorities, with counts
  and source identities distinct from the secondary example gallery.
- **US-095-AC9:** Given an explicit renderer/profile/view selection, when the
  reader switches renderer or reloads a shared link, then their selection intent
  remains visible; an unavailable qualified profile shows its reason and an
  explicit alternative instead of silently substituting ordinary output.
- **US-095-AC10:** Given an example across the six target families, when the
  reader compares results, then planning, semantic loss, actual rendering and
  edited-cycle evidence remain separately inspectable under CONTRACT-085.
- **US-095-AC11:** Given current and historical loss evidence, when the reader
  inspects improvement, then unchanged-source comparisons preserve actual ordinary
  losses and distinguish mapping gains from annotations or changed report grouping.
- **US-095-AC12:** Given a displayed host/native preview, when its source or
  artifact/capture differs from its receipt, then it cannot be shown as verified
  output for that result; inaccessible or stale evidence has an explicit state.

## Edge Cases

A source can exist while its native engine reports failure. A long diagram may
need its own scroll region without widening the page. An unsupported sequence
or metric remains a first-class catalog entry with its original UMF source.

## Test Scenarios

| Scenario | State/action | Expected outcome |
| --- | --- | --- |
| Full corpus | Open unfiltered catalog | All current fixture definitions; canaries identified separately |
| Unsupported form | Select a timeline or metric | Three real adapter refusals; original definition available |
| Lossy target | Select an entity relationship | Loss reports visible beside source and native render |
| Empty search | Search an impossible title | Zero matches and clear-filter recovery |
| Shared selection | Reload an item/target link | Same definition and target restored |

## Dependencies

FEAT-036, CONTRACT-085, CONTRACT-086 and STP-095. The static site consumes built
data rather than importing native engines into the portable library.

## Out of Scope

Editing definitions, uploading arbitrary source, adding native support and
claiming rendered layout equivalence across engines.
