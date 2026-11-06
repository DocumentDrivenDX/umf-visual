// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';
import {estimateGraphvizDagOrientation,hasFlatPipelineNodes} from '../../src/presentation/dag-orientation';

const compile=(visual:Visual,direction?:'LR'|'TB')=>compilePresentation(createVisualDocument(visual,'test:dag-orientation:'+visual.id,'1.4.0'),{backend:'graphviz',...(direction?{direction}:{})});
const rankdir=(plan:Extract<ReturnType<typeof compilePresentation>,{ok:true}>)=>/rankdir="(LR|TB)"/u.exec(plan.source)?.[1];
const directionApproximation=(plan:Extract<ReturnType<typeof compilePresentation>,{ok:true}>)=>plan.approximations.find(item=>item.sourcePath==='/extensions/umf.visual/form'&&item.requested.startsWith('Default Graphviz direction '));

function chain(prefix:string,labels:string[]):Visual{
 const ids=labels.map((_,index)=>prefix+'node-'+index);
 return {id:prefix+'chain',kind:'flow',form:'pipeline',question:'What proceeds through this sequence?',nodes:labels.map((label,index)=>({id:ids[index]!,label})),edges:ids.slice(1).map((id,index)=>({id:prefix+'edge-'+index,from:ids[index]!,to:id,label:'continues to the next stage'}))};
}

test('implicit Graphviz pipeline orientation follows estimated fit for short and long chains',()=>{
 const short=compile(chain('short-', ['Lint','Build','Deploy'])),long=compile(chain('long-', ['Collect customer request and normalize incoming data','Validate required fields and reject malformed payloads','Enrich the request with account context and policy metadata','Select an eligible worker and allocate a processing slot','Generate the response using the configured service provider','Persist the result and publish a completion event','Notify the requesting system that processing has finished']));
 expect(short.ok).toBe(true);expect(long.ok).toBe(true);if(!short.ok||!long.ok)return;
 expect(rankdir(short)).toBe('LR');expect(rankdir(long)).toBe('TB');expect(directionApproximation(short)?.representation).toContain('private text-and-rank extent estimate');expect(directionApproximation(long)?.representation).toContain('private text-and-rank extent estimate');
});

test('two-node and short branching CI pipelines preserve the readable LR default',()=>{
 const two=compile(chain('two-', ['Request','Response']));
 const branch:Visual={id:'short-branching-ci',kind:'flow',form:'pipeline',question:'Which tasks run in this CI workflow?',title:'CI',nodes:[{id:'lint',label:'Lint'},{id:'test',label:'Test'},{id:'migration',label:'Migrations'},{id:'build',label:'Build'},{id:'deploy',label:'Deploy'}],edges:[{id:'lint-build',from:'lint',to:'build',label:'checks'},{id:'test-build',from:'test',to:'build',label:'checks'},{id:'migration-build',from:'migration',to:'build',label:'checks'},{id:'build-deploy',from:'build',to:'deploy',label:'publishes'}]};
 const ci=compile(branch);expect(two.ok).toBe(true);expect(ci.ok).toBe(true);if(!two.ok||!ci.ok)return;
 expect(rankdir(two)).toBe('LR');expect(rankdir(ci)).toBe('LR');expect(two.elementMap.filter(item=>item.kind==='node')).toHaveLength(2);expect(ci.elementMap.filter(item=>item.kind==='edge')).toHaveLength(4);
});

test('multiline display titles contribute their full native header footprint without changing a readable direction',()=>{
 const oneLine:Visual={...chain('title-one-', ['Request','Response']),title:'Short flow'};
 const multiline:Visual={...chain('title-multi-', ['Request','Response']),title:'Short flow\nAdditional context'};
 const a=compile(oneLine),b=compile(multiline);expect(a.ok).toBe(true);expect(b.ok).toBe(true);if(!a.ok||!b.ok)return;
 expect(rankdir(a)).toBe('LR');expect(rankdir(b)).toBe('LR');
 const estimate=(plan:Extract<ReturnType<typeof compilePresentation>,{ok:true}>)=>directionApproximation(plan)?.representation;
 expect(estimate(a)).toContain('1600×900');expect(estimate(b)).toContain('1600×900');expect(b.source).toContain('Short flow\\nAdditional context');
});

test('implicit orientation is stable under renamed IDs and uses the dependency DAG rather than return links',()=>{
 const first=chain('source-', ['Receive request','Validate context','Produce result','Publish result']);
 const renamed:Visual={...first,id:'renamed-pipeline',nodes:first.nodes!.map((node,index)=>({...node,id:'renamed-'+(index+1)})),edges:first.edges!.map((edge,index)=>({...edge,id:'connection-'+index,from:'renamed-'+(index+1),to:'renamed-'+(index+2)}))};
 renamed.edges!.push({id:'completion-return',from:'renamed-4',to:'renamed-1',label:'reports completion',kind:'return'});
 const a=compile(first),b=compile(renamed);expect(a.ok).toBe(true);expect(b.ok).toBe(true);if(!a.ok||!b.ok)return;
 expect(rankdir(a)).toBe('LR');expect(rankdir(b)).toBe(rankdir(a));expect(b.source).toContain('reports completion');expect(b.elementMap.filter(item=>item.kind==='edge')).toHaveLength(4);
});

test('caller LR and TB directions plus authored layout take precedence over implicit pipeline orientation',()=>{
 const visual=chain('override-', ['Receive request','Validate context','Produce result','Publish result']);
 const callerLr=compile(visual,'LR'),callerTb=compile(visual,'TB'),authored:Visual={...visual,layout:{kind:'flow',direction:'TB',order:visual.nodes!.map(node=>node.id)}},layout=compile(authored);
 expect(callerLr.ok).toBe(true);expect(callerTb.ok).toBe(true);expect(layout.ok).toBe(true);if(!callerLr.ok||!callerTb.ok||!layout.ok)return;
 expect(rankdir(callerLr)).toBe('LR');expect(directionApproximation(callerLr)).toBeUndefined();expect(rankdir(callerTb)).toBe('TB');expect(directionApproximation(callerTb)).toBeUndefined();expect(rankdir(layout)).toBe('TB');expect(directionApproximation(layout)).toBeUndefined();
});

test('cycles and ineligible nested or grouped pipelines retain the legacy LR fallback',()=>{
 const cycleNodes=[{id:'a',label:'A'},{id:'b',label:'B'},{id:'c',label:'C'}],cycleEdges:NonNullable<Visual['edges']>=[{id:'ab',from:'a',to:'b'},{id:'bc',from:'b',to:'c'},{id:'ca',from:'c',to:'a'}];
 expect(estimateGraphvizDagOrientation(cycleNodes,cycleEdges,node=>node.label,'Cycle')).toBeUndefined();
 expect(estimateGraphvizDagOrientation([],[],node=>node.label,'Empty')).toBeUndefined();
 expect(estimateGraphvizDagOrientation([{id:'a',label:'A'},{id:'b',label:'B'}],[{id:'unresolved',from:'a',to:'missing'}],node=>node.label,'Headless')).toBeUndefined();
 const grouped:Visual={id:'grouped-fallback',kind:'flow',form:'pipeline',question:'Where are nodes?',groups:[{id:'zone',label:'Zone',role:'region'}],nodes:[{id:'a',label:'A',group:'zone'},{id:'b',label:'B',group:'zone'}],edges:[{id:'ab',from:'a',to:'b'}]};
 const parented=[{id:'parent',label:'Parent'},{id:'child',label:'Child',parent:'parent'}];
 expect(hasFlatPipelineNodes(parented,[])).toBe(false);expect(hasFlatPipelineNodes([{id:'a',label:'A',group:'zone'}],[{id:'zone'}])).toBe(false);
 const plan=compile(grouped);expect(plan.ok).toBe(true);if(plan.ok){expect(rankdir(plan)).toBe('LR');expect(directionApproximation(plan)).toBeUndefined();}
});
