// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash} from 'node:crypto';
import {expect, test} from 'bun:test';
import {createCatalogData} from '../../scripts/catalog/build';
import {createLossLedger} from '../../scripts/catalog/loss-ledger';
import {createNativeProbeQualification} from '../../scripts/catalog/native-probe-qualification';

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

test('keeps renderer probe claims bounded to exact sources, versions, pointers and native evidence', async () => {
  const bytes = await Bun.file('fixtures/interchange/progress/renderer-coverage-baseline.json').bytes();
  const planning = JSON.parse(new TextDecoder().decode(bytes));
  const catalog = await createCatalogData();
  const ledger = createLossLedger(catalog, []);
  const report = createNativeProbeQualification(catalog, ledger, planning, hash(bytes));

  expect(report.sourcePopulation).toMatchObject({itemCount: 53, sourceHashCount: 53, fixtureCount: 50, canaryCount: 3});
  expect(report.sourcePopulation.manifest).toHaveLength(53);
  expect(report.ordinaryLosses.baselineSnapshot).toMatchObject({counts: {dot: 629, mermaid: 792, lini: 553}, sha256: hash(bytes), sourceSnapshotSha256: '414cf9afcdbc5e1ba6ba5446c4fba68a28c53e0cee2a488b17aeff25681610fc'});
  expect(report.ordinaryLosses.current.emittedRawDiagnosticCounts).toEqual({dot: 629, mermaid: 792, lini: 530});
  expect(report.ordinaryLosses.current.profileVersions).toEqual({dot: 'umf.visual.dot/1@0.3.0', mermaid: 'umf.visual.mermaid/1@1.2.0', lini: 'umf.visual.lini/1@0.3.0'});
  expect(report.ordinaryLosses.current.deltaFromPlanningSnapshot).toEqual({dot: 0, mermaid: 0, lini: -23});
  expect(report.ordinaryLosses.current.titleMapping).toMatchObject({mappingVersion: '0.3.0', removedRawDiagnostics: 23, sourcePointer: '/extensions/umf.visual/title'});
  expect(report.rawInventory).toMatchObject({pairCount: 159, emittedPairCount: 72, rawLossDiagnosticCount: 1951, maximalLossGroupCount: 1793});
  expect(report.annotatedProfiles).toMatchObject({pairCount: 159, emittedPairCount: 71, rawLossDiagnosticCount: 6});
  expect(report.annotatedProfiles.relationshipToOrdinary).toContain('never subtract');

  const ports = report.probes.find(probe => probe.id === 'dot-record-port-attachment')!;
  const portSource = 'digraph { record [shape=record, label="<out> Output|<in> Input"]; target [shape=box, label="Target"]; record:out -> target [headport=n]; }';
  expect(hash(portSource)).toBe(ports.nativeEvidence.sourceSha256!);
  expect(ports).toMatchObject({target: 'dot', profile: 'umf.visual.dot/1', mappingVersion: '0.3.0', nativeEngine: 'Graphviz', nativeVersion: '16.1.0', attribution: 'mapping-candidate'});
  expect(ports.result).toContain('DOT_PORT');
  expect(hash(await Bun.file(ports.nativeEvidence.script!).bytes())).toBe(ports.nativeEvidence.scriptSha256);
  const roleStatus = report.probes.find(probe => probe.id === 'dot-visual-role-status-not-inferred')!;
  expect(roleStatus.sourceEvidence[0]!.pointers).toContain('/extensions/umf.visual/nodes/0/role');
  expect(roleStatus.limitation).toContain('do not prove');
  expect(roleStatus.attribution).toBe('bounded-attempt-only');

  const identifying = report.probes.find(probe => probe.id === 'mermaid-identifying-relationship')!;
  expect(identifying).toMatchObject({mappingVersion: '1.2.0', nativeVersion: '12.2.0', attribution: 'model-profile-boundary'});
  expect(identifying.limitation).toContain('Visual 1.0');
  const fieldPorts = report.probes.find(probe => probe.id === 'mermaid-field-attached-er-endpoints')!;
  expect(fieldPorts.mappingVersion).toBe('1.2.0');
  expect(fieldPorts.attribution).toBe('native-profile-limit');
  expect(fieldPorts.sourceEvidence.reduce((count, row) => count + row.pointers.length, 0)).toBe(15);
  expect(fieldPorts.sourceEvidence.map(row => row.sourceSha256)).toEqual([
    '3ea8d7e5c8941457901cecb9a6755bc02fd5119c0a9e6fb92bf9e21d4881054e',
    '74cc43f6171ed212876b6fab8fc9ee1429dbd4bca2e7c79394d46e9800bb3dad',
  ]);
  expect(hash(await Bun.file(fieldPorts.nativeEvidence.script!).bytes())).toBe(fieldPorts.nativeEvidence.scriptSha256);

  const lini = report.probes.find(probe => probe.id === 'lini-key-and-cardinality-class-attempts')!;
  expect(lini).toMatchObject({profile: 'umf.visual.lini/1', mappingVersion: '0.3.0', nativeVersion: '1.1.0', attribution: 'bounded-attempt-only'});
  expect(lini.sourceEvidence.every(row => row.sourceSha256)).toBe(true);
  expect(lini.sourceEvidence.find(row => row.reasonCode.includes('.pk'))?.sourceSha256).toBe(lini.nativeEvidence.sourceSha256!);
  expect(hash(await Bun.file(lini.nativeEvidence.script!).bytes())).toBe(lini.nativeEvidence.scriptSha256);
  expect(lini.limitation).toContain('bounded attempts');

  for (const probe of report.probes) {
    expect(hash(await Bun.file(probe.nativeEvidence.script!).bytes())).toBe(probe.nativeEvidence.scriptSha256);
    const testPath = probe.nativeEvidence.test;
    if (testPath) expect(hash(await Bun.file(testPath).bytes())).toBe(probe.nativeEvidence.testSha256!);
    const receiptPath = probe.nativeEvidence.receipt;
    if (receiptPath?.startsWith('docs/')) expect(hash(await Bun.file(receiptPath).bytes())).toBe(probe.nativeEvidence.receiptSha256!);
  }
}, 30_000);

test('rejects a planning snapshot whose source identity changed before interpreting its baseline', async () => {
  const bytes = await Bun.file('fixtures/interchange/progress/renderer-coverage-baseline.json').bytes();
  const planning = JSON.parse(new TextDecoder().decode(bytes));
  planning.records[0].sourceSha256 = '0'.repeat(64);
  const catalog = await createCatalogData();
  expect(() => createNativeProbeQualification(catalog, createLossLedger(catalog, []), planning, hash(bytes))).toThrow('source identity mismatch');
}, 30_000);
