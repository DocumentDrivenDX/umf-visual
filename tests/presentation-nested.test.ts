// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {createVisualDocument,getVisual,type Visual} from '../src/extensions/visual';
import {compilePresentation} from '../src/presentation';
import {compileNestedPresentation} from '../src/presentation/nested';
import {checkNestedBounds,inspectNestedNative} from '../scripts/presentation/nested-quality';

const document=JSON.parse(readFileSync('fixtures/visual/inventory/beacon-estate-landscape.json','utf8')) as Document;
const visual=getVisual(document) as Visual;
const compile=(value:Visual,backend:'graphviz'|'mermaid')=>compilePresentation(createVisualDocument(value,'visual:'+value.id,'1.4.0'),{backend,theme:'presentation/1'});

test('nested Graphviz and Mermaid projections use source nodes as native containers without synthetic links',()=>{
 for(const backend of ['graphviz','mermaid'] as const){
  const plan=compile(visual,backend);expect(plan.ok).toBe(true);if(!plan.ok)continue;
  expect(plan.elementMap.filter(row=>row.kind==='node').map(row=>row.logicalId)).toEqual(visual.nodes!.map(node=>node.id));
  expect(plan.elementMap.filter(row=>row.kind==='edge'||row.kind==='group')).toHaveLength(0);
  expect(plan.approximations).toHaveLength(0);
  expect(plan.source).toContain('Support tools estate');expect(plan.source).toContain(backend==='graphviz'?'Role: own':'Role:#32;own');expect(plan.source).toContain(backend==='graphviz'?'Status: placeholder':'Status:#32;placeholder');
  if(backend==='graphviz'){
   expect(plan.source).toContain('subgraph cluster_n1');expect(plan.source).toContain('subgraph cluster_n2');
   expect(plan.source).not.toContain(' -> ');
  }else{
   expect(plan.source).toContain('subgraph n1');expect(plan.source).toContain('subgraph n2');
   expect(plan.source).not.toContain(' -.-> ');
  }
 }
});

test('native hierarchy verifier detects escaped children, borrowed captions, and phantom carriers',()=>{
 for(const backend of ['graphviz','mermaid'] as const){
  const plan=compile(visual,backend);expect(plan.ok).toBe(true);if(!plan.ok)continue;
  expect(inspectNestedNative(plan,visual)).toMatchObject({ok:true,problems:[]});
  const childLine=backend==='graphviz'?'      n6 [':'      n6[';
  const childStatement=plan.source.split('\n').find(line=>line.trimStart().startsWith(childLine.trimStart()))!;
  const brokenSource=backend==='graphviz'?plan.source.replace(childStatement+'\n','').replace('    }\n','    }\n'+childStatement+'\n'):plan.source.replace(childStatement+'\n','').replace('    end\n','    end\n'+childStatement+'\n');
  const brokenHierarchy={...plan,source:brokenSource};
  expect(inspectNestedNative(brokenHierarchy,visual).problems.some(problem=>problem.includes('parent of web'))).toBe(true);
  const borrowedCaption={...plan,source:plan.source.replace(backend==='graphviz'?'"beacon\\nexample/beacon\\nRole: own"':'beacon<br/>example/beacon<br/>Role:#32;own','wrong borrowed caption')};
  expect(inspectNestedNative(borrowedCaption,visual).problems.some(problem=>problem.includes('Caption for system-beacon'))).toBe(true);
  const phantom={...plan,source:backend==='graphviz'?plan.source.replace(/\n\}/u,'\n  n11 [label="phantom"];\n}') : plan.source.replace(/\n  end\n$/u,'\n  n11["phantom"]\n  end\n')};
  expect(inspectNestedNative(phantom,visual).problems.some(problem=>problem.includes('Phantom'))).toBe(true);
  const semanticEdge={...plan,source:backend==='graphviz'?plan.source.replace(/\n\}/u,'\n  n6 -> n7;\n}') : plan.source.replace(/\n  end\n$/u,'\n  n6 --> n7\n  end\n')};
  expect(inspectNestedNative(semanticEdge,visual).problems.some(problem=>problem.includes('synthetic native connector'))).toBe(true);
 }
});

test('arrow-like quoted labels and escaped quotes are not parsed as synthetic links',()=>{
 const hostile={...visual,nodes:visual.nodes!.map((node,index)=>index===1?{...node,label:'beacon "quoted" -- text --> stays text'}:node)} as Visual;
 for(const backend of ['graphviz','mermaid'] as const){const plan=compile(hostile,backend);expect(plan.ok).toBe(true);if(!plan.ok)continue;expect(inspectNestedNative(plan,hostile)).toMatchObject({ok:true,problems:[]});}
});

test('native bounds verifier detects escaped descendants, overlapping siblings, and captions over children',()=>{
 const bounds=new Map([['estate',{x:0,y:0,width:1100,height:500}],['system-beacon',{x:20,y:60,width:700,height:400}],['system-ledger',{x:740,y:60,width:100,height:80}],['system-portal',{x:850,y:60,width:100,height:80}],['system-insight',{x:960,y:60,width:100,height:80}],['web',{x:40,y:120,width:100,height:50}],['api',{x:200,y:120,width:100,height:50}],['drafter',{x:360,y:120,width:100,height:50}],['worker',{x:520,y:120,width:100,height:50}],['rules',{x:40,y:200,width:100,height:50}]]);
 expect(checkNestedBounds(visual,bounds)).toEqual([]);
 const outside=new Map(bounds);outside.set('web',{x:800,y:460,width:100,height:50});
 expect(checkNestedBounds(visual,outside).some(problem=>problem.includes('escape enclosing container system-beacon'))).toBe(true);
 const caption=new Map([['system-beacon',{x:30,y:120,width:90,height:20}]]);
 expect(checkNestedBounds(visual,bounds,caption).some(problem=>problem.includes('caption for system-beacon overlaps child frame web'))).toBe(true);
 const overlap=new Map(bounds);overlap.set('system-portal',{x:760,y:80,width:100,height:80});
 expect(checkNestedBounds(visual,overlap).some(problem=>problem.includes('sibling frames system-ledger and system-portal overlap'))).toBe(true);
});

test('nested adapter refuses unsupported properties and grid layout at their source paths',()=>{
 const badLayout={...visual,layout:{kind:'grid',columns:2}} as unknown as Visual;
 expect(compile(badLayout,'graphviz')).toMatchObject({ok:false,diagnostics:[{path:'/extensions/umf.visual/layout/kind'}]});
 const unknownLayout={...visual,layout:{kind:'flow',direction:'TB','custom/~hint':'preserve'}} as unknown as Visual;
 expect(compile(unknownLayout,'graphviz')).toMatchObject({ok:false,diagnostics:[{path:'/extensions/umf.visual/layout/custom~1~0hint'}]});
 expect(compileNestedPresentation(unknownLayout,'graphviz')).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_NESTED_LAYOUT',path:'/extensions/umf.visual/layout/custom~1~0hint'}]});
 const badShape={...visual,nodes:visual.nodes!.map((node,index)=>index===0?{...node,shape:'diamond'}:node)} as unknown as Visual;
 expect(compileNestedPresentation(badShape,'mermaid')).toMatchObject({ok:false,diagnostics:[{path:'/extensions/umf.visual/nodes/0/shape'}]});
 const unknown={...visual,unmodeled:'keep'} as unknown as Visual;
 expect(compileNestedPresentation(unknown,'mermaid')).toMatchObject({ok:false,diagnostics:[{path:'/extensions/umf.visual/unmodeled'}]});
});

test('source declaration order is stable and tree direction is retained when order is absent',()=>{
 const ordered={...visual,nodes:[...visual.nodes!,{id:'tail',label:'Independent root'}],layout:{kind:'flow',direction:'LR'}} as unknown as Visual;
 const original=visual.nodes!.map(node=>node.id);
 for(const backend of ['graphviz','mermaid'] as const){const plan=compile(ordered,backend);expect(plan.ok).toBe(true);if(!plan.ok)continue;expect(plan.source).toContain(backend==='graphviz'?'rankdir=LR':'flowchart LR');const root=plan.source.indexOf(backend==='graphviz'?'cluster_n1':'subgraph n1');expect(root).toBeGreaterThanOrEqual(0);expect(root).toBeLessThan(plan.source.indexOf('n11'));expect(plan.source.indexOf('n2',root)).toBeLessThan(plan.source.indexOf('n3',root));}
 expect(visual.nodes!.map(node=>node.id)).toEqual(original);
});

test('valid one-root flow order is admitted; valid multi-root flow order is located refusal',()=>{
 const single={...visual,layout:{kind:'flow',order:['estate']}} as unknown as Visual;
 for(const backend of ['graphviz','mermaid'] as const)expect(compile(single,backend).ok).toBe(true);
 const multiRoot={...visual,nodes:[...visual.nodes!,{id:'tail',label:'Independent root'}],layout:{kind:'flow',order:['estate','tail']}} as unknown as Visual;
 expect(compile(multiRoot,'graphviz')).toMatchObject({ok:false,diagnostics:[{path:'/extensions/umf.visual/layout/order'}]});
});
