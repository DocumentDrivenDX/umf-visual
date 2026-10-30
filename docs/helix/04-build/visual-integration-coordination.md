# Visual integration coordination

As of 2026-10-29, the diagram-language task owns the common visual vocabulary,
shared native interchange contract and catalog. The independent Miro task owns
`src/adapters/miro/`, `./miro`, its example app/browser hook and native board
capture/edit/adoption evidence. Preserve those concurrent main-checkout changes.

## Reserved authorities and version boundaries

- CONTRACT-083 is the unchanged imported visual 1.0.0 authority.
- CONTRACT-084 remains the Miro network contract. Do not rename it to 085.
- CONTRACT-085 is the static language-reference/example catalog contract.
- CONTRACT-086 is shared bounded DOT/Mermaid/Lini interchange. It was renumbered
  before integration specifically to preserve the existing Miro 084 identity.
- Model, native extension, adapter profile and package versions are separate.
  Current native profile versions are DOT 0.2.0, Mermaid 1.1.0, Lini 0.2.0.

The interchange/catalog baseline is isolated in branch codex/interchange-catalog,
worktree /private/tmp/umf-visual-review, baseline commit 1fc99e5. Active edits are
staged in /private/tmp/umf-visual-interchange and copied deliberately to that branch.
The real main checkout contains concurrent Miro and Slides/PowerPoint spike work;
no bulk overwrite, reset or broad staging of those changes is permitted.

## Shared semantic versus native content

The intended common model is a typed superset of common tool concepts and an
authoring target for semantic producers, including UMF schemas. Current 1.0.0 is
an early architectural-communication vocabulary with inherited profile limits,
not the completed generic language. See architecture and the current-state audit.
Common geometry, shape/style/layout intent, attachment and relationship meanings
need governed model/version/migration contracts before changing shared schemas.
Do not classify a useful common concept as permanent native-only noise merely
because current 1.0.0 lacks a typed property.

Miro-specific native presentation, board IDs, SDK fields, provenance and opaque
unsupported content belong in a separately versioned adapter-owned extension or
native companion, preserved without fabricated interpretation. Register extension
identity/version and specify portable JSON admission, unknown content retention,
reference ownership and upgrade behavior. Do not infer semantic IDs from tooltips.
`umf.visual.miro` 1.0.0 is now registered by CONTRACT-084 and the Miro
adapter. Its optional browser-copy profile is explicitly observed/client-qualified;
its native-only documents do not fabricate shared visual semantics.

## Example ownership and privacy

Real board captures remain source-specific fixtures; they are not language types.
The Miro task inventories authorized source boards read-only and reports concrete
semantic counterexamples before proposing vocabulary edits. Keep raw board data
outside the public repository/site by default. Prepare sanitized/reduced examples
for shared conformance and preserve capture version/provenance privately. Approval
to inspect a workspace is not approval to publish its private board content.

A proposed shared change supplies: a reduced example, native concept/property,
current projection/loss, desired typed meaning, migration implications and native
round-trip proof. The shared-model task owns the cross-tool decision; the Miro
adapter owns native fidelity and edit adoption. Report exact subset, API version
and live versus local evidence independently.

## Integration sequence

Keep the stable visual 1.0.0 authority while each adapter proves its current subset.
Merge packaging/browser hooks deliberately rather than replacing files. Read all
new artifact IDs before reserving one. Coordinate real examples and proposed typed
gaps through this note and explicit human-authorized task messages. Source receipt
replay proves original recovery only; edited-source/native adoption needs separate
three-way reconciliation and repeated round-trip tests.

The Miro task supplied sanitized structural counterexamples in
`docs/helix/02-design/spikes/miro/counterexamples.md`, plus live 72-item native
UMF reproduction evidence. Two distinct diagrams share that private source:
a development/data flow and nested deployment environments. Shared schema
changes remain with the diagram-language owner; no raw company data entered
the catalog or public fixtures.
