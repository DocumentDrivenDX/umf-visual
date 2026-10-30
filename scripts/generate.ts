// SPDX-License-Identifier: MIT OR Apache-2.0
// The standalone schema is the one authored definition of umf.visual's shapes. This writes what
// derives from it: the manifest's embedded schema and the TypeScript shape of every definition.
// `--check` writes nothing and fails when an output differs from what the schema generates.
const SCHEMA='spec/extensions/visual/schema.json',MANIFEST='spec/extensions/visual/package.json',TYPES='src/extensions/visual/generated.ts';
type Schema={[key:string]:any};
const json=(value:unknown)=>JSON.stringify(value,null,2)+'\n';
const literal=(value:unknown)=>typeof value==='string'?"'"+value.replace(/[\\']/g,'\\$&')+"'":JSON.stringify(value);
const key=(name:string)=>/^[A-Za-z_$][\w$]*$/.test(name)?name:literal(name);
/** The TypeScript type a schema node admits. Validation-only keywords (lengths, patterns, bounds) have no type. */
export function typeOf(schema:Schema):string{
 if(schema.$ref)return `VisualDefs[${literal(schema.$ref.split('/').at(-1))}]`;
 if(schema.const!==undefined)return literal(schema.const);
 if(schema.enum)return schema.enum.map(literal).join('|');
 if(schema.oneOf)return schema.oneOf.map((option:Schema)=>typeOf(option)).join('|');
 const types:string[]=Array.isArray(schema.type)?schema.type:[schema.type];
 return types.map(type=>{
  if(type==='string')return 'string';
  if(type==='integer'||type==='number')return 'number';
  if(type==='boolean')return 'boolean';
  if(type==='array'){const item=typeOf(schema.items??{});return /[|]/.test(item)?`(${item})[]`:`${item}[]`;}
  if(type==='object'){
   const required=new Set<string>(schema.required??[]);
   const fields=Object.entries(schema.properties??{}).map(([name,child])=>`${key(name)}${required.has(name)?'':'?'}:${typeOf(child as Schema)}`);
   return fields.length?`{${fields.join(';')}}`:'{[key:string]:unknown}';
  }
  throw Error('Unsupported schema type '+JSON.stringify(type));
 }).join('|');
}
export function generate(schema:Schema,manifest:Schema):Map<string,string>{
 const defs=Object.entries(schema.$defs as Record<string,Schema>).map(([name,def])=>` ${key(name)}:${typeOf(def)};`);
 const {$defs:_,$schema:__,$id:___,title:____,...root}=schema;
 const types=[
  '// SPDX-License-Identifier: MIT OR Apache-2.0',
  `// Generated from ${SCHEMA} by scripts/generate.ts; edit the schema, then run \`bun run generate\`.`,
  '/** The shape of each schema definition, by name. */',
  'export interface VisualDefs {',...defs,'}',
  '/** The shape of a umf.visual payload. Semantic rules (references, forms, dates) are checked at validation. */',
  `export type VisualShape=${typeOf(root)};`,''
 ].join('\n');
 return new Map([[MANIFEST,json({...manifest,schema})],[TYPES,types]]);
}
if(import.meta.main){
 const check=process.argv.includes('--check');
 const outputs=generate(await Bun.file(SCHEMA).json(),await Bun.file(MANIFEST).json());
 const stale:string[]=[];
 for(const[path,text]of outputs){
  if((await Bun.file(path).exists()?await Bun.file(path).text():undefined)===text)continue;
  if(check)stale.push(path);else await Bun.write(path,text);
 }
 if(stale.length)throw Error('Generated from the schema but out of date (run `bun run generate`): '+stale.join(', '));
 console.log(check?'Generated outputs match the schema.':'Generated the manifest schema and TypeScript shapes from the schema.');
}
