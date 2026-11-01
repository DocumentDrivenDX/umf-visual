// SPDX-License-Identifier: MIT OR Apache-2.0
/** Build additive catalogue rows for the opt-in full visual interchange profiles. */
import {copyJson, type Document} from '@umf/core';
import {getVisual} from '../../src/extensions/visual';
import {exportVisual, importVisual, type FullInterchangeProfile, type InterchangeFormat, type InterchangeDiagnostic, type IdentityMapping} from '../../src';
import type {ProjectionCoverage} from '../../src/interchange/annotations';
import type {VisualApproximation} from '../../src/interchange/full/types';
import type {FullProjectionRepresentation} from '../../src/interchange/full/types';
import {dotFullAdapter} from '../../src/interchange/dot/full';
import {mermaidFullAdapter} from '../../src/interchange/mermaid/full';
import {liniFullAdapter} from '../../src/interchange/lini/full';
import {quoteDotProfile, readDotProfile, type DotProfileStatement} from '../../src/interchange/dot/profile-syntax';
import {quoteLiniProfile, readLiniProfile, type LiniProfileNode, type LiniProfileToken} from '../../src/interchange/lini/profile-syntax';
import {focusedProfileSource} from './profile-views';

export type FullProfileStatus = 'supported' | 'reported-loss' | 'unsupported';
export interface FullProfileTarget {
  status: FullProfileStatus;
  /** True means a complete native source was emitted; native rendering is separate. */
  ok: boolean;
  source?: string;
  diagnostics: InterchangeDiagnostic[];
  identityMap: IdentityMapping[];
}
export interface FullCatalogProfileVariant {
  profileId: FullInterchangeProfile;
  format: InterchangeFormat;
  mappingVersion: '0.1.0';
  modelVersion: string;
  result: FullProfileTarget;
  /** Actual implementation route used under the full-profile contract. */
  representation: FullProjectionRepresentation;
  coverage: ProjectionCoverage[];
  /** Presentation approximations are not semantic omissions or losses. */
  approximations: VisualApproximation[];
}

const primitiveRepresentation = (format: InterchangeFormat, profileId: FullInterchangeProfile): FullProjectionRepresentation => ({
  tier: 'primitive-fallback', sourceProfile: profileId, sourceMappingVersion: '0.1.0',
  coverageModel: 'visible-record-tree', wholeDocumentReadback: true,
});

/** Select the renderer-only source matching the actual full-profile route. */
export function focusedFullProfilePreviewSource(source: string, format: InterchangeFormat, representation: FullProjectionRepresentation): string {
  if (representation.tier === 'native-profile') {
    if (format !== 'lini') return focusedProfileSource(source, format);
    return focusedNativeLiniFullSource(source, representation.sourceProfile);
  }
  if (representation.tier === 'primitive-fallback') return focusedFullProfileSource(source, format);
  throw new TypeError('Unknown full-profile representation tier.');
}

/**
 * The older qualified Lini flow profile includes a visible identity table.
 * It is useful interchange evidence, but it overwhelms a focused diagram.
 * Validate the complete full-profile source first, then omit only the exact
 * qualified identity table from this renderer-only view. The downloadable
 * full source and complete SVG remain untouched.
 */
function focusedNativeLiniFullSource(source: string, sourceProfile: string): string {
  const roots = readLiniProfile(source);
  if (roots.length !== 1 || roots[0]!.id !== 'umf_visual') throw new TypeError('Unexpected native-first Lini full-profile root.');
  const root = roots[0]!;
  const profile = root.children.filter(node => node.id === 'umf_profile');
  const profileText = profile.length === 1 ? profile[0]!.label : undefined;
  const visualLine = profileText?.split(/\r?\n/u).find(line => line.startsWith('Visual: '));
  const visualId = visualLine ? JSON.parse(visualLine.slice('Visual: '.length)) as unknown : undefined;
  const annotations = root.children.filter(node => node.id === 'umf_annotations');
  if (annotations.length !== 1 || annotations[0]!.type !== 'table') throw new TypeError('Missing exact Lini full-profile annotation table.');
  const annotationCells = annotations[0]!.children;
  let question: string | undefined;
  for (let index = 2; index < annotationCells.length; index += 2) {
    if (annotationCells[index]!.label === 'question') {
      const value = JSON.parse(annotationCells[index + 1]!.label ?? 'null') as unknown;
      if (typeof value !== 'string' || question !== undefined) throw new TypeError('Malformed or duplicate question annotation in Lini full-profile source.');
      question = value;
    }
  }
  if (typeof visualId !== 'string' || question === undefined) throw new TypeError('Lini full-profile source lacks its qualified visual identity or question.');
  const native = importVisual(source, {format: 'lini', profile: sourceProfile, id: visualId, question, mode: 'strict'});
  if (!native.ok || !native.document) throw new TypeError('Lini focused preview requires a valid complete native-profile source.');
  const imported = importVisual(source, {
    format: 'lini', profile: 'umf.visual.lini.full/1', id: visualId, question, mode: 'strict',
  });
  if (!imported.ok || !imported.document) throw new TypeError('Lini focused preview requires a valid complete full-profile source.');
  const identityTables = root.children.filter(node => node.id === 'umf_identity');
  if (identityTables.length > 1) throw new TypeError('Duplicate Lini identity tables cannot be focused.');
  if (identityTables.length === 1) {
    const table = identityTables[0]!;
    const property = table.properties.length === 1 ? table.properties[0] : undefined;
    const columns = property?.value.map(token => token.value).join('');
    const cells = table.children;
    if (table.type !== 'table' || table.label !== 'UMF identities /1' || property?.name !== 'columns' || columns !== '360,800' ||
      cells.length < 4 || cells.length % 2 !== 0 ||
      cells.some(cell => cell.type !== 'cell' || cell.label === undefined || cell.properties.length > 0 || cell.children.length > 0) ||
      cells[0]?.id !== 'umf_identity_native' || cells[0]?.label !== 'Native identity' ||
      cells[1]?.id !== 'umf_identity_visual' || cells[1]?.label !== 'Visual identity') {
      throw new TypeError('Lini identity table does not match the qualified full-profile structure.');
    }
    const nativeIds = new Set<string>(), visualIds = new Set<string>();
    for (let index = 2; index < cells.length; index += 2) {
      const native = cells[index]!, visual = cells[index + 1]!, row = (index - 2) / 2;
      if (native.id !== `umf_identity_native_${row}` || visual.id !== `umf_identity_visual_${row}` ||
        !native.label || !/^(?:node|edge):.+$/u.test(native.label) || !visual.label ||
        nativeIds.has(native.label) || visualIds.has(visual.label)) {
        throw new TypeError('Lini identity table contains a malformed or duplicate binding.');
      }
      nativeIds.add(native.label);
      visualIds.add(visual.label);
    }
  }
  const displayOnly = liniNode({...root, children: root.children.filter(node => node.id !== 'umf_identity')}) + '\n';
  return focusedProfileSource(displayOnly, 'lini');
}

const formats: readonly InterchangeFormat[] = ['dot', 'mermaid', 'lini'];
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
    : item);

function residualRecordIds(scene: ReturnType<typeof dotFullAdapter.read>): Set<string> {
  const represented = new Set<string>([
    ...scene.nodes.map(item => item.recordId),
    ...scene.groups.map(item => item.recordId),
    ...scene.edges.flatMap(item => [item.recordId, item.fromRecordId, item.toRecordId]),
  ].filter((value): value is string => value !== undefined));
  return new Set(scene.records.filter(record => !represented.has(record.id)).map(record => record.id));
}

function dotStatement(statement: DotProfileStatement): string {
  const attributes = (items: {name: string; value: string; html?: boolean}[]) => ' [' + items.map(item =>
    quoteDotProfile(item.name) + '=' + (item.html ? item.value : quoteDotProfile(item.value))).join(', ') + ']';
  switch (statement.kind) {
    case 'attributes': return statement.target + attributes(statement.attributes) + ';';
    case 'assignment': return quoteDotProfile(statement.name) + '=' + quoteDotProfile(statement.value) + ';';
    case 'node': return quoteDotProfile(statement.id) + attributes(statement.attributes) + ';';
    case 'edge': return quoteDotProfile(statement.from) + (statement.fromPort ? ':' + quoteDotProfile(statement.fromPort) : '') + ' -> ' +
      quoteDotProfile(statement.to) + (statement.toPort ? ':' + quoteDotProfile(statement.toPort) : '') + attributes(statement.attributes) + ';';
    case 'subgraph': return 'subgraph ' + quoteDotProfile(statement.id) + ' {\n' + statement.statements.map(dotStatement).join('\n') + '\n}';
  }
}

function stripGeneratedDotFieldNames(statement: DotProfileStatement): DotProfileStatement {
  if (statement.kind === 'node' || statement.kind === 'edge') {
    const hasRecord = statement.attributes.some(item => item.name === 'umf_has_record' && item.value === 'true');
    const hasAuthoredText = statement.attributes.some(item => item.name === 'umf_has_text' && item.value === 'true');
    return hasRecord && !hasAuthoredText
      ? {...statement, attributes: statement.attributes.filter(item => item.name !== 'xlabel')}
      : statement;
  }
  if (statement.kind === 'subgraph') {
    const metadata = statement.statements.find((item): item is Extract<DotProfileStatement, {kind: 'attributes'}> => item.kind === 'attributes' && item.target === 'graph');
    const hasRecord = metadata?.attributes.some(item => item.name === 'umf_has_record' && item.value === 'true') === true;
    const hasAuthoredText = metadata?.attributes.some(item => item.name === 'umf_has_text' && item.value === 'true') === true;
    return {...statement, statements: statement.statements.map(item => {
      if (hasRecord && !hasAuthoredText && item.kind === 'attributes' && item.target === 'graph') {
        return {...item, attributes: item.attributes.filter(attribute => attribute.name !== 'xlabel')};
      }
      return stripGeneratedDotFieldNames(item);
    })};
  }
  return statement;
}

function liniToken(token: LiniProfileToken): string { return token.kind === 'string' ? quoteLiniProfile(token.value) : token.value; }
function liniTokens(tokens: LiniProfileToken[]): string {
  let output = '', previous: LiniProfileToken | undefined;
  for (const token of tokens) {
    if (token.kind === 'symbol' && [')', '(', ','].includes(token.value)) output += token.value;
    else output += (output && previous?.value !== '(' ? ' ' : '') + liniToken(token);
    previous = token;
  }
  return output;
}
function liniNode(node: LiniProfileNode): string {
  if (node.type === 'link') {
    const property = (name: string) => node.properties.find(item => item.name === name)?.value ?? [];
    const from = property('from').map(token => token.value).join(''), operator = property('operator').map(token => token.value).join('');
    const to = property('to').map(token => token.value).join(''), label = property('label'), className = property('class').map(token => token.value).join('');
    if (!from || !to || !['->', '-'].includes(operator)) throw new TypeError('Malformed Lini link while focusing a full profile.');
    return from + ' ' + operator + ' ' + to + (label.length ? ' ' + liniTokens(label) : '') + (className ? ' .' + className : '') + ';';
  }
  const properties = node.properties.length ? ' { ' + node.properties.map(item => item.name + ': ' + liniTokens(item.value) + ';').join(' ') + ' }' : '';
  return '|' + node.type + '#' + node.id + '|' + (node.label === undefined ? '' : ' ' + quoteLiniProfile(node.label)) + properties +
    (node.children.length ? ' [\n' + node.children.map(liniNode).join('\n') + '\n]' : ';');
}

/**
 * Create a renderer-only focused source. The complete source is first parsed
 * by its full-profile reader. Known generated property/metadata appendices are
 * removed only after their IDs and contents are checked against the parsed
 * scene. This output intentionally cannot serve as interchange input.
 */
export function focusedFullProfileSource(source: string, format: InterchangeFormat): string {
  const readers = {dot: dotFullAdapter, mermaid: mermaidFullAdapter, lini: liniFullAdapter};
  const scene = readers[format].read(source);
  const residual = residualRecordIds(scene);
  if (format === 'dot') {
    const graph = readDotProfile(source, {entities: true});
    const boxes = graph.statements.filter((statement): statement is Extract<DotProfileStatement, {kind: 'subgraph'}> =>
      statement.kind === 'subgraph' && statement.id === 'cluster_umf_full_additional');
    if (boxes.length !== (residual.size ? 1 : 0)) throw new TypeError('DOT full appendix differs from the parsed residual property set.');
    const statements = graph.statements.filter(statement => !(statement.kind === 'subgraph' && statement.id === 'cluster_umf_full_additional')).map(stripGeneratedDotFieldNames);
    return '// DISPLAY ONLY: full-profile Additional properties appendix and generated field-name xlabels omitted. Complete source retains those records; authored node, edge, and group labels remain.\ndigraph ' + quoteDotProfile(graph.id) + ' {\n' +
      statements.map(dotStatement).join('\n') + '\n}\n';
  }
  if (format === 'lini') {
    const roots = readLiniProfile(source, {allowDeepEndpoints: true});
    if (roots.length !== 1 || roots[0]!.id !== 'umf_full_scene') throw new TypeError('Unexpected Lini full-profile root.');
    const omittedIds = ['umf_full_additional', 'umf_full_edge_identities', 'umf_full_approximations'];
    const groups = new Map(omittedIds.map(id => [id, roots[0]!.children.filter(node => node.id === id)]));
    if (groups.get('umf_full_additional')!.length !== (residual.size ? 1 : 0)) throw new TypeError('Lini full Additional properties appendix differs from the parsed residual property set.');
    if (groups.get('umf_full_edge_identities')!.length !== (scene.edges.length ? 1 : 0)) throw new TypeError('Lini full edge identity appendix differs from the parsed edge set.');
    if (groups.get('umf_full_approximations')!.length !== (scene.approximations.length ? 1 : 0)) throw new TypeError('Lini full approximation appendix differs from the parsed approximation set.');
    for (const id of omittedIds) if ((groups.get(id) || []).some(node => node.type !== 'group')) throw new TypeError(`Lini generated appendix ${id} is not a group.`);
    const root = {...roots[0]!, children: roots[0]!.children.filter(node => !omittedIds.includes(node.id))};
    return '// DISPLAY ONLY: full-profile Additional properties, edge identity, and visual approximation appendices omitted. They remain in the complete source and their records are shown separately.\n' + liniNode(root) + '\n';
  }
  const lines = source.split(/\r?\n/u);
  const groupId = 'g_' + [...'additional-properties'].map(char => char.charCodeAt(0).toString(16).padStart(4, '0')).join('');
  const start = lines.indexOf('subgraph ' + groupId + '["Additional properties"]');
  if ((start >= 0) !== (residual.size > 0)) throw new TypeError('Mermaid full appendix differs from the parsed residual property set.');
  if (start < 0) return '%% DISPLAY ONLY: full-profile Additional properties appendix omitted.\n' + source;
  let end = -1;
  for (let index = start + 1; index < lines.length; index++) {
    if (lines[index]!.startsWith('subgraph ')) throw new TypeError('Unexpected nested Mermaid appendix syntax.');
    if (lines[index] === 'end') { end = index; break; }
  }
  if (end < 0) throw new TypeError('Unterminated Mermaid full-profile appendix.');
  const withoutAppendix = lines.filter((line, index) => index < start || index > end).filter(line => {
    const prefix = /^%% umf-full (?:record|residual) (\{.*\})$/u.exec(line);
    if (!prefix) return true;
    const descriptor = JSON.parse(prefix[1]!) as {id?: string; recordId?: string};
    return !residual.has(descriptor.id ?? descriptor.recordId ?? '');
  });
  return '%% DISPLAY ONLY: full-profile Additional properties appendix omitted.\n' + withoutAppendix.join('\n');
}

/**
 * Produce deterministic candidate rows for all full native profiles. The row
 * is only an export/readback qualification candidate: callers must attach an
 * independently verified native render before counting it as a qualified
 * target. Approximation metadata stays distinct from diagnostic losses.
 */
export function buildFullProfileVariants(input: unknown): FullCatalogProfileVariant[] {
  const document = copyJson(input) as unknown as Document;
  const visual = getVisual(document);
  const modelVersion = document.vocabularies?.['umf.visual']?.version;
  if (typeof modelVersion !== 'string' || modelVersion.length === 0) {
    throw new TypeError('Full profile catalogue rows require a qualified umf.visual model version.');
  }
  return formats.map(format => {
    const profileId = `umf.visual.${format}.full/1` as FullInterchangeProfile;
    const strict = exportVisual(document, {format, profile: profileId, mode: 'strict'});
    const result = strict.ok
      ? strict
      : exportVisual(document, {format, profile: profileId, mode: 'allow-reported-loss'});
    const emitted = result.ok && typeof result.text === 'string';
    let readbackOkay = false;
    let diagnostics = result.diagnostics;
    let coverage: ProjectionCoverage[] = [];
    let approximations: VisualApproximation[] = [];
    let representation = result.representation ?? primitiveRepresentation(format, profileId);
    if (emitted) {
      const imported = importVisual(result.text, {
        format, profile: profileId, id: visual.id, question: visual.question,
        mode: 'allow-reported-loss',
      });
      readbackOkay = imported.ok && imported.document !== undefined && canonical(imported.document) === canonical(document);
      if (!readbackOkay) diagnostics = [...diagnostics, ...imported.diagnostics];
      else {
        coverage = imported.coverage ?? result.coverage ?? [];
        approximations = imported.approximations ?? result.approximations ?? [];
        representation = imported.representation ?? result.representation ?? representation;
        if (result.representation && imported.representation && canonical(result.representation) !== canonical(imported.representation)) {
          readbackOkay = false;
          diagnostics = [...diagnostics, {code: 'FULL_REPRESENTATION_MISMATCH', path: '/representation', message: 'Native full-profile source was read through a different qualified representation route.', severity: 'error', loss: false}];
        }
      }
    }
    if (!strict.representation) representation = primitiveRepresentation(format, profileId);
    const qualified = emitted && readbackOkay && strict.ok;
    return {
      profileId,
      format,
      mappingVersion: '0.1.0',
      modelVersion,
      result: {
        status: !emitted || !readbackOkay ? 'unsupported' : qualified ? 'supported' : 'reported-loss',
        ok: emitted && readbackOkay,
        ...(emitted ? {source: result.text!} : {}),
        diagnostics,
        identityMap: readbackOkay ? result.identityMap : [],
      },
      representation,
      coverage,
      approximations,
    };
  });
}
