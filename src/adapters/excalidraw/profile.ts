// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '@umf/core';
import {getVisual, inspectVisual, type Visual} from '../../extensions/visual/index.js';
import {copyHostJson, demand} from '../reconciliation/json.js';

export const EXCALIDRAW_PROFILE = 'umf.visual.excalidraw.network/1';
export const sceneLimit = 8 * 1024 * 1024;
export const visualPath = '/extensions/umf.visual';
export const pointer = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1');

export interface ExcalidrawDiagnostic {
  code: 'SEMANTIC_RETAINED_ONLY' | 'NATIVE_RETAINED_ONLY';
  path: string;
  message: string;
}

export interface ExcalidrawMapping {
  path: string;
  nativeId: string;
  kind: 'title' | 'question' | 'node' | 'node-label' | 'edge' | 'edge-label';
}

export function admitSource(input: Document) {
  const source = copyHostJson(input);
  const version = source?.vocabularies?.['umf.visual']?.version;
  demand(version === '1.0.0' || version === '1.1.0', 'SUBSET', 'Expected umf.visual 1.0.0 or 1.1.0');
  demand(inspectVisual(source).valid, 'VISUAL_INVALID', 'Invalid visual source');
  const visual = getVisual(source);
  demand(visual.kind === 'flow' && visual.form === 'network' && visual.nodes?.length &&
    visual.nodes.length <= 64 && (visual.edges?.length ?? 0) <= 256,
  'SUBSET', 'Expected a flow/network with 1–64 nodes and at most 256 edges', visualPath);
  const text = [visual.title, visual.question, ...visual.nodes.map(node => node.label),
    ...(visual.edges ?? []).map(edge => edge.label)];
  demand(text.every(value => value === undefined ||
    (value.trim().length > 0 && value.length <= 1024 && !/[\r\t]/u.test(value))),
  'SUBSET', 'Mapped labels must be nonblank, at most 1024 characters, and use LF for line breaks', visualPath);
  return {source, visual};
}

export function nativeId(scope: string, kind: ExcalidrawMapping['kind'], index = 0) {
  return `umf-${scope}-${kind}-${index}`;
}

export function mappings(visual: Visual, scope: string): ExcalidrawMapping[] {
  const slots: ExcalidrawMapping[] = [];
  const add = (kind: ExcalidrawMapping['kind'], path: string, index = 0) => {
    slots.push({kind, path: visualPath + path, nativeId: nativeId(scope, kind, index)});
  };
  if (visual.title !== undefined) add('title', '/title');
  add('question', '/question');
  visual.nodes?.forEach((_, index) => {
    add('node', '/nodes/' + index, index);
    add('node-label', '/nodes/' + index + '/label', index);
  });
  visual.edges?.forEach((edge, index) => {
    add('edge', '/edges/' + index, index);
    if (edge.label !== undefined) add('edge-label', '/edges/' + index + '/label', index);
  });
  return slots;
}

export function semanticLosses(source: Document, visual: Visual): ExcalidrawDiagnostic[] {
  const losses: ExcalidrawDiagnostic[] = [];
  const extras = (object: object, path: string, allowed: string[], emptyArrays: string[] = []) => {
    for (const [key, value] of Object.entries(object)) {
      if (allowed.includes(key) || (emptyArrays.includes(key) && Array.isArray(value) && !value.length)) continue;
      losses.push({code: 'SEMANTIC_RETAINED_ONLY', path: path + '/' + pointer(key),
        message: 'This source field is retained in the binding and has no Excalidraw representation in this profile.'});
    }
  };
  extras(source, '', ['id', 'umf', 'vocabularies', 'extensions'], ['modules']);
  extras(source.vocabularies, '/vocabularies', ['umf.visual']);
  extras(source.vocabularies['umf.visual']!, '/vocabularies/umf.visual', ['version']);
  extras(source.extensions ?? {}, '/extensions', ['umf.visual']);
  extras(visual, visualPath, ['id', 'kind', 'form', 'title', 'question', 'nodes', 'edges'], ['groups', 'steps']);
  visual.nodes?.forEach((node, i) => extras(node, visualPath + '/nodes/' + i, ['id', 'label']));
  visual.edges?.forEach((edge, i) => extras(edge, visualPath + '/edges/' + i, ['id', 'label', 'from', 'to']));
  return losses;
}
