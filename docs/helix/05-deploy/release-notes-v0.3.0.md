---
ddx:
  id: visual.release.v0.3.0
  type: release-notes
  activity: deploy
  authoring:
    home: repo
  links:
    - id: FEAT-035
      kind: references
    - id: FEAT-036
      kind: references
    - id: CONTRACT-085
      kind: references
    - id: CONTRACT-086
      kind: references
    - id: CONTRACT-087
      kind: references
    - id: CONTRACT-088
      kind: references
    - id: visual.example-completion-plan
      kind: references
    - id: visual.deploy.v0.3.0
      kind: references
---

# umf-visual v0.3.0 — candidate

## Release Scope

Candidate notes prepared 2026-10-31. **v0.3.0 is not published by this record.**
The final commit, release date, Linux CI, archives/checksums and served artifact
verification remain pending under the [publication checklist](deployment-checklist-v0.3.0.md).

The local fifteen host preview/cycle gate, preview provenance and all-assets
visual checks pass. Clean Linux CI, archive digests and public artifact
verification remain required before publication.

The candidate combines the bounded editable-host APIs already on main with
native title mapping, additional opt-in profiles and six-destination catalog
inspection. Distribution remains GitHub archives and static Pages; package
privacy prevents accidental npm publication. No all-format losslessness or
whole-board/presentation support is claimed.

## Audience and Channels

Library consumers receive browser-compatible ESM/declarations and explicit
PowerPoint, Google Slides, Miro editable and reconciliation entrypoints.
Producer/renderer maintainers use the catalog to compare native output,
qualified profiles, previews and loss/readback evidence. Release archives and
checksums identify the eventual cut independently of later Pages updates.

## Highlights

- Native Lini titles remove 23 ordinary-profile loss diagnostics on unchanged
  sources. Other current losses remain visible.
- Explicit Lini flow and Mermaid sequence annotation profiles recover registered
  additional meaning through editable native carriers with independent readback.
- The catalog separates renderer, profile and view selection, and joins actual
  host images and bounded edit-cycle evidence by source/artifact/capture hashes.

## Changes and Fixes

### Interchange and profiles

| Profile | Mapping version | Candidate behavior |
| --- | --- | --- |
| `umf.visual.dot/1` | 0.3.0 | Existing ordinary DOT subset; native port/style probes qualify boundaries without inventing role/status mappings |
| `umf.visual.mermaid/1` | 1.2.0 | Existing flow/ER/sequence subset; independent ER probes preserve explicit identification/field-reference limits |
| `umf.visual.lini/1` | 0.3.0 | Native outer-group title caption, cards/fields/links; corrected titled scope/endpoint identities and signed-number lexing |
| `umf.visual.dot.annotated/1` | 0.1.0 | Existing bounded flow, structural/entity, state and sequence views |
| `umf.visual.lini.annotated/1` | 0.2.0 | Existing chart/table/grid families plus directed flow networks; pipeline geometry remains reported loss |
| `umf.visual.mermaid.annotated/1` | 0.1.0 | Sequence lifelines with readable typed notes and exact native event locators; ladder geometry remains reported loss |

Annotation profiles require the canonical frozen visual 1.0.0 declaration.
They preserve intrinsic diagram meaning through native constructs and registered
additional fields through visible typed carriers. A hidden source companion
does not clear a semantic loss. Unknown/native content outside a qualified
subset still refuses or remains explicitly reported.

Annotated reported-loss receipts now survive compound JSON/YAML persistence.
Strict replay retains the source and refuses remaining losses; reported-loss
replay may emit unchanged bytes after independent source/baseline/identity
checks. Changed documents and forged baselines or identity maps refuse.

### Editable hosts and catalog

The host profiles `umf.visual.powerpoint.network/1`,
`umf.visual.google-slides.network/1` and
`umf.visual.miro.editable-network/1` use mapping version `1`. They qualify
adapter-owned directed networks and explicit visual 1.0.0/1.1.0 sources,
including the 16-node/24-edge 1.1.0 corpus witness. Import/update requires current
source, stable correspondence and native revision/artifact fences. Native-only
geometry, styles and unknown content remain retained with explicit losses.

PowerPoint proof uses actual Mac PowerPoint 16.114.3 UI edits/save/reopen;
LibreOffice-generated preview images remain separately labelled conversion
evidence. Slides cycles use actual native API calls through injected transport
and archived page thumbnails, with no editor-UI claim. Miro cycles use the actual
Web SDK and isolated synthetic captures; service versions remain unpinned.
The [continuation evidence](../04-build/example-completion-evidence.md#p8-p14-continuation-review--2026-10-31)
records the fifteen locally verified pairs and remaining publication gates.

Miro read-only recovery is separate from a failed immediate verification fence.
Receipts retain the interruption, later agreeing captures and qualified
native-only metadata drift; no write retry, atomicity or byte-unchanged board
claim is introduced. Full raw captures remain private.

## Breaking Changes and Required Actions

No implicit vocabulary migration is introduced. Frozen 1.0.0 defaults remain;
select model 1.1.0 explicitly when needed. Its generated types do not qualify
the frozen annotation profiles for exact multiplicities, field IDs or larger
resource limits.

Select annotation profiles explicitly. Persist `{document, source}` for text
replay, and the host binding plus current artifact/capture for edited-host
cycles. Use strict/report policy deliberately and retain diagnostics. Native
default output can change under the declared mapping version; pin the archive
and keep original-source receipts when exact bytes matter.

## Validation

The final full local suite passes 424 tests/13,141 assertions; the two subsequent
PowerPoint attestation tests also pass. Source/native/public-browser and packed
Bun/Node checks pass for the reviewed candidate work. Native proofs use Graphviz, Mermaid 12.2.0 in Chromium
and the pinned Lini 1.1.0 runtime outside portable source. Final commit/CI and publication links remain pending.

The ordinary emitted-loss census is DOT 629, Mermaid 792 and Lini 530, versus
the immutable planning baseline 629/792/553. The remaining 1,951 raw incidences
and 1,793 maximal groups are not repaired by selecting an annotation profile.
The [bounded probe/loss report](../04-build/evidence/renderer-coverage-loss-progress.json)
pins all 53 unchanged source identities and separates these populations.

The earlier v0.2.0 one-suitable-target gate remains 53 examples/22 forms. It
does not satisfy the new fifteen host preview/cycle gate or prove every form in
every target. The fifteen actual host pairs and six-renderer witness pass locally. Final
Linux CI, archive digests and public-site asset hashes remain pending.

## Known Issues and Support

Unsupported families and native edits remain explicit. Lini pipeline and
Mermaid ladder geometry are reported losses. Lini key/cardinality class attempts
do not establish a universal native limit; Mermaid ER identification and
field-attached relationships retain their tested model/profile boundaries.
Rich text is not flattened, and retained source/native bytes do not establish
native semantic coverage.

Host capture fences reduce races without claiming
remote transactions or excluding all ABA changes.

The inherited SDK NodeNext declaration-resolution limitation remains; Bundler
resolution and packed Bun/Node runtime consumers are the qualified boundary.
Use the [editable integrations guide](../../editable-integrations.md) and
versioned capability records when choosing an operation. Report an unsupported
case with its model/profile version and diagnostics, without private host data.

## Migration or Rollback Guidance

Hold the prior verified archive until the candidate passes its checklist and
new archive digests are published. Adopt new profiles explicitly; keep bindings
and receipts with their original interpretation. Do not retry interrupted host
writes automatically or replay stale source over native edits.

For a site regression, restore the last verified site/source cut through the
conformance-gated Pages workflow, preserving the failed candidate and receipts
for inspection. Keep the prior release tag/assets intact. The checklist defines
hold and rollback signals; these notes do not authorize bypassing its gates.

## References

- [Publication checklist](deployment-checklist-v0.3.0.md)
- [Execution plan](../04-build/example-completion-plan.md)
- [Execution evidence and open gates](../04-build/example-completion-evidence.md)
- [Editable host bindings](../02-design/contracts/CONTRACT-088-editable-host-bindings.md)
- [Publication workflow](../../../.github/workflows/ci.yml)
