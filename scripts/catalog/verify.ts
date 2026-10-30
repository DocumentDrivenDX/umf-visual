// SPDX-License-Identifier: MIT OR Apache-2.0
// Verify native catalogue receipts; --rebuild also checks byte reproducibility.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {buildCatalog, type VisualCatalog, type CatalogTarget} from './build';
import {visualForms} from '../../src';

const root = resolve(import.meta.dir, '../..');
const output = join(root, 'dist-site');
const digest = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new Error(message); };

async function snapshot(): Promise<Map<string, string>> {
  const catalog = JSON.parse(await readFile(join(output, 'catalog.json'), 'utf8')) as VisualCatalog;
  const files = new Map<string, string>();
  files.set('catalog.json', digest(await readFile(join(output, 'catalog.json'))));
  const paths = new Set<string>();
  for (const item of catalog.items) for (const format of ['dot', 'mermaid', 'lini'] as const) {
    const render = item.targets[format].render;
    if (render?.ok && render.svgPath) paths.add(render.svgPath);
  }
  for (const path of paths) files.set(path, digest(await readFile(join(output, path))));
  return files;
}

async function currentRenderAssets(): Promise<Map<string, string>> {
  const catalog = JSON.parse(await readFile(join(output, 'catalog.json'), 'utf8')) as VisualCatalog;
  const assets = new Map<string, string>();
  const paths = new Set<string>();
  for (const item of catalog.items) for (const format of ['dot', 'mermaid', 'lini'] as const) {
    const render = item.targets[format].render;
    if (render?.ok && render.svgPath) paths.add(render.svgPath);
  }
  for (const path of paths) assets.set(path, digest(await readFile(join(output, path))));
  return assets;
}

async function validateTarget(itemId: string, format: string, target: CatalogTarget): Promise<void> {
  if (target.status === 'unsupported') {
    assert(!target.ok && target.source === undefined && target.render === undefined,
      `Unsupported target ${itemId}/${format} must have diagnostics only and no native source or SVG.`);
    assert(target.diagnostics.length > 0, `Unsupported target ${itemId}/${format} has no refusal diagnostics.`);
    return;
  }
  assert(target.ok && typeof target.source === 'string' && target.source.length > 0,
    `Emitted target ${itemId}/${format} has no source text.`);
  if (!target.render) throw new Error(`Emitted target ${itemId}/${format} has no native render receipt.`);
  const render = target.render;
  assert(render.engine === (format === 'dot' ? 'graphviz' : format), `Wrong native engine for ${itemId}/${format}.`);
  assert(render.nativeVersion.length > 0 && render.nativeVersion !== 'unresolved', `Missing native version for ${itemId}/${format}.`);
  if (!render.ok) {
    assert(typeof render.error === 'string' && render.error.length > 0, `Failed render ${itemId}/${format} has no error.`);
    assert(render.svgPath === undefined && render.svgSha256 === undefined, `Failed render ${itemId}/${format} advertises SVG output.`);
    return;
  }
  assert(typeof render.svgPath === 'string' && typeof render.svgSha256 === 'string', `Successful render ${itemId}/${format} lacks path/hash.`);
  assert(!render.svgPath.startsWith('/') && !render.svgPath.split('/').includes('..'), `Unsafe SVG path for ${itemId}/${format}.`);
  assert(render.svgPath.endsWith(`-${render.svgSha256}.svg`), `SVG asset path is not content-addressed for ${itemId}/${format}.`);
  const svg = await readFile(join(output, render.svgPath));
  assert(svg.toString('utf8').includes('<svg'), `Native renderer output for ${itemId}/${format} is not SVG.`);
  assert(digest(svg) === render.svgSha256, `SVG SHA-256 mismatch for ${itemId}/${format}.`);
}

export async function verifyCatalog(catalog?: VisualCatalog): Promise<{items: number; renders: number}> {
  const value = catalog ?? JSON.parse(await readFile(join(output, 'catalog.json'), 'utf8')) as VisualCatalog;
  assert(value.schemaVersion === 1 && Array.isArray(value.items) && Array.isArray(value.capabilities), 'Invalid visual catalogue envelope.');
  for (const [source, expected] of [[value.language.schema, 'spec/extensions/visual/schema.json'], [value.language.forms, 'src/extensions/visual/index.ts']] as const) {
    assert(source.sourcePath === expected, `Unexpected language source path ${source.sourcePath}.`);
    assert(digest(await readFile(join(root, source.sourcePath))) === source.sourceSha256, `Language-source SHA-256 mismatch for ${source.sourcePath}.`);
  }
  const schemaSource = JSON.parse(await readFile(join(root, value.language.schema.sourcePath), 'utf8'));
  assert(JSON.stringify(value.language.schema.schema) === JSON.stringify(schemaSource), 'Language schema differs from its source file.');
  const expectedKinds = Object.entries(visualForms).map(([kind, forms]) => ({kind, forms: [...forms]}));
  assert(JSON.stringify(value.language.forms.kinds) === JSON.stringify(expectedKinds), 'Language form groups differ from src/extensions/visual/index.ts.');
  const sourcePaths = new Set<string>(), ids = new Set<string>();
  let renders = 0;
  for (const item of value.items) {
    assert(!ids.has(item.id), `Duplicate item id ${item.id}.`); ids.add(item.id);
    assert(!sourcePaths.has(item.sourcePath), `Duplicate source path ${item.sourcePath}.`); sourcePaths.add(item.sourcePath);
    assert(digest(await readFile(join(root, item.sourcePath))) === item.sourceSha256, `Source SHA-256 mismatch for ${item.sourcePath}.`);
    for (const format of ['dot', 'mermaid', 'lini'] as const) {
      const target = item.targets[format];
      await validateTarget(item.id, format, target);
      if (target.render?.ok) renders++;
      if (item.origin === 'canary' && target.ok) assert(target.render?.ok, `Canary ${item.id}/${format} did not render successfully.`);
    }
  }
  return {items: value.items.length, renders};
}

if (import.meta.main) {
  const baseline = await verifyCatalog();
  if (process.argv.includes('--rebuild')) {
    const historicalAssets = await currentRenderAssets();
    await buildCatalog();
    const first = await snapshot();
    await buildCatalog();
    const second = await snapshot();
    assert(first.size === second.size, `Rebuild changed output file count (${first.size} to ${second.size}).`);
    for (const [path, hash] of first) assert(second.get(path) === hash, `Rebuild changed generated bytes: ${path}`);
    for (const [path, hash] of historicalAssets) assert(digest(await readFile(join(output, path))) === hash,
      `Rebuild removed or changed a previously published render: ${path}`);
    const verified = await verifyCatalog();
    console.log(JSON.stringify({...verified, reproducible: true}));
  } else {
    console.log(JSON.stringify({...baseline, verified: true}));
  }
}
