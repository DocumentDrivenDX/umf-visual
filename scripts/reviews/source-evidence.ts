// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';

const root=resolve(import.meta.dir,'../..');
const sha=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
const safe=(path:unknown):path is string=>typeof path==='string'&&/^[A-Za-z0-9._/-]+$/.test(path)&&!path.startsWith('/')&&!path.split('/').includes('..');
const readJson=async(path:string)=>JSON.parse(await readFile(join(root,path),'utf8'));

export async function verifyReviewSourceEvidence(manifestPath='fixtures/reviews/review-sources.json'):Promise<{examples:number;captures:number}>{
 const manifest=await readJson(manifestPath);
 if(manifest.schemaVersion!==1||!Array.isArray(manifest.examples)||manifest.examples.length===0)throw Error('Review source manifest must contain examples under schemaVersion 1.');
 let captures=0;const ids=new Set<string>();
 for(const example of manifest.examples){
  if(!example||typeof example.id!=='string'||ids.has(example.id))throw Error('Review source manifest has a missing or duplicate ID.');ids.add(example.id);
  const original=example.originalEvidence;if(!original||original.kind!=='synthetic-integration-witness'||typeof original.classification!=='string'||!original.classification.trim())throw Error(`${example.id} uses an unsupported or incomplete original-evidence provenance declaration.`);
  const integrationPath=original.integrationManifestPath,receiptPath=original.previewReceiptPath;
  if(!safe(integrationPath)||!safe(receiptPath)||sha(await readFile(join(root,integrationPath)))!==original.integrationManifestSha256)throw Error(`${example.id} integration manifest identity or hash is stale.`);
  if(sha(await readFile(join(root,receiptPath)))!==original.previewReceiptSha256)throw Error(`${example.id} preview receipt identity or hash is stale.`);
  const integration=await readJson(integrationPath),entry=integration.cases?.find((item:any)=>item.id===original.integrationCaseId);
  if(!entry||!safe(entry.commonVisualPath)||!safe(entry.nativeWitnessPath))throw Error(`${example.id} does not join an integration case with safe common and native witness paths.`);
  const commonPath=join(dirname(integrationPath),entry.commonVisualPath),nativePath=join(dirname(integrationPath),entry.nativeWitnessPath);
  if(commonPath!==original.commonDocumentPath||nativePath!==original.nativeWitnessPath)throw Error(`${example.id} source paths differ from the joined integration case.`);
  const [commonBytes,nativeBytes]=await Promise.all([readFile(join(root,commonPath)),readFile(join(root,nativePath))]);
  if(sha(commonBytes)!==original.commonDocumentSha256||sha(nativeBytes)!==original.nativeWitnessSha256)throw Error(`${example.id} common/native witness hash is stale.`);
  const nativeWitness=JSON.parse(nativeBytes.toString('utf8'));
  if(integration.authorship!=='synthetic'||nativeWitness.authorship!=='synthetic-fixture'||original.classification!=='synthetic-witness')throw Error(`${example.id} declared authorship classification does not match the integration manifest and native witness.`);
  const sourceRows=new Map((example.sources??[]).map((source:any)=>[source.path,source.sha256]));
  if(sourceRows.get(commonPath)!==original.commonDocumentSha256||sourceRows.get(nativePath)!==original.nativeWitnessSha256)throw Error(`${example.id} review sources do not bind both common and native source bytes.`);
  const receipt=await readJson(receiptPath),previewCase=receipt.cases?.find((item:any)=>item.id===original.integrationCaseId);
  const preview=previewCase?.rendererTargets?.find((item:any)=>item.rendererId===original.rendererId);
  if(!preview||previewCase.source.sha256!==original.commonDocumentSha256||previewCase.assetSourcePath!==original.captureSourcePath)throw Error(`${example.id} captured preview is not joined to the common witness.`);
  const details=preview.preview,asset=details?.asset;
  for(const [field,value] of Object.entries({profileId:original.rendererProfileId,modelVersion:original.modelVersion,mappingVersion:original.mappingVersion,nativeVersion:original.nativeVersion,stage:original.stage,captureDigestSha256:original.captureDigestSha256}))if(details?.[field]!==value)throw Error(`${example.id} original ${original.rendererId} ${field} identity differs from its receipt.`);
  if(!asset||asset.sha256!==original.captureSha256||asset.mediaType!==original.captureMediaType||original.capturePath!==example.publishedAssets?.find((item:any)=>item.path===original.captureSourcePath)?.outputPath)throw Error(`${example.id} historical capture asset is not bound to its receipt.`);
  const capture=await readFile(join(root,original.captureSourcePath));
  if(sha(capture)!==original.captureSha256)throw Error(`${example.id} historical capture hash is stale.`);
  if(!Array.isArray(original.knownOmissions)||original.knownOmissions.length===0||typeof original.scope!=='string'||!original.scope.trim())throw Error(`${example.id} historical evidence lacks qualified scope or omission notes.`);
  captures++;
 }
 return {examples:ids.size,captures};
}

export async function verifyReviewReceiptBindings(manifestPath='fixtures/reviews/review-sources.json',receiptPath='dist-site/reviews.json'){
 const [manifest,receipt]=await Promise.all([readJson(manifestPath),readJson(receiptPath)]);
 const rows=new Map((receipt.examples??[]).map((row:any)=>[row.id,row]));
 for(const example of manifest.examples){
  const row=rows.get(example.id) as any;
  if(!row||JSON.stringify(row.originalEvidence)!==JSON.stringify(example.originalEvidence))throw Error(`${example.id} receipt original-evidence metadata differs from its checked source manifest.`);
 }
 return true;
}
