// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson,type Document} from '@umf/core';
import {createVisualDocument,getVisual,inspectVisual,type Visual} from '../../extensions/visual';
import {annotationIdForPath,candidateAnnotationPaths,compileAnnotations,decodeAnnotationValue,encodeAnnotationValue,readJsonPointer,verifyAnnotationReadback,type AnnotationEntry,type AnnotationValue,type ProjectionCoverage} from '../annotations';
import type {IdentityMapping,InterchangeDiagnostic} from '../types';
import {annotationOwnerName as ownerName,applyAnnotationEntries as applyEntries} from '../annotations/projection';
import {parseDotSequence,serializeDotSequence} from './sequence';
import {parseDotEntities,serializeDotEntities} from './entities';
import {parseDotFlow,serializeDotFlow} from './flow';
import {parseDotState,serializeDotState} from './state';
import {parseDotStructure,serializeDotStructure} from './structure';
import {quoteDotProfile as q,readDotProfile,type DotProfileGraph,type DotProfileStatement} from './profile-syntax';

export const DOT_ANNOTATED_PROFILE='umf.visual.dot.annotated/1' as const;
const ROOT='/extensions/umf.visual';
export interface AnnotatedDotResult {
 text?:string;document?:Document;identityMap:IdentityMapping[];coverage:ProjectionCoverage[];diagnostics:InterchangeDiagnostic[];
}
const failure=(message:string,path='/source'):AnnotatedDotResult=>({identityMap:[],coverage:[],diagnostics:[{code:'DOT_ANNOTATED_PROFILE',path,message,severity:'error',loss:false}]});
const canonical=(value:unknown):string=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
/** Attribute order is immaterial; statement/containment order is deliberate. */
function nativeShape(graph:DotProfileGraph):string {
 const normalize=(statement:DotProfileStatement):unknown=>statement.kind==='subgraph'?{...statement,statements:statement.statements.map(normalize)}:'attributes' in statement?{...statement,attributes:[...statement.attributes].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)}:statement;
 return canonical({...graph,statements:graph.statements.map(normalize)});
}
const attributes=(statement:Extract<DotProfileStatement,{kind:'node'|'attributes'}>)=>Object.fromEntries(statement.attributes.map(a=>[a.name,a.value]));
function supportedIntrinsic(visual:Visual){
 if(visual.kind==='sequence')return serializeDotSequence(visual);
 if(visual.kind==='structure'&&visual.form==='entities')return serializeDotEntities(visual);
 if(visual.kind==='flow')return serializeDotFlow(visual);
 if(visual.kind==='state')return serializeDotState(visual);
 if(visual.kind==='structure'&&['tree','nested','stack'].includes(visual.form))return serializeDotStructure(visual);
 throw new Error('This annotated DOT profile has not qualified this diagram family yet.');
}
function parseIntrinsic(graph:DotProfileGraph,kind:string,form:string){
 if(kind==='sequence'&&['lifelines','ladder'].includes(form))return parseDotSequence(graph,form as any);
 if(kind==='structure'&&form==='entities')return parseDotEntities(graph);
 if(kind==='flow'&&['network','pipeline','zoned','lanes'].includes(form))return parseDotFlow(graph,form as any);
 if(kind==='state'&&['machine','lifecycle'].includes(form))return parseDotState(graph);
 if(kind==='structure'&&['tree','nested','stack'].includes(form))return parseDotStructure(graph);
 throw new Error('Unqualified DOT intrinsic family.');
}

/** This independent reader is also the export gate. Native data, visible
 * annotations and identity descriptors must reconstruct one valid document. */
export function parseAnnotatedDot(source:string):AnnotatedDotResult {
 try{
  const graph=readDotProfile(source,{entities:true}),statements=[...graph.statements];
  const header=statements.shift();if(header?.kind!=='attributes'||header.target!=='graph')throw new Error('Missing explicit profile header');
  const h=attributes(header),headerKeys=['umf_profile','umf_model','umf_kind','umf_form','umf_visual_id','umf_document_id'];
  if(Object.keys(h).length!==headerKeys.length||Object.keys(h).some(k=>!headerKeys.includes(k))||h.umf_profile!==DOT_ANNOTATED_PROFILE||h.umf_model!=='1.0.0'||graph.id!=='umf_visual')throw new Error('Unknown, missing or mismatched profile/model declaration');
  if(!h.umf_visual_id||!h.umf_document_id)throw new Error('Missing document identity');
  let title:string|undefined;const annotations:Extract<DotProfileStatement,{kind:'node'}>[]=[],intrinsic:DotProfileStatement[]=[];
  for(const statement of statements){
   if(statement.kind==='node'&&statement.id==='__umf_title'){
    if(title!==undefined)throw new Error('Duplicate visual title');const a=attributes(statement);if(Object.keys(a).length!==3||a.umf_kind!=='title'||a.shape!=='plaintext'||a.label===undefined)throw new Error('Invalid visible title');title=a.label;continue;
   }
   if(statement.kind==='subgraph'&&statement.id==='cluster_umf_annotations'){
    if(annotations.length)throw new Error('Duplicate annotation panel');
    for(const child of statement.statements){
     if(child.kind==='attributes'&&child.target==='graph'){
      const a=attributes(child);if(Object.keys(a).length!==2||a.label!=='UMF annotations /1'||a.color!=='#c9d4e2')throw new Error('Invalid annotation panel');continue;
     }
     if(child.kind!=='node')throw new Error('Unexpected statement in annotation panel');annotations.push(child);
    }continue;
   }
   intrinsic.push(statement);
  }
  const parsed=parseIntrinsic({id:graph.id,statements:intrinsic},h.umf_kind,h.umf_form);
  if(!parsed.visual||parsed.diagnostics.some(d=>d.severity==='error'))return {identityMap:[],coverage:[],diagnostics:parsed.diagnostics};
  const visual={id:h.umf_visual_id,kind:h.umf_kind,form:h.umf_form,...(title===undefined?{}:{title}),...parsed.visual} as Visual;
  const document=createVisualDocument({...visual,question:'Annotation readback pending'},h.umf_document_id);
  // The question is deliberately absent until its visible carrier is decoded.
  delete (document as any).extensions['umf.visual'].question;
  const entries:AnnotationEntry[]=[],locators:Record<string,{id:string;slot:string}[]>={};
  for(const node of annotations){
   const a=attributes(node),allowed=['umf_kind','umf_path','umf_type','shape','label'];
   if(Object.keys(a).length!==allowed.length||Object.keys(a).some(k=>!allowed.includes(k))||a.umf_kind!=='annotation'||a.shape!=='note'||node.id!==annotationIdForPath(a.umf_path))throw new Error('Invalid annotation identity/descriptors');
   const separator=a.label.indexOf(' = ');if(separator<0)throw new Error('Missing typed annotation value');
   const value=decodeAnnotationValue(a.umf_type as AnnotationValue['kind'],a.label.slice(separator+3));
   const path=a.umf_path,name=path.split('/').at(-1)!.replace(/~1/g,'/').replace(/~0/g,'~');
   entries.push({id:node.id,path,name,value});locators[node.id]=[{id:node.id,slot:'label'}];
  }
  // A registry check runs before any write. The compiler rejects unknown paths
  // even if they are absent from this partial native reconstruction.
  compileAnnotations(document,'1.0.0',entries.map(e=>e.path));
  verifyAnnotationReadback(entries,entries,locators);applyEntries(document,entries);
  const recovered=getVisual(document);
  for(const [i,node]of annotations.entries())if(attributes(node).label.slice(0,attributes(node).label.indexOf(' = '))!==ownerName(entries[i].path,recovered))throw new Error('Visible annotation owner conflicts with its identity');
  const checked=inspectVisual(document);if(!checked.valid||!checked.complete)throw new Error('Native profile does not derive a complete valid visual document');
  const expected=compileAnnotations(document,'1.0.0',entries.map(e=>e.path));
  const annotationCoverage=verifyAnnotationReadback(expected,entries,locators);
  const regenerated=emitAnnotatedDot(document);
  if(!regenerated.text||nativeShape(readDotProfile(regenerated.text,{entities:true}))!==nativeShape(graph))throw new Error('Native content is outside the qualified canonical profile; presentation or meaning would be omitted.');
  return {document,identityMap:parsed.identityMap,coverage:[...parsed.coverage,...annotationCoverage],diagnostics:parsed.diagnostics.filter(d=>d.code!=='DOT_STRUCTURE_ANNOTATION_REQUIRED')};
 }catch(error){return failure(error instanceof Error?error.message:String(error));}
}

function emitAnnotatedDot(input:Document):AnnotatedDotResult {
 try{
  const document=copyJson(input) as Document,checked=inspectVisual(document);if(!checked.valid||!checked.complete)throw new Error('A complete valid source document is required');
  if(canonical((document as any).vocabularies)!==canonical({'umf.visual':{version:'1.0.0'}}))throw new Error('This profile qualifies only frozen visual model 1.0.0 and its canonical vocabulary declaration');
  const visual=getVisual(document),native=supportedIntrinsic(visual);if(native.diagnostics.some(d=>d.severity==='error'))return {identityMap:[],coverage:[],diagnostics:native.diagnostics};
  const represented=new Set(native.coverage.filter(c=>c.aspect==='value'||c.aspect==='identity').map(c=>c.path));
  const entries=compileAnnotations(document,'1.0.0',candidateAnnotationPaths(document,'1.0.0').filter(path=>!represented.has(path)));
  const lines=['digraph "umf_visual" {','graph [umf_profile='+q(DOT_ANNOTATED_PROFILE)+', umf_model="1.0.0", umf_kind='+q(visual.kind)+', umf_form='+q(visual.form)+', umf_visual_id='+q(visual.id)+', umf_document_id='+q(document.id)+'];',...native.statements];
  if(visual.title!==undefined)lines.push('"__umf_title" [umf_kind="title", shape=plaintext, label='+q(visual.title)+'];');
  lines.push('subgraph "cluster_umf_annotations" {','graph [label="UMF annotations /1", color="#c9d4e2"];');
  for(const entry of entries){const wire=encodeAnnotationValue(entry.value);lines.push(q(entry.id)+' [umf_kind="annotation", umf_path='+q(entry.path)+', umf_type='+q(wire.type)+', shape=note, label='+q(ownerName(entry.path,visual)+' = '+wire.value)+'];');}
  lines.push('}','}');return {text:lines.join('\n')+'\n',identityMap:native.identityMap,coverage:[],diagnostics:[]};
 }catch(error){return failure(error instanceof Error?error.message:String(error),'/');}
}

export function serializeAnnotatedDot(input:Document):AnnotatedDotResult {
 const emitted=emitAnnotatedDot(input);if(!emitted.text)return emitted;
 const readback=parseAnnotatedDot(emitted.text);if(!readback.document||readback.diagnostics.some(d=>d.severity==='error'))return readback;
 if(canonical(readback.document)!==canonical(input))return failure('Native/profile readback differs from the source; unrepresented meaning remains.','/');
 return {...readback,text:emitted.text};
}
