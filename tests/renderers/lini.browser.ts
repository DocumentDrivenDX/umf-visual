// SPDX-License-Identifier: MIT OR Apache-2.0
import {createVisualDocument} from '../../src/index.js';
import {renderLiniPresentation} from '../../src/renderers/lini.js';

const largeRecords=Array.from({length:100},(_,index)=>({id:`record-${index+1}`,label:`Record ${index+1}`}));
const largeFields=largeRecords.map((node,index)=>({node:node.id,fields:[{name:`field_${index+1}`,type:'text'}]}));
const largeOrder=largeRecords.map(node=>node.id);
const largeReferences=largeRecords.slice(0,-1).map((node,index)=>({
  id:`catalog-link-${index+1}`,
  from:{node:node.id,field:`field_${index+1}`},
  to:{node:largeRecords[index+1]!.id,field:`field_${index+2}`},
}));
const largeDocument=createVisualDocument({
  id:'hundred-records',kind:'structure',form:'entities',question:'Which one hundred records are in this catalog?',
  nodes:largeRecords,
  structure:{entities:largeFields,references:largeReferences},
  layout:{kind:'grid',columns:10,order:largeOrder},
},undefined,'1.3.0');
const sequenceDocument=createVisualDocument({
  id:'sequence-self-parallel',kind:'sequence',form:'lifelines',question:'How do repeated calls and self work appear?',
  sequence:{participants:[{id:'client',label:'Client'},{id:'service',label:'Service'}],messages:[
    {id:'self-work',from:'service',to:'service',label:'self-work',kind:'call'},
    {id:'parallel-a',from:'client',to:'service',label:'parallel A',kind:'async'},
    {id:'parallel-b',from:'client',to:'service',label:'parallel B',kind:'async'},
  ]},
},undefined,'1.3.0');
const relationDocument=createVisualDocument({
  id:'nondirected-relations',kind:'structure',form:'entities',question:'Which records are related?',
  nodes:[{id:'left',label:'Left record'},{id:'right',label:'Right record'}],
  structure:{entities:[{node:'left',fields:[{name:'id',type:'text',keys:['pk']}]},{node:'right',fields:[{name:'left_id',type:'text',keys:['fk']}]}],references:[
    {id:'reference',from:{node:'left',field:'id'},to:{node:'right',field:'left_id'},toCardinality:'zero-or-many'},
  ]},
},undefined,'1.3.0');
const flowDocument=createVisualDocument({
  id:'network-directed-and-undirected',kind:'flow',form:'network',question:'Which directed and undirected links connect these ports?',
  nodes:[
    {id:'source',label:'Source',ports:[{id:'out',label:'output',side:'east'}]},
    {id:'target',label:'Target',ports:[{id:'in',label:'input',side:'west'}]},
  ],
  edges:[
    {id:'directed-link',from:'source',to:'target',fromPort:'out',toPort:'in',label:'directed link'},
    {id:'parallel-link',from:'source',to:'target',fromPort:'out',toPort:'in',label:'parallel undirected link',directed:false},
    {id:'self-link',from:'source',to:'source',label:'undirected self link',directed:false},
  ],
},undefined,'1.3.0');
const maliciousLabel='5 < 7 & "quoted" </text><script>window.pwned=true</script>';
const safeTextDocument=createVisualDocument({
  id:'safe-svg-text',kind:'flow',form:'network',question:'Are labels kept as text?',
  nodes:[{id:'safe',label:maliciousLabel}],
},undefined,'1.3.0');

const renders=await Promise.all([
  renderLiniPresentation(largeDocument),
  renderLiniPresentation(sequenceDocument),
  renderLiniPresentation(relationDocument),
  renderLiniPresentation(flowDocument),
  renderLiniPresentation(safeTextDocument),
]);
const custom=await renderLiniPresentation(sequenceDocument,{runtimeBaseUrl:'/alternate/lini-runtime/'});
const refused=await renderLiniPresentation({umf:'0.10.0',id:'missing-visual',vocabularies:{},extensions:{}} as never);
const invalidOptions=await renderLiniPresentation(largeDocument,{runtimeBaseUrl:'file:///etc/passwd'});
const tampered=await renderLiniPresentation(sequenceDocument,{runtimeBaseUrl:'/tampered/lini-runtime/'});
const tamperedJavascript=await renderLiniPresentation(sequenceDocument,{runtimeBaseUrl:'/tampered-js/lini-runtime/'});
Object.assign(window,{liniBrowserResult:{renders,custom,refused,invalidOptions,tampered,tamperedJavascript,maliciousLabel}});
