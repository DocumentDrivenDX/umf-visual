// SPDX-License-Identifier: MIT OR Apache-2.0
/** Validate private Google Slides captures, then publish only sanitized preview evidence. */
import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {join, resolve, sep} from 'node:path';
import type {Document} from '@umf/core';
import {hostDigest, canonicalHostJson} from '../../src/adapters/reconciliation/json.js';
import {importGoogleSlidesEdits, observeGoogleSlides} from '../../src/adapters/google-slides/index.js';
import type {GoogleSlidesBinding, GoogleSlidesObservation} from '../../src/adapters/google-slides/types.js';
import type {RendererTargetEvidence} from '../catalog/renderer-types.js';

const root = resolve(import.meta.dir, '../..');
const privateDir = join(root, '.cache/p12-slides');
const fixtureDir = join(root, 'fixtures/integrations/complex-miro/common');
const outputDir = join(root, 'fixtures/renderers/google-slides');
const ids = ['nested-environments', 'process-documents-store', 'network-16x24', 'frames-headings-annotations', 'curved-caption-cross-boundary'];
const profileId = 'umf.visual.google-slides.network/1';
const mappingVersion = '1';
const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const posix = (value: string) => value.split(sep).join('/');
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new Error(message); };

type CapturePair = {before: GoogleSlidesObservation; after: GoogleSlidesObservation};
type PrivateReceipt = {
  id: string; sourceSha256: string; sourceDigestSha256: string; modelVersion: string; profileId: string;
  mappingVersion: string; losses: unknown[]; captureFences: {noop: CapturePair; nativeImport: CapturePair; finalReadback: CapturePair};
  restoreCaptureFences: {nativeImport: CapturePair; finalReadback: CapturePair};
  preview: {revision: string; stage: string; captureDigestSha256: string};
  roundTrip: Record<string, any>;
};

async function readJson(path: string): Promise<any> { return JSON.parse(await readFile(path, 'utf8')); }
function capture(value: unknown, where: string): GoogleSlidesObservation {
  const candidate = (value as any)?.observation ?? value;
  assert(candidate && typeof candidate === 'object' && candidate.snapshot && typeof candidate.revisionId === 'string' && typeof candidate.captureDigestSha256 === 'string', `${where} is not a complete Google Slides observation.`);
  return candidate as GoogleSlidesObservation;
}

function validateRecordedFencePair(input: unknown, label: string): {before: {revision: string; captureDigestSha256: string}; after: {revision: string; captureDigestSha256: string}} {
  const value = input as any;
  const before = value?.before, after = value?.after;
  assert(typeof before?.revision === 'string' && /^[a-f0-9]{64}$/.test(before.captureDigestSha256 ?? ''), `${label}.before is malformed.`);
  assert(typeof after?.revision === 'string' && /^[a-f0-9]{64}$/.test(after.captureDigestSha256 ?? ''), `${label}.after is malformed.`);
  assert(before.revision === after.revision && before.captureDigestSha256 === after.captureDigestSha256, `${label} is not a stable double capture.`);
  return {before: {revision: before.revision, captureDigestSha256: before.captureDigestSha256}, after: {revision: after.revision, captureDigestSha256: after.captureDigestSha256}};
}

/** Validate a real pair of host captures, including its claimed native revision and digest. */
export function validateSlidesCapturePair(input: unknown, label: string): CapturePair {
  const before = capture((input as any)?.before, `${label}.before`);
  const after = capture((input as any)?.after, `${label}.after`);
  assert(before.presentationId === after.presentationId, `${label} changed presentation identity.`);
  assert(before.revisionId === after.revisionId, `${label} changed native revision between captures.`);
  assert(before.captureDigestSha256 === after.captureDigestSha256, `${label} changed native capture digest between captures.`);
  assert(/^[a-f0-9]{64}$/.test(before.captureDigestSha256), `${label} has an invalid capture digest.`);
  return {before, after};
}

function pngSize(bytes: Uint8Array): {width: number; height: number} {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  assert(bytes.length >= 24 && signature.every((value, index) => bytes[index] === value), 'Preview asset is not a valid PNG.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  assert(width > 0 && height > 0 && width <= 10000 && height <= 10000, 'Preview PNG dimensions are outside the accepted range.');
  return {width, height};
}

function lossesStatus(losses: any[]): 'supported' | 'reported-loss' {
  return losses.some(loss => loss?.family === 'semantic') ? 'reported-loss' : 'supported';
}

async function verifyCase(id: string, receipts: PrivateReceipt[], previewPair: CapturePair, privateRoot = privateDir, sourceRoot = fixtureDir): Promise<{entry: any; assetBytes: Uint8Array; assetPath: string}> {
  const receiptMatches = receipts.filter(item => item.id === id);
  assert(receiptMatches.length === 1, `Expected exactly one Slides receipt for ${id}.`);
  const receipt = receiptMatches[0]!;
  assert(receipt.profileId === profileId && receipt.mappingVersion === mappingVersion, `${id} has an unexpected Slides profile or mapping version.`);
  assert(receipt.modelVersion === '1.0.0' || receipt.modelVersion === '1.1.0', `${id} has an invalid model version.`);
  assert(Array.isArray(receipt.losses), `${id} has no semantic/native loss inventory.`);

  const sourcePath = join(sourceRoot, `${id}.json`);
  const sourceBytes = await readFile(sourcePath);
  assert(sha256(sourceBytes) === receipt.sourceSha256, `${id} source bytes do not match the private receipt.`);
  const source = JSON.parse(sourceBytes.toString('utf8')) as Document;
  assert(await hostDigest(source) === receipt.sourceDigestSha256, `${id} source digest does not match the private receipt.`);
  assert(source.vocabularies['umf.visual']?.version === receipt.modelVersion, `${id} source model version differs from its receipt.`);

  const restored = await readJson(join(privateRoot, `${id}-restored.json`));
  const binding = restored.binding as GoogleSlidesBinding;
  assert(binding.profile === profileId && binding.modelVersion === receipt.modelVersion, `${id} restored binding profile/model differs.`);
  assert(Number.isSafeInteger(binding.bindingRevision) && binding.bindingRevision >= 1 && binding.state === 'complete', `${id} restored binding is not a complete current binding.`);
  assert(await hostDigest(restored.document) === receipt.sourceDigestSha256, `${id} restored companion is not the exact source document.`);
  assert(await hostDigest(binding.source) === receipt.sourceDigestSha256, `${id} binding does not contain the exact source companion.`);
  assert(canonicalHostJson(binding.losses) === canonicalHostJson(receipt.losses), `${id} receipt losses differ from admitted binding losses.`);

  const restoreFences = receipt.restoreCaptureFences;
  assert(restoreFences?.nativeImport && restoreFences?.finalReadback, `${id} lacks both required restore capture fences.`);
  const noOpFence = validateRecordedFencePair(receipt.captureFences?.noop, `${id}.noop`);
  const nativeImportFence = validateRecordedFencePair(receipt.captureFences?.nativeImport, `${id}.nativeImport`);
  const initialFinalFence = validateRecordedFencePair(receipt.captureFences?.finalReadback, `${id}.initialFinalReadback`);
  const restoredImportFence = validateRecordedFencePair(restoreFences.nativeImport, `${id}.restoreNativeImport`);
  const restoredFence = validateRecordedFencePair(restoreFences.finalReadback, `${id}.finalReadback`);
  const imported = await readJson(join(privateRoot, `${id}-imported.json`));
  assert(imported.binding.baselineNative.captureDigestSha256 === nativeImportFence.after.captureDigestSha256, `${id} imported binding does not match native-import capture fence.`);
  const finalStage = await readJson(join(privateRoot, `${id}-final.json`));
  assert(finalStage.binding.baselineNative.captureDigestSha256 === initialFinalFence.after.captureDigestSha256, `${id} final stage does not match its source-readback capture fence.`);
  assert(restoredImportFence.after.captureDigestSha256 !== '', `${id} restore native-import fence is empty.`);
  assert(binding.baselineNative.captureDigestSha256 === restoredFence.after.captureDigestSha256, `${id} restored binding does not match the final source-readback capture fence.`);
  const admittedPreview = await importGoogleSlidesEdits(binding, source, previewPair.before, previewPair.after, binding.bindingRevision);
  assert(admittedPreview.changes.length === 0, `${id} global preview captures changed source meaning.`);
  assert(await hostDigest(admittedPreview.document) === receipt.sourceDigestSha256, `${id} global preview captures do not read back the restored source.`);
  const sourceLosses = receipt.losses.filter((loss: any) => loss?.family === 'semantic');
  assert(canonicalHostJson(admittedPreview.losses.filter(loss => loss.family === 'semantic')) === canonicalHostJson(sourceLosses), `${id} global preview semantic loss inventory differs from the bound receipt.`);
  assert(receipt.preview?.stage === 'restored-original', `${id} preview is not from the restored-original stage.`);
  assert(receipt.preview.revision === restoredFence.after.revision && receipt.preview.captureDigestSha256 === restoredFence.after.captureDigestSha256,
    `${id} recorded preview provenance differs from its own restored-source capture fence.`);

  const pngPath = join(privateRoot, `${id}.png`);
  const assetBytes = await readFile(pngPath);
  const dimensions = pngSize(assetBytes);
  const assetSha = sha256(assetBytes);
  const assetPath = `assets/${id}-${assetSha.slice(0, 16)}.png`;
  const semanticLosses = sourceLosses;
  const status = lossesStatus(semanticLosses);
  const target: RendererTargetEvidence = {
    rendererId: 'google-slides', profileId, modelVersion: receipt.modelVersion, mappingVersion,
    projection: {state: 'emitted', status, diagnostics: [], losses: semanticLosses},
    preview: {state: 'rendered', engine: 'google-slides', nativeVersion: 'Google Slides API v1 (service unpinned)',
      sourceSha256: receipt.sourceSha256, profileId, modelVersion: receipt.modelVersion, mappingVersion,
      captureDigestSha256: previewPair.after.captureDigestSha256, revision: previewPair.after.revisionId,
      stage: 'restored-original', asset: {path: `integrations/previews/google-slides/${id}-${assetSha.slice(0, 16)}.png`, sha256: assetSha,
        mediaType: 'image/png', width: dimensions.width, height: dimensions.height}},
  };
  const checks = ['noop', 'label', 'reconnection', 'movement', 'style', 'jsonPersistence', 'yamlPersistence', 'preservingUpdate', 'readback'] as const;
  assert(receipt.roundTrip && checks.every(key => receipt.roundTrip[key] === true), `${id} actual Google Slides cycle receipt does not prove all required round-trip checks.`);
  assert(receipt.roundTrip.transport === 'direct connected Slides API through injected adapter' && receipt.roundTrip.editMethod === 'native Slides API; no UI-edit claim',
    `${id} Slides attestation does not identify the observed native API write path.`);
  target.roundTrip = {state: 'passed', sourceSha256: receipt.sourceSha256, profileId, modelVersion: receipt.modelVersion, mappingVersion,
    checks: Object.fromEntries(checks.map(key => [key, true])), attestation: {kind: 'google-slides-api', nativeWritesObserved: true,
      injectedTransportVerified: true, liveTransportVerified: true, editMethod: 'native Slides API', uiClaim: false}};
  assert(status === (semanticLosses.length ? 'reported-loss' : 'supported'), `${id} projection status is inconsistent with semantic losses.`);
  const safeCapture = (pair: {before: {revision: string; captureDigestSha256: string}; after: {revision: string; captureDigestSha256: string}}) => ({...pair, unchanged: true});
  return {entry: {id, source: {path: `fixtures/integrations/complex-miro/common/${id}.json`, sha256: receipt.sourceSha256},
    captureFence: {before: {revision: previewPair.before.revisionId, captureDigestSha256: previewPair.before.captureDigestSha256},
      after: {revision: previewPair.after.revisionId, captureDigestSha256: previewPair.after.captureDigestSha256}},
    nativeCaptures: {noOp: safeCapture(noOpFence), nativeImport: safeCapture(nativeImportFence), initialFinalReadback: safeCapture(initialFinalFence),
      restoreNativeImport: safeCapture(restoredImportFence), finalReadback: safeCapture(restoredFence)}, rendererTargets: [target],
    assetSourcePath: `fixtures/renderers/google-slides/${assetPath}`}, assetBytes, assetPath};
}

/** Build a sanitized public receipt. It never serializes native snapshots or raw bindings. */
export async function assembleGoogleSlidesCohort(options: {privateDirectory?: string; outputDirectory?: string} = {}): Promise<string> {
  const privateRoot = options.privateDirectory ?? privateDir;
  const outRoot = options.outputDirectory ?? outputDir;
  const receipts = await readJson(join(privateRoot, 'receipts.json')) as PrivateReceipt[];
  assert(Array.isArray(receipts), 'Slides private receipts must be an array.');
  const globalBefore = await observeGoogleSlides(await readJson(join(privateRoot, 'preview-fence-before.json')));
  const globalAfter = await observeGoogleSlides(await readJson(join(privateRoot, 'preview-fence-after.json')));
  const previewPair = validateSlidesCapturePair({before: globalBefore, after: globalAfter}, 'global preview fence');
  const entries = [];
  const assets: Array<{bytes: Uint8Array; sourcePath: string; path: string}> = [];
  for (const id of ids) {
    const result = await verifyCase(id, receipts, previewPair, privateRoot);
    entries.push(result.entry); assets.push({bytes: result.assetBytes, sourcePath: join(privateRoot, `${id}.png`), path: result.assetPath});
  }
  assert(receipts.length === ids.length && new Set(receipts.map(item => item.id)).size === ids.length, 'Slides private receipt cohort must contain exactly the five expected cases.');
  await mkdir(join(outRoot, 'assets'), {recursive: true});
  for (const asset of assets) await copyFile(asset.sourcePath, join(outRoot, asset.path));
  const receiptPath = join(outRoot, 'preview-receipt.json');
  const tmp = receiptPath + '.tmp';
  const text = JSON.stringify({schemaVersion: 1, rendererId: 'google-slides', cases: entries}, null, 2) + '\n';
  await writeFile(tmp, text); await rename(tmp, receiptPath);
  return posix(receiptPath);
}

if (import.meta.main) {
  const path = await assembleGoogleSlidesCohort();
  console.log(`Wrote sanitized Google Slides evidence: ${path}`);
}
