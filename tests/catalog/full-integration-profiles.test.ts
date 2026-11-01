// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {exportVisual, importVisual, type InterchangeFormat} from '../../src';
import {buildFullProfileVariants, focusedFullProfilePreviewSource} from '../../scripts/catalog/full-profiles';

const root = resolve(import.meta.dir, '../..');
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

test('five complex common integration sources produce fifteen deterministic strict full-profile readbacks', async () => {
  const paths = ['curved-caption-cross-boundary.json','frames-headings-annotations.json','nested-environments.json','network-16x24.json','process-documents-store.json'];
  let rows = 0;
  for (const name of paths) {
    const bytes = await readFile(join(root, 'fixtures/integrations/complex-miro/common', name));
    const document = JSON.parse(bytes.toString('utf8'));
    const visual = document.extensions['umf.visual'];
    const variants = buildFullProfileVariants(document);
    expect(variants.map(row => row.format).sort()).toEqual(['dot','lini','mermaid']);
    for (const variant of variants) {
      const format = variant.format as InterchangeFormat;
      const first = exportVisual(document, {format, profile: variant.profileId, mode: 'strict'});
      const second = exportVisual(document, {format, profile: variant.profileId, mode: 'strict'});
      expect(first.ok).toBe(true);
      expect(first.diagnostics).toEqual([]);
      expect(first.text).toBe(variant.result.source);
      expect(second.text).toBe(first.text);
      expect(second.identityMap).toEqual(first.identityMap);
      const imported = importVisual(first.text!, {format, profile: variant.profileId, id: visual.id, question: visual.question, mode: 'strict'});
      expect(imported.ok).toBe(true);
      expect(imported.diagnostics).toEqual([]);
      expect(canonical(imported.document)).toBe(canonical(document));
      expect(hash(canonical(first.identityMap))).toBe(hash(canonical(second.identityMap)));
      const focused = focusedFullProfilePreviewSource(first.text!, format, variant.representation);
      expect(focused.length).toBeGreaterThan(0);
      expect(hash(focused)).toMatch(/^[a-f0-9]{64}$/);
      rows++;
    }
  }
  expect(rows).toBe(15);
});
