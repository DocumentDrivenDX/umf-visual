// SPDX-License-Identifier: MIT OR Apache-2.0
import {createVisualDocument, readVisualDocument, writeVisualDocument} from '../../src/index.js';
import {exportEditableMiroVisual, importEditableMiroVisual, updateEditableMiroVisual,
  captureEditableMiroBoard, readEditableMiroBinding, writeEditableMiroBinding, type EditableBinding, type EditableMiroBoard} from '../../src/adapters/miro/editable/index.js';

declare const miro: {
  board: EditableMiroBoard & {
    ui: {on(event: 'icon:click', callback: () => Promise<void>): void; openPanel(options: {url: string; height: number}): Promise<void>};
    viewport: {zoomTo(items: {id: string}[]): Promise<void>};
  };
};

const panelUrl = new URL(location.href);
const panelMode = panelUrl.searchParams.get('panel') === '1';
const startupStatus = document.getElementById(panelMode ? 'status' : 'bootstrap-status');
if (!panelMode) {
  const panel = document.getElementById('panel-screen'), bootstrap = document.getElementById('bootstrap-screen');
  if (panel) panel.hidden = true;
  if (bootstrap) bootstrap.hidden = false;
}
if (typeof miro === 'undefined') {
  if (startupStatus) startupStatus.textContent = 'The page loaded, but the Miro SDK global is unavailable. Check that this URL is opened inside the registered Miro app.';
} else if (!panelMode) {
  try {
    miro.board.ui.on('icon:click', async () => miro.board.ui.openPanel({url: new URL('/?panel=1', location.href).href, height: 900}));
    if (startupStatus) startupStatus.textContent = 'Miro SDK detected; toolbar click handler registered. Use the app icon on the board toolbar to open the panel.';
  } catch (error) {
    if (startupStatus) startupStatus.textContent = `SDK loaded, but toolbar registration failed: ${error instanceof Error ? error.message : String(error)}`;
  }
} else {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const sourceInput = $<HTMLTextAreaElement>('source');
  const bindingInput = $<HTMLTextAreaElement>('binding');
  const debugSnapshot = $<HTMLTextAreaElement>('debug-snapshot');
  const debugDownload = $<HTMLButtonElement>('download-debug-capture');
  const status = $('status');
  const board = miro.board;
  const boardId = (await board.getInfo()).id;
  const storageKey = `umf-miro-editable:${boardId}:`;
  const sample = createVisualDocument({id: 'editable-conformance-flow', kind: 'flow', form: 'network',
    title: 'Editable Miro conformance sample', question: 'How does a request reach persistent storage?',
    nodes: [{id: 'client', label: 'Web client'}, {id: 'service', label: 'Request service'}, {id: 'store', label: 'Record store'}],
    edges: [{id: 'request', from: 'client', to: 'service', label: 'sends'}, {id: 'write', from: 'service', to: 'store', label: 'persists'}]});
  let currentBinding: EditableBinding | undefined;
  let currentDocument = sample;
  let lastRawCapture: string | undefined;

  function statusData(data: unknown): unknown {
    if (!data || typeof data !== 'object' || !Array.isArray((data as {losses?: unknown}).losses)) return data;
    const value = data as Record<string, unknown>, losses = value.losses as Array<Record<string, unknown>>;
    const byFamily: Record<string, number> = Object.create(null), byCode: Record<string, number> = Object.create(null);
    for (const loss of losses) {
      const family = typeof loss.family === 'string' ? loss.family : 'unspecified';
      const code = typeof loss.code === 'string' ? loss.code : 'unspecified';
      byFamily[family] = (byFamily[family] ?? 0) + 1; byCode[code] = (byCode[code] ?? 0) + 1;
    }
    return {...value, losses: {count: losses.length, byFamily, byCode, examples: losses.slice(0, 5)}};
  }

  function setStatus(message: string, data?: unknown): void {
    status.textContent = data === undefined ? message : `${message}\n${JSON.stringify(statusData(data), null, 2)}`;
  }
  function save(): void {
    localStorage.setItem(storageKey + 'source', sourceInput.value);
    if (currentBinding) localStorage.setItem(storageKey + 'binding', JSON.stringify(currentBinding));
    bindingInput.value = currentBinding ? JSON.stringify(currentBinding, null, 2) : '';
  }
  function download(name: string, text: string): void {
    const url = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function readSource() {return readVisualDocument(sourceInput.value, 'json');}
  function action(id: string, run: () => Promise<void> | void): void {
    $(id).addEventListener('click', async () => {
      const buttons = [...document.querySelectorAll<HTMLButtonElement>('button[data-action]')];
      buttons.forEach(button => button.disabled = true);
      try {await run();}
      catch (error) {
        const receipt = error && typeof error === 'object' && 'receipt' in error ? error.receipt : undefined;
        if (receipt && typeof receipt === 'object') {
          try {currentBinding = await readEditableMiroBinding(JSON.stringify(receipt)); save();} catch { /* Keep the original receipt text for manual inspection. */ }
        }
        setStatus(`Operation stopped: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error && 'code' in error ? {code: error.code, receipt: receipt ?? null} : undefined);
      } finally {buttons.forEach(button => button.disabled = false);}
    });
  }

  const savedSource = localStorage.getItem(storageKey + 'source');
  sourceInput.value = savedSource ?? writeVisualDocument(sample, 'json');
  currentDocument = readSource();
  const savedBinding = localStorage.getItem(storageKey + 'binding');
  if (savedBinding) {
    try {currentBinding = await readEditableMiroBinding(savedBinding); bindingInput.value = await writeEditableMiroBinding(currentBinding);}
    catch (error) {setStatus('Saved binding could not be validated. Keep the receipt and inspect it before any new export.', String(error));}
  }
  if (currentBinding && currentBinding.resource.documentId !== boardId) {
    currentBinding = undefined;
    setStatus('The saved binding belongs to a different board. Its receipt remains in local storage; no board write was attempted.');
  }

  action('export', async () => {
    if (currentBinding) throw new Error('A binding is already loaded. Use Capture & reconcile or start a new local session; this panel never deletes old board items.');
    const document = readSource();
    const bindingId = `codex-${crypto.randomUUID()}`;
    currentBinding = await exportEditableMiroVisual(board, document, {bindingId, mode: 'strict',
      checkpoint: binding => {currentBinding = binding; save();}});
    currentDocument = document; sourceInput.value = writeVisualDocument(document, 'json'); save();
    const mappedIds = new Set(currentBinding.mappings.map(mapping => mapping.nativeId));
    const created = await board.get();
    await board.viewport.zoomTo(created.filter(item => mappedIds.has(item.id)));
    setStatus('Export completed. Edit a node label and connector endpoint in the Miro canvas; move/style an item too, then capture and reconcile.',
      {profile: currentBinding.profile, bindingRevision: currentBinding.bindingRevision, mappings: currentBinding.mappings.length, losses: currentBinding.losses});
  });

  action('capture', async () => {
    if (!currentBinding) throw new Error('Export the synthetic sample first or load its saved binding.');
    const result = await importEditableMiroVisual(board, currentBinding, currentDocument, currentBinding.bindingRevision);
    currentBinding = result.binding; currentDocument = result.document;
    sourceInput.value = writeVisualDocument(currentDocument, 'json'); save();
    setStatus('Capture and readback completed. Native label/endpoint edits were reconciled into UMF; movement, style and unknown native details remain native-only.',
      {bindingRevision: currentBinding.bindingRevision, changes: result.changes, nativeOnly: result.nativeOnly, unmapped: result.unmapped, losses: currentBinding.losses});
  });

  action('debug-capture', async () => {
    const observation = await captureEditableMiroBoard(board);
    lastRawCapture = JSON.stringify(observation, null, 2);
    debugSnapshot.value = lastRawCapture;
    debugDownload.disabled = false;
    setStatus('Read-only native snapshot captured. No objects were changed.',
      {resource: observation.resource, revision: observation.revision, captureDigestSha256: observation.captureDigestSha256, items: (observation.payload as {items?: unknown[]}).items?.length ?? 0});
  });
  action('download-debug-capture', () => {
    if (!lastRawCapture) throw new Error('Capture a read-only native snapshot first.');
    download('miro-editable-raw-snapshot.json', lastRawCapture);
  });

  action('update', async () => {
    if (!currentBinding) throw new Error('Export the synthetic sample first or load its saved binding.');
    const nextDocument = readSource();
    const next = await updateEditableMiroVisual(board, currentBinding, currentDocument, nextDocument,
      {expectedBindingRevision: currentBinding.bindingRevision, mode: 'strict', checkpoint: binding => {currentBinding = binding; save();}});
    currentBinding = next; currentDocument = nextDocument; sourceInput.value = writeVisualDocument(nextDocument, 'json'); save();
    setStatus('Source update completed with native-preserving writes. Existing positions/styles were read twice and kept; this is not an atomic Miro transaction.',
      {bindingRevision: currentBinding.bindingRevision, losses: currentBinding.losses});
  });

  action('load', async () => {
    currentBinding = await readEditableMiroBinding(bindingInput.value);
    if (currentBinding.resource.documentId !== boardId) throw new Error('The receipt belongs to a different Miro board.');
    currentDocument = currentBinding.source;
    sourceInput.value = writeVisualDocument(currentDocument, 'json'); save();
    setStatus('Validated binding loaded for this board. No native writes were performed.');
  });
  action('download-source', () => download('editable-visual.umf.json', writeVisualDocument(readSource(), 'json')));
  action('download-binding', async () => {
    if (!currentBinding) throw new Error('No editable binding is loaded.');
    download('editable-visual.miro-binding.json', await writeEditableMiroBinding(currentBinding));
  });
  action('reset-local', () => {
    localStorage.removeItem(storageKey + 'binding'); localStorage.removeItem(storageKey + 'source');
    currentBinding = undefined; currentDocument = sample; sourceInput.value = writeVisualDocument(sample, 'json'); bindingInput.value = '';
    setStatus('Local receipt and source cleared. Existing Miro objects were not deleted; use this only before creating another sample.');
  });

  $('update-question').addEventListener('click', () => {
    const next = readSource();
    const visual = next.extensions?.['umf.visual'] as Record<string, unknown> | undefined;
    if (!visual) {setStatus('The UMF source has no umf.visual extension.'); return;}
    visual.question = 'Which service now owns this request?';
    sourceInput.value = writeVisualDocument(next, 'json');
    setStatus('Sample question changed in UMF only. Apply source update to patch owned text while retaining native layout and style.');
  });
  sourceInput.addEventListener('change', save);
  if (!status.textContent) setStatus(currentBinding ? 'Existing binding loaded. Capture first if the board has changed.' : 'Ready. Export creates a new synthetic sample on the current board.');
}
