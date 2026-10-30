// SPDX-License-Identifier: MIT OR Apache-2.0
import {createVisualDocument, readVisualDocument, writeVisualDocument} from '../../src/index.js';
import {captureMiroBoard, exportMiroVisual, importMiroVisual, planMiroExport, readMiroBundle, writeMiroBundle,
  createMiroDocument, getMiroClipboard, readMiroDocument, writeMiroDocument, validateMiroClipboard, MIRO_CLIPBOARD_PROFILE,
  recoverMiroExport, attachMiroCapture, MiroAdapterError, type MiroCapture, type MiroBoard, type MiroBundle} from '../../src/adapters/miro/index.js';

declare const miro: {board: MiroBoard & {
  ui: {on(event: 'icon:click', callback: () => Promise<void>): void; openPanel(options: {url: string; height: number}): Promise<void>};
  viewport: {zoomTo(items: {id: string}[]): Promise<void>};
}};
// The hidden bootstrap frame only registers the toolbar action. Storage and the
// editor belong to the visible panel and must not prevent app discovery.
if (new URL(location.href).searchParams.get('panel') !== '1') {
  miro.board.ui.on('icon:click', async () => miro.board.ui.openPanel({url: new URL('/?panel=1', location.href).href, height: 800}));
} else {
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const source = $<HTMLTextAreaElement>('source'), companion = $<HTMLTextAreaElement>('companion');
const status = $('status');
const mode = () => $<HTMLInputElement>('report').checked ? 'report' as const : 'strict' as const;
const boardId = (await miro.board.getInfo()).id;
const prefix = 'umf-miro:' + boardId + ':';
const sample = createVisualDocument({id: 'miro-roundtrip', kind: 'flow', form: 'network',
  question: 'What calls the API?', nodes: [{id: 'client', label: 'UMF test client'},
    {id: 'api', label: 'UMF test API'}, {id: 'worker', label: 'UMF test worker'}],
  edges: [{id: 'request', from: 'client', to: 'api', label: 'Request'}]});
const legacyReceipt = localStorage.getItem('umf-miro-companion');
if (legacyReceipt && !localStorage.getItem(prefix + 'companion')) {
  try {
    if (JSON.parse(legacyReceipt).boardId === boardId) {
      localStorage.setItem(prefix + 'companion', legacyReceipt);
      localStorage.setItem(prefix + 'source', localStorage.getItem('umf-miro-source') ?? writeVisualDocument(sample, 'json'));
    }
  } catch { /* Invalid legacy receipts stay untouched for manual recovery. */ }
}
source.value = localStorage.getItem(prefix + 'source') ?? writeVisualDocument(sample, 'json');
companion.value = localStorage.getItem(prefix + 'companion') ?? '';

async function persist(bundle: MiroBundle) {
  companion.value = writeMiroBundle(bundle);
  localStorage.setItem(prefix + 'companion', companion.value);
}
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function action(id: string, run: () => Promise<void> | void) {
  $(id).addEventListener('click', async () => {
    const buttons = [...document.querySelectorAll('button')]; buttons.forEach(b => b.disabled = true);
    try { await run(); }
    catch (error) {
      if (error instanceof MiroAdapterError && error.receipt) {
        companion.value = JSON.stringify(error.receipt, null, 2);
        localStorage.setItem(prefix + 'companion', companion.value);
      }
      status.textContent = String(error) + (error instanceof Error && error.cause ? '\nCause: ' + String(error.cause) : '');
    } finally {buttons.forEach(b => b.disabled = false);}
  });
}
const readSource = () => readVisualDocument(source.value, $<HTMLSelectElement>('format').value as 'json' | 'yaml');
$<HTMLTextAreaElement>('native-paste').addEventListener('paste', event => {
  event.preventDefault();
  try {
    const clipboard = validateMiroClipboard({profile: MIRO_CLIPBOARD_PROFILE, sourceBoardId: boardId,
      client: new URL(location.href).searchParams.get('_miro') ?? 'unreported', coverage: 'selection',
      html: event.clipboardData?.getData('text/html'), text: event.clipboardData?.getData('text/plain') ?? ''});
    localStorage.setItem(prefix + 'clipboard', JSON.stringify(clipboard));
    status.textContent = 'Saved opaque Miro clipboard locally. Capture the same selection/board, then download native board UMF.';
  } catch (error) {status.textContent = String(error);}
});
action('download-native-board', () => {
  const raw = localStorage.getItem(prefix + 'capture');
  if (!raw) throw Error('Capture this board first.');
  const clipboard = localStorage.getItem(prefix + 'clipboard');
  const doc = createMiroDocument(JSON.parse(raw), clipboard ? validateMiroClipboard(JSON.parse(clipboard)) : undefined);
  download('board.miro.umf.json', writeMiroDocument(doc));
});
action('copy-native', async () => {
  const doc = readMiroDocument(source.value, $<HTMLSelectElement>('format').value as 'json' | 'yaml');
  const clipboard = getMiroClipboard(doc);
  await navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob([clipboard.html], {type: 'text/html'}),
    'text/plain': new Blob([clipboard.text], {type: 'text/plain'}),
  })]);
  status.textContent = 'Native Miro content copied from UMF. Click the target board canvas and paste. This uses an observed Miro browser format.';
});
action('preview', () => {const plan = planMiroExport(readSource(), mode()); status.textContent = JSON.stringify({shapes: plan.shapes.length, connectors: plan.connectors.length, losses: plan.losses}, null, 2);});
action('export', async () => {
  if (companion.value.trim()) throw Error('Save or clear the existing companion before creating another export.');
  const doc = readSource();
  localStorage.setItem(prefix + 'source', writeVisualDocument(doc, 'json'));
  const bundle = await exportMiroVisual(miro.board, doc, {exportId: crypto.randomUUID(), mode: mode(), checkpoint: persist});
  await persist(bundle);
  status.textContent = `Export complete: ${bundle.mappings.length} items. Edit their labels or connector endpoints in Miro, then load changes.\n` + JSON.stringify(bundle.losses, null, 2);
  await miro.board.viewport.zoomTo((await miro.board.get()).filter(item => bundle.mappings.some(m => m.nativeId === item.id)));
});
action('import', async () => {
  const result = await importMiroVisual(miro.board, readMiroBundle(companion.value), readSource());
  source.value = writeVisualDocument(result.document, 'json'); $<HTMLSelectElement>('format').value = 'json';
  localStorage.setItem(prefix + 'source', source.value);
  await persist(result.bundle);
  localStorage.setItem(prefix + 'capture', JSON.stringify(result.capture));
  status.textContent = JSON.stringify({changes: result.changes, nativeOnly: result.nativeOnly, unmapped: result.unmapped, losses: result.bundle.losses}, null, 2);
});
action('recover', async () => {
  const capture = await captureMiroBoard(miro.board);
  const bundle = recoverMiroExport(readMiroBundle(companion.value), capture);
  await persist(bundle);
  status.textContent = 'Recovered complete export receipt from verified existing board items. No items were written.';
});
action('capture-experimental', async () => {
  const capture = await captureMiroBoard(miro.board, {experimentalShapes: true});
  localStorage.setItem(prefix + 'capture', JSON.stringify(capture));
  status.textContent = `Captured ${capture.items.length} API-visible items with experimental flowchart shapes. Download native capture to inspect them.`;
});
action('capture', async () => {
  const capture = await captureMiroBoard(miro.board);
  localStorage.setItem(prefix + 'capture', JSON.stringify(capture));
  status.textContent = `Captured ${capture.items.length} API-visible items. Download native capture to inspect them.`;
});
action('download-native-source', () => {
  const raw = localStorage.getItem(prefix + 'capture');
  if (!raw) throw Error('Capture or load the board before downloading native UMF.');
  const capture = JSON.parse(raw) as MiroCapture;
  const mappings = companion.value.trim() ? readMiroBundle(companion.value).mappings : [];
  download('visual.miro.umf.json', writeVisualDocument(attachMiroCapture(readSource(), capture, mappings), 'json'));
});
action('download-source', () => download('visual.umf.json', writeVisualDocument(readSource(), 'json')));
action('download-companion', () => download('visual.miro.json', writeMiroBundle(readMiroBundle(companion.value))));
action('download-capture', () => download('miro-capture.json', localStorage.getItem(prefix + 'capture') ?? '{}'));
}
