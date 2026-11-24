// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '@umf/core';
import {editVisual} from '../../extensions/visual/index.js';
import {canonicalHostJson, copyHostJson, demand, exactKeys, hostDigest, record} from '../reconciliation/json.js';
import {admitSource, EXCALIDRAW_PROFILE, mappings, semanticLosses, type ExcalidrawDiagnostic,
  type ExcalidrawMapping} from './profile.js';
import {nativeChanges, readNetwork, sourceNetwork} from './readback.js';
import {createScene, readScene} from './scene.js';

export {EXCALIDRAW_PROFILE, type ExcalidrawDiagnostic, type ExcalidrawMapping} from './profile.js';
export {HostBindingError as ExcalidrawAdapterError} from '../reconciliation/json.js';

export interface ExcalidrawBinding {
  profile: typeof EXCALIDRAW_PROFILE;
  scope: string;
  revision: number;
  source: Document;
  sourceSha256: string;
  scene: string;
  sceneSha256: string;
}

export interface ExcalidrawExport {
  text: string;
  binding: ExcalidrawBinding;
  mappings: ExcalidrawMapping[];
  diagnostics: ExcalidrawDiagnostic[];
}

export interface ExcalidrawImport extends ExcalidrawExport {
  document: Document;
}

export interface ExcalidrawImportOptions {
  binding: ExcalidrawBinding;
  currentDocument: Document;
  expectedRevision: number;
}

const same = (left: unknown, right: unknown) => canonicalHostJson(left) === canonicalHostJson(right);

async function sceneDigest(scene: string): Promise<string> {
  const bytes = new TextEncoder().encode(scene);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    byte => byte.toString(16).padStart(2, '0')).join('');
}

async function bind(scope: string, revision: number, source: Document, scene: string): Promise<ExcalidrawBinding> {
  return copyHostJson<ExcalidrawBinding>({profile: EXCALIDRAW_PROFILE, scope, revision, source,
    sourceSha256: await hostDigest(source), scene, sceneSha256: await sceneDigest(scene)});
}

async function checkBinding(options: ExcalidrawImportOptions) {
  const binding = copyHostJson(options.binding);
  const current = copyHostJson(options.currentDocument);
  const revision = options.expectedRevision;
  demand(record(binding), 'BINDING', 'Expected an Excalidraw binding');
  exactKeys(binding, ['profile', 'scope', 'revision', 'source', 'sourceSha256', 'scene', 'sceneSha256']);
  demand(binding.profile === EXCALIDRAW_PROFILE && typeof binding.scope === 'string' &&
    /^[0-9a-f]{32}$/u.test(binding.scope) && Number.isSafeInteger(binding.revision) &&
    binding.revision >= 0,
  'BINDING', 'Invalid Excalidraw binding profile, scope or revision');
  demand(revision === binding.revision, 'STALE_BINDING', 'Expected revision differs from the binding');
  const {source, visual} = admitSource(binding.source);
  const scene = readScene(binding.scene);
  demand(await hostDigest(source) === binding.sourceSha256 && await sceneDigest(binding.scene) === binding.sceneSha256,
    'BINDING', 'Excalidraw binding content differs from its digests');
  demand(await hostDigest(current) === binding.sourceSha256, 'STALE_SOURCE', 'The current UMF document differs from the binding');
  demand(same(readNetwork(scene, visual, binding.scope), sourceNetwork(visual)),
    'BINDING', 'The Excalidraw baseline differs from the bound UMF projection');
  return {binding, source, visual, scene};
}

export async function exportExcalidraw(document: Document, options: {mode?: 'strict' | 'report'} = {}): Promise<ExcalidrawExport> {
  const {source, visual} = admitSource(document);
  const diagnostics = semanticLosses(source, visual);
  demand(options.mode === undefined || options.mode === 'strict' || options.mode === 'report',
    'INPUT', 'Expected strict or report mode');
  demand(options.mode === 'report' || !diagnostics.length, 'RENDER_LOSS',
    'Source fields have no qualified Excalidraw representation. Use report mode to inspect all paths.', diagnostics[0]?.path);
  const scope = crypto.randomUUID().replaceAll('-', '');
  const text = createScene(visual, scope);
  demand(same(readNetwork(readScene(text), visual, scope), sourceNetwork(visual)),
    'BINDING', 'Generated Excalidraw scene differs from its UMF projection');
  return {text, binding: await bind(scope, 0, source, text), mappings: mappings(visual, scope), diagnostics};
}

export async function importExcalidraw(text: string, options: ExcalidrawImportOptions): Promise<ExcalidrawImport> {
  const {binding, source, visual, scene} = await checkBinding(options);
  demand(binding.revision < Number.MAX_SAFE_INTEGER, 'LIMIT', 'Excalidraw binding revision exhausted');
  const editedScene = readScene(text);
  const edited = readNetwork(editedScene, visual, binding.scope);
  const document = same(edited, sourceNetwork(visual)) ? source : editVisual(source, next => {
    if (edited.title !== undefined) next.title = edited.title;
    next.question = edited.question;
    next.nodes?.forEach((node, index) => { node.label = edited.nodes[index]!; });
    next.edges?.forEach((edge, index) => { Object.assign(edge, edited.edges[index]); });
    return next;
  });
  admitSource(document);
  const slots = mappings(visual, binding.scope);
  return {document, text, binding: await bind(binding.scope, binding.revision + 1, document, text), mappings: slots,
    diagnostics: [...semanticLosses(source, visual), ...nativeChanges(scene, editedScene, slots)]};
}

export async function replayExcalidraw(options: ExcalidrawImportOptions): Promise<string> {
  const {binding} = await checkBinding(options);
  return binding.scene;
}

export {compileExcalidrawPresentation, EXCALIDRAW_PRESENTATION, type ExcalidrawPresentation} from './presentation.js';
