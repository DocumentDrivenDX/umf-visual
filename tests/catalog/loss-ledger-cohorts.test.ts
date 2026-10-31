// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe, expect, test} from 'bun:test';
import {createCatalogData} from '../../scripts/catalog/build';
import type {IntegrationCatalog} from '../../scripts/catalog/integrations';
import {createLossLedger} from '../../scripts/catalog/loss-ledger';
import {createRankedLossInventory} from '../../scripts/catalog/loss-ledger-cohorts';

const emptyIntegrations = (): IntegrationCatalog => ({schemaVersion: 1, catalogProfile: 'umf.visual.integration-examples/1', corpus: {manifestPath: 'manifest.json', manifestSha256: '0'.repeat(64), witnessSchemaPath: 'witness.json'},
  complete: false, completionReasons: [], counts: {cases: 0, commonProjections: 0, opaqueWitnesses: 0, formatReadbacks: 0, plannedTargets: 0, refusedTargets: 0}, cases: [], hostConformance: []});

describe('ranked loss inventory', () => {
  // @covers US-095-AC2, US-095-AC8: raw target diagnostics, profile variants and all source hashes survive ranking in separate populations.
  test('keeps exact 53-source provenance and raw ordinary/annotated records while ranking maximal groups', async () => {
    const catalog = await createCatalogData();
    const ledger = createLossLedger(catalog, []);
    const inventory = createRankedLossInventory(catalog, ledger, emptyIntegrations());
    expect(inventory.schemaVersion).toBe(1);
    expect(inventory.sourceManifest).toHaveLength(53);
    expect(new Set(inventory.sourceManifest.map(item => item.sourceSha256)).size).toBe(53);
    expect(inventory.sourceManifest.filter(item => item.origin === 'fixture')).toHaveLength(50);
    expect(inventory.sourceManifest.filter(item => item.origin === 'canary')).toHaveLength(3);
    expect(inventory.populations.ordinary.pairCount).toBe(159);
    expect(inventory.populations.ordinary.emittedPairCount).toBe(72);
    expect(inventory.populations.annotated.profilePairCount).toBe(159);
    expect(inventory.populations.annotated.emittedPairCount).toBe(71);
    expect(inventory.populations.ordinary.rawLossDiagnosticCount).toBe(1951);
    expect(inventory.populations.ordinary.allAttemptRawLossDiagnosticCount).toBeGreaterThan(inventory.populations.ordinary.rawLossDiagnosticCount);
    expect(inventory.populations.ordinary.maximalLossGroupCount).toBe(1793);
    expect(inventory.populations.ordinary.candidates.reduce((sum, candidate) => sum + candidate.rawLossIncidences, 0)).toBe(1951);
    const byTarget = Object.fromEntries((['dot', 'mermaid', 'lini'] as const).map(target => [target,
      ledger.pairs.filter(pair => pair.target === target && pair.export.ok).reduce((n, pair) => n + pair.rawDiagnostics.filter(item => item.loss).length, 0)]));
    expect(byTarget).toEqual({dot: 629, mermaid: 792, lini: 530});
    const source = inventory.sourceManifest[0]!;
    const originalPair = ledger.pairs.find(pair => pair.sourceSha256 === source.sourceSha256 && pair.target === 'dot')!;
    const savedPair = inventory.populations.ordinary.records.find((record: any) => record.sourceSha256 === source.sourceSha256 && record.target === 'dot') as any;
    expect(savedPair.rawDiagnostics).toEqual(originalPair.rawDiagnostics);
    expect(savedPair.lossGroups).toEqual(originalPair.lossGroups);
    expect(savedPair.sourceSha256).toBe(source.sourceSha256);
    expect(inventory.populations.ordinary.records.filter((record: any) => record.export.ok)).toHaveLength(72);
    expect(inventory.populations.ordinary.records.filter((record: any) => !record.export.ok)).toHaveLength(87);
    expect(inventory.populations.ordinary.records.every((record: any) => record.sourceSha256 && record.rawDiagnostics)).toBe(true);
    expect(inventory.populations.ordinary.candidates.some(candidate => candidate.disposition === 'qualified-additional-annotation' || candidate.disposition === 'qualified-native-mapping')).toBe(false);
    expect(inventory.populations.ordinary.candidates.some(candidate => candidate.disposition === 'profile-candidate')).toBe(false);
    expect(inventory.populations.ordinary.candidates.filter(candidate => candidate.disposition === 'unknown').length).toBeGreaterThan(0);
    const unresolvedMermaid = inventory.populations.ordinary.candidates.find(candidate => candidate.target === 'mermaid' && candidate.reasonCode === 'MERMAID_FIELD_REFERENCE');
    expect(unresolvedMermaid?.disposition).toBe('unknown');
    expect(unresolvedMermaid?.gapOwner).toBe('unknown');
    expect(unresolvedMermaid?.nextProbe).toContain('Probe');

    // An export+render+declared coverage claim is a probe candidate, not proof of edited native readback.
    const probePair = ledger.pairs.find(pair => pair.target === 'dot' && pair.export.ok && pair.lossGroups.length > 0)!;
    const probeItem = catalog.items.find(item => item.sourceSha256 === probePair.sourceSha256)!;
    const probeVariant = probeItem.profileVariants!.find(variant => variant.format === 'dot')!;
    probeVariant.result = {...probeVariant.result, status: 'supported', ok: true, render: {ok: true, engine: 'graphviz', nativeVersion: 'Graphviz test oracle'}};
    probeVariant.coverage = [{path: probePair.lossGroups[0]!.path, aspect: 'value', representation: 'profile-annotation', native: [{id: 'profile-owner', slot: 'value'}]}];
    const probeInventory = createRankedLossInventory(catalog, ledger, emptyIntegrations());
    const profileCandidate = probeInventory.populations.ordinary.candidates.find(candidate => candidate.target === 'dot' && candidate.path === probePair.lossGroups[0]!.path && candidate.evidence.some(item => item.itemId === probeItem.id));
    expect(profileCandidate?.disposition).toBe('profile-candidate');
    expect(profileCandidate?.nextProbe).toContain('edited readback');
    expect(profileCandidate?.disposition).not.toBe('qualified-additional-annotation');
  }, 30_000);

  // @covers US-095-AC2, US-095-AC7: host plans, actual host receipts and source projection gaps cannot collapse into format losses.
  test('keeps five host-plan populations separate from live edit witnesses and original projection gaps', async () => {
    const catalog = await createCatalogData();
    const ledger = createLossLedger(catalog, []);
    const commonPath = 'fixtures/integrations/complex-miro/common/process-documents-store.json';
    const commonSha256 = 'a'.repeat(64);
    const baseTarget = {status: 'planned' as const, profile: 'umf.visual.example/1', evidenceKind: 'adapter-plan' as const, nativeHostVerified: false as const,
      evidence: {}, diagnostics: [], losses: [{path: '/extensions/umf.visual/nodes/0/label', code: 'LABEL_SLOT', family: 'semantic', representation: 'retained-only', message: 'Native label readback has not been qualified.'}]};
    const integrations = emptyIntegrations();
    integrations.cases.push({id: 'sample-case', title: 'Synthetic case', commonProjection: 'partial-explicit-projection', commonPath, commonSha256,
      commonDocument: {} as any, nativeWitnessPath: 'witness.json', nativeWitnessSha256: 'b'.repeat(64), nativeWitness: {}, downloads: {nativeWitness: {path: 'witness.json', sha256: 'b'.repeat(64)}},
      originalProjectionGaps: [{path: 'native.items[*].parentId', meaning: 'native enclosure', gap: 'not asserted in common model'}], coverageComplete: false, coverageReasons: [],
      targets: {powerpoint: baseTarget, googleSlides: {...baseTarget, profile: 'umf.visual.google-slides/1'}, miro: {...baseTarget, profile: 'umf.visual.miro/1'}}});
    integrations.hostConformance.push({id: 'live-proof', target: 'powerpoint', matchedCaseId: 'sample-case', standalone: false, profile: baseTarget.profile,
      source: {fixtureId: 'sample-case', path: commonPath, sha256: commonSha256}, receipt: {path: 'receipt.json', sha256: 'c'.repeat(64), mediaType: 'application/json', bytes: 1},
      scope: {semanticEditPaths: ['/extensions/umf.visual/nodes/0/label']}});
    const inventory = createRankedLossInventory(catalog, ledger, integrations);
    expect(inventory.populations.hosts.caseTargetCount).toBe(3);
    expect(inventory.populations.hosts.rawLossCount).toBe(3);
    expect(inventory.populations.hosts.sourceProjection.caseCount).toBe(1);
    expect(inventory.populations.hosts.sourceProjection.records[0]).toMatchObject({rawGaps: [{path: 'native.items[*].parentId'}]});
    expect(inventory.populations.hosts.candidates.some(candidate => candidate.population === 'host-profile' && candidate.disposition === 'host-probe' && candidate.reasonCode === 'HOST_SEMANTIC_EDIT_WITNESS')).toBe(true);
    expect(inventory.populations.hosts.candidates.filter(candidate => candidate.reasonCode === 'LABEL_SLOT').every(candidate => candidate.disposition === 'unknown')).toBe(true);
    expect(inventory.populations.ordinary.records).toHaveLength(159);
  }, 30_000);
});
