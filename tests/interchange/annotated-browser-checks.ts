// SPDX-License-Identifier: MIT OR Apache-2.0
import {readJsonValue,writeJsonValue,type Document} from '@umf/core';
import {exportVisual,getVisual,importVisual} from '../../src';
import {readLiniProfile} from '../../src/interchange/lini/profile-syntax';
import {quoteLiniProfile} from '../../src/interchange/lini/profile-syntax';
import {quoteDotProfile} from '../../src/interchange/dot/profile-syntax';
const canonical=(value:unknown):string=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
export async function runAnnotatedBrowserChecks(fixtures:unknown[]){
 const receipts=[];let nativeLini:any;const moduleUrl='/lini_wasm.js';
 for(const input of fixtures){
  const document=input as Document,visual=getVisual(document),format=['metric','timeline','comparison'].includes(visual.kind)?'lini':'dot',profile=`umf.visual.${format}.annotated/1` as const;
  const output=exportVisual(document,{format,profile});assert(output.ok&&output.text,'Strict annotated browser export failed: '+visual.id+' '+JSON.stringify(output.diagnostics));
  const imported=importVisual(output.text,{format,profile,id:'browser-context',question:'What survives?'});assert(imported.ok&&canonical(imported.document)===canonical(document),'Complete browser native readback differs: '+visual.id);
  for(const persistence of ['json','yaml'] as const){
   const pair=readJsonValue(writeJsonValue({document:imported.document,source:imported.source},persistence),persistence) as any;
   const replay=exportVisual(pair.document,{format,profile,source:pair.source,original:true});assert(replay.ok&&replay.text===output.text,'Compound '+persistence+' source replay differs: '+visual.id);
   pair.document.extensions['umf.visual'].question='Changed after persisted import';assert(!exportVisual(pair.document,{format,profile,source:pair.source,original:true}).ok,'Stale compound source replay accepted: '+visual.id);
  }
  const updatedQuestion=visual.question+' (edited in native source)',oldValue=format==='dot'?quoteDotProfile('question = '+JSON.stringify(visual.question)):quoteLiniProfile(JSON.stringify(visual.question)),newValue=format==='dot'?quoteDotProfile('question = '+JSON.stringify(updatedQuestion)):quoteLiniProfile(JSON.stringify(updatedQuestion));
  const edited=output.text.replace(oldValue,newValue);assert(edited!==output.text,'Browser could not address the visible native question');
  const adopted=importVisual(edited,{format,profile,id:'edit-context',question:'edit-context'});assert(adopted.ok&&getVisual(adopted.document!).question===updatedQuestion,'Visible native question edit was not adopted: '+visual.id);
  assert(exportVisual(adopted.document,{format,profile}).ok,'Browser edited document failed second native export: '+visual.id);
  let cells=0;
  if(format==='lini'){
   if(!nativeLini){nativeLini=await import(moduleUrl);await nativeLini.default({module_or_path:new URL('/lini_wasm_bg.wasm',location.href)});assert(nativeLini.version()==='1.1.0','Wrong browser Lini runtime');}
   const report=JSON.parse(nativeLini.diagnostics(output.text,{}));assert(Array.isArray(report.diagnostics)&&report.diagnostics.length===0,'Native browser Lini diagnostics: '+visual.id);
   const svg=nativeLini.compile(output.text,{}),dom=new DOMParser().parseFromString(svg,'image/svg+xml');assert(!dom.querySelector('parsererror'),'Invalid browser native SVG');
   const actual=[...dom.querySelectorAll('g[data-id]')];
   const expected=readLiniProfile(output.text)[0].children.find(n=>n.id==='umf_annotations')!.children.filter(n=>n.id.startsWith('ann_value_'));
   for(const cell of expected){const rendered=actual.find(n=>n.getAttribute('data-id')===cell.id);assert(rendered?.querySelector('text')?.textContent===cell.label,'Native browser annotation text differs: '+visual.id+'/'+cell.id);cells++;}
  }
  receipts.push({id:visual.id,format,profile,completeDocument:true,compoundPersistence:['json','yaml'],exactReplay:true,staleReplayRefused:true,nativeAnnotationCells:cells});
 }
 assert(receipts.length===53,'The annotated release browser gate requires all 53 unchanged examples');
 // Exercise the public facade for the two readable metadata cohorts with real
 // source fixtures. The native runners independently validate renderer meaning.
 const publicProfiles=[
  {format:'mermaid' as const,profile:'umf.visual.mermaid.annotated/1',document:fixtures.find(input=>getVisual(input as Document).id==='helix-request') as Document},
  {format:'lini' as const,profile:'umf.visual.lini.annotated/1',document:fixtures.find(input=>getVisual(input as Document).id==='catalog-canary-flow') as Document},
 ];
 const publicProfileReceipts=[];
 for(const entry of publicProfiles){
  assert(entry.document,'Missing public annotated-profile source fixture: '+entry.profile);
  const original=getVisual(entry.document),output=exportVisual(entry.document,{format:entry.format,profile:entry.profile});
  assert(output.ok&&output.text,'Public annotated browser export failed: '+entry.profile+' '+JSON.stringify(output.diagnostics));
  const imported=importVisual(output.text,{format:entry.format,profile:entry.profile,id:'browser-profile-context',question:'What survives?'});
  assert(imported.ok&&canonical(imported.document)===canonical(entry.document),'Public annotated browser readback differs: '+entry.profile);
  const pair=readJsonValue(writeJsonValue({document:imported.document,source:imported.source},'json'),'json') as any;
  const replay=exportVisual(pair.document,{format:entry.format,profile:entry.profile,source:pair.source,original:true});
  assert(replay.ok&&replay.text===output.text,'Public annotated browser source replay differs: '+entry.profile);
  pair.document.extensions['umf.visual'].question='Changed after public browser import';
  assert(!exportVisual(pair.document,{format:entry.format,profile:entry.profile,source:pair.source,original:true}).ok,'Stale public annotated source replay accepted: '+entry.profile);
  let unknownRefused=false;
  try{unknownRefused=!exportVisual(entry.document,{format:entry.format,profile:'umf.visual.unknown/999'}).ok;}catch{unknownRefused=true;}
  assert(unknownRefused,'Unknown public profile was not refused: '+entry.profile);
  publicProfileReceipts.push({id:original.id,format:entry.format,profile:entry.profile,completeDocument:true,sourceReplay:true,staleReplayRefused:true,unknownProfileRefused:true});
 }
 return {examples:receipts,publicProfiles:publicProfileReceipts};
}
