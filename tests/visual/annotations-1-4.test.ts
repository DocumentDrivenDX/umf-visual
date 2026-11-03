// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createVisualDocument,editVisual,getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';

const forms:Visual[]=[
 {id:'annotations-flow',kind:'flow',form:'network',question:'Where does data move?',nodes:[{id:'a',label:'A'}]},
 {id:'annotations-sequence',kind:'sequence',form:'lifelines',question:'Who communicates?',sequence:{participants:[{id:'a',label:'A'},{id:'b',label:'B'}],messages:[{id:'call',from:'a',to:'b',label:'call'}]}},
 {id:'annotations-structure',kind:'structure',form:'nested',question:'What is contained?',nodes:[{id:'part',label:'Part'}]},
 {id:'annotations-state',kind:'state',form:'machine',question:'What changes?',nodes:[{id:'ready',label:'Ready'},{id:'done',label:'Done'}],state:{initial:'ready',final:['done'],transitions:[{id:'finish',from:'ready',to:'done',event:'finish'}]}},
 {id:'annotations-timeline',kind:'timeline',form:'milestones',question:'When does work happen?',timeline:{scale:{kind:'date'},events:[{id:'start',label:'Start',at:'2026-01-01'}]}},
 {id:'annotations-comparison',kind:'comparison',form:'matrix',question:'Which choice?',comparison:{items:[{id:'one',label:'One'},{id:'two',label:'Two'}],criteria:[{id:'cost',label:'Cost',measure:'text'}],values:[{item:'one',criterion:'cost',text:'Low'},{item:'two',criterion:'cost',text:'High'}]}},
 {id:'annotations-metric',kind:'metric',form:'stat',question:'What is measured?',metric:{unit:'requests',good:'up',series:[{id:'total',label:'Total',points:[{value:2}]}]}}
];
const annotation={id:'review-note',text:'First line\nSecond line'};

test('1.4 annotations are optional first-class text with JSON/YAML editing support in all diagram kinds',()=>{
 for(const base of forms){
  const visual={...base,annotations:[annotation]} as Visual;
  const document=createVisualDocument(visual,'visual:'+base.id,'1.4.0');
  expect(inspectVisual(document),base.kind).toMatchObject({valid:true,complete:true});
  expect(getVisual(document).annotations).toEqual([annotation]);
  expect(getVisual(document).nodes?.some(node=>node.id===annotation.id)??false).toBe(false);
  for(const format of ['json','yaml'] as const)expect(readVisualDocument(writeVisualDocument(document,format),format)).toEqual(document);
  const edited=editVisual(document,current=>({...current,annotations:current.annotations?.map(item=>({...item,text:'Edited note'}))}));
  expect(getVisual(edited).annotations).toEqual([{id:annotation.id,text:'Edited note'}]);
 }
});

test('annotations share the visual ID namespace and are focusable without becoming nodes, edge endpoints or layout members',()=>{
 const valid:Visual={id:'annotations-focus',kind:'flow',form:'network',question:'Where does this fit?',nodes:[{id:'a',label:'A',group:'group'},{id:'b',label:'B',group:'group'}],groups:[{id:'group',label:'Region',role:'region',layout:{kind:'flow',direction:'LR',order:['a','b']}}],edges:[{id:'ab',from:'a',to:'b'}],steps:[{id:'note-step',title:'Read note',focus:['review-note']}],annotations:[annotation],layout:{kind:'flow',direction:'LR',order:['group']}};
 expect(inspectVisual(createVisualDocument(valid,'visual:annotations-focus','1.4.0'))).toMatchObject({valid:true,complete:true});
 const duplicate={...valid,annotations:[{id:'a',text:'Conflicts with a node'}]};expect(()=>createVisualDocument(duplicate,'visual:duplicate-annotation','1.4.0')).toThrow(/VISUAL_ID/);
 const badEndpoint={...valid,edges:[{id:'bad-edge',from:'review-note',to:'a'}]};expect(()=>createVisualDocument(badEndpoint,'visual:annotation-edge','1.4.0')).toThrow(/VISUAL_REFERENCE/);
 const badLayout={...valid,layout:{kind:'flow',direction:'LR',order:['group','review-note']}} as Visual;expect(()=>createVisualDocument(badLayout,'visual:annotation-layout','1.4.0')).toThrow(/VISUAL_LAYOUT/);
 const duplicateGroup={...valid,groups:[{id:'review-note',label:'Collision',role:'region'}]} as Visual;expect(()=>createVisualDocument(duplicateGroup,'visual:annotation-group','1.4.0')).toThrow(/VISUAL_ID/);
});

test('empty annotation arrays and text are invalid while sequence notes remain independent',()=>{
 const flow=forms[0]!;
 expect(()=>createVisualDocument({...flow,annotations:[]} as Visual,'visual:empty-annotations','1.4.0')).toThrow();
 expect(()=>createVisualDocument({...flow,annotations:[{id:'empty',text:''}]} as Visual,'visual:empty-text','1.4.0')).toThrow();
 const sequence:Visual={id:'sequence-annotation',kind:'sequence',form:'lifelines',question:'What happens?',sequence:{participants:[{id:'a',label:'A'},{id:'b',label:'B'}],messages:[{id:'call',from:'a',to:'b',label:'call'}],notes:[{id:'seq-note',text:'Before call',participants:['a'],before:'call'}]},annotations:[{id:'free-text',text:'Unanchored note'}]};
 const document=createVisualDocument(sequence,'visual:sequence-annotation','1.4.0');
 expect(inspectVisual(document)).toMatchObject({valid:true,complete:true});
 expect(getVisual(document).sequence?.notes).toEqual([{id:'seq-note',text:'Before call',participants:['a'],before:'call'}]);
 expect(getVisual(document).annotations).toEqual([{id:'free-text',text:'Unanchored note'}]);
});

test('frozen 1.3 preserves 1.4 annotations as unknown without interpreting or editing them',()=>{
 const old=createVisualDocument(forms[0]!,'visual:old-annotation','1.3.0');
 const payload=old.extensions!['umf.visual'] as unknown as Record<string,unknown>;
 payload.annotations=[annotation];
 expect(inspectVisual(old)).toMatchObject({valid:true,complete:false});
 expect(inspectVisual(old).diagnostics).toContainEqual(expect.objectContaining({code:'VISUAL_UNKNOWN',path:'/extensions/umf.visual/annotations'}));
 expect((getVisual(old) as unknown as Record<string,unknown>).annotations).toEqual([annotation]);
 for(const format of ['json','yaml'] as const)expect(readVisualDocument(writeVisualDocument(old,format),format)).toEqual(old);
 expect(()=>editVisual(old,value=>value)).toThrow(/validated before editing/);
});
