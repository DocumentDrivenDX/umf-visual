// Exploratory evidence only; no production adapter API.
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import {createVisualDocument, getVisual, inspectVisual, writeVisualDocument, readVisualDocument, editVisual} from '../../../../../src/index.ts';

export async function probe() {
  const check = (condition: unknown, message: string) => { if (!condition) throw Error(message); };
  const document = createVisualDocument({
    id: 'powerpoint-probe', kind: 'flow', form: 'network',
    question: 'What calls the API?', title: 'Client calls API',
    nodes: [{id: 'client', label: 'Client', role: 'actor'}, {id: 'api', label: 'API', role: 'own'}],
    edges: [{id: 'request', from: 'client', to: 'api', label: 'Request', kind: 'action'}],
  });
  check(inspectVisual(document).complete, 'Input must be completely interpreted');
  const visual = getVisual(document);
  const deck = new PptxGenJS();
  deck.layout = 'LAYOUT_WIDE';
  deck.author = 'umf-visual integration spike';
  deck.subject = 'Synthetic export probe; not PowerPoint acceptance';
  const slide = deck.addSlide();
  slide.addText(visual.title!, {x: 0.5, y: 0.3, w: 12, h: 0.6, objectName: 'visual-title', fontSize: 24});
  const identityMap: Record<string, string[]> = {};
  // Deliberately fixed layout for this two-node experiment; no layout-engine claim.
  visual.nodes!.forEach((node, index) => {
    const name = 'umf-node-' + node.id;
    const labelName = name + '-label';
    identityMap[node.id] = [name, labelName];
    slide.addShape(deck.ShapeType.rect, {x: 1 + index * 7, y: 2, w: 3, h: 1, objectName: name, fill: {color: 'E6EEF7'}});
    slide.addText(node.label, {x: 1 + index * 7, y: 2.2, w: 3, h: 0.5, objectName: labelName, align: 'center', fontSize: 20});
  });
  identityMap.request = ['umf-edge-request', 'umf-edge-request-label'];
  slide.addShape(deck.ShapeType.line, {x: 4, y: 2.5, w: 4, h: 0, objectName: identityMap.request[0], line: {color: '333333', endArrowType: 'triangle'}});
  slide.addText('Request', {x: 4.5, y: 1.9, w: 3, h: 0.4, objectName: identityMap.request[1], align: 'center'});
  slide.addNotes(visual.question);
  const bytes = new Uint8Array(await deck.write({outputType: 'arraybuffer'}) as ArrayBuffer);
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
  check(xml.includes('Client') && xml.includes('API'), 'Editable label text missing');
  check(!xml.includes('<p:pic>'), 'Unexpected image-only export');
  for (const name of Object.values(identityMap).flat()) check(xml.includes('name="' + name + '"'), 'Missing object identity ' + name);
  const graphAttachment = xml.includes('a:stCxn') || xml.includes('a:endCxn');
  check(!graphAttachment, 'Observed line attachment baseline changed: review probe');
  const source = writeVisualDocument(document, 'json');
  check(JSON.stringify(readVisualDocument(source, 'json')) === JSON.stringify(document), 'Source sidecar recovery failed');
  const future = JSON.parse(source);
  future.extensions['umf.visual']['future-native'] = {opaque: ['retained', 42]};
  const futureDocument = readVisualDocument(JSON.stringify(future), 'json');
  const futureInspection = inspectVisual(futureDocument);
  check(futureInspection.valid && !futureInspection.complete, 'Unknown content must remain incomplete');
  check(writeVisualDocument(futureDocument, 'json').includes('future-native'), 'Unknown source content lost');
  let editRefused = false;
  try { editVisual(futureDocument, value => ({...value, title: 'Unsafe edit'})); }
  catch (error) { editRefused = (error as {code?: string}).code === 'UNSAFE_EDIT'; }
  check(editRefused, 'Unknown semantics must block edit');
  return {
    bytes, source, identityMap,
    receipt: {
      ok: true, scope: 'synthetic two-node flow/network export; package XML inspection only',
      visualVersion: '1.0.0', coreVersion: document.umf,
      writer: 'pptxgenjs 4.0.1', zipReader: 'jszip 3.10.1',
      slides: 1, mappedSemanticItems: Object.keys(identityMap).length,
      namedNativeObjects: Object.values(identityMap).flat().length,
      editableTextObserved: true, imageOnly: false, attachedConnectors: graphAttachment,
      sourceSidecarRecovery: true, unknownContentRetained: true, unsafeEditRefused: editRefused,
      losses: ['Edge endpoints are drawn as an unattached line; graph connectivity requires the source/map.', 'Role and edge-kind semantics are retained in the sidecar, not encoded by native shapes.'],
      notVerified: ['PowerPoint opening/rendering/edit/save', 'Native deck import', 'Arbitrary deck round trips', 'Layout quality', 'All other forms'],
    },
  };
}
