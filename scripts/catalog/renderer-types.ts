// SPDX-License-Identifier: MIT OR Apache-2.0
export type RendererId='dot'|'mermaid'|'lini'|'powerpoint'|'google-slides'|'miro';
export interface RendererTargetEvidence {
 rendererId:RendererId;profileId:string;modelVersion:string;mappingVersion:string;
 projection:{state:'emitted'|'planned'|'refused'|'not-attempted';status:'supported'|'reported-loss'|'unsupported'|'not-evaluated';diagnostics:unknown[];losses:unknown[]};
 artifacts?:Array<{path:string;sha256:string;mediaType:string;bytes?:number}>;
 preview?:{state:'rendered'|'failed'|'unavailable';engine:string;nativeVersion:string;sourceSha256:string;profileId:string;modelVersion:string;mappingVersion:string;inputArtifactSha256?:string;captureDigestSha256?:string;revision?:string;stage:string;asset?:{path:string;sha256:string;mediaType:string;width:number;height:number};error?:string};
 roundTrip?:Record<string,unknown>;
}
