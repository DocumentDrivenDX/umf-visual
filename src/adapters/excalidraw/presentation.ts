// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '@umf/core';
import {getVisual} from '../../extensions/visual/index.js';
import {compileFullScene} from '../../interchange/full/scene.js';
import {fullRecordId} from '../../interchange/full/records.js';
import type {VisualApproximation} from '../../interchange/full/types.js';
import {visualPath} from './profile.js';
import {arrow, base, label, readScene, writeScene, type Element} from './scene.js';
import {layoutPresentation} from './presentation-layout.js';
import {drawDateTimeline, drawMetric, drawSequence} from './presentation-views.js';

export const EXCALIDRAW_PRESENTATION = 'umf.visual.excalidraw.presentation/1';

export interface ExcalidrawPresentation {
  profile: typeof EXCALIDRAW_PRESENTATION;
  text: string;
  /** Source pointers whose scalar values or references are projected. */
  elementMap: {sourcePath: string; nativeId: string; slot: 'text' | 'identity' | 'from' | 'to'}[];
  approximations: VisualApproximation[];
  /** Source pointers retained in the UMF input and omitted from the scene. */
  omissions: string[];
}

const shapes = {box: 'rectangle', note: 'rectangle', ellipse: 'ellipse', diamond: 'diamond'};
const palette = {box: '#edf5f5', note: '#fff4dc', ellipse: '#e8f2ec', diamond: '#f2ecfb'};
const textWidth = (value: string) => Math.max(...value.split('\n').map(line => line.length), 0) * 12;
const wrapCount = (text: string, width: number) =>
  text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length * 12 / width)), 0);

/** Compile editable native shapes for display. The network adapter owns semantic edit adoption. */
export function compileExcalidrawPresentation(document: Document): ExcalidrawPresentation {
  const scene = compileFullScene(document, 'excalidraw');
  const records = new Map(scene.records.map(record => [record.id, record]));
  const elementMap: ExcalidrawPresentation['elementMap'] = [];
  const bind = (id: string | undefined, nativeId: string, slot: ExcalidrawPresentation['elementMap'][number]['slot']) => {
    const entry = id && records.get(id);
    if (entry) elementMap.push({sourcePath: entry.path, nativeId, slot});
  };
  const caption = (id: string | undefined, fallback = ''): string => {
    const entry = id && records.get(id);
    return entry ? entry.type === 'string' ? JSON.parse(entry.value) : entry.value : fallback;
  };
  const titleRecord = fullRecordId(visualPath + '/title'), questionRecord = fullRecordId(visualPath + '/question');
  const titleNode = scene.nodes[0]!, questionNode = scene.nodes[1]!;
  const head = [caption(titleRecord, titleNode.text), caption(questionRecord)];
  const elements: Element[] = [];
  let top = 32;
  for (const [index, value] of head.entries()) {
    const id = index === 0 ? 'title' : 'question';
    elements.push({...label(id, value, 32, top, null), strokeColor: '#203746'});
    bind(index === 0 ? titleRecord : questionRecord, id, 'text');
    top += value.split('\n').length * 25 + 16;
  }

  const visual = getVisual(document);
  const canvas = {elements, bind: (sourcePath: string, nativeId: string, slot: 'text' | 'from' | 'to' = 'text') =>
    elementMap.push({sourcePath, nativeId, slot})};
  const specialized = drawSequence(visual, canvas, top + 24) ?? drawMetric(visual, canvas, top + 24) ??
    drawDateTimeline(visual, canvas, top + 24);
  if (!specialized) drawPrimitiveScene(scene, elements, top + 24, caption, bind);
  const text = writeScene(elements);
  readScene(text);
  const covered = new Set(elementMap.map(entry => entry.sourcePath));
  const omissions = scene.records.filter(entry =>
    entry.type !== 'array' && entry.type !== 'object' && !covered.has(entry.path)).map(entry => entry.path);
  const approximations = specialized ? [specialized] : [...scene.approximations, {
    path: visualPath + '/form', requested: 'Authored form and layout',
    renderedAs: 'Editable Excalidraw rectangles, ellipses, diamonds, text and bound connectors',
    reason: 'Generated placement uses graph ranks or a grid. Group frames and note shapes are represented by rectangles.',
  }];
  return {profile: EXCALIDRAW_PRESENTATION, text, elementMap, omissions, approximations};
}

function drawPrimitiveScene(
  scene: ReturnType<typeof compileFullScene<'excalidraw'>>,
  elements: Element[],
  top: number,
  caption: (id: string | undefined, fallback?: string) => string,
  bind: (id: string | undefined, nativeId: string, slot: ExcalidrawPresentation['elementMap'][number]['slot']) => void,
) {
  const visibleNodes = scene.nodes.slice(2).map(node => {
    const text = caption(node.recordId, node.text);
    const available = node.shape === 'ellipse' || node.shape === 'diamond' ? 0.60 : 0.90;
    const width = Math.max(116, node.width ?? 0, Math.min(360, textWidth(text) / available + 24));
    const height = Math.max(64, (wrapCount(text, width * available) * 25 + 22) / available);
    return {...node, label: text, width, height};
  });
  const groups = scene.groups.map(group => ({...group, label: caption(group.recordId, group.text ?? 'Group')}));
  const {boxes, groupBoxes} = layoutPresentation(visibleNodes, groups, scene.edges, top);
  const links = new Map<string, {id: string; type: 'text' | 'arrow'}[]>();
  for (const group of groups) {
    const box = groupBoxes.get(group.id)!;
    elements.push({...base(group.id, 'rectangle', box.x, box.y, box.width, box.height),
      backgroundColor: '#f3f7fa', strokeColor: '#93a9ba', roundness: {type: 3}});
    elements.push({...label(group.id + '-label', group.label, box.x + 14, box.y + 12, null), strokeColor: '#203746'});
    bind(group.recordId, group.id + '-label', 'text');
  }
  for (const edge of scene.edges) {
    const from = boxes.get(edge.from)!, to = boxes.get(edge.to)!;
    const value = caption(edge.recordId, edge.text);
    const captionId = value ? edge.id + '-label' : undefined;
    const connector = arrow(edge.id, from, to, captionId, edge.directed !== false);
    elements.push({...connector, strokeColor: '#566e80'});
    if (captionId) elements.push(label(captionId, value, Number(connector.x), Number(connector.y), edge.id));
    for (const box of new Set([from, to])) {
      const entries = links.get(box.id) ?? [];
      entries.push({id: edge.id, type: 'arrow'});
      links.set(box.id, entries);
    }
    if (captionId) bind(edge.recordId, captionId, 'text');
    bind(edge.fromRecordId, edge.id, 'from');
    bind(edge.toRecordId, edge.id, 'to');
  }
  for (const node of visibleNodes) {
    const box = boxes.get(node.id)!;
    const textId = box.id + '-label';
    elements.push({...base(box.id, shapes[node.shape], box.x, box.y, box.width, box.height),
      backgroundColor: palette[node.shape], strokeColor: '#46647b',
      boundElements: [{id: textId, type: 'text'}, ...(links.get(box.id) ?? [])]});
    elements.push(label(textId, node.label, box.x + 10, box.y + 10, box.id));
    bind(node.recordId, textId, 'text');
    bind(node.identityRecordId, box.id, 'identity');
  }
 }
