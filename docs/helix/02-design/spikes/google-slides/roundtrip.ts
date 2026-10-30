// SPDX-License-Identifier: MIT OR Apache-2.0
// Adapter-owned flow/network round trip. Native JSON remains an opaque retained source.
import {readVisualDocument, getVisual, editVisual, inspectVisual} from '../../../../../src/index';
import type {planSlides, Box, Placement} from './prototype';
type Plan = Awaited<ReturnType<typeof planSlides>>;
type Native = Record<string, any>;
export type Binding = {plan: Plan; baseline: Native; presentationId: string; sourceDigest: string};
async function digest(source: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}
function point(value: number, unit: string) {
  if (!Number.isFinite(value) || !['PT', 'EMU'].includes(unit)) throw Error('Unsupported native dimension');
  return value / (unit === 'EMU' ? 12700 : 1);
}
function geometry(element: Native): Box {
  const t = element.transform, s = element.size;
  if (!t || !s || t.shearX || t.shearY || !(t.scaleX > 0) || !(t.scaleY > 0))
    throw Error('Rotation/reflection/shear needs another native layout profile');
  return {x: point(t.translateX ?? 0, t.unit), y: point(t.translateY ?? 0, t.unit),
    width: point(s.width.magnitude, s.width.unit) * t.scaleX,
    height: point(s.height.magnitude, s.height.unit) * t.scaleY};
}
function text(element: Native) {
  if (!element.shape) throw Error('Mapped text object is no longer a shape');
  const runs = element.shape.text?.textElements ?? [];
  if (runs.some((r: Native) => r.autoText)) throw Error('Dynamic native text is unsupported');
  const content = runs.map((r: Native) => r.textRun?.content ?? '').join('');
  // A Slides shape has a structural final newline. Preserve user-entered newlines.
  return content.endsWith('\n') ? content.slice(0, -1) : content;
}
function projection(plan: Plan, native: Native) {
  const slides = native.slides?.filter((s: Native) => s.objectId === plan.slideId);
  if (slides?.length !== 1) throw Error('Mapped slide missing or duplicated');
  const elements = new Map<string, Native>();
  for (const e of slides[0].pageElements ?? []) {
    if (elements.has(e.objectId)) throw Error('Duplicate native object identity');
    elements.set(e.objectId, e);
  }
  const expected = [plan.questionId, ...Object.values(plan.sidecar.identity).flat()];
  if (elements.size !== expected.length || expected.some(id => !elements.has(id)))
    throw Error('Native object addition/deletion/grouping requires explicit structural reconciliation');
  const visual = getVisual(readVisualDocument(plan.sidecar.source, 'json'));
  const nodeByNative = new Map(visual.nodes!.map(n => [plan.sidecar.identity[n.id]![0]!, n.id]));
  function shape(id: string, kind: string) {
    const e = elements.get(id)!;
    if (e.shape?.shapeType !== kind) throw Error('Native shape kind changed');
    return e;
  }
  const placement: Placement = {page: {width: point(native.pageSize.width.magnitude, native.pageSize.width.unit),
    height: point(native.pageSize.height.magnitude, native.pageSize.height.unit)},
    question: geometry(shape(plan.questionId, 'TEXT_BOX')), nodes: {}, labels: {}};
  visual.question = text(shape(plan.questionId, 'TEXT_BOX'));
  for (const node of visual.nodes!) {
    const element = shape(plan.sidecar.identity[node.id]![0]!, 'RECTANGLE');
    node.label = text(element); placement.nodes[node.id] = geometry(element);
  }
  for (const edge of visual.edges ?? []) {
    const ids = plan.sidecar.identity[edge.id]!;
    const line = elements.get(ids[0]!)!.line;
    if (!line || line.lineCategory !== 'STRAIGHT') throw Error('Unsupported connector kind');
    const p = line.lineProperties;
    if (p.endArrow !== 'FILL_ARROW' || (p.startArrow && p.startArrow !== 'NONE'))
      throw Error('Arrow meaning changed outside this profile');
    const from = nodeByNative.get(p.startConnection?.connectedObjectId), to = nodeByNative.get(p.endConnection?.connectedObjectId);
    if (!from || !to || from === to) throw Error('Unmapped/detached/self connector');
    edge.from = from; edge.to = to;
    if (ids[1]) {
      edge.label = text(shape(ids[1], 'TEXT_BOX'));
      placement.labels![edge.id] = geometry(shape(ids[1], 'TEXT_BOX'));
    }
  }
  for (const b of [placement.question, ...Object.values(placement.nodes), ...Object.values(placement.labels!)])
    if (b.x < 0 || b.y < 0 || b.width <= 0 || b.height <= 0 ||
        b.x + b.width > placement.page.width + 0.1 || b.y + b.height > placement.page.height + 0.1)
      throw Error('Native geometry outside the investigated page');
  return {visual, placement};
}

export async function bindRoundTrip(plan: Plan, baseline: Native): Promise<Binding> {
  if (!baseline.presentationId || !baseline.revisionId) throw Error('Full native presentation identity/revision required');
  const actual = projection(plan, baseline).visual;
  const original = getVisual(readVisualDocument(plan.sidecar.source, 'json'));
  if (JSON.stringify(actual) !== JSON.stringify(original)) throw Error('Export readback differs from source semantics');
  return {plan: structuredClone(plan), baseline: structuredClone(baseline),
    presentationId: baseline.presentationId, sourceDigest: await digest(plan.sidecar.source)};
}

export async function importSlidesEdits(binding: Binding, native: Native, currentSource = binding.plan.sidecar.source) {
  if (await digest(currentSource) !== binding.sourceDigest) throw Error('UMF source changed since export; merge required');
  if (native.presentationId !== binding.presentationId || !native.revisionId) throw Error('Wrong presentation or missing revision');
  const projected = projection(binding.plan, native);
  const document = editVisual(readVisualDocument(currentSource, 'json'), () => projected.visual);
  if (!inspectVisual(document).complete) throw Error('Imported document is incomplete');
  // Styles, notes, layout/master data and unknown native fields stay in full snapshots.
  // These are explicitly retained only; they are never inferred as semantic metadata.
  return {document, placement: projected.placement, native: structuredClone(native),
    baseline: structuredClone(binding.baseline), presentationId: binding.presentationId,
    revisionId: native.revisionId, report: [{path: '/', code: 'NATIVE_RETAINED',
      message: 'Only question/node/edge text and directed endpoints project into umf.visual; native appearance and other content remain in snapshots/placement'}]};
}
