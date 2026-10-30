// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {generate} from '../scripts/generate';
import {visualForms} from '../src';
const schema=await Bun.file('spec/extensions/visual/schema.json').json(),manifest=await Bun.file('spec/extensions/visual/package.json').json();
test('@covers US-093-AC7: the schema is the authority for the manifest schema and the TypeScript shapes',async()=>{
 // No-write check: the committed outputs are exactly what the schema generates.
 for(const[path,text]of generate(schema,manifest))expect(await Bun.file(path).text(),path).toBe(text);
 // Model mutation: a change to the schema changes both outputs, so neither can drift from it.
 const changed=structuredClone(schema);changed.$defs.status.enum.push('retired');changed.$defs.multiplicity.properties.step={type:'integer'};
 const outputs=generate(changed,manifest);
 expect(outputs.get('src/extensions/visual/generated.ts')).toContain("status:'built'|'placeholder'|'decided'|'unknown'|'retired';");
 expect(outputs.get('src/extensions/visual/generated.ts')).toContain('step?:number');
 expect(JSON.parse(outputs.get('spec/extensions/visual/package.json')!).schema).toEqual(changed);
 // The kind-to-form table is semantic, so it is checked against the schema's kinds and forms.
 expect(Object.keys(visualForms).sort()).toEqual([...schema.properties.kind.enum].sort());
 expect(Object.values(visualForms).flat().sort()).toEqual([...schema.properties.form.enum].sort());
});
