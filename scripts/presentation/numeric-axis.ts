// SPDX-License-Identifier: MIT OR Apache-2.0
/** Shared CSS-space sampling and raw-slot calibration for native numeric axes. */

export type Box={x:number;y:number;width:number;height:number};
export type NumericAxisText={text:string;bounds:Box;visible:boolean;className:string};
export type NumericTickRow={ok:true;slots:NumericAxisText[]}|{ok:false;reason:string};
export type NumericTickCalibration={ok:true;ticks:Array<{value:number;label:string;x:number}>;pxPerUnit:number}|{ok:false;reason:string};

const centerY=(item:NumericAxisText)=>item.bounds.y+item.bounds.height/2;
const centerX=(item:NumericAxisText)=>item.bounds.x+item.bounds.width/2;
const numericText=/^[+−-]?(?:\d+(?:\.\d*)?|\.\d+)$/u;
const normalizeNumericLabel=(value:string)=>value.trim().replace(/−/gu,'-');
const inside=(outer:Box,inner:Box)=>inner.x>=outer.x&&inner.y>=outer.y&&inner.x+inner.width<=outer.x+outer.width&&inner.y+inner.height<=outer.y+outer.height;

/**
 * Select one uniquely largest row of visible numeric labels inside a supplied,
 * profile-scoped axis region. Bounds and y tolerance are CSS pixels.
 */
export function selectNumericTickRow(candidates:NumericAxisText[],region:Box,yToleranceCssPx=2):NumericTickRow{
 if(![region.x,region.y,region.width,region.height,yToleranceCssPx].every(Number.isFinite)||region.width<0||region.height<0||yToleranceCssPx<0)return{ok:false,reason:'The numeric-axis sampling region or CSS tolerance is invalid.'};
 const slots=candidates.filter(item=>item.visible&&numericText.test(item.text.trim())&&inside(region,item.bounds)).sort((a,b)=>centerY(a)-centerY(b)||centerX(a)-centerX(b));
 if(slots.length===0)return{ok:false,reason:'No visible numeric text slots fall inside the scoped axis region.'};
 const rows:Array<{anchor:number;slots:NumericAxisText[]}>=[];
 for(const item of slots){const anchor=centerY(item),row=rows.find(candidate=>Math.abs(candidate.anchor-anchor)<=yToleranceCssPx);if(row)row.slots.push(item);else rows.push({anchor,slots:[item]});}
 rows.sort((a,b)=>b.slots.length-a.slots.length||a.anchor-b.anchor);
 if(rows.length>1&&rows[0]!.slots.length===rows[1]!.slots.length)return{ok:false,reason:'The scoped numeric text contains ambiguous equally sized tick rows.'};
 return{ok:true,slots:rows[0]!.slots.sort((a,b)=>centerX(a)-centerX(b))};
}

/**
 * Pair ordered visible labels with authored raw tick slots and verify linear
 * geometry from endpoint anchors. Labels are display text; raw values are never
 * reconstructed from rounded glyphs. Positions and tolerance are CSS pixels.
 */
export function calibrateNumericTicks(slots:NumericAxisText[],rawValues:number[],expectedLabels:string[],toleranceCssPx=3):NumericTickCalibration{
 if(!Number.isFinite(toleranceCssPx)||toleranceCssPx<0)return{ok:false,reason:'The CSS calibration tolerance is invalid.'};
 if(rawValues.length<2||rawValues.length!==slots.length||rawValues.length!==expectedLabels.length)return{ok:false,reason:'The visible tick slots, raw values and expected labels must have the same count of at least two.'};
 if(rawValues.some(value=>!Number.isFinite(value))||rawValues.some((value,index)=>index>0&&value<=rawValues[index-1]!))return{ok:false,reason:'Raw tick values must be finite and strictly increasing.'};
 if(slots.some(slot=>![slot.bounds.x,slot.bounds.y,slot.bounds.width,slot.bounds.height].every(Number.isFinite)||slot.bounds.width<0||slot.bounds.height<0||!Number.isFinite(centerX(slot))||!Number.isFinite(centerY(slot))))return{ok:false,reason:'Every visible tick slot must have finite nonnegative CSS bounds.'};
 const ordered=[...slots].sort((a,b)=>centerX(a)-centerX(b));
 if(ordered.some((slot,index)=>!slot.visible||!numericText.test(slot.text.trim())||index>0&&centerX(slot)<=centerX(ordered[index-1]!)))return{ok:false,reason:'Visible numeric tick slots must have distinct increasing CSS x centers.'};
 for(let index=0;index<ordered.length;index++)if(normalizeNumericLabel(ordered[index]!.text)!==normalizeNumericLabel(expectedLabels[index]!))return{ok:false,reason:`Visible tick label ${index} does not match its expected display text.`};
 const firstX=centerX(ordered[0]!),lastX=centerX(ordered.at(-1)!),firstValue=rawValues[0]!,lastValue=rawValues.at(-1)!;
 const pxPerUnit=(lastX-firstX)/(lastValue-firstValue);
 if(!(pxPerUnit>0&&Number.isFinite(pxPerUnit)))return{ok:false,reason:'Raw tick values and visible CSS positions do not define an increasing finite scale.'};
 for(let index=0;index<ordered.length;index++){
  const expectedX=firstX+(rawValues[index]!-firstValue)*pxPerUnit;
  if(Math.abs(centerX(ordered[index]!)-expectedX)>toleranceCssPx)return{ok:false,reason:`Visible tick slot ${index} is outside the raw-value affine calibration tolerance.`};
 }
 return{ok:true,ticks:ordered.map((slot,index)=>({value:rawValues[index]!,label:slot.text.trim(),x:centerX(slot)})),pxPerUnit};
}
