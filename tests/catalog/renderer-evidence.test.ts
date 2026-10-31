// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe, expect, test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {exportPowerPoint, importPowerPoint} from '../../src/adapters/powerpoint/index';
import type {IntegrationCase} from '../../scripts/catalog/integrations';
import {joinRendererReceiptRows,joinPowerPointCycle,verifyRendererPreviewSource} from '../../scripts/catalog/renderer-evidence';
import type {RendererTargetEvidence} from '../../scripts/catalog/renderer-types';

const currentSha = 'a'.repeat(64), oldSha = 'b'.repeat(64);
function makeCase(): IntegrationCase {
  return {id: 'sample', title: 'Sample', commonProjection: 'complete-topology-projection', commonPath: 'common/sample.json', commonSha256: currentSha,
    commonDocument: {umf: '0.10.0', id: 'sample', vocabularies: {'umf.visual': {version: '1.0.0'}}, extensions: {'umf.visual': {id: 'sample', kind: 'flow', form: 'network', question: 'q', nodes: [], edges: []}}} as any,
    nativeWitnessPath: '', nativeWitnessSha256: oldSha, nativeWitness: {}, downloads: {nativeWitness: {path: '', sha256: oldSha}}, originalProjectionGaps: [], coverageComplete: false, coverageReasons: [],
    targets: {powerpoint: {status: 'format-readback', profile: 'umf.visual.powerpoint.network/1', evidenceKind: 'qualified-pptx-xml-readback', nativeHostVerified: false,
      evidence: {}, diagnostics: [], losses: []}, googleSlides: {status: 'planned', profile: 'umf.visual.google-slides.network/1', evidenceKind: 'adapter-plan', nativeHostVerified: false, evidence: {}, diagnostics: [], losses: []},
      miro: {status: 'planned', profile: 'umf.visual.miro.editable-network/1', evidenceKind: 'adapter-plan', nativeHostVerified: false, evidence: {}, diagnostics: [], losses: []}}};
}
function receipt(sourceSha256: string, rendererSourceSha256 = sourceSha256): Map<string, any> {
  const row = {rendererId: 'powerpoint', profileId: 'umf.visual.powerpoint.network/1', modelVersion: '1.0.0', mappingVersion: '1',
    projection: {state: 'emitted', status: 'supported', diagnostics: [], losses: []}, artifacts: [{path: 'old.pptx', sha256: oldSha, mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', bytes: 5}],
    preview: {state: 'rendered', engine: 'libreoffice', nativeVersion: 'LibreOffice test', sourceSha256: rendererSourceSha256, profileId: 'umf.visual.powerpoint.network/1', modelVersion: '1.0.0', mappingVersion: '1', inputArtifactSha256: oldSha, stage: 'export',
      asset: {path: 'old.png', sha256: oldSha, mediaType: 'image/png', width: 640, height: 480}}};
  return new Map([['powerpoint', {cases: [{id: 'sample', source: {path: 'fixtures/integrations/complex-miro/common/sample.json', sha256: sourceSha256}, rendererTargets: [row]}]}]]);
}

describe('renderer evidence joins', () => {
  // @covers US-095-AC10: renderer preview provenance is bound to exact source bytes and stale evidence cannot promote.
  test('joins exact source receipts and demotes source-mismatched previews', () => {
    expect(verifyRendererPreviewSource(currentSha, currentSha)).toBe(true);
    expect(verifyRendererPreviewSource(currentSha, oldSha)).toBe(false);
    const valid = joinRendererReceiptRows(makeCase(), receipt(currentSha))[0]!;
    expect(valid.preview?.state).toBe('rendered');
    expect(valid.projection.status).toBe('supported');

    const stale = joinRendererReceiptRows(makeCase(), receipt(oldSha, oldSha))[0]!;
    expect(stale.preview?.state).toBe('unavailable');
    expect(stale.preview?.error).toContain('does not match');
    expect(stale.projection.status).toBe('supported'); // current plan, not stale receipt status
    expect(stale.artifacts).toEqual([]);
    const staleCycle=receipt(oldSha);staleCycle.get('powerpoint').cases[0].rendererTargets[0].roundTrip={state:'passed'};
    expect(joinRendererReceiptRows(makeCase(),staleCycle)[0]!.roundTrip?.state).toBe('unavailable');
  });

  test('refuses stale mapping versions and receipt-cleared source loss inventories',()=>{
    const version=receipt(currentSha);version.get('powerpoint').cases[0].rendererTargets[0].mappingVersion='2';
    expect(()=>joinRendererReceiptRows(makeCase(),version)).toThrow('mapping version');
    const item=makeCase();item.targets.powerpoint.losses=[{path:'/extensions/umf.visual/source',code:'RETAINED_ONLY',family:'semantic',representation:'retained-only',message:'Source is not native.'}];
    expect(()=>joinRendererReceiptRows(item,receipt(currentSha))).toThrow('semantic loss inventory');
    const supported=receipt(currentSha);supported.get('powerpoint').cases[0].rendererTargets[0].projection.losses=item.targets.powerpoint.losses;
    expect(()=>joinRendererReceiptRows(item,supported)).toThrow('supported status');
  });

  test('rejects emitted projection rows that carry error-severity diagnostics',()=>{
    const value=receipt(currentSha);
    value.get('powerpoint').cases[0].rendererTargets[0].projection.diagnostics=[{severity:'error',code:'NATIVE_REFUSED'}];
    expect(()=>joinRendererReceiptRows(makeCase(),value)).toThrow('error-severity diagnostics');
  });

  test('requires stable actual host capture fences rather than source-only image claims',()=>{
    const source=receipt(currentSha).get('powerpoint').cases[0],row=source.rendererTargets[0];
    row.rendererId='google-slides';row.profileId='umf.visual.google-slides.network/1';row.preview.profileId=row.profileId;row.preview.engine='google-slides';delete row.preview.inputArtifactSha256;
    const hosts=new Map([['google-slides',{cases:[source]}]]);
    expect(()=>joinRendererReceiptRows(makeCase(),hosts)).toThrow('revision/capture fence');
    source.captureFence={before:{revision:'r1',captureDigestSha256:oldSha},after:{revision:'r1',captureDigestSha256:oldSha}};
    row.preview.revision='r1';row.preview.captureDigestSha256=oldSha;
    expect(joinRendererReceiptRows(makeCase(),hosts)[0]!.preview?.state).toBe('rendered');
    source.captureFence.after.revision='r2';expect(()=>joinRendererReceiptRows(makeCase(),hosts)).toThrow('revision/capture fence');
  });

  test('rejects malformed matching source receipts instead of silently dropping them', () => {
    expect(() => verifyRendererPreviewSource(currentSha, 'not-a-sha')).toThrow('malformed');
    const invalid = receipt(currentSha);
    invalid.get('powerpoint').cases[0].source.path = undefined;
    expect(() => joinRendererReceiptRows(makeCase(), invalid)).toThrow('malformed or mismatched source provenance');
  });

  // @covers US-095-AC10, US-095-AC12: native UI cycle receipts are independent of converter previews and retain actual source losses.
  test('joins the exact updated native PowerPoint cycle and rejects stale or loss-cleared claims',async()=>{
    const root=resolve(import.meta.dir,'../..'),receipt=JSON.parse(await readFile(join(root,'fixtures/renderers/powerpoint/native-cycle-receipt.json'),'utf8')),cycle=receipt.cases[0];
    const source=JSON.parse(await readFile(join(root,cycle.source.path),'utf8')),current=await exportPowerPoint(source,{mode:'report'});
    const item={...makeCase(),id:cycle.id,commonDocument:source,commonSha256:cycle.source.sha256};
    const target:RendererTargetEvidence={rendererId:'powerpoint',profileId:current.profile,modelVersion:current.modelVersion,mappingVersion:'1',projection:{state:'emitted',status:'reported-loss',diagnostics:[],losses:current.losses}};
    const output=join(root,'.cache/renderer-cycle-test');await joinPowerPointCycle(output,item,target);
    expect(target.roundTrip?.state).toBe('passed');expect(target.roundTrip?.nativeHostReadback).toBe(true);
    expect(target.roundTrip?.inputArtifactSha256).toBe(cycle.hostReadback.inputArtifactSha256);
    expect(target.roundTrip?.outputArtifactSha256).toBe(cycle.hostReadback.artifactSha256);
    expect(target.roundTrip?.checks).toEqual({noop:true,label:true,reconnection:true,movement:true,style:true,jsonPersistence:true,yamlPersistence:true,preservingUpdate:true,readback:true});
    expect(target.roundTrip?.attestation).toMatchObject({kind:'powerpoint-ui',nativeHostReadback:true,application:'Microsoft PowerPoint for Mac',version:'16.114.3',reopenObserved:true});
    expect((target.roundTrip?.receipt as any)?.sha256).toMatch(/^[a-f0-9]{64}$/);
    const stale=structuredClone(target);await joinPowerPointCycle(output,{...item,commonSha256:oldSha},stale);expect(stale.roundTrip?.state).toBe('unavailable');
    const cleared=structuredClone(target);cleared.projection.losses=[];await expect(joinPowerPointCycle(output,item,cleared)).rejects.toThrow('source losses differ');
  });

  test('accepts independently witnessed PowerPoint reconnection edits when one directed endpoint changed',async()=>{
    const root=resolve(import.meta.dir,'../..'),receipt=JSON.parse(await readFile(join(root,'fixtures/renderers/powerpoint/native-cycle-receipt.json'),'utf8'));
    const output=join(root,'.cache/renderer-cycle-one-endpoint');
    for(const cycle of receipt.cases){
      const source=JSON.parse(await readFile(join(root,cycle.source.path),'utf8'));
      const current=await exportPowerPoint(source,{mode:'report'});
      const item={...makeCase(),id:cycle.id,commonDocument:source,commonSha256:cycle.source.sha256};
      const target:RendererTargetEvidence={rendererId:'powerpoint',profileId:current.profile,modelVersion:current.modelVersion,mappingVersion:'1',projection:{state:'emitted',status:'reported-loss',diagnostics:[],losses:current.losses}};
      await joinPowerPointCycle(output,item,target);
      expect((target.roundTrip?.checks as any).reconnection).toBe(true);
    }
  },30_000);

  // @covers US-095-AC11: an archived editable host artifact is promoted only after exact source-bound readback.
  test('PowerPoint preview assets are durable and import back against each exact five-case source', async () => {
    const root = resolve(import.meta.dir, '../..');
    const receipt = JSON.parse(await readFile(join(root, 'fixtures/renderers/powerpoint/preview-receipt.json'), 'utf8'));
    expect(receipt.cases).toHaveLength(5);
    for (const entry of receipt.cases) {
      const sourceBytes = await readFile(join(root, entry.source.path));
      expect(createHash('sha256').update(sourceBytes).digest('hex')).toBe(entry.source.sha256);
      const source = JSON.parse(sourceBytes.toString('utf8'));
      const artifactBytes = await readFile(join(root, entry.artifactSourcePath));
      expect(createHash('sha256').update(artifactBytes).digest('hex')).toBe(entry.artifact.sha256);
      expect(entry.rendererTargets[0].preview.inputArtifactSha256).toBe(entry.artifact.sha256);
      const current = await exportPowerPoint(source, {mode: 'report'});
      const readback = await importPowerPoint(artifactBytes, {mode: 'report', binding: current.binding, expectedBindingRevision: current.bindingRevision});
      expect(readback.changes).toHaveLength(0);
      expect(readback.document).toEqual(source);
    }
  }, 30_000);
});

