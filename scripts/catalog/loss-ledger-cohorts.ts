// SPDX-License-Identifier: MIT OR Apache-2.0
/** Additive ranking across ordinary exports, opt-in profiles and host plans. */
import type {CatalogItem, VisualCatalog} from './build';
import type {IntegrationCatalog, IntegrationTarget} from './integrations';
import type {FieldFamily, GapOwner, LossGroup, LossLedger} from './loss-ledger';
import type {InterchangeDiagnostic} from '../../src/interchange/types';

type Diagnostic = InterchangeDiagnostic;
type ProfileCoverage = {path: string; representation?: string; aspect?: string};
type SourceRef = {itemId: string | null; origin: string | null; sourcePath: string | null; sourceSha256: string | null};
type CohortEvidence = SourceRef & {rawDiagnosticIndexes: number[]; rawLossIncidences: number; targetRecordId?: string};
export type RankedLossCandidate = {
  population: 'ordinary' | 'annotated' | 'host-profile' | 'source-projection';
  target: string;
  profile: string;
  family: FieldFamily | 'source-projection';
  gapOwner: GapOwner;
  path: string;
  reasonCode: string;
  reason: string;
  affectedSourceCount: number;
  rawLossIncidences: number;
  evidence: CohortEvidence[];
  disposition: 'qualified-native-mapping' | 'qualified-additional-annotation' | 'profile-candidate' | 'host-probe' | 'unknown';
  dispositionEvidence: string;
  nextProbe: string;
  owner: string;
};
export type RankedLossInventory = {
  schemaVersion: 1;
  policy: {sourcePopulation: string; ranking: string; rawEvidence: string; attribution: string};
  sourceManifest: SourceRef[];
  populations: {
    ordinary: {pairCount: number; emittedPairCount: number; rawLossDiagnosticCount: number; allAttemptRawLossDiagnosticCount: number; maximalLossGroupCount: number; candidates: RankedLossCandidate[]; records: unknown[]};
    annotated: {profilePairCount: number; emittedPairCount: number; rawLossDiagnosticCount: number; candidates: RankedLossCandidate[]; records: unknown[]};
    hosts: {caseTargetCount: number; plannedOrReadbackCount: number; rawLossCount: number; candidates: RankedLossCandidate[]; records: unknown[]; sourceProjection: {caseCount: number; candidates: RankedLossCandidate[]; records: unknown[]}};
  };
};

const escapePart = (value: string) => value.replace(/~/g, '~0').replace(/\//g, '~1');
function pointerParts(path: string): string[] {return path.split('/').slice(1).map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));}
function pointer(parts: string[]): string {return parts.length ? '/' + parts.map(escapePart).join('/') : '';}
function ancestor(parent: string, child: string): boolean {
  if (parent === child) return true;
  const a = pointerParts(parent), b = pointerParts(child);
  return a.length < b.length && a.every((part, index) => part === b[index]);
}
function familyFor(path: string, diagnostic?: Diagnostic): FieldFamily {
  const parts = pointerParts(path);
  if (parts[0] !== 'extensions' || parts[1] !== 'umf.visual') {
    if (['extensions', 'vocabularies', 'modules', 'umf', 'id'].includes(parts[0] ?? '')) return 'envelope';
    return 'unknown';
  }
  if (parts.includes('evidence') || parts[2] === 'source' || parts[2] === 'evidence') return 'provenance';
  if (['question', 'takeaway', 'audience', 'omissions', 'steps'].includes(parts[2] ?? '')) return 'application';
  if (parts[2] === 'title') return 'presentation';
  if (diagnostic?.code === 'INTERCHANGE_UNKNOWN_VISUAL' || parts[2] === undefined) return 'unknown';
  if (parts.some(part => ['role', 'status', 'emphasis'].includes(part))) return 'application';
  return 'diagram';
}
/** Attribution intentionally matches the ledger's receipt-text-only conservative policy. */
function gapOwnerFor(diagnostic: Diagnostic): GapOwner {
  const text = `${diagnostic.code} ${diagnostic.message}`.toLowerCase();
  if (/native (?:format|syntax|profile) (?:has|provides) no|has no (?:native )?(?:field|syntax|construct|semantics)|no (?:native )?(?:field|syntax|construct|semantics)/.test(text)) return 'native-capability';
  if (/adapter (?:does not|cannot)|mapping (?:does not|cannot)|serializer (?:does not|cannot)/.test(text)) return 'mapping';
  return 'unknown';
}
function diagnosticGroups(diagnostics: Diagnostic[]): LossGroup[] {
  const records = diagnostics.flatMap((diagnostic, index) => diagnostic.loss ? [{diagnostic, index, family: familyFor(diagnostic.path, diagnostic), owner: gapOwnerFor(diagnostic)}] : []);
  const sameReason = (a: typeof records[number], b: typeof records[number]) => a.family === b.family && a.owner === b.owner && a.diagnostic.code === b.diagnostic.code && a.diagnostic.message === b.diagnostic.message;
  return records.filter(record => !records.some(other => other !== record && sameReason(record, other) && other.diagnostic.path !== record.diagnostic.path && ancestor(other.diagnostic.path, record.diagnostic.path)))
    .map(seed => {
      const members = records.filter(item => sameReason(seed, item) && ancestor(seed.diagnostic.path, item.diagnostic.path));
      return {path: seed.diagnostic.path, family: seed.family, gapOwner: seed.owner, rawDiagnosticIndexes: members.map(item => item.index).sort((a, b) => a - b), descendantPaths: [...new Set(members.map(item => item.diagnostic.path).filter(path => path !== seed.diagnostic.path))].sort(), reasonCode: seed.diagnostic.code, reason: seed.diagnostic.message};
    }).sort((a, b) => a.path.localeCompare(b.path) || a.reasonCode.localeCompare(b.reasonCode) || a.reason.localeCompare(b.reason));
}
function safeSource(item: CatalogItem): SourceRef {return {itemId: item.id, origin: item.origin, sourcePath: item.sourcePath, sourceSha256: item.sourceSha256};}
function qualifiedAlternatives(item: CatalogItem, target: string, path: string): {profile: string; representation: 'native-concept' | 'profile-annotation'}[] {
  return (item.profileVariants ?? []).filter(variant => variant.format === target && variant.result.ok && variant.result.status === 'supported' && variant.result.render?.ok === true && variant.coverage.some((entry: ProfileCoverage) => entry.path === path && (entry.representation === 'native-concept' || entry.representation === 'profile-annotation')))
    .map(variant => ({profile: variant.profileId, representation: (variant.coverage.find((entry: ProfileCoverage) => entry.path === path)!.representation as 'native-concept' | 'profile-annotation')}));
}
function rank(candidates: RankedLossCandidate[]): RankedLossCandidate[] {
  const dispositionRank = (value: RankedLossCandidate['disposition']) => value === 'qualified-native-mapping' || value === 'qualified-additional-annotation' ? 0 : value === 'host-probe' ? 1 : value === 'profile-candidate' ? 2 : 3;
  return candidates.sort((a, b) => dispositionRank(a.disposition) - dispositionRank(b.disposition) || b.affectedSourceCount - a.affectedSourceCount || b.rawLossIncidences - a.rawLossIncidences || a.path.localeCompare(b.path) || a.target.localeCompare(b.target) || a.reasonCode.localeCompare(b.reasonCode));
}
function aggregate(candidates: RankedLossCandidate[]): RankedLossCandidate[] {
  const result = new Map<string, RankedLossCandidate>();
  for (const candidate of candidates) {
    const key = [candidate.population, candidate.target, candidate.profile, candidate.family, candidate.gapOwner, candidate.path, candidate.reasonCode, candidate.reason].join('\0');
    const existing = result.get(key);
    if (!existing) {result.set(key, {...candidate, evidence: [...candidate.evidence]}); continue;}
    existing.rawLossIncidences += candidate.rawLossIncidences;
    existing.evidence.push(...candidate.evidence);
    const profiles = new Set([existing.dispositionEvidence, candidate.dispositionEvidence]);
    if (existing.disposition === 'unknown' && candidate.disposition !== 'unknown') {
      existing.disposition = candidate.disposition;
      existing.dispositionEvidence = candidate.dispositionEvidence;
      existing.nextProbe = candidate.nextProbe;
      existing.owner = candidate.owner;
    } else if (existing.disposition === candidate.disposition && existing.disposition !== 'unknown' && !profiles.has(existing.dispositionEvidence)) {
      existing.dispositionEvidence += ' ' + candidate.dispositionEvidence;
    }
  }
  for (const candidate of result.values()) candidate.affectedSourceCount = new Set(candidate.evidence.map(row => row.sourceSha256).filter((sha): sha is string => !!sha)).size;
  return [...result.values()];
}
function groupCandidates(args: {population: RankedLossCandidate['population']; target: string; profile: string; source: SourceRef; groups: LossGroup[]; item?: CatalogItem; diagnostics: Diagnostic[]; ownerLabel: string; nextProbe: string}): RankedLossCandidate[] {
  const map = new Map<string, RankedLossCandidate>();
  for (const group of args.groups) {
    const key = [args.population, args.target, args.profile, group.family, group.gapOwner, group.path, group.reasonCode, group.reason].join('\0');
    const current = map.get(key) ?? {
      population: args.population, target: args.target, profile: args.profile, family: group.family, gapOwner: group.gapOwner,
      path: group.path, reasonCode: group.reasonCode, reason: group.reason, affectedSourceCount: 0, rawLossIncidences: 0, evidence: [],
      disposition: 'unknown' as const, dispositionEvidence: 'No qualified field-level native or annotation readback establishes a mapping for this pointer.',
      nextProbe: args.nextProbe, owner: args.ownerLabel,
    };
    const evidenceIndexes = group.rawDiagnosticIndexes;
    current.rawLossIncidences += evidenceIndexes.length;
    current.evidence.push({...args.source, rawDiagnosticIndexes: [...evidenceIndexes], rawLossIncidences: evidenceIndexes.length});
    const alternatives = args.item ? qualifiedAlternatives(args.item, args.target, group.path) : [];
    const alternative = alternatives[0];
    if (alternative) {
      current.disposition = 'profile-candidate';
      current.dispositionEvidence = `Opt-in profile ${alternative.profile} emitted strict output, rendered natively and declares ${alternative.representation} coverage for this exact pointer. This remains a candidate until an independent edited native readback proves the field.`;
      current.nextProbe = `Verify ${alternative.profile} on the exact field with independent native parse and edited readback before changing its status or removing any ordinary-profile loss.`;
    }
    map.set(key, current);
  }
  for (const item of map.values()) item.affectedSourceCount = new Set(item.evidence.map(row => row.sourceSha256).filter((sha): sha is string => !!sha)).size;
  return [...map.values()];
}
function recordsByDiagnostic(diagnostics: Diagnostic[], source: SourceRef, target: string, profile: string, population: RankedLossCandidate['population'], item?: CatalogItem, owner = 'unassigned'): RankedLossCandidate[] {
  return groupCandidates({population, target, profile, source, groups: diagnosticGroups(diagnostics), item, diagnostics, ownerLabel: owner,
    nextProbe: 'Run a pinned native-engine positive/negative probe and exact edited readback for this maximal pointer subtree before assigning adapter, model or native-limit ownership.'});
}

export function createRankedLossInventory(catalog: VisualCatalog, nativeLedger: LossLedger, integrations: IntegrationCatalog): RankedLossInventory {
  const items = new Map(catalog.items.map(item => [item.id, item]));
  const sourceManifest = catalog.items.map(safeSource);
  const ordinaryCandidates: RankedLossCandidate[] = [];
  const ordinaryRecords = nativeLedger.pairs.map(pair => {
    const item = items.get(pair.itemId);
    if (!item || item.sourcePath !== pair.sourcePath || item.sourceSha256 !== pair.sourceSha256) throw new Error(`Loss ledger source identity mismatch for ${pair.itemId}/${pair.target}.`);
    if (pair.export.ok) ordinaryCandidates.push(...groupCandidates({population: 'ordinary', target: pair.target, profile: `${pair.adapterProfile.name}@${pair.adapterProfile.version}`, source: safeSource(item), groups: pair.lossGroups, item, diagnostics: pair.rawDiagnostics,
      ownerLabel: pair.target === 'dot' ? 'P10-D' : pair.target === 'mermaid' ? 'P10-M' : 'P10-L',
      nextProbe: pair.target === 'dot' ? 'Compare native Graphviz AST, rendered geometry and edited parse for this pointer; keep profile annotations distinct.' : pair.target === 'mermaid' ? 'Probe the corresponding Mermaid 12.2 construct in renderer and parser, including an edit; refuse invented meaning.' : 'Probe the Lini 1.1.0 syntax and runtime for a visible typed slot and edited roundtrip; do not hide loss in a caption.'}));
    return {...pair}; // Exact source hash, raw diagnostics and original group indices remain intact.
  });

  const annotatedCandidates: RankedLossCandidate[] = [];
  const annotatedRecords = catalog.items.flatMap(item => (item.profileVariants ?? []).map(variant => {
    const diagnostics = variant.result.diagnostics as Diagnostic[];
    if (variant.result.ok) annotatedCandidates.push(...recordsByDiagnostic(diagnostics, safeSource(item), variant.format, `${variant.profileId}@${variant.mappingVersion}`, 'annotated', item,
      variant.format === 'dot' ? 'P9/profile-selection' : 'P11-L/P11-D'));
    return {source: safeSource(item), format: variant.format, profileId: variant.profileId, mappingVersion: variant.mappingVersion, modelVersion: variant.modelVersion,
      status: variant.result.status, ok: variant.result.ok, rawDiagnostics: diagnostics, coverage: variant.coverage, nativeRender: variant.result.render ?? null,
      focusedNativeRender: variant.diagramRender ?? null, selectedForRelease: item.preferredRelease?.format === variant.format && item.preferredRelease.profileId === variant.profileId};
  }));

  const hostCandidates: RankedLossCandidate[] = [], projectionCandidates: RankedLossCandidate[] = [];
  const hostRecords: unknown[] = [], projectionRecords: unknown[] = [];
  for (const item of integrations.cases) {
    const source: SourceRef = {itemId: item.id, origin: 'integration-case', sourcePath: item.commonPath, sourceSha256: item.commonSha256};
    for (const [target, targetResult] of Object.entries(item.targets) as [string, IntegrationTarget][]) {
      const diagnostics = targetResult.diagnostics as Diagnostic[];
      const losses = targetResult.losses as {path: string; code: string; family: string; representation: string; message: string}[];
      if (losses.length) hostCandidates.push(...lossesAsCandidates(losses, source, target, targetResult.profile, targetResult.evidenceKind, diagnostics));
      hostRecords.push({source, target, profile: targetResult.profile, status: targetResult.status, evidenceKind: targetResult.evidenceKind, nativeHostVerified: targetResult.nativeHostVerified, diagnostics, losses});
    }
    if (item.originalProjectionGaps.length) {
      const groups: LossGroup[] = item.originalProjectionGaps.map((gap: any, index: number) => ({path: String(gap.path ?? `/projection/${index}`), family: 'unknown', gapOwner: 'unknown', rawDiagnosticIndexes: [index], descendantPaths: [], reasonCode: String(gap.gap ?? 'SOURCE_PROJECTION_GAP'), reason: String(gap.meaning ?? 'Source-only meaning has no authored common projection.')}));
      projectionCandidates.push(...groupCandidates({population: 'source-projection', target: 'common-projection', profile: 'authored-projection', source, groups, item: undefined, diagnostics: [], ownerLabel: 'projection-owner-unassigned', nextProbe: 'Decide whether a truthful common meaning can be authored; do not create a common node/edge from opaque source evidence.'}));
      projectionRecords.push({source, rawGaps: item.originalProjectionGaps});
    }
  }
  const liveRecords = integrations.hostConformance.map(proof => ({...proof}));
  const hostByPair = hostRecords as {source: SourceRef; target: string; profile: string; status: string; evidenceKind: string; nativeHostVerified: boolean; diagnostics: Diagnostic[]; losses: any[]}[];
  for (const proof of integrations.hostConformance) {
    const paths = Array.isArray((proof.scope as any)?.semanticEditPaths) ? (proof.scope as any).semanticEditPaths as string[] : [];
    if (!paths.length) continue;
    for (const path of paths) {
      const matching = hostByPair.find(row => row.target === proof.target && row.profile === proof.profile && row.source.sourceSha256 === proof.source.sha256);
      if (!matching) continue;
      const probe: LossGroup = {path, family: familyFor(path), gapOwner: 'unknown', rawDiagnosticIndexes: [], descendantPaths: [], reasonCode: 'HOST_SEMANTIC_EDIT_WITNESS', reason: 'Host receipt reports an actual semantic edit and adapter readback at this exact source path.'};
      hostCandidates.push({population: 'host-profile', target: proof.target, profile: proof.profile, family: probe.family, gapOwner: 'unknown', path, reasonCode: probe.reasonCode, reason: probe.reason,
        affectedSourceCount: 1, rawLossIncidences: 0, evidence: [{itemId: proof.matchedCaseId, origin: 'host-conformance', sourcePath: proof.source.path, sourceSha256: proof.source.sha256, rawDiagnosticIndexes: [], rawLossIncidences: 0, targetRecordId: proof.id}],
        disposition: 'host-probe', dispositionEvidence: `Recorded host receipt ${proof.id} documents an actual semantic edit and readback at this path; this does not clear losses in other formats or profiles.`,
        nextProbe: 'Bind this exact host artifact/revision and repeat a supported edit/import/preserving-update/reopen cycle for the same source hash.', owner: 'P12-P/G/M'});
    }
  }
  const rankAndCount = (records: unknown[], candidates: RankedLossCandidate[], rawCount: (record: any) => number) => ({candidates: rank(aggregate(candidates)), raw: records.reduce<number>((total, record) => total + rawCount(record), 0)});
  const ordinaryRanked = rankAndCount(ordinaryRecords, ordinaryCandidates, record => (record.rawDiagnostics as Diagnostic[]).filter(d => d.loss).length);
  const annotatedRanked = rankAndCount(annotatedRecords, annotatedCandidates, record => (record.rawDiagnostics as Diagnostic[]).filter(d => d.loss).length);
  const hostRanked = rankAndCount(hostRecords, hostCandidates, record => (record.losses as unknown[]).length);
  return {
    schemaVersion: 1,
    policy: {
      sourcePopulation: '53 exact item IDs/source hashes are the inventory boundary; 50 original fixtures and three catalog canaries remain distinguishable.',
      ranking: 'Rank maximal pointer subtrees by qualified fixability first, then distinct affected source hashes, then raw loss incidences. Every count is population/profile scoped.',
      rawEvidence: 'Ordinary diagnostics and lossGroups are copied unchanged; variant diagnostics/coverage, host diagnostics/losses and original source-projection gaps are retained in separate records.',
      attribution: 'Only a qualified alternate-profile coverage result or an actual exact-path host receipt creates a positive disposition. Otherwise gapOwner remains the ledger value/unknown and the next probe is explicit.',
    },
    sourceManifest,
    populations: {
      ordinary: {pairCount: ordinaryRecords.length, emittedPairCount: nativeLedger.pairs.filter(pair => pair.export.ok).length,
        rawLossDiagnosticCount: nativeLedger.pairs.filter(pair => pair.export.ok).reduce((total, pair) => total + pair.rawDiagnostics.filter(diagnostic => diagnostic.loss).length, 0),
        allAttemptRawLossDiagnosticCount: ordinaryRanked.raw,
        maximalLossGroupCount: nativeLedger.pairs.filter(pair => pair.export.ok).reduce((n, pair) => n + pair.lossGroups.length, 0), candidates: ordinaryRanked.candidates, records: ordinaryRecords},
      annotated: {profilePairCount: annotatedRecords.length, emittedPairCount: annotatedRecords.filter((record: any) => record.ok).length, rawLossDiagnosticCount: annotatedRanked.raw, candidates: annotatedRanked.candidates, records: annotatedRecords},
      hosts: {caseTargetCount: hostRecords.length, plannedOrReadbackCount: hostRecords.filter((record: any) => record.status === 'planned' || record.status === 'format-readback').length, rawLossCount: hostRanked.raw,
        candidates: hostRanked.candidates, records: [...hostRecords, ...liveRecords], sourceProjection: {caseCount: projectionRecords.length, candidates: rank(projectionCandidates), records: projectionRecords}},
    },
  };
}

function lossesAsCandidates(losses: {path: string; code: string; family: string; representation: string; message: string}[], source: SourceRef, target: string, profile: string, evidenceKind: string, diagnostics: Diagnostic[]): RankedLossCandidate[] {
  const grouped = new Map<string, {loss: typeof losses[number]; indexes: number[]; count: number}>();
  for (const loss of losses) {
    const key = [loss.path, loss.code, loss.family, loss.representation, loss.message].join('\0');
    const entry = grouped.get(key) ?? {loss, indexes: [], count: 0}; entry.count++; grouped.set(key, entry);
  }
  return [...grouped.values()].map(({loss, count}) => ({population: 'host-profile', target, profile, family: familyFor(loss.path), gapOwner: 'unknown', path: loss.path, reasonCode: loss.code, reason: loss.message,
    affectedSourceCount: source.sourceSha256 ? 1 : 0, rawLossIncidences: count, evidence: [{...source, rawDiagnosticIndexes: [], rawLossIncidences: count}], disposition: 'unknown',
    dispositionEvidence: `Target plan classifies the field as ${loss.family}/${loss.representation}; ${evidenceKind} is not a live-host semantic edit witness.`,
    nextProbe: 'Review the exact host field projection and perform a native edit/readback cycle; a plan or source companion is not semantic coverage.', owner: `P12-${target.toUpperCase()}`}));
}
