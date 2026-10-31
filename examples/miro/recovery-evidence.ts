// SPDX-License-Identifier: MIT OR Apache-2.0
import type {EditableBinding, EditableSnapshot} from '../../src/adapters/miro/editable/index.js';

export type QualifiedDrift = {nativeId: string; path: string; qualification: string; before: unknown; after: unknown};
export type UnownedComparison = {preserved: boolean; priorCount: number; currentCount: number; newlyObservedIds: string[]; qualifiedDrift: QualifiedDrift[]; unqualifiedPaths: string[]; missingIds: string[]};

function canonical(value: unknown): string {
  const sort = (item: any): any => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key])])) : item;
  return JSON.stringify(sort(value));
}
function record(value: unknown): value is Record<string, unknown> {return value !== null && typeof value === 'object' && !Array.isArray(value);}
function pointerPart(value: string): string {return value.replaceAll('~', '~0').replaceAll('/', '~1');}
function isIsoDate(value: unknown): value is string {return typeof value === 'string' && Number.isFinite(Date.parse(value));}
function sameUniqueStringMembers(before: unknown, after: unknown): boolean {
  return Array.isArray(before) && Array.isArray(after) && before.every(value => typeof value === 'string') && after.every(value => typeof value === 'string') &&
    new Set(before).size === before.length && new Set(after).size === after.length && canonical([...before].sort()) === canonical([...after].sort());
}

/**
 * Compare pre-existing unowned Miro objects with a fresh capture. Only the three
 * observed SDK/server normalizations are qualified; every other property remains exact.
 * Added native objects are reported separately and are never folded into the old baseline.
 */
export function compareUnownedSnapshots(prior: EditableSnapshot[], current: EditableSnapshot[], mappedIds: Set<string>): UnownedComparison {
  const before = new Map(prior.filter(item => !mappedIds.has(item.id)).map(item => [item.id, item]));
  const after = new Map(current.filter(item => !mappedIds.has(item.id)).map(item => [item.id, item]));
  const qualifiedDrift: QualifiedDrift[] = [], unqualifiedPaths: string[] = [], missingIds: string[] = [];
  const compareValue = (nativeId: string, path: string, left: unknown, right: unknown, leftPresent: boolean, rightPresent: boolean): void => {
    if (leftPresent === rightPresent && canonical(left) === canonical(right)) return;
    if (path === '/data/createdAt' && leftPresent && rightPresent && isIsoDate(left) && isIsoDate(right)) {
      qualifiedDrift.push({nativeId, path, qualification: 'Miro SDK/server createdAt timestamp normalization', before: left, after: right}); return;
    }
    if (path === '/data/linkedTo' && leftPresent && left === '' && !rightPresent) {
      qualifiedDrift.push({nativeId, path, qualification: 'Miro SDK omits an empty linkedTo value', before: left, after: null}); return;
    }
    if (path === '/data/connectorIds' && leftPresent && rightPresent && sameUniqueStringMembers(left, right)) {
      qualifiedDrift.push({nativeId, path, qualification: 'Miro SDK reordered connectorIds without changing unique membership', before: left, after: right}); return;
    }
    if (record(left) && record(right) && leftPresent && rightPresent) {
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
        compareValue(nativeId, `${path}/${pointerPart(key)}`, left[key], right[key], Object.hasOwn(left, key), Object.hasOwn(right, key));
      }
      return;
    }
    if (Array.isArray(left) && Array.isArray(right) && leftPresent && rightPresent) {
      const max = Math.max(left.length, right.length);
      for (let index = 0; index < max; index++) compareValue(nativeId, `${path}/${index}`, left[index], right[index], index < left.length, index < right.length);
      return;
    }
    unqualifiedPaths.push(`${nativeId}${path || '/'}`);
  };
  for (const [id, snapshot] of before) {
    const observed = after.get(id);
    if (!observed) {missingIds.push(id); continue;}
    compareValue(id, '', snapshot, observed, true, true);
  }
  return {preserved: missingIds.length === 0 && unqualifiedPaths.length === 0, priorCount: before.size, currentCount: after.size,
    newlyObservedIds: [...after.keys()].filter(id => !before.has(id)).sort(), qualifiedDrift, unqualifiedPaths, missingIds};
}

export type ReceiptCause = {name?: string; code?: string; message: string};
export type InterruptedReceiptEnvelope = {binding: unknown; causeChain: ReceiptCause[]};

/** Accept the harness's saved status receipt or a raw interrupted binding, never arbitrary text. */
export function parseInterruptedReceiptEnvelope(text: string): InterruptedReceiptEnvelope {
  let envelope: unknown;
  try {envelope = JSON.parse(text);} catch {
    const marker = text.indexOf('\n{');
    if (marker < 0) throw new Error('Interrupted receipt is not valid JSON or a saved operation-status receipt.');
    try {envelope = JSON.parse(text.slice(marker + 1));} catch {throw new Error('Saved operation-status receipt JSON is invalid.');}
  }
  const outer = record(envelope) ? envelope : undefined;
  const binding = outer && record(outer.receipt) ? outer.receipt : envelope;
  if (!record(binding) || binding.state !== 'interrupted' || !record(binding.pending)) throw new Error('Recovery requires a validated adapter receipt with state "interrupted" and pending operation details.');
  const causeChain = outer && Array.isArray(outer.causeChain) ? outer.causeChain.slice(0, 8).flatMap((entry): ReceiptCause[] => {
    if (!record(entry) || typeof entry.message !== 'string') return [];
    return [{...(typeof entry.name === 'string' ? {name: entry.name.slice(0, 100)} : {}), ...(typeof entry.code === 'string' ? {code: entry.code.slice(0, 100)} : {}), message: entry.message.slice(0, 500)}];
  }) : [];
  return {binding, causeChain};
}

/** Require the saved interrupted receipt to refer to the exact loaded complete binding. */
export function assertInterruptedReceiptMatches(receipt: EditableBinding, binding: EditableBinding): void {
  const project = (value: EditableBinding) => value.mappings.map(({kind, logicalId, path, nativeId, nativeScope}) => ({kind, logicalId, path, nativeId, nativeScope}));
  if (receipt.state !== 'interrupted' || !receipt.pending || receipt.bindingRevision !== binding.bindingRevision ||
    canonical(receipt.resource) !== canonical(binding.resource) || receipt.sourceDigestSha256 !== binding.sourceDigestSha256 ||
    canonical(project(receipt)) !== canonical(project(binding))) {
    throw new Error('Interrupted receipt does not match the loaded complete binding revision, source, resource, and identity mappings.');
  }
}
