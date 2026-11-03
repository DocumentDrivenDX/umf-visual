// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {rm,writeFile} from 'node:fs/promises';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourceManifest='fixtures/reviews/review-sources.json';

test('review evidence joins exact checked-in definitions, integration witnesses, renderer receipt and capture bytes',async()=>{
 expect(await verifyReviewSourceEvidence()).toEqual({examples:4,captures:4});
});

test('stale or forged common/native/capture bindings fail before a review can be published',async()=>{
 const original=await Bun.file(sourceManifest).json();
 const manifestPath='.cache/review-provenance-negative.json';
 const mutations=[
  (manifest:any)=>{manifest.examples[0].originalEvidence.commonDocumentSha256='0'.repeat(64);},
  (manifest:any)=>{manifest.examples[0].sources[1].sha256='0'.repeat(64);},
  (manifest:any)=>{manifest.examples[0].originalEvidence.rendererProfileId='forged-profile';},
  (manifest:any)=>{manifest.examples[0].originalEvidence.classification='private-capture';},
  (manifest:any)=>{manifest.examples[0].originalEvidence.captureSha256='0'.repeat(64);},
  (manifest:any)=>{manifest.examples[0].publishedAssets[0].path='fixtures/renderers/miro/assets/another-capture.jpg';},
 ];
 try{
  for(const mutate of mutations){
   const changed=structuredClone(original);mutate(changed);await writeFile(manifestPath,JSON.stringify(changed));
   await expect(verifyReviewSourceEvidence(manifestPath)).rejects.toThrow();
  }
 }finally{await rm(manifestPath,{force:true});}
});
