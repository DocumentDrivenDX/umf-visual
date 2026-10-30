// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Visual} from '../../extensions/visual';
import type {VisualDefs} from '../../extensions/visual/generated';
import {VISUAL_PATH,interchangeDiagnostic} from '../shared';
import type {InterchangeDiagnostic} from '../types';
import type {NativeLocator,ProjectionCoverage} from '../annotations';
import type {LiniProfileNode,LiniProfileToken} from './profile-syntax';
import {quoteLiniProfile} from './profile-syntax';

export type LiniTimelineForm='history'|'milestones'|'roadmap';
export type LiniTimelineIdentityKind='event'|'period'|'lane'|'span';
export interface LiniTimelineIdentityMapping {kind:LiniTimelineIdentityKind;nativeId:string;visualId:string;path:string;sourcePath?:string;}
export interface LiniTimelineSerializeResult {statements:string[];identityMap:LiniTimelineIdentityMapping[];coverage:ProjectionCoverage[];diagnostics:InterchangeDiagnostic[];}
export interface LiniTimelineParseResult {timeline?:VisualDefs['timeline'];identityMap:LiniTimelineIdentityMapping[];coverage:ProjectionCoverage[];diagnostics:InterchangeDiagnostic[];}

const ROOT=VISUAL_PATH+'/timeline';
const p=(suffix:string)=>ROOT+suffix;
const quote=quoteLiniProfile;
const diagnostic=(code:string,at:string,message:string,severity:'warning'|'error'='warning',loss=true):InterchangeDiagnostic=>interchangeDiagnostic(code,at,message,{severity,loss});
const covers=(at:string,aspects:ProjectionCoverage['aspect'][],native:NativeLocator):ProjectionCoverage[]=>aspects.map(aspect=>({path:at,aspect,representation:'native-concept',native:[native]}));
const validId=(id:string)=>id.length<=128&&/^[a-z0-9]+(?:[_-]+[a-z0-9]+)*$/.test(id);
const encodeId=(prefix:string,id:string)=>prefix+[...id].map(c=>c.codePointAt(0)!.toString(16).padStart(2,'0')).join('');
const decodeId=(value:string,prefix:string):string|undefined=>{
 if(!value.startsWith(prefix))return;const hex=value.slice(prefix.length);if(!hex||hex.length%2||!/^[0-9a-f]+$/.test(hex))return;
 let decoded='';for(let i=0;i<hex.length;i+=2)decoded+=String.fromCharCode(Number.parseInt(hex.slice(i,i+2),16));return validId(decoded)?decoded:undefined;
};
const finite=(value:number)=>Number.isFinite(value);
const number=(value:number)=>Object.is(value,-0)?'-0':String(value);
const validDate=(text:string)=>{
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text);if(!match)return false;
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);if(month<1||month>12||day<1)return false;
 const leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];return day<=days[month-1]!;
};
const textSafe=(value:string)=>{try{quote(value);return true;}catch{return false;}};
const trimNative=(value:string)=>value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu,'');
function nativeLabel(value:string,at:string,diagnostics:InterchangeDiagnostic[]):string{const normalized=trimNative(value);if(normalized!==value)diagnostics.push(diagnostic('LINI_TIMELINE_TRIM',at,'Native Lini trims boundary whitespace from visible labels.'));return normalized;}
function wrapRoadmapLabel(value:string,max:number):string{
 if(value.includes('\n'))return value;
 const pieces=value.split(/( +)/),out:string[]=[];let column=0;
 for(let i=0;i<pieces.length;i++){const part=pieces[i]!;if(part===' '&&pieces[i+1]&&column+1+pieces[i+1]!.length>max&&column>0){out.push('\n');column=0;continue;}out.push(part);const last=part.lastIndexOf('\n');column=last>=0?part.length-last:column+part.length;}
 return out.join('');
}
const longestRoadmapWord=(value:string):number=>Math.max(0,...(value.match(/[^ ]+/g)??[]).map(word=>word.length));
function unwrapRoadmapLabel(value:string):string{return value.replace(/\n/g,' ');}
const statusPaths=['detail','status','emphasis'] as const;
type Timeline=VisualDefs['timeline'];

function encodeFields(diagnostics:InterchangeDiagnostic[],items:readonly unknown[],field:'event'|'span'){
 items.forEach((raw,index)=>{
  const item=raw as Record<string,unknown>;
  for(const key of statusPaths)if(item[key]!==undefined)diagnostics.push(diagnostic('LINI_TIMELINE_ANNOTATION',p('/'+(field==='event'?'events':'spans')+'/'+index+'/'+key),'This application field is outside the native timeline profile and needs the visible annotation layer.'));
 });
}
function idCheck(id:string,at:string,diagnostics:InterchangeDiagnostic[]){if(!validId(id))diagnostics.push(diagnostic('LINI_TIMELINE_ID',at,'Timeline IDs must use the bounded reversible visual ID grammar.','error',false));}
function textCheck(value:string,at:string,diagnostics:InterchangeDiagnostic[],trim=false){
 if(!textSafe(value))diagnostics.push(diagnostic('LINI_TIMELINE_TEXT',at,'Text contains characters outside the pinned Lini string subset.','error',false));
 if(trim&&value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu,'')!==value)diagnostics.push(diagnostic('LINI_TIMELINE_TRIM',at,'Pinned Lini trims boundary whitespace in visible labels.'));
}
function dateYSlots(events:NonNullable<Timeline['events']>):number[]{
 const count=new Map<string,number>();for(const event of events)count.set(event.at,(count.get(event.at)??0)+1);
 const seen=new Map<string,number>();return events.map(event=>{const ordinal=seen.get(event.at)??0;seen.set(event.at,ordinal+1);return(ordinal+1)/(count.get(event.at)!+1);});
}
function buildHistory(visual:Visual,timeline:Timeline,form:LiniTimelineForm,diagnostics:InterchangeDiagnostic[],identityMap:LiniTimelineIdentityMapping[],coverage:ProjectionCoverage[]):string[]{
 const events=timeline.events??[];
 if(timeline.scale.kind!=='date')diagnostics.push(diagnostic('LINI_TIMELINE_SCALE',p('/scale'),'History and milestones profiles require an exact date scale.','error',false));
 if(timeline.lanes!==undefined||timeline.spans!==undefined||timeline.markers!==undefined)diagnostics.push(diagnostic('LINI_TIMELINE_SHAPE',ROOT,'This date profile supports events only; lanes, spans, and markers are not mapped.','error',false));
 if(events.length===0)diagnostics.push(diagnostic('LINI_TIMELINE_EVENTS',p('/events'),'A date timeline needs at least one event.','error',false));
 const ids=new Set<string>();
 events.forEach((event,index)=>{
  const at=p('/events/'+index);idCheck(event.id,at+'/id',diagnostics);if(ids.has(event.id))diagnostics.push(diagnostic('LINI_TIMELINE_ID',at+'/id','Timeline event IDs must be unique.','error',false));ids.add(event.id);
  textCheck(event.label,at+'/label',diagnostics,true);if(!validDate(event.at))diagnostics.push(diagnostic('LINI_TIMELINE_DATE',at+'/at','Only full, real ISO calendar dates are supported.','error',false));
 });
 encodeFields(diagnostics,events,'event');
 if(visual.title!==undefined)textCheck(visual.title,VISUAL_PATH+'/title',diagnostics,true);
 if(visual.question!==undefined)textCheck(visual.question,VISUAL_PATH+'/question',diagnostics,true);
 if(diagnostics.some(d=>d.severity==='error'))return[];
 const chartId='timeline-'+form,title=visual.title??visual.question,ys=dateYSlots(events),dates=events.map(event=>event.at).sort(),first=dates[0]!,last=dates.at(-1)!;
 const lines=['|chart#'+chartId+'| '+quote(title)+' { layout: chart; width: 960; height: '+Math.max(420,events.length*20)+'; } [','  |axis#timeline-date| "Date" { side: bottom; scale: time; }','  |axis#timeline-row| "Events" { side: left; range: 0 1; }','  |line#timeline-guide| "Timeline" { data: '+quote(first)+' 0.5, '+quote(last)+' 0.5; marker: none; }'];
 events.forEach((event,index)=>{
  const native=encodeId('event_',event.id),loc={id:native,slot:'mark#'+native},at=p('/events/'+index);
  lines.push('  |mark#'+native+'| '+quote(event.label)+' { at: '+quote(event.at)+' '+number(ys[index]!)+'; axis: timeline-date; }');
  identityMap.push({kind:'event',nativeId:native,visualId:event.id,path:at+'/id',sourcePath:loc.slot});
  coverage.push(...covers(at+'/id',['identity'],loc),...covers(at+'/label',['value'],loc),...covers(at+'/at',['value'],loc));
 });
 lines.push(']');coverage.push(...covers(p('/events'),['presence','order'],{id:chartId,slot:'chart#'+chartId+'/marks'}),...covers(p('/scale/kind'),['value'],{id:'timeline-date',slot:'axis#timeline-date/scale'}));
 return lines;
}

interface RoadmapPlacement {span:NonNullable<Timeline['spans']>[number];index:number;laneIndex:number;subrow:number;start:number;end:number;}
function assignSubrows(timeline:Timeline):{placements:RoadmapPlacement[];rows:number[]} {
 const lanes=timeline.lanes??[],periods=timeline.scale.kind==='period'?timeline.scale.periods:[],rows=lanes.map(()=>1),placements:RoadmapPlacement[]=[];
 for(const[index,span]of(timeline.spans??[]).entries()){
  const laneIndex=lanes.findIndex(item=>item.id===span.lane),start=periods.findIndex(item=>item.id===span.start),end=periods.findIndex(item=>item.id===span.end);
  if(laneIndex<0||start<0||end<start)continue;
  const occupied=placements.filter(item=>item.laneIndex===laneIndex);let subrow=0;
  while(occupied.some(item=>item.subrow===subrow&&start<=item.end&&end>=item.start))subrow++;
  rows[laneIndex]=Math.max(rows[laneIndex]??1,subrow+1);placements.push({span,index,laneIndex,subrow,start,end});
 }
 return{placements,rows};
}
function buildRoadmap(visual:Visual,timeline:Timeline,diagnostics:InterchangeDiagnostic[],identityMap:LiniTimelineIdentityMapping[],coverage:ProjectionCoverage[]):string[]{
 if(timeline.scale.kind!=='period')diagnostics.push(diagnostic('LINI_TIMELINE_SCALE',p('/scale'),'Roadmap profile requires an ordered period scale.','error',false));
 const periods=timeline.scale.kind==='period'?timeline.scale.periods:[],lanes=timeline.lanes??[],spans=timeline.spans??[];
 if(periods.length===0||lanes.length===0||spans.length===0)diagnostics.push(diagnostic('LINI_TIMELINE_SHAPE',ROOT,'Roadmap needs at least one period, lane, and span.','error',false));
 if(timeline.events!==undefined||timeline.markers!==undefined)diagnostics.push(diagnostic('LINI_TIMELINE_SHAPE',ROOT,'This roadmap profile supports spans only; events and markers are not mapped.','error',false));
 if(periods.length>100||lanes.length>100||spans.length>2000)diagnostics.push(diagnostic('LINI_TIMELINE_SIZE',ROOT,'Timeline exceeds the bounded Lini roadmap profile.','error',false));
 const checkUnique=(items:readonly {id:string;label:string}[],prefix:string)=>{const seen=new Set<string>();items.forEach((item,index)=>{const at=p(prefix+'/'+index);idCheck(item.id,at+'/id',diagnostics);if(seen.has(item.id))diagnostics.push(diagnostic('LINI_TIMELINE_ID',at+'/id','Roadmap IDs must be unique within their kind.','error',false));seen.add(item.id);textCheck(item.label,at+'/label',diagnostics,true);});};
 checkUnique(periods,'scale/periods');checkUnique(lanes,'lanes');
 for(const [kind,items] of [['period',periods],['lane',lanes],['span',spans]] as const)items.forEach((item,index)=>{const path='/'+(kind==='period'?'scale/periods':kind==='lane'?'lanes':'spans')+'/'+index+'/label';if(item.label.includes('\n'))diagnostics.push(diagnostic('LINI_TIMELINE_LINEBREAK',p(path),'Roadmap labels with authored line breaks are outside the qualified soft-wrap subset.','error',false));if(kind!=='span'&&longestRoadmapWord(item.label)>(kind==='period'?22:28))diagnostics.push(diagnostic('LINI_TIMELINE_LABEL_WIDTH',p(path),'A single roadmap word is wider than its guaranteed native grid column.','error',false));});
 const spanIds=new Set<string>();spans.forEach((span,index)=>{const at=p('/spans/'+index);idCheck(span.id,at+'/id',diagnostics);if(spanIds.has(span.id))diagnostics.push(diagnostic('LINI_TIMELINE_ID',at+'/id','Roadmap span IDs must be unique within their kind.','error',false));spanIds.add(span.id);textCheck(span.label,at+'/label',diagnostics,true);if(!lanes.some(lane=>lane.id===span.lane))diagnostics.push(diagnostic('LINI_TIMELINE_LANE',at+'/lane','Roadmap span must reference a declared lane.','error',false));const start=periods.findIndex(period=>period.id===span.start),end=periods.findIndex(period=>period.id===span.end);if(start<0||end<start)diagnostics.push(diagnostic('LINI_TIMELINE_PERIOD',at,'Span bounds must reference declared periods in forward order.','error',false));else if(longestRoadmapWord(span.label)>(end-start+1)*22)diagnostics.push(diagnostic('LINI_TIMELINE_LABEL_WIDTH',at+'/label','A roadmap label word exceeds the native width of its inclusive period span.','error',false));});
 encodeFields(diagnostics,spans,'span');
 if(visual.title!==undefined)textCheck(visual.title,VISUAL_PATH+'/title',diagnostics,true);
 if(visual.question!==undefined)textCheck(visual.question,VISUAL_PATH+'/question',diagnostics,true);
 if(diagnostics.some(d=>d.severity==='error'))return[];
 const groupId='timeline-roadmap',title=visual.title??visual.question,{placements,rows}=assignSubrows(timeline);let row=2;
 const laneRows=lanes.map((_,index)=>{const value=row;row+=rows[index]!;return value;});
 const lines=['|group#'+groupId+'| '+quote(title)+' { layout: grid; columns: 220, repeat('+periods.length+', 180); gap: 4; gap-fill: --gray-soft; padding: 12; } [','  |block#roadmap-header-lane| "Lane" { cell: 1 1; }'];
 periods.forEach((period,index)=>lines.push('  |block#'+encodeId('period_',period.id)+'| '+quote(wrapRoadmapLabel(period.label,22))+' { cell: '+(index+2)+' 1; }'));
 lanes.forEach((lane,index)=>{
  const native=encodeId('lane_',lane.id),at=p('/lanes/'+index),first=laneRows[index]!,height=rows[index]!;
  lines.push('  |block#'+native+'| '+quote(wrapRoadmapLabel(lane.label,28))+' { cell: 1 '+first+'; span: 1 '+height+'; }');identityMap.push({kind:'lane',nativeId:native,visualId:lane.id,path:at+'/id',sourcePath:'block#'+native});coverage.push(...covers(at+'/id',['identity'],{id:native,slot:'block#'+native}),...covers(at+'/label',['value'],{id:native,slot:'block#'+native}));
 });
 periods.forEach((period,index)=>{const native=encodeId('period_',period.id),at=p('/scale/periods/'+index);identityMap.push({kind:'period',nativeId:native,visualId:period.id,path:at+'/id',sourcePath:'block#'+native});coverage.push(...covers(at+'/id',['identity'],{id:native,slot:'block#'+native}),...covers(at+'/label',['value'],{id:native,slot:'block#'+native}));});
 for(const placement of placements){
  const {span,index,laneIndex,start,end,subrow}=placement,native=encodeId('span_',span.id),at=p('/spans/'+index),cellColumn=start+2,cellRow=laneRows[laneIndex]!+subrow,width=end-start+1;
  lines.push('  |block#'+native+'| '+quote(wrapRoadmapLabel(span.label,Math.max(12,width*22)))+' { cell: '+cellColumn+' '+cellRow+'; span: '+width+' 1; }');
  const loc={id:native,slot:'block#'+native};identityMap.push({kind:'span',nativeId:native,visualId:span.id,path:at+'/id',sourcePath:loc.slot});coverage.push(...covers(at+'/id',['identity'],loc),...covers(at+'/label',['value'],loc),...covers(at+'/start',['value'],loc),...covers(at+'/end',['value'],loc),...covers(at+'/lane',['value'],loc));
 }
 lines.push(']');coverage.push(...covers(p('/scale/periods'),['presence','order'],{id:groupId,slot:'group#'+groupId+'/period-headers'}),...covers(p('/lanes'),['presence','order'],{id:groupId,slot:'group#'+groupId+'/lane-headers'}),...covers(p('/spans'),['presence','order'],{id:groupId,slot:'group#'+groupId+'/span-blocks'}));
 return lines;
}

/** Serialize the exact event/date and period/lane timeline subsets. */
export function serializeLiniTimeline(visual:Visual):LiniTimelineSerializeResult {
 const diagnostics:InterchangeDiagnostic[]=[],identityMap:LiniTimelineIdentityMapping[]=[],coverage:ProjectionCoverage[]=[];
 if(visual.kind!=='timeline'||!['history','milestones','roadmap'].includes(visual.form)){diagnostics.push(diagnostic('LINI_TIMELINE_FORM',VISUAL_PATH+'/form','Lini timeline profile accepts history, milestones, and roadmap forms only.','error',false));return{statements:[],identityMap,coverage,diagnostics};}
 const timeline=visual.timeline;if(!timeline){diagnostics.push(diagnostic('LINI_TIMELINE_REQUIRED',ROOT,'Timeline content is required.','error',false));return{statements:[],identityMap,coverage,diagnostics};}
 const statements=visual.form==='roadmap'?buildRoadmap(visual,timeline,diagnostics,identityMap,coverage):buildHistory(visual,timeline,visual.form as 'history'|'milestones',diagnostics,identityMap,coverage);
 if(diagnostics.some(item=>item.severity==='error'))return{statements:[],identityMap:[],coverage:[],diagnostics};
 return{statements,identityMap,coverage,diagnostics};
}

function property(node:LiniProfileNode,name:string):LiniProfileToken[]|undefined{return node.properties.find(item=>item.name===name)?.value;}
function onlyProperties(node:LiniProfileNode,names:readonly string[],diagnostics:InterchangeDiagnostic[]):void{for(const item of node.properties)if(!names.includes(item.name))fail(diagnostics,'LINI_TIMELINE_PROPERTY','Unsupported native property '+JSON.stringify(item.name)+'.');}
function word(tokens:LiniProfileToken[]|undefined,value?:string):string|undefined{return tokens?.length===1&&tokens[0]!.kind==='word'&&(value===undefined||tokens[0]!.value===value)?tokens[0]!.value:undefined;}
function quoted(tokens:LiniProfileToken[]|undefined):string|undefined{return tokens?.length===1&&tokens[0]!.kind==='string'?tokens[0]!.value:undefined;}
function numeric(tokens:LiniProfileToken[]|undefined):number|undefined{if(tokens?.length!==1||tokens[0]!.kind!=='number')return;const value=Number(tokens[0]!.value);return finite(value)?value:undefined;}
function propertyPair(tokens:LiniProfileToken[]|undefined):[number,number]|undefined {if(!tokens||tokens.length!==2||tokens[0]!.kind!=='number'||tokens[1]!.kind!=='number')return;const a=Number(tokens[0]!.value),b=Number(tokens[1]!.value);return finite(a)&&finite(b)?[a,b]:undefined;}
function fail(diagnostics:InterchangeDiagnostic[],code:string,message:string){diagnostics.push(diagnostic(code,'/source',message,'error',false));}
function exactId(native:string,prefix:string):string|undefined{return decodeId(native,prefix);}
function parseHistory(nodes:LiniProfileNode[],form:LiniTimelineForm,diagnostics:InterchangeDiagnostic[],identityMap:LiniTimelineIdentityMapping[],coverage:ProjectionCoverage[]):Timeline|undefined {
 const id='timeline-'+form,chart=nodes.length===1&&nodes[0]!.type==='chart'&&nodes[0]!.id===id?nodes[0]:undefined;
 if(!chart){fail(diagnostics,'LINI_TIMELINE_SHAPE','Date timeline must contain exactly one declared native chart.');return;}
 onlyProperties(chart,['layout','width','height'],diagnostics);
 if(word(property(chart,'layout'))!=='chart'||numeric(property(chart,'width'))!==960||!numeric(property(chart,'height'))||numeric(property(chart,'height'))!<420||numeric(property(chart,'height'))!>40_000)fail(diagnostics,'LINI_TIMELINE_SHAPE','Date chart must use the bounded, declared native chart profile.');
 if(chart.label===undefined)fail(diagnostics,'LINI_TIMELINE_TITLE','Date timeline chart needs a visible title.');
 const axes=chart.children.filter(node=>node.type==='axis'),dateAxis=axes.find(node=>node.id==='timeline-date'),rowAxis=axes.find(node=>node.id==='timeline-row');
 if(axes.length!==2||!dateAxis||!rowAxis)fail(diagnostics,'LINI_TIMELINE_AXIS','Date timeline needs exactly one date axis and one stacking axis.');
 if(dateAxis){onlyProperties(dateAxis,['scale','side'],diagnostics);if(word(property(dateAxis,'scale'))!=='time'||word(property(dateAxis,'side'))!=='bottom')fail(diagnostics,'LINI_TIMELINE_AXIS','Date axis must be bottom-side native time scale.');}
 if(rowAxis){onlyProperties(rowAxis,['side','range'],diagnostics);if(word(property(rowAxis,'side'))!=='left'||propertyPair(property(rowAxis,'range'))?.join(' ')!=='0 1')fail(diagnostics,'LINI_TIMELINE_AXIS','Stacking axis must have the exact 0 to 1 range.');}
 const guides=chart.children.filter(node=>node.type==='line'),marks=chart.children.filter(node=>node.type==='mark');if(marks.length===0||guides.length!==1||guides[0]!.id!=='timeline-guide'||guides[0]!.label!=='Timeline'||chart.children.some(node=>node.type!=='axis'&&node.type!=='mark'&&node.type!=='line'))fail(diagnostics,'LINI_TIMELINE_SHAPE','Date chart supports its two axes, one timeline guide and event marks.');
 if(guides[0]){onlyProperties(guides[0],['data','marker'],diagnostics);const data=property(guides[0],'data');if(guides[0]!.label!=='Timeline'||data?.length!==5||data[0]!.kind!=='string'||data[1]!.kind!=='number'||data[2]!.kind!=='symbol'||data[2]!.value!==','||data[3]!.kind!=='string'||data[4]!.kind!=='number'||word(property(guides[0],'marker'))!=='none'||data[1]!.value!==data[4]!.value)fail(diagnostics,'LINI_TIMELINE_GUIDE','Timeline guide must be one unmarked horizontal native series.');}
 const ids=new Set<string>(),events:NonNullable<Timeline['events']>=[],ys=new Map<string,number[]>();
 for(const[index,mark]of marks.entries()){
  const visualId=exactId(mark.id,'event_'),label=mark.label,at=property(mark,'at'),axis=word(property(mark,'axis'));
  onlyProperties(mark,['at','axis'],diagnostics);
  if(!visualId||ids.has(visualId)||label===undefined||at?.length!==2||at[0]!.kind!=='string'||at[1]!.kind!=='number'||axis!=='timeline-date'){fail(diagnostics,'LINI_TIMELINE_EVENT','Event mark needs a reversible ID, exact label/date/stack slot, and date-axis binding.');continue;}
  ids.add(visualId);const date=at[0]!.value,y=Number(at[1]!.value);if(!validDate(date)||!finite(y)||y<=0||y>=1)fail(diagnostics,'LINI_TIMELINE_DATE','Event mark needs a full real date and interior stack coordinate.');
  const prior=ys.get(date)??[];if(prior.includes(y))fail(diagnostics,'LINI_TIMELINE_STACK','Events on one date must have distinct vertical slots.');prior.push(y);ys.set(date,prior);
  const path=p('/events/'+index),visibleLabel=nativeLabel(label,path+'/label',diagnostics),loc={id:mark.id,slot:'mark#'+mark.id};events.push({id:visualId,label:visibleLabel,at:date});identityMap.push({kind:'event',nativeId:mark.id,visualId,path:path+'/id',sourcePath:loc.slot});coverage.push(...covers(path+'/id',['identity'],loc),...covers(path+'/label',['value'],loc),...covers(path+'/at',['value'],loc));
 }
 if(guides[0]){const data=property(guides[0],'data'),dates=events.map(event=>event.at).sort();if(dates.length&&data?.[0]?.value!==dates[0]||dates.length&&data?.[3]?.value!==dates.at(-1))fail(diagnostics,'LINI_TIMELINE_GUIDE','Timeline guide must span the exact first and last event dates.');}
 if(diagnostics.some(item=>item.severity==='error'))return;
 coverage.push(...covers(p('/events'),['presence','order'],{id:chart.id,slot:'chart#'+chart.id+'/marks'}),...covers(p('/scale/kind'),['value'],{id:'timeline-date',slot:'axis#timeline-date/scale'}));
 return{scale:{kind:'date'},events};
}
function parseRoadmap(nodes:LiniProfileNode[],diagnostics:InterchangeDiagnostic[],identityMap:LiniTimelineIdentityMapping[],coverage:ProjectionCoverage[]):Timeline|undefined {
 const group=nodes.length===1&&nodes[0]!.type==='group'&&nodes[0]!.id==='timeline-roadmap'?nodes[0]:undefined;
 if(!group){fail(diagnostics,'LINI_TIMELINE_SHAPE','Roadmap must contain exactly one declared native grid group.');return;}
 onlyProperties(group,['layout','columns','gap','gap-fill','padding'],diagnostics);
 if(group.label===undefined)fail(diagnostics,'LINI_TIMELINE_TITLE','Roadmap grid needs a visible title.');
 if(word(property(group,'layout'))!=='grid')fail(diagnostics,'LINI_TIMELINE_LAYOUT','Roadmap must use the native grid layout.');
 const blockNodes=group.children.filter(node=>node.type==='block');if(blockNodes.length!==group.children.length)fail(diagnostics,'LINI_TIMELINE_SHAPE','Roadmap grid supports only identified blocks.');
 const cell=(node:LiniProfileNode)=>propertyPair(property(node,'cell')),span=(node:LiniProfileNode)=>propertyPair(property(node,'span'));
 const headers=blockNodes.filter(node=>node.id==='roadmap-header-lane');if(headers.length!==1||headers[0]?.label!=='Lane'||cell(headers[0]!)?.join(' ')!=='1 1')fail(diagnostics,'LINI_TIMELINE_HEADER','Roadmap needs the Lane header at grid cell 1,1.');if(headers[0])onlyProperties(headers[0],['cell'],diagnostics);
 const periodNodes=blockNodes.filter(node=>node.id.startsWith('period_')),periods:NonNullable<Extract<Timeline['scale'],{kind:'period'}>>['periods']=[],periodIds=new Set<string>();
 const columnTokens=property(group,'columns'),columnText=columnTokens?.map(token=>token.value).join(' ');
 if(columnText!=='220 , repeat ( '+periodNodes.length+' , 180 )'||numeric(property(group,'gap'))!==4||word(property(group,'gap-fill'))!=='--gray-soft'||numeric(property(group,'padding'))!==12)fail(diagnostics,'LINI_TIMELINE_LAYOUT','Roadmap grid column, spacing and fill properties must match the declared profile.');
 periodNodes.sort((a,b)=>(cell(a)?.[0]??0)-(cell(b)?.[0]??0));
 for(const[nodeIndex,node]of periodNodes.entries()){
  onlyProperties(node,['cell'],diagnostics);
  const id=exactId(node.id,'period_'),position=cell(node),label=node.label;if(!id||!position||position[0]!==nodeIndex+2||position[1]!==1||label===undefined||periodIds.has(id)){fail(diagnostics,'LINI_TIMELINE_PERIOD','Period headers need unique reversible IDs and contiguous native column positions.');continue;}
  periodIds.add(id);const path=p('/scale/periods/'+nodeIndex),visibleLabel=nativeLabel(unwrapRoadmapLabel(label),path+'/label',diagnostics);periods.push({id,label:visibleLabel});const loc={id:node.id,slot:'block#'+node.id};identityMap.push({kind:'period',nativeId:node.id,visualId:id,path:path+'/id',sourcePath:loc.slot});coverage.push(...covers(path+'/id',['identity'],loc),...covers(path+'/label',['value'],loc));
 }
 const laneNodes=blockNodes.filter(node=>node.id.startsWith('lane_')),lanes:NonNullable<Timeline['lanes']>=[],laneIds=new Set<string>(),laneRows=new Map<number,{id:string;start:number;end:number}>();
 laneNodes.sort((a,b)=>(cell(a)?.[1]??0)-(cell(b)?.[1]??0));
 for(const[nodeIndex,node]of laneNodes.entries()){
  onlyProperties(node,['cell','span'],diagnostics);
  const id=exactId(node.id,'lane_'),position=cell(node),height=span(node),label=node.label;if(!id||!position||position[0]!==1||position[1]!<2||!height||height[0]!==1||height[1]!<1||label===undefined||laneIds.has(id)){fail(diagnostics,'LINI_TIMELINE_LANE','Lane headings need unique IDs, labels, and vertical grid spans.');continue;}
  laneIds.add(id);const path=p('/lanes/'+nodeIndex),visibleLabel=nativeLabel(unwrapRoadmapLabel(label),path+'/label',diagnostics);lanes.push({id,label:visibleLabel});laneRows.set(position[1],{id,start:position[1],end:position[1]+height[1]-1});const loc={id:node.id,slot:'block#'+node.id};identityMap.push({kind:'lane',nativeId:node.id,visualId:id,path:path+'/id',sourcePath:loc.slot});coverage.push(...covers(path+'/id',['identity'],loc),...covers(path+'/label',['value'],loc));
 }
 const spanNodes=blockNodes.filter(node=>node.id.startsWith('span_')),spans:NonNullable<Timeline['spans']>=[],spanIds=new Set<string>(),periodCount=periods.length,occupied=new Map<string,Array<{start:number;end:number;row:number}>>();
 for(const[index,node]of spanNodes.entries()){
  onlyProperties(node,['cell','span'],diagnostics);
  const id=exactId(node.id,'span_'),position=cell(node),size=span(node),label=node.label;
  const laneEntry=[...laneRows.entries()].find(([,lane])=>position&&position[1]>=lane.start&&position[1]<=lane.end);
  const lane=laneEntry?.[1],start=position?position[0]-2:-1,end=size?start+size[0]-1:-1;
  if(!id||spanIds.has(id)||!position||!size||size[1]!==1||start<0||end<start||end>=periodCount||label===undefined||!lane){fail(diagnostics,'LINI_TIMELINE_SPAN','Span block needs a unique reversible ID, one-row grid placement within a declared lane and period range.');continue;}
  spanIds.add(id);const occurrences=occupied.get(lane.id)??[];if(occurrences.some(item=>start<=item.end&&end>=item.start&&position[1]===item.row))fail(diagnostics,'LINI_TIMELINE_OVERLAP','Overlapping spans must use distinct deterministic subrows.');occurrences.push({start,end,row:position[1]});occupied.set(lane.id,occurrences);
  const startPeriod=periods[start]?.id,endPeriod=periods[end]?.id;if(!startPeriod||!endPeriod)continue;
  const path=p('/spans/'+spans.length),visibleLabel=nativeLabel(unwrapRoadmapLabel(label),path+'/label',diagnostics);spans.push({id,label:visibleLabel,start:startPeriod,end:endPeriod,lane:lane.id});const loc={id:node.id,slot:'block#'+node.id};identityMap.push({kind:'span',nativeId:node.id,visualId:id,path:path+'/id',sourcePath:loc.slot});coverage.push(...covers(path+'/id',['identity'],loc),...covers(path+'/label',['value'],loc),...covers(path+'/start',['value'],loc),...covers(path+'/end',['value'],loc),...covers(path+'/lane',['value'],loc));
 }
 if(!periods.length||!lanes.length||!spans.length)fail(diagnostics,'LINI_TIMELINE_CONTENT','Roadmap must have at least one period, lane, and span.');
 if(blockNodes.some(node=>node.id!=='roadmap-header-lane'&&!node.id.startsWith('period_')&&!node.id.startsWith('lane_')&&!node.id.startsWith('span_')))fail(diagnostics,'LINI_TIMELINE_BLOCK','Roadmap contains an unrecognized native block identity.');
 if(diagnostics.some(item=>item.severity==='error'))return;
 coverage.push(...covers(p('/scale/kind'),['value'],{id:group.id,slot:'group#'+group.id+'/period-grid'}),...covers(p('/scale/periods'),['presence','order'],{id:group.id,slot:'group#'+group.id+'/period-headers'}),...covers(p('/lanes'),['presence','order'],{id:group.id,slot:'group#'+group.id+'/lane-headers'}),...covers(p('/spans'),['presence','order'],{id:group.id,slot:'group#'+group.id+'/span-blocks'}));
 return{scale:{kind:'period',periods},lanes,spans};
}

/** Read only native timeline profile constructs; application annotations remain external to the native timeline. */
export function parseLiniTimeline(nodes:LiniProfileNode[],form:LiniTimelineForm):LiniTimelineParseResult {
 const diagnostics:InterchangeDiagnostic[]=[],identityMap:LiniTimelineIdentityMapping[]=[],coverage:ProjectionCoverage[]=[];
 if(!['history','milestones','roadmap'].includes(form)){fail(diagnostics,'LINI_TIMELINE_FORM','Unsupported timeline form.');return{identityMap,coverage,diagnostics};}
 const timeline=form==='roadmap'?parseRoadmap(nodes,diagnostics,identityMap,coverage):parseHistory(nodes,form as 'history'|'milestones',diagnostics,identityMap,coverage);
 if(!timeline||diagnostics.some(item=>item.severity==='error'))return{identityMap,coverage:[],diagnostics};
 return{timeline,identityMap,coverage,diagnostics};
}
