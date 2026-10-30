// SPDX-License-Identifier: MIT OR Apache-2.0
// Additive renderer for scripts/catalog/integrations.ts output.
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
};
const jsonBlock = (value) => {
  const pre = make('pre', 'integration-json');
  pre.textContent = JSON.stringify(value, null, 2);
  return pre;
};
const targetLabel = {powerpoint: 'PowerPoint format', googleSlides: 'Google Slides plan', miro: 'Miro plan'};
const statusLabel = (status) => status === 'format-readback' ? 'PPTX format readback' : status[0].toUpperCase() + status.slice(1);
function renderHostProof(proof, standalone = false) {
  const article = make('article', `integration-details integration-host-proof${standalone ? ' standalone' : ''}`);
  const hostName = proof.target === 'google-slides' ? 'Google Slides' : proof.target === 'miro' ? 'Miro' : 'Microsoft PowerPoint';
  const heading = make('div', 'integration-host-proof-head');
  heading.append(make('h4', '', `${hostName} native-host execution`), make('span', 'integration-status host-matched', standalone ? 'Standalone proof' : 'Source-hash matched'));
  article.append(heading, make('p', 'integration-profile', proof.profile));
  if (standalone) article.append(make('p', 'integration-evidence-note', proof.scope.label));
  else article.append(make('p', 'integration-evidence-note', `Exact source match · ${proof.source.fixtureId} · SHA-256 ${proof.source.sha256}`));
  const details = document.createElement('details'); details.className = 'integration-details';
  details.append(make('summary', '', 'Inspect scoped native-host evidence'), jsonBlock(proof.scope)); article.append(details);
  const link = make('a', 'integration-download', 'Download sanitized host receipt');
  link.href = `./${proof.receipt.path}`; link.download = '';
  link.setAttribute('aria-label', `Download sanitized ${hostName} host conformance receipt`);
  article.append(link, make('p', 'integration-hash', `Receipt SHA-256 ${proof.receipt.sha256} · ${proof.receipt.bytes} bytes`));
  return article;
}
function renderTarget(name, target, matchedProofs = []) {
  const article = make('article', 'integration-target');
  const head = make('div', 'integration-target-head');
  head.append(make('h4', '', targetLabel[name] || name), make('span', `integration-status ${target.status}`, statusLabel(target.status)));
  article.append(head, make('p', 'integration-profile', target.profile));
  const note = target.nativeHostVerified ? 'Live native-host write and readback verified for this target row.' : `This target row is ${target.evidenceKind} evidence only; its status and loss inventory are unchanged by separately listed host receipts.`;
  article.append(make('p', 'integration-evidence-note', note));
  if (matchedProofs.length) article.append(make('p', 'integration-evidence-note', `Separate live-host evidence exists for this exact source (${matchedProofs.length} receipt${matchedProofs.length === 1 ? '' : 's'}); it does not clear this target's losses or expand the tested subset.`));
  if (target.artifact?.path && target.artifact.path.startsWith('integrations/downloads/')) {
    const link = make('a', 'integration-download', 'Download generated PPTX');
    link.href = `./${target.artifact.path}`; link.download = '';
    link.setAttribute('aria-label', `Download generated PowerPoint package for ${target.profile}`);
    article.append(link, make('p', 'integration-hash', `SHA-256 ${target.artifact.sha256} · ${target.artifact.bytes} bytes`));
  }
  if (Array.isArray(target.losses) && target.losses.length) {
    const details = document.createElement('details'); details.className = 'integration-details';
    details.append(make('summary', '', `Target adapter losses · ${target.losses.length}`), jsonBlock(target.losses)); article.append(details);
  }
  if (Array.isArray(target.diagnostics) && target.diagnostics.length) {
    const details = document.createElement('details'); details.className = 'integration-details';
    details.append(make('summary', '', `Adapter diagnostics · ${target.diagnostics.length}`), jsonBlock(target.diagnostics)); article.append(details);
  }
  const evidence = document.createElement('details'); evidence.className = 'integration-details';
  evidence.append(make('summary', '', 'Inspect emitted evidence and planner output'), jsonBlock(target.evidence)); article.append(evidence);
  return article;
}
function renderExample(item, hostProofs = []) {
  const card = make('article', 'integration-case');
  const title = make('div', 'integration-case-heading');
  const titleText = make('div', '');
  titleText.append(make('p', 'eyebrow', item.commonDocument ? 'COMMON PROJECTION EXAMPLE' : 'NATIVE-WITNESS ONLY'), make('h3', '', item.title));
  title.append(titleText, make('span', 'integration-case-id', item.id));
  card.append(title);
  const summary = make('p', 'integration-projection-summary', item.commonDocument
    ? `${item.commonProjection} · ${item.commonDocument.vocabularies?.['umf.visual']?.version || 'version not declared'} · ${item.commonDocument.extensions?.['umf.visual']?.nodes?.length || 0} nodes`
    : 'No common UMF projection authored; no target graph was generated.');
  card.append(summary);
  const completeness = make('p', 'integration-coverage-state', item.coverageComplete ? 'Coverage complete' : 'Coverage is partial or planning-only');
  completeness.dataset.complete = String(item.coverageComplete); card.append(completeness);
  if (item.coverageReasons?.length) {
    const reasons = make('ul', 'integration-coverage-reasons');
    for (const reason of item.coverageReasons) reasons.append(make('li', '', reason));
    card.append(reasons);
  }
  const targets = make('div', 'integration-target-grid');
  const matched = hostProofs.filter(proof => proof.matchedCaseId === item.id && proof.source.sha256 === item.commonSha256);
  for (const name of ['powerpoint', 'googleSlides', 'miro']) {
    const hostTarget = name === 'googleSlides' ? 'google-slides' : name;
    targets.append(renderTarget(name, item.targets[name], matched.filter(proof => proof.target === hostTarget)));
  }
  card.append(targets);
  if (matched.length) {
    const proofs = make('section', 'integration-host-proof-list');
    proofs.append(make('h4', '', 'Separate native-host evidence for this exact source'));
    for (const proof of matched) proofs.append(renderHostProof(proof));
    card.append(proofs);
  }
  const downloads = make('div', 'integration-downloads');
  for (const [key, label] of [['commonDocument', 'Download common UMF'], ['nativeWitness', 'Download native witness']]) {
    const artifact = item.downloads?.[key];
    if (!artifact?.path || !artifact.path.startsWith('integrations/downloads/')) continue;
    const link = make('a', 'integration-download', label); link.href = `./${artifact.path}`; link.download = '';
    link.setAttribute('aria-label', `${label} for ${item.title}`); downloads.append(link);
  }
  if (downloads.childElementCount) card.append(downloads);
  for (const [label, value, hash] of [['Common UMF projection', item.commonDocument, item.commonSha256], ['Original native witness', item.nativeWitness, item.nativeWitnessSha256]]) {
    if (value === null) continue;
    const details = document.createElement('details'); details.className = 'integration-source';
    details.append(make('summary', '', `${label} · SHA-256 ${hash}`), jsonBlock(value)); card.append(details);
  }
  const gaps = document.createElement('details'); gaps.className = 'integration-source';
  gaps.append(make('summary', '', `Original native-to-common projection gaps · ${item.originalProjectionGaps.length}`), jsonBlock(item.originalProjectionGaps)); card.append(gaps);
  return card;
}
/** Render the six-case integration evidence plus separately scoped native-host proofs. */
export function renderIntegrationCatalog(data, rootElement) {
  if (!(rootElement instanceof Element)) throw new TypeError('Integration catalogue mount element is required.');
  if (data?.schemaVersion !== 1 || !Array.isArray(data.cases)) throw new TypeError('Unsupported integration catalogue data.');
  rootElement.replaceChildren();
  const top = make('div', 'integration-section-head');
  const heading = make('div', ''); const title = make('h2', '', 'Examples across native adapter profiles'); title.id = 'integration-title';
  heading.append(make('p', 'eyebrow', 'CROSS-TOOL INTEGRATION WITNESSES'), title);
  heading.append(make('p', 'integration-lede', 'Six synthetic Miro-style witnesses separate authored shared-model projections from native-only records. Every target keeps its own losses visible.'));
  const stats = make('div', 'integration-stats');
  for (const [value, label] of [[data.counts?.cases ?? data.cases.length, 'synthetic witnesses'], [data.counts?.commonProjections ?? 0, 'authored common projections'], [data.counts?.opaqueWitnesses ?? 0, 'opaque witness only']]) {
    const stat = make('div', 'integration-stat'); stat.append(make('strong', '', value), make('span', '', label)); stats.append(stat);
  }
  top.append(heading, stats);
  rootElement.append(top);
  const status = make('aside', 'integration-release-state', data.complete ? 'All catalogued meaning is covered by qualified live-host evidence.' : 'This evidence set is not complete native-tool coverage. Per-case Google Slides and Miro rows remain plans only, and PPTX format readback is not an application test. Separate native-host receipts apply only to their exact source hashes and tested subsets; they do not clear losses or cover other cases.');
  status.setAttribute('role', 'note'); rootElement.append(status);
  const list = make('div', 'integration-case-list');
  for (const item of data.cases) list.append(renderExample(item, data.hostConformance || []));
  rootElement.append(list);
  const standaloneProofs = (data.hostConformance || []).filter(proof => proof.standalone === true);
  if (standaloneProofs.length) {
    const standalone = make('section', 'integration-host-proof-list integration-standalone-proofs');
    standalone.append(make('h3', '', 'Standalone native-host proof · outside the six-case corpus'));
    for (const proof of standaloneProofs) standalone.append(renderHostProof(proof, true));
    rootElement.append(standalone);
  }
  const provenance = make('p', 'integration-provenance', `Synthetic corpus manifest · ${data.corpus?.manifestPath || 'path unavailable'} · SHA-256 ${data.corpus?.manifestSha256 || 'unavailable'} · witness schema ${data.corpus?.witnessSchemaPath || 'unavailable'}`);
  rootElement.append(provenance);
}
