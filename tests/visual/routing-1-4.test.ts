// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {editVisual,createVisualDocument,getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';

const flow=(routing?:{kind:'curved'|'straight'})=>({id:'route-intent',kind:'flow',form:'network',question:'How are records connected?',nodes:[{id:'source',label:'Source'},{id:'target',label:'Target'}],edges:[{id:'connection',from:'source',to:'target',...(routing?{routing}:{})}]} as Visual);

test('1.4 routing intent is optional, editable, and round-trips exactly as JSON and YAML',()=>{
 const absent=createVisualDocument(flow(),undefined,'1.4.0');
 expect(inspectVisual(absent)).toMatchObject({valid:true,complete:true});
 expect(Object.hasOwn(getVisual(absent).edges![0]!, 'routing')).toBe(false);
 for(const kind of ['curved','straight'] as const){
  const authored=createVisualDocument(flow({kind}),undefined,'1.4.0');
  expect(inspectVisual(authored)).toMatchObject({valid:true,complete:true});
  expect(getVisual(authored).edges![0]!.routing).toEqual({kind});
  for(const format of ['json','yaml'] as const){
   const serialized=writeVisualDocument(authored,format);
   expect(readVisualDocument(serialized,format)).toEqual(authored);
  }
  const edited=editVisual(absent,visual=>({...visual,edges:visual.edges!.map(edge=>({...edge,routing:{kind}}))}));
  expect(getVisual(edited).edges![0]!.routing).toEqual({kind});
 }
});

test('1.4 rejects incomplete routing objects and unrecognized routing kinds',()=>{
 for(const routing of [{},{kind:'orthogonal'}]){
  const malformed=flow() as Visual;
  (malformed.edges![0] as unknown as Record<string,unknown>).routing=routing;
  expect(()=>createVisualDocument(malformed,undefined,'1.4.0')).toThrow();
 }
});

test('unknown nested routing metadata is preserved and blocks unsafe edits',()=>{
 const extended=flow({kind:'curved'}) as Visual;
 (extended.edges![0]!.routing as unknown as Record<string,unknown>).nativeHint={engine:'diagram-tool',controlPoints:[[1,2],[3,4]]};
 const document=createVisualDocument(extended,undefined,'1.4.0');
 expect(inspectVisual(document)).toMatchObject({valid:true,complete:false});
 const diagnostics=inspectVisual(document).diagnostics;
 expect(diagnostics).toContainEqual(expect.objectContaining({code:'VISUAL_UNKNOWN',path:'/extensions/umf.visual/edges/0/routing/nativeHint'}));
 for(const format of ['json','yaml'] as const){
  const roundTrip=readVisualDocument(writeVisualDocument(document,format),format);
  expect(roundTrip).toEqual(document);
 }
 expect(()=>editVisual(document,value=>value)).toThrow(/validated before editing/);
});

test('frozen 1.3 retains but does not interpret 1.4 edge routing',()=>{
 const old=createVisualDocument(flow(),undefined,'1.3.0');
 const payload=old.extensions!['umf.visual'] as unknown as {edges:Array<Record<string,unknown>>};
 payload.edges[0]!.routing={kind:'curved'};
 expect(inspectVisual(old)).toMatchObject({valid:true,complete:false});
 expect(inspectVisual(old).diagnostics).toContainEqual(expect.objectContaining({code:'VISUAL_UNKNOWN',path:'/extensions/umf.visual/edges/0/routing'}));
 expect((getVisual(old).edges![0] as unknown as Record<string,unknown>).routing).toEqual({kind:'curved'});
 for(const format of ['json','yaml'] as const)expect(readVisualDocument(writeVisualDocument(old,format),format)).toEqual(old);
 expect(()=>editVisual(old,value=>value)).toThrow(/validated before editing/);
});
