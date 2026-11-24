import {expect, test} from 'bun:test';
import {createVisualDocument, editVisual, getVisual} from '../../src';
import {exportExcalidraw, importExcalidraw, replayExcalidraw, type ExcalidrawExport} from '../../src/adapters/excalidraw';

function network(version: '1.0.0' | '1.1.0' | '1.4.0' = '1.0.0') {
  return createVisualDocument({
    id: 'request', kind: 'flow', form: 'network', title: 'Request flow', question: 'Where does it go?',
    nodes: [{id: 'a', label: 'Client'}, {id: 'b', label: 'Service'}],
    edges: [{id: 'route', from: 'a', to: 'b', label: 'sends'}],
  }, undefined, version);
}

function mappedId(created: ExcalidrawExport, suffix: string) {
  return created.mappings.find(mapping => mapping.path === '/extensions/umf.visual' + suffix)!.nativeId;
}

test('adopts bounded changes and replays the exact edited scene without losing opaque content', async () => {
  const currentDocument = network('1.1.0');
  const created = await exportExcalidraw(currentDocument);
  const scene = JSON.parse(created.text);
  const title = scene.elements.find((element: {id: string}) => element.id === mappedId(created, '/title'));
  title.text = title.originalText = 'Paths for π';
  const caption = scene.elements.find((element: {id: string}) => element.id === mappedId(created, '/edges/0/label'));
  caption.originalText = 'Request → API\nthen queue';
  caption.text = 'Request →\nAPI\nthen queue';
  const node = scene.elements.find((element: {id: string}) => element.id === mappedId(created, '/nodes/0'));
  node.width += 42;
  node.vendorData = {future: ['keep', 'me']};
  scene.elements.push({...node, boundElements: [], vendorData: {}, id: 'foreign-decoration'});
  scene.futureSceneField = {opaque: true};
  const text = JSON.stringify(scene, null, 4) + '\n\n';
  const back = await importExcalidraw(text, {currentDocument, binding: created.binding, expectedRevision: 0});

  expect(getVisual(back.document).title).toBe('Paths for π');
  expect(getVisual(back.document).edges?.[0]?.label).toBe('Request → API\nthen queue');
  expect(getVisual(currentDocument).title).toBe('Request flow');
  expect(back.diagnostics.map(diagnostic => diagnostic.path)).toContain('/futureSceneField');
  expect(back.diagnostics.filter(diagnostic => diagnostic.path.startsWith('/elements/'))).toHaveLength(2);
  expect(back.mappings).toEqual(created.mappings);
  const options = JSON.parse(JSON.stringify({currentDocument: back.document, binding: back.binding, expectedRevision: 1}));
  expect(await replayExcalidraw(options)).toBe(text);
  expect((await importExcalidraw(text, options)).diagnostics).toEqual([]);
});

test('strict export discloses unsupported source semantics and report mode retains them', async () => {
  const currentDocument = editVisual(network(), visual => {
    visual.nodes![0]!.role = 'platform';
    return visual;
  });
  await expect(exportExcalidraw(currentDocument)).rejects.toMatchObject({code: 'RENDER_LOSS'});
  const {text, binding, diagnostics} = await exportExcalidraw(currentDocument, {mode: 'report'});
  expect(diagnostics.map(diagnostic => diagnostic.path)).toEqual(['/extensions/umf.visual/nodes/0/role']);
  const back = await importExcalidraw(text, {currentDocument, binding, expectedRevision: 0});
  expect(getVisual(back.document).nodes?.[0]?.role).toBe('platform');
  expect(back.diagnostics).toEqual(diagnostics);
  await expect(exportExcalidraw(network('1.4.0'))).rejects.toMatchObject({code: 'SUBSET'});
});

test('refuses stale, corrupt, foreign and structurally edited scenes without adopting partial changes', async () => {
  const currentDocument = network();
  const created = await exportExcalidraw(currentDocument);
  const options = {currentDocument, binding: created.binding, expectedRevision: 0};
  await expect(importExcalidraw(created.text, {...options, expectedRevision: 1})).rejects.toMatchObject({code: 'STALE_BINDING'});
  const changed = editVisual(currentDocument, visual => ({...visual, question: 'Changed locally?'}));
  await expect(replayExcalidraw({...options, currentDocument: changed})).rejects.toMatchObject({code: 'STALE_SOURCE'});
  await expect(replayExcalidraw({...options, binding: {...created.binding, scene: created.text + ' '}}))
    .rejects.toMatchObject({code: 'BINDING'});
  const foreign = await exportExcalidraw(currentDocument);
  await expect(importExcalidraw(foreign.text, options)).rejects.toMatchObject({code: 'IDENTITY'});

  const scene = JSON.parse(created.text);
  const edge = scene.elements.find((element: {id: string}) => element.id === mappedId(created, '/edges/0'));
  edge.endBinding = null;
  await expect(importExcalidraw(JSON.stringify(scene), options)).rejects.toMatchObject({code: 'ENDPOINT'});
  scene.elements.push(scene.elements[0]);
  await expect(importExcalidraw(JSON.stringify(scene), options)).rejects.toMatchObject({code: 'IDENTITY'});
  scene.elements.pop();
  scene.elements = scene.elements.filter((element: {id: string}) => element.id !== mappedId(created, '/nodes/0/label'));
  await expect(importExcalidraw(JSON.stringify(scene), options)).rejects.toMatchObject({code: 'TEXT'});
  expect(await replayExcalidraw(options)).toBe(created.text);
});
