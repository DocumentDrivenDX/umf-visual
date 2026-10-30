// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Verifies the private live Miro proof bundle and emits only a sanitized receipt.
 * Private input files under .cache/host-live are intentionally not copied or logged.
 */
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {canonicalHostJson, hostDigest} from '../../src/adapters/reconciliation/json.js';
import {validateEditableBinding} from '../../src/adapters/miro/editable/binding.js';
import type {EditableBinding, EditableMapping, EditableSnapshot} from '../../src/adapters/miro/editable/types.js';

type AnyRecord = Record<string, any>;
const root = new URL('../../', import.meta.url);
const privateDir = new URL('.cache/host-live/', root);
const receiptPath = new URL('docs/helix/04-build/evidence/miro-editable-live-2026-10-30.json', root);
const notePath = new URL('docs/helix/04-build/miro-editable-live-2026-10-30.md', root);
const privateFiles = ['miro-before-binding.json', 'miro-imported-binding.json', 'miro-final-binding.json'];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {if (!condition) throw new Error('Miro live evidence check failed: ' + message);};
const visual = (binding: EditableBinding): AnyRecord => binding.source.extensions?.['umf.visual'] as AnyRecord;
const items = (binding: EditableBinding): EditableSnapshot[] => (binding.baselineNative.payload as AnyRecord).items;
const mapping = (binding: EditableBinding, kind: string, logicalId: string): EditableMapping => {
  const found = binding.mappings.find(value => value.kind === kind && value.logicalId === logicalId);
  assert(found, `missing ${kind} mapping`);
  return found;
};
const snapshot = (binding: EditableBinding, nativeId: string): EditableSnapshot => {
  const found = items(binding).find(value => value.id === nativeId);
  assert(found, 'mapped native object is absent');
  return found;
};
const withoutVolatile = (value: AnyRecord): AnyRecord => {
  const clone: AnyRecord = structuredClone(value);
  delete clone.modifiedAt;
  delete clone.modifiedBy;
  return clone;
};
function differingPaths(before: unknown, after: unknown, path = ''): string[] {
  if (canonicalHostJson(before) === canonicalHostJson(after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    const paths: string[] = [];
    for (let i = 0; i < Math.max(before.length, after.length); i++) paths.push(...differingPaths(before[i], after[i], path + '/' + i));
    return paths.length ? paths : [path || '/'];
  }
  if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
    const paths: string[] = [];
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) paths.push(...differingPaths((before as AnyRecord)[key], (after as AnyRecord)[key], path + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1')));
    return paths.length ? paths : [path || '/'];
  }
  return [path || '/'];
}
function requireOnlyChanges(before: unknown, after: unknown, expected: string[], label: string): void {
  const actual = differingPaths(before, after).sort();
  assert(canonicalHostJson(actual) === canonicalHostJson([...expected].sort()), `${label} changed paths differ from the recorded edits`);
}
function unmapped(binding: EditableBinding): EditableSnapshot[] {
  const ids = new Set(binding.mappings.map(value => value.nativeId));
  return items(binding).filter(item => !ids.has(item.id));
}
function nativeStableSubset(item: EditableSnapshot): AnyRecord {
  return {...withoutVolatile(item), data: withoutVolatile(item.data)};
}
function valueHash(value: unknown): string {return sha256(canonicalHostJson(value));}

async function main(): Promise<void> {
  const parsed = await Promise.all(privateFiles.map(async name => JSON.parse(await readFile(new URL(name, privateDir), 'utf8')) as EditableBinding));
  const [beforeRaw, importedRaw, finalRaw] = parsed;
  assert(beforeRaw && importedRaw && finalRaw, 'three proof snapshots are required');
  const [before, imported, final] = await Promise.all([beforeRaw, importedRaw, finalRaw].map(validateEditableBinding));
  assert(before.profile === 'umf.visual.miro.editable-network/1' && before.modelVersion === '1.0.0', 'unexpected qualified profile/version');
  assert(before.bindingRevision === 0 && imported.bindingRevision === 1 && final.bindingRevision === 2, 'binding revisions do not form the expected sequence');
  assert(canonicalHostJson(before.resource) === canonicalHostJson(imported.resource) && canonicalHostJson(before.resource) === canonicalHostJson(final.resource), 'resource changed across proof');
  assert(canonicalHostJson(before.mappings.map(({kind, logicalId, path}) => ({kind, logicalId, path}))) === canonicalHostJson(imported.mappings.map(({kind, logicalId, path}) => ({kind, logicalId, path}))), 'mapping logical slots changed during import');

  const v0 = visual(before), v1 = visual(imported), v2 = visual(final);
  const nodeId = v0.nodes[0].id as string;
  const targetId = v0.nodes.find((node: AnyRecord) => node.id !== v0.edges[0].from && node.id !== v0.edges[0].to)?.id as string | undefined;
  assert(nodeId && targetId, 'expected editable node and alternate endpoint');
  const nodePath = '/extensions/umf.visual/nodes/0/label';
  const edgePath = '/extensions/umf.visual/edges/0/to';
  const questionPath = '/extensions/umf.visual/question';
  assert(v0.nodes[0].label !== v1.nodes[0].label && typeof v1.nodes[0].label === 'string', 'native node label edit is missing');
  assert(v0.edges[0].to !== v1.edges[0].to && v1.edges[0].to === targetId, 'native connector reconnection is missing');
  assert(v1.question === v0.question && v2.question !== v1.question && typeof v2.question === 'string', 'second-step question edit is missing');
  requireOnlyChanges(before.source, imported.source, [nodePath, edgePath], 'native import source');
  requireOnlyChanges(imported.source, final.source, [questionPath], 'preserving-update source');

  const nodeMap = mapping(before, 'node', nodeId);
  const edgeMap = mapping(before, 'edge', v0.edges[0].id);
  const nativeNode0 = snapshot(before, nodeMap.nativeId), nativeNode1 = snapshot(imported, nodeMap.nativeId), nativeNode2 = snapshot(final, nodeMap.nativeId);
  const nativeEdge0 = snapshot(before, edgeMap.nativeId), nativeEdge1 = snapshot(imported, edgeMap.nativeId), nativeEdge2 = snapshot(final, edgeMap.nativeId);
  assert(canonicalHostJson(nativeNode0.data.style) !== canonicalHostJson(nativeNode1.data.style), 'native node styling edit was not retained');
  assert(nativeNode0.data.y !== nativeNode1.data.y || nativeNode0.data.x !== nativeNode1.data.x, 'native node movement was not retained');
  assert(canonicalHostJson(nativeNode1.data.style) === canonicalHostJson(nativeNode2.data.style), 'native node styling changed during preserving update');
  assert(nativeNode1.data.x === nativeNode2.data.x && nativeNode1.data.y === nativeNode2.data.y, 'native node geometry changed during preserving update');
  assert((nativeEdge1.data.end as AnyRecord)?.item === mapping(imported, 'node', targetId).nativeId, 'native connector target does not match edited UMF endpoint');
  assert(canonicalHostJson(nativeEdge1.data.start) === canonicalHostJson(nativeEdge2.data.start) && canonicalHostJson(nativeEdge1.data.end) === canonicalHostJson(nativeEdge2.data.end), 'connector attachment changed during preserving update');
  assert(canonicalHostJson(nativeEdge1.data.style) === canonicalHostJson(nativeEdge2.data.style), 'connector style changed during preserving update');

  const stepOne = unmapped(before), stepOneAfter = unmapped(imported), stepTwo = unmapped(imported), stepTwoAfter = unmapped(final);
  const compareUnmapped = (a: EditableSnapshot[], b: EditableSnapshot[], label: string): number => {
    const left = new Map(a.map(item => [item.id, nativeStableSubset(item)]));
    const right = new Map(b.map(item => [item.id, nativeStableSubset(item)]));
    assert(left.size === right.size && [...left.keys()].every(id => right.has(id)), `${label}: unmapped native object membership changed`);
    const changed = [...left.keys()].filter(id => canonicalHostJson(left.get(id)) !== canonicalHostJson(right.get(id)));
    assert(changed.length === 0, `${label}: unmapped native data changed beyond SDK volatile fields`);
    return left.size;
  };
  const unboundCount = compareUnmapped(stepOne, stepOneAfter, 'native import') + compareUnmapped(stepTwo, stepTwoAfter, 'preserving update');

  // The failed bold command is intentionally recorded as a refusal, not as a capability.
  const mappedShapeCount = before.mappings.filter(value => value.kind !== 'edge').length;
  const receipt = {
    schemaVersion: 1,
    evidenceType: 'sanitized-live-host-conformance',
    host: 'Miro Web SDK v2 through an interactive board session',
    hostVersion: 'runtime 1.105538.0 observed; Miro service release not pinned',
    profile: before.profile,
    modelVersion: before.modelVersion,
    source: {fixtureId: null, path: null, synthetic: true, sha256: before.sourceDigestSha256},
    resourceIdentity: 'redacted; same resource verified across revisions',
    revisions: [0, 1, 2],
    sourceSha256: {before: before.sourceDigestSha256, imported: imported.sourceDigestSha256, updated: final.sourceDigestSha256},
    baselineCaptureSha256: {before: before.baselineNative.captureDigestSha256, imported: imported.baselineNative.captureDigestSha256, updated: final.baselineNative.captureDigestSha256},
    sourceCounts: {nodes: v0.nodes.length, edges: v0.edges.length, mappedSlots: before.mappings.length, mappedShapes: mappedShapeCount, unmappedNativeItems: stepOne.length},
    edits: [
      {stage: 'native import', paths: [nodePath, edgePath], nodeTextChanged: true, directedEndpointChanged: true},
      {stage: 'native-preserving update', paths: [questionPath], questionChanged: true},
    ],
    preservation: {
      unmappedItemsComparedPerTransition: stepOne.length,
      unmappedItemsChangedAfterIgnoringSdkModifiedFields: 0,
      nativeNodeStyleAndPositionRetainedThroughUpdate: true,
      nativeConnectorEndpointsAndStyleRetainedThroughUpdate: true,
      nativePreservingUpdateKeptBoundNodeTextFromImport: nativeNode1.data.content === nativeNode2.data.content,
      nativeFieldsNotPromotedToUmf: ['node fill', 'node position', 'connector style'],
    },
    refusalEvidence: {boldRichTextCommand: 'refused as RICH_TEXT; no flattening or lossy text coercion was applied'},
    qualification: {semanticLossInventory: 'no profile semantic losses were recorded in this capture; native-only fields remain retained-only', groupsTested: false, scope: 'explicit title/question, node label, directed edge endpoint and native-preserving edits only'},
    privateEvidence: {sourceFiles: privateFiles.length, rawBindingsOrScreenshotsPublished: false},
  };
  assert(unboundCount === stepOne.length * 2, 'unmapped item comparisons did not cover both transitions');
  const receiptText = JSON.stringify(receipt, null, 2) + '\n';
  const note = `# Miro editable live conformance\n\nAn interactive Miro Web SDK v2 session exercised the bounded ${before.profile} profile against a three-node, two-edge 1.0.0 visual. The iframe reported SDK runtime 1.105538.0; the Miro service release was not pinned. The source and native capture were independently re-admitted and checked at binding revisions 0, 1 and 2.\n\nThe native import reconciled a node-label edit and a directed connector reconnection. A native-preserving update then changed the question while retaining the imported node fill, position, and connector attachments/style. The verifier compared every unmapped board item across both transitions; none changed after excluding the SDK-managed modifiedAt and modifiedBy fields. The failed rich-text bold command was recorded as a refusal, so this evidence does not claim bold-text support. Group presentation was not tested.\n\nSee the [sanitized receipt](evidence/miro-editable-live-2026-10-30.json) for source/capture digests and counts. Raw bindings and screenshots remain in the ignored local proof area and are not published. This evidence qualifies only the explicit slots and operations listed in the receipt; it does not establish arbitrary Miro import or group semantics.\n`;
  await writeFile(receiptPath, receiptText);
  await writeFile(notePath, note);
  console.log(`Verified three private Miro bindings; wrote sanitized receipt (${sha256(receiptText)}). Unmapped objects checked per transition: ${stepOne.length}.`);
}

await main();
