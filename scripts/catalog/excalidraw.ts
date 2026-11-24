// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {Document} from '@umf/core';
import {withHeadlessExcalidraw} from '../../examples/excalidraw/headless';
import {compileExcalidrawPresentation, type ExcalidrawPresentation} from '../../src/adapters/excalidraw';
import {normalizeSvgIntrinsicDimensions} from './native-preview-presentation';
import type {CatalogItem} from './build';
import {buildExcalidrawDemo, type ExcalidrawDemo} from './excalidraw-demo';

export interface ExcalidrawCatalogExample {
  profile: ExcalidrawPresentation['profile'];
  source: {path: string; sha256: string};
  render: {svgPath: string; svgSha256: string; nativeVersion: string; chromium: string; elementCount: number};
  approximations: ExcalidrawPresentation['approximations'];
  omissions: string[];
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex');

export async function renderExcalidrawExamples(items: CatalogItem[], outputDir: string): Promise<ExcalidrawDemo> {
  const {version: nativeVersion} = await Bun.file('node_modules/@excalidraw/excalidraw/package.json').json() as {version: string};
  await mkdir(join(outputDir, 'renders'), {recursive: true});
  await mkdir(join(outputDir, 'excalidraw'), {recursive: true});
  return withHeadlessExcalidraw(async (page, chromium) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(String(error)));
    for (const item of items) {
      try {
        if (!/^[a-z0-9][a-z0-9_-]*$/u.test(item.id)) throw Error('Invalid catalog asset stem');
        const plan = compileExcalidrawPresentation(item.document as Document);
        const rendered = await page.evaluate(async text => {
          await window.editor.open(text);
          const before = JSON.parse(text).elements as Array<{
            id: string; type: string; originalText?: string; containerId?: string | null;
            startBinding?: {elementId: string}; endBinding?: {elementId: string}; endArrowhead?: string | null;
          }>;
          const after = new Map(window.editor.elements().map(element => [element.id, element]));
          if (before.length !== after.size) throw Error('Editor changed the element inventory');
          for (const element of before) {
            const restored = after.get(element.id);
            if (restored?.type !== element.type) throw Error('Editor dropped or replaced ' + element.id);
            if (restored.type === 'text' && (restored.originalText !== element.originalText ||
              restored.containerId !== element.containerId)) throw Error('Editor changed text or ownership for ' + element.id);
            if (restored.type === 'arrow' && (restored.startBinding?.elementId !== element.startBinding?.elementId ||
              restored.endBinding?.elementId !== element.endBinding?.elementId ||
              restored.endArrowhead !== element.endArrowhead)) throw Error('Editor changed an arrow binding or direction for ' + element.id);
          }
          const saved = JSON.parse(window.editor.save());
          if (saved.type !== 'excalidraw' || saved.version !== 2 || saved.elements.length !== after.size) {
            throw Error('Editor could not serialize the restored scene');
          }
          const svg = await window.editor.svg();
          const svgDocument = new DOMParser().parseFromString(svg, 'image/svg+xml');
          const normalize = (value: string) => value.replace(/\s+/gu, '');
          const renderedText = normalize(Array.from(svgDocument.querySelectorAll('text'), node => node.textContent).join(''));
          for (const element of before) {
            if (element.originalText && !renderedText.includes(normalize(element.originalText))) {
              throw Error('Native SVG omitted text for ' + element.id + ': ' + element.originalText.slice(0, 100));
            }
          }
          return {svg, elementCount: after.size};
        }, plan.text);
        if (errors.length) throw Error(errors.join('\n'));
        const {svg} = normalizeSvgIntrinsicDimensions(rendered.svg);
        const sceneSha256 = hash(plan.text), svgSha256 = hash(svg);
        const path = `excalidraw/${item.id}-${sceneSha256}.excalidraw`;
        const svgPath = `renders/${item.id}-excalidraw-${svgSha256}.svg`;
        await writeFile(join(outputDir, path), plan.text);
        await writeFile(join(outputDir, svgPath), svg);
        item.excalidraw = {profile: plan.profile, source: {path, sha256: sceneSha256},
          render: {svgPath, svgSha256, nativeVersion, chromium, elementCount: rendered.elementCount},
          approximations: plan.approximations, omissions: plan.omissions};
      } catch (error) {
        throw Error(`Excalidraw catalog example ${item.id} failed: ${String(error)}`);
      }
    }
    return buildExcalidrawDemo(page, outputDir, nativeVersion, chromium);
  });
}
