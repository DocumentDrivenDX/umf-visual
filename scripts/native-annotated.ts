// SPDX-License-Identifier: MIT OR Apache-2.0
import {mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readJsonValue,writeJsonValue} from '@umf/core';
import {exportVisual,getVisual,importVisual,readVisualDocument,writeVisualDocument} from '../src';
import {readDotProfile,type DotProfileStatement} from '../src/interchange/dot/profile-syntax';

const profile='umf.visual.dot.annotated/1' as const;
const fixtures:string[]=[];
for(const pattern of ['fixtures/visual/{forms,inventory}/*.json','fixtures/catalog/*.json'])for await(const path of new Bun.Glob(pattern).scan('.')){if(path.endsWith('/index.json'))continue;const d=await Bun.file(path).json();if(!['metric','timeline','comparison'].includes(d.extensions['umf.visual'].kind))fixtures.push(path);}
fixtures.sort();if(fixtures.length!==43)throw new Error('Expected the 43 unchanged DOT-profile examples');
function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
const canonical=(value:unknown):string=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const xmlText=(value:string)=>value.replace(/&(amp|lt|gt|quot|apos|#x[0-9a-f]+|#[0-9]+);/gi,(_,entity:string)=>entity[0]==='#'?String.fromCodePoint(entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1))):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"} as Record<string,string>)[entity]);
async function dot(text:string,format:string):Promise<string>{
 const process=Bun.spawn(['dot','-T'+format],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});process.stdin.write(text);process.stdin.end();
 const [out,err,status]=await Promise.all([new Response(process.stdout).text(),new Response(process.stderr).text(),process.exited]);
 assert(status===0,'Native Graphviz refused source: '+err);return out;
}
const version=Bun.spawn(['dot','-V'],{stdout:'pipe',stderr:'pipe'}),nativeVersion=(await new Response(version.stderr).text()).trim();assert(await version.exited===0,'Graphviz version failed');
const checks=[];await mkdir('.cache/annotated',{recursive:true});
for(const fixture of fixtures){
 const bytes=await Bun.file(fixture).text(),document=readVisualDocument(bytes,'json'),visual=getVisual(document);
 const exported=exportVisual(document,{format:'dot',profile});assert(exported.ok&&exported.text,'Profile export failed for '+fixture+': '+JSON.stringify(exported.diagnostics));
 const text=exported.text,native=JSON.parse(await dot(text,'json')),svg=await dot(text,'svg');
 const objects:any[]=native.objects??[],edges:any[]=native.edges??[];
 const byIndex=new Map(objects.map(object=>[object._gvid,object]));
 const addressExists=(id:string)=>id===native.name||objects.some(o=>o.name===id)||edges.some(e=>e.id===id)||id.includes(':')&&objects.some(o=>o.name===id.slice(0,id.indexOf(':'))&&String(o.label).includes('PORT=\"'+id.slice(id.indexOf(':')+1)+'\"'));
 for(const mapping of exported.identityMap)assert(addressExists(mapping.nativeId),'Unresolvable actual native identity '+visual.id+'/'+mapping.nativeId);
 for(const coverage of exported.coverage??[])for(const locator of coverage.native)assert(addressExists(locator.id),'Unresolvable actual native coverage '+visual.id+'/'+coverage.path+'/'+locator.id);
 // Graphviz's xdot JSON text escapes runs before quotes differently from SVG.
 // Read actual SVG text once through XML entities, rather than treating xdot's
 // serialization artifacts as visible characters.
 const svgGroups=[...svg.matchAll(/<g\b([^>]*class="(?:node|edge|cluster)"[^>]*)>([\s\S]*?)<\/g>/g)].map(match=>({id:/\bid="([^"]+)"/.exec(match[1])?.[1],title:xmlText(/<title>([\s\S]*?)<\/title>/.exec(match[2])?.[1]??''),texts:[...match[2].matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(text=>xmlText(text[1]))}));
 const visible=(object:any)=>{const group=svgGroups.find(group=>object.name?group.title===object.name:object.id&&group.id===object.id);return group?.texts??[...(object._ldraw_??[]),...(object._hldraw_??[])].filter(op=>op.op==='T').map(op=>op.text);};
 // Read annotation expectations from the portable AST, then require the actual
 // independent native renderer to draw every exact visible typed value.
 const annotationStatements:Extract<DotProfileStatement,{kind:'node'}>[]=[];
 for(const statement of readDotProfile(text,{entities:true}).statements)if(statement.kind==='subgraph'&&statement.id==='cluster_umf_annotations')for(const child of statement.statements)if(child.kind==='node')annotationStatements.push(child);
 assert(annotationStatements.length>0,'Missing annotation carriers');
 for(const statement of annotationStatements){
  const label=statement.attributes.find(a=>a.name==='label')!.value,object=objects.find(object=>object.name===statement.id);
  assert(object?.shape==='note'&&visible(object).includes(label),'Graphviz did not visibly draw exact annotation '+fixture+'/'+statement.id+' expected '+JSON.stringify(label)+' got '+JSON.stringify(visible(object)));
 }
 if(visual.kind==='state'){
  const states=objects.filter(object=>object.umf_kind==='state'&&['ellipse','doublecircle'].includes(object.shape)),transitions=edges.filter(edge=>edge.umf_kind==='transition'),initial=edges.filter(edge=>edge.umf_kind==='initial');
  assert(states.length===visual.nodes!.length&&transitions.length===visual.state!.transitions.length&&initial.length===1,'Native state topology count differs');
  assert(byIndex.get(initial[0].tail)?.shape==='point'&&byIndex.get(initial[0].head)?.umf_id===visual.state!.initial,'Native initial marker attachment differs');
  for(const node of visual.nodes!){const rendered=states.find(object=>object.umf_id===node.id);assert(rendered&&visible(rendered).includes(node.label),'Native state label differs');if(node.detail!==undefined)assert(visible(rendered).includes(node.detail),'Native state detail is not visible');assert((rendered.shape==='doublecircle')===Boolean(visual.state!.final?.includes(node.id)),'Native final state differs');}
  for(const transition of visual.state!.transitions){const rendered=transitions.find(edge=>edge.umf_id===transition.id);assert(rendered&&byIndex.get(rendered.tail)?.umf_id===transition.from&&byIndex.get(rendered.head)?.umf_id===transition.to,'Native transition attachment differs');for(const key of ['event','guard','action','path'] as const)if(Object.hasOwn(transition,key))assert(visible(rendered).includes(key+': '+JSON.stringify(transition[key])),'Native transition part is not visible: '+transition.id+'/'+key);assert(rendered._hdraw_?.length,'Native transition arrowhead missing');}
 }
 for(const format of ['json','yaml'] as const){
  const persisted=readVisualDocument(writeVisualDocument(document,format),format),imported=importVisual(text,{format:'dot',profile,id:visual.id,question:visual.question});
  assert(imported.ok&&canonical(imported.document)===canonical(persisted),'Profile persistence/readback differs');
  const pair=readJsonValue(writeJsonValue({document:imported.document,source:imported.source},format),format) as any;assert(exportVisual(pair.document,{format:'dot',profile,source:pair.source,original:true}).text===text,'Compound '+format+' replay differs');
 }
 await Bun.write('.cache/annotated/'+visual.id+'.svg',svg);
 checks.push({id:visual.id,inputSha256:sha(bytes),nativeSourceSha256:sha(text),svgSha256:sha(svg),annotationsDrawn:annotationStatements.length,nativeObjects:objects.length,nativeEdges:edges.length,exactNativeText:true,persistence:['json','yaml']});
}
const receipt={profile,modelVersion:'1.0.0',mappingVersion:'0.1.0',nativeVersion,checks};await Bun.write('.cache/native-annotated.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
