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
const receipt={graphviz:{version:dotVersion,nodes:native.objects.length,edges:native.edges.length,labelFidelity:true},lini:{version:compiler.version(),cases:liniResults}};
await mkdir('.cache',{recursive:true});await Bun.write('.cache/native-interchange.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
