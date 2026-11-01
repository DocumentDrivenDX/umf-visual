// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {buildIntegrationCatalog} from '../../scripts/catalog/integrations.js';
import {verifyHostCompletion} from '../../scripts/catalog/verify-host-completion.js';

const root = resolve(import.meta.dir, '../..');
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

test('five integration cases publish additive complete and focused full-profile renderer evidence', async () => {
  const output = await mkdtemp(join(tmpdir(), 'umf-integration-full-renderers-'));
  try {
    const catalog = await buildIntegrationCatalog(output);
    const common = catalog.cases.filter(item => item.commonDocument);
    expect(common).toHaveLength(5);
    expect(common.reduce((sum, item) => sum + (item.fullRendererTargets?.length ?? 0), 0)).toBe(15);
    for (const item of common) {
      expect(item.rendererTargets).toHaveLength(6); // Compatibility targets remain joined independently.
      expect(item.fullRendererTargets?.map(row => row.rendererId).sort()).toEqual(['dot','lini','mermaid']);
      for (const row of item.fullRendererTargets!) {
        expect(row.profileId).toBe(`umf.visual.${row.rendererId}.full/1`);
        expect(row.modelVersion).toBe(item.commonDocument!.vocabularies['umf.visual']?.version);
        expect(row.mappingVersion).toBe('0.1.0');
        expect(row.projection).toMatchObject({state:'emitted',status:'supported',diagnostics:[],losses:[]});
        expect(row.sourceDocument).toMatchObject({path:`fixtures/integrations/complex-miro/${item.commonPath}`,sha256:item.commonSha256});
        expect(row.wholeDocumentReadback).toMatchObject({state:'passed',mode:'strict',changes:0,diagnostics:[]});
        expect(row.identityMap.count).toEqual(expect.any(Number));
        expect(row.identityMap.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(row.representation.tier).toMatch(/^(native-profile|primitive-fallback)$/);
        expect(row.stableBuild).toMatchObject({state:'verified',deterministicSourceAndMapping:true,sourceSha256:row.sourceArtifact.sha256,
          focusedSourceSha256:row.focusedSourceArtifact.sha256,identityMapSha256:row.identityMap.sha256});
        expect(row.preview.inputArtifactSha256).toBe(row.focusedSourceArtifact.sha256);
        expect(row.completePreview.inputArtifactSha256).toBe(row.sourceArtifact.sha256);
        expect(row.native.complete.sourceSha256).toBe(row.sourceArtifact.sha256);
        expect(row.native.focused.sourceSha256).toBe(row.focusedSourceArtifact.sha256);
        expect(row.native.complete.witness).toHaveProperty('primaryCarriers');
        expect(row.native.complete.witness).toHaveProperty('connections');
        expect(row.native.focused.witness).toHaveProperty('primaryCarriers');
        expect(row.native.focused.witness).toHaveProperty('connections');
        const artifacts: {path:string;sha256:string;bytes?:number}[] = [row.sourceArtifact,row.focusedSourceArtifact,row.native.complete.svgArtifact,row.native.focused.svgArtifact,
          row.preview.asset!,row.completePreview.asset!];
        for (const artifact of artifacts) {
          const bytes = await readFile(join(output, artifact.path));
          expect(hash(bytes)).toBe(artifact.sha256);
          if (artifact.bytes !== undefined) expect(bytes.byteLength).toBe(artifact.bytes);
        }
      }
    }
    const opaque = catalog.cases.find(item => !item.commonDocument)!;
    expect(opaque.fullRendererTargets).toEqual([]);
    const saved = JSON.parse(await readFile(join(output, 'integrations.json'), 'utf8'));
    expect(saved).toEqual(catalog);
    const completion = await verifyHostCompletion(catalog, output, true);
    expect(completion.fullRendererTargets).toBe(15);
    expect(completion.issues.filter(issue => ['dot','mermaid','lini'].includes(issue.target ?? ''))).toEqual([]);

    const focusedTamper: any = structuredClone(catalog);
    const focusedCase = focusedTamper.cases.find((item: any) => item.id === 'process-documents-store');
    const dot = focusedCase.fullRendererTargets.find((row: any) => row.rendererId === 'dot');
    const forgedBytes = Buffer.from(`${await readFile(join(output,dot.focusedSourceArtifact.path),'utf8')}\n// tampered focused source\n`);
    const forgedHash = hash(forgedBytes);
    await writeFile(join(output,dot.focusedSourceArtifact.path),forgedBytes);
    dot.focusedSourceArtifact.sha256=forgedHash; dot.focusedSourceArtifact.bytes=forgedBytes.byteLength;
    dot.stableBuild.focusedSourceSha256=forgedHash; dot.preview.inputArtifactSha256=forgedHash; dot.native.focused.sourceSha256=forgedHash;
    const focusedRejected = await verifyHostCompletion(focusedTamper,output,true);
    expect(focusedRejected.complete).toBe(false);
    expect(focusedRejected.issues.some(issue=>issue.caseId===focusedCase.id&&issue.message.includes('not the deterministic projection'))).toBe(true);

    const versionTamper: any = structuredClone(catalog);
    const versionDot = versionTamper.cases.find((item: any) => item.id === 'process-documents-store').fullRendererTargets.find((row: any) => row.rendererId === 'dot');
    versionDot.completePreview.nativeVersion += ' (forged)';
    const versionRejected = await verifyHostCompletion(versionTamper,output,true);
    expect(versionRejected.complete).toBe(false);
    expect(versionRejected.issues.some(issue=>issue.caseId==='process-documents-store'&&issue.message.includes('engine/version'))).toBe(true);
  } finally {await rm(output, {recursive:true, force:true});}
}, 120_000);
