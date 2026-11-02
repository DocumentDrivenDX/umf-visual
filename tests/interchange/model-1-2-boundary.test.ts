import {expect,test} from 'bun:test';
import {createVisualDocument,exportVisual,importVisual} from '../../src';
import {compileFullScene} from '../../src/interchange/full/scene';
import {dotFullAdapter} from '../../src/interchange/dot/full';
import {mermaidFullAdapter} from '../../src/interchange/mermaid/full';
import {liniFullAdapter} from '../../src/interchange/lini/full';
import {exportPowerPoint} from '../../src/adapters/powerpoint';

const document=()=>createVisualDocument({id:'new-concepts',kind:'flow',form:'network',question:'Which anchors connect?',layout:{kind:'grid',columns:2,order:['a','b']},nodes:[{id:'a',label:'Client',shape:'ellipse',ports:[{id:'request',label:'Request',side:'east'}]},{id:'b',label:'API',shape:'hexagon',ports:[{id:'request',side:'west'}]}],edges:[{id:'call',from:'a',to:'b',fromPort:'request',toPort:'request',label:'call'}]},'visual:new-concepts','1.2.0');
test('released ordinary, annotated and full interpreters never silently certify new model concepts',()=>{
 for(const format of ['dot','mermaid','lini'] as const)for(const mode of ['strict','allow-reported-loss'] as const){
  for(const profile of [undefined,`umf.visual.${format}.annotated/1`,`umf.visual.${format}.full/1`]){
   const result=exportVisual(document(),{format,mode,...(profile?{profile}:{})});
   expect(result.ok).toBe(false);expect(result.text).toBeUndefined();
   expect(result.diagnostics.some(item=>item.severity==='error'&&item.message.includes('1.2.0'))).toBe(true);
  }
 }
});
test('forged full record sources cannot promote 1.2 metadata retention to interpreted meaning',()=>{
 for(const [format,adapter] of [['dot',dotFullAdapter],['mermaid',mermaidFullAdapter],['lini',liniFullAdapter]] as const){
  const source=adapter.emit(compileFullScene(document(),format));
  const result=importVisual(source,{format,profile:`umf.visual.${format}.full/1`,id:'readback',question:'Which anchors connect?'});
  expect(result.ok).toBe(false);expect(result.document).toBeUndefined();
  expect(result.source?.text).toBe(source);
  expect(result.diagnostics.some(item=>item.message.includes('1.2.0'))).toBe(true);
 }
});
test('PowerPoint profile qualification is independent of the latest visual model constant',async()=>{
 await expect(exportPowerPoint(document(),{mode:'report'})).rejects.toThrow('Expected umf.visual model version 1.0.0 or 1.1.0');
});
