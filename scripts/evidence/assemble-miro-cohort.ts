// SPDX-License-Identifier: MIT OR Apache-2.0
/** Verify private interactive Miro cohort receipts and publish sanitized previews. */
import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {join, resolve, sep} from 'node:path';
import type {Document} from '@umf/core';
import {hostDigest, canonicalHostJson} from '../../src/adapters/reconciliation/json.js';
import {planEditableMiroExport, validateEditableBinding} from '../../src/adapters/miro/editable/index.js';
import {readVisualDocument} from '../../src/index.js';
import type {EditableBinding, EditableMapping, EditableSnapshot} from '../../src/adapters/miro/editable/types.js';
import type {RendererTargetEvidence} from '../catalog/renderer-types.js';
import {compareUnownedSnapshots} from '../../examples/miro/recovery-evidence.js';

const root = resolve(import.meta.dir, '../..');
const privateDir = join(root, '.cache/p12-miro');
const fixtureDir = join(root, 'fixtures/integrations/complex-miro/common');
const outputDir = join(root, 'fixtures/renderers/miro');
const ids = ['nested-environments', 'process-documents-store', 'network-16x24', 'frames-headings-annotations', 'curved-caption-cross-boundary'];
const profileId = 'umf.visual.miro.editable-network/1';
const mappingVersion = '1';
const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {if (!condition) throw new Error(message);};
const posix = (value: string) => value.split(sep).join('/');
type AnyRecord = Record<string, any>;
type StageEnvelope = {binding: EditableBinding; document: Document; yaml: string; status: string; preEditNoopChanges?: number; roundTrip?: {checks?: {noop?: boolean}}};
type CapturePoint = {revision: string; revisionKind: string; captureDigestSha256: string};

async function readJson(path: string): Promise<any> { return JSON.parse(await readFile(path, 'utf8')); }
function visual(doc: Document): AnyRecord {return doc.extensions?.['umf.visual'] as AnyRecord;}
function hashPattern(value: unknown): value is string {return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);}
export function readMiroPreviewImageSize(bytes: Uint8Array): {width: number; height: number; mediaType: 'image/png'|'image/jpeg'; extension: 'png'|'jpg'} {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  let width = 0, height = 0, mediaType: 'image/png'|'image/jpeg', extension: 'png'|'jpg';
  if (bytes.length >= 24 && signature.every((value, index) => bytes[index] === value)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    width = view.getUint32(16); height = view.getUint32(20); mediaType = 'image/png'; extension = 'png';
  } else {
    assert(bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8, 'Miro preview asset is neither PNG nor JPEG.');
    mediaType = 'image/jpeg'; extension = 'jpg';
    for (let offset = 2; offset + 4 < bytes.length;) {
      if (bytes[offset] !== 0xff) {offset++; continue;}
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++]!;
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      const length = (bytes[offset]! << 8) | bytes[offset + 1]!;
      assert(length >= 2 && offset + length <= bytes.length, 'Miro JPEG preview has a malformed segment.');
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        height = (bytes[offset + 3]! << 8) | bytes[offset + 4]!;
        width = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
        break;
      }
      offset += length;
    }
  }
  assert(width > 0 && height > 0 && width <= 10000 && height <= 10000, 'Miro preview dimensions are outside the accepted range.');
  return {width, height, mediaType, extension};
}
function point(value: any, label: string): CapturePoint {
  assert(value && typeof value === 'object', `${label} is missing.`);
  const revisionKind = typeof value.revisionKind === 'string' ? value.revisionKind
    : value.revision && typeof value.revision.kind === 'string' ? value.revision.kind : undefined;
  const revision = typeof value.revision === 'string' ? value.revision
    : typeof value.revisionValue === 'string' ? value.revisionValue
      : value.revision && typeof value.revision.value === 'string' ? value.revision.value
        : revisionKind === 'content-digest' && hashPattern(value.captureDigestSha256) ? value.captureDigestSha256 : undefined;
  assert(revision && revisionKind && hashPattern(value.captureDigestSha256), `${label} lacks a revision and valid capture digest.`);
  return {revision, revisionKind, captureDigestSha256: value.captureDigestSha256};
}

/** Validate the two SDK captures emitted by the private capture-fence action. */
export function validateMiroCaptureFence(input: unknown, mappingCount: number): {before: CapturePoint; after: CapturePoint} {
  const fence = input as AnyRecord;
  assert(fence && typeof fence === 'object', 'Miro capture fence is missing.');
  const before = point(fence.before ?? fence.baseline, 'Miro capture fence before');
  const after = point(fence.after ?? fence.observed, 'Miro capture fence after');
  assert(before.revisionKind === after.revisionKind && before.revision === after.revision, 'Miro capture revision changed between SDK observations.');
  assert(before.revisionKind === 'content-digest', 'Miro capture revision is not the qualified content-digest form.');
  assert(before.captureDigestSha256 === after.captureDigestSha256, 'Miro capture digest changed between SDK observations.');
  assert((fence.stableSecondCapture ?? fence.observed?.stableSecondCapture) === true, 'Miro SDK did not confirm a stable second capture.');
  assert(Number.isSafeInteger(mappingCount) && mappingCount > 0 && fence.mappedObjectCount === mappingCount, 'Miro fence mapped-object count differs from the complete binding.');
  assert((fence.mappedObjectsChangedFromBaseline ?? fence.observed?.mappedObjectsChangedFromBaseline) === 0, 'Miro mapped objects changed since the restored binding capture.');
  return {before, after};
}

function stageDocument(stage: StageEnvelope, id: string, name: string): Document {
  assert(stage && typeof stage === 'object' && stage.binding && stage.document && typeof stage.yaml === 'string' && typeof stage.status === 'string', `${id} ${name} stage envelope is incomplete.`);
  const yaml = readVisualDocument(stage.yaml, 'yaml');
  assert(canonicalHostJson(yaml) === canonicalHostJson(stage.document), `${id} ${name} YAML persistence differs from its JSON document.`);
  const json = readVisualDocument(JSON.stringify(stage.document), 'json');
  assert(canonicalHostJson(json) === canonicalHostJson(stage.document), `${id} ${name} JSON persistence differs from its parsed document.`);
  assert(canonicalHostJson(stage.binding.source) === canonicalHostJson(stage.document), `${id} ${name} binding source differs from its saved source textarea.`);
  return stage.document;
}
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
function sameMappings(a: EditableBinding, b: EditableBinding): boolean {
  const project = (binding: EditableBinding) => binding.mappings.map(({kind, logicalId, path, nativeId, nativeScope}) => ({kind, logicalId, path, nativeId, nativeScope}));
  return canonicalHostJson(project(a)) === canonicalHostJson(project(b));
}
function nativeItem(binding: EditableBinding, mapping: EditableMapping): EditableSnapshot {
  const items = (binding.baselineNative.payload as unknown as {items: EditableSnapshot[]}).items;
  const found = items.find(item => item.id === mapping.nativeId);
  assert(found, `Mapped native ${mapping.kind} disappeared from its captured binding.`);
  return found;
}
function compareUnowned(before: EditableBinding, after: EditableBinding, label: string): AnyRecord {
  const left = (before.baselineNative.payload as unknown as {items: EditableSnapshot[]}).items;
  const right = (after.baselineNative.payload as unknown as {items: EditableSnapshot[]}).items;
  const mapped = new Set(before.mappings.map(value => value.nativeId));
  const comparison = compareUnownedSnapshots(left, right, mapped);
  assert(comparison.preserved && comparison.unqualifiedPaths.length === 0 && comparison.missingIds.length === 0,
    `${label} changed or removed unowned native content outside the explicitly qualified Miro normalization cases.`);
  return {priorCount: comparison.priorCount, currentCount: comparison.currentCount,
    newlyObservedCount: comparison.newlyObservedIds.length, qualifiedMetadataDriftCount: comparison.qualifiedDrift.length,
    unqualifiedChangeCount: comparison.unqualifiedPaths.length, missingObjectCount: comparison.missingIds.length};
}
function semanticLosses(binding: EditableBinding): unknown[] {return binding.losses.filter(loss => loss.family === 'semantic');}
function parsedStatus(stage: StageEnvelope): AnyRecord | undefined {
  const marker = stage.status.indexOf('\n{');
  if (marker < 0) return undefined;
  try { return JSON.parse(stage.status.slice(marker + 1)); } catch { return undefined; }
}
function recoveryAttestation(stage: StageEnvelope, id: string, expectedSourceSha: string): AnyRecord | undefined {
  const attestation = parsedStatus(stage)?.recoveryAttestation;
  if (!attestation) return undefined;
  assert(attestation.evidenceType === 'umf.visual.miro.read-only-recovery/1' && attestation.caseId === id,
    `${id} recovery receipt has the wrong evidence type or case identity.`);
  assert(attestation.fixtureSourceSha256 === expectedSourceSha && attestation.writesPerformedByRecovery === false &&
    attestation.atomicityClaimed === false && attestation.interruptedReceiptRetained === true &&
    attestation.interruptedReceiptState === 'interrupted', `${id} recovery receipt does not preserve the failed write as a separate non-atomic event.`);
  assert(attestation.stableCaptures === true && Array.isArray(attestation.captureDigests) && attestation.captureDigests.length === 2 &&
    attestation.captureDigests[0] === attestation.captureDigests[1] && hashPattern(attestation.interruptedReceiptSha256),
    `${id} recovery receipt lacks two agreeing fresh captures or the retained interruption digest.`);
  const checks = attestation.checks;
  assert(checks && ['expectedSourceReconstructed', 'fullIdentityMapPresentAndStable', 'nodePositionPreserved', 'nodeFillPreserved',
    'expectedDirectedEndpointsObserved', 'priorUnownedObjectsRetained', 'newlyObservedUnownedObjectsStableAcrossCaptures'].every(key => checks[key] === true),
    `${id} recovery receipt does not prove all required mapped-object checks.`);
  const unowned = attestation.unownedObjectComparison;
  assert(unowned && unowned.unqualifiedPaths?.length === 0 && unowned.missingIds?.length === 0 &&
    Number.isSafeInteger(unowned.priorCount) && Number.isSafeInteger(unowned.currentCount), `${id} recovery has unqualified or missing unowned content.`);
  return attestation;
}
function noopChanges(stage: StageEnvelope): number | undefined {
  if (Number.isSafeInteger(stage.preEditNoopChanges)) return stage.preEditNoopChanges;
  if (stage.roundTrip?.checks?.noop === true) return 0;
  try {
    const marker = stage.status.indexOf('\n{');
    const details = marker >= 0 ? JSON.parse(stage.status.slice(marker + 1)) : undefined;
    if (Number.isSafeInteger(details?.preEditNoopChanges)) return details.preEditNoopChanges;
    if (Number.isSafeInteger(details?.preEditImport?.changes)) return details.preEditImport.changes;
    if (Array.isArray(details?.preEditImport?.changes)) return details.preEditImport.changes.length;
    if (Number.isSafeInteger(details?.preEditImport?.changeCount)) return details.preEditImport.changeCount;
  } catch { /* Status text is informational unless it contains a valid structured witness. */ }
  return undefined;
}

export async function verifyMiroCase(id: string, privateRoot = privateDir, sourcesRoot = fixtureDir): Promise<{entry: AnyRecord; imagePath: string; imageBytes: Uint8Array}> {
  const sourcePath = join(sourcesRoot, `${id}.json`);
  const sourceBytes = await readFile(sourcePath), source = JSON.parse(sourceBytes.toString('utf8')) as Document;
  const sourceSha = sha256(sourceBytes), sourceDigest = await hostDigest(source);
  const prefix = join(privateRoot, id);
  const [exported, nativeEdits, imported, updated, restored] = await Promise.all(['exported', 'native-edits', 'imported', 'updated', 'restored'].map(async suffix =>
    await readJson(`${prefix}-${suffix}.json`) as StageEnvelope));
  const docs = {exported: stageDocument(exported, id, 'export'), imported: stageDocument(imported, id, 'import'),
    updated: stageDocument(updated, id, 'update'), restored: stageDocument(restored, id, 'restore')};
  for (const [name, stage] of Object.entries({exported, imported, updated, restored})) {
    const binding = await validateEditableBinding(stage.binding);
    assert(binding.state === 'complete' && binding.profile === profileId, `${id} ${name} binding is incomplete or has the wrong profile.`);
    assert(binding.modelVersion === source.vocabularies['umf.visual']?.version, `${id} ${name} binding model version differs from source.`);
    assert(await hostDigest(binding.source) === await hostDigest(stage.document), `${id} ${name} binding source differs from its document.`);
    stage.binding = binding;
  }
  assert(source.vocabularies['umf.visual']?.version === exported.binding.modelVersion, `${id} source model version differs from the export binding.`);
  assert(await hostDigest(docs.exported) === sourceDigest, `${id} exported stage does not contain the exact original source.`);
  assert(await hostDigest(docs.restored) === sourceDigest, `${id} restored stage does not contain the exact original source.`);
  assert(await hostDigest(restored.binding.source) === sourceDigest, `${id} final binding does not contain the exact original source.`);
  const plan = await planEditableMiroExport(source, 'report');
  for (const [name, stage] of Object.entries({exported, imported, updated, restored})) {
    assert(canonicalHostJson(semanticLosses(stage.binding)) === canonicalHostJson(plan.losses), `${id} ${name} semantic loss inventory differs from current plan.`);
  }
  assert(exported.binding.bindingRevision < imported.binding.bindingRevision && imported.binding.bindingRevision < updated.binding.bindingRevision && updated.binding.bindingRevision < restored.binding.bindingRevision,
    `${id} stage revisions are not strictly increasing.`);
  assert(exported.binding.resource.host === 'miro' && exported.binding.resource.documentId === imported.binding.resource.documentId &&
    exported.binding.resource.documentId === updated.binding.resource.documentId && exported.binding.resource.documentId === restored.binding.resource.documentId,
    `${id} stage bindings switched host resources.`);
  assert(sameMappings(exported.binding, imported.binding) && sameMappings(imported.binding, updated.binding) && sameMappings(updated.binding, restored.binding), `${id} mapped native identities changed across the cycle.`);
  const importChanges = ['/extensions/umf.visual/edges/0/to', '/extensions/umf.visual/nodes/0/label'];
  if (visual(source).nodes.length === 2) importChanges.push('/extensions/umf.visual/edges/0/from');
  assert(canonicalHostJson(differingPaths(docs.exported, docs.imported).sort()) === canonicalHostJson(importChanges.sort()), `${id} native import differs from the qualified label/endpoint edits.`);
  assert(canonicalHostJson(differingPaths(docs.imported, docs.updated).sort()) === canonicalHostJson(['/extensions/umf.visual/question']), `${id} preserving update changed fields beyond the question.`);
  assert(canonicalHostJson(docs.restored) === canonicalHostJson(source), `${id} restore document is not the original source.`);
  assert(imported.status.includes('Two-capture import completed'), `${id} imported stage does not record the actual native readback action.`);
  const recoveries = [
    {stage: 'update', attestation: recoveryAttestation(updated, id, sourceSha)},
    {stage: 'restore', attestation: recoveryAttestation(restored, id, sourceSha)},
  ].filter(item => item.attestation) as Array<{stage: string; attestation: AnyRecord}>;
  for (const recovery of recoveries) {
    assert(recovery.attestation.sourceDigestSha256 === await hostDigest(recovery.stage === 'update' ? docs.updated : docs.restored),
      `${id} ${recovery.stage} recovery readback digest does not match its saved document.`);
    assert(recovery.attestation.recoveredBindingRevision === (recovery.stage === 'update' ? updated.binding.bindingRevision : restored.binding.bindingRevision),
      `${id} ${recovery.stage} recovery revision does not match its saved binding.`);
    assert(recovery.attestation.persistence?.jsonRoundTrip === true && recovery.attestation.persistence?.yamlRoundTrip === true,
      `${id} ${recovery.stage} recovery did not verify JSON and YAML persistence.`);
  }

  const original = visual(source), nativeEdit = visual(docs.imported), desired = visual(docs.updated);
  const node = original.nodes[0], edge = original.edges[0];
  assert(original.nodes.length >= 2 && edge, `${id} has no qualified node/edge pair.`);
  const alternate = original.nodes.length === 2 ? edge.from : original.nodes.find((candidate: AnyRecord) => candidate.id !== edge.from && candidate.id !== edge.to)?.id;
  assert(alternate, `${id} has no valid alternate connector target.`);
  const expectedFrom = original.nodes.length === 2 ? edge.to : edge.from;
  assert(nativeEdit.nodes[0].label === `${node.label} — Native edit`, `${id} imported node label differs from the explicit SDK edit.`);
  assert(nativeEdit.edges[0].from === expectedFrom && nativeEdit.edges[0].to === alternate, `${id} imported connector does not match the explicit endpoint edit.`);
  assert(desired.nodes[0].label === nativeEdit.nodes[0].label && desired.edges[0].from === nativeEdit.edges[0].from && desired.edges[0].to === nativeEdit.edges[0].to,
    `${id} preserving UMF update overwrote native-edited text or endpoints.`);
  assert(desired.question === `${nativeEdit.question} (updated in UMF)`, `${id} update did not change only the question as requested.`);

  const sourceNodeMap = exported.binding.mappings.find(m => m.kind === 'node' && m.logicalId === node.id)!;
  const sourceEdgeMap = exported.binding.mappings.find(m => m.kind === 'edge' && m.logicalId === edge.id)!;
  const nodeByStage = [imported, updated, restored].map(stage => nativeItem(stage.binding, stage.binding.mappings.find(m => m.kind === 'node' && m.logicalId === node.id)!));
  const originalNode = nativeItem(exported.binding, sourceNodeMap);
  const changedNode = nodeByStage[0]!;
  assert(changedNode.data.x === Number(originalNode.data.x) + 80 && changedNode.data.y === Number(originalNode.data.y) + 60,
    `${id} native SDK position edit does not match the witnessed +80/+60 movement.`);
  assert(String((changedNode.data.style as AnyRecord)?.fillColor).toLowerCase() === '#00ffff', `${id} native SDK fill edit is missing.`);
  for (const snapshot of nodeByStage.slice(1)) {
    assert(snapshot.data.x === changedNode.data.x && snapshot.data.y === changedNode.data.y &&
      String((snapshot.data.style as AnyRecord)?.fillColor).toLowerCase() === '#00ffff', `${id} update/restore failed to preserve native position and fill.`);
  }
  const edgeByStage = [imported, updated, restored].map(stage => nativeItem(stage.binding, stage.binding.mappings.find(m => m.kind === 'edge' && m.logicalId === edge.id)!));
  const changedEdge = edgeByStage[0]!;
  const expectedFromNative = imported.binding.mappings.find(m => m.kind === 'node' && m.logicalId === expectedFrom)!.nativeId;
  const expectedToNative = imported.binding.mappings.find(m => m.kind === 'node' && m.logicalId === alternate)!.nativeId;
  assert((changedEdge.data.start as AnyRecord)?.item === expectedFromNative && (changedEdge.data.end as AnyRecord)?.item === expectedToNative,
    `${id} imported native connector attachments disagree with reconciled directed endpoints.`);
  const updatedEdge = edgeByStage[1]!;
  assert(canonicalHostJson({start: updatedEdge.data.start, end: updatedEdge.data.end, style: updatedEdge.data.style}) ===
    canonicalHostJson({start: changedEdge.data.start, end: changedEdge.data.end, style: changedEdge.data.style}), `${id} preserving update changed native connector attachments or style.`);
  const originalFromNative = exported.binding.mappings.find(m => m.kind === 'node' && m.logicalId === edge.from)!.nativeId;
  const originalToNative = exported.binding.mappings.find(m => m.kind === 'node' && m.logicalId === edge.to)!.nativeId;
  const restoredEdge = edgeByStage[2]!;
  assert((restoredEdge.data.start as AnyRecord)?.item === originalFromNative && (restoredEdge.data.end as AnyRecord)?.item === originalToNative,
    `${id} restored native connector does not return to the source fixture endpoints.`);
  assert(canonicalHostJson(restoredEdge.data.style) === canonicalHostJson(updatedEdge.data.style), `${id} source restore changed native connector style.`);
  const unownedComparisons = [
    compareUnowned(exported.binding, imported.binding, `${id} native import`),
    compareUnowned(imported.binding, updated.binding, `${id} preserving update`),
    compareUnowned(updated.binding, restored.binding, `${id} source restore`),
  ];
  const unownedCount = unownedComparisons.reduce((sum, comparison) => sum + comparison.priorCount, 0);

  const fenceRaw = await readJson(`${prefix}-fence.json`);
  assert(fenceRaw.sourceSha256 === sourceSha && fenceRaw.bindingRevision === restored.binding.bindingRevision, `${id} capture fence is not bound to the restored source revision.`);
  const fence = validateMiroCaptureFence(fenceRaw, restored.binding.mappings.length);
  assert(restored.binding.baselineNative.revision.kind === 'content-digest' &&
    restored.binding.baselineNative.revision.value === restored.binding.baselineNative.captureDigestSha256 &&
    restored.binding.baselineNative.captureDigestSha256 === fence.after.captureDigestSha256,
    `${id} capture fence does not match the restored binding's actual content-digest revision.`);
  const imagePath = `${prefix}.png`, imageBytes = await readFile(imagePath), dimensions = readMiroPreviewImageSize(imageBytes), assetSha = sha256(imageBytes);
  const assetRel = `assets/${id}-${assetSha.slice(0, 16)}.${dimensions.extension}`;
  // Native-only loss paths contain private board object IDs; publish the source plan losses only.
  const losses = semanticLosses(restored.binding);
  const status = semanticLosses(restored.binding).length ? 'reported-loss' : 'supported';
  const target: RendererTargetEvidence = {rendererId: 'miro', profileId, modelVersion: restored.binding.modelVersion, mappingVersion,
    projection: {state: 'emitted', status, diagnostics: [], losses},
    preview: {state: 'rendered', engine: 'miro', nativeVersion: 'Miro observed service 1.105564.0 / Web SDK v2 (unpinned)',
      sourceSha256: sourceSha, profileId, modelVersion: restored.binding.modelVersion, mappingVersion,
      captureDigestSha256: fence.after.captureDigestSha256, revision: fence.after.revision, stage: 'restored-original',
      asset: {path: `integrations/previews/miro/${id}-${assetSha.slice(0, 16)}.${dimensions.extension}`, sha256: assetSha, mediaType: dimensions.mediaType, width: dimensions.width, height: dimensions.height}},
  };
  const noOpCount = noopChanges(nativeEdits);
  assert(noOpCount === 0, `${id} imported stage lacks a recorded successful pre-edit no-op import.`);
  target.roundTrip = {state: 'passed', sourceSha256: sourceSha, profileId, modelVersion: restored.binding.modelVersion, mappingVersion,
    checks: {noop: true, label: true, reconnection: true, movement: true, style: true, jsonPersistence: true, yamlPersistence: true, preservingUpdate: true, readback: true},
    attestation: {kind: 'miro-web-sdk', nativeWritesObserved: true, captureFenceVerified: true,
      revisionKind: 'content-digest', serverCas: false, atomicRevision: false,
      unownedContentRetainedExceptRecordedMetadataDrift: true,
      readonlyRecoveryStages: recoveries.map(item => item.stage),
      interruptedWritesRetained: recoveries.map(item => ({stage: item.stage, causeCodes: item.attestation.interruptedReceiptCauseChain?.map((cause: AnyRecord) => cause.code).filter(Boolean) ?? [],
        receiptSha256: item.attestation.interruptedReceiptSha256, recoveryWritesPerformed: false, atomicityClaimed: false,
        unownedPriorCount: item.attestation.unownedObjectComparison.priorCount, unownedCurrentCount: item.attestation.unownedObjectComparison.currentCount,
      qualifiedMetadataDriftCount: item.attestation.unownedObjectComparison.qualifiedNativeOnlyDrift?.length ?? 0,
        newlyObservedUnownedCount: item.attestation.unownedObjectComparison.newlyObservedIds?.length ?? 0}))}};
  const safePair = {before: {revision: fence.before.revision, captureDigestSha256: fence.before.captureDigestSha256},
    after: {revision: fence.after.revision, captureDigestSha256: fence.after.captureDigestSha256}};
  return {imagePath, imageBytes, entry: {id, source: {path: `fixtures/integrations/complex-miro/common/${id}.json`, sha256: sourceSha},
    captureFence: safePair, rendererTargets: [target], assetSourcePath: `fixtures/renderers/miro/${assetRel}`,
    preservation: {nativeNodePositionAndFillRetained: true, nativeConnectorAttachmentsAndStyleRetained: true,
      unownedObjectsComparedAcrossThreeTransitions: unownedComparisons, totalUnownedSnapshotsCompared: unownedCount,
      volatileFieldsExcluded: ['modifiedAt', 'modifiedBy'], sourceRestored: true}}};
}

/** Publish only source hashes, capture digests/counts and isolated synthetic preview images. */
export async function assembleMiroCohort(options: {privateDirectory?: string} = {}): Promise<string> {
  const privateRoot = options.privateDirectory ?? privateDir;
  const entries: AnyRecord[] = [], images: Array<{source: string; destination: string}> = [];
  for (const id of ids) {
    const result = await verifyMiroCase(id, privateRoot);
    entries.push(result.entry);
    images.push({source: result.imagePath, destination: join(outputDir, result.entry.assetSourcePath.slice('fixtures/renderers/miro/'.length))});
  }
  await mkdir(join(outputDir, 'assets'), {recursive: true});
  for (const image of images) await copyFile(image.source, image.destination);
  const outputPath = join(outputDir, 'preview-receipt.json'), tempPath = `${outputPath}.tmp`;
  await writeFile(tempPath, JSON.stringify({schemaVersion: 1, rendererId: 'miro', cases: entries}, null, 2) + '\n');
  await rename(tempPath, outputPath);
  return posix(outputPath);
}

if (import.meta.main) {
  console.log(`Wrote sanitized Miro cohort evidence: ${await assembleMiroCohort()}`);
}
