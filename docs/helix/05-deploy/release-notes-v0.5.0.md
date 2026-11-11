---
ddx:
  id: visual.release.v0.5.0
  type: release-notes
  activity: deploy
  authoring:
    home: repo
  links:
    - id: FEAT-034
      kind: references
    - id: FEAT-036
      kind: references
    - id: CONTRACT-083
      kind: references
    - id: CONTRACT-089
      kind: references
    - id: visual.example-completion-plan
      kind: references
---

# umf-visual v0.5.0

## Release Scope

Version 0.5.0 targets the GitHub package archive and Pages microsite, prepared
2026-11-02 by the repository maintainers. The publication receipt records the
passing main commit, workflow, archive digests and deployed-file verification.
These notes describe the bounded release scope; they are not a publication receipt.

## Audience and Channels

Semantic producers and browser consumers receive ESM, declarations, versioned
schemas and pinned Lini assets through the GitHub release archive. Diagram authors
can inspect YAML, native sources and SVG/PNG output on the microsite.

## Highlights

- A pure presentation compiler for native Graphviz, Mermaid and Lini source.
- A public browser Lini renderer with identity maps and distributable runtime assets.
- Nine sourced showcase examples, including three complex Lini gallery reproductions.
- Visible, copyable YAML payloads and public create/read/edit/compile examples.

## Changes and Fixes

Explicit model 1.2.0 adds shared shapes, container composition, named ports and
E/R identification. Explicit 1.3.0 adds tree composition, symbolic icons,
parallelograms, positioned sequence notes and undirected flow associations.
The 1.0.0, 1.1.0 and 1.2.0 schemas and interpretation remain frozen.

Lini now draws the gallery checkout sequence with self-call, asynchronous and
return messages, a positioned note and a loop. The gallery also includes a
19-topic product mindmap and a six-entity commerce schema with exact field
references and asymmetric cardinalities. Each reproduction pins the
upstream v1.1.0 source, commit and MIT license. Paint and pixel arrangement remain
renderer choices, with explicit approximations rather than raw native fields.

`renderLiniPresentation` from `/renderers/lini` returns the presentation plan,
actual native SVG and exact engine version. The loader verifies pinned JavaScript
and WASM before executing them, refuses native diagnostics and returns typed
failures. The package includes assets, runtime manifest, license and upstream
font/icon notices. Public browser tests cover a finite 100-record/100-field chain,
distinct parallel and self connections, and actual arrow-free undirected links.

Native checks bind labels, field rows, ports, cardinality marks, hierarchy paths,
sequence lifelines, note slots and loop intervals to actual drawing elements.
Negative controls alter those elements while keeping matching text elsewhere.
Stack caption spacing and Linux font fallback issues are corrected in native
Lini source; geometry is not repaired by drawing a substitute SVG.

## Breaking Changes and Required Actions

Existing authoring still defaults to visual 1.0.0. The no-argument upgrade still
selects 1.1.0. Select 1.3.0 explicitly for new concepts.

Earlier editable profiles
retain their model-version bounds and refuse unqualified new-model inputs.
Presentation output does not establish editable interchange round trips.

Browser consumers must serve the complete `/renderers/lini/assets/*` directory
and pass its HTTP(S) base URL when bundling the renderer. Unbundled ESM uses
package-relative asset URLs. Consumers bind native carriers through `elementMap`;
native links expose identity classes rather than guaranteed DOM ID attributes.

## Migration or Rollback Guidance

Install the public `documentdrivendx-umf-visual-0.5.0.tgz` archive. Import the pure
compiler from `/presentation` or asynchronous browser execution from
`/renderers/lini`. Preserve the full UMF document and inspect returned omissions
and approximations. Verify release assets against `SHA256SUMS` and the publication
receipt before updating a pinned dependency.

Consumers may retain the v0.4.0 archive and existing profiles. A Pages rollback
does not modify authored UMF documents or external host files.

## Known Issues and Support

New native tree/sequence presentation views are qualified for Lini; Graphviz and
Mermaid report their current presentation subset explicitly. Mermaid E/R refuses
inputs that leave identification unspecified. The gallery is a finite evidence
cohort, not a claim of universal visual or interchange fidelity.

Pinned Lini does not export a loop-frame DOM identity. Source class identity is
retained, while the frame/guard is qualified through unique native geometry and
the exact message interval. Renderer font substitution is tested on macOS/Linux,
not guaranteed byte-identical across every viewer.

Current core schema registration uses JavaScript code generation. A strict parent
page may execute rendering through a separately served same-origin module worker
whose explicit policy permits that code generation and verified Blob modules.
This worker policy boundary is qualified; direct strict-CSP import of the current
core library is not. SVG attachment and styling remain the host's responsibility.

## References

- [Library usage](../../../README.md)
- [Presentation contract](../02-design/contracts/CONTRACT-089-presentation-rendering.md)
- [Visual model contract](../02-design/contracts/CONTRACT-083-visual-vocabulary.md)
- Execution and publication gates
- [Live microsite](https://documentdrivendx.github.io/umf-visual/)
