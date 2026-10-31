// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe, expect, test} from 'bun:test';
import {createCatalogData, type CatalogItem, type VisualCatalog} from '../../scripts/catalog/build';
import {createLossLedger, type HistoricalPair} from '../../scripts/catalog/loss-ledger';
import type {InterchangeDiagnostic} from '../../src/interchange';

const diagnostic = (path: string, code = 'INTERCHANGE_UNREPRESENTED_FIELD', message = 'Field is outside this projection.'): InterchangeDiagnostic => ({
  code, path, message, severity: 'warning', loss: true,
});

function syntheticCatalog(diagnostics: InterchangeDiagnostic[]): VisualCatalog {
  const item = {
    id: 'item', title: 'Item', kind: 'flow', form: 'network', question: 'What happens?', origin: 'fixture',
    sourcePath: 'fixtures/visual/forms/item.json', sourceSha256: 'a'.repeat(64),
    document: {umf: '0.10.0', id: 'doc', vocabularies: {'umf.visual': {version: '1.0.0'}}, extensions: {'umf.visual': {
      id: 'v', kind: 'flow', form: 'network', question: 'What happens?',
      source: {path: 'source.md'},
      nodes: [{id: 'n1', label: 'One', role: 'actor', evidence: [{path: 'proof.md'}]}, {id: 'n2', label: 'Two', role: 'store'}],
    }}},
    targets: Object.fromEntries(['dot', 'mermaid', 'lini'].map(format => [format, {
      status: 'reported-loss', ok: true, source: 'native source', diagnostics: structuredClone(diagnostics), identityMap: [],
    }])),
  } as unknown as CatalogItem;
  return {
    schemaVersion: 1,
    capabilities: ['dot', 'mermaid', 'lini'].map(format => ({format, profile: `umf.visual.${format}/1`, version: '1.0.0', subset: 'test subset', directions: ['export']})),
    language: {schema: {sourcePath: 'spec/extensions/visual/schema.json', sourceSha256: 'b'.repeat(64), schema: {$id: 'urn:umf:visual:1.1.0'}}, forms: {sourcePath: 'src/extensions/visual/index.ts', sourceSha256: 'c'.repeat(64), kinds: []}},
    items: [item],
  } as unknown as VisualCatalog;
}

describe('catalog loss ledger', () => {
  // @covers US-095-AC1, US-095-AC2: one ledger record is created for every current example/target pair with the exact source receipt.
  test('retains all 159 corpus pairs, hashes, native evidence, and raw export diagnostics', async () => {
    const catalog = await createCatalogData();
    const ledger = createLossLedger(catalog);
    expect(ledger.schemaVersion).toBe(2);
    expect(ledger.pairs).toHaveLength(159);
    expect(new Set(ledger.pairs.map(pair => pair.sourceSha256))).toEqual(new Set(catalog.items.map(item => item.sourceSha256)));
    for (const item of catalog.items) for (const format of ['dot', 'mermaid', 'lini'] as const) {
      const pair = ledger.pairs.find(candidate => candidate.itemId === item.id && candidate.target === format)!;
      expect(pair.sourcePath).toBe(item.sourcePath);
      expect(pair.sourceSha256).toBe(item.sourceSha256);
      expect(pair.modelVersion).toBe((item.document as any).vocabularies?.['umf.visual']?.version ?? 'unknown');
      expect(pair.rawDiagnostics).toEqual(item.targets[format].diagnostics);
      expect(pair.export).toEqual({status: item.targets[format].status, ok: item.targets[format].ok, ...(item.targets[format].source === undefined ? {} : {source: item.targets[format].source})});
      expect(pair.lossGroups.flatMap(group => group.rawDiagnosticIndexes).every(index => item.targets[format].diagnostics[index]?.loss)).toBe(true);
    }
  });

  // @covers US-095-AC7: paths are segmented and only same-reason omissions normalize into a shared subtree group.
  test('groups only same-reason descendants and never mistakes textual prefixes for path ancestry', () => {
    const root = '/extensions/umf.visual/nodes/1';
    const rows = [
      diagnostic(root),
      diagnostic(`${root}/label`),
      diagnostic('/extensions/umf.visual/nodes/10/role'),
      diagnostic(`${root}/0/status`, 'DOT_NODE_FIELD', 'DOT export does not represent node status.'),
    ];
    const ledger = createLossLedger(syntheticCatalog(rows));
    const groups = ledger.pairs[0]!.lossGroups;
    const nodeRoot = groups.find(group => group.path === root)!;
    expect(nodeRoot.rawDiagnosticIndexes).toEqual([0, 1]);
    expect(nodeRoot.descendantPaths).toContain(`${root}/label`);
    expect(groups.some(group => group.path === '/extensions/umf.visual/nodes/10/role')).toBe(true);
    expect(groups.some(group => group.path === `${root}/0/status` && group.reasonCode === 'DOT_NODE_FIELD')).toBe(true);
    expect(groups).toHaveLength(3);
  });

  // @covers US-095-AC2, US-095-AC7: refused exports remain visible and a previously emitted source is never recast as newly covered.
  test('preserves refusal evidence and distinguishes historical emitted/refused pairs', () => {
    const catalog = syntheticCatalog([{
      code: 'DOT_UNSUPPORTED_VISUAL', path: '/extensions/umf.visual', message: 'Unsupported visual form.', severity: 'error', loss: false,
    }]);
    const item = catalog.items[0]!;
    item.targets.dot = {status: 'unsupported', ok: false, diagnostics: [diagnostic('/extensions/umf.visual/nodes/0/role'), ...item.targets.dot.diagnostics], identityMap: []};
    item.targets.mermaid = {status: 'supported', ok: true, source: 'source', diagnostics: [], identityMap: []};
    const history: HistoricalPair[] = [
      {id: item.id, format: 'dot', emitted: false, sourceSha256: item.sourceSha256},
      {id: item.id, format: 'mermaid', emitted: true, sourceSha256: item.sourceSha256},
    ];
    const pairs = createLossLedger(catalog, history).pairs;
    const dot = pairs.find(pair => pair.target === 'dot')!;
    const mermaid = pairs.find(pair => pair.target === 'mermaid')!;
    expect(dot.comparison).toBe('previously-refused');
    expect(dot.refusalDiagnosticIndexes).toContain(1);
    expect(dot.rawDiagnostics).toEqual(item.targets.dot.diagnostics);
    expect(dot.representationInventory.find(entry => entry.path.endsWith('/nodes/0/role'))?.representation).toBe('unrepresented');
    expect(mermaid.comparison).toBe('previously-emitted');
    expect(mermaid.selectedForRelease).toBe(false);
  });

  // @covers US-095-AC1, US-095-AC2: classifications remain conservative where a receipt does not establish gap ownership.
  test('leaves unproven ownership unknown and does not mistake the source document for a retained native representation', () => {
    const path = '/extensions/umf.visual/source/path';
    const ledger = createLossLedger(syntheticCatalog([diagnostic(path)]));
    const pair = ledger.pairs[0]!;
    const entry = pair.representationInventory.find(candidate => candidate.path === path)!;
    expect(entry.family).toBe('provenance');
    expect(entry.representation).toBe('unrepresented');
    expect(entry.gapOwner).toBe('unknown');
    expect(pair.lossGroups[0]?.gapOwner).toBe('unknown');
    expect(pair.export.source).toBe('native source');
    expect(pair.representationInventory.find(candidate => candidate.path === '/extensions/umf.visual/question')?.representation).toBe('unrepresented');
    expect(pair.representationInventory.find(candidate => candidate.path === '/extensions/umf.visual/nodes/0/role')?.family).toBe('application');
    expect(pair.representationInventory.find(candidate => candidate.path === '/extensions/umf.visual/nodes/0/evidence')?.family).toBe('provenance');
  });

  // @covers US-095-AC2: identity correspondence is not native readback evidence; no field coverage is inferred without exact output verification.
  test('does not infer field coverage from an identity map or missing diagnostic', () => {
    const catalog = syntheticCatalog([]), item = catalog.items[0]!;
    item.targets.dot.identityMap = [{kind: 'node', nativeId: 'umf_node_6e31', visualId: 'n1', path: '/extensions/umf.visual/nodes/0'}];
    const entries = createLossLedger(catalog).pairs[0]!.representationInventory;
    expect(entries.find(entry => entry.path === '/extensions/umf.visual/nodes/0/id')).toMatchObject({representation: 'unrepresented', identityMapped: true});
    expect(entries.find(entry => entry.path === '/extensions/umf.visual/nodes/0/label')).toMatchObject({representation: 'unrepresented', identityMapped: false});
  });

  // @covers US-095-AC1, US-095-AC2: each receipt records the source document's visual vocabulary version, independent of the newer schema catalog.
  test('records actual per-document model versions when the corpus mixes vocabulary releases', () => {
    const catalog = syntheticCatalog([]), second = structuredClone(catalog.items[0]!);
    second.id = 'item-1.1';second.sourcePath = 'fixtures/visual/forms/item-1.1.json';second.sourceSha256 = 'd'.repeat(64);
    (second.document as any).vocabularies['umf.visual'].version = '1.1.0';catalog.items.push(second);
    const ledger = createLossLedger(catalog);
    expect(ledger.modelVersion).toBe('mixed');
    expect(ledger.pairs.filter(pair => pair.itemId === 'item').every(pair => pair.modelVersion === '1.0.0')).toBe(true);
    expect(ledger.pairs.filter(pair => pair.itemId === 'item-1.1').every(pair => pair.modelVersion === '1.1.0')).toBe(true);
  });

  test('selects the ordinary Mermaid capability by exact profile even when annotated capability sorts first',()=>{
    const catalog=syntheticCatalog([]);
    const ordinary=catalog.capabilities.find(row=>row.format==='mermaid')!;
    ordinary.profile='umf.visual.mermaid/1';ordinary.version='1.2.0';
    catalog.capabilities.unshift({format:'mermaid',profile:'umf.visual.mermaid.annotated/1',version:'0.1.0',subset:'annotated',directions:['export']} as any);
    const pair=createLossLedger(catalog).pairs.find(row=>row.target==='mermaid')!;
    expect(pair.adapterProfile).toMatchObject({name:'umf.visual.mermaid/1',version:'1.2.0'});
  });

  test('fails closed when the ordinary capability is missing despite an annotated capability existing',()=>{
    const catalog=syntheticCatalog([]);
    catalog.capabilities=catalog.capabilities.filter(row=>row.format!=='mermaid');
    catalog.capabilities.unshift({format:'mermaid',profile:'umf.visual.mermaid.annotated/1',version:'0.1.0',subset:'annotated',directions:['export']} as any);
    expect(()=>createLossLedger(catalog)).toThrow('Expected exactly one ordinary mermaid capability (umf.visual.mermaid/1); found 0.');
  });
});
