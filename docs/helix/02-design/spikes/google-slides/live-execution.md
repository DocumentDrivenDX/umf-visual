# Google Slides live execution evidence

The 2026-10-30 host run exercised the `umf.visual.google-slides.network/1` profile with one Visual 1.0.0 flow/network document. It supplements the local planning and adapter round-trip tests with a real Google Slides UI edit and live conditional-revision writes. The run is deliberately scoped to one adapter-owned slide; it does not claim whole-presentation fidelity.

The host wrapper created an owned slide containing 12 mapped elements: title and question, four nodes, three connectors, and three connector labels. Its initial batch contained 37 requests and used the revision captured before export as the required write revision. The pre-existing slide remained canonically unchanged through the final update.

In the Slides UI, a node label was changed and made bold, that node was moved right, and the first connector was attached to a different node. Import adopted the label and connector endpoint as two semantic changes at `/extensions/umf.visual/nodes/0/label` and `/extensions/umf.visual/edges/0/to`. The formatting and movement remained native-only. The final Slides update applied one UMF-authored node-label change in three requests under the current host revision. Readback matched the authored label; the final binding advanced from revision 1 to revision 2. It retained the UI-edited text style, transforms, and connector attachments.

The live capture did not include `connectionSiteIndex` on connector endpoints. The evidence therefore makes no claim about preservation of attachment-site indexes. It records the observed start/end attachment objects and verifies that the later update left them unchanged.

Run `bun scripts/verify-google-slides-live.ts` to validate the ignored captures in `.cache/host-live/slides-*.json` and regenerate the sanitized receipt at [`google-slides-live-2026-10-30.json`](../../../04-build/evidence/google-slides-live-2026-10-30.json). The verifier checks identities and values locally but writes only counts, JSON Pointer paths, pass/fail assertions, and qualified limitations. It never writes presentation IDs, URLs, revision tokens, or native snapshots to the receipt.

The host wrapper performed the real Google Slides writes. The adapter update planner and reconciliation path were verified by replaying captured host observations through the injected trace harness; the adapter transport itself was not injected into the live account. This is live host-execution evidence, not an end-to-end claim for every Google Slides account, deck, or native object type.
