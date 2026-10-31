// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe, expect, test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {buildSlidesPreviewLayoutPayload} from '../../scripts/evidence/slides-preview-layout';

const root = resolve(import.meta.dir, '../..');
const emu = 12_700;

function restoredFor(source: any, caseId: string) {
  const visual = source.extensions['umf.visual'];
  const slideId = `synthetic_${caseId}_slide`;
  const mappings = [
    ...visual.nodes.map((node: any, index: number) => ({kind: 'node', logicalId: node.id, path: `/extensions/umf.visual/nodes/${index}`, nativeId: `synthetic_${caseId}_node_${index}`, nativeScope: `slide:${slideId}`})),
    ...visual.edges.map((edge: any, index: number) => ({kind: 'edge', logicalId: edge.id, path: `/extensions/umf.visual/edges/${index}`, nativeId: `synthetic_${caseId}_edge_${index}`, nativeScope: `slide:${slideId}`})),
    ...visual.edges.flatMap((edge: any, index: number) => typeof edge.label === 'string' ? [{kind: 'edge-label', logicalId: edge.id, path: `/extensions/umf.visual/edges/${index}/label`, nativeId: `synthetic_${caseId}_label_${index}`, nativeScope: `slide:${slideId}`}] : []),
  ];
  const elements = [
    ...visual.nodes.map((node: any, index: number) => ({objectId: `synthetic_${caseId}_node_${index}`, size: {width: {magnitude: 3_000_000, unit: 'EMU'}, height: {magnitude: 3_000_000, unit: 'EMU'}},
      transform: {scaleX: 0.4, scaleY: 0.25, translateX: 0, translateY: 0, unit: 'EMU'}, shape: {shapeType: 'RECTANGLE'}})),
    ...visual.edges.map((edge: any, index: number) => ({objectId: `synthetic_${caseId}_edge_${index}`, line: {lineCategory: 'STRAIGHT'}})),
    ...visual.edges.flatMap((edge: any, index: number) => typeof edge.label === 'string' ? [{objectId: `synthetic_${caseId}_label_${index}`, size: {width: {magnitude: 3_000_000, unit: 'EMU'}, height: {magnitude: 3_000_000, unit: 'EMU'}},
      transform: {scaleX: 0.4, scaleY: 0.25, translateX: 0, translateY: 0, unit: 'EMU'}, shape: {shapeType: 'TEXT_BOX'}}] : []),
  ];
  return {document: source, binding: {state: 'complete', profile: 'umf.visual.google-slides.network/1', modelVersion: source.vocabularies['umf.visual'].version,
    bindingRevision: 4, source, mappings, baselineNative: {captureDigestSha256: 'a'.repeat(64)}},
    observation: {presentationId: `synthetic-${caseId}`, revisionId: `rev-${caseId}`, captureDigestSha256: 'a'.repeat(64),
      snapshot: {pageSize: {width: {magnitude: 12_192_000, unit: 'EMU'}, height: {magnitude: 6_858_000, unit: 'EMU'}},
        slides: [{objectId: slideId, pageElements: elements}]}}};
}

async function sourceFor(id: string) {
  const bytes = await readFile(join(root, `fixtures/integrations/complex-miro/common/${id}.json`));
  return {bytes, source: JSON.parse(bytes.toString('utf8'))};
}

describe('Google Slides native-only preview layout payload', () => {
  test('positions a small topology without changing source semantics and reconnects to perimeter sites', async () => {
    const {bytes, source} = await sourceFor('process-documents-store');
    const original = JSON.stringify(source);
    const payload = await buildSlidesPreviewLayoutPayload({caseId: 'process-documents-store', sourcePath: 'fixtures/integrations/complex-miro/common/process-documents-store.json',
      sourceBytes: bytes, source, restored: restoredFor(source, 'process-documents-store')});
    expect(payload.requests).toHaveLength(source.extensions['umf.visual'].nodes.length + source.extensions['umf.visual'].edges.length + source.extensions['umf.visual'].edges.filter((edge: any) => typeof edge.label === 'string').length);
    expect(payload.writeControl).toEqual({requiredRevisionId: 'rev-process-documents-store'});
    expect(payload.provenance).toMatchObject({semanticChangeCount: 0, semanticFieldsUpdated: [], layout: 'source-order single row; labels and IDs unchanged',
      nativeGeometryQualification: {rectangleConnectionSites: {top: 0, left: 1, bottom: 2, right: 3}, evidencePath: '.cache/p12-slides/layout-probe.png'}});
    const requests = payload.requests as any[];
    const transform = requests[0].updatePageElementTransform.transform;
    expect(transform.scaleX).toBeCloseTo((150 * emu) / 3_000_000);
    expect(transform.scaleY).toBeCloseTo((55 * emu) / 3_000_000);
    const connection = requests.find(request => request.updateLineProperties)?.updateLineProperties;
    expect(connection.lineProperties.startConnection.connectionSiteIndex).toBe(3);
    expect(connection.lineProperties.endConnection.connectionSiteIndex).toBe(1);
    expect(connection.fields).toBe('startConnection,endConnection');
    const caption = requests.find(request => request.updatePageElementTransform?.objectId.includes('_label_'))?.updatePageElementTransform.transform;
    expect(caption.scaleX).toBeCloseTo((110 * emu) / 3_000_000);
    expect(caption.scaleY).toBeCloseTo((28 * emu) / 3_000_000);
    expect(caption.translateY / emu).toBeCloseTo(245);
    expect(JSON.stringify(source)).toBe(original);
  });

  test('uses a non-overlapping perimeter ellipse for the sixteen-node native preview', async () => {
    const {bytes, source} = await sourceFor('network-16x24');
    const payload = await buildSlidesPreviewLayoutPayload({caseId: 'network-16x24', sourcePath: 'fixtures/integrations/complex-miro/common/network-16x24.json',
      sourceBytes: bytes, source, restored: restoredFor(source, 'network-16x24')});
    expect(payload.requests).toHaveLength(40);
    expect(payload.provenance).toMatchObject({layout: 'sixteen-node perimeter ellipse; labels and IDs unchanged', semanticChangeCount: 0});
    const nodes = (payload.requests as any[]).filter(request => request.updatePageElementTransform).map(request => request.updatePageElementTransform.transform);
    expect(nodes[0].translateX / emu).toBeCloseTo(820);
    expect(nodes[0].translateY / emu).toBeCloseTo(302);
    expect(nodes[8].translateX / emu).toBeCloseTo(40);
    expect(nodes[8].translateY / emu).toBeCloseTo(302);
  });
});
