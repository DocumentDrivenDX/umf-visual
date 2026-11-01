// SPDX-License-Identifier: MIT OR Apache-2.0
/** Independently ties full-scene native records and connections to SVG objects. */
import type {Document} from '@umf/core';
import type {Page} from 'playwright';
import type {InterchangeFormat} from '../src/interchange/types';
import {decodeAnnotationValue} from '../src/interchange/annotations';
import {dotFullAdapter} from '../src/interchange/dot/full';
import {liniFullAdapter} from '../src/interchange/lini/full';
import {mermaidFullAdapter} from '../src/interchange/mermaid/full';
import {compileFullScene} from '../src/interchange/full/scene';
import {recoverFullRecords} from '../src/interchange/full/records';
import type {FullEdge,FullGroup,FullNode,FullRecord,FullScene} from '../src/interchange/full/types';
import {readNativeFirstSource} from '../src/interchange/full/native-first';
import type {IdentityMapping} from '../src/interchange/types';

export interface FullNativeWitness {
 primaryCarriers:number;
 connections:number;
 groups:number;
 directedConnections:number;
 undirectedConnections:number;
 endpointAssociations:number;
 sourceEndpointLocators:number;
 normalization:'whitespace-collapse-v1';
}

export interface NativeFirstWitness {
 tier:'native-profile';
 sourceProfile:string;
 sourceMappingVersion:string;
 primaryCarriers:number;
 connections:number;
 endpointAssociations:number;
 nativeIdsChecked:number;
 annotatedCarriers:number;
 endpointWitnessScope:'mapped-flow-and-sequence-endpoints-v1; DOT entity reference and port endpoint geometry excluded';
 svgNormalization:'whitespace-collapse-v1';
}

type ExpectedCarrier={kind:'node'|'group';logicalId:string;nativeId:string;label:string;prefix:string;path:string;bound:boolean};
type ExpectedConnection={logicalId:string;nativeId:string;fromNativeId:string;toNativeId:string;fromLocator:string;toLocator:string;label:string;hasLabel:boolean;directed:boolean;path:string;pairOccurrence:number};
const adapters={dot:dotFullAdapter,mermaid:mermaidFullAdapter,lini:liniFullAdapter} as const;
const canonical=(value:unknown)=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const normalize=(value:string)=>value.replace(/\s+/gu,' ').trim();
const pointerValue=(value:unknown,path:string):unknown=>{
 if(!path.startsWith('/'))return undefined;
 let current=value;for(const part of path.slice(1).split('/').map(segment=>segment.replace(/~1/g,'/').replace(/~0/g,'~'))){
  if(current===null||typeof current!=='object')return undefined;
  current=(current as Record<string,unknown>)[part];
 }return current;
};
const primaryText=(document:Document,mapping:IdentityMapping):string[]=>{
 const leaf=mapping.path.split('/').at(-1)??'';if(!['label','name','title','value','type','text','id'].includes(leaf))return [];
 const value=pointerValue(document,mapping.path);if(typeof value==='string'&&!mapping.path.endsWith('/id'))return value?[value]:[];
 const parentPath=mapping.path.replace(/\/[^/]+$/,'');const parent=value&&typeof value==='object'&&!Array.isArray(value)?value:pointerValue(document,parentPath);
 if(!parent||typeof parent!=='object'||Array.isArray(parent))return [];
 const row=parent as Record<string,unknown>;
 return ['label','name','title','value','type','detail'].flatMap(key=>typeof row[key]==='string'&&row[key]? [row[key] as string]:[]);
};
const hexBytes=(value:string)=>Array.from(new TextEncoder().encode(value),byte=>byte.toString(16).padStart(2,'0')).join('');
const mermaidToken=(prefix:string,value:string)=>prefix+'_'+Array.from({length:value.length},(_,index)=>value.charCodeAt(index).toString(16).padStart(4,'0')).join('');
const liniIdEncode=(value:string)=>'x'+Array.from(new TextEncoder().encode(value),byte=>byte.toString(16).padStart(2,'0')).join('')+'00';
const liniTag=(prefix:string,id:string,metadata:unknown)=>prefix+liniIdEncode(id)+'z'+hexBytes(JSON.stringify(metadata));
const recordText=(record:FullRecord):string=>{const value=decodeAnnotationValue(record.type,record.value);return value.kind==='string'?value.value:record.value;};
const getRecord=(scene:FullScene,id:string|undefined)=>id===undefined?undefined:scene.records.find(record=>record.id===id);
const primaryLabel=(record:FullRecord|undefined,text:string|undefined,fallback:string):string=>record?recordText(record):text??fallback;

function locator(scene:FullScene,recordId:string|undefined,slot:'label'|'from'|'to',description:string):string|undefined {
 if(!recordId)return;
 const entries=scene.locators?.[recordId];
 if(!entries||entries.length!==1||entries[0]!.slot!==slot)throw new Error(`${description} has no unique native ${slot} locator`);
 return entries[0]!.id;
}

function liniNodeMetadata(node:FullNode,scene:FullScene):Record<string,unknown>{
 const record=getRecord(scene,node.recordId),identity=getRecord(scene,node.identityRecordId);
 return {hasText:node.text!==undefined,...(record?{record:{path:record.path,type:record.type}}:{}),...(identity?{identityPath:identity.path}:{})};
}
function liniGroupMetadata(group:FullGroup,scene:FullScene):Record<string,unknown>{
 const record=getRecord(scene,group.recordId);
 return {hasText:group.text!==undefined,...(record?{record:{path:record.path,type:record.type}}:{})};
}
function liniElementAddress(scene:FullScene,node:FullNode):string {
 const ancestry:string[]=[];let parent=node.group;
 while(parent){const group=scene.groups.find(item=>item.id===parent);if(!group)throw new Error(`Missing Lini group ${parent}`);ancestry.unshift(liniTag('g',group.id,liniGroupMetadata(group,scene)));parent=group.parent;}
 return ['umf_full_scene',...ancestry,liniTag('n',node.id,liniNodeMetadata(node,scene))].join('.');
}
function liniLocatorPath(scene:FullScene,kind:'node'|'group',logicalId:string):string {
 const ancestors:string[]=[];let parent=kind==='node'?scene.nodes.find(item=>item.id===logicalId)?.group:scene.groups.find(item=>item.id===logicalId)?.parent;
 while(parent){const group=scene.groups.find(item=>item.id===parent);if(!group)throw new Error(`Missing Lini group ${parent}`);ancestors.unshift(`group#${liniTag('g',group.id,liniGroupMetadata(group,scene))}`);parent=group.parent;}
 const nativeId=kind==='node'?liniTag('n',logicalId,liniNodeMetadata(scene.nodes.find(item=>item.id===logicalId)!,scene)):liniTag('g',logicalId,liniGroupMetadata(scene.groups.find(item=>item.id===logicalId)!,scene));
 return ['umf_full_scene',...ancestors,`${kind==='node'?'block':'group'}#${nativeId}`].join('/');
}

function deriveExpectations(scene:FullScene,expectedScene:FullScene):{carriers:ExpectedCarrier[];connections:ExpectedConnection[];primaryCarriers:number;endpointAssociations:number}{
 const actualById=new Map(scene.records.map(record=>[record.id,record])),expectedById=new Map(expectedScene.records.map(record=>[record.id,record]));
 const expectedNodes=new Map(expectedScene.nodes.map(node=>[node.id,node])),expectedGroups=new Map(expectedScene.groups.map(group=>[group.id,group])),expectedEdges=new Map(expectedScene.edges.map(edge=>[edge.id,edge]));
 if(scene.nodes.length!==expectedNodes.size||scene.groups.length!==expectedGroups.size||scene.edges.length!==expectedEdges.size)throw new Error('Native reader item counts differ from the source visual.');
 const carrierList:ExpectedCarrier[]=[];let primaryCarriers=0;
 for(const node of scene.nodes){
  const expected=expectedNodes.get(node.id);if(!expected||node.recordId!==expected.recordId||node.identityRecordId!==expected.identityRecordId||node.group!==expected.group||node.shape!==expected.shape||node.text!==expected.text||node.width!==expected.width)throw new Error(`Native node identity or visible text differs from source: ${node.id}`);
  const record=getRecord(scene,node.recordId),expectedRecord=getRecord(expectedScene,expected.recordId);
  if(record&&(!expectedRecord||record.path!==expectedRecord.path||record.type!==expectedRecord.type||record.value!==expectedRecord.value))throw new Error(`Native node primary value differs from source at ${record.path}`);
  if(node.recordId)primaryCarriers++;
  const boundLocator=locator(scene,node.recordId,'label',`Node ${node.id}`);
  const nativeId=scene.format==='dot'?'umf_full_node_'+hexBytes(node.id):scene.format==='mermaid'?mermaidToken('n',node.id):boundLocator?.split('/block#').at(-1)??liniTag('n',node.id,liniNodeMetadata(node,scene));
  if(boundLocator!==undefined&&(scene.format==='lini'?boundLocator!==liniLocatorPath(scene,'node',node.id):boundLocator!==nativeId))throw new Error(`Node record locator does not address the native object at ${record!.path}`);
  const widthPrefix=(scene.format==='mermaid'||scene.format==='lini')&&node.width!==undefined?'▮'.repeat(Math.max(0,Math.round(node.width/36)))+' | ':'';
  carrierList.push({kind:'node',logicalId:node.id,nativeId,label:primaryLabel(record,node.text,node.id),prefix:widthPrefix,path:record?.path??node.id,bound:record!==undefined});
 }
 for(const group of scene.groups){
  const expected=expectedGroups.get(group.id);if(!expected||group.recordId!==expected.recordId||group.parent!==expected.parent||group.text!==expected.text)throw new Error(`Native group identity, parent, or visible text differs from source: ${group.id}`);
  const record=getRecord(scene,group.recordId),expectedRecord=getRecord(expectedScene,expected.recordId);
  if(record&&(!expectedRecord||record.path!==expectedRecord.path||record.type!==expectedRecord.type||record.value!==expectedRecord.value))throw new Error(`Native group primary value differs from source at ${record.path}`);
  if(group.recordId)primaryCarriers++;
  const boundLocator=locator(scene,group.recordId,'label',`Group ${group.id}`);
  const nativeId=scene.format==='dot'?'cluster_umf_full_group_'+hexBytes(group.id):scene.format==='mermaid'?mermaidToken('g',group.id):boundLocator?.split('/group#').at(-1)??liniTag('g',group.id,liniGroupMetadata(group,scene));
  if(boundLocator!==undefined&&(scene.format==='lini'?boundLocator!==liniLocatorPath(scene,'group',group.id):boundLocator!==nativeId))throw new Error(`Group record locator does not address the native object at ${record!.path}`);
  carrierList.push({kind:'group',logicalId:group.id,nativeId,label:primaryLabel(record,group.text,group.id),prefix:'',path:record?.path??group.id,bound:record!==undefined});
 }
 const nativeNodeIds=new Map(scene.nodes.map(node=>[node.id,carrierList.find(carrier=>carrier.kind==='node'&&carrier.logicalId===node.id)!.nativeId]));
 const pairOccurrences=new Map<string,number>(),edgeOccurrences=new Map<string,number>(),connectionList:ExpectedConnection[]=[];let endpointAssociations=0;
 for(let index=0;index<scene.edges.length;index++){
  const edge=scene.edges[index]!,expected=expectedEdges.get(edge.id);if(!expected||edge.from!==expected.from||edge.to!==expected.to||(edge.directed??true)!==(expected.directed??true)||edge.recordId!==expected.recordId||edge.fromRecordId!==expected.fromRecordId||edge.toRecordId!==expected.toRecordId||edge.text!==expected.text)throw new Error(`Native edge identity, endpoints, or visible text differ from source: ${edge.id}`);
  const record=getRecord(scene,edge.recordId),expectedRecord=getRecord(expectedScene,expected.recordId);
  if(record&&(!expectedRecord||record.path!==expectedRecord.path||record.type!==expectedRecord.type||record.value!==expectedRecord.value))throw new Error(`Native edge primary value differs from source at ${record.path}`);
  if(edge.recordId)primaryCarriers++;
  const fromNativeId=nativeNodeIds.get(edge.from),toNativeId=nativeNodeIds.get(edge.to);if(!fromNativeId||!toNativeId)throw new Error(`Native edge endpoint is missing: ${edge.id}`);
  const fromLocator=scene.format==='lini'?liniElementAddress(scene,scene.nodes.find(node=>node.id===edge.from)!):fromNativeId;
  const toLocator=scene.format==='lini'?liniElementAddress(scene,scene.nodes.find(node=>node.id===edge.to)!):toNativeId;
  for(const [slot,recordId,expectedLocator]of [['from',edge.fromRecordId,scene.format==='dot'?'umf_full_edge_'+hexBytes(edge.id):scene.format==='mermaid'?`${mermaidToken('n',edge.from)}|${edge.directed===false?'---':'-->'}|${mermaidToken('n',edge.to)}#${(edgeOccurrences.get(`${edge.from}|${edge.directed===false?'---':'-->'}|${edge.to}`)??0)+1}`:`umf_full_scene/link[${index}]`],['to',edge.toRecordId,scene.format==='dot'?'umf_full_edge_'+hexBytes(edge.id):scene.format==='mermaid'?`${mermaidToken('n',edge.from)}|${edge.directed===false?'---':'-->'}|${mermaidToken('n',edge.to)}#${(edgeOccurrences.get(`${edge.from}|${edge.directed===false?'---':'-->'}|${edge.to}`)??0)+1}`:`umf_full_scene/link[${index}]`]] as const){
   const nativeLocator=locator(scene,recordId,slot,`Edge ${edge.id}`);if(nativeLocator!==undefined&&nativeLocator!==expectedLocator)throw new Error(`Edge ${slot} record locator does not resolve to native edge ${edge.id}`);if(nativeLocator)endpointAssociations++;
  }
  const recordLocator=locator(scene,edge.recordId,'label',`Edge ${edge.id}`);
  let nativeId:string,pairOccurrence=0;
  if(scene.format==='dot')nativeId='umf_full_edge_'+hexBytes(edge.id);
  else if(scene.format==='mermaid'){
   const key=`${edge.from}|${edge.directed===false?'---':'-->'}|${edge.to}`,occurrence=(edgeOccurrences.get(key)??0)+1;edgeOccurrences.set(key,occurrence);
   const pair=`${edge.from}|${edge.to}`;pairOccurrence=pairOccurrences.get(pair)??0;pairOccurrences.set(pair,pairOccurrence+1);nativeId=`L_${mermaidToken('n',edge.from)}_${mermaidToken('n',edge.to)}_${pairOccurrence}`;
   const expectedLocator=`${mermaidToken('n',edge.from)}|${edge.directed===false?'---':'-->'}|${mermaidToken('n',edge.to)}#${occurrence}`;
   if(recordLocator!==undefined&&recordLocator!==expectedLocator)throw new Error(`Mermaid edge record locator does not address edge ${edge.id}`);
  }else nativeId=`umf_full_scene/link[${index}]`;
  if(recordLocator!==undefined&&scene.format!=='mermaid'&&recordLocator!==nativeId)throw new Error(`Edge label locator does not address native edge ${edge.id}`);
  connectionList.push({logicalId:edge.id,nativeId,fromNativeId,toNativeId,fromLocator,toLocator,label:primaryLabel(record,edge.text,''),hasLabel:record!==undefined||edge.text!==undefined,directed:edge.directed!==false,path:record?.path??edge.id,pairOccurrence});
 }
 return{carriers:carrierList,connections:connectionList,primaryCarriers,endpointAssociations};
}

/**
 * Verify every scene primitive and label against the specific native SVG object
 * identified by that format's independent full-profile reader. Whitespace
 * collapse is the only permitted display comparison normalization.
 */
export async function verifyFullNativeWitness(page:Page,source:string,svg:string,sourceDocument:Document,format:InterchangeFormat):Promise<FullNativeWitness>{
 const adapter=adapters[format as keyof typeof adapters];if(!adapter)throw new TypeError(`Unsupported full native witness format: ${format}`);
 const nativeScene=adapter.read(source),sourceScene=compileFullScene(sourceDocument,format);
 if(canonical(recoverFullRecords(nativeScene.records))!==canonical(sourceDocument))throw new Error('Native profile records do not recover the witnessed source document.');
 const expected=deriveExpectations(nativeScene,sourceScene);
 const observed=await page.evaluate(({svg,format,carriers,connections})=>{
  const normalizeText=(value:string)=>value.replace(/\s+/gu,' ').trim();
  const parser=new DOMParser(),parsed=parser.parseFromString(svg,'image/svg+xml');if(parsed.querySelector('parsererror'))throw new Error('Native renderer produced invalid SVG XML');
  const root=parsed.documentElement;if(root.localName!=='svg')throw new Error('Native output root is not SVG');
  const live=window.document.importNode(root,true) as unknown as SVGSVGElement;live.style.position='absolute';live.style.left='-100000px';live.style.top='0';live.style.visibility='hidden';live.style.overflow='visible';window.document.body.replaceChildren(live);
  const directText=(element:Element,selector:string)=>Array.from(element.querySelectorAll(selector)).map(item=>item.textContent??'').join(' ');
  const title=(element:Element)=>element.querySelector(':scope > title')?.textContent??'';
  const carrierElement=(kind:'node'|'group',nativeId:string):Element|undefined=>{
   if(format==='dot')return Array.from(live.querySelectorAll(kind==='node'?'g.node':'g.cluster')).find(element=>title(element)===nativeId);
   if(format==='mermaid'){
    const selector=kind==='node'?'g.node':'g.cluster';const expectedId=kind==='node'?`flowchart-${nativeId}-`:`-${nativeId}`;
    return Array.from(live.querySelectorAll(selector)).find(element=>kind==='node'?element.id.includes(expectedId):element.id.endsWith(nativeId)||element.id.includes(expectedId));
   }
   return Array.from(live.querySelectorAll('g.lini-node')).find(element=>element.getAttribute('data-id')===nativeId);
  };
  const ownLabel=(element:Element,kind:'node'|'group',expected:string)=>{
   if(format==='dot'){
    const rows=Array.from(element.querySelectorAll(':scope > text')).map(item=>item.textContent??'');
    for(let count=1;count<=rows.length;count++){const candidate=rows.slice(0,count).join(' ');if(normalizeText(candidate)===normalizeText(expected))return candidate;}
    return rows.join(' ');
   }
   if(format==='mermaid')return kind==='node'?directText(element,'.nodeLabel'):directText(element,'.cluster-label');
   if(kind==='node')return directText(element,':scope > text.lini-text');
   return directText(element,':scope > g.lini-caption text.lini-text');
  };
  const geometry=(path:SVGPathElement,from:Element,to:Element)=>{
   const box=(element:Element)=>{
    const direct=element.querySelector(':scope > rect,:scope > ellipse,:scope > polygon,:scope > path'),mermaidShape=format==='mermaid'?element.querySelector(':scope > g.basic > rect,:scope > g.basic > ellipse,:scope > g.basic > polygon,:scope > g.basic > path'):null,shape=(direct??mermaidShape) as SVGGraphicsElement|null;if(!shape)throw new Error(`Native endpoint ${element.getAttribute('data-id')??element.id??element.localName} has no rendered shape (children: ${Array.from(element.children).map(child=>`${child.localName}.${child.getAttribute('class')??''}`).join(',')})`);const rect=shape.getBBox(),matrix=shape.getCTM();
    if(!matrix)throw new Error('Native carrier has no rendered transform');
    const corners=[[rect.x,rect.y],[rect.x+rect.width,rect.y],[rect.x,rect.y+rect.height],[rect.x+rect.width,rect.y+rect.height]].map(([x,y])=>{const point=new DOMPoint(x!,y!).matrixTransform(matrix);return{x:point.x,y:point.y};});
    return{x1:Math.min(...corners.map(point=>point.x)),x2:Math.max(...corners.map(point=>point.x)),y1:Math.min(...corners.map(point=>point.y)),y2:Math.max(...corners.map(point=>point.y))};
   };
   const matrix=path.getCTM();if(!matrix)throw new Error('Native connector path has no rendered transform');
   const length=path.getTotalLength();if(!Number.isFinite(length)||length<=0)throw new Error('Native connector has no drawn path');
   const first=path.getPointAtLength(0).matrixTransform(matrix),last=path.getPointAtLength(length).matrixTransform(matrix),a=box(from),b=box(to);
   const near=(point:DOMPoint,rect:typeof a)=>point.x>=rect.x1-24&&point.x<=rect.x2+24&&point.y>=rect.y1-24&&point.y<=rect.y2+24;
   return{length,start:{x:first.x,y:first.y},end:{x:last.x,y:last.y},fromBox:a,toBox:b,forward:near(first,a)&&near(last,b),reverse:near(first,b)&&near(last,a)};
  };
  const nodeElements=new Map<string,Element>();for(const item of carriers.filter(item=>item.kind==='node')){const element=carrierElement('node',item.nativeId);if(!element)throw new Error(`Missing native node object ${item.nativeId} for ${item.path}`);nodeElements.set(item.nativeId,element);}
  const observedCarriers=carriers.map(item=>{const element=carrierElement(item.kind,item.nativeId);if(!element)throw new Error(`Missing native ${item.kind} object ${item.nativeId} for ${item.path}`);return{kind:item.kind,nativeId:item.nativeId,path:item.path,label:ownLabel(element,item.kind,item.prefix+item.label)};});
  const observedConnections=connections.map(item=>{
   let path:SVGPathElement|undefined,label='';
   if(format==='dot'){
    const edge=Array.from(live.querySelectorAll('g.edge')).find(element=>element.id===item.nativeId);if(!edge)throw new Error(`Missing native DOT edge ${item.nativeId} for ${item.path}`);
    const titleText=title(edge),expectedTitle=`${item.fromNativeId}->${item.toNativeId}`;if(titleText!==expectedTitle)throw new Error(`DOT edge ${item.logicalId} native endpoints differ (${titleText})`);
    path=edge.querySelector(':scope > path') as SVGPathElement|null??undefined;label=ownLabel(edge,'node',item.label);
    const arrow=!!edge.querySelector(':scope > polygon');if(arrow!==item.directed)throw new Error(`DOT edge ${item.logicalId} directed arrow does not match source semantics`);
   }else if(format==='mermaid'){
    const edgePrefix=`L_${item.fromNativeId}_${item.toNativeId}_`,pairPaths=Array.from(live.querySelectorAll('path[data-id]')).filter(element=>{const id=element.getAttribute('data-id')??'';return id.startsWith(edgePrefix)&&(!element.hasAttribute('data-from')||element.getAttribute('data-from')===item.fromNativeId)&&(!element.hasAttribute('data-to')||element.getAttribute('data-to')===item.toNativeId);});
    path=pairPaths[item.pairOccurrence] as SVGPathElement|undefined;if(!path)throw new Error(`Missing native Mermaid edge path ${item.nativeId} (pair occurrence ${item.pairOccurrence}) for ${item.path}; found ${pairPaths.map(element=>element.getAttribute('data-id')).join(', ')}`);
    const actualNativeId=path.getAttribute('data-id')!;
    const arrow=path.hasAttribute('marker-end')||path.hasAttribute('marker-start');if(arrow!==item.directed)throw new Error(`Mermaid edge ${item.logicalId} arrow does not match source semantics`);
    if(item.hasLabel){const labelElement=Array.from(live.querySelectorAll('g.label[data-id]')).find(element=>element.getAttribute('data-id')===actualNativeId);if(!labelElement)throw new Error(`Missing Mermaid native label carrier ${actualNativeId} for ${item.path}`);label=labelElement.textContent??'';}
   }else{
    const links=Array.from(live.querySelectorAll('g.lini-link')),from=nodeElements.get(item.fromNativeId),to=nodeElements.get(item.toNativeId);if(!from||!to)throw new Error(`Missing Lini connector endpoint for ${item.logicalId}`);
    const fromAddress=item.fromLocator,toAddress=item.toLocator;const actual=links.find(element=>element.getAttribute('data-from')===fromAddress&&element.getAttribute('data-to')===toAddress&&!(element as any).__witnessUsed);if(!actual)throw new Error(`Missing native Lini connector ${item.logicalId} from ${fromAddress} to ${toAddress}`);(actual as any).__witnessUsed=true;
    path=actual.querySelector('path') as SVGPathElement|null??undefined;label=directText(actual,'text.lini-link-label');const arrow=!!actual.querySelector('.lini-marker-arrow');if(arrow!==item.directed)throw new Error(`Lini edge ${item.logicalId} arrow does not match source semantics`);
   }
   if(!path||!path.getAttribute('d')?.trim())throw new Error(`Native connection ${item.logicalId} has no visible path`);
   const from=nodeElements.get(item.fromNativeId),to=nodeElements.get(item.toNativeId);if(!from||!to)throw new Error(`Native connection ${item.logicalId} has missing rendered endpoint`);
   let points:ReturnType<typeof geometry>;try{points=geometry(path,from,to);}catch(error){throw new Error(`Native ${format} connection ${item.logicalId} ${item.fromNativeId}->${item.toNativeId} (${item.path}) endpoint geometry failed: ${error instanceof Error?error.message:String(error)}`);}
   if(!Number.isFinite(points.length)||points.length<=0)throw new Error(`Native connection ${item.logicalId} has no drawn path`);
   if(item.directed?!points.forward:!points.forward&&!points.reverse)throw new Error(`Native connection ${item.logicalId} path does not attach to its declared endpoints: ${JSON.stringify(points)}`);
   if(item.hasLabel&&normalizeText(label)!==normalizeText(item.label))throw new Error(`Native connection label differs at ${item.path}`);
   return{logicalId:item.logicalId,path:item.path,d:points.length,forward:points.forward,reverse:points.reverse};
  });
  for(const item of carriers){const result=observedCarriers.find(carrier=>carrier.kind===item.kind&&carrier.nativeId===item.nativeId);if(!result)throw new Error(`Unwitnessed native ${item.kind}: ${item.path}`);if(normalizeText(result.label)!==normalizeText(item.prefix+item.label))throw new Error(`Native ${item.kind} label differs at ${item.path}: ${JSON.stringify(result.label)}`);}
  return{carriers:observedCarriers,connections:observedConnections};
 },{svg,format,carriers:expected.carriers,connections:expected.connections});
 return {primaryCarriers:expected.primaryCarriers,connections:expected.connections.length,groups:nativeScene.groups.length,directedConnections:nativeScene.edges.filter(edge=>edge.directed!==false).length,undirectedConnections:nativeScene.edges.filter(edge=>edge.directed===false).length,endpointAssociations:expected.connections.length*2,sourceEndpointLocators:expected.endpointAssociations,normalization:'whitespace-collapse-v1'};
}

/**
 * Verify the already-qualified annotated profile tier against its own native
 * SVG objects. The profile reader independently enforces strict loss-free
 * whole-document readback; this check then binds those parsed native IDs to
 * rendered carriers and checks connector endpoints where the renderer exposes
 * them as native endpoint attributes or Graphviz edge topology.
 */
export async function verifyNativeFirstWitness(page:Page,source:string,svg:string,sourceDocument:Document,format:InterchangeFormat):Promise<NativeFirstWitness>{
 const native=readNativeFirstSource(source,format);
 if(!native)throw new Error(`Source has no qualified native-first header for ${format}`);
 if(canonical(native.document)!==canonical(sourceDocument))throw new Error('Native-first profile readback differs from the exact source document.');
 const visual=(sourceDocument.extensions as Record<string,unknown>|undefined)?.['umf.visual'] as Record<string,any>|undefined;
 if(!visual||typeof visual.kind!=='string')throw new Error('Source document has no valid Visual extension.');
 const mappings=native.identityMap;
 const checks=mappings.map(mapping=>{
  // Identity mappings often point at an object's ID, not its visible label.
  // The independently read profile coverage names the exact native label
  // slot, so use its source path rather than guessing from a nearby object.
  const coveredPaths=native.coverage
   .filter(item=>item.representation==='native-concept'&&item.aspect==='value'&&['label','name','title','text','detail','value','why','question'].includes(item.path.split('/').at(-1)??'')&&item.native.some(locator=>locator.id===mapping.nativeId&&!['tail','head','from','to'].includes(locator.slot)))
   .map(item=>item.path);
  const coveredLabels=coveredPaths.flatMap(path=>{const value=pointerValue(sourceDocument,path);return typeof value==='string'&&value?[value]:[];});
  const labels=coveredLabels.length?coveredLabels:primaryText(sourceDocument,mapping);
  const point=/\/metric\/series\/(\d+)\/points\/(\d+)$/.exec(mapping.path);
  if(point){const series=visual.metric?.series?.[Number(point[1])],datum=series?.points?.[Number(point[2])],value=datum?.value;if(typeof series?.label==='string'&&(typeof value==='number'||typeof value==='string')){
   const at=typeof datum?.at==='string'?datum.at:undefined;
   const date=at?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${at}T00:00:00Z`)).replace(',',''):undefined;
   labels.push(`${series.label}: ${date?`${date}, `:''}${value}`);
  }}
  let index=Number(/\/(?:messages|nodes|edges|groups|participants|events|spans|periods|points|items|fields)\/(\d+)/.exec(mapping.path)?.[1]??-1),chartId:string|undefined,timelineDate:string|undefined,fieldName:string|undefined,fieldType:string|undefined,fieldPort:string|undefined;
  if(point){const seriesIndex=Number(point[1]),pointIndex=Number(point[2]),metricSeries=visual.metric.series as {points:unknown[]}[];index=metricSeries.slice(0,seriesIndex).reduce((sum:number,series:{points:unknown[]})=>sum+series.points.length,0)+pointIndex;chartId=visual.form==='stat'?'metric-stat-sparkline':visual.form==='meter'?'metric-meter':'metric-line';}
  if(mapping.kind==='event'&&visual.kind==='timeline'){
   const eventIndex=Number(/\/timeline\/events\/(\d+)\/id$/.exec(mapping.path)?.[1]??-1),event=visual.timeline?.events?.[eventIndex];
   index=eventIndex;chartId=`timeline-${visual.form}`;timelineDate=event?.at;
  }
  if(mapping.kind==='field'&&visual.kind==='structure'&&visual.form==='entities'){
   const fieldPath=/\/structure\/entities\/(\d+)\/fields\/(\d+)$/.exec(mapping.path),field=fieldPath&&visual.structure?.entities?.[Number(fieldPath[1])]?.fields?.[Number(fieldPath[2])];
   if(field){fieldName=JSON.stringify(field.name);fieldType=typeof field.type==='string'?JSON.stringify(field.type):undefined;fieldPort=`umf_field_${hexBytes(field.name)}`;}
  }
  if(mapping.kind==='item'&&visual.kind==='comparison'&&visual.form==='quadrant'&&mapping.path.includes('/comparison/items/')){chartId='quadrant-items';const item=visual.comparison?.items?.[index];if(item)labels.push(item.label);}
  return{kind:mapping.kind,nativeId:mapping.nativeId,visualId:mapping.visualId,path:mapping.path,sourcePath:mapping.sourcePath,labels,index,chartId,...(timelineDate?{timelineDate}:{}),...(fieldName!==undefined?{fieldName}:{}),...(fieldType!==undefined?{fieldType}:{}),...(fieldPort!==undefined?{fieldPort}:{})};
 });
 const endpoints:{kind:'dot-flow'|'mermaid-message'|'lini-flow';nativeId:string;from:string;to:string;directed:boolean;index:number;label?:string}[]=[];
 const nodeNative=new Map(mappings.filter(row=>row.kind==='node'||row.kind==='participant').map(row=>[row.visualId,row.nativeId]));
 if(format==='dot'&&visual.kind==='flow'){
  for(const row of mappings.filter(item=>item.kind==='edge')){
   const index=Number(/\/edges\/(\d+)/.exec(row.path)?.[1]);const edge=visual.edges?.[index];if(!edge)throw new Error(`DOT edge mapping has no source edge at ${row.path}`);
   const from=nodeNative.get(edge.from),to=nodeNative.get(edge.to);if(!from||!to)throw new Error(`DOT edge ${edge.id} lacks mapped endpoint nodes`);
   endpoints.push({kind:'dot-flow',nativeId:row.nativeId,from,to,directed:true,index,...(typeof edge.label==='string'?{label:edge.label}:{})});
  }
 }
 if(format==='mermaid'&&visual.kind==='sequence'){
  for(const row of mappings.filter(item=>item.kind==='message')){
   const index=Number(/\/messages\/(\d+)/.exec(row.path)?.[1]);const message=visual.sequence?.messages?.[index];if(!message)throw new Error(`Mermaid message mapping has no source message at ${row.path}`);
   const from=nodeNative.get(message.from),to=nodeNative.get(message.to);if(!from||!to)throw new Error(`Mermaid message ${message.id} lacks mapped participant endpoints`);
   endpoints.push({kind:'mermaid-message',nativeId:row.nativeId,from,to,directed:true,index,...(typeof message.label==='string'?{label:message.label}:{})});
  }
 }
 if(format==='lini'&&visual.kind==='flow'){
  for(const row of mappings.filter(item=>item.kind==='edge')){
   const index=Number(/\/edges\/(\d+)/.exec(row.path)?.[1]);const edge=visual.edges?.[index];if(!edge)throw new Error(`Lini edge mapping has no source edge at ${row.path}`);
   const from=nodeNative.get(edge.from),to=nodeNative.get(edge.to);if(!from||!to)throw new Error(`Lini edge ${edge.id} lacks mapped endpoint nodes`);
   endpoints.push({kind:'lini-flow',nativeId:row.nativeId,from,to,directed:true,index,...(typeof edge.label==='string'?{label:edge.label}:{})});
  }
 }
 const result=await page.evaluate(({svg,format,checks,endpoints})=>{
  const normalize=(value:string)=>value.replace(/\s+/gu,' ').trim();
  const document=new DOMParser().parseFromString(svg,'image/svg+xml');if(document.querySelector('parsererror')||document.documentElement.localName!=='svg')throw new Error('Native-first renderer output is not valid SVG.');
  const root=window.document.importNode(document.documentElement,true) as unknown as SVGSVGElement;root.style.position='absolute';root.style.left='-100000px';root.style.top='0';root.style.visibility='hidden';root.style.overflow='visible';window.document.body.replaceChildren(root);
  const text=(element:Element)=>{const spans=Array.from(element.querySelectorAll('tspan'));return normalize(spans.length?spans.map(item=>item.textContent??'').join(' '):element.textContent??'');};
  const title=(element:Element)=>element.querySelector(':scope > title')?.textContent??'';
  const candidates=(row:typeof checks[number]):Element[]=>{
   const {kind,nativeId,index,labels}=row;
   if(format==='dot'){
    if(kind==='field'&&nativeId.includes(':')){
     const owner=nativeId.slice(0,nativeId.indexOf(':'));return Array.from(root.querySelectorAll('g.node')).filter(element=>title(element)===owner);
    }
    const selector=kind==='group'?'g.cluster':kind==='edge'||kind==='reference'||kind==='message'?'g.edge':'g.node';
    return Array.from(root.querySelectorAll(selector)).filter(element=>title(element)===nativeId||element.id===nativeId);
   }
   if(format==='lini'){
    if(kind==='edge')return [];
    if(kind==='item'&&row.chartId==='quadrant-items'){
     const itemId=row.visualId,encoded=Array.from(new TextEncoder().encode(itemId),byte=>byte.toString(16).padStart(2,'0')).join(''),table=Array.from(root.querySelectorAll('g.lini-table[data-id]')).find(element=>element.getAttribute('data-id')==='quadrant-items');
     const cellId=`qitem_${encoded}_label`,cell=table&&Array.from(table.querySelectorAll('g.lini-node[data-id]')).find(element=>element.getAttribute('data-id')===cellId);return cell?[cell]:[];
    }
    if((kind==='criterion'||kind==='item')&&nativeId.endsWith('_id')){
     const labelId=nativeId.slice(0,-3)+'_label',cell=Array.from(root.querySelectorAll('g.lini-node[data-id]')).find(element=>element.getAttribute('data-id')===labelId);if(cell)return[cell];
    }
    if(kind==='category'&&nativeId.endsWith('-id')){
     const labelId=nativeId.slice(0,-3)+'-label',cell=Array.from(root.querySelectorAll('g.lini-node[data-id]')).find(element=>element.getAttribute('data-id')===labelId);if(cell)return[cell];
    }
    if(kind==='point'&&row.chartId){
     const chart=Array.from(root.querySelectorAll('g.lini-chart[data-id]')).find(element=>element.getAttribute('data-id')===row.chartId);
     const hits=chart?Array.from(chart.querySelectorAll('g[class*="lini-hit-"]')).filter(element=>(element.getAttribute('class')??'').split(/\s+/u).some(token=>token===`lini-hit-${index}`)):[];
     const matching=hits.filter(element=>labels.every(label=>normalize(text(element)).includes(normalize(label))));
     if(matching.length===1){
      const shape=matching[0]!.querySelector('ellipse,circle,rect,polygon,path') as SVGGraphicsElement|null,box=shape?.getBBox();
      const nonzero=!!shape&&!!box&&box.width>0&&box.height>0;
      if(nonzero)return matching;
     }
    }
    if(kind==='event'&&row.chartId?.startsWith('timeline-')){
     const chart=Array.from(root.querySelectorAll('g.lini-chart[data-id]')).find(element=>element.getAttribute('data-id')===row.chartId);
     const marks=chart?Array.from(chart.querySelectorAll('g.lini-node.lini-oval')):[],eventLabels=chart?Array.from(chart.querySelectorAll('text.lini-chart-label')):[];
     if(!chart||!row.timelineDate||marks.length===0||marks.length!==eventLabels.length)throw new Error(`Lini timeline ${row.chartId} does not render one ordered marker and label per event.`);
     const allEvents=checks.filter(candidate=>candidate.kind==='event'&&candidate.chartId===row.chartId).sort((a,b)=>a.index-b.index);
     if(marks.length!==allEvents.length||row.index<0||row.index>=marks.length)throw new Error(`Lini timeline ${row.chartId} event count/order differs from the native event map.`);
     const markerCenters=marks.map(mark=>{const shape=mark.querySelector('ellipse') as SVGGraphicsElement|null,matrix=shape?.getCTM();if(!shape||!matrix)throw new Error(`Lini timeline ${row.chartId} contains a marker without native geometry.`);return new DOMPoint(0,0).matrixTransform(matrix);});
     for(let left=0;left<allEvents.length;left++)for(let right=left+1;right<allEvents.length;right++)if(allEvents[left]!.timelineDate===allEvents[right]!.timelineDate&&Math.abs(markerCenters[left]!.y-markerCenters[right]!.y)<1)throw new Error(`Lini timeline ${row.chartId} overlaps same-day event markers instead of separating their rows.`);
     const mark=marks[row.index]!,label=eventLabels[row.index]!,ellipse=mark.querySelector('ellipse') as SVGGraphicsElement|null,box=ellipse?.getBBox();
     if(!ellipse||!box||box.width<=0||box.height<=0||normalize(label.textContent??'')!==normalize(labels[0]??''))throw new Error(`Lini timeline event ${row.nativeId} lacks its exact native marker/label pair.`);
     const guideGroup=Array.from(chart.querySelectorAll('g.lini-node.lini-line')).find(group=>(group.getAttribute('style')??'').includes('--lini-rose-deep')),guide=guideGroup?.querySelector('line') as SVGLineElement|undefined;
     if(!guide)throw new Error(`Lini timeline ${row.chartId} has no native dated guide line.`);
     const markCtm=ellipse.getCTM(),guideCtm=guide.getCTM();if(!markCtm||!guideCtm)throw new Error(`Lini timeline event ${row.nativeId} has no native geometry transform.`);
     const center=new DOMPoint(0,0).matrixTransform(markCtm),start=new DOMPoint(Number(guide.getAttribute('x1')),Number(guide.getAttribute('y1'))).matrixTransform(guideCtm),end=new DOMPoint(Number(guide.getAttribute('x2')),Number(guide.getAttribute('y2'))).matrixTransform(guideCtm);
     const events=allEvents.map(event=>({date:event.timelineDate!,index:event.index})),dates=events.map(event=>event.date).sort(),min=Date.parse(`${dates[0]}T00:00:00Z`),max=Date.parse(`${dates.at(-1)}T00:00:00Z`),at=Date.parse(`${row.timelineDate}T00:00:00Z`);
     const x=max===min?(start.x+end.x)/2:start.x+(end.x-start.x)*(at-min)/(max-min);if(!Number.isFinite(center.x)||Math.abs(center.x-x)>2)throw new Error(`Lini timeline event ${row.nativeId} marker date does not match the native date-scale position.`);
     return[mark];
    }
    const aliases=[nativeId];
    if((kind==='criterion'||kind==='item')&&nativeId.endsWith('_id'))aliases.push(nativeId.slice(0,-3)+'_label');
    if(kind==='category'&&nativeId.endsWith('-id'))aliases.push(nativeId.slice(0,-3)+'-label');
    if(row.sourcePath)aliases.push(row.sourcePath.split('#').at(-1)!);
    if(nativeId.startsWith('umf_visual.umf_graph.'))aliases.push(nativeId.slice('umf_visual.umf_graph.'.length));
    const direct=Array.from(root.querySelectorAll('g.lini-node[data-id]')).filter(element=>aliases.includes(element.getAttribute('data-id')??''));
    if(direct.length)return direct;
    if(['series','value'].includes(kind))return Array.from(root.querySelectorAll('g.lini-chart[data-id]')).filter(chart=>labels.length>0&&labels.every(label=>text(chart).includes(normalize(label))));
    return [];
   }
   if(format==='mermaid'&&kind==='message')return [Array.from(root.querySelectorAll('[data-et="message"][data-id]'))[index]].filter(Boolean) as Element[];
   const aliases=[nativeId];
   if(format==='mermaid'){
    const indexed=/^(?:message|loop)@(\d+)$/.exec(nativeId);if(indexed)aliases.push(`i${Math.max(0,Number(indexed[1])-1)}`);
   }
   if(format==='mermaid'&&kind==='participant')return Array.from(root.querySelectorAll('[data-et="participant"][data-id]')).filter(element=>aliases.includes(element.getAttribute('data-id')??''));
   if(format==='mermaid'&&kind==='message')return Array.from(root.querySelectorAll('[data-et="message"][data-id]')).filter(element=>aliases.includes(element.getAttribute('data-id')??''));
   const all=Array.from(root.querySelectorAll('[data-id], [id], [name]'));
   return all.filter(element=>aliases.some(alias=>element.getAttribute('data-id')===alias||element.id===alias||element.getAttribute('name')===alias));
  };
  const seen=new Map<string,Element>(),annotated=new Set<string>();
  for(const row of checks){
   if(format==='lini'&&row.kind==='edge')continue;
   const found=candidates(row).filter(element=>!element.closest('[data-et="note"], .annotation, .umf-annotations, #cluster_umf_annotations'));
   if(!found.length)throw new Error(`Missing native-first ${row.kind} SVG carrier ${row.nativeId} (${row.path}).`);
   const carrier=found[0]!;seen.set(row.kind+'\0'+row.nativeId,carrier);
   const visible=row.kind==='message'&&format==='mermaid'&&row.index>=0?text(Array.from(root.querySelectorAll('.messageText'))[row.index]??carrier):row.kind==='event'&&format==='lini'&&row.chartId?text(Array.from(root.querySelectorAll(`g.lini-chart[data-id="${row.chartId}"] text.lini-chart-label`))[row.index]??carrier):text(carrier);
   if(row.labels.length&&!row.labels.every(label=>visible.includes(normalize(label))))throw new Error(`Native-first carrier ${row.nativeId} does not visibly contain every primary source value at ${row.path} (expected ${JSON.stringify(row.labels)}, saw ${JSON.stringify(visible)}).`);
   if(format==='dot'&&row.kind==='field'){
    const name=row.fieldName,type=row.fieldType,fieldPort=row.fieldPort,actualPort=row.nativeId.split(':')[1];if(typeof name!=='string'||typeof fieldPort!=='string'||actualPort!==fieldPort)throw new Error(`DOT field ${row.nativeId} locator does not resolve to its exact source port.`);
     const texts=Array.from(carrier.querySelectorAll('text')),named=texts.filter(element=>normalize(text(element))===normalize(name));if(named.length!==1)throw new Error(`DOT field ${row.nativeId} does not have one visible name cell in its owner/port card.`);
    if(typeof type==='string'){
     const nameBox=(named[0] as SVGGraphicsElement).getBBox(),nameY=nameBox.y+nameBox.height/2,typed=texts.filter(element=>normalize(text(element))===normalize(type)).filter(element=>{const box=(element as SVGGraphicsElement).getBBox();return Math.abs(nameY-(box.y+box.height/2))<=2;});if(typed.length!==1)throw new Error(`DOT field ${row.nativeId} does not have exactly one matching visible type cell on its native name row.`);
    }
   }
  }
  const connections:{nativeId:string;from:string;to:string;directed:boolean}[]=[];
  const usedLiniLinks=new Set<Element>();
  for(const edge of endpoints){
   if(edge.kind==='dot-flow'){
    const group=Array.from(root.querySelectorAll('g.edge')).find(element=>element.id===edge.nativeId||title(element)===`${edge.from}->${edge.to}`);if(!group)throw new Error(`Missing Graphviz edge carrier ${edge.nativeId}`);
    if(title(group)!==`${edge.from}->${edge.to}`)throw new Error(`Graphviz edge ${edge.nativeId} endpoint title differs from source.`);
    const path=group.querySelector(':scope > path') as SVGPathElement|null;if(!path?.getAttribute('d')?.trim()||path.getTotalLength()<=0)throw new Error(`Graphviz edge ${edge.nativeId} has no native connector path.`);
    const from=Array.from(root.querySelectorAll('g.node')).find(element=>title(element)===edge.from),to=Array.from(root.querySelectorAll('g.node')).find(element=>title(element)===edge.to);
    if(!from||!to)throw new Error(`Graphviz edge ${edge.nativeId} endpoints are not native node carriers.`);
    const box=(element:Element)=>{const shape=element.querySelector('polygon,ellipse,rect,path') as SVGGraphicsElement|null;if(!shape)return undefined;const b=shape.getBBox(),m=shape.getCTM();if(!m)return undefined;const points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x!,y!).matrixTransform(m));return{x1:Math.min(...points.map(p=>p.x)),x2:Math.max(...points.map(p=>p.x)),y1:Math.min(...points.map(p=>p.y)),y2:Math.max(...points.map(p=>p.y))};};
    const matrix=path.getCTM(),length=path.getTotalLength();if(!matrix)throw new Error(`Graphviz edge ${edge.nativeId} has no rendered transform.`);
    const first=path.getPointAtLength(0).matrixTransform(matrix),last=path.getPointAtLength(length).matrixTransform(matrix),a=box(from),b=box(to);if(!a||!b)throw new Error(`Graphviz edge ${edge.nativeId} has unreadable endpoint geometry.`);
    const near=(point:DOMPoint,rect:typeof a)=>point.x>=rect.x1-20&&point.x<=rect.x2+20&&point.y>=rect.y1-20&&point.y<=rect.y2+20;
    if(!near(first,a)||!near(last,b))throw new Error(`Graphviz edge ${edge.nativeId} path is not attached to its declared endpoints.`);
    if(Boolean(group.querySelector(':scope > polygon'))!==edge.directed)throw new Error(`Graphviz edge ${edge.nativeId} arrow does not match direction.`);
   }else if(edge.kind==='mermaid-message'){
    const indexed=/^(?:message|loop)@(\d+)$/.exec(edge.nativeId);if(!indexed)throw new Error(`Invalid Mermaid message identity ${edge.nativeId}`);
    const event=Array.from(root.querySelectorAll('[data-et="message"][data-id]'))[edge.index];
    if(!event||event.getAttribute('data-from')!==edge.from||event.getAttribute('data-to')!==edge.to)throw new Error(`Mermaid message ${edge.nativeId} endpoints differ from source.`);
    const line=event.matches('line.messageLine0, line.messageLine1, path.messageLine0, path.messageLine1')?event:event.querySelector('line.messageLine0, line.messageLine1, path.messageLine0, path.messageLine1');if(!line)throw new Error(`Mermaid message ${edge.nativeId} has no drawn native connector.`);
    const fromLine=Array.from(root.querySelectorAll('[data-et="life-line"][data-id]')).find(element=>element.getAttribute('data-id')===edge.from),toLine=Array.from(root.querySelectorAll('[data-et="life-line"][data-id]')).find(element=>element.getAttribute('data-id')===edge.to);
    if(!fromLine||!toLine)throw new Error(`Mermaid message ${edge.nativeId} has missing participant lifelines.`);
    const fromX=Number(fromLine.getAttribute('x1')),toX=Number(toLine.getAttribute('x1'));
    let x1:number,x2:number;
    if(line.localName==='line'){x1=Number(line.getAttribute('x1'));x2=Number(line.getAttribute('x2'));}
    else{const path=line as SVGPathElement,length=path.getTotalLength();if(!Number.isFinite(length)||length<=0)throw new Error(`Mermaid message ${edge.nativeId} has no readable connector geometry.`);x1=path.getPointAtLength(0).x;x2=path.getPointAtLength(length).x;}
    if(![x1,x2,fromX,toX].every(Number.isFinite)||Math.abs(x1-fromX)>12||Math.abs(x2-toX)>12)throw new Error(`Mermaid message ${edge.nativeId} geometry (${x1}, ${x2}) does not attach to its declared participants (${fromX}, ${toX}).`);
   }else{
    const links=Array.from(root.querySelectorAll('g.lini-link[data-from][data-to]'));
    const endpointId=(address:string)=>address.split('.').at(-1);
    const link=links.find(element=>!usedLiniLinks.has(element)&&endpointId(element.getAttribute('data-from')??'')===endpointId(edge.from)&&endpointId(element.getAttribute('data-to')??'')===endpointId(edge.to));
    const path=link?.querySelector('path') as SVGPathElement|null;if(!link||!path?.getAttribute('d')?.trim()||path.getTotalLength()<=0)throw new Error(`Lini edge ${edge.nativeId} has no attached native connector.`);
    const endpointNode=(nativeId:string)=>Array.from(root.querySelectorAll('g.lini-node[data-id]')).find(element=>element.getAttribute('data-id')===endpointId(nativeId));
    const from=endpointNode(edge.from),to=endpointNode(edge.to);if(!from||!to)throw new Error(`Lini edge ${edge.nativeId} has missing native endpoint nodes.`);
    const shapeBox=(node:Element)=>{const shape=node.querySelector(':scope > rect,:scope > ellipse,:scope > polygon,:scope > path') as SVGGraphicsElement|null;if(!shape)return;const box=shape.getBBox(),matrix=shape.getCTM();if(!matrix)return;const corners=[[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]].map(([x,y])=>new DOMPoint(x!,y!).matrixTransform(matrix));return{x1:Math.min(...corners.map(point=>point.x)),x2:Math.max(...corners.map(point=>point.x)),y1:Math.min(...corners.map(point=>point.y)),y2:Math.max(...corners.map(point=>point.y))};};
    const matrix=path.getCTM(),length=path.getTotalLength(),fromBox=shapeBox(from),toBox=shapeBox(to);if(!matrix||!fromBox||!toBox)throw new Error(`Lini edge ${edge.nativeId} has unreadable endpoint geometry.`);
    const start=path.getPointAtLength(0).matrixTransform(matrix),end=path.getPointAtLength(length).matrixTransform(matrix),distance=(point:DOMPoint,box:typeof fromBox)=>Math.hypot(Math.max(box.x1-point.x,0,point.x-box.x2),Math.max(box.y1-point.y,0,point.y-box.y2));
    if(distance(start,fromBox)>24||distance(end,toBox)>24)throw new Error(`Lini edge ${edge.nativeId} path is not attached to its declared source/target shapes.`);
    if(edge.label&& !text(link).includes(normalize(edge.label)))throw new Error(`Lini edge ${edge.nativeId} label is not visible on its connector.`);
    usedLiniLinks.add(link);
    seen.set('edge\0'+edge.nativeId,link);
   }
   connections.push({nativeId:edge.nativeId,from:edge.from,to:edge.to,directed:edge.directed});
  }
  // Native annotations are separate profile carriers. Count only carriers that
  // belong to a parsed annotation mapping; identical text elsewhere cannot pass.
  for(const row of checks.filter(item=>item.kind==='field'||item.kind==='value')){
   const found=candidates(row);if(found.length)annotated.add(row.nativeId);
  }
  return{nativeIdsChecked:seen.size,primaryCarriers:seen.size,connections,annotatedCarriers:annotated.size};
 },{svg,format,checks,endpoints});
 return{tier:native.representation.tier,sourceProfile:native.representation.sourceProfile,sourceMappingVersion:native.representation.sourceMappingVersion,primaryCarriers:result.primaryCarriers,connections:result.connections.length,endpointAssociations:result.connections.length*2,nativeIdsChecked:result.nativeIdsChecked,annotatedCarriers:result.annotatedCarriers,endpointWitnessScope:'mapped-flow-and-sequence-endpoints-v1; DOT entity reference and port endpoint geometry excluded',svgNormalization:'whitespace-collapse-v1'};
}
