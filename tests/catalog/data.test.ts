// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import {join, relative, sep} from 'node:path';
import {describe, expect, test} from 'bun:test';
import {exportVisual, inspectVisual, interchangeCapabilities, visualForms} from '../../src';
import {createCatalogData} from '../../scripts/catalog/build';

const targetNames = ['dot', 'mermaid', 'lini'] as const;
async function jsonFixturePaths(directory: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await jsonFixturePaths(child));
    else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'index.json') paths.push(relative(process.cwd(), child).split(sep).join('/'));
  }
  return paths;
}

describe('visual interchange catalogue data', () => {
  // @covers US-095-AC1, US-095-AC8: all examples are discoverable and primary language definitions retain exact source/hash provenance.
  test('covers every checked-in visual fixture and all authored kind/form combinations', async () => {
    const catalog = await createCatalogData();
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.items).toHaveLength(53);
    expect(catalog.language.schema.sourcePath).toBe('spec/extensions/visual/schema.json');
    expect(catalog.language.forms.sourcePath).toBe('src/extensions/visual/index.ts');
    expect(catalog.language.schema.schema).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      properties: expect.objectContaining({kind: expect.any(Object), form: expect.any(Object), nodes: expect.any(Object), edges: expect.any(Object)}),
      $defs: expect.any(Object),
    });
    const schemaDefinition = JSON.parse(await readFile('spec/extensions/visual/schema.json', 'utf8')) as any;
    expect(catalog.language.schema.schema).toEqual(schemaDefinition);
    expect(Object.keys(schemaDefinition.$defs)).toHaveLength(20);
    for (const source of [catalog.language.schema, catalog.language.forms]) {
      const bytes = await readFile(source.sourcePath);
      expect(source.sourceSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
    expect(catalog.items.filter(item => item.origin === 'fixture')).toHaveLength(50);
    expect(catalog.items.filter(item => item.origin === 'canary')).toHaveLength(3);
    expect(catalog.capabilities).toEqual(interchangeCapabilities);
    expect(new Set(catalog.items.map(item => item.kind)).size).toBe(7);
    const actualForms = new Set(catalog.items.map(item => `${item.kind}/${item.form}`));
    const expectedForms = new Set(Object.entries(visualForms).flatMap(([kind, forms]) => forms.map(form => `${kind}/${form}`)));
    expect(actualForms).toEqual(expectedForms);
    expect(catalog.language.forms.kinds).toEqual(Object.entries(visualForms).map(([kind, forms]) => ({kind, forms: [...forms]})));
    expect(catalog.language.forms.kinds.map(item => item.kind).sort()).toEqual([...schemaDefinition.properties.kind.enum].sort());
    expect(catalog.language.forms.kinds.flatMap(item => item.forms).sort()).toEqual([...schemaDefinition.properties.form.enum].sort());
    expect(new Set(catalog.items.map(item => item.sourcePath)).size).toBe(53);
    expect(new Set(catalog.items.map(item => item.id)).size).toBe(53);
    const expectedSources = (await Promise.all([
      jsonFixturePaths('fixtures/visual/forms'), jsonFixturePaths('fixtures/visual/inventory'), jsonFixturePaths('fixtures/catalog'),
    ])).flat().sort();
    expect(catalog.items.map(item => item.sourcePath)).toEqual(expectedSources);
  });

  // @covers US-095-AC2: rows are derived from actual facade exports with explicit status, diagnostics and identity maps.
  test('records exact fixture provenance and stable native export results', async () => {
    const catalog = await createCatalogData();
    for (const item of catalog.items) {
      expect(['fixture', 'canary']).toContain(item.origin);
      expect(item.sourcePath).toMatch(/^fixtures\/(visual\/(forms|inventory)|catalog)\/[a-z0-9-]+\.json$/);
      const bytes = await readFile(item.sourcePath);
      expect(item.sourceSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
      expect(item.document).toEqual(JSON.parse(bytes.toString('utf8')));
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.question.length).toBeGreaterThan(0);
      expect(inspectVisual(item.document as any).complete).toBe(true);
      for (const format of targetNames) {
        const target = item.targets[format];
        expect(['supported', 'reported-loss', 'unsupported']).toContain(target.status);
        expect(target.ok).toBe(target.status !== 'unsupported');
        expect(Array.isArray(target.diagnostics)).toBe(true);
        expect(Array.isArray(target.identityMap)).toBe(true);
        expect(target.ok ? typeof target.source === 'string' && target.source.length > 0 : target.source === undefined).toBe(true);
        const strict = exportVisual(item.document, {format, mode: 'strict'});
        const actual = strict.ok ? strict : exportVisual(item.document, {format, mode: 'allow-reported-loss'});
        expect(target.status).toBe(actual.ok ? strict.ok ? 'supported' : 'reported-loss' : 'unsupported');
        expect(target.source).toBe(actual.ok ? actual.text : undefined);
        expect(target.diagnostics).toEqual(actual.diagnostics);
        expect(target.identityMap).toEqual(actual.identityMap);
      }
    }
  });

  // @covers US-095-AC7: refused targets retain diagnostics and never receive surrogate SVG output.
  test('keeps unsupported exports explicit and non-renderable in the data-only build', async () => {
    const catalog = await createCatalogData();
    for (const item of catalog.items) for (const format of targetNames) {
      const target = item.targets[format];
      if (target.status === 'unsupported') {
        expect(target.ok).toBe(false);
        expect(target.diagnostics.length).toBeGreaterThan(0);
        expect(target.render).toBeUndefined();
      }
    }
  });

  // @covers US-095-AC1, US-095-AC2: canaries distinguish strict support, reported loss and refusal.
  test('canaries exercise hostile labels, entity fields, and explicit projection-loss receipts', async () => {
    const catalog = await createCatalogData();
    const flow = catalog.items.find(item => item.id === 'visual-catalog-canary-flow')!;
    const entities = catalog.items.find(item => item.id === 'visual-catalog-canary-entities')!;
    const supportedFlow = catalog.items.find(item => item.id === 'visual-catalog-canary-supported-flow')!;
    expect(flow.origin).toBe('canary');
    expect(flow.document).toMatchObject({extensions: {'umf.visual': {nodes: [
      {label: 'Parser says "ready" · π'}, {label: 'Renderer & output'}
    ]}}});
    for (const targetName of targetNames) expect(flow.targets[targetName].status).toBe('reported-loss');
    expect(flow.targets.mermaid.source).toContain('π');
    expect(flow.targets.lini.source).toContain('π');
    expect(supportedFlow.origin).toBe('canary');
    expect(supportedFlow.targets.dot.status).toBe('supported');
    expect(supportedFlow.targets.mermaid.status).toBe('supported');
    expect(supportedFlow.targets.lini.status).toBe('supported');
    expect(new Set(catalog.items.flatMap(item => targetNames.map(name => item.targets[name].status)))).toEqual(new Set(['supported', 'reported-loss', 'unsupported']));
    expect(entities.targets.mermaid.status).toBe('reported-loss');
    expect(entities.targets.mermaid.source).toContain('東京');
    expect(entities.targets.lini.source).toContain('東京');
  });

  // @covers US-095-AC7: repeated data generation is canonical and contains no clock or checkout-local values.
  test('produces byte-stable catalogue data for unchanged fixtures', async () => {
    const first = JSON.stringify(await createCatalogData());
    const second = JSON.stringify(await createCatalogData());
    expect(second).toBe(first);
    expect(first).not.toContain(`${process.cwd()}/`);
    expect(first).not.toContain('generatedAt');
  });
});
