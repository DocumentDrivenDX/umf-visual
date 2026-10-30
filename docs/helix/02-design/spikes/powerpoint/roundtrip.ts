// Bounded self-exported flow/network experiment. Not a public adapter.
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import {xml2js, js2xml} from 'xml-js';
import {getVisual, inspectVisual, readVisualDocument, writeVisualDocument, editVisual} from '../../../../../src/index.ts';
import type {Document} from '@umf/core';

type X = {type?: string; name?: string; text?: string; attributes?: Record<string, string>; elements?: X[]};
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const M = 'urn:umf:visual:powerpoint:spike:1';
const PROFILE = 'umf.visual.powerpoint.spike/1';
export class RoundTripError extends Error { constructor(public code: string, message = code) { super(message); } }
const demand: (condition: unknown, code: string) => asserts condition = (condition, code) => { if (!condition) throw new RoundTripError(code); };
const element = (name: string, attributes: Record<string, string> = {}, elements: X[] = []): X => ({type: 'element', name, attributes, elements});
const children = (x: X, name: string) => (x.elements ?? []).filter(y => y.type === 'element' && y.name === name);
const one = (x: X, name: string) => { const items = children(x, name); demand(items.length === 1, 'XML_SHAPE:' + name); return items[0]!; };
const all = (x: X, name: string): X[] => [...children(x, name), ...(x.elements ?? []).flatMap(y => all(y, name))];
function parse(text: string): X {
  demand(text.length < 2_000_000 && !/<!DOCTYPE|<!ENTITY/i.test(text), 'XML_LIMIT_OR_DTD');
  const tree = xml2js(text, {compact: false}) as X;
  // This profile explicitly requires the canonical prefixes emitted by the tested tools.
  for (const node of allElements(tree)) for (const [key, value] of Object.entries(node.attributes ?? {})) {
    const expected = {'xmlns:p': P, 'xmlns:a': A, 'xmlns:r': R}[key];
    demand(!expected || value === expected, 'NAMESPACE_OVERRIDE');
  }
  return tree;
}
function allElements(x: X): X[] { return (x.elements ?? []).flatMap(y => y.type === 'element' ? [y, ...allElements(y)] : []); }
const xml = (x: X) => js2xml(x, {compact: false});
const digest = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))).map(n => n.toString(16).padStart(2, '0')).join('');
const nodeName = (id: string) => 'umf-node-' + id;
const edgeName = (id: string) => 'umf-edge-' + id;
const labelName = (id: string) => edgeName(id) + '-label';
function profile(document: Document) {
  const checked = inspectVisual(document), v = getVisual(document);
  demand(checked.valid && checked.complete, 'INCOMPLETE_SOURCE');
  demand(v.kind === 'flow' && v.form === 'network' && !v.groups?.length, 'UNSUPPORTED_PROFILE');
  demand(v.nodes?.length && v.nodes.length <= 3, 'SPIKE_LAYOUT_LIMIT');
  demand(v.title && v.question, 'TITLE_AND_QUESTION_REQUIRED');
  return v;
}
async function read(zip: JSZip, path: string) { const file = zip.file(path); demand(file, 'MISSING_PART:' + path); return parse(await file.async('string')); }
function resolvePart(base: string, target: string) {
  demand(!target.includes('\\') && !/^[a-z]+:/i.test(target) && !target.includes('%'), 'UNSAFE_TARGET');
  const parts = (target.startsWith('/') ? target.slice(1) : base.slice(0, base.lastIndexOf('/') + 1) + target).split('/');
  const out: string[] = [];
  for (const part of parts) { if (part === '..') demand(out.pop() !== undefined, 'UNSAFE_TARGET'); else if (part !== '.' && part) out.push(part); }
  return out.join('/');
}
const relPath = (part: string) => part.slice(0, part.lastIndexOf('/') + 1) + '_rels/' + part.slice(part.lastIndexOf('/') + 1) + '.rels';
function relation(rels: X, id: string, type?: string) {
  const matches = children(one(rels, 'Relationships'), 'Relationship').filter(r => r.attributes?.Id === id);
  demand(matches.length === 1 && matches[0]!.attributes?.TargetMode !== 'External', 'RELATIONSHIP');
  const attrs = matches[0]!.attributes!;
  demand(!type || attrs.Type === R + '/' + type, 'RELATIONSHIP_TYPE');
  return attrs.Target!;
}
function identity(shape: X) {
  const nv = one(shape, shape.name === 'p:cxnSp' ? 'p:nvCxnSpPr' : 'p:nvSpPr');
  return one(nv, 'p:cNvPr').attributes!;
}
function text(shape: X) {
  const body = one(shape, 'p:txBody');
  return children(body, 'a:p').map(p => (p.elements ?? []).filter(e => e.type === 'element').map(e => {
    if (e.name === 'a:pPr' || e.name === 'a:endParaRPr') return '';
    if (e.name === 'a:br') return '\n';
    demand(e.name === 'a:r', 'UNSUPPORTED_TEXT');
    return (one(e, 'a:t').elements ?? []).map(t => { demand(t.type === 'text', 'UNSUPPORTED_TEXT'); return t.text ?? ''; }).join('');
  }).join('')).join('\n');
}
export async function exportRoundTrip(document: Document) {
  const v = profile(document), source = writeVisualDocument(document, 'json');
  const deck = new PptxGenJS(); deck.layout = 'LAYOUT_WIDE';
  deck.author = 'umf-visual round-trip spike';
  const slide = deck.addSlide();
  slide.addText(v.title!, {x: .5, y: .3, w: 12, h: .6, objectName: 'umf-title', fontSize: 24});
  slide.addText(v.question, {x: .5, y: 1, w: 12, h: .5, objectName: 'umf-question', fontSize: 18});
  v.nodes!.forEach((n, i) => slide.addText(n.label, {x: .7 + i * 4.1, y: 2.3, w: 3, h: 1, shape: deck.ShapeType.rect, objectName: nodeName(n.id), fontSize: 20, fill: {color: 'E6EEF7'}, align: 'center'}));
  (v.edges ?? []).forEach((e, i) => {
    slide.addShape(deck.ShapeType.line, {x: 3.7 + i * 4.1, y: 2.8, w: 1.1, h: 0, objectName: edgeName(e.id), line: {endArrowType: 'triangle', color: '333333'}});
    slide.addText(e.label ?? '', {x: 3.3 + i * 4.1, y: 1.9, w: 2, h: .4, objectName: labelName(e.id), fontSize: 14, align: 'center'});
  });
  const zip = await JSZip.loadAsync(await deck.write({outputType: 'arraybuffer'}) as ArrayBuffer);
  const slideXml = await read(zip, 'ppt/slides/slide1.xml');
  const shapes = one(one(one(slideXml, 'p:sld'), 'p:cSld'), 'p:spTree');
  const map = new Map(children(shapes, 'p:sp').map(s => [identity(s).name, s]));
  for (const e of v.edges ?? []) {
    const connector = map.get(edgeName(e.id))!;
    const nv = one(connector, 'p:nvSpPr'); nv.name = 'p:nvCxnSpPr';
    const props = one(nv, 'p:cNvSpPr'); props.name = 'p:cNvCxnSpPr';
    props.elements = [element('a:stCxn', {id: identity(map.get(nodeName(e.from))!).id!, idx: '3'}), element('a:endCxn', {id: identity(map.get(nodeName(e.to))!).id!, idx: '1'})];
    connector.name = 'p:cxnSp';
  }
  zip.file('ppt/slides/slide1.xml', xml(slideXml));
  const manifest = {profile: PROFILE, source, sourceSha256: await digest(source)};
  zip.file('customXml/item1.xml', xml({elements: [element('umf:roundTrip', {'xmlns:umf': M}, [{type: 'text', text: JSON.stringify(manifest)}])]}));
  zip.file('customXml/itemProps1.xml', '<?xml version="1.0"?><ds:datastoreItem ds:itemID="{FE6E18B6-6A21-493B-A100-000000000094}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs/></ds:datastoreItem>');
  zip.file('customXml/_rels/item1.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdProps" Type="' + R + '/customXmlProps" Target="itemProps1.xml"/></Relationships>');
  const rels = await read(zip, 'ppt/_rels/presentation.xml.rels');
  one(rels, 'Relationships').elements!.push(element('Relationship', {Id: 'rIdUmfSource', Type: R + '/customXml', Target: '../customXml/item1.xml'}));
  zip.file('ppt/_rels/presentation.xml.rels', xml(rels));
  const types = await read(zip, '[Content_Types].xml');
  one(types, 'Types').elements!.push(element('Override', {PartName: '/customXml/itemProps1.xml', ContentType: 'application/vnd.openxmlformats-officedocument.customXmlProperties+xml'}));
  zip.file('[Content_Types].xml', xml(types));
  return zip.generateAsync({type: 'uint8array', compression: 'DEFLATE'});
}

export async function importRoundTrip(bytes: Uint8Array) {
  demand(bytes.byteLength <= 5_000_000, 'ZIP_LIMIT');
  const zip = await JSZip.loadAsync(bytes);
  demand(Object.keys(zip.files).length <= 200, 'ZIP_LIMIT');
  const rootRels = await read(zip, '_rels/.rels');
  const office = children(one(rootRels, 'Relationships'), 'Relationship').filter(r => r.attributes?.Type === R + '/officeDocument');
  demand(office.length === 1, 'PRESENTATION_COUNT');
  const presentationPath = resolvePart('', relation(rootRels, office[0]!.attributes!.Id!, 'officeDocument'));
  const presentation = await read(zip, presentationPath), rels = await read(zip, relPath(presentationPath));
  const sources = children(one(rels, 'Relationships'), 'Relationship').filter(r => r.attributes?.Type === R + '/customXml');
  const manifests: any[] = [];
  for (const source of sources) {
    const part = await read(zip, resolvePart(presentationPath, relation(rels, source.attributes!.Id!, 'customXml')));
    const candidate = children(part, 'umf:roundTrip');
    if (!candidate.length) continue;
    demand(candidate.length === 1 && candidate[0]!.attributes?.['xmlns:umf'] === M, 'SOURCE_NAMESPACE');
    manifests.push(JSON.parse((candidate[0]!.elements ?? []).map(e => { demand(e.type === 'text', 'SOURCE_XML'); return e.text; }).join('')));
  }
  demand(manifests.length === 1, 'SOURCE_MISSING_OR_DUPLICATE');
  const manifest = manifests[0];
  demand(manifest.profile === PROFILE && typeof manifest.source === 'string' && await digest(manifest.source) === manifest.sourceSha256, 'SOURCE_INTEGRITY');
  const document = readVisualDocument(manifest.source, 'json'), v = profile(document);
  const slides = children(one(one(presentation, 'p:presentation'), 'p:sldIdLst'), 'p:sldId');
  demand(slides.length === 1, 'SLIDE_COUNT');
  const slidePath = resolvePart(presentationPath, relation(rels, slides[0]!.attributes!['r:id']!, 'slide'));
  const slideXml = await read(zip, slidePath);
  const tree = one(one(one(slideXml, 'p:sld'), 'p:cSld'), 'p:spTree');
  const shapes = (tree.elements ?? []).filter(e => e.type === 'element' && !['p:nvGrpSpPr', 'p:grpSpPr', 'p:extLst'].includes(e.name!));
  demand(shapes.every(e => e.name === 'p:sp' || e.name === 'p:cxnSp'), 'UNSUPPORTED_SHAPE');
  const byName = new Map<string, X>(), byId = new Map<string, X>();
  for (const shape of shapes) {
    const attrs = identity(shape);
    demand(attrs.name && attrs.id && !byName.has(attrs.name) && !byId.has(attrs.id), 'DUPLICATE_IDENTITY');
    byName.set(attrs.name, shape); byId.set(attrs.id, shape);
  }
  const expected = ['umf-title', 'umf-question', ...v.nodes!.map(n => nodeName(n.id)), ...(v.edges ?? []).flatMap(e => [edgeName(e.id), labelName(e.id)])];
  demand(expected.length === byName.size && expected.every(name => byName.has(name)), 'IDENTITY_SET_CHANGED');
  const changes: {path: string; before: string | undefined; after: string}[] = [];
  const changed = (path: string, before: string | undefined, after: string) => { if (before !== after) changes.push({path, before, after}); return after; };
  const nodeByNativeId = new Map(v.nodes!.map(n => [identity(byName.get(nodeName(n.id))!).id, n.id]));
  const edited = editVisual(document, visual => {
    visual.title = changed('/title', visual.title, text(byName.get('umf-title')!));
    visual.question = changed('/question', visual.question, text(byName.get('umf-question')!));
    visual.nodes!.forEach((node, i) => { node.label = changed('/nodes/' + i + '/label', node.label, text(byName.get(nodeName(node.id))!)); });
    (visual.edges ?? []).forEach((edge, i) => {
      const connector = byName.get(edgeName(edge.id))!;
      demand(connector.name === 'p:cxnSp', 'UNSUPPORTED_CONNECTOR');
      const connections = one(one(connector, 'p:nvCxnSpPr'), 'p:cNvCxnSpPr');
      const from = nodeByNativeId.get(one(connections, 'a:stCxn').attributes!.id);
      const to = nodeByNativeId.get(one(connections, 'a:endCxn').attributes!.id);
      demand(from && to, 'UNBOUND_CONNECTOR');
      edge.from = changed('/edges/' + i + '/from', edge.from, from);
      edge.to = changed('/edges/' + i + '/to', edge.to, to);
      const label = text(byName.get(labelName(edge.id))!);
      if (edge.label !== undefined || label !== '') edge.label = changed('/edges/' + i + '/label', edge.label, label);
    });
    return visual;
  });
  demand(inspectVisual(edited).complete, 'INVALID_IMPORTED_VISUAL');
  return {document: edited, changes, native: new Uint8Array(bytes),
    geometry: v.nodes!.map(node => ({id: node.id, transform: one(one(byName.get(nodeName(node.id))!, 'p:spPr'), 'a:xfrm')})),
    preservation: 'Original edited PPTX bytes retained. Geometry/style are native-only; not added to umf.visual.'};
}
