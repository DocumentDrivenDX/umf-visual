# Miro editable live conformance

An interactive Miro Web SDK v2 session exercised the bounded umf.visual.miro.editable-network/1 profile against a three-node, two-edge 1.0.0 visual. The iframe reported SDK runtime 1.105538.0; the Miro service release was not pinned. The source and native capture were independently re-admitted and checked at binding revisions 0, 1 and 2.

The native import reconciled a node-label edit and a directed connector reconnection. A native-preserving update then changed the question while retaining the imported node fill, position, and connector attachments/style. The verifier compared every unmapped board item across both transitions; none changed after excluding the SDK-managed modifiedAt and modifiedBy fields. The failed rich-text bold command was recorded as a refusal, so this evidence does not claim bold-text support. Group presentation was not tested.

See the [sanitized receipt](evidence/miro-editable-live-2026-10-30.json) for source/capture digests and counts. Raw bindings and screenshots remain in the ignored local proof area and are not published. This evidence qualifies only the explicit slots and operations listed in the receipt; it does not establish arbitrary Miro import or group semantics.
