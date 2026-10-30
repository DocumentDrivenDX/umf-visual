// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '@umf/core';
import {getVisual, inspectVisual} from '../../extensions/visual/index.js';
import {jsonCopy, requireMiro, escapeLabel, record} from './json.js';
import type {MiroMode, MiroPlan, MiroLoss} from './types.js';

export function planMiroExport(document: Document, mode: MiroMode = 'strict'): MiroPlan {
  requireMiro(mode === 'strict' || mode === 'report', 'MODE', 'Expected strict or report mode');
  const source = jsonCopy(document);
  const checked = inspectVisual(source);
  requireMiro(checked.valid, 'VISUAL_INVALID', 'Visual document is invalid');
  const v = getVisual(source);
  requireMiro(v.kind === 'flow' && v.form === 'network', 'SUBSET', 'Only flow/network is supported');
  requireMiro(v.nodes && v.nodes.length >= 1 && v.nodes.length <= 15, 'SUBSET', 'Select 1–15 nodes');
  requireMiro(!v.groups?.length, 'SUBSET', 'Groups are not supported by this profile');
  const losses = retainedFields(source);
  requireMiro(mode !== 'strict' || losses.length === 0, 'RENDER_LOSS', 'Strict export refuses retained-only meaning; inspect report mode losses');
  return {
    source, mode, losses,
    shapes: [{logicalId: v.id, kind: 'question' as const, input: {shape: 'rectangle' as const, content: escapeLabel(v.question), x: 0, y: -180, width: 500, height: 100}}, ...v.nodes.map((node, i) => ({logicalId: node.id, kind: 'node' as const, input: {
      shape: 'rectangle' as const, content: escapeLabel(node.label),
      x: (i % 5) * 300, y: Math.floor(i / 5) * 180, width: 220, height: 100,
    }}))],
    connectors: (v.edges ?? []).map(edge => ({logicalId: edge.id, from: edge.from, to: edge.to, ...(edge.label !== undefined ? {label: edge.label} : {})})),
  };
}

function retainedFields(source: Document): MiroLoss[] {
  const losses: MiroLoss[] = [];
  const add = (path: string) => losses.push({path, code: 'RETAINED_ONLY', message: 'Preserved in companion source; not communicated by the Miro drawing'});
  const esc = (key: string) => key.replace(/~/g, '~0').replace(/\//g, '~1');
  const v = getVisual(source) as unknown as Record<string, unknown>;
  for (const key of Object.keys(v)) {
    if (['id', 'kind', 'form', 'question', 'nodes', 'edges'].includes(key)) continue;
    if (key === 'groups' && Array.isArray(v[key]) && !v[key].length) continue;
    add('/extensions/umf.visual/' + esc(key));
  }
  for (const list of ['nodes', 'edges'] as const) {
    for (const [i, item] of (v[list] as Record<string, unknown>[] | undefined ?? []).entries()) {
      const rendered = list === 'nodes' ? ['id', 'label'] : ['id', 'from', 'to', 'label'];
      for (const key of Object.keys(item)) if (!rendered.includes(key)) add(`/extensions/umf.visual/${list}/${i}/${esc(key)}`);
    }
  }
  for (const key of Object.keys(source)) {
    if (!['umf', 'id', 'vocabularies', 'extensions', 'modules'].includes(key)) add('/' + esc(key));
  }
  if (source.modules.length) add('/modules');
  for (const key of Object.keys(source.extensions ?? {})) if (key !== 'umf.visual') add('/extensions/' + esc(key));
  for (const [key, value] of Object.entries(source.vocabularies)) {
    if (key !== 'umf.visual' || !record(value) || Object.keys(value).some(k => k !== 'version')) add('/vocabularies/' + esc(key));
  }
  return losses;
}
