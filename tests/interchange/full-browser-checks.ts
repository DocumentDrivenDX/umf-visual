// SPDX-License-Identifier: MIT OR Apache-2.0
import {exportVisual,importVisual,getVisual,type FullInterchangeProfile} from '../../src';

/** Real browser consumer: complete authored records, edits and replay safety. */
export function runFullBrowserChecks(fixtures:unknown[]){
 const ids=['catalog-canary-flow','catalog-canary-entities','umf-ac-coverage'],checks=[];
 for(const id of ids){
  const source:any=fixtures.find((item:any)=>item.extensions?.['umf.visual']?.id===id);
  if(!source)throw new Error('Missing full-profile browser witness '+id);
  const document=JSON.parse(JSON.stringify(source));
  document.extensions['example.unknown']={empty:[],nested:{quoted:'" · 東京',flag:false}};
  document.vocabularies['example.unknown']={version:'7.1.0'};
  for(const format of ['dot','mermaid','lini'] as const){
   const profile:FullInterchangeProfile=`umf.visual.${format}.full/1`,output=exportVisual(document,{format,profile});
   if(!output.ok||!output.text||output.diagnostics.length)throw new Error('Full browser export failed '+id+'/'+format+': '+JSON.stringify(output.diagnostics));
   const imported=importVisual(output.text,{format,profile,id:'browser-import',question:'What survives?'});
   const canonical=(value:unknown):string=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
   if(!imported.ok||!imported.document||canonical(imported.document)!==canonical(document))throw new Error('Full browser readback differs '+id+'/'+format);
   if(imported.coverage?.length!==output.coverage?.length||!imported.coverage?.length)throw new Error('Full browser native coverage missing');
   const replay=exportVisual(imported.document,{format,profile,source:imported.source,original:true});
   if(!replay.ok||replay.text!==output.text)throw new Error('Full browser byte replay differs');
   imported.document.extensions!['umf.visual']={...getVisual(imported.document),title:'Edited after import'} as any;
   if(exportVisual(imported.document,{format,profile,source:imported.source,original:true}).ok)throw new Error('Changed full browser document replayed stale source');
   checks.push({id,format,wholeDocumentReadback:true,unknownDataPreserved:true,byteReplay:true,staleReplayRefused:true,coveredPaths:output.coverage!.length});
  }
 }
 // Exercise the umbrella's native-source receipt route as well as the complete
 // primitive route above. Source-profile grammar and mapping versions differ.
 for(const [id,format] of [['catalog-canary-supported-flow','dot'],['catalog-canary-flow','lini'],['helix-request','mermaid']] as const){
  const document:any=fixtures.find((item:any)=>item.extensions?.['umf.visual']?.id===id);
  if(!document)throw new Error('Missing native-first browser witness '+id);
  const profile:FullInterchangeProfile=`umf.visual.${format}.full/1`,output=exportVisual(document,{format,profile});
  if(!output.ok||!output.text||output.representation?.tier!=='native-profile'||output.diagnostics.length)throw new Error('Native-first browser export failed '+id+'/'+format);
  const imported=importVisual(output.text,{format,profile,id:'unrelated-context',question:'Unrelated context'});
  const canonical=(value:unknown):string=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
  if(!imported.ok||canonical(imported.document)!==canonical(document)||canonical(imported.representation)!==canonical(output.representation))throw new Error('Native-first browser receipt/readback differs');
  const replay=exportVisual(imported.document,{format,profile,source:imported.source,original:true});
  if(!replay.ok||replay.text!==output.text)throw new Error('Native-first browser byte replay differs');
  checks.push({id,format,tier:'native-profile',sourceProfile:output.representation.sourceProfile,sourceMappingVersion:output.representation.sourceMappingVersion,wholeDocumentReadback:true,byteReplay:true});
 }
 return checks;
}
