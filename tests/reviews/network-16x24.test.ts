// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {editVisual,getVisual,inspectVisual,readVisualDocument,writeVisualDocument,type Visual} from '../../src/extensions/visual';
import type {Document} from '@umf/core';

const definitionPath='fixtures/reviews/definitions/miro-network-16x24.json';
const commonPath='fixtures/integrations/complex-miro/common/network-16x24.json';
const nativePath='fixtures/integrations/complex-miro/native/network-16x24.json';
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
type Source={path:string;sha256:string;label?:string};
type Review={id:string;sources:Source[];publishedAssets:Array<{path:string;sha256:string}>;originalEvidence:Record<string,unknown>};

test('source-derived circular review preserves all common IDs, 24 directed data links, and authored ring order',()=>{
 const doc=read<Document>(definitionPath),visual=getVisual(doc) as Visual;
 expect(inspectVisual(doc)).toMatchObject({valid:true,complete:true});
 expect(doc.vocabularies?.['umf.visual']?.version).toBe('1.4.0');
 expect(visual.nodes?.map(node=>[node.id,node.label,node.shape])).toEqual(Array.from({length:16},(_,index)=>{const id=`n${String(index+1).padStart(2,'0')}`;return[id,`Node ${String(index+1).padStart(2,'0')}`,'rectangle'];}));
 expect(visual.nodes?.some(node=>node.role!==undefined)).toBe(false);
 expect(visual.nodes?.every(node=>!('geometry' in node)&&!('x' in node)&&!('y' in node))).toBe(true);
 expect(visual.edges).toHaveLength(24);
 expect(visual.edges?.every(edge=>edge.kind==='data'&&edge.directed===true&&edge.routing?.kind==='straight')).toBe(true);
 expect(visual.layout).toEqual({kind:'circular',order:Array.from({length:16},(_,index)=>`n${String(index+1).padStart(2,'0')}`)});
 expect(visual.takeaway).toContain('clockwise circular arrangement');
 expect(visual.omissions?.join(' ')).toContain('not a fact extracted from the common source or synthetic grid');
 expect(visual.omissions?.join(' ')).toContain('It does not add temporal or business order or causal meaning to the 24 directed data edges');
 expect(visual.omissions?.join(' ')).toContain('not qualification evidence for Visual 1.4 renderers');
});

test('common topology and synthetic native grid remain distinct and every host output is byte-bound',()=>{
 const commonBytes=readFileSync(commonPath),nativeBytes=readFileSync(nativePath);
 expect(hash(commonBytes)).toBe('dc6d021a3a59b30bf45475e36b6bdfa86000e3e6d1b9291ed203bc6b604417d4');
 expect(hash(nativeBytes)).toBe('95b1bb93b735eec01191f729df5319ea3563c67be76be75cac190daf2de736d8');
 const common=getVisual(read<Document>(commonPath)) as Visual,derived=getVisual(read<Document>(definitionPath)) as Visual;
 expect(derived.nodes?.map(({id,label})=>[id,label])).toEqual(common.nodes?.map(({id,label})=>[id,label]));
 expect(derived.edges?.map(({id,from,to,kind})=>[id,from,to,kind])).toEqual(common.edges?.map(({id,from,to,kind})=>[id,from,to,kind]));
 const native=read<{authorship:string;items:Array<Record<string,any>>;notes:string[]}>(nativePath);
 expect(native.authorship).toBe('synthetic-fixture');
 const nativeNodes=native.items.filter(item=>item.kind==='node');
 expect(nativeNodes).toHaveLength(16);
 expect(nativeNodes.every(item=>item.symbol==='synthetic.symbol.rectangle'&&item.geometry!==undefined)).toBe(true);
 expect(derived.nodes?.map((node,index)=>[node.id,node.label,node.shape,nativeNodes[index]!.label,nativeNodes[index]!.symbol])).toEqual(Array.from({length:16},(_,index)=>{const id=`n${String(index+1).padStart(2,'0')}`,label=`Node ${String(index+1).padStart(2,'0')}`;return[id,label,'rectangle',label,'synthetic.symbol.rectangle'];}));
 expect(native.items.filter(item=>item.kind==='connector')).toHaveLength(24);
 expect(native.items.filter(item=>item.kind==='connector').every(item=>item.route==='straight')).toBe(true);
 expect(derived.layout).toMatchObject({kind:'circular'});

 const row=read<{examples:Review[]}>('fixtures/reviews/review-sources.json').examples.find(example=>example.id==='miro-network-16x24')!;
 const sourceHashes=new Map(row.sources.map(source=>[source.path,source.sha256]));
 const assetHashes=new Map(row.publishedAssets.map(asset=>[asset.path,asset.sha256]));
 const receipts=[
  ['fixtures/renderers/miro/preview-receipt.json','db234c735ca203de0fb75a9f8e709a40050794a8f1a8065efdb79dce95b13109'],
  ['fixtures/renderers/google-slides/preview-receipt.json','d1ddaec6368f5f66ba86b8a2930e224fc6e096772853221b7b407cea48263fd2'],
  ['fixtures/renderers/powerpoint/preview-receipt.json','60da64410d8da8c55749b0324f2abd147808ad174911516cf380b72808809cf6']
 ] as const;
 for(const[path,digest]of receipts){expect(hash(readFileSync(path))).toBe(digest);expect(sourceHashes.get(path)).toBe(digest);}
 const captures=[
  ['fixtures/renderers/miro/assets/network-16x24-f2897feefe52c00e.jpg','f2897feefe52c00ef869a6cd3d99bf36c9e2eb2353f208714214c7162811b06d'],
  ['fixtures/renderers/google-slides/assets/network-16x24-044f3cf080639540.png','044f3cf0806395407aa808d4763fac64edf5bbea1ae2be5de778057b149b3820'],
  ['fixtures/renderers/powerpoint/assets/network-16x24-layoutv3-531cf07d9bbc84db.png','531cf07d9bbc84db473ad696c4744cc368bd5100e4890f78b7c70a6269240bc9']
 ] as const;
 for(const[path,digest]of captures){expect(hash(readFileSync(path))).toBe(digest);expect(sourceHashes.get(path)).toBe(digest);expect(assetHashes.get(path)).toBe(digest);}
 expect(row.sources.find(source=>source.path===captures[1]![0])?.label).toBe('Google Slides API capture image');
 expect(row.sources.find(source=>source.path===captures[2]![0])?.label).toBe('LibreOffice PPTX conversion (not a PowerPoint screenshot)');
 expect(row.originalEvidence).toMatchObject({integrationCaseId:'network-16x24',classification:'synthetic-witness',modelVersion:'1.1.0',rendererId:'miro',stage:'restored-original',captureSha256:captures[0]![1]});
 expect(row.originalEvidence).not.toMatchObject({modelVersion:'1.4.0'});
});

test('authored circular review round-trips through JSON and YAML, permits safe edits, and preserves witness bytes',()=>{
 const commonBefore=readFileSync(commonPath),nativeBefore=readFileSync(nativePath),doc=read<Document>(definitionPath);
 for(const format of ['json','yaml'] as const)expect(readVisualDocument(writeVisualDocument(doc,format),format)).toEqual(doc);
 const edited=editVisual(doc,current=>({...current,layout:{kind:'circular',order:[...current.layout!.order!].reverse()}}));
 expect((getVisual(edited) as Visual).layout?.order?.[0]).toBe('n16');
 for(const format of ['json','yaml'] as const)expect((getVisual(readVisualDocument(writeVisualDocument(edited,format),format)) as Visual).layout?.order?.[0]).toBe('n16');
 expect(readFileSync(commonPath)).toEqual(commonBefore);expect(readFileSync(nativePath)).toEqual(nativeBefore);
 expect(hash(commonBefore)).toBe('dc6d021a3a59b30bf45475e36b6bdfa86000e3e6d1b9291ed203bc6b604417d4');
 expect(hash(nativeBefore)).toBe('95b1bb93b735eec01191f729df5319ea3563c67be76be75cac190daf2de736d8');
});
