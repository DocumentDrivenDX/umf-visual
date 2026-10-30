# Second example loss-reduction wave

Baseline: released v0.1.0, commit `10fdb00af3820f72a7704e7a23b949995c450424`.
CONTRACT-086 1.1 governs additive DOT 0.3.0 and Mermaid 1.2.0 profiles; Lini
remains 0.2.0. The vocabulary/schema and all 53 example source bytes are unchanged.

| Measured outcome | Before | After |
| --- | --- | --- |
| Native rendered sample/target pairs | 59 | 72 |
| Original corpus examples with at least one native render | 21 of 50 | 34 of 50 |
| DOT emitted pairs | 11 | 19 |
| Mermaid emitted pairs | 24 | 29 |
| Lini emitted pairs | 24 | 24 |
| Loss reports on the 11 previously emitted DOT pairs | 234 | 190 |
| Fully strict pairs, across three targets | 3 | 3 |

Eight previously refused zoned/lane examples now render through native DOT
clusters. Five sequence examples now render through native Mermaid, preserving
43 ordered messages (35 calls and eight returns). Three already-emitted grouped
network examples also retain group membership. Group labels, parent nesting,
node membership and secondary descriptions are preserved where qualified. Edge
`why` explanations map independently to tooltips, attached to the exact directed
edge occurrence. This removes 44 located loss reports on previously emitted pairs.
Newly emitted pairs have their remaining losses counted separately; an expanded
coverage total is not a loss-reduction claim.

## Preservation boundaries

Every original example has provenance metadata. Source path/view/digest,
application roles/status/evidence, walkthrough steps and other unmatched fields
still report loss. Generic DOT clusters do not establish zone/lane/tier meaning
or exact layout. Cluster import projects a region role with a located loss.
A tooltip-free child clears an inherited parent tooltip rather than inventing a
description. Node containment is separate from group membership.

Mermaid preserves ordered participants and explicit call/return/async messages,
two-participant notes and contiguous nested loops. It refuses unsupported
fragments and participant redefinitions/late declarations; it reports absent
message kind and ladder layout. Sequence labels numeric-escape ASCII space,
tab, LF and supported punctuation. Other controls, CR, unpaired surrogates and
non-ASCII whitespace refuse, including after native entity decoding. Group
identity locators follow native loop emission order rather than group array order.

The catalog shows native render counts and remaining loss-report counts beside
its unchanged supported/reported-loss/unsupported classification. Native rendering
success is not full semantic equivalence; no existing example was stripped of
metadata to improve support badges.

## Executed evidence

- 114 Bun tests and 3,420 assertions pass; source boundary and type checks pass.
- Independent Graphviz 16.1 JSON checks all 11 grouped originals: exact cluster
  identities/labels/membership, edge endpoints/cardinality and per-occurrence
  explanations. Additional native cases cover child tooltip reset and distinct
  explanations on parallel edges.
- Mermaid 12.2 in Chromium 153 checks all five original sequences. The native
  parser database verifies participant order, message endpoints and arrow kinds;
  SVG text verifies exact message order/text, participant labels and titles.
- A durable native case verifies hostile actor/message/note/loop text with quotes,
  Unicode, punctuation, angle brackets, ampersands, boundary spaces, LF and tab,
  plus native async/note/loop marker kinds. Invalid controls/whitespace are
  independently exercised as adapter refusals.
- Public browser import/export and serialized retained-source exact replay pass
  for all sixteen affected originals; stale edits refuse. Existing vocabulary,
  facade and native Lini checks remain green.
- All 72 catalog SVGs load with positive dimensions. UI error states, navigation,
  downloads, composed filters and 375px layout pass. Two full catalog rebuilds
  produce identical current JSON/SVG bytes and retain prior immutable assets.
- Sol reviewed the semantics and the public facade. Review findings were fixed
  and covered: actor lookup, undefined cluster detail, inherited child tooltips,
  decoded controls and loop identity ordering.

[Progress receipt](evidence/loss-progress-wave-2.json),
[native receipt](evidence/native-wave-2.json), and
[browser receipt](evidence/browser-wave-2.json) record actual outcomes.


## Main integration

Integrated Miro PR #5 from main `abc043457c22c3be90b9bfac789a700e4f9671e3`.
Both package exports and browser hooks are retained. Combined source/type checks
and 138 tests / 3,524 assertions pass. Chromium verifies the sixteen wave-two
public round trips plus Miro's sanitized in-memory SDK checks; this browser run
is not additional live Miro evidence. The common schema remains unchanged.
