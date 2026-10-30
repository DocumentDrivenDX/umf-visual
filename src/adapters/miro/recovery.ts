// SPDX-License-Identifier: MIT OR Apache-2.0
import {validateCapture, validateMiroBundle} from './bundle.js';
import {jsonCopy, requireMiro} from './json.js';
import {reconcileMiroVisual} from './reconcile.js';
import type {MiroBundle, MiroCapture} from './types.js';
/** Read-only recovery when every expected item was created and can be verified.
 * Never writes, retries, invents identities or accepts missing/edited items. */
export function recoverMiroExport(input: MiroBundle, observed: MiroCapture): MiroBundle {
  const bundle = validateMiroBundle(input), capture = validateCapture(observed);
  requireMiro(bundle.state === 'interrupted', 'RECOVERY', 'Expected an interrupted receipt');
  requireMiro(bundle.boardId === capture.boardId, 'BOARD', 'Wrong recovery board');
  const next = jsonCopy(bundle);
  next.baseline = next.mappings.map(mapping => {
    const item = capture.items.find(i => i.id === mapping.nativeId);
    requireMiro(item, 'RECOVERY', 'Mapped item missing; manual reconciliation required');
    return jsonCopy(item);
  });
  delete next.pending; next.state = 'complete';
  // Complete validation checks expected count, source labels/captions/endpoints;
  // reconciliation additionally verifies observed metadata and duplicated IDs.
  validateMiroBundle(next);
  requireMiro(reconcileMiroVisual(next, next.source, capture).changes.length === 0, 'RECOVERY', 'Native semantic edits require manual reconciliation');
  return next;
}
