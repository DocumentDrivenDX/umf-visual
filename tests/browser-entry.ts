import {exerciseMiroBrowser} from './miro-browser.js';
import {readVisualDocument,writeVisualDocument,inspectVisual,editVisual,getVisual,exportVisual,importVisual,createVisualDocument,upgradeVisualDocument} from '../src';
import {runInterchangeBrowserChecks} from './interchange/browser-checks';
import {runAnnotatedBrowserChecks} from './interchange/annotated-browser-checks';
import {runPortableAdaptersBrowserChecks} from './portable-adapters-browser';
import {runFullBrowserChecks} from './interchange/full-browser-checks';
import {compilePresentation} from '../src/presentation/index';
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
 const reviewedDefinitions=await fetch('/reviews').then(r=>r.json()) as unknown[];
 let reviewedRoundTrips=0,reviewedPresentationPlans=0;
 const reviewedModelVersions=new Set<string>();
 for(const input of reviewedDefinitions){
  const review=readVisualDocument(JSON.stringify(input),'json');
  const checked=inspectVisual(review);if(!checked.valid||!checked.complete)throw Error('Reviewed definition is not complete in the browser consumer.');
  const payload=getVisual(review);
  const modelVersion=review.vocabularies['umf.visual']?.version;if(modelVersion)reviewedModelVersions.add(modelVersion);
  for(const format of ['json','yaml'] as const){const back=readVisualDocument(writeVisualDocument(review,format),format);if(JSON.stringify(back)!==JSON.stringify(review))throw Error(`Reviewed definition ${format} round trip differs.`);reviewedRoundTrips++;}
  let compiledBackends=0;
  for(const backend of ['graphviz','mermaid','lini'] as const){
   const plan=compilePresentation(review,{backend,theme:'presentation/1'});
   if(!plan.ok){if(!plan.diagnostics.length)throw Error(`Reviewed visual refusal is not explicit for ${backend}.`);continue;}
   if(!plan.source?.trim()||!plan.elementMap.length)throw Error(`Reviewed visual presentation is incomplete for ${backend}.`);
   compiledBackends++;
   reviewedPresentationPlans++;
   for(const[index,node]of (payload.nodes??[]).entries()){
    const nodePointer=`/extensions/umf.visual/nodes/${index}`;
    const validPointers=[nodePointer,nodePointer+'/id'];
    for(const[entityIndex,entity]of (payload.structure?.entities??[]).entries())if(entity.node===node.id){const entityPointer=`/extensions/umf.visual/structure/entities/${entityIndex}`;validPointers.push(entityPointer,entityPointer+'/node');}
    if(!plan.elementMap.some(element=>(element.kind==='node'||element.kind==='entity')&&element.logicalId===node.id&&validPointers.includes(element.sourcePath)))throw Error(`Reviewed visual node/entity mapping is missing for ${backend}: ${node.id}.`);
   }
  }
  if(compiledBackends===0)throw Error('No reviewed backend qualified for the shared browser compiler.');
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
 const v12=createVisualDocument({id:'browser-ports-layout',kind:'flow',form:'network',question:'Which ports are connected?',nodes:[{id:'client',label:'Client',shape:'ellipse',ports:[{id:'out',side:'east'}]},{id:'store',label:'Store',shape:'cylinder',ports:[{id:'in',side:'west'}]}],edges:[{id:'request',from:'client',to:'store',fromPort:'out',toPort:'in'}],layout:{kind:'flow',direction:'LR',order:['client','store']}},undefined,'1.2.0');
 if(!inspectVisual(v12).complete||getVisual(readVisualDocument(writeVisualDocument(v12,'yaml'),'yaml')).nodes?.[0]?.shape!=='ellipse')throw Error('1.2 browser model round trip failed');
 const tree13=createVisualDocument({id:'browser-tree',kind:'structure',form:'tree',question:'Which parts?',layout:{kind:'tree',direction:'bilateral',order:['root']},nodes:[{id:'root',label:'Root'},{id:'child',label:'Child',parent:'root',icon:'rocket'}]},undefined,'1.3.0');
 const sequence13=createVisualDocument({id:'browser-sequence',kind:'sequence',form:'lifelines',question:'What happens?',sequence:{participants:[{id:'a',label:'A'},{id:'b',label:'B',shape:'parallelogram'}],messages:[{id:'m',from:'a',to:'b',label:'call'}],notes:[{id:'note',text:'before call',participants:['a'],before:'m'}]}},undefined,'1.3.0');
 for(const value of [tree13,sequence13])if(!inspectVisual(value).complete||JSON.stringify(readVisualDocument(writeVisualDocument(value,'yaml'),'yaml'))!==JSON.stringify(value))throw Error('1.3 browser model YAML round trip failed');
 const early=createVisualDocument({id:'early',kind:'timeline',form:'milestones',question:'When?',timeline:{scale:{kind:'date'},events:[{id:'leap',label:'Leap',at:'0000-02-29'}]}},undefined,'1.1.0');
 if(!inspectVisual(early).valid)throw Error('Modern early-year date failed');
 const entity=createVisualDocument({id:'browser-entity',kind:'structure',form:'entities',question:'What refers?',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],structure:{entities:[{node:'a',fields:[{id:'stable',name:'key'}]},{node:'b',fields:[{name:'fk'}]}],references:[{id:'ref',from:{node:'a',fieldId:'stable'},to:{node:'b',field:'fk'},fromMultiplicity:{min:1,max:1},toMultiplicity:{min:2,max:5,text:'2..5'}}]}},undefined,'1.1.0');
 if(!inspectVisual(entity).complete)throw Error('Modern entity semantics incomplete');
 const presentationFlow=createVisualDocument({id:'presentation-browser',kind:'flow',form:'network',question:'Which tool draws?',nodes:[{id:'schema',label:'Schema <π>'},{id:'renderer',label:'Renderer & output'}],edges:[{id:'draw',from:'schema',to:'renderer',label:'author → draw'}]});
 const presentationPlans=[compilePresentation(presentationFlow,{backend:'graphviz'}),compilePresentation(presentationFlow,{backend:'mermaid'}),compilePresentation(entity,{backend:'graphviz'}),compilePresentation(presentationFlow,{backend:'lini'}),compilePresentation(v12,{backend:'lini'}),compilePresentation(tree13,{backend:'lini'}),compilePresentation(sequence13,{backend:'lini'})];
 for(const plan of presentationPlans)if(!plan.ok||plan.profileId!=='umf.visual.presentation/1'||!plan.source||!plan.elementMap.length)throw Error('Browser presentation compiler failed');
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
 window.visualResult={ok:true,fixtures:fixtures.length,roundTrips,reviewedDefinitions:reviewedDefinitions.length,reviewedRoundTrips,reviewedPresentationPlans,reviewedModelVersions:[...reviewedModelVersions],atomicEdit:true,versioning:{legacyFrozen:true,explicitUpgrade:true,modernSize:true,earlyDate:true,modernEntities:true,model12:true,model13:true},presentationPlans:presentationPlans.length,wave2,interchange,annotated:await runAnnotatedBrowserChecks(fixtures),full:runFullBrowserChecks(fixtures),miro:await exerciseMiroBrowser(),portableAdapters:await runPortableAdaptersBrowserChecks()};
}catch(error){window.visualResult={ok:false,error:String(error)};}
