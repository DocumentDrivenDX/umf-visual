// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';
import {verifyReviewSourceEvidence} from '../../scripts/reviews/source-evidence';

const sourcePath='fixtures/visual/inventory/helix-activities.json';
const indexPath='fixtures/visual/sources/helix/activities-directory-index.json';
const manifestPath='fixtures/reviews/review-sources.json';
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=readFileSync(sourcePath),source=readVisualDocument(sourceBytes.toString('utf8'),'json') as Document,visual=getVisual(source) as Visual;
const indexBytes=readFileSync(indexPath),index=JSON.parse(indexBytes.toString('utf8')) as {schemaVersion:number;sourceLocator:string;resolvedRepository:string;resolvedPath:string;observedRevision:string;observedTreeObject:string;declaredDigest:string;declaredDigestStatus:string;snapshotScope:string;snapshotRecipe:string;directoryNames:string[]};
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {examples:Array<any>},review=manifest.examples.find(item=>item.id==='helix-activities')!;

test('HELIX activities preserve the exact Visual fixture and keep its directory digest unverified',()=>{
 const sourceDigest=sha(sourceBytes),indexDigest=sha(indexBytes),original='sha256:8cc83bfd0f7e7788b14ac88920dc4bfa5d7efd481e1e77ee26d9144d44a3481c';
 expect(sourceDigest).toBe('7aba4b411ded096e0d491b5d5a1a7d70b4a8e5dada68a083282dc9b813dd7bfe');
 expect(indexDigest).toBe('ac0e5a9c426199c86ede99cbc427cf39324cd71cc4dc2024fa188d2da546d78b');
 expect(source).toMatchObject({id:'visual:helix-activities',umf:'0.10.0',vocabularies:{'umf.visual':{version:'1.0.0'}}});
 expect(visual).toMatchObject({id:'helix-activities',kind:'flow',form:'pipeline',title:"HELIX's activities",question:'What order does work move in?'});
 expect(visual.source).toEqual({path:'helix:workflows/activities',digest:original});
 expect(index).toMatchObject({schemaVersion:1,sourceLocator:'helix:workflows/activities',resolvedRepository:'helix',resolvedPath:'workflows/activities',observedRevision:'f8e8a50cb26b8a3aa45404fa68a5071fad2a461d',observedTreeObject:'ac1750c71b465209cd43258e14ae25b8a553a7d0',declaredDigest:original,declaredDigestStatus:'not-reproduced'});
 expect(index.directoryNames).toEqual(['00-discover','01-frame','02-design','03-test','04-build','05-deploy','06-iterate']);
 expect(index.snapshotScope).toContain('names only');expect(index.snapshotRecipe).toContain('does not reproduce');
 expect(Object.keys(index).some(key=>/contents|fileBytes|activityFiles/u.test(key))).toBe(false);
 expect(visual.nodes?.map(({id,label,detail})=>({id,label,detail}))).toEqual([
  {id:'discover',label:'Discover',detail:'workflows/activities/00-discover/'},
  {id:'frame',label:'Frame',detail:'workflows/activities/01-frame/'},
  {id:'design',label:'Design',detail:'workflows/activities/02-design/'},
  {id:'test',label:'Test',detail:'workflows/activities/03-test/'},
  {id:'build',label:'Build',detail:'workflows/activities/04-build/'},
  {id:'deploy',label:'Deploy',detail:'workflows/activities/05-deploy/'},
  {id:'iterate',label:'Iterate',detail:'workflows/activities/06-iterate/'}
 ]);
 expect(visual.nodes?.map(node=>node.detail?.split('/').at(-2))).toEqual(index.directoryNames);
 expect(visual.edges).toEqual([
  {id:'discover--frame',from:'discover',to:'frame'},
  {id:'frame--design',from:'frame',to:'design'},
  {id:'design--test',from:'design',to:'test'},
  {id:'test--build',from:'test',to:'build'},
  {id:'build--deploy',from:'build',to:'deploy'},
  {id:'deploy--iterate',from:'deploy',to:'iterate'}
 ]);
 expect(visual.nodes?.every(node=>node.role===undefined&&node.status===undefined)).toBe(true);
 expect(inspectVisual(source)).toMatchObject({valid:true,complete:true});
 const before=JSON.stringify(source),parsed=readVisualDocument(sourceBytes.toString('utf8'),'json');
 expect(JSON.parse(writeVisualDocument(parsed,'json'))).toEqual(source);
 const yaml=writeVisualDocument(parsed,'yaml'),yamlParsed=readVisualDocument(yaml,'yaml');
 expect(getVisual(yamlParsed)).toEqual(visual);expect(JSON.parse(writeVisualDocument(yamlParsed,'json'))).toEqual(source);
 const payload=visualPayloadYaml(source);for(const node of visual.nodes??[])expect(payload).toContain(node.detail!);
 expect(JSON.stringify(source)).toBe(before);expect(sha(readFileSync(sourcePath))).toBe(sourceDigest);expect(sha(readFileSync(indexPath))).toBe(indexDigest);
});

test('HELIX activity review binds original JSON and a separate name-only provenance index',async()=>{
 const sourceDigest=sha(sourceBytes),indexDigest=sha(indexBytes),scope='The exact Visual 1.0.0 fixture remains unchanged as the review definition and preserves seven activity IDs, labels, directory details, six directed edges, order, title, question, and source locator. The locator `helix:workflows/activities` resolves locally to the HELIX repository path `workflows/activities`; the recorded checkout revision is f8e8a50cb26b8a3aa45404fa68a5071fad2a461d. Its direct child directory names match the fixture details, as recorded in a separately hashed name-only index. The fixture’s declared directory digest sha256:8cc83bfd0f7e7788b14ac88920dc4bfa5d7efd481e1e77ee26d9144d44a3481c is preserved but its byte-level recipe was not reproduced; the index does not claim a byte match. The six-edge chain and its order remain fixture-authored projection; directory numbering does not make the chain a mandatory execution order, and Iterate documentation describes feedback into earlier work. No activity roles, statuses, concurrency, back-edges, or current operational claims are added.';
 expect(review).toMatchObject({id:'helix-activities',title:'HELIX’s activities',kind:'flow',form:'pipeline',definitionPath:sourcePath,definitionSha256:sourceDigest});
 expect(review.sources).toEqual([
  {path:sourcePath,sha256:sourceDigest,pointer:'/extensions/umf.visual',label:'Authoritative UMF fixture',description:'The exact Visual 1.0.0 fixture supplies seven activity IDs, labels, directory details, six directed chain edges, and the title, question, and source locator.'},
  {path:indexPath,sha256:indexDigest,pointer:'Direct child directory names of workflows/activities',label:'HELIX directory-name index',originalLocator:'helix:workflows/activities',resolvedSource:'helix/workflows/activities',observedRevision:'f8e8a50cb26b8a3aa45404fa68a5071fad2a461d',description:'A deterministic index of the seven direct child Git tree entries at the recorded HELIX revision. It records names only and does not reproduce the fixture’s declared directory digest or snapshot activity contents.'}
 ]);
 expect(review.publishedAssets).toEqual([
  {path:sourcePath,sha256:sourceDigest,outputPath:'reviews/helix-activities/authoritative-source.json',mediaType:'application/json',description:'Exact original UMF fixture bytes for source-preserving download.'},
  {path:indexPath,sha256:indexDigest,outputPath:'reviews/helix-activities/activity-directory-index.json',mediaType:'application/json',description:'Exact name-only index and provenance receipt for the locally resolved HELIX activities directory.'}
 ]);
 expect(review.originalEvidence).toEqual({kind:'authoritative-umf-source',sourcePath,sourceSha256:sourceDigest,documentId:'visual:helix-activities',visualId:'helix-activities',envelopeVersion:'0.10.0',modelVersion:'1.0.0',sourceDownloadPath:'reviews/helix-activities/authoritative-source.json',scope});
 expect((await verifyReviewSourceEvidence()).examples).toBe(manifest.examples.length);
});
