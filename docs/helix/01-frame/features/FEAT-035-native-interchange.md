---
ddx:
  id: FEAT-035
  type: feature-specification
  activity: frame
  authoring:
    home: repo
  links:
    - id: visual.vision
      kind: informed_by
    - id: FEAT-034
      kind: informed_by
---

# FEAT-035: Source-preserving visual interchange

## Overview

Give producer integrations and renderer implementers a qualified interchange path
between the visual vocabulary and bounded native diagram subsets. The capability
implements the local vision's explicit format mappings and preservation outcome.
The visual vocabulary is also the intended typed authoring target for semantic
producers, including schema-to-visual integrations; native adapters are consumers
of that shared intent rather than its complete definition.
There is no local PRD; this feature follows the vision and the user's adapter request.

## Ideal Future State

A consumer imports a native diagram, inspects the mapped visual and all omitted
meaning, and exports a supported projection or recovers the unchanged source.
The consumer sees identities and precise diagnostic locations throughout.

## Problem Statement

Separate exporters hide differences in native identity, relationship meaning and
presentation. A valid neutral payload alone does not establish native equivalence.

## Functional Areas

| Area | Consumer job | Responsibility |
| --- | --- | --- |
| Projection | Read or emit a supported native subset | Map representable visual meaning |
| Preservation | Recover original content | Retain source and qualify replay after edits |
| Qualification | Decide whether output is acceptable | Report every unsupported meaning and identify evidence |

## Requirements

- INT-01: The library must import and export bounded Graphviz DOT, Mermaid
  flowchart/entity-relationship, and Lini graph/entity subsets under CONTRACT-086.
- INT-02: Every import must retain the exact original string, including refused
  imports. Unknown native content must remain inspectable.
- INT-03: Each mapped native item must have an explicit identity map. Distinct
  native identities must not merge through normalization or shared display text.
- INT-04: Unsupported meaning must have a located report. Strict projection
  must refuse losses; explicit permission for reported loss may admit a subset.
- INT-05: Exact-source recovery must refuse stale source after unsupported edits.
- INT-06: The existing visual size, identity and cardinality limits must remain
  enforced. Adapters must refuse or report differences without weakening them.
- INT-07: Support claims must state format version, subset, direction and observed
  evidence. Native acceptance and semantic preservation are separate claims.

### Non-Functional Requirements

- INT-NFR1: Portable public APIs must use browser-compatible ESM and only public
  released core APIs. The acceptance corpus must execute in real Chromium.
- INT-NFR2: Native input must execute no authored code, read no paths and fetch
  no URLs. Explicit input and item limits must publish no partial success.
- INT-NFR3: Existing vocabulary, package and public-boundary checks must pass.

## User Stories

- [US-094: Exchange a native diagram with explicit preservation limits](../user-stories/US-094-native-interchange.md).

## Edge Cases and Error Handling

Graphs above the vocabulary's node bound must refuse projection without truncation.
An undirected edge must never silently acquire direction. Identifying relationships
and unbounded multiplicities must never be inferred from a visually similar marker.

## Constraints and Assumptions

The desired model encompasses justified common native concepts and properties
with typed meanings and explicit compatibility rules. The present work is the
first bounded mapping subset, not completion of that model. Loss reports identify
unrepresented meaning; follow-up analysis distinguishes a model gap, an
unimplemented mapping and a genuinely native-specific retained refinement.

The first profile targets `umf.visual` 1.0.0. It does not revise its 15-node cap,
restricted IDs, single group membership or four cardinality values. DOT `.gv` and
`.dot` are filename conventions for the same format. CONTRACT-086 owns exact scope.

## Dependencies

FEAT-034 and CONTRACT-083 supply the neutral visual. Released `@umf/core` supplies
the document envelope, safe copying and validation. Native engines are test oracles.

## Out of Scope

Arbitrary DOT/Mermaid/Lini syntax, all Mermaid families, pixel/layout equivalence,
a renderer, cross-format semantic equivalence beyond the declared subset,
authoritative model generation and vocabulary redesign.
