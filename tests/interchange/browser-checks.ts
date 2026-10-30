import mermaid from 'mermaid';
import {createVisualDocument,exportVisual,importVisual} from '../../src';
import {oracleGraph,oracleEntities} from './samples';
export async function runInterchangeBrowserChecks(){
 const assert=(condition:unknown,message:string)=>{if(!condition)throw Error(message);};
 const graph=createVisualDocument(oracleGraph),entities=createVisualDocument(oracleEntities);
 mermaid.initialize({startOnLoad:false,securityLevel:'strict'});
 const nativeMermaid=[];
 for(const [name,document]of [['graph',graph],['entities',entities]] as const){
  const exported=exportVisual(document,{format:'mermaid',mode:'allow-reported-loss'});
  assert(exported.ok,'Mermaid export refused: '+JSON.stringify(exported.diagnostics));
  const parsed=await mermaid.parse(exported.text!);assert(!!parsed,'Native Mermaid parse refused');
  const rendered=await mermaid.render('native-'+name,exported.text!);
  const dom=new DOMParser().parseFromString(rendered.svg,'image/svg+xml');
  if(name==='graph'){
   const labels=[...dom.querySelectorAll('.nodeLabel,.edgeLabel')].map(n=>n.textContent);
   for(const label of [oracleGraph.nodes![0]!.label,oracleGraph.nodes![1]!.label,oracleGraph.edges![0]!.label!])assert(labels.includes(label),'Native Mermaid changed label '+JSON.stringify(label)+' to '+JSON.stringify(labels));
  }
  const expectedTitle=(document.extensions!['umf.visual'] as any).title;
  const nativeTitle=dom.querySelector('.flowchartTitleText,.erDiagramTitleText')?.textContent;
  assert(nativeTitle===expectedTitle,'Native Mermaid changed title '+JSON.stringify(expectedTitle)+' to '+JSON.stringify(nativeTitle));
  const importedTitle=importVisual(exported.text,{format:'mermaid',id:'title-check',question:'What title?',mode:'allow-reported-loss'});
  assert(importedTitle.ok&&(importedTitle.document!.extensions!['umf.visual'] as any).title===expectedTitle,'Mermaid title did not reimport');
  nativeMermaid.push({name,nativeParse:true,nativeRender:true,titleFidelity:true});
 }
 const titleEdges='  Quotes " and slash \\ · 東京 #1\t`literal`\u2028\u2029\nSecond line  ';
 for(const [name,base]of [['flow',oracleGraph],['er',oracleEntities]] as const){
  const output=exportVisual(createVisualDocument({...base,title:titleEdges}),{format:'mermaid',mode:'allow-reported-loss'});
  assert(output.ok,'Mermaid refused qualified edge title');
  const rendered=await mermaid.render('title-edge-'+name,output.text!);
  const dom=new DOMParser().parseFromString(rendered.svg,'image/svg+xml');
  assert(dom.querySelector('.flowchartTitleText,.erDiagramTitleText')?.textContent===titleEdges,'Native Mermaid normalized a qualified title character');
 }
 const formats=['dot','mermaid','lini'] as const;const replays=[];
 for(const format of formats){
  const output=exportVisual(graph,{format,mode:'allow-reported-loss'});assert(output.ok,'Browser export failed: '+format);
  const input=importVisual(output.text,{format,id:'browser-import',question:'Which graph?',mode:'allow-reported-loss'});assert(input.ok,'Browser import failed: '+format+' '+JSON.stringify(input.diagnostics));
  const pair=JSON.parse(JSON.stringify({document:input.document,source:input.source}));
  const replay=exportVisual(pair.document,{format,source:pair.source,original:true});assert(replay.ok&&replay.text===output.text,'Browser replay differs: '+format);
  pair.document.extensions['umf.visual'].nodes[0].label='Changed';
  const forged=exportVisual(pair.document,{format,source:pair.source,original:true});assert(!forged.ok,'Browser stale replay accepted: '+format);
  replays.push(format);
 }
 const moduleUrl='/lini_wasm.js';const lini=await import(moduleUrl);
 await lini.default({module_or_path:new URL('/lini_wasm_bg.wasm',location.href)});
 const nativeLini=[];
 for(const [name,document]of [['graph',graph],['entities',entities]] as const){
  const exported=exportVisual(document,{format:'lini',mode:'allow-reported-loss'});assert(exported.ok,'Lini browser export failed');
  const report=JSON.parse(lini.diagnostics(exported.text,{}));const diagnostics=Array.isArray(report)?report:report.diagnostics;
  assert(!diagnostics.some((d:any)=>d.severity==='error'),'Lini native browser parser refused '+name);
  const svg=lini.compile(exported.text,{});
  const dom=new DOMParser().parseFromString(svg,'image/svg+xml');
  assert(!dom.querySelector('parsererror'),'Lini returned invalid SVG');
  const labels=[...dom.querySelectorAll('text')].map(n=>n.textContent);
  const expected=name==='graph'?oracleGraph.nodes!.map(n=>n.label):oracleEntities.nodes!.map(n=>n.label);
  for(const label of expected)assert(labels.includes(label),'Native Lini changed label '+JSON.stringify(label)+' to '+JSON.stringify(labels));
  const nativeHints=[...dom.querySelectorAll('title')].map(n=>n.textContent);
  const expectedHints=((document.extensions!['umf.visual'] as any).nodes??[]).flatMap((node:any)=>node.detail===undefined?[]:[node.detail]);
  for(const detail of expectedHints)assert(nativeHints.includes(detail),'Native Lini changed descriptive hint '+JSON.stringify(detail)+' to '+JSON.stringify(nativeHints));
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(svg));
  nativeLini.push({name,diagnostics,detailFidelity:true,svgSha256:[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')});
 }
 return{nativeMermaid:{version:'12.2.0',cases:nativeMermaid,labelFidelity:true,titleEdgeFidelity:true},nativeLini:{version:lini.version(),labelFidelity:true,cases:nativeLini},portableRoundTrips:replays};
}
