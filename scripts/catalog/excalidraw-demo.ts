// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {Page} from 'playwright';
import {createVisualDocument, getVisual} from '../../src';
import {canonicalHostJson} from '../../src/adapters/reconciliation';
import {exportExcalidraw, importExcalidraw, replayExcalidraw} from '../../src/adapters/excalidraw';

export async function runExcalidrawEditDemo(page: Page) {
  const source = createVisualDocument({
    id: 'request-path', kind: 'flow', form: 'network', title: 'Request path',
    question: 'Who handles the request?',
    nodes: [{id: 'client', label: 'Client'}, {id: 'api', label: 'API'}, {id: 'queue', label: 'Queue'}],
    edges: [{id: 'request', from: 'client', to: 'api', label: 'calls'}, {id: 'loop', from: 'api', to: 'api'}],
  });
  const initial = await exportExcalidraw(source);
  const ids = Object.fromEntries(initial.mappings.map(({path, nativeId}) => [path.replace('/extensions/umf.visual', ''), nativeId]));

  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.evaluate(text => window.editor.open(text), initial.text);
  const beforeSvg = await page.evaluate(() => window.editor.svg());
  const unchanged = await page.evaluate(() => window.editor.save());
  const afterOpen = await importExcalidraw(unchanged, {binding: initial.binding, expectedRevision: 0, currentDocument: source});
  assert.equal(canonicalHostJson(afterOpen.document), canonicalHostJson(source), 'Editor open/save must preserve mapped meaning');

  await page.evaluate(ids => {
    const label = window.editor.elements().find(element => element.id === ids['/nodes/1/label']);
    const queueLabel = window.editor.elements().find(element => element.id === ids['/nodes/2/label']);
    const from = window.editor.elements().find(element => element.id === ids['/nodes/0']);
    const oldTarget = window.editor.elements().find(element => element.id === ids['/nodes/1']);
    const target = window.editor.elements().find(element => element.id === ids['/nodes/2']);
    const edge = window.editor.elements().find(element => element.id === ids['/edges/0']);
    if (label?.type !== 'text' || queueLabel?.type !== 'text' || from?.type !== 'rectangle' || oldTarget?.type !== 'rectangle' ||
        target?.type !== 'rectangle' || edge?.type !== 'arrow' || !edge.endBinding) {
      throw Error('Editor did not restore the mapped rectangles, text and arrow');
    }
    const moved = {...target, y: target.y + 125, strokeColor: '#1971c2',
      boundElements: [...(target.boundElements ?? []), {id: edge.id, type: 'arrow' as const}]};
    const endpoint = [moved.x - 5 - edge.x, moved.y + moved.height / 2 - edge.y] as typeof edge.points[number];
    const context = document.createElement('canvas').getContext('2d')!;
    context.font = `${label.fontSize}px Excalifont`;
    const width = context.measureText('Gateway').width;
    window.editor.update([
      {...label, text: 'Gateway', originalText: 'Gateway', width,
        x: oldTarget.x + (oldTarget.width - width) / 2, y: oldTarget.y + (oldTarget.height - label.height) / 2},
      {...queueLabel, x: moved.x + (moved.width - queueLabel.width) / 2,
        y: moved.y + (moved.height - queueLabel.height) / 2},
      {...oldTarget, boundElements: oldTarget.boundElements?.filter(binding => binding.id !== edge.id) ?? []},
      moved,
      {...edge, points: [edge.points[0]!, endpoint], width: Math.abs(endpoint[0]), height: Math.abs(endpoint[1]),
        endBinding: {...edge.endBinding, elementId: moved.id}},
    ]);
  }, ids);

  const text = await page.evaluate(() => window.editor.save());
  const back = await importExcalidraw(text, {binding: initial.binding, expectedRevision: 0, currentDocument: source});
  const visual = getVisual(back.document);
  assert.equal(visual.nodes?.[1]?.label, 'Gateway');
  assert.equal(visual.edges?.[0]?.to, 'queue');
  const expected = structuredClone(source);
  const expectedVisual = expected.extensions!['umf.visual'] as unknown as ReturnType<typeof getVisual>;
  expectedVisual.nodes![1]!.label = 'Gateway';
  expectedVisual.edges![0]!.to = 'queue';
  assert.equal(canonicalHostJson(back.document), canonicalHostJson(expected), 'Only the two advertised semantic edits may be adopted');
  assert.ok(back.diagnostics.some(diagnostic => diagnostic.code === 'NATIVE_RETAINED_ONLY'));
  const replay = await replayExcalidraw({binding: back.binding, currentDocument: back.document, expectedRevision: 1});
  assert.equal(replay, text, 'Re-export must preserve editor layout and styles exactly');
  await page.evaluate(text => window.editor.open(text), replay);
  const savedAgain = await page.evaluate(() => window.editor.save());
  const again = await importExcalidraw(savedAgain, {binding: back.binding, currentDocument: back.document, expectedRevision: 1});
  assert.equal(canonicalHostJson(again.document), canonicalHostJson(back.document));
  const restored = JSON.parse(savedAgain).elements;
  const movedTarget = restored.find((element: {id: string}) => element.id === ids['/nodes/2']);
  const movedLabel = restored.find((element: {id: string}) => element.id === ids['/nodes/2/label']);
  assert.equal(movedLabel.containerId, movedTarget.id);
  assert.ok(movedLabel.y >= movedTarget.y && movedLabel.y + movedLabel.height <= movedTarget.y + movedTarget.height,
    'The moved Queue label remains inside its rectangle');
  assert.equal(movedTarget.strokeColor, '#1971c2');
  assert.equal(movedTarget.y, JSON.parse(initial.text).elements.find((element: {id: string}) => element.id === ids['/nodes/2']).y + 125);
  const svg = await page.evaluate(() => window.editor.svg());
  assert.match(svg, />Gateway<\/text>/u);
  assert.deepEqual(errors, []);


  return {source, initial, recovered: back.document, replay, beforeSvg, svg, replayRevision: again.binding.revision};
}

interface DemoAsset {path: string; sha256: string}
export interface ExcalidrawDemo {
  nativeVersion: string;
  chromium: string;
  before: {scene: DemoAsset; svg: DemoAsset; document: DemoAsset; binding: DemoAsset};
  after: {scene: DemoAsset; svg: DemoAsset; document: DemoAsset};
}

export async function buildExcalidrawDemo(page: Page, outputDir: string, nativeVersion: string, chromium: string): Promise<ExcalidrawDemo> {
  const result = await runExcalidrawEditDemo(page);
  await mkdir(join(outputDir, 'excalidraw-demo'), {recursive: true});
  const asset = async (name: string, extension: string, text: string) => {
    const sha256 = createHash('sha256').update(text).digest('hex');
    const path = `excalidraw-demo/${name}-${sha256}.${extension}`;
    await writeFile(join(outputDir, path), text);
    return {path, sha256};
  };
  const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
  const [beforeScene, beforeSvg, beforeDocument, binding, afterScene, afterSvg, afterDocument] = await Promise.all([
    asset('before', 'excalidraw', result.initial.text), asset('before', 'svg', result.beforeSvg),
    asset('before', 'json', json(result.source)), asset('binding', 'json', json(result.initial.binding)),
    asset('after', 'excalidraw', result.replay), asset('after', 'svg', result.svg), asset('after', 'json', json(result.recovered)),
  ]);
  return {nativeVersion, chromium, before: {scene: beforeScene, svg: beforeSvg, document: beforeDocument, binding},
    after: {scene: afterScene, svg: afterSvg, document: afterDocument}};
}
