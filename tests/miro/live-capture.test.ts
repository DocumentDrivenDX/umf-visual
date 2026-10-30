// SPDX-License-Identifier: MIT OR Apache-2.0
import {test, expect} from 'bun:test';
import fixture from './fixtures/live-edited-network.json';
import {reconcileMiroVisual, readMiroBundle, attachMiroCapture, getMiroCapture, type MiroCapture} from '../../src/adapters/miro/index.js';
import {readVisualDocument, writeVisualDocument, getVisual} from '../../src/index.js';
test('sanitized live Miro edited revision reimports unchanged and retains new unmapped connector', () => {
  const bundle = readMiroBundle(JSON.stringify(fixture.bundle));
  const capture = fixture.capture as unknown as MiroCapture;
  const result = reconcileMiroVisual(bundle, bundle.source, capture);
  expect(getVisual(result.document).nodes![0]!.label).toBe('Edited in Miro');
  expect(result.changes).toEqual([]); expect(result.unmapped).toHaveLength(1);
  expect(capture.items.some(i => i.omittedApiMembers?.includes('/end/position'))).toBe(true);
  const doc = attachMiroCapture(result.document, capture, bundle.mappings);
  for (const format of ['json', 'yaml'] as const) {
    const restored = readVisualDocument(writeVisualDocument(doc, format), format);
    expect(getMiroCapture(restored).capture).toEqual(capture);
  }
});

test('clean live export completed and its actual Miro label edit is a reusable UMF revision', async () => {
  const {default: clean} = await import('./fixtures/live-clean-roundtrip.json');
  const bundle = readMiroBundle(JSON.stringify(clean.bundle));
  expect(bundle.state).toBe('complete');
  expect(getVisual(bundle.source).nodes![0]!.label).toBe('Final proof edited in Miro');
  const result = reconcileMiroVisual(bundle, bundle.source, {boardId: bundle.boardId, coverage: 'api-visible-items', items: bundle.baseline});
  expect(result.changes).toEqual([]);
});
