// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Visual} from '../../extensions/visual/index.js';
import {utcCalendarDay} from '../../presentation/calendar.js';
import {planMetricNumericScale} from '../../presentation/numeric-scale.js';
import {planDateHistoryEvents} from '../../presentation/timeline-layout.js';
import type {VisualApproximation} from '../../interchange/full/types.js';
import {visualPath} from './profile.js';
import {base, label, type Element} from './scene.js';

type XY = [number, number];
export interface PresentationCanvas {
  elements: Element[];
  bind: (path: string, id: string, slot?: 'text' | 'from' | 'to') => void;
}

function text(canvas: PresentationCanvas, id: string, value: string, x: number, y: number, path?: string) {
  canvas.elements.push({...label(id, value, x, y, null), strokeColor: '#203746'});
  if (path) canvas.bind(path, id);
}

function line(id: string, points: XY[], color: string, options: {arrow?: boolean; dashed?: boolean} = {}): Element {
  const [x, y] = points[0]!;
  const span = (axis: 0 | 1) => Math.max(...points.map(point => point[axis])) - Math.min(...points.map(point => point[axis]));
  return {...base(id, options.arrow ? 'arrow' : 'line', x, y, span(0), span(1)),
    points: points.map(([px, py]) => [px - x, py - y]), lastCommittedPoint: null,
    startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: options.arrow ? 'arrow' : null,
    elbowed: false, roughness: 0, strokeColor: color, strokeStyle: options.dashed ? 'dashed' : 'solid'};
}

const largestLine = (value: string) => Math.max(...value.split('\n').map(part => part.length));

export function drawDateTimeline(visual: Visual, canvas: PresentationCanvas, top: number): VisualApproximation | undefined {
  const timeline = visual.timeline;
  if ((visual.form !== 'milestones' && visual.form !== 'history') || timeline?.scale.kind !== 'date' ||
      timeline.lanes?.length || timeline.spans?.length || timeline.markers?.length ||
      timeline.events?.some(event => event.lane || event.detail || event.status || event.emphasis)) return;
  const plan = planDateHistoryEvents(timeline.events ?? []);
  if (!plan?.ok) return;
  const left = 56, axisY = top + 22, width = 880;
  const x = (offset: number) => left + (plan.lastDay === plan.firstDay ? 0 : offset / (plan.lastDay - plan.firstDay) * width);
  const tracks: number[] = [];
  const ticked = new Set<number>();
  const guides: Element[] = [];
  const lineCount = Math.max(...plan.events.map(({event}) => event.label.split('\n').length));
  if (plan.lastDay !== plan.firstDay) canvas.elements.push(line('timeline-axis', [[left, axisY], [left + width, axisY]], '#93a9ba'));
  const guideStart = canvas.elements.length;
  for (const {event, sourceIndex, dayOffset} of plan.events) {
    const position = x(dayOffset);
    const cardWidth = Math.max(largestLine(event.label), event.at.length) * 12 + 24;
    let track = tracks.findIndex(end => position >= end + 16);
    if (track < 0) track = tracks.length;
    tracks[track] = position + cardWidth;
    const y = axisY + 44 + track * (lineCount * 25 + 46);
    const id = 'timeline-event-' + sourceIndex, path = visualPath + '/timeline/events/' + sourceIndex;
    if (!ticked.has(dayOffset)) {
      canvas.elements.push({...base('timeline-day-' + dayOffset, 'ellipse', position - 5, axisY - 5, 10, 10),
        strokeColor: '#356377', backgroundColor: '#356377', roughness: 0});
      ticked.add(dayOffset);
    }
    guides.push(line(id + '-guide', [[position, axisY + 5], [position, y]], '#93a9ba', {dashed: true}));
    canvas.elements.push({...base(id, 'rectangle', position, y, cardWidth, event.label.split('\n').length * 25 + 43),
      strokeColor: '#93a9ba', backgroundColor: '#edf5f5', roughness: 0});
    text(canvas, id + '-label', event.label, position + 10, y + 8, path + '/label');
    text(canvas, id + '-date', event.at, position + 10, y + 11 + event.label.split('\n').length * 25, path + '/at');
  }
  canvas.elements.splice(guideStart, 0, ...guides);
  return {path: visualPath + '/timeline/events', requested: visual.form + ' timeline',
    renderedAs: 'Dated event cards anchored to one calendar axis',
    reason: 'Horizontal position uses elapsed calendar days. Vertical tracks keep event labels apart and carry no duration or dependency meaning.'};
}

export function drawSequence(visual: Visual, canvas: PresentationCanvas, top: number): VisualApproximation | undefined {
  const sequence = visual.sequence;
  if (visual.kind !== 'sequence' || !sequence?.participants.length || !sequence.messages.length) return;
  const messages = sequence.messages;
  const column = Math.max(240, ...sequence.participants.map(participant => largestLine(participant.label) * 12 + 68),
    ...messages.map(message => largestLine(message.label) * 11 + 60));
  const positions = new Map(sequence.participants.map((participant, index) => [participant.id, 120 + column * index]));
  const groups = new Map((visual.groups ?? []).map((group, index) => [group.id, {group, index}]));
  const notes = sequence.notes ?? [];
  let y = top + 106;
  let lastGroup: string | undefined;
  for (const [index, message] of messages.entries()) {
    const path = visualPath + '/sequence/messages/' + index, id = 'message-' + index;
    const sourceGroup = message.group && groups.get(message.group);
    if (sourceGroup && message.group !== lastGroup) {
      text(canvas, id + '-group', sourceGroup.group.label, 32, y, visualPath + '/groups/' + sourceGroup.index + '/label');
      y += 32;
    }
    lastGroup = message.group;
    const from = positions.get(message.from)!, to = positions.get(message.to)!;
    const same = from === to;
    const caption = (message.kind ? message.kind + ' · ' : '') + message.label;
    text(canvas, id + '-text', caption, Math.min(from, to) + 8, y, path + '/label');
    if (message.kind) canvas.bind(path + '/kind', id + '-text');
    y += caption.split('\n').length * 25 + 8;
    const points: XY[] = same ? [[from, y], [from + 68, y], [from + 68, y + 32], [from, y + 32]] : [[from, y], [to, y]];
    canvas.elements.push(line(id, points, '#46647b', {arrow: true, dashed: message.kind === 'return'}));
    canvas.bind(path + '/from', id, 'from');
    canvas.bind(path + '/to', id, 'to');
    y += same ? 72 : 46;
  }
  const rails: Element[] = [];
  for (const [index, participant] of sequence.participants.entries()) {
    const x = positions.get(participant.id)!, id = 'participant-' + index;
    const width = Math.max(140, largestLine(participant.label) * 12 + 30);
    const height = Math.max(54, participant.label.split('\n').length * 25 + 16);
    const path = visualPath + '/sequence/participants/' + index;
    rails.push(line(id + '-rail', [[x, top + height], [x, y]], '#93a9ba', {dashed: true}));
    rails.push({...base(id, 'rectangle', x - width / 2, top, width, height),
      strokeColor: '#46647b', backgroundColor: '#edf5f5', boundElements: [{id: id + '-label', type: 'text'}]});
    rails.push(label(id + '-label', participant.label, x - width / 2 + 10, top + 10, id));
    canvas.bind(path + '/label', id + '-label');
  }
  // Insert rails beneath the messages so arrowheads remain visible.
  canvas.elements.splice(2, 0, ...rails);
  for (const [index, note] of notes.entries()) {
    text(canvas, 'sequence-note-' + index, note.text, 32, y + 12, visualPath + '/sequence/notes/' + index + '/text');
    y += note.text.split('\n').length * 25 + 14;
  }
  return {path: visualPath + '/sequence', requested: visual.form + ' sequence',
    renderedAs: 'Editable participant boxes, dashed lifelines and ordered message arrows',
    reason: 'Vertical positions show message order. Spacing carries no elapsed time, and notes appear below the messages.'};
}

const palette = ['#356377', '#b74469', '#7a6848', '#70548d', '#2d7b68', '#a85e2b'];
type Metric = NonNullable<Visual['metric']>;
const metricPath = visualPath + '/metric';
const rawNumber = (value: number) => Object.is(value, -0) ? '-0' : String(value);

function categoryLabel(metric: Metric, at: string | undefined): string | undefined {
  return metric.axis?.kind === 'category' ? metric.axis.categories.find(category => category.id === at)?.label ?? at : at;
}

function metricReferences(metric: Metric, canvas: PresentationCanvas, x: number, y: number, targetDrawn: boolean) {
  const refs = [
    ...(metric.target !== undefined && !targetDrawn ? [{id: 'target', label: 'Target', value: metric.target}] : []),
    ...(metric.baseline !== undefined ? [{id: 'baseline', label: 'Baseline', value: metric.baseline}] : []),
    ...(metric.comparison ? [{id: 'comparison/value', label: metric.comparison.label, value: metric.comparison.value}] : []),
  ];
  for (const [index, ref] of refs.entries()) {
    const id = 'metric-reference-' + index;
    text(canvas, id, ref.label + ' · ' + rawNumber(ref.value), x, y + index * 36, metricPath + '/' + ref.id);
    if (ref.id === 'comparison/value') canvas.bind(metricPath + '/comparison/label', id);
  }
}

function drawBars(metric: Metric, canvas: PresentationCanvas, top: number, scale: NonNullable<ReturnType<typeof planMetricNumericScale>>) {
  const rows = metric.series.flatMap((series, s) => series.points.map((point, p) => ({
    series, point, s, p, caption: [series.label, categoryLabel(metric, point.at)].filter(Boolean).join(' · '),
  })));
  const left = Math.max(270, ...rows.map(row => largestLine(row.caption) * 12 + 64));
  const x = (value: number) => left + (value - scale.min) / (scale.max - scale.min) * 530;
  top += 38;
  const rowHeight = 59;
  const bottom = top + rows.length * rowHeight;
  canvas.elements.push(line('bar-zero', [[x(0), top - 12], [x(0), bottom]], '#93a9ba'));
  for (const [index, row] of rows.entries()) {
    const y = top + index * rowHeight, id = 'bar-' + index;
    const valuePath = metricPath + '/series/' + row.s + '/points/' + row.p;
    text(canvas, id + '-name', row.caption, 32, y + 2, metricPath + '/series/' + row.s + '/label');
    if (row.point.at !== undefined) canvas.bind(valuePath + '/at', id + '-name');
    if (metric.axis?.kind === 'category') {
      const category = metric.axis.categories.findIndex(candidate => candidate.id === row.point.at);
      if (category >= 0) canvas.bind(metricPath + '/axis/categories/' + category + '/label', id + '-name');
    }
    const color = palette[row.s % palette.length]!;
    const location = x(row.point.value);
    canvas.elements.push({...base(id, 'rectangle', Math.min(x(0), location), y, Math.max(2, Math.abs(location - x(0))), 32),
      backgroundColor: color, strokeColor: color, roughness: 0});
    text(canvas, id + '-value', rawNumber(row.point.value), left + 548, y + 2, valuePath + '/value');
  }
  if (metric.target !== undefined) {
    const targetX = x(metric.target);
    canvas.elements.push(line('bar-target', [[targetX, top - 12], [targetX, bottom]], '#b74469', {dashed: true}));
    text(canvas, 'bar-target-label', 'Target · ' + rawNumber(metric.target), targetX + 8, bottom, metricPath + '/target');
  }
  metricReferences(metric, canvas, 32, bottom + 40, true);
}

function drawTrend(metric: Metric, canvas: PresentationCanvas, top: number, scale: NonNullable<ReturnType<typeof planMetricNumericScale>>) {
  const left = 106, width = 690, height = 320;
  top += 76;
  const rows = metric.series.flatMap((series, s) => series.points.map((point, p) => ({
    series, point, s, p, day: point.at && utcCalendarDay(point.at),
  })));
  const days = rows.flatMap(row => typeof row.day === 'number' ? [row.day] : []);
  const byDate = metric.axis?.kind === 'time' && days.length === rows.length;
  const categories = metric.axis?.kind === 'category' ? metric.axis.categories : undefined;
  const slot = (row: typeof rows[number]) => byDate ? row.day as number
    : categories ? categories.findIndex(category => category.id === row.point.at) : row.p;
  const domain = rows.map(slot), min = Math.min(...domain), max = Math.max(...domain);
  const x = (value: number) => left + (max === min ? .5 : (value - min) / (max - min)) * width;
  const y = (value: number) => top + (scale.max - value) / (scale.max - scale.min) * height;
  for (const [index, tick] of scale.ticks.entries()) {
    canvas.elements.push(line('trend-grid-' + index, [[left, y(tick)], [left + width, y(tick)]], '#ccd8e0'));
    text(canvas, 'trend-tick-' + index, rawNumber(tick), 32, y(tick) - 13);
  }
  let legendX = left;
  let tableY = top + height + 56;
  for (const [s, series] of metric.series.entries()) {
    const points = rows.filter(row => row.s === s).sort((a, b) => slot(a) - slot(b));
    const color = palette[s % palette.length]!, basePath = metricPath + '/series/' + s;
    text(canvas, 'trend-series-' + s, series.label, legendX + 24, top - 40, basePath + '/label');
    canvas.elements.push(line('trend-key-' + s, [[legendX, top - 27], [legendX + 17, top - 27]], color));
    legendX += largestLine(series.label) * 12 + 60;
    const coordinates: XY[] = points.map(row => [x(slot(row)), y(row.point.value)]);
    if (coordinates.length > 1) canvas.elements.push(line('trend-series-line-' + s, coordinates, color));
    text(canvas, 'trend-table-series-' + s, series.label, left, tableY, basePath + '/label');
    tableY += 32;
    for (const [index, row] of points.entries()) {
      const id = 'trend-point-' + s + '-' + row.p, [px, py] = coordinates[index]!;
      const path = basePath + '/points/' + row.p;
      const at = categoryLabel(metric, row.point.at);
      canvas.elements.push({...base(id, 'ellipse', px - 4, py - 4, 8, 8),
        backgroundColor: color, strokeColor: color, roughness: 0});
      text(canvas, id + '-value', [at, rawNumber(row.point.value)].filter(Boolean).join(' · '), left, tableY, path + '/value');
      if (row.point.at !== undefined) canvas.bind(path + '/at', id + '-value');
      if (categories) {
        const category = categories.findIndex(candidate => candidate.id === row.point.at);
        if (category >= 0) canvas.bind(metricPath + '/axis/categories/' + category + '/label', id + '-value');
      }
      tableY += 30;
    }
    tableY += 20;
  }
  const dated = [...new Map(rows.map(row => [slot(row), categoryLabel(metric, row.point.at)])).entries()].sort(([a], [b]) => a - b);
  let lastX = -Infinity;
  for (const [index, [value, name]] of dated.entries()) {
    const position = x(value);
    if (name === undefined || position - lastX < 128) continue;
    text(canvas, 'trend-x-tick-' + index, name, position - 25, top + height + 12);
    lastX = position;
  }
  metricReferences(metric, canvas, left, tableY, false);
}

export function drawMetric(visual: Visual, canvas: PresentationCanvas, top: number): VisualApproximation | undefined {
  const metric = visual.metric;
  if (visual.kind !== 'metric' || !metric) return;
  const values = metric.series.flatMap(series => series.points.map(point => point.value));
  if (!values.length) return;
  if (visual.form === 'meter' && (values.length !== 1 || metric.target === undefined)) return;
  const scale = planMetricNumericScale(metric.target === undefined ? values : [...values, metric.target]);
  if (!scale || !Number.isFinite(scale.max - scale.min) || scale.ticks.length > 40) return;
  text(canvas, 'metric-unit', metric.unit, 32, top, metricPath + '/unit');
  if (visual.form === 'stat' && values.length === 1) {
    const series = metric.series[0]!, point = series.points[0]!;
    const path = metricPath + '/series/0';
    text(canvas, 'stat-label', series.label, 32, top + 42, path + '/label');
    canvas.elements.push({...label('stat-value', rawNumber(point.value), 32, top + 76, null), fontSize: 44, strokeColor: '#203746'});
    canvas.bind(path + '/points/0/value', 'stat-value');
    if (point.at !== undefined) text(canvas, 'stat-at', categoryLabel(metric, point.at)!, 32, top + 140, path + '/points/0/at');
    metricReferences(metric, canvas, 32, top + 178, false);
    return {path: metricPath, requested: 'Scalar statistic', renderedAs: 'Labelled numeric readout', reason: 'The source has a single observation.'};
  }
  const bars = visual.form === 'bar' || visual.form === 'meter';
  if (bars) drawBars(metric, canvas, top, scale);
  else drawTrend(metric, canvas, top, scale);
  return {path: metricPath, requested: visual.form + ' metric',
    renderedAs: bars ? 'Editable horizontal magnitude bars with exact value labels' : 'Editable plotted points and trend lines with an exact value list',
    reason: bars ? 'The display uses a shared zero-based ruler. A minimum visible bar width marks zero.'
      : 'Validated dates use elapsed time. Other points follow authored category or point order. Values use the original numeric units.'};
}
