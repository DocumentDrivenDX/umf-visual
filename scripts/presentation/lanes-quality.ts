// SPDX-License-Identifier: MIT OR Apache-2.0
/** Native inventory, membership, and visible boundary proof for generic flow/lanes plans. */
import {createHash} from 'node:crypto';
import type {Page} from 'playwright';
import type {Visual} from '../../src/extensions/visual';
import type {PresentationPlan} from '../../src/presentation';
import {liniShapeDefinition} from '../../src/presentation/lini-shapes';
import type {PresentationQualityCheck} from './quality';

const CHECK='flow-lanes-native-membership-and-boundaries';
const norm=(value:string)=>value.replace(/\s+/gu,' ').trim();
const sha=(value:string)=>createHash('sha256').update(Buffer.from(value,'utf8')).digest('hex');
const check=(sourceSha256:string,problems:string[]):PresentationQualityCheck=>({check:CHECK,sourceSha256,result:problems.length?'fail':'pass',details:problems.length?problems.join('; '):'Native node/group inventory, source membership, lane captions, and visible lane boundaries match the source-derived plan.'});
type ParentInventory={nodeGroups:Map<string,string|undefined>;groupParents:Map<string,string|undefined>;problems:string[]};
type Box={x:number;y:number;width:number;height:number};
type NativeCarrier={nativeId:string;box:Box;boundary:Box;paintVisible:boolean;caption:string;captionVisible:boolean;captionBox?:Box;ancestorGroups:string[]};
type SvgInventory={groups:NativeCarrier[];nodes:NativeCarrier[];allGroupIds:string[];allNodeIds:string[];problems:string[]};

/** Read declaration nesting from renderer source; IDs are resolved only through the typed map. */
function inspectPlanMembership(plan:PresentationPlan,visual:Visual,nativeSource?:string):ParentInventory{
 const problems:string[]=[],nodeMap=new Map(plan.elementMap.filter(item=>item.kind==='node').map(item=>[item.nativeId,item.logicalId])),groupMap=new Map(plan.elementMap.filter(item=>item.kind==='group').map(item=>[item.nativeId,item.logicalId])),visualIds=new Set(plan.elementMap.filter(item=>item.kind==='visual').map(item=>item.nativeId)),annotationIds=new Set(plan.elementMap.filter(item=>item.kind==='annotation'&&/^\/extensions\/umf\.visual\/annotations\/\d+\/id$/u.test(item.sourcePath)).map(item=>item.nativeId)),seenNodes=new Set<string>(),seenGroups=new Set<string>(),nodeGroups=new Map<string,string|undefined>(),groupParents=new Map<string,string|undefined>(),stack:string[]=[];
 const nativeGroupToLogical=new Map([...groupMap].map(([native,id])=>[native,id]));
 if(plan.backend==='lini'){
  for(const group of visual.groups??[])groupParents.set(group.id,group.parent);
  for(const node of visual.nodes??[])nodeGroups.set(node.id,node.group);
  return{nodeGroups,groupParents,problems};
 }
 const source=plan.backend==='mermaid'&&nativeSource?nativeSource:plan.source;
 for(const raw of source.split(/\r?\n/u)){
  const line=raw.trim();if(!line)continue;
  if(plan.backend==='graphviz'){
   const group=/^subgraph\s+cluster_([A-Za-z0-9_-]+)\s*\{/u.exec(line);
   if(group){const native=group[1]!,logical=nativeGroupToLogical.get(native);if(!logical){problems.push(`Plan declares unmapped lane/group carrier ${native}.`);continue;}if(seenGroups.has(logical))problems.push(`Plan repeats lane/group carrier ${logical}.`);seenGroups.add(logical);groupParents.set(logical,stack.at(-1));stack.push(logical);continue;}
   if(line==='}'||line.startsWith('} ')){if(stack.length)stack.pop();continue;}
   const node=/^([A-Za-z][\w-]*)\s+\[(?=[^\]]*(?:label|id)\s*=)/u.exec(line);
   if(node&&!['graph','node','edge'].includes(node[1]!)){if(annotationIds.has(node[1]!))continue;const logical=nodeMap.get(node[1]!);if(!logical){problems.push(`Plan declares unmapped native node carrier ${node[1]}.`);continue;}if(seenNodes.has(logical))problems.push(`Plan repeats node carrier ${logical}.`);seenNodes.add(logical);nodeGroups.set(logical,stack.at(-1));}
  }else if(plan.backend==='mermaid'){
   const group=/^subgraph\s+([A-Za-z][\w-]*)\s*\[/u.exec(line);
   if(group){const native=group[1]!,logical=nativeGroupToLogical.get(native);if(!logical){if(visualIds.has(native))continue;problems.push(`Plan declares unmapped lane/group carrier ${native}.`);continue;}if(seenGroups.has(logical))problems.push(`Plan repeats lane/group carrier ${logical}.`);seenGroups.add(logical);groupParents.set(logical,stack.at(-1));stack.push(logical);continue;}
   if(line==='end'){if(stack.length)stack.pop();continue;}
   const node=/^([A-Za-z][\w-]*)\s*(?:\[|@\{)/u.exec(line);
   if(node&&!['subgraph','click','style','classDef','class','linkStyle'].includes(node[1]!)){if(annotationIds.has(node[1]!)&&line.startsWith(`${node[1]}@{ shape: text,`))continue;const logical=nodeMap.get(node[1]!);if(!logical){problems.push(`Plan declares unmapped native node carrier ${node[1]}.`);continue;}if(seenNodes.has(logical))problems.push(`Plan repeats node carrier ${logical}.`);seenNodes.add(logical);nodeGroups.set(logical,stack.at(-1));}
  }else{
   const group=/^\|group#([A-Za-z0-9_-]+)\|/u.exec(line);
   if(group){const native=group[1]!,logical=nativeGroupToLogical.get(native);if(!logical){if(visualIds.has(native))continue;problems.push(`Plan declares unmapped lane/group carrier ${native}.`);continue;}if(seenGroups.has(logical))problems.push(`Plan repeats lane/group carrier ${logical}.`);seenGroups.add(logical);groupParents.set(logical,stack.at(-1));if(line.includes('['))stack.push(logical);continue;}
   if(/^\s*\]\s*$/u.test(line)){if(stack.length)stack.pop();continue;}
   const block=/^\|block#([A-Za-z0-9_-]+)\|/u.exec(line);if(block&&annotationIds.has(block[1]!))continue;
   const node=/^\|(?:box|oval|circle|ellipse|diamond|hexagon|cylinder|parallelogram|note|document|multiple-documents)#([A-Za-z0-9_-]+)\|/u.exec(line);
   if(node){const logical=nodeMap.get(node[1]!);if(!logical){problems.push(`Plan declares unmapped native node carrier ${node[1]}.`);continue;}if(seenNodes.has(logical))problems.push(`Plan repeats node carrier ${logical}.`);seenNodes.add(logical);nodeGroups.set(logical,stack.at(-1));}
  }
 }
 if(stack.length)problems.push('Plan native group declarations are unbalanced.');
 const expectedNodes=new Set((visual.nodes??[]).map(node=>node.id)),expectedGroups=new Set((visual.groups??[]).map(group=>group.id));
 if(seenNodes.size!==expectedNodes.size||[...expectedNodes].some(id=>!seenNodes.has(id)))problems.push('Plan native node declarations do not exactly match source node identities.');
 if(seenGroups.size!==expectedGroups.size||[...expectedGroups].some(id=>!seenGroups.has(id)))problems.push('Plan native group declarations do not exactly match source group identities.');
 for(const group of visual.groups??[])if(groupParents.get(group.id)!==group.parent)problems.push(`Plan parent group for ${group.id} does not match its source parent.`);
 for(const node of visual.nodes??[])if(nodeGroups.get(node.id)!==node.group)problems.push(`Plan lane membership for ${node.id} does not match its source group.`);
 return{nodeGroups,groupParents,problems};
}

/** Read real SVG identity, paint, captions, and bounds without inferring DOM ancestry for flattened backends. */
async function readSvgInventory(page:Page,plan:PresentationPlan,visual:Visual):Promise<SvgInventory>{
 const expectedNodes=plan.elementMap.filter(item=>item.kind==='node').map(item=>item.nativeId),expectedGroups=plan.elementMap.filter(item=>item.kind==='group').map(item=>item.nativeId),visualIds=plan.elementMap.filter(item=>item.kind==='visual').map(item=>item.nativeId),annotationIds=plan.elementMap.filter(item=>item.kind==='annotation'&&/^\/extensions\/umf\.visual\/annotations\/\d+\/id$/u.test(item.sourcePath)).map(item=>item.nativeId);
 const expectedLiniNodeTypes=Object.fromEntries((visual.nodes??[]).flatMap(node=>{const native=plan.elementMap.find(item=>item.kind==='node'&&item.logicalId===node.id)?.nativeId;if(!native)return[];const type=liniShapeDefinition(node.shape)?.type??({actor:'oval',store:'cyl',document:'note'} as Record<string,string>)[node.role??'']??'box';return[[native,({hex:'lini-hexagon',cyl:'lini-cyl',oval:'lini-oval',box:'lini-box',circle:'lini-circle',ellipse:'lini-ellipse',diamond:'lini-diamond',parallelogram:'lini-parallelogram',note:'lini-note','multiple-documents':'lini-multiple-documents',document:'lini-document'} as Record<string,string>)[type]??`lini-${type}`]];}));
 const expectedLiniCells=Object.fromEntries((visual.nodes??[]).flatMap(node=>{const native=plan.elementMap.find(item=>item.kind==='node'&&item.logicalId===node.id)?.nativeId;return native&&node.detail?[[native,node.detail]]:[];}));
 return page.locator('#frame svg').first().evaluate((root,args)=>{
  const svg=root as SVGSVGElement,problems:string[]=[],box=(element:Element):Box=>{const r=element.getBoundingClientRect(),s=svg.getBoundingClientRect();return{x:r.x-s.x,y:r.y-s.y,width:r.width,height:r.height};};
  const normText=(value:string)=>value.replace(/\s+/gu,' ').trim();
  const visible=(element:Element)=>{const b=element.getBoundingClientRect();let opacity=1,node:Element|null=element;while(node){const style=getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden')return false;const value=Number.parseFloat(style.opacity||'1');if(!Number.isFinite(value)||value<=.02)return false;opacity*=value;node=node.parentElement;}return opacity>.02&&b.width>0&&b.height>0;};
  const paint=(element:Element)=>{const style=getComputedStyle(element),alpha=(value:string,opacity:string)=>{const color=value.trim().toLowerCase();if(!color||color==='none'||color==='transparent')return false;let candidate:string|undefined;const modern=/^color\([^)]*\/\s*([^)]*?)\s*\)$/u.exec(color);if(modern)candidate=modern[1]!.trim();else{const match=/^(?:rgba?|hsla?)\((.*)\)$/u.exec(color);if(match){const body=match[1]!,slash=body.includes('/')?body.slice(body.lastIndexOf('/')+1).trim():undefined,parts=body.split(/[,\s]+/u).filter(Boolean);candidate=slash??(parts.length===4?parts[3]:undefined);}else if(/^#[0-9a-f]{3}(?:[0-9a-f]{1})?$/u.test(color))candidate=color.length===5?String(parseInt(color[4]!,16)/15):undefined;else if(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/u.test(color))candidate=color.length===9?String(parseInt(color.slice(7),16)/255):undefined;else return false;}const a=candidate===undefined?1:Number.parseFloat(candidate)*(candidate.endsWith('%')?.01:1),styleAlpha=Number.parseFloat(opacity||'1');return Number.isFinite(a)&&a>.02&&Number.isFinite(styleAlpha)&&styleAlpha>.02;};return visible(element)&&(alpha(style.fill,style.fillOpacity)||alpha(style.stroke,style.strokeOpacity)&&Number.parseFloat(style.strokeWidth||'1')>0);};
  const shapeBox=(shapes:Element[])=>{const visibleShapes=shapes.filter(paint).map(box);if(!visibleShapes.length)return{x:0,y:0,width:0,height:0};const x=Math.min(...visibleShapes.map(b=>b.x)),y=Math.min(...visibleShapes.map(b=>b.y)),right=Math.max(...visibleShapes.map(b=>b.x+b.width)),bottom=Math.max(...visibleShapes.map(b=>b.y+b.height));return{x,y,width:right-x,height:bottom-y};};
  const visibleText=(element:Element)=>{const html=element.matches('foreignObject')?element.querySelector('div,p,span') as HTMLElement|null:null;if(html&&typeof html.innerText==='string')return normText(html.innerText);if(element.matches('text')){const lines=[...element.querySelectorAll<SVGTSpanElement>(':scope > tspan')];if(lines.length)return normText(lines.filter(paint).map(line=>line.textContent??'').join(' '));if(!paint(element))return'';}return normText(element.textContent??'');};
  const captionInfo=(carrier:Element,kind:'group'|'node',nativeId:string)=>{
   let labels:Element[]=[];
   if(args.backend==='lini'&&kind==='group'){
    labels=[...carrier.querySelectorAll(':scope > g.lini-caption')];
   }else if(args.backend==='lini')labels=[...carrier.querySelectorAll(':scope > text,:scope > foreignObject')];
   else labels=[...carrier.querySelectorAll('text,foreignObject')].filter(label=>label.closest(args.backend==='graphviz'?'g.cluster,g.node':'g.cluster,g.node')===carrier);
   const visibleLabels=labels.filter(visible),glyphs=(label:Element)=>[...(label.matches('text,foreignObject')?[label]:label.querySelectorAll('text,foreignObject'))].filter(visible),text=visibleLabels.flatMap(label=>glyphs(label).map(visibleText)).filter(Boolean).join(' '),shown=visibleLabels.some(label=>glyphs(label).length>0),captionBox=visibleLabels.map(box);let caption:Box|undefined;
   if(captionBox.length){const x=Math.min(...captionBox.map(b=>b.x)),y=Math.min(...captionBox.map(b=>b.y)),right=Math.max(...captionBox.map(b=>b.x+b.width)),bottom=Math.max(...captionBox.map(b=>b.y+b.height));caption={x,y,width:right-x,height:bottom-y};}
   return{text,shown,caption};
  };
  const resolveId=(raw:string,kind:'group'|'node')=>{
   if(args.backend==='graphviz')return kind==='group'&&raw.startsWith('cluster_')?raw.slice('cluster_'.length):raw;
   if(args.backend==='lini')return raw;
   const known=kind==='group'?args.expectedGroups:args.expectedNodes;
   return known.find(id=>raw===id||raw.includes(`-${id}-`)||raw.endsWith(`-${id}`))??raw;
  };
  const make=(carrier:Element,kind:'group'|'node',nativeId:string,ancestors:string[]=[]):any=>{
   const shapes=[...carrier.querySelectorAll(':scope > polygon,:scope > rect,:scope > path,:scope > ellipse,:scope > circle,:scope > use')],frame=kind==='group'?shapeBox(shapes):box(carrier),caption=captionInfo(carrier,kind,nativeId);
   return{nativeId,box:box(carrier),boundary:frame,paintVisible:frame.width>0&&frame.height>0,caption:caption.text,captionVisible:caption.shown,captionBox:caption.caption,ancestorGroups:ancestors};
  };
  let groups:any[]=[],nodes:any[]=[],allGroupIds:string[]=[],allNodeIds:string[]=[];
  if(args.backend==='graphviz'){
   const clusterEls=[...svg.querySelectorAll('g.cluster')],nodeEls=[...svg.querySelectorAll('g.node')].filter(element=>!args.annotationIds.includes(element.querySelector(':scope > title')?.textContent?.trim()??element.id));
   groups=clusterEls.map(element=>{const raw=element.querySelector(':scope > title')?.textContent?.trim()??element.id,id=resolveId(raw,'group');allGroupIds.push(id);return make(element,'group',id);});
   nodes=nodeEls.map(element=>{const raw=element.querySelector(':scope > title')?.textContent?.trim()??element.id,id=resolveId(raw,'node'),ancestors:string[]=[];let parent:Element|null=element.parentElement;while(parent&&parent.tagName.toLowerCase()!=='svg'){if(parent.matches('g.cluster'))ancestors.unshift(resolveId(parent.querySelector(':scope > title')?.textContent?.trim()??parent.id,'group'));parent=parent.parentElement;}allNodeIds.push(id);return make(element,'node',id,ancestors);});
  }else if(args.backend==='mermaid'){
   const svgId=svg.id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),clusterEls=[...svg.querySelectorAll('g.cluster')],nodeEls=[...svg.querySelectorAll('g.node')].filter(element=>!args.annotationIds.some((id:string)=>new RegExp(`^${svgId}-flowchart-${id}-\\d+$`).test(element.id)));
   groups=clusterEls.map(element=>{const id=resolveId(element.id,'group');allGroupIds.push(id);return make(element,'group',id);});
   nodes=nodeEls.map(element=>{const id=resolveId(element.id,'node');allNodeIds.push(id);return make(element,'node',id);});
  }else{
   const allSemantic=[...svg.querySelectorAll<SVGGElement>('g.lini-node')],semantic=allSemantic.filter(element=>element.hasAttribute('data-id')&&!args.annotationIds.includes(element.dataset.id??'')),groupEls=semantic.filter(element=>element.classList.contains('lini-group')),nodeClasses=['lini-box','lini-oval','lini-circle','lini-ellipse','lini-diamond','lini-hexagon','lini-cyl','lini-parallelogram','lini-note','lini-document','lini-multiple-documents'];
   const mappedNativeNodes=new Set(args.expectedNodes),mappedNativeGroups=new Set(args.expectedGroups),helperGroupIds=new Set([...args.visualIds,'diagram-content',...(args.annotationIds.length?['annotation-footer']:[])]);
   const cellCounts=new Map<string,number>(),captionCounts=new Map<string,number>();for(const element of allSemantic){const id=element.getAttribute('data-id')??'',isCaption=element.classList.contains('lini-caption'),isCell=element.classList.contains('lini-cell');if(args.annotationIds.includes(id))continue;if(isCaption){const owner=element.parentElement?.closest('g.lini-node.lini-group[data-id]'),ownerId=owner?.getAttribute('data-id')??'',owned=!!owner&&(mappedNativeGroups.has(ownerId)||args.visualIds.includes(ownerId)||helperGroupIds.has(ownerId))&&(!args.visualIds.includes(ownerId)||normText(element.textContent??'')===normText(args.visualTitle));if(!owned)problems.push('Lini SVG contains an unowned caption helper.');else captionCounts.set(ownerId,(captionCounts.get(ownerId)??0)+1);continue;}if(isCell){const owner=element.parentElement?.closest('g.lini-node[data-id]'),ownerId=owner?.getAttribute('data-id')??'',expected=args.expectedLiniCells[ownerId] as string|undefined;cellCounts.set(ownerId,(cellCounts.get(ownerId)??0)+1);const content=[...element.querySelectorAll('text,foreignObject')].map(visibleText).join(' ');if(!owner||!mappedNativeNodes.has(ownerId)||!expected||normText(content)!==normText(expected))problems.push('Lini SVG contains an unowned or unexpected cell helper.');continue;}if(!element.hasAttribute('data-id')||(!element.classList.contains('lini-group')&&!nodeClasses.some(name=>element.classList.contains(name))))problems.push(`Lini SVG contains an undeclared semantic carrier (${element.getAttribute('class')??'unknown class'}).`);else if(element.classList.contains('lini-group')?!mappedNativeGroups.has(id)&&!helperGroupIds.has(id):!mappedNativeNodes.has(id))problems.push(`Lini SVG contains phantom semantic carrier ${id}.`);else if(!element.classList.contains('lini-group')&&!element.classList.contains(args.expectedLiniNodeTypes[id]??''))problems.push(`Lini native node ${id} has an alternate shape carrier.`);}for(const [id,text] of Object.entries(args.expectedLiniCells)){if(cellCounts.get(id)!==1)problems.push(`Lini node ${id} does not have exactly one authored detail cell.`);}for(const id of cellCounts.keys())if(!(id in args.expectedLiniCells))problems.push(`Lini node ${id} has an unexpected detail cell.`);for(const id of [...args.expectedGroups,...args.visualIds])if(captionCounts.get(id)!==1)problems.push(`Lini carrier ${id} does not have exactly one owned caption.`);
   groups=groupEls.map(element=>{const id=resolveId(element.dataset.id??'','group'),ancestors:string[]=[];let parent:Element|null=element.parentElement;while(parent&&parent.tagName.toLowerCase()!=='svg'){if(parent.matches('g.lini-node.lini-group[data-id]')){const parentId=resolveId(parent.getAttribute('data-id')??'','group');if(args.expectedGroups.includes(parentId))ancestors.unshift(parentId);}parent=parent.parentElement;}if(!helperGroupIds.has(id))allGroupIds.push(id);return make(element,'group',id,ancestors);});
   nodes=semantic.filter(element=>!element.classList.contains('lini-group')&&nodeClasses.some(name=>element.classList.contains(name))).map(element=>{const id=resolveId(element.dataset.id??'','node');allNodeIds.push(id);const ancestors:string[]=[];let parent:Element|null=element.parentElement;while(parent&&parent.tagName.toLowerCase()!=='svg'){if(parent.matches('g.lini-node.lini-group[data-id]'))ancestors.unshift(parent.getAttribute('data-id')??'');parent=parent.parentElement;}return make(element,'node',id,ancestors);});
  }
  return{groups,nodes,allGroupIds,allNodeIds,problems};
 },{backend:plan.backend,expectedNodes,expectedGroups,visualIds,annotationIds,visualTitle:visual.title??visual.question??'',expectedLiniNodeTypes,expectedLiniCells});
}

function expectedGroupPath(visual:Visual,groupId:string|undefined):string[]{
 const groups=visual.groups??[],path:string[]=[];let current=groupId?groups.find(group=>group.id===groupId):undefined;
 while(current){path.unshift(current.id);current=current.parent?groups.find(group=>group.id===current!.parent):undefined;}
 return path;
}

function compareInventory(plan:PresentationPlan,visual:Visual,inventory:SvgInventory,problems:string[]):void{
 const nodes=visual.nodes??[],groups=visual.groups??[],nodeMaps=plan.elementMap.filter(item=>item.kind==='node'),groupMaps=plan.elementMap.filter(item=>item.kind==='group');
 if(nodeMaps.length!==nodes.length||groupMaps.length!==groups.length)problems.push(`Element map contains ${nodeMaps.length} nodes/${groupMaps.length} groups; source requires ${nodes.length}/${groups.length}.`);
 for(const node of nodes){const rows=nodeMaps.filter(item=>item.logicalId===node.id);if(rows.length!==1){problems.push(`Source node ${node.id} has ${rows.length} native map rows.`);continue;}const carrier=inventory.nodes.filter(item=>item.nativeId===rows[0]!.nativeId);if(carrier.length!==1)problems.push(`Source node ${node.id} has ${carrier.length} actual native carriers.`);}
 for(const group of groups){const rows=groupMaps.filter(item=>item.logicalId===group.id);if(rows.length!==1){problems.push(`Source group ${group.id} has ${rows.length} native map rows.`);continue;}const carrier=inventory.groups.filter(item=>item.nativeId===rows[0]!.nativeId);if(carrier.length!==1)problems.push(`Source group ${group.id} has ${carrier.length} actual native carriers.`);else{
   if(!carrier[0]!.captionVisible||!norm(carrier[0]!.caption).includes(norm(group.label)))problems.push(`Lane/group ${group.id} does not visibly own its label.`);
   if(group.role==='lane'&&!carrier[0]!.paintVisible)problems.push(`Lane ${group.id} has no visible fill or stroke boundary.`);
  }}
 const expectedNodeIds=nodeMaps.map(item=>item.nativeId),expectedGroupIds=groupMaps.map(item=>item.nativeId),helpers=new Set(plan.elementMap.filter(item=>item.kind==='visual').map(item=>item.nativeId));
 for(const id of inventory.allNodeIds)if(!expectedNodeIds.includes(id))problems.push(`Actual SVG has phantom native node carrier ${id}.`);
 for(const id of inventory.allGroupIds)if(!expectedGroupIds.includes(id)&&!helpers.has(id))problems.push(`Actual SVG has phantom native group carrier ${id}.`);
 if(new Set(inventory.allNodeIds).size!==expectedNodeIds.length)problems.push('Actual SVG node carrier inventory has duplicates or an unexpected count.');
 if(new Set(inventory.allGroupIds.filter(id=>!helpers.has(id))).size!==expectedGroupIds.length)problems.push('Actual SVG group carrier inventory has duplicates or an unexpected count.');
 for(const node of nodes){const row=nodeMaps.find(item=>item.logicalId===node.id),carrier=inventory.nodes.find(item=>item.nativeId===row?.nativeId);if(!carrier)continue;
  const expected=expectedGroupPath(visual,node.group),actual=carrier.ancestorGroups.filter(id=>groupMaps.some(item=>item.nativeId===id)).map(id=>groupMaps.find(item=>item.nativeId===id)!.logicalId);
  if(plan.backend==='lini'&&JSON.stringify(actual)!==JSON.stringify(expected))problems.push(`Native group ancestry for ${node.id} differs from its source lane membership.`);
  for(const groupId of expected){const sourceGroup=groups.find(group=>group.id===groupId)!,groupMap=groupMaps.find(item=>item.logicalId===groupId),nativeGroup=inventory.groups.find(item=>item.nativeId===groupMap?.nativeId);if(!nativeGroup)continue;
   if(!contains(nativeGroup.boundary,carrier.box))problems.push(`Lane/group boundary ${groupId} does not contain source member ${node.id}.`);
   void sourceGroup;
  }
 }
 for(const group of groups){if(!group.parent)continue;const parentMap=groupMaps.find(item=>item.logicalId===group.parent),childMap=groupMaps.find(item=>item.logicalId===group.id),parent=inventory.groups.find(item=>item.nativeId===parentMap?.nativeId),child=inventory.groups.find(item=>item.nativeId===childMap?.nativeId);if(parent&&child&&!contains(parent.boundary,child.boundary))problems.push(`Parent lane/group ${group.parent} boundary does not contain child group ${group.id}.`);}
 if(plan.backend==='lini')for(const group of groups){const groupMap=groupMaps.find(item=>item.logicalId===group.id),carrier=inventory.groups.find(item=>item.nativeId===groupMap?.nativeId),expected=expectedGroupPath(visual,group.id).slice(0,-1).map(id=>groupMaps.find(item=>item.logicalId===id)?.nativeId).filter((id):id is string=>!!id);if(carrier&&JSON.stringify(carrier.ancestorGroups)!==JSON.stringify(expected))problems.push(`Native group ancestry for group ${group.id} differs from its source parent.`);}
}
const contains=(outer:Box,inner:Box)=>outer.width>0&&outer.height>0&&inner.x>=outer.x-2&&inner.y>=outer.y-2&&inner.x+inner.width<=outer.x+outer.width+2&&inner.y+inner.height<=outer.y+outer.height+2;

function compareGraphvizAst(plan:PresentationPlan,visual:Visual,nativeAst:unknown,problems:string[]):void{
 const ast=nativeAst&&typeof nativeAst==='object'?nativeAst as {objects?:Array<Record<string,unknown>>}:undefined,objects=ast?.objects;
 if(!Array.isArray(objects)){problems.push('Graphviz native AST is unavailable for lane membership proof.');return;}
 const groupMaps=plan.elementMap.filter(item=>item.kind==='group'),nodeMaps=plan.elementMap.filter(item=>item.kind==='node'),annotationIds=new Set(plan.elementMap.filter(item=>item.kind==='annotation'&&/^\/extensions\/umf\.visual\/annotations\/\d+\/id$/u.test(item.sourcePath)).map(item=>item.nativeId)),expectedGroups=groupMaps.map(item=>'cluster_'+item.nativeId),expectedNodes=nodeMaps.map(item=>item.nativeId),actualGroups=objects.filter(object=>typeof object.name==='string'&&String(object.name).startsWith('cluster_')).map(object=>String(object.name)),actualNodes=objects.filter(object=>typeof object.name==='string'&&!String(object.name).startsWith('cluster_')&&!annotationIds.has(String(object.name))&&!Array.isArray(object.nodes)&&!Array.isArray(object.subgraphs)).map(object=>String(object.name));
 if(actualGroups.length!==expectedGroups.length||expectedGroups.some(id=>!actualGroups.includes(id)))problems.push('Graphviz AST cluster inventory differs from mapped source groups.');
 if(actualNodes.length!==expectedNodes.length||expectedNodes.some(id=>!actualNodes.includes(id)))problems.push('Graphviz AST node inventory contains a phantom or missing carrier.');
 const byGvid=new Map(objects.map(object=>[Number(object._gvid),object])),byName=new Map(objects.filter(object=>typeof object.name==='string').map(object=>[String(object.name),object]));
 const descendants=(record:Record<string,unknown>,seen=new Set<number>()):{nodes:string[];groups:string[]}=>{const nodes=(Array.isArray(record.nodes)?record.nodes:[]).map(Number).map(id=>byGvid.get(id)?.name).filter((name):name is string=>typeof name==='string'),groups:string[]=[];for(const raw of Array.isArray(record.subgraphs)?record.subgraphs:[]){const child=byGvid.get(Number(raw));if(!child||typeof child.name!=='string'||!child.name.startsWith('cluster_'))continue;const id=Number(child._gvid);if(seen.has(id))continue;seen.add(id);groups.push(child.name);const nested=descendants(child,seen);nodes.push(...nested.nodes);groups.push(...nested.groups);}return{nodes:[...new Set(nodes)],groups:[...new Set(groups)]};};
 for(const group of visual.groups??[]){const groupNative=groupMaps.find(item=>item.logicalId===group.id)?.nativeId,record=groupNative?byName.get('cluster_'+groupNative):undefined;if(!record)continue;
  const nested=descendants(record),expectedNodesInGroup=(visual.nodes??[]).filter(node=>node.group===group.id||expectedGroupPath(visual,node.group).includes(group.id)).map(node=>nodeMaps.find(item=>item.logicalId===node.id)?.nativeId).filter((value):value is string=>!!value);
  if(nested.nodes.length!==expectedNodesInGroup.length||expectedNodesInGroup.some(id=>!nested.nodes.includes(id)))problems.push(`Graphviz AST membership of lane/group ${group.id} differs from its source members.`);
  const expectedChildGroups=(visual.groups??[]).filter(child=>expectedGroupPath(visual,child.parent).includes(group.id)).map(child=>groupMaps.find(item=>item.logicalId===child.id)?.nativeId).filter((value):value is string=>!!value).map(id=>'cluster_'+id);
  if(nested.groups.length!==expectedChildGroups.length||expectedChildGroups.some(id=>!nested.groups.includes(id)))problems.push(`Graphviz AST child groups of ${group.id} differ from source nesting.`);
 }
}

/** Mandatory native proof for generic flow/lanes views only. */
export async function verifyLanesPresentationQuality(page:Page,input:{plan:PresentationPlan;visual:Visual;nativeAst?:unknown}):Promise<PresentationQualityCheck[]>{
 const {plan,visual}=input,sourceSha256=sha(plan.source),problems:string[]=[];
 if(visual.kind!=='flow'||visual.form!=='lanes')return[check(sourceSha256,['Lane proof was invoked outside flow/lanes.'])];
 const nativeSource=typeof input.nativeAst==='string'?input.nativeAst:undefined;
 const planMembership=inspectPlanMembership(plan,visual,nativeSource);problems.push(...planMembership.problems);
 for(const group of visual.groups??[])if(planMembership.groupParents.get(group.id)!==group.parent)problems.push(`Plan group parent for ${group.id} is not source-derived.`);
 for(const node of visual.nodes??[])if(planMembership.nodeGroups.get(node.id)!==node.group)problems.push(`Plan node membership for ${node.id} is not source-derived.`);
 const inventory=await readSvgInventory(page,plan,visual);problems.push(...inventory.problems);compareInventory(plan,visual,inventory,problems);
 if(plan.backend==='graphviz')compareGraphvizAst(plan,visual,input.nativeAst,problems);
 return[check(sourceSha256,problems)];
}
