// SPDX-License-Identifier: MIT OR Apache-2.0
import {SaxesParser, type SaxesTagNS} from 'saxes';
import {PowerPointError, requirePpt} from './errors.js';

export const XML_LIMITS=Object.freeze({bytes:16*1024*1024,depth:64,elements:100_000,attributes:128,text:16*1024*1024});
export interface XmlAttribute {name:string;local:string;uri:string;value:string;}
export interface XmlText {kind:'text';value:string;start:number;end:number;parent?:XmlElement;}
export interface XmlElement {kind:'element';name:string;local:string;uri:string;attributes:XmlAttribute[];children:(XmlElement|XmlText)[];start:number;openEnd:number;closeStart:number;end:number;parent?:XmlElement;}
export type XmlNode=XmlElement|XmlText;
export interface ParsedXml {source:string;root:XmlElement;elements:number;textBytes:number;}

export function parseXml(source:string,partName='XML part'):ParsedXml {
  requirePpt(new TextEncoder().encode(source).length<=XML_LIMITS.bytes,'XML_LIMIT','XML part exceeds the byte bound: '+partName);
  requirePpt(!source.includes('<!DOCTYPE')&&!source.includes('<!doctype'),'XML_DTD','DOCTYPE and custom entities are prohibited: '+partName);
  const parser=new SaxesParser({xmlns:true,position:true});
  const stack:XmlElement[]=[];let root:XmlElement|undefined,elementCount=0,textBytes=0;
  let pendingStart=0;
  parser.on('doctype',()=>{throw new PowerPointError('XML_DTD','DOCTYPE is prohibited: '+partName);});
  parser.on('error',error=>{throw new PowerPointError('XML_PARSE','Malformed XML in '+partName+': '+error.message);});
  parser.on('opentagstart',tag=>{
    pendingStart=parser.position-tag.name.length-2;
    requirePpt(pendingStart>=0&&stack.length<XML_LIMITS.depth,'XML_LIMIT','XML depth exceeds the bound: '+partName);
  });
  parser.on('opentag',(tag:SaxesTagNS)=>{
    requirePpt(++elementCount<=XML_LIMITS.elements,'XML_LIMIT','XML element count exceeds the bound: '+partName);
    const attrs=Object.entries(tag.attributes).map(([name,attr])=>({name,local:attr.local,uri:attr.uri,value:attr.value}));
    requirePpt(attrs.length<=XML_LIMITS.attributes,'XML_LIMIT','XML attribute count exceeds the bound: '+partName);
    const node:XmlElement={kind:'element',name:tag.name,local:tag.local,uri:tag.uri,attributes:attrs,children:[],start:pendingStart,openEnd:parser.position,closeStart:-1,end:-1,parent:stack.at(-1)};
    if(node.parent)node.parent.children.push(node);else{requirePpt(!root,'XML_ROOT','XML part has multiple document elements: '+partName);root=node;}
    if(!tag.isSelfClosing)stack.push(node);else{node.closeStart=node.openEnd;node.end=node.openEnd;}
  });
  parser.on('text',value=>{
    textBytes+=new TextEncoder().encode(value).length;
    requirePpt(textBytes<=XML_LIMITS.text,'XML_LIMIT','XML text exceeds the bound: '+partName);
    if(value.length===0)return;
    const parent=stack.at(-1);
    if(!parent){requirePpt(/^\s*$/.test(value),'XML_TEXT','Text outside the document element: '+partName);return;}
    const end=parser.position,start=end-value.length;
    const node:XmlText={kind:'text',value,start,end,parent};parent.children.push(node);
  });
  parser.on('cdata',value=>{
    textBytes+=new TextEncoder().encode(value).length;
    requirePpt(textBytes<=XML_LIMITS.text,'XML_LIMIT','XML text exceeds the bound: '+partName);
    const parent=stack.at(-1);requirePpt(parent,'XML_TEXT','CDATA outside the document element: '+partName);
    const end=parser.position;const node:XmlText={kind:'text',value,start:end-value.length-12,end,parent};parent.children.push(node);
  });
  parser.on('closetag',tag=>{
    if(tag.isSelfClosing)return;
    const node=stack.pop();requirePpt(node&&node.name===tag.name,'XML_PARSE','Mismatched XML element in '+partName);
    node.end=parser.position;
    node.closeStart=source.lastIndexOf('</',node.end-1);
    requirePpt(node.closeStart>=node.openEnd&&source.slice(node.closeStart,node.end).startsWith('</'+tag.name),'XML_PARSE','Invalid XML closing tag span in '+partName);
    requirePpt(/^\s*>$/.test(source.slice(node.closeStart+2+tag.name.length,node.end)),'XML_PARSE','Invalid XML closing tag whitespace in '+partName);
    requirePpt(node.closeStart>=node.openEnd,'XML_PARSE','Invalid XML element bounds in '+partName);
  });
  try{parser.write(source).close();}catch(error){if(error instanceof PowerPointError)throw error;throw new PowerPointError('XML_PARSE','XML parser rejected '+partName);}
  requirePpt(root&&stack.length===0,'XML_ROOT','XML document has no complete root element: '+partName);
  return {source,root,elements:elementCount,textBytes};
}
export function children(node:XmlElement,uri:string,local:string):XmlElement[]{return node.children.filter((child):child is XmlElement=>child.kind==='element'&&child.uri===uri&&child.local===local);}
export function child(node:XmlElement,uri:string,local:string):XmlElement {
  const found=children(node,uri,local);requirePpt(found.length===1,'XML_SHAPE','Expected exactly one {'+uri+'}'+local);return found[0]!;
}
export function attribute(node:XmlElement,uri:string,local:string):XmlAttribute|undefined{return node.attributes.find(a=>a.uri===uri&&a.local===local);}
export function textContent(node:XmlElement):string{return node.children.map(child=>child.kind==='text'?child.value:textContent(child)).join('');}
export function replaceInner(parsed:ParsedXml,node:XmlElement,value:string):string {
  requirePpt(node.start>=0&&node.closeStart>=node.openEnd&&node.end<=parsed.source.length,'XML_PATCH','Invalid XML text span');
  return parsed.source.slice(0,node.openEnd)+escapeXmlText(value)+parsed.source.slice(node.closeStart);
}
export function replaceRanges(source:string,replacements:{start:number;end:number;text:string}[]):string {
  const sorted=[...replacements].sort((a,b)=>b.start-a.start);let last=source.length;
  for(const item of sorted){requirePpt(item.start>=0&&item.end>=item.start&&item.end<=last,'XML_PATCH','Overlapping or invalid XML patch spans');source=source.slice(0,item.start)+item.text+source.slice(item.end);last=item.start;}
  return source;
}
export function escapeXmlText(value:string):string{return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\r','&#xD;');}
export function escapeXmlAttribute(value:string):string{return escapeXmlText(value).replaceAll('"','&quot;').replaceAll("'",'&apos;');}
