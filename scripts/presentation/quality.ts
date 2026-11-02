// SPDX-License-Identifier: MIT OR Apache-2.0
/** Independent checks against the native AST and the renderer's own SVG carriers. */
import {createHash} from 'node:crypto';
import type {Page} from 'playwright';
import type {Document} from '@umf/core';
import {getVisual,type Visual,type VisualMultiplicity} from '../../src/extensions/visual';
import type {PresentationElement,PresentationPlan} from '../../src/presentation';

export interface PresentationQualityCheck {
 check:string;
 sourceSha256:string;
 result:'pass'|'fail';
 details:string;
}

type NativeAst={objects?:Record<string,unknown>[];edges?:Record<string,unknown>[]};
const sha=(s:string)=>createHash('sha256').update(Buffer.from(s,'utf8')).digest('hex');
const pass=(check:string,sourceSha256:string,ok:boolean,details:string):PresentationQualityCheck=>({check,sourceSha256,result:ok?'pass':'fail',details});
const text=(v:unknown)=>typeof v==='string'?v:'';
const norm=(s:string)=>s.replace(/\s+/g,' ').trim();
const normLabel=(s:string)=>norm(s).replace(/\s*\/\s*/g,'/');
const decodeDotLabel=(s:string)=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n:string)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n:string)=>String.fromCodePoint(parseInt(n,16)));
const escRe=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const exactFieldText=(candidate:string,name:string,type:string|undefined)=>{
 const value=norm(candidate.replace(/\u00a0/g,' '));
 if(!type)return value===norm(name);
 return new RegExp(`(?:^|\\s)${escRe(name)}\\s*:\\s*${escRe(type)}(?:$|\\s)`).test(value);
};
const dotRowHasMarker=(row:string,marker:string)=>decodeDotLabel(row.replace(/<[^>]*>/g,' ')).split('·').map(norm).some(part=>part===marker||part.startsWith(marker+' '));
const elementFor=(plan:PresentationPlan,kind:PresentationElement['kind'],sourcePath:string)=>plan.elementMap.find(e=>e.kind===kind&&e.sourcePath===sourcePath);
const objectName=(o:Record<string,unknown>)=>text(o.name);
const nativeIdForNode=(plan:PresentationPlan,id:string)=>plan.elementMap.find(e=>e.kind==='node'&&e.logicalId===id)?.nativeId
 ??plan.elementMap.find(e=>e.kind==='entity'&&e.logicalId===id)?.nativeId;
const portFor=(plan:PresentationPlan,nodeId:string,field:string|undefined,visual:Visual)=>{
 if(!field)return undefined;
 const entityIndex=(visual.structure?.entities??[]).findIndex(e=>e.node===nodeId);
 const entity=(visual.structure?.entities??[])[entityIndex];if(!entity)return undefined;
 const fieldIndex=entity.fields.findIndex(f=>f.id===field||f.name===field);if(fieldIndex<0)return undefined;
 return elementFor(plan,'field',`/extensions/umf.visual/structure/entities/${entityIndex}/fields/${fieldIndex}`)?.nativeId;
};

/**
 * Checks that source-bound records have native carriers and that rendered geometry
 * remains usable at the declared 1600×900 presentation viewport. The verifier never
 * accepts a word elsewhere in the SVG as evidence for an element.
 */
export async function verifyPresentationQuality(
 page:Page,
 input:{svg:string;document:Document;plan:PresentationPlan;nativeAst?:unknown},
):Promise<PresentationQualityCheck[]> {
 const {svg,document,plan}=input,sourceSha256=sha(plan.source),checks:PresentationQualityCheck[]=[];
 let visual:Visual|undefined;
 try{visual=getVisual(document);}catch{/* reported below */}
 checks.push(pass('native-source-hash',sourceSha256,sourceSha256.length===64,`SHA-256 of ${new TextEncoder().encode(plan.source).length} UTF-8 source bytes.`));
 checks.push(pass('document-visual-present',sourceSha256,!!visual,'The supplied UMF document contains a readable umf.visual payload.'));
 if(!visual){return checks;}

 // Native SVG inspection is isolated in the page and uses object ownership / bounds.
 await page.setViewportSize({width:1600,height:900});
 await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:#fff}#frame{width:1600px;height:900px;display:flex;align-items:center;justify-content:center}#frame svg{display:block;max-width:1600px;max-height:900px;width:auto;height:auto}</style><div id="frame"></div>',{waitUntil:'domcontentloaded'});
 await page.locator('#frame').evaluate((el,markup)=>{el.innerHTML=markup;},svg);
 const dom=await page.locator('#frame svg').evaluate((root)=>{
  const s=root as SVGSVGElement,view=s.viewBox.baseVal,rootRect=s.getBoundingClientRect();
  const normalize=(s:string)=>s.replace(/\s+/g,' ').trim();
  const visibleText=(el:Element)=>{
   // Mermaid commonly wraps a single visible label across HTML <br> elements
   // inside foreignObject. `textContent` erases those visual separators and can
   // make "target projection" appear as "targetprojection" to this verifier.
   const html=(el.matches('foreignObject')?el.querySelector('div,p,span'):el) as HTMLElement|null;
   if(html&&typeof html.innerText==='string')return normalize(html.innerText);
   const collect=(node:Node):string=>{
    if(node.nodeType===Node.TEXT_NODE)return node.nodeValue??'';
    if(node.nodeType!==Node.ELEMENT_NODE)return '';
    const element=node as Element,tag=element.tagName.toLowerCase();
    if(tag==='br')return ' ';
    let value='';
    for(const child of [...node.childNodes]){
     if(child instanceof Element&&child.tagName.toLowerCase()==='tspan'&&value&& (child.hasAttribute('dy')||child.hasAttribute('x')))value+=' ';
     value+=collect(child);
    }
    return value;
   };
   return normalize(collect(el));
  };
  const box=(el:Element)=>{const r=el.getBoundingClientRect();return{x:r.x-rootRect.x,y:r.y-rootRect.y,width:r.width,height:r.height};};
  const titleOf=(g:Element)=>normalize(g.querySelector(':scope > title')?.textContent??'');
  const carriers=[...s.querySelectorAll('g.node,g.cluster,g.edge')].map(g=>({
   cls:g.getAttribute('class')??'',title:titleOf(g),id:g.getAttribute('id')??'',
   ancestorClusters:(()=>{const ids:string[]=[];let p=g.parentElement;while(p&&p.tagName.toLowerCase()!=='svg'){if(p.matches('g.cluster'))ids.push(p.getAttribute('id')??'');p=p.parentElement;}return ids;})(),
   ownText:[...g.querySelectorAll('text,foreignObject')].filter(el=>el.closest('g.node,g.cluster,g.edge')===g).map(visibleText).filter(Boolean),
   ownTextDetails:[...g.querySelectorAll('text,foreignObject')].filter(el=>el.closest('g.node,g.cluster,g.edge')===g).map(el=>({value:visibleText(el),bounds:box(el)})).filter(x=>x.value),
   bounds:box(g),
   polygon:g.querySelector(':scope > polygon')?box(g.querySelector(':scope > polygon')!):null,
   paths:[...g.querySelectorAll(':scope > path')].map(p=>{
    const path=p as SVGPathElement,point=(at:number)=>{try{const q=path.getPointAtLength(at),screen=new DOMPoint(q.x,q.y).matrixTransform(path.getScreenCTM()!);return{x:screen.x-rootRect.x,y:screen.y-rootRect.y};}catch{return null;}};
    const length=path.getTotalLength();return{d:path.getAttribute('d')??'',markerEnd:path.getAttribute('marker-end'),bounds:box(p),start:point(0),end:point(length)};
   }),
   arrow:g.querySelector(':scope > polygon')!==null,
   fontSizes:[...g.querySelectorAll('text')].map(t=>{const v=parseFloat(getComputedStyle(t).fontSize);return Number.isFinite(v)?v:0;}).filter(v=>v>0),
  }));
  const allText=[...s.querySelectorAll('text,foreignObject')].map(el=>({value:visibleText(el),bounds:box(el),size:el instanceof SVGTextElement?parseFloat(getComputedStyle(el).fontSize):parseFloat(getComputedStyle(el).fontSize),owner:(el.closest('g.node,g.cluster,g.edge')?.querySelector(':scope > title')?.textContent??'').trim()})).filter(x=>x.value);
  const paths=[...s.querySelectorAll('path[data-edge="true"]')].map(p=>{
   const path=p as SVGPathElement,point=(at:number)=>{try{const q=path.getPointAtLength(at),screen=new DOMPoint(q.x,q.y).matrixTransform(path.getScreenCTM()!);return{x:screen.x-rootRect.x,y:screen.y-rootRect.y};}catch{return null;}};
   return{id:path.getAttribute('id')??'',dataId:path.getAttribute('data-id')??'',className:path.getAttribute('class')??'',d:path.getAttribute('d')??'',markerStart:path.getAttribute('marker-start'),markerEnd:path.getAttribute('marker-end'),start:point(0),end:point(path.getTotalLength())};
  });
  const edgeLabels=[...s.querySelectorAll('g.edgeLabel')].map(el=>({id:el.querySelector('g.label')?.getAttribute('data-id')??'',text:visibleText(el)})).filter(x=>x.text);
  return {viewBox:{x:view.x,y:view.y,width:view.width,height:view.height},root:{width:rootRect.width,height:rootRect.height},carriers,allText,paths,edgeLabels};
 });
 const meaningfulSvg=dom.viewBox.width>0&&dom.viewBox.height>0&&svg.includes('<svg');
 checks.push(pass('native-svg-viewbox',sourceSha256,meaningfulSvg,`Native viewBox ${dom.viewBox.width} × ${dom.viewBox.height}; rendered at ${dom.root.width} × ${dom.root.height} CSS px.`));

 if(plan.backend==='graphviz'){
  const ast=input.nativeAst as NativeAst|undefined;
  checks.push(pass('graphviz-native-ast',sourceSha256,!!ast&&Array.isArray(ast.objects)&&Array.isArray(ast.edges),'Graphviz JSON AST is required for endpoint, port, and layout checks.'));
  if(ast&&Array.isArray(ast.objects)&&Array.isArray(ast.edges)){
   const objects=ast.objects,edges=ast.edges;
   const byName=new Map(objects.map(o=>[objectName(o),o]));
   const carrier=(cls:string,title:string)=>dom.carriers.find(c=>c.cls.split(/\s+/).includes(cls)&&c.title===title);
   const fieldPortEntry=(port:string|undefined)=>port?plan.elementMap.find(e=>e.kind==='field'&&e.nativeId===port):undefined;
   const fieldRowForPort=(nodeId:string,port:string|undefined)=>{
    const entry=fieldPortEntry(port),match=entry?.sourcePath.match(/\/structure\/entities\/(\d+)\/fields\/(\d+)$/);
    if(!entry||!match)return undefined;
    const entityIndex=Number(match[1]),fieldIndex=Number(match[2]),entity=visual.structure?.entities?.[entityIndex],field=entity?.fields[fieldIndex];
    const node=carrier('node',nodeId);if(!node||!field||!entity)return undefined;
    const occurrences=entity.fields.slice(0,fieldIndex).filter(f=>f.name===field.name&&f.type===field.type).length;
    return node.ownTextDetails.filter(t=>exactFieldText(t.value,field.name,field.type))[occurrences];
   };
   const missing:string[]=[];
   for(const e of plan.elementMap){
    if(e.kind==='visual'||e.kind==='reference'||e.kind==='field'||e.kind==='edge')continue;
    const title=e.kind==='group'||e.kind==='layer'?'cluster_'+e.nativeId:e.nativeId;
    const cls=e.kind==='group'||e.kind==='layer'?'cluster':'node';
    if(!carrier(cls,title))missing.push(`${e.kind} ${e.nativeId}`);
   }
   const expectedNodeElements=plan.elementMap.filter(e=>e.kind==='node'||e.kind==='entity');
   const astNodeMissing=expectedNodeElements.filter(e=>!byName.has(e.nativeId)).map(e=>e.nativeId);
   if(visual.kind==='flow')for(const node of visual.nodes??[]){
    const id=nativeIdForNode(plan,node.id),nodeSvg=id?carrier('node',id):undefined;
    if(!nodeSvg||!norm(nodeSvg.ownText.join(' ')).includes(norm(node.label)))missing.push(`node label ${node.id}`);
   }
   if(visual.kind==='flow')for(const group of visual.groups??[]){
    const id=plan.elementMap.find(e=>e.kind==='group'&&e.logicalId===group.id)?.nativeId;
    const cluster=id?carrier('cluster','cluster_'+id):undefined;
    if(!cluster||!cluster.ownText.join(' ').includes(group.label)||(group.detail&&!cluster.ownText.join(' ').includes(group.detail)))missing.push(`group label ${group.id}`);
   }
   if(visual.form==='stack')for(const layer of visual.structure?.layers??[]){
    const id=plan.elementMap.find(e=>e.kind==='layer'&&e.logicalId===layer.id)?.nativeId;
    const cluster=id?carrier('cluster','cluster_'+id):undefined;
    if(!cluster||!cluster.ownText.join(' ').includes(layer.label))missing.push(`layer label ${layer.id}`);
   }
   checks.push(pass('graphviz-native-carriers',sourceSha256,missing.length===0&&astNodeMissing.length===0,
    missing.length||astNodeMissing.length?`Missing native carriers: ${[...missing,...astNodeMissing.map(x=>'AST '+x)].join(', ')}.`:`${expectedNodeElements.length} nodes/entities and all mapped groups, layers, and authored edges have their own Graphviz SVG carrier.`));

   const expectedEdges:{id:string;from:string;to:string;fromPort?:string;toPort?:string;directed:boolean;sourcePath:string}[]=[];
   if(visual.kind==='flow'){
    visual.edges?.forEach((e,i)=>{const mapped=elementFor(plan,'edge',`/extensions/umf.visual/edges/${i}`);const from=nativeIdForNode(plan,e.from),to=nativeIdForNode(plan,e.to);if(mapped&&from&&to)expectedEdges.push({id:mapped.nativeId,from,to,directed:true,sourcePath:mapped.sourcePath});});
   }else if(visual.form==='entities'){
    visual.structure?.references?.forEach((r,i)=>{const from=nativeIdForNode(plan,r.from.node),to=nativeIdForNode(plan,r.to.node);if(from&&to)expectedEdges.push({id:`reference-${i+1}`,from,to,fromPort:portFor(plan,r.from.node,r.from.fieldId??r.from.field,visual),toPort:portFor(plan,r.to.node,r.to.fieldId??r.to.field,visual),directed:false,sourcePath:`/extensions/umf.visual/structure/references/${i}`});});
   }
   const objectGvid=new Map(objects.map((o,i)=>[objectName(o),Number(o._gvid??i)]));
   const semanticEdges=edges.filter(e=>{
    const style=text(e.style);return style!=='invis'&&!(Array.isArray(e.style)&&e.style.includes('invis'));
   });
   const endpointFailures:string[]=[];
   const usedSvgEdges=new Set<string>();
   const usedAstEdges=new Set<Record<string,unknown>>();
   for(const exp of expectedEdges){
    let edge=edges.find(e=>!usedAstEdges.has(e)&&text(e.id)===exp.id);
    if(!edge&&plan.nativeFormat==='dot'&&visual.form==='entities'){
     const fromG=objectGvid.get(exp.from),toG=objectGvid.get(exp.to);
     edge=edges.find(e=>!usedAstEdges.has(e)&&Number(e.tail)===fromG&&Number(e.head)===toG&&(!exp.fromPort||text(e.tailport)===exp.fromPort)&&(!exp.toPort||text(e.headport)===exp.toPort));
    }
    if(edge)usedAstEdges.add(edge);
    const tail=objectGvid.get(exp.from),head=objectGvid.get(exp.to);
    if(!edge||Number(edge.tail)!==tail||Number(edge.head)!==head|| (exp.fromPort!==undefined&&text(edge.tailport)!==exp.fromPort)||(exp.toPort!==undefined&&text(edge.headport)!==exp.toPort))endpointFailures.push(`${exp.id} expected ${exp.from}${exp.fromPort?':'+exp.fromPort:''} → ${exp.to}${exp.toPort?':'+exp.toPort:''}`);
    const expectedTitle=`${exp.from}${exp.fromPort?':'+exp.fromPort:''}->${exp.to}${exp.toPort?':'+exp.toPort:''}`;
    const svgEdge=dom.carriers.find(c=>c.cls.split(/\s+/).includes('edge')&&!usedSvgEdges.has(c.id||c.title)&&(c.id===exp.id||c.title===expectedTitle||(!exp.fromPort&&!exp.toPort&&c.title===`${exp.from}->${exp.to}`)));
    if(svgEdge)usedSvgEdges.add(svgEdge.id||svgEdge.title);
    const drawn=svgEdge?.paths.find(p=>p.d.trim()&&p.start&&p.end);
    if(!svgEdge||!drawn||(exp.directed&&!svgEdge.arrow))endpointFailures.push(`${exp.id} has no native SVG path${exp.directed?' and arrow':''}`);
    const authoredLabel=visual.kind==='flow'?visual.edges?.find(e=>elementFor(plan,'edge',exp.sourcePath)?.logicalId===e.id)?.label:visual.structure?.references?.[Number(exp.sourcePath.split('/').at(-1))]?.label;
    if(authoredLabel&&!svgEdge?.ownText.some(t=>norm(t)===norm(authoredLabel)))endpointFailures.push(`${exp.id} label is not owned by its native edge carrier`);
    if(visual.form==='entities'){
     const ref=visual.structure?.references?.[Number(exp.sourcePath.split('/').at(-1))];
     const multiplicity=(m:VisualMultiplicity|undefined,cardinality:string|undefined)=>m?(m.text??`${m.min}..${m.max===undefined?'*':m.max}`):cardinality==='zero-or-one'?'0..1':cardinality==='exactly-one'?'1':cardinality==='zero-or-many'?'0..*':cardinality==='one-or-many'?'1..*':'';
     const ends=ref?[multiplicity(ref.fromMultiplicity,ref.fromCardinality),multiplicity(ref.toMultiplicity,ref.toCardinality)]:[];
     if(ends.some(Boolean)){
      const expected=`(${ends[0]||'unspecified'} → ${ends[1]||'unspecified'})`;
      if(!svgEdge?.ownText.some(t=>norm(t).includes(norm(expected))))endpointFailures.push(`${exp.id} endpoint multiplicities ${expected} are not visible in its own native edge label`);
     }
    }
    if(svgEdge&&drawn){
     const nodeByTitle=(id:string)=>{const found=dom.carriers.find(c=>c.cls.split(/\s+/).includes('node')&&c.title===id);return found?.polygon??found?.bounds;};
     const sourceBox=nodeByTitle(exp.from),targetBox=nodeByTitle(exp.to);
     const distance=(p:{x:number;y:number}|null,b:any)=>!p||!b?Infinity:Math.hypot(Math.max(b.x-p.x,0,p.x-(b.x+b.width)),Math.max(b.y-p.y,0,p.y-(b.y+b.height)));
     const sourceDistance=distance(drawn.start,sourceBox),targetDistance=distance(drawn.end,targetBox);
     if(sourceDistance>32||targetDistance>32)endpointFailures.push(`${exp.id} SVG path is detached from its mapped endpoint shapes (start ${sourceDistance.toFixed(1)}px at ${JSON.stringify(drawn.start)} vs ${JSON.stringify(sourceBox)}, end ${targetDistance.toFixed(1)}px at ${JSON.stringify(drawn.end)} vs ${JSON.stringify(targetBox)})`);
     const portRowOk=(point:{x:number;y:number}|null,nodeId:string,port:string|undefined)=>{
      if(!port)return true;
      const row=fieldRowForPort(nodeId,port);if(!row||!point)return false;
      const halfBand=Math.max(4,row.bounds.height/2+3),center=row.bounds.y+row.bounds.height/2;
      return point.y>=center-halfBand&&point.y<=center+halfBand;
     };
     if(exp.fromPort&&!portRowOk(drawn.start,exp.from,exp.fromPort))endpointFailures.push(`${exp.id} path source does not attach at the SVG row for port ${exp.fromPort}`);
     if(exp.toPort&&!portRowOk(drawn.end,exp.to,exp.toPort))endpointFailures.push(`${exp.id} path target does not attach at the SVG row for port ${exp.toPort}`);
    }
   }
   const expectCount=expectedEdges.length,astConnectionPass=endpointFailures.length===0&&semanticEdges.length===expectCount;
   checks.push(pass('graphviz-edge-endpoints-and-paths',sourceSha256,astConnectionPass,endpointFailures.length?endpointFailures.join('; '):`${expectCount} authored connections match exact Graphviz tail/head${visual.form==='entities'?' ports':''}; each has a drawn SVG path${visual.form==='entities'?' (entity references are nondirected)':' and arrowhead'}. Invisible layout constraints are excluded.`));

   if(visual.form==='entities'){
    const problems:string[]=[];
    visual.structure?.entities?.forEach((entity,ei)=>{
     const nodeId=nativeIdForNode(plan,entity.node),nodeCarrier=nodeId?carrier('node',nodeId):undefined;
     if(!nodeCarrier){problems.push(`entity ${entity.node} has no node carrier`);return;}
     const nativeObject=byName.get(nodeId!);const label=text(nativeObject?.label);
     const fields=entity.fields;
     fields.forEach(field=>{
      const port=portFor(plan,entity.node,field.id??field.name,visual);
      const renderedPort=plan.source.match(new RegExp(`PORT=["']${port}["']`))!==null;
      // The Graphviz SVG emits each HTML-table row as text in the owning entity group.
      const fieldRow=fieldPortEntry(port)?fieldRowForPort(nodeId!,port):undefined;
      if(!renderedPort||!fieldRow)problems.push(`${entity.node}.${field.name} and its type are not visible together in its own entity row/port`);
      const keys=(field.keys??[]).map(k=>k.toUpperCase());
      const nullText=field.nullable===undefined?'':field.nullable?'NULL':'NOT NULL';
      for(const marker of [...keys,...(nullText?[nullText]:[])]){
       const matchingRows=nodeCarrier.ownTextDetails.filter(t=>t.value.split('·').some(part=>norm(part)===marker));
       const rowCenter=fieldRow?fieldRow.bounds.y+fieldRow.bounds.height/2:NaN;
       const markerRow=matchingRows.sort((a,b)=>fieldRow?Math.abs((a.bounds.y+a.bounds.height/2)-rowCenter)-Math.abs((b.bounds.y+b.bounds.height/2)-rowCenter):0)[0];
       if(!markerRow||!fieldRow||!matchingRows.some(row=>Math.abs((row.bounds.y+row.bounds.height/2)-rowCenter)<=2))problems.push(`${entity.node}.${field.name} ${marker} marker is not present in its own native field-cell row`);
       if(fieldRow&&markerRow&&Math.abs((fieldRow.bounds.y+fieldRow.bounds.height/2)-(markerRow.bounds.y+markerRow.bounds.height/2))>20)problems.push(`${entity.node}.${field.name} ${marker} marker is not aligned with its field row (${Math.abs((fieldRow.bounds.y+fieldRow.bounds.height/2)-(markerRow.bounds.y+markerRow.bounds.height/2)).toFixed(1)}px)`);
      }
      const astLabel=text(byName.get(nodeId!)?.label),portPattern=new RegExp(`<TD\\b(?=[^>]*\\bPORT=["']${escRe(port??'')}["'])[^>]*>([\\s\\S]*?)<\\/TD>`,'i');
      const astRowHtml=portPattern.exec(astLabel)?.[1];
      const astRowText=astRowHtml?norm(decodeDotLabel(astRowHtml.replace(/<[^>]*>/g,' '))):'';
      if(!astRowHtml||!exactFieldText(astRowText,field.name,field.type)||keys.some(k=>!dotRowHasMarker(astRowHtml,k))||(nullText&&!dotRowHasMarker(astRowHtml,nullText)))problems.push(`${entity.node}.${field.name} row is absent from its exact Graphviz AST port`);
     });
     if(entity.fields.length===0&&!label.includes(text(visual.nodes?.find(n=>n.id===entity.node)?.label)))problems.push(`empty entity ${entity.node} is missing its label`);
    });
    checks.push(pass('graphviz-entity-field-rows',sourceSha256,problems.length===0,problems.length?problems.join('; '):`${visual.structure?.entities?.reduce((n,e)=>n+e.fields.length,0)??0} fields, types, key markers, and declared nullability are visible in their owning entity SVG carriers; port identifiers are attached to those row declarations.`));
   }

   const hierarchyProblems:string[]=[];
   if(visual.kind==='flow'){
    const groups=visual.groups??[],nodes=visual.nodes??[];
    const bounds=(kind:string,id:string)=>carrier(kind,id)?.polygon??carrier(kind,id)?.bounds;
    const contains=(a:any,b:any)=>!!a&&!!b&&b.x>=a.x-2&&b.y>=a.y-2&&b.x+b.width<=a.x+a.width+2&&b.y+b.height<=a.y+a.height+2;
    for(const g of groups){if(g.parent){const child=bounds('cluster','cluster_'+(plan.elementMap.find(e=>e.kind==='group'&&e.logicalId===g.id)?.nativeId??''));const parent=bounds('cluster','cluster_'+(plan.elementMap.find(e=>e.kind==='group'&&e.logicalId===g.parent)?.nativeId??''));if(!contains(parent,child))hierarchyProblems.push(`group ${g.id} is not geometrically inside ${g.parent}`);}}
    for(const n of nodes){if(n.group){const child=bounds('node',nativeIdForNode(plan,n.id)??'');const parentId=plan.elementMap.find(e=>e.kind==='group'&&e.logicalId===n.group)?.nativeId??'';const parent=bounds('cluster','cluster_'+parentId);if(!contains(parent,child))hierarchyProblems.push(`node ${n.id} is not geometrically inside group ${n.group}`);}}
   }
   if(visual.kind==='structure'&&visual.form==='stack'){
    const layers=visual.structure?.layers??[];const ys=layers.map(l=>{const id=plan.elementMap.find(e=>e.kind==='layer'&&e.logicalId===l.id)?.nativeId;return id?carrier('cluster','cluster_'+id)?.bounds.y:undefined;});
    if(ys.some(y=>y===undefined)||ys.some((y,i)=>i>0&&Number(y)<=Number(ys[i-1])))hierarchyProblems.push('layer cluster bounds do not follow source top-to-bottom order');
    const semanticVisible=semanticEdges.length>0;if(semanticVisible)hierarchyProblems.push('stack contains a visible connector; only invisible layout constraints are qualified');
   }
   if(visual.form==='entities'){} // references are not containment edges.
   if(visual.kind==='flow'||visual.form==='stack')checks.push(pass('graphviz-containment-and-order',sourceSha256,hierarchyProblems.length===0,hierarchyProblems.length?hierarchyProblems.join('; '):visual.form==='stack'?'Layer cluster geometry follows authored order; invisible constraints are excluded as semantic connections.':'Every nested group and grouped node is geometrically contained by its mapped native cluster.'));
  }
 }else{
  // Mermaid IDs are generated by Mermaid but preserve the compiler's safe native IDs.
  const missing:string[]=[];
  for(const e of plan.elementMap){
   if(e.kind==='visual'||e.kind==='reference'||e.kind==='field'||e.kind==='edge')continue;
   const safe=e.nativeId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   const found=dom.carriers.some(c=>c.id.includes(e.nativeId)||c.title===e.nativeId||c.id.includes(safe));
   if(!found)missing.push(`${e.kind} ${e.nativeId}`);
  }
  const expectedNodeLabels=plan.elementMap.filter(e=>e.kind==='node'||e.kind==='entity').map(e=>{
   const index=Number(e.sourcePath.split('/').at(-1));
   const label=e.kind==='entity'?visual.structure?.entities?.[index]?visual.nodes?.find(n=>n.id===visual.structure!.entities![index]!.node)?.label:undefined:visual.nodes?.[index]?.label;
   return{nativeId:e.nativeId,label:label??''};
  });
  const ownLabelsMissing=expectedNodeLabels.filter(({nativeId,label})=>{
   const expectedCarrier=dom.carriers.find(c=>c.id.includes(`flowchart-${nativeId}-`)||c.id.includes(`entity-${nativeId}-`)||c.title===nativeId);
   return !label||!expectedCarrier||!normLabel(expectedCarrier.ownText.join(' ')).includes(normLabel(label));
  }).map(x=>`${x.nativeId}:${x.label}`);
  checks.push(pass('mermaid-native-node-carriers',sourceSha256,missing.length===0&&ownLabelsMissing.length===0,missing.length||ownLabelsMissing.length?`Missing native node carriers: ${[...missing,...ownLabelsMissing.map(x=>'label '+x)].join(', ')}.`:`${expectedNodeLabels.length} source labels appear in their exact ID-mapped Mermaid node/entity carriers.`));
  if(visual.form==='entities'){
   // Mermaid ER has entity-level relationship endpoints, never field-port attachment.
   const nodesWithFields=dom.carriers.filter(c=>c.cls.includes('node')&&c.ownText.length>0);
   const problems:string[]=[];
   for(const entity of visual.structure?.entities??[]){
    const label=visual.nodes?.find(n=>n.id===entity.node)?.label??'';
    const owner=nodesWithFields.find(c=>c.ownText.some(t=>norm(t)===norm(label)));
    if(!owner){problems.push(`${label} has no entity-local Mermaid carrier`);continue;}
    const all=owner.ownText.join(' ');
    for(const field of entity.fields){
     if(!all.includes(field.name)||(field.type&&!all.includes(field.type))||(field.keys??[]).some(k=>!all.includes(k.toUpperCase())))problems.push(`${label}.${field.name} missing from own entity carrier`);
     if(field.type&&field.nullable===true&&!all.includes(field.type+'?'))problems.push(`${label}.${field.name} nullable marker is absent from its Mermaid field row`);
     if(field.type&&field.nullable===false&&all.includes(field.type+'?'))problems.push(`${label}.${field.name} field row incorrectly marks a non-nullable field as nullable`);
    }
   }
   const relationCount=visual.structure?.references?.length??0;
   visual.structure?.references?.forEach((reference,i)=>{
    const from=nativeIdForNode(plan,reference.from.node),to=nativeIdForNode(plan,reference.to.node);
    const edge=dom.paths.find(p=>p.dataId.includes(`entity-${from}-`)&&p.dataId.includes(`entity-${to}-`));
    if(!edge||!edge.d||!edge.markerStart||!edge.markerEnd)problems.push(`relationship ${reference.id} has no native entity-level relation path from ${from} to ${to}`);
    if(edge){
     const fromNode=dom.carriers.find(c=>c.id.includes(`entity-${from}-`)),toNode=dom.carriers.find(c=>c.id.includes(`entity-${to}-`));
     const distance=(p:{x:number;y:number}|null,b:any)=>!p||!b?Infinity:Math.hypot(Math.max(b.x-p.x,0,p.x-(b.x+b.width)),Math.max(b.y-p.y,0,p.y-(b.y+b.height)));
     if(distance(edge.start,fromNode?.bounds)>32||distance(edge.end,toNode?.bounds)>32)problems.push(`relationship ${reference.id} path is detached from its mapped entity shapes`);
    }
    if(reference.label&&edge&&!dom.edgeLabels.some(l=>l.text.includes(reference.label!)&&l.id===edge.dataId))problems.push(`relationship ${reference.id} label is not carried by its own Mermaid edge label`);
   });
   checks.push(pass('mermaid-er-fields-and-relations',sourceSha256,problems.length===0,problems.length?problems.join('; '):`${visual.structure?.entities?.reduce((n,e)=>n+e.fields.length,0)??0} fields are scoped to entity carriers and ${relationCount} relationships have native paths with cardinality markers. Mermaid ER endpoints are entity-level; this check makes no field-port claim.`));
  }else if(visual.kind==='flow'){
   const failures:string[]=[];
   visual.edges?.forEach(edge=>{
    const from=nativeIdForNode(plan,edge.from),to=nativeIdForNode(plan,edge.to),path=dom.paths.find(p=>p.dataId.startsWith(`L_${from}_${to}_`));
    if(!path||!path.d||!path.markerEnd){failures.push(`${edge.id} has no Mermaid directed path ${from} → ${to}`);return;}
    const sourceCarrier=dom.carriers.find(c=>c.id.includes(`flowchart-${from}-`)),targetCarrier=dom.carriers.find(c=>c.id.includes(`flowchart-${to}-`));
    const distance=(p:{x:number;y:number}|null,b:any)=>!p||!b?Infinity:Math.hypot(Math.max(b.x-p.x,0,p.x-(b.x+b.width)),Math.max(b.y-p.y,0,p.y-(b.y+b.height)));
    if(distance(path.start,sourceCarrier?.bounds)>32||distance(path.end,targetCarrier?.bounds)>32)failures.push(`${edge.id} path is detached from its mapped Mermaid node shapes`);
    if(edge.label&&!dom.edgeLabels.some(l=>l.text===norm(edge.label!)&&l.id===path.dataId))failures.push(`${edge.id} label is not owned by its native Mermaid edge-label carrier`);
   });
   checks.push(pass('mermaid-flow-paths',sourceSha256,failures.length===0,failures.length?failures.join('; '):`${visual.edges?.length??0} authored flow connections have native SVG paths with exact mapped endpoint IDs and directed markers.`));
  }
  if(visual.kind==='flow'||(visual.kind==='structure'&&visual.form==='stack')){
   const problems:string[]=[];
   const clusterFor=(logicalId:string,kind:'group'|'layer')=>{
    const nativeId=plan.elementMap.find(e=>e.kind===kind&&e.logicalId===logicalId)?.nativeId;
    return nativeId?dom.carriers.find(c=>c.cls.split(/\s+/).includes('cluster')&&c.id.endsWith(`-${nativeId}`)):undefined;
   };
   const inside=(parent:typeof dom.carriers[number]|undefined,child:typeof dom.carriers[number]|undefined)=>!!parent&&!!child&&child.bounds.x>=parent.bounds.x-2&&child.bounds.y>=parent.bounds.y-2&&child.bounds.x+child.bounds.width<=parent.bounds.x+parent.bounds.width+2&&child.bounds.y+child.bounds.height<=parent.bounds.y+parent.bounds.height+2;
   const nodeFor=(logicalId:string)=>{
    const nativeId=nativeIdForNode(plan,logicalId);
    return nativeId?dom.carriers.find(c=>c.cls.split(/\s+/).includes('node')&&c.id.includes(`flowchart-${nativeId}-`)):undefined;
   };
   if(visual.kind==='flow'){
    for(const group of visual.groups??[]){
     const child=clusterFor(group.id,'group');
     if(!child)problems.push(`group ${group.id} has no Mermaid subgraph carrier`);
     else if(!normLabel(child.ownText.join(' ')).includes(normLabel(group.label)))problems.push(`group ${group.id} label is not visible in its mapped subgraph`);
     if(group.parent){
      const parent=clusterFor(group.parent,'group');
      if(!inside(parent,child))problems.push(`group ${group.id} is not geometrically contained by its mapped Mermaid parent ${group.parent}`);
     }
    }
    for(const node of visual.nodes??[])if(node.group){
     const parent=clusterFor(node.group,'group'),mapped=nodeFor(node.id);
     if(!inside(parent,mapped))problems.push(`node ${node.id} is not geometrically inside its mapped Mermaid group ${node.group}`);
    }
   }
   if(visual.kind==='structure'&&visual.form==='stack'){
    const layers=visual.structure?.layers??[];
    const mapped=layers.map(layer=>({layer,carrier:clusterFor(layer.id,'layer')}));
    for(const {layer,carrier} of mapped){
     if(!carrier)problems.push(`layer ${layer.id} has no Mermaid subgraph carrier`);
     else if(!normLabel(carrier.ownText.join(' ')).includes(normLabel(layer.label)))problems.push(`layer ${layer.id} label is not visible in its mapped subgraph`);
     for(const node of (visual.nodes??[]).filter(n=>n.layer===layer.id)){
      const carrierNode=nodeFor(node.id);
      if(!inside(carrier,carrierNode))problems.push(`node ${node.id} is not geometrically contained by Mermaid layer ${layer.id}`);
     }
    }
    const centers=mapped.map(({layer,carrier})=>({layer,x:carrier?carrier.bounds.x+carrier.bounds.width/2:undefined}));
    if(centers.some(c=>c.x===undefined)||centers.some((c,i)=>i>0&&Number(c.x)<=Number(centers[i-1]?.x)))problems.push('Mermaid layer geometry does not follow the authored left-to-right order');
   }
   checks.push(pass('mermaid-containment-and-order',sourceSha256,problems.length===0,problems.length?problems.join('; '):visual.form==='stack'?'Mapped layer subgraphs contain their nodes and follow authored left-to-right geometry.':'Mapped Mermaid subgraphs geometrically contain each child group and grouped node.'));
  }
 }

 const fit=await page.locator('#frame svg').evaluate(root=>{
  const s=root as SVGSVGElement,r=s.getBoundingClientRect(),textEls=[...s.querySelectorAll('text,foreignObject')];
  const normalize=(s:string)=>s.replace(/\s+/g,' ').trim();
  const texts=textEls.map(el=>{const b=el.getBoundingClientRect(),font=parseFloat(getComputedStyle(el).fontSize)||0;return{value:normalize(el.textContent??''),x:b.x-r.x,y:b.y-r.y,w:b.width,h:b.height,font};}).filter(x=>x.value);
  const out=texts.filter(x=>x.x<-1||x.y<-1||x.x+x.w>r.width+1||x.y+x.h>r.height+1);
  const scale=Math.min(1600/(s.viewBox.baseVal.width||1),900/(s.viewBox.baseVal.height||1));
  const small=texts.filter(x=>x.font*scale<10);
  const overlaps:string[]=[];
  for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++){
   const a=texts[i]!,b=texts[j]!;if(!a.w||!a.h||!b.w||!b.h)continue;
   const ix=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),iy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
   if(ix>2&&iy>2)overlaps.push(`${a.value.slice(0,36)} / ${b.value.slice(0,36)}`);
  }
  return{width:r.width,height:r.height,texts:texts.length,out:out.map(x=>x.value),small:small.map(x=>x.value),overlaps:overlaps.slice(0,12)};
 });
 checks.push(pass('presentation-clipping',sourceSha256,fit.out.length===0,fit.out.length?`SVG text exceeds the rendered viewport: ${fit.out.join(' | ')}.`:`${fit.texts} visible text carriers fit within the 1600×900 presentation viewport.`));
 checks.push(pass('presentation-font-legibility',sourceSha256,fit.small.length===0,fit.small.length?`Text falls below 10 CSS px when fitted: ${fit.small.join(' | ')}.`:'All measured text remains at least 10 CSS px when fitted to 1600×900.'));
 checks.push(pass('presentation-text-overlap',sourceSha256,fit.overlaps.length===0,fit.overlaps.length?`Intersecting text bounds: ${fit.overlaps.join('; ')}.`:'No measured text bounds overlap at the presentation viewport.'));
 return checks;
}
