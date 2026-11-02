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
  payload: $('visual-payload'), visualVersion: $('visual-version'), programmaticCode: $('programmatic-code'),
  compileTargetNote: $('compile-target-note'),
};
const state = {examples: [], selectedId: null, backend: 'graphviz', renderToken: 0, historicalToken: 0, historicalUrl: null, historicalResizeObserver: null, objectUrls: new Set(), currentVariant: null, currentImageUrl: null};
const HASH = /^[a-f0-9]{64}$/i;
const pageConfig = {manifest: document.body.dataset.manifest || 'showcase.json', assetPrefix: document.body.dataset.assetPrefix || 'showcase', legacyRedirect: document.body.dataset.legacyRedirect !== 'false', selectionParam: document.body.dataset.selectionParam || 'id'};
const LEGACY_HASHES = new Set(['#coverage', '#six-target-section', '#integrations', '#examples', '#language', '#kind-reference-grid']);

function redirectLegacyLinks() {
  if (!pageConfig.legacyRedirect) return false;
  const url = new URL(location.href);
  const legacyQuery = ['id', 'target', 'profile', 'view'].some(key => url.searchParams.has(key));
  if (!legacyQuery && !LEGACY_HASHES.has(url.hash)) return false;
  location.replace(`./evidence.html${url.search}${url.hash}`);
  return true;
}

function safeAssetPath(path, extension) {
  return typeof path === 'string' && /^[A-Za-z0-9._/-]+$/.test(path) && path.startsWith(`${pageConfig.assetPrefix}/`) && !path.split('/').includes('..') && path.endsWith(extension);
}

function variantQualified(variant) {
  const status = variant?.quality?.status ?? variant?.status;
  return status === 'qualified' && (variant.status === undefined || variant.status === 'qualified') &&
    HASH.test(variant.svgSha256 || '') && HASH.test(variant.pngSha256 || '') &&
    safeAssetPath(variant.svgPath, '.svg') && safeAssetPath(variant.pngPath, '.png') &&
    safeAssetPath(variant.nativeSourcePath, variant.backend === 'mermaid' ? '.mmd' : variant.backend === 'lini' ? '.lini' : '.dot') &&
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

async function renderOriginalEvidence(example) {
  const token = ++state.historicalToken;
  const panel = $('review-evidence');
  const disclosure = $('review-evidence-disclosure');
  if (!panel) return;
  const evidence = example.originalEvidence;
  const image = $('historical-capture');
  const status = $('historical-identity');
  const omissions = $('historical-omissions');
  const download = $('historical-capture-download');
  state.historicalResizeObserver?.disconnect();
  state.historicalResizeObserver = null;
  if (state.historicalUrl) { URL.revokeObjectURL(state.historicalUrl); state.objectUrls.delete(state.historicalUrl); state.historicalUrl = null; }
  image.hidden = true; image.removeAttribute('src');
  download.href = '#'; download.removeAttribute('download'); download.setAttribute('aria-disabled', 'true');
  panel.hidden = !evidence;
  if (disclosure) disclosure.hidden = !evidence;
  if (!evidence) return;
  status.textContent = `${safeText(evidence.rendererId).toUpperCase()} · ${safeText(evidence.rendererProfileId)} · model ${safeText(evidence.modelVersion)} · mapping ${safeText(evidence.mappingVersion)} · ${safeText(evidence.nativeVersion)} · ${safeText(evidence.stage)}`;
  $('historical-scope').textContent = safeText(evidence.scope);
  $('historical-sources').replaceChildren(
    formatSourcePath(evidence.commonDocumentPath, evidence.commonDocumentSha256),
    document.createTextNode(' · '),
    formatSourcePath(evidence.nativeWitnessPath, evidence.nativeWitnessSha256),
    document.createTextNode(' · '),
    formatSourcePath(evidence.previewReceiptPath, evidence.previewReceiptSha256),
  );
  omissions.replaceChildren();
  for (const omission of evidence.knownOmissions || []) { const item = document.createElement('li'); item.textContent = safeText(omission); omissions.append(item); }
  try {
    const captureUrl = await loadVerifiedAsset(evidence.capturePath, evidence.captureSha256);
    if (token !== state.historicalToken || state.selectedId !== example.id) { URL.revokeObjectURL(captureUrl); return; }
    state.objectUrls.add(captureUrl);
    state.historicalUrl = captureUrl;
    image.src = captureUrl;
    image.alt = `Historical ${safeText(evidence.rendererId)} capture for ${safeText(evidence.integrationCaseId)}`;
    await image.decode();
    if (token !== state.historicalToken || state.selectedId !== example.id) { URL.revokeObjectURL(captureUrl); state.objectUrls.delete(captureUrl); state.historicalUrl = null; return; }
    image.width = image.naturalWidth;
    image.height = image.naturalHeight;
    image.hidden = false;
    const fitCapture = () => {
      const frameWidth = image.parentElement?.clientWidth || 0;
      if (!frameWidth || !image.naturalWidth || !image.naturalHeight) return;
      const maxHeight = Number.parseFloat(getComputedStyle(image).maxHeight) || image.naturalHeight;
      const scale = Math.min(1, frameWidth / image.naturalWidth, maxHeight / image.naturalHeight);
      image.style.width = `${image.naturalWidth * scale}px`;
      image.style.height = `${image.naturalHeight * scale}px`;
    };
    fitCapture();
    state.historicalResizeObserver = new ResizeObserver(fitCapture);
    if (image.parentElement) state.historicalResizeObserver.observe(image.parentElement);
    download.href = captureUrl;
    download.download = pathLabel(evidence.capturePath);
    download.setAttribute('aria-disabled', 'false');
  } catch (error) {
    if (token !== state.historicalToken || state.selectedId !== example.id) return;
    status.textContent += ` · Capture unavailable: ${error instanceof Error ? error.message : String(error)}`;
    download.href = '#'; download.removeAttribute('download'); download.setAttribute('aria-disabled', 'true');
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

function renderAuthoredPayload(example) {
  const visual = example?.definition?.extensions?.['umf.visual'];
  ui.payload.textContent = visual && typeof visual === 'object' && typeof example.visualPayloadYaml === 'string'
    ? example.visualPayloadYaml
    : 'No serialized umf.visual payload is available for this UMF envelope.';
  const version = example?.definition?.vocabularies?.['umf.visual']?.version;
  ui.visualVersion.textContent = typeof version === 'string' ? version : 'version not recorded';
  const variant = getVariant(example, state.backend);
  const backend = state.backend;
  const renderer = backend === 'lini' ? 'Lini' : backend === 'graphviz' ? 'Graphviz' : 'Mermaid';
  const nativeVersion = variant?.nativeVersion;
  ui.compileTargetNote.textContent = variantQualified(variant)
    ? `Selected source target: ${renderer} ${nativeVersion}. This compiles native diagram text; the preview above is the separately verified render.`
    : `${renderer} has no qualified render for this example. The compile call below requests that backend and may return diagnostics.`;
  const modelVersion = typeof version === 'string' ? version : '1.0.0';
  ui.programmaticCode.textContent = `import { createVisualDocument, getVisual, editVisual, type Visual, type VisualVersion } from '@documentdrivendx/umf-visual';
import { compilePresentation } from '@documentdrivendx/umf-visual/presentation';

// Start with the umf.visual value shown above as a Visual object.
const modelVersion: VisualVersion = '${modelVersion}';

export function editAndCompile(payload: Visual) {
  const document = createVisualDocument(payload, undefined, modelVersion);
  const visual = getVisual(document);
  const edited = editVisual(document, current => ({
    ...current,
    title: \`\u0024{current.title ?? current.question} — reviewed\`,
  }));
  const output = compilePresentation(edited, { backend: '${backend}' });
  if (!output.ok) return output.diagnostics;
  return { visual, format: output.nativeFormat, source: output.source };
}`;
}

async function loadVerifiedAsset(path, expectedHash) {
  const extension = typeof path === 'string' ? /\.(svg|png|jpe?g)$/i.exec(path)?.[0].toLowerCase() : '';
  if (!extension || !safeAssetPath(path, extension)) throw new Error('Asset path is outside the configured presentation namespace');
  const response = await fetch(`./${path}`, {cache: 'no-store'});
  if (!response.ok) throw new Error(`Asset request failed (${response.status})`);
  const bytes = await response.arrayBuffer();
  const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
  if (actual !== expectedHash.toLowerCase()) throw new Error('Asset hash does not match its showcase receipt');
  return URL.createObjectURL(new Blob([bytes], {type: response.headers.get('content-type') || 'application/octet-stream'}));
}

async function loadVerifiedText(path, expectedHash) {
  if (!['.dot', '.mmd', '.lini'].some(extension => safeAssetPath(path, extension))) throw new Error('Native source path is outside the configured presentation namespace');
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
  renderAuthoredPayload(example);
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
    const renderer = state.backend === 'graphviz' ? 'Graphviz' : state.backend === 'mermaid' ? 'Mermaid' : 'Lini';
    const explanation = `No qualified ${renderer} render is recorded for this example. ${safeText(unavailable?.error) || diagnostics || ''}`.trim();
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
    const approximationCodes = new Set((variant.approximations || []).map(item => item?.code).filter(Boolean));
    if (approximationCodes.has('ROUTING_SCOPE_CONFLICT')) caveats.push('This renderer uses one routing style for the connection scope, so conflicting per-edge route requests cannot all be represented.');
    if (approximationCodes.has('ROUTING_NATIVE_INTERPOLATION')) caveats.push('This renderer may approximate the requested route; the selected native preview does not guarantee visibly curved geometry or exact control points.');
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

function selectExample(id,updateHistory=true) {
  if (!getExample(id)) return;
  state.selectedId = id;
  if (updateHistory) { const url = new URL(location.href);url.searchParams.set(pageConfig.selectionParam,id);history.pushState({exampleId:id},'',url); }
  document.querySelectorAll('.scenario-button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.exampleId === id)));
  renderSelected();
  renderOriginalEvidence(getExample(id));
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
    const response = await fetch(`./${pageConfig.manifest}`, {cache: 'no-store'});
    if (!response.ok) throw new Error(`Showcase catalogue request failed (${response.status})`);
    const data = await response.json();
    if (data.schemaVersion !== 1 || !Array.isArray(data.examples) || data.examples.length === 0) throw new Error('Showcase catalogue does not contain the curated authored examples.');
    state.examples = data.examples;
    if (state.examples.some(example => !example || typeof example.id !== 'string' || !example.id || typeof example.title !== 'string' ||
      !example.definition || typeof example.definitionPath !== 'string' || !HASH.test(example.definitionSha256 || '') ||
      typeof example.visualPayloadYaml !== 'string' || !Array.isArray(example.renders))) {
      throw new Error('Showcase catalogue contains an invalid example receipt.');
    }
    createScenarioList();
    const requestedId = new URL(location.href).searchParams.get(pageConfig.selectionParam);
    state.selectedId = state.examples.some(example => example.id === requestedId) ? requestedId : state.examples[0].id;
    if (!pageConfig.legacyRedirect && requestedId !== state.selectedId) { const url = new URL(location.href);url.searchParams.set(pageConfig.selectionParam,state.selectedId);history.replaceState({exampleId:state.selectedId},'',url); }
    document.querySelectorAll('.scenario-button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.exampleId === state.selectedId)));
    const selected = getExample(state.selectedId);
    const liniAvailable = qualifiedVariant(selected, 'lini');
    const graphvizAvailable = qualifiedVariant(selected, 'graphviz');
    const mermaidAvailable = qualifiedVariant(selected, 'mermaid');
    state.backend = liniAvailable ? 'lini' : graphvizAvailable ? 'graphviz' : mermaidAvailable ? 'mermaid' : 'graphviz';
    document.querySelectorAll('[data-backend]').forEach(button => button.addEventListener('click', () => {
      if (button.disabled) return;
      state.backend = button.dataset.backend;
      renderSelected();
    }));
    await renderSelected();
    await renderOriginalEvidence(selected);
  } catch (error) {
    $('showcase-error').hidden = false;
    $('showcase-error').textContent = `The authored presentation examples could not be loaded. ${error instanceof Error ? error.message : String(error)} Open the evidence library for the underlying catalogue.`;
    setState('No verified showcase image is available.', 'error');
  }
}

window.addEventListener('popstate',()=>{const requested=new URL(location.href).searchParams.get(pageConfig.selectionParam);const id=state.examples.some(example=>example.id===requested)?requested:state.examples[0]?.id;if(id)selectExample(id,false);});

ui.enlarge.addEventListener('click', () => { if (state.currentVariant) ui.viewer.showModal(); });
$('close-viewer').addEventListener('click', () => ui.viewer.close());
ui.viewer.addEventListener('click', event => { if (event.target === ui.viewer) ui.viewer.close(); });
ui.downloadDefinition.addEventListener('click', () => {
  const example = getExample(ui.downloadDefinition.dataset.definition);
  if (!example) return;
  downloadJson(example.definition, pathLabel(example.definitionPath).replace(/\.json$/u, '') + '.json');
});
function downloadJson(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], {type: 'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
$('copy-payload').addEventListener('click', () => copyText(ui.payload.textContent || ''));
$('copy-programmatic-example').addEventListener('click', () => copyText(ui.programmaticCode.textContent || ''));
$('download-full-umf').addEventListener('click', () => {
  const example = getExample(state.selectedId);
  if (example) downloadJson(example.definition, pathLabel(example.definitionPath).replace(/\.json$/u, '') + '.umf.json');
});
window.addEventListener('beforeunload', () => { state.historicalResizeObserver?.disconnect(); for (const url of state.objectUrls) URL.revokeObjectURL(url); });
initialize();
