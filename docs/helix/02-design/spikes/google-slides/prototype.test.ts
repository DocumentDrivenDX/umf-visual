import {test, expect} from 'bun:test';
import {runCases} from './cases';
test('Google Slides request planning and refusal corpus', async () => {
  const result = await runCases();
  expect(result.ok).toBe(true);
  expect(result.assertions).toBeGreaterThanOrEqual(20);
});
