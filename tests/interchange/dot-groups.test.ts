import {expect,test} from 'bun:test';
import {dotAdapter} from '../../src/interchange/dot';
import {exportVisual,importVisual} from '../../src/interchange';
import {createVisualDocument,inspectVisual,type Visual} from '../../src/extensions/visual';

const context={id:'clusters',question:'How are these parts grouped?'};

test('exports nested groups, membership, labels, group/node details, and edge rationale as clusters and tooltips',()=>{
 const visual:Visual={id:'grouped-flow',kind:'flow',form:'network',question:'Q',groups:[
  {id:'outer',label:'Outer zone',detail:'Trust boundary',role:'boundary',tier:2},
  {id:'inner',label:'Inner lane',role:'lane',parent:'outer'}
 ],nodes:[
  {id:'front',label:'Front',detail:'Public entry',group:'outer'},
  {id:'service',label:'Service',group:'inner'},
  {id:'sink',label:'Sink'}
 ],edges:[{id:'request',from:'front',to:'service',label:'calls',why:'Carries the request'}]};
 const result=dotAdapter.serialize(visual,context);
 expect(result.text).toBe('digraph "grouped-flow" {\n  subgraph "cluster_umf_g1" {\n    graph [label="Outer zone", tooltip="Trust boundary"];\n    "front" [label="Front", tooltip="Public entry"];\n    subgraph "cluster_umf_g2" {\n      graph [label="Inner lane", tooltip=""];\n      "service" [label="Service"];\n    }\n  }\n  "sink" [label="Sink"];\n  "front" -> "service" [label="calls", tooltip="Carries the request"];\n}\n');
 expect(result.diagnostics.map(d=>d.path)).toEqual([
  '/extensions/umf.visual/groups/1/role','/extensions/umf.visual/groups/0/role','/extensions/umf.visual/groups/0/tier'
 ]);
 expect(result.identityMap.filter(item=>item.kind==='group').map(({nativeId,visualId,path})=>({nativeId,visualId,path}))).toEqual([
  {nativeId:'cluster_umf_g1',visualId:'outer',path:'/extensions/umf.visual/groups/0'},
  {nativeId:'cluster_umf_g2',visualId:'inner',path:'/extensions/umf.visual/groups/1'}
 ]);
 const parsed=dotAdapter.parse(result.text!,context);
 expect(parsed.visual?.groups).toEqual([
  {id:'g1',label:'Outer zone',detail:'Trust boundary',role:'region'},
  {id:'g2',label:'Inner lane',role:'region',parent:'g1'}
 ]);
 expect(parsed.visual?.nodes?.map(({label,group,detail})=>({label,group,detail}))).toEqual([
  {label:'Front',group:'g1',detail:'Public entry'},
  {label:'Service',group:'g2',detail:undefined},
  {label:'Sink',group:undefined,detail:undefined}
 ]);
 expect(parsed.visual?.edges?.[0]).toMatchObject({label:'calls',why:'Carries the request'});
});

test('imports nested clusters with scoped node/edge defaults and cross-boundary links',()=>{
 const source=String.raw`digraph G {
  graph [label="Root title"];
  node [label="root default", tooltip="root hint"];
  edge [label="root link", tooltip="root why"];
  root;
  subgraph cluster_outer {
   graph [label="Outer", tooltip="outer detail"];
   node [label="outer default", tooltip="outer hint"];
   edge [label="local link", tooltip="local why"];
   a -> b;
   subgraph cluster_inner { graph [label="Inner"]; c [tooltip="inner hint"]; }
   b -> c;
  }
  tail;
  a -> tail [label="leaves", tooltip="crosses group boundary"];
 }`;
 const result=dotAdapter.parse(source,context);
 expect(result.visual).toMatchObject({title:'Root title',form:'network',groups:[
  {id:'g1',label:'Outer',detail:'outer detail',role:'region'},
  {id:'g2',label:'Inner',detail:'outer detail',role:'region',parent:'g1'}
 ],nodes:[
  {id:'n1',label:'root default',detail:'root hint'},
  {id:'n2',label:'outer default',detail:'outer hint',group:'g1'},
  {id:'n3',label:'outer default',detail:'outer hint',group:'g1'},
  {id:'n4',label:'outer default',detail:'inner hint',group:'g2'},
  {id:'n5',label:'root default',detail:'root hint'}
 ],edges:[
  {from:'n2',to:'n3',label:'local link',why:'local why'},
  {from:'n3',to:'n4',label:'local link',why:'local why'},
  {from:'n2',to:'n5',label:'leaves',why:'crosses group boundary'}
 ]});
 expect(result.diagnostics.some(d=>d.code==='DOT_GROUP_ROLE'&&d.loss)).toBe(true);
 expect(result.diagnostics.some(d=>d.code==='DOT_GROUP_TIER'&&d.loss)).toBe(true);
 expect(result.identityMap.filter(item=>item.kind==='group').map(item=>item.nativeId)).toEqual(['cluster_outer','cluster_inner']);
});

test('admits tooltip-free clusters through the public facade and replays retained DOT exactly',()=>{
 const source='digraph { subgraph cluster_a { graph [label="Group"]; a [label="A"]; } b [label="B"]; a -> b; }';
 const imported=importVisual(source,{format:'dot',id:'clustered',question:'How are nodes grouped?',mode:'allow-reported-loss'});
 expect(imported.ok).toBe(true);
 if(!imported.ok||!imported.document)return;
 expect(imported.document.extensions?.['umf.visual']).toMatchObject({groups:[{id:'g1',label:'Group',role:'region'}]});
 expect(Object.hasOwn((imported.document.extensions?.['umf.visual'] as any).groups[0],'detail')).toBe(false);
 const replay=exportVisual(imported.document,{format:'dot',source:imported.source,original:true});
 expect(replay).toMatchObject({ok:true,text:source});
});

test('preserves empty labeled clusters and cluster-specific tooltips',()=>{
 const result=dotAdapter.parse('digraph { subgraph cluster_empty { graph [label="Empty", tooltip="Not populated"]; } outside; }',context);
 expect(result.visual?.groups).toEqual([{id:'g1',label:'Empty',detail:'Not populated',role:'region'}]);
 expect(result.visual?.nodes).toEqual([{id:'n1',label:'outside'}]);
 expect(inspectVisual(createVisualDocument(result.visual!)).complete).toBe(true);
});

test('maps cluster tooltip inheritance and explicit empty tooltip suppression',()=>{
 const inherited=dotAdapter.parse('digraph { subgraph cluster_parent { graph [label="Parent", tooltip="Parent detail"]; a; subgraph cluster_child { graph [label="Child"]; b; } } }',context);
 expect(inherited.visual?.groups?.map(group=>group.detail)).toEqual(['Parent detail','Parent detail']);
 const suppressed=dotAdapter.parse('digraph { subgraph cluster_parent { graph [label="Parent", tooltip="Parent detail"]; a; subgraph cluster_child { graph [label="Child", tooltip=""]; b; } } }',context);
 expect(suppressed.visual?.groups?.map(group=>group.detail)).toEqual(['Parent detail',undefined]);
 expect(suppressed.diagnostics.some(item=>item.code==='DOT_TOOLTIP_EMPTY')).toBe(false);
});

test('reports group roles, tiers, status, emphasis, and zoned/lane layout instead of inferring them',()=>{
 for(const form of ['zoned','lanes'] as const){
  const visual:Visual={id:'g',kind:'flow',form,question:'Q',groups:[{id:'lane',label:'Lane',role:'lane',tier:3,status:'built',emphasis:'focus'}],nodes:[{id:'a',label:'A',group:'lane'}]};
  const result=dotAdapter.serialize(visual,context);
  expect(result.text).toContain('subgraph "cluster_umf_g1"');
  expect(result.diagnostics.map(d=>d.code)).toContain('DOT_FLOW_LAYOUT');
  expect(result.diagnostics.map(d=>d.path)).toEqual([
   '/extensions/umf.visual/groups/0/role','/extensions/umf.visual/groups/0/tier',
   '/extensions/umf.visual/groups/0/status','/extensions/umf.visual/groups/0/emphasis',
   '/extensions/umf.visual/form'
  ]);
 }
 const imported=dotAdapter.parse('digraph { subgraph cluster_red { graph [label="Zone", style=filled, color=red]; a; } }',context);
 expect(imported.visual?.groups?.[0]?.role).toBe('region');
 expect(imported.visual?.groups?.[0]?.role).not.toBe('zone');
 expect(imported.diagnostics.some(d=>d.code==='DOT_ATTRIBUTE_LOSS'&&d.loss)).toBe(true);
 expect(imported.diagnostics.some(d=>d.code==='DOT_GROUP_ROLE'&&d.loss)).toBe(true);
});

test.each([
 ['digraph { subgraph cluster_missing { a; } }','DOT_GROUP_LABEL'],
 ['digraph { subgraph ordinary { graph [label="No"]; a; } }','DOT_SUBGRAPH'],
 ['digraph { { graph [label="Anonymous"]; a; } }','DOT_SUBGRAPH'],
 ['digraph { subgraph cluster_x { graph [label="X"]; a; } subgraph cluster_x { graph [label="X again"]; b; } }','DOT_GROUP_ID'],
 ['digraph { subgraph cluster_a { graph [label="A"]; n; } subgraph cluster_b { graph [label="B"]; n; } }','DOT_GROUP_OVERLAP'],
 ['digraph { subgraph cluster_x { graph [label="X", cluster=false]; a; } }','DOT_CLUSTER'],
 ['digraph { subgraph cluster_x { graph [label="X"]; a; } subgraph cluster_y { graph [label="Y"]; subgraph cluster_x { graph [label="nested"]; b; } } }','DOT_GROUP_ID']
] as const)('refuses ambiguous or unsupported cluster syntax: %s',(source,code)=>{
 const result=dotAdapter.parse(source,context);
 expect(result.visual).toBeUndefined();expect(result.diagnostics.some(d=>d.code===code&&d.severity==='error')).toBe(true);
});

test('handles identity path escaping and keeps group/node IDs in separate mapped identities',()=>{
 const result=dotAdapter.parse(String.raw`digraph { subgraph "cluster/a~b" { graph [label="A"]; "cluster/a~b"; } }`,context);
 expect(result.visual?.groups?.[0]?.id).toBe('g1');
 expect(result.visual?.nodes?.[0]?.id).toBe('n1');
 expect(result.identityMap).toEqual(expect.arrayContaining([
  expect.objectContaining({kind:'group',nativeId:'cluster/a~b',visualId:'g1',sourcePath:'/source/subgraphs/cluster~1a~0b'}),
  expect.objectContaining({kind:'node',nativeId:'cluster/a~b',visualId:'n1',sourcePath:'/source/nodes/cluster~1a~0b'})
 ]));
});

test('maps edge rationale to tooltip separately from edge label and respects default/override scope',()=>{
 const imported=dotAdapter.parse(String.raw`digraph { edge [tooltip="default why"]; a -> b [label="uses"]; subgraph cluster_x { graph [label="X"]; c -> d [tooltip="local why"]; } a -> c [tooltip="explicit why"]; }`,context);
 expect(imported.visual?.edges?.map(edge=>[edge.label,edge.why])).toEqual([
  ['uses','default why'],[undefined,'local why'],[undefined,'explicit why']
 ]);
 const visual:Visual={id:'e',kind:'flow',form:'network',question:'Q',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],edges:[{id:'e1',from:'a',to:'b',label:'uses',why:'Why this link'}]};
 const exported=dotAdapter.serialize(visual,context);
 expect(exported.text).toContain('[label="uses", tooltip="Why this link"]');
 expect(exported.diagnostics.some(d=>d.path.endsWith('/why'))).toBe(false);
 expect(dotAdapter.parse(String.raw`digraph { a -> b [tooltip="\N"]; }`,context).diagnostics[0]?.code).toBe('DOT_TOOLTIP_ESCAPE');
});

test('restores outer edge defaults after leaving nested cluster scopes',()=>{
 const result=dotAdapter.parse('digraph { edge [label="root edge", tooltip="root why"]; subgraph cluster_x { graph [label="X"]; edge [label="local edge", tooltip="local why"]; a -> b; } c -> d; }',context);
 expect(result.visual?.edges?.map(edge=>[edge.label,edge.why])).toEqual([['local edge','local why'],['root edge','root why']]);
});

test('avoids a native cluster identity collision with the graph ID and maps the actual emitted name',()=>{
 const visual:Visual={id:'cluster_umf_g1',kind:'flow',form:'network',question:'Q',groups:[{id:'g',label:'Group',role:'region'}],nodes:[{id:'a',label:'A',group:'g'}]};
 const result=dotAdapter.serialize(visual,context);
 expect(result.text).toContain('subgraph "cluster_umf_g1_x"');
 expect(result.identityMap.find(item=>item.kind==='group')).toMatchObject({nativeId:'cluster_umf_g1_x',visualId:'g'});
 expect(dotAdapter.parse(result.text!,context).visual?.groups?.[0]?.label).toBe('Group');
});

test('enforces nested cluster limits before accepting deeper input',()=>{
 const nested=Array.from({length:17},(_,i)=>'subgraph cluster_'+i+' { graph [label="g'+i+'"];').join(' ');
 const closers=Array.from({length:17},()=>'}').join(' ');
 const result=dotAdapter.parse('digraph { '+nested+' a; '+closers+' }',context);
 expect(result.visual).toBeUndefined();expect(result.diagnostics.some(d=>d.code==='DOT_GROUP_DEPTH')).toBe(true);
});
