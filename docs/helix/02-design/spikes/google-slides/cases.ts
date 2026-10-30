// SPDX-License-Identifier: MIT OR Apache-2.0
import {createVisualDocument} from '../../../../../src/index';
import {planSlides, type Placement} from './prototype';

export async function runCases() {
  let assertions = 0;
  function check(value: unknown, message: string) { assertions++; if (!value) throw Error(message); }
  async function refuses(action: () => Promise<unknown>, message: string) {
    let failed = false; try { await action(); } catch { failed = true; }
    check(failed, message);
  }
  const document = createVisualDocument({id: 'service-map', kind: 'flow', form: 'network',
    question: 'What calls the API?', nodes: [{id: 'client', label: 'Client'}, {id: 'api', label: 'API'}],
    edges: [{id: 'request', from: 'client', to: 'api', label: 'Request'}]});
  const source = JSON.stringify(document, null, 2) + '\n';
  const placement: Placement = {page: {width: 720, height: 405}, question: {x: 24, y: 16, width: 650, height: 40},
    nodes: {client: {x: 40, y: 140, width: 160, height: 60}, api: {x: 480, y: 140, width: 160, height: 60}},
    labels: {request: {x: 270, y: 100, width: 160, height: 30}}};
  const options = {namespace: 'spike01', revision: 'fixture-revision-not-live'};
  const plan = await planSlides(source, placement, options);
  check(plan.sidecar.source === source, 'Byte-exact source');
  check(plan.sidecar.losses.length === 0, 'Minimal supported source has no residuals');
  check(plan.batch.writeControl.requiredRevisionId === options.revision, 'Revision fence');
  check(plan.sidecar.identity.request!.length === 2, 'Edge and label identity');
  check(JSON.stringify(plan) === JSON.stringify(await planSlides(source, placement, options)), 'Deterministic plan');
  const ids = [plan.slideId, plan.questionId, ...Object.values(plan.sidecar.identity).flat()];
  check(ids.every(id => /^[a-zA-Z0-9_][a-zA-Z0-9_:-]{4,49}$/.test(id)), 'Native ID grammar/length');
  const requests = plan.batch.requests as any[];
  check(requests.filter(r => r.createShape).length === 4, 'Editable node/question/edge-label shapes');
  check(requests.some(r => r.updateLineProperties?.lineProperties.endConnection.connectedObjectId === plan.sidecar.identity.api![0]), 'Native endpoint connection');
  check(!requests.some(r => r.deleteObject || r.replaceAllText), 'No destructive/global operations');
  const rich = JSON.parse(source); rich.extensions['umf.visual'].nodes[0].status = 'unknown';
  await refuses(() => planSlides(JSON.stringify(rich), placement, options), 'Strict refuses semantic residual');
  const reported = await planSlides(JSON.stringify(rich), placement, {...options, mode: 'report'});
  check(reported.sidecar.losses.some(x => x.path === '/extensions/umf.visual/nodes/0/status'), 'Residual path');
  const unknown = JSON.parse(source); unknown.extensions['umf.visual'].vendorFuture = {opaque: true};
  await refuses(() => planSlides(JSON.stringify(unknown), placement, {...options, mode: 'report'}), 'Unknowns refuse even report export');
  const incomplete = structuredClone(placement); delete incomplete.nodes.api;
  await refuses(() => planSlides(source, incomplete, options), 'Missing placement refuses');
  const invalid = structuredClone(placement); invalid.nodes.api!.x = Infinity;
  await refuses(() => planSlides(source, invalid, options), 'Nonfinite geometry refuses');
  await refuses(() => planSlides(source, placement, {...options, revision: ''}), 'Missing revision refuses');
  const other = JSON.parse(source); other.extensions['umf.visual'].form = 'pipeline';
  await refuses(() => planSlides(JSON.stringify(other), placement, options), 'Unsupported form refuses');
  const self = JSON.parse(source); self.extensions['umf.visual'].edges[0].to = 'client';
  await refuses(() => planSlides(JSON.stringify(self), placement, options), 'Self connector refuses');
  const control = JSON.parse(source); control.extensions['umf.visual'].nodes[0].label = 'before\u0000after';
  await refuses(() => planSlides(JSON.stringify(control), placement, options), 'Text normalization risk refuses');
  const long = JSON.parse(source); const longId = 'a'.repeat(128);
  long.extensions['umf.visual'].nodes[0].id = longId; long.extensions['umf.visual'].edges[0].from = longId;
  const longPlan = await planSlides(JSON.stringify(long), {...placement, nodes: {...placement.nodes, [longId]: placement.nodes.client!}}, options);
  check(longPlan.sidecar.identity[longId]![0]!.length <= 50, '128-character UMF ID mapping');
  const reordered = JSON.parse(source); reordered.extensions['umf.visual'].nodes.reverse();
  const reorderPlan = await planSlides(JSON.stringify(reordered), placement, options);
  check(reorderPlan.sidecar.identity.client![0] === plan.sidecar.identity.client![0], 'Stable identity after reorder');
  const before = JSON.stringify(placement); plan.sidecar.placement.nodes.client!.x = 5;
  check(JSON.stringify(placement) === before, 'Placement input unchanged');
  return {ok: true, assertions, profile: plan.profile, requestCount: requests.length, plan: await planSlides(source, placement, options)};
}
