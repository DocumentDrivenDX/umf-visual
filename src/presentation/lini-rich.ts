// SPDX-License-Identifier: MIT OR Apache-2.0
/** Lini's native tree/mindmap and sequence layouts. */
import type {Visual,VisualNode} from '../extensions/visual';
import {quoteLiniProfile} from '../interchange/lini/profile-syntax';
import {liniShapeDefinition} from './lini-shapes';
import type {PresentationApproximation,PresentationElement,PresentationFailure,PresentationOmission,PresentationPlan} from './index';
import {compileLiniFlatSequence} from './lini-sequence-flat';
import {wrapLiniSequenceText,liniSequenceParticipantFieldText} from './lini-sequence-text';
export {wrapLiniSequenceText,liniSequenceParticipantFieldText} from './lini-sequence-text';

const base='/extensions/umf.visual';
const path=(value:string)=>base+(value.startsWith('/')?value:'/'+value);
const q=quoteLiniProfile;
const fail=(code:string,sourcePath:string,message:string):PresentationFailure=>({ok:false,diagnostics:[{code,path:sourcePath,message,severity:'error'}]});
const id=(prefix:string,index:number)=>prefix+(index+1);
const orderBy=<T extends {id:string}>(rows:T[],order?:string[])=>order?rows.map((item,index)=>({item,index})).sort((a,b)=>(order.indexOf(a.item.id)<0?Number.MAX_SAFE_INTEGER:order.indexOf(a.item.id))-(order.indexOf(b.item.id)<0?Number.MAX_SAFE_INTEGER:order.indexOf(b.item.id))||a.index-b.index).map(row=>row.item):rows;
const quoteText=(text:string,sourcePath:string)=>{try{return q(text);}catch(reason){throw Object.assign(new Error(reason instanceof Error?reason.message:'Text cannot be encoded by Lini.'),{sourcePath});}};
const nativeIcons=new Set(['user','rocket','seal','presentation','heart','gear','cloud','house','database','folder-simple','cpu','bell','star','ghost','video-camera','wall','check','warning','globe','lock','key','lightning','magnifying-glass','arrow-right']);
const iconToken=(value:string)=>nativeIcons.has(value)?value:undefined;
type Rich = {visual:Visual;direction:'LR'|'TB'};

function plan(visual:Visual,source:string,elements:PresentationElement[],omissions:PresentationOmission[],approximations:PresentationApproximation[]):PresentationPlan {
 return {ok:true,profileId:'umf.visual.presentation/1',backend:'lini',nativeFormat:'lini',source,elementMap:elements,omissions,approximations};
}

/** Compile tree form from semantic parent relationships, preserving node order and icons. */
export function compileLiniTree(visual:Visual,direction:'LR'|'TB'):PresentationPlan|PresentationFailure {
 const nodes=visual.nodes??[],elements:PresentationElement[]=[],omissions:PresentationOmission[]=[],approximations:PresentationApproximation[]=[];
 const tree=visual.layout?.kind==='tree'?visual.layout:undefined;
 if(visual.layout&&!tree)return fail('VISUAL_LAYOUT',path('/layout'),'Lini tree presentation cannot preserve this non-tree root layout. Use an explicit tree layout or leave layout unspecified for renderer-selected placement.');
 const roots=nodes.filter(node=>node.parent===undefined);
 if(roots.length!==1)return fail('PRESENTATION_LINI_TREE_ROOT',path('/nodes'),'Lini tree presentation requires exactly one declared root node.');
 const byParent=new Map<string|undefined,VisualNode[]>();for(const node of nodes){const list=byParent.get(node.parent)??[];list.push(node);byParent.set(node.parent,list);}
 const root=roots[0]!;
 const children=(parent:string|undefined)=>orderBy(byParent.get(parent)??[],parent===undefined?tree?.order:undefined);
 const nodeMap=new Map(nodes.map((node,index)=>[node.id,id('n',index)]));
 const branchColors=['--rose','--orange','--lime','--teal','--sky','--purple'];
 const add=(logicalId:string,sourcePath:string,nativeId:string,kind:PresentationElement['kind'])=>elements.push({logicalId,sourcePath,nativeId,kind});
 const indent=(text:string,depth:number)=>text.split('\n').map(line=>'  '.repeat(depth)+line).join('\n');
 const emit=(node:VisualNode,index:number,depth:number,rootNode=false,branchColor='--blue'):string=>{
  const nativeId=nodeMap.get(node.id)!;add(node.id,path('/nodes/'+index+'/id'),nativeId,'node');
  const type='topic';
  const shape=node.shape;
  if(shape&&shape!=='rectangle'&&shape!=='rounded-rectangle')approximations.push({sourcePath:path('/nodes/'+index+'/shape'),requested:'Node shape '+shape,representation:'Lini tree nodes use the native topic silhouette; tree hierarchy is preserved by native nesting.'});
  const detail=node.detail?`|cell#detail| ${quoteText(node.detail,path('/nodes/'+index+'/detail'))}`:undefined;
  const nested=children(node.id).map((child,childIndex)=>emit(child,nodes.indexOf(child),depth+1,false,rootNode?(branchColors[childIndex%branchColors.length]??'--blue'):branchColor));
  const symbol=node.icon?iconToken(node.icon):undefined;
  const icon=symbol?`|icon| { symbol: ${symbol}; width: 18; height: 18; fill: none; stroke: ${branchColor}-deep; }`:undefined;
  if(node.icon&&!symbol)approximations.push({sourcePath:path('/nodes/'+index+'/icon'),requested:'Icon '+node.icon,representation:'The icon name is retained visibly as a text caption because it is outside the pinned Lini Phosphor symbol subset.'});
  const visualTitle=visual.title??visual.question;
  const titleCell=rootNode&&visualTitle!==node.label?`|cell#visual-title| ${quoteText(visualTitle,path(visual.title?'/title':'/question'))}`:undefined;
  const unknownIcon=node.icon&&!symbol?`|cell#icon| ${quoteText('Icon: '+node.icon,path('/nodes/'+index+'/icon'))}`:undefined;
  const content=[titleCell,detail,icon,unknownIcon,...nested].filter((item):item is string=>!!item);
  const label=quoteText(node.label+(node.icon&&!symbol?' (icon: '+node.icon+')':''),path('/nodes/'+index+'/label'));
  const nodePaint=rootNode?`{ fill: --blue-wash; stroke: --blue-deep; color: --blue-ink; }`:`{ fill: ${branchColor}-wash; stroke: ${branchColor}-deep; color: ${branchColor}-ink; }`;
  const decl=`|${type}#${nativeId}| ${label} ${nodePaint}${content.length?' [\n'+content.map(item=>indent(item,depth+1)).join('\n')+'\n'+'  '.repeat(depth)+']':''}`;
  return decl;
 };
 // With no authored tree layout, use source sibling order and the caller's
 // renderer direction. Parent references still own the hierarchy; no source
 // layout or edge semantics are inferred.
 const treeDirection=tree?.direction??direction;
 const directionValue=treeDirection==='bilateral'?'bilateral':treeDirection==='TB'?'column':'row';
 // Renderer-owned spacing budgets open route channels around sibling branches.
 // The native geometry gate remains the authority for each compiled tree.
 const treeGap=treeDirection==='TB'?120:80;
 const source=[`{ layout: tree; direction: ${directionValue}; gap: ${treeGap}; font-family: Arial; --lini-font-family: Arial;\n  .lini-block { font-family: Arial; }\n  .lini-text { font-family: Arial; }\n}`,emit(root,nodes.indexOf(root),0,true)].join('\n')+'\n';
 add(visual.id,path('/id'),nodeMap.get(root.id)!,'visual');
 for(const node of nodes){const index=nodes.indexOf(node);for(const field of ['detail','evidence','role','status','emphasis','group','layer','ports'] as const)if(node[field]!==undefined&&!['detail','role'].includes(field))omissions.push({sourcePath:path('/nodes/'+index+'/'+field),reason:'This tree profile renders hierarchy, labels, and supported icons; this field is retained in UMF but is not drawn.'});if(node.role)approximations.push({sourcePath:path('/nodes/'+index+'/role'),requested:'Node role '+node.role,representation:'Lini topics use a generic branch palette; node role does not change the native topic silhouette.'});if(node.icon&&iconToken(node.icon))approximations.push({sourcePath:path('/nodes/'+index+'/icon'),requested:'Icon '+node.icon,representation:'Native Lini Phosphor symbol with the generic branch palette applied to its stroke.'});}
 for(const key of ['takeaway','source','audience','steps','groups','edges','omissions'] as const)if(visual[key]!==undefined)omissions.push({sourcePath:path('/'+key),reason:'Retained in UMF; not part of the native Lini tree layout.'});
 for(const key of ['layers','entities','references'] as const)if(visual.structure?.[key]!==undefined)omissions.push({sourcePath:path('/structure/'+key),reason:'Retained in UMF; Lini tree layout renders node hierarchy and does not render this structure metadata.'});
 if(visual.title&&visual.title!==visual.question)omissions.push({sourcePath:path('/question'),reason:'The concise title is visible in the root topic; the reader question remains in UMF.'});
 return plan(visual,source,elements,omissions,approximations);
}

/** Compile ordered lifelines, message operators, interval frames, and anchored notes. */
export function compileLiniSequence(visual:Visual):PresentationPlan|PresentationFailure {
 const flat=compileLiniFlatSequence(visual);if(flat)return flat;
 const sequence=visual.sequence;if(!sequence)return fail('PRESENTATION_LINI_SEQUENCE',path('/sequence'),'Sequence content is required.');
 const elements:PresentationElement[]=[],omissions:PresentationOmission[]=[],approximations:PresentationApproximation[]=[];
 const add=(logicalId:string,sourcePath:string,nativeId:string,kind:PresentationElement['kind'])=>elements.push({logicalId,sourcePath,nativeId,kind});
 const participants=sequence.participants,messages=sequence.messages,notes=sequence.notes??[];
 const messageRules=messages.filter(message=>message.kind!=='note').map(message=>`.m${messages.indexOf(message)+1} { stroke: --gray-deep; }`);
 const frameRules:string[]=[];
 const participantIds=new Map(participants.map((participant,index)=>[participant.id,'p'+(index+1)]));
 const messageIds=new Map(messages.map((message,index)=>[message.id,'m'+(index+1)]));
 const noteIds=new Map(notes.map((note,index)=>[note.id,'n'+(index+1)]));
 const participantFieldLine=(participant:typeof participants[number],index:number,nativeId:string,field:'detail'|'role'|'status',value:string)=>{
  const fieldId=nativeId+'-'+field,fieldPath=path('/sequence/participants/'+index+'/'+field),text=liniSequenceParticipantFieldText(field,value);
  add(participant.id,fieldPath,fieldId,'participant-field');
  return `|cell#${fieldId}| ${quoteText(text,fieldPath)} { font-size: ${field==='detail'?12:10}; color: --gray-deep; padding: 0; fill: none; stroke: none; stroke-width: 0; }`;
 };
 const participantLines=participants.map((participant,index)=>{
  const nativeId=participantIds.get(participant.id)!;add(participant.id,path('/sequence/participants/'+index+'/id'),nativeId,'participant');
  const shape=liniShapeDefinition(participant.shape,'sequence');
  const requestedIcon=participant.icon??(participant.role==='actor'?'user':undefined),icon=requestedIcon?iconToken(requestedIcon):undefined;
  if(shape?.approximation)approximations.push({sourcePath:path('/sequence/participants/'+index+'/shape'),requested:'Participant shape '+participant.shape,representation:shape.approximation});
  if(requestedIcon&&!icon)approximations.push({sourcePath:path('/sequence/participants/'+index+'/icon'),requested:'Icon '+requestedIcon,representation:'The icon name is retained visibly as a text caption because it is outside the pinned Lini Phosphor symbol subset.'});
  if(participant.role==='process')approximations.push({sourcePath:path('/sequence/participants/'+index+'/role'),requested:'Participant role process',representation:'The visible “Process” caption denotes a depicted process/activity, not an operating-system process or executable; the authored participant shape is preserved.'});
  const props:string[]=[];
  if(icon)props.push('symbol: '+icon+';');
  if(shape)props.push(...shape.properties);
  const style=participant.role==='actor'?'--rose-deep':participant.role==='own'?'--teal-deep':participant.role==='platform'?'--sky-deep':participant.role==='external'?'--gray-deep':participant.role==='store'?'--blue-deep':participant.role==='document'?'--purple-deep':participant.role==='process'?'--rose-deep':'--blue-deep';
  props.push('stroke: '+style+';');
  const fields:Array<string|undefined>=[participant.detail===undefined?undefined:participantFieldLine(participant,index,nativeId,'detail',participant.detail),participant.role===undefined?undefined:participantFieldLine(participant,index,nativeId,'role',participant.role),participant.status===undefined?undefined:participantFieldLine(participant,index,nativeId,'status',participant.status)];
  const children=[shape?.caption?`|cell#shape| ${quoteText(shape.caption,path('/sequence/participants/'+index+'/shape'))}`:undefined,...fields,icon?`|icon| { symbol: ${icon}; width: 18; height: 18; fill: none; stroke: ${style}; }`:undefined].filter((item):item is string=>!!item);
  const childSource=children.length?' [\n    '+children.join('\n    ')+'\n  ]':'';
  const line=`|${shape?.type??'box'}#${nativeId}| ${quoteText(participant.label+(requestedIcon&&!icon?' (icon: '+requestedIcon+')':''),path('/sequence/participants/'+index+'/label'))} { ${props.filter(value=>!value.startsWith('symbol:')).join(' ')} }${childSource}`;
  for(const field of ['evidence','emphasis'] as const)if(participant[field]!==undefined)omissions.push({sourcePath:path('/sequence/participants/'+index+'/'+field),reason:'Retained in UMF; this bounded Lini sequence profile does not render participant evidence or emphasis.'});
  return line;
 });
 const indexByMessage=new Map(messages.map((message,index)=>[message.id,index]));
 const groups=visual.groups??[];const groupById=new Map(groups.map(group=>[group.id,group]));
 const memberIndices=(groupId:string)=>messages.flatMap((message,index)=>{let current=message.group;while(current){if(current===groupId)return[index];current=groupById.get(current)?.parent;}return[];});
 const loops=new Map<string,number[]>();for(const group of groups){const indices=memberIndices(group.id);if(!indices.length)return fail('PRESENTATION_LINI_SEQUENCE_GROUP',path('/groups/'+groups.indexOf(group)),'An empty sequence group has no native Lini message interval to render.');if(group.role!=='loop')return fail('PRESENTATION_LINI_SEQUENCE_GROUP',path('/groups/'+groups.indexOf(group)+'/role'),'Lini 1.1 compilation currently supports sequence group role loop; the authored role cannot be mapped to an equivalent native frame.');if(indices.some((n,i)=>i>0&&n!==indices[i-1]!+1))return fail('PRESENTATION_LINI_SEQUENCE_GROUP',path('/groups/'+groups.indexOf(group)),'Lini sequence frames require group messages to occupy one contiguous interval.');loops.set(group.id,indices);}
 const intervals=[...loops.entries()].map(([groupId,indices])=>({groupId,first:indices[0]!,last:indices[indices.length-1]!}));
 for(let i=0;i<intervals.length;i++)for(let j=i+1;j<intervals.length;j++){const a=intervals[i]!,b=intervals[j]!,overlap=a.first<=b.last&&b.first<=a.last,contains=a.first<=b.first&&a.last>=b.last||b.first<=a.first&&b.last>=a.last;if(overlap&&!contains)return fail('PRESENTATION_LINI_SEQUENCE_GROUP',path('/groups/'+groups.indexOf(groupById.get(b.groupId)!)),'Lini sequence frames cannot represent crossing group intervals.');}
 const messageLine=(index:number,depth:number):string=>{
  const message=messages[index]!,from=participantIds.get(message.from),to=participantIds.get(message.to);if(!from||!to)throw Object.assign(new Error('Message endpoint is not a declared participant.'),{sourcePath:path('/sequence/messages/'+index)});
  const op=message.kind==='return'?'-->':message.kind==='async'?'~>':'->';const nativeId=messageIds.get(message.id)!;
  add(message.id,path('/sequence/messages/'+index+'/id'),nativeId,'message');
  const label=quoteText(message.label,path('/sequence/messages/'+index+'/label'));
  for(const field of ['status','emphasis','evidence'] as const)if(message[field]!==undefined)omissions.push({sourcePath:path('/sequence/messages/'+index+'/'+field),reason:'Retained in UMF; this Lini sequence profile does not style message metadata.'});
  if(message.kind==='note')return '  '.repeat(depth)+`|note#${nativeId}| ${label} { place: over ${from} ${to}; }`;
  return '  '.repeat(depth)+`${from} ${op} ${to} ${label} .${nativeId}`;
 };
 const noteLines=new Map<number,string[]>();for(const [index,note] of notes.entries()){
  const anchor=note.before??note.after!;const anchorIndex=indexByMessage.get(anchor);if(anchorIndex===undefined)return fail('PRESENTATION_LINI_NOTE_ANCHOR',path('/sequence/notes/'+index),'A note anchor must resolve to an existing message.');
  const place='over '+note.participants.map(participant=>participantIds.get(participant)??'').join(' ');
  const nativeId=noteIds.get(note.id)!;add(note.id,path('/sequence/notes/'+index+'/id'),nativeId,'note');
  const text=quoteText(note.text,path('/sequence/notes/'+index+'/text'));
  const line=`|note#${nativeId}| ${text} { place: ${place}; }`;
  const row=anchorIndex+(note.after!==undefined?1:0);const entries=noteLines.get(row)??[];entries.push(line);noteLines.set(row,entries);
 }
 const groupOpen=new Map<number,string[]>(),groupClose=new Map<number,string[]>();
 const nestedDepth=(group:NonNullable<typeof groups[number]>):number=>{let depth=0,current=group;while(current.parent){depth++;const parent=groupById.get(current.parent);if(!parent)break;current=parent;}return depth;};
 for(const [groupId,indices]of [...loops].sort((a,b)=>nestedDepth(groupById.get(a[0])!)-nestedDepth(groupById.get(b[0])!))){const group=groupById.get(groupId);if(!group||!indices.length)continue;
  const first=indices[0]!,last=indices[indices.length-1]!,groupIndex=groups.indexOf(group);const frameId='f'+(groupIndex+1);add(group.id,path('/groups/'+groupIndex+'/id'),frameId,'group');
  approximations.push({sourcePath:path('/groups/'+groupIndex+'/id'),requested:'Stable identity for sequence group '+group.id,representation:'The native source class '+frameId+' identifies the loop interval in desugared source. Lini 1.1 does not expose this identity on its SVG frame; the drawn dashed rectangle and native guard are bound by their unique header geometry and exact message interval.'});
  frameRules.push(`.${frameId} { fill: --purple-wash; stroke: --purple-deep; color: --gray-deep; }`);
  groupOpen.set(first,[...(groupOpen.get(first)??[]),`|loop| ${quoteText(group.label,path('/groups/'+groupIndex+'/label'))} .${frameId} [`]);
  groupClose.set(last,[']',...(groupClose.get(last)??[])]);
  for(const field of ['detail','status','emphasis'] as const)if(group[field]!==undefined)omissions.push({sourcePath:path('/groups/'+groupIndex+'/'+field),reason:'Retained in UMF; this sequence frame profile does not render group metadata.'});
 }
 const body:string[]=[];for(let row=0;row<=messages.length;row++){
  for(const note of noteLines.get(row)??[])body.push(note);
  if(row===messages.length)break;
  for(const line of groupOpen.get(row)??[])body.push(line);
  body.push(messageLine(row,groupOpen.has(row)?groupOpen.get(row)!.length:loops.size&&messages[row]!.group?nestedDepth(groupById.get(messages[row]!.group!)!)+1:0));
  for(const line of groupClose.get(row)??[])body.push(line);
 }
 const title=visual.title??visual.question,titleLine=`  |block#visual-title| ${quoteText(title,path(visual.title?'/title':'/question'))} { width: 1280; font-size: 22; font-weight: bold; color: --blue-deep; fill: none; stroke: none; stroke-width: 0; }`;
 const source=[`{ font-family: Arial; --lini-font-family: Arial;\n  .lini-block { font-family: Arial; }\n  .lini-text { font-family: Arial; }\n  .lini-slant { font-family: Arial; }\n  .lini-sequence-message { font-family: Arial; }\n  .lini-sequence-guard { font-family: Arial; }\n  .lini-sequence-tab { font-family: Arial; }${messageRules.length||frameRules.length?'\n  '+[...messageRules,...frameRules].join('\n  '):''}\n}`,`|column#sequence-stage| { width: 1280; gap: 20; align: center; padding: 20; fill: none; stroke: none; stroke-width: 0; } [`,titleLine,`  |sequence#sequence-body| { activation: none; gap: 48 80; } [`,...participantLines,...body,'  ]',']'].join('\n')+'\n';
 add(visual.id,path('/id'),'visual-title','visual');
 if(visual.form==='ladder')approximations.push({sourcePath:path('/form'),requested:'Sequence ladder form',representation:'Pinned Lini presents the unchanged participants across the top and messages down a native lifeline sequence. This is a disclosed lifelines adaptation, not a narrow-screen ladder layout.'});
 if(visual.title&&visual.title!==visual.question)omissions.push({sourcePath:path('/question'),reason:'The concise title is visible in the native sequence caption; the reader question remains in UMF.'});
 for(const field of ['takeaway','source','audience','steps','edges','nodes','structure','omissions'] as const)if(visual[field]!==undefined)omissions.push({sourcePath:path('/'+field),reason:field==='steps'?'Ordered walkthrough titles and focus IDs remain in UMF and the review authored-context panel; the static sequence SVG does not duplicate or animate them.':'Retained in UMF; not part of this native Lini sequence.'});
 return plan(visual,source,elements,omissions,approximations);
}
