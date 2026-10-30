import {test,expect} from 'bun:test';
import {boundaryIssues} from '../scripts/check-source';
test('boundary rejects private SDK and sibling source imports',()=>{
 expect(boundaryIssues("import {Registry} from '@umf/core';")).toEqual([]);
 expect(boundaryIssues("import x from '@umf/core/src/registry';")).toHaveLength(1);
 expect(boundaryIssues("import x from '../../umf/src/index';")).toHaveLength(1);
 expect(boundaryIssues("export * from '@umf/core';")).toHaveLength(1);
 expect(boundaryIssues("import x from '../../adapters/miro/index.js';",'src/extensions/visual/index.ts')).toContain('Vocabulary cannot depend on adapters');
});
test('portable ZIP/XML dependencies are confined to the PowerPoint adapter',()=>{
 for(const name of ['fflate','saxes']){
  expect(boundaryIssues(`import x from '${name}';`,'src/adapters/powerpoint/package.ts')).toEqual([]);
  expect(boundaryIssues(`import x from '${name}';`,'src/extensions/visual/index.ts')).toHaveLength(1);
  expect(boundaryIssues(`import x from '${name}';`,'src/adapters/google-slides/index.ts')).toHaveLength(1);
 }
 expect(boundaryIssues("import x from 'node:fs';",'src/adapters/powerpoint/package.ts')).toHaveLength(1);
});
