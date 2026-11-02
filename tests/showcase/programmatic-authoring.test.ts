import {expect,test} from 'bun:test';
import {createVisualDocument,readVisualDocument,writeVisualDocument,getVisual,editVisual,type VisualVersion} from '../../src';
import {compilePresentation} from '../../src/presentation';

test('the visible example definitions support the shown read, edit and compile API workflow',async()=>{
 const manifest=await Bun.file('fixtures/showcase/showcase-sources.json').json();
 for(const example of manifest.examples){
  const document=readVisualDocument(await Bun.file(example.definitionPath).text(),'json');
  const baseline=JSON.stringify(document),visual=getVisual(document);
  const authored=createVisualDocument(visual,undefined,document.vocabularies['umf.visual']!.version as VisualVersion);
  expect(getVisual(authored)).toEqual(visual);
  const edited=editVisual(document,current=>({...current,title:`${current.title??current.question} — reviewed`}));
  expect(JSON.stringify(document)).toBe(baseline);
  expect(getVisual(edited).title).toBe(`${visual.title??visual.question} — reviewed`);
  for(const format of ['json','yaml'] as const)expect(readVisualDocument(writeVisualDocument(edited,format),format)).toEqual(edited);
  const plan=compilePresentation(edited,{backend:'lini'});
  expect(plan.ok).toBe(true);if(plan.ok){expect(plan.nativeFormat).toBe('lini');expect(plan.source).toContain('reviewed');}
 }
});

test('shared shapes, composition and named anchors stay explicit in the source-grounded 1.2 example',async()=>{
 const document=readVisualDocument(await Bun.file('fixtures/showcase/definitions/umf-logical-interface-architecture.json').text(),'json');
 const visual=getVisual(document);
 expect(document.vocabularies['umf.visual']!.version).toBe('1.2.0');
 expect(visual.layout).toEqual({kind:'grid',columns:2,order:['sdk','ashlar']});
 expect(visual.nodes?.map(node=>node.shape)).toEqual(['ellipse','hexagon','rounded-rectangle']);
 expect(visual.edges?.map(edge=>[edge.from,edge.fromPort,edge.to,edge.toPort])).toEqual([
  ['catalog','read','resolver','read'],['resolver','resolve','pinned-read','publication']
 ]);
 expect(visual.omissions?.join(' ')).toContain('not network transport ports');
 const source=await Bun.file(visual.source!.path).text();expect(source).toContain('Q --> AR --> AP');
});

test('the model can express state layout without inventing presentation support',()=>{
 const document=createVisualDocument({id:'state-layout',kind:'state',form:'machine',question:'Which state follows?',nodes:[{id:'ready',label:'Ready'},{id:'done',label:'Done'}],state:{initial:'ready',final:['done'],transitions:[{id:'finish',from:'ready',to:'done',event:'finish'}]},layout:{kind:'flow',direction:'LR',order:['ready','done']}},undefined,'1.2.0');
 for(const backend of ['graphviz','mermaid','lini'] as const){const plan=compilePresentation(document,{backend});expect(plan.ok).toBe(false);if(!plan.ok)expect(plan.diagnostics.some(item=>item.code==='PRESENTATION_FORM')).toBe(true);}
});
