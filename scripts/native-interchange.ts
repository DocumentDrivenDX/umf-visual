// Native oracle tooling is deliberately outside the portable library.
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createVisualDocument,exportVisual,importVisual} from '../src';
import {oracleGraph,oracleEntities} from '../tests/interchange/samples';
import {liniDirectory,verifyLiniRuntime} from './interchange-runtime';
const assert=(condition:unknown,message:string)=>{if(!condition)throw Error(message);};
const dotVersionProcess=Bun.spawn(['dot','-V'],{stdout:'pipe',stderr:'pipe'});
const dotVersion=(await new Response(dotVersionProcess.stderr).text()).trim();
assert(await dotVersionProcess.exited===0,'Graphviz runtime unavailable');
const graph=createVisualDocument(oracleGraph),entities=createVisualDocument(oracleEntities);
const dot=exportVisual(graph,{format:'dot'});assert(dot.ok,'Strict DOT export refused: '+JSON.stringify(dot.diagnostics));
const process=Bun.spawn(['dot','-Tjson'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
process.stdin.write(dot.text!);process.stdin.end();
const nativeJson=await new Response(process.stdout).text(),nativeErrors=await new Response(process.stderr).text();
assert(await process.exited===0,'Graphviz refused generated source: '+nativeErrors);
const native=JSON.parse(nativeJson);
assert(native.objects.length===2&&native.edges.length===1,'Graphviz changed graph cardinality');
assert(native.objects.some((n:any)=>n.label===oracleGraph.nodes![0]!.label),'Graphviz changed hostile node label');
const svgProcess=Bun.spawn(['dot','-Tsvg'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
svgProcess.stdin.write(dot.text!);svgProcess.stdin.end();
const dotSvg=await new Response(svgProcess.stdout).text();
assert(await svgProcess.exited===0,'Graphviz SVG render failed');
async function svgTooltips(svg:string):Promise<string[]>{
 const xmlProcess=Bun.spawn(['python3','-c','import sys,json,xml.etree.ElementTree as E; r=E.fromstring(sys.stdin.read()); print(json.dumps([e.attrib["{http://www.w3.org/1999/xlink}title"] for e in r.iter() if "{http://www.w3.org/1999/xlink}title" in e.attrib]))'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 xmlProcess.stdin.write(svg);xmlProcess.stdin.end();
 const tooltipJson=await new Response(xmlProcess.stdout).text();
 assert(await xmlProcess.exited===0,'Graphviz SVG XML parse failed');
 return JSON.parse(tooltipJson) as string[];
}
const tooltips=await svgTooltips(dotSvg);
for(const node of oracleGraph.nodes??[])if(node.detail!==undefined)assert(tooltips.includes(node.detail),'Graphviz changed tooltip detail '+JSON.stringify(node.detail)+' to '+JSON.stringify(tooltips));
const spacingDetails=['  spaced  ','one  two   three'];
const spacingOutput=exportVisual(createVisualDocument({id:'spacing',kind:'flow',form:'network',question:'Are descriptions preserved?',nodes:spacingDetails.map((detail,index)=>({id:'n'+index,label:'Node '+index,detail}))}),{format:'dot'});
assert(spacingOutput.ok,'DOT spacing fixture refused');
async function dotOutput(format:string):Promise<string>{
 const child=Bun.spawn(['dot','-T'+format],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 child.stdin.write(spacingOutput.text!);child.stdin.end();
 const result=await new Response(child.stdout).text();assert(await child.exited===0,'DOT spacing oracle failed');return result;
}
const spacingNative=JSON.parse(await dotOutput('json'));
const spacingSvg=await svgTooltips(await dotOutput('svg'));
for(const detail of spacingDetails){
 assert(spacingNative.objects.some((node:any)=>node.tooltip===detail),'Graphviz native tooltip attribute changed exact spaces');
 assert(spacingSvg.some(value=>value.replace(/\u00a0/g,' ')===detail),'Graphviz SVG failed to preserve displayed tooltip spacing');
}
const pin=await verifyLiniRuntime();
const compiler=await import(pathToFileURL(resolve(liniDirectory,'lini_wasm.js')).href);
await compiler.default({module_or_path:await Bun.file(resolve(liniDirectory,'lini_wasm_bg.wasm')).bytes()});
assert(compiler.version()===pin.version,'Lini version mismatch');
const liniResults=[];
for(const [name,document]of [['graph',graph],['entities',entities]] as const){
 const exported=exportVisual(document,{format:'lini',mode:'allow-reported-loss'});
 assert(exported.ok,'Lini '+name+' export refused: '+JSON.stringify(exported.diagnostics));
 const report=JSON.parse(compiler.diagnostics(exported.text!,{}));
 const diagnostics=Array.isArray(report)?report:report.diagnostics;
 assert(Array.isArray(diagnostics)&&!diagnostics.some((d:any)=>d.severity==='error'),'Native Lini refused '+name+': '+JSON.stringify(report));
 const svg=compiler.compile(exported.text!,{});assert(svg.includes('<svg'),'Native Lini produced no SVG');
 const imported=importVisual(exported.text,{format:'lini',id:'native-reimport',question:'What survived?',mode:'allow-reported-loss'});
 assert(imported.ok,'Lini native-valid source cannot be reimported: '+JSON.stringify(imported.diagnostics));
 liniResults.push({name,diagnostics,svgSha256:new Bun.CryptoHasher('sha256').update(svg).digest('hex')});
}
const receipt={graphviz:{version:dotVersion,nodes:native.objects.length,edges:native.edges.length,labelFidelity:true,detailFidelity:true,tooltipWhitespace:{nativeAttributeExact:true,svgDisplaySpacing:true}},lini:{version:compiler.version(),cases:liniResults}};
await mkdir('.cache',{recursive:true});await Bun.write('.cache/native-interchange.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
