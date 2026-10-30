// SPDX-License-Identifier: MIT OR Apache-2.0
import {validateDocument, type Document, type ExtensionPackage, type Json} from '@umf/core';
import {getVisual, visualRegistry} from '../../extensions/visual/index.js';
import {validateCapture} from './bundle.js';
import {jsonCopy, record, requireMiro} from './json.js';
import {validateMiroClipboard, type MiroNativeClipboard} from './clipboard-payload.js';
import type {MiroCapture, MiroMapping} from './types.js';

export const MIRO_NATIVE_EXTENSION = 'umf.visual.miro';
export const MIRO_NATIVE_VERSION = '1.0.0';
/** Native IDs are scoped to capture.boardId, independent of semantic visual IDs. */
export interface MiroNativePayload {
  sdk: '2'; capture: MiroCapture; mappings: MiroMapping[];
  reproduction: 'capture-only' | 'native-clipboard'; clipboard?: MiroNativeClipboard;
}
export const miroNativePackage: ExtensionPackage = {
  id: MIRO_NATIVE_EXTENSION, version: MIRO_NATIVE_VERSION, coreVersion: '0.10.0',
  description: 'Miro Web SDK v2 API-visible JSON, explicit visual mappings and optional opaque observed browser clipboard',
  schema: {$schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
    required: ['sdk', 'capture', 'mappings', 'reproduction'], properties: {
      sdk: {const: '2'}, capture: {type: 'object'}, mappings: {type: 'array'}, reproduction: {enum: ['capture-only', 'native-clipboard']}, clipboard: {type: 'object'},
    }},
  semantics: 'Opaque JSON preservation, native board-scoped identities, explicit bijective mappings; optional observed browser clipboard reproduction',
  capabilities: {validation: 'semantic', directions: ['import', 'export'], native: {system: 'Miro Web SDK', version: '2', subset: 'API-visible JSON and optional observed browser clipboard selection; no whole-board backup or pixel-fidelity claim'}, evidence: ['tests/miro/native-extension.test.ts']},
  scopes: ['document'],
};
export function miroRegistry() {
  return visualRegistry().register(miroNativePackage, (value, context) => {
    try {validateNative(value, context.document); return [];}
    catch (error) {return [{code: 'MIRO_NATIVE', severity: 'error' as const, path: context.path, message: String(error)}];}
  });
}
function validateNative(value: unknown, document?: Document): MiroNativePayload {
  requireMiro(record(value) && value.sdk === '2' && ['capture-only', 'native-clipboard'].includes(String(value.reproduction)), 'NATIVE_EXTENSION', 'Expected Miro capture-only v1 payload');
  const capture = validateCapture(value.capture as MiroCapture);
  if (value.clipboard !== undefined) {
    const clipboard = validateMiroClipboard(value.clipboard);
    requireMiro(clipboard.sourceBoardId === capture.boardId, 'BOARD', 'Native clipboard belongs to a different board');
  }
  requireMiro(value.reproduction !== 'native-clipboard' || value.clipboard !== undefined, 'NATIVE_EXTENSION', 'Native reproduction requires its opaque clipboard payload');
  requireMiro(Array.isArray(value.mappings), 'NATIVE_EXTENSION', 'Expected explicit mappings');
  const logical = new Set<string>(), native = new Set<string>();
  for (const mapping of value.mappings) {
    requireMiro(record(mapping) && typeof mapping.logicalId === 'string' && mapping.logicalId.length > 0 &&
      typeof mapping.nativeId === 'string' && ['question', 'node', 'edge'].includes(String(mapping.kind)), 'NATIVE_EXTENSION', 'Invalid native mapping');
    const key = mapping.kind + ':' + mapping.logicalId;
    requireMiro(!logical.has(key) && !native.has(mapping.nativeId) && capture.items.some(i => i.id === mapping.nativeId), 'NATIVE_EXTENSION', 'Duplicate or dangling native mapping');
    if (document) {
      const v = getVisual(document);
      const exists = mapping.kind === 'question' ? mapping.logicalId === v.id :
        (mapping.kind === 'node' ? v.nodes : v.edges)?.some(item => item.id === mapping.logicalId);
      requireMiro(exists, 'NATIVE_EXTENSION', 'Mapping does not resolve in the semantic visual');
    }
    logical.add(key); native.add(mapping.nativeId);
  }
  return jsonCopy(value) as unknown as MiroNativePayload;
}
/** Adds native preservation explicitly. Existing unknown extension keys survive a new capture. */
export function attachMiroCapture(document: Document, capture: MiroCapture, mappings: MiroMapping[] = []): Document {
  const result = jsonCopy(document), old = result.extensions?.[MIRO_NATIVE_EXTENSION];
  const declaration = result.vocabularies[MIRO_NATIVE_EXTENSION];
  requireMiro(!declaration || declaration.version === MIRO_NATIVE_VERSION, 'NATIVE_VERSION', 'No implicit Miro native version upgrade');
  requireMiro(!old || record(old), 'NATIVE_EXTENSION', 'Existing native payload is not an object');
  const payload = {...(record(old) ? old : {}), sdk: '2', capture: validateCapture(capture), mappings: jsonCopy(mappings), reproduction: 'capture-only'};
  validateNative(payload);
  result.vocabularies[MIRO_NATIVE_EXTENSION] = {...declaration, version: MIRO_NATIVE_VERSION};
  (result.extensions ??= {})[MIRO_NATIVE_EXTENSION] = payload as unknown as Json;
  const checked = validateDocument(result, miroRegistry());
  requireMiro(checked.valid, 'NATIVE_EXTENSION', JSON.stringify(checked.diagnostics));
  return result;
}
export function getMiroCapture(document: Document): MiroNativePayload {
  requireMiro(document.vocabularies[MIRO_NATIVE_EXTENSION]?.version === MIRO_NATIVE_VERSION, 'NATIVE_VERSION', 'Expected umf.visual.miro 1.0.0');
  return validateNative(document.extensions?.[MIRO_NATIVE_EXTENSION], document);
}
