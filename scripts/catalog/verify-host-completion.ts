// SPDX-License-Identifier: MIT OR Apache-2.0
/** Fail-closed completion gate for exact-source, edited cycles in live host integrations. */
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {exportVisual, importVisual, type InterchangeFormat} from '../../src';
import {normalizeSvgIntrinsicDimensions, previewPresentationReceipt} from './native-preview-presentation';
import {focusedFullProfilePreviewSource} from './full-profiles';

const root = resolve(import.meta.dir, '../..');
const requiredHosts = ['powerpoint', 'google-slides', 'miro'] as const;
const requiredRenders = ['dot', 'mermaid', 'lini', ...requiredHosts] as const;
const requiredChecks = ['noop', 'label', 'reconnection', 'movement', 'style', 'jsonPersistence', 'yamlPersistence', 'preservingUpdate', 'readback'] as const;
const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const hashPattern = /^[a-f0-9]{64}$/;

export interface HostCompletionIssue {caseId: string; target?: string; message: string}
export interface HostCompletionReport {
  complete: boolean;
  cases: number;
  commonCases: number;
  hostCycles: number;
  renderedTargets: number;
  fullRendererTargets: number;
  issues: HostCompletionIssue[];
}

function issue(report: HostCompletionReport, caseId: string, message: string, target?: string): void {
  report.issues.push({caseId, ...(target ? {target} : {}), message});
}
function safeAssetPath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('\\') &&
    !value.split('/').some(part => part === '..' || part === '.' || part.length === 0);
}
function hasTrueChecks(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const checks = value as Record<string, unknown>;
  return requiredChecks.every(name => checks[name] === true);
}
function modelVersion(document: any): string | undefined {return document?.vocabularies?.['umf.visual']?.version;}
function canonical(value: unknown): string {return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);}

async function verifyFullRendererRow(siteRoot:string,item:any,row:any,expectedSourceSha:string,report:HostCompletionReport):Promise<void>{
  const renderer=row?.rendererId,format=renderer as InterchangeFormat,context=String(renderer??'full-renderer');
  const fail=(message:string)=>issue(report,item.id,message,context);
  if(!['dot','mermaid','lini'].includes(format)){fail('Full-profile target has an unsupported renderer ID.');return;}
  if(row.profileId!==`umf.visual.${renderer}.full/1`||row.modelVersion!==modelVersion(item.commonDocument)||row.mappingVersion!=='0.1.0')fail('Full-profile target has stale profile/model/mapping identity.');
  if(row.sourceDocument?.path!==`fixtures/integrations/complex-miro/${item.commonPath}`||row.sourceDocument?.sha256!==expectedSourceSha)fail('Full-profile target is not bound to exact current common-document bytes.');
  if(row.projection?.state!=='emitted'||row.projection?.status!=='supported'||!Array.isArray(row.projection?.diagnostics)||row.projection.diagnostics.length||!Array.isArray(row.projection?.losses)||row.projection.losses.length)fail('Full-profile target is not a strict zero-diagnostic, zero-loss emission.');
  if(!row.representation||!['native-profile','primitive-fallback'].includes(row.representation.tier)||typeof row.representation.sourceProfile!=='string')fail('Full-profile target lacks its actual native/primitive representation route.');
  if(!Number.isSafeInteger(row.identityMap?.count)||row.identityMap.count<1||!hashPattern.test(String(row.identityMap.sha256??'')))fail('Full-profile target lacks a hashed identity map.');
  if(row.native?.diagnostics?.length!==0||row.wholeDocumentReadback?.diagnostics?.length!==0)fail('Full-profile target records native or import diagnostics.');
  const sourceArtifact=row.sourceArtifact,focusedArtifact=row.focusedSourceArtifact;
  const sourceExists=await verifyFileArtifact(siteRoot,sourceArtifact?.path,sourceArtifact?.sha256,'Complete full-profile source',report,item.id,context);
  const focusedExists=await verifyFileArtifact(siteRoot,focusedArtifact?.path,focusedArtifact?.sha256,'Focused full-profile display source',report,item.id,context);
  if(sourceExists&&focusedExists){
    const [sourceBytes,focusedBytes]=await Promise.all([readFile(join(siteRoot,sourceArtifact.path)),readFile(join(siteRoot,focusedArtifact.path))]);
    if(sourceArtifact.bytes!==sourceBytes.byteLength||focusedArtifact.bytes!==focusedBytes.byteLength)fail('Full-profile source artifact byte counts are stale.');
    const document=item.commonDocument,visual=document?.extensions?.['umf.visual'];
    const strict=exportVisual(document,{format,profile:row.profileId,mode:'strict'});
    const source=sourceBytes.toString('utf8');
    try{
      const expectedFocused=focusedFullProfilePreviewSource(source,format,row.representation);
      if(focusedBytes.toString('utf8')!==expectedFocused)fail('Focused full-profile display source is not the deterministic projection of the exact complete source.');
    }catch(error){fail(`Focused full-profile display source cannot be derived from the exact complete source: ${error instanceof Error?error.message:String(error)}`);}
    const imported=importVisual(source,{format,profile:row.profileId,id:visual?.id,question:visual?.question,mode:'strict'});
    const documentDigest=sha256(canonical(document)),identityDigest=sha256(canonical(strict.identityMap));
    if(!strict.ok||strict.diagnostics.length||strict.text!==source||!Array.isArray(strict.identityMap)||sha256(canonical(strict.identityMap))!==row.identityMap?.sha256||strict.identityMap.length!==row.identityMap?.count)fail('Published full-profile source or identity map differs from current strict export.');
    if(!imported.ok||imported.diagnostics.length||canonical(imported.document)!==canonical(document)||canonical(imported.representation)!==canonical(row.representation)||canonical(imported.approximations??[])!==canonical(row.approximations??[]))fail('Published full-profile source no longer passes exact strict whole-document readback.');
    if(row.wholeDocumentReadback?.state!=='passed'||row.wholeDocumentReadback?.mode!=='strict'||row.wholeDocumentReadback?.changes!==0||row.wholeDocumentReadback?.sourceSha256!==sourceArtifact.sha256||row.wholeDocumentReadback?.documentSha256!==documentDigest)fail('Full-profile whole-document readback receipt is not source/document bound.');
    const stable=row.stableBuild;
    if(stable?.state!=='verified'||stable?.deterministicSourceAndMapping!==true||stable.sourceSha256!==sourceArtifact.sha256||stable.focusedSourceSha256!==focusedArtifact.sha256||stable.documentSha256!==documentDigest||stable.identityMapSha256!==identityDigest)fail('Full-profile stable-build hashes do not match current source/document/mapping.');
    if(row.preview?.inputArtifactSha256!==focusedArtifact.sha256||row.completePreview?.inputArtifactSha256!==sourceArtifact.sha256||row.preview?.sourceSha256!==expectedSourceSha||row.completePreview?.sourceSha256!==expectedSourceSha)fail('Full-profile preview inputs are not bound to focused and complete source artifacts.');
    if(row.preview?.profileId!==row.profileId||row.completePreview?.profileId!==row.profileId||row.preview?.modelVersion!==row.modelVersion||row.completePreview?.modelVersion!==row.modelVersion||row.preview?.mappingVersion!==row.mappingVersion||row.completePreview?.mappingVersion!==row.mappingVersion)fail('Full-profile preview identity differs from canonical target identity.');
  }
  const native=row.native;
  if(!native||native.engine!==(renderer==='dot'?'graphviz':renderer)||typeof native.nativeVersion!=='string'||native.nativeVersion.length===0)fail('Full-profile native engine/version evidence is missing.');
  for(const [stage,preview] of [['complete',row.completePreview],['focused',row.preview]] as const){
    if(preview?.state!=='rendered')fail(`Full-profile ${stage} preview is not rendered.`);
    if(preview?.engine!==(renderer==='dot'?'graphviz':renderer)||preview?.nativeVersion!==native?.nativeVersion)fail(`Full-profile ${stage} preview engine/version differs from its native witness.`);
    else await verifyNativeRendererPreview(siteRoot,item,renderer,preview,report);
  }
  for(const [stage,render] of [['complete',native?.complete],['focused',native?.focused]] as const){
    const artifact=render?.svgArtifact;
    if(!artifact||artifact.mediaType!=='image/svg+xml'||!Number.isFinite(artifact.width)||!Number.isFinite(artifact.height)||artifact.width<=0||artifact.height<=0)fail(`Full-profile ${stage} SVG witness artifact is malformed.`);
    else{
      await verifyFileArtifact(siteRoot,artifact.path,artifact.sha256,`Full-profile ${stage} witness SVG`,report,item.id,context);
      if(render.sourceSha256!==(stage==='complete'?sourceArtifact?.sha256:focusedArtifact?.sha256))fail(`Full-profile ${stage} SVG witness is bound to the wrong input source.`);
    }
    const witness=render?.witness;
    if(!witness||!Number.isSafeInteger(witness.primaryCarriers)||witness.primaryCarriers<1||!Number.isSafeInteger(witness.connections)||witness.connections<0)fail(`Full-profile ${stage} native SVG witness is incomplete.`);
    const preview=stage==='complete'?row.completePreview:row.preview;
    if(artifact?.sha256!==preview?.rawAsset?.sha256||artifact?.path!==preview?.rawAsset?.path)fail(`Full-profile ${stage} witness SVG differs from the preview's raw native SVG.`);
  }
  report.fullRendererTargets++;
}

async function verifyFileArtifact(siteRoot: string, path: unknown, expectedHash: unknown, context: string, report: HostCompletionReport, caseId: string, target?: string): Promise<boolean> {
  if (!safeAssetPath(path) || typeof expectedHash !== 'string' || !hashPattern.test(expectedHash)) {
    issue(report, caseId, `${context} is missing a safe relative path or SHA-256.`, target); return false;
  }
  try {
    const bytes = await readFile(join(siteRoot, path));
    if (sha256(bytes) !== expectedHash) {issue(report, caseId, `${context} SHA-256 does not match the published bytes.`, target); return false;}
    return true;
  } catch {
    issue(report, caseId, `${context} file is missing from the published site.`, target); return false;
  }
}

async function verifyNativeRendererPreview(siteRoot: string, item: any, renderer: string, preview: any, report: HostCompletionReport): Promise<void> {
  if (!(['dot', 'mermaid', 'lini'] as string[]).includes(renderer)) return;
  let engine: 'graphviz' | 'mermaid' | 'lini';
  engine = renderer === 'dot' ? 'graphviz' : renderer as 'mermaid' | 'lini';
  const expectedPresentation = previewPresentationReceipt(engine);
  if (JSON.stringify(preview.presentation) !== JSON.stringify(expectedPresentation)) {
    issue(report, item.id, 'Native preview has missing or unqualified presentation options/normalization.', renderer);
  }
  const raw = preview.rawAsset, display = preview.asset;
  if (!raw || raw.mediaType !== 'image/svg+xml' || !Number.isFinite(raw.width) || !Number.isFinite(raw.height) || raw.width <= 0 || raw.height <= 0) {
    issue(report, item.id, 'Native preview lacks valid raw SVG artifact metadata.', renderer); return;
  }
  if (!display || display.mediaType !== 'image/svg+xml' || !Number.isFinite(display.width) || !Number.isFinite(display.height) || display.width <= 0 || display.height <= 0) {
    issue(report, item.id, 'Native preview lacks valid normalized SVG display metadata.', renderer); return;
  }
  if (!(await verifyFileArtifact(siteRoot, raw.path, raw.sha256, 'Raw native SVG', report, item.id, renderer))) return;
  if (!(await verifyFileArtifact(siteRoot, display.path, display.sha256, 'Display SVG', report, item.id, renderer))) return;
  try {
    const rawBytes = await readFile(join(siteRoot, raw.path));
    const displayBytes = await readFile(join(siteRoot, display.path));
    const normalized = normalizeSvgIntrinsicDimensions(rawBytes.toString('utf8'));
    if (normalized.svg !== displayBytes.toString('utf8') || normalized.width !== display.width || normalized.height !== display.height) {
      issue(report, item.id, 'Display SVG is not the exact root-dimension normalization of the raw native SVG.', renderer);
    }
    if (normalized.width !== raw.width || normalized.height !== raw.height) {
      issue(report, item.id, 'Raw native SVG dimensions do not match its viewBox.', renderer);
    }
  } catch {
    issue(report, item.id, 'Raw native SVG cannot be safely normalized from its viewBox.', renderer);
  }
}

async function verifyRenderedRow(siteRoot: string, item: any, row: any, expectedSourceSha: string, report: HostCompletionReport, requireCycle: boolean): Promise<void> {
  const renderer = row?.rendererId;
  if (typeof renderer !== 'string') {issue(report, item.id, 'Renderer row has no rendererId.'); return;}
  if (!row.preview || row.preview.state !== 'rendered') {issue(report, item.id, 'Preview is not actually rendered.', renderer); return;}
  const preview = row.preview;
  if (preview.sourceSha256 !== expectedSourceSha || row.sourceSha256 && row.sourceSha256 !== expectedSourceSha) {
    issue(report, item.id, 'Preview does not match the exact current common-source bytes.', renderer); return;
  }
  if (!row.profileId || preview.profileId !== row.profileId || !row.modelVersion || preview.modelVersion !== row.modelVersion ||
      !row.mappingVersion || preview.mappingVersion !== row.mappingVersion || row.modelVersion !== modelVersion(item.commonDocument)) {
    issue(report, item.id, 'Preview profile/model/mapping identity does not match the exact current target row.', renderer); return;
  }
  if (!preview.engine || !preview.nativeVersion || !preview.stage) issue(report, item.id, 'Preview lacks native engine, version, or stage evidence.', renderer);
  if (!hashPattern.test(String(row.preview.sourceSha256 ?? ''))) issue(report, item.id, 'Preview source SHA-256 is malformed.', renderer);
  if (requireCycle && renderer === 'powerpoint') {
    if (!hashPattern.test(String(preview.inputArtifactSha256 ?? '')) || !(row.artifacts ?? []).some((artifact: any) => artifact?.sha256 === preview.inputArtifactSha256)) {
      issue(report, item.id, 'PowerPoint preview input artifact is not bound to a verified target artifact.', renderer);
    }
    if (preview.stage === 'native-only-preview-layout' &&
        (!/powerpoint/i.test(String(preview.nativeOpen?.application ?? '')) || typeof preview.nativeOpen?.version !== 'string' ||
          preview.nativeOpen.reopenObserved !== true || preview.nativeOpen.noRepairPrompt !== true)) {
      issue(report, item.id, 'PowerPoint preview layout lacks repair-free native reopen evidence.', renderer);
    }
  }
  if (requireCycle && (renderer === 'google-slides' || renderer === 'miro')) {
    if (typeof preview.revision !== 'string' || preview.revision.length === 0 || !hashPattern.test(String(preview.captureDigestSha256 ?? ''))) {
      issue(report, item.id, 'Host preview lacks a stable native revision and capture digest.', renderer);
    }
  }
  const asset = preview.asset;
  const validAssetDimensions = asset?.mediaType === 'image/svg+xml'
    ? Number.isFinite(asset.width) && Number.isFinite(asset.height) && asset.width > 0 && asset.height > 0
    : ['image/png', 'image/jpeg'].includes(asset?.mediaType) && Number.isInteger(asset.width) && Number.isInteger(asset.height) && asset.width > 0 && asset.height > 0;
  if (!asset || !validAssetDimensions) {
    issue(report, item.id, 'Rendered preview lacks valid image metadata and dimensions.', renderer);
  } else await verifyFileArtifact(siteRoot, asset.path, asset.sha256, 'Preview asset', report, item.id, renderer);
  await verifyNativeRendererPreview(siteRoot, item, renderer, preview, report);
  if (!Array.isArray(row.projection?.losses) || !Array.isArray(row.projection?.diagnostics)) {
    issue(report, item.id, 'Target projection is missing its explicit diagnostics or loss inventory.', renderer);
  } else if (row.projection.state === 'emitted' && row.projection.diagnostics.some((diagnostic: any) => diagnostic?.severity === 'error')) {
    issue(report, item.id, 'Target claims emitted output despite an error-severity projection diagnostic.', renderer);
  } else if (row.projection.status === 'supported' && row.projection.losses.length > 0) {
    issue(report, item.id, 'Target claims supported despite a non-empty semantic loss inventory.', renderer);
  } else if (row.projection.status === 'reported-loss' && row.projection.losses.length === 0) {
    issue(report, item.id, 'Target claims reported-loss without exposing any losses.', renderer);
  } else if (row.projection.state !== 'emitted' || !['supported', 'reported-loss'].includes(row.projection.status)) {
    issue(report, item.id, 'A refused or planned projection cannot count as a rendered target.', renderer);
  }
  if (row.artifacts !== undefined && !Array.isArray(row.artifacts)) issue(report, item.id, 'Target artifacts must be an array.', renderer);
  for (const artifact of row.artifacts ?? []) {
    await verifyFileArtifact(siteRoot, artifact?.path, artifact?.sha256, 'Target artifact', report, item.id, renderer);
  }
  report.renderedTargets++;
  if (!requireCycle) return;

  const cycle = row.roundTrip;
  if (!cycle || cycle.state !== 'passed') {issue(report, item.id, 'Edited native round trip is missing or not passed.', renderer); return;}
  if (cycle.sourceSha256 !== expectedSourceSha || cycle.profileId !== row.profileId || cycle.modelVersion !== row.modelVersion || cycle.mappingVersion !== row.mappingVersion) {
    issue(report, item.id, 'Round-trip receipt is stale or bound to a different source/profile/model/mapping.', renderer); return;
  }
  if (!hasTrueChecks(cycle.checks)) issue(report, item.id, `Round-trip evidence must pass every check: ${requiredChecks.join(', ')}.`, renderer);
  if (!cycle.receipt || !(await verifyFileArtifact(siteRoot, cycle.receipt.path, cycle.receipt.sha256, 'Round-trip receipt', report, item.id, renderer))) return;
  const hostEvidence = cycle.attestation;
  if (!hostEvidence || typeof hostEvidence !== 'object') {issue(report, item.id, 'Host-specific evidence receipt is missing.', renderer); return;}
  if (renderer === 'powerpoint') {
    if (hostEvidence.kind !== 'powerpoint-ui' || hostEvidence.nativeHostReadback !== true || !/powerpoint/i.test(String(hostEvidence.application ?? '')) ||
        typeof hostEvidence.version !== 'string' || hostEvidence.version.length === 0 || hostEvidence.reopenObserved !== true || hostEvidence.noRepairPrompt !== true ||
        hostEvidence.updatedQuestionVisible !== true || hostEvidence.nativeBoldLabelVisible !== true || hostEvidence.attachedEndpointsObserved !== true) {
      issue(report, item.id, 'PowerPoint cycle lacks actual PowerPoint UI save/reopen/readback attestation.', renderer);
    }
  } else if (renderer === 'google-slides') {
    if (hostEvidence.kind !== 'google-slides-api' || hostEvidence.nativeWritesObserved !== true ||
        (hostEvidence.injectedTransportVerified !== true && hostEvidence.liveTransportVerified !== true) || hostEvidence.editMethod !== 'native Slides API') {
      issue(report, item.id, 'Google Slides cycle lacks source-bound native API transport evidence.', renderer);
    }
    if (hostEvidence.uiClaim !== false || /ui|browser click/i.test(String(hostEvidence.authority ?? ''))) issue(report, item.id, 'Google Slides UI activity cannot substitute for API receipt evidence.', renderer);
  } else if (renderer === 'miro') {
    if (hostEvidence.kind !== 'miro-web-sdk' || hostEvidence.nativeWritesObserved !== true || hostEvidence.captureFenceVerified !== true ||
        hostEvidence.revisionKind !== 'content-digest' || hostEvidence.serverCas !== false || hostEvidence.atomicRevision !== false) {
      issue(report, item.id, 'Miro cycle lacks exact-source Web SDK write and capture-fence evidence.', renderer);
    }
    if (Array.isArray(hostEvidence.readonlyRecoveryStages) && hostEvidence.readonlyRecoveryStages.length > 0) {
      const interrupted = hostEvidence.interruptedWritesRetained;
      if (hostEvidence.unownedContentRetainedExceptRecordedMetadataDrift !== true || !Array.isArray(interrupted) ||
          interrupted.length !== hostEvidence.readonlyRecoveryStages.length || interrupted.some((entry: any, index: number) =>
            entry?.stage !== hostEvidence.readonlyRecoveryStages[index] || entry?.recoveryWritesPerformed !== false || entry?.atomicityClaimed !== false ||
            !hashPattern.test(String(entry?.receiptSha256 ?? '')) || !Array.isArray(entry?.causeCodes) ||
            !Number.isSafeInteger(entry?.qualifiedMetadataDriftCount) || !Number.isSafeInteger(entry?.newlyObservedUnownedCount))) {
        issue(report, item.id, 'Miro readonly recovery does not preserve its interrupted operation and qualified drift receipt.', renderer);
      }
    }
  }
  report.hostCycles++;
}

/** Validate current public integration data and every content-addressed asset it claims. */
export async function verifyHostCompletion(catalog?: any, siteRoot = join(root, 'dist-site'), requireFullTargets = catalog === undefined): Promise<HostCompletionReport> {
  const value = catalog ?? JSON.parse(await readFile(join(siteRoot, 'integrations.json'), 'utf8'));
  const manifestBytes = await readFile(join(root, 'fixtures/integrations/complex-miro/manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const report: HostCompletionReport = {complete: false, cases: Array.isArray(value?.cases) ? value.cases.length : 0,
    commonCases: 0, hostCycles: 0, renderedTargets: 0, fullRendererTargets: 0, issues: []};
  if (value?.schemaVersion !== 1 || value?.catalogProfile !== 'umf.visual.integration-examples/1') {
    issue(report, 'catalog', 'Integration catalog envelope is not schemaVersion 1 / umf.visual.integration-examples/1.');
  }
  if (value?.corpus?.manifestSha256 !== sha256(manifestBytes)) issue(report, 'catalog', 'Integration catalog is bound to a stale corpus manifest.');
  const cases = Array.isArray(value?.cases) ? value.cases : [];
  if (manifest.cases?.length !== 6 || cases.length !== 6) issue(report, 'catalog', 'The exact six-case authored integration corpus is required.');
  const byId = new Map(cases.map((item: any) => [item?.id, item]));
  if (byId.size !== cases.length) issue(report, 'catalog', 'Integration case IDs are missing or duplicated.');

  for (const manifestCase of manifest.cases ?? []) {
    const item = byId.get(manifestCase.id) as any;
    if (!item) {issue(report, manifestCase.id, 'Required authored corpus case is absent.'); continue;}
    if (manifestCase.commonVisualPath === null) {
      if (item.commonProjection !== 'no-common-projection' || item.commonPath !== null || item.commonSha256 !== null || item.commonDocument != null) {
        issue(report, item.id, 'Opaque witness must remain explicitly no-common-projection with no inferred UMF document.');
      }
      for (const target of Object.values(item.targets ?? {}) as any[]) {
        if (target?.status !== 'refused' || target?.nativeHostVerified !== false) issue(report, item.id, 'Opaque witness cannot claim a common target export.');
      }
      if ((item.rendererTargets ?? []).some((row: any) => row?.preview?.state === 'rendered' || row?.roundTrip?.state === 'passed')) {
        issue(report, item.id, 'Opaque witness cannot claim a rendered common projection or edited cycle.');
      }
      if ((item.fullRendererTargets ?? []).length) issue(report,item.id,'Opaque witness cannot claim full-profile targets without a common UMF document.');
      continue;
    }
    report.commonCases++;
    const expectedPath = `fixtures/integrations/complex-miro/${manifestCase.commonVisualPath}`;
    const sourceBytes = await readFile(join(root, expectedPath));
    const expectedSourceSha = sha256(sourceBytes);
    if (item.commonPath !== manifestCase.commonVisualPath || item.commonSha256 !== expectedSourceSha ||
        JSON.stringify(item.commonDocument) !== JSON.stringify(JSON.parse(sourceBytes.toString('utf8')))) {
      issue(report, item.id, 'Common document/path/hash differs from the exact authored fixture bytes.'); continue;
    }
    const rows: any[] = Array.isArray(item.rendererTargets) ? item.rendererTargets : [];
    for (const renderer of requiredHosts) {
      const matched = rows.filter(row => row?.rendererId === renderer);
      if (matched.length !== 1) {issue(report, item.id, `Expected exactly one ${renderer} host target row; found ${matched.length}.`, renderer); continue;}
      const row = matched[0]!;
      const targetKey = renderer === 'google-slides' ? 'googleSlides' : renderer;
      const expectedTarget = item.targets?.[targetKey];
      if (!expectedTarget || row.profileId !== expectedTarget.profile) issue(report, item.id, 'Renderer profile differs from the declared host target profile.', renderer);
      await verifyRenderedRow(siteRoot, item, row, expectedSourceSha, report, true);
    }
    if (item.id === 'process-documents-store') {
      for (const renderer of requiredRenders) {
        const matches = rows.filter(row => row?.rendererId === renderer);
        if (matches.length !== 1) {issue(report, item.id, `Six-renderer coverage requires one ${renderer} row; found ${matches.length}.`, renderer); continue;}
        // The three portable diagram renders do not require an edited host cycle.
        if (requiredHosts.includes(renderer as typeof requiredHosts[number])) continue;
        await verifyRenderedRow(siteRoot, item, matches[0], expectedSourceSha, report, false);
      }
    }
    if(requireFullTargets){
      const fullRows:any[]=Array.isArray(item.fullRendererTargets)?item.fullRendererTargets:[];
      if(fullRows.length!==3)issue(report,item.id,`Canonical full-profile completion requires exactly three fullRendererTargets; found ${fullRows.length}.`);
      for(const renderer of ['dot','mermaid','lini'] as const){
        const matches=fullRows.filter(row=>row?.rendererId===renderer);
        if(matches.length!==1){issue(report,item.id,`Expected exactly one canonical full-profile ${renderer} target; found ${matches.length}.`,renderer);continue;}
        await verifyFullRendererRow(siteRoot,item,matches[0],expectedSourceSha,report);
      }
    }
  }
  report.complete = report.issues.length === 0 && report.commonCases === 5 && report.hostCycles === 15 && (!requireFullTargets||report.fullRendererTargets===15);
  return report;
}

if (import.meta.main) {
  const report = await verifyHostCompletion();
  const output = JSON.stringify(report, null, 2) + '\n';
  await mkdir(join(root, '.cache'), {recursive: true});
  await writeFile(join(root, '.cache/host-completion.json'), output);
  console.log(output.trimEnd());
  if (!report.complete) process.exitCode = 1;
}
