// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {authoredComparisonView,authoredFocusTargets,authoredMetricView,authoredStepListPolicy} from '../../microsite/authored-context.js';

test('authored focus resolver follows the Visual global ID declaration universe and exact source paths',()=>{
 const targets=authoredFocusTargets({
  annotations:[{id:'annotation',text:'Unanchored note'}],groups:[{id:'group',label:'A region'}],nodes:[{id:'node',label:'A node',ports:[{id:'local-port',label:'Port'}]}],edges:[{id:'edge',from:'node',to:'node',label:'connects'}],steps:[{id:'step',title:'Review'}],
  sequence:{participants:[{id:'participant',label:'A participant'}],messages:[{id:'message',from:'participant',to:'participant',label:'calls',kind:'call'}],notes:[{id:'sequence-note',text:'A note',participants:['participant'],before:'message'}]},
  structure:{layers:[{id:'layer',label:'Layer'}],references:[{id:'reference',from:{node:'node'},to:{node:'node'},label:'relates'}]},
  state:{initial:'node',final:['node'],transitions:[{id:'transition',from:'node',to:'node',event:'arrives',guard:'ready',action:'continue'}]},
  timeline:{scale:{kind:'period',periods:[{id:'period',label:'Period'}]},lanes:[{id:'lane',label:'Lane'}],events:[{id:'event',label:'Event',at:'period',lane:'lane'}],spans:[{id:'span',label:'Span',start:'period',end:'period'}],markers:[{id:'marker',label:'Marker',at:'period',kind:'marker'}]},
  comparison:{items:[{id:'item',label:'Option'}],criteria:[{id:'criterion',label:'Criterion'}]},
  metric:{unit:'count',axis:{kind:'category',categories:[{id:'category',label:'Category'}]},series:[{id:'series',label:'Series',points:[]}]},
 });
 const expected:[string,string,string][]=[
  ['annotation','annotation','/extensions/umf.visual/annotations/0/id'],['group','group','/extensions/umf.visual/groups/0/id'],['node','node','/extensions/umf.visual/nodes/0/id'],['edge','edge','/extensions/umf.visual/edges/0/id'],['step','step','/extensions/umf.visual/steps/0/id'],
  ['participant','participant','/extensions/umf.visual/sequence/participants/0/id'],['message','message','/extensions/umf.visual/sequence/messages/0/id'],['sequence-note','sequence note','/extensions/umf.visual/sequence/notes/0/id'],
  ['layer','layer','/extensions/umf.visual/structure/layers/0/id'],['reference','reference','/extensions/umf.visual/structure/references/0/id'],['transition','transition','/extensions/umf.visual/state/transitions/0/id'],
  ['period','period','/extensions/umf.visual/timeline/scale/periods/0/id'],['lane','lane','/extensions/umf.visual/timeline/lanes/0/id'],['event','event','/extensions/umf.visual/timeline/events/0/id'],['span','span','/extensions/umf.visual/timeline/spans/0/id'],['marker','marker','/extensions/umf.visual/timeline/markers/0/id'],
  ['item','comparison item','/extensions/umf.visual/comparison/items/0/id'],['criterion','comparison criterion','/extensions/umf.visual/comparison/criteria/0/id'],['category','metric category','/extensions/umf.visual/metric/axis/categories/0/id'],['series','metric series','/extensions/umf.visual/metric/series/0/id'],
 ];
 for(const[id,kind,sourcePath]of expected)expect(targets.get(id)).toContainEqual(expect.objectContaining({kind,sourcePath}));
 expect(targets.get('transition')?.[0]?.label).toBe('event arrives; guard ready; action continue');
 expect(targets.has('local-port')).toBe(false);
 expect(targets.has('missing-focus-id')).toBe(false);
});

test('ambiguous focus IDs stay as multiple explicit candidates rather than choosing a target',()=>{
 const targets=authoredFocusTargets({nodes:[{id:'shared',label:'Node'}],edges:[{id:'shared',from:'a',to:'b',label:'Edge'}]});
 expect(targets.get('shared')).toEqual([
  {kind:'node',label:'Node',sourcePath:'/extensions/umf.visual/nodes/0/id'},
  {kind:'edge',label:'from a; to b; label Edge',sourcePath:'/extensions/umf.visual/edges/0/id'},
 ]);
 expect(targets.get('unresolved')).toBeUndefined();
});

test('steps with authored when values are unnumbered while absent when uses source-order numbering',()=>{
 const policy=authoredStepListPolicy([
  {id:'background',when:'background'},
  {id:'first-numbered'},
  {id:'optional',when:'optional'},
  {id:'second-numbered'},
  {id:'tagged-other',when:'other',tag:'as needed'},
 ]);
 expect(policy).toEqual([
  {numbered:false,number:undefined,listValue:1},
  {numbered:true,number:1,listValue:1},
  {numbered:false,number:undefined,listValue:2},
  {numbered:true,number:2,listValue:2},
  {numbered:false,number:undefined,listValue:3},
 ]);
});

test('comparison context preserves axes, typed values, chosen reason, omissions, and exact pointers without scoring',()=>{
 const view=authoredComparisonView({
  omissions:['These are author readings, not measurements.'],
  comparison:{
   items:[{id:'a',label:'Option A'},{id:'b',label:'Option B'}],
   criteria:[{id:'fit',label:'Runtime fit',measure:'rating',max:3,low:'Not suited',high:'Runs locally'},{id:'support',label:'Feature support',measure:'support'}],
   values:[{item:'a',criterion:'fit',rating:3,note:'Preferred by the author'},{item:'b',criterion:'support',support:'partial'}],
   axes:{x:'fit',y:'support'},chosen:{item:'a',reason:'The source author selected this option.'},
  },
 });
 expect(view).toEqual({
  axes:[{key:'x',value:'fit',sourcePath:'/extensions/umf.visual/comparison/axes/x'},{key:'y',value:'support',sourcePath:'/extensions/umf.visual/comparison/axes/y'}],
  items:[
   {id:'a',label:'Option A',sourcePath:'/extensions/umf.visual/comparison/items/0',fields:[]},
   {id:'b',label:'Option B',sourcePath:'/extensions/umf.visual/comparison/items/1',fields:[]},
  ],
  criteria:[
   {id:'fit',label:'Runtime fit',sourcePath:'/extensions/umf.visual/comparison/criteria/0',fields:[
    {key:'measure',value:'rating',sourcePath:'/extensions/umf.visual/comparison/criteria/0/measure'},
    {key:'max',value:3,sourcePath:'/extensions/umf.visual/comparison/criteria/0/max'},
    {key:'low',value:'Not suited',sourcePath:'/extensions/umf.visual/comparison/criteria/0/low'},
    {key:'high',value:'Runs locally',sourcePath:'/extensions/umf.visual/comparison/criteria/0/high'},
   ]},
   {id:'support',label:'Feature support',sourcePath:'/extensions/umf.visual/comparison/criteria/1',fields:[{key:'measure',value:'support',sourcePath:'/extensions/umf.visual/comparison/criteria/1/measure'}]},
  ],
  values:[
   {item:'a',criterion:'fit',sourcePath:'/extensions/umf.visual/comparison/values/0',fields:[
    {key:'rating',value:3,sourcePath:'/extensions/umf.visual/comparison/values/0/rating'},
    {key:'note',value:'Preferred by the author',sourcePath:'/extensions/umf.visual/comparison/values/0/note'},
   ]},
   {item:'b',criterion:'support',sourcePath:'/extensions/umf.visual/comparison/values/1',fields:[{key:'support',value:'partial',sourcePath:'/extensions/umf.visual/comparison/values/1/support'}]},
  ],
  chosen:{item:'a',itemSourcePath:'/extensions/umf.visual/comparison/chosen/item',reason:'The source author selected this option.',reasonSourcePath:'/extensions/umf.visual/comparison/chosen/reason'},
  omissions:[{text:'These are author readings, not measurements.',sourcePath:'/extensions/umf.visual/omissions/0'}],
 });
 expect(authoredComparisonView({comparison:{items:[],criteria:[],values:[]}})?.chosen).toBeNull();
 expect(authoredComparisonView({comparison:{items:[],criteria:[],values:[]}})?.axes).toEqual([]);
 expect(authoredComparisonView({title:'No comparison'})).toBeNull();
});

test('metric context preserves authored fields and exact series/point pointers without deriving progress',()=>{
 const view=authoredMetricView({metric:{unit:'criteria',good:'up',format:{kind:'number',decimals:0},target:837,series:[{id:'satisfied-now',label:'Satisfied',points:[{value:180},{at:'2026-01-01'}]}]}});
 expect(view).toEqual({
  fields:[
   {key:'unit',value:'criteria',sourcePath:'/extensions/umf.visual/metric/unit'},
   {key:'good',value:'up',sourcePath:'/extensions/umf.visual/metric/good'},
   {key:'format',value:{kind:'number',decimals:0},sourcePath:'/extensions/umf.visual/metric/format'},
   {key:'target',value:837,sourcePath:'/extensions/umf.visual/metric/target'},
  ],
  series:[{id:'satisfied-now',idSourcePath:'/extensions/umf.visual/metric/series/0/id',label:'Satisfied',labelSourcePath:'/extensions/umf.visual/metric/series/0/label',sourcePath:'/extensions/umf.visual/metric/series/0',fields:[],points:[
   {sourcePath:'/extensions/umf.visual/metric/series/0/points/0',fields:[{key:'value',value:180,sourcePath:'/extensions/umf.visual/metric/series/0/points/0/value'}]},
   {sourcePath:'/extensions/umf.visual/metric/series/0/points/1',fields:[{key:'at',value:'2026-01-01',sourcePath:'/extensions/umf.visual/metric/series/0/points/1/at'}]},
  ]}],
 });
 expect(authoredMetricView({title:'No metric'})).toBeNull();
});

test('both viewers load the shared context panel and the static-site build versions its ESM helper',()=>{
 const build=readFileSync('microsite/build.ts','utf8');
 const app=readFileSync('microsite/showcase.js','utf8');
 const helper=readFileSync('microsite/authored-context.js','utf8');
 for(const page of ['microsite/index.html','microsite/reviews.html']){
  const html=readFileSync(page,'utf8');
  expect(html).toContain('<script type="module" src="./showcase.js"></script>');
  expect(html).toContain('id="authored-context"');
  expect(html).toContain('id="authored-context-content"');
 }
 expect(build).toContain("readFile(new URL('./authored-context.js',import.meta.url))");
 expect(build).toContain("replaceAll(\"'./authored-context.js'\"");
 expect(build).toContain("digest(authoredContext)");
 expect(build).toContain("writeFile(resolve(destination,'authored-context.js'),authoredContext)");
 expect(build).toContain(".replace('./showcase.js','./showcase.js?v='+digest(versionedShowcaseApp))");
 expect(app).toContain('authoredMetricView(visual)');expect(app).toContain('Authored metric fields');expect(app).toContain('does not calculate progress, percentages, or recommendations');
 expect(helper).toContain('`${sourcePath}/points/${pointIndex}`');
});
