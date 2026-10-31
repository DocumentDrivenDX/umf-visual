// SPDX-License-Identifier: MIT OR Apache-2.0
/** Promote two source-bound native-open PowerPoint preview variants and their LibreOffice images. */
import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, writeFile, rename} from 'node:fs/promises';
import {join, resolve, sep} from 'node:path';
import type {Document} from '@umf/core';
import {exportPowerPoint, importPowerPoint} from '../../src/adapters/powerpoint/index.js';

const root = resolve(import.meta.dir, '../..');
const sourceRoot = join(root, 'fixtures/integrations/complex-miro/common');
const privateRoot = join(root, '.cache/pptx-preview-layout');
const durableRoot = join(root, 'fixtures/renderers/powerpoint');
const cases = ['process-documents-store', 'network-16x24'];
const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const posix = (value: string) => value.split(sep).join('/');
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {if (!condition) throw new Error(message);};

async function readJson(path: string): Promise<any> {return JSON.parse(await readFile(path, 'utf8'));}
function libreOfficeVersion(): string {
  const result = Bun.spawnSync({cmd: ['soffice', '--version'], stdout: 'pipe', stderr: 'pipe'});
  const value = new TextDecoder().decode(result.stdout).trim();
  assert(result.exitCode === 0 && /^LibreOffice(?:Dev)?\s+\d/.test(value), `Could not capture the actual LibreOffice version: ${new TextDecoder().decode(result.stderr).trim()}`);
  return value;
}

/** Require a persisted operator witness for this exact PPTX before advertising native reopen evidence. */
export function validatePowerPointOpenAttestation(receipt: any, id: string, artifactSha256: string): Record<string, unknown> {
  assert(receipt?.evidenceType === 'umf.visual.powerpoint.preview-layout-native-open/1' && Array.isArray(receipt.entries),
    'PowerPoint native-open attestation receipt is missing or has an unknown evidence type.');
  const matches = receipt.entries.filter((entry: any) => entry?.id === id);
  assert(matches.length === 1, `${id} must have exactly one native-open operator attestation.`);
  const entry = matches[0];
  assert(entry.artifactSha256 === artifactSha256, `${id} native-open attestation is bound to a different PowerPoint artifact.`);
  assert(typeof entry.application === 'string' && /powerpoint/i.test(entry.application) && typeof entry.version === 'string' &&
    typeof entry.observer === 'string' && entry.observer.trim().length > 0 && typeof entry.method === 'string' && entry.method.trim().length > 0 &&
    entry.reopenObserved === true && entry.noRepairPrompt === true && /^[a-f0-9]{64}$/.test(entry.screenshotSha256 ?? ''),
    `${id} native-open attestation lacks the actual application, version, method, reopen, no-repair, or screenshot digest evidence.`);
  return {application: entry.application, version: entry.version, observer: entry.observer, method: entry.method,
    reopenObserved: entry.reopenObserved, noRepairPrompt: entry.noRepairPrompt, screenshotSha256: entry.screenshotSha256,
    screenshotPrivacy: entry.screenshotPrivacy};
}

/** Validate native-open layout provenance, actual PPTX readback, and the rendered PNG before publication. */
export async function assemblePowerPointLayoutPreviews(): Promise<string> {
  const nativeVersion = libreOfficeVersion();
  const receiptPath = join(durableRoot, 'preview-receipt.json');
  const receipt = await readJson(receiptPath);
  const openAttestations = await readJson(join(durableRoot, 'preview-layout-open-attestations.json'));
  assert(receipt.schemaVersion === 1 && Array.isArray(receipt.cases), 'Existing PowerPoint preview receipt is malformed.');
  for (const id of cases) {
    const proofPath = join(privateRoot, id, 'receipt.json');
    const proof = await readJson(proofPath);
    const entry = receipt.cases.find((row: any) => row.id === id);
    assert(entry && proof.schemaVersion === 1 && proof.caseId === id, `PowerPoint v3 layout preview is missing for ${id}.`);
    const sourceBytes = await readFile(join(root, entry.source.path));
    assert(sha256(sourceBytes) === entry.source.sha256 && proof.source?.sha256 === entry.source.sha256 && proof.source.path === entry.source.path,
      `${id} layout preview does not bind to the exact current source bytes.`);
    assert(proof.stage === 'preview-only-layout' && proof.profileId === entry.profile && proof.modelVersion === entry.modelVersion &&
      proof.mappingVersion === entry.rendererTargets?.[0]?.mappingVersion, `${id} layout preview profile/model/mapping is stale.`);
    assert(/^[a-f0-9]{64}$/.test(proof.baseArtifact?.sha256 ?? ''), `${id} layout preview lacks a valid recorded input-artifact digest.`);
    assert(proof.readback?.sourceUnchanged === true && proof.readback?.semanticChangeCount === 0 && proof.bindingsPreserved === true,
      `${id} native-only layout preview changes UMF meaning or bindings.`);
    proof.preview.nativeVersion = nativeVersion;
    await writeFile(proofPath, JSON.stringify(proof, null, 2) + '\n');
    const source = JSON.parse(sourceBytes.toString('utf8')) as Document;
    const fresh = await exportPowerPoint(source, {mode: 'report'});
    const artifactSource = join(root, proof.artifact.path);
    const artifactBytes = await readFile(artifactSource);
    assert(sha256(artifactBytes) === proof.artifact.sha256, `${id} native-open preview PPTX hash mismatch.`);
    const nativeOpen = validatePowerPointOpenAttestation(openAttestations, id, proof.artifact.sha256);
    const imported = await importPowerPoint(artifactBytes, {mode: 'report', binding: fresh.binding, expectedBindingRevision: fresh.bindingRevision});
    assert(imported.changes.length === 0 && JSON.stringify(imported.document) === JSON.stringify(source), `${id} preview PPTX no longer reads back the exact source document.`);
    const pngSource = join(root, proof.preview.asset.path);
    const pngBytes = await readFile(pngSource);
    assert(sha256(pngBytes) === proof.preview.asset.sha256 && proof.preview.asset.mediaType === 'image/png' &&
      Number.isInteger(proof.preview.asset.width) && Number.isInteger(proof.preview.asset.height), `${id} native-open preview PNG metadata/hash is invalid.`);
    const artifactName = `${id}-layoutv3-${proof.artifact.sha256.slice(0, 16)}.pptx`;
    const imageName = `${id}-layoutv3-${proof.preview.asset.sha256.slice(0, 16)}.png`;
    const artifactDest = join(durableRoot, 'assets', artifactName), imageDest = join(durableRoot, 'assets', imageName);
    await mkdir(join(durableRoot, 'assets'), {recursive: true});
    await copyFile(artifactSource, artifactDest); await copyFile(pngSource, imageDest);
    const target = entry.rendererTargets?.find((row: any) => row.rendererId === 'powerpoint');
    assert(target, `${id} PowerPoint renderer row is missing.`);
    const artifactRelative = posix(artifactDest.slice(root.length + 1));
    const imageRelative = posix(imageDest.slice(root.length + 1));
    const priorPreview = target.preview;
    const priorArtifact = target.artifacts?.find((item: any) => item.sha256 === entry.artifact.sha256);
    const newArtifact = {path: artifactRelative, sha256: proof.artifact.sha256,
      mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', bytes: artifactBytes.byteLength};
    const newPreview = {state: 'rendered', engine: 'libreoffice', nativeVersion, sourceSha256: entry.source.sha256,
      sourceDigestSha256: entry.source.canonicalSha256, profileId: proof.profileId, modelVersion: proof.modelVersion, mappingVersion: proof.mappingVersion,
      inputArtifactSha256: proof.artifact.sha256, stage: 'native-only-preview-layout',
      nativeOpen,
      asset: {path: imageRelative, sha256: proof.preview.asset.sha256, mediaType: 'image/png', width: proof.preview.asset.width, height: proof.preview.asset.height}};
    target.artifacts = [newArtifact, ...(target.artifacts ?? []).filter((item: any) => item.sha256 !== proof.artifact.sha256)];
    target.previewVariants = [...(target.previewVariants ?? []).filter((item: any) => item.stage !== priorPreview?.stage), priorPreview];
    target.preview = newPreview;
    entry.artifact = {path: artifactSource.slice(root.length + 1), sha256: proof.artifact.sha256, bytes: artifactBytes.byteLength};
    entry.artifactSourcePath = artifactRelative;
    entry.assetSourcePath = imageRelative;
    entry.preview = {engine: 'libreoffice', nativeVersion, png: {path: imageRelative, sha256: proof.preview.asset.sha256,
      width: proof.preview.asset.width, height: proof.preview.asset.height}, stage: 'native-only-preview-layout',
      nativeOpen: newPreview.nativeOpen};
  }
  const temporary = receiptPath + '.tmp';
  await writeFile(temporary, JSON.stringify(receipt, null, 2) + '\n'); await rename(temporary, receiptPath);
  return posix(receiptPath);
}

if (import.meta.main) console.log(`Updated native-open PowerPoint layout preview receipts: ${await assemblePowerPointLayoutPreviews()}`);
