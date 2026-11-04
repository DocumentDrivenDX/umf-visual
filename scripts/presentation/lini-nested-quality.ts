// SPDX-License-Identifier: MIT OR Apache-2.0
/** Independent native ownership and geometry checks for Lini nested containment. */
import {createHash} from 'node:crypto';
import type {Page} from 'playwright';
import type {Document} from '@umf/core';
import {getVisual,type Visual} from '../../src/extensions/visual';
import type {PresentationPlan} from '../../src/presentation';
import type {PresentationQualityCheck} from './quality';

type Box={x:number;y:number;width:number;height:number};
const sha=(value:string)=>createHash('sha256').update(Buffer.from(value,'utf8')).digest('hex');
const normalized=(value:string)=>value.replace(/\s+/gu,' ').trim();
const pass=(check:string,sourceSha256:string,ok:boolean,details:string):PresentationQualityCheck=>({check,sourceSha256,result:ok?'pass':'fail',details});

export async function verifyLiniNestedPresentationQuality(page:Page,input:{document:Document;plan:PresentationPlan;nativeAst:unknown}):Promise<PresentationQualityCheck[]>{
 const {plan}=input,sourceSha256=sha(plan.source);let visual:Visual|undefined;try{visual=getVisual(input.document);}catch{/* checked below */}
 const nodes=visual?.kind==='structure'&&visual.form==='nested'?visual.nodes??[]:[];
 const rows=plan.elementMap.filter(row=>row.kind==='node');
 const expectedMaps=nodes.map((node,index)=>({logicalId:node.id,sourcePath:`/extensions/umf.visual/nodes/${index}/id`,nativeId:'n'+(index+1)}));
 const expectedAccountedPaths=nodes.flatMap((node,index)=>['label',...(node.parent?['parent']:[]),...(node.detail!==undefined?['detail']:[]),...(node.role!==undefined?['role']:[]),...(node.status!==undefined?['status']:[])].map(field=>`/extensions/umf.visual/nodes/${index}/${field}`));
 const accountedPaths=new Set(plan.approximations.map(item=>item.sourcePath));
 const expectedVisual=[{sourcePath:'/extensions/umf.visual/id',nativeId:'nested-scene'},...(visual?.title?[{sourcePath:'/extensions/umf.visual/title',nativeId:'nested-title'}]:[]),...(visual?.question?[{sourcePath:'/extensions/umf.visual/question',nativeId:'nested-question'}]:[])];
 const visualMaps=plan.elementMap.filter(row=>row.kind==='visual');
 const mapOk=visual?.kind==='structure'&&visual.form==='nested'&&rows.length===nodes.length&&new Set(rows.map(row=>row.logicalId)).size===nodes.length&&expectedMaps.every(expected=>rows.filter(row=>row.logicalId===expected.logicalId).length===1&&rows.some(row=>row.logicalId===expected.logicalId&&row.sourcePath===expected.sourcePath&&row.nativeId===expected.nativeId))&&visualMaps.length===expectedVisual.length&&expectedVisual.every(expected=>visualMaps.filter(row=>row.sourcePath===expected.sourcePath&&row.nativeId===expected.nativeId).length===1)&&expectedAccountedPaths.every(path=>accountedPaths.has(path));
 const noEdgeMaps=plan.elementMap.every(row=>row.kind!=='edge'&&row.kind!=='group');
 const mapDetails=`${rows.length} unique source-node maps for ${nodes.length} declarations; native IDs are source-index based; ${plan.elementMap.filter(row=>row.kind==='edge'||row.kind==='group').length} edge/group mappings.`;
 const mapCheck=pass('lini-nested-source-node-identity',sourceSha256,mapOk&&noEdgeMaps,mapDetails);
 const nativeAst=typeof input.nativeAst==='string'?input.nativeAst:'';
 const nativeAstOk=nodes.length>0&&nodes.every((node,index)=>nativeAst.includes(`|block#n${index+1}| .lini-${nodes.some(child=>child.parent===node.id)?'group':'box'}.lini-block`))&&nativeAst.includes('|block#nested-scene| .lini-group.lini-block');
 const astCheck=pass('lini-native-ast',sourceSha256,nativeAstOk,nativeAstOk?`Pinned native AST contains the ${nodes.length} source-index node container/box declarations and one renderer scene wrapper.`:'Native AST is missing a mapped nested container or leaf declaration.');
 if(!visual||visual.kind!=='structure'||visual.form!=='nested')return[astCheck,pass('lini-native-carriers',sourceSha256,false,'Document is not a structure/nested visual.'),mapCheck,pass('lini-nested-parent-containment',sourceSha256,false,'Document is not a structure/nested visual.')];
 const rootDirection=/\|group#nested-roots\|\s+""\s+\{[^}]*direction:\s*(row|column)/u.exec(plan.source)?.[1]??'row';
 const rootOrder=visual.layout?.order;
 const detail=await page.locator('#frame svg').evaluate((svg,source)=>{
  const{nodes:sourceNodes,sourceTitle,sourceQuestion,rootDirection,rootOrder}=source;
  type Row={id:string;parent?:string;label:string;detail?:string;role?:string;status?:string};
  const norm=(s:string)=>s.replace(/\s+/gu,' ').trim();
  const visible=(element:Element)=>{
   let current:Element|null=element;
   while(current){const style=getComputedStyle(current);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;current=current.parentElement;}
   const bounds=(element as SVGGraphicsElement).getBoundingClientRect();return bounds.width>0&&bounds.height>0;
  };
  const visibleText=(element:Element)=>{
   const lines=Array.from(element.querySelectorAll('tspan')).filter(visible).map(line=>line.textContent??'');
   return norm(lines.length?lines.join(' '):element.textContent??'');
  };
  const directTexts=(owner:Element)=>[...Array.from(owner.children).filter(child=>child.tagName.toLowerCase()==='text'&&child.classList.contains('lini-text')), ...Array.from(owner.querySelectorAll(':scope > g.lini-caption > text.lini-text'))].filter(visible).map(visibleText);
  const frame=(owner:Element):DOMRect|null=>{const rect=owner.querySelector(':scope > rect');if(!rect||!visible(rect))return null;return rect.getBoundingClientRect();};
  const contains=(outer:DOMRect,inner:DOMRect,margin=1)=>inner.left>=outer.left+margin&&inner.top>=outer.top+margin&&inner.right<=outer.right-margin&&inner.bottom<=outer.bottom-margin;
  const failures:string[]=[],ids=new Map(sourceNodes.map((node,index)=>[node.id,'n'+(index+1)])),mappedIds=new Set(Array.from(ids.values()));
  const carriers=new Map<string,Element>();
  for(const [index,node] of sourceNodes.entries()){
   const id=ids.get(node.id)!,owner=svg.querySelector(`[data-id="${id}"]`);
   const childCount=sourceNodes.filter(candidate=>candidate.parent===node.id).length;
   if(!owner){failures.push(`${node.id} native carrier ${id} is missing`);continue;}
   if(svg.querySelectorAll(`[data-id="${id}"]`).length!==1)failures.push(`${node.id} native carrier ${id} is duplicated`);
   carriers.set(node.id,owner);
   const classes=owner.classList;
   if(childCount?!classes.contains('lini-group'):!classes.contains('lini-box'))failures.push(`${node.id} must be an actual ${childCount?'container':'leaf box'} carrier`);
   const ownTexts=directTexts(owner);
   if(!ownTexts.includes(norm(node.label)))failures.push(`${node.id} native container/box does not visibly own its exact label`);
   for(const field of ['detail','role','status'] as const){
    const value=node[field];if(value===undefined)continue;
    const cell=svg.querySelector(`[data-id="${id}-${field}"]`);
    const text=field==='role'?'Role: '+value:field==='status'?'Status: '+value:value;
    let nearest:Element|null=cell?.parentElement?.closest('[data-id]')??null;
    while(nearest&&!mappedIds.has(nearest.getAttribute('data-id')??''))nearest=nearest.parentElement?.closest('[data-id]')??null;
    if(!cell||!owner.contains(cell)||nearest!==owner||!visible(cell)||!directTexts(cell).includes(norm(text)))failures.push(`${node.id} does not visibly own exact ${field} text in its mapped carrier`);
   }
   if(node.parent){
    const parent=carriers.get(node.parent)??svg.querySelector(`[data-id="${ids.get(node.parent)}"]`);
    if(!parent||!parent.contains(owner))failures.push(`${node.id} is not natively nested inside its declared parent ${node.parent}`);
    let nearest:Element|null=owner.parentElement?.closest('g.lini-group[data-id]')??null;
    while(nearest&&!mappedIds.has(nearest.getAttribute('data-id')??''))nearest=nearest.parentElement?.closest('g.lini-group[data-id]')??null;
    if(nearest?.getAttribute('data-id')!==ids.get(node.parent))failures.push(`${node.id} nearest mapped native container does not match its declared parent`);
    const parentFrame=parent?frame(parent):null,childBounds=(owner as SVGGraphicsElement).getBoundingClientRect();
    if(!parentFrame||!contains(parentFrame,childBounds,1))failures.push(`${node.id} is outside the visible bounds of its declared parent`);
   }
  }
  for(const parent of sourceNodes.filter(node=>sourceNodes.some(child=>child.parent===node.id))){
   const siblings=sourceNodes.filter(child=>child.parent===parent.id).map(child=>carriers.get(child.id)).filter((item):item is Element=>!!item);
   for(let i=0;i<siblings.length;i++)for(let j=i+1;j<siblings.length;j++){
    const a=(siblings[i] as SVGGraphicsElement).getBoundingClientRect(),b=(siblings[j] as SVGGraphicsElement).getBoundingClientRect();
    if(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1)failures.push(`${parent.id} sibling node carriers overlap`);
   }
  }
  const links=svg.querySelectorAll('g.lini-link,.lini-link');if(links.length)failures.push(`${links.length} native connectors appeared in a containment-only view`);
  const title=svg.querySelector('[data-id="nested-title"]'),question=svg.querySelector('[data-id="nested-question"]');
  if(sourceTitle&&(!title||!visible(title)||!directTexts(title).includes(norm(sourceTitle))))failures.push('Native visual title is not visibly owned by its mapped title carrier');
  if(sourceQuestion&&(!question||!visible(question)||!directTexts(question).includes(norm(sourceQuestion))))failures.push('Native question is not visibly owned by its mapped question carrier');
  const helpers=Array.from(svg.querySelectorAll('g.lini-group[data-id]')).filter(element=>!mappedIds.has(element.getAttribute('data-id')??''));
  for(const helper of helpers){if(directTexts(helper).some(Boolean))failures.push(`renderer helper ${helper.getAttribute('data-id')} has a visible label`);}
  const knownHelpers=new Set(['nested-scene','nested-roots',...(sourceTitle?['nested-title']:[]),...(sourceQuestion?['nested-question']:[])]);
  const expectedCarrierIds=new Set(mappedIds);
  for(const [index,node]of sourceNodes.entries()){
   const id='n'+(index+1);
   if(node.detail!==undefined)expectedCarrierIds.add(id+'-detail');
   if(node.role!==undefined){expectedCarrierIds.add(id+'-role');knownHelpers.add(id+'-metadata');}
   if(node.status!==undefined){expectedCarrierIds.add(id+'-status');knownHelpers.add(id+'-metadata');}
   if(sourceNodes.some(child=>child.parent===node.id))knownHelpers.add(id+'-children');
  }
  expectedCarrierIds.forEach(id=>knownHelpers.delete(id));
  const allExpectedCarrierIds=new Set([...expectedCarrierIds,...knownHelpers]);
  const nodeCarrierIds=Array.from(svg.querySelectorAll('g.lini-node[data-id]')).map(element=>element.getAttribute('data-id')??'');
  const unexpected=nodeCarrierIds.filter(id=>!allExpectedCarrierIds.has(id));
  const missing=[...allExpectedCarrierIds].filter(id=>!nodeCarrierIds.includes(id));
  const duplicates=nodeCarrierIds.filter((id,index)=>nodeCarrierIds.indexOf(id)!==index);
  if(unexpected.length)failures.push(`unmapped native node/container/text carrier(s): ${unexpected.join(', ')}`);
  if(missing.length)failures.push(`expected native node/container/text carrier(s) are missing: ${missing.join(', ')}`);
  if(duplicates.length)failures.push(`duplicate native node/container/text carrier IDs: ${[...new Set(duplicates)].join(', ')}`);
  for(const parent of sourceNodes.filter(node=>sourceNodes.some(child=>child.parent===node.id))){
   const owner=carriers.get(parent.id);if(!owner)continue;const parentTexts=Array.from(owner.querySelectorAll(':scope > g.lini-caption > text.lini-text')).filter(visible);
   const label=parentTexts.find(text=>norm(text.textContent??'')===norm(parent.label));if(!label)continue;const labelBounds=(label as SVGGraphicsElement).getBoundingClientRect();
   for(const child of sourceNodes.filter(candidate=>candidate.parent===parent.id)){const childOwner=carriers.get(child.id),childBounds=childOwner?(childOwner as SVGGraphicsElement).getBoundingClientRect():null;if(childBounds&&labelBounds.left<childBounds.right&&childBounds.left<labelBounds.right&&labelBounds.top<childBounds.bottom&&childBounds.top<labelBounds.bottom)failures.push(`${parent.id} label overlaps child container ${child.id}`);}
  }
  const rootDepth=(node:Row):number=>{let depth=0,current=node;while(current.parent){const parent=sourceNodes.find(candidate=>candidate.id===current.parent);if(!parent)break;depth++;current=parent;}return depth;};
  for(const parent of sourceNodes){const children=sourceNodes.filter(node=>node.parent===parent.id),depth=rootDepth(parent),axis=depth%2===0?rootDirection:(rootDirection==='row'?'column':'row');let last=-Infinity;for(const child of children){const owner=carriers.get(child.id);if(!owner)continue;const bounds=(owner as SVGGraphicsElement).getBoundingClientRect(),center=axis==='row'?bounds.left+bounds.width/2:bounds.top+bounds.height/2;if(center<=last+1)failures.push(`${parent.id} child containers do not preserve source order on the ${axis} axis`);last=center;}}
  const roots=sourceNodes.filter(node=>node.parent===undefined),rootRank=new Map((rootOrder??[]).map((id,index)=>[id,index]));
  const expectedRoots=roots.map((node,index)=>({node,index})).sort((a,b)=>(rootRank.get(a.node.id)??Number.MAX_SAFE_INTEGER)-(rootRank.get(b.node.id)??Number.MAX_SAFE_INTEGER)||a.index-b.index).map(row=>row.node);
  let lastRoot=-Infinity;for(const root of expectedRoots){const owner=carriers.get(root.id);if(!owner)continue;const bounds=(owner as SVGGraphicsElement).getBoundingClientRect(),center=rootDirection==='row'?bounds.left+bounds.width/2:bounds.top+bounds.height/2;if(center<=lastRoot+1)failures.push('root containers do not preserve authored order on the selected axis');lastRoot=center;}
  return{failures,helperCount:helpers.length,nodeCount:carriers.size,svgViewBox:svg.getAttribute('viewBox')};
 },{nodes:nodes.map(node=>({id:node.id,parent:node.parent,label:node.label,detail:node.detail,role:node.role,status:node.status})),sourceTitle:visual.title,sourceQuestion:visual.question,rootDirection,rootOrder});
 const okay=detail.failures.length===0&&detail.nodeCount===nodes.length;
 const carriers=pass('lini-native-carriers',sourceSha256,detail.failures.filter(problem=>problem.includes('visibly own')||problem.includes('carrier')).length===0,detail.failures.filter(problem=>problem.includes('visibly own')||problem.includes('carrier')).join('; ')||`${detail.nodeCount} mapped native parent/leaf carriers visibly own their exact labels and metadata.`);
 const containment=pass('lini-nested-parent-containment',sourceSha256,okay,okay?`${detail.nodeCount} node carriers preserve exact parent nesting, visible source text, and nonoverlapping sibling bounds; ${detail.helperCount} unlabeled renderer helpers, no connectors.`:detail.failures.join('; '));
 return[astCheck,carriers,mapCheck,containment];
}
