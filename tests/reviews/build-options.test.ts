// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {buildShowcase} from '../../scripts/presentation/build';

test('generic presentation asset namespaces reject traversal and site-root deletion names before writes',async()=>{
 for(const assetDirectory of ['.','..','dist-site','reviews\\nested','/reviews']){
  await expect(buildShowcase({assetDirectory})).rejects.toThrow(/safe lowercase namespace/);
 }
});

test('duplicate source IDs refuse before a prior asset subtree is cleaned',async()=>{
 const manifestPath='.cache/review-duplicate-guard.json',assetDirectory='review-duplicate-guard',sentinel=`dist-site/${assetDirectory}/sentinel.txt`;
 await mkdir(`dist-site/${assetDirectory}`,{recursive:true});
 await writeFile(sentinel,'preserve until unique source IDs pass preflight');
 await writeFile(manifestPath,JSON.stringify({schemaVersion:1,examples:[{id:'same-example'},{id:'same-example'}]}));
 try{
  await expect(buildShowcase({manifestPath,outputPath:'.cache/review-duplicate-guard.json',assetDirectory})).rejects.toThrow(/malformed or duplicate/);
  expect(await readFile(sentinel,'utf8')).toBe('preserve until unique source IDs pass preflight');
 }finally{
  await rm(manifestPath,{force:true});
  await rm(`dist-site/${assetDirectory}`,{recursive:true,force:true});
 }
});
