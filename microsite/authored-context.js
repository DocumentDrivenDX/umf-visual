export function authoredFocusTargets(visual) {
  const targets = new Map();
  const add = (id, kind, label, sourcePath) => {
    if (typeof id !== 'string' || !id) return;
    const matches = targets.get(id) || [];
    matches.push({kind, label: typeof label === 'string' && label ? label : '(no authored label)', sourcePath});
    targets.set(id, matches);
  };
  const list = (items, kind, path, labelOf) => {
    if (!Array.isArray(items)) return;
    items.forEach((item, index) => item && add(item.id, kind, labelOf(item), `${path}/${index}/id`));
  };
  const visualPath = '/extensions/umf.visual';
  list(visual.annotations, 'annotation', `${visualPath}/annotations`, item => item.text);
  list(visual.groups, 'group', `${visualPath}/groups`, item => item.label);
  list(visual.nodes, 'node', `${visualPath}/nodes`, item => item.label);
  list(visual.edges, 'edge', `${visualPath}/edges`, item => `from ${item.from}; to ${item.to}; label ${item.label || '(none)'}`);
  list(visual.steps, 'step', `${visualPath}/steps`, item => item.title);
  const sequence = visual.sequence;
  list(sequence?.participants, 'participant', `${visualPath}/sequence/participants`, item => item.label);
  list(sequence?.messages, 'message', `${visualPath}/sequence/messages`, item => `from ${item.from}; to ${item.to}; kind ${item.kind || 'unspecified'}; ${item.label}`);
  list(sequence?.notes, 'sequence note', `${visualPath}/sequence/notes`, item => item.text);
  const structure = visual.structure;
  list(structure?.layers, 'layer', `${visualPath}/structure/layers`, item => item.label);
  list(structure?.references, 'reference', `${visualPath}/structure/references`, item => `from ${item.from?.node}; to ${item.to?.node}; label ${item.label || '(none)'}`);
  const state = visual.state;
  list(state?.transitions, 'transition', `${visualPath}/state/transitions`, item => `event ${item.event}${item.guard !== undefined ? `; guard ${item.guard}` : ''}${item.action !== undefined ? `; action ${item.action}` : ''}`);
  const timeline = visual.timeline;
  if (timeline?.scale?.kind === 'period') list(timeline.scale.periods, 'period', `${visualPath}/timeline/scale/periods`, item => item.label);
  list(timeline?.lanes, 'lane', `${visualPath}/timeline/lanes`, item => item.label);
  list(timeline?.events, 'event', `${visualPath}/timeline/events`, item => `${item.label} · ${item.at}`);
  list(timeline?.spans, 'span', `${visualPath}/timeline/spans`, item => `${item.label} · ${item.start} – ${item.end}`);
  list(timeline?.markers, 'marker', `${visualPath}/timeline/markers`, item => `${item.label} · ${item.at}`);
  list(visual.comparison?.items, 'comparison item', `${visualPath}/comparison/items`, item => item.label);
  list(visual.comparison?.criteria, 'comparison criterion', `${visualPath}/comparison/criteria`, item => item.label);
  if (visual.metric?.axis?.kind === 'category') list(visual.metric.axis.categories, 'metric category', `${visualPath}/metric/axis/categories`, item => item.label);
  list(visual.metric?.series, 'metric series', `${visualPath}/metric/series`, item => item.label);
  return targets;
}

/** Explicit `when` marks an unnumbered step; absent `when` uses source-order numbering. */
export function authoredStepListPolicy(steps) {
  let numberedCount = 0;
  return (Array.isArray(steps) ? steps : []).map(step => {
    if (step && step.when === undefined) {
      numberedCount++;
      return {numbered: true, number: numberedCount, listValue: numberedCount};
    }
    return {numbered: false, number: undefined, listValue: numberedCount + 1};
  });
}

const escapePointerToken = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');

/** Return a source-addressed view of typed comparison fields without scoring or ranking items. */
export function authoredComparisonView(visual) {
  const comparison = visual?.comparison;
  if (!comparison || typeof comparison !== 'object') return null;
  const base = '/extensions/umf.visual/comparison';
  const propertyRows = (record, sourcePath, excluded = []) => Object.entries(record || {})
    .filter(([key]) => !excluded.includes(key))
    .map(([key, value]) => ({key, value, sourcePath: `${sourcePath}/${escapePointerToken(key)}`}));
  const items = (Array.isArray(comparison.items) ? comparison.items : []).map((item, index) => ({
    id: item?.id,
    label: item?.label,
    sourcePath: `${base}/items/${index}`,
    fields: propertyRows(item, `${base}/items/${index}`, ['id', 'label']),
  }));
  const criteria = (Array.isArray(comparison.criteria) ? comparison.criteria : []).map((criterion, index) => ({
    id: criterion?.id,
    label: criterion?.label,
    sourcePath: `${base}/criteria/${index}`,
    fields: propertyRows(criterion, `${base}/criteria/${index}`, ['id', 'label']),
  }));
  const values = (Array.isArray(comparison.values) ? comparison.values : []).map((entry, index) => ({
    item: entry?.item,
    criterion: entry?.criterion,
    sourcePath: `${base}/values/${index}`,
    fields: propertyRows(entry, `${base}/values/${index}`, ['item', 'criterion']),
  }));
  const axes = comparison.axes && typeof comparison.axes === 'object'
    ? propertyRows(comparison.axes, `${base}/axes`)
    : [];
  const chosen = comparison.chosen && typeof comparison.chosen === 'object'
    ? {item: comparison.chosen.item, itemSourcePath: `${base}/chosen/item`, reason: comparison.chosen.reason, reasonSourcePath: `${base}/chosen/reason`}
    : null;
  const omissions = (Array.isArray(visual.omissions) ? visual.omissions : []).map((text, index) => ({text, sourcePath: `/extensions/umf.visual/omissions/${index}`}));
  return {axes, items, criteria, values, chosen, omissions};
}

/** Return a source-addressed view of metric declarations and points without computing progress. */
export function authoredMetricView(visual) {
  const metric = visual?.metric;
  if (!metric || typeof metric !== 'object') return null;
  const base = '/extensions/umf.visual/metric';
  const fields = (record, sourcePath, excluded = []) => Object.entries(record || {})
    .filter(([key]) => !excluded.includes(key))
    .map(([key, value]) => ({key, value, sourcePath: `${sourcePath}/${escapePointerToken(key)}`}));
  const series = (Array.isArray(metric.series) ? metric.series : []).map((entry, seriesIndex) => {
    const sourcePath = `${base}/series/${seriesIndex}`;
    const points = (Array.isArray(entry?.points) ? entry.points : []).map((point, pointIndex) => ({
      sourcePath: `${sourcePath}/points/${pointIndex}`,
      fields: fields(point, `${sourcePath}/points/${pointIndex}`),
    }));
    return {
      id: entry?.id,
      idSourcePath: `${sourcePath}/id`,
      label: entry?.label,
      labelSourcePath: `${sourcePath}/label`,
      sourcePath,
      fields: fields(entry, sourcePath, ['id', 'label', 'points']),
      points,
    };
  });
  return {fields: fields(metric, base, ['series']), series};
}
