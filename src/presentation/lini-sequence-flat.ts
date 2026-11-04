// SPDX-License-Identifier: MIT OR Apache-2.0
/** Native positioned composition for flat Lini sequences with labels taller than one line. */
import type {Visual} from '../extensions/visual';
import {quoteLiniProfile} from '../interchange/lini/profile-syntax';
import type {PresentationApproximation,PresentationElement,PresentationOmission,PresentationPlan} from './index';
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

/** Return a plan only for flat rectangular sequences supported by native primitives. */
export function compileLiniFlatSequence(visual:Visual):PresentationPlan|undefined{
 const sequence=visual.kind==='sequence'?visual.sequence:undefined;
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
