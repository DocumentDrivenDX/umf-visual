// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {selectReviewUiExamples} from '../../scripts/reviews/ui-selection';

const examples=[{id:'beacon-estate-landscape',value:1},{id:'beacon-deployment',value:2},{id:'miro-network-16x24',value:3}];

test('review UI defaults to every example and marks shared controls as unconditional',()=>{
 const result=selectReviewUiExamples(examples,[]);
 expect(result).toEqual({mode:'all',requestedIds:[],selectedIds:examples.map(item=>item.id),selected:examples,totalExamples:3,sharedControls:true});
});

test('repeatable exact IDs select only requested examples in request order',()=>{
 const result=selectReviewUiExamples(examples,['--example','miro-network-16x24','--example=beacon-deployment']);
 expect(result.mode).toBe('selected');
 expect(result.requestedIds).toEqual(['miro-network-16x24','beacon-deployment']);
 expect(result.selectedIds).toEqual(result.requestedIds);
 expect(result.selected).toEqual([examples[2],examples[1]]);
 expect(result.totalExamples).toBe(3);
 expect(result.sharedControls).toBe(true);
});

test('explicit all-ID selection is equivalent to the default full run',()=>{
 const defaultRun=selectReviewUiExamples(examples,[]),explicitRun=selectReviewUiExamples(examples,examples.flatMap(item=>['--example',item.id]));
 expect(explicitRun.mode).toBe('selected');
 expect(explicitRun.selectedIds).toEqual(defaultRun.selectedIds);
 expect(explicitRun.selected).toEqual(defaultRun.selected);
 expect(explicitRun.totalExamples).toBe(defaultRun.totalExamples);
 expect(explicitRun.sharedControls).toBe(true);
});

test('empty, malformed, duplicate, unknown, and unrecognized selectors fail closed',()=>{
 for(const args of [
  ['--example'],['--example',''],['--example='],['--example','--other'],
  ['--example','Not-An-ID'],['--example','missing-example'],
  ['--example','beacon-deployment','--example=beacon-deployment'],['--all'],
 ])expect(()=>selectReviewUiExamples(examples,args)).toThrow();
 expect(()=>selectReviewUiExamples([],[])).toThrow();
 expect(()=>selectReviewUiExamples([{id:'duplicate'},{id:'duplicate'}],[])).toThrow();
});
