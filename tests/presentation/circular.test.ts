// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,describe,expect,it} from 'bun:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,type Browser} from 'playwright';
import {readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationBackend,type PresentationPlan} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';
import {graphvizExecutionArgs} from '../../scripts/presentation/build';
import {requiredPresentationChecks} from '../../scripts/presentation/verify';

const raw=readFileSync(resolve(import.meta.dir,'../../fixtures/reviews/definitions/miro-network-16x24.json'),'utf8');
const document=readVisualDocument(raw,'json');
const visual=document.extensions!['umf.visual'] as unknown as Visual;
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});

async function nativeCommand(plan:PresentationPlan,format:'svg'|'json'){
 const invocation=graphvizExecutionArgs(plan.execution,format),child=Bun.spawn([invocation.command,...invocation.args],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 child.stdin.write(plan.source);child.stdin.end();const [out,err,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 expect(exit).toBe(0);expect(err).toBe('');return out;
}
async function render(plan:PresentationPlan){
 if(plan.backend==='lini'){const rendered=await renderPresentationLini(plan.source);return{svg:rendered.svg,nativeAst:rendered.nativeAst};}
 if(plan.backend==='graphviz'){const [svg,json]=await Promise.all([nativeCommand(plan,'svg'),nativeCommand(plan,'json')]);return{svg,nativeAst:JSON.parse(json)};}
 const page=await browser.newPage();try{
  await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');await page.addScriptTag({path:resolve(import.meta.dir,'../../node_modules/mermaid/dist/mermaid.min.js')});
  const svg=await page.evaluate(async source=>{const api=(window as any).mermaid;api.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',look:'classic',fontFamily:'Arial, "Avenir Next", "Segoe UI", sans-serif',deterministicIds:true,deterministicIDSeed:'circular-native-test',themeVariables:{background:'#ffffff',primaryColor:'#e8f2f3',primaryTextColor:'#203746',primaryBorderColor:'#577782',lineColor:'#587582',fontSize:'16px'}});return(await api.render('circular-native-test',source)).svg;},plan.source);
  return{svg,nativeAst:undefined};
 }finally{await page.close();}
}
async function checks(plan:PresentationPlan,svg:string,nativeAst?:unknown,reviewDocument=document){const page=await browser.newPage();try{return await verifyPresentationQuality(page,{svg,document:reviewDocument,plan,nativeAst});}finally{await page.close();}}
async function mutate(svg:string,operation:'missing-edge'|'redirect-edge'|'scramble-order'|'off-circle'|'remove-dashes'|'rectangle-to-ellipse'){
 const page=await browser.newPage();try{
  await page.setContent('<!doctype html><div id="fixture"></div>');await page.locator('#fixture').evaluate((fixture,markup)=>{fixture.innerHTML=markup;},svg);
  return await page.locator('svg').evaluate((root,operation)=>{
   const node=(native:string)=>[...root.querySelectorAll<SVGGElement>('g.node')].find(group=>group.querySelector(':scope > title')?.textContent===native||group.id.endsWith(`-${native}`));
   if(operation==='missing-edge')root.querySelector('path[data-id$="-n1-n2"]')?.remove();
   if(operation==='redirect-edge'){const edge=root.querySelector<SVGPathElement>('path[data-id$="-n1-n2"]');if(edge){edge.dataset.id=edge.dataset.id!.replace('-n1-n2','-n1-n3');edge.id=edge.id.replace('-n1-n2','-n1-n3');}}
   if(operation==='scramble-order'){const a=node('n1'),b=node('n2'),at=a?.getAttribute('transform'),bt=b?.getAttribute('transform');if(a&&b&&at&&bt){a.setAttribute('transform',bt);b.setAttribute('transform',at);}}
   if(operation==='off-circle')node('n1')?.setAttribute('transform','translate(0,0)');
   if(operation==='remove-dashes'){const style=root.querySelector('style');if(style)style.textContent=style.textContent?.replace(/stroke-dasharray:\s*6(?:px)?\s*[, ]\s*4(?:px)?\s*!important/gu,'stroke-dasharray: 2 !important')??style.textContent;}
   if(operation==='rectangle-to-ellipse'){const svg=root as SVGSVGElement,group=node('n1'),polygon=group?.querySelector<SVGPolygonElement>(':scope > polygon');if(group&&polygon){const bounds=polygon.getBBox(),ellipse=svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg','ellipse');ellipse.setAttribute('cx',String(bounds.x+bounds.width/2));ellipse.setAttribute('cy',String(bounds.y+bounds.height/2));ellipse.setAttribute('rx',String(bounds.width/2));ellipse.setAttribute('ry',String(bounds.height/2));polygon.replaceWith(ellipse);}}
   return root.outerHTML;
  },operation);
 }finally{await page.close();}
}

describe('native circular presentation profile',()=>{
 it('renders the authored cyclic order on all three pinned backends with bounded, source-bound evidence',async()=>{
  for(const backend of ['graphviz','lini','mermaid'] as const){
   const plan=compilePresentation(document,{backend,theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan.diagnostics));
   const rendered=await render(plan),quality=await checks(plan,rendered.svg,rendered.nativeAst),failures=quality.filter(check=>check.result!=='pass');
   expect(quality.map(check=>check.check).sort()).toEqual(requiredPresentationChecks(backend,visual));expect(failures).toEqual([]);
   expect(quality.find(check=>check.check==='presentation-circular-layout')?.details).toContain('clockwise cyclic order matches');
   if(backend==='graphviz'){expect(plan.execution).toEqual({runtime:'graphviz',layoutEngine:'neato',nodePositions:'fixed'});expect(plan.source).toContain('layout="neato"');expect(plan.source).toContain('pos=');expect(graphvizExecutionArgs(plan.execution,'svg')).toEqual({command:'neato',args:['-n2','-Tsvg']});expect(()=>graphvizExecutionArgs({...plan.execution,extra:'unchecked'} as any,'svg')).toThrow();expect(()=>graphvizExecutionArgs([] as any,'svg')).toThrow();}
   if(backend==='lini'){expect(plan.source).toContain('pin: center; translate:');expect(plan.source).toContain('routing: straight;');}
   if(backend==='mermaid'){expect(plan.source).toContain('block-beta');expect(plan.approximations.find(item=>item.sourcePath==='/extensions/umf.visual/layout')?.code).toBe('CIRCULAR_NATIVE_GRID');expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(24);}
  }
 },{timeout:90_000});

 it('keeps absent edge kind and route intent unspecified in Mermaid circular composition',async()=>{
  const generic=structuredClone(visual) as Visual;generic.nodes=visual.nodes!.slice(0,3);generic.edges=visual.edges!.slice(0,2).map(edge=>{const copy={...edge};delete copy.kind;delete copy.routing;return copy;});generic.layout={kind:'circular',order:generic.nodes.map(node=>node.id)};generic.audience='developer';generic.steps=[{id:'step-one',title:'Inspect nodes',focus:[generic.nodes[0]!.id]}];generic.nodes[0]!.evidence=[{path:'fixtures/example.json'}];generic.edges[0]!.evidence=[{path:'fixtures/example.json'}];
  const genericDocument=structuredClone(document);genericDocument.extensions!['umf.visual']=generic;
  const plan=compilePresentation(genericDocument,{backend:'mermaid',theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan.diagnostics));expect(plan.source).toContain('n1 --> n2');expect(plan.source).toContain('n2 --> n3');expect(plan.approximations.filter(item=>item.sourcePath.includes('/edges/')).some(item=>item.sourcePath.endsWith('/routing')||item.sourcePath.endsWith('/kind'))).toBe(false);expect(plan.omissions.some(item=>item.sourcePath==='/extensions/umf.visual/audience')).toBe(true);expect(plan.omissions.some(item=>item.sourcePath==='/extensions/umf.visual/steps')).toBe(true);expect(plan.omissions.some(item=>item.sourcePath==='/extensions/umf.visual/nodes/0/evidence')).toBe(true);expect(plan.omissions.some(item=>item.sourcePath==='/extensions/umf.visual/edges/0/evidence')).toBe(true);
  const rendered=await render(plan),quality=await checks(plan,rendered.svg,undefined,genericDocument);expect(quality.filter(check=>check.result!=='pass')).toEqual([]);
 },{timeout:60_000});

 it('renders one- and two-node circular diagrams on each backend',async()=>{
  for(const count of [1,2])for(const backend of ['graphviz','lini','mermaid'] as const){
   const subset=structuredClone(visual) as Visual;subset.nodes=visual.nodes!.slice(0,count);const ids=new Set(subset.nodes.map(node=>node.id)),links=(visual.edges??[]).filter(edge=>ids.has(edge.from)&&ids.has(edge.to));if(links.length)subset.edges=links;else delete subset.edges;subset.layout={kind:'circular',order:subset.nodes.map(node=>node.id)};const review=structuredClone(document);review.extensions!['umf.visual']=subset;
   const plan=compilePresentation(review,{backend,theme:'presentation/1'});if(!plan.ok)throw Error(`${backend} ${count}-node ring: ${JSON.stringify(plan.diagnostics)}`);const rendered=await render(plan),quality=await checks(plan,rendered.svg,rendered.nativeAst,review);expect(quality.filter(check=>check.result!=='pass'),`${backend} ${count}-node proof`).toEqual([]);
  }
 },{timeout:90_000});

 it('rejects missing and redirected chords, scrambled/off-circle nodes, lost data dashes, and a rectangle changed to an ellipse',async()=>{
  const mermaidPlan=compilePresentation(document,{backend:'mermaid',theme:'presentation/1'});expect(mermaidPlan.ok).toBe(true);if(!mermaidPlan.ok)throw Error();const mermaid=await render(mermaidPlan);
  for(const operation of ['missing-edge','redirect-edge','scramble-order','off-circle','remove-dashes'] as const){const altered=await mutate(mermaid.svg,operation),result=await checks(mermaidPlan,altered);expect(result.some(check=>check.result==='fail'),operation).toBe(true);}
  const graphvizPlan=compilePresentation(document,{backend:'graphviz',theme:'presentation/1'});expect(graphvizPlan.ok).toBe(true);if(!graphvizPlan.ok)throw Error();const graphviz=await render(graphvizPlan),altered=await mutate(graphviz.svg,'rectangle-to-ellipse');expect(altered).toContain('<ellipse');const result=await checks(graphvizPlan,altered,graphviz.nativeAst);expect(result.find(check=>check.check==='presentation-circular-layout')?.result).toBe('fail');
 },{timeout:90_000});
});
