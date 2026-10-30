// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document, Json} from '@umf/core';
export const MIRO_PROFILE = 'umf.visual.miro.network/1' as const;
export const MIRO_METADATA_KEY = 'umf-visual';
export type MiroItemKind = 'node' | 'edge' | 'question';
export type MiroMode = 'strict' | 'report';
export interface MiroLoss {path: string; code: 'RETAINED_ONLY'; message: string;}
export interface MiroShapeInput {
  shape: 'rectangle'; content: string; x: number; y: number; width: number; height: number;
}
export interface MiroConnectorInput {
  shape: 'straight';
  start: {item: string; snapTo: 'auto'};
  end: {item: string; snapTo: 'auto'};
  captions: {content: string; position: number}[];
  style: {startStrokeCap: 'none'; endStrokeCap: 'stealth'};
}
/** Structural subset of Web SDK v2. Inject miro.board; no global SDK dependency. */
export interface MiroItem {
  id: string; type: string;
  getMetadata?(key: string): Promise<unknown>;
  setMetadata?(key: string, value: unknown): Promise<void>;
}
export interface MiroBoard {
  getInfo(): Promise<{id: string}>;
  get(): Promise<MiroItem[]>;
  experimental?: {get(filter: {type: 'shape'}): Promise<MiroItem[]>};
  createShape(input: MiroShapeInput): Promise<MiroItem>;
  createConnector(input: MiroConnectorInput): Promise<MiroItem>;
}
export interface MiroIdentity {
  profile: typeof MIRO_PROFILE; boardId: string; visualId: string;
  exportId: string; logicalId: string; kind: MiroItemKind;
}
export interface MiroMapping {logicalId: string; nativeId: string; kind: MiroItemKind;}
export interface MiroSnapshot {id: string; type: string; data: {[key: string]: Json}; metadata: Json; omittedApiMembers?: string[]; metadataCoverage?: 'unsupported-for-item-type';}
export interface MiroCapture {
  boardId: string; items: MiroSnapshot[];
  coverage: 'api-visible-items'; sdkMode?: 'experimental-shapes';
}
export interface MiroBundle {
  profile: typeof MIRO_PROFILE; boardId: string; exportId: string;
  source: Document; mode: MiroMode; losses: MiroLoss[];
  mappings: MiroMapping[]; baseline: MiroSnapshot[];
  state: 'writing' | 'complete' | 'interrupted';
  pending?: {logicalId: string; kind: MiroItemKind; nativeId?: string};
}
export interface MiroPlan {
  source: Document; mode: MiroMode; losses: MiroLoss[];
  shapes: {logicalId: string; kind: 'node' | 'question'; input: MiroShapeInput}[];
  connectors: {logicalId: string; from: string; to: string; label?: string}[];
}
export interface MiroExportOptions {
  mode?: MiroMode; exportId: string;
  /** Called before each mutation and after each completed item. Persist this copy. */
  checkpoint?: (bundle: MiroBundle) => void | Promise<void>;
}
export interface MiroImportResult {
  document: Document; original: Document; bundle: MiroBundle; capture: MiroCapture;
  changes: {path: string; before: Json; after: Json}[];
  nativeOnly: string[]; unmapped: string[];
}
