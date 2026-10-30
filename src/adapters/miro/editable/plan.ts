// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '@umf/core';
import {getVisual, inspectVisual} from '../../../extensions/visual/index.js';
import {copyJson, requireEditable} from './json.js';
import {hostDigest} from '../../reconciliation/json.js';
import {MIRO_EDITABLE_PROFILE, type EditableLoss, type EditableMode, type EditablePlan} from './types.js';

const rootFields = new Set(['id', 'kind', 'form', 'question', 'title', 'nodes', 'edges', 'groups']);
const nodeFields = new Set(['id', 'label', 'group']);
const edgeFields = new Set(['id', 'from', 'to', 'label']);
const groupFields = new Set(['id', 'label', 'role']);
const esc = (key: string) => key.replace(/~/g, '~0').replace(/\//g, '~1');

export async function planEditableMiroExport(document: Document, mode: EditableMode = 'strict'): Promise<EditablePlan> {
  requireEditable(mode === 'strict' || mode === 'report', 'MODE', 'Expected strict or report mode');
  const source = copyJson(document);
  const inspection = inspectVisual(source);
  requireEditable(inspection.valid, 'VISUAL_INVALID', 'Visual document is invalid');
  const visual = getVisual(source);
  requireEditable(visual.kind === 'flow' && visual.form === 'network', 'SUBSET', 'Editable Miro profile supports only flow/network');
  const version = source.vocabularies['umf.visual']?.version;
  requireEditable(version === '1.0.0' || version === '1.1.0', 'VERSION', 'Select Visual 1.0.0 or 1.1.0 explicitly');
  requireEditable(visual.nodes !== undefined && visual.nodes.length > 0, 'SUBSET', 'At least one semantic node is required');
  requireEditable(visual.nodes.length <= (version === '1.0.0' ? 15 : 64), 'LIMIT', version === '1.0.0' ? 'Visual 1.0 supports at most 15 nodes' : 'Editable Miro profile supports at most 64 nodes in Visual 1.1');
  requireEditable((visual.edges?.length ?? 0) <= 256, 'LIMIT', 'Editable Miro profile supports at most 256 edges');
  requireEditable((visual.groups?.length ?? 0) <= 32, 'LIMIT', 'Editable Miro profile supports at most 32 groups');
  const parentByGroup = new Map((visual.groups ?? []).map(group => [group.id, group.parent]));
  for (const group of visual.groups ?? []) {
    let depth = 1, parent = group.parent;
    while (parent !== undefined) {
      depth++; parent = parentByGroup.get(parent);
      requireEditable(depth <= 8, 'LIMIT', 'Editable Miro profile supports at most eight common group levels');
    }
  }
  const losses: EditableLoss[] = [];
  const add = (path: string, family: EditableLoss['family'], representation: EditableLoss['representation'], message: string, code = 'RETAINED_ONLY') => losses.push({path, code, family, representation, message});
  const payload = source.extensions?.['umf.visual'] as unknown as Record<string, unknown>;
  for (const key of Object.keys(payload)) if (!rootFields.has(key)) add('/extensions/umf.visual/' + esc(key), 'semantic', 'retained-only', 'Preserved in the binding source; the editable Miro surface has no qualified editable slot for this field.');
  for (const [index, node] of visual.nodes.entries()) for (const key of Object.keys(node)) if (!nodeFields.has(key)) add('/extensions/umf.visual/nodes/' + index + '/' + esc(key), 'semantic', 'retained-only', 'Preserved in the binding source; this node field is not represented by an editable Miro slot.');
  for (const [index, edge] of (visual.edges ?? []).entries()) for (const key of Object.keys(edge)) if (!edgeFields.has(key)) add('/extensions/umf.visual/edges/' + index + '/' + esc(key), 'semantic', 'retained-only', 'Preserved in the binding source; this edge field is not represented by an editable Miro slot.');
  const groupMembers = new Map((visual.groups ?? []).map(group => [group.id, [] as string[]]));
  visual.nodes.forEach(node => {if (node.group !== undefined) groupMembers.get(node.group)?.push(node.id);});
  const groups: EditablePlan['groups'] = [];
  for (const [index, group] of (visual.groups ?? []).entries()) {
    for (const key of Object.keys(group)) if (!groupFields.has(key)) add('/extensions/umf.visual/groups/' + index + '/' + esc(key), 'semantic', 'retained-only', 'Preserved in source; native group nesting and supplemental properties are not editable common group fields.');
    const members = groupMembers.get(group.id) ?? [];
    if (members.length < 2) add('/extensions/umf.visual/groups/' + index, 'semantic', 'unrepresented', 'Miro groups require at least two members; this group membership cannot be created in the qualified profile.', 'GROUP_MEMBERS');
    else if (group.parent !== undefined) add('/extensions/umf.visual/groups/' + index + '/parent', 'semantic', 'unrepresented', 'Nested common groups are not represented as nested Miro groups in this profile.', 'GROUP_NESTING');
    else groups.push({logicalId: group.id, members, index});
    add('/extensions/umf.visual/groups/' + index + '/label', 'semantic', 'retained-only', 'Miro native groups have no corresponding editable group label field.');
    add('/extensions/umf.visual/groups/' + index + '/role', 'semantic', 'retained-only', 'Miro grouping expresses presentation membership; it does not carry the common group role.');
  }
  for (const key of Object.keys(source)) if (!['umf', 'id', 'vocabularies', 'extensions', 'modules'].includes(key)) add('/' + esc(key), 'semantic', 'retained-only', 'Preserved core document field is outside the editable Miro profile.');
  if (source.modules.length) add('/modules', 'semantic', 'retained-only', 'UMF modules remain in the source binding and are not editable board fields.');
  for (const key of Object.keys(source.extensions ?? {})) if (key !== 'umf.visual') add('/extensions/' + esc(key), 'semantic', 'retained-only', 'Preserved extension is not represented by the editable Miro drawing.');
  for (const [key, value] of Object.entries(source.vocabularies)) if (key !== 'umf.visual' || Object.keys(value).some(field => field !== 'version')) add('/vocabularies/' + esc(key), 'semantic', 'retained-only', 'Preserved vocabulary metadata is not represented by this board drawing.');
  requireEditable(mode === 'report' || losses.length === 0, 'RENDER_LOSS', 'Strict export refuses source fields not fully represented by the Miro editable profile.');
  return {
    profile: MIRO_EDITABLE_PROFILE, modelVersion: version, source, sourceDigestSha256: await hostDigest(source), mode, losses,
    nodes: visual.nodes.map((node, index) => ({logicalId: node.id, label: node.label, index})),
    ...(visual.title !== undefined ? {title: visual.title} : {}), question: visual.question,
    edges: (visual.edges ?? []).map((edge, index) => ({logicalId: edge.id, from: edge.from, to: edge.to, ...(edge.label !== undefined ? {label: edge.label} : {}), index})), groups,
  };
}
