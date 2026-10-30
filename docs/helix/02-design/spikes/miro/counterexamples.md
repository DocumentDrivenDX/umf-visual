# Reduced Miro examples for common-model coordination

Supporting evidence for SPIKE-011 and CONTRACT-084, observed 2026-10-29.
These descriptions deliberately remove company labels, board IDs and raw data.
They are proposed conformance inputs, not new language authorities. The
**UMF Diagram Language** task owns shared model/version decisions.

| Reduced example | Current common vocabulary / adapter outcome | Proposed shared question |
| --- | --- | --- |
| Environment A contains Environment B and a data store; a process outside A connects to the store inside B | Visual groups/parent and roles can express some containment. Network profile 1 refuses groups. Exact shape nesting and attachment geometry stay native | Which containment is semantic grouping, deployment containment or presentation? Preserve their distinction rather than flatten nested shapes into peers |
| Process → document → multiple documents → data store | `document` and `store` roles already exist. Process/multiple-document shape intent and multiplicity have no exact automatic mapping | Is the common meaning a role, artifact multiplicity, shape intent or several independently typed concepts? Do not infer ontology from an icon alone |
| Sixteen-node coherent graph with twenty-four links | The inherited 15-node validity rule rejects it, even though density advice is separately reported | Replace inherited editorial validity limits only through an explicit model/version/migration decision |
| Two graph regions with independent heading, free annotation and frame title | Forcing every piece of text into a semantic node creates false graph entities; an authored question cannot be invented from a frame title | Distinguish document title, view/frame title, annotation and semantic node content |
| Curved link with a caption, endpoint attachment and cross-boundary route | Node endpoints/label project; exact attachment and routing do not. Native geometry remains available | Separate graph connectivity, ports, routing intent and exact native routing |
| Native actor symbol unsupported by the stable and experimental SDK shape APIs | SDK exposes identity/geometry, but cannot supply its full symbol definition. Native browser copy retains it | Preserve an opaque native representation and qualify understanding; never claim inferred actor semantics from incomplete API data |

The real source contained 72 API-visible items: 34 expanded shapes, 24
connectors, 1 frame, 4 groups, 7 free text and 2 opaque stencils. Twenty of the
22 stable-SDK stencils became flowchart shapes with the explicitly experimental
shape API: 6 magnetic disks, 9 processes, 3 multidocuments and 2 documents.
There are two distinct source diagrams: a development/data-processing flow and
a nested deployment/environment diagram. Their actual company content is not
published here. Raw captures, native clipboard and native UMF documents remain
under ignored `.cache/miro-live/`.

A native reconstruction test copied the selection into the supplied test board,
then repeated it from a preserved UMF document through the app's **Copy native
content from UMF** action. The 72 reproduced items matched tested content,
styles, captions, node dimensions, endpoint references, frame parents and group
memberships. Root layout differed only by a common paste translation; connector
dimension rounding was below 4e-13. This is evidence for the observed Miro
browser clipboard format/client 1.105493.0, not a stable format guarantee, pixel
proof or automatic common-model projection.

Shared `umf.visual` remains 1.0.0. Native board import produces a native-extension
UMF document rather than fabricating a partial common visual or dropping items.
CONTRACT-084 owns `umf.visual.miro` 1.0.0 and the bounded network profile; common
language changes belong to CONTRACT-083's successor and shared interchange work.
