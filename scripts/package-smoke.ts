import {cp,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
await mkdir('.cache',{recursive:true});
const metadata=await Bun.file('package.json').json();
// Isolate the declared distributable files from accumulated installed-consumer
// trees. This also makes accidental undeclared workspace files impossible to ship.
const staging=await mkdtemp(resolve('.cache/package-stage-'));
await cp('package.json',join(staging,'package.json'));
for(const file of metadata.files){
 if(typeof file!=='string'||file.startsWith('/')||file.split('/').includes('..'))throw Error('Unsafe package file');
 await cp(file,join(staging,file),{recursive:true});
}
const pack=Bun.spawn([process.execPath,'pm','pack','--destination',resolve('.cache')],{cwd:staging,stdout:'inherit',stderr:'inherit'});
if(await pack.exited)throw Error('Packing failed');
const archive=resolve('.cache/documentdrivendx-umf-visual-'+metadata.version+'.tgz');
const consumer=await mkdtemp(resolve('.cache/consumer-'));
await Bun.write(join(consumer,'package.json'),JSON.stringify({private:true,type:'module',dependencies:{'@documentdrivendx/umf-visual':'file:'+archive}}));
const install=Bun.spawn([process.execPath,'install','--ignore-scripts'],{cwd:consumer,stdout:'inherit',stderr:'inherit'});
if(await install.exited)throw Error('Packed consumer installation failed');
const runtimePin=await Bun.file('spec/interchange/lini-runtime.json').json();
const packedRuntime=join(consumer,'node_modules/@documentdrivendx/umf-visual/dist/lini-runtime');
for(const asset of runtimePin.assets){
 const bytes=await Bun.file(join(packedRuntime,asset.name)).bytes();
 if(Bun.CryptoHasher.hash('sha256',bytes,'hex')!==asset.sha256)throw Error('Installed Lini runtime asset hash mismatch: '+asset.name);
}
if(JSON.stringify(await Bun.file(join(packedRuntime,'runtime-manifest.json')).json())!==JSON.stringify(runtimePin)||!(await Bun.file(join(packedRuntime,'LICENSE')).text()).includes('MIT'))throw Error('Installed runtime provenance or license missing');
const licensePin=await Bun.file('spec/interchange/lini-licenses/manifest.json').json();
if(JSON.stringify(await Bun.file(join(packedRuntime,'licenses/manifest.json')).json())!==JSON.stringify(licensePin))throw Error('Installed runtime license provenance changed');
for(const license of licensePin.files)if(Bun.CryptoHasher.hash('sha256',await Bun.file(join(packedRuntime,'licenses',license.name)).bytes(),'hex')!==license.sha256)throw Error('Installed runtime third-party notice missing');
const mermaidSequence=JSON.parse(await Bun.file('fixtures/visual/inventory/helix-request.json').text());
const ticketLifecycle=JSON.parse(await Bun.file('fixtures/visual/inventory/beacon-ticket-lifecycle.json').text());
const liniFlow=JSON.parse(await Bun.file('fixtures/catalog/canary-flow.json').text());
const liniMetric=JSON.parse(await Bun.file('fixtures/visual/forms/umf-ac-coverage.json').text());
const fullEntity=JSON.parse(await Bun.file('fixtures/catalog/canary-entities.json').text());
const annotationReview=JSON.parse(await Bun.file('fixtures/reviews/definitions/miro-frames-headings-annotations.json').text());
await Bun.write(join(consumer,'consumer.mjs'),`import {createVisualDocument,getVisual,editVisual,inspectVisual,importVisual,exportVisual,upgradeVisualDocument,latestVisualPackage,writeVisualDocument,readVisualDocument} from '@documentdrivendx/umf-visual';
import legacySchema from '@documentdrivendx/umf-visual/schema' with {type:'json'};
import modernSchema from '@documentdrivendx/umf-visual/schema/1.1.0' with {type:'json'};
import expressiveSchema from '@documentdrivendx/umf-visual/schema/1.2.0' with {type:'json'};
import frozenGallerySchema from '@documentdrivendx/umf-visual/schema/1.3.0' with {type:'json'};
import gallerySchema from '@documentdrivendx/umf-visual/schema/1.4.0' with {type:'json'};
import {planMiroExport} from '@documentdrivendx/umf-visual/miro';
import {exportPowerPoint,importPowerPoint} from '@documentdrivendx/umf-visual/powerpoint';
import {observeGoogleSlides,planGoogleSlidesExport} from '@documentdrivendx/umf-visual/google-slides';
import {hostDigest,admitHostObservation} from '@documentdrivendx/umf-visual/reconciliation';
import {planEditableMiroExport} from '@documentdrivendx/umf-visual/miro/editable';
import {compilePresentation} from '@documentdrivendx/umf-visual/presentation';
import {renderLiniPresentation} from '@documentdrivendx/umf-visual/renderers/lini';
if(typeof renderLiniPresentation!=='function')throw Error('Installed public Lini renderer is missing');
const doc=createVisualDocument({id:'consumer',kind:'flow',form:'network',question:'Does installation work?',nodes:[{id:'n',label:'Installed consumer'}]});
const presentationPlans=[compilePresentation(doc,{backend:'graphviz'}),compilePresentation(doc,{backend:'mermaid'}),compilePresentation(doc,{backend:'lini'})];
for(const plan of presentationPlans){if(!plan.ok||plan.profileId!=='umf.visual.presentation/1'||!plan.source||!plan.elementMap.length)throw Error('Installed presentation compiler failed');}
const lifecycle=readVisualDocument(JSON.stringify(JSON.parse(${JSON.stringify(JSON.stringify(ticketLifecycle))})),'json'),lifecycleBefore=JSON.stringify(lifecycle),lifecycleVisual=getVisual(lifecycle),lifecycleState=lifecycleVisual.state;
if(!lifecycleState)throw Error('Installed lifecycle model lost its state machine.');
/** @type {Array<'graphviz'|'mermaid'|'lini'>} */ const lifecycleBackends=['graphviz','mermaid','lini'];
for(const backend of lifecycleBackends){
 const plan=compilePresentation(lifecycle,{backend,theme:'presentation/1'});if(!plan.ok)throw Error('Installed public lifecycle compiler failed '+backend+': '+JSON.stringify(plan.diagnostics));
 const transitions=plan.elementMap.filter(item=>item.kind==='transition'),paths=plan.elementMap.filter(item=>item.kind==='state-path-caption');
 if(transitions.length!==6||paths.length!==6||JSON.stringify(paths.map(item=>item.logicalId))!==JSON.stringify(lifecycleState.transitions.map(item=>item.id))||!plan.source.includes('Path:'))throw Error('Installed public lifecycle source/path mapping failed '+backend);
 for(const[index,transition]of lifecycleState.transitions.entries())if(paths[index]?.sourcePath!=='/extensions/umf.visual/state/transitions/'+index+'/path'||paths[index]?.nativeId!==transitions[index]?.nativeId||!plan.source.includes(backend==='mermaid'?transition.event.replaceAll(' ','#32;'):transition.event))throw Error('Installed public lifecycle mapping lost '+transition.id+' on '+backend);
}
if(JSON.stringify(lifecycle)!==lifecycleBefore)throw Error('Installed public lifecycle compile mutated its source.');
const publicSequence=createVisualDocument({id:'installed-flat-sequence',kind:'sequence',form:'lifelines',question:'What happens to the reply?',sequence:{
 participants:[{id:'author',label:'Author',detail:'Keep the authored context\\nthrough the full handoff'},{id:'editor',label:'Editor'},{id:'reviewer',label:'Reviewer'},{id:'release',label:'Release coordinator'}],
 messages:[{id:'draft',from:'author',to:'release',label:'Send the reviewed reply draft\\nwith complete author context',kind:'call'},{id:'edit',from:'release',to:'editor',label:'Ask for wording edits',kind:'call'},{id:'approve',from:'editor',to:'reviewer',label:'Confirm the final language',kind:'call'},{id:'return',from:'reviewer',to:'author',label:'Return approval to the author',kind:'return'}]},steps:[{id:'prepare',title:'Prepare',focus:['author']},{id:'edit-step',title:'Edit',focus:['editor']},{id:'review-step',title:'Review',focus:['reviewer']},{id:'release-step',title:'Release',focus:['release']}]},'visual:installed-flat-sequence','1.4.0');
const publicSequenceBefore=JSON.stringify(publicSequence),publicSequencePlan=compilePresentation(publicSequence,{backend:'lini',theme:'presentation/1'});
if(!publicSequencePlan.ok||!publicSequencePlan.source||JSON.stringify(publicSequence)!==publicSequenceBefore)throw Error('Installed public 1.4.0 sequence compile failed or mutated its source.');
const publicSequenceVisual=getVisual(publicSequence),publicSequenceData=publicSequenceVisual.sequence;if(!publicSequenceData)throw Error('Installed sequence visual lost its source sequence.');const publicParticipants=publicSequenceData.participants,publicMessages=publicSequenceData.messages,publicParticipantMaps=publicSequencePlan.elementMap.filter(item=>item.kind==='participant'),publicLifelineMaps=publicSequencePlan.elementMap.filter(item=>item.kind==='participant-lifeline'),publicArrows=publicSequencePlan.elementMap.filter(item=>item.kind==='message'),publicCaptions=publicSequencePlan.elementMap.filter(item=>item.kind==='message-caption');
if(publicParticipantMaps.length!==4||publicLifelineMaps.length!==4||publicArrows.length!==publicMessages.length||publicCaptions.length!==publicMessages.length)throw Error('Installed sequence participant/lifeline/message/caption map counts differ.');
const firstPublicDetail=publicSequenceData.participants[0]?.detail;if(typeof firstPublicDetail!=='string'||!firstPublicDetail.includes('\\n')||!publicMessages[0]?.label.includes('\\n'))throw Error('Installed sequence multiline source fields were lost.');
for(const[index,participant]of publicParticipants.entries()){
 const pointer='/extensions/umf.visual/sequence/participants/'+index+'/id',participantMap=publicSequencePlan.elementMap.find(item=>item.kind==='participant'&&item.logicalId===participant.id&&item.sourcePath===pointer),lifeline=publicSequencePlan.elementMap.find(item=>item.kind==='participant-lifeline'&&item.logicalId===participant.id&&item.sourcePath===pointer);
 if(!participantMap||!lifeline||lifeline.nativeId!==participantMap.nativeId+'-lifeline')throw Error('Installed sequence participant/lifeline mapping differs: '+participant.id);
}
for(const[index,message]of publicMessages.entries()){
 const pointer='/extensions/umf.visual/sequence/messages/'+index,arrow=publicSequencePlan.elementMap.find(item=>item.kind==='message'&&item.logicalId===message.id&&item.sourcePath===pointer+'/id'),caption=publicSequencePlan.elementMap.find(item=>item.kind==='message-caption'&&item.logicalId===message.id&&item.sourcePath===pointer+'/label');
 if(!arrow||!caption||arrow.nativeId===caption.nativeId)throw Error('Installed sequence message/caption source mapping differs: '+message.id);
}
if(publicMessages[0]?.kind!=='call'||publicMessages.at(-1)?.kind!=='return'||JSON.stringify(publicCaptions.map(item=>item.logicalId))!==JSON.stringify(publicMessages.map(message=>message.id)))throw Error('Installed sequence call/return maps do not preserve source order.');
/** @param {string} source */ const normalizeNativeSource=(source)=>source.split(String.fromCharCode(92)+'n').join(' ').replace(/\\s+/gu,' '),normalizedSequenceSource=normalizeNativeSource(publicSequencePlan.source);
const publicMessageTextOrder=['Send the reviewed','Ask for wording edits','Confirm the final','Return approval'].map(label=>normalizedSequenceSource.indexOf(label));
if(publicMessageTextOrder.some((offset,index)=>offset<0||index>0&&offset<=publicMessageTextOrder[index-1]))throw Error('Installed sequence native labels do not preserve source order.');
if(new Set(publicCaptions.map(item=>item.nativeId)).size!==publicCaptions.length||publicCaptions.some(item=>publicArrows.some(arrow=>arrow.nativeId===item.nativeId)))throw Error('Installed sequence native caption carriers are not distinct.');
const publicSequenceDisclosure=publicSequencePlan.approximations.find(item=>item.sourcePath==='/extensions/umf.visual/sequence/messages');
if(!publicSequenceDisclosure||!publicSequenceDisclosure.representation.includes('rows follow authored sequence order')||!publicSequenceDisclosure.representation.includes('no elapsed-time, duration, or concurrency meaning'))throw Error('Installed sequence native drawing adaptation disclosure is missing.');
if(!normalizedSequenceSource.includes('Keep the authored context')||!normalizedSequenceSource.includes('complete author context'))throw Error('Installed sequence multiline detail/caption text was lost.');
if(planMiroExport(doc).shapes.length!==2)throw Error('Installed Miro entrypoint failed');
const editable=await planEditableMiroExport(doc,'strict');if(editable.nodes.length!==1)throw Error('Installed editable Miro entrypoint failed');
const digest=await hostDigest(doc);if(!/^[0-9a-f]{64}$/.test(digest))throw Error('Installed reconciliation entrypoint failed');
const ppt=await exportPowerPoint(doc,{mode:'report'});const pptBack=await importPowerPoint(ppt.bytes,{binding:ppt.binding,expectedBindingRevision:ppt.binding.bindingRevision,mode:'report'});if(getVisual(pptBack.document).question!==getVisual(doc).question)throw Error('Installed PowerPoint round trip failed');
const snapshot={presentationId:'consumer-presentation',revisionId:'consumer-rev-1',pageSize:{width:{magnitude:720,unit:'PT'},height:{magnitude:405,unit:'PT'}},slides:[{objectId:'consumer-slide',pageElements:[]}]};
const observed=await observeGoogleSlides(snapshot);await admitHostObservation({resource:{host:'google-slides',documentId:'consumer-presentation'},revision:{kind:'host-revision',value:'consumer-rev-1'},captureDigestSha256:observed.captureDigestSha256,payload:snapshot});
const slides=await planGoogleSlidesExport(doc,observed,{question:{x:20,y:20,width:400,height:50},nodes:{n:{x:100,y:120,width:180,height:80}}},{namespace:'consumer'});if(slides.batch.writeControl.requiredRevisionId!=='consumer-rev-1')throw Error('Installed Google Slides entrypoint failed');
if(legacySchema.$id!=='urn:umf:visual:1.0.0'||modernSchema.$id!=='urn:umf:visual:1.1.0'||latestVisualPackage.version!=='1.4.0'||expressiveSchema.$id!=='urn:umf:visual:1.2.0'||frozenGallerySchema.$id!=='urn:umf:visual:1.3.0'||gallerySchema.$id!=='urn:umf:visual:1.4.0'||'icon' in expressiveSchema.$defs.node.properties||!frozenGallerySchema.$defs.node.properties.icon||frozenGallerySchema.$defs.node.properties.role.enum.includes('process')||!gallerySchema.$defs.node.properties.role.enum.includes('process')||!gallerySchema.$defs.node.properties.shape.enum.includes('document')||!gallerySchema.$defs.node.properties.shape.enum.includes('multiple-documents')||'routing' in frozenGallerySchema.$defs.edge.properties||!gallerySchema.$defs.edge.properties.routing?.properties?.kind?.enum?.includes('curved')||frozenGallerySchema.$defs.layout.oneOf.some(option=>option.properties?.kind?.const==='circular')||!gallerySchema.$defs.layout.oneOf.some(option=>option.properties?.kind?.const==='circular')||!gallerySchema.$defs.annotation||!gallerySchema.properties.annotations||'annotations' in frozenGallerySchema.properties)throw Error('Versioned package assets failed');
if(!inspectVisual(upgradeVisualDocument(doc)).complete||doc.vocabularies['umf.visual'].version!=='1.0.0')throw Error('Installed upgrade failed');
/** @type {import('@documentdrivendx/umf-visual').Visual} */
const matrixInput={id:'packed-matrix',kind:'comparison',form:'matrix',title:'Packed comparison',question:'Which choice is supported?',comparison:{items:[{id:'one',label:'One'},{id:'two',label:'Two'},{id:'three',label:'Three'}],criteria:[{id:'cost',label:'Cost',measure:'text'},{id:'tested',label:'Tested',measure:'support'}],values:[{item:'one',criterion:'cost',text:'Low'},{item:'two',criterion:'cost',text:'Medium'},{item:'three',criterion:'cost',text:'High'},{item:'one',criterion:'tested',support:'no'},{item:'two',criterion:'tested',support:'partial'},{item:'three',criterion:'tested',support:'yes'}],chosen:{item:'two',reason:'The reviewed choice.'}}};
const matrixDoc=createVisualDocument(matrixInput,'visual:packed-matrix','1.4.0'),matrixBefore=JSON.stringify(matrixDoc),matrixPlan=compilePresentation(matrixDoc,{backend:'lini',theme:'presentation/1'});
if(!inspectVisual(matrixDoc).complete||!matrixPlan.ok||JSON.stringify(matrixDoc)!==matrixBefore)throw Error('Installed public matrix compiler failed or mutated its input.');
if(!matrixPlan.ok)throw Error('Installed public matrix compiler returned a refusal.');
const matrixItems=matrixPlan.elementMap.filter(item=>item.kind==='comparison-item'&&item.sourcePath.endsWith('/label')),matrixCriteria=matrixPlan.elementMap.filter(item=>item.kind==='comparison-criterion'&&item.sourcePath.endsWith('/label')),matrixValues=matrixPlan.elementMap.filter(item=>item.kind==='comparison-value'&&item.sourcePath.includes('/comparison/values/')&&['/text','/support','/rating'].some(suffix=>item.sourcePath.endsWith(suffix))),matrixChoice=matrixPlan.elementMap.filter(item=>item.kind==='comparison-choice');
if(matrixItems.length!==3||JSON.stringify(matrixItems.map(item=>item.logicalId))!==JSON.stringify(['one','two','three'])||matrixCriteria.length!==2||matrixValues.length!==6||matrixChoice.length!==2||!matrixPlan.source.includes('|table#comparison-table|')||!matrixPlan.source.includes('Reason: The reviewed choice.'))throw Error('Installed public matrix map/source contract failed.');
const graphvizMatrix=compilePresentation(matrixDoc,{backend:'graphviz'}),mermaidMatrix=compilePresentation(matrixDoc,{backend:'mermaid'});
if(graphvizMatrix.ok||!graphvizMatrix.diagnostics.some(item=>item.code==='PRESENTATION_BACKEND_SUBSET')||mermaidMatrix.ok||!mermaidMatrix.diagnostics.some(item=>item.code==='PRESENTATION_BACKEND_SUBSET'))throw Error('Installed matrix compiler did not explicitly refuse unqualified backends.');
const rich=createVisualDocument({id:'rich',kind:'flow',form:'network',question:'Which ports?',layout:{kind:'flow',direction:'LR',order:['client','api']},nodes:[{id:'client',label:'Client',shape:'ellipse',ports:[{id:'out',side:'east'}]},{id:'api',label:'API',shape:'hexagon',ports:[{id:'in',side:'west'}]}],edges:[{id:'request',from:'client',to:'api',fromPort:'out',toPort:'in'}]},'visual:rich','1.2.0');
if(!inspectVisual(rich).complete||!compilePresentation(editVisual(rich,v=>({...v,title:'Reviewed ports'})),{backend:'lini'}).ok)throw Error('Installed expressive model authoring failed');
const tree=createVisualDocument({id:'installed-tree',kind:'structure',form:'tree',question:'Which parts?',layout:{kind:'tree',direction:'bilateral',order:['root']},nodes:[{id:'root',label:'Root'},{id:'child',label:'Child',parent:'root',icon:'rocket'}]},undefined,'1.3.0');
const sequence=createVisualDocument({id:'installed-sequence',kind:'sequence',form:'lifelines',question:'What happens?',sequence:{participants:[{id:'a',label:'A'},{id:'b',label:'B',shape:'parallelogram'}],messages:[{id:'m',from:'a',to:'b',label:'call'}],notes:[{id:'note',text:'before call',participants:['a'],before:'m'}]}},undefined,'1.3.0');
for(const value of [tree,sequence])if(!inspectVisual(value).complete||!compilePresentation(value,{backend:'lini'}).ok)throw Error('Installed gallery model authoring failed');
const processDoc=createVisualDocument({id:'installed-process-role',kind:'flow',form:'network',question:'Which process connects to the data store?',groups:[{id:'env-a',label:'Environment A',role:'boundary'},{id:'env-b',label:'Environment B',role:'boundary',parent:'env-a'}],nodes:[{id:'process',label:'Process outside A',detail:'Process',role:'process',shape:'rectangle'},{id:'document',label:'Document',role:'document',shape:'document'},{id:'documents',label:'Multiple documents',shape:'multiple-documents'},{id:'store',label:'Data store',role:'store',shape:'cylinder',group:'env-b'}],edges:[{id:'produces',from:'process',to:'document',kind:'data',label:'produces',routing:{kind:'straight'}},{id:'expands',from:'document',to:'documents',kind:'data',label:'expands to',routing:{kind:'straight'}},{id:'writes',from:'documents',to:'store',kind:'data',label:'writes to',routing:{kind:'straight'}}]},'visual:installed-process-role','1.4.0');
if(!inspectVisual(processDoc).complete)throw Error('Installed 1.4 process role is incomplete');
const circularDoc=createVisualDocument({id:'installed-circular-layout',kind:'flow',form:'network',question:'What connection layout is intended?',nodes:[{id:'n1',label:'Node 1'},{id:'n2',label:'Node 2'},{id:'n3',label:'Node 3'}],edges:[{id:'edge',from:'n1',to:'n2'}],layout:{kind:'circular',order:['n1','n2','n3']}},'visual:installed-circular-layout','1.4.0');
if(!inspectVisual(circularDoc).complete||getVisual(readVisualDocument(writeVisualDocument(circularDoc,'yaml'),'yaml')).layout?.kind!=='circular')throw Error('Installed circular layout authoring failed');
/** @type {Array<'graphviz'|'mermaid'|'lini'>} */ const circularBackends=['graphviz','mermaid','lini'];
for(const backend of circularBackends){const plan=compilePresentation(circularDoc,{backend});if(!plan.ok||!plan.source?.trim()||!plan.elementMap.length)throw Error('Installed circular presentation compilation failed: '+backend);}
const circularGraphviz=compilePresentation(circularDoc,{backend:'graphviz'});
if(!circularGraphviz.ok||JSON.stringify(circularGraphviz.execution)!==JSON.stringify({runtime:'graphviz',layoutEngine:'neato',nodePositions:'fixed'}))throw Error('Installed circular Graphviz execution contract failed');
const annotationDoc=JSON.parse(${JSON.stringify(JSON.stringify(annotationReview))});
const annotationVisual=getVisual(annotationDoc);
const authoredAnnotations=annotationVisual.annotations||[];
const authoredNodes=annotationVisual.nodes||[];
if(!inspectVisual(annotationDoc).complete||authoredAnnotations.length!==2||authoredNodes.some(node=>authoredAnnotations.some(annotation=>annotation.id===node.id)))throw Error('Installed 1.4 annotation model failed');
/** @type {Array<'graphviz'|'mermaid'|'lini'>} */ const annotationBackends=['graphviz','mermaid','lini'];
for(const backend of annotationBackends){const plan=compilePresentation(annotationDoc,{backend});if(!plan.ok)throw Error('Installed annotation presentation failed: '+backend);for(const[index,annotation]of authoredAnnotations.entries()){const sourcePath='/extensions/umf.visual/annotations/'+index+'/id';if(!plan.elementMap.some(element=>element.kind==='annotation'&&element.logicalId===annotation.id&&element.sourcePath===sourcePath&&typeof element.nativeId==='string'&&element.nativeId.length))throw Error('Installed annotation carrier map missing: '+backend+'/'+annotation.id);}}
const annotatedEntities=createVisualDocument({id:'packed-annotated-entities',kind:'structure',form:'entities',question:'Which records connect?',nodes:[{id:'workspace',label:'Workspace'},{id:'member',label:'Member'}],structure:{entities:[{node:'workspace',fields:[{id:'workspace-key',name:'id',type:'uuid',keys:['pk'],nullable:false}]},{node:'member',fields:[{id:'member-key',name:'id',type:'uuid',keys:['pk'],nullable:false},{id:'member-workspace',name:'workspace_id',type:'uuid',keys:['fk'],nullable:false}]}],references:[{id:'membership',from:{node:'workspace',fieldId:'workspace-key'},to:{node:'member',fieldId:'member-workspace'},fromCardinality:'exactly-one',toCardinality:'zero-or-many'}]},annotations:[{id:'domain-rule',text:'Workspace ownership is explicit.'},{id:'retention-rule',text:'Retain member history.'}]},'visual:packed-annotated-entities','1.4.0'),annotatedEntitiesBefore=JSON.stringify(annotatedEntities),annotatedEntityVisual=getVisual(annotatedEntities);
for(const backend of annotationBackends){const plan=compilePresentation(annotatedEntities,{backend,theme:'presentation/1'});if(!plan.ok||!plan.source?.trim())throw Error('Installed annotated entity presentation failed: '+backend);const entities=annotatedEntityVisual.structure?.entities||[],references=annotatedEntityVisual.structure?.references||[],annotations=annotatedEntityVisual.annotations||[],entityMaps=plan.elementMap.filter(item=>item.kind==='entity'),fieldMaps=plan.elementMap.filter(item=>item.kind==='field'),referenceMaps=plan.elementMap.filter(item=>item.kind==='reference'),annotationMaps=plan.elementMap.filter(item=>item.kind==='annotation');if(entityMaps.length!==2||fieldMaps.length!==3||referenceMaps.length!==1||annotationMaps.length!==2)throw Error('Installed annotated entity map counts differ: '+backend);for(const[index,annotation]of annotations.entries()){const sourcePath='/extensions/umf.visual/annotations/'+index+'/id';if(!annotationMaps.some(item=>item.logicalId===annotation.id&&item.sourcePath===sourcePath&&typeof item.nativeId==='string'&&item.nativeId.length))throw Error('Installed annotated entity map missing: '+backend+'/'+annotation.id);const nativeText=backend==='mermaid'?annotation.text.replaceAll(' ','#32;'):annotation.text;if(!plan.source.includes(nativeText))throw Error('Installed annotated entity source lost encoded text: '+backend+'/'+annotation.id);}if(JSON.stringify(entityMaps.map(item=>item.logicalId))!==JSON.stringify(entities.map(item=>item.node))||JSON.stringify(referenceMaps.map(item=>item.logicalId))!==JSON.stringify(references.map(item=>item.id)))throw Error('Installed annotated entity ownership changed: '+backend);}
if(!inspectVisual(annotatedEntities).complete||JSON.stringify(annotatedEntities)!==annotatedEntitiesBefore)throw Error('Installed annotated entity compilation mutated or invalidated its source.');
/** @type {Array<'graphviz'|'mermaid'|'lini'>} */ const processBackends=['graphviz','mermaid','lini'];
const processNodes=getVisual(processDoc).nodes||[];
for(const backend of processBackends){const plan=compilePresentation(processDoc,{backend});if(!plan.ok||!plan.source?.trim()||!plan.elementMap.length)throw Error('Installed process presentation compilation failed: '+backend);for(const[index,node]of processNodes.entries()){const sourcePath='/extensions/umf.visual/nodes/'+index;if(!plan.elementMap.some(element=>element.kind==='node'&&element.logicalId===node.id&&(element.sourcePath===sourcePath||element.sourcePath.startsWith(sourcePath+'/'))))throw Error('Installed process node mapping is missing for '+backend+': '+node.id);}}
const report=inspectVisual(doc);if(!report.valid||!report.complete)throw Error('Installed package rejected valid data');
for(const format of ['dot','mermaid','lini']){
 const output=exportVisual(doc,{format});if(!output.ok)throw Error('Installed export failed '+format);
 const input=importVisual(output.text,{format,id:'installed',question:'Does interchange work?',mode:'allow-reported-loss'});if(!input.ok)throw Error('Installed import failed '+format);
 const replay=exportVisual(input.document,{format,source:input.source,original:true});if(!replay.ok||replay.text!==output.text)throw Error('Installed native replay failed '+format);
}
const profileCases=[
 {format:'dot',profile:'umf.visual.dot.annotated/1',document:createVisualDocument({id:'installed-state',kind:'state',form:'machine',title:'Installed state',question:'What changes?',source:{path:'package:smoke'},nodes:[{id:'ready',label:'Ready'},{id:'done',label:'Done'}],state:{initial:'ready',final:['done'],transitions:[{id:'finish',from:'ready',to:'done',event:'finish',action:'record result'}]}})},
 {format:'lini',profile:'umf.visual.lini.annotated/1',document:JSON.parse(${JSON.stringify(JSON.stringify(liniMetric))})},
 {format:'mermaid',profile:'umf.visual.mermaid.annotated/1',document:JSON.parse(${JSON.stringify(JSON.stringify(mermaidSequence))})},
 {format:'lini',profile:'umf.visual.lini.annotated/1',document:JSON.parse(${JSON.stringify(JSON.stringify(liniFlow))})},
];
/** @param {unknown} value */
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const fullCases=['dot','mermaid','lini'].flatMap(format=>[
 JSON.parse(${JSON.stringify(JSON.stringify(liniFlow))}),
 JSON.parse(${JSON.stringify(JSON.stringify(fullEntity))}),
 JSON.parse(${JSON.stringify(JSON.stringify(liniMetric))}),
].map(document=>({format,profile:'umf.visual.'+format+'.full/1',document})));
for(const entry of fullCases){
 const output=exportVisual(entry.document,{format:entry.format,profile:entry.profile});if(!output.ok)throw Error('Installed full export failed '+JSON.stringify(output.diagnostics));
 const imported=importVisual(output.text,{format:entry.format,profile:entry.profile,id:'installed',question:'What survives?'});
 if(!imported.ok||canonical(imported.document)!==canonical(entry.document)||!imported.coverage?.length)throw Error('Installed full readback differs');
 const replay=exportVisual(imported.document,{format:entry.format,profile:entry.profile,source:imported.source,original:true});
 if(!replay.ok||replay.text!==output.text)throw Error('Installed full native replay differs');
}
for(const entry of profileCases){
 const output=exportVisual(entry.document,{format:entry.format,profile:entry.profile});if(!output.ok)throw Error('Installed strict profile export failed '+JSON.stringify(output.diagnostics));
 const imported=importVisual(output.text,{format:entry.format,profile:entry.profile,id:'context',question:'Context'});if(!imported.ok||canonical(imported.document)!==canonical(entry.document))throw Error('Installed complete profile readback differs');
 const pair=JSON.parse(JSON.stringify({document:imported.document,source:imported.source}));
 if(exportVisual(pair.document,{format:entry.format,profile:entry.profile,source:pair.source,original:true}).text!==output.text)throw Error('Installed profile source replay differs');
 pair.document=editVisual(pair.document,v=>({...v,question:'Stale edit'}));if(exportVisual(pair.document,{format:entry.format,profile:entry.profile,source:pair.source,original:true}).ok)throw Error('Installed stale profile replay accepted');
}
for(const entry of profileCases.filter(p=>p.format==='mermaid'||p.document.extensions['umf.visual'].kind==='flow')){
 const visual=entry.document.extensions['umf.visual'];
 if(!visual.title||!visual.question||(!visual.nodes?.length&&!visual.sequence?.participants?.length))throw Error('Annotated package metadata/source fixture is incomplete '+entry.profile);
}
let unknownProfileRefused=false;try{unknownProfileRefused=!exportVisual(profileCases[2].document,{format:'mermaid',profile:'umf.visual.mermaid.unknown/999'}).ok;}catch{unknownProfileRefused=true;}
if(!unknownProfileRefused)throw Error('Unknown packed-consumer profile was accepted');
console.log(JSON.stringify({installed:true,valid:report.valid,complete:report.complete,interchange:['dot','mermaid','lini'],portableAdapters:['powerpoint','google-slides','reconciliation','miro/editable'],fullProfileCases:fullCases.length,annotatedProfiles:profileCases.map(p=>p.profile),annotatedSources:['helix-request','catalog-canary-flow'],processRoleVersion:'1.4.0',annotations:true,unknownProfileRefused:true}));`);
const types=Bun.spawn([resolve('node_modules/.bin/tsc'),'--ignoreConfig','--allowJs','--checkJs','--noEmit','--module','ESNext','--moduleResolution','Bundler','--target','ES2022','--skipLibCheck','consumer.mjs'],{cwd:consumer,stdout:'inherit',stderr:'inherit'});
if(await types.exited)throw Error('Installed consumer declarations failed');
for(const runtime of [process.execPath,'node']){
 const run=Bun.spawn([runtime,'consumer.mjs'],{cwd:consumer,stdout:'inherit',stderr:'inherit'});
 if(await run.exited)throw Error('Packed consumer failed: '+runtime);
}
