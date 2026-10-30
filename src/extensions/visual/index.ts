// SPDX-License-Identifier: MIT OR Apache-2.0
import {visualRegistry as legacyRegistry, inspectVisual as inspectLegacy} from './legacy-1-0.js';
import legacyManifest from '../../../spec/extensions/visual/1.0.0/package.json';
import manifest from '../../../spec/extensions/visual/package.json';
import {Registry,validateDocument,copyJson,readDocument,writeDocument,UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage,type Validation} from '@umf/core';
import type {VisualDefs,VisualShape} from './generated';
export const VISUAL_EXTENSION='umf.visual';
// Preserve released authoring defaults; 1.1.0 is an explicit opt-in.
export const VISUAL_VERSION='1.0.0';
export const LATEST_VISUAL_VERSION='1.1.0';
export type VisualVersion=typeof VISUAL_VERSION|typeof LATEST_VISUAL_VERSION;
export const visualPackage=legacyManifest as unknown as ExtensionPackage;
export const latestVisualPackage=manifest as unknown as ExtensionPackage;
export type {VisualDefs,VisualShape} from './generated';
// The shapes below are generated from the schema (scripts/generate.ts); these names are the public API.
export type Visual=VisualShape;
export type VisualKind=VisualShape['kind'];
export type VisualForm=VisualShape['form'];
// Which forms belong to each kind: a semantic rule (VISUAL_FORM), checked here against the schema's kinds and forms.
export const visualForms={
 flow:['network','pipeline','zoned','lanes'],
 sequence:['lifelines','ladder'],
 structure:['stack','tree','nested','entities'],
 state:['machine','lifecycle'],
 timeline:['milestones','roadmap','history'],
 comparison:['matrix','quadrant','before-after'],
 metric:['stat','bar','line','meter']
} as const satisfies Record<VisualKind,readonly VisualForm[]>;
export type VisualStatus=VisualDefs['status'];
export type VisualEmphasis=VisualDefs['emphasis'];
export type VisualRole=NonNullable<VisualDefs['node']['role']>;
export type VisualEvidence=VisualDefs['evidence'][number];
export type VisualLabelled=VisualDefs['labelled'];
export type VisualGroup=VisualDefs['group'];
export type VisualParticipant=VisualDefs['participant'];
export type VisualNode=VisualDefs['node'];
export type VisualEdge=VisualDefs['edge'];
/** When an unnumbered step happens; a step with none is numbered in order. */
export type VisualStepWhen=NonNullable<VisualDefs['step']['when']>;
export type VisualStep=VisualDefs['step'];
export type VisualMessage=VisualDefs['sequence']['messages'][number];
export type VisualCardinality=VisualDefs['cardinality'];
/** Exact bounds at one end of a reference: max absent is unbounded; text is the source's own notation. */
export type VisualMultiplicity=VisualDefs['multiplicity'];
export type VisualEntity=NonNullable<VisualDefs['structure']['entities']>[number];
export type VisualField=VisualEntity['fields'][number];
export type VisualReference=NonNullable<VisualDefs['structure']['references']>[number];
export type VisualTransition=VisualDefs['state']['transitions'][number];
export type VisualEvent=NonNullable<VisualDefs['timeline']['events']>[number];
export type VisualSpan=NonNullable<VisualDefs['timeline']['spans']>[number];
export type VisualMarker=NonNullable<VisualDefs['timeline']['markers']>[number];
export type VisualCriterion=VisualDefs['comparison']['criteria'][number];
export type VisualValue=VisualDefs['comparison']['values'][number];
export type VisualSeries=VisualDefs['metric']['series'][number];
export interface VisualInspection extends Validation {advice:Diagnostic[];}
type Content='groups'|'nodes'|'edges'|'sequence'|'structure'|'state'|'timeline'|'comparison'|'metric';
// Which top-level content each kind may carry, and which it must.
const content:Record<VisualKind,{allowed:Content[];required:Content[]}>={
 flow:{allowed:['nodes','edges','groups'],required:['nodes']},
 sequence:{allowed:['groups','sequence'],required:['sequence']},
 structure:{allowed:['nodes','groups','structure'],required:['nodes']},
 state:{allowed:['nodes','state'],required:['nodes','state']},
 timeline:{allowed:['timeline'],required:['timeline']},
 comparison:{allowed:['comparison'],required:['comparison']},
 metric:{allowed:['metric'],required:['metric']}
};
const contentKeys:Content[]=['groups','nodes','edges','sequence','structure','state','timeline','comparison','metric'];
const walkthroughKinds:VisualKind[]=['flow','sequence','state','timeline'];
const graphKinds:VisualKind[]=['flow','structure','state'];
const sequenceRoles=['phase','loop','alternative'];
// Resource limits make a visual invalid; legibility is advice (advise), which a profile such as HELIX's may enforce.
const MAX_NODES=500,MAX_CONNECTIONS=10_000,SPLIT_NODES=15,ADVISED_NODES=7,ADVISED_PARTICIPANTS=8;
const each=<T>(list:T[]|undefined,path:string,visit:(item:T,path:string,index:number)=>void)=>(list??[]).forEach((item,index)=>visit(item,path+'/'+index,index));
/** Epoch milliseconds of a proleptic-Gregorian UTC time; unlike Date.UTC, years 0–99 stay years 0–99. */
const utc=(year:number,monthIndex:number,day:number,hour=0,minute=0,second=0)=>{const at=new Date(0);at.setUTCFullYear(year,monthIndex,day);at.setUTCHours(hour,minute,second,0);return at.getTime();};
const datePattern=/^(\d{4})-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-](\d{2}):(\d{2})))?)?$/;
/** ISO-8601 month, date or offset date-time as epoch milliseconds; undefined when not a real calendar value. */
export function visualDateValue(text:string):number|undefined {
 const m=datePattern.exec(text);if(!m)return;
 const year=Number(m[1]),month=Number(m[2]),day=m[3]===undefined?1:Number(m[3]);
 if(month<1||month>12||day<1||day>new Date(utc(year,month,0)).getUTCDate())return;
 if(m[3]!==undefined&&m[4]!==undefined&&m[7]===undefined)return;
 const hour=Number(m[4]??0),minute=Number(m[5]??0),second=Number(m[6]??0);
 if(hour>23||minute>59||second>59)return;
 let offset=0;
 if(m[7]&&m[7]!=='Z'){const h=Number(m[8]),mm=Number(m[9]);if(h>23||mm>59)return;offset=(m[7][0]==='-'?-1:1)*(h*60+mm);}
 return utc(year,month-1,day,hour,minute,second)-offset*60000;
}
function semantics(value:Json,context:{document:Document;path:string;scope:string}):Diagnostic[]{
 const v=value as unknown as Visual;const out:Diagnostic[]=[];
 const add=(code:string,path:string,message:string,severity:'error'|'warning'='error')=>out.push({code,path:context.path+path,message,severity});
 // Preserve unknown properties, but never treat them as interpreted vocabulary.
 const defs=manifest.schema.$defs as Record<string,any>;
 function unknown(node:any,schema:any,path:string):void {
  if(schema.$ref)schema=defs[schema.$ref.split('/').at(-1)];
  if(schema.oneOf){schema=schema.oneOf.find((candidate:any)=>candidate.properties?.kind?.const===node?.kind);if(!schema)return;}
  if(schema.type==='object'&&node&&typeof node==='object'&&!Array.isArray(node))for(const[key,child]of Object.entries(node)){
   const next=schema.properties&&Object.hasOwn(schema.properties,key)?schema.properties[key]:undefined;
   if(next)unknown(child,next,path+'/'+pointer(key));else add('VISUAL_UNKNOWN',path+'/'+pointer(key),'Unknown visual content retained','warning');
  }
  if(schema.type==='array'&&Array.isArray(node)&&typeof schema.items==='object')node.forEach((child,index)=>unknown(child,schema.items,path+'/'+index));
 }
 unknown(v,manifest.schema,'');
 const forms=visualForms[v.kind] as readonly string[];
 if(!forms.includes(v.form))add('VISUAL_FORM','/form','Form '+v.form+' is not a form of '+v.kind+'; expected one of '+forms.join(', '));
 const rule=content[v.kind];
 for(const key of contentKeys){
  if(v[key]!==undefined&&!rule.allowed.includes(key))add('VISUAL_BLOCK','/'+key,'A '+v.kind+' visual does not carry '+key);
  if(v[key]===undefined&&rule.required.includes(key))add('VISUAL_BLOCK','','A '+v.kind+' visual requires '+key);
 }
 each(v.nodes,'/nodes',(node,path)=>{
  if(node.parent!==undefined&&v.kind!=='structure'&&v.kind!=='state')add('VISUAL_BLOCK',path+'/parent','Only structure and state visuals nest nodes');
  if(node.layer!==undefined&&v.kind!=='structure')add('VISUAL_BLOCK',path+'/layer','Only structure visuals place nodes in layers');
 });
 if(v.steps&&!walkthroughKinds.includes(v.kind))add('VISUAL_STEPS','/steps','A '+v.kind+' visual has no walkthrough');
 if((v.nodes?.length??0)>MAX_NODES)add('VISUAL_SIZE','/nodes','More than '+MAX_NODES+' nodes, the resource limit');
 for(const[list,path]of [[v.edges,'/edges'],[v.structure?.references,'/structure/references'],[v.state?.transitions,'/state/transitions'],[v.sequence?.messages,'/sequence/messages']] as const)
  if((list?.length??0)>MAX_CONNECTIONS)add('VISUAL_SIZE',path,'More than '+MAX_CONNECTIONS+' connections, the resource limit');
 // One id namespace per visual: declare everything, then resolve references.
 const ids=new Map<string,string>();
 const declare=(id:string,sort:string,path:string)=>{const prior=ids.get(id);if(prior)add('VISUAL_ID',path+'/id','Id '+JSON.stringify(id)+' is already used by a '+prior);else ids.set(id,sort);};
 const resolve=(id:string|undefined,sorts:string[],path:string)=>{
  if(id===undefined)return;const sort=ids.get(id);
  if(!sort)add('VISUAL_REFERENCE',path,'Missing '+sorts.join(' or ')+' '+JSON.stringify(id));
  else if(sorts.length&&!sorts.includes(sort))add('VISUAL_REFERENCE',path,JSON.stringify(id)+' is a '+sort+', not a '+sorts.join(' or '));
 };
 const s=v.sequence,st=v.structure,sm=v.state,t=v.timeline,c=v.comparison,m=v.metric;
 const declarations:[{id:string}[]|undefined,string,string][]=[
  [v.groups,'group','/groups'],[v.nodes,'node','/nodes'],[v.edges,'edge','/edges'],[v.steps,'step','/steps'],
  [s?.participants,'participant','/sequence/participants'],[s?.messages,'message','/sequence/messages'],
  [st?.layers,'layer','/structure/layers'],[st?.references,'reference','/structure/references'],
  [sm?.transitions,'transition','/state/transitions'],
  [t?.scale.kind==='period'?t.scale.periods:undefined,'period','/timeline/scale/periods'],
  [t?.lanes,'lane','/timeline/lanes'],[t?.events,'event','/timeline/events'],[t?.spans,'span','/timeline/spans'],[t?.markers,'marker','/timeline/markers'],
  [c?.items,'item','/comparison/items'],[c?.criteria,'criterion','/comparison/criteria'],
  [m?.axis?.kind==='category'?m.axis.categories:undefined,'category','/metric/axis/categories'],[m?.series,'series','/metric/series']
 ];
 for(const[list,sort,path]of declarations)each(list,path,(item,at)=>declare(item.id,sort,at));
 const groupRoles=v.kind==='sequence'?sequenceRoles:['zone','boundary','lane','tier','region'];
 each(v.groups,'/groups',(group,path)=>{
  resolve(group.parent,['group'],path+'/parent');
  if(!groupRoles.includes(group.role))add('VISUAL_FORM_RULE',path+'/role','A '+v.kind+' group is one of '+groupRoles.join(', '));
 });
 each(v.nodes,'/nodes',(node,path)=>{resolve(node.group,['group'],path+'/group');resolve(node.parent,['node'],path+'/parent');resolve(node.layer,['layer'],path+'/layer');});
 each(v.edges,'/edges',(edge,path)=>{resolve(edge.from,['node'],path+'/from');resolve(edge.to,['node'],path+'/to');});
 each(v.steps,'/steps',(step,path)=>{
  each(step.focus,path+'/focus',(id,at)=>resolve(id,[],at));
  // An unnumbered step's mark says when it happens: its when's words, or its tag.
  if(step.when==='other'&&step.tag===undefined)add('VISUAL_STEPS',path+'/tag','A step whose when is other names it with a tag');
  if(step.tag!==undefined&&step.when===undefined)add('VISUAL_STEPS',path+'/when','A tag marks an unnumbered step; give the step a when');
 });
 each(s?.messages,'/sequence/messages',(message,path)=>{resolve(message.from,['participant'],path+'/from');resolve(message.to,['participant'],path+'/to');resolve(message.group,['group'],path+'/group');});
 // Each entity's fields by displayed name and by stable id; field ids are scoped to their entity.
 const entities=new Map<string,{names:Map<string,VisualField>;ids:Map<string,VisualField>}>();
 each(st?.entities,'/structure/entities',(entity,path)=>{
  resolve(entity.node,['node'],path+'/node');
  if(entities.has(entity.node))add('VISUAL_ID',path+'/node','Entity '+JSON.stringify(entity.node)+' is declared more than once');
  const names=new Map<string,VisualField>(),fieldIds=new Map<string,VisualField>();
  each(entity.fields,path+'/fields',(field,at)=>{
   if(names.has(field.name))add('VISUAL_ID',at+'/name','Field '+JSON.stringify(field.name)+' is declared more than once');names.set(field.name,field);
   if(field.id!==undefined){if(fieldIds.has(field.id))add('VISUAL_ID',at+'/id','Field id '+JSON.stringify(field.id)+' is declared more than once');fieldIds.set(field.id,field);}
  });
  entities.set(entity.node,{names,ids:fieldIds});
 });
 // A cardinality is one of four conventional markers; a multiplicity is the exact bounds. Both may be given, never in conflict.
 const bounds:Record<VisualCardinality,[number,number|undefined]>={'zero-or-one':[0,1],'exactly-one':[1,1],'zero-or-many':[0,undefined],'one-or-many':[1,undefined]};
 each(st?.references,'/structure/references',(reference,path)=>{
  for(const end of ['from','to'] as const){
   const endpoint=reference[end],fields=entities.get(endpoint.node);resolve(endpoint.node,['node'],path+'/'+end+'/node');
   const byName=endpoint.field===undefined?undefined:fields?.names.get(endpoint.field),byId=endpoint.fieldId===undefined?undefined:fields?.ids.get(endpoint.fieldId);
   if(endpoint.field!==undefined&&!byName)add('VISUAL_REFERENCE',path+'/'+end+'/field','Entity '+JSON.stringify(endpoint.node)+' declares no field '+JSON.stringify(endpoint.field));
   if(endpoint.fieldId!==undefined&&!byId)add('VISUAL_REFERENCE',path+'/'+end+'/fieldId','Entity '+JSON.stringify(endpoint.node)+' declares no field id '+JSON.stringify(endpoint.fieldId));
   if(byName&&byId&&byName!==byId)add('VISUAL_REFERENCE',path+'/'+end,'field and fieldId name different fields');
   const multiplicity=reference[(end+'Multiplicity') as 'fromMultiplicity'|'toMultiplicity'],cardinality=reference[(end+'Cardinality') as 'fromCardinality'|'toCardinality'];
   if(!multiplicity)continue;
   if(multiplicity.max!==undefined&&multiplicity.max<multiplicity.min)add('VISUAL_VALUE',path+'/'+end+'Multiplicity/max','The upper bound is below the lower bound');
   else if(cardinality&&(bounds[cardinality][0]!==multiplicity.min||bounds[cardinality][1]!==multiplicity.max))add('VISUAL_VALUE',path+'/'+end+'Cardinality','Cardinality '+cardinality+' contradicts the multiplicity');
  }
 });
 if(sm){
  resolve(sm.initial,['node'],'/state/initial');
  each(sm.final,'/state/final',(id,path)=>resolve(id,['node'],path));
  each(sm.transitions,'/state/transitions',(transition,path)=>{resolve(transition.from,['node'],path+'/from');resolve(transition.to,['node'],path+'/to');});
 }
 if(t){
  const periods=t.scale.kind==='period'?t.scale.periods.map(p=>p.id):undefined;
  // A position on the scale: epoch milliseconds for dates, the period's index otherwise.
  const position=(text:string,path:string):number|undefined=>{
   if(!periods){const value=visualDateValue(text);if(value===undefined)add('VISUAL_DATE',path,JSON.stringify(text)+' is not an ISO-8601 month, date or date-time with offset');return value;}
   const index=periods.indexOf(text);if(index<0)add('VISUAL_REFERENCE',path,'Missing period '+JSON.stringify(text));return index<0?undefined:index;
  };
  each(t.events,'/timeline/events',(event,path)=>{resolve(event.lane,['lane'],path+'/lane');position(event.at,path+'/at');});
  each(t.markers,'/timeline/markers',(marker,path)=>position(marker.at,path+'/at'));
  each(t.spans,'/timeline/spans',(span,path)=>{
   resolve(span.lane,['lane'],path+'/lane');
   const start=position(span.start,path+'/start'),end=position(span.end,path+'/end');
   if(start!==undefined&&end!==undefined&&end<start)add('VISUAL_DATE',path+'/end','The span ends before it starts');
  });
 }
 if(c){
  const criteria=new Map(c.criteria.map(criterion=>[criterion.id,criterion]));
  each(c.criteria,'/comparison/criteria',(criterion,path)=>{
   if((criterion.measure==='rating')!==(criterion.max!==undefined))add('VISUAL_VALUE',path+'/max','A rating criterion, and only a rating criterion, declares max');
  });
  const seen=new Set<string>();
  each(c.values,'/comparison/values',(entry,path)=>{
   resolve(entry.item,['item'],path+'/item');resolve(entry.criterion,['criterion'],path+'/criterion');
   const key=JSON.stringify([entry.item,entry.criterion]);
   if(seen.has(key))add('VISUAL_ID',path,'A second value for item '+JSON.stringify(entry.item)+' and criterion '+JSON.stringify(entry.criterion));seen.add(key);
   const present=(['text','rating','support'] as const).filter(k=>entry[k]!==undefined);
   if(present.length!==1){add('VISUAL_VALUE',path,'A value has exactly one of text, rating or support');return;}
   const criterion=criteria.get(entry.criterion);if(!criterion)return;
   if(present[0]!==criterion.measure)add('VISUAL_VALUE',path+'/'+present[0],'Criterion '+JSON.stringify(criterion.id)+' is measured as '+criterion.measure);
   else if(entry.rating!==undefined&&criterion.max!==undefined&&entry.rating>criterion.max)add('VISUAL_VALUE',path+'/rating','Rating exceeds the criterion maximum '+criterion.max);
  });
  if(c.chosen)resolve(c.chosen.item,['item'],'/comparison/chosen/item');
  if(c.axes){resolve(c.axes.x,['criterion'],'/comparison/axes/x');resolve(c.axes.y,['criterion'],'/comparison/axes/y');}
 }
 if(m?.axis){
  const axis=m.axis;
  each(m.series,'/metric/series',(series,path)=>each(series.points,path+'/points',(point,at)=>{
   if(point.at===undefined)add('VISUAL_VALUE',at,'Points on an axis declare at');
   else if(axis.kind==='time'){if(visualDateValue(point.at)===undefined)add('VISUAL_DATE',at+'/at',JSON.stringify(point.at)+' is not an ISO-8601 month, date or date-time with offset');}
   else resolve(point.at,['category'],at+'/at');
  }));
 }
 // Nesting must terminate.
 const cycles=(items:{id:string;parent?:string}[]|undefined,path:string)=>{
  const parents=new Map((items??[]).map(item=>[item.id,item.parent]));
  each(items,path,(item,at)=>{
   const visited=new Set<string>();let current=item.parent;
   while(current!==undefined&&!visited.has(current)){if(current===item.id){add('VISUAL_CYCLE',at+'/parent',JSON.stringify(item.id)+' contains itself');break;}visited.add(current);current=parents.get(current);}
  });
 };
 cycles(v.nodes,'/nodes');cycles(v.groups,'/groups');
 const problem=(path:string,message:string)=>add('VISUAL_FORM_RULE',path,message);
 formRules[v.form as VisualForm]?.(v,problem);
 return out;
}
type Problem=(path:string,message:string)=>void;
const groupChain=(v:Visual,id:string|undefined)=>{
 const groups=new Map((v.groups??[]).map(g=>[g.id,g]));const chain:VisualGroup[]=[];
 for(let current=id?groups.get(id):undefined;current&&!chain.includes(current);current=current.parent?groups.get(current.parent):undefined)chain.push(current);
 return chain;
};
const complete=(v:Visual,problem:Problem)=>{
 const c=v.comparison;if(!c)return;
 const have=new Set(c.values.map(x=>JSON.stringify([x.item,x.criterion])));
 for(const item of c.items)for(const criterion of c.criteria)if(!have.has(JSON.stringify([item.id,criterion.id])))problem('/comparison/values','Item '+JSON.stringify(item.id)+' has no value for criterion '+JSON.stringify(criterion.id));
};
// Form rules: one entry per form that constrains more than its kind does.
const formRules:Partial<Record<VisualForm,(v:Visual,problem:Problem)=>void>>={
 pipeline:(v,problem)=>{
  const next=new Map<string,string[]>();
  for(const e of v.edges??[])if(e.kind!=='return')next.set(e.from,[...(next.get(e.from)??[]),e.to]);
  const state=new Map<string,'open'|'done'>();
  const visit=(id:string):boolean=>{if(state.get(id)==='open')return true;if(state.get(id)==='done')return false;state.set(id,'open');const found=(next.get(id)??[]).some(visit);state.set(id,'done');return found;};
  if([...next.keys()].some(visit))problem('/edges','A pipeline has no cycle except through return edges');
 },
 zoned:(v,problem)=>{
  each(v.nodes,'/nodes',(node,path)=>{if(node.group===undefined)problem(path,'Every node in a zoned flow is in a group');});
  each(v.groups,'/groups',(group,path)=>{if(group.parent===undefined&&group.tier===undefined)problem(path,'Every root group in a zoned flow has a tier');});
 },
 lanes:(v,problem)=>each(v.nodes,'/nodes',(node,path)=>{if(!groupChain(v,node.group).some(g=>g.role==='lane'))problem(path,'Every node in a lanes flow is in a lane');}),
 stack:(v,problem)=>{
  if(!v.structure?.layers)problem('/structure','A stack declares layers');
  each(v.nodes,'/nodes',(node,path)=>{if(node.layer===undefined)problem(path,'Every node in a stack has a layer');});
 },
 tree:(v,problem)=>{const roots=(v.nodes??[]).filter(n=>n.parent===undefined).length;if(roots!==1)problem('/nodes','A tree has exactly one root; found '+roots);},
 entities:(v,problem)=>{if(!v.structure?.entities)problem('/structure','An entities structure declares entities');},
 lifecycle:(v,problem)=>{
  const sm=v.state;if(!sm)return;
  const main=sm.transitions.filter(x=>x.path==='main');
  if(!main.length){problem('/state/transitions','A lifecycle declares its main path');return;}
  const out=new Map<string,number>(),into=new Map<string,number>();
  for(const x of main){out.set(x.from,(out.get(x.from)??0)+1);into.set(x.to,(into.get(x.to)??0)+1);}
  if([...out.values(),...into.values()].some(n=>n>1)||into.has(sm.initial)){problem('/state/transitions','The main path does not branch or return to the initial state');return;}
  let reached=0;for(let at:string|undefined=sm.initial;at!==undefined&&reached<=main.length;at=main.find(x=>x.from===at)?.to)if(main.some(x=>x.from===at))reached++;
  if(reached!==main.length)problem('/state/transitions','The main path starts at the initial state and is unbroken');
 },
 milestones:(v,problem)=>{if(!v.timeline?.events)problem('/timeline','Milestones declare events');},
 roadmap:(v,problem)=>{
  const t=v.timeline;if(!t)return;
  if(!t.spans)problem('/timeline','A roadmap declares spans');
  if(!t.lanes)problem('/timeline','A roadmap declares lanes');
  each(t.spans,'/timeline/spans',(span,path)=>{if(span.lane===undefined)problem(path,'Every span in a roadmap is in a lane');});
 },
 history:(v,problem)=>{if(v.timeline&&!v.timeline.events&&!v.timeline.spans)problem('/timeline','A history declares events or spans');},
 matrix:complete,
 'before-after':(v,problem)=>{if(v.comparison&&v.comparison.items.length!==2)problem('/comparison/items','Before-after compares exactly two items');complete(v,problem);},
 quadrant:(v,problem)=>{
  const c=v.comparison;if(!c)return;
  if(!c.axes){problem('/comparison','A quadrant declares axes');return;}
  for(const axis of ['x','y'] as const){
   const criterion=c.criteria.find(x=>x.id===c.axes![axis]);
   if(criterion&&(criterion.measure!=='rating'||criterion.low===undefined||criterion.high===undefined))problem('/comparison/axes/'+axis,'A quadrant axis is a rating criterion with low and high labels');
   if(criterion)for(const item of c.items)if(!c.values.some(x=>x.item===item.id&&x.criterion===criterion.id&&x.rating!==undefined))problem('/comparison/values','Item '+JSON.stringify(item.id)+' is not rated on '+JSON.stringify(criterion.id));
  }
 },
 stat:(v,problem)=>{const m=v.metric;if(!m)return;if(m.series.length!==1)problem('/metric/series','A stat shows exactly one series');if(!m.good)problem('/metric','A stat declares which direction is good');},
 bar:(v,problem)=>{if(v.metric&&!v.metric.axis)problem('/metric','A bar chart declares its axis');},
 line:(v,problem)=>{
  const m=v.metric;if(!m)return;if(!m.axis)problem('/metric','A line chart declares its axis');
  each(m.series,'/metric/series',(series,path)=>{if(series.points.length<2)problem(path+'/points','A line has at least two points');});
 },
 meter:(v,problem)=>{const m=v.metric;if(!m)return;if(m.series.length!==1)problem('/metric/series','A meter shows exactly one series');if(m.target===undefined)problem('/metric','A meter declares its target');if(!m.good)problem('/metric','A meter declares which direction is good');}
};
// Composition advice: legibility guidance, not validity, so it never makes a visual incomplete.
function advise(payload:unknown):Diagnostic[]{
 const v=payload as Partial<Visual>|undefined,out:Diagnostic[]=[];const at='/extensions/'+VISUAL_EXTENSION;
 if(!v||typeof v!=='object')return out;
 if(graphKinds.includes(v.kind as VisualKind)&&Array.isArray(v.nodes)){
  if(v.nodes.length>SPLIT_NODES)out.push({code:'VISUAL_SPLIT',path:at+'/nodes',message:v.nodes.length+' nodes; above fifteen, split the visual',severity:'warning'});
  else if(v.nodes.length>ADVISED_NODES)out.push({code:'VISUAL_DENSITY',path:at+'/nodes',message:v.nodes.length+' nodes; five to seven read best',severity:'warning'});
 }
 const participants=v.sequence?.participants;
 if(Array.isArray(participants)&&participants.length>ADVISED_PARTICIPANTS)out.push({code:'VISUAL_DENSITY',path:at+'/sequence/participants',message:participants.length+' participants; a sequence reads best with eight or fewer',severity:'warning'});
 return out;
}
export function visualRegistry():Registry{return legacyRegistry().register(latestVisualPackage,semantics);}
// Registration compiles the payload schema; the API reuses one registry, which nothing mutates after registration.
let shared:Registry|undefined;
const registry=()=>shared??=visualRegistry();
export function inspectVisual(document:Document):VisualInspection{return {...validateDocument(document,registry()),advice:document.vocabularies[VISUAL_EXTENSION]?.version===VISUAL_VERSION?inspectLegacy(document).advice:advise(document.extensions?.[VISUAL_EXTENSION])};}
function requireProfile(doc:Document):void {
 const payload=doc.extensions?.[VISUAL_EXTENSION];
 if(![VISUAL_VERSION,LATEST_VISUAL_VERSION].includes(doc.vocabularies[VISUAL_EXTENSION]?.version??'')||!payload||typeof payload!=='object'||Array.isArray(payload))throw new UmfError('VISUAL_PROFILE','Expected umf.visual 1.0.0 or 1.1.0 and a document-level visual');
}
function requireValid(doc:Document):void {const result=inspectVisual(doc);if(!result.valid)throw new UmfError('VISUAL_DOCUMENT',JSON.stringify(result.diagnostics));}
export function readVisualDocument(text:string,format:'json'|'yaml'='yaml'):Document{const doc=readDocument(text,format);requireProfile(doc);requireValid(doc);return doc;}
export function writeVisualDocument(doc:Document,format:'json'|'yaml'='yaml'):string{requireProfile(doc);requireValid(doc);return writeDocument(doc,format);}
export function createVisualDocument(visual:Visual,id='visual:'+visual.id,version:VisualVersion=VISUAL_VERSION):Document{
 const doc={umf:visualPackage.coreVersion,id,vocabularies:{[VISUAL_EXTENSION]:{version}},extensions:{[VISUAL_EXTENSION]:copyJson(visual as unknown as Json)},modules:[]} as unknown as Document;
 requireProfile(doc);requireValid(doc);return doc;
}
export function getVisual(doc:Document):Visual{requireProfile(doc);return copyJson(doc.extensions![VISUAL_EXTENSION]!) as unknown as Visual;}
export function editVisual(doc:Document,update:(visual:Visual)=>Visual):Document{
 requireProfile(doc);
 const initial=validateDocument(doc,registry());
 if(!initial.valid||!initial.complete)throw new UmfError('UNSAFE_EDIT','All present semantics must be validated before editing');
 const result=copyJson(doc) as unknown as Document;
 result.extensions![VISUAL_EXTENSION]=copyJson(update(getVisual(doc)) as unknown as Json);
 const checked=validateDocument(result,registry());
 if(!checked.valid||!checked.complete)throw new UmfError('INVALID_EDIT',JSON.stringify(checked.diagnostics));
 return result;
}

/** Explicit opt-in to corrected 1.1 semantics; never rewrites source or native companions. */
export function upgradeVisualDocument(document:Document):Document {
 requireProfile(document);
 const result=copyJson(document) as unknown as Document;
 result.vocabularies[VISUAL_EXTENSION]={...result.vocabularies[VISUAL_EXTENSION],version:LATEST_VISUAL_VERSION};
 requireValid(result);return result;
}
