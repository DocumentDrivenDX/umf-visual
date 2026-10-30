// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson,type Document} from '@umf/core';
import {createVisualDocument,getVisual,inspectVisual,type Visual} from '../../extensions/visual';
import {annotationIdForPath,candidateAnnotationPaths,compileAnnotations,decodeAnnotationValue,encodeAnnotationValue,verifyAnnotationReadback,type AnnotationEntry,type AnnotationValue,type ProjectionCoverage} from '../annotations';
import {annotationOwnerName,applyAnnotationEntries} from '../annotations/projection';
import type {IdentityMapping,InterchangeDiagnostic} from '../types';
import {parseLiniComparison,serializeLiniComparison,type LiniComparisonForm} from './comparison';
import {parseLiniMetric,serializeLiniMetric,type LiniMetricForm} from './metric';
import {parseLiniTimeline,serializeLiniTimeline,type LiniTimelineForm} from './timeline';
import {quoteLiniProfile as q,readLiniProfile,type LiniProfileNode} from './profile-syntax';

export const LINI_ANNOTATED_PROFILE='umf.visual.lini.annotated/1' as const;
export interface AnnotatedLiniResult {text?:string;document?:Document;identityMap:IdentityMapping[];coverage:ProjectionCoverage[];diagnostics:InterchangeDiagnostic[];}
const failure=(message:string,path='/source'):AnnotatedLiniResult=>({identityMap:[],coverage:[],diagnostics:[{code:'LINI_ANNOTATED_PROFILE',path,message,severity:'error',loss:false}]});
const canonical=(value:unknown):string=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function nativeShape(nodes:LiniProfileNode[]):string {
 const normalize=(node:LiniProfileNode):unknown=>({...node,properties:[...node.properties].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0).map(p=>({name:p.name,value:p.value.map(t=>({kind:t.kind,value:t.kind==='number'?String(Number(t.value)):t.value}))})),children:node.children.map(normalize)});
 return canonical(nodes.map(normalize));
}
const hex=(value:string)=>Array.from(new TextEncoder().encode(value),byte=>byte.toString(16).padStart(2,'0')).join('');
function unhex(value:string):string {
 if(!value||value.length%2||!/^[0-9a-f]+$/.test(value))throw new Error('Invalid annotation path identity');
 const decoded=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(value.match(/../g)!,byte=>parseInt(byte,16)));if(hex(decoded)!==value)throw new Error('Noncanonical annotation path identity');return decoded;
}
function intrinsic(visual:Visual){
 if(visual.kind==='comparison')return serializeLiniComparison(visual);
 if(visual.kind==='metric')return serializeLiniMetric(visual);
 if(visual.kind==='timeline')return serializeLiniTimeline(visual);
 throw new Error('This annotated Lini profile has not qualified this diagram family yet.');
}
function readIntrinsic(nodes:LiniProfileNode[],kind:string,form:string){
 if(kind==='comparison'&&['matrix','before-after','quadrant'].includes(form)){const parsed=parseLiniComparison(nodes,form as LiniComparisonForm);return {...parsed,visual:parsed.comparison?{comparison:parsed.comparison}:undefined};}
 if(kind==='metric'&&['stat','bar','line','meter'].includes(form)){const parsed=parseLiniMetric(nodes,form as LiniMetricForm);return {...parsed,visual:parsed.metric?{metric:parsed.metric}:undefined};}
 if(kind==='timeline'&&['history','milestones','roadmap'].includes(form)){const parsed=parseLiniTimeline(nodes,form as LiniTimelineForm);return {...parsed,visual:parsed.timeline?{timeline:parsed.timeline}:undefined};}
 throw new Error('Unqualified Lini intrinsic family.');
}
function header(visual:Visual,documentId:string):string {
 return 'Profile: '+LINI_ANNOTATED_PROFILE+'\nModel: 1.0.0\nKind: '+visual.kind+'\nForm: '+visual.form+'\nVisual: '+JSON.stringify(visual.id)+'\nDocument: '+JSON.stringify(documentId);
}
function emitAnnotatedLini(input:Document):AnnotatedLiniResult {
 try{
  const document=copyJson(input) as Document,checked=inspectVisual(document);if(!checked.valid||!checked.complete)throw new Error('A complete valid source document is required');
  if(canonical(document.vocabularies)!==canonical({'umf.visual':{version:'1.0.0'}}))throw new Error('This profile qualifies only frozen visual 1.0.0 and its canonical vocabulary declaration');
  const visual=getVisual(document),native=intrinsic(visual);if(native.diagnostics.some(d=>d.severity==='error'))return {identityMap:[],coverage:[],diagnostics:native.diagnostics};
  if(visual.title!==undefined&&visual.title.trim()!==visual.title)throw new Error('Boundary whitespace in visible titles is outside the pinned native profile');
  const represented=new Set(native.coverage.filter(c=>c.aspect==='value'||c.aspect==='identity').map(c=>c.path));
  const entries=compileAnnotations(document,'1.0.0',candidateAnnotationPaths(document,'1.0.0').filter(path=>!represented.has(path)));
  const lines=['|group#umf_visual| { layout: grid; columns: repeat(1); gap: 24; padding: 24; } [','|block#umf_profile| '+q(header(visual,document.id))+';'];
  if(visual.title!==undefined)lines.push('|block#umf_title| '+q(visual.title)+';');
  lines.push(...native.statements,'|table#umf_annotations| "UMF annotations /1" { columns: 360, 800; } [','|cell#umf_annotation_key| "Property"; |cell#umf_annotation_value| "Typed value";');
  for(const entry of entries){const wire=encodeAnnotationValue(entry.value),suffix=hex(entry.path)+'_'+wire.type;
   lines.push('|cell#ann_key_'+suffix+'| '+q(annotationOwnerName(entry.path,visual))+'; |cell#ann_value_'+suffix+'| '+q(wire.value)+';');
  }
  lines.push(']',']');return {text:lines.join('\n')+'\n',identityMap:native.identityMap,coverage:[],diagnostics:[]};
 }catch(reason){return failure(reason instanceof Error?reason.message:String(reason),'/');}
}

export function parseAnnotatedLini(source:string):AnnotatedLiniResult {
 try{
  const roots=readLiniProfile(source);if(roots.length!==1||roots[0].type!=='group'||roots[0].id!=='umf_visual'||roots[0].label!==undefined)throw new Error('Missing qualified Lini profile owner');
  const root=roots[0],profile=root.children[0];if(profile?.type!=='block'||profile.id!=='umf_profile'||profile.label===undefined||profile.children.length||profile.properties.length)throw new Error('Missing explicit visible profile header');
  const match=/^Profile: umf\.visual\.lini\.annotated\/1\nModel: 1\.0\.0\nKind: ([a-z]+)\nForm: ([a-z-]+)\nVisual: (.*)\nDocument: (.*)$/.exec(profile.label);if(!match)throw new Error('Unknown or malformed Lini profile/model header');
  const [,kind,form,visualIdWire,documentIdWire]=match,visualId:unknown=JSON.parse(visualIdWire),documentId:unknown=JSON.parse(documentIdWire);if(typeof visualId!=='string'||typeof documentId!=='string')throw new Error('Malformed native document identities');
  const titles=root.children.filter(n=>n.id==='umf_title');if(titles.length>1||titles.some(n=>n.type!=='block'||n.label===undefined||n.children.length||n.properties.length))throw new Error('Invalid native title');
  const tables=root.children.filter(n=>n.id==='umf_annotations');if(tables.length!==1||tables[0].type!=='table'||tables[0].label!=='UMF annotations /1')throw new Error('Missing annotation table');const table=tables[0],cells=table.children;
  if(cells.length<4||cells.length%2||cells.some(n=>n.type!=='cell'||n.label===undefined||n.properties.length||n.children.length)||cells[0].id!=='umf_annotation_key'||cells[0].label!=='Property'||cells[1].id!=='umf_annotation_value'||cells[1].label!=='Typed value')throw new Error('Malformed typed annotation rows');
  const parsed=readIntrinsic(root.children.filter(n=>n.id!=='umf_profile'&&n.id!=='umf_title'&&n.id!=='umf_annotations'),kind,form);
  if(!parsed.visual||parsed.diagnostics.some(d=>d.severity==='error'))return {identityMap:[],coverage:[],diagnostics:parsed.diagnostics};
  const document=createVisualDocument({id:visualId,question:'Annotation readback pending',kind,form,...(titles.length?{title:titles[0].label}:{}),...parsed.visual} as Visual,documentId);delete (document as any).extensions['umf.visual'].question;
  const entries:AnnotationEntry[]=[],locators:Record<string,{id:string;slot:string}[]>={};
  for(let i=2;i<cells.length;i+=2){const key=cells[i],value=cells[i+1],descriptor=/^ann_key_([0-9a-f]+)_(string|number|boolean|null|array|object)$/.exec(key.id);if(!descriptor||value.id!=='ann_value_'+descriptor[1]+'_'+descriptor[2])throw new Error('Annotation identity/column mismatch');
   const path=unhex(descriptor[1]),id=annotationIdForPath(path);entries.push({id,path,name:path.split('/').at(-1)!.replace(/~1/g,'/').replace(/~0/g,'~'),value:decodeAnnotationValue(descriptor[2] as AnnotationValue['kind'],value.label!)});locators[id]=[{id:value.id,slot:'table#umf_annotations/cell#'+value.id}];
  }
  compileAnnotations(document,'1.0.0',entries.map(e=>e.path));verifyAnnotationReadback(entries,entries,locators);applyAnnotationEntries(document,entries);
  const visual=getVisual(document);for(let i=0;i<entries.length;i++)if(cells[2+i*2].label!==annotationOwnerName(entries[i].path,visual))throw new Error('Visible annotation owner differs from native path identity');
  const checked=inspectVisual(document);if(!checked.valid||!checked.complete)throw new Error('Native profile does not derive a complete valid visual document');
  const expected=compileAnnotations(document,'1.0.0',entries.map(e=>e.path)),annotationCoverage=verifyAnnotationReadback(expected,entries,locators),regenerated=emitAnnotatedLini(document);
  if(!regenerated.text||nativeShape(readLiniProfile(regenerated.text))!==nativeShape(roots))throw new Error('Native content is outside the canonical qualified profile; presentation or meaning would be omitted.');
  return {document,identityMap:parsed.identityMap,coverage:[...parsed.coverage,...annotationCoverage],diagnostics:parsed.diagnostics.filter(d=>!d.loss||d.code!=='LINI_TIMELINE_ANNOTATION')};
 }catch(reason){return failure(reason instanceof Error?reason.message:String(reason));}
}
export function serializeAnnotatedLini(document:Document):AnnotatedLiniResult {
 const emitted=emitAnnotatedLini(document);if(!emitted.text)return emitted;const parsed=parseAnnotatedLini(emitted.text);
 if(!parsed.document||parsed.diagnostics.some(d=>d.severity==='error'))return parsed;
 if(canonical(parsed.document)!==canonical(document))return failure('Native/profile readback differs from source; unrepresented meaning remains.','/');return {...parsed,text:emitted.text};
}
