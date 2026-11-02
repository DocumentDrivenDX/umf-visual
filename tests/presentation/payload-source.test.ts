import {expect,test} from 'bun:test';
import {readJsonValue} from '@umf/core';
import {createVisualDocument,getVisual} from '../../src';
import {visualPayloadYaml} from '../../scripts/presentation/payload-source';

test('visible YAML preserves scalar types, multiline text, punctuation and ordered arrays',()=>{
 const document=createVisualDocument({id:'yaml-source',kind:'flow',form:'network',question:'Which values are authored?',nodes:[
  {id:'first',label:'true',detail:'Heading: value\nSecond line # literal'},
  {id:'second',label:'2026-11-02',detail:'null'},
  {id:'third',label:'01',detail:'*reference &anchor !tag {text} [value]'},
 ],edges:[{id:'edge',from:'first',to:'second',label:'yes'},{id:'last',from:'second',to:'third',label:'$42'}]},undefined,'1.2.0');
 const before=JSON.stringify(document),yaml=visualPayloadYaml(document);
 expect(yaml).toStartWith('id: yaml-source\n');
 expect(yaml).toContain('label: "true"');
 expect(yaml).toContain('detail: |-');
 expect(readJsonValue(yaml,'yaml')).toEqual(getVisual(document));
 expect(JSON.stringify(document)).toBe(before);
});
