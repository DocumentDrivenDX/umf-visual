// SPDX-License-Identifier: MIT OR Apache-2.0
/** Native positioned composition for flat Lini sequences with labels taller than one line. */
import type {Visual,VisualGroup,VisualParticipant} from '../extensions/visual';
import {quoteLiniProfile} from '../interchange/lini/profile-syntax';
import type {PresentationApproximation,PresentationElement,PresentationOmission,PresentationPlan} from './index';
import {liniShapeDefinition} from './lini-shapes';
import {liniNativeIcon} from './lini-native-icons';
import {liniSequenceParticipantFieldText,wrapLiniSequenceText} from './lini-sequence-text';

const base='/extensions/umf.visual';
const path=(suffix:string)=>base+(suffix.startsWith('/')?suffix:'/'+suffix);
const quote=quoteLiniProfile;
const quoteText=(text:string,sourcePath:string)=>{try{return quote(text);}catch(reason){throw Object.assign(new Error(reason instanceof Error?reason.message:'Text cannot be encoded by Lini.'),{sourcePath});}};
function messageLines(text:string,maxWidth:number,fontSize=14):string[]{
 const width=(value:string)=>Array.from(value).reduce((sum,char)=>sum+fontSize*(char===' '?0.28:/[ilI.,'`|]/u.test(char)?0.3:/[MW@#%&]/u.test(char)?0.85:0.56),0),lines:string[]=[];
 for(const paragraph of text.split('\n')){let line='';for(const word of paragraph.split(/\s+/u).filter(Boolean)){const next=line?line+' '+word:word;if(line&&width(next)>maxWidth){lines.push(line);line=word;}else line=next;}lines.push(line);}
 return lines;
}

function compileEnhancedFlatSequence(visual:Visual,sequence:NonNullable<Visual['sequence']>):PresentationPlan|undefined{
 const participants=sequence.participants,messages=sequence.messages,groups=visual.groups??[],notes=sequence.notes??[];
 const participantIndex=new Map(participants.map((participant,index)=>[participant.id,index]));
 if(participants.length<2||!messages.length||participants.some(participant=>!liniShapeDefinition(participant.shape??'rounded-rectangle','sequence'))||messages.some(message=>message.kind==='note'||message.kind!==undefined&&!['call','return','async'].includes(message.kind)))return undefined;
 if(messages.some(message=>!participantIndex.has(message.from)||!participantIndex.has(message.to)))return undefined;
 if(groups.some(group=>group.role!=='loop'||group.parent!==undefined))return undefined;
 if(messages.some(message=>message.group!==undefined&&!groups.some(group=>group.id===message.group)))return undefined;
 for(const note of notes)if(!note.before&&!note.after||note.before&&!messages.some(message=>message.id===note.before)||note.after&&!messages.some(message=>message.id===note.after)||note.participants.some(id=>!participantIndex.has(id)))return undefined;

 const intervals:Array<{group:VisualGroup;index:number;first:number;last:number;memberIndexes:number[]}>=[];
 for(const [index,group]of groups.entries()){
  const memberIndexes=messages.flatMap((message,messageIndex)=>message.group===group.id?[messageIndex]:[]);
  if(!memberIndexes.length||memberIndexes.some((value,i)=>i>0&&value!==memberIndexes[i-1]!+1))return undefined;
  intervals.push({group,index,first:memberIndexes[0]!,last:memberIndexes.at(-1)!,memberIndexes});
 }
 for(let left=0;left<intervals.length;left++)for(let right=left+1;right<intervals.length;right++){
  const a=intervals[left]!,b=intervals[right]!,overlap=a.first<=b.last&&b.first<=a.last;
  if(overlap)return undefined;
 }

 const participantWidth=200,participantGap=20,columnStep=participantWidth+participantGap,titleWidth=1200;
 const wrappedMessages=messages.map(message=>messageLines(message.label,160)),captionHeights=wrappedMessages.map(lines=>Math.max(20,lines.length*18+4));
 const hasSelfCall=messages.some(message=>message.from===message.to),selfCallWidth=80,selfCallHeight=36,noteHeight=40,noteGap=12,loopHeaderHeight=34;
 const noteBefore=messages.map(message=>notes.filter(note=>note.before===message.id).length);
 const notesAfter=messages.map(message=>notes.filter(note=>note.after===message.id).length);
 const groupsStarting=messages.map(message=>intervals.filter(interval=>interval.first===messages.indexOf(message)).length);
 const groupsEnding=messages.map(message=>intervals.filter(interval=>interval.last===messages.indexOf(message)).length);
 const rowOffsets:number[]=[groupsStarting[0]!*loopHeaderHeight];
 for(let index=1;index<messages.length;index++){
  const previous=messages[index-1]!,current=messages[index]!;
  const captionGap=Math.ceil(captionHeights[index-1]!/2+captionHeights[index]!/2+28);
  const selfGap=previous.from===previous.to?selfCallHeight+Math.ceil(captionHeights[index-1]!/2+captionHeights[index]!/2+28):0;
  const annotationGap=(notesAfter[index-1]!+noteBefore[index]!)*(noteHeight+noteGap);
  const groupGap=(groupsStarting[index]!+groupsEnding[index-1]!)*loopHeaderHeight;
  rowOffsets.push(rowOffsets[index-1]!+Math.max(captionGap,selfGap)+annotationGap+groupGap);
 }
 const rowSpan=rowOffsets.at(-1)??0;
 const participantHeaderLines=(participant:VisualParticipant)=>{const shape=liniShapeDefinition(participant.shape??'rounded-rectangle','sequence')!;return [...wrapLiniSequenceText(participant.label,23),...(shape.caption?wrapLiniSequenceText(shape.caption,23):[])];};
 const participantHeaderHeight=(participant:VisualParticipant)=>Math.max(48,participantHeaderLines(participant).length*20+16);
 const participantFieldLines=(participant:VisualParticipant)=>['detail','role','status'].flatMap(field=>{const value=participant[field as 'detail'|'role'|'status'];return value===undefined?[]:[wrapLiniSequenceText(liniSequenceParticipantFieldText(field as 'detail'|'role'|'status',value),25)];});
 const participantIcon=(participant:VisualParticipant)=>participant.icon??(participant.role==='actor'?'user':undefined);
 const participantHeight=(participant:VisualParticipant)=>participantHeaderHeight(participant)+12+participantFieldLines(participant).reduce((sum,fieldLines)=>sum+fieldLines.length*18+8,0)+(participantIcon(participant)?26:0);
 // Native box stencils apply intrinsic padding beyond the declared height.
 // Give generated shape-caption headers a larger owner inset so the actual
 // native text/shape extents remain inside their participant group.
 const participantOwnerExtra=(participant:VisualParticipant)=>liniShapeDefinition(participant.shape??'rounded-rectangle','sequence')!.caption?32:16;
 const maxParticipantBottom=Math.max(...participants.map(participant=>participantHeight(participant)+participantOwnerExtra(participant)/2));
 const noteTail=notes.some(note=>note.after===messages.at(-1)?.id)?noteHeight+noteGap:0;
 const height=Math.max(900,maxParticipantBottom+252+rowSpan+noteTail);
 const width=participants.length*participantWidth+(participants.length-1)*participantGap+80;
 const firstX=-((participants.length-1)*columnStep)/2,participantX=(index:number)=>firstX+index*columnStep;
 const title=visual.title??visual.question,titlePath=path(visual.title?'/title':'/question');quoteText(title,titlePath);
 const titleLines=wrapLiniSequenceText(title,96),titleHeight=Math.max(28,titleLines.length*25+4),titleY=-height/2+titleHeight/2+20,participantTop=-height/2+titleHeight+57;
 // Leave a full participant-owner gap before the first note/caption row; this
 // includes the icon tail and any wrapped role/detail/status carriers.
 const firstMessageY=participantTop+maxParticipantBottom+86,rowY=(index:number)=>firstMessageY+rowOffsets[index]!;
 const messageBottom=messages.reduce((bottom,message,index)=>Math.max(bottom,rowY(index)+(message.from===message.to?selfCallHeight:0)+(captionHeights[index]!/2+14)+(notesAfter[index]!>0?noteHeight+noteGap:0)),firstMessageY);
 const bottom=messageBottom+40,canvasHeight=Math.max(height,Math.ceil(bottom*2+40));
 const maps:PresentationElement[]=[{logicalId:visual.id,sourcePath:path('/id'),nativeId:'visual-title',kind:'visual'}],omissions:PresentationOmission[]=[],approximations:PresentationApproximation[]=[];
 const add=(logicalId:string,sourcePath:string,nativeId:string,kind:PresentationElement['kind'])=>maps.push({logicalId,sourcePath,nativeId,kind});
 const lines:string[]=[
  `{ --lini-font-family: Arial;\n  .lini-block { font-family: Arial; }\n  .lini-text { font-family: Arial; }\n  .lini-line { stroke: --gray-deep; stroke-width: 2; }\n}`,
  `|drawing#sequence-drawing| "" { scale: 0.25; clearance: 12; } [`,
  `  |rect| "" { width: ${width}; height: ${canvasHeight}; fill: none; stroke: none; }`,
  `  |rect#visual-title| ${quote(titleLines.join('\n'))} { pin: center; translate: 0 ${titleY}; width: ${Math.min(width-80,titleWidth)}; height: ${titleHeight}; fill: none; stroke: none; font-size: 22; font-weight: bold; color: --blue-deep; }`,
 ];
 // Loop frames are drawn before their member arrows so the native arrows and captions stay legible above the wash.
 for(const interval of intervals){
  const memberEnds=interval.memberIndexes.flatMap(index=>[participantIndex.get(messages[index]!.from)!,participantIndex.get(messages[index]!.to)!]),left=Math.min(...memberEnds.map(participantX))-24,right=Math.max(...memberEnds.map(participantX))+24,top=rowY(interval.first)-captionHeights[interval.first]!/2-12-loopHeaderHeight,bottomFrame=rowY(interval.last)+(messages[interval.last]!.from===messages[interval.last]!.to?selfCallHeight:0)+18,frameId='f'+(interval.index+1),frameX=(left+right)/2,frameY=(top+bottomFrame)/2,frameWidth=right-left,frameHeight=bottomFrame-top,headerText='loop ['+interval.group.label+']',headerWidth=Math.max(100,Math.min(frameWidth-16,messageLines(headerText,frameWidth-24).reduce((sum,line)=>sum+line.length*8,0)+16));
  add(interval.group.id,path('/groups/'+interval.index+'/id'),frameId,'group');quoteText(interval.group.label,path('/groups/'+interval.index+'/label'));
  lines.push(`  |rect#${frameId}| "" { pin: center; translate: ${frameX} ${frameY}; width: ${frameWidth}; height: ${frameHeight}; fill: none; stroke: --purple-deep; stroke-style: dashed; stroke-width: 1; }`);
  lines.push(`  |rect#${frameId}-header| ${quoteText(headerText,path('/groups/'+interval.index+'/label'))} { pin: center; translate: ${left+headerWidth/2+8} ${top+loopHeaderHeight/2}; width: ${headerWidth}; height: ${loopHeaderHeight}; fill: --fill; stroke: none; color: --gray-deep; font-size: 12; font-weight: 600; }`);
  for(const field of ['detail','status','emphasis'] as const)if(interval.group[field]!==undefined)omissions.push({sourcePath:path('/groups/'+interval.index+'/'+field),reason:'Retained in UMF; this native loop frame represents only the authored contiguous message interval and label.'});
 }
 for(const [index,participant]of participants.entries()){
  const nativeId='p'+(index+1),x=participantX(index),style=participant.role==='actor'?'--rose-deep':participant.role==='own'?'--teal-deep':participant.role==='platform'?'--sky-deep':participant.role==='external'?'--gray-deep':participant.role==='store'?'--blue-deep':participant.role==='document'?'--purple-deep':participant.role==='process'?'--rose-deep':'--blue-deep',shape=liniShapeDefinition(participant.shape??'rounded-rectangle','sequence')!,headerHeight=participantHeaderHeight(participant),cardHeight=participantHeight(participant),ownerY=participantTop+cardHeight/2;
  add(participant.id,path('/sequence/participants/'+index+'/id'),nativeId,'participant');
  const fields:Array<{field:'detail'|'role'|'status';lines:string[];sourcePath:string}>=[];
  for(const field of ['detail','role','status'] as const){const value=participant[field];if(value===undefined)continue;const fieldId=nativeId+'-'+field,fieldPath=path('/sequence/participants/'+index+'/'+field);quoteText(value,fieldPath);const fieldLines=wrapLiniSequenceText(liniSequenceParticipantFieldText(field,value),25);add(participant.id,fieldPath,fieldId,'participant-field');fields.push({field,lines:fieldLines,sourcePath:fieldPath});}
  const requestedIcon=participantIcon(participant),supportedIcon=requestedIcon?liniNativeIcon(requestedIcon):undefined;
  const ownerHeight=cardHeight+participantOwnerExtra(participant);
  // The pinned `multiple: 2` box stencil paints its backing sheet 2 native
  // units to the right. Reserve symmetric owner space around that real paint.
  const ownerWidth=participantWidth+(shape.properties.some(property=>/^multiple:\s*\d+;$/u.test(property))?8:0);
  lines.push(`  |group#${nativeId}-owner| "" { pin: center; translate: ${x} ${ownerY}; layout: flow; direction: column; gap: 0; padding: 0; width: ${ownerWidth}; height: ${ownerHeight}; fill: none; stroke: none; stroke-width: 0; } [`);
  const headerLines=participantHeaderLines(participant),headerY=-cardHeight/2+headerHeight/2,selector=shape.type;
  // The pinned native slant stencil's polygon spans 1.075× its declared
  // width. Fit that actual polygon inside the participant owner carrier.
  const headerWidth=shape.type==='slant'?Math.floor(participantWidth/1.075):participantWidth;
  quoteText(participant.label,path('/sequence/participants/'+index+'/label'));
  lines.push(`    |${selector}#${nativeId}| ${quoteText(headerLines.join('\n'),path('/sequence/participants/'+index+'/label'))} { pin: center; translate: 0 ${headerY}; width: ${headerWidth}; height: ${headerHeight}; fill: ${style==='--blue-deep'?'--blue-wash':style.replace('-deep','-wash')}; stroke: ${style}; color: --gray-deep; font-size: 16;${shape.properties.length?' '+shape.properties.join(' '):''} }`);
  if(shape.approximation)approximations.push({sourcePath:path('/sequence/participants/'+index+'/shape'),requested:'Participant shape '+participant.shape,representation:shape.approximation});
  if(participant.role==='process')approximations.push({sourcePath:path('/sequence/participants/'+index+'/role'),requested:'Participant role process',representation:'The visible Process caption denotes a depicted process/activity, not an operating-system process or executable.'});
  let fieldY=-cardHeight/2+headerHeight+12;
  for(const {field,lines:fieldLines} of fields){const fieldHeight=fieldLines.length*18;lines.push(`    |rect#${nativeId}-${field}| ${quote(fieldLines.join('\n'))} { pin: center; translate: 0 ${fieldY+fieldHeight/2}; width: ${participantWidth-8}; height: ${fieldHeight}; fill: none; stroke: none; color: --gray-deep; font-size: 14; }`);fieldY+=fieldHeight+8;}
  if(supportedIcon){if(participant.icon!==undefined)add(participant.id,path('/sequence/participants/'+index+'/icon'),nativeId+'-icon','participant-field');lines.push(`    |icon#${nativeId}-icon| { symbol: ${supportedIcon}; pin: center; translate: 0 ${fieldY+9}; width: 18; height: 18; fill: none; stroke: ${style}; }`);fieldY+=26;}
  else if(requestedIcon){const iconPath=path('/sequence/participants/'+index+'/icon');add(participant.id,iconPath,nativeId+'-icon','participant-field');lines.push(`    |rect#${nativeId}-icon| ${quoteText('Icon: '+requestedIcon,iconPath)} { pin: center; translate: 0 ${fieldY+9}; width: ${participantWidth-8}; height: 18; fill: none; stroke: none; color: --gray-deep; font-size: 12; }`);fieldY+=26;approximations.push({sourcePath:iconPath,requested:'Icon '+requestedIcon,representation:'The symbol name is preserved as a visible text caption because it is outside the pinned Lini Phosphor symbol subset.'});}
  lines.push('  ]');
  const lifeId=nativeId+'-lifeline';add(participant.id,path('/sequence/participants/'+index+'/id'),lifeId,'participant-lifeline');
  const lifeStart=ownerY+ownerHeight/2,lifeLength=bottom-lifeStart;
  lines.push(`  |line#${lifeId}| "" { pin: none; translate: ${x} ${lifeStart}; points: 0 0, 0 ${lifeLength}; marker: none; stroke: ${style}; stroke-width: 1.5; }`);
  for(const field of ['evidence','emphasis'] as const)if(participant[field]!==undefined)omissions.push({sourcePath:path('/sequence/participants/'+index+'/'+field),reason:'Retained in UMF; this flat native sequence composition does not draw participant evidence or emphasis.'});
 }
 for(const [index,note]of notes.entries()){
  const anchorId=note.before??note.after!,anchorIndex=messages.findIndex(message=>message.id===anchorId),noteId='n'+(index+1),notePath=path('/sequence/notes/'+index),anchorXs=note.participants.map(id=>participantX(participantIndex.get(id)!)),x=anchorXs.reduce((sum,value)=>sum+value,0)/anchorXs.length,before=note.before!==undefined,captionHalf=captionHeights[anchorIndex]!/2,cy=before?rowY(anchorIndex)-captionHalf-10-noteHeight/2-20:rowY(anchorIndex)+10+noteHeight/2,widthNote=Math.max(160,Math.min(participantWidth,Array.from(note.text).length*8+28));
  add(note.id,path('/sequence/notes/'+index+'/id'),noteId,'note');quoteText(note.text,notePath+'/text');
  lines.push(`  |note#${noteId}| ${quoteText(wrapLiniSequenceText(note.text,22).join('\n'),notePath+'/text')} { pin: center; translate: ${x} ${cy}; width: ${widthNote}; height: ${noteHeight}; fill: --fill; stroke: --gray-deep; color: --gray-deep; font-size: 13; }`);
 }
 for(const [index,message]of messages.entries()){
  const nativeId='message'+(index+1),captionId='message-caption'+(index+1),messagePath=path('/sequence/messages/'+index),from=participantIndex.get(message.from)!,to=participantIndex.get(message.to)!,sourceX=participantX(from),targetX=participantX(to),isSelfCall=from===to,step=Math.sign(to-from),nextIndex=isSelfCall?(from<participants.length-1?from+1:from-1):from+step,captionX=(sourceX+participantX(nextIndex))/2,wrapped=wrappedMessages[index]!,row=rowY(index),captionHeight=captionHeights[index]!,captionY=row-(captionHeight/2+(isSelfCall?10:10)),delta=targetX-sourceX;
  add(message.id,messagePath+'/id',nativeId,'message');add(message.id,messagePath+'/label',captionId,'message-caption');quoteText(message.label,messagePath+'/label');
  for(const field of ['status','emphasis','evidence'] as const)if(message[field]!==undefined)omissions.push({sourcePath:messagePath+'/'+field,reason:'Retained in UMF; this flat native sequence composition does not style message metadata.'});
  if(isSelfCall){const excursion=from<participants.length-1?selfCallWidth:-selfCallWidth;lines.push(`  |line#${nativeId}| "" { pin: none; translate: ${sourceX} ${row}; points: 0 0, ${excursion} 0, ${excursion} ${selfCallHeight}, 0 ${selfCallHeight}; marker-end: arrow; stroke: --gray-deep; stroke-width: 2;${message.kind==='return'?' stroke-style: dashed;':''} }`);}
  else if(message.kind==='async'){
   const direction=Math.sign(delta),length=Math.abs(delta),amplitude=3,segmentCount=Math.max(4,Math.floor(length/16)),points=Array.from({length:segmentCount+1},(_,pointIndex)=>{const local=length*pointIndex/segmentCount,x=direction*local,y=pointIndex===0||pointIndex===segmentCount?0:(pointIndex%2===0?amplitude:-amplitude);return`${x} ${y}`;}).join(', ');
   lines.push(`  |line#${nativeId}| "" { pin: none; translate: ${sourceX} ${row}; points: ${points}; marker-end: arrow; stroke: --gray-deep; stroke-width: 2; }`);
  }
  else lines.push(`  |line#${nativeId}| "" { pin: none; translate: ${sourceX} ${row}; points: 0 0, ${delta} 0; marker-end: arrow; stroke: --gray-deep; stroke-width: 2;${message.kind==='return'?' stroke-style: dashed;':''} }`);
  const labelPath=messagePath+'/label';
  lines.push(`  |rect#${captionId}| ${quote(wrapped.join('\n'))} { pin: center; translate: ${captionX} ${captionY}; width: 160; height: ${captionHeight}; fill: none; stroke: none; color: --gray-deep; font-size: 14; }`);
 }
 if(visual.title&&visual.title!==visual.question)omissions.push({sourcePath:path('/question'),reason:'The concise title is visible in the native sequence drawing; the reader question remains in UMF.'});
 if(visual.form==='ladder')approximations.push({sourcePath:path('/form'),requested:'Sequence ladder form',representation:'Pinned Lini presents the unchanged participants across the top and messages down a native lifeline sequence. This is a disclosed lifelines adaptation, not a narrow-screen ladder layout.'});
 for(const field of ['takeaway','source','audience','steps','edges','nodes','structure','omissions'] as const)if(visual[field]!==undefined)omissions.push({sourcePath:path('/'+field),reason:field==='steps'?'Walkthrough step titles and focus IDs remain in UMF; the static sequence drawing does not imply animation or timing.':'Retained in UMF; not part of this native Lini sequence composition.'});
 approximations.push({sourcePath:path('/sequence/messages'),requested:'Readable flat Lini sequence with separate captions',representation:'Pinned Lini fixes sequence labels at arrow midpoints, so this native drawing composition uses source-indexed participant lifelines, call/return/async message paths, and separate owned caption carriers. Rows follow authored message order; their spacing carries no elapsed-time, duration, or concurrency meaning.'});
 lines.push(']');
 return{ok:true,profileId:'umf.visual.presentation/1',backend:'lini',nativeFormat:'lini',source:lines.join('\n')+'\n',elementMap:maps,omissions,approximations};
}

/** Return a plan only for flat rectangular sequences supported by native primitives. */
export function compileLiniFlatSequence(visual:Visual):PresentationPlan|undefined{
 const sequence=visual.kind==='sequence'?visual.sequence:undefined;
 if(!sequence||(visual.form!=='lifelines'&&visual.form!=='ladder'))return undefined;
 // The positioned composition does not implement authored root/group layouts
 // or standalone annotations. The public sequence compiler reports a located
 // scope failure for these before this helper can be selected.
 if(visual.layout!==undefined||(visual.annotations?.length??0)>0||(visual.groups??[]).some(group=>group.layout!==undefined))return undefined;
 const needsEnhanced=visual.form==='ladder'||(visual.groups?.length??0)>0||(sequence.notes?.length??0)>0||sequence.messages.some(message=>message.kind==='async')||sequence.participants.some(participant=>participant.icon!==undefined||participant.shape!==undefined&&!['rectangle','rounded-rectangle'].includes(participant.shape));
 if(needsEnhanced){
  const anchoredNotes=sequence.notes??[];
  const anchors=anchoredNotes.map(note=>note.before??note.after).filter((id):id is string=>id!==undefined);
  // A single note above or below a row has a source-derived slot. Multiple
  // notes at one anchor need an explicit stacked-note geometry policy.
  if(new Set(anchors).size!==anchors.length)return undefined;
  return compileEnhancedFlatSequence(visual,sequence);
 }
 if(!sequence||visual.form!=='lifelines'||visual.layout!==undefined||(visual.annotations?.length??0)>0||sequence.participants.length<2||!sequence.messages.length||(visual.groups?.length??0)>0||(sequence.notes?.length??0)>0)return undefined;
 if(sequence.participants.some(participant=>participant.shape!==undefined&&participant.shape!=='rectangle'&&participant.shape!=='rounded-rectangle'))return undefined;
 if(sequence.messages.some(message=>message.kind!==undefined&&message.kind!=='call'&&message.kind!=='return'))return undefined;
 const participants=sequence.participants,messages=sequence.messages,participantIndex=new Map(participants.map((participant,index)=>[participant.id,index]));
 if(messages.some(message=>!participantIndex.has(message.from)||!participantIndex.has(message.to)))return undefined;
 const participantWidth=200,participantGap=20,columnStep=participantWidth+participantGap,titleWidth=1200;
 const wrappedMessages=messages.map(message=>messageLines(message.label,160));
 const maxLines=Math.max(1,...wrappedMessages.map(lines=>lines.length)),rowGap=maxLines*18+34;
 const hasSelfCall=messages.some(message=>message.from===message.to),selfCallWidth=80,selfCallHeight=36;
 const captionHeights=wrappedMessages.map(lines=>Math.max(20,lines.length*18+4));
 const rowOffsets:number[]=[0];
 if(hasSelfCall)for(let index=1;index<messages.length;index++){
  const previous=messages[index-1]!,previousLoop=previous.from===previous.to?selfCallHeight:0;
  rowOffsets.push(rowOffsets[index-1]!+previousLoop+Math.ceil(captionHeights[index-1]!/2+captionHeights[index]!/2+28));
 }
 else for(let index=1;index<messages.length;index++)rowOffsets.push(index*rowGap);
 const rowSpan=rowOffsets.at(-1)??0;
 const width=participants.length*participantWidth+(participants.length-1)*participantGap+80;
 const participantHeaderLines=(participant:typeof participants[number])=>wrapLiniSequenceText(participant.label,23);
 const participantHeaderHeight=(participant:typeof participants[number])=>Math.max(48,participantHeaderLines(participant).length*20+16);
 const participantFieldLines=(participant:typeof participants[number])=>['detail','role','status'].flatMap(field=>{const value=participant[field as 'detail'|'role'|'status'];return value===undefined?[]:[wrapLiniSequenceText(liniSequenceParticipantFieldText(field as 'detail'|'role'|'status',value),25)];});
 const participantHasIcon=(participant:typeof participants[number])=>participant.icon!==undefined;
 const participantHeight=(participant:typeof participants[number])=>participantHeaderHeight(participant)+12+participantFieldLines(participant).reduce((sum,fieldLines)=>sum+fieldLines.length*18+8,0)+(participantHasIcon(participant)?26:0);
 const maxParticipantHeight=Math.max(...participants.map(participantHeight));
 const height=Math.max(900,maxParticipantHeight+260+(hasSelfCall?rowSpan:(messages.length-1)*rowGap));
 const firstX=-((participants.length-1)*columnStep)/2,participantX=(index:number)=>firstX+index*columnStep;
 const title=visual.title??visual.question,titlePath=path(visual.title?'/title':'/question');
 // Validate the authored text before display wrapping so diagnostics still
 // identify invalid characters at their original source pointer.
 quoteText(title,titlePath);
 const titleLines=wrapLiniSequenceText(title,96),titleHeight=Math.max(28,titleLines.length*25+4),titleY=-height/2+titleHeight/2+20,participantTop=-height/2+titleHeight+57;
 const firstMessageY=participantTop+maxParticipantHeight+70;
 const rowY=(index:number)=>firstMessageY+rowOffsets[index]!;
 const bottom=rowY(messages.length-1)+40;
 const canvasHeight=Math.max(height,Math.ceil(bottom*2+40));
 const maps:PresentationElement[]=[{logicalId:visual.id,sourcePath:path('/id'),nativeId:'visual-title',kind:'visual'}];
 const omissions:PresentationOmission[]=[],approximations:PresentationApproximation[]=[];
 const add=(logicalId:string,sourcePath:string,nativeId:string,kind:PresentationElement['kind'])=>maps.push({logicalId,sourcePath,nativeId,kind});
 const lines:string[]=[
  `{ --lini-font-family: Arial;\n  .lini-block { font-family: Arial; }\n  .lini-text { font-family: Arial; }\n  .lini-line { stroke: --gray-deep; stroke-width: 2; }\n}`,
  `|drawing#sequence-drawing| "" { scale: 0.25; clearance: 12; } [`,
  `  |rect| "" { width: ${width}; height: ${canvasHeight}; fill: none; stroke: none; }`,
  `  |rect#visual-title| ${quote(titleLines.join('\n'))} { pin: center; translate: 0 ${titleY}; width: ${Math.min(width-80,titleWidth)}; height: ${titleHeight}; fill: none; stroke: none; font-size: 22; font-weight: bold; color: --blue-deep; }`,
 ];
 for(const [index,participant]of participants.entries()){
  const nativeId='p'+(index+1),x=participantX(index),style=participant.role==='actor'?'--rose-deep':participant.role==='own'?'--teal-deep':participant.role==='platform'?'--sky-deep':participant.role==='external'?'--gray-deep':participant.role==='store'?'--blue-deep':participant.role==='document'?'--purple-deep':'--blue-deep',headerHeight=participantHeaderHeight(participant),cardHeight=participantHeight(participant),ownerY=participantTop+cardHeight/2;
  add(participant.id,path('/sequence/participants/'+index+'/id'),nativeId,'participant');
  const fields:Array<{field:'detail'|'role'|'status';lines:string[]}>=[];
  for(const field of ['detail','role','status'] as const){const value=participant[field];if(value===undefined)continue;const fieldId=nativeId+'-'+field,fieldPath=path('/sequence/participants/'+index+'/'+field);quoteText(value,fieldPath);const fieldLines=wrapLiniSequenceText(liniSequenceParticipantFieldText(field,value),25);add(participant.id,fieldPath,fieldId,'participant-field');fields.push({field,lines:fieldLines});}
  const requestedIcon=participant.icon;
  lines.push(`  |group#${nativeId}-owner| "" { pin: center; translate: ${x} ${ownerY}; layout: flow; direction: column; gap: 0; padding: 0; width: ${participantWidth}; height: ${cardHeight+16}; fill: none; stroke: none; stroke-width: 0; } [`);
  const headerLines=participantHeaderLines(participant),headerY=-cardHeight/2+headerHeight/2;
  const participantSelector=participant.shape==='rectangle'?'rect':'box';
  quoteText(participant.label,path('/sequence/participants/'+index+'/label'));
  lines.push(`    |${participantSelector}#${nativeId}| ${quoteText(headerLines.join('\n'),path('/sequence/participants/'+index+'/label'))} { pin: center; translate: 0 ${headerY}; width: ${participantWidth}; height: ${headerHeight}; fill: ${style==='--blue-deep'?'--blue-wash':style.replace('-deep','-wash')}; stroke: ${style}; color: --gray-deep; font-size: 16; }`);
  if(participant.shape==='rounded-rectangle')approximations.push({sourcePath:path('/sequence/participants/'+index+'/shape'),requested:'Rounded rectangle participant shape',representation:'The pinned Lini native participant box uses its fixed 8-unit corner radius.'});
  if(participant.role==='process')approximations.push({sourcePath:path('/sequence/participants/'+index+'/role'),requested:'Participant role process',representation:'The visible Process caption denotes a depicted process/activity, not an operating-system process or executable.'});
  let fieldY=-cardHeight/2+headerHeight+12;
  for(const {field,lines:fieldLines} of fields){const fieldId=nativeId+'-'+field,fieldHeight=fieldLines.length*18;lines.push(`    |rect#${fieldId}| ${quote(fieldLines.join('\n'))} { pin: center; translate: 0 ${fieldY+fieldHeight/2}; width: ${participantWidth-8}; height: ${fieldHeight}; fill: none; stroke: none; color: --gray-deep; font-size: 14; }`);fieldY+=fieldHeight+8;}
  if(requestedIcon){const iconId=nativeId+'-icon',iconPath=path('/sequence/participants/'+index+'/icon');add(participant.id,iconPath,iconId,'annotation');lines.push(`    |rect#${iconId}| ${quoteText('Icon: '+requestedIcon,iconPath)} { pin: center; translate: 0 ${fieldY+9}; width: ${participantWidth-8}; height: 18; fill: none; stroke: none; color: --gray-deep; font-size: 12; }`);approximations.push({sourcePath:iconPath,requested:'Icon '+requestedIcon,representation:'The symbol name is preserved as a visible text caption in the native participant stack; this profile does not claim that the drawing contains the requested symbol glyph.'});}
  lines.push('  ]');
  const lifeId=nativeId+'-lifeline';add(participant.id,path('/sequence/participants/'+index+'/id'),lifeId,'participant-lifeline');
  const lifeStart=participantTop+cardHeight+8,lifeLength=bottom-lifeStart;
  lines.push(`  |line#${lifeId}| "" { pin: none; translate: ${x} ${lifeStart}; points: 0 0, 0 ${lifeLength}; marker: none; stroke: ${style}; stroke-width: 1.5; }`);
  for(const field of ['evidence','emphasis'] as const)if(participant[field]!==undefined)omissions.push({sourcePath:path('/sequence/participants/'+index+'/'+field),reason:'Retained in UMF; this flat native sequence composition does not draw participant evidence or emphasis.'});
 }
 const endpointAnchor=(participantId:string)=>participantX(participantIndex.get(participantId)!);
 for(const [index,message]of messages.entries()){
  const nativeId='message'+(index+1),captionId='message-caption'+(index+1),messagePath=path('/sequence/messages/'+index),sourceX=endpointAnchor(message.from),targetX=endpointAnchor(message.to),from=participantIndex.get(message.from)!,to=participantIndex.get(message.to)!,isSelfCall=from===to,step=Math.sign(to-from),nextIndex=isSelfCall?(from<participants.length-1?from+1:from-1):from+step,captionX=(sourceX+participantX(nextIndex))/2,linesForMessage=wrappedMessages[index]!,row=rowY(index),captionHeight=captionHeights[index]!,captionY=row-(captionHeight/2+(isSelfCall?8:10)),delta=targetX-sourceX;
  add(message.id,messagePath+'/id',nativeId,'message');
  add(message.id,messagePath+'/label',captionId,'message-caption');
  for(const field of ['status','emphasis','evidence'] as const)if(message[field]!==undefined)omissions.push({sourcePath:messagePath+'/'+field,reason:'Retained in UMF; this flat native sequence composition does not style message metadata.'});
  if(isSelfCall){const excursion=from<participants.length-1?selfCallWidth:-selfCallWidth;lines.push(`  |line#${nativeId}| "" { pin: none; translate: ${sourceX} ${row}; points: 0 0, ${excursion} 0, ${excursion} ${selfCallHeight}, 0 ${selfCallHeight}; marker-end: arrow; stroke: --gray-deep; stroke-width: 2;${message.kind==='return'?' stroke-style: dashed;':''} }`);}
  else lines.push(`  |line#${nativeId}| "" { pin: none; translate: ${sourceX} ${row}; points: 0 0, ${delta} 0; marker-end: arrow; stroke: --gray-deep; stroke-width: 2;${message.kind==='return'?' stroke-style: dashed;':''} }`);
  const labelPath=messagePath+'/label';quoteText(message.label,labelPath);
  lines.push(`  |rect#${captionId}| ${quoteText(linesForMessage.join('\n'),labelPath)} { pin: center; translate: ${captionX} ${captionY}; width: 160; height: ${captionHeight}; fill: none; stroke: none; color: --gray-deep; font-size: 14; }`);
 }
 if(visual.title&&visual.title!==visual.question)omissions.push({sourcePath:path('/question'),reason:'The concise title is visible in the native sequence drawing; the reader question remains in UMF.'});
 for(const field of ['takeaway','source','audience','steps','edges','nodes','structure','omissions'] as const)if(visual[field]!==undefined)omissions.push({sourcePath:path('/'+field),reason:field==='steps'?'Walkthrough step titles and focus IDs remain in UMF; the static sequence drawing does not imply animation or timing.':'Retained in UMF; not part of this native Lini sequence composition.'});
 approximations.push({sourcePath:path('/sequence/messages'),requested:'Readable flat Lini sequence with wrapped labels',representation:'The pinned Lini sequence layout fixes labels to arrow centers, so this flat profile uses native Lini participant rectangles, lifeline lines, arrow lines, and separate text carriers to place each unchanged caption above its arrow. Message rows follow authored sequence order; row spacing carries no elapsed-time, duration, or concurrency meaning.'});
 lines.push(']');
 return{ok:true,profileId:'umf.visual.presentation/1',backend:'lini',nativeFormat:'lini',source:lines.join('\n')+'\n',elementMap:maps,omissions,approximations};
}
