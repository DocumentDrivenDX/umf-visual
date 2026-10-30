---
ddx:
  id: visual.vision
  type: product-vision
  activity: discover
  authoring:
    home: repo
---

# Visual authoring and interchange library vision

## Mission Statement

Give semantic-tool producers and renderer implementers a shared typed visual
authoring model and explicit native mappings, so common visual concepts can be
authored once and exchanged without unreported loss.

## Positioning

For HELIX/documentor producers, schema-browser maintainers and independent
renderer authors, umf-visual is a system library for typed visual authoring and
validated interchange, analogous to UMF core for shared semantic definitions.
Compared with independently maintained Mermaid strings, DOT exporters and
renderer-specific objects, it makes identity and preservation obligations explicit.

## Vision

A semantic producer turns selected metadata, such as a UMF schema, into one
typed visual definition. That model grows to encompass the common concepts and
properties used by native visual tools, preserving distinctions where their
meanings differ. Format adapters and renderers consume the same authored intent
under separate versioned support profiles. The library evolves independently
of UMF's generic core and any single renderer.

**North Star**: A format change preserves meaning or names its loss.

## User Experience

A schema-browser maintainer selects entities and fields from a UMF definition,
authors the reader's question and visual intent, and validates the resulting
visual model. They compare native targets through their support profiles, then
inspect generated source, identity mappings and actual native renderings. Loss
reports distinguish meaning that needs model evolution or mapping work; retained
native content remains available for meanings outside current interpretation.

## Target Market

| Attribute | Description |
| --- | --- |
| Who | Library consumers maintaining HELIX producers, schema browsers and visual renderers |
| Pain | Independent visual object shapes and exporters obscure lost meaning |
| Current Solution | PR62 vocabulary, local diagram spike, separate native-format producers |
| Why They Switch | One versioned contract and explicit preservation reports reduce ambiguous integration |

## Key Value Propositions

| Value Proposition | Customer Benefit |
| --- | --- |
| Shared typed authoring vocabulary | Semantic producers express common visual intent independently of a target tool |
| Source-preserving adapters | Native details survive an incomplete projection |
| Independent library releases | Consumers can select compatibility deliberately |

## Success Definition

| Metric | Target |
| --- | --- |
| Consumer agreement | Compare acceptance and diagnostics across declared consumers; targets belong to adapter contracts |
| Preservation | Compare retained source and identity maps in the conformance corpus |
| Visible loss | Review negative fixtures and classify model gaps, mapping gaps and native retention needs |

## Why Now

UMF #62, HELIX #99/#101 and ux-builder #69 propose a shared visual pipeline while
the local UMF-authored diagram/Lini spike tests another consumer. Extraction
provides one ownership boundary before these definitions diverge. Sources and
their as-of date are recorded in the research note.
