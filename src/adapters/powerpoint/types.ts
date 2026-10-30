// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '@umf/core';
import type {HostBinding,HostChange,HostObservation,HostResource} from '../reconciliation/types.js';

export const POWERPOINT_PROFILE = 'umf.visual.powerpoint.network/1' as const;
export type PowerPointMode = 'strict' | 'report';
export interface PowerPointLoss {
  path: string;
  code: string;
  family: 'semantic' | 'native';
  representation: 'retained-only' | 'unrepresented';
  message: string;
}
export interface PowerPointMapping {
  logicalId: string;
  kind: 'title' | 'question' | 'node' | 'edge';
  path: string;
  nativeId: string;
  nativeScope: string;
}
export interface PowerPointExportOptions {mode?: PowerPointMode; bindingRevision?: number; resource?:HostResource;}
export interface PowerPointImportOptions {
  mode?: PowerPointMode;
  currentDocument?: Document;
  currentSourceSha256?: string;
  expectedBindingRevision?: number;
  binding?:HostBinding;
  /** Optional first read of the file; the importer supplies the second content-digest capture. */
  observedBefore?:HostObservation;
}
export interface PowerPointExportResult {
  bytes: Uint8Array;
  profile: typeof POWERPOINT_PROFILE;
  modelVersion: string;
  sourceSha256: string;
  bindingRevision: number;
  mappings: PowerPointMapping[];
  losses: PowerPointLoss[];
  binding:HostBinding;
  capture:HostObservation;
}
export interface PowerPointImportResult {
  document: Document;
  original: Document;
  profile: typeof POWERPOINT_PROFILE;
  modelVersion: string;
  sourceSha256: string;
  bindingRevision: number;
  mappings: PowerPointMapping[];
  losses: PowerPointLoss[];
  changes: HostChange[];
  nativeOnly: string[];
  unmapped: string[];
  binding:HostBinding;
  capture:HostObservation;
  artifactSha256:string;
  /** Exact bounded package parts for adapter-owned native-preserving updates. */
  retained: Map<string, Uint8Array>;
}
export interface PowerPointUpdateOptions extends PowerPointImportOptions {mode?: PowerPointMode;currentArtifactSha256?:string;currentArtifactBytes?:Uint8Array;}
export interface PowerPointUpdateResult extends PowerPointExportResult {}

