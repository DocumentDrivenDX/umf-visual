// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Visual} from '../../extensions/visual/index.js';
import {copyHostJson, demand, record} from '../reconciliation/json.js';
import {nativeId, sceneLimit} from './profile.js';

export type Element = Record<string, unknown> & {id: string; type: string};
export type Scene = Record<string, unknown> & {elements: Element[]};

export function readScene(text: string): Scene {
  demand(typeof text === 'string' && text.length <= sceneLimit && new TextEncoder().encode(text).length <= sceneLimit,
    'LIMIT', 'Scene exceeds the 8 MiB file limit');
  let parsed: unknown;
  try { parsed = copyHostJson(JSON.parse(text)); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    demand(false, 'SCENE', 'Expected an Excalidraw JSON file');
  }
  demand(record(parsed) && parsed.type === 'excalidraw' && parsed.version === 2 &&
    Array.isArray(parsed.elements) && parsed.elements.length <= 4096 &&
    record(parsed.appState) && record(parsed.files),
  'SCENE', 'Expected a version 2 Excalidraw scene with at most 4096 elements');
  const ids = new Set<string>();
  for (const element of parsed.elements) {
    demand(record(element) && typeof element.id === 'string' && element.id.length > 0 &&
      typeof element.type === 'string' && !ids.has(element.id),
    'IDENTITY', 'Scene contains an invalid element or duplicate element ID', '/elements');
    ids.add(element.id);
  }
  return parsed as Scene;
}

type Point = [number, number];
export interface Box {id: string; x: number; y: number; width: number; height: number}
const lineHeight = 25;
const textWidth = (value: string) => Math.max(20, ...value.split('\n').map(line => line.length * 12));

export function base(id: string, type: string, x: number, y: number, width: number, height: number): Element {
  return {id, type, x, y, width, height, angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent',
    fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100,
    groupIds: [], frameId: null, index: null, roundness: null, seed: 1, version: 1, versionNonce: 0,
    isDeleted: false, boundElements: [], updated: 0, link: null, locked: false};
}

export function label(id: string, value: string, x: number, y: number, containerId: string | null): Element {
  return {...base(id, 'text', x, y, textWidth(value), value.split('\n').length * lineHeight),
    text: value, originalText: value, containerId, fontSize: 20, fontFamily: 5, lineHeight: 1.25,
    textAlign: containerId ? 'center' : 'left', verticalAlign: containerId ? 'middle' : 'top', autoResize: true};
}

function arrowPoints(from: Box, to: Box): {start: Point; points: Point[]} {
  if (from.id === to.id) {
    const dx = -from.width / 2 - 5;
    const dy = -from.height / 2 - 5;
    return {start: [from.x + from.width + 5, from.y + from.height / 2],
      points: [[0, 0], [42, 0], [42, dy - 42], [dx, dy - 42], [dx, dy]]};
  }
  const horizontal = from.x !== to.x;
  const forward = horizontal ? from.x < to.x : from.y < to.y;
  const boundary = (box: Box, outgoing: boolean): Point => {
    const high = outgoing === forward;
    return horizontal ? [high ? box.x + box.width + 5 : box.x - 5, box.y + box.height / 2]
      : [box.x + box.width / 2, high ? box.y + box.height + 5 : box.y - 5];
  };
  const start = boundary(from, true);
  const end = boundary(to, false);
  return {start, points: [[0, 0], [end[0] - start[0], end[1] - start[1]]]};
}

export function arrow(id: string, from: Box, to: Box, caption: string | undefined, directed = true): Element {
  const {start, points} = arrowPoints(from, to);
  const span = (axis: 0 | 1) => Math.max(...points.map(point => point[axis])) - Math.min(...points.map(point => point[axis]));
  return {...base(id, 'arrow', ...start, span(0), span(1)), points, lastCommittedPoint: null,
    startBinding: {elementId: from.id, focus: 0, gap: 5}, endBinding: {elementId: to.id, focus: 0, gap: 5},
    startArrowhead: null, endArrowhead: directed ? 'arrow' : null, elbowed: false,
    boundElements: caption ? [{id: caption, type: 'text'}] : []};
}

function addNodes(visual: Visual, scope: string, elements: Element[], top: number) {
  const boxes = new Map<string, Box>();
  const nodes = visual.nodes ?? [];
  const width = Math.max(160, ...nodes.map(node => Math.min(480, textWidth(node.label) + 20)));
  const height = Math.max(64, ...nodes.map(node => {
    const lines = node.label.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length * 12 / (width - 20))), 0);
    return lines * lineHeight + 20;
  }));
  nodes.forEach((node, i) => {
    const id = nativeId(scope, 'node', i);
    const textId = nativeId(scope, 'node-label', i);
    const x = 60 + i % 4 * (width + 100);
    const y = top + Math.floor(i / 4) * (height + 110);
    boxes.set(node.id, {id, x, y, width, height});
    const bound = [{id: textId, type: 'text'}];
    visual.edges?.forEach((edge, index) => {
      if (edge.from === node.id || edge.to === node.id) bound.push({id: nativeId(scope, 'edge', index), type: 'arrow'});
    });
    elements.push({...base(id, 'rectangle', x, y, width, height), roundness: {type: 3}, boundElements: bound});
    elements.push(label(textId, node.label, x + 10, y + 10, id));
  });
  return boxes;
}

export function createScene(visual: Visual, scope: string): string {
  const elements: Element[] = [];
  let y = 40;
  if (visual.title !== undefined) {
    elements.push(label(nativeId(scope, 'title'), visual.title, 60, y, null));
    y += visual.title.split('\n').length * lineHeight + 12;
  }
  elements.push(label(nativeId(scope, 'question'), visual.question, 60, y, null));
  const boxes = addNodes(visual, scope, elements, y + visual.question.split('\n').length * lineHeight + 44);
  visual.edges?.forEach((edge, i) => {
    const id = nativeId(scope, 'edge', i);
    const caption = edge.label !== undefined ? nativeId(scope, 'edge-label', i) : undefined;
    const connector = arrow(id, boxes.get(edge.from)!, boxes.get(edge.to)!, caption);
    elements.push(connector);
    if (caption) elements.push(label(caption, edge.label!, Number(connector.x), Number(connector.y), id));
  });
  return writeScene(elements);
}

export function writeScene(elements: Element[]): string {
  return JSON.stringify({type: 'excalidraw', version: 2, source: 'https://github.com/DocumentDrivenDX/umf-visual',
    elements, appState: {viewBackgroundColor: '#ffffff'}, files: {}}, null, 2) + '\n';
}
