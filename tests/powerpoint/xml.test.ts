// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,it} from 'bun:test';
import {parseXml,child,children,replaceInner,textContent} from '../../src/adapters/powerpoint/xml.js';
import {PowerPointError} from '../../src/adapters/powerpoint/errors.js';

describe('bounded namespace-aware OOXML reader',()=>{
  it('tracks source spans across Unicode and decoded character references',()=>{
    const xml='<?xml version="1.0"?><q:root xmlns:q="urn:q" xmlns:t="urn:text"><t:value data-x="preserve">A&amp;😀</t:value><q:tail/></q:root>';
    const parsed=parseXml(xml),value=child(parsed.root,'urn:text','value');
    expect(textContent(value)).toBe('A&😀');
    const changed=replaceInner(parsed,value,'Café & tea <now>');
    expect(changed).toBe(xml.replace('A&amp;😀','Café &amp; tea &lt;now&gt;'));
    expect(parseXml(changed).root.local).toBe('root');
  });

  it('preserves qualified aliases and refuses elements outside the admitted namespace',()=>{
    const xml='<x:root xmlns:x="urn:one" xmlns:y="urn:two"><y:item id="1"/></x:root>';
    const parsed=parseXml(xml);
    expect(children(parsed.root,'urn:two','item')).toHaveLength(1);
    expect(children(parsed.root,'urn:one','item')).toHaveLength(0);
  });

  it('finds exact inner-text boundaries when legal closing-tag whitespace is present',()=>{
    const xml='<a:root xmlns:a="urn:a"><a:value>before</a:value ><a:tail/></a:root>';
    const parsed=parseXml(xml),value=child(parsed.root,'urn:a','value');
    expect(replaceInner(parsed,value,'after')).toBe(xml.replace('before','after'));
  });

  it('accepts XML-misc whitespace around the document element but rejects outside text',()=>{
    expect(parseXml('<?xml version="1.0"?>\r\n  <a/>\n').root.local).toBe('a');
    expect(()=>parseXml('<?xml version="1.0"?>noise<a/>')).toThrow(PowerPointError);
  });

  it('rejects DTDs, custom entities, malformed XML and excessive depth',()=>{
    for(const xml of [
      '<!DOCTYPE a [<!ENTITY x "boom">]><a>&x;</a>',
      '<a><b></a>',
      '<a>'+'<b>'.repeat(70)+'</b>'.repeat(70)+'</a>',
    ])expect(()=>parseXml(xml)).toThrow(PowerPointError);
  });
});
