// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import flow from '../../fixtures/catalog/canary-flow.json';
import entities from '../../fixtures/catalog/canary-entities.json';
import meter from '../../fixtures/visual/forms/umf-ac-coverage.json';
import {buildFullProfileVariants, focusedFullProfilePreviewSource} from '../../scripts/catalog/full-profiles';
import {readDotProfile} from '../../src/interchange/dot/profile-syntax';
import {readLiniProfile} from '../../src/interchange/lini/profile-syntax';
import {getVisual} from '../../src/extensions/visual';
import {exportVisual} from '../../src';

test('full-profile catalogue candidates keep format history additive and await native receipts', () => {
  const rows = buildFullProfileVariants(flow);
  expect(rows.map(row => row.profileId)).toEqual([
    'umf.visual.dot.full/1', 'umf.visual.mermaid.full/1', 'umf.visual.lini.full/1',
  ]);
  for (const row of rows) {
    expect(row.result.status).toBe('supported');
    expect(row.result.ok).toBe(true);
    expect(typeof row.result.source).toBe('string');
    expect(row.result.source!.length).toBeGreaterThan(0);
    expect(row.result.identityMap.length).toBeGreaterThan(0);
    expect(row.coverage.length).toBeGreaterThan(0);
    expect(row.mappingVersion).toBe('0.1.0');
    expect(row.modelVersion).toBe('1.0.0');
    expect(row).not.toHaveProperty('render');
  }
});

test('full-profile approximations are distinct from diagnostic losses', () => {
  for (const document of [entities, meter]) {
    const rows = buildFullProfileVariants(document);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.result.status).toBe('supported');
      expect(row.result.diagnostics.every(diagnostic => !diagnostic.loss)).toBe(true);
      expect(row.approximations.every(approximation => typeof approximation.reason === 'string' && approximation.reason.length > 0)).toBe(true);
      expect(row.approximations.length > 0).toBe(row.representation.tier === 'primitive-fallback');
    }
  }
});

test('native-first routes reuse exact annotated bytes while fallbacks report record-tree coverage', () => {
  const documents = [flow, entities, meter];
  const rows = documents.flatMap(document => buildFullProfileVariants(document).map(row => ({document, row})));
  const native = rows.find(({row}) => row.representation.tier === 'native-profile');
  expect(native).toBeDefined();
  const nativeRow = native!.row;
  const nativeProfile = nativeRow.representation.sourceProfile;
  const nativeFormat = nativeRow.format;
  const nativeSource = exportVisual(native!.document, {format: nativeFormat, profile: nativeProfile as any, mode: 'strict'});
  expect(nativeRow.representation).toEqual({tier: 'native-profile', sourceProfile: nativeProfile, sourceMappingVersion: nativeFormat === 'lini' ? '0.2.0' : '0.1.0', coverageModel: 'native-concepts-and-annotations', wholeDocumentReadback: true});
  expect(nativeRow.result.source).toBe(nativeSource.text);
  expect(nativeRow.coverage).toEqual(nativeSource.coverage ?? []);
  expect(nativeRow.approximations).toEqual([]);
  const fallback = rows.find(({row}) => row.representation.tier === 'primitive-fallback')?.row;
  expect(fallback).toBeDefined();
  expect(fallback!.representation.sourceProfile).toBe(fallback!.profileId);
  expect(fallback!.representation.coverageModel).toBe('visible-record-tree');
  expect(fallback!.coverage.some(row => row.path === '/extensions/umf.visual/title')).toBe(true);
});

test('out-of-slice forms remain visible as explicit refusals without fabricated source', () => {
  const outsideSlice = structuredClone(flow) as any;
  outsideSlice.extensions['umf.visual'].kind = 'future-family';
  outsideSlice.extensions['umf.visual'].form = 'future-form';
  const rows = buildFullProfileVariants(outsideSlice);
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(row.result.status).toBe('unsupported');
    expect(row.result.ok).toBe(false);
    expect(row.result.source).toBeUndefined();
    expect(row.approximations).toEqual([]);
    expect(row.result.diagnostics.some(diagnostic => diagnostic.severity === 'error')).toBe(true);
  }
});

test('focused native views omit only checked renderer-specific metadata appendices', () => {
  const examples = {dot: meter, mermaid: flow, lini: entities} as const;
  for (const format of ['dot', 'mermaid', 'lini'] as const) {
    const row = buildFullProfileVariants(examples[format]).find(candidate => candidate.format === format)!;
    expect(row.representation.tier).toBe('primitive-fallback');
    const full = row.result.source!;
    const focused = focusedFullProfilePreviewSource(full, format, row.representation);
    expect(focused.startsWith(format === 'mermaid' ? '%% DISPLAY ONLY:' : '// DISPLAY ONLY:')).toBe(true);
    expect(focused).toContain(getVisual(examples[format] as any).title!);
    if (format === 'dot') {
      expect(focused).not.toContain('cluster_umf_full_additional');
      expect(readDotProfile(focused, {entities: true}).statements.length).toBeGreaterThan(0);
      expect(full).toContain('xlabel');
      expect(focused.slice(focused.indexOf('digraph'))).not.toContain('xlabel');
      expect(focused).toContain(getVisual(examples[format] as any).title!);
      expect(focused).toContain('generated field-name xlabels omitted');
    } else if (format === 'lini') {
      expect(focused).not.toContain('umf_full_additional');
      expect(readLiniProfile(focused)[0]?.id).toBe('umf_full_scene');
    } else {
      expect(focused).not.toContain('subgraph g_006100640064006900740069006f006e0061006c002d00700072006f0070006500720074006900650073');
      expect(focused).toContain('%% umf-full node');
    }
  }
  const fullLiniRow = buildFullProfileVariants(entities).find(row => row.format === 'lini')!;
  const fullLini = fullLiniRow.result.source!;
  const focusedLini = focusedFullProfilePreviewSource(fullLini, 'lini', fullLiniRow.representation);
  expect(fullLini).toContain('umf_full_edge_identities');
  expect(fullLini).toContain('umf_full_approximations');
  expect(focusedLini).not.toContain('umf_full_edge_identities');
  expect(focusedLini).not.toContain('umf_full_approximations');
  expect(focusedLini).toContain('DISPLAY ONLY: full-profile Additional properties, edge identity, and visual approximation appendices omitted');
  expect(focusedLini).toContain(getVisual(entities as any).title!);
});

test('focused native Lini full-profile view validates then omits only the identity table', () => {
  const row = buildFullProfileVariants(flow).find(candidate => candidate.format === 'lini')!;
  expect(row.representation.tier).toBe('native-profile');
  const full = row.result.source!;
  expect(full).toContain('|table#umf_identity| "UMF identities /1"');
  const focused = focusedFullProfilePreviewSource(full, 'lini', row.representation);
  expect(focused).not.toContain('umf_identity');
  expect(focused).toContain('|group#umf_graph|');
  expect(focused).toContain('|block#');
  expect(focused).toContain('->');
  // Focusing is a separate renderer-only string; the complete source stays byte-for-byte intact.
  expect(row.result.source).toBe(full);
  expect(full).toContain('|table#umf_identity| "UMF identities /1"');
});
