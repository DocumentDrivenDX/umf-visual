// SPDX-License-Identifier: MIT OR Apache-2.0
/** Structural and geometric checks for native nested-container projections. */
import type {PresentationPlan} from '../../src/presentation';
import type {Visual,VisualNode} from '../../src/extensions/visual';
import type {Page} from 'playwright';
import type {PresentationQualityCheck} from './quality';
import {createHash} from 'node:crypto';

export interface NestedNativeReport {ok:boolean;problems:string[];parents:Map<string,string|undefined>;captions:Map<string,string>;}
export interface NativeBounds {x:number;y:number;width:number;height:number;}
export type NestedProofCheck=PresentationQualityCheck&{check:'nested-native-carriers'|'nested-native-captions'|'nested-native-containment'|'nested-no-synthetic-links'};
const norm=(value:string)=>value.replace(/\s+/gu,' ').trim();
const decode=(value:string)=>value.replace(/#32;/g,' ').replace(/#35;/g,'#').replace(/#38;/g,'&').replace(/#34;/g,'"').replace(/#60;/g,'<').replace(/#62;/g,'>').replace(/#59;/g,';').replace(/#40;/g,'(').replace(/#41;/g,')').replace(/#91;/g,'[').replace(/#93;/g,']').replace(/#123;/g,'{').replace(/#125;/g,'}').replace(/#92;/g,'\\').replace(/<br\s*\/?\s*>/gi,'\n');
const unquote=(value:string)=>{try{return JSON.parse(value) as string;}catch{return value;}};
const stripQuoted=(line:string)=>{let quote=false,escape=false,out='';for(const char of line){if(escape){escape=false;continue;}if(quote&&char==='\\'){escape=true;continue;}if(char==='"'){quote=!quote;out+=' ';continue;}if(!quote)out+=char;}return out;};

/** Re-read emitted native source and compare its real container nesting to UMF parent links. */
export function inspectNestedNative(plan:PresentationPlan,visual:Visual):NestedNativeReport {
 const problems:string[]=[],parents=new Map<string,string|undefined>(),captions=new Map<string,string>();
 const backend=plan.backend;if(backend==='lini')return{ok:false,problems:['Nested Graphviz or Mermaid plan required.'],parents,captions};
 const entries=plan.elementMap.filter(item=>item.kind==='node'),byNative=new Map(entries.map(item=>[item.nativeId,item.logicalId]));
 const expected=new Map((visual.nodes??[]).map(node=>[node.id,node.parent]));
 const stack:string[]=[],seen=new Set<string>();let edgeCount=0;
 for(const raw of plan.source.split(/\r?\n/u)){
  const line=raw.trim();if(!line)continue;
  if(backend==='graphviz'){
   if(/^\}/u.test(line)){stack.pop();continue;}
   if(/^subgraph cluster_([A-Za-z0-9_-]+)\s*\{/u.test(line)){const id=/^subgraph cluster_([A-Za-z0-9_-]+)\s*\{/u.exec(line)![1]!,logical=byNative.get(id);if(!logical){problems.push(`Unknown native container ${id}.`);continue;}if(seen.has(logical))problems.push(`Duplicate native carrier for ${logical}.`);seen.add(logical);parents.set(logical,stack.length?stack[stack.length-1]:undefined);stack.push(logical);continue;}
   const leaf=/^(?!graph\s)([A-Za-z][\w-]*)\s+\[.*\blabel=("(?:\\.|[^"\\])*")/u.exec(line);if(leaf){const logical=byNative.get(leaf[1]!);if(!logical){problems.push(`Phantom or unmapped native node ${leaf[1]}.`);continue;}if(seen.has(logical))problems.push(`Duplicate native carrier for ${logical}.`);seen.add(logical);parents.set(logical,stack.at(-1));captions.set(logical,unquote(leaf[2]!));}
   if(/^\s*[A-Za-z][\w-]*\s*(?:->|--\s+[A-Za-z])/u.test(stripQuoted(raw)))edgeCount++;
   const graphLabel=/^graph\s+\[.*\blabel=("(?:\\.|[^"\\])*")/u.exec(line);if(graphLabel&&stack.length){const logical=stack.at(-1)!;captions.set(logical,unquote(graphLabel[1]!));}
  }else{
   if(line==='end'){stack.pop();continue;}
   const frame=/^subgraph\s+([A-Za-z][\w-]*)\s*\["((?:\\.|[^"\\])*)"\]/u.exec(line);if(frame){const logical=byNative.get(frame[1]!);if(!logical){problems.push(`Unknown native container ${frame[1]}.`);continue;}if(seen.has(logical))problems.push(`Duplicate native carrier for ${logical}.`);seen.add(logical);parents.set(logical,stack.at(-1));captions.set(logical,decode(frame[2]!));stack.push(logical);continue;}
   const leaf=/^([A-Za-z][\w-]*)\["((?:\\.|[^"\\])*)"\]/u.exec(line);if(leaf){const logical=byNative.get(leaf[1]!);if(!logical){problems.push(`Phantom or unmapped native node ${leaf[1]}.`);continue;}if(seen.has(logical))problems.push(`Duplicate native carrier for ${logical}.`);seen.add(logical);parents.set(logical,stack.at(-1));captions.set(logical,decode(leaf[2]!));}
   if(/^\s*[A-Za-z][\w-]*\s+(?:-->|---|-.->|~~~)\s*[A-Za-z]/u.test(stripQuoted(raw)))edgeCount++;
  }
 }
 if(stack.length)problems.push('Native container scopes are unbalanced.');
 if(edgeCount)problems.push(`Found ${edgeCount} synthetic native connector(s); nested source links are empty.`);
 for(const node of visual.nodes??[]){if(!seen.has(node.id))problems.push(`Missing native carrier for source node ${node.id}.`);if(parents.get(node.id)!==expected.get(node.id))problems.push(`Native parent of ${node.id} does not match its source parent.`);const caption=captions.get(node.id)??'';for(const text of [node.label,node.detail,node.role?'Role: '+node.role:undefined,node.status?'Status: '+node.status:undefined].filter((value):value is string=>!!value))if(!norm(caption).includes(norm(text)))problems.push(`Caption for ${node.id} omits source text ${JSON.stringify(text)}.`);}
 for(const id of seen)if(!expected.has(id))problems.push(`Unexpected logical carrier ${id}.`);
 return{ok:problems.length===0,problems,parents,captions};
}

/** Container bounds must enclose each descendant and distinct siblings must not overlap. */
export function checkNestedBounds(visual:Visual,bounds:ReadonlyMap<string,NativeBounds>,captionBounds:ReadonlyMap<string,NativeBounds>=new Map()):string[] {
 const problems:string[]=[],nodes=visual.nodes??[],byId=new Map(nodes.map(node=>[node.id,node]));
 const isAncestor=(ancestor:string,node:VisualNode)=>{let parent=node.parent;while(parent){if(parent===ancestor)return true;parent=byId.get(parent)?.parent;}return false;};
 const contains=(outer:NativeBounds,inner:NativeBounds)=>inner.x>=outer.x-1&&inner.y>=outer.y-1&&inner.x+inner.width<=outer.x+outer.width+1&&inner.y+inner.height<=outer.y+outer.height+1;
 for(const parent of nodes){const parentBounds=bounds.get(parent.id);if(!parentBounds)continue;for(const child of nodes.filter(node=>isAncestor(parent.id,node))){const childBounds=bounds.get(child.id);if(childBounds&&!contains(parentBounds,childBounds))problems.push(`Native bounds for ${child.id} escape enclosing container ${parent.id}.`);}}
 const overlap=(a:NativeBounds,b:NativeBounds)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)if(nodes[i]!.parent===nodes[j]!.parent){const a=bounds.get(nodes[i]!.id),b=bounds.get(nodes[j]!.id);if(a&&b&&overlap(a,b))problems.push(`Native sibling frames ${nodes[i]!.id} and ${nodes[j]!.id} overlap.`);}
 for(const node of nodes){const caption=captionBounds.get(node.id),frame=bounds.get(node.id);if(caption&&frame&&!contains(frame,caption))problems.push(`Native caption for ${node.id} escapes its frame.`);if(caption)for(const child of nodes.filter(candidate=>candidate.parent===node.id)){const childBounds=bounds.get(child.id);if(childBounds&&overlap(caption,childBounds))problems.push(`Native caption for ${node.id} overlaps child frame ${child.id}.`);}}
 return problems;
}

/** Compare native container captions to source captions; frames are intentionally not counted as mapped semantic groups. */
export function verifyNestedNative(plan:PresentationPlan,visual:Visual,frames?:ReadonlyMap<string,NativeBounds>,captions?:ReadonlyMap<string,NativeBounds>):NestedNativeReport {
 const report=inspectNestedNative(plan,visual);if(frames)report.problems.push(...checkNestedBounds(visual,frames,captions));report.ok=report.problems.length===0;return report;
}

const sourceHash=(value:string)=>createHash('sha256').update(Buffer.from(value,'utf8')).digest('hex');
const proof=(check:NestedProofCheck['check'],sourceSha256:string,problems:string[],details:string):NestedProofCheck=>({check,sourceSha256,result:problems.length?'fail':'pass',details:problems.length?problems.join('; '):details});

/** Verify the already inserted SVG's native owners and bounds; the helper never resets its page. */
export async function verifyNestedBrowserQuality(page:Page,input:{plan:PresentationPlan;visual:Visual;nativeAst?:unknown}):Promise<NestedProofCheck[]> {
 const {plan,visual}=input,sourceSha256=sourceHash(plan.source),parsed=inspectNestedNative(plan,visual),nativeProblems:string[]=[],captionProblems:string[]=[],frameProblems:string[]=[],edgeProblems:string[]=[];
 if(!parsed.ok)nativeProblems.push(...parsed.problems);
 let astEdgeCount=0;
 if(plan.backend==='graphviz'){
  const ast=input.nativeAst as {objects?:Array<Record<string,unknown>>;edges?:Array<Record<string,unknown>>}|undefined;
  const objects=Array.isArray(ast?.objects)?ast!.objects!:[];
  const byId=new Map(objects.filter(object=>typeof object.id==='string').map(object=>[object.id as string,object]));
  if(!ast||!Array.isArray(ast.objects))nativeProblems.push('Graphviz JSON AST is missing.');
  const clusters=objects.filter(object=>typeof object.name==='string'&&(object.name as string).startsWith('cluster_'));
  const ownerClusters=new Map<string,string[]>();
  for(const cluster of clusters){const owner=typeof cluster.id==='string'?cluster.id:undefined,members=Array.isArray(cluster.nodes)?cluster.nodes as number[]:[];if(owner)for(const member of members){const id=objects.find(object=>object._gvid===member)?.id;if(typeof id==='string')ownerClusters.set(id,[...(ownerClusters.get(id)??[]),owner]);}}
  const clusterSize=new Map(clusters.filter(object=>typeof object.id==='string').map(object=>[object.id as string,Array.isArray(object.nodes)?object.nodes.length:0]));
  const parentCluster=new Map<string,string>();for(const parent of clusters){const parentId=typeof parent.id==='string'?parent.id:undefined,children=Array.isArray(parent.subgraphs)?parent.subgraphs as number[]:[];if(parentId)for(const gvid of children){const child=clusters.find(object=>object._gvid===gvid);if(typeof child?.id==='string')parentCluster.set(child.id,parentId);}}
  const astNodes=objects.filter(object=>typeof object.name==='string'&&!(object.name as string).startsWith('cluster_'));
  for(const node of visual.nodes??[]){const native=plan.elementMap.find(item=>item.kind==='node'&&item.logicalId===node.id)?.nativeId;if(!native)continue;const record=byId.get(native);if(!record)nativeProblems.push(`Graphviz AST has no owner for ${node.id}.`);else{const label=String(record.label??'');for(const text of [node.label,node.detail,node.role?'Role: '+node.role:undefined,node.status?'Status: '+node.status:undefined].filter((value):value is string=>!!value))if(!label.includes(text))captionProblems.push(`Graphviz AST owner ${node.id} omits ${JSON.stringify(text)}.`);const memberships=ownerClusters.get(native)??[],parent=node.parent?plan.elementMap.find(item=>item.kind==='node'&&item.logicalId===node.parent)?.nativeId:undefined,direct=parentCluster.get(native)??[...memberships].sort((a,b)=>(clusterSize.get(a)??Number.MAX_SAFE_INTEGER)-(clusterSize.get(b)??Number.MAX_SAFE_INTEGER))[0];if(parent?direct!==parent:direct!==undefined)nativeProblems.push(`Graphviz AST parent ownership differs for ${node.id}.`);}}
  const mappedSet=new Set(plan.elementMap.filter(item=>item.kind==='node').map(item=>item.nativeId));for(const object of astNodes){if(typeof object.id==='string'&&!mappedSet.has(object.id)&&/^n\d+$/u.test(object.id))nativeProblems.push(`Graphviz AST has phantom native carrier ${object.id}.`);}
  astEdgeCount=ast?.edges?.length??0;if(astEdgeCount)edgeProblems.push('Graphviz AST contains native connectors although source edges are empty.');
 }
 const mapped=plan.elementMap.filter(item=>item.kind==='node'),bounds=new Map<string,NativeBounds>(),captionBounds=new Map<string,NativeBounds>(),expectedCarriers=new Set(mapped.map(item=>item.nativeId));
 const dom=await page.locator('#frame svg').evaluate((root,backend)=>{
  const svg=root as SVGSVGElement,rootBox=svg.getBoundingClientRect();const bounds=(element:Element)=>{const b=element.getBoundingClientRect();return{x:b.x-rootBox.x,y:b.y-rootBox.y,width:b.width,height:b.height};};
  const all=[...svg.querySelectorAll<SVGGElement>('g.cluster,g.node')],nativeOf=(group:SVGGElement)=>backend==='graphviz'?group.id:group.classList.contains('cluster')?/-((?:n)\d+)$/u.exec(group.id)?.[1]:/flowchart-(n\d+)-/u.exec(group.id)?.[1];
  const ownedCaption=(group:SVGGElement)=>{if(backend==='mermaid')return group.querySelector('.cluster-label,.nodeLabel');return [...group.querySelectorAll<SVGTextElement>(':scope > text')];};
  const records=all.map(group=>{const native=nativeOf(group),label=ownedCaption(group),parts=Array.isArray(label)?label:label?[label]:[],text=parts.map(part=>{const html=part.querySelector('div,p,span') as HTMLElement|null;return html&&typeof html.innerText==='string'?html.innerText:part.textContent??'';}).join('\n').replace(/\s+/g,' ').trim(),glyphs=backend==='mermaid'?parts.flatMap(part=>[...part.querySelectorAll('p,span,text')]):parts,visible=glyphs.length>0&&glyphs.every(part=>{const style=getComputedStyle(part),box=part.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||'1')>0&&box.width>0&&box.height>0;}),labelBoxes=parts.map(part=>bounds(part)).filter(b=>b.width&&b.height),caption=labelBoxes.length?{x:Math.min(...labelBoxes.map(b=>b.x)),y:Math.min(...labelBoxes.map(b=>b.y)),width:Math.max(...labelBoxes.map(b=>b.x+b.width))-Math.min(...labelBoxes.map(b=>b.x)),height:Math.max(...labelBoxes.map(b=>b.y+b.height))-Math.min(...labelBoxes.map(b=>b.y))}:undefined,ancestor=group.parentElement?.closest('g.cluster') as SVGGElement|null,ancestorNative=ancestor?nativeOf(ancestor):undefined;return{native,box:bounds(group),text,visible,caption,ancestorNative,tag:group.classList.contains('cluster')?'cluster':'node'};});
  return{records,edges:svg.querySelectorAll('g.edge,g.edgePath,path.flowchart-link,.edgeLabel').length};
 },plan.backend);
 const domCarrierProblems:string[]=[];
 const seen=new Set<string>();for(const record of dom.records){if(!record.native)continue;if(!expectedCarriers.has(record.native))domCarrierProblems.push(`SVG contains phantom native carrier ${record.native}.`);if(seen.has(record.native))domCarrierProblems.push(`SVG repeats native carrier ${record.native}.`);seen.add(record.native);}
 for(const element of mapped){const record=dom.records.find(item=>item.native===element.nativeId);if(!record){domCarrierProblems.push(`Missing actual SVG carrier for ${element.logicalId}.`);continue;}bounds.set(element.logicalId,record.box);if(record.caption)captionBounds.set(element.logicalId,record.caption);const node=visual.nodes?.find(item=>item.id===element.logicalId);if(!record.visible)captionProblems.push(`Owned caption for ${element.logicalId} is hidden or missing.`);if(node)for(const text of [node.label,node.detail,node.role?'Role: '+node.role:undefined,node.status?'Status: '+node.status:undefined].filter((value):value is string=>!!value))if(!record.text.includes(text))captionProblems.push(`Actual SVG carrier ${element.logicalId} omits its owned caption ${JSON.stringify(text)}.`);}
 if(seen.size!==mapped.length)domCarrierProblems.push(`SVG has ${seen.size} mapped carriers for ${mapped.length} source nodes.`);
 nativeProblems.push(...domCarrierProblems);
 frameProblems.push(...checkNestedBounds(visual,bounds,captionBounds));
 const actualEdges=dom.edges;if(actualEdges)edgeProblems.push(`Native SVG has ${actualEdges} connector/path carrier(s), but nested source has no semantic edges.`);
 const astCheck=proof('nested-native-carriers',sourceSha256,nativeProblems,`Graphviz JSON AST or Mermaid subgraph source, checked against the rendered SVG, retains all ${visual.nodes?.length??0} source node identities and parent associations.`);
 const labelCheck=proof('nested-native-captions',sourceSha256,captionProblems,'Each native SVG carrier visibly owns its source label, detail, role, and status.');
 const containmentCheck=proof('nested-native-containment',sourceSha256,frameProblems,'Native parent frames enclose descendants; sibling frames are disjoint and captions clear child frames.');
 const linkCheck=proof('nested-no-synthetic-links',sourceSha256,edgeProblems,'Native AST and SVG contain no synthetic semantic connectors.');
 return[astCheck,labelCheck,containmentCheck,linkCheck];
}

export interface NestedMutationResult {mutation:'child-outside-parent'|'overlapping-siblings'|'hidden-owner-caption'|'transparent-owner-caption'|'removed-owner-caption'|'moved-owner-caption'|'phantom-carrier'|'synthetic-connector';applied:boolean;detected:boolean;failedChecks:string[];inapplicableReason?:string;}

/** Exercise the browser proof against native DOM mutations using a fresh copy per mutation. */
export async function runNestedBrowserMutationControls(page:Page,input:{svg:string;plan:PresentationPlan;visual:Visual;nativeAst?:unknown}):Promise<NestedMutationResult[]> {
 const results:NestedMutationResult[]=[],mutations:NestedMutationResult['mutation'][]=['child-outside-parent','overlapping-siblings','hidden-owner-caption','transparent-owner-caption','removed-owner-caption','moved-owner-caption','phantom-carrier','synthetic-connector'];
 const nodes=input.visual.nodes??[],nativeByLogical=new Map(input.plan.elementMap.filter(item=>item.kind==='node').map(item=>[item.logicalId,item.nativeId]));
 const child=nodes.find(node=>node.parent&&nativeByLogical.has(node.id)&&nativeByLogical.has(node.parent));
 let siblingA:VisualNode|undefined,siblingB:VisualNode|undefined;
 for(let i=0;i<nodes.length&&!siblingA;i++)for(let j=i+1;j<nodes.length;j++)if(nodes[i]!.parent===nodes[j]!.parent){siblingA=nodes[i];siblingB=nodes[j];break;}
 const parents=new Set(nodes.map(node=>node.id).filter(id=>nodes.some(node=>node.parent===id)));
 const leaves=nodes.filter(node=>!parents.has(node.id)&&nativeByLogical.has(node.id));
 const captionOwner=leaves[0],captionRecipient=leaves.find(node=>node.id!==captionOwner?.id),phantomSource=leaves[0];
 const usedNativeIds=[...nativeByLogical.values()].map(id=>/^n(\d+)$/u.exec(id)?.[1]).filter((id):id is string=>!!id).map(Number);
 const phantomNative='n'+(Math.max(0,...usedNativeIds)+1);
 for(const mutation of mutations){
  const needsChild=mutation==='child-outside-parent',needsSiblings=mutation==='overlapping-siblings',needsOwner=mutation==='hidden-owner-caption'||mutation==='transparent-owner-caption'||mutation==='removed-owner-caption',needsRecipient=mutation==='moved-owner-caption',needsPhantom=mutation==='phantom-carrier';
  if(needsChild&&!child){results.push({mutation,applied:false,detected:false,failedChecks:[],inapplicableReason:'Source node forest has no mapped child-parent pair.'});continue;}
  if(needsSiblings&&(!siblingA||!siblingB)){results.push({mutation,applied:false,detected:false,failedChecks:[],inapplicableReason:'Source node forest has no mapped sibling pair.'});continue;}
  if(needsOwner&&!captionOwner||needsRecipient&&(!captionOwner||!captionRecipient)){results.push({mutation,applied:false,detected:false,failedChecks:[],inapplicableReason:'Source node forest has insufficient mapped caption owners.'});continue;}
  if(needsPhantom&&!phantomSource){results.push({mutation,applied:false,detected:false,failedChecks:[],inapplicableReason:'Source node forest has no mapped carrier to clone.'});continue;}
  await page.setViewportSize({width:1600,height:900});
  await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:#fff}#frame{width:1600px;height:900px;display:flex;align-items:center;justify-content:center}#frame svg{display:block;width:100%;height:100%}</style><div id="frame"></div>',{waitUntil:'domcontentloaded'});
  await page.locator('#frame').evaluate((element,markup)=>{element.innerHTML=markup;},input.svg);
  const altered=await page.locator('#frame svg').evaluate((root,{backend,mutation,sourceNative,recipientNative,leftNative,rightNative,phantomNative,phantomSuffix})=>{
   const svg=root as SVGSVGElement;
   const carrier=(native:string)=>backend==='graphviz'?svg.querySelector<SVGGElement>(`g#${CSS.escape(native)}`):[...svg.querySelectorAll<SVGGElement>('g.cluster')].find(group=>group.id.endsWith('-'+native))??[...svg.querySelectorAll<SVGGElement>('g.node')].find(group=>group.id.includes(`flowchart-${native}-`));
   const one=sourceNative?carrier(sourceNative):undefined,two=recipientNative?carrier(recipientNative):undefined,left=leftNative?carrier(leftNative):undefined,right=rightNative?carrier(rightNative):undefined;if((sourceNative&&!one)||(recipientNative&&!two)||(leftNative&&!left)||(rightNative&&!right))return {applied:false,reason:'Mapped native carrier was absent from rendered SVG.'};
   if(mutation==='child-outside-parent'){one!.style.transform='translate(10000px, 10000px)';return {applied:true};}
   if(mutation==='overlapping-siblings'){const a=left!.getBoundingClientRect(),b=right!.getBoundingClientRect();right!.style.transform=`translate(${a.x-b.x}px, ${a.y-b.y}px)`;return {applied:true};}
   if(mutation==='hidden-owner-caption'||mutation==='transparent-owner-caption'||mutation==='removed-owner-caption'){const label:Element[]=backend==='graphviz'?[...one!.querySelectorAll(':scope > text')]:[...one!.querySelectorAll('.nodeLabel p')];if(!label.length)return {applied:false,reason:'Mapped owner has no directly owned caption glyph.'};if(mutation==='removed-owner-caption'){for(const element of label)element.remove();return {applied:label.every(element=>!element.isConnected)};}for(const element of label)element.setAttribute('style',mutation==='hidden-owner-caption'?'visibility:hidden':'opacity:0');return {applied:label.every(element=>{const box=element.getBoundingClientRect(),style=getComputedStyle(element);return !!element.textContent?.trim()&&box.width>0&&box.height>0&&(mutation==='hidden-owner-caption'?style.visibility==='hidden':Number(style.opacity)===0);}),reason:'Owned glyph mutation did not take effect.'};}
   if(mutation==='moved-owner-caption'){const label:Element[]=backend==='graphviz'?[...one!.querySelectorAll(':scope > text')]:[];const mermaidLabel=one!.querySelector('.nodeLabel');if(mermaidLabel)label.push(mermaidLabel);if(!label.length)return {applied:false,reason:'Mapped owner has no directly owned caption glyph.'};for(const element of label)two!.appendChild(element);return {applied:true};}
   if(mutation==='phantom-carrier'){const clone=left!.cloneNode(true) as SVGGElement;clone.id=backend==='graphviz'?phantomNative:`flowchart-${phantomNative}-${phantomSuffix}`;if(backend==='mermaid'){clone.classList.remove('cluster');clone.classList.add('node');}svg.appendChild(clone);return {applied:true};}
   const edge=document.createElementNS('http://www.w3.org/2000/svg','g');edge.setAttribute('class',backend==='graphviz'?'edge':'edgePath');svg.appendChild(edge);return {applied:true};
  },{backend:input.plan.backend,mutation,sourceNative:mutation==='child-outside-parent'?nativeByLogical.get(child?.id??''):nativeByLogical.get(captionOwner?.id??''),recipientNative:nativeByLogical.get(captionRecipient?.id??''),leftNative:nativeByLogical.get(siblingA?.id??'')??nativeByLogical.get(phantomSource?.id??''),rightNative:nativeByLogical.get(siblingB?.id??''),phantomNative,phantomSuffix:nodes.length+1});
  if(!altered.applied){results.push({mutation,applied:false,detected:false,failedChecks:[],inapplicableReason:altered.reason??'Native SVG mutation was not applied.'});continue;}
  const checks=await verifyNestedBrowserQuality(page,{plan:input.plan,visual:input.visual,nativeAst:input.nativeAst});
  const expected=mutation==='child-outside-parent'||mutation==='overlapping-siblings'?'nested-native-containment':mutation==='hidden-owner-caption'||mutation==='transparent-owner-caption'||mutation==='removed-owner-caption'||mutation==='moved-owner-caption'?'nested-native-captions':mutation==='synthetic-connector'?'nested-no-synthetic-links':'nested-native-carriers';
  const failedChecks=checks.filter(check=>check.result==='fail').map(check=>check.check);
  results.push({mutation,applied:true,detected:failedChecks.includes(expected),failedChecks});
 }
 return results;
}
