---
ddx:
  id: FEAT-036
  type: feature-specification
  activity: frame
  authoring:
    home: repo
  links:
    - id: visual.vision
      kind: informed_by
    - id: FEAT-035
      kind: informed_by
---

# FEAT-036: Visual translation catalog

## Overview

The `umf.visuals` microsite lets producer and renderer maintainers explore the
actual shared visual language, then inspect example instances, native translations
and observed rendered output.
The capability follows the user's microsite request and the local library vision;
no market or hosted-service requirements are inferred.

## Ideal Future State

A maintainer first inspects schema elements, shared properties and kind/form
composition, then finds an example, compares target formats, and inspects the exact
source, omissions and renderer outcome behind each example. Unsupported forms
remain visible, so a successful screenshot cannot imply general format support.

## Problem Statement

Code fixtures and local test receipts make the library difficult to evaluate.
A static gallery alone obscures whether an output preserved meaning, required
reported loss, or failed in its native renderer.

## Functional Areas

| Area | Reader task | Responsibility |
| --- | --- | --- |
| Language reference | Understand shared concepts and composition | Schema-derived properties/$defs, actual kind/form declarations and source identity |
| Discovery | Find an example and candidate target | Search, filters, coverage and stable links |
| Comparison | Understand the translation | Original definition, native source, losses and identity |
| Evidence | Check observed output | Native SVG and version, or explicit unavailable/failure state |

## Requirements

- CAT-00: The primary reference must expose actual schema types/properties and
  kind/form declarations. Language definitions and example instances must be
  named and counted separately; examples must not define the language.
- CAT-01: The example catalog must include every existing visual fixture instance and
  every form represented by that corpus. Additional canaries must remain distinct
  from fixture coverage.
- CAT-02: Every definition must show a disposition for DOT, Mermaid and Lini,
  derived from the actual public interchange API under CONTRACT-085.
- CAT-03: The reader must inspect the original UMF definition, emitted native
  source when available, diagnostics and identity mappings.
- CAT-04: Native output must be rendered with the named native engine, with its
  version and failure state visible. Export and rendering outcomes must remain
  distinct.
- CAT-05: Unsupported forms must stay inspectable without invented native source
  or substitute drawings.
- CAT-06: Search and kind/form/target/status filtering must expose matching counts
  and an understandable empty state. Item/target deep links must restore selection.
- CAT-07: The site must support keyboard operation, readable status text, labelled
  controls and narrow screens without page-wide horizontal overflow.
- CAT-08: Catalog generation must be reproducible from repository-owned sources
  and current adapters. It must retain source identities and native qualifications.
- CAT-09: The catalog must retain ordinary native-profile results while exposing
  opt-in qualified profile variants and the chosen complete example projection.
  Intrinsic native meaning and readable profile annotations must be distinguished.
- CAT-10: The example-completion release must have one suitable strict target and
  faithful native preview for each of the 53 unchanged current examples, covering
  all 22 forms. A loaded image alone is not evidence of readable, complete output.
- CAT-11: Readers must compare DOT, Mermaid, Lini, PowerPoint, Google Slides and
  Miro outcomes without conflating semantic projection, planning, rendering and
  edited round-trip evidence. Unsupported and unattempted outcomes stay distinct.
- CAT-12: Renderer, native-versus-qualified profile intent and focused-versus-complete
  view must remain explicit through selection, keyboard use and shared links.
  An unavailable qualified profile must not silently select ordinary output.
- CAT-13: Current ordinary losses, qualified variants and historical evidence
  must remain distinguishable. The loss inventory must retain source identities,
  raw diagnostics and evidence-backed gap attribution across all six targets.
- CAT-14: Every preview must identify its actual renderer and exact input artifact
  or host capture, with immutable image identity. Stale or unrelated images must
  not qualify another export. Host images must contain approved synthetic content.
- CAT-15: The active full-format goal requires all 53 current examples and all
  22 forms in each DOT/Mermaid/Lini canonical full profile, with meaningful
  native-rendered output, zero semantic loss and complete edited readback.
  Visual approximations remain explicit; compatibility subsets keep their actual
  losses. CAT-10 records the earlier suitable-target milestone, not this gate.

Under CAT-15, native-rendered primitive compositions are qualified full-profile
output, not substitute images under CAT-05. A drawing from another renderer or
an opaque document dump still cannot qualify an unsupported pair.

## User Stories

- [US-095: Inspect a visual across native targets](../user-stories/US-095-visual-catalog.md).

## Edge Cases and Error Handling

A successful export with a failed native render shows both outcomes. An
unsupported target explains its refusal and keeps the original definition
available. Missing catalog or image assets show a recoverable error state.

## Constraints and Assumptions

The current corpus contains 50 fixture instances spanning 22 forms: 12 under
forms/ and 38 under inventory/. The language has seven kinds and the schema has
19 reusable definitions in frozen 1.0.0 and 20 in explicit latest 1.1.0;
those are distinct counts. The build
must enumerate and verify the corpus rather than silently retain a stale count.
The microsite brand is `umf.visuals`; the vocabulary remains `umf.visual`.
The catalog is a static library demonstration with no user-content upload or
service backend. Source lives in `microsite/`; build output lives in `dist-site/`.

## Dependencies

FEAT-035 and CONTRACT-086 supply bounded interchange. CONTRACT-083 supplies
visual meaning. Native engine receipts establish observed render acceptance.

## Out of Scope

Vocabulary/model generation, production telemetry, user-content execution and
support claims beyond observed subsets. New qualified forms are governed by
FEAT-035 and CONTRACT-087; the catalog consumes their actual results and evidence.
