// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '@umf/core';
import {editVisual, getVisual, inspectVisual, writeVisualDocument, type Visual} from '../../extensions/visual/index.js';
import {admitHostBinding,checkHostFence,finishHostReconciliation,hostDigest,canonicalHostJson,copyHostJson,type HostBinding,type HostChange,type HostLoss,type HostObservation} from '../reconciliation/index.js';
import {PowerPointError, requirePpt} from './errors.js';
import {createFreshProfile, loadProfileParts, nativeName, parseNativeName, sha256, powerpointLosses, PROFILE, PROFILE_NS, PRESENTATION_NS, DRAWING_NS} from './profile.js';
import {attribute, child, children, escapeXmlText, parseXml, replaceInner, replaceRanges, textContent, type XmlElement} from './xml.js';
import {inspectZip, partText, writeZip} from './zip.js';
import {POWERPOINT_PROFILE, type PowerPointExportOptions, type PowerPointExportResult, type PowerPointImportOptions, type PowerPointImportResult, type PowerPointLoss, type PowerPointMapping, type PowerPointUpdateOptions, type PowerPointUpdateResult} from './types.js';

export {POWERPOINT_PROFILE, type PowerPointExportOptions, type PowerPointExportResult, type PowerPointImportOptions, type PowerPointImportResult, type PowerPointUpdateOptions, type PowerPointUpdateResult, type PowerPointLoss, type PowerPointMapping} from './types.js';
export {PowerPointError} from './errors.js';
export {ZIP_LIMITS} from './zip.js';
export {XML_LIMITS} from './xml.js';

function modeOf(mode:PowerPointExportOptions['mode']):'strict'|'report'{return mode??'strict';}
function assertNoLosses(losses:PowerPointLoss[],mode:'strict'|'report'):void {
  if(mode==='strict'&&losses.length)throw new PowerPointError('STRICT_LOSS','Strict PowerPoint export refuses '+losses.length+' retained-only semantic field(s).');
}
export async function exportPowerPoint(document:Document,options:PowerPointExportOptions={}):Promise<PowerPointExportResult> {
  const profile=await createFreshProfile(document,options.bindingRevision??1,options.resource);assertNoLosses(profile.losses,modeOf(options.mode));
  const bytes=writeZip(profile.parts),loaded=loadProfileParts(inspectZip(bytes));
  const mappings=hostMappings(getVisual(document),loaded.shapes,loaded.slidePath);
  const losses=profile.losses as HostLoss[];
  const capture=await observation(loaded,bytes);
  await proveProjection(document,capture);
  const binding=await admitHostBinding({profile:POWERPOINT_PROFILE,modelVersion:profile.modelVersion,resource:profile.resource,bindingRevision:profile.bindingRevision,source:copyHostJson(document),sourceDigestSha256:await hostDigest(document),baselineNative:capture,mappings,losses,state:'complete'});
  return {bytes,profile:POWERPOINT_PROFILE,modelVersion:profile.modelVersion,sourceSha256:profile.sourceSha256,bindingRevision:profile.bindingRevision,mappings,losses,binding,capture};
}

function visualItems(doc:Document):{visual:Visual;source:string} {
  const visual=getVisual(doc),source=writeVisualDocument(doc,'json');return {visual,source};
}
const sourcePtr=(tail:string)=>'/extensions/umf.visual'+tail;
function hostMappings(visual:Visual,shapes:ReturnType<typeof loadProfileParts>['shapes'],scope:string):PowerPointMapping[] {
  const byName=new Map(shapes.map(s=>[s.name,s]));
  const titlePath=visual.title===undefined?sourcePtr(''):sourcePtr('/title');
  return [
    {logicalId:visual.id,kind:'title',path:titlePath,nativeId:byName.get(nativeName('title',''))!.nativeId,nativeScope:scope},
    {logicalId:visual.id,kind:'question',path:sourcePtr('/question'),nativeId:byName.get(nativeName('question',''))!.nativeId,nativeScope:scope},
    ...(visual.nodes??[]).map((n,i)=>({logicalId:n.id,kind:'node' as const,path:sourcePtr('/nodes/'+i),nativeId:byName.get(nativeName('node',n.id))!.nativeId,nativeScope:scope})),
    ...(visual.edges??[]).flatMap((e,i)=>[
      {logicalId:e.id,kind:'edge' as const,path:sourcePtr('/edges/'+i),nativeId:byName.get(nativeName('edge',e.id))!.nativeId,nativeScope:scope},
      ...(e.label===undefined?[]:[{logicalId:e.id,kind:'edge' as const,path:sourcePtr('/edges/'+i+'/label'),nativeId:byName.get(nativeName('edge-label',e.id))!.nativeId,nativeScope:scope}]),
    ]),
  ];
}
async function artifactDigest(bytes:Uint8Array):Promise<string>{
  const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer as ArrayBuffer);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
function normalizePresentation(profile:ReturnType<typeof loadProfileParts>,shape:ReturnType<typeof loadProfileParts>['shapes'][number]):string {
  const base=shape.element.start,original=profile.slide.source.slice(base,shape.element.end);
  const edits:{start:number;end:number;text:string}[]=[];
  for(const t of descendants(shape.element,DRAWING_NS,'t'))edits.push({start:t.openEnd-base,end:t.closeStart-base,text:''});
  if(shape.kind==='cxnSp'){
    for(const local of ['stCxn','endCxn']){
      const nv=child(shape.element,PRESENTATION_NS,'nvCxnSpPr'),props=child(nv,PRESENTATION_NS,'cNvCxnSpPr'),con=child(props,DRAWING_NS,local);
      const open=profile.slide.source.slice(con.start,con.openEnd),pattern=/(\bid\s*=\s*)(["'])([^"']*)\2/;
      requirePpt(pattern.test(open),'ENDPOINT','Connector attachment has no native ID');
      edits.push({start:con.start-base,end:con.openEnd-base,text:open.replace(pattern,'$1"@endpoint"')});
    }
  }
  return replaceRanges(original,edits);
}
async function observation(profile:ReturnType<typeof loadProfileParts>,artifact:Uint8Array):Promise<HostObservation> {
  const visual=getVisual(profile.original),mapped=mapShapes(profile.shapes,visual),nativeIds=new Map<string,string>();
  for(const node of visual.nodes??[])nativeIds.set(mapped.byName.get(nativeName('node',node.id))!.nativeId,node.id);
  const nodes=(visual.nodes??[]).map(node=>{const shape=mapped.byName.get(nativeName('node',node.id))!;return{id:node.id,nativeId:shape.nativeId,label:shape.text};});
  const edges=(visual.edges??[]).map(edge=>{const shape=mapped.byName.get(nativeName('edge',edge.id))!,label=mapped.byName.get(nativeName('edge-label',edge.id));const from=nativeIds.get(connectorEndpoint(shape.element,'stCxn')),to=nativeIds.get(connectorEndpoint(shape.element,'endCxn'));requirePpt(from&&to,'ENDPOINT','Connector endpoint is outside its source identity mapping');return{id:edge.id,nativeId:shape.nativeId,...(label?{labelNativeId:label.nativeId}:{}),from,to,label:label?.text??''};});
  const nativePresentation=[] as {name:string;sha256:string;foreign:boolean}[];
  for(const shape of profile.shapes){const normalized=mapped.expected.has(shape.name)?normalizePresentation(profile,shape):profile.slide.source.slice(shape.element.start,shape.element.end);nativePresentation.push({name:shape.name,sha256:await (async()=>{const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized));return Array.from(new Uint8Array(h),b=>b.toString(16).padStart(2,'0')).join('');})(),foreign:!mapped.expected.has(shape.name)});}
  const payload={profile:POWERPOINT_PROFILE,resource:profile.resource,modelVersion:profile.modelVersion,slidePath:profile.slidePath,artifactSha256:await artifactDigest(artifact),visual:{id:visual.id,kind:visual.kind,form:visual.form,title:mapped.byName.get(nativeName('title',''))!.text,question:mapped.byName.get(nativeName('question',''))!.text,nodes,edges},nativePresentation};
  const digest=await hostDigest(payload);
  return {resource:profile.resource,revision:{kind:'content-digest',value:digest},captureDigestSha256:digest,payload:payload as unknown as import('@umf/core').Json};
}
async function proveProjection(document:Document,capture:HostObservation):Promise<void> {
  const v=getVisual(document),payload=capture.payload as any,projected=payload.visual;
  requirePpt(projected.id===v.id&&projected.kind===v.kind&&projected.form===v.form&&projected.title===(v.title??'')&&projected.question===v.question,'BASELINE_PROJECTION','PowerPoint native baseline does not match source title/question/profile');
  requirePpt(projected.nodes.length===(v.nodes??[]).length&&projected.edges.length===(v.edges??[]).length,'BASELINE_PROJECTION','PowerPoint native baseline object counts do not match source');
  for(let i=0;i<projected.nodes.length;i++)requirePpt(projected.nodes[i].id===v.nodes![i]!.id&&projected.nodes[i].label===v.nodes![i]!.label,'BASELINE_PROJECTION','PowerPoint native node baseline differs at /nodes/'+i);
  for(let i=0;i<projected.edges.length;i++){
    const a=projected.edges[i],e=v.edges![i]!;requirePpt(a.id===e.id&&a.from===e.from&&a.to===e.to&&a.label===(e.label??''),'BASELINE_PROJECTION','PowerPoint native connector baseline differs at /edges/'+i);
  }
}
function mapShapes(shapes:ReturnType<typeof loadProfileParts>['shapes'],visual:Visual):{byName:Map<string,typeof shapes[number]>;nativeById:Map<string,string>;expected:Set<string>;foreign:string[]} {
  const expected=new Set([nativeName('title',''),nativeName('question',''),...(visual.nodes??[]).map(n=>nativeName('node',n.id)),...(visual.edges??[]).flatMap(e=>[nativeName('edge',e.id),...(e.label===undefined?[]:[nativeName('edge-label',e.id)])])]);
  const byName=new Map(shapes.map(shape=>[shape.name,shape]));
  for(const name of expected)requirePpt(byName.has(name),'IDENTITY_MISSING','Mapped native PowerPoint object is missing: '+name);
  for(const shape of shapes){
    const identity=parseNativeName(shape.name);if(identity&& !expected.has(shape.name))throw new PowerPointError('IDENTITY_CONFLICT','Native object claims an unexpected UMF identity: '+shape.name);
    if(expected.has(shape.name)){const parsed=identity!;const wanted=parsed.kind==='edge'?'cxnSp':'sp';requirePpt(shape.kind===wanted,'IDENTITY_KIND','Mapped object has the wrong native shape kind: '+shape.name);}
  }
  const nativeById=new Map(shapes.map(shape=>[shape.nativeId,shape.name]));
  return {byName,nativeById,expected,foreign:shapes.filter(s=>!expected.has(s.name)).map(s=>s.name)};
}
function connectorEndpoint(shape:XmlElement,tag:'stCxn'|'endCxn'):string {
  const nv=child(shape,PRESENTATION_NS,'nvCxnSpPr'),cNv=child(nv,PRESENTATION_NS,'cNvCxnSpPr');
  const connection=child(cNv,DRAWING_NS,tag),id=attribute(connection,'','id')?.value;
  requirePpt(id&&/^[1-9][0-9]*$/.test(id),'ENDPOINT','Connector has a missing or invalid attached shape ID');return id!;
}
function textPresence(original:string|undefined,current:string):string|undefined {
  return original===undefined&&current===''?undefined:current;
}
function presence(value:unknown):HostChange['before'] {return value===undefined?{present:false}:{present:true,value:value as import('@umf/core').Json};}
async function applyNativeReadback(profile:ReturnType<typeof loadProfileParts>,capture:HostObservation,binding:HostBinding,options:PowerPointImportOptions):Promise<PowerPointImportResult> {
  const base=binding.source,{visual,source}=visualItems(base);requirePpt(source===profile.source,'SOURCE_INTEGRITY','Embedded source differs from the admitted UMF binding');
  requirePpt(binding.profile===POWERPOINT_PROFILE&&binding.modelVersion===profile.modelVersion&&canonicalHostJson(binding.resource)===canonicalHostJson(profile.resource),'BINDING','PowerPoint source companion does not match the admitted binding');
  await proveProjection(base,binding.baselineNative);
  const maps=mapShapes(profile.shapes,visual),projection=(capture.payload as any).visual;
  const changes:HostChange[]=[];
  const edited=editVisual(base,v=>{
    const put=<T>(path:string,before:unknown,after:T):T=>{const b=presence(before),a=presence(after);if(canonicalHostJson(b)!==canonicalHostJson(a))changes.push({path,before:b,after:a});return after;};
    const title=projection.title as string,question=projection.question as string;
    const titleValue=textPresence(v.title,title),nextTitle=put<string|undefined>(sourcePtr('/title'),v.title,titleValue);if(nextTitle===undefined)delete v.title;else v.title=nextTitle;
    v.question=put<string>(sourcePtr('/question'),v.question,question);
    const actualNodes=new Map<string,{label:string}>((projection.nodes as any[]).map(x=>[x.id,x]));
    for(let i=0;i<(v.nodes??[]).length;i++){const node=v.nodes![i]!,actual=actualNodes.get(node.id);requirePpt(actual,'IDENTITY_MISSING','Native node identity is absent');node.label=put<string>(sourcePtr('/nodes/'+i+'/label'),node.label,actual!.label);}
    const actualEdges=new Map<string,any>((projection.edges as any[]).map(x=>[x.id,x]));
    for(let i=0;i<(v.edges??[]).length;i++){
      const edge=v.edges![i]!,actual=actualEdges.get(edge.id);requirePpt(actual,'IDENTITY_MISSING','Native connector identity is absent');
      edge.from=put<string>(sourcePtr('/edges/'+i+'/from'),edge.from,actual!.from);edge.to=put<string>(sourcePtr('/edges/'+i+'/to'),edge.to,actual!.to);
      const label=textPresence(edge.label,actual!.label),nextLabel=put<string|undefined>(sourcePtr('/edges/'+i+'/label'),edge.label,label);if(nextLabel===undefined)delete edge.label;else edge.label=nextLabel;
    }
    return v;
  });
  requirePpt(inspectVisual(edited).valid&&inspectVisual(edited).complete,'INVALID_IMPORTED_VISUAL','Native readback does not form a complete visual document');
  const nativeOnly=maps.foreign.map(name=>'/ppt/slides/'+profile.slidePath.split('/').at(-1)+'#'+name);
  const oldEntries=new Map((((binding.baselineNative.payload as any).nativePresentation??[]) as any[]).map(x=>[x.name,x.sha256]));
  const newEntries=new Map((((capture.payload as any).nativePresentation??[]) as any[]).map((x:any)=>[x.name,x.sha256]));
  const nativeOnlyChanges:string[]=[];
  for(const name of new Set([...oldEntries.keys(),...newEntries.keys()]))if(oldEntries.get(name)!==newEntries.get(name))nativeOnlyChanges.push('/ppt/slides/'+profile.slidePath.split('/').at(-1)+'#'+name+'/presentation');
  const losses:HostLoss[]=[...binding.losses];
  for(const path of nativeOnlyChanges){if(!losses.some(loss=>loss.path===path&&loss.code==='NATIVE_ONLY'))losses.push({path,code:'NATIVE_ONLY',family:'native',representation:'retained-only',message:'Native geometry, style, or unmapped PowerPoint content is preserved without UMF interpretation.'});}
  const fence={expectedBindingRevision:options.expectedBindingRevision!,observedBefore:options.observedBefore??capture,observedAfter:capture};
  const result=await finishHostReconciliation(binding,options.currentDocument??base,fence,{document:edited,changes,nativeOnlyChanges,losses});
  requirePpt(result.ok,'RECONCILIATION',result.ok?'':result.diagnostics.map(d=>d.code+': '+d.message).join('; '));
  const resultLosses=result.losses;assertNoLosses(resultLosses,modeOf(options.mode));
  const mappings=createMappings(visual,profile.shapes,profile.slidePath);
  return {document:result.document,original:base,profile:POWERPOINT_PROFILE,modelVersion:profile.modelVersion,sourceSha256:profile.sourceSha256,bindingRevision:result.binding.bindingRevision,mappings,losses:resultLosses,changes,nativeOnly,unmapped:maps.foreign,binding:result.binding,capture,artifactSha256:(capture.payload as any).artifactSha256,retained:profile.parts};
}
function createMappings(visual:Visual,shapes:ReturnType<typeof loadProfileParts>['shapes'],scope:string):PowerPointMapping[] {
  return hostMappings(visual,shapes,scope) as PowerPointMapping[];
}
function assertLossLedger(binding:HostBinding,source:Document):void {
  const expected=powerpointLosses(source,getVisual(source)).filter(loss=>loss.family==='semantic'),actual=binding.losses.filter(loss=>loss.family==='semantic');
  requirePpt(canonicalHostJson(actual)===canonicalHostJson(expected),'LOSS_LEDGER','PowerPoint binding semantic losses do not match the qualified source projection');
}

export async function importPowerPoint(bytes:Uint8Array,options:PowerPointImportOptions={}):Promise<PowerPointImportResult> {
  requirePpt(options.binding&&Number.isSafeInteger(options.expectedBindingRevision),'BINDING','Import requires an admitted PowerPoint binding and expected revision');
  const binding=await admitHostBinding(options.binding),parts=inspectZip(bytes),profile=loadProfileParts(parts);
  requirePpt(await sha256(profile.source)===profile.sourceSha256,'SOURCE_INTEGRITY','Embedded UMF source digest does not match its companion hash');
  requirePpt(options.expectedBindingRevision===binding.bindingRevision&&options.expectedBindingRevision===profile.bindingRevision,'STALE_BINDING','PowerPoint binding revision changed');
  requirePpt(writeVisualDocument(binding.source,'json')===profile.source,'STALE_SOURCE','PowerPoint package source differs from the admitted binding');
  if(options.currentSourceSha256!==undefined)requirePpt(options.currentSourceSha256===profile.sourceSha256,'STALE_SOURCE','Current source digest differs from the embedded source');
  if(options.currentDocument)requirePpt(writeVisualDocument(options.currentDocument,'json')===profile.source,'STALE_SOURCE','Current UMF document differs from the admitted binding');
  const capture=await observation(profile,bytes);
  assertLossLedger(binding,profile.original);
  return applyNativeReadback(profile,capture,binding,{...options,binding});
}

function stableAllowedDocument(document:Document,base:Document):void {
  const left=JSON.parse(JSON.stringify(base)) as any,right=JSON.parse(JSON.stringify(document)) as any;
  const lv=left.extensions?.['umf.visual'],rv=right.extensions?.['umf.visual'];requirePpt(lv&&rv,'SOURCE_PROFILE','Expected UMF visual documents');
  requirePpt(JSON.stringify(lv.nodes?.map((n:any)=>n.id))===JSON.stringify(rv.nodes?.map((n:any)=>n.id))&&JSON.stringify(lv.edges?.map((e:any)=>e.id))===JSON.stringify(rv.edges?.map((e:any)=>e.id)),'UNSAFE_EDIT','Native-preserving update cannot add, delete, reorder, or rename mapped objects');
  for(let i=0;i<(lv.edges??[]).length;i++)requirePpt(Object.hasOwn(lv.edges[i],'label')===Object.hasOwn(rv.edges[i],'label'),'UNSAFE_EDIT','Native-preserving update cannot add or remove a mapped edge-label shape.');
  const strip=(v:any)=>{delete v.title;delete v.question;for(const n of v.nodes??[])delete n.label;for(const e of v.edges??[]){delete e.label;delete e.from;delete e.to;}};
  strip(lv);strip(rv);requirePpt(JSON.stringify(left)===JSON.stringify(right),'UNSAFE_EDIT','Native-preserving update contains changes outside the qualified edit classes');
}
function patchAttribute(source:string,node:XmlElement,local:string,value:string):string {
  const opening=source.slice(node.start,node.openEnd),pattern=new RegExp("(^|\\s)"+local+"\\s*=\\s*([\"'])([^\"']*)\\2");
  requirePpt(pattern.test(opening),'XML_PATCH','Expected unprefixed '+local+' attribute in native connection');
  return opening.replace(pattern,(_all,prefix,quote)=>prefix+local+'='+quote+value+quote);
}
function updateSlideXml(xml:string,visual:Visual):string {
  const parsed=parseXml(xml,'PowerPoint slide for update'),cSld=child(parsed.root,PRESENTATION_NS,'cSld'),tree=child(cSld,PRESENTATION_NS,'spTree');
  const elements=tree.children.filter((e):e is XmlElement=>e.kind==='element'&&e.uri===PRESENTATION_NS&&['sp','cxnSp'].includes(e.local));
  const byName=new Map<string,XmlElement>();for(const shape of elements){const nv=child(shape,PRESENTATION_NS,shape.local==='sp'?'nvSpPr':'nvCxnSpPr'),name=attribute(child(nv,PRESENTATION_NS,'cNvPr'),'','name')?.value;requirePpt(name&&!byName.has(name),'DUPLICATE_IDENTITY','Shape name is missing or duplicated');byName.set(name!,shape);}
  const nodeNames=new Map<string,string>();for(const n of visual.nodes??[])nodeNames.set(n.id,nativeName('node',n.id));
  const nodeShapes=new Map<string,XmlElement>();for(const n of visual.nodes??[])nodeShapes.set(n.id,byName.get(nativeName('node',n.id))!);
  const nodeNum=(id:string)=>attribute(child(child(nodeShapes.get(id)!,PRESENTATION_NS,'nvSpPr'),PRESENTATION_NS,'cNvPr'),'','id')?.value;
  // Native values live in one a:t each; replace only its text span and connector attachment IDs.
  const patches:{start:number;end:number;text:string}[]=[];
  const setText=(name:string,value:string)=>{
    xmlSafeForPatch(value);requirePpt(!value.includes('\n')&&!value.includes('\r'),'TEXT_COMPLEXITY','Native-preserving update does not rewrite multiline rich text');
    const shape=byName.get(name);requirePpt(shape,'IDENTITY_MISSING','Mapped object disappeared before update: '+name);
    const body=children(shape!,PRESENTATION_NS,'txBody')[0];if(!body){requirePpt(shape!.local==='cxnSp'&&value==='','SHAPE_TEXT','Mapped shape no longer has a text body');return;}
    const texts=descendants(body!,DRAWING_NS,'t');requirePpt(texts.length===1,'TEXT_COMPLEXITY','Mapped PowerPoint object must contain exactly one editable text run');
    const t=texts[0]!;patches.push({start:t.openEnd,end:t.closeStart,text:escapeXmlText(value)});
  };
  setText(nativeName('title',''),visual.title??'');setText(nativeName('question',''),visual.question);
  for(const n of visual.nodes??[])setText(nativeName('node',n.id),n.label);
  for(const e of visual.edges??[]){
    const edge=byName.get(nativeName('edge',e.id));requirePpt(edge,'IDENTITY_MISSING','Mapped connector disappeared before update: '+e.id);
    if(e.label!==undefined)setText(nativeName('edge-label',e.id),e.label);
    const nv=child(edge!,PRESENTATION_NS,'nvCxnSpPr'),props=child(nv,PRESENTATION_NS,'cNvCxnSpPr');
    const from=child(props,DRAWING_NS,'stCxn'),to=child(props,DRAWING_NS,'endCxn'),fromNum=nodeNum(e.from),toNum=nodeNum(e.to);
    requirePpt(fromNum&&toNum,'ENDPOINT','UMF connector endpoint is not mapped during update');
    patches.push({start:from.start,end:from.openEnd,text:patchAttribute(xml,from,'id',fromNum!)});
    patches.push({start:to.start,end:to.openEnd,text:patchAttribute(xml,to,'id',toNum!)});
  }
  return replaceRanges(xml,patches);
}
function descendants(root:XmlElement,uri:string,local:string):XmlElement[]{const out:XmlElement[]=[];for(const c of root.children)if(c.kind==='element'){if(c.uri===uri&&c.local===local)out.push(c);out.push(...descendants(c,uri,local));}return out;}
function xmlSafeForPatch(value:string):void {for(const ch of value){const cp=ch.codePointAt(0)!;requirePpt(cp===9||cp===10||cp===13||(cp>=0x20&&cp<=0xd7ff)||(cp>=0xe000&&cp<=0xfffd)||(cp>=0x10000&&cp<=0x10ffff),'XML_CHAR','Text contains a character forbidden in XML 1.0');}}

export async function updatePowerPoint(previous:PowerPointImportResult,document:Document,options:PowerPointUpdateOptions={}):Promise<PowerPointUpdateResult> {
  requirePpt(previous.profile===POWERPOINT_PROFILE,'BINDING','Previous import belongs to a different PowerPoint profile');
  requirePpt(options.expectedBindingRevision===previous.bindingRevision,'STALE_BINDING','Expected binding revision is required and must match the previous PowerPoint import');
  const previousBinding=await admitHostBinding(previous.binding);
  assertLossLedger(previousBinding,previous.original);
  requirePpt(options.currentArtifactBytes instanceof Uint8Array&&options.currentArtifactSha256,'STALE_NATIVE','Current PowerPoint bytes and digest are required for a native-preserving update');
  const actualArtifactSha256=await artifactDigest(options.currentArtifactBytes),baselineArtifactSha256=(previousBinding.baselineNative.payload as any).artifactSha256;
  requirePpt(options.currentArtifactSha256===actualArtifactSha256&&actualArtifactSha256===previous.artifactSha256&&actualArtifactSha256===baselineArtifactSha256,'STALE_NATIVE','Current PowerPoint bytes differ from the admitted native artifact');
  const parts=inspectZip(options.currentArtifactBytes),currentProfile=loadProfileParts(parts);
  requirePpt(currentProfile.source===writeVisualDocument(previous.original,'json')&&currentProfile.sourceSha256===previous.sourceSha256&&currentProfile.bindingRevision+1===previous.bindingRevision&&canonicalHostJson(currentProfile.resource)===canonicalHostJson(previousBinding.resource),'STALE_NATIVE','Current PowerPoint package lineage differs from the admitted import');
  const currentCapture=await observation(currentProfile,options.currentArtifactBytes);
  requirePpt(currentCapture.captureDigestSha256===previousBinding.baselineNative.captureDigestSha256,'STALE_NATIVE','Current PowerPoint native observation differs from the admitted import');
  requirePpt(await hostDigest(previousBinding.source)===previousBinding.sourceDigestSha256,'STALE_SOURCE','Previously imported UMF source digest is inconsistent');
  if(options.currentDocument){requirePpt(options.currentSourceSha256,'STALE_SOURCE','Current source digest is required to fence a native update');requirePpt(await sha256(writeVisualDocument(options.currentDocument,'json'))===options.currentSourceSha256,'STALE_SOURCE','Current UMF source digest does not match document');requirePpt(writeVisualDocument(options.currentDocument,'json')===writeVisualDocument(previousBinding.source,'json'),'STALE_SOURCE','Current UMF document differs from the admitted binding');}
  stableAllowedDocument(document,previousBinding.source);
  const losses=previousBinding.losses;assertNoLosses(losses,modeOf(options.mode));
  const nextSource=writeVisualDocument(document,'json'),sourceSha256=await sha256(nextSource),bindingRevision=previous.bindingRevision+1;
  const slidePath=currentProfile.slidePath;
  const visual=getVisual(document),slideText=partText(parts,slidePath);parts.set(slidePath,new TextEncoder().encode(updateSlideXml(slideText,visual)));
  // The companion is refreshed as lineage/recovery material only. It never promotes a loss to native support.
  const sourcePart=currentProfile.customPath;
  const sourceXml=parseXml(partText(parts,sourcePart),sourcePart),payload=JSON.parse(textContent(sourceXml.root));
  requirePpt(payload.profile===PROFILE&&payload.sourceSha256===await sha256(writeVisualDocument(previous.original,'json'))&&payload.bindingRevision+1===previous.bindingRevision,'BINDING','PowerPoint source companion changed since import');
  payload.source=nextSource;payload.sourceSha256=sourceSha256;payload.bindingRevision=bindingRevision;payload.modelVersion=document.vocabularies['umf.visual']!.version;
  parts.set(sourcePart,new TextEncoder().encode(replaceInner(sourceXml,sourceXml.root,JSON.stringify(payload))));
  const bytes=writeZip(parts),updatedProfile=loadProfileParts(inspectZip(bytes)),capture=await observation(updatedProfile,bytes);await proveProjection(document,capture);
  const currentVisual=getVisual(document),mappings=hostMappings(currentVisual,updatedProfile.shapes,updatedProfile.slidePath),binding=await admitHostBinding({profile:POWERPOINT_PROFILE,modelVersion:payload.modelVersion,resource:previousBinding.resource,bindingRevision,source:copyHostJson(document),sourceDigestSha256:await hostDigest(document),baselineNative:capture,mappings,losses,state:'complete'});
  return {bytes,profile:POWERPOINT_PROFILE,modelVersion:payload.modelVersion,sourceSha256,bindingRevision,mappings,losses,binding,capture};
}

