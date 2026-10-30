// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document, Json} from '@umf/core';
import {getVisual, inspectVisual} from '../../../extensions/visual/index.js';
import {editableBindingId, editableMappingKey, identity, nativeCaptureLosses, nativeResidualData, validateEditableBinding, validateObservation} from './binding.js';
import {canonical, copyJson, plainContent, pointerSegment, record, requireEditable} from './json.js';
import {canonicalHostJson} from '../../reconciliation/json.js';
import {planEditableMiroExport} from './plan.js';
import {finishHostReconciliation} from '../../reconciliation/index.js';
import type {HostBinding} from '../../reconciliation/types.js';
import type {EditableBinding, EditableChange, EditableImportResult, EditableMapping, EditableObservation, EditableSnapshot} from './types.js';
import {MIRO_EDITABLE_METADATA_KEY} from './types.js';

function present(value: unknown): EditableChange['before'] {
  return value === undefined ? {present: false} : {present: true, value: copyJson(value as Json)};
}
function appendChange(changes: EditableChange[], path: string, before: unknown, after: unknown): void {
  if (canonical(before) === canonical(after)) return;
  changes.push({path, before: present(before), after: present(after)});
}
function changeField(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined) delete target[key]; else target[key] = copyJson(value);
}
function observationItems(observation: EditableObservation): EditableSnapshot[] {return (observation.payload as unknown as {items: EditableSnapshot[]}).items;}
function snapshotMap(observation: EditableObservation): Map<string, EditableSnapshot> {return new Map(observationItems(observation).map(item => [item.id, item]));}
function nativeOnlySignature(snapshot: EditableSnapshot, mapping?: EditableMapping): string {
  const data = mapping ? nativeResidualData(snapshot, mapping) : {...snapshot.data};
  if (!mapping) {delete data.id; delete data.type;}
  return canonical({data, metadata: snapshot.metadata, omittedApiMembers: snapshot.omittedApiMembers, metadataCoverage: snapshot.metadataCoverage});
}
function nativeOnlyChanges(binding: EditableBinding, before: EditableObservation, after: EditableObservation): string[] {
  const baseline = snapshotMap(before), current = snapshotMap(after), paths = new Set<string>(), mapped = new Set(binding.mappings.map(mapping => mapping.nativeId));
  for (const mapping of binding.mappings) {
    const oldItem = baseline.get(mapping.nativeId), newItem = current.get(mapping.nativeId);
    requireEditable(oldItem && newItem, 'IDENTITY', 'Mapped native item disappeared during fenced reconciliation');
    if (nativeOnlySignature(oldItem, mapping) !== nativeOnlySignature(newItem, mapping)) paths.add('/native/items/' + pointerSegment(mapping.nativeId));
  }
  const unknownIds = new Set([...baseline.keys(), ...current.keys()].filter(id => !mapped.has(id)));
  for (const id of unknownIds) {
    const oldItem = baseline.get(id), newItem = current.get(id);
    if (!oldItem || !newItem || nativeOnlySignature(oldItem) !== nativeOnlySignature(newItem)) paths.add('/native/items/' + pointerSegment(id));
  }
  return [...paths].sort();
}
function checkIdentityAndStructure(binding: EditableBinding, observation: EditableObservation): Map<string, EditableSnapshot> {
  const current = snapshotMap(observation), baseline = snapshotMap(binding.baselineNative);
  const byNative = new Map(binding.mappings.map(mapping => [mapping.nativeId, mapping]));
  const bindingId = editableBindingId(binding);
  for (const item of observationItems(observation)) {
    const marker = record(item.metadata) ? item.metadata[MIRO_EDITABLE_METADATA_KEY] : undefined;
    if (record(marker) && marker.profile === binding.profile && marker.bindingId === bindingId) {
      const mapping = byNative.get(item.id);
      requireEditable(mapping && canonical(marker) === canonical(identity({...binding, bindingId}, mapping)), 'IDENTITY', 'Copied, added or altered object claims a mapped editable identity');
    }
  }
  const byLogical = new Map(binding.mappings.map(mapping => [editableMappingKey(mapping), mapping.nativeId]));
  for (const mapping of binding.mappings) {
    const item = current.get(mapping.nativeId), base = baseline.get(mapping.nativeId);
    requireEditable(item && base, 'IDENTITY', 'Mapped native item was removed');
    if (mapping.kind === 'group') {
      requireEditable(item.type === 'group', 'IDENTITY', 'Mapped group type changed');
      requireEditable(canonical([...(Array.isArray(item.data.itemsIds) ? item.data.itemsIds : [])].sort()) === canonical([...(Array.isArray(base.data.itemsIds) ? base.data.itemsIds : [])].sort()), 'STRUCTURE', 'Mapped common group membership changed; group edits are not in the initial semantic edit allowlist');
      continue;
    }
    const marker = record(item.metadata) ? item.metadata[MIRO_EDITABLE_METADATA_KEY] : undefined;
    requireEditable(record(marker) && canonical(marker) === canonical(identity({...binding, bindingId}, mapping)), 'IDENTITY', 'Mapped item metadata or identity changed');
    requireEditable(item.type === (mapping.kind === 'edge' ? 'connector' : 'shape'), 'IDENTITY', 'Mapped native item type changed');
    if (mapping.kind === 'edge') {
      requireEditable(item.data.shape === 'straight', 'CONNECTOR', 'Editable connectors must remain straight Miro connectors');
      const style = item.data.style;
      requireEditable(record(style) && style.startStrokeCap === 'none' && style.endStrokeCap === 'stealth', 'CONNECTOR', 'Editable connectors must preserve the qualified start and end arrow caps');
      for (const side of ['start', 'end'] as const) {
        const endpoint = item.data[side];
        requireEditable(record(endpoint) && typeof endpoint.item === 'string', 'ENDPOINT', 'Mapped connector endpoint is missing or detached');
        const endpointMapping = binding.mappings.find(candidate => candidate.kind === 'node' && candidate.nativeId === endpoint.item);
        requireEditable(endpointMapping && byLogical.has('node:' + endpointMapping.logicalId), 'ENDPOINT', 'Mapped connector endpoint is not an exported semantic node');
      }
    }
  }
  return current;
}
function addSourceChange(changes: EditableChange[], target: Record<string, unknown>, key: string, value: unknown, path: string): void {
  appendChange(changes, path, target[key], value);
  changeField(target, key, value);
}

/** Pure, all-or-nothing semantic adoption from two equal fenced observations. */
export async function reconcileEditableMiroVisual(input: EditableBinding, currentDocument: Document, beforeInput: EditableObservation, afterInput: EditableObservation, expectedBindingRevision: number): Promise<EditableImportResult> {
  const binding = await validateEditableBinding(input);
  requireEditable(binding.state === 'complete', 'INCOMPLETE', 'Interrupted bindings require manual inspection before reconciliation');
  requireEditable(binding.bindingRevision === expectedBindingRevision, 'STALE_BINDING', 'Expected binding revision differs from current binding');
  const currentDoc = copyJson(currentDocument);
  requireEditable(canonical(currentDoc) === canonical(binding.source), 'STALE_SOURCE', 'UMF source changed since the complete binding revision');
  const before = await validateObservation(beforeInput), after = await validateObservation(afterInput);
  requireEditable(canonical(before.resource) === canonical(binding.resource) && canonical(after.resource) === canonical(binding.resource), 'RESOURCE', 'Observation belongs to a different Miro board');
  requireEditable(canonical(before.revision) === canonical(after.revision) && before.captureDigestSha256 === after.captureDigestSha256, 'CONCURRENT_EDIT', 'Repeated native captures differ; capture again after board edits settle');
  const current = checkIdentityAndStructure(binding, after);
  const document = copyJson(binding.source), visual = document.extensions!['umf.visual'] as unknown as Record<string, unknown>;
  const typed = visual as unknown as import('../../../extensions/visual/index.js').Visual;
  const changes: EditableChange[] = [];
  for (const mapping of binding.mappings) {
    const item = current.get(mapping.nativeId)!;
    if (mapping.kind === 'group') continue;
    if (mapping.kind === 'title' || mapping.kind === 'question') {
      const label = plainContent(item.data.content);
      addSourceChange(changes, visual, mapping.kind, label, mapping.path);
    } else if (mapping.kind === 'node') {
      const label = plainContent(item.data.content);
      const node = typed.nodes!.find(candidate => candidate.id === mapping.logicalId)! as unknown as Record<string, unknown>;
      addSourceChange(changes, node, 'label', label, mapping.path);
    } else {
      const edge = typed.edges!.find(candidate => candidate.id === mapping.logicalId)! as unknown as Record<string, unknown>;
      const i = typed.edges!.findIndex(candidate => candidate.id === mapping.logicalId);
      for (const side of ['start', 'end'] as const) {
        const endpoint = item.data[side] as Record<string, unknown>;
        const nativeId = endpoint.item as string;
        const nodeMapping = binding.mappings.find(candidate => candidate.kind === 'node' && candidate.nativeId === nativeId)!;
        const field = side === 'start' ? 'from' : 'to';
        addSourceChange(changes, edge, field, nodeMapping.logicalId, '/extensions/umf.visual/edges/' + i + '/' + field);
      }
      const captions = item.data.captions;
      requireEditable(captions === undefined || (Array.isArray(captions) && captions.length <= 1), 'CAPTION', 'At most one editable connector caption is supported');
      const caption = Array.isArray(captions) && captions.length ? plainContent(record(captions[0]) ? captions[0].content : undefined) : undefined;
      const adoptedLabel = caption === '' ? undefined : caption;
      addSourceChange(changes, edge, 'label', adoptedLabel, '/extensions/umf.visual/edges/' + i + '/label');
    }
  }
  requireEditable(!changes.length || inspectVisual(binding.source).complete, 'UNSAFE_EDIT', 'A complete current Visual is required before adopting semantic changes');
  requireEditable(inspectVisual(document).valid, 'VISUAL_INVALID', 'Native edits create an invalid Visual document');
  const plan = await planEditableMiroExport(document, 'report');
  const nextLosses = [...binding.losses];
  for (const loss of [...plan.losses, ...nativeCaptureLosses(after, binding.mappings)]) if (!nextLosses.some(previous => canonical(previous) === canonical(loss))) nextLosses.push(loss);
  const items = observationItems(after);
  const unmapped = items.filter(item => !binding.mappings.some(mapping => mapping.nativeId === item.id)).map(item => item.id);
  const nativeOnly = nativeOnlyChanges(binding, binding.baselineNative, after);
  requireEditable(canonicalHostJson(currentDocument) === canonicalHostJson(currentDoc), 'STALE_SOURCE', 'UMF source changed during native capture');
  const result = await finishHostReconciliation(binding as HostBinding, currentDoc,
    {expectedBindingRevision, observedBefore: before, observedAfter: after},
    {document, changes, nativeOnlyChanges: nativeOnly, losses: nextLosses});
  requireEditable(result.ok, result.diagnostics[0]?.code ?? 'RECONCILE', result.diagnostics[0]?.message ?? 'Host reconciliation refused');
  return {document: result.document, original: copyJson(binding.source), binding: await validateEditableBinding(result.binding as EditableBinding), observation: copyJson(after), changes, nativeOnly: result.nativeOnlyChanges, unmapped, losses: copyJson(result.losses)};
}
