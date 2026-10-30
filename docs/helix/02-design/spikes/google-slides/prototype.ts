// SPDX-License-Identifier: MIT OR Apache-2.0
// Experimental request planner. No authentication, network, layout engine or public export.
import {readVisualDocument, getVisual, inspectVisual} from '../../../../../src/index';

export type Box = {x: number; y: number; width: number; height: number};
export type Placement = {
  page: {width: number; height: number};
  question: Box;
  nodes: Record<string, Box>;
  labels?: Record<string, Box>;
};
export type Loss = {path: string; reason: string};
type Request = Record<string, unknown>;
const escape = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1');

export async function planSlides(source: string, placement: Placement, options: {
  namespace: string; revision: string; mode?: 'strict' | 'report';
}) {
  if (!/^[a-zA-Z][a-zA-Z0-9_]{4,15}$/.test(options.namespace) || !options.revision.trim())
    throw Error('A safe namespace and current target revision are required');
  const document = readVisualDocument(source, 'json');
  const inspection = inspectVisual(document);
  const visual = getVisual(document);
  if (!inspection.valid || !inspection.complete) throw Error('Incomplete or invalid visual');
  if (visual.kind !== 'flow' || visual.form !== 'network') throw Error('Only flow/network is investigated');
  if (!Number.isFinite(placement.page.width) || !Number.isFinite(placement.page.height) ||
      placement.page.width <= 0 || placement.page.height <= 0) throw Error('Invalid target page size');
  const losses: Loss[] = [];
  function residual(value: object, allowed: string[], base: string) {
    for (const key of Object.keys(value)) if (!allowed.includes(key))
      losses.push({path: base + '/' + escape(key), reason: 'Retained in sidecar; no native semantic mapping'});
  }
  residual(document, ['umf', 'id', 'vocabularies', 'extensions', 'modules'], '');
  if (document.modules.length) losses.push({path: '/modules', reason: 'Modules are retained only'});
  for (const key of Object.keys(document.extensions ?? {})) if (key !== 'umf.visual')
    losses.push({path: '/extensions/' + escape(key), reason: 'Other extensions are retained only'});
  const base = '/extensions/umf.visual';
  residual(visual, ['id', 'kind', 'form', 'question', 'nodes', 'edges'], base);
  // All semantic metadata absent from Slides is explicit, even when the source is retained.
  visual.nodes!.forEach((node, i) => residual(node, ['id', 'label'], base + '/nodes/' + i));
  (visual.edges ?? []).forEach((edge, i) => residual(edge, ['id', 'from', 'to', 'label'], base + '/edges/' + i));
  if (options.mode !== 'report' && losses.length) throw Error('Strict export refuses residual meaning');

  const identity: Record<string, string[]> = {};
  async function objectId(role: string, id: string) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([visual.id, role, id])));
    const hash = Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
    return options.namespace + '_' + role + '_' + hash;
  }
  const slideId = await objectId('s', visual.id);
  const requests: Request[] = [{createSlide: {objectId: slideId, slideLayoutReference: {predefinedLayout: 'BLANK'}}}];
  function box(id: string, boxes: Record<string, Box> | undefined): Box {
    if (!boxes || !Object.hasOwn(boxes, id)) throw Error('Missing placement: ' + id);
    const value = boxes[id]!;
    if (![value.x, value.y, value.width, value.height].every(Number.isFinite) || value.width <= 0 || value.height <= 0 ||
        value.x < 0 || value.y < 0 || value.x + value.width > placement.page.width ||
        value.y + value.height > placement.page.height) throw Error('Invalid placement: ' + id);
    return value;
  }
  function properties(b: Box) {
    return {pageObjectId: slideId, size: {width: {magnitude: b.width, unit: 'PT'}, height: {magnitude: b.height, unit: 'PT'}},
      transform: {scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, translateX: b.x, translateY: b.y, unit: 'PT'}};
  }
  function shape(id: string, b: Box, label: string, shapeType: string) {
    // Google strips some control characters and private-use characters on insertion.
    if (/[\u0000-\u001f\u007f-\u009f\ue000-\uf8ff]|[\u{f0000}-\u{ffffd}\u{100000}-\u{10fffd}]/u.test(label))
      throw Error('Text outside the investigated insertion subset');
    requests.push({createShape: {objectId: id, shapeType, elementProperties: properties(b)}});
    if (label) requests.push({insertText: {objectId: id, text: label, insertionIndex: 0}});
  }
  const questionId = await objectId('q', visual.id);
  shape(questionId, box('question', {question: placement.question}), visual.question, 'TEXT_BOX');
  for (const node of visual.nodes!) {
    const id = await objectId('n', node.id);
    identity[node.id] = [id];
    shape(id, box(node.id, placement.nodes), node.label, 'RECTANGLE');
  }
  for (const edge of visual.edges ?? []) {
    const id = await objectId('e', edge.id);
    identity[edge.id] = [id];
    const a = box(edge.from, placement.nodes), b = box(edge.to, placement.nodes);
    const x = a.x + a.width / 2, y = a.y + a.height / 2;
    const dx = b.x + b.width / 2 - x, dy = b.y + b.height / 2 - y;
    if (dx === 0 && dy === 0) throw Error('Self/coincident connectors need a routing profile');
    requests.push({createLine: {objectId: id, category: 'STRAIGHT', elementProperties: {
      pageObjectId: slideId, size: {width: {magnitude: 1, unit: 'PT'}, height: {magnitude: 1, unit: 'PT'}},
      transform: {scaleX: dx, scaleY: dy, shearX: 0, shearY: 0, translateX: x, translateY: y, unit: 'PT'},
    }}});
    requests.push({updateLineProperties: {objectId: id, lineProperties: {
      startConnection: {connectedObjectId: identity[edge.from]![0], connectionSiteIndex: 0},
      endConnection: {connectedObjectId: identity[edge.to]![0], connectionSiteIndex: 0}, endArrow: 'FILL_ARROW',
    }, fields: 'startConnection,endConnection,endArrow'}});
    if (edge.label) {
      const labelId = await objectId('l', edge.id);
      identity[edge.id]!.push(labelId);
      shape(labelId, box(edge.id, placement.labels), edge.label, 'TEXT_BOX');
    }
  }
  const allIds = [slideId, questionId, ...Object.values(identity).flat()];
  if (new Set(allIds).size !== allIds.length) throw Error('Generated object ID collision');
  return {
    profile: 'google-slides-v1-flow-network-spike/0.1',
    slideId, questionId, batch: {requests, writeControl: {requiredRevisionId: options.revision}},
    sidecar: {source, identity, losses, placement: structuredClone(placement)},
  };
}
