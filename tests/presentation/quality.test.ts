// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,describe,expect,it} from 'bun:test';
import {chromium,type Browser} from 'playwright';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';

let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});

const doc=(v:Visual)=>createVisualDocument(v,'quality:'+v.id,'1.1.0');
async function dot(plan:PresentationPlan,format:'svg'|'json'|'plain'){
 const child=Bun.spawn(['dot','-T'+format],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 child.stdin.write(plan.source);child.stdin.end();
 const [out,err,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 expect(exit).toBe(0);expect(err).toBe('');return out;
}
async function check(d:ReturnType<typeof doc>,backend:'graphviz'|'mermaid'='graphviz'){
 const result=compilePresentation(d,{backend,theme:'presentation/1'});expect(result.ok).toBe(true);if(!result.ok)throw Error(JSON.stringify(result));
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  let svg:string,ast:unknown;
  if(backend==='graphviz'){const [svgText,json]=await Promise.all([dot(result,'svg'),dot(result,'json')]);svg=svgText;ast=JSON.parse(json);}
  else{
   await page.setContent('<!doctype html><meta charset="utf-8"><div id="out"></div>');
   await page.addScriptTag({path:resolve(import.meta.dir,'../../node_modules/mermaid/dist/mermaid.min.js')});
   svg=await page.evaluate(async source=>{const m=(window as any).mermaid;m.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',deterministicIds:true,deterministicIDSeed:'quality-test'});return(await m.render('quality-test',source)).svg;},result.source);
  }
  return{plan:result,svg,checks:await verifyPresentationQuality(page,{svg,document:d,plan:result,nativeAst:ast}),page};
 }catch(e){await page.close();throw e;}
}
const result=(checks:Awaited<ReturnType<typeof verifyPresentationQuality>>,name:string)=>checks.find(x=>x.check===name)?.result;

describe('presentation native quality verifier',()=>{
 it('proves owned Graphviz curves and records Mermaid collinear interpolation as a located fallback',async()=>{
  const d=createVisualDocument({id:'edge-routing-native',kind:'flow',form:'network',question:'How does the record move?',nodes:[{id:'source',label:'Source'},{id:'target',label:'Target'}],edges:[{id:'connection',from:'source',to:'target',label:'transfers',routing:{kind:'curved'}}]},'quality:edge-routing-native','1.4.0');
  const graphviz=await check(d,'graphviz');
  try{
   expect(result(graphviz.checks,'graphviz-edge-endpoints-and-paths')).toBe('pass');
   expect(graphviz.plan.source).toContain('splines=curved');
   expect(graphviz.plan.source).toContain('xlabel="transfers"');
   const straight=await graphviz.page.locator('#frame svg g.edge path').evaluate(path=>{
    const line=path as SVGPathElement,length=line.getTotalLength(),start=line.getPointAtLength(0),end=line.getPointAtLength(length);
    line.setAttribute('d',`M ${start.x} ${start.y} L ${end.x} ${end.y}`);
    return(line.ownerSVGElement as SVGSVGElement).outerHTML;
   });
   const ast=JSON.parse(await dot(graphviz.plan,'json'));
   expect(result(await verifyPresentationQuality(graphviz.page,{svg:straight,document:d,plan:graphviz.plan,nativeAst:ast}),'graphviz-edge-endpoints-and-paths')).toBe('fail');
   const forged={...graphviz.plan,approximations:graphviz.plan.approximations.map(item=>item.sourcePath==='/extensions/umf.visual/edges/0/routing'?{...item,code:'ROUTING_NATIVE_INTERPOLATION' as const}:item)};
   expect(result(await verifyPresentationQuality(graphviz.page,{svg:straight,document:d,plan:forged,nativeAst:ast}),'graphviz-edge-endpoints-and-paths')).toBe('fail');
  }finally{await graphviz.page.close();}
  const mixed=createVisualDocument({id:'edge-routing-scope-fallback',kind:'flow',form:'network',question:'Which routes are represented?',nodes:[{id:'a',label:'A'},{id:'b',label:'B'},{id:'c',label:'C'}],edges:[{id:'curved',from:'a',to:'b',routing:{kind:'curved'}},{id:'straight',from:'b',to:'c',routing:{kind:'straight'}}]},'quality:edge-routing-scope-fallback','1.4.0');
  const mixedGraphviz=await check(mixed,'graphviz');
  try{const details=mixedGraphviz.checks.find(item=>item.check==='graphviz-edge-endpoints-and-paths')?.details??'';expect(result(mixedGraphviz.checks,'graphviz-edge-endpoints-and-paths')).toBe('pass');expect(details).toContain('observed');expect(details).toContain('px chord deviation');expect(details).toContain('admitted ROUTING_SCOPE_CONFLICT');}finally{await mixedGraphviz.page.close();}
  const mermaid=await check(d,'mermaid');
  try{
   expect(result(mermaid.checks,'mermaid-flow-paths')).toBe('pass');
   expect(mermaid.plan.approximations.find(item=>item.sourcePath==='/extensions/umf.visual/edges/0/routing')?.code).toBe('ROUTING_NATIVE_INTERPOLATION');
   expect(mermaid.checks.find(item=>item.check==='mermaid-flow-paths')?.details).toContain('native layout is collinear');
   const bent=await mermaid.page.locator('#frame svg path[data-edge="true"]').evaluate(path=>{
    const line=path as SVGPathElement,length=line.getTotalLength(),start=line.getPointAtLength(0),end=line.getPointAtLength(length);
    line.setAttribute('d',`M ${start.x} ${start.y} L ${(start.x+end.x)/2} ${(start.y+end.y)/2+30} L ${end.x} ${end.y}`);
    return(line.ownerSVGElement as SVGSVGElement).outerHTML;
   });
   expect(result(await verifyPresentationQuality(mermaid.page,{svg:bent,document:d,plan:mermaid.plan}),'mermaid-flow-paths')).toBe('fail');
   const missingConfig={...mermaid.plan,source:mermaid.plan.source.replace('  e1@{ curve: natural }\n','')};
   expect(result(await verifyPresentationQuality(mermaid.page,{svg:mermaid.svg,document:d,plan:missingConfig}),'mermaid-flow-paths')).toBe('fail');
   const forged={...mermaid.plan,approximations:mermaid.plan.approximations.map(item=>item.sourcePath==='/extensions/umf.visual/edges/0/routing'?{...item,code:'ROUTING_SCOPE_CONFLICT' as const}:item)};
   expect(result(await verifyPresentationQuality(mermaid.page,{svg:mermaid.svg,document:d,plan:forged}),'mermaid-flow-paths')).toBe('fail');
  }finally{await mermaid.page.close();}
 },{timeout:45_000});

 it('keeps Mermaid straight routed links direct when they already carry adjacent authored order',async()=>{
  const d=createVisualDocument({id:'mermaid-straight-order',kind:'flow',form:'network',question:'Which order is drawn?',layout:{kind:'flow',direction:'LR',order:['left','right']},nodes:[{id:'left',label:'Left'},{id:'right',label:'Right'}],edges:[{id:'connection',from:'left',to:'right',label:'connects',routing:{kind:'straight'}}]},'quality:mermaid-straight-order','1.4.0');
  const good=await check(d,'mermaid');
  try{
   expect(good.plan.source).not.toContain('n1 ~~~ n2');
   expect(good.plan.source).toContain('e1@{ curve: linear }');
   expect(result(good.checks,'mermaid-flow-paths')).toBe('pass');
   const path=good.page.locator('#frame svg path[data-edge="true"]');
   const deviation=await path.evaluate(item=>{const line=item as SVGPathElement,length=line.getTotalLength(),a=line.getPointAtLength(0),b=line.getPointAtLength(length),dx=b.x-a.x,dy=b.y-a.y,span=Math.hypot(dx,dy)||1;let max=0;for(let index=1;index<12;index++){const p=line.getPointAtLength(length*index/12);max=Math.max(max,Math.abs(dy*p.x-dx*p.y+b.x*a.y-b.y*a.x)/span);}return max;});
   expect(deviation).toBeLessThan(1.5);
   const bent=await path.evaluate(item=>{const line=item as SVGPathElement,length=line.getTotalLength(),a=line.getPointAtLength(0),b=line.getPointAtLength(length);line.setAttribute('d',`M ${a.x} ${a.y} L ${(a.x+b.x)/2} ${(a.y+b.y)/2+30} L ${b.x} ${b.y}`);return(line.ownerSVGElement as SVGSVGElement).outerHTML;});
   const fallback=await verifyPresentationQuality(good.page,{svg:bent,document:d,plan:good.plan});
   expect(result(fallback,'mermaid-flow-paths')).toBe('pass');expect(fallback.find(item=>item.check==='mermaid-flow-paths')?.details).toContain('bent polyline');
   const curved=await path.evaluate(item=>{const line=item as SVGPathElement,length=line.getTotalLength(),a=line.getPointAtLength(0),b=line.getPointAtLength(length);line.setAttribute('d',`M ${a.x} ${a.y} Q ${(a.x+b.x)/2} ${(a.y+b.y)/2+30} ${b.x} ${b.y}`);return(line.ownerSVGElement as SVGSVGElement).outerHTML;});
   expect(result(await verifyPresentationQuality(good.page,{svg:curved,document:d,plan:good.plan}),'mermaid-flow-paths')).toBe('fail');
  }finally{await good.page.close();}
 },{timeout:30_000});

 it('binds the process role caption to the exact Graphviz and Mermaid node carrier',async()=>{
  const d=createVisualDocument({id:'process-role-native-carrier',kind:'flow',form:'network',question:'Which depicted activity is shown?',nodes:[{id:'activity',label:'Reconcile records',detail:'Apply authored rules',role:'process',shape:'rectangle'},{id:'output',label:'Output'},{id:'literal-process',label:'Process',role:'process'}],edges:[{id:'writes',from:'activity',to:'output',label:'writes'}]},'quality:process-role-native-carrier','1.4.0');
  for(const backend of ['graphviz','mermaid'] as const){
   const good=await check(d,backend);
   try{
    const name=backend==='graphviz'?'graphviz-native-carriers':'mermaid-native-node-carriers';
    expect(result(good.checks,name)).toBe('pass');
    const literalProcessId=good.plan.elementMap.find(item=>item.kind==='node'&&item.logicalId==='literal-process')?.nativeId;if(!literalProcessId)throw Error('Missing exact-label process identity map.');
    const unownedRole=backend==='graphviz'?undefined:await good.page.locator('#frame svg').evaluate((root,nativeId)=>{
     const node=[...root.querySelectorAll('g.node')].find(element=>element.id.includes(`flowchart-${nativeId}-`));
     if(!node)throw Error('Missing exact-label process node carrier.');node.classList.remove('role_process');return(root as SVGSVGElement).outerHTML;
    },literalProcessId);
    if(backend==='mermaid')expect(result(await verifyPresentationQuality(good.page,{svg:unownedRole!,document:d,plan:good.plan}),name)).toBe('fail');
    else{
     const ast=JSON.parse(await dot(good.plan,'json')) as {objects:Array<{name:string;fillcolor?:string}>};
     const changed={...ast,objects:ast.objects.map(object=>object.name===literalProcessId?{...object,fillcolor:'#ffffff'}:object)};
     expect(result(await verifyPresentationQuality(good.page,{svg:good.svg,document:d,plan:good.plan,nativeAst:changed}),name)).toBe('fail');
    }
    const mutated=await good.page.locator('#frame svg').evaluate((root,backend)=>{
     const nativeId='n1',node=backend==='graphviz'
      ?[...root.querySelectorAll('g.node')].find(element=>element.querySelector(':scope > title')?.textContent?.trim()===nativeId)
      :[...root.querySelectorAll('g.node')].find(element=>element.id.includes(`flowchart-${nativeId}-`));
     if(!node)throw Error('Missing mapped process node carrier.');
     if(backend==='graphviz'){
      const caption=[...node.querySelectorAll('text')].find(element=>element.textContent?.trim()==='Process');
      if(!caption)throw Error('Missing Process role caption in mapped Graphviz node.');caption.textContent='Activity';
     }else{
      const caption=node.querySelector('foreignObject .nodeLabel');
      if(!caption||!caption.innerHTML.includes('Process'))throw Error('Missing Process role caption in mapped Mermaid node.');
      caption.innerHTML=caption.innerHTML.replace('Process','Activity');
     }
     return(root as SVGSVGElement).outerHTML;
    },backend);
    const nativeAst=backend==='graphviz'?JSON.parse(await dot(good.plan,'json')):undefined;
    expect(result(await verifyPresentationQuality(good.page,{svg:mutated,document:d,plan:good.plan,nativeAst}),name)).toBe('fail');
   }finally{await good.page.close();}
  }
 },{timeout:30_000});

 it('keeps single and multiple document shapes distinct and proves native ownership',async()=>{
  const d=createVisualDocument({id:'document-shape-native-carriers',kind:'flow',form:'network',question:'Which document shapes are shown?',nodes:[
   {id:'single',label:'Document',role:'document',shape:'document'},
   {id:'multiple',label:'Multiple documents',shape:'multiple-documents'},
   {id:'activity',label:'Process',role:'process',shape:'rectangle'},
  ],edges:[{id:'stores',from:'activity',to:'multiple',label:'stores'}]},'quality:document-shape-native-carriers','1.4.0');
  for(const backend of ['graphviz','mermaid'] as const){
   const good=await check(d,backend),name=backend==='graphviz'?'graphviz-native-carriers':'mermaid-native-node-carriers';
   try{
    if(result(good.checks,name)!=='pass')throw Error(JSON.stringify(good.checks.filter(check=>check.result==='fail')));
    const multiNativeId=good.plan.elementMap.find(item=>item.kind==='node'&&item.logicalId==='multiple')?.nativeId;if(!multiNativeId)throw Error('Missing multiple-documents identity map.');
    if(backend==='graphviz'){
     expect(good.plan.source).toContain('shape=plain');
     expect(good.plan.source).toContain('SIDES="TR"');
     const mutated=await good.page.locator('#frame svg').evaluate((root,nativeId)=>{
      const node=[...root.querySelectorAll('g.node')].find(element=>element.querySelector(':scope > title')?.textContent?.trim()===nativeId);
      if(!node)throw Error('Missing mapped multiple-document carrier.');
      const nodeBox=(node as SVGGElement).getBBox(),sheet=[...node.querySelectorAll('polygon')].find(element=>{const box=(element as SVGPolygonElement).getBBox();return box.width<=nodeBox.width*.1&&box.height>=nodeBox.height*.7;});
      if(!sheet)throw Error('Missing a native sheet outline in the mapped Graphviz carrier.');sheet.remove();
      return(root as SVGSVGElement).outerHTML;
     },multiNativeId);
     const nativeAst=JSON.parse(await dot(good.plan,'json'));
     expect(result(await verifyPresentationQuality(good.page,{svg:mutated,document:d,plan:good.plan,nativeAst}),name)).toBe('fail');
    }else{
     expect(good.plan.source).toContain('shape: docs');
     const singleNativeId=good.plan.elementMap.find(item=>item.kind==='node'&&item.logicalId==='single')?.nativeId;if(!singleNativeId)throw Error('Missing single-document identity map.');
     const mutated=await good.page.locator('#frame svg').evaluate((root,nativeId)=>{
      const node=[...root.querySelectorAll('g.node')].find(element=>element.id.includes(`flowchart-${nativeId}-`));
      if(!node)throw Error('Missing mapped multiple-document carrier.');
      const paths=[...node.querySelectorAll('path')];if(paths.length<4)throw Error('Missing Mermaid stacked-document geometry.');paths.slice(-2).forEach(path=>path.remove());
      return(root as SVGSVGElement).outerHTML;
     },multiNativeId);
     expect(result(await verifyPresentationQuality(good.page,{svg:mutated,document:d,plan:good.plan}),name)).toBe('fail');
     await good.page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},good.svg);
     const concentricResult=await good.page.locator('#frame svg').evaluate((root,{multiId,singleId})=>{
      const node=[...root.querySelectorAll('g.node')].find(element=>element.id.includes(`flowchart-${multiId}-`)),single=[...root.querySelectorAll('g.node')].find(element=>element.id.includes(`flowchart-${singleId}-`)),singlePath=single?.querySelector('path');
      const paths=node?[...node.querySelectorAll('path')]:[];if(!node||!singlePath||paths.length<4)throw Error('Expected owned Mermaid single- and multiple-document native paths.');
      paths.forEach(path=>path.setAttribute('d',singlePath.getAttribute('d')??''));for(const group of node.querySelectorAll('g:not(.label)'))if(group.hasAttribute('transform'))group.setAttribute('transform','translate(0,0)');
      return{svg:(root as SVGSVGElement).outerHTML};
     },{multiId:multiNativeId,singleId:singleNativeId});
     expect(result(await verifyPresentationQuality(good.page,{svg:concentricResult.svg,document:d,plan:good.plan}),name)).toBe('fail');
    }
    expect(good.plan.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/nodes/1/shape'&&/one logical node/i.test(item.representation))).toBe(backend==='graphviz');
   }finally{await good.page.close();}
  }
 },{timeout:45_000});

 it('preserves the multiple-document stencil in native stack profiles',async()=>{
  const d=createVisualDocument({id:'stack-multiple-documents',kind:'structure',form:'stack',question:'Which sheet stack is shown?',nodes:[{id:'documents',label:'Multiple documents',shape:'multiple-documents',layer:'records'},{id:'other',label:'Other component',layer:'system'}],structure:{layers:[{id:'records',label:'Records'},{id:'system',label:'System'}]}},'quality:stack-multiple-documents','1.4.0');
  for(const backend of ['graphviz','mermaid'] as const){
   const good=await check(d,backend),name=backend==='graphviz'?'graphviz-native-carriers':'mermaid-native-node-carriers';
   try{
    if(result(good.checks,name)!=='pass')throw Error(`${backend}: ${JSON.stringify(good.checks)}`);
    const nativeId=good.plan.elementMap.find(item=>item.kind==='node'&&item.logicalId==='documents')?.nativeId;if(!nativeId)throw Error('Missing stack multiple-document identity map.');
    expect(good.plan.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/nodes/0/shape'&&/one logical node/i.test(item.representation))).toBe(backend==='graphviz');
    const missingSheet=await good.page.locator('#frame svg').evaluate((root,{id,backend})=>{
     const node=backend==='graphviz'?[...root.querySelectorAll('g.node')].find(element=>element.querySelector(':scope > title')?.textContent?.trim()===id):[...root.querySelectorAll('g.node')].find(element=>element.id.includes(`flowchart-${id}-`));
     if(!node)throw Error('Missing mapped stack sheet owner.');
     if(backend==='graphviz'){
      const nodeBox=(node as SVGGElement).getBBox(),side=[...node.querySelectorAll('polygon')].find(element=>{const box=(element as SVGPolygonElement).getBBox();return box.width<=nodeBox.width*.1&&box.height>=nodeBox.height*.7;});
      if(!side)throw Error('Missing the Graphviz backing-sheet edge.');side.remove();
     }else{
      const paths=[...node.querySelectorAll('path')];if(paths.length<4)throw Error('Missing the Mermaid docs sheet paths.');paths.splice(-2).forEach(path=>path.remove());
     }
     return(root as SVGSVGElement).outerHTML;
    },{id:nativeId,backend});
    const nativeAst=backend==='graphviz'?JSON.parse(await dot(good.plan,'json')):undefined;
    expect(result(await verifyPresentationQuality(good.page,{svg:missingSheet,document:d,plan:good.plan,nativeAst}),name)).toBe('fail');
   }finally{await good.page.close();}
  }
 },{timeout:45_000});

 it('checks headless associations and rejects an invented native arrowhead',async()=>{
  const d=createVisualDocument({id:'headless-quality',kind:'flow',form:'network',question:'Which records are associated?',nodes:[{id:'a',label:'Record A'},{id:'b',label:'Record B'}],edges:[{id:'association',from:'a',to:'b',label:'associated',directed:false}]},undefined,'1.3.0');
  for(const backend of ['graphviz','mermaid'] as const){
   const good=await check(d,backend),name=backend==='graphviz'?'graphviz-edge-endpoints-and-paths':'mermaid-flow-paths';
   try{
    expect(result(good.checks,name)).toBe('pass');
    const mutated=await good.page.locator('#frame svg').evaluate((svg,backend)=>{
     if(backend==='graphviz'){
      const edge=svg.querySelector('g.edge');if(!edge)throw Error('Missing native association');
      const arrow=document.createElementNS('http://www.w3.org/2000/svg','polygon');arrow.setAttribute('points','0,0 10,0 5,10');edge.appendChild(arrow);
     }else{
      const edge=svg.querySelector('path[data-edge="true"]'),marker=[...svg.querySelectorAll('marker')].find(item=>item.id.includes('pointEnd'));
      if(!edge||!marker)throw Error('Missing native Mermaid path/arrow definition');edge.setAttribute('marker-end',`url(#${marker.id})`);
     }
     return svg.outerHTML;
    },backend);
    const nativeAst=backend==='graphviz'?JSON.parse(await dot(good.plan,'json')):undefined;
    expect(result(await verifyPresentationQuality(good.page,{svg:mutated,document:d,plan:good.plan,nativeAst}),name)).toBe('fail');
   }finally{await good.page.close();}
  }
 });

 it('proves free-text annotations belong to separate native carriers on Graphviz and Mermaid',async()=>{
  const d=createVisualDocument({id:'annotation-carriers',kind:'flow',form:'network',question:'Where are notes?',nodes:[{id:'source',label:'Source'},{id:'target',label:'Target'}],edges:[{id:'link',from:'source',to:'target'}],annotations:[{id:'heading',text:'Inbound path'},{id:'note',text:'Retry is outside this sketch.'}]},'quality:annotation-carriers','1.4.0');
  const graphviz=await check(d,'graphviz');
  try{
   expect(result(graphviz.checks,'graphviz-edge-endpoints-and-paths')).toBe('pass');
   expect(graphviz.plan.elementMap.filter(item=>item.kind==='annotation').map(item=>item.sourcePath)).toEqual(['/extensions/umf.visual/annotations/0/id','/extensions/umf.visual/annotations/1/id']);
   const moved=await graphviz.page.locator('#frame svg').evaluate(svg=>{
    const groups=[...svg.querySelectorAll('g.node')],owner=groups.find(group=>group.querySelector(':scope > title')?.textContent==='a1'),recipient=groups.find(group=>group.querySelector(':scope > title')?.textContent==='n1'),label=owner?.querySelector(':scope > text');
    if(!label||!recipient)throw Error('Graphviz annotation native text was not found');recipient.append(label);return svg.outerHTML;
   });
   expect(result(await verifyPresentationQuality(graphviz.page,{svg:moved,document:d,plan:graphviz.plan,nativeAst:JSON.parse(await dot(graphviz.plan,'json'))}),'graphviz-edge-endpoints-and-paths')).toBe('fail');
  }finally{await graphviz.page.close();}
  const mermaid=await check(d,'mermaid');
  try{
   expect(result(mermaid.checks,'mermaid-native-node-carriers')).toBe('pass');
   expect(mermaid.plan.source).toContain('a1@{ shape: text, label: "Inbound#32;path" }');
   const moved=await mermaid.page.locator('#frame svg').evaluate(svg=>{
    const groups=[...svg.querySelectorAll('g.node')],owner=groups.find(group=>group.id.includes('flowchart-a1-')),recipient=groups.find(group=>group.id.includes('flowchart-n1-')),label=owner?.querySelector(':scope > g.label');
    if(!label||!recipient)throw Error('Mermaid annotation native text was not found');recipient.append(label);return svg.outerHTML;
   });
   expect(result(await verifyPresentationQuality(mermaid.page,{svg:moved,document:d,plan:mermaid.plan}),'mermaid-native-node-carriers')).toBe('fail');
  }finally{await mermaid.page.close();}
 },{timeout:45_000});

 it('keeps an authored left-to-right group chain horizontal when visible edges already provide the order',async()=>{
  const d=createVisualDocument({id:'grouped-horizontal-annotation-layout',kind:'flow',form:'network',question:'How do regions connect?',layout:{kind:'flow',direction:'LR',order:['region-a','region-b']},groups:[{id:'region-a',label:'Request handling',role:'region',layout:{kind:'flow',direction:'LR',order:['api','worker']}},{id:'region-b',label:'Persistence',role:'region',layout:{kind:'flow',direction:'LR',order:['queue','database']}}],nodes:[{id:'api',label:'API',group:'region-a'},{id:'worker',label:'Worker',group:'region-a'},{id:'queue',label:'Queue',group:'region-b'},{id:'database',label:'Database',group:'region-b'}],edges:[{id:'api-worker',from:'api',to:'worker',routing:{kind:'straight'}},{id:'handoff',from:'worker',to:'queue',routing:{kind:'straight'}},{id:'queue-database',from:'queue',to:'database',routing:{kind:'straight'}}],annotations:[{id:'heading',text:'Inbound path'},{id:'note',text:'Detached note'}]},'quality:grouped-horizontal-annotation-layout','1.4.0');
  const rendered=await check(d,'graphviz');
  try{
   expect(result(rendered.checks,'graphviz-edge-endpoints-and-paths')).toBe('pass');
   expect(rendered.plan.source).not.toContain('n1 -> n2 [style=invis');expect(rendered.plan.source).not.toContain('n3 -> n4 [style=invis');expect(rendered.plan.source).not.toContain('n1 -> n3 [style=invis');
   const plain=(await dot(rendered.plan,'plain')).split('\n'),annotationRow=(id:string)=>plain.find(line=>line.startsWith(`node ${id} `))?.trim().split(/\s+/u),first=annotationRow('a1'),second=annotationRow('a2');
   expect(first).toBeDefined();expect(second).toBeDefined();expect(Number(first?.[3])).not.toBe(2.35);expect(Number(second?.[3])).not.toBe(2.35);expect(Number(first?.[4])).not.toBe(1.08);expect(Number(second?.[4])).not.toBe(1.08);
   const centers=await rendered.page.locator('#frame svg').evaluate(svg=>[...svg.querySelectorAll('g.node')].flatMap(group=>{const id=group.querySelector(':scope > title')?.textContent??'',rect=group.getBoundingClientRect();return/^n[1-4]$/u.test(id)?[{id,y:rect.y+rect.height/2}]:[]}));
   expect(centers.map(item=>item.id)).toEqual(['n1','n2','n3','n4']);
   expect(Math.max(...centers.map(item=>item.y))-Math.min(...centers.map(item=>item.y))).toBeLessThan(2);
  }finally{await rendered.page.close();}
 },{timeout:45_000});
 it('binds graph labels and endpoints to their own native carriers and drawn geometry',async()=>{
  const d=doc({id:'flow-quality',kind:'flow',form:'network',question:'How do records move?',title:'Record path',nodes:[{id:'api',label:'Client API'},{id:'store',label:'Record store'}],edges:[{id:'request',from:'api',to:'store',label:'Submit record'}]});
  const good=await check(d);try{
   expect(result(good.checks,'native-source-hash')).toBe('pass');
   expect(good.checks[0]?.sourceSha256).toBe(createHash('sha256').update(new TextEncoder().encode(good.plan.source)).digest('hex'));
   expect(result(good.checks,'graphviz-native-carriers')).toBe('pass');
   expect(result(good.checks,'graphviz-edge-endpoints-and-paths')).toBe('pass');
   expect(result(good.checks,'presentation-svg-fit')).toBe('pass');
   expect(result(good.checks,'presentation-clipping')).toBe('pass');
   expect(result(good.checks,'presentation-font-legibility')).toBe('pass');
   expect(result(good.checks,'presentation-text-overlap')).toBe('pass');
  }finally{await good.page.close();}
 });

 it('rejects altered native endpoints, detached paths, and labels moved outside the node carrier',async()=>{
  const d=doc({id:'flow-negative',kind:'flow',form:'network',question:'Where does it go?',nodes:[{id:'from',label:'Source API'},{id:'to',label:'Destination store'}],edges:[{id:'send',from:'from',to:'to',label:'Send'}]});
  const good=await check(d);try{
   const ast=JSON.parse(await dot(good.plan,'json')) as {objects:{name:string;_gvid:number}[];edges:{tail:number;head:number;id?:string}[]};
   const changed={...ast,edges:ast.edges.map(e=>({...e,head:ast.objects.find(o=>o.name==='n1')!._gvid}))};
   const endpoint=await verifyPresentationQuality(good.page,{svg:good.svg,document:d,plan:good.plan,nativeAst:changed});
   expect(result(endpoint,'graphviz-edge-endpoints-and-paths')).toBe('fail');
   const edgeStart=good.svg.indexOf('class="edge"'),pathStart=good.svg.indexOf('<path',edgeStart),dStart=good.svg.indexOf('d="',pathStart)+3,dEnd=good.svg.indexOf('"',dStart);
   expect(edgeStart).toBeGreaterThanOrEqual(0);expect(pathStart).toBeGreaterThan(edgeStart);expect(dEnd).toBeGreaterThan(dStart);
   const mutated=good.svg.slice(0,dStart)+'M 10000,10000 L 10100,10100'+good.svg.slice(dEnd);
   const shifted=await verifyPresentationQuality(good.page,{svg:mutated,document:d,plan:good.plan,nativeAst:ast});
   expect(result(shifted,'graphviz-edge-endpoints-and-paths')).toBe('fail');
   // Keeping the string elsewhere cannot replace its element-local label carrier.
   const original='Source API';const moved=good.svg.replace(original,'Changed label').replace('</svg>',`<text>${original}</text></svg>`);
   const relocated=await verifyPresentationQuality(good.page,{svg:moved,document:d,plan:good.plan,nativeAst:ast});
   expect(result(relocated,'graphviz-native-carriers')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('checks entity fields in their owning native table rows and exact AST ports',async()=>{
  const d=doc({id:'entity-quality',kind:'structure',form:'entities',question:'What is stored?',nodes:[{id:'record',label:'Record'},{id:'owner',label:'Owner'}],structure:{entities:[{node:'record',fields:[{id:'record-id',name:'id',type:'RecordId',keys:['pk'],nullable:false},{id:'workspace-id',name:'workspace_id',type:'RecordId',keys:['fk'],nullable:false}]},{node:'owner',fields:[{id:'owner-key',name:'id',type:'OwnerId',keys:['pk']}]}],references:[{id:'owned',from:{node:'record',fieldId:'workspace-id'},to:{node:'owner',fieldId:'owner-key'},label:'belongs to',fromCardinality:'exactly-one',toCardinality:'zero-or-many'}]}});
  const good=await check(d);try{
   expect(result(good.checks,'graphviz-entity-field-rows')).toBe('pass');
   expect(result(good.checks,'graphviz-edge-endpoints-and-paths')).toBe('pass');
   const ast=JSON.parse(await dot(good.plan,'json')) as {objects:{name:string;label?:string}[];edges:unknown[]};
   const tampered={...ast,objects:ast.objects.map(o=>o.name==='n1'?{...o,label:String(o.label).replace('RecordId','OtherType')}:o)};
   const wrong=await verifyPresentationQuality(good.page,{svg:good.svg,document:d,plan:good.plan,nativeAst:tampered});
   expect(result(wrong,'graphviz-entity-field-rows')).toBe('fail');
   const movedType=good.svg.replace('id: RecordId','gone: RecordId').replace('</svg>','<text>id: RecordId</text></svg>');
   const wrongRow=await verifyPresentationQuality(good.page,{svg:movedType,document:d,plan:good.plan,nativeAst:ast});
   expect(result(wrongRow,'graphviz-entity-field-rows')).toBe('fail');
   const missingRepeatedMarker=good.svg.replace('FK · NOT NULL','FK');
   const markerCheck=await verifyPresentationQuality(good.page,{svg:missingRepeatedMarker,document:d,plan:good.plan,nativeAst:ast});
   expect(result(markerCheck,'graphviz-entity-field-rows')).toBe('fail');
   const missingRange=good.svg.replace('1 → 0..*','');
   expect(missingRange).not.toBe(good.svg);
   const noRange=await verifyPresentationQuality(good.page,{svg:missingRange,document:d,plan:good.plan,nativeAst:ast});
   expect(result(noRange,'graphviz-edge-endpoints-and-paths')).toBe('fail');
   const shiftedToAdjacentRow=await good.page.locator('#frame svg').evaluate(svg=>{
    const edge=[...svg.querySelectorAll('g.edge')].find(g=>g.querySelector(':scope > title')?.textContent==='n1:n1_f2->n2:n2_f1');
    const path=edge?.querySelector(':scope > path') as SVGPathElement|undefined;
    const node=[...svg.querySelectorAll('g.node')].find(g=>g.querySelector(':scope > title')?.textContent==='n1');
    const source=node&&[...node.querySelectorAll('text')].find(t=>t.textContent?.includes('workspace_id: RecordId'));
    const adjacent=node&&[...node.querySelectorAll('text')].find(t=>t.textContent?.includes('id: RecordId'));
    if(!path||!source||!adjacent)return undefined;
    const before=path.getAttribute('d')??'',match=/^M\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/.exec(before),matrix=path.getScreenCTM();if(!match||!matrix)return undefined;
    const point=new DOMPoint(Number(match[1]),Number(match[2])).matrixTransform(matrix);
    const sourceBox=source.getBoundingClientRect(),adjacentBox=adjacent.getBoundingClientRect();
    const delta=(adjacentBox.y+adjacentBox.height/2)-(sourceBox.y+sourceBox.height/2);
    const shifted=new DOMPoint(point.x,point.y+delta).matrixTransform(matrix.inverse());
    const after=before.replace(/^M\s*-?[\d.]+[,\s]+-?[\d.]+/,`M${shifted.x},${shifted.y}`);
    return {before,after};
   });
   expect(shiftedToAdjacentRow).toBeDefined();
   const wrongPortRow=good.svg.replace(shiftedToAdjacentRow!.before,shiftedToAdjacentRow!.after);
   expect(wrongPortRow).not.toBe(good.svg);
   expect(result(await verifyPresentationQuality(good.page,{svg:wrongPortRow,document:d,plan:good.plan,nativeAst:ast}),'graphviz-edge-endpoints-and-paths')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('checks native cluster containment and ordered stack geometry',async()=>{
  const d=doc({id:'stack-quality',kind:'structure',form:'stack',question:'What is the order?',nodes:[{id:'api',label:'API',layer:'top'},{id:'engine',label:'Engine',layer:'middle'},{id:'schema',label:'Schema',layer:'bottom'}],structure:{layers:[{id:'top',label:'Top layer'},{id:'middle',label:'Middle layer'},{id:'bottom',label:'Bottom layer'}]}});
  const good=await check(d);try{
   expect(result(good.checks,'graphviz-containment-and-order')).toBe('pass');
   expect(result(good.checks,'presentation-clipping')).toBe('pass');
   expect(result(good.checks,'presentation-font-legibility')).toBe('pass');
   const reversed=good.svg.replace('<title>cluster_l1</title>','<title>cluster_swap</title>').replace('<title>cluster_l2</title>','<title>cluster_l1</title>').replace('<title>cluster_swap</title>','<title>cluster_l2</title>');
   const wrongOrder=await verifyPresentationQuality(good.page,{svg:reversed,document:d,plan:good.plan,nativeAst:JSON.parse(await dot(good.plan,'json'))});
   expect(result(wrongOrder,'graphviz-containment-and-order')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('checks nested group containment from native cluster bounds',async()=>{
  const d=doc({id:'group-quality',kind:'flow',form:'network',question:'Which zone owns the component?',groups:[{id:'platform',label:'Platform',role:'zone'},{id:'storage',label:'Storage boundary',role:'boundary',parent:'platform'}],nodes:[{id:'catalog',label:'Catalog',group:'storage'},{id:'api',label:'API',group:'platform'}],edges:[{id:'query',from:'api',to:'catalog',label:'Query'}]});
  const good=await check(d);try{expect(result(good.checks,'graphviz-containment-and-order')).toBe('pass');}finally{await good.page.close();}
  const mermaid=await check(d,'mermaid');try{expect(result(mermaid.checks,'mermaid-containment-and-order')).toBe('pass');}finally{await mermaid.page.close();}
 });

 it('binds 1.2 named Graphviz ports to owned rows, exact native selectors and drawn row sides',async()=>{
  const d=JSON.parse(await Bun.file('fixtures/showcase/definitions/umf-logical-interface-architecture.json').text()) as ReturnType<typeof doc>;
  const good=await check(d);
  try{
   expect(result(good.checks,'graphviz-node-port-rows')).toBe('pass');
   expect(result(good.checks,'graphviz-edge-endpoints-and-paths')).toBe('pass');
   const ast=JSON.parse(await dot(good.plan,'json'));
   ast.edges.find((edge:any)=>edge.id==='e2').tailport='p1:w';
   expect(result(await verifyPresentationQuality(good.page,{svg:good.svg,document:d,plan:good.plan,nativeAst:ast}),'graphviz-edge-endpoints-and-paths')).toBe('fail');
   const detachedArrow=good.svg.replace(/(<g id="e1" class="edge">[\s\S]*?<polygon[^>]*points=")([^"]+)(")/u,(_match:string,prefix:string,points:string,suffix:string)=>prefix+points.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/gu,(_pair:string,x:string,y:string)=>`${Number(x)+100},${Number(y)+100}`)+suffix);
   expect(detachedArrow).not.toBe(good.svg);
   expect(result(await verifyPresentationQuality(good.page,{svg:detachedArrow,document:d,plan:good.plan,nativeAst:JSON.parse(await dot(good.plan,'json'))}),'graphviz-edge-endpoints-and-paths')).toBe('fail');
   const altered=good.svg.replace('resolve · south','other · south');
   expect(altered).not.toBe(good.svg);
   expect(result(await verifyPresentationQuality(good.page,{svg:altered,document:d,plan:good.plan,nativeAst:JSON.parse(await dot(good.plan,'json'))}),'graphviz-node-port-rows')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('checks Mermaid node ownership and exact directed paths for a flow',async()=>{
  const d=doc({id:'mermaid-flow',kind:'flow',form:'network',question:'Where does the request go?',nodes:[{id:'client',label:'Client API'},{id:'service',label:'Service'},{id:'store',label:'Record store'}],edges:[{id:'submit',from:'client',to:'service',label:'Submit'},{id:'persist',from:'service',to:'store',label:'Persist'}]});
  const good=await check(d,'mermaid');try{
   expect(result(good.checks,'mermaid-native-node-carriers')).toBe('pass');expect(result(good.checks,'mermaid-flow-paths')).toBe('pass');
   const edgeAt=good.svg.indexOf('data-id="L_n1_n2_0"'),pathAt=good.svg.lastIndexOf('<path',edgeAt),start=good.svg.indexOf('d="',pathAt)+3,end=good.svg.indexOf('"',start);
   const shifted=good.svg.slice(0,start)+'M 10000,10000 L 10100,10100'+good.svg.slice(end);
   expect(result(await verifyPresentationQuality(good.page,{svg:shifted,document:d,plan:good.plan}),'mermaid-flow-paths')).toBe('fail');
   const moved=good.svg.replace('Client API','Wrong').replace('</svg>','<text>Client API</text></svg>');
   expect(result(await verifyPresentationQuality(good.page,{svg:moved,document:d,plan:good.plan}),'mermaid-native-node-carriers')).toBe('fail');
   const swapped=good.svg.replaceAll('Client API','__TEMP__').replaceAll('Service','Client API').replaceAll('__TEMP__','Service');
   expect(result(await verifyPresentationQuality(good.page,{svg:swapped,document:d,plan:good.plan}),'mermaid-native-node-carriers')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('checks Mermaid ER field carriers and relationship paths without claiming field ports',async()=>{
  const d=doc({id:'mermaid-er',kind:'structure',form:'entities',question:'How are the records related?',nodes:[{id:'record',label:'Record'},{id:'owner',label:'Owner'}],structure:{entities:[{node:'record',fields:[{name:'id',type:'RecordIdentifier',keys:['pk']},{name:'ownerId',type:'OwnerIdentifier',keys:['fk']}]},{node:'owner',fields:[{name:'id',type:'OwnerIdentifier',keys:['pk']}]}]}});
  const good=await check(d,'mermaid');try{
   expect(result(good.checks,'mermaid-er-fields-and-relations')).toBe('pass');
   const moved=good.svg.replace('RecordIdentifier','WrongIdentifier').replace('</svg>','<text>RecordIdentifier</text></svg>');
   const wrong=await verifyPresentationQuality(good.page,{svg:moved,document:d,plan:good.plan});
   expect(result(wrong,'mermaid-er-fields-and-relations')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('checks Mermaid stack containment and authored layer order from cluster geometry',async()=>{
  const d=doc({id:'mermaid-stack-quality',kind:'structure',form:'stack',question:'What is the order?',nodes:[{id:'api',label:'API',layer:'top'},{id:'engine',label:'Engine',layer:'middle'},{id:'schema',label:'Schema',layer:'bottom'}],structure:{layers:[{id:'top',label:'Top layer'},{id:'middle',label:'Middle layer'},{id:'bottom',label:'Bottom layer'}]}});
  const good=await check(d,'mermaid');try{
   expect(result(good.checks,'mermaid-containment-and-order')).toBe('pass');
   const layers=good.plan.elementMap.filter(e=>e.kind==='layer');
   expect(layers).toHaveLength(3);
   const ids=[...good.svg.matchAll(/id="([^"]+)"/g)].map(m=>m[1]!);
   const firstId=ids.find(id=>id.endsWith(`-${layers[0]!.nativeId}`)),secondId=ids.find(id=>id.endsWith(`-${layers[1]!.nativeId}`));
   expect(firstId).toBeDefined();expect(secondId).toBeDefined();
   const swapped=good.svg.replaceAll(firstId!, '__LAYER_SWAP__').replaceAll(secondId!, firstId!).replaceAll('__LAYER_SWAP__', secondId!);
   expect(result(await verifyPresentationQuality(good.page,{svg:swapped,document:d,plan:good.plan}),'mermaid-containment-and-order')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('preserves visible line breaks when matching Mermaid labels to their exact node',async()=>{
  const d=doc({id:'mermaid-linebreak',kind:'flow',form:'network',question:'Where?',nodes:[{id:'target',label:'Explicit target\nprojection'},{id:'tooling',label:'Tooling'}],edges:[{id:'uses',from:'target',to:'tooling'}]});
  const good=await check(d,'mermaid');try{
   expect(result(good.checks,'mermaid-native-node-carriers')).toBe('pass');
   const stripped=good.svg.replace(/<br\s*\/?\s*>/gi,'');
   expect(stripped).not.toBe(good.svg);
   expect(result(await verifyPresentationQuality(good.page,{svg:stripped,document:d,plan:good.plan}),'mermaid-native-node-carriers')).toBe('fail');
  }finally{await good.page.close();}
 });
});
