---
ddx:
  id: SD-095
  type: solution-design
  activity: design
  authoring:
    home: repo
  links:
    - id: FEAT-036
      kind: informed_by
    - id: visual.architecture
      kind: references
    - id: CONTRACT-085
      kind: references
---

# SD-095-visual-catalog: Reproducible native comparison

**Feature:** FEAT-036. Architecture governs the static publication boundary;
CONTRACT-085 governs exact data and selection interfaces.

## Scope

Present the complete visual corpus and its actual native projection/render results
through one repository-owned static catalog. This feature consumes existing
adapters and does not extend their syntax or the visual vocabulary.

## Requirements Mapping

| Requirements | Capability | Owner |
| --- | --- | --- |
| CAT-01, CAT-02, CAT-08 | Enumerate source definitions; derive target matrix and reproducible provenance | Build pipeline |
| CAT-03, CAT-05 | Compare source, emitted text, losses and identity; retain unsupported cases | Browser |
| CAT-04 | Actual native SVG, runtime version and failure result | Native build stage and browser |
| CAT-06, CAT-07 | Search/filter/deep-link discovery with keyboard/narrow-screen use | Browser |

## Solution Approaches

Select a generated static catalog with native rendering at build time. It keeps
observed outputs/version evidence together, permits reproducible hashes and
requires no privileged compiler in the browser. Source changes require a rebuild.

A browser-only live compiler would provide immediate authoring feedback but add
native runtime payloads and execution complexity without serving the requested
read-only catalog. A manually curated screenshot gallery would reduce tooling
but could hide omissions and drift from current adapter results. Neither is
selected for this scope.

## Domain Model

An original visual definition has one provenance identity and three target
results. Each target has an export-policy disposition and an independent optional
native rendering result. A successful source emission does not imply rendering
success, and canaries do not count as coverage of the fixture corpus.
CONTRACT-085 owns these structured relationships; the existing visual/core types
remain the authority for each original definition.

## System Decomposition

The build stage validates and hashes definitions, calls the public facade and
runs actual native engines on emitted source. It writes static data and isolated
SVG assets. The browser reads those products and provides discovery/comparison.
TD-095 owns concrete implementation wiring; STP-095 owns exercising tests.
The architecture's portable-library boundary keeps host APIs outside src/.

## Traceability

Corpus/data parity and reproducible hashes prove CAT-01/02/08. Native engine
receipts and explicit render failures prove CAT-04. Browser tests and reviewed
views prove CAT-03/05/06/07. All criteria are allocated in STP-095.

## Concern Alignment

Preservation-and-compatibility requires visible losses and qualified native
versions. Testing/verification requires actual facade/native/browser observations.
Modularity keeps native generation separate from the portable vocabulary and
static browser. No service telemetry or new framework/runtime slot is introduced.

## Schema Basis

CONTRACT-085 composes existing core/visual definitions with local build receipts;
its justification for catalog metadata applies here. This solution adds no new
UMF schema or competing diagram model.
