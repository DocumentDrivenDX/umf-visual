// SPDX-License-Identifier: MIT OR Apache-2.0
// Independent engine checks for the second mapping wave; no engines enter src/.
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {createVisualDocument,exportVisual} from '../src';
import {createCatalogData} from './catalog/build';
import mermaidPackage from 'mermaid/package.json';
const assert=(condition:unknown,message:string)=>{if(!condition)throw Error(message);};
const catalog=await createCatalogData();
const version=Bun.spawn(['dot','-V'],{stdout:'pipe',stderr:'pipe'});
const graphviz=(await new Response(version.stderr).text()).trim();
assert(await version.exited===0,'Graphviz version unavailable');
const clusters=[];
for(const item of catalog.items){
 const visual=(item.document as any).extensions['umf.visual'];
 if(visual.kind!=='flow'||!visual.groups?.length)continue;
 const target=item.targets.dot;
 assert(target.ok,'Grouped flow did not emit: '+item.id);
 const child=Bun.spawn(['dot','-Tjson'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 child.stdin.write(target.source!);child.stdin.end();
 const [text,errors]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);
 assert(await child.exited===0,'Graphviz rejected '+item.id+': '+errors);
 const native=JSON.parse(text);
 const objects=native.objects??[];
 const nodeMappings=target.identityMap.filter(mapping=>mapping.kind==='node');
 const groupMappings=target.identityMap.filter(mapping=>mapping.kind==='group');
 assert(nodeMappings.length===visual.nodes.length,'Node identity count changed: '+item.id);
 assert(groupMappings.length===visual.groups.length,'Group identity count changed: '+item.id);
 const groups=new Map(visual.groups.map((group:any)=>[group.id,group]));
 for(const mapping of groupMappings){
  const group=groups.get(mapping.visualId) as any;
  const cluster=objects.find((object:any)=>object.name===mapping.nativeId);
  assert(cluster&&cluster.label===group.label,'Native cluster label/identity changed: '+item.id+'/'+mapping.visualId);
  if(group.detail!==undefined)assert(cluster.tooltip===group.detail,'Cluster detail changed: '+item.id+'/'+mapping.visualId);
  else assert(cluster.tooltip===undefined||cluster.tooltip==='','Cluster invented inherited detail: '+item.id+'/'+mapping.visualId);
  const expected=visual.nodes.filter((node:any)=>{let current=node.group;const seen=new Set();while(current&&!seen.has(current)){if(current===group.id)return true;seen.add(current);current=(groups.get(current) as any)?.parent;}return false;}).map((node:any)=>node.id).sort();
  const actual=(cluster.nodes??[]).map((id:number)=>{
   const object=objects.find((value:any)=>value._gvid===id);
   return nodeMappings.find(mapping=>mapping.nativeId===object?.name)?.visualId;
  }).sort();
  assert(JSON.stringify(actual)===JSON.stringify(expected),'Native cluster membership changed: '+item.id+'/'+mapping.visualId);
 }
 const edgeOccurrences=new Map<string,number>();
 for(const edge of visual.edges??[]){
  const tail=objects.find((value:any)=>value.name===nodeMappings.find(mapping=>mapping.visualId===edge.from)?.nativeId)?._gvid;
  const head=objects.find((value:any)=>value.name===nodeMappings.find(mapping=>mapping.visualId===edge.to)?.nativeId)?._gvid;
  const pair=JSON.stringify([tail,head]),occurrence=edgeOccurrences.get(pair)??0;edgeOccurrences.set(pair,occurrence+1);
  const actual=(native.edges??[]).filter((value:any)=>value.tail===tail&&value.head===head)[occurrence];
  assert(actual,'Native edge endpoint/occurrence missing: '+item.id+'/'+edge.id);
  if(edge.why!==undefined)assert(actual.tooltip===edge.why,'Native explanation bound to wrong edge: '+item.id+'/'+edge.id);
 }
 assert((native.edges??[]).length===(visual.edges??[]).length,'Native edge cardinality changed: '+item.id);
 clusters.push({id:item.id,groups:groupMappings.length,nodes:nodeMappings.length,edges:(native.edges??[]).length});
}
assert(clusters.length===11,'Expected all 11 existing grouped flows');
const inherited=exportVisual(createVisualDocument({id:'native-inheritance',kind:'flow',form:'network',question:'Are descriptions scoped?',groups:[{id:'parent',label:'Parent',role:'region',detail:'Parent only'},{id:'child',label:'Child',role:'region',parent:'parent'}],nodes:[{id:'first',label:'First',group:'parent'},{id:'second',label:'Second',group:'child'}],edges:[{id:'one',from:'first',to:'second',why:'First explanation'},{id:'two',from:'first',to:'second',why:'Second explanation'}]}),{format:'dot',mode:'allow-reported-loss'});
assert(inherited.ok,'Native inheritance fixture refused');
const inheritedProcess=Bun.spawn(['dot','-Tjson'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});inheritedProcess.stdin.write(inherited.text!);inheritedProcess.stdin.end();
const inheritedNative=JSON.parse(await new Response(inheritedProcess.stdout).text());assert(await inheritedProcess.exited===0,'Native inheritance graph failed');
const parentNative=inherited.identityMap.find(mapping=>mapping.kind==='group'&&mapping.visualId==='parent')!.nativeId;
const childNative=inherited.identityMap.find(mapping=>mapping.kind==='group'&&mapping.visualId==='child')!.nativeId;
assert(inheritedNative.objects.find((value:any)=>value.name===parentNative).tooltip==='Parent only','Parent description changed');
const childTooltip=inheritedNative.objects.find((value:any)=>value.name===childNative).tooltip;
assert(childTooltip===undefined||childTooltip==='','Child inherited an unauthored description');
assert(JSON.stringify(inheritedNative.edges.map((edge:any)=>edge.tooltip))===JSON.stringify(['First explanation','Second explanation']),'Parallel edge explanations changed identity');
const browser=await chromium.launch();
const sequences=[];
try{
 const page=await browser.newPage();
 await page.setContent('<!doctype html><html><meta charset="utf-8"><body></body></html>');
 await page.addScriptTag({path:resolve('node_modules/mermaid/dist/mermaid.min.js')});
 for(const item of catalog.items){
  const visual=(item.document as any).extensions['umf.visual'];
  if(visual.kind!=='sequence')continue;
  const target=item.targets.mermaid;assert(target.ok,'Sequence did not emit: '+item.id);
  const observed=await page.evaluate(async({source,id})=>{
   const api=(window as any).mermaid;
   api.initialize({startOnLoad:false,securityLevel:'strict',theme:'neutral',look:'classic',deterministicIds:true,deterministicIDSeed:id});
   const diagram=await api.mermaidAPI.getDiagramFromText(source);
   const nativeActors=diagram.db.getActorKeys();
   const nativeMessages=diagram.db.getMessages().map((message:any)=>({from:message.from,to:message.to,type:message.type}));
   const result=await api.render('wave2-'+id,source);
   const svg=new DOMParser().parseFromString(result.svg,'image/svg+xml');
   return{nativeActors,nativeMessages,messages:[...svg.querySelectorAll('.messageText')].map(element=>element.textContent),text:svg.documentElement.textContent,svg:result.svg};
  },{source:target.source!,id:item.id.replace(/[^a-zA-Z0-9]/g,'-')});
  const actorIds=visual.sequence.participants.map((participant:any)=>target.identityMap.find(mapping=>mapping.kind==='participant'&&mapping.visualId===participant.id)!.nativeId);
  assert(JSON.stringify(observed.nativeActors)===JSON.stringify(actorIds),'Native participant order changed: '+item.id);
  const expectedNative=visual.sequence.messages.map((message:any)=>({from:target.identityMap.find(mapping=>mapping.kind==='participant'&&mapping.visualId===message.from)!.nativeId,to:target.identityMap.find(mapping=>mapping.kind==='participant'&&mapping.visualId===message.to)!.nativeId,type:message.kind==='return'?1:0}));
  assert(JSON.stringify(observed.nativeMessages)===JSON.stringify(expectedNative),'Native endpoint/arrow/order changed: '+item.id);
  const expected=visual.sequence.messages.map((message:any)=>message.label);
  assert(JSON.stringify(observed.messages)===JSON.stringify(expected),'Native message text/order changed: '+item.id+': '+JSON.stringify(observed.messages));
  for(const participant of visual.sequence.participants)assert(observed.text?.includes(participant.label),'Native participant label missing: '+item.id+'/'+participant.id);
  if(visual.title)assert(observed.text?.includes(visual.title),'Native sequence title missing: '+item.id);
  sequences.push({id:item.id,participants:visual.sequence.participants.length,messages:expected.length,svgSha256:new Bun.CryptoHasher('sha256').update(observed.svg).digest('hex')});
 }
 assert(sequences.length===5,'Expected all five existing sequence examples');
 const hostileLabel='  Actor "quoted" · 東京 & <tag> > `tick` #7;\nnext\tend  ';
 const hostileMessage='  call "quoted" · 東京 & <tag> > `tick` #7;\nnext\tend  ';
 const hostileLoop='loop #1;\nnext\tend',hostileNote='note\nnext\ttab';
 const hostile=exportVisual(createVisualDocument({id:'native-sequence-escaping',kind:'sequence',form:'lifelines',question:'Does native text survive?',groups:[{id:'retry',label:hostileLoop,role:'loop'}],sequence:{participants:[{id:'actor',label:hostileLabel,role:'actor'},{id:'service',label:'Service'}],messages:[{id:'call',from:'actor',to:'service',label:hostileMessage,kind:'call',group:'retry'},{id:'return',from:'service',to:'actor',label:'return',kind:'return'},{id:'async',from:'actor',to:'service',label:'async',kind:'async'},{id:'note',from:'actor',to:'service',label:hostileNote,kind:'note'}]}}),{format:'mermaid'});
 assert(hostile.ok,'Qualified hostile sequence was not strict: '+JSON.stringify(hostile.diagnostics));
 const hostileNative=await page.evaluate(async(source)=>{
  const api=(window as any).mermaid;
  const diagram=await api.mermaidAPI.getDiagramFromText(source);
  const types=diagram.db.getMessages().map((message:any)=>message.type);
  const rendered=await api.render('hostile-sequence-wave2',source);
  const dom=new DOMParser().parseFromString(rendered.svg,'image/svg+xml');
  const text=(selector:string)=>[...dom.querySelectorAll(selector)].map(element=>element.textContent);
  return{types,messages:text('.messageText'),participants:text('.actor'),notes:text('.noteText'),loops:text('.loopText')};
 },hostile.text!);
 // Mermaid 12.2 LINETYPE: LOOP_START, SOLID, LOOP_END, DOTTED, SOLID_POINT, NOTE.
 assert(JSON.stringify(hostileNative.types)===JSON.stringify([10,0,11,1,24,2]),'Native async/note/loop arrow types changed: '+JSON.stringify(hostileNative.types));
 assert(hostileNative.participants.includes(hostileLabel),'Native hostile participant text changed');
 assert(JSON.stringify(hostileNative.messages)===JSON.stringify([hostileMessage,'return','async']),'Native hostile message text changed: '+JSON.stringify(hostileNative.messages));
 assert(hostileNative.notes.includes(hostileNote),'Native hostile note text changed: '+JSON.stringify(hostileNative.notes));
 assert(hostileNative.loops.some(text=>text?.includes(hostileLoop)),'Native hostile loop text changed: '+JSON.stringify(hostileNative.loops));
 const receipt={graphviz:{version:graphviz,cases:clusters,clusterMembership:true,childTooltipReset:true,endpointBoundExplanations:true,parallelEdgeExplanations:true},mermaid:{version:mermaidPackage.version,browser:browser.version(),cases:sequences,participantOrder:true,messageEndpointsAndKinds:true,hostileText:true,asyncNoteLoopTypes:true}};
 await mkdir('.cache',{recursive:true});await Bun.write('.cache/native-wave-2.json',JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify(receipt));
}finally{await browser.close();}
