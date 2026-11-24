# CONTRACT-090 — Excalidraw network files

## Purpose and scope

The `umf.visual.excalidraw.network/1` profile gives producers an editable
`.excalidraw` file and a revisioned JSON binding. It covers Excalidraw scene
format 2 and `umf.visual` 1.0.0 and 1.1.0 for a single `flow/network`.
The visual must contain 1–64 nodes and at most 256 edges, subject to the
selected model's limits. Mapped text is nonblank, limited to 1024 JavaScript
code units per field, and allows LF line breaks.

The public `./excalidraw` entry point is browser-compatible TypeScript/ESM.
It uses the shared JSON admission and source digest helpers and implements a
file binding. Callers own file I/O and persistence. The pinned native editor
and Chromium driver are development tooling.

## Operations

- `exportExcalidraw(document, {mode?})` validates the source and returns
  scene text, mappings, diagnostics, and a revision-zero binding. Strict
  mode refuses retained-only semantic fields. Report mode lists their paths
  and carries the complete source in the binding.
- `importExcalidraw(text, {binding, currentDocument, expectedRevision})`
  checks revision, complete source equality, scene integrity and baseline
  correspondence. It returns the validated document, original input scene
  text, native mappings, diagnostics, and the next binding. Refusals expose
  no partial document. Callers retain the input file and previous binding.
- `replayExcalidraw({binding, currentDocument, expectedRevision})` repeats
  the consistency checks and returns the exact stored scene string. It
  requires the UMF revision that was bound by the last export or import.
  Exporting an independently changed UMF document creates a new scene.

The binding stores the profile, random scene scope, revision, complete source,
source digest, full scene text, and scene digest. The source digest is SHA-256
of canonical admitted JSON. The scene digest is SHA-256 over the UTF-8 encoding
of the provided text. The scope and source slots derive stable native element
IDs. Baseline checks re-read all mapped values. A binding establishes
consistency for the caller and grants no authority over the file.

File admission allows 8 MiB of scene text and at most 4096 elements with unique
IDs, within the shared finite JSON depth and member limits.

## Field ownership and fidelity

The adapter draws standalone title and question text, rectangles with bound
node text, and directed arrows with optional bound edge captions. It reads
mapped text from Excalidraw's `originalText` so native wrapping introduces no
semantic line breaks. Arrow endpoints read from explicit bindings with
consistent reverse links. Caption presence, mapped element identity and type,
and endpoint ownership must survive. Deletion, new labels attached to mapped
elements, and unmapped or detached arrow endpoints refuse. The profile treats
an end arrowhead with no start arrowhead as a directed edge.

Import may adopt changes to existing mapped text and reattach arrows between
existing mapped rectangles. Complete visual validation gates semantic edits.
Roles, groups and other unrepresented source fields stay in the binding and
receive loss diagnostics. Movement, styling, native groups and unrelated scene
objects stay in the scene text. Native changes receive diagnostics by element
or scene property. Replay returns the stored text with unknown properties,
files and ordering intact. It does not depend on the editor retaining unknown
properties when it resaves a scene.

## Presentation profile

`umf.visual.excalidraw.presentation/1` compiles one visual document into
native editable scene format 2. The compiler returns a deterministic scene,
source-to-element mappings, visual approximations, and omitted scalar source
paths. The source document remains the authority. Presentation files carry no
network binding. Use the separate network export to adopt supported semantic
edits back into UMF.

Sequence presentations use participant rails and source-ordered message
arrows. Metric presentations use magnitude bars or a plotted trend with exact
values. Other forms use the shared primitive scene with editable shapes,
connectors, labels and group boxes. The returned approximations describe where
this geometry differs from the author's intended form or layout.

The microsite catalog includes these presentations for its 53 examples across
all 22 forms. The build requires Excalidraw to restore every emitted element,
keep original text and text ownership, preserve arrow bindings and direction,
serialize the scene, and produce an SVG containing the emitted labels. It
publishes the scene and SVG under content-addressed paths. This evidence covers
the catalog fixtures and the pinned editor. Geometry and field coverage vary
by form, and the compiler reports those differences.

## Evidence

`bun run test:excalidraw` starts Excalidraw 0.18.1 and headless Chromium
on loopback. The conformance check loads the exported file through the editor,
renames a node and reattaches an arrow via its API, moves and recolors a
rectangle, saves through the editor serializer, reconciles into UMF, and
reopens the replay. It verifies a self-loop and renders SVG through the editor.
The Bun tests cover opaque scene retention and refusal controls. The ordinary
Chromium and package smoke checks exercise the portable entry point.

References: [CONTRACT-083](CONTRACT-083-visual-vocabulary.md),
[CONTRACT-088](CONTRACT-088-editable-host-bindings.md),
[Excalidraw scene format](https://plus.excalidraw.com/docs/sdk/codebase/json-schema),
[Excalidraw editor API](https://plus.excalidraw.com/docs/sdk/excalidraw/api/props/excalidraw-api).
