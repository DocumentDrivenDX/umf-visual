// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {VISUAL_VERSION,type Visual} from '../src/extensions/visual';
import {importVisual} from '../src/interchange';
import {dotAdapter} from '../src/interchange/dot';

const fixtureHashes={
 'fixtures/visual/inventory/beacon-containers.json':'b6cc883738063075c31ee3c1e0e9f2fe484dc3e8538e2e9508fcd7fa2788b472',
 'fixtures/visual/inventory/beacon-deployment.json':'7f94f529ed7350c9c5d49caedb93eddfcf56f5aa60f43e0557d8220d2c0ad14c',
 'fixtures/interchange/progress/v0.1.0.json':'f25de6bcb92a9dfc27406e36a3f92744190a1792b0c07ce50527fe837df992a1'
};
const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const assert:(condition:unknown,message:string)=>asserts condition=(condition,message)=>{if(!condition)throw new Error(message);};
function file(path:string):string{const bytes=readFileSync(path);assert(sha(bytes)===fixtureHashes[path as keyof typeof fixtureHashes],'Pinned source/baseline hash changed: '+path);return bytes.toString('utf8');}
function runDot(format:'json'|'svg'|'-V',source?:string):string{
 const result=spawnSync('dot',format==='-V'?['-V']:['-T'+format],{...(source===undefined?{}:{input:source}),encoding:'utf8'});
 assert(result.status===0,'Graphviz '+format+' failed: '+result.stderr);
 return format==='-V'?result.stderr+result.stdout:result.stdout;
}
function addNodeAttrs(source:string,id:string,attrs:string):string{
 const line=source.split('\n').find(value=>value.includes('"'+id+'" [label='));
 assert(line,'Missing serialized node '+id);
 return source.replace(line,line.replace('];',', '+attrs+'];'));
}
function nativeSource(base:string,rankdir:'LR'|'TB',proxyShape:'box'|'ellipse',clusterColor:'purple'|'orange',edgeStyle:'dashed'|'solid',arrowhead:'vee'|'normal'):string{
 let source=base.replace(/^(digraph [^\n]+ \{)$/m,'$1\n  graph [rankdir='+rankdir+'];');
 source=source.replace('graph [label="Beacon app"]','graph [label="Beacon app", color='+clusterColor+', style=dashed]');
 source=addNodeAttrs(source,'proxy','shape='+proxyShape+', color=blue, penwidth=3');
 source=addNodeAttrs(source,'db','shape=cylinder, color=green, penwidth=2');
 const edge=source.split('\n').find(line=>line.includes('"proxy" -> "api"'));
 assert(edge,'Missing serialized proxy-to-api edge');
 return source.replace(edge,edge.replace('];',', style='+edgeStyle+', color=red, arrowhead='+arrowhead+'];'));
}
function graphvizJson(source:string):any{return JSON.parse(runDot('json',source));}
function objectNamed(graph:any,name:string):any{const value=graph.objects?.find((object:any)=>object.name===name);assert(value,'Graphviz JSON omitted object '+name);return value;}
function svgObject(svg:string,name:string):string{
 const title='<title>'+name+'</title>',at=svg.indexOf(title);assert(at>=0,'Graphviz SVG omitted title '+name);
 const start=svg.lastIndexOf('<g id="node',at),end=svg.indexOf('</g>',at);assert(start>=0&&end>at,'Could not isolate SVG node '+name);return svg.slice(start,end+4);
}

const containerText=file('fixtures/visual/inventory/beacon-containers.json');
const deploymentText=file('fixtures/visual/inventory/beacon-deployment.json');
const baselineText=file('fixtures/interchange/progress/v0.1.0.json');
const baseline=JSON.parse(baselineText);
const containersDoc=JSON.parse(containerText),deploymentDoc=JSON.parse(deploymentText);
const containers=containersDoc.extensions['umf.visual'] as Visual,deployment=deploymentDoc.extensions['umf.visual'] as Visual;
assert(containers.nodes?.length===9&&containers.groups?.length===2&&containers.edges?.some(edge=>edge.kind==='return'&&edge.status===undefined),'Role/status cohort no longer matches its pinned witness.');
assert(deployment.form==='zoned'&&deployment.nodes?.length===13&&deployment.groups?.length===5&&deployment.edges?.some(edge=>edge.kind==='return')&&deployment.edges?.some(edge=>edge.status==='unknown'),'Zoned-layout cohort no longer matches its pinned witness.');
const baseResult=dotAdapter.serialize(containers,{id:containers.id,question:containers.question});
assert(baseResult.text,'The ordinary DOT serializer did not emit the qualified cohort witness.');
const firstSource=nativeSource(baseResult.text,'LR','box','purple','dashed','vee');
const editedSource=nativeSource(baseResult.text,'TB','ellipse','orange','solid','normal');
const firstJson=graphvizJson(firstSource),editedJson=graphvizJson(editedSource);
const firstSvg=runDot('svg',firstSource),editedSvg=runDot('svg',editedSource);
const proxyFirst=objectNamed(firstJson,'proxy'),proxyEdited=objectNamed(editedJson,'proxy');
const dbFirst=objectNamed(firstJson,'db'),clusterFirst=objectNamed(firstJson,'cluster_umf_g1');
assert(proxyFirst.shape==='box'&&proxyEdited.shape==='ellipse','Graphviz JSON did not expose edited native node shapes.');
assert(dbFirst.shape==='cylinder'&&proxyFirst.color==='blue'&&proxyFirst.penwidth==='3','Graphviz JSON did not expose native presentation properties.');
assert(clusterFirst.color==='purple'&&clusterFirst.style==='dashed','Graphviz JSON did not expose cluster presentation properties.');
const styledEdge=firstJson.edges?.find((edge:any)=>edge.label==='forwards with the agent\'s token'&&edge.tooltip==='the API acts as the agent, never as a service account');
assert(styledEdge?.style==='dashed'&&styledEdge?.color==='red'&&styledEdge?.arrowhead==='vee','Graphviz JSON did not expose edge decoration.');
assert(proxyFirst.pos!==proxyEdited.pos,'Graphviz rankdir edit did not change native geometry.');
assert(svgObject(firstSvg,'proxy').includes('<polygon')&&svgObject(editedSvg,'proxy').includes('<ellipse'),'Graphviz SVG did not render the edited shape.');
assert(firstSvg.includes('stroke="blue"')&&firstSvg.includes('stroke-dasharray'),'Graphviz SVG did not render the edited node/cluster styles.');

const firstImport=importVisual(firstSource,{format:'dot',id:containers.id,question:containers.question,mode:'allow-reported-loss'});
const editedImport=importVisual(editedSource,{format:'dot',id:containers.id,question:containers.question,mode:'allow-reported-loss'});
assert(firstImport.ok&&firstImport.document&&editedImport.ok&&editedImport.document,'Edited-source DOT import failed.');
const projectedFirst=firstImport.document.extensions?.['umf.visual'],projectedEdited=editedImport.document.extensions?.['umf.visual'];
assert(JSON.stringify(projectedFirst)===JSON.stringify(projectedEdited),'Presentation-only edits changed the ordinary Visual projection.');
assert((projectedFirst as any).nodes.every((node:any)=>node.role===undefined&&node.status===undefined),'Node shape/style was inferred as role or status.');
assert((projectedFirst as any).edges.every((edge:any)=>edge.kind===undefined&&edge.status===undefined),'Edge decoration was inferred as kind or status.');
assert((projectedFirst as any).groups.every((group:any)=>group.role==='region'),'Cluster style was interpreted as a semantic group role.');
assert(firstImport.diagnostics.some(item=>item.code==='DOT_ATTRIBUTE_LOSS'&&item.loss),'Presentation attributes were not reported as retained-only losses.');
assert(firstImport.source.text===firstSource&&editedImport.source.text===editedSource,'Edited native source was not retained exactly.');

const portSource='digraph { record [shape=record, label="<out> Output|<in> Input"]; target [shape=box, label="Target"]; record:out -> target [headport=n]; }';
const portJson=graphvizJson(portSource),portSvg=runDot('svg',portSource);
const portEdge=portJson.edges?.[0];
assert(objectNamed(portJson,'record').shape==='record'&&portEdge?.tailport==='out'&&portEdge?.headport==='n','Graphviz JSON did not expose native record-port attachment.');
assert(portSvg.includes('record:out')&&portSvg.includes('target:n'),'Graphviz SVG did not expose the port-attached edge title.');
const portImport=importVisual(portSource,{format:'dot',id:'ports',question:'Which native ports are connected?',mode:'allow-reported-loss'});
assert(!portImport.ok&&portImport.source.text===portSource&&portImport.diagnostics.some(item=>item.code==='DOT_PORT'&&item.severity==='error'),'The ordinary profile did not retain and refuse its unsupported port meaning.');

const baselineContainers=baseline.records.find((item:any)=>item.id==='visual-inventory-beacon-containers'&&item.format==='dot');
const baselineDeployment=baseline.records.find((item:any)=>item.id==='visual-inventory-beacon-deployment'&&item.format==='dot');
assert(baselineContainers?.status==='reported-loss'&&baselineContainers.lossCounts.DOT_NODE_FIELD===26&&baselineContainers.lossCounts.DOT_EDGE_FIELD===4,'The frozen ordinary raw-loss baseline changed.');
assert(baselineDeployment?.status==='unsupported'&&Object.keys(baselineDeployment.lossCounts).length===0,'The frozen zoned-form baseline changed.');

const graphvizVersion=runDot('-V').trim();
console.log(JSON.stringify({
 result:'no intrinsic ordinary DOT mapping qualified for these typed fields',
 profile:{format:dotAdapter.format,mappingVersion:dotAdapter.version,modelVersion:VISUAL_VERSION,subset:dotAdapter.subset},
 native:{engine:graphvizVersion,formats:['-Tjson','-Tsvg'],sourceSha256:{first:sha(firstSource),edited:sha(editedSource),ports:sha(portSource)},outputSha256:{firstJson:sha(runDot('json',firstSource)),firstSvg:sha(firstSvg),editedJson:sha(runDot('json',editedSource)),editedSvg:sha(editedSvg),portsJson:sha(runDot('json',portSource)),portsSvg:sha(portSvg)},observed:{firstProxyShape:proxyFirst.shape,editedProxyShape:proxyEdited.shape,dbShape:dbFirst.shape,groupStyle:clusterFirst.style,edge:{style:styledEdge.style,arrowhead:styledEdge.arrowhead},proxyPositionChanged:proxyFirst.pos!==proxyEdited.pos,port:{tailport:portEdge.tailport,headport:portEdge.headport}}},
 editedImport:{bothAcceptedWithReportedLoss:true,semanticProjectionEqual:true,sourceBytesPreserved:true,portRefused:true},
 witnesses:{containers:{path:'fixtures/visual/inventory/beacon-containers.json',sha256:sha(containerText),nodes:containers.nodes?.length,groups:containers.groups?.length},deployment:{path:'fixtures/visual/inventory/beacon-deployment.json',sha256:sha(deploymentText),nodes:deployment.nodes?.length,groups:deployment.groups?.length,form:deployment.form},ordinaryBaseline:{path:'fixtures/interchange/progress/v0.1.0.json',sha256:sha(baselineText),containers:baselineContainers,deployment:baselineDeployment}}
},null,2));
