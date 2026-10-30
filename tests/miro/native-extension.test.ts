// SPDX-License-Identifier: MIT OR Apache-2.0
import {test, expect} from 'bun:test';
import {validateDocument} from '@umf/core';
import {createVisualDocument, readVisualDocument, writeVisualDocument} from '../../src/index.js';
import {attachMiroCapture, getMiroCapture, miroRegistry, MIRO_NATIVE_EXTENSION} from '../../src/adapters/miro/index.js';
import type {MiroCapture} from '../../src/adapters/miro/index.js';
const source = () => createVisualDocument({id: 'native', kind: 'flow', form: 'network', question: 'How does this connect?', nodes: [{id: 'one', label: 'One'}]});
const capture = (): MiroCapture => ({boardId: 'board', coverage: 'api-visible-items', items: [
  {id: 'native-1', type: 'shape', metadata: {future: [1, 'two']}, data: {id: 'native-1', type: 'shape', content: '<b>One</b>', x: 17, style: {future: {value: 42}}}},
  {id: 'native-2', type: 'future-widget', metadata: null, data: {id: 'native-2', type: 'future-widget', opaque: [{nested: true}]}},
]});
test('native extension retains opaque JSON through UMF JSON and YAML without changing source', () => {
  const doc = source(), before = structuredClone(doc), native = capture();
  const result = attachMiroCapture(doc, native, [{logicalId: 'one', nativeId: 'native-1', kind: 'node'}]);
  expect(doc).toEqual(before);
  for (const format of ['json', 'yaml'] as const) {
    const restored = readVisualDocument(writeVisualDocument(result, format), format);
    expect(getMiroCapture(restored).capture).toEqual(native);
    expect(getMiroCapture(restored).reproduction).toBe('capture-only');
    expect(validateDocument(restored, miroRegistry()).valid).toBe(true);
  }
  native.items[0]!.data.x = 99;
  expect(getMiroCapture(result).capture.items[0]!.data.x).toBe(17);
});
test('capture refresh retains future extension fields, refuses version upgrades and bad mappings', () => {
  const doc = attachMiroCapture(source(), capture());
  (doc.extensions![MIRO_NATIVE_EXTENSION] as any).future = {opaque: ['keep']};
  const next = attachMiroCapture(doc, capture());
  expect((next.extensions![MIRO_NATIVE_EXTENSION] as any).future).toEqual({opaque: ['keep']});
  expect(() => attachMiroCapture(source(), capture(), [{logicalId: 'one', nativeId: 'missing', kind: 'node'}])).toThrow('dangling');
  doc.vocabularies[MIRO_NATIVE_EXTENSION]!.version = '2.0.0';
  expect(() => attachMiroCapture(doc, capture())).toThrow('upgrade');
});
