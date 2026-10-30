// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '@umf/core';
import {canonical, copyJson, plainContent, pointerSegment, requireEditable, record} from './json.js';
import {admitHostBinding, admitHostObservation} from '../../reconciliation/index.js';
import {canonicalHostJson, hostDigest} from '../../reconciliation/json.js';
import {planEditableMiroExport} from './plan.js';
import {MIRO_EDITABLE_METADATA_KEY, MIRO_EDITABLE_PROFILE, type EditableBinding, type EditableKind, type EditableLoss, type EditableMapping, type EditableObservation, type EditablePlan, type EditableSnapshot} from './types.js';

export const editableMappingKey = (mapping: Pick<EditableMapping, 'kind' | 'logicalId'>) => mapping.kind + ':' + mapping.logicalId;
type IdentityBinding = Pick<EditableBinding, 'profile' | 'resource'> & {bindingId?: string};
export function editableBindingId(binding: EditableBinding): string {
  const snapshots = (binding.baselineNative.payload as unknown as {items?: EditableSnapshot[]})?.items ?? [];
  for (const mapping of binding.mappings) {
    if (mapping.kind === 'group') continue;
    const metadata = snapshots.find(item => item.id === mapping.nativeId)?.metadata;
    const marker = record(metadata) ? metadata[MIRO_EDITABLE_METADATA_KEY] : undefined;
    if (record(marker) && typeof marker.bindingId === 'string' && marker.bindingId.length) return marker.bindingId;
  }
  throw new Error('Binding has no metadata-bearing mapped item from which to recover binding identity');
}
export function identity(binding: IdentityBinding, mapping: Pick<EditableMapping, 'kind' | 'logicalId'>): Record<string, string> {
  const bindingId = binding.bindingId ?? editableBindingId(binding as EditableBinding);
  return {profile: binding.profile, resourceId: binding.resource.documentId, bindingId, logicalId: mapping.logicalId, kind: mapping.kind};
}
export function expectedMappings(plan: EditablePlan): {logicalId: string; kind: EditableKind; path: string}[] {
  return [
    ...(plan.title !== undefined ? [{logicalId: 'title', kind: 'title' as const, path: '/extensions/umf.visual/title'}] : []),
    {logicalId: 'question', kind: 'question', path: '/extensions/umf.visual/question'},
    ...plan.nodes.map(node => ({logicalId: node.logicalId, kind: 'node' as const, path: '/extensions/umf.visual/nodes/' + node.index + '/label'})),
    ...plan.edges.map(edge => ({logicalId: edge.logicalId, kind: 'edge' as const, path: '/extensions/umf.visual/edges/' + edge.index})),
    ...plan.groups.map(group => ({logicalId: group.logicalId, kind: 'group' as const, path: '/extensions/umf.visual/groups/' + group.index})),
  ];
}
export async function validateObservation(input: EditableObservation): Promise<EditableObservation> {
  const observation = await admitHostObservation(input) as EditableObservation;
  const payload = observation.payload as unknown as {items?: EditableSnapshot[]};
  requireEditable(Array.isArray(payload?.items) && payload.items.length <= 10_000, 'LIMIT', 'Invalid native capture size');
  const ids = new Set<string>();
  for (const item of payload.items) {
    requireEditable(record(item) && typeof item.id === 'string' && item.id.length > 0 && typeof item.type === 'string' && record(item.data), 'CAPTURE', 'Invalid native snapshot');
    requireEditable(item.data.id === item.id && item.data.type === item.type && !ids.has(item.id), 'CAPTURE', 'Native snapshot has duplicate/mismatched identity');
    requireEditable(item.metadata !== undefined, 'CAPTURE', 'Native metadata state is missing');
    ids.add(item.id);
  }
  return observation;
}
export function nativeCaptureLosses(observation: EditableObservation, mappings: EditableMapping[]): EditableLoss[] {
  const byNative = new Map(mappings.map(mapping => [mapping.nativeId, mapping]));
  const losses: EditableLoss[] = [];
  const add = (path: string, message: string) => losses.push({path, code: 'NATIVE_ONLY', family: 'native', representation: 'retained-only', message});
  for (const item of (observation.payload as unknown as {items: EditableSnapshot[]}).items) {
    const mapping = byNative.get(item.id);
    const itemPath = '/native/items/' + pointerSegment(item.id);
    if (!mapping) {
      add(itemPath, 'Native item is not mapped to an editable common slot; the full API-visible snapshot is retained in the binding.');
      continue;
    }
    const residual = nativeResidualData(item, mapping);
    if (Object.keys(residual).length) for (const path of jsonLeafPaths(residual, itemPath + '/data')) add(path, 'Native-only property is retained and preserved during native-preserving updates.');
    for (const path of item.omittedApiMembers ?? []) add(itemPath + '/omittedApiMembers' + path, 'SDK exposed a callable/non-JSON member; its path is recorded, but the member itself is not serializable.');
    if (record(item.metadata)) for (const key of Object.keys(item.metadata)) if (key !== MIRO_EDITABLE_METADATA_KEY) {
      for (const path of jsonLeafPaths(item.metadata[key], itemPath + '/metadata/' + pointerSegment(key))) add(path, 'Metadata owned by another Miro app is retained and is not interpreted by the editable profile.');
    }
    if (item.metadataCoverage === 'unsupported-for-item-type') add(itemPath + '/metadata', 'This item type does not expose app metadata; stable item identity relies on the bound native ID and capture digest.');
  }
  return losses.sort((left, right) => left.path.localeCompare(right.path));
}
export function nativeResidualData(snapshot: EditableSnapshot, mapping: EditableMapping): Record<string, import('@umf/core').Json> {
  const data = copyJson(snapshot.data) as Record<string, import('@umf/core').Json>;
  delete data.id; delete data.type;
  for (const key of Object.keys(data)) {
    if ((mapping.kind === 'group' && key === 'itemsIds') || (mapping.kind !== 'edge' && key === 'content')) {delete data[key]; continue;}
    const value = nonsemanticValue(mapping, key, data[key]!);
    if (value === undefined) delete data[key]; else data[key] = value;
  }
  return data;
}
function nonsemanticValue(mapping: EditableMapping, key: string, input: import('@umf/core').Json): import('@umf/core').Json | undefined {
  const value = copyJson(input);
  if (mapping.kind === 'edge' && (key === 'start' || key === 'end') && record(value)) {
    if (typeof value.item === 'string') delete value.item;
    return Object.keys(value).length ? value as import('@umf/core').Json : undefined;
  }
  if (mapping.kind === 'edge' && key === 'captions' && Array.isArray(value)) {
    const captions = value.map(caption => {if (record(caption) && typeof caption.content === 'string') delete caption.content; return caption;});
    return captions.length ? captions : undefined;
  }
  return value;
}
function jsonLeafPaths(value: import('@umf/core').Json, path: string): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => jsonLeafPaths(item, path + '/' + index));
  if (record(value)) {
    const keys = Object.keys(value);
    return keys.length ? keys.flatMap(key => jsonLeafPaths(value[key] as import('@umf/core').Json, path + '/' + pointerSegment(key))) : [path];
  }
  return [path];
}
function currentLabel(item: EditableSnapshot, kind: 'title' | 'question' | 'node'): string {
  requireEditable(item.type === 'shape', 'IDENTITY', 'Mapped text item changed native type');
  return plainContent(item.data.content);
}
function connectorCaption(item: EditableSnapshot): string {
  requireEditable(item.type === 'connector', 'IDENTITY', 'Mapped edge changed native type');
  const captions = item.data.captions;
  requireEditable(captions === undefined || (Array.isArray(captions) && captions.length <= 1), 'CAPTION', 'Editable profile supports at most one connector caption');
  if (!Array.isArray(captions) || captions.length === 0) return '';
  requireEditable(record(captions[0]), 'CAPTION', 'Invalid connector caption');
  return plainContent(captions[0].content);
}
function requireQualifiedConnector(item: EditableSnapshot): void {
  requireEditable(item.type === 'connector' && item.data.shape === 'straight', 'CONNECTOR', 'Editable connectors must remain straight Miro connectors');
  const style = item.data.style;
  requireEditable(record(style) && style.startStrokeCap === 'none' && style.endStrokeCap === 'stealth', 'CONNECTOR', 'Editable connectors must preserve the qualified start and end arrow caps');
}
function checkMappedRepresentation(binding: EditableBinding, mapping: EditableMapping, snapshot: EditableSnapshot, map: Map<string, string>): void {
  const visual = binding.source.extensions!['umf.visual'] as unknown as import('../../../extensions/visual/index.js').Visual;
  if (mapping.kind === 'title' || mapping.kind === 'question') {
    const expected = mapping.kind === 'title' ? visual.title : visual.question;
    requireEditable(expected !== undefined && currentLabel(snapshot, mapping.kind) === expected, 'BINDING', 'Baseline text does not reconstruct the bound source at ' + mapping.path);
  } else if (mapping.kind === 'node') {
    const node = visual.nodes!.find(candidate => candidate.id === mapping.logicalId);
    requireEditable(node && currentLabel(snapshot, mapping.kind) === node.label, 'BINDING', 'Baseline node does not reconstruct the bound source at ' + mapping.path);
  } else if (mapping.kind === 'edge') {
    const edge = visual.edges!.find(candidate => candidate.id === mapping.logicalId);
    requireEditable(edge, 'BINDING', 'Baseline connector does not reconstruct the bound source at ' + mapping.path);
    requireQualifiedConnector(snapshot);
    for (const side of ['start', 'end'] as const) {
      const field = side === 'start' ? 'from' : 'to', endpoint = edge[field];
      const nativeId = map.get('node:' + endpoint);
      requireEditable(record(snapshot.data[side]) && snapshot.data[side].item === nativeId, 'BINDING', 'Baseline connector endpoint differs from bound source');
    }
    requireEditable(connectorCaption(snapshot) === (edge.label ?? ''), 'BINDING', 'Baseline connector caption differs from bound source');
  } else {
    const group = visual.groups!.find(candidate => candidate.id === mapping.logicalId);
    requireEditable(group && snapshot.type === 'group', 'BINDING', 'Baseline native group is missing');
    const members = Array.isArray(snapshot.data.itemsIds) ? snapshot.data.itemsIds : [];
    const expected = visual.nodes!.filter(node => node.group === mapping.logicalId).map(node => map.get('node:' + node.id)).sort();
    requireEditable(expected.length >= 2 && canonical([...members].sort()) === canonical(expected), 'BINDING', 'Baseline group membership differs from bound source');
  }
}
export async function validateEditableBinding(input: EditableBinding): Promise<EditableBinding> {
  const binding = await admitHostBinding(input) as EditableBinding;
  requireEditable(binding.profile === MIRO_EDITABLE_PROFILE, 'BINDING', 'Unsupported editable profile');
  requireEditable(binding.modelVersion === '1.0.0' || binding.modelVersion === '1.1.0', 'BINDING', 'Unsupported bound model version');
  requireEditable(binding.resource?.host === 'miro' && typeof binding.resource.documentId === 'string' && binding.resource.documentId.length > 0, 'BINDING', 'Invalid bound Miro resource');
  requireEditable(Number.isSafeInteger(binding.bindingRevision) && binding.bindingRevision >= 0, 'BINDING', 'Invalid binding revision');
  requireEditable(['writing', 'interrupted', 'complete'].includes(binding.state), 'BINDING', 'Invalid binding state');
  const plan = await planEditableMiroExport(binding.source, 'report');
  requireEditable(plan.modelVersion === binding.modelVersion, 'BINDING', 'Bound model version differs from source');
  requireEditable(await hostDigest(binding.source) === binding.sourceDigestSha256, 'BINDING', 'Bound source digest differs from source content');
  requireEditable(canonical(plan.losses) === canonical(binding.losses.filter(loss => loss.family === 'semantic')), 'BINDING', 'Semantic loss inventory differs from bound source');
  const observation = await validateObservation(binding.baselineNative);
  requireEditable(canonical(observation.resource) === canonical(binding.resource), 'BINDING', 'Baseline resource differs from binding resource');
  requireEditable(Array.isArray(binding.mappings) && Array.isArray(binding.losses), 'BINDING', 'Missing mapping or loss inventory');
  const expected = new Map(expectedMappings(plan).map(mapping => [editableMappingKey(mapping), mapping]));
  const logical = new Set<string>(), native = new Set<string>();
  for (const mapping of binding.mappings) {
    requireEditable(record(mapping) && typeof mapping.logicalId === 'string' && typeof mapping.nativeId === 'string' && mapping.nativeId.length > 0 && typeof mapping.nativeScope === 'string' && mapping.nativeScope === binding.resource.documentId, 'BINDING', 'Invalid native mapping');
    const key = editableMappingKey(mapping), wanted = expected.get(key);
    requireEditable(wanted && mapping.path === wanted.path && !logical.has(key) && !native.has(mapping.nativeId), 'IDENTITY', 'Mappings are not bijective or do not match expected slots');
    logical.add(key); native.add(mapping.nativeId);
  }
  const observationItems = (observation.payload as unknown as {items: EditableSnapshot[]}).items;
  const snapshots = new Map(observationItems.map(item => [item.id, item]));
  const byLogical = new Map(binding.mappings.map(mapping => [editableMappingKey(mapping), mapping.nativeId]));
  const bindingId = editableBindingId(binding);
  requireEditable(bindingId.length <= 128, 'BINDING', 'Invalid binding identity metadata');
  for (const mapping of binding.mappings) {
    const snapshot = snapshots.get(mapping.nativeId);
    requireEditable(snapshot, 'IDENTITY', 'Mapped native item is missing from the baseline');
    if (mapping.kind === 'group') requireEditable(snapshot.type === 'group', 'IDENTITY', 'Mapped group has the wrong native type');
    else {
      const marker = record(snapshot.metadata) ? snapshot.metadata[MIRO_EDITABLE_METADATA_KEY] : undefined;
      requireEditable(record(marker) && canonicalHostJson(marker) === canonicalHostJson(identity({...binding, bindingId}, mapping)), 'IDENTITY', 'Mapped native metadata does not match binding identity');
      requireEditable(snapshot.metadataCoverage !== 'unsupported-for-item-type', 'IDENTITY', 'Mapped item does not expose the metadata used for stable identity');
    }
    checkMappedRepresentation(binding, mapping, snapshot, byLogical);
  }
  const actualNativeLosses = nativeCaptureLosses(observation, binding.mappings);
  const retainedLosses = binding.losses.filter(loss => loss.family === 'native');
  requireEditable(actualNativeLosses.every(loss => retainedLosses.some(retained => canonical(retained) === canonical(loss))), 'BINDING', 'Native-only loss inventory omits a current retained field');
  if (binding.state === 'complete') requireEditable(!binding.pending && logical.size === expected.size && native.size === expected.size, 'BINDING', 'Complete binding has missing mappings or pending writes');
  requireEditable(new TextEncoder().encode(JSON.stringify(binding)).byteLength <= 16_000_000, 'LIMIT', 'Editable binding exceeds 16 MiB');
  return binding;
}
export function makeMapping(binding: Pick<EditableBinding, 'resource'>, slot: {logicalId: string; kind: string; path: string}, nativeId: string): EditableMapping {
  return {...slot, nativeId, nativeScope: binding.resource.documentId};
}
export function sourceDocument(binding: EditableBinding): Document {return copyJson(binding.source);}
