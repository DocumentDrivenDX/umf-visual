---
ddx:
  id: US-093
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-034
      kind: informed_by
---

# US-093: Describe a visual as data, independent of its renderer

**Feature**: FEAT-034

As a producer of documentation visuals (documentor, or an agent writing a HELIX artifact), I
want one checked declaration of what a picture says, so that a renderer can draw it in any
theme and a stale or dangling picture fails before it reaches a reader.

## Context

The visuals inventory of 2026-10-22 lists every visual in HELIX PR #95 and in a pilot
system's demo site with a target kind and form. Those rows (the pilot system's drawn from a
fictional stand-in, Beacon), plus one example per form for the kinds the inventory does not
exercise (`timeline`, `metric`, and the other forms), are the acceptance set.

## Acceptance Criteria

- **US-093-AC1:** Given each inventory visual and one example per form (22 forms over 7 kinds),
  when it is read as JSON or YAML, validated and written back, then it is valid and complete,
  the round trip is unchanged and metadata access returns copies.
- **US-093-AC2:** Given a valid visual, when it is corrupted with a form outside its kind, a
  block for another kind, a missing kind block, a duplicate id, a dangling or wrong-sort
  reference, steps on a kind without walkthroughs, an unnumbered step's `when: other` without a
  `tag` or a `tag` without a `when`, a parent cycle, a form rule violation, a
  comparison value that disagrees with its criterion, a metric point off its axis, an invalid
  or reversed date, more than 15 nodes, or a payload outside document scope, then validation
  fails with the declared code and read/write refuse it.
- **US-093-AC3:** Given a visual with an unknown field, when it is read, written and inspected,
  then the field survives, interpretation is incomplete (`VISUAL_UNKNOWN`) and conservative
  edits are refused.
- **US-093-AC4:** Given a complete visual, when it is edited, then the edit is atomic, the input
  is unchanged and an edit that makes the visual invalid is refused.
- **US-093-AC5:** Given a visual with more than seven nodes or eight participants, when it is
  inspected, then it stays valid and complete and the advice lists the density concern.

## Edge Cases

A `flow/zoned` visual with groups nested inside a tiered zone; a `structure/tree` whose only
root has no parent; a `timeline` on relative periods instead of dates; a comparison with a
`support` criterion (yes, no, partial) beside a rated one.

## Test Scenarios

`tests/visual/vocabulary.test.ts` covers each criterion by name over `fixtures/visual/`.

## Dependencies

FEAT-034; CONTRACT-083 governs the rules.

## Out of Scope

Rendering, layout, evidence checking and producing visuals from models. Completing this story
does not draw anything.
