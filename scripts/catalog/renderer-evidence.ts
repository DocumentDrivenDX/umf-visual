// SPDX-License-Identifier: MIT OR Apache-2.0
/** Add deterministic native diagram renders (DOT, Mermaid, Lini) to integration cases. */
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, relative, resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium, type Browser, type Page} from 'playwright';
import mermaidPackage from 'mermaid/package.json';
import {exportPowerPoint, importPowerPoint} from '../../src/adapters/powerpoint/index.js';
import {exportVisual, importVisual, interchangeCapabilities, type FullInterchangeProfile, type InterchangeFormat} from '../../src';
import type {Document} from '@umf/core';
import type {IntegrationCase} from './integrations.js';
import type {FullRendererTargetEvidence, RendererTargetEvidence} from './renderer-types.js';
import {liniDirectory, verifyLiniRuntime} from '../interchange-runtime.js';
import {nativePreviewPresentation, normalizeSvgIntrinsicDimensions, previewPresentationReceipt} from './native-preview-presentation.js';
import {buildFullProfileVariants, focusedFullProfilePreviewSource} from './full-profiles.js';
import {verifyFullNativeWitness, verifyNativeFirstWitness} from '../full-native-witness.js';

const root = resolve(import.meta.dir, '../..');
const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => {
  const sort = (item: any): any => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key])])) : item;
  return JSON.stringify(sort(value));
};
const safe = (value: string) => value.normalize('NFKD').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
const posix = (value: string) => value.split(sep).join('/');
const modelVersion = (document: Document) => document.vocabularies['umf.visual']?.version ?? 'unknown';

interface LiniCompiler {
  default(options: {module_or_path: Uint8Array}): Promise<void>;
  version(): string;
  diagnostics(source: string, options: unknown): string;
  compile(source: string, options: unknown): string;
}
interface RuntimeSet {
  graphviz: string;
  mermaid: string;
  chromium: Browser;
  lini: {compiler: LiniCompiler; version: string};
}
interface Projection {
  status: 'supported'|'reported-loss'|'unsupported';
  state: 'emitted'|'refused';
  source?: string;
  diagnostics: unknown[];
  losses: unknown[];
}

function errorText(error: unknown): string {return error instanceof Error ? error.message : String(error);}

async function commandVersion(args: string[], pattern: RegExp, label: string): Promise<string> {
  let child: ReturnType<typeof Bun.spawn>;
  try {child = Bun.spawn(args, {stdout: 'pipe', stderr: 'pipe'});}
  catch (error) {throw new Error(`${label} is required for renderer evidence: ${errorText(error)}`);}
  const read = async (value: typeof child.stdout): Promise<string> => !value || typeof value === 'number' ? '' : new Response(value as any).text();
  const text = (await Promise.all([read(child.stdout), read(child.stderr)])).join('\n').trim();
  if (await child.exited !== 0) throw new Error(`${label} version command failed: ${text}`);
  const match = pattern.exec(text);
  if (!match) throw new Error(`Could not parse ${label} version from ${JSON.stringify(text)}`);
  return match[1]!;
}

async function loadLini(): Promise<{compiler: LiniCompiler; version: string}> {
  const runtimeDir = resolve(root, liniDirectory), pin = await verifyLiniRuntime(runtimeDir);
  const compiler = await import(pathToFileURL(join(runtimeDir, 'lini_wasm.js')).href) as LiniCompiler;
  await compiler.default({module_or_path: await readFile(join(runtimeDir, 'lini_wasm_bg.wasm'))});
  const version = compiler.version();
  if (version !== pin.version || version !== '1.1.0') throw new Error(`Pinned Lini runtime reports ${version}; expected verified 1.1.0.`);
  return {compiler, version};
}

async function preflight(): Promise<RuntimeSet> {
  const graphviz = await commandVersion(['dot', '-V'], /graphviz version\s+([^\s(]+)/i, 'Graphviz');
  if (mermaidPackage.version !== '12.2.0') throw new Error(`Mermaid package is ${mermaidPackage.version}; renderer evidence is qualified for 12.2.0.`);
  const lini = await loadLini();
  let browser: Browser;
  try {browser = await chromium.launch({headless: true});}
  catch (error) {throw new Error(`Chromium is required for Mermaid renderer evidence: ${errorText(error)}`);}
  return {graphviz, mermaid: mermaidPackage.version, chromium: browser, lini};
}

async function renderDot(source: string, rejectDiagnostics = false): Promise<string> {
  const process = Bun.spawn(['dot', ...nativePreviewPresentation.graphviz.args, '-Tsvg'], {stdin: 'pipe', stdout: 'pipe', stderr: 'pipe'});
  process.stdin.write(source); process.stdin.end();
  const [svg, stderr, exit] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  if (exit !== 0 || !svg.includes('<svg') || (rejectDiagnostics && stderr.trim())) throw new Error(stderr.trim() || `Graphviz exited ${exit} without SVG output.`);
  return svg;
}

async function renderMermaid(page: Page, source: string, id: string, mermaidVersion: string, chromiumVersion: string, rejectDiagnostics = false): Promise<{svg: string; nativeVersion: string}> {
  await page.setContent('<!doctype html><html><meta charset="utf-8"><body><main id="output"></main></body></html>', {waitUntil: 'domcontentloaded'});
  let externalRequest: string | undefined;
  const nativeDiagnostics: string[] = [];
  const onConsole = (message: import('playwright').ConsoleMessage) => {if (rejectDiagnostics) nativeDiagnostics.push(`${message.type()}: ${message.text()}`);};
  if (rejectDiagnostics) page.on('console', onConsole);
  const route = async (request: import('playwright').Route) => {
    const protocol = new URL(request.request().url()).protocol;
    if (protocol === 'file:' || protocol === 'data:' || protocol === 'about:') await request.continue();
    else {externalRequest ??= request.request().url(); await request.abort();}
  };
  await page.route('**/*', route);
  try {
    await page.addScriptTag({path: resolve(root, 'node_modules/mermaid/dist/mermaid.min.js')});
    const rendered = await page.evaluate(async ({source, id, style}) => {
      const api = (window as any).mermaid;
      if (!api) throw new Error('Mermaid bundle did not expose window.mermaid.');
      api.initialize({startOnLoad: false, securityLevel: 'strict', ...style, deterministicIds: true, deterministicIDSeed: id});
      let state = 2166136261;
      for (const character of id) state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
      const originalRandom = Math.random;
      Math.random = () => {
        state = (state + 0x6D2B79F5) | 0;
        let value = state;
        value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
      };
      try {const result = await api.render(`renderer-${id}`, source); await document.fonts.ready; return {svg: result.svg, version: api.version ?? 'unknown'};}
      finally {Math.random = originalRandom;}
    }, {source, id, style: {...nativePreviewPresentation.mermaid, ...(rejectDiagnostics ? {maxTextSize:262144,maxEdges:10000} : {}), themeVariables: {...nativePreviewPresentation.mermaid.themeVariables}}});
    if (externalRequest) throw new Error(`Mermaid attempted an external request: ${externalRequest}`);
    if (nativeDiagnostics.length) throw new Error(`Mermaid emitted native diagnostics: ${nativeDiagnostics.join('; ')}`);
    if (!rendered.svg.includes('<svg')) throw new Error('Mermaid returned no SVG.');
    return {svg: rendered.svg, nativeVersion: `${rendered.version === 'unknown' ? mermaidVersion : rendered.version} / Chromium ${chromiumVersion}`};
  } finally {await page.unroute('**/*', route); if (rejectDiagnostics) page.off('console', onConsole);}
}

function validateLiniDiagnostics(text: string): void {
  let value: any;
  try {value = JSON.parse(text);} catch {throw new Error('Lini returned malformed diagnostics JSON.');}
  const diagnostics = Array.isArray(value) ? value : value?.diagnostics;
  if (!Array.isArray(diagnostics) || diagnostics.some((item: any) => item?.severity === 'error')) throw new Error(`Lini refused generated source: ${text}`);
}

function requireNoNativeDiagnostics(text: string, label: string): void {
  let value: any;
  try {value = JSON.parse(text);} catch {throw new Error(`${label} returned malformed diagnostics JSON.`);}
  const diagnostics = Array.isArray(value) ? value : value?.diagnostics;
  if (!Array.isArray(diagnostics) || diagnostics.length) throw new Error(`${label} returned native diagnostics: ${text}`);
}

function svgDimensions(svg: string): {width: number; height: number} {
  const head = /<svg\b[^>]*>/i.exec(svg)?.[0];
  if (!head) throw new Error('Renderer output has no SVG root element.');
  const attr = (name: string) => new RegExp(`\\b${name}=["']([^"']+)["']`, 'i').exec(head)?.[1];
  const measure = (raw: string | undefined, fallback: number): number => {
    if (!raw) return fallback;
    const match = /^\s*([0-9]+(?:\.[0-9]+)?)(px|pt|in|cm|mm)?\s*$/i.exec(raw);
    if (!match) return fallback;
    const value = Number(match[1]), unit = (match[2] ?? 'px').toLowerCase();
    const px = unit === 'pt' ? value * 96 / 72 : unit === 'in' ? value * 96 : unit === 'cm' ? value * 96 / 2.54 : unit === 'mm' ? value * 96 / 25.4 : value;
    return Math.max(1, Math.round(px));
  };
  const box = attr('viewBox')?.trim().split(/[ ,]+/).map(Number);
  if (box?.length === 4 && box.every(Number.isFinite) && box[2]! > 0 && box[3]! > 0) return {width: box[2]!, height: box[3]!};
  return {width: measure(attr('width'), box?.[2] ?? 0), height: measure(attr('height'), box?.[3] ?? 0)};
}

async function writeArtifact(outputDir: string, relativePath: string, bytes: Uint8Array): Promise<{path: string; sha256: string; mediaType: string; bytes: number}> {
  const outputPath = join(outputDir, relativePath);
  await mkdir(join(outputPath, '..'), {recursive: true});
  await writeFile(outputPath, bytes);
  const mediaType = relativePath.endsWith('.svg') ? 'image/svg+xml' : relativePath.endsWith('.dot') ? 'text/vnd.graphviz' : relativePath.endsWith('.mmd') ? 'text/vnd.mermaid' : relativePath.endsWith('.lini') ? 'text/x-lini' : relativePath.endsWith('.json')?'application/json':relativePath.endsWith('.pptx')?'application/vnd.openxmlformats-officedocument.presentationml.presentation':'application/octet-stream';
  return {path: posix(relativePath), sha256: sha256(bytes), mediaType, bytes: bytes.byteLength};
}

function projectionFor(document: Document, format: InterchangeFormat): Projection {
  const strict = exportVisual(document, {format, mode: 'strict'});
  const result = strict.ok ? strict : exportVisual(document, {format, mode: 'allow-reported-loss'});
  const emitted = result.ok && typeof result.text === 'string';
  return {status: emitted ? strict.ok ? 'supported' : 'reported-loss' : 'unsupported', state: emitted ? 'emitted' : 'refused', ...(emitted ? {source: result.text} : {}), diagnostics: result.diagnostics, losses: result.diagnostics.filter(item => item.loss)};
}

async function writeNativeTargets(item: IntegrationCase, rawSource: Uint8Array, outputDir: string, page: Page, runtime: RuntimeSet): Promise<RendererTargetEvidence[]> {
  const document = item.commonDocument!;
  const version = modelVersion(document);
  const result: RendererTargetEvidence[] = [];
  for (const format of ['dot', 'mermaid', 'lini'] as const) {
    const projection = projectionFor(document, format);
    const capability = interchangeCapabilities.find((row: any) => row.format === format && row.profile === `umf.visual.${format}/1`);
    if (!capability) throw new Error(`No base profile capability exists for ${format}.`);
    const base: RendererTargetEvidence = {rendererId: format, profileId: capability.profile, modelVersion: version, mappingVersion: capability.version,
      projection: {state: projection.state, status: projection.status, diagnostics: projection.diagnostics, losses: projection.losses}};
    if (!projection.source) {result.push(base); continue;}
    const nativeId = safe(item.id);
    let svg: string, nativeVersion: string, extension: string;
    try {
      if (format === 'dot') {svg = await renderDot(projection.source); nativeVersion = runtime.graphviz; extension = 'dot';}
      else if (format === 'mermaid') {const render = await renderMermaid(page, projection.source, nativeId, runtime.mermaid, runtime.chromium.version()); svg = render.svg; nativeVersion = render.nativeVersion; extension = 'mmd';}
      else {
        validateLiniDiagnostics(runtime.lini.compiler.diagnostics(projection.source, {}));
        svg = runtime.lini.compiler.compile(projection.source, {}); nativeVersion = runtime.lini.version; extension = 'lini';
        if (!svg.includes('<svg')) throw new Error('Pinned Lini compiler returned no SVG.');
      }
    } catch (error) {
      const engine = format === 'dot' ? 'graphviz' : format;
      base.preview = {state: 'failed', engine, nativeVersion: format === 'dot' ? runtime.graphviz : format === 'mermaid' ? `${runtime.mermaid} / Chromium ${runtime.chromium.version()}` : runtime.lini.version,
        sourceSha256: sha256(rawSource), profileId: base.profileId, modelVersion: version, mappingVersion: base.mappingVersion, stage: 'export',
        presentation: previewPresentationReceipt(engine), error: errorText(error)};
      if (projection.status === 'supported') throw new Error(`Strict ${format} source for ${item.id} failed its actual native render: ${errorText(error)}`);
      result.push(base); continue;
    }
    const sourceBytes = new TextEncoder().encode(projection.source);
    const sourceArtifact = await writeArtifact(outputDir, `integrations/downloads/${nativeId}-${format}-${sha256(sourceBytes).slice(0, 16)}.${extension}`, sourceBytes);
    const rawSvgBytes = new TextEncoder().encode(svg), rawDimensions = svgDimensions(svg), rawSvgSha = sha256(rawSvgBytes);
    const rawSvgArtifact = await writeArtifact(outputDir, `integrations/downloads/${nativeId}-${format}-raw-${rawSvgSha.slice(0, 16)}.svg`, rawSvgBytes);
    const normalized = normalizeSvgIntrinsicDimensions(svg), displaySvgBytes = new TextEncoder().encode(normalized.svg), displaySvgSha = sha256(displaySvgBytes);
    const displayDimensions = {width: normalized.width, height: normalized.height};
    const svgArtifact = await writeArtifact(outputDir, `integrations/previews/${format}/${nativeId}-${displaySvgSha.slice(0, 16)}.svg`, displaySvgBytes);
    if (!(rawDimensions.width > 0 && rawDimensions.height > 0 && displayDimensions.width > 0 && displayDimensions.height > 0)) throw new Error(`${format} renderer produced invalid SVG dimensions for ${item.id}.`);
    const engine = format === 'dot' ? 'graphviz' : format;
    base.artifacts = [sourceArtifact, rawSvgArtifact, svgArtifact];
    base.preview = {state: 'rendered', engine, nativeVersion, sourceSha256: sha256(rawSource), profileId: base.profileId,
      modelVersion: version, mappingVersion: base.mappingVersion, inputArtifactSha256: sourceArtifact.sha256, stage: 'export',
      presentation: previewPresentationReceipt(engine),
      rawAsset: {path: rawSvgArtifact.path, sha256: rawSvgArtifact.sha256, mediaType: 'image/svg+xml', width: rawDimensions.width, height: rawDimensions.height},
      asset: {path: svgArtifact.path, sha256: svgArtifact.sha256, mediaType: 'image/svg+xml', width: displayDimensions.width, height: displayDimensions.height}};
    result.push(base);
  }
  return result;
}

function nativeFullWitness(page: Page, source: string, svg: string, document: Document, format: InterchangeFormat, tier: string): Promise<unknown> {
  return tier === 'primitive-fallback'
    ? verifyFullNativeWitness(page, source, svg, document, format)
    : verifyNativeFirstWitness(page, source, svg, document, format);
}

async function renderFullSource(format: InterchangeFormat, source: string, id: string, page: Page, runtime: RuntimeSet): Promise<{svg: string; nativeVersion: string}> {
  if (format === 'dot') return {svg: await renderDot(source, true), nativeVersion: runtime.graphviz};
  if (format === 'mermaid') return renderMermaid(page, source, id, runtime.mermaid, runtime.chromium.version(), true);
  const diagnostics = runtime.lini.compiler.diagnostics(source, {});
  requireNoNativeDiagnostics(diagnostics, 'Lini full-profile diagnostics');
  const svg = runtime.lini.compiler.compile(source, {});
  if (!svg.includes('<svg')) throw new Error('Pinned Lini compiler returned no full-profile SVG.');
  return {svg, nativeVersion: runtime.lini.version};
}

async function writeFullSvg(outputDir: string, caseId: string, format: InterchangeFormat, stage: 'complete'|'focused', svg: string): Promise<{
  raw: {path:string;sha256:string;mediaType:string;bytes:number;width:number;height:number};
  display: {path:string;sha256:string;mediaType:string;bytes:number;width:number;height:number};
}> {
  const rawBytes = new TextEncoder().encode(svg), rawHash = sha256(rawBytes), rawDimensions = svgDimensions(svg);
  const raw = await writeArtifact(outputDir, `integrations/downloads/full/${safe(caseId)}-${format}-${stage}-raw-${rawHash.slice(0,16)}.svg`, rawBytes);
  const normalized = normalizeSvgIntrinsicDimensions(svg), displayBytes = new TextEncoder().encode(normalized.svg), displayHash = sha256(displayBytes);
  const display = await writeArtifact(outputDir, `integrations/previews/full/${format}/${safe(caseId)}-${stage}-${displayHash.slice(0,16)}.svg`, displayBytes);
  return {raw:{...raw,width:rawDimensions.width,height:rawDimensions.height},display:{...display,width:normalized.width,height:normalized.height}};
}

/** Build the canonical strict full/1 targets independently of the legacy compatibility renderer rows. */
export async function writeFullRendererTargets(item: IntegrationCase, rawSource: Uint8Array, outputDir: string, page: Page, runtime: RuntimeSet): Promise<FullRendererTargetEvidence[]> {
  if (!item.commonDocument || !item.commonPath || !item.commonSha256) throw new Error(`Full renderer targets require exact common source bytes for ${item.id}.`);
  const document = item.commonDocument, visual = document.extensions?.['umf.visual'] as any;
  if (!visual || typeof visual.id !== 'string' || typeof visual.question !== 'string') throw new Error(`Full renderer source document is missing common visual identity ${item.id}.`);
  if (sha256(rawSource) !== item.commonSha256) throw new Error(`Full renderer source document bytes are stale for ${item.id}.`);
  const variants = buildFullProfileVariants(document);
  const rows: FullRendererTargetEvidence[] = [];
  for (const variant of variants) {
    const format = variant.format, profileId = variant.profileId;
    if (!variant.result.ok || typeof variant.result.source !== 'string' || variant.result.diagnostics.length || variant.result.status !== 'supported') {
      throw new Error(`Canonical full profile did not produce strict zero-diagnostic source for ${item.id}/${format}: ${JSON.stringify(variant.result.diagnostics)}`);
    }
    const strict = exportVisual(document, {format, profile: profileId, mode: 'strict'});
    const repeat = exportVisual(document, {format, profile: profileId, mode: 'strict'});
    if (!strict.ok || !repeat.ok || typeof strict.text !== 'string' || strict.text !== variant.result.source || strict.text !== repeat.text ||
        canonical(strict.diagnostics) !== canonical(repeat.diagnostics) || canonical(strict.identityMap) !== canonical(repeat.identityMap) ||
        canonical(strict.representation) !== canonical(repeat.representation) || strict.diagnostics.length || repeat.diagnostics.length ||
        canonical(strict.identityMap) !== canonical(variant.result.identityMap)) {
      throw new Error(`Strict full-profile source or mapping is not reproducible for ${item.id}/${format}.`);
    }
    const source = strict.text, fullSourceBytes = new TextEncoder().encode(source), fullSourceSha256 = sha256(fullSourceBytes);
    const identityMapSha256 = sha256(canonical(strict.identityMap));
    const imported = importVisual(source, {format, profile: profileId, id: visual.id, question: visual.question, mode: 'strict'});
    if (!imported.ok || !imported.document || canonical(imported.document) !== canonical(document) || imported.diagnostics.length) {
      throw new Error(`Strict whole-document full-profile readback failed for ${item.id}/${format}: ${JSON.stringify(imported.diagnostics)}`);
    }
    if (canonical(imported.representation) !== canonical(variant.representation) || canonical(imported.approximations ?? []) !== canonical(variant.approximations)) {
      throw new Error(`Full-profile representation/approximation inventory differs on strict readback for ${item.id}/${format}.`);
    }
    const focusedSource = focusedFullProfilePreviewSource(source, format, variant.representation), focusedBytes = new TextEncoder().encode(focusedSource);
    const focusedSourceSha256 = sha256(focusedBytes);
    const sourceExt = format === 'dot' ? 'dot' : format === 'mermaid' ? 'mmd' : 'lini';
    const sourceArtifact = await writeArtifact(outputDir, `integrations/downloads/full/${safe(item.id)}-${format}-${fullSourceSha256.slice(0,16)}.${sourceExt}`, fullSourceBytes);
    const focusedSourceArtifact = await writeArtifact(outputDir, `integrations/downloads/full/${safe(item.id)}-${format}-focused-${focusedSourceSha256.slice(0,16)}.${sourceExt}`, focusedBytes);
    const nativeId = safe(item.id + '-full-' + format);
    const completeRender = await renderFullSource(format, source, nativeId + '-complete', page, runtime);
    const focusedRender = await renderFullSource(format, focusedSource, nativeId + '-focused', page, runtime);
    const completeWitness = await nativeFullWitness(page, source, completeRender.svg, document, format, variant.representation.tier);
    const focusedWitness = await nativeFullWitness(page, source, focusedRender.svg, document, format, variant.representation.tier);
    const completeSvg = await writeFullSvg(outputDir, item.id, format, 'complete', completeRender.svg);
    const focusedSvg = await writeFullSvg(outputDir, item.id, format, 'focused', focusedRender.svg);
    if (completeRender.nativeVersion !== focusedRender.nativeVersion) throw new Error(`Full/focused native renderer versions differ for ${item.id}/${format}.`);
    const engine = format === 'dot' ? 'graphviz' : format;
    const presentation = previewPresentationReceipt(engine);
    const preview = {state:'rendered' as const, engine, nativeVersion:focusedRender.nativeVersion, sourceSha256:item.commonSha256,
      profileId, modelVersion:variant.modelVersion, mappingVersion:variant.mappingVersion, inputArtifactSha256:focusedSourceArtifact.sha256,
      stage:'focused-full-profile-export', presentation,
      rawAsset:{path:focusedSvg.raw.path,sha256:focusedSvg.raw.sha256,mediaType:focusedSvg.raw.mediaType,width:focusedSvg.raw.width,height:focusedSvg.raw.height},
      asset:{path:focusedSvg.display.path,sha256:focusedSvg.display.sha256,mediaType:focusedSvg.display.mediaType,width:focusedSvg.display.width,height:focusedSvg.display.height}};
    const completePreview = {state:'rendered' as const, engine, nativeVersion:completeRender.nativeVersion, sourceSha256:item.commonSha256,
      profileId, modelVersion:variant.modelVersion, mappingVersion:variant.mappingVersion, inputArtifactSha256:sourceArtifact.sha256,
      stage:'complete-full-profile-export', presentation,
      rawAsset:{path:completeSvg.raw.path,sha256:completeSvg.raw.sha256,mediaType:completeSvg.raw.mediaType,width:completeSvg.raw.width,height:completeSvg.raw.height},
      asset:{path:completeSvg.display.path,sha256:completeSvg.display.sha256,mediaType:completeSvg.display.mediaType,width:completeSvg.display.width,height:completeSvg.display.height}};
    const documentSha256 = sha256(canonical(document));
    rows.push({rendererId:format,profileId,modelVersion:variant.modelVersion,mappingVersion:variant.mappingVersion,
      projection:{state:'emitted',status:'supported',diagnostics:strict.diagnostics,losses:[]},
      representation:variant.representation as unknown as Record<string,unknown>,approximations:variant.approximations,
      sourceDocument:{path:`fixtures/integrations/complex-miro/${item.commonPath}`,sha256:item.commonSha256},
      identityMap:{count:strict.identityMap.length,sha256:identityMapSha256},sourceArtifact,focusedSourceArtifact,
      wholeDocumentReadback:{state:'passed',mode:'strict',changes:0,sourceSha256:sourceArtifact.sha256,documentSha256,diagnostics:imported.diagnostics},
      native:{engine,nativeVersion:completeRender.nativeVersion,diagnostics:[],
        complete:{sourceSha256:sourceArtifact.sha256,svgArtifact:completeSvg.raw,witness:completeWitness as Record<string,unknown>},
        focused:{sourceSha256:focusedSourceArtifact.sha256,svgArtifact:focusedSvg.raw,witness:focusedWitness as Record<string,unknown>}},
      completePreview,preview,stableBuild:{state:'verified',sourceSha256:fullSourceSha256,focusedSourceSha256,documentSha256,identityMapSha256,deterministicSourceAndMapping:true}});
  }
  if (rows.length !== 3 || new Set(rows.map(row => row.rendererId)).size !== 3) throw new Error(`Expected three canonical full renderer targets for ${item.id}.`);
  return rows;
}

/** @covers US-095-AC10, AC11, AC12: join exact source-bound multi-renderer previews without promoting stale evidence. */
export async function buildRendererEvidence(cases: IntegrationCase[], outputDirectory: string): Promise<void> {
  const outputDir = resolve(outputDirectory), runtime = await preflight(), page = await runtime.chromium.newPage();
  const commonCases = cases.filter(item => item.commonDocument && item.commonPath && item.commonSha256);
  if (commonCases.length !== 5) throw new Error(`Canonical full renderer evidence requires exactly five common integration documents; found ${commonCases.length}.`);
  const externalRequests: string[] = [];
  page.on('request', request => {if (!['about:', 'data:', 'file:'].includes(new URL(request.url()).protocol)) externalRequests.push(request.url());});
  try {
    for (const item of cases) {
      if (!item.commonDocument || !item.commonPath || !item.commonSha256) {item.rendererTargets = []; item.fullRendererTargets = []; continue;}
      const sourcePath = join(root, 'fixtures/integrations/complex-miro', item.commonPath);
      const sourceBytes = await readFile(sourcePath);
      if (sha256(sourceBytes) !== item.commonSha256) throw new Error(`Current common source SHA-256 mismatch for ${item.id}.`);
      const parsed = JSON.parse(new TextDecoder().decode(sourceBytes));
      if (canonical(parsed) !== canonical(item.commonDocument)) throw new Error(`IntegrationCase document differs from exact source bytes for ${item.id}.`);
      const nativeRows = await writeNativeTargets(item, sourceBytes, outputDir, page, runtime);
      const fullRows = await writeFullRendererTargets(item, sourceBytes, outputDir, page, runtime);
      item.rendererTargets = nativeRows;
      item.fullRendererTargets = fullRows;
    }
    if (externalRequests.length) throw new Error(`Native Mermaid render attempted external requests: ${externalRequests.join(', ')}`);
  } finally {await page.close(); await runtime.chromium.close();}
}
