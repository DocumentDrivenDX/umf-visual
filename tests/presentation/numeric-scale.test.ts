// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {planMetricNumericScale} from '../../src/presentation/numeric-scale';

function assertScale(values:number[]){
 const original=[...values],scale=planMetricNumericScale(values);
 expect(scale).toBeDefined();expect(values).toEqual(original);if(!scale)return;
 expect(Number.isFinite(scale.min)&&Number.isFinite(scale.max)&&Number.isFinite(scale.step)).toBe(true);
 expect(scale.min).toBeLessThan(scale.max);expect(scale.step).toBeGreaterThan(0);
 expect(scale.ticks.length).toBeGreaterThanOrEqual(2);expect(scale.ticks[0]).toBe(scale.min);expect(scale.ticks.at(-1)).toBe(scale.max);
 expect(scale.ticks.every((tick,index)=>Number.isFinite(tick)&&(index===0||tick>scale.ticks[index-1]!))).toBe(true);
 expect(scale.ticks.slice(1).every((tick,index)=>Math.abs((tick-scale.ticks[index]!)-scale.step)<1e-9*Math.max(1,Math.abs(scale.step)))).toBe(true);
 expect(values.every(value=>value>=scale.min&&value<=scale.max)).toBe(true);
 return scale;
}

test('positive, negative, and mixed domains include raw values and zero with regular ticks',()=>{
 const positive=assertScale([1,5,9]);expect(positive?.min).toBe(0);expect(positive?.ticks[0]).toBe(0);
 const negative=assertScale([-9,-5,-1]);expect(negative?.min).toBeLessThan(-9);expect(negative?.max).toBeGreaterThan(0);expect(negative?.ticks).toContain(0);
 const mixed=assertScale([-4,6]);expect(mixed?.min).toBeLessThan(-4);expect(mixed?.max).toBeGreaterThan(6);expect(mixed?.ticks).toContain(0);
});

test('zero and constant domains receive a finite noncollapsed display scale',()=>{
 const zero=assertScale([0,0,0]);expect(zero).toBeDefined();if(!zero)return;expect(zero.min).toBeLessThan(zero.max);expect(zero.ticks).toContain(0);
 const constant=assertScale([7,7]);expect(constant?.min).toBeLessThan(7);expect(constant?.max).toBeGreaterThan(7);
});

test('fractional domains retain fractional tick spacing and include source values unchanged',()=>{
 const scale=assertScale([0.1,0.2]);expect(scale?.step).toBeGreaterThan(0);expect(scale?.step).toBeLessThan(1);
 expect(scale?.ticks.some(value=>Math.abs(value-0.1)<1e-9)).toBe(true);expect(scale?.ticks.some(value=>Math.abs(value-0.2)<1e-9)).toBe(true);
});

test('tiny finite domains use bounded significant-digit cleanup instead of throwing at toFixed precision limits',()=>{
 const scale=planMetricNumericScale([1e-200,2e-200]);expect(scale).toBeDefined();if(!scale)return;
 expect(scale.min).toBeLessThanOrEqual(1e-200);expect(scale.max).toBeGreaterThanOrEqual(2e-200);
 expect(scale.ticks.length).toBeGreaterThanOrEqual(2);expect(scale.ticks.every(Number.isFinite)).toBe(true);
});

test('empty, nonfinite, and unsafe extreme inputs are refused',()=>{
 for(const values of [[],[Number.NaN],[Number.POSITIVE_INFINITY],[-Number.MAX_VALUE,Number.MAX_VALUE]])expect(planMetricNumericScale(values)).toBeUndefined();
});
