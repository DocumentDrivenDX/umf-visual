// SPDX-License-Identifier: MIT OR Apache-2.0
/** Bounded renderer probes. Each record names the exact sources and fields it tested. */
import {createHash} from 'node:crypto';
import type {VisualCatalog, TargetName} from './build';
import type {LossLedger} from './loss-ledger';

type BaselineRecord = {id: string; origin: string; sourcePath: string; sourceSha256: string; targets: Record<TargetName, {status: string; emitted: boolean; diagnosticCount: number; lossDiagnosticCount: number; diagnostics: {code: string; loss: boolean; count: number}[]}>};
type Snapshot = {schemaVersion?: number; baselineSnapshot?: {path: string; sha256: string; policy: string}; records?: BaselineRecord[]};
type PointerEvidence = {itemId: string | null; sourcePath: string | null; sourceSha256: string | null; pointers: string[]; reasonCode: string};
type LossDiagnostic = {path: string; code: string; loss: boolean};
type Probe = {
  id: string;
  target: TargetName;
  profile: string;
  mappingVersion: string;
  nativeEngine: string;
  nativeVersion: string;
  boundedClaim: string;
  result: string;
  limitation: string;
  sourceEvidence: PointerEvidence[];
  nativeEvidence: {script: string; scriptSha256: string; test?: string; testSha256?: string; receipt?: string; receiptSha256?: string; pin?: {path: string; sha256: string; version: string}; sourceSha256?: string; outputSha256?: string};
  attribution: 'mapping-candidate' | 'model-profile-boundary' | 'native-profile-limit' | 'bounded-attempt-only' | 'qualified-native-mapping';
};

const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const losses = (item: any, target: TargetName): LossDiagnostic[] => item.targets?.[target]?.ok ? item.targets[target].diagnostics.filter((diagnostic: LossDiagnostic) => diagnostic.loss) : [];
const allPointers = (rows: {path: string}[]) => [...new Set(rows.map(row => row.path))].sort();
const itemEvidence = (item: any, pointers: string[], reasonCode: string): PointerEvidence => ({itemId: item?.id ?? null, sourcePath: item?.sourcePath ?? null, sourceSha256: item?.sourceSha256 ?? null, pointers, reasonCode});
const exactLossEvidence = (catalog: VisualCatalog, target: TargetName, code: string, accept: (path: string) => boolean = () => true) => catalog.items.flatMap(item => {
  const pointers = allPointers(losses(item, target).filter((diagnostic: any) => diagnostic.code === code && accept(diagnostic.path)));
  return pointers.length ? [itemEvidence(item, pointers, code)] : [];
});
const sumLosses = (catalog: VisualCatalog, target: TargetName) => catalog.items.reduce((sum, item) => sum + losses(item, target).length, 0);
const plannedCounts = (snapshot: Snapshot) => {
  const totals = {dot: 0, mermaid: 0, lini: 0};
  for (const item of snapshot.records ?? []) for (const target of ['dot', 'mermaid', 'lini'] as const) {
    if (item.targets?.[target]?.emitted) totals[target] += item.targets[target].lossDiagnosticCount;
  }
  return totals;
};
const planningLossCount = (snapshot: Snapshot, target: TargetName, code: string) => (snapshot.records ?? []).reduce((sum, item) => {
  const row = item.targets?.[target];
  return sum + (row?.emitted ? row.diagnostics.filter(diagnostic => diagnostic.loss && diagnostic.code === code).reduce((n, diagnostic) => n + diagnostic.count, 0) : 0);
}, 0);

export interface NativeProbeQualification {
  schemaVersion: 1;
  policy: string;
  sourcePopulation: {itemCount: number; sourceHashCount: number; fixtureCount: number; canaryCount: number; manifest: {id: string; path: string; sha256: string}[]};
  ordinaryLosses: {
    baselineSnapshot: {path: string; sha256: string; sourceSnapshotSha256: string; counts: Record<TargetName, number>};
    current: {profileVersions: Record<TargetName, string>; emittedRawDiagnosticCounts: Record<TargetName, number>; deltaFromPlanningSnapshot: Record<TargetName, number>; titleMapping: {target: 'lini'; profile: string; mappingVersion: string; removedRawDiagnostics: number; sourcePointer: string; evidence: string}};
    currentMaximalGroups: number;
  };
  annotatedProfiles: {pairCount: number; emittedPairCount: number; rawLossDiagnosticCount: number; relationshipToOrdinary: string};
  probes: Probe[];
  rawInventory: {pairCount: number; emittedPairCount: number; rawLossDiagnosticCount: number; allAttemptRawLossDiagnosticCount: number; maximalLossGroupCount: number; rankedRecordReference: string};
}

/**
 * Build a bounded exact-source probe inventory without turning a renderer observation
 * into a family-wide capability claim. Raw ledger arrays and group counts stay separate.
 */
export function createNativeProbeQualification(catalog: VisualCatalog, ledger: LossLedger, planning: Snapshot, planningSha256: string): NativeProbeQualification {
  if (catalog.items.length !== 53 || new Set(catalog.items.map(item => item.sourceSha256)).size !== 53) throw new Error('Renderer qualification requires the pinned 53-source population.');
  if (planning.schemaVersion !== 1 || planning.baselineSnapshot?.sha256 !== '414cf9afcdbc5e1ba6ba5446c4fba68a28c53e0cee2a488b17aeff25681610fc') throw new Error('Immutable original planning snapshot identity is missing or changed.');
  const plannedItems = new Map((planning.records ?? []).map(item => [item.id, item]));
  const manifest = catalog.items.map(item => {
    const planned = plannedItems.get(item.id);
    if (!planned || planned.sourceSha256 !== item.sourceSha256) throw new Error(`Planning/current source identity mismatch for ${item.id}.`);
    return {id: item.id, path: item.sourcePath, sha256: item.sourceSha256};
  });
  if (plannedItems.size !== catalog.items.length) throw new Error('Planning snapshot and current catalog populations differ.');
  const emittedCounts = Object.fromEntries((['dot', 'mermaid', 'lini'] as const).map(target => [target, sumLosses(catalog, target)])) as Record<TargetName, number>;
  const variants = catalog.items.flatMap(item => item.profileVariants ?? []);
  const annotatedPopulation = {pairCount: variants.length, emittedPairCount: variants.filter(variant => variant.result.ok).length,
    rawLossDiagnosticCount: variants.reduce((sum, variant) => sum + variant.result.diagnostics.filter(diagnostic => diagnostic.loss).length, 0),
    relationshipToOrdinary: 'Separate opt-in profile results. These counts never subtract from ordinary current losses or alter the historical planning snapshot.'};
  const baselineCounts = plannedCounts(planning);
  const plannedTitleLosses = planningLossCount(planning, 'lini', 'LINI_TITLE');
  const delta = Object.fromEntries((['dot', 'mermaid', 'lini'] as const).map(target => [target, emittedCounts[target] - baselineCounts[target]])) as Record<TargetName, number>;
  const expectedVersions = Object.fromEntries((['dot', 'mermaid', 'lini'] as const).map(target => {
    const cap = catalog.capabilities.find(item => item.profile === `umf.visual.${target}/1`);
    if (!cap) throw new Error(`Ordinary profile capability is absent for ${target}.`);
    return [target, `${cap.profile}@${cap.version}`];
  })) as Record<TargetName, string>;
  const containers = catalog.items.find(item => item.sourcePath === 'fixtures/visual/inventory/beacon-containers.json');
  const tickets = catalog.items.find(item => item.sourcePath === 'fixtures/visual/inventory/beacon-schema-tickets.json');
  const workspace = catalog.items.find(item => item.sourcePath === 'fixtures/visual/inventory/beacon-schema-workspace.json');
  const liniCanary = catalog.items.find(item => item.sourcePath === 'fixtures/catalog/canary-entities.json');
  if (!containers || !tickets || !workspace || !liniCanary) throw new Error('Required pinned native probe sources are absent.');
  const mermaidFieldEvidence = [tickets, workspace].map(item => {
    const pointers = allPointers(losses(item, 'mermaid').filter(row => row.code === 'MERMAID_FIELD_REFERENCE'));
    return itemEvidence(item, pointers, 'MERMAID_FIELD_REFERENCE');
  });
  const mermaidIdentification = exactLossEvidence(catalog, 'mermaid', 'MERMAID_IDENTIFICATION');
  const liniEntityProbe = catalog.items.filter(item => ['fixtures/catalog/canary-entities.json', 'fixtures/visual/inventory/beacon-schema-tickets.json', 'fixtures/visual/inventory/beacon-schema-workspace.json', 'fixtures/visual/inventory/tpl-sd-domain.json'].includes(item.sourcePath));
  const liniKeyEvidence = liniEntityProbe.flatMap(item => {
    const pointers = allPointers(losses(item, 'lini').filter(row => row.code === 'LINI_FIELD_KEYS'));
    return pointers.length ? [itemEvidence(item, pointers, 'LINI_FIELD_KEYS')] : [];
  });
  const liniCardinalityEvidence = liniEntityProbe.flatMap(item => {
    const pointers = allPointers(losses(item, 'lini').filter(row => row.code === 'LINI_CARDINALITY'));
    return pointers.length ? [itemEvidence(item, pointers, 'LINI_CARDINALITY')] : [];
  });
  const liniKeyAttempt = '|entity#n_0| "Account" [\n|cell#f_0| "id" .pk; "uuid"\n]';
  const liniCardinalityAttempt = '|entity#n_0| "Account" [\n|cell#f_0| "id"; "uuid"\n]\n|entity#n_1| "Event" [\n|cell#f_0| "id"; "uuid"\n]\nn_0 -> n_1 .one-to-many';
  const probes: Probe[] = [
    {
      id: 'dot-record-port-attachment', target: 'dot', profile: 'umf.visual.dot/1', mappingVersion: '0.3.0', nativeEngine: 'Graphviz', nativeVersion: '16.1.0',
      boundedClaim: 'The exact synthetic record-port source has Graphviz JSON tailport=out/headport=n and the SVG edge title retains those attachments.',
      result: 'Graphviz native ports are observable; the ordinary DOT adapter currently rejects this source with DOT_PORT rather than projecting a Visual field endpoint.',
      limitation: 'This proves one native port spelling and one mapping opportunity only. It does not qualify Visual field endpoint support or all DOT port forms.',
      sourceEvidence: [{itemId: null, sourcePath: 'scripts/native-dot-cohort.ts#portSource', sourceSha256: 'c83110ae581e3ceb3a7094d4a649a6cb363c9bcb7bcf78aa42fd278cb698ea76', pointers: ['/extensions/umf.visual/structure/references/*/from/field', '/extensions/umf.visual/structure/references/*/to/field'], reasonCode: 'DOT_PORT'}],
      nativeEvidence: {script: 'scripts/native-dot-cohort.ts', scriptSha256: 'a1b320d7abdb4fd7f29517aa63490c47152880638750ac752bb6523548bb200c', test: 'tests/interchange/dot-cohort.test.ts', testSha256: '0341a73e2833fc644db62bf86b7a4922088cef6675e649da0f5ba62a49bfd086', sourceSha256: 'c83110ae581e3ceb3a7094d4a649a6cb363c9bcb7bcf78aa42fd278cb698ea76', outputSha256: '3d7a8ceebc832819c73e602fe9e7d4b4c43791b53076cb6c752482b0032afe83'},
      attribution: 'mapping-candidate',
    },
    {
      id: 'dot-visual-role-status-not-inferred', target: 'dot', profile: 'umf.visual.dot/1', mappingVersion: '0.3.0', nativeEngine: 'Graphviz', nativeVersion: '16.1.0',
      boundedClaim: 'The pinned containers source retains Visual role/status losses while native shape/style edits are parsed as presentation and leave the Visual projection unchanged.',
      result: 'No role or status equivalence was established by the tested Graphviz shape/color/style attributes; those current losses remain ordinary-profile losses.',
      limitation: 'The tested presentation attributes do not prove that no other Graphviz construct could represent a role or status.',
      sourceEvidence: [itemEvidence(containers, allPointers(losses(containers, 'dot').filter(row => row.code === 'DOT_NODE_FIELD' && /\/(role|status)$/.test(row.path))), 'DOT_NODE_FIELD')],
      nativeEvidence: {script: 'scripts/native-dot-cohort.ts', scriptSha256: 'a1b320d7abdb4fd7f29517aa63490c47152880638750ac752bb6523548bb200c', test: 'tests/interchange/dot-cohort.test.ts', testSha256: '0341a73e2833fc644db62bf86b7a4922088cef6675e649da0f5ba62a49bfd086', sourceSha256: containers.sourceSha256},
      attribution: 'bounded-attempt-only',
    },
    {
      id: 'mermaid-identifying-relationship', target: 'mermaid', profile: 'umf.visual.mermaid/1', mappingVersion: '1.2.0', nativeEngine: 'Mermaid', nativeVersion: '12.2.0',
      boundedClaim: 'For the four pinned entity fixtures, Mermaid ER parses and renders relationships as IDENTIFYING; Visual 1.0 has no identifying property.',
      result: 'The distinction is native meaning without a corresponding Visual 1.0 field; the adapter reports MERMAID_IDENTIFICATION and does not infer it.',
      limitation: 'This is a model/profile boundary for Visual 1.0, not a claim that every Mermaid relationship property is impossible to map in a future model.',
      sourceEvidence: mermaidIdentification,
      nativeEvidence: {script: 'scripts/native-mermaid-er-probe.ts', scriptSha256: '47cddbdf81ec4fff1c9cc6a825e9a839b17d39288b1e6a4f81a534278cc9c00e', test: 'tests/interchange/mermaid-er-native-probe.test.ts', testSha256: '3252d358becff2b4e89fdaf76b8efac7a46a04ac6fc2343f94cb0cec5fbbada4', receipt: 'docs/helix/04-build/evidence/renderer-probes/mermaid-er-12.2.0.json', receiptSha256: '338fea34e84e62c50280af1eff9edb7151788ec663b98f9b1eba9277cc0a1a17', pin: {path: 'package.json', sha256: 'a890f5ad71f86ded778c49dd5fa39d0c82295a898338c86dacd48584483b55a9', version: '12.2.0'}},
      attribution: 'model-profile-boundary',
    },
    {
      id: 'mermaid-field-attached-er-endpoints', target: 'mermaid', profile: 'umf.visual.mermaid/1', mappingVersion: '1.2.0', nativeEngine: 'Mermaid', nativeVersion: '12.2.0',
      boundedClaim: 'The 15 field-attached references in the pinned tickets and workspace sources have exact paths; the ER source profile serializes entity-level relationships and does not attach a relationship endpoint to a field.',
      result: 'All 15 exact references remain explicit MERMAID_FIELD_REFERENCE losses; the ER profile cannot represent these endpoint attachments.',
      limitation: 'The qualification is limited to the 15 source references and the tested Mermaid 12.2.0 erDiagram subset.',
      sourceEvidence: mermaidFieldEvidence,
      nativeEvidence: {script: 'scripts/native-mermaid-er-probe.ts', scriptSha256: '47cddbdf81ec4fff1c9cc6a825e9a839b17d39288b1e6a4f81a534278cc9c00e', test: 'tests/interchange/mermaid-er-native-probe.test.ts', testSha256: '3252d358becff2b4e89fdaf76b8efac7a46a04ac6fc2343f94cb0cec5fbbada4', receipt: 'docs/helix/04-build/evidence/renderer-probes/mermaid-er-12.2.0.json', receiptSha256: '338fea34e84e62c50280af1eff9edb7151788ec663b98f9b1eba9277cc0a1a17', pin: {path: 'package.json', sha256: 'a890f5ad71f86ded778c49dd5fa39d0c82295a898338c86dacd48584483b55a9', version: '12.2.0'}},
      attribution: 'native-profile-limit',
    },
    {
      id: 'lini-key-and-cardinality-class-attempts', target: 'lini', profile: 'umf.visual.lini/1', mappingVersion: '0.3.0', nativeEngine: 'Lini', nativeVersion: '1.1.0',
      boundedClaim: 'The exact `.pk` field-class and `.one-to-many` link-class strings are rejected by pinned Lini 1.1.0 with R002 unknown-class diagnostics; the edited declared-field endpoint is accepted and read back.',
      result: 'The adapter continues to report LINI_FIELD_KEYS and LINI_CARDINALITY on the exact fixture pointers and does not infer either semantic from labels.',
      limitation: 'These two rejected class tokens are bounded attempts, not evidence that all Lini type/class syntax is incapable of representing key or cardinality semantics.',
      sourceEvidence: [
        {itemId: null, sourcePath: 'scripts/native-lini-entities-cohort.ts#keyAttempt', sourceSha256: sha(liniKeyAttempt), pointers: ['/extensions/umf.visual/structure/entities/*/fields/*/keys'], reasonCode: 'R002 unknown class `.pk`'},
        {itemId: null, sourcePath: 'scripts/native-lini-entities-cohort.ts#cardinalityAttempt', sourceSha256: sha(liniCardinalityAttempt), pointers: ['/extensions/umf.visual/structure/references/*/fromCardinality', '/extensions/umf.visual/structure/references/*/toCardinality'], reasonCode: 'R002 unknown class `.one-to-many`'},
        ...liniKeyEvidence, ...liniCardinalityEvidence,
      ],
      nativeEvidence: {script: 'scripts/native-lini-entities-cohort.ts', scriptSha256: 'fe978c10019841e2ddb351c40bd494fd341ccf813daefed2e0b6d5952d61207b', test: 'tests/interchange/lini-entities-native.test.ts', testSha256: '4e862225dab8c2283f463c1779eb98f1772b30790707477c499e4cc818163db2', receipt: 'docs/helix/04-build/evidence/renderer-probes/lini-entities-1.1.0.json', receiptSha256: 'e7d196f91c0db7da8493095fbf9840ed179b12ad864fdc91d4f325450fba3acf', pin: {path: 'spec/interchange/lini-runtime.json', sha256: 'ffcf1cb93a2a5e2e3325a5590a234550b476f5ea115bf185a9d96de88071f056', version: '1.1.0'}, sourceSha256: sha(liniKeyAttempt)},
      attribution: 'bounded-attempt-only',
    },
  ];
  const pairs = ledger.pairs;
  const emitted = pairs.filter(pair => pair.export.ok);
  const currentGroups = emitted.reduce((sum, pair) => sum + pair.lossGroups.length, 0);
  const currentRaw = Object.fromEntries((['dot', 'mermaid', 'lini'] as const).map(target => [target, emitted.filter(pair => pair.target === target).reduce((n, pair) => n + pair.rawDiagnostics.filter(diagnostic => diagnostic.loss).length, 0)])) as Record<TargetName, number>;
  if (JSON.stringify(currentRaw) !== JSON.stringify(emittedCounts)) throw new Error('Current catalog and native loss ledger differ; preserve raw diagnostic counts before reporting.');
  if (baselineCounts.dot !== 629 || baselineCounts.mermaid !== 792 || baselineCounts.lini !== 553) throw new Error('Planning catalog no longer matches the immutable original raw-loss baseline.');
  if (plannedTitleLosses !== 23 || emittedCounts.lini !== 530 || delta.lini !== -23) throw new Error('Current Lini title mapping loss delta differs from the qualified 23-incidence reduction.');
  return {
    schemaVersion: 1,
    policy: 'Probe observations are bounded to listed source hashes, profile versions, native versions, pointers and attempts. No family-wide absence claim is inferred. Raw ordinary diagnostics and maximal loss groups remain unchanged in the referenced ranked inventory; annotated variants are a separate population.',
    sourcePopulation: {itemCount: catalog.items.length, sourceHashCount: new Set(catalog.items.map(item => item.sourceSha256)).size, fixtureCount: catalog.items.filter(item => item.origin === 'fixture').length, canaryCount: catalog.items.filter(item => item.origin === 'canary').length, manifest},
    ordinaryLosses: {
      baselineSnapshot: {path: 'fixtures/interchange/progress/renderer-coverage-baseline.json', sha256: planningSha256, sourceSnapshotSha256: planning.baselineSnapshot.sha256, counts: baselineCounts},
      current: {profileVersions: expectedVersions, emittedRawDiagnosticCounts: emittedCounts, deltaFromPlanningSnapshot: delta,
        titleMapping: {target: 'lini', profile: 'umf.visual.lini/1', mappingVersion: '0.3.0', removedRawDiagnostics: 23, sourcePointer: '/extensions/umf.visual/title', evidence: 'Ordinary Lini 0.3.0 now maps the native outer group title; the initial planning snapshot had 23 LINI_TITLE raw incidences. This changes only the current ordinary Lini count and leaves historical baseline files untouched.'}},
      currentMaximalGroups: currentGroups,
    },
    annotatedProfiles: annotatedPopulation,
    probes,
    rawInventory: {pairCount: pairs.length, emittedPairCount: emitted.length, rawLossDiagnosticCount: emitted.reduce((sum, pair) => sum + pair.rawDiagnostics.filter(diagnostic => diagnostic.loss).length, 0), allAttemptRawLossDiagnosticCount: pairs.reduce((sum, pair) => sum + pair.rawDiagnostics.filter(diagnostic => diagnostic.loss).length, 0), maximalLossGroupCount: currentGroups, rankedRecordReference: 'scripts/catalog/loss-ledger-report.ts → .cache/loss-ledger-ranked.json'},
  };
}
