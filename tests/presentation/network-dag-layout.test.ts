// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createVisualDocument,type Visual,type VisualVersion} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';

const compile=(visual:Visual,version:VisualVersion='1.4.0')=>compilePresentation(createVisualDocument(visual,'test:network-dag:'+visual.id,version),{backend:'lini',theme:'presentation/1'});
const dagApproximation=(plan:Extract<ReturnType<typeof compilePresentation>,{ok:true}>)=>plan.approximations.find(item=>item.sourcePath==='/extensions/umf.visual/form');
const declarationOrder=(source:string)=>[...source.matchAll(/^\s*\|box#n\d+\| "([^"]*)"/gmu)].map(match=>match[1]);

function topology(id:string,form:'network'|'pipeline',prefix:string):Visual{
 const [a,b,c,build,deploy,alone]=['lint','test','migrations','build','deploy','notes'].map(value=>prefix+value);
 return{id,kind:'flow',form,question:'Which work depends on which prerequisite?',nodes:[{id:a,label:'Lint'},{id:b,label:'Test'},{id:c,label:'Migrations'},{id:build,label:'Build'},{id:deploy,label:'Deploy'},{id:alone,label:'Independent notes'}],edges:[{id:prefix+'lint-build',from:a,to:build,label:'checks'},{id:prefix+'test-build',from:b,to:build,label:'checks'},{id:prefix+'migrations-build',from:c,to:build,label:'checks'},{id:prefix+'build-deploy',from:build,to:deploy,label:'publishes'}]};
}

test('network and pipeline use the same generic DAG admission for renamed equivalent graphs',()=>{
 const network=compile(topology('renamed-network','network','net-')),pipeline=compile(topology('renamed-pipeline','pipeline','pipe-'));
 expect(network.ok).toBe(true);expect(pipeline.ok).toBe(true);if(!network.ok||!pipeline.ok)return;
 expect(dagApproximation(network)?.representation).toContain('dependency-depth ranks');expect(dagApproximation(pipeline)?.representation).toContain('dependency-depth ranks');
 for(const plan of [network,pipeline]){expect(plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(6);expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(4);expect(plan.source.match(/ -> /gu)).toHaveLength(4);}
 expect(declarationOrder(network.source)).toEqual(['Lint','Test','Migrations','Build','Deploy','Independent notes']);
 expect(declarationOrder(pipeline.source)).toEqual(['Lint','Test','Migrations','Build','Deploy','Independent notes']);
 expect(network.approximations.find(item=>item.sourcePath==='/extensions/umf.visual/form')).toBeDefined();expect(pipeline.approximations.find(item=>item.sourcePath==='/extensions/umf.visual/form')).toBeDefined();
});

test('equal-rank ties and isolated nodes retain declaration order, including reversed declarations',()=>{
 const forward=topology('ties-forward','network','f-'),reverse:Visual={...topology('ties-reverse','network','r-'),nodes:[...topology('ties-reverse','network','r-').nodes!].reverse()};
 const first=compile(forward),second=compile(reverse);expect(first.ok).toBe(true);expect(second.ok).toBe(true);if(!first.ok||!second.ok)return;
 expect(dagApproximation(first)).toBeDefined();expect(dagApproximation(second)).toBeDefined();
 expect(declarationOrder(first.source)).toEqual(['Lint','Test','Migrations','Build','Deploy','Independent notes']);
 expect(declarationOrder(second.source)).toEqual(['Independent notes','Deploy','Build','Migrations','Test','Lint']);
 for(const plan of [first,second]){expect(plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(6);expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(4);}
});

test('explicit 1.4 flow direction or grid layout takes precedence over automatic DAG ranking',()=>{
 const flow:Visual={...topology('explicit-flow','network','flow-'),layout:{kind:'flow',direction:'TB',order:['flow-deploy','flow-build','flow-migrations','flow-test','flow-lint','flow-notes']}},grid:Visual={...topology('explicit-grid','network','grid-'),layout:{kind:'grid',columns:2,order:['grid-notes','grid-deploy','grid-build','grid-migrations','grid-test','grid-lint']}};
 for(const visual of [flow,grid]){
  const plan=compile(visual);expect(plan.ok).toBe(true);if(!plan.ok)continue;
  expect(plan.approximations.find(item=>item.sourcePath==='/extensions/umf.visual/form')).toBeUndefined();
  if(visual.layout?.kind==='flow'){
   expect(plan.approximations.some(item=>item.sourcePath.startsWith('/extensions/umf.visual/layout/'))).toBe(true);
   expect(plan.source).toContain('direction: column;');
   expect(declarationOrder(plan.source)).toEqual(['Deploy','Build','Migrations','Test','Lint','Independent notes']);
  }else{
   expect(plan.source).toContain('layout: grid;');expect(plan.source).toContain('columns: repeat(2);');
   expect(plan.approximations.some(item=>item.sourcePath.startsWith('/extensions/umf.visual/layout/'))).toBe(false);
   expect(declarationOrder(plan.source)).toEqual(['Independent notes','Deploy','Build','Migrations','Test','Lint']);
  }
  expect(plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(6);expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(4);
 }
});

test('cycles and undirected links decline automatic ranks while authored edges remain present',()=>{
 const cycle:Visual={id:'cycle-fallback',kind:'flow',form:'network',question:'Which nodes connect?',nodes:[{id:'a',label:'A'},{id:'b',label:'B'},{id:'c',label:'C'}],edges:[{id:'ab',from:'a',to:'b',label:'ab'},{id:'bc',from:'b',to:'c',label:'bc'},{id:'ca',from:'c',to:'a',label:'ca'}]};
 const undirected:Visual={id:'headless-fallback',kind:'flow',form:'network',question:'Which nodes connect?',nodes:[{id:'a',label:'A'},{id:'b',label:'B'},{id:'isolated',label:'Isolated'}],edges:[{id:'association',from:'a',to:'b',directed:false,label:'associated'}]};
 for(const visual of [cycle,undirected]){const plan=compile(visual);expect(plan.ok).toBe(true);if(!plan.ok)continue;expect(dagApproximation(plan)).toBeUndefined();expect(plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(visual.nodes!.length);expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(visual.edges!.length);expect(plan.source.match(/ -> | --- /gu)??[]).toHaveLength(visual.edges!.length);}
});

test('return links remain mapped and rendered but do not invalidate the forward DAG rank plan',()=>{
 const visual:Visual={id:'return-retained',kind:'flow',form:'network',question:'Which way does work proceed?',nodes:[{id:'source',label:'Source'},{id:'target',label:'Target'}],edges:[{id:'forward',from:'source',to:'target',label:'starts'},{id:'return',from:'target',to:'source',kind:'return',label:'reports back'}]};
 const plan=compile(visual);expect(plan.ok).toBe(true);if(!plan.ok)return;
 expect(dagApproximation(plan)?.representation).toContain('Return links remain drawn but do not set rank');expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(2);expect(plan.source.match(/ -> /gu)).toHaveLength(2);expect(plan.source).toContain('reports back');
});
