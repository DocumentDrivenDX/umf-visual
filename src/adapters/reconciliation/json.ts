// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Json} from '@umf/core';
export class HostBindingError extends Error {
 constructor(public readonly code:string,message:string,public readonly path=''){super(message);this.name='HostBindingError';}
}
export function demand(condition:unknown,code:string,message:string,path=''):asserts condition {
 if(!condition)throw new HostBindingError(code,message,path);
}
/** Admit finite, detached JSON without invoking getters, iterators or toJSON. */
export function copyHostJson<T>(input:T):T {
 const ancestors=new Set<object>();let members=0;
 const visit=(value:unknown,depth:number):Json=>{
  demand(depth<=64&&++members<=200_000,'LIMIT','JSON depth/member limit exceeded');
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'){demand(Number.isFinite(value),'INPUT','Expected finite JSON number');return value;}
  demand(typeof value==='object'&&value!==null,'INPUT','Expected JSON value');
  demand(!ancestors.has(value),'INPUT','Cyclic JSON value');
  const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);
  demand(array||prototype===Object.prototype||prototype===null,'INPUT','Expected plain JSON object');
  const descriptors=Object.getOwnPropertyDescriptors(value) as Record<string,PropertyDescriptor>;
  demand(!Object.getOwnPropertySymbols(value).length,'INPUT','Symbol keys are not JSON');
  ancestors.add(value);let result:Json;
  if(array){
   const length=descriptors.length?.value;
   demand(Number.isSafeInteger(length)&&length>=0&&length<=100_000,'LIMIT','Invalid JSON array length');
   demand(Object.keys(descriptors).length===length+1,'INPUT','Sparse arrays and extra array properties refuse');
   const output:Json[]=[];
   for(let i=0;i<length;i++){const d=descriptors[String(i)];demand(d&&'value'in d&&d.enumerable,'INPUT','Array getters and holes refuse');output.push(visit(d.value,depth+1));}
   result=output;
  }else{
   const entries:Array<[string,Json]>=[];
   for(const[key,d]of Object.entries(descriptors)){demand('value'in d&&d.enumerable,'INPUT','Object getters and hidden fields refuse');entries.push([key,visit(d.value,depth+1)]);}
   result=Object.fromEntries(entries);
  }
  ancestors.delete(value);return result;
 };
 const result=visit(input,0);
 demand(new TextEncoder().encode(canonicalAdmitted(result)).length<=16*1024*1024,'LIMIT','JSON exceeds 16 MiB');
 return result as T;
}
function canonicalAdmitted(value:Json):string {
 if(value===null||typeof value!=='object')return Object.is(value,-0)?'-0':JSON.stringify(value);
 if(Array.isArray(value))return'['+value.map(canonicalAdmitted).join(',')+']';
 return'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalAdmitted(value[key]!)).join(',')+'}';
}
export const canonicalHostJson=(value:unknown):string=>canonicalAdmitted(copyHostJson(value) as Json);
export async function hostDigest(value:unknown):Promise<string>{
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalHostJson(value)));
 return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
export function exactKeys(value:Record<string,unknown>,allowed:string[],required=allowed):void {
 demand(Object.keys(value).every(key=>allowed.includes(key))&&required.every(key=>Object.hasOwn(value,key)),'BINDING','Unexpected or missing companion fields');
}
export const nonempty=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=4096;
export const sha256=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
