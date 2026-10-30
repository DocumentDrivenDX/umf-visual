// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson, record, requireEditable} from './json.js';
import {canonicalHostJson, hostDigest} from '../../reconciliation/json.js';
import type {EditableMiroBoard, EditableMiroGroup, EditableMiroItem, EditableObservation, EditableResource, EditableSnapshot, NativeRevision, RevisionProvider} from './types.js';

const sdkProperties = ['content', 'shape', 'x', 'y', 'width', 'height', 'rotation', 'origin', 'relativeTo', 'parentId', 'groupId', 'style', 'start', 'end', 'captions', 'connectorIds', 'linkedTo', 'itemsIds', 'createdAt', 'modifiedAt', 'createdBy', 'modifiedBy', 'title', 'description'];

function sdkValue(value: unknown, path: string, omitted: string[], stack = new Set<object>(), depth = 0): import('@umf/core').Json {
  requireEditable(depth <= 64, 'LIMIT', 'SDK JSON exceeds depth 64 at ' + path);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {requireEditable(Number.isFinite(value), 'INPUT', 'SDK returned non-finite JSON at ' + path); return value;}
  requireEditable(typeof value === 'object' && value !== null, 'INPUT', 'SDK returned non-JSON value at ' + path);
  requireEditable(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, 'INPUT', 'SDK returned a non-plain object at ' + path);
  requireEditable(!stack.has(value), 'INPUT', 'SDK returned a cyclic object at ' + path); stack.add(value);
  let result: import('@umf/core').Json;
  if (Array.isArray(value)) result = value.map((child, index) => sdkValue(child, path + '/' + index, omitted, stack, depth + 1));
  else {
    const object: Record<string, import('@umf/core').Json> = Object.create(null);
    for (const [key, child] of Object.entries(value)) {
      const childPath = path + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1');
      if (child === undefined || typeof child === 'function') {omitted.push(childPath); continue;}
      object[key] = sdkValue(child, childPath, omitted, stack, depth + 1);
    }
    result = object;
  }
  stack.delete(value); return result;
}

async function snapshot(item: EditableMiroItem | EditableMiroGroup): Promise<EditableSnapshot> {
  requireEditable(typeof item.id === 'string' && item.id.length > 0 && typeof item.type === 'string', 'NATIVE_ID', 'SDK items require string id and type');
  const source = item as unknown as Record<string, unknown>, keys = new Set([...Object.keys(source), ...sdkProperties]);
  const omittedApiMembers: string[] = [], data: Record<string, import('@umf/core').Json> = Object.create(null);
  data.id = item.id; data.type = item.type;
  for (const key of keys) {
    if (key === 'id' || key === 'type' || key === 'getMetadata' || key === 'setMetadata' || key === 'sync' || key === 'getItems' || key === 'ungroup') continue;
    const value = source[key];
    if (value === undefined || typeof value === 'function') {if (value !== undefined) omittedApiMembers.push('/' + key); continue;}
    data[key] = sdkValue(value, '/' + key, omittedApiMembers);
  }
  const metadataItem = item as EditableMiroItem;
  let metadata: import('@umf/core').Json = null, metadataCoverage: 'unsupported-for-item-type' | undefined;
  if (typeof metadataItem.getMetadata === 'function') {
    try {
      const value = await metadataItem.getMetadata();
      if (value !== undefined && value !== null) metadata = copyJson(value) as import('@umf/core').Json;
    } catch (error) {
      if (/specified command is unsupported: [A-Za-z]+\.getMetadata\(\)/.test(String(error))) metadataCoverage = 'unsupported-for-item-type';
      else throw error;
    }
  } else metadataCoverage = 'unsupported-for-item-type';
  if (omittedApiMembers.length) omittedApiMembers.sort();
  return {id: item.id, type: item.type, data, metadata, ...(omittedApiMembers.length ? {omittedApiMembers} : {}), ...(metadataCoverage ? {metadataCoverage} : {})};
}

export async function captureEditableMiroBoard(board: EditableMiroBoard, revisionProvider?: RevisionProvider): Promise<EditableObservation> {
  const before = await board.getInfo();
  requireEditable(typeof before.id === 'string' && before.id.length > 0, 'RESOURCE', 'Miro SDK did not return a board identity');
  const revisionBefore = revisionProvider ? await revisionProvider() : undefined;
  const items = await board.get();
  requireEditable(items.length <= 10_000, 'LIMIT', 'Editable profile capture exceeds 10,000 native objects');
  const snapshots: EditableSnapshot[] = [];
  for (const item of items) {
    const captured = await snapshot(item);
    if (item.type === 'group' && !Array.isArray(captured.data.itemsIds) && typeof (item as EditableMiroGroup).getItems === 'function') {
      const members = await (item as EditableMiroGroup).getItems!();
      captured.data.itemsIds = members.map(member => member.id).sort();
    }
    snapshots.push(captured);
  }
  snapshots.sort((left, right) => left.id.localeCompare(right.id));
  for (let index = 1; index < snapshots.length; index++) requireEditable(snapshots[index - 1]!.id !== snapshots[index]!.id, 'IDENTITY', 'Miro SDK capture contains duplicate native IDs');
  const after = await board.getInfo();
  requireEditable(after.id === before.id, 'RESOURCE', 'Board identity changed during capture');
  const payload = {items: snapshots};
  const captureDigestSha256 = await hostDigest(payload);
  let revision: NativeRevision;
  if (revisionProvider) {
    const revisionAfter = await revisionProvider();
    requireEditable(canonicalHostJson(revisionBefore) === canonicalHostJson(revisionAfter), 'CONCURRENT_EDIT', 'Host revision changed during capture');
    requireEditable(revisionAfter && ['host-revision', 'content-digest'].includes(revisionAfter.kind) && typeof revisionAfter.value === 'string' && revisionAfter.value.length > 0, 'REVISION', 'Revision provider must return a qualified revision token');
    revision = copyJson(revisionAfter);
  } else revision = {kind: 'content-digest', value: captureDigestSha256};
  const resource: EditableResource = {host: 'miro', documentId: before.id};
  const observation = {resource, revision, captureDigestSha256, payload: payload as unknown as import('@umf/core').Json};
  requireEditable(new TextEncoder().encode(JSON.stringify(observation)).byteLength <= 16_000_000, 'LIMIT', 'Editable observation exceeds 16 MiB');
  return copyJson(observation);
}

export function snapshotRecord(observation: EditableObservation): Map<string, EditableSnapshot> {
  const payload = observation.payload as unknown as {items: EditableSnapshot[]};
  return new Map(payload.items.map(item => [item.id, item]));
}
