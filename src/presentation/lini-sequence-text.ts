// SPDX-License-Identifier: MIT OR Apache-2.0
/** Shared bounded text helpers for native Lini sequence compositions. */
export function wrapLiniSequenceText(text:string,maxCharacters:number):string[]{
 const lines:string[]=[];
 for(const paragraph of text.split('\n')){let line='';for(const word of paragraph.split(/\s+/u).filter(Boolean)){const next=line?line+' '+word:word;if(line&&Array.from(next).length>maxCharacters){lines.push(line);line=word;}else line=next;}lines.push(line);}
 return lines;
}
export function liniSequenceParticipantFieldText(field:'detail'|'role'|'status',value:string):string{return field==='detail'?value:field==='role'?(value==='process'?'Process':'Role: '+value):'Status: '+value;}
