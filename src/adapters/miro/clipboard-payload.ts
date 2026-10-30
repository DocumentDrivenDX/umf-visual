// SPDX-License-Identifier: MIT OR Apache-2.0
import {jsonCopy, record, requireMiro} from './json.js';
export const MIRO_CLIPBOARD_PROFILE = 'miro.browser-clipboard/observed-2026-10-29';
export interface MiroNativeClipboard {
  profile: typeof MIRO_CLIPBOARD_PROFILE; sourceBoardId: string;
  client: string; coverage: 'selection'; html: string; text: string;
}
/** Opaque Miro-owned browser format. This validates admission, not its internals.
 * Never render this HTML, evaluate it, or infer common semantics from it. */
export function validateMiroClipboard(input: unknown): MiroNativeClipboard {
  requireMiro(record(input) && input.profile === MIRO_CLIPBOARD_PROFILE && input.coverage === 'selection', 'CLIPBOARD', 'Unknown native clipboard profile');
  requireMiro(typeof input.sourceBoardId === 'string' && input.sourceBoardId.length > 0 && typeof input.client === 'string' && input.client.length > 0, 'CLIPBOARD', 'Expected board/client provenance');
  requireMiro(typeof input.html === 'string' && input.html.length > 0 && input.html.length <= 16_000_000 &&
    typeof input.text === 'string' && input.text.length <= 16_000_000, 'CLIPBOARD', 'Native clipboard exceeds admission limits');
  requireMiro(/\bdata-meta\s*=/.test(input.html), 'CLIPBOARD', 'Expected opaque Miro clipboard data-meta envelope');
  return jsonCopy(input) as unknown as MiroNativeClipboard;
}
