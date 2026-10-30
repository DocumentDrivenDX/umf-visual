# PowerPoint native conformance

Microsoft PowerPoint for Mac 16.114.3 opened the qualified network deck without
a repair prompt, accepted edits and saved the result. The PowerPoint adapter
reimported the edited package and produced the expected semantic changes. A
native-preserving update changed a second node label while retaining the first
node's bold style and manually adjusted geometry and the redirected connector;
the updated deck was reopened successfully. The privacy-safe edit sequence is
replayable from `tests/powerpoint/fixtures/native-network-ui-replay.json`; the
adapter test repeats the label, bold, geometry and attached-endpoint changes
without storing the native package.

The native network case uses the sanitized 1.1.0 fixture at
`fixtures/integrations/complex-miro/common/network-16x24.json` (16 nodes and 24
edges). PowerPoint changed node `n01` from `Node 01` to `Native edited 01`, moved
it by 21,516 EMU horizontally, applied bold text, and redirected edge `e01`
from `n02` to `n03`. Adapter readback reported only the semantic text and
endpoint changes. Geometry and bold style remain native presentation state.
The preserving update changed `n02` to `Node 2` and retained the user's native
edits.

A separate synthetic 1.0.0 example qualified edge captions. PowerPoint displayed
the caption as a separate editable text shape and saved a change from `request`
to `reply`; the adapter imported exactly `/extensions/umf.visual/edges/0/label`.
The adapter then updated the caption to `response` while preserving the native
package. PowerPoint reopened the preserved update without a repair prompt and
displayed `response`.

The [sanitized evidence receipt](evidence/powerpoint-native-conformance.json)
records source and package digests, object counts, observed edits, and the
qualified subset. Raw PPTX packages and screenshots are kept only in the ignored
local proof area. The receipt publishes no native author properties, usernames,
or archive contents.

This evidence qualifies one-slide `flow/network` editing for the tested
PowerPoint version. It does not establish arbitrary presentation import,
interpretation of native layout as UMF semantics, group semantics, or behavior
on other PowerPoint versions.
