// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Json} from '@umf/core';
import {canonicalHostJson,copyHostJson} from '../reconciliation/json.js';

export const GOOGLE_SLIDES_LIMITS={maxCaptureBytes:16*1024*1024,maxDepth:64,maxObjects:10_000,maxNodes10:15,maxNodes11:64,maxEdges:256,maxGroups:32,maxGroupDepth:8} as const;

export class GoogleSlidesError extends Error {
 constructor(public readonly code:string,message:string,public readonly recovery?:unknown,public readonly path?:string){super(message);this.name='GoogleSlidesError';}
}
export function requireSlides(condition:unknown,code:string,message:string,recovery?:unknown,path?:string):asserts condition {
 if(!condition)throw new GoogleSlidesError(code,message,recovery,path);
}
export function isRecord(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
export function ownRecord(value:unknown,path:string):Record<string,unknown>{requireSlides(isRecord(value),'INPUT','Expected a plain JSON object',undefined,path);return value;}
export function ownString(value:unknown,path:string):string{requireSlides(typeof value==='string','INPUT','Expected a string',undefined,path);return value;}
export function copyOwned<T>(value:T,code='INPUT'):T{
 try{return copyHostJson(value) as T;}catch(error){throw new GoogleSlidesError(code,error instanceof Error?error.message:'Input is not owned JSON');}
}
export function canonical(value:unknown):string{
 try{return canonicalHostJson(value);}catch(error){throw new GoogleSlidesError('INPUT',error instanceof Error?error.message:'Input is not owned JSON');}
}
export function utf8Bytes(text:string):number{return new TextEncoder().encode(text).byteLength;}
export function checkDepth(value:unknown,max=GOOGLE_SLIDES_LIMITS.maxDepth):void{
 const visit=(item:unknown,depth:number):void=>{requireSlides(depth<=max,'LIMIT','JSON depth exceeds the host profile');if(Array.isArray(item))for(const child of item)visit(child,depth+1);else if(isRecord(item))for(const child of Object.values(item))visit(child,depth+1);};visit(value,0);
}
export function hasUnpairedSurrogate(value:string):boolean{
 for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(i+1);if(!(next>=0xdc00&&next<=0xdfff))return true;i++;}else if(code>=0xdc00&&code<=0xdfff)return true;}return false;
}
export function checkSlidesText(value:string,path:string):void{
 requireSlides(!hasUnpairedSurrogate(value),'TEXT','Text contains an unpaired surrogate',undefined,path);
 requireSlides(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ue000-\uf8ff\u{f0000}-\u{ffffd}\u{100000}-\u{10fffd}]/u.test(value),'TEXT','Text uses a control or private-use character outside the qualified Slides subset',undefined,path);
}
export function pointerEscape(value:string):string{return value.replace(/~/g,'~0').replace(/\//g,'~1');}
export function pointerJoin(base:string,key:string|number):string{return base+'/'+pointerEscape(String(key));}
export async function sha256(value:string):Promise<string>{
 const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function json(value:unknown):Json{return copyOwned(value) as Json;}
