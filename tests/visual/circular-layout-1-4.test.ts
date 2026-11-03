// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createVisualDocument,editVisual,getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';

const flow=(layout?:Visual['layout'])=>({id:'circular-layout',kind:'flow',form:'network',question:'How are the connections arranged?',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],edges:[{id:'ab',from:'a',to:'b'}],...(layout?{layout}:{})} as Visual);

test('1.4 circular layout is optional, keeps clockwise order separate from edges, and round-trips',()=>{
 const absent=createVisualDocument(flow(),'visual:circular-layout','1.4.0');
 expect(inspectVisual(absent)).toMatchObject({valid:true,complete:true});
 expect(Object.hasOwn(getVisual(absent),'layout')).toBe(false);
 const ordered=createVisualDocument(flow({kind:'circular',order:['a','b']}),'visual:circular-layout','1.4.0');
 expect(inspectVisual(ordered)).toMatchObject({valid:true,complete:true});
 expect(getVisual(ordered).layout).toEqual({kind:'circular',order:['a','b']});
 expect(getVisual(ordered).edges).toEqual([{id:'ab',from:'a',to:'b'}]);
 const unspecified=createVisualDocument(flow({kind:'circular'}),'visual:circular-layout','1.4.0');
 expect(inspectVisual(unspecified)).toMatchObject({valid:true,complete:true});
 expect(getVisual(unspecified).layout).toEqual({kind:'circular'});
 for(const doc of [ordered,unspecified])for(const format of ['json','yaml'] as const)expect(readVisualDocument(writeVisualDocument(doc,format),format)).toEqual(doc);
 const edited=editVisual(unspecified,value=>({...value,layout:{kind:'circular',order:['b','a']}}));
 expect(getVisual(edited).layout).toEqual({kind:'circular',order:['b','a']});
});

test('circular order validates exact direct children and supports existing node-based composition scopes',()=>{
 const root=createVisualDocument(flow({kind:'circular',order:['a','b']}),'visual:circle-root','1.4.0');
 expect(inspectVisual(root)).toMatchObject({valid:true,complete:true});
 const grouped:Visual={id:'circle-group',kind:'flow',form:'network',question:'How are grouped nodes arranged?',groups:[{id:'g',label:'Group',role:'zone',layout:{kind:'circular',order:['a','b']}}],nodes:[{id:'a',label:'A',group:'g'},{id:'b',label:'B',group:'g'}],edges:[{id:'ab',from:'a',to:'b'}]};
 expect(inspectVisual(createVisualDocument(grouped,'visual:circle-group','1.4.0'))).toMatchObject({valid:true,complete:true});
 const structured:Visual={id:'circle-structure',kind:'structure',form:'nested',question:'How are nested elements arranged?',groups:[{id:'g',label:'Group',role:'region',layout:{kind:'circular',order:['a','b']}}],nodes:[{id:'a',label:'A',group:'g'},{id:'b',label:'B',group:'g'}]};
 expect(inspectVisual(createVisualDocument(structured,'visual:circle-structure','1.4.0'))).toMatchObject({valid:true,complete:true});
 const state:Visual={id:'circle-state',kind:'state',form:'machine',question:'How are states arranged?',nodes:[{id:'ready',label:'Ready'},{id:'done',label:'Done'}],state:{initial:'ready',final:['done'],transitions:[{id:'finish',from:'ready',to:'done',event:'finish'}]},layout:{kind:'circular',order:['ready','done']}};
 expect(inspectVisual(createVisualDocument(state,'visual:circle-state','1.4.0'))).toMatchObject({valid:true,complete:true});
 for(const order of [['a'],['a','missing'],['a','a']]){
  const invalid=flow({kind:'circular',order} as Visual['layout']);
  expect(()=>createVisualDocument(invalid,'visual:bad-circle','1.4.0')).toThrow();
 }
 const nonGraph:Visual={id:'circle-on-sequence',kind:'sequence',form:'lifelines',question:'Who communicates?',sequence:{participants:[{id:'a',label:'A'},{id:'b',label:'B'}],messages:[{id:'m',from:'a',to:'b',label:'call'}]},layout:{kind:'circular'}};
 expect(()=>createVisualDocument(nonGraph,'visual:circle-on-sequence','1.4.0')).toThrow(/VISUAL_LAYOUT/);
});

test('frozen 1.3 preserves but does not interpret the 1.4 circular layout kind',()=>{
 const old=createVisualDocument(flow(),'visual:circular-layout-old','1.3.0');
 const payload=old.extensions!['umf.visual'] as unknown as Record<string,unknown>;
 payload.layout={kind:'circular',order:['a','b']};
 expect(inspectVisual(old)).toMatchObject({valid:false,complete:false});
 expect(inspectVisual(old).diagnostics).toContainEqual(expect.objectContaining({code:'EXTENSION_STRUCTURE',path:'/extensions/umf.visual/layout/kind'}));
 expect((getVisual(old) as unknown as Record<string,unknown>).layout).toEqual({kind:'circular',order:['a','b']});
 expect(JSON.parse(JSON.stringify(old)).extensions['umf.visual'].layout).toEqual({kind:'circular',order:['a','b']});
 expect(()=>editVisual(old,value=>value)).toThrow(/validated before editing/);
});
