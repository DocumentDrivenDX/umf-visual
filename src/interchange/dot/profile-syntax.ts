// SPDX-License-Identifier: MIT OR Apache-2.0
/** Portable syntax reader for the explicit UMF DOT profiles. It deliberately
 * accepts a bounded statement subset, rather than skipping unknown syntax. */
export interface DotProfileAttribute {name:string;value:string;html?:boolean;}
export type DotProfileStatement =
 | {kind:'attributes';target:'graph'|'node'|'edge';attributes:DotProfileAttribute[]}
 | {kind:'assignment';name:string;value:string}
 | {kind:'node';id:string;attributes:DotProfileAttribute[]}
 | {kind:'edge';from:string;fromPort?:string;to:string;toPort?:string;attributes:DotProfileAttribute[]}
 | {kind:'subgraph';id:string;statements:DotProfileStatement[]};
export interface DotProfileGraph {id:string;statements:DotProfileStatement[];}
interface Token {kind:'word'|'string'|'html'|'symbol'|'end';value:string;at:number;}
export class DotProfileSyntaxError extends Error {
 constructor(message:string,readonly offset:number){super(message+' at offset '+offset);this.name='DotProfileSyntaxError';}
}
export function quoteDotProfile(value:string):string {
 if(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u.test(value)||/[\ud800-\udfff]/u.test(value))throw new DotProfileSyntaxError('Unsupported control or unpaired surrogate',0);
 return '"'+value.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\n','\\n')+'"';
}
export interface DotProfileReadOptions {entities?:boolean;}
export function readDotProfile(source:string,options:DotProfileReadOptions={}):DotProfileGraph {
 if(typeof source!=='string'||new TextEncoder().encode(source).length>262_144)throw new DotProfileSyntaxError('Source exceeds 256 KiB',0);
 let at=0;const tokens:Token[]=[];
 const fail=(message:string,offset=at):never=>{throw new DotProfileSyntaxError(message,offset);};
 while(at<source.length){
  if(tokens.length>=100_000)fail('Token limit exceeded');
  const c=source[at];if(/[ \t\r\n]/u.test(c)){at++;continue;}
  if(source.startsWith('//',at)||c==='#'){while(at<source.length&&source[at]!=='\n')at++;continue;}
  if(source.startsWith('/*',at)){const end=source.indexOf('*/',at+2);if(end<0)fail('Unterminated comment');at=end+2;continue;}
  const start=at;
  if(c==='"'){
   at++;let value='',closed=false;
   while(at<source.length){const ch=source[at++];if(ch==='"'){closed=true;break;}
    if(ch==='\\'){if(at>=source.length)fail('Unterminated string escape');const next=source[at++];
     if(next==='"'||next==='\\')value+=next;else if(next==='n')value+='\n';else fail('Unsupported DOT string escape',at-2);
    }else{if(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u.test(ch))fail('Control in string',at-1);value+=ch;}
   }
   if(!closed)fail('Unterminated quoted string',start);
   if(/[\ud800-\udfff]/u.test(value))fail('Unpaired surrogate',start);
   tokens.push({kind:'string',value,at:start});continue;
  }
  if(options.entities&&c==='<'){
   let depth=0,quote='';at++;
   while(at<source.length){const ch=source[at++];if(quote){if(ch===quote)quote='';continue;}if(ch==='"'||ch==="'"){quote=ch;continue;}if(ch==='<')depth++;else if(ch==='>'){if(depth===0)break;depth--;}}
   if(source[at-1]!=='>'||depth!==0||quote)fail('Unterminated HTML label',start);
   tokens.push({kind:'html',value:source.slice(start,at),at:start});continue;
  }
  if(source.startsWith('->',at)){tokens.push({kind:'symbol',value:'->',at});at+=2;continue;}
  if('{}[]=;,:'.includes(c)){tokens.push({kind:'symbol',value:c,at});at++;continue;}
  const match=/^(?:[A-Za-z_\u0080-\u00ff][A-Za-z_0-9\u0080-\u00ff]*|-?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?))/u.exec(source.slice(at));
  if(!match)throw new DotProfileSyntaxError('Unsupported DOT token',at);tokens.push({kind:'word',value:match[0],at});at+=match[0].length;
 }
 tokens.push({kind:'end',value:'',at});let cursor=0,statementCount=0;
 const peek=()=>tokens[cursor];
 const take=()=>tokens[cursor++];
 const symbol=(value:string)=>peek().kind==='symbol'&&peek().value===value;
 const expect=(value:string)=>{const token=take();if(token.value!==value||token.kind!==(value==='digraph'?'word':'symbol'))fail('Expected '+JSON.stringify(value),token.at);return token;};
 const id=()=>{const token=take();if(token.kind!=='word'&&token.kind!=='string'||token.kind==='word'&&['strict','graph','digraph','node','edge','subgraph'].includes(token.value.toLowerCase()))fail('Expected non-keyword identifier',token.at);return token.value;};
 const attrs=():DotProfileAttribute[]=>{
  const result:DotProfileAttribute[]=[],seen=new Set<string>();
  while(symbol('[')){take();while(!symbol(']')){
   const name=id();if(seen.has(name))fail('Duplicate attribute '+name,peek().at);seen.add(name);expect('=');const token=take();if(token.kind!=='word'&&token.kind!=='string'&&!(options.entities&&token.kind==='html'))fail('Expected attribute value',token.at);result.push({name,value:token.value,...(token.kind==='html'?{html:true}:{})});
   if(symbol(',')||symbol(';'))take();else if(peek().kind==='end')fail('Unterminated attributes');
  }expect(']');}return result;
 };
 const statements=(depth:number):DotProfileStatement[]=>{
  if(depth>32)fail('Subgraph depth exceeded',peek().at);const result:DotProfileStatement[]=[];
  while(!symbol('}')){
   if(peek().kind==='end')fail('Unterminated graph',peek().at);
   if(symbol(';')){take();continue;}if(++statementCount>20_000)fail('Statement limit exceeded',peek().at);
   if(peek().kind==='word'&&peek().value==='subgraph'){take();const name=id();expect('{');result.push({kind:'subgraph',id:name,statements:statements(depth+1)});expect('}');continue;}
   const first=take();if(first.kind!=='word'&&first.kind!=='string')fail('Expected statement',first.at);
   if(symbol('=')){take();result.push({kind:'assignment',name:first.value,value:id()});}
   else if(first.kind==='word'&&['graph','node','edge'].includes(first.value)){
    if(!symbol('['))fail('Expected attribute list',peek().at);result.push({kind:'attributes',target:first.value as 'graph'|'node'|'edge',attributes:attrs()});
   }else if(symbol('->')||options.entities&&symbol(':')){const endpoint=(initial:string)=>{let value=initial,port:string|undefined;if(symbol(':')){if(!options.entities)fail('Ports require entities profile option',peek().at);take();port=id();}return{value,port};};const from=endpoint(first.value);expect('->');const to=endpoint(id());result.push({kind:'edge',from:from.value,...(from.port?{fromPort:from.port}:{}),to:to.value,...(to.port?{toPort:to.port}:{}),attributes:attrs()});}
   else result.push({kind:'node',id:first.value,attributes:attrs()});
   if(symbol(';'))take();
  }return result;
 };
 expect('digraph');const graphId=id();expect('{');const result={id:graphId,statements:statements(0)};expect('}');if(peek().kind!=='end')fail('Trailing source',peek().at);return result;
}
