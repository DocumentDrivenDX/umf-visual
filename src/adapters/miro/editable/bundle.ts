// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyHostJson} from '../../reconciliation/json.js';
import {requireEditable} from './json.js';
import {validateEditableBinding} from './binding.js';
import type {EditableBinding} from './types.js';

export async function writeEditableMiroBinding(input: EditableBinding): Promise<string> {
  return JSON.stringify(await validateEditableBinding(input), null, 2) + '\n';
}
export async function readEditableMiroBinding(text: string): Promise<EditableBinding> {
  requireEditable(typeof text === 'string' && new TextEncoder().encode(text).byteLength <= 16_000_000, 'LIMIT', 'Editable Miro binding exceeds 16 MiB');
  let input: unknown;
  try {input = JSON.parse(text) as unknown;} catch {throw new Error('Editable Miro binding is not valid JSON');}
  return validateEditableBinding(copyHostJson(input) as unknown as EditableBinding);
}
