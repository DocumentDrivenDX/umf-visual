// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document, Json} from '@umf/core';
import {inspectVisual, type Visual} from '../../extensions/visual/index.js';
import {canonical, jsonCopy, plainLabel, record, requireMiro} from './json.js';
import {connectorLabel, identity, validateCapture, validateMiroBundle} from './bundle.js';
import {MIRO_PROFILE, type MiroBundle, type MiroCapture, type MiroImportResult, type MiroSnapshot} from './types.js';

/** Pure atomic adoption of labels/question/endpoints; never writes to the board. */
export function reconcileMiroVisual(input: MiroBundle, current: Document, observed: MiroCapture): MiroImportResult {
  const bundle = validateMiroBundle(input), capture = validateCapture(observed);
  requireMiro(bundle.state === 'complete', 'INCOMPLETE', 'Interrupted writes require manual recovery before import');
  requireMiro(capture.boardId === bundle.boardId, 'BOARD', 'Capture belongs to a different board');
  requireMiro(canonical(current) === canonical(bundle.source), 'STALE_SOURCE', 'UMF source changed since this companion revision');
  checkIdentity(bundle, capture);
  const document = jsonCopy(bundle.source), changes: MiroImportResult['changes'] = [];
  const v = document.extensions!['umf.visual'] as unknown as Visual;
  const nativeOnly: string[] = [];
  for (const m of bundle.mappings) {
    const item = capture.items.find(item => item.id === m.nativeId)!;
    const baseline = bundle.baseline.find(item => item.id === m.nativeId)!;
    if (m.kind === 'edge') adoptEdge(bundle, v, m.logicalId, item, changes);
    else {
      const label = plainLabel(item.data.content);
      if (m.kind === 'question') change(v as unknown as Record<string, Json>, 'question', label, '/extensions/umf.visual/question', changes);
      else {
        const i = v.nodes!.findIndex(n => n.id === m.logicalId);
        change(v.nodes![i]! as unknown as Record<string, Json>, 'label', label, `/extensions/umf.visual/nodes/${i}/label`, changes);
      }
    }
    if (canonical(nativeFields(item)) !== canonical(nativeFields(baseline))) nativeOnly.push(item.id);
  }
  requireMiro(!changes.length || inspectVisual(bundle.source).complete, 'UNSAFE_EDIT', 'Unknown semantics must be understood before adopting semantic edits');
  requireMiro(inspectVisual(document).valid, 'VISUAL_INVALID', 'Imported edits violate visual semantics');
  const next = jsonCopy(bundle);
  next.source = jsonCopy(document);
  next.baseline = bundle.mappings.map(m => jsonCopy(capture.items.find(i => i.id === m.nativeId)!));
  // All adapter losses remain explicit after an edit; paths are stable in this subset.
  return {document, original: jsonCopy(bundle.source), bundle: validateMiroBundle(next), capture, changes, nativeOnly, unmapped: capture.items.filter(item => !bundle.mappings.some(m => m.nativeId === item.id)).map(item => item.id)};
}
function checkIdentity(bundle: MiroBundle, capture: MiroCapture): void {
  for (const item of capture.items) {
    const hint = item.metadata;
    if (record(hint) && hint.profile === MIRO_PROFILE && hint.exportId === bundle.exportId) {
      const m = bundle.mappings.find(m => m.nativeId === item.id);
      requireMiro(m && canonical(hint) === canonical(identity(bundle, m)), 'IDENTITY', 'Copied, added or changed export identity');
    }
  }
  for (const m of bundle.mappings) {
    const item = capture.items.find(i => i.id === m.nativeId);
    requireMiro(item && canonical(item.metadata) === canonical(identity(bundle, m)), 'IDENTITY', 'Mapped item is missing or metadata changed');
    requireMiro(item.type === (m.kind === 'edge' ? 'connector' : 'shape'), 'SUBSET', 'Mapped item type changed');
  }
}
function adoptEdge(bundle: MiroBundle, v: Visual, logicalId: string, item: MiroSnapshot, changes: MiroImportResult['changes']): void {
  const i = v.edges!.findIndex(edge => edge.id === logicalId), edge = v.edges![i]!;
  const target = edge as unknown as Record<string, Json>;
  for (const side of ['start', 'end'] as const) {
    const endpoint = item.data[side];
    const node = record(endpoint) && bundle.mappings.find(m => m.kind === 'node' && m.nativeId === endpoint.item);
    requireMiro(node, 'ENDPOINT', 'Connector endpoint must attach to a mapped node');
    const field = side === 'start' ? 'from' : 'to';
    change(target, field, node.logicalId, `/extensions/umf.visual/edges/${i}/${field}`, changes);
  }
  const caption = connectorLabel(item);
  if (edge.label !== undefined || caption !== '') change(target, 'label', caption, `/extensions/umf.visual/edges/${i}/label`, changes);
}
function change(target: Record<string, Json>, field: string, value: Json, path: string, changes: MiroImportResult['changes']): void {
  if (target[field] === value) return;
  changes.push({path, before: target[field] ?? null, after: value}); target[field] = value;
}
function nativeFields(item: MiroSnapshot): unknown {
  const {content, start, end, captions, ...other} = item.data;
  // Endpoint attachment geometry and caption styling are native-only too.
  return {...other,
    ...(record(start) ? {start: Object.fromEntries(Object.entries(start).filter(([k]) => k !== 'item'))} : {}),
    ...(record(end) ? {end: Object.fromEntries(Object.entries(end).filter(([k]) => k !== 'item'))} : {}),
    ...(Array.isArray(captions) ? {captions: captions.map(c => record(c) ? Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'content')) : c)} : {}),
  };
}
