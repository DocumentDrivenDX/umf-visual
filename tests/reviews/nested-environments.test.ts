// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {editVisual, getVisual, inspectVisual, readVisualDocument, writeVisualDocument, type Visual} from '../../src/extensions/visual';
import type {Document} from '@umf/core';
import {compilePresentation} from '../../src/presentation';

const definitionPath = 'fixtures/reviews/definitions/miro-nested-environments.json';
const commonPath = 'fixtures/integrations/complex-miro/common/nested-environments.json';
const nativePath = 'fixtures/integrations/complex-miro/native/nested-environments.json';
const receiptPath = 'fixtures/renderers/miro/preview-receipt.json';
const imagePath = 'fixtures/renderers/miro/assets/nested-environments-d751a8bc935e694d.jpg';
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const read = <T>(path: string) => JSON.parse(readFileSync(path, 'utf8')) as T;

test('review preserves source-grounded topology and the unresolved containment interpretation', () => {
  const doc = read<Document>(definitionPath);
  const result = inspectVisual(doc);
  expect(result.valid).toBe(true);
  expect(result.complete).toBe(true);
  expect(doc.vocabularies?.['umf.visual']?.version).toBe('1.4.0');
  const visual = getVisual(doc) as Visual;
  expect(visual.question).toBe('Which process connects to the data store?');
  expect(visual.groups).toEqual([
    {id: 'env-a', label: 'Environment A', role: 'boundary'},
    {id: 'env-b', label: 'Environment B', role: 'boundary', parent: 'env-a'}
  ]);
  expect(visual.nodes).toEqual([
    {id: 'process-outside', label: 'Process outside A', role: 'process', detail: 'Process', shape: 'rectangle'},
    {id: 'store-in-b', label: 'Data store', role: 'store', shape: 'cylinder', group: 'env-b'}
  ]);
  expect(visual.edges).toEqual([{id: 'connects-to-store', from: 'process-outside', to: 'store-in-b', kind: 'data', label: 'connects to', routing: {kind: 'curved'}}]);
  expect(visual.omissions?.join(' ')).toContain('leave semantic grouping, deployment placement, and presentation unresolved');
  expect(visual.omissions?.join(' ')).toContain('not a private original Miro capture');
});

test('the authored process node remains mapped to its source identity in each renderer plan',()=>{
  const doc=read<Document>(definitionPath);
  const visual=getVisual(doc) as Visual;
  const processIndex=visual.nodes!.findIndex(node=>node.id==='process-outside');
  expect(processIndex).toBeGreaterThanOrEqual(0);
  const process=visual.nodes![processIndex]!;
  expect(process).toMatchObject({role:'process',shape:'rectangle'});
  for(const backend of ['graphviz','mermaid','lini'] as const){
    const plan=compilePresentation(doc,{backend,theme:'presentation/1'});
    expect(plan.ok).toBe(true);
    if(!plan.ok)continue;
    const sourcePath=`/extensions/umf.visual/nodes/${processIndex}`;
    expect(plan.elementMap.some(element=>element.kind==='node'&&element.logicalId===process.id&&(element.sourcePath===sourcePath||element.sourcePath===`${sourcePath}/id`))).toBe(true);
  }
});

test('review cites unchanged source and actual renderer output without upgrading synthetic evidence', () => {
  const doc = read<Document>(definitionPath);
  const visual = getVisual(doc) as Visual;
  const commonBytes = readFileSync(commonPath);
  expect(hash(commonBytes)).toBe('bb6d48b9bcbc7012c8bcda30d0508815c37760648e52ba879436625b6c364e34');
  expect(visual.source?.digest).toBe(`sha256:${hash(commonBytes)}`);

  const native = read<{authorship: string; scope: string; items: Array<Record<string, any>>; notes: string[]}>(nativePath);
  const common = read<Document>(commonPath);
  expect(native.authorship).toBe('synthetic-fixture');
  expect(native.scope).toContain('not a Miro API capture');
  expect(((common.extensions?.['umf.visual'] as Visual).edges?.[0] as any).routing).toBeUndefined();
  expect(visual.edges?.[0]?.routing).toEqual({kind: 'curved'});
  expect(native.items.find(item => item.id === 'syn-process')?.symbol).toBe('synthetic.symbol.process');
  expect(native.items.find(item => item.id === 'syn-store')?.parentId).toBe('syn-env-b');
  const connector = native.items.find(item => item.id === 'syn-cross-boundary')!;
  expect(connector).toMatchObject({route: 'curved', attachment: {from: 'shape-boundary', to: 'shape-boundary'}});
  expect(connector.controlPoints).toHaveLength(2);
  expect(native.notes.join(' ')).toContain('without resolving that question');

  const receipt = read<{cases: Array<{id: string; source: {sha256: string}; rendererTargets: Array<{preview: {stage: string; asset: {sha256: string; path: string}}}>}>}>(receiptPath);
  const entry = receipt.cases.find(item => item.id === 'nested-environments')!;
  expect(entry.source.sha256).toBe(hash(commonBytes));
  expect(entry.rendererTargets[0]?.preview.stage).toBe('restored-original');
  expect(entry.rendererTargets[0]?.preview.asset.sha256).toBe(hash(readFileSync(imagePath)));
  expect(entry.rendererTargets[0]?.preview.asset.path).toContain('nested-environments-d751a8bc935e694d.jpg');
});

test('source-derived review round trips as JSON and YAML and allows ordinary programmatic edits', () => {
  const original = readFileSync(commonPath);
  const doc = read<Document>(definitionPath);
  for (const format of ['json', 'yaml'] as const) {
    expect(readVisualDocument(writeVisualDocument(doc, format), format)).toEqual(doc);
  }
  const edited = editVisual(doc, current => ({...current, title: `${current.title} — reviewed`}));
  expect((getVisual(edited) as Visual).title).toBe('Nested environments — reviewed');
  for (const format of ['json', 'yaml'] as const) {
    expect(getVisual(readVisualDocument(writeVisualDocument(edited, format), format)).title).toBe('Nested environments — reviewed');
  }
  expect(readFileSync(commonPath)).toEqual(original);
  expect(hash(readFileSync(nativePath))).toBe('14a3cc615d889f12f36e25b2ef1e42406f34e5988f7495b3ca45ef57de619fb8');
});
