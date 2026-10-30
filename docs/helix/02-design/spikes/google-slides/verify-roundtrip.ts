// Tooling: replay captured live Google Slides edits in Bun and Chromium.
import {chromium} from 'playwright';
import {roundTripCases, reexportCases} from './roundtrip-cases';
const root = new URL('./', import.meta.url);
const plan = await Bun.file(new URL('./example-plan.json', root)).json();
const before = await Bun.file(new URL('./native-before.json', root)).json();
const after = await Bun.file(new URL('./native-after-ui.json', root)).json();
const bunResult = await roundTripCases(plan, before, after);
const secondPlan = await Bun.file(new URL('./second-export-plan.json', root)).json();
const secondNative = await Bun.file(new URL('./native-reexport.json', root)).json();
const secondResult = await reexportCases(secondPlan, secondNative, bunResult.document);
const bundle = await Bun.build({entrypoints: [new URL('./roundtrip-cases.ts', root).pathname], target: 'browser', format: 'esm'});
if (!bundle.success) throw Error(bundle.logs.join('\n'));
const js = await bundle.outputs[0]!.text();
const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage(); const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('https://spike.invalid/**', route => {
    if (route.request().url().endsWith('/cases.js')) return route.fulfill({contentType: 'text/javascript', body: js});
    if (route.request().url().endsWith('/fixtures')) return route.fulfill({json: {plan, before, after, secondPlan, secondNative}});
    return route.fulfill({contentType: 'text/html', body: '<script type="module">import {roundTripCases,reexportCases} from "/cases.js"; const {plan,before,after,secondPlan,secondNative}=await(await fetch("/fixtures")).json(); const first=await roundTripCases(plan,before,after); window.result={first,second:await reexportCases(secondPlan,secondNative,first.document)};</script>'});
  });
  await page.goto('https://spike.invalid/');
  await page.waitForFunction(() => (window as any).result !== undefined, {}, {timeout: 20000});
  const browserResult = await page.evaluate(() => (window as any).result);
  if (errors.length || JSON.stringify({first:bunResult,second:secondResult}) !== JSON.stringify(browserResult)) throw Error('Round-trip browser parity failed: ' + errors);
  await Bun.write(new URL('./imported.umf.json', root), JSON.stringify(bunResult.document, null, 2) + '\n');
  await Bun.write(new URL('./reexport-plan.json', root), JSON.stringify(bunResult.reexport, null, 2) + '\n');
  const receipt = {profile: plan.profile, nativePresentationId: before.presentationId,
    nativeBeforeRevision: before.revisionId, nativeAfterRevision: after.revisionId,
    editMethod: 'Google Slides browser UI: two label edits and node movement',
    bun: Bun.version, chromium: browser.version(), bunAssertions: bunResult.assertions + secondResult.assertions,
    browserAssertions: browserResult.first.assertions + browserResult.second.assertions, browserErrors: errors,
    snapshotReplay: true, limits: ['One adapter-owned flow/network fixture', 'Endpoint reversal and refusal cases use local mutations of native readback']};
  await Bun.write(new URL('./roundtrip-receipt.json', root), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
} finally {await browser.close();}
