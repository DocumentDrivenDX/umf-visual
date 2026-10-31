// SPDX-License-Identifier: MIT OR Apache-2.0
/** Versioned, preview-only styling shared by catalog and integration renders. */

export const nativePreviewPresentation = {
  id: 'umf.visual.preview',
  version: '1',
  svgNormalization: 'svg-viewbox-intrinsic-dimensions/1',
  graphviz: {
    // These are renderer defaults: explicit attributes in the authored DOT source win.
    args: [
      '-Gbgcolor=transparent', '-Gfontname=Arial', '-Gfontsize=18', '-Gfontcolor=#203746',
      '-Gpad=0.30', '-Gnodesep=0.65', '-Granksep=0.75',
      '-Nshape=box', '-Nstyle=rounded,filled', '-Nfillcolor=#edf5f5', '-Ncolor=#577782',
      '-Nfontname=Arial', '-Nfontsize=14', '-Nfontcolor=#203746', '-Nmargin=0.16,0.10',
      '-Ecolor=#66808a', '-Efontname=Arial', '-Efontsize=12', '-Efontcolor=#304652',
    ],
  },
  mermaid: {
    theme: 'base',
    look: 'classic',
    fontFamily: 'Arial, "Avenir Next", "Segoe UI", sans-serif',
    themeVariables: {
      background: '#ffffff',
      primaryColor: '#e8f2f3',
      primaryTextColor: '#203746',
      primaryBorderColor: '#577782',
      lineColor: '#587582',
      secondaryColor: '#edf2f8',
      secondaryTextColor: '#203746',
      secondaryBorderColor: '#71869b',
      tertiaryColor: '#f5f4ef',
      tertiaryTextColor: '#263842',
      tertiaryBorderColor: '#96988e',
      mainBkg: '#e8f2f3',
      secondBkg: '#edf2f8',
      clusterBkg: '#f5f7f7',
      clusterBorder: '#c5d0d5',
      titleColor: '#203746',
      edgeLabelBackground: '#ffffff',
      fontSize: '16px',
    },
  },
} as const;

export type NativePreviewEngine = 'graphviz' | 'mermaid' | 'lini';

/** Include exact renderer options and root-only normalization in each render receipt. */
export function previewPresentationReceipt(engine: NativePreviewEngine) {
  const rendererOptions = engine === 'graphviz'
    ? {args: [...nativePreviewPresentation.graphviz.args]}
    : engine === 'mermaid'
      ? {
        theme: nativePreviewPresentation.mermaid.theme,
        look: nativePreviewPresentation.mermaid.look,
        fontFamily: nativePreviewPresentation.mermaid.fontFamily,
        themeVariables: {...nativePreviewPresentation.mermaid.themeVariables},
      }
      : {compilerOptions: 'native-defaults'};
  return {
    id: nativePreviewPresentation.id,
    version: nativePreviewPresentation.version,
    rendererOptions,
    svgNormalization: nativePreviewPresentation.svgNormalization,
  };
}

export interface NormalizedSvg {
  svg: string;
  width: number;
  height: number;
}

/** Set standalone dimensions to the existing viewBox without changing SVG geometry. */
export function normalizeSvgIntrinsicDimensions(source: string): NormalizedSvg {
  const match = /<svg\b[^>]*>/i.exec(source);
  if (!match) throw new Error('Native renderer output has no SVG root element.');
  const root = match[0];
  const viewBoxMatch = /\bviewBox\s*=\s*(["'])(.*?)\1/i.exec(root);
  if (!viewBoxMatch) throw new Error('Native renderer SVG has no viewBox for standalone normalization.');
  const values = viewBoxMatch[2]!.trim().split(/[\s,]+/).map(Number);
  if (values.length !== 4 || values.some(value => !Number.isFinite(value)) || values[2]! <= 0 || values[3]! <= 0) {
    throw new Error('Native renderer SVG has an invalid viewBox.');
  }
  const width = values[2]!, height = values[3]!;
  const setDimension = (text: string, name: 'width' | 'height', value: number) => {
    const attribute = new RegExp(`(\\s${name}\\s*=\\s*)(["'])[^"']*\\2`, 'i');
    if (attribute.test(text)) return text.replace(attribute, `$1"${String(value)}"`);
    return text.replace(/\s*\/?>$/, ending => ` ${name}="${String(value)}"${ending}`);
  };
  let normalizedRoot = setDimension(root, 'width', width);
  normalizedRoot = setDimension(normalizedRoot, 'height', height);
  return {svg: source.slice(0, match.index) + normalizedRoot + source.slice(match.index + root.length), width, height};
}

