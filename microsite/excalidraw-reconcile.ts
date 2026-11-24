// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '@umf/core';
import {getVisual} from '../src/extensions/visual';
import {importExcalidraw, type ExcalidrawBinding} from '../src/adapters/excalidraw';
import {canonicalHostJson} from '../src/adapters/reconciliation/json';

export async function importDemoEdit(text: string, source: Document, binding: ExcalidrawBinding, expected: Document) {
  const {document} = await importExcalidraw(text, {currentDocument: source, binding, expectedRevision: 0});
  if (canonicalHostJson(document) !== canonicalHostJson(expected)) throw Error('Import did not reproduce the verified edit');
  const before = getVisual(source), after = getVisual(document);
  const beforeNodes = new Map(before.nodes?.map(node => [node.id, node.label]));
  const beforeEdges = new Map(before.edges?.map(edge => [edge.id, edge]));
  const changes = (after.nodes ?? []).flatMap(node => {
    const previous = beforeNodes.get(node.id);
    return previous !== undefined && previous !== node.label
      ? [{field: 'Node label', before: previous, after: node.label}] : [];
  });
  for (const edge of after.edges ?? []) {
    const previous = beforeEdges.get(edge.id);
    if (previous && (previous.from !== edge.from || previous.to !== edge.to)) {
      changes.push({field: 'Arrow connection', before: `${previous.from} → ${previous.to}`, after: `${edge.from} → ${edge.to}`});
    }
  }
  return {document, changes};
}
