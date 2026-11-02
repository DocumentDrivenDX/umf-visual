// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createVisualDocument,editVisual,getVisual,inspectVisual,latestVisualPackage,readVisualDocument,writeVisualDocument,upgradeVisualDocument,VISUAL_VERSION,LATEST_VISUAL_VERSION,type Visual} from '../../src/extensions/visual';
import type {Document} from '@umf/core';

const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const validFlow=():Visual=>({
 id:'ports-and-layout',kind:'flow',form:'network',question:'Which native ports connect?',
 nodes:[
  {id:'api',label:'API',role:'actor',shape:'ellipse',ports:[{id:'out',label:'Requests',side:'east'}]},
  {id:'store',label:'Store',role:'store',shape:'cylinder',ports:[{id:'in',side:'west'}]}
 ],
 edges:[{id:'request',from:'api',to:'store',fromPort:'out',toPort:'in',label:'read'}],
 layout:{kind:'flow',direction:'LR',order:['api','store']}
});

test('1.1 schema and semantic implementation are frozen as the base for additive 1.2',()=>{
 const schema=JSON.parse(readFileSync('spec/extensions/visual/1.1.0/schema.json','utf8'));
 const manifest=JSON.parse(readFileSync('spec/extensions/visual/1.1.0/package.json','utf8'));
 expect(schema.$id).toBe('urn:umf:visual:1.1.0');expect(manifest.version).toBe('1.1.0');
 expect(manifest.schema).toEqual(schema);
 expect(hash(readFileSync('spec/extensions/visual/1.1.0/schema.json'))).toBe('a4e8117bc1398c150f13aedd3df3cbfefa63b60e37eac5e742352984d8977a76');
 expect(hash(readFileSync('spec/extensions/visual/1.1.0/package.json'))).toBe('9dde1842a083af18f38d3ccc4f991d4fffe19487d0824224201f2f6549aca432');
 expect(hash(readFileSync('src/extensions/visual/legacy-1-1.ts','utf8'))).toBe('00245539b9f9b5cf387b8b3794451226327bd96529f56bd58e1e149e65b76dd3');
 const v11=createVisualDocument({id:'frozen',kind:'flow',form:'network',question:'How?',nodes:[{id:'a',label:'A',shape:'ellipse'}],edges:[{id:'e',from:'a',to:'a'}]} as any,'visual:frozen','1.1.0');
 const result=inspectVisual(v11);expect(result.valid).toBe(true);expect(result.complete).toBe(false);
 expect(result.diagnostics.some(d=>d.code==='VISUAL_UNKNOWN'&&d.path.endsWith('/nodes/0/shape'))).toBe(true);
});

test('1.2 generated schema, manifest, and public semantic version agree',()=>{
 const schema=JSON.parse(readFileSync('spec/extensions/visual/schema.json','utf8'));
 const manifest=JSON.parse(readFileSync('spec/extensions/visual/package.json','utf8'));
 expect(schema.$id).toBe('urn:umf:visual:1.2.0');expect(manifest.version).toBe('1.2.0');expect(manifest.schema).toEqual(schema);
 expect(VISUAL_VERSION).toBe('1.0.0');expect(LATEST_VISUAL_VERSION).toBe('1.2.0');expect(latestVisualPackage.version).toBe('1.2.0');
});

test('1.2 models explicit node shapes, node-local ports, endpoint bindings and exact JSON/YAML round trips',()=>{
 const document=createVisualDocument(validFlow(),'visual:ports-and-layout','1.2.0');
 expect(inspectVisual(document)).toMatchObject({valid:true,complete:true});
 expect(getVisual(document)).toEqual(validFlow());
 for(const format of ['json','yaml'] as const)expect(readVisualDocument(writeVisualDocument(document,format),format)).toEqual(document);
 const edited=editVisual(document,visual=>({...visual,nodes:visual.nodes!.map(node=>node.id==='api'?{...node,shape:'hexagon'}:node)}));
 expect((getVisual(edited).nodes![0]!).shape).toBe('hexagon');expect((getVisual(document).nodes![0]!).shape).toBe('ellipse');
 const sequence:Visual={id:'participant-shapes',kind:'sequence',form:'lifelines',question:'Who talks?',sequence:{participants:[{id:'client',label:'Client',shape:'diamond',role:'actor'},{id:'worker',label:'Worker',shape:'hexagon',role:'own'}],messages:[{id:'request',from:'client',to:'worker',label:'Request'}]}};
 expect(inspectVisual(createVisualDocument(sequence,'visual:participant-shapes','1.2.0'))).toMatchObject({valid:true,complete:true});
});

test('unknown flow and stack layout content is retained but never interpreted or silently edited',()=>{
 for(const kind of ['flow','stack'] as const)for(const scope of ['root','group']){
  const visual=validFlow();
  if(scope==='root')visual.layout={kind,unexpectedMeaning:{policy:'must-preserve'}} as any;
  else{visual.groups=[{id:'boundary',label:'Boundary',role:'boundary',layout:{kind,unexpectedMeaning:{policy:'must-preserve'}} as any}];visual.nodes!.forEach(node=>node.group='boundary');delete visual.layout;}
  const document=createVisualDocument(visual,'visual:unknown-layout','1.2.0'),checked=inspectVisual(document);
  expect(checked.valid).toBe(true);expect(checked.complete).toBe(false);
  expect(checked.diagnostics.some(d=>d.code==='VISUAL_UNKNOWN'&&d.path.endsWith('/layout/unexpectedMeaning'))).toBe(true);
  expect(()=>editVisual(document,v=>v)).toThrow('All present semantics');
  expect(readVisualDocument(writeVisualDocument(document,'json'),'json')).toEqual(document);
 }
});

test('upgrade targets have runtime admission and never downgrade or mutate input',()=>{
 const document=createVisualDocument({id:'upgrade',kind:'flow',form:'network',question:'How?',nodes:[{id:'a',label:'A'}]},'visual:upgrade','1.1.0');
 const before=JSON.stringify(document);
 for(const target of ['1.0.0','9.9.9',null,{},()=>{}])expect(()=>upgradeVisualDocument(document,target as any)).toThrow('Choose upgrade target');
 expect(JSON.stringify(document)).toBe(before);
 const modern=upgradeVisualDocument(document,'1.2.0');
 expect(()=>upgradeVisualDocument(modern,'1.1.0')).toThrow('cannot be downgraded');
 expect(modern.vocabularies['umf.visual']!.version).toBe('1.2.0');
});

test('ports are local, unique, and explicitly resolved without role or field inference',()=>{
 const base=createVisualDocument(validFlow(),'visual:port-validation','1.2.0');
 const duplicate=structuredClone(base);(duplicate.extensions!['umf.visual'] as any).nodes[0].ports.push({id:'out',side:'north'});
 expect(inspectVisual(duplicate)).toMatchObject({valid:false,diagnostics:expect.arrayContaining([expect.objectContaining({code:'VISUAL_PORT'})])});
 const unknown=structuredClone(base);(unknown.extensions!['umf.visual'] as any).edges[0].toPort='missing';
 expect(inspectVisual(unknown)).toMatchObject({valid:false,diagnostics:expect.arrayContaining([expect.objectContaining({code:'VISUAL_PORT',path:'/extensions/umf.visual/edges/0/toPort'})])});
 const crossNode=structuredClone(base);(crossNode.extensions!['umf.visual'] as any).nodes[1].ports[0].id='other';
 expect(inspectVisual(crossNode)).toMatchObject({valid:false,diagnostics:expect.arrayContaining([expect.objectContaining({code:'VISUAL_PORT'})])});
 const sameLocalNames=validFlow();sameLocalNames.nodes![0]!.ports![0]!.id='connection';sameLocalNames.nodes![1]!.ports![0]!.id='connection';sameLocalNames.edges![0]!.fromPort='connection';sameLocalNames.edges![0]!.toPort='connection';
 expect(inspectVisual(createVisualDocument(sameLocalNames,'visual:scoped-port-ids','1.2.0'))).toMatchObject({valid:true,complete:true});
});

test('reference ports cannot be mixed with field endpoints and identification is explicit only',()=>{
 const visual:Visual={id:'explicit-relations',kind:'structure',form:'entities',question:'Which endpoint is attached?',nodes:[{id:'ticket',label:'Ticket',role:'store',ports:[{id:'owner'}]},{id:'owner',label:'Owner',role:'actor',ports:[{id:'tickets'}]}],structure:{entities:[{node:'ticket',fields:[{id:'owner-fk',name:'owner_id',type:'OwnerId',keys:['fk']}]},{node:'owner',fields:[{id:'owner-pk',name:'id',type:'OwnerId',keys:['pk']}]}],references:[{id:'ownership',from:{node:'ticket',portId:'owner'},to:{node:'owner',portId:'tickets'},label:'ownership',identification:'non-identifying'}]}};
 const document=createVisualDocument(visual,'visual:explicit-relations','1.2.0');expect(inspectVisual(document)).toMatchObject({valid:true,complete:true});
 expect(getVisual(document).structure!.references![0]!.identification).toBe('non-identifying');
 const conflict=structuredClone(visual);conflict.structure!.references![0]!.from.field='owner_id';
 expect(()=>createVisualDocument(conflict,'visual:port-field-conflict','1.2.0')).toThrow();
 const unspecified=structuredClone(visual);delete unspecified.structure!.references![0]!.identification;
 expect(getVisual(createVisualDocument(unspecified,'visual:unspecified-identification','1.2.0')).structure!.references![0]!.identification).toBeUndefined();
});

test('layout order is an exact permutation of container children and cannot reorder a stack across layers',()=>{
 const nested:Visual={id:'container-layout',kind:'flow',form:'network',question:'What is inside?',groups:[{id:'platform',label:'Platform',role:'zone',layout:{kind:'grid',columns:2,order:['api','worker','store']}}],nodes:[{id:'api',label:'API',group:'platform'},{id:'worker',label:'Worker',group:'platform'},{id:'store',label:'Store',group:'platform'}],edges:[{id:'calls',from:'api',to:'worker'}],layout:{kind:'flow',direction:'LR',order:['platform']}};
 expect(inspectVisual(createVisualDocument(nested,'visual:nested-layout','1.2.0'))).toMatchObject({valid:true,complete:true});
 const wrong=structuredClone(nested);wrong.groups![0]!.layout!.order=['api','worker','missing'];
 expect(()=>createVisualDocument(wrong,'visual:wrong-order','1.2.0')).toThrow();
 const duplicated=structuredClone(nested);duplicated.layout!.order=['platform','platform'];
 expect(()=>createVisualDocument(duplicated,'visual:duplicate-order','1.2.0')).toThrow();
 const stack:Visual={id:'ordered-stack',kind:'structure',form:'stack',question:'Which layer comes first?',structure:{layers:[{id:'foundation',label:'Foundation'},{id:'service',label:'Service'}]},nodes:[{id:'db',label:'Database',layer:'foundation'},{id:'api',label:'API',layer:'service'}],layout:{kind:'stack',order:['db','api']}};
 expect(inspectVisual(createVisualDocument(stack,'visual:ordered-stack','1.2.0'))).toMatchObject({valid:true,complete:true});
 const contradiction=structuredClone(stack);contradiction.layout!.order=['api','db'];
 expect(()=>createVisualDocument(contradiction,'visual:stack-contradiction','1.2.0')).toThrow(/VISUAL_LAYOUT/);
 const gridContradiction=structuredClone(stack);gridContradiction.layout={kind:'grid',columns:2,order:['api','db']};
 expect(()=>createVisualDocument(gridContradiction,'visual:grid-stack-contradiction','1.2.0')).toThrow(/VISUAL_LAYOUT/);
});

test('state composition reuses generic root layout without implying transition order',()=>{
 const visual:Visual={id:'state-composition',kind:'state',form:'machine',question:'Which states nest?',nodes:[{id:'workflow',label:'Workflow'},{id:'inner',label:'Inner state',parent:'workflow'},{id:'done',label:'Done'}],state:{initial:'workflow',final:['done'],transitions:[{id:'finish',from:'inner',to:'done',event:'finish'}]},layout:{kind:'grid',columns:2,order:['workflow','done']}};
 const document=createVisualDocument(visual,'visual:state-composition','1.2.0');expect(inspectVisual(document)).toMatchObject({valid:true,complete:true});
 for(const format of ['json','yaml'] as const)expect(readVisualDocument(writeVisualDocument(document,format),format)).toEqual(document);
 const wrong=structuredClone(visual);wrong.layout!.order=['workflow','inner','done'];expect(()=>createVisualDocument(wrong,'visual:state-wrong-order','1.2.0')).toThrow(/VISUAL_LAYOUT/);
 const unknown=structuredClone(document);(unknown.extensions!['umf.visual'] as any).layout.futureMeaning='preserve';expect(inspectVisual(unknown)).toMatchObject({valid:true,complete:false});expect(()=>editVisual(unknown,v=>v)).toThrow('All present semantics');
});

test('upgrade stays on default 1.1 unless 1.2 is explicitly requested, without source mutation or downgrades',()=>{
 const source=createVisualDocument({id:'upgrade',kind:'flow',form:'network',question:'Where?',nodes:[{id:'api',label:'API'}],edges:[{id:'request',from:'api',to:'api'}]},'visual:upgrade','1.0.0'),before=JSON.stringify(source);
 const defaultUpgrade=upgradeVisualDocument(source);expect(defaultUpgrade.vocabularies['umf.visual']!.version).toBe('1.1.0');expect(JSON.stringify(source)).toBe(before);
 const latestUpgrade=upgradeVisualDocument(source,'1.2.0');expect(latestUpgrade.vocabularies['umf.visual']!.version).toBe('1.2.0');expect(inspectVisual(latestUpgrade)).toMatchObject({valid:true,complete:true});
 expect(()=>upgradeVisualDocument(latestUpgrade)).toThrow(/cannot be downgraded/);
});
