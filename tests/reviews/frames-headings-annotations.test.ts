// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import type {Document} from '@umf/core';

const definitionPath='fixtures/reviews/definitions/miro-frames-headings-annotations.json';
const commonPath='fixtures/integrations/complex-miro/common/frames-headings-annotations.json';
const nativePath='fixtures/integrations/complex-miro/native/frames-headings-annotations.json';
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
type Source={path:string;sha256:string;label?:string};
type Review={id:string;definitionPath:string;definitionSha256:string;sources:Source[];publishedAssets:Array<{path:string;sha256:string}>;originalEvidence:Record<string,any>};

test('derived document preserves topology and represents only witnessed frame membership and free text',()=>{
 const doc=read<Document>(definitionPath),visual=getVisual(doc) as Visual;
 expect(inspectVisual(doc)).toMatchObject({valid:true,complete:true});
 expect(doc.vocabularies?.['umf.visual']?.version).toBe('1.4.0');
 const common=getVisual(read<Document>(commonPath)) as Visual;
 const native=read<{authorship:string;items:Array<Record<string,any>>;notes:string[]}>(nativePath);
 expect(native.authorship).toBe('synthetic-fixture');
 const nativeToVisualId:Record<string,string>={'syn-api':'api','syn-worker':'worker','syn-queue':'queue','syn-database':'database'};
 const nativeNodes=native.items.filter(item=>item.kind==='node');
 expect(nativeNodes.map(({id,label,symbol})=>[id,label,symbol])).toEqual([
  ['syn-api','API','synthetic.symbol.rectangle'],
  ['syn-worker','Worker','synthetic.symbol.rectangle'],
  ['syn-queue','Queue','synthetic.symbol.cylinder'],
  ['syn-database','Database','synthetic.symbol.cylinder']
 ]);
 expect(visual.nodes?.map(({id,label,shape,role,group})=>[id,label,shape,role,group])).toEqual([
  ['api','API','rectangle',undefined,'syn-frame-a'],
  ['worker','Worker','rectangle',undefined,'syn-frame-a'],
  ['queue','Queue','cylinder',undefined,'syn-frame-b'],
  ['database','Database','cylinder',undefined,'syn-frame-b']
 ]);
 expect(visual.nodes?.map(({id,label})=>[id,label])).toEqual(common.nodes?.map(({id,label})=>[id,label]));
 expect(visual.edges?.map(({id,from,to,kind,routing,directed})=>[id,from,to,kind,routing,directed])).toEqual([
  ['api-worker','api','worker','data',{kind:'straight'},undefined],
  ['worker-queue','worker','queue','data',{kind:'straight'},undefined],
  ['queue-database','queue','database','data',{kind:'straight'},undefined]
 ]);
 expect(visual.edges?.map(({id,from,to,kind})=>[id,from,to,kind])).toEqual(common.edges?.map(({id,from,to,kind})=>[id,from,to,kind]));
 const witnessFrames=native.items.filter(item=>item.kind==='frame');
 expect(witnessFrames.map(frame=>[frame.id,frame.title,frame.memberIds])).toEqual([
  ['syn-frame-a','Request handling',['syn-api','syn-worker']],
  ['syn-frame-b','Persistence',['syn-queue','syn-database']]
 ]);
 for(const frame of witnessFrames){
  const visualGroup=visual.groups?.find(group=>group.id===frame.id)!;
  expect(visual.nodes?.filter(node=>node.group===visualGroup.id).map(node=>node.id)).toEqual(frame.memberIds.map((member:string)=>nativeToVisualId[member]));
 }
 for(const nativeNode of nativeNodes){
  const visualNode=visual.nodes?.find(node=>node.id===nativeToVisualId[nativeNode.id])!;
  const sourcedShape=nativeNode.symbol==='synthetic.symbol.rectangle'?'rectangle':'cylinder';
  expect(visualNode.shape).toBe(sourcedShape);
  expect(visualNode.role).toBeUndefined();
 }
 expect(visual.groups?.map(({id,label,role,layout})=>[id,label,role,layout])).toEqual([
  ['syn-frame-a','Request handling','region',{kind:'flow',direction:'LR',order:['api','worker']}],
  ['syn-frame-b','Persistence','region',{kind:'flow',direction:'LR',order:['queue','database']}]
 ]);
 expect(visual.layout).toEqual({kind:'flow',direction:'LR',order:['syn-frame-a','syn-frame-b']});
 expect(native.items.filter(item=>item.kind==='frame').map(item=>item.id).sort((left,right)=>{
  const a=native.items.find(item=>item.id===left)!.geometry.x,b=native.items.find(item=>item.id===right)!.geometry.x;return a-b;
 })).toEqual(visual.layout!.order!);
 const nativeText=native.items.filter(item=>item.kind==='free-text');
 expect(nativeText.map(({id,text})=>[id,text])).toEqual([
  ['syn-heading-a','Inbound path'],
  ['syn-note','Retry behavior is outside this sketch.']
 ]);
 expect(visual.annotations).toEqual([
  {id:'syn-heading-a',text:'Inbound path'},
  {id:'syn-note',text:'Retry behavior is outside this sketch.'}
 ]);
 expect(native.items.filter(item=>item.kind==='connector').map(({id,from,to,route,attachment})=>[id,from,to,route,attachment])).toEqual([
  ['syn-api-worker','syn-api','syn-worker','straight',{from:'shape-boundary',to:'shape-boundary'}],
  ['syn-worker-queue','syn-worker','syn-queue','straight',{from:'shape-boundary',to:'shape-boundary'}],
  ['syn-queue-db','syn-queue','syn-database','straight',{from:'shape-boundary',to:'shape-boundary'}]
 ]);
 expect(visual.annotations?.every(annotation=>Object.keys(annotation).sort().join(',')==='id,text')).toBe(true);
 expect(visual.nodes?.every(node=>!('x' in node)&&!('y' in node)&&!('geometry' in node))).toBe(true);
 expect(visual.groups?.every(group=>!('geometry' in group)&&!('x' in group)&&!('y' in group))).toBe(true);
 expect(visual.omissions?.join(' ')).toContain('syn-heading-a identifier does not assert a heading level');
 expect(visual.omissions?.join(' ')).toContain('do not show the synthetic witness frame titles or free-text items');
});

test('common/native witness, host receipts, captures and derived authoring bytes remain hash-bound',()=>{
 const commonBytes=readFileSync(commonPath),nativeBytes=readFileSync(nativePath),definitionBytes=readFileSync(definitionPath);
 expect(hash(commonBytes)).toBe('55b08c69a87621081ae7bacfaac63c0dc0e9883d7a97ae280667cbdbda4ba1aa');
 expect(hash(nativeBytes)).toBe('d4d5b56c84d42a43c78c3b1652d28d93b2785786642018518b799e1c094c41d8');
 const row=read<{examples:Review[]}>('fixtures/reviews/review-sources.json').examples.find(example=>example.id==='miro-frames-headings-annotations')!;
 expect(hash(definitionBytes)).toBe('2823dbf5cef09877193589fb8795e2ad96811f494e5ebfb00167cae1e2819a86');
 expect(row.definitionPath).toBe(definitionPath);expect(row.definitionSha256).toBe(hash(definitionBytes));
 const sourceHashes=new Map(row.sources.map(source=>[source.path,source.sha256]));
 expect(sourceHashes.get(commonPath)).toBe(hash(commonBytes));expect(sourceHashes.get(nativePath)).toBe(hash(nativeBytes));
 const receipts=[
  ['fixtures/renderers/miro/preview-receipt.json','db234c735ca203de0fb75a9f8e709a40050794a8f1a8065efdb79dce95b13109'],
  ['fixtures/renderers/google-slides/preview-receipt.json','d1ddaec6368f5f66ba86b8a2930e224fc6e096772853221b7b407cea48263fd2'],
  ['fixtures/renderers/powerpoint/preview-receipt.json','60da64410d8da8c55749b0324f2abd147808ad174911516cf380b72808809cf6'],
  ['fixtures/renderers/powerpoint/native-cycle-receipt.json','77675cb00a61a841734002964f8dcea732dc7a6f587d1b861c6625cbabff57bf'],
  ['fixtures/renderers/powerpoint/native-ui-attestations.json','06cec5f6099c17072049a64294db0367ae3819ff55f625f00f710c4928d654b7']
 ] as const;
 for(const[path,digest]of receipts){expect(hash(readFileSync(path)),path).toBe(digest);expect(sourceHashes.get(path),path).toBe(digest);}
 const assets=[
  ['fixtures/renderers/miro/assets/frames-headings-annotations-52e2d44612b4bc8b.jpg','52e2d44612b4bc8b4a0bd7ebe06f02adc7bcb067eea58785550f23a0985d47c4'],
  ['fixtures/renderers/google-slides/assets/frames-headings-annotations-f48012cecf4736cb.png','f48012cecf4736cb99b4127f3dda8fef2adec2fba7ed4be97bf0329db18ae51d'],
  ['fixtures/renderers/powerpoint/assets/frames-headings-annotations-afa872ecc6b83cff.pptx','afa872ecc6b83cff6bd2a161ff581affa0ba5766831de3d6b5a8f95464dbd913'],
  ['fixtures/renderers/powerpoint/assets/frames-headings-annotations-4aae2582e7a1b746.png','4aae2582e7a1b746da47600b7fcf52417bc08c031ce714e90eb6a6a4a2d4b8e6']
 ] as const;
 for(const[path,digest]of assets){expect(hash(readFileSync(path)),path).toBe(digest);expect(sourceHashes.get(path),path).toBe(digest);}
 expect(row.publishedAssets.map(asset=>[asset.path,asset.sha256])).toEqual(assets.filter(([,digest])=>digest!=='afa872ecc6b83cff6bd2a161ff581affa0ba5766831de3d6b5a8f95464dbd913').map(([path,digest])=>[path,digest]));
 expect(row.sources.find(source=>source.path===assets[1]![0])?.label).toBe('Google Slides API preview image');
 expect(row.sources.find(source=>source.path===assets[3]![0])?.label).toBe('LibreOffice PPTX conversion (not a PowerPoint screenshot)');
 expect(row.originalEvidence).toMatchObject({integrationCaseId:'frames-headings-annotations',classification:'synthetic-witness',modelVersion:'1.0.0',rendererId:'miro',stage:'restored-original',captureSha256:assets[0]![1]});
 const miro=read<any>('fixtures/renderers/miro/preview-receipt.json').cases.find((item:any)=>item.id==='frames-headings-annotations');
 const slides=read<any>('fixtures/renderers/google-slides/preview-receipt.json').cases.find((item:any)=>item.id==='frames-headings-annotations');
 const powerpoint=read<any>('fixtures/renderers/powerpoint/preview-receipt.json').cases.find((item:any)=>item.id==='frames-headings-annotations');
 for(const capture of [miro,slides,powerpoint])expect(capture.source.sha256).toBe(hash(commonBytes));
 expect(miro.rendererTargets[0].preview.modelVersion).toBe('1.0.0');
 expect(slides.rendererTargets[0].preview.asset.sha256).toBe(assets[1]![1]);
 expect(powerpoint.rendererTargets[0].preview.asset.sha256).toBe(assets[3]![1]);
 expect(powerpoint.rendererTargets[0].preview.engine).toBe('libreoffice');
 expect(read<any>('fixtures/renderers/powerpoint/preview-receipt.json').cases.find((item:any)=>item.id==='frames-headings-annotations').preview.engine).toContain('LibreOfficeDev');
 const powerPointUi=read<any>('fixtures/renderers/powerpoint/native-ui-attestations.json').cases.find((item:any)=>item.id==='frames-headings-annotations');
 const powerPointCycle=read<any>('fixtures/renderers/powerpoint/native-cycle-receipt.json').cases.find((item:any)=>item.id==='frames-headings-annotations');
 expect(powerPointCycle.source.sha256).toBe(hash(commonBytes));
 expect(powerPointUi).toMatchObject({source:{sha256:hash(commonBytes)},inputArtifactSha256:powerPointCycle.preservedArtifact.sha256,reopenObserved:true,noRepairPrompt:true});
 expect(powerPointUi.inputArtifactSha256).not.toBe(assets[2]![1]);
});

test('source-derived model edits and serializes without changing source witnesses',()=>{
 const commonBefore=readFileSync(commonPath),nativeBefore=readFileSync(nativePath),doc=read<Document>(definitionPath),visual=getVisual(doc) as Visual;
 for(const format of ['json','yaml'] as const)expect(readVisualDocument(writeVisualDocument(doc,format),format)).toEqual(doc);
 const changed=structuredClone(visual);changed.annotations![1]!.text='Edited annotation';
 const edited=readVisualDocument(writeVisualDocument({...doc,extensions:{...doc.extensions!,'umf.visual':changed}},'yaml'),'yaml');
 expect((getVisual(edited) as Visual).annotations?.[1]).toEqual({id:'syn-note',text:'Edited annotation'});
 expect(readFileSync(commonPath)).toEqual(commonBefore);expect(readFileSync(nativePath)).toEqual(nativeBefore);
 expect(hash(commonBefore)).toBe('55b08c69a87621081ae7bacfaac63c0dc0e9883d7a97ae280667cbdbda4ba1aa');
 expect(hash(nativeBefore)).toBe('d4d5b56c84d42a43c78c3b1652d28d93b2785786642018518b799e1c094c41d8');
});
