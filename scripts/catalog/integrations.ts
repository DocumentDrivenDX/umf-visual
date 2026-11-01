// SPDX-License-Identifier: MIT OR Apache-2.0
// Additive integration evidence for the authored, sanitized complex Miro corpus.
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve, relative, sep} from 'node:path';
import type {Document} from '@umf/core';
import {exportPowerPoint, importPowerPoint} from '../../src/adapters/powerpoint/index.js';
import {observeGoogleSlides, planGoogleSlidesExport} from '../../src/adapters/google-slides/index.js';
import type {GoogleSlidesBox, GoogleSlidesPlacement} from '../../src/adapters/google-slides/types.js';
import {planEditableMiroExport} from '../../src/adapters/miro/editable/index.js';
import type {EditablePlan} from '../../src/adapters/miro/editable/types.js';
import type {FullRendererTargetEvidence, RendererTargetEvidence} from './renderer-types.js';
import {buildRendererEvidence} from './renderer-evidence.js';

const root = resolve(import.meta.dir, '../..');
const corpusRoot = join(root, 'fixtures/integrations/complex-miro');
const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const posix = (value: string) => value.split(sep).join('/');

export type IntegrationEvidenceKind = 'qualified-pptx-xml-readback' | 'synthetic-observation-plan' | 'adapter-plan' | 'native-witness-only';
export type IntegrationTarget = {
  status: 'format-readback' | 'planned' | 'refused';
  profile: string;
  evidenceKind: IntegrationEvidenceKind;
  nativeHostVerified: false;
  evidence: Record<string, unknown>;
  diagnostics: unknown[];
  losses: unknown[];
  artifact?: {path: string; sha256: string; mediaType: string; bytes: number};
};
export type IntegrationCase = {
  rendererTargets?: RendererTargetEvidence[];
  /** Canonical opt-in full/1 source and native render rows, separate from compatibility previews. */
  fullRendererTargets?: FullRendererTargetEvidence[];
  id: string;
  title: string;
  commonProjection: 'complete-topology-projection' | 'partial-explicit-projection' | 'no-common-projection';
  commonPath: string | null;
  commonSha256: string | null;
  commonDocument: Document | null;
  nativeWitnessPath: string;
  nativeWitnessSha256: string;
  nativeWitness: unknown;
  downloads: {commonDocument?: {path: string; sha256: string}; nativeWitness: {path: string; sha256: string}};
  originalProjectionGaps: unknown[];
  coverageComplete: boolean;
  coverageReasons: string[];
  targets: {powerpoint: IntegrationTarget; googleSlides: IntegrationTarget; miro: IntegrationTarget};
};
export type HostConformance = {
  id: string;
  target: 'powerpoint' | 'google-slides' | 'miro';
  matchedCaseId: string | null;
  standalone: boolean;
  profile: string;
  source: {fixtureId: string | null; path: string | null; sha256: string};
  receipt: {path: string; sha256: string; mediaType: 'application/json'; bytes: number};
  scope: Record<string, unknown>;
};
export type IntegrationCatalog = {
  schemaVersion: 1;
  catalogProfile: 'umf.visual.integration-examples/1';
  corpus: {manifestPath: string; manifestSha256: string; witnessSchemaPath: string};
  complete: boolean;
  completionReasons: string[];
  counts: {cases: number; commonProjections: number; opaqueWitnesses: number; formatReadbacks: number; plannedTargets: number; refusedTargets: number};
  cases: IntegrationCase[];
  hostConformance: HostConformance[];
};

function readJson(path: string): Promise<{bytes: Uint8Array; value: any}> {
  return readFile(path).then(bytes => ({bytes, value: JSON.parse(new TextDecoder().decode(bytes))}));
}
function validateManifest(manifest: any): void {
  if (manifest.format !== 'umf.visual.miro.synthetic-corpus/1' || manifest.authorship !== 'synthetic' || !Array.isArray(manifest.cases) || manifest.cases.length !== 6) {
    throw new Error('Expected the six-case synthetic complex Miro corpus manifest.');
  }
  const ids = new Set<string>();
  for (const item of manifest.cases) {
    if (typeof item.id !== 'string' || ids.has(item.id) || !Array.isArray(item.losses)) throw new Error('Corpus case identity or loss inventory is invalid.');
    ids.add(item.id);
    if (item.commonProjection === 'no-common-projection' && item.commonVisualPath !== null) throw new Error('Opaque witness must not invent a common projection.');
    if (item.commonProjection !== 'no-common-projection' && typeof item.commonVisualPath !== 'string') throw new Error('Common projection path is missing.');
  }
}
function refusedTarget(profile: string, message: string): IntegrationTarget {
  return {status: 'refused', profile, evidenceKind: 'native-witness-only', nativeHostVerified: false,
    evidence: {writeCount: 0, reason: 'No common UMF projection was authored; adapter planning was not attempted.'},
    diagnostics: [{code: 'NO_COMMON_PROJECTION', message}], losses: []};
}
function plannedTarget(profile: string, evidenceKind: 'synthetic-observation-plan' | 'adapter-plan', evidence: Record<string, unknown>, diagnostics: unknown[], losses: unknown[]): IntegrationTarget {
  return {status: 'planned', profile, evidenceKind, nativeHostVerified: false, evidence, diagnostics, losses};
}
function box(x: number, y: number, width: number, height: number): GoogleSlidesBox {return {x, y, width, height};}
function slidesPlacement(document: Document): GoogleSlidesPlacement {
  const visual = document.extensions!['umf.visual'] as unknown as {nodes: {id: string}[]; edges?: {id: string; from: string; to: string; label?: string}[]; title?: string};
  const positions = new Map<string, GoogleSlidesBox>(), columns = Math.min(4, visual.nodes.length), cellWidth = 162, cellHeight = 54;
  visual.nodes.forEach((node, index) => positions.set(node.id, box(28 + (index % columns) * cellWidth, 112 + Math.floor(index / columns) * cellHeight, 142, 38)));
  const edgeLabels: Record<string, GoogleSlidesBox> = {};
  for (const [index, edge] of (visual.edges ?? []).filter(item => item.label !== undefined).entries()) {
    const from = positions.get(edge.from)!, to = positions.get(edge.to)!;
    edgeLabels[edge.id] = box(Math.max(2, Math.min(628, (from.x + to.x) / 2 + (index % 3) * 8)), Math.max(80, Math.min(365, (from.y + to.y) / 2 + 38)), 88, 24);
  }
  return {question: box(28, 58, 650, 36), ...(visual.title !== undefined ? {title: box(28, 18, 650, 32)} : {}),
    nodes: Object.fromEntries(positions), ...(Object.keys(edgeLabels).length ? {edgeLabels} : {})};
}
function sourceSubset(document: Document): Record<string, unknown> {
  const visual = document.extensions!['umf.visual'] as unknown as {kind: string; form: string; nodes?: unknown[]; edges?: unknown[]; groups?: unknown[]};
  return {kind: visual.kind, form: visual.form, nodeCount: visual.nodes?.length ?? 0, edgeCount: visual.edges?.length ?? 0, groupCount: visual.groups?.length ?? 0};
}
function powerpointDiagnostics(error: unknown): unknown[] {return [{code: 'PPTX_ROUNDTRIP', message: error instanceof Error ? error.message : String(error)}];}
async function powerpointEvidence(document: Document, outputDir: string, id: string): Promise<IntegrationTarget> {
  try {
    const exported = await exportPowerPoint(document, {mode: 'report'});
    const imported = await importPowerPoint(exported.bytes, {mode: 'report', binding: exported.binding, expectedBindingRevision: exported.bindingRevision});
    if (imported.changes.length !== 0 || JSON.stringify(imported.document) !== JSON.stringify(document)) throw new Error('Native XML readback did not reconstruct the original common UMF document unchanged.');
    const path = 'integrations/downloads/' + id + '-' + sha256(exported.bytes).slice(0, 16) + '.pptx';
    const file = join(outputDir, path);
    await mkdir(join(outputDir, 'integrations/downloads'), {recursive: true});
    await writeFile(file, exported.bytes);
    return {status: 'format-readback', profile: exported.profile, evidenceKind: 'qualified-pptx-xml-readback', nativeHostVerified: false,
      evidence: {format: 'PPTX', readback: 'importPowerPoint(exportPowerPoint(document))', changes: imported.changes.length, sourceSha256: exported.sourceSha256,
        qualification: 'Qualified UMF PPTX profile generation and XML/native-shape projection readback. This is not a Microsoft PowerPoint application, open, or render result.',
        sourcePreservation: 'The UMF source companion preserves fields; it does not count as PowerPoint-native semantic coverage.',
        artifactSha256: sha256(exported.bytes), modelVersion: exported.modelVersion, mappingCount: exported.mappings.length, subset: sourceSubset(document)},
      diagnostics: [], losses: exported.losses, artifact: {path, sha256: sha256(exported.bytes), mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', bytes: exported.bytes.byteLength}};
  } catch (error) {
    return {status: 'refused', profile: 'umf.visual.powerpoint.network/1', evidenceKind: 'qualified-pptx-xml-readback', nativeHostVerified: false,
      evidence: {writeCount: 0, readback: 'failed'}, diagnostics: powerpointDiagnostics(error), losses: []};
  }
}
async function googleSlidesPlan(document: Document): Promise<IntegrationTarget> {
  try {
    const snapshot = {presentationId: 'synthetic-unwritten-presentation', revisionId: 'synthetic-planning-token-not-host-revision',
      pageSize: {width: {magnitude: 720, unit: 'PT'}, height: {magnitude: 405, unit: 'PT'}}, slides: [{objectId: 'synthetic-blank-slide', pageElements: []}]};
    const before = await observeGoogleSlides(snapshot);
    const plan = await planGoogleSlidesExport(document, before, slidesPlacement(document), {mode: 'report', namespace: 'umfint'});
    return plannedTarget(plan.profile, 'synthetic-observation-plan', {planType: 'GoogleSlidesExportPlan', syntheticPresentationId: before.presentationId,
      syntheticRevisionId: before.revisionId, requestCount: plan.batch.requests.length, writeControl: plan.batch.writeControl, modelVersion: plan.modelVersion,
      mappingCount: plan.mappings.length, subset: sourceSubset(document), placement: plan.placement, requests: plan.batch.requests}, [], plan.losses);
  } catch (error) {
    return {status: 'refused', profile: 'umf.visual.google-slides.network/1', evidenceKind: 'synthetic-observation-plan', nativeHostVerified: false,
      evidence: {writeCount: 0, observation: 'explicit synthetic blank presentation; no Slides API call'}, diagnostics: powerpointDiagnostics(error), losses: []};
  }
}
async function miroPlan(document: Document): Promise<{target: IntegrationTarget; plan?: EditablePlan}> {
  try {
    const plan = await planEditableMiroExport(document, 'report');
    return {target: plannedTarget(plan.profile, 'adapter-plan', {planType: 'EditablePlan', modelVersion: plan.modelVersion,
      sourceDigestSha256: plan.sourceDigestSha256, nodeCount: plan.nodes.length, edgeCount: plan.edges.length, groupCount: plan.groups.length,
      subset: sourceSubset(document), writeCount: 0, geometry: 'adapter layout proposal only; no Miro host write', plan}, [], plan.losses), plan};
  } catch (error) {
    return {target: {status: 'refused', profile: 'umf.visual.miro.editable-network/1', evidenceKind: 'adapter-plan', nativeHostVerified: false,
      evidence: {writeCount: 0, planning: 'failed before host access'}, diagnostics: powerpointDiagnostics(error), losses: []}};
  }
}
async function loadCase(manifestCase: any, outputDir: string): Promise<IntegrationCase> {
  const witnessPath = join(corpusRoot, manifestCase.nativeWitnessPath), witness = await readJson(witnessPath);
  if (witness.value.caseId !== manifestCase.id) throw new Error('Native witness caseId differs from manifest: ' + manifestCase.id);
  const commonPath = manifestCase.commonVisualPath ? join(corpusRoot, manifestCase.commonVisualPath) : null;
  const common = commonPath ? await readJson(commonPath) : null;
  const downloadsDir = join(outputDir, 'integrations/downloads');
  await mkdir(downloadsDir, {recursive: true});
  const witnessDownload = 'integrations/downloads/' + manifestCase.id + '-native-witness.json';
  await writeFile(join(outputDir, witnessDownload), witness.bytes);
  const commonDownload = common ? 'integrations/downloads/' + manifestCase.id + '-common-umf.json' : undefined;
  if (common && commonDownload) await writeFile(join(outputDir, commonDownload), common.bytes);
  const base = {id: manifestCase.id, title: manifestCase.title, commonProjection: manifestCase.commonProjection, commonPath: manifestCase.commonVisualPath,
    commonSha256: common ? sha256(common.bytes) : null, commonDocument: common?.value as Document | null, nativeWitnessPath: posix(relative(root, witnessPath)),
    nativeWitnessSha256: sha256(witness.bytes), nativeWitness: witness.value,
    downloads: {nativeWitness: {path: witnessDownload, sha256: sha256(witness.bytes)}, ...(common && commonDownload ? {commonDocument: {path: commonDownload, sha256: sha256(common.bytes)}} : {})},
    originalProjectionGaps: manifestCase.losses};
  if (!common) {
    const message = 'The opaque native witness has no authored common UMF document, so no target graph is generated.';
    const targets = {powerpoint: refusedTarget('umf.visual.powerpoint.network/1', message),
      googleSlides: refusedTarget('umf.visual.google-slides.network/1', message), miro: refusedTarget('umf.visual.miro.editable-network/1', message)};
    return {...base, ...coverageState(base.commonDocument, base.originalProjectionGaps, targets), targets};
  }
  const [powerpoint, googleSlides, miro] = await Promise.all([powerpointEvidence(common.value, outputDir, manifestCase.id), googleSlidesPlan(common.value), miroPlan(common.value)]);
  const targets = {powerpoint, googleSlides, miro: miro.target};
  return {...base, ...coverageState(base.commonDocument, base.originalProjectionGaps, targets), targets};
}
function coverageState(common: Document | null, projectionGaps: unknown[], targets: Record<string, IntegrationTarget>): {coverageComplete: boolean; coverageReasons: string[]} {
  const targetLosses = Object.values(targets).flatMap(target => target.losses);
  const reasons = [!common ? 'No common semantic projection is authored for this opaque witness.' : '',
    projectionGaps.length ? 'The source-to-common projection has documented semantic or presentation gaps.' : '',
    targetLosses.length ? 'One or more target adapters report retained-only or unrepresented source fields.' : '',
    Object.values(targets).some(target => !target.nativeHostVerified) ? 'At least one target lacks a live native-host write and readback.' : ''];
  const coverageReasons = reasons.filter(Boolean);
  return {coverageComplete: coverageReasons.length === 0, coverageReasons};
}

async function hostConformance(outputDir:string,cases:IntegrationCase[]):Promise<HostConformance[]> {
  const proofRoot=join(root,'docs/helix/04-build/evidence');
  const slidesPath=join(proofRoot,'google-slides-live-2026-10-30.json');
  const powerpointPath=join(proofRoot,'powerpoint-native-conformance.json');
  const miroPath=join(proofRoot,'miro-editable-live-2026-10-30.json');
  const [slidesBytes,powerpointBytes,miroBytes]=await Promise.all([readFile(slidesPath),readFile(powerpointPath),readFile(miroPath)]);
  const slides=JSON.parse(new TextDecoder().decode(slidesBytes)),powerpoint=JSON.parse(new TextDecoder().decode(powerpointBytes)),miro=JSON.parse(new TextDecoder().decode(miroBytes));
  const findCase=(id:string)=>cases.find(item=>item.id===id);
  const slideCase=findCase('process-documents-store'),networkCase=findCase('network-16x24');
  if(!slideCase?.commonSha256||!networkCase?.commonSha256)throw new Error('Expected exact source cases for live host conformance receipts.');
  const slidesProof=slides.source;
  const powerpointProof=powerpoint.cases?.find((item:any)=>item.id==='network-16x24-native-edit');
  const captionProof=powerpoint.cases?.find((item:any)=>item.id==='editable-edge-caption-native-edit');
  if(miro.evidenceType!=='sanitized-live-host-conformance'||miro.profile!=='umf.visual.miro.editable-network/1'||miro.source?.synthetic!==true||miro.source?.fixtureId!==null||miro.source?.path!==null||miro.source.sha256!==miro.sourceSha256?.before){
    throw new Error('Miro host receipt must remain a separate synthetic standalone source.');
  }
  if(slidesProof?.fixtureId!=='process-documents-store'||slidesProof.sha256!==slideCase.commonSha256||slides.profile!=='umf.visual.google-slides.network/1'){
    throw new Error('Google Slides live receipt does not match the exact process-documents-store source hash.');
  }
  if(powerpointProof?.source?.sha256!==networkCase.commonSha256||powerpoint.profile!=='umf.visual.powerpoint.network/1'){
    throw new Error('PowerPoint native receipt does not match the exact network-16x24 source hash.');
  }
  if(!captionProof?.source?.synthetic||captionProof.source.sha256===networkCase.commonSha256)throw new Error('Standalone caption host proof must remain distinct from corpus cases.');
  const downloads='integrations/downloads';
  await mkdir(join(outputDir,downloads),{recursive:true});
  const receiptFiles=[
    {name:'google-slides-live-2026-10-30.json',bytes:slidesBytes},
    {name:'powerpoint-native-conformance.json',bytes:powerpointBytes},
    {name:'miro-editable-live-2026-10-30.json',bytes:miroBytes},
  ];
  for(const file of receiptFiles)await writeFile(join(outputDir,downloads,file.name),file.bytes);
  const receipt=(name:string,bytes:Uint8Array)=>({path:downloads+'/'+name,sha256:sha256(bytes),mediaType:'application/json' as const,bytes:bytes.byteLength});
  const slidesReceipt=receipt(receiptFiles[0]!.name,slidesBytes),pptReceipt=receipt(receiptFiles[1]!.name,powerpointBytes);
  return [
    {id:'slides-process-documents-store-live',target:'google-slides',matchedCaseId:slideCase.id,standalone:false,profile:slides.profile,
      source:{fixtureId:slidesProof.fixtureId,path:slidesProof.path,sha256:slidesProof.sha256},receipt:slidesReceipt,
      scope:{nativeWritesObserved:slides.executionBoundary?.actualGoogleSlidesWritesObserved===true,traceReplayVerified:slides.executionBoundary?.apiWrapperTraceReplayVerified===true,
        exportRequests:slides.capture?.exportBatchRequests,uiEditPaths:slides.nativeUiEdits?.importSemanticPaths,umfUpdateRequests:slides.umfUpdate?.requests,
        finalBindingRevision:slides.umfUpdate?.finalBindingRevision,nativePreservation:slides.nativePreservation,limitations:slides.limits}},
    {id:'powerpoint-network-16x24-native',target:'powerpoint',matchedCaseId:networkCase.id,standalone:false,profile:powerpoint.profile,
      source:{fixtureId:networkCase.id,path:powerpointProof.source.path,sha256:powerpointProof.source.sha256},receipt:pptReceipt,
      scope:{host:powerpoint.host,modelVersion:powerpointProof.source.modelVersion,nodeCount:powerpointProof.source.nodes,edgeCount:powerpointProof.source.edges,
        semanticEditPaths:powerpointProof.adapterReadback.changePaths,nativePresentationEdits:powerpointProof.nativeActions.nativePresentationEdits,
        reopenedAfterPreservingUpdate:powerpointProof.nativeActions.reopenAfterPreservingUpdate,qualification:powerpoint.qualification.verifiedSubset,limitations:powerpoint.qualification.notEstablished}},
    {id:'powerpoint-caption-standalone',target:'powerpoint',matchedCaseId:null,standalone:true,profile:powerpoint.profile,
      source:{fixtureId:null,path:null,sha256:captionProof.source.sha256},receipt:pptReceipt,
      scope:{label:'Standalone editable edge-caption proof; not part of the six-case synthetic corpus.',sourceSynthetic:captionProof.source.synthetic===true,
        nativeEditPath:captionProof.nativeActions.edit.path,nativeReadback:captionProof.adapterReadback.status,preservingUpdate:captionProof.adapterReadback.preservingUpdate,
        reopenedAfterPreservingUpdate:captionProof.adapterReadback.nativeReopenAfterPreservingUpdate}},
    {id:'miro-editable-live-standalone',target:'miro',matchedCaseId:null,standalone:true,profile:miro.profile,
      source:{fixtureId:null,path:null,sha256:miro.source.sha256},receipt:receipt(receiptFiles[2]!.name,miroBytes),
      scope:{host:miro.host,hostVersion:miro.hostVersion,modelVersion:miro.modelVersion,sourceCounts:miro.sourceCounts,edits:miro.edits,
        preservation:miro.preservation,refusalEvidence:miro.refusalEvidence,qualification:miro.qualification}},
  ];
}

/** Generates additive PPTX/XML, Google Slides planner and editable Miro evidence for six synthetic examples. */
export async function buildIntegrationCatalog(outputDirectory: string, options: {rendererEvidence?: boolean} = {}): Promise<IntegrationCatalog> {
  const outputDir = resolve(outputDirectory), manifestPath = join(corpusRoot, 'manifest.json'), schemaPath = join(corpusRoot, 'native-witness.schema.json');
  const [manifest, schemaBytes] = await Promise.all([readJson(manifestPath), readFile(schemaPath)]);
  validateManifest(manifest.value);
  const cases = [] as IntegrationCase[];
  for (const manifestCase of manifest.value.cases) cases.push(await loadCase(manifestCase, outputDir));
  if (options.rendererEvidence !== false) await buildRendererEvidence(cases,outputDir);
  const targets = cases.flatMap(item => Object.values(item.targets));
  const hostProofs=await hostConformance(outputDir,cases);
  const catalog: IntegrationCatalog = {schemaVersion: 1, catalogProfile: 'umf.visual.integration-examples/1',
    corpus: {manifestPath: posix(relative(root, manifestPath)), manifestSha256: sha256(manifest.bytes), witnessSchemaPath: posix(relative(root, schemaPath))},
    complete: cases.every(item => item.coverageComplete), completionReasons: [...new Set(cases.flatMap(item => item.coverageReasons))],
    counts: {cases: cases.length, commonProjections: cases.filter(item => item.commonDocument).length, opaqueWitnesses: cases.filter(item => !item.commonDocument).length,
      formatReadbacks: targets.filter(target => target.status === 'format-readback').length, plannedTargets: targets.filter(target => target.status === 'planned').length,
      refusedTargets: targets.filter(target => target.status === 'refused').length}, cases, hostConformance:hostProofs};
  await mkdir(outputDir, {recursive: true});
  await writeFile(join(outputDir, 'integrations.json'), JSON.stringify(catalog, null, 2) + '\n');
  return catalog;
}

if (import.meta.main) {
  const outputDirectory = process.argv[2] ?? join(root, 'dist-site');
  const result = await buildIntegrationCatalog(outputDirectory);
  console.log(JSON.stringify(result.counts));
}
