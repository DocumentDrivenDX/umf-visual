// SPDX-License-Identifier: MIT OR Apache-2.0
import {test, expect} from 'bun:test';
import {createMiroDocument, readMiroDocument, writeMiroDocument, getMiroClipboard, attachMiroCapture,
  MIRO_CLIPBOARD_PROFILE, captureMiroBoard, type MiroCapture, type MiroNativeClipboard} from '../../src/adapters/miro/index.js';
import {TestBoard, TestItem} from './fake-board.js';
const capture = (): MiroCapture => ({boardId: 'source', coverage: 'api-visible-items', sdkMode: 'experimental-shapes', items: [
  {id: 'one', type: 'stencil', data: {id: 'one', type: 'stencil', x: 2, y: 3}, metadata: null},
]});
const clipboard = (): MiroNativeClipboard => ({profile: MIRO_CLIPBOARD_PROFILE, sourceBoardId: 'source', client: 'test-only', coverage: 'selection' as const,
  html: '<span data-meta="opaque-test-fixture"><strong>Native payload &amp; unknown data</strong></span>', text: 'test'});
test('opaque native clipboard survives native-only UMF JSON/YAML without fabricated visual semantics', () => {
  const doc = createMiroDocument(capture(), clipboard());
  expect(doc.extensions!['umf.visual']).toBeUndefined();
  for (const format of ['json', 'yaml'] as const) {
    const restored = readMiroDocument(writeMiroDocument(doc, format), format);
    expect(getMiroClipboard(restored)).toEqual(clipboard());
  }
  const refreshed = attachMiroCapture(doc, capture());
  expect(() => getMiroClipboard(refreshed)).toThrow('no native clipboard');
  expect(() => createMiroDocument(capture(), {...clipboard(), sourceBoardId: 'elsewhere'})).toThrow('differ');
  expect(() => createMiroDocument(capture(), {...clipboard(), html: '<b>Not a native envelope</b>'})).toThrow('data-meta');
});
test('experimental shape capture expands stable stencils and qualifies unavailable frame metadata', async () => {
  const board = new TestBoard();
  const stencil = new TestItem('one', 'stencil', {x: 1});
  const frame = new TestItem('frame', 'frame', {x: 2});
  frame.getMetadata = async () => {throw Error('The specified command is unsupported: Frame.getMetadata(), or handlers did not return value');};
  board.items = [stencil, frame];
  board.experimental = {get: async () => [new TestItem('one', 'shape', {shape: 'flow_chart_document', content: 'Document'})]};
  const result = await captureMiroBoard(board, {experimentalShapes: true});
  expect(result.sdkMode).toBe('experimental-shapes');
  expect(result.items.find(i => i.id === 'one')!.data.content).toBe('Document');
  expect(result.items.find(i => i.id === 'frame')!.metadataCoverage).toBe('unsupported-for-item-type');
  frame.getMetadata = async () => {throw Error('Access denied');};
  await expect(captureMiroBoard(board)).rejects.toThrow('Access denied');
});
