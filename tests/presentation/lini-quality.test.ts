// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,describe,expect,it} from 'bun:test';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,type Browser, type Page} from 'playwright';
import {createVisualDocument,getVisual,readVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';
import {verifyLiniPresentationQuality} from '../../scripts/presentation/lini-quality';

let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>{await browser?.close();},{timeout:30_000});

const required=['lini-native-ast','lini-native-carriers','lini-connection-endpoints','lini-containment-and-order','lini-entity-field-rows'];
const doc=(visual:Visual)=>createVisualDocument(visual,'lini-quality:'+visual.id,'1.1.0');
const result=(checks:Awaited<ReturnType<typeof verifyLiniPresentationQuality>>,name:string)=>checks.find(check=>check.check===name)?.result;
async function renderDocument(document:ReturnType<typeof createVisualDocument>,direction:'LR'|'TB'='LR'){
 const plan=compilePresentation(document,{backend:'lini',theme:'presentation/1',direction});
 expect(plan.ok).toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan));
 const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900}});
 await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden}#frame{width:1600px;height:900px}#frame svg{width:100%;height:100%}</style><div id="frame"></div>',{waitUntil:'domcontentloaded'});
 await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},native.svg);
 const checks=await verifyLiniPresentationQuality(page,{document,plan,nativeAst:native.nativeAst});
 return{document,plan,page,svg:native.svg,nativeAst:native.nativeAst,checks};
}
async function render(visual:Visual){return renderDocument(doc(visual));}
async function recheck(page:Page,document:ReturnType<typeof doc>,plan:PresentationPlan,nativeAst:unknown){return verifyLiniPresentationQuality(page,{document,plan,nativeAst});}
function expectAll(checks:Awaited<ReturnType<typeof verifyLiniPresentationQuality>>,timeline=false,directedFlowRanks=false){expect(checks.map(check=>check.check)).toEqual(timeline?[...required.slice(0,4),'lini-timeline-events-and-date-scale',required[4]!]:directedFlowRanks?[...required.slice(0,4),'lini-directed-flow-dependency-ranks','lini-node-cards-non-overlap',required[4]!]:required);const failed=checks.filter(check=>check.result!=='pass');if(failed.length)throw new Error(JSON.stringify(failed));}

describe('pinned Lini presentation quality',()=>{
 it('places ranked root-grid captions beside vertical same-column connectors',async()=>{
  const fixtures:[string,string[],string,number][]=[
   ['column-normal-four',['alpha','beta','gamma','delta'],'alpha-to-delta',4],
   ['column-normal-five',['cedar','birch','elm','ash','maple'],'cedar-to-ash',5],
  ];
  for(const[id,ids,edgeId,expectedNodes]of fixtures){
   const [sourceId,leftId,rightId,targetId,...extraIds]=ids;
   const visual:Visual={id,kind:'flow',form:'network',question:'Which paths connect these components?',groups:[{id:`zone-${id}`,label:`Zone ${id}`,role:'boundary'}],nodes:[
    {id:targetId!,label:`Target ${targetId}`},
    ...(extraIds.length?[{id:extraIds[0]!,label:`Additional ${extraIds[0]}`}]:[]),
    {id:rightId!,label:`Peer ${rightId}`},{id:sourceId!,label:`Source ${sourceId}`,group:`zone-${id}`},{id:leftId!,label:`Peer ${leftId}`},
   ],edges:[
    {id:`${sourceId}-left`,from:sourceId!,to:leftId!},{id:`${sourceId}-right`,from:sourceId!,to:rightId!},
    ...(extraIds.length?[{id:`${rightId}-target`,from:rightId!,to:targetId!},{id:`${targetId}-extra`,from:targetId!,to:extraIds[0]!}]:[{id:`${leftId}-target`,from:leftId!,to:targetId!}]),
    {id:edgeId,from:sourceId!,to:targetId!,label:`Connect ${sourceId} to ${targetId}`},
   ]};
   const native=await render(visual);
   try{
    expect(native.plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(expectedNodes);
    if(result(native.checks,'lini-connection-endpoints')!=='pass')throw Error(`${id}: ${native.checks.find(check=>check.check==='lini-connection-endpoints')?.details}`);
    const target=native.plan.elementMap.find(item=>item.logicalId===edgeId&&item.kind==='edge')?.nativeId;
    expect(target).toBeTruthy();
    const link=native.page.locator(`g.lini-link.lini-style-${target} > path:not(.lini-marker)`),caption=native.page.locator(`g.lini-link.lini-style-${target} > text.lini-link-label`);
    const geometry=await Promise.all([link.boundingBox(),caption.boundingBox()]);expect(geometry[0]&&geometry[1]).toBeTruthy();
    if(!geometry[0]||!geometry[1])throw Error('Native vertical connector or caption geometry is missing.');
    expect(geometry[0].x+geometry[0].width<=geometry[1].x||geometry[1].x+geometry[1].width<=geometry[0].x).toBe(true);
    await caption.evaluate(element=>{const text=element as SVGTextElement,path=text.parentElement?.querySelector('path:not(.lini-marker)') as SVGPathElement;if(!path)throw Error('Native connector path is missing');const point=path.getPointAtLength(path.getTotalLength()/2),matrix=path.getScreenCTM();if(!matrix)throw Error('Native connector has no screen transform');const screen=new DOMPoint(point.x,point.y).matrixTransform(matrix),box=text.getBoundingClientRect();text.style.transform=`translate(${screen.x-(box.left+box.right)/2}px, ${screen.y-(box.top+box.bottom)/2}px)`;});
    expect(result(await recheck(native.page,native.document,native.plan,native.nativeAst),'lini-connection-endpoints')).toBe('fail');
   }finally{await native.page.close();}
  }
 },{timeout:60_000});

 it('keeps the flow-lanes root-flow caption normal unchanged',()=>{
  const document=readVisualDocument(readFileSync(resolve('fixtures/visual/inventory/beacon-field-guide.json'),'utf8'),'json'),plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});
  expect(plan.ok).toBe(true);if(!plan.ok)return;
  expect(plan.source).toContain('g1.n1 -> g2.n2 .e1 { along: 0.5; } [ "opens a ticket" { translate: 0 -88; font-size: 16; } ]');
 });

 it('preserves each exact-date event on a proportional native axis without a quantitative Y scale',async()=>{
  const document=readVisualDocument(readFileSync(resolve('fixtures/visual/forms/helix-releases.json'),'utf8'),'json'),native=await renderDocument(document);
  try{
   expectAll(native.checks,true);
   const visual=getVisual(document),events=visual.timeline?.events??[],eventMaps=native.plan.elementMap.filter(item=>item.kind==='event');
   expect(eventMaps).toHaveLength(events.length);expect(eventMaps.map(item=>item.sourcePath)).toEqual(events.map((_,index)=>`/extensions/umf.visual/timeline/events/${index}`));
   expect(native.plan.source).toContain('points: -540 0, 540 0');expect(native.plan.source).not.toContain('layout: chart;');
   expect(native.plan.approximations.find(item=>item.sourcePath==='/extensions/umf.visual/timeline/events')?.representation).toContain('rows carry no lane, measure, or chronology meaning');
   const baseline=native.svg;
   const mutated=async(action:'detach-marker'|'move-caption'|'remove-marker'|'wrong-text')=>{await native.page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},baseline);await native.page.locator('#frame svg').first().evaluate((root,operation)=>{const svg=root as SVGSVGElement;if(operation==='detach-marker'||operation==='remove-marker'){const marker=svg.querySelector('g.lini-node[data-id="mark1"]');if(!marker)throw Error('first renderer-owned date marker is missing');if(operation==='remove-marker')marker.remove();else marker.setAttribute('transform',(marker.getAttribute('transform')??'')+' translate(60,0)');}else if(operation==='move-caption'){const label=svg.querySelector('g.lini-node[data-id="event1"]'),other=svg.querySelector('g.lini-node[data-id="event2"]');if(!label||!other)throw Error('event caption carrier is missing');label.setAttribute('transform',other.getAttribute('transform')??'');}else{const label=svg.querySelector('g.lini-node[data-id="event1"] text.lini-text');if(!label)throw Error('first event caption is missing');label.textContent='altered date';}},action);return recheck(native.page,native.document,native.plan,native.nativeAst);};
   const detachedMarker=await mutated('detach-marker');
   expect(result(detachedMarker,'lini-timeline-events-and-date-scale')).toBe('fail');
   const movedLabel=await mutated('move-caption');
   expect(result(movedLabel,'lini-timeline-events-and-date-scale')).toBe('fail');
   const missingMarker=await mutated('remove-marker');
   expect(result(missingMarker,'lini-timeline-events-and-date-scale')).toBe('fail');
   const wrongText=await mutated('wrong-text');
   expect(result(wrongText,'lini-native-carriers')).toBe('fail');
  }finally{await native.page.close();}
 },{timeout:60_000});

 it('renders unanchored annotations as borderless footer text and rejects moved carrier text',async()=>{
  const document=createVisualDocument({id:'unanchored-annotations',kind:'flow',form:'network',question:'Where do notes belong?',layout:{kind:'flow',direction:'LR',order:['region-a','region-b']},groups:[{id:'region-a',label:'Request handling',role:'region',layout:{kind:'flow',direction:'LR',order:['api','worker']}},{id:'region-b',label:'Persistence',role:'region',layout:{kind:'flow',direction:'LR',order:['queue','database']}}],nodes:[{id:'api',label:'API',group:'region-a'},{id:'worker',label:'Worker',group:'region-a'},{id:'queue',label:'Queue',group:'region-b'},{id:'database',label:'Database',group:'region-b'}],edges:[{id:'request',from:'api',to:'worker',routing:{kind:'straight'}},{id:'handoff',from:'worker',to:'queue',routing:{kind:'straight'}},{id:'persist',from:'queue',to:'database',routing:{kind:'straight'}}],annotations:[{id:'heading',text:'Inbound path'},{id:'note',text:'Retry behavior is outside this sketch.'}]},'test:unanchored-annotations','1.4.0'),native=await renderDocument(document);
  try{
   expect(result(native.checks,'lini-native-carriers')).toBe('pass');
   expect(result(native.checks,'lini-connection-endpoints')).toBe('pass');
   expect(result(native.checks,'lini-containment-and-order')).toBe('pass');
   expect(native.plan.elementMap.filter(item=>item.kind==='annotation').map(item=>item.nativeId)).toEqual(['a1','a2']);
   const layout=await native.page.evaluate(()=>{
    const box=(id:string)=>{const element=globalThis.document.querySelector(`g.lini-node[data-id="${id}"]`),rect=element?.getBoundingClientRect();return rect?{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom}:null;};
    const first=globalThis.document.querySelector('g.lini-node[data-id="a1"]'),second=globalThis.document.querySelector('g.lini-node[data-id="a2"]');
    return{graph:box('diagram-content'),footer:box('annotation-footer'),firstText:first?.querySelector('text.lini-text')?.textContent?.trim()??'',secondText:second?.querySelector('text.lini-text')?.textContent?.trim()??'',firstStyle:first?.getAttribute('style')??'',secondStyle:second?.getAttribute('style')??''};
   });
   expect(layout.graph).not.toBeNull();expect(layout.footer).not.toBeNull();expect(layout.firstText).toBe('Inbound path');expect(layout.secondText).toBe('Retry behavior is outside this sketch.');
   expect(layout.footer!.top).toBeGreaterThanOrEqual(layout.graph!.bottom-2);
   for(const style of [layout.firstStyle,layout.secondStyle]){expect(style).toContain('fill: none');expect(style).toContain('stroke: none');expect(style).toContain('stroke-width: 0');}
   const moved=await native.page.locator('g.lini-node[data-id="a1"] > text.lini-text').evaluate(label=>{
    const recipient=globalThis.document.querySelector('g.lini-node[data-id="n1"]');if(!recipient)throw Error('Lini semantic node carrier was not found');recipient.append(label);return(globalThis.document.querySelector('svg') as SVGSVGElement).outerHTML;
   });
   expect(result(await recheck(native.page,native.document,native.plan,native.nativeAst),'lini-native-carriers')).toBe('fail');
   expect(moved).toContain('Inbound path');
  }finally{await native.page.close();}
 },{timeout:45_000});

 it('renders curved edge intent with a native cubic path and rejects a straightened mutation',async()=>{
  const document=createVisualDocument({id:'curved-edge-proof',kind:'flow',form:'network',question:'Which boundary does this path cross?',groups:[{id:'outer',label:'Outer environment',role:'boundary'},{id:'inner',label:'Inner environment',role:'boundary',parent:'outer'}],nodes:[{id:'store',label:'Data store',group:'inner',shape:'cylinder'},{id:'process',label:'Process outside',role:'process',detail:'Process'}],edges:[{id:'connects',from:'process',to:'store',label:'connects to',routing:{kind:'curved'}}]},'test:curved-edge-proof','1.4.0');
  const good=await renderDocument(document);
  try{
   expect(good.plan.source).toContain('routing: natural;');
   expect(good.plan.source).toContain('n2:right -> g1.g2.n1:bottom');
   expect(good.plan.approximations.find(item=>item.sourcePath==='/extensions/umf.visual/edges/0/routing')?.code).toBeUndefined();
   expect(result(good.checks,'lini-connection-endpoints')).toBe('pass');
   const visual=getVisual(document),groups=visual.groups??[],targetGroup=groups.find(group=>group.id===visual.nodes?.find(node=>node.id==='store')?.group),ancestorIds:string[]=[];let ancestor=targetGroup;while(ancestor){ancestorIds.unshift(ancestor.id);ancestor=ancestor.parent?groups.find(group=>group.id===ancestor!.parent):undefined;}
   const ancestorNativeIds=ancestorIds.map(id=>good.plan.elementMap.find(item=>item.kind==='group'&&item.logicalId===id)?.nativeId).filter((id):id is string=>!!id);
   const labelPlacement=await good.page.evaluate(nativeIds=>{
    const rect=(selector:string)=>{const element=globalThis.document.querySelector(selector);if(!element)return null;const box=element.getBoundingClientRect();return{left:box.left,right:box.right,top:box.top,bottom:box.bottom};};
    return{label:rect('g.lini-link.lini-style-e1 > text.lini-link-label'),frames:nativeIds.map(id=>rect(`g.lini-node[data-id="${id}"] > rect`))};
   },ancestorNativeIds);
   expect(labelPlacement.label).not.toBeNull();expect(labelPlacement.frames).toHaveLength(ancestorNativeIds.length);expect(ancestorNativeIds.length).toBeGreaterThan(0);
   if(labelPlacement.label&&labelPlacement.frames.length){
    const {label,frames}=labelPlacement,overlaps=(frame:NonNullable<typeof frames[number]>)=>{const vertical=(x:number)=>label.left<=x+1&&label.right>=x-1&&label.bottom>=frame.top&&label.top<=frame.bottom,horizontal=(y:number)=>label.top<=y+1&&label.bottom>=y-1&&label.right>=frame.left&&label.left<=frame.right;return vertical(frame.left)||vertical(frame.right)||horizontal(frame.top)||horizontal(frame.bottom);};
    expect(label.right).toBeLessThan(frames[0]!.left);for(const frame of frames)if(frame)expect(overlaps(frame)).toBe(false);else expect(frame).not.toBeNull();
   }
   const legacySource=good.plan.source.replace('along: 0.1;','along: 0.35;');expect(legacySource).not.toBe(good.plan.source);
   const legacyNative=await renderPresentationLini(legacySource),legacyPage=await browser.newPage({viewport:{width:1600,height:900}});
   try{
    await legacyPage.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden}#frame{width:1600px;height:900px}#frame svg{width:100%;height:100%}</style><div id="frame"></div>');
    await legacyPage.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},legacyNative.svg);
    const legacyPlacement=await legacyPage.evaluate(nativeIds=>{const label=globalThis.document.querySelector('g.lini-link.lini-style-e1 > text.lini-link-label')?.getBoundingClientRect(),frames=nativeIds.map(id=>globalThis.document.querySelector(`g.lini-node[data-id="${id}"] > rect`)?.getBoundingClientRect());return label&&frames.every(Boolean)?{label:{left:label.left,right:label.right,top:label.top,bottom:label.bottom},frames:frames.map(frame=>({left:frame!.left,right:frame!.right,top:frame!.top,bottom:frame!.bottom}))}:null;},ancestorNativeIds);
    expect(legacyPlacement).not.toBeNull();
    if(legacyPlacement){const parent=legacyPlacement.frames[0]!;expect(legacyPlacement.label.left<=parent.left+1&&legacyPlacement.label.right>=parent.left-1&&legacyPlacement.label.bottom>=parent.top&&legacyPlacement.label.top<=parent.bottom).toBe(true);}
   }finally{await legacyPage.close();}
   const link=good.page.locator('g.lini-link.lini-style-e1 > path:not(.lini-marker)');
   const original=await link.getAttribute('d');expect(original).toMatch(/[CcQqSsAa]/);
   await link.evaluate(path=>{const line=path as SVGPathElement,length=line.getTotalLength(),start=line.getPointAtLength(0),end=line.getPointAtLength(length);line.setAttribute('d',`M ${start.x} ${start.y} L ${end.x} ${end.y}`);});
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
   const forged={...good.plan,approximations:good.plan.approximations.map(item=>item.sourcePath==='/extensions/umf.visual/edges/0/routing'?{...item,code:'ROUTING_NATIVE_INTERPOLATION' as const}:item)};
   expect(result(await verifyLiniPresentationQuality(good.page,{document:good.document,plan:forged,nativeAst:good.nativeAst}),'lini-connection-endpoints')).toBe('fail');
  }finally{await good.page.close();}
 },{timeout:45_000});

 it('centers sibling-group curve captions in the inter-group gap and rejects frame crossings',async()=>{
  const document=createVisualDocument({id:'renamed-sibling-regions',kind:'flow',form:'network',question:'Where does the connector go?',groups:[{id:'left-region',label:'Left region',role:'region'},{id:'right-region',label:'Right region',role:'region'}],nodes:[{id:'left-worker',label:'Worker',group:'left-region',ports:[{id:'leaving',side:'east'}]},{id:'right-store',label:'Store',group:'right-region',ports:[{id:'arriving',side:'west'}]}],edges:[{id:'handoff-link',from:'left-worker',fromPort:'leaving',to:'right-store',toPort:'arriving',label:'hands off',routing:{kind:'curved'}}]},'test:renamed-sibling-regions','1.4.0'),native=await renderDocument(document);
  try{
   expect(native.plan.source).toContain('along: 0.5;');
   expect(native.plan.source).toContain('[ "hands off" { translate: 0 -24; } ]');
   expect(result(native.checks,'lini-connection-endpoints')).toBe('pass');
   const curveClearance=await native.page.evaluate(()=>{const label=globalThis.document.querySelector('g.lini-link.lini-style-e1 > text.lini-link-label'),path=globalThis.document.querySelector('g.lini-link.lini-style-e1 > path:not(.lini-marker)');if(!label||!path)return-1;const rect=label.getBoundingClientRect(),line=path as SVGPathElement,length=line.getTotalLength(),matrix=line.getScreenCTM()!;let minimum=Infinity;for(let i=0;i<=180;i++){const point=line.getPointAtLength(length*i/180),screen=new DOMPoint(point.x,point.y).matrixTransform(matrix),dx=Math.max(rect.left-screen.x,0,screen.x-rect.right),dy=Math.max(rect.top-screen.y,0,screen.y-rect.bottom);minimum=Math.min(minimum,Math.hypot(dx,dy));}return minimum;});
   expect(curveClearance).toBeGreaterThanOrEqual(2);
   const measured=await native.page.evaluate(()=>{const label=globalThis.document.querySelector('g.lini-link.lini-style-e1 > text.lini-link-label'),left=globalThis.document.querySelector('g.lini-node[data-id="g1"] > rect'),right=globalThis.document.querySelector('g.lini-node[data-id="g2"] > rect');if(!label||!left||!right)return null;const bounds=(element:Element)=>{const b=element.getBoundingClientRect();return{left:b.left,right:b.right,top:b.top,bottom:b.bottom};};return{label:bounds(label),left:bounds(left),right:bounds(right)};});
   expect(measured).not.toBeNull();
   if(measured){expect(measured.label.left).toBeGreaterThan(measured.left.right);expect(measured.label.right).toBeLessThan(measured.right.left);}
   const label=native.page.locator('g.lini-link.lini-style-e1 > text.lini-link-label'),originalY=await label.getAttribute('y');
   await label.evaluate((element)=>{const text=element as SVGTextElement,path=globalThis.document.querySelector('g.lini-link.lini-style-e1 > path:not(.lini-marker)') as SVGPathElement,point=path.getPointAtLength(path.getTotalLength()/2);text.setAttribute('y',String(point.y));});
   expect(result(await recheck(native.page,native.document,native.plan,native.nativeAst),'lini-connection-endpoints')).toBe('fail');
   await label.evaluate((element,y)=>{if(y!==null)(element as SVGTextElement).setAttribute('y',y);},originalY);
   const crossed=await native.page.locator('g.lini-link.lini-style-e1 > text.lini-link-label').evaluate((label)=>{const text=label as SVGTextElement,frame=globalThis.document.querySelector('g.lini-node[data-id="g1"] > rect')! as SVGGraphicsElement,frameBox=frame.getBoundingClientRect(),labelBox=text.getBoundingClientRect(),target={x:frameBox.right,y:(frameBox.top+frameBox.bottom)/2},dx=target.x-(labelBox.left+labelBox.right)/2,dy=target.y-(labelBox.top+labelBox.bottom)/2,matrix=text.getScreenCTM()!,localX=matrix.inverse().a*dx+matrix.inverse().c*dy,localY=matrix.inverse().b*dx+matrix.inverse().d*dy,x=Number(text.getAttribute('x')??0),y=Number(text.getAttribute('y')??0);text.setAttribute('x',String(x+localX));text.setAttribute('y',String(y+localY));const moved=text.getBoundingClientRect(),overlaps=moved.left<frameBox.right&&moved.right>frameBox.left&&moved.top<frameBox.bottom&&moved.bottom>frameBox.top,inside=moved.left>=frameBox.left+2&&moved.right<=frameBox.right-2&&moved.top>=frameBox.top+2&&moved.bottom<=frameBox.bottom-2;return{overlaps,inside};});
   expect(crossed.overlaps&&!crossed.inside).toBe(true);
   const frameFailure=(await recheck(native.page,native.document,native.plan,native.nativeAst)).find(check=>check.check==='lini-connection-endpoints');
   expect(frameFailure?.result).toBe('fail');expect(frameFailure?.details).toContain('owned caption crosses native group frame');
  }finally{await native.page.close();}
 },{timeout:45_000});

 it('offsets grouped flow captions from routed paths using endpoint member order',async()=>{
  const document=createVisualDocument({id:'renamed-group-caption-flow',kind:'flow',form:'network',question:'Which group members are connected?',layout:{kind:'flow',direction:'LR',order:['source-region','middle-region','target-region']},groups:[{id:'source-region',label:'Source region',role:'region'},{id:'middle-region',label:'Middle region',role:'region'},{id:'target-region',label:'Target region',role:'region'}],nodes:[{id:'origin',label:'Origin',group:'source-region'},{id:'origin-peer',label:'Origin peer',group:'source-region'},{id:'middle-node',label:'Unrelated middle',group:'middle-region'},{id:'same-rank',label:'Same rank',group:'target-region'},{id:'lower-rank-a',label:'Lower rank A',group:'target-region'},{id:'lower-rank-b',label:'Lower rank B',group:'target-region'}],edges:[{id:'same-row-link',from:'origin',to:'same-rank',label:'same row'},{id:'offset-link',from:'origin',to:'lower-rank-b',label:'lower target'}]},'test:renamed-group-caption-flow','1.2.0'),native=await renderDocument(document);
  try{
   const geometry=await native.page.evaluate(()=>[...globalThis.document.querySelectorAll('g.lini-link')].map(link=>{const path=link.querySelector(':scope > path:not(.lini-marker)') as SVGPathElement|undefined,label=link.querySelector(':scope > text.lini-link-label');if(!path||!label)return null;const bounds=label.getBoundingClientRect(),pathBounds=path.getBoundingClientRect(),length=path.getTotalLength(),matrix=path.getScreenCTM();if(!matrix)return null;let clearance=Infinity;for(let index=0;index<=180;index++){const point=path.getPointAtLength(length*index/180),screen=new DOMPoint(point.x,point.y).matrixTransform(matrix),dx=Math.max(bounds.left-screen.x,0,screen.x-bounds.right),dy=Math.max(bounds.top-screen.y,0,screen.y-bounds.bottom);clearance=Math.min(clearance,Math.hypot(dx,dy));}return{text:label.textContent?.trim(),clearance,label:{left:bounds.left,top:bounds.top,right:bounds.right,bottom:bounds.bottom},path:{left:pathBounds.left,top:pathBounds.top,right:pathBounds.right,bottom:pathBounds.bottom,d:path.getAttribute('d')}};}));
   expectAll(native.checks);
   expect(geometry).toHaveLength(2);expect(geometry.every(item=>!!item&&item.clearance>=8)).toBe(true);
   const label=native.page.locator('g.lini-link.lini-style-e1 > text.lini-link-label'),restore=async()=>native.page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},native.svg);await label.evaluate(element=>{const text=element as SVGTextElement,path=globalThis.document.querySelector('g.lini-link.lini-style-e1 > path:not(.lini-marker)') as SVGPathElement,point=path.getPointAtLength(path.getTotalLength()/2);text.setAttribute('x',String(point.x));text.setAttribute('y',String(point.y));});
   expect(result(await recheck(native.page,native.document,native.plan,native.nativeAst),'lini-connection-endpoints')).toBe('fail');
   await restore();
   await label.evaluate(element=>{const text=element as SVGTextElement,frame=globalThis.document.querySelector('g.lini-node[data-id="g2"] > rect') as SVGRectElement;if(!frame)throw Error('unrelated native group frame missing');const labelBox=text.getBoundingClientRect(),frameBox=frame.getBoundingClientRect();text.style.transform=`translate(${frameBox.left+frameBox.width/2-(labelBox.left+labelBox.right)/2}px, ${frameBox.top+frameBox.height/2-(labelBox.top+labelBox.bottom)/2}px)`;});
   expect(result(await recheck(native.page,native.document,native.plan,native.nativeAst),'lini-connection-endpoints')).toBe('fail');
   await restore();
   await label.evaluate(element=>{const text=element as SVGTextElement,frame=globalThis.document.querySelector('g.lini-node[data-id="g3"] > rect') as SVGRectElement;if(!frame)throw Error('endpoint native group frame missing');const labelBox=text.getBoundingClientRect(),frameBox=frame.getBoundingClientRect();text.style.transform=`translate(${frameBox.left-(labelBox.left+labelBox.right)/2}px, ${frameBox.top+frameBox.height/2-(labelBox.top+labelBox.bottom)/2}px)`;});
   expect(result(await recheck(native.page,native.document,native.plan,native.nativeAst),'lini-connection-endpoints')).toBe('fail');
  }finally{await native.page.close();}
 },{timeout:45_000});

 it('records observed native geometry for a located Lini routing-scope fallback',async()=>{
  const document=createVisualDocument({id:'routing-scope-observation',kind:'flow',form:'network',question:'Which paths are drawn?',nodes:[{id:'a',label:'A'},{id:'b',label:'B'},{id:'c',label:'C'}],edges:[{id:'curve',from:'a',to:'b',routing:{kind:'curved'}},{id:'line',from:'b',to:'c',routing:{kind:'straight'}}]},'test:routing-scope-observation','1.4.0');
  const native=await renderDocument(document);
  try{const details=native.checks.find(check=>check.check==='lini-connection-endpoints')?.details??'';expect(result(native.checks,'lini-connection-endpoints')).toBe('pass');expect(details).toContain('observed');expect(details).toContain('px chord deviation');expect(details).toContain('admitted ROUTING_SCOPE_CONFLICT');}
  finally{await native.page.close();}
 },{timeout:45_000});

 it('maps every node role, keeps shape independent, and labels process activity on all presentation backends',async()=>{
  const roles=['actor','own','platform','external','store','document','process'] as const;
  const source=createVisualDocument({id:'role-conventions',kind:'flow',form:'network',question:'Which roles are shown?',nodes:roles.map(role=>({id:role,label:role,role,...(role==='process'?{shape:'rectangle' as const}:{})}))},'test:role-conventions','1.4.0');
  for(const backend of ['graphviz','mermaid','lini'] as const){
   const plan=compilePresentation(source,{backend});expect(plan.ok).toBe(true);if(!plan.ok)continue;
   for(const [index,role]of roles.entries())expect(plan.approximations.some(item=>item.sourcePath===`/extensions/umf.visual/nodes/${index}/role`&&item.requested===`Node role ${role}`)).toBe(true);
   expect(plan.approximations.find(item=>item.sourcePath==='/extensions/umf.visual/nodes/6/role')?.representation).toContain('depicted process/activity');
   expect(plan.source).toContain('Process');
   if(backend==='graphviz')expect(plan.source).toContain('shape=box');
   if(backend==='mermaid'){expect(plan.source).toContain('role_process fill:#f4eef4');expect(plan.source).toContain('shape: rect');expect(plan.source).toContain('shape: cyl');expect(plan.source).toContain('shape: circle');}
   if(backend==='lini'){expect(plan.source).toContain('|box#n7|');expect(plan.source).toContain('|cell#role| "Process"');expect(plan.source).toContain('--rose-deep');expect(plan.source).toContain('|cyl#n5|');}
  }
  const native=await renderDocument(source);
  try{
   expectAll(native.checks,false,true);
   const processCaption=native.page.locator('g.lini-node[data-id="n7"] > g.lini-node.lini-cell[data-id="role"] text.lini-text');
   expect(await processCaption.textContent()).toBe('Process');
   await processCaption.evaluate(element=>{element.textContent='Activity';});
   expect(result(await recheck(native.page,native.document,native.plan,native.nativeAst),'lini-native-carriers')).toBe('fail');
  }finally{await native.page.close();}
  const deduplicated=createVisualDocument({id:'process-caption-dedup',kind:'flow',form:'network',question:'Which activity?',nodes:[{id:'activity',label:'Activity',detail:'Process',role:'process'}]},'test:process-caption-dedup','1.4.0');
  for(const backend of ['graphviz','mermaid','lini'] as const){const plan=compilePresentation(deduplicated,{backend});expect(plan.ok).toBe(true);if(plan.ok)expect(plan.source.match(/Process/g)).toHaveLength(1);}
 });

 it('keeps nested group captions inside the parent frame and clear of the child frame',async()=>{
  const nested=await render({id:'nested-caption-clearance',kind:'flow',form:'network',question:'Which boundary contains the store?',groups:[{id:'outer',label:'Environment A',role:'boundary'},{id:'inner',label:'Environment B',parent:'outer',role:'boundary'}],nodes:[{id:'store',label:'Data store',role:'store',group:'inner'},{id:'outside',label:'Outside process'}],edges:[{id:'connects',from:'outside',to:'store',label:'connects to'}]});
  try{
   expectAll(nested.checks);
   const geometry=async()=>nested.page.evaluate(()=>{
    const rect=(selector:string)=>{const element=document.querySelector(selector);if(!element)return undefined;const b=element.getBoundingClientRect();return{top:b.top,bottom:b.bottom};};
    return{parent:rect('g.lini-node[data-id="g1"] > rect'),child:rect('g.lini-node[data-id="g2"] > rect'),caption:rect('g.lini-node[data-id="g2"] > g.lini-node.lini-caption text.lini-text')};
   });
   const clear=(value:Awaited<ReturnType<typeof geometry>>)=>!!value.parent&&!!value.child&&!!value.caption&&value.caption.top>value.parent.top+2&&value.caption.bottom<value.child.top-2;
   const measured=await geometry();expect(clear(measured)).toBe(true);
   // Negative control: move the parent top border through the child title.
   await nested.page.locator('g.lini-node[data-id="g1"] > rect').evaluate(element=>{const rect=element as SVGRectElement;rect.setAttribute('y',String(Number(rect.getAttribute('y'))+30));});
   expect(clear(await geometry())).toBe(false);
   expect(result(await recheck(nested.page,nested.document,nested.plan,nested.nativeAst),'lini-containment-and-order')).toBe('fail');
  }finally{await nested.page.close();}
 });

 it('centers unique straight-route captions clear of their owned arrowheads',async()=>{
  const root=resolve(import.meta.dir,'../..'),sourceDoc=readVisualDocument(readFileSync(resolve(root,'fixtures/reviews/definitions/miro-process-documents-store.json'),'utf8'),'json'),good=await renderDocument(sourceDoc);
  const measure=async(page:Page,plan:PresentationPlan)=>page.evaluate(maps=>maps.map(({nativeId})=>{const link=document.querySelector(`g.lini-link.lini-style-${nativeId}`),label=link?.querySelector('text.lini-link-label'),arrow=link?.querySelector('.lini-marker-arrow');if(!label||!arrow)return null;const a=label.getBoundingClientRect(),b=arrow.getBoundingClientRect();return{label:{left:a.left,right:a.right,top:a.top,bottom:a.bottom},arrow:{left:b.left,right:b.right,top:b.top,bottom:b.bottom}};}),plan.elementMap.filter(item=>item.kind==='edge').map(item=>({nativeId:item.nativeId})));
  try{
   expect(good.plan.source.match(/along: 0\.5;/gu)).toHaveLength(3);
   const clearances=await measure(good.page,good.plan);expect(clearances).toHaveLength(3);for(const item of clearances){expect(item).not.toBeNull();if(item){const horizontal=Math.max(item.arrow.left-item.label.right,item.label.left-item.arrow.right,0),vertical=Math.max(item.arrow.top-item.label.bottom,item.label.top-item.arrow.bottom,0),gap=Math.hypot(horizontal,vertical);expect(gap,JSON.stringify(item)).toBeGreaterThan(3);}}
   const moved=await good.page.evaluate(()=>{const link=globalThis.document.querySelector('g.lini-link.lini-style-e1'),label=link?.querySelector('text.lini-link-label'),arrow=link?.querySelector('.lini-marker-arrow');if(!label||!arrow)return false;const a=label.getBoundingClientRect(),b=arrow.getBoundingClientRect();(label as SVGTextElement).style.transform=`translate(${(b.left+b.right-a.left-a.right)/2}px, ${(b.top+b.bottom-a.top-a.bottom)/2}px)`;return true;});expect(moved).toBe(true);const collided=await measure(good.page,good.plan);expect(collided[0]).not.toBeNull();if(collided[0]){const item=collided[0],horizontal=Math.max(item.arrow.left-item.label.right,item.label.left-item.arrow.right,0),vertical=Math.max(item.arrow.top-item.label.bottom,item.label.top-item.arrow.bottom,0);expect(Math.hypot(horizontal,vertical)).toBeLessThanOrEqual(3);}
  }finally{await good.page.close();}
 },{timeout:45_000});

 it('offsets labeled flow connections clear of their paths in either authored direction',async()=>{
  for(const direction of ['LR','TB'] as const){
   const visual:Visual={id:`flow-caption-${direction.toLowerCase()}`,kind:'flow',form:'network',question:'Which label belongs to this connection?',layout:{kind:'flow',direction,order:['origin','destination']},nodes:[{id:'origin',label:'Origin node'},{id:'destination',label:'Destination node'}],edges:[{id:'connection',from:'origin',to:'destination',label:'preserves "intent"'}]},document=createVisualDocument(visual,'lini-quality:'+visual.id,'1.2.0'),good=await renderDocument(document);
   try{
    expect(good.plan.source).toMatch(direction==='LR'?/translate: 0 -\d+;/u:/translate: \d+ 0;/u);
    const failures=good.checks.filter(check=>check.result!=='pass');if(failures.length)throw Error(`${direction}: ${JSON.stringify(failures)}`);
    const gap=await good.page.evaluate(()=>{
     const link=globalThis.document.querySelector('g.lini-link.lini-style-e1'),path=link?.querySelector(':scope > path:not(.lini-marker)') as SVGPathElement|undefined,label=link?.querySelector(':scope > text.lini-link-label');if(!path||!label)return-1;
     const rect=label.getBoundingClientRect(),length=path.getTotalLength(),matrix=path.getScreenCTM();if(!matrix)return-1;let minimum=Infinity;
     for(let index=0;index<=120;index++){const point=path.getPointAtLength(length*index/120),screen=new DOMPoint(point.x,point.y).matrixTransform(matrix),dx=Math.max(rect.left-screen.x,0,screen.x-rect.right),dy=Math.max(rect.top-screen.y,0,screen.y-rect.bottom);minimum=Math.min(minimum,Math.hypot(dx,dy));}
     return minimum;
    });
    expect(gap).toBeGreaterThanOrEqual(8);
    await good.page.locator('g.lini-link.lini-style-e1 > text.lini-link-label').evaluate(label=>{
     const link=label.closest('g.lini-link'),path=link?.querySelector(':scope > path:not(.lini-marker)') as SVGPathElement|undefined;if(!path)throw Error('Missing native connection path');
     const point=path.getPointAtLength(path.getTotalLength()/2);label.setAttribute('x',String(point.x));label.setAttribute('y',String(point.y));
    });
    expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
   }finally{await good.page.close();}
  }
 },{timeout:45_000});

 it('gives parallel captions distinct lanes and clears a long top-to-bottom caption',async()=>{
  const parallelVisual:Visual={id:'parallel-flow-captions',kind:'flow',form:'network',question:'Which caption belongs to each link?',layout:{kind:'flow',direction:'LR',order:['source','target']},nodes:[{id:'source',label:'Source'},{id:'target',label:'Target'}],edges:[{id:'first',from:'source',to:'target',label:'first relation'},{id:'second',from:'source',to:'target',label:'second relation'}]},parallel=await renderDocument(createVisualDocument(parallelVisual,'lini-quality:'+parallelVisual.id,'1.2.0'));
  try{
   expectAll(parallel.checks);
   expect(parallel.plan.source).toContain('along: 0.25;');expect(parallel.plan.source).toContain('along: 0.75;');
   const offsets=[...parallel.plan.source.matchAll(/translate: 0 -(\d+);/gu)].slice(-2).map(match=>Number(match[1]));expect(offsets).toHaveLength(2);expect(new Set(offsets).size).toBe(2);
  }finally{await parallel.page.close();}

  const visual:Visual={id:'long-tb-caption',kind:'flow',form:'network',question:'Which caption clears the vertical connector?',layout:{kind:'flow',direction:'TB',order:['origin','destination']},nodes:[{id:'origin',label:'Origin'},{id:'destination',label:'Destination'}],edges:[{id:'connection',from:'origin',to:'destination',label:'first line with a long second caption and a third segment'}]},document=createVisualDocument(visual,'lini-quality:'+visual.id,'1.2.0'),vertical=await renderDocument(document);
  try{
   expectAll(vertical.checks);expect(vertical.plan.source).toMatch(/translate: \d+ 0;/u);
   const text=await vertical.page.locator('g.lini-link.lini-style-e1 > text.lini-link-label').evaluate(label=>label.textContent??'');expect(text.replace(/\s+/gu,' ').trim()).toBe('first line with a long second caption and a third segment');
  }finally{await vertical.page.close();}
 },{timeout:45_000});

 it('binds native identities, visible labels, nested group membership and directed network links',async()=>{
  const good=await render({id:'nested-flow',kind:'flow',form:'network',question:'Where does a record travel?',title:'Record route',groups:[{id:'platform',label:'Platform',detail:'Owned API boundary',role:'boundary'},{id:'storage',label:'Storage',parent:'platform',role:'zone'}],nodes:[{id:'api',label:'Public API',detail:'Stable client surface',group:'platform'},{id:'store',label:'Record store',group:'storage'}],edges:[{id:'write',from:'api',to:'store',label:'Write record'}]});
  try{
   expectAll(good.checks);
   await good.page.locator('g.lini-node[data-id="n1"] > text.lini-text').first().evaluate(element=>{element.textContent='Public APX';});
   const wrongLabel=await recheck(good.page,good.document,good.plan,good.nativeAst);
   expect(result(wrongLabel,'lini-native-carriers')).toBe('fail');
   await good.page.locator('g.lini-node[data-id="n1"] > text.lini-text').first().evaluate(element=>{element.textContent='Public API';});
   const firstText=good.page.locator('g.lini-node[data-id="n1"] > text.lini-text').first();
   await firstText.evaluate(element=>{(element as SVGTextElement).style.fontFamily='Helvetica';});
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-native-carriers')).toBe('fail');
   await firstText.evaluate(element=>{(element as SVGTextElement).style.removeProperty('font-family');});
   const edgeLabel=good.page.locator('g.lini-link.lini-style-e1 > text.lini-link-label');
   await edgeLabel.evaluate(element=>{(element as SVGTextElement).style.fontFamily='Helvetica';});
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-native-carriers')).toBe('fail');
   await edgeLabel.evaluate(element=>{(element as SVGTextElement).style.removeProperty('font-family');});
   const sourceAttrs=await good.page.locator('g.lini-link.lini-style-e1').evaluate(element=>({from:element.getAttribute('data-from'),to:element.getAttribute('data-to')}));
   await good.page.locator('g.lini-link.lini-style-e1 > path:not(.lini-marker)').evaluate(element=>{element.setAttribute('d','M 10000 10000 L 10100 10100');});
   const detached=await recheck(good.page,good.document,good.plan,good.nativeAst);
   expect(await good.page.locator('g.lini-link.lini-style-e1').evaluate(element=>({from:element.getAttribute('data-from'),to:element.getAttribute('data-to')}))).toEqual(sourceAttrs);
   expect(result(detached,'lini-connection-endpoints')).toBe('fail');
   await good.page.locator('g.lini-node[data-id="n2"]').evaluate(element=>{const node=element as SVGGElement,root=node.ownerSVGElement?.querySelector('g.lini-scene');if(root)root.append(node);});
   const outside=await recheck(good.page,good.document,good.plan,good.nativeAst);
   expect(result(outside,'lini-containment-and-order')).toBe('fail');
   const blankAst=await recheck(good.page,good.document,good.plan,'');
   expect(result(blankAst,'lini-native-ast')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('preserves an explicit headless network association and rejects a native arrowhead',async()=>{
  const visual:Visual={id:'headless-association',kind:'flow',form:'network',question:'Which nodes are associated?',nodes:[{id:'source',label:'Source'},{id:'target',label:'Target'}],edges:[{id:'association',from:'source',to:'target',directed:false,label:'belongs to'}]},good=await renderDocument(createVisualDocument(visual,'test:headless-association','1.3.0'));
  try{
   expectAll(good.checks);
   const mapped=good.plan.elementMap.find(item=>item.kind==='edge'&&item.logicalId==='association');expect(mapped).toBeDefined();if(!mapped)return;
   const link=good.page.locator(`g.lini-link.lini-style-${mapped.nativeId}`);expect(await link.getAttribute('data-from')).toBe('visual.n1');expect(await link.getAttribute('data-to')).toBe('visual.n2');expect(await link.locator('.lini-marker-arrow').count()).toBe(0);
   await link.evaluate(element=>element.insertAdjacentHTML('beforeend','<polygon class="lini-marker lini-marker-arrow" points="0,0 5,2 5,-2"></polygon>'));
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('maps a flat state machine to owned state cells and one directed native link per transition',async()=>{
  const root=resolve(import.meta.dir,'../..'),document=readVisualDocument(readFileSync(resolve(root,'fixtures/visual/forms/helix-authoring-state.json'),'utf8'),'json'),good=await renderDocument(document);
  try{
   expectAll(good.checks);
   const initial=good.plan.elementMap.find(item=>item.kind==='state-marker'&&item.sourcePath.endsWith('/state/initial'));
   expect(initial).toBeDefined();if(!initial)return;
   expect(initial.nativeId).toBe('n1.initial');
   expect(await good.page.locator('g.lini-node[data-id="n1"] > g.lini-node.lini-cell[data-id="initial"] text.lini-text').textContent()).toBe('Initial');
   const transitions=good.plan.elementMap.filter(item=>item.kind==='transition');
   expect(transitions.map(item=>item.logicalId)).toEqual(['check-in','check-out']);
   expect(await good.page.locator('g.lini-link.lini-style-t1').getAttribute('data-from')).toBe('visual.n1');
   expect(await good.page.locator('g.lini-link.lini-style-t1').getAttribute('data-to')).toBe('visual.n2');
   expect(await good.page.locator('g.lini-link.lini-style-t1 > text.lini-link-label').textContent()).toContain('check in / copy body, export and digest');
   expect(await good.page.locator('g.lini-link.lini-style-t2').getAttribute('data-from')).toBe('visual.n2');
   expect(await good.page.locator('g.lini-link.lini-style-t2').getAttribute('data-to')).toBe('visual.n1');
   expect(await good.page.locator('g.lini-link.lini-style-t2 > text.lini-link-label').textContent()).toContain('check out / start the next revision');

   const reverseCaption=good.page.locator('g.lini-link.lini-style-t2 > text.lini-link-label');
   const relocation=await good.page.evaluate(()=>{
    const forward=globalThis.document.querySelector('g.lini-link.lini-style-t1 > text.lini-link-label')?.getBoundingClientRect(),reverse=globalThis.document.querySelector('g.lini-link.lini-style-t2 > text.lini-link-label')?.getBoundingClientRect();
    if(!forward||!reverse)throw Error('Both transition captions must be native text carriers.');
    return{x:forward.x+forward.width/2-(reverse.x+reverse.width/2),y:forward.y+forward.height/2-(reverse.y+reverse.height/2)};
   });
   await reverseCaption.evaluate((element,offset)=>element.setAttribute('style',`translate: ${offset.x}px ${offset.y}px`),relocation);
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
   await reverseCaption.evaluate(element=>element.removeAttribute('style'));
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('pass');

   const firstLink=good.page.locator('g.lini-link.lini-style-t1'),authoredTarget=await firstLink.getAttribute('data-to');
   await firstLink.evaluate(element=>element.setAttribute('data-to','visual.n1'));
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
   await firstLink.evaluate((element,target)=>element.setAttribute('data-to',target??''),authoredTarget);

   const initialCell=good.page.locator('g.lini-node.lini-cell[data-id="initial"]');
   const initialText=initialCell.locator('text.lini-text');
   await initialText.evaluate(element=>{element.textContent='Start';});
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-native-carriers')).toBe('fail');
   await initialText.evaluate(element=>{element.textContent='Initial';});
   await initialCell.evaluate(cell=>{const svg=(cell as SVGElement).ownerSVGElement,other=svg?.querySelector('g.lini-node[data-id="n2"]');other?.append(cell);});
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-native-carriers')).toBe('fail');
   await initialCell.evaluate(cell=>{const svg=(cell as SVGElement).ownerSVGElement,owner=svg?.querySelector('g.lini-node[data-id="n1"]');owner?.append(cell);});

   const firstLabel=good.page.locator('g.lini-link.lini-style-t1 > text.lini-link-label');
   await firstLabel.evaluate(element=>{element.textContent='check out / copy body, export and digest';});
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-native-carriers')).toBe('fail');
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
  }finally{await good.page.close();}
 },{timeout:30_000});

 it('keeps co-located initial and explicit final markers distinct while retaining an outgoing transition',async()=>{
  const good=await render({id:'initial-final-overlap',kind:'state',form:'machine',question:'Which state is marked?',nodes:[{id:'active',label:'Active'},{id:'complete',label:'Complete'}],state:{initial:'active',final:['active'],transitions:[{id:'complete-transition',from:'active',to:'complete',event:'complete',guard:'ready',action:'publish'}]}});
  try{
   expectAll(good.checks);
   const markers=good.plan.elementMap.filter(item=>item.kind==='state-marker');
   expect(markers.map(item=>item.sourcePath)).toEqual(['/extensions/umf.visual/state/initial','/extensions/umf.visual/state/final/0']);
   expect(markers.map(item=>item.nativeId)).toEqual(['n1.initial','n1.final1']);
   const initial=good.page.locator('g.lini-node[data-id="n1"] > g.lini-node.lini-cell[data-id="initial"] text.lini-text');
   const final=good.page.locator('g.lini-node[data-id="n1"] > g.lini-node.lini-cell[data-id="final1"] text.lini-text');
   expect(await initial.textContent()).toBe('Initial');expect(await final.textContent()).toBe('Final');
   expect(await good.page.locator('g.lini-link.lini-style-t1').getAttribute('data-from')).toBe('visual.n1');
   expect(await good.page.locator('g.lini-link.lini-style-t1').getAttribute('data-to')).toBe('visual.n2');
   expect(await good.page.locator('g.lini-link.lini-style-t1 > text.lini-link-label').textContent()).toContain('complete [ready] / publish');
  }finally{await good.page.close();}
 },{timeout:30_000});

 it('places reciprocal state captions on opposite sides of top-to-bottom transitions',async()=>{
  const document=createVisualDocument({id:'top-bottom-state',kind:'state',form:'machine',question:'Which way does this state move?',layout:{kind:'flow',direction:'TB'},nodes:[{id:'ready',label:'Ready'},{id:'done',label:'Done'}],state:{initial:'ready',transitions:[{id:'advance',from:'ready',to:'done',event:'advance',guard:'accepted'},{id:'reset',from:'done',to:'ready',event:'reset',action:'retry'}]}},'test:top-bottom-state','1.4.0'),good=await renderDocument(document,'TB');
  try{
   expectAll(good.checks);
   expect(good.plan.source).toMatch(/\.t1 \{ along: 0\.5; \} \[ "advance \[accepted\]" \{ translate: \d+ 0; \} \]/u);
   expect(good.plan.source).toMatch(/\.t2 \{ along: 0\.5; \} \[ "reset \/ retry" \{ translate: -\d+ 0; \} \]/u);
  }finally{await good.page.close();}
 },{timeout:30_000});

 it('refuses parented state machines instead of flattening composite state containment',()=>{
  const plan=compilePresentation(doc({id:'parented-state',kind:'state',form:'machine',question:'Which state is active?',nodes:[{id:'composite',label:'Composite state'},{id:'nested',label:'Nested state',parent:'composite'}],state:{initial:'nested',transitions:[{id:'transition',from:'nested',to:'composite',event:'change'}]}}),{backend:'lini',theme:'presentation/1'});
  expect(plan.ok).toBe(false);
  if(!plan.ok)expect(plan.diagnostics).toContainEqual(expect.objectContaining({code:'PRESENTATION_STATE_NODE_PROPERTY',path:'/extensions/umf.visual/nodes/1/parent'}));
 });

 it('keeps entity fields in their exact rows with types, badges, field ports, and multiplicities',async()=>{
  const good=await render({id:'field-ports',kind:'structure',form:'entities',question:'Which records reference each other?',nodes:[{id:'account',label:'Account table'},{id:'event',label:'Event table'}],structure:{entities:[{node:'account',fields:[{id:'account-id',name:'id',type:'uuid',keys:['pk'],nullable:false},{id:'account-name',name:'name',type:'text',nullable:false}]},{node:'event',fields:[{id:'event-id',name:'id',type:'uuid',keys:['pk'],nullable:false},{id:'event-account',name:'account_id',type:'uuid',keys:['fk'],nullable:false},{id:'event-payload',name:'payload',type:'json',nullable:true}]}],references:[{id:'account-events',from:{node:'account',fieldId:'account-id'},to:{node:'event',fieldId:'event-account'},label:'owns',fromCardinality:'exactly-one',toCardinality:'zero-or-many'},{id:'payload-range',from:{node:'event',fieldId:'event-payload'},to:{node:'account',fieldId:'account-name'},label:'range',fromMultiplicity:{min:2,max:4,text:'2..4'},toMultiplicity:{min:0,max:1,text:'0..1'}}]}});
  try{
   expectAll(good.checks);
   const fieldChanged=await good.page.locator('g.lini-node[data-id="n1"] g.lini-node.lini-cell[data-id="f1"] text.lini-text').evaluate(element=>{element.textContent='ix · PK · NOT NULL';});
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-entity-field-rows')).toBe('fail');
   await good.page.locator('g.lini-node[data-id="n1"] g.lini-node.lini-cell[data-id="f1"] text.lini-text').evaluate(element=>{element.textContent='id · PK · NOT NULL';});
   await good.page.locator('g.lini-node[data-id="n1"] g.lini-node.lini-cell').nth(2).locator('text.lini-text').evaluate(element=>{element.textContent='integer';});
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-entity-field-rows')).toBe('fail');
   await good.page.locator('g.lini-node[data-id="n1"] g.lini-node.lini-cell').nth(2).locator('text.lini-text').evaluate(element=>{element.textContent='uuid';});
   const exactOneLink=good.page.locator('g.lini-link.lini-style-r1'),exactOneAttrs=await exactOneLink.evaluate(element=>({from:element.getAttribute('data-from'),to:element.getAttribute('data-to')}));
   const removedSourceBar=await exactOneLink.evaluate(link=>{const bars=[...link.querySelectorAll('path.lini-marker:not(.lini-marker-arrow)')].filter(marker=>(marker.getAttribute('d')?.match(/\bM\b/gu)?.length??0)===1&&(marker.getAttribute('d')?.match(/\bL\b/gu)?.length??0)===1);if(!bars.length)return'';const markup=bars[0]!.outerHTML;bars[0]!.remove();return markup;});
   expect(removedSourceBar).not.toBe('');
   expect(await exactOneLink.evaluate(element=>({from:element.getAttribute('data-from'),to:element.getAttribute('data-to')}))).toEqual(exactOneAttrs);
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
   await exactOneLink.evaluate((link,markup)=>link.insertAdjacentHTML('beforeend',markup),removedSourceBar);
   const rangeLink=good.page.locator('g.lini-link.lini-style-r2'),rangeLabel=rangeLink.locator('text.lini-link-label');
   await rangeLabel.evaluate(element=>{element.textContent='range [from 2..4; to 9..9]';});
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
   await rangeLabel.evaluate(element=>{element.textContent='range [from 2..4; to 0..1]';});
   const optionalMarker=rangeLink.locator('circle.lini-marker');
   expect(await optionalMarker.count()).toBe(1);
   const optionalMarkerMarkup=await optionalMarker.evaluate(element=>element.outerHTML);
   await optionalMarker.evaluate(element=>element.remove());
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
   await rangeLink.evaluate((link,markup)=>link.insertAdjacentHTML('beforeend',markup),optionalMarkerMarkup);
   const link=good.page.locator('g.lini-link.lini-style-r1');
   const attrs=await link.evaluate(element=>({from:element.getAttribute('data-from'),to:element.getAttribute('data-to')}));
   await link.locator('> path:not(.lini-marker)').evaluate(element=>{element.setAttribute('transform','translate(0,23)');});
   expect(await link.evaluate(element=>({from:element.getAttribute('data-from'),to:element.getAttribute('data-to')}))).toEqual(attrs);
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
   await link.locator('> path:not(.lini-marker)').evaluate(element=>{element.removeAttribute('transform');});
   await link.locator('.lini-marker').evaluateAll(elements=>elements.forEach(element=>element.remove()));
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
   const row=good.page.locator('g.lini-node[data-id="n1"] g.lini-node.lini-cell[data-id="f1"]');
   await row.locator('text.lini-text').evaluate(element=>{element.textContent='changed · PK · NOT NULL';});
   await good.page.locator('svg.lini').evaluate(svg=>{const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.textContent='id · PK · NOT NULL';svg.append(text);});
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-entity-field-rows')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('keeps neutral relationship captions clear and proves the complete optional-many endpoint glyph',async()=>{
  const source=readVisualDocument(readFileSync(resolve(import.meta.dir,'../../fixtures/catalog/canary-entities.json'),'utf8'),'json'),good=await renderDocument(source);
  try{
   expect(result(good.checks,'lini-connection-endpoints')).toBe('pass');
   expect(good.plan.source).toContain('[ "emits \\\"events\\\"" { translate: 0 -24; font-size: 14; } ]');
   const referenceMaps=good.plan.elementMap.filter(item=>item.kind==='reference');
   const captions=await good.page.evaluate(nativeIds=>nativeIds.map(nativeId=>{
    const text=globalThis.document.querySelector(`g.lini-link.lini-style-${nativeId} > text.lini-link-label`) as SVGTextElement|null;
    if(!text)return null;
    const bounds=text.getBoundingClientRect(),style=getComputedStyle(text);
    return{text:text.textContent?.trim()??'',fontSize:style.fontSize,visible:style.visibility!=='hidden'&&style.display!=='none'&&Number(style.opacity)>0&&Number(style.fillOpacity)>0&&style.fill!=='none',width:bounds.width,height:bounds.height};
   }),referenceMaps.map(item=>item.nativeId));
   expect(captions).toHaveLength(referenceMaps.length);
   expect(captions.every(item=>item!==null&&item.text.length>0&&item.fontSize==='14px'&&item.visible&&item.width>0&&item.height>=10)).toBe(true);
   const link=good.page.locator('g.lini-link.lini-style-r1'),caption=link.locator('text.lini-link-label'),circle=link.locator('circle.lini-marker');
   expect(await circle.count()).toBe(1);
   const clearance=await link.evaluate(element=>{
    const path=element.querySelector(':scope > path:not(.lini-marker)') as SVGPathElement,label=element.querySelector(':scope > text.lini-link-label') as SVGTextElement,box=label.getBoundingClientRect(),length=path.getTotalLength(),matrix=path.getScreenCTM()!;let gap=Infinity;
    for(let i=0;i<=120;i++){const point=path.getPointAtLength(length*i/120),screen=new DOMPoint(point.x,point.y).matrixTransform(matrix),dx=Math.max(box.left-screen.x,0,screen.x-box.right),dy=Math.max(box.top-screen.y,0,screen.y-box.bottom);gap=Math.min(gap,Math.hypot(dx,dy));}
    return gap;
   });
   expect(clearance).toBeGreaterThanOrEqual(8);
   const circleMarkup=await circle.evaluate(element=>{const markup=element.outerHTML;element.remove();return markup;});
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
   await link.evaluate((element,markup)=>element.insertAdjacentHTML('beforeend',markup),circleMarkup);
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('pass');
   const originalCx=await circle.getAttribute('cx');expect(originalCx).not.toBeNull();
   await circle.evaluate(element=>element.setAttribute('cx',String(Number(element.getAttribute('cx'))-100)));
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
   await circle.evaluate((element,cx)=>element.setAttribute('cx',cx??''),originalCx);
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('pass');
   const bridgeMarkup=await link.evaluate(element=>{const candidate=[...element.querySelectorAll('path.lini-marker')].find(path=>{const line=path as SVGPathElement;return(line.getAttribute('d')?.match(/\bM\b/gu)?.length??0)===1&&(line.getAttribute('d')?.match(/\bL\b/gu)?.length??0)===1&&line.getTotalLength()<5;});if(!candidate)return'';const markup=candidate.outerHTML;candidate.remove();return markup;});
   expect(bridgeMarkup).not.toBe('');
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
   await link.evaluate((element,markup)=>element.insertAdjacentHTML('beforeend',markup),bridgeMarkup);
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('pass');
   const detached=await link.evaluate(element=>{
    const markers=[...element.querySelectorAll<SVGElement>('.lini-marker:not(.lini-marker-arrow)')],selected=markers.filter(marker=>marker.tagName.toLowerCase()==='circle'||marker.tagName.toLowerCase()==='path'&&((marker.getAttribute('d')?.match(/\bL\b/gu)?.length??0)>=3||((marker.getAttribute('d')?.match(/\bM\b/gu)?.length??0)===1&&(marker.getAttribute('d')?.match(/\bL\b/gu)?.length??0)===1&&(marker as SVGPathElement).getTotalLength()<5)));
    return selected.map(marker=>{const transform=marker.getAttribute('transform');marker.setAttribute('transform',(transform??'')+' translate(-100 0)');return{markup:marker.outerHTML,transform};});
   });
   expect(detached.length).toBe(3);
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
   await link.evaluate((element,states)=>{const markers=[...element.querySelectorAll<SVGElement>('.lini-marker:not(.lini-marker-arrow)')],selected=markers.filter(marker=>marker.tagName.toLowerCase()==='circle'||marker.tagName.toLowerCase()==='path'&&((marker.getAttribute('d')?.match(/\bL\b/gu)?.length??0)>=3||((marker.getAttribute('d')?.match(/\bM\b/gu)?.length??0)===1&&(marker.getAttribute('d')?.match(/\bL\b/gu)?.length??0)===1&&(marker as SVGPathElement).getTotalLength()<5)));selected.forEach((marker,index)=>{const transform=states[index]?.transform;if(transform===null||transform===undefined)marker.removeAttribute('transform');else marker.setAttribute('transform',transform);});},detached);
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('pass');
   await caption.evaluate(element=>{const text=element as SVGTextElement;text.setAttribute('transform',(text.getAttribute('transform')??'')+' translate(0 18)');});
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-connection-endpoints')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('places entity relationship captions perpendicular to a top-to-bottom composition',async()=>{
  const document=createVisualDocument({id:'vertical-entity-caption',kind:'structure',form:'entities',question:'Which entity follows?',layout:{kind:'grid',columns:1,order:['source','target']},nodes:[{id:'source',label:'Source entity'},{id:'target',label:'Target entity'}],structure:{entities:[{node:'source',fields:[{name:'id',type:'uuid'}]},{node:'target',fields:[{name:'source_id',type:'uuid'}]}],references:[{id:'association',from:{node:'source'},to:{node:'target'},label:'relates',fromCardinality:'exactly-one',toCardinality:'zero-or-many'}]}},'test:vertical-entity-caption','1.2.0'),good=await renderDocument(document);
  try{
   expect(good.plan.source).toContain('translate: 24 0;');
   expect(result(good.checks,'lini-connection-endpoints')).toBe('pass');
  }finally{await good.page.close();}
 });

 it('checks authored stack layer order and refuses reordered native bands',async()=>{
  const good=await render({id:'ordered-stack',kind:'structure',form:'stack',question:'Which layer comes first?',nodes:[{id:'client',label:'Client',layer:'interface'},{id:'engine',label:'Engine',layer:'runtime'},{id:'records',label:'Records',layer:'storage'}],structure:{layers:[{id:'interface',label:'Interface'},{id:'runtime',label:'Runtime'},{id:'storage',label:'Storage'}]}});
  try{
   expectAll(good.checks);
   const runtimeCaption=good.page.locator('g.lini-caption').filter({hasText:'Runtime'}).first();
   expect(await runtimeCaption.count()).toBe(1);
   await runtimeCaption.evaluate(element=>{(element as SVGGElement).style.translate='0px -100px';});
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-containment-and-order')).toBe('fail');
   await runtimeCaption.evaluate(element=>{(element as SVGGElement).style.removeProperty('translate');});
   expectAll(await recheck(good.page,good.document,good.plan,good.nativeAst));
   const before=await good.page.locator('g.lini-node[data-id="l1"]').getAttribute('transform'),after=await good.page.locator('g.lini-node[data-id="l3"]').getAttribute('transform');
   expect(before).toBeDefined();expect(after).toBeDefined();expect(before).not.toBe(after);
   await good.page.locator('g.lini-node[data-id="l1"]').evaluate((element,transform)=>element.setAttribute('transform',transform??''),after);
   await good.page.locator('g.lini-node[data-id="l3"]').evaluate((element,transform)=>element.setAttribute('transform',transform??''),before);
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-containment-and-order')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('checks authored nested flow order and horizontal stack direction from native container geometry',async()=>{
  const flowDoc=createVisualDocument({id:'group-flow-order',kind:'flow',form:'network',question:'Which child comes first?',groups:[{id:'zone',label:'Zone',role:'zone',layout:{kind:'flow',direction:'LR',order:['right','left']}}],nodes:[{id:'left',label:'Left child',group:'zone'},{id:'right',label:'Right child',group:'zone'}]},'test:group-flow-order','1.2.0');
  const flow=await renderDocument(flowDoc);
  try{
   expectAll(flow.checks);
   const left=await flow.page.locator('g.lini-node[data-id="n1"]').getAttribute('transform'),right=await flow.page.locator('g.lini-node[data-id="n2"]').getAttribute('transform');
   expect(left).toBeDefined();expect(right).toBeDefined();expect(left).not.toBe(right);
   await flow.page.locator('g.lini-node[data-id="n1"]').evaluate((element,transform)=>element.setAttribute('transform',transform??''),right);
   await flow.page.locator('g.lini-node[data-id="n2"]').evaluate((element,transform)=>element.setAttribute('transform',transform??''),left);
   expect(result(await recheck(flow.page,flow.document,flow.plan,flow.nativeAst),'lini-containment-and-order')).toBe('fail');
  }finally{await flow.page.close();}

  const stackDoc=createVisualDocument({id:'horizontal-stack',kind:'structure',form:'stack',question:'Which band is leftmost?',layout:{kind:'stack',direction:'LR',order:['first-node','second-node']},nodes:[{id:'first-node',label:'First node',layer:'first'},{id:'second-node',label:'Second node',layer:'second'}],structure:{layers:[{id:'first',label:'First band'},{id:'second',label:'Second band'}]}},'test:horizontal-stack','1.2.0');
  const stack=await renderDocument(stackDoc);
  try{
   expectAll(stack.checks);
   const first=await stack.page.locator('g.lini-node[data-id="l1"]').getAttribute('transform'),second=await stack.page.locator('g.lini-node[data-id="l2"]').getAttribute('transform');
   expect(first).toBeDefined();expect(second).toBeDefined();expect(first).not.toBe(second);
   await stack.page.locator('g.lini-node[data-id="l1"]').evaluate((element,transform)=>element.setAttribute('transform',transform??''),second);
   await stack.page.locator('g.lini-node[data-id="l2"]').evaluate((element,transform)=>element.setAttribute('transform',transform??''),first);
   expect(result(await recheck(stack.page,stack.document,stack.plan,stack.nativeAst),'lini-containment-and-order')).toBe('fail');
  }finally{await stack.page.close();}
 });

 it('binds stack caption clearance to its own layer when labels repeat elsewhere',async()=>{
  const document=createVisualDocument({id:'repeated-layer-labels',kind:'structure',form:'stack',question:'Shared',nodes:[{id:'component-one',label:'First component',layer:'layer-one'},{id:'component-two',label:'Second component',layer:'layer-two'}],structure:{layers:[{id:'layer-one',label:'Shared'},{id:'layer-two',label:'Shared'}]}},'test:repeated-layer-labels','1.2.0');
  const repeated=await renderDocument(document);
  try{
   expectAll(repeated.checks);
   const orderCheck=repeated.checks.find(check=>check.check==='lini-containment-and-order');
   expect(orderCheck?.details).toContain('layer-two ');
  }finally{await repeated.page.close();}
 });

 it('checks one-column entity order from native positions and rejects swapped geometry',async()=>{
  const document=createVisualDocument({id:'entity-column-order',kind:'structure',form:'entities',question:'Which entity is first?',layout:{kind:'grid',columns:1,order:['b','a']},nodes:[{id:'a',label:'Entity A'},{id:'b',label:'Entity B'}],structure:{entities:[{node:'a',fields:[{name:'id',type:'uuid'}]},{node:'b',fields:[{name:'id',type:'uuid'}]}]}},'test:entity-column-order','1.2.0');
  const good=await renderDocument(document);
  try{
   expectAll(good.checks);
   const first=await good.page.locator('g.lini-node[data-id="n1"]').getAttribute('transform'),second=await good.page.locator('g.lini-node[data-id="n2"]').getAttribute('transform');
   expect(first).toBeDefined();expect(second).toBeDefined();expect(first).not.toBe(second);
   await good.page.locator('g.lini-node[data-id="n1"]').evaluate((element,transform)=>element.setAttribute('transform',transform??''),second);
   await good.page.locator('g.lini-node[data-id="n2"]').evaluate((element,transform)=>element.setAttribute('transform',transform??''),first);
   expect(result(await recheck(good.page,good.document,good.plan,good.nativeAst),'lini-containment-and-order')).toBe('fail');
  }finally{await good.page.close();}
 });

 it('verifies every standalone native shape and the located entity-shape approximation',async()=>{
  const visual:Visual={id:'native-shapes',kind:'flow',form:'network',question:'Which native shape is each component?',nodes:[
   {id:'rectangle',label:'Rectangle',shape:'rectangle'},{id:'round',label:'Rounded rectangle',shape:'rounded-rectangle'},
   {id:'ellipse',label:'Ellipse',shape:'ellipse'},{id:'diamond',label:'Diamond',shape:'diamond'},
   {id:'hexagon',label:'Hexagon',shape:'hexagon'},{id:'cylinder',label:'Cylinder',shape:'cylinder'},
   {id:'note',label:'Folded corner',shape:'folded-corner'},
   {id:'document',label:'Document',role:'document',shape:'document'},
   {id:'documents',label:'Multiple documents',shape:'multiple-documents'},
  ]};
  const standalone=await renderDocument(createVisualDocument(visual,'test:native-shapes','1.4.0'));
  try{
   expectAll(standalone.checks,false,true);
   const hex=standalone.page.locator('g.lini-node[data-id="n5"]'),label=await hex.locator(':scope > text.lini-text').first().textContent();
   await hex.evaluate(element=>{element.classList.remove('lini-hex');element.classList.add('lini-diamond');});
   expect(await hex.locator(':scope > text.lini-text').first().textContent()).toBe(label);
   expect(result(await recheck(standalone.page,standalone.document,standalone.plan,standalone.nativeAst),'lini-native-carriers')).toBe('fail');
   await hex.evaluate(element=>{element.classList.remove('lini-diamond');element.classList.add('lini-hex');});
   const rect=standalone.page.locator('g.lini-node[data-id="n1"] > rect');
   await rect.evaluate(element=>element.setAttribute('rx','8'));
   expect(result(await recheck(standalone.page,standalone.document,standalone.plan,standalone.nativeAst),'lini-native-carriers')).toBe('fail');
   const multiple=standalone.page.locator('g.lini-node[data-id="n9"]');
   expect(await multiple.locator(':scope > g:not(.lini-node) > path').count()).toBeGreaterThan(0);
   const backing=multiple.locator(':scope > g:not(.lini-node)').first();
   await backing.evaluate(group=>group.setAttribute('transform','translate(0,0)'));
   expect(result(await recheck(standalone.page,standalone.document,standalone.plan,standalone.nativeAst),'lini-native-carriers')).toBe('fail');
   await backing.evaluate(group=>group.setAttribute('transform','translate(2,-2)'));
   await multiple.locator(':scope > g:not(.lini-node)').first().evaluate(element=>element.remove());
   expect(result(await recheck(standalone.page,standalone.document,standalone.plan,standalone.nativeAst),'lini-native-carriers')).toBe('fail');
  }finally{await standalone.page.close();}

  const entityDoc=createVisualDocument({id:'entity-shape',kind:'structure',form:'entities',question:'What shape was requested?',nodes:[{id:'table',label:'Table',shape:'hexagon'}],structure:{entities:[{node:'table',fields:[]}]}},'test:entity-shape','1.2.0');
  const entity=await renderDocument(entityDoc);
  try{
   expectAll(entity.checks);
   const shapeCell=entity.page.locator('g.lini-node[data-id="n1"] g.lini-node.lini-cell[data-id="shape"] text.lini-text');
   expect(await shapeCell.textContent()).toBe('(requested shape: hexagon)');
   await shapeCell.evaluate(element=>{element.textContent='(requested shape: diamond)';});
   expect(result(await recheck(entity.page,entity.document,entity.plan,entity.nativeAst),'lini-native-carriers')).toBe('fail');
  }finally{await entity.page.close();}
 });

 it('proves native ER body terminal symbols and rejects a detached moved relation',async()=>{
  const root=resolve(import.meta.dir,'../..'),document=readVisualDocument(readFileSync(resolve(root,'fixtures/showcase/definitions/lini-gallery-commerce-entities.json'),'utf8'),'json'),plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});
  expect(plan.ok).toBe(true);if(!plan.ok)throw Error(JSON.stringify(plan));
  const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900}});
  try{
   await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden}#frame{width:1600px;height:900px}#frame svg{width:100%;height:100%}</style><div id="frame"></div>',{waitUntil:'domcontentloaded'});
   await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},native.svg);
   const checks=await verifyLiniPresentationQuality(page,{document,plan,nativeAst:native.nativeAst});expectAll(checks);
   const relation=page.locator('g.lini-link.lini-style-r2');expect(await relation.getAttribute('data-from')).toBe('visual.n1');expect(await relation.getAttribute('data-to')).toBe('visual.n5');
   const transform=await relation.getAttribute('transform');await relation.evaluate(element=>element.setAttribute('transform','translate(100,0)'));
   expect(result(await recheck(page,document,plan,native.nativeAst),'lini-connection-endpoints')).toBe('fail');
   await relation.evaluate((element,value)=>element.setAttribute('transform',value??''),transform);
  }finally{await page.close();}
 });

 it('replays all original showcase baselines through pinned Lini and Chromium',async()=>{
  const root=resolve(import.meta.dir,'../..'),manifest=JSON.parse(readFileSync(resolve(root,'fixtures/showcase/showcase-sources.json'),'utf8')) as {examples:Array<{id:string}>};
  for(const example of manifest.examples){
   const originalPath=resolve(root,'fixtures/showcase/definitions',example.id+'.json');expect(existsSync(originalPath),`${example.id} original showcase source exists`).toBe(true);
   const document=readVisualDocument(readFileSync(originalPath,'utf8'),'json'),plan=compilePresentation(document,{backend:'lini',theme:'presentation/1'});
   expect(plan.ok,`${example.id} must compile to current Lini`).toBe(true);if(!plan.ok)continue;
   const native=await renderPresentationLini(plan.source),page=await browser.newPage({viewport:{width:1600,height:900}});
   try{
    await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden}#frame{width:1600px;height:900px}#frame svg{width:100%;height:100%}</style><div id="frame"></div>',{waitUntil:'domcontentloaded'});
    await page.locator('#frame').evaluate((frame,svg)=>{frame.innerHTML=svg;},native.svg);
    const checks=await verifyLiniPresentationQuality(page,{document,plan,nativeAst:native.nativeAst});
    const visual=getVisual(document);
    const rich=visual.kind==='sequence'||visual.kind==='structure'&&visual.form==='tree';
    if(rich){expect(checks.map(check=>check.check)).toEqual(['lini-rich-native-semantics','lini-rich-svg-ownership-geometry','lini-rich-typography']);const failed=checks.filter(check=>check.result!=='pass');if(failed.length)throw Error(JSON.stringify(failed));}
    else expectAll(checks);
   }finally{await page.close();}
  }
 });
});
