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

 it('renders an ordered stack as containment with no authored arrows',()=>{
  const d=document({id:'stack',kind:'structure',form:'stack',question:'How are layers ordered?',nodes:[{id:'api',label:'Public API',layer:'interface'},{id:'engine',label:'Compiler engine',layer:'compiler'},{id:'schema',label:'Schema package',layer:'vocabulary'}],structure:{layers:[{id:'interface',label:'Public interface'},{id:'compiler',label:'Compiler'},{id:'vocabulary',label:'Vocabulary packages'}]}});
  const plan=compilePresentation(d,{backend:'graphviz'});expect(plan.ok).toBe(true);if(!plan.ok)return;
  expect(plan.source).toContain('rankdir="TB"');expect(plan.source).toContain('cluster_l1');expect(plan.source).toContain('Public interface');expect(plan.source).toContain('style=invis, weight=100');expect(plan.source).not.toContain('n1 -> n2 [');
  expect(plan.approximations.some(a=>a.requested==='Layer order')).toBe(true);
 });

 it('renders E/R field identities and exact multiplicity on Graphviz field ports',()=>{
  const d=document({id:'er',kind:'structure',form:'entities',question:'Which concepts are linked?',nodes:[{id:'document',label:'Document record'},{id:'module',label:'Module'}],structure:{entities:[{node:'document',fields:[{id:'doc-id',name:'id',type:'DocumentId',keys:['pk'],nullable:false},{id:'name',name:'name',type:'String',nullable:false}]},{node:'module',fields:[{id:'module-id',name:'id',type:'ModuleId',keys:['pk']},{id:'owner-id',name:'ownerId',type:'DocumentId',keys:['fk']}]}],references:[{id:'owns',from:{node:'module',fieldId:'owner-id'},to:{node:'document',fieldId:'doc-id'},label:'owned by',fromMultiplicity:{min:1,max:1},toMultiplicity:{min:0,max:8,text:'0..8'}},{id:'self',from:{node:'document',field:'id'},to:{node:'document',field:'id'},label:'related'}]}});
  const plan=compilePresentation(d,{backend:'graphviz'});expect(plan.ok).toBe(true);if(!plan.ok)return;
  expect(plan.source).toContain('PORT="n1_f1"');expect(plan.source).toContain('n2:n2_f2 -> n1:n1_f1');expect(plan.source).toContain('label="owned by\\n(1..1 → 0..8)"');expect(plan.source).toContain('NOT NULL');expect(plan.source).toContain('DocumentId');
  expect(plan.elementMap.some(x=>x.kind==='field'&&x.logicalId==='owner-id'&&x.nativeId==='n2_f2')).toBe(true);
 });

 it('refuses Mermaid ER relationships when identifying semantics are undeclared',()=>{
  const d=document({id:'er-mermaid',kind:'structure',form:'entities',question:'How are entities related?',nodes:[{id:'person',label:'Person'},{id:'team',label:'Team'}],structure:{entities:[{node:'person',fields:[{name:'id',type:'Id',keys:['pk']},{name:'teamId',type:'Id',keys:['fk']}]},{node:'team',fields:[{name:'id',type:'Id',keys:['pk']}]}],references:[{id:'membership',from:{node:'person',field:'teamId'},to:{node:'team',field:'id'},label:'member of',fromCardinality:'zero-or-many',toCardinality:'exactly-one'}]}});
  expect(compilePresentation(d,{backend:'mermaid'})).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_MERMAID_RELATIONSHIP'}]});
 });

 it('refuses unsupported forms and unrepresentable Mermaid field identifiers',()=>{
  const unsupported=document({id:'machine',kind:'state',form:'machine',question:'How does it work?',nodes:[{id:'ready',label:'Ready'}],state:{initial:'ready',transitions:[{id:'t',from:'ready',to:'ready',event:'again'}]}});
  expect(compilePresentation(unsupported,{backend:'graphviz'})).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_FORM'}]});
  const er=document({id:'er-odd-field',kind:'structure',form:'entities',question:'Question?',nodes:[{id:'user',label:'User'}],structure:{entities:[{node:'user',fields:[{name:'display name',type:'String'}]}]}});
  expect(compilePresentation(er,{backend:'mermaid'})).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_MERMAID_FIELD'}]});
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

 it('refuses Mermaid ER relationships with unspecified endpoint cardinality',()=>{
  const d=document({id:'mermaid-unknown-cardinality',kind:'structure',form:'entities',question:'Unknown cardinality',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],structure:{entities:[{node:'a',fields:[]},{node:'b',fields:[]}],references:[{id:'r',from:{node:'a'},to:{node:'b'},fromCardinality:'exactly-one'}]}});
  expect(compilePresentation(d,{backend:'mermaid'})).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_MERMAID_RELATIONSHIP'}]});
 });

 it('rejects unsafe option access and accounts for standalone E/R nodes',()=>{
  const d=document({id:'extra-er-node',kind:'structure',form:'entities',question:'All source nodes remain visible',nodes:[{id:'a',label:'A'},{id:'b',label:'B'},{id:'loose',label:'Standalone concept'}],structure:{entities:[{node:'a',fields:[]},{node:'b',fields:[]}]}});
  for(const backend of ['graphviz','mermaid'] as const){const plan=compilePresentation(d,{backend});expect(plan.ok).toBe(true);if(!plan.ok)continue;expect(plan.source).toContain(backend==='mermaid'?'Standalone#32;concept':'Standalone concept');expect(plan.elementMap).toContainEqual({logicalId:'loose',sourcePath:'/extensions/umf.visual/nodes/2',nativeId:'n3',kind:'node'});}
  let getterRan=false;const options=Object.create(null);Object.defineProperty(options,'backend',{get(){getterRan=true;throw Error('must not run');}});
  expect(compilePresentation(d,options as PresentationOptions)).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_OPTIONS'}]});expect(getterRan).toBe(false);
  expect(compilePresentation(d,{backend:'graphviz',debug:true} as any)).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_OPTIONS'}]});
 });
});
