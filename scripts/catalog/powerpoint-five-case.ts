// SPDX-License-Identifier: MIT OR Apache-2.0
/** Generate bounded PowerPoint edit candidates and independent LibreOffice previews. */
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {exportPowerPoint, importPowerPoint} from '../../src/adapters/powerpoint/index.js';
import type {Document} from '@umf/core';

const run = promisify(execFile);
const root = resolve(import.meta.dir, '../..');
const out = join(root, '.cache/host-live/powerpoint-five-case');
const publicRoot = join(root, 'dist-site');
const durableRoot = join(root, 'fixtures/renderers/powerpoint');
const cases = ['nested-environments', 'process-documents-store', 'network-16x24', 'frames-headings-annotations', 'curved-caption-cross-boundary'];
// The qualified profile is /1 and its field mapping has remained in lockstep with that profile revision.
const mappingVersion = '1';
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const writeJson = (path: string, value: unknown) => writeFile(path, JSON.stringify(value, null, 2) + '\n');

await mkdir(join(out, 'previews'), {recursive: true});
const versions = (await run('soffice', ['--version'])).stdout.trim();
const manifest = JSON.parse(await readFile(join(root, 'fixtures/integrations/complex-miro/manifest.json'), 'utf8'));
const receipt: any = {schemaVersion: 1, generatedBy: 'scripts/catalog/powerpoint-five-case.ts', previewEngine: {name: 'LibreOfficeDev', version: versions, command: 'headless PDF export; pdftoppm 144 dpi'}, cases: []};

for (const id of cases) {
  const row = manifest.cases.find((entry: any) => entry.id === id);
  if (!row || !row.commonVisualPath) throw new Error(`Missing common projection for ${id}`);
  const sourcePath = `fixtures/integrations/complex-miro/${row.commonVisualPath}`;
  const sourceBytes = await readFile(join(root, sourcePath));
  const document = JSON.parse(sourceBytes.toString('utf8')) as Document;
  const result = await exportPowerPoint(document, {mode: 'report'});
  const checked = await importPowerPoint(result.bytes, {mode: 'report', binding: result.binding, expectedBindingRevision: result.bindingRevision});
  if (JSON.stringify(checked.document) !== JSON.stringify(document) || checked.changes.length !== 0) throw new Error(`PowerPoint adapter readback changed source meaning for ${id}`);

  const caseDir = join(out, id);
  const previewDir = join(caseDir, 'preview');
  await mkdir(previewDir, {recursive: true});
  const pptxPath = join(caseDir, `${id}.pptx`);
  const sourceOut = join(caseDir, 'source.json');
  const bindingOut = join(caseDir, 'binding.json');
  await writeFile(pptxPath, result.bytes);
  await writeFile(sourceOut, sourceBytes);
  await writeJson(bindingOut, result.binding);

  const profileDir = join(caseDir, 'lo-profile');
  await mkdir(profileDir, {recursive: true});
  await run('soffice', [`-env:UserInstallation=file://${profileDir}`, '--headless', '--convert-to', 'pdf', '--outdir', previewDir, pptxPath]);
  const pdfPath = join(previewDir, `${id}.pdf`);
  await run('pdftoppm', ['-png', '-r', '144', '-f', '1', '-singlefile', pdfPath, join(previewDir, id)]);
  const pngPath = join(previewDir, `${id}.png`);
  const pdf = await readFile(pdfPath), png = await readFile(pngPath), pptx = await readFile(pptxPath);
  const pptxSha256 = sha(pptx), pngSha256 = sha(png);
  const publicArtifactPath = `integrations/downloads/powerpoint-${id}-${pptxSha256.slice(0, 16)}.pptx`;
  const publicImagePath = `integrations/previews/powerpoint/${id}-${pngSha256.slice(0, 16)}.png`;
  const durableImagePath = `fixtures/renderers/powerpoint/assets/${id}-${pngSha256.slice(0, 16)}.png`;
  const durableArtifactPath = `fixtures/renderers/powerpoint/assets/${id}-${pptxSha256.slice(0, 16)}.pptx`;
  await mkdir(join(publicRoot, 'integrations/downloads'), {recursive: true});
  await mkdir(join(publicRoot, 'integrations/previews/powerpoint'), {recursive: true});
  await mkdir(join(durableRoot, 'assets'), {recursive: true});
  await writeFile(join(publicRoot, publicArtifactPath), pptx);
  await writeFile(join(publicRoot, publicImagePath), png);
  await writeFile(join(root, durableImagePath), png);
  await writeFile(join(root, durableArtifactPath), pptx);
  const {stdout: dimensions} = await run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', pngPath]);
  const width = Number(dimensions.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const height = Number(dimensions.match(/pixelHeight:\s*(\d+)/)?.[1]);
  if (!(width > 0 && height > 0)) throw new Error(`Could not verify preview dimensions for ${id}`);
  const artifactPath = pptxPath.slice(root.length + 1);
  const status = result.losses.length ? 'reported-loss' : 'supported';
  receipt.cases.push({
    id, title: row.title, modelVersion: result.modelVersion, profile: result.profile,
    source: {path: sourcePath, sha256: sha(sourceBytes)}, sourceDigestSha256: result.sourceSha256,
    assetSourcePath: durableImagePath, artifactSourcePath: durableArtifactPath,
    artifact: {path: artifactPath, sha256: pptxSha256, bytes: pptx.byteLength},
    adapterReadback: {exactDocument: true, changes: 0, losses: result.losses},
    preview: {engine: versions, pdf: {path: pdfPath.slice(root.length + 1), sha256: sha(pdf)}, png: {path: pngPath.slice(root.length + 1), sha256: pngSha256, width, height}},
    rendererTargets: [{
      rendererId: 'powerpoint', profileId: result.profile, modelVersion: result.modelVersion, mappingVersion,
      projection: {state: 'emitted', status, diagnostics: [], losses: result.losses},
      artifacts: [{path: publicArtifactPath, sha256: pptxSha256, mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', bytes: pptx.byteLength}],
      preview: {state: 'rendered', engine: 'libreoffice', nativeVersion: versions, sourceSha256: sha(sourceBytes), sourceDigestSha256: result.sourceSha256, profileId: result.profile, modelVersion: result.modelVersion, mappingVersion,
        inputArtifactSha256: pptxSha256, stage: 'export', asset: {path: publicImagePath, sha256: pngSha256, mediaType: 'image/png', width, height}},
    }],
  });
  console.log(`${id}: ${pptxPath} (${pptx.byteLength} bytes), ${width}x${height} LibreOffice preview`);
}
await writeJson(join(out, 'receipt.json'), receipt);
await mkdir(durableRoot, {recursive: true});
await writeJson(join(durableRoot, 'preview-receipt.json'), receipt);
console.log(`receipt: ${join(out, 'receipt.json')}`);
