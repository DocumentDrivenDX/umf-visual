// SPDX-License-Identifier: MIT OR Apache-2.0
/** Normalize catalog export receipts without changing or suppressing evidence. */
import type {CatalogItem, VisualCatalog, TargetName} from './build';
import type {InterchangeDiagnostic, IdentityMapping} from '../../src/interchange';

export type FieldFamily = 'diagram' | 'application' | 'provenance' | 'presentation' | 'envelope' | 'unknown';
export type Representation = 'native-concept' | 'profile-annotation' | 'retained-only' | 'unrepresented';
export type GapOwner = 'mapping' | 'model' | 'native-capability' | 'unknown';

export interface LossGroup {
  path: string;
  family: FieldFamily;
  gapOwner: GapOwner;
  /** The exact diagnostic indices in the unchanged diagnostics array. */
  rawDiagnosticIndexes: number[];
  /** Omitted source paths below `path`, excluding `path` itself. */
  descendantPaths: string[];
  /** Kept in the grouping key so distinct explanations never collapse together. */
  reasonCode: string;
  reason: string;
}

export interface RepresentationEntry {
  path: string;
  family: FieldFamily;
  representation: Representation;
  gapOwner: GapOwner;
  rawDiagnosticIndexes: number[];
  /** True only when an adapter identity map explicitly addresses this path. */
  identityMapped: boolean;
}

export interface LossLedgerPair {
  itemId: string;
  origin: CatalogItem['origin'];
  sourcePath: string;
  sourceSha256: string;
  target: TargetName;
  comparison: 'previously-emitted' | 'newly-emitted' | 'previously-refused' | 'no-baseline';
  modelVersion: string;
  adapterProfile: {name: string; version: string; subset: string};
  nativeRuntimeVersion?: string;
  export: {status: CatalogItem['targets'][TargetName]['status']; ok: boolean; source?: string};
  /** Exact copy of the selected facade result; grouping never edits this array. */
  rawDiagnostics: InterchangeDiagnostic[];
  identityMap: IdentityMapping[];
  lossGroups: LossGroup[];
  refusalDiagnosticIndexes: number[];
  representationInventory: RepresentationEntry[];
  nativeEvidence?: {
    rendered: boolean;
    engine: string;
    nativeVersion: string;
    svgPath?: string;
    svgSha256?: string;
    renderError?: string;
    readback: 'not-captured';
  };
  selectedForRelease: boolean;
}

export interface LossLedger {
  schemaVersion: 2;
  modelVersion: string;
  capabilities: VisualCatalog['capabilities'];
  pairs: LossLedgerPair[];
}

export interface HistoricalPair {
  id: string;
  format: TargetName;
  emitted: boolean;
  sourceSha256: string;
}

const targetNames: TargetName[] = ['dot', 'mermaid', 'lini'];
const decodePointer = (value: string): string[] => value.split('/').slice(1).map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
const encodePointer = (parts: string[]): string => parts.length ? '/' + parts.map(part => part.replace(/~/g, '~0').replace(/\//g, '~1')).join('/') : '';
const isAncestor = (ancestor: string, descendant: string): boolean => {
  if (ancestor === descendant) return true;
  const a = decodePointer(ancestor), d = decodePointer(descendant);
  return a.length < d.length && a.every((part, index) => part === d[index]);
};

function familyFor(path: string, diagnostic?: InterchangeDiagnostic): FieldFamily {
  const parts = decodePointer(path);
  if (parts[0] !== 'extensions' || parts[1] !== 'umf.visual') {
    if (parts[0] === 'extensions' || parts[0] === 'vocabularies' || parts[0] === 'modules' || parts[0] === 'umf' || parts[0] === 'id') return 'envelope';
    return 'unknown';
  }
  if (parts.includes('evidence')) return 'provenance';
  const field = parts[2];
  if (field === 'source' || field === 'evidence') return 'provenance';
  if (field === 'question' || field === 'takeaway' || field === 'audience' || field === 'omissions' || field === 'steps') return 'application';
  if (field === 'title') return 'presentation';
  if (diagnostic?.code === 'INTERCHANGE_UNKNOWN_VISUAL' || field === undefined) return 'unknown';
  if (parts.some(part => part === 'role' || part === 'status' || part === 'emphasis')) return 'application';
  return 'diagram';
}

function gapOwnerFor(diagnostic: InterchangeDiagnostic): GapOwner {
  const text = `${diagnostic.code} ${diagnostic.message}`.toLowerCase();
  // Assign a cause only when the receipt states it. A bounded adapter omission
  // alone does not prove whether the native format, adapter, or shared model is at fault.
  if (/native (?:format|syntax|profile) (?:has|provides) no|has no (?:native )?(?:field|syntax|construct|semantics)|no (?:native )?(?:field|syntax|construct|semantics)/.test(text)) return 'native-capability';
  if (/adapter (?:does not|cannot)|mapping (?:does not|cannot)|serializer (?:does not|cannot)/.test(text)) return 'mapping';
  return 'unknown';
}

function inventoryPaths(document: unknown): {path: string; value: unknown}[] {
  const output: {path: string; value: unknown}[] = [];
  const visit = (value: unknown, parts: string[]) => {
    output.push({path: encodePointer(parts), value});
    if (Array.isArray(value)) value.forEach((child, index) => visit(child, [...parts, String(index)]));
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) visit(child, [...parts, key]);
  };
  visit(document, []);
  return output;
}

function mappingAddressesPath(identityMap: IdentityMapping[], path: string): boolean {
  if (identityMap.some(mapping => mapping.path === path || mapping.sourcePath === path)) return true;
  const parts = decodePointer(path);
  if (parts.at(-1) !== 'id') return false;
  const owner = encodePointer(parts.slice(0, -1));
  return identityMap.some(mapping => mapping.path === owner || mapping.sourcePath === owner);
}
function modelVersionFor(item: CatalogItem): string {
  const document = item.document as {vocabularies?: Record<string, {version?: unknown}>};
  const version = document.vocabularies?.['umf.visual']?.version;
  return typeof version === 'string' && version.length > 0 ? version : 'unknown';
}

function buildRepresentationInventory(item: CatalogItem, targetName: TargetName): RepresentationEntry[] {
  const target = item.targets[targetName];
  const diagnostics = target.diagnostics;
  const entries = inventoryPaths(item.document);
  return entries.map(({path}) => {
    const related = diagnostics.flatMap((diagnostic, index) => diagnostic.loss && (isAncestor(diagnostic.path, path) || isAncestor(path, diagnostic.path)) ? [index] : []);
    // Identity maps record correspondence candidates, not independent native
    // readback. No field is called represented until exact output/readback
    // coverage exists for that field.
    const identityMapped = mappingAddressesPath(target.identityMap, path);
    const representation: Representation = 'unrepresented';
    const classified = related.length ? familyFor(path, diagnostics[related[0]]) : familyFor(path);
    const owners = related.map(index => gapOwnerFor(diagnostics[index]));
    const gapOwner = owners.length && owners.every(owner => owner === owners[0]) ? owners[0]! : owners.length ? 'unknown' : 'unknown';
    return {path, family: classified, representation, gapOwner, rawDiagnosticIndexes: related, identityMapped};
  });
}

function normalizeLossGroups(diagnostics: InterchangeDiagnostic[], inventory: RepresentationEntry[]): LossGroup[] {
  const records = diagnostics.flatMap((diagnostic, index) => diagnostic.loss ? [{diagnostic, index, family: familyFor(diagnostic.path, diagnostic), gapOwner: gapOwnerFor(diagnostic)}] : []);
  const sameReason = (left: typeof records[number], right: typeof records[number]) => left.family === right.family && left.gapOwner === right.gapOwner && left.diagnostic.code === right.diagnostic.code && left.diagnostic.message === right.diagnostic.message;
  const seeds = records.filter(record => !records.some(other => other !== record && sameReason(record, other) && isAncestor(other.diagnostic.path, record.diagnostic.path) && other.diagnostic.path !== record.diagnostic.path));
  const groups = seeds.map(seed => {
    const members = records.filter(record => sameReason(seed, record) && isAncestor(seed.diagnostic.path, record.diagnostic.path));
    const memberIndexes = new Set(members.map(member => member.index));
    const descendants = inventory.filter(entry => entry.representation === 'unrepresented' && entry.family === seed.family && entry.path !== seed.diagnostic.path && isAncestor(seed.diagnostic.path, entry.path) && entry.rawDiagnosticIndexes.some(index => memberIndexes.has(index)));
    return {
      path: seed.diagnostic.path,
      family: seed.family,
      gapOwner: seed.gapOwner,
      rawDiagnosticIndexes: members.map(member => member.index).sort((a, b) => a - b),
      descendantPaths: [...new Set(descendants.map(entry => entry.path))].sort(),
      reasonCode: seed.diagnostic.code,
      reason: seed.diagnostic.message,
    } satisfies LossGroup;
  });
  return groups.sort((a, b) => a.path.localeCompare(b.path) || a.reasonCode.localeCompare(b.reasonCode) || a.reason.localeCompare(b.reason));
}

export function createLossLedger(
  catalog: VisualCatalog,
  historicalPairs: HistoricalPair[] = [],
): LossLedger {
  const history = new Map(historicalPairs.map(pair => [`${pair.id}\0${pair.format}`, pair]));
  const pairs: LossLedgerPair[] = [];
  const modelVersions = [...new Set(catalog.items.map(modelVersionFor))].sort();
  const catalogModelVersion = modelVersions.length === 1 ? modelVersions[0]! : modelVersions.length ? 'mixed' : 'unknown';
  for (const item of catalog.items) for (const targetName of targetNames) {
    const target = item.targets[targetName];
    const old = history.get(`${item.id}\0${targetName}`);
    if (old && old.sourceSha256 !== item.sourceSha256) throw new Error(`Loss ledger source hash differs from historical pair ${item.id}/${targetName}`);
    const inventory = buildRepresentationInventory(item, targetName);
    const render = target.render;
    const capability = catalog.capabilities.find(candidate => candidate.format === targetName);
    if (!capability) throw new Error(`Missing interchange capability for ${targetName}`);
    pairs.push({
      itemId: item.id,
      origin: item.origin,
      sourcePath: item.sourcePath,
      sourceSha256: item.sourceSha256,
      target: targetName,
      comparison: old ? old.emitted ? 'previously-emitted' : target.ok ? 'newly-emitted' : 'previously-refused' : 'no-baseline',
      modelVersion: modelVersionFor(item),
      adapterProfile: {name: capability.profile, version: capability.version, subset: capability.subset},
      ...(render ? {nativeRuntimeVersion: render.nativeVersion} : {}),
      export: {status: target.status, ok: target.ok, ...(target.source === undefined ? {} : {source: target.source})},
      rawDiagnostics: structuredClone(target.diagnostics),
      identityMap: structuredClone(target.identityMap),
      lossGroups: normalizeLossGroups(target.diagnostics, inventory),
      refusalDiagnosticIndexes: target.diagnostics.flatMap((diagnostic, index) => !target.ok && diagnostic.severity === 'error' ? [index] : []),
      representationInventory: inventory,
      ...(render ? {nativeEvidence: {
        rendered: render.ok,
        engine: render.engine,
        nativeVersion: render.nativeVersion,
        ...(render.svgPath ? {svgPath: render.svgPath} : {}),
        ...(render.svgSha256 ? {svgSha256: render.svgSha256} : {}),
        ...(render.error ? {renderError: render.error} : {}),
        readback: 'not-captured' as const,
      }} : {}),
      selectedForRelease: false,
    });
  }
  return {schemaVersion: 2, modelVersion: catalogModelVersion, capabilities: structuredClone(catalog.capabilities), pairs};
}
