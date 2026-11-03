// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {authoredFocusTargets,authoredStepListPolicy} from '../../microsite/authored-context.js';

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

test('both viewers load the shared context panel and the static-site build versions its ESM helper',()=>{
 const build=readFileSync('microsite/build.ts','utf8');
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
});
