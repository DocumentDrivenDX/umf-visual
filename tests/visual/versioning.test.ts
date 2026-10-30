// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createVisualDocument,getVisual,inspectVisual,upgradeVisualDocument,VISUAL_VERSION,LATEST_VISUAL_VERSION,visualPackage,latestVisualPackage,exportVisual,importVisual,type Visual} from '../../src';
import {planMiroExport} from '../../src/adapters/miro';
import type {Document} from '@umf/core';
const hash=(text:string|Uint8Array)=>createHash('sha256').update(text).digest('hex');
const fixture=(name:string)=>JSON.parse(readFileSync('fixtures/visual/inventory/'+name+'.json','utf8')) as Document;
const flow=(count:number):Visual=>({id:'sized',kind:'flow',form:'network',question:'How many?',nodes:Array.from({length:count},(_,i)=>({id:'n'+i,label:'N'+i}))});

test('released schema, manifest, validator and imported fixture bytes remain frozen',()=>{
 expect(hash(readFileSync('spec/extensions/visual/1.0.0/schema.json'))).toBe('659ec61d834d4a410f06405fb4197e152f954d280b9265f71be32e992b038ec8');
 expect(hash(readFileSync('spec/extensions/visual/1.0.0/package.json'))).toBe('839e69d63dd784f23e655a8a4227602fe96abe3cdf8687231f3974f8de9f01b8');
 expect(hash(readFileSync('src/extensions/visual/legacy-1-0.ts','utf8').replace('../../../spec/extensions/visual/1.0.0/package.json','../../../spec/extensions/visual/package.json'))).toBe('fab32123da58330e7d4c290743b746363913b5fa23cbb7491e931343eda29cb1');
 const provenance=JSON.parse(readFileSync('UPSTREAM.json','utf8'));
 for(const [path,digest] of Object.entries(provenance.originalFileSha256))if(path.startsWith('fixtures/visual/'))expect(hash(readFileSync(path)),path).toBe(digest as string);
 expect(VISUAL_VERSION).toBe('1.0.0');expect(LATEST_VISUAL_VERSION).toBe('1.1.0');expect(visualPackage.version).toBe('1.0.0');expect(latestVisualPackage.version).toBe('1.1.0');
});

test('1.1 size admission is explicit and does not broaden native profiles',()=>{
 expect(()=>createVisualDocument(flow(16))).toThrow();
 expect(()=>createVisualDocument(flow(1),undefined,'2.0.0' as any)).toThrow();
 const document=createVisualDocument(flow(16),undefined,'1.1.0');
 expect(inspectVisual(document)).toMatchObject({valid:true,complete:true});expect(inspectVisual(document).advice.some(d=>d.code==='VISUAL_SPLIT')).toBe(true);
 expect(()=>createVisualDocument(flow(501),undefined,'1.1.0')).toThrow();
 expect(()=>planMiroExport(document)).toThrow();
 const native=exportVisual(document,{format:'dot',mode:'allow-reported-loss'});
 expect(native.ok).toBe(false);expect(native.diagnostics.some(d=>d.code==='DOT_SIZE'||d.code.includes('SUBSET')||d.code.includes('SIZE'))).toBe(true);
});

test('early-year correction requires a copied, validated upgrade; new fields stay unknown in 1.0',()=>{
 const early=createVisualDocument({id:'early',kind:'timeline',form:'roadmap',question:'When?',timeline:{scale:{kind:'date'},lanes:[{id:'lane',label:'Lane'}],spans:[{id:'span',label:'Span',lane:'lane',start:'0099-06',end:'0100-02'}]}},undefined,'1.1.0');
 early.vocabularies['umf.visual']!.version='1.0.0';const saved=JSON.stringify(early);
 expect(inspectVisual(early).valid).toBe(false);
 expect(inspectVisual(upgradeVisualDocument(early)).valid).toBe(true);expect(JSON.stringify(early)).toBe(saved);
 const entity=fixture('beacon-schema-tickets');const v=getVisual(entity);const reference=v.structure!.references![0]!;
 const node=v.structure!.entities!.find(e=>e.node===reference.to.node)!;const field=node.fields.find(f=>f.name===reference.to.field)!;field.id='stable';reference.to.fieldId='stable';delete reference.toCardinality;reference.toMultiplicity={min:2,max:5,text:'2..5'};
 entity.extensions!['umf.visual']=v as any;
 expect(inspectVisual(entity)).toMatchObject({valid:true,complete:false});
 const bad=structuredClone(entity);(bad.extensions!["umf.visual"] as any).structure.references[0].toMultiplicity={min:5,max:2};
 const before=JSON.stringify(bad);expect(()=>upgradeVisualDocument(bad)).toThrow();expect(JSON.stringify(bad)).toBe(before);
 const upgraded=upgradeVisualDocument(entity);expect(inspectVisual(upgraded)).toMatchObject({valid:true,complete:true});expect(getVisual(upgraded)).toEqual(v);
 const result=exportVisual(upgraded,{format:'mermaid',mode:'allow-reported-loss'});
 expect(result.ok).toBe(false);for(const suffix of ['/to/fieldId','/toMultiplicity','/id'])expect(result.diagnostics.some(d=>d.loss&&d.path.endsWith(suffix)),suffix).toBe(true);
});

test('serialized 1.0 retained source replays and version changes cannot forge exact recovery',()=>{
 const source='digraph G { a [label="A"]; b [label="B"]; a -> b; }';
 const imported=importVisual(source,{format:'dot',id:'legacy',question:'What connects?',mode:'allow-reported-loss'});
 expect(imported.ok).toBe(true);expect(imported.document!.vocabularies['umf.visual']!.version).toBe('1.0.0');
 const pair=JSON.parse(readFileSync("tests/visual/released-source-receipt.json","utf8"));
 expect(imported.source).toEqual(pair.source);expect(imported.document).toEqual(pair.document);
 expect(exportVisual(pair.document,{format:'dot',source:pair.source,original:true})).toMatchObject({ok:true,text:source});
 expect(exportVisual(upgradeVisualDocument(pair.document),{format:'dot',source:pair.source,original:true}).ok).toBe(false);
});
