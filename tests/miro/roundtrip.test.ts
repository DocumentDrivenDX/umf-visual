// SPDX-License-Identifier: MIT OR Apache-2.0
import {test, expect} from 'bun:test';
import {createVisualDocument, getVisual, readVisualDocument, writeVisualDocument} from '../../src/index.js';
import {captureMiroBoard, exportMiroVisual, importMiroVisual, reconcileMiroVisual, planMiroExport,
  readMiroBundle, writeMiroBundle, MiroAdapterError, type MiroBundle} from '../../src/adapters/miro/index.js';
import {TestBoard, TestItem} from './fake-board.js';

const document = () => createVisualDocument({id: 'roundtrip', kind: 'flow', form: 'network', question: 'What calls the API?',
  nodes: [{id: 'client', label: 'Client <browser> & user'}, {id: 'api', label: 'API'}, {id: 'worker', label: 'Worker'}],
  edges: [{id: 'request', from: 'client', to: 'api', label: 'Request'}]});

async function fixture() {
  const board = new TestBoard(), source = document();
  const bundle = await exportMiroVisual(board, source, {exportId: 'run-1'});
  const item = (id: string, kind = 'node') => board.items.find(i => {
    const hint = i.metadata as {logicalId: string; kind: string}; return hint.logicalId === id && hint.kind === kind;
  })!;
  return {board, source, bundle, item};
}

test('export → edit native labels/question/connection → import → JSON/YAML → second round trip', async () => {
  const {board, source, bundle, item} = await fixture();
  const original = JSON.stringify(source), beforeBundle = JSON.stringify(bundle);
  expect(item('client').content).toBe('Client &lt;browser&gt; &amp; user');
  item('client').content = '<p>Browser &amp; operator</p>';
  item('roundtrip', 'question').content = 'What calls the worker?';
  item('request', 'edge').captions = [{content: '<p>Dispatch</p>', position: 0.5}];
  item('request', 'edge').end = {item: item('worker').id, snapTo: 'left'};
  item('api').x = 900; item('api').futureStyle = {vendor: ['keep', 42]};
  const result = await importMiroVisual(board, bundle, source);
  expect(getVisual(result.document).question).toBe('What calls the worker?');
  expect(getVisual(result.document).nodes![0]!.label).toBe('Browser & operator');
  expect(getVisual(result.document).edges![0]).toEqual({id: 'request', from: 'client', to: 'worker', label: 'Dispatch'});
  expect(result.changes).toHaveLength(4);
  expect(result.nativeOnly).toContain(item('api').id);
  expect(result.capture.items.find(i => i.id === item('api').id)!.data.futureStyle).toEqual({vendor: ['keep', 42]});
  expect(JSON.stringify(source)).toBe(original); expect(JSON.stringify(bundle)).toBe(beforeBundle);
  expect(result.original).toEqual(source);
  for (const format of ['json', 'yaml'] as const) expect(readVisualDocument(writeVisualDocument(result.document, format), format)).toEqual(result.document);
  const nextBundle = readMiroBundle(writeMiroBundle(result.bundle));
  expect((await importMiroVisual(board, nextBundle, result.document)).changes).toEqual([]);
  item('worker').content = 'Edited again';
  const second = await importMiroVisual(board, nextBundle, result.document);
  expect(getVisual(second.document).nodes![2]!.label).toBe('Edited again');
});

test('native-only movement and unknown JSON survive without semantic guesses', async () => {
  const {board, source, bundle, item} = await fixture();
  item('client').x = 777; item('client').parentId = 'native-frame'; item('client').relativeTo = 'parent_top_left';
  item('client').style = {fillColor: '#f00', unknown: {value: 9}};
  board.items.push(new TestItem('unrelated-table', 'unsupported', {x: 1, y: 2}));
  const result = await importMiroVisual(board, bundle, source);
  expect(result.document).toEqual(source); expect(result.changes).toEqual([]);
  expect(result.capture.items).toHaveLength(6);
  expect(result.unmapped).toEqual(['unrelated-table']);
  expect(result.nativeOnly).toEqual([item('client').id]);
});

test('strict refuses invisible meaning before writing; report preserves source and paths', async () => {
  const board = new TestBoard(), source = document();
  (source.extensions!['umf.visual'] as any).nodes[0].role = 'actor';
  expect(() => planMiroExport(source)).toThrow('Strict export');
  expect(board.calls).toBe(0);
  const bundle = await exportMiroVisual(board, source, {exportId: 'report', mode: 'report'});
  expect(bundle.losses.map(l => l.path)).toEqual(['/extensions/umf.visual/nodes/0/role']);
  board.items[1]!.content = 'Updated actor';
  const result = await importMiroVisual(board, bundle, source);
  expect(getVisual(result.document).nodes![0]!.role).toBe('actor');
  expect(getVisual(result.document).nodes![0]!.label).toBe('Updated actor');
});

test('unknown semantics recover but cannot be edited accidentally', async () => {
  const board = new TestBoard(), source = document();
  (source.extensions!['umf.visual'] as any).future = {meaning: ['preserve', 2]};
  const bundle = await exportMiroVisual(board, source, {exportId: 'unknown', mode: 'report'});
  expect(readMiroBundle(writeMiroBundle(bundle)).source).toEqual(source);
  expect((await importMiroVisual(board, bundle, source)).document).toEqual(source);
  board.items[1]!.content = 'Unsafe edit';
  await expect(importMiroVisual(board, bundle, source)).rejects.toMatchObject({code: 'UNSAFE_EDIT'});
});

test('stale source, wrong board, metadata copy and item deletion all refuse atomically', async () => {
  const {board, source, bundle, item} = await fixture();
  const changed = structuredClone(source); (changed.extensions!['umf.visual'] as any).takeaway = 'Local edit';
  await expect(importMiroVisual(board, bundle, changed)).rejects.toMatchObject({code: 'STALE_SOURCE'});
  board.id = 'other'; await expect(importMiroVisual(board, bundle, source)).rejects.toMatchObject({code: 'BOARD'}); board.id = 'test-board';
  const duplicate = new TestItem('copy', 'shape', {content: 'Copy'}); duplicate.metadata = structuredClone(item('client').metadata); board.items.push(duplicate);
  await expect(importMiroVisual(board, bundle, source)).rejects.toMatchObject({code: 'IDENTITY'}); board.items.pop();
  board.items.splice(board.items.indexOf(item('api')), 1);
  await expect(importMiroVisual(board, bundle, source)).rejects.toMatchObject({code: 'IDENTITY'});
});

test('unmapped endpoints, formatting and multiple captions refuse rather than flatten', async () => {
  const {board, source, bundle, item} = await fixture();
  const edge = item('request', 'edge'), saved = structuredClone(edge.end);
  edge.end = {item: 'outside'};
  await expect(importMiroVisual(board, bundle, source)).rejects.toMatchObject({code: 'ENDPOINT'}); edge.end = saved;
  item('api').content = '<b>API</b>';
  await expect(importMiroVisual(board, bundle, source)).rejects.toMatchObject({code: 'RICH_TEXT'}); item('api').content = 'API';
  edge.captions = [{content: 'one'}, {content: 'two'}];
  await expect(importMiroVisual(board, bundle, source)).rejects.toMatchObject({code: 'CAPTION'});
});

test('interrupted writes retain known IDs and uncertain operation; no automatic replay', async () => {
  const board = new TestBoard(); board.failAt = 3;
  const checkpoints: MiroBundle[] = [];
  try {
    await exportMiroVisual(board, document(), {exportId: 'failure', checkpoint: b => {checkpoints.push(b);}});
    throw Error('Expected interruption');
  } catch (e) {
    expect(e).toBeInstanceOf(MiroAdapterError);
    const error = e as MiroAdapterError;
    expect(error.code).toBe('WRITE_INTERRUPTED'); expect(error.receipt!.pending).toEqual({kind: 'node', logicalId: 'api'});
    expect(error.receipt!.state).toBe('interrupted'); expect(board.calls).toBe(3);
    expect(readMiroBundle(writeMiroBundle(error.receipt!)).mappings).toHaveLength(2);
    expect(checkpoints[0]!.mappings).toHaveLength(0);
  }
  await expect(exportMiroVisual(board, document(), {exportId: 'failure'})).rejects.toMatchObject({code: 'EXPORT_EXISTS'});
});

test('tampered companions, duplicate captures, invalid native IDs and concurrent observations refuse', async () => {
  const {board, source, bundle} = await fixture();
  const bad = structuredClone(bundle); bad.mappings[1]!.nativeId = bad.mappings[0]!.nativeId;
  expect(() => readMiroBundle(JSON.stringify(bad))).toThrow();
  const changed = structuredClone(bundle); (changed.source.extensions!['umf.visual'] as any).nodes[0].label = 'Tampered';
  expect(() => readMiroBundle(JSON.stringify(changed))).toThrow('Baseline label');
  const capture = await captureMiroBoard(board); capture.items.push(capture.items[0]!);
  expect(() => reconcileMiroVisual(bundle, source, capture)).toThrow();
  const get = board.get.bind(board); let reads = 0;
  board.get = async () => {if (++reads === 2) board.items[1]!.x = 999; return get();};
  await expect(importMiroVisual(board, bundle, source)).rejects.toMatchObject({code: 'CONCURRENT_EDIT'});
});

test('unsupported source and non-string native IDs fail without silent coercion', async () => {
  const source = document();
  (source.extensions!['umf.visual'] as any).nodes = Array.from({length: 16}, (_, i) => ({id: 'n-' + i, label: 'Node'}));
  const board = new TestBoard();
  await expect(exportMiroVisual(board, source, {exportId: 'too-large'})).rejects.toMatchObject({code: 'VISUAL_INVALID'});
  expect(board.calls).toBe(0);
  board.createShape = async props => {
    const item = new TestItem('temporary', 'shape', props);
    (item as any).id = 3458764512345678901;
    return item;
  };
  await expect(exportMiroVisual(board, document(), {exportId: 'bad-id'})).rejects.toMatchObject({code: 'WRITE_INTERRUPTED', cause: {code: 'NATIVE_ID'}});
});

test('checkpoint failure and ambiguous native content preserve interrupted journals', async () => {
  const board = new TestBoard();
  await expect(exportMiroVisual(board, document(), {exportId: 'checkpoint', checkpoint: () => {throw Error('Disk unavailable');}})).rejects.toMatchObject({code: 'WRITE_INTERRUPTED'});
  expect(board.calls).toBe(0);
  const create = board.createShape.bind(board);
  board.createShape = async props => {const item = await create(props); item.content = '<b>Native formatting</b>'; return item;};
  try {
    await exportMiroVisual(board, document(), {exportId: 'formatting'});
    throw Error('Expected native content refusal');
  } catch (error) {
    const receipt = (error as MiroAdapterError).receipt!;
    expect(receipt.state).toBe('interrupted');
    expect(readMiroBundle(writeMiroBundle(receipt)).baseline[0]!.data.content).toBe('<b>Native formatting</b>');
  }
});

test('input mutation during SDK reads cannot overwrite a newer source', async () => {
  const {board, source, bundle} = await fixture();
  const get = board.get.bind(board); let reads = 0;
  board.get = async () => {if (++reads === 2) (source.extensions!['umf.visual'] as any).question = 'Changed locally'; return get();};
  await expect(importMiroVisual(board, bundle, source)).rejects.toMatchObject({code: 'STALE_SOURCE'});
});
