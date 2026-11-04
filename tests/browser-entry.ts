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
   for(const[index,annotation]of (payload.annotations??[]).entries()){
    const pointer=`/extensions/umf.visual/annotations/${index}/id`;
    if(!plan.elementMap.some(element=>element.kind==='annotation'&&element.logicalId===annotation.id&&element.sourcePath===pointer&&typeof element.nativeId==='string'&&element.nativeId.length>0))throw Error(`Reviewed visual annotation carrier mapping is missing for ${backend}: ${annotation.id}.`);
   }
  }
  if(compiledBackends===0)throw Error('No reviewed backend qualified for the shared browser compiler.');
 }
 const lifecycleInput=fixtures.find(input=>(input as any)?.extensions?.['umf.visual']?.id==='beacon-ticket-lifecycle');
 if(!lifecycleInput)throw Error('Public lifecycle consumer fixture is missing.');
 const lifecycleDocument=readVisualDocument(JSON.stringify(lifecycleInput),'json'),lifecycleBefore=JSON.stringify(lifecycleDocument),lifecycleVisual=getVisual(lifecycleDocument);
 if(lifecycleVisual.form!=='lifecycle'||!lifecycleVisual.state)throw Error('Public lifecycle consumer fixture lost its lifecycle source.');
 for(const backend of ['graphviz','mermaid','lini'] as const){
  const plan=compilePresentation(lifecycleDocument,{backend,theme:'presentation/1'});
  if(!plan.ok)throw Error(`Public lifecycle compiler refused ${backend}: ${JSON.stringify(plan.diagnostics)}`);
  const transitions=plan.elementMap.filter(item=>item.kind==='transition'),paths=plan.elementMap.filter(item=>item.kind==='state-path-caption');
  if(transitions.length!==6||paths.length!==6||JSON.stringify(transitions.map(item=>item.logicalId))!==JSON.stringify(lifecycleVisual.state.transitions.map(item=>item.id)))throw Error(`Public lifecycle transition/path map counts differ for ${backend}.`);
  for(const[index,transition]of lifecycleVisual.state.transitions.entries()){
   const path=paths[index];
   if(path?.logicalId!==transition.id||path.sourcePath!==`/extensions/umf.visual/state/transitions/${index}/path`||path.nativeId!==transitions[index]?.nativeId||!plan.source.includes(`Path:`))throw Error(`Public lifecycle path carrier mapping is missing for ${backend}/${transition.id}.`);
   const nativeEvent=backend==='mermaid'?transition.event.replaceAll(' ','#32;'):transition.event;
   if(!plan.source.includes(nativeEvent))throw Error(`Public lifecycle event text is missing for ${backend}/${transition.id}.`);
  }
  if(!plan.source.includes('Path:')||JSON.stringify(lifecycleDocument)!==lifecycleBefore)throw Error(`Public lifecycle compile omitted path text or mutated source for ${backend}.`);
  reviewedPresentationPlans++;
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
 const sequence14Payload={id:'browser-sequence-flat-native-primitives',kind:'sequence' as const,form:'lifelines' as const,question:'What happens to the reply?',sequence:{
  participants:[{id:'author',label:'Author',detail:'Keep the authored context\nthrough the full handoff'},{id:'editor',label:'Editor'},{id:'reviewer',label:'Reviewer'},{id:'release',label:'Release coordinator'}],
  messages:[{id:'draft',from:'author',to:'release',label:'Send the reviewed reply draft\nwith complete author context',kind:'call' as const},{id:'edit',from:'release',to:'editor',label:'Ask for wording edits',kind:'call' as const},{id:'approve',from:'editor',to:'reviewer',label:'Confirm the final language',kind:'call' as const},{id:'return',from:'reviewer',to:'author',label:'Return approval to the author',kind:'return' as const}],
 },steps:[{id:'prepare',title:'Prepare',focus:['author']},{id:'edit-step',title:'Edit',focus:['editor']},{id:'review-step',title:'Review',focus:['reviewer']},{id:'release-step',title:'Release',focus:['release']}]};
 const sequence14=createVisualDocument(sequence14Payload,'visual:browser-sequence-flat-native-primitives','1.4.0'),sequence14Before=JSON.stringify(sequence14),sequence14Plan=compilePresentation(sequence14,{backend:'lini',theme:'presentation/1'});
 if(!sequence14Plan.ok||!sequence14Plan.source||!inspectVisual(sequence14).complete)throw Error('Public 1.4.0 sequence presentation failed in the browser consumer.');
 const sequence14Visual=getVisual(sequence14),sequence14Messages=sequence14Visual.sequence!.messages,sequence14Participants=sequence14Visual.sequence!.participants,sequence14ParticipantMaps=sequence14Plan.elementMap.filter(item=>item.kind==='participant'),sequence14LifelineMaps=sequence14Plan.elementMap.filter(item=>item.kind==='participant-lifeline'),sequence14MessageMaps=sequence14Plan.elementMap.filter(item=>item.kind==='message'),sequence14CaptionMaps=sequence14Plan.elementMap.filter(item=>item.kind==='message-caption');
 if(sequence14ParticipantMaps.length!==4||sequence14LifelineMaps.length!==4||sequence14MessageMaps.length!==sequence14Messages.length||sequence14CaptionMaps.length!==sequence14Messages.length)throw Error('Public sequence participant/lifeline/message/caption maps have incorrect counts.');
 for(const[index,participant]of sequence14Participants.entries()){
  const participantPointer=`/extensions/umf.visual/sequence/participants/${index}/id`,participantMap=sequence14Plan.elementMap.find(item=>item.kind==='participant'&&item.logicalId===participant.id&&item.sourcePath===participantPointer),lifeline=sequence14Plan.elementMap.find(item=>item.kind==='participant-lifeline'&&item.logicalId===participant.id&&item.sourcePath===participantPointer);
  if(!participantMap||!lifeline||lifeline.nativeId!==participantMap.nativeId+'-lifeline')throw Error(`Public participant ${participant.id} does not have a unique mapped lifeline helper.`);
 }
 if(!sequence14Participants[0]?.detail?.includes('\n')||!sequence14Messages[0]?.label.includes('\n'))throw Error('Public sequence browser fixture lost its explicit multiline authored text.');
 for(const[index,message]of sequence14Messages.entries()){
  const pointer=`/extensions/umf.visual/sequence/messages/${index}`,arrow=sequence14Plan.elementMap.find(item=>item.kind==='message'&&item.logicalId===message.id&&item.sourcePath===pointer+'/id'),caption=sequence14Plan.elementMap.find(item=>item.kind==='message-caption'&&item.logicalId===message.id&&item.sourcePath===pointer+'/label');
  if(!arrow||!caption||arrow.nativeId===caption.nativeId)throw Error(`Public sequence message ${message.id} does not have distinct arrow and owned caption carriers.`);
 }
 if(sequence14Messages[0]?.kind!=='call'||sequence14Messages.at(-1)?.kind!=='return'||JSON.stringify(sequence14CaptionMaps.map(item=>item.logicalId))!==JSON.stringify(sequence14Messages.map(message=>message.id)))throw Error('Public sequence maps do not preserve source-ordered call/return messages.');
 const normalizedSequenceSource=sequence14Plan.source.split(String.fromCharCode(92)+'n').join(' ').replace(/\s+/gu,' '),messageTextOrder=['Send the reviewed','Ask for wording edits','Confirm the final','Return approval'].map(label=>normalizedSequenceSource.indexOf(label));
 if(messageTextOrder.some((offset,index)=>offset<0||index>0&&offset<=messageTextOrder[index-1]!))throw Error('Public sequence native labels do not remain in authored message order.');
 if(new Set(sequence14CaptionMaps.map(item=>item.nativeId)).size!==sequence14CaptionMaps.length||sequence14CaptionMaps.some(item=>sequence14MessageMaps.some(message=>message.nativeId===item.nativeId)))throw Error('Public sequence caption carrier IDs are not distinct from message arrows.');
 const sequenceDisclosure=sequence14Plan.approximations.find(item=>item.sourcePath==='/extensions/umf.visual/sequence/messages');
 if(!sequenceDisclosure||!sequenceDisclosure.representation.includes('rows follow authored sequence order')||!sequenceDisclosure.representation.includes('no elapsed-time, duration, or concurrency meaning'))throw Error('Public sequence native drawing adaptation is not disclosed as renderer-only spacing.');
 if(!normalizedSequenceSource.includes('Keep the authored context')||!normalizedSequenceSource.includes('complete author context')||sequence14Participants.length!==4||JSON.stringify(sequence14)!==sequence14Before)throw Error('Public sequence compile lost source text/order or mutated its UMF document.');
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
