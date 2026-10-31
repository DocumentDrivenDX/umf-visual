// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {Document} from '@umf/core';
import {LATEST_VISUAL_VERSION,VISUAL_VERSION,inspectVisual} from '../../src/extensions/visual';
import {exportVisual} from '../../src/interchange';
import {liniAdapter} from '../../src/interchange/lini';
import {serializeAnnotatedLini} from '../../src/interchange/lini/annotated';

const path='fixtures/integrations/complex-miro/common/network-16x24.json';
const expectedHash='dc6d021a3a59b30bf45475e36b6bdfa86000e3e6d1b9291ed203bc6b604417d4';
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');

test('UMF visual 1.1 network 16x24 is valid but both frozen Lini profiles refuse it explicitly',async()=>{
 const bytes=await readFile(path);expect(hash(bytes)).toBe(expectedHash);
 const document=JSON.parse(bytes.toString()) as Document,visual=document.extensions!['umf.visual'] as any;
 expect(VISUAL_VERSION).toBe('1.0.0');expect(LATEST_VISUAL_VERSION).toBe('1.1.0');
 expect(document.vocabularies['umf.visual']?.version).toBe('1.1.0');expect(visual.nodes).toHaveLength(16);expect(visual.edges).toHaveLength(24);
 const inspected=inspectVisual(document);expect(inspected.valid).toBe(true);expect(inspected.complete).toBe(true);
 expect(liniAdapter.version).toBe('0.3.0');
 const ordinaryDirect=liniAdapter.serialize(visual,{id:visual.id,question:visual.question});expect(ordinaryDirect.text).toBeUndefined();
 expect(ordinaryDirect.diagnostics.some(item=>item.code==='LINI_VISUAL_SIZE'&&item.severity==='error')).toBe(true);
 const ordinary=exportVisual(document,{format:'lini',mode:'allow-reported-loss'});expect(ordinary.ok).toBe(false);
 expect(ordinary.diagnostics.some(item=>item.code==='LINI_VISUAL_SIZE'&&item.severity==='error')).toBe(true);
 const annotatedDirect=serializeAnnotatedLini(document);expect(annotatedDirect.text).toBeUndefined();
 expect(annotatedDirect.diagnostics.some(item=>item.code==='LINI_ANNOTATED_PROFILE'&&item.message.includes('frozen visual 1.0.0'))).toBe(true);
 const annotated=exportVisual(document,{format:'lini',profile:'umf.visual.lini.annotated/1',mode:'allow-reported-loss'});expect(annotated.ok).toBe(false);
 expect(annotated.diagnostics.some(item=>item.code==='LINI_ANNOTATED_PROFILE'&&item.message.includes('frozen visual 1.0.0'))).toBe(true);
});
