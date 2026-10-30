// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,it} from 'bun:test';
import {zipSync} from 'fflate';
import {createVisualDocument,editVisual,LATEST_VISUAL_VERSION,type Visual} from '../../src/extensions/visual/index.js';
import {exportPowerPoint,importPowerPoint,updatePowerPoint,PowerPointError,ZIP_LIMITS,POWERPOINT_PROFILE} from '../../src/adapters/powerpoint/index.js';
import {inspectZip,partText,putText,writeZip} from '../../src/adapters/powerpoint/zip.js';
import {loadProfileParts,DRAWING_NS,PRESENTATION_NS,nativeName} from '../../src/adapters/powerpoint/profile.js';
import {attribute,child,children,parseXml,replaceRanges,type XmlElement} from '../../src/adapters/powerpoint/xml.js';

const sample=()=>createVisualDocument({id:'service-flow',kind:'flow',form:'network',title:'Service flow',question:'Where does a request travel?',nodes:[
  {id:'client',label:'Client'},{id:'api',label:'API'},{id:'store',label:'Store'}],edges:[
  {id:'request',from:'client',to:'api',label:'request'},{id:'persist',from:'api',to:'store',label:'persist'}]},'visual:service-flow');
function locateShape(xml:string,name:string):XmlElement {
  const root=parseXml(xml).root,tree=child(child(root,PRESENTATION_NS,'cSld'),PRESENTATION_NS,'spTree');
  for(const shape of tree.children.filter((x):x is XmlElement=>x.kind==='element'&&x.uri===PRESENTATION_NS&&['sp','cxnSp'].includes(x.local))){
    const nv=child(shape,PRESENTATION_NS,shape.local==='sp'?'nvSpPr':'nvCxnSpPr'),cNv=child(nv,PRESENTATION_NS,'cNvPr');
    if(attribute(cNv,'','name')?.value===name)return shape;
  }
  throw new Error('missing test shape '+name);
}
function editText(xml:string,name:string,value:string):string {
  const shape=locateShape(xml,name),body=children(shape,PRESENTATION_NS,'txBody')[0]!;
  const texts:XmlElement[]=[];const visit=(n:XmlElement)=>{for(const c of n.children)if(c.kind==='element'){if(c.uri===DRAWING_NS&&c.local==='t')texts.push(c);visit(c);}};visit(body);
  expect(texts.length).toBe(1);return replaceRanges(xml,[{start:texts[0]!.openEnd,end:texts[0]!.closeStart,text:value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}]);
}
function shapeNativeId(xml:string,name:string):string {
  const shape=locateShape(xml,name),nv=child(shape,PRESENTATION_NS,shape.local==='sp'?'nvSpPr':'nvCxnSpPr');return attribute(child(nv,PRESENTATION_NS,'cNvPr'),'','id')!.value;
}
function retarget(xml:string,edgeId:string,kind:'stCxn'|'endCxn',nativeId:string):string {
  const edge=locateShape(xml,nativeName('edge',edgeId)),nv=child(edge,PRESENTATION_NS,'nvCxnSpPr'),props=child(nv,PRESENTATION_NS,'cNvCxnSpPr'),connection=child(props,DRAWING_NS,kind),opening=xml.slice(connection.start,connection.openEnd);
  const updated=opening.replace(/(\bid\s*=\s*)(["'])[^"']*\2/,(_m,prefix,quote)=>prefix+quote+nativeId+quote);
  return replaceRanges(xml,[{start:connection.start,end:connection.openEnd,text:updated}]);
}
function removeConnectorText(xml:string,edgeId:string):string {
  const shape=locateShape(xml,nativeName('edge',edgeId)),body=children(shape,PRESENTATION_NS,'txBody')[0];
  return body?replaceRanges(xml,[{start:body.start,end:body.end,text:''}]):xml;
}
function removeShapeNamed(xml:string,name:string):string {
  const shape=locateShape(xml,name);return replaceRanges(xml,[{start:shape.start,end:shape.end,text:''}]);
}
function setBold(xml:string,name:string):string {
  const shape=locateShape(xml,name),start=xml.indexOf('<a:rPr',shape.start),end=xml.indexOf('>',start)+1;
  expect(start).toBeGreaterThanOrEqual(shape.start);expect(end).toBeLessThanOrEqual(shape.end);
  const opening=xml.slice(start,end),updated=/\bb\s*=/.test(opening)?opening.replace(/(\bb\s*=\s*)(["'])[^"']*\2/,'$1"1"'):/\/>$/.test(opening)?opening.replace(/\/>$/,' b="1"/>'):opening.replace(/>$/,' b="1">');
  return replaceRanges(xml,[{start,end,text:updated}]);
}
function moveNodeRight(xml:string,name:string,delta:number):string {
  const shape=locateShape(xml,name),spPr=child(shape,PRESENTATION_NS,'spPr'),xfrm=child(spPr,DRAWING_NS,'xfrm'),off=child(xfrm,DRAWING_NS,'off'),opening=xml.slice(off.start,off.openEnd),pattern=/(\bx\s*=\s*)(["'])(\d+)\2/;
  expect(pattern.test(opening)).toBe(true);
  return replaceRanges(xml,[{start:off.start,end:off.openEnd,text:opening.replace(pattern,(_m,prefix,quote,x)=>prefix+quote+(Number(x)+delta)+quote)}]);
}
function pack(parts:Map<string,Uint8Array>,slidePath='ppt/slides/slide1.xml',edit:(xml:string)=>string):Uint8Array {
  const xml=partText(parts,slidePath);putText(parts,slidePath,edit(xml));return writeZip(parts);
}
function errorCode(fn:()=>unknown):string|undefined {try{fn();}catch(error){return (error as {code?:string}).code;}return;}
async function importReport(bytes:Uint8Array,binding:Awaited<ReturnType<typeof exportPowerPoint>>['binding'],document=sample()) {
  return importPowerPoint(bytes,{mode:'report',binding,expectedBindingRevision:binding.bindingRevision,currentDocument:document});
}

describe('PowerPoint editable network profile',()=>{
  it('exports a real editable slide with attached directed connectors and a verified shared binding',async()=>{
    const document=sample(),exported=await exportPowerPoint(document,{mode:'report'}),profile=loadProfileParts(inspectZip(exported.bytes));
    for(const part of ['docProps/core.xml','docProps/app.xml','ppt/presProps.xml','ppt/viewProps.xml','ppt/tableStyles.xml'])expect(profile.parts.has(part)).toBe(true);
    expect(profile.customPath).toBe('customXml/item1.xml');
    expect([...profile.parts.keys()].some(path=>path==='customXml/itemProps1.xml'||path==='customXml/_rels/item1.xml.rels')).toBe(false);
    const presentationRels=partText(profile.parts,'ppt/_rels/presentation.xml.rels');
    for(const target of ['slides/slide1.xml','slideMasters/slideMaster1.xml','theme/theme1.xml','presProps.xml','viewProps.xml','tableStyles.xml','../customXml/item1.xml'])expect(presentationRels).toContain(`Target="${target}"`);
    const slideRels=partText(profile.parts,'ppt/slides/_rels/slide1.xml.rels');
    expect(slideRels).toContain('Target="../slideLayouts/slideLayout1.xml"');
    const theme=parseXml(partText(profile.parts,'ppt/theme/theme1.xml'),'theme').root,format=children(theme,DRAWING_NS,'themeElements')[0]!,scheme=children(format,DRAWING_NS,'fmtScheme')[0]!;
    for(const list of ['fillStyleLst','lnStyleLst','effectStyleLst','bgFillStyleLst'])expect(children(scheme,DRAWING_NS,list)[0]?.children.filter(n=>n.kind==='element').length).toBeGreaterThanOrEqual(3);
    expect(exported.profile).toBe(POWERPOINT_PROFILE);expect(profile.shapes.filter(s=>s.kind==='sp').length).toBe(7);
    expect(profile.shapes.filter(s=>s.kind==='cxnSp').length).toBe(2);
    expect(profile.shapes.find(s=>s.name===nativeName('edge','request'))?.text).toBe('');
    expect(profile.shapes.find(s=>s.name===nativeName('edge-label','request'))?.text).toBe('request');
    expect(profile.shapes.find(s=>s.name===nativeName('edge','request'))?.element.name).toBe('p:cxnSp');
    const connector=profile.shapes.find(s=>s.name===nativeName('edge','request'))!.element;
    expect(child(child(child(connector,PRESENTATION_NS,'nvCxnSpPr'),PRESENTATION_NS,'cNvCxnSpPr'),DRAWING_NS,'stCxn')).toBeDefined();
    const connectorSpPr=child(connector,PRESENTATION_NS,'spPr'),connectorXfrm=child(connectorSpPr,DRAWING_NS,'xfrm'),connectorExt=child(connectorXfrm,DRAWING_NS,'ext');
    expect(Number(attribute(connectorExt,'','cx')?.value)+Number(attribute(connectorExt,'','cy')?.value)).toBeGreaterThan(1);
    const nodeBox=(id:string)=>{const shape=profile.shapes.find(s=>s.name===nativeName('node',id))!.element,spPr=child(shape,PRESENTATION_NS,'spPr'),xfrm=child(spPr,DRAWING_NS,'xfrm'),off=child(xfrm,DRAWING_NS,'off'),ext=child(xfrm,DRAWING_NS,'ext');return{x:Number(attribute(off,'','x')?.value),y:Number(attribute(off,'','y')?.value),cx:Number(attribute(ext,'','cx')?.value),cy:Number(attribute(ext,'','cy')?.value),nativeId:attribute(child(child(shape,PRESENTATION_NS,'nvSpPr'),PRESENTATION_NS,'cNvPr'),'','id')?.value};};
    const source=nodeBox('client'),target=nodeBox('api'),lineOff=child(connectorXfrm,DRAWING_NS,'off'),start=child(child(child(connector,PRESENTATION_NS,'nvCxnSpPr'),PRESENTATION_NS,'cNvCxnSpPr'),DRAWING_NS,'stCxn'),end=child(child(child(connector,PRESENTATION_NS,'nvCxnSpPr'),PRESENTATION_NS,'cNvCxnSpPr'),DRAWING_NS,'endCxn');
    expect(attribute(start,'','id')?.value).toBe(source.nativeId);expect(attribute(end,'','id')?.value).toBe(target.nativeId);
    expect(Number(attribute(lineOff,'','x')?.value)).toBe(source.x+source.cx);expect(Number(attribute(lineOff,'','y')?.value)).toBe(source.y+source.cy/2);
    expect(Number(attribute(lineOff,'','x')?.value)+Number(attribute(connectorExt,'','cx')?.value)).toBe(target.x);
    expect(exported.binding.baselineNative.revision.kind).toBe('content-digest');
    expect(exported.binding.mappings.some(m=>m.path==='/extensions/umf.visual/nodes/0')).toBe(true);
    expect(exported.losses.map(loss=>loss.path)).toContain('/extensions/umf.visual/id');
    await expect(exportPowerPoint(document)).rejects.toMatchObject({code:'STRICT_LOSS'});
    await expect(importPowerPoint(exported.bytes,{mode:'report',binding:exported.binding,expectedBindingRevision:1,currentDocument:document})).resolves.toMatchObject({changes:[],binding:{bindingRevision:2}});
  });

  it('adopts only native text and attached endpoint changes through the shared reconciliation gate',async()=>{
    const document=sample(),exported=await exportPowerPoint(document,{mode:'report'}),parts=inspectZip(exported.bytes);
    const loaded=loadProfileParts(parts),slide=partText(parts,loaded.slidePath),to=shapeNativeId(slide,nativeName('node','store'));
    const editedSlide=retarget(editText(editText(editText(slide,nativeName('question',''),'Which service receives the call?'),nativeName('node','client'),'Web client & app'),nativeName('edge-label','request'),'HTTP request'), 'request','endCxn',to);
    putText(parts,loaded.slidePath,editedSlide);parts.set('custom/opaque.bin',new Uint8Array([0,7,9,255]));
    const editedBytes=writeZip(parts),imported=await importPowerPoint(editedBytes,{mode:'report',binding:exported.binding,expectedBindingRevision:1,currentDocument:document,currentSourceSha256:exported.sourceSha256});
    const v=imported.document.extensions!['umf.visual'] as unknown as Visual;
    expect(v.question).toBe('Which service receives the call?');expect(v.nodes![0]!.label).toBe('Web client & app');
    expect(v.edges![0]!.to).toBe('store');expect(v.edges![0]!.label).toBe('HTTP request');
    expect(imported.changes.map(change=>change.path).sort()).toEqual([
      '/extensions/umf.visual/edges/0/label','/extensions/umf.visual/edges/0/to','/extensions/umf.visual/nodes/0/label','/extensions/umf.visual/question',
    ]);
    expect(imported.binding.bindingRevision).toBe(2);
    expect(imported.nativeOnly).toEqual([]);

    const update=await updatePowerPoint(imported,imported.document,{mode:'report',expectedBindingRevision:2,currentArtifactSha256:imported.artifactSha256,currentArtifactBytes:editedBytes});
    expect(update.binding.bindingRevision).toBe(3);
    const outputParts=inspectZip(update.bytes);expect(Array.from(outputParts.get('custom/opaque.bin')!)).toEqual([0,7,9,255]);
    const roundtrip=await importPowerPoint(update.bytes,{mode:'report',binding:update.binding,expectedBindingRevision:3,currentDocument:imported.document});
    expect(roundtrip.changes).toEqual([]);expect(roundtrip.document.extensions!['umf.visual']).toEqual(imported.document.extensions!['umf.visual']);
  });

  it('accepts a PowerPoint-saved connector without text only when the source label is absent',async()=>{
    const document=editVisual(sample(),v=>{for(const edge of v.edges??[])delete edge.label;return v;});
    const exported=await exportPowerPoint(document,{mode:'report'}),parts=inspectZip(exported.bytes),profile=loadProfileParts(parts);
    const nativeSaved=pack(parts,profile.slidePath,xml=>removeConnectorText(xml,'request'));
    const imported=await importPowerPoint(nativeSaved,{mode:'report',binding:exported.binding,expectedBindingRevision:exported.bindingRevision,currentDocument:document,currentSourceSha256:exported.sourceSha256});
    expect(imported.changes).toEqual([]);
    expect((imported.capture.payload as any).visual.edges[0].label).toBe('');

    const labeled=await exportPowerPoint(sample(),{mode:'report'}),labeledParts=inspectZip(labeled.bytes),labeledProfile=loadProfileParts(labeledParts);
    const stripped=pack(labeledParts,labeledProfile.slidePath,xml=>removeShapeNamed(xml,nativeName('edge-label','request')));
    expect(()=>loadProfileParts(inspectZip(stripped))).toThrow(expect.objectContaining({code:'CONNECTOR_LABEL_LOSS'}));
  });

  it('refuses connector text bodies instead of erasing them from native fingerprints',async()=>{
    const exported=await exportPowerPoint(sample(),{mode:'report'}),parts=inspectZip(exported.bytes),profile=loadProfileParts(parts),body='<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr/><a:t>foreign connector text</a:t></a:r></a:p></p:txBody>';
    const malformed=pack(parts,profile.slidePath,xml=>{const shape=locateShape(xml,nativeName('edge','request')),close=xml.lastIndexOf('</p:cxnSp>',shape.end);return xml.slice(0,close)+body+xml.slice(close);});
    expect(()=>loadProfileParts(inspectZip(malformed))).toThrow(expect.objectContaining({code:'CONNECTOR_LABEL_LOCATION'}));
  });

  it('replays the sanitized PowerPoint network UI edits through native readback',async()=>{
    const replay=JSON.parse(await Bun.file('tests/powerpoint/fixtures/native-network-ui-replay.json').text());
    const document=JSON.parse(await Bun.file(replay.sourcePath).text()),exported=await exportPowerPoint(document,{mode:'report'}),parts=inspectZip(exported.bytes),profile=loadProfileParts(parts);
    let slide=partText(parts,profile.slidePath);
    for(const action of replay.actions){
      if(action.op==='setText')slide=editText(slide,action.shape,action.value);
      else if(action.op==='setBold')slide=setBold(slide,action.shape);
      else if(action.op==='moveRight')slide=moveNodeRight(slide,action.shape,action.deltaEmu);
      else if(action.op==='retarget')slide=retarget(slide,action.edge,action.endpoint,shapeNativeId(slide,nativeName('node',action.node)));
      else throw new Error('Unknown sanitized replay operation: '+action.op);
    }
    putText(parts,profile.slidePath,slide);
    const replayed=writeZip(parts),imported=await importPowerPoint(replayed,{mode:'report',binding:exported.binding,expectedBindingRevision:exported.bindingRevision,currentDocument:document,currentSourceSha256:exported.sourceSha256});
    const v=imported.document.extensions!['umf.visual'] as any;
    expect(imported.changes.map(change=>change.path).sort()).toEqual([...replay.expectedChangePaths].sort());
    expect(v.nodes[0].label).toBe(replay.expected.nodeLabel);expect(v.edges[0].to).toBe(replay.expected.edgeTo);
    const editedProfile=loadProfileParts(inspectZip(replayed)),node=editedProfile.shapes.find(s=>s.name===nativeName('node','n01'))!.element,runStart=editedProfile.slide.source.indexOf('<a:rPr',node.start),runEnd=editedProfile.slide.source.indexOf('>',runStart);
    expect(/\bb="1"/.test(editedProfile.slide.source.slice(runStart,runEnd+1))).toBe(true);
    const baseline=loadProfileParts(inspectZip(exported.bytes)),oldNode=baseline.shapes.find(s=>s.name===nativeName('node','n01'))!.element,newXfrm=child(child(node,PRESENTATION_NS,'spPr'),DRAWING_NS,'xfrm'),newOff=child(newXfrm,DRAWING_NS,'off'),oldXfrm=child(child(oldNode,PRESENTATION_NS,'spPr'),DRAWING_NS,'xfrm'),oldOff=child(oldXfrm,DRAWING_NS,'off');
    expect(Number(attribute(newOff,'','x')?.value)-Number(attribute(oldOff,'','x')?.value)).toBe(replay.expected.nativeGeometryDeltaEmu.x);
    expect(imported.losses.some(loss=>loss.code==='NATIVE_ONLY'&&loss.path.includes(nativeName('node','n01')))).toBe(true);
  });

  it('preserves unknown package content and reports new foreign native shapes as native-only',async()=>{
    const document=sample(),exported=await exportPowerPoint(document,{mode:'report'}),parts=inspectZip(exported.bytes);
    const path='ppt/slides/slide1.xml',xml=partText(parts,path);
    const foreign='<p:sp><p:nvSpPr><p:cNvPr id="90" name="foreign-object"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="100" y="200"/><a:ext cx="500" cy="500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr/><a:t>Native annotation</a:t></a:r></a:p></p:txBody></p:sp>';
    putText(parts,path,xml.replace('</p:spTree>',foreign+'</p:spTree>'));parts.set('custom/future.xml',new TextEncoder().encode('<x:future xmlns:x="urn:example" x:flag="yes"/>'));
    const editedNativeBytes=writeZip(parts),imported=await importPowerPoint(editedNativeBytes,{mode:'report',binding:exported.binding,expectedBindingRevision:1,currentDocument:document});
    expect(imported.nativeOnly).toContain('/ppt/slides/slide1.xml#foreign-object');
    expect(imported.losses.some(loss=>loss.family==='native'&&loss.path.includes('foreign-object'))).toBe(true);
    // The update consumes the independently supplied, digest-fenced package bytes;
    // mutable convenience maps from the import result are not the preservation source.
    imported.retained.delete('custom/future.xml');imported.mappings=[];
    const updated=await updatePowerPoint(imported,imported.document,{mode:'report',expectedBindingRevision:imported.bindingRevision,currentArtifactSha256:imported.artifactSha256,currentArtifactBytes:editedNativeBytes});
    expect(new TextDecoder().decode(inspectZip(updated.bytes).get('custom/future.xml'))).toContain('x:flag="yes"');
    expect(partText(inspectZip(updated.bytes),'ppt/slides/slide1.xml')).toContain('Native annotation');
  });

  it('rejects stale current package bytes even when the caller repeats the old digest string',async()=>{
    const document=sample(),exported=await exportPowerPoint(document,{mode:'report'}),imported=await importPowerPoint(exported.bytes,{mode:'report',binding:exported.binding,expectedBindingRevision:1});
    const changed=inspectZip(exported.bytes);changed.set('custom/extra.bin',new Uint8Array([1,2,3]));const staleBytes=writeZip(changed);
    await expect(updatePowerPoint(imported,imported.document,{mode:'report',expectedBindingRevision:imported.bindingRevision,currentArtifactSha256:imported.artifactSha256,currentArtifactBytes:staleBytes})).rejects.toMatchObject({code:'STALE_NATIVE'});
  });

  it('reports semantic omissions and refuses them in strict mode',async()=>{
    const document=createVisualDocument({id:'annotated',kind:'flow',form:'network',question:'Q',nodes:[{id:'a',label:'A',role:'actor',detail:'Human'}],edges:[{id:'e',from:'a',to:'a',label:'again',kind:'control',why:'Retries'}]});
    const result=await exportPowerPoint(document,{mode:'report'});
    expect(result.losses.map(loss=>loss.path)).toEqual(expect.arrayContaining(['/extensions/umf.visual/nodes/0/role','/extensions/umf.visual/nodes/0/detail','/extensions/umf.visual/edges/0/kind','/extensions/umf.visual/edges/0/why','/extensions/umf.visual/title','/extensions/umf.visual/id','/id','/umf']));
    await expect(exportPowerPoint(document)).rejects.toMatchObject({code:'STRICT_LOSS'});
  });

  it('fences stale source and binding revisions before semantic adoption',async()=>{
    const document=sample(),exported=await exportPowerPoint(document,{mode:'report'});
    const changed=editVisual(document,v=>({...v,question:'Changed locally'}));
    await expect(importPowerPoint(exported.bytes,{mode:'report',binding:exported.binding,expectedBindingRevision:1,currentDocument:changed})).rejects.toMatchObject({code:'STALE_SOURCE'});
    await expect(importPowerPoint(exported.bytes,{mode:'report',binding:exported.binding,expectedBindingRevision:2,currentDocument:document})).rejects.toMatchObject({code:'STALE_BINDING'});
    await expect(updatePowerPoint({} as any,document,{expectedBindingRevision:1,currentArtifactSha256:'0'.repeat(64),currentArtifactBytes:new Uint8Array()})).rejects.toMatchObject({code:'BINDING'});
  });

  it('recomputes qualified semantic losses instead of trusting a caller-cleared ledger',async()=>{
    const document=sample(),exported=await exportPowerPoint(document,{mode:'report'}),forged=JSON.parse(JSON.stringify(exported.binding));forged.losses=[];
    await expect(importPowerPoint(exported.bytes,{mode:'strict',binding:forged,expectedBindingRevision:1,currentDocument:document})).rejects.toMatchObject({code:'LOSS_LEDGER'});
  });

  it('bounds model-version capacities without silently upgrading 1.0',async()=>{
    const nodes=Array.from({length:16},(_,i)=>({id:'n'+i,label:'Node '+i})),edges=[{id:'e0',from:'n0',to:'n1',label:'next'}];
    const v={id:'large',kind:'flow' as const,form:'network' as const,question:'Q',nodes,edges};
    expect(()=>createVisualDocument(v,'visual:large','1.0.0')).toThrow();
    const optedIn=createVisualDocument(v,'visual:large','1.1.0'),exported=await exportPowerPoint(optedIn,{mode:'report'});expect(exported.modelVersion).toBe(LATEST_VISUAL_VERSION);
    const tooLarge=createVisualDocument({...v,nodes:Array.from({length:65},(_,i)=>({id:'n'+i,label:'Node '+i}))},'visual:large','1.1.0');
    await expect(exportPowerPoint(tooLarge,{mode:'report'})).rejects.toMatchObject({code:'RESOURCE_LIMIT'});
  });

  it('round-trips Unicode identities and line breaks as native editable text',async()=>{
    const id='a'.repeat(128),document=createVisualDocument({id:'unicode-flow',kind:'flow',form:'network',title:'路径 🧭',question:'What does this line\nshow?',nodes:[{id,label:'第一\r\nsecond'},{id:'api',label:'接口'}],edges:[{id:'call',from:id,to:'api',label:'open\nconnection'}]});
    const exported=await exportPowerPoint(document,{mode:'report'}),loaded=loadProfileParts(inspectZip(exported.bytes));
    expect(loaded.shapes.find(shape=>shape.name===nativeName('node',id))?.text).toBe('第一\r\nsecond');
    expect(loaded.shapes.find(shape=>shape.name===nativeName('edge-label','call'))?.text).toBe('open\nconnection');
    const imported=await importPowerPoint(exported.bytes,{mode:'report',binding:exported.binding,expectedBindingRevision:1});
    expect(imported.document.extensions!['umf.visual']).toEqual(document.extensions!['umf.visual']);
  });

  it('rejects namespace spoofing, DTD, unsafe part names and expansion bombs',async()=>{
    const document=sample(),exported=await exportPowerPoint(document,{mode:'report'}),parts=inspectZip(exported.bytes);
    const slide=partText(parts,'ppt/slides/slide1.xml');
    putText(parts,'ppt/slides/slide1.xml',slide.replace('<p:sld ','<!DOCTYPE p:sld [<!ENTITY evil SYSTEM "file:///etc/passwd">]><p:sld '));
    await expect(importPowerPoint(writeZip(parts),{mode:'report',binding:exported.binding,expectedBindingRevision:1})).rejects.toMatchObject({code:'XML_DTD'});
    const unsafe=zipSync({'../escape.txt':new Uint8Array([1])});expect(errorCode(()=>inspectZip(unsafe))).toBe('ZIP_PATH');
    expect(ZIP_LIMITS.compressedBytes).toBeGreaterThan(0);
    const bomb=zipSync({'bomb.bin':new Uint8Array(2_000_000)});expect(errorCode(()=>inspectZip(bomb))).toBe('ZIP_RATIO');
  });

  it('refuses missing or duplicated mapped identities and detached connectors',async()=>{
    const document=sample(),exported=await exportPowerPoint(document,{mode:'report'}),parts=inspectZip(exported.bytes),path='ppt/slides/slide1.xml',slide=partText(parts,path),baselineLoad=loadProfileParts(parts);
    const missingShape=baselineLoad.shapes.find(s=>s.name===nativeName('node','client'))!.element;
    const missing=slide.slice(0,missingShape.start)+slide.slice(missingShape.end);
    putText(parts,path,missing);await expect(importPowerPoint(writeZip(parts),{mode:'report',binding:exported.binding,expectedBindingRevision:1})).rejects.toMatchObject({code:'IDENTITY_MISSING'});
    const duplicate=inspectZip(exported.bytes);putText(duplicate,path,slide.replace('name="'+nativeName('node','store')+'"','name="'+nativeName('node','client')+'"'));
    await expect(importPowerPoint(writeZip(duplicate),{mode:'report',binding:exported.binding,expectedBindingRevision:1})).rejects.toMatchObject({code:'DUPLICATE_IDENTITY'});
    const detached=inspectZip(exported.bytes),edge=locateShape(slide,nativeName('edge','request')),end=child(child(child(edge,PRESENTATION_NS,'nvCxnSpPr'),PRESENTATION_NS,'cNvCxnSpPr'),DRAWING_NS,'endCxn');
    const open=slide.slice(end.start,end.openEnd).replace(/id="[0-9]+"/,'id="999"');putText(detached,path,replaceRanges(slide,[{start:end.start,end:end.openEnd,text:open}]));
    await expect(importPowerPoint(writeZip(detached),{mode:'report',binding:exported.binding,expectedBindingRevision:1})).rejects.toMatchObject({code:'ENDPOINT'});
  });

  it('refuses changed native arrowheads, zero-length connectors, and dynamic text fields',async()=>{
    const document=sample(),exported=await exportPowerPoint(document,{mode:'report'}),base=inspectZip(exported.bytes),path='ppt/slides/slide1.xml',slide=partText(base,path);
    const edge=locateShape(slide,nativeName('edge','request'));
    const wrongHead=inspectZip(exported.bytes);putText(wrongHead,path,slide.replace('<a:tailEnd type="triangle"/>','<a:tailEnd type="none"/>'));
    await expect(importPowerPoint(writeZip(wrongHead),{mode:'report',binding:exported.binding,expectedBindingRevision:1})).rejects.toMatchObject({code:'CONNECTOR_DIRECTION'});
    const zero=inspectZip(exported.bytes),edgeXml=slide.slice(edge.start,edge.end),zeroXml=edgeXml.replace(/<a:ext cx="[0-9]+" cy="[0-9]+"\/>/,'<a:ext cx="0" cy="0"/>');putText(zero,path,slide.replace(edgeXml,zeroXml));
    await expect(importPowerPoint(writeZip(zero),{mode:'report',binding:exported.binding,expectedBindingRevision:1})).rejects.toMatchObject({code:'CONNECTOR_GEOMETRY'});
    const field=inspectZip(exported.bytes),node=locateShape(slide,nativeName('node','client')),body=children(node,PRESENTATION_NS,'txBody')[0]!,text=children(body,DRAWING_NS,'p')[0]!;
    const xml=slide.slice(0,text.start)+'<a:p><a:fld id="{00000000-0000-0000-0000-000000000001}" type="datetime"><a:rPr/><a:t>Now</a:t></a:fld></a:p>'+slide.slice(text.end);
    putText(field,path,xml);await expect(importPowerPoint(writeZip(field),{mode:'report',binding:exported.binding,expectedBindingRevision:1})).rejects.toMatchObject({code:'SHAPE_TEXT'});
  });
});
