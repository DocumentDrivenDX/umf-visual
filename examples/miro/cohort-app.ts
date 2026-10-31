// SPDX-License-Identifier: MIT OR Apache-2.0
/** Interactive developer-only Miro cohort harness. The page never writes until a button is pressed. */
import {readVisualDocument, writeVisualDocument} from '../../src/index.js';
import {assertInterruptedReceiptMatches, compareUnownedSnapshots, parseInterruptedReceiptEnvelope} from './recovery-evidence.js';
import {exportEditableMiroVisual, importEditableMiroVisual, updateEditableMiroVisual,
  captureEditableMiroBoard, readEditableMiroBinding, reconcileEditableMiroVisual, writeEditableMiroBinding,
  type EditableBinding, type EditableMiroBoard, type EditableMiroItem, type EditableObservation, type EditableSnapshot} from '../../src/adapters/miro/editable/index.js';

declare const miro: {board: EditableMiroBoard & {
  ui: {on(event: 'icon:click', callback: () => Promise<void>): void; openPanel(options: {url: string; height: number}): Promise<void>};
  viewport: {zoomTo(items: {id: string}[]): Promise<void>};
}};
type Case = {id: string; title: string; sourceSha256: string; document: unknown};
type JsonObject = Record<string, unknown>;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $('status'), selector = $<HTMLSelectElement>('case-select');
const sourceBox = $<HTMLTextAreaElement>('source'), yamlBox = $<HTMLTextAreaElement>('yaml');
const bindingBox = $<HTMLTextAreaElement>('binding'), captureBox = $<HTMLTextAreaElement>('capture-fence-output');
const recoveryBindingBox = $<HTMLTextAreaElement>('recovery-binding'), rawBoardBox = $<HTMLTextAreaElement>('raw-board-capture');
const interruptedReceiptBox = $<HTMLTextAreaElement>('interrupted-receipt'), recoveryAttestationBox = $<HTMLTextAreaElement>('recovery-attestation');
const recoveryTargetBox = $<HTMLTextAreaElement>('recovery-target-source');
const panelMode = new URL(location.href).searchParams.get('panel') === '1';
const panel = $('panel-screen'), bootstrap = $('bootstrap-screen');
if (typeof miro === 'undefined') {
  const startupStatus = $('bootstrap-status');
  if (startupStatus) startupStatus.textContent = 'Miro Web SDK is unavailable. Open this page inside the approved Miro developer app.';
} else if (!panelMode) {
  if (panel) panel.hidden = true;
  if (bootstrap) bootstrap.hidden = false;
  try {
    miro.board.ui.on('icon:click', async () => miro.board.ui.openPanel({url: new URL('/?panel=1', location.href).href, height: 900}));
    const startupStatus = $('bootstrap-status');
    if (startupStatus) startupStatus.textContent = 'Miro SDK is ready. Use the app icon in the Miro toolbar to open the five-case cohort panel.';
  } catch (error) {
    const startupStatus = $('bootstrap-status');
    if (startupStatus) startupStatus.textContent = `Miro SDK loaded, but toolbar registration failed: ${error instanceof Error ? error.message : String(error)}`;
  }
} else {
  if (bootstrap) bootstrap.hidden = true;
  if (panel) panel.hidden = false;
const rootBoard = miro.board;
let cases: Case[] = [], caseIndex = 0, selected: Case | undefined, current: import('@umf/core').Document | undefined, binding: EditableBinding | undefined;
let nativeWitness: {nodeId: string; x: number; y: number; fillColor: unknown} | undefined;
let endpointWitness: {edgeId: string; from: string; to: string} | undefined;

function setStatus(message: string, data?: unknown): void {status.textContent = data === undefined ? message : `${message}\n${JSON.stringify(data, null, 2)}`;}
function persistEditor(): import('@umf/core').Document {return readVisualDocument(sourceBox.value, 'json');}
function showDocument(value: import('@umf/core').Document): void {sourceBox.value = writeVisualDocument(value, 'json'); yamlBox.value = writeVisualDocument(value, 'yaml');}
function verifyPersistence(value: import('@umf/core').Document): {jsonRoundTrip: boolean; yamlRoundTrip: boolean} {
  const expected = writeVisualDocument(value, 'json');
  const jsonRoundTrip = writeVisualDocument(readVisualDocument(expected, 'json'), 'json');
  const yamlRoundTrip = writeVisualDocument(readVisualDocument(writeVisualDocument(value, 'yaml'), 'yaml'), 'json');
  if (jsonRoundTrip !== expected || yamlRoundTrip !== expected) throw new Error('Imported UMF source did not survive JSON and YAML persistence exactly.');
  return {jsonRoundTrip: true, yamlRoundTrip: true};
}
async function showBinding(): Promise<void> {
  if (!binding) {bindingBox.value = ''; return;}
  if (binding.state === 'complete') {
    try {bindingBox.value = await writeEditableMiroBinding(binding); return;}
    catch (error) {
      bindingBox.value = JSON.stringify({evidenceType: 'umf.visual.miro.private-checkpoint/1', admission: 'serialization-failed; do not load as a validated binding', error: error instanceof Error ? error.message : String(error), snapshot: binding}, null, 2);
      setStatus('The adapter checkpoint remains visible as an unvalidated private snapshot; serialization failure did not interrupt the Miro operation. Do not load this snapshot as a complete binding.');
      return;
    }
  }
  bindingBox.value = JSON.stringify({evidenceType: 'umf.visual.miro.private-checkpoint/1', admission: 'incomplete recovery receipt; not a validated binding', state: binding.state, snapshot: binding}, null, 2);
}
function mappedSnapshots(observation: EditableObservation, ids: Set<string>): Map<string, unknown> {
  const items = (observation.payload as unknown as {items: {id: string; [key: string]: unknown}[]}).items;
  return new Map(items.filter(item => ids.has(item.id)).map(item => [item.id, item]));
}
async function assertNativeOnlyPreserved(stage: string): Promise<void> {
  if (!nativeWitness) return;
  const node = (await rootBoard.get()).find(item => item.id === nativeWitness!.nodeId) as EditableMiroItem | undefined;
  if (!node) throw new Error(`Native-only verification failed after ${stage}: mapped node disappeared.`);
  const style = node.style && typeof node.style === 'object' ? node.style as JsonObject : {};
  if (node.x !== nativeWitness.x || node.y !== nativeWitness.y || style.fillColor !== nativeWitness.fillColor) {
    throw new Error(`Native-only position/fill changed after ${stage}; observed ${JSON.stringify({x: node.x, y: node.y, fillColor: style.fillColor})}, expected ${JSON.stringify(nativeWitness)}.`);
  }
}
function selectedSource(): import('@umf/core').Document {if (!selected) throw new Error('Choose a case first.'); return readVisualDocument(JSON.stringify(selected.document), 'json');}
function caseOffset(): number {return 80_000 + caseIndex * 3_000;}

function offsetBoard(base: EditableMiroBoard, offset: number): EditableMiroBoard {
  return {
    getInfo: () => base.getInfo(), get: () => base.get(),
    createShape: input => {
      const nodes = selected?.id === 'network-16x24' ? (selectedSource().extensions!['umf.visual'] as any).nodes as Array<{label: string}> : [];
      const index = nodes.findIndex(node => node.label === input.content);
      const angle = index * 2 * Math.PI / 16;
      const position = index < 0 ? {x: input.x, y: input.y} : {x: 600 + 600 * Math.cos(angle), y: 220 + 360 * Math.sin(angle)};
      return base.createShape({...input, x: position.x + offset, y: position.y + offset});
    },
    createConnector: input => base.createConnector(input),
    ...(base.group ? {group: (input: {items: EditableMiroItem[]}) => base.group!(input)} : {}),
  };
}
function runButton(id: string, task: () => Promise<void>): void {
  $<HTMLButtonElement>(id).addEventListener('click', async () => {
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('button[data-action]')]; buttons.forEach(button => button.disabled = true);
    try {await task();} catch (error) {const receipt = error && typeof error === 'object' && 'receipt' in error ? (error as {receipt: unknown}).receipt : undefined;
      if (receipt) interruptedReceiptBox.value = JSON.stringify({causeChain: diagnosticCauseChain(error), receipt}, null, 2);
      setStatus(`Stopped: ${error instanceof Error ? error.message : String(error)}`, {causeChain: diagnosticCauseChain(error), ...(receipt ? {receipt} : {})});
    } finally {buttons.forEach(button => button.disabled = false);}
  });
}

const loadCases = await fetch('/cases.json').then(response => {if (!response.ok) throw new Error('Could not load bundled synthetic cases'); return response.json() as Promise<Case[]>;});
cases = loadCases;
for (const [index, item] of cases.entries()) {const option = document.createElement('option'); option.value = item.id; option.textContent = `${index + 1}. ${item.title}`; selector.append(option);}
function selectCase(id: string): void {
  caseIndex = cases.findIndex(item => item.id === id); selected = cases[caseIndex]; if (!selected) return;
  current = selectedSource(); binding = undefined; nativeWitness = undefined; endpointWitness = undefined; showDocument(current); void showBinding();
  recoveryTargetBox.value = writeVisualDocument(current, 'json'); recoveryAttestationBox.value = '';
  setStatus(`Selected ${selected.title}. No Miro objects were read or written. Export is an explicit next action.`, {sourceSha256: selected.sourceSha256, nodes: (current.extensions!['umf.visual'] as any).nodes.length, edges: (current.extensions!['umf.visual'] as any).edges.length});
}
selector.addEventListener('change', () => selectCase(selector.value));
selectCase(cases[0]!.id);
$<HTMLButtonElement>('set-question').addEventListener('click', () => {
  try {
    const next = persistEditor(), visual = next.extensions?.['umf.visual'] as Record<string, unknown> | undefined;
    if (!visual || typeof visual.question !== 'string') throw new Error('The selected source has no question field.');
    visual.question = `${visual.question} (updated in UMF)`;
    showDocument(next);
    setStatus('UMF question changed locally only. Press Update to write the owned question slot to Miro.', {caseId: selected?.id, question: visual.question});
  } catch (error) {setStatus(error instanceof Error ? error.message : String(error));}
});

runButton('export', async () => {
  if (!selected) throw new Error('Choose a case first.');
  const document = persistEditor(), id = `cohort-${selected.id}-${crypto.randomUUID()}`;
  try {
    binding = await exportEditableMiroVisual(offsetBoard(rootBoard, caseOffset()), document, {bindingId: id, mode: 'report', checkpoint: async receipt => {
      binding = receipt; await showBinding();
    }});
  } catch (error) {
    await showBinding();
    throw error;
  }
  current = document; await showBinding(); yamlBox.value = writeVisualDocument(current, 'yaml');
  setStatus('Explicit export completed through the Miro Web SDK. Review the source-only losses; no groups, roles or geometry are inferred.', {caseId: selected.id, sourceSha256: selected.sourceSha256, bindingRevision: binding.bindingRevision, profile: binding.profile, modelVersion: binding.modelVersion, mappings: binding.mappings.length, losses: binding.losses});
});

runButton('native-edits', async () => {
  if (!binding || !current || !selected) throw new Error('Export a case before requesting native SDK edits.');
  const visual = current.extensions!['umf.visual'] as any;
  if (visual.nodes.length < 2 || !visual.edges.length) throw new Error('This case has no qualified editable connector/endpoints.');
  const cleanReadback = await importEditableMiroVisual(rootBoard, binding, current, binding.bindingRevision);
  if (cleanReadback.changes.length !== 0) throw new Error('Fresh export did not pass a clean no-op import before native edits.');
  binding = cleanReadback.binding; current = cleanReadback.document; showDocument(current); await showBinding();
  const nodes = new Map(binding.mappings.filter(item => item.kind === 'node').map(item => [item.logicalId, item.nativeId]));
  const edges = binding.mappings.filter(item => item.kind === 'edge');
  const mapped = new Set([...nodes.values(), ...edges.map(edge => edge.nativeId)]);
  const objects = new Map((await rootBoard.get()).filter(item => mapped.has(item.id)).map(item => [item.id, item as EditableMiroItem]));
  const firstNode = visual.nodes[0], nodeId = nodes.get(firstNode.id), node = nodeId ? objects.get(nodeId) : undefined;
  const firstEdge = visual.edges[0], edgeMapping = edges.find(item => item.logicalId === firstEdge.id), edge = edgeMapping ? objects.get(edgeMapping.nativeId) : undefined;
  if (!node || !edge || typeof node.sync !== 'function' || typeof edge.sync !== 'function') throw new Error('Required mapped native SDK shapes or connectors were not found.');
  const oldX = Number(node.x ?? 0), oldY = Number(node.y ?? 0);
  const oldStyle = node.style && typeof node.style === 'object' ? node.style as JsonObject : {};
  const oldFill = oldStyle.fillColor;
  node.content = `${firstNode.label} — Native edit`;
  node.x = Number(node.x ?? 0) + 80; node.y = Number(node.y ?? 0) + 60;
  node.style = {...oldStyle, fillColor: '#00FFFF'};
  await node.sync();
  const swapForTwoNodes = visual.nodes.length === 2;
  const alternate = swapForTwoNodes
    ? visual.nodes.find((item: any) => item.id === firstEdge.from)
    : visual.nodes.find((item: any) => item.id !== firstEdge.from && item.id !== firstEdge.to);
  if (!alternate) throw new Error('Could not find an alternate endpoint for the first connector.');
  const end = edge.end && typeof edge.end === 'object' ? edge.end as JsonObject : {};
  if (swapForTwoNodes) {
    const start = edge.start && typeof edge.start === 'object' ? edge.start as JsonObject : {};
    edge.start = {...start, item: nodes.get(firstEdge.to)};
  }
  edge.end = {...end, item: nodes.get(alternate.id)};
  await edge.sync();
  endpointWitness = {edgeId: firstEdge.id, from: swapForTwoNodes ? firstEdge.to : firstEdge.from, to: alternate.id};
  const editedNode = (await rootBoard.get()).find(item => item.id === nodeId) as EditableMiroItem | undefined;
  if (!editedNode) throw new Error('Edited node disappeared before position/fill observation.');
  const editedStyle = editedNode.style && typeof editedNode.style === 'object' ? editedNode.style as JsonObject : {};
  if (editedNode.x === oldX || editedNode.y === oldY || editedStyle.fillColor === oldFill || editedStyle.fillColor === undefined) throw new Error('The native SDK did not produce an observable position and fill change.');
  nativeWitness = {nodeId: nodeId!, x: Number(editedNode.x), y: Number(editedNode.y), fillColor: editedStyle.fillColor};
  setStatus('Clean no-op import passed before the explicit SDK edits. Node position/fill were observed after the edit; a two-node edge is reversed at both attached ends. Import will verify semantic edits while subsequent UMF updates preserve these native-only values.', {caseId: selected.id, preEditImport: {changes: cleanReadback.changes.length}, nodeId: firstNode.id, label: `${firstNode.label} — Native edit`, before: {x: oldX, y: oldY, fillColor: oldFill}, after: {x: nativeWitness.x, y: nativeWitness.y, fillColor: nativeWitness.fillColor}, edgeId: firstEdge.id, endpoint: alternate.id, reversedBothEnds: swapForTwoNodes, bindingRevision: binding.bindingRevision});
});

runButton('import', async () => {
  if (!binding || !current) throw new Error('Export the selected case first.');
  const result = await importEditableMiroVisual(rootBoard, binding, current, binding.bindingRevision);
  const importedVisual = result.document.extensions!['umf.visual'] as any;
  const importedEdge = importedVisual.edges.find((item: any) => item.id === endpointWitness?.edgeId);
  if (!endpointWitness || !importedEdge || importedEdge.from !== endpointWitness.from || importedEdge.to !== endpointWitness.to) {
    throw new Error('Native connector endpoint edit did not read back as the expected directed UMF edge.');
  }
  binding = result.binding; current = result.document; showDocument(current); await showBinding();
  await assertNativeOnlyPreserved('import');
  const persistence = verifyPersistence(current);
  setStatus('Two-capture import completed. Semantic text and endpoint edits are in UMF; native fill and position remain native-only. JSON/YAML read-write cycles are exact; source losses remain.', {bindingRevision: binding.bindingRevision, changes: result.changes, nativeOnly: result.nativeOnly, unmapped: result.unmapped, persistence, losses: result.losses});
});

runButton('update', async () => {
  if (!binding || !current) throw new Error('Import native edits before applying a preserving UMF update.');
  const nextDocument = persistEditor();
  recoveryTargetBox.value = writeVisualDocument(nextDocument, 'json');
  const oldQuestion = (current.extensions!['umf.visual'] as any).question;
  const nextQuestion = (nextDocument.extensions!['umf.visual'] as any).question;
  if (typeof nextQuestion !== 'string' || nextQuestion === oldQuestion) throw new Error('Change the UMF question first so this action proves preservation across a real source update.');
  binding = await updateEditableMiroVisual(rootBoard, binding, current, nextDocument, {expectedBindingRevision: binding.bindingRevision, mode: 'report'});
  current = nextDocument; showDocument(current); await showBinding();
  const verification = await importEditableMiroVisual(rootBoard, binding, current, binding.bindingRevision);
  binding = verification.binding; current = verification.document; showDocument(current); await showBinding();
  await assertNativeOnlyPreserved('source update');
  const persistence = verifyPersistence(current);
  setStatus('Explicit native-preserving UMF update and follow-up import completed. Source-owned text was patched; native fill and position remain on the board. JSON/YAML read-write cycles are exact.', {bindingRevision: binding.bindingRevision, readbackChanges: verification.changes, nativeOnly: verification.nativeOnly, persistence, losses: binding.losses});
});

runButton('restore-source', async () => {
  if (!binding || !current || !selected) throw new Error('Export the selected case before restoring its original source.');
  const original = selectedSource();
  recoveryTargetBox.value = writeVisualDocument(original, 'json');
  binding = await updateEditableMiroVisual(rootBoard, binding, current, original, {expectedBindingRevision: binding.bindingRevision, mode: 'report'});
  current = original; showDocument(current); await showBinding();
  const verification = await importEditableMiroVisual(rootBoard, binding, current, binding.bindingRevision);
  binding = verification.binding; current = verification.document; showDocument(current); await showBinding();
  await assertNativeOnlyPreserved('source restoration');
  const persistence = verifyPersistence(current);
  const visual = current.extensions!['umf.visual'] as any;
  setStatus('Original fixture source restored through an explicit preserving UMF update and verified by follow-up import. Native-only position and fill remain; original semantic labels and endpoints are back. The selected source is ready for catalog preview.', {
    caseId: selected.id, fixtureSourceSha256: selected.sourceSha256, sourceDigestSha256: binding.sourceDigestSha256,
    bindingRevision: binding.bindingRevision, readbackChanges: verification.changes, nativeOnly: verification.nativeOnly,
    sourceShape: {nodes: visual.nodes.length, edges: visual.edges.length}, persistence, losses: binding.losses
  });
});

runButton('zoom', async () => {
  if (!binding) throw new Error('Export a case first.');
  const ids = new Set(binding.mappings.map(item => item.nativeId));
  const items = (await rootBoard.get()).filter(item => ids.has(item.id));
  await miro.board.viewport.zoomTo(items);
  setStatus('Viewport moved to this case’s mapped synthetic objects. The screenshot must be captured in the host UI; no raw board snapshot is exported.', {mappedItems: items.length, scope: 'selected-case objects only'});
});

runButton('capture-fence-action', async () => {
  if (!binding || !selected) throw new Error('Export a selected case before capturing its read-only fence.');
  const before = binding.baselineNative, first = await captureEditableMiroBoard(rootBoard), second = await captureEditableMiroBoard(rootBoard);
  const ids = new Set(binding.mappings.map(mapping => mapping.nativeId));
  const baselineMapped = mappedSnapshots(before, ids), firstMapped = mappedSnapshots(first, ids), secondMapped = mappedSnapshots(second, ids);
  const changed = [...ids].filter(id => canonicalSnapshot(baselineMapped.get(id)) !== canonicalSnapshot(firstMapped.get(id)));
  const stable = first.captureDigestSha256 === second.captureDigestSha256 && JSON.stringify(first.revision) === JSON.stringify(second.revision);
  if (!stable || baselineMapped.size !== ids.size || firstMapped.size !== ids.size || secondMapped.size !== ids.size) throw new Error('Two-capture fence changed during observation or missed a bound object.');
  const receipt = {evidenceType: 'umf.visual.miro.private-capture-fence/1', privacy: 'local private receipt; no whole-board item content or API headers are included', caseId: selected.id,
    sourceSha256: selected.sourceSha256, bindingRevision: binding.bindingRevision, mappedObjectCount: ids.size,
    baseline: {captureDigestSha256: before.captureDigestSha256, revisionKind: before.revision.kind, mappedObjectCount: baselineMapped.size},
    observed: {captureDigestSha256: first.captureDigestSha256, revisionKind: first.revision.kind, stableSecondCapture: stable, mappedObjectCount: firstMapped.size, mappedObjectsChangedFromBaseline: changed.length}};
  captureBox.value = JSON.stringify(receipt, null, 2);
  setStatus('Read-only mapped-object capture fence completed. Two observations matched; the private receipt contains only source/binding provenance, capture digests, counts and change count.', receipt);
});

runButton('load-complete-binding', async () => {
  const loaded = await readEditableMiroBinding(recoveryBindingBox.value);
  if (loaded.state !== 'complete') throw new Error('Only a complete binding can be loaded for read-only inspection. Interrupted receipts require manual inspection.');
  if (loaded.resource.documentId !== (await rootBoard.getInfo()).id) throw new Error('The complete binding belongs to a different Miro board.');
  const source = persistEditor();
  if (canonicalSnapshot(source) !== canonicalSnapshot(loaded.source)) throw new Error('The supplied source JSON does not exactly match the binding source.');
  binding = loaded; current = source; showDocument(source); await showBinding();
  const matchedIndex = cases.findIndex(item => item.id === (source.extensions!['umf.visual'] as any).id);
  if (matchedIndex >= 0) {caseIndex = matchedIndex; selected = cases[matchedIndex]; selector.value = selected!.id;}
  setStatus('Complete binding and matching UMF source loaded after a read-only board identity check. No item capture or writes occurred; use the explicit raw-capture button to inspect current native state.',
    {caseId: selected?.id, bindingRevision: binding.bindingRevision, mappings: binding.mappings.length, sourceDigestSha256: binding.sourceDigestSha256, rawCapturePending: true});
});

runButton('capture-raw-board', async () => {
  if (!binding) throw new Error('Load a validated complete binding before capturing the current board.');
  if (binding.resource.documentId !== (await rootBoard.getInfo()).id) throw new Error('The binding belongs to a different Miro board.');
  const first = await captureEditableMiroBoard(rootBoard), second = await captureEditableMiroBoard(rootBoard);
  const stable = first.captureDigestSha256 === second.captureDigestSha256 && canonicalSnapshot(first.revision) === canonicalSnapshot(second.revision);
  const receipt = {evidenceType: 'umf.visual.miro.private-raw-capture/1', privacy: 'private full-board SDK snapshot; do not publish or attach outside the approved evidence store',
    bindingRevision: binding.bindingRevision, sourceDigestSha256: binding.sourceDigestSha256, stableSecondCapture: stable, first, second};
  rawBoardBox.value = JSON.stringify(receipt, null, 2);
  setStatus('Two explicit read-only board captures completed. The private text area contains full API-visible board data; no Miro objects or binding state were changed.',
    {bindingRevision: binding.bindingRevision, stableSecondCapture: stable, firstCaptureDigestSha256: first.captureDigestSha256, secondCaptureDigestSha256: second.captureDigestSha256,
      firstItemCount: (first.payload as any).items.length, secondItemCount: (second.payload as any).items.length});
});

runButton('recover-readback', async () => {
  if (!binding || !current || !selected) throw new Error('Load the last complete binding and its matching source before read-only recovery.');
  if (binding.state !== 'complete') throw new Error('Read-only recovery requires the last complete binding; do not load an interrupted receipt as a complete binding.');
  if (!interruptedReceiptBox.value.trim()) throw new Error('Paste or retain the original interrupted write receipt before recovery so the failure remains part of the private evidence.');
  const receiptEnvelope = parseInterruptedReceiptEnvelope(interruptedReceiptBox.value);
  const interruptedBinding = await readEditableMiroBinding(JSON.stringify(receiptEnvelope.binding));
  assertInterruptedReceiptMatches(interruptedBinding, binding);
  if (binding.resource.documentId !== (await rootBoard.getInfo()).id) throw new Error('The binding belongs to a different Miro board.');
  const expectedSource = readVisualDocument(recoveryTargetBox.value, 'json');
  const first = await captureEditableMiroBoard(rootBoard), second = await captureEditableMiroBoard(rootBoard);
  rawBoardBox.value = JSON.stringify({evidenceType: 'umf.visual.miro.private-recovery-captures/1', privacy: 'private full-board SDK snapshots; retain only in approved private evidence storage',
    bindingRevision: binding.bindingRevision, first, second}, null, 2);
  const stable = first.captureDigestSha256 === second.captureDigestSha256 && canonicalSnapshot(first.revision) === canonicalSnapshot(second.revision);
  if (!stable) throw new Error('Read-only recovery captures differ. Leave the board untouched and capture again after it settles; no writes or retries occurred.');
  const result = await reconcileEditableMiroVisual(binding, current, first, second, binding.bindingRevision);
  if (canonicalSnapshot(result.document) !== canonicalSnapshot(expectedSource)) throw new Error('Stable native readback does not reconstruct the explicitly selected expected source. No writes were attempted.');
  const mapped = (observation: EditableObservation, kind: string, logicalId: string): EditableSnapshot => {
    const mapping = binding!.mappings.find(item => item.kind === kind && item.logicalId === logicalId);
    if (!mapping) throw new Error(`Recovery lacks the expected ${kind}:${logicalId} mapping.`);
    const snapshot = (observation.payload as unknown as {items: EditableSnapshot[]}).items.find(item => item.id === mapping.nativeId);
    if (!snapshot) throw new Error(`Recovery capture lacks mapped ${kind}:${logicalId}.`);
    return snapshot;
  };
  const expectedVisual = expectedSource.extensions!['umf.visual'] as any, mappedNode = mapped(first, 'node', expectedVisual.nodes[0].id), mappedEdge = mapped(first, 'edge', expectedVisual.edges[0].id);
  const baselineNode = mapped(binding.baselineNative, 'node', expectedVisual.nodes[0].id), style = mappedNode.data.style as JsonObject | undefined, baselineStyle = baselineNode.data.style as JsonObject | undefined;
  const priorItems = (binding.baselineNative.payload as unknown as {items: EditableSnapshot[]}).items;
  const currentItems = (first.payload as unknown as {items: EditableSnapshot[]}).items;
  const currentNativeIds = new Set(currentItems.map(item => item.id));
  const projectMappings = (value: EditableBinding) => value.mappings.map(({kind, logicalId, path, nativeId, nativeScope}) => ({kind, logicalId, path, nativeId, nativeScope}));
  const completeIdentityMapPresent = binding.mappings.every(item => currentNativeIds.has(item.nativeId)) &&
    canonicalSnapshot(projectMappings(binding)) === canonicalSnapshot(projectMappings(result.binding));
  const mappedIds = new Set(binding.mappings.map(item => item.nativeId));
  const priorUnowned = new Map(priorItems.filter(item => !mappedIds.has(item.id)).map(item => [item.id, item]));
  const currentUnowned = new Map(currentItems.filter(item => !mappedIds.has(item.id)).map(item => [item.id, item]));
  const unownedComparison = compareUnownedSnapshots(priorItems, currentItems, mappedIds);
  const positionPreserved = mappedNode.data.x === baselineNode.data.x && mappedNode.data.y === baselineNode.data.y && typeof mappedNode.data.x === 'number' && typeof mappedNode.data.y === 'number';
  const fillColor = style?.fillColor, baselineFillColor = baselineStyle?.fillColor;
  const fillPreserved = typeof fillColor === 'string' && typeof baselineFillColor === 'string' && fillColor.toLowerCase() === baselineFillColor.toLowerCase();
  const nodeMappings = new Map(binding.mappings.filter(item => item.kind === 'node').map(item => [item.logicalId, item.nativeId]));
  const start = mappedEdge.data.start as JsonObject | undefined, end = mappedEdge.data.end as JsonObject | undefined, expectedEdge = expectedVisual.edges[0];
  const endpointsRestored = start?.item === nodeMappings.get(expectedEdge.from) && end?.item === nodeMappings.get(expectedEdge.to);
  if (!positionPreserved || !fillPreserved || !endpointsRestored || !unownedComparison.preserved || !completeIdentityMapPresent) throw new Error('Read-only recovery did not verify native geometry/fill, directed endpoints, full identity mappings, and qualified unowned-object preservation.');
  const persistence = verifyPersistence(result.document), interruptedText = interruptedReceiptBox.value;
  const interruptedDigest = interruptedText ? await sha256(interruptedText) : undefined;
  const attestation = {evidenceType: 'umf.visual.miro.read-only-recovery/1', caseId: selected.id, fixtureSourceSha256: selected.sourceSha256,
    expectedSourceDigestSha256: await sha256(writeVisualDocument(expectedSource, 'json')), priorUpdateStatus: 'WRITE_INTERRUPTED; its write operation is not promoted to success by this readback', recoveryOperation: 'two stable read-only captures followed by semantic import',
    writesPerformedByRecovery: false, atomicityClaimed: false, interruptedReceiptRetained: true, interruptedReceiptState: interruptedBinding.state, interruptedReceiptCauseChain: receiptEnvelope.causeChain, ...(interruptedDigest ? {interruptedReceiptSha256: interruptedDigest} : {}),
    priorBindingRevision: binding.bindingRevision, recoveredBindingRevision: result.binding.bindingRevision, sourceDigestSha256: result.binding.sourceDigestSha256,
    captureDigests: [first.captureDigestSha256, second.captureDigestSha256], stableCaptures: true, importedChanges: result.changes.map(change => change.path),
    checks: {expectedSourceReconstructed: true, fullIdentityMapPresentAndStable: true, nodePositionPreserved: true, nodeFillPreserved: true, expectedDirectedEndpointsObserved: true,
      priorUnownedObjectsRetained: unownedComparison.preserved, newlyObservedUnownedObjectsStableAcrossCaptures: true},
    unownedObjectComparison: {priorCount: unownedComparison.priorCount, currentCount: unownedComparison.currentCount, newlyObservedIds: unownedComparison.newlyObservedIds,
      qualifiedNativeOnlyDrift: unownedComparison.qualifiedDrift, unqualifiedPaths: unownedComparison.unqualifiedPaths, missingIds: unownedComparison.missingIds}, persistence};
  binding = result.binding; current = result.document; showDocument(current); await showBinding();
  recoveryAttestationBox.value = JSON.stringify(attestation, null, 2);
  setStatus('Read-only recovery verified the explicit expected source and its directed endpoints after the interrupted operation. Two fresh captures matched; node position and fill match the prior complete binding. Every prior unowned object remains; only explicitly recorded SDK/server metadata drift was qualified, and newly observed objects are listed separately. Recovery performed no writes; the interrupted receipt remains separate.',
    {caseId: selected.id, bindingRevision: binding.bindingRevision, changes: result.changes.map(change => change.path), checks: attestation.checks, interruptedReceiptRetained: attestation.interruptedReceiptRetained, interruptedReceiptSha256: attestation.interruptedReceiptSha256, persistence, recoveryAttestation: attestation});
});

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

$<HTMLButtonElement>('download-json').addEventListener('click', () => {
  if (!current || !selected) return;
  const file = new Blob([writeVisualDocument(current, 'json')], {type: 'application/json'});
  const link = document.createElement('a'); link.href = URL.createObjectURL(file); link.download = `${selected.id}.umf.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
$<HTMLButtonElement>('download-yaml').addEventListener('click', () => {
  if (!current || !selected) return;
  const file = new Blob([writeVisualDocument(current, 'yaml')], {type: 'application/yaml'});
  const link = document.createElement('a'); link.href = URL.createObjectURL(file); link.download = `${selected.id}.umf.yaml`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
$<HTMLButtonElement>('download-binding').addEventListener('click', async () => {
  if (!binding || !selected) return;
  await showBinding();
  const complete = binding.state === 'complete';
  const file = new Blob([bindingBox.value], {type: 'application/json'});
  const link = document.createElement('a'); link.href = URL.createObjectURL(file); link.download = complete ? `${selected.id}.miro-binding.private.json` : `${selected.id}.miro-incomplete-recovery.private.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
sourceBox.addEventListener('input', () => {try {const doc = persistEditor(); yamlBox.value = writeVisualDocument(doc, 'yaml');} catch {/* Keep the current YAML receipt until JSON parses. */}});
}

function canonicalSnapshot(value: unknown): string {
  const sort = (item: any): any => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key])])) : item;
  return JSON.stringify(sort(value));
}

function diagnosticCauseChain(error: unknown): {name?: string; code?: string; message: string}[] {
  const rows: {name?: string; code?: string; message: string}[] = [], seen = new Set<object>();
  let current: unknown = error;
  while (current !== undefined && current !== null && rows.length < 8) {
    if (typeof current === 'object') {
      if (seen.has(current)) {rows.push({message: '[cyclic error cause]'}); break;}
      seen.add(current);
    }
    const row = current && typeof current === 'object' ? current as {name?: unknown; code?: unknown; message?: unknown; cause?: unknown} : undefined;
    const message = typeof row?.message === 'string' ? row.message : typeof current === 'string' ? current : String(current);
    rows.push({...(typeof row?.name === 'string' ? {name: row.name} : {}), ...(typeof row?.code === 'string' ? {code: row.code} : {}), message});
    current = row?.cause;
  }
  return rows;
}
