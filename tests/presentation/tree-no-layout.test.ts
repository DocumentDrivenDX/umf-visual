// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {createVisualDocument,getVisual,inspectVisual,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';

const fixture='fixtures/visual/forms/umf-extensions.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const readFixture=()=>{
 const bytes=readFileSync(fixture),document=JSON.parse(bytes.toString('utf8')) as Document;
 return {bytes,document,visual:getVisual(document) as Visual};
};

test('public presentation compiles the exact legacy tree with no authored layout',()=>{
 const {bytes,document,visual}=readFixture(),snapshot=Buffer.from(bytes);
 expect(hash(bytes)).toBe('a11c45838a97eddb397cc1a7d8a6e4f0ed8fb7e1ce998d2855b78d038a38e062');
 expect(document.umf).toBe('0.10.0');expect(document.vocabularies?.['umf.visual']?.version).toBe('1.0.0');
 expect(visual.layout).toBeUndefined();
 const result=compilePresentation(document,{backend:'lini'});
 expect(result.ok).toBe(true);if(!result.ok)return;
 expect(readFileSync(fixture)).toEqual(snapshot);
 expect(result.nativeFormat).toBe('lini');expect(result.source).toContain('layout: tree; direction: row;');
 expect(result.elementMap.filter(element=>element.kind==='node').map(element=>[element.logicalId,element.sourcePath])).toEqual(
  visual.nodes!.map((node,index)=>[node.id,`/extensions/umf.visual/nodes/${index}/id`])
 );
 expect(result.elementMap.filter(element=>element.kind==='edge')).toEqual([]);
 expect(result.elementMap.filter(element=>element.kind==='group')).toEqual([]);
 expect(result.approximations).toEqual([]);
 expect(result.source).toContain('"src/extensions"');
 for(const node of visual.nodes??[])expect(result.source).toContain(JSON.stringify(node.label));
 expect(visual).not.toHaveProperty('edges');expect(visual).not.toHaveProperty('layout');
 expect(visual.nodes?.every(node=>node.role===undefined&&node.status===undefined)).toBe(true);
});

test('caller direction controls absent tree layout and authored tree direction takes precedence',()=>{
 const {document}=readFixture();
 const lr=compilePresentation(document,{backend:'lini',direction:'LR'}),tb=compilePresentation(document,{backend:'lini',direction:'TB'});
 expect(lr.ok).toBe(true);expect(tb.ok).toBe(true);
 if(lr.ok)expect(lr.source).toContain('layout: tree; direction: row;');
 if(tb.ok)expect(tb.source).toContain('layout: tree; direction: column;');

 const authored=createVisualDocument({id:'tree-direction',kind:'structure',form:'tree',question:'How is this arranged?',layout:{kind:'tree',direction:'TB'},nodes:[{id:'root',label:'Root'},{id:'first',label:'First',parent:'root'},{id:'second',label:'Second',parent:'root'}]},'test:tree-direction','1.4.0');
 expect(inspectVisual(authored)).toMatchObject({valid:true,complete:true});
 const authoredTb=compilePresentation(authored,{backend:'lini',direction:'LR'});
 expect(authoredTb.ok).toBe(true);if(authoredTb.ok)expect(authoredTb.source).toContain('layout: tree; direction: column;');
});

test('incompatible tree layout hints fail at the authored layout pointer',()=>{
 const incompatible=createVisualDocument({id:'tree-incompatible-layout',kind:'structure',form:'tree',question:'Question?',layout:{kind:'flow',direction:'TB'},nodes:[{id:'root',label:'Root'}]},'test:tree-incompatible-layout','1.4.0');
 expect(compilePresentation(incompatible,{backend:'lini'})).toMatchObject({ok:false,diagnostics:[{code:'VISUAL_LAYOUT',path:'/extensions/umf.visual/layout'}]});
 const invalidOrder=createVisualDocument({id:'tree-invalid-order',kind:'structure',form:'tree',question:'Question?',layout:{kind:'tree'},nodes:[{id:'root',label:'Root'},{id:'child',label:'Child',parent:'root'}]},'test:tree-invalid-order','1.4.0');
 ((invalidOrder.extensions?.['umf.visual']) as Visual).layout!.order=['child'];
 expect(compilePresentation(invalidOrder,{backend:'lini'})).toMatchObject({ok:false,diagnostics:[{code:'VISUAL_LAYOUT',path:'/extensions/umf.visual/layout/order'}]});
});
