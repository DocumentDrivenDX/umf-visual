// SPDX-License-Identifier: MIT OR Apache-2.0
// Verify native catalogue receipts; --rebuild also checks byte reproducibility.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {buildCatalog, type VisualCatalog, type CatalogTarget, type CatalogProfileVariant} from './build';
import {exportVisual,importVisual,visualForms} from '../../src';
import {focusedProfileSource} from './profile-views';
import {focusedFullProfilePreviewSource} from './full-profiles';
import {normalizeSvgIntrinsicDimensions, previewPresentationReceipt, type NativePreviewEngine} from './native-preview-presentation';

const root = resolve(import.meta.dir, '../..');
const output = join(root, 'dist-site');
const digest = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new Error(message); };
const canonical=(value:unknown):string=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function renderPaths(catalog:VisualCatalog):Set<string>{
 const paths=new Set<string>();for(const item of catalog.items){
  for(const target of Object.values(item.targets))if(target.render?.ok){if(target.render.svgPath)paths.add(target.render.svgPath);if(target.render.rawSvgPath)paths.add(target.render.rawSvgPath);}
  for(const variant of item.profileVariants??[])for(const render of [variant.result.render,variant.diagramRender])if(render?.ok){if(render.svgPath)paths.add(render.svgPath);if(render.rawSvgPath)paths.add(render.rawSvgPath);}
  for(const variant of item.fullProfileVariants??[])for(const render of [variant.result.render,variant.diagramRender])if(render?.ok){if(render.svgPath)paths.add(render.svgPath);if(render.rawSvgPath)paths.add(render.rawSvgPath);}
 }return paths;
}

async function snapshot(): Promise<Map<string, string>> {
  const catalog = JSON.parse(await readFile(join(output, 'catalog.json'), 'utf8')) as VisualCatalog;
  const files = new Map<string, string>();
  files.set('catalog.json', digest(await readFile(join(output, 'catalog.json'))));
  const paths = renderPaths(catalog);
  for (const path of paths) files.set(path, digest(await readFile(join(output, path))));
  for (const [path, hash] of await integrationSnapshot()) files.set(path, hash);
  return files;
}

async function integrationSnapshot(): Promise<Map<string,string>> {
  const integrationBytes = await readFile(join(output, 'integrations.json'));
  const data = JSON.parse(integrationBytes.toString('utf8'));
  const paths = new Set<string>();
  const add = (artifact: any) => { if (typeof artifact?.path === 'string') paths.add(artifact.path); };
  for (const item of data.cases ?? []) {
    add(item.downloads?.commonDocument); add(item.downloads?.nativeWitness);
    for (const target of Object.values(item.targets ?? {}) as any[]) add(target?.artifact);
    for (const row of item.rendererTargets ?? []) {
      for (const artifact of row.artifacts ?? []) add(artifact);
      add(row.preview?.asset); add(row.preview?.rawAsset);
    }
    for (const row of item.fullRendererTargets ?? []) {
      add(row.sourceArtifact); add(row.focusedSourceArtifact);
      add(row.native?.complete?.svgArtifact); add(row.native?.focused?.svgArtifact);
      add(row.completePreview?.asset); add(row.completePreview?.rawAsset);
      add(row.preview?.asset); add(row.preview?.rawAsset);
    }
  }
  for (const proof of data.hostConformance ?? []) add(proof.receipt);
  const files = new Map<string,string>([['integrations.json',digest(integrationBytes)]]);
  for (const path of paths) {
    assert(path.startsWith('integrations/') && !path.startsWith('/') && !path.split('/').includes('..'), `Unsafe integration snapshot path: ${path}`);
    files.set(path,digest(await readFile(join(output,path))));
  }
  return files;
}

async function currentRenderAssets(): Promise<Map<string, string>> {
  const catalog = JSON.parse(await readFile(join(output, 'catalog.json'), 'utf8')) as VisualCatalog;
  const assets = new Map<string, string>();
  const paths = renderPaths(catalog);
  for (const path of paths) assets.set(path, digest(await readFile(join(output, path))));
  for (const [path,hash] of await integrationSnapshot()) if (path !== 'integrations.json') assets.set(path,hash);
  return assets;
}

async function validateTarget(itemId: string, format: string, target: CatalogTarget): Promise<void> {
  if (target.status === 'unsupported') {
    assert(!target.ok && target.source === undefined && target.render === undefined,
      `Unsupported target ${itemId}/${format} must have diagnostics only and no native source or SVG.`);
    assert(target.diagnostics.length > 0, `Unsupported target ${itemId}/${format} has no refusal diagnostics.`);
    return;
  }
  assert(target.ok && typeof target.source === 'string' && target.source.length > 0,
    `Emitted target ${itemId}/${format} has no source text.`);
  if (!target.render) throw new Error(`Emitted target ${itemId}/${format} has no native render receipt.`);
  const render = target.render;
  assert(render.engine === (format === 'dot' ? 'graphviz' : format), `Wrong native engine for ${itemId}/${format}.`);
  assert(render.nativeVersion.length > 0 && render.nativeVersion !== 'unresolved', `Missing native version for ${itemId}/${format}.`);
  if (!render.ok) {
    assert(typeof render.error === 'string' && render.error.length > 0, `Failed render ${itemId}/${format} has no error.`);
    assert(render.svgPath === undefined && render.svgSha256 === undefined && render.rawSvgPath === undefined && render.rawSvgSha256 === undefined, `Failed render ${itemId}/${format} advertises SVG output.`);
    return;
  }
  assert(typeof render.svgPath === 'string' && typeof render.svgSha256 === 'string', `Successful render ${itemId}/${format} lacks path/hash.`);
  assert(!render.svgPath.startsWith('/') && !render.svgPath.split('/').includes('..'), `Unsafe SVG path for ${itemId}/${format}.`);
  assert(render.svgPath.endsWith(`-${render.svgSha256}.svg`), `SVG asset path is not content-addressed for ${itemId}/${format}.`);
  const svg = await readFile(join(output, render.svgPath));
  assert(svg.toString('utf8').includes('<svg'), `Presented native SVG for ${itemId}/${format} is not SVG.`);
  assert(digest(svg) === render.svgSha256, `SVG SHA-256 mismatch for ${itemId}/${format}.`);
  assert(typeof render.rawSvgPath === 'string' && typeof render.rawSvgSha256 === 'string', `Successful render ${itemId}/${format} lacks its raw engine SVG receipt.`);
  assert(!render.rawSvgPath.startsWith('/') && !render.rawSvgPath.split('/').includes('..'), `Unsafe raw SVG path for ${itemId}/${format}.`);
  assert(render.rawSvgPath.endsWith(`-raw-${render.rawSvgSha256}.svg`), `Raw SVG asset path is not content-addressed for ${itemId}/${format}.`);
  const raw = await readFile(join(output, render.rawSvgPath));
  assert(digest(raw) === render.rawSvgSha256, `Raw SVG SHA-256 mismatch for ${itemId}/${format}.`);
  assert(JSON.stringify(render.presentation) === JSON.stringify(previewPresentationReceipt(render.engine as NativePreviewEngine)), `Presentation receipt differs from the declared profile for ${itemId}/${format}.`);
  const normalized = normalizeSvgIntrinsicDimensions(raw.toString('utf8'));
  assert(normalized.svg === svg.toString('utf8'), `Display SVG changed geometry or differs from declared root normalization for ${itemId}/${format}.`);
}

export async function verifyCatalog(catalog?: VisualCatalog,release=false): Promise<{items: number; renders: number;completeExamples:number;completeForms:number;fullProfilePairs:number;fullProfileQualified:number;fullProfileForms:number;fullProfileApproximations:number;fullProfileLosses:number;fullProfileNativeDiagnostics:number}> {
  const value = catalog ?? JSON.parse(await readFile(join(output, 'catalog.json'), 'utf8')) as VisualCatalog;
  assert(value.schemaVersion === 1 && Array.isArray(value.items) && Array.isArray(value.capabilities), 'Invalid visual catalogue envelope.');
  for (const [source, expected] of [[value.language.schema, 'spec/extensions/visual/schema.json'], [value.language.forms, 'src/extensions/visual/index.ts']] as const) {
    assert(source.sourcePath === expected, `Unexpected language source path ${source.sourcePath}.`);
    assert(digest(await readFile(join(root, source.sourcePath))) === source.sourceSha256, `Language-source SHA-256 mismatch for ${source.sourcePath}.`);
  }
  const schemaSource = JSON.parse(await readFile(join(root, value.language.schema.sourcePath), 'utf8'));
  assert(JSON.stringify(value.language.schema.schema) === JSON.stringify(schemaSource), 'Language schema differs from its source file.');
  const expectedKinds = Object.entries(visualForms).map(([kind, forms]) => ({kind, forms: [...forms]}));
  assert(JSON.stringify(value.language.forms.kinds) === JSON.stringify(expectedKinds), 'Language form groups differ from src/extensions/visual/index.ts.');
  const sourcePaths = new Set<string>(), ids = new Set<string>();
  let renders = 0,completeExamples=0,fullProfilePairs=0,fullProfileQualified=0,fullProfileApproximations=0,fullProfileLosses=0,fullProfileNativeDiagnostics=0;const completeForms=new Set<string>(),fullProfileForms=new Set<string>();
  for (const item of value.items) {
    assert(!ids.has(item.id), `Duplicate item id ${item.id}.`); ids.add(item.id);
    assert(!sourcePaths.has(item.sourcePath), `Duplicate source path ${item.sourcePath}.`); sourcePaths.add(item.sourcePath);
    const sourceBytes=await readFile(join(root, item.sourcePath));
    assert(digest(sourceBytes) === item.sourceSha256, `Source SHA-256 mismatch for ${item.sourcePath}.`);
    assert(canonical(JSON.parse(sourceBytes.toString('utf8')))===canonical(item.document),`Catalogue document differs from its source fixture ${item.id}`);
    for (const format of ['dot', 'mermaid', 'lini'] as const) {
      const target = item.targets[format];
      await validateTarget(item.id, format, target);
      if (target.render?.ok) renders++;
      if (item.origin === 'canary' && target.ok) assert(target.render?.ok, `Canary ${item.id}/${format} did not render successfully.`);
    }
    const variantIds=new Set<string>();
    for(const variant of item.profileVariants??[]){
      assert(!variantIds.has(variant.profileId),`Duplicate profile variant ${item.id}/${variant.profileId}`);variantIds.add(variant.profileId);
      assert(variant.profileId===`umf.visual.${variant.format}.annotated/1`,`Mismatched profile format ${item.id}`);
      assert(variant.modelVersion===(item.document as any).vocabularies['umf.visual'].version,`Mismatched profile model ${item.id}`);
      await validateTarget(item.id+'/'+variant.profileId,variant.format,variant.result);
      if(variant.result.render?.ok)renders++;
      if(variant.result.ok){
        const strict=exportVisual(item.document,{format:variant.format,profile:variant.profileId,mode:'strict'});
        const expected=strict.ok?strict:exportVisual(item.document,{format:variant.format,profile:variant.profileId,mode:'allow-reported-loss'});
        assert(expected.ok&&expected.text===variant.result.source,`Profile source differs from a fresh export of its source document ${item.id}/${variant.profileId}`);
        assert((strict.ok?'supported':'reported-loss')===variant.result.status,`Profile status does not match strict export evidence ${item.id}/${variant.profileId}`);
      }
      if(variant.result.status==='supported'){
        assert(!variant.result.diagnostics.some(d=>d.loss||d.severity==='error'),`Strict variant has losses ${item.id}`);
        const fresh=exportVisual(item.document,{format:variant.format,profile:variant.profileId});
        assert(fresh.ok&&fresh.text===variant.result.source,`Profile source differs from public export ${item.id}`);
        const imported=importVisual(variant.result.source,{format:variant.format,profile:variant.profileId,id:'catalog-verification',question:'What survives?'});
        assert(imported.ok&&canonical(imported.document)===canonical(item.document),`Profile does not reconstruct the complete document ${item.id}`);
        assert(variant.diagramRender?.ok&&variant.diagramSourceSha256,`Missing focused native render ${item.id}`);
        assert(digest(focusedProfileSource(variant.result.source!,variant.format))===variant.diagramSourceSha256,`Focused view source differs from the declared projection ${item.id}`);
        await validateTarget(item.id+'/'+variant.profileId+'/diagram',variant.format,{...variant.result,render:variant.diagramRender});renders++;
      }else if(variant.result.ok){
        assert(variant.result.status==='reported-loss'&&variant.result.diagnostics.some(d=>d.loss),`Lossy preview lacks an explicit projection loss ${item.id}`);
        assert(variant.result.render?.ok&&variant.diagramRender?.ok&&variant.diagramSourceSha256,`Reported-loss source lacks complete/focused native preview receipts ${item.id}`);
        assert(digest(focusedProfileSource(variant.result.source!,variant.format))===variant.diagramSourceSha256,`Reported-loss focused source differs from its declaration ${item.id}`);
        await validateTarget(item.id+'/'+variant.profileId+'/complete-reported-loss',variant.format,variant.result);
        await validateTarget(item.id+'/'+variant.profileId+'/focused-reported-loss',variant.format,{...variant.result,render:variant.diagramRender});renders++;
      }else assert(variant.diagramRender===undefined&&variant.result.render===undefined,`Unsupported variant advertises a native preview ${item.id}`);
    }
    const fullIds = new Set<string>();
    for (const variant of item.fullProfileVariants ?? []) {
      fullProfilePairs++;
      assert(!fullIds.has(variant.profileId), `Duplicate full profile variant ${item.id}/${variant.profileId}`); fullIds.add(variant.profileId);
      assert(variant.profileId === `umf.visual.${variant.format}.full/1`, `Mismatched full profile format ${item.id}/${variant.profileId}`);
      assert(variant.modelVersion === (item.document as any).vocabularies['umf.visual'].version, `Mismatched full-profile model ${item.id}`);
      assert(variant.representation?.wholeDocumentReadback === true, `Full profile does not attest to a whole-document readback ${item.id}/${variant.profileId}`);
      assert(['native-profile','primitive-fallback'].includes(variant.representation.tier), `Unknown full-profile representation tier ${item.id}/${variant.profileId}`);
      assert(typeof variant.representation.sourceProfile === 'string' && variant.representation.sourceProfile.length > 0 && typeof variant.representation.sourceMappingVersion === 'string', `Full profile lacks actual renderer mapping provenance ${item.id}/${variant.profileId}`);
      assert(variant.representation.coverageModel === (variant.representation.tier === 'native-profile' ? 'native-concepts-and-annotations' : 'visible-record-tree'), `Full-profile coverage model does not match its route tier ${item.id}/${variant.profileId}`);
      const capability = value.capabilities.find(entry => entry.profile === variant.profileId && entry.format === variant.format);
      assert(capability && capability.version === variant.mappingVersion, `Full profile has no matching public capability ${item.id}/${variant.profileId}`);
      fullProfileApproximations += variant.approximations.length;
      fullProfileLosses += variant.result.diagnostics.filter(diagnostic => diagnostic.loss).length;
      await validateTarget(item.id + '/' + variant.profileId, variant.format, variant.result);
      if (variant.result.ok) {
        const strict = exportVisual(item.document, {format: variant.format, profile: variant.profileId, mode: 'strict'});
        const expected = strict.ok ? strict : exportVisual(item.document, {format: variant.format, profile: variant.profileId, mode: 'allow-reported-loss'});
        assert(expected.ok && expected.text === variant.result.source, `Full-profile source differs from a fresh export ${item.id}/${variant.profileId}`);
        assert((strict.ok ? 'supported' : 'reported-loss') === variant.result.status, `Full-profile status differs from strict export ${item.id}/${variant.profileId}`);
        const imported = importVisual(variant.result.source, {format: variant.format, profile: variant.profileId, id: 'catalog-verification', question: 'What survives?', mode: 'allow-reported-loss'});
        assert(imported.ok && canonical(imported.document) === canonical(item.document), `Full profile does not reconstruct the exact whole document ${item.id}/${variant.profileId}`);
        assert(canonical(variant.approximations) === canonical(imported.approximations ?? expected.approximations ?? []), `Full-profile approximation inventory differs from native readback ${item.id}/${variant.profileId}`);
        assert(canonical(variant.representation) === canonical(imported.representation), `Full-profile implementation route differs from exact native readback ${item.id}/${variant.profileId}`);
        assert(variant.coverage.length > 0 && canonical(variant.coverage) === canonical(imported.coverage ?? []), `Full-profile coverage differs from native readback ${item.id}/${variant.profileId}`);
        assert(variant.coverage.every(row => typeof row.path === 'string' && row.native.length > 0 && row.native.every(locator => locator.id.length > 0 && locator.slot.length > 0)), `Full-profile coverage has an unlocated field ${item.id}/${variant.profileId}`);
        if (variant.representation.tier === 'primitive-fallback') {
          assert(variant.representation.sourceProfile === variant.profileId && variant.representation.coverageModel === 'visible-record-tree', `Primitive fallback does not identify its full-profile renderer ${item.id}/${variant.profileId}`);
          assert(variant.coverage.length > 0 && variant.coverage.every(row => row.path === '' || row.path.startsWith('/')), `Primitive fallback lacks full record-tree coverage ${item.id}/${variant.profileId}`);
        } else {
          const native = item.profileVariants?.find(row => row.format === variant.format && row.profileId === variant.representation.sourceProfile);
          assert(native?.result.status === 'supported' && native.result.ok && native.result.source === variant.result.source, `Native-first full route does not reuse the exact strict annotated native source ${item.id}/${variant.profileId}`);
          assert(variant.representation.coverageModel === 'native-concepts-and-annotations', `Native-first route misstates its coverage model ${item.id}/${variant.profileId}`);
        }
        assert(variant.result.render?.ok && variant.diagramRender?.ok && variant.diagramSourceSha256, `Emitted full profile lacks complete/focused native renders ${item.id}/${variant.profileId}`);
        if (typeof variant.result.source !== 'string') throw new Error(`Full-profile source is absent ${item.id}/${variant.profileId}`);
        const focusedSource = focusedFullProfilePreviewSource(variant.result.source, variant.format, variant.representation);
        if (typeof variant.diagramSourceSha256 !== 'string') throw new Error(`Focused full-profile source hash is absent ${item.id}/${variant.profileId}`);
        assert(digest(focusedSource) === variant.diagramSourceSha256, `Focused full-profile source hash differs ${item.id}/${variant.profileId}`);
        renders++;
        await validateTarget(item.id + '/' + variant.profileId + '/focused', variant.format, {...variant.result, render: variant.diagramRender});
        renders++;
        const nativeDiagnostics = [...(variant.result.render.nativeDiagnostics ?? []), ...(variant.diagramRender.nativeDiagnostics ?? [])];
        fullProfileNativeDiagnostics += nativeDiagnostics.length;
        if (strict.ok && !variant.result.diagnostics.some(diagnostic => diagnostic.loss || diagnostic.severity === 'error') && nativeDiagnostics.length === 0) {
          fullProfileQualified++;
          fullProfileForms.add(item.kind + '/' + item.form);
        }
      } else {
        assert(variant.result.status === 'unsupported' && variant.result.diagnostics.length > 0, `Unemitted full profile lacks an explicit refusal ${item.id}/${variant.profileId}`);
        assert(variant.result.render === undefined && variant.diagramRender === undefined && variant.diagramSourceSha256 === undefined, `Refused full profile advertises native renders ${item.id}/${variant.profileId}`);
      }
    }
    assert(fullIds.size === 3, `Expected one candidate for each full-profile format on ${item.id}`);
    if(item.preferredRelease){
      const selected=item.profileVariants?.find(v=>v.profileId===item.preferredRelease!.profileId&&v.format===item.preferredRelease!.format);
      assert(isReleaseQualified(selected),`Preferred release lacks a strict, fully rendered profile with complete coverage ${item.id}`);
      completeExamples++;completeForms.add(item.kind+'/'+item.form);
    }else if(release)throw new Error(`Release blocked: ${item.id} has no suitable complete native-backed target`);
  }
  if(release){assert(value.items.length===53&&completeExamples===53,'Release requires all 53 unchanged examples');assert(completeForms.size===22,'Release requires faithful native previews of all 22 forms');assert(fullProfilePairs===159&&fullProfileQualified===159,'Release requires strict, exact-readback and native-rendered full profiles for all 159 format/example pairs');assert(fullProfileForms.size===22,'Release requires full-profile coverage across all 22 forms');assert(fullProfileLosses===0,'Release requires zero reported semantic losses on strict full-profile routes');assert(fullProfileNativeDiagnostics===0,'Release requires zero native compiler diagnostics on full-profile renders');}
  return {items: value.items.length, renders,completeExamples,completeForms:completeForms.size,fullProfilePairs,fullProfileQualified,fullProfileForms:fullProfileForms.size,fullProfileApproximations,fullProfileLosses,fullProfileNativeDiagnostics};
}

/** A loss-bearing preview is useful evidence, but can never count as complete release coverage. */
export function isReleaseQualified(variant:CatalogProfileVariant|undefined):variant is CatalogProfileVariant {
  return Boolean(variant&&variant.result.status==='supported'&&variant.result.ok&&typeof variant.result.source==='string'&&
    !variant.result.diagnostics.some(d=>d.loss||d.severity==='error')&&variant.result.render?.ok&&variant.diagramRender?.ok&&
    typeof variant.diagramSourceSha256==='string'&&variant.coverage.length>0&&
    variant.coverage.every(row=>row.path.length>0&&row.native.length>0));
}

if (import.meta.main) {
  const baseline = await verifyCatalog(undefined,process.argv.includes('--release'));
  if (process.argv.includes('--rebuild')) {
    const historicalAssets = await currentRenderAssets();
    await buildCatalog();
    const first = await snapshot();
    await buildCatalog();
    const second = await snapshot();
    assert(first.size === second.size, `Rebuild changed output file count (${first.size} to ${second.size}).`);
    for (const [path, hash] of first) assert(second.get(path) === hash, `Rebuild changed generated bytes: ${path}`);
    for (const [path, hash] of historicalAssets) assert(digest(await readFile(join(output, path))) === hash,
      `Rebuild removed or changed a previously published render: ${path}`);
    const verified = await verifyCatalog();
    console.log(JSON.stringify({...verified, reproducible: true}));
  } else {
    console.log(JSON.stringify({...baseline, verified: true}));
  }
}
