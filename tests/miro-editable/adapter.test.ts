// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {createVisualDocument, getVisual, inspectVisual, type Visual} from '../../src/extensions/visual/index.js';
import {EditableMiroError, captureEditableMiroBoard, exportEditableMiroVisual, importEditableMiroVisual, planEditableMiroExport,
  readEditableMiroBinding, updateEditableMiroVisual, validateEditableBinding, writeEditableMiroBinding} from '../../src/adapters/miro/editable/index.js';
import {FakeMiroBoard, FakeMiroItem} from './fake-board.js';
import type {EditableBinding, EditableMiroItem} from '../../src/adapters/miro/editable/types.js';

const flow = () => createVisualDocument({id: 'editable-flow', kind: 'flow', form: 'network', title: 'Request path', question: 'What reaches the store?',
  nodes: [{id: 'client', label: 'Client'}, {id: 'service', label: 'Service'}, {id: 'store', label: 'Store'}],
  edges: [{id: 'request', from: 'client', to: 'service', label: 'sends'}, {id: 'write', from: 'service', to: 'store', label: 'writes'}]});
function itemFor(board: FakeMiroBoard, binding: EditableBinding, kind: string, logicalId: string): FakeMiroItem {
  const mapping = binding.mappings.find(value => value.kind === kind && value.logicalId === logicalId)!;
  return board.items.find(value => value.id === mapping.nativeId)!;
}
function mutableVisual(document: ReturnType<typeof flow>): Visual {return document.extensions!['umf.visual'] as unknown as Visual;}
function appendGroup(source: ReturnType<typeof flow>): void {
  const visual = mutableVisual(source);
  visual.groups = [{id: 'zone', label: 'Service zone', role: 'boundary'}];
  visual.nodes!.find(node => node.id === 'service')!.group = 'zone';
  visual.nodes!.find(node => node.id === 'store')!.group = 'zone';
}

test('strict plan qualifies simple network fields and report mode names retained semantic gaps', async () => {
  const source = flow();
  expect((await planEditableMiroExport(source)).losses).toEqual([]);
  const extended = structuredClone(source);
  const visual = extended.extensions!['umf.visual'] as any;
  visual.nodes[0].role = 'actor';
  visual.edges[0].kind = 'data';
  const plan = await planEditableMiroExport(extended, 'report');
  expect(plan.losses.map(loss => loss.path)).toEqual(['/extensions/umf.visual/nodes/0/role', '/extensions/umf.visual/edges/0/kind']);
  await expect(planEditableMiroExport(extended)).rejects.toMatchObject({code: 'RENDER_LOSS'});
});

test('create, adopt native edits, serialize binding and preserve movement/style/unknown items', async () => {
  const board = new FakeMiroBoard(), source = flow();
  const unrelated = board.addUnrelated();
  const binding = await exportEditableMiroVisual(board, source, {bindingId: 'synthetic-export-1'});
  expect(binding.profile).toBe('umf.visual.miro.editable-network/1');
  expect(binding.modelVersion).toBe('1.0.0');
  expect(binding.state).toBe('complete');
  expect(binding.losses.some(loss => loss.path === '/native/items/unrelated-native' && loss.family === 'native')).toBe(true);
  expect(getVisual(binding.source)).toEqual(getVisual(source));
  expect((await readEditableMiroBinding(await writeEditableMiroBinding(binding))).source).toEqual(source);

  const title = itemFor(board, binding, 'title', 'title'), question = itemFor(board, binding, 'question', 'question');
  const client = itemFor(board, binding, 'node', 'client'), service = itemFor(board, binding, 'node', 'service');
  const request = itemFor(board, binding, 'edge', 'request');
  title.content = '<p>Adjusted request path</p>';
  question.content = 'Which service receives requests?';
  client.content = 'Web client';
  request.captions = [{content: 'invokes', position: 0.4, customCaptionStyle: {color: 'purple'}}];
  request.end = {item: service.id, snapTo: 'top', customEndpointField: 5};
  client.x = 832; client.rotation = 17; client.style = {fillColor: '#ffcc00', extensionStyle: {tag: 'kept'}};
  (client as Record<string, unknown>).futureNativeField = {preserve: true};
  const nativeOnly = unrelated;
  const imported = await importEditableMiroVisual(board, binding, source, 0);
  const visual = getVisual(imported.document);
  expect(visual.title).toBe('Adjusted request path');
  expect(visual.question).toBe('Which service receives requests?');
  expect(visual.nodes!.find(node => node.id === 'client')!.label).toBe('Web client');
  expect(visual.edges!.find(edge => edge.id === 'request')).toEqual({id: 'request', from: 'client', to: 'service', label: 'invokes'});
  expect(imported.changes.map(change => change.path)).toEqual([
    '/extensions/umf.visual/title', '/extensions/umf.visual/question',
    '/extensions/umf.visual/nodes/0/label', '/extensions/umf.visual/edges/0/label'
  ]);
  expect(imported.nativeOnly).toContain('/native/items/' + client.id);
  expect(imported.nativeOnly).not.toContain('/native/items/' + nativeOnly.id);
  expect(imported.unmapped).toContain(nativeOnly.id);
  expect((imported.observation.payload as any).items.find((row: any) => row.id === client.id).data.futureNativeField).toEqual({preserve: true});
  expect(imported.binding.bindingRevision).toBe(1);
  expect(imported.binding.losses.some(loss => loss.path.includes(client.id) && loss.family === 'native')).toBe(true);
  expect(inspectVisual(imported.document).valid).toBe(true);
});

test('native-preserving update patches only owned content and endpoint slots', async () => {
  const board = new FakeMiroBoard(), source = flow(), binding = await exportEditableMiroVisual(board, source, {bindingId: 'update-binding'});
  const client = itemFor(board, binding, 'node', 'client'), edge = itemFor(board, binding, 'edge', 'request');
  client.x = 777; client.rotation = 34; client.style = {fillColor: '#abc'};
  (client as Record<string, unknown>).unknownStyle = {opaque: 'preserve'};
  const before = structuredClone(client);
  const nextDocument = structuredClone(source), visual = mutableVisual(nextDocument);
  visual.title = 'Updated title';
  visual.question = 'Where does the request go?';
  visual.nodes!.find(node => node.id === 'client')!.label = 'Browser client';
  visual.edges!.find(item => item.id === 'request')!.label = 'dispatches';
  visual.edges!.find(item => item.id === 'request')!.to = 'store';
  const next = await updateEditableMiroVisual(board, binding, source, nextDocument, {expectedBindingRevision: 0});
  expect(next.bindingRevision).toBe(1);
  expect(client.content).toBe('Browser client');
  expect(client.x).toBe(before.x);
  expect(client.rotation).toBe(before.rotation);
  expect(client.style).toEqual(before.style);
  expect((client as Record<string, unknown>).unknownStyle).toEqual({opaque: 'preserve'});
  expect(client.syncCount).toBe(1);
  expect((edge.end as any).item).toBe(itemFor(board, binding, 'node', 'store').id);
  expect((edge.captions as any)[0].content).toBe('dispatches');
  expect(edge.syncCount).toBe(1);

  const second = structuredClone(nextDocument);
  mutableVisual(second).nodes!.find(node => node.id === 'client')!.label = 'Browser';
  const twice = await updateEditableMiroVisual(board, next, nextDocument, second, {expectedBindingRevision: 1});
  expect(twice.bindingRevision).toBe(2);
  expect(client.content).toBe('Browser');
  expect(client.x).toBe(before.x);
});

test('readback refuses bold rich text instead of silently flattening native formatting', async () => {
  const board = new FakeMiroBoard(), source = flow(), binding = await exportEditableMiroVisual(board, source, {bindingId: 'rich-text-refusal'});
  itemFor(board, binding, 'node', 'client').content = '<p><strong>Bold client</strong></p>';
  await expect(importEditableMiroVisual(board, binding, source, binding.bindingRevision)).rejects.toMatchObject({code: 'RICH_TEXT'});
});

test('authored common group membership maps to a native group; membership edits refuse', async () => {
  const board = new FakeMiroBoard(), source = flow(); appendGroup(source);
  const binding = await exportEditableMiroVisual(board, source, {bindingId: 'group-binding', mode: 'report'});
  expect(binding.mappings.find(mapping => mapping.kind === 'group' && mapping.logicalId === 'zone')).toBeDefined();
  expect(board.groups).toHaveLength(1);
  expect(binding.losses.some(loss => loss.path.endsWith('/label') && loss.family === 'semantic')).toBe(true);
  const result = await importEditableMiroVisual(board, binding, source, 0);
  expect(result.document).toEqual(source);
  board.groups[0]!.itemsIds = [itemFor(board, binding, 'node', 'client').id, itemFor(board, binding, 'node', 'store').id];
  await expect(importEditableMiroVisual(board, binding, source, 0)).rejects.toMatchObject({code: 'STRUCTURE'});
});

test('fresh repeated capture fence and mapping identities reject stale, duplicate, missing, and detached objects', async () => {
  const board = new FakeMiroBoard(), source = flow(), binding = await exportEditableMiroVisual(board, source, {bindingId: 'fence-binding'});
  const changedSource = structuredClone(source);
  mutableVisual(changedSource).question = 'Local edit';
  await expect(importEditableMiroVisual(board, binding, changedSource, 0)).rejects.toMatchObject({code: 'STALE_SOURCE'});
  await expect(importEditableMiroVisual(board, binding, source, 4)).rejects.toMatchObject({code: 'STALE_BINDING'});

  const client = itemFor(board, binding, 'node', 'client');
  const copy = new FakeMiroItem('copied-mapping', 'shape', {content: client.content});
  await copy.setMetadata('umf-visual-editable', await client.getMetadata('umf-visual-editable'));
  board.items.push(copy);
  await expect(importEditableMiroVisual(board, binding, source, 0)).rejects.toMatchObject({code: 'IDENTITY'});
  board.items.pop();
  board.items.splice(board.items.indexOf(itemFor(board, binding, 'node', 'service')), 1);
  await expect(importEditableMiroVisual(board, binding, source, 0)).rejects.toMatchObject({code: 'IDENTITY'});

  const board2 = new FakeMiroBoard(), source2 = flow(), binding2 = await exportEditableMiroVisual(board2, source2, {bindingId: 'endpoint-binding'});
  itemFor(board2, binding2, 'edge', 'request').end = {item: 'not-exported', snapTo: 'auto'};
  await expect(importEditableMiroVisual(board2, binding2, source2, 0)).rejects.toMatchObject({code: 'ENDPOINT'});
});

test('connector arrows and straight type are explicit and native changes refuse adoption', async () => {
  const board = new FakeMiroBoard(), source = flow();
  const binding = await exportEditableMiroVisual(board, source, {bindingId: 'arrows-binding'});
  const edge = itemFor(board, binding, 'edge', 'request');
  expect(edge.style).toEqual({startStrokeCap: 'none', endStrokeCap: 'stealth'});
  edge.style = {startStrokeCap: 'stealth', endStrokeCap: 'none'};
  await expect(importEditableMiroVisual(board, binding, source, 0)).rejects.toMatchObject({code: 'CONNECTOR'});

  const board2 = new FakeMiroBoard(), source2 = flow();
  const binding2 = await exportEditableMiroVisual(board2, source2, {bindingId: 'connector-shape-binding'});
  itemFor(board2, binding2, 'edge', 'request').shape = 'curved';
  await expect(importEditableMiroVisual(board2, binding2, source2, 0)).rejects.toMatchObject({code: 'CONNECTOR'});
});

test('connector attachment and caption extras remain visible at escaped JSON Pointer paths', async () => {
  const board = new FakeMiroBoard(), source = flow(), binding = await exportEditableMiroVisual(board, source, {bindingId: 'nested-native-binding'});
  const edge = itemFor(board, binding, 'edge', 'request');
  const from = itemFor(board, binding, 'node', 'client'), to = itemFor(board, binding, 'node', 'service');
  edge.start = {item: from.id, snapTo: 'west', position: 0.2, 'port/name~id': {edge: 'in'}};
  edge.end = {item: to.id, snapTo: 'north', attachment: {position: 0.8, 'vendor/key~mode': 'exact'}};
  edge.captions = [{content: 'sends', position: 0.31, style: {color: 'purple'}, 'vendor/caption~flag': true}];
  edge.style = {startStrokeCap: 'none', endStrokeCap: 'stealth', 'vendor/style~name': 'hand-authored'};
  const imported = await importEditableMiroVisual(board, binding, source, 0);
  const edgePath = '/native/items/' + edge.id;
  const paths = imported.losses.map(loss => loss.path);
  for (const suffix of ['/data/start/snapTo', '/data/start/position', '/data/start/port~1name~0id/edge',
    '/data/end/snapTo', '/data/end/attachment/position', '/data/end/attachment/vendor~1key~0mode',
    '/data/captions/0/position', '/data/captions/0/style/color', '/data/captions/0/vendor~1caption~0flag',
    '/data/style/vendor~1style~0name']) expect(paths).toContain(edgePath + suffix);
  expect(paths).not.toContain(edgePath + '/data/start/item');
  expect(paths).not.toContain(edgePath + '/data/captions/0/content');
  expect(imported.nativeOnly).toContain(edgePath);
});

test('deleting an unmapped native item is reported as a native-only change with escaped identity', async () => {
  const board = new FakeMiroBoard(), source = flow();
  const deleted = board.addUnrelated('native/extra~record');
  const binding = await exportEditableMiroVisual(board, source, {bindingId: 'deleted-native-binding'});
  board.items.splice(board.items.indexOf(deleted), 1);
  const imported = await importEditableMiroVisual(board, binding, source, 0);
  expect(imported.unmapped).not.toContain(deleted.id);
  expect(imported.nativeOnly).toContain('/native/items/native~1extra~0record');
});

test('fence detects changing SDK revisions and changed captures without calling them transactions', async () => {
  const board = new FakeMiroBoard(), source = flow();
  const binding = await exportEditableMiroVisual(board, source, {bindingId: 'revision-binding'});
  let revision = 0;
  const unstable = async () => ({kind: 'host-revision' as const, value: String(++revision)});
  await expect(captureEditableMiroBoard(board, unstable)).rejects.toMatchObject({code: 'CONCURRENT_EDIT'});
  const read = board.get.bind(board); let reads = 0;
  board.get = async () => {const items = await read(); if (++reads === 2) itemFor(board, binding, 'node', 'client').x = 909; return items;};
  await expect(importEditableMiroVisual(board, binding, source, 0)).rejects.toMatchObject({code: 'CONCURRENT_EDIT'});
});

test('interrupted create and update receipts retain known identities and avoid rollback', async () => {
  const board = new FakeMiroBoard(), source = flow(); board.failCreateAt = 4;
  const checkpoints: EditableBinding[] = [];
  await expect(exportEditableMiroVisual(board, source, {bindingId: 'interrupted-create', checkpoint: binding => {checkpoints.push(binding);}}))
    .rejects.toMatchObject({code: 'WRITE_INTERRUPTED', receipt: {state: 'interrupted'}});
  const createReceipt = checkpoints.at(-1)!;
  expect(createReceipt.mappings.some(mapping => mapping.kind === 'node')).toBe(true);
  expect(board.items.length).toBeGreaterThan(0);

  const board2 = new FakeMiroBoard(), source2 = flow(), binding = await exportEditableMiroVisual(board2, source2, {bindingId: 'interrupted-update'});
  const target = itemFor(board2, binding, 'node', 'client'), nextDoc = structuredClone(source2);
  mutableVisual(nextDoc).nodes!.find(node => node.id === 'client')!.label = 'Interrupted label';
  target.failSync = () => true;
  await expect(updateEditableMiroVisual(board2, binding, source2, nextDoc, {expectedBindingRevision: 0}))
    .rejects.toMatchObject({code: 'WRITE_INTERRUPTED', receipt: {state: 'interrupted'}});
  expect(target.content).toBe('Interrupted label');
});

test('Visual 1.0 limit stays 15; the 16/24 corpus witness explicitly opts into 1.1', async () => {
  const legacy = createVisualDocument({id: 'too-many-legacy', kind: 'flow', form: 'network', question: 'How?', nodes: [{id: 'one', label: 'One'}]});
  (legacy.extensions!['umf.visual'] as any).nodes = Array.from({length: 16}, (_, i) => ({id: 'n-' + i, label: 'Node'}));
  await expect(planEditableMiroExport(legacy, 'report')).rejects.toMatchObject({code: 'VISUAL_INVALID'});
  const corpus = JSON.parse(readFileSync('fixtures/integrations/complex-miro/common/network-16x24.json', 'utf8'));
  expect(corpus.vocabularies['umf.visual'].version).toBe('1.1.0');
  const plan = await planEditableMiroExport(corpus, 'report');
  expect(plan.modelVersion).toBe('1.1.0');
  expect(plan.nodes).toHaveLength(16);
  expect(plan.edges).toHaveLength(24);
  const board = new FakeMiroBoard();
  const binding = await exportEditableMiroVisual(board, corpus, {bindingId: 'large-1-1', mode: 'report'});
  expect(binding.modelVersion).toBe('1.1.0');
  expect(binding.mappings.filter(mapping => mapping.kind === 'node')).toHaveLength(16);
  expect(binding.mappings.filter(mapping => mapping.kind === 'edge')).toHaveLength(24);
});

test('input truncation and strict source gaps fail before native mutation', async () => {
  const source = flow();
  (source.extensions!['umf.visual'] as any).nodes[0].role = 'actor';
  const board = new FakeMiroBoard();
  await expect(exportEditableMiroVisual(board, source, {bindingId: 'strict-loss'})).rejects.toMatchObject({code: 'RENDER_LOSS'});
  expect(board.creates).toBe(0);
  const reported = await exportEditableMiroVisual(board, source, {bindingId: 'report-loss', mode: 'report'});
  expect(reported.losses.some(loss => loss.path.endsWith('/role') && loss.family === 'semantic')).toBe(true);
});
