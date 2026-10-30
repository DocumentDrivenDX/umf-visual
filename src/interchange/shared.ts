// SPDX-License-Identifier: MIT OR Apache-2.0
import type {IdentityMapping,InterchangeDiagnostic,SourceRange} from './types';

export const VISUAL_PATH = '/extensions/umf.visual';
export function interchangeDiagnostic(
 code:string,path:string,message:string,
 options:{severity?:'error'|'warning';loss?:boolean;range?:SourceRange}={},
):InterchangeDiagnostic {
 return {code,path,message,severity:options.severity??'warning',loss:options.loss??true,
  ...(options.range?{range:options.range}:{})};
}
export function identityMapping(
 kind:IdentityMapping['kind'],nativeId:string,visualId:string,path:string,sourcePath?:string,
):IdentityMapping {
 return {kind,nativeId,visualId,path,...(sourcePath===undefined?{}:{sourcePath})};
}
/** Synthetic ids avoid restrictions/collisions in native identifiers without normalizing them. */
export function syntheticId(kind:'node'|'edge'|'group'|'reference',index:number):string {
 return ({node:'n',edge:'e',group:'g',reference:'r'} as const)[kind]+(index+1);
}
