---
ddx:
  id: US-094
  type: user-stories
  activity: frame
  authoring:
    home: repo
  links:
    - id: FEAT-035
      kind: informed_by
---

# US-094: Exchange a native diagram with explicit preservation limits

**Feature:** FEAT-035. **Feature requirements:** INT-01 through INT-07.
The local vision supplies the producer and renderer personas; no PRD FR-ID is invented.

## Story

**As a** producer integration maintainer,
**I want** to import a native diagram and export its supported visual meaning,
**So that** I can review identities and omissions before giving it to a renderer.

## Context

The visual vocabulary validates one picture but does not establish equivalence
with a native format. The consumer needs both a usable projection and recovery
of content that the projection cannot understand.

## Walkthrough

1. The maintainer supplies a graph, its format and the intended reader question.
2. The library returns the neutral document, original source and identity map.
3. The maintainer reviews omissions and selects strict or explicitly lossy export.
4. The library returns qualified native output, or a located refusal.
5. The maintainer requests the original source while the imported document is unchanged.

## Acceptance Criteria

- **US-094-AC1:** Given a diagram in each declared native subset, when the
  maintainer imports and exports it under CONTRACT-086, then its supported
  identities, labels and relationships survive the qualified cycle.
- **US-094-AC2:** Given unsupported native content, when import is refused or a
  partial projection is allowed, then the original string remains exactly recoverable.
- **US-094-AC3:** Given unsupported meaning in either direction, when strict or
  reported-loss policy is selected, then the result follows CONTRACT-086 without
  silent loss and identifies the affected locations.
- **US-094-AC4:** Given an edited imported document or a forged preservation
  baseline, when exact-source recovery is requested, then stale source is refused.
- **US-094-AC5:** Given restricted or colliding native identifiers, repeated
  edges and native cardinality markers, when they are mapped, then distinctions
  survive or a precise incompatibility is reported.
- **US-094-AC6:** Given a malformed or oversized diagram, when import is attempted,
  then it refuses without a truncated successful document and retains the source.
- **US-094-AC7:** Given built public package APIs, when the corpus runs in Bun
  and real Chromium, then portable results agree; independent native engines
  separately accept the supported emitted syntax.

## Edge Cases

A source-only style survives exact recovery while its neutral projection reports
unsupported meaning. Sixteen nodes fail the unchanged vocabulary bound. Native
identifier case and punctuation remain distinct through generated visual identities.

## Test Scenarios

| Scenario | Input/state | Action | Expected result |
| --- | --- | --- | --- |
| Graph | `digraph G { A -> B [label="uses"]; }` | Import/export DOT | Two distinct mapped nodes and one labelled directed edge |
| Identity | Nodes `A`, `a`, `a.b` | Import | Three distinct visual IDs with native identity mappings |
| Unknown | A style or directive outside a supported subset | Strict import | Located refusal plus exact source retention |
| Edit | Change imported node label, then overwrite receipt baseline | Recover source | Reparse comparison refuses stale native text |
| Limit | Sixteen explicit nodes | Import | No successful partial document |

## Dependencies

FEAT-035, CONTRACT-083 and CONTRACT-086; TP-001 owns test-layer allocation.

## Out of Scope

Rendering quality, arbitrary native source rewriting and broad native equivalence.
