// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '@umf/core';
import type {Visual} from '../../extensions/visual';
import {readJsonPointer,type AnnotationEntry} from './index';
const ROOT='/extensions/umf.visual';
const canonical=(value:unknown):string=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export function annotationOwnerName(path:string,visual:Visual):string {
 const parts=path.slice(ROOT.length+1).split('/');
 if(['nodes','edges','groups'].includes(parts[0])&&/^(0|[1-9][0-9]*)$/.test(parts[1]??'')){
  const object=(visual as any)[parts[0]]?.[Number(parts[1])];if(!object?.id)throw new Error('Annotation owner is absent');parts[1]='['+JSON.stringify(object.id)+']';
 }
 return parts.map((part,index)=>index&&part.startsWith('[')?part:(index?'.':'')+part.replace(/~1/g,'/').replace(/~0/g,'~')).join('');
}
export function applyAnnotationEntries(document:Document,entries:AnnotationEntry[]):void {
 const created=new WeakSet<object>();
 const ordered=[...entries].sort((a,b)=>a.path.split('/').length-b.path.split('/').length||a.path.localeCompare(b.path));
 for(const entry of ordered){
  // Admission checks pointer bounds, escapes and dangerous property names.
  readJsonPointer({},entry.path);
  const parts=entry.path.slice(1).split('/').map(p=>p.replace(/~1/g,'/').replace(/~0/g,'~'));let owner:any=document;
  for(const segment of parts.slice(0,-1)){if(owner===null||typeof owner!=='object'||!Object.hasOwn(owner,segment))throw new Error('Annotation has no declared owner at '+entry.path);owner=owner[segment];}
  const key=parts.at(-1)!;if(Array.isArray(owner)&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=owner.length))throw new Error('Annotation index exceeds declared array');
  const value=entry.value;
  const next=value.kind==='array'?Array.from({length:value.length},()=>null):value.kind==='object'?Object.fromEntries(value.members.map(name=>[name,null])):value.kind==='null'?null:value.value;
  if(Object.hasOwn(owner,key)&&!(created.has(owner)&&(owner as any)[key]===null)&&canonical(owner[key])!==canonical(next))throw new Error('Annotation conflicts with an intrinsic native value at '+entry.path);
  owner[key]=next;
  if(next!==null&&typeof next==='object')created.add(next);
 }
}
