// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Json} from '@umf/core';
import {requireMiro} from './json.js';
/** SDK models can contain callable API members inside captions/endpoints. They
 * are not board data. Omit only functions/undefined object members, recording
 * their paths; reject all other non-JSON values and cycles. Never call toJSON. */
export function sdkJson(input: unknown, path: string, omitted: string[]): Json {
  const seen = new Set<object>();
  function visit(value: unknown, at: string, depth: number): Json {
    requireMiro(depth < 128, 'JSON', 'Maximum SDK JSON depth at ' + at);
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {requireMiro(Number.isFinite(value), 'JSON', 'Non-finite SDK number at ' + at); return value;}
    requireMiro(typeof value === 'object' && value !== null, 'JSON', 'Non-JSON SDK value at ' + at);
    requireMiro(Array.isArray(value) || [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'JSON', 'Non-JSON SDK object at ' + at);
    requireMiro(!seen.has(value), 'JSON', 'Cyclic SDK model at ' + at);
    seen.add(value);
    let result: Json;
    if (Array.isArray(value)) result = value.map((entry, i) => visit(entry, at + '/' + i, depth + 1));
    else result = Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
      const next = at + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1');
      if (entry === undefined || typeof entry === 'function') {omitted.push(next); return [];}
      return [[key, visit(entry, next, depth + 1)]];
    }));
    seen.delete(value); return result;
  }
  return visit(input, path, 0);
}
