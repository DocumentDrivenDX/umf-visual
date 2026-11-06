// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {chromium,type Browser,type Page} from 'playwright';
import type {Document} from '@umf/core';
import {createVisualDocument,getVisual,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {mermaidSvg} from '../../scripts/presentation/build';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {requiredPresentationChecks} from '../../scripts/presentation/verify';
import {verifyPresentationQuality,type PresentationQualityCheck} from '../../scripts/presentation/quality';
import {verifyLanesPresentationQuality} from '../../scripts/presentation/lanes-quality';

const sourceDocument=readVisualDocument(readFileSync('fixtures/visual/inventory/beacon-field-guide.json','utf8'),'json') as Document;
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>await browser?.close());

async function dot(plan:PresentationPlan,format:'svg'|'json'){
 const child=Bun.spawn(['dot','-T'+format],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});child.stdin.write(plan.source);child.stdin.end();
 const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);expect(exit,stderr||stdout).toBe(0);expect(stderr).toBe('');return stdout;
}
async function native(backend:PresentationPlan['backend'],plan:PresentationPlan,page:Page){
 if(backend==='graphviz'){const [svg,json]=await Promise.all([dot(plan,'svg'),dot(plan,'json')]);return{svg,nativeAst:JSON.parse(json)};}
 if(backend==='mermaid')return{svg:(await mermaidSvg(page,plan.source,'lanes-quality')).svg,nativeAst:plan.source};
 const rendered=await renderPresentationLini(plan.source);return{svg:rendered.svg,nativeAst:rendered.nativeAst};
}
const laneCheck=(checks:PresentationQualityCheck[])=>checks.find(check=>check.check==='flow-lanes-native-membership-and-boundaries');
const escapeRegExp=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function renamedVisual(input:Visual){
 const visual=structuredClone(input),groupIds=new Map((visual.groups??[]).map((group,index)=>[group.id,`lane_${index+1}`])),nodeIds=new Map((visual.nodes??[]).map((node,index)=>[node.id,`item_${index+1}`])),edgeIds=new Map((visual.edges??[]).map((edge,index)=>[edge.id,`connection_${index+1}`]));
 for(const group of visual.groups??[]){group.id=groupIds.get(group.id)!;if(group.parent)group.parent=groupIds.get(group.parent)!;}
 for(const node of visual.nodes??[]){node.id=nodeIds.get(node.id)!;if(node.group)node.group=groupIds.get(node.group)!;}
 for(const edge of visual.edges??[]){edge.id=edgeIds.get(edge.id)!;edge.from=nodeIds.get(edge.from)!;edge.to=nodeIds.get(edge.to)!;}
 for(const step of visual.steps??[])step.focus=step.focus?.map(id=>edgeIds.get(id)!);
 return visual;
}
async function install(page:Page,svg:string){await page.setContent('<!doctype html><div id="frame">'+svg+'</div>');}
async function mappedNodeInventory(page:Page,plan:PresentationPlan){
 const nativeIds=plan.elementMap.filter(item=>item.kind==='node').map(item=>item.nativeId);
 return page.locator('#frame svg').evaluate((root,{backend,nativeIds})=>{
  const svg=root as SVGSVGElement;
  return nativeIds.map(nativeId=>{
   if(backend==='graphviz')return [...svg.querySelectorAll<SVGGElement>('g.node')].filter(carrier=>carrier.querySelector(':scope > title')?.textContent?.trim()===nativeId).length;
   if(backend==='mermaid')return [...svg.querySelectorAll<SVGGElement>('g.node')].filter(carrier=>carrier.id===nativeId||carrier.id.endsWith('-'+nativeId)||carrier.id.includes('-'+nativeId+'-')).length;
   return [...svg.querySelectorAll<SVGGElement>('g.lini-node[data-id]')].filter(carrier=>carrier.getAttribute('data-id')===nativeId&&[...carrier.classList].some(name=>['lini-box','lini-oval','lini-circle','lini-ellipse','lini-diamond','lini-hexagon','lini-cyl','lini-parallelogram','lini-note','lini-document','lini-multiple-documents'].includes(name))).length;
  });
 },{backend:plan.backend,nativeIds});
}
async function liniPhantom(page:Page,plan:PresentationPlan,svg:string,kind:'unknown-shape'|'orphan-text'|'duplicate-caption'){
 const first=plan.elementMap.find(item=>item.kind==='node');if(!first)throw Error('Lini phantom control requires a mapped node.');
 await install(page,svg);
 return page.locator('#frame svg').evaluate((root,{nativeId,kind})=>{
  const svg=root as SVGSVGElement,ghost=`unmapped_${nativeId}`;
  if(kind==='unknown-shape'){
   const shape=document.createElementNS('http://www.w3.org/2000/svg','g');shape.setAttribute('class','lini-node lini-unknown-shape');shape.setAttribute('data-id',ghost);
   const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M0 0 L8 4 L0 8 L-8 4 Z');path.setAttribute('stroke','#111');path.setAttribute('fill','#eee');shape.appendChild(path);svg.appendChild(shape);
  }else if(kind==='orphan-text'){
   const label=document.createElementNS('http://www.w3.org/2000/svg','g');label.setAttribute('class','lini-node lini-cell lini-block');label.setAttribute('data-id',ghost+'_caption');
   const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('class','lini-text');text.textContent='unmapped native caption';label.appendChild(text);svg.appendChild(label);
  }else{const owner=svg.querySelector('g.lini-node.lini-group[data-id]'),caption=owner?.querySelector(':scope > g.lini-caption');if(!owner||!caption)throw Error('Lini duplicate caption control requires an owned caption.');owner.appendChild(caption.cloneNode(true));}
  return svg.outerHTML;
 },{nativeId:first.nativeId,kind});
}
async function mutateLiniBoundary(page:Page,plan:PresentationPlan,svg:string,kind:'black-stroke'|'transparent-alpha'){
 const lane=plan.elementMap.find(item=>item.kind==='group');if(!lane)throw Error('Lini boundary control requires a mapped group.');await install(page,svg);
 return page.locator('#frame svg').evaluate((root,{nativeId,kind})=>{
  const svg=root as SVGSVGElement,carrier=svg.querySelector<SVGGElement>(`g.lini-node.lini-group[data-id="${nativeId}"]`),shape=carrier?.querySelector<SVGElement>(':scope > rect,:scope > path,:scope > polygon');
  if(!shape)throw Error(`Lini lane ${nativeId} has no direct boundary shape.`);
  if(kind==='black-stroke'){shape.setAttribute('fill','none');shape.setAttribute('stroke','rgb(0, 0, 0)');shape.setAttribute('stroke-width','2');}
  else{shape.setAttribute('fill','rgba(0, 0, 0, 0)');shape.setAttribute('stroke','rgba(0, 0, 0, 0)');}
  return svg.outerHTML;
 },{nativeId:lane.nativeId,kind});
}
async function hideLiniCaptionText(page:Page,plan:PresentationPlan,svg:string){
 const lane=plan.elementMap.find(item=>item.kind==='group');if(!lane)throw Error('Lini caption control requires a mapped group.');await install(page,svg);
 return page.locator('#frame svg').evaluate((root,nativeId)=>{
  const svg=root as SVGSVGElement,carrier=svg.querySelector<SVGGElement>(`g.lini-node.lini-group[data-id="${nativeId}"]`),text=carrier?.querySelector<SVGTextElement>(':scope > g.lini-caption text.lini-text');
  if(!text)throw Error(`Lini group ${nativeId} has no source-owned caption text.`);text.style.visibility='hidden';return svg.outerHTML;
 },lane.nativeId);
}
async function mutateCarrier(page:Page,plan:PresentationPlan,kind:'node'|'group',operation:'hide-outline'|'phantom'){
 const row=plan.elementMap.find(item=>item.kind===kind);if(!row)throw Error(`Missing mapped ${kind} in generic lane proof input.`);
 return page.locator('#frame svg').evaluate((svg,{backend,nativeId,operation,kind})=>{
  const root=svg as SVGSVGElement;
  const carrier=backend==='graphviz'?[...root.querySelectorAll<SVGGElement>(kind==='group'?'g.cluster':'g.node')].find(group=>group.querySelector(':scope > title')?.textContent?.trim()===(kind==='group'?'cluster_':'')+nativeId):backend==='mermaid'?[...root.querySelectorAll<SVGGElement>(kind==='group'?'g.cluster':'g.node')].find(group=>group.id===nativeId||group.id.endsWith('-'+nativeId)||group.id.includes(`-${nativeId}-`)):root.querySelector<SVGGElement>(`g[data-id="${nativeId}"]`);
  if(!carrier)throw Error(`Native ${kind} carrier ${nativeId} is absent.`);
  if(operation==='hide-outline'){
   const shape=carrier.querySelector<SVGElement>('polygon,path,rect');if(!shape)throw Error(`Native ${kind} outline is absent.`);shape.setAttribute('fill','none');shape.setAttribute('stroke','none');shape.setAttribute('opacity','0');
  }else{
   const clone=carrier.cloneNode(true) as SVGGElement;clone.id=carrier.id+'-phantom';
   if(kind==='group'){
    const descendants=backend==='lini'?'g.lini-node':'g.cluster,g.node';clone.querySelectorAll(descendants).forEach(element=>element.remove());
    const title=clone.querySelector(':scope > title');if(title)title.textContent='cluster_phantom_'+nativeId;
   }
   if(clone.hasAttribute('data-id'))clone.setAttribute('data-id',nativeId+'-phantom');root.appendChild(clone);
  }
  return root.outerHTML;
 },{backend:plan.backend,nativeId:row.nativeId,operation,kind});
}
async function wrongMembership(page:Page,plan:PresentationPlan,visual:Visual,rendered:{svg:string;nativeAst:unknown}){
 const node=visual.nodes!.find(item=>item.group),target=visual.groups!.find(group=>group.id!==node?.group);if(!node||!target)throw Error('Lane proof fixture needs a grouped node and a second lane.');
 const nodeId=plan.elementMap.find(item=>item.kind==='node'&&item.logicalId===node.id)!.nativeId,groupId=plan.elementMap.find(item=>item.kind==='group'&&item.logicalId===target.id)!.nativeId;
 if(plan.backend==='graphviz'){
  const ast=structuredClone(rendered.nativeAst) as {objects?:Record<string,unknown>[]};const objects=ast.objects??[];
  const cluster=objects.find(object=>object.name===`cluster_${groupId}`),record=objects.find(object=>object.name===nodeId);
  if(!cluster||!record)throw Error('Graphviz native AST lacks the mapped node or target lane.');
  const gvid=record._gvid;if(typeof gvid!=='number')throw Error('Graphviz native node has no object identity.');
  const memberships=objects.filter(object=>typeof object.name==='string'&&object.name.startsWith('cluster_'));let removed=0;
  for(const owner of memberships){const memberIds=owner.nodes;if(Array.isArray(memberIds)){const filtered=memberIds.filter(id=>id!==gvid);removed+=memberIds.length-filtered.length;owner.nodes=filtered;}}
  cluster.nodes=[...(Array.isArray(cluster.nodes)?cluster.nodes:[]),gvid];if(removed===0)throw Error('Graphviz native node had no lane membership to corrupt.');
  return{svg:rendered.svg,nativeAst:ast};
 }
 if(plan.backend==='mermaid'){
  const lines=plan.source.split('\n'),nodeLine=lines.findIndex(line=>new RegExp(`^\\s*${escapeRegExp(nodeId)}\\s*(?:\\[|@\\{)`,'u').test(line));
  if(nodeLine<0)throw Error('Mermaid source lacks the mapped node declaration.');
  const [declaration]=lines.splice(nodeLine,1),start=lines.findIndex(line=>new RegExp(`^\\s*subgraph\\s+${escapeRegExp(groupId)}\\b`,'u').test(line));
  if(start<0)throw Error('Mermaid source lacks the mapped target lane.');
  let depth=0,end=-1;for(let index=start;index<lines.length;index++){if(/^\s*subgraph\b/u.test(lines[index]!))depth++;if(/^\s*end\s*$/u.test(lines[index]!)){depth--;if(depth===0){end=index;break;}}}
  if(end<0)throw Error('Mermaid target lane has no matching end.');lines.splice(end,0,declaration!);const source=lines.join('\n');if(source===plan.source)throw Error('Mermaid lane membership mutation did not change native source.');
  return{svg:(await mermaidSvg(page,source,'lanes-wrong-membership')).svg,nativeAst:source};
 }
 const markup=await page.locator('#frame svg').evaluate((svg,{nodeId,groupId})=>{
  const root=svg as SVGSVGElement,nodeCarrier=root.querySelector<SVGGElement>(`g.lini-node[data-id="${nodeId}"]`),laneCarrier=root.querySelector<SVGGElement>(`g.lini-group[data-id="${groupId}"]`);
  if(!nodeCarrier||!laneCarrier)throw Error('Lini native node or target lane is absent.');if(nodeCarrier.parentNode===laneCarrier)throw Error('Lini node already belongs to the selected alternate lane.');laneCarrier.appendChild(nodeCarrier);return root.outerHTML;
 },{nodeId,groupId});
 return{svg:markup,nativeAst:rendered.nativeAst};
}

test('native lane proof accepts generic counts, renamed IDs, and nested subgroups on all backends',async()=>{
 const base=getVisual(sourceDocument)! as Visual;
 const variants:[string,Visual][]=[['different-count',(()=>{const copy=structuredClone(base);copy.groups=copy.groups?.slice(0,3);copy.nodes=copy.nodes?.filter(node=>node.group!==base.groups?.[3]?.id);copy.edges=copy.edges?.filter(edge=>copy.nodes?.some(node=>node.id===edge.from)&&copy.nodes?.some(node=>node.id===edge.to));delete copy.steps;return copy;})()],['renamed-IDs',renamedVisual(base)],['nested-subgroup',{id:'compact-nested-lanes',kind:'flow',form:'lanes',question:'Nested lanes',groups:[{id:'lane_a',label:'Lane A',role:'lane'},{id:'nested_boundary',label:'Inner boundary',role:'boundary',parent:'lane_a'},{id:'lane_b',label:'Lane B',role:'lane'}],nodes:[{id:'person',label:'Person',group:'nested_boundary'},{id:'service',label:'Service',group:'lane_a'},{id:'storage',label:'Storage',group:'lane_b'}],edges:[{id:'request',from:'person',to:'service',label:'requests'},{id:'store',from:'service',to:'storage',label:'stores'}]} as Visual]];
 for(const [variant,visual] of variants){
  const document=createVisualDocument(visual,`visual:${variant}`,'1.4.0');
  for(const backend of ['graphviz','mermaid','lini'] as const){
   const plan=compilePresentation(document,{backend,theme:'presentation/1'});expect(plan.ok,`${variant}/${backend}`).toBe(true);if(!plan.ok)continue;
   const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
   try{
    const rendered=await native(backend,plan,page);const strict=await verifyPresentationQuality(page,{svg:rendered.svg,document,plan,nativeAst:rendered.nativeAst});
    for(const required of requiredPresentationChecks(backend,visual)){const check=strict.find(item=>item.check===required);expect(check?.result,`${variant}/${backend}/${required}: ${check?.details??'missing check'}`).toBe('pass');}
    expect(strict.filter(check=>check.result==='fail'),`${variant}/${backend}: ${JSON.stringify(strict.filter(check=>check.result==='fail'))}`).toEqual([]);
    const lane=laneCheck(strict);expect(lane?.result,`${variant}/${backend} lane proof`).toBe('pass');
   }finally{await page.close();}
  }
 }
},{timeout:90_000});

test('native Lini lanes proof recognizes authored cylinders and rejects phantom, duplicate, misparented, or alternate shapes',async()=>{
 const document=readVisualDocument(readFileSync('fixtures/visual/inventory/helix-field-guide.json','utf8'),'json') as Document,base=getVisual(document)! as Visual;
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 try{
  for(const[name,visual]of[['authored',base],['renamed-mixed-shapes',renamedVisual(base)]] as const){
   const doc=name==='authored'?document:createVisualDocument(visual,'visual:renamed-field-guide','1.4.0'),plan=compilePresentation(doc,{backend:'lini',theme:'presentation/1'});expect(plan.ok,name).toBe(true);if(!plan.ok)continue;
   const rendered=await renderPresentationLini(plan.source);await install(page,rendered.svg);const checks=await verifyLanesPresentationQuality(page,{plan,visual,nativeAst:rendered.nativeAst});expect(laneCheck(checks)?.result,`${name}: ${laneCheck(checks)?.details}`).toBe('pass');
   for(const node of visual.nodes?.filter(node=>node.role==='store')??[]){const id=plan.elementMap.find(item=>item.kind==='node'&&item.logicalId===node.id)!.nativeId;expect(await page.locator(`g.lini-node[data-id="${id}"].lini-cyl`).count(),`${name}/${node.id}`).toBe(1);}
  }
  const plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)return;const rendered=await renderPresentationLini(plan.source),store=base.nodes!.find(node=>node.role==='store')!,nativeId=plan.elementMap.find(item=>item.kind==='node'&&item.logicalId===store.id)!.nativeId;
  for(const kind of ['wrong-class','shape-mismatch','duplicate','phantom','misparent'] as const){
   await install(page,rendered.svg);
   const svg=await page.locator('#frame svg').evaluate((root,{kind,nativeId})=>{
    const svg=root as SVGSVGElement,carrier=svg.querySelector<SVGGElement>(`g.lini-node[data-id="${nativeId}"]`);if(!carrier)throw Error('Mapped cylinder carrier is absent.');
    if(kind==='wrong-class'){carrier.classList.remove('lini-cyl');carrier.classList.add('lini-cylinder');}
    else if(kind==='shape-mismatch'){carrier.classList.remove('lini-cyl');carrier.classList.add('lini-box');}
    else if(kind==='duplicate')carrier.parentElement?.appendChild(carrier.cloneNode(true));
    else if(kind==='phantom'){const phantom=carrier.cloneNode(true) as SVGGElement;phantom.setAttribute('data-id','unmapped-cylinder');carrier.parentElement?.appendChild(phantom);}
    else{const parent=carrier.parentElement,target=[...svg.querySelectorAll<SVGGElement>('g.lini-node.lini-group[data-id]')].find(group=>!group.isSameNode(parent));if(!target)throw Error('Alternate lane is unavailable.');target.appendChild(carrier);}
    return svg.outerHTML;
   },{kind,nativeId});await install(page,svg);const checks=await verifyLanesPresentationQuality(page,{plan,visual:base,nativeAst:rendered.nativeAst});expect(laneCheck(checks)?.result,kind).toBe('fail');
  }
 }finally{await page.close();}
},{timeout:60_000});

test('native Lini lane details preserve derived multiline words and fail for missing, hidden, or misowned text leaves',async()=>{
 const document=readVisualDocument(readFileSync('fixtures/reviews/definitions/helix-field-guide.json','utf8'),'json') as Document,visual=getVisual(document)! as Visual,plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)return;
 const rendered=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 try{
  await install(page,rendered.svg);const baseline=await verifyLanesPresentationQuality(page,{plan,visual,nativeAst:rendered.nativeAst});expect(laneCheck(baseline)?.result,`${laneCheck(baseline)?.details}`).toBe('pass');
  const first=visual.nodes![0]!,nativeId=plan.elementMap.find(item=>item.kind==='node'&&item.logicalId===first.id)!.nativeId;
  for(const mutation of ['missing-word','hidden-leaf','rgba-alpha','modern-alpha','root-opacity','wrong-owner'] as const){
   await install(page,rendered.svg);
   await page.locator('#frame svg').evaluate((root,{mutation,nativeId})=>{
    const svg=root as SVGSVGElement,owner=svg.querySelector<SVGGElement>(`g.lini-node[data-id="${nativeId}"]`),cell=owner?.querySelector<SVGGElement>(':scope > g.lini-cell');if(!owner||!cell)throw Error('Source-owned multiline detail carrier is absent.');
    if(mutation==='root-opacity'){svg.style.opacity='0';return;}
    const leaves=[...cell.querySelectorAll<SVGTSpanElement>('text.lini-text > tspan')];if(leaves.length<2)throw Error('Expected multiline detail SVG to use distinct text leaves.');
    if(mutation==='missing-word')leaves.at(-1)!.textContent='word removed';
    else if(mutation==='hidden-leaf')leaves[0]!.setAttribute('opacity','0');
    else if(mutation==='rgba-alpha')leaves[0]!.style.setProperty('fill','rgba(0, 0, 0, 0)');
    else if(mutation==='modern-alpha')leaves[0]!.style.setProperty('fill','color(srgb 0 0 0 / 0)');
    else{const target=[...svg.querySelectorAll<SVGGElement>('g.lini-node[data-id]')].find(node=>node!==owner&&!node.classList.contains('lini-group')&&!node.classList.contains('lini-cell'));if(!target)throw Error('Alternate node owner is unavailable.');target.appendChild(cell);}
   },{mutation,nativeId});
   const checks=await verifyLanesPresentationQuality(page,{plan,visual,nativeAst:rendered.nativeAst});expect(laneCheck(checks)?.result,mutation).toBe('fail');
  }
 }finally{await page.close();}
},{timeout:45_000});

test('native lane proof rejects forged membership, hidden outlines, and phantom nodes and groups across backends',async()=>{
 const document=sourceDocument,visual=getVisual(document)! as Visual;
 for(const backend of ['graphviz','mermaid','lini'] as const){
  const plan=compilePresentation(document,{backend,theme:'presentation/1'});expect(plan.ok,backend).toBe(true);if(!plan.ok)continue;
  const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
  try{
   const rendered=await native(backend,plan,page);
   const baseline=await verifyPresentationQuality(page,{svg:rendered.svg,document,plan,nativeAst:rendered.nativeAst});
   expect(baseline.filter(check=>check.result==='fail'),backend).toEqual([]);expect(laneCheck(baseline)?.result,backend).toBe('pass');
   if(backend==='lini'){
    const blackStroke=await mutateLiniBoundary(page,plan,rendered.svg,'black-stroke');expect(blackStroke).not.toBe(rendered.svg);await install(page,blackStroke);
    const outlineChecks=await verifyLanesPresentationQuality(page,{plan,visual,nativeAst:rendered.nativeAst});expect(laneCheck(outlineChecks)?.result,'lini/black-stroke-transparent-fill').toBe('pass');
    const transparent=await mutateLiniBoundary(page,plan,rendered.svg,'transparent-alpha');expect(transparent).not.toBe(rendered.svg);await install(page,transparent);
    const transparentChecks=await verifyLanesPresentationQuality(page,{plan,visual,nativeAst:rendered.nativeAst});expect(laneCheck(transparentChecks)?.result,'lini/transparent-alpha-outline').toBe('fail');
    const hiddenCaption=await hideLiniCaptionText(page,plan,rendered.svg);expect(hiddenCaption).not.toBe(rendered.svg);await install(page,hiddenCaption);
    const captionChecks=await verifyLanesPresentationQuality(page,{plan,visual,nativeAst:rendered.nativeAst});expect(laneCheck(captionChecks)?.result,'lini/hidden-owned-caption-text').toBe('fail');
   }
   for(const mutation of ['hidden-outline','phantom-node'] as const){
    await install(page,rendered.svg);const kind=mutation==='hidden-outline'?'group':'node';
    const svg=await mutateCarrier(page,plan,kind,mutation==='hidden-outline'?'hide-outline':'phantom');expect(svg,`${backend}/${mutation} mutation applied`).not.toBe(rendered.svg);await install(page,svg);
    const checks=await verifyLanesPresentationQuality(page,{plan,visual,nativeAst:rendered.nativeAst});
    expect(laneCheck(checks)?.result,`${backend}/${mutation}`).toBe('fail');
   }
   await install(page,rendered.svg);const originalNodes=await mappedNodeInventory(page,plan),phantomGroup=await mutateCarrier(page,plan,'group','phantom');expect(phantomGroup).not.toBe(rendered.svg);await install(page,phantomGroup);
   const mutatedNodes=await mappedNodeInventory(page,plan);expect(mutatedNodes,'phantom group leaves mapped node carrier inventory unchanged').toEqual(originalNodes);
   const groupChecks=await verifyLanesPresentationQuality(page,{plan,visual,nativeAst:rendered.nativeAst}),groupFailure=laneCheck(groupChecks);
   expect(groupFailure?.result,`${backend}/phantom-group`).toBe('fail');expect(groupFailure?.details,`${backend}/phantom-group diagnosis`).toMatch(/group/i);
   if(backend==='lini'){
    for(const kind of ['unknown-shape','orphan-text','duplicate-caption'] as const){
     const phantom=await liniPhantom(page,plan,rendered.svg,kind);expect(phantom,`lini/${kind} applied`).not.toBe(rendered.svg);await install(page,phantom);
     const checks=await verifyLanesPresentationQuality(page,{plan,visual,nativeAst:rendered.nativeAst});
     expect(laneCheck(checks)?.result,`lini/${kind}`).toBe('fail');
    }
   }
   await install(page,rendered.svg);const forged=await wrongMembership(page,plan,visual,rendered);await install(page,forged.svg);
   const checks=await verifyLanesPresentationQuality(page,{plan,visual,nativeAst:forged.nativeAst});
   expect(laneCheck(checks)?.result,`${backend}/wrong-membership`).toBe('fail');
  }finally{await page.close();}
 }
},{timeout:90_000});
