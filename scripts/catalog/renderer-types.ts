// SPDX-License-Identifier: MIT OR Apache-2.0
export type RendererId='dot'|'mermaid'|'lini'|'powerpoint'|'google-slides'|'miro';
export interface RendererTargetEvidence {
 rendererId:RendererId;profileId:string;modelVersion:string;mappingVersion:string;
 projection:{state:'emitted'|'planned'|'refused'|'not-attempted';status:'supported'|'reported-loss'|'unsupported'|'not-evaluated';diagnostics:unknown[];losses:unknown[]};
 artifacts?:Array<{path:string;sha256:string;mediaType:string;bytes?:number}>;
 preview?:{state:'rendered'|'failed'|'unavailable';engine:string;nativeVersion:string;sourceSha256:string;profileId:string;modelVersion:string;mappingVersion:string;inputArtifactSha256?:string;captureDigestSha256?:string;revision?:string;stage:string;asset?:{path:string;sha256:string;mediaType:string;width:number;height:number};rawAsset?:{path:string;sha256:string;mediaType:string;width:number;height:number};presentation?:{id:string;version:string;rendererOptions:unknown;svgNormalization:string};error?:string};
 roundTrip?:Record<string,unknown>;
}

/** Canonical full-profile renderer qualification; deliberately separate from compatibility rendererTargets. */
export interface FullRendererTargetEvidence {
 rendererId:'dot'|'mermaid'|'lini'; profileId:string; modelVersion:string; mappingVersion:string;
 projection:{state:'emitted';status:'supported';diagnostics:unknown[];losses:unknown[]};
 representation:Record<string,unknown>; approximations:unknown[];
 sourceDocument:{path:string;sha256:string};
 identityMap:{count:number;sha256:string};
 sourceArtifact:{path:string;sha256:string;mediaType:string;bytes:number};
 focusedSourceArtifact:{path:string;sha256:string;mediaType:string;bytes:number};
 wholeDocumentReadback:{state:'passed';mode:'strict';changes:0;sourceSha256:string;documentSha256:string;diagnostics:unknown[]};
 native:{engine:'graphviz'|'mermaid'|'lini';nativeVersion:string;
  diagnostics:unknown[];
  complete:{sourceSha256:string;svgArtifact:{path:string;sha256:string;mediaType:string;bytes:number;width:number;height:number};witness:Record<string,unknown>};
  focused:{sourceSha256:string;svgArtifact:{path:string;sha256:string;mediaType:string;bytes:number;width:number;height:number};witness?:Record<string,unknown>};};
 completePreview:NonNullable<RendererTargetEvidence['preview']>;
 preview:NonNullable<RendererTargetEvidence['preview']>;
 stableBuild:{state:'verified';sourceSha256:string;focusedSourceSha256:string;documentSha256:string;identityMapSha256:string;deterministicSourceAndMapping:true};
}
