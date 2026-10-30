// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document, Json} from '@umf/core';
import type {HostBinding,HostChange,HostLoss,HostMapping,HostObservation,HostResource} from '../reconciliation/types.js';

export const GOOGLE_SLIDES_PROFILE='umf.visual.google-slides.network/1' as const;
export type GoogleSlidesModelVersion='1.0.0'|'1.1.0';
export type GoogleSlidesMode='strict'|'report';
export type GoogleSlidesMappingKind='title'|'question'|'node'|'edge'|'edge-label';

export interface GoogleSlidesBox {x:number;y:number;width:number;height:number;}
export interface GoogleSlidesPlacement {
 question:GoogleSlidesBox;
 title?:GoogleSlidesBox;
 nodes:Record<string,GoogleSlidesBox>;
 edgeLabels?:Record<string,GoogleSlidesBox>;
}
export type GoogleSlidesResource=HostResource;
export type GoogleSlidesLoss=HostLoss;
export type GoogleSlidesMapping=HostMapping;
export interface GoogleSlidesObservation {
 presentationId:string;
 revisionId:string;
 captureDigestSha256:string;
 snapshot:SlidesPresentation;
}
export interface SlidesPresentation {
 presentationId:string;
 revisionId:string;
 pageSize:{width:{magnitude:number;unit:string};height:{magnitude:number;unit:string}};
 slides:Array<Record<string,unknown>>;
 [key:string]:unknown;
}
export type GoogleSlidesBinding=HostBinding & {profile:typeof GOOGLE_SLIDES_PROFILE;modelVersion:GoogleSlidesModelVersion};
export interface GoogleSlidesBatch {
 requests:Json[];
 writeControl:{requiredRevisionId:string};
}
export interface GoogleSlidesExportPlan {
 profile:typeof GOOGLE_SLIDES_PROFILE;
 modelVersion:GoogleSlidesModelVersion;
 mode:GoogleSlidesMode;
 source:Document;
 sourceDigestSha256:string;
 placement:GoogleSlidesPlacement;
 before:GoogleSlidesObservation;
 slideId:string;
 mappings:GoogleSlidesMapping[];
 losses:GoogleSlidesLoss[];
 batch:GoogleSlidesBatch;
}
export type GoogleSlidesChange=HostChange;
export interface GoogleSlidesImportResult {
 document:Document;
 original:Document;
 binding:GoogleSlidesBinding;
 observation:GoogleSlidesObservation;
 changes:GoogleSlidesChange[];
 nativeOnly:string[];
 unmapped:string[];
 losses:GoogleSlidesLoss[];
}
export interface GoogleSlidesUpdatePlan {
 profile:typeof GOOGLE_SLIDES_PROFILE;
 modelVersion:GoogleSlidesModelVersion;
 mode:GoogleSlidesMode;
 resource:GoogleSlidesResource;
 expectedBindingRevision:number;
 sourceDigestSha256:string;
 currentObservation:GoogleSlidesObservation;
 desiredSource:Document;
 desiredSourceDigestSha256:string;
 requests:Json[];
 changes:GoogleSlidesChange[];
 mappings:GoogleSlidesMapping[];
 losses:GoogleSlidesLoss[];
}
export interface GoogleSlidesHostApi {
 getPresentation(presentationId:string):Promise<unknown>;
 batchUpdate(presentationId:string,batch:GoogleSlidesBatch):Promise<unknown>;
}
export interface GoogleSlidesExportOptions {
 mode?:GoogleSlidesMode;
 namespace?:string;
}
export interface GoogleSlidesImportOptions {
 mode?:GoogleSlidesMode;
 currentDocument?:Document;
 expectedBindingRevision:number;
 before?:GoogleSlidesObservation;
}
export interface GoogleSlidesUpdateOptions {
 mode?:GoogleSlidesMode;
 expectedBindingRevision:number;
}
export interface GoogleSlidesAppliedExport {binding:GoogleSlidesBinding;observation:GoogleSlidesObservation;}
export interface GoogleSlidesAppliedUpdate {binding:GoogleSlidesBinding;observation:GoogleSlidesObservation;}
