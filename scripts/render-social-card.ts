// Regenerate the crawler-friendly PNG after editing microsite/social-card.svg.
// Run: bun scripts/render-social-card.ts
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(resolve('microsite/social-card.svg')).href);
  await page.screenshot({ path: 'microsite/social-card.png' });
} finally {
  await browser.close();
}
