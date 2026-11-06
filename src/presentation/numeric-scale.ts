// SPDX-License-Identifier: MIT OR Apache-2.0
/** Pure renderer-selected numeric display scale shared by Lini metric views. */

export interface NumericScalePlan{min:number;max:number;step:number;ticks:number[];}

export function niceMetricStep(span:number):number{
 const rough=span/5||1,power=10**Math.floor(Math.log10(rough)),fraction=rough/power;
 const unit=fraction<=1?1:fraction<=2?2:fraction<=2.5?2.5:fraction<=5?5:10;
 return unit*power;
}

function cleanTick(value:number,step:number):number{
 const exponent=Math.floor(Math.log10(step)),mantissa=step/10**exponent,precision=Math.max(0,-exponent+(Math.abs(mantissa-2.5)<1e-9?1:0));
 const rounded=precision<=100?Number(value.toFixed(precision)):Number(value.toPrecision(15));return Object.is(rounded,-0)?0:rounded;
}

/** Include zero, pad source extent by the existing stat convention, and return exact raw tick slots. */
export function planMetricNumericScale(values:readonly number[]):NumericScalePlan|undefined{
 if(values.length===0||values.some(value=>!Number.isFinite(value)))return;
 const rawMin=Math.min(...values),rawMax=Math.max(...values),includedMin=Math.min(rawMin,0),includedMax=Math.max(rawMax,0),span=includedMax-includedMin;
 const step=niceMetricStep(span||Math.max(Math.abs(includedMax),1)),padding=(span||step)*.08;
 let min=rawMin>=0?0:Math.floor((includedMin-padding)/step)*step,max=Math.ceil((includedMax+padding)/step)*step;
 if(min===max){min-=step;max+=step;}
 if(min===includedMin&&includedMin<0)min-=step;
 if(max===includedMax&&includedMax>0)max+=step;
 if(!Number.isFinite(min)||!Number.isFinite(max)||!Number.isFinite(step)||!(step>0)||!(min<max))return;
 // Use significant-digit cleanup beyond toFixed's supported precision. This
 // keeps tiny finite domains representable without changing source values.
 const exponent=Math.floor(Math.log10(step)),mantissa=step/10**exponent,precision=Math.max(0,-exponent+(Math.abs(mantissa-2.5)<1e-9?1:0));
 if(!Number.isFinite(precision))return;
 const count=Math.max(0,Math.round((max-min)/step));if(!Number.isSafeInteger(count)||count>1000)return;
 const ticks=Array.from({length:count+1},(_,index)=>cleanTick(min+index*step,step)).filter(value=>value<=max+step*1e-9);
 if(ticks.length<2||ticks.some((value,index)=>!Number.isFinite(value)||index>0&&value<=ticks[index-1]!))return;
 return{min,max,step,ticks};
}
