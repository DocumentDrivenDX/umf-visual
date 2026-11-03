// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,it} from 'bun:test';
import {createVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation,type PresentationOptions} from '../../src/presentation';

const document=(v:Visual)=>createVisualDocument(v,'test:'+v.id,'1.1.0');

describe('presentation compiler',()=>{
 it('projects architecture flow with groups, labels, endpoints and identity maps without mutating input',()=>{
  const d=document({id:'architecture',kind:'flow',form:'network',question:'How does the system fit?',title:'UMF system context',takeaway:'Execution belongs to Axon.',groups:[{id:'native',label:'Native tools',role:'zone'},{id:'host',label:'Host adapters',role:'zone',parent:'native'}],nodes:[{id:'core',label:'UMF core',detail:'Portable TypeScript library',role:'own',status:'built'},{id:'axon',label:'Axon',detail:'Executes queries and mutations',role:'external',group:'host'}],edges:[{id:'uses',from:'core',to:'axon',label:'consumer integration',why:'Application execution stays outside the portable core.'}]});
  const before=JSON.stringify(d),plan=compilePresentation(d,{backend:'graphviz',theme:'presentation/1'});
  expect(plan.ok).toBe(true);if(!plan.ok)return;
  expect(plan.source).toContain('digraph UMFPresentation');expect(plan.source).toContain('Portable TypeScript library');expect(plan.source).toContain('cluster_g1');expect(plan.source).toContain('cluster_g2');expect(plan.source).toContain('n1 -> n2');expect(plan.source).toContain('tooltip="Application execution stays outside the portable core."');
  expect(plan.elementMap.map(x=>x.logicalId)).toEqual(['architecture','core','axon','native','host','uses']);
  expect(JSON.stringify(d)).toBe(before);
 });

 it('keeps free-text annotations as separately mapped native text carriers',()=>{
  const d=createVisualDocument({id:'annotated',kind:'flow',form:'network',question:'Where do notes belong?',title:'Annotated network',layout:{kind:'flow',direction:'LR',order:['region-a','region-b']},groups:[{id:'region-a',label:'A',role:'region',layout:{kind:'flow',direction:'LR',order:['api','worker']}},{id:'region-b',label:'B',role:'region',layout:{kind:'flow',direction:'LR',order:['queue','database']}}],nodes:[{id:'api',label:'API',group:'region-a'},{id:'worker',label:'Worker',group:'region-a'},{id:'queue',label:'Queue',group:'region-b'},{id:'database',label:'Database',group:'region-b'}],edges:[{id:'e1',from:'api',to:'worker'},{id:'e2',from:'worker',to:'queue'},{id:'e3',from:'queue',to:'database'}],annotations:[{id:'heading',text:'Inbound path'},{id:'note',text:'Retry behavior is outside this sketch.'}]},'test:annotated','1.4.0');
  for(const backend of ['graphviz','mermaid','lini'] as const){
   const plan=compilePresentation(d,{backend,theme:'presentation/1'});expect(plan.ok).toBe(true);if(!plan.ok)continue;
   expect(plan.elementMap.filter(item=>item.kind==='annotation')).toEqual([
    {logicalId:'heading',sourcePath:'/extensions/umf.visual/annotations/0/id',nativeId:'a1',kind:'annotation'},
    {logicalId:'note',sourcePath:'/extensions/umf.visual/annotations/1/id',nativeId:'a2',kind:'annotation'}
   ]);
   expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(3);
   expect(plan.source).toContain(backend==='mermaid'?'Inbound#32;path':'Inbound path');expect(plan.source).toContain(backend==='mermaid'?'Retry#32;behavior#32;is#32;outside#32;this#32;sketch.':'Retry behavior is outside this sketch.');
   expect(plan.approximations.filter(item=>item.sourcePath.startsWith('/extensions/umf.visual/annotations/'))).toHaveLength(2);
  }
 });

 it('refuses annotated non-network forms with a located diagnostic',()=>{
  const d=createVisualDocument({id:'annotated-stack',kind:'structure',form:'stack',question:'Where do notes belong?',nodes:[{id:'n',label:'Node',layer:'l'}],structure:{layers:[{id:'l',label:'Layer'}]},annotations:[{id:'note',text:'Free text'}]},'test:annotated-stack','1.4.0');
  for(const backend of ['graphviz','mermaid','lini'] as const)expect(compilePresentation(d,{backend})).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_ANNOTATION_SCOPE',path:'/extensions/umf.visual/annotations'}]});
 });

 it('refuses circular layout plus unanchored annotations before backend dispatch',()=>{
  const d=createVisualDocument({id:'circular-annotations',kind:'flow',form:'network',question:'How are these arranged?',layout:{kind:'circular',order:['a','b']},nodes:[{id:'a',label:'A',shape:'rectangle'},{id:'b',label:'B',shape:'rectangle'}],edges:[{id:'link',from:'a',to:'b',routing:{kind:'straight'}}],annotations:[{id:'note',text:'Detached text'}]},'test:circular-annotations','1.4.0');
  for(const backend of ['graphviz','mermaid','lini'] as const)expect(compilePresentation(d,{backend})).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_ANNOTATION_CIRCULAR',path:'/extensions/umf.visual/annotations'}]});
 });

 it('renders an ordered stack as containment with no authored arrows',()=>{
  const d=document({id:'stack',kind:'structure',form:'stack',question:'How are layers ordered?',nodes:[{id:'api',label:'Public API',layer:'interface'},{id:'engine',label:'Compiler engine',layer:'compiler'},{id:'schema',label:'Schema package',layer:'vocabulary'}],structure:{layers:[{id:'interface',label:'Public interface'},{id:'compiler',label:'Compiler'},{id:'vocabulary',label:'Vocabulary packages'}]}});
  const plan=compilePresentation(d,{backend:'graphviz'});expect(plan.ok).toBe(true);if(!plan.ok)return;
  expect(plan.source).toContain('rankdir="TB"');expect(plan.source).toContain('cluster_l1');expect(plan.source).toContain('Public interface');expect(plan.source).toContain('style=invis, weight=100');expect(plan.source).not.toContain('n1 -> n2 [');
  expect(plan.approximations.some(a=>a.requested==='Layer order')).toBe(true);
  const mermaid=compilePresentation(d,{backend:'mermaid'});expect(mermaid.ok).toBe(true);if(mermaid.ok){expect(mermaid.source).toContain('flowchart LR');expect(mermaid.source).toContain('l1_order(( ))');expect(mermaid.source).toContain('l1_order ~~~ l2_order');}
 });

 it('renders E/R field identities and exact multiplicity on Graphviz field ports',()=>{
  const d=document({id:'er',kind:'structure',form:'entities',question:'Which concepts are linked?',nodes:[{id:'document',label:'Document record'},{id:'module',label:'Module'}],structure:{entities:[{node:'document',fields:[{id:'doc-id',name:'id',type:'DocumentId',keys:['pk'],nullable:false},{id:'name',name:'name',type:'String',nullable:false}]},{node:'module',fields:[{id:'module-id',name:'id',type:'ModuleId',keys:['pk']},{id:'owner-id',name:'ownerId',type:'DocumentId',keys:['fk']}]}],references:[{id:'owns',from:{node:'module',fieldId:'owner-id'},to:{node:'document',fieldId:'doc-id'},label:'owned by',fromMultiplicity:{min:1,max:1},toMultiplicity:{min:0,max:8,text:'0..8'}},{id:'self',from:{node:'document',field:'id'},to:{node:'document',field:'id'},label:'related'}]}});
  const plan=compilePresentation(d,{backend:'graphviz'});expect(plan.ok).toBe(true);if(!plan.ok)return;
  expect(plan.source).toContain('PORT="n1_f1"');expect(plan.source).toContain('n2:n2_f2 -> n1:n1_f1');expect(plan.source).toContain('label="owned by\\n(1..1 → 0..8)"');expect(plan.source).toContain('NOT NULL');expect(plan.source).toContain('DocumentId');
  expect(plan.elementMap.some(x=>x.kind==='field'&&x.logicalId==='owner-id'&&x.nativeId==='n2_f2')).toBe(true);
 });

 it('uses neutral Mermaid cards and unarrowed links when relationship semantics are undeclared',()=>{
  const d=document({id:'er-mermaid',kind:'structure',form:'entities',question:'How are entities related?',nodes:[{id:'person',label:'Person'},{id:'team',label:'Team'}],structure:{entities:[{node:'person',fields:[{name:'id',type:'Id',keys:['pk']},{name:'teamId',type:'Id',keys:['fk']}]},{node:'team',fields:[{name:'id',type:'Id',keys:['pk']}]}],references:[{id:'membership',from:{node:'person',field:'teamId'},to:{node:'team',field:'id'},label:'member of',fromCardinality:'zero-or-many',toCardinality:'exactly-one'}]}});
  const plan=compilePresentation(d,{backend:'mermaid'});expect(plan.ok).toBe(true);if(!plan.ok)return;
  expect(plan.source).toContain('flowchart LR');expect(plan.source).toContain('n1["Person<br/>PK#32;·#32;id:#32;Id<br/>FK#32;·#32;teamId:#32;Id"]');
  expect(plan.source).toContain('n1 r1@---|member#32;of#32;·#32;from#32;field:#32;teamId#32;·#32;to#32;field:#32;id#32;·#32;0..*#32;→#32;1| n2');
  expect(plan.source).not.toContain('Identifying');expect(plan.source).not.toContain('Non-identifying');
  expect(plan.elementMap).toContainEqual({logicalId:'membership',sourcePath:'/extensions/umf.visual/structure/references/0',nativeId:'r1',kind:'reference'});
  expect(plan.elementMap.filter(item=>item.kind==='field').every(item=>item.nativeId==='n1'||item.nativeId==='n2')).toBe(true);
 });

 it('admits state/machine and preserves un-tokenizable Mermaid field identifiers in cards',()=>{
  const unsupported=document({id:'machine',kind:'state',form:'machine',question:'How does it work?',nodes:[{id:'ready',label:'Ready'}],state:{initial:'ready',transitions:[{id:'t',from:'ready',to:'ready',event:'again'}]}});
  expect(compilePresentation(unsupported,{backend:'graphviz'})).toMatchObject({ok:true});
  const er=document({id:'er-odd-field',kind:'structure',form:'entities',question:'Question?',nodes:[{id:'user',label:'User'}],structure:{entities:[{node:'user',fields:[{name:'display name',type:'String'}]}]}});
  const plan=compilePresentation(er,{backend:'mermaid'});expect(plan.ok).toBe(true);if(plan.ok){expect(plan.source).toContain('display#32;name:#32;String');expect(plan.elementMap.find(item=>item.kind==='field')?.nativeId).toBe('n1');}
 });

 it('fails closed for malformed, cyclic, and incomplete documents',()=>{
  expect(compilePresentation(null as unknown as Parameters<typeof compilePresentation>[0],{backend:'graphviz'})).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_DOCUMENT'}]});
  expect(compilePresentation({} as Parameters<typeof compilePresentation>[0],{backend:'graphviz'})).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_DOCUMENT'}]});
  const cyclic=document({id:'cyclic',kind:'flow',form:'network',question:'Cycle',nodes:[{id:'n',label:'Node'}]});
  (cyclic.extensions!['umf.visual'] as any).unexpected=(cyclic.extensions!['umf.visual'] as any);
  expect(compilePresentation(cyclic,{backend:'graphviz'})).toMatchObject({ok:false});
  const incomplete=document({id:'incomplete',kind:'flow',form:'network',question:'Incomplete',nodes:[{id:'n',label:'Node'}]});
  (incomplete.extensions!['umf.visual'] as any).notInVocabulary={payload:true};
  expect(compilePresentation(incomplete,{backend:'graphviz'})).toMatchObject({ok:false});
 });

 it('uses renderer-only order constraints and readable wrapping for stack cards',()=>{
  const d=document({id:'ordered',kind:'structure',form:'stack',question:'How is this arranged?',nodes:[{id:'na',label:'A label that should wrap after a reasonable number of characters',layer:'la'},{id:'nb',label:'Second layer label',layer:'lb'}],structure:{layers:[{id:'la',label:'First layer'},{id:'lb',label:'Second layer'}]}});
  const plan=compilePresentation(d,{backend:'mermaid'});expect(plan.ok).toBe(true);if(!plan.ok)return;
  expect(plan.source).toContain('l1_order ~~~ l2_order');
  expect(plan.source).toContain('First#32;layer');
 });

 it('keeps Unicode and line breaks while refusing native-invalid controls and lone surrogates',()=>{
  const good=document({id:'unicode',kind:'flow',form:'network',question:'Unicode?',nodes:[{id:'node',label:'First line\nSecond line 🧭'}]});
  for(const backend of ['graphviz','mermaid'] as const){const plan=compilePresentation(good,{backend});expect(plan.ok).toBe(true);if(plan.ok)expect(plan.source).toContain('🧭');}
  for(const label of ['bad\rline','bad\u0000text','bad\uD800text']){
   const bad=document({id:'bad-text',kind:'flow',form:'network',question:'Bad text?',nodes:[{id:'node',label}]});
   expect(compilePresentation(bad,{backend:'graphviz'})).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_TEXT'}]});
  }
 });

 it('uses Mermaid entity codes and preserves exact field types with nullability comments',()=>{
  const d=document({id:'mermaid-meaning',kind:'structure',form:'entities',question:'Quote-safe ER',nodes:[{id:'left',label:'Entity "A" & <root> > #'}],structure:{entities:[{node:'left',fields:[{name:'id',type:'string',nullable:true},{name:'required',type:'rawType',nullable:false}]}]}});
  const plan=compilePresentation(d,{backend:'mermaid'});expect(plan.ok).toBe(true);if(!plan.ok)return;
  expect(plan.source).toContain('#34;A#34;#32;#38;#32;#60;root#62;#32;#62;#32;#35;');
  expect(plan.source).toContain('string id "NULL"');expect(plan.source).toContain('rawType required "NOT NULL"');expect(plan.source).not.toContain('string? id');
 });

 it('does not invent missing Mermaid relationship cardinalities',()=>{
  const d=document({id:'mermaid-unknown-cardinality',kind:'structure',form:'entities',question:'Unknown cardinality',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],structure:{entities:[{node:'a',fields:[]},{node:'b',fields:[]}],references:[{id:'r',from:{node:'a'},to:{node:'b'},fromCardinality:'exactly-one'}]}});
  const plan=compilePresentation(d,{backend:'mermaid'});expect(plan.ok).toBe(true);if(!plan.ok)return;
  expect(plan.source).toContain('n1 r1@---|1#32;→#32;unspecified| n2');expect(plan.source).not.toContain('0..*');
 });

 it('keeps neutral entity fallback disclosures consistent with the card it emits',()=>{
  const d=createVisualDocument({id:'mermaid-neutral-doc-shape',kind:'structure',form:'entities',question:'What is retained?',nodes:[{id:'record',label:'Record',shape:'folded-corner'}],structure:{entities:[{node:'record',fields:[{name:'display name',type:'raw type'}] }]} },'test:mermaid-neutral-doc-shape','1.4.0');
  const plan=compilePresentation(d,{backend:'mermaid'});expect(plan.ok).toBe(true);if(!plan.ok)return;
  expect(plan.source).toContain('Shape:#32;folded-corner');
  expect(plan.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/nodes/0/shape'&&item.representation.includes('card outline is renderer policy'))).toBe(true);
  expect(plan.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/nodes/0/shape'&&item.representation.includes('wavy footer'))).toBe(false);
 });

 it('derives bounded native Mermaid card wrapping from authored rows',()=>{
  const compile=(name:string)=>{
   const d=createVisualDocument({id:'mermaid-neutral-width',kind:'structure',form:'entities',question:'Which row width is used?',nodes:[{id:'record',label:'Record'}],structure:{entities:[{node:'record',fields:[{name,type:'raw type'}]}]}},'test:mermaid-neutral-width','1.4.0');
   const plan=compilePresentation(d,{backend:'mermaid'});expect(plan.ok).toBe(true);if(!plan.ok)return 0;
   return Number(plan.source.match(/wrappingWidth: (\d+)/)?.[1]??0);
  };
  const short=compile('short'),long=compile('long-authored-field-name-which-needs-more-horizontal-room'),veryLong=compile('a-'.repeat(80));
  expect(short).toBeGreaterThanOrEqual(200);expect(short).toBeLessThan(long);expect(long).toBeLessThanOrEqual(420);expect(veryLong).toBe(420);
 });

 it('budgets Mermaid card wrapping across the combined card and relation layout',()=>{
  const nodes=Array.from({length:5},(_,index)=>({id:'record-'+(index+1),label:'Record '+(index+1)}));
  const d=createVisualDocument({id:'mermaid-neutral-layout-budget',kind:'structure',form:'entities',question:'Which records link?',nodes,structure:{entities:nodes.map(node=>({node:node.id,fields:[{name:'id',type:'uuid'}]})),references:nodes.slice(0,-1).map((node,index)=>({id:'link-'+(index+1),from:{node:node.id},to:{node:nodes[index+1]!.id},label:'links '+(index+1),fromCardinality:'exactly-one' as const,toCardinality:'zero-or-many' as const}))}},'test:mermaid-neutral-layout-budget','1.4.0');
  const plan=compilePresentation(d,{backend:'mermaid'});expect(plan.ok).toBe(true);if(!plan.ok)return;
  const width=Number(plan.source.match(/wrappingWidth: (\d+)/)?.[1]??0);
  expect(width).toBeGreaterThanOrEqual(200);expect(width).toBeLessThanOrEqual(220);
 });

 it('rejects unsafe option access and accounts for standalone E/R nodes',()=>{
  const d=document({id:'extra-er-node',kind:'structure',form:'entities',question:'All source nodes remain visible',nodes:[{id:'a',label:'A'},{id:'b',label:'B'},{id:'loose',label:'Standalone concept'}],structure:{entities:[{node:'a',fields:[]},{node:'b',fields:[]}]}});
  for(const backend of ['graphviz','mermaid'] as const){const plan=compilePresentation(d,{backend});expect(plan.ok).toBe(true);if(!plan.ok)continue;expect(plan.source).toContain(backend==='mermaid'?'Standalone#32;concept':'Standalone concept');expect(plan.elementMap).toContainEqual({logicalId:'loose',sourcePath:'/extensions/umf.visual/nodes/2',nativeId:'n3',kind:'node'});}
  let getterRan=false;const options=Object.create(null);Object.defineProperty(options,'backend',{get(){getterRan=true;throw Error('must not run');}});
  expect(compilePresentation(d,options as PresentationOptions)).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_OPTIONS'}]});expect(getterRan).toBe(false);
  expect(compilePresentation(d,{backend:'graphviz',debug:true} as any)).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_OPTIONS'}]});
 });
});
