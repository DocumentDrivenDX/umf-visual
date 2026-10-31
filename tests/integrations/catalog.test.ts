// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildIntegrationCatalog} from '../../scripts/catalog/integrations.js';

test('integration catalogue preserves six witnesses and labels evidence by what ran', async () => {
  const output = await mkdtemp(join(tmpdir(), 'umf-integration-catalog-'));
  try {
    const catalog = await buildIntegrationCatalog(output, {rendererEvidence: false});
    expect(catalog.counts).toMatchObject({cases: 6, commonProjections: 5, opaqueWitnesses: 1});
    expect(catalog.complete).toBe(false);
    expect(catalog.cases).toHaveLength(6);
    const ids = catalog.cases.map(item => item.id);
    expect(new Set(ids).size).toBe(6);

    for (const item of catalog.cases.filter(row => row.commonDocument)) {
      expect(item.nativeWitness).toMatchObject({authorship: 'synthetic-fixture', caseId: item.id});
      expect(item.originalProjectionGaps.length).toBeGreaterThan(0);
      expect(item.coverageComplete).toBe(false);
      for (const artifact of Object.values(item.downloads)) {
        const bytes = await readFile(join(output, artifact.path));
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(artifact.sha256);
      }
      const ppt = item.targets.powerpoint;
      expect(ppt.status).toBe('format-readback');
      expect(ppt.evidenceKind).toBe('qualified-pptx-xml-readback');
      expect(ppt.nativeHostVerified).toBe(false);
      expect(ppt.evidence).toMatchObject({changes: 0, qualification: expect.stringContaining('not a Microsoft PowerPoint')});
      expect(ppt.losses).toBeDefined();
      expect(ppt.artifact).toBeDefined();
      const pptBytes = await readFile(join(output, ppt.artifact!.path));
      expect(createHash('sha256').update(pptBytes).digest('hex')).toBe(ppt.artifact!.sha256);

      const slides = item.targets.googleSlides;
      expect(slides.status).toBe('planned');
      expect(slides.evidenceKind).toBe('synthetic-observation-plan');
      expect(slides.nativeHostVerified).toBe(false);
      expect(slides.evidence).toMatchObject({syntheticPresentationId: 'synthetic-unwritten-presentation'});
      expect((slides.evidence.requests as unknown[]).length).toBe(Number(slides.evidence.requestCount));
      expect(slides.losses).toBeDefined();

      const miro = item.targets.miro;
      expect(miro.status).toBe('planned');
      expect(miro.evidenceKind).toBe('adapter-plan');
      expect(miro.nativeHostVerified).toBe(false);
      expect(miro.evidence).toMatchObject({writeCount: 0, plan: {source: item.commonDocument}});
      expect(miro.losses).toBeDefined();
    }
    const opaque = catalog.cases.find(row => !row.commonDocument)!;
    expect(opaque.commonPath).toBeNull();
    expect(opaque.downloads.commonDocument).toBeUndefined();
    expect(opaque.targets.powerpoint.status).toBe('refused');
    expect(opaque.targets.googleSlides.status).toBe('refused');
    expect(opaque.targets.miro.status).toBe('refused');
    expect(opaque.targets.miro.evidence.writeCount).toBe(0);
    expect(opaque.targets.miro.diagnostics[0]).toMatchObject({code: 'NO_COMMON_PROJECTION'});
    expect(catalog.counts.formatReadbacks).toBe(5);
    expect(catalog.counts.plannedTargets).toBe(10);
    expect(catalog.counts.refusedTargets).toBe(3);
    expect(catalog.hostConformance).toHaveLength(4);
    const slideProof=catalog.hostConformance.find(proof=>proof.target==='google-slides')!;
    const slideCase=catalog.cases.find(item=>item.id==='process-documents-store')!;
    expect(slideProof).toMatchObject({matchedCaseId:'process-documents-store',standalone:false,profile:'umf.visual.google-slides.network/1',source:{sha256:slideCase.commonSha256}});
    expect(slideProof.scope).toMatchObject({nativeWritesObserved:true,exportRequests:37,umfUpdateRequests:3,finalBindingRevision:2});
    expect(slideCase.targets.googleSlides.status).toBe('planned');
    expect(slideCase.targets.googleSlides.nativeHostVerified).toBe(false);
    expect(slideCase.targets.googleSlides.losses.length).toBeGreaterThan(0);

    const networkProof=catalog.hostConformance.find(proof=>proof.id==='powerpoint-network-16x24-native')!;
    const networkCase=catalog.cases.find(item=>item.id==='network-16x24')!;
    if(!networkCase.commonSha256)throw new Error('Expected a hashed network common projection.');
    expect(networkProof.source.sha256).toBe(networkCase.commonSha256);
    expect(networkProof.scope).toMatchObject({modelVersion:'1.1.0',nodeCount:16,edgeCount:24,reopenedAfterPreservingUpdate:true});
    expect(networkCase.targets.powerpoint.status).toBe('format-readback');
    expect(networkCase.targets.powerpoint.nativeHostVerified).toBe(false);

    const standalone=catalog.hostConformance.find(proof=>proof.id==='powerpoint-caption-standalone')!;
    expect(standalone).toMatchObject({matchedCaseId:null,standalone:true,source:{fixtureId:null,path:null}});
    expect(standalone.source.sha256).not.toBe(networkCase.commonSha256);
    const miroProof=catalog.hostConformance.find(proof=>proof.target==='miro')!;
    expect(miroProof).toMatchObject({id:'miro-editable-live-standalone',matchedCaseId:null,standalone:true,source:{fixtureId:null,path:null}});
    expect(miroProof.scope).toMatchObject({modelVersion:'1.0.0',sourceCounts:{nodes:3,edges:2,mappedSlots:7,mappedShapes:5,unmappedNativeItems:82}});
    for(const proof of catalog.hostConformance){
      expect(proof.receipt.path.startsWith('integrations/downloads/')).toBe(true);
      const bytes=await readFile(join(output,proof.receipt.path));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(proof.receipt.sha256);
      expect(bytes.byteLength).toBe(proof.receipt.bytes);
    }
    const saved = JSON.parse(await readFile(join(output, 'integrations.json'), 'utf8'));
    expect(saved).toEqual(catalog);
  } finally {
    await rm(output, {recursive: true, force: true});
  }
});
