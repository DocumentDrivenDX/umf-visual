const TARGETS = ['dot', 'mermaid', 'lini'];
const LABELS = {dot: 'DOT', mermaid: 'Mermaid', lini: 'Lini'};
const STATUS = ['supported', 'reported-loss', 'unsupported'];
const state = {catalog: null, query: '', kind: new Set(), form: new Set(), profiles: new Set(), status: new Set(), sort: 'title', selected: null, target: 'dot', showSecondary: false};
const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = String(text); return node; };
const safeJson = (value) => JSON.stringify(value, null, 2);
const normalized = (value) => String(value ?? '').trim().toLowerCase();
const allItems = () => state.catalog?.items ?? [];
const galleryItems = () => allItems().filter(item => state.showSecondary || isFormFixture(item));
const statusFor = (item, target) => item?.targets?.[target]?.status || 'unevaluated';
const isFormFixture = item => typeof item.sourcePath === 'string' && item.sourcePath.startsWith('fixtures/visual/forms/');
const sampleSetFor = item => item.origin === 'canary' ? 'canary' : isFormFixture(item) ? 'form-example' : 'application-example';
const sampleSetLabel = item => ({'form-example':'Form fixture example','application-example':'Application sample','canary':'Canary sample'}[sampleSetFor(item)]);
function findItemForUrl(id) {
  const exact = allItems().find(item => item.id === id);
  if (exact) return exact;
  const legacy = allItems().filter(item => {
    const fileName = String(item.sourcePath || '').split('/').pop() || '';
    const stem = fileName.endsWith('.json') ? fileName.slice(0, -5) : '';
    return stem && `visual-${stem}` === id;
  });
  return legacy.length === 1 ? legacy[0] : undefined;
}

function themeInit() {
  const stored = localStorage.getItem('umf-visual-theme');
  if (stored === 'dark' || stored === 'light') document.documentElement.dataset.theme = stored;
  updateThemeButton();
  $('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('umf-visual-theme', next);
    updateThemeButton();
  });
}
function updateThemeButton() {
  const dark = document.documentElement.dataset.theme === 'dark';
  $('theme-toggle').setAttribute('aria-label', dark ? 'Use light color theme' : 'Use dark color theme');
  $('theme-toggle').title = dark ? 'Use light color theme' : 'Use dark color theme';
}
function setUrl(id = state.selected, target = state.target) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('id', id); else url.searchParams.delete('id');
  if (id) url.searchParams.set('target', TARGETS.includes(target) ? target : 'dot'); else url.searchParams.delete('target');
  history.replaceState(null, '', url);
}
function statusName(status) { return status === 'reported-loss' ? 'Reported loss' : status === 'unevaluated' ? 'Not evaluated' : status[0].toUpperCase() + status.slice(1); }
function schemaShape(definition) {
  if (!definition || typeof definition !== 'object') return 'schema not supplied';
  if (definition.$ref) return `ref ${String(definition.$ref).split('/').pop()}`;
  const parts = [];
  if (definition.type) parts.push(Array.isArray(definition.type) ? definition.type.join(' | ') : definition.type);
  if (definition.items) parts.push(`items: ${schemaShape(definition.items)}`);
  if (Array.isArray(definition.enum)) parts.push(`enum: ${definition.enum.join(' · ')}`);
  if (definition.properties) parts.push(`${Object.keys(definition.properties).length} properties`);
  return parts.join(' · ') || 'schema object';
}
function appendSchemaRows(container, schema, names, required = new Set()) {
  for (const name of names) {
    const definition = schema?.properties?.[name]; if (!definition) continue;
    const row = el('div', 'schema-field'); const nameNode = el('code', 'schema-field-name', name);
    const fieldText = el('span', 'schema-field-shape', schemaShape(definition));
    row.append(nameNode, fieldText); if (required.has(name)) row.append(el('span', 'schema-required', 'required')); container.append(row);
  }
}
function renderLanguageReference() {
  const language = state.catalog.language;
  const schema = language.schema.schema;
  const kinds = language.forms.kinds;
  const formCount = kinds.reduce((sum, entry) => sum + entry.forms.length, 0);
  $('kind-count').textContent = String(kinds.length).padStart(2, '0'); $('form-count').textContent = String(formCount).padStart(2, '0');
  $('language-provenance').textContent = `Vocabulary schema · ${language.schema.sourcePath} · SHA-256 ${language.schema.sourceSha256}\nKind and form declarations · ${language.forms.sourcePath} · SHA-256 ${language.forms.sourceSha256}`;
  const required = new Set(schema.required || []);
  appendSchemaRows($('document-fields'), schema, ['id','kind','form','title','question','takeaway','audience','source','omissions'], required);
  appendSchemaRows($('shared-elements'), schema, ['groups','nodes','edges','steps'], required);
  appendSchemaRows($('kind-payloads'), schema, ['sequence','structure','state','timeline','comparison','metric'], required);
  const defs = $('type-definitions'); defs.replaceChildren();
  for (const [name, definition] of Object.entries(schema.$defs || {})) {
    const detail = document.createElement('details'); detail.className = 'type-definition';
    detail.append(el('summary', '', `${name} · ${schemaShape(definition)}`));
    if (definition && typeof definition === 'object' && definition.properties) {
      const fields = el('div', 'schema-fields');
      appendSchemaRows(fields, definition, Object.keys(definition.properties), new Set(definition.required || [])); detail.append(fields);
    } else detail.append(el('p', 'type-description', safeJson(definition)));
    defs.append(detail);
  }
  const formGrid = $('kind-reference-grid'); formGrid.replaceChildren();
  for (const entry of kinds) {
    const card = el('article', 'kind-reference-card'); card.append(el('h4', '', entry.kind));
    const forms = el('div', 'form-chip-list');
    for (const form of entry.forms) {
      const sample = allItems().find(item => item.kind === entry.kind && item.form === form && isFormFixture(item)) || allItems().find(item => item.kind === entry.kind && item.form === form);
      const chip = el(sample ? 'button' : 'span', 'form-chip', form);
      if (sample) { chip.type = 'button'; chip.setAttribute('aria-label', `Open ${sampleSetLabel(sample)} for ${entry.kind} / ${form}`); chip.title = `Open an example instance (${sampleSetLabel(sample)})`; chip.addEventListener('click', () => openDetail(sample.id, 'dot')); }
      forms.append(chip);
    }
    card.append(forms); formGrid.append(card);
  }
}
function sampleCounts() {
  return {
    forms: allItems().filter(isFormFixture).length,
    application: allItems().filter(item => sampleSetFor(item) === 'application-example').length,
    canary: allItems().filter(item => sampleSetFor(item) === 'canary').length,
  };
}
function updateGalleryLabels() {
  const counts = sampleCounts(); const additional = counts.application + counts.canary;
  $('secondary-gallery-summary').textContent = state.showSecondary ? 'Hide application and canary gallery' : `Show application and canary examples · ${additional} additional sample instances`;
  $('sample-scope-note').textContent = `${counts.forms} form fixture examples · ${counts.application} application samples · ${counts.canary} canary samples. Each row is a sample instance with its own source and measured profile outcomes.`;
}
function renderCoverage() {
  const grid = $('coverage-grid'); grid.replaceChildren();
  for (const target of TARGETS) {
    const counts = Object.fromEntries([...STATUS, 'unevaluated'].map(status => [status, allItems().filter(item => statusFor(item, target) === status).length]));
    const total = allItems().length || 1;
    const card = el('article', 'coverage-card');
    const top = el('div', 'coverage-card-top'); top.append(el('span', 'target-name', LABELS[target]), el('span', 'coverage-total', `${allItems().length} samples`));
    const bar = el('div', 'coverage-bar'); bar.setAttribute('aria-label', `${LABELS[target]} coverage: ${counts.supported} supported, ${counts['reported-loss']} reported loss, ${counts.unsupported} unsupported`);
    for (const status of STATUS) { const segment = el('span', status); segment.style.width = `${counts[status] / total * 100}%`; if (counts[status]) segment.title = `${counts[status]} ${statusName(status).toLowerCase()}`; bar.append(segment); }
    const stats = el('div', 'coverage-stats');
    for (const [name, status] of [['supported', 'supported'], ['loss', 'reported-loss'], ['unsupported', 'unsupported']]) { const stat = el('span'); stat.append(el('b', '', counts[status]), ` ${name}`); stats.append(stat); }
    card.append(top, bar, stats);
    const capability = state.catalog.capabilities?.find(entry => entry.format === target);
    if (capability) { const details = document.createElement('details'); details.className = 'capability-details'; details.append(el('summary', '', `${capability.profile || LABELS[target]} · v${capability.version || '—'}`)); details.append(el('p', '', `${capability.subset || 'Subset not specified'} · ${(capability.directions || []).join(' / ') || 'directions not specified'}`)); card.append(details); }
    grid.append(card);
  }
}
function setupFilters() {
  const lists = [
    ['kind-filters', 'kind', [...new Set(allItems().map(item => item.kind))].sort()],
    ['form-filters', 'form', [...new Set(allItems().map(item => item.form))].sort()],
    ['target-filters', 'profiles', TARGETS],
    ['status-filters', 'status', STATUS],
  ];
  for (const [containerId, key, options] of lists) {
    const box = $(containerId); box.replaceChildren();
    for (const option of options) {
      const label = el('label', 'filter-option'); const input = document.createElement('input'); input.type = 'checkbox'; input.value = option;
      input.dataset.filterKey = key; input.dataset.filterValue = option;
      input.addEventListener('change', () => { input.checked ? state[key].add(option) : state[key].delete(option); updateList(); refreshFilterCounts(); });
      const count = galleryItems().filter(item => key === 'status' ? (state.profiles.size ? [...state.profiles] : TARGETS).some(target => statusFor(item, target) === option) : key === 'profiles' ? Boolean(item.targets?.[option]) : item[key] === option).length;
      const filterLabel = key === 'status' ? statusName(option) : option;
      label.append(input, el('span', '', filterLabel), el('span', 'option-count', count)); box.append(label);
    }
  }
}
function refreshFilterCounts() {
  document.querySelectorAll('.filter-option input').forEach(input => {
    const key = input.dataset.filterKey; const value = input.dataset.filterValue;
    if (!key || !value) return;
    const count = galleryItems().filter(item => key === 'status' ? (state.profiles.size ? [...state.profiles] : TARGETS).some(target => statusFor(item, target) === value) : key === 'profiles' ? Boolean(item.targets?.[value]) : item[key] === value).length;
    const output = input.parentElement?.querySelector('.option-count'); if (output) output.textContent = String(count);
  });
}
function matches(item) {
  if (!state.showSecondary && !isFormFixture(item)) return false;
  if (state.kind.size && !state.kind.has(item.kind)) return false;
  if (state.form.size && !state.form.has(item.form)) return false;
  if (state.profiles.size && ![...state.profiles].some(target => item.targets?.[target])) return false;
  if (state.status.size && !(state.profiles.size ? [...state.profiles] : TARGETS).some(target => state.status.has(statusFor(item, target)))) return false;
  const q = normalized(state.query);
  if (!q) return true;
  return normalized([item.id, item.title, item.kind, item.form, item.question, item.sourcePath].join(' ')).includes(q);
}
function updateList() {
  const list = $('definition-list'); list.replaceChildren();
  const items = allItems().filter(matches).sort((a, b) => {
    const key = state.sort;
    const delta = String(a[key] ?? '').localeCompare(String(b[key] ?? ''), undefined, {sensitivity: 'base'});
    return delta || String(a.title).localeCompare(String(b.title));
  });
  const scopeCount = state.showSecondary ? allItems().length : sampleCounts().forms;
  $('result-count').textContent = `${items.length} ${state.showSecondary ? 'sample instances' : 'form examples'}${items.length !== scopeCount ? ` of ${scopeCount}` : ''}`;
  $('empty-state').hidden = items.length > 0;
  for (const item of items) list.append(makeCard(item));
  setUrl();
}
function makeCard(item) {
  const card = el('article', 'definition-card'); card.tabIndex = 0; card.setAttribute('role', 'button');
  const statusSummary = TARGETS.map(target => `${LABELS[target]} ${statusName(statusFor(item, target))}`).join('; ');
  card.setAttribute('aria-label', `Open ${item.title}, ${item.kind} ${item.form}; ${statusSummary}`); card.dataset.id = item.id;
  const main = el('div', 'definition-main');
  const topline = el('div', 'definition-topline'); topline.append(el('span', 'definition-title', item.title), el('span', 'definition-id', item.id));
  const badges = el('div', 'badges'); badges.append(el('span', 'badge', item.kind), el('span', 'badge', item.form), el('span', 'badge origin-badge', sampleSetLabel(item).toUpperCase()));
  main.append(topline, el('p', 'definition-question', item.question || 'No guiding question supplied.'), badges);
  const preview = el('div', 'definition-preview');
  const previewTarget = (state.profiles.size ? TARGETS.filter(target => state.profiles.has(target)) : TARGETS).find(target => item.targets?.[target]?.render?.ok && safeRenderPath(item.targets[target].render.svgPath));
  if (previewTarget) {
    const render = item.targets[previewTarget].render; const img = document.createElement('img'); img.src = safeRenderPath(render.svgPath, render.svgSha256); img.alt = `${LABELS[previewTarget]} native render preview of ${item.title}`; img.loading = 'lazy';
    img.addEventListener('error', () => { preview.replaceChildren(el('span', 'no-preview', 'PREVIEW UNAVAILABLE')); }); preview.setAttribute('aria-label', `${LABELS[previewTarget]} native render preview`); preview.append(img, el('span', 'preview-label', `${LABELS[previewTarget]} RENDER`));
  } else { preview.setAttribute('aria-label', 'No native render was recorded'); preview.append(el('span', 'no-preview', 'NO NATIVE RENDER')); }
  const strip = el('div', 'status-strip'); strip.setAttribute('aria-label', 'Target profile status');
  for (const target of TARGETS.filter(key => state.profiles.size === 0 || state.profiles.has(key))) {
    const status = statusFor(item, target); const cell = el('span', 'status-cell'); cell.dataset.status = status;
    cell.setAttribute('aria-label', `${LABELS[target]}: ${statusName(status)}`); cell.title = `${LABELS[target]} · ${statusName(status)}`;
    const abbreviation = status === 'supported' ? 'OK' : status === 'reported-loss' ? 'LOSS' : status === 'unsupported' ? 'NO' : '—';
    const shortTarget = target === 'mermaid' ? 'MER' : target === 'lini' ? 'LIN' : 'DOT';
    cell.append(el('i'), el('span', 'status-label', `${shortTarget} ${abbreviation}`)); strip.append(cell);
  }
  card.append(main, preview, strip);
  card.addEventListener('click', () => openDetail(item.id));
  card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetail(item.id); } });
  return card;
}
function makeBadge(text, className = 'badge') { return el('span', className, text); }
function openDetail(id, target = state.target) {
  const item = allItems().find(candidate => candidate.id === id); if (!item) return;
  state.selected = item.id; state.target = TARGETS.includes(target) ? target : 'dot';
  $('detail-title').textContent = item.title;
  $('detail-kicker').textContent = `SAMPLE INSTANCE / ${String(item.id).toUpperCase()}`;
  const meta = $('detail-meta'); meta.replaceChildren(makeBadge(item.kind), makeBadge(item.form), makeBadge(sampleSetLabel(item), 'badge origin-badge'));
  $('detail-question').textContent = item.question || 'No guiding question supplied.';
  $('umf-source').textContent = safeJson(item.document ?? {});
  const provenance = $('provenance'); provenance.textContent = `${item.sourcePath || 'Source path unavailable'}\nSHA-256  ${item.sourceSha256 || 'not supplied'}`;
  for (const key of TARGETS) { const tab = $(`tab-${key}`); tab.setAttribute('aria-selected', String(key === state.target)); tab.tabIndex = key === state.target ? 0 : -1; }
  showTarget(item, state.target); setUrl(item.id, state.target);
  const dialog = $('detail-dialog'); if (!dialog.open) dialog.showModal();
}
function safeRenderPath(path, sha256) {
  if (typeof path !== 'string' || !/^renders\/[A-Za-z0-9._/-]+\.svg$/.test(path) || path.split('/').some(part => part === '..')) return null;
  const url = new URL(path, new URL('./', location.href));
  if (typeof sha256 === 'string' && /^[a-f0-9]{64}$/i.test(sha256)) url.searchParams.set('v', sha256);
  return url.href;
}
function addDiagnostics(panel, diagnostics) {
  if (!Array.isArray(diagnostics) || !diagnostics.length) return;
  const list = el('ul', 'diagnostic-list');
  for (const diagnostic of diagnostics) {
    const text = typeof diagnostic === 'string' ? diagnostic : [diagnostic.code, diagnostic.message, diagnostic.path].filter(Boolean).join(' · ') || safeJson(diagnostic);
    const li = el('li', diagnostic?.severity === 'error' ? 'error' : '', text); list.append(li);
  }
  panel.append(list);
}
function addIdentityMap(panel, map) {
  if (!Array.isArray(map) || !map.length) return;
  const details = document.createElement('details'); details.className = 'identity-details'; const summary = el('summary', '', `Identity map · ${map.length} entries`); const pre = document.createElement('pre'); pre.textContent = safeJson(map); details.append(summary, pre); panel.append(details);
}
function showTarget(item, target) {
  const panel = $('target-panel'); panel.replaceChildren(); panel.setAttribute('aria-labelledby', `tab-${target}`);
  const result = item.targets?.[target];
  for (const key of TARGETS) { $(`tab-${key}`).setAttribute('aria-selected', String(key === target)); $(`tab-${key}`).tabIndex = key === target ? 0 : -1; }
  if (!result) {
    const status = el('p', 'target-status'); status.append(el('span', 'status-pill unevaluated', 'Not evaluated'));
    panel.append(status, el('p', 'target-explainer', `No ${LABELS[target]} profile result is present for this definition.`)); return;
  }
  const status = result.status || 'unevaluated';
  const statusRow = el('p', 'target-status'); statusRow.append(el('span', `status-pill ${status}`, statusName(status)), el('span', '', result.ok ? 'Source emitted' : 'No source emitted'));
  panel.append(statusRow);
  const reason = status === 'supported' ? `The configured ${LABELS[target]} profile exported this sample with no reported semantic loss.` : status === 'reported-loss' ? `The configured ${LABELS[target]} profile emitted source and reported one or more semantic losses. Review diagnostics and identity mapping below.` : status === 'unsupported' ? `The configured ${LABELS[target]} profile did not emit a source for this sample.` : 'This profile has not been evaluated for this sample.';
  panel.append(el('p', 'target-explainer', reason));
  const render = result.render;
  if (render?.ok && render.svgPath) {
    const src = safeRenderPath(render.svgPath, render.svgSha256);
    if (src) {
      const preview = el('div', 'render-preview'); const img = document.createElement('img'); img.src = src; img.alt = `${LABELS[target]} native render of ${item.title}`; img.loading = 'lazy';
      img.addEventListener('error', () => { preview.replaceChildren(el('p', 'render-error', 'Native render preview could not be loaded from the recorded SVG asset.')); });
      preview.append(img); panel.append(preview); const openSvg=el('a','text-link','Open native SVG ↗'); openSvg.href=src; openSvg.target='_blank'; openSvg.rel='noopener noreferrer'; openSvg.setAttribute('aria-label',`Open ${LABELS[target]} SVG for ${item.title}`); panel.append(openSvg); panel.append(el('p', 'render-caption', `Rendered by ${render.engine || LABELS[target]} ${render.nativeVersion || ''} · this SVG was generated from the emitted source`.trim()));
    } else panel.append(el('p', 'render-error', 'Native render asset path is invalid; preview withheld.'));
  } else if (render) {
    panel.append(el('p', 'render-error', `Native render unavailable: ${render.error || 'no render output was recorded.'}`));
    panel.append(el('p', 'render-caption', `Renderer ${render.engine || LABELS[target]} ${render.nativeVersion || '(version unavailable)'}`));
  }
  if (typeof result.source === 'string') {
    panel.append(el('p', 'target-source-label', `GENERATED ${LABELS[target].toUpperCase()} SOURCE`));
    const pre = el('pre', 'code-block'); const code = document.createElement('code'); code.textContent = result.source; pre.append(code); panel.append(pre);
    const actions = el('div', 'source-actions'); const download = el('button', 'icon-button', 'Download source'); download.type = 'button'; download.addEventListener('click', () => downloadText(`${item.id}.${target === 'mermaid' ? 'mmd' : target === 'dot' ? 'dot' : 'lini'}`, result.source)); actions.append(download); panel.append(actions);
  }
  addDiagnostics(panel, result.diagnostics); addIdentityMap(panel, result.identityMap);
}
function downloadText(filename, content) {
  const url = URL.createObjectURL(new Blob([content], {type: 'text/plain;charset=utf-8'})); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
let toastTimer;
function toast(message) { const node = $('toast'); node.textContent = message; node.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 1500); }
async function copyText(text, message) { try { await navigator.clipboard.writeText(text); toast(message); } catch { toast('Clipboard access is unavailable here'); } }
function resetFilters() {
  state.query = ''; state.kind.clear(); state.form.clear(); state.profiles.clear(); state.status.clear(); $('search').value = '';
  document.querySelectorAll('.filter-option input').forEach(input => { input.checked = false; }); updateList(); refreshFilterCounts();
}
async function init() {
  themeInit();
  try {
    const response = await fetch('./catalog.json', {cache: 'no-store'}); if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.catalog = await response.json();
    if (state.catalog.schemaVersion !== 1 || !Array.isArray(state.catalog.items)) throw new Error('Unsupported catalogue schema');
    if (!state.catalog.language?.schema?.schema || !state.catalog.language?.forms?.kinds) throw new Error('Language reference is missing');
    $('catalog-version').textContent = `CATALOGUE V${state.catalog.schemaVersion}`;
    renderLanguageReference(); updateGalleryLabels(); renderCoverage(); setupFilters();
    $('secondary-gallery').addEventListener('toggle', event => { state.showSecondary = event.target.open; updateGalleryLabels(); updateList(); });
    $('search').addEventListener('input', event => { state.query = event.target.value; updateList(); });
    $('sort-select').addEventListener('change', event => { state.sort = event.target.value; updateList(); });
    $('reset-filters').addEventListener('click', resetFilters); $('empty-reset').addEventListener('click', resetFilters);
    $('copy-umf').addEventListener('click', () => copyText($('umf-source').textContent, 'UMF JSON copied'));
    $('download-umf').addEventListener('click', () => { const item = allItems().find(candidate => candidate.id === state.selected); if (item) downloadText(`${item.id}.json`, safeJson(item.document ?? {})); });
    $('close-detail').addEventListener('click', () => $('detail-dialog').close());
    $('detail-dialog').addEventListener('close', () => { state.selected = null; setUrl(null); });
    for (const key of TARGETS) $(`tab-${key}`).addEventListener('click', () => { state.target = key; const item = allItems().find(candidate => candidate.id === state.selected); if (item) { showTarget(item, key); setUrl(item.id, key); } });
    document.querySelector('.target-tabs').addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault();
      const focusedTarget = event.target instanceof Element ? event.target.closest('[role="tab"]')?.dataset.target : undefined;
      const index = TARGETS.indexOf(focusedTarget || state.target); const next = TARGETS[(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
      state.target = next; $(`tab-${next}`).focus(); const item = allItems().find(candidate => candidate.id === state.selected); if (item) { showTarget(item, next); setUrl(item.id, next); }
    });
    const initialParams = new URLSearchParams(location.search); const initialId = initialParams.get('id'); const initialTarget = initialParams.get('target');
    updateList();
    if (initialId) {
      const item = findItemForUrl(initialId);
      if (item) openDetail(item.id, initialTarget || 'dot');
    }
  } catch (error) {
    console.error('Catalogue load failed', error); $('load-error').hidden = false; $('result-count').textContent = 'Catalogue unavailable';
  }
}
init();
