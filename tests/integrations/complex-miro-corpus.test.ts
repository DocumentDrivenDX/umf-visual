// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {getVisual, inspectVisual, type Visual} from '../../src/extensions/visual';
import type {Document} from '@umf/core';

const root = 'fixtures/integrations/complex-miro';
const manifest = JSON.parse(readFileSync(`${root}/manifest.json`, 'utf8')) as CorpusManifest;
const nativeSchema = JSON.parse(readFileSync(`${root}/native-witness.schema.json`, 'utf8')) as Record<string, unknown>;

type Loss = {path: string; meaning: string; gap: string};
type CorpusCase = {
  id: string; title: string; commonVisualPath: string | null; nativeWitnessPath: string;
  commonProjection: 'partial-explicit-projection' | 'complete-topology-projection' | 'no-common-projection';
  losses: Loss[];
};
type CorpusManifest = {format: string; authorship: string; purpose: string; commonVisualSchema: string; nativeWitnessSchema: string; cases: CorpusCase[]};
type WitnessItem = {id: string; kind: string; from?: string; to?: string; parentId?: string; members?: string[]; memberIds?: string[]; geometry?: {x: number; y: number; width: number; height: number}; controlPoints?: {x: number; y: number}[]; attachment?: {from: string; to: string}; route?: string; opaquePayload?: {encoding: string; data: string}; [key: string]: unknown};
type Witness = {format: string; authorship: string; caseId: string; scope: string; items: WitnessItem[]; notes: string[]};
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const witness = (entry: CorpusCase) => readJson<Witness>(`${root}/${entry.nativeWitnessPath}`);
const common = (entry: CorpusCase) => entry.commonVisualPath ? readJson<Document>(`${root}/${entry.commonVisualPath}`) : undefined;

function assertWitnessShape(value: Witness, expectedId: string): void {
  expect(value.format).toBe('umf.visual.miro.synthetic-witness/1');
  expect(value.authorship).toBe('synthetic-fixture');
  expect(value.caseId).toBe(expectedId);
  expect(value.scope).toContain('not a Miro API capture');
  expect(value.items.length).toBeGreaterThan(0);
  const ids = new Set<string>();
  for (const item of value.items) {
    expect(item.id).toMatch(/^syn-[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(ids.has(item.id), `duplicate synthetic item id ${item.id}`).toBe(false);
    ids.add(item.id);
    if (['node', 'group', 'frame', 'free-text', 'opaque-stencil'].includes(item.kind)) {
      expect(item.geometry).toBeDefined();
      expect(item.geometry!.width).toBeGreaterThan(0);
      expect(item.geometry!.height).toBeGreaterThan(0);
    }
  }
  for (const item of value.items) {
    if (item.parentId) expect(ids.has(item.parentId), `${item.id} parent exists`).toBe(true);
    if (item.members || item.memberIds) for (const id of item.members ?? item.memberIds ?? []) expect(ids.has(id), `${item.id} member ${id} exists`).toBe(true);
    switch (item.kind) {
      case 'node':
        expect(item.label).toBeString();
        expect(item.symbol).toMatch(/^synthetic\.symbol\./);
        break;
      case 'connector':
        expect(ids.has(item.from!)).toBe(true);
        expect(ids.has(item.to!)).toBe(true);
        expect(item.route).toMatch(/^(straight|curved)$/);
        expect(item.attachment).toEqual(expect.objectContaining({from: expect.any(String), to: expect.any(String)}));
        if (item.route === 'curved') expect(item.controlPoints!.length).toBeGreaterThanOrEqual(2);
        break;
      case 'group':
      case 'frame':
        expect(item.label ?? item.title).toBeString();
        expect((item.members ?? item.memberIds)!.length).toBeGreaterThan(0);
        break;
      case 'free-text':
        expect(item.text).toBeString();
        break;
      case 'opaque-stencil':
        expect(item.symbolToken).toMatch(/^synthetic\.opaque\./);
        expect(item.opaquePayload?.encoding).toBe('base64');
        expect(Buffer.from(item.opaquePayload!.data, 'base64').length).toBeGreaterThan(0);
        break;
      default:
        throw new Error(`unrecognized witness item kind: ${item.kind}`);
    }
  }
  expect(value.notes.length).toBeGreaterThan(0);
}

test('complex Miro corpus is synthetic, sanitized and has the six reusable witnesses', () => {
  expect(manifest.format).toBe('umf.visual.miro.synthetic-corpus/1');
  expect(manifest.authorship).toBe('synthetic');
  expect(manifest.purpose).toContain('not captures of Miro boards');
  expect(manifest.commonVisualSchema).toBe('spec/extensions/visual/schema.json');
  expect(manifest.nativeWitnessSchema).toBe('native-witness.schema.json');
  expect(nativeSchema.$id).toBe('urn:umf:visual:miro:synthetic-witness:1');
  expect(manifest.cases.map(entry => entry.id)).toEqual([
    'nested-environments', 'process-documents-store', 'network-16x24',
    'frames-headings-annotations', 'curved-caption-cross-boundary', 'opaque-stencils'
  ]);
  for (const entry of manifest.cases) {
    expect(entry.losses.length).toBeGreaterThan(0);
    const item = witness(entry);
    assertWitnessShape(item, entry.id);
    expect(item.items.some(row => /private|company|customer|production/i.test(row.id))).toBe(false);
  }
});

test('common projections validate as real UMF Visual documents with explicit version scope', () => {
  for (const entry of manifest.cases) {
    const document = common(entry);
    if (!document) {
      expect(entry.id).toBe('opaque-stencils');
      expect(entry.commonProjection).toBe('no-common-projection');
      continue;
    }
    const result = inspectVisual(document);
    expect(result.valid, `${entry.id}: ${JSON.stringify(result.diagnostics)}`).toBe(true);
    expect(result.complete, `${entry.id}: ${JSON.stringify(result.diagnostics)}`).toBe(true);
    const visual = getVisual(document) as Visual;
    const version = document.vocabularies?.['umf.visual']?.version;
    if (entry.id === 'network-16x24') {
      expect(version).toBe('1.1.0');
      expect(visual.nodes).toHaveLength(16);
      expect(visual.edges).toHaveLength(24);
      expect(entry.commonProjection).toBe('complete-topology-projection');
    } else {
      expect(version).toBe('1.0.0');
      expect(entry.commonProjection).toBe('partial-explicit-projection');
    }
  }
});

test('synthetic details remain separate from asserted shared-model meaning', () => {
  const byId = new Map(manifest.cases.map(entry => [entry.id, entry]));
  const nested = witness(byId.get('nested-environments')!);
  expect(nested.items.filter(item => item.kind === 'node' && item.parentId)).toHaveLength(2);
  expect(byId.get('nested-environments')!.losses.some(loss => /semantic, deployment, or presentation/.test(loss.gap))).toBe(true);

  const frames = witness(byId.get('frames-headings-annotations')!);
  expect(frames.items.filter(item => item.kind === 'frame')).toHaveLength(2);
  expect(frames.items.filter(item => item.kind === 'free-text')).toHaveLength(2);
  expect(frames.items.filter(item => item.kind === 'node')).toHaveLength(4);
  const commonFrames = common(byId.get('frames-headings-annotations')!)!;
  expect((commonFrames.extensions!['umf.visual'] as Visual).title).not.toBe('Request handling');
  expect((commonFrames.extensions!['umf.visual'] as Visual).title).not.toBe('Persistence');

  const curved = witness(byId.get('curved-caption-cross-boundary')!);
  const curvedConnector = curved.items.find(item => item.kind === 'connector' && item.route === 'curved')!;
  expect(curvedConnector.controlPoints).toHaveLength(2);
  expect(curvedConnector.attachment).toEqual({from: 'east-port', to: 'west-port'});

  const opaqueEntry = byId.get('opaque-stencils')!;
  expect(common(opaqueEntry)).toBeUndefined();
  const opaque = witness(opaqueEntry).items.filter(item => item.kind === 'opaque-stencil');
  expect(opaque).toHaveLength(2);
  expect(opaque.every(item => typeof item.symbolToken === 'string' && item.opaquePayload)).toBe(true);

  const dense = witness(byId.get('network-16x24')!);
  const denseNodes = dense.items.filter(item => item.kind === 'node');
  const denseEdges = dense.items.filter(item => item.kind === 'connector');
  expect(denseNodes).toHaveLength(16);
  expect(denseEdges).toHaveLength(24);
  const reached = new Set([denseNodes[0]!.id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const edge of denseEdges) {
      if (reached.has(edge.from!) && !reached.has(edge.to!)) { reached.add(edge.to!); changed = true; }
      if (reached.has(edge.to!) && !reached.has(edge.from!)) { reached.add(edge.from!); changed = true; }
    }
  }
  expect(reached.size).toBe(16);
});
