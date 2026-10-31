// SPDX-License-Identifier: MIT OR Apache-2.0
/** Verify native PowerPoint saves supplied by the host operator, then preserve and re-read them. */
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {exportPowerPoint, importPowerPoint, updatePowerPoint} from '../../src/adapters/powerpoint/index.js';
import {attribute, child, children, parseXml, type XmlElement} from '../../src/adapters/powerpoint/xml.js';
import {PRESENTATION_NS,nativeName} from '../../src/adapters/powerpoint/profile.js';
import {inspectZip} from '../../src/adapters/powerpoint/zip.js';
import {editVisual,getVisual,readVisualDocument,writeVisualDocument} from '../../src/extensions/visual/index.js';
import {admitHostBinding,canonicalHostJson} from '../../src/adapters/reconciliation/index.js';
import type {Document} from '@umf/core';

const root = resolve(import.meta.dir, '../..');
const base = join(root, '.cache/host-live/powerpoint-five-case');
const allIds = ['nested-environments', 'process-documents-store', 'network-16x24', 'frames-headings-annotations', 'curved-caption-cross-boundary'];
const hostReadbackMode=process.argv.includes('--host-readback');
const requestedIds = process.argv.slice(2).filter(value=>value!=='--host-readback');
const ids = requestedIds.length ? requestedIds : allIds;
if (ids.some(id => !allIds.includes(id))) throw new Error(`Unknown five-case fixture id: ${ids.find(id => !allIds.includes(id))}`);
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const priorReceipt=hostReadbackMode?await readJson(join(base,'native-verification.json')):undefined;
const uiAttestations=hostReadbackMode?await readJson(join(root,'fixtures/renderers/powerpoint/native-ui-attestations.json')):undefined;
const expectedNativeEdits:Record<string,{label:string;from?:string;to:string}>={
  'nested-environments':{label:'Native process',from:'store-in-b',to:'process-outside'},
  'process-documents-store':{label:'Native process',to:'documents-many'},
  'network-16x24':{label:'Native node 01',to:'n03'},
  'frames-headings-annotations':{label:'Native API',to:'queue'},
  'curved-caption-cross-boundary':{label:'Native source',from:'target-node',to:'source-node'},
};
function persistSource(document:Document):{json:Document;yaml:Document}{
  const json=readVisualDocument(writeVisualDocument(document,'json'),'json'),yaml=readVisualDocument(writeVisualDocument(document,'yaml'),'yaml');
  if(canonicalHostJson(json)!==canonicalHostJson(document)||canonicalHostJson(yaml)!==canonicalHostJson(document))throw new Error('JSON/YAML source persistence changed meaning');
  return{json,yaml};
}
function nativeShapeProperties(parts: Map<string, Uint8Array>): Map<string, {geometryAndStyle: string; textStyle: string}> {
  const bytes = parts.get('ppt/slides/slide1.xml');
  if (!bytes) throw new Error('Native presentation has no slide1 XML part');
  const parsed = parseXml(new TextDecoder().decode(bytes), 'PowerPoint slide shape-property verification');
  const cSld = child(parsed.root, PRESENTATION_NS, 'cSld');
  const tree = child(cSld, PRESENTATION_NS, 'spTree');
  const result = new Map<string, {geometryAndStyle: string; textStyle: string}>();
  const textRuns = (node: XmlElement): XmlElement[] => node.children.flatMap(childNode => childNode.kind === 'element' ? [...(childNode.uri === 'http://schemas.openxmlformats.org/drawingml/2006/main' && childNode.local === 't' ? [childNode] : []), ...textRuns(childNode)] : []);
  for (const shape of tree.children.filter((node): node is import('../../src/adapters/powerpoint/xml.js').XmlElement => node.kind === 'element' && node.uri === PRESENTATION_NS && ['sp', 'cxnSp'].includes(node.local))) {
    const nv = child(shape, PRESENTATION_NS, shape.local === 'sp' ? 'nvSpPr' : 'nvCxnSpPr');
    const name = attribute(child(nv, PRESENTATION_NS, 'cNvPr'), '', 'name')?.value;
    if (!name || result.has(name)) throw new Error('PowerPoint slide has missing or duplicate shape names');
    const properties = child(shape, PRESENTATION_NS, 'spPr');
    const textBodies = children(shape, PRESENTATION_NS, 'txBody');
    if (textBodies.length > 1) throw new Error('PowerPoint shape has multiple text bodies');
    const textBody = textBodies[0];
    let textStyle = textBody ? parsed.source.slice(textBody.start, textBody.end) : '';
    if (textBody) for (const run of textRuns(textBody).sort((a, b) => b.start - a.start)) textStyle = textStyle.slice(0, run.openEnd - textBody.start) + textStyle.slice(run.closeStart - textBody.start);
    result.set(name, {geometryAndStyle: parsed.source.slice(properties.start, properties.end), textStyle});
  }
  return result;
}
const receipt: any = {schemaVersion: 1, verifier: 'scripts/catalog/verify-powerpoint-five-case.ts', executionBoundary:hostReadbackMode?'Operator-supplied PowerPoint UI save and subsequent Save As readback files; exact changed semantic source verified independently. The operator supplies UI/no-repair observations separately.':'Actual PowerPoint saves are operator-supplied inputs. This verifier proves exact edits and library preserving-update/readback; actual reopen of the new preserving output is still pending.', cases: []};

for (const id of ids) {
  const dir = join(base, id);
  const input = join(dir, `${id}-native-saved.pptx`);
  const originalBytes = new Uint8Array(await readFile(input));
  const source = await readJson(join(dir, 'source.json')) as Document;
  const binding = await readJson(join(dir, 'binding.json'));
  const sourceBytes = await readFile(join(dir, 'source.json'));
  const sourceSha256 = sha(sourceBytes);
  const fixturePath=`fixtures/integrations/complex-miro/common/${id}.json`,fixtureBytes=await readFile(join(root,fixturePath));
  if(sha(fixtureBytes)!==sourceSha256)throw new Error(`${id}: private source bytes differ from the named corpus fixture`);
  const originalExport = await exportPowerPoint(source, {mode: 'report'});
  if (binding.profile !== originalExport.profile || binding.modelVersion !== originalExport.modelVersion || binding.sourceDigestSha256 !== originalExport.binding.sourceDigestSha256 || writeVisualDocument(binding.source, 'json') !== writeVisualDocument(source, 'json')) {
    throw new Error(`${id}: baseline binding does not match the declared source/profile/version`);
  }
  const noOpPath = join(dir, `${id}-native-noop.pptx`);
  const noOpBytes = new Uint8Array(await readFile(noOpPath));
  const noOp = await importPowerPoint(noOpBytes, {mode: 'report', binding, currentDocument: source, currentSourceSha256: originalExport.sourceSha256, expectedBindingRevision: binding.bindingRevision});
  if (canonicalHostJson(noOp.document)!==canonicalHostJson(source)||noOp.changes.length!==0) throw new Error(`${id}: PowerPoint no-op save changed UMF semantics`);

  const imported = await importPowerPoint(originalBytes, {mode: 'report', binding, currentDocument: source, currentSourceSha256: originalExport.sourceSha256, expectedBindingRevision: binding.bindingRevision});
  const baselineImport = noOp;
  const changedPaths = imported.changes.map(change => change.path);
  const allowed = /^\/extensions\/umf\.visual\/(title|question|nodes\/[0-9]+\/label|edges\/[0-9]+\/(label|from|to))$/;
  const unqualified = changedPaths.filter(path => !allowed.test(path));
  if (unqualified.length) throw new Error(`${id}: PowerPoint changed outside the qualified label/topology subset: ${unqualified.join(', ')}`);
  const expected=expectedNativeEdits[id]!;
  const expectedDocument=editVisual(source,v=>{v.nodes![0]!.label=expected.label;if(expected.from!==undefined)v.edges![0]!.from=expected.from;v.edges![0]!.to=expected.to;return v;});
  const expectedPaths=['/extensions/umf.visual/nodes/0/label','/extensions/umf.visual/edges/0/to',...(expected.from===undefined?[]:['/extensions/umf.visual/edges/0/from'])].sort();
  if(canonicalHostJson(imported.document)!==canonicalHostJson(expectedDocument)||canonicalHostJson([...changedPaths].sort())!==canonicalHostJson(expectedPaths))throw new Error(`${id}: actual native edits differ from the independently declared label and endpoint values`);
  const persisted=persistSource(imported.document),persistedBinding=await admitHostBinding(JSON.parse(JSON.stringify(imported.binding)));
  if(canonicalHostJson(persistedBinding)!==canonicalHostJson(imported.binding))throw new Error(`${id}: binding JSON persistence changed meaning`);
  const desired=editVisual(persisted.yaml,v=>{v.question+=' Preserving update verified.';return v;});
  await writeFile(join(dir,'imported-source.json'),writeVisualDocument(persisted.json,'json'));
  await writeFile(join(dir,'imported-source.yaml'),writeVisualDocument(persisted.yaml,'yaml'));
  await writeFile(join(dir,'desired-source.json'),writeVisualDocument(desired,'json'));
  await writeFile(join(dir,'imported-binding.json'),JSON.stringify(persistedBinding,null,2)+'\n');
  const preserved = await updatePowerPoint({...imported,binding:persistedBinding}, desired, {mode: 'report', currentArtifactBytes: originalBytes, currentArtifactSha256: sha(originalBytes), expectedBindingRevision: persistedBinding.bindingRevision});
  const preservedPath = join(dir, `${id}-preserved.pptx`);
  let preservedBytes=preserved.bytes;
  if(hostReadbackMode){
    preservedBytes=new Uint8Array(await readFile(preservedPath));
    const prior=priorReceipt?.cases.find((item:any)=>item.id===id);
    if(!prior||prior.preservedArtifact.sha256!==sha(preservedBytes))throw new Error(`${id}: reopened preserving input differs from the previous verified artifact`);
    // ZIP metadata timestamps may differ on a new serialization. Compare every
    // actual part with the independently regenerated semantic update instead.
    const expectedParts=inspectZip(preserved.bytes),actualParts=inspectZip(preservedBytes);
    if(expectedParts.size!==actualParts.size||[...expectedParts].some(([path,bytes])=>!actualParts.has(path)||sha(actualParts.get(path)!)!==sha(bytes)))throw new Error(`${id}: preserving input parts differ from the independently derived updated document`);
  }else{
    await writeFile(preservedPath,preservedBytes);
    await writeFile(join(dir,'preserved-binding.json'),JSON.stringify(preserved.binding,null,2)+'\n');
  }
  const reloaded = await importPowerPoint(preservedBytes, {mode: 'report', binding: preserved.binding, currentDocument: desired, currentSourceSha256: preserved.sourceSha256, expectedBindingRevision: preserved.bindingRevision});
  if (canonicalHostJson(reloaded.document)!==canonicalHostJson(desired)) throw new Error(`${id}: preserving re-import differs from the changed UMF-authored question`);
  if (reloaded.changes.length) throw new Error(`${id}: preserving output is not a native no-op on re-import`);
  const nativePropsBefore = nativeShapeProperties(imported.retained), nativePropsAfter = nativeShapeProperties(reloaded.retained);
  if (nativePropsBefore.size !== nativePropsAfter.size || [...nativePropsBefore].some(([name, properties]) => JSON.stringify(nativePropsAfter.get(name)) !== JSON.stringify(properties))) throw new Error(`${id}: preserving update changed native shape geometry/style properties`);
  const baselineProps = nativeShapeProperties(baselineImport.retained);
  const geometryChangedShapes = [...nativePropsBefore].filter(([name, properties]) => baselineProps.get(name)?.geometryAndStyle !== properties.geometryAndStyle).map(([name]) => name);
  const textStyleChangedShapes = [...nativePropsBefore].filter(([name, properties]) => baselineProps.get(name)?.textStyle !== properties.textStyle).map(([name]) => name);
  const editedNodeName=nativeName('node',getVisual(source).nodes![0]!.id);
  if(!geometryChangedShapes.includes(editedNodeName)||!textStyleChangedShapes.includes(editedNodeName))throw new Error(`${id}: expected native node movement and text-style witnesses are missing`);
  persistSource(reloaded.document);
  let hostReadback:Record<string,unknown>|undefined;
  if(hostReadbackMode){
    const hostBytes=new Uint8Array(await readFile(join(dir,`${id}-host-readback.pptx`)));
    const observation=uiAttestations?.cases.find((item:any)=>item.id===id);
    if(!observation||observation.source.sha256!==sourceSha256||observation.inputArtifactSha256!==sha(preservedBytes)||observation.outputArtifactSha256!==sha(hostBytes)||!observation.reopenObserved||!observation.noRepairPrompt||!observation.updatedQuestionVisible||!observation.nativeBoldLabelVisible||!observation.attachedEndpointsObserved)throw new Error(`${id}: actual native Save As files lack matching operator UI observations`);
    const actual=await importPowerPoint(hostBytes,{mode:'report',binding:preserved.binding,currentDocument:desired,currentSourceSha256:preserved.sourceSha256,expectedBindingRevision:preserved.bindingRevision});
    if(actual.changes.length||canonicalHostJson(actual.document)!==canonicalHostJson(desired))throw new Error(`${id}: actual PowerPoint Save As readback does not contain the changed UMF question and prior native edits`);
    const semantics=(losses:typeof actual.losses)=>losses.filter(loss=>loss.family==='semantic');
    if(canonicalHostJson(semantics(actual.losses))!==canonicalHostJson(semantics(preserved.losses)))throw new Error(`${id}: actual host readback changed the source semantic loss inventory`);
    persistSource(actual.document);
    hostReadback={artifactSha256:sha(hostBytes),inputArtifactSha256:sha(preservedBytes),exactUpdatedDocument:true,semanticChanges:0,losses:actual.losses,operatorAttestation:{host:uiAttestations.host,observedOn:uiAttestations.observedOn,reopenObserved:true,noRepairPrompt:true,updatedQuestionVisible:true,nativeBoldLabelVisible:true,attachedEndpointsObserved:true}};
  }

  receipt.cases.push({id, source: {path:fixturePath, sha256: sourceSha256},profileId:originalExport.profile,modelVersion:originalExport.modelVersion,mappingVersion:'1', originalArtifactSha256: sha(originalBytes), baselineBindingRevision: binding.bindingRevision,
    nativeNoOp: noOpBytes ? {artifactPath: noOpPath.slice(root.length + 1), artifactSha256: sha(noOpBytes), exactSourceReadback: true, semanticChanges: 0, retainedLosses: noOp!.losses} : null,
    nativeSavedArtifactSha256: sha(originalBytes), imported: {changes: imported.changes, nativeOnly: imported.nativeOnly, unmapped: imported.unmapped, retainedLosses: imported.losses},
    preservedArtifact: {path: preservedPath.slice(root.length + 1), sha256: sha(preservedBytes), bytes: preservedBytes.byteLength, bindingRevision: preserved.bindingRevision},
    nativePresentationChangesVsExport: {geometryAndStyleShapes: geometryChangedShapes, textStyleShapes: textStyleChangedShapes},
    persistence:{sourceJson:true,sourceYaml:true,bindingJson:true},
    preservingUpdate:{path:'/extensions/umf.visual/question',before:getVisual(imported.document).question,after:getVisual(desired).question},
    preservingReadback: {exactAcceptedDocument: true, semanticChanges: 0, nativeShapePropertiesPreserved: true, nativeShapeCount: nativePropsAfter.size, sourceLossesRemain: reloaded.losses},
    ...(hostReadback?{hostReadback}:{}),
    roundTrip:{state:hostReadback?'passed':'unavailable',nativeEdits:'operator-supplied PowerPoint UI saves',nativeEditValuesVerified:true,umfQuestionUpdateVerifiedByParser:true,nativeHostReadback:!!hostReadback,...(hostReadback?{}:{error:'Actual PowerPoint reopen/readback of this newly changed preserving artifact remains required.'})}});
  console.log(`${id}: accepted ${changedPaths.length} source changes, ${imported.nativeOnly.length} native-only observations; preserved ${preservedPath}`);
}
await mkdir(base, {recursive: true});
await writeFile(join(base, 'native-verification.json'), JSON.stringify(receipt, null, 2) + '\n');
await mkdir(join(root,'fixtures/renderers/powerpoint'),{recursive:true});
await writeFile(join(root,'fixtures/renderers/powerpoint/native-cycle-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(`verified receipt: ${join(base, 'native-verification.json')}`);
