// SPDX-License-Identifier: MIT OR Apache-2.0
import type {InterchangeFormat} from '../types';

/** Visible scalar/container slots. Values use the shared annotation wire codec. */
export interface FullRecord {id:string;path:string;name:string;type:'string'|'number'|'boolean'|'null'|'array'|'object';value:string;}
/** Width is a visual extent in CSS pixels (96 px per inch). */
export interface FullNode {id:string;recordId?:string;identityRecordId?:string;text?:string;shape:'box'|'ellipse'|'diamond'|'note';group?:string;width?:number;}
export interface FullEdge {id:string;from:string;to:string;directed?:boolean;recordId?:string;fromRecordId?:string;toRecordId?:string;text?:string;}
export interface FullGroup {id:string;recordId?:string;text?:string;parent?:string;}
export interface VisualApproximation {path:string;requested:string;renderedAs:string;reason:string;}
/** Requested full profile and actual source grammar are distinct identities. */
export interface FullProjectionRepresentation {
 tier:'native-profile'|'primitive-fallback';
 sourceProfile:string;
 sourceMappingVersion:string;
 coverageModel:'native-concepts-and-annotations'|'visible-record-tree';
 wholeDocumentReadback:true;
}
export interface FullScene {
  format:InterchangeFormat;
  profile:string;
  version:'1';
  kind:string;
  form:string;
  records:FullRecord[];
  nodes:FullNode[];
  edges:FullEdge[];
  groups:FullGroup[];
  approximations:VisualApproximation[];
  /** Derived by independent native readers; never an authoritative input value. */
  locators?:Record<string,{id:string;slot:string}[]>;
}
/** Readers derive every record value from a visible native text/value slot. */
export interface FullNativeAdapter {
  format:InterchangeFormat;
  emit(scene:FullScene):string;
  read(source:string):FullScene;
}
