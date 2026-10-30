---
ddx:
  id: visual.extraction-plan
  type: implementation-plan
  activity: build
  authoring:
    home: repo
  links:
    - id: visual.architecture
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Extraction and continuation plan

## Scope

The user authorized bootstrapping a sibling repository and moving umf.visual
from UMF #62, including a HELIX stack. Governing local artifacts are the vision,
architecture and TP-001. Imported CONTRACT-083 and US-093 own the copied semantics.

## Shared Constraints

Retain source attribution, vocabulary identity and imported artifact IDs. Depend
only on released public core APIs. Keep unrelated local UMF work untouched.
Extraction does not claim that proposed adapters or model generation exist.

## Implementation Slices

| Slice | Story / Area | Governing Artifacts | Depends On | Validation Gate | Notes |
| --- | --- | --- | --- | --- | --- |
| E1 | Extraction ownership | User instruction; source #62 | None | Source pin and license inventory | Preserve semantic source and corpus |
| E2 | Package boundaries | visual.architecture | E1 | check:source and negative controls | Public core dependency; pre-commit/CI |
| E3 | Distribution | TP-001 | E2 | Typecheck, build, tests, packed consumer | No deep imports or sibling alias |
| E4 | Browser portability | TP-001 | E3 | Real Chromium corpus round trips/edit | Record exact runtime/version |
| E5 | Repository and stack | visual.vision | E4 | Commit/push, remote files, HELIX validation | Independent repository; no package publication |

## Execution Contract

Implementation authorization is the user's repository-bootstrap request. Token
usage is not metered as a project budget; no numeric spending ceiling was given.
Execute the extraction slices, record actual checks and keep semantic expansion
separate. No tracker was selected.

## Continuation Evidence

See extraction-evidence.md for completed extraction gates. FEAT-035, US-094,
CONTRACT-086, TD-094 and TP-001 govern the authorized native interchange increment.
Native qualification receipts must identify new executed source and runtime
versions; extraction receipts do not establish adapter support. Generated UMF
model authority and generic constraint coverage remain separate follow-ups. The #62 review changes (early-year dates, size as
advice, exact multiplicities, field ids, generated shapes) are applied. Adopt code-shape ratchets before growing the inherited module.

## Optional Tracking

No external tracker mutation is requested. This plan owns the bootstrap sequence.

## Validation Plan

- Reuse US-093 coverage and verify the changed package/browser boundaries.
- Record installed-runtime evidence separately from source-level tests.
- Validate authored HELIX artifacts using the installed catalog.
- Review private imports, package contents, source pins and remaining claims.

## Risks and Rollbacks

| Risk | Impact | Response | Rollback |
| --- | --- | --- | --- |
| Upstream SDK dependency changes | Broken consumers | Pinned release and lockfile | Select previously verified release |
| Two visual authorities | Divergent definitions | New repo owns extraction; link from #62 | Do not merge duplicate implementation |
| Existing semantic limits hidden by movement | False interchange claim | Preserve known gaps and scoped evidence | No adapter claim until qualification |

## Exit Criteria

The independent repository contains the extracted implementation/corpus,
public SDK dependency, build/types, CI, scoped HELIX stack and provenance.
Local test, package and browser gates pass; commit/remote are verified.
No package release, upstream PR closure or vocabulary redesign is implied.

## Diagnostic Evidence Sequencing (when applicable)

Local receipts precede publication of extraction results. Hosted CI remains
separate evidence; do not label local passing checks as hosted CI success.

## Native Interchange Slices

| Slice | Area | Governing artifacts | Depends on | Validation gate | Ownership |
| --- | --- | --- | --- | --- | --- |
| I1 | Boundary/types/plan | Architecture, CONTRACT-086, TD-094 | Existing extraction | Shared types and check:source | Planning/integration |
| I2 | Facade and retention | US-094, CONTRACT-086 | I1 | Strict/allow, safe copying, exact pair serialization, replay forgery and limits | Integration |
| I3 | DOT mapping | CONTRACT-086, TP-001 | I1 | Expected graph semantics and Graphviz syntax | src/interchange/dot + own tests |
| I4 | Mermaid mapping | CONTRACT-086, TP-001 | I1 | Flowchart/ER semantics, losses and native parsing | src/interchange/mermaid + own tests |
| I5 | Lini mapping | CONTRACT-086, TP-001 | I1 | Graph/entity semantics, native WASM acceptance | src/interchange/lini + own tests |
| I6 | Public integration/review | TD-094, TP-001 | I2–I5 | Source/type/Bun/build/package/Chromium gates and native receipts | Integration/review |

The user's implementation request authorizes this increment and parallel adapter
work. No numeric token/spending ceiling was supplied; runtime metering is unknown.
Keep native engines outside portable src and preserve imported authority files.
The staging checkout is an execution location, not a new package/source authority.

### Interchange exit criteria

Both directions exist for every declared subset; exact source remains inspectable
on refusals; all losses are located; strict mode is the default; identity maps do
not collapse native distinctions; stale/forged baseline replay refuses; limits
publish no truncated success; public package/browser gates pass; native evidence
names versions and limitations. Record remaining unsupported syntax explicitly.


## Visual Catalog Increment

The user's additive microsite request authorizes repository-owned source and
native-generated static assets under FEAT-036, US-095, CONTRACT-085 and STP-095.
The site brand is umf.visuals; vocabulary semantics remain unchanged.

| Slice | Area | Depends on | Validation | Owner boundary |
| --- | --- | --- | --- | --- |
| C1 | Shared catalog contract and corpus inventory | Current interchange facade | Contract review; all fixture/form identities | Planning/data |
| C2 | Deterministic data and native SVG generation | C1 | Public API result parity, native versions, hashes and canaries | Catalog build scripts and generated assets |
| C3 | Responsive discovery/comparison site | C1 | Search/filter/deep-link/source/render states | microsite/ source |
| C4 | Integration and usability review | C2/C3 | STP-095 data/native/Chromium gates; desktop/mobile inspection | Integration/review |
| C5 | Hosting handoff | C4 | Static package review and actual hosting result | Parent Sites workflow |

Repository source lives in microsite/; dist-site/ is its generated static output.
Catalog data is built from actual adapter calls and native engines, not curated
success labels. A failed or unsupported case must remain visible. Record actual
command aliases and receipts during integration; planned commands do not establish
that generation or deployment succeeded. No new adapter/form support or model
generation is included in this increment.

### Governed document verification — 2026-10-29

Installed HELIX 0.20.0 instance validation passes with no findings for FEAT-035/036,
US-094/095, CONTRACT-086/085, SD-094/095, TD-094/095, STP-095 and the updated local
architecture, project test plan and implementation plan. The source-surface
leakage check also passes the authored requirements/design scope. Validation used
the installed catalog and documentor virtual-environment Python; it establishes
document structure and declared coverage integrity, not runtime acceptance.
Inherited upstream identities/links in the extracted authorities remain unchanged.


## Shared Typed Visual Model Roadmap

The owner clarifies that umf.visual is both a typed authoring target for semantic
producers and an interchange model encompassing common native concepts and
properties, analogous to the role of umf.core. Current visual 1.0.0 and its bounded
adapters are the first subset. The following gaps are observed in current types
and mapping code; this roadmap specifies preparation, not delivered semantics.

| Concept | Current evidence | Follow-up boundary |
| --- | --- | --- |
| Node geometry and shape | VisualNode carries label/role/status; no shape field. DOT shape attributes and richer Mermaid/Lini shapes are unrepresented. | Define shared shape meanings and typed native refinements before adding fields/mappings. |
| Style and visual treatment | No typed style object; adapters report native style/class attributes. Semantic role/status are present and must not be reinterpreted as colors. | Separate semantic intent from authorable presentation properties; qualify common style semantics and renderer defaults. |
| Layout intent | No direction, alignment, spacing, positioning or layout-constraint types; native layout blocks/directions are reported. | Identify reusable layout constraints and distinguish hints from required geometry; retain native engine refinements. |
| Grouping | VisualGroup and node.group already exist, with one membership and parent hierarchy. Current bounded native adapters do not map native clusters/subgraphs/groups. | Begin with mapping design for existing meanings; evolve the model only where native counterexamples expose a real gap. |
| Ports and anchors | Entity references support field endpoints, while VisualEdge has node endpoints only; generic named ports/compass anchors are absent. | Define typed attachment identity, ownership and routing intent without conflating fields with arbitrary ports. |
| Relationship direction and decoration | Flow edges use from/to; entity references do not declare arrow direction. Undirected/bidirectional edges and native arrowhead/tail styles lack general typed representation. | Specify direction, association and visual decoration separately; qualify import/export choices. |
| Entity refinements | Four cardinality values, optional display type strings, nullability and PK/FK/UK keys exist. Rich ranges, relationship identification and field comments/descriptions lack shared slots. | Define common typed constraints/refinements and preserve differing native enforcement/notation; avoid name-based equivalence. |
| External identity/provenance | Visual IDs, source/evidence and operation identity maps exist. Arbitrary native aliases/tooltips are retained rather than treated as shared IDs. | Decide persistent typed provenance/alias needs from producer and native evidence, preserving distinct identity scopes. |

Sequence the work as: inventory common/native meanings with counterexamples;
classify existing diagnostics as model or mapping gaps; author the shared model
and version/migration contracts; add typed schemas/types/validation; qualify
metadata-to-visual producers; then extend each tool profile with independent
native and browser evidence. Preserve current 1.0.0 interpretation and imported
artifact identity. Decide additive versus breaking versions from actual semantic
changes rather than assume an unreviewed version number.

The producer pipeline is semantic source (for example UMF schemas) → authored
visual model → selected adapter/render profile. A producer owns metadata selection,
reader question and intentional omissions. The model owns typed visual meaning.
Adapters own native mappings and explicit loss. Renderers own observed layout and
output. Retained native source preserves out-of-model material but is not a
substitute for modeling a justified common concept.


### Language-reference correction

The owner distinguishes a language catalog from a project-specific example
gallery. CAT-00 and US-095-AC8 require the primary view to expose exact schema
properties/$defs and the actual seven-kind/22-form declarations, with source
identity. Fifty fixtures (12 forms/ plus 38 inventory/) and three canaries remain
secondary example instances. CONTRACT-085's language record and STP-095 allocate
this correction. The source inventory records observed model/domain coupling;
the future common-model/view-profile/application-annotation separation remains
governed design work and does not alter current 1.0.0 semantics.


### Interchange contract identity correction — 2026-10-29

Integration found independent concurrent work in the real checkout declaring
CONTRACT-084 in contracts/CONTRACT-084-miro-network.md. This increment's new
native-interchange contract was therefore renamed CONTRACT-086, with its local
references updated, preserving the unrelated contract and all imported authority.
CONTRACT-085 remains the catalog contract. A read-only scan found no collision
between this increment's other newly introduced artifact IDs and the real
checkout's current documents. This correction changes identity/traceability,
not the native interchange behavior.


## Existing-field Loss-reduction Wave

The user asks to work through examples and eliminate losses. The first bounded
increment maps existing typed meaning before redesigning the model: Mermaid
frontmatter title, DOT node.detail/tooltip and Lini node.detail/card hint. Native
profiles advance additively to Mermaid 1.1.0, DOT 0.2.0 and Lini 0.2.0; visual
1.0.0 and imported CONTRACT-083 semantics remain unchanged.

1. Pin a current path-level diagnostic census over the real examples.
2. Implement each existing-field mapping with strict policy and malformed/empty/
   unknown-content regressions; preserve native identity and remaining losses.
3. Verify actual Mermaid titles, Graphviz tooltips and Lini hint text through
   independent native engines, including escaping and default/override semantics.
4. Rebuild catalog JSON/SVGs, compare loss counts and review representative
   examples. Record actual reductions and residual diagnostics, not blanket
   lossless support. Refresh public/package/browser checks after integration.

Descriptive detail in a native tooltip is a qualified text transport and does
not imply identical caption placement. Lini field hints remain unmapped because
there is no current field-detail concept. Broader common-model/profile evolution
continues as separately governed work identified by the source audit.
