// SPDX-License-Identifier: MIT OR Apache-2.0
// Vocabulary feasibility controls only; no Miro API calls or adapter implementation.
import {test, expect} from 'bun:test';
import {
  createVisualDocument, inspectVisual, editVisual, getVisual,
  readVisualDocument, writeVisualDocument, type Visual,
} from '../../../../../src/index.ts';

const graph = (): Visual => ({
  id: 'miro-probe', kind: 'flow', form: 'network',
  question: 'What calls the API?',
  nodes: [{id: 'n-1', label: 'Client'}, {id: 'n-2', label: 'API'}],
  edges: [{id: 'e-1', from: 'n-1', to: 'n-2', label: 'Request'}],
});

test('candidate two-node semantic projection validates and round-trips', () => {
  const doc = createVisualDocument(graph());
  expect(inspectVisual(doc).complete).toBe(true);
  for (const format of ['json', 'yaml'] as const) {
    expect(readVisualDocument(writeVisualDocument(doc, format), format)).toEqual(doc);
  }
});

test('raw Miro-style numeric IDs need an explicit identity map', () => {
  const v = graph();
  // Synthetic identifier: its spelling is valid for a board item, but too long
  // to represent exactly as a JavaScript Number. Keep it as a string.
  const nativeId = '3458764512345678901';
  v.nodes![0].id = nativeId;
  v.edges![0].from = nativeId;
  expect(() => createVisualDocument(v)).not.toThrow();
  v.nodes![0].id = 'Board:Item/A';
  v.edges![0].from = 'Board:Item/A';
  expect(() => createVisualDocument(v)).toThrow();
});

test('sixteen-node selection cannot silently become a fifteen-node visual', () => {
  const v = graph();
  v.nodes = Array.from({length: 16}, (_, i) => ({id: `n-${i}`, label: `Node ${i}`}));
  v.edges = [];
  expect(() => createVisualDocument(v)).toThrow();
});

test('duplicated logical IDs and missing endpoints refuse projection', () => {
  const v = graph();
  v.nodes![1].id = v.nodes![0].id;
  expect(() => createVisualDocument(v)).toThrow();
  const dangling = graph();
  dangling.edges![0].to = 'outside-selection';
  expect(() => createVisualDocument(dangling)).toThrow();
});

test('adding native coordinates to semantic nodes preserves but blocks safe edits', () => {
  const doc = createVisualDocument(graph());
  const payload = doc.extensions!['umf.visual'] as unknown as Visual;
  Object.assign(payload.nodes![0], {x: 42, nativeFuture: {opaque: ['keep', 7]}});
  expect(inspectVisual(doc).complete).toBe(false);
  const reread = readVisualDocument(writeVisualDocument(doc, 'json'), 'json');
  expect(getVisual(reread)).toEqual(payload);
  expect(() => editVisual(reread, v => v)).toThrow();
});
