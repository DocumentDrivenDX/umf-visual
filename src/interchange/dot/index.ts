// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Visual,VisualGroup} from '../../extensions/visual';
import {VISUAL_PATH,identityMapping,interchangeDiagnostic,syntheticId} from '../shared';
import type {AdapterContext,AdapterParseResult,AdapterSerializeResult,IdentityMapping,InterchangeDiagnostic,VisualInterchangeAdapter} from '../types';

/**
 * A bounded DOT adapter for directed flows. The whole native document is
 * retained by the interchange facade; this profile projects labels, tooltips,
 * edges, and a bounded named-cluster subset into flow groups.
 */
export const dotAdapter:VisualInterchangeAdapter={
 format:'dot',version:'0.3.0',
 subset:'Graphviz 16.1-compatible directed DOT: quoted or bare IDs, comments, labels/tooltips, directed node chains, and nested named cluster subgraphs (`subgraph cluster_*`) with scoped label/tooltip defaults; no anonymous or non-cluster subgraphs, ports, HTML labels, or undirected graphs. Import projects group role as region with a reported loss and reports unknown tier/layout semantics.',
 parse(source,context){return parseDot(source,context);},
 serialize(visual,context){return serializeDot(visual,context);}
};

type TokenKind='id'|'quoted'|'html'|'arrow'|'undirected'|'{'|'}'|'['|']'|'='|';'|','|':'|'+'|'eof';
interface Token {kind:TokenKind;text:string;start:number;end:number;escaped:boolean;}
interface Attr {key:string;value:string;token:Token;escaped:boolean;}
interface NativeGroup {nativeId:string;visualId:string;label?:string;detail?:string;parent?:NativeGroup;first:Token;}
interface NativeNode {nativeId:string;visualId:string;label:string;detail?:string;group?:NativeGroup;first:Token;labelSet:boolean;}
interface NativeEdge {from:NativeNode;to:NativeNode;visualId:string;label:string;why?:string;labelSet:boolean;token:Token;}
class DotFailure extends Error {constructor(readonly code:string,message:string,readonly token:Token){super(message);}}
const MAX_SOURCE_LENGTH=1_000_000,MAX_TOKENS=100_000,MAX_EDGES=10_000,MAX_GROUPS=100,MAX_GROUP_DEPTH=16;

function lex(source:string):Token[]{
 const out:Token[]=[];let i=0;
 const push=(kind:TokenKind,text:string,start:number,end:number,escaped=false)=>{if(out.length>=MAX_TOKENS)throw new DotFailure('DOT_SOURCE_SIZE','DOT source exceeds the adapter’s token limit.',{kind:'eof',text:'',start,end,escaped:false});out.push({kind,text,start,end,escaped});};
 while(i<source.length){
  const c=source[i];
  if(/\s/.test(c)){i++;continue;}
  if(c==='#'||source.startsWith('//',i)){while(i<source.length&&source[i]!=='\n')i++;continue;}
  if(source.startsWith('/*',i)){const start=i;const end=source.indexOf('*/',i+2);if(end<0)throw new DotFailure('DOT_SYNTAX','Unterminated block comment',{kind:'eof',text:'',start,end:source.length,escaped:false});i=end+2;continue;}
  if(source.startsWith('->',i)){push('arrow','->',i,i+2);i+=2;continue;}
  if(source.startsWith('--',i)){push('undirected','--',i,i+2);i+=2;continue;}
  if(c==='"'){
   const start=i++;let value='',escaped=false,closed=false;
   while(i<source.length){const ch=source[i++];if(ch==='"'){closed=true;break;}if(ch==='\\'){
    if(i>=source.length)break;const next=source[i++];
    if(next==='"'){value+='"';continue;}
    if(next==='\n'){continue;}if(next==='\r'&&source[i]==='\n'){i++;continue;}
    escaped=true;value+='\\'+next;continue;
   }value+=ch;}
   if(!closed)throw new DotFailure('DOT_SYNTAX','Unterminated quoted ID',{kind:'eof',text:'',start,end:source.length,escaped:false});
   push('quoted',value,start,i,escaped);continue;
  }
  if(c==='<'){
   const start=i++;let depth=1;
   while(i<source.length&&depth){if(source[i]==='<')depth++;else if(source[i]==='>')depth--;i++;}
   if(depth)throw new DotFailure('DOT_SYNTAX','Unterminated HTML string',{kind:'eof',text:'',start,end:source.length,escaped:false});
   push('html',source.slice(start,i),start,i);continue;
  }
  if('{}[]=;,:+'.includes(c)){push(c as TokenKind,c,i,i+1);i++;continue;}
  const start=i;
  while(i<source.length&&!/\s/.test(source[i])&&!('{}[]=;,:+"<>'.includes(source[i]))&&!source.startsWith('->',i)&&!source.startsWith('--',i)&&source[i]!=='#'&&!source.startsWith('//',i)&&!source.startsWith('/*',i))i++;
  if(i===start)throw new DotFailure('DOT_SYNTAX','Unexpected character '+JSON.stringify(c),{kind:'id',text:c,start,end:i+1,escaped:false});
  push('id',source.slice(start,i),start,i);
 }
 out.push({kind:'eof',text:'',start:source.length,end:source.length,escaped:false});return out;
}
function decodeLabel(value:string,token:Token):string{
 let out='';
 for(let i=0;i<value.length;i++){
  if(value[i]!=='\\'){out+=value[i];continue;}
  const next=value[i+1];
  if(next==='\\'){out+='\\';i++;continue;}
  if(next==='n'){out+='\n';i++;continue;}
  throw new DotFailure('DOT_LABEL_ESCAPE','DOT label escape '+JSON.stringify('\\'+(next??''))+' has no equivalent in the supported visual subset.',token);
 }
 return out;
}
function decodeTooltip(value:string,token:Token):string{
 let out='';
 for(let i=0;i<value.length;i++){
  if(value[i]!=='\\'){out+=value[i];continue;}
  const next=value[i+1];
  // Native probes confirm \n is a line break in SVG titles and \\ is one
  // literal backslash. Other substitutions (notably \N) cannot be projected
  // as descriptive text without changing their native meaning.
  if(next==='\\'){out+='\\';i++;continue;}
  if(next==='n'){out+='\n';i++;continue;}
  throw new DotFailure('DOT_TOOLTIP_ESCAPE','DOT tooltip escape '+JSON.stringify('\\'+(next??''))+' has no exact descriptive-text equivalent.',token);
 }
 return out;
}
function isDotBareId(value:string):boolean{
 if(['strict','graph','digraph','node','edge','subgraph'].includes(value.toLowerCase()))return false;
 return /^[A-Za-z_\u0080-\u00ff][A-Za-z0-9_\u0080-\u00ff]*$/.test(value)||/^-?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)$/.test(value);
}

class Parser {
 private at=0;private readonly nodes=new Map<string,NativeNode>();private readonly nodeList:NativeNode[]=[];private readonly edges:NativeEdge[]=[];
 private readonly groups:NativeGroup[]=[];private readonly groupNames=new Set<string>();private currentGroup:NativeGroup|undefined;
 private readonly diagnostics:InterchangeDiagnostic[]=[];private graphTitle:string|undefined;private graphTitleSet=false;
 private graphName:Token|undefined;private graphTooltip:string|undefined;private graphTooltipSet=false;
 private nodeDefault:string|undefined;private nodeDefaultSet=false;private nodeTooltipDefault:string|undefined;private nodeTooltipDefaultSet=false;private edgeDefault:string|undefined;private edgeDefaultSet=false;private edgeTooltipDefault:string|undefined;private edgeTooltipDefaultSet=false;
 private strict=false;private readonly strictEdges=new Map<string,NativeEdge>();
 constructor(private readonly source:string,private readonly tokens:Token[],private readonly context:AdapterContext){}
 parse():AdapterParseResult{
  try{
   if(this.word('strict')){this.strict=true;this.take();}
   if(!this.word('digraph')){
    if(this.word('graph'))this.fail('DOT_DIRECTION','Undirected DOT graphs have no edge direction in umf.visual 1.0; the adapter requires a digraph.');
    this.fail('DOT_SYNTAX','Expected a directed graph declaration (`digraph`).');
   }
   this.take();if(this.peek().kind!=='{')this.graphName=this.readId();this.expect('{');
   while(this.peek().kind!=='}'&&this.peek().kind!=='eof')this.statement();
   this.expect('}');if(this.peek().kind!=='eof')this.fail('DOT_SYNTAX','Unexpected content after the graph closing brace.');
  }catch(error){
   if(error instanceof DotFailure){this.diagnostics.push(interchangeDiagnostic(error.code,'/source',error.message,{severity:'error',loss:false,range:{start:error.token.start,end:error.token.end}}));}
   else throw error;
  }
  if(this.diagnostics.some(d=>d.severity==='error'))return {diagnostics:this.diagnostics,identityMap:[]};
  const escapedDefault=this.nodeList.find(node=>!node.labelSet&&node.nativeId.includes('\\'));
  if(escapedDefault)this.fail('DOT_LABEL_ESCAPE','An unlabelled node identifier contains a Graphviz label escape; its default `\\N` label cannot be projected exactly.',escapedDefault.first);
  if(this.graphName)this.diagnostics.push(interchangeDiagnostic('DOT_GRAPH_IDENTITY','/source/graph/name','The native graph name is retained in the original source but is not part of the visual vocabulary.',{severity:'warning',loss:true,range:{start:this.graphName.start,end:this.graphName.end}}));
  if(this.groups.length)this.diagnostics.push(interchangeDiagnostic('DOT_GROUP_LAYOUT','/source/subgraphs','Named Graphviz clusters preserve group containment, but DOT does not identify whether they represent zones, lanes, tiers, or another visual role.',{severity:'warning',loss:true}));
  if(this.nodeList.length>15){const token=this.nodeList[15]?.first??this.peek();this.diagnostics.push(interchangeDiagnostic('DOT_VISUAL_SIZE','/source/nodes','The flow exceeds umf.visual 1.0’s 15-node limit; split the graph before import.',{severity:'error',loss:false,range:{start:token.start,end:token.end}}));return {diagnostics:this.diagnostics,identityMap:[]};}
  const nodes=this.nodeList.map(n=>({id:n.visualId,label:n.label,...(n.detail!==undefined?{detail:n.detail}:{}),...(n.group?{group:n.group.visualId}:{})}));
  const edges=this.edges.map(e=>({id:e.visualId,from:e.from.visualId,to:e.to.visualId,...(e.labelSet?{label:e.label}:{}),...(e.why!==undefined?{why:e.why}:{})}));
  const groups:VisualGroup[]=this.groups.map(group=>({id:group.visualId,label:group.label!,...(group.detail!==undefined?{detail:group.detail}:{}),role:'region',...(group.parent?{parent:group.parent.visualId}:{})}));
  for(const [index,group]of this.groups.entries()){
   const path='/source/subgraphs/'+pointerSegment(group.nativeId),range={start:group.first.start,end:group.first.end};
   this.diagnostics.push(interchangeDiagnostic('DOT_GROUP_ROLE',path+'/role','Graphviz cluster membership does not encode a VisualGroup role; `region` is a reported neutral projection.',{severity:'warning',loss:true,range}));
   this.diagnostics.push(interchangeDiagnostic('DOT_GROUP_TIER',path+'/tier','Graphviz clusters do not encode the VisualGroup tier value.',{severity:'warning',loss:true,range}));
  }
  const visual:Visual={id:this.context.id,kind:'flow',form:'network',question:this.context.question,...(this.graphTitleSet?{title:this.graphTitle??''}:{}),...(groups.length?{groups}:{}),nodes,...(edges.length?{edges}:{})};
  const identityMap:IdentityMapping[]=[];
  for(const [index,group]of this.groups.entries())identityMap.push(identityMapping('group',group.nativeId,group.visualId,VISUAL_PATH+'/groups/'+index,'/source/subgraphs/'+pointerSegment(group.nativeId)));
  for(const [index,node]of this.nodeList.entries())identityMap.push(identityMapping('node',node.nativeId,node.visualId,VISUAL_PATH+'/nodes/'+index,'/source/nodes/'+pointerSegment(node.nativeId)));
  const occurrences=new Map<string,number>();
  for(const [index,edge]of this.edges.entries()){
   const pair=JSON.stringify([edge.from.nativeId,edge.to.nativeId]),occurrence=(occurrences.get(pair)??0)+1;occurrences.set(pair,occurrence);
   const nativeId=JSON.stringify([edge.from.nativeId,edge.to.nativeId])+'#'+occurrence;
   identityMap.push(identityMapping('edge',nativeId,edge.visualId,VISUAL_PATH+'/edges/'+index,'/source/edges/'+pointerSegment(nativeId)));
  }
  return {visual,diagnostics:this.diagnostics,identityMap};
 }
 private peek():Token{return this.tokens[this.at];}
 private take():Token{return this.tokens[this.at++];}
 private expect(kind:TokenKind):Token{const t=this.peek();if(t.kind!==kind)this.fail('DOT_SYNTAX','Expected '+JSON.stringify(kind)+' but found '+(t.kind==='eof'?'end of input':JSON.stringify(t.text)+'.'));return this.take();}
 private fail(code:string,message:string,token=this.peek()):never{throw new DotFailure(code,message,token);}
 private word(value:string):boolean{return this.peek().kind==='id'&&this.peek().text.toLowerCase()===value;}
 private readId():Token{const t=this.peek();if(t.kind!=='id'&&t.kind!=='quoted')this.fail('DOT_SYNTAX','Expected a DOT identifier.');if(t.kind==='id'&&!isDotBareId(t.text))this.fail('DOT_SYNTAX','The unquoted token '+JSON.stringify(t.text)+' is not a DOT ID; quote it to preserve its exact spelling.',t);this.take();return t;}
 private statement():void{
  if(this.peek().kind===';'){this.take();return;}
  if(this.word('subgraph')||this.peek().kind==='{'){this.parseCluster();return;}
  if(this.word('graph')||this.word('node')||this.word('edge')){
   const type=this.take().text.toLowerCase();if(this.peek().kind!=='[')this.fail('DOT_SYNTAX','Expected an attribute list after '+type+'.');
   const attrs=this.attrLists();this.defaultAttrs(type,attrs);return;
  }
  const first=this.readNodeId();
  if(this.peek().kind==='='){
   this.take();const value=this.readValue();this.setGraphAttr(first.text,value.value,first,value.escaped);return;
  }
  const left=[this.node(first)];
  while(this.peek().kind===','){this.take();left.push(this.node(this.readNodeId()));}
  if(this.peek().kind==='arrow'||this.peek().kind==='undirected'){
   const pairs:Array<[NativeNode,NativeNode,Token]>=[];let from=left;
   while(this.peek().kind==='arrow'||this.peek().kind==='undirected'){
    const op=this.take();if(op.kind==='undirected')this.fail('DOT_DIRECTION','Undirected edge operators cannot be represented as directed visual edges.',op);
    const right=[this.node(this.readNodeId())];while(this.peek().kind===','){this.take();right.push(this.node(this.readNodeId()));}
    for(const a of from)for(const b of right)pairs.push([a,b,op]);from=right;
   }
   const attrs=this.peek().kind==='['?this.attrLists():[];for(const [a,b,token]of pairs)this.addEdge(a,b,attrs,token);return;
  }
  const attrs=this.peek().kind==='['?this.attrLists():[];for(const n of left)this.applyNodeAttrs(n,attrs);
 }
 private parseCluster():void{
  const start=this.peek();if(this.word('subgraph'))this.take();else this.fail('DOT_SUBGRAPH','Anonymous subgraphs are outside the supported DOT cluster subset.',start);
  if(this.peek().kind==='{')this.fail('DOT_SUBGRAPH','Anonymous subgraphs are outside the supported DOT cluster subset.');
  const name=this.readId();if(!name.text.startsWith('cluster'))this.fail('DOT_SUBGRAPH','Only named subgraphs whose IDs begin with `cluster` are treated as Graphviz clusters.',name);
  if(this.graphName?.text===name.text)this.fail('DOT_GROUP_ID','The graph and subgraph share the native DOT name namespace; this cluster identity collides with the graph name.',name);
  if(this.groupNames.has(name.text))this.fail('DOT_GROUP_ID','Repeated cluster subgraph identity '+JSON.stringify(name.text)+' is ambiguous.',name);
  if(this.groups.length>=MAX_GROUPS)this.fail('DOT_GROUP_SIZE','The source exceeds the adapter’s 100-cluster limit.',name);
  let depth=0;for(let parent=this.currentGroup;parent;parent=parent.parent)depth++;
  if(depth>=MAX_GROUP_DEPTH)this.fail('DOT_GROUP_DEPTH','Nested clusters exceed the adapter’s 16-level limit.',name);
  const group:NativeGroup={nativeId:name.text,visualId:syntheticId('group',this.groups.length),...(this.graphTitleSet?{label:this.graphTitle}:{}),...(this.graphTooltipSet&&this.graphTooltip!==undefined?{detail:this.graphTooltip}:{}),...(this.currentGroup?{parent:this.currentGroup}:{}),first:name};
  this.groupNames.add(name.text);this.groups.push(group);this.expect('{');
  const saved={group:this.currentGroup,graphTitle:this.graphTitle,graphTitleSet:this.graphTitleSet,graphTooltip:this.graphTooltip,graphTooltipSet:this.graphTooltipSet,nodeDefault:this.nodeDefault,nodeDefaultSet:this.nodeDefaultSet,nodeTooltipDefault:this.nodeTooltipDefault,nodeTooltipDefaultSet:this.nodeTooltipDefaultSet,edgeDefault:this.edgeDefault,edgeDefaultSet:this.edgeDefaultSet,edgeTooltipDefault:this.edgeTooltipDefault,edgeTooltipDefaultSet:this.edgeTooltipDefaultSet};
  this.currentGroup=group;
  try{while(this.peek().kind!=='}'&&this.peek().kind!=='eof')this.statement();this.expect('}');}
  finally{this.currentGroup=saved.group;this.graphTitle=saved.graphTitle;this.graphTitleSet=saved.graphTitleSet;this.graphTooltip=saved.graphTooltip;this.graphTooltipSet=saved.graphTooltipSet;this.nodeDefault=saved.nodeDefault;this.nodeDefaultSet=saved.nodeDefaultSet;this.nodeTooltipDefault=saved.nodeTooltipDefault;this.nodeTooltipDefaultSet=saved.nodeTooltipDefaultSet;this.edgeDefault=saved.edgeDefault;this.edgeDefaultSet=saved.edgeDefaultSet;this.edgeTooltipDefault=saved.edgeTooltipDefault;this.edgeTooltipDefaultSet=saved.edgeTooltipDefaultSet;}
  if(group.label===undefined||group.label==='')this.fail('DOT_GROUP_LABEL','A cluster needs a nonempty explicit or inherited label to map to VisualGroup.label.',name);
 }
 private readNodeId():Token{if(this.word('subgraph'))this.fail('DOT_SUBGRAPH','Subgraphs and clusters are outside the supported DOT subset.');const t=this.readId();if(this.peek().kind===':')this.fail('DOT_PORT','Node ports and compass points are outside the supported subset.',this.peek());return t;}
 private node(token:Token):NativeNode{
  if(token.kind==='html')this.fail('DOT_HTML','HTML strings are not supported as node identifiers or labels.',token);
  let n=this.nodes.get(token.text);if(!n){if(this.nodeList.length>=15)this.fail('DOT_VISUAL_SIZE','The flow exceeds umf.visual 1.0’s 15-node limit; split the graph before import.',token);n={nativeId:token.text,visualId:syntheticId('node',this.nodeList.length),label:this.nodeDefaultSet?this.nodeDefault??'':token.text,...(this.nodeTooltipDefaultSet&&this.nodeTooltipDefault!==undefined?{detail:this.nodeTooltipDefault}:{}),first:token,labelSet:this.nodeDefaultSet};this.nodes.set(token.text,n);this.nodeList.push(n);}this.assignNodeGroup(n,token);return n;
 }
 private assignNodeGroup(node:NativeNode,token:Token):void{
  const target=this.currentGroup,existing=node.group;if(!target)return;if(!existing){node.group=target;return;}if(existing===target)return;
  for(let current=target.parent;current;current=current.parent)if(current===existing){node.group=target;return;}
  for(let current=existing.parent;current;current=current.parent)if(current===target)return;
  this.fail('DOT_GROUP_OVERLAP','A node is assigned to clusters that are not nested; VisualNode.group carries only one membership.',token);
 }
 private readValue():{value:string;escaped:boolean;token:Token}{
  const first=this.peek();if(first.kind!=='id'&&first.kind!=='quoted'&&first.kind!=='html')this.fail('DOT_SYNTAX','Expected an attribute value.');
  if(first.kind==='html')this.fail('DOT_HTML','HTML-like labels and values are outside the supported subset.',first);
  if(first.kind==='id'&&!isDotBareId(first.text))this.fail('DOT_SYNTAX','The unquoted token '+JSON.stringify(first.text)+' is not a DOT ID; quote it to preserve its exact spelling.',first);
  this.take();let value=first.text,escaped=first.escaped;
  while(this.peek().kind==='+') {this.take();const next=this.peek();if(next.kind!=='quoted')this.fail('DOT_SYNTAX','DOT string concatenation is supported only between quoted strings.',next);this.take();value+=next.text;escaped=escaped||next.escaped;}
  return {value,escaped,token:first};
 }
 private attrLists():Attr[]{
  const attrs:Attr[]=[];
  while(this.peek().kind==='['){this.take();while(this.peek().kind!==']'){
   if(this.peek().kind==='eof')this.fail('DOT_SYNTAX','Unterminated attribute list.');if(this.peek().kind===','||this.peek().kind===';'){this.take();continue;}
   const key=this.readId();this.expect('=');const value=this.readValue();attrs.push({key:key.text,value:value.value,token:key,escaped:value.escaped});
  }this.take();}
  return attrs;
 }
 private reportAttr(attr:Attr,scope:string):void{this.diagnostics.push(interchangeDiagnostic('DOT_ATTRIBUTE_LOSS','/source/'+scope+'/'+pointerSegment(attr.key),'DOT '+scope+' attribute '+JSON.stringify(attr.key)+' is retained in the original source but is not projected by the visual subset.',{severity:'warning',loss:true,range:{start:attr.token.start,end:attr.token.end}}));}
 private defaultAttrs(type:string,attrs:Attr[]):void{
  if(type==='graph'){for(const attr of attrs)this.setGraphAttr(attr.key,attr.value,attr.token,attr.escaped);return;}
  const defaultLabels=new Map<string,Attr>(),defaultTooltips=new Map<string,Attr>();
  for(const attr of attrs){const key=attr.key;if(type==='edge')this.checkDirectionAttribute(attr);if(key==='label')defaultLabels.set(key,attr);else if(key==='tooltip'&&(type==='node'||type==='edge'))defaultTooltips.set(key,attr);else if(!(type==='edge'&&key==='dir'&&attr.value.toLowerCase()==='forward'))this.reportAttr(attr,type+'-defaults');}
  if(type==='node'&&defaultLabels.has('label')){const attr=defaultLabels.get('label')!;this.nodeDefault=decodeLabel(attr.value,attr.token);this.nodeDefaultSet=true;}
  if(type==='node'&&defaultTooltips.has('tooltip')){const attr=defaultTooltips.get('tooltip')!;this.nodeTooltipDefault=attr.value===''?undefined:decodeTooltip(attr.value,attr.token);this.nodeTooltipDefaultSet=true;if(attr.value==='')this.emptyTooltip(attr.token);}
  if(type==='edge'&&defaultLabels.has('label')){const attr=defaultLabels.get('label')!;this.edgeDefault=decodeLabel(attr.value,attr.token);this.edgeDefaultSet=true;}
  if(type==='edge'&&defaultTooltips.has('tooltip')){const attr=defaultTooltips.get('tooltip')!;this.edgeTooltipDefault=attr.value===''?undefined:decodeTooltip(attr.value,attr.token);this.edgeTooltipDefaultSet=true;if(attr.value==='')this.emptyTooltip(attr.token,'/source/edge-tooltip');}
 }
 private setGraphAttr(key:string,value:string,token:Token,escaped:boolean):void{
  if(key==='cluster'&&this.currentGroup){if(value.toLowerCase()!=='true')this.fail('DOT_CLUSTER','A named cluster cannot disable cluster semantics with `cluster=false`.',token);return;}
  if(key==='label') {this.graphTitle=decodeLabel(value,token);this.graphTitleSet=true;if(this.currentGroup)this.currentGroup.label=this.graphTitle;return;}
  if(key==='tooltip'){
   const decoded=value===''?undefined:decodeTooltip(value,token);this.graphTooltip=decoded;this.graphTooltipSet=true;
   if(this.currentGroup){this.currentGroup.detail=decoded;}
   else{this.reportAttr({key,value,token,escaped},'graph');}
   return;
  }
  this.reportAttr({key,value,token,escaped},this.currentGroup?'subgraphs/'+pointerSegment(this.currentGroup.nativeId):'graph');
 }
 private applyNodeAttrs(node:NativeNode,attrs:Attr[]):void{
  let lastTooltip=-1;for(const [index,attr]of attrs.entries())if(attr.key==='tooltip')lastTooltip=index;
  for(const [index,attr]of attrs.entries()){if(attr.key==='label'){node.label=decodeLabel(attr.value,attr.token);node.labelSet=true;}else if(attr.key==='tooltip'){if(index!==lastTooltip)continue;node.detail=attr.value===''?undefined:decodeTooltip(attr.value,attr.token);if(attr.value==='')this.emptyTooltip(attr.token);}else this.reportAttr(attr,'nodes/'+pointerSegment(node.nativeId));}
 }
 private emptyTooltip(token:Token,path='/source/tooltip'):void{this.diagnostics.push(interchangeDiagnostic('DOT_TOOLTIP_EMPTY',path,'An empty DOT tooltip falls back to the native label and cannot be represented as non-empty descriptive text.',{severity:'warning',loss:true,range:{start:token.start,end:token.end}}));}
 private addEdge(from:NativeNode,to:NativeNode,attrs:Attr[],token:Token):void{
  let label=this.edgeDefault??'';let why=this.edgeTooltipDefaultSet?this.edgeTooltipDefault:undefined,labelSet=this.edgeDefaultSet,explicitLabel=false,explicitWhy=false;let lastTooltip=-1;for(const [index,attr]of attrs.entries())if(attr.key==='tooltip')lastTooltip=index;
  for(const [index,attr]of attrs.entries()){this.checkDirectionAttribute(attr);if(attr.key==='label'){label=decodeLabel(attr.value,attr.token);labelSet=true;explicitLabel=true;}else if(attr.key==='tooltip'){if(index!==lastTooltip)continue;why=attr.value===''?undefined:decodeTooltip(attr.value,attr.token);explicitWhy=true;if(attr.value==='')this.emptyTooltip(attr.token,'/source/edge-tooltip');}else if(!(attr.key==='dir'&&attr.value.toLowerCase()==='forward'))this.reportAttr(attr,'edges/'+pointerSegment(`${from.nativeId}->${to.nativeId}`));}
  const key=JSON.stringify([from.nativeId,to.nativeId]);const prior=this.strict?this.strictEdges.get(key):undefined;
  if(prior){if(explicitLabel){prior.label=label;prior.labelSet=true;}if(explicitWhy)prior.why=why;return;}
  if(this.edges.length>=MAX_EDGES)this.fail('DOT_SOURCE_SIZE','DOT source expands to more than the adapter’s 10,000-edge limit.',token);
  const edge:NativeEdge={from,to,visualId:syntheticId('edge',this.edges.length),label,...(why!==undefined?{why}:{}),labelSet,token};this.edges.push(edge);if(this.strict)this.strictEdges.set(key,edge);
 }
 private checkDirectionAttribute(attr:Attr):void{
  const key=attr.key,value=attr.value.toLowerCase();
  if(key==='dir'&&value!=='forward')this.fail('DOT_DIRECTION','DOT edge direction '+JSON.stringify(attr.value)+' is outside the forward digraph subset.',attr.token);
  if((key==='arrowhead'||key==='arrowtail')&&value==='none')this.fail('DOT_DIRECTION','An edge with no arrowhead cannot be projected as a directed visual edge.',attr.token);
 }
}
function pointerSegment(value:string):string{return value.replace(/~/g,'~0').replace(/\//g,'~1');}
function parseDot(source:string,context:AdapterContext):AdapterParseResult{
 try{
  if(source.length>MAX_SOURCE_LENGTH)return {diagnostics:[interchangeDiagnostic('DOT_SOURCE_SIZE','/source','DOT source exceeds the adapter’s 1 MiB direct-input limit.',{severity:'error',loss:false,range:{start:0,end:source.length}})],identityMap:[]};
  return new Parser(source,lex(source),context).parse();
 }
 catch(error){if(error instanceof DotFailure)return {diagnostics:[interchangeDiagnostic(error.code,'/source',error.message,{severity:'error',loss:false,range:{start:error.token.start,end:error.token.end}})],identityMap:[]};throw error;}
}

function quote(value:string):string{return '"'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n')+'"';}
function unsafeTextReason(value:string):string|undefined{
 for(let i=0;i<value.length;i++){
  const code=value.charCodeAt(i);
  if((code<0x20&&code!==0x0a)||(code>=0x7f&&code<=0x9f))return 'contains a control character that the supported DOT text profile cannot preserve';
  if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(i+1);if(!(next>=0xdc00&&next<=0xdfff))return 'contains an unpaired UTF-16 surrogate that DOT cannot encode';i++;continue;}
  if(code>=0xdc00&&code<=0xdfff)return 'contains an unpaired UTF-16 surrogate that DOT cannot encode';
 }
 return;
}
function serializeDot(visual:Visual,_context:AdapterContext):AdapterSerializeResult{
 const diagnostics:InterchangeDiagnostic[]=[],identityMap:IdentityMapping[]=[];
 const lost=(code:string,path:string,message:string)=>diagnostics.push(interchangeDiagnostic(code,path,message,{severity:'warning',loss:true}));
 if(visual.kind!=='flow'||!['network','zoned','lanes'].includes(visual.form)){
  diagnostics.push(interchangeDiagnostic('DOT_UNSUPPORTED_VISUAL',VISUAL_PATH,'DOT export supports flow/network, flow/zoned, and flow/lanes cluster projections.',{severity:'error',loss:false}));return {diagnostics,identityMap};
 }
 if((visual.nodes?.length??0)>15){diagnostics.push(interchangeDiagnostic('DOT_VISUAL_SIZE',VISUAL_PATH+'/nodes','The visual exceeds umf.visual 1.0’s 15-node limit.',{severity:'error',loss:false}));return {diagnostics,identityMap};}
 const nodes=visual.nodes??[],edges=visual.edges??[],groups=visual.groups??[];const lines=['digraph '+quote(visual.id)+' {'];
 const checkText=(value:string,path:string)=>{const reason=unsafeTextReason(value);if(reason)diagnostics.push(interchangeDiagnostic('DOT_TEXT',path,'The value '+reason+'.',{severity:'error',loss:false}));};
 checkText(visual.id,VISUAL_PATH+'/id');if(visual.title!==undefined)checkText(visual.title,VISUAL_PATH+'/title');
 if(groups.length>MAX_GROUPS)diagnostics.push(interchangeDiagnostic('DOT_GROUP_SIZE',VISUAL_PATH+'/groups','DOT cluster export is limited to 100 groups.',{severity:'error',loss:false}));
 const groupIndex=new Map(groups.map((group,index)=>[group.id,index]));
 for(const [i,group]of groups.entries()){checkText(group.id,VISUAL_PATH+'/groups/'+i+'/id');checkText(group.label,VISUAL_PATH+'/groups/'+i+'/label');if(group.detail!==undefined){checkText(group.detail,VISUAL_PATH+'/groups/'+i+'/detail');if(group.detail==='')diagnostics.push(interchangeDiagnostic('DOT_TOOLTIP_EMPTY',VISUAL_PATH+'/groups/'+i+'/detail','Graphviz treats an empty cluster tooltip as a request to fall back to the cluster label.',{severity:'error',loss:false}));}if(group.parent!==undefined&&!groupIndex.has(group.parent))diagnostics.push(interchangeDiagnostic('DOT_GROUP_PARENT',VISUAL_PATH+'/groups/'+i+'/parent','The parent group does not exist.',{severity:'error',loss:false}));}
 for(const [i,node]of nodes.entries()){checkText(node.id,VISUAL_PATH+'/nodes/'+i+'/id');checkText(node.label,VISUAL_PATH+'/nodes/'+i+'/label');if(node.detail!==undefined){checkText(node.detail,VISUAL_PATH+'/nodes/'+i+'/detail');if(node.detail==='')diagnostics.push(interchangeDiagnostic('DOT_TOOLTIP_EMPTY',VISUAL_PATH+'/nodes/'+i+'/detail','Graphviz treats an empty tooltip as a request to fall back to the node label.',{severity:'error',loss:false}));}if(node.group!==undefined&&!groupIndex.has(node.group))diagnostics.push(interchangeDiagnostic('DOT_GROUP_MEMBER',VISUAL_PATH+'/nodes/'+i+'/group','The node group does not exist.',{severity:'error',loss:false}));}
 for(const [i,edge]of edges.entries()){checkText(edge.from,VISUAL_PATH+'/edges/'+i+'/from');checkText(edge.to,VISUAL_PATH+'/edges/'+i+'/to');if(edge.label!==undefined)checkText(edge.label,VISUAL_PATH+'/edges/'+i+'/label');if(edge.why!==undefined){checkText(edge.why,VISUAL_PATH+'/edges/'+i+'/why');if(edge.why==='')diagnostics.push(interchangeDiagnostic('DOT_TOOLTIP_EMPTY',VISUAL_PATH+'/edges/'+i+'/why','Graphviz treats an empty edge tooltip as a request to fall back to the edge label.',{severity:'error',loss:false}));}}
 if(diagnostics.some(d=>d.severity==='error'))return {diagnostics,identityMap};
 if(visual.title!==undefined)lines.push('  graph [label='+quote(visual.title)+'];');
 const nativeGroupNames=new Map<string,string>(),usedNativeGroupNames=new Set<string>();
 for(const [index,group]of groups.entries()){let name='cluster_umf_g'+(index+1);while(name===visual.id||usedNativeGroupNames.has(name))name+='_x';nativeGroupNames.set(group.id,name);usedNativeGroupNames.add(name);}
 const groupNative=(group:VisualGroup)=>nativeGroupNames.get(group.id)!;
 const emitNode=(i:number,depth:number)=>{const node=nodes[i]!,indent='  '.repeat(depth);lines.push(indent+quote(node.id)+' [label='+quote(node.label)+(node.detail!==undefined?', tooltip='+quote(node.detail):'')+'];');identityMap.push(identityMapping('node',node.id,node.id,VISUAL_PATH+'/nodes/'+i));};
 const active=new Set<string>(),emittedGroups=new Set<string>(),emittedNodes=new Set<string>();
 const emitGroup=(group:VisualGroup,depth:number,inheritedTooltip?:string)=>{
  if(depth>MAX_GROUP_DEPTH){diagnostics.push(interchangeDiagnostic('DOT_GROUP_DEPTH',VISUAL_PATH+'/groups','Nested cluster export is limited to 16 levels.',{severity:'error',loss:false}));return;}
  if(active.has(group.id)){diagnostics.push(interchangeDiagnostic('DOT_GROUP_CYCLE',VISUAL_PATH+'/groups/'+groupIndex.get(group.id)+'/parent','Group parent links contain a cycle.',{severity:'error',loss:false}));return;}
  active.add(group.id);emittedGroups.add(group.id);const index=groupIndex.get(group.id)!,indent='  '.repeat(depth),nativeId=groupNative(group);
  identityMap.push(identityMapping('group',nativeId,group.id,VISUAL_PATH+'/groups/'+index));
  lines.push(indent+'subgraph '+quote(nativeId)+' {');const resetTooltip=group.detail===undefined&&inheritedTooltip!==undefined;lines.push(indent+'  graph [label='+quote(group.label)+(group.detail!==undefined?', tooltip='+quote(group.detail):resetTooltip?', tooltip=""':'')+'];');
  for(const [nodeIndex,node]of nodes.entries())if(node.group===group.id){emitNode(nodeIndex,depth+1);emittedNodes.add(node.id);}
  const effectiveTooltip=group.detail!==undefined?group.detail:undefined;for(const child of groups)if(child.parent===group.id)emitGroup(child,depth+1,effectiveTooltip);
  lines.push(indent+'}');active.delete(group.id);
  for(const field of ['role','tier','status','emphasis'] as const)if(Object.hasOwn(group,field))lost('DOT_GROUP_FIELD',VISUAL_PATH+'/groups/'+index+'/'+field,'DOT clusters preserve membership and hierarchy but do not encode group '+field+'.');
 };
 for(const group of groups)if(group.parent===undefined)emitGroup(group,1);
 for(const group of groups)if(!emittedGroups.has(group.id)&&!active.has(group.id)){diagnostics.push(interchangeDiagnostic('DOT_GROUP_PARENT',VISUAL_PATH+'/groups/'+groupIndex.get(group.id)+'/parent','The group is unreachable from a root group, usually because of a parent cycle.',{severity:'error',loss:false}));}
 for(const [i,node]of nodes.entries())if(!emittedNodes.has(node.id))emitNode(i,1);
 if((visual.form==='zoned'||visual.form==='lanes')&&groups.length)lost('DOT_FLOW_LAYOUT',VISUAL_PATH+'/form','Graphviz clusters retain group hierarchy but do not encode zoned tiers or lane layout.');
 for(const [i,node]of nodes.entries())for(const key of ['role','status','emphasis','parent','layer','evidence'] as const)if(Object.hasOwn(node,key))lost('DOT_NODE_FIELD',VISUAL_PATH+'/nodes/'+i+'/'+key,'DOT export does not represent node '+key+'.');
 const occurrences=new Map<string,number>();
 for(const [i,edge]of edges.entries()){
  const key=JSON.stringify([edge.from,edge.to]),count=(occurrences.get(key)??0)+1;occurrences.set(key,count);
  const attrs=(edge.label===undefined&&edge.why===undefined?'':' ['+(edge.label===undefined?'':'label='+quote(edge.label))+(edge.label!==undefined&&edge.why!==undefined?', ':'')+(edge.why===undefined?'':'tooltip='+quote(edge.why))+']');lines.push('  '+quote(edge.from)+' -> '+quote(edge.to)+attrs+';');
  identityMap.push(identityMapping('edge',`${edge.from}->${edge.to}#${count}`,edge.id,VISUAL_PATH+'/edges/'+i));
  for(const field of ['kind','status','emphasis','evidence'] as const)if(Object.hasOwn(edge,field))lost('DOT_EDGE_FIELD',VISUAL_PATH+'/edges/'+i+'/'+field,'DOT export does not represent edge '+field+'.');
 }
 lines.push('}');
 for(const field of ['takeaway','audience','source','omissions','steps','sequence','structure','state','timeline','comparison','metric'] as const)if(Object.hasOwn(visual,field))lost('DOT_VISUAL_FIELD',VISUAL_PATH+'/'+field,'DOT export does not represent visual '+field+'.');
 if(diagnostics.some(d=>d.severity==='error'))return {diagnostics,identityMap};
 return {text:lines.join('\n')+'\n',diagnostics,identityMap};
}
