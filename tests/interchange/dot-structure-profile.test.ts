// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe, expect, test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {serializeDotStructure, parseDotStructure} from '../../src/interchange/dot/structure';
import {readDotProfile, type DotProfileGraph} from '../../src/interchange/dot/profile-syntax';
import type {Visual} from '../../src/extensions/visual';

const fixtures = [
  ['fixtures/visual/forms/umf-extensions.json', 'tree'],
  ['fixtures/visual/inventory/beacon-estate-landscape.json', 'nested'],
  ['fixtures/visual/inventory/beacon-stack.json', 'stack'],
  ['fixtures/visual/inventory/helix-parts.json', 'stack'],
] as const;
const root = '/extensions/umf.visual';
function visualFromDocument(document: any): Visual { return document.extensions['umf.visual'] as Visual; }
function wrappedSource(visual: Visual, statements: string[]): string {
  return `digraph "${visual.id}" {\n graph [umf_profile="umf.visual.dot.annotated/1"];\n ${statements.join('\n ')}\n}\n`;
}
async function nativeJson(source: string): Promise<any> {
  const process = Bun.spawn(['dot', '-Tjson'], {stdin: 'pipe', stdout: 'pipe', stderr: 'pipe'});
  process.stdin.write(source);process.stdin.end();
  const [stdout, stderr, exit] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  if (exit !== 0) throw new Error(stderr || `Graphviz exited ${exit}`);
  return JSON.parse(stdout);
}
const directFields = (visual: Visual, form: string) => form === 'stack'
  ? {nodes: visual.nodes?.map(({id,label,detail,layer}) => ({id,label,...(detail === undefined ? {} : {detail}),...(layer === undefined ? {} : {layer})})), structure: visual.structure}
  : {nodes: visual.nodes?.map(({id,label,detail,parent}) => ({id,label,...(detail === undefined ? {} : {detail}),...(parent === undefined ? {} : {parent})}))};

describe('qualified DOT structure profile helpers', () => {
  // @covers US-095-AC2: native containment carries exact source IDs, labels, details and direct parent identity for both tree forms.
  test.each(fixtures.slice(0, 2))('round trips %s through its native containment profile', async (path, form) => {
    const document = JSON.parse(await readFile(path, 'utf8')), visual = visualFromDocument(document);
    const projection = serializeDotStructure(visual);
    expect(projection.diagnostics.filter(item => item.severity === 'error')).toEqual([]);
    expect(projection.statements.join('\n')).not.toContain('tooltip=');
    if (visual.nodes?.some(node => node.detail !== undefined)) expect(projection.statements.join('\n')).toContain('Detail:');
    const graph = readDotProfile(wrappedSource(visual, projection.statements));
    const parsed = parseDotStructure(graph, form);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.visual).toEqual(directFields(visual, form));
    const native = await nativeJson(wrappedSource(visual, projection.statements));
    const nativeObjects = new Map((native.objects as any[]).map(object => [object.name, object]));
    for (const [index,node] of (visual.nodes ?? []).entries()) {
      const nativeId = 'umf_node_' + Array.from(new TextEncoder().encode(node.id), byte => byte.toString(16).padStart(2, '0')).join('');
      const nativeNode = nativeObjects.get(nativeId) as any;
      expect(nativeNode?.label).toBe('Label: '+JSON.stringify(node.label)+(node.detail===undefined?'':'\\nDetail: '+JSON.stringify(node.detail)));
      expect(nativeNode?.xlabel).toBeUndefined();
      if (node.detail !== undefined) expect(nativeNode?._ldraw_).toContainEqual(expect.objectContaining({text: 'Detail: '+JSON.stringify(node.detail)}));
      expect(projection.coverage).toContainEqual(expect.objectContaining({path: `${root}/nodes/${index}/label`, aspect: 'value', representation: 'native-concept'}));
      expect(projection.coverage).toContainEqual(expect.objectContaining({path: `${root}/nodes/${index}/detail`, aspect: node.detail === undefined ? 'presence' : 'value'}));
      expect(projection.coverage).toContainEqual(expect.objectContaining({path: `${root}/nodes/${index}/parent`, aspect: node.parent === undefined ? 'presence' : 'value'}));
    }
    if(form==='tree'){
      const byGvid=new Map((native.objects as any[]).map(object=>[object._gvid,object.name]));
      const nativeEdges=native.edges as any[];
      const parents=(visual.nodes??[]).filter(node=>node.parent!==undefined);
      expect(nativeEdges).toHaveLength(parents.length);
      for(const child of parents){
        const encoded=(id:string)=>'umf_node_'+Array.from(new TextEncoder().encode(id),byte=>byte.toString(16).padStart(2,'0')).join('');
        const edge=nativeEdges.find(item=>item.id==='umf_containment_'+Array.from(new TextEncoder().encode(child.id),byte=>byte.toString(16).padStart(2,'0')).join(''));
        expect(edge).toBeDefined();
        expect(byGvid.get(edge.tail)).toBe(encoded(child.parent!));expect(byGvid.get(edge.head)).toBe(encoded(child.id));
        expect(edge.umf_kind).toBe('containment');
        const parentNode=(native.objects as any[]).find(item=>item.name===encoded(child.parent!))!,childNode=(native.objects as any[]).find(item=>item.name===encoded(child.id))!;
        expect(Number(parentNode.pos.split(',')[1])).toBeGreaterThan(Number(childNode.pos.split(',')[1]));
      }
    }
    if(form==='nested'){
      const nodeById=new Map((visual.nodes??[]).map(node=>[node.id,node]));
      const bounds=new Map<string,{left:number;bottom:number;right:number;top:number}>();
      for(const object of native.objects as any[]){if(!object.name.startsWith('cluster_umf_node_'))continue;const owner=(visual.nodes??[]).find(node=>'cluster_umf_node_'+Array.from(new TextEncoder().encode(node.id),byte=>byte.toString(16).padStart(2,'0')).join('')===object.name);if(!owner)continue;const [left,bottom,right,top]=String(object.bb).split(',').map(Number);bounds.set(owner.id,{left,bottom,right,top});}
      for(const node of visual.nodes??[]){if(node.parent===undefined)continue;const parentBox=bounds.get(node.parent),childBox=bounds.get(node.id);if(!parentBox||!childBox)continue;expect(childBox.left).toBeGreaterThan(parentBox.left);expect(childBox.right).toBeLessThan(parentBox.right);expect(childBox.bottom).toBeGreaterThan(parentBox.bottom);expect(childBox.top).toBeLessThan(parentBox.top);}
      expect(nodeById.size).toBe(visual.nodes!.length);
    }
  });

  // @covers US-095-AC2, US-095-AC3: layer IDs, labels, membership and source order are carried by native clusters and explicit layout constraints.
  test.each(fixtures.slice(2))('round trips %s and Graphviz places every native layer in source order', async (path, form) => {
    const document = JSON.parse(await readFile(path, 'utf8')), visual = visualFromDocument(document);
    const projection = serializeDotStructure(visual), source = wrappedSource(visual, projection.statements);
    expect(projection.diagnostics.filter(item => item.severity === 'error')).toEqual([]);
    const parsed = parseDotStructure(readDotProfile(source), form);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.visual).toEqual(directFields(visual, form));
    const native = await nativeJson(source);
    const objects = new Map((native.objects as any[]).map(object => [object.name, object]));
    for (const node of visual.nodes ?? []) {
      const nativeId = 'umf_node_' + Array.from(new TextEncoder().encode(node.id), byte => byte.toString(16).padStart(2, '0')).join('');
      const nativeNode = objects.get(nativeId) as any;
      expect(nativeNode?.label).toBe('Label: '+JSON.stringify(node.label)+(node.detail===undefined?'':'\\nDetail: '+JSON.stringify(node.detail)));
      expect(nativeNode?.xlabel).toBeUndefined();
    }
    const boxes = visual.structure!.layers!.map(layer => {
      const nativeId = 'cluster_umf_layer_' + Array.from(new TextEncoder().encode(layer.id), byte => byte.toString(16).padStart(2, '0')).join('');
      const object = objects.get(nativeId) as any;
      expect(object).toBeDefined();
      const [, bottom, , top] = String(object.bb).split(',').map(Number);
      expect(Number.isFinite(top)).toBe(true);expect(Number.isFinite(bottom)).toBe(true);return {top,bottom};
    });
    for (let index=1; index<boxes.length; index++) expect(boxes[index-1]!.bottom).toBeGreaterThan(boxes[index]!.top);
    expect(projection.coverage.filter(row => row.path === `${root}/structure/layers` && row.aspect === 'order')).toHaveLength(visual.structure!.layers!.length);
  });

  // @covers US-095-AC2: profile AST admission rejects syntax that could add a second or ambiguous interpretation.
  test('refuses foreign edges, changed ownership, missing layer constraints and noncanonical identity paths', async () => {
    const document = JSON.parse(await readFile(fixtures[0][0], 'utf8')), visual = visualFromDocument(document);
    const emitted = serializeDotStructure(visual).statements;
    const foreign = parseDotStructure(readDotProfile(wrappedSource(visual, [...emitted, '"foreign" -> "edge";'])), 'tree');
    expect(foreign.visual).toBeUndefined();expect(foreign.diagnostics[0]?.severity).toBe('error');

    const stackDocument = JSON.parse(await readFile(fixtures[2][0], 'utf8')), stack = visualFromDocument(stackDocument), stackStatements = serializeDotStructure(stack).statements;
    const noOrder = stackStatements.filter(statement => !statement.includes('umf_layout="layer-order"'));
    expect(parseDotStructure(readDotProfile(wrappedSource(stack, noOrder)), 'stack').visual).toBeUndefined();

    const changed = emitted.map(statement => statement.includes('umf_path=') ? statement.replace('/nodes/0', '/nodes/00') : statement);
    expect(parseDotStructure(readDotProfile(wrappedSource(visual, changed)), 'tree').visual).toBeUndefined();

    const defaultsGraph = readDotProfile(wrappedSource(visual, emitted));
    defaultsGraph.statements.push({kind:'attributes',target:'node',attributes:[{name:'xlabel',value:'untracked detail'}]});
    expect(parseDotStructure(defaultsGraph, 'tree').visual).toBeUndefined();
    const nestedDocument=JSON.parse(await readFile(fixtures[1][0],'utf8')),nested=visualFromDocument(nestedDocument),nestedGraph=readDotProfile(wrappedSource(nested,serializeDotStructure(nested).statements));
    const firstCluster=nestedGraph.statements.find((statement):statement is Extract<DotProfileGraph['statements'][number],{kind:'subgraph'}>=>statement.kind==='subgraph')!;
    firstCluster.statements.push({kind:'attributes',target:'node',attributes:[{name:'xlabel',value:'untracked detail'}]});expect(parseDotStructure(nestedGraph,'nested').visual).toBeUndefined();

    const rootLabelGraph = readDotProfile(wrappedSource(visual, emitted));
    rootLabelGraph.statements.push({kind:'attributes',target:'graph',attributes:[{name:'label',value:'untracked title'}]});
    expect(parseDotStructure(rootLabelGraph, 'tree').visual).toBeUndefined();
  });

  // @covers US-095-AC2: stack layout constraints are explicit native-only helpers and never imported as authored diagram edges.
  test('keeps layout-only constraints separate from structural nodes and identity mappings', async () => {
    const document = JSON.parse(await readFile(fixtures[2][0], 'utf8')), visual = visualFromDocument(document);
    const result = serializeDotStructure(visual);
    const layoutEdges = result.statements.filter(statement => statement.includes('umf_layout="layer-order"'));
    expect(layoutEdges).toHaveLength(visual.structure!.layers!.length - 1);
    expect(result.identityMap.filter(mapping => mapping.kind === 'node')).toHaveLength(visual.nodes!.length);
    expect(result.identityMap.some(mapping => mapping.kind === 'edge')).toBe(false);
  });

  // @covers US-095-AC2: unsupported structural combinations refuse rather than drop authored semantics.
  test('rejects empty stack layers and tree node layer fields before emitting source', () => {
    const stack: Visual = {id:'s',kind:'structure',form:'stack',question:'Q',nodes:[{id:'n',label:'N',layer:'one'}],structure:{layers:[{id:'one',label:'One'},{id:'empty',label:'Empty'}]}};
    expect(serializeDotStructure(stack).statements).toEqual([]);
    expect(serializeDotStructure(stack).diagnostics.some(item => item.code === 'DOT_STRUCTURE_EMPTY_LAYER')).toBe(true);
    const tree: Visual = {id:'t',kind:'structure',form:'tree',question:'Q',nodes:[{id:'n',label:'N',layer:'one'}]};
    expect(serializeDotStructure(tree).statements).toEqual([]);
    expect(serializeDotStructure(tree).diagnostics.some(item => item.code === 'DOT_STRUCTURE_LAYER')).toBe(true);
  });
});
