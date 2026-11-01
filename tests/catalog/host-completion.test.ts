// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe, expect, test} from 'bun:test';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {verifyHostCompletion} from '../../scripts/catalog/verify-host-completion';
import {normalizeSvgIntrinsicDimensions, previewPresentationReceipt} from '../../scripts/catalog/native-preview-presentation';

const root = resolve(import.meta.dir, '../..');
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

async function readyFixture() {
  const site = await mkdtemp(join(import.meta.dir, '../../.cache/host-completion-'));
  const manifest = JSON.parse(await readFile(join(root, 'fixtures/integrations/complex-miro/manifest.json'), 'utf8'));
  const cases: any[] = [];
  const persist = async (path: string, bytes: Uint8Array | string) => {
    const full = join(site, path); await mkdir(join(full, '..'), {recursive: true}); await writeFile(full, bytes); return {path, sha256: hash(bytes)};
  };
  for (const item of manifest.cases) {
    if (item.commonVisualPath === null) {
      cases.push({id: item.id, commonProjection: 'no-common-projection', commonPath: null, commonSha256: null, commonDocument: null,
        targets: {powerpoint: {status: 'refused', nativeHostVerified: false}, googleSlides: {status: 'refused', nativeHostVerified: false}, miro: {status: 'refused', nativeHostVerified: false}}, rendererTargets: []});
      continue;
    }
    const path = `fixtures/integrations/complex-miro/${item.commonVisualPath}`;
    const sourceBytes = await readFile(join(root, path));
    const document = JSON.parse(sourceBytes.toString('utf8'));
    const caseValue: any = {id: item.id, commonProjection: item.commonProjection, commonPath: item.commonVisualPath,
      commonSha256: hash(sourceBytes), commonDocument: document, targets: {powerpoint: {profile: 'umf.visual.powerpoint.network/1'},
        googleSlides: {profile: 'umf.visual.google-slides.network/1'}, miro: {profile: 'umf.visual.miro.editable-network/1'}}, rendererTargets: []};
    for (const renderer of ['powerpoint', 'google-slides', 'miro']) {
      const profileId = caseValue.targets[renderer === 'google-slides' ? 'googleSlides' : renderer].profile;
      const modelVersion = document.vocabularies['umf.visual'].version;
      const assetContent = `${item.id}-${renderer}-render`;
      const asset = await persist(`integrations/previews/${renderer}/${item.id}.png`, assetContent);
      const pptArtifact = renderer === 'powerpoint' ? await persist(`integrations/artifacts/${item.id}.pptx`, `${item.id}-pptx`) : undefined;
      const receipt = await persist(`integrations/evidence/${renderer}/${item.id}.json`, JSON.stringify({source: hash(sourceBytes), renderer}));
      const kind = renderer === 'powerpoint' ? 'powerpoint-ui' : renderer === 'google-slides' ? 'google-slides-api' : 'miro-web-sdk';
      const hostEvidence = renderer === 'powerpoint'
        ? {kind, nativeHostReadback: true, application: 'Microsoft PowerPoint', version: 'fixture-1', reopenObserved: true, noRepairPrompt: true,
          updatedQuestionVisible: true, nativeBoldLabelVisible: true, attachedEndpointsObserved: true}
        : renderer === 'google-slides'
          ? {kind, nativeWritesObserved: true, injectedTransportVerified: true, editMethod: 'native Slides API', uiClaim: false}
          : {kind, nativeWritesObserved: true, captureFenceVerified: true, revisionKind: 'content-digest', serverCas: false, atomicRevision: false};
      caseValue.rendererTargets.push({rendererId: renderer, profileId, modelVersion, mappingVersion: '1',
        projection: {state: 'emitted', status: 'supported', diagnostics: [], losses: []},
        artifacts: pptArtifact ? [{...pptArtifact, mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'}] : [],
        preview: {state: 'rendered', engine: renderer, nativeVersion: 'fixture-engine 1', sourceSha256: hash(sourceBytes),
          profileId, modelVersion, mappingVersion: '1', stage: 'edited-cycle',
          ...(renderer === 'powerpoint' ? {inputArtifactSha256: pptArtifact!.sha256} : {revision: 'revision-1', captureDigestSha256: hash(`${item.id}-${renderer}-capture`)}),
          asset: {...asset, mediaType: 'image/png', width: 480, height: 320}},
        roundTrip: {state: 'passed', sourceSha256: hash(sourceBytes), profileId, modelVersion, mappingVersion: '1',
          checks: {noop: true, label: true, reconnection: true, movement: true, style: true, jsonPersistence: true,
            yamlPersistence: true, preservingUpdate: true, readback: true}, receipt, attestation: hostEvidence}});
    }
    if (item.id === 'process-documents-store') for (const renderer of ['dot', 'mermaid', 'lini']) {
      const modelVersion = document.vocabularies['umf.visual'].version, profileId = `umf.visual.${renderer}/1`;
      const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640.25 360.5"><rect x="2" y="2" width="20" height="10"/></svg>`;
      const normalized = normalizeSvgIntrinsicDimensions(rawSvg);
      const rawAsset = await persist(`integrations/previews/${renderer}/${item.id}-raw.svg`, rawSvg);
      const asset = await persist(`integrations/previews/${renderer}/${item.id}.svg`, normalized.svg);
      caseValue.rendererTargets.push({rendererId: renderer, profileId, modelVersion, mappingVersion: '1', projection: {state: 'emitted', status: 'supported', diagnostics: [], losses: []},
        preview: {state: 'rendered', engine: renderer, nativeVersion: 'fixture-engine 1', sourceSha256: hash(sourceBytes), profileId, modelVersion,
          mappingVersion: '1', stage: 'export', presentation: previewPresentationReceipt(renderer === 'dot' ? 'graphviz' : renderer as 'mermaid' | 'lini'),
          rawAsset: {...rawAsset, mediaType: 'image/svg+xml', width: normalized.width, height: normalized.height},
          asset: {...asset, mediaType: 'image/svg+xml', width: normalized.width, height: normalized.height}}});
    }
    cases.push(caseValue);
  }
  return {site, catalog: {schemaVersion: 1, catalogProfile: 'umf.visual.integration-examples/1', corpus: {manifestSha256: hash(await readFile(join(root, 'fixtures/integrations/complex-miro/manifest.json')))}, cases}};
}

describe('host completion gate', () => {
  // @covers US-095-AC13: the completion report requires all exact-source host cycles and six actual renderers for the primary case.
  test('accepts only the complete five-by-three host matrix plus six-renderer process witness', async () => {
    const fixture = await readyFixture();
    try {
      const report = await verifyHostCompletion(fixture.catalog, fixture.site);
      expect(report).toMatchObject({complete: true, cases: 6, commonCases: 5, hostCycles: 15});
      expect(report.renderedTargets).toBe(18);
      expect(report.issues).toEqual([]);
    } finally {await rm(fixture.site, {recursive: true, force: true});}
  },30_000);

  test('release-mode verification requires three canonical full-profile targets per common case',async()=>{
    const fixture=await readyFixture();
    try{
      const report=await verifyHostCompletion(fixture.catalog,fixture.site,true);
      expect(report.complete).toBe(false);
      expect(report.issues.some(entry=>entry.message.includes('fullRendererTargets'))).toBe(true);
    }finally{await rm(fixture.site,{recursive:true,force:true});}
  },30_000);

  test('keeps the release gate open for missing rows, stale provenance, and incomplete or dishonest loss evidence', async () => {
    const fixture = await readyFixture();
    try {
      const catalog: any = structuredClone(fixture.catalog);
      const process = catalog.cases.find((item: any) => item.id === 'process-documents-store');
      process.rendererTargets = process.rendererTargets.filter((row: any) => row.rendererId !== 'miro');
      const missing = await verifyHostCompletion(catalog, fixture.site);
      expect(missing.complete).toBe(false);
      expect(missing.issues.some(row => row.caseId === process.id && row.message.includes('miro host target'))).toBe(true);
      process.rendererTargets = process.rendererTargets.filter((row: any) => row.rendererId !== 'lini');
      const missingSixth = await verifyHostCompletion(catalog, fixture.site);
      expect(missingSixth.issues.some(row => row.caseId === process.id && row.message.includes('Six-renderer coverage requires one lini row'))).toBe(true);

      const staleCatalog: any = structuredClone(fixture.catalog);
      const stale = staleCatalog.cases[0].rendererTargets.find((row: any) => row.rendererId === 'powerpoint');
      stale.roundTrip.sourceSha256 = '0'.repeat(64);
      expect((await verifyHostCompletion(staleCatalog, fixture.site)).complete).toBe(false);

      const incompleteCatalog: any = structuredClone(fixture.catalog);
      const incomplete = incompleteCatalog.cases[0].rendererTargets.find((row: any) => row.rendererId === 'miro');
      incomplete.roundTrip.checks.reconnection = false;
      expect((await verifyHostCompletion(incompleteCatalog, fixture.site)).complete).toBe(false);

      const dishonestLossCatalog: any = structuredClone(fixture.catalog);
      const lossy = dishonestLossCatalog.cases[0].rendererTargets.find((row: any) => row.rendererId === 'google-slides');
      lossy.projection.status = 'supported'; lossy.projection.losses = [{path: '/x', reason: 'unrepresented'}];
      expect((await verifyHostCompletion(dishonestLossCatalog, fixture.site)).complete).toBe(false);

      const erroredProjectionCatalog: any = structuredClone(fixture.catalog);
      const erroredRow = erroredProjectionCatalog.cases[0].rendererTargets.find((row: any) => row.rendererId === 'miro');
      erroredRow.projection.diagnostics = [{severity: 'error', code: 'NATIVE_REFUSED'}];
      const erroredReport = await verifyHostCompletion(erroredProjectionCatalog, fixture.site);
      expect(erroredReport.complete).toBe(false);
      expect(erroredReport.issues.some(row => row.caseId === erroredProjectionCatalog.cases[0].id && row.message.includes('error-severity'))).toBe(true);
    } finally {await rm(fixture.site, {recursive: true, force: true});}
  },30_000);

  test('does not substitute a reported-loss image for exact-cycle evidence or an opaque stencil projection', async () => {
    const fixture = await readyFixture();
    try {
      const catalog: any = structuredClone(fixture.catalog);
      const row = catalog.cases[1].rendererTargets.find((item: any) => item.rendererId === 'powerpoint');
      row.projection.status = 'reported-loss'; row.projection.losses = [{path: '/opaque', reason: 'native-only'}];
      row.roundTrip = undefined;
      const opaque = catalog.cases.find((item: any) => item.id === 'opaque-stencils');
      opaque.rendererTargets = [{rendererId: 'miro', preview: {state: 'rendered'}, roundTrip: {state: 'passed'}}];
      const report = await verifyHostCompletion(catalog, fixture.site);
      expect(report.complete).toBe(false);
      expect(report.issues.some(issue => issue.caseId === 'process-documents-store' && issue.message.includes('round trip'))).toBe(true);
      expect(report.issues.some(issue => issue.caseId === opaque.id && issue.message.includes('Opaque witness'))).toBe(true);
    } finally {await rm(fixture.site, {recursive: true, force: true});}
  },30_000);

  test('keeps Miro recovery evidence separate from its interrupted write and hides unqualified drift',async()=>{
    const fixture=await readyFixture();
    try{
      const catalog:any=structuredClone(fixture.catalog),row=catalog.cases[0].rendererTargets.find((item:any)=>item.rendererId==='miro');
      row.roundTrip.attestation.readonlyRecoveryStages=['restore'];
      row.roundTrip.attestation.interruptedWritesRetained=[{stage:'restore',recoveryWritesPerformed:false,atomicityClaimed:false,
        receiptSha256:'a'.repeat(64),causeCodes:['CONCURRENT_EDIT'],qualifiedMetadataDriftCount:2,newlyObservedUnownedCount:1}];
      row.roundTrip.attestation.unownedContentRetainedExceptRecordedMetadataDrift=true;
      expect((await verifyHostCompletion(catalog,fixture.site)).complete).toBe(true);
      row.roundTrip.attestation.interruptedWritesRetained[0].atomicityClaimed=true;
      const report=await verifyHostCompletion(catalog,fixture.site);
      expect(report.complete).toBe(false);
      expect(report.issues.some(item=>item.caseId===catalog.cases[0].id&&item.message.includes('preserve its interrupted operation'))).toBe(true);
    }finally{await rm(fixture.site,{recursive:true,force:true});}
  },30_000);

  test('requires repair-free PowerPoint reopen evidence for native-only layout previews',async()=>{
    const fixture=await readyFixture();
    try{
      const catalog:any=structuredClone(fixture.catalog),row=catalog.cases[0].rendererTargets.find((item:any)=>item.rendererId==='powerpoint');
      row.preview.stage='native-only-preview-layout';row.preview.nativeOpen={application:'Microsoft PowerPoint for Mac',version:'16.114.3',reopenObserved:true,noRepairPrompt:true};
      expect((await verifyHostCompletion(catalog,fixture.site)).complete).toBe(true);
      row.preview.nativeOpen.noRepairPrompt=false;
      const report=await verifyHostCompletion(catalog,fixture.site);
      expect(report.complete).toBe(false);
      expect(report.issues.some(item=>item.caseId===catalog.cases[0].id&&item.message.includes('repair-free native reopen'))).toBe(true);
    }finally{await rm(fixture.site,{recursive:true,force:true});}
  },30_000);

  test('requires native renderer raw SVG, exact presentation policy, and geometry-preserving display normalization',async()=>{
    const fixture=await readyFixture();
    try{
      const catalog:any=structuredClone(fixture.catalog),primary=catalog.cases.find((item:any)=>item.id==='process-documents-store');
      const row=primary.rendererTargets.find((item:any)=>item.rendererId==='mermaid');
      expect((await verifyHostCompletion(catalog,fixture.site)).complete).toBe(true);

      const changed:any=structuredClone(catalog),changedPrimary=changed.cases.find((item:any)=>item.id==='process-documents-store'),changedRow=changedPrimary.rendererTargets.find((item:any)=>item.rendererId==='mermaid');
      const edited=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360"><rect x="9" y="2" width="20" height="10"/></svg>`;
      await writeFile(join(fixture.site,changedRow.preview.asset.path),edited);
      changedRow.preview.asset.sha256=hash(edited);
      const altered=await verifyHostCompletion(changed,fixture.site);
      expect(altered.complete).toBe(false);
      expect(altered.issues.some((entry:any)=>entry.target==='mermaid'&&entry.message.includes('exact root-dimension normalization'))).toBe(true);

      const missingRaw:any=structuredClone(catalog),missingRawPrimary=missingRaw.cases.find((item:any)=>item.id==='process-documents-store'),missingRawRow=missingRawPrimary.rendererTargets.find((item:any)=>item.rendererId==='dot');
      delete missingRawRow.preview.rawAsset;
      expect((await verifyHostCompletion(missingRaw,fixture.site)).issues.some((entry:any)=>entry.target==='dot'&&entry.message.includes('raw SVG'))).toBe(true);

      const wrongPresentation:any=structuredClone(catalog),wrongPrimary=wrongPresentation.cases.find((item:any)=>item.id==='process-documents-store'),wrongRow=wrongPrimary.rendererTargets.find((item:any)=>item.rendererId==='lini');
      wrongRow.preview.presentation.svgNormalization='shape-rewrite/1';
      expect((await verifyHostCompletion(wrongPresentation,fixture.site)).issues.some((entry:any)=>entry.target==='lini'&&entry.message.includes('presentation options'))).toBe(true);
    }finally{await rm(fixture.site,{recursive:true,force:true});}
  },30_000);

  test('allows exact fractional SVG viewBox dimensions but keeps captured raster dimensions finite integers',async()=>{
    const fixture=await readyFixture();
    try{
      expect((await verifyHostCompletion(fixture.catalog,fixture.site)).complete).toBe(true);
      for(const dimension of [480.5,Number.NaN,Number.POSITIVE_INFINITY]){
        const catalog:any=structuredClone(fixture.catalog),row=catalog.cases.find((item:any)=>item.id==='process-documents-store').rendererTargets
          .find((item:any)=>item.rendererId==='powerpoint');
        row.preview.asset.width=dimension;
        const report=await verifyHostCompletion(catalog,fixture.site);
        expect(report.complete).toBe(false);
        expect(report.issues.some((entry:any)=>entry.target==='powerpoint'&&entry.message.includes('valid image metadata and dimensions'))).toBe(true);
      }
    }finally{await rm(fixture.site,{recursive:true,force:true});}
  },30_000);
});
