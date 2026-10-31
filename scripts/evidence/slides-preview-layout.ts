// SPDX-License-Identifier: MIT OR Apache-2.0
/** Create native-only Google Slides positioning/attachment requests; this script never calls the host API. */
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {canonicalHostJson, hostDigest} from '../../src/adapters/reconciliation/json.js';

const root = resolve(import.meta.dir, '../..');
const inputDirectory = join(root, '.cache/p12-slides');
const outputPath = join(inputDirectory, 'preview-layout-payload.json');
const caseIds = ['nested-environments', 'process-documents-store', 'network-16x24', 'frames-headings-annotations', 'curved-caption-cross-boundary'] as const;
const emuPerPoint = 12_700;
const googleRectangleConnectionSites = {top: 0, left: 1, bottom: 2, right: 3} as const;
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const ensure: (condition: unknown, message: string) => asserts condition = (condition, message) => {if (!condition) throw new Error(message);};

type PointBox = {centerX: number; centerY: number; width: number; height: number};
type LayoutInput = {caseId: string; sourcePath: string; sourceBytes: Uint8Array; source: any; restored: any};

function parseMapping(restored: any, kind: 'node'|'edge'|'edge-label'): Map<string, string> {
  const entries = restored?.binding?.mappings?.filter((mapping: any) => mapping?.kind === kind) ?? [];
  const result = new Map<string, string>();
  for (const mapping of entries) {
    ensure(typeof mapping.logicalId === 'string' && typeof mapping.nativeId === 'string' && mapping.nativeId.length > 0,
      `The restored Slides ${kind} mapping is malformed.`);
    ensure(!result.has(mapping.logicalId), `The restored Slides binding duplicates ${kind} identity ${mapping.logicalId}.`);
    result.set(mapping.logicalId, mapping.nativeId);
  }
  return result;
}

function planNodeBoxes(ids: string[], widthPt: number, heightPt: number): Map<string, PointBox> {
  const result = new Map<string, PointBox>();
  if (ids.length === 16) {
    const centerX = widthPt / 2, centerY = 320, radiusX = 390, radiusY = 160;
    ids.forEach((id, index) => {
      const angle = (2 * Math.PI * index) / ids.length;
      result.set(id, {centerX: centerX + radiusX * Math.cos(angle), centerY: centerY + radiusY * Math.sin(angle), width: 100, height: 36});
    });
  } else {
    ensure(ids.length >= 2 && ids.length <= 4, `Only two to four nodes or the qualified 16-node cohort are admitted; received ${ids.length}.`);
    const nodeWidth = 150, nodeHeight = 55, margin = 80;
    const leftEdge = margin, usable = widthPt - 2 * margin - nodeWidth;
    ids.forEach((id, index) => result.set(id, {
      centerX: leftEdge + (ids.length === 1 ? usable / 2 : (usable * index) / (ids.length - 1)) + nodeWidth / 2,
      centerY: 300, width: nodeWidth, height: nodeHeight,
    }));
  }
  return result;
}

function getElementMap(snapshot: any, slideId: string): Map<string, any> {
  const slide = snapshot?.slides?.find((candidate: any) => candidate?.objectId === slideId);
  ensure(slide && Array.isArray(slide.pageElements), `The restored Slides snapshot has no page elements for slide ${slideId}.`);
  const result = new Map<string, any>();
  for (const element of slide.pageElements) {
    ensure(typeof element?.objectId === 'string' && !result.has(element.objectId), 'The restored Slides snapshot has a missing or duplicate native object ID.');
    result.set(element.objectId, element);
  }
  return result;
}

function absoluteTransform(element: any, box: PointBox): Record<string, unknown> {
  const width = Number(element?.size?.width?.magnitude), height = Number(element?.size?.height?.magnitude);
  const current = element?.transform;
  ensure(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0 && current && Number.isFinite(current.scaleX) && Number.isFinite(current.scaleY),
    `Native shape ${String(element?.objectId)} has no stable size/transform.`);
  return {...current,
    scaleX: (box.width * emuPerPoint) / width,
    scaleY: (box.height * emuPerPoint) / height,
    translateX: (box.centerX - box.width / 2) * emuPerPoint,
    translateY: (box.centerY - box.height / 2) * emuPerPoint,
    unit: 'EMU'};
}

function rectanglePort(source: PointBox, target: PointBox): {start: number; end: number} {
  const dx = target.centerX - source.centerX, dy = target.centerY - source.centerY;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0
    ? {start: googleRectangleConnectionSites.right, end: googleRectangleConnectionSites.left}
    : {start: googleRectangleConnectionSites.left, end: googleRectangleConnectionSites.right};
  return dy >= 0 ? {start: 2, end: 0} : {start: 0, end: 2};
}

function captionBox(source: PointBox, target: PointBox, slideWidth: number, slideHeight: number): PointBox {
  const width = 110, height = 28, centerX = (source.centerX + target.centerX) / 2;
  const top = Math.max(8, Math.min(slideHeight - height - 8, (source.centerY + target.centerY) / 2 - 55));
  const boundedX = Math.max(width / 2 + 8, Math.min(slideWidth - width / 2 - 8, centerX));
  return {centerX: boundedX, centerY: top + height / 2, width, height};
}

function assertNoNodeOverlap(boxes: Map<string, PointBox>): void {
  const values = [...boxes.entries()];
  for (let a = 0; a < values.length; a++) for (let b = a + 1; b < values.length; b++) {
    const first = values[a]![1], second = values[b]![1];
    const overlapsX = Math.abs(first.centerX - second.centerX) < (first.width + second.width) / 2;
    const overlapsY = Math.abs(first.centerY - second.centerY) < (first.height + second.height) / 2;
    ensure(!(overlapsX && overlapsY), `Preview node layout overlaps ${values[a]![0]} and ${values[b]![0]}.`);
  }
}

/** Pure preview-payload builder. Semantic document values are compared and never edited. */
export async function buildSlidesPreviewLayoutPayload(input: LayoutInput): Promise<Record<string, unknown>> {
  const {caseId, sourcePath, sourceBytes, source, restored} = input;
  const visual = source?.extensions?.['umf.visual'];
  ensure(visual && Array.isArray(visual.nodes) && Array.isArray(visual.edges), `${caseId} source lacks a bounded visual graph.`);
  ensure(restored?.document && canonicalHostJson(restored.document) === canonicalHostJson(source), `${caseId} restored companion differs from the authored common source.`);
  const binding = restored.binding, observation = restored.observation;
  ensure(binding?.state === 'complete' && binding.profile === 'umf.visual.google-slides.network/1', `${caseId} needs a complete editable Slides binding.`);
  ensure(binding.modelVersion === source.vocabularies?.['umf.visual']?.version && await hostDigest(binding.source) === await hostDigest(source), `${caseId} source/model differs from its native binding.`);
  ensure(observation?.presentationId && observation?.revisionId && observation?.captureDigestSha256, `${caseId} restored observation lacks a revision/capture fence.`);
  ensure(binding.baselineNative?.captureDigestSha256 === observation.captureDigestSha256, `${caseId} binding baseline differs from the restored native capture.`);

  const slideId = binding.mappings.find((mapping: any) => mapping.kind === 'node')?.nativeScope?.replace(/^slide:/, '');
  ensure(typeof slideId === 'string' && slideId.length > 0, `${caseId} binding has no mapped slide scope.`);
  const elements = getElementMap(observation.snapshot, slideId);
  const nodeMap = parseMapping(restored, 'node'), edgeMap = parseMapping(restored, 'edge'), labelMap = parseMapping(restored, 'edge-label');
  ensure(nodeMap.size === visual.nodes.length && edgeMap.size === visual.edges.length, `${caseId} binding does not cover every source node and edge.`);
  const labeledEdges = visual.edges.filter((edge: any) => typeof edge.label === 'string');
  ensure(labelMap.size === labeledEdges.length, `${caseId} binding does not cover every source edge-caption text box.`);
  const dimensions = observation.snapshot.pageSize;
  ensure(dimensions?.width?.unit === 'EMU' && dimensions?.height?.unit === 'EMU', `${caseId} native slide size is not in expected EMU coordinates.`);
  const slideWidth = dimensions.width.magnitude / emuPerPoint, slideHeight = dimensions.height.magnitude / emuPerPoint;
  const boxes = planNodeBoxes(visual.nodes.map((node: any) => node.id), slideWidth, slideHeight);
  assertNoNodeOverlap(boxes);

  const requests: any[] = [];
  for (const node of visual.nodes) {
    const nativeId = nodeMap.get(node.id), box = boxes.get(node.id);
    ensure(nativeId && box, `Mapped Slides node ${node.id} has no native identity or layout.`);
    const element = elements.get(nativeId);
    ensure(element?.shape?.shapeType === 'RECTANGLE', `Mapped Slides node ${node.id} is not a native rectangle.`);
    requests.push({updatePageElementTransform: {objectId: nativeId, applyMode: 'ABSOLUTE', transform: absoluteTransform(element, box)}});
  }
  for (const edge of visual.edges) {
    const nativeId = edgeMap.get(edge.id), fromNativeId = nodeMap.get(edge.from), toNativeId = nodeMap.get(edge.to);
    ensure(nativeId && fromNativeId && toNativeId, `Mapped Slides edge ${edge.id} lacks native identity or valid source endpoints.`);
    const element = elements.get(nativeId);
    ensure(element?.line, `Mapped Slides edge ${edge.id} lacks a native line.`);
    const ports = rectanglePort(boxes.get(edge.from)!, boxes.get(edge.to)!);
    requests.push({updateLineProperties: {objectId: nativeId, lineProperties: {
      startConnection: {connectedObjectId: fromNativeId, connectionSiteIndex: ports.start},
      endConnection: {connectedObjectId: toNativeId, connectionSiteIndex: ports.end},
    }, fields: 'startConnection,endConnection'}});
    if (typeof edge.label === 'string') {
      const labelNativeId = labelMap.get(edge.id);
      ensure(labelNativeId, `Mapped Slides edge caption ${edge.id} has no native text-box identity.`);
      const labelElement = elements.get(labelNativeId);
      ensure(labelElement?.shape?.shapeType === 'TEXT_BOX', `Mapped Slides edge caption ${edge.id} is not a native text box.`);
      const caption = captionBox(boxes.get(edge.from)!, boxes.get(edge.to)!, slideWidth, slideHeight);
      requests.push({updatePageElementTransform: {objectId: labelNativeId, applyMode: 'ABSOLUTE', transform: absoluteTransform(labelElement, caption)}});
    }
  }
  return {
    caseId,
    presentationId: observation.presentationId,
    slideId,
    writeControl: {requiredRevisionId: observation.revisionId},
    requests,
    provenance: {generator: 'scripts/evidence/slides-preview-layout.ts', stage: 'native-only-preview-layout',
      sourcePath, sourceSha256: hash(sourceBytes), modelVersion: binding.modelVersion, profileId: binding.profile, mappingVersion: '1',
      bindingRevision: binding.bindingRevision, observedRevision: observation.revisionId, captureDigestSha256: observation.captureDigestSha256,
      semanticChangeCount: 0, semanticFieldsUpdated: [], preservesMappedNativeIds: true,
      nativeGeometryQualification: {evidenceType: 'connected Google Slides rectangle attachment probe', rectangleConnectionSites: googleRectangleConnectionSites,
        evidencePath: '.cache/p12-slides/layout-probe.png'},
      layout: visual.nodes.length === 16 ? 'sixteen-node perimeter ellipse; labels and IDs unchanged' : 'source-order single row; labels and IDs unchanged'},
  };
}

async function readCase(id: typeof caseIds[number]): Promise<LayoutInput> {
  const manifest = JSON.parse(await readFile(join(root, 'fixtures/integrations/complex-miro/manifest.json'), 'utf8'));
  const item = manifest.cases.find((candidate: any) => candidate.id === id);
  ensure(item && item.commonVisualPath, `No authored common source exists for ${id}.`);
  const sourcePath = `fixtures/integrations/complex-miro/${item.commonVisualPath}`;
  const sourceBytes = await readFile(join(root, sourcePath));
  return {caseId: id, sourcePath, sourceBytes, source: JSON.parse(sourceBytes.toString('utf8')),
    restored: JSON.parse(await readFile(join(inputDirectory, `${id}-restored.json`), 'utf8'))};
}

/** CLI emits private operator payloads only; it has no network or host-write client. */
if (import.meta.main) {
  const cases = [];
  for (const id of caseIds) cases.push(await buildSlidesPreviewLayoutPayload(await readCase(id)));
  const output = {schemaVersion: 1, profile: 'umf.visual.google-slides.preview-layout/1', hostWritesPerformed: false,
    purpose: 'Operator payload for native-only preview layout; requests require a fresh revision check before manual API application.', cases};
  await mkdir(inputDirectory, {recursive: true});
  await writeFile(outputPath, JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify({output: '.cache/p12-slides/preview-layout-payload.json', cases: cases.length, hostWritesPerformed: false}));
}
