---
ddx:
  id: visual.vision
  type: product-vision
  activity: discover
  authoring:
    home: repo
---

# Visual interchange library vision

## Mission Statement

Give visual producers and renderer implementers a typed UMF vocabulary and
explicit format mappings so visual meaning can move between tools without
unreported loss.

## Positioning

For HELIX/documentor producers, schema-browser maintainers and independent
renderer authors, umf-visual is a system library for validated visual meaning.
Compared with independently maintained Mermaid strings, DOT exporters and
renderer-specific objects, it makes identity and preservation obligations explicit.

## Vision

A producer describes the question and visual structure once. Consumers validate
the same versioned definition and disclose the meaning their format cannot carry.
The library evolves independently of UMF's generic core and any single renderer.

**North Star**: A format change preserves meaning or names its loss.

## User Experience

A schema-browser maintainer produces an entities view, validates its references,
and asks an adapter for Lini source. The adapter returns output, stable identity
maps and a report of unsupported meaning. A renderer draws the supported view;
the original source and omissions remain inspectable. This interchange scenario
is the desired direction; the extracted bootstrap supplies vocabulary APIs only.

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
| Portable typed vocabulary | Producers and renderers agree on declared meaning |
| Source-preserving adapters | Native details survive an incomplete projection |
| Independent library releases | Consumers can select compatibility deliberately |

## Success Definition

| Metric | Target |
| --- | --- |
| Consumer agreement | Compare acceptance and diagnostics across declared consumers; targets belong to adapter contracts |
| Preservation | Compare retained source and identity maps in the conformance corpus |
| Visible loss | Review negative fixtures for every unrepresented construct in a supported subset |

## Why Now

UMF #62, HELIX #99/#101 and ux-builder #69 propose a shared visual pipeline while
the local UMF-authored diagram/Lini spike tests another consumer. Extraction
provides one ownership boundary before these definitions diverge. Sources and
their as-of date are recorded in the research note.
