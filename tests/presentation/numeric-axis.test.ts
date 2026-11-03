// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {calibrateNumericTicks,selectNumericTickRow,type NumericAxisText} from '../../scripts/presentation/numeric-axis';

const region={x:0,y:0,width:320,height:220};
const sample=(text:string,x:number,y:number,visible=true):NumericAxisText=>({text,bounds:{x:x-8,y:y-6,width:16,height:12},visible,className:'lini-chart-text'});

test('numeric tick row selects visible numeric labels fully within the caller region',()=>{
 const result=selectNumericTickRow([
  sample('axis title',30,35),sample('-10',60,180),sample('0',150,180),sample('10',240,180),
  sample('1',60,60),sample('2',150,60),sample('999',340,180),sample('7',150,180,false),
 ],region);
 expect(result.ok).toBe(true);if(!result.ok)return;
 expect(result.slots.map(item=>item.text)).toEqual(['-10','0','10']);
});

test('row selection handles tolerance edges and refuses tied or empty rows',()=>{
 const inclusive=selectNumericTickRow([sample('1',40,40),sample('2',80,42)],{x:0,y:0,width:100,height:100},2);
 expect(inclusive.ok).toBe(true);if(inclusive.ok)expect(inclusive.slots).toHaveLength(2);
 const separated=selectNumericTickRow([sample('1',40,40),sample('2',80,42.01)],{x:0,y:0,width:100,height:100},2);
 expect(separated.ok).toBe(false);
 const ambiguous=selectNumericTickRow([sample('1',20,20),sample('2',80,20),sample('3',20,80),sample('4',80,80)],{x:0,y:0,width:100,height:100});
 expect(ambiguous).toMatchObject({ok:false});
 const empty=selectNumericTickRow([sample('not numeric',40,40)],{x:0,y:0,width:100,height:100});expect(empty).toMatchObject({ok:false});
});

test('calibration binds exact left-to-right labels to an affine raw-value axis',()=>{
 const selected=selectNumericTickRow([sample('-10',50,80),sample('0',150,80),sample('10',250,80)],{x:0,y:0,width:300,height:100});
 expect(selected.ok).toBe(true);if(!selected.ok)return;
 const calibrated=calibrateNumericTicks(selected.slots,[-10,0,10],['-10','0','10']);
 expect(calibrated).toMatchObject({ok:true,pxPerUnit:10});
 if(calibrated.ok)expect(calibrated.ticks).toEqual([{value:-10,label:'-10',x:50},{value:0,label:'0',x:150},{value:10,label:'10',x:250}]);
 const tolerated=calibrateNumericTicks([sample('-10',50,80),sample('0',151,80),sample('10',250,80)],[-10,0,10],['-10','0','10'],1);
 expect(tolerated.ok).toBe(true);
 const unicodeMinus=calibrateNumericTicks([sample('−10',50,80),sample('0',150,80),sample('10',250,80)],[-10,0,10],['-10','0','10']);
 expect(unicodeMinus.ok).toBe(true);
 const displaced=calibrateNumericTicks([sample('-10',50,80),sample('0',155,80),sample('10',250,80)],[-10,0,10],['-10','0','10'],3);
 expect(displaced).toMatchObject({ok:false});
});

test('calibration refuses label, count, raw order, coordinate, and affine mismatches',()=>{
 const slots=[sample('-10',50,80),sample('0',150,80),sample('10',250,80)];
 expect(calibrateNumericTicks(slots,[-10,0,10],['-10','zero','10'])).toMatchObject({ok:false});
 expect(calibrateNumericTicks(slots,[-10,0],['-10','0'])).toMatchObject({ok:false});
 expect(calibrateNumericTicks([sample('0.00',50,80),slots[1]!,slots[2]!],[0,1,2],['0','1','2'])).toMatchObject({ok:false});
 expect(calibrateNumericTicks(slots,[-10,-10,10],['-10','0','10'])).toMatchObject({ok:false});
 expect(calibrateNumericTicks(slots,[10,0,-10],['-10','0','10'])).toMatchObject({ok:false});
 expect(calibrateNumericTicks([slots[0]!,slots[0]!,slots[2]!],[-10,0,10],['-10','0','10'])).toMatchObject({ok:false});
 expect(calibrateNumericTicks([slots[0]!,sample('0',195,80),slots[2]!],[-10,0,10],['-10','0','10'],3)).toMatchObject({ok:false});
 expect(calibrateNumericTicks([sample('NaN',50,80),slots[1]!,slots[2]!],[-10,0,10],['-10','0','10'])).toMatchObject({ok:false});
 const invalidGeometry=[slots[0]!,{...slots[1]!,bounds:{...slots[1]!.bounds,x:Number.NaN}},slots[2]!];
 expect(calibrateNumericTicks(invalidGeometry,[-10,0,10],['-10','0','10'])).toMatchObject({ok:false});
});
