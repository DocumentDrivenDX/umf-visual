// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Json} from '@umf/core';

export class EditableMiroError extends Error {
  constructor(public readonly code: string, message: string, public readonly receipt?: unknown) {super(message); this.name = 'EditableMiroError';}
}
export function requireEditable(value: unknown, code: string, message: string): asserts value {
  if (!value) throw new EditableMiroError(code, message);
}
export function record(value: unknown): value is Record<string, unknown> {return typeof value === 'object' && value !== null && !Array.isArray(value);}
export function pointerSegment(value: string): string {return value.replace(/~/g, '~0').replace(/\//g, '~1');}
export function copyJson<T>(input: T, maxBytes = 16_000_000): T {
  const seen = new Set<object>();
  function visit(value: unknown, depth: number): Json {
    requireEditable(depth <= 64, 'LIMIT', 'JSON nesting exceeds depth 64');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {requireEditable(Number.isFinite(value), 'INPUT', 'Non-finite number is not JSON'); return value;}
    requireEditable(typeof value === 'object' && value !== null, 'INPUT', 'Expected finite JSON input');
    requireEditable(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, 'INPUT', 'Expected plain JSON objects');
    requireEditable(!seen.has(value), 'INPUT', 'Cyclic JSON input'); seen.add(value);
    let result: Json;
    if (Array.isArray(value)) result = value.map(child => visit(child, depth + 1));
    else {
      const out: Record<string, Json> = Object.create(null);
      for (const [key, child] of Object.entries(value)) {
        requireEditable(key !== '__proto__' && key !== 'constructor' && key !== 'prototype', 'INPUT', 'Unsafe JSON property');
        out[key] = visit(child, depth + 1);
      }
      result = out;
    }
    seen.delete(value); return result;
  }
  const result = visit(input, 0) as T;
  const text = JSON.stringify(result);
  requireEditable(new TextEncoder().encode(text).byteLength <= maxBytes, 'LIMIT', 'JSON exceeds 16 MiB');
  return result;
}
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value as Record<string, unknown>).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
}
export async function sha256(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function escapeContent(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\n/g, '<br>');
}
export function plainContent(value: unknown): string {
  requireEditable(typeof value === 'string', 'CONTENT', 'Expected native text content');
  let text = value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>\s*<p>/gi, '\n').replace(/^<p>/i, '').replace(/<\/p>$/i, '');
  requireEditable(!/[<>]/.test(text), 'RICH_TEXT', 'Only plain text, paragraph wrappers and line breaks may be adopted');
  requireEditable(!/&(?!(amp|lt|gt|quot|apos|#39|nbsp|#\d+|#x[\da-f]+);)/i.test(text), 'RICH_TEXT', 'Unsupported HTML entity');
  return text.replace(/&(amp|lt|gt|quot|apos|nbsp|#39|#\d+|#x[\da-f]+);/gi, (_, entity: string) => {
    const named: Record<string, string> = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', '#39': "'"};
    if (entity.toLowerCase() in named) return named[entity.toLowerCase()]!;
    const number = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    requireEditable(number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff), 'RICH_TEXT', 'Invalid character reference');
    return String.fromCodePoint(number);
  });
}
