# Extraction research and provenance

As of 2026-10-29, the user requested a sibling visual library with its own HELIX
stack, and authorized a targeted HELIX workflow extension if necessary.

## Source cuts

- [UMF #62](https://github.com/DocumentDrivenDX/umf/pull/62), exact source
  `351c4802caf34eb7f4174e7b730f86f4befcf909`: vocabulary implementation,
  schemas/manifest, original tests, 50 documents, inventory and fictional sources.
- [UMF #13](https://github.com/DocumentDrivenDX/umf/pull/13), merged: neutral
  dashboard vocabulary with qualified references, opaque expressions and explicit
  native preservation obligations; it does not prove cross-BI equivalence.
- [UMF #46](https://github.com/DocumentDrivenDX/umf/pull/46), merged: generic
  extension-owned kind discovery, exact identities and trusted registration.
- [UMF #42](https://github.com/DocumentDrivenDX/umf/pull/42), open source cut
  `26b0360d19abb8ca59fbc4302d5c00b0fcc14773`: native Lakeview composition,
  core Record/Field reuse, exact untouched recovery and refusal after unsupported
  edits. Neutral legacy dashboard projection is explicit, not mandatory storage.
- [HELIX #99](https://github.com/DocumentDrivenDX/helix/pull/99) selects visual
  forms; [HELIX #101](https://github.com/DocumentDrivenDX/helix/pull/101) produces
  them; [ux-builder #69](https://github.com/DocumentDrivenDX/ux-builder/pull/69)
  owns rendering. These are open proposals at this research cut.
- The local UMF-authored diagram/Lini spike demonstrates a second model/compiler
  approach. It is unpublished work, not an independently released dependency.

## Direction supported by the research

Use a separately versioned extension package, optional native-format adapters,
and independent renderer consumers. Reuse generic UMF mechanisms; keep visual
meaning out of core. Retain native representations rather than forcing every
source into a lowest-common-denominator visual. Treat no-op recovery, edited
rewrites, semantic projection and rendering as separate support claims.

DOT (.gv/.dot), Mermaid diagram families and Lini need distinct versioned
profiles and native conformance evidence. Current bootstrap implements none of
these adapters. The next shape-authority step should define umf.visual in UMF
through umf.metamodel; the imported implementation remains handwritten today.

## Inherited graph references

Imported FEAT-034, US-093, CONTRACT-083 and TD-093 retain their original IDs,
frontmatter and ddx.links. IDs `umf.prd`, `umf.cross-cutting-requirements`,
`umf.architecture`, CONTRACT-001 and FEAT-026 denote upstream UMF authorities,
not missing local replacements. Resolve them in the #62 source tree; local
architecture governs extraction packaging only. CONTRACT-083 also names the
different Lakeview contract in #42: these IDs are repository/source scoped and
must not be conflated during future graph federation.

## Unknowns

Exact initial format subsets, supported runtime/version matrix, generated
constraint coverage, vocabulary expansion and native rewrite support remain
undecided. The inherited fixture builder lives outside #62; checked-in fixtures
are source-pinned snapshots, not claimed reproducible native producers here.
