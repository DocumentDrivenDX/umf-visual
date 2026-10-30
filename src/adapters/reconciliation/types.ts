// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document, Json} from '@umf/core';
export type Host = 'powerpoint' | 'google-slides' | 'miro';
export interface NativeRevision {kind:'host-revision'|'content-digest'; value:string}
export interface HostResource {host:Host; documentId:string; pageId?:string}
export interface HostMapping {logicalId:string; kind:string; path:string; nativeId:string; nativeScope:string}
export interface HostLoss {path:string; code:string; family:'semantic'|'native'; representation:'retained-only'|'unrepresented'; message:string}
export interface HostObservation {resource:HostResource; revision:NativeRevision; captureDigestSha256:string; payload:Json}
export interface HostBinding {
 profile:string; modelVersion:'1.0.0'|'1.1.0'; resource:HostResource; bindingRevision:number;
 source:Document; sourceDigestSha256:string; baselineNative:HostObservation;
 mappings:HostMapping[]; losses:HostLoss[]; state:'writing'|'complete'|'interrupted'; pending?:Json;
}
export interface ReconcileFence {expectedBindingRevision:number; observedBefore:HostObservation; observedAfter:HostObservation}
export type HostPresence = {present:false}|{present:true;value:Json};
export interface HostChange {path:string;before:HostPresence;after:HostPresence}
export interface HostDiagnostic {code:string;path:string;message:string}
export interface HostReconcileProposal {document:Document; changes:HostChange[]; nativeOnlyChanges:string[]; losses?:HostLoss[]}
export type HostReconcileResult =
 | {ok:true;document:Document;binding:HostBinding;capture:HostObservation;changes:HostChange[];nativeOnlyChanges:string[];losses:HostLoss[];diagnostics:HostDiagnostic[]}
 | {ok:false;original?:Document;binding?:HostBinding;capture?:HostObservation;diagnostics:HostDiagnostic[]};
