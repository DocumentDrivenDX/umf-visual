const $ = id => document.getElementById(id);
const ui = {
  scenarioList: $('scenario-list'), state: $('diagram-status'), image: $('diagram-image'), title: $('diagram-title'),
  description: $('diagram-description'), kicker: $('diagram-kicker'), sourceNote: $('scenario-provenance'),
  engine: $('engine-caption'), quality: $('quality-caption'), svg: $('download-svg'), png: $('download-png'),
  sourceType: $('native-source-type'), sourcePath: $('native-source-path'), source: $('native-source'),
  definitionPath: $('definition-path'), definition: $('definition-source'), citations: $('source-citations'),
  downloadSource: $('download-native-source'), downloadDefinition: $('download-definition'), frame: $('diagram-frame'), dimensionNote: $('dimension-note'),
  enlarge: $('enlarge-diagram'), viewer: $('diagram-viewer'), viewerImage: $('viewer-image'), viewerTitle: $('viewer-title'),
  viewerCaption: $('viewer-caption'), viewerSvg: $('viewer-svg-download'),
  caveat: $('render-caveat'), renderNotes: $('rendering-notes'), renderNotesList: $('rendering-notes-list'),
};
const state = {examples: [], selectedId: null, backend: 'graphviz', renderToken: 0, objectUrls: new Set(), currentVariant: null, currentImageUrl: null};
const HASH = /^[a-f0-9]{64}$/i;
const SAFE_ASSET = /^showcase\/[A-Za-z0-9._/-]+$/;
const LEGACY_HASHES = new Set(['#coverage', '#six-target-section', '#integrations', '#examples', '#language', '#kind-reference-grid']);

function redirectLegacyLinks() {
  const url = new URL(location.href);
  const legacyQuery = ['id', 'target', 'profile', 'view'].some(key => url.searchParams.has(key));
  if (!legacyQuery && !LEGACY_HASHES.has(url.hash)) return false;
  location.replace(`./evidence.html${url.search}${url.hash}`);
  return true;
}

function safeAssetPath(path, extension) {
  return typeof path === 'string' && SAFE_ASSET.test(path) && !path.split('/').includes('..') && path.endsWith(extension);
}

function variantQualified(variant) {
  const status = variant?.quality?.status ?? variant?.status;
  return status === 'qualified' && (variant.status === undefined || variant.status === 'qualified') &&
    HASH.test(variant.svgSha256 || '') && HASH.test(variant.pngSha256 || '') &&
    safeAssetPath(variant.svgPath, '.svg') && safeAssetPath(variant.pngPath, '.png') &&
    safeAssetPath(variant.nativeSourcePath, variant.backend === 'mermaid' ? '.mmd' : '.dot') &&
    HASH.test(variant.nativeSourceSha256 || '') && Number.isFinite(variant.width) && variant.width > 0 &&
    Number.isFinite(variant.height) && variant.height > 0 && typeof variant.nativeVersion === 'string' && variant.nativeVersion.length > 0;
}

function safeText(value, fallback = '') { return typeof value === 'string' ? value : fallback; }
function getExample(id) { return state.examples.find(example => example.id === id); }
function getVariant(example, backend) { return example?.renders?.find(render => render.backend === backend); }
function qualifiedVariant(example, backend) { const variant = getVariant(example, backend); return variantQualified(variant) ? variant : undefined; }

function setState(message, kind = 'info') {
  ui.state.hidden = false;
  ui.state.className = `diagram-status ${kind}`;
  ui.state.textContent = message;
  ui.image.hidden = true;
  ui.enlarge.hidden = true;
  ui.frame.classList.remove('has-image');
  ui.engine.textContent = kind === 'error' ? 'RENDER UNAVAILABLE' : 'NATIVE ENGINE · SELECT A VARIANT';
  ui.quality.textContent = kind === 'error' ? 'NOT QUALIFIED' : 'SOURCE-BOUND EXAMPLE';
}

function pathLabel(path) { return safeText(path).split('/').pop() || 'Source file'; }

function createScenarioList() {
  ui.scenarioList.replaceChildren();
  state.examples.forEach((example, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'scenario-button';
    button.dataset.exampleId = example.id;
    button.setAttribute('aria-pressed', String(index === 0));
    const number = document.createElement('span');
    number.className = 'scenario-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const copy = document.createElement('span');
    copy.className = 'scenario-copy';
    const title = document.createElement('strong');
    title.textContent = safeText(example.title, 'Untitled visual');
    const meta = document.createElement('span');
    meta.textContent = `${safeText(example.kind)} / ${safeText(example.form)}`;
    copy.append(title, meta);
    const arrow = document.createElement('span');
    arrow.className = 'scenario-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';
    button.append(number, copy, arrow);
    button.addEventListener('click', () => selectExample(example.id));
    ui.scenarioList.append(button);
  });
}

function updateBackendButtons(example) {
  document.querySelectorAll('[data-backend]').forEach(button => {
    const variant = getVariant(example, button.dataset.backend);
    const qualified = variantQualified(variant);
    button.title = qualified ? `Use ${button.textContent} ${variant.nativeVersion}` : `No qualified ${button.textContent} render for this example; select to inspect its outcome`;
    button.setAttribute('aria-pressed', String(button.dataset.backend === state.backend));
  });
}

function formatSourcePath(path, hash) {
  const label = document.createElement('span');
  label.textContent = pathLabel(path);
  if (typeof path === 'string' && /^[A-Za-z0-9._/-]+$/.test(path) && !path.split('/').includes('..')) {
    const link = document.createElement('a');
    link.href = `https://github.com/DocumentDrivenDX/umf-visual/blob/main/${path.split('/').map(encodeURIComponent).join('/')}`;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = label.textContent;
    link.title = hash ? `Source SHA-256 ${hash}` : 'Open repository source';
    return link;
  }
  return label;
}

function renderCitations(example) {
  ui.citations.replaceChildren();
  const path = formatSourcePath(example.definitionPath, example.definitionSha256);
  const lead = document.createElement('span');
  lead.textContent = 'Definition source · ';
  ui.citations.append(lead, path);
  for (const source of Array.isArray(example.sources) ? example.sources : []) {
    const item = typeof source === 'string' ? {path: source} : source;
    if (!item || typeof item.path !== 'string') continue;
    const row = document.createElement('span');
    row.className = 'source-reference';
    const title = document.createElement('span');
    title.textContent = `${safeText(item.label, 'Reference')} · `;
    row.append(title, formatSourcePath(item.path, item.sha256));
    ui.citations.append(row);
  }
}

function renderSource(example, variant, nativeSource = '') {
  ui.definitionPath.replaceChildren(formatSourcePath(example.definitionPath, example.definitionSha256));
  ui.definition.textContent = JSON.stringify(example.definition, null, 2);
  ui.sourcePath.textContent = variant ? pathLabel(variant.nativeSourcePath) : 'No qualified source';
  ui.source.textContent = variant ? nativeSource || 'Loading the verified native source…' : 'The selected backend has no qualified native source for this example.';
  ui.sourceType.textContent = variant ? `${String(variant.backend).toUpperCase()} NATIVE SOURCE` : 'NATIVE SOURCE UNAVAILABLE';
  ui.downloadSource.href = '#';
  ui.downloadSource.download = variant ? pathLabel(variant.nativeSourcePath) : '';
  ui.downloadSource.setAttribute('aria-disabled', 'true');
  ui.downloadDefinition.dataset.definition = example.id;
  ui.renderNotesList.replaceChildren();
  const notes = variant ? [
    ...(Array.isArray(variant.omissions) ? variant.omissions.map(note => ({label: 'Omission', note})) : []),
    ...(Array.isArray(variant.approximations) ? variant.approximations.map(note => ({label: 'Visual approximation', note})) : []),
  ] : [];
  for (const entry of notes) {
    const row = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = entry.label;
    const detail = document.createElement('code');
    detail.textContent = typeof entry.note === 'string' ? entry.note : JSON.stringify(entry.note);
    row.append(title, document.createTextNode(' '), detail);
    ui.renderNotesList.append(row);
  }
  ui.renderNotes.hidden = !notes.length;
  renderCitations(example);
}

async function loadVerifiedAsset(path, expectedHash) {
  const response = await fetch(`./${path}`, {cache: 'no-store'});
  if (!response.ok) throw new Error(`Asset request failed (${response.status})`);
  const bytes = await response.arrayBuffer();
  const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
  if (actual !== expectedHash.toLowerCase()) throw new Error('Asset hash does not match its showcase receipt');
  return URL.createObjectURL(new Blob([bytes], {type: response.headers.get('content-type') || 'application/octet-stream'}));
}

async function loadVerifiedText(path, expectedHash) {
  const response = await fetch(`./${path}`, {cache: 'no-store'});
  if (!response.ok) throw new Error(`Native source request failed (${response.status})`);
  const bytes = await response.arrayBuffer();
  const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
  if (actual !== expectedHash.toLowerCase()) throw new Error('Native source hash does not match its showcase receipt');
  return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
}

function clearDownloads() {
  for (const anchor of [ui.svg, ui.png, ui.downloadSource, ui.viewerSvg]) {
    anchor.href = '#';
    anchor.removeAttribute('download');
    anchor.setAttribute('aria-disabled', 'true');
  }
  ui.svg.setAttribute('aria-disabled', 'true');
  ui.png.setAttribute('aria-disabled', 'true');
}

async function renderSelected() {
  const example = getExample(state.selectedId);
  if (!example) return;
  const token = ++state.renderToken;
  const variant = qualifiedVariant(example, state.backend);
  state.currentVariant = variant ?? null;
  ui.title.textContent = safeText(example.title, 'Untitled visual');
  ui.description.textContent = safeText(example.description);
  ui.kicker.textContent = `${safeText(example.kind).toUpperCase()} / ${safeText(example.form).toUpperCase()}`;
  const visualVersion = example.definition?.vocabularies?.['umf.visual']?.version;
  ui.sourceNote.textContent = typeof visualVersion === 'string'
    ? `umf.visual ${visualVersion} · sourced definition`
    : 'Sourced visual definition';
  updateBackendButtons(example);
  renderSource(example, variant);
  clearDownloads();
  if (!variant) {
    ui.caveat.hidden = true;
    const unavailable = getVariant(example, state.backend);
    const diagnostics = unavailable?.diagnostics?.map(item => safeText(item.message)).filter(Boolean).join(' ');
    const explanation = `No qualified ${state.backend === 'graphviz' ? 'Graphviz' : 'Mermaid'} render is recorded for this example. ${safeText(unavailable?.error) || diagnostics || ''}`.trim();
    setState(explanation, 'error');
    return;
  }
  setState('Checking the source-bound SVG and PNG…');
  try {
    const [svgUrl, pngUrl, nativeSource] = await Promise.all([
      loadVerifiedAsset(variant.svgPath, variant.svgSha256),
      loadVerifiedAsset(variant.pngPath, variant.pngSha256),
      loadVerifiedText(variant.nativeSourcePath, variant.nativeSourceSha256),
    ]);
    if (token !== state.renderToken) { URL.revokeObjectURL(svgUrl); URL.revokeObjectURL(pngUrl); return; }
    state.objectUrls.add(svgUrl);
    state.objectUrls.add(pngUrl);
    const sourceUrl = URL.createObjectURL(new Blob([nativeSource], {type: 'text/plain;charset=utf-8'}));
    state.objectUrls.add(sourceUrl);
    state.currentImageUrl = svgUrl;
    ui.source.textContent = nativeSource;
    ui.image.src = svgUrl;
    ui.image.alt = `${example.title} — rendered by ${variant.engine} ${variant.nativeVersion}`;
    await ui.image.decode();
    if (token !== state.renderToken) return;
    ui.state.hidden = true;
    ui.image.hidden = false;
    ui.enlarge.hidden = false;
    ui.frame.classList.add('has-image');
    ui.engine.textContent = `${safeText(variant.engine)} · ${safeText(variant.nativeVersion)}`;
    ui.quality.textContent = 'Native SVG';
    const caveats = [];
    if (example.form === 'stack') caveats.push('The bands are an authored reading order, not an execution sequence.');
    if (state.backend === 'mermaid' && example.form === 'entities') caveats.push('Mermaid connects entities; field bindings are labelled rather than shown as field-port attachments.');
    ui.caveat.hidden = !caveats.length;
    ui.caveat.textContent = caveats.join(' ');
    ui.svg.href = svgUrl;
    ui.svg.download = pathLabel(variant.svgPath);
    ui.svg.setAttribute('aria-disabled', 'false');
    ui.png.href = pngUrl;
    ui.png.download = pathLabel(variant.pngPath);
    ui.png.setAttribute('aria-disabled', 'false');
    ui.downloadSource.href = sourceUrl;
    ui.downloadSource.download = pathLabel(variant.nativeSourcePath);
    ui.downloadSource.setAttribute('aria-disabled', 'false');
    ui.dimensionNote.textContent = `${variant.width} × ${variant.height} px · PNG and SVG downloaded from this render.`;
    ui.viewerImage.src = svgUrl;
    ui.viewerImage.alt = ui.image.alt;
    ui.viewerTitle.textContent = safeText(example.title);
    ui.viewerCaption.textContent = `${safeText(variant.engine)} ${safeText(variant.nativeVersion)} · PNG export ${variant.width} × ${variant.height}px · SVG vector`;
    ui.viewerSvg.href = svgUrl;
    ui.viewerSvg.download = pathLabel(variant.svgPath);
    ui.viewerSvg.setAttribute('aria-disabled', 'false');
  } catch (error) {
    if (token !== state.renderToken) return;
    setState(`This render could not be verified: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

function selectExample(id) {
  if (!getExample(id)) return;
  state.selectedId = id;
  document.querySelectorAll('.scenario-button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.exampleId === id)));
  renderSelected();
}

function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.classList.add('visible');
  setTimeout(() => node.classList.remove('visible'), 1800);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch { toast('Copy is unavailable in this browser'); }
}

async function initialize() {
  if (redirectLegacyLinks()) return;
  try {
    const response = await fetch('./showcase.json', {cache: 'no-store'});
    if (!response.ok) throw new Error(`Showcase catalogue request failed (${response.status})`);
    const data = await response.json();
    if (data.schemaVersion !== 1 || !Array.isArray(data.examples) || data.examples.length < 4) throw new Error('Showcase catalogue does not contain the curated authored examples.');
    state.examples = data.examples;
    if (state.examples.some(example => !example || typeof example.id !== 'string' || !example.id || typeof example.title !== 'string' ||
      !example.definition || typeof example.definitionPath !== 'string' || !HASH.test(example.definitionSha256 || '') || !Array.isArray(example.renders))) {
      throw new Error('Showcase catalogue contains an invalid example receipt.');
    }
    createScenarioList();
    state.selectedId = state.examples[0].id;
    const graphvizAvailable = qualifiedVariant(state.examples[0], 'graphviz');
    const mermaidAvailable = qualifiedVariant(state.examples[0], 'mermaid');
    state.backend = graphvizAvailable ? 'graphviz' : mermaidAvailable ? 'mermaid' : 'graphviz';
    document.querySelectorAll('[data-backend]').forEach(button => button.addEventListener('click', () => {
      if (button.disabled) return;
      state.backend = button.dataset.backend;
      renderSelected();
    }));
    await renderSelected();
  } catch (error) {
    $('showcase-error').hidden = false;
    $('showcase-error').textContent = `The authored presentation examples could not be loaded. ${error instanceof Error ? error.message : String(error)} Open the evidence library for the underlying catalogue.`;
    setState('No verified showcase image is available.', 'error');
  }
}

ui.enlarge.addEventListener('click', () => { if (state.currentVariant) ui.viewer.showModal(); });
$('close-viewer').addEventListener('click', () => ui.viewer.close());
ui.viewer.addEventListener('click', event => { if (event.target === ui.viewer) ui.viewer.close(); });
ui.downloadDefinition.addEventListener('click', () => {
  const example = getExample(ui.downloadDefinition.dataset.definition);
  if (!example) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(example.definition, null, 2)], {type: 'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = pathLabel(example.definitionPath).replace(/\.json$/u, '') + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});
window.addEventListener('beforeunload', () => { for (const url of state.objectUrls) URL.revokeObjectURL(url); });
initialize();
