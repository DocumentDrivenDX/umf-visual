// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Visual} from '../../extensions/visual/index.js';
import {canonicalHostJson, demand, record} from '../reconciliation/json.js';
import {nativeId, pointer, type ExcalidrawDiagnostic, type ExcalidrawMapping} from './profile.js';
import type {Element, Scene} from './scene.js';

export interface NetworkText {
  title?: string;
  question: string;
  nodes: string[];
  edges: {from: string; to: string; label?: string}[];
}

export function sourceNetwork(visual: Visual): NetworkText {
  return {...(visual.title !== undefined && {title: visual.title}), question: visual.question,
    nodes: (visual.nodes ?? []).map(node => node.label),
    edges: (visual.edges ?? []).map(({from, to, label}) => ({from, to, ...(label !== undefined && {label})}))};
}

function readText(element: Element, containerId: string | null) {
  demand(element.containerId === containerId && typeof element.originalText === 'string' &&
    typeof element.text === 'string', 'TEXT', 'Mapped text must retain its original text and container', element.id);
  return element.originalText;
}

function backlink(owner: Element, id: string, type: 'text' | 'arrow') {
  return Array.isArray(owner.boundElements) &&
    owner.boundElements.filter(entry => record(entry) && entry.id === id && entry.type === type).length === 1;
}

export function readNetwork(scene: Scene, visual: Visual, scope: string): NetworkText {
  const live = scene.elements.filter(element => element.isDeleted !== true);
  const byId = new Map(live.map(element => [element.id, element]));
  const get = (kind: ExcalidrawMapping['kind'], type: string, i?: number) => {
    const id = nativeId(scope, kind, i);
    const element = byId.get(id);
    demand(element?.type === type, 'IDENTITY', 'Mapped element was removed or changed type', id);
    return element;
  };
  const captions = new Map<string, string[]>();
  for (const element of live) {
    if (element.type !== 'text' || typeof element.containerId !== 'string') continue;
    const ids = captions.get(element.containerId) ?? [];
    ids.push(element.id);
    captions.set(element.containerId, ids);
  }
  const readCaption = (owner: Element, kind: 'node-label' | 'edge-label', index: number, expected: boolean) => {
    const ids = captions.get(owner.id) ?? [];
    demand(ids.length === Number(expected), 'TEXT', 'Mapped element has a missing or additional bound label', owner.id);
    if (!expected) return undefined;
    const text = get(kind, 'text', index);
    demand(backlink(owner, text.id, 'text'), 'TEXT', 'Bound label is missing its reverse attachment', owner.id);
    return readText(text, owner.id);
  };
  const title = visual.title !== undefined ? readText(get('title', 'text'), null) : undefined;
  const question = readText(get('question', 'text'), null);
  const nodeOwners = new Map<string, string>();
  const nodes = (visual.nodes ?? []).map((node, index) => {
    const box = get('node', 'rectangle', index);
    nodeOwners.set(box.id, node.id);
    return readCaption(box, 'node-label', index, true)!;
  });
  const actualArrows = new Map<string, Set<string>>();
  const edges = (visual.edges ?? []).map((edge, index) => {
    const arrow = get('edge', 'arrow', index);
    demand(arrow.startArrowhead === null && arrow.endArrowhead === 'arrow',
      'DIRECTION', 'Mapped arrow must still have one directed arrowhead at its end', arrow.id);
    const endpoint = (binding: unknown) => {
      const id = record(binding) && typeof binding.elementId === 'string' ? binding.elementId : '';
      const owner = nodeOwners.get(id);
      demand(owner !== undefined && backlink(byId.get(id)!, arrow.id, 'arrow'),
        'ENDPOINT', 'Mapped arrow endpoint must attach to a mapped rectangle with a reverse attachment', arrow.id);
      const attached = actualArrows.get(id) ?? new Set<string>();
      attached.add(arrow.id);
      actualArrows.set(id, attached);
      return owner;
    };
    const label = readCaption(arrow, 'edge-label', index, edge.label !== undefined);
    return {from: endpoint(arrow.startBinding), to: endpoint(arrow.endBinding), ...(label !== undefined && {label})};
  });
  const ownedArrows = new Set((visual.edges ?? []).map((_, index) => nativeId(scope, 'edge', index)));
  for (const id of nodeOwners.keys()) {
    const links = byId.get(id)!.boundElements;
    if (!Array.isArray(links)) continue;
    for (const link of links) {
      if (!record(link) || link.type !== 'arrow' || typeof link.id !== 'string' || !ownedArrows.has(link.id)) continue;
      demand(actualArrows.get(id)?.has(link.id), 'ENDPOINT', 'Mapped rectangle has a stale reverse attachment', id);
    }
  }
  return {...(title !== undefined && {title}), question, nodes, edges};
}

function nativeFields(element: Element, other: Element, owned: Map<string, ExcalidrawMapping['kind']>, kind: ExcalidrawMapping['kind']) {
  const result: Record<string, unknown> = {...element};
  for (const key of ['index', 'version', 'versionNonce', 'updated']) delete result[key];
  if (element.type === 'text') {
    delete result.originalText;
    if (element.originalText !== other.originalText) delete result.text;
  }
  if (kind === 'edge') {
    for (const key of ['startBinding', 'endBinding']) {
      const binding = result[key];
      if (!record(binding)) continue;
      const {elementId, ...geometry} = binding;
      result[key] = geometry;
    }
  }
  if ((kind === 'node' || kind === 'edge') && Array.isArray(element.boundElements)) {
    result.boundElements = element.boundElements.filter(entry => {
      if (!record(entry) || typeof entry.id !== 'string' || Object.keys(entry).length !== 2) return true;
      const linkKind = owned.get(entry.id);
      return !(entry.type === 'arrow' && linkKind === 'edge' ||
        entry.type === 'text' && (linkKind === 'edge-label' || linkKind === 'node-label'));
    });
  }
  return result;
}

export function nativeChanges(before: Scene, after: Scene, mappings: ExcalidrawMapping[]): ExcalidrawDiagnostic[] {
  const diagnostics: ExcalidrawDiagnostic[] = [];
  const report = (path: string) => diagnostics.push({code: 'NATIVE_RETAINED_ONLY', path,
    message: 'Native content is retained in the scene without being adopted as UMF semantics.'});
  const differs = (a: unknown, b: unknown) => a === undefined || b === undefined ? a !== b :
    canonicalHostJson(a) !== canonicalHostJson(b);
  const old = new Map(before.elements.map(element => [element.id, element]));
  const newIds = new Set(after.elements.map(element => element.id));
  const oldOrder = before.elements.filter(element => newIds.has(element.id)).map(element => element.id);
  const newOrder = after.elements.filter(element => old.has(element.id)).map(element => element.id);
  if (differs(oldOrder, newOrder)) report('/elements');
  const owned = new Map(mappings.map(mapping => [mapping.nativeId, mapping.kind]));
  after.elements.forEach((element, i) => {
    const previous = old.get(element.id);
    const kind = owned.get(element.id);
    if (!previous || (!kind && differs(previous, element)) ||
      (previous && kind && differs(nativeFields(previous, element, owned, kind), nativeFields(element, previous, owned, kind)))) {
      report('/elements/' + i);
    }
    old.delete(element.id);
  });
  for (const element of old.values()) report('/elements/' + before.elements.indexOf(element));
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key !== 'elements' && differs(before[key], after[key])) report('/' + pointer(key));
  }
  return diagnostics;
}
