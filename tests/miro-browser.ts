// SPDX-License-Identifier: MIT OR Apache-2.0
import {createVisualDocument, getVisual, readVisualDocument, writeVisualDocument} from '../src/index.js';
import {createMiroDocument, readMiroDocument, writeMiroDocument, getMiroCapture, exportMiroVisual, importMiroVisual, readMiroBundle, writeMiroBundle} from '../src/adapters/miro/index.js';
import {TestBoard} from './miro/fake-board.js';

export async function exerciseMiroBrowser() {
  const source = createVisualDocument({id: 'browser-miro', kind: 'flow', form: 'network', question: 'Who calls whom?',
    nodes: [{id: 'a', label: 'Client'}, {id: 'b', label: 'API'}, {id: 'c', label: 'Worker'}],
    edges: [{id: 'ab', from: 'a', to: 'b', label: 'Call'}]});
  const board = new TestBoard();
  const bundle = await exportMiroVisual(board, source, {exportId: 'browser-1'});
  board.items[1]!.content = '<p>Browser edited &amp; saved</p>';
  board.items[4]!.end = {item: board.items[3]!.id, snapTo: 'auto'};
  const result = await importMiroVisual(board, readMiroBundle(writeMiroBundle(bundle)), source);
  if (getVisual(result.document).nodes![0]!.label !== 'Browser edited & saved' || getVisual(result.document).edges![0]!.to !== 'c') throw Error('Miro import lost native edits');
  for (const format of ['json', 'yaml'] as const) {
    if (JSON.stringify(readVisualDocument(writeVisualDocument(result.document, format), format)) !== JSON.stringify(result.document)) throw Error('Miro edit serialization mismatch');
  }
  if ((await importMiroVisual(board, result.bundle, result.document)).changes.length) throw Error('Miro revision was not reusable');
  const native = createMiroDocument(result.capture);
  for (const format of ['json', 'yaml'] as const) {
    if (JSON.stringify(getMiroCapture(readMiroDocument(writeMiroDocument(native, format), format)).capture) !== JSON.stringify(result.capture)) throw Error('Native extension capture changed');
  }
  return {nativeExtension: true, roundTrip: true, semanticChanges: result.changes.length, sdk: 'in-memory-test-double', liveMiro: false};
}
