// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe, expect, test} from 'bun:test';
import {
  nativePreviewPresentation,
  normalizeSvgIntrinsicDimensions,
  previewPresentationReceipt,
} from '../../scripts/catalog/native-preview-presentation';

describe('native preview presentation', () => {
  test('normalizes only root SVG dimensions and retains the raw geometry and attributes', () => {
    const raw = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="72pt" height="36pt" viewBox="-10 4 120 60" preserveAspectRatio="xMidYMid meet"><path d="M-10 4 L110 64" stroke="#123456"/></svg>';
    const result = normalizeSvgIntrinsicDimensions(raw);
    expect(result.width).toBe(120);
    expect(result.height).toBe(60);
    expect(result.svg).toContain('width="120" height="60"');
    expect(result.svg).toContain('viewBox="-10 4 120 60"');
    expect(result.svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(result.svg.slice(result.svg.indexOf('<path'))).toBe(raw.slice(raw.indexOf('<path')));
  });

  test('adds dimensions when the native SVG only supplies a viewBox', () => {
    const result = normalizeSvgIntrinsicDimensions('<svg viewBox="0,0,400,200"><g id="native"><rect x="1" y="2" width="3" height="4"/></g></svg>');
    expect(result.svg).toBe('<svg viewBox="0,0,400,200" width="400" height="200"><g id="native"><rect x="1" y="2" width="3" height="4"/></g></svg>');
  });

  test('rejects SVG that cannot be normalized safely', () => {
    expect(() => normalizeSvgIntrinsicDimensions('<svg width="20" height="10"></svg>')).toThrow('no viewBox');
    expect(() => normalizeSvgIntrinsicDimensions('<svg viewBox="0 0 0 2"></svg>')).toThrow('invalid viewBox');
  });

  test('records the exact versioned presentation for each native engine', () => {
    expect(nativePreviewPresentation.id).toBe('umf.visual.preview');
    expect(nativePreviewPresentation.version).toBe('1');
    expect(previewPresentationReceipt('graphviz')).toMatchObject({id: 'umf.visual.preview', version: '1', svgNormalization: 'svg-viewbox-intrinsic-dimensions/1', rendererOptions: {args: expect.arrayContaining(['-Nshape=box', '-Nstyle=rounded,filled', '-Nfontname=Arial'])}});
    expect(previewPresentationReceipt('mermaid')).toMatchObject({rendererOptions: {theme: 'base', fontFamily: expect.stringContaining('Arial'), themeVariables: {primaryColor: '#e8f2f3', lineColor: '#587582'}}});
    expect(previewPresentationReceipt('lini')).toMatchObject({rendererOptions: {compilerOptions: 'native-defaults'}});
  });

  test('Graphviz defaults style nodes while authored node presentation still wins', async () => {
    const source = 'digraph sample { default [label="Default"] explicit [label="Explicit", shape=ellipse, style=filled, fillcolor="#fffdf8", color="#9b3744"]; }';
    const child = Bun.spawn(['dot', ...nativePreviewPresentation.graphviz.args, '-Tsvg'], {stdin: 'pipe', stdout: 'pipe', stderr: 'pipe'});
    child.stdin.write(source);
    child.stdin.end();
    const [svg, stderr, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(status, stderr).toBe(0);
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('fill="#edf5f5"');
    expect(svg).toContain('fill="#fffdf8"');
    expect(svg).toContain('stroke="#9b3744"');
  });
});
