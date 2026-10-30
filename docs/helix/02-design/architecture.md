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
corpus from #62. The user authorized independent repository ownership. Native interchange is governed by FEAT-035 and CONTRACT-086. Generated model
authority remains a subsequent governed change. The desired model is a typed
authoring target for common native visual concepts as well as an interchange
representation; the current schema and adapters are an initial bounded subset.

## Level 1: System Context

| Element | Type | Purpose | Protocol |
| --- | --- | --- | --- |
| HELIX/documentor and semantic tools | Producer | Project UMF schemas/metadata into authored visual intent | UMF JSON/YAML |
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
| src/adapters/miro | Network projection, native preservation, atomic reconciliation and injected Web SDK I/O | CONTRACT-084; ./miro | Public core/visual APIs and local helpers | Host APIs, global SDK, vocabulary dependencies on adapters |
| src/interchange | Portable native parsing, mapping, source companions and export | CONTRACT-086 | Local visual API, public @umf/core, local shared helpers | Native engines, renderer APIs, host APIs, sibling source |
| src/index.ts | Package export boundary | Visual and interchange APIs | Local visual and interchange modules | Broad core re-exports |
| scripts | Build, catalog generation and verification | Package scripts; CONTRACT-085 data | Bun, Node tooling, TypeScript API, Playwright, native engines | Import into portable source |
| microsite/ | Static catalog discovery and comparison | CONTRACT-085 consumer | Generated JSON and relative native SVG assets | Native runtimes, server secrets, portable core internals |

**Integration Owners**: src/extensions/visual owns core registration. The
src/interchange facade owns native adapter selection, policy, safe admission and
source replay. Each format directory owns its parser, mappings and serializer.
Native engines run only in scripts/tests; renderers remain consumers.

The Miro adapter owns network correspondence, receipts and native extension
`umf.visual.miro` 1.0.0. Its example app injects Web SDK I/O and owns board-scoped
checkpoints/clipboard interaction. It does not alter common visual 1.0.0.

**Construction Policy**: visualRegistry performs explicit registration; existing
read/write/edit APIs reuse the vocabulary's private registry as in #62. The
interchange facade constructs a fixed adapter table from local modules; native
source cannot register or execute code.

**Boundary Check**: `bun run check:source`, run locally, by pre-commit and CI;
negative tests deny core subpaths and sibling source access. The check does not
prove all semantic encapsulation or dynamic-import safety.

## Deployment

| Component | Infrastructure | Instances | Scaling | Backup / Recovery |
| --- | --- | --- | --- | --- |
| Package | Consumer's browser/Bun/Node runtime | Consumer-owned | No service scaling | Git source and pinned release dependencies |

## Data Flow

A semantic producer selects schema or other metadata, constructs a typed visual
definition and records its reader question, identity and provenance. The visual
model is the shared authoring target; adapters translate that intent to native
tools under explicit support profiles. These producer projections are separate
from the native adapters and are not established by adapter acceptance alone.

Consumer source enters the public API; core validates the envelope and registered
payload structure; visual semantics check references and forms; read/write
preserve unknowns and edit refuses incomplete interpretation. An interchange
adapter must report unsupported meaning before renderer execution. Original native
text and identity maps live in a companion; persisting only the visual document
does not retain that native text. Exact replay reparses the retained source and
compares its derived document with the current input.

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
| Retain #62 semantic baseline | Extraction scope | Make movement reviewable | Date bug and interchange contract revisions |
| Bounded native adapters | CONTRACT-086 | Explicit native scope and preservation | US-094 and native/browser evidence |
| UMF-authored model | Planned | Single authority | Separate model-generation change |


## Catalog Publication Boundary

FEAT-036 adds the umf.visuals static demonstration. Build scripts enumerate all
visual fixtures, call the public interchange facade under both policies, and
render emitted source using actual native engines. CONTRACT-085 data and SVGs
feed the repository-owned microsite; dist-site/ is the publication artifact.
Native and browser engine dependencies do not enter portable src/.

The site shows original definitions, native source, diagnostics, identities and
observed native SVGs. Unsupported forms and render failures remain visible.
Support status is derived from export policy; render acceptance has its own
engine/version result. The static browser requires no native compiler or backend.
STP-095 verifies data fidelity, keyboard/discovery/deep-link behavior, narrow-screen
layout and native-source safety. Hosted publication has separate evidence.


## Typed Model Evolution

The intended visual model encompasses common concepts and properties across
native tools, while qualifying differences rather than equating similarly named
fields. A shared typed concept must express its meaning and constraints directly;
a bag of native attributes or a lowest-common-denominator projection does not
satisfy that direction. Native-only or not-yet-understood content remains retained
with provenance and explicit interpretation limits.

Three boundaries stay separate: the visual model's semantic version, each
producer's metadata-to-visual projection, and each native tool's import/export/
render support profile. A tool can lack a mapping for an existing model concept;
a model can lack a common concept that warrants a future typed addition. Neither
case proves that the concept belongs permanently only to its native source.
The implementation plan records concrete current gaps and evidence needed before
model changes; no completed common-model or producer-generator claim is implied.


## Common Model, View Profiles and Application Annotations

The [source inventory](../00-discover/current-state-inventory-visual-language.md)
finds that current 1.0.0 mixes reusable elements with architectural-communication
choices: required question, built/placeholder/decided statuses, own/platform/
external roles and a hard 15-node validity cap. Its seven mutually exclusive
root kinds specialize composition; groups, participants and timeline lanes do
not form one uniform generic scene model. Fifty fixtures and three canaries are
example instances, not 53 definitions of a visual language.

For a future governed revision, separate a common typed authoring model (identity,
visual objects, relationships, grouping, attachment, geometry/style/layout intent)
from view/composition profiles (flow, lanes, sequence, entities and others) and
application annotations (reader question, audience, project roles/status/evidence
and editorial density policy). This is a design direction requiring native and
producer counterexamples, not a silent rewrite of existing fields. Shared
concepts may be reused or composed without assuming all tool-specific meanings
are interchangeable. Native refinements retain their own identity and provenance.

Version 1.0.0 keeps its present contracts and validation. A future model/profile
contract must specify compatibility, typed extension ownership and migration of
existing documents before changing those rules. The microsite's primary language
reference derives schema properties/$defs and actual visualForms declarations;
its secondary example gallery demonstrates current mappings and their limits.
