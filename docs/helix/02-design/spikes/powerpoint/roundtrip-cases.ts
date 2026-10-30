import JSZip from 'jszip';
import {createVisualDocument, getVisual, writeVisualDocument} from '../../../../../src/index.ts';
import {exportRoundTrip, importRoundTrip, RoundTripError} from './roundtrip.ts';

export const sourceDocument = () => createVisualDocument({
  id: 'powerpoint-roundtrip', kind: 'flow', form: 'network',
  title: 'Client calls API', question: 'What calls the API?',
  takeaway: 'Semantic annotations survive native edits.',
  source: {path: 'synthetic/powerpoint-roundtrip', digest: 'authored-spike-fixture'},
  nodes: [
    {id: 'client', label: 'Client', role: 'actor', status: 'built', evidence: [{path: 'synthetic/client'}]},
    {id: 'api', label: 'API', role: 'own'},
    {id: 'store', label: 'Store', role: 'store'},
  ],
  edges: [{id: 'request', from: 'client', to: 'api', label: 'Request', kind: 'action', why: 'Exercise native reconnection'}],
});
export function expect(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export async function controls() {
  const source = sourceDocument(), original = JSON.stringify(source);
  const bytes = await exportRoundTrip(source);
  const passed: string[] = [];
  async function test(name: string, fn: () => Promise<void>) { await fn(); passed.push(name); }
  const mutate = async (part: string, fn: (s: string) => string) => {
    const zip = await JSZip.loadAsync(bytes);
    zip.file(part, fn(await zip.file(part)!.async('string')));
    return zip.generateAsync({type: 'uint8array'});
  };
  async function rejects(name: string, edited: Promise<Uint8Array>, code: string) {
    await test(name, async () => {
      let result: unknown;
      try { await importRoundTrip(await edited); } catch (error) { result = error; }
      expect(result instanceof RoundTripError && result.code === code, name + ': expected ' + code + ', got ' + String(result));
      expect(JSON.stringify(source) === original, 'Rejected import changed original source');
    });
  }
  await test('no-op recovers full embedded semantic source without sidecar', async () => {
    const result = await importRoundTrip(bytes);
    expect(equal(result.document, source) && result.changes.length === 0, 'No-op changed source');
    expect(equal([...result.native], [...bytes]), 'Native bytes changed');
  });
  await test('Unicode XML text edits load into semantic labels', async () => {
    const edited = await mutate('ppt/slides/slide1.xml', s => s.replace('<a:t>Client</a:t>', '<a:t>Browser &amp; café 東京</a:t>'));
    const result = await importRoundTrip(edited);
    expect(getVisual(result.document).nodes![0]!.label === 'Browser & café 東京', 'Unicode text lost');
    expect(result.changes.length === 1, 'Unexpected extra edits');
  });
  await test('multiple text runs and paragraphs retain line breaks', async () => {
    const edited = await mutate('ppt/slides/slide1.xml', s => s.replace('<a:t>Client</a:t>', '<a:t>Web</a:t>').replace('<a:t>Web</a:t></a:r>', '<a:t>Web</a:t></a:r><a:r><a:t> client</a:t></a:r><a:br/><a:r><a:t>v2</a:t></a:r>'));
    expect(getVisual((await importRoundTrip(edited)).document).nodes![0]!.label === 'Web client\nv2', 'Runs or breaks lost');
  });
  await rejects('renamed node is not guessed by position', mutate('ppt/slides/slide1.xml', s => s.replace('name="umf-node-client"', 'name="renamed-shape"')), 'IDENTITY_SET_CHANGED');
  await rejects('duplicate shape identity is ambiguous', mutate('ppt/slides/slide1.xml', s => s.replace('name="umf-node-api"', 'name="umf-node-client"')), 'DUPLICATE_IDENTITY');
  await rejects('deleted node refuses partial import', mutate('ppt/slides/slide1.xml', s => s.replace(/<p:sp>[^]*?<\/p:sp>/g, block => block.includes('name="umf-node-client"') ? '' : block)), 'IDENTITY_SET_CHANGED');
  await rejects('unattached edge refuses inferred relation', mutate('ppt/slides/slide1.xml', s => s.replace(/<a:endCxn[^]*?\/>/, '')), 'XML_SHAPE:a:endCxn');
  await rejects('tampered source digest refuses import', mutate('customXml/item1.xml', s => s.replace(/sourceSha256&quot;:&quot;[a-f0-9]+/, 'sourceSha256&quot;:&quot;' + '0'.repeat(64)).replace(/sourceSha256":"[a-f0-9]+/, 'sourceSha256":"' + '0'.repeat(64))), 'SOURCE_INTEGRITY');
  await rejects('duplicate metadata refuses source selection', mutate('ppt/_rels/presentation.xml.rels', s => s.replace('</Relationships>', '<Relationship Id="duplicateSource" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item1.xml"/></Relationships>')), 'SOURCE_MISSING_OR_DUPLICATE');
  await rejects('DTD is not accepted', mutate('ppt/slides/slide1.xml', s => '<!DOCTYPE unsafe>' + s), 'XML_LIMIT_OR_DTD');
  await test('original semantic source remains immutable', async () => { expect(JSON.stringify(source) === original, 'Source mutated'); });
  return {passed, count: passed.length};
}
export async function verifyNative(noopBytes: Uint8Array, editedBytes: Uint8Array) {
  const source = sourceDocument();
  const noop = await importRoundTrip(noopBytes), edited = await importRoundTrip(editedBytes);
  expect(equal(noop.document, source) && noop.changes.length === 0, 'PowerPoint no-op changed semantics');
  const visual = getVisual(edited.document);
  expect(visual.title === 'Native round trip verified', 'Native title missing');
  expect(visual.question === 'What changed in PowerPoint?', 'Native question missing');
  expect(visual.nodes![0]!.label === 'Browser café 東京', 'Native Unicode node edit missing');
  expect(visual.edges![0]!.label === 'Fetch via PowerPoint', 'Native edge label missing');
  expect(visual.edges![0]!.from === 'client' && visual.edges![0]!.to === 'store', 'Native connector reconnection missing');
  const expected = getVisual(source);
  expected.title = visual.title; expected.question = visual.question;
  expected.nodes![0]!.label = visual.nodes![0]!.label;
  expected.edges![0]!.label = visual.edges![0]!.label;
  expected.edges![0]!.to = 'store';
  expect(equal(visual, expected), 'Untouched semantic metadata lost');
  expect(!equal(noop.geometry, edited.geometry), 'Native node movement absent');
  expect(edited.changes.length === 5, 'Unexpected native semantic change count');
  const second = await importRoundTrip(await exportRoundTrip(edited.document));
  expect(equal(second.document, edited.document), 'Second semantic cycle changed imported edits');
  return {noop, edited, checks: {nativeNoopExactSemantics: true, nativeLabelEdits: true, nativeReconnection: true, nativeMovementRetained: true, untouchedSemanticsPreserved: true, secondSemanticCycle: true}, imported: writeVisualDocument(edited.document, 'json')};
}

export {exportRoundTrip, importRoundTrip} from './roundtrip.ts';
