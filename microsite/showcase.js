import {authoredComparisonView,authoredFocusTargets,authoredMetricView,authoredStepListPolicy} from './authored-context.js';

const $ = id => document.getElementById(id);
const ui = {
  scenarioList: $('scenario-list'), state: $('diagram-status'), image: $('diagram-image'), title: $('diagram-title'),
  description: $('diagram-description'), kicker: $('diagram-kicker'), sourceNote: $('scenario-provenance'),
  engine: $('engine-caption'), quality: $('quality-caption'), svg: $('download-svg'), png: $('download-png'),
  sourceType: $('native-source-type'), sourcePath: $('native-source-path'), source: $('native-source'),
  execution: $('execution-provenance'), executionMetadata: $('execution-metadata'), executionCommand: $('execution-command'), downloadRecipe: $('download-execution-recipe'),
  definitionPath: $('definition-path'), definition: $('definition-source'), citations: $('source-citations'),
  downloadSource: $('download-native-source'), downloadDefinition: $('download-definition'), frame: $('diagram-frame'), dimensionNote: $('dimension-note'),
  enlarge: $('enlarge-diagram'), viewer: $('diagram-viewer'), viewerImage: $('viewer-image'), viewerTitle: $('viewer-title'),
  viewerFrame: $('viewer-image-frame'), viewerCanvas: $('viewer-canvas'), viewerFit: $('viewer-fit'), viewerZoomOut: $('viewer-zoom-out'),
  viewerZoomIn: $('viewer-zoom-in'), viewerActualSize: $('viewer-actual-size'), viewerZoomLevel: $('viewer-zoom-level'),
  viewerCaption: $('viewer-caption'), viewerSvg: $('viewer-svg-download'),
  caveat: $('render-caveat'), renderNotes: $('rendering-notes'), renderNotesList: $('rendering-notes-list'),
  payload: $('visual-payload'), visualVersion: $('visual-version'), programmaticCode: $('programmatic-code'),
  compileTargetNote: $('compile-target-note'), authoredContext: $('authored-context'), authoredContextContent: $('authored-context-content'),
};
const state = {examples: [], selectedId: null, backend: 'graphviz', renderToken: 0, historicalToken: 0, historicalUrl: null, historicalResizeObserver: null, objectUrls: new Set(), renderUrls: new Set(), citationToken:0,citationId:null,citationUrls:new Set(),currentVariant: null, currentImageUrl: null, viewerMode:'fit',viewerScale:1};
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
function variantUnqualified(variant) {
  return variant?.status === 'unqualified' && HASH.test(variant.nativeSourceSha256 || '') && HASH.test(variant.svgSha256 || '') && HASH.test(variant.pngSha256 || '') &&
    safeAssetPath(variant.nativeSourcePath, variant.backend === 'mermaid' ? '.mmd' : variant.backend === 'lini' ? '.lini' : '.dot') &&
    safeAssetPath(variant.svgPath, '.svg') && safeAssetPath(variant.pngPath, '.png') && Array.isArray(variant.quality?.failedChecks) && variant.quality.failedChecks.length > 0 &&
    Number.isFinite(variant.width) && variant.width > 0 && Number.isFinite(variant.height) && variant.height > 0 && typeof variant.nativeVersion === 'string' && variant.nativeVersion.length > 0;
}
function inspectableVariant(variant) { return variantQualified(variant) ? variant : variantUnqualified(variant) ? variant : undefined; }

function safeText(value, fallback = '') { return typeof value === 'string' ? value : fallback; }
function groupRenderingNotes(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const note = entry.note;
    const sourcePath = note && typeof note === 'object' && !Array.isArray(note) && typeof note.sourcePath === 'string' ? note.sourcePath : undefined;
    const content = note && typeof note === 'object' && !Array.isArray(note)
      ? Object.fromEntries(Object.entries(note).filter(([key]) => key !== 'sourcePath'))
      : note;
    const key = JSON.stringify([entry.label, content]);
    if (!groups.has(key)) groups.set(key, {label: entry.label, note: content, sourcePaths: []});
    if (sourcePath) groups.get(key).sourcePaths.push(sourcePath);
  }
  return [...groups.values()];
}
function executionRecipe(variant) {
  const execution = variant?.execution;
  const executionKeys = execution && typeof execution === 'object' && !Array.isArray(execution) ? Object.keys(execution).sort() : [];
  if (variant?.backend !== 'graphviz' || executionKeys.join(',') !== 'layoutEngine,nodePositions,runtime' ||
      execution.runtime !== 'graphviz' || execution.layoutEngine !== 'neato' || execution.nodePositions !== 'fixed' ||
      !safeAssetPath(variant.nativeSourcePath, '.dot') || !HASH.test(variant.nativeSourceSha256 || '') ||
      typeof variant.nativeVersion !== 'string' || !variant.nativeVersion) return undefined;
  return {
    schemaVersion: 1,
    execution,
    nativeVersion: variant.nativeVersion,
    sourcePath: variant.nativeSourcePath,
    sourceSha256: variant.nativeSourceSha256,
    command: ['neato', '-n2', '-Tsvg', pathLabel(variant.nativeSourcePath)],
  };
}
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

function applyViewerZoom(resetScroll=false) {
  const frame=ui.viewerFrame,image=ui.viewerImage,canvas=ui.viewerCanvas;
  const naturalWidth=image.naturalWidth,naturalHeight=image.naturalHeight;
  if(!naturalWidth||!naturalHeight){ui.viewerZoomLevel.textContent=state.viewerMode==='fit'?'Fit':'100%';for(const button of [ui.viewerFit,ui.viewerZoomOut,ui.viewerZoomIn,ui.viewerActualSize])button.disabled=true;return;}
  const width=Math.max(1,frame.clientWidth),height=Math.max(1,frame.clientHeight);
  const priorWidth=Math.max(1,frame.scrollWidth),priorHeight=Math.max(1,frame.scrollHeight);
  const centerX=(frame.scrollLeft+frame.clientWidth/2)/priorWidth,centerY=(frame.scrollTop+frame.clientHeight/2)/priorHeight;
  const scale=state.viewerMode==='fit'?Math.min(1,width/naturalWidth,height/naturalHeight):state.viewerScale;
  state.viewerScale=scale;
  const imageWidth=Math.max(1,Math.round(naturalWidth*scale)),imageHeight=Math.max(1,Math.round(naturalHeight*scale));
  canvas.style.width=`${Math.max(width,imageWidth)}px`;
  canvas.style.height=`${Math.max(height,imageHeight)}px`;
  image.style.width=`${imageWidth}px`;
  image.style.height=`${imageHeight}px`;
  const percent=Math.round(scale*100);
  ui.viewerZoomLevel.textContent=state.viewerMode==='fit'?`Fit · ${percent}%`:`${percent}%`;
  ui.viewerZoomOut.disabled=scale<=.25;
  ui.viewerZoomIn.disabled=scale>=4;
  ui.viewerActualSize.disabled=state.viewerMode==='actual';
  ui.viewerFit.disabled=state.viewerMode==='fit';
  if(resetScroll){frame.scrollLeft=0;frame.scrollTop=0;}
  else{frame.scrollLeft=Math.max(0,centerX*frame.scrollWidth-frame.clientWidth/2);frame.scrollTop=Math.max(0,centerY*frame.scrollHeight-frame.clientHeight/2);}
}

function setViewerZoom(mode,scale) {
  state.viewerMode=mode;
  if(typeof scale==='number')state.viewerScale=Math.min(4,Math.max(.25,scale));
  applyViewerZoom(mode==='fit'||mode==='actual');
}

function resetViewerZoom() {
  state.viewerMode='fit';state.viewerScale=1;
  ui.viewerZoomLevel.textContent='Fit';
  applyViewerZoom(true);
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
    const qualified = variantQualified(variant), unqualified = variantUnqualified(variant);
    button.title = qualified ? `Use ${button.textContent} ${variant.nativeVersion}` : unqualified ? `Inspect ${button.textContent}; native quality checks did not pass` : `No usable ${button.textContent} render is recorded for this example`;
    button.setAttribute('aria-pressed', String(button.dataset.backend === state.backend));
  });
}

function formatSourcePath(path, hash) {
  const citation = document.createElement('span');
  const label = document.createElement('span');
  label.textContent = pathLabel(path);
  if (typeof path === 'string' && /^[A-Za-z0-9._/-]+$/.test(path) && !path.split('/').includes('..')) {
    const link = document.createElement('a');
    link.href = `https://github.com/DocumentDrivenDX/umf-visual/blob/main/${path.split('/').map(encodeURIComponent).join('/')}`;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = label.textContent;
    link.title = hash ? `Source SHA-256 ${hash}` : 'Open repository source';
    citation.append(link);
  } else {
    citation.append(label);
  }
  if (typeof hash === 'string' && HASH.test(hash)) {
    citation.append(document.createTextNode(' · '));
    const digest = document.createElement('code');
    digest.textContent = hash;
    citation.append(digest);
  }
  return citation;
}

function renderCitations(example) {
  if (state.citationId === example.id) return;
  clearCitationDownloads();
  state.citationId = example.id;
  const token = state.citationToken;
  ui.citations.replaceChildren();
  const path = formatSourcePath(example.definitionPath, example.definitionSha256);
  const lead = document.createElement('span');
  lead.textContent = 'Definition source · ';
  ui.citations.append(lead, path);
  const publishedAssets = Array.isArray(example.publishedAssets) ? example.publishedAssets : [];
  const evidence = example.originalEvidence;
  const primaryEvidencePaths = new Set([evidence?.sourceDownloadPath, evidence?.capturePath].filter(value => typeof value === 'string'));
  for (const source of Array.isArray(example.sources) ? example.sources : []) {
    const item = typeof source === 'string' ? {path: source} : source;
    if (!item || typeof item.path !== 'string') continue;
    const row = document.createElement('span');
    row.className = 'source-reference';
    const title = document.createElement('span');
    title.textContent = `${safeText(item.label, 'Reference')} · `;
    row.append(title, formatSourcePath(item.path, item.sha256));
    const asset = publishedAssets.find(candidate => candidate && candidate.path === item.path && candidate.sha256 === item.sha256 &&
      typeof candidate.outputPath === 'string' && HASH.test(candidate.sha256 || '') &&
      !primaryEvidencePaths.has(candidate.outputPath) && candidate.outputPath !== evidence?.sourceDownloadPath && candidate.outputPath !== evidence?.capturePath);
    if (asset) {
      const download = document.createElement('a');
      download.className = 'source-asset-download';
      download.dataset.outputPath = asset.outputPath;
      download.href = '#';
      download.download = pathLabel(asset.path);
      download.textContent = 'Download exact source file';
      download.setAttribute('aria-disabled', 'true');
      row.append(download);
      void loadVerifiedAsset(asset.outputPath, asset.sha256).then(url => {
        if (token !== state.citationToken || state.selectedId !== example.id || state.citationId !== example.id) { URL.revokeObjectURL(url); return; }
        state.citationUrls.add(url); state.objectUrls.add(url);
        download.href = url;
        download.setAttribute('aria-disabled', 'false');
        download.title = `Verified SHA-256 ${asset.sha256}`;
      }).catch(error => {
        if (token !== state.citationToken || state.selectedId !== example.id || state.citationId !== example.id) return;
        download.title = `Download unavailable: ${error instanceof Error ? error.message : String(error)}`;
      });
    }
    ui.citations.append(row);
  }
}

function clearCitationDownloads() {
  state.citationToken++;
  for (const url of state.citationUrls) { URL.revokeObjectURL(url); state.objectUrls.delete(url); }
  state.citationUrls.clear();
  state.citationId = null;
  ui.citations.replaceChildren();
}

async function renderOriginalEvidence(example) {
  const token = ++state.historicalToken;
  const panel = $('review-evidence');
  const disclosure = $('review-evidence-disclosure');
  if (!panel) return;
  const evidence = example.originalEvidence;
  const authoritative = evidence?.kind === 'authoritative-umf-source';
  const synthetic = evidence?.kind === 'synthetic-integration-witness';
  const supported = authoritative || synthetic;
  const image = $('historical-capture');
  const frame = $('historical-capture-frame');
  const status = $('historical-identity');
  const omissionsTitle = $('historical-omissions-title');
  const omissions = $('historical-omissions');
  const download = $('historical-capture-download');
  state.historicalResizeObserver?.disconnect();
  state.historicalResizeObserver = null;
  if (state.historicalUrl) { URL.revokeObjectURL(state.historicalUrl); state.objectUrls.delete(state.historicalUrl); state.historicalUrl = null; }
  image.hidden = true; image.removeAttribute('src');
  frame.hidden = true;
  download.href = '#'; download.removeAttribute('download'); download.setAttribute('aria-disabled', 'true');
  panel.hidden = !supported;
  panel.classList.toggle('authoritative-source-only', authoritative);
  if (disclosure) disclosure.hidden = !supported;
  if (!supported) return;
  omissions.replaceChildren();
  if (authoritative) {
    status.textContent = `AUTHORITATIVE UMF SOURCE · document ${safeText(evidence.documentId)} · Visual id ${safeText(evidence.visualId)} · Visual ${safeText(evidence.modelVersion)} · UMF ${safeText(evidence.envelopeVersion)}`;
    $('historical-scope').textContent = safeText(evidence.scope);
    $('historical-sources').replaceChildren(formatSourcePath(evidence.sourcePath, evidence.sourceSha256));
    omissionsTitle.hidden = true;
    download.textContent = 'Download exact UMF source JSON';
    try {
      const sourceUrl = await loadVerifiedAsset(evidence.sourceDownloadPath, evidence.sourceSha256);
      if (token !== state.historicalToken || state.selectedId !== example.id) { URL.revokeObjectURL(sourceUrl); return; }
      state.objectUrls.add(sourceUrl);
      state.historicalUrl = sourceUrl;
      download.href = sourceUrl;
      download.download = pathLabel(evidence.sourcePath);
      download.setAttribute('aria-disabled', 'false');
    } catch (error) {
      if (token !== state.historicalToken || state.selectedId !== example.id) return;
      status.textContent += ` · Source unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
    return;
  }
  panel.classList.remove('authoritative-source-only');
  frame.hidden = false;
  status.textContent = `${safeText(evidence.rendererId).toUpperCase()} · ${safeText(evidence.rendererProfileId)} · model ${safeText(evidence.modelVersion)} · mapping ${safeText(evidence.mappingVersion)} · ${safeText(evidence.nativeVersion)} · ${safeText(evidence.stage)}`;
  $('historical-scope').textContent = safeText(evidence.scope);
  $('historical-sources').replaceChildren(
    formatSourcePath(evidence.commonDocumentPath, evidence.commonDocumentSha256),
    document.createTextNode(' · '),
    formatSourcePath(evidence.nativeWitnessPath, evidence.nativeWitnessSha256),
    document.createTextNode(' · '),
    formatSourcePath(evidence.previewReceiptPath, evidence.previewReceiptSha256),
  );
  const recordedOmissions = Array.isArray(evidence.knownOmissions) ? evidence.knownOmissions : [];
  omissionsTitle.hidden = recordedOmissions.length === 0;
  for (const omission of recordedOmissions) { const item = document.createElement('li'); item.textContent = safeText(omission); omissions.append(item); }
  download.textContent = 'Download original capture';
  try {
    const captureUrl = await loadVerifiedAsset(evidence.capturePath, evidence.captureSha256);
    if (token !== state.historicalToken || state.selectedId !== example.id) { URL.revokeObjectURL(captureUrl); return; }
    state.objectUrls.add(captureUrl);
    state.historicalUrl = captureUrl;
    image.src = captureUrl;
    image.alt = `Historical ${safeText(evidence.rendererId)} capture for ${safeText(evidence.integrationCaseId)}`;
    await image.decode();
    if (token !== state.historicalToken || state.selectedId !== example.id) {
      URL.revokeObjectURL(captureUrl);
      state.objectUrls.delete(captureUrl);
      if (state.historicalUrl === captureUrl) state.historicalUrl = null;
      return;
    }
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
  }
}
function renderSource(example, variant, nativeSource = '') {
  ui.definitionPath.replaceChildren(formatSourcePath(example.definitionPath, example.definitionSha256));
  ui.definition.textContent = JSON.stringify(example.definition, null, 2);
  ui.sourcePath.textContent = variant ? pathLabel(variant.nativeSourcePath) : 'No usable native source';
  ui.source.textContent = variant ? nativeSource || 'Loading the source-bound native source…' : 'The selected backend has no usable native source for this example.';
  ui.sourceType.textContent = variant ? `${String(variant.backend).toUpperCase()} NATIVE SOURCE${variant.status === 'unqualified' ? ' · QUALITY NOT QUALIFIED' : ''}` : 'NATIVE SOURCE UNAVAILABLE';
  const execution = variant?.execution;
  const hasExecution = execution && typeof execution === 'object' && !Array.isArray(execution) && Object.keys(execution).length > 0;
  const recipe = executionRecipe(variant);
  ui.execution.hidden = true;
  ui.executionMetadata.textContent = hasExecution ? JSON.stringify(execution, null, 2) : '';
  ui.executionCommand.textContent = recipe?.command.map(value => JSON.stringify(value)).join(' ') || 'No reviewed invocation is available for these execution fields.';
  ui.downloadRecipe.href = '#';
  ui.downloadRecipe.download = '';
  ui.downloadRecipe.hidden = true;
  ui.downloadRecipe.setAttribute('aria-disabled', 'true');
  ui.downloadSource.href = '#';
  ui.downloadSource.download = variant ? pathLabel(variant.nativeSourcePath) : '';
  ui.downloadSource.setAttribute('aria-disabled', 'true');
  ui.downloadDefinition.dataset.definition = example.id;
  ui.renderNotesList.replaceChildren();
  const notes = variant ? [
    ...(Array.isArray(variant.omissions) ? variant.omissions.map(note => ({label: 'Omission', note})) : []),
    ...(Array.isArray(variant.approximations) ? variant.approximations.map(note => ({label: 'Native representation', note})) : []),
  ] : [];
  for (const entry of groupRenderingNotes(notes)) {
    const row = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = entry.label;
    const detail = document.createElement('code');
    detail.textContent = typeof entry.note === 'string' ? entry.note : JSON.stringify(entry.note);
    row.append(title, document.createTextNode(' '), detail);
    if (entry.sourcePaths.length) {
      const disclosure = document.createElement('details');
      disclosure.className = 'rendering-note-sources';
      const summary = document.createElement('summary');
      summary.textContent = `${entry.sourcePaths.length} source path${entry.sourcePaths.length === 1 ? '' : 's'}`;
      const paths = document.createElement('ul');
      for (const sourcePath of entry.sourcePaths) {
        const item = document.createElement('li');
        const code = document.createElement('code');
        code.textContent = sourcePath;
        item.append(code);
        paths.append(item);
      }
      disclosure.append(summary, paths);
      row.append(disclosure);
    }
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
  return { visual, format: output.nativeFormat, source: output.source, execution: output.execution };
}`;
}

function renderAuthoredContext(example) {
  const disclosure = ui.authoredContext, content = ui.authoredContextContent;
  if (!disclosure || !content) return;
  content.replaceChildren();
  disclosure.open = false;
  const visual = example?.definition?.extensions?.['umf.visual'];
  if (!visual || typeof visual !== 'object') { disclosure.hidden = true; return; }
  disclosure.hidden = false;
  const metadata = document.createElement('section');
  metadata.className = 'authored-context-metadata';
  const contextTitle = document.createElement('h5'); contextTitle.textContent = 'Authored context'; metadata.append(contextTitle);
  const rows = [];
  for (const [key, label] of [['title','Title'],['question','Question'],['takeaway','Takeaway'],['audience','Audience']]) {
    if (typeof visual[key] === 'string') rows.push({label, path:`/extensions/umf.visual/${key}`, value:visual[key]});
  }
  const source = visual.source;
  if (source && typeof source === 'object') {
    for (const [key, label] of [['path','Source path'],['view','Source view'],['digest','Source digest']]) {
      if (typeof source[key] === 'string') rows.push({label, path:`/extensions/umf.visual/source/${key}`, value:source[key]});
    }
  }
  const definitionList = document.createElement('dl');
  for (const row of rows) {
    const term = document.createElement('dt'); term.textContent = row.label;
    const value = document.createElement('dd'); const text = document.createElement('span'); text.textContent = row.value;
    const pointer = document.createElement('code'); pointer.textContent = row.path;
    value.append(text, pointer); definitionList.append(term, value);
  }
  metadata.append(definitionList);
  if (source && typeof source === 'object') {
    const locatorNote = document.createElement('p'); locatorNote.className = 'authored-source-locator-note';
    locatorNote.textContent = 'The source locator and digest are authored metadata; this view does not independently retrieve or verify the referenced resource.';
    metadata.append(locatorNote);
  }
  content.append(metadata);

  const omissions = Array.isArray(visual.omissions) ? visual.omissions : [];
  if (omissions.length) {
    const caveats = document.createElement('section'); caveats.className = 'authored-caveats';
    const caveatTitle = document.createElement('h5'); caveatTitle.textContent = 'Authored caveats'; caveats.append(caveatTitle);
    const list = document.createElement('ul');
    omissions.forEach((note, index) => {
      const item = document.createElement('li'), text = document.createElement('span'), pointer = document.createElement('code');
      text.textContent = typeof note === 'string' ? note : JSON.stringify(note);
      pointer.textContent = `/extensions/umf.visual/omissions/${index}`;
      item.append(text, pointer); list.append(item);
    });
    caveats.append(list); content.append(caveats);
  }

  const comparisonView = authoredComparisonView(visual);
  if (comparisonView) {
    const comparison = document.createElement('section'); comparison.className = 'authored-comparison';
    const comparisonTitle = document.createElement('h5'); comparisonTitle.textContent = 'Authored comparison'; comparison.append(comparisonTitle);
    const appendFields = (parent, fields) => {
      for (const field of fields) {
        const line = document.createElement('div'), name = document.createElement('strong'), value = document.createElement('span'), pointer = document.createElement('code');
        name.textContent = `${field.key}: `;
        value.textContent = typeof field.value === 'string' ? field.value : JSON.stringify(field.value) ?? String(field.value);
        pointer.textContent = field.sourcePath;
        line.append(name, value, pointer); parent.append(line);
      }
    };
    const axes = document.createElement('div'); axes.className = 'authored-comparison-axes';
    for (const axis of comparisonView.axes) {
      const line = document.createElement('p'), name = document.createElement('strong'), value = document.createElement('span'), pointer = document.createElement('code');
      const criterion = comparisonView.criteria.find(candidate => candidate.id === axis.value);
      name.textContent = `${axis.key.toUpperCase()} axis: `;
      value.textContent = criterion ? `${safeText(axis.value)} · ${safeText(criterion.label)}` : safeText(axis.value);
      pointer.textContent = axis.sourcePath;
      line.append(name, value, pointer);
      if (criterion) { const criterionPath = document.createElement('code'); criterionPath.textContent = criterion.sourcePath; line.append(criterionPath); }
      axes.append(line);
    }
    comparison.append(axes);

    const tableWrap = document.createElement('div'); tableWrap.className = 'authored-comparison-table-wrap';
    const table = document.createElement('table'); table.className = 'authored-comparison-table';
    const head = document.createElement('thead'), headerRow = document.createElement('tr'), itemHeader = document.createElement('th');
    itemHeader.scope = 'col'; itemHeader.textContent = 'Item'; headerRow.append(itemHeader);
    for (const criterion of comparisonView.criteria) {
      const cell = document.createElement('th'); cell.scope = 'col';
      const identity = document.createElement('div'); identity.className = 'authored-comparison-criterion';
      const id = document.createElement('strong'); id.textContent = `${safeText(criterion.id)} · ${safeText(criterion.label)}`;
      const path = document.createElement('code'); path.textContent = criterion.sourcePath;
      identity.append(id, path); appendFields(identity, criterion.fields); cell.append(identity); headerRow.append(cell);
    }
    head.append(headerRow); table.append(head);
    const body = document.createElement('tbody');
    for (const item of comparisonView.items) {
      const row = document.createElement('tr'), itemCell = document.createElement('th'); itemCell.scope = 'row';
      const itemIdentity = document.createElement('div'), itemId = document.createElement('strong'), itemLabel = document.createElement('span'), itemPath = document.createElement('code');
      itemId.textContent = safeText(item.id); itemLabel.textContent = safeText(item.label); itemPath.textContent = item.sourcePath;
      itemIdentity.append(itemId, itemLabel, itemPath); appendFields(itemIdentity, item.fields); itemCell.append(itemIdentity); row.append(itemCell);
      for (const criterion of comparisonView.criteria) {
        const cell = document.createElement('td'), valueRecord = comparisonView.values.find(candidate => candidate.item === item.id && candidate.criterion === criterion.id);
        if (valueRecord) { const valuePath = document.createElement('code'); valuePath.textContent = valueRecord.sourcePath; cell.append(valuePath); appendFields(cell, valueRecord.fields); }
        else cell.textContent = 'No value authored for this item and criterion.';
        row.append(cell);
      }
      body.append(row);
    }
    table.append(body); tableWrap.append(table); comparison.append(tableWrap);

    if (comparisonView.chosen) {
      const choice = document.createElement('div'); choice.className = 'authored-comparison-choice';
      const choiceTitle = document.createElement('strong'); choiceTitle.textContent = 'Authored choice'; choice.append(choiceTitle);
      const chosenItem = comparisonView.items.find(item => item.id === comparisonView.chosen.item);
      const chosenValue = document.createElement('p'); chosenValue.textContent = chosenItem ? `${safeText(chosenItem.id)} · ${safeText(chosenItem.label)}` : safeText(comparisonView.chosen.item);
      const itemPointer = document.createElement('code'); itemPointer.textContent = comparisonView.chosen.itemSourcePath;
      const reason = document.createElement('p'); reason.textContent = safeText(comparisonView.chosen.reason);
      const reasonPointer = document.createElement('code'); reasonPointer.textContent = comparisonView.chosen.reasonSourcePath;
      choice.append(chosenValue, itemPointer, reason, reasonPointer); comparison.append(choice);
    }
    content.append(comparison);
  }

  const metricView = authoredMetricView(visual);
  if (metricView) {
    const metric = document.createElement('section'); metric.className = 'authored-metric';
    const metricTitle = document.createElement('h5'); metricTitle.textContent = 'Authored metric fields'; metric.append(metricTitle);
    const appendMetricFields = (parent, fields) => {
      for (const field of fields) {
        const line = document.createElement('p'), name = document.createElement('strong'), value = document.createElement('span'), pointer = document.createElement('code');
        name.textContent = `${field.key}: `;
        value.textContent = typeof field.value === 'string' ? field.value : JSON.stringify(field.value) ?? String(field.value);
        pointer.textContent = field.sourcePath;
        line.append(name, value, pointer); parent.append(line);
      }
    };
    const definition = document.createElement('div'); definition.className = 'authored-metric-definition';
    appendMetricFields(definition, metricView.fields); metric.append(definition);
    for (const series of metricView.series) {
      const seriesSection = document.createElement('section'); seriesSection.className = 'authored-metric-series';
      const seriesTitle = document.createElement('h6'); seriesTitle.textContent = [series.id, series.label].filter(Boolean).join(' · ') || 'Metric series'; seriesSection.append(seriesTitle);
      const seriesPath = document.createElement('code'); seriesPath.textContent = series.sourcePath; seriesSection.append(seriesPath);
      appendMetricFields(seriesSection, [
        ...(typeof series.id === 'string' ? [{key: 'id', value: series.id, sourcePath: series.idSourcePath}] : []),
        ...(typeof series.label === 'string' ? [{key: 'label', value: series.label, sourcePath: series.labelSourcePath}] : []),
      ]);
      appendMetricFields(seriesSection, series.fields);
      for (const [pointIndex, point] of series.points.entries()) {
        const pointSection = document.createElement('div'); pointSection.className = 'authored-metric-point';
        const pointTitle = document.createElement('strong'); pointTitle.textContent = `Point ${pointIndex + 1}`;
        const pointPath = document.createElement('code'); pointPath.textContent = point.sourcePath;
        pointSection.append(pointTitle, pointPath); appendMetricFields(pointSection, point.fields); seriesSection.append(pointSection);
      }
      metric.append(seriesSection);
    }
    const note = document.createElement('p'); note.className = 'authored-metric-note'; note.textContent = 'Values and targets are shown as authored; this view does not calculate progress, percentages, or recommendations.'; metric.append(note);
    content.append(metric);
  }

  const steps = Array.isArray(visual.steps) ? visual.steps : [];
  const walkthrough = document.createElement('section'); walkthrough.className = 'authored-walkthrough';
  const walkthroughTitle = document.createElement('h5'); walkthroughTitle.textContent = 'Authored steps and focus'; walkthrough.append(walkthroughTitle);
  if (!steps.length) {
    const empty = document.createElement('p'); empty.textContent = 'No authored walkthrough steps.'; walkthrough.append(empty);
  } else {
    const targets = authoredFocusTargets(visual), ordered = document.createElement('ol'); ordered.className = 'authored-step-list';
    const stepPolicy = authoredStepListPolicy(steps);
    steps.forEach((step, stepIndex) => {
      const policy = stepPolicy[stepIndex], item = document.createElement('li');
      item.className = policy?.numbered ? 'authored-step' : 'authored-step authored-step-unordered'; item.value = policy?.listValue ?? stepIndex + 1;
      item.dataset.stepId = safeText(step.id); if (typeof step.when === 'string') item.dataset.when = step.when;
      const heading = document.createElement('h6');
      heading.append(document.createTextNode(`${safeText(step.id)} · ${safeText(step.title)}`)); item.append(heading);
      const stepMeta = [];
      if (typeof step.caption === 'string') stepMeta.push({label:'Caption',value:step.caption});
      if (typeof step.when === 'string') stepMeta.push({label:'When',value:step.when});
      if (typeof step.tag === 'string') stepMeta.push({label:'Tag',value:step.tag});
      for (const meta of stepMeta) { const line = document.createElement('p'); const label = document.createElement('strong'); label.textContent = `${meta.label}: `; line.append(label, document.createTextNode(meta.value)); item.append(line); }
      const focus = Array.isArray(step.focus) ? step.focus : [], focusList = document.createElement('ul'); focusList.className = 'authored-focus-list';
      if (!focus.length) { const empty = document.createElement('li'); empty.textContent = 'No focus IDs authored.'; focusList.append(empty); }
      focus.forEach((id, focusIndex) => {
        const focusItem = document.createElement('li'); focusItem.dataset.focusId = safeText(id);
        const focusPointer = document.createElement('code'); focusPointer.textContent = `/extensions/umf.visual/steps/${stepIndex}/focus/${focusIndex}`;
        const idCode = document.createElement('code'); idCode.textContent = safeText(id);
        const matches = targets.get(id) || [];
        focusItem.append(idCode, document.createTextNode(' · '));
        if (!matches.length) focusItem.append(document.createTextNode('Unresolved focus ID; no matching typed item is present in this visual payload. '));
        else {
          const targetList = document.createElement('ul'); targetList.className = 'authored-focus-targets';
          for (const target of matches) {
            const targetItem = document.createElement('li'), type = document.createElement('span'), label = document.createElement('span'), targetPath = document.createElement('code');
            type.className = 'authored-focus-kind'; type.textContent = target.kind;
            label.textContent = target.label; targetPath.textContent = target.sourcePath;
            targetItem.append(type, document.createTextNode(' · '), label, document.createTextNode(' · '), targetPath); targetList.append(targetItem);
          }
          focusItem.append(targetList);
        }
        focusItem.append(focusPointer); focusList.append(focusItem);
      });
      item.append(focusList); ordered.append(item);
    });
    walkthrough.append(ordered);
  }
  content.append(walkthrough);
}

async function loadVerifiedAsset(path, expectedHash) {
  try {
    const extension = typeof path === 'string' ? /\.(svg|png|jpe?g|json|ya?ml|toml|mmd|sql)$/i.exec(path)?.[0].toLowerCase() : '';
    if (!extension || !safeAssetPath(path, extension)) throw new Error('Asset path is outside the configured presentation namespace');
    const response = await fetch(`./${path}`, {cache: 'no-store'});
    if (!response.ok) throw new Error(`Asset request failed (${response.status})`);
    const bytes = await response.arrayBuffer();
    const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
    if (actual !== expectedHash.toLowerCase()) throw new Error('Asset hash does not match its review manifest');
    return URL.createObjectURL(new Blob([bytes], {type: response.headers.get('content-type') || 'application/octet-stream'}));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not load verified asset ${JSON.stringify(path)}: ${reason}`);
  }
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
  for (const anchor of [ui.svg, ui.png, ui.downloadSource, ui.downloadRecipe, ui.viewerSvg]) {
    anchor.href = '#';
    anchor.removeAttribute('download');
    anchor.setAttribute('aria-disabled', 'true');
  }
  ui.svg.setAttribute('aria-disabled', 'true');
  ui.png.setAttribute('aria-disabled', 'true');
}

function addRenderUrl(url) {
  state.objectUrls.add(url);
  state.renderUrls.add(url);
}

function clearRenderUrls() {
  if (ui.viewer.open) ui.viewer.close();
  ui.viewerImage.removeAttribute('src');
  ui.viewerImage.alt='';
  ui.viewerImage.style.width='';ui.viewerImage.style.height='';
  ui.viewerTitle.textContent='';ui.viewerCaption.textContent='';
  ui.viewerSvg.href='#';ui.viewerSvg.removeAttribute('download');ui.viewerSvg.setAttribute('aria-disabled','true');
  ui.viewerCanvas.style.width='';ui.viewerCanvas.style.height='';
  ui.viewerFrame.scrollLeft=0;ui.viewerFrame.scrollTop=0;
  for(const button of [ui.viewerFit,ui.viewerZoomOut,ui.viewerZoomIn,ui.viewerActualSize])button.disabled=true;
  ui.viewerZoomLevel.textContent='Fit';
  for (const url of state.renderUrls) {
    URL.revokeObjectURL(url);
    state.objectUrls.delete(url);
  }
  state.renderUrls.clear();
  state.currentImageUrl = null;
}

async function renderSelected() {
  const example = getExample(state.selectedId);
  if (!example) { renderAuthoredContext(undefined); return; }
  const token = ++state.renderToken;
  clearRenderUrls();
  state.viewerMode='fit';state.viewerScale=1;ui.viewerZoomLevel.textContent='Fit';
  const variant = inspectableVariant(getVariant(example, state.backend));
  state.currentVariant = variant ?? null;
  ui.title.textContent = safeText(example.title, 'Untitled visual');
  ui.description.textContent = safeText(example.description);
  ui.kicker.textContent = `${safeText(example.kind).toUpperCase()} / ${safeText(example.form).toUpperCase()}`;
  renderAuthoredPayload(example);
  renderAuthoredContext(example);
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
    const explanation = `No usable ${renderer} render is recorded for this example. ${safeText(unavailable?.error) || diagnostics || ''}`.trim();
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
    addRenderUrl(svgUrl);
    addRenderUrl(pngUrl);
    const sourceUrl = URL.createObjectURL(new Blob([nativeSource], {type: 'text/plain;charset=utf-8'}));
    addRenderUrl(sourceUrl);
    state.currentImageUrl = svgUrl;
    ui.source.textContent = nativeSource;
    ui.image.src = svgUrl;
    ui.image.alt = `${example.title} — rendered by ${variant.engine} ${variant.nativeVersion}`;
    await ui.image.decode();
    if (token !== state.renderToken) return;
    ui.viewerImage.src = svgUrl;
    ui.viewerImage.alt = ui.image.alt;
    ui.viewerTitle.textContent = safeText(example.title);
    const viewerQuality = variant.status === 'unqualified' ? ` · NATIVE QUALITY NOT QUALIFIED · failed checks: ${(variant.quality?.failedChecks || []).join(', ')}` : '';
    ui.viewerCaption.textContent = `${safeText(variant.engine)} ${safeText(variant.nativeVersion)} · PNG export ${variant.width} × ${variant.height}px · SVG vector${viewerQuality}`;
    ui.viewerSvg.href = svgUrl;
    ui.viewerSvg.download = pathLabel(variant.svgPath);
    ui.viewerSvg.setAttribute('aria-disabled', 'false');
    await ui.viewerImage.decode();
    if (token !== state.renderToken) return;
    setViewerZoom('fit');
    ui.state.hidden = true;
    ui.image.hidden = false;
    ui.enlarge.hidden = false;
    ui.frame.classList.add('has-image');
    ui.engine.textContent = `${safeText(variant.engine)} · ${safeText(variant.nativeVersion)}`;
    ui.quality.textContent = variant.status === 'unqualified' ? 'NATIVE QUALITY NOT QUALIFIED' : 'Native SVG';
    const caveats = [];
    if (variant.status === 'unqualified') {
      const evidence = new Map((variant.quality?.evidence || []).map(check => [check?.check, check]));
      const failures = variant.quality.failedChecks.map(id => `${id}: ${evidence.get(id)?.details || 'required native quality check failed'}`);
      caveats.push(`Native rendering succeeded, but required quality checks failed: ${failures.join(' ')}`);
    }
    if (example.form === 'stack') caveats.push('The bands are an authored reading order, not an execution sequence.');
    if (state.backend === 'mermaid' && example.form === 'entities') caveats.push('Mermaid connects entities; field bindings are labelled rather than shown as field-port attachments.');
    const approximationCodes = new Set((variant.approximations || []).map(item => item?.code).filter(Boolean));
    if (approximationCodes.has('ROUTING_SCOPE_CONFLICT')) caveats.push('This renderer uses one routing style for the connection scope, so conflicting per-edge route requests cannot all be represented.');
    if (approximationCodes.has('ROUTING_NATIVE_INTERPOLATION')) caveats.push('This renderer uses native interpolation for the requested route; exact path shape, control points and attachments remain backend-defined.');
    if (approximationCodes.has('CIRCULAR_NATIVE_GRID')) caveats.push('This renderer’s native block grid approximates circular node placement while retaining the authored clockwise order.');
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
    const execution = variant.execution;
    ui.execution.hidden = !execution || typeof execution !== 'object' || Array.isArray(execution) || Object.keys(execution).length === 0;
    const recipe = executionRecipe(variant);
    if (recipe) {
      const recipeUrl = URL.createObjectURL(new Blob([JSON.stringify(recipe, null, 2) + '\n'], {type: 'application/json;charset=utf-8'}));
      addRenderUrl(recipeUrl);
      ui.execution.hidden = false;
      ui.downloadRecipe.href = recipeUrl;
      ui.downloadRecipe.download = `${example.id}-${state.backend}-execution-recipe.json`;
      ui.downloadRecipe.hidden = false;
      ui.downloadRecipe.setAttribute('aria-disabled', 'false');
    }
    ui.dimensionNote.textContent = `${variant.width} × ${variant.height} px · PNG and SVG downloaded from this render.`;
  } catch (error) {
    if (token !== state.renderToken) return;
    setState(`This render could not be verified: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

function selectExample(id,updateHistory=true) {
  if (!getExample(id)) return;
  if (state.selectedId !== id) clearCitationDownloads();
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

ui.enlarge.addEventListener('click', () => { if (state.currentVariant) {ui.viewer.showModal();resetViewerZoom();requestAnimationFrame(resetViewerZoom);} });
$('viewer-fit').addEventListener('click',()=>setViewerZoom('fit'));
$('viewer-actual-size').addEventListener('click',()=>setViewerZoom('actual',1));
$('viewer-zoom-out').addEventListener('click',()=>setViewerZoom('scale',state.viewerScale-.25));
$('viewer-zoom-in').addEventListener('click',()=>setViewerZoom('scale',state.viewerScale+.25));
window.addEventListener('resize',()=>{if(ui.viewer.open&&state.viewerMode==='fit')requestAnimationFrame(()=>applyViewerZoom(true));});
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
