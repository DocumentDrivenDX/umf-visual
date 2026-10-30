# Editable host integrations

This guide covers the source-checkout APIs for creating a bounded `flow/network`
visual in PowerPoint, Google Slides, or Miro, reading qualified native edits,
and updating only fields owned by the adapter. The public package entrypoints
are `@documentdrivendx/umf-visual/powerpoint`,
`@documentdrivendx/umf-visual/google-slides`, and
`@documentdrivendx/umf-visual/miro/editable`. The package is currently private
and these exports are built by `bun run build`; they are not an npm install
claim.

All three adapters use a complete UMF `Document`. The profiles are
`umf.visual.powerpoint.network/1`, `umf.visual.google-slides.network/1`, and
`umf.visual.miro.editable-network/1`. Each starts with one directed
`flow/network`, plain title/question/node/edge text and explicit edge endpoints.
Support for a field is determined by the adapter's projection and evidence, not
by whether that field survives in the retained source. `strict` is the default:
it refuses semantic fields the profile cannot represent. `report` allows the
operation to continue while preserving those fields in its binding and listing
their paths as losses; it does not turn them into native support.

These profile implementations accept `umf.visual` 1.0.0 and 1.1.0 explicitly.
The 1.0.0 network limit is 15 nodes; 1.1.0 allows 64. The shared profile limits
include 256 edges, 32 groups, and group depth eight. Each adapter also bounds
its native capture or package size. Select 1.1.0 in the source document when
needed; adapters never silently upgrade a 1.0.0 document.

## PowerPoint

`exportPowerPoint` creates a bounded `.pptx` with editable native shapes and
attached directed connectors. Save the returned `bytes` and `binding` together.
After a user edits and saves the package in PowerPoint, `importPowerPoint`
reconstructs only qualified title, question, node-label, edge-label, and
endpoint edits. `updatePowerPoint` patches those fields in the current package
while retaining unrelated package parts and native geometry. It requires the
current package bytes and their digest so stale files are refused.

```ts
import {createVisualDocument, editVisual} from '@documentdrivendx/umf-visual';
import {
  exportPowerPoint, importPowerPoint, updatePowerPoint,
} from '@documentdrivendx/umf-visual/powerpoint';

const source = createVisualDocument({
  id: 'request-path', kind: 'flow', form: 'network',
  title: 'Request path', question: 'Where does the request go?',
  nodes: [{id: 'client', label: 'Client'}, {id: 'service', label: 'Service'}],
  edges: [{id: 'request', from: 'client', to: 'service', label: 'calls'}],
});

const created = await exportPowerPoint(source, {mode: 'report'});
// Persist created.bytes and created.binding before handing the package to a user.

const editedBytes = new Uint8Array(await (await fetch('/edited.pptx')).arrayBuffer());
const imported = await importPowerPoint(editedBytes, {
  mode: 'report', binding: created.binding,
  expectedBindingRevision: created.bindingRevision,
  currentDocument: source, currentSourceSha256: created.sourceSha256,
});

// To change another mapped field after import, base the next document on the
// imported result; do not replay the original document over native edits.
const desired = editVisual(imported.document, visual => {
  visual.question = 'Which service receives it?';
  return visual;
});
const updated = await updatePowerPoint(imported, desired, {
  mode: 'report', expectedBindingRevision: imported.bindingRevision,
  currentArtifactBytes: editedBytes,
  currentArtifactSha256: imported.artifactSha256,
});
// Persist updated.bytes and updated.binding as the next revision.
```

The current package is parsed under bounded ZIP/XML rules. `updatePowerPoint`
does not accept arbitrary package edits as source updates; stale artifact
digests, unsupported shape changes, and semantic changes outside the mapped
fields refuse. See the [PowerPoint native conformance evidence](helix/04-build/powerpoint-native-conformance.md)
for the qualified native application scope and limits.

## Google Slides

The Google Slides adapter separates pure planning from host I/O. The caller
injects a `GoogleSlidesHostApi` with `getPresentation` and `batchUpdate`
operations. Capture a real full presentation snapshot, plan the export with
explicit placement boxes, and pass the plan to `applyGoogleSlidesExport`.
That function uses the host revision as the write precondition and requires a
separate native readback. The module does not provide credentials or perform
network requests itself.

```ts
import {createVisualDocument, editVisual} from '@documentdrivendx/umf-visual';
import {
  applyGoogleSlidesExport, observeGoogleSlides, planGoogleSlidesExport,
  type GoogleSlidesHostApi,
} from '@documentdrivendx/umf-visual/google-slides';

declare const api: GoogleSlidesHostApi; // Supply authenticated host I/O outside this library.
declare const presentationId: string;
const source = createVisualDocument({
  id: 'request-path', kind: 'flow', form: 'network',
  question: 'Where does the request go?',
  nodes: [{id: 'client', label: 'Client'}, {id: 'service', label: 'Service'}],
  edges: [{id: 'request', from: 'client', to: 'service'}],
});
const before = await observeGoogleSlides(await api.getPresentation(presentationId));
const plan = await planGoogleSlidesExport(source, before, {
  question: {x: 40, y: 24, width: 420, height: 36},
  nodes: {
    client: {x: 40, y: 130, width: 150, height: 70},
    service: {x: 330, y: 130, width: 150, height: 70},
  },
}, {mode: 'report'});
const applied = await applyGoogleSlidesExport(plan, api);
// Persist applied.binding. For import/update, take two matching observations
// and use importGoogleSlidesEdits / planGoogleSlidesUpdate / applyGoogleSlidesUpdate.
```

`importGoogleSlidesEdits` is a read-only reconciliation operation. It requires
two observations of the same presentation revision and the expected binding
revision. `planGoogleSlidesUpdate` requires the current source, desired source,
current observation, and expected binding revision; `applyGoogleSlidesUpdate`
rechecks the host revision before sending the update and validates a later
readback. User-owned credentials and request retries remain the host caller's
responsibility. See the [Google Slides integration spike](helix/02-design/spikes/SPIKE-001-google-slides.md)
for the bounded profile's recorded application evidence and limits.

## Miro editable network

`@documentdrivendx/umf-visual/miro/editable` accepts an injected Miro Web SDK v2
board object. It does not authenticate or discover a board. `bindingId` must be
unique per export. Persist the returned binding outside transient memory; its
native item identities and revision lineage are needed for readback and later
updates.

```ts
import {createVisualDocument, editVisual} from '@documentdrivendx/umf-visual';
import {
  exportEditableMiroVisual, importEditableMiroVisual,
  updateEditableMiroVisual, writeEditableMiroBinding,
  type EditableMiroBoard,
} from '@documentdrivendx/umf-visual/miro/editable';

declare const board: EditableMiroBoard; // Inject the current board from Miro Web SDK v2.
const source = createVisualDocument({
  id: 'request-path', kind: 'flow', form: 'network',
  question: 'Where does the request go?',
  nodes: [{id: 'client', label: 'Client'}, {id: 'service', label: 'Service'}],
  edges: [{id: 'request', from: 'client', to: 'service', label: 'calls'}],
});
const binding = await exportEditableMiroVisual(board, source, {
  bindingId: crypto.randomUUID(), mode: 'strict',
});
const durableReceipt = await writeEditableMiroBinding(binding);
// Store durableReceipt and source together. Then let the user edit the board.

const adopted = await importEditableMiroVisual(board, binding, source, binding.bindingRevision);
const desired = editVisual(adopted.document, visual => {
  visual.question = 'Which service owns it?';
  return visual;
});
const nextBinding = await updateEditableMiroVisual(
  board, adopted.binding, adopted.document, desired,
  {expectedBindingRevision: adopted.binding.bindingRevision, mode: 'strict'},
);
```

The default Miro revision is a digest of a native capture. Two matching captures
fence a read or update, but they are not an atomic Miro transaction and do not
exclude an ABA change between observations. A caller can provide a separately
qualified revision provider only when its host really supplies one. Checkpoint
callbacks receive the binding before and after native writes; retain interrupted
receipts and inspect uncertain objects rather than retrying or rolling back.

This profile is limited to `flow/network`; labels are plain text and connectors
must remain straight with the qualified arrow direction. Native movement and
styles remain native-only and are preserved by mapped-field updates. Common
group membership can map in the bounded profile, but group labels, roles and
nested membership are not all represented. Strict mode refuses any semantic
loss; report mode records it. A sanitized live-host receipt now qualifies one
synthetic three-node/two-edge flow for this exact profile and observed Miro Web
SDK runtime. It records node-label and directed-endpoint import, a UMF question
update, and preservation of native style, position, connector fields, and 82
unmapped items across the observed transitions. Bold rich text was explicitly
refused as `RICH_TEXT` rather than flattened. This evidence does not qualify
other forms, rich-text editing, group behavior, or all Miro service releases;
the Miro service release was not pinned. The tested source was synthetic and
was not one of the six integration-corpus cases. See the
[sanitized live Miro receipt](helix/04-build/miro-editable-live-2026-10-30.md)
and [receipt data](helix/04-build/evidence/miro-editable-live-2026-10-30.json).
The older [Miro integration evidence](helix/04-build/miro-integration.md)
concerns the separate `umf.visual.miro` capture/clipboard profile and does not
qualify this editable binding API.

## Revision and recovery rules

Bindings are consistency records, not signatures or authorization tokens. Keep
the `Document`, binding, and host artifact together; admit the binding using the
adapter's reader before reuse. Pass the exact expected `bindingRevision`. A
changed source, wrong host resource, missing/duplicated native identity, or
disagreeing captures must stop reconciliation. On interrupted native writes,
retain the receipt and inspect current host state before any further write.
Never delete native content or retry automatically as recovery.

The shared contract is [CONTRACT-088](helix/02-design/contracts/CONTRACT-088-editable-host-bindings.md).
Its model-version, field-ownership, revision-fence and interruption rules apply
to all three adapters; host-specific behavior remains scoped to each profile.
