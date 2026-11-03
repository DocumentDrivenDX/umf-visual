// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {assertNativeSvgMatchesReceipt,assertNativeVersionMatches} from '../../scripts/presentation/verify';
import mermaidPackage from 'mermaid/package.json';

const hash=(data:string)=>createHash('sha256').update(data).digest('hex');

test('native replay receipts bind exact SVG bytes and runtime versions',()=>{
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>';
 const actualVersion=`${mermaidPackage.version} / Chromium 123.0.0.0`;
 expect(()=>assertNativeVersionMatches('replay-fixture','mermaid',actualVersion,actualVersion)).not.toThrow();
 expect(()=>assertNativeVersionMatches('replay-fixture','mermaid','forged / Chromium 123.0.0.0',actualVersion)).toThrow('does not match selected executable/runtime');
 expect(()=>assertNativeSvgMatchesReceipt('replay-fixture','mermaid',svg,hash(svg))).not.toThrow();
 expect(()=>assertNativeSvgMatchesReceipt('replay-fixture','mermaid',svg,hash(svg+' '))).toThrow('native SVG replay hash');
});
