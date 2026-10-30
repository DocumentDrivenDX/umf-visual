import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {liniAdapter} from '../../src/interchange/lini';

const context={id:'lini-test',question:'What does this model mean?'};
const fixture=(name:string)=>readFileSync(new URL('../../fixtures/interchange/lini/'+name,import.meta.url),'utf8');

test('Lini flow profile maps native card paths and directed links',()=>{
 const parsed=liniAdapter.parse(fixture('flow-basic.lini'),context);
 expect(parsed.diagnostics.some(d=>d.severity==='error')).toBe(false);
 expect(parsed.visual).toMatchObject({kind:'flow',form:'network',nodes:[{label:'Ingress'},{label:'Store'}],edges:[{from:'n1',to:'n2',label:'writes'}]});
 expect(parsed.identityMap.some(item=>item.kind==='node'&&item.nativeId==='n_1')).toBe(true);
 expect(parsed.identityMap.some(item=>item.kind==='edge'&&item.path==='/extensions/umf.visual/edges/0/id')).toBe(true);
 const output=liniAdapter.serialize(parsed.visual!,context);
 expect(output.text).toContain('|block#n_0| "Ingress"');
 expect(output.text).toContain('n_0 -> n_1 "writes"');
});

test('Lini entity profile preserves field display text and field endpoints',()=>{
 const parsed=liniAdapter.parse(fixture('entities-basic.lini'),context);
 expect(parsed.diagnostics.some(d=>d.severity==='error')).toBe(false);
 expect(parsed.visual).toMatchObject({kind:'structure',form:'entities',structure:{entities:[{fields:[{name:'account id',type:'uuid'}]},{fields:[{name:'payload',type:'json'}]},],references:[{from:{field:'account id'},to:{field:'payload'},label:'emits'}]}});
 const output=liniAdapter.serialize(parsed.visual!,context);
 expect(output.text).toContain('|cell#f_0| "account id"');
 expect(output.text).toContain('n_0.f_0 -> n_1.f_0 "emits"');
});

test('Lini field references resolve arbitrary declared flat paths rather than row positions or hints',()=>{
 const source='|entity#left| "Left" { hint: "right"; } [\n|cell#pk| "key" { hint: "key"; }; "uuid"\n]\n|entity#right| "Right" { hint: "left"; } [\n|cell#fk| "value"; "text"\n]\nleft.pk -> right.fk';
 const parsed=liniAdapter.parse(source,context);
 expect(parsed.diagnostics.some(d=>d.severity==='error')).toBe(false);
 expect(parsed.identityMap.some(item=>item.kind==='node'&&item.nativeId==='left'&&item.visualId==='n1')).toBe(true);
 expect(parsed.identityMap.some(item=>item.kind==='field'&&item.nativeId==='left.pk')).toBe(true);
 expect(parsed.identityMap.some(item=>item.kind==='field'&&item.nativeId==='right.fk')).toBe(true);
 expect(parsed.identityMap.some(item=>item.kind==='reference'&&item.nativeId==='left.pk->right.fk#1')).toBe(true);
 const bad=liniAdapter.parse(source.replace('left.pk ->','left.f_0 ->'),context);
 expect(bad.visual).toBeUndefined();expect(bad.diagnostics.some(d=>d.code==='LINI_ENDPOINT'&&d.severity==='error')).toBe(true);
});

test('unsupported or ambiguous Lini syntax is an explicit hard refusal',()=>{
 const parsed=liniAdapter.parse('|entity#bad| "Account" { hint: "x"; } [\n  |chart| 3\n]',context);
 expect(parsed.visual).toBeUndefined();
 expect(parsed.diagnostics.some(d=>d.severity==='error'&&d.code==='LINI_ENTITY_ROW')).toBe(true);
 const undirected=liniAdapter.parse('|block#a| "A" { hint: "a"; }\n|block#b| "B" { hint: "b"; }\na - b "related"',context);
 expect(undirected.visual).toBeUndefined();
 expect(undirected.diagnostics.some(d=>d.code==='LINI_DIRECTION')).toBe(true);
 const duplicatePath=liniAdapter.parse('|block#a| "A" { hint: "a"; }\n|block#a| "B" { hint: "b"; }\na -> a',context);
 expect(duplicatePath.visual).toBeUndefined();expect(duplicatePath.diagnostics.some(d=>d.code==='LINI_NODE_ID')).toBe(true);
 const flowField=liniAdapter.parse('|block#a| "A" { hint: "a"; } [\n  |cell#f_0| "unexpected"; "text"\n]',context);
 expect(flowField.visual).toBeUndefined();expect(flowField.diagnostics.some(d=>d.code==='LINI_FLOW_FIELDS')).toBe(true);
 const escapedUnicode=liniAdapter.parse('|block#a| "\\u0061"',context);
 expect(escapedUnicode.visual).toBeUndefined();expect(escapedUnicode.diagnostics.some(d=>d.severity==='error')).toBe(true);
 const trimmed=liniAdapter.parse('|block#a| "  API  "',context);
 expect(trimmed.visual).toMatchObject({nodes:[{label:'API'}]});expect(trimmed.diagnostics.some(d=>d.code==='LINI_TEXT_TRIM')).toBe(true);
 const invalidFieldType=liniAdapter.parse('|entity#a| "A" [\n|cell#f_9| " x " ; "\\u0061"\n]',context);
 expect(invalidFieldType.visual).toBeUndefined();expect(invalidFieldType.diagnostics.some(d=>d.severity==='error')).toBe(true);
 const unquotedType=liniAdapter.parse('|entity#a| "A" [\n|cell#f_0| "x"; int\n]',context);
 expect(unquotedType.visual).toBeUndefined();expect(unquotedType.diagnostics.some(d=>d.severity==='error')).toBe(true);
 const malformedHint=liniAdapter.parse('|block#a| "A" { hint: "\\u0061"; }',context);
 expect(malformedHint.visual).toBeUndefined();expect(malformedHint.diagnostics.some(d=>d.severity==='error')).toBe(true);
 const trimmedField=liniAdapter.parse('|entity#a| "A" [\n|cell#f_9| " x "; " type "\n]',context);
 expect(trimmedField.visual).toMatchObject({structure:{entities:[{fields:[{name:'x',type:'type'}]}]}});
 expect(trimmedField.diagnostics.filter(d=>d.code==='LINI_TEXT_TRIM')).toHaveLength(2);
 const invalidControls=liniAdapter.serialize({id:'x',kind:'flow',form:'network',question:'q',nodes:[{id:'a',label:'A\rB'}]},context);
 expect(invalidControls.text).toBeUndefined();expect(invalidControls.diagnostics.some(d=>d.code==='LINI_TEXT'&&d.severity==='error')).toBe(true);
 const loneSurrogate=liniAdapter.serialize({id:'x',kind:'flow',form:'network',question:'q',nodes:[{id:'a',label:'bad\ud800'}]},context);
 expect(loneSurrogate.text).toBeUndefined();expect(loneSurrogate.diagnostics.some(d=>d.code==='LINI_TEXT'&&d.severity==='error')).toBe(true);
 const unicode=liniAdapter.serialize({id:'x',kind:'flow',form:'network',question:'q',nodes:[{id:'a',label:'` 😀'}]},context);
 expect(unicode.text).toContain('"` 😀"');expect(unicode.diagnostics.some(d=>d.severity==='error')).toBe(false);
});

test('entity links report native arrow direction absent from the shared reference model',()=>{
 const parsed=liniAdapter.parse('|entity#a| "A" [\n|cell#id| "id"; "uuid"\n]\n|entity#b| "B" [\n|cell#id| "id"; "uuid"\n]\na.id -> b.id',context);
 expect(parsed.visual?.structure?.references).toHaveLength(1);
 const loss=parsed.diagnostics.find(d=>d.code==='LINI_REFERENCE_DIRECTION');
 expect(loss).toMatchObject({severity:'warning',loss:true,path:'/source/lines/6'});
 expect(loss?.range).toBeDefined();
});
