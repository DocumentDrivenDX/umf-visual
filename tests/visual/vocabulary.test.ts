// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {readdirSync} from 'node:fs';
import {readVisualDocument,writeVisualDocument,inspectVisual,getVisual,editVisual,createVisualDocument,visualForms,visualDateValue,visualRegistry,type Visual} from '../../src';
import {validateDocument,copyJson,type Document} from '@umf/core';
const folders=['inventory','forms'];
const files=folders.flatMap(folder=>readdirSync('fixtures/visual/'+folder).filter(f=>f.endsWith('.json')&&f!=='index.json').map(f=>`fixtures/visual/${folder}/${f}`));
const texts=new Map(await Promise.all(files.map(async f=>[f.split('/').at(-1)!.replace('.json',''),await Bun.file(f).text()] as const)));
const index=await Bun.file('fixtures/visual/inventory/index.json').json() as {rows:{row:string;disposition:string;documents?:string[];targets?:string[];embeds?:string}[]};
const fresh=(id:string)=>JSON.parse(texts.get(id)!) as Document;
const visual=(doc:Document)=>doc.extensions!['umf.visual'] as any;
test('@covers US-093-AC1: every inventory visual and one example per form round-trip valid and complete, with copied access',()=>{
 expect(texts.size).toBeGreaterThanOrEqual(50);
 for(const[id,text]of texts){
  const doc=readVisualDocument(text,'json');
  for(const format of ['json','yaml'] as const)expect(readVisualDocument(writeVisualDocument(doc,format),format),id).toEqual(doc);
  const checked=inspectVisual(doc);
  expect(checked.diagnostics,id).toEqual([]);expect(checked.valid&&checked.complete,id).toBe(true);
  expect(visual(doc).id).toBe(id);expect(doc.id).toBe('visual:'+id);
  expect(createVisualDocument(getVisual(doc))).toEqual(doc);
 }
 // Every inventory row resolves: a document, an embed of a documented row, or a table or reference that needs none.
 const documented=new Set(index.rows.filter(r=>r.disposition==='document').map(r=>r.row));
 for(const row of index.rows){
  if(row.disposition==='document'){
   expect(row.documents!.length,row.row).toBeGreaterThan(0);
   row.documents!.forEach((id,i)=>{const v=visual(fresh(id));expect(v.kind+'/'+v.form,row.row).toBe(row.targets![i]);});
  }else if(row.disposition==='embeds')expect(documented.has(row.embeds!),row.row).toBe(true);
  else expect(['table','reference'],row.row).toContain(row.disposition);
 }
 expect(index.rows.filter(r=>r.row==='beacon-ci')[0]!.documents).toHaveLength(3);
 // The example set covers every form of every kind.
 const seen=new Set([...texts.keys()].map(id=>{const v=visual(fresh(id));return v.kind+'/'+v.form;}));
 const forms=Object.entries(visualForms).flatMap(([kind,list])=>list.map(form=>kind+'/'+form));
 expect(forms).toHaveLength(22);for(const form of forms)expect(seen.has(form),form).toBe(true);
 const copy=getVisual(fresh('helix-context'));copy.nodes!.pop();
 expect(getVisual(fresh('helix-context')).nodes).toHaveLength(7);
});
test('@covers US-093-AC2: each contradiction fails with its declared code and blocks read and write',()=>{
 const v=(doc:Document)=>visual(doc);
 const mutations:[string,string,(doc:Document)=>void][]=[
  ['VISUAL_FORM','helix-context',d=>v(d).form='stack'],
  ['VISUAL_BLOCK','helix-context',d=>v(d).timeline={scale:{kind:'date'}}],
  ['VISUAL_BLOCK','helix-request',d=>delete v(d).sequence],
  ['VISUAL_BLOCK','helix-context',d=>v(d).nodes[1].parent=v(d).nodes[0].id],
  ['VISUAL_BLOCK','helix-context',d=>v(d).nodes[0].layer='people'],
  ['VISUAL_ID','helix-context',d=>v(d).nodes[1].id=v(d).nodes[0].id],
  ['VISUAL_ID','helix-context',d=>v(d).edges[0].id=v(d).nodes[0].id],
  ['VISUAL_ID','helix-adr-options',d=>v(d).comparison.values.push({...v(d).comparison.values[0]})],
  ['VISUAL_ID','beacon-schema-tickets',d=>v(d).structure.entities.push(v(d).structure.entities[0])],
  ['VISUAL_REFERENCE','helix-context',d=>v(d).edges[0].to='missing'],
  ['VISUAL_REFERENCE','beacon-containers',d=>v(d).edges[0].from=v(d).groups[0].id],
  ['VISUAL_REFERENCE','beacon-overview',d=>v(d).steps[0].focus=['missing']],
  ['VISUAL_REFERENCE','helix-request',d=>v(d).sequence.messages[0].from='missing'],
  ['VISUAL_REFERENCE','beacon-schema-tickets',d=>v(d).structure.references[0].to.field='missing'],
  ['VISUAL_REFERENCE','visuals-roadmap',d=>v(d).timeline.spans[0].start='m9'],
  ['VISUAL_REFERENCE','umf-ac-status',d=>v(d).metric.series[0].points[0].at='missing'],
  ['VISUAL_REFERENCE','beacon-ticket-lifecycle',d=>v(d).state.initial='missing'],
  ['VISUAL_STEPS','helix-parts',d=>v(d).steps=[{id:'s1',title:'One',focus:['routing-skill']}]],
  ['VISUAL_STEPS','beacon-field-guide',d=>v(d).steps[0].when='other'],
  ['VISUAL_STEPS','beacon-field-guide',d=>v(d).steps[0].tag='NIGHTLY'],
  ['EXTENSION_STRUCTURE','beacon-field-guide',d=>v(d).steps[0].when='sometimes'],
  ['EXTENSION_STRUCTURE','beacon-field-guide',d=>Object.assign(v(d).steps[0],{when:'scheduled',tag:'X'.repeat(25)})],
  ['VISUAL_CYCLE','beacon-estate-landscape',d=>v(d).nodes[0].parent='system-beacon'],
  ['VISUAL_CYCLE','helix-containers',d=>v(d).groups[0].parent=v(d).groups[0].id],
  ['VISUAL_SIZE','beacon-stack',d=>v(d).nodes.push({...v(d).nodes[0],id:'extra'})],
  ['VISUAL_FORM_RULE','helix-deployment',d=>delete v(d).nodes[0].group],
  ['VISUAL_FORM_RULE','helix-deployment',d=>delete v(d).groups[0].tier],
  ['VISUAL_FORM_RULE','beacon-field-guide',d=>delete v(d).nodes[0].group],
  ['VISUAL_FORM_RULE','helix-overview-map',d=>delete v(d).edges.find((e:any)=>e.kind==='return').kind],
  ['VISUAL_FORM_RULE','helix-parts',d=>delete v(d).nodes[0].layer],
  ['VISUAL_FORM_RULE','helix-parts',d=>delete v(d).structure],
  ['VISUAL_FORM_RULE','umf-extensions',d=>delete v(d).nodes[1].parent],
  ['VISUAL_FORM_RULE','tpl-sd-domain',d=>delete v(d).structure.entities],
  ['VISUAL_FORM_RULE','beacon-ticket-lifecycle',d=>v(d).state.transitions[3].path='main'],
  ['VISUAL_FORM_RULE','beacon-ticket-lifecycle',d=>v(d).state.transitions.forEach((t:any)=>delete t.path)],
  ['VISUAL_FORM_RULE','helix-request',d=>v(d).groups=[{id:'zone',label:'Zone',role:'zone'}]],
  ['VISUAL_FORM_RULE','umf-releases',d=>{v(d).timeline.spans=[{id:'span',label:'Span',start:'2026-10-01',end:'2026-10-02'}];delete v(d).timeline.events;}],
  ['VISUAL_FORM_RULE','visuals-roadmap',d=>delete v(d).timeline.spans[0].lane],
  ['VISUAL_FORM_RULE','helix-releases',d=>{delete v(d).timeline.events;v(d).timeline.markers=[{id:'now',label:'Now',at:'2026-10-22',kind:'today'}];}],
  ['VISUAL_FORM_RULE','helix-adr-options',d=>v(d).comparison.values.pop()],
  ['VISUAL_FORM_RULE','visuals-before-after',d=>v(d).comparison.items.push({id:'third',label:'Third'})],
  ['VISUAL_FORM_RULE','layout-engines',d=>delete v(d).comparison.criteria[0].low],
  ['VISUAL_FORM_RULE','layout-engines',d=>v(d).comparison.values.pop()],
  ['VISUAL_FORM_RULE','umf-ac-satisfied',d=>v(d).metric.series.push({...v(d).metric.series[0],id:'second'})],
  ['VISUAL_FORM_RULE','umf-ac-status',d=>{delete v(d).metric.axis;v(d).metric.series[0].points.forEach((p:any)=>delete p.at);}],
  ['VISUAL_FORM_RULE','umf-ac-trend',d=>v(d).metric.series[0].points.splice(1)],
  ['VISUAL_FORM_RULE','umf-ac-coverage',d=>delete v(d).metric.target],
  ['VISUAL_VALUE','helix-adr-options',d=>v(d).comparison.values[0].rating=1],
  ['VISUAL_VALUE','visuals-before-after',d=>{const x=v(d).comparison.values.find((y:any)=>y.support);delete x.support;x.text='yes';}],
  ['VISUAL_VALUE','layout-engines',d=>v(d).comparison.values[0].rating=4],
  ['VISUAL_VALUE','layout-engines',d=>delete v(d).comparison.criteria[0].max],
  ['VISUAL_VALUE','umf-ac-trend',d=>delete v(d).metric.series[0].points[0].at],
  ['VISUAL_DATE','umf-releases',d=>v(d).timeline.events[0].at='2026-02-30'],
  ['VISUAL_DATE','umf-releases',d=>v(d).timeline.events[0].at='2026-10-22T10:00'],
  ['VISUAL_DATE','visuals-roadmap',d=>Object.assign(v(d).timeline.spans[1],{start:'m3',end:'m1'})],
  ['VISUAL_DATE','umf-ac-trend',d=>v(d).metric.series[0].points[0].at='last week'],
  ['EXTENSION_STRUCTURE','helix-context',d=>v(d).kind='diagram'],
  ['EXTENSION_STRUCTURE','helix-context',d=>v(d).nodes[0].role='database'],
  ['EXTENSION_STRUCTURE','helix-context',d=>v(d).nodes[0].id='Support Agent'],
  ['EXTENSION_SCOPE','helix-context',d=>{d.modules.push({id:'m',namespace:'n',extensions:{'umf.visual':v(d)},elements:[]} as any);}]
 ];
 for(const[code,id,mutate]of mutations){
  const doc=fresh(id);mutate(doc);const checked=inspectVisual(doc);
  expect(checked.valid,code+' '+id).toBe(false);
  expect(checked.diagnostics.map(d=>d.code),code+' '+id).toContain(code);
  expect(()=>readVisualDocument(JSON.stringify(doc),'json'),code).toThrow();
  expect(()=>writeVisualDocument(doc),code).toThrow();
 }
 expect(()=>readVisualDocument(JSON.stringify({...fresh('helix-context'),vocabularies:{}}),'json')).toThrow();
 for(const[text,valid]of [['2026-10',true],['2026-10-22',true],['2026-10-22T09:30:00Z',true],['2026-10-22T09:30+02:00',true],['2024-02-29',true],['2025-02-29',false],['2026-13',false],['2026-10-22T24:00Z',false],['26-10-22',false]] as const)
  expect(visualDateValue(text)!==undefined,text).toBe(valid);
});
test('@covers US-093-AC3: unknown fields survive as incomplete interpretation and block conservative edits',()=>{
 const doc=fresh('beacon-deployment');visual(doc).nodes[0].icon='person';visual(doc).layoutHints={rankdir:'LR'};
 const returned=readVisualDocument(writeVisualDocument(doc));expect(returned).toEqual(doc);
 const checked=inspectVisual(doc);expect(checked.valid).toBe(true);expect(checked.complete).toBe(false);
 expect(checked.diagnostics.map(d=>[d.code,d.severity,d.path])).toEqual([
  ['VISUAL_UNKNOWN','warning','/extensions/umf.visual/nodes/0/icon'],['VISUAL_UNKNOWN','warning','/extensions/umf.visual/layoutHints']]);
 expect(()=>editVisual(doc,value=>value)).toThrow('validated');
 const newer={...fresh('helix-context'),vocabularies:{'umf.visual':{version:'1.1.0'}}};
 const later=validateDocument(newer,visualRegistry());expect(later.valid).toBe(true);expect(later.diagnostics.map(d=>d.code)).toEqual(['UNKNOWN_EXTENSION']);
});
test('@covers US-093-AC4: complete visual edits are atomic and reject invalid results',()=>{
 const doc=fresh('helix-context');const snapshot=copyJson(doc) as unknown as Document;
 const edited=editVisual(doc,value=>({...value,takeaway:'HELIX reads scope from the marker before every write.'}));
 expect(doc).toEqual(snapshot);expect(getVisual(edited).takeaway).toBe('HELIX reads scope from the marker before every write.');
 expect(()=>editVisual(doc,value=>({...value,form:'lifelines'} as Visual))).toThrow();
 expect(()=>editVisual(doc,value=>({...value,edges:[...value.edges!,{id:'dangling',from:'team',to:'nowhere'}]}))).toThrow();
 expect(doc).toEqual(snapshot);
});
test('@covers US-093-AC5: density is advice, not a diagnostic',()=>{
 const dense=inspectVisual(fresh('beacon-context'));
 expect(dense.valid&&dense.complete).toBe(true);
 expect(dense.advice.map(a=>[a.code,a.path])).toEqual([['VISUAL_DENSITY','/extensions/umf.visual/nodes']]);
 expect(inspectVisual(fresh('helix-context')).advice).toEqual([]);
 const crowded=fresh('helix-request');const p=visual(crowded).sequence.participants;
 for(let i=0;i<3;i++)p.push({...p[0],id:'extra-'+i});
 const checked=inspectVisual(crowded);expect(checked.valid&&checked.complete).toBe(true);
 expect(checked.advice.map(a=>a.path)).toEqual(['/extensions/umf.visual/sequence/participants']);
});
