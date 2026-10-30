import {exerciseMiroBrowser} from './miro-browser.js';
import {readVisualDocument,writeVisualDocument,inspectVisual,editVisual,getVisual,exportVisual,importVisual,createVisualDocument,upgradeVisualDocument} from '../src';
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
 const upgraded=upgradeVisualDocument(doc);
 if(upgraded.vocabularies['umf.visual']?.version!=='1.1.0'||doc.vocabularies['umf.visual']?.version!=='1.0.0'||!inspectVisual(upgraded).complete)throw Error('Version upgrade failed');
 const nodes=Array.from({length:16},(_,i)=>({id:'n'+i,label:'N'+i}));
 const big={id:'browser-large',kind:'flow' as const,form:'network' as const,question:'How large?',nodes};
 let refused=false;try{createVisualDocument(big);}catch{refused=true;}
 if(!refused)throw Error('Legacy size semantics changed');
 const modern=createVisualDocument(big,undefined,'1.1.0');
 if(!inspectVisual(modern).valid||!inspectVisual(modern).advice.some(d=>d.code==='VISUAL_SPLIT'))throw Error('Opt-in size behavior failed');
 const early=createVisualDocument({id:'early',kind:'timeline',form:'milestones',question:'When?',timeline:{scale:{kind:'date'},events:[{id:'leap',label:'Leap',at:'0000-02-29'}]}},undefined,'1.1.0');
 if(!inspectVisual(early).valid)throw Error('Modern early-year date failed');
 const entity=createVisualDocument({id:'browser-entity',kind:'structure',form:'entities',question:'What refers?',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],structure:{entities:[{node:'a',fields:[{id:'stable',name:'key'}]},{node:'b',fields:[{name:'fk'}]}],references:[{id:'ref',from:{node:'a',fieldId:'stable'},to:{node:'b',field:'fk'},fromMultiplicity:{min:1,max:1},toMultiplicity:{min:2,max:5,text:'2..5'}}]}},undefined,'1.1.0');
 if(!inspectVisual(entity).complete)throw Error('Modern entity semantics incomplete');
 entity.vocabularies['umf.visual']!.version='1.0.0';
 if(inspectVisual(entity).complete)throw Error('Legacy validator interpreted new fields');
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
 window.visualResult={ok:true,fixtures:fixtures.length,roundTrips,atomicEdit:true,versioning:{legacyFrozen:true,explicitUpgrade:true,modernSize:true,earlyDate:true,modernEntities:true},wave2,interchange,miro:await exerciseMiroBrowser()};
}catch(error){window.visualResult={ok:false,error:String(error)};}
