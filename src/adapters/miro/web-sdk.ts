// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document, Json} from '@umf/core';
import {identity, validateCapture, validateMiroBundle} from './bundle.js';
import {canonical, escapeLabel, jsonCopy, MiroAdapterError, record, requireMiro} from './json.js';
import {sdkJson} from './sdk-json.js';
import {planMiroExport} from './plan.js';
import {reconcileMiroVisual} from './reconcile.js';
import {MIRO_METADATA_KEY, MIRO_PROFILE, type MiroBoard, type MiroBundle, type MiroCapture,
  type MiroExportOptions, type MiroItem, type MiroMapping, type MiroSnapshot} from './types.js';

const capturedProperties = ['id', 'type', 'content', 'shape', 'x', 'y', 'width', 'height', 'rotation',
  'origin', 'relativeTo', 'parentId', 'groupId', 'style', 'start', 'end', 'captions',
  'createdAt', 'modifiedAt', 'createdBy', 'modifiedBy', 'connectorIds', 'linkedTo'];

async function snapshot(item: MiroItem): Promise<MiroSnapshot> {
  requireMiro(typeof item.id === 'string' && item.id.length && typeof item.type === 'string', 'NATIVE_ID', 'SDK must return string identities');
  const data = item as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(item), ...capturedProperties]);
  const fields: [string, Json][] = [], omittedApiMembers: string[] = [];
  for (const key of keys) {
    const value = data[key];
    if (value !== undefined && typeof value !== 'function') fields.push([key, sdkJson(value, '/' + key, omittedApiMembers)]);
  }
  let metadata: unknown = null, metadataCoverage: 'unsupported-for-item-type' | undefined;
  if (item.getMetadata) {
    try {metadata = await item.getMetadata(MIRO_METADATA_KEY);}
    catch (error) {
      if (!/specified command is unsupported: [A-Za-z]+\.getMetadata\(\)/.test(String(error))) throw error;
      metadataCoverage = 'unsupported-for-item-type';
    }
  }
  return {id: item.id, type: item.type, data: Object.fromEntries(fields), metadata: jsonCopy(metadata ?? null) as Json, ...(omittedApiMembers.length ? {omittedApiMembers} : {}), ...(metadataCoverage ? {metadataCoverage} : {})};
}

/** Captures API-visible JSON, not a native board backup or atomic board snapshot. */
export async function captureMiroBoard(board: MiroBoard, options: {experimentalShapes?: boolean} = {}): Promise<MiroCapture> {
  const before = await board.getInfo();
  let items = await board.get();
  if (options.experimentalShapes) {
    requireMiro(board.experimental, 'SDK_MODE', 'Experimental shape API is unavailable');
    const expanded = await board.experimental.get({type: 'shape'});
    const byId = new Map(items.map(item => [item.id, item]));
    for (const item of expanded) byId.set(item.id, item);
    items = [...byId.values()];
  }
  requireMiro(items.length <= 10000, 'LIMIT', 'Capture exceeds 10000 API-visible items');
  const snapshots: MiroSnapshot[] = [];
  // Sequential calls keep SDK traffic bounded and fail on unreadable metadata.
  for (const item of items) snapshots.push(await snapshot(item));
  requireMiro((await board.getInfo()).id === before.id, 'BOARD', 'Board changed during capture');
  snapshots.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return validateCapture({boardId: before.id, items: snapshots, coverage: 'api-visible-items', ...(options.experimentalShapes ? {sdkMode: 'experimental-shapes' as const} : {})});
}

/** Each call is a new export. Failed writes MUST be reconciled manually, never replayed blindly. */
export async function exportMiroVisual(board: MiroBoard, document: Document, options: MiroExportOptions): Promise<MiroBundle> {
  const plan = planMiroExport(document, options.mode);
  requireMiro(typeof options.exportId === 'string' && options.exportId.length > 0 && options.exportId.length <= 128, 'EXPORT_ID', 'Supply a unique export ID, 1–128 characters');
  const observed = await captureMiroBoard(board);
  requireMiro(observed.items.length + plan.shapes.length + plan.connectors.length <= 10000, 'LIMIT', 'Export would exceed capture capacity');
  for (const item of observed.items) {
    requireMiro(!record(item.metadata) || item.metadata.profile !== MIRO_PROFILE || item.metadata.exportId !== options.exportId, 'EXPORT_EXISTS', 'Export ID already exists on this board');
  }
  const bundle: MiroBundle = {profile: MIRO_PROFILE, boardId: observed.boardId, exportId: options.exportId,
    source: plan.source, mode: plan.mode, losses: plan.losses, mappings: [], baseline: [], state: 'writing'};
  const checkpoint = async () => { await options.checkpoint?.(jsonCopy(bundle)); };
  try {
    await checkpoint();
    for (const shape of plan.shapes) {
      await createMapped(board, bundle, {logicalId: shape.logicalId, kind: shape.kind},
        () => board.createShape(shape.input), checkpoint);
    }
    for (const edge of plan.connectors) {
      const nativeId = (logicalId: string) => bundle.mappings.find(m => m.kind === 'node' && m.logicalId === logicalId)!.nativeId;
      await createMapped(board, bundle, {logicalId: edge.logicalId, kind: 'edge'}, () => board.createConnector({
        shape: 'straight', start: {item: nativeId(edge.from), snapTo: 'auto'}, end: {item: nativeId(edge.to), snapTo: 'auto'},
        captions: edge.label === undefined ? [] : [{content: escapeLabel(edge.label), position: 0.5}],
        style: {startStrokeCap: 'none', endStrokeCap: 'stealth'},
      }), checkpoint);
    }
    bundle.state = 'complete';
    validateMiroBundle(bundle);
    await checkpoint();
    return jsonCopy(bundle);
  } catch (cause) {
    bundle.state = 'interrupted';
    const error = new MiroAdapterError('WRITE_INTERRUPTED', 'Export interrupted. Keep the receipt; reconcile partial/uncertain writes before another export.', jsonCopy(bundle));
    error.cause = cause;
    throw error;
  }
}

async function createMapped(board: MiroBoard, bundle: MiroBundle, logical: Omit<MiroMapping, 'nativeId'>,
  create: () => Promise<MiroItem>, checkpoint: () => Promise<void>): Promise<void> {
  requireMiro((await board.getInfo()).id === bundle.boardId, 'BOARD', 'Wrong board');
  bundle.pending = {...logical}; await checkpoint();
  const item = await create();
  requireMiro(typeof item.id === 'string' && item.id.length, 'NATIVE_ID', 'Native identity must be a string');
  bundle.pending.nativeId = item.id;
  const mapping = {...logical, nativeId: item.id};
  bundle.mappings.push(mapping); await checkpoint();
  requireMiro(item.setMetadata, 'METADATA', 'Created item does not support metadata');
  await item.setMetadata(MIRO_METADATA_KEY, identity(bundle, mapping));
  bundle.baseline.push(await snapshot(item));
  delete bundle.pending; await checkpoint();
}

/** Two reads detect observed concurrent edits; Miro does not supply a board transaction. */
export async function importMiroVisual(board: MiroBoard, bundle: MiroBundle, current: Document) {
  const safeBundle = validateMiroBundle(bundle), safeCurrent = jsonCopy(current);
  const first = await captureMiroBoard(board);
  const result = reconcileMiroVisual(safeBundle, safeCurrent, first);
  const second = await captureMiroBoard(board);
  requireMiro(canonical(current) === canonical(safeCurrent), 'STALE_SOURCE', 'UMF source changed during import');
  requireMiro(canonical(first) === canonical(second), 'CONCURRENT_EDIT', 'Board changed during import; capture again');
  return result;
}
