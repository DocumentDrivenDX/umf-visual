---
ddx:
  id: SD-094
  type: solution-design
  activity: design
  authoring:
    home: repo
  links:
    - id: FEAT-035
      kind: informed_by
    - id: visual.architecture
      kind: references
    - id: CONTRACT-086
      kind: references
---

# SD-094-native-interchange: Preserved source with bounded projection

**Feature:** FEAT-035. Architecture governs portable module boundaries;
CONTRACT-086 owns exact APIs, companions, mappings and loss policy.

## Scope

Exchange supported native graph/entity meanings through the existing visual
vocabulary while retaining the original native source and explicit omissions.
No visual schema redesign or arbitrary native source rewriting is included.

## Requirements Mapping

| Requirements | Capability | Owner |
| --- | --- | --- |
| INT-01, INT-03, INT-06 | Format-specific parsing/emission and explicit identity/cardinality mapping | Native adapters |
| INT-02, INT-05 | Durable source companion and guarded exact recovery | Facade |
| INT-04 | Located unsupported meaning and centralized strict/reported-loss policy | Adapters and facade |
| INT-07, INT-NFR1/2/3 | Versioned evidence, portable safety and regression gates | Build/test tooling |

## Solution Approaches

Select a portable facade over bounded format adapters with retained native source.
It gives consumers valid neutral projections and keeps unsupported native content
available. Conservative replay guards refuse edits they cannot represent safely.

Embedding each full native engine inside the library would widen browser/runtime
dependencies without establishing visual semantic equivalence. Replacing the
visual model with one broader union of native meanings would change the existing
schema authority. Neither is selected for this increment.

## Domain Model

A native source has one interpretation context, a candidate visual, diagnostics
and identity maps. The facade admits the visual and returns its source companion.
Exact recovery reparses that companion and compares the derived/current document,
rather than trusting a mutable baseline alone. Native formatting recovery and
cross-format semantic projection remain different operations under CONTRACT-086.

## System Decomposition

The facade owns safe admission, policy, source limits and replay. Each native
adapter owns syntax scanning, supported mappings and canonical emission. The
existing visual/core APIs own document validity. Independent native engines
verify emitted syntax outside portable source. TD-094 applies this decomposition;
TP-001 supplies the verification strategy.

## Traceability

Expected semantic/identity assertions and native counterexamples prove mapping
requirements. Companion serialization, policy and forged-baseline tests prove
preservation/replay. Public package and actual Chromium checks prove portability.
The native evidence names its engine versions, directions and subsets.

## Concern Alignment

Preservation-and-compatibility governs opaque retention and loss reports. Testing
and verification require exercising semantic and independent-native checks.
Modularity keeps host/native engines outside the TypeScript library. Existing
visual size/identity/cardinality limits stay authoritative.

## Schema Basis

CONTRACT-086 records reuse of visual 1.0.0 and released public core types. Operation
results/companions address a local integration need without adding a core model.
