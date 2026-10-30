// SPDX-License-Identifier: MIT OR Apache-2.0
import {test, expect} from 'bun:test';
import {createVisualDocument} from '../../src/index.js';
import {captureMiroBoard, exportMiroVisual, recoverMiroExport} from '../../src/adapters/miro/index.js';
import {sdkJson} from '../../src/adapters/miro/sdk-json.js';
import {TestBoard} from './fake-board.js';

test('SDK endpoint undefined fields and callable members are recorded without losing opaque JSON', () => {
  const omitted: string[] = [];
  expect(sdkJson({item: '1', position: undefined, sync() {}, future: {opaque: [1, true]}}, '/end', omitted))
    .toEqual({item: '1', future: {opaque: [1, true]}});
  expect(omitted).toEqual(['/end/position', '/end/sync']);
  expect(() => sdkJson({value: Infinity}, '', [])).toThrow('Non-finite');
});
test('recovery verifies every existing item and metadata, never creates or retries', async () => {
  const board = new TestBoard();
  const source = createVisualDocument({id: 'recovery', kind: 'flow', form: 'network', question: 'What connects?',
    nodes: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}], edges: [{id: 'ab', from: 'a', to: 'b'}]});
  const complete = await exportMiroVisual(board, source, {exportId: 'recovery'});
  const interrupted = structuredClone(complete); interrupted.state = 'interrupted';
  interrupted.pending = {logicalId: 'ab', kind: 'edge', nativeId: complete.mappings.at(-1)!.nativeId};
  interrupted.baseline.pop();
  const capture = await captureMiroBoard(board), calls = board.calls;
  expect(recoverMiroExport(interrupted, capture).state).toBe('complete');
  expect(board.calls).toBe(calls); expect(interrupted.state).toBe('interrupted');
  const changed = structuredClone(capture); changed.items[1]!.data.content = 'Native edit';
  expect(() => recoverMiroExport(interrupted, changed)).toThrow('Baseline label');
  const missing = structuredClone(capture); missing.items.pop();
  expect(() => recoverMiroExport(interrupted, missing)).toThrow('missing');
});
