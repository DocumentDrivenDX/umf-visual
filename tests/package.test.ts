import {test,expect} from 'bun:test';
import {boundaryIssues} from '../scripts/check-source';
test('boundary rejects private SDK and sibling source imports',()=>{
 expect(boundaryIssues("import {Registry} from '@umf/core';")).toEqual([]);
 expect(boundaryIssues("import x from '@umf/core/src/registry';")).toHaveLength(1);
 expect(boundaryIssues("import x from '../../umf/src/index';")).toHaveLength(1);
 expect(boundaryIssues("export * from '@umf/core';")).toHaveLength(1);
});
