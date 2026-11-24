import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {withHeadlessExcalidraw} from '../examples/excalidraw/headless';
import {createVisualDocument, getVisual} from '../src';
import {canonicalHostJson} from '../src/adapters/reconciliation';
import {exportExcalidraw, importExcalidraw, replayExcalidraw} from '../src/adapters/excalidraw';

const source = createVisualDocument({
  id: 'request-path', kind: 'flow', form: 'network', title: 'Request path',
  question: 'Who handles the request?',
  nodes: [{id: 'client', label: 'Client'}, {id: 'api', label: 'API'}, {id: 'queue', label: 'Queue'}],
  edges: [{id: 'request', from: 'client', to: 'api', label: 'calls'}, {id: 'loop', from: 'api', to: 'api'}],
});
const initial = await exportExcalidraw(source);
const ids = Object.fromEntries(initial.mappings.map(({path, nativeId}) => [path.replace('/extensions/umf.visual', ''), nativeId]));

await withHeadlessExcalidraw(async (page, chromium) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.evaluate(text => window.editor.open(text), initial.text);
  const unchanged = await page.evaluate(() => window.editor.save());
  const afterOpen = await importExcalidraw(unchanged, {binding: initial.binding, expectedRevision: 0, currentDocument: source});
  assert.equal(canonicalHostJson(afterOpen.document), canonicalHostJson(source), 'Editor open/save must preserve mapped meaning');

  await page.evaluate(ids => {
    const label = window.editor.elements().find(element => element.id === ids['/nodes/1/label']);
    const from = window.editor.elements().find(element => element.id === ids['/nodes/0']);
    const oldTarget = window.editor.elements().find(element => element.id === ids['/nodes/1']);
    const target = window.editor.elements().find(element => element.id === ids['/nodes/2']);
    const edge = window.editor.elements().find(element => element.id === ids['/edges/0']);
    if (label?.type !== 'text' || from?.type !== 'rectangle' || oldTarget?.type !== 'rectangle' ||
        target?.type !== 'rectangle' || edge?.type !== 'arrow' || !edge.endBinding) {
      throw Error('Editor did not restore the mapped rectangles, text and arrow');
    }
    const moved = {...target, y: target.y + 125, strokeColor: '#1971c2',
      boundElements: [...(target.boundElements ?? []), {id: edge.id, type: 'arrow' as const}]};
    const endpoint = [moved.x - 5 - edge.x, moved.y + moved.height / 2 - edge.y] as typeof edge.points[number];
    window.editor.update([
      {...label, text: 'Gateway', originalText: 'Gateway'},
      {...oldTarget, boundElements: oldTarget.boundElements?.filter(binding => binding.id !== edge.id) ?? []},
      moved,
      {...edge, points: [edge.points[0]!, endpoint], width: Math.abs(endpoint[0]), height: Math.abs(endpoint[1]),
        endBinding: {...edge.endBinding, elementId: moved.id}},
    ]);
  }, ids);

  const text = await page.evaluate(() => window.editor.save());
  const back = await importExcalidraw(text, {binding: afterOpen.binding, expectedRevision: 1, currentDocument: source});
  const visual = getVisual(back.document);
  assert.equal(visual.nodes?.[1]?.label, 'Gateway');
  assert.equal(visual.edges?.[0]?.to, 'queue');
  assert.ok(back.diagnostics.some(diagnostic => diagnostic.code === 'NATIVE_RETAINED_ONLY'));
  const replay = await replayExcalidraw({binding: back.binding, currentDocument: back.document, expectedRevision: 2});
  assert.equal(replay, text, 'Re-export must preserve editor layout and styles exactly');
  await page.evaluate(text => window.editor.open(text), replay);
  const savedAgain = await page.evaluate(() => window.editor.save());
  const again = await importExcalidraw(savedAgain, {binding: back.binding, currentDocument: back.document, expectedRevision: 2});
  assert.equal(canonicalHostJson(again.document), canonicalHostJson(back.document));
  const movedTarget = JSON.parse(savedAgain).elements.find((element: {id: string}) => element.id === ids['/nodes/2']);
  assert.equal(movedTarget.strokeColor, '#1971c2');
  assert.equal(movedTarget.y, JSON.parse(initial.text).elements.find((element: {id: string}) => element.id === ids['/nodes/2']).y + 125);
  const svg = await page.evaluate(() => window.editor.svg());
  assert.match(svg, />Gateway<\/text>/u);
  assert.deepEqual(errors, []);

  await mkdir('.cache/excalidraw', {recursive: true});
  await Bun.write('.cache/excalidraw/edited.excalidraw', replay);
  await Bun.write('.cache/excalidraw/edited.svg', svg);
  console.log(JSON.stringify({ok: true, excalidraw: '0.18.1', chromium, bindings: again.binding.revision,
    adopted: ['node label', 'attached arrow endpoint'], preserved: ['rectangle movement', 'stroke color', 'self-loop']}));
});
