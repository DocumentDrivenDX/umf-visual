// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import mermaidPackage from 'mermaid/package.json';
import {createVisualDocument} from '../src/extensions/visual';
import {serializeAnnotatedMermaid} from '../src/interchange/mermaid/annotated';

const cases=[
 ['helix-request','fixtures/visual/inventory/helix-request.json'],
 ['beacon-reply-draft','fixtures/visual/inventory/beacon-reply-draft.json'],
 ['documentor-pipeline','fixtures/visual/inventory/documentor-pipeline.json'],
 ['tpl-arch-dataflow','fixtures/visual/inventory/tpl-arch-dataflow.json'],
 ['helix-request-ladder','fixtures/visual/forms/helix-request-ladder.json'],
] as const;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const hashBytes=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
const assertEventSyntax=(source:string,identityMap:any[],coverage:any[])=>{
 const events:{line:number;kind:'note'|'message'|'loop-start'|'loop-end'}[]=[];
 for(const [line,text]of source.split(/\r\n|\n|\r/).entries()){
  const value=text.trim();if(!value||value.startsWith('%%'))continue;
  let kind:typeof events[number]['kind']|undefined;
  if(/^Note\s+(?:left|right|over)\b.*:\s*/i.test(value))kind='note';
  else if(/^loop\s+\S/.test(value))kind='loop-start';
  else if(/^end\s*$/.test(value))kind='loop-end';
  else if(/^P[1-9][0-9]*\s*(?:-->>|->>|-\)|--x|->|-->)\s*P[1-9][0-9]*\s*:/.test(value))kind='message';
  if(kind)events.push({line,kind});
 }
 for(const row of identityMap.filter((item:any)=>item.kind==='message'||item.kind==='group')){
  const line=Number(row.sourcePath?.slice('/source/'.length));const event=events.find(item=>item.line===line);
  assert(event,`No full-source event for ${row.visualId} at ${row.sourcePath}`);
  const prefix=row.kind==='group'?'loop@':event.kind==='note'?'note@':'message@';
  assert.equal(row.nativeId,prefix+(events.indexOf(event)+1),`Incorrect full-source native event locator for ${row.visualId}`);
 }
 for(const row of coverage.filter((item:any)=>item.representation==='profile-annotation')){
  const index=Number(row.native?.[0]?.id?.slice('note@'.length));assert(index>0,`Annotation lacks native note locator at ${row.path}`);
  assert.equal(events[index-1]?.kind,'note',`Annotation locator does not identify a native Mermaid note at ${row.path}`);
 }
 return events;
};

const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();await page.setContent('<!doctype html><html><meta charset="utf-8"><body></body></html>');
 await page.addScriptTag({path:resolve('node_modules/mermaid/dist/mermaid.min.js')});
 const proof:any[]=[];
 for(const [id,path]of cases){
  const sourceBytes=await readFile(path),sourceDocument=JSON.parse(sourceBytes.toString('utf8'));
  const exported=serializeAnnotatedMermaid(sourceDocument);
  assert(exported.text&&exported.document,`${id}: annotated export was not readable: ${JSON.stringify(exported.diagnostics)}`);
  const events=assertEventSyntax(exported.text,exported.identityMap,exported.coverage);
  const native=await page.evaluate(async({source,id})=>{
   const api=(window as any).mermaid;api.initialize({startOnLoad:false,securityLevel:'strict',theme:'neutral',look:'classic',fontFamily:'Arial',deterministicIds:true,deterministicIDSeed:id});
   const diagram=await api.mermaidAPI.getDiagramFromText(source),messages=diagram.db.getMessages().map((item:any)=>({from:item.from,to:item.to,type:item.type,message:item.message}));
   const result=await api.render('annotated-'+id,source),document=new DOMParser().parseFromString(result.svg,'image/svg+xml'),svg=document.documentElement;
   const live=document.importNode(svg,true);window.document.body.replaceChildren(live);
   const noteLayouts=[...window.document.querySelectorAll('g[data-et="note"]')].map((group:any)=>{const rect=group.querySelector('rect'),texts=[...group.querySelectorAll('text.noteText')];return{id:group.getAttribute('data-id'),width:Number(rect?.getAttribute('width')),height:Number(rect?.getAttribute('height')),lines:texts.map((item:any)=>item.textContent||''),lineWidths:texts.map((item:any)=>item.getBBox().width)};});
   return{messages,actors:diagram.db.getActorKeys(),text:svg.textContent||'',svg:result.svg,viewBox:svg.getAttribute('viewBox'),version:api.version||'unknown',noteIds:noteLayouts.map((item:any)=>item.id),noteLayouts};
  },{source:exported.text,id});
  assert.equal(native.messages.length,events.length,`${id}: Mermaid parser event count differs from source event sequence`);
  assert(native.svg.includes('<svg'),`${id}: Mermaid browser renderer returned no SVG`);
  const actualNoteCount=native.messages.filter((item:any)=>item.type===2).length;
  const expectedNoteCount=events.filter(item=>item.kind==='note').length;
  assert.equal(actualNoteCount,expectedNoteCount,`${id}: annotation or authored notes were not actual native notes`);
  const decodeMermaidText=(value:string)=>value.replace(/ﬂ°°(\d+)¶ß/g,(_match:string,code:string)=>String.fromCharCode(Number(code)));
  const annotatedMessages=native.messages.filter((item:any)=>item.type===2&&decodeMermaidText(item.message).startsWith('UMF annotation /1 ·'));
  assert.equal(annotatedMessages.length,new Set(exported.coverage.filter((item:any)=>item.representation==='profile-annotation').map((item:any)=>item.native[0]?.id)).size,`${id}: annotation coverage does not match native note count; parsed notes ${JSON.stringify(native.messages.filter((item:any)=>item.type===2).slice(0,2))}`);
  const renderedNotes=new Map(native.noteLayouts.map((item:any)=>[item.id,item]));
  for(const item of annotatedMessages){
   const eventIndex=native.messages.indexOf(item),noteId='i'+eventIndex,layout=renderedNotes.get(noteId) as any,expectedLines=(item.message.match(/<br\/>/g)?.length??0)+1;
   assert(layout,`${id}: no SVG layout for annotation note ${noteId}`);assert.equal(layout.lines.length,expectedLines,`${id}: native HTML breaks did not produce separate rendered annotation lines`);
   assert(layout.width<600,`${id}: wrapped annotation note remains too wide (${layout.width}px): ${JSON.stringify(layout.lines)}`);assert(Math.max(...layout.lineWidths)<500,`${id}: wrapped annotation text line remains too wide (${Math.max(...layout.lineWidths)}px)`);assert(layout.height>=expectedLines*18,`${id}: native note height clips annotation lines (${layout.height}px)`);
  }
  assert(!native.svg.includes('<script'),`${id}: annotation content escaped into executable SVG markup`);
  for(const item of exported.identityMap){
   if(item.kind==='message'||item.kind==='group'){
    const eventIndex=Number(item.nativeId.split('@')[1])-1,actual=native.messages[eventIndex];assert(actual,`${id}: native identity ${item.nativeId} is outside Mermaid's parsed message/event array`);
    if(item.kind==='group')assert.equal(actual.type,10,`${id}: group identity does not point at a native loop-start event`);
    if(item.kind==='message'&&item.nativeId.startsWith('note@'))assert.equal(actual.type,2,`${id}: authored note identity does not point at a native note event`);
   }
  }
  const identityByVisual=new Map(exported.identityMap.map((item:any)=>[item.visualId,item]));
  for(const item of exported.coverage.filter((row:any)=>row.representation==='native-concept')){
   const message=/^\/extensions\/umf\.visual\/sequence\/messages\/(\d+)(?:\/|$)/.exec(item.path);
   const group=/^\/extensions\/umf\.visual\/groups\/(\d+)(?:\/|$)/.exec(item.path);
   if(item.path==='/extensions/umf.visual/sequence/messages'){
    const expected=sourceDocument.extensions['umf.visual'].sequence.messages.map((entry:any)=>identityByVisual.get(entry.id)?.nativeId);
    assert.deepEqual(item.native.map((locator:any)=>locator.id),expected,`${id}: message collection order coverage does not resolve to semantic native events`);
   }else if(message){
    const entry=sourceDocument.extensions['umf.visual'].sequence.messages[Number(message[1])],mapping=identityByVisual.get(entry.id);
    assert(mapping&&mapping.kind==='message',`${id}: message coverage has no identity mapping for ${entry.id}`);
    assert.equal(item.native[0]?.id,mapping.nativeId,`${id}: message coverage locator differs from its full-source identity`);
    const actual=native.messages[Number(mapping.nativeId.split('@')[1])-1];assert(actual,`${id}: message coverage points outside native event database`);
    if(entry.kind==='note')assert.equal(actual.type,2,`${id}: authored note locator does not point at a native note`);else assert.notEqual(actual.type,2,`${id}: non-note message points at a native note`);
    if(item.path.endsWith('/label'))assert(decodeMermaidText(actual.message).includes(entry.label),`${id}: message label coverage does not resolve to visible Mermaid text`);
    if(item.path.endsWith('/from')||item.path.endsWith('/to')){
     const endpoint=item.path.endsWith('/from')?entry.from:entry.to,participantIndex=sourceDocument.extensions['umf.visual'].sequence.participants.findIndex((participant:any)=>participant.id===endpoint),nativeEndpoint='P'+(participantIndex+1);
     assert(participantIndex>=0,`${id}: message endpoint is absent from the Visual participants`);
     assert.equal(item.path.endsWith('/from')?actual.from:actual.to,nativeEndpoint,`${id}: message endpoint coverage does not resolve to the native participant`);
    }
   }else if(group){
    const entry=sourceDocument.extensions['umf.visual'].groups[Number(group[1])],mapping=identityByVisual.get(entry.id);
    assert(mapping&&mapping.kind==='group',`${id}: group coverage has no identity mapping for ${entry.id}`);
    assert.equal(item.native[0]?.id,mapping.nativeId,`${id}: group coverage locator differs from its full-source identity`);
    const actual=native.messages[Number(mapping.nativeId.split('@')[1])-1];assert.equal(actual?.type,10,`${id}: group coverage does not resolve to its native loop-start event`);
    if(item.path.endsWith('/label'))assert(decodeMermaidText(actual.message).includes(entry.label),`${id}: group label coverage does not resolve to visible Mermaid text`);
   }
  }
  for(const participant of (sourceDocument.extensions['umf.visual'].sequence.participants))assert(native.text.includes(participant.label),`${id}: missing native participant label ${participant.label}`);
  for(const message of (sourceDocument.extensions['umf.visual'].sequence.messages))assert(native.text.includes(message.label),`${id}: missing native message label ${message.label}`);
  for(const entry of exported.coverage.filter((item:any)=>item.representation==='profile-annotation')){const name=entry.path.split('/').at(-1);assert(name&&native.text.includes(name),`${id}: annotation property ${entry.path} is not visible in rendered SVG`);const eventIndex=Number(entry.native?.[0]?.id?.slice('note@'.length))-1;assert.equal(native.noteIds[eventIndex],'i'+eventIndex,`${id}: annotation coverage locator does not point at the actual rendered Mermaid note`);}
  const file=`.cache/mermaid-annotated/${id}.svg`;await mkdir('.cache/mermaid-annotated',{recursive:true});await writeFile(file,native.svg);
  proof.push({id,path,sourceSha256:hashBytes(sourceBytes),modelVersion:'1.0.0',mappingVersion:'0.1.0',profile:'umf.visual.mermaid.annotated/1',emittedSourceSha256:hash(exported.text),participants:sourceDocument.extensions['umf.visual'].sequence.participants.length,semanticMessages:sourceDocument.extensions['umf.visual'].sequence.messages.length,nativeEvents:events.length,annotationNotes:expectedNoteCount,wrappedAnnotationNotes:annotatedMessages.length,maxAnnotationWidth:Math.max(...annotatedMessages.map((item:any)=>renderedNotes.get('i'+native.messages.indexOf(item))?.width??0)),maxAnnotationHeight:Math.max(...annotatedMessages.map((item:any)=>renderedNotes.get('i'+native.messages.indexOf(item))?.height??0)),svgSha256:hash(native.svg),svgPath:file,viewBox:native.viewBox});
 }
 const hostileValue=JSON.stringify({literalBreak:'<br/>',numeric:'#10;',ampersand:'&',quote:'"',backslash:'\\',multiline:'first line\nsecond line',htmlText:'<script>alert("safe text")</script>'},null,2);
 const hostileDocument=createVisualDocument({id:'mermaid-annotation-hostile-breaks',kind:'sequence',form:'lifelines',question:'Does escaped annotation survive?',sequence:{participants:[{id:'client',label:'Client',detail:hostileValue},{id:'service',label:'Service'}],messages:[{id:'request',from:'client',to:'service',kind:'call',label:'send'}]}});
 const hostile=serializeAnnotatedMermaid(hostileDocument);assert(hostile.text&&hostile.document,'Hostile-value source did not round-trip through the annotated profile: '+JSON.stringify(hostile.diagnostics));
 const hostileNative=await page.evaluate(async source=>{
  const api=(window as any).mermaid;api.initialize({startOnLoad:false,securityLevel:'strict',theme:'neutral',look:'classic',fontFamily:'Arial',deterministicIds:true,deterministicIDSeed:'annotation-hostile'});
  const diagram=await api.mermaidAPI.getDiagramFromText(source),messages=diagram.db.getMessages().map((item:any)=>({type:item.type,message:item.message})),result=await api.render('annotated-hostile',source),xml=new DOMParser().parseFromString(result.svg,'image/svg+xml'),svg=xml.documentElement;
  const live=window.document.importNode(svg,true);window.document.body.replaceChildren(live);const groups=[...window.document.querySelectorAll('g[data-et="note"]')].map((group:any)=>({id:group.getAttribute('data-id'),rectWidth:Number(group.querySelector('rect')?.getAttribute('width')),lines:[...group.querySelectorAll('text.noteText')].map((item:any)=>({text:item.textContent||'',width:item.getBBox().width}))}));
  return{messages,svgText:svg.textContent||'',svg:result.svg,scriptCount:svg.querySelectorAll('script').length,groups};
 },hostile.text);
 const hostileWire=JSON.stringify(hostileValue),visibleNoteRows=hostileNative.groups.map((group:any)=>group.lines.map((line:any)=>line.text).join(''));
 assert(visibleNoteRows.some((label:string)=>label.includes(hostileWire)),`Hostile escaped annotation wire value is not fully visible in native SVG: ${JSON.stringify(visibleNoteRows)}`);
 assert.equal(hostileNative.scriptCount,0,'User-supplied script-shaped text became an SVG script element');
 assert(hostileNative.messages.some((item:any)=>item.type===2&&item.message.includes('literalBreak')&&item.message.includes('<br/>')),'Mermaid native database did not preserve structural breaks and literal escaped <br/> as separate content');
 const hostileSvgPath='.cache/mermaid-annotated/hostile-literal-break.svg';await writeFile(hostileSvgPath,hostileNative.svg);
 const hostileReceipt={fixtureId:null,synthetic:true,sourceSha256:hash(JSON.stringify(hostileDocument)),modelVersion:'1.0.0',mappingVersion:'0.1.0',emittedSourceSha256:hash(hostile.text),nativeSvgSha256:hash(hostileNative.svg),nativeSvgPath:hostileSvgPath,literalValueVisible:true,scriptElementCount:hostileNative.scriptCount,maxLineWidth:Math.max(...hostileNative.groups.flatMap((group:any)=>group.lines.map((line:any)=>line.width))),maxNoteWidth:Math.max(...hostileNative.groups.map((group:any)=>group.rectWidth))};
 const report={schemaVersion:1,evidenceType:'independent-native-browser-render',engine:'Mermaid',nativeVersion:mermaidPackage.version,browserVersion:browser.version(),profile:'umf.visual.mermaid.annotated/1',cases:proof,negativeControls:[hostileReceipt]};
 await mkdir('.cache/mermaid-annotated',{recursive:true});await writeFile('.cache/mermaid-annotated/receipt.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
