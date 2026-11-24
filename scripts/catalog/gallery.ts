// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash, randomUUID} from 'node:crypto';
import {mkdir, rename, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {CatalogItem, CatalogTarget, NativeRender, VisualCatalog} from './build';
import type {ExcalidrawDemo} from './excalidraw-demo';

const renderSummary = (render?: NativeRender, preview = false) => render && {
  ok: render.ok,
  ...(preview && {svgPath: render.svgPath, svgSha256: render.svgSha256}),
  nativeDiagnosticCount: render.nativeDiagnostics?.length ?? 0,
};

function targetSummary(target: CatalogTarget, preview = false) {
  return {
    ok: target.ok,
    status: target.status,
    sourcePresent: typeof target.source === 'string',
    lossCount: target.diagnostics.filter(diagnostic => diagnostic.loss).length,
    hasDiagnosticProblem: target.diagnostics.some(diagnostic => diagnostic.loss || diagnostic.severity === 'error'),
    render: renderSummary(target.render, preview),
  };
}

function exampleSummary(item: CatalogItem, evidence: {path: string; sha256: string}, featured: boolean) {
  const fullProfileVariants = item.fullProfileVariants?.map(variant => ({
    format: variant.format,
    profileId: variant.profileId,
    result: targetSummary(variant.result),
    diagramRender: renderSummary(variant.diagramRender, true),
    approximationCount: variant.approximations?.length ?? 0,
    tier: variant.representation?.tier,
  }));
  const fullRenderers = new Set(fullProfileVariants?.filter(variant => {
    const {result, diagramRender} = variant;
    return result.ok && result.status === 'supported' && result.sourcePresent && result.render?.ok &&
      !result.render.nativeDiagnosticCount && diagramRender?.ok && diagramRender.svgPath &&
      !diagramRender.nativeDiagnosticCount && !result.hasDiagnosticProblem;
  }).map(variant => variant.format));
  const profileVariants = item.profileVariants?.filter(variant => !fullRenderers.has(variant.format) &&
    variant.result.ok && variant.diagramRender?.ok && variant.diagramRender.svgPath).map(variant => ({
    format: variant.format,
    profileId: variant.profileId,
    result: targetSummary(variant.result),
    diagramRender: renderSummary(variant.diagramRender, true),
  }));
  const annotatedRenderers = new Set(profileVariants?.map(variant => variant.format));
  const {id, title, kind, form, question, origin, sourcePath, preferredRelease} = item;
  const excalidraw = item.excalidraw && {
    profile: item.excalidraw.profile, source: item.excalidraw.source, render: item.excalidraw.render,
  };
  const targets = Object.fromEntries(Object.entries(item.targets).map(([format, target]) => [format,
    targetSummary(target, !fullRenderers.has(format as keyof CatalogItem['targets']) && !annotatedRenderers.has(format as keyof CatalogItem['targets']))]));
  return {id, title, kind, form, question, origin, sourcePath, featured, evidence, preferredRelease, targets,
    profileVariants, fullProfileVariants, excalidraw};
}

export function featuredExamples(catalog: Pick<VisualCatalog, 'items' | 'language'>): Set<string> {
  const featured = new Set<string>();
  for (const {kind, forms} of catalog.language.forms.kinds) {
    for (const form of forms) {
      const candidates = catalog.items.filter(item => item.kind === kind && item.form === form);
      const choice = candidates.find(item => item.sourcePath.startsWith('fixtures/visual/forms/')) ??
        candidates.find(item => item.origin === 'fixture') ?? candidates[0];
      if (!choice) throw Error(`No gallery example for ${kind}/${form}`);
      featured.add(choice.id);
    }
  }
  return featured;
}

export async function writeGallery(catalog: VisualCatalog, outputDir: string, demo?: ExcalidrawDemo) {
  const featured = featuredExamples(catalog);
  await mkdir(join(outputDir, 'example-evidence'), {recursive: true});
  const items = await Promise.all(catalog.items.map(async item => {
    if (!/^[a-z0-9][a-z0-9_-]*$/u.test(item.id)) throw Error('Invalid gallery asset stem: ' + item.id);
    const body = JSON.stringify(item);
    const sha256 = createHash('sha256').update(body).digest('hex');
    const path = `example-evidence/${item.id}-${sha256}.json`;
    await writeFile(join(outputDir, path), body);
    return exampleSummary(item, {path, sha256}, featured.has(item.id));
  }));
  const gallery = {schemaVersion: 1, language: catalog.language, capabilities: catalog.capabilities, items, demo};
  const encoded = JSON.stringify(gallery);
  if (Buffer.byteLength(encoded) > 256 * 1024) throw Error('Gallery index exceeds its 256 KiB loading budget');
  const temporary = join(outputDir, `.gallery-${randomUUID()}.json`);
  await writeFile(temporary, encoded);
  await rename(temporary, join(outputDir, 'gallery.json'));
  return gallery;
}
