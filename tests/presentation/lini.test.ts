// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,it} from 'bun:test';
import {createVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';

const document=(visual:Visual)=>createVisualDocument(visual,'test:'+visual.id,'1.2.0');

describe('Lini presentation compiler',()=>{
 it('emits native nested groups, safe labels, node details and scoped connections',()=>{
  const source=document({id:'nested',kind:'flow',form:'network',question:'Which group contains the service?',title:'Service topology',groups:[{id:'services',label:'Services',detail:'Owned boundary',role:'zone'},{id:'workers',label:'Workers',parent:'services',role:'lane'}],nodes:[{id:'api',label:'API "front"',detail:'Public endpoint',role:'actor',group:'services'},{id:'worker',label:'Worker',role:'own',group:'workers'},{id:'db',label:'Database',role:'store'}],edges:[{id:'read',from:'worker',to:'db',label:'reads',kind:'data'}]});
  const result=compilePresentation(source,{backend:'lini'});expect(result.ok).toBe(true);if(!result.ok)return;
  expect(result.nativeFormat).toBe('lini');expect(result.source).toContain('.lini-block { font-family: Arial; }');expect(result.source).toContain('|group#visual| "Service topology"');expect(result.source).toContain('|group#g1| "Services"');expect(result.source).toContain('|cell#detail| "Owned boundary"');expect(result.source).toContain('|group#g2| "Workers"');expect(result.source).toContain('|oval#n1| "API \\"front\\""');expect(result.source).toContain('|cell#detail| "Public endpoint"');expect(result.source).toContain('g1.g2.n2 -> n3 "reads" .e1');expect(result.source).toContain('.e1 { stroke-style: dashed; }');
  expect(result.elementMap).toContainEqual({logicalId:'services',sourcePath:'/extensions/umf.visual/groups/0',nativeId:'g1',kind:'group'});expect(result.elementMap).toContainEqual({logicalId:'api',sourcePath:'/extensions/umf.visual/nodes/0/id',nativeId:'n1',kind:'node'});expect(result.elementMap).toContainEqual({logicalId:'read',sourcePath:'/extensions/umf.visual/edges/0',nativeId:'e1',kind:'edge'});
  expect(result.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/nodes/0/detail'&&item.representation.includes('persistent secondary native cell'))).toBe(true);
 });

 it('accounts for group styling as a presentation convention and does not report absent field types as loss',()=>{
  const grouped=document({id:'group-style-inventory',kind:'flow',form:'network',question:'What is emphasized?',groups:[{id:'boundary',label:'Boundary',role:'boundary',status:'built',emphasis:'focus'}],nodes:[{id:'service',label:'Service',group:'boundary'}]});
  const groupResult=compilePresentation(grouped,{backend:'lini'});expect(groupResult.ok).toBe(true);if(!groupResult.ok)return;
  expect(groupResult.source).toContain('fill: --green-wash;');expect(groupResult.source).toContain('stroke: --green-deep;');expect(groupResult.source).toContain('stroke-width: 3;');
  expect(groupResult.omissions.some(item=>item.sourcePath==='/extensions/umf.visual/groups/0/role')).toBe(false);expect(groupResult.omissions.some(item=>item.sourcePath==='/extensions/umf.visual/groups/0/status')).toBe(false);expect(groupResult.omissions.some(item=>item.sourcePath==='/extensions/umf.visual/groups/0/emphasis')).toBe(false);
  expect(groupResult.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/groups/0/role'&&item.representation.includes('role palette convention'))).toBe(true);expect(groupResult.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/groups/0/status')).toBe(true);expect(groupResult.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/groups/0/emphasis')).toBe(true);

  const untyped=document({id:'untyped-field',kind:'structure',form:'entities',question:'Which fields?',nodes:[{id:'item',label:'Item'}],structure:{entities:[{node:'item',fields:[{name:'id'}]}]}});
  const fieldResult=compilePresentation(untyped,{backend:'lini'});expect(fieldResult.ok).toBe(true);if(!fieldResult.ok)return;
  expect(fieldResult.omissions.some(item=>item.sourcePath==='/extensions/umf.visual/structure/entities/0/fields/0/type')).toBe(false);
  expect(fieldResult.source).toContain('|cell#f1| "id"; ""');
 });

 it('reports rendered stack and entity node styles without contradictory omissions',()=>{
  const stack=document({id:'styled-stack',kind:'structure',form:'stack',question:'How are layers styled?',nodes:[{id:'service',label:'Service',layer:'api',role:'actor',status:'built',emphasis:'focus'}],structure:{layers:[{id:'api',label:'API'}]}});
  const stackResult=compilePresentation(stack,{backend:'lini'});expect(stackResult.ok).toBe(true);if(!stackResult.ok)return;
  for(const key of ['role','status','emphasis']){const sourcePath='/extensions/umf.visual/nodes/0/'+key;expect(stackResult.omissions.some(item=>item.sourcePath===sourcePath)).toBe(false);expect(stackResult.approximations.some(item=>item.sourcePath===sourcePath)).toBe(true);}

  const entities=document({id:'styled-entity',kind:'structure',form:'entities',question:'How is the entity styled?',nodes:[{id:'account',label:'Account',role:'actor',status:'built',emphasis:'focus'}],structure:{entities:[{node:'account',fields:[{name:'id',type:'uuid'}]}]}});
  const entityResult=compilePresentation(entities,{backend:'lini'});expect(entityResult.ok).toBe(true);if(!entityResult.ok)return;
  for(const key of ['role','status','emphasis']){const sourcePath='/extensions/umf.visual/nodes/0/'+key;expect(entityResult.omissions.some(item=>item.sourcePath===sourcePath)).toBe(false);expect(entityResult.approximations.some(item=>item.sourcePath===sourcePath)).toBe(true);}
  const roleApproximation=entityResult.approximations.find(item=>item.sourcePath==='/extensions/umf.visual/nodes/0/role');expect(roleApproximation?.representation).toContain('fixed table silhouette');expect(roleApproximation?.representation).toContain('role-derived node glyphs do not apply');
 });

 it('renders authored stack layers as ordered one-column groups without connections',()=>{
  const source=document({id:'layers',kind:'structure',form:'stack',question:'Which layers appear?',nodes:[{id:'api',label:'API',layer:'interface'},{id:'compiler',label:'Compiler',layer:'engine'},{id:'package',label:'Package',layer:'engine'}],structure:{layers:[{id:'interface',label:'Public interface'},{id:'engine',label:'Compiler engine'}]}});
  const result=compilePresentation(source,{backend:'lini'});expect(result.ok).toBe(true);if(!result.ok)return;
  expect(result.source).toContain('|group#visual| "Which layers appear?" { layout: grid; columns: repeat(1); gap: 44;');expect(result.source).toContain('|group#l1| "Public interface"');expect(result.source).toContain('|group#l2| "Compiler engine"');expect(result.source.indexOf('|group#l1|')).toBeLessThan(result.source.indexOf('|group#l2|'));expect(result.source).not.toContain(' -> ');
  expect(result.elementMap).toContainEqual({logicalId:'engine',sourcePath:'/extensions/umf.visual/structure/layers/1',nativeId:'l2',kind:'layer'});expect(result.omissions.some(item=>item.sourcePath==='/extensions/umf.visual/edges')).toBe(false);
 });

 it('keeps entity field IDs and types, shows key/null badges and native field endpoints',()=>{
  const source=document({id:'entities',kind:'structure',form:'entities',question:'How are tables connected?',title:'Workspace records',nodes:[{id:'workspace',label:'Workspaces'},{id:'member',label:'Members'}],structure:{entities:[{node:'workspace',fields:[{id:'workspace-id',name:'id',type:'uuid',keys:['pk'],nullable:false},{name:'name',type:'text',nullable:false}]},{node:'member',fields:[{id:'member-id',name:'id',type:'uuid',keys:['pk'],nullable:false},{id:'workspace-fk',name:'workspace_id',type:'uuid',keys:['fk'],nullable:false}]}],references:[{id:'membership',from:{node:'workspace',fieldId:'workspace-id'},to:{node:'member',fieldId:'workspace-fk'},label:'contains',fromCardinality:'exactly-one',toCardinality:'zero-or-many'}]}});
  const result=compilePresentation(source,{backend:'lini'});expect(result.ok).toBe(true);if(!result.ok)return;
  expect(result.source).toContain('|entity#n1| "Workspaces"');expect(result.source).toContain('|cell#f1| "id · PK · NOT NULL"; "uuid"');expect(result.source).toContain('n1.f1:right ++-o< n2.f2:left "contains" .r1');
  expect(result.elementMap).toContainEqual({logicalId:'workspace-id',sourcePath:'/extensions/umf.visual/structure/entities/0/fields/0',nativeId:'n1.f1',kind:'field'});expect(result.elementMap).toContainEqual({logicalId:'membership',sourcePath:'/extensions/umf.visual/structure/references/0',nativeId:'r1',kind:'reference'});expect(result.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/structure/entities/0/fields/0/keys')).toBe(true);expect(result.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/structure/entities/0/fields/0/nullable')).toBe(true);
 });

 it('shows exact nonstandard ranges without assigning a conventional marker',()=>{
  const source=document({id:'ranges',kind:'structure',form:'entities',question:'Which exact ranges?',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],structure:{entities:[{node:'a',fields:[{name:'id',type:'Id'}]},{node:'b',fields:[{name:'aId',type:'Id'}]}],references:[{id:'r',from:{node:'a',field:'id'},to:{node:'b',field:'aId'},fromMultiplicity:{min:0,max:8,text:'0..8'},toMultiplicity:{min:2,max:4}}]}});
  const result=compilePresentation(source,{backend:'lini'});expect(result.ok).toBe(true);if(!result.ok)return;
  expect(result.source).toContain('n1.f1:right - n2.f1:left "[from 0..8; to 2..4]" .r1');expect(result.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/structure/references/0'&&item.representation.includes('exact text'))).toBe(true);
 });

 it('refuses text Lini 1.1 cannot encode and rejects unsafe options before dispatch',()=>{
  const unsupported=document({id:'bad-text',kind:'flow',form:'network',question:'Bad?',nodes:[{id:'n',label:'Bad\u0085text'}]});
  expect(compilePresentation(unsupported,{backend:'lini'})).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_LINI_TEXT'}]});
  let read=false;const options={get backend(){read=true;return'lini';}};
  expect(compilePresentation(document({id:'safe',kind:'flow',form:'network',question:'Safe?',nodes:[{id:'n',label:'Node'}]}),options as never)).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_OPTIONS'}]});expect(read).toBe(false);
 });

 it('projects 1.2 node shapes, named ports, side anchors and declared layouts in all backends',()=>{
  const source=document({id:'native-shapes',kind:'flow',form:'network',question:'How do components connect?',title:'Native shapes and ports',layout:{kind:'flow',direction:'TB',order:['input','engine']},groups:[{id:'engine',label:'Engine',role:'zone',layout:{kind:'grid',columns:2,order:['work','store']}}],nodes:[
   {id:'input',label:'Request',shape:'rounded-rectangle',ports:[{id:'out',label:'request body',side:'south'}]},
   {id:'work',label:'Compiler',group:'engine',shape:'hexagon',detail:'Transforms a definition',ports:[{id:'in',label:'definition',side:'west'},{id:'out',label:'compiled source',side:'east'}]},
   {id:'store',label:'Artifacts',group:'engine',shape:'cylinder',ports:[{id:'source',label:'source file',side:'north'}]},
  ],edges:[{id:'compile',from:'input',to:'work',fromPort:'out',toPort:'in',label:'compile'},{id:'save',from:'work',to:'store',fromPort:'out',toPort:'source',label:'write'}]});
  const graphviz=compilePresentation(source,{backend:'graphviz'});expect(graphviz.ok).toBe(true);if(!graphviz.ok)return;
  expect(graphviz.source).toContain('rankdir="TB"');expect(graphviz.source).toContain('shape=box, style="rounded,filled"');expect(graphviz.source).toContain('shape=hexagon');expect(graphviz.source).toContain('shape=cylinder');expect(graphviz.source).toContain('PORT="p1"');expect(graphviz.source).toContain('n1:p1:s -> n2:p1:w');expect(graphviz.elementMap).toContainEqual({logicalId:'in',sourcePath:'/extensions/umf.visual/nodes/1/ports/0',nativeId:'n2.p1',kind:'port'});expect(graphviz.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/nodes/0/ports/0/side'&&item.representation.includes('row attachment can differ'))).toBe(true);
  const mermaid=compilePresentation(source,{backend:'mermaid'});expect(mermaid.ok).toBe(true);if(!mermaid.ok)return;
  expect(mermaid.source).toContain('flowchart TB');expect(mermaid.source).toContain('shape: rounded');expect(mermaid.source).toContain('shape: hex');expect(mermaid.source).toContain('shape: cyl');expect(mermaid.source).toContain('request#32;body');expect(mermaid.source).not.toContain('from#32;request#32;body');expect(mermaid.elementMap).toContainEqual({logicalId:'out',sourcePath:'/extensions/umf.visual/nodes/0/ports/0',nativeId:'n1',kind:'port'});expect(mermaid.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/nodes/0/ports/0'&&item.representation.includes('including for ports without linked edges'))).toBe(true);expect(mermaid.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/edges/0/fromPort'&&item.representation.includes('no distinct named port carrier'))).toBe(true);expect(mermaid.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/groups/0/layout'&&item.representation.includes('fixed grid column'))).toBe(true);
  const lini=compilePresentation(source,{backend:'lini'});expect(lini.ok).toBe(true);if(!lini.ok)return;
  expect(lini.source).toContain('layout: flow; direction: column;');expect(lini.source).toContain('columns: repeat(2);');expect(lini.source).toContain('|hex#n2| "Compiler"');expect(lini.source).toContain('|cell#p1| "request body · out" { pin: bottom; font-size: 11; font-weight: 400; color: --gray-deep; padding: 2; }');expect(lini.source).toContain('n1.p1:bottom -> g1.n2.p1:left "compile" .e1 { along: 0.1; }');expect(lini.elementMap).toContainEqual({logicalId:'out',sourcePath:'/extensions/umf.visual/nodes/0/ports/0',nativeId:'n1.p1',kind:'port'});
 });

 it('preserves stack direction and explicit root component ordering',()=>{
  const source=document({id:'stack-layout',kind:'structure',form:'stack',question:'Which layer order?',layout:{kind:'stack',direction:'LR',order:['client-b','client-a','database']},nodes:[{id:'client-a',label:'Client A',layer:'interface'},{id:'database',label:'Database',layer:'storage'},{id:'client-b',label:'Client B',layer:'interface'}],structure:{layers:[{id:'interface',label:'Interface'},{id:'storage',label:'Storage'}]}});
  const result=compilePresentation(source,{backend:'lini'});expect(result.ok).toBe(true);if(!result.ok)return;
  expect(result.source).toContain('layout: flow; direction: row;');
  expect(result.source.indexOf('|box#n3|')).toBeLessThan(result.source.indexOf('|box#n1|'));
  expect(result.source.indexOf('|group#l1|')).toBeLessThan(result.source.indexOf('|group#l2|'));
  expect(result.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/layout/order'&&item.representation.includes('requested declaration order'))).toBe(true);
  expect(result.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/structure/layers'&&item.representation.includes('left to right'))).toBe(true);
 });

 it('honors explicit entity order and one-column layout in all three backends',()=>{
  const source=document({id:'ordered-entities',kind:'structure',form:'entities',question:'What is the order?',layout:{kind:'grid',columns:1,order:['b','a']},nodes:[{id:'a',label:'Alpha'},{id:'b',label:'Beta'}],structure:{entities:[{node:'a',fields:[{name:'id',type:'Id'}]},{node:'b',fields:[{name:'id',type:'Id'}]}]}});
  const lini=compilePresentation(source,{backend:'lini'});expect(lini.ok).toBe(true);if(!lini.ok)return;
  expect(lini.source).toContain('layout: flow; direction: column;');expect(lini.source.indexOf('|entity#n2|')).toBeLessThan(lini.source.indexOf('|entity#n1|'));expect(lini.elementMap).toContainEqual({logicalId:'id',sourcePath:'/extensions/umf.visual/structure/entities/0/fields/0',nativeId:'n1.f1',kind:'field'});expect(lini.elementMap).toContainEqual({logicalId:'id',sourcePath:'/extensions/umf.visual/structure/entities/1/fields/0',nativeId:'n2.f1',kind:'field'});
  const graphviz=compilePresentation(source,{backend:'graphviz'});expect(graphviz.ok).toBe(true);if(!graphviz.ok)return;expect(graphviz.source).toContain('rankdir="TB"');expect(graphviz.source.indexOf('n2 [label=')).toBeLessThan(graphviz.source.indexOf('n1 [label='));expect(graphviz.source).toContain('n2 -> n1 [style=invis, weight=100];');
  const mermaid=compilePresentation(source,{backend:'mermaid'});expect(mermaid.ok).toBe(true);if(!mermaid.ok)return;expect(mermaid.source).toContain('direction TB');expect(mermaid.source.indexOf('n2["Beta')).toBeLessThan(mermaid.source.indexOf('n1["Alpha'));
 });

 it('dispatches authored flow and stack directions across supported root and group layouts',()=>{
  for(const kind of ['flow','stack'] as const)for(const direction of ['LR','TB'] as const){
   const network=document({id:`network-${kind}-${direction.toLowerCase()}`,kind:'flow',form:'network',question:'Network layout?',layout:{kind,direction},groups:[{id:'g',label:'Group',role:'zone',layout:{kind,direction,order:['a','b']}}],nodes:[{id:'a',label:'A',group:'g'},{id:'b',label:'B',group:'g'},{id:'c',label:'C'}],edges:[{id:'ab',from:'a',to:'b'},{id:'ac',from:'a',to:'c'}]});
   const expected=direction==='TB'?'TB':'LR';
   for(const backend of ['graphviz','mermaid','lini'] as const){const result=compilePresentation(network,{backend});expect(result.ok).toBe(true);if(!result.ok)continue;
    if(backend==='graphviz')expect(result.source).toContain('rankdir="'+expected+'"');
    if(backend==='mermaid')expect(result.source).toContain('flowchart '+expected);
    if(backend==='lini')expect(result.source).toContain('direction: '+(direction==='TB'?'column':'row')+';');
   }
   const mermaidGroup=compilePresentation(network,{backend:'mermaid'});if(mermaidGroup.ok)expect(mermaidGroup.source).toContain('direction '+expected);
  }
  const nestedAxis=document({id:'nested-axis',kind:'flow',form:'network',question:'Nested axis?',layout:{kind:'flow',direction:'TB'},groups:[{id:'g',label:'Group',role:'zone',layout:{kind:'stack',direction:'LR'}}],nodes:[{id:'a',label:'A',group:'g'},{id:'b',label:'B',group:'g'},{id:'outside',label:'Outside'}],edges:[{id:'crossing',from:'a',to:'outside'}]});
  const nestedDot=compilePresentation(nestedAxis,{backend:'graphviz'});expect(nestedDot.ok).toBe(true);if(nestedDot.ok){expect(nestedDot.source).toContain('rankdir="LR"');expect(nestedDot.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/groups/0/layout'&&item.representation.includes('does not reliably honor a cluster rankdir'))).toBe(true);}
  const nestedMermaid=compilePresentation(nestedAxis,{backend:'mermaid'});expect(nestedMermaid.ok).toBe(true);if(nestedMermaid.ok){expect(nestedMermaid.source).toContain('direction LR');expect(nestedMermaid.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/groups/0/layout'&&item.representation.includes('may override a subgraph direction'))).toBe(true);}
  const nestedLini=compilePresentation(nestedAxis,{backend:'lini'});expect(nestedLini.ok).toBe(true);if(nestedLini.ok)expect(nestedLini.source).toContain('layout: flow; direction: row;');

  for(const kind of ['flow','stack'] as const)for(const direction of ['LR','TB'] as const){
   const entities=document({id:`entities-${kind}-${direction.toLowerCase()}`,kind:'structure',form:'entities',question:'Entity layout?',layout:{kind,direction},nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],structure:{entities:[{node:'a',fields:[{name:'id',type:'Id'}]},{node:'b',fields:[{name:'aId',type:'Id'}]}],references:[{id:'r',from:{node:'a',field:'id'},to:{node:'b',field:'aId'},identification:'identifying',fromCardinality:'exactly-one',toCardinality:'zero-or-many'}]}});
   for(const backend of ['graphviz','mermaid','lini'] as const){const result=compilePresentation(entities,{backend});expect(result.ok).toBe(true);if(!result.ok)continue;
    if(backend==='graphviz')expect(result.source).toContain('rankdir="'+direction+'"');
    if(backend==='mermaid')expect(result.source).toContain('direction '+direction);
    if(backend==='lini')expect(result.source).toContain('direction: '+(direction==='TB'?'column':'row')+';');
   }
  }

  for(const kind of ['flow','stack'] as const)for(const direction of ['LR','TB'] as const){
   const stack=document({id:`stack-${kind}-${direction.toLowerCase()}`,kind:'structure',form:'stack',question:'Stack layout?',layout:{kind,direction},nodes:[{id:'a',label:'A',layer:'one'},{id:'b',label:'B',layer:'two'}],structure:{layers:[{id:'one',label:'One'},{id:'two',label:'Two'}]}});
   const graphviz=compilePresentation(stack,{backend:'graphviz'});expect(graphviz.ok).toBe(true);if(graphviz.ok)expect(graphviz.source).toContain('rankdir="'+direction+'"');
   const mermaid=compilePresentation(stack,{backend:'mermaid'});expect(mermaid.ok).toBe(true);if(mermaid.ok)expect(mermaid.source).toContain('flowchart '+direction);
   const lini=compilePresentation(stack,{backend:'lini'});expect(lini.ok).toBe(true);if(lini.ok)expect(lini.source).toContain('direction: '+(direction==='TB'?'column':'row')+';');
  }
 });

 it('makes every requested entity shape visible against the fixed native entity silhouette',()=>{
  const source=document({id:'entity-shapes',kind:'structure',form:'entities',question:'Which shapes?',nodes:[{id:'a',label:'A',shape:'ellipse'},{id:'b',label:'B',shape:'folded-corner'}],structure:{entities:[{node:'a',fields:[]},{node:'b',fields:[]}]}});
  const result=compilePresentation(source,{backend:'lini'});expect(result.ok).toBe(true);if(!result.ok)return;
  expect(result.source).toContain('(requested shape: ellipse)');expect(result.source).toContain('(requested shape: folded-corner)');
  expect(result.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/nodes/0/shape'&&item.representation.includes('fixed table silhouette'))).toBe(true);
  expect(result.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/nodes/1/shape'&&item.representation.includes('fixed table silhouette'))).toBe(true);
 });

 it('keeps entity port endpoints and explicit relationship identification visible',()=>{
  const source=document({id:'identified-ports',kind:'structure',form:'entities',question:'How do records relate?',nodes:[{id:'account',label:'Accounts',ports:[{id:'owner',label:'owner',side:'east'}]},{id:'invoice',label:'Invoices',ports:[{id:'account',label:'account reference',side:'west'}]}],structure:{entities:[{node:'account',fields:[{id:'id',name:'id',type:'uuid',keys:['pk']}]},{node:'invoice',fields:[{id:'id2',name:'id',type:'uuid',keys:['pk']}]}],references:[{id:'owns',from:{node:'account',portId:'owner'},to:{node:'invoice',portId:'account'},identification:'identifying',label:'owns',fromCardinality:'exactly-one',toCardinality:'zero-or-many'},{id:'belongs',from:{node:'invoice',portId:'account'},to:{node:'account',portId:'owner'},identification:'non-identifying',label:'belongs to',fromCardinality:'exactly-one',toCardinality:'zero-or-many'}]}});
  const graphviz=compilePresentation(source,{backend:'graphviz'});expect(graphviz.ok).toBe(true);if(!graphviz.ok)return;expect(graphviz.source).toContain('Identifying');expect(graphviz.source).toContain('Non-identifying');expect(graphviz.source).toContain('n1:p1:e');expect(graphviz.elementMap).toContainEqual({logicalId:'owner',sourcePath:'/extensions/umf.visual/nodes/0/ports/0',nativeId:'n1.p1',kind:'port'});
  const mermaid=compilePresentation(source,{backend:'mermaid'});expect(mermaid.ok).toBe(true);if(!mermaid.ok)return;expect(mermaid.source).toContain('||--o{');expect(mermaid.source).toContain('||..o{');expect(mermaid.source).toContain('from#32;port#32;owner#32;#40;owner#41;');expect(mermaid.source).toContain('Identifying');expect(mermaid.source).toContain('Non-identifying');
  const lini=compilePresentation(source,{backend:'lini'});expect(lini.ok).toBe(true);if(!lini.ok)return;expect(lini.source).toContain('n1.p1:right ++-o< n2.p1:left');expect(lini.source).toContain('Identifying owns');expect(lini.source).toContain('Non-identifying belongs to');expect(lini.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/structure/references/0/identification'&&item.representation.includes('no intrinsic'))).toBe(true);
 });

 it('applies mixed routing intent per backend scope and leaves authored port sides untouched',()=>{
  const edges=[{id:'curved',from:'a',to:'b',routing:{kind:'curved' as const}},{id:'straight',from:'a',to:'c',routing:{kind:'straight' as const}}];
  for(const routeEdges of [edges,[...edges].reverse()]){
   const source=createVisualDocument({id:'mixed-route-scope',kind:'flow',form:'network',question:'Which routes are declared?',nodes:[{id:'a',label:'A'},{id:'b',label:'B'},{id:'c',label:'C'}],edges:routeEdges},'test:mixed-route-scope','1.4.0');
   const lini=compilePresentation(source,{backend:'lini'});expect(lini.ok).toBe(true);if(!lini.ok)continue;
   expect(lini.source.match(/routing:\s*(?:natural|straight);/g)).toBeNull();
   expect(lini.approximations.filter(item=>item.sourcePath.endsWith('/routing')).map(item=>item.code)).toEqual(routeEdges.map(()=> 'ROUTING_SCOPE_CONFLICT'));
   const graphviz=compilePresentation(source,{backend:'graphviz'});expect(graphviz.ok).toBe(true);if(graphviz.ok){expect(graphviz.source).toContain('splines=true');expect(graphviz.approximations.filter(item=>item.sourcePath.endsWith('/routing')).map(item=>item.code)).toEqual(routeEdges.map(()=> 'ROUTING_SCOPE_CONFLICT'));}
   const mermaid=compilePresentation(source,{backend:'mermaid'});expect(mermaid.ok).toBe(true);if(mermaid.ok){for(const[index,edge]of routeEdges.entries())expect(mermaid.source).toContain(`e${index+1}@{ curve: ${edge.routing.kind==='curved'?'natural':'linear'} }`);expect(mermaid.approximations.some(item=>item.code==='ROUTING_SCOPE_CONFLICT')).toBe(false);}
  }
  const namedPorts=createVisualDocument({id:'route-named-port',kind:'flow',form:'network',question:'Which authored sides are retained?',nodes:[{id:'a',label:'A',ports:[{id:'out',side:'east'}]},{id:'b',label:'B',ports:[{id:'in',side:'west'}]}],edges:[{id:'routed',from:'a',to:'b',fromPort:'out',toPort:'in',routing:{kind:'curved'}}]},'test:route-named-port','1.4.0');
  for(const backend of ['graphviz','lini'] as const){const plan=compilePresentation(namedPorts,{backend});expect(plan.ok).toBe(true);if(!plan.ok)continue;if(backend==='graphviz')expect(plan.source).toContain('n1:p1:e -> n2:p1:w');else expect(plan.source).toContain('n1.p1:right -> n2.p1:left');expect(plan.approximations.find(item=>item.sourcePath==='/extensions/umf.visual/edges/0/routing')?.code).toBe('ROUTING_NATIVE_INTERPOLATION');}
 });

 it('assigns route-aware order only when no order is authored and preserves an authored order',()=>{
  const network={id:'route-order',kind:'flow' as const,form:'network' as const,question:'Which node comes first?',nodes:[{id:'sink',label:'Sink'},{id:'source',label:'Source'}],edges:[{id:'flow',from:'source',to:'sink',routing:{kind:'curved' as const}}]};
  const inferred=compilePresentation(createVisualDocument(network,'test:route-order','1.4.0'),{backend:'lini'});expect(inferred.ok).toBe(true);if(inferred.ok)expect(inferred.source.indexOf('|box#n2|')).toBeLessThan(inferred.source.indexOf('|box#n1|'));
  const authored=compilePresentation(createVisualDocument({...network,layout:{kind:'flow',direction:'LR',order:['sink','source']}},'test:route-order-authored','1.4.0'),{backend:'lini'});expect(authored.ok).toBe(true);if(authored.ok){expect(authored.source.indexOf('|box#n1|')).toBeLessThan(authored.source.indexOf('|box#n2|'));expect(authored.source).toContain('n2:bottom -> n1:right');expect(authored.approximations.find(item=>item.sourcePath==='/extensions/umf.visual/edges/0/routing')?.code).toBeUndefined();}
 });

 it('refuses Mermaid ER when identification semantics are still undeclared',()=>{
  const source=document({id:'ambiguous-identification',kind:'structure',form:'entities',question:'How are entities related?',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],structure:{entities:[{node:'a',fields:[{name:'id',type:'uuid'}]},{node:'b',fields:[{name:'a_id',type:'uuid'}]}],references:[{id:'r',from:{node:'a'},to:{node:'b'},fromCardinality:'exactly-one',toCardinality:'zero-or-many'}]}});
  expect(compilePresentation(source,{backend:'mermaid'})).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_MERMAID_RELATIONSHIP'}]});
 });
});
