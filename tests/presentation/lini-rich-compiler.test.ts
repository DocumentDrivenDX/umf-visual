// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,it} from 'bun:test';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {createVisualDocument,type Visual} from '../../src/extensions/visual';
import {compilePresentation} from '../../src/presentation';
import {compileLiniPresentation} from '../../src/presentation/lini';

const doc=(visual:Visual)=>createVisualDocument(visual,'gallery:'+visual.id,'1.3.0');

describe('rich Lini presentation compilation',()=>{
 it('compiles a typed mindmap tree with semantic node IDs, nested order, and native icons',()=>{
  const nodes:NonNullable<Visual['nodes']>=[
   {id:'vision',label:'Product Vision'},
   {id:'ship',label:'Shipping cadence',parent:'vision',icon:'rocket'},
   {id:'release',label:'Weekly release train',parent:'ship'},
   {id:'flags',label:'Feature flags gate risky work',parent:'ship'},
   {id:'quality',label:'Build quality',parent:'vision',icon:'seal'},
   {id:'snapshots',label:'Snapshot tests',parent:'quality'},
   {id:'learning',label:'Learning loop',parent:'vision',icon:'heart'},
  ];
  const visual:Visual={id:'gallery-tree',kind:'structure',form:'tree',title:'Product Vision',question:'What shapes our product?',nodes,layout:{kind:'tree',direction:'LR',order:['vision']}};
  const result=compilePresentation(doc(visual),{backend:'lini',theme:'presentation/1'});expect(result.ok).toBe(true);if(!result.ok)return;
  expect(result.source).toContain('layout: tree; direction: row;');expect(result.source).toContain('font-family: Arial; --lini-font-family: Arial;');expect(result.source).toContain('.lini-block { font-family: Arial; }');expect(result.source).toContain('|topic#n1| "Product Vision"');expect(result.source).toContain('|topic#n2| "Shipping cadence"');expect(result.source).toContain('symbol: rocket;');expect(result.source).toContain('symbol: seal;');
  expect(result.source.indexOf('|topic#n2|')).toBeLessThan(result.source.indexOf('|topic#n5|'));
  expect(result.elementMap).toContainEqual({logicalId:'ship',sourcePath:'/extensions/umf.visual/nodes/1/id',nativeId:'n2',kind:'node'});
  expect(result.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/nodes/1/icon'&&item.representation.includes('generic branch palette'))).toBe(true);
 });

 it('reports structured metadata that the tree layout leaves undrawn',()=>{
  const visual:Visual={id:'tree-with-metadata',kind:'structure',form:'tree',question:'What is modeled?',nodes:[{id:'root',label:'Root'}],layout:{kind:'tree'},structure:{entities:[{node:'root',fields:[]}]}};
  const result=compilePresentation(doc(visual),{backend:'lini'});expect(result.ok).toBe(true);if(!result.ok)return;
  expect(result.omissions).toContainEqual({sourcePath:'/extensions/umf.visual/structure/entities',reason:'Retained in UMF; Lini tree layout renders node hierarchy and does not render this structure metadata.'});
 });

 it('compiles ordered lifelines, real messages, loop membership, and anchored notes',()=>{
  const visual:Visual={id:'gallery-sequence',kind:'sequence',form:'lifelines',question:'How does checkout finish?',title:'Checkout',sequence:{participants:[{id:'user',label:'user',role:'actor',icon:'user'},{id:'shop',label:'Storefront',role:'own'},{id:'pay',label:'Payments',role:'platform'},{id:'db',label:'Orders',role:'store',shape:'parallelogram'}],messages:[
   {id:'place',from:'user',to:'shop',label:'place order',kind:'call'},
   {id:'charge',from:'shop',to:'pay',label:'charge $42',kind:'call'},
   {id:'verify',from:'pay',to:'pay',label:'verify card',kind:'call'},
   {id:'receipt',from:'pay',to:'shop',label:'receipt',kind:'return'},
   {id:'reserve',from:'shop',to:'db',label:'reserve stock',kind:'call',group:'each-item'},
   {id:'stock',from:'db',to:'shop',label:'in stock',kind:'return',group:'each-item'},
   {id:'finish',from:'shop',to:'user',label:'order #1024',kind:'return'},
   {id:'track',from:'user',to:'shop',label:'track parcel',kind:'async'},
  ],notes:[{id:'note-start',text:'starts checkout',participants:['user'],before:'place'}]},groups:[{id:'each-item',label:'each item',role:'loop'}]};
  const result=compilePresentation(doc(visual),{backend:'lini'});expect(result.ok).toBe(true);if(!result.ok)return;
  expect(result.source).toContain('|slant#p4| "Orders" { pin: center; translate: 0 -19; width: 186;');expect(result.source).toContain('|note#n1| "starts checkout"');expect(result.source).toContain('|line#message3| "" { pin: none; translate: 110 -58; points: 0 0, 80 0, 80 36, 0 36; marker-end: arrow;');expect(result.source).toContain('|rect#f1-header| "loop [each item]"');expect(result.source).toContain('|line#message6| "" { pin: none; translate: 330 162; points: 0 0, -440 0; marker-end: arrow;');expect(result.source).toContain('|line#message8| "" { pin: none; translate: -330 296; points:');
  expect(result.elementMap).toContainEqual({logicalId:'user',sourcePath:'/extensions/umf.visual/sequence/participants/0/id',nativeId:'p1',kind:'participant'});
  expect(result.elementMap).toContainEqual({logicalId:'reserve',sourcePath:'/extensions/umf.visual/sequence/messages/4/id',nativeId:'message5',kind:'message'});
  expect(result.elementMap).toContainEqual({logicalId:'note-start',sourcePath:'/extensions/umf.visual/sequence/notes/0/id',nativeId:'n1',kind:'note'});expect(result.elementMap).toContainEqual({logicalId:'user',sourcePath:'/extensions/umf.visual/sequence/participants/0/icon',nativeId:'p1-icon',kind:'participant-field'});
 });

 it('refuses the unqualified sequence form on Graphviz and Mermaid',()=>{
  const visual:Visual={id:'sequence-scope',kind:'sequence',form:'lifelines',question:'What runs?',sequence:{participants:[{id:'a',label:'A'},{id:'b',label:'B'}],messages:[{id:'m',from:'a',to:'b',label:'calls'}]}};
  expect(compilePresentation(doc(visual),{backend:'graphviz'})).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_BACKEND_SUBSET'}]});
  expect(compilePresentation(doc(visual),{backend:'mermaid'})).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_BACKEND_SUBSET'}]});
 });

 it('reports authored Lini sequence layouts instead of silently overriding them',()=>{
  const base:Visual={id:'layout-sequence-control',kind:'sequence',form:'lifelines',question:'Where does a layout apply?',sequence:{participants:[{id:'a',label:'A'},{id:'b',label:'B'}],messages:[{id:'first',from:'a',to:'b',label:'First',group:'loop'},{id:'second',from:'b',to:'a',label:'Second',group:'loop'}]},groups:[{id:'loop',label:'Repeated work',role:'loop'}]};
  const root=compileLiniPresentation({...base,layout:{kind:'flow',direction:'LR'}});
  expect(root).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_LINI_SEQUENCE_LAYOUT',path:'/extensions/umf.visual/layout'}]});
  const group=compileLiniPresentation({...base,groups:[{...base.groups![0]!,layout:{kind:'flow',direction:'TB'}}]});
  expect(group).toMatchObject({ok:false,diagnostics:[{code:'PRESENTATION_LINI_SEQUENCE_LAYOUT',path:'/extensions/umf.visual/groups/0/layout'}]});
  // The public schema rejects these sequence layouts before renderer dispatch;
  // verify that boundary independently rather than constructing invalid data.
  const publicRoot=structuredClone(doc(base));(publicRoot.extensions!['umf.visual'] as Record<string,unknown>).layout={kind:'flow',direction:'LR'};
  expect(compilePresentation(publicRoot,{backend:'lini'})).toMatchObject({ok:false,diagnostics:[{code:'VISUAL_LAYOUT',path:'/extensions/umf.visual/layout'}]});
  const publicGroup=structuredClone(doc(base));((publicGroup.extensions!['umf.visual'] as {groups:Record<string,unknown>[]}).groups[0]!).layout={kind:'flow',direction:'TB'};
  expect(compilePresentation(publicGroup,{backend:'lini'})).toMatchObject({ok:false,diagnostics:[{code:'VISUAL_LAYOUT',path:'/extensions/umf.visual/groups/0/layout'}]});
 });

 it('keeps multiple notes at one anchor in source order through the legacy native sequence profile',()=>{
  const visual:Visual={id:'multiple-anchored-notes',kind:'sequence',form:'lifelines',question:'What context appears?',sequence:{participants:[{id:'client',label:'Client'},{id:'service',label:'Service'}],messages:[{id:'request',from:'client',to:'service',label:'Request',kind:'call'},{id:'reply',from:'service',to:'client',label:'Reply',kind:'return'}],notes:[{id:'first-note',text:'First note',participants:['client'],before:'request'},{id:'second-note',text:'Second note',participants:['service'],before:'request'}]}};
  const result=compilePresentation(doc(visual),{backend:'lini'});expect(result.ok).toBe(true);if(!result.ok)return;
  expect(result.source.indexOf('|note#n1|')).toBeLessThan(result.source.indexOf('|note#n2|'));
  expect(result.elementMap.filter(item=>item.kind==='note').map(item=>item.logicalId)).toEqual(['first-note','second-note']);
 });

 it('budgets wrapped native shape captions inside participant owners',()=>{
  const visual:Visual={id:'captioned-shape-sequence',kind:'sequence',form:'lifelines',question:'Which items are documents?',sequence:{participants:[{id:'client',label:'Client'},{id:'record',label:'Record',shape:'document',role:'store'},{id:'service',label:'Service'}],messages:[{id:'write',from:'client',to:'record',label:'Write',kind:'call'},{id:'read',from:'record',to:'service',label:'Read',kind:'call'}]}};
  const result=compilePresentation(createVisualDocument(visual,'gallery:'+visual.id,'1.4.0'),{backend:'lini'});expect(result.ok).toBe(true);if(!result.ok)return;
  expect(result.source).toContain('|box#p2| "Record\\n(requested shape:\\ndocument)"');
  expect(result.source).toContain('group#p2-owner| "" { pin: center; translate: 0 ');expect(result.source).toContain('width: 200; height: 146; fill: none; stroke: none; stroke-width: 0;');
 });

 it('keeps icon names visible on existing flow forms and maps parallelograms natively',()=>{
  const visual:Visual={id:'icon-shape',kind:'flow',form:'network',question:'What is processed?',nodes:[{id:'input',label:'Input',shape:'parallelogram',icon:'rocket'},{id:'output',label:'Output'}],edges:[{id:'convert',from:'input',to:'output',label:'convert'}]};
  const graphviz=compilePresentation(doc(visual),{backend:'graphviz'}),mermaid=compilePresentation(doc(visual),{backend:'mermaid'}),lini=compilePresentation(doc(visual),{backend:'lini'});
  expect(graphviz.ok&&graphviz.source).toContain('shape=parallelogram');expect(graphviz.ok&&graphviz.source).toContain('Icon: rocket');
  expect(mermaid.ok&&mermaid.source).toContain('lean_right');expect(mermaid.ok&&mermaid.source).toContain('Icon:#32;rocket');
  expect(lini.ok&&lini.source).toContain('|slant#n1| "Input"');expect(lini.ok&&lini.source).toContain('symbol: rocket;');
 });

 it('compiles the complete pinned mindmap and checkout gallery definitions',()=>{
  const fixture=(name:string)=>JSON.parse(readFileSync(new URL('../../fixtures/showcase/definitions/'+name,import.meta.url),'utf8')) as Document;
  const mindmap=compilePresentation(fixture('lini-gallery-product-mindmap.json'),{backend:'lini'}),sequence=compilePresentation(fixture('lini-gallery-checkout-sequence.json'),{backend:'lini'});
  expect(mindmap.ok).toBe(true);expect(sequence.ok).toBe(true);if(!mindmap.ok||!sequence.ok)return;
  expect(mindmap.source).toContain('layout: tree; direction: bilateral;');expect(mindmap.source).toContain('font-family: Arial; --lini-font-family: Arial;');expect(mindmap.source).toContain('.lini-block { font-family: Arial; }');expect(mindmap.elementMap.filter(item=>item.kind==='node')).toHaveLength(19);expect(mindmap.source.match(/symbol: (rocket|seal|presentation|heart);/gu)).toHaveLength(4);
  expect(sequence.source).toContain('|drawing#sequence-drawing|');expect(sequence.source).toContain('|rect#visual-title| "A checkout, from order to tracking"');expect(sequence.source).toContain('|rect#f1|');expect(sequence.source).toContain('|line#message3|');expect(sequence.source).toContain('|line#message8|');expect(sequence.elementMap.filter(item=>item.kind==='participant')).toHaveLength(4);expect(sequence.elementMap.filter(item=>item.kind==='message')).toHaveLength(8);expect(sequence.elementMap.filter(item=>item.kind==='message-caption')).toHaveLength(8);expect(sequence.elementMap.filter(item=>item.kind==='note')).toHaveLength(1);expect(sequence.elementMap.filter(item=>item.kind==='participant-field'&&item.sourcePath.endsWith('/icon'))).toHaveLength(1);
 });

 it('compiles a ladder without dropping participant metadata, message order, or authored step disclosure',()=>{
  const fixture=JSON.parse(readFileSync(new URL('../../fixtures/visual/forms/helix-request-ladder.json',import.meta.url),'utf8')) as Document;
  const result=compilePresentation(fixture,{backend:'lini',theme:'presentation/1'});expect(result.ok).toBe(true);if(!result.ok)return;
  expect(result.source).toContain('|drawing#sequence-drawing|');expect(result.source).toContain('|rect#visual-title| "A request becomes a governing document"');expect(result.source).toContain('|rect#p1-detail| "sets intent"');expect(result.source).toContain('|rect#p1-role| "Role: actor"');expect(result.source).toContain('|rect#p1-status| "Status: built"');expect(result.elementMap.filter(item=>item.kind==='participant')).toHaveLength(6);expect(result.elementMap.filter(item=>item.kind==='participant-field')).toHaveLength(18);expect(result.elementMap.filter(item=>item.kind==='message')).toHaveLength(6);expect(result.elementMap.filter(item=>item.kind==='message-caption')).toHaveLength(6);
  expect(result.elementMap.find(item=>item.kind==='participant-field'&&item.nativeId==='p1-status')).toMatchObject({logicalId:'team',sourcePath:'/extensions/umf.visual/sequence/participants/0/status'});
  expect(result.omissions).toContainEqual(expect.objectContaining({sourcePath:'/extensions/umf.visual/steps'}));expect(result.approximations.some(item=>item.sourcePath==='/extensions/umf.visual/form'&&item.representation.includes('lifelines adaptation'))).toBe(true);
 });

 it('budgets native multiple-sheet paint inside its participant owner',()=>{
  const visual:Visual={id:'sequence-multiple-sheet-owner',kind:'sequence',form:'lifelines',question:'Which carrier owns the stencil?',sequence:{participants:[{id:'source',label:'Source'},{id:'sheet',label:'Sheets',shape:'multiple-documents'}],messages:[{id:'send',from:'source',to:'sheet',label:'send',kind:'call'}]}};
  const result=compilePresentation(createVisualDocument(visual,'gallery:'+visual.id,'1.4.0'),{backend:'lini',theme:'presentation/1'});expect(result.ok).toBe(true);if(!result.ok)return;
  expect(result.source).toContain('|group#p2-owner| "" { pin: center; translate: 110 ');
  expect(result.source).toContain('width: 208; height:');
  expect(result.source).toContain('|box#p2| "Sheets\\n(requested shape:\\nmultiple-documents)" { pin: center; translate: 0 ');
  expect(result.source).toContain('width: 200; height:');
 });

 it('preserves directed defaults and explicitly headless parallel and self associations',()=>{
  const visual:Visual={id:'association-topology',kind:'flow',form:'network',question:'Which links carry direction?',nodes:[{id:'left',label:'Left',ports:[{id:'east',label:'east',side:'east'}]},{id:'right',label:'Right',ports:[{id:'west',label:'west',side:'west'}]}],edges:[{id:'default-arrow',from:'left',to:'right',label:'directed default'},{id:'headless-parallel',from:'left',to:'right',fromPort:'east',toPort:'west',label:'undirected parallel',directed:false},{id:'headless-self',from:'left',to:'left',label:'self association',directed:false}]};
  const dot=compilePresentation(doc(visual),{backend:'graphviz'}),mermaid=compilePresentation(doc(visual),{backend:'mermaid'}),lini=compilePresentation(doc(visual),{backend:'lini'});
  expect(dot.ok&&dot.source).toContain('-> n2 [id="e1"');expect(dot.ok&&dot.source).toContain('-> n2:p1:w [id="e2"');expect(dot.ok&&dot.source).toContain('dir=none');expect(dot.ok&&dot.source).toContain('n1 -> n1 [id="e3"');
  expect(mermaid.ok&&mermaid.source).toContain('n1 -->|"directed#32;default"| n2');expect(mermaid.ok&&mermaid.source).toContain('n1 ---|"undirected#32;parallel"| n2');expect(mermaid.ok&&mermaid.source).toContain('n1 ---|"self#32;association"| n1');
  expect(lini.ok&&lini.source).toContain('n1 -> n2 .e1 { along: 0.25; } [ "directed default" { translate: 0 -48; } ]');expect(lini.ok&&lini.source).toContain('n1.p1:right --- n2.p1:left .e2 { along: 0.75; } [ "undirected parallel" { translate: 0 -66; } ]');expect(lini.ok&&lini.source).toContain('n1 --- n1 .e3 { along: 0.5; } [ "self association" { translate: 0 -48; } ]');
  for(const result of [dot,mermaid,lini]){expect(result.ok).toBe(true);if(result.ok)for(const id of ['default-arrow','headless-parallel','headless-self'])expect(result.elementMap.some(item=>item.logicalId===id&&item.kind==='edge')).toBe(true);}
 });
});
