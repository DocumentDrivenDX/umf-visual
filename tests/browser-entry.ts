import {readVisualDocument,writeVisualDocument,inspectVisual,editVisual,getVisual,exportVisual,importVisual} from '../src';
import {runInterchangeBrowserChecks} from './interchange/browser-checks';
declare global {interface Window {visualResult?:unknown;}}
try{
 const fixtures=await fetch('/fixtures').then(r=>r.json()) as unknown[];
 let roundTrips=0;
 for(const input of fixtures){
  const doc=readVisualDocument(JSON.stringify(input),'json');
  const checked=inspectVisual(doc);
  if(!checked.valid||!checked.complete)throw Error('Incomplete fixture');
  for(const format of ['json','yaml'] as const){
   const back=readVisualDocument(writeVisualDocument(doc,format),format);
   if(JSON.stringify(back)!==JSON.stringify(doc))throw Error('Round trip mismatch');
   roundTrips++;
  }
 }
 const doc=readVisualDocument(JSON.stringify(fixtures[0]),'json');
 const before=JSON.stringify(doc);
 const edited=editVisual(doc,v=>({...v,takeaway:'Browser consumer edit'}));
 if(getVisual(edited).takeaway!=='Browser consumer edit'||JSON.stringify(doc)!==before)throw Error('Atomic edit failure');
 const wave2=[];
 for(const input of fixtures){
  const doc=readVisualDocument(JSON.stringify(input),'json'),visual=getVisual(doc);
  const format=visual.kind==='sequence'?'mermaid':visual.kind==='flow'&&visual.groups?.length?'dot':undefined;
  if(!format)continue;
  const output=exportVisual(doc,{format,mode:'allow-reported-loss'});
  if(!output.ok)throw Error('Browser wave2 export failed: '+visual.id);
  const imported=importVisual(output.text,{format,id:'wave2-import',question:'What survives?',mode:'allow-reported-loss'});
  if(!imported.ok||!imported.document)throw Error('Browser wave2 import failed: '+visual.id+JSON.stringify(imported.diagnostics));
  const pair=JSON.parse(JSON.stringify({document:imported.document,source:imported.source}));
  const replay=exportVisual(pair.document,{format,source:pair.source,original:true});
  if(!replay.ok||replay.text!==output.text)throw Error('Browser wave2 exact replay failed: '+visual.id);
  if(format==='mermaid'&&!replay.identityMap.some(mapping=>mapping.kind==='message'))throw Error('Message identity mappings missing');
  if(format==='dot'&&!replay.identityMap.some(mapping=>mapping.kind==='group'))throw Error('Group identity mappings missing');
  pair.document.extensions['umf.visual'].title='Changed after import';
  if(exportVisual(pair.document,{format,source:pair.source,original:true}).ok)throw Error('Stale wave2 replay accepted');
  wave2.push({id:visual.id,format,retainedReplay:true,staleReplayRefused:true});
 }
 if(wave2.length!==16)throw Error('Expected 11 grouped flows and 5 sequences in browser');
 const interchange=await runInterchangeBrowserChecks();
 window.visualResult={ok:true,fixtures:fixtures.length,roundTrips,atomicEdit:true,wave2,interchange};
}catch(error){window.visualResult={ok:false,error:String(error)};}
