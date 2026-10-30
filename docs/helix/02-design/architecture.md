---
ddx:
  id: visual.architecture
  type: architecture
  activity: design
  authoring:
    home: repo
  links:
    - id: visual.vision
      kind: informed_by
    - id: CONTRACT-083
      kind: references
---

# Visual library architecture

## Scope

The extraction owns the visual package, schema/types/semantics and behavioral
corpus from #62. The user authorized independent repository ownership. Native
adapters and generated model authority are subsequent governed changes.

## Level 1: System Context

| Element | Type | Purpose | Protocol |
| --- | --- | --- | --- |
| HELIX/documentor | Producer | Selects question, form and source | UMF JSON/YAML |
| umf-visual | System library | Declares and validates visual meaning | TypeScript/ESM |
| UMF SDK | External library | Envelope, registry, serialization, generic validation | Public @umf/core API |
| ux-builder/Lini | Renderer consumers | Draw supported visual projections | Versioned consumer contracts |

## Level 2: Container Diagram

| Container | Technology | Responsibilities | Communication |
| --- | --- | --- | --- |
| Library package | TypeScript/browser ESM | Portable vocabulary API | Public exports |
| Development tooling | Bun/TypeScript/Playwright | Build, typecheck, browser and package tests | Local files and loopback server |

There is no hosted service or database. The library runs inside its consumer.

## Module Boundaries

**Source Applicability**: source; handwritten implementation imported from #62.

| Module | Responsibility / Owned Types | Public API | Allowed Dependencies | Forbidden Dependencies |
| --- | --- | --- | --- | --- |
| src/extensions/visual | Visual types, validation and edits | CONTRACT-083 API | Released @umf/core and local manifest | UMF internals, sibling checkout, renderer/Node APIs |
| src/index.ts | Package export boundary | Visual API only | Local visual module | Broad core re-exports |
| scripts | Build and verification | Package scripts | Bun, Node tooling, TypeScript API, Playwright | Import into portable source |

**Integration Owners**: src/extensions/visual owns core registration. No native
format integration is implemented. Future adapter modules own their source maps
and loss reports; renderers remain consumers.

**Construction Policy**: visualRegistry performs explicit registration; existing
read/write/edit APIs reuse the vocabulary's private registry as in #62.

**Boundary Check**: `bun run check:source`, run locally, by pre-commit and CI;
negative tests deny core subpaths and sibling source access. The check does not
prove all semantic encapsulation or dynamic-import safety.

## Deployment

| Component | Infrastructure | Instances | Scaling | Backup / Recovery |
| --- | --- | --- | --- | --- |
| Package | Consumer's browser/Bun/Node runtime | Consumer-owned | No service scaling | Git source and pinned release dependencies |

## Data Flow

Consumer source enters the public API; core validates the envelope and registered
payload structure; visual semantics check references and forms; read/write
preserve unknowns and edit refuses incomplete interpretation. A future export
adapter must report unsupported meaning before renderer execution.

## Quality Attributes

| Attribute | Target | Strategy | Verification |
| --- | --- | --- | --- |
| Portability | Original corpus passes against released SDK in Bun and Chromium | Browser ESM; no host APIs in source | Vocabulary suite and browser harness |
| Preservation | Unknown content survives | Core safe copies and explicit incomplete status | US-093-AC3 |
| Isolation | No private/sibling core import | Public release dependency | Boundary negative controls and packed consumer |
| Supply chain | Exact dependency and extraction identities | Lockfile, SDK/source hashes | Installation and provenance checks |

## Decisions and Tradeoffs

| Decision | Status | Rationale | Follow-up |
| --- | --- | --- | --- |
| Independent repository/package | User-authorized | Separate lifecycle from core and rendering | Consumer migrations |
| Use SDK 0.5.7 public release | Bootstrap choice | Avoid private source dependency | Expand version matrix through evidence |
| Retain #62 semantic baseline | Extraction scope, then amended | Make movement reviewable | #62 review applied 2026-10-30: early-year dates, size as advice, exact multiplicities and field ids |
| Schema as the single authored definition | Adopted | One source for the manifest schema and TypeScript shapes, checked without writing | Move the definition into `umf.metamodel` once UMF publishes its compiler |
| UMF-authored model and native adapters | Planned | Single authority and preservation discipline | Frame/design before implementation |
