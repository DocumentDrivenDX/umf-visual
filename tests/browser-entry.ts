import {readVisualDocument,writeVisualDocument,inspectVisual,editVisual,getVisual} from '../src';
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
 const interchange=await runInterchangeBrowserChecks();
 window.visualResult={ok:true,fixtures:fixtures.length,roundTrips,atomicEdit:true,interchange};
}catch(error){window.visualResult={ok:false,error:String(error)};}
