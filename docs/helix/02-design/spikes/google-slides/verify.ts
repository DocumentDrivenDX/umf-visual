// Tooling only: execute the same planner/counterexamples in Bun and Chromium.
import {chromium} from 'playwright';
import {runCases} from './cases';
const bunResult = await runCases();
const entry = new URL('./cases.ts', import.meta.url).pathname;
const bundle = await Bun.build({entrypoints: [entry], target: 'browser', format: 'esm'});
if (!bundle.success) throw Error(bundle.logs.join('\n'));
const js = await bundle.outputs[0]!.text();
const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage(); const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('https://spike.invalid/**', route => {
    if (route.request().url().endsWith('/cases.js')) return route.fulfill({contentType: 'text/javascript', body: js});
    return route.fulfill({contentType: 'text/html', body: '<script type="module">import {runCases} from "/cases.js"; window.result = await runCases();</script>'});
  });
  await page.goto('https://spike.invalid/');
  await page.waitForFunction(() => (window as any).result !== undefined, {}, {timeout: 20000});
  const browserResult = await page.evaluate(() => (window as any).result);
  if (errors.length || JSON.stringify(bunResult) !== JSON.stringify(browserResult)) throw Error('Browser parity failed: ' + errors);
  const receipt = {profile: bunResult.profile, bun: Bun.version, chromium: browser.version(),
    bunAssertions: bunResult.assertions, browserAssertions: browserResult.assertions, requestCount: bunResult.requestCount,
    browserErrors: errors, nativeApiExecuted: false, limits: ['Synthetic fixture; no Google server acceptance or visual fidelity evidence']};
  await Bun.write(new URL('./receipt.json', import.meta.url), JSON.stringify(receipt, null, 2) + '\n');
  await Bun.write(new URL('./example-plan.json', import.meta.url), JSON.stringify(bunResult.plan, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
} finally { await browser.close(); }
