// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document, Json} from '@umf/core';
import type {HostBinding, HostChange, HostLoss, HostMapping, HostObservation, HostResource, NativeRevision} from '../../reconciliation/types.js';
export type {NativeRevision} from '../../reconciliation/types.js';

export const MIRO_EDITABLE_PROFILE = 'umf.visual.miro.editable-network/1' as const;
export const MIRO_EDITABLE_METADATA_KEY = 'umf-visual-editable';
export type EditableMode = 'strict' | 'report';
export type EditableKind = 'title' | 'question' | 'node' | 'edge' | 'group';
export type EditableResource = HostResource;
export type EditableMapping = HostMapping;
export type EditableLoss = HostLoss;
export type EditableChange = HostChange;
export type EditableSnapshot = {id: string; type: string; data: Record<string, Json>; metadata: Json; omittedApiMembers?: string[]; metadataCoverage?: 'unsupported-for-item-type'};
export type EditableObservation = HostObservation;
export type EditableBinding = HostBinding;
export type EditablePlan = {
  profile: typeof MIRO_EDITABLE_PROFILE;
  modelVersion: '1.0.0' | '1.1.0';
  source: Document;
  sourceDigestSha256: string;
  mode: EditableMode;
  losses: EditableLoss[];
  nodes: {logicalId: string; label: string; index: number}[];
  title?: string;
  question: string;
  edges: {logicalId: string; from: string; to: string; label?: string; index: number}[];
  groups: {logicalId: string; members: string[]; index: number}[];
};
export type EditableImportResult = {
  document: Document;
  original: Document;
  binding: EditableBinding;
  observation: EditableObservation;
  changes: EditableChange[];
  nativeOnly: string[];
  unmapped: string[];
  losses: EditableLoss[];
};
export type EditableCheckpoint = (binding: EditableBinding) => void | Promise<void>;
export type EditableExportOptions = {bindingId: string; mode?: EditableMode; revisionProvider?: () => Promise<NativeRevision>; checkpoint?: EditableCheckpoint};
export type EditableUpdateOptions = {expectedBindingRevision: number; mode?: EditableMode; revisionProvider?: () => Promise<NativeRevision>; checkpoint?: EditableCheckpoint};

/** Minimal injected Miro Web SDK v2 surface used by the portable adapter. */
export interface EditableMiroItem {
  id: string;
  type: string;
  [key: string]: unknown;
  sync?(): Promise<void>;
  getMetadata?(key?: string): Promise<unknown>;
  setMetadata?(key: string, value: unknown): Promise<void>;
}
export interface EditableMiroGroup {
  id: string;
  type: 'group';
  itemsIds?: string[];
  getItems?(): Promise<EditableMiroItem[]>;
  sync?(): Promise<void>;
}
export interface EditableMiroBoard {
  getInfo(): Promise<{id: string}>;
  get(): Promise<(EditableMiroItem | EditableMiroGroup)[]>;
  createShape(input: {shape: 'rectangle'; content: string; x: number; y: number; width: number; height: number}): Promise<EditableMiroItem>;
  createConnector(input: {shape: 'straight'; style: {startStrokeCap: 'none'; endStrokeCap: 'stealth'}; start: {item: string; snapTo: 'auto'}; end: {item: string; snapTo: 'auto'}; captions: {content: string; position: number}[]}): Promise<EditableMiroItem>;
  group?(input: {items: EditableMiroItem[]}): Promise<EditableMiroGroup>;
}
export type RevisionProvider = () => Promise<NativeRevision>;
