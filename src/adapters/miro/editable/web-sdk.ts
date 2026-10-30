// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '@umf/core';
import {getVisual} from '../../../extensions/visual/index.js';
import {captureEditableMiroBoard} from './capture.js';
import {identity, makeMapping, nativeCaptureLosses, validateEditableBinding} from './binding.js';
import {canonical, copyJson, EditableMiroError, escapeContent, requireEditable, record} from './json.js';
import {canonicalHostJson, hostDigest} from '../../reconciliation/json.js';
import {planEditableMiroExport} from './plan.js';
import {reconcileEditableMiroVisual} from './reconcile.js';
import {MIRO_EDITABLE_METADATA_KEY, MIRO_EDITABLE_PROFILE, type EditableBinding, type EditableExportOptions, type EditableImportResult, type EditableMapping, type EditableMiroBoard, type EditableMiroGroup, type EditableMiroItem, type EditableObservation, type EditablePlan, type EditableUpdateOptions, type EditableKind} from './types.js';

const objectMap = (items: (EditableMiroItem | EditableMiroGroup)[]) => new Map(items.map(item => [item.id, item]));
const observationItems = (observation: EditableObservation) => (observation.payload as unknown as {items: import('./types.js').EditableSnapshot[]}).items;
const boardId = async (board: EditableMiroBoard, expected: string) => requireEditable((await board.getInfo()).id === expected, 'RESOURCE', 'Wrong Miro board resource');

function position(index: number): {x: number; y: number} {return {x: (index % 5) * 300, y: Math.floor(index / 5) * 190};}
function shapeInput(content: string, x: number, y: number, width = 220, height = 88) {return {shape: 'rectangle' as const, content: escapeContent(content), x, y, width, height};}
async function assertFreshBinding(binding: EditableBinding, source: Document, expectedRevision: number): Promise<EditableBinding> {
  const safe = await validateEditableBinding(binding);
  requireEditable(safe.state === 'complete', 'INCOMPLETE', 'Only a complete binding may be reconciled or updated');
  requireEditable(safe.bindingRevision === expectedRevision, 'STALE_BINDING', 'Expected binding revision differs from current binding');
  requireEditable(canonicalHostJson(copyJson(source)) === canonicalHostJson(safe.source), 'STALE_SOURCE', 'Use the bound UMF source for this operation');
  return safe;
}
async function checkpoint(binding: EditableBinding, hook: EditableExportOptions['checkpoint']): Promise<void> {await hook?.(copyJson(binding));}
function interrupted(code: string, message: string, binding: EditableBinding, cause: unknown): EditableMiroError {
  binding.state = 'interrupted';
  const error = new EditableMiroError(code, message, copyJson(binding));
  (error as Error & {cause?: unknown}).cause = cause;
  return error;
}
function assertUnusedBindingId(observation: EditableObservation, bindingId: string): void {
  for (const item of observationItems(observation)) {
    const marker = record(item.metadata) ? item.metadata[MIRO_EDITABLE_METADATA_KEY] : undefined;
    if (record(marker) && marker.bindingId === bindingId) throw new EditableMiroError('BINDING_EXISTS', 'Binding ID already appears in native metadata');
  }
}
async function createMapped(binding: EditableBinding, bindingId: string, board: EditableMiroBoard, slot: {logicalId: string; kind: EditableKind; path: string}, create: () => Promise<EditableMiroItem>, hook: EditableExportOptions['checkpoint']): Promise<EditableMiroItem> {
  const pending = {operation: 'create', kind: slot.kind, logicalId: slot.logicalId};
  binding.pending = copyJson(pending);
  await checkpoint(binding, hook);
  await boardId(board, binding.resource.documentId);
  const item = await create();
  requireEditable(typeof item.id === 'string' && item.id.length > 0, 'NATIVE_ID', 'Miro did not assign an item ID');
  const mapping = makeMapping(binding, slot, item.id);
  requireEditable(!binding.mappings.some(value => value.nativeId === item.id), 'IDENTITY', 'Miro reused a native item ID');
  binding.pending = {...pending, nativeId: item.id};
  binding.mappings.push(mapping);
  await checkpoint(binding, hook);
  requireEditable(item.setMetadata, 'METADATA', 'The created item cannot retain an editable binding identity');
  await item.setMetadata(MIRO_EDITABLE_METADATA_KEY, identity({...binding, bindingId}, mapping));
  await checkpoint(binding, hook);
  return item;
}

async function createPlannedTextAndNodes(binding: EditableBinding, plan: EditablePlan, board: EditableMiroBoard, options: EditableExportOptions): Promise<Map<string, EditableMiroItem>> {
  if (plan.title !== undefined) await createMapped(binding, options.bindingId, board, {logicalId: 'title', kind: 'title', path: '/extensions/umf.visual/title'},
    () => board.createShape(shapeInput(plan.title!, 0, -260, 600, 76)), options.checkpoint);
  await createMapped(binding, options.bindingId, board, {logicalId: 'question', kind: 'question', path: '/extensions/umf.visual/question'},
    () => board.createShape(shapeInput(plan.question, 0, -140, 600, 76)), options.checkpoint);
  const nodes = new Map<string, EditableMiroItem>(), baseY = plan.title !== undefined ? 200 : 80;
  for (const node of plan.nodes) {
    const point = position(node.index), slot = {logicalId: node.logicalId, kind: 'node' as const, path: '/extensions/umf.visual/nodes/' + node.index + '/label'};
    const item = await createMapped(binding, options.bindingId, board, slot, () => board.createShape(shapeInput(node.label, point.x, point.y + baseY)), options.checkpoint);
    nodes.set(node.logicalId, item);
  }
  return nodes;
}
async function createPlannedGroup(binding: EditableBinding, board: EditableMiroBoard, plan: EditablePlan['groups'][number], nodes: Map<string, EditableMiroItem>, hook: EditableExportOptions['checkpoint']): Promise<void> {
  requireEditable(board.group, 'GROUPS', 'The injected Miro SDK does not expose group creation');
  const members = plan.members.map(id => nodes.get(id)).filter((item): item is EditableMiroItem => item !== undefined);
  requireEditable(members.length >= 2 && members.length === plan.members.length, 'GROUP_MEMBERS', 'Native groups require at least two mapped node members');
  const pending = {operation: 'create', kind: 'group', logicalId: plan.logicalId};
  binding.pending = copyJson(pending); await checkpoint(binding, hook); await boardId(board, binding.resource.documentId);
  const group = await board.group({items: members});
  requireEditable(typeof group.id === 'string' && group.id.length > 0 && !binding.mappings.some(row => row.nativeId === group.id), 'NATIVE_ID', 'Miro returned an empty or reused group ID');
  const mapping = makeMapping(binding, {logicalId: plan.logicalId, kind: 'group', path: '/extensions/umf.visual/groups/' + plan.index}, group.id);
  binding.pending = {...pending, nativeId: group.id}; binding.mappings.push(mapping); await checkpoint(binding, hook);
}
async function createPlannedGroups(binding: EditableBinding, board: EditableMiroBoard, plan: EditablePlan, nodes: Map<string, EditableMiroItem>, hook: EditableExportOptions['checkpoint']): Promise<void> {
  for (const group of plan.groups) await createPlannedGroup(binding, board, group, nodes, hook);
}
async function createPlannedEdges(binding: EditableBinding, board: EditableMiroBoard, plan: EditablePlan, nodes: Map<string, EditableMiroItem>, options: EditableExportOptions): Promise<void> {
  for (const edge of plan.edges) {
    const from = nodes.get(edge.from), to = nodes.get(edge.to);
    requireEditable(from && to, 'ENDPOINT', 'Planned connector endpoint is not mapped to a created node');
    const slot = {logicalId: edge.logicalId, kind: 'edge' as const, path: '/extensions/umf.visual/edges/' + edge.index};
    await createMapped(binding, options.bindingId, board, slot, () => board.createConnector({shape: 'straight', style: {startStrokeCap: 'none', endStrokeCap: 'stealth'},
      start: {item: from.id, snapTo: 'auto'}, end: {item: to.id, snapTo: 'auto'}, captions: edge.label === undefined ? [] : [{content: escapeContent(edge.label), position: 0.5}]}), options.checkpoint);
  }
}
async function completeExport(binding: EditableBinding, plan: EditablePlan, board: EditableMiroBoard, document: Document, options: EditableExportOptions): Promise<EditableBinding> {
  requireEditable(canonicalHostJson(copyJson(document)) === canonicalHostJson(plan.source), 'STALE_SOURCE', 'UMF source changed while Miro items were being created');
  const capture = await captureEditableMiroBoard(board, options.revisionProvider);
  binding.baselineNative = capture; binding.losses = [...plan.losses, ...nativeCaptureLosses(capture, binding.mappings)];
  binding.state = 'complete'; delete binding.pending; await validateEditableBinding(binding); await checkpoint(binding, options.checkpoint);
  return copyJson(binding);
}
async function prepareUpdate(board: EditableMiroBoard, binding: EditableBinding, currentDocument: Document, nextDocument: Document, options: EditableUpdateOptions): Promise<{plan: EditablePlan; slots: {mapping: EditableMapping; values: Record<string, unknown>}[]; objects: Map<string, EditableMiroItem | EditableMiroGroup>}> {
  const plan = await planEditableMiroExport(nextDocument, options.mode ?? 'strict');
  requireEditable(plan.modelVersion === binding.modelVersion, 'VERSION', 'Visual version cannot change during native-preserving update');
  requireEditable(canonicalHostJson(semanticProjection(currentDocument)) === canonicalHostJson(semanticProjection(nextDocument)), 'UNSAFE_EDIT', 'Only text, labels and edge endpoints can change');
  const beforeVisual = getVisual(currentDocument), nextVisual = getVisual(nextDocument);
  requireEditable((beforeVisual.title === undefined) === (nextVisual.title === undefined), 'UNSAFE_EDIT', 'Adding or removing the optional title slot requires a new export');
  const slots = desiredSlots(currentDocument, nextDocument);
  if (beforeVisual.title !== nextVisual.title) requireEditable(binding.mappings.some(mapping => mapping.kind === 'title'), 'IDENTITY', 'Title slot is not mapped');
  const before = await captureEditableMiroBoard(board, options.revisionProvider), after = await captureEditableMiroBoard(board, options.revisionProvider);
  const reconciled = await reconcileEditableMiroVisual(binding, currentDocument, before, after, options.expectedBindingRevision);
  requireEditable(canonicalHostJson(currentDocument) === canonicalHostJson(binding.source) && canonicalHostJson(nextDocument) === canonicalHostJson(plan.source), 'STALE_SOURCE', 'UMF input changed during native capture');
  requireEditable(reconciled.changes.length === 0, 'STALE_NATIVE', 'Resolve native semantic edits before applying a source update');
  const objects = objectMap(await board.get());
  for (const slot of slots) {
    const mapping = binding.mappings.find(value => value.kind === slot.mapping.kind && value.logicalId === slot.mapping.logicalId);
    requireEditable(mapping, 'IDENTITY', 'No native mapping exists for an edited source slot'); slot.mapping = mapping;
    const object = objects.get(mapping.nativeId);
    requireEditable(object && typeof (object as EditableMiroItem).sync === 'function', 'SDK', 'Mapped native object cannot be synchronized; no writes have occurred');
  }
  return {plan, slots, objects};
}
async function writeUpdateSlot(board: EditableMiroBoard, binding: EditableBinding, slot: {mapping: EditableMapping; values: Record<string, unknown>}, objects: Map<string, EditableMiroItem | EditableMiroGroup>): Promise<void> {
  const {mapping, values} = slot, item = objects.get(mapping.nativeId) as EditableMiroItem;
  await boardId(board, binding.resource.documentId);
  if (mapping.kind !== 'edge') item.content = escapeContent(values.content as string);
  else {
    if (Object.hasOwn(values, 'endpoints')) await applyEndpoints(item, binding, values.endpoints as {from: string; to: string});
    if (Object.hasOwn(values, 'content')) applyCaption(item, values.content as string | undefined);
  }
  await item.sync!();
}
async function applyEndpoints(item: EditableMiroItem, binding: EditableBinding, endpoints: {from: string; to: string}): Promise<void> {
  const from = binding.mappings.find(candidate => candidate.kind === 'node' && candidate.logicalId === endpoints.from);
  const to = binding.mappings.find(candidate => candidate.kind === 'node' && candidate.logicalId === endpoints.to);
  requireEditable(from && to, 'ENDPOINT', 'Updated connector endpoint is not a mapped node');
  const start = record(item.start) ? item.start as Record<string, unknown> : {}, end = record(item.end) ? item.end as Record<string, unknown> : {};
  item.start = {...start, item: from.nativeId}; item.end = {...end, item: to.nativeId};
}
async function writeUpdateSlots(board: EditableMiroBoard, binding: EditableBinding, next: EditableBinding, slots: {mapping: EditableMapping; values: Record<string, unknown>}[], objects: Map<string, EditableMiroItem | EditableMiroGroup>, hook: EditableUpdateOptions['checkpoint']): Promise<void> {
  const completed: string[] = [];
  for (const slot of slots) {
    const mapping = slot.mapping;
    next.pending = {operation: 'update', kind: mapping.kind, logicalId: mapping.logicalId, nativeId: mapping.nativeId, values: copyJson(slot.values) as import('@umf/core').Json, completed};
    await hook?.(copyJson(next)); await writeUpdateSlot(board, binding, slot, objects);
    completed.push(mapping.kind + ':' + mapping.logicalId); next.pending = {operation: 'update', completed}; await hook?.(copyJson(next));
  }
}
async function finishUpdate(board: EditableMiroBoard, binding: EditableBinding, next: EditableBinding, plan: EditablePlan, currentDocument: Document, nextDocument: Document, options: EditableUpdateOptions): Promise<EditableBinding> {
  requireEditable(canonicalHostJson(currentDocument) === canonicalHostJson(binding.source), 'STALE_SOURCE', 'Bound UMF source changed during Miro update');
  requireEditable(canonicalHostJson(copyJson(nextDocument)) === canonicalHostJson(plan.source), 'STALE_SOURCE', 'UMF source changed during Miro update');
  const written = await captureEditableMiroBoard(board, options.revisionProvider), repeated = await captureEditableMiroBoard(board, options.revisionProvider);
  const losses = [...binding.losses];
  for (const loss of [...plan.losses, ...nativeCaptureLosses(written, binding.mappings)]) if (!losses.some(previous => canonicalHostJson(previous) === canonicalHostJson(loss))) losses.push(loss);
  const candidate = {...binding, source: copyJson(nextDocument), sourceDigestSha256: plan.sourceDigestSha256, baselineNative: written, losses, state: 'complete' as const};
  const checked = await reconcileEditableMiroVisual(candidate, nextDocument, written, repeated, binding.bindingRevision);
  requireEditable(checked.changes.length === 0, 'WRITE_VERIFY', 'Native readback does not match requested source edits');
  next.source = copyJson(nextDocument); next.sourceDigestSha256 = plan.sourceDigestSha256; next.bindingRevision++;
  next.baselineNative = written; next.losses = losses; next.state = 'complete'; delete next.pending;
  return validateEditableBinding(next);
}
/** Creates a new native drawing. A failure leaves an interrupted receipt; it never deletes/retries remote writes. */
export async function exportEditableMiroVisual(board: EditableMiroBoard, document: Document, options: EditableExportOptions): Promise<EditableBinding> {
  const plan = await planEditableMiroExport(document, options.mode ?? 'strict');
  requireEditable(typeof options.bindingId === 'string' && options.bindingId.length > 0 && options.bindingId.length <= 128, 'BINDING_ID', 'Supply a unique binding ID, 1–128 characters');
  const before = await captureEditableMiroBoard(board, options.revisionProvider); assertUnusedBindingId(before, options.bindingId);
  const expected = plan.nodes.length + plan.edges.length + plan.groups.length + 1 + (plan.title === undefined ? 0 : 1);
  requireEditable(observationItems(before).length + expected <= 10_000, 'LIMIT', 'Create would exceed the 10,000-item capture ceiling');
  const binding: EditableBinding = {profile: MIRO_EDITABLE_PROFILE, modelVersion: plan.modelVersion, resource: copyJson(before.resource), bindingRevision: 0,
    source: copyJson(plan.source), sourceDigestSha256: plan.sourceDigestSha256, baselineNative: before, mappings: [], losses: copyJson(plan.losses), state: 'writing'};
  try {
    await checkpoint(binding, options.checkpoint);
    const nodes = await createPlannedTextAndNodes(binding, plan, board, options);
    await createPlannedGroups(binding, board, plan, nodes, options.checkpoint);
    await createPlannedEdges(binding, board, plan, nodes, options);
    return await completeExport(binding, plan, board, document, options);
  } catch (cause) {
    throw interrupted('WRITE_INTERRUPTED', 'Miro create was interrupted. Keep the receipt and inspect current board state before recovery; no remote rollback or retry was attempted.', binding, cause);
  }
}

function semanticProjection(value: Document): Document {
  const copy = copyJson(value), visual = copy.extensions!['umf.visual'] as unknown as Record<string, unknown>;
  for (const key of ['title', 'question']) delete visual[key];
  if (Array.isArray(visual.nodes)) for (const node of visual.nodes as Record<string, unknown>[]) delete node.label;
  if (Array.isArray(visual.edges)) for (const edge of visual.edges as Record<string, unknown>[]) {delete edge.label; delete edge.from; delete edge.to;}
  return copy;
}
function desiredSlots(before: Document, after: Document): {mapping: EditableMapping; values: Record<string, unknown>}[] {
  const oldVisual = getVisual(before), nextVisual = getVisual(after), rows: {mapping: EditableMapping; values: Record<string, unknown>}[] = [];
  if (oldVisual.title !== nextVisual.title) rows.push({mapping: {logicalId: 'title', kind: 'title', path: '/extensions/umf.visual/title', nativeId: '', nativeScope: ''}, values: {content: nextVisual.title}});
  if (oldVisual.question !== nextVisual.question) rows.push({mapping: {logicalId: 'question', kind: 'question', path: '/extensions/umf.visual/question', nativeId: '', nativeScope: ''}, values: {content: nextVisual.question}});
  for (const [index, node] of oldVisual.nodes!.entries()) {
    const next = nextVisual.nodes!.find(item => item.id === node.id)!;
    if (node.label !== next.label) rows.push({mapping: {logicalId: node.id, kind: 'node', path: '/extensions/umf.visual/nodes/' + index + '/label', nativeId: '', nativeScope: ''}, values: {content: next.label}});
  }
  for (const [index, edge] of (oldVisual.edges ?? []).entries()) {
    const next = nextVisual.edges!.find(item => item.id === edge.id)!;
    const values: Record<string, unknown> = {};
    if (edge.label !== next.label) values.content = next.label;
    if (edge.from !== next.from || edge.to !== next.to) values.endpoints = {from: next.from, to: next.to};
    if (Object.keys(values).length) rows.push({mapping: {logicalId: edge.id, kind: 'edge', path: '/extensions/umf.visual/edges/' + index, nativeId: '', nativeScope: ''}, values});
  }
  return rows;
}
function applyCaption(item: EditableMiroItem, label: string | undefined): void {
  const current = Array.isArray(item.captions) ? item.captions as Record<string, unknown>[] : [];
  if (label === undefined || label === '') item.captions = [];
  else if (current.length) item.captions = [{...current[0]!, content: escapeContent(label)}];
  else item.captions = [{content: escapeContent(label), position: 0.5}];
}

/** Patches only source-owned slots on existing items; movement/styles and unrelated items remain untouched. */
export async function updateEditableMiroVisual(board: EditableMiroBoard, input: EditableBinding, currentDocument: Document, nextDocument: Document, options: EditableUpdateOptions): Promise<EditableBinding> {
  const binding = await assertFreshBinding(input, currentDocument, options.expectedBindingRevision);
  const prepared = await prepareUpdate(board, binding, currentDocument, nextDocument, options), {plan, slots, objects} = prepared;
  const next = copyJson(binding);
  next.state = 'writing'; next.pending = {operation: 'update', sourceDigestSha256: plan.sourceDigestSha256, completed: []};
  try {
    await options.checkpoint?.(copyJson(next));
    await writeUpdateSlots(board, binding, next, slots, objects, options.checkpoint);
    return await finishUpdate(board, binding, next, plan, currentDocument, nextDocument, options);
  } catch (cause) {
    throw interrupted('WRITE_INTERRUPTED', 'Miro update was interrupted. Keep this receipt and inspect each completed and pending item before recovery; no remote rollback or retry was attempted.', next, cause);
  }
}

/** Import performs two captures and refuses any discrepancy; captures are not an atomic Miro snapshot. */
export async function importEditableMiroVisual(board: EditableMiroBoard, binding: EditableBinding, currentDocument: Document, expectedBindingRevision: number, revisionProvider?: () => Promise<import('./types.js').NativeRevision>): Promise<EditableImportResult> {
  const safe = await assertFreshBinding(binding, currentDocument, expectedBindingRevision);
  await boardId(board, safe.resource.documentId);
  const before = await captureEditableMiroBoard(board, revisionProvider);
  const after = await captureEditableMiroBoard(board, revisionProvider);
  return reconcileEditableMiroVisual(safe, currentDocument, before, after, expectedBindingRevision);
}
