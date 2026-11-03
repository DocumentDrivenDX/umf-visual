// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,expect,test} from 'bun:test';
import {chromium,type Browser} from 'playwright';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import type {Document} from '@umf/core';
import {readVisualDocument} from '../../src/extensions/visual';
import {compilePresentation,type PresentationPlan} from '../../src/presentation';
import {verifyPresentationQuality} from '../../scripts/presentation/quality';
import {renderPresentationLini} from '../../scripts/presentation/lini-runtime';

const definition=readVisualDocument(readFileSync('fixtures/reviews/definitions/beacon-ci-nightly.json','utf8'),'json') as Document;
const runDot=async(plan:PresentationPlan,format:'svg'|'json')=>{
 const child=Bun.spawn(['dot',`-T${format}`],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});child.stdin.write(plan.source);child.stdin.end();
 const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);expect(exit).toBe(0);expect(stderr).toBe('');return stdout;
};
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});},{timeout:30_000});
afterAll(async()=>await browser?.close());

test('native graph renderers preserve nightly source-owned details, exact dependency and trigger text',async()=>{
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 try{
  for(const backend of ['graphviz','mermaid','lini'] as const){
   const plan=compilePresentation(definition,{backend,theme:'presentation/1'});expect(plan.ok,backend).toBe(true);if(!plan.ok)continue;
   expect(plan.elementMap.filter(item=>item.kind==='node')).toHaveLength(2);
   expect(plan.elementMap.filter(item=>item.kind==='edge')).toHaveLength(1);
   expect(plan.elementMap).toContainEqual({logicalId:'eval--report',sourcePath:'/extensions/umf.visual/edges/0',nativeId:'e1',kind:'edge'});
   let svg:string,nativeAst:unknown;
   if(backend==='graphviz'){
    const [rendered,ast]=await Promise.all([runDot(plan,'svg'),runDot(plan,'json')]);svg=rendered;nativeAst=JSON.parse(ast);
   }else if(backend==='mermaid'){
    await page.setContent('<!doctype html><meta charset="utf-8"><div id="out"></div>');
    await page.addScriptTag({path:resolve(import.meta.dir,'../../node_modules/mermaid/dist/mermaid.min.js')});
    svg=await page.evaluate(async source=>{const mermaid=(window as any).mermaid;mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',deterministicIds:true,deterministicIDSeed:'nightly-pipeline-quality'});return(await mermaid.render('nightly-pipeline-quality',source)).svg;},plan.source);
   }else{
    const rendered=await renderPresentationLini(plan.source);svg=rendered.svg;nativeAst=rendered.nativeAst;
   }
   const checks=await verifyPresentationQuality(page,{svg,document:definition,plan,nativeAst});
   const failures=checks.filter(item=>item.result==='fail');expect(failures,`${backend} native checks`).toEqual([]);
   const required=backend==='graphviz'?['graphviz-native-ast','graphviz-native-carriers','graphviz-edge-endpoints-and-paths']:
    backend==='mermaid'?['mermaid-native-node-carriers','mermaid-flow-paths']:
    ['lini-native-ast','lini-native-carriers','lini-connection-endpoints'];
   for(const check of required)expect(checks.find(item=>item.check===check)?.result,`${backend}/${check}`).toBe('pass');
   const visibleText=await page.locator('#frame svg').evaluate(root=>{
    const normalize=(value:string)=>value.replace(/\s+/gu,' ').trim();
    return [...root.querySelectorAll('text,foreignObject')].map(element=>{
     const html=element.matches('foreignObject')?element.querySelector('div,p,span') as HTMLElement|null:null;
     return normalize(html?.innerText??element.textContent??'');
    }).filter(Boolean).join(' ');
   });
   expect(visibleText).toContain('ubuntu-latest');expect(visibleText).toContain('make eval');expect(visibleText).toContain('./.github/workflows/report.yml');
   if(backend==='lini'){expect(visibleText).toContain('0 3 * * *');expect(visibleText).toContain('workflow_dispatch');}
  }
 }finally{await page.close();}
});
