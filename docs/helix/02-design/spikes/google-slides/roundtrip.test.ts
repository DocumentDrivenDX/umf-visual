import {test, expect} from 'bun:test';
import {roundTripCases, reexportCases} from './roundtrip-cases';
import plan from './example-plan.json';
import before from './native-before.json';
import after from './native-after-ui.json';
import secondPlan from './second-export-plan.json';
import secondNative from './native-reexport.json';
import imported from './imported.umf.json';
test('captured real Slides UI edits import into umf.visual', async () => {
  const result = await roundTripCases(plan as any, before, after);
  expect(result.assertions).toBeGreaterThanOrEqual(18);
});
test('live second export preserves the imported semantic edits', async () => {
  expect((await reexportCases(secondPlan as any, secondNative, imported)).assertions).toBe(2);
});
