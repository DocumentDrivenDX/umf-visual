// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Json} from '@umf/core';
import type {MiroBundle} from './types.js';
export class MiroAdapterError extends Error {
  constructor(public readonly code: string, message: string, public readonly receipt?: MiroBundle) {
    super(message); this.name = 'MiroAdapterError';
  }
}
export function requireMiro(value: unknown, code: string, message: string): asserts value {
  if (!value) throw new MiroAdapterError(code, message);
}
/** JSON only, no toJSON invocation, no prototype setters, no lossy coercion. */
export function jsonCopy<T>(input: T): T {
  const ancestors = new Set<object>();
  function visit(value: unknown, depth: number): Json {
    requireMiro(depth < 128, 'JSON', 'Maximum JSON depth exceeded');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      requireMiro(Number.isFinite(value), 'JSON', 'Non-finite JSON number'); return value;
    }
    requireMiro(typeof value === 'object' && value !== null, 'JSON', 'Expected JSON value');
    requireMiro(!ancestors.has(value), 'JSON', 'Cyclic JSON value');
    requireMiro(Array.isArray(value) || [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'JSON', 'Expected plain JSON object');
    ancestors.add(value);
    const result = Array.isArray(value)
      ? Array.from(value, entry => visit(entry, depth + 1))
      : Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, visit(entry, depth + 1)]));
    ancestors.delete(value);
    return result;
  }
  return visit(input, 0) as T;
}
export function canonical(value: unknown): string {
  const copy = jsonCopy(value);
  function ordered(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(ordered);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => [k, ordered(x)]));
    return v;
  }
  return JSON.stringify(ordered(copy));
}
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function escapeLabel(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\n/g, '<br>');
}
/** Deliberately small rich-text subset; refuse formatting rather than flatten it. */
export function plainLabel(html: unknown): string {
  requireMiro(typeof html === 'string', 'CONTENT', 'Expected label content');
  let text = html.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>\s*<p>/gi, '\n').replace(/^<p>/i, '').replace(/<\/p>$/i, '');
  requireMiro(!/[<>]/.test(text), 'RICH_TEXT', 'Only plain text, paragraph wrappers and line breaks may be imported');
  requireMiro(!/&(?!amp;|lt;|gt;|quot;|apos;|#39;|nbsp;|#\d+;|#x[\da-f]+;)/i.test(text), 'RICH_TEXT', 'Unsupported HTML entity');
  return text.replace(/&(amp|lt|gt|quot|apos|nbsp|#39|#\d+|#x[\da-f]+);/gi, (_, entity: string) => {
    const named: Record<string, string> = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', '#39': "'"};
    if (entity.toLowerCase() in named) return named[entity.toLowerCase()]!;
    const n = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    requireMiro(n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff), 'RICH_TEXT', 'Invalid character entity');
    return String.fromCodePoint(n);
  });
}
