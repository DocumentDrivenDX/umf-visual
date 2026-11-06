// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createVisualDocument, editVisual, getVisual, inspectVisual, readVisualDocument, writeVisualDocument, type Visual} from '../../src/extensions/visual';
import type {Document} from '@umf/core';

const definitionPath = 'fixtures/reviews/definitions/miro-process-documents-store.json';
const commonPath = 'fixtures/integrations/complex-miro/common/process-documents-store.json';
const nativePath = 'fixtures/integrations/complex-miro/native/process-documents-store.json';
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const read = <T>(path: string) => JSON.parse(readFileSync(path, 'utf8')) as T;
type ReviewManifestExample = {id: string; sources: Array<{path: string; sha256: string; label?: string}>; publishedAssets: Array<{path: string; sha256: string}>; originalEvidence: Record<string, unknown>};

test('review maps explicit stencil meanings while leaving quantity and geometry unresolved', () => {
  const doc = read<Document>(definitionPath);
  expect(inspectVisual(doc)).toMatchObject({valid: true, complete: true});
  expect(doc.vocabularies?.['umf.visual']?.version).toBe('1.4.0');
  const visual = getVisual(doc) as Visual;
  expect(visual.title).toBe('Document flow');
  expect(visual.question).toBe('How does the process connect the document symbols to storage?');
  expect(visual.nodes).toEqual([
    {id: 'process', label: 'Process', role: 'process', shape: 'rectangle'},
    {id: 'document-one', label: 'Document', role: 'document', shape: 'document'},
    {id: 'documents-many', label: 'Multiple documents', shape: 'multiple-documents'},
    {id: 'store', label: 'Data store', role: 'store', shape: 'cylinder'}
  ]);
  expect(visual.edges).toEqual([
    {id: 'process-document', from: 'process', to: 'document-one', kind: 'data', label: 'produces', routing: {kind: 'straight'}},
    {id: 'document-multiple', from: 'document-one', to: 'documents-many', kind: 'data', label: 'expands to', routing: {kind: 'straight'}},
    {id: 'multiple-store', from: 'documents-many', to: 'store', kind: 'data', label: 'writes to', routing: {kind: 'straight'}}
  ]);
  expect(visual.layout).toEqual({kind: 'flow', direction: 'LR', order: ['process', 'document-one', 'documents-many', 'store']});
  expect(visual.omissions?.join(' ')).toContain('it does not establish quantity, cardinality, or a minimum count');
  expect(visual.omissions?.join(' ')).toContain('does not add business ordering or causal meaning');
  expect(visual.omissions?.join(' ')).toContain('not a private original Miro board or evidence of deployed process');
});

test('source hashes and native stencil identities ground the typed shapes without changing witnesses', () => {
  const commonBytes = readFileSync(commonPath);
  const nativeBytes = readFileSync(nativePath);
  expect(hash(commonBytes)).toBe('5912a60b5beafbf10bd1b3f243ac7658022b7cac7ef93afa961312e4d1ef6520');
  expect(hash(nativeBytes)).toBe('cfa2f86be9138887791db2562b7999a0b5833e62c1cee1863521844ca32dce52');
  const common = read<Document>(commonPath);
  const commonVisual = common.extensions?.['umf.visual'] as Visual;
  expect(commonVisual.nodes).toEqual([
    {id: 'process', label: 'Process'},
    {id: 'document-one', label: 'Document', role: 'document'},
    {id: 'documents-many', label: 'Multiple documents'},
    {id: 'store', label: 'Data store', role: 'store'}
  ]);
  expect(commonVisual.edges?.map(edge => [edge.from, edge.to, edge.label, edge.kind])).toEqual([
    ['process', 'document-one', 'produces', 'data'],
    ['document-one', 'documents-many', 'expands to', 'data'],
    ['documents-many', 'store', 'writes to', 'data']
  ]);

  const native = read<{authorship: string; scope: string; items: Array<Record<string, any>>; notes: string[]}>(nativePath);
  expect(native.authorship).toBe('synthetic-fixture');
  expect(native.scope).toContain('not a Miro API capture');
  expect(native.items.filter(item => item.kind === 'node').map(item => [item.label, item.symbol])).toEqual([
    ['Process', 'synthetic.symbol.process'],
    ['Document', 'synthetic.symbol.document'],
    ['Multiple documents', 'synthetic.symbol.multidocument'],
    ['Data store', 'synthetic.symbol.data-store']
  ]);
  expect(native.items.filter(item => item.kind === 'node').map(item => [item.id, item.geometry.x, item.geometry.y])).toEqual([
    ['syn-process', 0, 80], ['syn-document', 210, 80], ['syn-documents', 415, 80], ['syn-store', 640, 80]
  ]);
  expect(native.items.filter(item => item.kind === 'connector').map(item => [item.from, item.to, item.route, item.caption, item.attachment])).toEqual([
    ['syn-process', 'syn-document', 'straight', 'produces', {from: 'shape-boundary', to: 'shape-boundary'}],
    ['syn-document', 'syn-documents', 'straight', 'expands to', {from: 'shape-boundary', to: 'shape-boundary'}],
    ['syn-documents', 'syn-store', 'straight', 'writes to', {from: 'shape-boundary', to: 'shape-boundary'}]
  ]);
  expect(native.notes.join(' ')).toContain('no common role or cardinality is inferred from the icon');
  expect((getVisual(read<Document>(definitionPath)) as Visual).source?.digest).toBe(`sha256:${hash(commonBytes)}`);
});

test('review cites all three receipt and capture identities without confusing the PowerPoint render with a screenshot', () => {
  const manifest = read<{examples: ReviewManifestExample[]}>('fixtures/reviews/review-sources.json');
  const row = manifest.examples.find(example => example.id === 'miro-process-documents-store')!;
  const sourceHashes = new Map(row.sources.map(source => [source.path, source.sha256]));
  const assetHashes = new Map(row.publishedAssets.map(asset => [asset.path, asset.sha256]));
  expect(row.sources.find(source => source.path.includes('google-slides/preview-receipt.json'))?.label).toBe('Google Slides API capture receipt');
  expect(row.sources.find(source => source.path.includes('powerpoint/preview-receipt.json'))?.label).toBe('PowerPoint native-open and conversion receipt');
  expect(row.sources.find(source => source.path.includes('google-slides/assets/'))?.label).toBe('Google Slides API capture image');
  expect(row.sources.find(source => source.path.includes('powerpoint/assets/'))?.label).toBe('LibreOffice PPTX conversion (not a PowerPoint screenshot)');
  const receipts = [
    ['fixtures/renderers/miro/preview-receipt.json', 'db234c735ca203de0fb75a9f8e709a40050794a8f1a8065efdb79dce95b13109'],
    ['fixtures/renderers/google-slides/preview-receipt.json', 'd1ddaec6368f5f66ba86b8a2930e224fc6e096772853221b7b407cea48263fd2'],
    ['fixtures/renderers/powerpoint/preview-receipt.json', '60da64410d8da8c55749b0324f2abd147808ad174911516cf380b72808809cf6']
  ] as const;
  for (const [path, expectedHash] of receipts) {
    expect(hash(readFileSync(path))).toBe(expectedHash);
    expect(sourceHashes.get(path)).toBe(expectedHash);
  }
  const miro = read<{cases: Array<{id: string; rendererTargets: Array<{rendererId: string; profileId: string; modelVersion: string; mappingVersion: string; preview: {nativeVersion: string; captureDigestSha256: string; stage: string; asset: {sha256: string; path: string}}}>}>}>('fixtures/renderers/miro/preview-receipt.json').cases.find(row => row.id === 'process-documents-store')!.rendererTargets[0]!;
  expect(miro).toMatchObject({rendererId: 'miro', profileId: 'umf.visual.miro.editable-network/1', modelVersion: '1.0.0', mappingVersion: '1', preview: {nativeVersion: 'Miro observed service 1.105564.0 / Web SDK v2 (unpinned)', captureDigestSha256: '10519e3d86649191707257e2c3eabce999251f670c06658b60b5b76b0697ca8b', stage: 'restored-original', asset: {sha256: 'adb758a15dcdbf2b160cedcc39bc18281a893e69bc297e0bf95ae81362fbc14d'}}});
  const slidesReceipt = read<{cases: Array<{id: string; rendererTargets: Array<{rendererId: string; preview: {nativeVersion: string; revision: string; captureDigestSha256: string; asset: {sha256: string}}}>}>}>('fixtures/renderers/google-slides/preview-receipt.json');
  expect(slidesReceipt.cases.find(row => row.id === 'process-documents-store')!.rendererTargets[0]).toMatchObject({rendererId: 'google-slides', preview: {nativeVersion: 'Google Slides API v1 (service unpinned)', revision: 'b-qR7ONnrETXYw', captureDigestSha256: '734f5fbfd66d13b30cc12a9a03eb5d82314e4ea4e704337ca2f646f690ba22af', asset: {sha256: 'cd46b632516df1eb505a3314b1cae42c93e1ce35cd75b988866560aff05f2b40'}}});
  const ppt = read<{cases: Array<{id: string; artifact: {sha256: string}; preview: {engine: string; nativeVersion: string; png: {sha256: string}; nativeOpen: {application: string; version: string; screenshotSha256: string; screenshotPrivacy: string}}}>}>('fixtures/renderers/powerpoint/preview-receipt.json').cases.find(row => row.id === 'process-documents-store')!;
  expect(ppt).toMatchObject({artifact: {sha256: '4642c5421babd29de9a9deda2d3bc21b08a1cce19875e6e2c0176a993ead08db'}, preview: {engine: 'libreoffice', nativeVersion: 'LibreOfficeDev 26.8.0.0.alpha0 2c87e51eeaa2b413ff4ae097b2705eea1995d8e5', png: {sha256: 'd3e166e4c483d4da34768b15d7b4e3228e6bde026b02e51e1993b2c752bea739'}, nativeOpen: {application: 'Microsoft PowerPoint for Mac', version: '16.114.3', screenshotSha256: '188c393b2c56644bcab0cb6b9a2707f644d487d03ff42f2fd8aa12e75539a645'}}});
  expect(ppt.preview.nativeOpen.screenshotPrivacy).toContain('Private native application screenshot retained');
  for (const [path, expectedHash] of [
    ['fixtures/renderers/miro/assets/process-documents-store-adb758a15dcdbf2b.jpg', 'adb758a15dcdbf2b160cedcc39bc18281a893e69bc297e0bf95ae81362fbc14d'],
    ['fixtures/renderers/google-slides/assets/process-documents-store-cd46b632516df1eb.png', 'cd46b632516df1eb505a3314b1cae42c93e1ce35cd75b988866560aff05f2b40'],
    ['fixtures/renderers/powerpoint/assets/process-documents-store-layoutv3-d3e166e4c483d4da.png', 'd3e166e4c483d4da34768b15d7b4e3228e6bde026b02e51e1993b2c752bea739']
  ] as const) {
    expect(hash(readFileSync(path))).toBe(expectedHash);
    expect(assetHashes.get(path)).toBe(expectedHash);
  }
  expect(row.originalEvidence).toMatchObject({rendererId: 'miro', modelVersion: '1.0.0', stage: 'restored-original', captureSha256: 'adb758a15dcdbf2b160cedcc39bc18281a893e69bc297e0bf95ae81362fbc14d'});
});

test('source-derived document round trips through JSON and YAML and supports programmatic edits', () => {
  const commonBefore = readFileSync(commonPath);
  const nativeBefore = readFileSync(nativePath);
  const doc = read<Document>(definitionPath);
  for (const format of ['json', 'yaml'] as const) {
    expect(readVisualDocument(writeVisualDocument(doc, format), format)).toEqual(doc);
  }
  const edited = editVisual(doc, current => ({...current, title: `${current.title} — reviewed`}));
  expect((getVisual(edited) as Visual).title).toBe('Document flow — reviewed');
  for (const format of ['json', 'yaml'] as const) {
    expect(getVisual(readVisualDocument(writeVisualDocument(edited, format), format)).title).toBe('Document flow — reviewed');
  }
  expect(readFileSync(commonPath)).toEqual(commonBefore);
  expect(readFileSync(nativePath)).toEqual(nativeBefore);
  expect(hash(commonBefore)).toBe('5912a60b5beafbf10bd1b3f243ac7658022b7cac7ef93afa961312e4d1ef6520');
  expect(hash(nativeBefore)).toBe('cfa2f86be9138887791db2562b7999a0b5833e62c1cee1863521844ca32dce52');
});

test('new stencil shapes are admitted by 1.4 and remain outside frozen 1.3', () => {
  const visual: Visual = {id: 'shape-boundary', kind: 'flow', form: 'network', question: 'What shapes are declared?', nodes: [
    {id: 'document', label: 'Document', shape: 'document'},
    {id: 'documents', label: 'Multiple documents', shape: 'multiple-documents'}
  ]};
  const latest = createVisualDocument(visual, 'visual:shape-boundary', '1.4.0');
  expect(inspectVisual(latest)).toMatchObject({valid: true, complete: true});
  expect(() => createVisualDocument(visual, 'visual:shape-boundary', '1.3.0')).toThrow();
});
