// SPDX-License-Identifier: MIT OR Apache-2.0
/** Bounded structural reader for opt-in Lini chart/table profiles. Property
 * values remain typed tokens so a form mapper must interpret every property. */
export interface LiniProfileToken {kind:'word'|'number'|'string'|'symbol';value:string;offset:number;}
export interface LiniProfileProperty {name:string;value:LiniProfileToken[];}
export interface LiniProfileNode {type:string;id:string;label?:string;properties:LiniProfileProperty[];children:LiniProfileNode[];}
export class LiniProfileSyntaxError extends Error {
 constructor(message:string,readonly offset:number){super(message+' at offset '+offset);this.name='LiniProfileSyntaxError';}
}
export function quoteLiniProfile(value:string):string {
 if(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(value)||/[\ud800-\udfff]/u.test(value))throw new LiniProfileSyntaxError('Unsupported control or unpaired surrogate',0);
 return '"'+value.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\n','\\n').replaceAll('\t','\\t')+'"';
}
export function readLiniProfile(source:string,options:{allowDeepEndpoints?:boolean}={}):LiniProfileNode[] {
 const fail=(message:string,offset:number):never=>{throw new LiniProfileSyntaxError(message,offset);};
 if(new TextEncoder().encode(source).length>262_144)fail('Source exceeds 256 KiB',0);
 const tokens:LiniProfileToken[]=[];let at=0;
 while(at<source.length){
  if(tokens.length>=100_000)fail('Token limit exceeded',at);
  const c=source[at];if(/\s/u.test(c)){at++;continue;}
  if(source.startsWith('//',at)){while(at<source.length&&source[at]!=='\n')at++;continue;}
  const offset=at;
  if(c==='"'){
   at++;let value='',closed=false;
   while(at<source.length){const ch=source[at++];if(ch==='"'){closed=true;break;}
    if(ch==='\\'){const next=source[at++];if(next==='"'||next==='\\')value+=next;else if(next==='n')value+='\n';else if(next==='t')value+='\t';else fail('Unsupported string escape',at-2);}
    else {if(ch<' '||/[\u007f-\u009f]/u.test(ch))fail('Control in string',at-1);value+=ch;}
   }
   if(!closed)fail('Unterminated string',offset);if(/[\ud800-\udfff]/u.test(value))fail('Unpaired surrogate',offset);
   tokens.push({kind:'string',value,offset});continue;
  }
  if(source.startsWith('->',at)){tokens.push({kind:'symbol',value:'->',offset});at+=2;continue;}
  const number=/^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/u.exec(source.slice(at));
  if(number){tokens.push({kind:'number',value:number[0],offset});at+=number[0].length;continue;}
  if('|#{}[]:;,().'.includes(c)||c==='-'&&!source.startsWith('--',at)){tokens.push({kind:'symbol',value:c,offset});at++;continue;}
  const word=/^(?:--)?[A-Za-z_][A-Za-z0-9_-]*/u.exec(source.slice(at));
  if(word){tokens.push({kind:'word',value:word[0],offset});at+=word[0].length;continue;}
  fail('Unsupported Lini token',at);
 }
 let cursor=0,count=0,linkCount=0;const used=new Set<string>();
 const peek=()=>tokens[cursor];
 const take=()=>{const t=tokens[cursor++];if(!t)fail('Unexpected end of source',source.length);return t;};
 const expect=(value:string)=>{const t=take();if(t.value!==value||t.kind!=='symbol')fail('Expected '+JSON.stringify(value),t.offset);};
 const word=()=>{const t=take();if(t.kind!=='word')fail('Expected name',t.offset);return t.value;};
 const nodes=(depth:number,nested:boolean):LiniProfileNode[]=>{
  if(depth>32)fail('Child depth exceeded',peek()?.offset??source.length);const result:LiniProfileNode[]=[];
  while(peek()&&!(peek().kind==='symbol'&&peek().value===']')){
   if(peek().value===';'&&peek().kind==='symbol'){take();continue;}
   if(++count>20_000)fail('Node limit exceeded',peek().offset);
   if(peek()?.kind==='word'){
    const endpoint=()=>{const first=take();if(first.kind!=='word')fail('Expected link endpoint',first.offset);let value=first.value;while(peek()?.kind==='symbol'&&peek()?.value==='.') {if(!options.allowDeepEndpoints&&value.includes('.'))fail('Deep endpoint qualification is outside this profile',peek()!.offset);take();const field=take();if(field.kind!=='word')fail('Expected qualified endpoint',field.offset);value+='.'+field.value;}return value;};
    const from=endpoint(),operator=take();if(operator.kind!=='symbol'||!['->','-'].includes(operator.value))fail('Expected a supported link operator',operator.offset);const to=endpoint(),label=peek()?.kind==='string'?take().value:undefined;
    let className:string|undefined;if(peek()?.kind==='symbol'&&peek()?.value==='.') {take();const classToken=take();if(classToken.kind!=='word')fail('Expected link class',classToken.offset);className=classToken.value;}
    const properties:LiniProfileProperty[]=[{name:'from',value:[{kind:'word',value:from,offset:operator.offset}]},{name:'operator',value:[operator]},{name:'to',value:[{kind:'word',value:to,offset:operator.offset}]}];
    if(label!==undefined)properties.push({name:'label',value:[{kind:'string',value:label,offset:operator.offset}]});
    if(className!==undefined)properties.push({name:'class',value:[{kind:'word',value:className,offset:operator.offset}]});
    result.push({type:'link',id:'__lini_link_'+linkCount++,...(label===undefined?{}:{label}),properties,children:[]});continue;
   }
   expect('|');const type=word();expect('#');const id=word();expect('|');
   if(used.has(id))fail('Duplicate native identity '+id,peek()?.offset??source.length);used.add(id);
   const label=peek()?.kind==='string'?take().value:undefined;
   const properties:LiniProfileProperty[]=[],seen=new Set<string>();
   if(peek()?.value==='{'&&peek()?.kind==='symbol'){
    take();while(peek()&&!(peek().value==='}'&&peek().kind==='symbol')){
     const name=word();if(seen.has(name))fail('Duplicate property '+name,peek()?.offset??source.length);seen.add(name);expect(':');
     const value:LiniProfileToken[]=[];let parens=0;
     while(peek()){
      const t=peek();if(t.kind==='symbol'&&t.value===';'&&parens===0)break;
      if(t.kind==='symbol'&&t.value==='(')parens++;
      if(t.kind==='symbol'&&t.value===')'){if(--parens<0)fail('Unmatched property parenthesis',t.offset);}
      if(t.kind==='symbol'&&!['(',')',',','.'].includes(t.value))fail('Unsupported property value token',t.offset);
      value.push(take());
     }
     if(!value.length)fail('Empty property',peek()?.offset??source.length);expect(';');properties.push({name,value});
    }expect('}');
   }
   let children:LiniProfileNode[]=[];if(peek()?.value==='['&&peek()?.kind==='symbol'){take();children=nodes(depth+1,true);expect(']');}
   result.push({type,id,...(label===undefined?{}:{label}),properties,children});
  }
  if(!nested&&peek())fail('Unexpected closing bracket',peek().offset);return result;
 };
 return nodes(0,false);
}
