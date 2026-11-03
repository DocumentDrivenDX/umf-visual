// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {editVisual,getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import type {Document} from '@umf/core';

const definitionPath='fixtures/reviews/definitions/miro-curved-caption-cross-boundary.json';
const commonPath='fixtures/integrations/complex-miro/common/curved-caption-cross-boundary.json';
const nativePath='fixtures/integrations/complex-miro/native/curved-caption-cross-boundary.json';
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
type Source={path:string;sha256:string;label?:string};
type Review={id:string;definitionPath:string;definitionSha256:string;sources:Source[];publishedAssets:Array<{path:string;sha256:string;outputPath:string}>;originalEvidence:Record<string,any>};

test('derived document keeps witnessed IDs/topology and adds only sourced shapes, route and graphical anchors',()=>{
 const doc=read<Document>(definitionPath),visual=getVisual(doc) as Visual;
 const common=getVisual(read<Document>(commonPath)) as Visual;
 const native=read<{authorship:string;items:Array<Record<string,any>>;notes:string[]}>(nativePath);
 expect(inspectVisual(doc)).toMatchObject({valid:true,complete:true});
 expect(doc.vocabularies?.['umf.visual']?.version).toBe('1.4.0');
 expect(native.authorship).toBe('synthetic-fixture');
 expect(visual.nodes?.map(({id,label,shape,group,role,ports})=>[id,label,shape,group,role,ports])).toEqual([
  ['source-node','Source','rectangle','region-a',undefined,[{id:'east-port',side:'east'}]],
  ['target-node','Target','rectangle','region-b',undefined,[{id:'west-port',side:'west'}]]
 ]);
 expect(visual.nodes?.map(({id,label,group})=>[id,label,group])).toEqual(common.nodes?.map(({id,label,group})=>[id,label,group]));
 expect(visual.groups?.map(({id,label,role})=>[id,label,role])).toEqual(common.groups?.map(({id,label,role})=>[id,label,role]));
 expect(visual.edges?.map(({id,from,to,fromPort,toPort,kind,label,directed,routing})=>[id,from,to,fromPort,toPort,kind,label,directed,routing])).toEqual([
  ['cross-edge','source-node','target-node','east-port','west-port','data','caption',undefined,{kind:'curved'}]
 ]);
 expect(visual.edges?.map(({id,from,to,kind,label})=>[id,from,to,kind,label])).toEqual(common.edges?.map(({id,from,to,kind,label})=>[id,from,to,kind,label]));
 const nativeNodes=native.items.filter(item=>item.kind==='node');
 expect(nativeNodes.map(({id,label,symbol})=>[id,label,symbol])).toEqual([
  ['syn-source','Source','synthetic.symbol.rectangle'],['syn-target','Target','synthetic.symbol.rectangle']
 ]);
 expect(native.items.filter(item=>item.kind==='group').map(({id,label,members})=>[id,label,members])).toEqual([
  ['syn-region-a','Region A',['syn-source']],['syn-region-b','Region B',['syn-target']]
 ]);
 const connector=native.items.find(item=>item.kind==='connector')!;
 expect([connector.id,connector.from,connector.to,connector.route,connector.attachment,connector.caption]).toEqual([
  'syn-curved-link','syn-source','syn-target','curved',{from:'east-port',to:'west-port'},'caption'
 ]);
 expect(connector.controlPoints).toHaveLength(2);
 expect(visual.nodes?.every(node=>node.role===undefined)).toBe(true);
 expect(visual.layout).toBeUndefined();
 expect(visual.source?.view).toContain('authors east/west side hints');
 expect(visual.omissions?.join(' ')).toContain('not native side fields');
 expect(visual.omissions?.join(' ')).toContain('not qualification evidence for Visual 1.4');
});

test('JSON/YAML read-edit-write preserves the exact caption, ports, groups and source topology',()=>{
 const original=read<Document>(definitionPath);
 for(const format of ['json','yaml'] as const){
  const serialized=writeVisualDocument(original,format);
  const roundTrip=readVisualDocument(serialized,format);
  const edited=editVisual(roundTrip,visual=>({...visual,title:'Reviewed cross-region link'}));
  const after=getVisual(readVisualDocument(writeVisualDocument(edited,format),format));
  expect(after.title).toBe('Reviewed cross-region link');
  expect(after.nodes?.map(node=>[node.id,node.ports])).toEqual([
   ['source-node',[{id:'east-port',side:'east'}]],['target-node',[{id:'west-port',side:'west'}]]
  ]);
  expect(after.edges?.map(edge=>[edge.id,edge.from,edge.to,edge.fromPort,edge.toPort,edge.label,edge.routing])).toEqual([
   ['cross-edge','source-node','target-node','east-port','west-port','caption',{kind:'curved'}]
  ]);
  expect(after.groups?.map(group=>[group.id,group.label,group.role])).toEqual([
   ['region-a','Region A','region'],['region-b','Region B','region']
  ]);
 }
});

test('common/native witnesses, old host receipts/captures and reviewed definition are hash-bound',()=>{
 const commonBytes=readFileSync(commonPath),nativeBytes=readFileSync(nativePath),definitionBytes=readFileSync(definitionPath);
 expect(hash(commonBytes)).toBe('3ac5f9703680ac77f66ff0947d2350e53138dea073f11da16e099fed6272aa8c');
 expect(hash(nativeBytes)).toBe('499fd6122844d0d0c22bc241422b6432601d5c3ce751f4d126195695130d57cd');
 const manifest=read<{examples:Review[]}>('fixtures/reviews/review-sources.json');
 const row=manifest.examples.find(example=>example.id==='miro-curved-caption-cross-boundary')!;
 expect(hash(definitionBytes)).toBe('7819be1bf0f45399ef951e54b98f74ef4c7d31935075cb2ffed7ef01e45d6672');
 expect(row.definitionPath).toBe(definitionPath);expect(row.definitionSha256).toBe(hash(definitionBytes));
 const sourceHashes=new Map(row.sources.map(source=>[source.path,source.sha256]));
 expect(sourceHashes.get(commonPath)).toBe(hash(commonBytes));expect(sourceHashes.get(nativePath)).toBe(hash(nativeBytes));
 const expectedSources=[
  ['fixtures/renderers/miro/preview-receipt.json','db234c735ca203de0fb75a9f8e709a40050794a8f1a8065efdb79dce95b13109'],
  ['fixtures/renderers/google-slides/preview-receipt.json','d1ddaec6368f5f66ba86b8a2930e224fc6e096772853221b7b407cea48263fd2'],
  ['fixtures/renderers/powerpoint/preview-receipt.json','60da64410d8da8c55749b0324f2abd147808ad174911516cf380b72808809cf6'],
  ['fixtures/renderers/powerpoint/native-ui-attestations.json','06cec5f6099c17072049a64294db0367ae3819ff55f625f00f710c4928d654b7'],
  ['fixtures/renderers/powerpoint/native-cycle-receipt.json','77675cb00a61a841734002964f8dcea732dc7a6f587d1b861c6625cbabff57bf']
 ] as const;
 for(const[path,digest]of expectedSources){expect(hash(readFileSync(path)),path).toBe(digest);expect(sourceHashes.get(path),path).toBe(digest);}
 const expectedAssets=[
  ['fixtures/renderers/miro/assets/curved-caption-cross-boundary-7f8d5ef17d823bc7.jpg','7f8d5ef17d823bc7d6c326e037d7e3ed5957d0cc4d39e09055e0543409a79782'],
  ['fixtures/renderers/google-slides/assets/curved-caption-cross-boundary-6f49a2745bcc0563.png','6f49a2745bcc0563158c4a52a04e9a3a7b2ab446bcce1fbe910ffdd6ee24259b'],
  ['fixtures/renderers/powerpoint/assets/curved-caption-cross-boundary-5137ddec4b2fd176.png','5137ddec4b2fd176c49b31a436730214bacbc21c32b979655a270d413b069917']
 ] as const;
 for(const[path,digest]of expectedAssets){expect(hash(readFileSync(path)),path).toBe(digest);expect(sourceHashes.get(path),path).toBe(digest);}
 expect(row.publishedAssets.map(asset=>[asset.path,asset.sha256])).toEqual(expectedAssets.map(([path,digest])=>[path,digest]));
 const miro=read<any>('fixtures/renderers/miro/preview-receipt.json').cases.find((item:any)=>item.id==='curved-caption-cross-boundary');
 const slides=read<any>('fixtures/renderers/google-slides/preview-receipt.json').cases.find((item:any)=>item.id==='curved-caption-cross-boundary');
 const powerpoint=read<any>('fixtures/renderers/powerpoint/preview-receipt.json').cases.find((item:any)=>item.id==='curved-caption-cross-boundary');
 for(const capture of [miro,slides,powerpoint])expect(capture.source.sha256).toBe(hash(commonBytes));
 expect(miro.rendererTargets[0].preview.modelVersion).toBe('1.0.0');expect(miro.rendererTargets[0].preview.stage).toBe('restored-original');
 expect(slides.rendererTargets[0].preview.modelVersion).toBe('1.0.0');expect(slides.rendererTargets[0].preview.stage).toBe('restored-original');
 expect(powerpoint.modelVersion).toBe('1.0.0');expect(powerpoint.preview.engine).toContain('LibreOffice');
 const pptUi=read<any>('fixtures/renderers/powerpoint/native-ui-attestations.json').cases.find((item:any)=>item.id==='curved-caption-cross-boundary');
 expect(pptUi.reopenObserved).toBe(true);expect(pptUi.noRepairPrompt).toBe(true);
 expect(row.originalEvidence).toMatchObject({integrationCaseId:'curved-caption-cross-boundary',classification:'synthetic-witness',modelVersion:'1.0.0',rendererId:'miro',stage:'restored-original',captureSha256:expectedAssets[0]![1]});
});
