// SPDX-License-Identifier: MIT OR Apache-2.0
// Build the reproducible visual interchange catalogue and its native SVG renders.
import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, readdir, rename, rm, writeFile} from 'node:fs/promises';
import {join, relative, resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium, type Browser, type Page} from 'playwright';
import mermaidPackage from 'mermaid/package.json';
import {exportVisual, inspectVisual, interchangeCapabilities, visualForms, type ExportVisualResult, type IdentityMapping, type InterchangeDiagnostic, type InterchangeFormat} from '../../src';
import {liniDirectory, verifyLiniRuntime} from '../interchange-runtime';

export type TargetName = InterchangeFormat;
export interface NativeRender {
  ok: boolean;
  engine: 'graphviz' | 'mermaid' | 'lini';
  nativeVersion: string;
  svgPath?: string;
  svgSha256?: string;
  error?: string;
}
export interface CatalogTarget {
  status: 'supported' | 'reported-loss' | 'unsupported';
  /** True means native text was emitted; rendering is reported separately. */
  ok: boolean;
  source?: string;
  diagnostics: InterchangeDiagnostic[];
  identityMap: IdentityMapping[];
  render?: NativeRender;
}
export interface CatalogItem {
  id: string;
  title: string;
  kind: string;
  form: string;
  question: string;
  origin: 'fixture' | 'canary';
  sourcePath: string;
  sourceSha256: string;
  document: unknown;
  targets: Record<TargetName, CatalogTarget>;
}
export interface VisualCatalog {
  schemaVersion: 1;
  capabilities: typeof interchangeCapabilities;
  language: {
    schema: {sourcePath: string; sourceSha256: string; schema: unknown};
    forms: {sourcePath: string; sourceSha256: string; kinds: {kind: string; forms: string[]}[]};
  };
  items: CatalogItem[];
}

const root = resolve(import.meta.dir, '../..');
const formats: TargetName[] = ['dot', 'mermaid', 'lini'];
const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const posix = (value: string) => value.split(sep).join('/');
const safeSegment = (value: string) => value.normalize('NFKD').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();

async function jsonPaths(directory: string): Promise<string[]> {
  const found: string[] = [];
  const visit = async (path: string) => {
    for (const entry of await readdir(path, {withFileTypes: true})) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'index.json') found.push(child);
    }
  };
  await visit(directory);
  return found;
}
async function fixturePaths(): Promise<string[]> {
  const found = [
    ...await jsonPaths(join(root, 'fixtures/visual/forms')),
    ...await jsonPaths(join(root, 'fixtures/visual/inventory')),
    ...await jsonPaths(join(root, 'fixtures/catalog')),
  ];
  return found.sort((a, b) => {
    const left = posix(relative(root, a)), right = posix(relative(root, b));
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

function targetFrom(document: any, format: TargetName): CatalogTarget {
  const strict = exportVisual(document, {format, mode: 'strict'});
  const result = strict.ok ? strict : exportVisual(document, {format, mode: 'allow-reported-loss'});
  const emitted = result.ok && typeof result.text === 'string';
  return {
    status: emitted ? strict.ok ? 'supported' : 'reported-loss' : 'unsupported',
    ok: emitted,
    ...(emitted ? {source: result.text} : {}),
    diagnostics: result.diagnostics,
    identityMap: result.identityMap,
  };
}

/** Produce deterministic JSON catalogue rows without initializing native renderers. */
export async function createCatalogData(): Promise<VisualCatalog> {
  const items: CatalogItem[] = [];
  const itemIds = new Set<string>(), sourcePaths = new Set<string>();
  const schemaSourcePath = 'spec/extensions/visual/schema.json';
  const formsSourcePath = 'src/extensions/visual/index.ts';
  const [schemaBytes, formsBytes] = await Promise.all([
    Bun.file(join(root, schemaSourcePath)).bytes(), Bun.file(join(root, formsSourcePath)).bytes(),
  ]);
  const schema = JSON.parse(new TextDecoder().decode(schemaBytes));
  const kinds = Object.entries(visualForms).map(([kind, forms]) => ({kind, forms: [...forms]}));
  const schemaKinds = schema.properties?.kind?.enum;
  const schemaForms = schema.properties?.form?.enum;
  if (!Array.isArray(schemaKinds) || !Array.isArray(schemaForms)) throw new Error('Visual schema kind/form enums are missing.');
  const groupedKinds = kinds.map(item => item.kind);
  const groupedForms = kinds.flatMap(item => item.forms);
  if (JSON.stringify([...groupedKinds].sort()) !== JSON.stringify([...schemaKinds].sort())) {
    throw new Error('Visual kind groups in src/extensions/visual/index.ts differ from the schema kind enum.');
  }
  if (JSON.stringify([...groupedForms].sort()) !== JSON.stringify([...schemaForms].sort())) {
    throw new Error('Visual forms in src/extensions/visual/index.ts differ from the schema form enum.');
  }
  const language = {
    schema: {sourcePath: schemaSourcePath, sourceSha256: sha256(schemaBytes), schema},
    forms: {sourcePath: formsSourcePath, sourceSha256: sha256(formsBytes), kinds},
  };
  for (const sourceFile of await fixturePaths()) {
    const bytes = await Bun.file(sourceFile).bytes();
    const sourcePath = posix(relative(root, sourceFile));
    const document = JSON.parse(new TextDecoder().decode(bytes));
    const visual = document?.extensions?.['umf.visual'];
    if (!visual || typeof visual !== 'object' || typeof visual.kind !== 'string' || typeof visual.form !== 'string' || typeof visual.question !== 'string') {
      throw new Error(`Invalid visual fixture metadata: ${sourcePath}`);
    }
    if (sourcePaths.has(sourcePath)) throw new Error(`Duplicate visual catalogue source path: ${sourcePath}`);
    sourcePaths.add(sourcePath);
    const stem = sourcePath.slice(0, -'.json'.length).replace(/^fixtures\/(?:visual\/)?/, '');
    const id = `visual-${safeSegment(stem.replaceAll('/', '-'))}`;
    if (itemIds.has(id)) throw new Error(`Duplicate visual catalogue item id ${id} derived from ${sourcePath}`);
    itemIds.add(id);
    const inspection = inspectVisual(document);
    if (!inspection.valid || !inspection.complete) throw new Error(`Invalid or incomplete visual document ${sourcePath}: ${JSON.stringify(inspection.diagnostics)}`);
    const title = typeof visual.title === 'string' && visual.title.trim() ? visual.title : visual.id ?? stem;
    const targets = Object.fromEntries(formats.map(format => [format, targetFrom(document, format)])) as Record<TargetName, CatalogTarget>;
    items.push({id, title, kind: visual.kind, form: visual.form, question: visual.question,
      origin: sourcePath.startsWith('fixtures/catalog/') ? 'canary' : 'fixture', sourcePath, sourceSha256: sha256(bytes), document, targets});
  }
  return {schemaVersion: 1, capabilities: structuredClone(interchangeCapabilities), language, items};
}

function runtimeError(error: unknown): string { return error instanceof Error ? error.message : String(error); }

async function renderDot(source: string, version: string): Promise<{svg: string; version: string}> {
  const process = Bun.spawn(['dot', '-Tsvg'], {stdin: 'pipe', stdout: 'pipe', stderr: 'pipe'});
  process.stdin.write(source); process.stdin.end();
  const [svg, stderr, exit] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  if (exit !== 0 || !svg.includes('<svg')) throw new Error(stderr.trim() || `Graphviz exited ${exit} without SVG output`);
  return {svg, version};
}

async function graphvizVersion(): Promise<string> {
  let versionProcess: ReturnType<typeof Bun.spawn>;
  try { versionProcess = Bun.spawn(['dot', '-V'], {stdout: 'pipe', stderr: 'pipe'}); }
  catch (error) { throw new Error(`Graphviz dot is required for catalogue rendering: ${runtimeError(error)}`); }
  const versionStream = versionProcess.stderr;
  if (!versionStream || typeof versionStream === 'number') throw new Error('Graphviz dot -V did not provide a version stream');
  const versionText = (await new Response(versionStream).text()).trim();
  if (await versionProcess.exited !== 0) throw new Error(versionText || 'Graphviz dot -V failed');
  const match = /graphviz version\s+([^\s(]+)/i.exec(versionText);
  if (!match) throw new Error(`Could not determine Graphviz version from ${JSON.stringify(versionText)}`);
  return match[1]!;
}

async function renderMermaid(page: Page, source: string, itemId: string): Promise<{svg: string; version: string}> {
  await page.setContent('<!doctype html><html><meta charset="utf-8"><body><main id="output"></main></body></html>', {waitUntil: 'domcontentloaded'});
  await page.addScriptTag({path: resolve(root, 'node_modules/mermaid/dist/mermaid.min.js')});
  const result = await page.evaluate(async ({source, itemId}) => {
    const mermaidApi = (window as any).mermaid;
    if (!mermaidApi) throw new Error('Mermaid browser bundle did not expose window.mermaid');
    mermaidApi.initialize({startOnLoad: false, securityLevel: 'strict', theme: 'neutral', look: 'classic', fontFamily: 'Arial', deterministicIds: true, deterministicIDSeed: itemId});
    let state = 2166136261;
    for (const char of itemId) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
    const originalRandom = Math.random;
    Math.random = () => {
      state = (state + 0x6D2B79F5) | 0;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
    try {
      const rendered = await mermaidApi.render('catalog-' + itemId, source);
      await document.fonts.ready;
      return {svg: rendered.svg, version: mermaidApi.version ?? 'unknown'};
    } finally {
      Math.random = originalRandom;
    }
  }, {source, itemId});
  const version = result.version === 'unknown' ? mermaidPackage.version : result.version;
  if (!result.svg.includes('<svg') || typeof version !== 'string') throw new Error('Mermaid returned no SVG or version');
  return {svg: result.svg, version};
}

interface LiniCompiler {
  default(options: {module_or_path: Uint8Array}): Promise<void>;
  version(): string;
  diagnostics(source: string, options: unknown): string;
  compile(source: string, options: unknown): string;
}

async function loadLini(): Promise<{compiler: LiniCompiler; version: string}> {
  const runtimeDirectory = resolve(root, liniDirectory);
  const pin = await verifyLiniRuntime(runtimeDirectory);
  const runtimePath = resolve(runtimeDirectory, 'lini_wasm.js');
  const compiler = await import(pathToFileURL(runtimePath).href) as LiniCompiler;
  await compiler.default({module_or_path: await Bun.file(resolve(runtimeDirectory, 'lini_wasm_bg.wasm')).bytes()});
  const version = compiler.version();
  if (version !== pin.version) throw new Error(`Pinned Lini runtime reports ${version}; expected ${pin.version}`);
  return {compiler, version};
}

function validateLiniDiagnostics(reportText: string): void {
  let report: any;
  try { report = JSON.parse(reportText); } catch { throw new Error('Lini returned malformed diagnostics JSON'); }
  const diagnostics = Array.isArray(report) ? report : report?.diagnostics;
  if (!Array.isArray(diagnostics) || diagnostics.some((item: any) => item?.severity === 'error')) {
    throw new Error(`Lini refused generated source: ${reportText}`);
  }
}

// @covers US-095-AC3: only verified native SVG bytes receive a path and SHA-256 receipt.
async function saveRender(item: CatalogItem, format: TargetName, render: NativeRender, svg: string, outputDir: string): Promise<void> {
  if (!svg.includes('<svg')) throw new Error(`${format} renderer returned no SVG for ${item.id}`);
  const svgSha256 = sha256(svg);
  const fileName = `${item.id}-${format}-${svgSha256}.svg`;
  const outputFile = join(outputDir, 'renders', fileName);
  const renderDirectory = join(outputDir, 'renders');
  await mkdir(renderDirectory, {recursive: true});
  let existing: Uint8Array | undefined;
  try { existing = await readFile(outputFile); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (existing) {
    if (sha256(existing) !== svgSha256) throw new Error(`Content-addressed SVG path has different bytes: ${fileName}`);
    render.svgPath = `renders/${fileName}`;
    render.svgSha256 = svgSha256;
    return;
  }
  const temporaryFile = join(renderDirectory, `.${fileName}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryFile, svg, {encoding: 'utf8', flag: 'wx'});
    await rename(temporaryFile, outputFile);
  } catch (error) {
    await rm(temporaryFile, {force: true});
    throw error;
  }
  render.svgPath = `renders/${fileName}`;
  render.svgSha256 = svgSha256;
}

/** @covers US-095-AC3, US-095-AC7: add actual native renders; emitted canaries must render, unsupported targets have no SVG. */
export async function renderCatalog(catalog: VisualCatalog, outputDir: string): Promise<void> {
  const expectedCanaries: Record<string, Record<TargetName, CatalogTarget['status']>> = {
    'visual-catalog-canary-flow': {dot: 'reported-loss', mermaid: 'reported-loss', lini: 'reported-loss'},
    'visual-catalog-canary-entities': {dot: 'unsupported', mermaid: 'reported-loss', lini: 'reported-loss'},
    'visual-catalog-canary-supported-flow': {dot: 'supported', mermaid: 'supported', lini: 'supported'},
  };
  for (const [id, expected] of Object.entries(expectedCanaries)) {
    const item = catalog.items.find(candidate => candidate.id === id);
    if (!item || item.origin !== 'canary') throw new Error(`Required native-render canary is missing: ${id}`);
    for (const format of formats) if (item.targets[format].status !== expected[format]) {
      throw new Error(`Canary ${id}/${format} has status ${item.targets[format].status}; expected ${expected[format]}`);
    }
  }
  const graphviz = await graphvizVersion();
  const lini = await loadLini();
  let browser: Browser;
  try { browser = await chromium.launch({headless: true}); }
  catch (error) { throw new Error(`Chromium is required for Mermaid catalogue rendering: ${runtimeError(error)}`); }
  const page = await browser.newPage();
  let externalRequest: string | undefined;
  page.on('request', request => {
    if (!['about:blank', 'data:', 'file:'].some(prefix => request.url().startsWith(prefix))) externalRequest = request.url();
  });
  const browserVersion = browser.version();
  try {
    for (const item of catalog.items) {
      for (const format of formats) {
        const target = item.targets[format];
        if (!target.ok || target.source === undefined) continue;
        const engine = format === 'dot' ? 'graphviz' : format;
        const render: NativeRender = {ok: false, engine, nativeVersion:
          format === 'dot' ? graphviz : format === 'mermaid' ? `${mermaidPackage.version} / Chromium ${browserVersion}` : lini.version};
        target.render = render;
        try {
          let native: {svg: string; version: string};
          if (format === 'dot') native = await renderDot(target.source, graphviz);
          else if (format === 'mermaid') {
            native = await renderMermaid(page, target.source, safeSegment(item.id));
            native.version = `${native.version} / Chromium ${browserVersion}`;
            if (externalRequest) throw new Error(`External request during Mermaid rendering: ${externalRequest}`);
          } else {
            validateLiniDiagnostics(lini.compiler.diagnostics(target.source, {}));
            native = {svg: lini.compiler.compile(target.source, {}), version: lini.version};
          }
          render.nativeVersion = native.version;
          await saveRender(item, format, render, native.svg, outputDir);
          render.ok = true;
        } catch (error) {
          render.error = runtimeError(error);
          if (target.status === 'supported' || item.origin === 'canary') {
            throw new Error(`Native ${format} render failed for ${target.status} item ${item.id}: ${render.error}`);
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
}

export async function buildCatalog(outputDirectory = 'dist-site'): Promise<VisualCatalog> {
  if (outputDirectory !== 'dist-site') throw new Error('Catalogue output directory is fixed at dist-site');
  const outputDir = resolve(root, outputDirectory);
  const catalog = await createCatalogData();
  await mkdir(outputDir, {recursive: true});
  await renderCatalog(catalog, outputDir);
  const catalogFile = join(outputDir, 'catalog.json');
  const temporaryFile = join(outputDir, `.catalog.json.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryFile, JSON.stringify(catalog, null, 2) + '\n', {encoding: 'utf8', flag: 'wx'});
    await rename(temporaryFile, catalogFile);
  } catch (error) {
    await rm(temporaryFile, {force: true});
    throw error;
  }
  return catalog;
}

if (import.meta.main) {
  const outputDirectory = process.argv[2] ?? 'dist-site';
  const catalog = await buildCatalog(outputDirectory);
  const counts = Object.fromEntries(formats.map(format => [format, {
    emitted: catalog.items.filter(item => item.targets[format].ok).length,
    rendered: catalog.items.filter(item => item.targets[format].render?.ok).length,
    unsupported: catalog.items.filter(item => item.targets[format].status === 'unsupported').length,
  }]));
  console.log(JSON.stringify({items: catalog.items.length, counts}));
}
