// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '@umf/core';
import type {HostResource} from '../reconciliation/types.js';
import {getVisual, writeVisualDocument, VISUAL_EXTENSION, LATEST_VISUAL_VERSION, VISUAL_VERSION, inspectVisual, type Visual, type VisualVersion} from '../../extensions/visual/index.js';
import {PowerPointError, requirePpt} from './errors.js';
import {escapeXmlAttribute, escapeXmlText, parseXml, children, child, attribute, textContent, type ParsedXml, type XmlElement} from './xml.js';
import {OPC_TEMPLATE_PARTS} from './opc-template.js';
import type {PowerPointLoss, PowerPointMapping} from './types.js';

export const OFFICE_REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const PACKAGE_REL='http://schemas.openxmlformats.org/package/2006/relationships';
export const PRESENTATION_NS='http://schemas.openxmlformats.org/presentationml/2006/main';
export const DRAWING_NS='http://schemas.openxmlformats.org/drawingml/2006/main';
export const PROFILE_NS='https://documentdrivendx.org/umf/powerpoint/1';
export const PROFILE='umf.visual.powerpoint.network/1';
export const MODEL_LIMITS=Object.freeze({nodes10:15,nodes11:64,edges:256,groups:32,groupDepth:8});
export interface ExportedProfile {parts:Map<string,Uint8Array>;source:string;sourceSha256:string;modelVersion:VisualVersion;mappings:PowerPointMapping[];losses:PowerPointLoss[];bindingRevision:number;resource:HostResource;}
const encoder=new TextEncoder();
const bytes=(text:string)=>encoder.encode(text);
const xmlSafe=(value:string,path:string)=>{
  for(const ch of value){const cp=ch.codePointAt(0)!;requirePpt(cp===9||cp===10||cp===13||(cp>=0x20&&cp<=0xd7ff)||(cp>=0xe000&&cp<=0xfffd)||(cp>=0x10000&&cp<=0x10ffff),'XML_CHAR','Text contains an XML 1.0 forbidden character at '+path);}
};
export function encodeIdentity(value:string):string {
  let binary='';for(const byte of encoder.encode(value))binary+=String.fromCharCode(byte);
  return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export function decodeIdentity(value:string):string {
  requirePpt(/^[A-Za-z0-9_-]*$/.test(value)&&value.length%4!==1,'IDENTITY','Invalid encoded native identity');
  const padded=value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4);
  try{const binary=atob(padded);return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));}catch{throw new PowerPointError('IDENTITY','Native identity is not valid UTF-8');}
}
export function nativeName(kind:'node'|'edge'|'edge-label'|'title'|'question',id:string):string {
  const value=kind==='title'?'umf-title':kind==='question'?'umf-question':'umf-'+kind+'-'+encodeIdentity(id);
  requirePpt(value.length<=250,'IDENTITY_LIMIT','A logical ID is too long for a qualified PowerPoint object name');return value;
}
export function parseNativeName(name:string):{kind:'node'|'edge'|'edge-label'|'title'|'question';id?:string}|undefined {
  if(name==='umf-title')return {kind:'title'};if(name==='umf-question')return {kind:'question'};
  const m=/^umf-(edge-label|node|edge)-([A-Za-z0-9_-]*)$/.exec(name);if(!m)return;
  const id=decodeIdentity(m[2]!);return {kind:m[1] as 'node'|'edge'|'edge-label',id};
}
export async function sha256(text:string):Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',bytes(text));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
function xmlTextBody(text:string):string {
  const lines=text.split('\n'),runs:string[]=[];
  for(let i=0;i<lines.length;i++){if(i)runs.push('<a:br><a:rPr lang="en-US"/></a:br>');runs.push('<a:r><a:rPr lang="en-US"/><a:t xml:space="preserve">'+escapeXmlText(lines[i]!)+'</a:t></a:r>');}
  return '<p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:pPr/>'+runs.join('')+'<a:endParaRPr lang="en-US"/></a:p></p:txBody>';
}
const rectGeom='<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
function shape(id:number,name:string,text:string,x:number,y:number,cx:number,cy:number,role:'title'|'question'|'node'|'edge-label'):string {
  const title=role==='title',question=role==='question';
  const caption=role==='edge-label',fill=caption?'FFFFFF':title||question?'F3F6FA':'E6EEF7',line=title||question?'FFFFFF':'55708A';
  return '<p:sp><p:nvSpPr><p:cNvPr id="'+id+'" name="'+escapeXmlAttribute(name)+'" descr="umf.visual powerpoint editable '+role+'"/><p:cNvSpPr txBox="'+(title||question||caption?'1':'0')+'"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="'+x+'" y="'+y+'"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm>'+rectGeom+'<a:solidFill><a:srgbClr val="'+fill+'"/></a:solidFill><a:ln w="'+(caption?'0':'12700')+'"><a:solidFill><a:srgbClr val="'+(caption?'FFFFFF':line)+'"/></a:solidFill></a:ln></p:spPr>'+xmlTextBody(text)+'</p:sp>';
}
function connector(id:number,name:string,fromShape:number,toShape:number,from:{x:number;y:number;port:number},to:{x:number;y:number;port:number}):string {
  const left=Math.min(from.x,to.x),top=Math.min(from.y,to.y),cx=Math.max(1,Math.abs(to.x-from.x)),cy=Math.max(1,Math.abs(to.y-from.y));
  const flipH=from.x>to.x?' flipH="1"':'',flipV=from.y>to.y?' flipV="1"':'';
  return '<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="'+id+'" name="'+escapeXmlAttribute(name)+'" descr="umf.visual powerpoint editable directed connector"/><p:cNvCxnSpPr><a:stCxn id="'+fromShape+'" idx="'+from.port+'"/><a:endCxn id="'+toShape+'" idx="'+to.port+'"/></p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm'+flipH+flipV+'><a:off x="'+left+'" y="'+top+'"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="19050"><a:solidFill><a:srgbClr val="34495E"/></a:solidFill><a:headEnd type="none"/><a:tailEnd type="triangle"/></a:ln></p:spPr></p:cxnSp>';
}
function slideXml(v:Visual):{xml:string;shapeIds:Map<string,number>;mappings:PowerPointMapping[]} {
  const width=12_192_000,height=6_858_000,marginX=480_000,top=1_670_000;
  const nodes=v.nodes??[],edges=v.edges??[];const columns=Math.min(8,Math.max(1,Math.ceil(Math.sqrt(nodes.length))));
  const rows=Math.max(1,Math.ceil(nodes.length/columns));const cellW=Math.floor((width-2*marginX)/columns),cellH=Math.floor((height-top-500_000)/rows);
  const nodeW=Math.min(1_450_000,Math.floor(cellW*.78)),nodeH=Math.min(720_000,Math.floor(cellH*.56));
  const positions=new Map<string,{x:number;y:number}>(),shapeIds=new Map<string,number>(),nodeBoxes=new Map<string,{x:number;y:number;cx:number;cy:number}>(),mappings:PowerPointMapping[]=[];
  let nextId=4;
  const items=[
    shape(2,nativeName('title',''),v.title??'',marginX,220_000,width-2*marginX,470_000,'title'),
    shape(3,nativeName('question',''),v.question,marginX,820_000,width-2*marginX,490_000,'question'),
  ];
  mappings.push({logicalId:v.id,kind:'title',path:'/title',nativeId:'2',nativeScope:'ppt/slides/slide1.xml'},
    {logicalId:v.id,kind:'question',path:'/question',nativeId:'3',nativeScope:'ppt/slides/slide1.xml'});
  for(let i=0;i<nodes.length;i++){
    const node=nodes[i]!,col=i%columns,row=Math.floor(i/columns),x=marginX+col*cellW+Math.floor((cellW-nodeW)/2),y=top+row*cellH+Math.floor((cellH-nodeH)/2);
    const sid=nextId++;positions.set(node.id,{x:x+Math.floor(nodeW/2),y:y+Math.floor(nodeH/2)});nodeBoxes.set(node.id,{x,y,cx:nodeW,cy:nodeH});shapeIds.set(node.id,sid);
    items.push(shape(sid,nativeName('node',node.id),node.label,x,y,nodeW,nodeH,'node'));
    mappings.push({logicalId:node.id,kind:'node',path:'/nodes/'+i,nativeId:String(sid),nativeScope:'ppt/slides/slide1.xml'});
  }
  for(let i=0;i<edges.length;i++){
    const edge=edges[i]!,from=shapeIds.get(edge.from),to=shapeIds.get(edge.to);requirePpt(from!==undefined&&to!==undefined,'ENDPOINT','PowerPoint connector endpoint is not mapped');
    const source=nodeBoxes.get(edge.from)!,target=nodeBoxes.get(edge.to)!,sourceCenter=positions.get(edge.from)!,targetCenter=positions.get(edge.to)!;
    let fromPoint:{x:number;y:number;port:number},toPoint:{x:number;y:number;port:number};
    const dx=targetCenter.x-sourceCenter.x,dy=targetCenter.y-sourceCenter.y;
    if(Math.abs(dx)>=Math.abs(dy)){const forward=dx>=0;fromPoint={x:forward?source.x+source.cx:source.x,y:sourceCenter.y,port:forward?3:1};toPoint={x:forward?target.x:target.x+target.cx,y:targetCenter.y,port:forward?1:3};}
    else {const forward=dy>=0;fromPoint={x:sourceCenter.x,y:forward?source.y+source.cy:source.y,port:forward?2:0};toPoint={x:targetCenter.x,y:forward?target.y:target.y+target.cy,port:forward?0:2};}
    const eid=nextId++;items.push(connector(eid,nativeName('edge',edge.id),from,to,fromPoint,toPoint));
    mappings.push({logicalId:edge.id,kind:'edge',path:'/edges/'+i,nativeId:String(eid),nativeScope:'ppt/slides/slide1.xml'});
    if(edge.label!==undefined){const labelId=nextId++,labelWidth=1_350_000,labelHeight=300_000,labelX=Math.round((fromPoint.x+toPoint.x)/2-labelWidth/2),labelY=Math.round((fromPoint.y+toPoint.y)/2-labelHeight/2);items.push(shape(labelId,nativeName('edge-label',edge.id),edge.label,labelX,labelY,labelWidth,labelHeight,'edge-label'));mappings.push({logicalId:edge.id,kind:'edge',path:'/edges/'+i+'/label',nativeId:String(labelId),nativeScope:'ppt/slides/slide1.xml'});}
  }
  const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="'+DRAWING_NS+'" xmlns:r="'+OFFICE_REL+'" xmlns:p="'+PRESENTATION_NS+'"><p:cSld name="UMF visual network"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'+items.join('')+'</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  return {xml,shapeIds,mappings};
}
function lossesFor(document:Document,v:Visual):PowerPointLoss[] {
  const losses:PowerPointLoss[]=[];const lose=(path:string,message:string,family:'semantic'|'native'='semantic')=>losses.push({path,code:'RETAINED_ONLY',family,representation:'retained-only',message});
  const visualFields=new Set(['id','kind','form','title','question','nodes','edges']);
  const fields=Object.keys(v as unknown as Record<string,unknown>);
  for(const field of fields)if(!visualFields.has(field))lose('/extensions/'+VISUAL_EXTENSION+'/'+field,'PowerPoint profile does not encode this visual field as editable native meaning.');
  if(v.title===undefined)lose('/extensions/'+VISUAL_EXTENSION+'/title','A missing title is exported as an empty visible title slot; native edits cannot restore absence.');
  lose('/extensions/'+VISUAL_EXTENSION+'/id','Visual identity is kept in the source companion and is not an editable PowerPoint drawing property.');
  for(let i=0;i<(v.nodes??[]).length;i++){
    const node=v.nodes![i] as unknown as Record<string,unknown>;
    for(const key of Object.keys(node))if(!['id','label'].includes(key))lose('/extensions/'+VISUAL_EXTENSION+'/nodes/'+i+'/'+key,'PowerPoint node cards do not represent this node property.');
  }
  for(let i=0;i<(v.edges??[]).length;i++){
    const edge=v.edges![i] as unknown as Record<string,unknown>;
    for(const key of Object.keys(edge))if(!['id','from','to','label'].includes(key))lose('/extensions/'+VISUAL_EXTENSION+'/edges/'+i+'/'+key,'PowerPoint connectors do not represent this edge property.');
  }
  const docKeys=Object.keys(document.extensions??{}).filter(k=>k!==VISUAL_EXTENSION);
  for(const key of docKeys)lose('/extensions/'+key,'This extension remains in the embedded source only.');
  for(const [key]of Object.entries(document.vocabularies))if(key!==VISUAL_EXTENSION)lose('/vocabularies/'+key,'This vocabulary declaration remains in the embedded source only.');
  if((document.modules?.length??0)>0)lose('/modules','Module semantics remain in the embedded source only.');
  lose('/id','UMF document identity remains in the source companion and is not a PowerPoint drawing property.');
  lose('/umf','UMF envelope version remains in the source companion and is not a PowerPoint drawing property.');
  if((v.groups?.length??0)>0)lose('/extensions/'+VISUAL_EXTENSION+'/groups','Group membership is not encoded as native PowerPoint grouping in this profile.');
  return losses;
}
export function powerpointLosses(document:Document,v:Visual):PowerPointLoss[]{return lossesFor(document,v);}
function ensureSupported(document:Document,v:Visual):VisualVersion {
  const version=document.vocabularies[VISUAL_EXTENSION]?.version;
  requirePpt(version===VISUAL_VERSION||version===LATEST_VISUAL_VERSION,'MODEL_VERSION','Expected umf.visual model version 1.0.0 or 1.1.0');
  requirePpt(v.kind==='flow'&&v.form==='network','PROFILE_SCOPE','PowerPoint profile supports only flow/network.');
  requirePpt((v.nodes?.length??0)<=(version===VISUAL_VERSION?MODEL_LIMITS.nodes10:MODEL_LIMITS.nodes11),'RESOURCE_LIMIT','Node count exceeds the selected model-version profile limit.');
  requirePpt((v.edges?.length??0)<=MODEL_LIMITS.edges,'RESOURCE_LIMIT','Edge count exceeds the PowerPoint profile limit.');
  requirePpt((v.groups?.length??0)<=MODEL_LIMITS.groups,'RESOURCE_LIMIT','Group count exceeds the PowerPoint profile limit.');
  requirePpt(inspectVisual(document).complete,'INCOMPLETE','PowerPoint export requires a complete visual document.');
  for(const key of Object.keys(v as unknown as Record<string,unknown>)) if(typeof (v as unknown as Record<string,unknown>)[key]==='string')xmlSafe((v as unknown as Record<string,string>)[key]!, '/'+key);
  xmlSafe(v.question,'/question');for(const n of v.nodes??[])xmlSafe(n.label,'/nodes/'+n.id+'/label');for(const e of v.edges??[])xmlSafe(e.label??'','/edges/'+e.id+'/label');
  return version as VisualVersion;
}
export async function createFreshProfile(document:Document,bindingRevision=1,requestedResource?:HostResource):Promise<ExportedProfile> {
  const v=getVisual(document),modelVersion=ensureSupported(document,v),source=writeVisualDocument(document,'json'),sourceSha256=await sha256(source),losses=lossesFor(document,v);
  const resource=requestedResource??{host:'powerpoint' as const,documentId:'urn:umf:visual:'+sourceSha256,pageId:'slide1'};
  requirePpt(resource.host==='powerpoint'&&typeof resource.documentId==='string'&&resource.documentId.length>0&&resource.documentId.length<=4096&&(resource.pageId===undefined||resource.pageId.length<=4096),'RESOURCE','Invalid PowerPoint resource identity');
  const {xml,mappings}=slideXml(v);
  const sourcePayload={profile:PROFILE,source,sourceSha256,bindingRevision,modelVersion,visualId:v.id,resource};
  const custom='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><umf:binding xmlns:umf="'+PROFILE_NS+'" version="1" retention="source-only">'+escapeXmlText(JSON.stringify(sourcePayload))+'</umf:binding>';
  const parts=new Map<string,Uint8Array>(OPC_TEMPLATE_PARTS.map(([path,xml])=>[path,bytes(xml.trim().replace(/(<\?xml[^?]*\?>)\s+</,'$1<'))]));
  parts.set('ppt/slides/slide1.xml',bytes(xml));parts.set('customXml/item1.xml',bytes(custom));
  return {parts,source,sourceSha256,modelVersion,mappings,losses,bindingRevision,resource};
}
export interface NativeShape {element:XmlElement;nativeId:string;name:string;text:string;kind:'sp'|'cxnSp'|'other';}
export interface ReadProfile {parts:Map<string,Uint8Array>;slidePath:string;customPath:string;custom:ParsedXml;slide:ParsedXml;shapes:NativeShape[];source:string;sourceSha256:string;bindingRevision:number;modelVersion:VisualVersion;visualId:string;resource:HostResource;original:Document;}
const relTarget=(sourcePath:string,target:string):string=>{
  requirePpt(!target.includes('\\')&&!target.startsWith('/')&&!target.includes('?')&&!target.includes('#'),'RELATIONSHIP_PATH','Unsafe package relationship target');
  const path=sourcePath.slice(0,sourcePath.lastIndexOf('/')+1),segments=(path+target).split('/'),out:string[]=[];
  for(const segment of segments){if(segment===''||segment==='.')continue;if(segment==='..'){requirePpt(out.length>0,'RELATIONSHIP_PATH','Relationship escapes package root');out.pop();}else out.push(segment);}
  return out.join('/');
};
function relationships(xml:string,where:string):{id:string;type:string;target:string;mode?:string}[]{
  const parsed=parseXml(xml,where);requirePpt(parsed.root.uri===PACKAGE_REL&&parsed.root.local==='Relationships','RELATIONSHIP','Invalid relationships root: '+where);
  const seen=new Set<string>();return children(parsed.root,PACKAGE_REL,'Relationship').map(r=>{
    const id=attribute(r,'','Id')?.value,type=attribute(r,'','Type')?.value,target=attribute(r,'','Target')?.value,mode=attribute(r,'','TargetMode')?.value;
    requirePpt(!!id&&!!type&&!!target&&!seen.has(id),'RELATIONSHIP','Duplicate or incomplete relationship in '+where);seen.add(id!);
    requirePpt(mode===undefined||mode==='Internal','RELATIONSHIP_EXTERNAL','External package relationships are unsupported');
    return {id:id!,type:type!,target:target!,mode};
  });
}
function oneRelation(rels:{id:string;type:string;target:string}[],id:string,typeSuffix:string):string {
  const hits=rels.filter(r=>r.id===id&&r.type.endsWith('/'+typeSuffix));requirePpt(hits.length===1,'RELATIONSHIP','Missing, duplicate, or wrong-type relationship: '+id);return hits[0]!.target;
}
function nativeText(shape:XmlElement,required:boolean):string {
  const body=children(shape,PRESENTATION_NS,'txBody')[0];if(!body){requirePpt(!required,'SHAPE_TEXT','Mapped PowerPoint object has no text body');return '';}
  const paras=children(body,DRAWING_NS,'p'),result:string[]=[];
  try{for(const p of paras){let line='';for(const element of p.children){if(element.kind!=='element')continue;
      if(element.uri===DRAWING_NS&&element.local==='r')line+=textContent(child(element,DRAWING_NS,'t'));
      else if(element.uri===DRAWING_NS&&element.local==='fld')throw new PowerPointError('SHAPE_TEXT','Dynamic PowerPoint fields are outside the admitted plain-text profile');
      else if(element.uri===DRAWING_NS&&element.local==='br')line+='\n';
      else if(element.uri===DRAWING_NS&&['pPr','endParaRPr'].includes(element.local))continue;
      else throw new PowerPointError('SHAPE_TEXT','PowerPoint rich text exceeds the admitted plain-text profile');
    }result.push(line);}}
  catch(error){if(required)throw error;return '';}
  return result.join('\n');
}
function validateDirectedConnector(shape:XmlElement):void {
  const spPr=child(shape,PRESENTATION_NS,'spPr'),xfrm=child(spPr,DRAWING_NS,'xfrm'),off=child(xfrm,DRAWING_NS,'off'),ext=child(xfrm,DRAWING_NS,'ext');
  const number=(node:XmlElement,key:string)=>{const value=attribute(node,'',key)?.value;requirePpt(value&&/^(0|[1-9][0-9]*)$/.test(value),'CONNECTOR_GEOMETRY','Connector has invalid native geometry coordinates');return Number(value);};
  const x=number(off,'x'),y=number(off,'y'),cx=number(ext,'cx'),cy=number(ext,'cy');
  requirePpt(Number.isSafeInteger(x)&&Number.isSafeInteger(y)&&Number.isSafeInteger(cx)&&Number.isSafeInteger(cy)&&cx+cy>0,'CONNECTOR_GEOMETRY','Directed connector must have a nonzero native drawing extent');
  const flipH=attribute(xfrm,'','flipH')?.value,flipV=attribute(xfrm,'','flipV')?.value;
  requirePpt((flipH===undefined||flipH==='0'||flipH==='1')&&(flipV===undefined||flipV==='0'||flipV==='1'),'CONNECTOR_GEOMETRY','Connector has unsupported endpoint orientation flags');
  const geometry=child(spPr,DRAWING_NS,'prstGeom');requirePpt(attribute(geometry,'','prst')?.value==='line','CONNECTOR_GEOMETRY','Qualified directed connector must use native straight-line geometry');
  const line=child(spPr,DRAWING_NS,'ln'),head=children(line,DRAWING_NS,'headEnd'),tail=children(line,DRAWING_NS,'tailEnd');
  requirePpt(head.length===1&&attribute(head[0]!,'','type')?.value==='none'&&tail.length===1&&attribute(tail[0]!,'','type')?.value==='triangle','CONNECTOR_DIRECTION','Qualified connector must have one target arrowhead and no source arrowhead');
  const nv=child(shape,PRESENTATION_NS,'nvCxnSpPr'),props=child(nv,PRESENTATION_NS,'cNvCxnSpPr'),start=child(props,DRAWING_NS,'stCxn'),end=child(props,DRAWING_NS,'endCxn');
  for(const connection of [start,end]){const id=attribute(connection,'','id')?.value,idx=attribute(connection,'','idx')?.value;requirePpt(id&&/^[1-9][0-9]*$/.test(id)&&idx&&/^[0-3]$/.test(idx),'CONNECTOR_ENDPOINT','Qualified connector requires explicit attached-shape identities and rectangle ports');}
}
function descendants(root:XmlElement,uri:string,local:string):XmlElement[]{
  const result:XmlElement[]=[];for(const c of root.children)if(c.kind==='element'){if(c.uri===uri&&c.local===local)result.push(c);result.push(...descendants(c,uri,local));}return result;
}
export function loadProfileParts(parts:Map<string,Uint8Array>):ReadProfile {
  const contentTypes=parseXml(textPart(parts,'[Content_Types].xml'),'[Content_Types].xml');
  requirePpt(contentTypes.root.uri==='http://schemas.openxmlformats.org/package/2006/content-types'&&contentTypes.root.local==='Types','CONTENT_TYPES','Missing or invalid OOXML content-type manifest');
  preflightRelationships(parts);
  const rootRel=relationships(textPart(parts,'_rels/.rels'),'_rels/.rels');
  const office=rootRel.filter(r=>r.type.endsWith('/officeDocument'));requirePpt(office.length===1,'PRESENTATION_COUNT','Package must contain one office presentation relationship');
  const presentationPath=relTarget('',office[0]!.target),presentation=parseXml(textPart(parts,presentationPath),presentationPath);
  requirePpt(presentation.root.uri===PRESENTATION_NS&&presentation.root.local==='presentation','PRESENTATION','Invalid presentation root');
  const presentationRels=relationships(textPart(parts,relPart(presentationPath)),relPart(presentationPath));
  const sldList=children(presentation.root,PRESENTATION_NS,'sldIdLst');requirePpt(sldList.length===1,'SLIDE_SCOPE','Presentation has no unique slide list');
  const slideIds=children(sldList[0]!,PRESENTATION_NS,'sldId');requirePpt(slideIds.length===1,'SLIDE_SCOPE','PowerPoint profile requires exactly one slide');
  const rid=attribute(slideIds[0]!,'http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')?.value;requirePpt(rid,'SLIDE_SCOPE','Slide has no relationship ID');
  const slidePath=relTarget(presentationPath,oneRelation(presentationRels,rid!,'slide'));
  const slideRels=relationships(textPart(parts,relPart(slidePath)),relPart(slidePath));
  requirePpt(slideRels.some(r=>r.type.endsWith('/slideLayout')),'SLIDE_LAYOUT','Slide layout relationship is missing');
  const customRels=presentationRels.filter(r=>r.type.endsWith('/customXml'));requirePpt(customRels.length===1,'SOURCE_SIDECAR','Expected one UMF source companion relationship');
  const customPath=relTarget(presentationPath,customRels[0]!.target),custom=parseXml(textPart(parts,customPath),customPath);
  requirePpt(custom.root.uri===PROFILE_NS&&custom.root.local==='binding'&&attribute(custom.root,'','retention')?.value==='source-only','SOURCE_SIDECAR','Invalid or unqualified PowerPoint source companion');
  let payload:any;try{payload=JSON.parse(textContent(custom.root));}catch{throw new PowerPointError('SOURCE_SIDECAR','PowerPoint source companion is invalid JSON');}
  requirePpt(payload&&payload.profile===PROFILE&&typeof payload.source==='string'&&typeof payload.sourceSha256==='string'&&/^[a-f0-9]{64}$/.test(payload.sourceSha256)&&payload.resource?.host==='powerpoint'&&typeof payload.resource.documentId==='string'&&(payload.resource.pageId===undefined||typeof payload.resource.pageId==='string'),'SOURCE_SIDECAR','Incomplete PowerPoint source companion');
  requirePpt(Object.keys(payload).sort().join(',')==='bindingRevision,modelVersion,profile,resource,source,sourceSha256,visualId','SOURCE_SIDECAR','Unknown or missing PowerPoint source companion fields');
  requirePpt(Object.keys(payload.resource).sort().join(',')===(payload.resource.pageId===undefined?'documentId,host':'documentId,host,pageId'),'SOURCE_SIDECAR','Unknown PowerPoint resource identity fields');
  return loadSlide(parts,slidePath,customPath,custom,payload);
}
function relPart(path:string):string {const slash=path.lastIndexOf('/');return path.slice(0,slash+1)+'_rels/'+path.slice(slash+1)+'.rels';}
function textPart(parts:Map<string,Uint8Array>,path:string):string {const data=parts.get(path);requirePpt(data,'PACKAGE_PART','Required OOXML package part is missing: '+path);try{return new TextDecoder('utf-8',{fatal:true}).decode(data!);}catch{throw new PowerPointError('PACKAGE_ENCODING','Package part is not valid UTF-8: '+path);}}
function sourceFromRels(path:string):string {
  if(path==='_rels/.rels')return '';
  const marker='/_rels/';const i=path.lastIndexOf(marker);requirePpt(i>=0&&path.endsWith('.rels'),'RELATIONSHIP_PATH','Malformed relationship part path');
  return path.slice(0,i+1)+path.slice(i+marker.length,-5);
}
function preflightRelationships(parts:Map<string,Uint8Array>):void {
  for(const path of parts.keys())if(path.endsWith('.rels')){
    const source=sourceFromRels(path),rels=relationships(textPart(parts,path),path);
    for(const relation of rels){const target=relTarget(source,relation.target);requirePpt(parts.has(target),'RELATIONSHIP_TARGET','Relationship target is missing: '+target);}
  }
}
function loadSlide(parts:Map<string,Uint8Array>,slidePath:string,customPath:string,custom:ParsedXml,payload:any):ReadProfile {
  requirePpt(sha256SyncUnavailable(payload.sourceSha256),'SOURCE_SIDECAR','Bad source digest');
  requirePpt(payload.modelVersion===VISUAL_VERSION||payload.modelVersion===LATEST_VISUAL_VERSION,'MODEL_VERSION','Unsupported PowerPoint companion model version');
  requirePpt(Number.isSafeInteger(payload.bindingRevision)&&payload.bindingRevision>=1,'BINDING_REVISION','Invalid PowerPoint binding revision');
  const originalSource=payload.source;const slide=parseXml(textPart(parts,slidePath),slidePath);
  requirePpt(slide.root.uri===PRESENTATION_NS&&slide.root.local==='sld','SLIDE','Invalid slide root');
  const cSld=child(slide.root,PRESENTATION_NS,'cSld'),tree=child(cSld,PRESENTATION_NS,'spTree');
  const shapes:NativeShape[]=[];const ids=new Set<string>(['1']),names=new Set<string>();
  for(const element of tree.children){if(element.kind!=='element')continue;
    if(element.uri===PRESENTATION_NS&&['nvGrpSpPr','grpSpPr','extLst'].includes(element.local))continue;
    requirePpt(element.uri===PRESENTATION_NS&&['sp','cxnSp','pic','grpSp','graphicFrame'].includes(element.local),'UNSUPPORTED_SHAPE','Slide contains an unsupported or unqualified shape-tree object');
    const kind:NativeShape['kind']=element.local==='sp'||element.local==='cxnSp'?element.local:'other';
    const nvName=element.local==='sp'?'nvSpPr':element.local==='cxnSp'?'nvCxnSpPr':element.local==='pic'?'nvPicPr':element.local==='grpSp'?'nvGrpSpPr':'nvGraphicFramePr';
    const nv=child(element,PRESENTATION_NS,nvName),cNvPr=child(nv,PRESENTATION_NS,'cNvPr');
    const id=attribute(cNvPr,'','id')?.value,name=attribute(cNvPr,'','name')?.value;
    requirePpt(id&&name,'IDENTITY','PowerPoint native object lacks its cNvPr ID/name');
    for(const identity of descendants(element,PRESENTATION_NS,'cNvPr')){
      const innerId=attribute(identity,'','id')?.value,innerName=attribute(identity,'','name')?.value;
      requirePpt(innerId&&innerName&&!ids.has(innerId)&&!names.has(innerName),'DUPLICATE_IDENTITY','PowerPoint shapes have missing or duplicate IDs/names');ids.add(innerId!);names.add(innerName!);
    }
    const recognized=parseNativeName(name!);if(recognized?.kind==='edge')validateDirectedConnector(element);
    shapes.push({element,nativeId:id!,name:name!,text:kind==='other'?'':nativeText(element,!!recognized&&recognized.kind!=='edge'),kind});
  }
  // Digest is checked asynchronously by the public import operation before edits are exposed.
  let original:Document;try{original=JSON.parse(originalSource) as Document;}catch{throw new PowerPointError('SOURCE_SIDECAR','Embedded UMF source is invalid JSON');}
  const visual=original.extensions?.[VISUAL_EXTENSION] as unknown as Visual|undefined;
  requirePpt(visual&&visual.id===payload.visualId&&visual.kind==='flow'&&visual.form==='network','SOURCE_SIDECAR','Embedded source does not match this native profile');
  requirePpt(original.vocabularies?.[VISUAL_EXTENSION]?.version===payload.modelVersion,'SOURCE_SIDECAR','Embedded source model version disagrees with profile');
  for(const edge of visual.edges??[]){
    const connectorShape=shapes.find(item=>item.name===nativeName('edge',edge.id)),labelShape=shapes.find(item=>item.name===nativeName('edge-label',edge.id));
    requirePpt(connectorShape&&connectorShape.text===''&&children(connectorShape.element,PRESENTATION_NS,'txBody').length===0,'CONNECTOR_LABEL_LOCATION','Qualified connectors must not carry text bodies; labels use separate editable text shapes.');
    requirePpt(edge.label===undefined?!labelShape:!!labelShape&&labelShape.kind==='sp','CONNECTOR_LABEL_LOSS','PowerPoint native edge-label text shape does not match source label presence.');
  }
  return {parts,slidePath,customPath,custom,slide,shapes,source:originalSource,sourceSha256:payload.sourceSha256,bindingRevision:payload.bindingRevision,modelVersion:payload.modelVersion,visualId:payload.visualId,resource:payload.resource,original};
}
function sha256SyncUnavailable(value:string):boolean{return /^[a-f0-9]{64}$/.test(value);}
