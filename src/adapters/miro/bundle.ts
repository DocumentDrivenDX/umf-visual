// SPDX-License-Identifier: MIT OR Apache-2.0
import {getVisual} from '../../extensions/visual/index.js';
import {canonical, jsonCopy, plainLabel, record, requireMiro, MiroAdapterError} from './json.js';
import {planMiroExport} from './plan.js';
import {MIRO_PROFILE, type MiroBundle, type MiroCapture, type MiroMapping, type MiroSnapshot} from './types.js';

export function mappingKey(m: Pick<MiroMapping, 'kind' | 'logicalId'>): string {
  return m.kind + ':' + m.logicalId;
}
export function identity(bundle: MiroBundle, mapping: MiroMapping) {
  return {profile: MIRO_PROFILE, boardId: bundle.boardId, exportId: bundle.exportId,
    visualId: getVisual(bundle.source).id, logicalId: mapping.logicalId, kind: mapping.kind};
}
export function validateCapture(input: MiroCapture): MiroCapture {
  const capture = jsonCopy(input);
  requireMiro(record(capture) && typeof capture.boardId === 'string' && capture.boardId.length && capture.coverage === 'api-visible-items' && Array.isArray(capture.items), 'CAPTURE', 'Invalid capture');
  requireMiro(capture.items.length <= 10000, 'LIMIT', 'Capture exceeds 10000 API-visible items');
  const ids = new Set<string>();
  for (const item of capture.items) {
    requireMiro(record(item) && typeof item.id === 'string' && item.id.length && typeof item.type === 'string' && record(item.data), 'CAPTURE', 'Invalid snapshot');
    requireMiro(item.data.id === item.id && item.data.type === item.type && !ids.has(item.id), 'CAPTURE', 'Snapshot identity mismatch or duplicate');
    requireMiro(item.metadata !== undefined, 'CAPTURE', 'Missing metadata capture');
    ids.add(item.id);
  }
  return capture;
}
export function validateMiroBundle(input: MiroBundle): MiroBundle {
  const bundle = jsonCopy(input);
  requireMiro(record(bundle) && bundle.profile === MIRO_PROFILE, 'BUNDLE', 'Unsupported companion profile');
  requireMiro(typeof bundle.boardId === 'string' && bundle.boardId.length && typeof bundle.exportId === 'string' && bundle.exportId.length <= 128 && bundle.exportId.length > 0, 'BUNDLE', 'Invalid board/export identity');
  requireMiro(['writing', 'interrupted', 'complete'].includes(bundle.state), 'BUNDLE', 'Invalid operation state');
  const plan = planMiroExport(bundle.source, bundle.mode);
  requireMiro(canonical(bundle.losses) === canonical(plan.losses), 'BUNDLE', 'Loss inventory differs from source');
  requireMiro(Array.isArray(bundle.mappings) && Array.isArray(bundle.baseline), 'BUNDLE', 'Missing mappings or baseline');
  const expected = new Map([
    ...plan.shapes.map(s => [s.kind + ':' + s.logicalId, 'shape'] as const),
    ...plan.connectors.map(c => ['edge:' + c.logicalId, 'connector'] as const),
  ]);
  const native = new Set<string>(), logical = new Set<string>();
  for (const m of bundle.mappings) {
    requireMiro(record(m) && typeof m.nativeId === 'string' && m.nativeId.length && expected.has(mappingKey(m)), 'BUNDLE', 'Invalid mapped item');
    requireMiro(!native.has(m.nativeId) && !logical.has(mappingKey(m)), 'IDENTITY', 'Mapping is not bijective');
    native.add(m.nativeId); logical.add(mappingKey(m));
  }
  const baseline = validateCapture({boardId: bundle.boardId, coverage: 'api-visible-items', items: bundle.baseline});
  for (const item of baseline.items) {
    const m = bundle.mappings.find(m => m.nativeId === item.id);
    requireMiro(m && item.type === expected.get(mappingKey(m)), 'BUNDLE', 'Baseline type or identity mismatch');
    requireMiro(canonical(item.metadata) === canonical(identity(bundle, m)), 'IDENTITY', 'Baseline metadata mismatch');
    if (bundle.state === 'complete') assertBaseline(bundle, m, item);
  }
  if (bundle.state === 'complete') {
    requireMiro(!bundle.pending && logical.size === expected.size && baseline.items.length === expected.size, 'BUNDLE', 'Incomplete export receipt');
  }
  return bundle;
}
function assertBaseline(bundle: MiroBundle, m: MiroMapping, item: MiroSnapshot): void {
  const v = getVisual(bundle.source);
  if (m.kind !== 'edge') {
    const label = m.kind === 'question' ? v.question : v.nodes!.find(n => n.id === m.logicalId)!.label;
    requireMiro(plainLabel(item.data.content) === label, 'BUNDLE', 'Baseline label differs from source');
    return;
  }
  const edge = v.edges!.find(e => e.id === m.logicalId)!;
  for (const side of ['start', 'end'] as const) {
    const logicalId = side === 'start' ? edge.from : edge.to;
    const id = bundle.mappings.find(m => m.kind === 'node' && m.logicalId === logicalId)?.nativeId;
    requireMiro(record(item.data[side]) && item.data[side].item === id, 'BUNDLE', 'Baseline endpoint differs from source');
  }
  requireMiro(connectorLabel(item) === (edge.label ?? ''), 'BUNDLE', 'Baseline caption differs from source');
}
export function connectorLabel(item: MiroSnapshot): string {
  const captions = item.data.captions;
  requireMiro(captions === undefined || (Array.isArray(captions) && captions.length <= 1), 'CAPTION', 'Only one connector caption is supported');
  if (!Array.isArray(captions) || captions.length === 0) return '';
  requireMiro(record(captions[0]), 'CAPTION', 'Invalid caption');
  return plainLabel(captions[0].content);
}
export function writeMiroBundle(bundle: MiroBundle): string {
  return JSON.stringify(validateMiroBundle(bundle), null, 2) + '\n';
}
export function readMiroBundle(text: string): MiroBundle {
  requireMiro(typeof text === 'string' && text.length <= 16_000_000, 'LIMIT', 'Companion exceeds 16 million character text limit');
  let input: MiroBundle;
  try {input = JSON.parse(text) as MiroBundle;}
  catch {throw new MiroAdapterError('BUNDLE', 'Companion is not valid JSON');}
  return validateMiroBundle(input);
}
