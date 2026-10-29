import {resolve,dirname,sep} from 'node:path';
import ts from 'typescript-api';
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
  if(!destination.startsWith(resolve('src')+sep)&&destination!==resolve('spec/extensions/visual/package.json'))issues.push('Forbidden private import: '+name);
 }
 return issues;
}
if(import.meta.main){
 const manifest=await Bun.file('spec/extensions/visual/package.json').json();
 const schema=await Bun.file('spec/extensions/visual/schema.json').json();
 if(JSON.stringify(manifest.schema)!==JSON.stringify(schema))throw Error('Standalone/manifest schema drift');
 const issues:string[]=[];
 for await(const file of new Bun.Glob('src/**/*.ts').scan('.'))issues.push(...boundaryIssues(await Bun.file(file).text(),file));
 if(issues.length)throw Error(issues.join('\n'));
 console.log('Schemas agree; source uses the public core boundary.');
}
