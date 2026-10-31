// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe, expect, test} from 'bun:test';
import type {EditableBinding, EditableSnapshot} from '../../src/adapters/miro/editable/index.js';
import {assertInterruptedReceiptMatches, compareUnownedSnapshots, parseInterruptedReceiptEnvelope} from '../../examples/miro/recovery-evidence.js';

const snapshot = (id: string, data: Record<string, unknown> = {}): EditableSnapshot => ({id, type: 'shape', data: data as EditableSnapshot['data'], metadata: {}});

describe('Miro read-only recovery evidence qualification', () => {
  test('qualifies only observed createdAt, empty linkedTo, and connectorIds order drift while reporting new objects', () => {
    const prior = [snapshot('old', {createdAt: '2026-10-31T18:32:24.082Z', linkedTo: '', connectorIds: ['c1', 'c2'], custom: {keep: true}})];
    const current = [snapshot('old', {createdAt: '2026-10-31T18:32:24.100Z', connectorIds: ['c2', 'c1'], custom: {keep: true}}), snapshot('new', {content: 'independent cohort object'})];
    const result = compareUnownedSnapshots(prior, current, new Set());
    expect(result.preserved).toBe(true);
    expect(result.newlyObservedIds).toEqual(['new']);
    expect(result.qualifiedDrift.map(item => item.path).sort()).toEqual(['/data/connectorIds', '/data/createdAt', '/data/linkedTo']);
    expect(result.unqualifiedPaths).toEqual([]);
  });

  test('does not qualify changed unknown fields, connector membership, duplicates, or missing prior objects', () => {
    const prior = [snapshot('old', {createdAt: '2026-10-31T18:32:24.082Z', connectorIds: ['c1', 'c2'], custom: 'before'}), snapshot('gone')];
    const current = [snapshot('old', {createdAt: '2026-10-31T18:32:24.100Z', connectorIds: ['c1', 'c3'], custom: 'after'})];
    const result = compareUnownedSnapshots(prior, current, new Set());
    expect(result.preserved).toBe(false);
    expect(result.missingIds).toEqual(['gone']);
    expect(result.unqualifiedPaths).toEqual(['old/data/connectorIds/1', 'old/data/custom']);
  });

  test('accepts a saved interrupted status envelope and sanitizes its cause chain', () => {
    const result = parseInterruptedReceiptEnvelope(JSON.stringify({causeChain: [{name: 'Error', code: 'WRITE_INTERRUPTED', message: 'failure', extra: 'discard'}], receipt: {state: 'interrupted', pending: {operation: 'update'}}}));
    expect(result.binding).toEqual({state: 'interrupted', pending: {operation: 'update'}});
    expect(result.causeChain).toEqual([{name: 'Error', code: 'WRITE_INTERRUPTED', message: 'failure'}]);
    expect(() => parseInterruptedReceiptEnvelope('not a receipt')).toThrow(/valid JSON/);
  });

  test('requires interrupted receipt identity, source, resource, and revision to match the loaded binding', () => {
    const binding = {state: 'complete', bindingRevision: 4, sourceDigestSha256: 'source', resource: {host: 'miro', documentId: 'board'}, mappings: [
      {kind: 'node', logicalId: 'n', path: '/n', nativeId: 'native-n', nativeScope: 'board'}]} as unknown as EditableBinding;
    const receipt = {...binding, state: 'interrupted', pending: {operation: 'update'}} as EditableBinding;
    expect(() => assertInterruptedReceiptMatches(receipt, binding)).not.toThrow();
    expect(() => assertInterruptedReceiptMatches({...receipt, bindingRevision: 3}, binding)).toThrow(/does not match/);
  });
});
