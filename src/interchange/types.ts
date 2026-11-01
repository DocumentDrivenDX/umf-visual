// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '@umf/core';
import type {Visual} from '../extensions/visual';
import type {ProjectionCoverage} from './annotations';

export type InterchangeFormat = 'dot' | 'mermaid' | 'lini';
export type InterchangeMode = 'strict' | 'allow-reported-loss';
/** Explicit opt-in; omitted profiles retain the released native behavior. */
export type AnnotatedInterchangeProfile = 'umf.visual.dot.annotated/1'|'umf.visual.lini.annotated/1'|'umf.visual.mermaid.annotated/1';
export type FullInterchangeProfile = 'umf.visual.dot.full/1'|'umf.visual.mermaid.full/1'|'umf.visual.lini.full/1';
export type InterchangeProfile = AnnotatedInterchangeProfile|FullInterchangeProfile;
export type {VisualApproximation,FullProjectionRepresentation} from './full/types';
export interface SourceRange {start:number;end:number;}
/** Paths are JSON Pointers. Import paths begin /source; export paths address the document. */
export interface InterchangeDiagnostic {
 code:string;
 path:string;
 message:string;
 severity:'error'|'warning';
 /** True whenever meaning or native content is absent from the projection/output. */
 loss:boolean;
 /** Half-open offsets in the original string, measured in UTF-16 code units. */
 range?:SourceRange;
}
export interface IdentityMapping {
 kind:'node'|'edge'|'group'|'field'|'reference'|'participant'|'message'|'series'|'category'|'point'|'event'|'span'|'period'|'lane'|'criterion'|'item'|'value';
 /** Exact native identity, or an explicitly occurrence-qualified identity for anonymous edges. */
 nativeId:string;
 /** Field identities use their owning node id; path disambiguates individual fields. */
 visualId:string;
 /** JSON Pointer into the UMF document, including /extensions/umf.visual. */
 path:string;
 sourcePath?:string;
}
export interface AdapterContext {id:string;question:string;profile?:InterchangeProfile;}
export interface AdapterParseResult {
 visual?:Visual;
 diagnostics:InterchangeDiagnostic[];
 identityMap:IdentityMapping[];
}
export interface AdapterSerializeResult {
 text?:string;
 diagnostics:InterchangeDiagnostic[];
 identityMap:IdentityMapping[];
}
export interface VisualInterchangeAdapter {
 format:InterchangeFormat;
 /** Adapter profile version, distinct from a native parser/runtime version. */
 version:string;
 subset:string;
 parse(source:string,context:AdapterContext):AdapterParseResult;
 serialize(visual:Visual,context:AdapterContext):AdapterSerializeResult;
}
export interface ImportVisualOptions extends AdapterContext {
 format:InterchangeFormat;
 mode?:InterchangeMode;
}
export interface RetainedVisualSource {
 format:InterchangeFormat;
 text:string;
 /** Options that determine source interpretation; policy is reevaluated by the facade. */
 importOptions:AdapterContext;
 /** Canonical whole-document JSON; reparse comparison is also mandatory before replay. */
 baseline:string;
 identityMap:IdentityMapping[];
}
export interface ExportVisualOptions {
 format:InterchangeFormat;
 profile?:InterchangeProfile;
 mode?:InterchangeMode;
 source?:RetainedVisualSource;
 /** Request exact retained source. Requires matching format and an unchanged, reparsed document. */
 original?:boolean;
}
export interface ImportVisualResult {
 ok:boolean;
 document?:Document;
 /** Always returned, including syntax, strict-policy and limit refusals. */
 source:RetainedVisualSource;
 diagnostics:InterchangeDiagnostic[];
 identityMap:IdentityMapping[];
 profile?:InterchangeProfile;
 approximations?:import('./full/types').VisualApproximation[];
 representation?:import('./full/types').FullProjectionRepresentation;
 coverage?:ProjectionCoverage[];
}
export interface ExportVisualResult {
 ok:boolean;
 text?:string;
 source?:RetainedVisualSource;
 diagnostics:InterchangeDiagnostic[];
 identityMap:IdentityMapping[];
 profile?:InterchangeProfile;
 approximations?:import('./full/types').VisualApproximation[];
 representation?:import('./full/types').FullProjectionRepresentation;
 coverage?:ProjectionCoverage[];
}

/** Declaration of a bounded mapping; executed native evidence belongs in verification receipts. */
export interface InterchangeCapability {
 format:InterchangeFormat;
 profile:string;
 version:string;
 subset:string;
 directions:('import'|'export')[];
}
