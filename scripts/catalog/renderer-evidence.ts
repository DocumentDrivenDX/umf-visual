// SPDX-License-Identifier: MIT OR Apache-2.0
/** Add deterministic native diagram renders and verified host preview receipts to integration cases. */
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, relative, resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium, type Browser, type Page} from 'playwright';
import mermaidPackage from 'mermaid/package.json';
import {exportPowerPoint, importPowerPoint} from '../../src/adapters/powerpoint/index.js';
import {exportVisual, interchangeCapabilities, type InterchangeFormat} from '../../src';
import type {Document} from '@umf/core';
import type {IntegrationCase} from './integrations.js';
import type {RendererTargetEvidence} from './renderer-types.js';
import {liniDirectory, verifyLiniRuntime} from '../interchange-runtime.js';

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

async function renderDot(source: string): Promise<string> {
  const process = Bun.spawn(['dot', '-Tsvg'], {stdin: 'pipe', stdout: 'pipe', stderr: 'pipe'});
  process.stdin.write(source); process.stdin.end();
  const [svg, stderr, exit] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  if (exit !== 0 || !svg.includes('<svg')) throw new Error(stderr.trim() || `Graphviz exited ${exit} without SVG output.`);
  return svg;
}

async function renderMermaid(page: Page, source: string, id: string, mermaidVersion: string, chromiumVersion: string): Promise<{svg: string; nativeVersion: string}> {
  await page.setContent('<!doctype html><html><meta charset="utf-8"><body><main id="output"></main></body></html>', {waitUntil: 'domcontentloaded'});
  let externalRequest: string | undefined;
  const route = async (request: import('playwright').Route) => {
    const protocol = new URL(request.request().url()).protocol;
    if (protocol === 'file:' || protocol === 'data:' || protocol === 'about:') await request.continue();
    else {externalRequest ??= request.request().url(); await request.abort();}
  };
  await page.route('**/*', route);
  try {
    await page.addScriptTag({path: resolve(root, 'node_modules/mermaid/dist/mermaid.min.js')});
    const rendered = await page.evaluate(async ({source, id}) => {
      const api = (window as any).mermaid;
      if (!api) throw new Error('Mermaid bundle did not expose window.mermaid.');
      api.initialize({startOnLoad: false, securityLevel: 'strict', theme: 'neutral', look: 'classic', fontFamily: 'Arial', deterministicIds: true, deterministicIDSeed: id});
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
    }, {source, id});
    if (externalRequest) throw new Error(`Mermaid attempted an external request: ${externalRequest}`);
    if (!rendered.svg.includes('<svg')) throw new Error('Mermaid returned no SVG.');
    return {svg: rendered.svg, nativeVersion: `${rendered.version === 'unknown' ? mermaidVersion : rendered.version} / Chromium ${chromiumVersion}`};
  } finally {await page.unroute('**/*', route);}
}

function validateLiniDiagnostics(text: string): void {
  let value: any;
  try {value = JSON.parse(text);} catch {throw new Error('Lini returned malformed diagnostics JSON.');}
  const diagnostics = Array.isArray(value) ? value : value?.diagnostics;
  if (!Array.isArray(diagnostics) || diagnostics.some((item: any) => item?.severity === 'error')) throw new Error(`Lini refused generated source: ${text}`);
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

export function joinRendererReceiptRows(item: IntegrationCase, receipts: Map<string, any>): RendererTargetEvidence[] {
  if (!item.commonDocument || !item.commonPath || !item.commonSha256) return [];
  const rows: RendererTargetEvidence[] = [];
  for (const [rendererId, receipt] of receipts) {
    const entry = receipt.cases.find((candidate: any) => candidate.id === item.id);
    if (!entry) continue;
    if (!Array.isArray(entry.rendererTargets)) throw new Error(`${rendererId} preview receipt case ${item.id} has no rendererTargets array.`);
    const matching = entry.rendererTargets.filter((row: any) => row?.rendererId === rendererId);
    if (matching.length !== 1) throw new Error(`${rendererId} preview receipt case ${item.id} must contain exactly one matching target.`);
    const target = structuredClone(matching[0]) as RendererTargetEvidence;
    if (!target.profileId || !target.modelVersion || !target.mappingVersion || !target.projection || !Array.isArray(target.projection.losses) || !Array.isArray(target.projection.diagnostics)) {
      throw new Error(`${rendererId} preview receipt case ${item.id} is malformed.`);
    }
    if (target.projection.state === 'emitted' && target.projection.diagnostics.some((diagnostic: any) => diagnostic?.severity === 'error')) {
      throw new Error(`${rendererId} emitted preview receipt contains error-severity diagnostics for ${item.id}.`);
    }
    const targetKey = rendererId === 'google-slides' ? 'googleSlides' : rendererId;
    const expected = item.targets[targetKey as keyof IntegrationCase['targets']];
    if (!expected || target.profileId !== expected.profile) throw new Error(`${rendererId} preview profile differs from the current integration target for ${item.id}.`);
    if(target.mappingVersion!=='1')throw new Error(`${rendererId} receipt mapping version differs from the current host profile implementation for ${item.id}.`);
    if (target.preview && (target.preview.profileId !== target.profileId || target.preview.modelVersion !== target.modelVersion || target.preview.mappingVersion !== target.mappingVersion)) {
      throw new Error(`${rendererId} preview identity differs from its renderer row for ${item.id}.`);
    }
    const expectedSourcePath = `fixtures/integrations/complex-miro/${item.commonPath}`;
    if (!entry.source || typeof entry.source.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.source.sha256) || entry.source.path !== expectedSourcePath) {
      throw new Error(`${rendererId} matching receipt ${item.id} has malformed or mismatched source provenance.`);
    }
    if (target.preview && (typeof target.preview.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(target.preview.sourceSha256))) {
      throw new Error(`${rendererId} matching receipt ${item.id} has malformed preview source provenance.`);
    }
    const sourceMatches = verifyRendererPreviewSource(item.commonSha256, entry.source.sha256) && verifyRendererPreviewSource(item.commonSha256, target.preview?.sourceSha256);
    if (target.modelVersion !== modelVersion(item.commonDocument)) throw new Error(`${rendererId} receipt model version differs from current source for ${item.id}.`);
    if (!sourceMatches) {
      const currentProjection = expected.status === 'refused'
        ? {state: 'refused' as const, status: 'unsupported' as const}
        : expected.status === 'planned'
          ? {state: 'planned' as const, status: 'not-evaluated' as const}
          : {state: 'emitted' as const, status: expected.losses.length ? 'reported-loss' as const : 'supported' as const};
      target.projection = {...currentProjection, diagnostics: expected.diagnostics, losses: expected.losses};
      target.preview = {state: 'unavailable', engine: target.preview?.engine ?? rendererId, nativeVersion: target.preview?.nativeVersion ?? 'unverified',
        sourceSha256: item.commonSha256, profileId: target.profileId, modelVersion: target.modelVersion, mappingVersion: target.mappingVersion,
        stage: 'export', error: 'Receipt source SHA-256 does not match the current common UMF bytes; the saved preview is not joined.'};
      target.artifacts = [];
      target.roundTrip={state:'unavailable',error:'Receipt source SHA-256 does not match the current source; its earlier round-trip does not qualify this pair.'};
    }else{
      const sourceLosses=(values:unknown[])=>values.filter(value=>!(value&&typeof value==='object'&&(value as {family?:unknown}).family==='native')).map(value=>canonical(value)).sort();
      if(canonical(sourceLosses(target.projection.losses))!==canonical(sourceLosses(expected.losses)))throw new Error(`${rendererId} receipt semantic loss inventory differs from the current source projection for ${item.id}.`);
      if(canonical(target.projection.diagnostics)!==canonical(expected.diagnostics))throw new Error(`${rendererId} receipt source diagnostics differ from the current source projection for ${item.id}.`);
      if(target.projection.state==='emitted'&&sourceLosses(expected.losses).length&&target.projection.status!=='reported-loss')throw new Error(`${rendererId} receipt hides current semantic losses behind a supported status for ${item.id}.`);
      if(target.projection.state==='planned'&&target.projection.status!=='not-evaluated')throw new Error(`${rendererId} planned output cannot claim native projection success for ${item.id}.`);
      if(target.preview?.state==='rendered'){
        const preview=target.preview,asset=preview.asset;
        if(!asset||!Number.isFinite(asset.width)||!Number.isFinite(asset.height)||asset.width<=0||asset.height<=0||!/^[a-f0-9]{64}$/.test(asset.sha256)||!preview.engine||!preview.nativeVersion||!preview.stage)throw new Error(`${rendererId} rendered preview lacks valid image/runtime metadata for ${item.id}.`);
        if(rendererId==='powerpoint'){
          if(!/^[a-f0-9]{64}$/.test(preview.inputArtifactSha256??''))throw new Error(`PowerPoint preview lacks an exact input artifact digest for ${item.id}.`);
        }else{
          const fence=entry.captureFence;
          const valid=(observation:any)=>observation&&typeof observation.revision==='string'&&observation.revision.trim().length>0&&/^[a-f0-9]{64}$/.test(observation.captureDigestSha256??'');
          if(!valid(fence?.before)||!valid(fence?.after)||fence.before.revision!==fence.after.revision||fence.before.captureDigestSha256!==fence.after.captureDigestSha256||preview.revision!==fence.after.revision||preview.captureDigestSha256!==fence.after.captureDigestSha256)throw new Error(`${rendererId} preview lacks a matching revision/capture fence for ${item.id}.`);
        }
      }
    }
    rows.push(target);
  }
  return rows;
}

async function readDurableReceipts(): Promise<Map<string, any>> {
  const result = new Map<string, any>();
  for (const id of ['powerpoint', 'google-slides', 'miro'] as const) {
    const path = join(root, 'fixtures/renderers', id, 'preview-receipt.json');
    let bytes: Uint8Array;
    try {bytes = await readFile(path);}
    catch (error) {if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error;}
    let receipt: any;
    try {receipt = JSON.parse(new TextDecoder().decode(bytes));} catch {throw new Error(`${id} preview receipt is malformed JSON.`);}
    if (receipt?.schemaVersion !== 1 || !Array.isArray(receipt.cases)) throw new Error(`${id} preview receipt has an invalid envelope.`);
    const ids = new Set<string>();
    for (const entry of receipt.cases) {
      if (!entry || typeof entry.id !== 'string' || ids.has(entry.id)) throw new Error(`${id} preview receipt has a missing or duplicate case ID.`);
      ids.add(entry.id);
    }
    result.set(id, receipt);
  }
  return result;
}

async function copyDurablePreviewAsset(outputDir: string, item: IntegrationCase, rendererId: string, entry: any, target: RendererTargetEvidence): Promise<void> {
  const preview = target.preview, asset = preview?.asset;
  if (!preview || preview.state !== 'rendered' || !asset) return;
  const sourcePath = entry.assetSourcePath;
  if (typeof sourcePath !== 'string' || sourcePath.startsWith('/') || sourcePath.split(/[\\/]/).includes('..')) {
    throw new Error(`${rendererId} preview ${item.id} lacks a safe durable assetSourcePath.`);
  }
  const source = join(root, sourcePath), bytes = await readFile(source);
  if (sha256(bytes) !== asset.sha256) throw new Error(`${rendererId} preview asset hash mismatch for ${item.id}.`);
  if (!asset.width || !asset.height || !asset.mediaType) throw new Error(`${rendererId} preview asset metadata is incomplete for ${item.id}.`);
  const extension = asset.mediaType === 'image/png' ? 'png' : asset.mediaType === 'image/svg+xml' ? 'svg' : asset.mediaType === 'image/jpeg' ? 'jpg' : undefined;
  if (!extension) throw new Error(`${rendererId} preview media type is not supported for static thumbnails: ${asset.mediaType}.`);
  const destination = `integrations/previews/${rendererId}/${safe(item.id)}-${asset.sha256.slice(0, 16)}.${extension}`;
  await writeArtifact(outputDir, destination, bytes);
  asset.path = posix(destination);
}

async function validatePowerPointArchivedArtifact(outputDir: string, item: IntegrationCase, entry: any, target: RendererTargetEvidence): Promise<void> {
  if (!target.preview || target.preview.state !== 'rendered') return;
  const relativeArtifact = entry.artifactSourcePath ?? entry.artifact?.path;
  if (!entry.artifact || typeof entry.artifact.sha256 !== 'string' || typeof relativeArtifact !== 'string' ||
      target.preview.inputArtifactSha256 !== entry.artifact.sha256 || !Array.isArray(target.artifacts) || target.artifacts[0]?.sha256 !== entry.artifact.sha256) {
    throw new Error(`PowerPoint renderer receipt artifact provenance is malformed for ${item.id}.`);
  }
  if (relativeArtifact.startsWith('/') || relativeArtifact.split(/[\\/]/).includes('..')) throw new Error(`PowerPoint archived artifact path is unsafe for ${item.id}.`);
  const archivedBytes = await readFile(join(root, relativeArtifact));
  if (sha256(archivedBytes) !== entry.artifact.sha256) throw new Error(`PowerPoint archived artifact hash mismatch for ${item.id}.`);
  const fresh = await exportPowerPoint(item.commonDocument!, {mode: 'report'});
  const readback = await importPowerPoint(archivedBytes, {mode: 'report', binding: fresh.binding, expectedBindingRevision: fresh.bindingRevision});
  if (readback.changes.length !== 0 || canonical(readback.document) !== canonical(item.commonDocument)) {
    throw new Error(`PowerPoint archived preview artifact no longer passes UMF source readback for ${item.id}.`);
  }
  if (canonical(fresh.losses) !== canonical(target.projection.losses)) throw new Error(`PowerPoint archived loss ledger differs from the current adapter projection for ${item.id}.`);
  const destination = `integrations/downloads/powerpoint-preview/${safe(item.id)}-${entry.artifact.sha256.slice(0, 16)}.pptx`;
  const copied = await writeArtifact(outputDir, destination, archivedBytes);
  if (copied.sha256 !== entry.artifact.sha256 || target.preview.inputArtifactSha256 !== copied.sha256) throw new Error(`PowerPoint preview input artifact is not the verified archived PPTX for ${item.id}.`);
  target.artifacts = [copied];
}

export async function joinPowerPointCycle(outputDir:string,item:IntegrationCase,target:RendererTargetEvidence):Promise<void>{
  const path=join(root,'fixtures/renderers/powerpoint/native-cycle-receipt.json');
  let bytes:Uint8Array;try{bytes=await readFile(path);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
  const receipt=JSON.parse(new TextDecoder().decode(bytes)),matches=receipt?.cases?.filter((entry:any)=>entry.id===item.id);
  if(receipt.schemaVersion!==1||!Array.isArray(matches)||matches.length!==1)throw new Error(`PowerPoint cycle receipt has no unique case ${item.id}.`);
  const cycle=matches[0];
  if(cycle.source?.sha256!==item.commonSha256){target.roundTrip={state:'unavailable',error:'PowerPoint cycle belongs to different source bytes.'};return;}
  if(cycle.profileId!==target.profileId||cycle.modelVersion!==target.modelVersion||cycle.mappingVersion!==target.mappingVersion)throw new Error(`PowerPoint cycle profile/model/mapping differs from current source for ${item.id}.`);
  if(cycle.roundTrip?.state!=='passed'){target.roundTrip={state:'unavailable',error:cycle.roundTrip?.error??'PowerPoint host readback remains pending.'};return;}
  const sha=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
  const host=cycle.hostReadback,attestation=host?.operatorAttestation;
  if(cycle.roundTrip.nativeHostReadback!==true||cycle.roundTrip.nativeEditValuesVerified!==true||cycle.roundTrip.umfQuestionUpdateVerifiedByParser!==true||!cycle.persistence?.sourceJson||!cycle.persistence?.sourceYaml||!cycle.persistence?.bindingJson||!sha(cycle.preservedArtifact?.sha256)||!sha(host?.artifactSha256)||host.inputArtifactSha256!==cycle.preservedArtifact.sha256||host.exactUpdatedDocument!==true||host.semanticChanges!==0||!attestation?.reopenObserved||!attestation.noRepairPrompt||!attestation.updatedQuestionVisible||!attestation.nativeBoldLabelVisible||!attestation.attachedEndpointsObserved||!attestation.host?.application||!attestation.host?.version)throw new Error(`PowerPoint cycle lacks complete native host/persistence evidence for ${item.id}.`);
  const semantics=(losses:unknown[])=>losses.filter((loss:any)=>loss.family!=='native').map(canonical).sort();
  if(!Array.isArray(host.losses)||canonical(semantics(host.losses))!==canonical(semantics(target.projection.losses)))throw new Error(`PowerPoint cycle source losses differ from the current projection for ${item.id}.`);
  const copied=await writeArtifact(outputDir,`integrations/evidence/powerpoint-native-cycle-${sha256(bytes).slice(0,16)}.json`,bytes);
  const changePaths=(cycle.imported.changes as any[]).map(change=>change.path as string);
  const operator=host.operatorAttestation;
  const endpointChanges=(cycle.imported.changes as any[]).filter(change=>/^\/extensions\/umf\.visual\/edges\/\d+\/(from|to)$/.test(change.path));
  const sourceVisual=item.commonDocument!.extensions?.['umf.visual'] as any;
  const endpointMatchesSource=endpointChanges.some(change=>{
    const match=/^\/extensions\/umf\.visual\/edges\/(\d+)\/(from|to)$/.exec(change.path);
    const edge=match&&sourceVisual?.edges?.[Number(match[1])];
    const field=match?.[2];
    return edge&&field&&change.before?.present===true&&change.before.value===edge[field]&&change.after?.present===true&&
      typeof change.after.value==='string'&&change.after.value!==edge[field]&&sourceVisual.nodes.some((node:any)=>node.id===change.after.value);
  });
  const checks={
    noop:cycle.nativeNoOp?.exactSourceReadback===true&&cycle.nativeNoOp?.semanticChanges===0,
    label:changePaths.some(path=>/\/nodes\/\d+\/label$/.test(path))&&operator.nativeBoldLabelVisible===true,
    reconnection:endpointChanges.length>0&&endpointMatchesSource&&operator.attachedEndpointsObserved===true,
    movement:Array.isArray(cycle.nativePresentationChangesVsExport?.geometryAndStyleShapes)&&cycle.nativePresentationChangesVsExport.geometryAndStyleShapes.length>0&&cycle.preservingReadback?.nativeShapePropertiesPreserved===true,
    style:Array.isArray(cycle.nativePresentationChangesVsExport?.textStyleShapes)&&cycle.nativePresentationChangesVsExport.textStyleShapes.length>0&&operator.nativeBoldLabelVisible===true,
    jsonPersistence:cycle.persistence?.sourceJson===true,
    yamlPersistence:cycle.persistence?.sourceYaml===true,
    preservingUpdate:typeof cycle.preservingUpdate?.path==='string'&&cycle.preservingReadback?.exactAcceptedDocument===true&&cycle.preservingReadback?.nativeShapePropertiesPreserved===true,
    readback:host.exactUpdatedDocument===true&&host.semanticChanges===0&&operator.reopenObserved===true&&operator.noRepairPrompt===true,
  };
  if(Object.values(checks).some(value=>value!==true))throw new Error(`PowerPoint host cycle lacks one or more required completion checks for ${item.id}.`);
  target.roundTrip={state:'passed',receipt:copied,sourceSha256:item.commonSha256,profileId:target.profileId,modelVersion:target.modelVersion,mappingVersion:target.mappingVersion,
    checks,attestation:{kind:'powerpoint-ui',nativeHostReadback:true,application:operator.host?.application,version:operator.host?.version,
      observedOn:operator.observedOn,reopenObserved:operator.reopenObserved,noRepairPrompt:operator.noRepairPrompt,updatedQuestionVisible:operator.updatedQuestionVisible,
      nativeBoldLabelVisible:operator.nativeBoldLabelVisible,attachedEndpointsObserved:operator.attachedEndpointsObserved},
    nativeEditMethod:'PowerPoint editor UI and native Save As',host:attestation.host,inputArtifactSha256:cycle.preservedArtifact.sha256,outputArtifactSha256:host.artifactSha256,
    semanticEditPaths:changePaths,preservingUpdatePath:cycle.preservingUpdate.path,nativeHostReadback:true};
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
      base.preview = {state: 'failed', engine: format === 'dot' ? 'graphviz' : format, nativeVersion: format === 'dot' ? runtime.graphviz : format === 'mermaid' ? `${runtime.mermaid} / Chromium ${runtime.chromium.version()}` : runtime.lini.version,
        sourceSha256: sha256(rawSource), profileId: base.profileId, modelVersion: version, mappingVersion: base.mappingVersion, stage: 'export', error: errorText(error)};
      if (projection.status === 'supported') throw new Error(`Strict ${format} source for ${item.id} failed its actual native render: ${errorText(error)}`);
      result.push(base); continue;
    }
    const sourceBytes = new TextEncoder().encode(projection.source);
    const sourceArtifact = await writeArtifact(outputDir, `integrations/downloads/${nativeId}-${format}-${sha256(sourceBytes).slice(0, 16)}.${extension}`, sourceBytes);
    const svgBytes = new TextEncoder().encode(svg), svgSha = sha256(svgBytes), dimensions = svgDimensions(svg);
    const svgArtifact = await writeArtifact(outputDir, `integrations/previews/${format}/${nativeId}-${svgSha.slice(0, 16)}.svg`, svgBytes);
    if (!(dimensions.width > 0 && dimensions.height > 0)) throw new Error(`${format} renderer produced invalid SVG dimensions for ${item.id}.`);
    base.artifacts = [sourceArtifact, svgArtifact];
    base.preview = {state: 'rendered', engine: format === 'dot' ? 'graphviz' : format, nativeVersion, sourceSha256: sha256(rawSource), profileId: base.profileId,
      modelVersion: version, mappingVersion: base.mappingVersion, inputArtifactSha256: sourceArtifact.sha256, stage: 'export',
      asset: {path: svgArtifact.path, sha256: svgArtifact.sha256, mediaType: 'image/svg+xml', width: dimensions.width, height: dimensions.height}};
    result.push(base);
  }
  return result;
}

/** @covers US-095-AC10, AC11, AC12: join exact source-bound multi-renderer previews without promoting stale evidence. */
export async function buildRendererEvidence(cases: IntegrationCase[], outputDirectory: string): Promise<void> {
  const outputDir = resolve(outputDirectory), runtime = await preflight(), page = await runtime.chromium.newPage();
  const externalRequests: string[] = [];
  page.on('request', request => {if (!['about:', 'data:', 'file:'].includes(new URL(request.url()).protocol)) externalRequests.push(request.url());});
  const receipts = await readDurableReceipts();
  const entriesByReceipt = new Map<string, Map<string, any>>();
  for (const [id, receipt] of receipts) entriesByReceipt.set(id, new Map(receipt.cases.map((entry: any) => [entry.id, entry])));
  try {
    for (const item of cases) {
      if (!item.commonDocument || !item.commonPath || !item.commonSha256) {item.rendererTargets = []; continue;}
      const sourcePath = join(root, 'fixtures/integrations/complex-miro', item.commonPath);
      const sourceBytes = await readFile(sourcePath);
      if (sha256(sourceBytes) !== item.commonSha256) throw new Error(`Current common source SHA-256 mismatch for ${item.id}.`);
      const parsed = JSON.parse(new TextDecoder().decode(sourceBytes));
      if (canonical(parsed) !== canonical(item.commonDocument)) throw new Error(`IntegrationCase document differs from exact source bytes for ${item.id}.`);
      const nativeRows = await writeNativeTargets(item, sourceBytes, outputDir, page, runtime);
      const hostRows = joinRendererReceiptRows(item, receipts);
      for (const [rendererId, receiptById] of entriesByReceipt) {
        const entry = receiptById.get(item.id);
        const target = hostRows.find(row => row.rendererId === rendererId);
        if (entry && target) {
          await copyDurablePreviewAsset(outputDir, item, rendererId, entry, target);
          if (target.roundTrip?.state === 'passed' && !(target.roundTrip as any).receipt && ['google-slides', 'miro'].includes(rendererId)) {
            const bytes = await readFile(join(root, 'fixtures/renderers', rendererId, 'preview-receipt.json'));
            const copied = await writeArtifact(outputDir, `integrations/evidence/${rendererId}-cohort-${sha256(bytes).slice(0, 16)}.json`, bytes);
            (target.roundTrip as any).receipt = copied;
          }
          if (rendererId === 'powerpoint'){
            if(target.preview?.state === 'rendered')await validatePowerPointArchivedArtifact(outputDir, item, entry, target);
            await joinPowerPointCycle(outputDir,item,target);
          }
        }
      }
      item.rendererTargets = [...nativeRows, ...hostRows];
    }
    if (externalRequests.length) throw new Error(`Native Mermaid render attempted external requests: ${externalRequests.join(', ')}`);
  } finally {await page.close(); await runtime.chromium.close();}
}

/** Exposed for focused receipt tests; a malformed matching receipt is a build error. */
export function verifyRendererPreviewSource(currentSha256: string, receiptSourceSha256: unknown): boolean {
  if (!/^[a-f0-9]{64}$/.test(currentSha256)) throw new Error('Current source SHA-256 is malformed.');
  if (receiptSourceSha256 !== undefined && (typeof receiptSourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(receiptSourceSha256))) throw new Error('Renderer receipt source SHA-256 is malformed.');
  return typeof receiptSourceSha256 === 'string' && /^[a-f0-9]{64}$/.test(receiptSourceSha256) && receiptSourceSha256 === currentSha256;
}

