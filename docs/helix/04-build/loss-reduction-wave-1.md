# First example loss-reduction wave

The baseline is commit `1fc99e5`, before these mappings. `bun run report:loss`
compares all 159 existing example/target pairs and verifies the original example
source hashes. Editing a source example to remove a field cannot count as progress.
Previously emitted targets must remain emitted. Counts below refer to located
loss reports on emitted conversions, not refused conversions or unique diagrams.

| Existing field | Native mapping | Loss reports before → after |
| --- | --- | --- |
| Visual title | Mermaid flow/ER YAML frontmatter title | 23 → 0 |
| Node detail | DOT node tooltip | 39 → 0 |
| Node detail | Lini block/entity card hint | 67 detail omissions → 0 |

This removes 129 loss reports without changing the 53 example documents, the
visual 1.0.0 schema or their semantics. All 59 previously emitted example/target
pairs still emit. Strictly supported pairs remain three (one per target): other
losses remain in the richer examples. The Lini NODE_FIELD aggregate changes from
225 to 158 because unrelated roles/statuses remain unsupported, not because all
node fields now map.

Profile versions are DOT 0.2.0, Mermaid 1.1.0 and Lini 0.2.0. The public capability
array and catalog record these separately from native engine versions. Tooltip
mapping carries secondary descriptive text; it does not promise caption placement
or convert a description into an identity or a project status.

## Executed evidence

Bun typecheck and 88 tests/3,254 assertions pass. Packed Bundler declarations and
installed Bun/Node consumers pass. Native Graphviz 16.1.0 verifies descriptive
text through SVG XML tooltips and exact repeated spaces through its native JSON
attributes. Its SVG intentionally encodes extra U+0020 spaces as NBSPs to retain
visible spacing; no exact SVG-codepoint claim is made for those positions.

Chromium 153 with Mermaid 12.2.0 verifies flow and ER title SVG text, including
quotes, backslashes, Unicode, LF, tab, boundary spaces, literal backticks and
Unicode line/paragraph separators. Carriage return and `&<>` are refused because
the native strict renderer changes them. Indented YAML metadata is refused so a
nested configuration title cannot be mistaken for a root diagram title. Other
native metadata remains explicitly diagnosed.

Pinned Lini 1.1.0 verifies flow/entity card hint tooltips in its real SVG output.
Interior quotes, backslashes, newlines and Unicode survive. Native boundary
whitespace trimming is reported as LINI_DETAIL_TRIM; empty hints refuse. Entity
field hints still report loss because there is no corresponding field-detail
property in this vocabulary. Bun and Chromium WASM SVG hashes agree.

See [structured progress](evidence/loss-progress.json),
[native receipt](evidence/interchange-native-wave-1.json) and
[browser receipt](evidence/interchange-browser-wave-1.json). The regenerated
catalog retains native render/error separation and truthful unsupported cases.

## Next worklist

Prioritize existing shared grouping semantics and container membership in flow
network/zoned/lanes, separating group meaning from a native layout heuristic.
Then distinguish missing mappings from common-model gaps for ports/attachment,
relationship identification/direction, shared shape/style/layout intent and richer
entity refinements. Project roles/status/evidence belong in the profile-boundary
design, not guessed native colors. Native limitations and intentionally omitted
meanings must remain explicit until a typed mapping is qualified.

The inline-preview repair uses immutable SHA-addressed SVGs, retained previous
assets, atomic catalog publication, content-versioned browser assets and
unambiguous legacy links. All 59 current SVGs load with positive dimensions in
Chromium; DOT, Mermaid and Lini were also visibly verified in the in-app browser.
