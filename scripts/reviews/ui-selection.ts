// SPDX-License-Identifier: MIT OR Apache-2.0
/** Validate review UI selectors before a browser process is launched. */
export interface ReviewUiSelection<T extends {id:string}> {
 mode:'all'|'selected';
 requestedIds:string[];
 selectedIds:string[];
 selected:T[];
 totalExamples:number;
 sharedControls:true;
}

const validId=(value:string)=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);

export function selectReviewUiExamples<T extends {id:string}>(examples:T[],args:readonly string[]):ReviewUiSelection<T>{
 if(!Array.isArray(examples)||examples.length===0)throw new Error('Review UI selection requires a nonempty review manifest.');
 const byId=new Map<string,T>();
 for(const example of examples){
  if(!example||typeof example.id!=='string'||!validId(example.id))throw new Error('Review manifest contains a malformed example ID.');
  if(byId.has(example.id))throw new Error(`Review manifest contains duplicate example ID ${example.id}.`);
  byId.set(example.id,example);
 }
 const requestedIds:string[]=[];
 for(let index=0;index<args.length;index++){
  const arg=args[index]!;
  let id:string|undefined;
  if(arg==='--example'){
   id=args[++index];
  }else if(arg.startsWith('--example=')){
   id=arg.slice('--example='.length);
  }else throw new Error(`Unknown review UI argument ${JSON.stringify(arg)}; use repeatable --example <exact-id>.`);
  if(id===undefined||id===''||id.startsWith('--')||!validId(id))throw new Error('--example requires a nonempty well-formed exact example ID.');
  if(requestedIds.includes(id))throw new Error(`Review UI example ${id} was selected more than once.`);
  if(!byId.has(id))throw new Error(`Unknown review UI example ${id}.`);
  requestedIds.push(id);
 }
 const mode=requestedIds.length?'selected':'all';
 const selected=mode==='all'?examples:[...requestedIds.map(id=>byId.get(id)!)];
 if(selected.length===0)throw new Error('Review UI selection cannot be empty.');
 return{mode,requestedIds,selectedIds:selected.map(example=>example.id),selected,totalExamples:examples.length,sharedControls:true};
}
