// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson,type Document} from '@umf/core';
import {getVisual} from '../../extensions/visual';
import {exportAnnotatedVisual,importAnnotatedVisual} from '../annotated';
import {DOT_ANNOTATED_PROFILE,parseAnnotatedDot} from '../dot/annotated';
import {LINI_ANNOTATED_PROFILE,parseAnnotatedLini} from '../lini/annotated';
import {MERMAID_ANNOTATED_PROFILE,parseAnnotatedMermaid} from '../mermaid/annotated';
import type {IdentityMapping,InterchangeFormat} from '../types';
import type {ProjectionCoverage} from '../annotations';

type AnnotatedProfile=typeof DOT_ANNOTATED_PROFILE|typeof LINI_ANNOTATED_PROFILE|typeof MERMAID_ANNOTATED_PROFILE;
type NativeFirstRepresentation={tier:'native-profile';sourceProfile:AnnotatedProfile;sourceMappingVersion:'0.1.0'|'0.2.0';coverageModel:'native-concepts-and-annotations';wholeDocumentReadback:true};
export interface NativeFirstResult {
 text:string;
 document:Document;
 identityMap:IdentityMapping[];
 coverage:ProjectionCoverage[];
 representation:NativeFirstRepresentation;
}

const profiles:Record<InterchangeFormat,{profile:AnnotatedProfile;sourceMappingVersion:NativeFirstRepresentation['sourceMappingVersion']}>= {
 dot:{profile:DOT_ANNOTATED_PROFILE,sourceMappingVersion:'0.1.0'},
 mermaid:{profile:MERMAID_ANNOTATED_PROFILE,sourceMappingVersion:'0.1.0'},
 lini:{profile:LINI_ANNOTATED_PROFILE,sourceMappingVersion:'0.2.0'},
};
const canonical=(value:unknown):string=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const representation=(format:InterchangeFormat):NativeFirstRepresentation=>({tier:'native-profile',sourceProfile:profiles[format].profile,sourceMappingVersion:profiles[format].sourceMappingVersion,coverageModel:'native-concepts-and-annotations',wholeDocumentReadback:true});

/** Source/render-fidelity qualification boundaries for the umbrella's bounded
 * native-first subset. Keep direct annotated serializers and receipts unchanged;
 * only umbrella dispatch uses these fences to select primitive fallback. */
function nativeFirstEligible(document:unknown,format:InterchangeFormat):boolean {
 let visual:any;try{visual=getVisual(copyJson(document) as Document);}catch{return false;}
 if(format==='dot'&&(visual.kind==='flow'||visual.kind==='structure'&&visual.form==='entities')){
  const labels=visual.kind==='flow'
   ?(visual.edges??[]).map((edge:any)=>edge.label)
   :[...(visual.nodes??[]).map((node:any)=>node.label),...(visual.edges??[]).map((edge:any)=>edge.label),...(visual.structure?.references??[]).map((reference:any)=>reference.label)];
  // These DOT adapters preserve quote/backslash strings in their
  // annotation readback, but Graphviz renders some of those primary captions as
  // escape syntax. The primitive composition has independently witnessed text.
  if(labels.some((label:unknown)=>typeof label==='string'&&/[\\"]/.test(label)))return false;
 }
 if(format==='lini'&&visual.kind==='metric'&&visual.metric?.axis?.kind==='category'){
  // Lini 1.1.0 lowercases chart category captions. Keep title-case labels in
  // visible primitive rows rather than claiming the altered chart labels.
  if(visual.metric.axis.categories.some((category:any)=>typeof category.label==='string'&&category.label!==category.label.toLowerCase()))return false;
 }
 if(format==='lini'&&visual.kind==='flow'&&visual.form==='network'){
  const degree=new Map<string,number>();
  for(const edge of visual.edges??[])for(const endpoint of [edge.from,edge.to])if(typeof endpoint==='string')degree.set(endpoint,(degree.get(endpoint)??0)+1);
  // The observed Beacon graph's degree-nine hub triggers native route and
  // clearance diagnostics. Hub degree >=8 is outside this umbrella's qualified
  // native layout subset; it makes no universal claim about all Lini layouts.
  if([...degree.values()].some(value=>value>=8))return false;
 }
 return true;
}

function recognizedFormat(source:string):InterchangeFormat|undefined {
 const mermaid=/^\s*%%\s*UMF_PROFILE\b/m.test(source);
 const lini=/^\s*\|group#umf_visual\|/m.test(source);
 const dotRoot=/^\s*(?:strict\s+)?digraph\s+(?:"umf_visual"|umf_visual)\s*\{/i.test(source);
 const dotHeader=dotRoot&&/^\s*graph\s*\[[\s\S]*?\bumf_profile\s*=/m.test(source);
 const matches:InterchangeFormat[]=[];if(mermaid)matches.push('mermaid');if(lini)matches.push('lini');if(dotHeader)matches.push('dot');
 if(matches.length>1)throw new TypeError('Source contains conflicting annotated native profile headers');return matches[0];
}
function parseRecognized(source:string,format:InterchangeFormat){
 if(format==='dot')return parseAnnotatedDot(source);
 if(format==='lini')return parseAnnotatedLini(source);
 return parseAnnotatedMermaid(source);
}
function strictRead(source:string,format:InterchangeFormat):NativeFirstResult {
 const selected=profiles[format],parsed=parseRecognized(source,format);
 if(!parsed.document||parsed.diagnostics.some(item=>item.severity==='error'||item.loss))throw new TypeError('Recognized native annotated source failed strict independent whole-document readback: '+parsed.diagnostics.map(item=>item.code).join(', '));
 if(!nativeFirstEligible(parsed.document,format))throw new TypeError(`Recognized ${format} annotated source falls outside native-first visual-fidelity eligibility for its pinned mapping version`);
 const visual=getVisual(parsed.document),imported=importAnnotatedVisual(source,{format,profile:selected.profile,id:visual.id,question:visual.question,mode:'strict'});
 if(!imported.ok||!imported.document||canonical(imported.document)!==canonical(parsed.document)||imported.diagnostics.some(item=>item.severity==='error'||item.loss))throw new TypeError('Recognized native annotated source did not pass strict facade readback: '+imported.diagnostics.map(item=>item.code).join(', '));
 return{text:source,document:imported.document,identityMap:imported.identityMap,coverage:imported.coverage??[],representation:representation(format)};
}

/** Reuse an existing strict native annotated source only when it independently
 * reconstructs the entire input document without reported loss. */
export function tryNativeFirstExport(document:unknown,format:InterchangeFormat):NativeFirstResult|undefined {
 try{
  if(!nativeFirstEligible(document,format))return;
  const selected=profiles[format],exported=exportAnnotatedVisual(document,{format,profile:selected.profile,mode:'strict'});
  if(!exported.ok||!exported.text||exported.diagnostics.some(item=>item.severity==='error'||item.loss))return;
  const readback=strictRead(exported.text,format);if(canonical(readback.document)!==canonical(document))return;
  return readback;
 }catch{return;}
}

/** Undefined means the source has no annotated native-first header. A source
 * with a recognized header is parsed strictly and malformed content throws. */
export function readNativeFirstSource(source:string,format:InterchangeFormat):NativeFirstResult|undefined {
 const recognized=recognizedFormat(source);if(!recognized)return;
 if(recognized!==format)throw new TypeError(`Recognized ${recognized} annotated source cannot be read as ${format}`);
 return strictRead(source,format);
}
