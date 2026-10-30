// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Visual} from '../../extensions/visual';
import {VISUAL_PATH,identityMapping,interchangeDiagnostic,syntheticId} from '../shared';
import type {AdapterContext,AdapterParseResult,AdapterSerializeResult,IdentityMapping,InterchangeDiagnostic,VisualInterchangeAdapter} from '../types';

/**
 * A bounded DOT adapter for directed flow/network graphs. The whole native
 * document is retained by the interchange facade; this adapter only projects
 * the explicit labels and directed endpoints described by this subset.
 */
export const dotAdapter:VisualInterchangeAdapter={
 format:'dot',version:'0.2.0',
 subset:'Graphviz DOT digraphs with explicit node/edge labels, quoted or bare IDs, comments, attribute lists, and directed node chains; no subgraphs, ports, HTML labels, or undirected graphs.',
 parse(source,context){return parseDot(source,context);},
 serialize(visual,context){return serializeDot(visual,context);}
};

type TokenKind='id'|'quoted'|'html'|'arrow'|'undirected'|'{'|'}'|'['|']'|'='|';'|','|':'|'+'|'eof';
interface Token {kind:TokenKind;text:string;start:number;end:number;escaped:boolean;}
interface Attr {key:string;value:string;token:Token;escaped:boolean;}
interface NativeNode {nativeId:string;visualId:string;label:string;detail?:string;first:Token;labelSet:boolean;}
interface NativeEdge {from:NativeNode;to:NativeNode;visualId:string;label:string;labelSet:boolean;token:Token;}
class DotFailure extends Error {constructor(readonly code:string,message:string,readonly token:Token){super(message);}}
const MAX_SOURCE_LENGTH=1_000_000,MAX_TOKENS=100_000,MAX_EDGES=10_000;

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
 private readonly diagnostics:InterchangeDiagnostic[]=[];private graphTitle:string|undefined;private graphTitleSet=false;
 private graphName:Token|undefined;
 private nodeDefault:string|undefined;private nodeDefaultSet=false;private nodeTooltipDefault:string|undefined;private nodeTooltipDefaultSet=false;private edgeDefault:string|undefined;private edgeDefaultSet=false;
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
  if(this.nodeList.length>15){const token=this.nodeList[15]?.first??this.peek();this.diagnostics.push(interchangeDiagnostic('DOT_VISUAL_SIZE','/source/nodes','The flow exceeds the DOT profile’s 15-node bound; split the graph before import.',{severity:'error',loss:false,range:{start:token.start,end:token.end}}));return {diagnostics:this.diagnostics,identityMap:[]};}
  const nodes=this.nodeList.map(n=>({id:n.visualId,label:n.label,...(n.detail!==undefined?{detail:n.detail}:{})}));
  const edges=this.edges.map(e=>({id:e.visualId,from:e.from.visualId,to:e.to.visualId,...(e.labelSet?{label:e.label}:{})}));
  const visual:Visual={id:this.context.id,kind:'flow',form:'network',question:this.context.question,...(this.graphTitleSet?{title:this.graphTitle??''}:{}),nodes,...(edges.length?{edges}:{})};
  const identityMap:IdentityMapping[]=[];
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
  if(this.word('subgraph')||this.peek().kind==='{')this.fail('DOT_SUBGRAPH','Subgraphs and clusters are outside the supported DOT subset.');
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
 private readNodeId():Token{if(this.word('subgraph'))this.fail('DOT_SUBGRAPH','Subgraphs and clusters are outside the supported DOT subset.');const t=this.readId();if(this.peek().kind===':')this.fail('DOT_PORT','Node ports and compass points are outside the supported subset.',this.peek());return t;}
 private node(token:Token):NativeNode{
  if(token.kind==='html')this.fail('DOT_HTML','HTML strings are not supported as node identifiers or labels.',token);
  let n=this.nodes.get(token.text);if(!n){if(this.nodeList.length>=15)this.fail('DOT_VISUAL_SIZE','The flow exceeds the DOT profile’s 15-node bound; split the graph before import.',token);n={nativeId:token.text,visualId:syntheticId('node',this.nodeList.length),label:this.nodeDefaultSet?this.nodeDefault??'':token.text,...(this.nodeTooltipDefaultSet&&this.nodeTooltipDefault!==undefined?{detail:this.nodeTooltipDefault}:{}),first:token,labelSet:this.nodeDefaultSet};this.nodes.set(token.text,n);this.nodeList.push(n);}return n;
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
  for(const attr of attrs){const key=attr.key;if(type==='edge')this.checkDirectionAttribute(attr);if(key==='label')defaultLabels.set(key,attr);else if(type==='node'&&key==='tooltip')defaultTooltips.set(key,attr);else if(!(type==='edge'&&key==='dir'&&attr.value.toLowerCase()==='forward'))this.reportAttr(attr,type+'-defaults');}
  if(type==='node'&&defaultLabels.has('label')){const attr=defaultLabels.get('label')!;this.nodeDefault=decodeLabel(attr.value,attr.token);this.nodeDefaultSet=true;}
  if(type==='node'&&defaultTooltips.has('tooltip')){const attr=defaultTooltips.get('tooltip')!;this.nodeTooltipDefault=attr.value===''?undefined:decodeTooltip(attr.value,attr.token);this.nodeTooltipDefaultSet=true;if(attr.value==='')this.emptyTooltip(attr);}
  if(type==='edge'&&defaultLabels.has('label')){const attr=defaultLabels.get('label')!;this.edgeDefault=decodeLabel(attr.value,attr.token);this.edgeDefaultSet=true;}
 }
 private setGraphAttr(key:string,value:string,token:Token,escaped:boolean):void{
  if(key==='label') {this.graphTitle=decodeLabel(value,token);this.graphTitleSet=true;}
  else this.diagnostics.push(interchangeDiagnostic('DOT_ATTRIBUTE_LOSS','/source/graph/'+pointerSegment(key),'DOT graph attribute '+JSON.stringify(key)+' is retained in the original source but is not projected by the visual subset.',{severity:'warning',loss:true,range:{start:token.start,end:token.end}}));
 }
 private applyNodeAttrs(node:NativeNode,attrs:Attr[]):void{
  let lastTooltip=-1;for(const [index,attr]of attrs.entries())if(attr.key==='tooltip')lastTooltip=index;
  for(const [index,attr]of attrs.entries()){if(attr.key==='label'){node.label=decodeLabel(attr.value,attr.token);node.labelSet=true;}else if(attr.key==='tooltip'){if(index!==lastTooltip)continue;node.detail=attr.value===''?undefined:decodeTooltip(attr.value,attr.token);if(attr.value==='')this.emptyTooltip(attr);}else this.reportAttr(attr,'nodes/'+pointerSegment(node.nativeId));}
 }
 private emptyTooltip(attr:Attr):void{this.diagnostics.push(interchangeDiagnostic('DOT_TOOLTIP_EMPTY','/source/tooltip','An empty DOT tooltip falls back to the node label in Graphviz and cannot be represented as a non-empty visual detail.',{severity:'warning',loss:true,range:{start:attr.token.start,end:attr.token.end}}));}
 private addEdge(from:NativeNode,to:NativeNode,attrs:Attr[],token:Token):void{
  let label=this.edgeDefault??'';let labelSet=this.edgeDefaultSet,explicitLabel=false;
  for(const attr of attrs){this.checkDirectionAttribute(attr);if(attr.key==='label'){label=decodeLabel(attr.value,attr.token);labelSet=true;explicitLabel=true;}else if(!(attr.key==='dir'&&attr.value.toLowerCase()==='forward'))this.reportAttr(attr,'edges/'+pointerSegment(`${from.nativeId}->${to.nativeId}`));}
  const key=JSON.stringify([from.nativeId,to.nativeId]);const prior=this.strict?this.strictEdges.get(key):undefined;
  if(prior){if(explicitLabel){prior.label=label;prior.labelSet=true;}return;}
  if(this.edges.length>=MAX_EDGES)this.fail('DOT_SOURCE_SIZE','DOT source expands to more than the adapter’s 10,000-edge limit.',token);
  const edge:NativeEdge={from,to,visualId:syntheticId('edge',this.edges.length),label,labelSet,token};this.edges.push(edge);if(this.strict)this.strictEdges.set(key,edge);
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
 if(visual.kind!=='flow'||visual.form!=='network'){
  diagnostics.push(interchangeDiagnostic('DOT_UNSUPPORTED_VISUAL',VISUAL_PATH,'DOT export supports only flow/network visuals.',{severity:'error',loss:false}));return {diagnostics,identityMap};
 }
 if((visual.nodes?.length??0)>15){diagnostics.push(interchangeDiagnostic('DOT_VISUAL_SIZE',VISUAL_PATH+'/nodes','The visual exceeds the DOT profile’s 15-node bound.',{severity:'error',loss:false}));return {diagnostics,identityMap};}
 const nodes=visual.nodes??[],edges=visual.edges??[];const lines=['digraph '+quote(visual.id)+' {'];
 const checkText=(value:string,path:string)=>{const reason=unsafeTextReason(value);if(reason)diagnostics.push(interchangeDiagnostic('DOT_TEXT',path,'The value '+reason+'.',{severity:'error',loss:false}));};
 checkText(visual.id,VISUAL_PATH+'/id');if(visual.title!==undefined)checkText(visual.title,VISUAL_PATH+'/title');
 for(const [i,node]of nodes.entries()){checkText(node.id,VISUAL_PATH+'/nodes/'+i+'/id');checkText(node.label,VISUAL_PATH+'/nodes/'+i+'/label');if(node.detail!==undefined){checkText(node.detail,VISUAL_PATH+'/nodes/'+i+'/detail');if(node.detail==='')diagnostics.push(interchangeDiagnostic('DOT_TOOLTIP_EMPTY',VISUAL_PATH+'/nodes/'+i+'/detail','Graphviz treats an empty tooltip as a request to fall back to the node label.',{severity:'error',loss:false}));}}
 for(const [i,edge]of edges.entries()){checkText(edge.from,VISUAL_PATH+'/edges/'+i+'/from');checkText(edge.to,VISUAL_PATH+'/edges/'+i+'/to');if(edge.label!==undefined)checkText(edge.label,VISUAL_PATH+'/edges/'+i+'/label');}
 if(diagnostics.some(d=>d.severity==='error'))return {diagnostics,identityMap};
 if(visual.title!==undefined)lines.push('  graph [label='+quote(visual.title)+'];');
 for(const [i,node]of nodes.entries()){
  lines.push('  '+quote(node.id)+' [label='+quote(node.label)+(node.detail!==undefined?', tooltip='+quote(node.detail):'')+'];');
  identityMap.push(identityMapping('node',node.id,node.id,VISUAL_PATH+'/nodes/'+i));
  for(const key of ['role','status','emphasis','group','parent','layer','evidence'] as const)if(Object.hasOwn(node,key))lost('DOT_NODE_FIELD',VISUAL_PATH+'/nodes/'+i+'/'+key,'DOT export does not represent node '+key+'.');
 }
 const occurrences=new Map<string,number>();
 for(const [i,edge]of edges.entries()){
  const key=JSON.stringify([edge.from,edge.to]),count=(occurrences.get(key)??0)+1;occurrences.set(key,count);
  const attrs=edge.label===undefined?'':' [label='+quote(edge.label)+']';lines.push('  '+quote(edge.from)+' -> '+quote(edge.to)+attrs+';');
  identityMap.push(identityMapping('edge',`${edge.from}->${edge.to}#${count}`,edge.id,VISUAL_PATH+'/edges/'+i));
  for(const field of ['why','kind','status','emphasis','evidence'] as const)if(Object.hasOwn(edge,field))lost('DOT_EDGE_FIELD',VISUAL_PATH+'/edges/'+i+'/'+field,'DOT export does not represent edge '+field+'.');
 }
 lines.push('}');
 for(const field of ['takeaway','audience','source','omissions','groups','steps','sequence','structure','state','timeline','comparison','metric'] as const)if(Object.hasOwn(visual,field))lost('DOT_VISUAL_FIELD',VISUAL_PATH+'/'+field,'DOT export does not represent visual '+field+'.');
 return {text:lines.join('\n')+'\n',diagnostics,identityMap};
}
