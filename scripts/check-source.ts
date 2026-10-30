import {resolve,dirname,sep} from 'node:path';
import ts from 'typescript-api';
import {generate} from './generate';
export function boundaryIssues(source:string,filename='src/index.ts'):string[]{
 const parsed=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true);
 const issues:string[]=[];
 for(const statement of parsed.statements){
  if(!ts.isImportDeclaration(statement)&&!ts.isExportDeclaration(statement))continue;
  const spec=statement.moduleSpecifier;
  if(!spec||!ts.isStringLiteral(spec))continue;
  const name=spec.text;
  if(name==='@umf/core'){
   if(ts.isExportDeclaration(statement))issues.push('Do not re-export the core SDK');
   continue;
  }
  if(!name.startsWith('.')){issues.push('Forbidden external import: '+name);continue;}
  const destination=resolve(dirname(filename),name);
  if(resolve(filename).startsWith(resolve('src/extensions')+sep)&&destination.startsWith(resolve('src/adapters')+sep))issues.push('Vocabulary cannot depend on adapters');
  if(!destination.startsWith(resolve('src')+sep)&&destination!==resolve('spec/extensions/visual/package.json'))issues.push('Forbidden private import: '+name);
 }
 return issues;
}
if(import.meta.main){
 // Everything generated from the schema is current; nothing is written.
 const outputs=generate(await Bun.file('spec/extensions/visual/schema.json').json(),await Bun.file('spec/extensions/visual/package.json').json());
 const issues:string[]=[];
 for(const[path,text]of outputs)if(await Bun.file(path).text()!==text)issues.push('Out of date with the schema (run `bun run generate`): '+path);
 for await(const file of new Bun.Glob('src/**/*.ts').scan('.')){
  const source=await Bun.file(file).text();issues.push(...boundaryIssues(source,file));
  if(file.startsWith('src/adapters/miro/')){
   if(source.split('\n').length>300)issues.push(file+': adapter file exceeds 300 lines');
   const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
   const visit=(node:ts.Node)=>{
    if(ts.isFunctionDeclaration(node)||ts.isFunctionExpression(node)||ts.isArrowFunction(node)){
     const lines=tree.getLineAndCharacterOfPosition(node.end).line-tree.getLineAndCharacterOfPosition(node.getStart(tree)).line+1;
     if(lines>60)issues.push(file+': function exceeds 60 lines');
    }
    ts.forEachChild(node,visit);
   };visit(tree);
  }
 }
 if(issues.length)throw Error(issues.join('\n'));
 console.log('Generated outputs match the schema; source uses the public core boundary.');
}
