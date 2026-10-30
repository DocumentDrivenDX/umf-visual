// SPDX-License-Identifier: MIT OR Apache-2.0
import {getVisual, inspectVisual, writeVisualDocument} from '../../../../../src/index';
import {bindRoundTrip, importSlidesEdits} from './roundtrip';
import {planSlides} from './prototype';
import type {Binding} from './roundtrip';

export async function roundTripCases(plan: Binding['plan'], before: Record<string, any>, after: Record<string, any>) {
  let assertions = 0;
  function check(value: unknown, message: string) { assertions++; if (!value) throw Error(message); }
  async function refuses(action: () => Promise<unknown>, message: string) {
    let failed = false; try { await action(); } catch { failed = true; } check(failed, message);
  }
  const binding = await bindRoundTrip(plan, before);
  const unchanged = await importSlidesEdits(binding, before);
  check(JSON.stringify(getVisual(unchanged.document)) === JSON.stringify(getVisual(JSON.parse(plan.sidecar.source))), 'Unedited semantic round trip');
  const result = await importSlidesEdits(binding, after);
  const visual = getVisual(result.document);
  check(visual.nodes!.find(n => n.id === 'client')!.label === 'Browser client', 'Native UI node-label edit imported');
  check(visual.edges![0]!.label === 'HTTPS request', 'Native UI edge-label edit imported');
  check(Math.abs(result.placement.nodes.client!.y - 152) < 0.1, 'Native UI movement normalized EMU to PT');
  check(!('x' in visual.nodes![0]!), 'Coordinates stay outside semantic vocabulary');
  check(inspectVisual(result.document).valid && inspectVisual(result.document).complete, 'Imported visual validates completely');
  check(JSON.stringify(result.native) === JSON.stringify(after), 'All native/unknown fields retained');
  check(JSON.stringify(binding.baseline) === JSON.stringify(before), 'Baseline input unchanged');
  const reexport = await planSlides(writeVisualDocument(result.document, 'json'), result.placement, {namespace: 'spike01', revision: after.revisionId});
  check(reexport.sidecar.identity.client![0] === plan.sidecar.identity.client![0], 'Reexport retains identities');
  check(reexport.batch.requests.some((r: any) => r.insertText?.text === 'Browser client'), 'Reexport uses edited node text');
  const slide = (n: any) => n.slides.find((s: any) => s.objectId === plan.slideId);
  const missing = structuredClone(after); slide(missing).pageElements.pop();
  await refuses(() => importSlidesEdits(binding, missing), 'Deleted native object refuses');
  const added = structuredClone(after); slide(added).pageElements.push({objectId: 'new_unknown', image: {}});
  await refuses(() => importSlidesEdits(binding, added), 'New native content refuses semantic replacement');
  await refuses(() => importSlidesEdits(binding, after, plan.sidecar.source + ' '), 'Concurrent UMF source edit refuses');
  await refuses(() => importSlidesEdits(binding, {...after, presentationId: 'wrong'}), 'Wrong presentation refuses');
  const detached = structuredClone(after);
  slide(detached).pageElements.find((e: any) => e.line).line.lineProperties.endConnection = {connectedObjectId: 'unknown'};
  await refuses(() => importSlidesEdits(binding, detached), 'Unmapped endpoint refuses');
  const reversed = structuredClone(after);
  const p = slide(reversed).pageElements.find((e: any) => e.line).line.lineProperties;
  [p.startConnection, p.endConnection] = [p.endConnection, p.startConnection];
  const reconnect = getVisual((await importSlidesEdits(binding, reversed)).document).edges![0]!;
  check(reconnect.from === 'api' && reconnect.to === 'client', 'Directed endpoint edits imported');
  const rotated = structuredClone(after);
  slide(rotated).pageElements.find((e: any) => e.objectId === plan.sidecar.identity.client![0]).transform.shearX = 0.5;
  await refuses(() => importSlidesEdits(binding, rotated), 'Unsupported rotation refuses');
  const unknown = structuredClone(after); unknown.futureNative = {opaque: [1, 2, 3]};
  check((await importSlidesEdits(binding, unknown)).native.futureNative.opaque.length === 3, 'Future native fields retained');
  return {assertions, document: result.document, placement: result.placement, reexport};
}

export async function reexportCases(plan: Binding['plan'], native: Record<string, any>, expected: any) {
  const binding = await bindRoundTrip(plan, native);
  const result = await importSlidesEdits(binding, native);
  if (JSON.stringify(getVisual(result.document)) !== JSON.stringify(getVisual(expected)))
    throw Error('Live second export changed imported semantic meaning');
  if (!inspectVisual(result.document).complete) throw Error('Second export readback incomplete');
  return {assertions: 2, document: result.document};
}
