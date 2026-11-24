import {expect, test} from 'bun:test';
import {createVisualDocument} from '../../src';
import {compileExcalidrawPresentation} from '../../src/adapters/excalidraw';
import {readScene} from '../../src/adapters/excalidraw/scene';

test('sequence projection draws ordered messages, a return and a self-call as native elements', () => {
  const document = createVisualDocument({
    id: 'request', kind: 'sequence', form: 'lifelines', question: 'What happens?',
    sequence: {participants: [{id: 'a', label: 'Client'}, {id: 'b', label: 'Gateway'}], messages: [
      {id: 'request', from: 'a', to: 'b', label: 'Request', kind: 'call'},
      {id: 'parse', from: 'b', to: 'b', label: 'Parse', kind: 'call'},
      {id: 'response', from: 'b', to: 'a', label: 'Response', kind: 'return'},
    ]},
  });
  const plan = compileExcalidrawPresentation(document);
  const elements = readScene(plan.text).elements;
  const messages = elements.filter(element => element.type === 'arrow');
  expect(messages).toHaveLength(3);
  expect(messages.map(message => message.y)).toEqual(messages.map(message => message.y).sort((a, b) => Number(a) - Number(b)));
  expect(messages[1]!.points).toHaveLength(4);
  expect(messages[2]!.strokeStyle).toBe('dashed');
  expect(plan.elementMap.find(row => row.nativeId === 'message-2' && row.slot === 'to')?.sourcePath)
    .toBe('/extensions/umf.visual/sequence/messages/2/to');
  expect(compileExcalidrawPresentation(document)).toEqual(plan);
});

test('trend geometry reflects irregular date spacing and exact signed numeric labels', () => {
  const document = createVisualDocument({
    id: 'volume', kind: 'metric', form: 'line', question: 'How does volume change?',
    metric: {unit: 'units', axis: {kind: 'time'}, series: [{id: 'changes', label: 'Changes', points: [
      {at: '2026-01-01', value: -2}, {at: '2026-01-02', value: 0}, {at: '2026-01-04', value: 2},
    ]}]},
  });
  const plan = compileExcalidrawPresentation(document);
  const elements = readScene(plan.text).elements;
  const point = (index: number) => elements.find(element => element.id === 'trend-point-0-' + index)!;
  expect(Number(point(2).x) - Number(point(1).x)).toBe(2 * (Number(point(1).x) - Number(point(0).x)));
  expect(Number(point(0).y)).toBeGreaterThan(Number(point(1).y));
  expect(Number(point(1).y)).toBeGreaterThan(Number(point(2).y));
  expect(elements.find(element => element.id === 'trend-point-0-0-value')?.originalText).toBe('2026-01-01 · -2');
  expect(plan.approximations[0]?.renderedAs).toMatch(/trend lines/i);
});
