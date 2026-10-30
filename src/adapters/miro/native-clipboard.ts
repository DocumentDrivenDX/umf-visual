// SPDX-License-Identifier: MIT OR Apache-2.0
import {readDocument, writeDocument, validateDocument, type Document, type Json} from '@umf/core';
import {attachMiroCapture, getMiroCapture, MIRO_NATIVE_EXTENSION, miroRegistry} from './native-extension.js';
import {requireMiro} from './json.js';
import type {MiroCapture} from './types.js';
import {validateMiroClipboard, type MiroNativeClipboard} from './clipboard-payload.js';
export {MIRO_CLIPBOARD_PROFILE, validateMiroClipboard, type MiroNativeClipboard} from './clipboard-payload.js';
/** Imports an entire native capture without inventing an incomplete shared visual.
 * Semantic projection is a separate operation with explicit selection/losses. */
export function createMiroDocument(capture: MiroCapture, clipboard?: MiroNativeClipboard, id = 'miro:' + capture.boardId): Document {
  const document = attachMiroCapture({umf: '0.10.0', id, vocabularies: {}, extensions: {}, modules: []}, capture);
  if (clipboard) {
    const native = validateMiroClipboard(clipboard);
    requireMiro(native.sourceBoardId === capture.boardId, 'BOARD', 'Clipboard and capture board differ');
    const payload = document.extensions![MIRO_NATIVE_EXTENSION] as Record<string, Json>;
    payload.clipboard = native as unknown as Json;
    payload.reproduction = 'native-clipboard';
  }
  return document;
}
export function getMiroClipboard(document: Document): MiroNativeClipboard {
  const payload = getMiroCapture(document);
  requireMiro(payload.reproduction === 'native-clipboard', 'CLIPBOARD', 'Document has no native clipboard reproduction');
  return validateMiroClipboard(payload.clipboard);
}
export function readMiroDocument(text: string, format: 'json' | 'yaml' = 'json'): Document {
  const document = readDocument(text, format);
  const checked = validateDocument(document, miroRegistry());
  requireMiro(checked.valid, 'NATIVE_DOCUMENT', JSON.stringify(checked.diagnostics));
  getMiroCapture(document);
  return document;
}
export function writeMiroDocument(document: Document, format: 'json' | 'yaml' = 'json'): string {
  const checked = validateDocument(document, miroRegistry());
  requireMiro(checked.valid, 'NATIVE_DOCUMENT', JSON.stringify(checked.diagnostics));
  getMiroCapture(document);
  return writeDocument(document, format);
}
