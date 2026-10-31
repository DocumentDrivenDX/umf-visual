// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson,type Document} from '@umf/core';
import {createVisualDocument,getVisual,inspectVisual,type Visual} from '../../extensions/visual';
import {annotationIdForPath,candidateAnnotationPaths,compileAnnotations,decodeAnnotationValue,encodeAnnotationValue,verifyAnnotationReadback,type AnnotationEntry,type AnnotationValue,type ProjectionCoverage} from '../annotations';
import {annotationOwnerName,applyAnnotationEntries} from '../annotations/projection';
import type {IdentityMapping,InterchangeDiagnostic} from '../types';
import {liniAdapter} from './index';
import {parseLiniComparison,serializeLiniComparison,type LiniComparisonForm} from './comparison';
import {parseLiniMetric,serializeLiniMetric,type LiniMetricForm} from './metric';
import {parseLiniTimeline,serializeLiniTimeline,type LiniTimelineForm} from './timeline';
import {quoteLiniProfile as q,readLiniProfile,type LiniProfileNode} from './profile-syntax';

export const LINI_ANNOTATED_PROFILE='umf.visual.lini.annotated/1' as const;
export interface AnnotatedLiniResult {text?:string;document?:Document;identityMap:IdentityMapping[];coverage:ProjectionCoverage[];diagnostics:InterchangeDiagnostic[];}
const failure=(message:string,path='/source'):AnnotatedLiniResult=>({identityMap:[],coverage:[],diagnostics:[{code:'LINI_ANNOTATED_PROFILE',path,message,severity:'error',loss:false}]});
const pipelineLayoutLoss=(form:string):InterchangeDiagnostic[]=>form==='pipeline'?[{code:'LINI_PIPELINE_LAYOUT_LOSS',path:'/extensions/umf.visual/form',message:'The Visual pipeline form is retained in the visible profile header, but native Lini has no qualified pipeline-specific geometry here; this rendering uses a generic directed graph layout.',severity:'warning',loss:true}]:[];
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
interface IntrinsicSerialization {statements:string[];identityMap:IdentityMapping[];coverage:ProjectionCoverage[];diagnostics:InterchangeDiagnostic[];}
function intrinsic(visual:Visual):IntrinsicSerialization {
 if(visual.kind==='flow'&&['network','pipeline'].includes(visual.form)){
  const result=liniAdapter.serialize({...visual,title:undefined} as Visual,{id:visual.id,question:visual.question});
  return{statements:result.text?.trimEnd().split('\n').slice(1)??[],identityMap:result.identityMap,coverage:[],diagnostics:result.diagnostics};
 }
 if(visual.kind==='comparison')return serializeLiniComparison(visual);
 if(visual.kind==='metric')return serializeLiniMetric(visual);
 if(visual.kind==='timeline')return serializeLiniTimeline(visual);
 throw new Error('This annotated Lini profile has not qualified this diagram family yet.');
}
function qualifyFlowIdentity(kind:string,nativeId:string):string {
 const prefix='umf_visual.umf_graph.';
 if(kind==='node')return prefix+nativeId;
 const match=/^([A-Za-z_][A-Za-z0-9_.]*)->([A-Za-z_][A-Za-z0-9_.]*)#([1-9][0-9]*)$/.exec(nativeId);
 if(!match)throw new Error('Malformed native link occurrence identity');
 return prefix+match[1]+'->'+prefix+match[2]+'#'+match[3];
}
interface FlowIdentityBinding {kind:'node'|'edge';nativeId:string;visualId:string;}
function parseIdentityTable(node:LiniProfileNode|undefined):FlowIdentityBinding[] {
 if(!node||node.type!=='table'||node.label!=='UMF identities /1'||node.properties.length!==1||node.properties[0]?.name!=='columns'||node.properties[0]?.value.map(token=>token.value).join('')!=='360,800')throw new Error('Missing qualified flow identity table');
 const cells=node.children;if(cells.length<4||cells.length%2||cells.some(cell=>cell.type!=='cell'||cell.label===undefined||cell.properties.length||cell.children.length)||cells[0]?.id!=='umf_identity_native'||cells[0]?.label!=='Native identity'||cells[1]?.id!=='umf_identity_visual'||cells[1]?.label!=='Visual identity')throw new Error('Malformed flow identity rows');
 const result:FlowIdentityBinding[]=[],seen=new Set<string>();
 for(let i=2;i<cells.length;i+=2){const native=cells[i]!,visual=cells[i+1]!,expectedIndex=(i-2)/2;if(native.id!=='umf_identity_native_'+expectedIndex||visual.id!=='umf_identity_visual_'+expectedIndex)throw new Error('Flow identity row ids are not canonical');const match=/^(node|edge):(.+)$/.exec(native.label!);if(!match||!visual.label||seen.has(match[1]+'\0'+match[2])||result.some(row=>row.visualId===visual.label))throw new Error('Flow identity row is empty or duplicated');seen.add(match[1]+'\0'+match[2]);result.push({kind:match[1] as FlowIdentityBinding['kind'],nativeId:match[2]!,visualId:visual.label!});}
 return result;
}
function writeFlowNodes(graph:LiniProfileNode):string {
 if(graph.type!=='group'||graph.id!=='umf_graph'||graph.label!==undefined||graph.children.length===0)throw new Error('Malformed native flow group');
 const lines:string[]=[];
 for(const child of graph.children){
  if(child.type==='block'){
   if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(child.id)||child.label===undefined||child.children.length||child.properties.some(property=>property.name!=='hint'||property.value.length!==1||property.value[0]?.kind!=='string'))throw new Error('Unsupported native flow block or style');
   const hint=child.properties.find(property=>property.name==='hint')?.value[0]?.value;
   lines.push('|block#'+child.id+'| '+q(child.label)+(hint===undefined?'':' { hint: '+q(hint)+'; }'));
  }else if(child.type==='link'){
   const properties=new Map(child.properties.map(property=>[property.name,property.value]));if(child.children.length||[...properties.keys()].some(name=>!['from','operator','to','label'].includes(name)))throw new Error('Unsupported native flow link property');
   const read=(name:string)=>{const value=properties.get(name);if(!value||value.length!==1||value[0]!.kind!=='word'&&value[0]!.kind!=='symbol'&&value[0]!.kind!=='string')throw new Error('Malformed native flow link');return value[0]!.value;};
   const from=read('from'),operator=read('operator'),to=read('to'),label=properties.get('label');if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(from)||!['->','-'].includes(operator)||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(to))throw new Error('Unsupported native link endpoints or direction');
   if(label!==undefined&&(label.length!==1||label[0]!.kind!=='string'))throw new Error('Malformed native link label');lines.push(from+' '+operator+' '+to+(label===undefined?'':' '+q(label[0]!.value)));
  }else throw new Error('Unexpected child in native flow group');
 }
 return lines.join('\n')+'\n';
}
function readFlow(nodes:LiniProfileNode[],form:string,id:string,question:string,bindings:FlowIdentityBinding[]){
 const groups=nodes.filter(node=>node.id==='umf_graph');if(groups.length!==1||nodes.length!==1)throw new Error('Flow profile requires exactly one intrinsic graph group');
 const source=writeFlowNodes(groups[0]!),parsed=liniAdapter.parse(source,{id,question}),visual=parsed.visual;
 if(!visual||visual.kind!=='flow'||visual.form!=='network'||parsed.diagnostics.some(item=>item.severity==='error'))return{diagnostics:parsed.diagnostics,identityMap:[],coverage:[],visual:undefined};
 const actual=parsed.identityMap.filter(item=>item.kind==='node'||item.kind==='edge').map(item=>({kind:item.kind as FlowIdentityBinding['kind'],nativeId:qualifyFlowIdentity(item.kind,item.nativeId),visualId:item.visualId}));
 if(actual.length!==bindings.length||actual.some(item=>!bindings.some(binding=>binding.kind===item.kind&&binding.nativeId===item.nativeId))||bindings.some(binding=>!actual.some(item=>item.kind===binding.kind&&item.nativeId===binding.nativeId)))throw new Error('Flow identity bindings do not match native nodes and edge occurrences');
 const byNative=new Map(bindings.map(binding=>[binding.nativeId,binding.visualId])),nodeIds=new Map<string,string>();
 const nativeNodeMap=parsed.identityMap.filter(item=>item.kind==='node');
 for(const mapping of nativeNodeMap){const native=qualifyFlowIdentity('node',mapping.nativeId),visualId=byNative.get(native);if(!visualId)throw new Error('Missing native node identity binding');nodeIds.set(mapping.visualId,visualId);}
 const mappedNodes=(visual.nodes??[]).map(node=>({...node,id:nodeIds.get(node.id)!}));if(mappedNodes.some(node=>!node.id))throw new Error('Flow node identity was not recovered');
 const mappedEdges=(visual.edges??[]).map(edge=>{const mapping=parsed.identityMap.find(item=>item.kind==='edge'&&item.visualId===edge.id);if(!mapping)throw new Error('Flow edge occurrence has no native identity');const native=qualifyFlowIdentity('edge',mapping.nativeId),visualId=byNative.get(native),from=nodeIds.get(edge.from),to=nodeIds.get(edge.to);if(!visualId||!from||!to)throw new Error('Flow edge identity or endpoint was not recovered');return {...edge,id:visualId,from,to};});
 const flow:Visual={...visual,nodes:mappedNodes,edges:mappedEdges,form:form as Visual['form']};
 const coverage:ProjectionCoverage[]=[];
 const locator=(kind:'node'|'edge',nativeId:string)=>({id:nativeId,slot:kind==='node'?'block#'+nativeId:'link#'+nativeId});
 const path='/extensions/umf.visual';
 for(const[index,node]of mappedNodes.entries()){const mapping=nativeNodeMap[index];if(!mapping)throw new Error('Flow node has no native identity mapping');const nativeId=qualifyFlowIdentity('node',mapping.nativeId),rowIndex=bindings.findIndex(row=>row.kind==='node'&&row.nativeId===nativeId);if(rowIndex<0)throw new Error('Flow node has no visible identity binding');const loc=locator('node',nativeId);coverage.push({path:path+'/nodes/'+index+'/id',aspect:'identity',representation:'profile-annotation',native:[{id:'umf_identity_visual_'+rowIndex,slot:'cell'}]},{path:path+'/nodes/'+index+'/label',aspect:'value',representation:'native-concept',native:[loc]});if(node.detail!==undefined)coverage.push({path:path+'/nodes/'+index+'/detail',aspect:'value',representation:'native-concept',native:[loc]});}
 for(const[index,edge]of mappedEdges.entries()){const nativeRow=bindings.find(row=>row.kind==='edge'&&row.visualId===edge.id);if(!nativeRow)throw new Error('Flow edge identity binding was not recovered');const loc=locator('edge',nativeRow.nativeId);coverage.push({path:path+'/edges/'+index+'/id',aspect:'identity',representation:'profile-annotation',native:[{id:'umf_identity_visual_'+bindings.indexOf(nativeRow),slot:'cell'}]},{path:path+'/edges/'+index+'/from',aspect:'value',representation:'native-concept',native:[loc]},{path:path+'/edges/'+index+'/to',aspect:'value',representation:'native-concept',native:[loc]});if(edge.label!==undefined)coverage.push({path:path+'/edges/'+index+'/label',aspect:'value',representation:'native-concept',native:[loc]});}
 const identityMap=parsed.identityMap.map(item=>{const match=/\/(nodes|edges)\/(\d+)\/id$/.exec(item.path),index=match?Number(match[2]):-1;if(item.kind==='node')return {...item,nativeId:qualifyFlowIdentity('node',item.nativeId),visualId:mappedNodes[index]?.id??item.visualId};if(item.kind==='edge')return {...item,nativeId:qualifyFlowIdentity('edge',item.nativeId),visualId:mappedEdges[index]?.id??item.visualId};return item;});
 return{visual:{nodes:flow.nodes,edges:flow.edges},identityMap,coverage,diagnostics:parsed.diagnostics};
}
function readIntrinsic(nodes:LiniProfileNode[],kind:string,form:string,id:string,question:string,bindings?:FlowIdentityBinding[]){
 if(kind==='flow'&&['network','pipeline'].includes(form))return readFlow(nodes,form,id,question,bindings??[]);
 if(kind==='comparison'&&['matrix','before-after','quadrant'].includes(form)){const parsed=parseLiniComparison(nodes,form as LiniComparisonForm);return {...parsed,visual:parsed.comparison?{comparison:parsed.comparison}:undefined};}
 if(kind==='metric'&&['stat','bar','line','meter'].includes(form)){const parsed=parseLiniMetric(nodes,form as LiniMetricForm);return {...parsed,visual:parsed.metric?{metric:parsed.metric}:undefined};}
 if(kind==='timeline'&&['history','milestones','roadmap'].includes(form)){const parsed=parseLiniTimeline(nodes,form as LiniTimelineForm);return {...parsed,visual:parsed.timeline?{timeline:parsed.timeline}:undefined};}
 throw new Error('Unqualified Lini intrinsic family.');
}
function header(visual:Visual,documentId:string):string {
 return 'Profile: '+LINI_ANNOTATED_PROFILE+'\nModel: 1.0.0\nKind: '+visual.kind+'\nForm: '+visual.form+'\nVisual: '+JSON.stringify(visual.id)+'\nDocument: '+JSON.stringify(documentId);
}
const trimLini=(value:string)=>value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu,'');
function emitAnnotatedLini(input:Document):AnnotatedLiniResult {
 try{
  const document=copyJson(input) as Document,checked=inspectVisual(document);if(!checked.valid||!checked.complete)throw new Error('A complete valid source document is required');
  if(canonical(document.vocabularies)!==canonical({'umf.visual':{version:'1.0.0'}}))throw new Error('This profile qualifies only frozen visual 1.0.0 and its canonical vocabulary declaration');
  const visual=getVisual(document),native=intrinsic(visual);if(native.diagnostics.some(d=>d.severity==='error'))return {identityMap:[],coverage:[],diagnostics:native.diagnostics};
  if(visual.title!==undefined&&trimLini(visual.title)!==visual.title)throw new Error('Boundary whitespace in visible titles is outside the pinned native profile');
  const represented=new Set(native.coverage.filter(c=>c.aspect==='value'||c.aspect==='identity').map(c=>c.path));
  if(visual.kind==='flow'){
   for(const[index,node]of (visual.nodes??[]).entries())for(const key of ['id','label','detail'] as const)if(node[key]!==undefined)represented.add('/extensions/umf.visual/nodes/'+index+'/'+key);
   for(const[index,edge]of (visual.edges??[]).entries())for(const key of ['id','from','to','label'] as const)if(edge[key]!==undefined)represented.add('/extensions/umf.visual/edges/'+index+'/'+key);
  }
  const entries=compileAnnotations(document,'1.0.0',candidateAnnotationPaths(document,'1.0.0').filter(path=>!represented.has(path)));
  const lines=['|group#umf_visual| { layout: grid; columns: repeat(1); gap: 24; padding: 24; } [','|block#umf_profile| '+q(header(visual,document.id))+';'];
  if(visual.title!==undefined)lines.push('|block#umf_title| '+q(visual.title)+';');
  if(visual.kind==='flow'){
   lines.push('|group#umf_graph| { layout: grid; columns: repeat(2); gap: 100 140; clearance: 16; padding: 32; } [',...native.statements,']');
   const bindings=native.identityMap.filter(item=>item.kind==='node'||item.kind==='edge').map(item=>({kind:item.kind as FlowIdentityBinding['kind'],nativeId:qualifyFlowIdentity(item.kind,item.nativeId),visualId:item.visualId}));
   lines.push('|table#umf_identity| "UMF identities /1" { columns: 360, 800; } [','|cell#umf_identity_native| "Native identity"; |cell#umf_identity_visual| "Visual identity";');
   for(const[index,binding]of bindings.entries())lines.push('|cell#umf_identity_native_'+index+'| '+q(binding.kind+':'+binding.nativeId)+'; |cell#umf_identity_visual_'+index+'| '+q(binding.visualId)+';');
   lines.push(']');
  }else lines.push(...native.statements);
  lines.push('|table#umf_annotations| "UMF annotations /1" { columns: 360, 800; } [','|cell#umf_annotation_key| "Property"; |cell#umf_annotation_value| "Typed value";');
  for(const entry of entries){const wire=encodeAnnotationValue(entry.value),suffix=hex(entry.path)+'_'+wire.type;
   lines.push('|cell#ann_key_'+suffix+'| '+q(annotationOwnerName(entry.path,visual))+'; |cell#ann_value_'+suffix+'| '+q(wire.value)+';');
  }
  lines.push(']',']');const identityMap=visual.kind==='flow'?native.identityMap.map(item=>({...item,nativeId:qualifyFlowIdentity(item.kind,item.nativeId)})):native.identityMap;return {text:lines.join('\n')+'\n',identityMap,coverage:[],diagnostics:[]};
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
  const identityTables=root.children.filter(n=>n.id==='umf_identity'),bindings=kind==='flow'?parseIdentityTable(identityTables[0]):[];if(kind==='flow'&&identityTables.length!==1||kind!=='flow'&&identityTables.length!==0)throw new Error('Flow identity table appears in the wrong profile family');
  const parsed=readIntrinsic(root.children.filter(n=>n.id!=='umf_profile'&&n.id!=='umf_title'&&n.id!=='umf_annotations'&&n.id!=='umf_identity'),kind,form,visualId,documentId,bindings);
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
  const titleCoverage=titles.length?[{path:'/extensions/umf.visual/title',aspect:'value' as const,representation:'profile-annotation' as const,native:[{id:'umf_title',slot:'block'}]}]:[];
  return {document,identityMap:parsed.identityMap,coverage:[...parsed.coverage,...annotationCoverage,...titleCoverage],diagnostics:[...parsed.diagnostics.filter(d=>!d.loss||d.code!=='LINI_TIMELINE_ANNOTATION'),...pipelineLayoutLoss(form)]};
 }catch(reason){return failure(reason instanceof Error?reason.message:String(reason));}
}
export function serializeAnnotatedLini(document:Document):AnnotatedLiniResult {
 const emitted=emitAnnotatedLini(document);if(!emitted.text)return emitted;const parsed=parseAnnotatedLini(emitted.text);
 if(!parsed.document||parsed.diagnostics.some(d=>d.severity==='error'))return parsed;
 if(canonical(parsed.document)!==canonical(document))return failure('Native/profile readback differs from source; unrepresented meaning remains.','/');return {...parsed,text:emitted.text};
}
