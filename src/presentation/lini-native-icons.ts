// SPDX-License-Identifier: MIT OR Apache-2.0
/** Pinned native Lini Phosphor symbols shared by sequence drawing profiles. */
const nativeIcons=new Set(['user','rocket','seal','presentation','heart','gear','cloud','house','database','folder-simple','cpu','bell','star','ghost','video-camera','wall','check','warning','globe','lock','key','lightning','magnifying-glass','arrow-right']);
export const liniNativeIcon=(value:string):string|undefined=>nativeIcons.has(value)?value:undefined;
