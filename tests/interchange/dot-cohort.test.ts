// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {importVisual} from '../../src/interchange';
import {dotAdapter} from '../../src/interchange/dot';
import type {Visual} from '../../src/extensions/visual';

const context={id:'dot-cohort',question:'How do these components relate?'};
const json=(path:string)=>JSON.parse(readFileSync(path,'utf8'));

test('keeps ranked DOT role, status, edge-kind and zoned-layout fields as explicit losses',()=>{
 const containers=json('fixtures/visual/inventory/beacon-containers.json').extensions['umf.visual'] as Visual;
 const deployment=json('fixtures/visual/inventory/beacon-deployment.json').extensions['umf.visual'] as Visual;
 const containerResult=dotAdapter.serialize(containers,context),deploymentResult=dotAdapter.serialize(deployment,context);
 expect(containerResult.text).toBeDefined();expect(deploymentResult.text).toBeDefined();
 const containerLosses=containerResult.diagnostics.filter(item=>item.loss);
 expect(containerLosses.filter(item=>item.path.includes('/nodes/')&&item.path.endsWith('/role'))).toHaveLength(9);
 expect(containerLosses.filter(item=>item.path.includes('/nodes/')&&item.path.endsWith('/status'))).toHaveLength(9);
 expect(containerLosses.filter(item=>item.path.includes('/groups/')&&item.path.endsWith('/role'))).toHaveLength(2);
 expect(containerLosses.filter(item=>item.path.includes('/edges/')&&item.path.endsWith('/kind'))).toHaveLength(1);
 expect(containerLosses.filter(item=>item.path.includes('/edges/')&&item.path.endsWith('/status'))).toHaveLength(2);
 const deploymentLosses=deploymentResult.diagnostics.filter(item=>item.loss);
 expect(deploymentLosses.filter(item=>item.code==='DOT_GROUP_FIELD'&&item.path.endsWith('/role'))).toHaveLength(5);
 expect(deploymentLosses.filter(item=>item.code==='DOT_GROUP_FIELD'&&item.path.endsWith('/tier'))).toHaveLength(5);
 expect(deploymentLosses.filter(item=>item.code==='DOT_FLOW_LAYOUT'&&item.path.endsWith('/form'))).toHaveLength(1);
 expect(deploymentLosses.filter(item=>item.code==='DOT_NODE_FIELD'&&item.path.endsWith('/role'))).toHaveLength(13);
 expect(deploymentLosses.filter(item=>item.code==='DOT_NODE_FIELD'&&item.path.endsWith('/status'))).toHaveLength(13);
 expect(deploymentLosses.filter(item=>item.code==='DOT_EDGE_FIELD'&&item.path.endsWith('/kind'))).toHaveLength(1);
 expect(deploymentLosses.filter(item=>item.code==='DOT_EDGE_FIELD'&&item.path.endsWith('/status'))).toHaveLength(1);
});

function nativeVariant(values:{rankdir:'LR'|'TB';proxyShape:'box'|'ellipse';clusterColor:'purple'|'orange';edgeStyle:'dashed'|'solid';arrowhead:'vee'|'normal'}):string{
 const source=`digraph "cohort" {\n  graph [rankdir=${values.rankdir}];\n  subgraph cluster_app { graph [label="Application", color=${values.clusterColor}, style=dashed]; "proxy" [label="Proxy", shape=${values.proxyShape}, color=blue, penwidth=3]; }\n  "store" [label="Store", shape=cylinder];\n  "proxy" -> "store" [label="writes", style=${values.edgeStyle}, color=red, arrowhead=${values.arrowhead}];\n}`;
 return source;
}

test('edited presentation attributes change native DOT only; import does not infer typed role, status, kind or layout',()=>{
 const first=nativeVariant({rankdir:'LR',proxyShape:'box',clusterColor:'purple',edgeStyle:'dashed',arrowhead:'vee'});
 const edited=nativeVariant({rankdir:'TB',proxyShape:'ellipse',clusterColor:'orange',edgeStyle:'solid',arrowhead:'normal'});
 const a=importVisual(first,{format:'dot',id:context.id,question:context.question,mode:'allow-reported-loss'});
 const b=importVisual(edited,{format:'dot',id:context.id,question:context.question,mode:'allow-reported-loss'});
 expect(a.ok).toBe(true);expect(b.ok).toBe(true);if(!a.ok||!a.document||!b.ok||!b.document)return;
 const visualA=a.document.extensions?.['umf.visual'] as Visual,visualB=b.document.extensions?.['umf.visual'] as Visual;
 expect(visualA).toEqual(visualB);
 expect(visualA.kind).toBe('flow');expect(visualA.form).toBe('network');
 expect(visualA.groups?.[0]).toMatchObject({label:'Application',role:'region'});
 expect(visualA.nodes?.every(node=>node.role===undefined&&node.status===undefined)).toBe(true);
 expect(visualA.edges?.every(edge=>edge.kind===undefined&&edge.status===undefined)).toBe(true);
 expect(a.diagnostics.some(item=>item.code==='DOT_GROUP_ROLE'&&item.loss)).toBe(true);
 expect(a.diagnostics.filter(item=>item.code==='DOT_ATTRIBUTE_LOSS'&&item.loss).length).toBeGreaterThanOrEqual(8);
 expect(a.source.text).toBe(first);expect(b.source.text).toBe(edited);
});

test('rejects native record ports with source retained instead of inventing VisualNode ports',()=>{
 const source='digraph { record [shape=record, label="<out> Output|<in> Input"]; target [shape=box, label="Target"]; record:out -> target [headport=n]; }';
 const result=importVisual(source,{format:'dot',id:context.id,question:context.question,mode:'allow-reported-loss'});
 expect(result.ok).toBe(false);expect(result.source.text).toBe(source);
 expect(result.diagnostics.some(item=>item.code==='DOT_PORT'&&item.severity==='error')).toBe(true);
});
